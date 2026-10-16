import React from 'react';
import { vi } from 'vitest';
import { explorersApiClient } from '../../../lib/explorersApiClient';
import { canonicalAccountFixture } from '../../../test/canonicalAccountFixture';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CategoryNavigationProvider, useCategoryNavigation } from '../CategoryNavigationProvider';
import { MusicPublishProvider } from '../../music/MusicPublishProvider';
import type { MusicPinVerifier } from '../accountNavigationWriter';
import useAuthStore from '../../../store/store';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import english from '../../../i18n/resources/en.json';
const surfaceTranslations = createInstance();
void surfaceTranslations.init({ lng: 'en', resources: { en: { translation: english } }, showSupportNotice: false });

const CANONICAL_FIELDS = ['public_recommendations','public_music','public_guides','public_movie','public_books','public_games','public_apps','public_products','public_people'] as const;
const CANONICAL_KEYS = ['places','music','guides','movies','books','games','apps','products','people'] as const;
type CanonicalRow = { category: string; isPublic?: boolean; pinnedOrder?: number | null };
/** Pin order a canonical account update writes, mirroring toNavigationSnapshot's savedPins. */
export function writtenPins(input: { categories?: CanonicalRow[] }) {
  return ['public_profile', ...(input.categories ?? []).filter(row => row.pinnedOrder !== null && row.pinnedOrder !== undefined)
    .sort((a, b) => a.pinnedOrder! - b.pinnedOrder!).map(row => CANONICAL_FIELDS[CANONICAL_KEYS.indexOf(row.category as typeof CANONICAL_KEYS[number])])];
}
/** Visibility a canonical account update writes for one legacy field name. */
export function writtenVisibility(input: { categories?: CanonicalRow[] }, field: string) {
  return (input.categories ?? []).find(row => row.category === CANONICAL_KEYS[CANONICAL_FIELDS.indexOf(field as typeof CANONICAL_FIELDS[number])])?.isPublic;
}
export const ordinaryCategories = ['public_recommendations', 'public_movie', 'public_books', 'public_games', 'public_apps', 'public_products', 'public_people', 'public_guides'] as const;
export function loginSurface(id = 'u1', accountId = canonicalAccountFixture().id) {
  const generation = useAuthStore.getState().beginVerification();
  useAuthStore.getState().acceptVerified(generation, { id: accountId, userId: id, username: 'owner', email: 'owner@example.test', onboardingStatus: 'complete', revision: 1 });
}
export function surfaceAccount(extra: Record<string, unknown> = {}) {
  return { __typename: 'Account', documentId: 'a1', Account_Name: 'Owner', Account_Type: 'Personal', mobile_number: '123', public_profile: 'Yes', public_music: 'Yes',
    public_recommendations: 'Yes', public_movie: 'Yes', public_books: 'Yes', public_games: 'Yes', public_apps: 'Yes', public_products: 'Yes', public_people: 'Yes', public_guides: 'Yes',
    pinned_nav_tabs: ['public_profile', 'public_music', 'public_books'], auto_pinning: false, ...extra };
}
export function surfaceHarness(child: React.ReactNode, options: { initial?: Record<string, unknown>; incompleteFirst?: boolean; route?: string | { pathname: string; state: unknown }; lists?: Record<string, unknown>; content?: Record<string, unknown>; verifyMusicPin?: MusicPinVerifier; deferProfile?: Promise<unknown>; deferContent?: Promise<unknown>; respond?: (name: string, variables: any) => any } = {}) {
  let saved = surfaceAccount(options.initial);
  let failMutation = false;
  let failLists = false;
  let pauseMutation: Promise<void> | undefined;
  let navigation!: ReturnType<typeof useCategoryNavigation>;
  const requests: { name: string; variables: any }[] = [];
  const content = options.content ?? Object.fromEntries(['recommendationLists', 'movieLists', 'bookLists', 'gameLists', 'appLists', 'productLists', 'personLists', 'guides'].map(key => [key, [{ documentId: `${key}-1` }]]));
  const fields = CANONICAL_FIELDS;
  const keys = CANONICAL_KEYS;
  let revision = 1;
  const accountDto = () => canonicalAccountFixture({ id: useAuthStore.getState().accountId ?? canonicalAccountFixture().id, revision, autoPinning: saved.auto_pinning as boolean,
    categories: keys.map((category, displayOrder) => ({ category, displayOrder, isPublic: saved[fields[displayOrder]] === 'Yes', pinnedOrder: Array.isArray(saved.pinned_nav_tabs) && saved.pinned_nav_tabs.includes(fields[displayOrder]) ? saved.pinned_nav_tabs.indexOf(fields[displayOrder]) - 1 : null })) });
  // Use the real pagination producer so native publication proof retains its
  // provenance brand; unsupported categories deliberately receive no producer.
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  const ownerPage = (items: unknown[] = [], extra: Record<string, unknown> = {}) => json({ version: 'explorers-owner-content/v2',
    snapshot: '1', snapshotToken: 'native-surface', expiresAt: Date.now() + 60_000, items, nextCursor: null, ...extra });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const request = new URL(String(url), 'http://localhost');
    // Ticket 5.1. The Favorites page reads its Places lists through the owner API, so the
    // rest of that read is answered with empty pages. These surfaces assert the category
    // header controls; the list content is not what they are about.
    const owner = /^\/api\/explorers\/v1\/categories\/[a-z]+\/(content-snapshot|memberships|top-picks)$/.exec(request.pathname);
    if (owner) {
      if (owner[1] === 'content-snapshot') return json({ version: 'explorers-owner-content/v2', snapshotToken: 'native-surface', revision: '1', expiresAt: Date.now() + 60_000, pinRevision: null });
      return ownerPage([], owner[1] === 'top-picks' ? { pinRevision: null } : {});
    }
    if (request.pathname === '/api/explorers/v1/recommendations') return ownerPage();
    const editable = /^\/api\/explorers\/v1\/collections\/([0-9a-f-]+)\/editable$/.exec(request.pathname);
    if (editable) {
      return json({ collection: { id: editable[1], accountId: useAuthStore.getState().accountId, category: 'places',
        title: 'My places', slug: 'places', description: null, heading: null, coverMediaId: null, visibility: 'public',
        publicationState: 'published', revision: 1, archived: false, displayOrder: 0, pinOrder: null, categoryRevision: '1',
        placeLocation: { locationEntityId: null, locationSnapshot: null, instagramMediaUrl: null },
        // Ticket 5.2. A location list reports what is linked to it, so the editable read
        // must carry the field even when nothing is.
        linkedChildren: [] } });
    }
    if (request.pathname !== '/api/explorers/v1/collections') return new Response('{}', { status: 404 });
    // deferContent holds owner content pending while authority is already resolved.
    if (options.deferContent) await options.deferContent;
    const category = request.searchParams.get('category');
    const listField = category === 'books' ? 'bookLists' : category === 'movies' ? 'movieLists' : category === 'games' ? 'gameLists' : category === 'places' ? 'placeLists' : undefined;
    if (!listField || failLists) throw new Error('Native lists unavailable');
    const items = (content[listField] as unknown[] ?? []).map((_item, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      accountId: useAuthStore.getState().accountId, category, title: 'Published list', slug: `list-${index}`,
      visibility: 'public', publicationState: 'published', revision: 1, description: null,
      heading: null, coverMediaId: null, archived: false, displayOrder: index,
    }));
    return new Response(JSON.stringify({ version: 'explorers-owner-content/v2', snapshot: '1', snapshotToken: 'native-surface', expiresAt: Date.now() + 60_000, items, nextCursor: null }), { headers: { 'Content-Type': 'application/json' } });
  }));
  // deferProfile withholds the canonical account read, the way `respond` could withhold
  // a query response before Settings stopped reading the account through Apollo.
  vi.spyOn(explorersApiClient, 'getMyProfile').mockImplementation(async () => { if (options.deferProfile) await options.deferProfile; return accountDto(); });
  vi.spyOn(explorersApiClient, 'updateAccount').mockImplementation(async input => {
    requests.push({ name: 'CanonicalUpdateAccount', variables: { input } });
    if (pauseMutation) await pauseMutation;
    if (failMutation) throw new Error('Save unavailable');
    if (input.categories) {
      for (const row of input.categories) saved = { ...saved, [fields[keys.indexOf(row.category)]]: row.isPublic ? 'Yes' : 'No' };
      saved = { ...saved, pinned_nav_tabs: ['public_profile', ...input.categories.filter(row => row.pinnedOrder !== null).sort((a,b) => a.pinnedOrder! - b.pinnedOrder!).map(row => fields[keys.indexOf(row.category)])] };
    }
    if (input.autoPinning !== undefined) saved = { ...saved, auto_pinning: input.autoPinning };
    revision++; return accountDto();
  });
  const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: { Account: { keyFields: ['documentId'] }, UsersPermissionsUser: { keyFields: false } } }),
    link: new ApolloLink(op => new Observable(observer => {
      requests.push({ name: op.operationName, variables: op.variables });
      const selection = (op.query.definitions.find((d: any) => d.kind === 'OperationDefinition') as any).selectionSet;
      const complete = (selection: any, value: any): any => {
        if (value === null) return null;
        if (Array.isArray(value)) return value.map(item => complete(selection, item));
        return Object.fromEntries(selection.selections.filter((s: any) => s.kind === 'Field').map((s: any) => {
          const key = s.name.value; const next = value?.[key] ?? null;
          return [s.alias?.value ?? key, s.selectionSet && next !== null ? complete(s.selectionSet, next) : next];
        }));
      };
      const respond = async () => {
        const custom = options.respond?.(op.operationName, op.variables);
        if (custom !== undefined) return custom;
        if (op.operationName === 'UpdateTabVisibility' || op.query.definitions.some((d: any) => d.operation === 'mutation' && d.selectionSet.selections.some((s: any) => s.name.value === 'updateAccount'))) {
          if (pauseMutation) await pauseMutation;
          if (failMutation) throw new Error('Save unavailable');
          saved = { ...saved, ...op.variables.data };
          return { updateAccount: saved };
        }
        if (op.operationName === 'CheckPublishedLists') {
          if (failLists) throw new Error('Lists unavailable');
          return content;
        }
        if (failLists && selection.selections.some((s: any) => /Lists$|^guides$/.test(s.name?.value))) throw new Error('Lists unavailable');
        const candidates = options.incompleteFirst ? [surfaceAccount({ documentId: 'incomplete', Account_Name: null, mobile_number: null, ...Object.fromEntries(ordinaryCategories.map(c => [c, 'No'])) }), saved] : [saved];
        const user = { __typename: 'UsersPermissionsUser', documentId: op.variables.documentId || 'u1', provider: 'google', confirmed: true, blocked: false, accounts: candidates };
        const base: any = { usersPermissionsUser: user, accounts: [saved], recommendationLists: [], movieLists: [], bookLists: [], gameLists: [], appLists: [], productLists: [], personLists: [], guides: [], ...options.lists };
        // Complete unrelated query fields at the network boundary, not the hook.
        return base;
      };
      void respond().then(data => { observer.next({ data: complete(selection, data) }); observer.complete(); }, error => observer.error(error));
    })) });
  function Probe() { navigation = useCategoryNavigation(); return null; }
  const tree = (children: React.ReactNode) => <ApolloProvider client={client}><MemoryRouter initialEntries={[options.route ?? '/']}><I18nextProvider i18n={surfaceTranslations}><CategoryNavigationProvider verifyMusicPin={options.verifyMusicPin ?? (async () => 'public')}><MusicPublishProvider><Probe />{children}</MusicPublishProvider></CategoryNavigationProvider></I18nextProvider></MemoryRouter></ApolloProvider>;
  const view = render(tree(child));
  return { ...view, client, requests, get navigation() { return navigation; }, get saved() { return saved; }, set saved(value) { saved = value; },
    set failMutation(value: boolean) { failMutation = value; }, set failLists(value: boolean) { failLists = value; },
    pauseMutation(value?: Promise<void>) { pauseMutation = value; },
    rerenderChild(next: React.ReactNode) { view.rerender(tree(next)); },
    get writes() { return requests.filter(r => r.name === 'CanonicalUpdateAccount'); },
    ready: () => waitFor(() => { if (!navigation.authority || !navigation.content) throw new Error('Waiting for verified navigation'); }),
  };
}
