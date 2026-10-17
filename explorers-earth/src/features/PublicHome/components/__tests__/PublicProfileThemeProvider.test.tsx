import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPortal } from "react-dom";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import PublicProfileThemeProvider from "../PublicProfileThemeProvider";
import { usePublicCategoryThemeStyles } from "../PublicCategoryThemeContext";
import { PublicMusicProfileHeader } from '../../../music/components/PublicMusicProfileHeader';
import PublicProfileFooter from "../PublicProfileFooter";

const profile = vi.hoisted(() => {
  const account = {
    Account_Name: "Alice", username: "alice", profile_picture: { url: "https://images.example/avatar.jpg" }, Primary_Address: { address: "Goa" }, bg_picture: { url: "https://images.example/hero.jpg" } as { url: string } | null,
    social_media: { theme_settings: { preset: "neon-cyber", wallpaperMode: "banner-top" } },
  };
  return {
    state: 'available',
    account,
    identity: { usernameKey: 'alice', status: 'ready', account },
  };
});
function renderProfile(path = '/alice/music', children = <h1>Music</h1>, showShellChrome = true, navigation?: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/:username/*" element={<PublicProfileThemeProvider showShellChrome={showShellChrome} navigation={navigation}>{children}</PublicProfileThemeProvider>} /></Routes></MemoryRouter>);
}
function CategoryThemeProbe({ portal = false, testId }: { portal?: boolean; testId: string }) {
  const styles = usePublicCategoryThemeStyles();
  const probe = <output data-testid={testId} data-category-page={styles?.['--category-page'] ?? 'none'} />;
  return portal ? createPortal(probe, document.body) : probe;
}
const trackClick = vi.hoisted(() => vi.fn());
vi.mock("../../../../services/analyticsService", () => ({ createAnalyticsOptions: { profile: () => ({}) }, useTrackAnalytics: () => ({ trackClick }) }));
vi.mock("../../../music/PublicMusicAvailabilityProvider", () => ({
  usePublicMusicAvailability: () => profile,
  usePublicAccountIdentity: () => profile.identity,
}));

describe("PublicProfileThemeProvider", () => {
  beforeEach(() => {
    trackClick.mockReset();
    profile.state = 'available';
    profile.account.username = 'alice';
    profile.identity.usernameKey = 'alice';
    profile.identity.status = 'ready';
    profile.identity.account = profile.account;
    profile.account.bg_picture = { url: "https://images.example/hero.jpg" };
    profile.account.social_media.theme_settings.preset = "neon-cyber";
    profile.account.social_media.theme_settings.wallpaperMode = "banner-top";
    profile.account.social_media.theme_settings.footerBranding = "enabled";
  });
  it("uses the route-aware shared-header descriptor on friendly Music", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    renderProfile();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(trackClick).toHaveBeenCalledWith("share-button", { context: "music-header" }));
  });
  it("keeps Music branding and selected cover without repeating the profile identity", () => {
    const view = renderProfile();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(view.container.querySelector('[data-music-cover]')).toHaveAttribute("src", "https://images.example/hero.jpg");
    expect(screen.queryByRole("img", { name: "Alice profile photo" })).not.toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.queryByText("@alice")).not.toBeInTheDocument();
    expect(screen.queryByText("Goa")).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', {level: 1})).toHaveLength(1);
    expect(view.container.querySelector('[data-profile-hero-backdrop]')).not.toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Explorers.Earth" })).toHaveLength(1);
    expect(screen.getByRole("img", { name: "explorers.earth" })).toHaveClass("public-brand-icon");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.queryAllByRole("main")).toHaveLength(0);
  });

  it("never invents a cover when no image was selected", () => {
    profile.account.bg_picture = null;
    const view = renderProfile();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(view.container.querySelector('[data-music-cover]')).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Cover" })).not.toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("uses one continuous wallpaper without duplicating a banner hero", () => {
    profile.account.social_media.theme_settings.wallpaperMode = "full-wallpaper-image";
    const view = renderProfile();
    expect(screen.queryByRole("img", { name: "Cover" })).not.toBeInTheDocument();
    expect(view.container.querySelector("[data-profile-wallpaper] img")).toHaveAttribute("src", "https://images.example/hero.jpg");
  });
  it('does not expose cached identity while loading or after a username change', () => {
    profile.state = 'loading';
    const view = renderProfile();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', {name: 'Alice profile photo'})).not.toBeInTheDocument();
    view.unmount();
    profile.state = 'available';
    renderProfile('/bob/music');
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', {name: 'Alice profile photo'})).not.toBeInTheDocument();
  });
  it('keeps the matching account theme, artwork, and footer while Music availability loads', () => {
    profile.state = 'loading';
    const view = renderProfile();

    expect(view.container.querySelector('[data-public-profile-chrome]')).toHaveAttribute('data-theme-preset', 'neon-cyber');
    expect(view.container.querySelector('[data-public-profile-chrome]')).toHaveAttribute('data-wallpaper-mode', 'banner-top');
    expect(view.container.querySelector('[data-music-cover]')).toHaveAttribute('src', 'https://images.example/hero.jpg');
    expect(screen.getByRole('link', { name: 'Privacy', exact: true })).toBeInTheDocument();
  });
  it("does not apply a cached account's theme or artwork to a different username", () => {
    profile.state = 'loading';
    const view = renderProfile('/bob/music');

    expect(view.container.querySelector('[data-public-profile-chrome]')).toHaveAttribute('data-theme-preset', 'cinematic-dark');
    expect(view.container.querySelector('[data-music-cover]')).not.toBeInTheDocument();
  });
  it('retains the standalone identity avatar fallback', () => {
    render(<PublicMusicProfileHeader name="Alice" username="alice" avatarUrl="https://images.example/avatar.jpg" />);
    fireEvent.error(screen.getByRole('img', {name: 'Alice profile photo'}));
    expect(screen.queryByRole('img', {name: 'Alice profile photo'})).not.toBeInTheDocument();
    expect(screen.getByLabelText('Alice initials')).toHaveTextContent('A');
  });
  it.each(['/alice', '/alice/books'])('keeps Music-only wallpaper chrome off the non-Music route %s', (path) => {
    const view = renderProfile(path);
    expect(view.container.querySelector('[data-public-profile-chrome]')).not.toHaveClass('public-music');
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(view.container.querySelector('[data-music-cover]')).not.toBeInTheDocument();
  });
  it.each([
    ['/alice', 1, <><h1>Profile</h1><PublicProfileFooter brandingStyle="enabled" /></>],
    ['/alice/books', 1, <h1>Books</h1>],
    ['/alice/books/favorites', 1, <h1>Favorite books</h1>],
    ['/alice/places/map', 0, <h1>Places map</h1>],
    ['/alice/music', 1, <h1>Music</h1>],
  ] as const)('owns exactly one shared banner/share on %s while retaining %i footer(s)', (path, footerCount, children) => {
    renderProfile(path, children);
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(1);
    expect(screen.queryAllByRole('contentinfo')).toHaveLength(footerCount);
  });
  it.each(['/alice', '/alice/books', '/alice/books/favorites', '/alice/places/map', '/alice/music'])('renders no cold header or Share action on %s', (path) => {
    renderProfile(path, <h1>Cold route</h1>, false);
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });
  it('owns injectable safe-area, reserved-offset, and isolated stacking tokens', () => {
    const view = renderProfile('/alice/books', <h1>Books</h1>, true, <nav aria-label="Fixture public navigation">Tabs</nav>);
    const shell = view.container.querySelector<HTMLElement>('[data-public-profile-chrome]');
    const content = view.container.querySelector<HTMLElement>('.public-profile-content-layer');
    expect(shell).toHaveClass('public-profile-shell');
    expect(shell).toHaveStyle({
      '--public-safe-top': 'env(safe-area-inset-top, 0px)',
      '--public-safe-right': 'env(safe-area-inset-right, 0px)',
      '--public-safe-bottom': 'env(safe-area-inset-bottom, 0px)',
      '--public-safe-left': 'env(safe-area-inset-left, 0px)',
      '--public-header-reserved-offset': 'calc(var(--public-safe-top) + 80px)',
      '--z-public-content': '0',
      '--z-public-map-controls': '40',
      '--z-public-nav': '80',
      '--z-public-header': '90',
      '--z-public-toast': '1000',
      '--z-public-modal': '2000',
      '--z-public-cold-overlay': '3000',
    });
    expect(content).toHaveAttribute('data-public-content-layer');
    const navigation = screen.getByRole('navigation', { name: 'Fixture public navigation' });
    expect(navigation.parentElement).toHaveClass('public-profile-nav-layer');
    expect(content).not.toContainElement(navigation);
  });
  it('reserves exactly one shared-header offset on the real Music provider shell', () => {
    const styles = document.createElement('style');
    styles.textContent = [
      readFileSync(path.resolve(__dirname, '../PublicBranding.css'), 'utf8'),
      readFileSync(path.resolve(__dirname, '../../../music/components/PublicMusicPresentation.css'), 'utf8'),
    ].join('\n');
    document.head.append(styles);
    try {
      const view = renderProfile('/alice/music', <div data-testid="music-route-content">Music route content</div>);
      const shell = view.container.querySelector<HTMLElement>('[data-public-profile-chrome].public-music');
      const content = view.container.querySelector<HTMLElement>('[data-public-content-layer]');

      expect(shell).not.toBeNull();
      expect(content).not.toBeNull();
      expect(getComputedStyle(content!).paddingTop).toBe('var(--public-header-reserved-offset)');
      expect(getComputedStyle(shell!).paddingTop).toBe('0');
    } finally {
      styles.remove();
    }
  });
  it('lets the root hero start behind transparent borderless chrome while non-hero routes retain the reserved offset', () => {
    const styles = document.createElement('style');
    styles.textContent = readFileSync(path.resolve(__dirname, '../PublicBranding.css'), 'utf8');
    document.head.append(styles);
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const top = 0;
      const bottom = this.matches('[data-profile-hero-backdrop]') ? 420 : this.matches('.public-brand-header') ? 56 : 0;
      return { bottom, height: bottom - top, left: 0, right: 1440, top, width: 1440, x: 0, y: top, toJSON: () => ({}) };
    });
    try {
      profile.account.social_media.theme_settings.preset = 'minimal-light';
      const root = renderProfile('/alice', <div data-profile-hero-backdrop>Profile hero</div>);
      const rootContent = root.container.querySelector<HTMLElement>('[data-public-content-layer]')!;
      const header = root.container.querySelector<HTMLElement>('.public-brand-header')!;
      const action = root.container.querySelector<HTMLElement>('.public-brand-action')!;

      expect(rootContent).toHaveClass('public-profile-content-layer--hero');
      expect(getComputedStyle(rootContent).paddingTop).toBe('0px');
      expect(getComputedStyle(header).backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(getComputedStyle(header).borderTopWidth).toBe('0px');
      expect(getComputedStyle(header).borderRadius).toBe('0px');
      expect(getComputedStyle(action).backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(getComputedStyle(action).borderTopWidth).toBe('0px');
      expect(root.container.querySelector<HTMLElement>('[data-public-profile-chrome]')).toHaveStyle({ '--public-header-ink': '#FFFFFF' });
      root.unmount();

      const nonHero = renderProfile('/alice/books', <h1>Books</h1>);
      const nonHeroContent = nonHero.container.querySelector<HTMLElement>('[data-public-content-layer]')!;
      expect(nonHeroContent).not.toHaveClass('public-profile-content-layer--hero');
      expect(getComputedStyle(nonHeroContent).paddingTop).toBe('var(--public-header-reserved-offset)');
    } finally {
      geometry.mockRestore();
      styles.remove();
    }
  });
  it.each([
    ['mobile', 390, 380],
    ['desktop', 1440, 420],
  ] as const)('switches the %s root header from hero ink to theme chrome ink after the banner scrolls away', async (_viewport, width, heroHeight) => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    let scrollOffset = 0;
    const rect = (top: number, bottom: number): DOMRect => ({
      bottom,
      height: bottom - top,
      left: 0,
      right: width,
      top,
      width,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.matches('[data-profile-hero-backdrop]')) return rect(-scrollOffset, heroHeight - scrollOffset);
      if (this.matches('.public-brand-header')) return rect(0, 56);
      return rect(0, 0);
    });

    try {
      profile.account.social_media.theme_settings.preset = 'minimal-light';
      const view = renderProfile('/alice', <div data-profile-hero-backdrop>Profile hero</div>);
      const shell = view.container.querySelector<HTMLElement>('[data-public-profile-chrome]')!;

      expect(shell.style.getPropertyValue('--public-header-ink')).toBe('#FFFFFF');
      scrollOffset = heroHeight;
      fireEvent.scroll(window);

      await waitFor(() => expect(shell.style.getPropertyValue('--public-header-ink')).toBe(''));
      expect(shell.style.getPropertyValue('--public-chrome-ink')).toBe('#0F172A');
    } finally {
      geometry.mockRestore();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
    }
  });
  it('re-evaluates hero ink when the root banner arrives after the shell', async () => {
    const rect = (bottom: number): DOMRect => ({
      bottom, height: bottom, left: 0, right: 1440, top: 0, width: 1440, x: 0, y: 0, toJSON: () => ({}),
    });
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.matches('[data-profile-hero-backdrop]')) return rect(420);
      if (this.matches('.public-brand-header')) return rect(56);
      return rect(0);
    });
    profile.account.social_media.theme_settings.preset = 'minimal-light';
    const DelayedHero = () => {
      const [visible, setVisible] = useState(false);
      return visible
        ? <div data-profile-hero-backdrop>Profile hero</div>
        : <button type="button" onClick={() => setVisible(true)}>Show hero</button>;
    };

    try {
      const view = renderProfile('/alice', <DelayedHero />);
      const root = view.container.querySelector<HTMLElement>('[data-public-profile-chrome]')!;
      await waitFor(() => expect(root.style.getPropertyValue('--public-header-ink')).toBe(''));

      fireEvent.click(screen.getByRole('button', { name: 'Show hero' }));
      await waitFor(() => expect(root.style.getPropertyValue('--public-header-ink')).toBe('#FFFFFF'));
    } finally {
      geometry.mockRestore();
    }
  });
  it.each([
    ['cinematic-dark', '#090D16', '#FFFFFF'],
    ['glassmorphism', '#0F172A', '#FFFFFF'],
    ['sunset-glow', '#1A0B2E', '#FFFFFF'],
    ['minimal-light', '#F8FAFC', '#0F172A'],
    ['emerald-nature', '#064E3B', '#FFFFFF'],
    ['neon-cyber', '#030712', '#FFFFFF'],
  ] as const)('uses the %s page and chrome ink for category routes', (preset, expectedPage, expectedInk) => {
    profile.account.social_media.theme_settings.preset = preset;
    const view = renderProfile('/alice/apps', <h1>Category</h1>);
    const shell = view.container.querySelector<HTMLElement>('[data-public-profile-chrome]')!;

    expect(shell).toHaveClass('public-profile-shell--category');
    expect(shell.style.backgroundColor).toBe('var(--bg-page)');
    expect(shell.style.getPropertyValue('--category-page')).toBe(expectedPage);
    expect(shell.style.getPropertyValue('--category-text')).toBe(expectedInk);
    expect(shell.style.getPropertyValue('--public-header-ink')).toBe('');
    expect(shell.style.getPropertyValue('--public-chrome-ink')).toBe(expectedInk);
    expect(view.container.querySelector('[data-music-cover]')).toBeNull();
  });
  it.each([
    '/alice/places',
    '/alice/movies',
    '/alice/books',
    '/alice/games',
    '/alice/guides',
    '/alice/apps',
    '/alice/products',
    '/alice/people',
  ])('applies the saved palette to category path %s', (route) => {
    profile.account.social_media.theme_settings.preset = 'minimal-light';
    const view = renderProfile(route, <h1>Category</h1>);
    const shell = view.container.querySelector<HTMLElement>('[data-public-profile-chrome]')!;

    expect(shell).toHaveClass('public-profile-shell--category');
    expect(shell.style.getPropertyValue('--category-page')).toBe('#F8FAFC');
    expect(shell.style.getPropertyValue('--category-text')).toBe('#0F172A');
    expect(view.container.querySelector('[data-music-cover]')).toBeNull();
  });
  it.each(['places', 'movies', 'books', 'games', 'guides', 'apps', 'products', 'people'].flatMap(category =>
    ['banner-top', 'full-wallpaper-image', 'ambient-gradient', 'solid-color'].map(mode => [category, mode])
  ))('keeps %s solid with %s wallpaper selected', (category, wallpaperMode) => {
    profile.account.social_media.theme_settings.preset = 'minimal-light';
    profile.account.social_media.theme_settings.wallpaperMode = wallpaperMode;
    const view = renderProfile(`/alice/${category}`, <h1>Category</h1>);
    const shell = view.container.querySelector<HTMLElement>('[data-public-profile-chrome]')!;
    expect(shell.style.getPropertyValue('--category-page')).toBe('#F8FAFC');
    expect(shell.style.getPropertyValue('--category-text')).toBe('#0F172A');

    expect(view.container.querySelector('[data-music-cover]')).toBeNull();
    expect(view.container.querySelector('[data-profile-wallpaper]')).toBeNull();
    expect(view.container.querySelector('[data-profile-hero-backdrop]')).toBeNull();
  });
  it.each([
    ['a different route username', '/bob/places', 'ready', 'rgb(0, 0, 0)'],
    ['a different route username', '/bob/guides', 'ready', 'rgb(0, 0, 0)'],
    ['a different route username', '/bob/books', 'ready', 'rgb(0, 0, 0)'],
    ['a different route username', '/bob/movies', 'ready', 'rgb(13, 17, 23)'],
    ['a different route username', '/bob/games', 'ready', 'rgb(13, 17, 23)'],
    ['a different route username', '/bob/apps', 'ready', 'rgb(13, 17, 23)'],
    ['a different route username', '/bob/products', 'ready', 'rgb(13, 17, 23)'],
    ['a different route username', '/bob/people', 'ready', 'rgb(13, 17, 23)'],
    ['a loading account identity', '/alice/places', 'loading', 'rgb(0, 0, 0)'],
    ['a loading account identity', '/alice/guides', 'loading', 'rgb(0, 0, 0)'],
    ['a loading account identity', '/alice/books', 'loading', 'rgb(0, 0, 0)'],
    ['a loading account identity', '/alice/movies', 'loading', 'rgb(13, 17, 23)'],
    ['a loading account identity', '/alice/games', 'loading', 'rgb(13, 17, 23)'],
    ['a loading account identity', '/alice/apps', 'loading', 'rgb(13, 17, 23)'],
    ['a loading account identity', '/alice/products', 'loading', 'rgb(13, 17, 23)'],
    ['a loading account identity', '/alice/people', 'loading', 'rgb(13, 17, 23)'],
  ] as const)('does not expose the cached category palette for %s on %s', (_case, route, identityStatus, expectedNeutralBackground) => {
    profile.account.social_media.theme_settings.preset = 'minimal-light';
    profile.identity.status = identityStatus;
    const view = renderProfile(route, <><h1>Category</h1><CategoryThemeProbe testId="unmatched-category-probe" /></>);
    const shell = view.container.querySelector<HTMLElement>('[data-public-profile-chrome]')!;

    expect(shell).toHaveAttribute('data-theme-preset', 'cinematic-dark');
    expect(shell.style.backgroundColor).toBe(expectedNeutralBackground);
    expect(shell.style.getPropertyValue('--bg-page')).toBe('#090D16');
    expect(shell.style.getPropertyValue('--category-page')).toBe('');
    expect(shell.style.getPropertyValue('--category-text')).toBe('');
    expect(screen.getByTestId('unmatched-category-probe')).toHaveAttribute('data-category-page', 'none');
  });
  it('provides category aliases to content, navigation, and a real portal but stays null outside category scope', () => {
    profile.account.social_media.theme_settings.preset = 'minimal-light';
    const category = renderProfile(
      '/alice/apps',
      <><CategoryThemeProbe testId="category-content-probe" /><CategoryThemeProbe portal testId="category-portal-probe" /></>,
      true,
      <CategoryThemeProbe testId="category-navigation-probe" />,
    );

    expect(screen.getByTestId('category-content-probe')).toHaveAttribute('data-category-page', '#F8FAFC');
    expect(screen.getByTestId('category-navigation-probe')).toHaveAttribute('data-category-page', '#F8FAFC');
    expect(screen.getByTestId('category-portal-probe')).toHaveAttribute('data-category-page', '#F8FAFC');
    category.unmount();

    renderProfile('/alice', <CategoryThemeProbe testId="profile-root-probe" />);
    expect(screen.getByTestId('profile-root-probe')).toHaveAttribute('data-category-page', 'none');
  });
  it.each(['/alice', '/alice/music'])('does not add category aliases to non-category route %s', (route) => {
    profile.account.social_media.theme_settings.preset = 'minimal-light';
    const view = renderProfile(route);
    const shell = view.container.querySelector<HTMLElement>('[data-public-profile-chrome]')!;

    expect(shell.style.getPropertyValue('--category-page')).toBe('');
    expect(shell.style.getPropertyValue('--category-text')).toBe('');
  });
  it.each(['/alice/books', '/alice/places/a-place', '/alice/guides/guide-slug'])('adds one shared footer to scrolling category route %s', (path) => {
    renderProfile(path);
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  });
  it.each(['/alice/books/map', '/alice/guides/placesmap', '/alice/places/placesmap'])('keeps the footer for scrolling paths that are not actual Places maps: %s', (path) => {
    renderProfile(path);
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  });
  it.each(['/alice', '/alice/', '/alice/missing', '/alice/places/map', '/alice/places/place-slug/map', '/alice/places/a-place/placesmap'])('does not add a provider footer outside known scrolling category routes: %s', (path) => {
    renderProfile(path);
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });
  it('tracks category artwork separately for logo and Share through scroll resize and route changes', async () => {
    profile.account.social_media.theme_settings.preset = 'minimal-light';
    let artworkTop = 100;
    let artworkLeft = 0;
    let artworkRight = 100;
    const rect = (left: number, top: number, right: number, bottom: number): DOMRect => ({
      x: left, y: top, left, top, right, bottom, width: right - left, height: bottom - top, toJSON: () => ({}),
    });
    const bounds = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.matches('[data-public-category-artwork]')) return rect(artworkLeft, artworkTop, artworkRight, artworkTop + 400);
      if (this.matches('.public-brand-logo')) return rect(12, 6, 56, 50);
      if (this.matches('.public-brand-action')) return rect(330, 6, 378, 50);
      if (this.matches('.public-brand-logo path[fill="currentColor"]')) return rect(20, 15, 40, 42);
      if (this.matches('[data-public-header-share-icon]')) return rect(344, 18, 364, 38);
      return rect(0, 0, 0, 0);
    });
    try {
      const view = renderProfile('/alice/apps', <><div data-public-category-artwork /><Link to="/alice/books/public-books">Next list</Link></>);
      const shell = view.container.querySelector<HTMLElement>('[data-public-profile-chrome]')!;
      expect(shell.style.getPropertyValue('--category-header-logo-ink')).toBe('');
      artworkTop = 0;
      fireEvent.scroll(window);
      await waitFor(() => expect(shell.style.getPropertyValue('--category-header-logo-ink')).toBe('#FFFFFF'));
      expect(shell.style.getPropertyValue('--category-header-action-ink')).toBe('');
      artworkLeft = 30;
      fireEvent.scroll(window);
      await waitFor(() => expect(shell.style.getPropertyValue('--category-header-logo-shadow')).toContain('drop-shadow'));
      expect(shell.style.getPropertyValue('--category-header-action-shadow')).toBe('');
      artworkLeft = 0;
      fireEvent.scroll(window);
      await waitFor(() => expect(shell.style.getPropertyValue('--category-header-logo-shadow')).toBe(''));
      artworkRight = 390;
      fireEvent.resize(window);
      await waitFor(() => expect(shell.style.getPropertyValue('--category-header-action-ink')).toBe('#FFFFFF'));
      artworkTop = -500;
      fireEvent.scroll(window);
      await waitFor(() => expect(shell.style.getPropertyValue('--category-header-logo-ink')).toBe(''));
      expect(shell.style.getPropertyValue('--category-header-action-ink')).toBe('');
      artworkTop = 0;
      fireEvent.scroll(window);
      await waitFor(() => expect(shell.style.getPropertyValue('--category-header-logo-ink')).toBe('#FFFFFF'));
      artworkTop = 100;
      fireEvent.click(screen.getByRole('link', { name: 'Next list' }));
      await waitFor(() => expect(shell.style.getPropertyValue('--category-header-logo-ink')).toBe(''));
      expect(shell.style.getPropertyValue('--public-header-ink')).toBe('');
    } finally { bounds.mockRestore(); }
  });
  it("leaves a root profile's own footer as the only footer", () => {
    renderProfile('/alice', <><h1>Profile</h1><PublicProfileFooter brandingStyle="enabled" /></>);
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  });
  it.each(['enabled', 'minimal', 'disabled'] as const)('uses the %s footer mode on a scrolling category route', (footerBranding) => {
    profile.account.social_media.theme_settings.footerBranding = footerBranding;
    renderProfile('/alice/books');
    expect(screen.queryAllByRole('contentinfo')).toHaveLength(footerBranding === 'disabled' ? 0 : 1);
    expect(screen.queryAllByRole('link', { name: 'Privacy', exact: true })).toHaveLength(footerBranding === 'enabled' ? 1 : 0);
  });
});
