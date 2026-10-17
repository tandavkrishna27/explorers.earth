import { describe, expect, it, vi } from "vitest";
import { createMusicPublicObservability } from "../observability/musicPublicObservability";

describe("public Music operational observability", () => {
  it("emits only bounded operational fields and strips authority values", () => {
    const sink = vi.fn();
    const telemetry = createMusicPublicObservability({ sink, now: () => 1_500 });
    const finish = telemetry.startHttp("descriptor", "safe-request-1", 1_000);
    finish("not_found", 404);
    telemetry.listener("reconnect_scheduled", { retryDelayMs: 99_999, detail: "secret-capability" } as never);
    telemetry.socket("admitted", { role: "public", publicSlug: "private-owner", capability: "secret-capability" } as never);
    telemetry.security("capability_exposure");

    expect(sink.mock.calls.map(([entry]) => entry)).toEqual([
      { version: "music-public-ops/v1", event: "http", operation: "descriptor", outcome: "not_found", status: 404, latencyMs: 500, requestId: "safe-request-1" },
      { version: "music-public-ops/v1", event: "listener", outcome: "reconnect_scheduled", retryDelayMs: 30_000 },
      { version: "music-public-ops/v1", event: "socket", outcome: "admitted", role: "public" },
      { version: "music-public-ops/v1", event: "security", outcome: "capability_exposure" },
    ]);
    expect(JSON.stringify(sink.mock.calls)).not.toContain("secret-capability");
  });

  it("normalizes unsafe request IDs and bounds latency and notification lag", () => {
    const sink = vi.fn();
    const telemetry = createMusicPublicObservability({ sink, now: () => Number.MAX_SAFE_INTEGER });
    telemetry.startHttp("resource", "capability=very-secret", 0)("success", 200);
    telemetry.listener("notification_fanout", { lagMs: Number.MAX_SAFE_INTEGER, kind: "queue_changed" });

    expect(sink.mock.calls[0][0].requestId).toBeUndefined();
    expect(sink.mock.calls[0][0].latencyMs).toBe(300_000);
    expect(sink.mock.calls[1][0]).toEqual(expect.objectContaining({ lagMs: 300_000, kind: "queue_changed" }));
  });

  it("contains a throwing telemetry sink", () => {
    const telemetry = createMusicPublicObservability({ sink: () => { throw new Error("monitor down"); } });
    expect(() => telemetry.startHttp("resource", "safe-request")("success", 200)).not.toThrow();
    expect(() => telemetry.listener("connected", { disconnectMs: 4_000 })).not.toThrow();
    expect(() => telemetry.socket("disconnected", { role: "public" })).not.toThrow();
    expect(() => telemetry.security("authorization_leak")).not.toThrow();
  });
});
