import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";

// types for authentication
interface AuthState {
  status: "loading" | "signed-out" | "active-incomplete" | "active-complete" | "recovery-only" | "terminal" | "error";
  generation: number;
  accountId: string | null;
  /** Set only while status is "terminal" for a pending deletion: when it becomes final unless cancelled. */
  scheduledDeletionAt: string | null;
  logoutError: boolean;
  logoutAttemptId: string | null;
  isAuthenticated: boolean;
  user: {
    id: string;
    documentId: string;
    username: string;
    email: string;
    blocked: boolean;
  } | null;
  token: string | null;
  beginVerification: () => number;
  acceptVerified: (generation: number, account: { id: string; userId: string; username: string; email: string;
    onboardingStatus: "incomplete" | "complete"; revision: number }) => void;
  verificationFailed: (generation: number, status: "signed-out" | "recovery-only" | "terminal" | "error",
    scheduledDeletionAt?: string | null) => void;
  setLogoutError: (failed: boolean, attemptId?: string | null) => string | null;
  login: (data: {
    id: string;
    documentId: string;
    username: string;
    email: string;
    blocked: boolean;
    token: string;
  }) => void;
  logout: () => void;
  updateUsername: (username: string) => void;
  updateUserBlocked: (blocked: boolean) => void;
}

const logoutMarker = "explorers-logout-pending";
function pendingServerLogout(): string | null {
  if (typeof localStorage === "undefined") return null;
  const current = localStorage.getItem(logoutMarker);
  if (current) return current;
  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("explorers-logout-pending") === "1") {
    const migrated = crypto.randomUUID();
    localStorage.setItem(logoutMarker, migrated);
    return migrated;
  }
  return null;
}

const initialLogoutAttempt = pendingServerLogout();

// Public pages promise anonymous, storage-less visits, so the persisted auth record exists
// only while someone is signed in. persist() writes after every set(), so the store's state
// here is already the new one: signing out removes the record instead of rewriting it.
let hasSession = () => false;
// Storage may be absent (Node, the SPA client under server tests) or throw (blocked site
// data); either way the store keeps working in memory.
const localStore = (): Storage | undefined => {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
};
const sessionGatedStorage: StateStorage = {
  getItem: (name) => { try { return localStore()?.getItem(name) ?? null; } catch { return null; } },
  setItem: (name, value) => {
    try {
      if (hasSession()) localStore()?.setItem(name, value);
      else localStore()?.removeItem(name);
    } catch { /* persistence is best-effort */ }
  },
  removeItem: (name) => { try { localStore()?.removeItem(name); } catch { /* best-effort */ } },
};

const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // initial state
      status: "loading",
      generation: 0,
      accountId: null,
      scheduledDeletionAt: null,
      logoutError: initialLogoutAttempt !== null,
      logoutAttemptId: initialLogoutAttempt,
      token: null,
      isAuthenticated: false,
      user: null,

      beginVerification: () => {
        const generation = get().generation + 1;
        set({ generation, status: "loading", isAuthenticated: false, accountId: null, scheduledDeletionAt: null, token: null, user: null });
        return generation;
      },
      acceptVerified: (generation, account) => {
        if (get().generation !== generation || get().status !== "loading") return;
        set({ status: account.onboardingStatus === "complete" ? "active-complete" : "active-incomplete",
          accountId: account.id, isAuthenticated: true, token: null,
          // documentId is the *user* document id, which is what the legacy
          // `usersPermissionsUser(documentId:)` consumers pass it as. Setting it to the
          // account id made every one of them query a user by an account id, which the
          // contained E2E owner guard rejects as a wrong owner subject. The canonical
          // account id is `accountId`, above.
          user: { id: account.userId, documentId: account.userId, username: account.username,
            email: account.email, blocked: false } });
      },
      verificationFailed: (generation, status, scheduledDeletionAt = null) => {
        if (get().generation !== generation) return;
        set({ status, accountId: null, scheduledDeletionAt: status === "terminal" ? scheduledDeletionAt : null,
          isAuthenticated: false, token: null, user: null });
      },
      setLogoutError: (failed, attemptId) => {
        const current = pendingServerLogout();
        if (!failed && attemptId && current && current !== attemptId) return current;
        const next = failed ? crypto.randomUUID() : null;
        if (typeof localStorage !== "undefined") {
          if (next) localStorage.setItem(logoutMarker, next);
          else localStorage.removeItem(logoutMarker);
        }
        if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("explorers-logout-pending");
        set({ logoutError: next !== null, logoutAttemptId: next });
        return next;
      },

      login: (data) => {
        set({
          generation: get().generation + 1,
          status: "active-complete",
          accountId: data.documentId,
          logoutError: pendingServerLogout() !== null,
          logoutAttemptId: pendingServerLogout(),
          isAuthenticated: true,
          user: {
            id: data.id,
            blocked: data.blocked,
            username: data.username,
            email: data.email,
            documentId: data.documentId,
          },
          token: data.token,
        });
      },

      logout: () => {
        set({
          generation: get().generation + 1,
          status: "signed-out",
          accountId: null,
          scheduledDeletionAt: null,
          logoutError: pendingServerLogout() !== null,
          logoutAttemptId: pendingServerLogout(),
          isAuthenticated: false,
          user: null,
          token: null,
        });
      },

      updateUsername: (username) =>
        set((state) => ({
          user: state.user ? { ...state.user, username } : null,
        })),

      // state for updating user status
      updateUserBlocked: (blocked) =>
        set((state) => ({
          user: state.user ? { ...state.user, blocked } : null,
        })),
    }),
    {
      name: "auth-storage", // key to store the state in localStorage
      // Written only while a session exists; a signed-out visitor gets nothing (ANL-01).
      storage: createJSONStorage(() => sessionGatedStorage),
      partialize: () => ({}),
      merge: (_persisted, current) => current,
    }
  )
);
hasSession = () => useAuthStore.getState().isAuthenticated;

// A logout in one tab signs out every other open tab: the session cookie they share is
// already gone, so they must not keep rendering owner pages. Both transports carry the
// same event id (BroadcastChannel where available, a storage ping everywhere), and a
// tab never receives its own BroadcastChannel post or storage event.
const sessionLogoutKey = "explorers-session-logout";
const seenSessionLogouts = new Set<string>();
const sessionLogoutChannel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel(sessionLogoutKey) : undefined;

function receiveSessionLogout(eventId: unknown): void {
  if (typeof eventId !== "string" || !eventId || seenSessionLogouts.has(eventId)) return;
  seenSessionLogouts.add(eventId);
  if (useAuthStore.getState().status !== "signed-out") useAuthStore.getState().logout();
}

export function broadcastSessionLogout(): void {
  const eventId = crypto.randomUUID();
  seenSessionLogouts.add(eventId);
  sessionLogoutChannel?.postMessage(eventId);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(sessionLogoutKey, eventId);
    localStorage.removeItem(sessionLogoutKey);
  }
}

sessionLogoutChannel?.addEventListener("message", (event) => receiveSessionLogout(event.data));

if (typeof window !== "undefined") window.addEventListener("storage", (event) => {
  if (event.key === sessionLogoutKey) { receiveSessionLogout(event.newValue); return; }
  if (event.key !== logoutMarker) return;
  const current = pendingServerLogout();
  useAuthStore.setState({ logoutError: current !== null, logoutAttemptId: current });
});

export default useAuthStore;
