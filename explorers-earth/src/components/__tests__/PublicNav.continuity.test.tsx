import { act, fireEvent, render, screen } from '@testing-library/react';
import { Router, Route, Routes, type Navigator } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PublicNav from '../PublicNav';

const usePublicRecommendationCategory = vi.hoisted(() => vi.fn(() => ({ data: undefined, loading: false, error: null, refetch: vi.fn() })));
const musicAvailability = vi.hoisted(() => ({ state: 'available', account: null as Record<string, unknown> | null }));
const availableAccount = {
  documentId: 'account-1', username: 'alice', public_profile: 'Yes', public_books: 'Yes',
  public_recommendations: 'No', public_guides: 'No', public_music: 'Yes', public_movie: 'No',
  public_games: 'No', public_apps: 'No', public_products: 'No', public_people: 'No',
  pinned_nav_tabs: ['public_profile', 'public_music', 'public_books'], auto_pinning: false,
};
vi.mock('../../features/PublicHome/api/usePublicRecommendationCategory', () => ({ usePublicRecommendationCategory }));

vi.mock('../../features/music/PublicMusicAvailabilityProvider', () => ({
  usePublicMusicAvailability: () => ({
    state: musicAvailability.state,
    account: musicAvailability.account,
  }),
}));

function location(pathname: string) {
  return { pathname, search: '', hash: '', state: null, key: pathname };
}

function renderHeldRouter(pathname = '/alice/books', capture = false) {
  const pushes: unknown[][] = [];
  const navigator: Navigator = {
    createHref: value => typeof value === 'string' ? value : value.pathname ?? '',
    encodeLocation: value => typeof value === 'string' ? { pathname: value, search: '', hash: '' } : value,
    go: vi.fn(),
    push: (...args: unknown[]) => { pushes.push(args); },
    replace: vi.fn(),
  };
  const tree = (routerPathname: string) => (
    <Router location={location(routerPathname)} navigator={navigator}>
      <Routes><Route path="/:username/*" element={<PublicNav />} /></Routes>
    </Router>
  );
  const renderTree = (routerPathname: string) => capture
    ? <div onClickCapture={event => event.preventDefault()}>{tree(routerPathname)}</div>
    : tree(routerPathname);
  const view = render(renderTree(pathname));
  return {
    ...view,
    navigator,
    pushes,
    rerenderPath: (routerPathname: string) => view.rerender(renderTree(routerPathname)),
  };
}

describe('PublicNav immediate semantic activation', () => {
  const frameCallbacks: FrameRequestCallback[] = [];

  beforeEach(() => {
    musicAvailability.state = 'available';
    musicAvailability.account = availableAccount;
    window.history.replaceState(null, '', '/alice/books');
    frameCallbacks.length = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('retains browser-adopted intent while the router location lags across animation frames', () => {
    const view = renderHeldRouter();
    const profile = screen.getByRole('link', { name: 'Profile', exact: true });
    const books = screen.getByRole('link', { name: 'Books', exact: true });

    fireEvent.click(profile, { button: 0, detail: 1 });
    window.history.replaceState(null, '', '/alice');
    act(() => { frameCallbacks.splice(0).forEach(callback => callback(performance.now())); });

    expect(profile).toHaveAttribute('aria-current', 'page');
    expect(books).not.toHaveAttribute('aria-current');
    act(() => { frameCallbacks.splice(0).forEach(callback => callback(performance.now())); });
    expect(profile).toHaveAttribute('aria-current', 'page');

    view.rerenderPath('/alice');
    expect(profile).toHaveAttribute('aria-current', 'page');
    expect(books).not.toHaveAttribute('aria-current');
  });

  it('marks a plain primary Link intent active before the held router commits, then rolls back a failed intent', () => {
    const view = renderHeldRouter();
    const profile = screen.getByRole('link', { name: 'Profile', exact: true });
    const books = screen.getByRole('link', { name: 'Books', exact: true });
    expect(books).toHaveAttribute('aria-current', 'page');

    fireEvent.click(profile, { button: 0, detail: 1 });
    expect(view.pushes).toHaveLength(1);
    expect(profile).toHaveAttribute('aria-current', 'page');
    expect(books).not.toHaveAttribute('aria-current');

    act(() => { frameCallbacks.splice(0).forEach(callback => callback(performance.now())); });
    expect(books).toHaveAttribute('aria-current', 'page');
    expect(profile).not.toHaveAttribute('aria-current');
  });

  it('accepts keyboard click activation but ignores modified and already-prevented clicks', () => {
    const keyboard = renderHeldRouter();
    const profile = screen.getByRole('link', { name: 'Profile', exact: true });
    fireEvent.click(profile, { button: 0, detail: 0 });
    expect(profile).toHaveAttribute('aria-current', 'page');
    keyboard.unmount();

    const modified = renderHeldRouter();
    const modifiedProfile = screen.getByRole('link', { name: 'Profile', exact: true });
    fireEvent.click(modifiedProfile, { button: 0, metaKey: true, detail: 1 });
    expect(modifiedProfile).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Books', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(modified.pushes).toHaveLength(0);
    modified.unmount();

    const prevented = renderHeldRouter('/alice/books', true);
    const preventedProfile = screen.getByRole('link', { name: 'Profile', exact: true });
    fireEvent.click(preventedProfile, { button: 0, detail: 1 });
    expect(preventedProfile).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Books', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(prevented.pushes).toHaveLength(0);
  });

  it.each(['loading', 'unavailable'])("keeps a manually pinned Music tab during a transient %s check", state => {
    musicAvailability.state = state;
    renderHeldRouter('/alice/books');

    expect(screen.getByRole('link', { name: 'Music', exact: true })).toBeInTheDocument();
  });

  it('removes Music when the publication is conclusively not public', () => {
    musicAvailability.state = 'not-public';
    renderHeldRouter('/alice/books');

    expect(screen.queryByRole('link', { name: 'Music', exact: true })).not.toBeInTheDocument();
  });

  it('auto-pins from authoritative totals instead of tying categories whose first pages are full', () => {
    musicAvailability.account = {
      ...availableAccount,
      auto_pinning: true,
      public_recommendations: 'Yes', public_movie: 'Yes', public_books: 'Yes', public_apps: 'Yes',
      public_navigation_counts: {
        public_recommendations: 12,
        public_movie: 50,
        public_books: 30,
        public_apps: 20,
      },
    };
    usePublicRecommendationCategory.mockImplementation((_username, category) => ({
      data: category === 'places'
        ? { recommendationLists: Array.from({ length: 12 }, (_, index) => ({ documentId: `place-${index}` })) }
        : category === 'movies'
          ? { movieLists: Array.from({ length: 12 }, (_, index) => ({ documentId: `movie-${index}` })) }
          : undefined,
      loading: false, error: null, refetch: vi.fn(),
    }));

    renderHeldRouter('/alice');

    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual([
      'Profile', 'Music', 'Movies', 'Books', 'Apps',
    ]);
  });

  it('uses the same 48px nav band while the provider has no retained account', () => {
    musicAvailability.state = 'loading';
    musicAvailability.account = null;
    renderHeldRouter('/alice/guides');

    const nav = screen.getByRole('navigation', { name: 'Public navigation' });
    expect(nav).toHaveAttribute('data-public-nav-state', 'loading');
    expect(nav).toHaveStyle({
      bottom: 'var(--public-nav-edge-offset)',
      paddingBottom: 'calc(0.25rem + var(--public-safe-bottom, env(safe-area-inset-bottom, 0px)))',
      paddingTop: '0.25rem',
    });
    expect(nav.firstElementChild?.firstElementChild).toHaveStyle({ height: '2.5rem' });
  });

  it('uses the 44px control band plus shared safe-area padding when ready', () => {
    renderHeldRouter('/alice/books');
    const nav = screen.getByRole('navigation', { name: 'Public navigation' });
    expect(nav).toHaveAttribute('data-public-nav-state', 'ready');
    expect(nav).toHaveStyle({
      bottom: 'var(--public-nav-edge-offset)',
      paddingBottom: 'calc(0.125rem + var(--public-safe-bottom, env(safe-area-inset-bottom, 0px)))',
      paddingTop: '0.125rem',
    });
  });
});
