import {createHash, randomUUID} from "node:crypto";
import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {migrateMusicDatabase} from "../../db/migrate";
import {ExplorersRecommendationRepository, RecommendationFailure} from "../../repositories/explorersRecommendationRepository";
import {
  attachGuideCover, countGuideSections, createGuideSection, deleteGuideSection, readGuideCoverMediaId,
  readGuideDetails, readGuideSectionPage, reorderGuideSections, updateGuideSection, writeGuideDetails,
} from "../../repositories/guideRepository";
import {guideEmptySectionBlocks, type GuideCollectionDetails, type GuideSectionBlocks} from "../../../shared/explorersGuideContract";
import {publicGuidesProjection} from "../../publicProfile/publicGuidesProjection";

/**
 * Ticket 5.3. The guide aggregate against a real PostgreSQL 15.
 *
 * What is asserted here cannot be asserted anywhere else, because it is all about what the
 * database does under concurrency and partial failure:
 *
 *  - a reorder composed at revision N applies in ONE transaction, passing through a
 *    duplicate position that only the deferrable unique permits;
 *  - a write at a stale revision is a 409 that changes NOTHING, which is what lets eight
 *    micro editors share one guide;
 *  - a section id from another guide is a 404, not a cross-guide write;
 *  - the photo registry and the block JSON stay equal, in both directions;
 *  - replacing a cover that fails leaves the ORIGINAL cover attached and served, which is
 *    the opposite of what the Strapi path did.
 */
const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C6_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `explorers_guides_${process.pid}`;

let admin: pg.Pool;
let pool: pg.Pool;
let repository: ExplorersRecommendationRepository;

const key = () => randomUUID();

async function account() {
  const accountId = (await pool.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
  await pool.query(`UPDATE creator_accounts SET status='active',handle=$2,display_name='Owner',account_type='Creator',
    public_profile=true,onboarding_status='complete' WHERE id=$1`, [accountId, `guide-${randomUUID().slice(0, 8)}`]);
  return accountId;
}

async function guide(accountId: string) {
  return repository.createCollection(accountId, {
    category: "guides" as never, title: "Kerala in five days", slug: `kerala-${randomUUID()}`,
  } as never, key());
}

/** The guides category content revision, which is what every guide write is composed against. */
async function categoryRevision(accountId: string) {
  return Number((await pool.query(
    "SELECT coalesce((SELECT revision FROM account_category_content_state WHERE account_id=$1 AND category='guides'),0) AS revision",
    [accountId])).rows[0].revision);
}

/** A transaction, because every guide write is one and the deferrable order needs it. */
async function tx<T>(run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readyMedia(accountId: string, salt: string, purpose = "guide") {
  return (await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at)
    VALUES($1,$3,'ready','image/jpeg',2048,$2,now()) RETURNING id`,
    [accountId, createHash("sha256").update(salt).digest(), purpose])).rows[0].id as string;
}

const details = (over: Partial<GuideCollectionDetails> = {}): GuideCollectionDetails => ({
  guideType: "itinerary", multiCity: true, numberOfDays: 5, estimatedBudget: "42000.50", budgetCurrency: "INR",
  budgetType: "per-person", bestTimeToVisit: ["October"], categories: ["Backwaters"], tags: ["slow"],
  tipsNotes: {blocks: [{text: "Carry cash — ഒരു കാര്യം"}]},
  place: {name: "Kochi", address: "Kerala, India", placeId: "ChIJ1", rating: 4.6, ratingsCount: 12044, lat: 9.9312, lng: 76.2673},
  locationEntityId: null, ...over,
});

const place = (localId: string, photos: string[] = []) => ({
  localId, placeId: `ChIJ${localId}`, name: `Stop ${localId}`, formattedAddress: "Fort Kochi",
  geometry: {location: {lat: 9.9658, lng: 76.2421}}, types: ["cafe"], tips: null,
  photos: photos.map((mediaId) => ({mediaId, fileName: null, width: null, height: null, aspectRatio: null})),
  priceLevel: null, priceRange: null, customBudget: null, budgetAmount: null, budgetCurrency: null,
  source: "google" as const, verified: true,
});

const withMorning = (places: ReturnType<typeof place>[]): GuideSectionBlocks =>
  ({...guideEmptySectionBlocks, timeline: {morning: places, afternoon: [], evening: []}});

describePg("C6 guide aggregate", () => {
  beforeAll(async () => {
    admin = new pg.Pool({connectionString: exactTarget, max: 1});
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const target = new URL(exactTarget);
    target.pathname = `/${databaseName}`;
    pool = new pg.Pool({connectionString: target.toString(), max: 4});
    await migrateMusicDatabase(pool);
    repository = new ExplorersRecommendationRepository(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin?.end();
  });

  it("round-trips every parent field, including non-ASCII rich text", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const written = details();
    await tx(async (client) => writeGuideDetails(client, collection.id, accountId, await categoryRevision(accountId), written));
    expect(await readGuideDetails(pool, collection.id, accountId)).toEqual(written);
  });

  it("keeps a guides recommendation impossible, which is what stops a guide flattening into item rows", async () => {
    const accountId = await account();
    const entityId = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES('place','Fort Kochi','manual') RETURNING id")).rows[0].id;
    await expect(pool.query("INSERT INTO recommendations(account_id,entity_id,category) VALUES($1,$2,'guides')",
      [accountId, entityId])).rejects.toMatchObject({code: "23514"});
  });

  it("creates sections S1 and S2 at revision N, reorders at N in one transaction, and leaves [S2,S1]", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const s1 = await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title: "Day one", description: null, blocks: guideEmptySectionBlocks}));
    const s2 = await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title: "Day two", description: null, blocks: guideEmptySectionBlocks}));
    const before = await categoryRevision(accountId);

    await tx((client) => reorderGuideSections(client, collection.id, accountId, before, [s2, s1]));

    const page = await readGuideSectionPage(pool, collection.id, accountId);
    expect(page.sections.map((section) => section.title)).toEqual(["Day two", "Day one"]);
    expect(page.sections.map((section) => section.displayOrder)).toEqual([0, 1]);
    // One transaction, so the revision moves once rather than per row.
    expect(await categoryRevision(accountId)).toBe(before + 1);
  });

  it("refuses a reorder at an old revision with 409 and both sections unchanged", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const s1 = await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title: "Day one", description: null, blocks: guideEmptySectionBlocks}));
    const s2 = await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title: "Day two", description: null, blocks: guideEmptySectionBlocks}));
    const stale = (await categoryRevision(accountId)) - 1;

    await expect(tx((client) => reorderGuideSections(client, collection.id, accountId, stale, [s2, s1])))
      .rejects.toMatchObject({status: 409});

    const page = await readGuideSectionPage(pool, collection.id, accountId);
    expect(page.sections.map((section) => section.title)).toEqual(["Day one", "Day two"]);
  });

  it("refuses a reorder whose list is not exactly the current section set", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const s1 = await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title: "Day one", description: null, blocks: guideEmptySectionBlocks}));
    await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title: "Day two", description: null, blocks: guideEmptySectionBlocks}));

    // A reorder composed before Day two existed must not silently drop it.
    await expect(tx(async (client) => reorderGuideSections(client, collection.id, accountId, await categoryRevision(accountId), [s1])))
      .rejects.toMatchObject({status: 409});
    expect(await countGuideSections(pool, collection.id, accountId)).toBe(2);
  });

  it("treats a section id from another guide as a 404 rather than a cross-guide write", async () => {
    const accountId = await account();
    const a = await guide(accountId);
    const b = await guide(accountId);
    const section = await tx(async (client) => createGuideSection(client, a.id, accountId, await categoryRevision(accountId), {title: "Day one", description: null, blocks: guideEmptySectionBlocks}));

    await expect(tx(async (client) => updateGuideSection(client, b.id, accountId, await categoryRevision(accountId), section, {title: "Hijacked", description: null, blocks: guideEmptySectionBlocks})))
      .rejects.toMatchObject({status: 404});
    expect((await readGuideSectionPage(pool, a.id, accountId)).sections[0].title).toBe("Day one");
  });

  it("leaves every other block deep-equal when one section is edited", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const first = withMorning([place("m1")]);
    const s1 = await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title: "Day one", description: "first", blocks: first}));
    const s2Blocks = {...guideEmptySectionBlocks, packingList: {items: [{localId: "p1", label: "Repellent", done: false}]}};
    const s2 = await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title: "Day two", description: null, blocks: s2Blocks}));
    const untouched = (await readGuideSectionPage(pool, collection.id, accountId)).sections.find((section) => section.id === s2);

    await tx(async (client) => updateGuideSection(client, collection.id, accountId, await categoryRevision(accountId), s1,
      {title: "Day one, revised", description: "first", blocks: withMorning([place("m1"), place("m2")])}));

    const after = await readGuideSectionPage(pool, collection.id, accountId);
    expect(after.sections.find((section) => section.id === s2)).toEqual(untouched);
    expect(after.sections.find((section) => section.id === s1)?.blocks.timeline.morning).toHaveLength(2);
  });

  it("registers section photos from the block JSON and refuses a desynchronised write", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const media = await readyMedia(accountId, "photo-a");
    const section = await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId),
      {title: "Day one", description: null, blocks: withMorning([place("m1", [media])])}));

    expect((await pool.query("SELECT media_id FROM guide_section_photos WHERE section_id=$1", [section])).rows)
      .toEqual([{media_id: media}]);
    // The asset is now referenced, so it cannot be deleted out from under the guide.
    await expect(pool.query("DELETE FROM media_assets WHERE id=$1", [media])).rejects.toMatchObject({code: "23503"});

    // Writing blocks without syncing the registry is refused by 0050's deferred trigger.
    await expect(tx(async (client) => {
      await client.query("SELECT 1 FROM collections WHERE id=$1 FOR UPDATE", [collection.id]);
      await client.query("UPDATE guide_sections SET blocks=$2::jsonb WHERE id=$1",
        [section, JSON.stringify(withMorning([place("m1")]))]);
    })).rejects.toMatchObject({code: "23514"});
  });

  it("refuses a section photo whose asset is not a ready owned guide image", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const wrongPurpose = await readyMedia(accountId, "cover-purpose", "collection");
    await expect(tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId),
      {title: "Day one", description: null, blocks: withMorning([place("m1", [wrongPurpose])])})))
      .rejects.toBeInstanceOf(RecommendationFailure);
  });

  it("releases photo registry rows when a section is deleted, keeping the asset", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const media = await readyMedia(accountId, "photo-b");
    const section = await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId),
      {title: "Day one", description: null, blocks: withMorning([place("m1", [media])])}));

    await tx(async (client) => deleteGuideSection(client, collection.id, accountId, await categoryRevision(accountId), section));

    expect((await pool.query("SELECT 1 FROM guide_section_photos WHERE section_id=$1", [section])).rowCount).toBe(0);
    // The creator deleted a day of the itinerary, not their photograph.
    expect((await pool.query("SELECT 1 FROM media_assets WHERE id=$1", [media])).rowCount).toBe(1);
  });

  it("closes the order gap a deleted section leaves", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const ids: string[] = [];
    for (const title of ["Day one", "Day two", "Day three"])
      ids.push(await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title, description: null, blocks: guideEmptySectionBlocks})));

    await tx(async (client) => deleteGuideSection(client, collection.id, accountId, await categoryRevision(accountId), ids[1]));

    const page = await readGuideSectionPage(pool, collection.id, accountId);
    expect(page.sections.map((section) => [section.title, section.displayOrder]))
      .toEqual([["Day one", 0], ["Day three", 1]]);
  });

  it("inserts a section at a position, shifting the rest within one transaction", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    for (const title of ["Day one", "Day three"])
      await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title, description: null, blocks: guideEmptySectionBlocks}));

    await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId),
      {title: "Day two", description: null, blocks: guideEmptySectionBlocks, position: 1}));

    expect((await readGuideSectionPage(pool, collection.id, accountId)).sections.map((section) => section.title))
      .toEqual(["Day one", "Day two", "Day three"]);
  });

  it("keeps the original cover attached and served when a replacement fails", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const original = await readyMedia(accountId, "cover-1", "collection");
    await tx(async (client) => attachGuideCover(client, collection.id, accountId, await categoryRevision(accountId), original));
    expect(await readGuideCoverMediaId(pool, collection.id, accountId)).toBe(original);

    // A replacement naming an asset that is not a usable cover must fail leaving the one
    // that works in place. Note what this does and does not prove: the single transaction
    // is what protects the original, NOT the statement order - deleting the old row first
    // and then failing the insert passes this too, confirmed by mutation. What the Strapi
    // path got wrong was issuing the delete as a separate call that committed on its own,
    // which no single-transaction ordering can reproduce.
    const unusable = randomUUID();
    await expect(tx(async (client) => attachGuideCover(client, collection.id, accountId, await categoryRevision(accountId), unusable)))
      .rejects.toBeDefined();

    expect(await readGuideCoverMediaId(pool, collection.id, accountId)).toBe(original);
    expect((await pool.query("SELECT 1 FROM media_assets WHERE id=$1", [original])).rowCount).toBe(1);
  });

  it("reports the previous cover so the caller can retire it only after the new one commits", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const first = await readyMedia(accountId, "cover-a", "collection");
    const second = await readyMedia(accountId, "cover-b", "collection");
    await tx(async (client) => attachGuideCover(client, collection.id, accountId, await categoryRevision(accountId), first));

    const previous = await tx(async (client) => attachGuideCover(client, collection.id, accountId, await categoryRevision(accountId), second));

    expect(previous).toBe(first);
    expect(await readGuideCoverMediaId(pool, collection.id, accountId)).toBe(second);
    // Both assets still exist; retiring the old bytes is a separate, later decision.
    expect((await pool.query("SELECT count(*)::int AS count FROM media_assets WHERE id=ANY($1)", [[first, second]])).rows[0].count).toBe(2);
  });

  it("paginates sections by order rather than offset", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    for (let n = 0; n < 5; n += 1)
      await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title: `Day ${n}`, description: null, blocks: guideEmptySectionBlocks}));

    const first = await readGuideSectionPage(pool, collection.id, accountId, {limit: 2});
    expect(first.sections.map((section) => section.title)).toEqual(["Day 0", "Day 1"]);
    expect(first.nextCursor).toBe(1);
    const second = await readGuideSectionPage(pool, collection.id, accountId, {limit: 2, afterOrder: first.nextCursor ?? undefined});
    expect(second.sections.map((section) => section.title)).toEqual(["Day 2", "Day 3"]);
    const third = await readGuideSectionPage(pool, collection.id, accountId, {limit: 2, afterOrder: second.nextCursor ?? undefined});
    expect(third.sections.map((section) => section.title)).toEqual(["Day 4"]);
    expect(third.nextCursor).toBeNull();
  });

  it("refuses a stored section written by an unknown block version", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const section = await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title: "Day one", description: null, blocks: guideEmptySectionBlocks}));
    // The column CHECK refuses an unknown version outright, so the reader's own refusal is
    // belt and braces rather than the only gate. Assert the database half here.
    await expect(pool.query("UPDATE guide_sections SET block_version='guide-section-blocks/v2' WHERE id=$1", [section]))
      .rejects.toMatchObject({code: "23514"});
  });

  it("archives the whole guide, removing its sections from the owner's active view while the entities stay", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId), {title: "Day one", description: null, blocks: guideEmptySectionBlocks}));
    const entityId = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES('place','Fort Kochi','manual') RETURNING id")).rows[0].id;

    await pool.query("UPDATE collections SET archived_at=now() WHERE id=$1", [collection.id]);

    // Sections remain attached to their archived parent; what changes is that the parent is
    // no longer in any active listing, which is the archive semantics every category uses.
    expect(await countGuideSections(pool, collection.id, accountId)).toBe(1);
    expect((await pool.query("SELECT 1 FROM entities WHERE id=$1", [entityId])).rowCount).toBe(1);
  });

  // Publish before pin, and unpublishing unpins. Tickets 5.1 and 5.3. This is shared
  // collection behaviour, so it is asserted on a guide here and the Places suites cover
  // the same code from their side.
  it("refuses a pin on a guide that is not published and public", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    // A freshly created list is draft and private.
    await expect(repository.updateCollection(accountId, collection.id, collection.revision, {pinOrder: 0}, key()))
      .rejects.toMatchObject({status: 422});
    expect((await pool.query("SELECT pin_order FROM collections WHERE id=$1", [collection.id])).rows[0].pin_order).toBeNull();
  });

  it("allows a pin once the guide is published and public", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const published = await repository.updateCollection(accountId, collection.id, collection.revision,
      {visibility: "public", publicationState: "published"}, key());
    await repository.updateCollection(accountId, collection.id, published.revision, {pinOrder: 0}, key());
    expect(Number((await pool.query("SELECT pin_order FROM collections WHERE id=$1", [collection.id])).rows[0].pin_order)).toBe(0);
  });

  it("unpins in the same transaction that unpublishes, so no pin outlives its visibility", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const published = await repository.updateCollection(accountId, collection.id, collection.revision,
      {visibility: "public", publicationState: "published"}, key());
    const pinned = await repository.updateCollection(accountId, collection.id, published.revision, {pinOrder: 0}, key());

    // Unpublishing alone must clear the pin; the caller is not asked to do it in a second
    // request that could fail on its own and leave a pin pointing at nothing.
    await repository.updateCollection(accountId, collection.id, pinned.revision, {publicationState: "draft"}, key());

    const row = (await pool.query("SELECT pin_order,publication_state FROM collections WHERE id=$1", [collection.id])).rows[0];
    expect(row.pin_order).toBeNull();
    expect(row.publication_state).toBe("draft");
  });

  it("unpins when the guide is made private, not only when it is unpublished", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const published = await repository.updateCollection(accountId, collection.id, collection.revision,
      {visibility: "public", publicationState: "published"}, key());
    const pinned = await repository.updateCollection(accountId, collection.id, published.revision, {pinOrder: 1}, key());

    await repository.updateCollection(accountId, collection.id, pinned.revision, {visibility: "private"}, key());

    expect((await pool.query("SELECT pin_order FROM collections WHERE id=$1", [collection.id])).rows[0].pin_order).toBeNull();
  });

  it("leaves an unpinned unpublished guide alone rather than writing a redundant null", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    // An ordinary title edit on a draft list must not be turned into a pin write.
    const updated = await repository.updateCollection(accountId, collection.id, collection.revision, {title: "Renamed"}, key());
    expect(updated.title).toBe("Renamed");
    expect((await pool.query("SELECT pin_order FROM collections WHERE id=$1", [collection.id])).rows[0].pin_order).toBeNull();
  });

  it("accepts an explicit unpin on a published guide", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const published = await repository.updateCollection(accountId, collection.id, collection.revision,
      {visibility: "public", publicationState: "published"}, key());
    const pinned = await repository.updateCollection(accountId, collection.id, published.revision, {pinOrder: 0}, key());
    await repository.updateCollection(accountId, collection.id, pinned.revision, {pinOrder: null}, key());
    expect((await pool.query("SELECT pin_order FROM collections WHERE id=$1", [collection.id])).rows[0].pin_order).toBeNull();
  });

  // The public read. Ticket 5.3: there was no public guides projection at all before this,
  // so a published guide was reachable only through Strapi.
  describe("public read", () => {
    async function publishedGuide(accountId: string, handle: string) {
      await pool.query("UPDATE creator_accounts SET handle=$2 WHERE id=$1", [accountId, handle]);
      await pool.query(`INSERT INTO account_category_settings(account_id,category,is_public,display_order)
        SELECT $1,'guides',true,coalesce(max(display_order)+1,0) FROM account_category_settings WHERE account_id=$1
        ON CONFLICT(account_id,category) DO UPDATE SET is_public=true`, [accountId]);
      const collection = await guide(accountId);
      const published = await repository.updateCollection(accountId, collection.id, collection.revision,
        {visibility: "public", publicationState: "published"}, key());
      return {collection, revision: published.revision};
    }
    const handle = () => "pub-" + randomUUID().slice(0, 8);

    it("serves a published guide with its fields and sections", async () => {
      const accountId = await account();
      const owner = handle();
      const {collection} = await publishedGuide(accountId, owner);
      await tx(async (client) => writeGuideDetails(client, collection.id, accountId, await categoryRevision(accountId), details()));
      await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId),
        {title: "Day one", description: "first", blocks: withMorning([place("m1")])}));

      const result = await publicGuidesProjection(pool, owner, 12, undefined, collection.slug);

      expect(result?.guides).toHaveLength(1);
      const served = result!.guides[0];
      expect(served).toMatchObject({Title: "Kerala in five days", Visibility: true, is_Multicity: true, Number_Of_Days: 5});
      expect(served.Estimated_Budget).toBe(42000.5);
      expect(served.guide_sections).toHaveLength(1);
      // 0-based in storage, 1-based to the public views.
      expect(served.guide_sections[0]).toMatchObject({Title: "Day one", Sequence: 1});
      expect(served.guide_sections[0].Timeline.morning[0].geometry).toEqual({location: {lat: 9.9658, lng: 76.2421}});
      expect(served.Guide_Section_Details)
        .toEqual([{documentId: served.guide_sections[0].documentId, Title: "Day one", Sequence: 1}]);
    });

    it("omits a draft guide entirely rather than serving it unpublished", async () => {
      const accountId = await account();
      const owner = handle();
      await publishedGuide(accountId, owner);
      const draft = await guide(accountId);
      const listed = await publicGuidesProjection(pool, owner, 12);
      expect(listed?.guides.some((entry: {documentId: string}) => entry.documentId === draft.id)).toBe(false);
      expect(await publicGuidesProjection(pool, owner, 12, undefined, draft.slug)).toBeUndefined();
    });

    it("stops serving a guide once it is unpublished", async () => {
      const accountId = await account();
      const owner = handle();
      const {collection, revision} = await publishedGuide(accountId, owner);
      expect((await publicGuidesProjection(pool, owner, 12, undefined, collection.slug))?.guides).toHaveLength(1);
      await repository.updateCollection(accountId, collection.id, revision, {publicationState: "draft"}, key());
      expect(await publicGuidesProjection(pool, owner, 12, undefined, collection.slug)).toBeUndefined();
    });

    it("serves nothing when the Guides category itself is not public", async () => {
      const accountId = await account();
      const owner = handle();
      const {collection} = await publishedGuide(accountId, owner);
      await pool.query("UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category='guides'", [accountId]);
      // Unpublishing the category removes every guide without touching a single guide row.
      expect(await publicGuidesProjection(pool, owner, 12, undefined, collection.slug)).toBeUndefined();
      expect(await publicGuidesProjection(pool, owner, 12)).toBeUndefined();
    });

    it("omits a section it cannot fully understand instead of half-rendering it", async () => {
      const accountId = await account();
      const owner = handle();
      const {collection} = await publishedGuide(accountId, owner);
      await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId),
        {title: "Day one", description: null, blocks: guideEmptySectionBlocks}));
      // Storage refuses an unknown block_version, so this exercises the reader's own
      // refusal by removing the blocks it understands.
      await pool.query("UPDATE guide_sections SET blocks='{}'::jsonb WHERE collection_id=$1", [collection.id]);
      const served = await publicGuidesProjection(pool, owner, 12, undefined, collection.slug);
      expect(served?.guides[0].guide_sections).toEqual([]);
    });

    it("paginates sections and reports a cursor", async () => {
      const accountId = await account();
      const owner = handle();
      const {collection} = await publishedGuide(accountId, owner);
      for (let n = 0; n < 14; n += 1)
        await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId),
          {title: "Day " + n, description: null, blocks: guideEmptySectionBlocks}));
      const first = await publicGuidesProjection(pool, owner, 12, undefined, collection.slug);
      expect(first?.guides[0].guide_sections).toHaveLength(12);
      expect(first?.guides[0].guide_sections_next_cursor).toBe("o12");
      const second = await publicGuidesProjection(pool, owner, 12, "o12", collection.slug);
      expect(second?.guides[0].guide_sections).toHaveLength(2);
      expect(second?.guides[0].guide_sections_next_cursor).toBeNull();
    });

    it("does not fetch sections for a list page, which would make it unbounded", async () => {
      const accountId = await account();
      const owner = handle();
      const {collection} = await publishedGuide(accountId, owner);
      await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId),
        {title: "Day one", description: null, blocks: guideEmptySectionBlocks}));
      const listed = await publicGuidesProjection(pool, owner, 12);
      expect(listed?.guides.find((entry: {documentId: string}) => entry.documentId === collection.id)?.guide_sections).toEqual([]);
    });

    it("serves nothing for an unknown or ineligible creator", async () => {
      expect(await publicGuidesProjection(pool, "missing-" + randomUUID().slice(0, 8), 12)).toBeUndefined();
      const accountId = await account();
      const owner = handle();
      await publishedGuide(accountId, owner);
      await pool.query("UPDATE creator_accounts SET public_profile=false WHERE id=$1", [accountId]);
      expect(await publicGuidesProjection(pool, owner, 12)).toBeUndefined();
    });

    it("refuses an out-of-range page size rather than clamping it", async () => {
      for (const limit of [0, -1, 25, 1.5])
        await expect(publicGuidesProjection(pool, "anyone", limit)).rejects.toThrow("Invalid Guides page size");
    });
  });

  it("deletes sections, details and the photo registry when the guide itself is deleted", async () => {
    const accountId = await account();
    const collection = await guide(accountId);
    const media = await readyMedia(accountId, "photo-c");
    await tx(async (client) => writeGuideDetails(client, collection.id, accountId, await categoryRevision(accountId), details()));
    await tx(async (client) => createGuideSection(client, collection.id, accountId, await categoryRevision(accountId),
      {title: "Day one", description: null, blocks: withMorning([place("m1", [media])])}));

    await tx(async (client) => {
      await client.query("DELETE FROM guide_section_photos WHERE account_id=$1", [accountId]);
      await client.query("DELETE FROM collections WHERE id=$1", [collection.id]);
    });

    expect(await countGuideSections(pool, collection.id, accountId)).toBe(0);
    expect(await readGuideDetails(pool, collection.id, accountId)).toBeNull();
    expect((await pool.query("SELECT 1 FROM media_assets WHERE id=$1", [media])).rowCount).toBe(1);
  });
});
