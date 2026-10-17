import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const sourcePath = resolve(process.cwd(), "src/lib/musicCredentialStore.ts");

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("module-memory Music credential store", () => {
  it("contains no persistence, navigation, worker, channel, or telemetry surface reference", () => {
    const source = readFileSync(sourcePath, "utf8");
    for (const forbidden of [
      "localStorage", "sessionStorage", "cookie", "indexedDB", "caches", "history",
      "serviceWorker", "BroadcastChannel", "analytics", "location.href", "URLSearchParams",
    ]) expect(source).not.toContain(forbidden);
  });

  it("sets, reads, expires, clears, and notifies without touching instrumented browser stores", async () => {
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new Error("forbidden store"); } });
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => { throw new Error("forbidden session"); } });
    const store = await import("../musicCredentialStore");
    const changes: Array<string | undefined> = [];
    const unsubscribe = store.subscribeMusicCredential((value) => changes.push(value?.token));
    store.setMusicCredential({ token: "memory-only-token", expiresAt: 2_000 });
    expect(store.getMusicCredential(1_999)?.token).toBe("memory-only-token");
    expect(store.getMusicCredential(2_000)).toBeUndefined();
    store.setMusicCredential({ token: "logout-token", expiresAt: 3_000 });
    store.clearMusicCredential();
    unsubscribe();
    expect(changes).toEqual(["memory-only-token", undefined, "logout-token", undefined]);
  });

  it("naturally loses the credential when the module is reloaded", async () => {
    const first = await import("../musicCredentialStore");
    first.setMusicCredential({ token: "reload-token", expiresAt: Date.now() + 60_000 });
    expect(first.getMusicCredential()?.token).toBe("reload-token");
    vi.resetModules();
    const reloaded = await import("../musicCredentialStore");
    expect(reloaded.getMusicCredential()).toBeUndefined();
  });
});
