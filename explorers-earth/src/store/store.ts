import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { clearMusicCredential } from "../lib/musicCredentialStore";

// types for authentication
interface AuthState {
  status: "loading" | "signed-out" | "active-incomplete" | "active-complete" | "recovery-only" | "terminal" | "error";
  generation: number;
  accountId: string | null;
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
  verificationFailed: (generation: number, status: "signed-out" | "recovery-only" | "terminal" | "error") => void;
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

const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // initial state
      status: "loading",
      generation: 0,
      accountId: null,
      logoutError: initialLogoutAttempt !== null,
      logoutAttemptId: initialLogoutAttempt,
      token: null,
      isAuthenticated: false,
      user: null,

      beginVerification: () => {
        const generation = get().generation + 1;
        clearMusicCredential();
        set({ generation, status: "loading", isAuthenticated: false, accountId: null, token: null, user: null });
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
      verificationFailed: (generation, status) => {
        if (get().generation !== generation) return;
        clearMusicCredential();
        set({ status, accountId: null, isAuthenticated: false, token: null, user: null });
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
        clearMusicCredential();
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
        clearMusicCredential();
        set({
          generation: get().generation + 1,
          status: "signed-out",
          accountId: null,
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
      storage: createJSONStorage(() => localStorage), // Use createJSONStorage for localStorage
      partialize: () => ({}),
      merge: (_persisted, current) => current,
    }
  )
);

if (typeof window !== "undefined") window.addEventListener("storage", (event) => {
  if (event.key !== logoutMarker) return;
  const current = pendingServerLogout();
  useAuthStore.setState({ logoutError: current !== null, logoutAttemptId: current });
});

export default useAuthStore;
