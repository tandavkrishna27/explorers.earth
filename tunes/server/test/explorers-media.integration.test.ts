import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanonicalApp } from "../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../auth/betterAuth";
import { MediaService, MediaUnavailable } from "../application/media";
import type { Actor } from "../application/actor";
import type { ObjectStorage } from "../services/objectStorage";
import { MediaRepository } from "../repositories/mediaRepository";
import { publicAppsProjection } from "../publicProfile/publicAppsProjection";
import { publicPlacesProjection } from "../publicProfile/publicPlacesProjection";

const config = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
  EXPLORERS_AUTH_SECRET: "integration-secret-".repeat(4), GOOGLE_CLIENT_ID: "fixture-google-id", GOOGLE_CLIENT_SECRET: "fixture-google-secret" });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
let pool: pg.Pool;
let composed: ReturnType<typeof createCanonicalApp>;

async function persona() {
  const userId = `media-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Owner',$2)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
    [randomUUID(), `google-${userId}`, userId]);
  const context = await composed.auth.$context;
  const session = await context.internalAdapter.createSession(userId, false);
  const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
  const initial = await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie);
  expect(initial.status).toBe(200);
  return { cookie, userId, accountId: initial.body.account.id as string, revision: initial.body.account.revision as number };
}

async function upload(cookie: string, bytes = png, mime = "image/png", purpose = "profile") {
  return request(composed.app).post("/api/explorers/v1/media").set("cookie", cookie).set("origin", config.baseURL)
    .set("content-type", mime).set("x-media-purpose", purpose).set("x-file-name", "avatar.png").send(bytes);
}

describe("private local media", () => {
  beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 }); composed = createCanonicalApp(pool, config); });
  afterAll(async () => { await pool?.end(); });

  // These fixtures use real uploaded bytes and committed, schema-validated typed rows.
  for (const category of ["apps", "places"] as const) {
    const table = category === "apps" ? "recommendation_app_screenshots" : "recommendation_place_photos";
    async function fixture() {
      const owner = await persona();
      const handle = `m${randomUUID().replaceAll("-", "").slice(0, 20)}`;
      await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Media creator',account_type='Creator',onboarding_status='complete',status='active',public_profile=true WHERE id=$1", [owner.accountId, handle]);
      await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,$2,true,(SELECT coalesce(max(display_order),-1)+1 FROM account_category_settings WHERE account_id=$1)) ON CONFLICT(account_id,category) DO UPDATE SET is_public=true", [owner.accountId, category]);
      const uploaded = await upload(owner.cookie, png, "image/png", "recommendation");
      expect(uploaded.status).toBe(201);
      const id = uploaded.body.media.id as string;
      const url = `/api/explorers/v1/media/${id}/content`;
      async function attach(mediaId = id) {
        const entity = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES($1,'Typed media fixture','manual') RETURNING id", [category === "apps" ? "app" : "place"])).rows[0].id;
        if (category === "apps") await pool.query("INSERT INTO app_entity_details(entity_id,app_url) VALUES($1,'https://example.invalid/app')", [entity]);
        else await pool.query("INSERT INTO place_entity_details(entity_id) VALUES($1)", [entity]);
        const collection = (await pool.query("INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order) VALUES($1,$2,'Media list',$3,'public','published',0) RETURNING id", [owner.accountId, category, `media-${randomUUID()}`])).rows[0].id;
        const recommendation = (await pool.query("INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,$2,$3,'published') RETURNING id", [owner.accountId, category, entity])).rows[0].id;
        await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,$4,0)", [collection, recommendation, owner.accountId, category]);
        await pool.query(`INSERT INTO ${table}(recommendation_id,account_id,slot_index,media_id) VALUES($1,$2,0,$3)`, [recommendation, owner.accountId, mediaId]);
        return { collection, recommendation };
      }
      return { owner, handle, id, url, attach, repository: new MediaRepository(pool) };
    }
    async function visible(f: Awaited<ReturnType<typeof fixture>>, expected: boolean, id = f.id) {
      expect(await f.repository.isPublicAttachment(id)).toBe(expected);
      const response = await request(composed.app).get(`/api/explorers/v1/media/${id}/content`);
      expect(response.status).toBe(expected ? 200 : 404);
      if (expected) expect(response.body).toEqual(png);
    }

    it(`typed Apps/Places media ${category}: public projection and independent entitlement withdrawals`, async () => {
      const f = await fixture();
      await visible(f, false);
      expect((await request(composed.app).get(f.url).set("cookie", f.owner.cookie)).status).toBe(200);
      const foreign = await persona();
      expect((await request(composed.app).get(f.url).set("cookie", foreign.cookie)).status).toBe(404);
      expect((await request(composed.app).delete(`/api/explorers/v1/media/${f.id}`).set("cookie", foreign.cookie).set("origin", config.baseURL)).status).toBe(404);
      const attachment = await f.attach();
      const projection = category === "apps" ? await publicAppsProjection(pool, f.handle, 24) : await publicPlacesProjection(pool, f.handle, 24);
      if (category === "apps") expect(projection?.appLists[0].recommended_apps[0].screenshots).toEqual([f.url]);
      else expect(projection?.recommendationLists[0].recommended_places[0].Media).toEqual([{ documentId: f.id, url: f.url }]);
      await visible(f, true);
      const cover = await upload(f.owner.cookie, png, "image/png", "collection");
      expect(cover.status).toBe(201);
      await pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)", [attachment.collection, f.owner.accountId, cover.body.media.id]);
      await visible(f, true, cover.body.media.id);
      const gates = [
        ["creator_accounts", "public_profile=false", "public_profile=true", f.owner.accountId, true],
        ["creator_accounts", "status='suspended',suspended_at=now()", "status='active',suspended_at=NULL", f.owner.accountId, true],
        ["creator_accounts", "onboarding_status='incomplete'", "onboarding_status='complete'", f.owner.accountId, true],
        ["collections", "visibility='private'", "visibility='public'", attachment.collection, true],
        ["collections", "publication_state='draft'", "publication_state='published'", attachment.collection, true],
        ["collections", "archived_at=now()", "archived_at=NULL", attachment.collection, true],
        ["recommendations", "publication_state='draft'", "publication_state='published'", attachment.recommendation, false],
        ["recommendations", "archived_at=now()", "archived_at=NULL", attachment.recommendation, false],
      ] as const;
      for (const [relation, withdraw, restore, key, deniesCover] of gates) {
        await pool.query(`UPDATE ${relation} SET ${withdraw} WHERE id=$1`, [key]);
        await visible(f, false);
        await visible(f, !deniesCover, cover.body.media.id);
        await pool.query(`UPDATE ${relation} SET ${restore} WHERE id=$1`, [key]);
        await visible(f, true);
        await visible(f, true, cover.body.media.id);
      }
      await pool.query("UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category=$2", [f.owner.accountId, category]);
      await visible(f, false); await visible(f, false, cover.body.media.id);
      await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category=$2", [f.owner.accountId, category]);
      await visible(f, true);
      await pool.query("DELETE FROM collection_items WHERE recommendation_id=$1", [attachment.recommendation]);
      await visible(f, false); await visible(f, true, cover.body.media.id);
      await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,$4,0)", [attachment.collection, attachment.recommendation, f.owner.accountId, category]);
      await visible(f, true);
    }, 30_000);

    it(`typed Apps/Places media ${category}: any surviving public list grants bytes without granting deletion`, async () => {
      const f = await fixture(); const first = await f.attach(); const second = await f.attach();
      await visible(f, true);
      await pool.query("DELETE FROM collection_items WHERE collection_id=$1", [first.collection]);
      await visible(f, true);
      await pool.query("UPDATE collections SET visibility='private' WHERE id=$1", [second.collection]);
      await visible(f, false);
      expect((await request(composed.app).get(f.url).set("cookie", f.owner.cookie)).status).toBe(200);
      // Do not swallow the current deferred constraint failure: the desired result is a clean refusal.
      expect(await f.repository.markDelete(f.id, f.owner.accountId)).toBeUndefined();
      expect((await f.repository.find(f.id))?.status).toBe("ready");
    }, 30_000);

    it(`typed Apps/Places media ${category}: attached deletion refuses cleanly for private draft archived parents`, async () => {
      const f = await fixture(); const attachment = await f.attach();
      await pool.query("UPDATE collections SET visibility='private',publication_state='draft',archived_at=now() WHERE id=$1", [attachment.collection]);
      await pool.query("UPDATE recommendations SET publication_state='draft',archived_at=now() WHERE id=$1", [attachment.recommendation]);
      // This assertion must execute first: public serving and abandoned selection have
      // separate regressions, and must not hide a deferred COMMIT failure from markDelete.
      expect(await f.repository.markDelete(f.id, f.owner.accountId)).toBeUndefined();
      expect((await pool.query("SELECT status FROM media_assets WHERE id=$1", [f.id])).rows[0].status).toBe("ready");
    }, 30_000);

    it(`typed Apps/Places media ${category}: aged attachments survive cleanup until the last real relation detaches`, async () => {
      const f = await fixture(); const first = await f.attach(); const second = await f.attach();
      await pool.query("UPDATE media_assets SET created_at=now()-interval '25 hours' WHERE id=$1", [f.id]);
      expect((await f.repository.abandoned(f.owner.accountId, "local")).map(row => row.id)).not.toContain(f.id);
      await pool.query("UPDATE collections SET visibility='private',publication_state='draft',archived_at=now() WHERE account_id=$1", [f.owner.accountId]);
      await pool.query("UPDATE recommendations SET publication_state='draft',archived_at=now() WHERE account_id=$1", [f.owner.accountId]);
      expect((await f.repository.abandoned(f.owner.accountId, "local")).map(row => row.id)).not.toContain(f.id);
      expect(await f.repository.markDelete(f.id, f.owner.accountId)).toBeUndefined();
      await pool.query(`DELETE FROM ${table} WHERE recommendation_id=$1`, [first.recommendation]);
      expect(await f.repository.markDelete(f.id, f.owner.accountId)).toBeUndefined();
      expect((await f.repository.abandoned(f.owner.accountId, "local")).map(row => row.id)).not.toContain(f.id);
      await pool.query(`DELETE FROM ${table} WHERE recommendation_id=$1`, [second.recommendation]);
      // A second legitimate relation still blocks cleanup after final typed detach.
      await pool.query("INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,0)", [second.recommendation, f.owner.accountId, f.id]);
      await pool.query("UPDATE collections SET visibility='public',publication_state='published',archived_at=NULL WHERE id=$1", [second.collection]);
      await pool.query("UPDATE recommendations SET publication_state='published',archived_at=NULL WHERE id=$1", [second.recommendation]);
      // Generic Apps/Places uploads do not inherit the typed gallery's public entitlement.
      await visible(f, false);
      expect(await f.repository.markDelete(f.id, f.owner.accountId)).toBeUndefined();
      expect((await f.repository.abandoned(f.owner.accountId, "local")).map(row => row.id)).not.toContain(f.id);
      await pool.query("DELETE FROM recommendation_media WHERE media_id=$1", [f.id]);
      expect((await f.repository.abandoned(f.owner.accountId, "local")).map(row => row.id)).toContain(f.id);
      const removed = await f.repository.markDelete(f.id, f.owner.accountId);
      expect(removed).toMatchObject({ id: f.id, status: "pending_delete", storage_environment: "local" });
      expect(removed?.object_key).toBeTruthy();
      expect((await pool.query("SELECT status FROM media_assets WHERE id=$1", [f.id])).rows[0].status).toBe("pending_delete");
    }, 30_000);

    it(`typed Apps/Places media ${category}: actual schema rejects unsafe typed relations and attached transitions`, async () => {
      const f = await fixture(); const attachment = await f.attach();
      await expect(pool.query("UPDATE media_assets SET status='pending_delete',delete_requested_at=now() WHERE id=$1", [f.id])).rejects.toMatchObject({ code: "23514" });
      expect((await f.repository.find(f.id))?.status).toBe("ready");
      for (const purpose of ["profile", "claim-evidence"] as const) {
        const wrong = await upload(f.owner.cookie, png, "image/png", "profile"); expect(wrong.status).toBe(201);
        if (purpose === "claim-evidence") await pool.query("UPDATE media_assets SET purpose='claim-evidence' WHERE id=$1", [wrong.body.media.id]);
        await expect(pool.query(`INSERT INTO ${table}(recommendation_id,account_id,slot_index,media_id) VALUES($1,$2,1,$3)`, [attachment.recommendation, f.owner.accountId, wrong.body.media.id])).rejects.toMatchObject({ code: "23514" });
      }
      const unready = await upload(f.owner.cookie, png, "image/png", "recommendation"); expect(unready.status).toBe(201);
      await pool.query("UPDATE media_assets SET status='pending_delete',delete_requested_at=now() WHERE id=$1", [unready.body.media.id]);
      await expect(pool.query(`INSERT INTO ${table}(recommendation_id,account_id,slot_index,media_id) VALUES($1,$2,1,$3)`, [attachment.recommendation, f.owner.accountId, unready.body.media.id])).rejects.toMatchObject({ code: "23514" });
      const other = await persona(); const foreign = await upload(other.cookie, png, "image/png", "recommendation"); expect(foreign.status).toBe(201);
      // The composite ownership FK rejects before the deferred guard can run.
      await expect(pool.query(`INSERT INTO ${table}(recommendation_id,account_id,slot_index,media_id) VALUES($1,$2,1,$3)`, [attachment.recommendation, f.owner.accountId, foreign.body.media.id])).rejects.toMatchObject({ code: "23503" });
      expect((await f.repository.find(f.id))?.status).toBe("ready");
    }, 30_000);
  }

  it("denies anonymous upload, spoofed MIME and bytes", async () => {
    expect((await request(composed.app).post("/api/explorers/v1/media").set("origin", config.baseURL).set("content-type", "image/png").send(png)).status).toBe(401);
    const owner = await persona();
    expect((await upload(owner.cookie, Buffer.from("not an image"))).status).toBe(422);
    expect((await upload(owner.cookie, png, "image/jpeg")).status).toBe(422);
  });

  it("keeps detached bytes owner-only and publishes only after live attachment", async () => {
    const owner = await persona();
    const other = await persona();
    const uploaded = await upload(owner.cookie);
    expect(uploaded.status).toBe(201);
    const url = uploaded.body.media.url as string;
    expect((await request(composed.app).get(url)).status).toBe(404);
    expect((await request(composed.app).get(url).set("cookie", other.cookie)).status).toBe(404);
    expect((await request(composed.app).get(url).set("cookie", owner.cookie)).status).toBe(200);
    const attached = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", owner.cookie)
      .set("origin", config.baseURL).send({ expectedRevision: owner.revision, profileImageId: uploaded.body.media.id });
    expect(attached.status).toBe(200);
    expect((await request(composed.app).get(url)).status).toBe(404);
    const head = await request(composed.app).head(url).set("cookie", owner.cookie);
    expect(head.status).toBe(200);
    // Attached but not yet published, so these bytes are the owner's alone and must not be
    // stored by any cache between them and this server.
    expect(head.headers["cache-control"]).toBe("no-store");
    const partial = await request(composed.app).get(url).set("cookie", owner.cookie).set("range", "bytes=0-3");
    expect(partial.status).toBe(206);
    expect(partial.headers["content-range"]).toBe(`bytes 0-3/${png.length}`);
    expect(partial.body).toEqual(png.subarray(0, 4));
    const unsatisfiable = await request(composed.app).get(url).set("cookie", owner.cookie).set("range", "bytes=99999-");
    expect(unsatisfiable.status).toBe(416);
    const published = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", owner.cookie)
      .set("origin", config.baseURL).send({ expectedRevision: owner.revision + 1,
        handle: `p${randomUUID().replaceAll("-", "").slice(0, 12)}`, displayName: "Public",
        accountType: "Creator", onboardingStatus: "complete" });
    expect(published.status).toBe(200);
    const servedPublicly = await request(composed.app).get(url);
    expect(servedPublicly.status).toBe(200);
    // Public bytes are cacheable, so a repeat view does not re-download them through this
    // server. The window is short because it also bounds how long an unpublished image can
    // still be handed out by a shared cache.
    expect(servedPublicly.headers["cache-control"]).toBe("public, max-age=300, must-revalidate");
    expect(servedPublicly.headers.etag).toBeTruthy();
    // Past the window, revalidation costs a request and no bytes. Under no-store a browser
    // kept no ETag, so this branch was unreachable from one.
    const revalidated = await request(composed.app).get(url).set("if-none-match", servedPublicly.headers.etag!);
    expect(revalidated.status).toBe(304);
    expect(revalidated.body.length ?? 0).toBe(0);
    const detached = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", owner.cookie)
      .set("origin", config.baseURL).send({ expectedRevision: owner.revision + 2, profileImageId: null });
    expect(detached.status).toBe(200);
    expect((await request(composed.app).get(url)).status).toBe(404);
    const deleted = await request(composed.app).delete(`/api/explorers/v1/media/${uploaded.body.media.id}`)
      .set("cookie", owner.cookie).set("origin", config.baseURL);
    expect(deleted.status).toBe(204);
    expect((await request(composed.app).get(url).set("cookie", owner.cookie)).status).toBe(404);
  });

  it("rejects wrong-owner attachment and deletion", async () => {
    const owner = await persona();
    const other = await persona();
    const uploaded = await upload(owner.cookie);
    expect(uploaded.status).toBe(201);
    const foreign = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", other.cookie)
      .set("origin", config.baseURL).send({ expectedRevision: other.revision, profileImageId: uploaded.body.media.id });
    expect(foreign.status).toBe(422);
    expect((await request(composed.app).delete(`/api/explorers/v1/media/${uploaded.body.media.id}`).set("cookie", other.cookie).set("origin", config.baseURL)).status).toBe(404);
  });

  it("serializes concurrent attach and delete under the asset lock", async () => {
    const owner = await persona();
    const created = await upload(owner.cookie);
    expect(created.status).toBe(201);
    const id = created.body.media.id as string;
    const attaching = await pool.connect();
    try {
      await attaching.query("BEGIN");
      await attaching.query("SELECT id FROM media_assets WHERE id=$1 FOR SHARE", [id]);
      await attaching.query("INSERT INTO profile_media(account_id,slot,media_id) VALUES ($1,'profile',$2)", [owner.accountId, id]);
      const deleting = new MediaRepository(pool).markDelete(id, owner.accountId);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await attaching.query("COMMIT");
      expect(await deleting).toBeUndefined();
      expect((await pool.query("SELECT status FROM media_assets WHERE id=$1", [id])).rows[0].status).toBe("ready");
    } finally { await attaching.query("ROLLBACK").catch(() => undefined); attaching.release(); }
  });

  it("rejects direct SQL attachments to unready media and unready transitions of attached media", async () => {
    const owner = await persona();
    const created = await upload(owner.cookie);
    const id = created.body.media.id as string;
    await pool.query("UPDATE media_assets SET status='pending_delete',delete_requested_at=now() WHERE id=$1", [id]);
    await expect(pool.query("INSERT INTO profile_media(account_id,slot,media_id) VALUES ($1,'profile',$2)",
      [owner.accountId, id])).rejects.toMatchObject({ code: "23514" });
    await pool.query("UPDATE media_assets SET status='ready' WHERE id=$1", [id]);
    await pool.query("INSERT INTO profile_media(account_id,slot,media_id) VALUES ($1,'profile',$2)", [owner.accountId, id]);
    await expect(pool.query("UPDATE media_assets SET status='pending_delete',delete_requested_at=now() WHERE id=$1", [id]))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("allows wallpaper and shared profile slots while rejecting feed and claim-evidence purposes", async () => {
    const owner = await persona();
    const profile = await upload(owner.cookie);
    const profileId = profile.body.media.id as string;
    await pool.query("INSERT INTO profile_media(account_id,slot,media_id) VALUES ($1,'profile',$2)", [owner.accountId, profileId]);
    await pool.query("INSERT INTO profile_media(account_id,slot,media_id) VALUES ($1,'wallpaper',$2)", [owner.accountId, profileId]);
    const slots = await pool.query("SELECT slot FROM profile_media WHERE account_id=$1 AND media_id=$2 ORDER BY slot", [owner.accountId, profileId]);
    expect(slots.rows.map((row) => row.slot)).toEqual(["profile", "wallpaper"]);

    const background = await upload(owner.cookie, png, "image/png", "background");
    expect(background.status).toBe(201);
    await pool.query("INSERT INTO profile_media(account_id,slot,media_id) VALUES ($1,'background',$2)", [owner.accountId, background.body.media.id]);

    const feed = await upload(owner.cookie, png, "image/png", "feed");
    expect(feed.status).toBe(201);
    await expect(pool.query("UPDATE profile_media SET media_id=$1 WHERE account_id=$2 AND slot='wallpaper'",
      [feed.body.media.id, owner.accountId])).rejects.toMatchObject({ code: "23514" });
    await pool.query("UPDATE media_assets SET purpose='claim-evidence' WHERE id=$1", [feed.body.media.id]);
    await expect(pool.query("UPDATE profile_media SET media_id=$1 WHERE account_id=$2 AND slot='wallpaper'",
      [feed.body.media.id, owner.accountId])).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps a durable cleanup record when upload finalization and object deletion both fail", async () => {
    const owner = await persona();
    const actor: Actor = { userId: owner.userId, accountId: owner.accountId, role: "owner",
      credential: { kind: "oauth", grantId: "test-only", scopes: ["media:create"] } };
    const input = { purpose: "profile" as const, filename: "avatar.png", mimeType: "image/png",
      length: png.length, bytes: png };
    const unavailable: ObjectStorage = { environment: "local", put: async () => { throw Error("storage offline"); },
      get: async () => png, delete: async () => undefined };
    await expect(new MediaService(pool, unavailable).createMedia(actor, input, { requestId: "test" }))
      .rejects.toBeInstanceOf(MediaUnavailable);
    const retired = await pool.query("SELECT status FROM media_assets WHERE account_id=$1", [owner.accountId]);
    expect(retired.rows[0].status).toBe("deleted");
    const storage: ObjectStorage = { environment: "local", put: async () => undefined,
      get: async () => png, delete: async () => { throw Error("delete offline"); } };
    let inject = true;
    const failingPool = { query: pool.query.bind(pool), connect: async () => {
      const client = await pool.connect();
      return { query: (...args: any[]) => {
        if (inject && String(args[0]).includes("SET status='ready'")) { inject = false; throw Error("metadata offline"); }
        return (client.query as any)(...args);
      }, release: () => client.release() };
    } } as unknown as pg.Pool;
    await expect(new MediaService(failingPool, storage).createMedia(actor, input, { requestId: "test" }))
      .rejects.toBeInstanceOf(MediaUnavailable);
    const pending = await pool.query("SELECT id,status FROM media_assets WHERE account_id=$1 AND status='pending_delete'", [owner.accountId]);
    expect(pending.rowCount).toBe(1);
    const removed: string[] = [];
    const recovered: ObjectStorage = { environment: "local", put: async () => undefined,
      get: async () => png, delete: async (key) => { removed.push(key); } };
    await new MediaService(pool, recovered).retryPendingDeletes(owner.accountId);
    expect(removed).toHaveLength(1);
    expect((await pool.query("SELECT status FROM media_assets WHERE id=$1", [pending.rows[0].id])).rows[0].status).toBe("deleted");
  });
});
