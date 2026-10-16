import { createMusicDevelopmentFetch } from "../features/music/musicDevelopmentTransport";
import useAuthStore from "../store/store";

export interface CanonicalAccountLifecycleDto {
  accountId: string;
  status: "active" | "suspended" | "pending_deletion" | "deleted";
  operationId: string | null;
  revision: number;
}

/** The canonical route derives identity from the Better Auth cookie, never request JSON. */
export function createCanonicalAccountLifecycleService(input: { fetchImpl?: typeof fetch; isCurrent: () => boolean }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const assertCurrent = () => {
    if (!input.isCurrent()) throw new AccountLifecycleError("AUTH_CHANGED", 401, "The signed-in account changed.", false);
  };
  const request = async <T>(path: string, method: "GET" | "POST", body?: unknown, idempotencyKey?: string): Promise<T> => {
    assertCurrent();
    const generation = useAuthStore.getState().generation;
    let response: Response;
    try {
      response = await fetchImpl(`/api/explorers/v1/account/${path}`, { method, credentials: "include", cache: "no-store",
        headers: method === "POST" ? { "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) } : undefined,
        body: method === "POST" ? JSON.stringify(body) : undefined });
    } catch {
      assertCurrent();
      throw new AccountLifecycleError("SERVICE_UNAVAILABLE", 503, "Account service is unavailable.", true);
    }
    const result = await response.json().catch(() => null);
    assertCurrent();
    if (response.status === 401 && useAuthStore.getState().generation === generation) useAuthStore.getState().logout();
    if (!response.ok) throw new AccountLifecycleError(result?.error?.code ?? "SERVICE_UNAVAILABLE", response.status,
      result?.error?.message ?? "Account service is unavailable.", response.status >= 500 || response.status === 409);
    return result as T;
  };
  return {
    status: async () => (await request<{ lifecycle: CanonicalAccountLifecycleDto }>("lifecycle", "GET")).lifecycle,
    recordDeletionFeedback: async (reason: string, key: string) =>
      (await request<{ feedback: { id: string } }>("deletion-feedback", "POST", { reason: reason.trim() }, key)).feedback,
    deactivate: async (expectedRevision: number, key: string) =>
      (await request<{ lifecycle: CanonicalAccountLifecycleDto }>("deactivation", "POST", { expectedRevision }, key)).lifecycle,
    deleteAccount: async (expectedRevision: number, feedbackId: string, key: string) =>
      (await request<{ lifecycle: CanonicalAccountLifecycleDto }>("deletion", "POST", { expectedRevision, feedbackId }, key)).lifecycle,
  };
}

export interface AccountLifecycleStatus {
  version: "music-lifecycle/v1";
  operation: {
    operationId: string;
    status: "pending_deletion" | "suspended" | "tombstoned" | "not_present";
    phase: "prepared" | "finalized";
    state: "completed" | "requested" | "running" | "failed" | "cancelled";
    boundaryCrossed: boolean;
    retryable: boolean;
    deadLetter: boolean;
    upstreamUserDocumentId: string;
    upstreamAccountDocumentId: string;
  };
}

export interface AccountSuspensionStatus {
  version: "music-lifecycle/v1";
  identity: { status: "active" | "suspended" | "not_present" };
}

export class AccountLifecycleError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly retryable: boolean,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "AccountLifecycleError";
  }
}

export function createAccountLifecycleService(input: {
  baseUrl: string;
  getBearer: () => string | undefined;
  fetchImpl?: typeof fetch;
}) {
  const origin = normalizeOrigin(input.baseUrl);
  const fetchImpl = input.fetchImpl ?? createMusicDevelopmentFetch(fetch, import.meta.env.DEV, origin);

  const request = async <T>(
    method: "GET" | "POST",
    action: "prepare" | "status" | "boundary" | "cancel" | "suspend" | "resume",
    parse: (body: unknown) => T,
  ) => {
    const bearer = input.getBearer();
    if (!bearer || !/^[A-Za-z0-9._~-]{16,4096}$/.test(bearer)) {
      throw new AccountLifecycleError("AUTH_REQUIRED", 401, "Sign in again to continue account deletion.", false);
    }
    let response: Response;
    try {
      response = await fetchImpl(`${origin}/api/music/identity/lifecycle/${action}`, {
        method,
        headers: { Authorization: `Bearer ${bearer}` },
      });
    } catch {
      throw new AccountLifecycleError("SERVICE_UNAVAILABLE", 503, "Account deletion is temporarily unavailable.", true);
    }
    const body = await response.json().catch(() => undefined) as unknown;
    if (!response.ok) {
      const errorBody = isRecord(body) && isRecord(body.error) ? body.error : undefined;
      throw new AccountLifecycleError(
        typeof errorBody?.code === "string" ? errorBody.code : "SERVICE_UNAVAILABLE",
        response.status,
        typeof errorBody?.message === "string" ? errorBody.message : "Account deletion is temporarily unavailable.",
        errorBody?.retryable === true,
        typeof errorBody?.requestId === "string" ? errorBody.requestId : response.headers.get("x-request-id") ?? undefined,
      );
    }
    return parse(body);
  };

  const prepare = () => request("POST", "prepare", parseLifecycleStatus);
  const status = () => request("GET", "status", parseLifecycleStatus);
  const markBoundary = () => request("POST", "boundary", parseLifecycleStatus);
  const cancel = () => request("POST", "cancel", parseLifecycleStatus);
  const suspend = () => request("POST", "suspend", parseSuspensionStatus);
  const resume = () => request("POST", "resume", parseReactivationStatus);
  const requireDeletableOperation = (result: AccountLifecycleStatus, boundaryRequired = false) => {
    if (result.operation.status !== "pending_deletion"
        || result.operation.phase !== "prepared"
        || result.operation.deadLetter
        || result.operation.state === "cancelled") {
      throw new AccountLifecycleError(
        "LIFECYCLE_TERMINAL", 409,
        "Account deletion is complete or requires manual review.", false,
      );
    }
    if (boundaryRequired && result.operation.boundaryCrossed !== true) {
      throw new AccountLifecycleError(
        "LIFECYCLE_RESPONSE_INVALID", 409,
        "Music did not acknowledge the irreversible account-deletion boundary. Try again.", true,
      );
    }
  };
  const deleteAccount = async (dependencies: {
    readAccountPresence: (expectedAccountDocumentId: string) => Promise<
      { status: "present"; accountDocumentId: string }
      | { status: "absent" | "unknown" }
    >;
    deleteExplorerAccount: (accountDocumentId: string) => Promise<string | null>;
    deleteExplorerUser: () => Promise<string | null>;
    clearAuth: () => void;
  }) => {
    const prepared = await prepare();
    requireDeletableOperation(prepared);
    const boundary = await markBoundary();
    requireDeletableOperation(boundary, true);
    if (prepared.operation.operationId !== boundary.operation.operationId
        || prepared.operation.upstreamUserDocumentId !== boundary.operation.upstreamUserDocumentId
        || prepared.operation.upstreamAccountDocumentId !== boundary.operation.upstreamAccountDocumentId) {
      throw new AccountLifecycleError(
        "LIFECYCLE_IDENTITY_CONFLICT", 409,
        "Account deletion identity changed unexpectedly. Contact support.", false,
      );
    }
    const presence = await dependencies.readAccountPresence(boundary.operation.upstreamAccountDocumentId);
    if (presence.status === "unknown") {
      throw new AccountLifecycleError(
        "UPSTREAM_ACCOUNT_UNKNOWN",
        503,
        "The Explorer Account state could not be verified. Try again without signing out.",
        true,
      );
    }
    if (presence.status === "present") {
      const deletedDocumentId = await dependencies.deleteExplorerAccount(presence.accountDocumentId);
      if (deletedDocumentId !== presence.accountDocumentId) {
        throw new AccountLifecycleError(
          "UPSTREAM_ACCOUNT_DELETE_UNCONFIRMED",
          503,
          "Explorer Account deletion was not confirmed. Try again without signing out.",
          true,
        );
      }
    }
    const deletedUserDocumentId = await dependencies.deleteExplorerUser();
    if (deletedUserDocumentId !== boundary.operation.upstreamUserDocumentId) {
      throw new AccountLifecycleError(
        "UPSTREAM_USER_DELETE_UNCONFIRMED",
        503,
        "Explorer user deletion was not confirmed. Try again without signing out.",
        true,
      );
    }
    dependencies.clearAuth();
  };
  return { prepare, status, markBoundary, cancel, suspend, resume, deleteAccount };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 512 && value.trim() === value;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function parseLifecycleStatus(value: unknown): AccountLifecycleStatus {
  const operation = isRecord(value) && isRecord(value.operation) ? value.operation : undefined;
  const status = operation?.status;
  const phase = operation?.phase;
  const state = operation?.state;
  const commonValid = isRecord(value)
    && hasExactKeys(value, ["version", "operation"])
    && value.version === "music-lifecycle/v1"
    && operation !== undefined
    && hasExactKeys(operation, [
      "operationId", "status", "phase", "state", "boundaryCrossed", "retryable", "deadLetter",
      "upstreamUserDocumentId", "upstreamAccountDocumentId",
    ])
    && isIdentifier(operation.operationId)
    && isIdentifier(operation.upstreamUserDocumentId)
    && isIdentifier(operation.upstreamAccountDocumentId)
    && typeof operation.boundaryCrossed === "boolean"
    && typeof operation.retryable === "boolean"
    && typeof operation.deadLetter === "boolean";
  const combinationValid = status === "pending_deletion"
    ? phase === "prepared" && (operation?.boundaryCrossed === false
      ? state === "completed" && operation.retryable === false && operation.deadLetter === false
      : operation?.deadLetter === true
        ? state === "failed" && operation.retryable === false
        : ["requested", "running"].includes(String(state)) && operation?.retryable === true)
    : status === "suspended"
      ? phase === "prepared" && ["completed", "cancelled"].includes(String(state))
        && operation?.boundaryCrossed === false && operation.retryable === false && operation.deadLetter === false
      : status === "tombstoned"
        ? phase === "finalized" && state === "completed" && operation?.boundaryCrossed === true
          && operation.retryable === false && operation.deadLetter === false
        : status === "not_present"
          ? phase === "prepared" && state === "cancelled" && operation?.boundaryCrossed === false
            && operation.retryable === false && operation.deadLetter === false
          : false;
  if (!commonValid || !combinationValid) {
    throw new AccountLifecycleError(
      "LIFECYCLE_RESPONSE_INVALID", 502,
      "Music returned an invalid account lifecycle response. Try again.", true,
    );
  }
  return value as unknown as AccountLifecycleStatus;
}

function parseSuspensionStatus(value: unknown): AccountSuspensionStatus {
  if (!isRecord(value) || !hasExactKeys(value, ["version", "identity"])
      || value.version !== "music-lifecycle/v1" || !isRecord(value.identity)
      || !hasExactKeys(value.identity, ["status"])
      || !["suspended", "not_present"].includes(String(value.identity.status))) {
    throw new AccountLifecycleError(
      "LIFECYCLE_RESPONSE_INVALID", 502,
      "Music returned an invalid account suspension response. Try again.", true,
    );
  }
  return value as unknown as AccountSuspensionStatus;
}

function parseReactivationStatus(value: unknown): AccountSuspensionStatus {
  if (!isRecord(value) || !hasExactKeys(value, ["version", "identity"])
      || value.version !== "music-lifecycle/v1" || !isRecord(value.identity)
      || !hasExactKeys(value.identity, ["status"])
      || !["active", "not_present"].includes(String(value.identity.status))) {
    throw new AccountLifecycleError(
      "LIFECYCLE_RESPONSE_INVALID", 502,
      "Music returned an invalid account reactivation response. Try again.", true,
    );
  }
  return value as unknown as AccountSuspensionStatus;
}

function normalizeOrigin(raw: string): string {
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { throw new AccountLifecycleError("REQUEST_INVALID", 400, "The Music service origin is invalid.", false); }
  if ((parsed.protocol !== "https:" && !isSameOriginLocalFixture(parsed))
      || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new AccountLifecycleError("REQUEST_INVALID", 400, "The Music service origin is invalid.", false);
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
