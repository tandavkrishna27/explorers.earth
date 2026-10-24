import type { BrowserContext, Route } from '@playwright/test';
import { canonicalAccountFixture } from '../../src/test/canonicalAccountFixture';
import * as contract from '../../../tunes/shared/explorersOwnerContentContract';
import { emptyMovieDetails } from '../../../tunes/shared/explorersMovieContract';
import { emptyPlaceContext, emptyPlaceDetails } from '../../../tunes/shared/explorersPlaceContract';
import { guideAggregateDtoSchema, guideEmptySectionBlocks } from '../../../tunes/shared/explorersGuideContract';

/**
 * WP11 screenshot dataset (opt-in). Layered on the category-navigation fixture: these routes are
 * registered after installContainedRoutes, so Playwright tries them first and everything they do
 * not own falls back to the unchanged fixture. They serve Movies and Places owner reads holding
 * first-visit SAMPLE lists (isSample:true) with items and sample Top Picks pins, plus the sample
 * commands (make-it-mine, purge). Screens only - no assertions about the server live here.
 */
type Category = 'movies' | 'places' | 'guides';
type Item = { id: string; title: string; year?: string; director?: string; address?: string; lat?: number; lng?: number };
/** A guide's days: each day is a list of note texts (the sample guide carries no saved list items). */
type SampleList = { id: string; category: Category; title: string; slug: string; isSample: boolean; revision: number; items: Item[]; days?: string[][] };

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const account = () => canonicalAccountFixture().id;

export function sampleDataset() {
  const movie = (n: number, title: string, year: string, director: string): Item => ({ id: uuid(1000 + n), title, year, director });
  const place = (n: number, title: string, address: string, lat: number, lng: number): Item => ({ id: uuid(2000 + n), title, address, lat, lng });
  const lists: SampleList[] = [
    { id: uuid(101), category: 'movies', title: 'Indian films everyone should see', slug: 'sample-indian-films', isSample: true, revision: 1, items: [
      movie(1, 'Pather Panchali', '1955', 'Satyajit Ray'), movie(2, 'Sholay', '1975', 'Ramesh Sippy'),
      movie(3, 'Lagaan', '2001', 'Ashutosh Gowariker'), movie(4, 'Kumbalangi Nights', '2019', 'Madhu C. Narayanan')] },
    { id: uuid(102), category: 'movies', title: 'Comfort rewatches', slug: 'sample-comfort-rewatches', isSample: true, revision: 1, items: [
      movie(5, 'Zindagi Na Milegi Dobara', '2011', 'Zoya Akhtar'), movie(6, 'Dil Chahta Hai', '2001', 'Farhan Akhtar'),
      movie(7, 'Queen', '2013', 'Vikas Bahl')] },
    { id: uuid(201), category: 'places', title: 'A weekend in Bengaluru', slug: 'sample-weekend-bengaluru', isSample: true, revision: 1, items: [
      place(1, 'Cubbon Park', 'Kasturba Road, Bengaluru', 12.9763, 77.5929), place(2, 'Vidyarthi Bhavan', 'Gandhi Bazaar, Basavanagudi, Bengaluru', 12.9452, 77.5713),
      place(3, 'Lalbagh Botanical Garden', 'Mavalli, Bengaluru', 12.9507, 77.5848), place(4, 'Church Street', 'Shanthala Nagar, Bengaluru', 12.9752, 77.6046)] },
    { id: uuid(301), category: 'guides', title: '3 days in Goa', slug: 'sample-3-days-in-goa', isSample: true, revision: 1, items: [], days: [
      ['Fort Aguada at sunrise', 'Lunch at a beach shack in Candolim', 'Sunset at Chapora Fort'],
      ['Walk the Latin Quarter, Fontainhas', 'Basilica of Bom Jesus, Old Goa', 'Dinner in Panaji'],
      ['Spice plantation in Ponda', 'Palolem beach in the evening']] },
  ];
  // Sample Top Picks pins, one per sample list, in this order. Guides pins only public lists, so none.
  const pins = new Map<Category, string[]>([['movies', [uuid(1001), uuid(1005)]], ['places', [uuid(2001)]], ['guides', []]]);
  return { lists, pins, writes: [] as { method: string; path: string }[], errors: [] as string[] };
}
export type SampleDataset = ReturnType<typeof sampleDataset>;

export async function installSampleRoutes(context: BrowserContext, origin: string, data: SampleDataset) {
  let revision = 1;
  // One expiry for every page: the client rejects a page whose expiresAt differs from its snapshot.
  const expiresAt = Date.now() + 3_600_000;
  const snapshotToken = (category: Category) => `${category}-wp11-${revision}`;
  const base = '/api/explorers/v1';
  const of = (category: Category) => data.lists.filter(list => list.category === category);
  const collectionDto = (list: SampleList) => ({
    id: list.id, accountId: account(), category: list.category, title: list.title, slug: list.slug,
    visibility: 'private' as const, publicationState: 'draft' as const, revision: list.revision,
    description: null, heading: null, coverMediaId: null, isSample: list.isSample, archived: false,
    displayOrder: of(list.category).indexOf(list),
  });
  const pinOf = (category: Category, itemId: string) => {
    const position = (data.pins.get(category) ?? []).indexOf(itemId);
    const list = of(category).find(candidate => candidate.items.some(item => item.id === itemId));
    return position < 0 || !list ? null : { collectionId: list.id, position, revision: 1 };
  };
  const recommendation = (list: SampleList, item: Item) => ({
    id: item.id, accountId: account(), category: list.category, entityId: uuid(Number(item.id.slice(-12)) + 5000),
    userRating: null, publicationState: 'draft' as const, revision: 1, mediaIds: [], archived: false, pin: pinOf(list.category, item.id),
  });
  const editableRecommendation = (list: SampleList, item: Item) => {
    const core = recommendation(list, item);
    const common = { ...core, categoryRevision: String(revision), note: null, displayOverrides: {}, displayTitle: item.title };
    if (list.category === 'movies') return contract.editableOwnerRecommendationSchema.parse({ ...common,
      entity: { id: core.entityId, kind: 'movie', title: item.title },
      effectiveMovieDetails: { ...emptyMovieDetails(), yearText: item.year ?? null, director: item.director ?? null } });
    const facts = { ...emptyPlaceDetails(), formattedAddress: item.address ?? null, latitude: item.lat ?? null, longitude: item.lng ?? null };
    return contract.editableOwnerRecommendationSchema.parse({ ...common,
      entity: { id: core.entityId, kind: 'place', title: item.title, origin: 'manual', providerPlaceId: null, details: facts },
      effectivePlaceDetails: facts, placeContext: emptyPlaceContext(), placePhotos: { photoMediaIds: [] },
      placesTaxonomy: { catalogState: 'UNCONFIGURED', catalogVersion: 0, defaultLocale: null, category: null, subcategory: null, selectionUnavailable: false } });
  };
  const page = (category: Category, items: unknown[], extra: Record<string, unknown> = {}) => ({
    version: 'explorers-owner-content/v2', snapshot: String(revision), snapshotToken: snapshotToken(category),
    expiresAt, items, nextCursor: null, ...extra,
  });
  // The sample guide's aggregate: one guide-section-blocks/v2 day per entry, each a list of notes.
  const guideAggregate = (list: SampleList) => guideAggregateDtoSchema.parse({ collectionId: list.id, revision, coverMediaId: null,
    details: { guideType: null, multiCity: false, numberOfDays: list.days?.length ?? 0, estimatedBudget: null, budgetCurrency: null, budgetType: null,
      budgetTier: null, startDate: null, bestTimeToVisit: [], categories: [], tags: [], tipsNotes: null, place: { name: 'Goa', address: 'Goa, India', placeId: null, rating: null, ratingsCount: null, lat: 15.2993, lng: 74.124 }, locationEntityId: null },
    sections: (list.days ?? []).map((notes, displayOrder) => ({ id: uuid(3100 + displayOrder), collectionId: list.id, title: '', description: null, displayOrder,
      blocks: { ...guideEmptySectionBlocks, items: notes.map((text, n) => ({ kind: 'note', localId: `d${displayOrder}-n${n}`, timeLabel: null, text })) },
      archived: false, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() })),
    sectionCount: list.days?.length ?? 0, nextCursor: null });
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await context.route(url => url.origin === origin && url.pathname.startsWith(base + '/'), async route => {
    try { await handle(route); } catch (error) { data.errors.push(`${route.request().method()} ${new URL(route.request().url()).pathname}: ${String(error)}`); await route.fulfill(json({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'WP11 sample fixture failed', requestId: 'wp11-samples' } }, 503)); }
  });
  async function handle(route: Route) {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname.slice(base.length);
    const method = request.method();
    const findList = (id: string) => data.lists.find(list => list.id === id);
    const findItem = (id: string) => data.lists.flatMap(list => list.items.map(item => ({ list, item }))).find(entry => entry.item.id === id);

    const command = /^\/collections\/([0-9a-f-]{36})\/(make-it-mine|purge)$/.exec(path);
    if (command && method === 'POST') {
      const list = findList(command[1]); if (!list) return route.fallback();
      data.writes.push({ method, path }); revision++;
      if (command[2] === 'purge') {
        data.lists = data.lists.filter(candidate => candidate !== list);
        for (const [category, ids] of data.pins) data.pins.set(category, ids.filter(id => !list.items.some(item => item.id === id)));
        return route.fulfill(json({ collection: { id: list.id, deleted: true } }));
      }
      list.isSample = false; list.revision++;
      // The collection core DTO: the owner DTO without its owner-only fields (archived, displayOrder).
      const core = Object.fromEntries(Object.entries(collectionDto(list)).filter(([field]) => field !== 'archived' && field !== 'displayOrder'));
      return route.fulfill(json({ collection: core }));
    }
    if (method !== 'GET') return route.fallback();
    const guideRead = /^\/collections\/([0-9a-f-]{36})\/guide$/.exec(path);
    if (guideRead) {
      const list = findList(guideRead[1]); if (!list || list.category !== 'guides') return route.fallback();
      return route.fulfill(json({ guide: guideAggregate(list) }));
    }
    const editableCollection = /^\/collections\/([0-9a-f-]{36})\/editable$/.exec(path);
    if (editableCollection) {
      const list = findList(editableCollection[1]); if (!list) return route.fallback();
      return route.fulfill(json({ collection: contract.editableOwnerCollectionSchema.parse({ ...collectionDto(list), categoryRevision: String(revision), pinOrder: null, linkedLists: [],
        ...(list.category === 'places' ? { placeLocation: { locationEntityId: null, locationSnapshot: null, instagramMediaUrl: null } } : {}) }) }));
    }
    const editableItem = /^\/recommendations\/([0-9a-f-]{36})\/editable$/.exec(path);
    if (editableItem) {
      const entry = findItem(editableItem[1]); if (!entry) return route.fallback();
      return route.fulfill(json({ recommendation: editableRecommendation(entry.list, entry.item) }));
    }
    const categoryPath = /^\/categories\/(movies|places|guides)\/(content-snapshot|content-snapshot\/validate|memberships|top-picks)$/.exec(path);
    const queryCategory = ['/collections', '/recommendations'].includes(path) ? url.searchParams.get('category') : null;
    const category = (categoryPath?.[1] ?? queryCategory) as Category | null;
    if (category !== 'movies' && category !== 'places' && category !== 'guides') return route.fallback();
    const stream = categoryPath?.[2] ?? path.slice(1);
    if (stream.startsWith('content-snapshot')) return route.fulfill(json(contract.ownerSnapshotSchema.parse({
      version: 'explorers-owner-content/v2', snapshotToken: snapshotToken(category), revision: String(revision), expiresAt, pinRevision: 1 })));
    const lists = of(category);
    const archivedOnly = url.searchParams.get('status') === 'archived';
    if (stream === 'collections') return route.fulfill(json(contract.ownerCollectionPageSchema.parse(page(category, archivedOnly ? [] : lists.map(collectionDto)))));
    if (stream === 'recommendations') {
      const scoped = url.searchParams.get('collectionId');
      const items = archivedOnly ? [] : lists.filter(list => !scoped || list.id === scoped).flatMap(list => list.items.map(item => recommendation(list, item)));
      return route.fulfill(json(contract.ownerRecommendationPageSchema.parse(page(category, items))));
    }
    if (stream === 'memberships') {
      const archivedRead = url.searchParams.get('collectionStatus') === 'archived' || url.searchParams.get('recommendationStatus') === 'archived';
      const items = archivedRead ? [] : lists.flatMap(list => list.items.map((item, displayOrder) => ({ recommendationId: item.id, collectionId: list.id,
        collectionRevision: list.revision, displayOrder, collectionArchived: false, recommendationArchived: false,
        ...(category === 'places' ? { placePinPosition: null } : {}) })));
      return route.fulfill(json(contract.ownerMembershipPageSchema.parse(page(category, items))));
    }
    const pins = (data.pins.get(category) ?? []).map(id => ({ id, list: lists.find(list => list.items.some(item => item.id === id)) }))
      .filter((pin): pin is { id: string; list: SampleList } => Boolean(pin.list))
      .map((pin, position) => ({ recommendationId: pin.id, collectionId: pin.list.id, position }));
    return route.fulfill(json(contract.ownerTopPickPageSchema.parse(page(category, pins, { pinRevision: 1 }))));
  }
}
