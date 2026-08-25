import { useRef, useState } from "react";
import { KeyValuePair } from "../components/RecommendForm";
import axios from "axios";
import { useMutation, useQuery, useApolloClient } from "@apollo/client";
import {
  CreateRecommendedPlaceMutation,
  updateRecommendationPlaceMutation,
  CreateRecommendedPersonMutation,
  updateRecommendedPersonMutation,
} from "../api/mutation";
import { Places } from "../../Profile/types/types";
import useAuthStore from "../../../store/store";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { recommendedListByIdQuery } from "../api/query";
import { useCityStore } from "../../../store/useCityStore";
import { GOOGLE_PLACES_API_BASE_URL } from "../../../config";
import {
  generateRecommendationUploadPath,
  generateRandomFileName,
  sanitizeUsername,
} from "../../../utils/uploadPathGenerator";
import { createClaimablePlaceProfileService } from "../services/claimablePlaceProfileService";
import { fetchPlaceDetails } from "../../../utils/placeDetailsFetcher";
import {
  RecommendationMediaSaveError,
  saveRecommendationMedia,
} from "../utils/recommendationMediaSave";

/**
 * Coerce a value to a finite number, or null. Used for Place_Details.Rating /
 * Rating_Count so we never persist non-numeric values (e.g. "") into Strapi —
 * a persisted string later crashes the public rating render (`value.toFixed`).
 * Note: 0 is a valid rating and is kept.
 */
export const toNumberOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

// TypeScript declaration for window.__walkthrough
declare global {
  interface Window {
    __walkthrough?: {
      advanceToNextStepRef?: { current: (() => void) | null };
      markProcessingCompleteRef?: () => void;
    };
  }
}

// Constants for recommendation sources
// 'self' = User clicked "Recommend" button (standard flow)
// 'suggestion' = User clicked "+" on TopPlaces suggestion
const RECOMMENDATION_SOURCES = {
  SELF: 'self',
  SUGGESTION: 'suggestion'
} as const;

type RecommendationSource = typeof RECOMMENDATION_SOURCES[keyof typeof RECOMMENDATION_SOURCES];

/**
 * Determines the source of recommendation based on URL parameters
 */
const determineRecommendationSource = (searchParams: URLSearchParams): RecommendationSource => {
  const sourceParam = searchParams.get('source');
  return sourceParam === RECOMMENDATION_SOURCES.SUGGESTION ? RECOMMENDATION_SOURCES.SUGGESTION : RECOMMENDATION_SOURCES.SELF;
};

type GoogleMedia = {
  photoBlob?: Blob;
  fileName?: string;
  url?: string;
  documentId?: string;
  isThumbnail?: boolean;
};

interface AddRecommendation {
  places?: Places | null;
  listId?: string;
  type?: string;
  googlePlaceRefId?: string;
  placeId?: string;
  fetchedListId?: string;
  fetchedGoogleMedia: GoogleMedia[];
  instagramMedia?: GoogleMedia[];
  setPreviewUrl: React.Dispatch<React.SetStateAction<Array<{ url: string; type: 'image' | 'video'; file: File }>>>;
  setIsLoading: (boolean: boolean) => void;
  userInputRef: React.RefObject<HTMLInputElement>;
  isCustom: boolean;
  recommendationType?: "place" | "person";
  media_details: {
    scalarId: string;
    imageDetails: {
      id: string;
      documentId: string;
    }[];
    recommendation_category?: {
      documentId: string;
    };
    recommendation_sub_category?: {
      documentId: string;
    };
  };
  fetchedPlace?: any;
}

export const useAddRecommendation = ({
  places,
  placeId,
  media_details,
  googlePlaceRefId,
  type,
  isCustom,
  listId,
  fetchedListId,
  fetchedGoogleMedia,
  instagramMedia = [],
  setPreviewUrl,
  setIsLoading,
  userInputRef,
  recommendationType = "place",
  fetchedPlace,
}: AddRecommendation) => {
  const { selectedCity, setSelectedCity } = useCityStore();
  const navigate = useNavigate();
  const apolloClient = useApolloClient();
  const { refetch: placeRefetch } = useQuery(recommendedListByIdQuery, {
    variables: { documentId: listId },
    skip: !listId,
    fetchPolicy: "network-only",
  });
  const { refetch } = useQuery(recommendedListByIdQuery, {
    variables: { documentId: fetchedListId },
    skip: !fetchedListId,
    fetchPolicy: "network-only",
  });

  const [uploadedUserMedia, setUploadedUserMedia] = useState<
    {
      file: File;
      fileName: string;
    }[]
  >([]);
  const pendingCreatedRecommendationRef = useRef<string | null>(null);

  // handle remove user Image
  const { t } = useTranslation();

  const handleDeleteUserImage = (_fileName: string, index: number) => {
    setUploadedUserMedia((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrl((prev) => prev.filter((_, i) => i !== index));
    toast.success(t("toast.success.mediaRemovedSuccessfully"));
  };

  const [updateRecommendationPlace] = useMutation(
    updateRecommendationPlaceMutation,
    {
      refetchQueries: [
        {
          query: recommendedListByIdQuery,
          variables: { documentId: fetchedListId || listId }
        }
      ],
    }
  );
  const [createRecommendationPlace] = useMutation(
    CreateRecommendedPlaceMutation,
    {
      refetchQueries: [
        {
          query: recommendedListByIdQuery,
          variables: { documentId: listId }
        }
      ],
    }
  );

  // Person-specific mutations
  const [createRecommendedPerson] = useMutation(
    CreateRecommendedPersonMutation,
    {
      refetchQueries: [
        {
          query: recommendedListByIdQuery,
          variables: { documentId: listId }
        }
      ],
    }
  );

  const [updateRecommendedPerson] = useMutation(
    updateRecommendedPersonMutation,
    {
      refetchQueries: [
        {
          query: recommendedListByIdQuery,
          variables: { documentId: fetchedListId || listId }
        }
      ],
    }
  );
  const { token, user } = useAuthStore();

  // creating the new recommended Places
  const handleSubmit = async (values: KeyValuePair) => {
    if (!values.subcategory) {
      toast.error(t("toast.error.selectValidCategory"));
      return;
    }

    if (type !== "edit") {
      let placeDetails = null;

      // Show loader immediately — before any async network work
      setIsLoading(true);

      try {
        const pendingDocumentId = pendingCreatedRecommendationRef.current;
        if (!pendingDocumentId) {
          // Check for duplicates in the current recommendation list before the
          // first create. Retries resume the already-created recommendation.
          const { data: currentList } = await placeRefetch();
          const normalizedNewTitle = values.title?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
          const isDuplicate = currentList?.recommendationList?.recommended_places?.some(
            (place: any) => {
              const existingTitle = place?.Place_Details?.Title?.trim().toLowerCase().replace(/\s+/g, ' ');
              return existingTitle === normalizedNewTitle && normalizedNewTitle !== '';
            }
          );

          if (isDuplicate) {
            const itemType = recommendationType === "person" ? "person" : "place";
            toast.error(t("toast.error.placeAlreadyExists", { itemType }));
            setIsLoading(false);
            return;
          }
        }


        // Fetch Google Place details only if it's a custom place AND recommendationType is "place"
        if (isCustom && recommendationType === "place" && places?.place_id) {
          try {
            placeDetails = await axios.get(
              `${GOOGLE_PLACES_API_BASE_URL}/${places.place_id
              }?fields=id,displayName,primaryType,primaryTypeDisplayName,priceRange,rating,userRatingCount&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY
              }`
            );
          } catch (error) {
            console.warn("Error fetching place details from Google:", error);
            // Continue without Google details
          }
        }

        // Determine the source of recommendation based on URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const sourceOfRecommendation = determineRecommendationSource(urlParams);

        // Parse geometry coordinates safely
        let geometryData = { lat: 0, lng: 0 };
        try {
          if (values.geoCoords) {
            geometryData = JSON.parse(values.geoCoords);
          } else if (recommendationType === "place" && places?.geometry?.location) {
            geometryData = {
              lat: typeof places.geometry.location.lat === 'function'
                ? places.geometry.location.lat()
                : places.geometry.location.lat,
              lng: typeof places.geometry.location.lng === 'function'
                ? places.geometry.location.lng()
                : places.geometry.location.lng,
            };
          }
        } catch (error) {
          console.warn("Error parsing geometry:", error);
          geometryData = { lat: 0, lng: 0 };
        }

        // Prepare data based on recommendation type
        let responseData;

        if (pendingDocumentId) {
          responseData = {
            data: { createRecommendedPlace: { documentId: pendingDocumentId } },
          };
        } else if (recommendationType === "person") {
          // For person: Use Person_Details JSON field for Instagram/LinkedIn and address
          const personDetailsJson = {
            instagram: values.recommendation || '', // Instagram/LinkedIn URL
            address: values.address || '',
          };

          const personData = {
            recommendation_list: listId,
            Recommendation_Type: recommendationType,
            Person_Details: personDetailsJson,
            recommendation_category: values.category,
            recommendation_sub_category: values.subcategory,
            Contact_Name: values.contactName || '',
            Contact_Number: values.contactNumber || '',
            Users_Social_URL: values.socialLink || '', // Website/Portfolio URL
            user_recommendation_note: values.reason || '',
            Source_Of_Recommendation: sourceOfRecommendation,
          };

          responseData = await createRecommendedPerson({
            variables: { data: personData },
          });
        } else {
          // For place: Send full Place_Details with Google data
          const placeData = {
            recommendation_list: listId,
            Recommendation_Type: recommendationType,
            Place_Details: {
              Title: placeDetails?.data?.displayName?.text || values.title || 'Untitled',
              Rating: toNumberOrNull(placeDetails?.data?.rating),
              Rating_Count: toNumberOrNull(placeDetails?.data?.userRatingCount),
              Price_Range: placeDetails?.data?.priceRange || "",
              Place_Name: places?.formatted_address || values.title || '',
              Place_Id: places?.place_id || "",
              Place_Address: values.address || '',
              Geometry: geometryData,
            },
            user_rating: values.userRating || null,
            google_rating: placeDetails?.data?.rating || places?.rating || null,
            recommendation_category: values.category,
            recommendation_sub_category: values.subcategory,
            Contact_Name: values.contactName || '',
            Contact_Number: values.contactNumber || '',
            Users_Social_URL: values.recommendationLink || '',
            user_recommendation_note: values.reason || '',
            Places_Social_Link: values.socialLink || '',
            Source_Of_Recommendation: sourceOfRecommendation,
          };

          responseData = await createRecommendationPlace({
            variables: { data: placeData },
          });
        }

        const response = responseData;

        const createdDocumentId = response?.data?.createRecommendedPlace?.documentId;
        if (!createdDocumentId) {
          throw new Error("Recommendation creation returned no document ID");
        }
        pendingCreatedRecommendationRef.current = createdDocumentId;

        await saveRecommendationMedia({
          lookup: async () => {
            const createdPlace = await axios.get(
              `${import.meta.env.VITE_REST_API_URL}/recommended-places`,
              {
                params: { filters: { documentId: { $eq: createdDocumentId } } },
                headers: { Authorization: `Bearer ${token}` },
              },
            );
            const record = createdPlace.data?.data?.[0];
            if (!record?.id || !record?.documentId) {
              throw new Error("Created recommendation could not be found");
            }
            return { id: record.id, documentId: record.documentId };
          },
          upload: async (createdPlace) => {
            const uploadFile = async (
              file: Blob | File | string,
              fileName?: string,
              type?: string,
            ) => {
              const randomFileName = generateRandomFileName(fileName);
              const formData = new FormData();
              formData.append("files", new File([file], randomFileName, type ? { type } : undefined));
              formData.append("refId", String(createdPlace.id));
              formData.append("field", "Media");
              formData.append("ref", "api::recommended-place.recommended-place");
              formData.append(
                "path",
                generateRecommendationUploadPath(
                  sanitizeUsername(user?.username || "user"),
                  selectedCity?.documentId || listId || "unknown-list",
                  createdPlace.documentId,
                  randomFileName,
                ),
              );
              const result = await axios.post(
                `${import.meta.env.VITE_REST_API_URL}/upload`,
                formData,
                {
                  headers: {
                    "Content-Type": "multipart/form-data",
                    Authorization: `Bearer ${token}`,
                  },
                },
              );
              return result.data || [];
            };

            const safeFetchedGoogleMedia = Array.isArray(fetchedGoogleMedia)
              ? fetchedGoogleMedia
              : [];
            const thumbnail = safeFetchedGoogleMedia.find((item) => item.isThumbnail);
            const thumbnailResult = thumbnail
              ? await uploadFile(thumbnail.photoBlob ?? "", thumbnail.fileName)
              : [];
            const imageDetails = await Promise.all([
              ...safeFetchedGoogleMedia
                .filter((item) => !item.isThumbnail)
                .map((item) => uploadFile(item.photoBlob ?? "", item.fileName)),
              ...uploadedUserMedia.map(({ file, fileName }) =>
                uploadFile(file, fileName, file.type),
              ),
              ...(instagramMedia || []).map((item) =>
                uploadFile(item.photoBlob ?? "", item.fileName),
              ),
            ]);

            return {
              thumbnail: thumbnailResult[0] || null,
              imageDetails: imageDetails.flat(),
              scalarId: createdPlace.id,
            };
          },
          saveMetadata: async (documentId, media) => {
            await updateRecommendationPlace({
              variables: {
                documentId,
                data: {
                  media_details: {
                    imageDetails: media.imageDetails,
                    scalarId: media.scalarId ?? documentId,
                    thumbnail: media.thumbnail,
                  },
                },
              },
            });
          },
        });
        pendingCreatedRecommendationRef.current = null;

        // Update Claimable_Place_Profile after successful recommendation creation
        // Only for place recommendations, not person recommendations
        if (response && user?.documentId && recommendationType === "place") {
          try {
            const claimablePlaceService = createClaimablePlaceProfileService(apolloClient);

            // Determine if we need to fetch additional place details for phone/website
            const urlParams = new URLSearchParams(window.location.search);
            const sourceOfRecommendation = determineRecommendationSource(urlParams);

            let phoneNumber = values.contactNumber || '';
            let website = values.socialLink || '';

            // If recommendation is from TopPlaces suggestion, fetch place details for phone/website
            if (sourceOfRecommendation === RECOMMENDATION_SOURCES.SUGGESTION && places?.place_id) {
              const placeDetails = await fetchPlaceDetails(places.place_id);

              // Use fetched details if available, otherwise keep existing values
              phoneNumber = placeDetails.formatted_phone_number || phoneNumber;
              website = placeDetails.website || website;
            }

            const placeData = {
              Place_Id: places?.place_id || '',
              Name: values.title || places?.name || '',
              Address: values.address || places?.formatted_address || '',
              Lat: places?.geometry?.location?.lat() || parseFloat(values.geoCoords?.split(',')[0]) || 0,
              Long: places?.geometry?.location?.lng() || parseFloat(values.geoCoords?.split(',')[1]) || 0,
              Phone: phoneNumber,
              Website: website,
              Meta_Data: {
                types: places?.types?.slice(0, 4) || [],
                rating: placeDetails?.data.rating || '',
                user_ratings_total: placeDetails?.data.userRatingCount || '',
              },
              currentUserId: user.documentId,
            };

            await claimablePlaceService.updateOrCreateClaimablePlaceProfile(placeData);
          } catch (claimableError) {
            console.warn('Error updating claimable place profile:', claimableError);
          }
        }

        // Success message and navigation
        if (response) {
          try {
            // 1. Refetch the latest list data
            const { data: updatedData } = await placeRefetch();

            if (updatedData?.recommendationList) {
              const freshList = updatedData.recommendationList;

              // 2. Construct the updated city object, ensuring all fields are complete 
              // and explicitly using the fresh list of recommended places.
              const updatedCity = {
                // Preserve essential fields for walkthrough logic (documentId, List_Name, etc.)
                documentId: selectedCity?.documentId || freshList.documentId,
                List_Name: selectedCity?.List_Name || freshList.List_Name,
                slug: selectedCity?.slug || freshList.slug,
                account: selectedCity?.account || freshList.account,
                Visibility: freshList.Visibility,

                // CRITICAL: Use the fresh, complete recommended_places array from the refetch
                recommended_places: freshList.recommended_places || [],
              };

              console.log(`✅ Place added - updating selectedCity: {previousPlacesCount: ${selectedCity?.recommended_places?.length || 0}, newPlacesCount: ${updatedCity.recommended_places?.length || 0}}`);

              // CRITICAL: Update state FIRST - this triggers the Manual Resurrection logic in Favorites.tsx
              setSelectedCity(updatedCity);

              // CRITICAL: Use setTimeout to ensure React processes the state update
              // before navigation. This guarantees the listener detects the change.
              setTimeout(() => {
                navigate("/recommendations", { state: { justAddedRecommendationToListId: listId } });
                toast("Recommendation Created Successfully!!!");
                setIsLoading(false);
                // Advance walkthrough to next step after successful place addition
                // Wait for navigation to complete before advancing
                setTimeout(() => {
                  window.__walkthrough?.advanceToNextStepRef?.current?.();
                }, 500);
              }, 100);
            } else {
              // Fallback if refetch doesn't return data
              navigate("/recommendations", { state: { justAddedRecommendationToListId: listId } });
              toast("Recommendation Created Successfully!!!");
              setIsLoading(false);
            }
          } catch (refetchError) {
            console.warn("Error refetching data, but proceeding with navigation:", refetchError);
            // Still navigate even if refetch fails
            navigate("/recommendations", { state: { justAddedRecommendationToListId: listId } });
            toast("Recommendation Created Successfully!!!");
            setIsLoading(false);
          }
        }
      } catch (error) {
        setIsLoading(false);
        if (error instanceof RecommendationMediaSaveError) {
          toast.error(
            "Recommendation saved, but media could not be completed. Your selected files are still here; retry to continue.",
          );
        } else {
          toast.error("Failed to save recommendation. Please try again.");
        }
        throw error;
      }
    }
  };

  const handleUpdatePlaceDetails = async (values: KeyValuePair) => {
    try {
      setIsLoading(true);

      // Validate required fields
      if (!values.subcategory) {
        toast.error("Select a Valid Category");
        setIsLoading(false);
        return;
      }

      if (!placeId) {
        toast.error("Place ID is missing. Cannot update.");
        setIsLoading(false);
        return;
      }

      let placeDetails = null;
      if (isCustom && googlePlaceRefId) {
        try {
          placeDetails = await axios.get(
            `${GOOGLE_PLACES_API_BASE_URL}/${googlePlaceRefId}?fields=id,displayName,primaryType,primaryTypeDisplayName,priceRange,rating,userRatingCount,location&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY
            }`
          );
        } catch (error) {
          console.warn("Error fetching Google Place details:", error);
          // Continue without place details
        }
      }
      let userUploadedMediaResponse = null;
      let resolvedResponses = null;

      // Safely handle fetchedGoogleMedia - it might be undefined or not an array
      const safeFetchedGoogleMedia = Array.isArray(fetchedGoogleMedia) ? fetchedGoogleMedia : [];

      const thumbnailMedia = safeFetchedGoogleMedia.find(
        (item) => item.isThumbnail
      );
      const otherFetchedMedia = safeFetchedGoogleMedia.filter(
        (item) => !item.isThumbnail
      );

      // Upload User Media
      if (uploadedUserMedia.length > 0) {
        try {
          userUploadedMediaResponse = uploadedUserMedia.map(
            ({ file, fileName }) => {
              const formData = new FormData();

              // Generate structured path for user-uploaded media
              const username = sanitizeUsername(user?.username || 'user');
              const recommendationListId = selectedCity?.documentId || fetchedListId || 'unknown-list';
              const currentPlaceId = placeId || 'unknown-place';
              const randomFileName = generateRandomFileName(fileName);
              const structuredPath = generateRecommendationUploadPath(
                username,
                recommendationListId,
                currentPlaceId,
                randomFileName
              );

              formData.append(
                "files",
                new File([file], randomFileName, { type: file.type })
              );
              formData.append("refId", media_details.scalarId ?? "");
              formData.append("field", "Media");
              formData.append(
                "ref",
                "api::recommended-place.recommended-place"
              );
              formData.append("path", structuredPath);

              return axios.post(
                `${import.meta.env.VITE_REST_API_URL}/upload`,
                formData,
                {
                  headers: {
                    "Content-Type": "multipart/form-data",
                    Authorization: `Bearer ${token}`,
                  },
                }
              );
            }
          );

          const userUploadedImageResponse = await Promise.allSettled(
            userUploadedMediaResponse
          );
          resolvedResponses = userUploadedImageResponse
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value.data);
        } catch (error) {
          console.error("Error uploading user media:", error);
          toast.error("Some media files failed to upload, but continuing with update...");
        }
      }

      // Merge all media
      const mergedMedia = otherFetchedMedia.map((item, index) => ({
        ...item,
        id: media_details.imageDetails?.[index]?.id,
      }));

      if (resolvedResponses) {
        resolvedResponses.forEach((response) => {
          if (response?.[0]) {
            mergedMedia.push({
              id: response[0].id,
              url: response[0].url,
              documentId: response[0].documentId,
            });
          }
        });
      }

      // Parse geometry coordinates safely
      let geometryData;
      try {
        geometryData = values.geoCoords ? JSON.parse(values.geoCoords) : { lat: 0, lng: 0 };
      } catch (parseError) {
        console.error("Error parsing geoCoords:", parseError);
        // Fallback to default geometry
        geometryData = { lat: 0, lng: 0 };
      }

      // Prepare data based on recommendation type
      let updateData;

      if (recommendationType === "person") {
        // For person: Use Person_Details JSON field for Instagram/LinkedIn and address
        const personDetailsJson = {
          instagram: values.recommendation || values.recommendationLink || '',
          address: values.address || '',
        };

        updateData = {
          Recommendation_Type: recommendationType,
          media_details: {
            scalarId: media_details.scalarId,
            imageDetails: mergedMedia,
            thumbnail: thumbnailMedia ?? "",
          },
          Person_Details: personDetailsJson,
          recommendation_category: values.category || media_details?.recommendation_category?.documentId || "",
          recommendation_sub_category: values.subcategory || media_details?.recommendation_sub_category?.documentId || "",
          Contact_Name: values.contactName || "",
          Contact_Number: values.contactNumber || "",
          Users_Social_URL: values.socialLink || '', // Website/Portfolio URL
          user_recommendation_note: values.reason || "",
        };

        await updateRecommendedPerson({
          variables: {
            documentId: placeId,
            data: updateData,
          },
        });
      } else {
        // For place: Send full Place_Details
        updateData = {
          Recommendation_Type: recommendationType,
          media_details: {
            scalarId: media_details.scalarId,
            imageDetails: mergedMedia,
            thumbnail: thumbnailMedia ?? "",
          },
          Place_Details: {
            Title: values.title,
            Rating: toNumberOrNull(placeDetails?.data?.rating),
            Rating_Count: toNumberOrNull(placeDetails?.data?.userRatingCount),
            Price_Range: placeDetails?.data?.priceRange || "",
            Place_Name: places?.formatted_address || values.title,
            Place_Id: googlePlaceRefId || "",
            Place_Address: values.address,
            Geometry: geometryData,
          },
          user_rating: values.userRating || null,
          google_rating: placeDetails?.data?.rating || fetchedPlace?.recommendedPlace?.google_rating || null,
          recommendation_category: values.category || media_details?.recommendation_category?.documentId || "",
          recommendation_sub_category: values.subcategory || media_details?.recommendation_sub_category?.documentId || "",
          Contact_Name: values.contactName || "",
          Contact_Number: values.contactNumber || "",
          Users_Social_URL: values.recommendationLink || "",
          user_recommendation_note: values.reason || "",
          Places_Social_Link: values.socialLink || "",
        };

        await updateRecommendationPlace({
          variables: {
            documentId: placeId,
            data: updateData,
          },
        });
      }

      // Success handling
      const updatePlace = { data: { updateRecommendedPlace: { documentId: placeId } } };

      if (updatePlace?.data?.updateRecommendedPlace) {
        // Refetch data before navigating to ensure state is updated
        try {
          if (fetchedListId) {
            const { data: updatedData } = await refetch({
              documentId: fetchedListId,
            });
            // The refetch returns recommendationList, not account.recommendation_lists
            if (updatedData?.recommendationList) {
              setSelectedCity({
                ...updatedData.recommendationList,
                documentId: selectedCity?.documentId,
                List_Name: selectedCity?.List_Name,
              });
            }
          }
        } catch (refetchError) {
          console.warn("Error refetching data after update:", refetchError);
          // Continue with navigation even if refetch fails
        }

        toast.success("Recommendation Updated Successfully!!!");
        setIsLoading(false);
        navigate("/recommendations");
      } else {
        throw new Error("Update mutation returned no data");
      }
    } catch (error: any) {
      console.error("Error updating place details:", error);
      const errorMessage = error?.message || error?.graphQLErrors?.[0]?.message || "Failed to update recommendation. Please try again.";
      toast.error(errorMessage);
      setIsLoading(false);
      // Don't navigate on error - let user fix and retry
      throw error; // Re-throw to prevent form from resetting
    }
  };

  const handleUploadMedia = () => {
    userInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const uploadedFiles = event.target.files;
    if (uploadedFiles) {
      // Calculate remaining slots (max 10 total)
      const remainingSlots = 10 - uploadedUserMedia.length;

      if (remainingSlots <= 0) {
        toast.error(t("toast.error.youCanOnlyUpload4Files"));
        return;
      }

      if (uploadedFiles.length > remainingSlots) {
        toast.error(t("toast.error.youCanOnlyUploadMoreFiles", { count: remainingSlots }));
      }

      const fileArray = Array.from(uploadedFiles).slice(0, remainingSlots);

      // Filter out duplicate files based on name and size
      const existingFileSignatures = uploadedUserMedia.map(item =>
        `${item.file.name}-${item.file.size}`
      );

      const newFiles = fileArray.filter(file => {
        const fileSignature = `${file.name}-${file.size}`;
        return !existingFileSignatures.includes(fileSignature);
      });

      if (newFiles.length === 0) {
        toast.error(t("toast.error.allFilesAlreadyUploaded"));
        return;
      }

      if (newFiles.length < fileArray.length) {
        const duplicateCount = fileArray.length - newFiles.length;
        toast.warning(t("toast.error.duplicateFilesSkipped", { count: duplicateCount }));
      }

      // Generate preview URLs with proper handling for videos and images
      const newPreviewUrls = await Promise.all(
        newFiles.map(async (file) => {
          const fileUrl = URL.createObjectURL(file);

          // For videos, we'll store both the video URL and file type info
          if (file.type.startsWith('video/')) {
            return {
              url: fileUrl,
              type: 'video' as const,
              file
            };
          } else {
            return {
              url: fileUrl,
              type: 'image' as const,
              file
            };
          }
        })
      );

      // APPEND new previews to existing ones instead of replacing
      setPreviewUrl(prev => [...prev, ...newPreviewUrls]);

      const newFileItems = newFiles.map((file) => {
        // Extract file extension properly
        const fileExtension = file.name.substring(file.name.lastIndexOf('.'));
        return {
          file,
          fileName: `user---${user?.username}${fileExtension}`,
        };
      });

      // APPEND new files to existing ones instead of replacing
      setUploadedUserMedia(prev => [...prev, ...newFileItems]);

      // Clear the input value to allow re-uploading the same file if needed
      if (event.target) {
        event.target.value = '';
      }

      toast.success(t("toast.success.filesAddedSuccessfully", { count: newFiles.length }));
    }
  };

  const addExternalMedia = async (files: File[]) => {
    if (files.length === 0) return;

    // Calculate remaining slots (max 10 total)
    const remainingSlots = 10 - uploadedUserMedia.length;

    if (remainingSlots <= 0) {
      toast.error(t("toast.error.youCanOnlyUpload4Files"));
      return;
    }

    const fileArray = files.slice(0, remainingSlots);

    // Filter out duplicate files based on name and size
    const existingFileSignatures = uploadedUserMedia.map(item =>
      `${item.file.name}-${item.file.size}`
    );

    const newFiles = fileArray.filter(file => {
      const fileSignature = `${file.name}-${file.size}`;
      return !existingFileSignatures.includes(fileSignature);
    });

    if (newFiles.length === 0) return;

    // Generate preview URLs with proper handling for videos and images
    const newPreviewUrls = await Promise.all(
      newFiles.map(async (file) => {
        const fileUrl = URL.createObjectURL(file);

        // For videos, we'll store both the video URL and file type info
        if (file.type.startsWith('video/')) {
          return {
            url: fileUrl,
            type: 'video' as const,
            file
          };
        } else {
          return {
            url: fileUrl,
            type: 'image' as const,
            file
          };
        }
      })
    );

    // APPEND new previews to existing ones instead of replacing
    setPreviewUrl(prev => [...prev, ...newPreviewUrls]);

    const newFileItems = newFiles.map((file) => {
      // Extract file extension properly
      const fileExtension = file.name.substring(file.name.lastIndexOf('.'));
      return {
        file,
        fileName: `user---${user?.username || 'user'}${fileExtension}`,
      };
    });

    // APPEND new files to existing ones instead of replacing
    setUploadedUserMedia(prev => [...prev, ...newFileItems]);
  };

  return {
    handleFileChange,
    handleUploadMedia,
    handleSubmit,
    handleDeleteUserImage,
    handleUpdatePlaceDetails,
    addExternalMedia,
  };
};
