import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GameDetailModal from '../GameDetailModal';
import type { RecommendedGame } from '../../../types';
vi.mock('../../../../../components/ui/MediaViewer', () => ({ default: () => null }));
const game = (overrides: Partial<RecommendedGame> = {}): RecommendedGame => ({ documentId: 'g1', title: 'Celeste', igdb_id: 1, igdb_slug: null, cover_url: null, cover_url_large: null, igdb_image_id: null, summary: null, release_date: null, release_year: '2018', igdb_rating: 87.3, igdb_rating_count: 10, genres: ['Platform'], platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 4'], developer: 'Maddy Makes Games', publisher: null, game_modes: null, screenshot_ids: null, igdb_url: null, user_recommendation_note: null, user_rating: 4, is_pinned: false, pin_order: null, display_order: 0, media_details: null, game_list: null, game_categories: null, Media: [], ...overrides });
afterEach(cleanup);
describe('GameDetailModal facts (UAT-01)', () => {
 it('shows every platform, the developer and an IGDB source chip separate from the owner rating', () => {
  render(<GameDetailModal game={game()} open onClose={vi.fn()} />);
  for (const platform of ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 4']) expect(screen.getByText(platform)).toBeInTheDocument();
  expect(screen.getByText('Maddy Makes Games')).toBeInTheDocument();
  expect(screen.getByText('IGDB 87')).toBeInTheDocument();
  expect(screen.queryByText('87.3 IGDB')).toBeNull();
 });
 it('renders no IGDB chip without a provider rating and no platform chips without platforms', () => {
  render(<GameDetailModal game={game({ igdb_rating: null, platforms: null, developer: null })} open onClose={vi.fn()} />);
  expect(document.body.innerHTML).not.toContain('IGDB');
  expect(screen.queryByText('Nintendo Switch')).toBeNull();
 });
});
