import {shareOwnerRead} from '../../../lib/sharedOwnerRead';
import {GuidesClient, type CompleteGuidesOwnerContent, type GuideObservation} from './guidesClient';
import {toGuide} from './guidesViewModel';
import {ExplorersApiError, type CollectionObservation} from '../../../lib/explorersApiClient';
import useAuthStore from '../../../store/store';
import type {Guide} from '../types';

// Ticket 5.3. Same orchestration contract as the Apps, Products, People, Places, Movies
// and Games adapters: two bracketing category reads, a bounded fan-out of detail reads,
// and no partially hydrated view ever returned.
//
// Guides differs in what the fan-out fetches. The other categories hydrate recommendations;
// a guide has none. Its content is its own fields plus its ordered sections, so the fan-out
// reads two things per guide - the collection row, for the title, slug, visibility and
// orders that live there, and the aggregate, for the guide fields and sections. Both run
// inside the same bracket, so a guide edited during the read is caught by the closing
// revision check exactly like any other change.
//
// The byte budget matters more here than elsewhere. A section may be 256KB and a guide may
// hold 200 of them, so a dashboard with several large guides can be far bigger than a page
// of recommendations. The budget is enforced as the reads land rather than afterwards,
// which is what stops an unbounded read from being issued at all.

export type GuidesOwnerContent = {
 observation: CompleteGuidesOwnerContent;
 guides: readonly Guide[];
 lists: ReadonlyMap<string, CollectionObservation>;
 aggregates: ReadonlyMap<string, GuideObservation>;
};

const READER_COUNT = 4;
const READ_BUDGET = 64 * 1024 * 1024;

/** Concurrent readers on one page share one read (see shareOwnerRead). */
export function readGuidesOwnerContent(signal?: AbortSignal):Promise<GuidesOwnerContent>{return shareOwnerRead('guides',signal,shared=>readGuidesOwnerContentOnce(shared));}
async function readGuidesOwnerContentOnce(signal?: AbortSignal): Promise<GuidesOwnerContent> {
 const controller = new AbortController();
 let terminal = false;
 let firstError: unknown;
 const forwardAbort = () => controller.abort(signal?.reason);
 signal?.addEventListener('abort', forwardAbort, {once: true});
 if (signal?.aborted) forwardAbort();
 // The first failure is the one reported. Without this, a slower reader's abort error
 // replaces the real cause and the user is told the read was cancelled.
 const fail = (error: unknown): never => {
  if (!terminal) {terminal = true; firstError = error; controller.abort(error);}
  throw firstError;
 };
 const checkTerminal = () => {
  if (terminal) throw firstError;
  if (controller.signal.aborted) throw new DOMException('Owner read cancelled', 'AbortError');
 };

 try {
  checkTerminal();
  const initial = useAuthStore.getState();
  const assertCurrent = () => {
   const state = useAuthStore.getState();
   if (signal?.aborted || state.accountId !== initial.accountId || state.generation !== initial.generation)
    throw new ExplorersApiError(409, 'CONFLICT', 'Guides owner changed while loading');
  };

  const first = await GuidesClient.readCompleteOwner(controller.signal);
  checkTerminal();
  assertCurrent();

  const lists = new Map<string, CollectionObservation>();
  const aggregates = new Map<string, GuideObservation>();
  // The complete owner bracket retains archived parents for membership checks.
  // Guides requests active content and hydrates through active-only detail reads.
  const activeCollections = first.collections.filter(row => !row.archived);
  let index = 0;
  let bytes = 0;
  const budget = (value: unknown) => {
   bytes += new TextEncoder().encode(JSON.stringify(value)).byteLength;
   if (bytes > READ_BUDGET) throw new ExplorersApiError(503, 'READ_LIMIT', 'Guides read limit exceeded');
  };

  await Promise.all(Array.from({length: Math.min(READER_COUNT, activeCollections.length)}, async () => {
   try {
    while (index < activeCollections.length) {
     checkTerminal();
     assertCurrent();
     const row = activeCollections[index++];
     const list = await GuidesClient.observeCollection(row.id, controller.signal);
     checkTerminal();
     assertCurrent();
     // The list's own revision and the category revision must both match what the
     // bracket opened with, or this guide was edited mid-read.
     if (list.detail.revision !== row.revision || list.detail.categoryRevision !== first.revision)
      throw new ExplorersApiError(409, 'CONFLICT', 'Guides changed while loading');
     budget(list.detail);
     const aggregate = await GuidesClient.observeWholeGuide(row.id, controller.signal);
     checkTerminal();
     assertCurrent();
     if (String(aggregate.revision) !== first.revision)
      throw new ExplorersApiError(409, 'CONFLICT', 'Guides changed while loading');
     budget(aggregate.aggregate);
     lists.set(row.id, list);
     aggregates.set(row.id, aggregate);
    }
   } catch (error) {
    fail(error);
   }
  }));

  checkTerminal();
  const final = await GuidesClient.readCompleteOwner(controller.signal);
  checkTerminal();
  assertCurrent();
  // The closing bracket. Anything that moved the category while the fan-out ran shows up
  // here, so a view is either wholly consistent or not returned.
  if (first.revision !== final.revision || first.pinRevision !== final.pinRevision)
   throw new ExplorersApiError(409, 'CONFLICT', 'Guides changed while loading');

  const guides = final.collections.filter(row => !row.archived).map((row) => {
   const list = lists.get(row.id);
   const aggregate = aggregates.get(row.id);
   // Every guide in the closing read must have been hydrated. A missing one means the two
   // brackets disagreed about which guides exist, which the revision check should already
   // have caught - so this is the assertion that the check actually held.
   if (!list || !aggregate) throw new ExplorersApiError(409, 'CONFLICT', 'Guides changed while loading');
   // pinOrder travels on the editable list read rather than on the category page row,
   // which is why the lists are hydrated at all.
   return toGuide(list.detail, aggregate.aggregate, list.detail.pinOrder ?? null);
  });

  return {observation: final, guides, lists, aggregates};
 } catch (error) {
  return fail(error);
 } finally {
  signal?.removeEventListener('abort', forwardAbort);
 }
}
