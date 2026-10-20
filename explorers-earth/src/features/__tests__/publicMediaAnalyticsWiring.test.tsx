import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicMovieList from '../Movies/components/public/PublicMovieList';
import PublicMovieGenre from '../Movies/components/public/PublicMovieGenre';
import PublicGamesList from '../Games/components/public/PublicGamesList';
import PublicGamesGenre from '../Games/components/public/PublicGamesGenre';
import MapView from '../PublicHome/components/MapView';
import PlaceMapView from '../PublicHome/components/PlaceMapView';

// Movies and Games list/genre pages, and the two Places map pages, used to send nothing.
// Each page must start the same page-view tracking its siblings use and report item clicks.
const mocks = vi.hoisted(() => ({
  trackClick: vi.fn(),
  hookOptions: vi.fn(),
  detail: undefined as unknown,
  genre: undefined as unknown,
  category: undefined as unknown,
}));

vi.mock('../../services/analyticsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/analyticsService')>();
  return {
    ...actual,
    useTrackAnalytics: (options: unknown) => (mocks.hookOptions(options), {
      trackClick: mocks.trackClick,
      trackView: vi.fn(),
      trackInteraction: vi.fn(),
      trackEvent: vi.fn(),
      loading: false,
      error: null,
    }),
  };
});
vi.mock('../PublicHome/api/usePublicProfileShell', () => ({
  usePublicProfileShell: () => ({
    data: { documentId: 'account-1', Account_Name: 'TK', public_games: 'Yes', public_movie: 'Yes' },
    loading: false, error: null, refetch: vi.fn(),
  }),
}));
vi.mock('../PublicHome/api/usePublicProfileDetail', () => ({
  usePublicProfileDetail: () => ({ data: mocks.detail, loading: false, error: null, refetch: vi.fn(), hasMore: false }),
}));
vi.mock('../Movies/api/usePublicMovieGenre', () => ({
  usePublicMovieGenre: () => ({ data: mocks.genre, loading: false, error: null, refetch: vi.fn(), hasMore: false }),
}));
vi.mock('../PublicHome/api/usePublicRecommendationCategory', () => ({
  usePublicRecommendationCategory: () => ({ data: mocks.category, loading: false, error: null, refetch: vi.fn(), hasMore: false }),
}));
vi.mock('../PublicHome/components/PublicHeaderDescriptorContext', () => ({ usePublicHeaderDescriptor: vi.fn() }));
vi.mock('../PublicHome/components/PublicScrollContinuation', () => ({ PublicScrollContinuation: () => null }));
vi.mock('../../components/SEO', () => ({ default: () => null }));
vi.mock('../Movies/components/public/MoviePosterCard', () => ({
  default: ({ movie, onClick }: any) => <button onClick={() => onClick(movie)}>{movie.title}</button>,
}));
vi.mock('../Movies/components/public/MovieDetailModal', () => ({ default: () => null }));
vi.mock('../Games/components/public/GameCoverCard', () => ({
  default: ({ title, onClick }: any) => <button onClick={onClick}>{title}</button>,
}));
vi.mock('../Games/components/public/GameDetailModal', () => ({ default: () => null }));
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: any) => <>{children}</>,
  AdvancedMarker: ({ children }: any) => <>{children}</>,
  Map: ({ children }: any) => <>{children}</>,
  Pin: () => null,
  useApiIsLoaded: () => false,
  useMap: () => null,
}));

const movieList = { documentId: 'movie-list-1', List_Name: 'Weekend', slug: 'weekend' };
const movie = {
  documentId: 'movie-1', title: 'Heat', media_type: 'Movie', genres: ['Drama'], is_pinned: false,
  movie_list: movieList,
};
const gameList = { documentId: 'game-list-1', List_Name: 'Backlog', slug: 'backlog' };
const game = {
  documentId: 'game-1', title: 'Elden Ring', genres: ['RPG'], cover_url: null, is_pinned: false,
  game_list: gameList,
};

function renderAt(path: string, route: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path={route} element={element} /></Routes>
    </MemoryRouter>,
  );
}

describe('public media analytics wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detail = undefined;
    mocks.genre = undefined;
    mocks.category = undefined;
  });
  afterEach(cleanup);

  it('tracks the movies list page view target and movie clicks', () => {
    mocks.detail = { movieLists: [{ ...movieList, recommended_movies: [movie] }] };
    renderAt('/tk2727/movies/weekend', '/:username/movies/:listSlug', <PublicMovieList />);

    expect(mocks.hookOptions).toHaveBeenLastCalledWith(expect.objectContaining({
      accountId: 'account-1', pageName: 'public-movies', pageUsername: 'tk2727',
      locationId: 'movie-list-1', autoTrackView: true,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Heat' }));
    expect(mocks.trackClick).toHaveBeenCalledWith('movie-card', expect.objectContaining({
      id: 'movie-1', listId: 'movie-list-1', listName: 'Weekend', title: 'Heat',
    }));
  });

  it('tracks the movies genre page view target and movie clicks', () => {
    mocks.genre = { genre: { documentId: 'genre-1', slug: 'drama', genre_name: 'Drama' }, recommended_movies: [movie] };
    renderAt('/tk2727/movies/genre/drama', '/:username/movies/genre/:genreSlug', <PublicMovieGenre />);

    expect(mocks.hookOptions).toHaveBeenLastCalledWith(expect.objectContaining({
      accountId: 'account-1', pageName: 'public-movies', pageUsername: 'tk2727', autoTrackView: true, ready: true,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Heat' }));
    expect(mocks.trackClick).toHaveBeenCalledWith('movie-card', expect.objectContaining({
      id: 'movie-1', listId: 'movie-list-1', listName: 'Weekend', title: 'Heat', genre: 'drama',
    }));
  });

  it('tracks the games list page view target and game clicks', () => {
    mocks.detail = { gameLists: [{ ...gameList, recommended_games: [game] }] };
    renderAt('/tk2727/games/backlog', '/:username/games/:listSlug', <PublicGamesList />);

    expect(mocks.hookOptions).toHaveBeenLastCalledWith(expect.objectContaining({
      accountId: 'account-1', pageName: 'public-games', pageUsername: 'tk2727',
      locationId: 'game-list-1', autoTrackView: true,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Elden Ring' }));
    expect(mocks.trackClick).toHaveBeenCalledWith('game-card', expect.objectContaining({
      id: 'game-1', listId: 'game-list-1', listName: 'Backlog', title: 'Elden Ring',
    }));
  });

  it('tracks the games genre page view target and game clicks', () => {
    mocks.category = { gameLists: [{ ...gameList, recommended_games: [game] }] };
    renderAt('/tk2727/games/genre/rpg', '/:username/games/genre/:genreSlug', <PublicGamesGenre />);

    expect(mocks.hookOptions).toHaveBeenLastCalledWith(expect.objectContaining({
      accountId: 'account-1', pageName: 'public-games', pageUsername: 'tk2727', autoTrackView: true, ready: true,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Elden Ring' }));
    expect(mocks.trackClick).toHaveBeenCalledWith('game-card', expect.objectContaining({
      id: 'game-1', listId: 'game-list-1', listName: 'Backlog', title: 'Elden Ring', genre: 'rpg',
    }));
  });

  it('tracks a page view on the all-places map', () => {
    mocks.category = { recommendationLists: [] };
    renderAt('/tk2727/places/map', '/:username/places/map', <MapView />);
    expect(mocks.hookOptions).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account-1', pageName: 'public-home', pageUsername: 'tk2727', autoTrackView: true,
    }));
  });

  it('tracks a page view on a single-list places map with that list as the location', () => {
    mocks.category = { recommendationLists: [{ documentId: 'city-1', slug: 'goa', List_Name: 'Goa', recommended_places: [] }] };
    renderAt('/tk2727/places/goa/placesmap', '/:username/places/:place/placesmap', <PlaceMapView />);
    expect(mocks.hookOptions).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account-1', pageName: 'public-home', pageUsername: 'tk2727',
      locationId: 'city-1', waitForLocation: true,
    }));
  });
});
