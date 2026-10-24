import type { Pool, PoolClient } from "pg";
import { ExplorersRecommendationRepository } from "../repositories/explorersRecommendationRepository";
import { readSampleReceipts, recordSampleSeeded } from "../repositories/sampleRepository";
import { createGuideSection, writeGuideDetails } from "../repositories/guideRepository";
import { sampleCountryToFixtureSet, type SampleFixtureSet, type SampleKey } from "../../shared/explorersSampleContract";
import { GUIDE_SECTION_BLOCK_VERSION, guideCollectionDetailsSchema, guideEmptySectionBlocks, guideSectionBlocksSchema } from "../../shared/explorersGuideContract";
import { richNoteFromEditor } from "../../shared/explorersRichNoteContract";
import { normalizeRichNote } from "./richNote";
import { loadSampleSet, SAMPLE_FIXTURE_VERSION, SAMPLE_LIST_CATEGORIES, sampleKeyFor, toGuideDayItem, type SampleListCategory } from "./sampleFixtures";

// Onboarding country is free text. S3's sampleCountryToFixtureSet already knows IN/IND/INDIA/BHARAT;
// WP11 only folds the remaining India names ("Republic of India", Devanagari) into 'IN'.
const INDIA = new Set(["india", "in", "ind", "bharat", "भारत", "republic of india"]);
export function normalizeSampleCountry(country: string | null | undefined): string | null {
  const value = (country ?? "").trim();
  if (!value) return null;
  return INDIA.has(value.toLowerCase()) ? "IN" : value;
}
export function fixtureSetForCountry(country: string | null | undefined): SampleFixtureSet {
  return sampleCountryToFixtureSet(normalizeSampleCountry(country));
}
type Address = { country?: string } | null | undefined;
export function countryFromAccount(account: { additionalAddresses?: Address[] | null; primaryAddress?: Address }): string | null {
  for (const address of [...(account.additionalAddresses ?? []), account.primaryAddress]) {
    const country = address?.country?.trim();
    if (country) return country;
  }
  return null;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const slugify = (title: string) => title.toLowerCase().normalize("NFKD").replace(/[^\p{Letter}\p{Number}]+/gu, "-")
  .replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "") || "sample";
type TopPickListCategory = "books" | "movies" | "games" | "apps" | "products" | "people";
const topPickCategories = new Set<SampleListCategory>(["movies", "books", "games", "apps", "products", "people"]);
type FixtureItem = { note: string; rating: number; details: Record<string, unknown> & { title: string }; googlePlaceId?: string | null };

/** Every sample key a fixture set produces (lists + the guide). */
export function sampleKeysForSet(set: SampleFixtureSet): SampleKey[] {
  const sample = loadSampleSet(set);
  return [...SAMPLE_LIST_CATEGORIES.flatMap((c) => sample.lists[c].lists.map((l) => sampleKeyFor(c, l.key))), sampleKeyFor("guides", sample.guide.guide.key)];
}

/**
 * SMP-08 on S3/0071. Seeding is per sample key ('<category>/<slug>'). A key with a row in
 * sample_seeding_receipts is NEVER seeded again (kept, made mine, or deleted - SMP-05). A key
 * without one is created through repository commands with deterministic idempotency keys, then
 * S3's recordSampleSeeded writes the permanent receipt. A crash between the two replays the same
 * commands (same ids, nothing duplicated) and records the receipt on the next run.
 */
export class SampleSeeder {
  constructor(private readonly db: Pool, private readonly repository = new ExplorersRecommendationRepository(db)) {}

  async seedForAccount(accountId: string, country: string | null): Promise<"seeded" | "already-seeded"> {
    const receipts = await readSampleReceipts(this.db, accountId);
    // A resumed seed keeps the fixture set it first chose, even if the country changed since.
    const fixtureSet: SampleFixtureSet = receipts[0]?.fixtureSet ?? fixtureSetForCountry(country);
    const done = new Set<string>(receipts.map((r) => r.sampleKey));
    if (sampleKeysForSet(fixtureSet).every((k) => done.has(k))) return "already-seeded";
    const sample = loadSampleSet(fixtureSet);
    // Deterministic per account (the command receipts are scoped by account), so a replay hits the same receipt.
    const key = (...parts: Array<string | number>) => ["sample", SAMPLE_FIXTURE_VERSION, ...parts].join("-").replace(/\//g, "-");
    let seededAny = false;

    for (const category of SAMPLE_LIST_CATEGORIES) {
      const pins: Array<{ recommendationId: string; collectionId: string }> = [];
      for (const list of sample.lists[category].lists) {
        const sampleKey = sampleKeyFor(category, list.key);
        if (done.has(sampleKey)) continue;
        const created = await this.repository.createCollection(accountId, { category, title: list.title, slug: slugify(list.title),
          description: list.description, visibility: "private", publicationState: "draft", isSample: true }, key(sampleKey));
        // Each create bumps the list revision by exactly one, so the expected revision is derived, not
        // re-read: a replay then sends byte-identical commands and hits the stored receipts.
        let revision = created.revision;
        for (const [index, item] of (list.items as FixtureItem[]).entries()) {
          const entityId = await this.resolve(accountId, category, item, key(sampleKey, index, "entity"));
          const recommendation = await this.repository.createRecommendation(accountId, { category, entityId, collectionId: created.id,
            expectedCollectionRevision: revision, userRating: category === "people" ? null : item.rating, publicationState: "draft", isSample: true,
            note: normalizeRichNote(richNoteFromEditor(`<p>${escapeHtml(item.note)}</p>`)) }, key(sampleKey, index));
          revision += 1;
          if (list.topPicks && pins.length < 5) pins.push({ recommendationId: recommendation.id, collectionId: created.id });
        }
        seededAny = (await this.recordReceipt(accountId, sampleKey, category, fixtureSet, created.id)) || seededAny;
      }
      if (pins.length && topPickCategories.has(category)) await this.pin(accountId, category as TopPickListCategory, pins, key(category, "top-picks"));
    }
    const guideKey = sampleKeyFor("guides", sample.guide.guide.key);
    if (!done.has(guideKey)) {
      const guideId = await this.seedGuide(accountId, sample.guide.guide, key(guideKey));
      seededAny = (await this.recordReceipt(accountId, guideKey, "guides", fixtureSet, guideId)) || seededAny;
    }
    return seededAny ? "seeded" : "already-seeded";
  }

  /**
   * S3's recordSampleSeeded: false = a concurrent seeder recorded this key first. Deterministic
   * idempotency keys mean both seeders created the SAME list, so normally there is nothing to undo;
   * if the recorded receipt points at a different list, archive ours (S3: "caller must roll back").
   */
  private async recordReceipt(accountId: string, sampleKey: SampleKey, category: SampleListCategory | "guides", fixtureSet: SampleFixtureSet, collectionId: string): Promise<boolean> {
    const client = await this.db.connect();
    let recorded: boolean;
    try {
      await client.query("BEGIN");
      recorded = await recordSampleSeeded(client, { accountId, sampleKey, category, fixtureSet, fixtureVersion: SAMPLE_FIXTURE_VERSION, collectionId });
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    if (!recorded) {
      const winner = (await readSampleReceipts(this.db, accountId)).find((r) => r.sampleKey === sampleKey);
      if (winner && winner.collectionId !== collectionId) {
        const revision = await this.collectionRevision(collectionId);
        await this.repository.archiveCollection(accountId, collectionId, revision, `sample-${SAMPLE_FIXTURE_VERSION}-${sampleKey.replace("/", "-")}-rollback`);
      }
    }
    return recorded;
  }

  private async collectionRevision(id: string): Promise<number> {
    return Number((await this.db.query("SELECT revision::text AS revision FROM collections WHERE id=$1", [id])).rows[0].revision);
  }

  private async resolve(accountId: string, category: SampleListCategory, item: FixtureItem, entityKey: string): Promise<string> {
    const noProvider = async (): Promise<never> => { throw new Error("Sample fixtures never resolve through a provider"); };
    switch (category) {
      case "places": return this.resolvePlace(accountId, item, entityKey);
      case "movies": return (await this.repository.resolveMovieEntity(accountId, { kind: "manual", category, details: item.details }, entityKey, noProvider)).id;
      case "books": return (await this.repository.resolveBookEntity(accountId, { kind: "manual", category, details: item.details }, entityKey, noProvider)).id;
      case "games": return (await this.repository.resolveGameEntity(accountId, { details: item.details }, entityKey)).id;
      case "apps": return (await this.repository.resolveAppEntity(accountId, { kind: "manual", category, details: item.details }, entityKey)).id;
      case "products": return (await this.repository.resolveProductEntity(accountId, { kind: "manual", category, details: item.details }, entityKey)).id;
      case "people": return (await this.repository.resolvePersonEntity(accountId, { kind: "manual", category, details: item.details }, entityKey)).id;
    }
  }

  /** A Google-resolved place is one shared entity for every account (SMP-08: stored ids, no runtime cost). */
  private async resolvePlace(accountId: string, item: FixtureItem, entityKey: string): Promise<string> {
    if (!item.googlePlaceId) return (await this.repository.resolvePlaceEntity(accountId, { kind: "manual", category: "places", details: item.details }, entityKey)).id;
    const entity = await this.repository.resolveProviderEntity({ kind: "place", title: item.details.title, provider: "google_places", externalKind: "place", externalId: item.googlePlaceId });
    await this.db.query(`INSERT INTO place_entity_details(entity_id,formatted_address,latitude,longitude)
      VALUES($1,$2,$3,$4) ON CONFLICT(entity_id) DO NOTHING`,
      [entity.id, item.details.formattedAddress ?? null, item.details.latitude ?? null, item.details.longitude ?? null]);
    return entity.id;
  }

  /**
   * Seeds Top Picks only into a category the owner has never pinned (no pin state yet), so a
   * sample never overrides the owner's own picks and a replay after a committed pin is a no-op.
   */
  private async pin(accountId: string, category: TopPickListCategory, orderedPins: Array<{ recommendationId: string; collectionId: string }>, pinKey: string) {
    const state = await this.db.query<{ category_revision: string; pin_revision: string | null }>(`SELECT
      coalesce((SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category=$2),'0') AS category_revision,
      (SELECT revision::text FROM account_category_pin_state WHERE account_id=$1 AND category=$2) AS pin_revision`, [accountId, category]);
    const row = state.rows[0]!;
    if (row.pin_revision !== null) return;
    await this.repository.writeCategoryTopPicks(accountId, category, { expectedCategoryRevision: row.category_revision,
      expectedPinRevision: null, orderedPins }, pinKey, true);
  }

  /**
   * SMP-10 on S3/0069: one guide_sections row per day (display_order = day index,
   * block_version 'guide-section-blocks/v2'), blocks.items = the day's ordered v2 items.
   * Idempotent on replay: sections are written only while the guide has none.
   */
  private async seedGuide(accountId: string, guide: ReturnType<typeof loadSampleSet>["guide"]["guide"], collectionKey: string): Promise<string> {
    const created = await this.repository.createCollection(accountId, { category: "guides", title: guide.title, slug: slugify(guide.title),
      description: guide.description, visibility: "private", publicationState: "draft", isSample: true }, collectionKey);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      // Serialise a concurrent seeder on the guide row before looking, so the loser sees the
      // winner's committed sections and skips instead of failing the revision check.
      await client.query("SELECT 1 FROM collections WHERE id=$1 AND account_id=$2 FOR UPDATE", [created.id, accountId]);
      const existing = await client.query("SELECT 1 FROM guide_sections WHERE collection_id=$1 LIMIT 1", [created.id]);
      if (!existing.rows[0]) {
        await writeGuideDetails(client, created.id, accountId, await this.categoryRevision(client, accountId, "guides"), guideCollectionDetailsSchema.parse({
          guideType: guide.guideType, multiCity: false, numberOfDays: guide.numberOfDays, estimatedBudget: null, budgetCurrency: null,
          budgetType: null, budgetTier: null, startDate: null, bestTimeToVisit: [], categories: [], tags: [], tipsNotes: null, place: {}, locationEntityId: null }));
        for (const day of [...guide.days].sort((a, b) => a.day - b.day)) {
          const blocks = guideSectionBlocksSchema.parse({ ...guideEmptySectionBlocks, items: day.items.map(toGuideDayItem), budget: { entries: [] } });
          await createGuideSection(client, created.id, accountId, await this.categoryRevision(client, accountId, "guides"), { title: "", description: null, blocks });
        }
        const versions = await client.query("SELECT DISTINCT block_version FROM guide_sections WHERE collection_id=$1", [created.id]);
        if (versions.rows.some((r) => r.block_version !== GUIDE_SECTION_BLOCK_VERSION)) throw new Error("sample guide written with a non-v2 block version");
      }
      await client.query("COMMIT");
      return created.id;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  private async categoryRevision(db: Pick<PoolClient, "query">, accountId: string, category: string): Promise<number> {
    return Number((await db.query("SELECT coalesce((SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category=$2),'0') AS r", [accountId, category])).rows[0].r);
  }
}
