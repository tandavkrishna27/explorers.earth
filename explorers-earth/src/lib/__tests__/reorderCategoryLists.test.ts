import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getCompleteMyCategoryContent: vi.fn() }));
vi.mock('../explorersApiClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../explorersApiClient')>();
  return { ...actual, assertCompleteMyCategoryContent: vi.fn(), explorersApiClient: { ...actual.explorersApiClient, ...api } };
});
import { reorderCategoryLists } from '../reorderCategoryLists';

const observed = { category: 'books', revision: '7', collections: [{ id: 'a', archived: false }, { id: 'b', archived: false }, { id: 'z', archived: true }] };
const fetchMock = vi.fn();
beforeEach(() => { api.getCompleteMyCategoryContent.mockResolvedValue(observed); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('reorderCategoryLists', () => {
  it('sends the complete order with the category revision it just read', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ lists: { category: 'books', scope: 'display', categoryRevision: '8', lists: [] } }), { status: 200 }));
    await reorderCategoryLists('books', 'display', ['b', 'a']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/explorers/v1/categories/books/lists/order');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ expectedCategoryRevision: '7', scope: 'display', orderedCollectionIds: ['b', 'a'] });
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('refuses locally an order that omits a list or names an archived one, without calling the server', async () => {
    await expect(reorderCategoryLists('books', 'display', ['a'])).rejects.toMatchObject({ status: 409 });
    await expect(reorderCategoryLists('books', 'display', ['a', 'z'])).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([409, 422])('turns a %s into a reload-and-retry message', async status => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'CONFLICT', message: 'x', requestId: 'r' } }), { status }));
    await expect(reorderCategoryLists('books', 'display', ['a', 'b'])).rejects.toThrow(/changed somewhere else/);
  });
});
