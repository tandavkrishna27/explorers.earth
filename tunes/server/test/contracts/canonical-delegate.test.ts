import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isCanonicalDelegatedPath } from "../../auth/canonicalDelegate";
import { selectApiMode } from "../../apiMode";
import { CANONICAL_ROUTES } from "../../../../scripts/replatform-route-parity";

const repoRoot = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

/**
 * The two halves of the combined-fixture repair, each asserted where it can be
 * asserted without a container: the in-process delegation boundary, and the
 * ingress rules in front of it. Neither half is sufficient alone — a perfect
 * in-container composition still fails every canonical probe if nginx sends the
 * path to Strapi or to the SPA shell.
 */
describe("combined fixture canonical delegation", () => {
  it("accepts combined as an explicit startup selection and still demands one", () => {
    expect(selectApiMode({ EXPLORERS_API_MODE: "combined" })).toBe("combined");
    expect(selectApiMode({ EXPLORERS_API_MODE: "canonical" })).toBe("canonical");
    expect(selectApiMode({ EXPLORERS_API_MODE: "legacy-music" })).toBe("legacy-music");
    expect(() => selectApiMode({})).toThrow();
    expect(() => selectApiMode({ EXPLORERS_API_MODE: "" })).toThrow();
  });

  it("delegates every canonical route the platform invariant probes", () => {
    for (const probe of CANONICAL_ROUTES) {
      expect(isCanonicalDelegatedPath(probe.path), probe.path).toBe(true);
    }
  });

  it("leaves every Music-owned probed surface on the Music composition", () => {
    for (const path of [
      "/api/check",
      "/api/csrf-token",
      "/api/user/reactivate",
      "/api/explorers/analytics/events",
      "/api/explorers/analytics/summary",
      "/api/music-fixture/readiness",
      "/api/users/me",
      "/ws",
      "/health/ready",
    ]) {
      expect(isCanonicalDelegatedPath(path), path).toBe(false);
    }
  });

  it("keeps public profile reads with their current owner, not the delegate", () => {
    // Music mounts this prefix itself and fixture ingress keeps it on Strapi.
    expect(isCanonicalDelegatedPath("/api/explorers/v1/profiles")).toBe(false);
    expect(isCanonicalDelegatedPath("/api/explorers/v1/profiles/someone")).toBe(false);
    // The sibling owner surfaces are delegated, so the exclusion is a prefix
    // carve-out and not a hole in the whole v1 surface.
    expect(isCanonicalDelegatedPath("/api/explorers/v1/collections")).toBe(true);
    expect(isCanonicalDelegatedPath("/api/explorers/v1/recommendations")).toBe(true);
  });

  it("does not delegate on a prefix that merely starts with a canonical segment", () => {
    for (const path of ["/health/liveness", "/api/authorize", "/api/explorers/v100/me"]) {
      expect(isCanonicalDelegatedPath(path), path).toBe(false);
    }
  });

  /*
   * The ordering invariant that cannot be observed from the outside: Better Auth
   * consumes the original request stream, so the delegate has to be installed
   * before the Music body parser. If these two move relative to each other, real
   * auth POSTs see a drained body while every probe above still passes.
   */
  it("installs the delegate after the payload guard and before the Music body parser", () => {
    const app = read("tunes/server/app.ts");
    const payloadGuard = app.indexOf("PAYLOAD_TOO_LARGE");
    const delegate = app.indexOf("createCanonicalDelegate");
    const bodyParser = app.indexOf("app.use(contentBodyParser())");
    expect(payloadGuard).toBeGreaterThanOrEqual(0);
    expect(delegate).toBeGreaterThan(payloadGuard);
    expect(bodyParser).toBeGreaterThan(delegate);
  });

  it("routes every canonical probe path to Tunes at fixture ingress", () => {
    const nginx = read("explorers-earth/nginx.replatform.conf");
    for (const location of [
      "location = /health/live",
      "location = /api/auth",
      "location ^~ /api/auth/",
      "location ^~ /api/explorers/v1/",
    ]) {
      expect(nginx, location).toContain(location);
    }
    // Longest matching prefix wins in nginx, so public profiles stay on Strapi.
    expect(nginx).toContain("location ^~ /api/explorers/v1/profiles/");
    expect("/api/explorers/v1/profiles/".length).toBeGreaterThan("/api/explorers/v1/".length);
  });

  it("does not synthesise an Origin header onto the delegated auth routes", () => {
    /*
     * The canonical origin guard refuses a non-GET whose Origin is not the
     * configured baseURL. The Music locations set `Origin $scheme://$http_host`;
     * doing that for /api/auth would forge a trusted origin onto every
     * cross-origin write, and would also turn the 403 the invariant probes into
     * a Better Auth response.
     */
    const nginx = read("explorers-earth/nginx.replatform.conf");
    const authBlock = nginx.slice(
      nginx.indexOf("location ^~ /api/auth/"),
      nginx.indexOf("location ^~ /api/explorers/v1/"),
    );
    expect(authBlock).not.toContain("proxy_set_header Origin");
  });
});
