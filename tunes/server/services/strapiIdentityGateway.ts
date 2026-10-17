import { z } from "zod";
import { MusicIdentityError } from "../../shared/musicError";
import type { ResolvedStrapiIdentity } from "./resolvedIdentity";
// Ticket 8.1a: these moved to neutral modules so the canonical closure no longer
// imports a Strapi-named file. The gateway still uses all four.
import {
  cancelResponseBody,
  MalformedUpstreamBodyError,
  readBoundedResponseBody,
  withDeadline,
} from "./upstreamResponseBody";
import { fingerprintStrapiProof } from "./proofFingerprint";

const boundedString = z.string().trim().min(1).max(512);
const strapiUserSchema = z.object({
  documentId: boundedString,
  username: boundedString,
  email: z.string().email().max(320),
  provider: boundedString,
  confirmed: z.boolean(),
  blocked: z.boolean().default(false),
}).passthrough();

const strapiAccountSchema = z.object({
  documentId: boundedString,
  Account_Name: z.string().trim().max(512).nullable().optional(),
  Account_Type: z.string().trim().max(128).nullable().optional(),
  mobile_number: z.string().trim().max(64).nullable().optional(),
}).passthrough();

const strapiAccountsSchema = z.object({
  data: z.array(strapiAccountSchema).max(50),
  meta: z.object({
    pagination: z.object({
      page: z.number().int().min(1),
      pageSize: z.number().int().min(1).max(50),
      pageCount: z.number().int().min(0).max(10),
      total: z.number().int().min(0).max(500),
    }).strict(),
  }).strict(),
}).passthrough();

const ACCOUNT_PAGE_SIZE = 50;
const MAX_ACCOUNT_PAGES = 10;
const MAX_ACCOUNT_TOTAL = ACCOUNT_PAGE_SIZE * MAX_ACCOUNT_PAGES;
const MAX_JSON_BODY_BYTES = 128 * 1024;

// Ticket 8.1a: the DTO now lives in a neutral module so consumers need not import a
// Strapi-named file for a type. Re-exported because the gateway is still its producer.
export type { ResolvedStrapiIdentity };

export interface ResolvedStrapiUser {
  userDocumentId: string;
}

export interface StrapiIdentityGatewayOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  maxConcurrency: number;
  maxPending: number;
  retries: number;
  connectTimeoutMs: number;
  readTimeoutMs: number;
  overallTimeoutMs: number;
  cacheTtlMs: number;
  circuitFailureThreshold: number;
  circuitOpenMs: number;
  now?: () => number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  diagnostic?: (entry: { endpoint: "user" | "account"; attempt: number; outcome: "ok" | "http_error" | "transport_error"; status?: number }) => void;
}

interface CacheEntry {
  value: ResolvedStrapiIdentity;
  expiresAt: number;
}

type CircuitState = "closed" | "open" | "half-open";
interface CircuitAdmission { generation: number; probe: boolean }

class AdmissionLimitError extends Error {
  constructor() {
    super("bounded upstream admission refused");
    this.name = "AdmissionLimitError";
  }
}

interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

class BoundedSemaphore {
  private activeCount = 0;
  private readonly queue: Waiter[] = [];
  private peakPendingCount = 0;

  constructor(private readonly maximum: number, private readonly maximumPending: number) {}

  async use<T>(operation: () => Promise<T>, deadline: number, now: () => number): Promise<T> {
    await this.acquire(deadline, now);
    try {
      if (now() >= deadline) throw new AdmissionLimitError();
      return await operation();
    } finally {
      this.release();
    }
  }

  stats(): { active: number; pending: number; peakPending: number } {
    return { active: this.activeCount, pending: this.pending(), peakPending: this.peakPendingCount };
  }

  private pending(): number {
    return this.activeCount + this.queue.length;
  }

  private async acquire(deadline: number, now: () => number): Promise<void> {
    const remaining = deadline - now();
    if (remaining <= 0 || this.pending() >= this.maximumPending) throw new AdmissionLimitError();
    if (this.activeCount < this.maximum) {
      this.activeCount += 1;
      this.peakPendingCount = Math.max(this.peakPendingCount, this.pending());
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.queue.indexOf(waiter);
          if (index >= 0) this.queue.splice(index, 1);
          reject(new AdmissionLimitError());
        }, remaining),
      };
      this.queue.push(waiter);
      this.peakPendingCount = Math.max(this.peakPendingCount, this.pending());
    });
  }

  private release(): void {
    const waiter = this.queue.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve();
      return;
    }
    this.activeCount -= 1;
  }
}

class GatewayUnavailableError extends MusicIdentityError {
  constructor(retryAfterSeconds: number, readonly countsTowardCircuit: boolean) {
    super("UPSTREAM_UNAVAILABLE", 503, "Music identity is temporarily unavailable.", "retry", true, retryAfterSeconds);
  }
}

export class StrapiIdentityGateway {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly semaphore: BoundedSemaphore;
  private readonly cache = new Map<string, CacheEntry>();
  private circuitState: CircuitState = "closed";
  private circuitGeneration = 0;
  private consecutiveFailures = 0;
  private openedUntil = 0;
  private probeActive = false;
  private upstreamCalls = 0;
  private retries = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private circuitRejections = 0;

  constructor(private readonly options: StrapiIdentityGatewayOptions) {
    let url: URL;
    try { url = new URL(options.baseUrl); }
    catch { throw new Error("invalid bounded Strapi identity gateway configuration"); }
    const integers = [options.maxConcurrency, options.maxPending, options.retries, options.connectTimeoutMs,
      options.readTimeoutMs, options.overallTimeoutMs, options.cacheTtlMs, options.circuitFailureThreshold,
      options.circuitOpenMs];
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== options.baseUrl
        || !integers.every(Number.isSafeInteger)
        || options.maxConcurrency < 1 || options.maxConcurrency > 64
        || options.maxPending < options.maxConcurrency || options.maxPending > 128
        || options.retries < 0 || options.retries > 3
        || options.connectTimeoutMs < 1 || options.readTimeoutMs < 1 || options.overallTimeoutMs < 1
        || options.cacheTtlMs < 0 || options.cacheTtlMs > 30_000
        || options.circuitFailureThreshold < 1 || options.circuitOpenMs < 1) {
      throw new Error("invalid bounded Strapi identity gateway configuration");
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.semaphore = new BoundedSemaphore(options.maxConcurrency, options.maxPending);
  }

  async resolve(proof: string, requestId: string): Promise<ResolvedStrapiIdentity> {
    const fingerprint = fingerprintStrapiProof(proof);
    const cached = this.cache.get(fingerprint);
    if (cached && cached.expiresAt > this.now()) {
      this.cacheHits += 1;
      return cached.value;
    }
    this.cacheMisses += 1;
    if (cached) this.cache.delete(fingerprint);
    const admission = this.admitCircuit();
    try {
      const value = await this.resolveFresh(proof, requestId, admission);
      const current = this.recordSuccess(admission);
      if (current) {
        this.cache.set(fingerprint, { value, expiresAt: this.now() + this.options.cacheTtlMs });
        this.pruneCache();
      }
      return value;
    } catch (error) {
      if (isCircuitFailure(error)) this.recordFailure(admission);
      else if (error instanceof GatewayUnavailableError) this.recordNeutral(admission);
      else this.recordSuccess(admission);
      throw error;
    }
  }

  async resolveUser(proof: string, requestId: string): Promise<ResolvedStrapiUser> {
    const admission = this.admitCircuit();
    try {
      const deadline = this.now() + this.options.overallTimeoutMs;
      const user = await this.resolveEligibleUser(proof, requestId, deadline, admission);
      this.recordSuccess(admission);
      return { userDocumentId: user.documentId };
    } catch (error) {
      if (isCircuitFailure(error)) this.recordFailure(admission);
      else if (error instanceof GatewayUnavailableError) this.recordNeutral(admission);
      else this.recordSuccess(admission);
      throw error;
    }
  }

  clear(fingerprint?: string): void {
    if (fingerprint) this.cache.delete(fingerprint);
    else this.cache.clear();
  }

  stats(): {
    cacheEntries: number;
    circuitState: CircuitState;
    circuitGeneration: number;
    upstreamCalls: number;
    retries: number;
    cacheHits: number;
    cacheMisses: number;
    circuitRejections: number;
    active: number;
    pending: number;
    peakPending: number;
  } {
    return {
      cacheEntries: this.cache.size,
      circuitState: this.circuitState,
      circuitGeneration: this.circuitGeneration,
      upstreamCalls: this.upstreamCalls,
      retries: this.retries,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      circuitRejections: this.circuitRejections,
      ...this.semaphore.stats(),
    };
  }

  private async resolveFresh(proof: string, requestId: string, admission: CircuitAdmission): Promise<ResolvedStrapiIdentity> {
    const deadline = this.now() + this.options.overallTimeoutMs;
    const user = await this.resolveEligibleUser(proof, requestId, deadline, admission);

    const accounts: Array<z.infer<typeof strapiAccountSchema>> = [];
    const documentIds = new Set<string>();
    let authoritative: { pageCount: number; total: number } | undefined;
    for (let page = 1; page <= (authoritative?.pageCount || 1); page += 1) {
      const params = new URLSearchParams({
        "filters[users_permissions_users][documentId][$eq]": user.documentId,
        "sort[0]": "documentId:asc",
        "pagination[page]": String(page),
        "pagination[pageSize]": String(ACCOUNT_PAGE_SIZE),
        "pagination[withCount]": "true",
      });
      const accountBody = await this.requestJson(`/api/accounts?${params.toString()}`, proof, requestId, deadline, admission, "account");
      const parsedAccounts = strapiAccountsSchema.safeParse(accountBody);
      if (!parsedAccounts.success) throw malformed();
      const { data, meta: { pagination } } = parsedAccounts.data;
      const expectedPageCount = pagination.total === 0 ? 0 : Math.ceil(pagination.total / ACCOUNT_PAGE_SIZE);
      const expectedRows = pagination.total === 0 ? 0
        : page < pagination.pageCount ? ACCOUNT_PAGE_SIZE
          : pagination.total - (pagination.pageCount - 1) * ACCOUNT_PAGE_SIZE;
      if (pagination.page !== page || pagination.pageSize !== ACCOUNT_PAGE_SIZE
          || pagination.total > MAX_ACCOUNT_TOTAL || pagination.pageCount > MAX_ACCOUNT_PAGES
          || pagination.pageCount !== expectedPageCount || data.length !== expectedRows
          || (authoritative && (pagination.pageCount !== authoritative.pageCount || pagination.total !== authoritative.total))) {
        throw malformed();
      }
      authoritative ??= { pageCount: pagination.pageCount, total: pagination.total };
      for (const account of data) {
        if (documentIds.has(account.documentId)) throw malformed();
        documentIds.add(account.documentId);
        accounts.push(account);
      }
    }
    const completed = accounts.filter((account) =>
      Boolean(account.Account_Name && account.Account_Type && account.mobile_number));
    if (completed.length === 0) {
      throw new MusicIdentityError("ONBOARDING_INCOMPLETE", 409, "Complete Explorer onboarding before using Music.", "complete_onboarding", false);
    }
    if (completed.length !== 1) {
      throw new MusicIdentityError("ACCOUNT_AMBIGUOUS", 409, "Music cannot select an unambiguous Explorer Account.", "contact_support", false);
    }
    const account = completed[0];
    return {
      userDocumentId: user.documentId,
      accountDocumentId: account.documentId,
      username: user.username,
      email: user.email,
      provider: user.provider.toLowerCase() as "local" | "google",
      accountName: account.Account_Name!,
      accountType: account.Account_Type!,
      accountMobile: account.mobile_number!,
    };
  }

  private async resolveEligibleUser(
    proof: string,
    requestId: string,
    deadline: number,
    admission: CircuitAdmission,
  ): Promise<z.infer<typeof strapiUserSchema>> {
    const userBody = await this.requestJson("/api/users/me", proof, requestId, deadline, admission, "user");
    const parsedUser = strapiUserSchema.safeParse(userBody);
    if (!parsedUser.success) throw malformed();
    const user = parsedUser.data;
    const provider = user.provider.toLowerCase();
    const eligible = !user.blocked && ((provider === "local" && user.confirmed) || provider === "google");
    if (!eligible) {
      throw new MusicIdentityError("IDENTITY_INELIGIBLE", 403, "This Explorer identity is not eligible for Music.", "complete_onboarding", false);
    }
    return user;
  }

  private async requestJson(
    path: string,
    proof: string,
    requestId: string,
    deadline: number,
    admission: CircuitAdmission,
    endpoint: "user" | "account",
  ): Promise<unknown> {
    for (let attempt = 0; attempt <= this.options.retries; attempt += 1) {
      if (deadline - this.now() <= 0) throw unavailable(2, true);
      try {
        const result = await this.semaphore.use(async () => {
          this.assertAdmissionCurrent(admission);
          const remaining = deadline - this.now();
          if (remaining <= 0) throw new AdmissionLimitError();
          const controller = new AbortController();
          this.upstreamCalls += 1;
          const response = await withDeadline(
            this.fetchImpl(new URL(path, this.options.baseUrl), {
              method: "GET",
              headers: {
                authorization: `Bearer ${proof}`,
                accept: "application/json",
                "x-request-id": requestId,
              },
              signal: controller.signal,
            }),
            Math.min(remaining, this.options.connectTimeoutMs),
            controller,
          );
          if (response.status >= 400) {
            await cancelResponseBody(response);
            return { response, body: undefined };
          }
          const body = await readBoundedResponseBody(
            response,
            MAX_JSON_BODY_BYTES,
            Math.min(this.options.readTimeoutMs, Math.max(1, deadline - this.now())),
            controller,
          );
          return { response, body };
        }, deadline, this.now);
        const { response } = result;
        if (this.options.diagnostic) {
          if (response.status >= 400) {
            this.options.diagnostic({ endpoint, attempt: attempt + 1, outcome: "http_error", status: response.status });
          } else {
            this.options.diagnostic({ endpoint, attempt: attempt + 1, outcome: "ok" });
          }
        }
        if (response.status === 401 || response.status === 403) {
          throw new MusicIdentityError("AUTH_INVALID", 401, "The Explorer proof is invalid or expired.", "authenticate", false);
        }
        if (response.status >= 400 && response.status < 500 && response.status !== 429) throw malformed();
        if (response.status === 429 || response.status >= 500) {
          if (attempt < this.options.retries) {
            this.retries += 1;
            await this.backoff(response.headers.get("retry-after"), deadline);
            continue;
          }
          throw unavailable(clientRetryAfterSeconds(parseRetryAfterMs(response.headers.get("retry-after"), this.now())), true);
        }
        const body = result.body!;
        try { return JSON.parse(body); }
        catch { throw malformed(); }
      } catch (error) {
        if (!(error instanceof MusicIdentityError) && !(error instanceof MalformedUpstreamBodyError)) {
          this.options.diagnostic?.({ endpoint, attempt: attempt + 1, outcome: "transport_error" });
        }
        if (error instanceof MusicIdentityError) throw error;
        if (error instanceof MalformedUpstreamBodyError) throw malformed();
        if (error instanceof AdmissionLimitError) throw unavailable(1, false);
        if (attempt < this.options.retries) {
          this.retries += 1;
          await this.backoff(null, deadline);
          continue;
        }
        throw unavailable(2, true);
      }
    }
    throw unavailable(2, true);
  }

  private async backoff(retryAfter: string | null, deadline: number): Promise<void> {
    const lowerBound = parseRetryAfterMs(retryAfter, this.now());
    const jitter = 10 + Math.floor(this.random() * 20);
    const delay = Math.max(lowerBound ?? 0, jitter);
    if (delay > deadline - this.now()) {
      throw unavailable(clientRetryAfterSeconds(lowerBound), true);
    }
    await this.sleep(delay);
    if (this.now() > deadline) throw unavailable(clientRetryAfterSeconds(lowerBound), true);
  }

  private admitCircuit(): CircuitAdmission {
    if (this.circuitState === "closed") return { generation: this.circuitGeneration, probe: false };
    if (this.circuitState === "open") {
      if (this.now() < this.openedUntil) {
        this.circuitRejections += 1;
        throw unavailable(Math.max(1, Math.ceil((this.openedUntil - this.now()) / 1_000)), false);
      }
      this.circuitState = "half-open";
      this.probeActive = true;
      return { generation: this.circuitGeneration, probe: true };
    }
    this.circuitRejections += 1;
    throw unavailable(1, false);
  }

  private assertAdmissionCurrent(admission: CircuitAdmission): void {
    if (admission.generation !== this.circuitGeneration
        || this.circuitState === "open"
        || (this.circuitState === "half-open" && !admission.probe)) {
      throw unavailable(Math.max(1, Math.ceil((this.openedUntil - this.now()) / 1_000)), false);
    }
  }

  private recordFailure(admission: CircuitAdmission): boolean {
    if (admission.generation !== this.circuitGeneration) return false;
    if (admission.probe && this.circuitState === "half-open") {
      this.openCircuit();
      return true;
    }
    if (this.circuitState !== "closed") return false;
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.options.circuitFailureThreshold) this.openCircuit();
    return true;
  }

  private recordSuccess(admission: CircuitAdmission): boolean {
    if (admission.generation !== this.circuitGeneration) return false;
    if (admission.probe) {
      if (this.circuitState !== "half-open" || !this.probeActive) return false;
      this.circuitState = "closed";
      this.probeActive = false;
      this.consecutiveFailures = 0;
      this.circuitGeneration += 1;
      return true;
    }
    if (this.circuitState !== "closed") return false;
    this.consecutiveFailures = 0;
    return true;
  }

  private recordNeutral(admission: CircuitAdmission): void {
    if (admission.generation === this.circuitGeneration
        && admission.probe
        && this.circuitState === "half-open") {
      this.openCircuit();
    }
  }

  private openCircuit(): void {
    this.circuitState = "open";
    this.openedUntil = this.now() + this.options.circuitOpenMs;
    this.probeActive = false;
    this.consecutiveFailures = 0;
    this.circuitGeneration += 1;
  }

  private pruneCache(): void {
    const now = this.now();
    this.cache.forEach((entry, key) => {
      if (entry.expiresAt <= now) this.cache.delete(key);
    });
    while (this.cache.size > 1_024) this.cache.delete(this.cache.keys().next().value as string);
  }
}

export function parseRetryAfterMs(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  if (/^[0-9]+$/.test(value)) {
    const seconds = Number(value);
    return !Number.isSafeInteger(seconds) || seconds > Number.MAX_SAFE_INTEGER / 1_000
      ? Number.MAX_SAFE_INTEGER
      : seconds * 1_000;
  }
  if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/.test(value)) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : undefined;
}

function clientRetryAfterSeconds(milliseconds: number | undefined): number {
  if (milliseconds === undefined) return 2;
  return Math.max(1, Math.min(3_600, Math.ceil(milliseconds / 1_000)));
}

function malformed(): MusicIdentityError {
  return new MusicIdentityError("UPSTREAM_MALFORMED", 502, "Explorer returned an invalid identity response.", "retry", true, 2);
}

function unavailable(retryAfterSeconds: number, countsTowardCircuit: boolean): MusicIdentityError {
  return new GatewayUnavailableError(Math.max(1, Math.min(3_600, retryAfterSeconds)), countsTowardCircuit);
}

function isCircuitFailure(error: unknown): boolean {
  if (error instanceof GatewayUnavailableError) return error.countsTowardCircuit;
  return error instanceof MusicIdentityError && error.status === 502;
}
