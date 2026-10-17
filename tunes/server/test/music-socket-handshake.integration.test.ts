import { createHash } from "node:crypto";
import express from "express";
import pg from "pg";
import { io as connectSocket, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateMusicDatabase } from "../db/migrate";
import { createGuestCapability, hashGuestCapability } from "../policies/musicSurfacePolicy";
import { createMusicSocketCredentialVerifier, MusicPrincipalService } from "../middleware/musicPrincipal";
import { MusicDomainRepository } from "../repositories/musicDomainRepository";
import { MusicIdentityRepository } from "../repositories/musicIdentityRepository";
import { setupCanonicalMusicRoutes } from "../routes/musicSurfaceRoutes";
import { MusicTokenService } from "../services/musicTokenService";
import { createMusicSocketServer, MusicOwnerSocketRegistry } from "../socket/musicSocketServer";

/**
 * Ticket 6.2 ":33" reconnect, and ticket 6.3's asymmetric verification, proved against a
 * real PostgreSQL 15, the real Music route composition and a real Socket.IO server.
 *
 * This exists because neither half can be proved anywhere cheaper. The unit suites inject
 * a ticket minter, so they cannot observe whether a composition actually mounts the route
 * - which is how the mint shipped unwired in routes/index.ts while every unit test passed.
 * And a browser fixture has no socket server, so Socket.IO never reaches onopen and never
 * asks for a ticket at all, which makes a reconnect assertion there pass on nothing.
 */
const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C6_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `music_socket_handshake_${process.pid}`;
const ORIGIN = "https://explorers.example";

let admin: pg.Pool;
let pool: pg.Pool;
let server: ReturnType<typeof createMusicSocketServer>;
let origin = "";
let tokens: MusicTokenService;
let accountId = "";
let musicUserId = 0;
let ownerRegistry: MusicOwnerSocketRegistry;
const sockets: Socket[] = [];

/** Mints through the real HTTP route, exactly as the browser client does. */
async function mintTicket(credential: string): Promise<string> {
  const response = await fetch(`${origin}/api/music/socket-ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${credential}`, Origin: ORIGIN, "Content-Type": "application/json" },
    body: "{}",
  });
  if (response.status !== 200) throw new Error(`mint failed ${response.status}`);
  const body = await response.json() as { ticket: { token: string } };
  return body.ticket.token;
}

function connect(auth: unknown): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connectSocket(origin, {
      path: "/ws",
      transports: ["websocket"],
      reconnection: false,
      auth: auth as never,
      extraHeaders: { Origin: ORIGIN },
    });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

describePg("canonical owner Music socket handshake over a real stack", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: exactTarget });
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^15\./);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const target = new URL(exactTarget);
    target.pathname = `/${databaseName}`;
    pool = new pg.Pool({ connectionString: target.toString(), max: 8 });
    await migrateMusicDatabase(pool);

    // A canonical venue: both Strapi columns NULL from the start, venue and mapping in one
    // transaction because 0039's ownership check is a deferred constraint trigger.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      accountId = (await client.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
      musicUserId = (await client.query<{ id: number }>(
        `INSERT INTO users(username,password,email,guest_url,venue_name,
           strapi_user_document_id,strapi_account_document_id,guest_capability_hash)
         VALUES($1,NULL,NULL,$2,'Explorers Music',NULL,NULL,$3) RETURNING id`,
        [`explorers-music-${accountId}`, `slug-${accountId}`.slice(0, 60),
          createHash("sha256").update(`handshake-${accountId}`).digest("hex")],
      )).rows[0].id;
      await client.query("INSERT INTO account_music_identity(account_id,music_user_id) VALUES($1,$2)",
        [accountId, musicUserId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    // One token authority for both the HTTP mint and the socket verifier, as a deployment
    // has: a credential minted by one must verify at the other.
    tokens = new MusicTokenService({
      current: { kid: "handshake", secret: Buffer.alloc(32, 0x6d).toString("base64url") },
      tokenLifetimeSeconds: 600,
      clockSkewSeconds: 10,
    });
    const principals = new MusicPrincipalService(tokens, new MusicIdentityRepository(pool));
    const domain = new MusicDomainRepository(pool, undefined, Buffer.alloc(32, 0x54));
    ownerRegistry = new MusicOwnerSocketRegistry();

    const app = express();
    app.use(express.json());
    setupCanonicalMusicRoutes(app, {
      repository: domain,
      resolvePrincipal: (token) => principals.resolve(token),
      allowedOrigins: [ORIGIN],
      mintSocketTicket: tokens.mintSocketTicket.bind(tokens),
      youtube: {
        search: async () => { throw new Error("provider unavailable"); },
        videoFromUrl: async () => { throw new Error("provider unavailable"); },
      },
    });
    server = createMusicSocketServer(app, {
      allowedOrigins: [ORIGIN],
      ownerCredentials: createMusicSocketCredentialVerifier(principals),
      resolveGuestCapability: (capability) => domain.resolveGuestSocketAuthority(capability),
      ownerRegistry,
    });
    await new Promise<void>((done) => {
      server.listen(0, "127.0.0.1", () => done());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("socket server address unavailable");
    origin = `http://127.0.0.1:${address.port}`;
  }, 60_000);

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await new Promise<void>((done) => {
      if (!server) return done();
      server.close(() => done());
    });
    await pool?.end();
    await admin?.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [databaseName]);
    await admin?.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin?.end();
  });

  it("admits a canonical owner that minted a handshake ticket through the real route", async () => {
    // The whole chain: canonical credential, HTTP mint, socket admission, with the owner
    // resolved through account_music_identity rather than a Strapi document id.
    const credential = tokens.mintCanonical({ accountId, musicUserId, sessionVersion: 1 }).token;
    const ticket = await mintTicket(credential);
    const socket = await connect({ token: ticket });

    expect(socket.connected).toBe(true);
  }, 30_000);

  it("refuses the general owner credential at the socket and the handshake ticket over HTTP", async () => {
    // Break caught: one token works everywhere, so a leaked socket ticket is a ten-minute
    // owner HTTP bearer and a leaked HTTP bearer opens a live socket. Verification is exact
    // in both directions, so neither substitution is possible.
    const credential = tokens.mintCanonical({ accountId, musicUserId, sessionVersion: 1 }).token;
    await expect(connect({ token: credential })).rejects.toThrow();

    const ticket = await mintTicket(credential);
    const asBearer = await fetch(`${origin}/api/music/dashboard`, {
      headers: { Authorization: `Bearer ${ticket}`, Origin: ORIGIN },
    });
    expect(asBearer.status).toBe(401);

    // The credential itself still reads the owner dashboard, so the refusal above is about
    // the ticket's purpose and not a broken route.
    const asCredential = await fetch(`${origin}/api/music/dashboard`, {
      headers: { Authorization: `Bearer ${credential}`, Origin: ORIGIN },
    });
    expect(asCredential.status).toBe(200);
  }, 30_000);

  it("admits a guest holding the hashed capability and refuses a revoked one", async () => {
    // Ticket 6.3 ":32" keeps guest transport separate from owner authentication. The guest
    // presents a capability and never a credential, the server stores only its hash, and
    // revoking it denies a fresh connection without touching the owner's.
    const capability = createGuestCapability();
    await pool.query(
      // 0002 requires rotation metadata whenever the hash changes, which is the rotation
      // semantics ":32" asks to preserve: a hash cannot be swapped silently.
      `UPDATE users SET guest_capability_hash=$2,guest_capability_rotated_at=now(),
         guest_capability_revoked_at=NULL,allow_song_requests=true WHERE id=$1`,
      [musicUserId, hashGuestCapability(capability)],
    );

    const guest = await connect({ guestCapability: capability });
    expect(guest.connected).toBe(true);

    await pool.query("UPDATE users SET guest_capability_revoked_at=now() WHERE id=$1", [musicUserId]);
    await expect(connect({ guestCapability: capability })).rejects.toThrow();

    // The owner path is unaffected by guest revocation: separate authority, separate token.
    const credential = tokens.mintCanonical({ accountId, musicUserId, sessionVersion: 1 }).token;
    const owner = await connect({ token: await mintTicket(credential) });
    expect(owner.connected).toBe(true);

    await pool.query("UPDATE users SET guest_capability_revoked_at=NULL WHERE id=$1", [musicUserId]);
  }, 30_000);

  it("disconnects a live owner socket when the lifecycle revokes it", async () => {
    // Ticket 6.3 ":33" revocation while connected. MusicLifecycleService revokes through
    // this registry, so a suspended or deleted owner loses socket authority and not only
    // HTTP access - the obligation the epic records at ":54".
    const credential = tokens.mintCanonical({ accountId, musicUserId, sessionVersion: 1 }).token;
    const socket = await connect({ token: await mintTicket(credential) });
    expect(socket.connected).toBe(true);

    const disconnected = new Promise<void>((resolve) => { socket.once("disconnect", () => resolve()); });
    await ownerRegistry.disconnectOwner(musicUserId);
    await disconnected;

    expect(socket.connected).toBe(false);
  }, 30_000);

  it("asks for a new ticket on every reconnect and admits the connection with it", async () => {
    // Ticket 6.2 ":33". Socket.IO calls the function form of auth from onopen, so a
    // transport that reopens asks again. That is the whole reason a 60-second ticket is
    // workable across a backoff, and it can only be observed against a real server.
    const credential = tokens.mintCanonical({ accountId, musicUserId, sessionVersion: 1 }).token;
    const minted: string[] = [];
    const socket = connectSocket(origin, {
      path: "/ws",
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 50,
      extraHeaders: { Origin: ORIGIN },
      auth: ((callback: (data: { token: string }) => void) => {
        void mintTicket(credential).then((token) => {
          minted.push(token);
          callback({ token });
        });
      }) as never,
    });
    sockets.push(socket);

    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", reject);
    });
    expect(minted).toHaveLength(1);

    // A transport blip, which is what a reconnect is in production.
    const reconnected = new Promise<void>((resolve) => {
      socket.once("connect", () => resolve());
    });
    (socket.io.engine as unknown as { close(): void }).close();
    await reconnected;

    expect(minted).toHaveLength(2);
    expect(minted[1]).not.toBe(minted[0]);
    expect(socket.connected).toBe(true);
  }, 30_000);
});
