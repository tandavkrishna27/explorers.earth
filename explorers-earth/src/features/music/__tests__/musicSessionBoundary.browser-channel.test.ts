import { describe, expect, it, vi } from "vitest";

describe("browser Music session channel composition", () => {
  it("uses BroadcastChannel when the browser provides it", async () => {
    const sent: unknown[] = [];
    class BrowserChannel {
      constructor(readonly name: string) {}
      postMessage(value: unknown) { sent.push(value); }
      addEventListener() {}
      removeEventListener() {}
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", BrowserChannel);
    vi.resetModules();
    const module = await import("../musicSessionBoundary");
    module.musicSessionBoundary.publish("account-generation");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ version: "music-session/v1", kind: "account-generation" });
    module.musicSessionBoundary.close();
    vi.unstubAllGlobals();
  });

  it("uses the storage fallback when BroadcastChannel is unavailable", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.resetModules();
    const module = await import("../musicSessionBoundary");
    expect(() => {
      module.musicSessionBoundary.publish("account-generation");
      module.musicSessionBoundary.close();
    }).not.toThrow();
    vi.unstubAllGlobals();
  });
});
