import { randomUUID } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import {
  MusicIdentityError,
  MUSIC_IDENTITY_RESPONSE_STATUSES,
  musicErrorEnvelope,
  type MusicEnsureResponse,
} from "../../shared/musicError";
import type { MusicIdentityProjection } from "../repositories/musicIdentityRepository";
import type { BoundedIdentityRateLimiter } from "../middleware/identityRateLimit";
import { fingerprintStrapiProof } from "../services/proofFingerprint";
import {
  createMusicPrincipalMiddleware,
  MusicPrincipalError,
  type MusicPrincipal,
} from "../middleware/musicPrincipal";
import type { MintedMusicToken } from "../services/musicTokenService";
import type { MusicLifecycleService, MusicLifecycleStatus } from "../services/musicLifecycleService";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9._~-]{16,4096})$/;
const OWNER_HEADERS = [
  "x-user-id",
  "x-music-user-id",
  "x-owner-id",
  "x-account-id",
  "x-username",
  "x-email",
  "x-strapi-user-document-id",
  "x-strapi-account-document-id",
] as const;

export interface MusicIdentityRouteDependencies {
  ensure: (proof: string, requestId: string) => Promise<MusicIdentityProjection>;
  mintCredential: (identity: MusicIdentityProjection) => MintedMusicToken;
  resolvePrincipal: (token: string) => Promise<MusicPrincipal>;
  lifecycle?: Pick<MusicLifecycleService, "prepareDeletion" | "status" | "markDeletionBoundary" | "cancelDeletion" | "suspendFromProof" | "reactivateFromProof">;
  isMusicCredential?: (token: string) => boolean;
  limiter: BoundedIdentityRateLimiter;
  logger?: (entry: Record<string, unknown>) => void;
  fingerprint?: (proof: string) => string;
  requestIdFactory?: () => string;
  now?: () => number;
  entryEnabled?: (proof: string, requestId: string) => boolean | Promise<boolean>;
  trustedProxyHops?: 0 | 1;
  isTrustedProxy?: (peerAddress: string | undefined) => boolean;
  telemetry?: () => {
    upstreamCalls: number;
    retries: number;
    circuitState: "closed" | "open" | "half-open";
    cacheHits: number;
    cacheMisses: number;
    coalesced: number;
  };
  metrics?: (entry: {
    outcome: string;
    latencyMs: number;
    upstreamCallCount: number;
    retryCount: number;
    circuit: "closed" | "open" | "half-open";
    singleFlight: "leader" | "coalesced";
    cache: "hit" | "miss" | "none";
    conflict: string;
  }) => void;
}
/** Reject bytes before the global JSON/urlencoded parsers can inspect them. */
export function setupMusicIdentityBodylessPreflight(app: Express): void {
  app.use((req, res, next) => {
    if (req.method !== "POST" || !/^\/api\/music\/identity\/(?:ensure|lifecycle\/(?:prepare|boundary|cancel|suspend|resume))$/.test(req.path)) return next();
    const contentLength = req.get("content-length");
    if ((!contentLength || contentLength === "0") && !req.get("transfer-encoding")) return next();
    const requestId = validRequestId(req.get("x-request-id")) ?? randomUUID();
    res.setHeader("X-Request-Id", requestId);
    return res.status(400).json(musicErrorEnvelope(invalidRequest(), requestId));
  });
}

export function setupMusicIdentityRoutes(app: Express, dependencies: MusicIdentityRouteDependencies): void {
  const logger = dependencies.logger ?? ((entry) => console.info(JSON.stringify(entry)));
  const fingerprint = dependencies.fingerprint ?? fingerprintStrapiProof;
  const requestIdFactory = dependencies.requestIdFactory ?? randomUUID;
  const now = dependencies.now ?? Date.now;
  app.post("/api/music/identity/ensure", async (req: Request, res: Response) => {
    if (req.path !== "/api/music/identity/ensure") return res.status(404).end();
    const startedAt = now();
    const before = dependencies.telemetry?.();
    const requestId = validRequestId(req.get("x-request-id")) ?? requestIdFactory();
    res.setHeader("X-Request-Id", requestId);
    let outcome = "internal_error";
    let status = 500;
    try {
      assertBodylessOwnershipRequest(req);
      const proof = strictBearer(req);
      const peerAddress = req.socket.remoteAddress;
      const source = dependencies.trustedProxyHops === 1 && dependencies.isTrustedProxy?.(peerAddress)
        ? (req.ip ?? peerAddress ?? "unknown")
        : (peerAddress ?? "unknown");
      const rate = dependencies.limiter.check(source, fingerprint(proof));
      if (!rate.allowed) {
        throw new MusicIdentityError("RATE_LIMITED", 429, "Too many Music identity attempts.", "retry", true, rate.retryAfterSeconds ?? 1);
      }
      if (dependencies.entryEnabled && !await dependencies.entryEnabled(proof, requestId)) {
        throw new MusicIdentityError("ENTRY_DISABLED", 503, "Music identity entry is temporarily disabled.", "retry", true, 60);
      }
      const projection = await dependencies.ensure(proof, requestId);
      if (projection.identityStatus === "suspended") {
        throw new MusicIdentityError("IDENTITY_SUSPENDED", 403, "This Music identity is suspended.", "contact_support", false, undefined, "suspended");
      }
      if (projection.identityStatus === "pending_deletion") {
        throw new MusicIdentityError("IDENTITY_PENDING_DELETION", 409, "This Music identity is pending deletion.", "contact_support", false, undefined, "pending_deletion");
      }
      const credential = dependencies.mintCredential(projection);
      const payload: MusicEnsureResponse = {
        version: "music-identity/v1",
        identity: { musicUserId: projection.id, status: "active" },
        credential,
      };
      outcome = "success";
      status = 200;
      return res.status(200).json(payload);
    } catch (cause) {
      const error = safeError(cause);
      outcome = safeOutcome(error);
      status = error.status;
      if (status === 429 || status === 503) {
        res.setHeader("Retry-After", String(error.retryAfterSeconds ?? 1));
      }
      return res.status(status).json(musicErrorEnvelope(error, requestId));
    } finally {
      const latencyMs = Math.max(0, now() - startedAt);
      logger({
        event: "music_identity_ensure",
        requestId,
        outcome,
        status,
        latencyMs,
      });
      const after = dependencies.telemetry?.();
      if (dependencies.metrics && after) {
        const cacheHits = after.cacheHits - (before?.cacheHits ?? after.cacheHits);
        const cacheMisses = after.cacheMisses - (before?.cacheMisses ?? after.cacheMisses);
        dependencies.metrics({
          outcome,
          latencyMs,
          upstreamCallCount: Math.max(0, after.upstreamCalls - (before?.upstreamCalls ?? after.upstreamCalls)),
          retryCount: Math.max(0, after.retries - (before?.retries ?? after.retries)),
          circuit: after.circuitState,
          singleFlight: after.coalesced > (before?.coalesced ?? after.coalesced) ? "coalesced" : "leader",
          cache: cacheHits > 0 ? "hit" : cacheMisses > 0 ? "miss" : "none",
          conflict: outcome.startsWith("conflict:") ? outcome.slice("conflict:".length) : "none",
        });
      }
    }
  });

  if (dependencies.lifecycle) {
    const lifecycle = dependencies.lifecycle;
    const lifecycleHandler = (
      action: "prepare" | "status" | "boundary" | "cancel",
      operation: (proof: string, requestId: string) => Promise<MusicLifecycleStatus>,
    ) => async (req: Request, res: Response) => {
        const requestId = validRequestId(req.get("x-request-id")) ?? requestIdFactory();
        res.setHeader("X-Request-Id", requestId);
        let status = 500;
        let outcome = "internal_error";
        try {
          assertBodylessLifecycleRequest(req);
          const proof = strictBearer(req);
          if (dependencies.isMusicCredential?.(proof)) {
            throw new MusicIdentityError("AUTH_INVALID", 401, "An Explorer bearer proof is required.", "authenticate", false);
          }
          const peerAddress = req.socket.remoteAddress;
          const source = dependencies.trustedProxyHops === 1 && dependencies.isTrustedProxy?.(peerAddress)
            ? (req.ip ?? peerAddress ?? "unknown") : (peerAddress ?? "unknown");
          const rate = dependencies.limiter.check(source, fingerprint(proof));
          if (!rate.allowed) {
            throw new MusicIdentityError("RATE_LIMITED", 429, "Too many Music lifecycle attempts.", "retry", true, rate.retryAfterSeconds ?? 1);
          }
          if (action === "prepare" && dependencies.entryEnabled && !await dependencies.entryEnabled(proof, requestId)) {
            throw new MusicIdentityError("ENTRY_DISABLED", 503, "Music identity entry is temporarily disabled.", "retry", true, 60);
          }
          const value = await operation(proof, requestId);
          status = 200;
          outcome = value.deadLetter ? "dead_letter" : value.state;
          return res.status(200).json(lifecycleEnvelope(value));
        } catch (cause) {
          const error = safeError(cause);
          status = error.status;
          outcome = safeOutcome(error);
          if (status === 429 || status === 503) res.setHeader("Retry-After", String(error.retryAfterSeconds ?? 1));
          return res.status(status).json(musicErrorEnvelope(error, requestId));
        } finally {
          logger({ event: `music_lifecycle_${action}`, requestId, outcome, status });
        }
    };
    app.post("/api/music/identity/lifecycle/prepare", lifecycleHandler("prepare", (proof, requestId) => lifecycle.prepareDeletion(proof, requestId)));
    app.get("/api/music/identity/lifecycle/status", lifecycleHandler("status", (proof, requestId) => lifecycle.status(proof, requestId)));
    app.post("/api/music/identity/lifecycle/boundary", lifecycleHandler("boundary", (proof, requestId) => lifecycle.markDeletionBoundary(proof, requestId)));
    app.post("/api/music/identity/lifecycle/cancel", lifecycleHandler("cancel", (proof, requestId) => lifecycle.cancelDeletion(proof, requestId)));
    const availabilityHandler = (
      action: "suspend" | "resume",
      operation: (proof: string, requestId: string) => Promise<{ identityStatus: string }>,
    ) => async (req: Request, res: Response) => {
      const requestId = validRequestId(req.get("x-request-id")) ?? requestIdFactory();
      res.setHeader("X-Request-Id", requestId);
      let status = 500;
      let outcome = "internal_error";
      try {
        assertBodylessLifecycleRequest(req);
        const proof = strictBearer(req);
        if (dependencies.isMusicCredential?.(proof)) {
          throw new MusicIdentityError("AUTH_INVALID", 401, "An Explorer bearer proof is required.", "authenticate", false);
        }
        const peerAddress = req.socket.remoteAddress;
        const source = dependencies.trustedProxyHops === 1 && dependencies.isTrustedProxy?.(peerAddress)
          ? (req.ip ?? peerAddress ?? "unknown") : (peerAddress ?? "unknown");
        const rate = dependencies.limiter.check(source, fingerprint(proof));
        if (!rate.allowed) {
          throw new MusicIdentityError("RATE_LIMITED", 429, "Too many Music lifecycle attempts.", "retry", true, rate.retryAfterSeconds ?? 1);
        }
        const value = await operation(proof, requestId);
        status = 200;
        outcome = "completed";
        return res.status(200).json({ version: "music-lifecycle/v1", identity: { status: value.identityStatus } });
      } catch (cause) {
        const error = safeError(cause);
        status = error.status;
        outcome = safeOutcome(error);
        if (status === 429 || status === 503) res.setHeader("Retry-After", String(error.retryAfterSeconds ?? 1));
        return res.status(status).json(musicErrorEnvelope(error, requestId));
      } finally {
        logger({ event: `music_lifecycle_${action}`, requestId, outcome, status });
      }
    };
    app.post("/api/music/identity/lifecycle/suspend", availabilityHandler(
      "suspend", (proof, requestId) => lifecycle.suspendFromProof(proof, requestId),
    ));
    app.post("/api/music/identity/lifecycle/resume", availabilityHandler(
      "resume", (proof, requestId) => lifecycle.reactivateFromProof(proof, requestId),
    ));
  }

  const principalMiddleware = createMusicPrincipalMiddleware(dependencies.resolvePrincipal);
  app.get(
    "/api/music/identity/current",
    (req: Request, res: Response, next: NextFunction) => {
      const requestId = validRequestId(req.get("x-request-id")) ?? requestIdFactory();
      res.locals.musicRequestId = requestId;
      res.setHeader("X-Request-Id", requestId);
      next();
    },
    principalMiddleware,
    (req: Request, res: Response) => res.status(200).json({
      version: "music-principal/v1",
      identity: { musicUserId: req.musicPrincipal!.musicUserId, status: "active" },
    }),
    (cause: unknown, _req: Request, res: Response, _next: (error?: unknown) => void) => {
      const error = safePrincipalError(cause);
      if (error.status === 503) res.setHeader("Retry-After", String(error.retryAfterSeconds ?? 1));
      return res.status(error.status).json(musicErrorEnvelope(error, res.locals.musicRequestId));
    },
  );
}

function validRequestId(value: string | undefined): string | undefined {
  return value && REQUEST_ID_PATTERN.test(value) ? value : undefined;
}

function strictBearer(req: Request): string {
  const authorizationFields: string[] = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLowerCase() === "authorization") authorizationFields.push(req.rawHeaders[index + 1] ?? "");
  }
  const value = authorizationFields[0];
  if (authorizationFields.length !== 1 || !value) {
    throw new MusicIdentityError("AUTH_REQUIRED", 401, "A single Explorer bearer proof is required.", "authenticate", false);
  }
  const match = BEARER_PATTERN.exec(value);
  if (!match) throw new MusicIdentityError("AUTH_INVALID", 401, "The Explorer proof is invalid or expired.", "authenticate", false);
  return match[1];
}

function assertBodylessOwnershipRequest(req: Request): void {
  const contentLength = req.get("content-length");
  if ((contentLength && contentLength !== "0") || req.get("transfer-encoding")) {
    throw invalidRequest();
  }
  if (Object.keys(req.query).length > 0 || OWNER_HEADERS.some((header) => req.get(header) !== undefined)) {
    throw invalidRequest();
  }
}

function assertBodylessLifecycleRequest(req: Request): void {
  const contentLength = req.get("content-length");
  if ((contentLength && contentLength !== "0") || req.get("transfer-encoding")
      || Object.keys(req.query).length > 0 || OWNER_HEADERS.some((header) => req.get(header) !== undefined)) {
    throw new MusicIdentityError("REQUEST_INVALID", 400, "Music lifecycle requests must be bodyless and contain no owner input.", "none", false);
  }
}

function lifecycleEnvelope(value: MusicLifecycleStatus) {
  return {
    version: "music-lifecycle/v1" as const,
    operation: {
      operationId: value.operationId,
      status: value.identityStatus,
      phase: value.phase,
      state: value.state,
      boundaryCrossed: value.boundaryCrossed,
      retryable: value.retryable,
      deadLetter: value.deadLetter,
      upstreamUserDocumentId: value.upstreamUserDocumentId,
      upstreamAccountDocumentId: value.upstreamAccountDocumentId,
    },
  };
}

function invalidRequest(): MusicIdentityError {
  return new MusicIdentityError("REQUEST_INVALID", 400, "Music identity ensure must be bodyless and contain no owner input.", "none", false);
}

function safeError(cause: unknown): MusicIdentityError {
  if (cause instanceof MusicIdentityError
      && cause.status !== 200
      && (MUSIC_IDENTITY_RESPONSE_STATUSES as readonly number[]).includes(cause.status)) return cause;
  const code = typeof cause === "object" && cause && "code" in cause ? String((cause as { code?: unknown }).code) : "";
  if (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P01", "57P03", "08006"].includes(code)) {
    return new MusicIdentityError("DATABASE_UNAVAILABLE", 503, "Music identity is temporarily unavailable.", "retry", true, 2);
  }
  return new MusicIdentityError("INTERNAL_ERROR", 500, "Music identity could not be ensured.", "retry", true);
}

function safePrincipalError(cause: unknown): MusicIdentityError {
  if (cause instanceof MusicPrincipalError) {
    const action = cause.code === "IDENTITY_SUSPENDED" ? "contact_support"
      : cause.code === "IDENTITY_PENDING_DELETION" ? "contact_support"
        : "authenticate";
    return new MusicIdentityError(cause.code, cause.status, cause.message, action, false);
  }
  return safeError(cause);
}

function safeOutcome(error: MusicIdentityError): string {
  if (error.status >= 500) return "dependency_failure";
  if (error.status === 429) return "rate_limited";
  if (error.status === 401) return "authentication_failure";
  if (error.status === 403) return "eligibility_failure";
  if (error.status === 409) return `conflict:${error.safeConflictCategory ?? "identity"}`;
  return "invalid_request";
}
