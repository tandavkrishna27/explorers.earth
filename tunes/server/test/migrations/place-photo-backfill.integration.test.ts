import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMusicMigrations, migrateMusicDatabase, verifyMusicDatabase } from "../../db/migrate";
import { EXPECTED_MUSIC_MIGRATION_ID } from "../../../shared/music-migration-contract";
import { validateIntegrationDatabaseTarget } from "../integration-global-setup";

/**
 * P5-7: 0058 moves historic Places creator uploads out of the generic recommendation_media
 * leg, which no public Places read looks at, into recommendation_place_photos. One database
 * is migrated to 0057, seeded with every shape 0058 must handle, then upgraded - without
 * the seed each assertion would pass vacuously on empty tables.
 */
const adminUrl = process.env.DATABASE_URL_TEST ?? "";
const describePostgres = process.env.MUSIC_C3_POSTGRES_TEST === "1" ? describe.sequential : describe.skip;
const BACKFILL = "0058_explorers_place_photo_backfill";
const databaseName = `music_c3_place_backfill_${process.pid}`;

let admin: pg.Pool;
let pool: pg.Pool;
let accountId = "";
const seeded = { fresh: "", nearlyFull: "", duplicate: "", books: "", freshMedia: [] as string[], nearlyFullGeneric: [] as string[],
  nearlyFullTyped: [] as string[], duplicateMedia: "", booksMedia: "" };

async function media(): Promise<string> {
  return (await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256)
    VALUES($1,'recommendation','ready','image/png',10,now(),decode(repeat('00',32),'hex')) RETURNING id`, [accountId])).rows[0].id;
}
async function recommendation(category: "places" | "books"): Promise<string> {
  const kind = category === "places" ? "place" : "book";
  const entity = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES($1,'Backfill fixture','manual') RETURNING id", [kind])).rows[0].id;
  if (category === "places") await pool.query("INSERT INTO place_entity_details(entity_id) VALUES($1)", [entity]);
  return (await pool.query("INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,$2,$3,'published') RETURNING id",
    [accountId, category, entity])).rows[0].id;
}
async function generic(recommendationId: string, mediaIds: string[], from = 0) {
  for (const [index, id] of mediaIds.entries()) await pool.query(
    "INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,$4)", [recommendationId, accountId, id, from + index]);
}
async function typed(recommendationId: string, mediaIds: string[]) {
  for (const [slot, id] of mediaIds.entries()) await pool.query(
    "INSERT INTO recommendation_place_photos(recommendation_id,account_id,slot_index,media_id) VALUES($1,$2,$3,$4)", [recommendationId, accountId, slot, id]);
}
const photos = async (id: string) => (await pool.query("SELECT media_id FROM recommendation_place_photos WHERE recommendation_id=$1 ORDER BY slot_index", [id])).rows.map((row) => row.media_id);
const leftovers = async (id: string) => (await pool.query("SELECT media_id FROM recommendation_media WHERE recommendation_id=$1 ORDER BY display_order", [id])).rows.map((row) => row.media_id);

describePostgres("0058 Places photo backfill", () => {
  beforeAll(async () => {
    const target = validateIntegrationDatabaseTarget(adminUrl);
    admin = new pg.Pool({ connectionString: target.toString(), max: 2 });
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    target.pathname = `/${databaseName}`;
    pool = new pg.Pool({ connectionString: target.toString(), max: 4 });

    const prior = loadMusicMigrations().filter((migration) => migration.id < BACKFILL);
    expect(prior.at(-1)?.id).toBe("0057_retire_music_category");
    await migrateMusicDatabase(pool, { migrations: prior, testOnlyExpectedIds: prior.map((migration) => migration.id) });

    accountId = (await pool.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id;
    // Three generic uploads, no typed photos: all three move, in display order.
    seeded.fresh = await recommendation("places");
    seeded.freshMedia = [await media(), await media(), await media()];
    await generic(seeded.fresh, [...seeded.freshMedia].reverse());
    // Eight typed photos plus four generic uploads: two fit, two stay referenced.
    seeded.nearlyFull = await recommendation("places");
    for (let i = 0; i < 8; i++) seeded.nearlyFullTyped.push(await media());
    for (let i = 0; i < 4; i++) seeded.nearlyFullGeneric.push(await media());
    await typed(seeded.nearlyFull, seeded.nearlyFullTyped);
    await generic(seeded.nearlyFull, seeded.nearlyFullGeneric);
    // The same asset as both a typed photo and a generic row: the generic row is redundant.
    seeded.duplicate = await recommendation("places");
    seeded.duplicateMedia = await media();
    await typed(seeded.duplicate, [seeded.duplicateMedia]);
    await generic(seeded.duplicate, [seeded.duplicateMedia]);
    // Books legitimately use the generic leg and must not move.
    seeded.books = await recommendation("books");
    seeded.booksMedia = await media();
    await generic(seeded.books, [seeded.booksMedia]);

    const upgraded = await migrateMusicDatabase(pool);
    expect(upgraded.appliedIds[0]).toBe(BACKFILL);
    expect((await verifyMusicDatabase(pool)).currentId).toBe(EXPECTED_MUSIC_MIGRATION_ID);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (!admin) return;
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [databaseName]);
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.end();
  });

  it("moves generic Places uploads into typed slots in their display order", async () => {
    // Break caught: these photos were owner-visible and publicly invisible forever.
    expect(await photos(seeded.fresh)).toEqual([...seeded.freshMedia].reverse());
    expect(await leftovers(seeded.fresh)).toEqual([]);
  });

  it("appends after existing typed photos and keeps what does not fit referenced", async () => {
    expect(await photos(seeded.nearlyFull)).toEqual([...seeded.nearlyFullTyped, ...seeded.nearlyFullGeneric.slice(0, 2)]);
    // The two that do not fit stay generic: still referenced, so no sweep can delete them.
    expect(await leftovers(seeded.nearlyFull)).toEqual(seeded.nearlyFullGeneric.slice(2));
  });

  it("drops a generic row duplicating a typed photo and leaves Books alone", async () => {
    expect(await photos(seeded.duplicate)).toEqual([seeded.duplicateMedia]);
    expect(await leftovers(seeded.duplicate)).toEqual([]);
    expect(await leftovers(seeded.books)).toEqual([seeded.booksMedia]);
  });

  it("deletes no media asset", async () => {
    const statuses = (await pool.query("SELECT DISTINCT status FROM media_assets WHERE account_id=$1", [accountId])).rows.map((row) => row.status);
    expect(statuses).toEqual(["ready"]);
  });
});
