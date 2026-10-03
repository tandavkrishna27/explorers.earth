import { memo, useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import useAuthStore from "../store/store";
import Button from "../components/ui/Button";
import ShareIcon from "../assets/icons/ShareIcon";
import { useQuery, useMutation } from "@apollo/client";
import { getCurrentDomain } from "../utils/getCurrentDomain";
import { EarthLoader } from "../components/EarthLoader";
import MobileIcon from "../assets/icons/MobileIcon";
import WhatsappIcon from "../assets/icons/WhatsappIcon";
import TwitterIcon from "../assets/icons/TwitterIcon";
import InstagramIcon from "../assets/icons/InstagramIcon";
import ShareModal from "../components/ShareModal";
import { GlobeDemo } from "../components/ui/GlobeDemo";
import ThemedIcon from "../components/ui/ThemedIcon";
import { recommendationListQuery } from "../features/Favorites/api/query";
import { accountsDetailQuery } from "../features/PublicHome/api/query";
import { useNavigate, useLocation } from "react-router-dom";
import { toUrlSlug } from "../utils/formatAddress";
import SEO from "../components/SEO";
import ImageWithFallback from "../components/ui/ImageWithFallback";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import { createUtmParams } from "../utils/urlHelpers";
import { IMAGE_CONFIG } from "../config";
import { useCityStore } from "../store/useCityStore";
import useSetupStore from "../store/useSetupStore";
import ProfileSetupAccordion from "../components/ProfileSetupAccordion";
import { DASHBOARD_STATUS_QUERY } from "../features/Profile/api/UserStatus";
import { GET_GUIDES_QUERY, GET_USER_ACCOUNT_QUERY } from "../features/Guides/api/queries";
import type { Guide } from "../features/Guides/types";
import { getAllUserLocations } from "../utils/geoHelpers";
import InteractiveMap from "../components/InteractiveMap";
import { calculateIsRecommendationsComplete } from "../utils/setupStatusCalculations";
import { selectCompletedAccount } from "../features/music/musicIdentityCoordinator";
import { publicMusicShareUrl } from "../features/music/musicShareUrl";
import { useCanonicalAccount } from "../features/Profile/api/useCanonicalAccount";

// Category integrations
import { MOVIE_LISTS_BY_ACCOUNT } from "../features/Movies/api/query";
import { BOOK_LISTS_BY_ACCOUNT } from "../features/Books/api/query";
import { GAME_LISTS_BY_ACCOUNT } from "../features/Games/api/query";
import { APP_LISTS_BY_ACCOUNT } from "../features/AppsAndTools/api/query";
import { PRODUCT_LISTS_BY_ACCOUNT } from "../features/Products/api/query";
import { PERSON_LISTS_BY_ACCOUNT } from "../features/People/api/query";
import { useTunesDashboard } from "../hooks/useTunesDashboard";
import type { PublicPageAnalyticsData } from "../features/Analytics/api/queries";
import { getAnalyticsDateRange } from "../features/Analytics/utils/analyticsDateRange";
import { readExplorersAnalyticsEvents } from "../services/explorersAnalyticsClient";

import { useQueryClient } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { GOOGLE_PLACES_API_BASE_URL } from "../config";

// Modals
import AddLocationModal from "../components/ui/AddLocationModal";
import { CreateMovieListModal } from "../features/Movies/components/dashboard/MoviesHome";
import { CreateBookListModal } from "../features/Books/components/dashboard/BooksHome";
import { CreateGameListModal } from "../features/Games/components/dashboard/GamesHome";
import { CreateAppListModal } from "../features/AppsAndTools/components/dashboard/AppsHome";
import { CreateProductListModal } from "../features/Products/components/dashboard/ProductsHome";
import { CreatePersonListModal } from "../features/People/components/dashboard/PeopleHome";
import { CreateGuideModal } from "../features/Guides";
import { CategoryEmptyState } from "../components/CategoryEmptyState";

// Mutations & queries
import { createRecommendationLinkMutation } from "../features/Favorites/api/mutation";
import { musicWorkspaceClient } from "../hooks/useTunesDashboard";

type HomeAnalyticsState = "loading" | "ready" | "unavailable";

interface HomeAnalyticsLabels {
  label: string;
  loading: string;
  unavailable: string;
}

const defaultHomeAnalyticsLabels: HomeAnalyticsLabels = {
  label: "Views · last 90 days",
  loading: "Loading",
  unavailable: "Unavailable",
};

export function getHomeRecentAnalyticsScope(
  now = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const range = getAnalyticsDateRange({ type: "last90days" }, now);
  if (!range) throw new Error("Recent analytics range is unavailable");
  return { fromDate: range.fromDate, toDate: range.toDate, timeZone };
}

export function getHomeAnalyticsCard(
  state: HomeAnalyticsState,
  analyticsData: PublicPageAnalyticsData[],
  labels: HomeAnalyticsLabels = defaultHomeAnalyticsLabels,
) {
  if (state === "loading") return { label: labels.label, value: labels.loading };
  if (state === "unavailable") return { label: labels.label, value: labels.unavailable };
  const totalViews = analyticsData
    .flatMap((item) => item.Stats || [])
    .filter((event) => event.type === "view").length;
  return {
    label: labels.label,
    value: totalViews >= 1000 ? `${(totalViews / 1000).toFixed(1)}k` : totalViews.toString(),
  };
}

// S3 upload helpers
import {
  generateLocationThumbnailPath,
  generateRandomFileName,
  sanitizeUsername,
} from "../utils/uploadPathGenerator";


const resolveCoverUrl = (
  path: string | null | undefined,
  type?: "movie" | "book" | "game" | "place" | "guide" | "music"
): string | undefined => {
  if (!path || path === "null" || path === "undefined") return undefined;

  // If it's already a full URL, return it
  if (path.startsWith("http")) return path;

  // If it starts with /uploads/ (local Strapi upload), prepend backend URL
  if (path.startsWith("/uploads/")) {
    const backendUrl = import.meta.env.VITE_REST_API_URL?.replace("/api", "") || "http://localhost:1337";
    return `${backendUrl}${path}`;
  }

  // If it's a movie poster from TMDB (starts with / but not /uploads/)
  if (type === "movie") {
    return `https://image.tmdb.org/t/p/w185${path.startsWith("/") ? path : `/${path}`}`;
  }

  // If it starts with / but not /uploads/ for other types, check if we should prepend backend URL anyway
  if (path.startsWith("/")) {
    const backendUrl = import.meta.env.VITE_REST_API_URL?.replace("/api", "") || "http://localhost:1337";
    return `${backendUrl}${path}`;
  }

  return path;
};

const HomeSkeleton = memo(() => {
  return (
    <div className="bg-dashboard-bg min-h-screen px-2 md:px-6 pt-2 pb-24 md:pb-6 max-w-4xl mx-auto space-y-6">
      {/* Header Bar Shimmer */}
      <div className="hidden md:flex justify-between items-center bg-dashboard-sidebar/40 px-4 py-3.5 rounded-2xl border border-white/5">
        <div className="h-6 w-32 bg-white/5 rounded-xl skeleton-shimmer" />
        <div className="h-10 w-40 bg-white/10 rounded-xl skeleton-shimmer" />
      </div>

      {/* Main Globe Card Area Placeholder */}
      <div className="relative w-full h-[55vh] min-h-[350px] max-h-[500px] rounded-2xl bg-white/5 overflow-hidden border border-white/5 shadow-2xl skeleton-card">
        <div className="absolute inset-0 skeleton-shimmer" />
        <div className="absolute bottom-6 left-6 right-6 space-y-3">
          <div className="h-6 w-2/3 bg-white/15 rounded skeleton-shimmer" />
          <div className="h-4 w-1/2 bg-white/10 rounded skeleton-shimmer" />
        </div>
      </div>

      {/* Setup banner shimmer */}
      <div className="h-24 w-full bg-white/5 rounded-2xl border border-white/5 skeleton-card" />

      {/* Tab Switcher Shimmer */}
      <div className="flex items-center justify-center mx-auto bg-white/5 border border-white/5 rounded-3xl w-fit p-1 gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-8 w-16 md:w-20 bg-white/10 rounded-2xl skeleton-shimmer" />
        ))}
      </div>

      {/* List items placeholders */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-dashboard-sidebar border border-dashboard rounded-2xl p-4 flex items-center gap-4 h-24 skeleton-card">
            <div className="w-14 h-14 rounded-full bg-white/10 skeleton-shimmer flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-white/10 rounded skeleton-shimmer" />
              <div className="h-3 w-1/4 bg-white/5 rounded skeleton-shimmer" />
            </div>
            <div className="w-16 h-8 rounded-full bg-white/10 skeleton-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
});
HomeSkeleton.displayName = "HomeSkeleton";

const Home = memo(() => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const sessionGeneration = useAuthStore((state) => state.generation);
  const canonicalAccount = useCanonicalAccount();
  const canonicalHandle = canonicalAccount.data?.handle ?? "";
  const token = useAuthStore((state) => state.token);
  const { setSelectedCity } = useCityStore();
  const { setSetupStatus } = useSetupStore();
  const location = useLocation();
  const [showProfileShareModal, setShowProfileShareModal] =
    useState<boolean>(false);

  const [showRecommendationsShareModal, setShowRecommendationsShareModal] =
    useState<boolean>(false);
  const [showCategoryShareModal, setShowCategoryShareModal] =
    useState<boolean>(false);
  const [showRecommendationShareModals, setShowRecommendationShareModals] =
    useState<{ [key: string]: boolean }>({});
  const [showGuidesShareModal, setShowGuidesShareModal] = useState<boolean>(false);
  const [showGuideShareModals, setShowGuideShareModals] = useState<{ [key: string]: boolean }>({});
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [analyticsData, setAnalyticsData] = useState<PublicPageAnalyticsData[]>([]);
  const [analyticsState, setAnalyticsState] = useState<HomeAnalyticsState>("loading");
  const [activeTab, setActiveTab] = useState<
    "places" | "movies" | "books" | "games" | "music" | "guides" | "apps" | "products" | "people"
  >("places");

  // Left/right swipe to move between category tabs on touch devices. The tab
  // content stacks vertically (no horizontal card carousels), so a horizontal
  // swipe never conflicts with an inner scroll. Swipes that start on the tab bar
  // itself are ignored so it can still scroll horizontally.
  const TAB_ORDER = [
    "places", "movies", "books", "games", "music", "guides", "apps", "products", "people",
  ] as const;
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTabTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest?.(".home-tab-container")) {
      swipeStartRef.current = null; // let the tab bar scroll
      return;
    }
    const t = e.touches[0];
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTabTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Require a clearly horizontal swipe so vertical scrolls never switch tabs.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = TAB_ORDER.indexOf(activeTab);
    if (dx < 0 && idx < TAB_ORDER.length - 1) setActiveTab(TAB_ORDER[idx + 1]);
    else if (dx > 0 && idx > 0) setActiveTab(TAB_ORDER[idx - 1]);
  };

  // Keep the active tab visible in the horizontally-scrollable tab bar (esp.
  // after a swipe moves to a tab that was off-screen).
  useEffect(() => {
    const activeBtn = tabBarRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    activeBtn?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeTab]);

  // Inline Modal Creation States
  const [showCreatePlacesModal, setShowCreatePlacesModal] = useState<boolean>(false);
  const [showCreateMoviesModal, setShowCreateMoviesModal] = useState<boolean>(false);
  const [showCreateBooksModal, setShowCreateBooksModal] = useState<boolean>(false);
  const [showCreateGamesModal, setShowCreateGamesModal] = useState<boolean>(false);
  const [showCreateMusicModal, setShowCreateMusicModal] = useState<boolean>(false);
  const [showCreateGuidesModal, setShowCreateGuidesModal] = useState<boolean>(false);
  const [showCreateAppsModal, setShowCreateAppsModal] = useState<boolean>(false);
  const [showCreateProductsModal, setShowCreateProductsModal] = useState<boolean>(false);
  const [showCreatePeopleModal, setShowCreatePeopleModal] = useState<boolean>(false);
  const [prefillTitle, setPrefillTitle] = useState<string>("");

  const queryClient = useQueryClient();
  const [createRecommendationLink] = useMutation(createRecommendationLinkMutation);

  // Create UTM parameters for sharing
  const profileUtmParams = createUtmParams.directShare();
  const recommendationUtmParams = createUtmParams.directShare();
  const guidesUtmParams = createUtmParams.directShare();

  // Query for dashboard status to check completion (includes published status)
  const { data: dashboardStatusData, loading: dashboardStatusLoading } = useQuery(DASHBOARD_STATUS_QUERY, {
    variables: {
      documentId: user?.documentId,
    },
    fetchPolicy: "cache-and-network",
    skip: !user?.username || !user?.documentId,
  });

  const { data, loading, error } = useQuery(accountsDetailQuery, {
    variables: {
      filters: {
        username: {
          eq: user?.username,
        },
      },
    },
    fetchPolicy: "network-only",
    skip: !user?.username, // Skip query if user is not authenticated
  });

  useEffect(() => {
    if (!loading && !dashboardStatusLoading) {
      (window as any).__dashboardLoaded = true;
    }
  }, [loading, dashboardStatusLoading]);

  const { data: userLists, refetch: refetchUserLists } = useQuery(recommendationListQuery, {
    variables: {
      filters: {
        account: {
          username: {
            eq: user?.username,
          },
        },
      },
    },
    fetchPolicy: "network-only",
    skip: !user?.username, // Skip query if user is not authenticated
  });

  // Get account documentId for guides query (reuse existing query pattern)
  const {
    data: accountDataForGuides,
    loading: accountLookupLoading,
    error: accountLookupError,
  } = useQuery(GET_USER_ACCOUNT_QUERY, {
    variables: { documentId: user?.documentId },
    skip: !user?.documentId,
    fetchPolicy: "cache-first", // Reuse cache if available
  });

  const selectedAccount = selectCompletedAccount(accountDataForGuides?.usersPermissionsUser?.accounts);
  const accountDocumentId = selectedAccount?.documentId;

  // Fetch movie lists
  const { data: movieListsData, refetch: refetchMovies } = useQuery(MOVIE_LISTS_BY_ACCOUNT, {
    variables: { accountDocumentId },
    skip: !accountDocumentId || !user?.username,
    fetchPolicy: "network-only",
  });
  const movieLists = movieListsData?.movieLists || [];

  // Fetch book lists
  const { data: bookListsData, refetch: refetchBooks } = useQuery(BOOK_LISTS_BY_ACCOUNT, {
    variables: { accountDocumentId },
    skip: !accountDocumentId || !user?.username,
    fetchPolicy: "network-only",
  });
  const bookLists = bookListsData?.bookLists || [];

  // Fetch game lists
  const { data: gameListsData, refetch: refetchGames } = useQuery(GAME_LISTS_BY_ACCOUNT, {
    variables: { accountDocumentId },
    skip: !accountDocumentId || !user?.username,
    fetchPolicy: "network-only",
  });
  const gameLists = gameListsData?.gameLists || [];

  // Fetch apps & tools lists
  const { data: appListsData, refetch: refetchApps } = useQuery(APP_LISTS_BY_ACCOUNT, {
    variables: { accountDocumentId },
    skip: !accountDocumentId || !user?.username,
    fetchPolicy: "network-only",
  });
  const appLists = appListsData?.appLists || [];

  // Fetch products lists
  const { data: productListsData, refetch: refetchProducts } = useQuery(PRODUCT_LISTS_BY_ACCOUNT, {
    variables: { accountDocumentId },
    skip: !accountDocumentId || !user?.username,
    fetchPolicy: "network-only",
  });
  const productLists = productListsData?.productLists || [];

  // Fetch people lists
  const { data: personListsData, refetch: refetchPeople } = useQuery(PERSON_LISTS_BY_ACCOUNT, {
    variables: { accountDocumentId },
    skip: !accountDocumentId || !user?.username,
    fetchPolicy: "network-only",
  });
  const personLists = personListsData?.personLists || [];

  // Fetch music playlists
  const tunesDashboard = useTunesDashboard(user?.documentId && accountDocumentId ? {
    userDocumentId: user.documentId,
    accountDocumentId,
  } : undefined);
  const musicPlaylists = tunesDashboard.playlists || [];

  // Fetch guides with network-only policy to match Recommendations behavior
  // Fetch all guides (not just published) so cache gets updated when drafts are created/updated
  const { data: guidesData, refetch: refetchGuides } = useQuery(GET_GUIDES_QUERY, {
    variables: {
      filters: {
        account: {
          documentId: {
            eq: accountDocumentId,
          },
        },
      },
      pagination: {
        limit: 100,
      },
    },
    fetchPolicy: "network-only", // Always fetch fresh data, matching Recommendations
    skip: !accountDocumentId || !user?.username,
  });

  // Read only the bounded recent local-calendar range through the authenticated
  // backend boundary. Never download another account's analytics to the browser.
  useEffect(() => {
    let active = true;
    if (accountLookupLoading) {
      setAnalyticsData([]);
      setAnalyticsState("loading");
      return () => {
        active = false;
      };
    }

    if (accountLookupError || !accountDocumentId || !token) {
      setAnalyticsData([]);
      setAnalyticsState("unavailable");
      return () => {
        active = false;
      };
    }

    setAnalyticsState("loading");
    void readExplorersAnalyticsEvents({
      accountId: accountDocumentId,
      ...getHomeRecentAnalyticsScope(),
      token,
    })
      .then((records) => {
        if (active) {
          setAnalyticsData(records as PublicPageAnalyticsData[]);
          setAnalyticsState("ready");
        }
      })
      .catch(() => {
        if (active) {
          setAnalyticsData([]);
          setAnalyticsState("unavailable");
        }
      });

    return () => {
      active = false;
    };
  }, [accountDocumentId, accountLookupError, accountLookupLoading, token]);

  // Refetch guides when navigating back from guide creation/editing (matching Recommendations pattern)
  useEffect(() => {
    if (location.state?.refetchGuides) {
      refetchGuides();
      // Clear the state to prevent refetch on re-render
      window.history.replaceState({}, document.title);
    }
  }, [location.state, refetchGuides]);

  // Refetch guides on window focus to ensure real-time sync (matching Recommendations pattern)
  useEffect(() => {
    const handleFocus = () => {
      if (accountDocumentId && user?.username) {
        refetchGuides();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [accountDocumentId, user?.username, refetchGuides]);

  const account = data?.accounts?.find((candidate: { documentId?: string }) => candidate.documentId === accountDocumentId);
  const url = getCurrentDomain();

  const activeTabShareUrl = useMemo(() => {
    let subPath = "places";
    if (activeTab === "places") subPath = "places";
    else if (activeTab === "movies") subPath = "movies";
    else if (activeTab === "books") subPath = "books";
    else if (activeTab === "games") subPath = "games";
    else if (activeTab === "music") {
      return publicMusicShareUrl(url, tunesDashboard.dashboard?.publication) ?? `${url}/music`;
    }
    else if (activeTab === "guides") subPath = "guides";
    else if (activeTab === "apps") subPath = "apps";
    else if (activeTab === "products") subPath = "products";
    else if (activeTab === "people") subPath = "people";

    return `${url}/${canonicalHandle}/${subPath}`;
  }, [activeTab, tunesDashboard.dashboard?.publication, url, canonicalHandle]);
  const listNames = userLists?.recommendationLists;
  const allGuides: Guide[] = guidesData?.guides || [];
  // Show all guides (drafts and published) on Home Dashboard, matching Recommendations behavior

  // Extract all unique coordinates from Guides and Recommendations for globe visualization
  const allUserLocations = useMemo(() => {
    return getAllUserLocations(allGuides, listNames || []);
  }, [allGuides, listNames]);

  // Calculate completion flags - Enhanced profile completion check
  const isProfileComplete = canonicalAccount.data?.onboardingStatus === "complete";

  const isRecommendationsComplete = useMemo(() => {
    // Try dashboardStatusData first, then fallback to listNames
    const dashboardAccount = dashboardStatusData?.me?.accounts?.find((candidate: { documentId?: string }) => candidate.documentId === accountDocumentId);
    const lists = dashboardAccount?.recommendation_lists || listNames;

    const isComplete = calculateIsRecommendationsComplete(lists);

    if (process.env.NODE_ENV === 'development') {
      console.log('Recommendations Complete Check:', {
        isComplete,
        dashboardLists: dashboardAccount?.recommendation_lists?.length || 0,
        listNamesCount: listNames?.length || 0
      });
    }

    return isComplete;
  }, [dashboardStatusData, listNames, accountDocumentId]);

  // Extensible: Check if ALL setup points are complete
  // Add new setup points here as the app grows
  // IMPORTANT: Only show account setup card when setup is INCOMPLETE
  // Show recommendations section when ALL setup points are complete
  const isAllSetupComplete = useMemo(() => {
    // Wait for critical data to load before making a decision
    // Don't show setup card during loading - show loading spinner instead
    if (canonicalAccount.isPending || dashboardStatusLoading || loading) {
      return false; // Wait for data to load - loading state handles this
    }

    // If we have account data (from either source), proceed with checks
    const hasAccountData = canonicalAccount.data;
    if (!hasAccountData) {
      return false; // No account data available yet - show setup card
    }

    // CRITICAL: Visibility logic:
    // Show Profile Setup when: setup is incomplete
    // Show My Recommendations when: both steps are complete
    const bothComplete = isProfileComplete && isRecommendationsComplete;

    // Debug logging (can be removed in production)
    if (process.env.NODE_ENV === 'development') {
      console.log('Setup Status:', {
        isProfileComplete,
        isRecommendationsComplete,
        bothComplete,
        hasAccountData: !!hasAccountData,
        dashboardStatusLoading,
        loading
      });
    }

    // If both steps are complete, hide the setup card immediately
    return bothComplete;
  }, [isProfileComplete, isRecommendationsComplete, canonicalAccount.data, canonicalAccount.isPending, dashboardStatusLoading, loading]);

  const totalActiveListsCount = useMemo(() => {
    const activePlaces = listNames?.filter((list: any) => list.Visibility === true)?.length || 0;
    const activeMovies = movieLists?.filter((list: any) => list.Visibility === true)?.length || 0;
    const activeBooks = bookLists?.filter((list: any) => list.visibility === true)?.length || 0;
    const activeGames = gameLists?.filter((list: any) => list.Visibility === true)?.length || 0;
    const activeMusic = musicPlaylists?.filter((list: any) => list.isVisibleToGuests === true)?.length || 0;
    const activeGuides = allGuides?.filter((guide: any) => guide.Visibility === true)?.length || 0;
    const activeApps = appLists?.filter((list: any) => list.Visibility === true)?.length || 0;
    const activeProducts = productLists?.filter((list: any) => list.Visibility === true)?.length || 0;
    const activePeople = personLists?.filter((list: any) => list.Visibility === true)?.length || 0;
    return activePlaces + activeMovies + activeBooks + activeGames + activeMusic + activeGuides + activeApps + activeProducts + activePeople;
  }, [listNames, movieLists, bookLists, gameLists, musicPlaylists, allGuides, appLists, productLists, personLists]);

  const totalRecommendationsCount = useMemo(() => {
    const placesRecs = listNames?.filter((list: any) => list.Visibility === true)?.reduce((total: number, list: any) => total + (list?.recommended_places?.length || 0), 0) || 0;
    const moviesRecs = movieLists?.filter((list: any) => list.Visibility === true)?.reduce((total: number, list: any) => total + (list?.recommended_movies?.length || 0), 0) || 0;
    const booksRecs = bookLists?.filter((list: any) => list.visibility === true)?.reduce((total: number, list: any) => total + (list?.recommended_books?.length || 0), 0) || 0;
    const gamesRecs = gameLists?.filter((list: any) => list.Visibility === true)?.reduce((total: number, list: any) => total + (list?.recommended_games?.length || 0), 0) || 0;
    const guidesRecs = allGuides?.filter((guide: any) => guide.Visibility === true)?.length || 0;
    const appsRecs = appLists?.filter((list: any) => list.Visibility === true)?.reduce((total: number, list: any) => total + (list?.recommended_apps?.length || 0), 0) || 0;
    const productsRecs = productLists?.filter((list: any) => list.Visibility === true)?.reduce((total: number, list: any) => total + (list?.recommended_products?.length || 0), 0) || 0;
    const peopleRecs = personLists?.filter((list: any) => list.Visibility === true)?.reduce((total: number, list: any) => total + (list?.recommended_people?.length || 0), 0) || 0;
    return placesRecs + moviesRecs + booksRecs + gamesRecs + guidesRecs + appsRecs + productsRecs + peopleRecs;
  }, [listNames, movieLists, bookLists, gameLists, allGuides, appLists, productLists, personLists]);

  const recentViewsCard = useMemo(
    () => getHomeAnalyticsCard(analyticsState, analyticsData, {
      label: t("dashboard.home.analytics.viewsLast90Days"),
      loading: t("dashboard.home.analytics.loading"),
      unavailable: t("dashboard.home.analytics.unavailable"),
    }),
    [analyticsState, analyticsData, t],
  );

  // Update setup store when status changes
  useEffect(() => {
    // Update store whenever completion flags change
    // Only update if we have data loaded (not during initial loading)
    if (!loading && canonicalAccount.data) {
      setSetupStatus(isProfileComplete, isRecommendationsComplete, canonicalAccount.data.id, sessionGeneration);
    }
  }, [loading, isProfileComplete, isRecommendationsComplete, canonicalAccount.data, setSetupStatus, sessionGeneration]);

  // Clear walkthrough session storage when setup is complete
  // This prevents the walkthrough from auto-starting when users add places after completing setup
  useEffect(() => {
    if (isAllSetupComplete) {
      // Both profile and recommendations setup are complete
      // Clear any lingering walkthrough state to prevent auto-start
      sessionStorage.removeItem('recommendationStep');
      sessionStorage.removeItem('recommendationCompletedSteps');
      sessionStorage.removeItem('profileStep');  // Also clear profile walkthrough
      sessionStorage.removeItem('profileCompletedSteps');

      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Setup complete - cleared walkthrough session storage');
      }
    }
  }, [isAllSetupComplete]);


  // Filter guides based on search query
  // Filter guides based on search query
  const filteredGuides = useMemo(() => {
    if (!searchQuery.trim()) return allGuides;
    const query = searchQuery.toLowerCase();
    return allGuides.filter((guide: Guide) =>
      guide?.Title?.toLowerCase().includes(query)
    );
  }, [allGuides, searchQuery]);

  // Filter places based on search query
  const filteredListNames = listNames?.filter((item: any) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item?.List_Name?.toLowerCase().includes(query) ||
      item?.recommended_places?.some((place: any) =>
        place?.Place_Details?.Place_Name?.toLowerCase().includes(query) ||
        place?.Place_Details?.Title?.toLowerCase().includes(query) ||
        place?.Place_Details?.Place_Address?.toLowerCase().includes(query)
      )
    );
  });

  // Filter movies lists based on search query
  const filteredMovieLists = useMemo(() => {
    if (!searchQuery.trim()) return movieLists;
    const query = searchQuery.toLowerCase();
    return movieLists.filter((item: any) =>
      item?.List_Name?.toLowerCase().includes(query) ||
      item?.list_description?.toLowerCase().includes(query) ||
      item?.recommended_movies?.some((movie: any) =>
        movie?.title?.toLowerCase().includes(query)
      )
    );
  }, [movieLists, searchQuery]);

  // Filter books lists based on search query
  const filteredBookLists = useMemo(() => {
    if (!searchQuery.trim()) return bookLists;
    const query = searchQuery.toLowerCase();
    return bookLists.filter((item: any) =>
      item?.List_Name?.toLowerCase().includes(query) ||
      item?.list_description?.toLowerCase().includes(query) ||
      item?.recommended_books?.some((book: any) =>
        book?.title?.toLowerCase().includes(query) ||
        book?.authors?.some((author: string) => author.toLowerCase().includes(query))
      )
    );
  }, [bookLists, searchQuery]);

  // Filter games lists based on search query
  const filteredGameLists = useMemo(() => {
    if (!searchQuery.trim()) return gameLists;
    const query = searchQuery.toLowerCase();
    return gameLists.filter((item: any) =>
      item?.List_Name?.toLowerCase().includes(query) ||
      item?.list_description?.toLowerCase().includes(query) ||
      item?.recommended_games?.some((game: any) =>
        game?.title?.toLowerCase().includes(query)
      )
    );
  }, [gameLists, searchQuery]);

  // Filter music playlists based on search query
  const filteredMusicPlaylists = useMemo(() => {
    if (!searchQuery.trim()) return musicPlaylists;
    const query = searchQuery.toLowerCase();
    return musicPlaylists.filter((item: any) =>
      item?.name?.toLowerCase().includes(query) ||
      item?.description?.toLowerCase().includes(query) ||
      item?.songs?.some((song: any) =>
        song?.title?.toLowerCase().includes(query) ||
        song?.artist?.toLowerCase().includes(query)
      )
    );
  }, [musicPlaylists, searchQuery]);

  // Filter app lists based on search query
  const filteredAppLists = useMemo(() => {
    if (!searchQuery.trim()) return appLists;
    const query = searchQuery.toLowerCase();
    return appLists.filter((item: any) =>
      item?.List_Name?.toLowerCase().includes(query) ||
      item?.list_description?.toLowerCase().includes(query) ||
      item?.recommended_apps?.some((app: any) =>
        app?.title?.toLowerCase().includes(query)
      )
    );
  }, [appLists, searchQuery]);

  // Filter product lists based on search query
  const filteredProductLists = useMemo(() => {
    if (!searchQuery.trim()) return productLists;
    const query = searchQuery.toLowerCase();
    return productLists.filter((item: any) =>
      item?.List_Name?.toLowerCase().includes(query) ||
      item?.list_description?.toLowerCase().includes(query) ||
      item?.recommended_products?.some((prod: any) =>
        prod?.title?.toLowerCase().includes(query)
      )
    );
  }, [productLists, searchQuery]);

  // Filter person lists based on search query
  const filteredPersonLists = useMemo(() => {
    if (!searchQuery.trim()) return personLists;
    const query = searchQuery.toLowerCase();
    return personLists.filter((item: any) =>
      item?.List_Name?.toLowerCase().includes(query) ||
      item?.list_description?.toLowerCase().includes(query) ||
      item?.recommended_people?.some((person: any) =>
        person?.name?.toLowerCase().includes(query)
      )
    );
  }, [personLists, searchQuery]);

  const navigate = useNavigate();

  const shareButtons = [
    {
      name: t("dashboard.home.shareButtons.instagram"),
      icon: <InstagramIcon color="white" />,
      url: `https://www.instagram.com/`,
    },
    {
      name: t("dashboard.home.shareButtons.twitter"),
      icon: <TwitterIcon color="white" />,
      url: `https://twitter.com/`,
    },
    {
      name: t("dashboard.home.shareButtons.whatsapp"),
      icon: <WhatsappIcon fill="white" />,
      url: `https://www.whatsapp.com/`,
    },
    {
      name: t("dashboard.home.mobile"),
      icon: (
        <ThemedIcon variant="primary">
          <MobileIcon />
        </ThemedIcon>
      ),
      url: `www.gmail.com`,
    },
  ];

  // Show loading state if any critical query is loading
  if (loading || dashboardStatusLoading || canonicalAccount.isPending) {
    if ((window as any).__dashboardLoaded) {
      return <HomeSkeleton />;
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-dashboard-bg">
        <EarthLoader context="general" size="default" />
      </div>
    );
  }

  if (error) {
    console.error('GraphQL Error:', error);
    return (
      <div className="flex bg-dashboard-bg items-center justify-center min-h-screen">
        <div className="text-dashboard text-center">
          <h2 className="text-lg font-poppins font-semibold mb-2">
            {t("dashboard.home.error.title")}
          </h2>
          <p className="text-dashboard-light text-sm mb-4">
            {error.message}
          </p>
          <Button
            btnText={t("dashboard.home.error.retry")}
            variant="primary"
            size="small"
            onClickHandler={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  if (!user) {
    console.log('No user found - redirecting to login');
    return (
      <div className="flex bg-dashboard-bg items-center justify-center min-h-screen">
        <div className="text-dashboard text-center">
          <h2 className="text-lg font-poppins font-semibold mb-2">
            {t("dashboard.home.loginRequired.title")}
          </h2>
          <p className="text-dashboard-light text-sm">
            {t("dashboard.home.loginRequired.message")}
          </p>
        </div>
      </div>
    );
  }

  const locations = listNames?.map(
    (list: {
      List_Name: string;
      List_Name_Details: { location: { latitude: string; longitude: string } };
    }) => ({
      name: list.List_Name,
      lat: list.List_Name_Details?.location?.latitude,
      lng: list.List_Name_Details?.location?.longitude,
    })
  );

  const arcsData = locations
    ?.map(
      (
        location: { lat: string; lng: string },
        index: number,
        array: { lat: string; lng: string }[]
      ) => {
        if (index === array.length - 1) return null;
        return {
          startLat: location.lat,
          startLng: location.lng,
          endLat: array[index + 1].lat,
          endLng: array[index + 1].lng,
          color: "white",
        };
      }
    )
    .filter(Boolean);



  const handleAddNewItem = () => {
    if (activeTab === "places") setShowCreatePlacesModal(true);
    else if (activeTab === "movies") setShowCreateMoviesModal(true);
    else if (activeTab === "books") setShowCreateBooksModal(true);
    else if (activeTab === "games") setShowCreateGamesModal(true);
    else if (activeTab === "music") setShowCreateMusicModal(true);
    else if (activeTab === "guides") setShowCreateGuidesModal(true);
    else if (activeTab === "apps") setShowCreateAppsModal(true);
    else if (activeTab === "products") setShowCreateProductsModal(true);
    else if (activeTab === "people") setShowCreatePeopleModal(true);
  };

  const handlePlacesSubmit = async (values: any): Promise<boolean> => {
    const toastId = toast.loading("Creating Places list and uploading location image...");
    try {
      const placeDetails = await axios.get(
        `${GOOGLE_PLACES_API_BASE_URL}/${
          values.placeId
        }?fields=id,displayName,primaryType,primaryTypeDisplayName,priceRange,rating,userRatingCount,location,photos&key=${
          import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        }`
      );
      const photoReferences = placeDetails.data.photos?.map(
        (photo: { name: string }) => photo.name.split(`${values.placeId}/`)[1]
      ) || [];

      let photoUrl: string | undefined;

      // Only upload to S3 if photos are available
      if (photoReferences.length > 0) {
        const googlePhotoResponse = await fetch(
          `${GOOGLE_PLACES_API_BASE_URL}/${values.placeId}/${
            photoReferences[0]
          }/media?maxWidthPx=400&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`,
          { redirect: "follow" }
        );
        
        if (googlePhotoResponse.ok) {
          const imageBlob = await googlePhotoResponse.blob();
          const username = sanitizeUsername(user?.username || "user");
          const randomFileName = generateRandomFileName(
            `${values.listName || "location"}.jpg`
          );
          const structuredPath = generateLocationThumbnailPath(username);

          const formData = new FormData();
          formData.append(
            "files",
            new File([imageBlob], randomFileName, { type: imageBlob.type })
          );
          formData.append("path", structuredPath);

          const token = useAuthStore.getState().token;
          const uploadResponse = await axios.post(
            `${import.meta.env.VITE_REST_API_URL}/upload`,
            formData,
            {
              headers: {
                "Content-Type": "multipart/form-data",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            }
          );

          const uploadedImage = uploadResponse.data?.[0];
          if (uploadedImage?.url) {
            photoUrl = uploadedImage.url;
          }
        }
      }

      // Calculate display_order (max + 1)
      const existingLists = listNames || [];
      let nextDisplayOrder = 1;
      if (existingLists.length > 0) {
        const orders = existingLists
          .map((l: any) => l.display_order)
          .filter((o: any) => typeof o === "number");
        if (orders.length > 0) {
          nextDisplayOrder = Math.max(...orders) + 1;
        } else {
          nextDisplayOrder = existingLists.length + 1;
        }
      }

      const response = await createRecommendationLink({
        variables: {
          data: {
            Instagram_Media_URL: values.recommendationSocialLink,
            List_Name: values.listName,
            Visibility: false,
            List_Name_Details: {
              note: values.note,
              thumbnail: photoUrl,
              location: placeDetails?.data?.location,
              place_id: values.placeId,
            },
            slug: toUrlSlug(values.listName),
            account: accountDocumentId,
            display_order: nextDisplayOrder,
            is_pinned: false,
          },
        },
      });

      if (response.data) {
        // Best-effort refresh — a refetch failure AFTER a successful create must
        // NOT report failure (that would re-open/retry and create a duplicate).
        try {
          const { data: refetched } = await refetchUserLists();
          const updatedCity = refetched?.recommendationLists?.find(
            (list: any) => list.List_Name === values.listName
          );
          if (updatedCity) {
            setSelectedCity(updatedCity);
          }
        } catch (refetchError) {
          console.warn("Failed to refetch lists after creating a place:", refetchError);
        }
        toast.success("Places list created successfully!", { id: toastId });
        setShowCreatePlacesModal(false);
        navigate('/recommendations', { state: { justCreatedList: true } });
        return true;
      }
      // No data returned — treat as failure so the modal stays open.
      toast.error("Failed to create places list", { id: toastId });
      return false;
    } catch (error) {
      console.error(error);
      toast.error("Failed to create places list", { id: toastId });
      return false;
    }
  };

  const getAddButtonStyles = (_cat?: any) => {
    return { backgroundColor: "#3B82F6", color: "white" };
  };


  return (
    <>
      <SEO
        title={t("dashboard.home.seo.title", { username: canonicalHandle })}
        description={t("dashboard.home.seo.description", { username: canonicalHandle })}
        keywords={[
          t("dashboard.home.seo.keywords.explorersDashboard"),
          t("dashboard.home.seo.keywords.qrCodeManagement"),
          t("dashboard.home.seo.keywords.userDashboard"),
          t("dashboard.home.seo.keywords.personalizedRecommendationsDashboard"),
          t("dashboard.home.seo.keywords.userProfileManagement"),
          t("dashboard.home.seo.keywords.explorersHome"),
          t("dashboard.home.seo.keywords.locationSharingDashboard"),
          t("dashboard.home.seo.keywords.curatedPlacesManagement"),
          t("dashboard.home.seo.keywords.travelGuideDashboard"),
          t("dashboard.home.seo.keywords.personalDashboard"),
          t("dashboard.home.seo.keywords.qrRecommendations"),
          t("dashboard.home.seo.keywords.recommendationManagement"),
          t("dashboard.home.seo.keywords.qrCodeSharingPlatform"),
        ]}
        canonical={createCanonicalUrl("/home")}
        type="website"
        noIndex={true}
      />

      <div className="bg-dashboard-bg">
        <div className="bg-dashboard-bg w-full h-full mx-auto max-w-3xl min-h-screen px-4 md:px-6 pt-2 md:pt-2 pb-4 md:pb-6">
          <div
            className={`flex flex-col gap-4 items-center justify-center ${!account?.Account_Name && "min-h-80"
              } w-full mt-4`}
          >

            <h1 className="text-xl md:text-3xl font-bold font-poppins text-dashboard leading-tight md:leading-normal py-2 px-4 text-center">
              {t("dashboard.home.welcomeBack")}, {canonicalHandle}
            </h1>
            {!account?.Account_Name && (
              <Button
                btnText={t("dashboard.home.setupProfile")}
                variant="primary"
                size="xsmall"
                onClickHandler={() => navigate("/profile")}
              />
            )}
          </div>

          {/* Enhanced Profile Card */}
          {account?.Account_Name && (
            <div className="w-full mb-6">
              {/* Profile Card with Border and Professional Layout - Matching Profile Page */}
              <div className="relative bg-dashboard-sidebar backdrop-blur-sm border border-dashboard rounded-3xl overflow-hidden shadow-dashboard-elevated">
                {/* Profile Banner - Interactive Globe with Overlapping Profile Picture */}
                <div
                  className="relative flex flex-col justify-center items-center md:h-48 h-32 w-full p-3 sm:p-4 overflow-hidden"
                >
                  {/* Interactive Map - Absolute positioned to fill container */}
                  <div className="absolute inset-0 z-0 pointer-events-auto overflow-hidden">
                    <InteractiveMap locations={allUserLocations} defaultMapTypeId="satellite" />
                  </div>

                  {/* Gradient Overlay - Matching Profile Page */}
                  <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-black/5 to-black/20 z-0 rounded-t-3xl pointer-events-none"></div>

                  {/* Share Profile Button overlaid on top-right corner of map */}
                  <div
                    title="Share Profile"
                    onClick={() => setShowProfileShareModal(true)}
                    className="absolute top-2 right-2 bg-[#3B82F6] hover:bg-[#2563EB] border border-white/10 rounded-full px-3 py-1.5 flex items-center gap-1.5 cursor-pointer z-10 transition-all shadow-md"
                  >
                    <span className="text-[10px] font-bold !text-white uppercase tracking-wider font-poppins">Share Profile</span>
                    <ShareIcon color="white" size={10} />
                  </div>
                </div>

                {/* Profile Content */}
                <div className="relative px-4 pb-4 -mt-12 md:-mt-16 pointer-events-none">
                  {/* Profile Name */}
                  <div className="text-center mb-4 pt-14 md:pt-20 pointer-events-none">
                    <h2 className="inline-block text-lg md:text-xl font-bold font-poppins text-dashboard pointer-events-auto">
                      {account?.Account_Name}
                    </h2>
                  </div>

                  {/* Stats Badges Row */}
                  <div className="flex gap-2 sm:gap-3 justify-center px-2 sm:px-0 pointer-events-auto">
                    <div className="bg-dashboard-sidebar backdrop-blur-sm rounded-xl px-2 sm:px-3 py-2 border border-dashboard flex-1 min-w-0">
                      <div className="text-center">
                        <p className="text-base sm:text-lg md:text-xl font-bold text-dashboard">
                          {totalActiveListsCount}
                        </p>
                        <p className="text-dashboard-muted font-poppins text-xs sm:text-xs truncate">
                          Active Lists
                        </p>
                      </div>
                    </div>
                    <div className="bg-dashboard-sidebar backdrop-blur-sm rounded-xl px-2 sm:px-3 py-2 border border-dashboard flex-1 min-w-0">
                      <div className="text-center">
                        <p className="text-base sm:text-lg md:text-xl font-bold text-dashboard">
                          {totalRecommendationsCount}
                        </p>
                        <p className="text-dashboard-muted font-poppins text-xs sm:text-xs truncate">
                          Recommendations
                        </p>
                      </div>
                    </div>
                    <div className="bg-dashboard-sidebar backdrop-blur-sm rounded-xl px-2 sm:px-3 py-2 border border-dashboard flex-1 min-w-0">
                      <div className="text-center">
                        <p
                          role="status"
                          aria-label={t("dashboard.home.analytics.ariaLabel", recentViewsCard)}
                          className="text-base sm:text-lg md:text-xl font-bold text-dashboard"
                        >
                          {recentViewsCard.value}
                        </p>
                        <p className="text-dashboard-muted font-poppins text-xs sm:text-xs truncate">
                          {recentViewsCard.label}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <ShareModal
                shareButtons={shareButtons}
                isOpen={showProfileShareModal}
                onClose={() => setShowProfileShareModal(false)}
                url={`${url}/${canonicalHandle}`}
                utmParams={profileUtmParams}
                backgroundImage={account?.bg_picture?.url || IMAGE_CONFIG.defaultImages.background}
              />

              <ShareModal
                shareButtons={shareButtons}
                isOpen={showRecommendationsShareModal}
                onClose={() => setShowRecommendationsShareModal(false)}
                url={`${url}/${canonicalHandle}/places`}
                utmParams={recommendationUtmParams}
                backgroundImage={account?.bg_picture?.url || IMAGE_CONFIG.defaultImages.background}
              />
            </div>
          )}

          {/* Public Profile Setup Accordion */}
          {!isProfileComplete && <ProfileSetupAccordion account={account} />}

          <div
            className="w-full md:pb-6"
            onTouchStart={handleTabTouchStart}
            onTouchEnd={handleTabTouchEnd}
          >
                {/* Category Tabs Selector */}
                <div ref={tabBarRef} className="home-tab-container bg-[var(--dash-tab-bg)] rounded-[28px] p-[3px] flex gap-1 mb-4 overflow-x-auto scrollbar-hide">
                  {(
                    [
                      { id: "places", label: "Places", icon: "📍" },
                      { id: "movies", label: "Movies", icon: "🎬" },
                      { id: "books", label: "Books", icon: "📚" },
                      { id: "games", label: "Games", icon: "🎮" },
                      { id: "music", label: "Music", icon: "🎵" },
                      { id: "guides", label: "Guides", icon: "📖" },
                      { id: "apps", label: "Apps & Tools", icon: "🛠️" },
                      { id: "products", label: "Products", icon: "🛍️" },
                      { id: "people", label: "Persons", icon: "👥" },
                    ] as const
                  ).map((cat) => {
                    const isActive = activeTab === cat.id;
                    return (
                      <button
                        key={cat.id}
                        data-active={isActive}
                        onClick={() => setActiveTab(cat.id)}
                        className={`flex-1 min-w-max bg-transparent border-none rounded-[24px] py-1.5 px-3 text-xs font-semibold font-poppins cursor-pointer whitespace-nowrap transition-all duration-200 ${
                          isActive
                            ? "font-bold"
                            : "text-dashboard-muted hover:text-dashboard"
                        }`}
                        style={isActive ? { backgroundColor: 'var(--dash-accent)', color: '#ffffff' } : {}}
                      >
                        {cat.icon} {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Search bar + Add button + Share Button Row */}
                <div className="flex flex-row items-center gap-1.5 mb-4 px-2 sm:px-0 w-full">
                  <div className="flex-1 flex items-center gap-2 bg-[var(--dash-search-bg)] border border-dashboard rounded-xl px-2 sm:px-3 py-2 h-10 min-w-0">
                    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="flex-shrink-0 text-dashboard-muted">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input
                      type="text"
                      placeholder={`Search ${
                        activeTab === "places"
                          ? "places"
                          : activeTab === "apps"
                          ? "apps & tools"
                          : activeTab === "people"
                          ? "persons"
                          : activeTab
                      }, lists…`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-transparent text-dashboard text-[11px] sm:text-xs font-poppins outline-none border-none p-0 min-w-0"
                    />
                  </div>
                  <button
                    onClick={handleAddNewItem}
                    style={getAddButtonStyles(activeTab)}
                    className="flex-shrink-0 flex items-center justify-center gap-1 h-10 px-3 sm:px-4 rounded-xl text-[11px] sm:text-xs font-bold font-poppins transition-all duration-200 hover:brightness-110 whitespace-nowrap"
                  >
                    <span>+</span> Add {
                      activeTab === "apps"
                        ? "Apps"
                        : activeTab === "products"
                        ? "Products"
                        : activeTab === "people"
                        ? "Persons"
                        : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)
                    }
                  </button>
                  {(activeTab !== "music" || tunesDashboard.dashboard?.publication.mode === "public") && <button
                    onClick={() => setShowCategoryShareModal(true)}
                    title="Share recommendations link"
                    className="w-10 h-10 rounded-xl bg-[var(--dash-search-bg)] border border-dashboard flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-dashboard-muted flex-shrink-0 text-dashboard-muted hover:text-dashboard"
                  >
                    <ShareIcon size={14} />
                  </button>}
                </div>

                {/* Recommendation List Items Container */}
                <div className="home-list-container pb-24 md:pb-0">
                  {/* Category Lists Rendering */}
                  {activeTab === "places" && (
                    <>
                      {listNames?.length === 0 ? (
                        <CategoryEmptyState
                          category="places"
                          onAddClick={handleAddNewItem}
                        />
                      ) : filteredListNames?.length > 0 ? (
                        <div className="space-y-3 pb-20">
                          {filteredListNames.map((item: any, index: number) => {
                            const isPub = item.Visibility;
                            const statusColor = isPub ? "var(--status-pub)" : "var(--status-draft)";
                            const poster = resolveCoverUrl(item.List_Name_Details?.thumbnail, "place");
                            return (
                              <div
                                key={item.documentId || index}
                                onClick={() => {
                                  setSelectedCity({
                                    documentId: item.documentId,
                                    List_Name: item.List_Name,
                                    Visibility: item.Visibility,
                                    List_Name_Details: item.List_Name_Details,
                                    recommended_places: item.recommended_places,
                                  });
                                  navigate('/recommendations');
                                }}
                                className="group relative bg-dashboard-sidebar border border-dashboard rounded-2xl p-4 hover:border-dashboard-accent/50 transition-all duration-300 hover:shadow-dashboard-elevated hover:shadow-dashboard-accent/10 hover:scale-[1.02] cursor-pointer flex items-center gap-4"
                              >
                                <div className="flex-shrink-0">
                                  <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-2xl bg-dashboard-muted" style={{ border: `3px solid ${statusColor}` }}>
                                    {poster ? (
                                      <ImageWithFallback src={poster} alt={item.List_Name} className="w-full h-full object-cover" />
                                    ) : (
                                      "📍"
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-bold text-dashboard truncate mb-1">{item.List_Name}</h4>
                                  <p className="text-xs text-dashboard-muted truncate">
                                    {item.recommended_places?.length || 0} places · <span style={{ color: statusColor }}>{isPub ? "Published" : "Draft"}</span>
                                  </p>
                                </div>
                                <div className="flex-shrink-0">
                                  {isPub ? (
                                    <Button
                                      startIcon={<ShareIcon color="white" />}
                                      size="xsmall"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowRecommendationShareModals((prev) => ({
                                          ...prev,
                                          [item.documentId]: true,
                                        }));
                                      }}
                                      className="opacity-100 p-0 bg-transparent border-0 hover:bg-transparent"
                                    />
                                  ) : (
                                    <span className="font-poppins text-[hsl(var(--blue-cta))] text-xs bg-[hsl(var(--blue-cta))]/10 border border-[hsl(var(--blue-cta))]/30 px-3 py-2 rounded-full">
                                      {t("dashboard.home.draft")}
                                    </span>
                                  )}
                                </div>
                                <ShareModal
                                  shareButtons={shareButtons}
                                  isOpen={!!showRecommendationShareModals[item.documentId]}
                                  onClose={() =>
                                    setShowRecommendationShareModals((prev) => ({
                                      ...prev,
                                      [item.documentId]: false,
                                    }))
                                  }
                                  url={`${url}/${canonicalHandle}/places/${toUrlSlug(item.List_Name)}`}
                                  utmParams={recommendationUtmParams}
                                  backgroundImage={poster || account?.bg_picture?.url || IMAGE_CONFIG.defaultImages.background}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 pb-20">
                          <svg className="w-16 h-16 mx-auto mb-4 text-dashboard-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <h3 className="text-lg font-semibold text-dashboard mb-1">No matches found</h3>
                          <p className="text-xs text-dashboard-muted">Try searching with a different name</p>
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === "movies" && (
                    <>
                      {movieLists.length === 0 ? (
                        <CategoryEmptyState
                          category="movies"
                          onAddClick={handleAddNewItem}
                        />
                      ) : filteredMovieLists.length > 0 ? (
                        <div className="space-y-3 pb-20">
                          {filteredMovieLists.map((item: any, index: number) => {
                            const isPub = item.Visibility;
                            const statusColor = isPub ? "var(--status-pub)" : "var(--status-draft)";
                            const firstMoviePoster = item.recommended_movies?.[0]?.poster_path;
                            const poster = resolveCoverUrl(firstMoviePoster || item.cover_image?.url, "movie");
                            return (
                              <div
                                key={item.documentId || index}
                                onClick={() => navigate(`/recommendations/movies/${item.documentId}`)}
                                className="group relative bg-dashboard-sidebar border border-dashboard rounded-2xl p-4 hover:border-dashboard-accent/50 transition-all duration-300 hover:shadow-dashboard-elevated hover:shadow-dashboard-accent/10 hover:scale-[1.02] cursor-pointer flex items-center gap-4"
                              >
                                <div className="flex-shrink-0">
                                  <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-2xl bg-dashboard-muted" style={{ border: `3px solid ${statusColor}` }}>
                                    {poster ? (
                                      <ImageWithFallback src={poster} alt={item.List_Name} className="w-full h-full object-cover" />
                                    ) : (
                                      "🎬"
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-bold text-dashboard truncate mb-1">{item.List_Name}</h4>
                                  <p className="text-xs text-dashboard-muted truncate">
                                    {item.recommended_movies?.length || 0} movies · <span style={{ color: statusColor }}>{isPub ? "Published" : "Draft"}</span>
                                  </p>
                                </div>
                                <div className="flex-shrink-0">
                                  {!isPub && (
                                    <span className="font-poppins text-[hsl(var(--blue-cta))] text-xs bg-[hsl(var(--blue-cta))]/10 border border-[hsl(var(--blue-cta))]/30 px-3 py-2 rounded-full">
                                      {t("dashboard.home.draft")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 pb-20">
                          <svg className="w-16 h-16 mx-auto mb-4 text-dashboard-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <h3 className="text-lg font-semibold text-dashboard mb-1">No matches found</h3>
                          <p className="text-xs text-dashboard-muted">Try searching with a different name</p>
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === "books" && (
                    <>
                      {bookLists.length === 0 ? (
                        <CategoryEmptyState
                          category="books"
                          onAddClick={handleAddNewItem}
                        />
                      ) : filteredBookLists.length > 0 ? (
                        <div className="space-y-3 pb-20">
                          {filteredBookLists.map((item: any, index: number) => {
                            const isPub = item.visibility;
                            const statusColor = isPub ? "var(--status-pub)" : "var(--status-draft)";
                            const firstBookCover = item.recommended_books?.[0]?.cover_url;
                            const poster = resolveCoverUrl(firstBookCover || item.cover_image?.url, "book");
                            return (
                              <div
                                key={item.documentId || index}
                                onClick={() => navigate(`/recommendations/books/${item.documentId}`)}
                                className="group relative bg-dashboard-sidebar border border-dashboard rounded-2xl p-4 hover:border-dashboard-accent/50 transition-all duration-300 hover:shadow-dashboard-elevated hover:shadow-dashboard-accent/10 hover:scale-[1.02] cursor-pointer flex items-center gap-4"
                              >
                                <div className="flex-shrink-0">
                                  <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-2xl bg-dashboard-muted" style={{ border: `3px solid ${statusColor}` }}>
                                    {poster ? (
                                      <ImageWithFallback src={poster} alt={item.List_Name} className="w-full h-full object-cover" />
                                    ) : (
                                      "📚"
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-bold text-dashboard truncate mb-1">{item.List_Name}</h4>
                                  <p className="text-xs text-dashboard-muted truncate">
                                    {item.recommended_books?.length || 0} books · <span style={{ color: statusColor }}>{isPub ? "Published" : "Draft"}</span>
                                  </p>
                                </div>
                                <div className="flex-shrink-0">
                                  {!isPub && (
                                    <span className="font-poppins text-[hsl(var(--blue-cta))] text-xs bg-[hsl(var(--blue-cta))]/10 border border-[hsl(var(--blue-cta))]/30 px-3 py-2 rounded-full">
                                      {t("dashboard.home.draft")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 pb-20">
                          <svg className="w-16 h-16 mx-auto mb-4 text-dashboard-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <h3 className="text-lg font-semibold text-dashboard mb-1">No matches found</h3>
                          <p className="text-xs text-dashboard-muted">Try searching with a different name</p>
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === "games" && (
                    <>
                      {gameLists.length === 0 ? (
                        <CategoryEmptyState
                          category="games"
                          onAddClick={handleAddNewItem}
                        />
                      ) : filteredGameLists.length > 0 ? (
                        <div className="space-y-3 pb-20">
                          {filteredGameLists.map((item: any, index: number) => {
                            const isPub = item.Visibility;
                            const statusColor = isPub ? "var(--status-pub)" : "var(--status-draft)";
                            const firstGameCover = item.recommended_games?.[0]?.cover_url;
                            const poster = resolveCoverUrl(firstGameCover || item.cover_image?.url, "game");
                            return (
                              <div
                                key={item.documentId || index}
                                onClick={() => navigate(`/recommendations/games/${item.documentId}`)}
                                className="group relative bg-dashboard-sidebar border border-dashboard rounded-2xl p-4 hover:border-dashboard-accent/50 transition-all duration-300 hover:shadow-dashboard-elevated hover:shadow-dashboard-accent/10 hover:scale-[1.02] cursor-pointer flex items-center gap-4"
                              >
                                <div className="flex-shrink-0">
                                  <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-2xl bg-dashboard-muted" style={{ border: `3px solid ${statusColor}` }}>
                                    {poster ? (
                                      <ImageWithFallback src={poster} alt={item.List_Name} className="w-full h-full object-cover" />
                                    ) : (
                                      "🎮"
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-bold text-dashboard truncate mb-1">{item.List_Name}</h4>
                                  <p className="text-xs text-dashboard-muted truncate">
                                    {item.recommended_games?.length || 0} games · <span style={{ color: statusColor }}>{isPub ? "Published" : "Draft"}</span>
                                  </p>
                                </div>
                                <div className="flex-shrink-0">
                                  {!isPub && (
                                    <span className="font-poppins text-[hsl(var(--blue-cta))] text-xs bg-[hsl(var(--blue-cta))]/10 border border-[hsl(var(--blue-cta))]/30 px-3 py-2 rounded-full">
                                      {t("dashboard.home.draft")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 pb-20">
                          <svg className="w-16 h-16 mx-auto mb-4 text-dashboard-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <h3 className="text-lg font-semibold text-dashboard mb-1">No matches found</h3>
                          <p className="text-xs text-dashboard-muted">Try searching with a different name</p>
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === "music" && (
                    <>
                      {musicPlaylists.length === 0 ? (
                        <CategoryEmptyState
                          category="music"
                          onAddClick={handleAddNewItem}
                        />
                      ) : filteredMusicPlaylists.length > 0 ? (
                        <div className="space-y-3 pb-20">
                          {filteredMusicPlaylists.map((item: any, index: number) => {
                            const isPub = item.isVisibleToGuests;
                            const statusColor = isPub ? "var(--status-pub)" : "var(--status-draft)";
                            const poster = resolveCoverUrl(item.songs?.[0]?.thumbnailUrl, "music");
                            return (
                              <div
                                key={item.id || index}
                                onClick={() => navigate("/music")}
                                className="group relative bg-dashboard-sidebar border border-dashboard rounded-2xl p-4 hover:border-dashboard-accent/50 transition-all duration-300 hover:shadow-dashboard-elevated hover:shadow-dashboard-accent/10 hover:scale-[1.02] cursor-pointer flex items-center gap-4"
                              >
                                <div className="flex-shrink-0">
                                  <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-2xl bg-dashboard-muted" style={{ border: `3px solid ${statusColor}` }}>
                                    {poster ? (
                                      <ImageWithFallback src={poster} alt={item.name} className="w-full h-full object-cover" />
                                    ) : (
                                      "🎵"
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-bold text-dashboard truncate mb-1">{item.name}</h4>
                                  <p className="text-xs text-dashboard-muted truncate">
                                    {item.songs?.length || 0} tracks · <span style={{ color: statusColor }}>{isPub ? "Visible" : "Hidden"}</span>
                                  </p>
                                </div>
                                <div className="flex-shrink-0">
                                  {!isPub && (
                                    <span className="font-poppins text-[hsl(var(--blue-cta))] text-xs bg-[hsl(var(--blue-cta))]/10 border border-[hsl(var(--blue-cta))]/30 px-3 py-2 rounded-full">
                                      Hidden
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 pb-20">
                          <svg className="w-16 h-16 mx-auto mb-4 text-dashboard-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <h3 className="text-lg font-semibold text-dashboard mb-1">No matches found</h3>
                          <p className="text-xs text-dashboard-muted">Try searching with a different name</p>
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === "guides" && (
                    <>
                      {allGuides.length === 0 ? (
                        <CategoryEmptyState
                          category="guides"
                          onAddClick={handleAddNewItem}
                        />
                      ) : filteredGuides.length > 0 ? (
                        <div className="space-y-3 pb-20">
                          {filteredGuides.map((guide: Guide, index: number) => {
                            const isPub = guide.Visibility;
                            const statusColor = isPub ? "var(--status-pub)" : "var(--status-draft)";
                            const poster = resolveCoverUrl(guide?.Guide_Media?.[0]?.url, "guide");
                            return (
                              <div
                                key={guide.documentId || index}
                                onClick={() => navigate(`/guides/${guide.documentId}`)}
                                className="group relative bg-dashboard-sidebar border border-dashboard rounded-2xl p-4 hover:border-dashboard-accent/50 transition-all duration-300 hover:shadow-dashboard-elevated hover:shadow-dashboard-accent/10 hover:scale-[1.02] cursor-pointer flex items-center gap-4"
                              >
                                <div className="flex-shrink-0">
                                  <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-2xl bg-dashboard-muted" style={{ border: `3px solid ${statusColor}` }}>
                                    {poster ? (
                                      <ImageWithFallback src={poster} alt={guide.Title} className="w-full h-full object-cover" />
                                    ) : (
                                      "📖"
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-base font-bold text-dashboard truncate">{guide.Title}</h4>
                                    {guide.Number_Of_Days && (
                                      <span className="bg-dashboard-muted text-dashboard-muted text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 font-poppins shrink-0">
                                        {guide.Number_Of_Days} {guide.Number_Of_Days === 1 ? "Day" : "Days"}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-dashboard-muted truncate">
                                    {guide.Guide_Type || "Itinerary"} · <span style={{ color: statusColor }}>{isPub ? "Published" : "Draft"}</span>
                                  </p>
                                </div>
                                <div className="flex-shrink-0">
                                  {isPub ? (
                                    <Button
                                      startIcon={<ShareIcon color="white" />}
                                      size="xsmall"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowGuideShareModals((prev) => ({
                                          ...prev,
                                          [guide.documentId]: true,
                                        }));
                                      }}
                                      className="opacity-100 p-0 bg-transparent border-0 hover:bg-transparent"
                                    />
                                  ) : (
                                    <span className="font-poppins text-[hsl(var(--blue-cta))] text-xs bg-[hsl(var(--blue-cta))]/10 border border-[hsl(var(--blue-cta))]/30 px-3 py-2 rounded-full">
                                      {t("dashboard.home.draft")}
                                    </span>
                                  )}
                                </div>
                                <ShareModal
                                  shareButtons={shareButtons}
                                  isOpen={!!showGuideShareModals[guide.documentId]}
                                  onClose={() =>
                                    setShowGuideShareModals((prev) => ({
                                      ...prev,
                                      [guide.documentId]: false,
                                    }))
                                  }
                                  url={`${url}/${canonicalHandle}/guides`}
                                  utmParams={guidesUtmParams}
                                  backgroundImage={poster || account?.bg_picture?.url || IMAGE_CONFIG.defaultImages.background}
                                  hideQRTab={true}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 pb-20">
                          <svg className="w-16 h-16 mx-auto mb-4 text-dashboard-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <h3 className="text-lg font-semibold text-dashboard mb-1">No matches found</h3>
                          <p className="text-xs text-dashboard-muted">Try searching with a different name</p>
                        </div>
                      )}
                    </>
                  )}
                  {activeTab === "apps" && (
                    <>
                      {appLists.length === 0 ? (
                        <CategoryEmptyState
                          category="apps"
                          onAddClick={handleAddNewItem}
                        />
                      ) : filteredAppLists.length > 0 ? (
                        <div className="space-y-3 pb-20">
                          {filteredAppLists.map((item: any, index: number) => {
                            const isPub = item.Visibility;
                            const statusColor = isPub ? "var(--status-pub)" : "var(--status-draft)";
                            const firstAppLogo = item.recommended_apps?.[0]?.logo_url;
                            const poster = resolveCoverUrl(firstAppLogo || item.cover_image?.url);
                            return (
                              <div
                                key={item.documentId || index}
                                onClick={() => navigate(`/recommendations/apps/${item.documentId}`)}
                                className="group relative bg-dashboard-sidebar border border-dashboard rounded-2xl p-4 hover:border-dashboard-accent/50 transition-all duration-300 hover:shadow-dashboard-elevated hover:shadow-dashboard-accent/10 hover:scale-[1.02] cursor-pointer flex items-center gap-4"
                              >
                                <div className="flex-shrink-0">
                                  <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-2xl bg-dashboard-muted" style={{ border: `3px solid ${statusColor}` }}>
                                    {poster ? (
                                      <ImageWithFallback src={poster} alt={item.List_Name} className="w-full h-full object-cover" />
                                    ) : (
                                      "🛠️"
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-bold text-dashboard truncate mb-1">{item.List_Name}</h4>
                                  <p className="text-xs text-dashboard-muted truncate">
                                    {item.recommended_apps?.length || 0} apps & tools · <span style={{ color: statusColor }}>{isPub ? "Published" : "Draft"}</span>
                                  </p>
                                </div>
                                <div className="flex-shrink-0">
                                  {!isPub && (
                                    <span className="font-poppins text-[hsl(var(--blue-cta))] text-xs bg-[hsl(var(--blue-cta))]/10 border border-[hsl(var(--blue-cta))]/30 px-3 py-2 rounded-full">
                                      {t("dashboard.home.draft")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 pb-20">
                          <svg className="w-16 h-16 mx-auto mb-4 text-dashboard-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <h3 className="text-lg font-semibold text-dashboard mb-1">No matches found</h3>
                          <p className="text-xs text-dashboard-muted">Try searching with a different name</p>
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === "products" && (
                    <>
                      {productLists.length === 0 ? (
                        <CategoryEmptyState
                          category="products"
                          onAddClick={handleAddNewItem}
                        />
                      ) : filteredProductLists.length > 0 ? (
                        <div className="space-y-3 pb-20">
                          {filteredProductLists.map((item: any, index: number) => {
                            const isPub = item.Visibility;
                            const statusColor = isPub ? "var(--status-pub)" : "var(--status-draft)";
                            const firstProductImage = item.recommended_products?.[0]?.images?.[0] || item.recommended_products?.[0]?.logo_url;
                            const poster = resolveCoverUrl(firstProductImage || item.cover_image?.url);
                            return (
                              <div
                                key={item.documentId || index}
                                onClick={() => navigate(`/recommendations/products/${item.documentId}`)}
                                className="group relative bg-dashboard-sidebar border border-dashboard rounded-2xl p-4 hover:border-dashboard-accent/50 transition-all duration-300 hover:shadow-dashboard-elevated hover:shadow-dashboard-accent/10 hover:scale-[1.02] cursor-pointer flex items-center gap-4"
                              >
                                <div className="flex-shrink-0">
                                  <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-2xl bg-dashboard-muted" style={{ border: `3px solid ${statusColor}` }}>
                                    {poster ? (
                                      <ImageWithFallback src={poster} alt={item.List_Name} className="w-full h-full object-cover" />
                                    ) : (
                                      "🛍️"
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-bold text-dashboard truncate mb-1">{item.List_Name}</h4>
                                  <p className="text-xs text-dashboard-muted truncate">
                                    {item.recommended_products?.length || 0} products · <span style={{ color: statusColor }}>{isPub ? "Published" : "Draft"}</span>
                                  </p>
                                </div>
                                <div className="flex-shrink-0">
                                  {!isPub && (
                                    <span className="font-poppins text-[hsl(var(--blue-cta))] text-xs bg-[hsl(var(--blue-cta))]/10 border border-[hsl(var(--blue-cta))]/30 px-3 py-2 rounded-full">
                                      {t("dashboard.home.draft")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 pb-20">
                          <svg className="w-16 h-16 mx-auto mb-4 text-dashboard-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <h3 className="text-lg font-semibold text-dashboard mb-1">No matches found</h3>
                          <p className="text-xs text-dashboard-muted">Try searching with a different name</p>
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === "people" && (
                    <>
                      {personLists.length === 0 ? (
                        <CategoryEmptyState
                          category="people"
                          onAddClick={handleAddNewItem}
                        />
                      ) : filteredPersonLists.length > 0 ? (
                        <div className="space-y-3 pb-20">
                          {filteredPersonLists.map((item: any, index: number) => {
                            const isPub = item.Visibility;
                            const statusColor = isPub ? "var(--status-pub)" : "var(--status-draft)";
                            const firstPersonAvatar = item.recommended_people?.[0]?.avatar_path;
                            const poster = resolveCoverUrl(firstPersonAvatar || item.cover_image?.url);
                            return (
                              <div
                                key={item.documentId || index}
                                onClick={() => navigate(`/recommendations/people/${item.documentId}`)}
                                className="group relative bg-dashboard-sidebar border border-dashboard rounded-2xl p-4 hover:border-dashboard-accent/50 transition-all duration-300 hover:shadow-dashboard-elevated hover:shadow-dashboard-accent/10 hover:scale-[1.02] cursor-pointer flex items-center gap-4"
                              >
                                <div className="flex-shrink-0">
                                  <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-2xl bg-dashboard-muted" style={{ border: `3px solid ${statusColor}` }}>
                                    {poster ? (
                                      <ImageWithFallback src={poster} alt={item.List_Name} className="w-full h-full object-cover" />
                                    ) : (
                                      "👥"
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-bold text-dashboard truncate mb-1">{item.List_Name}</h4>
                                  <p className="text-xs text-dashboard-muted truncate">
                                    {item.recommended_people?.length || 0} persons · <span style={{ color: statusColor }}>{isPub ? "Published" : "Draft"}</span>
                                  </p>
                                </div>
                                <div className="flex-shrink-0">
                                  {!isPub && (
                                    <span className="font-poppins text-[hsl(var(--blue-cta))] text-xs bg-[hsl(var(--blue-cta))]/10 border border-[hsl(var(--blue-cta))]/30 px-3 py-2 rounded-full">
                                      {t("dashboard.home.draft")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 pb-20">
                          <svg className="w-16 h-16 mx-auto mb-4 text-dashboard-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <h3 className="text-lg font-semibold text-dashboard mb-1">No matches found</h3>
                          <p className="text-xs text-dashboard-muted">Try searching with a different name</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {listNames?.length > 3 && activeTab === "places" && <GlobeDemo arcsData={arcsData} />}
              </div>

              {/* Share Modals */}
              <ShareModal
                shareButtons={shareButtons}
                isOpen={showRecommendationsShareModal}
                onClose={() => setShowRecommendationsShareModal(false)}
                url={`${url}/${canonicalHandle}/places`}
                utmParams={recommendationUtmParams}
                backgroundImage={account?.bg_picture?.url || IMAGE_CONFIG.defaultImages.background}
              />

              <ShareModal
                shareButtons={shareButtons}
                isOpen={showGuidesShareModal}
                onClose={() => setShowGuidesShareModal(false)}
                url={`${url}/${canonicalHandle}/guides`}
                utmParams={guidesUtmParams}
                backgroundImage={account?.bg_picture?.url || IMAGE_CONFIG.defaultImages.background}
                hideQRTab={true}
              />

              <ShareModal
                shareButtons={shareButtons}
                isOpen={showCategoryShareModal}
                onClose={() => setShowCategoryShareModal(false)}
                url={activeTabShareUrl}
                utmParams={recommendationUtmParams}
                backgroundImage={account?.bg_picture?.url || IMAGE_CONFIG.defaultImages.background}
                hideQRTab={activeTab === "guides"}
              />
        </div>
      </div>

      {/* Inline Creation Modals */}
      {showCreatePlacesModal && (
        <AddLocationModal
          isOpen={showCreatePlacesModal}
          onClose={() => {
            setShowCreatePlacesModal(false);
            setPrefillTitle("");
          }}
          onSubmit={handlePlacesSubmit}
          existingPlaces={listNames || []}
          initialValues={prefillTitle ? { listName: prefillTitle } : {}}
        />
      )}

      {showCreateMoviesModal && accountDocumentId && (
        <CreateMovieListModal
          open={showCreateMoviesModal}
          onClose={() => {
            setShowCreateMoviesModal(false);
            setPrefillTitle("");
          }}
          accountDocumentId={accountDocumentId}
          currentListCount={movieLists.length}
          username={canonicalHandle}
          defaultListName={prefillTitle}
          onCreated={(newId) => {
            refetchMovies();
            setPrefillTitle("");
            if (newId) {
              navigate(`/recommendations/movies/${newId}`, { state: { justCreatedList: true } });
            } else {
              navigate(`/recommendations/movies`, { state: { justCreatedList: true } });
            }
          }}
        />
      )}

      {showCreateBooksModal && accountDocumentId && (
        <CreateBookListModal
          open={showCreateBooksModal}
          onClose={() => {
            setShowCreateBooksModal(false);
            setPrefillTitle("");
          }}
          accountDocumentId={accountDocumentId}
          currentListCount={bookLists.length}
          defaultListName={prefillTitle}
          onCreated={(newId) => {
            refetchBooks();
            setPrefillTitle("");
            if (newId) {
              navigate(`/recommendations/books/${newId}`, { state: { justCreatedList: true } });
            } else {
              navigate(`/recommendations/books`, { state: { justCreatedList: true } });
            }
          }}
          username={canonicalHandle}
        />
      )}

      {showCreateGamesModal && accountDocumentId && (
        <CreateGameListModal
          open={showCreateGamesModal}
          onClose={() => {
            setShowCreateGamesModal(false);
            setPrefillTitle("");
          }}
          accountDocumentId={accountDocumentId}
          currentListCount={gameLists.length}
          defaultListName={prefillTitle}
          onCreated={(newId) => {
            refetchGames();
            setPrefillTitle("");
            if (newId) {
              navigate(`/recommendations/games/${newId}`, { state: { justCreatedList: true } });
            } else {
              navigate(`/recommendations/games`, { state: { justCreatedList: true } });
            }
          }}
          username={canonicalHandle}
        />
      )}

      {showCreateMusicModal && (
        <CreatePlaylistModal
          open={showCreateMusicModal}
          onClose={() => {
            setShowCreateMusicModal(false);
            setPrefillTitle("");
          }}
          defaultListName={prefillTitle}
          onCreated={async () => {
            setPrefillTitle("");
            await queryClient.invalidateQueries({ queryKey: ["music-workspace"] });
            navigate("/music", { state: { justCreatedList: true } });
          }}
        />
      )}

      {showCreateGuidesModal && (
        <CreateGuideModal
          open={showCreateGuidesModal}
          onClose={() => {
            setShowCreateGuidesModal(false);
            setPrefillTitle("");
          }}
          defaultTitle={prefillTitle}
          onCreated={(newId) => {
            refetchGuides();
            setPrefillTitle("");
            if (newId) {
              navigate(`/guides/${newId}`, { state: { justCreatedGuide: true } });
            } else {
              navigate(`/guides`, { state: { justCreatedGuide: true } });
            }
          }}
        />
      )}

      {showCreateAppsModal && accountDocumentId && (
        <CreateAppListModal
          open={showCreateAppsModal}
          onClose={() => {
            setShowCreateAppsModal(false);
            setPrefillTitle("");
          }}
          accountDocumentId={accountDocumentId}
          currentListCount={appLists.length}
          defaultListName={prefillTitle}
          onCreated={(newId) => {
            refetchApps();
            setPrefillTitle("");
            if (newId) {
              navigate(`/recommendations/apps/${newId}`, { state: { justCreatedList: true } });
            } else {
              navigate(`/recommendations/apps`, { state: { justCreatedList: true } });
            }
          }}
          username={canonicalHandle}
        />
      )}

      {showCreateProductsModal && accountDocumentId && (
        <CreateProductListModal
          open={showCreateProductsModal}
          onClose={() => {
            setShowCreateProductsModal(false);
            setPrefillTitle("");
          }}
          accountDocumentId={accountDocumentId}
          currentListCount={productLists.length}
          defaultListName={prefillTitle}
          onCreated={(newId) => {
            refetchProducts();
            setPrefillTitle("");
            if (newId) {
              navigate(`/recommendations/products/${newId}`, { state: { justCreatedList: true } });
            } else {
              navigate(`/recommendations/products`, { state: { justCreatedList: true } });
            }
          }}
          username={canonicalHandle}
        />
      )}

      {showCreatePeopleModal && accountDocumentId && (
        <CreatePersonListModal
          open={showCreatePeopleModal}
          onClose={() => {
            setShowCreatePeopleModal(false);
            setPrefillTitle("");
          }}
          accountDocumentId={accountDocumentId}
          currentListCount={personLists.length}
          defaultListName={prefillTitle}
          onCreated={(newId) => {
            refetchPeople();
            setPrefillTitle("");
            if (newId) {
              navigate(`/recommendations/people/${newId}`, { state: { justCreatedList: true } });
            } else {
              navigate(`/recommendations/people`, { state: { justCreatedList: true } });
            }
          }}
          username={canonicalHandle}
        />
      )}
    </>
  );
});

// ─────────────────────────────────────────────────────────────
// Music Playlist Creation Modal Component
// ─────────────────────────────────────────────────────────────
const CreatePlaylistModal = ({
  open,
  onClose,
  onCreated,
  defaultListName,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (newId?: string) => void;
  defaultListName?: string;
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultListName || "");
    }
  }, [open, defaultListName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await musicWorkspaceClient.createPlaylist(
        name,
        description || null,
        `home-playlist-${crypto.randomUUID()}`,
      );
      toast.success("Playlist created");
      onCreated(res?.id?.toString());
      onClose();
    } catch {
      toast.error("Failed to create playlist");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="dashboard-theme fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4 md:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-dashboard-sidebar rounded-xl border border-dashboard-border p-6 md:p-8 w-full max-w-xl shadow-2xl"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white font-poppins">Create New Playlist</h2>
            <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors border-none cursor-pointer">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-white/70 mb-2 block font-poppins">
                Playlist Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter Playlist Name"
                className="w-full bg-dashboard-muted border border-dashboard-border rounded-lg px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-dashboard-accent transition-colors"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-white/70 mb-2 block font-poppins">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter a description for this playlist"
                rows={4}
                className="w-full bg-dashboard-muted border border-dashboard-border rounded-lg px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-dashboard-accent transition-colors resize-none font-poppins"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-dashboard-border">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-sm text-white font-medium transition-colors cursor-pointer border-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-sm text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer border-none"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Create Playlist
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Home;
