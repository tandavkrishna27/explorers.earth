import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Recommendations from "../features/Favorites/components/Recommendations";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import { AddIcon } from "../assets/icons/AddIcon";
import LinksAndQR from "../features/Favorites/components/LinksAndQR";
import AddLocationModal from "../components/ui/AddLocationModal";
import { useMutation, useQuery } from "@apollo/client";
import { toast } from "sonner";
import {
  accountDataQuery,
  recommendationListQuery,
} from "../features/Favorites/api/query";
import { EarthLoader } from "../components/EarthLoader";
import HeroSkeleton from "../components/ui/HeroSkeleton";
import RecommendationCardSkeleton from "../components/ui/RecommendationCardSkeleton";
import { useCreateLocation } from "../features/Favorites/hooks/useCreateLocation";
import { useMenuItems } from "../features/Favorites/hooks/useMenuItems";
import { KeyValuePair } from "../features/Favorites/components/RecommendForm";
import { updateRecommendedListMutation, updateAccountVisibility } from "../features/Favorites/api/mutation";
import SwitchButton from "../components/ui/SwitchButton";
import useAuthStore from "../store/store";
import { useCityStore } from "../store/useCityStore";
import axios from "axios";
import { GOOGLE_PLACES_API_BASE_URL, IMAGE_CONFIG } from "../config"; // Force HMR update for IMAGE_CONFIG
import { motion, AnimatePresence } from "framer-motion";
import CircularPlacesModal from "../components/CircularPlacesModal";
import { useNavigate, useLocation } from "react-router-dom";
import { CategoryVisibilityModal } from "../components/CategoryVisibilityModal";
import SEO from "../components/SEO";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import { useRecommendationsWalkthrough } from "../hooks/useRecommendationsWalkthrough";
import Joyride from "react-joyride";
import useSetupStore from "../store/useSetupStore";
import { calculateIsRecommendationsComplete } from "../utils/setupStatusCalculations";
import { CategoryEmptyState } from "../components/CategoryEmptyState";
import { ListVisibilityModal } from "../components/ListVisibilityModal";
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

const PushPinIcon = ({ pinned }: { pinned: boolean }) => (
  <svg
    className={`w-3.5 h-3.5 transition-colors cursor-pointer ${
      pinned ? "text-amber-400 fill-amber-400" : "text-white/45 hover:text-white/80"
    }`}
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 12H5l4-4V3h6v5l4 4z" fill={pinned ? "currentColor" : "none"} />
    <path d="M12 12v8" />
  </svg>
);

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
  const { t } = useTranslation();
  const { selectedCity, setSelectedCity } = useCityStore();
  const location = useLocation();
  // fetching the user details from the global state
  const { user } = useAuthStore();
  // account data by Id
  const { data: accountById } = useQuery(accountDataQuery, {
    variables: {
      documentId: user?.documentId,
    },
    skip: !user?.documentId,
  });

  const [showAllPlaces, setShowAllPlaces] = useState<boolean>(false);
  // local state for handling modal
  const [isLocationModalOpen, setIsLocationModalOpen] =
    useState<boolean>(false);
  // local state for handling active tab
  const [activeTab, setActiveTab] = useState<string>(
    t("dashboard.recommendations.recommendationsTab")
  );
  // Two-step flow states
  const [step, setStep] = useState<1 | 2>(1);
  const [activeDropdownListId, setActiveDropdownListId] = useState<string | null>(null);
  const [activePinnedIndex, setActivePinnedIndex] = useState<number>(0);
  const [isManageModalOpen, setIsManageModalOpen] = useState<boolean>(false);
  const [visibilityPrompt, setVisibilityPrompt] = useState<{
    isOpen: boolean;
    categoryName: string;
    visibilityField: string;
    defaultValue: boolean;
  } | null>(null);

  const [listVisibilityPrompt, setListVisibilityPrompt] = useState<{
    isOpen: boolean;
    listName: string;
    listDocumentId: string;
  } | null>(null);

  useEffect(() => {
    if (location.state?.justCreatedList && accountById) {
      const acc = accountById?.usersPermissionsUser?.accounts?.[0];
      const isPublic = acc?.public_recommendations === "Yes"; // strict opt-in
      if (!isPublic) {
        setVisibilityPrompt({
          isOpen: true,
          categoryName: "Places",
          visibilityField: "public_recommendations",
          defaultValue: true,
        });
      }
      // Clear location state
      window.history.replaceState({}, document.title);
    }
  }, [location.state, accountById]);

  useEffect(() => {
    const handleWindowClick = () => {
      setActiveDropdownListId(null);
    };
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  const [mobileDropdownOpen, setMobileDropdownOpen] = useState<boolean>(false);
  // Check if profile setup is complete
  const { isProfileComplete, isRecommendationsComplete, setSetupStatus } = useSetupStore();

  const cityRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  // local state for handling edit state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const navigate = useNavigate();
  // local state for handling the confirm delete modal
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] =
    useState<boolean>(false);
  const [deleteConfirmationText, setDeleteConfirmationText] =
    useState<string>("");
  // local state for handling the loading state for adding the list name
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // fetching the cities data from the query
  const {
    data: cities,
    loading,
    refetch: refetchCities,
  } = useQuery(recommendationListQuery, {
    variables: {
      filters: {
        account: {
          documentId: {
            eq: accountById?.usersPermissionsUser?.accounts?.[0]?.documentId,
          },
        },
      },
    },
    skip: !accountById?.usersPermissionsUser?.accounts?.[0]?.documentId,
    fetchPolicy: "network-only",
  });

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

  // mutation for updating the recommended list
  const [updateRecommendedList] = useMutation(updateRecommendedListMutation, {
    refetchQueries: [recommendationListQuery],
    fetchPolicy: "network-only",
  });

  const [updateVisibility] = useMutation(updateAccountVisibility);

  const handleVisibilityToggle = async () => {
    const accountData = accountById?.usersPermissionsUser?.accounts?.[0];
    if (!accountData?.documentId) return;

    const currentValue = accountData.public_recommendations;
    const newValue = currentValue === "Yes" ? "No" : "Yes";

    if (newValue === "Yes") {
      const lists = cities?.recommendationLists || [];
      const hasPublishedList = lists.some((l: any) => l.Visibility === true);
      if (!hasPublishedList) {
        toast.error("You must have at least one published place list to make Recommendations public.");
        return;
      }
    }

    try {
      await updateVisibility({
        variables: {
          documentId: accountData.documentId,
          data: { public_recommendations: newValue }
        },
        optimisticResponse: {
          updateAccount: {
            __typename: 'Account',
            documentId: accountData.documentId,
            public_recommendations: newValue
          }
        },
        refetchQueries: [{ query: accountDataQuery, variables: { documentId: user?.documentId } }]
      });
      toast.success(`Public visibility updated to ${newValue === "Yes" ? "Public" : "Private"}`);
    } catch (error) {
      console.error("Error updating visibility:", error);
      toast.error("Failed to update visibility");
    }
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
      toast.success(`${selectedCity.List_Name} is now ${nextValue ? "Public" : "Draft"}`);
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
      setSetupStatus(isProfileComplete, currentIsRecommendationsComplete);
    }
  }, [currentIsRecommendationsComplete, isRecommendationsComplete, isProfileComplete, setSetupStatus, cities]);


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

  // a custom hook to create the recommendation link (City)
  const { handleLocationSubmit, accountData } = useCreateLocation({
    setIsLocationModalOpen,
    refetchCities,
    setIsLoading,
    cities,
    onCreated: () => {
      // Open directly into the newly-created list's detail view (BUG-3 parity
      // with Movies): useCreateLocation already sets selectedCity to the new
      // list, so switch the in-page view from the all-lists grid (step 1) to the
      // list detail (step 2) and focus the Recommendations tab, where the
      // add-place affordance lives. Without this the user was left on the grid.
      setActiveTab(t("dashboard.recommendations.recommendationsTab"));
      setStep(2);

      const acc = accountById?.usersPermissionsUser?.accounts?.[0];
      const isPublic = acc?.public_recommendations === "Yes"; // strict opt-in
      if (!isPublic) {
        setVisibilityPrompt({
          isOpen: true,
          categoryName: "Places",
          visibilityField: "public_recommendations",
          defaultValue: true,
        });
      }
    }
  });

  useEffect(() => {
    // Set the default city when data is available
    if (cities?.recommendationLists?.length && !selectedCity) {
      setSelectedCity(cities?.recommendationLists?.[0]);
    }
  }, [
    cities,
    selectedCity,
    handleLocationSubmit,
    refetchCities,
    setSelectedCity,
  ]);

  // filtering and sorting the cities based on pinning/display_order
  const filteredCities = useMemo(() => {
    const lists = cities?.recommendationLists?.filter(
      (item: selectedCity) =>
        item.account?.documentId === accountData?.documentId
    ) || [];

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
  }, [cities, accountData?.documentId]);

  const pinnedCities = useMemo(() => {
    return filteredCities.filter((city: any) => city.is_pinned);
  }, [filteredCities]);

  const unpinnedCities = useMemo(() => {
    return filteredCities.filter((city: any) => !city.is_pinned);
  }, [filteredCities]);

  useEffect(() => {
    if (pinnedCities.length <= 1) return;
    const interval = setInterval(() => {
      setActivePinnedIndex((prev) => (prev + 1) % pinnedCities.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [pinnedCities.length]);
  
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
    imageUrl: string;
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
      cities?.account?.recommendation_lists.some(
        (list: { slug: string }) => list.slug === values.placeUrl
      )
    ) {
      toast.error(t("toast.error.conflictError"));
      return false;
    }

    try {
      // Skip Google Places API call when editing since we're only updating social link and notes
      let photoUrl = selectedCity?.List_Name_Details?.thumbnail || "";

      // Only fetch place details if we have a placeId (for new locations)
      if (values.placeId) {
        const placeDetails = await axios.get(
          `${GOOGLE_PLACES_API_BASE_URL}/${values.placeId
          }?fields=id,displayName,primaryType,primaryTypeDisplayName,priceRange,rating,userRatingCount,photos&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY
          }`
        );

        const photoReferences = placeDetails.data.photos.map(
          (photo: { name: string }) => photo.name.split(`${values.placeId}/`)[1]
        );

        const response = await fetch(
          `${GOOGLE_PLACES_API_BASE_URL}/${values.placeId}/${photoReferences[0]
          }/media?maxWidthPx=400&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`,
          { redirect: "follow" }
        );
        photoUrl = response.url;
      }

      // Preserve existing place_id from List_Name_Details or use new one if provided
      let existingPlaceId = null;
      if (selectedCity?.List_Name_Details) {
        try {
          const details = typeof selectedCity.List_Name_Details === 'string'
            ? JSON.parse(selectedCity.List_Name_Details)
            : selectedCity.List_Name_Details;
          existingPlaceId = (details as any)?.place_id || null;
        } catch (e) {
          existingPlaceId = (selectedCity.List_Name_Details as any)?.place_id || null;
        }
      }
      const placeIdToStore = values.placeId || existingPlaceId;

      const response = await updateRecommendedList({
        variables: {
          documentId: selectedCity?.documentId,
          data: {
            Instagram_Media_URL: values.recommendationSocialLink,
            List_Name: values.listName,
            List_Name_Details: {
              note: values.note,
              thumbnail: photoUrl,
              place_id: placeIdToStore, // Preserve or update place_id
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
  // Helper to render a location list card with pin controls
  const renderCityCard = (city: any, idx: number) => {
    return (
      <div
        key={city.documentId || idx}
        onClick={() => {
          handleCitySelect(city);
          setStep(2);
        }}
        className="bg-dashboard-sidebar rounded-[14px] p-3 flex flex-col gap-2.5 cursor-pointer border border-white/5 md:border-dashboard-border/30 hover:border-dashboard-accent transition-all duration-300 relative group"
      >
        <div className="flex justify-between items-center gap-2">
          <span className="text-xs md:text-sm font-bold text-white truncate max-w-[65%]">
            {city.List_Name}
          </span>
          
          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Visibility & Pin Badge */}
            {city.Visibility ? (
              <span className="text-[10px] font-semibold text-white bg-emerald-500/90 px-1.5 py-0.5 rounded-md flex items-center gap-1 uppercase tracking-wider font-poppins">
                {city.is_pinned && (
                  <svg className="w-2.5 h-2.5 text-amber-400 fill-amber-400" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path d="M19 12H5l4-4V3h6v5l4 4z" />
                    <path d="M12 12v8" />
                  </svg>
                )}
                Public
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-white bg-slate-500/90 px-1.5 py-0.5 rounded-md uppercase tracking-wider font-poppins">
                Draft
              </span>
            )}

            {/* Triple dot menu option */}
            <div className="relative">
              <button
                onClick={() => {
                  setActiveDropdownListId(
                    activeDropdownListId === city.documentId ? null : city.documentId
                  );
                }}
                className="p-1 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center cursor-pointer border-none bg-transparent text-white/55 hover:text-white"
                title="Options"
              >
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2 s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
              </button>

              {activeDropdownListId === city.documentId && (
                <div className="absolute right-0 top-6 w-32 bg-dashboard-modal border border-dashboard rounded-lg shadow-xl z-50 py-1 flex flex-col gap-0.5 font-poppins">
                  {/* Publish/Draft toggle */}
                  <button
                    onClick={() => {
                      setActiveDropdownListId(null);
                      const docId = city.documentId;
                      if (docId) {
                        const currentValue = city.Visibility;
                        const nextValue = !currentValue;
                        const updateData: any = { Visibility: nextValue };
                        
                        if (!nextValue && city.is_pinned) {
                          updateData.is_pinned = false;
                          updateData.pin_order = null;
                        }

                        updateRecommendedList({
                          variables: {
                            documentId: docId,
                            data: updateData
                          }
                        }).then((response) => {
                          if (selectedCity?.documentId === docId && response.data?.updateRecommendationList) {
                            const updatedData = response.data.updateRecommendationList;
                            setSelectedCity({
                              ...selectedCity,
                              Visibility: updatedData.Visibility,
                              is_pinned: updatedData.is_pinned,
                              pin_order: updatedData.pin_order,
                            });
                          }
                          refetchCities();
                          toast.success(`${city.List_Name} is now ${nextValue ? "Public" : "Draft"}`);
                        }).catch(() => {
                          toast.error("Failed to update visibility");
                        });
                      }
                    }}
                    className="px-3 py-1.5 text-[10px] text-left hover:bg-white/10 text-white flex items-center gap-1.5 cursor-pointer border-none bg-transparent w-full"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${city.Visibility ? "bg-red-400" : "bg-green-400"}`}></span>
                    {city.Visibility ? "Make Draft" : "Publish"}
                  </button>

                  {/* Pin/Unpin toggle */}
                  <button
                    onClick={() => {
                      if (!city.Visibility && !city.is_pinned) {
                        toast.error("Only published locations can be pinned");
                        return;
                      }
                      setActiveDropdownListId(null);
                      const docId = city.documentId;
                      if (docId) {
                        const isPinned = !!city.is_pinned;
                        const nextPinnedValue = !isPinned;
                        
                        let pinOrder = null;
                        if (nextPinnedValue) {
                          const maxPinOrder = pinnedCities.reduce((max: number, c: any) => {
                            const po = c.pin_order || 0;
                            return po > max ? po : max;
                          }, 0);
                          pinOrder = maxPinOrder + 1;
                        }

                        updateRecommendedList({
                          variables: {
                            documentId: docId,
                            data: { 
                              is_pinned: nextPinnedValue,
                              pin_order: pinOrder
                            }
                          }
                        }).then(() => {
                          refetchCities();
                          toast.success(`${city.List_Name} ${nextPinnedValue ? "pinned" : "unpinned"}`);
                        }).catch(() => {
                          toast.error("Failed to update pinning");
                        });
                      }
                    }}
                    disabled={!city.Visibility && !city.is_pinned}
                    title={!city.Visibility && !city.is_pinned ? "Only published locations can be pinned" : undefined}
                    className="px-3 py-1.5 text-[10px] text-left hover:bg-white/10 text-white flex items-center gap-1.5 cursor-pointer border-none bg-transparent w-full disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <PushPinIcon pinned={city.is_pinned} />
                    {city.is_pinned ? "Unpin Pick" : "Pin Top Pick"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3 Thumbnails row */}
        <div className="flex gap-1.5 h-16">
          {[0, 1, 2].map((imgIndex) => {
            const place = city.recommended_places?.[imgIndex];
            let imgUrl = IMAGE_CONFIG.defaultImages.place;
            if (place?.media_details) {
              try {
                const details = typeof place.media_details === 'string'
                  ? JSON.parse(place.media_details)
                  : place.media_details;
                imgUrl = details?.thumbnail?.url || details?.imageDetails?.[0]?.url || IMAGE_CONFIG.defaultImages.place;
              } catch (e) {
                imgUrl = (place.media_details as any)?.thumbnail?.url || (place.media_details as any)?.imageDetails?.[0]?.url || IMAGE_CONFIG.defaultImages.place;
              }
            }
            return (
              <div
                key={imgIndex}
                className="w-8 h-16 rounded-md overflow-hidden bg-white/5 border border-white/10 flex-1"
              >
                <img
                  src={imgUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center mt-1">
          <span className="text-[10px] text-white/50 font-medium">
            {city.recommended_places?.length || 0} places
          </span>
          <span className="text-[10px] text-dashboard-accent font-bold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform duration-200">
            Open ➔
          </span>
        </div>
      </div>
    );
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
        <div className="bg-dashboard-bg min-h-screen max-w-6xl mx-auto px-4 pt-0 md:pt-4 pb-4">
          {(loading || !accountById) ? (
            <div className="flex items-center justify-center min-h-screen">
              <EarthLoader context="recommendations" size="default" />
            </div>
          ) : (
            <>
              {filteredCities.length > 0 ? (
                <>
                  {step === 1 ? (
                    <div id="step-1-dashboard" className="pt-2">
                      {/* Desktop Screen actions row */}
                      <div className="hidden md:flex justify-between items-center bg-dashboard-sidebar/40 px-4 py-3.5 rounded-2xl mb-4 border border-white/5">
                        <div className="flex items-center gap-2 bg-dashboard-muted/50 px-3 py-2 rounded-xl">
                          <SwitchButton
                            isChecked={accountById?.usersPermissionsUser?.accounts?.[0]?.public_recommendations === "Yes"}
                            onChange={handleVisibilityToggle}
                            variant="blue"
                          />
                          <span className="text-[10px] md:text-xs text-white leading-tight whitespace-nowrap font-medium">Public Visibility</span>
                        </div>
                        <button
                          onClick={() => setIsLocationModalOpen(true)}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-dashboard-accent hover:opacity-90 text-sm text-white font-medium transition-all shadow-lg shadow-blue-900/30 whitespace-nowrap cursor-pointer"
                        >
                          <AddIcon size="5" />
                          <span>{t("dashboard.recommendations.locationButton")}</span>
                        </button>
                      </div>

                      {/* Mobile actions row (split action button with visibility dropdown) */}
                      <div className="md:hidden relative mb-4 w-full">
                        <div className="flex w-full rounded-2xl overflow-hidden border border-white/10 shadow-lg shadow-blue-900/15">
                          <button
                            onClick={() => setIsLocationModalOpen(true)}
                            className="flex-1 bg-dashboard-accent hover:opacity-90 text-xs font-bold text-white py-3 px-4 text-left flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <AddIcon size="4" />
                            <span>{t("dashboard.recommendations.locationButton")}</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMobileDropdownOpen(!mobileDropdownOpen);
                            }}
                            className="bg-dashboard-accent border-l border-white/20 px-3 flex items-center justify-center cursor-pointer transition-all hover:opacity-90"
                          >
                            <svg className={`w-3.5 h-3.5 text-white transform transition-transform duration-200 ${mobileDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                        {mobileDropdownOpen && (
                          <div className="absolute top-[calc(100%+6px)] right-0 left-0 p-3.5 z-[100] border border-dashboard-accent/30 rounded-2xl bg-dashboard-sidebar/95 backdrop-blur-md shadow-xl flex justify-between items-center">
                            <span className="text-[11px] text-white/90 font-semibold">Manage Public Visibility</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold uppercase ${accountById?.usersPermissionsUser?.accounts?.[0]?.public_recommendations === "Yes" ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                                {accountById?.usersPermissionsUser?.accounts?.[0]?.public_recommendations === "Yes" ? "Pub" : "Draft"}
                              </span>
                              <SwitchButton
                                isChecked={accountById?.usersPermissionsUser?.accounts?.[0]?.public_recommendations === "Yes"}
                                onChange={handleVisibilityToggle}
                                variant="blue"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Hero Feature Card: Featured City */}
                      {/* Hero Feature Card: Featured City */}
                      {pinnedCities.length > 0 ? (
                        <>
                          {/* Desktop View Top Picks Hero */}
                          <div className="hidden md:block relative w-full h-[60vh] min-h-[500px] max-h-[600px] rounded-2xl overflow-hidden bg-black shadow-2xl mb-8 group/hero">
                            {(() => {
                              const featuredCity = pinnedCities[activePinnedIndex >= pinnedCities.length ? 0 : activePinnedIndex] || pinnedCities[0];
                              if (!featuredCity) return null;

                              return (
                                <>
                                  <AnimatePresence mode="wait">
                                    <motion.div
                                      key={featuredCity.documentId}
                                      initial={{ opacity: 0, scale: 1.02 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0 }}
                                      transition={{ duration: 0.6 }}
                                      className="absolute inset-0 cursor-pointer"
                                      onClick={() => {
                                        handleCitySelect(featuredCity);
                                        setStep(2);
                                      }}
                                    >
                                      <img
                                        src={featuredCity?.List_Name_Details?.thumbnail || IMAGE_CONFIG.defaultImages.place}
                                        alt={featuredCity.List_Name}
                                        className="w-full h-full object-cover opacity-90"
                                      />
                                      {/* Gradients to fade bottom and left */}
                                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                                      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/30 to-transparent" />
                                    </motion.div>
                                  </AnimatePresence>

                                  {/* Top Picks Heading */}
                                  <div className="absolute top-8 left-8 md:top-10 md:left-10 z-50 pointer-events-none flex flex-col gap-1">
                                    <h2 className="text-lg md:text-xl font-bold text-white flex items-center drop-shadow-lg font-poppins">
                                      <span className="w-1.5 h-5 bg-yellow-400 mr-2.5 rounded-full inline-block"></span>
                                      Featured
                                    </h2>
                                  </div>

                                  {/* Main Content Area */}
                                  <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-10 z-10 pointer-events-none">
                                    <div className="flex justify-between items-end w-full">
                                      {/* Left Text Detail Section */}
                                      <div className="w-full md:w-1/2 flex flex-col gap-3 pointer-events-auto">
                                        <motion.h1 
                                          key={`title-${featuredCity.documentId}`}
                                          initial={{ opacity: 0, y: 15 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight font-poppins"
                                        >
                                          {featuredCity.List_Name}
                                        </motion.h1>
                                        
                                        <motion.div 
                                          key={`meta-${featuredCity.documentId}`}
                                          initial={{ opacity: 0 }}
                                          animate={{ opacity: 1 }}
                                          className="flex items-center gap-2 text-xs md:text-sm text-white/80 font-semibold"
                                        >
                                          <span>{featuredCity?.List_Name_Details?.note ? "Personal Guide" : "Local Curation"}</span>
                                          <span className="text-white/40">•</span>
                                          <span>🗼 Landmark, Food</span>
                                          <span className="text-white/40">•</span>
                                          <span>{featuredCity?.recommended_places?.length || 0} places</span>
                                        </motion.div>
                            
                                        <motion.p 
                                          key={`desc-${featuredCity.documentId}`}
                                          initial={{ opacity: 0, y: 10 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          className="text-white/70 text-xs md:text-sm leading-relaxed line-clamp-2 max-w-xl"
                                        >
                                          {featuredCity?.List_Name_Details?.note || "Explore the absolute must-see spots, including iconic historical monuments, fine dining, and local cafes..."}
                                        </motion.p>
                                        
                                        <motion.div 
                                          key={`btns-${featuredCity.documentId}`}
                                          initial={{ opacity: 0, y: 10 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          className="flex items-center gap-4 mt-2"
                                        >
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); setIsManageModalOpen(true); }}
                                            className="flex items-center gap-1.5 bg-dashboard-accent hover:opacity-90 text-white font-bold py-2.5 px-6 rounded-lg shadow-xl shadow-blue-500/20 transition-all hover:scale-105 cursor-pointer border-none text-xs"
                                          >
                                            <span className="text-amber-400">★</span> Manage Top Picks
                                          </button>
                                        </motion.div>
                                      </div>

                                      {/* Right Bottom Top Picks Thumbnail Row */}
                                      <div className="hidden lg:flex flex-col items-end max-w-[45%] z-20 pointer-events-auto">
                                        <div className="flex gap-2 py-2 overflow-x-auto scrollbar-hide">
                                          {pinnedCities.map((city: any, index: number) => {
                                            const isSelected = index === activePinnedIndex;
                                            return (
                                              <button
                                                key={`thumb-${city.documentId || index}`}
                                                onClick={(e) => { e.stopPropagation(); setActivePinnedIndex(index); }}
                                                className={`relative flex-shrink-0 w-24 aspect-video rounded-md overflow-hidden transition-all duration-300 border-none cursor-pointer ${
                                                  isSelected 
                                                    ? "ring-2 ring-white scale-105 z-10 shadow-xl opacity-100" 
                                                    : "opacity-60 hover:opacity-100 hover:scale-102"
                                                }`}
                                              >
                                                <img 
                                                  src={city?.List_Name_Details?.thumbnail || IMAGE_CONFIG.defaultImages.place} 
                                                  alt={city.List_Name}
                                                  className="w-full h-full object-cover"
                                                />
                                                <div className="absolute inset-0 bg-black/20" />
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>

                          {/* Mobile View Stack Slider */}
                          <div className="md:hidden relative w-full h-[55vh] min-h-[420px] max-h-[500px] overflow-hidden flex items-center justify-start py-6 mb-8 mt-2 touch-pan-y">
                            <div className="absolute inset-0 left-4 right-14">
                              {pinnedCities.map((city: any, i: number) => {
                                const diff = (i - activePinnedIndex + pinnedCities.length) % pinnedCities.length;
                                
                                let position = "hiddenRight";
                                if (diff === 0) position = "active";
                                else if (diff === 1) position = "next";
                                else if (diff === 2) position = "nextNext";
                                else if (diff === pinnedCities.length - 1) position = "hiddenLeft";

                                const variants = {
                                  active: { x: 0, scale: 1, zIndex: 10, opacity: 1 },
                                  next: { x: "12%", scale: 0.9, zIndex: 5, opacity: 1 },
                                  nextNext: { x: "24%", scale: 0.8, zIndex: 4, opacity: 1 },
                                  hiddenRight: { x: "40%", scale: 0.7, zIndex: 1, opacity: 0 },
                                  hiddenLeft: { x: "-110%", scale: 1, zIndex: 11, opacity: 0 }
                                };

                                const handleDragEnd = (_e: any, { offset, velocity }: any) => {
                                  if (offset.x < -50 || velocity.x < -300) {
                                    setActivePinnedIndex((prev) => (prev + 1) % pinnedCities.length);
                                  } else if (offset.x > 50 || velocity.x > 300) {
                                    setActivePinnedIndex((prev) => (prev - 1 + pinnedCities.length) % pinnedCities.length);
                                  }
                                };

                                return (
                                  <motion.div
                                    key={city.documentId || i}
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
                                        handleCitySelect(city);
                                        setStep(2);
                                      }
                                    }}
                                  >
                                    <img 
                                      src={city?.List_Name_Details?.thumbnail || IMAGE_CONFIG.defaultImages.place} 
                                      alt={city.List_Name}
                                      className="w-full h-full object-cover select-none pointer-events-none filter contrast-125"
                                    />
                                    
                                    {/* Gradient dark overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 pointer-events-none" />
                                    
                                    {/* Top Banner */}
                                    <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto z-20">
                                      <div className="flex items-center pointer-events-none drop-shadow-md">
                                        <span className="w-1.5 h-5 bg-yellow-400 mr-2 rounded-full inline-block"></span>
                                        <h2 className="text-lg font-bold text-white tracking-tight font-poppins">Featured</h2>
                                      </div>
                                    </div>
                                    
                                    {/* Title & Metadata */}
                                    <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-1.5 pointer-events-none">
                                      <h2 className="text-2xl font-poppins font-black text-white leading-tight drop-shadow-xl select-none">
                                        {city.List_Name}
                                      </h2>
                                      
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/80 font-semibold tracking-wide mt-1">
                                        <span>{city?.List_Name_Details?.note ? "Personal Guide" : "Local Curation"}</span>
                                        <span className="text-white/40">•</span>
                                        <span>{city?.recommended_places?.length || 0} places</span>
                                      </div>
                                      
                                      <div className="flex items-center gap-3 mt-4 pointer-events-auto">
                                        <button 
                                          className="flex-1 bg-dashboard-accent hover:opacity-90 text-white font-bold py-2.5 px-4 rounded-full flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xl border-none text-xs cursor-pointer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setIsManageModalOpen(true);
                                          }}
                                        >
                                          <span className="text-amber-400">★</span> Manage Top Picks
                                        </button>
                                      </div>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      ) : (
                        /* Empty Placeholder banner */
                        <div
                          onClick={() => setIsManageModalOpen(true)}
                          className="w-full flex items-center justify-between p-4 rounded-[14px] border border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10 transition-all duration-300 cursor-pointer mb-6"
                        >
                          <div className="flex items-center gap-2 text-xs md:text-sm font-bold text-[#fbbf24]">
                            <span className="text-amber-400">★</span> Manage Top Picks ({pinnedCities.length}/{filteredCities.length})
                          </div>
                          <div className="flex items-center text-amber-500">
                            <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      )}

                      {/* Locations Grid */}
                      <div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-4">
                          {filteredCities.map((city: any, idx: number) => renderCityCard(city, idx))}

                          {/* Add Location Card */}
                          <div
                            onClick={() => setIsLocationModalOpen(true)}
                            className="border-2 border-dashed border-dashboard-border rounded-[14px] flex flex-col items-center justify-center gap-1.5 p-4 min-h-[120px] cursor-pointer hover:border-dashboard-accent hover:bg-dashboard-accent/5 transition-all duration-300"
                          >
                            <span className="text-xl text-white/30 font-light">+</span>
                            <span className="text-[10px] md:text-xs text-white/45 font-semibold whitespace-nowrap">Add Location</span>
                          </div>
                        </div>
                      </div>

                      {/* View All button */}
                      <div className="flex items-center justify-end w-full px-1 py-2 relative z-40">
                        <button
                          className="text-white/60 font-poppins text-xs transition-all duration-300 flex items-center justify-center gap-2 font-normal hover:text-white px-1 relative z-50 pointer-events-auto"
                          onClick={() => setShowAllPlaces(true)}
                        >
                          {t("dashboard.recommendations.viewAll")}
                        </button>
                      </div>

                      {/* CircularPlacesModal */}
                      {showAllPlaces && (
                        <CircularPlacesModal
                          handleCitySelect={(selected) => {
                            handleCitySelect(selected);
                            setStep(2);
                          }}
                          isOpen={showAllPlaces}
                          onClose={() => setShowAllPlaces(false)}
                          places={filteredCities}
                        />
                      )}
                    </div>
                  ) : (
                    <div id="step-2-list-details" className="pt-2">
                      {/* Navigation Header */}
                      <div className="flex justify-between items-center mb-4 w-full">
                        <div className="flex flex-col items-start">
                          <div
                            onClick={() => setStep(1)}
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
                            {selectedCity?.Visibility ? "Published" : "Draft"}
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
                          onClick={() => {
                            setActiveTab(t("dashboard.recommendations.manageTab"));
                            refetchCities();
                          }}
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
                  )}
                </>
              ) : (
                <div className="max-w-2xl mx-auto w-full py-10">
                  <CategoryEmptyState
                    category="places"
                    onAddClick={() => {
                      if (!accountData?.documentId) {
                        navigate("/profile");
                      } else {
                        setIsLocationModalOpen(true);
                      }
                    }}
                  />
                </div>
              )}
            </>
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
        <AddLocationModal
          isOpen={isLocationModalOpen}
          onClose={() => {
            setIsLocationModalOpen(false);
            setIsEditing(false);
          }}
          onSubmit={
            isEditing ? handleUpdateRecommendedList : handleLocationSubmit
          }
          isEditing={isEditing}
          initialValues={
            isEditing
              ? {
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
        {visibilityPrompt && accountById?.usersPermissionsUser?.accounts?.[0]?.documentId && (
          <CategoryVisibilityModal
            isOpen={visibilityPrompt.isOpen}
            onClose={() => setVisibilityPrompt(null)}
            categoryName={visibilityPrompt.categoryName}
            visibilityField={visibilityPrompt.visibilityField}
            accountDocumentId={accountById.usersPermissionsUser.accounts[0].documentId}
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
