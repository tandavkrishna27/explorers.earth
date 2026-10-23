import {act, renderHook} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
const {toast, run, observeWholeGuide, api} = vi.hoisted(() => ({toast: {success: vi.fn(), error: vi.fn()}, run: vi.fn(), observeWholeGuide: vi.fn(),
 api: {addMyGuideDay: vi.fn(), addMyGuideDayItem: vi.fn(), deleteMyGuideDay: vi.fn(), addMyGuideSection: vi.fn()}}));
vi.mock('sonner', () => ({toast}));
vi.mock('../../../../lib/explorersApiClient', () => ({explorersApiClient: api, ExplorersApiError: class extends Error {constructor(public status: number) {super('x');}}}));
vi.mock('../../api/guidesClient', () => ({GuidesClient: {prepareIntent: (g: {revision: number}) => ({collectionId: 'g', revision: g.revision, commandKey: 'k'}), run, observeWholeGuide}}));
import {ExplorersApiError} from '../../../../lib/explorersApiClient';
import {guideEmptySectionBlocks, type GuideDayItem} from '../../../../../../tunes/shared/explorersGuideContract';
import {useGuidePlan} from '../useGuidePlan';

const obs = (revision: number, sections: unknown[]) => ({collectionId: 'g', revision, aggregate: {collectionId: 'g', revision, sections}}) as never;
const note = (localId: string): GuideDayItem => ({kind: 'note', localId, timeLabel: null, text: `n ${localId}`});
const day = (id: string, items: GuideDayItem[], extra: Record<string, unknown> = {}) => ({id, title: `T ${id}`, description: null, blocks: {...guideEmptySectionBlocks, items, ...extra}});
const undoOf = () => (toast.success.mock.calls.at(-1)![1] as {action?: {onClick: () => void}} | undefined)?.action?.onClick;
beforeEach(() => {vi.clearAllMocks();});

describe('useGuidePlan', () => {
 it('runs commands one at a time against the latest revision and offers Undo on move', async () => {
  const sections = [{id: 'd1', blocks: guideEmptySectionBlocks}, {id: 'd2', blocks: guideEmptySectionBlocks}];
  run.mockImplementation(async (intent: {revision: number}) => obs(intent.revision + 1, sections));
  const {result} = renderHook(() => useGuidePlan(obs(1, sections)));
  await act(async () => {
   await Promise.all([result.current.moveItem('d1', 'a', 'd2', 0, {fromIndex: 2}), result.current.setTimeLabel('d2', 'a', 'evening')]);
  });
  expect(run.mock.calls.map((c) => c[0].revision)).toEqual([1, 2]);
  expect(toast.success).toHaveBeenCalledWith('Moved to Day 2', expect.objectContaining({action: expect.objectContaining({label: 'Undo'})}));
 });
 it('snaps back and offers Retry when a command fails', async () => {
  run.mockRejectedValueOnce(new Error('offline'));
  const {result} = renderHook(() => useGuidePlan(obs(5, [])));
  await act(async () => { await result.current.removeItem('d1', 'a', {index: 0, item: note('a')}); });
  expect(result.current.guide.revision).toBe(5);
  expect(observeWholeGuide).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({action: expect.objectContaining({label: 'Retry'})}));
 });
 it('re-reads the guide on a 409 so Retry runs on the fresh revision', async () => {
  run.mockRejectedValueOnce(new ExplorersApiError(409, 'CONFLICT' as never, 'x' as never));
  observeWholeGuide.mockResolvedValueOnce(obs(9, []));
  const {result} = renderHook(() => useGuidePlan(obs(5, [])));
  await act(async () => { await result.current.clearDay('d1'); });
  expect(observeWholeGuide).toHaveBeenCalledWith('g');
  expect(result.current.guide.revision).toBe(9);
  run.mockResolvedValueOnce(obs(10, []));
  const retry = (toast.error.mock.calls.at(-1)![1] as {action: {onClick: () => void}}).action.onClick;
  await act(async () => { retry(); await Promise.resolve(); await Promise.resolve(); });
  expect(run.mock.calls.at(-1)![0].revision).toBe(9);
 });
 it('replace swaps the held guide', () => {
  const {result} = renderHook(() => useGuidePlan(obs(1, [])));
  act(() => result.current.replace(obs(3, [])));
  expect(result.current.guide.revision).toBe(3);
 });
 it('offers no Undo when the removed item had a price or a transport segment', async () => {
  const priced = [day('d1', [note('a'), note('b')], {budget: {entries: [{localId: 'a'}]}})];
  run.mockResolvedValue(obs(2, priced));
  const {result} = renderHook(() => useGuidePlan(obs(1, priced)));
  await act(async () => { await result.current.removeItem('d1', 'a', {index: 0, item: note('a')}); });
  expect(toast.success).toHaveBeenLastCalledWith('Removed from guide', undefined);
  await act(async () => { await result.current.removeItem('d1', 'b', {index: 1, item: note('b')}); });
  expect(undoOf()).toBeTypeOf('function');
  const routed = [day('d1', [note('a'), note('b')], {transport: {segments: [{fromLocalId: 'a', toLocalId: 'b'}]}}), day('d2', [])];
  run.mockResolvedValue(obs(2, routed));
  const second = renderHook(() => useGuidePlan(obs(1, routed)));
  await act(async () => { await second.result.current.moveItem('d1', 'b', 'd2', 0, {fromIndex: 1}); });
  expect(toast.success).toHaveBeenLastCalledWith('Moved to Day 2', undefined);
 });
 it('undoes Delete day with the day commands: re-adds the day at its index, then its items', async () => {
  const before = [day('d1', []), day('d2', [note('a'), note('b')])];
  const restored = [day('d1', []), day('n2', [])];
  run.mockImplementation(async (intent: {revision: number}, call: (id: string, r: number, k: string) => Promise<unknown>) => {
   await call('g', intent.revision, 'k');
   return obs(intent.revision + 1, intent.revision === 1 ? [before[0]] : restored);
  });
  const {result} = renderHook(() => useGuidePlan(obs(1, before)));
  await act(async () => { await result.current.deleteDay('d2'); });
  await act(async () => { undoOf()!(); await new Promise((r) => setTimeout(r, 0)); });
  expect(api.addMyGuideSection).not.toHaveBeenCalled();
  expect(api.addMyGuideDay).toHaveBeenCalledWith('g', {revision: 2, at: 1, title: 'T d2'}, 'k');
  expect(api.addMyGuideDayItem.mock.calls.map((c) => [c[1], c[2].item.text, c[2].at])).toEqual([['n2', 'n a', 0], ['n2', 'n b', 1]]);
 });
});
