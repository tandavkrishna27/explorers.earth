import { describe, expect, it } from "vitest";
import { musicErrorCodeSchema } from "../../../shared/musicError";
import { MUSIC_QUALIFICATION_FAILURE_RECOVERY } from "../../../scripts/music-qualification";

const requiredScenarios = [
  "strapi-outage",
  "database-outage",
  "malformed-identity",
  "malformed-entitlement",
  "database-deadlock",
  "partial-transaction",
  "truncated-pagination",
  "duplicate-reconciliation",
  "credential-rotation",
  "stale-token",
  "browser-exit",
  "migration-failure",
  "readiness-failure",
  "rollback-exact-digest",
  "kill-switch",
  "secure-rollback-floor",
] as const;

describe("Music chaos ownership and recovery contract", () => {
  it("assigns every injected C10 failure to a bounded owner, stable code, and recovery", () => {
    expect(Object.keys(MUSIC_QUALIFICATION_FAILURE_RECOVERY).sort()).toEqual([...requiredScenarios].sort());
    for (const [scenario, recovery] of Object.entries(MUSIC_QUALIFICATION_FAILURE_RECOVERY)) {
      expect(scenario.length).toBeLessThanOrEqual(40);
      expect(["identity", "database", "reconciliation", "browser", "release"]).toContain(recovery.owner);
      expect(recovery.code).toMatch(/^[A-Z][A-Z0-9_-]{2,63}$/);
      expect(recovery.recovery).toMatch(/^[a-z][a-z0-9_-]{1,63}$/);
      expect(recovery.userVisible).not.toMatch(/Strapi|Postgres|database|token|digest|stack|SQL/i);
    }
  });

  it("uses the canonical public Music error vocabulary for user-facing failures", () => {
    for (const recovery of Object.values(MUSIC_QUALIFICATION_FAILURE_RECOVERY)) {
      if (recovery.publicCode) expect(musicErrorCodeSchema.safeParse(recovery.code).success).toBe(true);
    }
  });
});
