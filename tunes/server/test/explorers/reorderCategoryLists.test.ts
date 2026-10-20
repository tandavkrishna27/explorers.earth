import { describe, expect, it } from 'vitest';
import { categoryListsOrderResultSchema, reorderCategoryListsSchema } from '../../../shared/explorersContract';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ok = { expectedCategoryRevision: '4', scope: 'display', orderedCollectionIds: [id(1), id(2)] };

describe('reorderCategoryListsSchema', () => {
  it('accepts a complete order for either scope and lower-cases ids', () => {
    expect(reorderCategoryListsSchema.parse(ok).orderedCollectionIds).toEqual([id(1), id(2)]);
    expect(reorderCategoryListsSchema.parse({ ...ok, scope: 'pinned', orderedCollectionIds: [id(1).toUpperCase()] }).orderedCollectionIds).toEqual([id(1)]);
  });
  it.each([
    ['no ids', { orderedCollectionIds: [] }],
    ['a repeated id', { orderedCollectionIds: [id(1), id(1)] }],
    ['a non-uuid id', { orderedCollectionIds: ['x'] }],
    ['an unknown scope', { scope: 'all' }],
    ['a non-canonical revision', { expectedCategoryRevision: '04' }],
    ['a numeric revision', { expectedCategoryRevision: 4 }],
    ['a missing revision', { expectedCategoryRevision: undefined }],
    ['an unexpected field', { accountId: id(9) }],
  ])('refuses %s', (_name, patch) => {
    expect(reorderCategoryListsSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
  it('bounds the order at a thousand lists', () => {
    const many = Array.from({ length: 1001 }, (_, i) => id(i + 1));
    expect(reorderCategoryListsSchema.safeParse({ ...ok, orderedCollectionIds: many }).success).toBe(false);
  });
});

describe('categoryListsOrderResultSchema', () => {
  it('describes dense positions', () => {
    expect(categoryListsOrderResultSchema.parse({ category: 'books', scope: 'display', categoryRevision: '5', lists: [{ id: id(1), position: 0 }] }).lists[0].position).toBe(0);
    expect(categoryListsOrderResultSchema.safeParse({ category: 'music', scope: 'display', categoryRevision: '5', lists: [{ id: id(1), position: 0 }] }).success).toBe(false);
  });
});
