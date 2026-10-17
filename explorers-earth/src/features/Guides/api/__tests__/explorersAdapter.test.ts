import {beforeEach, describe, expect, it, vi} from 'vitest';
import {GuidesClient} from '../guidesClient';
import {readGuidesOwnerContent} from '../explorersAdapter';
import useAuthStore from '../../../../store/store';
import {guideAggregateDtoSchema} from '../../../../../../tunes/shared/explorersGuideContract';

vi.mock('../guidesClient', () => ({
 GuidesClient: {readCompleteOwner: vi.fn(), observeCollection: vi.fn(), observeWholeGuide: vi.fn()},
}));
vi.mock('../guidesViewModel', async (orig) => ({
 ...(await orig() as object),
 toGuide: vi.fn((_list: unknown, _aggregate: unknown, pinOrder: number | null) => ({documentId: 'guide', pin_order: pinOrder})),
}));

/**
 * Ticket 5.3. The Guides owner read.
 *
 * Every case here tries to break the same guarantee: a view is either wholly consistent or
 * not returned. Guides hydrates two things per guide - the collection row and the aggregate
 * - so there are two more ways to be stale than the other categories have, and both are
 * asserted by making them stale on purpose.
 */
describe('Guides owner read orchestration', () => {
 beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({accountId: 'owner', generation: 1});
 });

 const observed = (guides: number, revision = '1') => ({
  revision, pinRevision: 1, memberships: [], topPicks: [], recommendations: [],
  collections: Array.from({length: guides}, (_unused, index) => ({id: `guide-${index}`, revision: 1})),
 });
 const freshList = (pinOrder: number | null = null) => ({detail: {revision: 1, categoryRevision: '1', pinOrder}}) as never;
 const freshAggregate = () => ({revision: 1, aggregate: {collectionId: 'guide-0', sections: []}}) as never;

 it('returns a consistent view when nothing moves', async () => {
  vi.mocked(GuidesClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
  vi.mocked(GuidesClient.observeCollection).mockResolvedValue(freshList());
  vi.mocked(GuidesClient.observeWholeGuide).mockResolvedValue(freshAggregate());
  const result = await readGuidesOwnerContent();
  expect(result.guides).toHaveLength(1);
  expect(result.aggregates.size).toBe(1);
  expect(result.lists.size).toBe(1);
 });
 it('hydrates active Guides while retaining archived sibling parents in the complete owner observation',async()=>{
  const activeId='10000000-0000-4000-8000-000000000001',archivedId='10000000-0000-4000-8000-000000000002',aggregate=guideAggregateDtoSchema.parse({collectionId:activeId,revision:1,details:{guideType:null,multiCity:false,numberOfDays:null,estimatedBudget:null,budgetCurrency:null,budgetType:null,bestTimeToVisit:[],categories:[],tags:[],tipsNotes:null,place:{},locationEntityId:null},coverMediaId:null,sections:[],sectionCount:0,nextCursor:null});
  const complete={...observed(2),collections:[{id:activeId,revision:1,archived:false},{id:archivedId,revision:1,archived:true}]};
  vi.mocked(GuidesClient.readCompleteOwner).mockResolvedValue(complete as never);
  vi.mocked(GuidesClient.observeCollection).mockImplementation(async id=>{if(id===archivedId)throw Object.assign(Error('Resource unavailable'),{status:404});return freshList();});
  vi.mocked(GuidesClient.observeWholeGuide).mockResolvedValue({revision:1,aggregate} as never);
  const result=await readGuidesOwnerContent();expect(result.guides).toHaveLength(1);expect([...result.lists.keys()]).toEqual([activeId]);expect([...result.aggregates.keys()]).toEqual([activeId]);expect(result.aggregates.get(activeId)?.aggregate).toEqual(aggregate);expect(result.observation.collections).toEqual(complete.collections);expect(GuidesClient.observeCollection).toHaveBeenCalledTimes(1);expect(GuidesClient.observeWholeGuide).toHaveBeenCalledTimes(1);expect(GuidesClient.observeCollection).toHaveBeenCalledWith(activeId,expect.any(AbortSignal));expect(GuidesClient.observeWholeGuide).toHaveBeenCalledWith(activeId,expect.any(AbortSignal));
 });
 it('returns an empty active view when the consistency bracket contains only archived parents',async()=>{const complete={...observed(1),collections:[{id:'archived-sibling',revision:1,archived:true}]};vi.mocked(GuidesClient.readCompleteOwner).mockResolvedValue(complete as never);const result=await readGuidesOwnerContent();expect(result.guides).toEqual([]);expect(result.lists.size).toBe(0);expect(result.aggregates.size).toBe(0);expect(result.observation.collections).toEqual(complete.collections);expect(GuidesClient.observeCollection).not.toHaveBeenCalled();expect(GuidesClient.observeWholeGuide).not.toHaveBeenCalled();});

 it('never returns a view built on a category observation that changed under it', async () => {
  const first = observed(1);
  vi.mocked(GuidesClient.readCompleteOwner)
   .mockResolvedValueOnce(first as never)
   .mockResolvedValueOnce({...first, revision: '2'} as never);
  vi.mocked(GuidesClient.observeCollection).mockResolvedValue(freshList());
  vi.mocked(GuidesClient.observeWholeGuide).mockResolvedValue(freshAggregate());
  await expect(readGuidesOwnerContent()).rejects.toMatchObject({status: 409});
 });

 it('rejects a pin revision that moved, because pinned-first order would be wrong', async () => {
  const first = observed(1);
  vi.mocked(GuidesClient.readCompleteOwner)
   .mockResolvedValueOnce(first as never)
   .mockResolvedValueOnce({...first, pinRevision: 2} as never);
  vi.mocked(GuidesClient.observeCollection).mockResolvedValue(freshList());
  vi.mocked(GuidesClient.observeWholeGuide).mockResolvedValue(freshAggregate());
  await expect(readGuidesOwnerContent()).rejects.toMatchObject({status: 409});
 });

 it('rejects a guide list row whose revision or category revision does not match', async () => {
  for (const detail of [{revision: 2, categoryRevision: '1', pinOrder: null}, {revision: 1, categoryRevision: '2', pinOrder: null}]) {
   vi.clearAllMocks();
   useAuthStore.setState({accountId: 'owner', generation: 1});
   vi.mocked(GuidesClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
   vi.mocked(GuidesClient.observeCollection).mockResolvedValue({detail} as never);
   vi.mocked(GuidesClient.observeWholeGuide).mockResolvedValue(freshAggregate());
   await expect(readGuidesOwnerContent()).rejects.toMatchObject({status: 409});
  }
 });

 it('rejects an aggregate whose revision does not match the bracket', async () => {
  // This is the Guides-specific one. A stale aggregate is how day three of an itinerary
  // would be shown against a title and cover from a newer version of the guide.
  vi.mocked(GuidesClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
  vi.mocked(GuidesClient.observeCollection).mockResolvedValue(freshList());
  vi.mocked(GuidesClient.observeWholeGuide).mockResolvedValue({revision: 2, aggregate: {collectionId: 'guide-0', sections: []}} as never);
  await expect(readGuidesOwnerContent()).rejects.toMatchObject({status: 409});
 });

 it('rejects owner epoch drift during hydration', async () => {
  vi.mocked(GuidesClient.readCompleteOwner).mockResolvedValue(observed(2) as never);
  vi.mocked(GuidesClient.observeCollection).mockImplementation(async () => {
   useAuthStore.setState({generation: 2});
   return freshList();
  });
  vi.mocked(GuidesClient.observeWholeGuide).mockResolvedValue(freshAggregate());
  await expect(readGuidesOwnerContent()).rejects.toMatchObject({status: 409});
 });

 it('reports the first failure rather than a later reader cancellation', async () => {
  vi.mocked(GuidesClient.readCompleteOwner).mockResolvedValue(observed(6) as never);
  vi.mocked(GuidesClient.observeCollection).mockResolvedValue(freshList());
  let call = 0;
  vi.mocked(GuidesClient.observeWholeGuide).mockImplementation(async () => {
   if (++call === 1) throw Object.assign(new Error('Guide too large'), {status: 503, code: 'READ_LIMIT'});
   return freshAggregate();
  });
  // Without the first-error latch, a slower reader's abort replaces the real cause and the
  // user is told the read was cancelled instead of why.
  await expect(readGuidesOwnerContent()).rejects.toMatchObject({status: 503});
 });

 it('takes pinOrder from the editable list read, not from the category page row', async () => {
  vi.mocked(GuidesClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
  vi.mocked(GuidesClient.observeCollection).mockResolvedValue(freshList(0));
  vi.mocked(GuidesClient.observeWholeGuide).mockResolvedValue(freshAggregate());
  const result = await readGuidesOwnerContent();
  // Position zero is pinned, not unpinned, and it only exists on the editable read.
  expect(result.guides[0]).toMatchObject({pin_order: 0});
 });

 it('hydrates every guide the closing read reports', async () => {
  vi.mocked(GuidesClient.readCompleteOwner).mockResolvedValue(observed(3) as never);
  vi.mocked(GuidesClient.observeCollection).mockResolvedValue(freshList());
  vi.mocked(GuidesClient.observeWholeGuide).mockResolvedValue(freshAggregate());
  const result = await readGuidesOwnerContent();
  expect(result.guides).toHaveLength(3);
  expect(GuidesClient.observeCollection).toHaveBeenCalledTimes(3);
  expect(GuidesClient.observeWholeGuide).toHaveBeenCalledTimes(3);
 });

 it('bounds concurrency rather than issuing one request per guide at once', async () => {
  vi.mocked(GuidesClient.readCompleteOwner).mockResolvedValue(observed(12) as never);
  let inFlight = 0;
  let peak = 0;
  vi.mocked(GuidesClient.observeCollection).mockImplementation(async () => {
   inFlight += 1;
   peak = Math.max(peak, inFlight);
   await Promise.resolve();
   inFlight -= 1;
   return freshList();
  });
  vi.mocked(GuidesClient.observeWholeGuide).mockResolvedValue(freshAggregate());
  await readGuidesOwnerContent();
  expect(peak).toBeLessThanOrEqual(4);
 });

 it('returns an empty view for an owner with no guides without hydrating anything', async () => {
  vi.mocked(GuidesClient.readCompleteOwner).mockResolvedValue(observed(0) as never);
  const result = await readGuidesOwnerContent();
  expect(result.guides).toEqual([]);
  expect(GuidesClient.observeCollection).not.toHaveBeenCalled();
  expect(GuidesClient.observeWholeGuide).not.toHaveBeenCalled();
 });
});
