import useAuthStore from "../store/store";

type AuthSession = { user?: { id?: string; email?: string }; session?: { id?: string } } | null;
type CanonicalAccount = { id: string; handle: string | null; onboardingStatus: "incomplete" | "complete"; revision: number };

async function jsonOrNull(response: Response) { return response.json().catch(() => null); }

export const authClient = {
  async refresh(): Promise<void> {
    localStorage.removeItem("qrtoken");
    localStorage.removeItem("auth-storage");
    if (useAuthStore.getState().logoutError || localStorage.getItem("explorers-logout-pending")) {
      const current = useAuthStore.getState();
      current.verificationFailed(current.generation, "signed-out");
      return;
    }
    const generation = useAuthStore.getState().beginVerification();
    try {
      const sessionResponse = await fetch("/api/auth/get-session", { credentials: "include", cache: "no-store" });
      if (sessionResponse.status === 401) { useAuthStore.getState().verificationFailed(generation, "signed-out"); return; }
      if (!sessionResponse.ok) throw new Error("Session service is unavailable");
      const session = await jsonOrNull(sessionResponse) as AuthSession;
      if (useAuthStore.getState().generation !== generation) return;
      if (!session?.user?.id || !session.session?.id) {
        useAuthStore.getState().verificationFailed(generation, "signed-out"); return;
      }
      const accountResponse = await fetch("/api/explorers/v1/me", { credentials: "include", cache: "no-store" });
      if (accountResponse.status === 401) { useAuthStore.getState().verificationFailed(generation, "signed-out"); return; }
      if (accountResponse.status === 403) { useAuthStore.getState().verificationFailed(generation, "terminal"); return; }
      if (!accountResponse.ok) throw new Error("Account service is unavailable");
      const body = await jsonOrNull(accountResponse) as { account?: CanonicalAccount } | null;
      if (useAuthStore.getState().generation !== generation) return;
      const account = body?.account;
      if (!account?.id || !["incomplete", "complete"].includes(account.onboardingStatus)) throw new Error("Account response is invalid");
      useAuthStore.getState().acceptVerified(generation, {
        id: account.id, userId: session.user.id, username: account.handle ?? "", email: session.user.email ?? "",
        onboardingStatus: account.onboardingStatus, revision: account.revision,
      });
    } catch { useAuthStore.getState().verificationFailed(generation, "error"); }
  },
  async startGoogleSignIn(recovery = false): Promise<void> {
    if (useAuthStore.getState().logoutError || localStorage.getItem("explorers-logout-pending"))
      throw new Error("Finish signing out first");
    localStorage.removeItem("qrtoken");
    localStorage.removeItem("auth-storage");
    const generation = useAuthStore.getState().beginVerification();
    try {
      if (recovery) {
        const started = await fetch("/api/explorers/v1/recovery/start", { method: "POST", credentials: "include" });
        if (!started.ok) throw new Error("Recovery is unavailable");
      }
      const callbackURL = recovery ? "/reactivate-confirm" : "/google-auth/callback";
      const response = await fetch("/api/auth/sign-in/social", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL, errorCallbackURL: callbackURL }) });
      const body = await jsonOrNull(response) as { url?: string } | null;
      if (!response.ok || !body?.url) throw new Error("Google sign-in could not start");
      const target = new URL(body.url, window.location.origin);
      if (target.protocol !== "https:" && !(import.meta.env.DEV && target.protocol === "http:")) {
        throw new Error("Google sign-in destination is invalid");
      }
      window.location.assign(target.href);
    } catch (error) {
      useAuthStore.getState().verificationFailed(generation, "error");
      throw error;
    }
  },
  async signOut(): Promise<void> {
    const response = await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    if (!response.ok) throw new Error("Server sign-out failed");
  },
};
