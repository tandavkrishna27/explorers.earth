import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToOwnerMusic } from "../ownerMusicLiveClient";

type Listener = (...args: any[]) => void;
function socketHarness() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    socket: {
      on: vi.fn((event: string, listener: Listener) => { const set = listeners.get(event) ?? new Set(); set.add(listener); listeners.set(event, set); }),
      off: vi.fn((event: string, listener: Listener) => listeners.get(event)?.delete(listener)),
      disconnect: vi.fn(),
    },
    emit(event: string, value?: unknown) { listeners.get(event)?.forEach((listener) => listener(value)); },
  };
}

afterEach(() => vi.useRealTimers());

describe("owner Music live invalidation", () => {
  it("authenticates with the ephemeral owner credential and performs reconnect catch-up", async () => {
    const harness = socketHarness();
    const socketFactory = vi.fn((_auth: (cb: (data: { token: string }) => void) => void) => harness.socket);
    const onInvalidate = vi.fn(async () => ({ revision: 8 }));
    const mintTicket = vi.fn(async () => "ticket.one.value");
    subscribeToOwnerMusic({ mintTicket, initialRevision: 7, onInvalidate }, { socketFactory });
    const authorize = socketFactory.mock.calls[0][0];
    const presented: Array<{ token: string }> = [];
    authorize((data) => presented.push(data));
    await vi.waitFor(() => expect(presented).toEqual([{ token: "ticket.one.value" }]));
    harness.emit("connect");
    await vi.waitFor(() => expect(onInvalidate).toHaveBeenCalledTimes(1));
  });

  it("ignores malformed and stale envelopes, then coalesces a burst into canonical refetches", async () => {
    vi.useFakeTimers();
    const harness = socketHarness();
    let resolveFirst!: (value: { revision: number }) => void;
    const onInvalidate = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue({ revision: 12 });
    subscribeToOwnerMusic({ mintTicket: async () => "ticket.one.value", initialRevision: 7, onInvalidate }, { socketFactory: () => harness.socket });
    harness.emit("music_owner_change", { version: "wrong", kind: "queue_changed", revision: 8 });
    harness.emit("music_owner_change", { version: "music-owner-change/v1", kind: "queue_changed", revision: 7 });
    harness.emit("music_owner_change", { version: "music-owner-change/v1", kind: "queue_changed", revision: 8 });
    await vi.runAllTimersAsync();
    expect(onInvalidate).toHaveBeenCalledTimes(1);
    harness.emit("music_owner_change", { version: "music-owner-change/v1", kind: "playlists_changed", revision: 12 });
    resolveFirst({ revision: 8 });
    await Promise.resolve(); await vi.runAllTimersAsync();
    expect(onInvalidate).toHaveBeenCalledTimes(2);
  });

  it("mints a fresh ticket for every connection attempt and never reuses or falls back", async () => {
    // Break caught: the ticket is captured once, so a reconnect after a backoff longer
    // than the 60-second ticket lifetime presents an expired credential and the owner
    // silently stops receiving live updates.
    const harness = socketHarness();
    const socketFactory = vi.fn((_auth: (cb: (data: { token: string }) => void) => void) => harness.socket);
    let issued = 0;
    const mintTicket = vi.fn(async () => {
      issued += 1;
      if (issued === 2) throw new Error("ticket unavailable");
      return `ticket.${issued}`;
    });
    const onError = vi.fn();
    subscribeToOwnerMusic({
      mintTicket, initialRevision: 0, onError, onInvalidate: vi.fn(async () => ({ revision: 1 })),
    }, { socketFactory });

    const authorize = socketFactory.mock.calls[0][0];
    const presented: Array<{ token: string }> = [];

    authorize((data) => presented.push(data));
    await vi.waitFor(() => expect(presented).toHaveLength(1));

    // A reconnect asks again rather than replaying the first ticket.
    authorize((data) => presented.push(data));
    await vi.waitFor(() => expect(presented).toHaveLength(2));

    authorize((data) => presented.push(data));
    await vi.waitFor(() => expect(presented).toHaveLength(3));

    // Attempt two failed to mint: it presents no credential rather than the ticket that
    // worked a moment ago, so the server refuses it and Socket.IO retries.
    expect(presented).toEqual([{ token: "ticket.1" }, { token: "" }, { token: "ticket.3" }]);
    expect(mintTicket).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("aborts in-flight work and removes listeners on unsubscribe", async () => {
    const harness = socketHarness();
    let signal: AbortSignal | undefined;
    const subscription = subscribeToOwnerMusic({
      mintTicket: async () => "ticket.one.value", initialRevision: 0,
      onInvalidate: vi.fn(async (nextSignal) => { signal = nextSignal; return new Promise(() => undefined); }),
    }, { socketFactory: () => harness.socket });
    harness.emit("connect");
    await vi.waitFor(() => expect(signal).toBeDefined());
    subscription.unsubscribe();
    expect(signal?.aborted).toBe(true);
    expect(harness.socket.disconnect).toHaveBeenCalledOnce();
  });
});
