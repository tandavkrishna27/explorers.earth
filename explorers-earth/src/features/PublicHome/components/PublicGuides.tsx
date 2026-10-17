import { memo, useMemo, useState, useEffect, useRef, type CSSProperties } from "react";
import { usePublicCategoryThemeStyles } from "./PublicCategoryThemeContext";
import { useParams, useNavigate, useOutletContext, useLocation } from "react-router-dom";
import GuideCardSkeleton from "../../../components/ui/GuideCardSkeleton";
import HeroSkeleton from "../../../components/ui/HeroSkeleton";
import PublicGuideCard from "../../Guides/components/PublicGuideCard";
import type { Guide } from "../../Guides/types";
import { useTrackAnalytics } from "../../../services/analyticsService";
import SEO from "../../../components/SEO";
import { createCanonicalUrl } from "../../../utils/getCurrentDomain";
import { createWebPageGEOData } from "../../../utils/geoHelpers";
import { guideDescriptionText } from "../../../utils/guideDescriptionText";
import { publicGuideSlug } from "../../../utils/publicGuideSlug";
import { isDisplayableNumber, toDisplayNumber } from "../../../utils/rating";
import Button from "../../../components/ui/Button";
import SwitchButton from "../../../components/ui/SwitchButton";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { usePublicHeaderDescriptor } from "./PublicHeaderDescriptorContext";
import { isNonNullObject, PublicRouteErrorState, PublicRoutePartialNotice, settlePublicRouteRetries } from "./PublicRouteContentState";
import { usePublicProfileShell } from "../api/usePublicProfileShell";
import { usePublicRecommendationCategory } from "../api/usePublicRecommendationCategory";
import { PublicScrollContinuation } from "./PublicScrollContinuation";
import PublicBlockingOverlay from "./PublicBlockingOverlay";

interface FilterState {
  guideType: string | null;
  category: string | null;
  numberOfDays: number | null;
  bestTimeToVisit: string | null;
  budgetType: string | null;
}

type PublicGuideAccount = {
  documentId?: string;
  Account_Name?: string;
  public_guides?: string;
  profile_picture?: { url?: string } | null;
  bg_picture?: { url?: string } | null;
};

const isRenderableGuide = (value: unknown): value is Guide =>
  isNonNullObject(value) && typeof value.documentId === "string" && typeof value.Title === "string";

const PublicGuides = memo(() => {
  const categoryStyles = usePublicCategoryThemeStyles();
  const { username } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const outletContext = useOutletContext<{ isShellRevealed?: boolean; setIsPageLoaded?: (val: boolean) => void } | null>();
  const [filters, setFilters] = useState<FilterState>({
    guideType: null,
    category: null,
    numberOfDays: null,
    bestTimeToVisit: null,
    budgetType: null,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== "undefined"
      && (typeof window.matchMedia === "function"
        ? window.matchMedia("(max-width: 767px)").matches
        : window.innerWidth < 768)
  ));
  const filterOpenerRef = useRef<HTMLElement | null>(null);
  const [isMultiCityFilter, setIsMultiCityFilter] = useState<boolean>(false);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeHeroIndex, setActiveHeroIndex] = useState<number>(0);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      const updateFromWidth = () => setIsMobileViewport(window.innerWidth < 768);
      window.addEventListener("resize", updateFromWidth);
      return () => window.removeEventListener("resize", updateFromWidth);
    }

    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const updateFromQuery = () => setIsMobileViewport(mobileQuery.matches);
    updateFromQuery();
    mobileQuery.addEventListener("change", updateFromQuery);
    return () => mobileQuery.removeEventListener("change", updateFromQuery);
  }, []);

  const { data: rawAccount, loading: accountLoading, error: accountError, refetch: refetchAccount } = usePublicProfileShell(username);
  const account = rawAccount as PublicGuideAccount | undefined;
  const accountDocumentId = typeof account?.documentId === "string" ? account.documentId : undefined;
  const query = usePublicRecommendationCategory(username, "guides", account?.public_guides === "Yes");
  const { data: guidesData, loading: guidesLoading, error: guidesError, refetch: refetchGuides } = query;
  const loading = Boolean(accountLoading || guidesLoading);
  const queryError = accountError || guidesError;
  const rawGuides = guidesData?.guides;
  const allGuides: Guide[] = (Array.isArray(rawGuides) ? rawGuides : []).filter(isRenderableGuide);
  const completeCollection = Array.isArray(rawGuides) && rawGuides.every(isRenderableGuide);
  const hasUsableData = queryError ? allGuides.length > 0 : completeCollection;

  const handleRetry = async () => {
    await settlePublicRouteRetries(refetchAccount, accountDocumentId ? refetchGuides : undefined);
  };
  usePublicHeaderDescriptor({
    navigationKey: location.key,
    title: `${account?.Account_Name || username}'s Guides`,
    text: "Check out these travel guides!",
    url: window.location.href,
    analyticsContext: "guides-header",
  });

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const analytics = useTrackAnalytics({
    accountId: account?.documentId || "",
    pageName: "public-guides",
    pageUsername: username,
    autoTrackView: true,
  });

  // Helper function to extract location names from Place_Details
  const extractLocationNames = (guide: Guide): string[] => {
    const locations: string[] = [];

    if (!guide.Place_Details) return locations;

    try {
      let placeDetails: any = guide.Place_Details;
      if (typeof guide.Place_Details === "string") {
        placeDetails = JSON.parse(guide.Place_Details);
      }

      // Check if it's multi-city format
      if (placeDetails.isMultiCity === true) {
        // Multi-city: extract all cities
        const departure = placeDetails.departure || placeDetails.from;
        if (departure?.Place_Name) {
          locations.push(departure.Place_Name);
        } else if (departure?.Place_Address) {
          locations.push(departure.Place_Address);
        }

        // Intermediate cities
        const intermediateCities = placeDetails.intermediateCities || [];
        intermediateCities.forEach((city: any) => {
          if (city.Place_Name) {
            locations.push(city.Place_Name);
          } else if (city.Place_Address) {
            locations.push(city.Place_Address);
          }
        });

        // Arrival city
        const arrival = placeDetails.arrival || placeDetails.to;
        if (arrival?.Place_Name) {
          locations.push(arrival.Place_Name);
        } else if (arrival?.Place_Address) {
          locations.push(arrival.Place_Address);
        }
      } else {
        // Single city format
        if (placeDetails.Place_Name) {
          locations.push(placeDetails.Place_Name);
        } else if (placeDetails.Place_Address) {
          locations.push(placeDetails.Place_Address);
        }
      }
    } catch (error) {
      // Silently handle parsing errors
    }

    return locations.filter(loc => loc && loc.trim() !== "");
  };

  // Extract unique filter values from guides
  const filterOptions = useMemo(() => {
    const guideTypes = new Set<string>();
    const categories = new Set<string>();
    const numberOfDays = new Set<number>();
    const months = new Set<string>();
    const budgetTypes = new Set<string>();
    const locations = new Set<string>();

    allGuides.forEach((guide) => {
      // Guide Type
      if (guide.Guide_Type) {
        guideTypes.add(guide.Guide_Type);
      }

      // Categories
      if (guide.Category) {
        let categoryArray: string[] = [];
        if (Array.isArray(guide.Category)) {
          categoryArray = guide.Category;
        } else if (typeof guide.Category === "string") {
          try {
            categoryArray = JSON.parse(guide.Category);
          } catch {
            categoryArray = [guide.Category];
          }
        }
        categoryArray.forEach((cat: string) => {
          if (cat && typeof cat === "string") {
            categories.add(cat.trim());
          }
        });
      }

      // Number of Days
      if (guide.Number_Of_Days !== null && guide.Number_Of_Days !== undefined) {
        numberOfDays.add(guide.Number_Of_Days);
      }

      // Best Time to Visit (months)
      if (guide.Best_Time_To_Visit) {
        let monthsArray: string[] = [];
        if (Array.isArray(guide.Best_Time_To_Visit)) {
          monthsArray = guide.Best_Time_To_Visit;
        } else if (typeof guide.Best_Time_To_Visit === "string") {
          try {
            monthsArray = JSON.parse(guide.Best_Time_To_Visit);
          } catch {
            monthsArray = [guide.Best_Time_To_Visit];
          }
        }
        monthsArray.forEach((month: string) => {
          if (month && typeof month === "string") {
            months.add(month.trim());
          }
        });
      }

      // Budget Type
      if (guide.Budget_Type) {
        budgetTypes.add(guide.Budget_Type);
      }

      // Locations - extract from Place_Details
      const guideLocations = extractLocationNames(guide);
      guideLocations.forEach((location: string) => {
        if (location && typeof location === "string") {
          locations.add(location.trim());
        }
      });
    });

    return {
      guideTypes: Array.from(guideTypes).sort(),
      categories: Array.from(categories).sort(),
      numberOfDays: Array.from(numberOfDays).sort((a, b) => a - b),
      months: Array.from(months).sort(),
      budgetTypes: Array.from(budgetTypes).sort(),
      locations: Array.from(locations).sort(),
    };
  }, [allGuides]);

  // Extract and sort pinned guides for slideshow
  const pinnedGuides = useMemo(() => {
    return allGuides
      .filter((guide) => guide.is_pinned === true)
      .sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999));
  }, [allGuides]);

  // Slideshow auto-rotation timer (6 seconds)
  useEffect(() => {
    if (pinnedGuides.length <= 1) return;
    const interval = setInterval(() => {
      setActiveHeroIndex((prev) => (prev + 1) % pinnedGuides.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [pinnedGuides.length]);

  // Guard activeHeroIndex range on slides update
  useEffect(() => {
    if (activeHeroIndex >= pinnedGuides.length) {
      setActiveHeroIndex(0);
    }
  }, [pinnedGuides.length, activeHeroIndex]);

  // Filter guides based on selected filters and text search query
  const guides = useMemo(() => {
    const filteredGuides = allGuides.filter((guide) => {
      // Text Search Query filter (matches title, description, location names, and tags)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const titleMatch = guide.Title?.toLowerCase().includes(query);
        const descriptionText = guideDescriptionText(guide.Description);
        const descMatch = descriptionText.toLowerCase().includes(query);
        const locations = extractLocationNames(guide);
        const locationMatch = locations.some((loc) =>
          loc.toLowerCase().includes(query)
        );
        const tagMatch = guide.Guide_Tags?.some((tag) =>
          tag.toLowerCase().includes(query)
        );

        if (!titleMatch && !descMatch && !locationMatch && !tagMatch) {
          return false;
        }
      }

      // Guide Type filter
      if (filters.guideType && guide.Guide_Type !== filters.guideType) {
        return false;
      }

      // Category filter
      if (filters.category) {
        let guideCategories: string[] = [];
        if (guide.Category) {
          if (Array.isArray(guide.Category)) {
            guideCategories = guide.Category;
          } else if (typeof guide.Category === "string") {
            try {
              guideCategories = JSON.parse(guide.Category);
            } catch {
              guideCategories = [guide.Category];
            }
          }
        }
        if (!guideCategories.some((cat: string) => cat?.trim() === filters.category)) {
          return false;
        }
      }

      // Number of Days filter
      if (filters.numberOfDays !== null && guide.Number_Of_Days !== filters.numberOfDays) {
        return false;
      }

      // Best Time to Visit filter
      if (filters.bestTimeToVisit) {
        let guideMonths: string[] = [];
        if (guide.Best_Time_To_Visit) {
          if (Array.isArray(guide.Best_Time_To_Visit)) {
            guideMonths = guide.Best_Time_To_Visit;
          } else if (typeof guide.Best_Time_To_Visit === "string") {
            try {
              guideMonths = JSON.parse(guide.Best_Time_To_Visit);
            } catch {
              guideMonths = [guide.Best_Time_To_Visit];
            }
          }
        }
        if (!guideMonths.some((month: string) => month?.trim() === filters.bestTimeToVisit)) {
          return false;
        }
      }

      // Budget Type filter
      if (filters.budgetType && guide.Budget_Type !== filters.budgetType) {
        return false;
      }

      // Multi-city filter: when toggle is ON, show only multi-city guides
      if (isMultiCityFilter && !guide.is_Multicity) {
        return false;
      }

      // Location tag filter
      if (selectedLocation) {
        const guideLocations = extractLocationNames(guide);
        const locationMatches = guideLocations.some(
          (loc: string) => loc?.trim() === selectedLocation
        );
        if (!locationMatches) {
          return false;
        }
      }

      return true;
    });

    return filteredGuides;
  }, [allGuides, filters, isMultiCityFilter, selectedLocation, searchQuery]);

  // Handle filter changes
  const handleFilterChange = (filterKey: keyof FilterState, value: string | number | null) => {
    setFilters((prev) => ({
      ...prev,
      [filterKey]: value,
    }));
  };

  // Clear all filters
  const handleClearFilters = () => {
    setFilters({
      guideType: null,
      category: null,
      numberOfDays: null,
      bestTimeToVisit: null,
      budgetType: null,
    });
    setIsMultiCityFilter(false);
    setSelectedLocation("");
    setSearchQuery("");
  };

  // Check if any filter is active
  const hasActiveFilters =
    Object.values(filters).some((value) => value !== null) ||
    isMultiCityFilter ||
    selectedLocation !== "" ||
    searchQuery !== "";

  // Helper function to get display label for budget type (convert enum to display format)
  const getBudgetTypeLabel = (value: string | null): string => {
    if (!value) return "";
    // Map enum values to display labels
    const budgetTypeMap: Record<string, string> = {
      "Budget": "Budget",
      "Mid_Range": "Mid-Range",
      "Luxury": "Luxury",
      "Backpacker": "Backpacker",
      "Ultra_Luxury": "Ultra-Luxury"
    };
    return budgetTypeMap[value] || value;
  };

  // Handle guide click - navigate to guide detail page
  const handleGuideClick = (guide: Guide) => {
    // Track guide card click for analytics
    analytics.trackClick('guide-card', {
      id: guide.documentId,
      title: guide.Title,
      guideType: guide.Guide_Type,
      category: Array.isArray(guide.Category) ? guide.Category[0] : guide.Category,
    });
    const slug = publicGuideSlug(guide);
    navigate(`/${username}/guides/${slug}`);
  };

  // SEO data
  const profileName = account?.Account_Name || username || "User";
  const guidesCount = guides.length;
  const totalGuidesCount = allGuides.length;
  const pageTitle = `${profileName} | Travel Guides | explorers`;
  const metaDescription = guidesCount > 0
    ? `Explore ${guidesCount}${query.hasMore || query.error ? '+' : ''} travel guide${guidesCount > 1 ? 's' : ''} by ${profileName} on explorers. Discover curated itineraries, travel tips, and destination insights.`
    : `Browse travel guides by ${profileName} on explorers. Discover curated itineraries and destination insights.`;

  const keywords = useMemo(() => [
    `${profileName} explorers guides`,
    `${username} explorers guides`,
    "explorers travel guides",
    "explorers travel itineraries",
    "explorers destination guides",
    "explorers travel tips",
    "explorers curated guides",
    `${profileName} travel guides`,
    `${username} travel guides`,
    "travel guides",
    "travel itineraries",
    "destination guides",
    "travel recommendations",
  ], [profileName, username]);

  const profileImage = account?.profile_picture?.url || account?.bg_picture?.url;
  const currentUrl = createCanonicalUrl(`/${username}/guides`);

  const geoData = createWebPageGEOData({
    pageType: "guides",
    title: pageTitle,
    description: metaDescription,
    keywords: keywords,
    purpose: `Explore travel guides and itineraries curated by ${profileName}`,
  });

  // Check if account exists after loading is complete
  if (!loading && !account && !queryError) {
    return (
      <>
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={keywords}
          canonical={currentUrl}
          enableGEO={true}
          geoData={geoData}
        />
        <div className="flex bg-black items-center justify-center min-h-screen">
          <div className="text-white text-center">
            <h2 className="text-lg font-poppins font-semibold mb-2">
              Profile not found
            </h2>
            <p className="text-gray-400 text-sm">
              This user profile is not available.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO
        title={pageTitle}
        description={metaDescription}
        keywords={keywords}
        canonical={currentUrl}
        image={profileImage}
        url={currentUrl}
        type="website"
        author={profileName}
        siteName="explorers"
        enableGEO={true}
        geoData={geoData}
      />

      <div data-category-page="guides" style={categoryStyles ? { '--skeleton-bg': 'var(--category-card)' } as CSSProperties : undefined} className="h-full bg-[var(--category-page,#000000)] min-h-screen overflow-auto preview-scroll pb-20" aria-busy={loading || undefined}>
        {/* Guides Content */}
        <div className="md:max-w-5xl md:mx-auto">
          
          {/* ── LOADING SKELETON: shown while account/guides queries resolve ── */}
          {loading && !hasUsableData && (
            outletContext?.isShellRevealed ? (
              <>
                {/* Hero skeleton — Desktop */}
                <div className="hidden md:block w-full mb-6 mt-4 px-4">
                  <div className="max-w-4xl mx-auto">
                    <HeroSkeleton accentColor="yellow" showThumbnails />
                  </div>
                </div>
                {/* Hero skeleton — Mobile */}
                <div className="md:hidden w-full mb-4 mt-4 px-4">
                  <HeroSkeleton accentColor="yellow" mobile />
                </div>
                {/* Guide card grid skeleton */}
                <div className="px-4 md:max-w-5xl md:mx-auto">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-4">
                    <GuideCardSkeleton count={6} variant="public" />
                  </div>
                </div>
              </>
            ) : null
          )}

          {Boolean(queryError) && hasUsableData && <PublicRoutePartialNotice message="Some guide data is unavailable." />}

          {/* Featured Guides Slideshow Hero (only shown if pinned guides exist) */}
          {!(Boolean(queryError) && !hasUsableData) && (!loading || hasUsableData) && pinnedGuides.length > 0 && (
            <>
              {/* Carousel Hero Section - Desktop Layout */}
              <div className="hidden md:block w-full mb-6 mt-4 px-4">
                <div data-public-category-artwork className="relative w-full h-[60vh] min-h-[500px] max-h-[700px] rounded-2xl overflow-hidden bg-black shadow-2xl group/hero max-w-4xl mx-auto">
                  {/* Background Presentation */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={pinnedGuides[activeHeroIndex].documentId}
                      initial={{ opacity: 0, scale: 1.05 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6 }}
                      className="absolute inset-0 cursor-pointer"
                      onClick={() => handleGuideClick(pinnedGuides[activeHeroIndex])}
                    >
                      <img
                        src={pinnedGuides[activeHeroIndex].Guide_Media?.[0]?.url || "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1200"}
                        alt={pinnedGuides[activeHeroIndex].Title}
                        className="w-full h-full object-cover opacity-90"
                      />
                      {/* Gradients to fade bottom and left */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-[7] pointer-events-none" />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent z-[7] pointer-events-none" />
                    </motion.div>
                  </AnimatePresence>

                  {/* Featured Heading */}
                  <div className="absolute top-8 left-8 md:top-12 md:left-12 z-[15] pointer-events-none flex flex-col gap-1">
                    <h2 className="text-xl md:text-2xl font-bold text-white flex items-center drop-shadow-lg">
                      <span className="w-1.5 h-6 bg-yellow-400 mr-2.5 rounded-full inline-block"></span>
                      Featured
                    </h2>
                  </div>

                  {/* Main Content Area */}
                  <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12 z-[10] pointer-events-none">
                    <div className="flex justify-between items-end w-full">
                      {/* Left Text Detail Section */}
                      <div className="w-full lg:w-1/2 flex flex-col gap-4">
                        <motion.h1
                          key={`title-${pinnedGuides[activeHeroIndex].documentId}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight font-poppins"
                        >
                          {pinnedGuides[activeHeroIndex].Title}
                        </motion.h1>

                        {(() => {
                          const guide = pinnedGuides[activeHeroIndex];
                          let placeDetails: any = {};
                          if (guide.Place_Details) {
                            if (typeof guide.Place_Details === "string") {
                              try { const parsed = JSON.parse(guide.Place_Details); if (parsed && typeof parsed === "object") placeDetails = parsed; } catch { /* malformed JSON — fall back to defaults */ }
                            } else if (typeof guide.Place_Details === "object") { placeDetails = guide.Place_Details; }
                          }
                          const rating = isDisplayableNumber(placeDetails?.Rating)
                            ? toDisplayNumber(placeDetails?.Rating)
                            : 5.0;

                          return (
                            <motion.div
                              key={`meta-${guide.documentId}`}
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                              className="flex items-center gap-3 text-sm md:text-base text-white/80 font-semibold"
                            >
                              <span>★ {rating.toFixed(1)}</span>
                              <span className="text-white/40">•</span>
                              <span>{guide.Number_Of_Days || 0} {guide.Number_Of_Days === 1 ? "Day" : "Days"}</span>
                              {guide.Guide_Type && (
                                <>
                                  <span className="text-white/40">•</span>
                                  <span>{guide.Guide_Type}</span>
                                </>
                              )}
                              {guide.Budget_Type && (
                                <>
                                  <span className="text-white/40">•</span>
                                  <span>{getBudgetTypeLabel(guide.Budget_Type)}</span>
                                </>
                              )}
                            </motion.div>
                          );
                        })()}

                        <motion.p
                          key={`desc-${pinnedGuides[activeHeroIndex].documentId}`}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                          className="text-white/70 text-sm md:text-base leading-relaxed line-clamp-3 max-w-xl"
                        >
                          {guideDescriptionText(pinnedGuides[activeHeroIndex].Description)}
                        </motion.p>

                        <motion.div
                          key={`btns-${pinnedGuides[activeHeroIndex].documentId}`}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                          className="flex items-center gap-4 mt-2 pointer-events-auto"
                        >
                          <button
                            onClick={() => handleGuideClick(pinnedGuides[activeHeroIndex])}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg shadow-xl shadow-blue-500/20 transition-all hover:scale-105 cursor-pointer border-none"
                          >
                            Read Guide ➔
                          </button>
                        </motion.div>
                      </div>

                      {/* Right Bottom Featured Thumbnail Row */}
                      {pinnedGuides.length > 1 && (
                        <div className="hidden lg:flex flex-col items-end max-w-[50%] z-20 pointer-events-auto">
                          <div className="flex gap-3 py-4 px-2">
                            {pinnedGuides.map((guide, index) => {
                              const isSelected = index === activeHeroIndex;
                              return (
                                <button
                                  key={`thumb-${guide.documentId}`}
                                  onClick={() => setActiveHeroIndex(index)}
                                  className={`relative flex-shrink-0 w-32 aspect-video rounded-md overflow-hidden transition-all duration-300 cursor-pointer ${isSelected ? 'ring-2 ring-white scale-110 z-10 shadow-xl' : 'opacity-60 hover:opacity-100 hover:scale-105 filter brightness-75 hover:brightness-100'}`}
                                >
                                  <img
                                    src={guide.Guide_Media?.[0]?.url || "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1200"}
                                    alt={guide.Title}
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/20" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Carousel Hero Section - Mobile Layout */}
              <div className="md:hidden w-full mb-4 touch-pan-y px-0">
                <div className="relative w-full h-[65vh] min-h-[480px] max-h-[650px] overflow-x-hidden flex items-center justify-start pt-8 pb-2">
                  <div className="absolute inset-y-4 left-4 right-14">
                    {pinnedGuides.map((guide, i) => {
                      const diff = (i - activeHeroIndex + pinnedGuides.length) % pinnedGuides.length;

                      let position = "hiddenRight";
                      if (diff === 0) position = "active";
                      else if (diff === 1) position = "next";
                      else if (diff === 2) position = "nextNext";
                      else if (diff === pinnedGuides.length - 1) position = "hiddenLeft";

                      const variants = {
                        active: { x: 0, scale: 1, zIndex: 10, opacity: 1 },
                        next: { x: "12%", scale: 0.9, zIndex: 5, opacity: 1 },
                        nextNext: { x: "24%", scale: 0.8, zIndex: 4, opacity: 1 },
                        hiddenRight: { x: "40%", scale: 0.7, zIndex: 1, opacity: 0 },
                        hiddenLeft: { x: "-110%", scale: 1, zIndex: 11, opacity: 0 }
                      };

                      const handleDragEnd = (_e: any, { offset, velocity }: PanInfo) => {
                        if (offset.x < -50 || velocity.x < -300) {
                          setActiveHeroIndex((prev) => (prev + 1) % pinnedGuides.length);
                        } else if (offset.x > 50 || velocity.x > 300) {
                          setActiveHeroIndex((prev) => (prev - 1 + pinnedGuides.length) % pinnedGuides.length);
                        }
                      };

                      let placeDetails: any = {};
                      if (guide.Place_Details) {
                        if (typeof guide.Place_Details === "string") {
                          try { const parsed = JSON.parse(guide.Place_Details); if (parsed && typeof parsed === "object") placeDetails = parsed; } catch { /* malformed JSON — fall back to defaults */ }
                        } else if (typeof guide.Place_Details === "object") { placeDetails = guide.Place_Details; }
                      }
                      const rating = isDisplayableNumber(placeDetails?.Rating)
                        ? toDisplayNumber(placeDetails?.Rating)
                        : 5.0;

                      return (
                        <motion.div
                          key={guide.documentId}
                          data-public-category-artwork={diff === 0 ? true : undefined}
                          variants={variants}
                          initial={false}
                          animate={position}
                          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                          drag={diff === 0 ? "x" : false}
                          dragConstraints={{ left: 0, right: 0 }}
                          dragElastic={0.8}
                          onDragEnd={handleDragEnd}
                          className={`absolute inset-0 h-full rounded-2xl overflow-hidden shadow-2xl bg-[#1a2332] border border-white/10 ${diff === 0 ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
                          onClick={() => {
                            if (diff === 0) {
                              handleGuideClick(guide);
                            }
                          }}
                        >
                          <img
                            src={guide.Guide_Media?.[0]?.url || "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1200"}
                            alt={guide.Title}
                            className="w-full h-full object-cover select-none pointer-events-none filter contrast-125"
                          />

                          {/* Gradient dark overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 pointer-events-none" />

                          {/* Featured Tag Banner */}
                          <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto z-20">
                            <div className="flex items-center pointer-events-none drop-shadow-md">
                              <span className="w-1 h-5 bg-yellow-400 mr-2 rounded-full inline-block"></span>
                              <h2 className="text-lg font-bold text-white tracking-tight">Featured</h2>
                            </div>
                          </div>

                          {/* Title & Metadata */}
                          <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-1.5 pointer-events-none z-20">
                            <h2 className="text-3xl font-poppins font-black text-white leading-tight drop-shadow-xl select-none">
                              {guide.Title}
                            </h2>

                            <div className="flex flex-wrap items-center gap-2 text-xs text-white/80 font-semibold tracking-wide mt-1">
                              <span>★ {rating.toFixed(1)}</span>
                              <span className="text-white/40">•</span>
                              <span>{guide.Number_Of_Days || 0} {guide.Number_Of_Days === 1 ? "Day" : "Days"}</span>
                              {guide.Guide_Type && (
                                <>
                                  <span className="text-white/40">•</span>
                                  <span>{guide.Guide_Type}</span>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-3 mt-4 pointer-events-auto">
                              <button
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl border-none cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGuideClick(guide);
                                }}
                              >
                                Read Guide ➔
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="bg-[var(--category-page,#000000)] rounded-lg pt-2 px-4 pb-2 mx-4 mb-0">
            
            {/* Header Title & Side-by-side search row */}
            <div className="flex flex-col gap-3.5 mb-2">
              <div>
                <h1 className="text-xl md:text-2xl font-poppins font-bold text-[var(--category-text,#FFFFFF)] mb-1">
                  Travel Guides
                </h1>
                <p className="text-[var(--category-muted,#9CA3AF)] font-poppins text-xs md:text-sm">
                  {hasActiveFilters
                    ? `${guidesCount}${query.hasMore || query.error ? '+' : ''} of ${totalGuidesCount}${query.hasMore || query.error ? '+' : ''} guide${totalGuidesCount !== 1 ? 's' : ''}`
                    : guidesCount > 0
                      ? `${guidesCount}${query.hasMore || query.error ? '+' : ''} guide${guidesCount !== 1 ? 's' : ''} available`
                      : "No guides available yet"}
                </p>
              </div>

              {/* Search Box & Filters Toggle Button */}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-1.5 bg-[var(--category-card,rgba(255,255,255,0.04))] border border-[var(--category-control-border,rgba(255,255,255,0.08))] rounded-xl px-2.5 h-9">
                  <svg className="w-3.5 h-3.5 text-[var(--category-muted,rgba(255,255,255,0.4))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                  <input
                    type="text"
                    className="bg-transparent border-none text-[var(--category-text,#FFFFFF)] text-xs font-poppins w-full outline-none placeholder:text-[var(--category-muted,rgba(255,255,255,0.45))]"
                    placeholder="Search guides, cities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <button
                  onClick={(event) => {
                    if (!showFilters) filterOpenerRef.current = event.currentTarget;
                    setShowFilters(!showFilters);
                  }}
                  className={`relative w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--category-card,rgba(255,255,255,0.04))] border border-[var(--category-control-border,rgba(255,255,255,0.08))] text-[var(--category-muted,rgba(255,255,255,0.85))] hover:bg-[var(--category-hover,rgba(255,255,255,0.08))] transition-colors cursor-pointer`}
                  aria-label="Filters"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {hasActiveFilters && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[var(--category-accent,#3B82F6)] rounded-full" />
                  )}
                </button>
              </div>
            </div>

            {/* Desktop Filter Panel - Inline */}
            {showFilters && (
              <div className="hidden md:block bg-[var(--category-panel,#1a2332)] border border-[var(--category-control-border,rgba(255,255,255,0.08))] rounded-[14px] p-4 mb-4 mt-1">
                <div className="grid grid-cols-4 gap-3">
                  {/* Guide Type Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[0.62rem] text-[var(--category-muted,rgba(255,255,255,0.5))] font-bold uppercase tracking-wider font-poppins">
                      Guide Type
                    </label>
                    <select
                      value={filters.guideType || ""}
                      onChange={(e) => handleFilterChange("guideType", e.target.value || null)}
                      className="w-full bg-[var(--category-card,rgba(0,0,0,0.2))] border border-[var(--category-control-border,rgba(255,255,255,0.08))] rounded px-2 py-1.5 text-[var(--category-text,#FFFFFF)] text-[0.72rem] font-poppins outline-none cursor-pointer"
                    >
                      <option value="">All Types</option>
                      {filterOptions.guideTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Category Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[0.62rem] text-[var(--category-muted,rgba(255,255,255,0.5))] font-bold uppercase tracking-wider font-poppins">
                      Category
                    </label>
                    <select
                      value={filters.category || ""}
                      onChange={(e) => handleFilterChange("category", e.target.value || null)}
                      className="w-full bg-[var(--category-card,rgba(0,0,0,0.2))] border border-[var(--category-control-border,rgba(255,255,255,0.08))] rounded px-2 py-1.5 text-[var(--category-text,#FFFFFF)] text-[0.72rem] font-poppins outline-none cursor-pointer"
                    >
                      <option value="">All Categories</option>
                      {filterOptions.categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Number of Days Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[0.62rem] text-[var(--category-muted,rgba(255,255,255,0.5))] font-bold uppercase tracking-wider font-poppins">
                      Duration
                    </label>
                    <select
                      value={filters.numberOfDays !== null ? filters.numberOfDays.toString() : ""}
                      onChange={(e) => handleFilterChange("numberOfDays", e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full bg-[var(--category-card,rgba(0,0,0,0.2))] border border-[var(--category-control-border,rgba(255,255,255,0.08))] rounded px-2 py-1.5 text-[var(--category-text,#FFFFFF)] text-[0.72rem] font-poppins outline-none cursor-pointer"
                    >
                      <option value="">All Durations</option>
                      {filterOptions.numberOfDays.map((days) => (
                        <option key={days} value={days.toString()}>
                          {days} {days === 1 ? 'Day' : 'Days'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Budget Type Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[0.62rem] text-[var(--category-muted,rgba(255,255,255,0.5))] font-bold uppercase tracking-wider font-poppins">
                      Budget
                    </label>
                    <select
                      value={filters.budgetType || ""}
                      onChange={(e) => handleFilterChange("budgetType", e.target.value || null)}
                      className="w-full bg-[var(--category-card,rgba(0,0,0,0.2))] border border-[var(--category-control-border,rgba(255,255,255,0.08))] rounded px-2 py-1.5 text-[var(--category-text,#FFFFFF)] text-[0.72rem] font-poppins outline-none cursor-pointer"
                    >
                      <option value="">All Budget Types</option>
                      {filterOptions.budgetTypes.map((budgetType) => (
                        <option key={budgetType} value={budgetType}>
                          {getBudgetTypeLabel(budgetType)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Additional Inline Controls */}
                <div className="mt-4 flex items-center justify-between border-t border-[var(--category-control-border,rgba(255,255,255,0.08))] pt-3">
                  <div className="flex items-center gap-2">
                    <SwitchButton
                      isChecked={isMultiCityFilter}
                      onChange={() => setIsMultiCityFilter(!isMultiCityFilter)}
                      variant="purple"
                    />
                    <span className="text-[var(--category-muted,rgba(255,255,255,0.7))] font-poppins text-xs">
                      {isMultiCityFilter ? "Multi-City Only" : "All Guides"}
                    </span>
                  </div>
                  {hasActiveFilters && (
                    <button
                      onClick={handleClearFilters}
                      className="px-3 py-1 bg-[var(--category-card,#1F2937)] hover:bg-[var(--category-hover,#374151)] border border-[var(--category-control-border,rgba(255,255,255,0.1))] rounded-lg text-[var(--category-text,#FFFFFF)] font-poppins text-xs transition-colors cursor-pointer"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Mobile Filter Sidebar Drawer */}
          {isMobileViewport && (
            <AnimatePresence>
              {showFilters && (
                <PublicBlockingOverlay
                  key="public-guide-filters"
                  label="Guide filters"
                  onClose={() => setShowFilters(false)}
                  returnFocusRef={filterOpenerRef}
                >
                {/* Backdrop Shroud */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="fixed inset-0 bg-black/60 z-[10000]"
                  onClick={() => setShowFilters(false)}
                />

                {/* Slide-out Drawer Panel */}
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-[var(--category-panel,#111622)] z-[10001] shadow-2xl border-r border-[var(--category-control-border,rgba(255,255,255,0.1))] flex flex-col"
                >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--category-control-border,rgba(255,255,255,0.1))]">
                <h2 className="text-[var(--category-text,#FFFFFF)] font-poppins font-semibold text-lg">Filters</h2>
                <button
                  onClick={() => setShowFilters(false)}
                  className="min-h-11 min-w-11 p-2 text-[var(--category-muted,rgba(255,255,255,0.6))] hover:text-[var(--category-text,#FFFFFF)] rounded-lg transition-colors text-xl font-light cursor-pointer"
                  aria-label="Close filters"
                >
                  &times;
                </button>
              </div>

              {/* Sidebar Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Guide Type Filter */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.62rem] text-[var(--category-muted,rgba(255,255,255,0.5))] font-bold uppercase tracking-wider font-poppins">
                    Guide Type
                  </label>
                  <select
                    value={filters.guideType || ""}
                    onChange={(e) => handleFilterChange("guideType", e.target.value || null)}
                    className="w-full px-3 py-2 bg-[var(--category-card,rgba(0,0,0,0.2))] border border-[var(--category-control-border,rgba(255,255,255,0.08))] rounded-lg text-[var(--category-text,#FFFFFF)] font-poppins text-sm focus:outline-none cursor-pointer"
                  >
                    <option value="">All Types</option>
                    {filterOptions.guideTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.62rem] text-[var(--category-muted,rgba(255,255,255,0.5))] font-bold uppercase tracking-wider font-poppins">
                    Category
                  </label>
                  <select
                    value={filters.category || ""}
                    onChange={(e) => handleFilterChange("category", e.target.value || null)}
                    className="w-full px-3 py-2 bg-[var(--category-card,rgba(0,0,0,0.2))] border border-[var(--category-control-border,rgba(255,255,255,0.08))] rounded-lg text-[var(--category-text,#FFFFFF)] font-poppins text-sm focus:outline-none cursor-pointer"
                  >
                    <option value="">All Categories</option>
                    {filterOptions.categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Number of Days Filter */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.62rem] text-[var(--category-muted,rgba(255,255,255,0.5))] font-bold uppercase tracking-wider font-poppins">
                    Duration
                  </label>
                  <select
                    value={filters.numberOfDays !== null ? filters.numberOfDays.toString() : ""}
                    onChange={(e) => handleFilterChange("numberOfDays", e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 bg-[var(--category-card,rgba(0,0,0,0.2))] border border-[var(--category-control-border,rgba(255,255,255,0.08))] rounded-lg text-[var(--category-text,#FFFFFF)] font-poppins text-sm focus:outline-none cursor-pointer"
                  >
                    <option value="">All Durations</option>
                    {filterOptions.numberOfDays.map((days) => (
                      <option key={days} value={days.toString()}>
                        {days} {days === 1 ? 'Day' : 'Days'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Budget Type Filter */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.62rem] text-[var(--category-muted,rgba(255,255,255,0.5))] font-bold uppercase tracking-wider font-poppins">
                    Budget
                  </label>
                  <select
                    value={filters.budgetType || ""}
                    onChange={(e) => handleFilterChange("budgetType", e.target.value || null)}
                    className="w-full px-3 py-2 bg-[var(--category-card,rgba(0,0,0,0.2))] border border-[var(--category-control-border,rgba(255,255,255,0.08))] rounded-lg text-[var(--category-text,#FFFFFF)] font-poppins text-sm focus:outline-none cursor-pointer"
                  >
                    <option value="">All Budget Types</option>
                    {filterOptions.budgetTypes.map((budgetType) => (
                      <option key={budgetType} value={budgetType}>
                        {getBudgetTypeLabel(budgetType)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Multi-City Filter */}
                <div className="flex flex-col gap-2 pt-2">
                  <label className="text-[0.62rem] text-[var(--category-muted,rgba(255,255,255,0.5))] font-bold uppercase tracking-wider font-poppins">
                    Multi City
                  </label>
                  <div className="flex items-center gap-3">
                    <SwitchButton
                      isChecked={isMultiCityFilter}
                      onChange={() => setIsMultiCityFilter(!isMultiCityFilter)}
                      variant="purple"
                    />
                    <span className="text-[var(--category-muted,rgba(255,255,255,0.7))] font-poppins text-sm">
                      {isMultiCityFilter ? "Multi-City Only" : "All Guides"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sidebar Footer */}
              <div className="p-4 border-t border-[var(--category-control-border,rgba(255,255,255,0.1))] space-y-3 bg-[var(--category-card,rgba(0,0,0,0.2))]">
                {hasActiveFilters && (
                  <button
                    onClick={handleClearFilters}
                    className="w-full px-4 py-2.5 bg-[var(--category-card,#1F2937)] hover:bg-[var(--category-hover,#374151)] text-[var(--category-text,#FFFFFF)] rounded-lg font-poppins text-sm transition-colors cursor-pointer"
                  >
                    Clear All Filters
                  </button>
                )}
                <button
                  onClick={() => setShowFilters(false)}
                  className="min-h-11 w-full px-4 py-2.5 bg-[var(--category-accent,#2563EB)] hover:bg-[var(--category-accent,#1D4ED8)] rounded-lg text-[var(--category-accent-ink,#FFFFFF)] font-poppins text-sm font-medium transition-colors cursor-pointer"
                >
                  Apply Filters
                </button>
              </div>
                </motion.div>
                </PublicBlockingOverlay>
              )}
            </AnimatePresence>
          )}

          {/* Error State */}
          {Boolean(queryError) && !hasUsableData && (
            <PublicRouteErrorState title="Guides unavailable" error={queryError as { message?: string }} onRetry={handleRetry} />
          )}

          {/* Location Tags */}
          {!(Boolean(queryError) && !hasUsableData) && filterOptions.locations.length > 0 && (
            <div className="px-4 mb-2">
              <div className="overflow-x-auto scrollbar-hide whitespace-nowrap py-1.5">
                <div className="flex gap-3">
                  <Button
                    btnText="All Locations"
                    type="button"
                    variant={selectedLocation === "" ? "tagSelected" : "tag"}
                    onClickHandler={() => setSelectedLocation("")}
                    size="xsmall"
                  />
                  {filterOptions.locations.map((location: string, index: number) => (
                    <Button
                      key={`${location}-${index}`}
                      btnText={location}
                      type="button"
                      variant={selectedLocation === location ? "tagSelected" : "tag"}
                      onClickHandler={() => setSelectedLocation(location)}
                      size="xsmall"
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Guides Grid */}
          {!(Boolean(queryError) && !hasUsableData) && (
            <div className="px-4 mb-14">
              <div className="bg-[var(--category-page,#000000)] rounded-lg py-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6 overflow-visible">
                  {loading && !hasUsableData ? (
                    // Skeleton cards — same grid, public (dark) variant
                    <GuideCardSkeleton count={6} variant="public" />
                  ) : guides.length > 0 ? (
                    guides.map((guide) => (
                      <PublicGuideCard
                        key={guide.documentId}
                        guide={guide}
                        onClickHandler={() => handleGuideClick(guide)}
                      />
                    ))
                  ) : (
                    <div className="col-span-2 md:col-span-3 flex flex-col items-center justify-center min-h-[30vh] py-10 text-center">
                      <h1 className="text-[var(--category-text,#FFFFFF)] font-poppins font-semibold text-lg md:text-xl mb-2">
                        No Guides Yet
                      </h1>
                      <p className="text-[var(--category-muted,#9CA3AF)] font-poppins text-sm md:text-base max-w-md">
                        {account?.Account_Name} has no guides matching these filters. Check back later for amazing travel insights!
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <PublicScrollContinuation {...query} label="guides" />
        </div>
      </div>
    </>
  );
});

PublicGuides.displayName = "PublicGuides";

export default PublicGuides;

