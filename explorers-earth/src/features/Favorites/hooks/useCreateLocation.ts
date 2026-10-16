import useAuthStore from "../../../store/store";
import { KeyValuePair } from "../components/RecommendForm";
import { toast } from "sonner";
import { selectedCity, useCityStore } from "../../../store/useCityStore";
import axios from "axios";
import { GOOGLE_PLACES_API_BASE_URL } from "../../../config";
import { toUrlSlug } from "../../../utils/formatAddress";
import { useTranslation } from "react-i18next";
import { usePlacesCommands } from "../api/placesCommands";
import { legacyListNameDetails, type PlaceLocationSnapshot } from "../../../../../tunes/shared/explorersPlaceContract";

// Ticket 5.1. Creating a location list, on the native owner API rather than the Strapi
// createRecommendationList mutation.
//
// Three things changed shape and one did not:
//
//  - The list and its location are created in one command, so a list never exists
//    without the location it was created for.
//  - The thumbnail is owned media with the collection purpose, uploaded through the
//    media route rather than posted to Strapi's /upload. Owner decision, 2026-10-07:
//    all photos and media live in S3.
//  - display_order is assigned by the server as max+1, so the client no longer computes
//    it from whatever happened to be loaded.
//  - The Google place lookup is unchanged: a creator still picks a real place, and this
//    is the one provider request the flow makes.

interface UseCreateLocationProps {
  setIsLocationModalOpen: (isOpen: boolean) => void;
  /** Any refresh the caller holds. Nothing here depends on an Apollo result shape. */
  refetchCities: () => Promise<unknown>;
  setIsLoading: (isloading: boolean) => void;
  cities?: unknown;
  onCreated?: (newId?: string) => void;
}

/** numeric(10,7) is the stored precision; a provider double is rounded to it, not refused. */
const coordinate = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return null;
  return Math.round(parsed * 1e7) / 1e7;
};

/**
 * The provider's location, as a snapshot. Both coordinates or neither: a half-known pair
 * is not a location, and the contract refuses one.
 */
export function locationSnapshot(input: {
  placeId?: unknown; name?: unknown; address?: unknown;
  location?: { latitude?: unknown; longitude?: unknown } | null;
}): PlaceLocationSnapshot {
  const latitude = coordinate(input.location?.latitude);
  const longitude = coordinate(input.location?.longitude);
  const paired = latitude !== null && longitude !== null;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  return {
    version: 1,
    name: text(input.name),
    address: text(input.address),
    providerPlaceId: text(input.placeId),
    latitude: paired ? latitude : null,
    longitude: paired ? longitude : null,
  };
}

export const useCreateLocation = ({
  refetchCities,
  setIsLoading,
  onCreated,
}: UseCreateLocationProps) => {
  const { t } = useTranslation();
  const { setSelectedCity } = useCityStore();
  const commands = usePlacesCommands();
  const { user, accountId } = useAuthStore();

  const handleLocationSubmit = async (
    values: KeyValuePair
  ): Promise<boolean> => {
    // Duplicate check is handled in AddLocationModal by place_id.
    setIsLoading(true);
    try {
      const placeDetails = await axios.get(
        `${GOOGLE_PLACES_API_BASE_URL}/${
          values.placeId
        }?fields=id,displayName,formattedAddress,primaryType,primaryTypeDisplayName,priceRange,rating,userRatingCount,location,photos&key=${
          import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        }`
      );
      const photoReferences = placeDetails.data.photos?.map(
        (photo: { name: string }) => photo.name.split(`${values.placeId}/`)[1]
      ) || [];

      let coverMediaId: string | undefined;

      // Only import a thumbnail if the provider has one.
      if (photoReferences.length > 0) {
        const googlePhotoResponse = await fetch(
          `${GOOGLE_PLACES_API_BASE_URL}/${values.placeId}/${
            photoReferences[0]
          }/media?maxWidthPx=400&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`,
          { redirect: "follow" }
        );

        if (!googlePhotoResponse.ok) {
          throw new Error("Failed to fetch Google photo");
        }

        // Imported into owned media rather than linked, so the thumbnail keeps working
        // when the provider does not.
        const imageBlob = await googlePhotoResponse.blob();
        const file = new File([imageBlob], `${values.listName || "location"}.jpg`, {
          type: imageBlob.type || "image/jpeg",
        });
        const media = await commands.upload(file, "collection");
        coverMediaId = media.id;
      }

      const snapshot = locationSnapshot({
        placeId: values.placeId,
        name: placeDetails.data?.displayName?.text ?? values.listName,
        address: placeDetails.data?.formattedAddress,
        location: placeDetails.data?.location ?? null,
      });

      const created = await commands.createList({
        title: values.listName,
        slug: toUrlSlug(values.listName),
        // The list's own note, which the city surfaces read back as List_Name_Details.note.
        description: typeof values.note === "string" && values.note ? values.note : null,
        ...(coverMediaId === undefined ? {} : { coverMediaId }),
        placeLocation: {
          locationEntityId: null,
          locationSnapshot: snapshot,
          instagramMediaUrl:
            typeof values.recommendationSocialLink === "string" && values.recommendationSocialLink
              ? values.recommendationSocialLink
              : null,
        },
      });

      // Select the new list immediately by its stable id, so the scroll-to-selected
      // effect brings it into view even if the refresh below is slow or fails.
      const selection = {
        documentId: created.id,
        List_Name: created.title,
        slug: created.slug,
        Visibility: false,
        account: { documentId: accountId ?? user?.documentId ?? "" },
        List_Name_Details: legacyListNameDetails(snapshot, {
          note: created.description,
          thumbnailUrl: coverMediaId === undefined ? null : `/api/explorers/v1/media/${coverMediaId}/content`,
        }),
        recommended_places: [],
      } as unknown as selectedCity;
      setSelectedCity(selection);

      // Best-effort refresh of the full list — a refresh failure must NOT be reported as
      // a create failure (which would invite a duplicate-create retry).
      try {
        const refreshed = (await refetchCities()) as { data?: { recommendationLists?: selectedCity[] } } | undefined;
        const updatedCity = refreshed?.data?.recommendationLists?.find(
          (list: selectedCity) => list.documentId === created.id
        );
        if (updatedCity) {
          setSelectedCity(updatedCity);
        }
      } catch (refetchError) {
        console.warn(
          "Failed to refetch cities after creating a location:",
          refetchError
        );
      }

      toast(t("dashboard.recommendations.toastMessages.listCreated"));
      if (onCreated) onCreated(created.id);
      return true;
    } catch (error) {
      console.error("Failed to create location:", error);
      toast.error(t("dashboard.recommendations.toastMessages.listCreateFailed"));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // accountData kept for callers that read the owner's account id from this hook.
  return { handleLocationSubmit, accountData: accountId ? { documentId: accountId } : undefined };
};
