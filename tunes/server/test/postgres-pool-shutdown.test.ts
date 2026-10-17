import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { trackPostgresPoolShutdown } from "./helpers/postgresPoolShutdown";

describe("PostgreSQL integration pool shutdown", () => {
  it("waits for every connection to end before administrative database cleanup", async () => {
    const pool = Object.assign(new EventEmitter(), { end: async () => undefined });
    const close = trackPostgresPoolShutdown(pool);
    const first = new EventEmitter();
    const second = new EventEmitter();
    pool.emit("connect", first);
    pool.emit("connect", second);
    let cleanupStarted = false;
    const shutdown = close().then(() => { cleanupStarted = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(cleanupStarted).toBe(false);
    first.emit("end");
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(cleanupStarted).toBe(false);
    second.emit("end");
    await shutdown;
    expect(cleanupStarted).toBe(true);
  });

  it("handles already-ended connections and empty pools", async () => {
    const pool = Object.assign(new EventEmitter(), { end: async () => undefined });
    const close = trackPostgresPoolShutdown(pool);
    const client = new EventEmitter();
    pool.emit("connect", client);
    client.emit("end");
    await expect(close()).resolves.toBeUndefined();
    await expect(trackPostgresPoolShutdown(Object.assign(new EventEmitter(), {
      end: async () => undefined,
    }))()).resolves.toBeUndefined();
  });

  it("propagates pool shutdown failures", async () => {
    const pool = Object.assign(new EventEmitter(), {
      end: async () => { throw new Error("shutdown failed"); },
    });
    await expect(trackPostgresPoolShutdown(pool)()).rejects.toThrow("shutdown failed");
  });
});
