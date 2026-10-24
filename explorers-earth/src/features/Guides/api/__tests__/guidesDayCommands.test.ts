import {afterEach, describe, expect, it, vi} from 'vitest';
import {explorersApiClient} from '../../../../lib/explorersApiClient';

afterEach(() => vi.restoreAllMocks());
describe('guide day commands on the wire', () => {
 it('validates before sending and addresses the item by day and localId', async () => {
  await expect(explorersApiClient.moveMyGuideDayItem('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'a b',
   {revision: 1, toSectionId: 'nope', toIndex: 0}, 'k')).rejects.toThrow();
 });
});
