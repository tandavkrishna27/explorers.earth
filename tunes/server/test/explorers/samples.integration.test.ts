import {randomUUID} from "node:crypto";
import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {migrateMusicDatabase} from "../../db/migrate";
import {ExplorersRecommendationRepository, SAMPLE_PUBLISH_REFUSED_CODE} from "../../repositories/explorersRecommendationRepository";
import {RecommendationService} from "../../application/recommendations";
import {OwnerContentService} from "../../application/ownerContent";
import {PublicContentService} from "../../application/publicContent";
import type {Actor} from "../../application/actor";
import {SAMPLE_PUBLISH_REFUSAL} from "../../../shared/explorersSampleContract";
import {createCollectionSchema} from "../../../shared/explorersContract";
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
const SECRET = "samples-integration-secret";
/** An owner actor via an oauth credential, so no auth_session row is needed. */
async function ownerOf(accountId: string): Promise<Actor> {
  const userId = `u-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email,email_verified) VALUES($1,'Owner',$2,true)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO user_security_state(user_id) VALUES($1)", [userId]);
  await pool.query("INSERT INTO account_memberships(account_id,user_id,role) VALUES($1,$2,'owner')", [accountId, userId]);
  return {userId, accountId, role: "owner", credential: {kind: "oauth", grantId: randomUUID(),
    scopes: ["collections:read", "collections:write", "recommendations:read", "recommendations:write"]}} as Actor;
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

  describe("publish refusal on every path (SMP-03)", () => {
    let accountId: string;
    const refused = expect.objectContaining({status: 422, message: SAMPLE_PUBLISH_REFUSAL, code: SAMPLE_PUBLISH_REFUSED_CODE});
    const sampleIn = async (category: string) => {
      const row = (await samples(accountId)).find((r) => r.category === category)!;
      return {id: row.id as string, revision: Number(row.revision)};
    };
    beforeAll(async () => { accountId = await account(); await seeder.seedForAccount(accountId, "India"); }, 120_000);

    it.each(["places", "movies", "books", "games", "apps", "products", "people", "guides"])("%s list: visibility public is refused", async (category) => {
      const s = await sampleIn(category);
      await expect(repository.updateCollection(accountId, s.id, s.revision, {visibility: "public"}, key())).rejects.toEqual(refused);
      await expect(repository.updateCollection(accountId, s.id, s.revision, {publicationState: "published"}, key())).rejects.toEqual(refused);
      await expect(repository.updateCollection(accountId, s.id, s.revision, {visibility: "public", publicationState: "published", pinOrder: 0}, key())).rejects.toEqual(refused);
      expect((await sampleIn(category)).revision).toBe(s.revision);
    });

    it("the HTTP service answers the same 422 with the machine-readable code", async () => {
      const s = await sampleIn("movies");
      const actor = await ownerOf(accountId);
      await expect(new RecommendationService(pool).updateCollection(actor, s.id, {expectedRevision: s.revision, visibility: "public"}, {requestId: key(), idempotencyKey: key()}))
        .rejects.toEqual(refused);
    });

    it("a sample can still be renamed and reordered while it stays a draft (SMP-02)", async () => {
      const s = await sampleIn("movies");
      const renamed = await repository.updateCollection(accountId, s.id, s.revision, {title: "Renamed sample"}, key());
      expect(renamed).toMatchObject({title: "Renamed sample", isSample: true, visibility: "private", publicationState: "draft"});
    });

    it("an item in a sample list cannot be published", async () => {
      const item = (await pool.query(`SELECT r.id,r.revision::text AS revision FROM recommendations r JOIN collection_items ci ON ci.recommendation_id=r.id
        JOIN collections c ON c.id=ci.collection_id WHERE c.account_id=$1 AND c.is_sample AND c.category='books' LIMIT 1`, [accountId])).rows[0];
      await expect(repository.updateRecommendation(accountId, item.id, Number(item.revision), {publicationState: "published"}, key())).rejects.toEqual(refused);
    });

    it("an item cannot be created published into a sample list", async () => {
      const entity = await repository.resolveManualEntity(accountId, {category: "movies", details: {title: "Extra"}}, key());
      await expect(repository.createRecommendation(accountId, {category: "movies", entityId: entity.id, collectionId: (await sampleIn("movies")).id,
        expectedCollectionRevision: (await sampleIn("movies")).revision, publicationState: "published"}, key())).rejects.toEqual(refused);
    });

    it("the HTTP create schema cannot set isSample", async () => {
      expect(createCollectionSchema.safeParse({category: "movies", title: "x", isSample: true}).success).toBe(false);
    });

    it("the database refuses a sample list or item published by any other route (S3 CHECKs)", async () => {
      const s = await sampleIn("people");
      await expect(pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1", [s.id]))
        .rejects.toMatchObject({code: "23514", constraint: "collections_sample_never_public"});
      await expect(pool.query("UPDATE recommendations SET publication_state='published' WHERE account_id=$1 AND is_sample", [accountId]))
        .rejects.toMatchObject({code: "23514", constraint: "recommendations_sample_never_published"});
    });
  });

  describe("Make it mine (SMP-04)", () => {
    const service = () => new RecommendationService(pool);
    const ctx = (idempotencyKey = key()) => ({requestId: key(), idempotencyKey});

    it("clears the flag in place: same id, same items in the same order, still a private draft, now publishable", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "France");
      const s = (await samples(accountId)).find((r) => r.category === "books")!;
      const itemsBefore = (await pool.query("SELECT recommendation_id FROM collection_items WHERE collection_id=$1 ORDER BY display_order", [s.id])).rows;
      const mine = await repository.makeCollectionMine(accountId, s.id, Number(s.revision), key());
      expect(mine).toMatchObject({id: s.id, isSample: false, visibility: "private", publicationState: "draft", revision: Number(s.revision) + 1});
      expect((await pool.query("SELECT recommendation_id FROM collection_items WHERE collection_id=$1 ORDER BY display_order", [s.id])).rows).toEqual(itemsBefore);
      // S3 claimSample: items lose the flag too, and the permanent receipt is marked claimed.
      expect((await pool.query("SELECT count(*)::int AS n FROM recommendations r JOIN collection_items ci ON ci.recommendation_id=r.id WHERE ci.collection_id=$1 AND r.is_sample", [s.id])).rows[0].n).toBe(0);
      const receipt = (await readSampleReceipts(pool, accountId)).find((r) => r.collectionId === s.id)!;
      expect(receipt.claimedAt).not.toBeNull();
      expect(await seeder.seedForAccount(accountId, "France")).toBe("already-seeded");
      const published = await repository.updateCollection(accountId, s.id, mine.revision, {visibility: "public", publicationState: "published"}, key());
      expect(published.publicationState).toBe("published");
    }, 120_000);

    it("is refused on a list that is not a sample, and on a stale revision", async () => {
      const accountId = await account();
      const own = await repository.createCollection(accountId, {category: "movies", title: "Mine", slug: "mine"}, key());
      // S3's claimSample answers 404 for a list that is not a sample of this account.
      await expect(repository.makeCollectionMine(accountId, own.id, own.revision, key())).rejects.toMatchObject({status: 404});
      await seeder.seedForAccount(accountId, "India");
      const s = (await samples(accountId))[0]!;
      await expect(repository.makeCollectionMine(accountId, s.id, Number(s.revision) + 5, key())).rejects.toMatchObject({status: 409});
    }, 120_000);

    it("is idempotent through the route's service: same key replays, a fresh key on a claimed list is 404 at the current revision", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "India");
      const actor = await ownerOf(accountId);
      const s = (await samples(accountId)).find((r) => r.category === "apps")!;
      const sameKey = key();
      const first = await service().makeCollectionMine(actor, s.id, {expectedRevision: Number(s.revision)}, ctx(sameKey));
      const replay = await service().makeCollectionMine(actor, s.id, {expectedRevision: Number(s.revision)}, ctx(sameKey));
      expect(replay).toEqual(first);
      expect(first).toMatchObject({id: s.id, isSample: false, revision: Number(s.revision) + 1});
      // Fresh key at the current revision: the list is no longer a sample, so S3's claimSample answers 404.
      await expect(service().makeCollectionMine(actor, s.id, {expectedRevision: first.revision}, ctx())).rejects.toMatchObject({status: 404});
      expect((await pool.query("SELECT is_sample,revision::int AS revision FROM collections WHERE id=$1", [s.id])).rows[0]).toEqual({is_sample: false, revision: first.revision});
    }, 120_000);

    it("a stale tab (old revision, fresh key) after a claim is 409, and the list stays claimed", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "India");
      const actor = await ownerOf(accountId);
      const s = (await samples(accountId)).find((r) => r.category === "games")!;
      await service().makeCollectionMine(actor, s.id, {expectedRevision: Number(s.revision)}, ctx());
      await expect(service().makeCollectionMine(actor, s.id, {expectedRevision: Number(s.revision)}, ctx())).rejects.toMatchObject({status: 409});
      expect((await pool.query("SELECT is_sample FROM collections WHERE id=$1", [s.id])).rows[0].is_sample).toBe(false);
      expect((await readSampleReceipts(pool, accountId)).find((r) => r.collectionId === s.id)!.claimedAt).not.toBeNull();
    }, 120_000);

    it("two concurrent claims leave exactly one claimed list and no copy", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "India");
      const actor = await ownerOf(accountId);
      const listsBefore = (await pool.query("SELECT count(*)::int AS n FROM collections WHERE account_id=$1", [accountId])).rows[0].n;
      const s = (await samples(accountId)).find((r) => r.category === "products")!;
      const results = await Promise.allSettled([1, 2].map(() => service().makeCollectionMine(actor, s.id, {expectedRevision: Number(s.revision)}, ctx())));
      expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
      const loser = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(loser.reason).toMatchObject({status: 409});
      expect((await pool.query("SELECT count(*)::int AS n FROM collections WHERE account_id=$1", [accountId])).rows[0].n).toBe(listsBefore);
      expect((await pool.query("SELECT is_sample,revision::int AS revision FROM collections WHERE id=$1", [s.id])).rows[0]).toEqual({is_sample: false, revision: Number(s.revision) + 1});
    }, 120_000);
  });

  describe("owner and public reads", () => {
    it("owner list reads carry isSample; All Recommendations excludes items only samples hold (SMP-01)", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "India");
      const owner = new OwnerContentService(pool, SECRET);
      const actor = await ownerOf(accountId);
      const lists = await owner.listCollections(actor, {category: "movies"});
      expect(lists.items.length).toBeGreaterThanOrEqual(2);
      expect(lists.items.every((l) => l.isSample)).toBe(true);
      expect((await owner.listRecommendations(actor, {category: "movies"})).items).toEqual([]);
      // Inside the sample list its items are still listed (the list page reads by collection).
      const inList = await owner.listRecommendations(actor, {category: "movies", collectionId: lists.items[0]!.id});
      expect(inList.items.length).toBeGreaterThan(0);
      const picks = await owner.listTopPicks(actor, {category: "movies"});
      expect(picks.items.length).toBeGreaterThan(0);
      expect(picks.items.every((p) => p.isSample === true)).toBe(true);
    }, 120_000);

    it("after Make it mine nothing reports the list as a sample, the receipt is claimed and a re-seed adds nothing", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "India");
      const owner = new OwnerContentService(pool, SECRET);
      const actor = await ownerOf(accountId);
      const sampleCount = async () => (await owner.listCollections(actor, {category: "movies"})).items.filter((l) => l.isSample).length;
      const before = await sampleCount();
      const pinned = (await owner.listTopPicks(actor, {category: "movies"})).items[0]!;
      const listId = pinned.collectionId;
      const revision = Number((await pool.query("SELECT revision FROM collections WHERE id=$1", [listId])).rows[0].revision);
      await new RecommendationService(pool).makeCollectionMine(actor, listId, {expectedRevision: revision}, {requestId: key(), idempotencyKey: key()});
      expect(await sampleCount()).toBe(before - 1);
      expect((await owner.getCollection(actor, listId)).isSample).toBe(false);
      expect((await owner.getCollection(actor, listId, {}, true)).isSample).toBe(false);
      const picks = (await owner.listTopPicks(actor, {category: "movies"})).items.filter((p) => p.collectionId === listId);
      expect(picks.length).toBeGreaterThan(0);
      expect(picks.every((p) => p.isSample === false)).toBe(true);
      // Its items now count in All Recommendations.
      expect((await owner.listRecommendations(actor, {category: "movies"})).items.length).toBe((await pool.query("SELECT count(*)::int AS n FROM collection_items WHERE collection_id=$1", [listId])).rows[0].n);
      expect((await readSampleReceipts(pool, accountId)).find((r) => r.collectionId === listId)!.claimedAt).not.toBeNull();
      const lists = (await pool.query("SELECT count(*)::int AS n FROM collections WHERE account_id=$1", [accountId])).rows[0].n;
      expect(await seeder.seedForAccount(accountId, "India")).toBe("already-seeded");
      expect((await pool.query("SELECT count(*)::int AS n FROM collections WHERE account_id=$1", [accountId])).rows[0].n).toBe(lists);
    }, 120_000);

    it("deleting the last sample in a category through the DELETE route's method leaves no lists, no sample picks, and nothing re-seeds", async () => {
      const accountId = await account();
      await seeder.seedForAccount(accountId, "India");
      const owner = new OwnerContentService(pool, SECRET);
      const actor = await ownerOf(accountId);
      const recommendations = new RecommendationService(pool);
      for (const row of (await samples(accountId)).filter((r) => r.category === "books"))
        await recommendations.archiveCollection(actor, row.id, {expectedRevision: Number(row.revision)}, {requestId: key(), idempotencyKey: key()});
      expect((await owner.listCollections(actor, {category: "books"})).items).toEqual([]);
      expect((await owner.listTopPicks(actor, {category: "books"})).items).toEqual([]);
      expect(await seeder.seedForAccount(accountId, "India")).toBe("already-seeded");
      expect((await owner.listCollections(actor, {category: "books"})).items).toEqual([]);
    }, 120_000);

    it("samples never reach a public endpoint, and a converted list does (positive control)", async () => {
      const accountId = await account();
      await pool.query("UPDATE creator_accounts SET public_profile=true WHERE id=$1", [accountId]);
      for (const [index, category] of ["places", "guides", "movies", "books", "games", "apps", "products", "people"].entries())
        await pool.query(`INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,$2,true,$3)
          ON CONFLICT(account_id,category) DO UPDATE SET is_public=true`, [accountId, category, index]);
      await seeder.seedForAccount(accountId, "France");
      const handle = (await pool.query("SELECT handle FROM creator_accounts WHERE id=$1", [accountId])).rows[0].handle;
      const publicContent = new PublicContentService(pool, SECRET);
      for (const category of ["places", "movies", "books", "games", "apps", "products", "people", "guides"]) {
        const page = await publicContent.page({username: handle, category});
        expect(page?.items ?? [], category).toEqual([]);
      }
      const s = (await samples(accountId)).find((r) => r.category === "movies")!;
      const mine = await repository.makeCollectionMine(accountId, s.id, Number(s.revision), key());
      await repository.updateCollection(accountId, s.id, mine.revision, {visibility: "public", publicationState: "published"}, key());
      const after = await publicContent.page({username: handle, category: "movies"});
      expect(after?.items.map((l) => (l as {id: string}).id)).toEqual([s.id]);
    }, 120_000);
  });
});
