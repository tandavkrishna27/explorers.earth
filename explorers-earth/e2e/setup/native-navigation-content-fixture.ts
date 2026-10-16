import { canonicalAccountFixture } from '../../src/test/canonicalAccountFixture';
import { bookFixtureId } from './books-owner-content';
import * as contract from '../../../tunes/shared/explorersOwnerContentContract';
import { guideAggregateDtoSchema } from '../../../tunes/shared/explorersGuideContract';

/** Contained collection fixtures only; nonempty recommendations require their own qualified adapter. */
export function createNativeNavigationContentFixture(category: 'movies' | 'games' | 'apps' | 'products' | 'people' | 'places' | 'guides', lists: () => Record<string, any>[], legacyAccountId: string) {
  let signature = '', revision = 0;
  const snapshots = new Map<string, { revision: string; expiresAt: number }>();
  return (url: URL): { status: number; body: unknown } | undefined => {
    const base = '/api/explorers/v1';
    if (!url.pathname.startsWith(base + '/')) return;
    const path = url.pathname.slice(base.length);
    // Ticket 5.1/5.2. The editable list read carries the fields only that read has: the
    // category revision, the list's own pin, and - for a location list - its location and
    // what is linked to it. Absent where the question does not apply, which the contract
    // enforces, so a missing field here shows up as an empty page rather than a parse error.
    const editable = /^\/collections\/([0-9a-fA-F-]{36})\/editable$/.exec(path);
    if (editable) {
      const source = lists();
      const owned = source.map((list, displayOrder) => ({ list, displayOrder }))
        .find(entry => bookFixtureId('collection', entry.list.documentId) === editable[1]);
      if (!owned) return;
      return { status: 200, body: { collection: contract.editableOwnerCollectionSchema.parse({
        id: editable[1], accountId: canonicalAccountFixture().id, category,
        title: owned.list.List_Name, slug: owned.list.slug,
        visibility: owned.list.visibility ? 'public' : 'private',
        publicationState: owned.list.canonicalPublicationState ?? (owned.list.Visibility ? 'published' : 'draft'),
        revision: owned.list.canonicalRevision ?? 1, description: null, heading: null, coverMediaId: null,
        archived: owned.list.archived === true, displayOrder: owned.displayOrder,
        categoryRevision: String(revision), pinOrder: null,
        ...(category === 'places'
          ? { placeLocation: { locationEntityId: null, locationSnapshot: null, instagramMediaUrl: null }, linkedChildren: [] }
          : {}),
        ...(category === 'products' || category === 'people' ? { locationLink: null } : {}),
      }) } };
    }
    // Ticket 5.3. The guide aggregate read, which only Guides has: the Guides surfaces fetch
    // a guide's details and its ordered sections by collection id. Served as an empty guide -
    // the same default the service returns when a collection has no details row yet - because
    // this lane exercises navigation and pinning, not guide content.
    const guideAggregate = category === 'guides'
      ? /^\/collections\/([0-9a-fA-F-]{36})\/guide$/.exec(path) : null;
    if (guideAggregate) {
      const owned = lists().find(list => bookFixtureId('collection', list.documentId) === guideAggregate[1]);
      if (!owned) return;
      return { status: 200, body: { guide: guideAggregateDtoSchema.parse({
        collectionId: guideAggregate[1], revision: revision + 1,
        details: { guideType: null, multiCity: false, numberOfDays: null, estimatedBudget: null,
          budgetCurrency: null, budgetType: null, bestTimeToVisit: [], categories: [], tags: [],
          tipsNotes: null, locationEntityId: null,
          place: { name: null, address: null, placeId: null, rating: null, ratingsCount: null, lat: null, lng: null } },
        coverMediaId: null, sections: [], sectionCount: 0, nextCursor: null,
      }) } };
    }
    const snapshot = path === `/categories/${category}/content-snapshot`;
    const validate = path === `/categories/${category}/content-snapshot/validate`;
    const stream = path === '/collections' && url.searchParams.get('category') === category ? 'collections'
      : path === '/recommendations' && url.searchParams.get('category') === category ? 'recommendations'
      : path === `/categories/${category}/memberships` ? 'memberships'
      : path === `/categories/${category}/top-picks` ? 'pins' : undefined;
    if (!snapshot && !validate && !stream) return;
    const fail = (code: string, status: number) => ({ status, body: { error: { code, message: 'Contained native content read rejected', requestId: 'navigation-native' } } });
    if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) return fail('INVALID_INPUT', 422);
    const params = Object.fromEntries(url.searchParams);
    const schema = snapshot ? contract.ownerSnapshotRequestSchema : validate ? contract.ownerSnapshotValidationRequestSchema
      : stream === 'collections' ? contract.ownerCollectionsRequestSchema : stream === 'recommendations' ? contract.ownerRecommendationsRequestSchema
      : stream === 'memberships' ? contract.ownerMembershipsRequestSchema : contract.ownerTopPicksRequestSchema;
    const parsed = schema.safeParse(stream === 'collections' || stream === 'recommendations' ? params : { category, ...params });
    if (!parsed.success || parsed.data.category !== category) return fail('INVALID_INPUT', 422);
    const source = lists();
    if (source.some(list => list.account?.documentId !== legacyAccountId)) return fail('FORBIDDEN', 403);
    // Guides' children are sections, not recommendations of an entity, so its relation key
    // differs from every other category's - the same distinction the canonical schema makes.
    const relation = category === 'movies' ? 'recommended_movies' : category === 'games' ? 'recommended_games' : category === 'apps' ? 'recommended_apps' : category === 'products' ? 'recommended_products' : category === 'places' ? 'recommended_places' : category === 'guides' ? 'guide_sections' : 'recommended_people';
    if (source.some(list => !Array.isArray(list[relation]) || list[relation].length !== 0)) return fail('PROVIDER_UNAVAILABLE', 503);
    const next = JSON.stringify(source);
    if (next !== signature) { signature = next; revision++; }
    const collections = source.map((list, displayOrder) => contract.ownerCollectionDtoSchema.parse({
      id: bookFixtureId('collection', list.documentId), accountId: canonicalAccountFixture().id, category,
      title: list.List_Name, slug: list.slug, visibility: list.visibility ? 'public' : 'private',
      publicationState: list.canonicalPublicationState ?? (list.Visibility ? 'published' : 'draft'),
      revision: list.canonicalRevision ?? 1, description: null, heading: null, coverMediaId: null,
      archived: list.archived === true, displayOrder,
    }));
    let snapshotToken = params.snapshotToken;
    if (!snapshotToken && (snapshot || stream && !params.cursor)) {
      snapshotToken = `${category}-fixture-${revision}-${snapshots.size}`;
      snapshots.set(snapshotToken, { revision: String(revision), expiresAt: Date.now() + 60000 });
    }
    const observed = snapshotToken && snapshots.get(snapshotToken);
    if (!observed || observed.revision !== String(revision) || observed.expiresAt <= Date.now()) return fail('CONFLICT', 409);
    const common = { version: 'explorers-owner-content/v2', snapshotToken, expiresAt: observed.expiresAt };
    if (snapshot || validate) return { status: 200, body: contract.ownerSnapshotSchema.parse({ ...common, revision: String(revision), pinRevision: 1 }) };
    const prefix = `${category}-offset-`;
    if (params.cursor && (!params.cursor.startsWith(prefix) || !/^(0|[1-9][0-9]*)$/.test(params.cursor.slice(prefix.length)))) return fail('INVALID_INPUT', 422);
    const offset = params.cursor ? Number(params.cursor.slice(prefix.length)) : 0;
    if (!Number.isSafeInteger(offset)) return fail('INVALID_INPUT', 422);
    const limit = Number(params.limit ?? 24);
    const items = stream === 'collections' ? collections.filter(item => params.status === 'all' || item.archived === (params.status === 'archived')) : [];
    const pageSchema = stream === 'collections' ? contract.ownerCollectionPageSchema : stream === 'recommendations' ? contract.ownerRecommendationPageSchema
      : stream === 'memberships' ? contract.ownerMembershipPageSchema : contract.ownerTopPickPageSchema;
    return { status: 200, body: pageSchema.parse({ ...common, snapshot: String(revision), items: items.slice(offset, offset + limit),
      nextCursor: offset + limit < items.length ? `${prefix}${offset + limit}` : null, ...(stream === 'pins' ? { pinRevision: 1 } : {}) }) };
  };
}
