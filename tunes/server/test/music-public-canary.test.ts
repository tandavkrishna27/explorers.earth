import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { collectMusicPublicCanary, evaluateMusicPublicCanary } from "../observability/musicPublicCanary";

describe("public Music canary gates", () => {
  it("passes the calibrated baseline and exposes bounded operator-safe reasons", () => {
    expect(evaluateMusicPublicCanary({ descriptorP95Ms: 499, resourceP95Ms: 499, fiveXxRate: 0.019,
      listenerDisconnectSeconds: 29, notificationFanoutP95Ms: 1_999, fallbackPollingRate: 0.099,
      authorizationLeaks: 0, crossOwnerEvents: 0, capabilityExposures: 0 })).toEqual({ action: "promote", failedGates: [] });
  });

  it("rolls back immediately for authority exposure and contains ordinary threshold failures", () => {
    expect(evaluateMusicPublicCanary({ descriptorP95Ms: 200, resourceP95Ms: 200, fiveXxRate: 0,
      listenerDisconnectSeconds: 0, notificationFanoutP95Ms: 100, fallbackPollingRate: 0,
      authorizationLeaks: 1, crossOwnerEvents: 0, capabilityExposures: 0 })).toEqual({ action: "rollback", failedGates: ["authorization_leak"] });
    expect(evaluateMusicPublicCanary({ descriptorP95Ms: 500, resourceP95Ms: 501, fiveXxRate: 0.02,
      listenerDisconnectSeconds: 30, notificationFanoutP95Ms: 2_000, fallbackPollingRate: 0.1,
      authorizationLeaks: 0, crossOwnerEvents: 0, capabilityExposures: 0 })).toEqual({
        action: "contain", failedGates: ["descriptor_latency", "resource_latency", "server_error_rate", "listener_disconnect", "fanout_latency", "fallback_polling"],
      });
  });

  it("derives a merged multi-replica window including active-session polling rate", () => {
    const result = collectMusicPublicCanary([
      { version: "music-public-ops/v1", event: "http", operation: "descriptor", outcome: "success", status: 200, latencyMs: 100 },
      { version: "music-public-ops/v1", event: "http", operation: "resource", outcome: "success", status: 200, latencyMs: 200 },
      { version: "music-public-ops/v1", event: "listener", outcome: "connected", disconnectMs: 2_000 },
      { version: "music-public-ops/v1", event: "listener", outcome: "notification_fanout", lagMs: 50 },
      ...Array.from({ length: 20 }, () => ({ version: "music-public-browser-ops/v1", event: "active_session", outcome: "started" })),
      { version: "music-public-browser-ops/v1", event: "fallback_state", outcome: "entered" },
      { version: "music-public-browser-ops/v1", event: "fallback_poll", outcome: "activated", delayMs: 30_000 },
      { version: "music-public-browser-ops/v1", event: "fallback_poll", outcome: "activated", delayMs: 60_000 },
    ]);
    expect(result).toMatchObject({ descriptorP95Ms: 100, resourceP95Ms: 200, fiveXxRate: 0,
      listenerDisconnectSeconds: 2, notificationFanoutP95Ms: 50, fallbackPollingRate: 0.05 });
    expect(evaluateMusicPublicCanary(result).action).toBe("promote");
  });

  it.each(["authorization_leak", "cross_owner_event", "capability_exposure"] as const)("rolls back for versioned %s telemetry", (outcome) => {
    const measurements = collectMusicPublicCanary([{ version: "music-public-ops/v1", event: "security", outcome }]);
    expect(evaluateMusicPublicCanary(measurements)).toEqual({ action: "rollback", failedGates: [outcome] });
  });

  it("uses fallback state deltas and exits on reconnect without poll-attempt inflation", () => {
    const measurements = collectMusicPublicCanary([
      { version: "music-public-browser-ops/v1", event: "active_session", outcome: "started" },
      { version: "music-public-browser-ops/v1", event: "fallback_state", outcome: "entered" },
      ...Array.from({ length: 5 }, () => ({ version: "music-public-browser-ops/v1", event: "fallback_poll", outcome: "activated" })),
      { version: "music-public-browser-ops/v1", event: "fallback_state", outcome: "exited" },
    ]);
    expect(measurements.fallbackPollingRate).toBe(0);
  });

  it("fails closed for an empty telemetry window", () => {
    expect(evaluateMusicPublicCanary(collectMusicPublicCanary([]))).toMatchObject({ action: "contain" });
  });

  it("provides an executable JSONL gate with fail-closed exit codes", () => {
    const directory = mkdtempSync(join(tmpdir(), "music-canary-"));
    try {
      const input = join(directory, "events.jsonl");
      writeFileSync(input, "", "utf8");
      const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/evaluate-music-public-canary.ts", input], { encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ version: "music-public-canary/v1", action: "contain" });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
