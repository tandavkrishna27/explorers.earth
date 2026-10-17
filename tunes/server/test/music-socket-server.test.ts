import express from "express";
import { io as connectSocket, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MusicPrincipalError } from "../middleware/musicPrincipal";
import {
  BoundedSocketEventLimiter,
  createMusicSocketServer,
  MusicOwnerSocketRegistry,
} from "../socket/musicSocketServer";

describe("bounded socket event limiter", () => {
  it("fails closed at live-key saturation and admits a new key only after expired entries are pruned", () => {
    // Break caught: attacker-controlled socket authorities evict live limiter state or grow the map without bound.
    let now = 1_000;
    const limiter = new BoundedSocketEventLimiter({
      eventLimit: 1,
      eventWindowMs: 100,
      maxEntries: 2,
      now: () => now,
    });

    expect(limiter.consume("authority-a")).toBe(false);
    expect(limiter.consume("authority-b")).toBe(false);
    expect(limiter.consume("authority-c")).toBe(true);
    expect(limiter.consume("authority-a")).toBe(true);
    expect(limiter.stats()).toEqual({ size: 2, capacity: 2 });

    now += 101;
    expect(limiter.consume("authority-c")).toBe(false);
    expect(limiter.stats()).toEqual({ size: 1, capacity: 2 });
  });
});

describe("canonical C5 owner and guest capability socket", () => {
  const sockets: Socket[] = [];
  const capability = "A".repeat(43);
  let revoked = false;
  let expired = false;
  let internalFailure = false;
  let pauseAdmission = false;
  let admissionStarted: (() => void) | undefined;
  let resumeAdmission: (() => void) | undefined;
  let pauseOwnerHandshake = false;
  let ownerHandshakeStarted: (() => void) | undefined;
  let resumeOwnerHandshake: (() => void) | undefined;
  let pauseGuestHandshake = false;
  let guestHandshakeStarted: (() => void) | undefined;
  let resumeGuestHandshake: (() => void) | undefined;
  let server: ReturnType<typeof createMusicSocketServer>;
  const ownerRegistry = new MusicOwnerSocketRegistry();
  let url: string;

  beforeAll(async () => {
    server = createMusicSocketServer(express(), {
      allowedOrigins: ["https://explorers.example"],
      ownerCredentials: {
        handshake: async ({ token }) => {
          if (token !== "aaa.bbb.ccc") throw new MusicPrincipalError("TOKEN_INVALID", 401, "invalid");
          if (pauseOwnerHandshake) {
            pauseOwnerHandshake = false;
            ownerHandshakeStarted?.();
            await new Promise<void>((resolve) => { resumeOwnerHandshake = resolve; });
          }
          if (expired) throw new MusicPrincipalError("TOKEN_EXPIRED", 401, "expired");
          return { token, principal: { musicUserId: 41, subject: "owner-41", accountDocumentId: "account", sessionVersion: 2 } };
        },
        recheck: async (context) => {
          if (pauseAdmission) {
            pauseAdmission = false;
            admissionStarted?.();
            await new Promise<void>((resolve) => { resumeAdmission = resolve; });
          }
          if (expired) throw new MusicPrincipalError("TOKEN_EXPIRED", 401, "expired");
          return context.principal;
        },
      },
      resolveGuestCapability: async (candidate) => {
        if (pauseGuestHandshake) {
          pauseGuestHandshake = false;
          guestHandshakeStarted?.();
          await new Promise<void>((resolve) => { resumeGuestHandshake = resolve; });
        }
        if (internalFailure) throw new Error("repository detail");
        return candidate === capability && !revoked
          ? { musicUserId: 41, active: true, allowSongRequests: true }
          : undefined;
      },
      eventLimit: 3,
      ownerRegistry,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("socket test server did not bind");
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.close());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    revoked = false;
    expired = false;
    internalFailure = false;
    pauseAdmission = false;
    admissionStarted = undefined;
    resumeAdmission = undefined;
    pauseOwnerHandshake = false;
    ownerHandshakeStarted = undefined;
    resumeOwnerHandshake = undefined;
    pauseGuestHandshake = false;
    guestHandshakeStarted = undefined;
    resumeGuestHandshake = undefined;
  });

  function connect(auth: Record<string, string>, origin = "https://explorers.example") {
    return new Promise<Socket>((resolve, reject) => {
      const socket = connectSocket(url, { path: "/ws", transports: ["websocket"], reconnection: false, auth, extraHeaders: { Origin: origin } });
      sockets.push(socket);
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", reject);
    });
  }

  it("rejects native/absent credentials and a non-allowlisted origin", async () => {
    // Break caught: session cookies or permissive origins substitute for C5/capability authority.
    await expect(connect({}, "https://evil.example")).rejects.toThrow();
    await expect(connect({ nativeSession: "cosmic.sid" })).rejects.toMatchObject({ data: { error: { code: "TOKEN_INVALID" } } });
    internalFailure = true;
    await expect(connect({ guestCapability: capability })).rejects.toMatchObject({ data: { error: { code: "TOKEN_INVALID" } } });
  });

  it("keeps guest and owner rooms separate while delivering only allowlisted events", async () => {
    // Break caught: a guest joins an owner mutation room or can emit player_state.
    const owner = await connect({ token: "aaa.bbb.ccc" });
    const guest = await connect({ guestCapability: capability });
    const delivered = new Promise<Record<string, unknown>>((resolve) => owner.once("guest_request", resolve));
    guest.emit("guest_request", { type: "song", externalId: "yt:abc" });
    await expect(delivered).resolves.toEqual(expect.objectContaining({ type: "song", externalId: "yt:abc", requestId: expect.any(String) }));
    const denied = new Promise<Record<string, any>>((resolve) => guest.once("music_error", resolve));
    guest.emit("player_state", { playing: true });
    await expect(denied).resolves.toEqual({ version: "music-error/v1", error: expect.objectContaining({ code: "SOCKET_EVENT_FORBIDDEN" }) });
    const unknown = new Promise<Record<string, any>>((resolve) => owner.once("music_error", resolve));
    owner.emit("admin_override", { target: 41 });
    await expect(unknown).resolves.toEqual({ version: "music-error/v1", error: expect.objectContaining({ code: "SOCKET_EVENT_FORBIDDEN", requestId: expect.any(String) }) });
  });

  it("rechecks lifecycle and capability revocation at event time", async () => {
    // Break caught: a connected socket retains authority after token expiry or guest revocation.
    const owner = await connect({ token: "aaa.bbb.ccc" });
    const guest = await connect({ guestCapability: capability });
    revoked = true;
    const guestFailure = new Promise<Record<string, any>>((resolve) => guest.once("music_error", resolve));
    guest.emit("guest_request", { type: "song", externalId: "yt:revoked" });
    await expect(guestFailure).resolves.toEqual({ version: "music-error/v1", error: expect.objectContaining({ code: "GUEST_CAPABILITY_INVALID" }) });
    revoked = false;
    expired = true;
    const ownerFailure = new Promise<Record<string, any>>((resolve) => owner.once("music_error", resolve));
    owner.emit("player_state", { playing: true, position: 1 });
    await expect(ownerFailure).resolves.toEqual({ version: "music-error/v1", error: expect.objectContaining({ code: "TOKEN_EXPIRED" }) });
    expired = false;
  });

  it("disconnects every live owner socket immediately through the lifecycle registry", async () => {
    // Break caught: prepare/suspend relies on the next socket event instead of immediate eviction.
    const first = await connect({ token: "aaa.bbb.ccc" });
    const second = await connect({ token: "aaa.bbb.ccc" });
    const disconnected = Promise.all([
      new Promise<void>((resolve) => first.once("disconnect", () => resolve())),
      new Promise<void>((resolve) => second.once("disconnect", () => resolve())),
    ]);

    await ownerRegistry.disconnectOwner(41);
    await disconnected;
    expect(first.connected).toBe(false);
    expect(second.connected).toBe(false);
  });

  it("fences a paused owner admission when lifecycle revocation crosses the join boundary", async () => {
    // Break caught: prepare/suspend misses a socket admitted between room enumeration and join.
    pauseAdmission = true;
    const started = new Promise<void>((resolve) => { admissionStarted = resolve; });
    const connecting = connect({ token: "aaa.bbb.ccc" });
    await expect(Promise.race([
      started.then(() => "started"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed-out"), 250)),
    ])).resolves.toBe("started");
    const socket = await connecting;
    let liveStatus = false;
    socket.on("connection_status", ({ status }) => { if (status === "connected") liveStatus = true; });
    const disconnected = new Promise<void>((resolve) => socket.once("disconnect", () => resolve()));
    await ownerRegistry.disconnectOwner(41);
    resumeAdmission?.();
    await expect(disconnected).resolves.toBeUndefined();
    expect(liveStatus).toBe(false);
    expect(socket.connected).toBe(false);
  });

  it("evicts a revoked guest before a valid owner broadcasts to guest recipients", async () => {
    // Break caught: a guest that never emits remains in the room after its capability is rotated or revoked.
    const owner = await connect({ token: "aaa.bbb.ccc" });
    const guest = await connect({ guestCapability: capability });
    let received = false;
    guest.once("player_state", () => { received = true; });

    revoked = true;
    owner.emit("player_state", { playing: true, position: 9 });
    await new Promise((resolve) => setTimeout(resolve, 75));

    expect(received).toBe(false);
    expect(guest.connected).toBe(false);
    await expect(connect({ guestCapability: capability })).rejects.toMatchObject({
      data: { error: { code: "GUEST_CAPABILITY_INVALID" } },
    });
    revoked = false;
  });

  it("contains recipient authority lookup failures inside the socket boundary", async () => {
    // Break caught: a rejected capability lookup escapes an async Socket.IO callback as an unhandled rejection.
    const owner = await connect({ token: "aaa.bbb.ccc" });
    const guest = await connect({ guestCapability: capability });
    const failed = new Promise<Record<string, any>>((resolve) => guest.once("music_error", resolve));
    const disconnected = new Promise<void>((resolve) => guest.once("disconnect", () => resolve()));

    internalFailure = true;
    owner.emit("player_state", { playing: true, position: 11 });

    await expect(failed).resolves.toEqual({
      version: "music-error/v1",
      error: expect.objectContaining({ code: "GUEST_CAPABILITY_INVALID", requestId: expect.any(String) }),
    });
    await expect(disconnected).resolves.toBeUndefined();
    expect(owner.connected).toBe(true);
    internalFailure = false;
  });

  it("evicts an expired owner before a valid guest broadcasts to owner recipients", async () => {
    // Break caught: an owner that never emits retains inbound guest-request authority after expiry/revocation.
    const owner = await connect({ token: "aaa.bbb.ccc" });
    const guest = await connect({ guestCapability: capability });
    let received = false;
    owner.once("guest_request", () => { received = true; });

    expired = true;
    guest.emit("guest_request", { type: "song", externalId: "yt:recipient-expiry" });
    await new Promise((resolve) => setTimeout(resolve, 75));

    expect(received).toBe(false);
    expect(owner.connected).toBe(false);
    await expect(connect({ token: "aaa.bbb.ccc" })).rejects.toMatchObject({
      data: { error: { code: "TOKEN_EXPIRED" } },
    });
    expired = false;
  });

  it("enforces reconnect-persistent rate and payload bounds", async () => {
    // Break caught: reconnect resets guest rate authority or oversized payload reaches a room.
    const guest = await connect({ guestCapability: capability });
    const payloadFailure = new Promise<Record<string, any>>((resolve) => guest.once("music_error", resolve));
    guest.emit("guest_request", { type: "song", externalId: "x".repeat(3_000) });
    await expect(payloadFailure).resolves.toEqual({ version: "music-error/v1", error: expect.objectContaining({ code: "PAYLOAD_TOO_LARGE" }) });
    for (let index = 0; index < 3; index += 1) guest.emit("guest_request", { type: "song", externalId: `yt:${index}` });
    await new Promise((resolve) => setTimeout(resolve, 20));
    guest.close();
    const reconnected = await connect({ guestCapability: capability });
    const rateFailure = new Promise<Record<string, any>>((resolve) => reconnected.once("music_error", resolve));
    reconnected.emit("guest_request", { type: "song", externalId: "yt:again" });
    await expect(rateFailure).resolves.toEqual({ version: "music-error/v1", error: expect.objectContaining({ code: "RATE_LIMITED" }) });
    expect(vi.isMockFunction(server.listen)).toBe(false);
  });

  it("closes global admission before disconnecting sockets when suspension-listener safety fails", async () => {
    // Break caught: a handshake awaiting credential resolution survives the one-time Socket.IO disconnect sweep.
    const owner = await connect({ token: "aaa.bbb.ccc" });
    const guest = await connect({ guestCapability: capability });
    pauseOwnerHandshake = true;
    pauseGuestHandshake = true;
    const ownerStarted = new Promise<void>((resolve) => { ownerHandshakeStarted = resolve; });
    const guestStarted = new Promise<void>((resolve) => { guestHandshakeStarted = resolve; });
    const pendingOwner = connect({ token: "aaa.bbb.ccc" });
    const pendingGuest = connect({ guestCapability: capability });
    await Promise.all([ownerStarted, guestStarted]);
    const disconnected = Promise.all([
      new Promise<void>((resolve) => owner.once("disconnect", () => resolve())),
      new Promise<void>((resolve) => guest.once("disconnect", () => resolve())),
    ]);

    await ownerRegistry.disconnectAllSockets();
    resumeOwnerHandshake?.();
    resumeGuestHandshake?.();

    await disconnected;
    await expect(pendingOwner).rejects.toMatchObject({ data: { error: { code: "TOKEN_INVALID" } } });
    await expect(pendingGuest).rejects.toMatchObject({ data: { error: { code: "TOKEN_INVALID" } } });
    expect(owner.connected).toBe(false);
    expect(guest.connected).toBe(false);
  });
});
