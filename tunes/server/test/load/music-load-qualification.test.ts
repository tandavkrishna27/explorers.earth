import { performance } from "node:perf_hooks";
import express from "express";
import { io as connectSocket, type Socket } from "socket.io-client";
import { describe, expect, it, vi } from "vitest";
import { MusicPrincipalError, MusicPrincipalService } from "../../middleware/musicPrincipal";
import { MusicProjectionService } from "../../services/musicProjectionService";
import { StrapiIdentityGateway } from "../../services/strapiIdentityGateway";
import { MusicTokenService } from "../../services/musicTokenService";
import { createMusicSocketServer } from "../../socket/musicSocketServer";
import { percentile } from "../../../scripts/music-qualification";

const active = {
  id: 77,
  strapiUserDocumentId: "load-user",
  strapiAccountDocumentId: "load-account",
  identityStatus: "active" as const,
  sessionVersion: 4,
};

function loadGateway(fetchImpl: typeof fetch) {
  return new StrapiIdentityGateway({
    baseUrl: "https://strapi.invalid",
    fetchImpl,
    maxConcurrency: 8,
    maxPending: 32,
    retries: 0,
    connectTimeoutMs: 250,
    readTimeoutMs: 250,
    overallTimeoutMs: 1_000,
    cacheTtlMs: 30_000,
    circuitFailureThreshold: 3,
    circuitOpenMs: 1_000,
  });
}

async function timed<T>(operation: () => Promise<T>): Promise<{ value: T; durationMs: number }> {
  const started = performance.now();
  const value = await operation();
  return { value, durationMs: performance.now() - started };
}

type SocketLoadResult = {
  schemaVersion: "music-load/v1";
  metric: "socket-owner-guest";
  ownerConnections: number;
  guestConnections: number;
  admittedConnections: number;
  admissionP50Ms: number;
  admissionP95Ms: number;
  acceptedGuestRequests: number;
  rateLimitedGuestRequests: number;
  ownerGuestRequestDeliveries: number;
  guestRequestP50Ms: number;
  guestRequestP95Ms: number;
  ownerPlayerStateEvents: number;
  guestPlayerStateDeliveries: number;
  playerStateP50Ms: number;
  playerStateP95Ms: number;
};

function within<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms`)), timeoutMs);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function connectQualifiedSocket(
  url: string,
  auth: Record<string, string>,
): Promise<{ socket: Socket; durationMs: number }> {
  const started = performance.now();
  const socket = connectSocket(url, {
    path: "/ws",
    transports: ["websocket"],
    reconnection: false,
    auth,
    extraHeaders: { Origin: "https://explorers.example" },
  });
  const connected = new Promise<{ socket: Socket; durationMs: number }>((resolve, reject) => {
    socket.once("connection_status", ({ status }: { status?: string }) => {
      if (status !== "connected") return reject(new Error("socket admission returned an invalid status"));
      resolve({ socket, durationMs: performance.now() - started });
    });
    socket.once("connect_error", reject);
  });
  return await within(connected, 4_000, "socket admission");
}

async function runSocketLoadQualification(): Promise<SocketLoadResult> {
  const ownerCount = 12;
  const guestCount = 24;
  const eventLimit = 16;
  const capability = "Q".repeat(43);
  const sockets: Socket[] = [];
  const server = createMusicSocketServer(express(), {
    allowedOrigins: ["https://explorers.example"],
    ownerCredentials: {
      handshake: async ({ token }) => {
        const match = /^owner-(\d+)\.signed\.token$/.exec(token);
        if (!match) throw new MusicPrincipalError("TOKEN_INVALID", 401, "invalid");
        return {
          token,
          principal: {
            musicUserId: 91,
            subject: `owner-load-${match[1]}`,
            accountDocumentId: "account-load",
            sessionVersion: 3,
          },
        };
      },
      recheck: async ({ principal }) => principal,
    },
    resolveGuestCapability: async (candidate) => candidate === capability
      ? { musicUserId: 91, active: true, allowSongRequests: true }
      : undefined,
    eventLimit,
    eventWindowMs: 30_000,
  });

  try {
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("socket load server did not bind");
    const url = `http://127.0.0.1:${address.port}`;
    const admissions = await Promise.all([
      ...Array.from({ length: ownerCount }, (_, index) => connectQualifiedSocket(url, { token: `owner-${index}.signed.token` })),
      ...Array.from({ length: guestCount }, () => connectQualifiedSocket(url, { guestCapability: capability })),
    ]);
    sockets.push(...admissions.map(({ socket }) => socket));
    const owners = sockets.slice(0, ownerCount);
    const guests = sockets.slice(ownerCount);
    const admissionDurations = admissions.map(({ durationMs }) => durationMs);

    let ownerGuestRequestDeliveries = 0;
    for (const owner of owners) {
      owner.on("guest_request", () => { ownerGuestRequestDeliveries += 1; });
    }
    const guestOutcomes = await Promise.all(guests.map((guest, index) => {
      const started = performance.now();
      const outcome = new Promise<{ kind: "accepted" | "rate-limited"; durationMs: number }>((resolveOutcome, rejectOutcome) => {
        const accepted = () => {
          guest.off("music_error", failed);
          resolveOutcome({ kind: "accepted", durationMs: performance.now() - started });
        };
        const failed = (envelope: { error?: { code?: string } }) => {
          guest.off("guest_request_status", accepted);
          if (envelope.error?.code !== "RATE_LIMITED") {
            rejectOutcome(new Error(`unexpected guest socket failure: ${envelope.error?.code ?? "unknown"}`));
            return;
          }
          resolveOutcome({ kind: "rate-limited", durationMs: performance.now() - started });
        };
        guest.once("guest_request_status", accepted);
        guest.once("music_error", failed);
        guest.emit("guest_request", { type: "song", externalId: `load:guest:${index}` });
      });
      return within(outcome, 4_000, `guest request ${index}`);
    }));
    const acceptedGuestRequests = guestOutcomes.filter(({ kind }) => kind === "accepted");
    const rateLimitedGuestRequests = guestOutcomes.filter(({ kind }) => kind === "rate-limited");

    const playerStateStarted = new Map<string, number>();
    const playerStateFirstDeliveries = new Map<string, number>();
    let guestPlayerStateDeliveries = 0;
    const allPlayerStatesDelivered = new Promise<void>((resolveDelivered) => {
      for (const guest of guests) {
        guest.on("player_state", ({ externalId }: { externalId?: string }) => {
          guestPlayerStateDeliveries += 1;
          if (externalId && !playerStateFirstDeliveries.has(externalId)) {
            playerStateFirstDeliveries.set(externalId, performance.now() - (playerStateStarted.get(externalId) ?? performance.now()));
          }
          if (guestPlayerStateDeliveries === ownerCount * guestCount) resolveDelivered();
        });
      }
    });
    for (const [index, owner] of owners.entries()) {
      const externalId = `load:owner:${index}`;
      playerStateStarted.set(externalId, performance.now());
      owner.emit("player_state", { playing: index % 2 === 0, position: index, externalId });
    }
    await within(allPlayerStatesDelivered, 4_000, "owner player-state delivery");

    const guestRequestDurations = acceptedGuestRequests.map(({ durationMs }) => durationMs);
    const playerStateDurations = [...playerStateFirstDeliveries.values()];
    return {
      schemaVersion: "music-load/v1",
      metric: "socket-owner-guest",
      ownerConnections: owners.length,
      guestConnections: guests.length,
      admittedConnections: admissions.length,
      admissionP50Ms: percentile(admissionDurations, 0.5),
      admissionP95Ms: percentile(admissionDurations, 0.95),
      acceptedGuestRequests: acceptedGuestRequests.length,
      rateLimitedGuestRequests: rateLimitedGuestRequests.length,
      ownerGuestRequestDeliveries,
      guestRequestP50Ms: percentile(guestRequestDurations, 0.5),
      guestRequestP95Ms: percentile(guestRequestDurations, 0.95),
      ownerPlayerStateEvents: playerStateFirstDeliveries.size,
      guestPlayerStateDeliveries,
      playerStateP50Ms: percentile(playerStateDurations, 0.5),
      playerStateP95Ms: percentile(playerStateDurations, 0.95),
    };
  } finally {
    for (const socket of sockets) socket.close();
    if (server.listening) await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

describe("bounded Music load qualification", () => {
  it("bounds concurrent owner and guest socket admission, delivery, and shared guest rate saturation", async () => {
    // Break caught: socket qualification stays synthetic, reconnects reset a guest's shared
    // event budget, or a concurrent owner/guest wave stalls or drops authorized broadcasts.
    const result = await runSocketLoadQualification();

    expect(result).toMatchObject({
      schemaVersion: "music-load/v1",
      metric: "socket-owner-guest",
      ownerConnections: 12,
      guestConnections: 24,
      admittedConnections: 36,
      acceptedGuestRequests: 16,
      rateLimitedGuestRequests: 8,
      ownerGuestRequestDeliveries: 192,
      ownerPlayerStateEvents: 12,
      guestPlayerStateDeliveries: 288,
    });
    expect(result.admissionP50Ms).toBeLessThan(2_000);
    expect(result.admissionP95Ms).toBeLessThan(4_000);
    expect(result.guestRequestP50Ms).toBeLessThan(2_000);
    expect(result.guestRequestP95Ms).toBeLessThan(4_000);
    expect(result.playerStateP50Ms).toBeLessThan(2_000);
    expect(result.playerStateP95Ms).toBeLessThan(4_000);
    console.info(JSON.stringify(result));
  }, 15_000);

  it("coalesces 50 concurrent first ensures and serves 200 cached identity calls", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        documentId: "load-user",
        username: "load",
        email: "load@example.invalid",
        provider: "local",
        confirmed: true,
        blocked: false,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{
        documentId: "load-account",
        Account_Name: "Load",
        Account_Type: "Venue",
        mobile_number: "+15555550111",
      }], meta: { pagination: { page: 1, pageSize: 50, pageCount: 1, total: 1 } } }), { status: 200 }));
    const gateway = loadGateway(fetchImpl);
    const ensureIdentity = vi.fn(async () => {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
      return active;
    });
    const service = new MusicProjectionService(gateway, { ensureIdentity });

    const first = await Promise.all(Array.from({ length: 50 }, async (_, index) => await timed(async () =>
      await service.ensure("same-proof-with-load-entropy", `first-${index}`))));
    expect(new Set(first.map(({ value }) => value.id))).toEqual(new Set([77]));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(ensureIdentity).toHaveBeenCalledTimes(1);
    expect(service.stats()).toMatchObject({ coalesced: 49, peakInflight: 1, inflight: 0 });

    const cached = await Promise.all(Array.from({ length: 200 }, async (_, index) => await timed(async () =>
      await gateway.resolve("same-proof-with-load-entropy", `cached-${index}`))));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(cached.every(({ value }) => value.userDocumentId === "load-user")).toBe(true);
    const cachedP95Ms = percentile(cached.map(({ durationMs }) => durationMs), 0.95);
    const firstP95Ms = percentile(first.map(({ durationMs }) => durationMs), 0.95);
    expect(firstP95Ms).toBeLessThan(1_000);
    expect(cachedP95Ms).toBeLessThan(100);
    console.info(JSON.stringify({
      schemaVersion: "music-unit-load/v1",
      metric: "ensure",
      firstEnsure50Ms: Math.ceil(Math.max(...first.map(({ durationMs }) => durationMs))),
      firstEnsureP50Ms: percentile(first.map(({ durationMs }) => durationMs), 0.5),
      firstEnsureP95Ms: firstP95Ms,
      cachedCalls: 200,
      cachedP50Ms: percentile(cached.map(({ durationMs }) => durationMs), 0.5),
      cachedP95Ms,
      strapiCalls: fetchImpl.mock.calls.length,
    }));
  });

  it("serves 200 ordinary owner resolutions with zero Strapi calls and contains an invalid-token storm", async () => {
    let localReads = 0;
    const tokens = new MusicTokenService({
      current: { kid: "load-current", secret: Buffer.alloc(32, 0x61).toString("base64url") },
      tokenLifetimeSeconds: 600,
      clockSkewSeconds: 10,
    }, { now: () => 1_800_000_000_000 });
    const principal = new MusicPrincipalService(tokens, {
      resolveCredentialSubject: async () => {
        localReads += 1;
        return { identity: active, tombstoned: false };
      },
    });
    const credential = tokens.mint(active).token;
    const owner = await Promise.all(Array.from({ length: 200 }, async () => await timed(async () =>
      await principal.resolve(credential))));
    expect(owner.every(({ value }) => value.musicUserId === 77)).toBe(true);
    expect(localReads).toBe(200);
    const ownerP95Ms = percentile(owner.map(({ durationMs }) => durationMs), 0.95);
    expect(ownerP95Ms).toBeLessThan(100);

    const invalid = await Promise.allSettled(Array.from({ length: 200 }, (_, index) =>
      principal.resolve(`invalid-token-${index}`)));
    expect(invalid.every((result) => result.status === "rejected"
      && (result.reason as { code?: string }).code === "TOKEN_INVALID")).toBe(true);
    expect(localReads).toBe(200);
    console.info(JSON.stringify({
      schemaVersion: "music-unit-load/v1",
      metric: "owner",
      ownerCalls: 200,
      ownerP50Ms: percentile(owner.map(({ durationMs }) => durationMs), 0.5),
      ownerP95Ms,
      strapiCalls: 0,
      invalidTokensRejected: 200,
    }));
  });
});
