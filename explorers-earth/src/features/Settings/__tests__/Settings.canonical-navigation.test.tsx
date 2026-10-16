import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '../Settings';
import { loginSurface, ordinaryCategories, surfaceHarness } from '../../navigation/__tests__/surfaceHarness';
import useAuthStore from '../../../store/store';
import { explorersApiClient } from '../../../lib/explorersApiClient';
vi.mock('../../Profile/api/useCanonicalAccount', () => ({ useCanonicalAccount: () => ({ data: { id: '11111111-1111-4111-8111-111111111111', revision: 1 }, isLoading: false }) }));
vi.mock('../components/ProfileAccountSettings', () => ({ default: () => null }));
vi.mock('../components/BillingTab', () => ({ default: () => null }));
vi.mock('../components/LanguageSelector', () => ({ default: () => null, LANGUAGES: [{ code: 'en', name: 'English' }] }));
const legacyNavigation = (name: string) => name === 'SettingsAccount' || name === 'PublicCategoryListCounts';
describe('Settings canonical navigation', () => {
  beforeEach(() => { vi.restoreAllMocks(); loginSurface('distinct-auth-user'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))); window.history.replaceState(null, '', '/#public-navigation'); (window as any).__dashboardLoaded = false; });
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
  it('distinguishes verified native no content from unsupported unavailable without inventing counts', async () => {
    // No owner content for the three supported categories; the rest stay unsupported.
    // (Stubbing fetch here had no effect: surfaceHarness installs its own stub after.)
    const h=surfaceHarness(<Settings />,{content:{}});await h.ready();
    await waitFor(()=>expect(h.navigation.content?.counts).toEqual({public_books:0,public_movie:0,public_games:0}));
    fireEvent.click(screen.getByRole('button',{name:/Public Visibility/i}));
    expect(screen.getByRole('checkbox',{name:'Books Tab'}).closest('label')?.parentElement?.parentElement).toHaveTextContent('No content');
    expect(screen.getByRole('checkbox',{name:'Places Tab'}).closest('label')?.parentElement?.parentElement).toHaveTextContent('Unavailable');
    expect(h.writes).toEqual([]);
  });
  it.each(ordinaryCategories)('safe stored %s unpin sends the complete canonical preference revision patch',async category=>{
    const h=surfaceHarness(<Settings />,{initial:{pinned_nav_tabs:['public_profile',category]}});await h.ready();
    const labels:Record<string,string>={public_recommendations:'Places Tab',public_movie:'Movies & Shows Tab',public_books:'Books Tab',public_games:'Games Tab',public_apps:'Apps & Tools Tab',public_products:'Products Tab',public_people:'People Tab',public_guides:'Guides Tab'};
    const pin=await screen.findByRole('checkbox',{name:'Pin '+labels[category]});await waitFor(()=>expect(pin).toBeEnabled());fireEvent.click(pin);
    await waitFor(()=>expect(h.writes).toHaveLength(1));
    const input=h.writes[0].variables.input;expect(input.expectedRevision).toBe(1);expect(input.categories).toHaveLength(9);expect(input.categories.every((row:{isPublic:boolean;pinnedOrder:null})=>row.isPublic&&row.pinnedOrder===null)).toBe(true);
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile']);
  });
  it('keeps dashboard loading unsettled while current owner content is pending',async()=>{
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    // Gating through the harness, since stubbing fetch here was overwritten by its own
    // stub. Authority publishes before owner content is awaited, so wait on authority:
    // h.ready() needs content and would not settle while content is deliberately pending.
    const h=surfaceHarness(<Settings />,{deferContent:gate});
    await waitFor(()=>expect(h.navigation.authority).toBeTruthy());
    expect(h.navigation.content).toBeFalsy();expect((window as any).__dashboardLoaded).toBe(false);
    await act(async()=>release());await h.ready();
    await waitFor(()=>expect((window as any).__dashboardLoaded).toBe(true));
    expect(h.requests.filter(r=>legacyNavigation(r.name))).toEqual([]);
  });
  it('offers an explicit refresh after a failed canonical owner account read',async()=>{
    const h=surfaceHarness(<Settings />);await h.ready();
    vi.mocked(explorersApiClient.getMyProfile).mockRejectedValueOnce(new Error('Owner read unavailable'));
    await act(async()=>{await h.navigation.refresh();});
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded|Owner read unavailable/i);
    expect(screen.getByRole('button',{name:'Refresh'})).toBeEnabled();expect(h.writes).toEqual([]);
  });
  it('distinct auth and account IDs never enter the legacy Settings GraphQL query', async () => {
    const h = surfaceHarness(<Settings />, { respond: name => { if (legacyNavigation(name)) throw new Error('Legacy navigation GraphQL trap'); } });
    await h.ready();
    expect(h.navigation.snapshot?.scope).toEqual({ userDocumentId: 'distinct-auth-user', accountDocumentId: '11111111-1111-4111-8111-111111111111' });
    expect(h.requests.filter(request => legacyNavigation(request.name))).toEqual([]);
  });
  it('saves only explicit canonical revision mode changes', async () => {
    const h = surfaceHarness(<Settings />); await h.ready();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Auto-pin navigation tabs/i }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual({ input: { expectedRevision: 1, autoPinning: true } });
  });
  it('opens and focuses the hash target when current navigation loading settles', async () => {
    const h = surfaceHarness(<Settings />); await h.ready();
    await waitFor(() => expect((window as any).__dashboardLoaded).toBe(true));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Pinned Navigation Tabs/i })).toHaveFocus());
  });
});

