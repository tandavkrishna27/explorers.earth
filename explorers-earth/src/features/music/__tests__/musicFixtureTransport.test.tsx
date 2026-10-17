import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMusicDevelopmentFetch, resolveMusicSocketTransport } from "../musicDevelopmentTransport";

// Exact existing docker-compose.music-test.yml Explorer build/browser authority.
const fixtureOrigin = "http://localhost:55173";
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_LOCAL_TUNES_API_URL", fixtureOrigin);
  vi.stubGlobal("location", new URL(fixtureOrigin));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("preserves the fixture owner identity transport in the production-built local image", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ version: "music-identity/v1", identity: { musicUserId: 41, status: "active" }, credential: { token: "fixture.music.credential", expiresAt: Date.now() + 600_000 } }));
  });
  const { musicApi } = await import("../musicApi");
  musicApi.setAuthority("fixture-user");
  try { await musicApi.ensureIdentity(); } finally { musicApi.logout(); }
  // ADR-006: provisioning is a same-origin canonical route, so it is relative and
  // does not go through the Music fixture origin at all.
  expect(calls).toEqual(["/api/explorers/v1/music/identity/ensure"]);
});

it("preserves fixture public descriptor fetch", async () => {
  const calls: string[] = [];
  const descriptor = { version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "fixture-public-owner", revision: 1 } };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response(JSON.stringify(descriptor)); });
  const { publicMusicClient } = await import("../publicMusicClient");
  expect(await publicMusicClient.discover("fixture-account")).toEqual(descriptor);
  expect(calls).toEqual([`${fixtureOrigin}/api/music/public-profile/fixture-account`]);
});

it("preserves fixture lifecycle status transport", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response(JSON.stringify({ error: { code: "FIXTURE_EXPECTED" } }), { status: 503 }); });
  const { createLazyAccountLifecycleService } = await import("../../../services/lazyAccountLifecycleService");
  const client = createLazyAccountLifecycleService({ baseUrl: fixtureOrigin, getBearer: () => "fixture-strapi-token-123456" });
  await expect(client.status()).rejects.toMatchObject({ code: "FIXTURE_EXPECTED" });
  expect(calls).toEqual([`${fixtureOrigin}/api/music/identity/lifecycle/status`]);
});

it("preserves consented fixture analytics default transport", async () => {
  const calls: string[] = [];
  localStorage.setItem("explorers-cookie-consent", JSON.stringify({ analytics: true }));
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response(null, { status: 201 }); });
  const { usePublicMusicProductAnalytics } = await import("../publicMusicAnalytics");
  const { result } = renderHook(() => usePublicMusicProductAnalytics({ publicSlug: "fixture-public-owner", route: "friendly" }));
  await act(async () => { await result.current({ name: "playlist_opened" }, "fixture-occurrence-123"); });
  expect(calls).toEqual([`${fixtureOrigin}/api/explorers/analytics/music/fixture-public-owner/events`]);
});

it("preserves the fixture socket/polling same-origin path", () => {
  expect(resolveMusicSocketTransport({ development: false, musicOrigin: fixtureOrigin, browserOrigin: fixtureOrigin }))
    .toEqual({ origin: fixtureOrigin, path: "/ws" });
});

it.each(["https://explorers.earth", "http://localhost:5173", "http://127.0.0.1:55173", "http://localhost:55174"])("rejects fixture transport from a nonfixture actual browser origin %s", async (browserOrigin) => {
  vi.stubGlobal("location", new URL(browserOrigin));
  const fetcher = vi.fn();
  await expect(createMusicDevelopmentFetch(fetcher, false, fixtureOrigin)(`${fixtureOrigin}/api/music/identity/ensure`)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  // Passing a forged browserOrigin argument cannot override the actual location.
  expect(() => resolveMusicSocketTransport({ development: false, musicOrigin: fixtureOrigin, browserOrigin: fixtureOrigin })).toThrow();
});

it.each(["http://localhost:5000", "http://localhost:55174", "http://127.0.0.1:55173", "http://remote.example", "http://user@localhost:55173"])("rejects a different cleartext target even inside the fixture browser: %s", async (origin) => {
  const fetcher = vi.fn();
  await expect(createMusicDevelopmentFetch(fetcher, false, origin)(`${origin}/api/music`)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
