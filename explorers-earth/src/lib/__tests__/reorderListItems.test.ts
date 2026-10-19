import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getCompleteMyCategoryContent: vi.fn(), reorderMyCollection: vi.fn() }));
vi.mock('../explorersApiClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../explorersApiClient')>();
  return { ...actual, assertCompleteMyCategoryContent: vi.fn(), explorersApiClient: { ...actual.explorersApiClient, ...api } };
});

import { ExplorersApiError } from '../explorersApiClient';
import { reorderListItems } from '../reorderListItems';

beforeEach(() => { api.getCompleteMyCategoryContent.mockReset(); api.reorderMyCollection.mockReset(); });

describe('reorderListItems', () => {
  it('composes the write against a fresh complete read of the same category, with a new command key', async () => {
    const observed = { category: 'books', complete: true };
    api.getCompleteMyCategoryContent.mockResolvedValue(observed);
    api.reorderMyCollection.mockResolvedValue({ id: 'l1' });
    await reorderListItems('books', 'l1', ['b', 'a']);
    expect(api.getCompleteMyCategoryContent).toHaveBeenCalledWith({ category: 'books', status: 'active' }, undefined);
    const [seen, list, ids, key] = api.reorderMyCollection.mock.calls[0];
    expect(seen).toBe(observed);
    expect([list, ids]).toEqual(['l1', ['b', 'a']]);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    await reorderListItems('books', 'l1', ['a', 'b']);
    expect(api.reorderMyCollection.mock.calls[1][3]).not.toBe(key);
  });

  it('refuses to write against a read of a different category', async () => {
    api.getCompleteMyCategoryContent.mockResolvedValue({ category: 'movies' });
    await expect(reorderListItems('books', 'l1', ['a'])).rejects.toMatchObject({ status: 409 });
    expect(api.reorderMyCollection).not.toHaveBeenCalled();
  });

  it.each([409, 422])('turns a %s from the server into a reload-and-retry message', async status => {
    api.getCompleteMyCategoryContent.mockResolvedValue({ category: 'apps' });
    api.reorderMyCollection.mockRejectedValue(new ExplorersApiError(status, 'CONFLICT', 'Stale'));
    await expect(reorderListItems('apps', 'l1', ['a'])).rejects.toThrow(/changed somewhere else/);
  });

  it('passes other failures through untouched', async () => {
    api.getCompleteMyCategoryContent.mockResolvedValue({ category: 'apps' });
    const failure = new ExplorersApiError(503, 'UNAVAILABLE', 'Down');
    api.reorderMyCollection.mockRejectedValue(failure);
    await expect(reorderListItems('apps', 'l1', ['a'])).rejects.toBe(failure);
  });
});
