import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicBooks from '../components/public/PublicBooks';
import PublicBookList from '../components/public/PublicBookList';
import PublicBookSubject from '../components/public/PublicBookSubject';
import useAuthStore from '../../../store/store';
const state = vi.hoisted(() => ({ data: undefined as any, detail: undefined as any, publicBooks: 'Yes', error: null as any }));
vi.mock('../../PublicHome/api/usePublicProfileShell', () => ({ usePublicProfileShell: () => ({ data: { documentId: 'creator-1', username: 'alice', public_books: state.publicBooks }, loading: false, error: null, refetch: vi.fn() }) }));
vi.mock('../../PublicHome/api/usePublicRecommendationCategory', () => ({ usePublicRecommendationCategory: () => ({ data: state.data, loading: !state.data, error: state.error, refetch: vi.fn() }) }));
vi.mock('../../PublicHome/api/usePublicProfileDetail', () => ({ usePublicProfileDetail: () => ({ data: state.detail, loading: !state.detail, error: state.error, refetch: vi.fn() }) }));
vi.mock('../../PublicHome/components/PublicHeaderDescriptorContext', () => ({ usePublicHeaderDescriptor: vi.fn() }));
vi.mock('../../../components/SEO', () => ({ default: () => null }));
vi.mock('../../../hooks/useDeviceDetection', () => ({ default: () => ({ isDesktop: true }) }));
vi.mock('../components/public/BookDetailModal', () => ({ default: () => null }));
vi.mock('../components/public/TopReadsHero', () => ({ default: () => null }));
vi.mock('../components/public/TopReadsMobileHero', () => ({ default: () => null }));
vi.mock('../components/public/BookCarouselRow', () => ({ default: ({ list, onBookClick }: any) => <button onClick={() => onBookClick(list.recommended_books[0])}>Open test book</button> }));
vi.mock('../components/public/BookCoverCard', () => ({ default: ({ book, onClick }: any) => <button onClick={() => onClick(book)}>Open test book</button> }));
const book = { documentId: 'recommendation-1', title: 'A Book', authors: ['Writer'], subjects: ['Science'], book_list: { documentId: 'collection-1', List_Name: 'Reading' }, is_pinned: false };
const list = { documentId: 'collection-1', List_Name: 'Reading', slug: 'reading', recommended_books: [book], account: { documentId: 'creator-1' } };
function mount(path: string, component: React.ReactNode) { window.history.replaceState({}, '', path); return render(<MemoryRouter initialEntries={[path]}><Routes><Route path='/:username/books' element={component}/><Route path='/:username/books/:listSlug' element={component}/><Route path='/:username/books/subject/:subjectSlug' element={component}/></Routes></MemoryRouter>); }
describe('canonical Books analytics producers with real hook and transport', () => {
    const requests: any[] = [];
    beforeEach(() => { state.data = undefined; state.detail = undefined; state.error = null; state.publicBooks = 'Yes'; requests.length = 0; sessionStorage.clear(); localStorage.setItem('explorers-cookie-consent', JSON.stringify({ analytics: true })); useAuthStore.setState({ isAuthenticated: false, user: null, token: null }); vi.stubGlobal('fetch', vi.fn(async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return new Response('{"status":"committed","duplicate":false}', { status: 201 }); })); });
    it('does not submit a main view before usable data, then accepts successful empty data', async () => { const view = mount('/alice/books', <PublicBooks />); await act(async () => { }); expect(requests).toHaveLength(0); state.data = { bookLists: [] }; view.rerender(<MemoryRouter initialEntries={["/alice/books"]}><Routes><Route path="/:username/books" element={<PublicBooks />}/></Routes></MemoryRouter>); await waitFor(() => expect(requests).toHaveLength(1)); expect(requests[0].url).toBe('/api/explorers/analytics/events'); });
    it.each([['list', '/alice/books/reading', PublicBookList], ['subject', '/alice/books/subject/science', PublicBookSubject]] as const)('records %s view and displayed card using canonical IDs', async (_kind, path, Component) => { state.data = { bookLists: [list] }; state.detail = { bookLists: [list] }; mount(path, <Component />); await waitFor(() => expect(requests).toHaveLength(1)); fireEvent.click(screen.getByText('Open test book')); await waitFor(() => expect(requests).toHaveLength(2)); expect(requests[1].body).toMatchObject({ accountId: 'creator-1', locationId: 'collection-1', recommendationId: 'recommendation-1', event: { page: 'public-books', canonicalPath: path, type: 'click' } }); });
    it('private Books does not emit even when stale usable data remains', async () => { state.publicBooks = 'No'; state.data = { bookLists: [list] }; mount('/alice/books', <PublicBooks />); await act(async () => { }); expect(requests).toHaveLength(0); });
    it.each(['denied consent', 'owner visit'])('emits zero view and card requests for %s', async (mode) => {
        state.data = { bookLists: [list] }; state.detail = { bookLists: [list] };
        if (mode === 'denied consent') localStorage.clear();
        else useAuthStore.setState({ isAuthenticated: true, user: { username: 'ALICE' } as any });
        mount('/alice/books/reading', <PublicBookList />);
        fireEvent.click(screen.getByText('Open test book'));
        await act(async () => {}); expect(requests).toHaveLength(0);
    });
    it('failed unusable category data emits zero and retained usable partial data emits one', async () => {
        state.error = new Error('category failed'); state.data = { bookLists: [] };
        const view = mount('/alice/books', <PublicBooks />);
        await act(async () => {}); expect(requests).toHaveLength(0);
        state.data = { bookLists: [list] };
        view.rerender(<MemoryRouter initialEntries={['/alice/books']}><Routes><Route path='/:username/books' element={<PublicBooks />}/></Routes></MemoryRouter>);
        await waitFor(() => expect(requests).toHaveLength(1));
    });});
