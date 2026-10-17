import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useCityStore } from "../../../store/useCityStore";
import { useTranslation } from "react-i18next";
import { usePlacesCommands } from "../api/placesCommands";
import { usePlacesOwner } from "./usePlacesOwner";

/**
 * Ticket 5.1. The list menu — delete and publish — on the native owner commands.
 *
 * Publishing is where the two models differ. Strapi had one Visibility flag on the list
 * and nothing per place; the native model publishes a list and each recommendation
 * separately, and the public projection serves only published rows of a published public
 * list. So publishing a list publishes the places in it, which is what the single toggle
 * has always meant to a creator. Unpublishing only takes the list private: the places keep
 * their own state, because taking a list private is not a decision about each place in it.
 */
export const useMenuItems = ({
  refetchCities,
  setShowConfirmDeleteModal,
  onDeleteSuccess,
  advanceToNextStep,
  advanceToNextStepRef,
}: {
  /** Any refresh the caller holds. Nothing here depends on an Apollo result shape. */
  refetchCities: () => Promise<unknown>;
  setShowConfirmDeleteModal: (show: boolean) => void;
  onDeleteSuccess?: () => void;
  advanceToNextStep?: () => void;
  advanceToNextStepRef?: { current: (() => void) | null };
}) => {
  const { t } = useTranslation();
  const { selectedCity, setSelectedCity } = useCityStore();
  const commands = usePlacesCommands();
  const owner = usePlacesOwner();
  const [isPublished, setIsPublished] = useState<boolean>(
    selectedCity?.Visibility || false
  );

  useEffect(() => {
    setIsPublished(selectedCity?.Visibility || false);
  }, [selectedCity]);

  /** The list as the owner read sees it, which is where the place ids come from. */
  const observedList = () =>
    owner.data?.recommendationLists?.find((list) => list.documentId === selectedCity?.documentId);

  const handleDeleteRecommendedList = async () => {
    const listId = selectedCity?.documentId;
    if (!listId) return;
    try {
      // Archive the places first, as the Strapi flow deleted them first — a failure here
      // must not stop the list from being archived.
      const places = observedList()?.recommended_places ?? [];
      try {
        await Promise.all(places.map((place) => commands.archivePlace(place.documentId)));
      } catch (placeError) {
        console.error("Error archiving individual places:", placeError);
      }

      await commands.archiveList(listId);

      const refetchResult = await refetchCities();
      const updatedLists = (refetchResult as { data?: { recommendationLists?: unknown[] } } | undefined)?.data?.recommendationLists;
      if (updatedLists && updatedLists.length > 0) {
        setSelectedCity(updatedLists[0] as never);
      } else {
        setSelectedCity(null);
      }

      toast.success(t("toast.success.recommendedCityDeleted"));
      setShowConfirmDeleteModal(false);
      if (onDeleteSuccess) onDeleteSuccess();
    } catch (error) {
      console.error("Error deleting recommendation list:", error);
      toast.error(t("toast.error.failedToDeleteRecommendationList"));
    }
  };

  const handleRecommendationListVisibility = async () => {
    const listId = selectedCity?.documentId;
    const places = observedList()?.recommended_places ?? selectedCity?.recommended_places ?? [];
    if (!listId || places.length < 1) {
      toast.error(t("dashboard.recommendations.toastMessages.listPublishError"));
      return;
    }

    const newVisibility = !isPublished;
    try {
      await commands.publishList(listId, newVisibility);
      // A published list serves only its published places, so publishing the list
      // publishes them. Unpublishing leaves each place's own state alone.
      if (newVisibility) {
        await Promise.all(places.map((place) => commands.publishPlace(place.documentId, true)));
      }

      setIsPublished(newVisibility);
      setSelectedCity({ ...selectedCity, Visibility: newVisibility });
      refetchCities();

      toast.success(
        t(
          newVisibility
            ? "dashboard.recommendations.toastMessages.listPublished"
            : "dashboard.recommendations.toastMessages.listUnpublished"
        )
      );

      if (newVisibility) {
        // Small delay so the state is updated and the UI is ready.
        setTimeout(() => {
          if (window.__walkthrough?.advanceToNextStepRef?.current) {
            window.__walkthrough.advanceToNextStepRef.current();
          } else if (advanceToNextStepRef?.current) {
            advanceToNextStepRef.current();
          } else if (advanceToNextStep) {
            advanceToNextStep();
          } else {
            console.warn("advanceToNextStep is not available, cannot advance walkthrough");
          }
        }, 300);
      }
    } catch (error) {
      console.error("Error updating visibility:", error);
      toast.error(t("dashboard.recommendations.toastMessages.listVisibilityError"));
    }
  };

  return {
    handleDeleteRecommendedList,
    handleRecommendationListVisibility,
    isPublished,
  };
};
