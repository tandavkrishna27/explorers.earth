import { describe, expect, it, vi } from "vitest";
import { createPublicMusicObservability } from "../publicMusicObservability";
import { createPublicMusicClient } from "../publicMusicClient";

describe("public Music browser operational observability", () => {
  it("records bounded parser, reconnect, polling and revocation outcomes without identifiers", () => {
    const sink = vi.fn();
    const telemetry = createPublicMusicObservability(sink);
    telemetry.record("parser_rejected", { parser: "resource", reason: "schema" });
    telemetry.record("socket_reconnect", { outcome: "connected" });
    telemetry.record("fallback_poll", { outcome: "activated", delayMs: 999_999 });
    telemetry.record("revocation", { outcome: "enforced" });
    telemetry.record("socket_reconnect", { outcome: "failed", capability: "secret-capability" } as never);

    expect(sink.mock.calls.map(([entry]) => entry)).toEqual([
      { version: "music-public-browser-ops/v1", event: "parser_rejected", parser: "resource", reason: "schema" },
      { version: "music-public-browser-ops/v1", event: "socket_reconnect", outcome: "connected" },
      { version: "music-public-browser-ops/v1", event: "fallback_poll", outcome: "activated", delayMs: 300_000 },
      { version: "music-public-browser-ops/v1", event: "revocation", outcome: "enforced" },
      { version: "music-public-browser-ops/v1", event: "socket_reconnect", outcome: "failed" },
    ]);
    expect(JSON.stringify(sink.mock.calls)).not.toMatch(/slug|account|capability|query|mediaUrl|credential/i);
  });

  it("surfaces only a validated support reference and bounds Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: {
      "X-Request-Id": "support-safe-1", "Retry-After": "999999",
    } })));
    const client = createPublicMusicClient("https://music.example", createPublicMusicObservability());
    await expect(client.load("public_slug-123")).rejects.toMatchObject({
      code: "RATE_LIMITED", retryAfterSeconds: 300, requestId: "support-safe-1",
    });
    vi.unstubAllGlobals();
  });

  it("contains sink failures and reports malformed request responses with support references", async () => {
    const throwing = createPublicMusicObservability(() => { throw new Error("monitor down"); });
    expect(() => throwing.record("active_session", { outcome: "started" })).not.toThrow();
    const sink = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200, headers: { "X-Request-Id": "request-support-1" } })));
    const client = createPublicMusicClient("https://music.example", createPublicMusicObservability(sink));
    await expect(client.search("public_slug-123", "song")).rejects.toMatchObject({ code: "PUBLIC_UNAVAILABLE", requestId: "request-support-1" });
    expect(sink).toHaveBeenCalledWith({ version: "music-public-browser-ops/v1", event: "parser_rejected", parser: "request", reason: "json" });
    vi.unstubAllGlobals();
  });
});
