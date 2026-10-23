import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import AddAppPage from '../AddAppPage';
import AppListView from '../AppListView';
import { AppsClient } from '../../../api/appsClient';
import useAuthStore from '../../../../../store/store';
import { reorderListItems } from '../../../../../lib/reorderListItems';

// Replaces scrape-flow.integration.test.tsx. That suite drove the paste-a-URL step
// against /api/apps/scrape-url, a path the server no longer has and a containment test
// now asserts stays absent, so it was asserting the behaviour of a dead endpoint.

const fixture = vi.hoisted(() => ({ content: { view: { lists: [] as unknown[] }, details: new Map(), observation: {} }, loading: false, error: undefined as Error | undefined, refetch: vi.fn() }));
vi.mock('../../../hooks/useAppsOwner', () => ({ useAppsOwner: () => ({ content: fixture.content, data: { appLists: fixture.content.view.lists }, loading: fixture.loading, error: fixture.error, refetch: fixture.refetch }), invalidateApps: vi.fn() }));
vi.mock('../../../api/appsClient', () => ({ AppsClient: { observeCollection: vi.fn(), prepareManualIntent: vi.fn(), createManual: vi.fn(), upload: vi.fn(), updateRecommendation: vi.fn(), observeRecommendation: vi.fn(), updateCollection: vi.fn(), archiveCollection: vi.fn(), archiveRecommendation: vi.fn(), createCollection: vi.fn(), readCompleteOwner: vi.fn(), setTopPicks: vi.fn(), prepareMembershipIntent: vi.fn(), saveMembership: vi.fn() } }));
vi.mock('../../../../Favorites/components/TiptapEditor', () => ({ default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="Note" value={value} onChange={event => onChange(event.target.value)} /> }));
vi.mock('../../../../../lib/reorderListItems', () => ({ reorderListItems: vi.fn() }));
vi.mock('sonner',() => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));

function mount() { return render(<MockedProvider><MemoryRouter initialEntries={['/apps/list-1/add']}><Routes><Route path="/apps/:listId/add" element={<AddAppPage />} /><Route path="/recommendations/apps/:listId" element={<p>Saved list</p>} /></Routes></MemoryRouter></MockedProvider>); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('native manual Apps', () => {
 it('rates with the shared star widget and saves the stored value', async () => {
  mount(); const rating=screen.getByRole('slider', {name:'Your rating'});
  fireEvent.keyDown(rating,{key:'End'});
  fill('App title','Rated app');fill('App URL','https://example.com/rated');
  fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByText('Saved list');
  expect(vi.mocked(AppsClient.prepareManualIntent).mock.calls[0][1].userRating).toBe(10);
 });
 beforeEach(() => {
  vi.clearAllMocks(); fixture.loading = false; fixture.error = undefined; fixture.content.view.lists = []; fixture.content.details.clear();
  useAuthStore.getState().login({ id: 'u1', documentId: 'u1', username: 'owner', email: 'owner@example.test', blocked: false, token: 'fixture' }); useAuthStore.setState({ accountId: 'a1' });
  vi.mocked(AppsClient.observeCollection).mockResolvedValue({ detail: { id: 'list-1' } } as never);
  vi.mocked(AppsClient.prepareManualIntent).mockImplementation((parent, draft) => ({ parent, draft, entityKey: 'entity-key', recommendationKey: 'recommendation-key' }) as never);
  vi.mocked(AppsClient.createManual).mockResolvedValue({ id: 'app-1' } as never);
 });
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); });

 it('round-trips the price tier, platforms and other links, with no download URL', async () => {
  mount();
  fill('App title', 'Focus Timer'); fill('App URL', 'https://example.com/focus');
  fill('Developer', 'Quiet Software');
  fireEvent.click(screen.getByRole('button', { name: '+ Add another platform link' }));
  fill('Other link 1', 'https://example.com/get');
  fill('Price', 'Paid');
  fireEvent.click(screen.getByRole('button', { name: 'iOS' })); fireEvent.click(screen.getByRole('button', { name: 'Web' }));
  fill('Note', '<p>Keeps me honest</p>');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved list');
  expect(AppsClient.prepareManualIntent).toHaveBeenCalledWith(expect.anything(), {
   title: 'Focus Timer', appUrl: 'https://example.com/focus', developer: 'Quiet Software',
   logoUrl: null, description: null, downloadUrl: null, priceTier: 'Paid',
   platforms: ['iOS', 'Web'], otherLinks: [{ label: 'Link', url: 'https://example.com/get' }], note: { version: 1, format: 'quill-html', html: '<p>Keeps me honest</p>' },
   userRating: null, mediaIds: [], screenshotMediaIds: [],
  });
 });

 it('sends an unstated price tier as null rather than defaulting to a charge', async () => {
  mount(); fill('App title', 'Free Thing'); fill('App URL', 'https://example.com/free');
  expect(screen.getByLabelText('Price')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved list');
  expect(vi.mocked(AppsClient.prepareManualIntent).mock.calls[0][1]).toMatchObject({ priceTier: null });
 });

 it('refuses to save without the app URL the storage requires', async () => {
  mount(); fill('App title', 'No link');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(AppsClient.observeCollection).not.toHaveBeenCalled();
  fill('App URL', 'https://example.com/link');
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
 });

 it('waits for uploaded screenshot readiness before saving and sends them as ordered ids', async () => {
  const upload = deferred<{ id: string }>(); vi.mocked(AppsClient.upload).mockReturnValue(upload.promise as never);
  mount(); fill('App title', 'Shot app'); fill('App URL', 'https://example.com/shot');
  fireEvent.change(screen.getByLabelText('Screenshots'), { target: { files: [new File(['bytes'], 'shot.png', { type: 'image/png' })] } });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(AppsClient.createManual).not.toHaveBeenCalled();
  await act(async () => upload.resolve({ id: 'media-1' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved list');
  expect(vi.mocked(AppsClient.prepareManualIntent).mock.calls[0][1]).toMatchObject({ screenshotMediaIds: ['media-1'] });
 });

 it('preserves every typed field when the save fails and retries the same intent', async () => {
  vi.mocked(AppsClient.createManual).mockRejectedValueOnce(new Error('Temporarily unavailable')).mockResolvedValueOnce({ id: 'app-1' } as never);
  mount(); fill('App title', 'Retained draft'); fill('App URL', 'https://example.com/retained'); fill('Developer', 'Retained dev');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('App title')).toHaveValue('Retained draft');
  expect(screen.getByLabelText('Developer')).toHaveValue('Retained dev');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved list');
  expect(AppsClient.prepareManualIntent).toHaveBeenCalledTimes(1);
  expect(vi.mocked(AppsClient.createManual).mock.calls[0][0]).toBe(vi.mocked(AppsClient.createManual).mock.calls[1][0]);
 });

 it('cannot create an app once the account is replaced while the parent read is pending',async () => {
  const parent = deferred<never>(); vi.mocked(AppsClient.observeCollection).mockReturnValue(parent.promise);
  mount(); fill('App title', 'Old owner draft'); fill('App URL', 'https://example.com/old');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  act(() => useAuthStore.getState().logout());
  await act(async () => parent.resolve({ detail: { id: 'list-1' } } as never));
  expect(AppsClient.prepareManualIntent).not.toHaveBeenCalled();
  expect(AppsClient.createManual).not.toHaveBeenCalled();
  expect(screen.getByLabelText('App title')).toHaveValue('');
 });

 it('retains an oversized note and reports it without dispatching a save', async () => {
  mount(); fill('App title', 'Invalid draft'); fill('App URL', 'https://example.com/invalid');
  const note = '<p>' + 'a'.repeat(256 * 1024) + '</p>';
  fill('Note', note);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Rich note exceeds byte limit');
  expect(screen.getByLabelText('Note')).toHaveValue(note);
  expect(AppsClient.observeCollection).not.toHaveBeenCalled();
  expect(AppsClient.createManual).not.toHaveBeenCalled();
 });

 // The separate "Reorder apps" panel (ListItemOrder) is gone (LP-05): every row carries its own
 // grip, which is the drag handle and the keyboard path (Space to pick up, arrows, Enter to drop).
 it('every app row has a reorder grip, and a keyboard move saves the new order', async () => {
  const saved = vi.mocked(reorderListItems).mockResolvedValue({} as never);
  const app = (id: string, title: string) => ({ documentId: id, title, app_url: `https://example.com/${id}`, user_rating: null, user_recommendation_note: '', logo_url: null, developer: null, platforms: null, price_tier: null, download_url: null, description: null, screenshots: null, is_pinned: false });
  fixture.content.view.lists = [{ documentId: 'list-1', List_Name: 'List', slug: 'list', Visibility: false, recommended_apps: [app('a', 'Alpha'), app('b', 'Beta')], account: { documentId: 'a1', username: 'owner' } }]; fixture.content = { ...fixture.content };
  render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/apps/list-1']}><Routes><Route path="/recommendations/apps/:listId" element={<AppListView />} /></Routes></MemoryRouter></MockedProvider>);
  expect(screen.queryByRole('button', { name: 'Reorder apps' })).toBeNull();
  const grip = screen.getByRole('button', { name: 'Drag Alpha to reorder' }); expect(screen.getByRole('button', { name: 'Drag Beta to reorder' })).toBeEnabled();
  fireEvent.keyDown(grip, { key: ' ' }); fireEvent.keyDown(grip, { key: 'ArrowDown' }); fireEvent.keyDown(screen.getByRole('button', { name: 'Drag Alpha to reorder' }), { key: 'Enter' });
  await waitFor(() => expect(saved).toHaveBeenCalledWith('apps', 'list-1', ['b', 'a']));
 });

 // LP-04: per-item publication is gone from the list page. The list's own publish pill changes
 // only the collection; it never writes a recommendation's publication state.
 it('list publication goes through the list pill and never writes a recommendation', async () => {
  const app = { documentId: 'app-a', title: 'Manual app', app_url: 'https://example.com/a', user_rating: null, user_recommendation_note: '', logo_url: null, developer: null, platforms: null, price_tier: null, download_url: null, description: null, screenshots: null, is_pinned: false, app_list: { documentId: 'list-1', List_Name: 'Published list' } };
  fixture.content.view.lists = [{ documentId: 'list-1', List_Name: 'Published list', slug: 'published', Visibility: true, recommended_apps: [app], account: { documentId: 'a1', username: 'owner' } }];
  const observed = { detail: { id: 'list-1', revision: 1, category: 'apps' } };
  vi.mocked(AppsClient.observeCollection).mockResolvedValue(observed as never);
  vi.mocked(AppsClient.updateCollection).mockResolvedValue({} as never);
  render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/apps/list-1']}><Routes><Route path="/recommendations/apps/:listId" element={<AppListView />} /></Routes></MemoryRouter></MockedProvider>);
  expect(screen.queryByRole('button', { name: 'Publish Manual app' })).toBeNull();
  expect(screen.queryByText(/Recommendation is/)).toBeNull();
  fireEvent.click(document.querySelector('[aria-haspopup="menu"]')!); fireEvent.click(screen.getByRole('menuitemradio', { name: /draft/i }));
  await waitFor(() => expect(AppsClient.updateCollection).toHaveBeenCalledWith(observed, { visibility: 'private', publicationState: 'draft' }, expect.any(String), expect.any(AbortSignal)));
  expect(AppsClient.updateRecommendation).not.toHaveBeenCalled();
 });
});

describe('manual Apps edit', () => {
 function editElement() { return <MockedProvider><MemoryRouter initialEntries={['/apps/list-1/edit/app-a']}><Routes><Route path="/apps/:listId/edit/:appId" element={<AddAppPage />} /></Routes></MemoryRouter></MockedProvider>; }
 function loaded() {
  const app = { documentId: 'app-a', title: 'Original title', app_url: 'https://example.com/original', developer: 'Dev', logo_url: null, description: null, download_url: null, price_tier: 'Free', platforms: ['Web'], user_recommendation_note: '<p>Original note</p>', user_rating: 8, screenshots: null };
  fixture.content.view.lists = [{ documentId: 'list-1', recommended_apps: [app] }];
  fixture.content.details.set('app-a', { detail: { id: 'app-a', revision: 1, category: 'apps', appScreenshots: { screenshotMediaIds: ['media-7'] } } });
  fixture.content = { ...fixture.content }; fixture.loading = false; fixture.error = undefined;
 }
 beforeEach(() => { vi.clearAllMocks(); fixture.content = { view: { lists: [] }, details: new Map(), observation: {} }; fixture.loading = false; fixture.error = undefined; useAuthStore.getState().login({ id: 'u1', documentId: 'u1', username: 'owner', email: 'owner@example.test', blocked: false, token: 'fixture' }); useAuthStore.setState({ accountId: 'a1' }); });
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); });

 it('hydrates the typed fields and the saved screenshots, and locks the shared app URL', async () => {
  loaded(); render(editElement());
  expect(await screen.findByLabelText('App title')).toHaveValue('Original title');
  expect(screen.getByLabelText('App URL')).toHaveValue('https://example.com/original');
  // The URL is the shared entity's identity, so one owner cannot re-point it.
  expect(screen.getByLabelText('App URL')).toBeDisabled();
  expect(screen.getByLabelText('Price')).toHaveValue('Free');
  expect(screen.getByRole('button', { name: 'Web' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByAltText('App screenshot')).toHaveAttribute('src', '/api/explorers/v1/media/media-7/content');
 });

 it('never sends the app URL as a display override', async () => {
  loaded(); vi.mocked(AppsClient.updateRecommendation).mockResolvedValue({} as never);
  render(editElement());
  fireEvent.change(await screen.findByLabelText('App title'), { target: { value: 'Renamed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(AppsClient.updateRecommendation).toHaveBeenCalledTimes(1));
  const patch = vi.mocked(AppsClient.updateRecommendation).mock.calls[0][1] as { displayOverrides: Record<string, unknown> };
  expect(patch.displayOverrides).not.toHaveProperty('appUrl');
  expect(patch.displayOverrides.title).toBe('Renamed');
 });

 it('waits for owner hydration instead of exposing blank editable controls', async () => {
  fixture.loading = true; const view = render(editElement());
  expect(screen.getByRole('status')).toHaveTextContent('Loading app');
  expect(screen.queryByLabelText('App title')).not.toBeInTheDocument();
  loaded(); view.rerender(editElement());
  expect(await screen.findByLabelText('App title')).toHaveValue('Original title');
 });

 it('presents an owner read failure and retries only when asked', async () => {
  fixture.error = new Error('Owner temporarily unavailable'); const view = render(editElement());
  expect(screen.getByRole('alert')).toHaveTextContent('Owner temporarily unavailable');
  expect(fixture.refetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading app' }));
  expect(fixture.refetch).toHaveBeenCalledTimes(1);
  loaded(); view.rerender(editElement());
  expect(await screen.findByLabelText('App title')).toHaveValue('Original title');
 });

 it('preserves an unsaved edit on a background refresh and refuses to rebase its observation', async () => {
  loaded(); const original = fixture.content.details.get('app-a'); const view = render(editElement());
  fireEvent.change(await screen.findByLabelText('App title'), { target: { value: 'My unsaved edit' } });
  fixture.content = { view: { lists: [] }, details: new Map(), observation: {} }; fixture.error = new Error('Refresh unavailable');
  view.rerender(editElement());
  expect(screen.getByLabelText('App title')).toHaveValue('My unsaved edit');
  loaded(); fixture.content.details.set('app-a', { detail: { id: 'app-a', revision: 2, category: 'apps' } });
  view.rerender(editElement());
  expect(screen.getByLabelText('App title')).toHaveValue('My unsaved edit');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Reload the app before saving');
  expect(AppsClient.updateRecommendation).not.toHaveBeenCalled();
  expect(fixture.content.details.get('app-a')).not.toBe(original);
 });
});
