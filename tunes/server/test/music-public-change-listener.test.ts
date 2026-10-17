import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { startMusicPublicChangeListener } from "../services/musicPublicChangeListener";
import { createMusicPublicObservability } from "../observability/musicPublicObservability";

class FakeClient extends EventEmitter {
  queries: string[] = [];
  released = false;
  async query(sql: string) { this.queries.push(sql); }
  release() { this.released = true; }
}

describe("Music public change LISTEN service", () => {
  it("continues listener fanout when its injected telemetry sink throws", async () => {
    const client = new FakeClient(); const fanout = vi.fn(async () => undefined);
    const listener = await startMusicPublicChangeListener({ pool: { connect: async () => client }, fanout,
      observability: createMusicPublicObservability({ sink: () => { throw new Error("monitor down"); } }) });
    client.emit("notification", { channel: "music_public_change", payload: JSON.stringify({ musicUserId: 1, kind: "queue_changed", revision: 1 }) });
    await vi.waitFor(() => expect(fanout).toHaveBeenCalledOnce());
    await expect(listener.stop()).resolves.toBeUndefined();
  });

  it("fans one PostgreSQL notification to every replica listener without shared process state", async () => {
    // Break caught: fanout is process-local (or Redis-dependent), so only the mutating replica updates.
    const left = new FakeClient(); const right = new FakeClient();
    const leftFanout = vi.fn(async () => undefined); const rightFanout = vi.fn(async () => undefined);
    const listeners = await Promise.all([
      startMusicPublicChangeListener({ pool: { connect: async () => left }, fanout: leftFanout }),
      startMusicPublicChangeListener({ pool: { connect: async () => right }, fanout: rightFanout }),
    ]);
    const notification = { channel: "music_public_change", payload: JSON.stringify({ musicUserId: 4, kind: "playlists_changed", revision: 11 }) };
    left.emit("notification", notification); right.emit("notification", notification);
    await vi.waitFor(() => { expect(leftFanout).toHaveBeenCalledOnce(); expect(rightFanout).toHaveBeenCalledOnce(); });
    await Promise.all(listeners.map((listener) => listener.stop()));
  });

  it("parses only the bounded internal envelope and fans it out", async () => {
    // Break caught: malformed or secret-bearing database payloads cross into socket fanout.
    const client = new FakeClient();
    const fanout = vi.fn(async () => undefined);
    const listener = await startMusicPublicChangeListener({ pool: { connect: async () => client }, fanout });
    client.emit("notification", { channel: "music_public_change", payload: JSON.stringify({ musicUserId: 9, kind: "queue_changed", revision: 3 }) });
    client.emit("notification", { channel: "music_public_change", payload: JSON.stringify({ musicUserId: 9, kind: "queue_changed", revision: 4, capability: "secret" }) });
    client.emit("notification", { channel: "other", payload: "{}" });
    await vi.waitFor(() => expect(fanout).toHaveBeenCalledTimes(1));
    expect(fanout).toHaveBeenCalledWith({ musicUserId: 9, kind: "queue_changed", revision: 3 });
    await listener.stop();
    expect(client.queries).toEqual(["LISTEN music_public_change", "UNLISTEN music_public_change"]);
    expect(client.released).toBe(true);
  });

  it("reconnects a failed dedicated client and becomes fatal only after the bounded retry budget", async () => {
    // Break caught: a transient LISTEN connection loss permanently disables multi-instance delivery,
    // or an unbounded reconnect storm silently consumes resources.
    vi.useFakeTimers();
    const clients = [new FakeClient(), new FakeClient(), new FakeClient()];
    let connects = 0;
    const fatal = vi.fn();
    const listener = await startMusicPublicChangeListener({
      pool: { connect: async () => {
        const client = clients[connects++];
        if (!client) throw new Error("database down");
        return client;
      } },
      fanout: async () => undefined,
      reconnectDelaysMs: [1_000, 2_000],
      onFatal: fatal,
    });
    clients[0].emit("error", new Error("lost"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(connects).toBe(2);
    clients[1].emit("error", new Error("lost again"));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(connects).toBe(3);
    clients[2].emit("error", new Error("lost finally"));
    await vi.runAllTimersAsync();
    expect(fatal).toHaveBeenCalledTimes(1);
    await listener.stop();
    vi.useRealTimers();
  });

  it("runs durable catch-up after LISTEN on every connection before reporting connected", async () => {
    vi.useFakeTimers();
    const first = new FakeClient(); const second = new FakeClient();
    const clients = [first, second];
    const events: string[] = [];
    const catchUp = vi.fn(async () => { events.push("catch-up"); });
    const listener = await startMusicPublicChangeListener({
      pool: { connect: async () => clients.shift()! },
      fanout: async () => undefined,
      catchUp,
      reconnectDelaysMs: [0],
      observability: { listener: (outcome) => events.push(outcome), socket: () => undefined, request: () => undefined },
    });
    expect(events.slice(-2)).toEqual(["catch-up", "connected"]);
    first.emit("error", new Error("lost"));
    await vi.advanceTimersByTimeAsync(0);
    expect(catchUp).toHaveBeenCalledTimes(2);
    expect(events.slice(-2)).toEqual(["catch-up", "connected"]);
    await listener.stop();
    vi.useRealTimers();
  });
});
