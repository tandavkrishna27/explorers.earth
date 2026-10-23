import {randomUUID} from "node:crypto";
import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {migrateMusicDatabase} from "../../db/migrate";
import {ExplorersRecommendationRepository} from "../../repositories/explorersRecommendationRepository";
import {SampleSeeder, sampleKeysForSet} from "../../application/sampleSeeding";
import {loadSampleSet, SAMPLE_LIST_CATEGORIES} from "../../application/sampleFixtures";
import {readSampleReceipts} from "../../repositories/sampleRepository";

/**
 * WP11 (SMP-01..10). Seeding, publish refusal on every path, public exclusion and Make it
 * mine, end to end through the repository against a real PostgreSQL 15.
 */
const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C6_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `explorers_samples_${process.pid}`;

let admin: pg.Pool;
let pool: pg.Pool;
let repository: ExplorersRecommendationRepository;
let seeder: SampleSeeder;
const key = () => randomUUID();

async function account(): Promise<string> {
  const id = (await pool.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
  // handle_key is generated from handle; onboarding 'complete' needs a display name and type.
  await pool.query("UPDATE creator_accounts SET status='active',onboarding_status='complete',handle=$2,display_name='Sample owner',account_type='Creator' WHERE id=$1", [id, `s${id.slice(0, 8)}`]);
  return id;
}
const samples = async (accountId: string) => (await pool.query(
  "SELECT id,category,title,visibility,publication_state,revision::text AS revision FROM collections WHERE account_id=$1 AND is_sample AND archived_at IS NULL ORDER BY category,display_order",
  [accountId])).rows;

describePg("first-visit samples", () => {
  beforeAll(async () => {
    admin = new pg.Pool({connectionString: exactTarget, max: 1});
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const url = new URL(exactTarget); url.pathname = `/${databaseName}`;
    pool = new pg.Pool({connectionString: url.toString(), max: 4});
    await migrateMusicDatabase(pool);
    repository = new ExplorersRecommendationRepository(pool);
    seeder = new SampleSeeder(pool, repository);
  }, 300_000);
  afterAll(async () => {
    await pool?.end();
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`); await admin.end(); }
  }, 120_000);

  describe("seeding (SMP-01, SMP-07, SMP-10)", () => {
    for (const [country, set] of [["India", "india"], ["France", "global"]] as const) {
      it(`a ${country} account gets the ${set} set: 2-3 draft private lists per category and one guide`, async () => {
        const accountId = await account();
        expect(await seeder.seedForAccount(accountId, country)).toBe("seeded");
        const rows = await samples(accountId);
        const fixture = loadSampleSet(set);
        for (const category of SAMPLE_LIST_CATEGORIES)
          expect(rows.filter((r) => r.category === category).map((r) => r.title)).toEqual(fixture.lists[category].lists.map((l) => l.title));
        expect(rows.filter((r) => r.category === "guides").map((r) => r.title)).toEqual([fixture.guide.guide.title]);
        expect(rows.every((r) => r.visibility === "private" && r.publication_state === "draft")).toBe(true);
        const items = await pool.query("SELECT count(*)::int AS n FROM recommendations WHERE account_id=$1 AND publication_state='draft' AND is_sample", [accountId]);
        expect(items.rows[0].n).toBe(SAMPLE_LIST_CATEGORIES.reduce((n, c) => n + fixture.lists[c].lists.reduce((m, l) => m + l.items.length, 0), 0));
        const pins = await pool.query("SELECT DISTINCT category FROM category_recommendation_pins WHERE account_id=$1 ORDER BY category", [accountId]);
        expect(pins.rows.map((r) => r.category)).toEqual(["apps", "books", "games", "movies", "people", "products"]);
        // One permanent S3 receipt per sample key, pointing at the list it created.
        const receipts = await readSampleReceipts(pool, accountId);
        expect(receipts.length).toBe(sampleKeysForSet(set).length);
        expect(new Set(receipts.map((r) => r.sampleKey))).toEqual(new Set(sampleKeysForSet(set)));
        expect(receipts.every((r) => r.fixtureSet === set && r.fixtureVersion === "v1" && r.collectionId !== null && r.claimedAt === null)).toBe(true);
        expect(new Set(receipts.map((r) => r.collectionId))).toEqual(new Set(rows.map((r) => r.id)));
        // The guide is v2: one guide_sections row per day, items in fixture order.
        const guideId = rows.find((r) => r.category === "guides")!.id;
        const sections = (await pool.query("SELECT display_order,block_version,blocks FROM guide_sections WHERE collection_id=$1 ORDER BY display_order", [guideId])).rows;
        expect(sections.map((s) => s.block_version)).toEqual(fixture.guide.guide.days.map(() => "guide-section-blocks/v2"));
        expect(sections.map((s) => s.blocks.items.map((i: {localId: string}) => i.localId))).toEqual(fixture.guide.guide.days.map((d) => d.items.map((i) => i.localId)));
      }, 120_000);
    }

    it("is idempotent: a second call and a concurrent call add nothing", async () => {
      const accountId = await account();
      const [a, b] = await Promise.all([seeder.seedForAccount(accountId, "India"), seeder.seedForAccount(accountId, "India")]);
      expect([a, b].filter((r) => r === "seeded").length).toBeGreaterThanOrEqual(1);
      const first = (await samples(accountId)).length;
      expect(await seeder.seedForAccount(accountId, "India")).toBe("already-seeded");
      expect((await samples(accountId)).length).toBe(first);
    }, 120_000);

    it("resumes a crash before a receipt by replay without duplicating", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "France");
      const before = (await samples(accountId)).length;
      // Simulate a crash after the list was written but before recordSampleSeeded. The test pool is
      // music_migrator; music_runtime has no DELETE on receipts, so the app itself can never do this.
      await pool.query("DELETE FROM sample_seeding_receipts WHERE account_id=$1 AND sample_key IN ('movies/gl-movies-animated','guides/gl-guide-48-hours-paris')", [accountId]);
      expect(await seeder.seedForAccount(accountId, "France")).toBe("seeded");
      expect((await samples(accountId)).length).toBe(before);
      expect((await readSampleReceipts(pool, accountId)).length).toBe(sampleKeysForSet("global").length);
    }, 120_000);

    it("a resumed seed keeps the fixture set of its first receipt", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "India");
      expect(await seeder.seedForAccount(accountId, "France")).toBe("already-seeded");
      expect(new Set((await readSampleReceipts(pool, accountId)).map((r) => r.fixtureSet))).toEqual(new Set(["india"]));
    }, 120_000);

    it("deleted samples never come back: the receipt is permanent (SMP-05, SMP-06)", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "India");
      const receiptCount = (await readSampleReceipts(pool, accountId)).length;
      for (const row of await samples(accountId)) await repository.archiveCollection(accountId, row.id, Number(row.revision), key());
      expect(await samples(accountId)).toEqual([]);
      expect(await seeder.seedForAccount(accountId, "India")).toBe("already-seeded");
      expect(await samples(accountId)).toEqual([]);
      // Receipts survive the delete (collection_id becomes NULL only on a hard delete).
      expect((await readSampleReceipts(pool, accountId)).length).toBe(receiptCount);
    }, 120_000);

    it("a permanently deleted (purged) sample never comes back either; its receipt loses the list id", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "India");
      const s = (await samples(accountId)).find((r) => r.category === "books")!;
      await repository.purgeCollection(accountId, s.id, Number(s.revision), key());
      expect(await seeder.seedForAccount(accountId, "India")).toBe("already-seeded");
      expect((await samples(accountId)).some((r) => r.category === "books" && r.title === s.title)).toBe(false);
      const receipt = (await readSampleReceipts(pool, accountId)).find((r) => r.sampleKey === "books/in-books-indian-fiction")!;
      expect(receipt.collectionId).toBeNull();
    }, 120_000);

    it("creating a real list does not remove samples (SMP-06)", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "India");
      const before = (await samples(accountId)).length;
      await repository.createCollection(accountId, {category: "movies", title: "My own", slug: "my-own"}, key());
      expect((await samples(accountId)).length).toBe(before);
    }, 120_000);
  });
});
