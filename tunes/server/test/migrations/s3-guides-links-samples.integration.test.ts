import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {loadMusicMigrations, migrateMusicDatabase, verifyMusicDatabase} from "../../db/migrate";
import {EXPECTED_MUSIC_MIGRATION_ID} from "../../../shared/music-migration-contract";
import {validateIntegrationDatabaseTarget} from "../integration-global-setup";
import {guideSectionBlocksSchema} from "../../../shared/explorersGuideContract";
import {readGuideSectionPage} from "../../repositories/guideRepository";
import {deleteListLink, insertListLink, readListLinksForCollection} from "../../repositories/listLinkRepository";
import {claimSample, readSampleReceipts, recordSampleSeeded} from "../../repositories/sampleRepository";

/**
 * S3: one database migrated to the pre-S3 head, seeded with v1 guide sections and 0049 place
 * links, then upgraded through 0069-0071. Without the seed every assertion is vacuous.
 */
const adminUrl = process.env.DATABASE_URL_TEST ?? "";
const describePostgres = process.env.MUSIC_C3_POSTGRES_TEST === "1" ? describe.sequential : describe.skip;
const FIRST = "0069_explorers_guide_day_items";
const databaseName = `music_c3_s3_${process.pid}`;
let admin: pg.Pool;
let pool: pg.Pool;
let accountId = "";
const seeded = {guide: "", section: "", titled: "", photo: "", places: "", products: "", people: "", books: ""};

const v1Place = (localId: string, name: string, photo?: string) => ({localId, placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4", name,
  formattedAddress: null, geometry: {location: {lat: 15.49, lng: 73.82}}, types: [], tips: null,
  photos: photo ? [{mediaId: photo, fileName: null, width: null, height: null, aspectRatio: null}] : [],
  priceLevel: null, priceRange: null, customBudget: null, budgetAmount: null, budgetCurrency: null, source: "google", verified: true});
const budget = (localId: string) => ({localId, placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4", name: localId, priceLevel: null, priceRange: null,
  customBudget: "500", budgetAmount: null, budgetCurrency: null});
async function collection(category: string, title: string, order: number) {
  return (await pool.query(`INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, category, title, `${category}-${order}-${process.pid}`, order])).rows[0].id as string;
}

describePostgres("S3 migrations 0069-0071", () => {
  beforeAll(async () => {
    const target = validateIntegrationDatabaseTarget(adminUrl);
    admin = new pg.Pool({connectionString: target.toString(), max: 2});
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    target.pathname = `/${databaseName}`;
    pool = new pg.Pool({connectionString: target.toString(), max: 4});
    const prior = loadMusicMigrations().filter((m) => m.id < FIRST);
    expect(prior.at(-1)?.id.startsWith("0068_")).toBe(true);
    await migrateMusicDatabase(pool, {migrations: prior, testOnlyExpectedIds: prior.map((m) => m.id)});

    accountId = (await pool.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id;
    seeded.guide = await collection("guides", "Goa in two days", 0);
    await pool.query(`INSERT INTO guide_collection_details(collection_id,account_id,number_of_days) VALUES($1,$2,7)`, [seeded.guide, accountId]);
    seeded.photo = (await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256)
      VALUES($1,'guide','ready','image/png',10,now(),decode(repeat('00',32),'hex')) RETURNING id`, [accountId])).rows[0].id;
    const v1 = {version: "guide-section-blocks/v1",
      timeline: {morning: [v1Place("m1", "Fort Aguada", seeded.photo), v1Place("m2", "Candolim")], afternoon: [], evening: [v1Place("e1", "Thalassa")]},
      transport: {segments: [{fromLocalId: "m1", toLocalId: "e1", mode: "taxi", distanceKm: 12, estimatedMinutes: 30}]},
      stay: {accommodations: []}, activities: {activities: []},
      budget: {morning: [budget("m1")], afternoon: [], evening: [budget("e1")]},
      mapDetails: null, packingList: {items: []}, preTasks: {items: []}, tags: []};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      seeded.section = (await client.query(`INSERT INTO guide_sections(collection_id,account_id,display_order,block_version,title,blocks)
        VALUES($1,$2,0,'guide-section-blocks/v1','Day 1',$3::jsonb) RETURNING id`, [seeded.guide, accountId, JSON.stringify(v1)])).rows[0].id;
      await client.query("INSERT INTO guide_section_photos(section_id,account_id,media_id) VALUES($1,$2,$3)", [seeded.section, accountId, seeded.photo]);
      const empty = {...v1, timeline: {morning: [], afternoon: [], evening: []}, transport: {segments: []}, budget: {morning: [], afternoon: [], evening: []}};
      seeded.titled = (await client.query(`INSERT INTO guide_sections(collection_id,account_id,display_order,block_version,title,blocks)
        VALUES($1,$2,1,'guide-section-blocks/v1','Old town walk',$3::jsonb) RETURNING id`, [seeded.guide, accountId, JSON.stringify(empty)])).rows[0].id;
      await client.query("COMMIT");
    } finally { client.release(); }

    seeded.places = await collection("places", "Goa", 1);
    seeded.products = await collection("products", "Beach kit", 2);
    seeded.people = await collection("people", "Goa guides", 3);
    seeded.books = await collection("books", "Goa reads", 4);
    // Two statements, so the links carry distinct created_at values: the backfill orders by
    // created_at and only falls back to the (random) child id on a tie.
    for (const [child, category] of [[seeded.products, "products"], [seeded.people, "people"]]) {
      await pool.query(`INSERT INTO collection_location_links(child_collection_id,account_id,child_category,location_collection_id)
        VALUES($1,$2,$3,$4)`, [child, accountId, category, seeded.places]);
    }

    const upgraded = await migrateMusicDatabase(pool);
    expect(upgraded.appliedIds).toEqual([FIRST, "0070_explorers_list_links", "0071_explorers_samples"]);
    expect((await verifyMusicDatabase(pool)).currentId).toBe(EXPECTED_MUSIC_MIGRATION_ID);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    if (!admin) return;
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [databaseName]);
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.end();
  });

  it("0069 turns morning/afternoon/evening picks into one labelled ordered list (GD-31)", async () => {
    const {sections} = await readGuideSectionPage(pool, seeded.guide, accountId);
    const day = sections[0].blocks;
    expect(guideSectionBlocksSchema.safeParse(day).success).toBe(true);
    expect(day.items.map((i) => [i.localId, i.timeLabel])).toEqual([["m1", "morning"], ["m2", "morning"], ["e1", "evening"]]);
    expect(day.budget.entries.map((e) => e.localId)).toEqual(["m1", "e1"]);
    expect(day.transport.segments).toHaveLength(1);
    expect(sections[0].title).toBe("");
    expect(sections[1].title).toBe("Old town walk");
    expect((await pool.query("SELECT media_id FROM guide_section_photos WHERE section_id=$1", [seeded.section])).rows).toEqual([{media_id: seeded.photo}]);
    expect((await pool.query("SELECT number_of_days FROM guide_collection_details WHERE collection_id=$1", [seeded.guide])).rows[0].number_of_days).toBe(2);
    await expect(pool.query("UPDATE guide_sections SET block_version='guide-section-blocks/v1' WHERE id=$1", [seeded.section])).rejects.toMatchObject({code: "23514"});
  });

  it("0070 copies every place link into the general model and keeps the old rows (LNK-09)", async () => {
    const cards = await readListLinksForCollection(pool, seeded.places, accountId);
    expect(cards.map((c) => [c.direction, c.collection.id, c.role])).toEqual([["outgoing", seeded.products, null], ["outgoing", seeded.people, null]]);
    expect((await pool.query("SELECT count(*)::int AS n FROM collection_location_links")).rows[0].n).toBe(2);
    const incoming = await readListLinksForCollection(pool, seeded.products, accountId);
    expect(incoming.map((c) => c.direction)).toEqual(["incoming"]);
  });

  it("0070 links any two own lists once, never itself, never the reverse pair", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const link = await insertListLink(client, {accountId, hostCollectionId: seeded.guide, linkedCollectionId: seeded.books, role: "Reading list"});
      expect(link.displayOrder).toBe(0);
      await expect(insertListLink(client, {accountId, hostCollectionId: seeded.books, linkedCollectionId: seeded.guide, role: null})).rejects.toMatchObject({status: 409});
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await expect(insertListLink(client, {accountId, hostCollectionId: seeded.books, linkedCollectionId: seeded.books, role: null})).rejects.toMatchObject({status: 422});
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      const other = (await client.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id;
      await expect(insertListLink(client, {accountId: other, hostCollectionId: seeded.books, linkedCollectionId: seeded.guide, role: null})).rejects.toMatchObject({status: 404});
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      const made = await insertListLink(client, {accountId, hostCollectionId: seeded.guide, linkedCollectionId: seeded.books, role: "Reading list"});
      const removed = await deleteListLink(client, accountId, made.id);
      expect(removed.role).toBe("Reading list");
      await client.query("COMMIT");
    } finally { client.release(); }
  });

  it("0071 refuses to publish a sample and seeds each key once (SMP-08)", async () => {
    const sample = await collection("movies", "Sample: feel-good films", 5);
    await pool.query("UPDATE collections SET is_sample=true WHERE id=$1", [sample]);
    await expect(pool.query("UPDATE collections SET visibility='public' WHERE id=$1", [sample])).rejects.toMatchObject({code: "23514"});
    await expect(pool.query("UPDATE collections SET publication_state='published' WHERE id=$1", [sample])).rejects.toMatchObject({code: "23514"});
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      expect(await recordSampleSeeded(client, {accountId, sampleKey: "movies/feel-good", category: "movies", fixtureSet: "india", fixtureVersion: "v1", collectionId: sample})).toBe(true);
      expect(await recordSampleSeeded(client, {accountId, sampleKey: "movies/feel-good", category: "movies", fixtureSet: "india", fixtureVersion: "v1", collectionId: sample})).toBe(false);
      await claimSample(client, accountId, sample);
      await client.query("COMMIT");
    } finally { client.release(); }
    expect((await readSampleReceipts(pool, accountId))[0].claimedAt).not.toBeNull();
    await pool.query("UPDATE collections SET visibility='public' WHERE id=$1", [sample]);
    await pool.query("DELETE FROM collections WHERE id=$1", [sample]);
    expect((await readSampleReceipts(pool, accountId))[0].collectionId).toBeNull();
  });
});
