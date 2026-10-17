import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { getThemeTokenStyles } from "../../Profile/constants/themePresets";
import { normalizeThemeSettings } from "../../Profile/constants/recommendationsPresentation";
import { usePublicAccountIdentity } from "../../music/PublicMusicAvailabilityProvider";
import { useLocation, useParams } from "react-router-dom";
import { PublicProfileBrandingFooter, PublicProfileFixedHeader, PublicProfileWallpaper } from "./PublicProfileChromePrimitives";
import { PublicMusicBackdrop } from '../../music/components/PublicMusicProfileHeader';
import { getMusicAccentInk } from '../../music/publicMusicPresentation';
import '../../music/components/PublicMusicPresentation.css';
import { useTrackAnalytics } from "../../../services/analyticsService";
import { PublicHeaderDescriptorProvider } from "./PublicHeaderDescriptorContext";
import { getPublicCategoryThemeStyles, PublicCategoryThemeProvider } from './PublicCategoryThemeContext';

const SCROLLING_CATEGORY_SEGMENTS = new Set([
  "places", "movies", "books", "games", "guides", "apps", "products", "people",
]);

const PUBLIC_CATEGORY_NEUTRAL_SURFACES: Readonly<Record<string, string>> = {
  places: "#000000",
  guides: "#000000",
  books: "#000000",
  movies: "#0d1117",
  games: "#0d1117",
  apps: "#0d1117",
  products: "#0d1117",
  people: "#0d1117",
};

const PUBLIC_HEADER_ANALYTICS_PAGES: Readonly<Record<string, string>> = {
  places: "public-home",
  guides: "public-guides",
  books: "public-books",
  movies: "public-movies",
  games: "public-games",
  apps: "public-apps",
  products: "public-products",
  people: "public-people",
  music: "public-music",
};

function hasScrollingCategoryFooter(pathname: string, username?: string): boolean {
  const segments = pathname.split("/").filter(Boolean).map(segment => segment.toLowerCase());
  if (!username || segments[0]?.toLowerCase() !== username.toLowerCase()) return false;
  const category = segments[1] ?? "";
  if (!SCROLLING_CATEGORY_SEGMENTS.has(category)) return false;
  if (category !== "places") return true;
  const route = segments.slice(1);
  return !(
    (route.length === 2 && route[1] === "map") ||
    (route.length === 3 && (route[2] === "map" || route[2] === "placesmap"))
  );
}

function useRootHeroHeaderIntersection(enabled: boolean) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [headerOverHero, setHeaderOverHero] = useState(enabled);

  useLayoutEffect(() => {
    if (!enabled) {
      setHeaderOverHero(false);
      return;
    }

    let contentObserver: MutationObserver | null = null;
    const updateIntersection = () => {
      const shell = shellRef.current;
      const hero = shell?.querySelector<HTMLElement>('[data-profile-hero-backdrop]');
      const header = shell?.querySelector<HTMLElement>('.public-brand-header');
      if (!hero || !header) {
        setHeaderOverHero(false);
        return;
      }
      contentObserver?.disconnect();
      const heroRect = hero.getBoundingClientRect();
      const headerBottom = header.getBoundingClientRect().bottom;
      setHeaderOverHero(heroRect.top < headerBottom && heroRect.bottom > headerBottom);
    };

    const initialFrame = window.requestAnimationFrame(updateIntersection);
    contentObserver = new MutationObserver(updateIntersection);
    if (shellRef.current) contentObserver.observe(shellRef.current, { childList: true, subtree: true });
    window.addEventListener('scroll', updateIntersection, { passive: true });
    window.addEventListener('resize', updateIntersection);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      contentObserver?.disconnect();
      window.removeEventListener('scroll', updateIntersection);
      window.removeEventListener('resize', updateIntersection);
    };
  }, [enabled]);

  return { headerOverHero, shellRef };
}

function useCategoryArtworkHeaderIntersection(shellRef: RefObject<HTMLDivElement | null>, enabled: boolean, navigationKey: string) {
  type Coverage = 'solid' | 'partial' | 'artwork';
  const [overlap, setOverlap] = useState<{ navigationKey: string; logo: Coverage; action: Coverage }>({ navigationKey, logo: 'solid', action: 'solid' });
  useLayoutEffect(() => {
    if (!enabled) return;
    const update = () => {
      const shell = shellRef.current;
      const artwork = Array.from(shell?.querySelectorAll<HTMLElement>('[data-public-category-artwork]') ?? [])
        .filter(element => getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).opacity !== '0')
        .map(element => element.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
      const glyphCoverage = (selector: string): Coverage => {
        const glyph = shell?.querySelector<SVGElement>(selector)?.getBoundingClientRect();
        if (!glyph || !glyph.width || !glyph.height) return 'solid';
        if (artwork.some(rect => rect.left <= glyph.left && rect.right >= glyph.right && rect.top <= glyph.top && rect.bottom >= glyph.bottom)) return 'artwork';
        return artwork.some(rect => rect.left < glyph.right && rect.right > glyph.left && rect.top < glyph.bottom && rect.bottom > glyph.top) ? 'partial' : 'solid';
      };
      const logo = glyphCoverage('.public-brand-logo path[fill="currentColor"]');
      const action = glyphCoverage('[data-public-header-share-icon]');
      setOverlap(previous => previous.navigationKey === navigationKey && previous.logo === logo && previous.action === action
        ? previous : { navigationKey, logo, action });
    };
    update();
    const frame = requestAnimationFrame(update);
    const observer = new MutationObserver(update);
    if (shellRef.current) observer.observe(shellRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-public-category-artwork'] });
    // Capture also covers the existing category-owned scroll containers.
    window.addEventListener('scroll', update, { passive: true, capture: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [enabled, navigationKey, shellRef]);
  return enabled && overlap.navigationKey === navigationKey ? overlap : { logo: 'solid', action: 'solid' };
}

/** Shared normalized token owner for every friendly public-profile destination. */
export default function PublicProfileThemeProvider({ children, showShellChrome = true, navigation }: { children: ReactNode; showShellChrome?: boolean; navigation?: ReactNode }) {
  const identity = usePublicAccountIdentity();
  const location = useLocation();
  const { username } = useParams();
  const isMusicRoute = /\/music\/?$/.test(location.pathname);
  const routeSegments = location.pathname.split("/").filter(Boolean);
  const isProfileRoot = routeSegments.length === 1 && routeSegments[0]?.toLowerCase() === username?.toLowerCase();
  const ownsPublicRoute = routeSegments[0]?.toLowerCase() === username?.toLowerCase();
  const routeCategory = ownsPublicRoute ? routeSegments[1]?.toLowerCase() : undefined;
  const isCategoryRoute = Boolean(routeCategory && SCROLLING_CATEGORY_SEGMENTS.has(routeCategory) && !isMusicRoute);
  const showProviderFooter = isMusicRoute || hasScrollingCategoryFooter(location.pathname, username);
  const normalizedUsername = username?.trim().toLowerCase();
  const matched = identity.status === 'ready'
    && identity.usernameKey === normalizedUsername
    && typeof identity.account?.username === 'string'
    && identity.account.username.trim().toLowerCase() === normalizedUsername;
  const account = matched ? identity.account : undefined;
  const theme = useMemo(() => normalizeThemeSettings(account?.social_media?.theme_settings), [account?.social_media?.theme_settings]);
  const observesRootBanner = isProfileRoot && theme.wallpaperMode === 'banner-top' && showShellChrome;
  const { headerOverHero, shellRef } = useRootHeroHeaderIntersection(observesRootBanner);
  const categoryHeader = useCategoryArtworkHeaderIntersection(shellRef, matched && isCategoryRoute && showShellChrome, location.key);
  const headerOverDarkArtwork = isProfileRoot && (theme.wallpaperMode === 'full-wallpaper-image' || (theme.wallpaperMode === 'banner-top' && headerOverHero));
  const headerInk = headerOverDarkArtwork ? '#FFFFFF' : undefined;
  const analytics = useTrackAnalytics({
    accountId: account?.documentId || "",
    pageName: routeCategory ? PUBLIC_HEADER_ANALYTICS_PAGES[routeCategory] || "public-profile" : "public-profile",
    pageUsername: account?.username,
    autoTrackView: false,
  });
  const style = useMemo(() => getThemeTokenStyles(theme), [theme]);
  const categoryStyles = useMemo(() => matched && isCategoryRoute ? getPublicCategoryThemeStyles(theme) : null, [isCategoryRoute, matched, theme]);
  const pendingCategorySurface = !matched && routeCategory ? PUBLIC_CATEGORY_NEUTRAL_SURFACES[routeCategory] : undefined;
  return <div ref={shellRef} className={`public-profile-shell${isMusicRoute ? ' public-music' : ''}${isCategoryRoute ? ' public-profile-shell--category' : ''}`} data-public-profile-chrome data-shell-revealed={showShellChrome ? "true" : "false"} data-theme-preset={theme.preset} data-wallpaper-mode={theme.wallpaperMode} style={{
    ...style,
    ...{ '--music-accent-ink': getMusicAccentInk(theme.accentColor) },
    ...(categoryStyles || {}),
      ...(categoryHeader.logo !== 'solid' ? { '--category-header-logo-ink': '#FFFFFF' } : {}),
      ...(categoryHeader.action !== 'solid' ? { '--category-header-action-ink': '#FFFFFF' } : {}),
      ...(categoryHeader.logo === 'partial' ? { '--category-header-logo-shadow': 'drop-shadow(0 0 1px #000000) drop-shadow(0 0 1px #000000)' } : {}),
      ...(categoryHeader.action === 'partial' ? { '--category-header-action-shadow': 'drop-shadow(0 0 1px #000000) drop-shadow(0 0 1px #000000)' } : {}),
    ...(headerInk ? { '--public-header-ink': headerInk, '--public-header-icon': headerInk } : {}),
    backgroundColor: pendingCategorySurface || "var(--bg-page)",
    color: "var(--text-primary)",
  }}>
    <PublicHeaderDescriptorProvider
      username={account?.username || username || ""}
      profileName={account?.Account_Name || account?.username || username || "Explorer"}
    >
    {showShellChrome && <PublicProfileFixedHeader onTrackClick={analytics.trackClick} />}
    {isMusicRoute && <>
      {theme.wallpaperMode === 'full-wallpaper-image' && <PublicMusicBackdrop url={account?.bg_picture?.url} wallpaper />}
      {theme.wallpaperMode === 'ambient-gradient' && <PublicProfileWallpaper account={account} theme={theme} />}
      {theme.wallpaperMode === 'banner-top' && <PublicMusicBackdrop url={account?.bg_picture?.url} />}
    </>}
    <PublicCategoryThemeProvider styles={categoryStyles}>
      <div className={`public-profile-content-layer${isProfileRoot ? ' public-profile-content-layer--hero' : ''}`} data-public-content-layer>{children}</div>
      {navigation && <div className="public-profile-nav-layer">{navigation}</div>}
      {showProviderFooter && <PublicProfileBrandingFooter theme={theme} />}
    </PublicCategoryThemeProvider>
    </PublicHeaderDescriptorProvider>
  </div>;
}
