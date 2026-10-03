import React from 'react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useAuthStore from '../../../store/store';
import { CategoryNavigationProvider, useAccountNavigationWriter, useCategoryNavigation } from '../CategoryNavigationProvider';
import { categoryNavigationAccountQuery } from '../categoryNavigationApi';
import type { MusicPinVerifier, NavigationOutcome } from '../accountNavigationWriter';
import type { GenericNavigationIntent } from '../categoryNavigationPolicy';

const publishPublicProfileInvalidation = vi.hoisted(() => vi.fn());
vi.mock('../../PublicHome/api/publicProfileInvalidation', () => ({ publishPublicProfileInvalidation }));

function account(extra = {}) { return { __typename: 'Account', documentId: 'a1', Account_Name: 'Owner', Account_Type: 'Personal', mobile_number: '123', public_profile: 'Yes', public_music: 'Yes', public_recommendations: 'Yes', public_guides: 'Yes', public_movie: 'Yes', public_books: 'Yes', public_games: 'Yes', public_apps: 'Yes', public_products: 'Yes', public_people: 'Yes', auto_pinning: false, pinned_nav_tabs: ['public_profile', 'public_music'], ...extra }; }
const login = (documentId = 'u1') => useAuthStore.getState().login({ id: documentId, documentId, username: 'owner', email: 'owner@example.test', blocked: false, token: `test-${documentId}` });
const userData = (saved: ReturnType<typeof account>, documentId = 'u1') => ({ usersPermissionsUser: { __typename: 'UsersPermissionsUser', documentId, provider: 'local', confirmed: true, blocked: false, accounts: [saved] } });
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
  const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: { Account: { keyFields: ['documentId'] }, UsersPermissionsUser: { keyFields: ['documentId'] } } }),
    link: new ApolloLink((op) => new Observable((observer) => {
      requests.push({ name: op.operationName, variables: op.variables });
      const respond = async () => {
        if (op.operationName === 'CategoryNavigationAccount') {
          const paused = pauseRead; pauseRead = undefined; if (paused) await paused;
          if (failReads) throw new Error('Account unavailable');
          return userData(saved, op.variables.documentId);
        }
        if (op.operationName === 'UpdateTabVisibility') {
          const paused = pauseMutation; pauseMutation = undefined; if (paused) await paused;
          saved = { ...saved, ...op.variables.data };
          if (failReadsAfterMutation) failReads = true;
          if (failMutation) throw new Error('Lost response');
          return { updateAccount: saved };
        }
        if (op.operationName === 'CheckPublishedLists') {
          if (failContent) throw new Error('Content unavailable');
          return { bookLists: [{ documentId: 'b1' }], gameLists: [], appLists: [], productLists: [], movieLists: [], personLists: [], guides: [], recommendationLists: [] };
        }
        throw new Error('Unexpected operation');
      };
      void respond().then((data) => { observer.next({ data }); observer.complete(); }, (error) => observer.error(error));
    })) });
  function Consumer() { value = useCategoryNavigation(); shared = useAccountNavigationWriter(); return <div>{value.snapshot?.scope.accountDocumentId ?? 'loading'}</div>; }
  const tree = (active: boolean) => <ApolloProvider client={client}><CategoryNavigationProvider key={providerKey} verifyMusicPin={options.verifyMusicPin}>{active ? <Consumer /> : <div>unrelated</div>}</CategoryNavigationProvider></ApolloProvider>;
  const rendered = render(tree(options.consumer !== false));
  return { client, requests, get value() { return value; }, get shared() { return shared; },
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
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); vi.restoreAllMocks(); });

  it('keeps category writes disabled and names the category outage without questioning the verified session', async () => {
    const h = harness({ failReads: true });
    await waitFor(() => expect(h.value.error).toBe('Category settings could not be loaded. Refresh to try again.'));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(h.value.authority).toBeUndefined();
    expect(h.requests.map((request) => request.name)).toEqual(['CategoryNavigationAccount']);
  });

  it('is inert on unrelated routes and fresh-reads when a consumer enters', async () => {
    const h = harness({ consumer: false });
    await act(async () => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
    expect(h.requests).toEqual([]);
    h.active(true); await h.ready(); expect(h.value.snapshot?.savedPins).toEqual(['public_profile', 'public_music']);
  });
  it('pins from authoritative saved state and never consults unrelated Music/content availability', async () => {
    const h = harness(); await h.ready(); h.failContent = true;
    h.saved = account({ pinned_nav_tabs: ['public_profile', 'public_music', 'public_guides'] });
    expect((await h.request({ category: 'public_books', action: 'pin' })).kind).toBe('confirmed');
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
    expect(h.requests.some((r) => r.name === 'UpdateTabVisibility')).toBe(false);
  });
  it('passes the held transaction to Music verification without a nested lock', async () => {
    const h = harness({ initial: { pinned_nav_tabs: ['public_profile'] }, verifyMusicPin: async (tx, origin) => {
      const current = await tx.read(); return current.scope.accountDocumentId === origin.accountDocumentId && tx.isCurrent() ? 'public' : 'unknown';
    } });
    await h.ready(); expect((await h.request({ category: 'public_music', action: 'pin' })).kind).toBe('confirmed');
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music']);
  });
  it('uses fresh content eligibility only for ordinary publication, and Off works during outage', async () => {
    const h = harness({ initial: { public_books: 'No' } }); await h.ready();
    expect((await h.request({ category: 'public_books', action: 'publish' })).kind).toBe('confirmed');
    h.failContent = true;
    expect((await h.request({ category: 'public_books', action: 'unpublish' })).kind).toBe('confirmed');
    expect((await h.request({ category: 'public_books', action: 'publish' })).kind).toBe('blocked');
    expect(h.saved.public_books).toBe('No');
  });
  it('writes auto mode alone and truthfully reports malformed-pin privacy cleanup', async () => {
    const h = harness({ initial: { pinned_nav_tabs: { malformed: true } } }); await h.ready();
    let outcome!: NavigationOutcome;
    await act(async () => { outcome = await h.value.setAutoPinning(true, h.value.authority!); });
    expect(outcome.kind).toBe('confirmed');
    expect(h.requests.find((r) => r.name === 'UpdateTabVisibility')?.variables.data).toEqual({ auto_pinning: true });
    expect((await h.request({ category: 'public_books', action: 'unpublish' })).kind).toBe('cleanup-pending');
    expect(h.saved.public_books).toBe('No'); expect(h.saved.pinned_nav_tabs).toEqual({ malformed: true });
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
    expect(stale.kind).toBe('blocked'); expect(h.requests.some((r) => r.name === 'UpdateTabVisibility')).toBe(false);
  });
  it('observes selected-account A→B→A at the cache boundary synchronously', async () => {
    const h = harness(); await h.ready(); const origin = h.value.authority!;
    await act(async () => {
      h.client.cache.writeQuery({ query: categoryNavigationAccountQuery, variables: { documentId: 'u1' }, data: userData(account({ documentId: 'a2' })) });
      h.client.cache.writeQuery({ query: categoryNavigationAccountQuery, variables: { documentId: 'u1' }, data: userData(account()) });
    });
    await h.ready(); expect(h.value.authority!.generation).not.toBe(origin.generation);
    let result!: NavigationOutcome;
    await act(async () => { result = await h.value.request({ category: 'public_books', action: 'pin' }, origin); });
    expect(result.kind).toBe('blocked');
  });
  it('serializes a shared Music transaction and an ordinary command under one writer', async () => {
    const h = harness(); await h.ready(); const pause = deferred(); const origin = h.value.authority!;
    let music!: Promise<unknown>; let ordinary!: Promise<NavigationOutcome>;
    await act(async () => {
      music = h.shared.writer.run(origin, async (tx) => { await tx.read(); await pause.promise; return tx.commit({ pinned_nav_tabs: ['public_profile', 'public_music', 'public_guides'] }); });
      ordinary = h.value.request({ category: 'public_books', action: 'pin' }, origin); await Promise.resolve();
    });
    expect(h.requests.some((r) => r.name === 'UpdateTabVisibility')).toBe(false);
    await act(async () => { pause.resolve(); await music; await ordinary; });
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_guides', 'public_books']);
  });
  it('reports a lost response without success, and retry fresh-reads actual saved state', async () => {
    const h = harness(); await h.ready(); h.failMutation = true;
    expect((await h.request({ category: 'public_books', action: 'pin' })).kind).toBe('uncertain');
    expect(h.value.error).toBeDefined(); h.failMutation = false;
    expect((await h.request({ category: 'public_books', action: 'pin' })).kind).toBe('confirmed');
    expect(h.requests.filter((r) => r.name === 'UpdateTabVisibility')).toHaveLength(1);
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
    expect(result.kind).toBe('blocked'); expect(next.requests.some((r) => r.name === 'UpdateTabVisibility')).toBe(false);
  });
  it('waits for an admitted mutation across provider remount before merging another pin', async () => {
    const h = harness(); await h.ready();
    const pause = deferred(); h.pauseNextMutation(pause.promise);
    let first!: Promise<NavigationOutcome>;
    await act(async () => { first = h.value.request({ category: 'public_books', action: 'pin' }, h.value.authority!); });
    await waitFor(() => expect(h.requests.filter((r) => r.name === 'UpdateTabVisibility')).toHaveLength(1));
    const origin = h.value.authority!;
    h.remount(); await h.ready();
    expect(h.value.authority!.generation).not.toBe(origin.generation);
    expect(h.value.snapshot?.savedPins).toEqual(['public_profile', 'public_music']);
    let second!: Promise<NavigationOutcome>;
    await act(async () => { second = h.value.request({ category: 'public_games', action: 'pin' }, h.value.authority!); });
    const admittedBeforeSettlement = h.requests.filter((r) => r.name === 'UpdateTabVisibility').length;
    await act(async () => { pause.resolve(); await Promise.all([first, second]); });
    expect(admittedBeforeSettlement).toBe(1);
    expect((await first).kind).toBe('blocked');
    expect((await second).kind).toBe('confirmed');
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_books', 'public_games']);
    expect(h.value.snapshot?.savedPins).toEqual(['public_profile', 'public_music', 'public_books', 'public_games']);
  });
  it('captures a mutable caller authority before any awaited eligibility check', async () => {
    const h = harness({ initial: { public_books: 'No' } }); await h.ready();
    const origin = { ...h.value.authority! }; const pause = deferred(); h.pauseNextRead(pause.promise);
    let request!: Promise<NavigationOutcome>;
    await act(async () => { request = h.value.request({ category: 'public_books', action: 'publish' }, origin); await Promise.resolve(); });
    origin.accountDocumentId = 'mutated-after-click';
    await act(async () => { pause.resolve(); await request; });
    expect((await request).kind).toBe('confirmed');
    expect(h.requests.find((r) => r.name === 'CheckPublishedLists')?.variables.accountDocumentId).toBe('a1');
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
      accountDocumentId: 'a1', username: 'owner', category: 'public_books', action: 'pin', eventId: expect.any(String),
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
    h.saved = account({ pinned_nav_tabs: ['public_profile', 'public_guides'] }); event.scope.accountDocumentId = 'a1';
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
