import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: { data: unknown }) => void;

class MemoryChannel {
  static realms = new Set<MemoryChannel>();
  listeners = new Set<Listener>();
  sent: unknown[] = [];

  postMessage(value: unknown) {
    this.sent.push(value);
    for (const realm of MemoryChannel.realms) {
      if (realm !== this) for (const listener of realm.listeners) listener({ data: value });
    }
  }

  addEventListener(_type: "message", listener: Listener) { this.listeners.add(listener); }
  removeEventListener(_type: "message", listener: Listener) { this.listeners.delete(listener); }
  close() { MemoryChannel.realms.delete(this); }
}

describe("cross-tab Music authority boundary", () => {
  beforeEach(() => { MemoryChannel.realms.clear(); });

  it("clears auth, coordinator, credential, and private query authority as one realm reset", async () => {
    const module = await import("../musicSessionBoundary").catch(() => undefined);
    expect(module).toBeDefined();
    const dependencies = {
      clearAuth: vi.fn(),
      resetCoordinator: vi.fn(),
      clearCredential: vi.fn(),
      clearIdentityQueries: vi.fn(async () => undefined),
      clearPublicationCommands: vi.fn(),
    };
    await module!.resetMusicSessionAuthority(dependencies);
    expect(dependencies.clearAuth).toHaveBeenCalledOnce();
    expect(dependencies.resetCoordinator).toHaveBeenCalledOnce();
    expect(dependencies.clearCredential).toHaveBeenCalledOnce();
    expect(dependencies.clearIdentityQueries).toHaveBeenCalledOnce();
    expect(dependencies.clearPublicationCommands).toHaveBeenCalledOnce();
  });

  it("keeps Explorer authentication on account generation but clears it on a true cross-tab logout", async () => {
    const module = await import("../musicSessionBoundary").catch(() => undefined);
    expect(module).toBeDefined();
    const dependencies = {
      clearMusicAuth: vi.fn(),
      logoutExplorer: vi.fn(),
      resetCoordinator: vi.fn(),
      clearCredential: vi.fn(),
      clearIdentityQueries: vi.fn(async () => undefined),
      clearPublicationCommands: vi.fn(),
    };

    await module!.resetMusicSessionRealm("account-generation", dependencies);
    expect(dependencies.logoutExplorer).not.toHaveBeenCalled();
    expect(dependencies.clearMusicAuth).toHaveBeenCalledOnce();
    expect(dependencies.clearIdentityQueries).toHaveBeenCalledOnce();

    await module!.resetMusicSessionRealm("logout", dependencies);
    expect(dependencies.logoutExplorer).toHaveBeenCalledOnce();
    expect(dependencies.clearMusicAuth).toHaveBeenCalledTimes(2);
    expect(dependencies.clearIdentityQueries).toHaveBeenCalledTimes(2);
    expect(dependencies.clearPublicationCommands).toHaveBeenCalledTimes(2);
  });

  it("resets every other realm for logout and account-generation events without broadcasting credentials or identity", async () => {
    const module = await import("../musicSessionBoundary").catch(() => undefined);
    expect(module).toBeDefined();
    const channels: MemoryChannel[] = [];
    const factory = () => {
      const channel = new MemoryChannel();
      MemoryChannel.realms.add(channel);
      channels.push(channel);
      return channel;
    };
    const resetA = vi.fn();
    const resetB = vi.fn();
    let eventIndex = 0;
    const realmA = module!.createMusicSessionBoundary({ channelFactory: factory, onReset: resetA, eventId: () => `event-a-${++eventIndex}` });
    const realmB = module!.createMusicSessionBoundary({ channelFactory: factory, onReset: resetB, eventId: () => "event-b" });

    realmA.publish("logout");
    realmA.publish("account-generation");

    expect(resetA).not.toHaveBeenCalled();
    expect(resetB).toHaveBeenNthCalledWith(1, "logout");
    expect(resetB).toHaveBeenNthCalledWith(2, "account-generation");
    const serialized = JSON.stringify(channels[0].sent);
    expect(serialized).not.toMatch(/token|bearer|credential|documentId|userDocumentId|accountDocumentId/i);
    realmA.close();
    realmB.close();
  });

  it("deduplicates a BroadcastChannel event repeated by the storage fallback", async () => {
    const module = await import("../musicSessionBoundary").catch(() => undefined);
    expect(module).toBeDefined();
    const channel = new MemoryChannel();
    MemoryChannel.realms.add(channel);
    const onReset = vi.fn();
    let storageListener: ((event: StorageEvent) => void) | undefined;
    const boundary = module!.createMusicSessionBoundary({
      channelFactory: () => channel,
      onReset,
      eventId: () => "same-event",
      storage: { setItem: vi.fn(), removeItem: vi.fn() },
      addStorageListener: (listener: (event: StorageEvent) => void) => { storageListener = listener; },
      removeStorageListener: vi.fn(),
    });
    const event = { version: "music-session/v1", kind: "logout", eventId: "remote-event" };
    for (const listener of channel.listeners) listener({ data: event });
    storageListener?.({ key: "explorers-music-session", newValue: JSON.stringify(event) } as StorageEvent);
    expect(onReset).toHaveBeenCalledTimes(1);
    boundary.close();
  });

  it("notifies a mounted realm once only after an account-generation reset has finished", async () => {
    const module = await import("../musicSessionBoundary");
    const channel = new MemoryChannel();
    MemoryChannel.realms.add(channel);
    let releaseReset!: () => void;
    const resetGate = new Promise<void>((resolve) => { releaseReset = resolve; });
    const onReset = vi.fn(() => resetGate);
    const listener = vi.fn();
    let storageListener: ((event: StorageEvent) => void) | undefined;
    const boundary = module.createMusicSessionBoundary({
      channelFactory: () => channel,
      onReset,
      addStorageListener: (next) => { storageListener = next; },
    });
    const unsubscribe = boundary.subscribeAccountGeneration(listener);
    const event = { version: "music-session/v1", kind: "account-generation", eventId: "remote-generation" };

    for (const receive of channel.listeners) receive({ data: event });
    storageListener?.({ key: "explorers-music-session", newValue: JSON.stringify(event) } as StorageEvent);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(boundary.getAccountGenerationSnapshot()).toBe(0);
    expect(listener).not.toHaveBeenCalled();

    releaseReset();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(boundary.getAccountGenerationSnapshot()).toBe(1);
    unsubscribe();
    boundary.close();
  });

  it("does not advance account generation when realm reset throws or rejects", async () => {
    const module = await import("../musicSessionBoundary");
    const channel = new MemoryChannel();
    MemoryChannel.realms.add(channel);
    const thrown = module.createMusicSessionBoundary({
      channelFactory: () => channel,
      onReset: () => { throw new Error("contained"); },
    });
    for (const receive of channel.listeners) receive({
      data: { version: "music-session/v1", kind: "account-generation", eventId: "thrown-reset" },
    });
    expect(thrown.getAccountGenerationSnapshot()).toBe(0);
    thrown.close();

    const rejectedChannel = new MemoryChannel();
    MemoryChannel.realms.add(rejectedChannel);
    const rejected = module.createMusicSessionBoundary({
      channelFactory: () => rejectedChannel,
      onReset: () => Promise.reject(new Error("contained")),
    });
    for (const receive of rejectedChannel.listeners) receive({
      data: { version: "music-session/v1", kind: "account-generation", eventId: "rejected-reset" },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(rejected.getAccountGenerationSnapshot()).toBe(0);
    rejected.close();
  });

  it("ignores malformed, unrelated, empty, and already-seen transport events", async () => {
    const module = await import("../musicSessionBoundary");
    const channel = new MemoryChannel();
    MemoryChannel.realms.add(channel);
    const onReset = vi.fn();
    let storageListener: ((event: StorageEvent) => void) | undefined;
    const boundary = module.createMusicSessionBoundary({
      channelFactory: () => channel,
      onReset,
      eventId: () => "local-event",
      addStorageListener: (listener) => { storageListener = listener; },
    });
    boundary.publish("logout");
    const values = [
      null,
      {},
      { version: "wrong", kind: "logout", eventId: "event" },
      { version: "music-session/v1", kind: "other", eventId: "event" },
      { version: "music-session/v1", kind: "logout", eventId: "" },
      { version: "music-session/v1", kind: "logout", eventId: "local-event" },
    ];
    for (const value of values) for (const listener of channel.listeners) listener({ data: value });
    storageListener?.({ key: "other", newValue: "{}" } as StorageEvent);
    storageListener?.({ key: "explorers-music-session", newValue: null } as StorageEvent);
    storageListener?.({ key: "explorers-music-session", newValue: "{" } as StorageEvent);
    expect(onReset).not.toHaveBeenCalled();
    boundary.close();
  });

  it("bounds event deduplication memory and supports optional transports with generated IDs", async () => {
    const module = await import("../musicSessionBoundary");
    const channel = new MemoryChannel();
    MemoryChannel.realms.add(channel);
    const onReset = vi.fn();
    let index = 0;
    const boundary = module.createMusicSessionBoundary({
      channelFactory: () => channel,
      onReset,
      eventId: () => `event-${++index}`,
    });
    for (let count = 0; count < 129; count += 1) boundary.publish("account-generation");
    for (const listener of channel.listeners) listener({ data: { version: "music-session/v1", kind: "logout", eventId: "event-1" } });
    expect(onReset).toHaveBeenCalledWith("logout");
    boundary.close();

    const generated = module.createMusicSessionBoundary({ channelFactory: () => channel, onReset });
    generated.publish("logout");
    expect(channel.sent.at(-1)).toMatchObject({ version: "music-session/v1", kind: "logout", eventId: expect.any(String) });
    generated.close();
    const transportless = module.createMusicSessionBoundary({ onReset });
    expect(() => { transportless.publish("logout"); transportless.close(); }).not.toThrow();
  });

  it("wires the default browser boundary and local logout through Music-only cleanup", async () => {
    const module = await import("../musicSessionBoundary");
    const { musicApi, musicIdentityCoordinator } = await import("../musicApi");
    const logout = vi.spyOn(musicApi, "logout");
    const reset = vi.spyOn(musicIdentityCoordinator, "reset");
    window.dispatchEvent(new StorageEvent("storage", {
      key: "explorers-music-session",
      newValue: JSON.stringify({ version: "music-session/v1", kind: "account-generation", eventId: "default-browser-event" }),
    }));
    await vi.waitFor(() => expect(logout).toHaveBeenCalledOnce());
    module.closeLocalMusicSession();
    expect(logout).toHaveBeenCalledTimes(2);
    expect(reset).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent("storage", {
      key: "explorers-music-session",
      newValue: JSON.stringify({ version: "music-session/v1", kind: "logout", eventId: "default-browser-logout" }),
    }));
    await vi.waitFor(() => expect(logout).toHaveBeenCalledTimes(3));
    module.musicSessionBoundary.close();
    logout.mockRestore();
    reset.mockRestore();
  });
});
