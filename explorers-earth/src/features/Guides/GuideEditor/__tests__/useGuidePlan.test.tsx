import {act, renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
const {toast, run} = vi.hoisted(() => ({toast: {success: vi.fn(), error: vi.fn()}, run: vi.fn()}));
vi.mock('sonner', () => ({toast}));
vi.mock('../../api/guidesClient', () => ({GuidesClient: {prepareIntent: (g: {revision: number}) => ({collectionId: 'g', revision: g.revision, commandKey: 'k'}), run}}));
import {useGuidePlan} from '../useGuidePlan';

describe('useGuidePlan', () => {
 it('runs commands one at a time against the latest revision and offers Undo on move', async () => {
  const sections = [{id: 'd1'}, {id: 'd2'}];
  const start = {collectionId: 'g', revision: 1, sections} as never;
  run.mockImplementation(async (intent: {revision: number}) => ({collectionId: 'g', revision: intent.revision + 1, sections}));
  const {result} = renderHook(() => useGuidePlan(start));
  await act(async () => {
   await Promise.all([result.current.moveItem('d1', 'a', 'd2', 0, {fromIndex: 2}), result.current.setTimeLabel('d2', 'a', 'evening')]);
  });
  expect(run.mock.calls.map((c) => c[0].revision)).toEqual([1, 2]);
  expect(toast.success).toHaveBeenCalledWith('Moved to Day 2', expect.objectContaining({action: expect.objectContaining({label: 'Undo'})}));
 });
 it('snaps back and offers Retry when a command fails', async () => {
  run.mockRejectedValueOnce(new Error('offline'));
  const {result} = renderHook(() => useGuidePlan({collectionId: 'g', revision: 5, sections: []} as never));
  await act(async () => { await result.current.removeItem('d1', 'a', {index: 0, item: {kind: 'note', localId: 'a', timeLabel: null, text: 'x'}}); });
  expect(result.current.guide.revision).toBe(5);
  expect(toast.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({action: expect.objectContaining({label: 'Retry'})}));
 });
});
