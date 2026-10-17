import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PUBLIC_PROFILE_INVALIDATION_SEEN_EVENT_LIMIT,
  PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY,
  publishPublicProfileInvalidation,
  subscribePublicProfileInvalidation,
} from "../publicProfileInvalidation";

const payload = {
  accountDocumentId: "account-alice",
  username: "alice",
  category: "public_books",
  action: "pin",
  eventId: "event-1",
};

describe("public profile invalidation", () => {
  beforeEach(() => {
    vi.stubGlobal("BroadcastChannel", undefined);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("publishes the complete profile-scoped contract to same-document subscribers", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribePublicProfileInvalidation((event) => received.push(event));

    publishPublicProfileInvalidation(payload);

    expect(received).toEqual([expect.objectContaining({
      version: expect.any(String),
      eventId: "event-1",
      accountDocumentId: "account-alice",
      username: "alice",
      category: "public_books",
      action: "pin",
      timestamp: expect.any(Number),
    })]);
    unsubscribe();
  });

  it("ignores malformed payloads and duplicate event ids", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribePublicProfileInvalidation((event) => received.push(event));

    window.dispatchEvent(new StorageEvent("storage", {
      key: PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY,
      newValue: JSON.stringify({ version: "wrong", ...payload, eventId: "duplicate-event" }),
    }));
    window.dispatchEvent(new StorageEvent("storage", {
      key: PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY,
      newValue: JSON.stringify({ version: "public-profile-invalidation/v1", ...payload, eventId: "duplicate-event", timestamp: Date.now() }),
    }));
    window.dispatchEvent(new StorageEvent("storage", {
      key: PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY,
      newValue: JSON.stringify({ version: "public-profile-invalidation/v1", ...payload, eventId: "duplicate-event", timestamp: Date.now() }),
    }));

    expect(received).toHaveLength(1);
    unsubscribe();
  });

  it("receives a valid storage fallback event when BroadcastChannel is unavailable", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribePublicProfileInvalidation((event) => received.push(event));

    window.dispatchEvent(new StorageEvent("storage", {
      key: PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY,
      newValue: JSON.stringify({ version: "public-profile-invalidation/v1", ...payload, eventId: "storage-event", timestamp: Date.now() }),
    }));

    expect(received).toEqual([expect.objectContaining({ eventId: "storage-event" })]);
    unsubscribe();
  });

  it("opens BroadcastChannel during publication even when the dashboard has no subscriber", () => {
    class TestBroadcastChannel {
      static instances: TestBroadcastChannel[] = [];
      postMessage = vi.fn();
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      close = vi.fn();
      constructor(_name: string) { TestBroadcastChannel.instances.push(this); }
    }
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);

    publishPublicProfileInvalidation({ ...payload, eventId: "broadcast-event" });

    expect(TestBroadcastChannel.instances).toHaveLength(1);
    expect(TestBroadcastChannel.instances[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ eventId: "broadcast-event" }));
    const unsubscribe = subscribePublicProfileInvalidation(() => undefined);
    unsubscribe();
  });

  it("receives valid cross-tab BroadcastChannel messages", () => {
    class TestBroadcastChannel {
      static instances: TestBroadcastChannel[] = [];
      listener?: (event: MessageEvent) => void;
      postMessage = vi.fn();
      addEventListener = vi.fn((type: string, listener: (event: MessageEvent) => void) => { if (type === "message") this.listener = listener; });
      removeEventListener = vi.fn();
      close = vi.fn();
      constructor(_name: string) { TestBroadcastChannel.instances.push(this); }
      emit(value: unknown) { this.listener?.({ data: value } as MessageEvent); }
    }
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    const received: unknown[] = [];
    const unsubscribe = subscribePublicProfileInvalidation((event) => received.push(event));

    TestBroadcastChannel.instances[0].emit({ version: "public-profile-invalidation/v1", ...payload, eventId: "broadcast-inbound", timestamp: Date.now() });

    expect(received).toEqual([expect.objectContaining({ eventId: "broadcast-inbound" })]);
    unsubscribe();
  });

  it("bounds the recently seen event-id cache", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribePublicProfileInvalidation((event) => received.push(event));
    const timestamp = Date.now();
    for (let index = 0; index <= PUBLIC_PROFILE_INVALIDATION_SEEN_EVENT_LIMIT; index += 1) {
      window.dispatchEvent(new StorageEvent("storage", {
        key: PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY,
        newValue: JSON.stringify({ version: "public-profile-invalidation/v1", ...payload, eventId: `bounded-${index}`, timestamp }),
      }));
    }
    window.dispatchEvent(new StorageEvent("storage", {
      key: PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY,
      newValue: JSON.stringify({ version: "public-profile-invalidation/v1", ...payload, eventId: "bounded-0", timestamp }),
    }));

    expect(received).toHaveLength(PUBLIC_PROFILE_INVALIDATION_SEEN_EVENT_LIMIT + 2);
    unsubscribe();
  });
});
