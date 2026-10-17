import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { startMusicReconciliationSuspensionListener } from "../services/musicReconciliationSuspensionListener";

class FakeClient extends EventEmitter {
  readonly query = vi.fn(async (sql: string, _parameters?: unknown[]) => ({
    rows: sql.includes("music_identity_lifecycle_operations") ? [{ should_disconnect: true }] : [],
  }));
  readonly release = vi.fn();
}

describe("music reconciliation suspension listener", () => {
  it("rejects unsafe queue bounds before opening a database connection", async () => {
    for (const bounds of [
      { maxConcurrency: 0 }, { maxConcurrency: 33 }, { maxConcurrency: 1.5 },
      { maxPending: 0 }, { maxConcurrency: 2, maxPending: 1 }, { maxPending: 10_001 }, { maxPending: 1.5 },
    ]) {
      const connect = vi.fn();
      await expect(startMusicReconciliationSuspensionListener({
        pool: { connect },
        disconnectOwner: vi.fn(),
        onDisconnectError: vi.fn(),
        onFatal: vi.fn(),
        ...bounds,
      })).rejects.toThrow(/bounds/i);
      expect(connect).not.toHaveBeenCalled();
    }
  });

  it("is an awaited startup requirement independent of the disabled C0 reconciliation gate", () => {
    const routes = readFileSync(resolve(import.meta.dirname, "../routes/index.ts"), "utf8");
    expect(routes).toContain("export async function registerRoutes");
    expect(routes).toContain("await startMusicReconciliationSuspensionListener");
    expect(routes).not.toContain("process.env.MUSIC_RECONCILIATION_ENABLED");
    expect(routes).toContain("onFatal:");
  });

  it("disconnects the suspended owner from a dedicated LISTEN connection", async () => {
    const client = new FakeClient();
    const disconnectOwner = vi.fn(async () => undefined);
    const listener = await startMusicReconciliationSuspensionListener({
      pool: { connect: vi.fn(async () => client) },
      disconnectOwner,
      onDisconnectError: vi.fn(),
      onFatal: vi.fn(),
    });

    expect(client.query).toHaveBeenCalledWith("LISTEN music_identity_suspended");
    expect(client.query).toHaveBeenCalledWith("SET application_name = 'music-reconciliation-suspension-listener'");
    expect(client.query).toHaveBeenCalledWith("SELECT pg_advisory_lock_shared(hashtextextended('music:identity-suspension-listener-ready',0))");
    client.emit("notification", { channel: "music_identity_suspended", payload: "41:2" });
    await vi.waitFor(() => expect(disconnectOwner).toHaveBeenCalledWith(41));

    await listener.stop();
    expect(client.query).toHaveBeenCalledWith("SELECT pg_advisory_unlock_shared(hashtextextended('music:identity-suspension-listener-ready',0))");
    expect(client.query).toHaveBeenLastCalledWith("UNLISTEN music_identity_suspended");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("treats a versioned notification only as a wakeup and disconnects only the current durable suspension", async () => {
    const client = new FakeClient();
    let durableSuspension = false;
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes("music_identity_lifecycle_operations")) {
        return { rows: [{ should_disconnect: durableSuspension }] };
      }
      return { rows: [] };
    });
    const disconnectOwner = vi.fn(async () => undefined);
    const listener = await startMusicReconciliationSuspensionListener({
      pool: { connect: vi.fn(async () => client) },
      disconnectOwner,
      onDisconnectError: vi.fn(),
      onFatal: vi.fn(),
    });

    client.emit("notification", { channel: "music_identity_suspended", payload: "41:2" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(disconnectOwner).not.toHaveBeenCalled();

    durableSuspension = true;
    client.emit("notification", { channel: "music_identity_suspended", payload: "42:3" });
    await vi.waitFor(() => expect(disconnectOwner).toHaveBeenCalledWith(42));
    expect(disconnectOwner).not.toHaveBeenCalledWith(41);
    await listener.stop();
  });

  it("rejects a stale suspension fence even when the owner is suspended again", async () => {
    const client = new FakeClient();
    client.query.mockImplementation(async (sql: string, parameters?: unknown[]) => ({
      rows: sql.includes("music_identity_lifecycle_operations")
        ? [{ should_disconnect: parameters?.[0] === 42 && parameters?.[1] === 7 }]
        : [],
    }));
    const disconnectOwner = vi.fn(async () => undefined);
    const listener = await startMusicReconciliationSuspensionListener({
      pool: { connect: vi.fn(async () => client) },
      disconnectOwner,
      onDisconnectError: vi.fn(),
      onFatal: vi.fn(),
    });

    client.emit("notification", { channel: "music_identity_suspended", payload: "42:6" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(disconnectOwner).not.toHaveBeenCalled();

    client.emit("notification", { channel: "music_identity_suspended", payload: "42:7" });
    await vi.waitFor(() => expect(disconnectOwner).toHaveBeenCalledWith(42));
    await listener.stop();
  });

  it("uses separate fatal and owner-disconnect failure channels", async () => {
    const client = new FakeClient();
    const ownerFailure = new Error("owner disconnect failed");
    const connectionFailure = new Error("listen connection failed");
    const onDisconnectError = vi.fn();
    const onFatal = vi.fn();
    const listener = await startMusicReconciliationSuspensionListener({
      pool: { connect: vi.fn(async () => client) },
      disconnectOwner: vi.fn(async () => { throw ownerFailure; }),
      onDisconnectError,
      onFatal,
    });

    client.emit("notification", { channel: "music_identity_suspended", payload: "7:2" });
    await vi.waitFor(() => expect(onDisconnectError).toHaveBeenCalledWith(ownerFailure));
    client.emit("error", connectionFailure);
    expect(onFatal).toHaveBeenCalledWith(connectionFailure);
    await listener.stop();
  });

  it("bounds burst fan-out and drains accepted disconnects before shutdown", async () => {
    const client = new FakeClient();
    const started: number[] = [];
    const releases: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;
    const listener = await startMusicReconciliationSuspensionListener({
      pool: { connect: vi.fn(async () => client) },
      disconnectOwner: async (musicUserId) => {
        started.push(musicUserId);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
      },
      onDisconnectError: vi.fn(),
      onFatal: vi.fn(),
      maxConcurrency: 2,
      maxPending: 5,
    });

    for (const musicUserId of [1, 2, 3, 4]) {
      client.emit("notification", { channel: "music_identity_suspended", payload: `${musicUserId}:${musicUserId + 1}` });
    }
    await vi.waitFor(() => expect(started).toEqual([1, 2]));
    expect(maximumActive).toBe(2);
    const stopping = listener.stop();
    let stopped = false;
    void stopping.then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);

    releases.shift()?.();
    releases.shift()?.();
    await vi.waitFor(() => expect(started).toEqual([1, 2, 3, 4]));
    releases.shift()?.();
    releases.shift()?.();
    await stopping;
    expect(maximumActive).toBe(2);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("fails closed instead of dropping a notification when the bounded queue is full", async () => {
    const client = new FakeClient();
    const onFatal = vi.fn();
    let release: (() => void) | undefined;
    const listener = await startMusicReconciliationSuspensionListener({
      pool: { connect: vi.fn(async () => client) },
      disconnectOwner: async () => new Promise<void>((resolve) => { release = resolve; }),
      onDisconnectError: vi.fn(),
      onFatal,
      maxConcurrency: 1,
      maxPending: 1,
    });
    client.emit("notification", { channel: "music_identity_suspended", payload: "1:2" });
    client.emit("notification", { channel: "music_identity_suspended", payload: "2:3" });
    expect(onFatal).toHaveBeenCalledOnce();
    client.emit("error", new Error("already failed"));
    expect(onFatal).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release?.();
    await listener.stop();
  });

  it("rejects malformed payloads, contains callback failures, and stops idempotently", async () => {
    const client = new FakeClient();
    const error = new Error("socket registry unavailable");
    const disconnectOwner = vi.fn(async () => { throw error; });
    const onDisconnectError = vi.fn();
    const onFatal = vi.fn();
    const listener = await startMusicReconciliationSuspensionListener({
      pool: { connect: vi.fn(async () => client) },
      disconnectOwner,
      onDisconnectError,
      onFatal,
    });

    for (const payload of [
      undefined, "", "5", "0:1", "-1:1", "1.5:2", "1e2:2", "9007199254740992:2",
      "1:0", "1:-1", "1:1.5", "1:1e2", "1:9007199254740992",
    ]) {
      client.emit("notification", { channel: "music_identity_suspended", payload });
    }
    client.emit("notification", { channel: "another_channel", payload: "5:2" });
    expect(disconnectOwner).not.toHaveBeenCalled();

    client.emit("notification", { channel: "music_identity_suspended", payload: "5:2" });
    await vi.waitFor(() => expect(onDisconnectError).toHaveBeenCalledWith(error));
    client.emit("error", error);
    expect(onFatal).toHaveBeenCalledWith(error);

    await listener.stop();
    await listener.stop();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("releases the dedicated connection when LISTEN setup fails", async () => {
    const client = new FakeClient();
    const error = new Error("listen denied");
    client.query.mockRejectedValueOnce(error);

    await expect(startMusicReconciliationSuspensionListener({
      pool: { connect: vi.fn(async () => client) },
      disconnectOwner: vi.fn(),
      onDisconnectError: vi.fn(),
      onFatal: vi.fn(),
    })).rejects.toThrow("listen denied");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
