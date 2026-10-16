import { NavigationStatus } from "../navigation/NavigationStatus";
import type { IntentAuthority } from "../navigation/categoryNavigationPolicy";
import { useCategoryNavigation } from "../navigation/CategoryNavigationProvider";
import React, { useState, useRef, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Button from "../../components/ui/Button";
import GuideCard from "./components/GuideCard";
import TopPicksHero from "./components/TopPicksHero";
import TopPicksMobileHero from "./components/TopPicksMobileHero";
import { useGuidesOwner } from "./hooks/useGuidesOwner";
import { archiveGuide, setGuidePin, setGuidePublished } from "./api/guideListWrites";
import GuideCardSkeleton from "../../components/ui/GuideCardSkeleton";
import HeroSkeleton from "../../components/ui/HeroSkeleton";
import Modal from "../../components/ui/Modal";
import { CategoryVisibilityModal } from "../../components/CategoryVisibilityModal";
import { toast } from "sonner";
import SEO from "../../components/SEO";
import { createCanonicalUrl } from "../../utils/getCurrentDomain";
import useAuthStore from "../../store/store";
import type { Guide } from "./types";
import SwitchButton from "../../components/ui/SwitchButton";
import { AddIcon } from "../../assets/icons/AddIcon";
import { CategoryEmptyState } from "../../components/CategoryEmptyState";

interface FilterState {
  guideType: string | null;
  category: string | null;
  numberOfDays: number | null;
  bestTimeToVisit: string | null;
  budgetType: string | null;
}

const GuidesPage: React.FC = () => {
  const navigation = useCategoryNavigation();
  const categoryVisible = navigation.snapshot?.visibility.public_guides === "Yes";
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [deletingGuideId, setDeletingGuideId] = useState<string>("");
  const [filters, setFilters] = useState<FilterState>({
    guideType: null,
    category: null,
    numberOfDays: null,
    bestTimeToVisit: null,
    budgetType: null,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [isMultiCityFilter, setIsMultiCityFilter] = useState<boolean>(false);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [isManageModalOpen, setIsManageModalOpen] = useState<boolean>(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState<boolean>(false);
  const [visibilityPrompt, setVisibilityPrompt] = useState<{
    isOpen: boolean;
    categoryName: string;
    visibilityField: string;
    origin?: IntentAuthority;
    defaultValue: boolean;
  } | null>(null);

  // Ticket 5.3. No account lookup: the canonical owner read is already scoped to the
  // signed-in owner, so there is nothing to filter by and nothing to wait for.
  const location = useLocation();

  const promptedLocation = useRef<string | null>(null);
  useEffect(() => {
    if (location.state?.justCreatedGuide && navigation.authority && promptedLocation.current !== location.key) {
      promptedLocation.current = location.key;
      const isPublic = navigation.snapshot?.visibility.public_guides === "Yes";
      if (!isPublic && navigation.authority) {
        setVisibilityPrompt({
          origin: navigation.authority,
          isOpen: true,
          categoryName: "Guides",
          visibilityField: "public_guides",
          defaultValue: false,
        });
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state, location.key, navigation.authority, navigation.snapshot]);



  // One bracketed owner read for every guide and its sections, replacing the Strapi
  // guides query. `lists` carries the editable collection observation each write needs.
  const { guides: ownedGuides, content, loading, error, refresh: refetch } = useGuidesOwner();
  const [isDeleting, setIsDeleting] = useState(false);
  const observedList = (documentId: string) => content?.lists.get(documentId);

  // Archiving a guide keeps its sections, fields and media and removes it from every
  // active listing, which is the same semantics every other category's list delete has.
  const deleteGuide = async (documentId: string) => {
    const list = observedList(documentId);
    if (!list) {
      toast.error("Guide could not be loaded. Refresh and try again.");
      return;
    }
    setIsDeleting(true);
    try {
      await archiveGuide(list);
      toast.success("Guide deleted successfully");
      refetch();
    } catch (failure: any) {
      toast.error(`Failed to delete guide: ${failure?.message ?? "unknown error"}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setDeletingGuideId("");
    }
  };

  const handleVisibilityToggle = () => {
    const origin = navigation.authority;
    if (origin && !navigation.busy) void navigation.request({ category: "public_guides", action: categoryVisible ? "unpublish" : "publish" }, origin);
  };

  const allGuides: Guide[] = (ownedGuides ?? []) as Guide[];

  // One read now, so one loading flag.
  const isLoading = loading;

  useEffect(() => {
    if (!isLoading) {
      (window as any).__dashboardLoaded = true;
    }
  }, [isLoading]);

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
        const starting = placeDetails.starting || placeDetails.departure || placeDetails.from;
        if (starting?.Place_Name) {
          locations.push(starting.Place_Name);
        } else if (starting?.Place_Address) {
          locations.push(starting.Place_Address);
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

        // Ending city
        const ending = placeDetails.ending || placeDetails.arrival || placeDetails.to;
        if (ending?.Place_Name) {
          locations.push(ending.Place_Name);
        } else if (ending?.Place_Address) {
          locations.push(ending.Place_Address);
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

  // Filter and sort guides based on selected filters and pinning
  const filteredAndSortedGuides = useMemo(() => {
    const filtered = allGuides.filter((guide) => {
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

      // Location filter
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

    // Sort: Pinned items first (by pin_order), then unpinned items (by display_order / createdAt desc)
    return [...filtered].sort((a: any, b: any) => {
      // Pinned status comparison
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;

      if (a.is_pinned && b.is_pinned) {
        // Both pinned: sort by pin_order
        const orderA = a.pin_order !== null && a.pin_order !== undefined ? a.pin_order : Infinity;
        const orderB = b.pin_order !== null && b.pin_order !== undefined ? b.pin_order : Infinity;
        if (orderA !== orderB) return orderA - orderB;
      } else {
        // Both unpinned: sort by display_order
        const orderA = a.display_order !== null && a.display_order !== undefined ? a.display_order : Infinity;
        const orderB = b.display_order !== null && b.display_order !== undefined ? b.display_order : Infinity;
        if (orderA !== orderB) return orderA - orderB;
      }

      // Fallback: sort by createdAt desc
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [allGuides, filters, isMultiCityFilter, selectedLocation]);

  const guides = filteredAndSortedGuides;

  const pinnedGuides = useMemo(() => {
    return [...allGuides]
      .filter((guide) => guide.is_pinned)
      .sort((a, b) => {
        const orderA = a.pin_order !== null && a.pin_order !== undefined ? a.pin_order : Infinity;
        const orderB = b.pin_order !== null && b.pin_order !== undefined ? b.pin_order : Infinity;
        return orderA - orderB;
      });
  }, [allGuides]);

  const unpinnedGuides = useMemo(() => {
    return [...allGuides]
      .filter((guide) => !guide.is_pinned)
      .sort((a, b) => {
        const orderA = a.display_order !== null && a.display_order !== undefined ? a.display_order : Infinity;
        const orderB = b.display_order !== null && b.display_order !== undefined ? b.display_order : Infinity;
        if (orderA !== orderB) return orderA - orderB;

        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
  }, [allGuides]);

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
  };

  // Check if any filter is active
  const hasActiveFilters = Object.values(filters).some((value) => value !== null) || isMultiCityFilter || selectedLocation !== "";

  // Helper function to get display label for budget type (convert enum to display format)
  const getBudgetTypeLabel = (value: string | null): string => {
    if (!value) return "";
    // Map enum values to display labels
    const budgetTypeMap: Record<string, string> = {
      "Budget": "Budget",
      "Mid_Range": "Mid-Range",
      "Luxury": "Luxury",
      "Backpacker": "Backpacker",
      "Ultra_Luxury": "Ultra-Luxury",
    };
    return budgetTypeMap[value] || value;
  };

  const handleGuideClick = (documentId: string) => {
    navigate(`/guides/${documentId}`);
  };

  const handleEditGuide = (documentId: string) => {
    navigate(`/guides/${documentId}/edit`);
  };

  const handleDeleteGuide = (documentId: string) => {
    setDeletingGuideId(documentId);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    if (deletingGuideId) void deleteGuide(deletingGuideId);
  };

  const handleToggleVisibility = async (documentId: string, currentVisibility: boolean) => {
    const list = observedList(documentId);
    if (!list) {
      toast.error("Guide could not be loaded. Refresh and try again.");
      return;
    }
    const nextVisibility = !currentVisibility;
    try {
      // Unpublishing also unpins, inside the one server transaction. That rule used to
      // live here, in UI code that set is_pinned/pin_order alongside the visibility
      // change - where any other caller would simply not have done it.
      await setGuidePublished(list, nextVisibility);
      refetch();
      toast.success(`Guide is now ${nextVisibility ? "Public" : "Draft"}`);
    } catch (failure: any) {
      toast.error(`Failed to update guide status: ${failure?.message ?? "unknown error"}`);
    }
  };

  const handleTogglePin = async (documentId: string) => {
    const guide = allGuides.find((g) => g.documentId === documentId);
    if (!guide) return;

    const nextPinnedValue = !guide.is_pinned;
    let pinOrder = null;

    if (nextPinnedValue) {
      if (!guide.Visibility) {
        toast.error("Only published guides can be pinned as Top Picks");
        return;
      }
      const maxPinOrder = pinnedGuides.reduce((max: number, g: any) => {
        const po = g.pin_order || 0;
        return po > max ? po : max;
      }, 0);
      pinOrder = maxPinOrder + 1;
    }

    try {
      const list = observedList(documentId);
      if (!list) throw new Error("Guide could not be loaded. Refresh and try again.");
      // The client still refuses to pin an unpublished guide above, so the user gets a
      // specific message; the server refuses it too, which is what makes the rule hold
      // for every other caller.
      await setGuidePin(list, nextPinnedValue ? pinOrder : null);
      refetch();
      toast.success(`${guide.Title} ${nextPinnedValue ? "pinned as Top Pick" : "unpinned"}`);
    } catch (error: any) {
      console.error("Error updating pin state:", error);
      toast.error(`Failed to update pin state: ${error.message}`);
    }
  };

  const handleModalPinToggle = async (guide: any, nextPinnedValue: boolean) => {
    const docId = guide.documentId;
    if (!docId) return;

    if (nextPinnedValue && !guide.Visibility) {
      toast.error("Only published guides can be pinned as Top Picks");
      return;
    }

    let pinOrder = null;
    if (nextPinnedValue) {
      const maxPinOrder = pinnedGuides.reduce((max: number, g: any) => {
        const po = g.pin_order || 0;
        return po > max ? po : max;
      }, 0);
      pinOrder = maxPinOrder + 1;
    }

    try {
      const list = observedList(docId);
      if (!list) throw new Error("Guide could not be loaded. Refresh and try again.");
      await setGuidePin(list, nextPinnedValue ? pinOrder : null);
      refetch();
      toast.success(`${guide.Title} ${nextPinnedValue ? "pinned" : "unpinned"}`);
    } catch (error) {
      console.error("Error updating pin state:", error);
      toast.error("Failed to update pin state");
    }
  };

  const handleSwapPinOrder = async (guideA: any, guideB: any) => {
    if (!guideA || !guideB) return;
    const tempOrder = guideA.pin_order || 0;
    const nextOrder = guideB.pin_order || 0;

    try {
      const listA = observedList(guideA.documentId), listB = observedList(guideB.documentId);
      if (!listA || !listB) throw new Error("Guides could not be loaded. Refresh and try again.");
      // Two commands, so a failure between them leaves one guide moved. The reload below
      // shows the real state rather than the order the swap intended, which is why the
      // toast is not raised until both have succeeded.
      await setGuidePin(listA, nextOrder);
      await setGuidePin(listB, tempOrder);
      refetch();
      toast.success("Order updated");
    } catch (error) {
      console.error("Error swapping order:", error);
      toast.error("Failed to update order");
    }
  };


  const guidesCount = guides.length;
  const username = user?.username || "User";

  return (
    <>
      <SEO
        title={`My Travel Guides - Manage & Create Guides | explorers`}
        description={`Manage and create your travel guides with explorers. ${guidesCount > 0 ? `You have ${guidesCount} travel guide${guidesCount > 1 ? 's' : ''} ready to share. ` : 'Start creating itinerary-based or theme-based travel guides to share your journey experiences.'} Organize your travel recommendations, create detailed itineraries, and share your exploration stories.`}
        keywords={[
          "travel guides dashboard",
          "manage travel guides",
          "create travel guides",
          "itinerary guides",
          "theme-based guides",
          "travel planning",
          "explorers guides",
          "travel guide creation",
          "journey planning",
          "destination guides",
          "travel recommendations",
          "curated travel guides",
          "travel exploration",
          "guide management",
          "travel itinerary creation"
        ]}
        canonical={createCanonicalUrl("/guides")}
        type="website"
        noIndex={true}
        siteName="explorers"
        author={username}
      />
      <div className="dashboard-theme bg-dashboard-bg min-h-screen">
        <NavigationStatus navigation={navigation} />
        <div className="w-full h-full mx-auto max-w-5xl px-4 md:px-6 pt-2 md:pt-4 pb-16 md:pb-6">
          {/* Header row with Add Button and Visibility Toggle (matches Recommendations) */}
          {/* Header row with Add Button and Visibility Toggle */}
          <div className="mb-4 relative">
            {/* Desktop Screen actions row */}
            <div className="hidden md:flex justify-between items-center bg-dashboard-sidebar/40 px-4 py-3.5 rounded-2xl mb-4 border border-white/5">
              <div className="flex items-center gap-2 bg-dashboard-muted/50 px-3 py-2 rounded-xl">
                <SwitchButton
                  isChecked={categoryVisible}
                  onChange={handleVisibilityToggle}
                  disabled={navigation.busy || !navigation.authority}
                  variant="blue"
                />
                <span className="text-[10px] md:text-xs text-white leading-tight whitespace-nowrap font-medium">Public Visibility</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Filter button - only show when there are guides */}
                {!isLoading && allGuides.length > 0 && (
                  <div className="flex items-center gap-2 mr-1">
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`relative px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer border-none ${hasActiveFilters
                        ? "bg-dashboard-accent hover:opacity-90 text-white shadow-lg shadow-blue-900/30"
                        : "bg-dashboard-sidebar hover:bg-dashboard-card text-dashboard border border-dashboard shadow-md"
                        }`}
                      title="Filters"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                      <span className="font-poppins text-sm font-medium">Filters</span>
                      {hasActiveFilters && (
                        <span className="bg-dashboard-accent text-white text-xs px-2 py-0.5 rounded-full">
                          {Object.values(filters).filter(v => v !== null).length + (isMultiCityFilter ? 1 : 0) + (selectedLocation !== "" ? 1 : 0)}
                        </span>
                      )}
                    </button>
                    {hasActiveFilters && (
                      <button
                        onClick={handleClearFilters}
                        className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 font-poppins text-sm transition-colors cursor-pointer border-none"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                )}
                <button
                  onClick={() => navigate("/guides/new")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-dashboard-accent hover:opacity-90 text-sm text-white font-medium transition-all shadow-lg shadow-blue-900/30 whitespace-nowrap cursor-pointer border-none"
                >
                  <AddIcon size="5" />
                  <span>Create Guide</span>
                </button>
              </div>
            </div>

            {/* Mobile actions row (split action button with visibility dropdown) */}
            <div className="md:hidden flex gap-2 items-center mb-4 w-full">
              <div className="flex-1 flex rounded-2xl overflow-hidden border border-white/10 shadow-lg shadow-blue-900/15">
                <button
                  onClick={() => navigate("/guides/new")}
                  className="flex-1 bg-dashboard-accent hover:opacity-90 text-xs font-bold text-white py-3 px-4 text-left flex items-center gap-1.5 transition-all cursor-pointer border-none"
                >
                  <AddIcon size="4" />
                  <span>Create Guide</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileDropdownOpen(!mobileDropdownOpen);
                  }}
                  className="bg-dashboard-accent border-l border-white/20 px-3 flex items-center justify-center cursor-pointer transition-all hover:opacity-90 border-none"
                >
                  <svg className={`w-3.5 h-3.5 text-white transform transition-transform duration-200 ${mobileDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Filter button on mobile */}
              {!isLoading && allGuides.length > 0 && (
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-3 rounded-2xl border-none transition-all flex items-center justify-center gap-1.5 cursor-pointer h-[42px] ${hasActiveFilters
                    ? "bg-dashboard-accent text-white"
                    : "bg-dashboard-sidebar text-dashboard border border-dashboard"
                    }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {hasActiveFilters && (
                    <span className="bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                      {Object.values(filters).filter(v => v !== null).length + (isMultiCityFilter ? 1 : 0) + (selectedLocation !== "" ? 1 : 0)}
                    </span>
                  )}
                </button>
              )}
            </div>

            {mobileDropdownOpen && (
              <div className="absolute top-[calc(100%+6px)] right-0 left-0 p-3.5 z-[100] border border-dashboard-accent/30 rounded-2xl bg-dashboard-sidebar/95 backdrop-blur-md shadow-xl flex justify-between items-center md:hidden">
                <span className="text-[11px] text-white/90 font-semibold">Manage Public Visibility</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase ${categoryVisible ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                    {categoryVisible ? "Pub" : "Draft"}
                  </span>
                  <SwitchButton
                    isChecked={categoryVisible}
                    onChange={handleVisibilityToggle}
                    disabled={navigation.busy || !navigation.authority}
                    variant="blue"
                  />
                </div>
              </div>
            )}

            {/* Desktop Filter Panel - Inline */}
            {showFilters && allGuides.length > 0 && (
              <div className="hidden md:block border-t border-dashboard mt-2 pt-2">
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                  {/* Guide Type Filter */}
                  <div>
                    <label className="block text-dashboard font-poppins text-xs font-medium mb-1">
                      Guide Type
                    </label>
                    <select
                      value={filters.guideType || ""}
                      onChange={(e) => handleFilterChange("guideType", e.target.value || null)}
                      className="w-full px-2 py-1 bg-dashboard-sidebar border border-dashboard rounded-lg text-dashboard font-poppins text-xs focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
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
                  <div>
                    <label className="block text-dashboard font-poppins text-xs font-medium mb-1">
                      Category
                    </label>
                    <select
                      value={filters.category || ""}
                      onChange={(e) => handleFilterChange("category", e.target.value || null)}
                      className="w-full px-2 py-1 bg-dashboard-sidebar border border-dashboard rounded-lg text-dashboard font-poppins text-xs focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
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
                  <div>
                    <label className="block text-dashboard font-poppins text-xs font-medium mb-1">
                      Number of Days
                    </label>
                    <select
                      value={filters.numberOfDays !== null ? filters.numberOfDays.toString() : ""}
                      onChange={(e) => handleFilterChange("numberOfDays", e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full px-2 py-1 bg-dashboard-sidebar border border-dashboard rounded-lg text-dashboard font-poppins text-xs focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
                    >
                      <option value="">All Durations</option>
                      {filterOptions.numberOfDays.map((days) => (
                        <option key={days} value={days.toString()}>
                          {days} {days === 1 ? 'Day' : 'Days'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Best Time to Visit Filter */}
                  <div>
                    <label className="block text-dashboard font-poppins text-xs font-medium mb-1">
                      Best Time to Visit
                    </label>
                    <select
                      value={filters.bestTimeToVisit || ""}
                      onChange={(e) => handleFilterChange("bestTimeToVisit", e.target.value || null)}
                      className="w-full px-2 py-1 bg-dashboard-sidebar border border-dashboard rounded-lg text-dashboard font-poppins text-xs focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
                    >
                      <option value="">All Months</option>
                      {filterOptions.months.map((month) => (
                        <option key={month} value={month}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Budget Type Filter */}
                  <div>
                    <label className="block text-dashboard font-poppins text-xs font-medium mb-1">
                      Budget Type
                    </label>
                    <select
                      value={filters.budgetType || ""}
                      onChange={(e) => handleFilterChange("budgetType", e.target.value || null)}
                      className="w-full px-2 py-1 bg-dashboard-sidebar border border-dashboard rounded-lg text-dashboard font-poppins text-xs focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
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
                  <div>
                    <label className="block text-dashboard font-poppins text-xs font-medium mb-1">
                      Multi city
                    </label>
                    <div className="flex items-center gap-2">
                      <SwitchButton
                        isChecked={isMultiCityFilter}
                        onChange={() => setIsMultiCityFilter(!isMultiCityFilter)}
                        variant="dark"
                      />
                      <span className="text-dashboard-light font-poppins text-xs">
                        {isMultiCityFilter ? "Multi-City Only" : "All Guides"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error State */}
          {error && (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
              <div className="bg-dashboard-modal p-6 rounded-lg border border-red-500 shadow-dashboard-elevated text-center">
                <h1 className="text-red-400 font-poppins font-semibold text-lg md:text-xl mb-2">
                  Error Loading Guides
                </h1>
                <p className="text-gray-300 font-poppins text-sm md:text-base">
                  {error.message}
                </p>
              </div>
            </div>
          )}

          {/* Mobile Filter Sidebar */}
          {allGuides.length > 0 && (
            <React.Fragment>
              {/* Backdrop/Overlay */}
              <div
                className={`md:hidden fixed inset-0 bg-black/60 z-[10000] transition-all duration-300 ease-out ${showFilters ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
                  }`}
                onClick={() => setShowFilters(false)}
              />

              {/* Sidebar */}
              <div
                className={`md:hidden fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-dashboard-sidebar z-[10001] shadow-dashboard-elevated transform transition-transform duration-300 ease-out border-r border-dashboard ${showFilters ? "translate-x-0" : "-translate-x-full"
                  }`}
              >
                <div className="flex flex-col h-full">
                  {/* Sidebar Header */}
                  <div className="flex items-center justify-between p-4 border-b border-dashboard">
                    <h2 className="text-dashboard font-poppins font-semibold text-lg">Filters</h2>
                    <button
                      onClick={() => setShowFilters(false)}
                      className="p-2 hover:bg-dashboard-card rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5 text-dashboard" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Sidebar Content - Scrollable */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Guide Type Filter */}
                    <div>
                      <label className="block text-dashboard font-poppins text-sm font-medium mb-2">
                        Guide Type
                      </label>
                      <select
                        value={filters.guideType || ""}
                        onChange={(e) => handleFilterChange("guideType", e.target.value || null)}
                        className="w-full px-3 py-2.5 bg-dashboard-bg border border-dashboard rounded-lg text-dashboard font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
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
                    <div>
                      <label className="block text-dashboard font-poppins text-sm font-medium mb-2">
                        Category
                      </label>
                      <select
                        value={filters.category || ""}
                        onChange={(e) => handleFilterChange("category", e.target.value || null)}
                        className="w-full px-3 py-2.5 bg-dashboard-bg border border-dashboard rounded-lg text-dashboard font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
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
                    <div>
                      <label className="block text-dashboard font-poppins text-sm font-medium mb-2">
                        Number of Days
                      </label>
                      <select
                        value={filters.numberOfDays !== null ? filters.numberOfDays.toString() : ""}
                        onChange={(e) => handleFilterChange("numberOfDays", e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2.5 bg-dashboard-bg border border-dashboard rounded-lg text-dashboard font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
                      >
                        <option value="">All Durations</option>
                        {filterOptions.numberOfDays.map((days) => (
                          <option key={days} value={days.toString()}>
                            {days} {days === 1 ? 'Day' : 'Days'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Best Time to Visit Filter */}
                    <div>
                      <label className="block text-dashboard font-poppins text-sm font-medium mb-2">
                        Best Time to Visit
                      </label>
                      <select
                        value={filters.bestTimeToVisit || ""}
                        onChange={(e) => handleFilterChange("bestTimeToVisit", e.target.value || null)}
                        className="w-full px-3 py-2.5 bg-dashboard-bg border border-dashboard rounded-lg text-dashboard font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
                      >
                        <option value="">All Months</option>
                        {filterOptions.months.map((month) => (
                          <option key={month} value={month}>
                            {month}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Budget Type Filter */}
                    <div>
                      <label className="block text-dashboard font-poppins text-sm font-medium mb-2">
                        Budget Type
                      </label>
                      <select
                        value={filters.budgetType || ""}
                        onChange={(e) => handleFilterChange("budgetType", e.target.value || null)}
                        className="w-full px-3 py-2.5 bg-dashboard-bg border border-dashboard rounded-lg text-dashboard font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
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
                    <div>
                      <label className="block text-dashboard font-poppins text-sm font-medium mb-2">
                        Multi city
                      </label>
                      <div className="flex items-center gap-3">
                        <SwitchButton
                          isChecked={isMultiCityFilter}
                          onChange={() => setIsMultiCityFilter(!isMultiCityFilter)}
                          variant="dark"
                        />
                        <span className="text-dashboard-light font-poppins text-sm">
                          {isMultiCityFilter ? "Multi-City Only" : "All Guides"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sidebar Footer */}
                  <div className="p-4 border-t border-dashboard space-y-3">
                    {hasActiveFilters && (
                      <button
                        onClick={handleClearFilters}
                        className="w-full px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded-lg text-red-500 font-poppins text-sm font-medium transition-colors"
                      >
                        Clear All Filters
                      </button>
                    )}
                    <button
                      onClick={() => setShowFilters(false)}
                      className="w-full px-4 py-2.5 bg-dashboard-accent hover:bg-dashboard-accent/90 rounded-lg text-white font-poppins text-sm font-medium transition-colors"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              </div>
            </React.Fragment>
          )}

          {/* Featured Guides Hero Section or Placeholder */}
          {!isLoading && !error && allGuides.length > 0 && (
            <div className="mb-6">
              {pinnedGuides.length > 0 ? (
                <>
                  <div className="hidden lg:block">
                    <TopPicksHero 
                      guides={pinnedGuides}
                      onGuideClick={(guide) => handleGuideClick(guide.documentId)}
                      showManageButton={true}
                      onManageClick={() => setIsManageModalOpen(true)}
                    />
                  </div>
                  <div className="block lg:hidden">
                    <TopPicksMobileHero 
                      guides={pinnedGuides}
                      onGuideClick={(guide) => handleGuideClick(guide.documentId)}
                      showManageButton={true}
                      onManageClick={() => setIsManageModalOpen(true)}
                    />
                  </div>
                </>
              ) : (
                /* Empty Placeholder banner */
                <div
                  onClick={() => setIsManageModalOpen(true)}
                  className="w-full flex items-center justify-between p-4 rounded-[14px] border border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10 transition-all duration-300 cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-xs md:text-sm font-bold text-[#fbbf24] font-poppins">
                    <span className="text-amber-400">★</span> Manage Top Picks ({pinnedGuides.length}/{allGuides.length})
                  </div>
                  <div className="flex items-center text-amber-500">
                    <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Location Tags */}
          {!isLoading && !error && filterOptions.locations.length > 0 && (
            <div className="mb-4">
              <div className="overflow-x-auto scrollbar-hide whitespace-nowrap py-3">
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
          {!error && (
            <>
              {/* ── Hero skeleton — shown while loading and no pinned data yet ── */}
              {isLoading && pinnedGuides.length === 0 && (
                <div className="mb-8">
                  {/* Desktop */}
                  <div className="hidden md:block">
                    <HeroSkeleton accentColor="yellow" variant="dashboard" showThumbnails />
                  </div>
                  {/* Mobile */}
                  <div className="md:hidden">
                    <HeroSkeleton accentColor="yellow" variant="dashboard" mobile />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-16 md:mb-0">
                {isLoading ? (
                  // Skeleton cards — sit directly in the grid, match guide card proportions
                  <GuideCardSkeleton count={6} variant="dashboard" />
                ) : allGuides.length > 0 ? (
                  <>
                    {guides.length > 0 ? (
                      guides.map((guide) => (
                        <GuideCard
                          key={guide.documentId}
                          guide={guide}
                          onClickHandler={handleGuideClick}
                          onEdit={handleEditGuide}
                          onDelete={handleDeleteGuide}
                          onToggleVisibility={handleToggleVisibility}
                          onTogglePin={handleTogglePin}
                        />
                      ))
                    ) : (
                      <div className="col-span-1 md:col-span-2 flex items-center justify-center p-8 bg-dashboard-sidebar/20 border border-dashboard border-dashed rounded-xl min-h-[150px]">
                        <p className="text-sm font-poppins text-white/50 text-center">
                          No guides match your filter criteria. Try clearing some filters.
                        </p>
                      </div>
                    )}
                    {/* Add Guide Dotted Card */}
                    <div
                      onClick={() => navigate("/guides/new")}
                      className="border-2 border-dashed border-dashboard-border rounded-xl flex flex-col items-center justify-center gap-1.5 p-4 cursor-pointer hover:border-dashboard-accent hover:bg-dashboard-accent/5 transition-all duration-300 aspect-[16/9] md:aspect-[4/3] max-w-none w-full"
                    >
                      <span className="text-2xl text-white/30 font-light">+</span>
                      <span className="text-xs md:text-sm text-white/45 font-semibold whitespace-nowrap">Create Guide</span>
                    </div>
                  </>
                ) : (
                  <div className="col-span-1 md:col-span-3 max-w-2xl mx-auto w-full py-10">
                    <CategoryEmptyState
                      category="guides"
                      onAddClick={() => navigate("/guides/new")}
                    />
                  </div>
                )}
              </div>
            </>
          )}


          {/* Delete Confirmation Modal */}
          {showDeleteModal && (
            <Modal
              isOpen={showDeleteModal}
              onClose={() => !isDeleting && setShowDeleteModal(false)}
            >
              <div className="p-4">
                <h2 className="text-md font-poppins font-medium text-dashboard-light">
                  Confirm Deletion
                </h2>
                <p className="font-poppins text-sm text-[hsl(var(--muted-foreground))] mt-2">
                  Are you sure you want to delete this guide? This action cannot
                  be undone and will also delete all sections associated with this
                  guide.
                </p>
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    btnText="Cancel"
                    onClickHandler={() => setShowDeleteModal(false)}
                    size="small"
                    variant="google"
                    disabled={isDeleting}
                  />
                  <Button
                    btnText={isDeleting ? "Deleting..." : "Delete Guide"}
                    onClickHandler={handleConfirmDelete}
                    size="small"
                    variant="danger"
                    isLoading={isDeleting}
                    disabled={isDeleting}
                  />
                </div>
              </div>
            </Modal>
          )}

          {/* Manage Top Picks Modal */}
          {isManageModalOpen && (
            <Modal
              isOpen={isManageModalOpen}
              onClose={() => setIsManageModalOpen(false)}
            >
              <div className="p-6 max-h-[80vh] overflow-y-auto font-poppins text-white">
                <h2 className="text-xl font-bold mb-2 flex items-center gap-2 text-white">
                  <span className="text-amber-400">★</span> Manage Top Picks
                </h2>
                <p className="text-xs text-white/50 mb-6">
                  Pin up to 5 guides as Top Picks and reorder them to customize the hero slideshow on your profile.
                </p>

                {/* Pinned Section */}
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-3 flex items-center justify-between">
                    <span>Pinned ({pinnedGuides.length})</span>
                    {pinnedGuides.length > 0 && <span className="text-[10px] text-white/40 normal-case font-normal">Use arrows to change order</span>}
                  </h3>

                  {pinnedGuides.length === 0 ? (
                    <div className="border border-dashed border-white/10 rounded-xl p-4 text-center text-xs text-white/40">
                      No pinned guides. Pin a guide below to feature it.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {pinnedGuides.map((guide: any, index: number) => {
                        const coverImage = guide.Guide_Media?.[0]?.url || "https://placehold.co/100x100";
                        return (
                          <div
                            key={guide.documentId || index}
                            className="flex items-center justify-between bg-white/5 border border-white/10 p-3 rounded-xl hover:border-white/20 transition-all"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded bg-white/10 overflow-hidden flex-shrink-0">
                                <img
                                  src={coverImage}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <span className="text-xs font-bold text-white truncate">{guide.Title}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 border-r border-white/10 pr-2">
                                <button
                                  onClick={() => {
                                    if (index > 0) {
                                      handleSwapPinOrder(guide, pinnedGuides[index - 1]);
                                    }
                                  }}
                                  disabled={index === 0}
                                  className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors border-none cursor-pointer"
                                  title="Move Up"
                                >
                                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => {
                                    if (index < pinnedGuides.length - 1) {
                                      handleSwapPinOrder(guide, pinnedGuides[index + 1]);
                                    }
                                  }}
                                  disabled={index === pinnedGuides.length - 1}
                                  className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors border-none cursor-pointer"
                                  title="Move Down"
                                >
                                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                  </svg>
                                </button>
                              </div>

                              <button
                                onClick={() => handleModalPinToggle(guide, false)}
                                className="text-xs bg-amber-500/20 text-amber-300 hover:bg-amber-500/35 px-2.5 py-1.5 rounded-lg font-bold border-none transition-colors cursor-pointer"
                                title="Unpin"
                              >
                                Unpin
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Unpinned Section */}
                <div>
                  <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-3">
                    All Guides ({unpinnedGuides.length})
                  </h3>

                  {unpinnedGuides.length === 0 ? (
                    <div className="border border-dashed border-white/10 rounded-xl p-4 text-center text-xs text-white/40">
                      No unpinned guides.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-1">
                      {unpinnedGuides.map((guide: any, index: number) => {
                        const coverImage = guide.Guide_Media?.[0]?.url || "https://placehold.co/100x100";
                        return (
                          <div
                            key={guide.documentId || index}
                            className="flex items-center justify-between bg-white/5 border border-white/5 p-3 rounded-xl hover:border-white/15 transition-all"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded bg-white/10 overflow-hidden flex-shrink-0">
                                <img
                                  src={coverImage}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <span className="text-xs font-bold text-white/80 truncate">{guide.Title}</span>
                            </div>

                            <button
                              onClick={() => {
                                if (!guide.Visibility) {
                                  toast.error("Only published guides can be pinned as Top Picks");
                                  return;
                                }
                                handleModalPinToggle(guide, true);
                              }}
                              disabled={!guide.Visibility}
                              className="text-xs bg-white/5 text-white/70 hover:bg-white/15 px-2.5 py-1.5 rounded-lg font-bold border border-white/10 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                              title={!guide.Visibility ? "Only published guides can be pinned" : "Pin to Top Picks"}
                            >
                              <svg className="w-3.5 h-3.5 text-white/55" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M19 12H5l4-4V3h6v5l4 4z" />
                                <path d="M12 12v8" />
                              </svg>
                              Pin Top Pick
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-6 border-t border-white/10 pt-4">
                  <Button
                    btnText="Close"
                    onClickHandler={() => setIsManageModalOpen(false)}
                    size="small"
                    variant="google"
                  />
                </div>
              </div>
            </Modal>
          )}
        </div >
      </div >
      {visibilityPrompt && (
        <CategoryVisibilityModal
          isOpen={visibilityPrompt.isOpen}
          onClose={() => setVisibilityPrompt(null)}
          categoryName={visibilityPrompt.categoryName}
          visibilityField={visibilityPrompt.visibilityField} origin={visibilityPrompt.origin}
          accountDocumentId={visibilityPrompt.origin?.accountDocumentId ?? ""}
          onSuccess={() => {
            refetch();
          }}
        />
      )}
    </>
  );
};

export default GuidesPage;
