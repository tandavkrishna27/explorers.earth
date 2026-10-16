import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useAuthStore from '../../../store/store';
import { CategoryNavigationProvider, useAccountNavigationWriter, useCategoryNavigation } from '../CategoryNavigationProvider';
import { explorersApiClient } from '../../../lib/explorersApiClient';
import { canonicalAccountFixture } from '../../../test/canonicalAccountFixture';
import type { MusicPinVerifier, NavigationOutcome } from '../accountNavigationWriter';
import type { GenericNavigationIntent } from '../categoryNavigationPolicy';

const publishPublicProfileInvalidation = vi.hoisted(() => vi.fn());
vi.mock('../../PublicHome/api/publicProfileInvalidation', () => ({ publishPublicProfileInvalidation }));

function account(extra = {}) { return { __typename: 'Account', documentId: 'a1', Account_Name: 'Owner', Account_Type: 'Personal', mobile_number: '123', public_profile: 'Yes', public_music: 'Yes', public_recommendations: 'Yes', public_guides: 'Yes', public_movie: 'Yes', public_books: 'Yes', public_games: 'Yes', public_apps: 'Yes', public_products: 'Yes', public_people: 'Yes', auto_pinning: false, pinned_nav_tabs: ['public_profile', 'public_music'], ...extra }; }
const ownerId = '11111111-1111-4111-8111-111111111111';
const login = (id = 'u1', accountId = ownerId) => { const generation = useAuthStore.getState().beginVerification(); useAuthStore.getState().acceptVerified(generation, { id: accountId, userId: id, username: 'owner', email: 'owner@example.test', onboardingStatus: 'complete', revision: 1 }); };
const keys = ['places','music','guides','movies','books','games','apps','products','people'] as const;
const fields = ['public_recommendations','public_music','public_guides','public_movie','public_books','public_games','public_apps','public_products','public_people'] as const;
function dto(saved: ReturnType<typeof account>, revision: number) { return canonicalAccountFixture({ id: saved.documentId === 'a1' ? ownerId : saved.documentId, revision, autoPinning: saved.auto_pinning, categories: keys.map((category, displayOrder) => ({ category, displayOrder, isPublic: saved[fields[displayOrder]] === 'Yes', pinnedOrder: Array.isArray(saved.pinned_nav_tabs) && saved.pinned_nav_tabs.includes(fields[displayOrder]) ? saved.pinned_nav_tabs.indexOf(fields[displayOrder]) - 1 : null })) }); }
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };

function harness(options: { consumer?: boolean; verifyMusicPin?: MusicPinVerifier; initial?: object; failReads?: boolean } = {}) {
  let saved = account(options.initial);
  let failMutation = false; let failReads = options.failReads ?? false; let failContent = false; let failReadsAfterMutation = false;
  let pauseRead: Promise<void> | undefined;
  let pauseMutation: Promise<void> | undefined;
  let providerKey = 0;
  const requests: { name: string; variables: Record<string, any> }[] = [];
  let value!: ReturnType<typeof useCategoryNavigation>;
  let shared!: ReturnType<typeof useAccountNavigationWriter>;
  let revision = 1;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(failContent)throw new Error('Unavailable owner content');
    const category=new URL(url,'http://localhost').searchParams.get('category')!;
    return new Response(JSON.stringify({version:'explorers-owner-content/v2',snapshot:'1',snapshotToken:'opaque',expiresAt:Date.now()+600000,nextCursor:null,items:[{id:'00000000-0000-4000-8000-000000000001',accountId:useAuthStore.getState().accountId,category,title:'Native list',slug:'native-list',visibility:'public',publicationState:'published',revision:1,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:0}]}),{headers:{'Content-Type':'application/json'}});
  }));
  vi.spyOn(explorersApiClient, 'getMyProfile').mockImplementation(async () => {
    requests.push({ name: 'GetMyProfile', variables: {} });
    const paused = pauseRead; pauseRead = undefined; if (paused) await paused;
    if (failReads) throw new Error('Account unavailable');
    return dto(saved, revision);
  });
  vi.spyOn(explorersApiClient, 'updateAccount').mockImplementation(async (input) => {
    requests.push({ name: 'UpdateAccount', variables: { input } });
    const paused = pauseMutation; pauseMutation = undefined; if (paused) await paused;
    if (input.categories) {
      for (const row of input.categories) saved = { ...saved, [fields[keys.indexOf(row.category)]]: row.isPublic ? 'Yes' : 'No' };
      saved = { ...saved, pinned_nav_tabs: ['public_profile', ...input.categories.filter(row => row.pinnedOrder !== null).sort((a,b) => a.pinnedOrder! - b.pinnedOrder!).map(row => fields[keys.indexOf(row.category)])] };
    }
    if (input.autoPinning !== undefined) saved = { ...saved, auto_pinning: input.autoPinning };
    revision++;
    if (failReadsAfterMutation) failReads = true;
    if (failMutation) throw new Error('Lost response');
    return dto(saved, revision);
  });
  function Consumer() { value = useCategoryNavigation(); shared = useAccountNavigationWriter(); return <div>{value.snapshot?.scope.accountDocumentId ?? 'loading'}</div>; }
  const tree = (active: boolean) => <CategoryNavigationProvider key={providerKey} verifyMusicPin={options.verifyMusicPin}>{active ? <Consumer /> : <div>unrelated</div>}</CategoryNavigationProvider>;
  const rendered = render(tree(options.consumer !== false));
  return { requests, get value() { return value; }, get shared() { return shared; },
    get saved() { return saved; }, set saved(next) { saved = next; },
    set failReads(next: boolean) { failReads = next; }, set failMutation(next: boolean) { failMutation = next; }, set failContent(next: boolean) { failContent = next; },
    set failReadsAfterMutation(next: boolean) { failReadsAfterMutation = next; },
    pauseNextRead(pause: Promise<void>) { pauseRead = pause; },
    pauseNextMutation(pause: Promise<void>) { pauseMutation = pause; },
    remount() { providerKey++; rendered.rerender(tree(true)); },
    active(next: boolean) { rendered.rerender(tree(next)); }, unmount: rendered.unmount,
    ready: () => waitFor(() => expect(value?.authority).toBeDefined()),
    async request(intent: GenericNavigationIntent) { let result!: NavigationOutcome; await act(async () => { result = await value.request(intent, value.authority!); }); return result; },
  };
}

describe('CategoryNavigationProvider', () => {
  beforeEach(() => { login(); publishPublicProfileInvalidation.mockReset(); });
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('publishes exactly native content counts bound to current authority', async () => {
    const h=harness();
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({version:'explorers-owner-content/v2',snapshot:'1',snapshotToken:'opaque',expiresAt:Date.now()+600000,items:[],nextCursor:null}),{headers:{'Content-Type':'application/json'}})));
    await h.ready(); await waitFor(()=>expect(h.value.content?.counts).toEqual({public_books:0,public_movie:0,public_games:0}));
    expect(Object.keys(h.value.content!)).toEqual(['counts','eligibility']);
    expect(h.value.content?.eligibility.public_apps).toBe('unknown');
    act(()=>useAuthStore.getState().logout()); expect(h.value.content).toBeUndefined();
  });
  it('permits a new native pin when complete content is unavailable', async () => {
    // Placement no longer consults content, so an unavailable content read cannot
    // take the owner's pin control away from them.
    const h=harness(); h.failContent=true; await h.ready();
    expect((await h.request({category:'public_books',action:'pin'})).kind).toBe('confirmed');
    expect(h.saved.pinned_nav_tabs).toContain('public_books');
  });
  it.each(['public_books','public_movie','public_games'] as const)('publishes and pins %s with complete native authority', async category => {
    const h=harness({initial:{[category]:'No'}});await h.ready();
    expect((await h.request({category,action:'publish'})).kind).toBe('confirmed');
    expect((await h.request({category,action:'pin'})).kind).toBe('confirmed');
    expect(h.saved.pinned_nav_tabs).toContain(category);
  });
  it.each(['public_recommendations','public_guides','public_apps','public_products','public_people'] as const)('allows %s visibility and a new pin for an unbuilt category', async category=>{
    const h=harness();await h.ready();
    // Both controls are the owner's declared intent and neither depends on current
    // inventory, or our own missing backend presents as the owner's controls being
    // broken. This fixture is already public, so publish confirms as a no-op.
    expect((await h.request({category,action:'publish'})).kind).toBe('confirmed');
    expect((await h.request({category,action:'pin'})).kind).toBe('confirmed');
    expect(h.saved[category]).toBe('Yes');
    expect(h.saved.pinned_nav_tabs).toContain(category);
  });
  it.each(['public_recommendations','public_guides','public_apps','public_products','public_people'] as const)('writes %s visibility on for an unbuilt category', async category=>{
    const h=harness({initial:{[category]:'No'}});await h.ready();
    expect((await h.request({category,action:'publish'})).kind).toBe('confirmed');
    expect(h.saved[category]).toBe('Yes');
  });
  it.each(fields)('safe hide and unpin remains available for %s on owner-content outage',async category=>{
    const h=harness({initial:{pinned_nav_tabs:['public_profile',category]}});h.failContent=true;await h.ready();
    expect((await h.request({category,action:'unpin'})).kind).toBe('confirmed');
    // Music publication remains owned by its separate coordinator.
    if(category!=='public_music')expect((await h.request({category,action:'unpublish'})).kind).toBe('confirmed');
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile']);
  });
  it('permits a new native pin when the owner has no content yet',async()=>{
    const h=harness();vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({version:'explorers-owner-content/v2',snapshot:'1',snapshotToken:'opaque',expiresAt:Date.now()+600000,items:[],nextCursor:null}),{headers:{'Content-Type':'application/json'}})));await h.ready();
    expect((await h.request({category:'public_books',action:'pin'})).kind).toBe('confirmed');
    expect(h.saved.pinned_nav_tabs).toContain('public_books');
  });
  it('a delayed earlier content read cannot overwrite a newer refresh',async()=>{
    const h=harness();const pause=deferred();let first=true;
    vi.stubGlobal('fetch',vi.fn(async()=>{if(first){first=false;await pause.promise;}return new Response(JSON.stringify({version:'explorers-owner-content/v2',snapshot:'1',snapshotToken:'opaque',expiresAt:Date.now()+600000,items:[],nextCursor:null}),{headers:{'Content-Type':'application/json'}});}));
    await h.ready();await act(async()=>{await h.value.refresh();});
    const content=h.value.content;expect(content?.counts.public_books).toBe(0);
    await act(async()=>{pause.resolve();await Promise.resolve();});expect(h.value.content).toBe(content);
  });
  it('uses distinct verified auth and account IDs with cookie profile authority', async () => {
    const h = harness(); await waitFor(() => expect(h.value.authority || h.value.error).toBeDefined());
    expect(h.value.authority).toMatchObject({ userDocumentId: 'u1', accountDocumentId: ownerId });
    expect(h.value.snapshot?.revision).toBe(1);
    expect(h.requests.map(r => r.name)).toEqual(['GetMyProfile']);
  });
  it.each(['active-incomplete', 'loading', 'error', 'terminal', 'recovery-only'] as const)('does not grant navigation authority in %s sessions', async status => {
    useAuthStore.setState({ status }); const h = harness();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(h.requests).toEqual([]); expect(h.value.authority).toBeUndefined();
  });
  it('invalidates immediately on suspension and rejects old prompts without a write', async () => {
    const h = harness(); await h.ready(); const origin = h.value.authority!;
    await act(async () => { useAuthStore.getState().updateUserBlocked(true); });
    expect(h.value.authority).toBeUndefined();
    let result!: NavigationOutcome; await act(async () => { result = await h.value.request({ category: 'public_books', action: 'pin' }, origin); });
    expect(result.kind).toBe('blocked'); expect(h.requests.some(r => r.name === 'UpdateAccount')).toBe(false);
  });
  it('rejects foreign profile DTO without granting authority or writing', async () => {
    const h = harness({ initial: { documentId: '22222222-2222-4222-8222-222222222222' } });
    await waitFor(() => expect(h.value.error).toBeDefined());
    expect(h.value.authority).toBeUndefined(); expect(h.requests.some(r => r.name === 'UpdateAccount')).toBe(false);
  });
  it('discards a delayed refresh from an earlier A-B-A generation', async () => {
    const h = harness(); await h.ready(); const origin = h.value.authority!;
    const pause = deferred(); h.pauseNextRead(pause.promise);
    await act(async () => { void h.value.refresh(); await Promise.resolve(); login('u2'); login(); });
    await h.ready(); const current = h.value.authority!;
    expect(current.generation).not.toBe(origin.generation);
    await act(async () => { pause.resolve(); });
    expect(h.value.authority).toEqual(current); expect(h.value.snapshot?.scope.userDocumentId).toBe('u1');
  });
  it('checks currentness after delayed Music verification before admitting a pin', async () => {
    const pause = deferred(); let started = false;
    const h = harness({ initial: { pinned_nav_tabs: ['public_profile'] }, verifyMusicPin: async () => { started = true; await pause.promise; return 'public'; } });
    await h.ready(); let pending!: Promise<NavigationOutcome>;
    await act(async () => { pending = h.value.request({ category: 'public_music', action: 'pin' }, h.value.authority!); });
    await waitFor(() => expect(started).toBe(true));
    await act(async () => { login('u2'); login(); pause.resolve(); await pending; });
    expect((await pending).kind).toBe('blocked'); expect(h.requests.some(r => r.name === 'UpdateAccount')).toBe(false);
  });
  it('fences an admitted write response across A-B-A without publishing its old success', async () => {
    const h = harness(); await h.ready(); const pause = deferred(); h.pauseNextMutation(pause.promise);
    let pending!: Promise<NavigationOutcome>;
    await act(async () => { pending = h.value.request({ category: 'public_books', action: 'pin' }, h.value.authority!); });
    await waitFor(() => expect(h.requests.filter(r => r.name === 'UpdateAccount')).toHaveLength(1));
    await act(async () => { login('u2'); login(); }); await h.ready();
    expect(h.value.snapshot?.savedPins).toEqual(['public_profile', 'public_music']);
    await act(async () => { pause.resolve(); await pending; });
    expect((await pending).kind).toBe('blocked');
    expect(h.value.snapshot?.savedPins).toEqual(['public_profile', 'public_music']);
    expect(publishPublicProfileInvalidation).not.toHaveBeenCalled();
    expect(h.value).toMatchObject({ busy: false, pending: [] });
  });
  it('a stale peer event after logout cannot grant authority or trigger a profile read', async () => {
    const h = harness(); await h.ready(); const before = h.requests.length;
    await act(async () => { useAuthStore.getState().logout(); window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-category-navigation', newValue: JSON.stringify({ version: 'category-navigation/v1', kind: 'changed', eventId: 'old-session', scope: { userDocumentId: 'u1', accountDocumentId: ownerId } }) })); });
    expect(h.value.authority).toBeUndefined(); expect(h.requests).toHaveLength(before);
  });
  it('malformed canonical pin orders fail closed without rewriting saved preferences', async () => {
    const h = harness(); h.saved = account({ pinned_nav_tabs: ['public_profile','public_music','public_music'] });
    vi.spyOn(explorersApiClient, 'getMyProfile').mockResolvedValue({ ...dto(h.saved, 1), categories: dto(h.saved, 1).categories.map(row => row.category === 'books' ? { ...row, pinnedOrder: 0 } : row) });
    await act(async () => { await h.value.refresh(); });
    await waitFor(() => expect(h.value.error).toBeDefined());
    expect(h.value.authority).toBeUndefined(); expect(h.requests.some(r => r.name === 'UpdateAccount')).toBe(false);
  });
  it('keeps category writes disabled and names the category outage without questioning the verified session', async () => {
    const h = harness({ failReads: true });
    await waitFor(() => expect(h.value.error).toBe('Category settings could not be loaded. Refresh to try again.'));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(h.value.authority).toBeUndefined();
    expect(h.requests.map((request) => request.name)).toEqual(['GetMyProfile']);
  });

  it('is inert on unrelated routes and fresh-reads when a consumer enters', async () => {
    const h = harness({ consumer: false });
    await act(async () => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
    expect(h.requests).toEqual([]);
    h.active(true); await h.ready(); expect(h.value.snapshot?.savedPins).toEqual(['public_profile', 'public_music']);
  });
  it('appends a new native pin on owner-content outage without disturbing stored preferences', async () => {
    const h = harness(); await h.ready(); h.failContent = true;
    h.saved = account({ pinned_nav_tabs: ['public_profile', 'public_music', 'public_guides'] });
    expect((await h.request({ category: 'public_books', action: 'pin' })).kind).toBe('confirmed');
    // The existing placements are preserved and the new one is appended, never
    // reordered or replaced, even while content reads are failing.
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_guides', 'public_books']);
    expect(h.requests.some((r) => r.name === 'CheckPublishedLists')).toBe(false);
  });
  it.each([
    { category: 'public_music', action: 'publish' }, { category: 'public_music', action: 'unpublish' },
    { category: 'public_profile', action: 'unpin' }, { category: 'public_books', action: 'erase' },
  ])('runtime rejects $category $action before acquiring the writer or reading', async (intent) => {
    const h = harness(); await h.ready(); const before = h.requests.length;
    const acquisition = vi.spyOn(h.shared.writer, 'run');
    expect((await h.request(intent as GenericNavigationIntent)).kind).toBe('blocked');
    expect(acquisition).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(before);
  });
  it.each(['missing', 'private', 'unlisted', 'outage'] as const)('fails closed for Music pin with %s verification', async (mode) => {
    const h = harness({ verifyMusicPin: mode === 'missing' ? undefined : async () => { if (mode === 'outage') throw new Error('Unavailable'); return 'not-public'; } });
    await h.ready(); h.saved = account({ pinned_nav_tabs: ['public_profile'] });
    expect((await h.request({ category: 'public_music', action: 'pin' })).kind).toBe('blocked');
    expect(h.requests.some((r) => r.name === 'UpdateAccount')).toBe(false);
  });
  it('passes the held transaction to Music verification without a nested lock', async () => {
    const h = harness({ initial: { pinned_nav_tabs: ['public_profile'] }, verifyMusicPin: async (tx, origin) => {
      const current = await tx.read(); return current.scope.accountDocumentId === origin.accountDocumentId && tx.isCurrent() ? 'public' : 'unknown';
    } });
    await h.ready(); expect((await h.request({ category: 'public_music', action: 'pin' })).kind).toBe('confirmed');
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music']);
  });
  it('keeps visibility and placement available through a content outage', async () => {
    const h = harness({ initial: { public_books: 'No' } }); h.failContent=true; await h.ready();
    // An owner-content outage no longer costs the owner either control: neither
    // decision reads content, so a failing content read cannot block them.
    expect((await h.request({ category: 'public_books', action: 'publish' })).kind).toBe('confirmed');
    expect(h.saved.public_books).toBe('Yes');
    h.failContent = true;
    expect((await h.request({ category: 'public_books', action: 'pin' })).kind).toBe('confirmed');
    // Off remains available regardless, as before.
    h.failContent = true;
    expect((await h.request({ category: 'public_books', action: 'unpublish' })).kind).toBe('confirmed');
    expect(h.saved.public_books).toBe('No');
  });
  it('writes auto mode alone with the canonical revision', async () => {
    const h = harness(); await h.ready(); let outcome!: NavigationOutcome;
    await act(async () => { outcome = await h.value.setAutoPinning(true, h.value.authority!); });
    expect(outcome.kind).toBe('confirmed');
    expect(h.requests.find(r => r.name === 'UpdateAccount')?.variables.input).toEqual({ expectedRevision: 1, autoPinning: true });
    expect(h.saved.auto_pinning).toBe(true);
  });
  it('exposes only the initiating category as pending until its verified write settles', async () => {
    const h = harness(); await h.ready();
    const pause = deferred(); h.pauseNextRead(pause.promise);
    let request!: Promise<NavigationOutcome>;
    await act(async () => {
      request = h.value.request({ category: 'public_books', action: 'unpublish' }, h.value.authority!);
      await Promise.resolve();
    });
    expect(h.value).toMatchObject({
      busy: true,
      pending: [expect.objectContaining({ kind: 'category', category: 'public_books', action: 'unpublish' })],
    });
    await act(async () => { pause.resolve(); await request; });
    expect(h.value).toMatchObject({ busy: false, pending: [] });
  });
  it.each(['switch-back', 'logout-login'] as const)('invalidates queued, running and prompt-origin intent across %s without waiting for React', async (transition) => {
    const h = harness(); await h.ready(); const origin = h.value.authority!;
    const pause = deferred(); h.pauseNextRead(pause.promise);
    let first!: Promise<NavigationOutcome>; let second!: Promise<NavigationOutcome>;
    await act(async () => { first = h.value.request({ category: 'public_books', action: 'pin' }, origin); second = h.value.request({ category: 'public_games', action: 'pin' }, origin); await Promise.resolve(); });
    await act(async () => { if (transition === 'switch-back') login('u2'); else useAuthStore.getState().logout(); login(); pause.resolve(); });
    expect((await first).kind).toBe('blocked'); expect((await second).kind).toBe('blocked');
    await h.ready(); expect(h.value.authority!.generation).not.toBe(origin.generation);
    let stale!: NavigationOutcome;
    await act(async () => { stale = await h.value.request({ category: 'public_apps', action: 'pin' }, origin); });
    expect(stale.kind).toBe('blocked'); expect(h.requests.some((r) => r.name === 'UpdateAccount')).toBe(false);
  });
  it('fences verified selected-account A-B-A synchronously', async () => {
    const h = harness(); await h.ready(); const origin = h.value.authority!;
    await act(async () => { login('u1','22222222-2222-4222-8222-222222222222'); login(); });
    await h.ready(); expect(h.value.authority!.generation).not.toBe(origin.generation);
    let result!: NavigationOutcome; await act(async () => { result = await h.value.request({ category: 'public_books', action: 'pin' }, origin); }); expect(result).toMatchObject({ kind: 'blocked' });
  });
  it('serializes a shared Music transaction and an ordinary command under one writer', async () => {
    const h = harness(); await h.ready(); const pause = deferred(); const origin = h.value.authority!;
    let music!: Promise<unknown>; let ordinary!: Promise<NavigationOutcome>; let competing!: Promise<NavigationOutcome>;
    await act(async () => {
      music = h.shared.writer.run(origin, async (tx) => { await tx.read(); await pause.promise; return tx.commit({ pinned_nav_tabs: ['public_profile', 'public_music', 'public_movie'] }); });
      ordinary = h.value.request({ category: 'public_books', action: 'pin' }, origin); competing = h.value.request({ category: 'public_games', action: 'pin' }, origin); await Promise.resolve();
    });
    expect(h.requests.some((r) => r.name === 'UpdateAccount')).toBe(false);
    await act(async () => { pause.resolve(); await music; await ordinary; await competing; });
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_movie', 'public_books', 'public_games']);
  });
  it('reports a lost response without success, and retry fresh-reads actual saved state', async () => {
    const h = harness(); await h.ready(); h.failMutation = true;
    expect((await h.request({ category: 'public_books', action: 'pin' })).kind).toBe('uncertain');
    expect(h.value.error).toBeDefined(); h.failMutation = false;
    expect((await h.request({ category: 'public_books', action: 'pin' })).kind).toBe('confirmed');
    expect(h.requests.filter((r) => r.name === 'UpdateAccount')).toHaveLength(1);
  });
  it('invalidates an old route origin and refreshes only active consumers on focus/online', async () => {
    const h = harness(); await h.ready(); const origin = h.value.authority!;
    h.active(false); const before = h.requests.length;
    await act(async () => { window.dispatchEvent(new Event('focus')); }); expect(h.requests).toHaveLength(before);
    h.saved = account({ public_books: 'No' }); h.active(true); await h.ready();
    expect(h.value.snapshot?.visibility.public_books).toBe('No'); expect(h.value.authority!.generation).not.toBe(origin.generation);
    h.saved = account({ public_books: 'Yes' });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(h.value.snapshot?.visibility.public_books).toBe('Yes'));
  });
  it('does not revive an old prompt after the entire provider remounts', async () => {
    const first = harness(); await first.ready(); const origin = first.value.authority!; first.unmount();
    const next = harness(); await next.ready();
    let result!: NavigationOutcome;
    await act(async () => { result = await next.value.request({ category: 'public_books', action: 'pin' }, origin); });
    expect(result.kind).toBe('blocked'); expect(next.requests.some((r) => r.name === 'UpdateAccount')).toBe(false);
  });
  it('waits for an admitted mutation across provider remount before merging another pin', async () => {
    const h = harness(); await h.ready();
    const pause = deferred(); h.pauseNextMutation(pause.promise);
    let first!: Promise<NavigationOutcome>;
    await act(async () => { first = h.value.request({ category: 'public_books', action: 'pin' }, h.value.authority!); });
    await waitFor(() => expect(h.requests.filter((r) => r.name === 'UpdateAccount')).toHaveLength(1));
    const origin = h.value.authority!;
    h.remount(); await h.ready();
    expect(h.value.authority!.generation).not.toBe(origin.generation);
    expect(h.value.snapshot?.savedPins).toEqual(['public_profile', 'public_music']);
    let second!: Promise<NavigationOutcome>;
    await act(async () => { second = h.value.request({ category: 'public_games', action: 'pin' }, h.value.authority!); });
    const admittedBeforeSettlement = h.requests.filter((r) => r.name === 'UpdateAccount').length;
    await act(async () => { pause.resolve(); await Promise.all([first, second]); });
    expect(admittedBeforeSettlement).toBe(1);
    expect((await first).kind).toBe('blocked');
    expect((await second).kind).toBe('confirmed');
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_books', 'public_games']);
    expect(h.value.snapshot?.savedPins).toEqual(['public_profile', 'public_music', 'public_books', 'public_games']);
  });
  it('captures a mutable caller authority before any awaited read', async () => {
    const h = harness({ initial: { public_books: 'No' } }); await h.ready();
    const origin = { ...h.value.authority! }; const pause = deferred(); h.pauseNextRead(pause.promise);
    let request!: Promise<NavigationOutcome>;
    await act(async () => { request = h.value.request({ category: 'public_books', action: 'unpublish' }, origin); await Promise.resolve(); });
    origin.accountDocumentId = 'mutated-after-click';
    await act(async () => { pause.resolve(); await request; });
    expect((await request).kind).toBe('confirmed');
    expect(h.saved.public_books).toBe('No');
  });
  it('keeps verified success when invalidation event creation or delivery is unavailable', async () => {
    const h = harness(); await h.ready();
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('Unavailable'); });
    expect((await h.request({ category: 'public_books', action: 'pin' })).kind).toBe('confirmed');
    expect(h.value.snapshot?.savedPins).toEqual(['public_profile', 'public_music', 'public_books']);
  });
  it('reports failed post-save verification without publishing optimistic success', async () => {
    const h = harness(); await h.ready(); h.failReadsAfterMutation = true;
    expect((await h.request({ category: 'public_books', action: 'pin' })).kind).toBe('uncertain');
    expect(h.value.snapshot?.savedPins).toEqual(['public_profile', 'public_music']);
    expect(h.value.error).toBeDefined(); expect(h.value.busy).toBe(false);
    expect(publishPublicProfileInvalidation).not.toHaveBeenCalled();
  });
  it('publishes exactly one public invalidation only after a confirmed category save', async () => {
    const h = harness(); await h.ready();
    expect((await h.request({ category: 'public_books', action: 'pin' })).kind).toBe('confirmed');
    expect(publishPublicProfileInvalidation).toHaveBeenCalledTimes(1);
    expect(publishPublicProfileInvalidation).toHaveBeenCalledWith(expect.objectContaining({
      accountDocumentId: ownerId, username: 'owner', category: 'public_books', action: 'pin', eventId: expect.any(String),
    }));
  });
  it('does not publish a public invalidation for a noop command', async () => {
    const h = harness(); await h.ready();
    expect((await h.request({ category: 'public_books', action: 'unpin' })).kind).toBe('confirmed');
    expect(publishPublicProfileInvalidation).not.toHaveBeenCalled();
  });
  it('does not publish a public invalidation when the mutation response is lost', async () => {
    const h = harness(); await h.ready(); h.failMutation = true;
    expect((await h.request({ category: 'public_books', action: 'pin' })).kind).toBe('uncertain');
    expect(publishPublicProfileInvalidation).not.toHaveBeenCalled();
  });
  it('refreshes scoped peer changes without changing authority and ignores events for another account', async () => {
    const h = harness(); await h.ready(); const origin = h.value.authority!;
    const event = { version: 'category-navigation/v1', kind: 'changed', eventId: 'peer-event', scope: { userDocumentId: 'u1', accountDocumentId: 'other' } };
    const before = h.requests.length;
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-category-navigation', newValue: JSON.stringify(event) })); });
    expect(h.requests).toHaveLength(before);
    h.saved = account({ pinned_nav_tabs: ['public_profile', 'public_guides'] }); event.scope.accountDocumentId = ownerId;
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-category-navigation', newValue: JSON.stringify(event) })); });
    await h.ready(); expect(h.value.authority!.generation).toBe(origin.generation);
    expect(h.value.snapshot?.savedPins).toEqual(['public_profile', 'public_guides']);
  });
  it('keeps an open same-account prompt valid after harmless focus and online refresh', async () => {
    const h = harness(); await h.ready(); const origin = h.value.authority!;
    await act(async () => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
    await h.ready(); expect(h.value.authority!.generation).toBe(origin.generation);
    let result!: NavigationOutcome;
    await act(async () => { result = await h.value.request({ category: 'public_books', action: 'pin' }, origin); });
    expect(result.kind).toBe('confirmed');
  });
});
