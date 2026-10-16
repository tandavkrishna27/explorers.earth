import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMusicPublishAdapter } from '../musicPublishAdapter';
import { createMusicWorkspaceClient } from '../musicWorkspaceClient';
import { publicMusicClient } from '../publicMusicClient';
import { createCategoryNavigationApi } from '../../navigation/categoryNavigationApi';
import { createAccountNavigationWriter } from '../../navigation/accountNavigationWriter';
import { type IntentAuthority } from '../../navigation/categoryNavigationPolicy';
import { canonicalCategoryAccount } from '../../../test/canonicalAccountFixture';
import type { AccountDto } from '../../../../tunes/shared/explorersContract';

const ACCOUNT = canonicalCategoryAccount().id;
const OTHER_ACCOUNT = '99999999-9999-4999-8999-999999999999';
const origin: IntentAuthority = { userDocumentId: 'user-a', accountDocumentId: ACCOUNT, generation: 1 };

// Local readers for the canonical account-update payload, so this suite stays free of
// the React surface harness that exports the shared versions.
type Row = { category: string; isPublic?: boolean; pinnedOrder?: number | null };
const FIELD: Record<string, string> = { places: 'public_recommendations', music: 'public_music', guides: 'public_guides',
    movies: 'public_movie', books: 'public_books', games: 'public_games', apps: 'public_apps', products: 'public_products', people: 'public_people' };
const KEY = Object.fromEntries(Object.entries(FIELD).map(([key, field]) => [field, key]));
const writtenPins = (input: { categories?: Row[] }) => ['public_profile', ...(input.categories ?? [])
    .filter(row => row.pinnedOrder !== null && row.pinnedOrder !== undefined)
    .sort((a, b) => a.pinnedOrder! - b.pinnedOrder!).map(row => FIELD[row.category])];
const writtenVisibility = (input: { categories?: Row[] }, field: string) =>
    (input.categories ?? []).find(row => row.category === KEY[field])?.isPublic;

/**
 * The navigation API reads and writes the canonical owner account; the Apollo client it
 * still accepts is documented there as never queried or mutated, so this fixture doubles
 * the canonical profile instead. Faults are expressed the way a server would express
 * them: a refused write, or a response that does not confirm what was asked for.
 */
type Fault = 'reject' | 'identity' | 'visibility' | 'pins' | 'read-identity' | 'malformed';
function fixture(fault?: Fault) {
    // Saved pins are Music then Books, with automatic pinning on.
    let account = canonicalCategoryAccount({ autoPinning: true }, ['music', 'books']);
    if (fault === 'read-identity')
        account = { ...account, id: OTHER_ACCOUNT };
    const patches: { categories?: Row[]; autoPinning?: boolean }[] = [];
    const musicRequests: unknown[] = [];
    const profile = {
        getMyProfile: async () => account,
        updateAccount: async (input: any) => {
            patches.push(input);
            if (fault === 'reject')
                throw new Error('SECRET transport detail');
            const next: AccountDto = { ...account, revision: account.revision + 1,
                categories: input.categories ? input.categories.map((row: Row) => ({ ...row })) as AccountDto['categories'] : account.categories,
                ...(input.autoPinning !== undefined ? { autoPinning: input.autoPinning } : {}) };
            account = next;
            if (fault === 'identity')
                return { ...next, id: OTHER_ACCOUNT };
            if (fault === 'visibility')
                return { ...next, categories: next.categories.map(row => row.category === 'music' ? { ...row, isPublic: false } : row) };
            if (fault === 'pins')
                return { ...next, categories: next.categories.map(row => ({ ...row, pinnedOrder: row.category === 'music' ? 0 : null })) };
            if (fault === 'malformed')
                return { ...next, categories: next.categories.map(row => ({ ...row, pinnedOrder: 0 })) };
            return next;
        },
    };
    const workspace = createMusicWorkspaceClient(async (input) => {
        musicRequests.push(input);
        return new Response(JSON.stringify(input.method === 'GET' ? { queueRevision: 0, songs: [], playedSongs: [], currentlyPlaying: null, publication: { mode: 'private', publicSlug: 'public-slug' } }
            : { version: 'music-publication/v1', publication: { mode: (input.body as {
                        mode: string;
                    }).mode, publicSlug: 'public-slug' } }));
    });
    let current = true;
    const api = createCategoryNavigationApi({ profile, isCurrent: () => current });
    const writer = createAccountNavigationWriter({ ...api, isCurrent: () => current }, profile);
    return { patches, musicRequests, workspace, writer, account: () => account, stale: () => { current = false; },
        // The adapter accepts a client but never reads it; only these ports matter here.
        adapter: (transaction: Parameters<Parameters<typeof writer.run>[1]>[0]) => createMusicPublishAdapter({ client: {} as never, workspace, scope: origin, origin, isCurrent: () => current, transaction }) };
}
describe('Music publication adapter uses the captured shared transaction', () => {
    beforeEach(() => vi.restoreAllMocks());
    it('hydrates exact scope, saved pins and parsed publication without mutations or identity provisioning', async () => {
        const f = fixture();
        const snapshot = await f.writer.run(origin, async (tx) => f.adapter(tx).read());
        expect(snapshot).toEqual({ scope: { userDocumentId: 'user-a', accountDocumentId: ACCOUNT }, profile: 'Yes', mode: 'private', publicSlug: 'public-slug', savedPins: ['public_profile', 'public_music', 'public_books'] });
        expect(f.patches).toEqual([]);
        expect(f.musicRequests).toEqual([{ method: 'GET', path: '/api/music/dashboard' }]);
    });
    // The former 'ambiguous' case gave the reader two accounts to choose between. The
    // canonical profile read returns exactly one account, so that hazard is no longer
    // representable and the case was dropped rather than simulated.
    it('rejects read-identity instead of defaulting No/Private', async () => {
        const f = fixture('read-identity');
        await expect(f.writer.run(origin, async (tx) => f.adapter(tx).read())).rejects.toThrow();
    });
    it('On sends only public_music Yes; Off fresh-reads and removes only saved Music pins even in auto mode', async () => {
        const f = fixture();
        await f.writer.run(origin, async (tx) => { const adapter = f.adapter(tx); await adapter.saveProfile('Yes'); await adapter.saveProfile('No'); });
        expect(f.patches).toHaveLength(2);
        expect(writtenVisibility(f.patches[0], 'public_music')).toBe(true);
        expect(writtenPins(f.patches[0])).toEqual(['public_profile', 'public_music', 'public_books']);
        expect(writtenVisibility(f.patches[1], 'public_music')).toBe(false);
        expect(writtenPins(f.patches[1])).toEqual(['public_profile', 'public_books']);
        expect(f.account().autoPinning).toBe(true);
        expect(writtenVisibility(f.patches[1], 'public_books')).toBe(true);
    });
    it.each(['reject', 'identity', 'visibility'] as const)('rejects %s profile confirmation before a publication call', async (fault) => {
        const f = fixture(fault);
        await expect(f.writer.run(origin, async (tx) => { const adapter = f.adapter(tx); await adapter.saveProfile('Yes'); await adapter.publish('public', 'key'); })).rejects.toThrow();
        expect(f.musicRequests).toEqual([]);
    });
    it('rejects wrong filtered-pin echo and malformed saved-pin partial cleanup', async () => {
        const f = fixture('pins');
        await expect(f.writer.run(origin, async (tx) => f.adapter(tx).saveProfile('No'))).rejects.toThrow();
        const malformed = fixture('malformed');
        await expect(malformed.writer.run(origin, async (tx) => malformed.adapter(tx).saveProfile('No'))).rejects.toThrow();
        expect(malformed.patches).toHaveLength(1);
        expect(writtenVisibility(malformed.patches[0], 'public_music')).toBe(false);
    });
    it('discovery uses the immutable account ID and rejects a different owner slug', async () => {
        const discover = vi.spyOn(publicMusicClient, 'discover').mockResolvedValue({ version: 'music-public-descriptor/v1', publication: { mode: 'public', publicSlug: 'other-slug', revision: 1 } });
        const f = fixture();
        await expect(f.writer.run(origin, async (tx) => f.adapter(tx).discover('public-slug'))).rejects.toThrow();
        expect(discover).toHaveBeenCalledWith(ACCOUNT);
    });
    it('generation invalidation blocks the next publication request', async () => {
        const f = fixture();
        await expect(f.writer.run(origin, async (tx) => { const adapter = f.adapter(tx); f.stale(); await adapter.publish('public', 'key'); })).rejects.toThrow();
        expect(f.musicRequests).toEqual([]);
    });
});
