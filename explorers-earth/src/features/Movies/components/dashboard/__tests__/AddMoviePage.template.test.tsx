import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { explorersApiClient } from '../../../../../lib/explorersApiClient';
import { emptyMovieDetails } from '../../../../../../../tunes/shared/explorersMovieContract';
import AddMoviePage from '../AddMoviePage';

const DRAMA = '11111111-1111-4111-8111-111111111111', SCIFI = '22222222-2222-4222-8222-222222222222';
const mount = () => render(<MemoryRouter initialEntries={['/recommendations/movies/l1/add']}><Routes><Route path="/recommendations/movies/:listId/add" element={<AddMoviePage />} /></Routes></MemoryRouter>);
const candidate = (externalId: string, externalKind: 'movie' | 'tv', title: string) => ({ provider: 'tmdb', externalId, externalKind, title, yearText: '1999', posterUrl: null });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(explorersApiClient, 'getCompleteTaxonomyCatalog').mockResolvedValue({ state: 'CONFIGURED', items: [
    { id: DRAMA, label: 'Drama', parentId: null, slug: 'drama' },
    { id: SCIFI, label: 'Science Fiction', parentId: null, slug: 'science-fiction' },
  ] } as never);
});

async function pick(title: RegExp) {
  const box = await screen.findByRole('combobox');
  fireEvent.change(box, { target: { value: 'query' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: title }));
}

it('search-first: Enter searches; picking shows runtime and the TMDB chip, never stars from TMDB', async () => {
  vi.spyOn(explorersApiClient, 'searchMovieCandidates').mockResolvedValue({ items: [candidate('603', 'movie', 'The Matrix')], nextCursor: null } as never);
  vi.spyOn(explorersApiClient, 'resolveMovieEntity').mockResolvedValue({ id: 'e1', title: 'The Matrix', details: { ...emptyMovieDetails('movie'), runtimeMinutes: 136, providerRating: 8.2, genres: [{ providerGenreId: 878, name: 'Science Fiction' }] } } as never);
  mount();
  await pick(/The Matrix/);
  expect(await screen.findByText('136 min')).toBeTruthy();
  expect(screen.getByText('TMDB 8.2')).toBeTruthy();
  expect(screen.getByRole('slider', { name: /Your rating/i })).toHaveAttribute('aria-valuenow', '0');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Science Fiction' })).toHaveAttribute('aria-pressed', 'true'));
  expect(screen.getByRole('button', { name: 'Drama' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('toolbar', { name: /Item actions/i })).toBeTruthy();
});

it('a show displays seasons', async () => {
  vi.spyOn(explorersApiClient, 'searchMovieCandidates').mockResolvedValue({ items: [candidate('1399', 'tv', 'Dark')], nextCursor: null } as never);
  vi.spyOn(explorersApiClient, 'resolveMovieEntity').mockResolvedValue({ id: 'e2', title: 'Dark', details: { ...emptyMovieDetails('tv'), seasonCount: 3, providerRating: 8.4 } } as never);
  mount();
  await pick(/Dark/);
  await waitFor(() => expect(screen.getByText('3 seasons')).toBeTruthy());
});

it('the owner can toggle genres and the selection is saved as movie terms', async () => {
  vi.spyOn(explorersApiClient, 'searchMovieCandidates').mockResolvedValue({ items: [candidate('603', 'movie', 'The Matrix')], nextCursor: null } as never);
  vi.spyOn(explorersApiClient, 'resolveMovieEntity').mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333', title: 'The Matrix', details: { ...emptyMovieDetails('movie'), genres: [{ providerGenreId: 878, name: 'Science Fiction' }] } } as never);
  const parent = { resourceId: 'l1', detail: { id: 'l1', category: 'movies' } };
  vi.spyOn(explorersApiClient, 'getMyEditableCollection').mockResolvedValue(parent as never);
  const create = vi.spyOn(explorersApiClient, 'createMyRecommendation').mockResolvedValue({ id: 'r1' } as never);
  mount();
  await pick(/The Matrix/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Science Fiction' })).toHaveAttribute('aria-pressed', 'true'));
  fireEvent.click(screen.getByRole('button', { name: 'Drama' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith(parent, expect.objectContaining({ movieTermIds: [SCIFI, DRAMA], userRating: null }), expect.any(String), expect.any(AbortSignal)));
});
