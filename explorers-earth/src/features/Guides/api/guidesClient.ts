import {explorersApiClient, assertCompleteMyCategoryContent, assertOwnerDetailObservation, ExplorersApiError,
 type CompleteMyCategoryContent, type CollectionObservation} from '../../../lib/explorersApiClient';
import {guideEmptySectionBlocks, type GuideAggregateDto, type GuideCollectionDetails,
 type GuideSectionBlocks} from '../../../../../tunes/shared/explorersGuideContract';
import useAuthStore from '../../../store/store';

// Ticket 5.3. The Guides transport.
//
// Same shape as the other category clients, with one structural difference worth naming: a
// guide's content is NOT a set of recommendations. It is the guide's own fields plus its
// ordered sections, read as one aggregate per guide. So the category page lists guides and
// each guide is then read on its own, rather than the category page carrying the content.
//
// Every write states the revision it was composed against, and that revision comes from an
// aggregate this client issued. An intent captures the owner, the generation and the route
// at the moment it was prepared, and a save re-checks all three - so a guide edited after
// the user signed out, switched accounts or navigated away cannot be written by a stale
// form still sitting in memory.

export type CompleteGuidesOwnerContent = CompleteMyCategoryContent & {readonly category: 'guides'};
export type GuideObservation = Readonly<{
 accountId: string; generation: number; observedAt: number; collectionId: string; revision: number;
 aggregate: GuideAggregateDto;
}>;
export type GuideSectionDraft = {title: string; description: string | null; blocks: GuideSectionBlocks};

const observations = new WeakSet<object>();
const intents = new WeakMap<object, {accountId: string | null; generation: number; route: string}>();
const route = () => (typeof window === 'undefined' ? '' : window.location.pathname);
const key = () => crypto.randomUUID();

function freeze<T>(value: T): T {
 if (value && typeof value === 'object') {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object' && !Object.isFrozen(child)) freeze(child);
 }
 return value;
}
function fail(): never {
 throw new ExplorersApiError(409, 'CONFLICT', 'Guides owner changed. Refresh before saving.');
}
function complete(value: CompleteMyCategoryContent): asserts value is CompleteGuidesOwnerContent {
 assertCompleteMyCategoryContent(value);
 if (value.category !== 'guides') fail();
}
function collection(value: CollectionObservation): void {
 assertOwnerDetailObservation(value, 'collection');
 if (value.detail.category !== 'guides') fail();
}
/**
 * Refuses an aggregate this client did not issue.
 *
 * The WeakSet is module-private, so a plain object shaped like an observation cannot be
 * passed to a write - the same brand the other categories use for owner details. Without
 * it, a component could hand a hand-built revision to a save.
 */
function observed(value: GuideObservation): void {
 if (!observations.has(value)) fail();
 const state = useAuthStore.getState();
 if (!state.isAuthenticated || state.accountId !== value.accountId || state.generation !== value.generation) fail();
}
function currentIntent(scope: {accountId: string | null; generation: number; route: string}, signal?: AbortSignal): void {
 const state = useAuthStore.getState();
 if (signal?.aborted || !state.isAuthenticated || state.accountId !== scope.accountId
  || state.generation !== scope.generation || route() !== scope.route) fail();
}

function brand(collectionId: string, aggregate: GuideAggregateDto): GuideObservation {
 const state = useAuthStore.getState();
 if (!state.isAuthenticated || !state.accountId) throw new ExplorersApiError(401, 'UNAUTHENTICATED', 'Sign in is required');
 if (aggregate.collectionId !== collectionId) throw new ExplorersApiError(503, 'INVALID_OWNER_CONTENT', 'Invalid guide identity');
 const observation = freeze({
  accountId: state.accountId, generation: state.generation, observedAt: Date.now(),
  collectionId, revision: aggregate.revision, aggregate,
 }) as GuideObservation;
 observations.add(observation);
 return observation;
}

export const GuidesClient = {
 /** The guides category page: which guides exist, in the owner's order. */
 async readCompleteOwner(signal?: AbortSignal): Promise<CompleteGuidesOwnerContent> {
  const value = await explorersApiClient.getCompleteMyCategoryContent({category: 'guides', status: 'active'}, signal);
  complete(value);
  return value;
 },

 /** The guide list row, for the fields that live on the collection rather than the aggregate. */
 async observeCollection(id: string, signal?: AbortSignal): Promise<CollectionObservation> {
  const value = await explorersApiClient.getMyEditableCollection(id, signal);
  collection(value);
  return value;
 },

 /**
  * One guide's aggregate.
  *
  * `after` walks the section pages. A guide with more sections than one page reports a
  * cursor, and the caller continues from it; the revision is checked across pages by the
  * adapter, so a guide edited mid-walk is a conflict rather than a spliced-together guide.
  */
 async observeGuide(collectionId: string, options: {after?: number; limit?: number} = {}, signal?: AbortSignal): Promise<GuideObservation> {
  const aggregate = await explorersApiClient.readMyGuide(collectionId, options, signal);
  return brand(collectionId, aggregate as GuideAggregateDto);
 },

 /** Every section of a guide, walking the pages and refusing a guide that changes mid-walk. */
 async observeWholeGuide(collectionId: string, signal?: AbortSignal): Promise<GuideObservation> {
  let page = await explorersApiClient.readMyGuide(collectionId, {}, signal);
  const sections = [...page.sections];
  let guard = 0;
  while (page.nextCursor !== null) {
   if (++guard > 20) throw new ExplorersApiError(503, 'READ_LIMIT', 'Guide has more section pages than expected');
   const next = await explorersApiClient.readMyGuide(collectionId, {after: Number(page.nextCursor)}, signal);
   // A guide edited between pages would otherwise be stitched together from two states.
   if (next.revision !== page.revision) throw new ExplorersApiError(409, 'CONFLICT', 'Guide changed while loading');
   sections.push(...next.sections);
   page = next;
  }
  if (sections.length !== page.sectionCount) throw new ExplorersApiError(409, 'CONFLICT', 'Guide changed while loading');
  return brand(collectionId, {...page, sections, nextCursor: null} as GuideAggregateDto);
 },

 prepareIntent(guide: GuideObservation) {
  observed(guide);
  const scope = {accountId: guide.accountId, generation: guide.generation, route: route()};
  const intent = freeze({collectionId: guide.collectionId, revision: guide.revision, commandKey: key()});
  intents.set(intent, scope);
  return intent;
 },

 async writeDetails(intent: {collectionId: string; revision: number; commandKey: string}, details: GuideCollectionDetails, signal?: AbortSignal) {
  const scope = intents.get(intent);
  if (!scope) fail();
  currentIntent(scope, signal);
  const result = await explorersApiClient.writeMyGuideDetails(intent.collectionId, {revision: intent.revision, details}, intent.commandKey, signal);
  currentIntent(scope, signal);
  return brand(intent.collectionId, result as unknown as GuideAggregateDto);
 },

 async addSection(intent: {collectionId: string; revision: number; commandKey: string}, draft: GuideSectionDraft, position?: number, signal?: AbortSignal) {
  const scope = intents.get(intent);
  if (!scope) fail();
  currentIntent(scope, signal);
  const result = await explorersApiClient.addMyGuideSection(intent.collectionId,
   {revision: intent.revision, ...draft, ...(position === undefined ? {} : {position})}, intent.commandKey, signal);
  currentIntent(scope, signal);
  return brand(intent.collectionId, result as unknown as GuideAggregateDto);
 },

 /**
  * Replaces one section's complete state.
  *
  * Complete, not partial. Each micro editor builds the whole block from its own form, so a
  * field that editor does not show cannot arrive as a null that erases what another editor
  * wrote. An empty block is guideEmptySectionBlocks, never an absent key.
  */
 async writeSection(intent: {collectionId: string; revision: number; commandKey: string}, sectionId: string, draft: GuideSectionDraft, signal?: AbortSignal) {
  const scope = intents.get(intent);
  if (!scope) fail();
  currentIntent(scope, signal);
  const result = await explorersApiClient.writeMyGuideSection(intent.collectionId, sectionId, {revision: intent.revision, ...draft}, intent.commandKey, signal);
  currentIntent(scope, signal);
  return brand(intent.collectionId, result as unknown as GuideAggregateDto);
 },

 async removeSection(intent: {collectionId: string; revision: number; commandKey: string}, sectionId: string, signal?: AbortSignal) {
  const scope = intents.get(intent);
  if (!scope) fail();
  currentIntent(scope, signal);
  const result = await explorersApiClient.removeMyGuideSection(intent.collectionId, sectionId, intent.revision, intent.commandKey, signal);
  currentIntent(scope, signal);
  return brand(intent.collectionId, result as unknown as GuideAggregateDto);
 },

 /** The complete new order, not a move. The server refuses a list that is not the current set. */
 async reorderSections(intent: {collectionId: string; revision: number; commandKey: string}, sectionIds: string[], signal?: AbortSignal) {
  const scope = intents.get(intent);
  if (!scope) fail();
  currentIntent(scope, signal);
  const result = await explorersApiClient.reorderMyGuideSections(intent.collectionId, {revision: intent.revision, sectionIds}, intent.commandKey, signal);
  currentIntent(scope, signal);
  return brand(intent.collectionId, result as unknown as GuideAggregateDto);
 },

 /**
  * Attaches a cover.
  *
  * Upload first, then attach. The replacement is only linked once its bytes exist, and the
  * previous cover stays attached and served until that succeeds - which is the opposite of
  * the Strapi path, where the old upload was deleted before the new one was posted, so a
  * failed upload left the guide with no image at all.
  */
 async attachCover(intent: {collectionId: string; revision: number; commandKey: string}, file: File, signal?: AbortSignal) {
  const scope = intents.get(intent);
  if (!scope) fail();
  currentIntent(scope, signal);
  const media = await explorersApiClient.createMedia(file, 'collection', signal);
  currentIntent(scope, signal);
  const result = await explorersApiClient.attachMyGuideCover(intent.collectionId, {revision: intent.revision, mediaId: media.id}, intent.commandKey, signal);
  currentIntent(scope, signal);
  return brand(intent.collectionId, result as unknown as GuideAggregateDto);
 },

 /** A section with every block present and empty, which is what a new day starts as. */
 emptySectionBlocks(): GuideSectionBlocks {
  return JSON.parse(JSON.stringify(guideEmptySectionBlocks)) as GuideSectionBlocks;
 },
};
