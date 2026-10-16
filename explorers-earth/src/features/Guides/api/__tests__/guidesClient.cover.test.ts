import {beforeEach, describe, expect, it, vi} from 'vitest';
import {explorersApiClient, ExplorersApiError} from '../../../../lib/explorersApiClient';
import useAuthStore from '../../../../store/store';
import {GuidesClient} from '../guidesClient';
import type {GuideAggregateDto} from '../../../../../../tunes/shared/explorersGuideContract';

// Only transport is substituted. Observation/intent branding and owner generation are real.
vi.mock('../../../../lib/explorersApiClient', async importOriginal => {
 const actual = await importOriginal<typeof import('../../../../lib/explorersApiClient')>();
 return {...actual, explorersApiClient: {...actual.explorersApiClient,
  readMyGuide: vi.fn(), createMedia: vi.fn(), attachMyGuideCover: vi.fn(), deleteMedia: vi.fn()}};
});
const aggregate = (revision = 7, coverMediaId: string | null = 'prior-cover'): GuideAggregateDto => ({
 collectionId: 'guide-a', revision, coverMediaId, sections: [], sectionCount: 0, nextCursor: null,
 details: {guideType: null, multiCity: false, numberOfDays: null, estimatedBudget: null,
  budgetCurrency: null, budgetType: null, bestTimeToVisit: [], categories: [], tags: [], tipsNotes: null,
  place: {name: null, address: null, placeId: null, rating: null, ratingsCount: null, lat: null, lng: null}, locationEntityId: null},
});
function owner(id = 'owner-a') {
 const generation = useAuthStore.getState().beginVerification();
 useAuthStore.getState().acceptVerified(generation, {id, userId: `user-${id}`, username: id,
  email: `${id}@example.invalid`, onboardingStatus: 'complete', revision: 1});
}
async function prepared() {
 const observation = await GuidesClient.observeGuide('guide-a');
 return {observation, intent: GuidesClient.prepareIntent(observation)};
}
describe('Guides cover upload contract', () => {
 beforeEach(() => {
  vi.resetAllMocks(); owner();
  vi.mocked(explorersApiClient.readMyGuide).mockResolvedValue(aggregate());
  vi.mocked(explorersApiClient.createMedia).mockResolvedValue({id: 'fresh-cover'} as never);
  vi.mocked(explorersApiClient.attachMyGuideCover).mockResolvedValue(aggregate(8, 'fresh-cover'));
 });
 it('uploads guide covers with collection purpose before attaching the returned media id', async () => {
  const {intent} = await prepared(), file = new File(['png'], 'cover.png', {type: 'image/png'});
  const signal = new AbortController().signal, order: string[] = [];
  vi.mocked(explorersApiClient.createMedia).mockImplementation(async () => {order.push('upload'); return {id: 'fresh-cover'} as never;});
  vi.mocked(explorersApiClient.attachMyGuideCover).mockImplementation(async () => {order.push('attach'); return aggregate(8, 'fresh-cover');});
  const result = await GuidesClient.attachCover(intent, file, signal);
  expect(explorersApiClient.createMedia).toHaveBeenCalledWith(file, 'collection', signal);
  expect(explorersApiClient.attachMyGuideCover).toHaveBeenCalledWith('guide-a', {revision: 7, mediaId: 'fresh-cover'}, intent.commandKey, signal);
  expect(order).toEqual(['upload', 'attach']); expect(result.aggregate.coverMediaId).toBe('fresh-cover'); expect(result.revision).toBe(8);
 });
 it('does not attach a guide cover when upload fails', async () => {
  const {observation, intent} = await prepared(), failure = new Error('put failed');
  vi.mocked(explorersApiClient.createMedia).mockRejectedValue(failure);
  await expect(GuidesClient.attachCover(intent, new File(['png'], 'cover.png'))).rejects.toBe(failure);
  expect(explorersApiClient.attachMyGuideCover).not.toHaveBeenCalled(); expect(explorersApiClient.deleteMedia).not.toHaveBeenCalled();
  expect(observation.aggregate.coverMediaId).toBe('prior-cover');
 });
 it('rejects cover attachment after owner generation changes during upload', async () => {
  for (const nextOwner of ['owner-a', 'owner-b']) {
   owner(); const {intent} = await prepared(); let release!: (value: never) => void;
   vi.mocked(explorersApiClient.createMedia).mockImplementationOnce(() => new Promise(resolve => {release = resolve;}));
   const work = GuidesClient.attachCover(intent, new File(['png'], 'cover.png'));
   const rejected = expect(work).rejects.toMatchObject({status: 409, code: 'CONFLICT'});
   owner(nextOwner); release({id: 'late-cover'} as never); await rejected;
  }
  expect(explorersApiClient.attachMyGuideCover).not.toHaveBeenCalled(); expect(explorersApiClient.deleteMedia).not.toHaveBeenCalled();
 });
 it('retains the prior cover observation when attachment fails and permits a fresh observed retry', async () => {
  const {observation, intent} = await prepared(), refusal = new ExplorersApiError(409, 'CONFLICT', 'Stale revision');
  vi.mocked(explorersApiClient.attachMyGuideCover).mockRejectedValueOnce(refusal);
  await expect(GuidesClient.attachCover(intent, new File(['png'], 'cover.png'))).rejects.toBe(refusal);
  expect(observation.aggregate.coverMediaId).toBe('prior-cover'); expect(observation.revision).toBe(7);
  expect(explorersApiClient.deleteMedia).not.toHaveBeenCalled();
  vi.mocked(explorersApiClient.readMyGuide).mockResolvedValueOnce(aggregate(9));
  const fresh = await prepared(); expect(fresh.intent.commandKey).not.toBe(intent.commandKey);
  vi.mocked(explorersApiClient.createMedia).mockResolvedValueOnce({id: 'retry-cover'} as never);
  vi.mocked(explorersApiClient.attachMyGuideCover).mockResolvedValueOnce(aggregate(10, 'retry-cover'));
  const result = await GuidesClient.attachCover(fresh.intent, new File(['retry'], 'cover.png'));
  expect(explorersApiClient.attachMyGuideCover).toHaveBeenLastCalledWith('guide-a', {revision: 9, mediaId: 'retry-cover'}, fresh.intent.commandKey, undefined);
  expect(result.aggregate.coverMediaId).toBe('retry-cover'); expect(result.revision).toBe(10);
  expect(observation.aggregate.coverMediaId).toBe('prior-cover'); expect(explorersApiClient.deleteMedia).not.toHaveBeenCalled();
 });
});
