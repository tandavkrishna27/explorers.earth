import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { Express } from "express";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { MusicIdentityError, musicErrorEnvelope } from "../../shared/musicError";
import { MusicPrincipalError, type MusicPrincipal, type MusicSocketCredentialContext } from "../middleware/musicPrincipal";
import type { PublicMusicInvalidationKind } from "../repositories/publicMusicRevision";
import type { MusicPublicObservability } from "../observability/musicPublicObservability";

interface OwnerCredentialVerifier {
  handshake(input: { token: string }): Promise<MusicSocketCredentialContext>;
  recheck(context: MusicSocketCredentialContext): Promise<MusicPrincipal>;
}

export class MusicOwnerSocketRegistry {
  private disconnect: ((musicUserId: number) => Promise<void>) | undefined;
  private disconnectAll: (() => Promise<void>) | undefined;
  private readonly epochs = new Map<number, number>();
  private admissionEpoch = 0;
  private admissionsOpen = true;

  bind(disconnect: (musicUserId: number) => Promise<void>, disconnectAll?: () => Promise<void>): void {
    if (this.disconnect) throw new Error("Music owner socket registry is already bound");
    this.disconnect = disconnect;
    this.disconnectAll = disconnectAll;
  }

  async disconnectAllSockets(): Promise<void> {
    if (!this.disconnectAll) throw new Error("Music socket registry is unavailable");
    this.admissionsOpen = false;
    this.admissionEpoch += 1;
    await this.disconnectAll();
  }

  async disconnectOwner(musicUserId: number): Promise<void> {
    if (!Number.isSafeInteger(musicUserId) || musicUserId < 1 || !this.disconnect) {
      throw new Error("Music owner socket registry is unavailable");
    }
    this.epochs.set(musicUserId, this.captureEpoch(musicUserId) + 1);
    await this.disconnect(musicUserId);
  }

  captureEpoch(musicUserId: number): number {
    return this.epochs.get(musicUserId) ?? 0;
  }

  isCurrent(musicUserId: number, epoch: number): boolean {
    return this.captureEpoch(musicUserId) === epoch;
  }

  captureAdmissionEpoch(): number {
    return this.admissionEpoch;
  }

  isAdmissionCurrent(epoch: number): boolean {
    return this.admissionsOpen && this.admissionEpoch === epoch;
  }
}

type PublicMusicChange = { musicUserId: number; kind: PublicMusicInvalidationKind; revision: number };

export class MusicPublicSocketRegistry {
  private publishChange: ((change: PublicMusicChange) => Promise<void>) | undefined;
  private catchUpChanges: (() => Promise<void>) | undefined;

  bind(publish: (change: PublicMusicChange) => Promise<void>, catchUp: () => Promise<void>): void {
    if (this.publishChange) throw new Error("Music public socket registry is already bound");
    this.publishChange = publish;
    this.catchUpChanges = catchUp;
  }

  async publish(change: PublicMusicChange): Promise<void> {
    if (!this.publishChange) throw new Error("Music public socket registry is unavailable");
    await this.publishChange(change);
  }

  async catchUp(): Promise<void> {
    if (!this.catchUpChanges) throw new Error("Music public socket registry is unavailable");
    await this.catchUpChanges();
  }
}

export interface MusicSocketDependencies {
  allowedOrigins: string[];
  ownerCredentials: OwnerCredentialVerifier;
  resolveGuestCapability(capability: string): Promise<{
    musicUserId: number;
    active: boolean;
    allowSongRequests: boolean;
  } | undefined>;
  resolvePublicMusicAuthority?(publicSlug: string, capability?: string): Promise<{
    musicUserId: number;
    active: boolean;
  } | undefined>;
  resolvePublicMusicRevision?(musicUserId: number): Promise<number | undefined>;
  eventLimit?: number;
  eventWindowMs?: number;
  eventRateMaxEntries?: number;
  ownerRegistry?: MusicOwnerSocketRegistry;
  publicRegistry?: MusicPublicSocketRegistry;
  observability?: MusicPublicObservability;
}

type SocketAuthority =
  | { role: "owner"; musicUserId: number; owner: MusicSocketCredentialContext; rateKey: string }
  | { role: "guest"; musicUserId: number; capability: string; rateKey: string }
  | { role: "public"; musicUserId: number; publicSlug: string; capability?: string; rateKey: string };

export class BoundedSocketEventLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly configuration: {
    eventLimit: number;
    eventWindowMs: number;
    maxEntries: number;
    now?: () => number;
  }) {
    if (!Number.isSafeInteger(configuration.eventLimit) || configuration.eventLimit < 1 || configuration.eventLimit > 10_000
        || !Number.isSafeInteger(configuration.eventWindowMs) || configuration.eventWindowMs < 1 || configuration.eventWindowMs > 3_600_000
        || !Number.isSafeInteger(configuration.maxEntries) || configuration.maxEntries < 1 || configuration.maxEntries > 100_000) {
      throw new Error("Music socket limiter configuration is invalid");
    }
  }

  consume(key: string): boolean {
    const now = (this.configuration.now ?? Date.now)();
    const current = this.entries.get(key);
    if (current && current.resetAt > now) {
      current.count += 1;
      return current.count > this.configuration.eventLimit;
    }
    if (current) this.entries.delete(key);
    this.prune(now);
    if (this.entries.size >= this.configuration.maxEntries) return true;
    this.entries.set(key, { count: 1, resetAt: now + this.configuration.eventWindowMs });
    return false;
  }

  stats(): { size: number; capacity: number } {
    this.prune((this.configuration.now ?? Date.now)());
    return { size: this.entries.size, capacity: this.configuration.maxEntries };
  }

  private prune(now: number): void {
    this.entries.forEach((entry, key) => {
      if (entry.resetAt <= now) this.entries.delete(key);
    });
  }
}

export function createMusicSocketServer(app: Express, dependencies: MusicSocketDependencies): Server {
  const server = createServer(app);
  const io = new SocketIOServer(server, {
    path: "/ws",
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 64 * 1024,
    cors: { origin: dependencies.allowedOrigins, credentials: false, methods: ["GET", "POST"] },
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(origin && dependencies.allowedOrigins.includes(origin) ? undefined : "origin not allowed", !!origin && dependencies.allowedOrigins.includes(origin));
    },
  });
  dependencies.ownerRegistry?.bind(
    async (musicUserId) => {
      const sockets = await io.in(`music-owner:${musicUserId}`).fetchSockets();
      await Promise.all(sockets.map(async (socket) => {
        socket.emit("music_error", musicErrorEnvelope(
          new MusicIdentityError("TOKEN_REVOKED", 401, "The Music credential has been revoked.", "authenticate", false),
          randomUUID(),
        ));
        socket.disconnect(true);
      }));
    },
    async () => { io.disconnectSockets(true); },
  );
  dependencies.publicRegistry?.bind(async ({ musicUserId, kind, revision }) => {
    const recipients = await io.in(`music-public:${musicUserId}`).fetchSockets();
    await Promise.all(recipients.map(async (recipient) => {
      const authority = recipient.data.musicAuthority as SocketAuthority | undefined;
      if (authority?.role !== "public") return;
      const current = await dependencies.resolvePublicMusicAuthority?.(authority.publicSlug, authority.capability).catch(() => undefined);
      recipient.emit("music_public_change", { version: "music-public-change/v1", kind, revision });
      dependencies.observability?.socket("invalidation_sent", { role: "public", kind });
      if (!current?.active || current.musicUserId !== musicUserId) {
        dependencies.observability?.socket("revocation_enforced", { role: "public", reason: "revoked" });
        recipient.disconnect(true);
      }
    }));
    const owners = await io.in(`music-owner:${musicUserId}`).fetchSockets();
    await Promise.all(owners.map(async (recipient) => {
      const authority = recipient.data.musicAuthority as SocketAuthority | undefined;
      if (authority?.role !== "owner") return;
      try {
        const principal = await dependencies.ownerCredentials.recheck(authority.owner);
        if (principal.musicUserId !== musicUserId) throw new MusicPrincipalError("TOKEN_REVOKED", 401, "The Music credential has been revoked.");
        recipient.emit("music_owner_change", { version: "music-owner-change/v1", kind, revision });
        dependencies.observability?.socket("invalidation_sent", { role: "owner", kind });
      } catch (cause) {
        recipient.emit("music_error", musicErrorEnvelope(safeSocketError(cause), randomUUID()));
        dependencies.observability?.socket("revocation_enforced", { role: "owner", reason: "revoked" });
        recipient.disconnect(true);
      }
    }));
  }, async () => {
    const sockets = await io.fetchSockets();
    const musicUserIds = new Set<number>();
    for (const socket of sockets) {
      const authority = socket.data.musicAuthority as SocketAuthority | undefined;
      if (authority) musicUserIds.add(authority.musicUserId);
    }
    await Promise.all(Array.from(musicUserIds, async (musicUserId) => {
      const revision = await dependencies.resolvePublicMusicRevision?.(musicUserId);
      // A missing revision is itself meaningful: the identity may have been
      // suspended or deleted while LISTEN was disconnected. Publish a stale
      // sentinel so the normal authority recheck disconnects those sockets.
      await dependencies.publicRegistry!.publish({ musicUserId, kind: "publication_changed", revision: revision ?? 0 });
    }));
  });
  const eventLimit = dependencies.eventLimit ?? 10;
  const eventWindowMs = dependencies.eventWindowMs ?? 60_000;
  const limiter = new BoundedSocketEventLimiter({
    eventLimit,
    eventWindowMs,
    maxEntries: dependencies.eventRateMaxEntries ?? 1_024,
  });

  const authorityIsCurrent = async (authority: SocketAuthority, expectedRole: SocketAuthority["role"]): Promise<boolean> => {
    if (authority.role !== expectedRole) return false;
    try {
      if (authority.role === "owner") {
        const principal = await dependencies.ownerCredentials.recheck(authority.owner);
        return principal.musicUserId === authority.musicUserId;
      }
      if (authority.role === "public") {
        const publication = await dependencies.resolvePublicMusicAuthority?.(authority.publicSlug, authority.capability);
        return publication?.active === true && publication.musicUserId === authority.musicUserId;
      }
      const guest = await dependencies.resolveGuestCapability(authority.capability);
      return guest?.active === true && guest.musicUserId === authority.musicUserId;
    } catch {
      return false;
    }
  };

  const emitToAuthorizedRecipients = async (
    room: string,
    expectedRole: SocketAuthority["role"],
    event: string,
    payload: unknown,
  ) => {
    const recipients = await io.in(room).fetchSockets();
    await Promise.all(recipients.map(async (recipient) => {
      const recipientAuthority = recipient.data.musicAuthority as SocketAuthority | undefined;
      if (!recipientAuthority || !await authorityIsCurrent(recipientAuthority, expectedRole)) {
        const error = recipientAuthority?.role === "guest" ? guestInvalid() : new MusicPrincipalError("TOKEN_REVOKED", 401, "The Music credential has been revoked.");
        recipient.emit("music_error", musicErrorEnvelope(safeSocketError(error), randomUUID()));
        await recipient.leave(room);
        recipient.disconnect(true);
        return;
      }
      recipient.emit(event, payload);
    }));
  };

  io.use(async (socket, next) => {
    try {
      const admissionEpoch = dependencies.ownerRegistry?.captureAdmissionEpoch();
      if (admissionEpoch !== undefined && !dependencies.ownerRegistry?.isAdmissionCurrent(admissionEpoch)) throw admissionUnavailable();
      const origin = socket.handshake.headers.origin;
      if (!origin || !dependencies.allowedOrigins.includes(origin)) throw routeError("ORIGIN_FORBIDDEN", 403, "The socket origin is not allowed.");
      const auth = socket.handshake.auth;
      const token = typeof auth?.token === "string" ? auth.token : undefined;
      const capability = typeof auth?.guestCapability === "string" ? auth.guestCapability : undefined;
      const publicSlug = typeof auth?.publicSlug === "string" ? auth.publicSlug : undefined;
      if ((token ? 1 : 0) + (publicSlug ? 1 : 0) + (!publicSlug && capability ? 1 : 0) !== 1) throw new MusicPrincipalError("TOKEN_INVALID", 401, "A single Music socket credential is required.");
      let authority: SocketAuthority;
      if (token) {
        const owner = await dependencies.ownerCredentials.handshake({ token });
        authority = {
          role: "owner",
          musicUserId: owner.principal.musicUserId,
          owner,
          rateKey: `owner:${owner.principal.subject}`,
        };
      } else if (publicSlug) {
        if (!/^[A-Za-z0-9_-]{8,128}$/.test(publicSlug)
            || capability !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(capability)) throw guestInvalid();
        const publication = await dependencies.resolvePublicMusicAuthority?.(publicSlug, capability);
        if (!publication?.active) throw guestInvalid();
        authority = {
          role: "public", musicUserId: publication.musicUserId, publicSlug, capability,
          rateKey: `public:${createHash("sha256").update(`${publicSlug}:${capability ?? "public"}`).digest("hex")}`,
        };
      } else {
        if (!capability || !/^[A-Za-z0-9_-]{43}$/.test(capability)) throw guestInvalid();
        const guest = await dependencies.resolveGuestCapability(capability);
        if (!guest?.active) throw guestInvalid();
        authority = {
          role: "guest",
          musicUserId: guest.musicUserId,
          capability,
          rateKey: `guest:${createHash("sha256").update(capability).digest("hex")}`,
        };
      }
      if (admissionEpoch !== undefined && !dependencies.ownerRegistry?.isAdmissionCurrent(admissionEpoch)) throw admissionUnavailable();
      socket.data.musicAuthority = authority;
      socket.data.musicAdmissionEpoch = admissionEpoch;
      dependencies.observability?.socket("admitted", { role: authority.role });
      next();
    } catch (cause) {
      const error = safeSocketError(cause);
      const failure = new Error(error.message) as Error & { data?: unknown };
      failure.data = musicErrorEnvelope(error, randomUUID());
      dependencies.observability?.socket("rejected", { reason: error.code === "ORIGIN_FORBIDDEN" ? "origin" : "invalid" });
      next(failure);
    }
  });

  io.on("connection", (socket: Socket) => {
    void (async () => {
    const authority = socket.data.musicAuthority as SocketAuthority;
    const admissionEpoch = socket.data.musicAdmissionEpoch as number | undefined;
    const admissionIsCurrent = () => admissionEpoch === undefined
      || dependencies.ownerRegistry?.isAdmissionCurrent(admissionEpoch) === true;
    const room = authority.role === "owner"
      ? `music-owner:${authority.musicUserId}`
      : authority.role === "guest" ? `music-guest:${authority.musicUserId}` : `music-public:${authority.musicUserId}`;
    const ownerEpoch = authority.role === "owner"
      ? dependencies.ownerRegistry?.captureEpoch(authority.musicUserId)
      : undefined;
    if (!admissionIsCurrent()
        || !await authorityIsCurrent(authority, authority.role)
        || !admissionIsCurrent()
        || ownerEpoch !== undefined && !dependencies.ownerRegistry?.isCurrent(authority.musicUserId, ownerEpoch)) {
      socket.disconnect(true);
      return;
    }
    await socket.join(room);
    if (!admissionIsCurrent()
        || !await authorityIsCurrent(authority, authority.role)
        || !admissionIsCurrent()
        || ownerEpoch !== undefined && !dependencies.ownerRegistry?.isCurrent(authority.musicUserId, ownerEpoch)) {
      await socket.leave(room);
      socket.disconnect(true);
      return;
    }
    socket.emit("connection_status", { status: "connected", role: authority.role, requestId: randomUUID() });
    socket.on("disconnect", () => dependencies.observability?.socket("disconnected", { role: authority.role, reason: "transport" }));

    const fail = (cause: unknown) => {
      const error = safeSocketError(cause);
      socket.emit("music_error", musicErrorEnvelope(error, randomUUID()));
    };
    const evict = (cause: unknown) => {
      fail(cause);
      socket.disconnect(true);
    };
    const accept = (payload: unknown): boolean => {
      let bytes: number;
      try { bytes = Buffer.byteLength(JSON.stringify(payload), "utf8"); } catch { fail(routeError("REQUEST_INVALID", 400, "The socket payload is invalid.")); return false; }
      if (bytes > 2_048) { fail(routeError("PAYLOAD_TOO_LARGE", 400, "The socket payload is too large.")); return false; }
      const key = `${authority.rateKey}:${socket.handshake.address}`;
      if (limiter.consume(key)) { fail(routeError("RATE_LIMITED", 429, "Too many Music socket events.")); return false; }
      return true;
    };

    socket.onAny((event) => {
      if (!new Set(["player_state", "guest_request"]).has(event)) {
        fail(routeError("SOCKET_EVENT_FORBIDDEN", 403, "The socket event is not allowed."));
      }
    });

    socket.on("player_state", (payload: unknown) => {
      void (async () => {
        if (authority.role !== "owner") return fail(routeError("SOCKET_EVENT_FORBIDDEN", 403, "The socket event is not allowed."));
        if (!accept(payload)) return;
        try {
          const principal = await dependencies.ownerCredentials.recheck(authority.owner);
          if (principal.musicUserId !== authority.musicUserId) throw new MusicPrincipalError("TOKEN_REVOKED", 401, "The Music credential has been revoked.");
        } catch (cause) { return evict(cause); }
        if (!validPlayerState(payload)) return fail(routeError("REQUEST_INVALID", 400, "The socket payload is invalid."));
        await emitToAuthorizedRecipients(`music-guest:${authority.musicUserId}`, "guest", "player_state", payload);
      })().catch(evict);
    });

    socket.on("guest_request", (payload: unknown) => {
      void (async () => {
        if (authority.role !== "guest") return fail(routeError("SOCKET_EVENT_FORBIDDEN", 403, "The socket event is not allowed."));
        if (!accept(payload)) return;
        try {
          const guest = await dependencies.resolveGuestCapability(authority.capability);
          if (!guest?.active || guest.musicUserId !== authority.musicUserId || !guest.allowSongRequests) throw guestInvalid();
        } catch (cause) { return evict(cause); }
        if (!validGuestRequest(payload)) return fail(routeError("REQUEST_INVALID", 400, "The socket payload is invalid."));
        const requestId = randomUUID();
        const event = payload as { type: "song"; externalId: string };
        await emitToAuthorizedRecipients(`music-owner:${authority.musicUserId}`, "owner", "guest_request", { ...event, requestId });
        socket.emit("guest_request_status", { status: "accepted", requestId });
      })().catch(evict);
    });
    })().catch((cause) => {
      const error = safeSocketError(cause);
      socket.emit("music_error", musicErrorEnvelope(error, randomUUID()));
      socket.disconnect(true);
    });
  });

  return server;
}

function validPlayerState(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.playing === "boolean"
    && (entry.position === undefined || typeof entry.position === "number")
    && (entry.externalId === undefined || typeof entry.externalId === "string" && entry.externalId.length <= 256)
    && Object.keys(entry).every((key) => ["playing", "position", "externalId"].includes(key));
}

function validGuestRequest(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return entry.type === "song" && typeof entry.externalId === "string" && entry.externalId.length >= 1 && entry.externalId.length <= 256
    && Object.keys(entry).every((key) => ["type", "externalId"].includes(key));
}

function guestInvalid() {
  return routeError("GUEST_CAPABILITY_INVALID", 401, "The guest capability is invalid.");
}

function admissionUnavailable() {
  return new MusicPrincipalError("TOKEN_INVALID", 401, "Music socket admission is unavailable.");
}

function routeError(code: MusicIdentityError["code"], status: number, message: string) {
  return new MusicIdentityError(code, status, message, status === 401 ? "authenticate" : "none", false);
}

function safeSocketError(cause: unknown): MusicIdentityError {
  if (cause instanceof MusicIdentityError) return cause;
  if (cause instanceof MusicPrincipalError) return new MusicIdentityError(cause.code, cause.status, cause.message, "authenticate", false);
  return new MusicIdentityError("TOKEN_INVALID", 401, "The Music socket credential is invalid.", "authenticate", false);
}
