import { clearMusicCredential } from "../../lib/musicCredentialStore";
import { queryClient } from "../../lib/queryClient";
import useAuthStore from "../../store/store";
import { clearAllMusicWorkspaceQueries } from "../../hooks/useTunesDashboard";
import { musicApi, musicIdentityCoordinator } from "./musicApi";
import { clearMusicPublicationCommands } from "./musicPublicationCommandRegistry";

export type MusicSessionEventKind = "logout" | "account-generation";

interface MusicSessionEvent {
  version: "music-session/v1";
  kind: MusicSessionEventKind;
  eventId: string;
}

interface ChannelLike {
  postMessage(value: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export async function resetMusicSessionAuthority(dependencies: {
  clearAuth: () => void;
  resetCoordinator: () => void;
  clearCredential: () => void;
  clearIdentityQueries: () => Promise<void>;
  clearPublicationCommands: () => void;
}): Promise<void> {
  dependencies.clearAuth();
  dependencies.resetCoordinator();
  dependencies.clearCredential();
  dependencies.clearPublicationCommands();
  await dependencies.clearIdentityQueries();
}

export async function resetMusicSessionRealm(kind: MusicSessionEventKind, dependencies: {
  clearMusicAuth: () => void;
  logoutExplorer: () => void;
  resetCoordinator: () => void;
  clearCredential: () => void;
  clearIdentityQueries: () => Promise<void>;
  clearPublicationCommands: () => void;
}): Promise<void> {
  if (kind === "logout") dependencies.logoutExplorer();
  await resetMusicSessionAuthority({
    clearAuth: dependencies.clearMusicAuth,
    resetCoordinator: dependencies.resetCoordinator,
    clearCredential: dependencies.clearCredential,
    clearIdentityQueries: dependencies.clearIdentityQueries,
    clearPublicationCommands: dependencies.clearPublicationCommands,
  });
}

function isSessionEvent(value: unknown): value is MusicSessionEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MusicSessionEvent>;
  return candidate.version === "music-session/v1"
    && (candidate.kind === "logout" || candidate.kind === "account-generation")
    && typeof candidate.eventId === "string" && candidate.eventId.length > 0;
}

export function createMusicSessionBoundary(dependencies: {
  channelFactory?: () => ChannelLike | undefined;
  onReset: (kind: MusicSessionEventKind) => void | Promise<void>;
  eventId?: () => string;
  storage?: Pick<Storage, "setItem" | "removeItem">;
  addStorageListener?: (listener: (event: StorageEvent) => void) => void;
  removeStorageListener?: (listener: (event: StorageEvent) => void) => void;
}) {
  const key = "explorers-music-session";
  const channel = dependencies.channelFactory?.();
  const seen = new Set<string>();
  const accountGenerationListeners = new Set<() => void>();
  let accountGeneration = 0;
  const remember = (eventId: string) => {
    seen.add(eventId);
    if (seen.size > 128) seen.delete(seen.values().next().value!);
  };
  const receive = (value: unknown) => {
    if (!isSessionEvent(value) || seen.has(value.eventId)) return;
    remember(value.eventId);
    let reset: void | Promise<void>;
    try {
      reset = dependencies.onReset(value.kind);
    } catch {
      return;
    }
    Promise.resolve(reset)
      .then(() => {
        if (value.kind !== "account-generation") return;
        accountGeneration += 1;
        for (const listener of accountGenerationListeners) listener();
      })
      .catch(() => undefined);
  };
  const onMessage = (event: { data: unknown }) => receive(event.data);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key || !event.newValue) return;
    try { receive(JSON.parse(event.newValue)); } catch { /* Ignore untrusted storage payloads. */ }
  };
  channel?.addEventListener("message", onMessage);
  dependencies.addStorageListener?.(onStorage);

  return {
    publish(kind: MusicSessionEventKind) {
      const event: MusicSessionEvent = {
        version: "music-session/v1",
        kind,
        eventId: dependencies.eventId?.() ?? crypto.randomUUID(),
      };
      remember(event.eventId);
      channel?.postMessage(event);
      if (dependencies.storage) {
        dependencies.storage.setItem(key, JSON.stringify(event));
        dependencies.storage.removeItem(key);
      }
    },
    getAccountGenerationSnapshot: () => accountGeneration,
    subscribeAccountGeneration(listener: () => void) {
      accountGenerationListeners.add(listener);
      return () => accountGenerationListeners.delete(listener);
    },
    close() {
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      dependencies.removeStorageListener?.(onStorage);
    },
  };
}

const browserBoundary = typeof window === "undefined" ? undefined : createMusicSessionBoundary({
  channelFactory: () => typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("explorers-music-session"),
  storage: window.localStorage,
  addStorageListener: (listener) => window.addEventListener("storage", listener),
  removeStorageListener: (listener) => window.removeEventListener("storage", listener),
  onReset: (kind) => {
    return resetMusicSessionRealm(kind, {
      clearMusicAuth: () => musicApi.logout(),
      logoutExplorer: () => useAuthStore.getState().logout(),
      resetCoordinator: () => musicIdentityCoordinator.reset(),
      clearCredential: clearMusicCredential,
      clearIdentityQueries: () => clearAllMusicWorkspaceQueries(queryClient),
      clearPublicationCommands: clearMusicPublicationCommands,
    });
  },
});

export const musicSessionBoundary = browserBoundary ?? {
  publish: (_kind: MusicSessionEventKind) => undefined,
  getAccountGenerationSnapshot: () => 0,
  subscribeAccountGeneration: (_listener: () => void) => () => undefined,
  close: () => undefined,
};

export function closeLocalMusicSession(): void {
  musicApi.logout();
  musicIdentityCoordinator.reset();
  clearMusicPublicationCommands();
  void clearAllMusicWorkspaceQueries(queryClient);
  musicSessionBoundary.publish("logout");
}
