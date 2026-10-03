import { runtimeOrigin, runtimeSocketTransport } from "../../lib/publicRuntimeConfig";
import { io } from "socket.io-client";
import { resolveMusicSocketTransport } from "./musicDevelopmentTransport";

const EVENT_KINDS = new Set([
  "publication_changed", "guest_controls_changed", "playback_changed", "queue_changed", "playlists_changed",
]);

type SocketLike = {
  on(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
  disconnect(): unknown;
};

export interface OwnerMusicSubscription { unsubscribe(): void }

export function subscribeToOwnerMusic(
  options: {
    token: string;
    initialRevision?: number;
    onInvalidate(signal: AbortSignal): Promise<{ revision: number } | void>;
    onError?(error: unknown): void;
    signal?: AbortSignal;
  },
  dependencies: { socketFactory?: (auth: { token: string }) => SocketLike } = {},
): OwnerMusicSubscription {
  const socketFactory = dependencies.socketFactory ?? ((auth) => {
    const transport = runtimeSocketTransport(resolveMusicSocketTransport({
      development: import.meta.env.DEV,
      musicOrigin: runtimeOrigin(import.meta.env.VITE_LOCAL_TUNES_API_URL || "https://localtunes.earth"),
      browserOrigin: window.location.origin,
    }));
    return io(transport.origin, {
      path: transport.path,
      transports: ["websocket", "polling"],
      auth,
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.2,
    });
  });
  const socket = socketFactory({ token: options.token });
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let controller: AbortController | undefined;
  let lastAppliedRevision = Number.isSafeInteger(options.initialRevision) && Number(options.initialRevision) >= 0
    ? Number(options.initialRevision) : -1;
  let pendingRevision = lastAppliedRevision;

  const active = () => !stopped && document.visibilityState !== "hidden" && navigator.onLine !== false;
  const schedule = () => {
    if (!active() || inFlight || timer) return;
    timer = setTimeout(() => { timer = undefined; void refresh(); }, 0);
  };
  const refresh = (): Promise<void> => {
    if (!active()) return Promise.resolve();
    if (inFlight) return inFlight;
    const requestedRevision = pendingRevision;
    const requestController = new AbortController();
    controller = requestController;
    const request = options.onInvalidate(requestController.signal).then((result) => {
      if (stopped || requestController.signal.aborted || !result || !Number.isSafeInteger(result.revision)) return;
      if (result.revision >= Math.max(lastAppliedRevision, requestedRevision)) lastAppliedRevision = result.revision;
    }).catch((error) => {
      if (!stopped && !requestController.signal.aborted) options.onError?.(error);
    }).finally(() => {
      if (controller === requestController) controller = undefined;
      inFlight = undefined;
      if (active() && pendingRevision > Math.max(lastAppliedRevision, requestedRevision)) schedule();
    });
    inFlight = request;
    return request;
  };
  const onChange = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const event = value as Record<string, unknown>;
    if (Object.keys(event).sort().join(",") !== "kind,revision,version"
        || event.version !== "music-owner-change/v1" || typeof event.kind !== "string"
        || !EVENT_KINDS.has(event.kind) || !Number.isSafeInteger(event.revision)
        || Number(event.revision) <= lastAppliedRevision) return;
    pendingRevision = Math.max(pendingRevision, Number(event.revision));
    schedule();
  };
  const onConnect = () => { void refresh(); };
  const onDisconnect = () => { void refresh(); };
  const onResume = () => { if (active()) void refresh(); };
  const unsubscribe = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
    socket.off("music_owner_change", onChange);
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
    socket.off("connect_error", onDisconnect);
    document.removeEventListener("visibilitychange", onResume);
    window.removeEventListener("online", onResume);
    socket.disconnect();
  };
  socket.on("music_owner_change", onChange);
  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  socket.on("connect_error", onDisconnect);
  document.addEventListener("visibilitychange", onResume);
  window.addEventListener("online", onResume);
  options.signal?.addEventListener("abort", unsubscribe, { once: true });
  if (options.signal?.aborted) unsubscribe();
  return { unsubscribe };
}
