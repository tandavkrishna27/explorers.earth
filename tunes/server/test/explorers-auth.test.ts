import { describe, expect, it } from "vitest";
import { resolveExplorersAuthConfig, isAllowedAuthReturnUrl } from "../auth/betterAuth";
import { selectApiMode } from "../apiMode";

const valid = {
  EXPLORERS_PUBLIC_ORIGIN: "https://qa.explorers.earth",
  EXPLORERS_AUTH_SECRET: "a".repeat(48),
  GOOGLE_CLIENT_ID: "local-test-client",
  GOOGLE_CLIENT_SECRET: "local-test-secret",
};

describe("Google auth configuration", () => {
  it("derives the exact callback and trusts only the configured origin", () => {
    const config = resolveExplorersAuthConfig(valid);
    expect(config.baseURL).toBe("https://qa.explorers.earth");
    expect(config.googleCallbackURL).toBe("https://qa.explorers.earth/api/auth/callback/google");
    expect(config.trustedOrigins).toEqual(["https://qa.explorers.earth"]);
  });

  it.each([
    "https://user:password@qa.explorers.earth",
    "https://qa.explorers.earth/path",
    "http://qa.explorers.earth",
    "https://qa.explorers.earth?foo=bar",
  ])("rejects an unapproved origin %s", (origin) => {
    expect(() => resolveExplorersAuthConfig({ ...valid, EXPLORERS_PUBLIC_ORIGIN: origin })).toThrow();
  });

  it("only permits local same-origin callback paths", () => {
    const config = resolveExplorersAuthConfig(valid);
    expect(isAllowedAuthReturnUrl("/app/profile", config)).toBe(true);
    expect(isAllowedAuthReturnUrl("https://qa.explorers.earth/app/profile", config)).toBe(true);
    expect(isAllowedAuthReturnUrl("//evil.example/", config)).toBe(false);
    expect(isAllowedAuthReturnUrl("https://evil.example/", config)).toBe(false);
    expect(isAllowedAuthReturnUrl("/api/auth/callback/google", config)).toBe(false);
  });
});

describe("API startup mode", () => {
  it("requires an explicit canonical or temporary legacy selection", () => {
    expect(selectApiMode({ EXPLORERS_API_MODE: "canonical" })).toBe("canonical");
    expect(selectApiMode({ EXPLORERS_API_MODE: "legacy-music" })).toBe("legacy-music");
    expect(() => selectApiMode({})).toThrow();
  });
});
