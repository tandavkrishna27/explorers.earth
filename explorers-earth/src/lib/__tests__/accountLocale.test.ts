import i18n from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../../store/store";
import { adoptAccountLocale, persistAccountLocale, SHIPPED_LOCALES } from "../accountLocale";

function signIn() {
  const generation = useAuthStore.getState().beginVerification();
  useAuthStore.getState().acceptVerified(generation, { id: "account-a", userId: "user-a", username: "alice",
    email: "a@example.invalid", onboardingStatus: "complete", revision: 4 });
}

function account(locale: string, revision = 4) {
  return { account: { id: "account-a", handle: "alice", onboardingStatus: "complete", revision, locale } };
}

describe("account locale", () => {
  beforeEach(() => { useAuthStore.getState().setLogoutError(false); useAuthStore.getState().logout(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("ships every bundle in i18n/resources, not just en and hi", () => {
    // Break caught: the account contract once enumerated ["en","hi"] while 47 bundles shipped.
    expect(SHIPPED_LOCALES.size).toBe(47);
    for (const code of ["en", "hi", "zh", "ar", "ne", "sw"]) expect(SHIPPED_LOCALES.has(code)).toBe(true);
  });

  it("persists a chosen language to the signed-in account", async () => {
    // Break caught: LanguageSelector only called i18n.changeLanguage, so the choice lived in
    // one browser's localStorage and every other device opened in English.
    signIn();
    const requests: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(init?.method === "PATCH" ? account("hi", 5) : account("en")), { status: 200 });
    }));
    await persistAccountLocale("hi");
    expect(requests).toEqual([
      { url: "/api/explorers/v1/me", method: "GET", body: undefined },
      { url: "/api/explorers/v1/account", method: "PATCH", body: { expectedRevision: 4, locale: "hi" } },
    ]);
  });

  it("writes nothing when signed out, unchanged, or not a shipped bundle", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(account("hi")), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await persistAccountLocale("hi");
    expect(fetch).not.toHaveBeenCalled();
    signIn();
    await persistAccountLocale("xx");
    expect(fetch).not.toHaveBeenCalled();
    await persistAccountLocale("hi");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("adopts a saved non-default locale on sign-in", async () => {
    const change = vi.spyOn(i18n, "changeLanguage").mockResolvedValue((() => "") as never);
    await adoptAccountLocale("hi");
    expect(change).toHaveBeenCalledWith("hi");
  });

  it("does not let the 'en' column default override a local choice, or adopt an unshipped code", async () => {
    // 'en' is the column default, so it cannot be told apart from "never chose"; treating it
    // as a choice would undo a language the visitor picked before signing in.
    const change = vi.spyOn(i18n, "changeLanguage").mockResolvedValue((() => "") as never);
    await adoptAccountLocale("en");
    await adoptAccountLocale("xx");
    await adoptAccountLocale(undefined);
    expect(change).not.toHaveBeenCalled();
  });
});
