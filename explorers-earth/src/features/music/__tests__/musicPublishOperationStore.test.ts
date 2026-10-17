import { describe, expect, it } from 'vitest';
import { createMusicPublishOperationStore, type PendingOperation } from '../musicPublishOperationStore';
const scope = { userDocumentId: 'user-a', accountDocumentId: 'account-a' };
const pending: PendingOperation = { version: 1, scope, mode: 'unlisted', key: 'tunes-share-v1-1777000000000-11111111-2222-4333-8444-000000000001', phase: 'publication-sent' };
function storage() {
    const items = new Map<string, string>();
    return { items, length: 0, key: () => null, clear: () => items.clear(), getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } } satisfies Storage & {
        items: Map<string, string>;
    };
}
describe('nonsecret publication pending metadata', () => {
    it('roundtrips exact owner/mode/phase/key through session storage and clears only that owner', () => {
        const disk = storage();
        const store = createMusicPublishOperationStore(disk);
        store.save(pending);
        const other = { ...pending, scope: { ...scope, accountDocumentId: 'account-b' } };
        store.save(other);
        expect(createMusicPublishOperationStore(disk).load(scope)).toEqual(pending);
        expect([...disk.items.keys()].every((key) => key.startsWith('explorers-music-publish/v1:'))).toBe(true);
        store.clear(scope);
        expect(createMusicPublishOperationStore(disk).load(scope)).toBeUndefined();
        expect(store.load(other.scope)).toEqual(other);
    });
    it('never persists capabilities, JWTs, response bodies or additional fields', () => {
        const disk = storage();
        const store = createMusicPublishOperationStore(disk);
        store.save({ ...pending, capability: 'SECRET', response: { jwt: 'SECRET' }, generation: 99 } as PendingOperation);
        expect(disk.items.size).toBe(1);
        expect(JSON.parse([...disk.items.values()][0])).toEqual(pending);
        expect([...disk.items.values()].join()).not.toContain('SECRET');
    });
    it.each([42, { toString: () => 'user-a' }])('rejects coerced non-string owner IDs', (userDocumentId) => {
        const disk = storage();
        const store = createMusicPublishOperationStore(disk);
        expect(() => store.save({ ...pending, scope: { ...scope, userDocumentId } } as PendingOperation)).toThrow('metadata is invalid');
        expect(disk.items.size).toBe(0);
    });
    it.each(['json', 'version', 'mode', 'phase', 'key', 'scope', 'extra', 'oversized'])('discards malformed %s metadata', (kind) => {
        const disk = storage();
        const store = createMusicPublishOperationStore(disk);
        store.save(pending);
        expect(disk.items.size).toBe(1);
        const key = [...disk.items.keys()][0];
        const invalid = kind === 'json' ? '{' : kind === 'oversized' ? 'x'.repeat(5000) : JSON.stringify({ ...pending,
            ...(kind === 'version' ? { version: 2 } : kind === 'mode' ? { mode: 'other' } : kind === 'phase' ? { phase: 'other' } : kind === 'key' ? { key: 'invalid' } : kind === 'scope' ? { scope: { ...scope, userDocumentId: 'foreign' } } : { capability: 'SECRET' }) });
        disk.setItem(key, invalid);
        expect(createMusicPublishOperationStore(disk).load(scope)).toBeUndefined();
        expect(disk.getItem(key)).toBeNull();
    });
    it('retains in-memory pending when storage is denied but cannot recover it in a new store', () => {
        const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } } as unknown as Storage;
        const store = createMusicPublishOperationStore(denied);
        store.save(pending);
        expect(store.load(scope)).toEqual(pending);
        expect(createMusicPublishOperationStore(denied).load(scope)).toBeUndefined();
        store.clear(scope);
        expect(store.load(scope)).toBeUndefined();
    });
});
