import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { usePublicProfileShell } from "../PublicHome/api/usePublicProfileShell";
import { publicMusicClient, PublicMusicError, type PublicMusicDescriptor } from "./publicMusicClient";

export type AvailabilityState = "loading" | "available" | "revalidating" | "revoked" | "not-public" | "unavailable";
type Availability = { state: AvailabilityState; account?: Record<string, any>; descriptor?: PublicMusicDescriptor; retryAfterSeconds?: number; retry: () => void };
type AccountState = { accountId?: string; state: AvailabilityState; descriptor?: PublicMusicDescriptor; retryAfterSeconds?: number };
export type PublicAccountIdentity = {
  usernameKey: string;
  status: "loading" | "ready" | "terminal-error";
  account?: Record<string, any>;
  error?: unknown;
};
const AvailabilityContext = createContext<Availability | null>(null);
const AccountIdentityContext = createContext<PublicAccountIdentity | null>(null);
const unavailableOutsideProfileShell: Availability = { state: "unavailable", retry: () => undefined };
export const PUBLIC_MUSIC_DESCRIPTOR_MAX_AGE_MS = 30_000;
const PUBLIC_MUSIC_RECOVERY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;
const PUBLICATION_VERIFIED = "explorers-music-publication-verified/v1";

async function discoverPublicMusicWithSingleTransientRetry(accountId: string, signal: AbortSignal): Promise<PublicMusicDescriptor> {
  try {
    return await publicMusicClient.discover(accountId, signal);
  } catch (reason) {
    if (signal.aborted || !(reason instanceof PublicMusicError) || reason.code !== "PUBLIC_UNAVAILABLE") throw reason;
    return publicMusicClient.discover(accountId, signal);
  }
}

/** Invalidation only, never publication authority or a share capability. */
export function notifyMusicPublicationVerified(accountDocumentId: string) {
  const detail = { version: 1, accountDocumentId, eventId: crypto.randomUUID() };
  window.dispatchEvent(new CustomEvent(PUBLICATION_VERIFIED, { detail }));
  try { window.localStorage.setItem(PUBLICATION_VERIFIED, JSON.stringify(detail)); window.localStorage.removeItem(PUBLICATION_VERIFIED); } catch { /* Focus revalidation remains available. */ }
}

export function subscribePublicationVerified(accountId: string | undefined, refresh: () => void) {
  const receive = (value: unknown) => {
    const event = value as { version?: unknown; accountDocumentId?: unknown; eventId?: unknown } | null;
    if (accountId && event?.version === 1 && event.accountDocumentId === accountId && typeof event.eventId === 'string') refresh();
  };
  const local = (event: Event) => receive((event as CustomEvent).detail);
  const remote = (event: StorageEvent) => {
    if (event.key !== PUBLICATION_VERIFIED || !event.newValue) return;
    try { receive(JSON.parse(event.newValue)); } catch { /* Untrusted invalidation. */ }
  };
  window.addEventListener(PUBLICATION_VERIFIED, local); window.addEventListener('storage', remote);
  return () => { window.removeEventListener(PUBLICATION_VERIFIED, local); window.removeEventListener('storage', remote); };
}

// Owner controls keep the saved preference separate from discoverable publication.
// This read-only probe never publishes Music or changes account preferences.
export function useOwnerMusicAvailability(accountId?: string, preference?: unknown) {
  const [attempt, setAttempt] = useState(0);
  const [resolved, setResolved] = useState<AccountState>({ state: "loading" });
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => subscribePublicationVerified(accountId, retry), [accountId, retry]);
  useEffect(() => {
    const controller = new AbortController();
    if (!accountId || preference !== "Yes") {
      setResolved({ accountId, state: "not-public" });
      return () => controller.abort();
    }
    setResolved(previous => previous.accountId === accountId && previous.descriptor
      ? { ...previous, state: "revalidating" } : { accountId, state: "loading" });
    publicMusicClient.discover(accountId, controller.signal).then(descriptor => {
      if (!controller.signal.aborted) setResolved({ accountId, state: "available", descriptor });
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      const code = (reason as { code?: string } | null)?.code;
      setResolved({ accountId, state: code === "PUBLIC_NOT_FOUND" ? "not-public" : "unavailable" });
    });
    return () => controller.abort();
  }, [accountId, preference, attempt]);
  useEffect(() => {
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    const timer = window.setInterval(retry, PUBLIC_MUSIC_DESCRIPTOR_MAX_AGE_MS);
    return () => { window.removeEventListener("online", retry); window.removeEventListener("focus", retry); window.clearInterval(timer); };
  }, [retry]);
  const state: AvailabilityState = preference !== "Yes" ? "not-public" : resolved.accountId === accountId ? resolved.state : "loading";
  return { state, retry };
}

export function PublicMusicAvailabilityProvider({ children }: { children: ReactNode }) {
  const { username } = useParams();
  const usernameKey = (username ?? "").trim().toLowerCase();
  const [attempt, setAttempt] = useState(0);
  const [resolved, setResolved] = useState<AccountState>({ state: "loading" });
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;
  const generation = useRef(0);
  const revocationTimer = useRef<number>();
  const recoveryTimer = useRef<number>();
  const recoveryAttempt = useRef(0);
  const { data, loading, error, refetch } = usePublicProfileShell(usernameKey);
  const account = data as Record<string, any> | undefined;
  const accountMatches = typeof account?.username === "string"
    && account.username.trim().toLowerCase() === usernameKey;
  const accountIdentity = useMemo<PublicAccountIdentity>(() => ({
    usernameKey,
    status: accountMatches ? "ready" : loading ? "loading" : "terminal-error",
    ...(accountMatches ? { account } : {}),
    ...(!accountMatches && !loading && error ? { error } : {}),
  }), [account, accountMatches, error, loading, usernameKey]);
  const accountId = typeof account?.documentId === "string" ? account.documentId : undefined;

  const invalidate = useCallback(() => {
    generation.current += 1;
    if (revocationTimer.current !== undefined) window.clearTimeout(revocationTimer.current);
    revocationTimer.current = undefined;
    if (recoveryTimer.current !== undefined) window.clearTimeout(recoveryTimer.current);
    recoveryTimer.current = undefined;
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const requestGeneration = ++generation.current;
    if (revocationTimer.current !== undefined) window.clearTimeout(revocationTimer.current);
    revocationTimer.current = undefined;
    const controller = new AbortController();
    const current = resolvedRef.current.accountId === accountId ? resolvedRef.current : undefined;
    const staleDescriptor = current?.descriptor;
    const commit = (next: AccountState) => {
      if (!controller.signal.aborted && generation.current === requestGeneration) setResolved(next);
    };
    if (loading) { if (!staleDescriptor) commit({ accountId, state: "loading" }); return () => controller.abort(); }
    if (error || !accountId) { commit({ accountId, state: "unavailable" }); return () => controller.abort(); }
    if (account?.public_music !== "Yes") { commit({ accountId, state: "not-public" }); return () => controller.abort(); }
    commit({ accountId, state: staleDescriptor ? "revalidating" : "loading", descriptor: staleDescriptor });
    discoverPublicMusicWithSingleTransientRetry(accountId, controller.signal).then((descriptor) => {
      recoveryAttempt.current = 0;
      commit({ accountId, state: "available", descriptor });
    }).catch((reason: unknown) => {
      const code = reason instanceof PublicMusicError ? reason.code : undefined;
      if (code === "PUBLIC_NOT_FOUND" && staleDescriptor && !controller.signal.aborted && generation.current === requestGeneration) {
        setResolved({ accountId, state: "revoked", descriptor: staleDescriptor });
        revocationTimer.current = window.setTimeout(() => {
          if (generation.current === requestGeneration) setResolved({ accountId, state: "not-public" });
          revocationTimer.current = undefined;
        }, 0);
      } else if (staleDescriptor && code !== "PUBLIC_NOT_FOUND" && !controller.signal.aborted && generation.current === requestGeneration) {
        commit({ accountId, state: "revalidating", descriptor: staleDescriptor });
        const backoff = PUBLIC_MUSIC_RECOVERY_BACKOFF_MS[Math.min(recoveryAttempt.current, PUBLIC_MUSIC_RECOVERY_BACKOFF_MS.length - 1)];
        const retryAfter = reason instanceof PublicMusicError && code === "RATE_LIMITED"
          ? Math.min(300_000, Math.max(0, (reason.retryAfterSeconds ?? 60) * 1_000)) : 0;
        recoveryAttempt.current = Math.min(recoveryAttempt.current + 1, PUBLIC_MUSIC_RECOVERY_BACKOFF_MS.length - 1);
        recoveryTimer.current = window.setTimeout(() => {
          recoveryTimer.current = undefined;
          invalidate();
        }, Math.max(backoff, retryAfter));
      } else commit({ accountId, state: code === "PUBLIC_NOT_FOUND" ? "not-public" : "unavailable",
        ...(reason instanceof PublicMusicError && code === "RATE_LIMITED" ? { retryAfterSeconds: reason.retryAfterSeconds ?? 60 } : {}) });
    });
    return () => {
      controller.abort();
      if (revocationTimer.current !== undefined) window.clearTimeout(revocationTimer.current);
      if (recoveryTimer.current !== undefined) window.clearTimeout(recoveryTimer.current);
      revocationTimer.current = undefined;
      recoveryTimer.current = undefined;
    };
  }, [accountId, account?.public_music, attempt, error, loading]);

  useEffect(() => {
    if (resolved.accountId !== accountId || resolved.state !== "available") return;
    const timer = window.setTimeout(invalidate, PUBLIC_MUSIC_DESCRIPTOR_MAX_AGE_MS);
    return () => window.clearTimeout(timer);
  }, [accountId, invalidate, resolved.accountId, resolved.descriptor?.publication.revision, resolved.state]);
  const refresh = useCallback(() => {
    invalidate();
    // A previously hidden account also needs a fresh profile flag, not only a descriptor.
    void refetch?.().catch(() => undefined);
  }, [invalidate, refetch]);
  useEffect(() => {
    window.addEventListener("online", refresh); window.addEventListener("focus", refresh);
    const unsubscribe = subscribePublicationVerified(accountId, refresh);
    return () => { window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); unsubscribe(); };
  }, [accountId, refresh]);

  const keyed = resolved.accountId === accountId;
  // Apollo may retain the previous username's account while the new query loads.
  // Cached terminal state cannot authorize a redirect or unavailable acknowledgement.
  const state: AvailabilityState = loading ? keyed && resolved.descriptor ? "revalidating" : "loading"
    : keyed ? resolved.state : account?.public_music === "No" ? "not-public" : "loading";
  const descriptor = keyed ? resolved.descriptor : undefined;
  const retryAfterSeconds = keyed ? resolved.retryAfterSeconds : undefined;
  const value = useMemo(() => ({ state, account, descriptor, retryAfterSeconds, retry: refresh }), [account, descriptor, refresh, retryAfterSeconds, state]);
  return <AccountIdentityContext.Provider value={accountIdentity}>
    <AvailabilityContext.Provider value={value}>{children}</AvailabilityContext.Provider>
  </AccountIdentityContext.Provider>;
}

export function usePublicMusicAvailability(): Availability {
  return useContext(AvailabilityContext) ?? unavailableOutsideProfileShell;
}

export function usePublicAccountIdentity(): PublicAccountIdentity {
  return useContext(AccountIdentityContext) ?? { usernameKey: "", status: "terminal-error" };
}
