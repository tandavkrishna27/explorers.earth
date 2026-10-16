import {
  clearMusicCredential,
  getMusicCredential,
  setMusicCredential,
  type MusicCredential,
} from "./musicCredentialStore";

export type LocalMusicMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface LocalMusicRequest {
  method: LocalMusicMethod;
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export type MusicClientErrorCode = "AUTH_REQUIRED" | "AUTH_UNAVAILABLE" | "SERVICE_UNAVAILABLE" | "REQUEST_INVALID";

export class MusicClientError extends Error {
  constructor(
    readonly code: MusicClientErrorCode,
    readonly status: number,
    message: string,
    readonly retryAfterSeconds?: number,
    readonly upstreamCode?: string,
    readonly retryable = false,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "MusicClientError";
  }
}

export interface LocalTunesApiClientDependencies {
  baseUrl: string;
  /** Music-origin transport. Rejects a relative path, so the canonical route cannot use it. */
  fetchImpl?: typeof fetch;
  /**
   * Same-origin transport for the canonical session route (ADR-006). Separate from
   * fetchImpl because the two have different origins and different authority: this one
   * carries the session cookie and no bearer. Defaults to the ambient fetch, resolved
   * at call time so a test may stub the global.
   */
  sessionFetchImpl?: typeof fetch;
  now?: () => number;
  refreshWindowMs?: number;
  delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export interface LocalTunesApiClient {
  setAuthority(subject: string | undefined): void;
  ensureIdentity(): Promise<void>;
  refreshIdentity(): Promise<void>;
  request(input: LocalMusicRequest): Promise<Response>;
  logout(): void;
}

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
// ADR-006: Music owner provisioning is reached through this canonical route, which
// consumes requireActor and the canonical session cookie. There is no Strapi proof,
// no bearer, and no client-supplied account identifier - the subject is the Actor.
const CANONICAL_MUSIC_ENSURE = "/api/explorers/v1/music/identity/ensure";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
type MusicIdentityErrorAction = "authenticate" | "complete_onboarding" | "contact_support" | "retry" | "none";
interface MusicIdentityErrorPolicy {
  status: number;
  code: string;
  action: MusicIdentityErrorAction;
  retryable: boolean;
}
const MUSIC_IDENTITY_ERROR_POLICY: readonly MusicIdentityErrorPolicy[] = Object.freeze([
  { status: 400, code: "REQUEST_INVALID", action: "none", retryable: false },
  { status: 401, code: "AUTH_REQUIRED", action: "authenticate", retryable: false },
  { status: 401, code: "AUTH_INVALID", action: "authenticate", retryable: false },
  { status: 403, code: "IDENTITY_INELIGIBLE", action: "complete_onboarding", retryable: false },
  { status: 403, code: "IDENTITY_SUSPENDED", action: "contact_support", retryable: false },
  { status: 409, code: "ONBOARDING_INCOMPLETE", action: "complete_onboarding", retryable: false },
  { status: 409, code: "ACCOUNT_AMBIGUOUS", action: "contact_support", retryable: false },
  { status: 409, code: "ACCOUNT_SWITCH_CONFLICT", action: "contact_support", retryable: false },
  { status: 409, code: "IDENTITY_CONFLICT", action: "contact_support", retryable: false },
  { status: 409, code: "IDENTITY_TOMBSTONED", action: "contact_support", retryable: false },
  { status: 409, code: "IDENTITY_PENDING_DELETION", action: "contact_support", retryable: false },
  { status: 429, code: "RATE_LIMITED", action: "retry", retryable: true },
  { status: 500, code: "INTERNAL_ERROR", action: "retry", retryable: true },
  { status: 502, code: "UPSTREAM_MALFORMED", action: "retry", retryable: true },
  { status: 503, code: "UPSTREAM_UNAVAILABLE", action: "retry", retryable: true },
  { status: 503, code: "DATABASE_UNAVAILABLE", action: "retry", retryable: true },
  { status: 503, code: "ENTRY_DISABLED", action: "retry", retryable: true },
]);
const AUTHORITY_ABORT = Object.freeze({ kind: "authority" });
const DEADLINE_ABORT = Object.freeze({ kind: "deadline" });
export const MUSIC_IDENTITY_RELIABILITY_CONTRACT = Object.freeze({
  refreshWindowMs: 60_000,
  maxAttempts: 3,
  defaultRetryAfterMs: 1_000,
  maxRetryAfterMs: 1_000,
  deadlineMs: 4_500,
});

export function createLocalTunesApiClient(dependencies: LocalTunesApiClientDependencies): LocalTunesApiClient {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  // Late-bound so a stubbed global fetch is honoured per call.
  const sessionFetch: typeof fetch = (input, init) => (dependencies.sessionFetchImpl ?? fetch)(input, init);
  const now = dependencies.now ?? Date.now;
  const refreshWindowMs = dependencies.refreshWindowMs ?? MUSIC_IDENTITY_RELIABILITY_CONTRACT.refreshWindowMs;
  const delay = dependencies.delay ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const baseUrl = normalizedBaseUrl(dependencies.baseUrl);
  let authoritySubject: string | undefined;
  let authorityGeneration = 0;
  let refreshFlight: { generation: number; subject: string | undefined; controller: AbortController; promise: Promise<MusicCredential> } | undefined;
  const requestControllers = new Map<AbortController, number>();

  const authorityStillCurrent = (generation: number, subject: string | undefined) =>
    generation === authorityGeneration && subject === authoritySubject;

  const staleAuthority = () => new MusicClientError("AUTH_REQUIRED", 401, "Music authorization is required.");

  function advanceAuthority(subject: string | undefined, force = false): void {
    if (!force && subject === authoritySubject) return;
    authoritySubject = subject;
    authorityGeneration += 1;
    refreshFlight?.controller.abort(AUTHORITY_ABORT);
    refreshFlight = undefined;
    for (const controller of requestControllers.keys()) controller.abort(AUTHORITY_ABORT);
    requestControllers.clear();
    clearMusicCredential();
  }

  async function refresh(): Promise<MusicCredential> {
    const generation = authorityGeneration;
    const subject = authoritySubject;
    if (refreshFlight && refreshFlight.generation === generation && refreshFlight.subject === subject) return refreshFlight.promise;
    const controller = new AbortController();
    let lastError: MusicClientError | undefined;
    const deadline = setTimeout(() => controller.abort(DEADLINE_ABORT), MUSIC_IDENTITY_RELIABILITY_CONTRACT.deadlineMs);
    const flight = (async () => {
      try {
        for (let attempt = 1; ; attempt += 1) {
          const response = await abortable(Promise.resolve(sessionFetch(CANONICAL_MUSIC_ENSURE, {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          })), controller.signal);
          if (response.status !== 200) {
            const error = await containedEnsureError(response, controller.signal);
            lastError = error;
            if (!error.retryable || attempt === MUSIC_IDENTITY_RELIABILITY_CONTRACT.maxAttempts) throw error;
            await abortable(delay(Math.min(
              (error.retryAfterSeconds ?? MUSIC_IDENTITY_RELIABILITY_CONTRACT.defaultRetryAfterMs / 1_000) * 1_000,
              MUSIC_IDENTITY_RELIABILITY_CONTRACT.maxRetryAfterMs,
            ), controller.signal), controller.signal);
            continue;
          }
          const body = await abortable(Promise.resolve(response.json()), controller.signal) as {
            credential?: { token?: unknown; expiresAt?: unknown };
          };
          const credential = body.credential;
          if (!credential || typeof credential.token !== "string"
              || typeof credential.expiresAt !== "number"
              || !Number.isSafeInteger(credential.expiresAt)
              || credential.expiresAt <= now()) throw new Error("credential malformed");
          const result = { token: credential.token, expiresAt: credential.expiresAt };
          setMusicCredential(result);
          return result;
        }
      } catch (cause) {
        if (authorityStillCurrent(generation, subject)) clearMusicCredential();
        if (!authorityStillCurrent(generation, subject) || controller.signal.reason === AUTHORITY_ABORT) throw staleAuthority();
        if (controller.signal.reason === DEADLINE_ABORT) {
          throw new MusicClientError(
            "AUTH_UNAVAILABLE",
            503,
            "Music authorization is temporarily unavailable.",
            lastError?.retryAfterSeconds,
            lastError?.upstreamCode,
            false,
            lastError?.requestId,
          );
        }
        if (cause instanceof MusicClientError) throw cause;
        throw new MusicClientError("AUTH_UNAVAILABLE", 503, "Music authorization is temporarily unavailable.", 1);
      } finally {
        clearTimeout(deadline);
      }
    })();
    refreshFlight = { generation, subject, controller, promise: flight };
    try {
      return await flight;
    } finally {
      if (refreshFlight?.promise === flight) refreshFlight = undefined;
    }
  }

  async function credential(): Promise<MusicCredential> {
    const timestamp = now();
    const current = getMusicCredential(timestamp);
    if (current && current.expiresAt - timestamp > refreshWindowMs) return current;
    if (current) clearMusicCredential();
    return refresh();
  }

  async function send(input: LocalMusicRequest, active: MusicCredential): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${active.token}` };
    if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey;
    let body: string | undefined;
    if (input.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(input.body);
    }
    const generation = authorityGeneration;
    const subject = authoritySubject;
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(input.signal?.reason);
    if (input.signal?.aborted) { abortFromCaller(); throw staleAuthority(); }
    else input.signal?.addEventListener("abort", abortFromCaller, { once: true });
    requestControllers.set(controller, generation);
    try {
      const response = await fetchImpl(`${baseUrl}${input.path}`, {
        method: input.method,
        headers,
        body,
        signal: controller.signal,
        cache: "no-store",
      });
      if (!authorityStillCurrent(generation, subject) || controller.signal.aborted) throw staleAuthority();
      return response;
    } catch {
      if (!authorityStillCurrent(generation, subject) || controller.signal.aborted) throw staleAuthority();
      throw new MusicClientError("SERVICE_UNAVAILABLE", 503, "Music is temporarily unavailable.", 1);
    } finally {
      input.signal?.removeEventListener("abort", abortFromCaller);
      requestControllers.delete(controller);
    }
  }

  async function request(input: LocalMusicRequest): Promise<Response> {
    validateRequest(input);
    const initial = await credential();
    const first = await send(input, initial);
    const firstUpstreamCode = first.status === 401 ? await responseErrorCode(first) : undefined;
    if (first.status !== 401 || !["TOKEN_EXPIRED", "TOKEN_INVALID", "TOKEN_REVOKED"].includes(firstUpstreamCode ?? "")) return first;
    clearMusicCredential();
    const safeReplay = input.method === "GET" || input.method === "HEAD"
      || (input.idempotencyKey !== undefined && IDEMPOTENCY_PATTERN.test(input.idempotencyKey));
    if (!safeReplay) {
      throw new MusicClientError("AUTH_REQUIRED", 401, "Music authorization expired; retry the action explicitly.", undefined, firstUpstreamCode);
    }
    const renewed = await refresh();
    const second = await send(input, renewed);
    if (second.status === 401) {
      const upstreamCode = await responseErrorCode(second);
      clearMusicCredential();
      throw new MusicClientError("AUTH_REQUIRED", 401, "Music authorization is required.", undefined, upstreamCode);
    }
    return second;
  }

  return {
    setAuthority: (subject) => advanceAuthority(subject),
    ensureIdentity: async () => { await credential(); },
    refreshIdentity: async () => {
      clearMusicCredential();
      await refresh();
    },
    request,
    logout: () => advanceAuthority(undefined, true),
  };
}

async function containedEnsureError(response: Response, signal: AbortSignal): Promise<MusicClientError> {
  const requestIdHeader = response.headers.get("x-request-id");
  const requestId = requestIdHeader && REQUEST_ID_PATTERN.test(requestIdHeader) ? requestIdHeader : undefined;
  const refused = response.status === 401 || response.status === 403 || response.status === 404;
  const invalid = response.status === 400 || response.status === 409;
  const code: MusicClientErrorCode = refused ? "AUTH_REQUIRED" : invalid ? "REQUEST_INVALID" : "AUTH_UNAVAILABLE";
  const message = refused
    ? "Music authorization is required."
    : invalid
      ? "Music owner provisioning was refused."
      : "Music authorization is temporarily unavailable.";
  const fallback = () => new MusicClientError(code, response.status, message, undefined, undefined, false, requestId);
  try {
    const body = await abortable(Promise.resolve(response.json()), signal) as unknown;
    const validated = validateEnsureErrorEnvelope(body, response.status, requestId);
    if (!validated) return fallback();
    const retryAfterHeader = response.headers.get("retry-after");
    if ((response.status === 429 || response.status === 503) && !retryAfterHeader) return fallback();
    if (retryAfterHeader && !/^[1-9][0-9]*$/.test(retryAfterHeader)) return fallback();
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    return new MusicClientError(
      code,
      response.status,
      message,
      retryAfterSeconds,
      validated.code,
      // A refusal or a conflict is settled: the server does not get to ask for a retry
      // of a decision about who the owner is.
      refused || invalid ? false : validated.retryable,
      requestId,
    );
  } catch (cause) {
    if (signal.aborted) throw cause;
    return fallback();
  }
}

function validateEnsureErrorEnvelope(
  value: unknown,
  status: number,
  requestId: string | undefined,
): Pick<MusicIdentityErrorPolicy, "code" | "retryable"> | undefined {
  if (!value || typeof value !== "object" || !hasExactKeys(value, ["version", "error"])) return undefined;
  const envelope = value as { version?: unknown; error?: unknown };
  if (envelope.version !== "music-error/v1" || !envelope.error || typeof envelope.error !== "object"
      || !hasExactKeys(envelope.error, ["code", "message", "action", "retryable", "requestId"])) return undefined;
  const error = envelope.error as Record<string, unknown>;
  const policy = typeof error.code === "string"
    ? MUSIC_IDENTITY_ERROR_POLICY.find((candidate) => candidate.status === status && candidate.code === error.code)
    : undefined;
  if (!policy || typeof error.message !== "string" || error.message.length < 1 || error.message.length > 160
      || error.action !== policy.action || error.retryable !== policy.retryable
      || typeof error.requestId !== "string" || error.requestId !== requestId) return undefined;
  return { code: policy.code, retryable: policy.retryable };
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function validateRequest(input: LocalMusicRequest): void {
  if (!input.path.startsWith("/") || input.path.startsWith("//")
      || !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(input.method)
      || (input.idempotencyKey !== undefined && !IDEMPOTENCY_PATTERN.test(input.idempotencyKey))) {
    throw new MusicClientError("REQUEST_INVALID", 400, "The Music request is invalid.");
  }
}

async function responseErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = await response.clone().json() as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : undefined;
  } catch {
    return undefined;
  }
}

function normalizedBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new MusicClientError("REQUEST_INVALID", 400, "The Music service origin is invalid.");
  }
  if ((parsed.protocol !== "https:" && !isSameOriginLocalFixture(parsed)) || parsed.username || parsed.password
      || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new MusicClientError("REQUEST_INVALID", 400, "The Music service origin is invalid.");
  }
  return parsed.origin;
}

function isSameOriginLocalFixture(parsed: URL): boolean {
  const browserLocation = typeof globalThis.location === "undefined" ? undefined : globalThis.location;
  return parsed.protocol === "http:"
    && parsed.hostname === "localhost"
    && parsed.port === "55173"
    && browserLocation?.protocol === "http:"
    && browserLocation.hostname === "localhost"
    && browserLocation.port === "55173"
    && parsed.origin === browserLocation.origin;
}
