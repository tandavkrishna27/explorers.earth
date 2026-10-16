import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../../store/store";
import { getMusicCredential, setMusicCredential } from "../../lib/musicCredentialStore";
import Login from "../Login";
import GoogleAuthRedirect from "../GoogleAuthRedirect";

vi.mock("../../components/SEO", () => ({ default: () => null }));
vi.mock("../../components/auth/AuthLayout", () => ({ default: ({ onGoogle }: { onGoogle: () => void }) =>
  <button type="button" onClick={onGoogle}>Continue with Google</button> }));
vi.mock("../../components/EarthLoader", () => ({ EarthLoader: () => <div>Verifying account</div> }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }) }));

const priorUser = { id: "user-a", documentId: "account-a", username: "alpha", email: "alpha@example.invalid",
  blocked: false, token: "legacy-fixture" };
const signInA = () => {
  useAuthStore.getState().login(priorUser);
  setMusicCredential({ token: "account-a.music.credential", expiresAt: Date.now() + 60_000 });
};
const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/google-auth/callback" element={<GoogleAuthRedirect />} />
  <Route path="/home" element={<div>Home</div>} />
  <Route path="/onboarding" element={<div>Onboarding</div>} />
</Routes></MemoryRouter>);

beforeEach(() => { sessionStorage.clear(); useAuthStore.getState().logout(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Google login replaces Music authority centrally", () => {
  it("fences account A at sign-in initiation before any provider response", async () => {
    signInA();
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    mount("/login");
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(useAuthStore.getState().status).toBe("loading");
    expect(getMusicCredential()).toBeUndefined();
    await act(async () => finish(new Response(JSON.stringify({ url: "https://accounts.google.com/" }), { status: 200 })));
  });
  it("ignores a legacy callback token and accepts only the verified cookie session", async () => {
    signInA();
    const fetcher = vi.fn(async (path: string) => path === "/api/auth/get-session"
      ? new Response(JSON.stringify({ user: { id: "user-b" }, session: { id: "session-b" } }), { status: 200 })
      : new Response(JSON.stringify({ account: { id: "account-b", handle: "bravo", onboardingStatus: "complete", revision: 1 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    mount("/google-auth/callback?access_token=legacy-strapi-jwt");
    await waitFor(() => expect(screen.getByText("Home")).toBeInTheDocument());
    // The verified session supplies the user subject; the canonical account id lives in
    // accountId, not in user.documentId, which is the user's own document id.
    expect(useAuthStore.getState().accountId).toBe("account-b");
    expect(useAuthStore.getState().user?.id).toBe("user-b");
    expect(useAuthStore.getState().user?.documentId).toBe("user-b");
    expect(useAuthStore.getState().token).toBeNull();
    expect(getMusicCredential()).toBeUndefined();
    expect(fetcher.mock.calls.every(([path]) => !String(path).includes("legacy-strapi-jwt"))).toBe(true);
  });
});
