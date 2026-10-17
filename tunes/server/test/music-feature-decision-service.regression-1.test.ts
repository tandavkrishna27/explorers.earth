import { describe, expect, it } from "vitest";
import { MusicFeatureDecisionService } from "../services/musicFeatureDecisionService";

const principal = {
  musicUserId: "music-user-1",
  userDocumentId: "user-1",
  accountDocumentId: "account-1",
  sessionVersion: 1,
};

describe("Music feature decision renewal regression", () => {
  it("renews a cached exposure before its expiry enters the clock-skew window", () => {
    // Regression: ISSUE-001 — the owner workspace disappeared at exposure renewal.
    // Found by /qa on 2026-08-27.
    // Report: .gstack/qa-reports/qa-report-explorers-earth-2026-08-27.md
    let now = 0;
    let exposure = 0;
    const service = new MusicFeatureDecisionService({
      killSwitch: () => false,
      salt: "production-rollout",
      cohortVersion: "owner-v1",
      percentages: { ownerWorkspace: 100 },
      cacheTtlMs: 60_000,
      now: () => now,
      exposureId: () => `exposure-${++exposure}`,
    });

    const first = service.decide(principal);
    now = 59_000;
    const renewed = service.decide(principal);

    expect(renewed.ownerWorkspace).toBe(true);
    expect(renewed.exposureId).not.toBe(first.exposureId);
    expect(renewed.expiresAt).toBe(new Date(119_000).toISOString());
  });

  it("renews a full-cache exposure without evicting another live principal", () => {
    let now = 0;
    let exposure = 0;
    const service = new MusicFeatureDecisionService({
      killSwitch: () => false,
      salt: "production-rollout",
      cohortVersion: "owner-v1",
      percentages: { ownerWorkspace: 100 },
      cacheTtlMs: 60_000,
      cacheMaxEntries: 2,
      now: () => now,
      exposureId: () => `exposure-${++exposure}`,
    });
    const otherPrincipal = { ...principal, musicUserId: "music-user-2", accountDocumentId: "account-2" };

    service.decide(otherPrincipal);
    const first = service.decide(principal);
    now = 59_000;
    const renewed = service.decide(principal);
    const cache = (service as unknown as { cache: Map<string, unknown> }).cache;

    expect(renewed.exposureId).not.toBe(first.exposureId);
    expect(cache.size).toBe(2);
    expect(cache.has("music-user-2:account-2:1")).toBe(true);
  });
});
