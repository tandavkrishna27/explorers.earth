import { EventEmitter } from "node:events";
import type { PublicMusicInvalidationKind } from "../repositories/publicMusicRevision";
import type { MusicPublicObservability } from "../observability/musicPublicObservability";

const CHANNEL = "music_public_change";
const KINDS = new Set<PublicMusicInvalidationKind>([
  "publication_changed", "guest_controls_changed", "playback_changed", "queue_changed", "playlists_changed",
]);

type PublicMusicInternalChange = { musicUserId: number; kind: PublicMusicInvalidationKind; revision: number };
type ListenClient = EventEmitter & { query(sql: string): Promise<unknown>; release(): void };

export interface MusicPublicChangeListener {
  stop(): Promise<void>;
}

function parseChange(payload: string | undefined): PublicMusicInternalChange | undefined {
  if (!payload || Buffer.byteLength(payload, "utf8") > 512) return undefined;
  try {
    const value = JSON.parse(payload) as Record<string, unknown>;
    if (Object.keys(value).sort().join(",") !== "kind,musicUserId,revision") return undefined;
    if (!Number.isSafeInteger(value.musicUserId) || Number(value.musicUserId) < 1
        || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
        || typeof value.kind !== "string" || !KINDS.has(value.kind as PublicMusicInvalidationKind)) return undefined;
    return value as PublicMusicInternalChange;
  } catch {
    return undefined;
  }
}

export async function startMusicPublicChangeListener(options: {
  pool: { connect(): Promise<ListenClient> };
  fanout(change: PublicMusicInternalChange): Promise<void>;
  catchUp?(): Promise<void>;
  reconnectDelaysMs?: readonly number[];
  onFatal?(error: unknown): void;
  observability?: MusicPublicObservability;
  now?: () => number;
}): Promise<MusicPublicChangeListener> {
  const delays = options.reconnectDelaysMs ?? [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
  if (delays.length < 1 || delays.some((delay) => !Number.isSafeInteger(delay) || delay < 0 || delay > 30_000)) {
    throw new Error("Music public change listener reconnect bounds are invalid");
  }
  let client: ListenClient | undefined;
  let stopped = false;
  let retryIndex = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let connecting: Promise<void> | undefined;
  const now = options.now ?? Date.now;
  let disconnectedAt: number | undefined;

  const detach = (target: ListenClient): void => {
    target.removeAllListeners("notification");
    target.removeAllListeners("error");
  };
  const release = (target: ListenClient): void => {
    detach(target);
    target.release();
    if (client === target) client = undefined;
  };
  const scheduleReconnect = (cause: unknown): void => {
    if (stopped || reconnectTimer) return;
    const delay = delays[retryIndex++];
    if (delay === undefined) {
      options.observability?.listener("fatal");
      options.onFatal?.(cause);
      return;
    }
    options.observability?.listener("reconnect_scheduled", { retryDelayMs: delay });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect().catch(scheduleReconnect);
    }, delay);
    reconnectTimer.unref?.();
  };
  const connect = async (): Promise<void> => {
    if (stopped || connecting) return connecting;
    connecting = (async () => {
      const next = await options.pool.connect();
      if (stopped) { next.release(); return; }
      const onNotification = (notification: { channel?: string; payload?: string }): void => {
        if (notification.channel !== CHANNEL || stopped) return;
        const change = parseChange(notification.payload);
        if (!change) { options.observability?.listener("malformed_notification"); return; }
        const startedAt = now();
        void options.fanout(change).then(() => options.observability?.listener("notification_fanout", {
          kind: change.kind, lagMs: now() - startedAt,
        })).catch(() => options.observability?.listener("fanout_failed", { kind: change.kind }));
      };
      const onError = (error: unknown): void => {
        disconnectedAt = disconnectedAt ?? now();
        options.observability?.listener("disconnected");
        release(next);
        scheduleReconnect(error);
      };
      next.on("notification", onNotification);
      next.on("error", onError);
      try {
        await next.query(`LISTEN ${CHANNEL}`);
        client = next;
        await options.catchUp?.();
        options.observability?.listener("connected", disconnectedAt === undefined ? {} : { disconnectMs: now() - disconnectedAt });
        disconnectedAt = undefined;
      } catch (error) {
        release(next);
        throw error;
      }
    })().finally(() => { connecting = undefined; });
    return connecting;
  };

  await connect();
  return {
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      await connecting?.catch(() => undefined);
      const current = client;
      if (!current) return;
      detach(current);
      try { await current.query(`UNLISTEN ${CHANNEL}`); } finally { current.release(); client = undefined; }
    },
  };
}
