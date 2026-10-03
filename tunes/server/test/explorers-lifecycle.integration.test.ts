import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanonicalApp } from "../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../auth/betterAuth";
import { issueRecoveryProof } from "../auth/recoveryProof";
import { AccountLifecycleService } from "../application/accountLifecycle";
import { runAccountLifecycleMaintenance } from "../application/accountLifecycleMaintenance";
import { LocalObjectStorage } from "../services/objectStorage";
import { MusicIdentityRepository } from "../repositories/musicIdentityRepository";
import { MediaRepository } from "../repositories/mediaRepository";
import { MediaService } from "../application/media";
import { ExplorersRecommendationRepository } from "../repositories/explorersRecommendationRepository";

const config = resolveExplorersAuthConfig({
  EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
  EXPLORERS_AUTH_SECRET: "lifecycle-integration-secret-".repeat(3),
  GOOGLE_CLIENT_ID: "fixture-google-id",
  GOOGLE_CLIENT_SECRET: "fixture-google-secret",
});
let pool: pg.Pool;
let app: ReturnType<typeof createCanonicalApp>;

async function identity() {
  const userId = `lifecycle-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Person',$2)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
    [randomUUID(), `google-${userId}`, userId]);
  const context = await app.auth.$context;
  const session = await context.internalAdapter.createSession(userId, false);
  const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
  const profile = await request(app.app).get("/api/explorers/v1/me").set("cookie", cookie);
  expect(profile.status).toBe(200);
  return { userId, cookie, accountId: profile.body.account.id, revision: profile.body.account.revision as number };
}

async function pendingDeletion(owner: Awaited<ReturnType<typeof identity>>) {
  const feedback = await request(app.app).post("/api/explorers/v1/account/deletion-feedback")
    .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
    .send({ reason: "Leaving" });
  const deletion = await request(app.app).post("/api/explorers/v1/account/deletion")
    .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
    .send({ expectedRevision: owner.revision, feedbackId: feedback.body.feedback.id });
  expect(deletion.status).toBe(200);
  return deletion.body.lifecycle.operationId as string;
}

async function webActor(owner: Awaited<ReturnType<typeof identity>>) {
  const session = await pool.query<{ id: string; session_version: string }>(
    "SELECT id,session_version::text FROM auth_session WHERE user_id=$1 LIMIT 1", [owner.userId]);
  return { userId: owner.userId, accountId: owner.accountId, role: "owner" as const,
    credential: { kind: "web-session" as const, sessionId: session.rows[0].id,
      sessionVersion: Number(session.rows[0].session_version) } };
}

const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
const upload = { purpose: "profile" as const, filename: "avatar.png", mimeType: "image/png",
  length: png.length, bytes: png };

async function within<T>(promise: Promise<T>, milliseconds = 5000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Small-pool upload/worker did not progress")), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

describe("canonical account lifecycle", () => {
  it("terminally purges owned content and typed attachments while retaining shared catalog and tombstone", async () => {
    const owner=await identity(), other=await identity();
    const catalog=await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book','Shared edition','manual') RETURNING id");
    const repository=new ExplorersRecommendationRepository(pool), shared=catalog.rows[0].id;
    const list=await repository.createCollection(owner.accountId,{category:'books',title:'Private editorial list',slug:'reading'},randomUUID());
    const item=await repository.createRecommendation(owner.accountId,{category:'books',entityId:shared,collectionId:list.id,expectedCollectionRevision:1,userRating:9},randomUUID());
    await repository.createCollection(owner.accountId,{category:'guides',title:'Empty guide',slug:'guide'},randomUUID());
    const otherList=await repository.createCollection(other.accountId,{category:'books',title:'Other list',slug:'reading'},randomUUID());
    const otherItem=await repository.createRecommendation(other.accountId,{category:'books',entityId:shared,collectionId:otherList.id,expectedCollectionRevision:1},randomUUID());
    await pool.query("INSERT INTO book_entity_details(entity_id,authors) VALUES($1,ARRAY['Shared author'])",[shared]);
    await pool.query('INSERT INTO book_recommendation_context(recommendation_id,account_id,buy_links) VALUES($1,$2,$3),($4,$5,$6)',[item.id,owner.accountId,JSON.stringify([{name:'Owner shop',url:'https://shop.example/a'}]),otherItem.id,other.accountId,JSON.stringify([{name:'Other shop',url:'https://shop.example/b'}])]);
    await pool.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'books')",[owner.accountId]);
    await pool.query("INSERT INTO category_recommendation_pins VALUES($1,'books',$2,$3,0)",[owner.accountId,item.id,list.id]);
    // 3.2 owns transport upload purposes; provision this typed attachment through
    // the real persistence/storage seam rather than expanding the profile upload API.
    const mediaId=randomUUID(), key=`local/${owner.accountId}/${mediaId}`, storage=new LocalObjectStorage(), media=new MediaRepository(pool);
    await media.reserve({id:mediaId,accountId:owner.accountId,purpose:'collection',mimeType:'image/png',filename:'cover.png',
      bytes:png,hash:createHash('sha256').update(png).digest(),key,environment:'local'});
    await storage.put(key,png); await media.markReady(mediaId);
    await pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[list.id,owner.accountId,mediaId]);
    const storedCover=await new MediaService(pool,storage).createMedia(await webActor(owner),{purpose:'recommendation',filename:'book.png',mimeType:'image/png',bytes:png,length:png.length},{requestId:randomUUID()});
    await pool.query("INSERT INTO recommendation_book_covers(recommendation_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3),($1,$2,'thumbnail',$3)",[item.id,owner.accountId,storedCover.id]);
    const sharedMovie=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('movie','Retained Movie facts','manual') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO movie_entity_details(entity_id,media_type,runtime_minutes) VALUES($1,'movie',0)",[sharedMovie]);
    const movieList=await repository.createCollection(owner.accountId,{category:'movies',title:'Movies',slug:'movies'},randomUUID());
    const movieItem=await repository.createRecommendation(owner.accountId,{category:'movies',entityId:sharedMovie,collectionId:movieList.id,expectedCollectionRevision:1},randomUUID());
    const otherMovieList=await repository.createCollection(other.accountId,{category:'movies',title:'Movies',slug:'movies'},randomUUID());
    const retainedMovie=await repository.createRecommendation(other.accountId,{category:'movies',entityId:sharedMovie,collectionId:otherMovieList.id,expectedCollectionRevision:1},randomUUID());
    const sharedTerm=(await pool.query("SELECT id FROM taxonomy_terms WHERE category='movies' AND slug='animation'")).rows[0].id;
    await pool.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'movies',$3,0),($4,$5,'movies',$3,0)",[movieItem.id,owner.accountId,sharedTerm,retainedMovie.id,other.accountId]);
    const operation=await pendingDeletion(owner);
    await runAccountLifecycleMaintenance(pool,new LocalObjectStorage());
    expect((await pool.query('SELECT status FROM creator_accounts WHERE id=$1',[owner.accountId])).rows[0].status).toBe('deleted');
    expect((await pool.query('SELECT state FROM account_lifecycle_operations WHERE id=$1',[operation])).rows[0].state).toBe('succeeded');
    for(const table of ['collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_book_covers','book_recommendation_context','movie_recommendation_context','recommendation_taxonomy','category_recommendation_pins','account_category_pin_state','media_assets']) {
      expect((await pool.query(`SELECT 1 FROM ${table} WHERE account_id=$1`,[owner.accountId])).rowCount,table).toBe(0);
    }
    expect((await pool.query('SELECT id FROM entities WHERE id=$1',[shared])).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM recommendations WHERE id=$1',[otherItem.id])).rowCount).toBe(1);
    expect((await pool.query('SELECT authors FROM book_entity_details WHERE entity_id=$1',[shared])).rows[0].authors).toEqual(['Shared author']);
    expect((await pool.query('SELECT recommendation_id FROM book_recommendation_context WHERE recommendation_id=$1',[otherItem.id])).rowCount).toBe(1);
    expect((await pool.query('SELECT runtime_minutes FROM movie_entity_details WHERE entity_id=$1',[sharedMovie])).rows).toEqual([{runtime_minutes:0}]);
    expect((await pool.query('SELECT id FROM taxonomy_terms WHERE id=$1',[sharedTerm])).rowCount).toBe(1);
    expect((await pool.query('SELECT recommendation_id FROM recommendation_taxonomy WHERE recommendation_id=$1',[retainedMovie.id])).rowCount).toBe(1);
    expect((await pool.query('SELECT recommendation_id FROM movie_recommendation_context WHERE recommendation_id=$1',[retainedMovie.id])).rowCount).toBe(1);
    await expect(storage.get(key)).rejects.toMatchObject({code:'ENOENT'});
    expect(await runAccountLifecycleMaintenance(pool,new LocalObjectStorage())).toBe(0);
  });
  beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST }); app = createCanonicalApp(pool, config); });
  afterAll(async () => { await pool?.end(); });

  it("rechecks revoked web sessions and OAuth operation scopes inside the lifecycle service", async () => {
    const owner = await identity();
    const session = await pool.query<{ id: string; session_version: string }>(
      "SELECT id,session_version::text FROM auth_session WHERE user_id=$1 LIMIT 1", [owner.userId]);
    const service = new AccountLifecycleService(pool);
    const webActor = { userId: owner.userId, accountId: owner.accountId, role: "owner" as const,
      credential: { kind: "web-session" as const, sessionId: session.rows[0].id,
        sessionVersion: Number(session.rows[0].session_version) } };
    await pool.query("UPDATE user_security_state SET session_version=session_version+1 WHERE user_id=$1", [owner.userId]);
    await expect(service.recordDeletionFeedback(webActor, { reason: "Leaving" },
      { requestId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 401 });
    await pool.query("UPDATE user_security_state SET session_version=session_version-1 WHERE user_id=$1", [owner.userId]);
    await pool.query("DELETE FROM auth_session WHERE id=$1", [session.rows[0].id]);
    await expect(service.recordDeletionFeedback(webActor, { reason: "Leaving" },
      { requestId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 401 });
    await expect(service.requestAccountDeactivation(webActor, { expectedRevision: owner.revision },
      { requestId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 401 });
    const oauthActor = { userId: owner.userId, accountId: owner.accountId, role: "owner" as const,
      credential: { kind: "oauth" as const, grantId: randomUUID(), scopes: [] } };
    await expect(service.recordDeletionFeedback(oauthActor, { reason: "Leaving" },
      { requestId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await expect(service.requestAccountDeletion(oauthActor, { expectedRevision: owner.revision, feedbackId: randomUUID() },
      { requestId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
    expect((await pool.query("SELECT count(*)::int AS count FROM deletion_feedback WHERE account_id=$1", [owner.accountId])).rows[0].count).toBe(0);
  });

  it("records one trimmed feedback reason on duplicate submit and never accepts caller ownership", async () => {
    const owner = await identity();
    const idempotencyKey = randomUUID();
    const submit = () => request(app.app).post("/api/explorers/v1/account/deletion-feedback")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", idempotencyKey)
      .send({ reason: "  Taking a break  ", accountId: randomUUID(), userId: "attacker" });
    const first = await submit();
    expect(first.status).toBe(201);
    const second = await submit();
    expect(second.status).toBe(201);
    expect(second.body.feedback.id).toBe(first.body.feedback.id);
    const rows = await pool.query("SELECT account_id,user_id,reason FROM deletion_feedback WHERE id=$1", [first.body.feedback.id]);
    expect(rows.rows).toEqual([{ account_id: owner.accountId, user_id: owner.userId, reason: "Taking a break" }]);
  });

  it("denies cross-origin feedback and rejects invalid reason without recording it", async () => {
    const owner = await identity();
    const denied = await request(app.app).post("/api/explorers/v1/account/deletion-feedback")
      .set("origin", "https://attacker.example").set("cookie", owner.cookie).send({ reason: "No" });
    expect(denied.status).toBe(403);
    const invalid = await request(app.app).post("/api/explorers/v1/account/deletion-feedback")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID()).send({ reason: "   " });
    expect(invalid.status).toBe(422);
  });

  it("deactivates once, revokes the session and refuses another account's feedback", async () => {
    const owner = await identity();
    const other = await identity();
    const feedback = await request(app.app).post("/api/explorers/v1/account/deletion-feedback")
      .set("origin", config.baseURL).set("cookie", other.cookie).set("idempotency-key", randomUUID()).send({ reason: "Leaving" });
    const crossAccount = await request(app.app).post("/api/explorers/v1/account/deletion")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
      .send({ expectedRevision: owner.revision, feedbackId: feedback.body.feedback.id });
    expect(crossAccount.status).toBe(404);
    const changed = await request(app.app).post("/api/explorers/v1/account/deactivation")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
      .send({ expectedRevision: owner.revision });
    expect(changed.status).toBe(200);
    expect(changed.body.lifecycle).toMatchObject({ accountId: owner.accountId, status: "suspended", revision: owner.revision + 1 });
    expect((await request(app.app).get("/api/explorers/v1/me").set("cookie", owner.cookie)).status).toBe(401);
  });

  it("uses the purpose-bound proof to recover a suspended account once, then requires a fresh normal session", async () => {
    const owner = await identity();
    const changed = await request(app.app).post("/api/explorers/v1/account/deactivation")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
      .send({ expectedRevision: owner.revision });
    const context = await app.auth.$context;
    const temporary = await context.internalAdapter.createSession(owner.userId, false);
    const proof = await issueRecoveryProof(pool, { userId: owner.userId, subject: `google-${owner.userId}`, sessionId: temporary.id });
    const proofCookie = `explorers_recovery_proof=${proof.token}`;
    const status = await request(app.app).get("/api/explorers/v1/recovery/status").set("cookie", proofCookie);
    expect(status.status).toBe(200);
    expect(status.body.recovery).toMatchObject({ status: "suspended", revision: changed.body.lifecycle.revision });
    expect((await request(app.app).get("/api/explorers/v1/me").set("cookie", proofCookie)).status).toBe(401);
    const recovered = await request(app.app).post("/api/explorers/v1/recovery/complete")
      .set("origin", config.baseURL).set("cookie", proofCookie)
      .send({ expectedRevision: changed.body.lifecycle.revision });
    expect(recovered.status).toBe(200);
    expect(recovered.body.lifecycle.status).toBe("active");
    expect((await request(app.app).post("/api/explorers/v1/recovery/complete").set("origin", config.baseURL)
      .set("cookie", proofCookie).send({ expectedRevision: changed.body.lifecycle.revision })).status).toBe(403);
    expect((await request(app.app).get("/api/explorers/v1/me").set("cookie", owner.cookie)).status).toBe(401);
  });

  it("cancels pending deletion with a Google-bound proof while rejecting foreign ownership", async () => {
    const owner = await identity();
    const other = await identity();
    const feedback = await request(app.app).post("/api/explorers/v1/account/deletion-feedback")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
      .send({ reason: "Pause" });
    const pending = await request(app.app).post("/api/explorers/v1/account/deletion")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
      .send({ expectedRevision: owner.revision, feedbackId: feedback.body.feedback.id });
    expect(pending.body.lifecycle.status).toBe("pending_deletion");
    const context = await app.auth.$context;
    const foreignSession = await context.internalAdapter.createSession(other.userId, false);
    await expect(issueRecoveryProof(pool, { userId: other.userId,
      subject: `google-${owner.userId}`, sessionId: foreignSession.id })).rejects.toThrow();
    const temporary = await context.internalAdapter.createSession(owner.userId, false);
    const proof = await issueRecoveryProof(pool, { userId: owner.userId,
      subject: `google-${owner.userId}`, sessionId: temporary.id });
    await pool.query("UPDATE account_lifecycle_operations SET state='running' WHERE id=$1", [pending.body.lifecycle.operationId]);
    const duringFinalization = await request(app.app).post("/api/explorers/v1/recovery/complete")
      .set("origin", config.baseURL).set("cookie", `explorers_recovery_proof=${proof.token}`)
      .send({ expectedRevision: pending.body.lifecycle.revision });
    expect(duringFinalization.status).toBe(409);
    await pool.query("UPDATE account_lifecycle_operations SET state='pending' WHERE id=$1", [pending.body.lifecycle.operationId]);
    const recovered = await request(app.app).post("/api/explorers/v1/recovery/complete")
      .set("origin", config.baseURL).set("cookie", `explorers_recovery_proof=${proof.token}`)
      .send({ expectedRevision: pending.body.lifecycle.revision });
    expect(recovered.status).toBe(200);
    expect(recovered.body.lifecycle.status).toBe("active");
    expect((await pool.query("SELECT kind FROM account_lifecycle_operations WHERE id=$1",
      [recovered.body.lifecycle.operationId])).rows[0].kind).toBe("cancel_deletion");
    expect((await pool.query("SELECT deletion_requested_at FROM creator_accounts WHERE id=$1", [owner.accountId])).rows[0].deletion_requested_at).toBeNull();
  });

  it("allows exactly one concurrent recovery and rejects expired and revoked proofs", async () => {
    const owner = await identity();
    const deactivated = await request(app.app).post("/api/explorers/v1/account/deactivation")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
      .send({ expectedRevision: owner.revision });
    const context = await app.auth.$context;
    const temporary = await context.internalAdapter.createSession(owner.userId, false);
    const proof = await issueRecoveryProof(pool, { userId: owner.userId,
      subject: `google-${owner.userId}`, sessionId: temporary.id });
    const complete = () => request(app.app).post("/api/explorers/v1/recovery/complete")
      .set("origin", config.baseURL).set("cookie", `explorers_recovery_proof=${proof.token}`)
      .send({ expectedRevision: deactivated.body.lifecycle.revision });
    const responses = await Promise.all([complete(), complete()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 403]);
    expect((await pool.query("SELECT revision FROM creator_accounts WHERE id=$1", [owner.accountId])).rows[0].revision)
      .toBe(String(deactivated.body.lifecycle.revision + 1));

    await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now(),revision=revision+1 WHERE id=$1", [owner.accountId]);
    const expiredSession = await context.internalAdapter.createSession(owner.userId, false);
    const expired = await issueRecoveryProof(pool, { userId: owner.userId,
      subject: `google-${owner.userId}`, sessionId: expiredSession.id });
    await pool.query("UPDATE account_recovery_proofs SET issued_at=issued_at-interval '10 minutes',expires_at=expires_at-interval '10 minutes' WHERE id=$1", [expired.id]);
    expect((await request(app.app).get("/api/explorers/v1/recovery/status")
      .set("cookie", `explorers_recovery_proof=${expired.token}`)).status).toBe(403);
    const revokedSession = await context.internalAdapter.createSession(owner.userId, false);
    const revoked = await issueRecoveryProof(pool, { userId: owner.userId,
      subject: `google-${owner.userId}`, sessionId: revokedSession.id });
    await pool.query("UPDATE account_recovery_proofs SET revoked_at=now() WHERE id=$1", [revoked.id]);
    expect((await request(app.app).get("/api/explorers/v1/recovery/status")
      .set("cookie", `explorers_recovery_proof=${revoked.token}`)).status).toBe(403);

  });

  it("retires expired receipts and purges aged feedback using database time", async () => {
    const owner = await identity();
    const key = randomUUID();
    const submit = () => request(app.app).post("/api/explorers/v1/account/deletion-feedback")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", key).send({ reason: "Private reason" });
    expect((await submit()).status).toBe(201);
    await pool.query(`UPDATE application_command_receipts SET replay_until=clock_timestamp()-interval '1 second'
      WHERE account_id=$1 AND operation='deletion-feedback'`, [owner.accountId]);
    expect((await submit()).status).toBe(409);
    await pool.query("UPDATE deletion_feedback SET created_at=clock_timestamp()-interval '31 days' WHERE account_id=$1", [owner.accountId]);
    await runAccountLifecycleMaintenance(pool, new LocalObjectStorage());
    expect((await pool.query("SELECT status,response FROM application_command_receipts WHERE account_id=$1", [owner.accountId])).rows[0])
      .toMatchObject({ status: "retired", response: null });
    expect((await pool.query("SELECT reason,user_id,purged_at IS NOT NULL AS purged FROM deletion_feedback WHERE account_id=$1", [owner.accountId])).rows[0])
      .toMatchObject({ reason: null, user_id: null, purged: true });
    expect((await submit()).status).toBe(409);
  });

  it("purges only proofs expired over 24 hours through a bounded least-privilege function", async () => {
    const owner = await identity();
    const insert = async (age: string) => {
      const digest = createHash("sha256").update(randomUUID()).digest();
      const row = await pool.query<{ id: string }>(`WITH stamp AS (SELECT clock_timestamp()-$4::interval AS issued)
        INSERT INTO account_recovery_proofs
        (user_id,account_id,token_hash,authenticated_at,issued_at,expires_at)
        SELECT $1,$2,$3,clock_timestamp(),stamp.issued,stamp.issued+interval '5 minutes'
        FROM stamp RETURNING id`,
      [owner.userId, owner.accountId, digest, age]);
      return row.rows[0].id;
    };
    const old = await insert("25 hours");
    const youngExpired = await insert("1 hour");
    const live = await insert("1 minute");
    const grants = await pool.query<{ direct_delete: boolean; bounded_execute: boolean }>(`SELECT
      has_table_privilege('music_runtime','account_recovery_proofs','DELETE') AS direct_delete,
      has_function_privilege('music_runtime','purge_expired_account_recovery_proofs(integer)','EXECUTE') AS bounded_execute`);
    expect(grants.rows[0]).toEqual({ direct_delete: false, bounded_execute: true });
    await runAccountLifecycleMaintenance(pool, new LocalObjectStorage(), 1);
    const remaining = (await pool.query("SELECT id FROM account_recovery_proofs WHERE id=ANY($1::uuid[]) ORDER BY id",
      [[old, youngExpired, live]])).rows.map((row) => row.id);
    expect(remaining).toEqual([youngExpired, live].sort());
    expect((await pool.query("SELECT purge_expired_account_recovery_proofs(1) AS removed")).rows[0].removed).toBe(0);
    await expect(pool.query("SELECT purge_expired_account_recovery_proofs(101)")).rejects.toThrow();
  });

  it("keeps a Music-mapped deletion pending until the 6.1 owner boundary is available", async () => {
    const owner = await identity();
    const musicId = randomUUID();
    const user = await new MusicIdentityRepository(pool).ensureIdentity({
      userDocumentId: `user-${musicId}`, accountDocumentId: `account-${musicId}`,
      username: `owner-${musicId}`, email: `${musicId}@example.invalid`, provider: "google",
      accountName: "Fixture", accountType: "Venue", accountMobile: "+15555550100", internalUsername: `owner-${musicId}`,
      password: "disabled-native-password", guestUrl: `guest-${musicId}`,
      guestCapabilityHash: "a".repeat(64), operationId: `provision-${musicId}`, requestId: musicId,
    });
    await pool.query("INSERT INTO account_music_identity(account_id,music_user_id) VALUES($1,$2)", [owner.accountId, user.id]);
    const feedback = await request(app.app).post("/api/explorers/v1/account/deletion-feedback")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
      .send({ reason: "Music account" });
    const pending = await request(app.app).post("/api/explorers/v1/account/deletion")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
      .send({ expectedRevision: owner.revision, feedbackId: feedback.body.feedback.id });
    expect(pending.status).toBe(200);
    expect(await runAccountLifecycleMaintenance(pool, new LocalObjectStorage())).toBe(0);
    expect((await pool.query("SELECT state,completed_at,failure_code FROM account_lifecycle_operations WHERE id=$1",
      [pending.body.lifecycle.operationId])).rows[0]).toMatchObject({
      state: "pending", completed_at: null, failure_code: "MUSIC_BOUNDARY_PENDING",
    });
    expect((await pool.query("SELECT status FROM creator_accounts WHERE id=$1", [owner.accountId])).rows[0].status).toBe("pending_deletion");
    const context = await app.auth.$context;
    const temporary = await context.internalAdapter.createSession(owner.userId, false);
    const proof = await issueRecoveryProof(pool, { userId: owner.userId,
      subject: `google-${owner.userId}`, sessionId: temporary.id });
    const recovered = await request(app.app).post("/api/explorers/v1/recovery/complete")
      .set("origin", config.baseURL).set("cookie", `explorers_recovery_proof=${proof.token}`)
      .send({ expectedRevision: pending.body.lifecycle.revision });
    expect(recovered.status).toBe(200);
    expect(recovered.body.lifecycle.status).toBe("active");
  });

  it("does not starve an unmapped deletion behind Music-blocked owners with batch size one", async () => {
    const blocked = await identity();
    const musicId = randomUUID();
    const user = await new MusicIdentityRepository(pool).ensureIdentity({
      userDocumentId: `user-${musicId}`, accountDocumentId: `account-${musicId}`,
      username: `owner-${musicId}`, email: `${musicId}@example.invalid`, provider: "google",
      accountName: "Fixture", accountType: "Venue", accountMobile: "+15555550100",
      internalUsername: `owner-${musicId}`, password: "disabled-native-password",
      guestUrl: `guest-${musicId}`, guestCapabilityHash: createHash("sha256").update(musicId).digest("hex"),
      operationId: `provision-${musicId}`, requestId: musicId,
    });
    await pool.query("INSERT INTO account_music_identity(account_id,music_user_id) VALUES($1,$2)", [blocked.accountId, user.id]);
    const blockedOperation = await pendingDeletion(blocked);
    const free = await identity();
    const freeOperation = await pendingDeletion(free);
    expect(await runAccountLifecycleMaintenance(pool, new LocalObjectStorage(), 1)).toBe(1);
    expect((await pool.query("SELECT state,failure_code FROM account_lifecycle_operations WHERE id=$1",
      [blockedOperation])).rows[0]).toMatchObject({ state: "pending", failure_code: "MUSIC_BOUNDARY_PENDING" });
    expect((await pool.query("SELECT state FROM account_lifecycle_operations WHERE id=$1", [freeOperation])).rows[0].state)
      .toBe("succeeded");
    expect(await runAccountLifecycleMaintenance(pool, new LocalObjectStorage(), 1)).toBe(0);
  });

  it("fences a reservation delayed past terminal deletion at the account row", async () => {
    const owner = await identity();
    const actor = await webActor(owner);
    const original = MediaRepository.prototype.reserve;
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    const spy = vi.spyOn(MediaRepository.prototype, "reserve").mockImplementation(async function(input, connection) {
      entered(); await waiting; return original.call(this, input, connection);
    });
    try {
      const attempt = new MediaService(pool, new LocalObjectStorage()).createMedia(actor, upload,
        { requestId: randomUUID() });
      await reached;
      await pendingDeletion(owner);
      expect(await runAccountLifecycleMaintenance(pool, new LocalObjectStorage(), 1)).toBe(1);
      release();
      await expect(attempt).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
      expect((await pool.query("SELECT count(*)::int AS n FROM media_assets WHERE account_id=$1",
        [owner.accountId])).rows[0].n).toBe(0);
    } finally { release(); spy.mockRestore(); }
  });

  it("retains an in-flight put and recovers failed compensation before terminal purge", async () => {
    const owner = await identity();
    const actor = await webActor(owner);
    const backing = new LocalObjectStorage();
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    let key = "";
    const storage = { environment: "local" as const,
      put: async (objectKey: string, bytes: Buffer) => { key = objectKey; entered(); await waiting;
        await backing.put(objectKey, bytes); throw new Error("metadata response lost"); },
      get: (objectKey: string) => backing.get(objectKey),
      delete: async () => { throw new Error("failed compensation"); } };
    const attempt = new MediaService(pool, storage).createMedia(actor, upload, { requestId: randomUUID() });
    await reached;
    const operation = await pendingDeletion(owner);
    expect(await runAccountLifecycleMaintenance(pool, backing, 1)).toBe(1);
    expect((await pool.query("SELECT state,failure_code FROM account_lifecycle_operations WHERE id=$1",
      [operation])).rows[0]).toMatchObject({ state: "running", failure_code: "FINALIZATION_RETRY" });
    release();
    await expect(attempt).rejects.toThrow("Storage unavailable");
    expect((await pool.query("SELECT status FROM media_assets WHERE account_id=$1", [owner.accountId])).rows[0].status)
      .toBe("pending_delete");
    await pool.query("UPDATE account_lifecycle_operations SET updated_at=clock_timestamp()-interval '11 minutes' WHERE id=$1",
      [operation]);
    expect(await runAccountLifecycleMaintenance(pool, backing, 1)).toBe(1);
    expect((await pool.query("SELECT state FROM account_lifecycle_operations WHERE id=$1", [operation])).rows[0].state)
      .toBe("succeeded");
    await expect(backing.get(key)).rejects.toThrow();
  });

  it("reaps a crashed upload reservation and its late object before terminal success", async () => {
    const owner = await identity();
    const storage = new LocalObjectStorage();
    const id = randomUUID();
    const key = `local/${owner.accountId}/${id}`;
    const hash = createHash("sha256").update(png).digest();
    await new MediaRepository(pool).reserve({ id, accountId: owner.accountId, purpose: "profile",
      mimeType: "image/png", filename: "avatar.png", bytes: png, hash, key, environment: "local" });
    await storage.put(key, png);
    await pool.query("UPDATE media_assets SET created_at=clock_timestamp()-interval '11 minutes' WHERE id=$1", [id]);
    const operation = await pendingDeletion(owner);
    expect(await runAccountLifecycleMaintenance(pool, storage, 1)).toBe(1);
    expect((await pool.query("SELECT state FROM account_lifecycle_operations WHERE id=$1", [operation])).rows[0].state)
      .toBe("succeeded");
    expect((await pool.query("SELECT count(*)::int AS n FROM media_assets WHERE account_id=$1",
      [owner.accountId])).rows[0].n).toBe(0);
    await expect(storage.get(key)).rejects.toThrow();
  });

  it("makes same-account uploads and terminal worker progress with a saturated two-connection pool", async () => {
    const owner = await identity();
    const actor = await webActor(owner);
    const small = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 2, connectionTimeoutMillis: 5000 });
    const directory = mkdtempSync(join(tmpdir(), "media-small-pool-"));
    const backing = new LocalObjectStorage(directory);
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    let firstPut = true;
    const storage = { environment: "local" as const,
      put: async (key: string, bytes: Buffer) => {
        if (firstPut) { firstPut = false; entered(); await held; }
        return backing.put(key, bytes);
      }, get: (key: string) => backing.get(key), delete: (key: string) => backing.delete(key) };
    try {
      const service = new MediaService(small, storage);
      const first = service.createMedia(actor, upload, { requestId: randomUUID() });
      await reached;
      const second = service.createMedia(actor, upload, { requestId: randomUUID() });
      const third = service.createMedia(actor, upload, { requestId: randomUUID() });
      const operation = await pendingDeletion(owner);
      const worker = runAccountLifecycleMaintenance(small, storage, 1);
      release();
      const outcomes = await within(Promise.allSettled([first, second, third, worker]));
      expect(outcomes[0].status).toBe("fulfilled");
      for (const outcome of outcomes.slice(1, 3)) {
        expect(outcome).toMatchObject({ status: "rejected", reason: { status: 403, code: "FORBIDDEN" } });
      }
      expect(outcomes[3]).toMatchObject({ status: "fulfilled", value: 1 });
      expect((await pool.query("SELECT state FROM account_lifecycle_operations WHERE id=$1", [operation])).rows[0].state)
        .toBe("succeeded");
    } finally { release(); await small.end(); rmSync(directory, { recursive: true, force: true }); }
  });

  it("makes distinct-account uploads and the worker progress with a saturated two-connection pool", async () => {
    const owners = await Promise.all([identity(), identity(), identity(), identity()]);
    const actors = await Promise.all(owners.slice(0, 3).map(webActor));
    const small = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 2, connectionTimeoutMillis: 5000 });
    const directory = mkdtempSync(join(tmpdir(), "media-small-pool-"));
    const backing = new LocalObjectStorage(directory);
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    let puts = 0;
    const storage = { environment: "local" as const,
      put: async (key: string, bytes: Buffer) => {
        puts += 1;
        if (puts <= 2) { if (puts === 2) entered(); await held; }
        return backing.put(key, bytes);
      }, get: (key: string) => backing.get(key), delete: (key: string) => backing.delete(key) };
    try {
      const service = new MediaService(small, storage);
      const first = service.createMedia(actors[0], upload, { requestId: randomUUID() });
      const second = service.createMedia(actors[1], upload, { requestId: randomUUID() });
      await reached;
      const third = service.createMedia(actors[2], upload, { requestId: randomUUID() });
      const operation = await pendingDeletion(owners[3]);
      const worker = runAccountLifecycleMaintenance(small, storage, 1);
      release();
      const outcomes = await within(Promise.allSettled([first, second, third, worker]));
      expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
      expect(outcomes[3]).toMatchObject({ value: 1 });
      expect((await pool.query("SELECT state FROM account_lifecycle_operations WHERE id=$1", [operation])).rows[0].state)
        .toBe("succeeded");
    } finally { release(); await small.end(); rmSync(directory, { recursive: true, force: true }); }
  });

  it("finalizes a pending delete through child-first media cleanup and retains only a non-revivable tombstone", async () => {
    const owner = await identity();
    await pool.query(`UPDATE creator_accounts SET handle='deletedtest',display_name='Private Person',account_type='Personal',
      onboarding_status='complete',bio_plain='Secret biography' WHERE id=$1`, [owner.accountId]);
    const storage = new LocalObjectStorage();
    const mediaId = randomUUID();
    const key = `local/${owner.accountId}/${mediaId}`;
    await storage.put(key, Buffer.from("private picture"));
    await pool.query(`INSERT INTO media_assets(id,account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at)
      VALUES($1,$2,'profile','ready','image/png',15,$3,clock_timestamp())`, [mediaId, owner.accountId, Buffer.alloc(32, 1)]);
    await pool.query(`INSERT INTO media_objects(media_id,variant,storage_environment,object_key,mime_type,byte_size,content_sha256)
      VALUES($1,'original','local',$2,'image/png',15,$3)`, [mediaId, key, Buffer.alloc(32, 1)]);
    await pool.query("INSERT INTO profile_media(account_id,slot,media_id) VALUES($1,'profile',$2)", [owner.accountId, mediaId]);
    const feedback = await request(app.app).post("/api/explorers/v1/account/deletion-feedback")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
      .send({ reason: "Sensitive feedback" });
    const pending = await request(app.app).post("/api/explorers/v1/account/deletion")
      .set("origin", config.baseURL).set("cookie", owner.cookie).set("idempotency-key", randomUUID())
      .send({ expectedRevision: owner.revision, feedbackId: feedback.body.feedback.id });
    expect(pending.status).toBe(200);
    expect((await pool.query("SELECT state,completed_at FROM account_lifecycle_operations WHERE id=$1",
      [pending.body.lifecycle.operationId])).rows[0]).toMatchObject({ state: "pending", completed_at: null });
    expect(await runAccountLifecycleMaintenance(pool, {
      environment: "local", put: (objectKey, bytes) => storage.put(objectKey, bytes),
      get: (objectKey) => storage.get(objectKey), delete: async () => { throw new Error("temporary storage outage"); },
    })).toBe(1);
    expect((await pool.query("SELECT state,failure_code FROM account_lifecycle_operations WHERE id=$1",
      [pending.body.lifecycle.operationId])).rows[0]).toMatchObject({ state: "running", failure_code: "FINALIZATION_RETRY" });
    await pool.query("UPDATE account_lifecycle_operations SET updated_at=clock_timestamp()-interval '11 minutes' WHERE id=$1",
      [pending.body.lifecycle.operationId]);
    expect(await runAccountLifecycleMaintenance(pool, storage)).toBe(1);
    expect((await pool.query("SELECT status,handle,display_name,bio_plain,deleted_at IS NOT NULL AS deleted FROM creator_accounts WHERE id=$1", [owner.accountId])).rows[0])
      .toMatchObject({ status: "deleted", handle: null, display_name: null, bio_plain: null, deleted: true });
    expect((await pool.query("SELECT state,completed_at IS NOT NULL AS completed FROM account_lifecycle_operations WHERE id=$1",
      [pending.body.lifecycle.operationId])).rows[0]).toMatchObject({ state: "succeeded", completed: true });
    expect((await pool.query("SELECT reason,user_id FROM deletion_feedback WHERE id=$1", [feedback.body.feedback.id])).rows[0])
      .toMatchObject({ reason: null, user_id: null });
    expect((await pool.query("SELECT count(*)::int AS count FROM media_assets WHERE account_id=$1", [owner.accountId])).rows[0].count).toBe(0);
    await expect(storage.get(key)).rejects.toThrow();
    const context = await app.auth.$context;
    const terminalSession = await context.internalAdapter.createSession(owner.userId, false);
    const terminalCookie = `${context.authCookies.sessionToken.name}=${terminalSession.token}.${createHmac("sha256", config.secret).update(terminalSession.token).digest("base64")}`;
    expect((await request(app.app).get("/api/explorers/v1/me").set("cookie", terminalCookie)).status).toBe(403);
    await expect(issueRecoveryProof(pool, { userId: owner.userId,
      subject: `google-${owner.userId}`, sessionId: terminalSession.id })).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS count FROM initial_account_bindings WHERE account_id=$1", [owner.accountId])).rows[0].count).toBe(1);
  });
});
