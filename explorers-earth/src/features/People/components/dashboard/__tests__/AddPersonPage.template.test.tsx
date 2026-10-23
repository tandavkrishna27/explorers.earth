import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {MockedProvider} from '@apollo/client/testing';
import AddPersonPage from '../AddPersonPage';
import {PeopleClient} from '../../../api/peopleClient';
import {linkPreviewClient} from '../../../../../lib/linkPreviewClient';
import useAuthStore from '../../../../../store/store';
import '../../../../../i18n';

// WP8 Task 8-13 (DS-02, DS-08, DS-09, ADD-12): sector required, no rating or follower count,
// profile link prefill with the platform detected from the link.

const fixture = vi.hoisted(() => ({content: {view: {lists: [] as unknown[]}, details: new Map(), observation: {}}, loading: false, error: undefined as Error | undefined, refetch: vi.fn()}));
vi.mock('../../../hooks/usePeopleOwner', () => ({usePeopleOwner: () => ({content: fixture.content, loading: fixture.loading, error: fixture.error, refetch: fixture.refetch}), invalidatePeople: vi.fn()}));
vi.mock('../../../api/peopleClient', () => ({PeopleClient: {readSectorCatalog: vi.fn(), observeCollection: vi.fn(), prepareManualIntent: vi.fn(), createManual: vi.fn(), upload: vi.fn(), updateRecommendation: vi.fn()}}));
vi.mock('../../../../../lib/linkPreviewClient', () => ({linkPreviewClient: {preview: vi.fn(), importImage: vi.fn(), searchApps: vi.fn()}}));
vi.mock('../../../../Favorites/components/TiptapEditor', () => ({default: ({value, onChange}: {value: string; onChange: (value: string) => void}) => <textarea aria-label="Note" value={value} onChange={event => onChange(event.target.value)} />}));
vi.mock('sonner', () => ({toast: {success: vi.fn(), error: vi.fn(), loading: vi.fn()}}));

const SECTOR = '00000000-0000-4000-8000-000000000123';
const catalog = () => ({complete: true, category: 'people', state: 'CONFIGURED', catalogVersion: 2, defaultLocale: 'en', requestedLocale: null,
 items: [{id: SECTOR, category: 'people', parentId: null, label: 'Design', slug: 'design', position: 0, resolvedLocale: 'en'}], nextCursor: null});
const PROFILE = 'https://www.instagram.com/ada.example/';
const preview = {url: PROFILE, title: 'Ada (@ada.example) on Instagram', description: 'Photos and videos', imageUrl: 'https://cdn.example/ada.jpg', siteName: 'Instagram',
 product: null, person: {name: 'Ada Example', headline: 'Type designer', sameAs: []}};

function mount() { return render(<MockedProvider><MemoryRouter initialEntries={['/people/list-1/add']}><Routes><Route path="/people/:listId/add" element={<AddPersonPage />} /><Route path="/recommendations/people/:listId" element={<p>Saved list</p>} /></Routes></MemoryRouter></MockedProvider>); }
const draft = () => vi.mocked(PeopleClient.prepareManualIntent).mock.calls[0][1] as Record<string, any>;
const paste = (url: string) => {
 const field = screen.getByLabelText('Profile link');
 fireEvent.change(field, {target: {value: url}});
 fireEvent.paste(field, {clipboardData: {getData: () => url}});
};
const save = () => screen.getByRole('button', {name: 'Save'});

describe('People template', () => {
 beforeEach(() => {
  vi.clearAllMocks(); fixture.content = {view: {lists: []}, details: new Map(), observation: {}};
  useAuthStore.getState().login({id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture'}); useAuthStore.setState({accountId: 'a1'});
  vi.mocked(PeopleClient.readSectorCatalog).mockResolvedValue(catalog() as never);
  vi.mocked(PeopleClient.observeCollection).mockResolvedValue({detail: {id: 'list-1'}} as never);
  vi.mocked(PeopleClient.prepareManualIntent).mockImplementation((parent, d) => ({parent, draft: d}) as never);
  vi.mocked(PeopleClient.createManual).mockResolvedValue({id: 'person-1'} as never);
  vi.mocked(linkPreviewClient.preview).mockResolvedValue(preview as never);
  vi.mocked(linkPreviewClient.importImage).mockResolvedValue({id: 'media-photo'});
 });
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); });

 it('renders no rating, follower or platform control', async () => {
  mount(); await screen.findByRole('option', {name: 'Design'});
  expect(screen.queryByLabelText('Your rating')).toBeNull();
  expect(screen.queryByRole('slider')).toBeNull();
  expect(screen.queryByLabelText('Followers')).toBeNull();
  expect(screen.queryByLabelText('Platform')).toBeNull();
 });

 it('keeps Save disabled until a sector is chosen', async () => {
  mount(); await screen.findByRole('option', {name: 'Design'});
  fireEvent.change(screen.getByLabelText('Full Name'), {target: {value: 'Ada'}});
  expect(save()).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', {name: 'Sector'}), {target: {value: SECTOR}});
  expect(save()).toBeEnabled();
 });

 it('detects the platform and prefills name, headline and photo from the pasted profile link', async () => {
  mount(); paste(PROFILE);
  await waitFor(() => expect(screen.getByLabelText('Full Name')).toHaveValue('Ada Example'));
  expect(screen.getByLabelText('Headline / Role')).toHaveValue('Type designer');
  expect(screen.getByText('Instagram', {selector: '[data-detected-platform]'})).toBeInTheDocument();
  await waitFor(() => expect(linkPreviewClient.importImage).toHaveBeenCalledWith('https://cdn.example/ada.jpg'));
  expect(await screen.findByAltText('Person snapshot')).toHaveAttribute('src', '/api/explorers/v1/media/media-photo/content');
 });

 it('allows four extra social links keyed by their detected platform, a repeat platform going to other', async () => {
  mount(); paste(PROFILE);
  await waitFor(() => expect(screen.getByLabelText('Full Name')).toHaveValue('Ada Example'));
  const add = () => fireEvent.click(screen.getByRole('button', {name: '+ Add social link'}));
  add(); fireEvent.change(screen.getByLabelText('Social link 1'), {target: {value: 'https://github.com/ada'}});
  add(); fireEvent.change(screen.getByLabelText('Social link 2'), {target: {value: 'https://www.instagram.com/ada.studio/'}});
  add(); add();
  expect(screen.getAllByLabelText(/^Social link \d$/)).toHaveLength(4);
  expect(screen.queryByRole('button', {name: '+ Add social link'})).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'Remove social link 4'}));
  fireEvent.click(screen.getByRole('button', {name: 'Remove social link 3'}));
  fireEvent.change(screen.getByRole('combobox', {name: 'Sector'}), {target: {value: SECTOR}});
  fireEvent.change(screen.getByLabelText('Skills'), {target: {value: 'Lettering'}});
  fireEvent.keyDown(screen.getByLabelText('Skills'), {key: 'Enter'});
  await waitFor(() => expect(save()).toBeEnabled());
  fireEvent.click(save());
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({title: 'Ada Example', headline: 'Type designer', primaryPlatform: 'instagram',
   socialUrls: {primary: PROFILE, instagram: PROFILE, github: 'https://github.com/ada', other: 'https://www.instagram.com/ada.studio/'},
   skillsTags: ['Lettering'], userRating: null, externalFollowerCountText: null, peopleSectorTermId: SECTOR, mediaIds: ['media-photo']});
 });

 it('saves null rating and follower text on edit even for an old row that had them', async () => {
  const person = {documentId: 'person-a', name: 'Old', username_handle: null, headline: null, location: null, follower_count: '12k', primary_platform: 'github', profile_url: 'https://github.com/old',
   social_urls: {primary: 'https://github.com/old', github: 'https://github.com/old', website: 'https://old.example'}, skills_tags: [], user_recommendation_note: '', user_rating: 9};
  fixture.content.view.lists = [{documentId: 'list-1', recommended_people: [person]}];
  fixture.content.details.set('person-a', {detail: {id: 'person-a', revision: 1, category: 'people', mediaIds: [], peopleSector: {sector: {id: SECTOR, slug: 'design', label: 'Design', unavailable: false}}}});
  vi.mocked(PeopleClient.updateRecommendation).mockResolvedValue({} as never);
  render(<MockedProvider><MemoryRouter initialEntries={['/people/list-1/edit/person-a']}><Routes><Route path="/people/:listId/edit/:personId" element={<AddPersonPage />} /></Routes></MemoryRouter></MockedProvider>);
  expect(await screen.findByLabelText('Social link 1')).toHaveValue('https://old.example');
  await screen.findByRole('option', {name: 'Design'});
  fireEvent.click(save());
  await waitFor(() => expect(PeopleClient.updateRecommendation).toHaveBeenCalledTimes(1));
  const patch = vi.mocked(PeopleClient.updateRecommendation).mock.calls[0][1] as {displayOverrides: Record<string, unknown>; userRating: unknown};
  expect(patch.userRating).toBeNull();
  expect(patch.displayOverrides).toMatchObject({externalFollowerCountText: null, socialUrls: {primary: 'https://github.com/old', github: 'https://github.com/old', website: 'https://old.example'}});
 });
});
