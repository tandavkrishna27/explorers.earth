import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMusicPublishCoordinator, type Ports, type Snapshot } from '../musicPublishCoordinator';
import { clearMusicPublicationCommands } from '../musicPublicationCommandRegistry';
import type { OperationStore, PendingOperation } from '../musicPublishOperationStore';
import { createAccountNavigationWriter } from '../../navigation/accountNavigationWriter';
import { CATEGORY_IDS, planCategoryIntent, type IntentAuthority, type NavigationSnapshot } from '../../navigation/categoryNavigationPolicy';
import { MusicClientError } from '../../../lib/localTunesApiClient';
import type { MusicPublicationCommandResponse, MusicPublicationMode } from '../../../../../tunes/shared/musicPublicationContract';
const origin: IntentAuthority = { userDocumentId: 'user-a', accountDocumentId: 'account-a', generation: 1 };
const owner = { userDocumentId: 'user-a', accountDocumentId: 'account-a' };
function deferred<T = void>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function fixture(profile: Snapshot['profile'] = 'No', mode: MusicPublicationMode = 'private', pins: unknown = ['public_profile', 'public_books']) {
    let snapshot: Snapshot = { scope: { ...owner }, profile, mode, publicSlug: 'public-slug', savedPins: pins };
    const events: string[] = [];
    const keys: string[] = [];
    let generation = 1;
    const responses = new Map<string, MusicPublicationCommandResponse>();
    let pending: PendingOperation | undefined;
    const saved: PendingOperation[] = [];
    let reads = 0;
    const faults: {
        read?: number;
        profile?: boolean;
        publish?: boolean;
        lost?: boolean;
        discover?: boolean;
        expired?: boolean;
        publishGate?: ReturnType<typeof deferred>;
    } = {};
    const store: OperationStore = { load: () => pending && structuredClone(pending), save: (op) => { pending = structuredClone(op); saved.push(structuredClone(op)); }, clear: () => { pending = undefined; } };
    const nav = (): NavigationSnapshot => ({ scope: { ...snapshot.scope }, visibility: { ...Object.fromEntries(CATEGORY_IDS.map((id) => [id, 'Yes'])), public_music: snapshot.profile } as NavigationSnapshot['visibility'], savedPins: snapshot.savedPins, autoPinning: true });
    const writer = createAccountNavigationWriter({
        isCurrent: (authority) => authority.generation === generation && authority.userDocumentId === owner.userDocumentId && authority.accountDocumentId === owner.accountDocumentId,
        read: async () => { events.push('account:read'); return nav(); },
        commit: async (_authority, patch) => { events.push(patch.public_music === 'Yes' ? 'profile:Yes' : 'profile:No+unpin'); if (faults.profile)
            throw new Error('SECRET_PROFILE'); snapshot = { ...snapshot, profile: patch.public_music ?? snapshot.profile, savedPins: patch.pinned_nav_tabs ?? snapshot.savedPins }; return nav(); },
    });
    const create = () => createMusicPublishCoordinator((tx) => ({
        isCurrent: () => tx.isCurrent(),
        read: async () => { events.push('read'); if (++reads === faults.read)
            throw new Error('SECRET_READ'); return structuredClone(snapshot); },
        saveProfile: async (value) => {
            if (value === 'Yes') {
                await tx.commit({ public_music: 'Yes' });
                return;
            }
            const latest = await tx.read();
            const decision = planCategoryIntent(latest, { category: 'public_music', action: 'unpublish' });
            if (decision.kind === 'write') {
                await tx.commit(decision.patch);
                if (decision.cleanupPending)
                    throw new Error('cleanup');
            }
            else if (decision.kind !== 'noop')
                throw new Error('blocked');
        },
        publish: async (desired, key) => {
            events.push(`publication:${desired}`);
            keys.push(key);
            if (faults.publishGate)
                await faults.publishGate.promise;
            if (faults.expired)
                throw new MusicClientError('AUTH_UNAVAILABLE', 409, 'safe', undefined, 'PUBLICATION_REPLAY_EXPIRED');
            if (faults.publish)
                throw new Error('SECRET_PUBLICATION');
            const replay = responses.get(key);
            if (replay)
                return structuredClone(replay);
            snapshot = { ...snapshot, mode: desired };
            const response = { version: 'music-publication/v1', publication: { mode: desired, publicSlug: 'public-slug' }, ...(desired === 'unlisted' ? { capability: 'A'.repeat(43) } : {}) } as MusicPublicationCommandResponse;
            responses.set(key, response);
            if (faults.lost)
                throw new Error('SECRET_LOST_RESPONSE');
            return response;
        },
        discover: async () => { events.push('discover'); if (faults.discover)
            throw new Error('SECRET_DISCOVERY'); },
    } satisfies Ports), { ...origin }, store, writer);
    return { create, events, keys, saved, faults, store, pending: () => pending, snapshot: () => snapshot, set: (patch: Partial<Snapshot>) => { snapshot = { ...snapshot, ...patch }; }, invalidate: () => { generation++; } };
}
beforeEach(() => { clearMusicPublicationCommands(); let uuid = 0; vi.stubGlobal('crypto', { randomUUID: () => `11111111-2222-4333-8444-${String(++uuid).padStart(12, '0')}` }); });
afterEach(() => { vi.unstubAllGlobals(); clearMusicPublicationCommands(); });
describe('Music publication coordinated state', () => {
    it.each([
        ['Yes', 'public', 'published'], ['Yes', 'private', 'needs-attention'], ['Yes', 'unlisted', 'needs-attention'],
        ['No', 'public', 'needs-attention'], ['No', 'private', 'draft'], ['No', 'unlisted', 'needs-attention'],
    ] as const)('classifies %s + %s as %s without hydration writes', async (profile, mode, kind) => {
        const f = fixture(profile, mode);
        const c = f.create();
        await c.read();
        expect(c.getSnapshot()).toMatchObject({ kind, confirmed: { profile, mode } });
        expect(f.events).toEqual(['read']);
        expect(f.saved).toEqual([]);
    });
    it.each(['failed', 'wrong-owner', 'missing-mode'] as const)('unknown %s read cannot become confirmed Private', async (bad) => {
        const f = fixture();
        if (bad === 'failed')
            f.faults.read = 1;
        if (bad === 'wrong-owner')
            f.set({ scope: { ...owner, accountDocumentId: 'other' } });
        if (bad === 'missing-mode')
            f.set({ mode: undefined as never });
        const c = f.create();
        await c.read();
        expect(c.getSnapshot().kind).toBe('unknown');
        expect(c.getSnapshot().confirmed).toBeUndefined();
        expect(f.keys).toEqual([]);
    });
    it('On profile Yes precedes Public; Off Private precedes fresh saved-pin cleanup', async () => {
        const f = fixture();
        const c = f.create();
        expect(await c.request('public')).toMatchObject({ status: 'verified' });
        expect(f.events).toEqual(['read', 'profile:Yes', 'publication:public', 'read', 'discover']);
        f.set({ savedPins: ['public_profile', 'public_music', 'public_books'] });
        expect(await c.request('private')).toMatchObject({ status: 'verified' });
        expect(f.events.slice(-6)).toEqual(['read', 'publication:private', 'read', 'account:read', 'profile:No+unpin', 'read']);
        expect(f.snapshot().savedPins).toEqual(['public_profile', 'public_books']);
        expect(c.getSnapshot().kind).toBe('draft');
        expect(f.pending()).toBeUndefined();
    });
    it('No+Private still cleans stale saved Music pins, including auto mode', async () => {
        const f = fixture('No', 'private', ['public_profile', 'public_music', 'public_books']);
        const c = f.create();
        await c.read();
        expect(c.getSnapshot().kind).toBe('needs-attention');
        expect(await c.request('private')).toMatchObject({ status: 'verified' });
        expect(f.snapshot().savedPins).toEqual(['public_profile', 'public_books']);
        expect(f.events).toContain('profile:No+unpin');
    });
    it.each([['Yes', 'public'], ['No', 'private']] as const)('fresh matching %s+%s skips writes but Public still verifies discovery', async (profile, mode) => {
        const f = fixture(profile, mode);
        const c = f.create();
        expect(await c.request(mode)).toEqual({ status: 'verified' });
        expect(f.events).toEqual(mode === 'public' ? ['read', 'discover'] : ['read']);
        expect(f.saved).toEqual([]);
    });
    it('explicit Unlisted cleans profile/pins before its capability command; capability is outcome-only', async () => {
        const f = fixture('Yes', 'public', ['public_profile', 'public_music', 'public_books']);
        const c = f.create();
        const states: unknown[] = [];
        c.subscribe(() => states.push(c.getSnapshot()));
        const result = await c.request('unlisted');
        expect(result).toMatchObject({ status: 'verified', response: { capability: 'A'.repeat(43) } });
        expect(f.events).toEqual(['read', 'account:read', 'profile:No+unpin', 'publication:unlisted', 'read']);
        expect(JSON.stringify(states) + JSON.stringify(f.saved)).not.toContain('A'.repeat(43));
        expect(f.pending()).toBeUndefined();
    });
    it.each(['read', 'profile', 'publish', 'verification', 'discover'] as const)('On %s failure is not success and never leaks upstream details', async (stage) => {
        const f = fixture();
        if (stage === 'read')
            f.faults.read = 1;
        if (stage === 'profile')
            f.faults.profile = true;
        if (stage === 'publish')
            f.faults.publish = true;
        if (stage === 'verification')
            f.faults.read = 2;
        if (stage === 'discover')
            f.faults.discover = true;
        const c = f.create();
        expect((await c.request('public')).status).not.toBe('verified');
        expect(c.getSnapshot().kind).not.toBe('published');
        expect(JSON.stringify(c.getSnapshot()) + JSON.stringify(f.saved)).not.toContain('SECRET');
        if (stage === 'profile')
            expect(f.keys).toEqual([]);
    });
    it('failed Private never clears profile or presents successful Off', async () => {
        const f = fixture('Yes', 'public');
        f.faults.publish = true;
        const c = f.create();
        expect((await c.request('private')).status).not.toBe('verified');
        expect(c.getSnapshot().kind).not.toBe('draft');
        expect(f.events).not.toContain('profile:No+unpin');
    });
    it('Private success plus profile failure is safe-but-unsynced, with no republish compensation', async () => {
        const f = fixture('Yes', 'public');
        f.faults.profile = true;
        const c = f.create();
        expect(await c.request('private')).toEqual({ status: 'needs-attention' });
        expect(c.getSnapshot()).toMatchObject({ kind: 'needs-attention', errorCode: 'profile-save', confirmed: { mode: 'private', profile: 'Yes' } });
        expect(f.events).not.toContain('publication:public');
        expect(f.pending()).toBeDefined();
    });
    it('Private replay cannot clear profile or pins when another device restored Public after the lost response', async () => {
        const pins = ['public_profile', 'public_music', 'public_books'];
        const f = fixture('Yes', 'public', pins);
        f.faults.lost = true;
        const c = f.create();
        expect(await c.request('private')).toEqual({ status: 'unknown' });
        const key = f.pending()!.key;
        expect(f.pending()!.phase).toBe('publication-sent');
        f.set({ mode: 'public' });
        f.faults.lost = false;
        const before = f.events.length;
        expect(await c.resume()).toEqual({ status: 'conflict' });
        expect(f.snapshot()).toMatchObject({ mode: 'public', profile: 'Yes', savedPins: pins });
        expect(f.events.slice(before)).toEqual(['read', 'publication:private', 'read']);
        expect(f.keys).toEqual([key, key]);
        expect(f.pending()!.key).toBe(key);
    });
    it('failed current-privacy read after Private prevents profile cleanup and retains pending metadata', async () => {
        const pins = ['public_profile', 'public_music', 'public_books'];
        const f = fixture('Yes', 'public', pins);
        f.faults.read = 2;
        const c = f.create();
        expect(await c.request('private')).toEqual({ status: 'unknown' });
        expect(f.snapshot()).toMatchObject({ mode: 'private', profile: 'Yes', savedPins: pins });
        expect(f.events).toEqual(['read', 'publication:private', 'read']);
        expect(f.pending()).toBeDefined();
        expect(c.getSnapshot()).toEqual({ kind: 'unknown', confirmed: undefined, desired: 'private', errorCode: 'verification' });
    });
    it('lost response retains metadata; explicit same-key replay precedes registry completion', async () => {
        const f = fixture();
        f.faults.lost = true;
        const c = f.create();
        expect((await c.request('public')).status).not.toBe('verified');
        const key = f.pending()!.key;
        f.faults.lost = false;
        const reloaded = f.create();
        await reloaded.read();
        expect(f.keys).toEqual([key]);
        expect(f.pending()).toBeDefined();
        expect(await reloaded.resume()).toMatchObject({ status: 'verified' });
        expect(f.keys).toEqual([key, key]);
        expect(f.pending()).toBeUndefined();
    });
    it('same-key replay reports its old result without reapplying it; conflicting current mode is not success', async () => {
        const f = fixture();
        f.faults.lost = true;
        const c = f.create();
        await c.request('public');
        const key = f.pending()!.key;
        // Another device changes only the Music mode after the lost response committed.
        f.set({ mode: 'private' });
        f.faults.lost = false;
        expect(await c.resume()).toEqual({ status: 'conflict' });
        expect(f.keys).toEqual([key, key]);
        expect(f.snapshot().mode).toBe('private');
        expect(f.pending()!.key).toBe(key);
    });
    it('a lost Public response plus contradictory profile state blocks Resume before any new write', async () => {
        const f = fixture();
        f.faults.lost = true;
        const c = f.create();
        await c.request('public');
        const key = f.pending()!.key;
        f.set({ profile: 'No', mode: 'private' });
        f.faults.lost = false;
        const before = f.events.length;
        expect(await c.resume()).toEqual({ status: 'conflict' });
        expect(f.events.slice(before)).toEqual(['read']);
        expect(f.pending()!.key).toBe(key);
    });
    it('double click coalesces one complete writer transaction and stable command key', async () => {
        const f = fixture();
        f.faults.publishGate = deferred();
        const c = f.create();
        const first = c.request('public');
        const second = c.request('public');
        await vi.waitFor(() => expect(f.keys).toHaveLength(1));
        f.faults.publishGate.resolve();
        expect((await first).status).toBe('verified');
        expect((await second).status).toBe('verified');
        expect(f.keys).toHaveLength(1);
    });
    it.each(['dispose', 'switch'] as const)('%s discards a late capability and prevents later profile/UI success', async (change) => {
        const f = fixture();
        f.faults.publishGate = deferred();
        const c = f.create();
        const request = c.request('unlisted');
        await vi.waitFor(() => expect(f.keys).toHaveLength(1));
        if (change === 'dispose')
            c.dispose();
        else
            f.invalidate();
        f.faults.publishGate.resolve();
        expect(await request).toEqual({ status: 'unknown' });
        expect(c.getSnapshot().kind).not.toBe('published');
        expect(f.pending()).toBeDefined();
    });
    it('disposal from the completion notification discards the verified capability outcome', async () => {
        const f = fixture();
        const c = f.create();
        let completionObserved = false;
        c.subscribe(() => {
            if (c.getSnapshot().kind === 'needs-attention' && c.getSnapshot().confirmed?.mode === 'unlisted') {
                completionObserved = true;
                c.dispose();
            }
        });
        const outcome = await c.request('unlisted');
        expect(completionObserved).toBe(true);
        expect(outcome).toEqual({ status: 'unknown' });
        expect(JSON.stringify(outcome)).not.toContain('A'.repeat(43));
        expect(c.getSnapshot()).toEqual({ kind: 'unknown', errorCode: 'scope-changed' });
    });
    it('expired replay is actionable: read/resume do not rotate; explicit confirmed request does', async () => {
        const f = fixture();
        f.faults.expired = true;
        const c = f.create();
        expect(await c.request('public')).toEqual({ status: 'conflict' });
        const key = f.pending()!.key;
        expect(c.getSnapshot()).toMatchObject({ kind: 'conflict', errorCode: 'replay-expired' });
        await c.read();
        expect(c.getSnapshot().kind).toBe('conflict');
        await c.resume();
        expect(new Set(f.keys)).toEqual(new Set([key]));
        f.faults.expired = false;
        expect(await c.request('public')).toMatchObject({ status: 'verified' });
        expect(f.keys.at(-1)).not.toBe(key);
    });
    it('a different requested mode first surfaces conflict; only the next explicit confirmation replaces it', async () => {
        const f = fixture();
        f.faults.publish = true;
        const c = f.create();
        await c.request('public');
        const key = f.pending()!.key;
        expect(await c.request('private')).toEqual({ status: 'conflict' });
        expect(f.pending()!.key).toBe(key);
        f.faults.publish = false;
        expect((await c.request('private')).status).toBe('verified');
        expect(f.keys.at(-1)).not.toBe(key);
    });
    it('failed fresh confirmation read and scope switch retain the old pending key without writes', async () => {
        const f = fixture();
        f.faults.expired = true;
        const c = f.create();
        await c.request('public');
        const key = f.pending()!.key;
        f.faults.read = f.events.filter((e) => e === 'read').length + 1;
        await c.request('private');
        expect(f.pending()!.key).toBe(key);
        const count = f.keys.length;
        f.invalidate();
        await c.request('private');
        expect(f.keys.length).toBe(count);
        expect(f.pending()!.key).toBe(key);
    });
    it('an invalidated generation cannot republish an old conflict snapshot through read', async () => {
        const f = fixture(); f.faults.expired = true;
        const c = f.create(); await c.request('public'); const key = f.pending()!.key;
        expect(c.getSnapshot().confirmed).toBeDefined();
        f.invalidate(); await c.read();
        expect(c.getSnapshot()).toEqual({ kind: 'unknown', errorCode: 'scope-changed' });
        expect(f.pending()!.key).toBe(key);
    });
    it('two-tab contradiction after a verified response stays conflict until explicit resolution', async () => {
        const f = fixture();
        f.faults.discover = true;
        const c = f.create();
        await c.request('public');
        const key = f.pending()!.key;
        f.set({ profile: 'No', mode: 'private' });
        await c.read();
        expect(c.getSnapshot().kind).toBe('conflict');
        await c.resume();
        expect(f.pending()!.key).toBe(key);
        expect(f.keys).toEqual([key]);
    });
    it('a delayed older cross-device Public may win after verified Private; no global latest-intent guarantee', async () => {
        const f = fixture('Yes', 'public');
        const c = f.create();
        expect((await c.request('private')).status).toBe('verified');
        expect(c.getSnapshot().kind).toBe('draft');
        // Independent remote command arrives later: backend locks serialize commits, not human intent.
        f.set({ mode: 'public' });
        await c.read();
        expect(c.getSnapshot()).toMatchObject({ kind: 'needs-attention', confirmed: { profile: 'No', mode: 'public' } });
        expect(f.events.filter((e) => e.startsWith('publication:'))).toEqual(['publication:private']);
    });
});
