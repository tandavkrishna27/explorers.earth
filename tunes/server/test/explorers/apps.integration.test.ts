import {createHash, randomUUID} from "node:crypto";
import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {migrateMusicDatabase} from "../../db/migrate";
import {insertAppDetails, readAppEntity, readAppScreenshotMediaIds, writeAppScreenshots, effectiveAppDetails} from "../../repositories/appCatalogRepository";
import {publicAppsProjection} from "../../publicProfile/publicAppsProjection";
import {appEntityDetailsSchema} from "../../../shared/explorersAppContract";

/**
 * Ticket 4.3. 0043's storage against a real PostgreSQL 15, through the repository rather
 * than raw SQL, so the typed round-trip and the ordered screenshot relation are exercised
 * the way the application uses them.
 */
const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C6_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `explorers_apps_${process.pid}`;

let admin: pg.Pool;
let pool: pg.Pool;

const details = (over: Record<string, unknown> = {}) => appEntityDetailsSchema.parse({
  appUrl: "https://example.com/app", developer: "Dev", logoUrl: null, description: "Notes",
  downloadUrl: null, priceTier: "Freemium", platforms: ["iOS", "macOS"], ...over,
});

/** An account with an apps recommendation and the requested number of ready images. */
async function seed(screenshots = 0) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const accountId = (await client.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
    const entityId = (await client.query("INSERT INTO entities(kind,title,origin) VALUES('app',$1,'manual') RETURNING id", [`App ${randomUUID()}`])).rows[0].id as string;
    const recommendationId = (await client.query(
      "INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'apps',$2,'draft') RETURNING id",
      [accountId, entityId])).rows[0].id as string;
    const mediaIds: string[] = [];
    for (let index = 0; index < screenshots; index += 1) {
      mediaIds.push((await client.query(
        `INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at)
         VALUES($1,'recommendation','ready','image/png',1024,$2,now()) RETURNING id`,
        [accountId, createHash("sha256").update(`shot-${index}-${recommendationId}`).digest()])).rows[0].id as string);
    }
    await client.query("COMMIT");
    return {accountId, entityId, recommendationId, mediaIds};
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

describePg("Apps typed storage on a real PostgreSQL", () => {
  beforeAll(async () => {
    admin = new pg.Pool({connectionString: exactTarget});
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^15\./);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const target = new URL(exactTarget);
    target.pathname = `/${databaseName}`;
    pool = new pg.Pool({connectionString: target.toString(), max: 8});
    await migrateMusicDatabase(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [databaseName]);
    await admin?.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin?.end();
  });

  it("round-trips every typed field through the repository", async () => {
    const {entityId} = await seed();
    const client = await pool.connect();
    try { await insertAppDetails(client, entityId, details({logoUrl: "https://example.com/l.png", downloadUrl: "https://example.com/get"})); }
    finally { client.release(); }

    const entity = await readAppEntity(pool, entityId);
    expect(entity).toMatchObject({id: entityId, kind: "app", origin: "manual"});
    expect(entity.details).toEqual(details({logoUrl: "https://example.com/l.png", downloadUrl: "https://example.com/get"}));
  }, 30_000);

  it("refuses an app entity with no typed details instead of inventing an empty one", async () => {
    // 0043 declares app_url NOT NULL, so there is no all-null empty value to fall back on
    // the way Books does. A details-less app is a broken state, not a default.
    const {entityId} = await seed();
    await expect(readAppEntity(pool, entityId)).rejects.toMatchObject({status: 409});
  }, 30_000);

  it("keeps screenshot order across a reload and replaces the whole set atomically", async () => {
    const {accountId, recommendationId, mediaIds} = await seed(3);
    const client = await pool.connect();
    try {
      await writeAppScreenshots(client, recommendationId, accountId, [mediaIds[2], mediaIds[0], mediaIds[1]]);
      expect(await readAppScreenshotMediaIds(pool, recommendationId, accountId)).toEqual([mediaIds[2], mediaIds[0], mediaIds[1]]);

      // A reorder replaces rather than appends, and compacts the slots.
      await writeAppScreenshots(client, recommendationId, accountId, [mediaIds[1], mediaIds[2]]);
      expect(await readAppScreenshotMediaIds(pool, recommendationId, accountId)).toEqual([mediaIds[1], mediaIds[2]]);
      expect((await pool.query("SELECT slot_index FROM recommendation_app_screenshots WHERE recommendation_id=$1 ORDER BY slot_index", [recommendationId])).rows.map(r => r.slot_index)).toEqual([0, 1]);

      await writeAppScreenshots(client, recommendationId, accountId, []);
      expect(await readAppScreenshotMediaIds(pool, recommendationId, accountId)).toEqual([]);
    } finally { client.release(); }
  }, 30_000);

  it("refuses a duplicate or over-long screenshot set before touching the database", async () => {
    const {accountId, recommendationId, mediaIds} = await seed(2);
    const client = await pool.connect();
    try {
      await expect(writeAppScreenshots(client, recommendationId, accountId, [mediaIds[0], mediaIds[0]])).rejects.toMatchObject({status: 422});
      await expect(writeAppScreenshots(client, recommendationId, accountId, Array.from({length: 11}, () => randomUUID()))).rejects.toMatchObject({status: 422});
      expect(await readAppScreenshotMediaIds(pool, recommendationId, accountId)).toEqual([]);
    } finally { client.release(); }
  }, 30_000);

  it("refuses a screenshot whose media is not a ready owned recommendation image", async () => {
    // 0043's guard, exercised through the repository: an unready asset, and another
    // account's asset, are both refused.
    const {accountId, recommendationId} = await seed();
    const other = await seed(1);
    const unready = (await pool.query(
      `INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size) VALUES($1,'recommendation','uploading','image/png',1024) RETURNING id`,
      [accountId])).rows[0].id as string;
    const client = await pool.connect();
    try {
      await expect(writeAppScreenshots(client, recommendationId, accountId, [unready])).rejects.toThrow();
    } finally { client.release(); }
    const foreign = await pool.connect();
    try {
      await expect(writeAppScreenshots(foreign, recommendationId, accountId, [other.mediaIds[0]])).rejects.toThrow();
    } finally { foreign.release(); }
  }, 30_000);

  it("applies display overrides to effective details but never to the app URL", async () => {
    // appUrl is the entity's identity. An override re-presents a shared entity for one
    // owner, so permitting it would redirect everyone else's.
    const base = details();
    expect(effectiveAppDetails(base, {developer: "Patched", priceTier: "Paid"})).toEqual(details({developer: "Patched", priceTier: "Paid"}));
    expect(effectiveAppDetails(base, {appUrl: "https://evil.example/app"}).appUrl).toBe("https://example.com/app");
  }, 30_000);

  it("serves a published Apps list instead of an empty page", async () => {
    // Before 4.3 the gateway fell through to { items: [], nextCursor: null } for apps and
    // answered 200, so a published Apps tab looked legitimately empty rather than
    // unimplemented. This is the proof that it now carries content.
    const {accountId, entityId, recommendationId, mediaIds} = await seed(2);
    const handle = `appowner${randomUUID().slice(0, 8)}`;
    await pool.query(`UPDATE creator_accounts SET handle=$2,display_name='App owner',account_type='Creator',
      public_profile=true,onboarding_status='complete',status='active' WHERE id=$1`, [accountId, handle]);
    await pool.query(`INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'apps',true,0)
      ON CONFLICT(account_id,category) DO UPDATE SET is_public=true`, [accountId]);

    const client = await pool.connect();
    try {
      await insertAppDetails(client, entityId, details({developer: "Studio", downloadUrl: "https://example.com/get"}));
      await writeAppScreenshots(client, recommendationId, accountId, mediaIds);
    } finally { client.release(); }

    const collectionId = (await pool.query(
      `INSERT INTO collections(account_id,category,title,slug,heading,visibility,publication_state,display_order)
       VALUES($1,'apps','Daily tools',$2,'Top tools','public','published',0) RETURNING id`,
      [accountId, `tools-${randomUUID().slice(0, 8)}`])).rows[0].id as string;
    await pool.query("UPDATE recommendations SET publication_state='published' WHERE id=$1", [recommendationId]);
    await pool.query(
      "INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'apps',0)",
      [collectionId, recommendationId, accountId]);

    const page = await publicAppsProjection(pool, handle, 12) as {appLists: Array<Record<string, any>>};
    expect(page).toBeDefined();
    expect(page.appLists).toHaveLength(1);
    const list = page.appLists[0];
    expect(list).toMatchObject({documentId: collectionId, List_Name: "Daily tools", Visibility: true, top_apps_heading: "Top tools"});
    expect(list.recommended_apps).toHaveLength(1);
    expect(list.recommended_apps[0]).toMatchObject({
      documentId: recommendationId, app_url: "https://example.com/app", developer: "Studio",
      price_tier: "Freemium", platforms: ["iOS", "macOS"], download_url: "https://example.com/get",
      is_pinned: false, app_category: null,
    });
    // Screenshots are owned media, so they are served through the media route and never as
    // an address an owner typed.
    expect(list.recommended_apps[0].screenshots).toEqual(mediaIds.map(id => `/api/explorers/v1/media/${id}/content`));

    // An unpublished list is not public, which is the gate the projection shares with Books.
    await pool.query("UPDATE collections SET publication_state='draft' WHERE id=$1", [collectionId]);
    expect(((await publicAppsProjection(pool, handle, 12)) as {appLists: unknown[]}).appLists).toHaveLength(0);
  }, 60_000);

  it("removes screenshots when the account's content is purged", async () => {
    const {accountId, recommendationId, mediaIds} = await seed(2);
    const client = await pool.connect();
    try { await writeAppScreenshots(client, recommendationId, accountId, mediaIds); } finally { client.release(); }
    expect(await readAppScreenshotMediaIds(pool, recommendationId, accountId)).toHaveLength(2);

    // A delete operation is only representable with its command receipt and feedback row:
    // 0027 makes receipt_id NOT NULL and ties feedback_id to kind='delete' by CHECK.
    const revision = (await pool.query<{revision: string}>("SELECT revision::text FROM creator_accounts WHERE id=$1", [accountId])).rows[0].revision;
    const receipt = (await pool.query(
      `INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,response)
       VALUES($1,'account.delete',$2,$3,'{}'::jsonb) RETURNING id`,
      [accountId, createHash("sha256").update(`key-${accountId}`).digest(), createHash("sha256").update(`req-${accountId}`).digest()])).rows[0].id as string;
    const feedback = (await pool.query(
      "INSERT INTO deletion_feedback(account_id,reason) VALUES($1,'integration purge') RETURNING id", [accountId])).rows[0].id as string;
    const operation = (await pool.query(
      `INSERT INTO account_lifecycle_operations(account_id,kind,state,expected_revision,receipt_id,feedback_id)
       VALUES($1,'delete','running',$2,$3,$4) RETURNING id`,
      [accountId, revision, receipt, feedback])).rows[0].id as string;
    await pool.query("UPDATE creator_accounts SET status='pending_deletion',deletion_requested_at=now() WHERE id=$1", [accountId]);
    await pool.query("SELECT purge_explorers_account_content($1,$2)", [accountId, operation]);

    expect((await pool.query("SELECT count(*)::int AS rows FROM recommendation_app_screenshots WHERE account_id=$1", [accountId])).rows[0].rows).toBe(0);
  }, 30_000);
});
