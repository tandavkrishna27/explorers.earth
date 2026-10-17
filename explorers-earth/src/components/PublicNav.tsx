import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import NavButton from "./ui/NavButton";
import DirectionBoard from "../assets/icons/DirectionBoard";
import Profile from "../assets/icons/Profile";
import TravelGuideIcon from "../assets/icons/TravelGuideIcon";
import { Film, BookOpen, Gamepad2, Smartphone, ShoppingBag, Users, Music2 } from "lucide-react";
import { useLocation, useParams } from "react-router-dom";
import { computePinnedNavTabIds } from "../utils/navPinning";
import { usePublicMusicAvailability } from "../features/music/PublicMusicAvailabilityProvider";
import { appendAttributionParamsToPath } from "../utils/urlHelpers";
import { usePublicRecommendationCategory } from "../features/PublicHome/api/usePublicRecommendationCategory";

function navigationCount(account: Record<string, unknown> | null | undefined, tabId: string, fallback: number): number {
  const counts = account?.public_navigation_counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return fallback;
  const value = (counts as Record<string, unknown>)[tabId];
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

const PublicNav = memo(() => {
  const location = useLocation();
  const { username } = useParams();

  const availability = usePublicMusicAvailability();
  const accountData = availability.account;
  const loading = availability.state === "loading" && !accountData;

  // Category projections are the only anonymous source of published list data.
  // Their bounded result sizes are sufficient for auto-pin ranking while avoiding
  // a broad anonymous Strapi aggregate query.
  const places = usePublicRecommendationCategory(username, "places", accountData?.public_recommendations === "Yes");
  const movies = usePublicRecommendationCategory(username, "movies", accountData?.public_movie === "Yes");
  const books = usePublicRecommendationCategory(username, "books", accountData?.public_books === "Yes");
  const games = usePublicRecommendationCategory(username, "games", accountData?.public_games === "Yes");
  const apps = usePublicRecommendationCategory(username, "apps", accountData?.public_apps === "Yes");
  const products = usePublicRecommendationCategory(username, "products", accountData?.public_products === "Yes");
  const people = usePublicRecommendationCategory(username, "people", accountData?.public_people === "Yes");
  const guides = usePublicRecommendationCategory(username, "guides", accountData?.public_guides === "Yes");

  // Helper function to normalize paths by removing trailing slashes
  const normalizePath = (path: string | undefined) => {
    if (!path) return '';
    return path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
  };

  // Helper function to check if paths match (ignoring trailing slashes)
  const isPathMatch = (currentPath: string, targetPath: string) => {
    const normalizedCurrent = normalizePath(currentPath);
    const normalizedTarget = normalizePath(targetPath);
    return normalizedCurrent === normalizedTarget;
  };

  // Helper function to check if current path is for places
  const isPlacesPath = (currentPath: string) => {
    const normalizedPath = normalizePath(currentPath);
    return normalizedPath.includes('/places');
  };

  // Tab visibility logic based on Account collection fields
  // Strict opt-in: a category tab is public only when explicitly "Yes".
  const showRecommendationsTab = accountData?.public_recommendations === "Yes";
  const showProfileTab = true; // Always show public profile tab
  const showGuidesTab = accountData?.public_guides === "Yes";
  const showMoviesTab = accountData?.public_movie === "Yes";
  const showBooksTab = accountData?.public_books === "Yes";
  const showGamesTab = accountData?.public_games === "Yes";
  const showAppsTab = accountData?.public_apps === "Yes";
  const showProductsTab = accountData?.public_products === "Yes";
  const showPeopleTab = accountData?.public_people === "Yes";
  // A transient Music probe must not reshuffle an owner's saved navigation.
  // The persisted public preference is the visibility authority; only a
  // conclusive publication revocation hides an already-public Music tab.
  const showMusicTab = accountData?.public_music === "Yes" && availability.state !== "not-public";

  // Helper function to check if current path is for movies
  const isMoviesPath = (currentPath: string) => {
    const normalizedPath = normalizePath(currentPath);
    return normalizedPath.includes('/movies');
  };

  // Helper function to check if current path is for books
  const isBooksPath = (currentPath: string) => {
    const normalizedPath = normalizePath(currentPath);
    return normalizedPath.includes('/books');
  };

  // Helper function to check if current path is for games
  const isGamesPath = (currentPath: string) => {
    const normalizedPath = normalizePath(currentPath);
    return normalizedPath.includes('/games');
  };

  // Helper function to check if current path is for apps
  const isAppsPath = (currentPath: string) => {
    const normalizedPath = normalizePath(currentPath);
    return normalizedPath.includes('/apps');
  };

  // Helper function to check if current path is for products
  const isProductsPath = (currentPath: string) => {
    const normalizedPath = normalizePath(currentPath);
    return normalizedPath.includes('/products');
  };

  // Helper function to check if current path is for people
  const isPeoplePath = (currentPath: string) => {
    const normalizedPath = normalizePath(currentPath);
    return normalizedPath.includes('/people');
  };

  // Helper function to check if current path is for guides
  const isGuidesPath = (currentPath: string) => {
    const normalizedPath = normalizePath(currentPath);
    return normalizedPath.includes('/guides');
  };

  // Map each tab ID to its published list count for ranking.
  // MUST be before any early return to comply with React Rules of Hooks.
  const categoryListCountMap: Record<string, number> = useMemo(() => ({
    public_recommendations: navigationCount(accountData, "public_recommendations", places.data?.recommendationLists?.length ?? 0),
    public_movie:           navigationCount(accountData, "public_movie", movies.data?.movieLists?.length ?? 0),
    public_books:           navigationCount(accountData, "public_books", books.data?.bookLists?.length ?? 0),
    public_games:           navigationCount(accountData, "public_games", games.data?.gameLists?.length ?? 0),
    public_apps:            navigationCount(accountData, "public_apps", apps.data?.appLists?.length ?? 0),
    public_products:        navigationCount(accountData, "public_products", products.data?.productLists?.length ?? 0),
    public_people:          navigationCount(accountData, "public_people", people.data?.personLists?.length ?? 0),
    public_guides:          navigationCount(accountData, "public_guides", guides.data?.guides?.length ?? 0),
    // Profile has no "lists" — it's always guaranteed a slot via default pin.
    public_profile:         0,
  }), [accountData?.public_navigation_counts, apps.data, books.data, games.data, guides.data, movies.data, people.data, places.data, products.data]);

  const [intendedPathname, setIntendedPathname] = useState<string | null>(null);
  const intentToken = useRef(0);
  const rollbackFrame = useRef<number>();
  const liveRouterPathname = useRef(normalizePath(location.pathname));

  useLayoutEffect(() => {
    liveRouterPathname.current = normalizePath(location.pathname);
    intentToken.current += 1;
    if (rollbackFrame.current !== undefined) window.cancelAnimationFrame(rollbackFrame.current);
    rollbackFrame.current = undefined;
    setIntendedPathname(null);
    return () => {
      intentToken.current += 1;
      if (rollbackFrame.current !== undefined) window.cancelAnimationFrame(rollbackFrame.current);
      rollbackFrame.current = undefined;
    };
  }, [location.pathname]);

  const activatePublicPath = useCallback((event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>, href: string) => {
    if (event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || event.currentTarget instanceof HTMLAnchorElement && event.currentTarget.target === "_blank") return;
    const pathname = normalizePath(href.split(/[?#]/, 1)[0]);
    if (liveRouterPathname.current === pathname
      && normalizePath(window.location.pathname) === pathname) return;
    const token = ++intentToken.current;
    setIntendedPathname(pathname);
    if (rollbackFrame.current !== undefined) window.cancelAnimationFrame(rollbackFrame.current);
    rollbackFrame.current = window.requestAnimationFrame(() => {
      if (intentToken.current !== token) return;
      rollbackFrame.current = undefined;
      if (liveRouterPathname.current === pathname
        || normalizePath(window.location.pathname) === pathname) return;
      setIntendedPathname(current => current === pathname ? null : current);
    });
  }, []);

  const activePathname = intendedPathname ?? location.pathname;

  // Don't render tabs until account data is loaded to prevent flash of default tabs
  if (loading || !accountData) {
    return (
      <nav
        aria-label="Public navigation"
        data-public-nav-state="loading"
        className="fixed md:rounded-lg z-50 w-full md:w-[33%] md:translate-x-[102%] bg-[#2a2a2a] text-white flex md:flex-row md:justify-center md:items-center justify-center px-1 shadow-md"
        style={{ bottom: 'var(--public-nav-edge-offset)', paddingTop: '0.25rem', paddingBottom: 'calc(0.25rem + var(--public-safe-bottom, env(safe-area-inset-bottom, 0px)))', zIndex: 'var(--z-public-nav)' }}
      >
        <div className="flex mx-[1.5rem] md:border-0 flex-row justify-around w-full">
          {/* Empty placeholder to maintain layout height while loading */}
          <div style={{ height: '2.5rem' }} />
        </div>
      </nav>
    );
  }

  const navItems = [
    // Only add recommendations tab if visibility is enabled
    ...(showRecommendationsTab ? [{
      id: 'public_recommendations',
      icon: isPlacesPath(activePathname)
        ? <DirectionBoard fill="white" />
        : <DirectionBoard outline strokeColor="rgba(255,255,255,0.5)" />,
      text: "Places",
      path: `/${username}/places`,
    }] : []),
    // Only add guides tab if visibility is enabled
    ...(showGuidesTab ? [{
      id: 'public_guides',
      icon: isGuidesPath(activePathname)
        ? <TravelGuideIcon fill="white" />
        : <TravelGuideIcon outline strokeColor="rgba(255,255,255,0.5)" />,
      text: "Guides",
      path: `/${username}/guides`,
    }] : []),
    ...(showMusicTab ? [{
      id: "public_music",
      icon: <Music2 size={18} color={activePathname.endsWith("/music") ? "white" : "rgba(255,255,255,0.5)"} />,
      text: "Music",
      path: appendAttributionParamsToPath(`/${username}/music`, location.search),
    }] : []),
    // Only add profile tab if visibility is enabled
    ...(showProfileTab ? [{
      id: 'public_profile',
      icon: isPathMatch(activePathname, `/${username}`)
        ? <Profile fill="white" />
        : <Profile outline strokeColor="rgba(255,255,255,0.5)" />,
      text: "Profile",
      path: `/${username}`,
    }] : []),
    // Only add movies tab if visibility is enabled
    ...(showMoviesTab ? [{
      id: 'public_movie',
      icon: isMoviesPath(activePathname)
        ? <Film size={18} color="white" strokeWidth={2.5} />
        : <Film size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "Movies",
      path: `/${username}/movies`,
    }] : []),
    // Only add books tab if visibility is enabled
    ...(showBooksTab ? [{
      id: 'public_books',
      icon: isBooksPath(activePathname)
        ? <BookOpen size={18} color="white" strokeWidth={2.5} />
        : <BookOpen size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "Books",
      path: `/${username}/books`,
    }] : []),
    // Only add games tab if visibility is enabled
    ...(showGamesTab ? [{
      id: 'public_games',
      icon: isGamesPath(activePathname)
        ? <Gamepad2 size={18} color="white" strokeWidth={2.5} />
        : <Gamepad2 size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "Games",
      path: `/${username}/games`,
    }] : []),
    // Only add apps tab if visibility is enabled
    ...(showAppsTab ? [{
      id: 'public_apps',
      icon: isAppsPath(activePathname)
        ? <Smartphone size={18} color="white" strokeWidth={2.5} />
        : <Smartphone size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "Apps",
      path: `/${username}/apps`,
    }] : []),
    // Only add products tab if visibility is enabled
    ...(showProductsTab ? [{
      id: 'public_products',
      icon: isProductsPath(activePathname)
        ? <ShoppingBag size={18} color="white" strokeWidth={2.5} />
        : <ShoppingBag size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "Products",
      path: `/${username}/products`,
    }] : []),
    // Only add people tab if visibility is enabled
    ...(showPeopleTab ? [{
      id: 'public_people',
      icon: isPeoplePath(activePathname)
        ? <Users size={18} color="white" strokeWidth={2.5} />
        : <Users size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "People",
      path: `/${username}/people`,
    }] : []),
  ];

  // ─── Footer Nav Logic ──────────────────────────────────────────────────
  // Single source of truth for pinned/shown tabs (auto-rank vs manual, max 5).
  // See src/utils/navPinning.ts — shared with the Recommendations Hub.
  const finalNavItems = computePinnedNavTabIds(accountData, categoryListCountMap, { musicAvailable: showMusicTab })
    .map(id => navItems.find(item => item.id === id))
    .filter(Boolean) as typeof navItems;
  // ───────────────────────────────────────────────────────────────────────



  return (
    <nav
      aria-label="Public navigation"
      data-public-nav-state="ready"
      className="fixed md:rounded-lg z-50 w-full md:w-[33%] md:translate-x-[102%] bg-[#2a2a2a] text-white flex md:flex-row md:justify-center md:items-center justify-center px-1 shadow-md"
      style={{ bottom: 'var(--public-nav-edge-offset)', paddingTop: '0.125rem', paddingBottom: 'calc(0.125rem + var(--public-safe-bottom, env(safe-area-inset-bottom, 0px)))', zIndex: 'var(--z-public-nav)' }}
    >
      <div className="flex h-11 mx-[1.5rem] md:border-0 flex-row justify-around w-full">
        {finalNavItems.map((item, index) => {
          // Check if current path matches the nav item path
          const itemPathname = item.path.split("?")[0];
          const isActive = isPathMatch(activePathname, itemPathname) ||
            (item.path.includes('/places') && isPlacesPath(activePathname)) ||
            (item.path.includes('/movies') && isMoviesPath(activePathname)) ||
            (item.path.includes('/books') && isBooksPath(activePathname)) ||
            (item.path.includes('/games') && isGamesPath(activePathname)) ||
            (item.path.includes('/apps') && isAppsPath(activePathname)) ||
            (item.path.includes('/products') && isProductsPath(activePathname)) ||
            (item.path.includes('/people') && isPeoplePath(activePathname)) ||
            (item.path.includes('/guides') && isGuidesPath(activePathname));

          return (
            <NavButton
              type="public"
              key={index}
              icon={item.icon}
              text={item.text}
              isActive={isActive}
              href={item.path}
              onClickHandler={(event) => activatePublicPath(event, item.path)}
            />
          );
        })}
      </div>
    </nav>
  );
});

export default PublicNav;
