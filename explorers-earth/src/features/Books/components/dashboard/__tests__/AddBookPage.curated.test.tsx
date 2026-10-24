import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AddBookPage from '../AddBookPage';
import useAuthStore from '../../../../../store/store';
import { explorersApiClient } from '../../../../../lib/explorersApiClient';
import { emptyBookDetails } from '../../../../../../../tunes/shared/explorersBookContract';

const SF = '00000000-0000-4000-8000-0000000000a1', HIST = '00000000-0000-4000-8000-0000000000a2';
const terms = [{ id: SF, label: 'Science Fiction', parentId: null, slug: 'science-fiction' }, { id: HIST, label: 'History', parentId: null, slug: 'history' }];
const catalog = { value: { terms, unconfigured: false, loading: false, error: null as Error | null } };
vi.mock('../../../../../lib/curatedTaxonomy', async importOriginal => ({ ...(await importOriginal<object>()), useCuratedCatalog: () => catalog.value }));
const owner: { content: unknown } = { content: {} };
vi.mock('../../../api/useBooksOwnerContent', () => ({ useBooksOwnerContent: () => owner.content }));
vi.mock('../../../../Favorites/components/TiptapEditor', () => ({ default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <textarea aria-label="Recommendation note" value={value} onChange={e => onChange(e.target.value)} /> }));
vi.mock('../../../../../lib/explorersApiClient', () => ({ explorersApiClient: { updateMyRecommendation: vi.fn(), getMyEditableRecommendation: vi.fn(), getCompleteMyCategoryTopPicks: vi.fn(), setMyCategoryTopPicks: vi.fn(), createMedia: vi.fn(), searchBookCandidates: vi.fn(), resolveBookEntity: vi.fn(), getMyEditableCollection: vi.fn(), createMyRecommendation: vi.fn(), importBookCovers: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const routes = (at: string) => render(<MemoryRouter initialEntries={[at]}><Routes><Route path="/books/:listId/add" element={<AddBookPage />} /><Route path="/books/:listId/edit/:bookId" element={<AddBookPage />} /><Route path="/recommendations/books/:listId" element={<p>Saved list</p>} /></Routes></MemoryRouter>);
const dune = { title: 'Dune', provider: 'google_books', externalKind: 'volume', externalId: 'dune', preview: { ...emptyBookDetails(), subjects: ['Fiction / Science Fiction / General'], providerRating: 4.5, isbn13: '9780441172719', languageTag: 'en' }, buyLinkSuggestion: null };

async function pickDune() {
  routes('/books/list/add');
  const box = screen.getByPlaceholderText('Search by title, author, or ISBN...');
  fireEvent.change(box, { target: { value: 'dune' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: /Dune/ }));
  await screen.findByLabelText('Recommendation note');
}

beforeEach(() => {
  vi.clearAllMocks();
  catalog.value = { terms, unconfigured: false, loading: false, error: null };
  owner.content = {};
  useAuthStore.setState({ generation: 2, accountId: 'owner' });
  vi.mocked(explorersApiClient.searchBookCandidates).mockResolvedValue({ items: [dune], nextCursor: null } as never);
  vi.mocked(explorersApiClient.resolveBookEntity).mockResolvedValue({ id: '00000000-0000-4000-8000-000000000003' } as never);
  vi.mocked(explorersApiClient.getMyEditableCollection).mockResolvedValue({ collection: { id: 'list', revision: 1 } } as never);
  vi.mocked(explorersApiClient.createMyRecommendation).mockResolvedValue({ id: 'rec' } as never);
  vi.mocked(explorersApiClient.getMyEditableRecommendation).mockResolvedValue({ detail: { id: 'rec', revision: 2 } } as never);
  vi.mocked(explorersApiClient.importBookCovers).mockResolvedValue({ slots: {} } as never);
  vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockResolvedValue({ topPicks: [] } as never);
  vi.mocked(explorersApiClient.setMyCategoryTopPicks).mockResolvedValue(undefined as never);
});

describe('Books on the add template with a curated category', () => {
  it('preselects the category from provider subjects, shows the Google rating only as a chip and sends curatedTermId', async () => {
    await pickDune();
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('Science Fiction');
    expect(screen.getByText('Google Books 4.5')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /Your rating/i })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText('9780441172719')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved list');
    expect(explorersApiClient.createMyRecommendation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ curatedTermId: SF, userRating: null }), expect.any(String), expect.any(AbortSignal));
  });

  it('hides the category and sends no curatedTermId when the catalog is unconfigured', async () => {
    catalog.value = { terms: [], unconfigured: true, loading: false, error: null };
    await pickDune();
    expect(screen.queryByRole('combobox', { name: 'Category' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved list');
    expect(vi.mocked(explorersApiClient.createMyRecommendation).mock.calls[0][1]).not.toHaveProperty('curatedTermId');
  });

  it('on edit shows the stored category and sends curatedTermId only after the owner changes it', async () => {
    const observation = { detail: { id: 'rec', revision: 1, curatedTerm: { catalogState: 'CONFIGURED', catalogVersion: 1, defaultLocale: 'en', term: { id: HIST, slug: 'history', label: 'History', unavailable: false }, selectionUnavailable: false } } };
    owner.content = { data: { bookLists: [{ recommended_books: [{ documentId: 'rec', entity_id: 'entity', title: 'Stored book', authors: [], subjects: [], Media: [], volume_id: 'v' }] }] }, content: { observation: { generation: 2 }, details: new Map([['rec', observation]]) } };
    const first = routes('/books/list/edit/rec');
    await screen.findByLabelText('Recommendation note');
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('History');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved list');
    expect(vi.mocked(explorersApiClient.updateMyRecommendation).mock.calls[0][1]).not.toHaveProperty('curatedTermId');
    first.unmount();

    routes('/books/list/edit/rec');
    await screen.findByLabelText('Recommendation note');
    const box = screen.getByRole('combobox', { name: 'Category' });
    fireEvent.focus(box);
    fireEvent.mouseDown(await screen.findByRole('option', { name: 'Science Fiction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(explorersApiClient.updateMyRecommendation).toHaveBeenCalledTimes(2));
    expect(vi.mocked(explorersApiClient.updateMyRecommendation).mock.calls[1][1]).toMatchObject({ curatedTermId: SF });
  });
});
