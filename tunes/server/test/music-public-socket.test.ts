import express from "express";
import type { Server } from "node:http";
import { io as connectSocket, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createMusicSocketServer, MusicPublicSocketRegistry } from "../socket/musicSocketServer";

describe("read-only public Music socket", () => {
  let server: Server | undefined;
  const sockets: Socket[] = [];
  afterEach(async () => {
    sockets.forEach((socket) => socket.close());
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  });

  it("admits public slug and bound unlisted capability, isolates rooms, and forbids all browser mutation events", async () => {
    // Break caught: public listeners require owner authority, an unlisted capability can be
    // replayed against another slug, or a read-only listener can mutate owner state.
    const capability = "C".repeat(43);
    const registry = new MusicPublicSocketRegistry();
    server = createMusicSocketServer(express(), {
      allowedOrigins: ["https://explorers.example"],
      ownerCredentials: { handshake: async () => { throw new Error("unused"); }, recheck: async () => { throw new Error("unused"); } },
      resolveGuestCapability: async () => undefined,
      resolvePublicMusicAuthority: async (slug, candidate) => {
        if (slug === "public-one") return { musicUserId: 1, active: true };
        if (slug === "unlisted-one" && candidate === capability) return { musicUserId: 2, active: true };
        return undefined;
      },
      publicRegistry: registry,
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const connect = (auth: Record<string, string>) => new Promise<Socket>((resolve, reject) => {
      const socket = connectSocket(`http://127.0.0.1:${address.port}`, { path: "/ws", transports: ["websocket"], reconnection: false, auth, extraHeaders: { Origin: "https://explorers.example" } });
      sockets.push(socket); socket.once("connect", () => resolve(socket)); socket.once("connect_error", reject);
    });
    const publicSocket = await connect({ publicSlug: "public-one" });
    const unlistedSocket = await connect({ publicSlug: "unlisted-one", guestCapability: capability });
    await expect(connect({ publicSlug: "unlisted-one" })).rejects.toBeTruthy();
    const promotedPublicSocket = await connect({ publicSlug: "public-one", guestCapability: capability });
    expect(promotedPublicSocket.connected).toBe(true);

    const publicEvent = new Promise((resolve) => publicSocket.once("music_public_change", resolve));
    let leaked = false; unlistedSocket.once("music_public_change", () => { leaked = true; });
    await registry.publish({ musicUserId: 1, kind: "queue_changed", revision: 8 });
    await expect(publicEvent).resolves.toEqual({ version: "music-public-change/v1", kind: "queue_changed", revision: 8 });
    expect(leaked).toBe(false);

    const denied = new Promise<Record<string, unknown>>((resolve) => publicSocket.once("music_error", resolve));
    publicSocket.emit("guest_request", { type: "song", externalId: "yt:abc" });
    await expect(denied).resolves.toMatchObject({ error: { code: "SOCKET_EVENT_FORBIDDEN" } });
  });

  it("publishes canonical invalidations to the matching authorized owner without leaking across owners", async () => {
    const registry = new MusicPublicSocketRegistry();
    server = createMusicSocketServer(express(), {
      allowedOrigins: ["https://explorers.example"],
      ownerCredentials: {
        handshake: async ({ token }) => ({ token, principal: { musicUserId: token === "owner.one.token" ? 1 : 2, subject: token, accountDocumentId: token, sessionVersion: 1 } }),
        recheck: async (context) => context.principal,
      },
      resolveGuestCapability: async () => undefined,
      resolvePublicMusicAuthority: async () => undefined,
      publicRegistry: registry,
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const connect = (token: string) => new Promise<Socket>((resolve, reject) => {
      const socket = connectSocket(`http://127.0.0.1:${address.port}`, { path: "/ws", transports: ["websocket"], reconnection: false, auth: { token }, extraHeaders: { Origin: "https://explorers.example" } });
      sockets.push(socket); socket.once("connect", () => resolve(socket)); socket.once("connect_error", reject);
    });
    const owner = await connect("owner.one.token");
    const otherOwner = await connect("owner.two.token");
    const received = new Promise((resolve) => owner.once("music_owner_change", resolve));
    let leaked = false; otherOwner.once("music_owner_change", () => { leaked = true; });

    await registry.publish({ musicUserId: 1, kind: "queue_changed", revision: 9 });

    await expect(received).resolves.toEqual({ version: "music-owner-change/v1", kind: "queue_changed", revision: 9 });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(leaked).toBe(false);
  });

  it("rechecks owner authority before delivering an invalidation", async () => {
    const registry = new MusicPublicSocketRegistry();
    let revoked = false;
    server = createMusicSocketServer(express(), {
      allowedOrigins: ["https://explorers.example"],
      ownerCredentials: {
        handshake: async ({ token }) => ({ token, principal: { musicUserId: 1, subject: "owner", accountDocumentId: "account", sessionVersion: 1 } }),
        recheck: async (context) => {
          if (revoked) throw new Error("revoked");
          return context.principal;
        },
      },
      resolveGuestCapability: async () => undefined,
      resolvePublicMusicAuthority: async () => undefined,
      publicRegistry: registry,
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const owner = await new Promise<Socket>((resolve, reject) => {
      const socket = connectSocket(`http://127.0.0.1:${address.port}`, { path: "/ws", transports: ["websocket"], reconnection: false, auth: { token: "owner.one.token" }, extraHeaders: { Origin: "https://explorers.example" } });
      sockets.push(socket); socket.once("connect", () => resolve(socket)); socket.once("connect_error", reject);
    });
    let delivered = false; owner.once("music_owner_change", () => { delivered = true; });
    const disconnected = new Promise<void>((resolve) => owner.once("disconnect", () => resolve()));
    revoked = true;

    await registry.publish({ musicUserId: 1, kind: "queue_changed", revision: 10 });

    await expect(disconnected).resolves.toBeUndefined();
    expect(delivered).toBe(false);
  });

  it("disconnects sockets for deleted identities during listener catch-up", async () => {
    const registry = new MusicPublicSocketRegistry();
    let active = true;
    server = createMusicSocketServer(express(), {
      allowedOrigins: ["https://explorers.example"],
      ownerCredentials: { handshake: async () => { throw new Error("unused"); }, recheck: async () => { throw new Error("unused"); } },
      resolveGuestCapability: async () => undefined,
      resolvePublicMusicAuthority: async (slug) => active && slug === "public-one"
        ? { musicUserId: 1, active: true }
        : undefined,
      resolvePublicMusicRevision: async () => active ? 7 : undefined,
      publicRegistry: registry,
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const publicSocket = await new Promise<Socket>((resolve, reject) => {
      const socket = connectSocket(`http://127.0.0.1:${address.port}`, { path: "/ws", transports: ["websocket"], reconnection: false, auth: { publicSlug: "public-one" }, extraHeaders: { Origin: "https://explorers.example" } });
      sockets.push(socket); socket.once("connect", () => resolve(socket)); socket.once("connect_error", reject);
    });
    const disconnected = new Promise<void>((resolve) => publicSocket.once("disconnect", () => resolve()));

    active = false;
    await registry.catchUp();

    await expect(disconnected).resolves.toBeUndefined();
  });

  it("disconnects revoked owner sockets when catch-up has no identity revision", async () => {
    const registry = new MusicPublicSocketRegistry();
    let active = true;
    server = createMusicSocketServer(express(), {
      allowedOrigins: ["https://explorers.example"],
      ownerCredentials: {
        handshake: async ({ token }) => ({ token, principal: { musicUserId: 1, subject: "owner", accountDocumentId: "account", sessionVersion: 1 } }),
        recheck: async (context) => {
          if (!active) throw new Error("deleted");
          return context.principal;
        },
      },
      resolveGuestCapability: async () => undefined,
      resolvePublicMusicAuthority: async () => undefined,
      resolvePublicMusicRevision: async () => active ? 7 : undefined,
      publicRegistry: registry,
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const ownerSocket = await new Promise<Socket>((resolve, reject) => {
      const socket = connectSocket(`http://127.0.0.1:${address.port}`, { path: "/ws", transports: ["websocket"], reconnection: false, auth: { token: "owner.token" }, extraHeaders: { Origin: "https://explorers.example" } });
      sockets.push(socket); socket.once("connect", () => resolve(socket)); socket.once("connect_error", reject);
    });
    const disconnected = new Promise<void>((resolve) => ownerSocket.once("disconnect", () => resolve()));

    active = false;
    await registry.catchUp();

    await expect(disconnected).resolves.toBeUndefined();
  });
});
