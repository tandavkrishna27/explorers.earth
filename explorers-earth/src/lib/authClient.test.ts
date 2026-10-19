import i18n from "i18next";
import "../i18n/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../store/store";
import { authClient } from "./authClient";

describe("verified browser session", () => {
  beforeEach(() => { useAuthStore.getState().setLogoutError(false); useAuthStore.getState().logout(); vi.restoreAllMocks(); });

  it("loads a Better Auth session and canonical account before exposing owner access", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      calls.push(input);
      if (input === "/api/auth/get-session") return new Response(JSON.stringify({ user: { id: "user-a", email: "a@example.invalid" }, session: { id: "session-a" } }), { status: 200 });
      return new Response(JSON.stringify({ account: { id: "account-a", handle: "alice", onboardingStatus: "complete", revision: 1 } }), { status: 200 });
    }));
    await authClient.refresh();
    expect(calls).toEqual(["/api/auth/get-session", "/api/explorers/v1/me"]);
    expect(useAuthStore.getState()).toMatchObject({ status: "active-complete", isAuthenticated: true, accountId: "account-a", token: null });
    expect(localStorage.getItem("qrtoken")).toBeNull();
  });

  it("saves the visitor's current language on a never-onboarded account instead of overriding it", async () => {
    await i18n.changeLanguage("hi");
    const change = vi.spyOn(i18n, "changeLanguage");
    const patches: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/auth/get-session") return new Response(JSON.stringify({ user: { id: "user-a", email: "a@example.invalid" }, session: { id: "session-a" } }), { status: 200 });
      if (init?.method === "PATCH") { patches.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ account: { id: "account-a", onboardingStatus: "incomplete", revision: 2, locale: "hi" } }), { status: 200 }); }
      return new Response(JSON.stringify({ account: { id: "account-a", onboardingStatus: "incomplete", revision: 1, locale: "en" } }), { status: 200 });
    }));
    await authClient.refresh();
    await vi.waitFor(() => expect(patches).toEqual([{ expectedRevision: 1, locale: "hi" }]));
    expect(change).not.toHaveBeenCalled();
    await i18n.changeLanguage("en");
  });

  it("applies the account's saved locale once the session is verified", async () => {
    const change = vi.spyOn(i18n, "changeLanguage").mockResolvedValue((() => "") as never);
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input === "/api/auth/get-session") return new Response(JSON.stringify({ user: { id: "user-a", email: "a@example.invalid" }, session: { id: "session-a" } }), { status: 200 });
      return new Response(JSON.stringify({ account: { id: "account-a", handle: "alice", onboardingStatus: "complete", revision: 1, locale: "fr" } }), { status: 200 });
    }));
    await authClient.refresh();
    expect(useAuthStore.getState().status).toBe("active-complete");
    expect(change).toHaveBeenCalledWith("fr");
  });

  it("ignores a response from a previous session generation", async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const pending = authClient.refresh();
    useAuthStore.getState().logout();
    release(new Response(JSON.stringify({ user: { id: "user-a" }, session: { id: "old" } }), { status: 200 }));
    await pending;
    expect(useAuthStore.getState().status).toBe("signed-out");
  });

  it("does not treat a provider outage as sign-out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await authClient.refresh();
    expect(useAuthStore.getState().status).toBe("error");
  });

  it("ends a failed Google-start generation in a retryable routed state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    await expect(authClient.startGoogleSignIn()).rejects.toThrow("Google sign-in could not start");
    expect(useAuthStore.getState()).toMatchObject({ status: "error", isAuthenticated: false });
  });

  it("does not let an old Google-start failure overwrite a later generation", async () => {
    let reject!: (error: Error) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_resolve, fail) => { reject = fail; })));
    const pending = authClient.startGoogleSignIn();
    useAuthStore.getState().logout();
    reject(new Error("offline"));
    await expect(pending).rejects.toThrow("offline");
    expect(useAuthStore.getState().status).toBe("signed-out");
  });

  it("only clears the logout failure for the matching attempt", () => {
    const first = useAuthStore.getState().setLogoutError(true);
    const second = useAuthStore.getState().setLogoutError(true);
    expect(first).not.toBe(second);
    useAuthStore.getState().setLogoutError(false, first);
    expect(useAuthStore.getState()).toMatchObject({ logoutError: true, logoutAttemptId: second });
    expect(localStorage.getItem("explorers-logout-pending")).toBe(second);
    useAuthStore.getState().setLogoutError(false, second);
    expect(useAuthStore.getState().logoutError).toBe(false);
  });
});
