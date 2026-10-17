const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const MAX_DURATION_MS = 300_000;

export type MusicPublicHttpOperation = "descriptor" | "resource" | "request";
export type MusicPublicHttpOutcome = "success" | "invalid" | "not_found" | "forbidden" | "rate_limited" | "conflict" | "too_large" | "unavailable";
export type MusicPublicInvalidationKind = "publication_changed" | "guest_controls_changed" | "playback_changed" | "queue_changed" | "playlists_changed";

export type MusicPublicOperationalEvent =
  | { version: "music-public-ops/v1"; event: "http"; operation: MusicPublicHttpOperation; outcome: MusicPublicHttpOutcome; status: number; latencyMs: number; requestId?: string }
  | { version: "music-public-ops/v1"; event: "listener"; outcome: "connected" | "disconnected" | "reconnect_scheduled" | "malformed_notification" | "notification_fanout" | "fanout_failed" | "fatal"; retryDelayMs?: number; lagMs?: number; disconnectMs?: number; kind?: MusicPublicInvalidationKind }
  | { version: "music-public-ops/v1"; event: "socket"; outcome: "admitted" | "rejected" | "disconnected" | "invalidation_sent" | "revocation_enforced"; role?: "owner" | "guest" | "public"; reason?: "invalid" | "origin" | "revoked" | "transport"; kind?: MusicPublicInvalidationKind }
  | { version: "music-public-ops/v1"; event: "security"; outcome: "authorization_leak" | "cross_owner_event" | "capability_exposure" };

export interface MusicPublicObservability {
  startHttp(operation: MusicPublicHttpOperation, requestId: string | undefined, startedAt?: number): (outcome: MusicPublicHttpOutcome, status: number) => void;
  listener(outcome: Extract<MusicPublicOperationalEvent, { event: "listener" }>["outcome"], fields?: { retryDelayMs?: number; lagMs?: number; disconnectMs?: number; kind?: MusicPublicInvalidationKind }): void;
  socket(outcome: Extract<MusicPublicOperationalEvent, { event: "socket" }>["outcome"], fields?: { role?: "owner" | "guest" | "public"; reason?: "invalid" | "origin" | "revoked" | "transport"; kind?: MusicPublicInvalidationKind }): void;
  security(outcome: "authorization_leak" | "cross_owner_event" | "capability_exposure"): void;
}

const boundedDuration = (value: number) => Math.max(0, Math.min(MAX_DURATION_MS, Number.isFinite(value) ? Math.round(value) : MAX_DURATION_MS));

export function createMusicPublicObservability(options: {
  sink?: (event: MusicPublicOperationalEvent) => void;
  now?: () => number;
} = {}): MusicPublicObservability {
  const sink = options.sink ?? ((event) => console.info(JSON.stringify(event)));
  const emit = (event: MusicPublicOperationalEvent): void => { try { sink(event); } catch { /* observability is never product authority */ } };
  const now = options.now ?? Date.now;
  return {
    startHttp(operation, requestId, startedAt = now()) {
      const safeRequestId = requestId && SAFE_REQUEST_ID.test(requestId) ? requestId : undefined;
      return (outcome, status) => emit({
        version: "music-public-ops/v1", event: "http", operation, outcome,
        status: Math.max(100, Math.min(599, Math.round(status))), latencyMs: boundedDuration(now() - startedAt),
        ...(safeRequestId ? { requestId: safeRequestId } : {}),
      });
    },
    listener(outcome, fields = {}) {
      emit({ version: "music-public-ops/v1", event: "listener", outcome,
        ...(fields.retryDelayMs === undefined ? {} : { retryDelayMs: Math.min(30_000, boundedDuration(fields.retryDelayMs)) }),
        ...(fields.lagMs === undefined ? {} : { lagMs: boundedDuration(fields.lagMs) }),
        ...(fields.disconnectMs === undefined ? {} : { disconnectMs: boundedDuration(fields.disconnectMs) }),
        ...(fields.kind ? { kind: fields.kind } : {}),
      });
    },
    socket(outcome, fields = {}) { emit({
      version: "music-public-ops/v1", event: "socket", outcome,
      ...(fields.role ? { role: fields.role } : {}),
      ...(fields.reason ? { reason: fields.reason } : {}),
      ...(fields.kind ? { kind: fields.kind } : {}),
    }); },
    security(outcome) { emit({ version: "music-public-ops/v1", event: "security", outcome }); },
  };
}
