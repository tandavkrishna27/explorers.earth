import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicGames from '../PublicGames';
import GameDetailModal from '../GameDetailModal';
import GameCoverCard from '../GameCoverCard';
import type { RecommendedGame } from '../../../types';
const state = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('../../../../PublicHome/api/usePublicProfileShell', () => ({ usePublicProfileShell: () => ({ data: { documentId: 'account', Account_Name: 'Owner', public_games: 'Yes' }, loading: false, refetch: vi.fn() }) }));
vi.mock('../../../../PublicHome/api/usePublicRecommendationCategory', () => ({ usePublicRecommendationCategory: () => ({ data: state.data, loading: false, hasMore: false, refetch: vi.fn(), loadMore: vi.fn() }) }));
vi.mock('../../../../PublicHome/components/PublicHeaderDescriptorContext', () => ({ usePublicHeaderDescriptor: vi.fn() }));
vi.mock('../../../../../services/analyticsService', () => ({ useTrackAnalytics: () => ({ trackClick: vi.fn() }), createAnalyticsOptions: { games: vi.fn() } }));
vi.mock('../../../../../components/SEO', () => ({ default: () => null }));
vi.mock('../TopGamesHero', () => ({ default: ({ games }: { games: RecommendedGame[] }) => <div data-testid="root-hero">{games.map(game => `${game.title}:${game.game_list?.documentId}`).join(',')}</div> }));
vi.mock('../TopGamesMobileHero', () => ({ default: () => null }));
vi.mock('../../../../../components/ui/MediaViewer', () => ({ default: () => null }));
const game = (collection: string): RecommendedGame => ({ documentId: 'same', title: 'Manual game', igdb_id: null, igdb_slug: null, cover_url: '/api/explorers/v1/media/22222222-2222-4222-8222-222222222222/content', cover_url_large: null, igdb_image_id: null, summary: null, release_date: null, release_year: null, igdb_rating: null, igdb_rating_count: null, genres: null, platforms: null, developer: null, publisher: null, game_modes: null, screenshot_ids: null, igdb_url: null, user_recommendation_note: '<p>Retained note</p>', user_rating: 8, is_pinned: true, pin_order: 0, display_order: 0, media_details: null, game_list: { documentId: collection, List_Name: 'Selected list', slug: 'selected' }, game_categories: null, Media: [{ documentId: 'one', url: '/api/explorers/v1/media/22222222-2222-4222-8222-222222222222/content' }, { documentId: 'two', url: '/api/explorers/v1/media/33333333-3333-4333-8333-333333333333/content' }] });
afterEach(cleanup);
describe('manual Games public presentation', () => {
 it('renders root picks independently of the current category page and retains selected ancestry', () => {
  state.data = { gameLists: [], topPicks: [game('selected-list')] };
  render(<MemoryRouter initialEntries={['/owner/games']}><Routes><Route path="/:username/games" element={<PublicGames />} /></Routes></MemoryRouter>);
  expect(screen.getByTestId('root-hero')).toHaveTextContent('Manual game:selected-list');
 });
 it('renders native uploaded snapshots and note without a fabricated IGDB URL or identity', () => {
  const view = render(<GameDetailModal game={game('selected-list')} open onClose={vi.fn()} />);
  expect(screen.getAllByText('Retained note').length).toBeGreaterThan(0);
  expect([...view.container.querySelectorAll('img')].some(image => image.getAttribute('src') === '/api/explorers/v1/media/33333333-3333-4333-8333-333333333333/content')).toBe(true);
  expect(view.container.innerHTML).not.toContain('images.igdb.com');
  expect(view.container.innerHTML).not.toContain('IGDB');
 });
 it('keeps a clickable titled fallback after an admitted media image fails', () => {
  const clicked = vi.fn(); render(<GameCoverCard title="Unavailable snapshot" coverUrl="/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content" onClick={clicked} />);
  fireEvent.error(screen.getByAltText('Unavailable snapshot')); expect(screen.queryByRole('img')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Unavailable snapshot' })); expect(clicked).toHaveBeenCalledOnce();
 });
});
