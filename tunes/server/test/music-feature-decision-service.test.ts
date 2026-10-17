import { describe, expect, it, vi } from "vitest";
import { MusicFeatureDecisionService } from "../services/musicFeatureDecisionService";

const principal = { musicUserId: 7, subject: "user-secret", accountDocumentId: "account-a", sessionVersion: 1 };

describe("MusicFeatureDecisionService", () => {
  it("fails every feature closed when the emergency kill switch is active", () => {
    const service = new MusicFeatureDecisionService({ killSwitch: () => true, salt: "test-salt", cohortVersion: "v1" });
    expect(service.decide(principal)).toMatchObject({ ownerWorkspace: false, guestWorkspace: false, playlistImports: false });
  });

  it("applies the emergency kill switch immediately to a cached enabled exposure", () => {
    let killed = false;
    const service = new MusicFeatureDecisionService({ killSwitch: () => killed, salt: "salt", cohortVersion: "v1", percentages: { ownerWorkspace: 100 } });
    expect(service.decide(principal).ownerWorkspace).toBe(true);
    killed = true;
    expect(service.decide(principal).ownerWorkspace).toBe(false);
  });

  it("gives an explicit account allowlist precedence over a zero-percent cohort", () => {
    const service = new MusicFeatureDecisionService({
      killSwitch: () => false, salt: "test-salt", cohortVersion: "v1",
      allowlists: { ownerWorkspace: new Set(["account-a"]) }, percentages: { ownerWorkspace: 0 },
    });
    expect(service.decide(principal).ownerWorkspace).toBe(true);
  });

  it("fails a percentage cohort closed when its salt is not configured", () => {
    const service = new MusicFeatureDecisionService({ killSwitch: () => false, salt: "", cohortVersion: "v1", percentages: { ownerWorkspace: 100 } });
    expect(service.decide(principal).ownerWorkspace).toBe(false);
  });

  it("uses a stable salted cohort and never caches a decision beyond sixty seconds", () => {
    let now = 1_000;
    const exposure = vi.fn(() => "opaque-exposure");
    const service = new MusicFeatureDecisionService({
      killSwitch: () => false, salt: "test-salt", cohortVersion: "v1", now: () => now,
      exposureId: exposure, percentages: { ownerWorkspace: 100 }, cacheTtlMs: 99_000,
    });
    const first = service.decide(principal);
    expect(first).toMatchObject({ ownerWorkspace: true, exposureId: "opaque-exposure", expiresAt: new Date(61_000).toISOString() });
    expect(service.decide(principal)).toBe(first);
    now = 61_001;
    expect(service.decide(principal)).not.toBe(first);
  });

  it("evicts expired principals and bounds live feature-decision entries", () => {
    let now = 1_000;
    let exposure = 0;
    const service = new MusicFeatureDecisionService({
      killSwitch: () => false, salt: "salt", cohortVersion: "v1", now: () => now,
      exposureId: () => `exposure-${++exposure}`, cacheTtlMs: 60_000, cacheMaxEntries: 2,
    });
    const first = service.decide(principal);
    service.decide({ ...principal, musicUserId: 8, accountDocumentId: "account-b" });
    service.decide({ ...principal, musicUserId: 9, accountDocumentId: "account-c" });
    expect(service.decide(principal).exposureId).not.toBe(first.exposureId);

    now = 61_001;
    service.decide({ ...principal, musicUserId: 10, accountDocumentId: "account-d" });
    const cache = (service as unknown as { cache: Map<string, unknown> }).cache;
    expect(cache.size).toBe(1);
  });

  it("logs only sanitized exposure fields", () => {
    const log = vi.fn();
    new MusicFeatureDecisionService({ killSwitch: () => false, salt: "salt", cohortVersion: "v4", log }).decide(principal);
    expect(log).toHaveBeenCalledTimes(3);
    expect(log.mock.calls[0][0]).toEqual({ flag: "ownerWorkspace", decision: false, cohortVersion: "v4", exposureId: expect.any(String) });
    expect(JSON.stringify(log.mock.calls)).not.toContain("account-a");
    expect(JSON.stringify(log.mock.calls)).not.toContain("user-secret");
  });
});
