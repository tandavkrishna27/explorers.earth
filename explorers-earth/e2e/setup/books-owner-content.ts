import { createHash } from 'node:crypto';
import { canonicalAccountFixture } from '../../src/test/canonicalAccountFixture';
import { emptyBookDetails } from '../../../tunes/shared/explorersBookContract';
import * as contract from '../../../tunes/shared/explorersOwnerContentContract';

// Only content IDs are adapted. Canonical account/session authority is never
// rewritten to satisfy a legacy documentId consumer.
export function bookFixtureId(kind: string, id: string) {
  const hash = createHash('sha256').update(`${kind}:${id}`).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
export function createBooksOwnerFixture(lists: () => Record<string, any>[], legacyAccountId = 'browser-account') {
  let signature = '', revision = 0;
  const snapshots = new Map<string, { revision: string; expiresAt: number }>();
  const observe = () => {
    const source = lists();
    const next = JSON.stringify(source);
    if (next !== signature) { signature = next; revision++; }
    const accountId = canonicalAccountFixture().id;
    const collections = source.map((list, displayOrder) => contract.ownerCollectionDtoSchema.parse({
      id: bookFixtureId('collection', list.documentId), accountId, category: 'books',
      title: list.List_Name, slug: list.slug, visibility: list.visibility ? 'public' : 'private',
      publicationState: list.canonicalPublicationState ?? (list.Visibility ? 'published' : 'draft'), revision: list.canonicalRevision ?? 1,
      description: list.list_description ?? null, heading: list.top_reads_heading ?? null,
      coverMediaId: null, archived: false, displayOrder,
    }));
    const details = new Map<string, ReturnType<typeof contract.editableOwnerRecommendationSchema.parse>>();
    const memberships: ReturnType<typeof contract.ownerMembershipDtoSchema.parse>[] = [];
    source.forEach((list, index) => (list.recommended_books ?? []).forEach((book: Record<string, any>, displayOrder: number) => {
      const id = bookFixtureId('recommendation', book.documentId), entityId = bookFixtureId('entity', book.documentId);
      const pin = book.is_pinned ? { collectionId: collections[index].id, position: book.pin_order ?? 0, revision: 1 } : null;
      const detail = contract.editableOwnerRecommendationSchema.parse({
        id, accountId, entityId, category: 'books', userRating: book.user_rating ?? null,
        publicationState: 'published', revision: 1, mediaIds: [], archived: false, pin,
        categoryRevision: String(revision), note: null, entity: { id: entityId, kind: 'book', title: book.title },
        displayOverrides: {}, displayTitle: book.title, effectiveBookDetails: { ...emptyBookDetails(), authors: book.authors ?? [], subjects: book.subjects ?? [] },
      });
      details.set(id, detail);
      memberships.push(contract.ownerMembershipDtoSchema.parse({ recommendationId: id, collectionId: collections[index].id,
        collectionRevision: collections[index].revision, displayOrder, collectionArchived: false, recommendationArchived: false }));
    }));
    const recommendations = [...details.values()].map(({categoryRevision, note, entity, displayOverrides, displayTitle, effectiveBookDetails, ...item}) => contract.ownerRecommendationDtoSchema.parse(item));
    const pins = recommendations.filter(item => item.pin).map(item => ({ recommendationId: item.id, collectionId: item.pin!.collectionId, position: item.pin!.position }))
      .sort((a,b) => a.position-b.position || a.recommendationId.localeCompare(b.recommendationId));
    return { collections, recommendations, memberships, pins, details };
  };
  return (url: URL): {status:number; body:unknown} | undefined => {
    const prefix = '/api/explorers/v1', path = url.pathname.slice(prefix.length);
    if (!url.pathname.startsWith(prefix)) return;
    const stream = path === '/collections' ? 'collections' : path === '/recommendations' ? 'recommendations'
      : path === '/categories/books/memberships' ? 'memberships' : path === '/categories/books/top-picks' ? 'pins' : undefined;
    const detail = path.match(/^\/(collections|recommendations)\/([0-9a-f-]{36})\/editable$/);
    const snapshot = path === '/categories/books/content-snapshot', validate = path === '/categories/books/content-snapshot/validate';
    if (!stream && !detail && !snapshot && !validate) return;
    if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) return;
    const params = Object.fromEntries(url.searchParams);
    const schema = snapshot ? contract.ownerSnapshotRequestSchema : validate ? contract.ownerSnapshotValidationRequestSchema
      : detail ? contract.ownerDetailRequestSchema : stream === 'collections' ? contract.ownerCollectionsRequestSchema
      : stream === 'recommendations' ? contract.ownerRecommendationsRequestSchema : stream === 'memberships' ? contract.ownerMembershipsRequestSchema : contract.ownerTopPicksRequestSchema;
    const parsed = schema.safeParse(detail || stream === 'collections' || stream === 'recommendations' ? params : { category: 'books', ...params });
    if (!parsed.success || ('category' in parsed.data && parsed.data.category !== 'books')) return;
    const error = (code:string,status:number) => ({status,body:{error:{code,message:'Contained Books observation rejected',requestId:'books-fixture'}}});
    if (lists().some(list => list.account?.documentId !== legacyAccountId)) return error('FORBIDDEN',403);
    const data = observe();
    if (detail) {
      if (params.status !== 'active') return;
      const item = detail[1] === 'collections' ? data.collections.find(item => item.id === detail[2]) : data.details.get(detail[2]);
      if (!item) return error('NOT_FOUND',404);
      // pinOrder is the list's own pin among its category's lists. It travels on the
      // editable read only, so the page DTO these items come from does not carry it;
      // Books lists are never pinned in this fixture, which is an explicit null.
      return {status:200,body: detail[1] === 'collections' ? {collection: contract.editableOwnerCollectionSchema.parse({...item,pinOrder:null,categoryRevision:String(revision)})} : {recommendation:item}};
    }
    let snapshotToken = params.snapshotToken;
    // Canonical collection reads may start without a separately issued snapshot.
    // Continuations must still present the exact token from their first page.
    if (!snapshotToken && (snapshot || stream && !params.cursor)) {
      snapshotToken = `books-fixture-${revision}-${snapshots.size}`;
      snapshots.set(snapshotToken,{revision:String(revision),expiresAt:Date.now()+60000});
    }
    const observed = snapshotToken && snapshots.get(snapshotToken);
    if (!observed || observed.revision !== String(revision) || observed.expiresAt <= Date.now()) return error('CONFLICT',409);
    const common = {version:'explorers-owner-content/v2',snapshotToken,expiresAt:observed.expiresAt};
    if (snapshot || validate) return {status:200,body:contract.ownerSnapshotSchema.parse({...common,revision:String(revision),pinRevision:1})};
    const cursor = params.cursor;
    if (cursor && !/^books-offset-(0|[1-9][0-9]*)$/.test(cursor)) return error('INVALID_INPUT',422);
    const offset = cursor ? Number(cursor.slice(13)) : 0, limit = Number(params.limit ?? 24);
    let items = data[stream!];
    if ((stream === 'collections' || stream === 'recommendations') && params.status === 'archived' || stream === 'memberships' && (params.collectionStatus === 'archived' || params.recommendationStatus === 'archived')) items = [];
    if (stream === 'recommendations' && params.collectionId) items = (items as typeof data.recommendations).filter(item => data.memberships.some(member => member.collectionId === params.collectionId && member.recommendationId === item.id));
    const pageSchema = stream === 'collections' ? contract.ownerCollectionPageSchema : stream === 'recommendations' ? contract.ownerRecommendationPageSchema : stream === 'memberships' ? contract.ownerMembershipPageSchema : contract.ownerTopPickPageSchema;
    return {status:200,body:pageSchema.parse({...common,snapshot:String(revision),items:items.slice(offset,offset+limit),nextCursor:offset+limit<items.length?`books-offset-${offset+limit}`:null,...(stream==='pins'?{pinRevision:1}:{})})};
  };
}
