import CategoryPage from "../shared/category/CategoryPage";
import { toListTopPicks } from "../shared/category/models";
import { NavigationStatus } from "../navigation/NavigationStatus";
import { useCategoryNavigation } from "../navigation/CategoryNavigationProvider";
import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import { invalidateGuides, useGuidesOwner } from "./hooks/useGuidesOwner";
import { reorderCategoryLists } from "../../lib/reorderCategoryLists";
import { archiveGuide, GUIDE_PIN_LIMIT, setGuidePin, setGuidePublished } from "./api/guideListWrites";
import { useGuidePublishNotice } from "./hooks/useGuidePublishNotice";
import { toast } from "sonner";
import SEO from "../../components/SEO";
import { createCanonicalUrl } from "../../utils/getCurrentDomain";
import useAuthStore from "../../store/store";
import type { Guide } from "./types";
import { useTranslation } from "react-i18next";

interface FilterState {
  guideType: string | null;
  category: string | null;
  numberOfDays: number | null;
  bestTimeToVisit: string | null;
  budgetType: string | null;
}

const GuidesPage: React.FC = () => {
  const { t } = useTranslation();
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
  const { notifyPublished, modal: publishNoticeModal } = useGuidePublishNotice("Guide is now Public");

  // Ticket 5.3. No account lookup: the canonical owner read is already scoped to the
  // signed-in owner, so there is nothing to filter by and nothing to wait for.

  // One bracketed owner read for every guide and its sections, replacing the Strapi
  // guides query. `lists` carries the editable collection observation each write needs.
  const { guides: ownedGuides, content, loading, error, refresh: refetch } = useGuidesOwner(undefined, true, { keepWhileRefreshing: true });
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
      if (nextVisibility) notifyPublished();
      else toast.success("Guide is now Draft");
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
      if (pinnedGuides.length >= GUIDE_PIN_LIMIT) {
        toast.error(`You can pin up to ${GUIDE_PIN_LIMIT} guides as Top Picks. Unpin one first.`);
        return;
      }
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
    if (nextPinnedValue && pinnedGuides.length >= GUIDE_PIN_LIMIT) {
      toast.error(`You can pin up to ${GUIDE_PIN_LIMIT} guides as Top Picks. Unpin one first.`);
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
    try {
      // One command with the complete pinned order, so positions stay dense and a failure
      // cannot leave one guide moved and the other not.
      const ids = pinnedGuides.map((guide: any) => guide.documentId);
      const a = ids.indexOf(guideA.documentId), b = ids.indexOf(guideB.documentId);
      if (a < 0 || b < 0) throw new Error("Guides could not be loaded. Refresh and try again.");
      [ids[a], ids[b]] = [ids[b], ids[a]];
      await reorderCategoryLists("guides", "pinned", ids);
      refetch();
      toast.success("Order updated");
    } catch (error) {
      console.error("Error swapping order:", error);
      toast.error("Failed to update order");
    }
  };


  const guidesCount = guides.length;
  const username = user?.username || "User";

  // Cards follow the location chips (and any other active filter), as the pre-template page did.
  const guideCards = useMemo(() => [...guides].sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0)).map((guide: any) => ({
    id: guide.documentId, title: guide.Title ?? "", status: guide.Visibility ? ("public" as const) : ("draft" as const),
    itemCount: guide.sectionCount ?? guide.sections?.length ?? 0, pinnedCount: 0,
    covers: guide.Guide_Media?.[0]?.url ? [guide.Guide_Media[0].url] : [],
  })), [guides]);
  // The state and handlers above stay for WP9 (ownership ruling C6), which rebuilds the Guides
  // filters, delete confirmation and pin flows on this page; the shared template does not use them yet.
  void [t, showDeleteModal, showFilters, setShowFilters, isManageModalOpen, setIsManageModalOpen, mobileDropdownOpen, setMobileDropdownOpen,
    isDeleting, unpinnedGuides, handleFilterChange, handleClearFilters, hasActiveFilters, getBudgetTypeLabel, handleGuideClick, handleEditGuide,
    handleDeleteGuide, handleConfirmDelete, handleTogglePin, handleModalPinToggle, handleSwapPinOrder, guidesCount, username];
  const guidePick = { title: (g: any) => g.Title ?? "", image: (g: any) => g.Guide_Media?.[0]?.url ?? null, isPublic: (g: any) => Boolean(g.Visibility) };

  return (
    <>
      <SEO
        title={`My Travel Guides - Manage & Create Guides | explorers`}
        description="Manage and create your travel guides with explorers."
        canonical={createCanonicalUrl("/guides")}
        type="website"
        noIndex={true}
      />
      <NavigationStatus navigation={navigation} />
      <CategoryPage
        category="guides"
        status={{ loading: isLoading, error: error ? (error instanceof Error ? error : new Error(String(error))) : null, refreshing: isLoading && allGuides.length > 0 }}
        lists={guideCards}
        topPicks={toListTopPicks(allGuides as any[], guidePick)}
        pinCandidates={toListTopPicks(allGuides as any[], guidePick, false)}
        categoryVisibility={categoryVisible ? "public" : "hidden"}
        visibilityBusy={navigation.busy || !navigation.authority}
        onCategoryVisibility={() => handleVisibilityToggle()}
        onOpenList={(id) => navigate(`/guides/${id}`)}
        onRetry={() => refetch()}
        onChanged={() => { invalidateGuides(); refetch(); }}
        onSetListStatus={async (id, next) => { await handleToggleVisibility(id, next !== "public"); }}
        newList={{ kind: "navigate", onNew: () => navigate("/guides/new") }}
        toolbar={<>
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
        </>}
      />
      {publishNoticeModal}
    </>
  );
};

export default GuidesPage;
