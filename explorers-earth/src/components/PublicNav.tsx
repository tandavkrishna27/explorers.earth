import { memo, useMemo } from "react";
import NavButton from "./ui/NavButton";
import DirectionBoard from "../assets/icons/DirectionBoard";
import Profile from "../assets/icons/Profile";
import MusicNote from "../assets/icons/MusicNote";
import TravelGuideIcon from "../assets/icons/TravelGuideIcon";
import { Film, BookOpen, Gamepad2, Smartphone, ShoppingBag, Users } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@apollo/client";
import {
  getPublicAccountBasicQuery,
  getPublicCategoryListCountsQuery,
} from "../features/PublicHome/api/query";
import { computePinnedNavTabIds } from "../utils/navPinning";

const PublicNav = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const { username } = useParams();

  // Query to get account data for tab visibility
  const { data, loading } = useQuery(getPublicAccountBasicQuery, {
    variables: {
      filters: {
        username: {
          eq: username,
        },
      },
    },
    skip: !username,
    // Revalidate on mount so "View Public Page" reflects the owner's latest
    // visibility/pin config. Account isn't normalized in apolloCache, so a hub
    // edit to pinned_nav_tabs/visibility doesn't patch this separate cache-first
    // query; without this it would show stale config until a hard reload.
    fetchPolicy: "cache-and-network",
  });

  const accountData = data?.accounts[0];

  // Second query: fetch published list counts per category (for smart auto-fill ranking).
  // Only runs after the account document ID is available from the first query.
  const { data: listCountsData } = useQuery(getPublicCategoryListCountsQuery, {
    variables: {
      accountDocumentId: accountData?.documentId,
    },
    skip: !accountData?.documentId,
  });

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

  // Helper function to check if current path is for music
  const isMusicPath = (currentPath: string) => {
    const normalizedPath = normalizePath(currentPath);
    return normalizedPath.includes('/music');
  };

  // Tab visibility logic based on Account collection fields
  // Strict opt-in: a category tab is public only when explicitly "Yes".
  const showRecommendationsTab = accountData?.public_recommendations === "Yes";
  const showProfileTab = true; // Always show public profile tab
  const showMusicTab = accountData?.public_music === "Yes";
  const showGuidesTab = accountData?.public_guides === "Yes";
  const showMoviesTab = accountData?.public_movie === "Yes";
  const showBooksTab = accountData?.public_books === "Yes";
  const showGamesTab = accountData?.public_games === "Yes";
  const showAppsTab = accountData?.public_apps === "Yes";
  const showProductsTab = accountData?.public_products === "Yes";
  const showPeopleTab = accountData?.public_people === "Yes";

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
    public_recommendations: listCountsData?.recommendationLists?.length ?? 0,
    public_movie:           listCountsData?.movieLists?.length ?? 0,
    public_books:           listCountsData?.bookLists?.length ?? 0,
    public_games:           listCountsData?.gameLists?.length ?? 0,
    public_apps:            listCountsData?.appLists?.length ?? 0,
    public_products:        listCountsData?.productLists?.length ?? 0,
    public_people:          listCountsData?.personLists?.length ?? 0,
    public_guides:          listCountsData?.guides?.length ?? 0,
    // Music is from LocalTunes — count is not available via GraphQL here;
    // treat it as 0 so it fills after content-heavy tabs.
    public_music:           0,
    // Profile has no "lists" — it's always guaranteed a slot via default pin.
    public_profile:         0,
  }), [listCountsData]);

  // Don't render tabs until account data is loaded to prevent flash of default tabs
  if (loading || !accountData) {
    return (
      <div className="fixed bottom-0 md:bottom-2 md:rounded-lg z-50 w-full md:w-[33%]  md:translate-x-[102%]  bg-[#2a2a2a] text-white flex md:flex-row md:justify-center md:items-center justify-center p-1  shadow-md">
        <div className="flex mx-[1.5rem] md:border-0 flex-row justify-around w-full">
          {/* Empty placeholder to maintain layout height while loading */}
          <div style={{ height: '2.5rem' }} />
        </div>
      </div>
    );
  }

  const navItems = [
    // Only add recommendations tab if visibility is enabled
    ...(showRecommendationsTab ? [{
      id: 'public_recommendations',
      icon: isPlacesPath(location.pathname)
        ? <DirectionBoard fill="white" />
        : <DirectionBoard outline strokeColor="rgba(255,255,255,0.5)" />,
      text: "Places",
      path: `/${username}/places`,
    }] : []),
    // Only add guides tab if visibility is enabled
    ...(showGuidesTab ? [{
      id: 'public_guides',
      icon: isGuidesPath(location.pathname)
        ? <TravelGuideIcon fill="white" />
        : <TravelGuideIcon outline strokeColor="rgba(255,255,255,0.5)" />,
      text: "Guides",
      path: `/${username}/guides`,
    }] : []),
    // Only add profile tab if visibility is enabled
    ...(showProfileTab ? [{
      id: 'public_profile',
      icon: isPathMatch(location.pathname, `/${username}`)
        ? <Profile fill="white" />
        : <Profile outline strokeColor="rgba(255,255,255,0.5)" />,
      text: "Profile",
      path: `/${username}`,
    }] : []),
    // Only add movies tab if visibility is enabled
    ...(showMoviesTab ? [{
      id: 'public_movie',
      icon: isMoviesPath(location.pathname)
        ? <Film size={18} color="white" strokeWidth={2.5} />
        : <Film size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "Movies",
      path: `/${username}/movies`,
    }] : []),
    // Only add music tab if visibility is enabled
    ...(showMusicTab ? [{
      id: 'public_music',
      icon: isMusicPath(location.pathname)
        ? <MusicNote fill="white" />
        : <MusicNote outline strokeColor="rgba(255,255,255,0.5)" />,
      text: "Music",
      path: `/${username}/music`,
    }] : []),
    // Only add books tab if visibility is enabled
    ...(showBooksTab ? [{
      id: 'public_books',
      icon: isBooksPath(location.pathname)
        ? <BookOpen size={18} color="white" strokeWidth={2.5} />
        : <BookOpen size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "Books",
      path: `/${username}/books`,
    }] : []),
    // Only add games tab if visibility is enabled
    ...(showGamesTab ? [{
      id: 'public_games',
      icon: isGamesPath(location.pathname)
        ? <Gamepad2 size={18} color="white" strokeWidth={2.5} />
        : <Gamepad2 size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "Games",
      path: `/${username}/games`,
    }] : []),
    // Only add apps tab if visibility is enabled
    ...(showAppsTab ? [{
      id: 'public_apps',
      icon: isAppsPath(location.pathname)
        ? <Smartphone size={18} color="white" strokeWidth={2.5} />
        : <Smartphone size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "Apps",
      path: `/${username}/apps`,
    }] : []),
    // Only add products tab if visibility is enabled
    ...(showProductsTab ? [{
      id: 'public_products',
      icon: isProductsPath(location.pathname)
        ? <ShoppingBag size={18} color="white" strokeWidth={2.5} />
        : <ShoppingBag size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "Products",
      path: `/${username}/products`,
    }] : []),
    // Only add people tab if visibility is enabled
    ...(showPeopleTab ? [{
      id: 'public_people',
      icon: isPeoplePath(location.pathname)
        ? <Users size={18} color="white" strokeWidth={2.5} />
        : <Users size={18} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />,
      text: "People",
      path: `/${username}/people`,
    }] : []),
  ];

  // ─── Footer Nav Logic ──────────────────────────────────────────────────
  // Single source of truth for pinned/shown tabs (auto-rank vs manual, max 5).
  // See src/utils/navPinning.ts — shared with the Recommendations Hub.
  const finalNavItems = computePinnedNavTabIds(accountData, categoryListCountMap)
    .map(id => navItems.find(item => item.id === id))
    .filter(Boolean) as typeof navItems;
  // ───────────────────────────────────────────────────────────────────────



  return (
    <div className="fixed bottom-0 md:bottom-2 md:rounded-lg z-50 w-full md:w-[33%]  md:translate-x-[102%]  bg-[#2a2a2a] text-white flex md:flex-row md:justify-center md:items-center justify-center py-0.5 px-1  shadow-md">
      <div className="flex mx-[1.5rem] md:border-0 flex-row justify-around w-full">
        {finalNavItems.map((item, index) => {
          // Check if current path matches the nav item path
          const isActive = isPathMatch(location.pathname, item.path) ||
            (item.path.includes('/places') && isPlacesPath(location.pathname)) ||
            (item.path.includes('/music') && isMusicPath(location.pathname)) ||
            (item.path.includes('/movies') && isMoviesPath(location.pathname)) ||
            (item.path.includes('/books') && isBooksPath(location.pathname)) ||
            (item.path.includes('/games') && isGamesPath(location.pathname)) ||
            (item.path.includes('/apps') && isAppsPath(location.pathname)) ||
            (item.path.includes('/products') && isProductsPath(location.pathname)) ||
            (item.path.includes('/people') && isPeoplePath(location.pathname)) ||
            (item.path.includes('/guides') && isGuidesPath(location.pathname));

          return (
            <NavButton
              type="public"
              key={index}
              icon={item.icon}
              text={item.text}
              isActive={isActive}
              onClickHandler={() => navigate(item.path)}
            />
          );
        })}
      </div>
    </div>
  );
});

export default PublicNav;
