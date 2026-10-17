import { createHmac, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanonicalApp } from "../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../auth/betterAuth";
import { createAccountMusicRepository } from "../music/accountMusicRepository";
import { MusicDomainRepository } from "../repositories/musicDomainRepository";
import { MusicIdentityRepository } from "../repositories/musicIdentityRepository";
import { hashGuestCapability } from "../policies/musicSurfacePolicy";
import { setupCanonicalMusicRoutes } from "../routes/musicSurfaceRoutes";
import { createMusicSocketServer } from "../socket/musicSocketServer";
import type { Actor } from "../application/actor";

const config = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474", EXPLORERS_AUTH_SECRET: "canonical-public-lifecycle-secret-".repeat(2), GOOGLE_CLIENT_ID: "fixture-google-id", GOOGLE_CLIENT_SECRET: "fixture-google-secret" });
let pool: pg.Pool, domain: MusicDomainRepository, canonical: ReturnType<typeof createCanonicalApp>;
let app: express.Express, server: ReturnType<typeof createMusicSocketServer>, origin: string;
const sockets = new Set<Socket>();
const song = { youtubeId: "fixture0001", title: "Lifecycle request", artist: "Owned artist", thumbnailUrl: "https://example.invalid/thumb.png" };
async function owner(mode: "public" | "unlisted") {
  const userId = `music-public-lifecycle-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Owner',$2)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())", [randomUUID(), `google-${userId}`, userId]);
  const context = await canonical.auth.$context, session = await context.internalAdapter.createSession(userId, false);
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${createHmac("sha256", config.secret).update(session.token).digest("base64")}`;
  const me = await request(canonical.app).get("/api/explorers/v1/me").set("Cookie", cookie);
  expect(me.status).toBe(200);
  const accountId = me.body.account.id as string;
  const actor: Actor = { userId, accountId, role: "owner", credential: { kind: "web-session", sessionId: session.id, sessionVersion: 1 } };
  const venue = await createAccountMusicRepository(pool).ensureMusicAccount(actor), musicUserId = venue.musicUserId;
  const columns = (await pool.query("SELECT strapi_user_document_id,strapi_account_document_id,identity_status FROM users WHERE id=$1", [musicUserId])).rows[0];
  expect(columns).toEqual({ strapi_user_document_id: null, strapi_account_document_id: null, identity_status: "active" });
  const capability = Buffer.from(randomUUID() + randomUUID()).subarray(0, 32).toString("base64url");
  await domain.updateGuestControls(musicUserId, { allowSongRequests: true, allowGuestPlayOnDevice: true, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: true, allowQueueVisibility: true });
  await domain.setPublicationMode(musicUserId, mode, hashGuestCapability(capability));
  if (mode === "public") await domain.rotateGuestCapability(musicUserId, hashGuestCapability(capability));
  const slug = (await pool.query("SELECT guest_url FROM users WHERE id=$1", [musicUserId])).rows[0].guest_url as string;
  const playlist = await domain.createPlaylist(musicUserId, { name: "Published lifecycle", description: null }) as { id: number };
  await domain.setPlaylistVisibility(musicUserId, playlist.id, true);
  return { accountId, musicUserId, cookie, slug, capability };
}
async function resource(subject: { slug: string; capability: string }, mode: "public" | "unlisted") {
  const call = request(app).get(`/api/music/public-resource/v1/${subject.slug}`);
  if (mode === "unlisted") call.set("X-Music-Guest-Capability", subject.capability);
  return call;
}
async function guest(capability: string) {
  const socket = io(origin, { path: "/ws", transports: ["websocket"], extraHeaders: { Origin: config.baseURL }, auth: { guestCapability: capability }, reconnection: false, autoConnect: false });
  sockets.add(socket);
  const admitted = new Promise<void>((resolve, reject) => { socket.once("connection_status", () => resolve()); socket.once("connect_error", reject); });
  socket.connect(); await admitted; return socket;
}
async function deactivate(subject: { accountId: string; cookie: string }) {
  const lifecycle = await request(canonical.app).get("/api/explorers/v1/account/lifecycle").set("Cookie", subject.cookie);
  expect(lifecycle.status).toBe(200);
  const result = await request(canonical.app).post("/api/explorers/v1/account/deactivation").set("Cookie", subject.cookie).set("Origin", config.baseURL).set("Idempotency-Key", randomUUID()).send({ expectedRevision: lifecycle.body.lifecycle.revision });
  expect(result.status).toBe(200);
  expect(result.body.lifecycle).toMatchObject({ accountId: subject.accountId, status: "suspended" });
  expect(result.body.lifecycle.operationId).toBeTruthy();
}

describe.sequential("canonical Music public lifecycle availability", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL_TEST) throw new Error("Owned migrated integration database required");
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 8 });
    canonical = createCanonicalApp(pool, config);
    domain = new MusicDomainRepository(pool, undefined, Buffer.alloc(32, 7));
    app = express(); app.use(express.json());
    const denyOwner = async (): Promise<never> => { throw new Error("Owner authority is outside this guest acceptance fixture"); };
    setupCanonicalMusicRoutes(app, { repository: domain, resolvePrincipal: denyOwner, mintSocketTicket: () => { throw new Error("Owner tickets unused"); }, allowedOrigins: [config.baseURL] });
    server = createMusicSocketServer(app, { allowedOrigins: [config.baseURL], ownerCredentials: { handshake: denyOwner, recheck: denyOwner }, resolveGuestCapability: value => domain.resolveGuestSocketAuthority(value), resolvePublicMusicAuthority: (slug, capability) => domain.resolvePublicMusicSocketAuthority(slug, capability), resolvePublicMusicRevision: id => domain.resolvePublicSnapshotRevision(id) });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Owned socket listener unavailable");
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool?.end();
  });

  for (const mode of ["public", "unlisted"] as const) it(`${mode} canonical account deactivation denies HTTP socket and guest requests while another account survives`, async () => {
    const subject = await owner(mode), other = await owner(mode);
    expect((await resource(subject, mode)).status).toBe(200);
    expect((await resource(other, mode)).status).toBe(200);
    const connected = await guest(subject.capability);
    expect(await domain.resolveGuestRequestAuthority(subject.slug, subject.capability)).toMatchObject({ musicUserId: subject.musicUserId });
    await deactivate(subject);
    expect((await resource(subject, mode)).status).toBe(404);
    expect((await resource(other, mode)).status).toBe(200);
    expect(await domain.resolvePublicDescriptor(subject.accountId)).toBeUndefined();
    expect(await domain.resolvePublicSnapshotRevision(subject.musicUserId)).toBeUndefined();
    expect(await domain.resolvePublicMusicSocketAuthority(subject.slug, subject.capability)).toBeUndefined();
    expect(await domain.resolveGuestResource(subject.slug, subject.capability)).toBeUndefined();
    expect(await domain.resolveGuestSocketAuthority(subject.capability)).toBeUndefined();
    expect(await domain.resolveGuestRequestAuthority(subject.slug, subject.capability)).toBeUndefined();
    expect(await domain.addGuestSongIdempotent(subject.slug, subject.capability, "owned-lifecycle", randomUUID(), song)).toEqual({ status: "forbidden" });
    expect((await domain.listPublishedMusicPlaylists()).some(value => value.guestUrl === subject.slug)).toBe(false);
    const denied = new Promise<any>(resolve => connected.once("music_error", resolve));
    connected.emit("guest_request", { type: "song", externalId: song.youtubeId });
    expect((await denied).error.code).toBeTruthy();
    connected.disconnect();
    expect(await domain.resolveGuestSocketAuthority(other.capability)).toMatchObject({ musicUserId: other.musicUserId });
    if (mode === "public") expect(await domain.resolvePublicDescriptor(other.accountId)).toMatchObject({ publicSlug: other.slug });
  });

  it("canonical pending deletion denies public Music before deletion completes", async () => {
    const subject = await owner("public");
    expect((await resource(subject, "public")).status).toBe(200);
    const lifecycle = await request(canonical.app).get("/api/explorers/v1/account/lifecycle").set("Cookie", subject.cookie);
    expect(lifecycle.status).toBe(200);
    const feedback = await request(canonical.app).post("/api/explorers/v1/account/deletion-feedback").set("Cookie", subject.cookie).set("Origin", config.baseURL).set("Idempotency-Key", randomUUID()).send({ reason: "Owned Music lifecycle withdrawal" });
    expect(feedback.status).toBe(201);
    const deletion = await request(canonical.app).post("/api/explorers/v1/account/deletion").set("Cookie", subject.cookie).set("Origin", config.baseURL).set("Idempotency-Key", randomUUID()).send({ expectedRevision: lifecycle.body.lifecycle.revision, feedbackId: feedback.body.feedback.id });
    expect(deletion.status).toBe(200);
    expect(deletion.body.lifecycle.status).toBe("pending_deletion");
    expect((await resource(subject, "public")).status).toBe(404);
    expect(await domain.resolvePublicMusicSocketAuthority(subject.slug, subject.capability)).toBeUndefined();
    expect(await domain.resolveGuestSocketAuthority(subject.capability)).toBeUndefined();
    expect(await domain.addGuestSongIdempotent(subject.slug, subject.capability, "owned-pending-deletion", randomUUID(), song)).toEqual({ status: "forbidden" });
  });

  it("unmapped active legacy Music remains publicly available", async () => {
    const suffix = randomUUID(), capability = "L".repeat(43);
    const legacy = await new MusicIdentityRepository(pool).ensureIdentity({ userDocumentId: `public-user-${suffix}`, accountDocumentId: `public-account-${suffix}`, username: `public-${suffix}`, email: `${suffix}@example.invalid`, provider: "local", accountName: "Legacy public", accountType: "Venue", accountMobile: "+15555550100", internalUsername: `legacy-${suffix}`, password: `disabled-${suffix}`, guestUrl: `legacy-${suffix}`, guestCapabilityHash: hashGuestCapability(capability), operationId: `public-operation-${suffix}`, requestId: `public-request-${suffix}` });
    await domain.setPublicationMode(legacy.id, "public");
    await domain.rotateGuestCapability(legacy.id, hashGuestCapability(capability));
    expect((await pool.query("SELECT account_id FROM account_music_identity WHERE music_user_id=$1", [legacy.id])).rows).toEqual([]);
    expect((await request(app).get(`/api/music/public-resource/v1/${`legacy-${suffix}`}`)).status).toBe(200);
    expect(await domain.resolvePublicDescriptor(legacy.strapiAccountDocumentId)).toMatchObject({ publicSlug: `legacy-${suffix}` });
    expect(await domain.resolvePublicSnapshotRevision(legacy.id)).toBeTypeOf("number");
    expect(await domain.resolveGuestSocketAuthority(capability)).toMatchObject({ musicUserId: legacy.id });
  });
});
