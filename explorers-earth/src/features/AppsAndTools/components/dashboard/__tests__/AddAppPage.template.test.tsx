import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {MockedProvider} from '@apollo/client/testing';
import AddAppPage from '../AddAppPage';
import {AppsClient} from '../../../api/appsClient';
import {linkPreviewClient} from '../../../../../lib/linkPreviewClient';
import useAuthStore from '../../../../../store/store';
import '../../../../../i18n';

// WP8 Task 8-7: one app link, up to four other platform links, App Store search.

const fixture = vi.hoisted(() => ({content: {view: {lists: [] as unknown[]}, details: new Map(), observation: {}}, loading: false, error: undefined as Error | undefined, refetch: vi.fn()}));
vi.mock('../../../hooks/useAppsOwner', () => ({useAppsOwner: () => ({content: fixture.content, loading: fixture.loading, error: fixture.error, refetch: fixture.refetch}), invalidateApps: vi.fn()}));
vi.mock('../../../api/appsClient', () => ({AppsClient: {observeCollection: vi.fn(), prepareManualIntent: vi.fn(), createManual: vi.fn(), upload: vi.fn(), updateRecommendation: vi.fn()}}));
vi.mock('../../../../../lib/linkPreviewClient', () => ({linkPreviewClient: {preview: vi.fn(), importImage: vi.fn(), searchApps: vi.fn()}}));
vi.mock('../../../../Favorites/components/TiptapEditor', () => ({default: ({value, onChange}: {value: string; onChange: (value: string) => void}) => <textarea aria-label="Note" value={value} onChange={event => onChange(event.target.value)} />}));
vi.mock('../../../../../lib/curatedTaxonomy', () => ({useCuratedCatalog: (category: string) => ({
 terms: category === 'apps' ? [{id: '00000000-0000-4000-8000-000000000201', label: 'Productivity', parentId: null, slug: 'productivity'}, {id: '00000000-0000-4000-8000-000000000202', label: 'Games', parentId: null, slug: 'games'}] : [],
 unconfigured: false, loading: false, error: null})}));
vi.mock('sonner', () => ({toast: {success: vi.fn(), error: vi.fn(), loading: vi.fn()}}));

const hit = {title: 'Notion', developer: 'Notion Labs', appUrl: 'https://apps.apple.com/app/notion/id1232780281', iconUrl: 'https://is1.example/notion.png',
 priceTier: 'Free', platforms: ['iOS'], genres: ['Productivity'], screenshotUrls: []};

function mount() { return render(<MockedProvider><MemoryRouter initialEntries={['/apps/list-1/add']}><Routes><Route path="/apps/:listId/add" element={<AddAppPage />} /><Route path="/recommendations/apps/:listId" element={<p>Saved list</p>} /></Routes></MemoryRouter></MockedProvider>); }
const draft = () => vi.mocked(AppsClient.prepareManualIntent).mock.calls[0][1] as Record<string, any>;

async function searchAndPick() {
 const box = screen.getByPlaceholderText('Search the App Store');
 fireEvent.change(box, {target: {value: 'notion'}});
 fireEvent.keyDown(box, {key: 'Enter'});
 fireEvent.click(await screen.findByRole('option', {name: /Notion/}));
}

describe('Apps template', () => {
 beforeEach(() => {
  vi.clearAllMocks(); fixture.content = {view: {lists: []}, details: new Map(), observation: {}};
  useAuthStore.getState().login({id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture'}); useAuthStore.setState({accountId: 'a1'});
  vi.mocked(AppsClient.observeCollection).mockResolvedValue({detail: {id: 'list-1'}} as never);
  vi.mocked(AppsClient.prepareManualIntent).mockImplementation((parent, d) => ({parent, draft: d}) as never);
  vi.mocked(AppsClient.createManual).mockResolvedValue({id: 'app-1'} as never);
  vi.mocked(linkPreviewClient.searchApps).mockResolvedValue([hit] as never);
  vi.mocked(linkPreviewClient.importImage).mockResolvedValue({id: 'media-icon'});
  vi.mocked(linkPreviewClient.preview).mockResolvedValue({url: 'https://play.example/notion', title: 'Notion for Android', description: 'Notes', imageUrl: null, siteName: 'Play', product: null, person: null} as never);
 });
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); });

 it('fills the form from an App Store hit and imports its icon as the picked card image', async () => {
  mount(); await searchAndPick();
  await waitFor(() => expect(screen.getByLabelText('App title')).toHaveValue('Notion'));
  expect(linkPreviewClient.searchApps).toHaveBeenCalledWith('notion', undefined, expect.anything());
  expect(screen.getByLabelText('Developer')).toHaveValue('Notion Labs');
  expect(screen.getByLabelText('App URL')).toHaveValue(hit.appUrl);
  expect(screen.getByRole('button', {name: 'iOS'})).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Price')).toHaveValue('Free');
  await waitFor(() => expect(linkPreviewClient.importImage).toHaveBeenCalledWith(hit.iconUrl));
  await waitFor(() => expect(screen.getByText('Notion', {selector: 'b'}).closest('[role="status"]')!.querySelector('img')).toHaveAttribute('src', '/api/explorers/v1/media/media-icon/content'));
 });

 it('has no Download URL or Logo URL field and keeps four price models', () => {
  mount();
  expect(screen.queryByLabelText('Download URL')).toBeNull();
  expect(screen.queryByLabelText('Logo URL')).toBeNull();
  const options = Array.from((screen.getByLabelText('Price') as HTMLSelectElement).options).map(option => option.value).filter(Boolean);
  expect(options).toEqual(['Free', 'Freemium', 'Paid', 'Subscription']);
  expect(screen.getByRole('slider', {name: 'Your rating'})).toBeInTheDocument();
 });

 it('adds other platform links up to four and then hides the button', () => {
  mount();
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', {name: '+ Add another platform link'}));
  expect(screen.getAllByLabelText(/^Other link \d/)).toHaveLength(4);
  expect(screen.queryByRole('button', {name: '+ Add another platform link'})).toBeNull();
 });

 it('saves the app link, the other links, no download link and the icon', async () => {
  mount(); await searchAndPick();
  await waitFor(() => expect(linkPreviewClient.importImage).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', {name: '+ Add another platform link'}));
  fireEvent.change(screen.getByLabelText('Other link 1'), {target: {value: 'https://play.google.com/store/apps/details?id=notion.id'}});
  await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({title: 'Notion', appUrl: hit.appUrl, developer: 'Notion Labs', downloadUrl: null, logoUrl: null, priceTier: 'Free', platforms: ['iOS'],
   otherLinks: [{label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=notion.id'}], mediaIds: ['media-icon']});
 });

 it('saves the curated category chosen from the apps catalog', async () => {
  mount(); await searchAndPick();
  await waitFor(() => expect(linkPreviewClient.importImage).toHaveBeenCalled());
  const box = screen.getByRole('combobox', {name: 'Category'});
  fireEvent.focus(box); fireEvent.change(box, {target: {value: 'Produ'}});
  fireEvent.mouseDown(screen.getByRole('option', {name: 'Productivity'}));
  await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({curatedTermId: '00000000-0000-4000-8000-000000000201'});
 });

 it('saves no curated category when none is chosen, and sends none on edit unless picked', async () => {
  mount(); await searchAndPick();
  await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({curatedTermId: null});
 });

 it('prefills empty fields from a pasted store or web link', async () => {
  mount();
  const field = screen.getByLabelText('App URL');
  fireEvent.change(field, {target: {value: 'https://play.example/notion'}});
  fireEvent.paste(field, {clipboardData: {getData: () => 'https://play.example/notion'}});
  await waitFor(() => expect(screen.getByLabelText('App title')).toHaveValue('Notion for Android'));
  expect(screen.getByLabelText('Developer')).toHaveValue('Play');
  expect(screen.getByLabelText('Description')).toHaveValue('Notes');
 });

 it('shows an old download link as an other link on edit and saves downloadUrl null', async () => {
  const app = {documentId: 'app-a', title: 'Old', app_url: 'https://old.example/app', developer: null, logo_url: null, description: null, download_url: 'https://dl.example/app', other_links: [], price_tier: null, platforms: null, user_recommendation_note: '', user_rating: null, screenshots: null};
  fixture.content.view.lists = [{documentId: 'list-1', recommended_apps: [app]}];
  fixture.content.details.set('app-a', {detail: {id: 'app-a', revision: 1, category: 'apps', mediaIds: [], appScreenshots: {screenshotMediaIds: []}}});
  vi.mocked(AppsClient.updateRecommendation).mockResolvedValue({} as never);
  render(<MockedProvider><MemoryRouter initialEntries={['/apps/list-1/edit/app-a']}><Routes><Route path="/apps/:listId/edit/:appId" element={<AddAppPage />} /></Routes></MemoryRouter></MockedProvider>);
  expect(await screen.findByLabelText('Other link 1')).toHaveValue('https://dl.example/app');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await waitFor(() => expect(AppsClient.updateRecommendation).toHaveBeenCalledTimes(1));
  const patch = vi.mocked(AppsClient.updateRecommendation).mock.calls[0][1] as {displayOverrides: Record<string, unknown>};
  expect(patch.displayOverrides).toMatchObject({downloadUrl: null, otherLinks: [{label: 'Link', url: 'https://dl.example/app'}]});
  // The editable read does not carry the stored curated term, so an untouched edit leaves it alone.
  expect(patch).not.toHaveProperty('curatedTermId');
 });
});
