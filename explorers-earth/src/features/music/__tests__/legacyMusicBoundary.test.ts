import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "src/components/AuthSyncManager.tsx",
  "src/components/MusicDashboard.tsx",
  "src/hooks/useTunesDashboard.ts",
  "src/pages/Music.tsx",
  "src/pages/OnBoarding.tsx",
  "src/pages/public/PublicMusic.tsx",
  "src/features/music/publicMusicClient.ts",
];

const retiredFiles = [
  "src/features/Settings/components/ConnectedAccounts.tsx",
  "src/lib/apiClient.ts",
  "src/services/localTunesService.ts",
  "src/services/ssoService.ts",
  "src/pages/TunesSsoRedirect.tsx",
];

describe("retired browser Music authority boundary", () => {
  it("contains no legacy identity, owner-target, persistence, or native login surface", () => {
    const source = files.map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
    for (const forbidden of [
      "X-Username", "x-username", "?username=",
      "/api/auth/sync", "/auth?tab=login", "Connect to Local Tunes",
      "localTunes_session", "localtunes_cross_domain_auth", "localtunes_sync_done",
      "document.cookie", "changeLocalTunesPassword", "createLocalTunesUser",
    ]) expect(source).not.toContain(forbidden);
    for (const retired of retiredFiles) expect(existsSync(resolve(process.cwd(), retired))).toBe(false);
  });

  it("ships no legacy callback/cookie-setter artifact or dead LocalTunes translation copy", () => {
    expect(existsSync(resolve(process.cwd(), "public/localtunes-sso-callback.html"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "public/localtunes-cookie-setter.html"))).toBe(false);
    const resources = resolve(process.cwd(), "src/i18n/resources");
    for (const file of readdirSync(resources).filter((name) => name.endsWith(".json"))) {
      const serialized = JSON.stringify(JSON.parse(readFileSync(resolve(resources, file), "utf8")));
      expect(serialized, file).not.toMatch(/LocalTunes|localTunes|syncingLocalTunes/);
    }
  });

  it("allows the friendly presentation route without making username Music authority", () => {
    const publicNav = readFileSync(resolve(process.cwd(), "src/components/PublicNav.tsx"), "utf8");
    const publicRoutes = readFileSync(resolve(process.cwd(), "src/routes/PublicRoutes.tsx"), "utf8");
    const profileMusic = readFileSync(resolve(process.cwd(), "src/pages/public/ProfileMusic.tsx"), "utf8");

    expect(publicNav).toContain("appendAttributionParamsToPath(`/${username}/music`, location.search)");
    expect(publicRoutes).toContain("PublicMusicVisibilityBoundary");
    expect(publicRoutes).toContain('<Route path="music"');
    expect(profileMusic).toContain("descriptorSlug");
    expect(profileMusic).not.toMatch(/publicMusicClient\.(?:load|discover)\(username/);
  });

  it("hands completed onboarding back to the sole eligibility observer without a second ensure trigger", () => {
    const onboarding = readFileSync(resolve(process.cwd(), "src/pages/OnBoarding.tsx"), "utf8");
    expect(onboarding).toContain('const refetch = canonicalAccount.refetch');
    expect(onboarding).toMatch(/await explorersApiClient\.updateAccount\([\s\S]*?onboardingStatus: "complete"[\s\S]*?await refetch\(\);[\s\S]*?navigate\("\/home"\)/);
    expect(onboarding).not.toContain("musicIdentityCoordinator.");
    expect(onboarding).not.toContain("ensureIdentity");
  });

  it("keeps named authenticated surfaces off positional Account selection", () => {
    const accountConsumers = [
      "src/components/ProtectedRoute.tsx",
      "src/components/AuthSyncManager.tsx",
      "src/pages/Music.tsx",
      "src/pages/Home.tsx",
      "src/pages/OnBoarding.tsx",
      "src/pages/Profile.tsx",
      "src/features/Settings/Settings.tsx",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
    expect(accountConsumers).not.toMatch(/accounts\s*\?*\.\s*\[\s*0\s*\]|accounts\s*\[\s*0\s*\]/);
  });

  it("keeps onboarding and profile Account authority off mutable username and first REST result", () => {
    const accountMutations = [
      "src/pages/OnBoarding.tsx",
      "src/pages/Profile.tsx",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
    expect(accountMutations).not.toMatch(/\/accounts\?filters[^\n`]*username/i);
    expect(accountMutations).not.toMatch(/account(?:FetchResponse|Response|Check)\.data\.data\s*\[\s*0\s*\]/);
  });
});
