import CategoryPage from "../features/shared/category/CategoryPage";
import { useArchivedLists } from "../features/shared/category/useArchivedLists";
import { toListTopPicks } from "../features/shared/category/models";
import { createList } from "../features/shared/category/listWrites";
import type { NewListCreate } from "../features/shared/lists/NewListDialog";
import { NavigationStatus } from "../features/navigation/NavigationStatus";
import type { IntentAuthority } from "../features/navigation/categoryNavigationPolicy";
import { useCategoryNavigation } from "../features/navigation/CategoryNavigationProvider";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Recommendations from "../features/Favorites/components/Recommendations";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import LinksAndQR from "../features/Favorites/components/LinksAndQR";
import AddLocationModal from "../components/ui/AddLocationModal";
import { toast } from "sonner";
import { EarthLoader } from "../components/EarthLoader";
import HeroSkeleton from "../components/ui/HeroSkeleton";
import RecommendationCardSkeleton from "../components/ui/RecommendationCardSkeleton";
import { importPlaceCover } from "../features/Favorites/hooks/useCreateLocation";
import { usePlacesOwner } from "../features/Favorites/hooks/usePlacesOwner";
import { usePlacesCommands } from "../features/Favorites/api/placesCommands";
import { useMenuItems } from "../features/Favorites/hooks/useMenuItems";
import { KeyValuePair } from "../features/Favorites/components/RecommendForm";
import SwitchButton from "../components/ui/SwitchButton";
import useAuthStore from "../store/store";
import { useCityStore } from "../store/useCityStore";
import { IMAGE_CONFIG } from "../config";
import { useLocation, useSearchParams } from "react-router-dom";
import { PLACE_LIST_PARAM } from "../features/Favorites/placeListRoute";
import { CategoryVisibilityModal } from "../components/CategoryVisibilityModal";
import SEO from "../components/SEO";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import { useRecommendationsWalkthrough } from "../hooks/useRecommendationsWalkthrough";
import Joyride from "react-joyride";
import useSetupStore from "../store/useSetupStore";
import { calculateIsRecommendationsComplete } from "../utils/setupStatusCalculations";
import { ListVisibilityModal } from "../components/ListVisibilityModal";
import { useCanonicalAccount } from "../features/Profile/api/useCanonicalAccount";
import { keyboardActivation } from "../utils/keyboardActivation";
export interface Recommendation {
  title: string;
  image: string;
  rating: number;
  reviews: number;
}

export interface City {
  imageUrl: string;
  alt: string;
  recommendations: Recommendation[];
}

export interface selectedCity {
  account?: {
    documentId: string;
  };
  slug?: string;
  List_Name?: string;
  documentId?: string;
  Visibility?: boolean;
  createdAt?: string;
  is_pinned?: boolean;
  pin_order?: number;
  display_order?: number;
  List_Name_Details?: {
    note?: string;
  };
  Instagram_Media_URL?: string;
  recommended_places?: {
    documentId: string;
  }[];
  recommendations?: Recommendation[];
}

const FavoritesSkeleton = () => {
  return (
    <div className="bg-dashboard-bg min-h-screen max-w-6xl mx-auto px-4 pt-0 md:pt-4 pb-4 space-y-6">
      {/* Action bar skeleton */}
      <div className="hidden md:flex justify-between items-center bg-dashboard-sidebar/40 px-4 py-3.5 rounded-2xl border border-white/5">
        <div className="h-8 w-32 bg-white/5 rounded-xl skeleton-shimmer" />
        <div className="h-10 w-40 bg-white/10 rounded-xl skeleton-shimmer" />
      </div>

      {/* Featured list hero skeleton */}
      <HeroSkeleton accentColor="blue" variant="dashboard" showThumbnails />

      {/* Recommendations grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-6">
        <RecommendationCardSkeleton count={5} variant="dashboard" />
        {/* Plus card shimmer */}
        <div className="border-2 border-dashed border-dashboard-border rounded-[14px] h-[150px] skeleton-card" />
      </div>
    </div>
  );
};

const Favorites = memo(() => {
  const navigation = useCategoryNavigation();
  const categoryVisible = navigation.snapshot?.visibility.public_recommendations === "Yes";
  const { t } = useTranslation();
  const { selectedCity, setSelectedCity } = useCityStore();
  const location = useLocation();
  // OWN-05. The open list is in the URL; the city store follows it on entry and the URL
  // follows the store afterwards, so a return path that names the list lands on it.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedListId = searchParams.get(PLACE_LIST_PARAM);
  const appliedListParam = useRef<string | null | undefined>(undefined);
  // fetching the user details from the global state
  const { generation: sessionGeneration } = useAuthStore();
  const canonicalAccount = useCanonicalAccount();
  // The signed-in account, from the session. The owner reads below are scoped to it, so
  // there is nothing to look up by user id.
  const accountId = useAuthStore((state) => state.accountId);
  const accountById = accountId ? { accountId } : undefined;

  // local state for handling modal
  const [isLocationModalOpen, setIsLocationModalOpen] =
    useState<boolean>(false);
  // local state for handling active tab
  const [activeTab, setActiveTab] = useState<string>(
    t("dashboard.recommendations.recommendationsTab")
  );
  // Two-step flow states
  const [step, setStep] = useState<1 | 2>(1);
  const [isManageModalOpen, setIsManageModalOpen] = useState<boolean>(false);
  const [visibilityPrompt, setVisibilityPrompt] = useState<{
    isOpen: boolean;
    categoryName: string;
    visibilityField: string;
    origin?: IntentAuthority;
    defaultValue: boolean;
  } | null>(null);

  const [listVisibilityPrompt, setListVisibilityPrompt] = useState<{
    isOpen: boolean;
    listName: string;
    listDocumentId: string;
  } | null>(null);


  // Check if profile setup is complete
  const { isProfileComplete, isRecommendationsComplete, setSetupStatus } = useSetupStore();

  const cityRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  // local state for handling edit state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  // local state for handling the confirm delete modal
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] =
    useState<boolean>(false);
  const [deleteConfirmationText, setDeleteConfirmationText] =
    useState<string>("");
  // local state for handling the loading state for adding the list name
  const [isLoading] = useState<boolean>(false);
  // Ticket 5.1. The owner's Places lists come from the native owner API, which scopes
  // them to the signed-in account rather than filtering by an account id read from a
  // separate query.
  const placesOwner = usePlacesOwner(undefined, true, true);
  const archivedPlaces = useArchivedLists("places");
  const commands = usePlacesCommands();
  const cities = placesOwner.data;
  const loading = placesOwner.loading;
  const refetchCities = useCallback(async () => {
    placesOwner.refetch();
    return { data: placesOwner.data };
  }, [placesOwner]);

  useEffect(() => {
    if (!loading && accountById) {
      (window as any).__dashboardLoaded = true;
    }
  }, [loading, accountById]);

  useEffect(() => {
    const listId = location.state?.justAddedRecommendationToListId;
    if (listId && cities?.recommendationLists) {
      const targetList = cities.recommendationLists.find((l: any) => l.documentId === listId);
      if (targetList && !targetList.Visibility) {
        setListVisibilityPrompt({
          isOpen: true,
          listName: targetList.List_Name,
          listDocumentId: listId,
        });
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state, cities]);

  // // local state for handling current list displayed on the carousel
  // const [selectedCity, setSelectedCity] = useState<selectedCity>(
  //   recommendationLists// );

  /**
   * The list writes, mapped onto the native commands.
   *
   * Strapi carried Visibility, is_pinned, pin_order, List_Name, slug,
   * Instagram_Media_URL and List_Name_Details on one row, so one mutation set any of
   * them. Those are now separate decisions with separate commands, and this adapter keeps
   * the call sites unchanged while sending each part where it belongs.
   */
  const updateRecommendedList = useCallback(async (input: { variables: { documentId?: string; data: Record<string, unknown> } }) => {
    const id = input.variables.documentId;
    const data = input.variables.data;
    if (!id) throw new Error("A list id is required");
    const changesLocationMetadata = data.List_Name_Details !== undefined || data.Instagram_Media_URL !== undefined;
    // Capture the native details before the first metadata write. The legacy view
    // cannot represent entity identity or distinguish a null snapshot/name.
    const original = placesOwner.content?.lists.get(id);
    if (changesLocationMetadata && (!original || original.kind !== "collection" ||
      original.accountId !== accountId || original.generation !== sessionGeneration ||
      original.resourceId !== id || original.detail.id !== id ||
      original.detail.accountId !== accountId || original.detail.category !== "places" ||
      original.detail.archived || original.detail.placeLocation === undefined)) {
      throw new Error("Reload the original location before editing");
    }
    const originalLocation = original?.detail.placeLocation;

    if (data.Visibility !== undefined) {
      // Publishing a list publishes its places too, or the public list would be empty.
      const placeIds = (placesOwner.data?.recommendationLists?.find((list: any) => list.documentId === id)?.recommended_places ?? [])
        .map((place: any) => place.documentId);
      await commands.publishListWithPlaces(id, Boolean(data.Visibility), placeIds);
    }
    if (data.is_pinned !== undefined || data.pin_order !== undefined) {
      // is_pinned is "pin_order is set", so an unpin is an explicit null.
      const pinned = data.is_pinned === undefined ? true : Boolean(data.is_pinned);
      const position = typeof data.pin_order === "number" ? data.pin_order : null;
      await commands.setListPin(id, pinned ? position ?? 0 : null);
    }
    if (data.List_Name !== undefined || data.slug !== undefined) {
      await commands.updateList(id, {
        ...(data.List_Name === undefined ? {} : { title: String(data.List_Name) }),
        ...(data.slug === undefined ? {} : { slug: String(data.slug) }),
      });
    }
    if (changesLocationMetadata) {
      const details = (data.List_Name_Details ?? {}) as { note?: unknown; place_id?: unknown; location?: { latitude?: unknown; longitude?: unknown } | null };
      await commands.setLocation(id, {
        ...originalLocation!,
        instagramMediaUrl: typeof data.Instagram_Media_URL === "string" && data.Instagram_Media_URL ? data.Instagram_Media_URL : null,
      });
      // The list note is the collection's own description.
      if (details.note !== undefined) {
        await commands.updateList(id, { description: typeof details.note === "string" && details.note ? details.note : null });
      }
    }
    // The call sites only read back what they already sent, so the echo is enough.
    return { data: { updateRecommendationList: { ...data, documentId: id } as Record<string, any> } };
  }, [commands, placesOwner.content, placesOwner.data, accountId, sessionGeneration]);

  const handleVisibilityToggle = () => {
    const origin = navigation.authority;
    if (origin && !navigation.busy) void navigation.request({ category: "public_recommendations", action: categoryVisible ? "unpublish" : "publish" }, origin);
  };

  const handleCityVisibilityToggle = async () => {
    if (!selectedCity?.documentId) return;
    const currentValue = !!selectedCity.Visibility;
    const nextValue = !currentValue;

    const updateData: any = { Visibility: nextValue };
    if (!nextValue && selectedCity.is_pinned) {
      updateData.is_pinned = false;
      updateData.pin_order = null;
    }

    try {
      const response = await updateRecommendedList({
        variables: {
          documentId: selectedCity.documentId,
          data: updateData,
        },
      });

      if (response.data?.updateRecommendationList) {
        const updatedData = response.data.updateRecommendationList;
        setSelectedCity({
          ...selectedCity,
          Visibility: updatedData.Visibility,
          is_pinned: updatedData.is_pinned,
          pin_order: updatedData.pin_order,
        });
      }

      await refetchCities();
      toast.success(t(nextValue ? "dashboard.categoryPages.listNowPublic" : "dashboard.categoryPages.listNowDraft", { name: selectedCity.List_Name }));
    } catch (error) {
      console.error("Error updating list visibility:", error);
      toast.error("Failed to update visibility");
    }
  };

  useEffect(() => {
    if (selectedCity?.documentId) {
      setTimeout(() => {
        const selectedRef = cityRefs.current[selectedCity.documentId ?? ""];
        if (selectedRef) {
          selectedRef.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
          });
        }
      }, 100);
    }
  }, [selectedCity]);

  // Sync setup status with store
  const currentIsRecommendationsComplete = useMemo(() => {
    return calculateIsRecommendationsComplete(cities?.recommendationLists);
  }, [cities]);

  useEffect(() => {
    // Only update if we have data and it's different from store
    if (cities?.recommendationLists && currentIsRecommendationsComplete !== isRecommendationsComplete) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Syncing recommendations completion status:', currentIsRecommendationsComplete);
      }
      if (canonicalAccount.data) setSetupStatus(canonicalAccount.data.onboardingStatus === "complete",
        currentIsRecommendationsComplete, canonicalAccount.data.id, sessionGeneration);
    }
  }, [currentIsRecommendationsComplete, isRecommendationsComplete, canonicalAccount.data, setSetupStatus, cities, sessionGeneration]);


  // Track route changes for better modal detection

  // Track if place modal/page is open (when navigating to /new route)
  const [isPlaceModalOpen, setIsPlaceModalOpen] = useState(false);

  // Prepare recommendations data for walkthrough
  const recommendationsData = useMemo(() => {
    const hasPlaces = selectedCity?.recommended_places && selectedCity.recommended_places.length > 0;
    const isPublished = selectedCity?.Visibility === true;

    return {
      hasPlaces,
      isPublished,
    };
  }, [selectedCity]);

  // Initialize walkthrough hook
  const {
    run,
    steps,
    stepIndex,
    setRun,
    setStepIndex,
    handleJoyrideCallback,
    advanceToNextStep,
    markProcessingComplete,
    isWalkthroughComplete,
  } = useRecommendationsWalkthrough(
    recommendationsData,
    isPlaceModalOpen,
    (tabName: string) => {
      setActiveTab(tabName);
      if (tabName === t("dashboard.recommendations.manageTab")) {
        refetchCities();
      }
    },
    t("dashboard.recommendations.manageTab")
  );

  // Expose walkthrough control globally for other components
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__walkthrough = {
        advanceToNextStepRef: { current: advanceToNextStep },
        markProcessingCompleteRef: markProcessingComplete,
      };
      return () => {
        delete (window as any).__walkthrough;
      };
    }
  }, [advanceToNextStep, markProcessingComplete]);

  // Resume walkthrough after Manage tab navigation (actual-action flow only)
  useEffect(() => {
    // Only run when Manage tab becomes active
    if (activeTab !== t("dashboard.recommendations.manageTab")) {
      return;
    }

    // Check if walkthrough was paused at step 4 (index 3) or ready for step 5 (index 4)
    // This happens when user clicks Manage tab - advanceToNextStep sets stepIndex to 4 and pauses
    const savedStep = sessionStorage.getItem('recommendationStep');
    const isPausedAtStep4Or5 = (stepIndex === 3 || stepIndex === 4) && !run && !isWalkthroughComplete;
    const savedStepIndicatesStep4 = savedStep === '3' || savedStep === '4';

    if (isPausedAtStep4Or5 && savedStepIndicatesStep4) {
      console.log("🔄 Detected Manage tab active with paused walkthrough - resuming to step 5");

      // Helper to get completed steps
      const getCompletedSteps = (): number[] => {
        try {
          const completed = sessionStorage.getItem('recommendationCompletedSteps');
          if (completed) {
            const parsed = JSON.parse(completed);
            return Array.isArray(parsed) ? parsed.filter((s: any) => typeof s === 'number' && !isNaN(s)) : [];
          }
        } catch (e) {
          console.warn('Failed to parse completed steps:', e);
        }
        return [];
      };

      // Helper to save completed steps
      const saveCompletedSteps = (completedSteps: number[]): void => {
        try {
          sessionStorage.setItem('recommendationCompletedSteps', JSON.stringify(completedSteps));
          console.log('💾 Saved completed steps:', completedSteps);
        } catch (e) {
          console.warn('Failed to save completed steps:', e);
        }
      };

      // Helper to find first incomplete step
      const findFirstIncompleteStep = (): number => {
        const completedSteps = getCompletedSteps();
        const firstIncomplete = steps.findIndex((_, index) => !completedSteps.includes(index));
        return firstIncomplete !== -1 ? firstIncomplete : steps.length;
      };

      // Mark step 4 (index 3) as completed if not already marked
      const completedSteps = getCompletedSteps();
      if (!completedSteps.includes(3)) {
        completedSteps.push(3);
        saveCompletedSteps(completedSteps);
        console.log('✅ Marked step 4 as completed');
      }

      // Find next incomplete step (should be step 5, index 4)
      const nextStep = findFirstIncompleteStep();
      console.log(`➡️ Next incomplete step: ${nextStep}`);

      if (nextStep < steps.length && nextStep === 4) {
        // Resume walkthrough at step 5 (index 4)
        setStepIndex(4);
        sessionStorage.setItem('recommendationStep', '4');
        console.log(`▶️ Resuming walkthrough at step 5 (index 4) - adding 2s delay for real-action mode`);

        // Add 2-second delay for real-action Step 5 tooltip (preview mode unaffected)
        setTimeout(() => {
          setRun(true);
        }, 2000);
      } else if (nextStep >= steps.length) {
        console.log('🎉 All steps completed');
      } else {
        console.log(`⚠️ Unexpected next step: ${nextStep}, expected 4`);
      }
    }
  }, [activeTab, stepIndex, run, isWalkthroughComplete, steps, setStepIndex, setRun, t]);

  // custom hook for handling the carousel menu logic (after walkthrough hook to access advanceToNextStep)
  const { handleDeleteRecommendedList } = useMenuItems({
    refetchCities,
    setShowConfirmDeleteModal,
    advanceToNextStep,
  });

  // The shared New list popup creates the list; Places first imports the first Google photo as its cover.
  const placesCreate: NewListCreate = async (input, place) => {
    const cover = place?.place_id ? await importPlaceCover(place.place_id, commands.importPlacePhoto) : { coverMediaId: undefined, coverImportFailed: false };
    const created = await createList({ ...input, ...(cover.coverMediaId ? { coverMediaId: cover.coverMediaId } : {}) });
    if (cover.coverImportFailed) toast.error(t("dashboard.recommendations.toastMessages.listCoverImportFailed"));
    return created;
  };
  // Open directly into the new list's detail view (BUG-3 parity with Movies), on the
  // Recommendations tab where the add-place affordance lives.
  const openCreatedList = async (id: string) => {
    const refreshed = (await refetchCities()) as { data?: { recommendationLists?: selectedCity[] } } | undefined;
    const created = refreshed?.data?.recommendationLists?.find((list) => list.documentId === id);
    setSelectedCity(created ?? ({ documentId: id } as selectedCity));
    // The refresh is asynchronous: until the owner read carries the new list, the selection is a stub.
    pendingCreatedList.current = created ? null : id;
    setActiveTab(t("dashboard.recommendations.recommendationsTab"));
    setStep(2);
  };
  const pendingCreatedList = useRef<string | null>(null);
  useEffect(() => {
    const pending = pendingCreatedList.current;
    const created = pending ? cities?.recommendationLists?.find((list: any) => list.documentId === pending) : undefined;
    if (created) { pendingCreatedList.current = null; setSelectedCity(created as unknown as selectedCity); }
  }, [cities, setSelectedCity]);
  const placeCards = useMemo(() => [...((cities?.recommendationLists as any[]) ?? [])]
    .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((city: any) => ({ id: city.documentId, title: city.List_Name ?? "", status: city.Visibility ? ("public" as const) : ("draft" as const),
      itemCount: city.recommended_places?.length ?? 0, pinnedCount: 0, covers: city.List_Name_Details?.thumbnail ? [city.List_Name_Details.thumbnail] : [] })), [cities]);
  const cityPick = { title: (c: any) => c.List_Name ?? "", image: (c: any) => c.List_Name_Details?.thumbnail ?? null, isPublic: (c: any) => Boolean(c.Visibility) };

  useEffect(() => {
    const lists = cities?.recommendationLists;
    if (!lists?.length) return;
    // A new ?list= (entry, or a return path) wins once over whatever the store holds.
    if (requestedListId !== appliedListParam.current) {
      appliedListParam.current = requestedListId;
      const requested = requestedListId ? lists.find((list: any) => list.documentId === requestedListId) : undefined;
      if (requested) {
        if (selectedCity?.documentId !== requested.documentId) setSelectedCity(requested as unknown as selectedCity);
        return;
      }
    }
    // The first list only when nothing names one.
    if (!selectedCity) {
      setSelectedCity(lists[0] as unknown as selectedCity);
      return;
    }
    // Afterwards the URL follows the selection (city carousel, a newly created list).
    if (selectedCity.documentId && selectedCity.documentId !== requestedListId) {
      appliedListParam.current = selectedCity.documentId;
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set(PLACE_LIST_PARAM, selectedCity.documentId!);
        return next;
      }, { replace: true, state: location.state });
    }
  }, [cities, selectedCity, requestedListId, setSelectedCity, setSearchParams, location.state]);

  // filtering and sorting the cities based on pinning/display_order
  const filteredCities = useMemo(() => {
    // The owner read is already scoped to the signed-in account, so there is nothing to
    // filter by - and no account id on the row to filter with.
    const lists = cities?.recommendationLists ?? [];

    // Sort: Pinned items first (by pin_order), then unpinned items (by display_order)
    return [...lists].sort((a: any, b: any) => {
      // Pinned status comparison
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;

      if (a.is_pinned && b.is_pinned) {
        // Both pinned: sort by pin_order (nulls/undefined at the end)
        const orderA = a.pin_order !== null && a.pin_order !== undefined ? a.pin_order : Infinity;
        const orderB = b.pin_order !== null && b.pin_order !== undefined ? b.pin_order : Infinity;
        if (orderA !== orderB) return orderA - orderB;
      } else {
        // Both unpinned: sort by display_order (nulls/undefined at the end)
        const orderA = a.display_order !== null && a.display_order !== undefined ? a.display_order : Infinity;
        const orderB = b.display_order !== null && b.display_order !== undefined ? b.display_order : Infinity;
        if (orderA !== orderB) return orderA - orderB;
      }

      // Fallback: sort by createdAt
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateA - dateB;
    });
  }, [cities]);

  const pinnedCities = useMemo(() => {
    return filteredCities.filter((city: any) => city.is_pinned);
  }, [filteredCities]);

  const unpinnedCities = useMemo(() => {
    return filteredCities.filter((city: any) => !city.is_pinned);
  }, [filteredCities]);

  
  // Auto-advance step if tour is running
  useEffect(() => {
    if (location.state?.startTour && filteredCities.length > 0) {
      setStep(2);
    }
  }, [location.state?.startTour, filteredCities]);


  // Track route changes for better modal detection - AFTER walkthrough hook initialization
  useEffect(() => {
    const isOnAddPlaceRoute = location.pathname.includes('/new');
    const wasOnAddPlaceRoute = isPlaceModalOpen;
    setIsPlaceModalOpen(isOnAddPlaceRoute);

    // Save stepIndex to sessionStorage when navigating TO /new route (pausing)
    if (isOnAddPlaceRoute && !wasOnAddPlaceRoute && run && stepIndex >= 0) {
      console.log(`💾 Saving walkthrough state before route change: step ${stepIndex}`);
      sessionStorage.setItem('recommendations_walkthrough_step_index', String(stepIndex));
    }

    // Restore walkthrough when returning FROM /new route (resuming)
    // CRITICAL: Don't restore if profile setup is already complete
    if (!isOnAddPlaceRoute && wasOnAddPlaceRoute && !run && !isWalkthroughComplete) {
      // Check if profile setup is complete - if so, don't restore walkthrough
      if (isProfileComplete && isRecommendationsComplete) {
        console.log('⏭️ Skipping walkthrough restore - profile setup is already complete');
        // Clear any saved walkthrough state
        sessionStorage.removeItem('recommendations_walkthrough_step_index');
        return;
      }

      const savedStepIndex = sessionStorage.getItem('recommendations_walkthrough_step_index');
      if (savedStepIndex !== null) {
        const index = parseInt(savedStepIndex, 10);
        if (!isNaN(index) && index >= 0 && index < steps.length) {
          console.log(`🔄 Restoring walkthrough after route change: step ${index}`);
          setTimeout(() => {
            setStepIndex(index);
            setRun(true);
          }, 500);
        }
      }
    }
  }, [location.pathname, run, stepIndex, steps.length, isWalkthroughComplete, isPlaceModalOpen, setStepIndex, setRun, isProfileComplete, isRecommendationsComplete]);

  // Debug logging for walkthrough state
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('📋 Recommendations Walkthrough Debug:', {
        run,
        stepsCount: steps.length,
        stepIndex,
        recommendationsData,
        steps: steps.map(s => ({
          target: s.target,
          content: typeof s.content === 'string' ? s.content.substring(0, 50) : String(s.content || '').substring(0, 50)
        })),
      });
    }
  }, [run, steps, stepIndex, recommendationsData]);
  // NEW useEffect #1: Auto-advance after place is added
  // CRITICAL: Detect when place count increases (place was added)
  // This effect watches for changes in selectedCity.recommended_places to detect new place additions


  // Note: Auto-advancement is handled by useRecommendationsWalkthrough hook
  // No need for duplicate logic here
  // MANUAL RESURRECTION: Auto-resume walkthrough after place is added - Step 1 to Step 2 (INSTANTANEOUS)

  // Auto-advance after publish toggle - Step 3 to Step 4 (INSTANTANEOUS)

  const handleCitySelect = (index: {
    List_Name?: string;
    imageUrl?: string;
    documentId?: string;
  }) => {
    setSelectedCity(index);
  };

  const handleConfirmDeleteModal = () => {
    setShowConfirmDeleteModal(true);
    setDeleteConfirmationText("");
  };

  const handleModalPinToggle = async (city: any, nextPinnedValue: boolean) => {
    const docId = city.documentId;
    if (!docId) return;

    if (nextPinnedValue && !city.Visibility) {
      toast.error("Only published locations can be pinned");
      return;
    }

    let pinOrder = null;
    if (nextPinnedValue) {
      const maxPinOrder = pinnedCities.reduce((max: number, c: any) => {
        const po = c.pin_order || 0;
        return po > max ? po : max;
      }, 0);
      pinOrder = maxPinOrder + 1;
    }

    try {
      await updateRecommendedList({
        variables: {
          documentId: docId,
          data: {
            is_pinned: nextPinnedValue,
            pin_order: pinOrder,
          },
        },
      });
      await refetchCities();
      toast.success(`${city.List_Name} ${nextPinnedValue ? "pinned" : "unpinned"}`);
    } catch (error) {
      console.error("Error updating pin state:", error);
      toast.error("Failed to update pin state");
    }
  };

  const handleSwapPinOrder = async (cityA: any, cityB: any) => {
    if (!cityA || !cityB) return;
    const tempOrder = cityA.pin_order || 0;
    const nextOrder = cityB.pin_order || 0;

    try {
      await updateRecommendedList({
        variables: {
          documentId: cityA.documentId,
          data: { pin_order: nextOrder },
        },
      });
      await updateRecommendedList({
        variables: {
          documentId: cityB.documentId,
          data: { pin_order: tempOrder },
        },
      });
      await refetchCities();
      toast.success("Order updated");
    } catch (error) {
      console.error("Error swapping order:", error);
      toast.error("Failed to update order");
    }
  };

  // tabs with data
  const tabs = {
    [t("dashboard.recommendations.recommendationsTab")]: <Recommendations refetchCities={refetchCities} />,
    [t("dashboard.recommendations.manageTab")]: (
      <LinksAndQR
        refetchCities={refetchCities}
        setIsEditing={setIsEditing}
        setShowConfirmDeleteModal={setShowConfirmDeleteModal}
        setIsLocationModalOpen={setIsLocationModalOpen}
        handleConfirmDeleteModal={handleConfirmDeleteModal}
      />
    ),
  };

  const handleUpdateRecommendedList = async (
    values: KeyValuePair
  ): Promise<boolean> => {
    if (
      values.placeUrl !== selectedCity?.slug &&
      (cities?.recommendationLists ?? []).some(
        (list) => list.slug === values.placeUrl
      )
    ) {
      toast.error(t("toast.error.conflictError"));
      return false;
    }

    try {
      // Editing metadata preserves the selected location and its owned thumbnail.
      const details = selectedCity?.List_Name_Details;
      const storedDetails = typeof details === 'string' ? JSON.parse(details) : details;
      const response = await updateRecommendedList({
        variables: {
          documentId: selectedCity?.documentId,
          data: {
            Instagram_Media_URL: values.recommendationSocialLink,
            List_Name: selectedCity?.List_Name,
            List_Name_Details: {
              ...storedDetails,
              note: values.note,
            },
            slug: values.placeUrl,
          },
        },
      });

      if (response.data) {
        // Show success toast first
        toast.success(t("toast.success.recommendedListUpdated"));

        // Update selectedCity immediately with the response data to ensure UI reflects changes
        if (response.data.updateRecommendationList) {
          const updatedData = response.data.updateRecommendationList;
          setSelectedCity({
            ...selectedCity,
            List_Name: updatedData.List_Name,
            Instagram_Media_URL: updatedData.Instagram_Media_URL,
            List_Name_Details: updatedData.List_Name_Details,
            slug: updatedData.slug,
            Visibility: updatedData.Visibility,
          });
        }

        // Best-effort cache refresh — a refetch failure AFTER a successful
        // update must NOT report failure (that would keep the modal open and
        // invite a duplicate write).
        try {
          await refetchCities();
        } catch (refetchError) {
          console.warn("Failed to refetch cities after update:", refetchError);
        }

        // The modal closes itself on success (ok === true); also reset edit mode.
        setIsEditing(false);
        return true;
      }
      // No data returned — treat as failure so the modal stays open.
      toast.error(t("toast.error.recommendedListUpdateFailed"));
      return false;
    } catch (error) {
      console.error("Failed to update recommendation list:", error);
      toast.error(t("toast.error.recommendedListUpdateFailed"));
      return false;
    }
  };

  if (isLoading) {
    if ((window as any).__dashboardLoaded) {
      return <FavoritesSkeleton />;
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-dashboard-bg">
        <EarthLoader context="recommendations" size="default" />
      </div>
    );
  }

  return (
    <>
      <SEO
        title="My Recommendations - Manage & Share explorers Favorites"
        description="Manage your local recommendations and favorite places with explorers. Create, edit and share personalized QR code lists to connect with your community and discover new spots."
        keywords={[
          "manage local recommendations",
          "explorers favorites",
          "recommendations dashboard",
          "QR code recommendation lists",
          "favorite places management",
          "share local places",
          "personalized location lists",
          "curated recommendations",
          "local places organizer",
          "location-based recommendations",
          "travel recommendations management",
          "user-generated recommendations",
          "share QR code lists",
          "discover favorite spots",
          t("dashboard.recommendations.seo.keywords.recommendationManagementDashboard"),
          t("dashboard.recommendations.seo.keywords.recommendationsManagement"),
          t("dashboard.recommendations.seo.keywords.manageRecommendations"),
          t("dashboard.recommendations.seo.keywords.favoritePlaces"),
          t("dashboard.recommendations.seo.keywords.recommendationDashboard"),
          t("dashboard.recommendations.seo.keywords.localRecommendations"),
          t("dashboard.recommendations.seo.keywords.locationLists"),
        ]}
        canonical={createCanonicalUrl("/recommendations")}
        type="website"
        noIndex={true}
      />

      <div className="bg-dashboard-bg">
        <NavigationStatus navigation={navigation} />
        {/* The category branch brings its own DashboardPageContainer, so this wrapper adds no width or padding to it. */}
        <div className={`bg-dashboard-bg min-h-screen ${((loading && !cities) || !accountById) || (step === 2 && placeCards.length > 0) ? "max-w-6xl mx-auto px-4 pt-0 md:pt-4 pb-4" : ""}`}>
          {/* OWN-06. Only a cold load replaces the page; a refresh keeps the last read. */}
          {((loading && !cities) || !accountById) ? (
            <div className="flex items-center justify-center min-h-screen">
              <EarthLoader context="recommendations" size="default" />
            </div>
          ) : step === 2 && placeCards.length > 0 ? (
            <div id="step-2-list-details" className="pt-2">
              {/* Navigation Header */}
              <div className="flex justify-between items-center mb-4 w-full">
                <div className="flex flex-col items-start">
                  <div
                    {...keyboardActivation(() => setStep(1))}
                    className="text-[10px] text-white/55 font-semibold cursor-pointer flex items-center gap-1 mb-1 hover:text-white transition-colors"
                  >
                    <svg className="w-1.5 h-1.5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </div>
                  <span id="detail-city-name" className="text-lg font-black text-white leading-tight">
                    {selectedCity?.List_Name}
                  </span>
                </div>
                
                {/* Published Toggle Switch */}
                <div className="flex items-center gap-2" data-walkthrough="togglePublish">
                  <span className={`text-[10px] font-semibold uppercase ${selectedCity?.Visibility ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                    {selectedCity?.Visibility ? t("dashboard.home.published") : t("dashboard.home.draft")}
                  </span>
                  <SwitchButton
                    isChecked={selectedCity?.Visibility || false}
                    onChange={handleCityVisibilityToggle}
                    variant="green"
                    disabled={!selectedCity?.recommended_places?.length}
                  />
                </div>
              </div>

              {/* Tab Switcher Pill */}
              <div className="flex items-center bg-dashboard-muted border border-dashboard font-poppins rounded-[24px] mx-auto w-fit p-1 mb-4">
                <button
                  onClick={() => setActiveTab(t("dashboard.recommendations.recommendationsTab"))}
                  className={`px-4 py-1.5 text-xs font-semibold transition-all duration-200 whitespace-nowrap rounded-[20px] ${
                    activeTab === t("dashboard.recommendations.recommendationsTab")
                      ? "bg-dashboard-accent text-[var(--dash-accent-text)] shadow-sm font-bold"
                      : "bg-transparent text-dashboard-muted hover:text-dashboard"
                  }`}
                >
                  Recommendations
                </button>
                <button
                  onClick={() => setActiveTab(t("dashboard.recommendations.manageTab"))}
                  className={`px-4 py-1.5 text-xs font-semibold transition-all duration-200 whitespace-nowrap rounded-[20px] ${
                    activeTab === t("dashboard.recommendations.manageTab")
                      ? "bg-dashboard-accent text-[var(--dash-accent-text)] shadow-sm font-bold"
                      : "bg-transparent text-dashboard-muted hover:text-dashboard"
                  }`}
                  data-walkthrough="manage-tab"
                >
                  Manage
                </button>
              </div>

              {/* Active Tab Content */}
              <div>
                {activeTab === t("dashboard.recommendations.recommendationsTab") ? (
                  tabs[t("dashboard.recommendations.recommendationsTab")]
                ) : (
                  tabs[t("dashboard.recommendations.manageTab")]
                )}
              </div>
            </div>
          ) : (
            <CategoryPage
              category="places"
              status={{ loading: loading || !accountById, error: placesOwner.error ?? null, refreshing: loading && placeCards.length > 0 }}
              lists={placeCards}
              archivedLists={archivedPlaces.lists}
              topPicks={toListTopPicks((cities?.recommendationLists as any[]) ?? [], cityPick)}
              pinCandidates={toListTopPicks((cities?.recommendationLists as any[]) ?? [], cityPick, false)}
              categoryVisibility={categoryVisible ? "public" : "hidden"}
              visibilityBusy={navigation.busy || !navigation.authority}
              onCategoryVisibility={() => handleVisibilityToggle()}
              onOpenList={(id) => { const city = filteredCities.find((c: any) => c.documentId === id); if (city) { handleCitySelect(city); setStep(2); } }}
              onRetry={() => { void refetchCities(); }}
              onChanged={() => { void refetchCities(); archivedPlaces.reload(); }}
              newList={{ kind: "dialog", username: canonicalAccount.data?.handle ?? "", onCreated: (id) => { void openCreatedList(id); }, create: placesCreate }}
            />
          )}
        </div>
        {showConfirmDeleteModal && (
          <Modal
            isOpen={showConfirmDeleteModal}
            onClose={() => {
              setShowConfirmDeleteModal(false);
              setDeleteConfirmationText("");
            }}
          >
            <div className="dashboard-theme p-6">
              <h2 className="dt-heading mb-4">{t("dashboard.recommendations.confirmDeletion")}</h2>
              <p className="dt-text mb-2">
                {t("dashboard.recommendations.deleteListConfirmation")}{" "}
                <b className="text-dashboard-danger">
                  {selectedCity?.recommended_places?.length}
                </b>{" "}
                {t("dashboard.recommendations.deleteListConfirmationPlaces")}
              </p>
              <p className="dt-text mb-4">
                {t("dashboard.recommendations.deleteListConfirmationType")}{" "}
                <span className="text-dashboard-danger font-semibold">
                  {t("dashboard.recommendations.deleteListConfirmationDelete")}
                </span>{" "}
                {t("dashboard.recommendations.deleteListConfirmationBelow")}
              </p>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder={t("dashboard.recommendations.typeDeleteToConfirm")}
                className="w-full dt-input mb-6"
              />
              <div className="flex justify-end gap-3">
                <Button
                  btnText={t("dashboard.recommendations.cancel")}
                  onClickHandler={() => {
                    setShowConfirmDeleteModal(false);
                    setDeleteConfirmationText("");
                  }}
                  size="small"
                  variant="google"
                />
                <Button
                  btnText={t("dashboard.recommendations.confirm")}
                  onClickHandler={() => {
                    if (deleteConfirmationText.toLowerCase() === "delete") {
                      handleDeleteRecommendedList();
                      setDeleteConfirmationText("");
                    }
                  }}
                  size="small"
                  variant="danger"
                  disabled={deleteConfirmationText.toLowerCase() !== "delete"}
                />
              </div>
            </div>
          </Modal>
        )}
        {isEditing && (
          <AddLocationModal
            isOpen={isLocationModalOpen}
            onClose={() => {
              setIsLocationModalOpen(false);
              setIsEditing(false);
            }}
            onSubmit={handleUpdateRecommendedList}
            isEditing={isEditing}
            initialValues={
              isEditing
                ? {
                  documentId: selectedCity?.documentId,
                  listName: selectedCity?.List_Name || "",
                  recommendationSocialLink:
                    selectedCity?.Instagram_Media_URL || "",
                  note: selectedCity?.List_Name_Details?.note || "",
                  placeUrl: selectedCity?.slug || "",
                  placeId: (() => {
                    // Extract place_id from List_Name_Details
                    if (selectedCity?.List_Name_Details) {
                      try {
                        const details = typeof selectedCity.List_Name_Details === 'string'
                          ? JSON.parse(selectedCity.List_Name_Details)
                          : selectedCity.List_Name_Details;
                        return (details as any)?.place_id || null;
                      } catch (e) {
                        return (selectedCity.List_Name_Details as any)?.place_id || null;
                      }
                    }
                    return null;
                  })(),
                }
                : {}
            }
            existingPlaces={cities?.recommendationLists || []}
          />
        )}

        {isManageModalOpen && (
          <Modal
            isOpen={isManageModalOpen}
            onClose={() => setIsManageModalOpen(false)}
          >
            <div className="p-6 max-h-[80vh] overflow-y-auto font-poppins text-white">
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2 text-white">
                <span className="text-amber-400">★</span> {t("dashboard.categoryPages.manageTopPicks")}
              </h2>
              <p className="text-xs text-white/50 mb-6">
                Pin up to 5 locations as Top Picks and reorder them to customize the hero slideshow on your profile.
              </p>

              {/* Pinned Locations Section */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>Pinned ({pinnedCities.length})</span>
                  {pinnedCities.length > 0 && <span className="text-[10px] text-white/40 normal-case">Use arrows to change order</span>}
                </h3>

                {pinnedCities.length === 0 ? (
                  <div className="border border-dashed border-white/10 rounded-xl p-4 text-center text-xs text-white/40">
                    No pinned locations. Pin a location below to feature it.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {pinnedCities.map((city: any, index: number) => {
                      return (
                        <div
                          key={city.documentId || index}
                          className="flex items-center justify-between bg-white/5 border border-white/10 p-3 rounded-xl hover:border-white/20 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Small thumbnail */}
                            <div className="w-8 h-8 rounded bg-white/10 overflow-hidden flex-shrink-0">
                              <img
                                src={city.List_Name_Details?.thumbnail || IMAGE_CONFIG.defaultImages.place}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="text-xs font-bold text-white truncate">{city.List_Name}</span>
                          </div>

                          {/* Action controls */}
                          <div className="flex items-center gap-2">
                            {/* Reordering Buttons */}
                            <div className="flex items-center gap-1 border-r border-white/10 pr-2">
                              <button
                                onClick={() => {
                                  if (index > 0) {
                                    handleSwapPinOrder(city, pinnedCities[index - 1]);
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
                                  if (index < pinnedCities.length - 1) {
                                    handleSwapPinOrder(city, pinnedCities[index + 1]);
                                  }
                                }}
                                disabled={index === pinnedCities.length - 1}
                                className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors border-none cursor-pointer"
                                title="Move Down"
                              >
                                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                              </button>
                            </div>

                            {/* Unpin action button */}
                            <button
                              onClick={() => handleModalPinToggle(city, false)}
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

              {/* Unpinned/All Locations Section */}
              <div>
                <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-3">
                  All Locations ({unpinnedCities.length})
                </h3>

                {unpinnedCities.length === 0 ? (
                  <div className="border border-dashed border-white/10 rounded-xl p-4 text-center text-xs text-white/40">
                    No unpinned locations.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-1">
                    {unpinnedCities.map((city: any, index: number) => {
                      return (
                        <div
                          key={city.documentId || index}
                          className="flex items-center justify-between bg-white/5 border border-white/5 p-3 rounded-xl hover:border-white/15 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Small thumbnail */}
                            <div className="w-8 h-8 rounded bg-white/10 overflow-hidden flex-shrink-0">
                              <img
                                src={city.List_Name_Details?.thumbnail || IMAGE_CONFIG.defaultImages.place}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="text-xs font-bold text-white/80 truncate">{city.List_Name}</span>
                          </div>

                          {/* Pin action button */}
                          <button
                            onClick={() => {
                              if (!city.Visibility) {
                                toast.error("Only published locations can be pinned");
                                return;
                              }
                              handleModalPinToggle(city, true);
                            }}
                            disabled={!city.Visibility}
                            className="text-xs bg-white/5 text-white/70 hover:bg-white/15 px-2.5 py-1.5 rounded-lg font-bold border border-white/10 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={!city.Visibility ? "Only published locations can be pinned" : "Pin to Top Picks"}
                          >
                            <svg className="w-3 h-3 text-white/55" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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

              {/* Close Button */}
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

        {/* ⭐ Walkthrough Joyride Component - Moved here so it persists across tab switches */}
        <style>{`
          .react-joyride__tooltip,
          .react-joyride__tooltip > div {
            background-color: var(--dash-sidebar-bg) !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
            border: 1px solid var(--dash-border) !important;
          }
          .react-joyride__tooltip button[data-action="next"],
          .react-joyride__tooltip button[data-action="primary"],
          .react-joyride__tooltip button[data-action="last"] {
            background-color: var(--dash-accent) !important;
            background: #3498DB !important;
            border-radius: 10px !important;
            border: none !important;
            color: white !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            padding: 10px 20px !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 20px rgba(52, 152, 219, 0.5) !important;
            outline: none !important;
            transition: all 0.2s ease !important;
            cursor: pointer !important;
            display: inline-block !important;
          }
          .react-joyride__tooltip button[data-action="next"]:hover,
          .react-joyride__tooltip button[data-action="primary"]:hover,
          .react-joyride__tooltip button[data-action="last"]:hover {
            background-color: #2980B9 !important;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4), 0 0 25px rgba(52, 152, 219, 0.6) !important;
            transform: translateY(-1px) !important;
          }
        `}</style>
        <Joyride
          run={run}
          steps={steps}
          stepIndex={stepIndex}
          callback={handleJoyrideCallback}
          key={`joyride-${stepIndex}-${run}`}
          continuous={true}
          showProgress={true}
          showSkipButton={true}
          spotlightClicks={true}
          disableOverlay={false}
          scrollToFirstStep={true}
          locale={{
            last: "Finish",
          }}
          styles={{
            options: {
              zIndex: 99999,
              primaryColor: "var(--dash-accent)",
              backgroundColor: "transparent",
              textColor: "white",
            },
            tooltip: {
              backgroundColor: "var(--dash-sidebar-bg) !important",
              backdropFilter: "blur(12px) !important",
              WebkitBackdropFilter: "blur(12px) !important",
              borderRadius: "12px",
              border: "1px solid var(--dash-border) !important",
              boxShadow: "0 6px 25px rgba(0,0,0,0.55)",
              padding: "20px",
              color: "white",
              maxWidth: "320px",
              width: "auto",
              minWidth: "200px",
            },
            tooltipContainer: {
              backgroundColor: "var(--dash-sidebar-bg) !important",
              backdropFilter: "blur(12px) !important",
              WebkitBackdropFilter: "blur(12px) !important",
              color: "white",
            },
            tooltipContent: {
              backgroundColor: "transparent !important",
              color: "white",
              padding: "0",
              paddingBottom: "10px",
            },
            buttonNext: {
              backgroundColor: "#3498DB !important",
              borderRadius: "10px !important",
              border: "none !important",
              color: "white !important",
              fontSize: "14px !important",
              fontWeight: "600 !important",
              padding: "10px 20px !important",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3), 0 0 20px rgba(52, 152, 219, 0.5) !important",
              outline: "none !important",
              transition: "all 0.2s ease !important",
              cursor: "pointer !important",
              display: "inline-block !important",
            },
            buttonBack: {
              color: "white",
              fontSize: "14px",
              marginRight: "10px",
            },
            buttonSkip: {
              color: "rgba(255,255,255,0.7)",
              fontSize: "14px",
            },
            buttonClose: {
              display: "none",
            },
          }}
          disableScrolling={false}
          spotlightPadding={5}
          floaterProps={{
            disableAnimation: false,
            styles: {
              floater: {
                maxWidth: '300px',
              },
            },
          }}
        />
        {visibilityPrompt && (
          <CategoryVisibilityModal
            isOpen={visibilityPrompt.isOpen}
            onClose={() => setVisibilityPrompt(null)}
            categoryName={visibilityPrompt.categoryName}
            visibilityField={visibilityPrompt.visibilityField} origin={visibilityPrompt.origin}
            accountDocumentId={visibilityPrompt.origin?.accountDocumentId ?? ""}
            onSuccess={() => {
              refetchCities();
            }}
          />
        )}
        {listVisibilityPrompt && (
          <ListVisibilityModal
            isOpen={listVisibilityPrompt.isOpen}
            onClose={() => setListVisibilityPrompt(null)}
            listName={listVisibilityPrompt.listName}
            categoryName="Places"
            onConfirm={async () => {
              try {
                await updateRecommendedList({
                  variables: {
                    documentId: listVisibilityPrompt.listDocumentId,
                    data: { Visibility: true },
                  },
                });
                await refetchCities();
                toast.success(`"${listVisibilityPrompt.listName}" list published!`);
              } catch (err) {
                console.error(err);
                toast.error("Failed to publish list.");
              }
            }}
          />
        )}
      </div>
    </>
  );
});

export default Favorites;
