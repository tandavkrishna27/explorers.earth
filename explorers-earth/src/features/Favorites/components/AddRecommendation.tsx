import { mapsBrowserKey } from "../../../lib/publicRuntimeConfig";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import SwitchButton from "../../../components/ui/SwitchButton";
import RecommendationForm, {
  RecommendFormHandle,
} from "./RecommendForm";
import { AddIcon } from "../../../assets/icons/AddIcon";
import { toast } from "sonner";
import { usePlacesOwner } from "../hooks/usePlacesOwner";

import { Places } from "../../Profile/types/types";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EarthLoader } from "../../../components/EarthLoader";
import CrossIcon from "../../../assets/icons/CrossIcon";
import { useAddRecommendation } from "../hooks/useAddRecommendation";
import axios from "axios";
import { useRecommendationFields } from "../hooks/useRecommedationFields";
import useAuthStore from "../../../store/store";
import BackIcon from "../../../assets/icons/BackIcon";
import Button from "../../../components/ui/Button";
import { GOOGLE_PLACES_API_BASE_URL } from "../../../config";
import DeleteIcon from "../../../assets/icons/DeleteIcon";
import StarIcon from "../../../assets/icons/StarIcon";
import Modal from "../../../components/ui/Modal";
import { Tooltip } from "react-tooltip";
import { useTranslation } from "react-i18next";
import { PlacesClient } from "../api/placesClient";
import type { CompleteTaxonomyCatalog, RecommendationObservation } from "../../../lib/explorersApiClient";
import { useLocation } from "react-router-dom";
import { resizeImageToAspectRatio } from "../../../utils/resizeMediaToAspectRatio";

// Add new type for Custom Search API response
type CustomSearchImage = {
  link: string;
  title: string;
  image: {
    thumbnailLink: string;
  };
};

type GoogleMedia = {
  photoBlob?: Blob;
  fileName?: string;
  url?: string;
  isThumbnail?: boolean;
  documentId?: string;
  id?: string;
};

// Add new function to fetch images using Custom Search API
const fetchImagesFromCustomSearch = async (
  placeName: string,
  location: string
): Promise<GoogleMedia[]> => {
  try {
    // Clean up place name by removing everything after | and any extra spaces
    const cleanPlaceName = placeName.split("|")[0].trim();
    // Extract state and country from location, filtering out pincodes and postal codes
    const locationParts = location
      .split(",")
      .map((part) => part.trim())
      .filter((part) => {
        // Remove parts that are only numbers or contain postal codes
        const hasOnlyNumbers = /^\d+$/.test(part);
        const hasPostalCode = /\d{4,}/.test(part); // Matches 4 or more consecutive digits
        return !hasOnlyNumbers && !hasPostalCode;
      });
    const state = locationParts[locationParts.length - 2] || "";
    const country = locationParts[locationParts.length - 1] || "";
    // Format query in a more natural way, removing redundant type if it's already in the name
    const searchQuery = `${cleanPlaceName} ${state} ${country} images`;
    const response = await axios.get(
      `https://www.googleapis.com/customsearch/v1`,
      {
        params: {
          key: import.meta.env.VITE_GOOGLE_CUSTOM_SEARCH_API_KEY,
          cx: import.meta.env.VITE_GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
          q: searchQuery,
          searchType: "image",
          num: 10,
          safe: "active",
          imgSize: "large",
          imgType: "photo",
        },
      }
    );

    const images: GoogleMedia[] = await Promise.all(
      response.data.items.map(async (item: CustomSearchImage) => {
        try {
          const imageResponse = await fetch(item.link);
          const photoBlob = await imageResponse.blob();
          return {
            isThumbnail: false,
            photoBlob,
            fileName: `${placeName}-${Date.now()}.jpg`,
            url: URL.createObjectURL(photoBlob),
          };
        } catch (error) {
          console.error("Error fetching image:", error);
          return null;
        }
      })
    );

    return images.filter(Boolean) as GoogleMedia[];
  } catch (error) {
    console.error("Error fetching images from Custom Search:", error);
    return [];
  }
};

const AddRecommendation = memo(({ type }: { type?: "edit" | "default" }) => {
  const { t } = useTranslation();

  // local state for handling loading
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // local state image loading state
  const [isImagesLoading, setIsImagesLoading] = useState<boolean>(false);
  // handle the places fetched from the google places api
  const [places, setPlaces] = useState<Places | null>();
  // list Id from the parameters
  const { listId } = useParams();

  // creating a temp preview url for handling the user media

  const [previewUrl, setPreviewUrl] = useState<
    Array<{ url: string; type: "image" | "video"; file: File }>
  >([]); // input ref to handle the user media input

  const userInputRef = useRef<HTMLInputElement>(null);
  // ref to handle the recommendation form
  const formRef = useRef<RecommendFormHandle>(null);
  // local state for handling the user media visiblity
  const [showUserMedia, setShowUserMedia] = useState<boolean>(false);
  // local state for handling the google media visiblity
  const [showGoogleMedia, setShowGoogleMedia] = useState<boolean>(false);
  // local state for handling the fetchedGooglemedia
  const [fetchedGoogleMedia, setFetchedGoogleMedia] = useState<GoogleMedia[]>(
    []
  );
  const [fetchedImageDeleteModal, setFetchedImageDeleteModal] =
    useState<boolean>(false);
  // local state for recommendation type (place or person)
  const [recommendationType, setRecommendationType] = useState<"place" | "person">("place");
  // local state for Instagram link and caption (passed directly to useRecommendationFields)
  const [instagramLink, setInstagramLink] = useState<string | null>(null);
  const [instagramCaption, setInstagramCaption] = useState<string | null>(null);
  const [personName, setPersonName] = useState<string | null>(null);
  // Pending Instagram thumbnail to merge with Google photos
  const [pendingIgThumbnail, setPendingIgThumbnail] = useState<GoogleMedia | null>(null);
  const igThumbnailMergedRef = useRef(false);
  // local state for dropdown open/close
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  // Separate state for Instagram scraped media (person & place)
  const [instagramMedia, setInstagramMedia] = useState<GoogleMedia[]>([]);
  // Separate flag for Instagram profile scraping (doesn't trigger full-screen loader)
  const [isScrapingProfile, setIsScrapingProfile] = useState<boolean>(false);


  // Effect to clear places when recommendation type changes to person
  useEffect(() => {
    if (recommendationType === "person") {
      setPlaces(null);
    }
  }, [recommendationType]);

  // Effect to reset form when switching recommendation types
  useEffect(() => {
    // Only reset in non-edit mode
    if (type !== "edit") {
      // Clear preview media when switching types
      setPreviewUrl([]);
      setFetchedGoogleMedia([]);
      setShowGoogleMedia(false);
      setInstagramMedia([]);
    }
  }, [recommendationType, type]);
  // ref for dropdown to handle outside clicks
  const dropdownRef = useRef<HTMLDivElement>(null);

  // placeId from the params
  const { placeId } = useParams();
  // Get URL search parameters for pre-filled data from TopPlaces
  const [searchParams] = useSearchParams();

  // Read recommendationType from URL params (set by AddPlaceOverlay for Instagram import)
  useEffect(() => {
    const typeParam = searchParams.get('recommendationType');
    if (typeParam === 'person' || typeParam === 'place') {
      setRecommendationType(typeParam);
    }
  }, [searchParams]);

  // Ticket 5.1. The place being edited comes from the native owner read, which returns
  // every list complete, so the recommendation is found in it rather than fetched by id.
  const accountId = useAuthStore(s=>s.accountId), generation = useAuthStore(s=>s.generation);
  const location = useLocation();
  const catalogScope = JSON.stringify([accountId,generation,location.pathname]);
  // Finding 2. Retention is state, not a ref written during render — a render-phase ref
  // write is discarded under a concurrent re-render, which would silently lose the
  // hydration the form must stay bound to while owner.loading flips during a save re-read.
  type EditHydration={scope:string;place:NonNullable<ReturnType<typeof usePlacesOwner>['data']>['recommendationLists'][number]['recommended_places'][number];observation:RecommendationObservation};
  const [hydration,setHydration]=useState<EditHydration>();
  const [reviewMessage,setReviewMessage]=useState<string>();
  const [,setReviewVersion]=useState(0);
  const reviewController=useRef<AbortController>();
  useEffect(()=>()=>reviewController.current?.abort(),[catalogScope]);
  const owner = usePlacesOwner(undefined, Boolean(placeId));
  const isPlaceLoading = owner.loading;
  const candidatePlace = useMemo(() => {
    if (!placeId) return undefined;
    for (const list of owner.data?.recommendationLists ?? []) {
      const found = list.recommended_places.find((place: { documentId: string }) => place.documentId === placeId);
      if (found) return found;
    }
    return undefined;
  }, [owner.data, placeId]);
  const candidateObservation=placeId?owner.content?.details.get(placeId):undefined;
  // A hydration from a superseded authority scope is ignored rather than cleared in render.
  const retainedHydration=hydration?.scope===catalogScope?hydration:undefined;
  // The candidate is derived, so a discarded render costs nothing: it is recomputed from
  // live data on the retry and only the commit below turns it into retained state. Using it
  // in the same render keeps the hydrated form available on the very first render that can
  // build it, exactly as the render-phase ref write did.
  const freshHydration=useMemo<EditHydration|undefined>(()=>retainedHydration||!candidatePlace||!candidateObservation?undefined:{scope:catalogScope,place:candidatePlace,observation:candidateObservation},[retainedHydration,candidatePlace,candidateObservation,catalogScope]);
  useEffect(()=>{if(freshHydration)setHydration(freshHydration);},[freshHydration]);
  const editHydration=retainedHydration??freshHydration;
  const editHydrationScope=useRef<string>();
  useEffect(()=>{editHydrationScope.current=editHydration?.scope;},[editHydration?.scope]);
  const editedPlace=editHydration?.place;
  const editObservation=editHydration?.observation;
  useEffect(()=>{if(type==='edit' && editedPlace)setRecommendationType(editedPlace.Recommendation_Type);},[editedPlace,type]);
  // The form remains bound to the original hydration until the owner explicitly reviews a refresh.
  const fetchedPlace = useMemo(() => (editedPlace ? { recommendedPlace: editedPlace } : undefined), [editedPlace]);
  const navigate = useNavigate();

  // google places place_id for further usage
  // A manual place has no provider id, which is absent rather than an empty string.
  const googlePlaceRefId =
    fetchedPlace?.recommendedPlace?.Place_Details?.Place_Id ?? undefined;
  // custom hooke for handling the recommendation form fields
  const { formFields, validationSchema, initialValues, editInitialValues } =
    useRecommendationFields({ places, isCustom: true, fetchedPlace, recommendationType, instagramLink, instagramCaption, personName });

  const transformImages = (
    imageDetails: { url: string; id: string; documentId?: string }[] | undefined,
    thumbnail: { url?: string; id?: string; documentId?: string } | null | undefined
  ): GoogleMedia[] => {
    const items = imageDetails ?? [];
    const transformedImages: GoogleMedia[] = items.map((image) => ({
      url: image.url,
      id: image.id,
      documentId: image.documentId,
      isThumbnail: false,
    }));

    // The thumbnail joins the gallery unless it is already in it.
    if (thumbnail?.url && thumbnail.id && !items.some((img) => img.url === thumbnail.url)) {
      transformedImages.push({
        url: thumbnail.url,
        id: thumbnail.id,
        documentId: thumbnail.documentId,
        isThumbnail: true,
      });
    }

    return transformedImages;
  };

  const transformed_media_details = transformImages(
    fetchedPlace?.recommendedPlace?.media_details?.imageDetails,
    fetchedPlace?.recommendedPlace?.media_details?.thumbnail
  );

  const fetchedListId =
    fetchedPlace?.recommendedPlace?.recommendation_list?.documentId;

  // custom hook to handle Recommendation Functions
  const {
    handleSubmit,
    handleUpdatePlaceDetails,
    handleFileChange,
    handleDeleteUserImage,
    handleUploadMedia,
    mediaStatus,
    mediaFeedback,
    retryMediaUpload,
    continueWithoutImage,
    editConflict, clearEditConflict,
    retireDraftIntent,
  } = useAddRecommendation({
    places,
    googlePlaceRefId,
    type,
    isCustom: true,
    placeId,
    listId,
    fetchedListId,
    fetchedGoogleMedia,
    instagramMedia,
    recommendationType,
    setPreviewUrl,
    setIsLoading,
    userInputRef,
    fetchedPlace,
    editObservation,
  });
  const hasMediaFailure = mediaStatus === "upload-failed" || mediaStatus === "metadata-failed";

  const [catalogResult,setCatalogResult] = useState<{scope:string;catalog?:CompleteTaxonomyCatalog;error?:string}>();
  const [catalogAttempt,setCatalogAttempt] = useState(0);
  useEffect(()=>{
    const controller=new AbortController();setCatalogResult(undefined);
    void PlacesClient.readTaxonomyCatalog(controller.signal).then(catalog=>{
      const terms=new Map(catalog.items.map(term=>[term.id,term]));
      if(catalog.items.some(term=>term.category!=='places'||term.parentId!==null&&(!terms.has(term.parentId)||terms.get(term.parentId)?.parentId!==null||term.parentId===term.id)))throw new Error('Invalid Places taxonomy hierarchy. Retry loading taxonomy.');
      if(!controller.signal.aborted)setCatalogResult({scope:catalogScope,catalog});
    }).catch(error=>{if(!controller.signal.aborted)setCatalogResult({scope:catalogScope,error:(error.message || 'Places taxonomy could not be loaded.').replace(/sectors/g,'Places taxonomy')});});
    return ()=>controller.abort();
  },[catalogScope,catalogAttempt]);
  const catalog=catalogResult?.scope===catalogScope?catalogResult.catalog:undefined;
  const catalogError=catalogResult?.scope===catalogScope?catalogResult.error:undefined;
  const fetchedCategories={recommendationCategories:(catalog?.items || []).filter(t=>t.parentId===null).map(root=>({documentId:root.id,Category_Name:root.label,slug:root.slug,recommendation_sub_categories:(catalog?.items || []).filter(t=>t.parentId===root.id).map(child=>({documentId:child.id,sub_category:child.label,slug:child.slug}))}))};
  useEffect(() => {
    // function to fetch google photos
    const fetchGoogleMedia = async () => {
      if (places?.place_id) {
        // Bypass Google Photos fetch in test mode or localhost
        if (import.meta.env.MODE === 'test' || window.location.hostname === 'localhost') {
          setIsImagesLoading(false);
          return;
        }
        try {
          setIsImagesLoading(true);
          let photos: GoogleMedia[] = [];

          try {
            // First attempt: Try to fetch from Places API
            const placeDetails = await axios.get(
              `${GOOGLE_PLACES_API_BASE_URL}/${places.place_id
              }?fields=id,displayName,primaryType,primaryTypeDisplayName,priceRange,rating,userRatingCount,photos&key=${mapsBrowserKey()
              }`
            );

            const photoReferences = placeDetails.data.photos.map(
              (photo: { name: string }) =>
                photo.name.split(`${places?.place_id}/`)[1]
            );

            const delay = (ms: number) =>
              new Promise((resolve) => setTimeout(resolve, ms));

            const fetchPhotosThrottled = async () => {
              const photos: GoogleMedia[] = [];

              for (let i = 0; i < photoReferences.length; i++) {
                try {
                  const reference = photoReferences[i];
                  const url = `${GOOGLE_PLACES_API_BASE_URL}/${places.place_id
                    }/${reference}/media?maxWidthPx=800&key=${mapsBrowserKey()
                    }`;

                  const response = await fetch(url);
                  if (!response.ok) {
                    if (response.status === 429) {
                      throw new Error("RATE_LIMIT_EXCEEDED");
                    }
                    throw new Error(`HTTP error! Status: ${response.status}`);
                  }

                  const photoBlob = await response.blob();
                  photos.push({
                    isThumbnail: false,
                    photoBlob,
                    fileName: `${places.name}-${places.place_id}.jpg`,
                    url: URL.createObjectURL(photoBlob),
                  });

                  await delay(300);
                } catch (error) {
                  console.error(`Error fetching photo ${i + 1}:`, error);
                  if (
                    error instanceof Error &&
                    error.message === "RATE_LIMIT_EXCEEDED"
                  ) {
                    throw error;
                  }
                }
              }

              return photos;
            };

            photos = await fetchPhotosThrottled();
          } catch (error) {
            console.error("Error fetching photos from Places API:", error);
          }

          // Fallback to Custom Search API if Places API fails or returns no photos
          if (photos.length === 0 && places.name && places.types?.[0]) {
            const location = places.formatted_address || "";
            photos = await fetchImagesFromCustomSearch(places.name, location);
          }

          if (photos.length > 0) {
            setFetchedGoogleMedia(photos);
            setShowGoogleMedia(true);
          } else {
            toast.error(t("toast.error.noImagesFoundForPlace"));
          }

        } catch (error) {
          toast.error(t("toast.error.failedToFetchImages"));

        } finally {
          setIsImagesLoading(false);
        }
      }
    };

    if (type !== "edit" && recommendationType === "place") {
      fetchGoogleMedia();
    } else if (type === "edit") {
      setShowGoogleMedia(true);
      setFetchedGoogleMedia(transformed_media_details);
    } else {
      // Person type - don't fetch Google media
      setShowGoogleMedia(false);
      setFetchedGoogleMedia([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedPlace?.recommendedPlace?.Media, places, type, recommendationType]);

  // Effect to merge Instagram thumbnail with Google photos when both are ready
  useEffect(() => {
    if (pendingIgThumbnail && fetchedGoogleMedia.length > 0 && !igThumbnailMergedRef.current) {
      igThumbnailMergedRef.current = true;
      // Ensure all Google photos have isThumbnail: false, then prepend the Instagram thumbnail
      const googlePhotosNoThumb = fetchedGoogleMedia.map(p => ({ ...p, isThumbnail: false }));
      setFetchedGoogleMedia([pendingIgThumbnail, ...googlePhotosNoThumb]);
    }
  }, [pendingIgThumbnail, fetchedGoogleMedia]);

  // Effect to handle pre-filled data from TopPlaces URL parameters
  useEffect(() => {
    if (type !== "edit" && searchParams.has("placeId")) {
      const fetchPlaceDetails = async () => {
        try {
          const placeId = searchParams.get("placeId");
          if (!placeId) return;

          // Fetch detailed place information using Google Places Details API
          // Include primaryType and primaryTypeDisplayName for better category matching
          const response = await axios.get(
            `https://places.googleapis.com/v1/places/${placeId}`,
            {
              headers: {
                "X-Goog-Api-Key": mapsBrowserKey(),
                "X-Goog-FieldMask":
                  "id,displayName,formattedAddress,types,primaryType,primaryTypeDisplayName,addressComponents,location,rating,userRatingCount",
              },
            }
          );

          const placeData = response.data;

          // Transform Google Places Details API response to match Places interface
          const transformedPlace: Places = {
            place_id: placeData.id,
            name:
              placeData.displayName?.text ||
              decodeURIComponent(searchParams.get("name") || ""),
            formatted_address:
              placeData.formattedAddress ||
              decodeURIComponent(searchParams.get("address") || ""),
            types:
              placeData.types ||
              (searchParams.get("primaryType")
                ? [searchParams.get("primaryType")!]
                : []),
            rating: placeData.rating,
            // Store primaryType and primaryTypeDisplayName for category matching
            primaryType: placeData.primaryType || searchParams.get("primaryType") || undefined,
            primaryTypeDisplayName: placeData.primaryTypeDisplayName?.text || undefined,
            address_components:
              placeData.addressComponents?.map(
                (component: {
                  longText: string;
                  shortText: string;
                  types: string[];
                }) => ({
                  long_name: component.longText,
                  short_name: component.shortText,
                  types: component.types,
                })
              ) || [],
            geometry: {
              location: {
                lat: () =>
                  placeData.location?.latitude ||
                  parseFloat(searchParams.get("lat") || "0"),
                lng: () =>
                  placeData.location?.longitude ||
                  parseFloat(searchParams.get("lng") || "0"),
              },
            },
          };

          setPlaces(transformedPlace);
        } catch (error) {
          console.error("Error fetching place details:", error);

          // Fallback to basic place data if API call fails
          const fallbackPlaceData: Places = {
            place_id: searchParams.get("placeId") || "",
            name: decodeURIComponent(searchParams.get("name") || ""),
            formatted_address: decodeURIComponent(
              searchParams.get("address") || ""
            ),
            types: searchParams.get("primaryType")
              ? [searchParams.get("primaryType")!]
              : [],
            primaryType: searchParams.get("primaryType") || undefined,
            address_components: [],
            geometry: {
              location: {
                lat: () => parseFloat(searchParams.get("lat") || "0"),
                lng: () => parseFloat(searchParams.get("lng") || "0"),
              },
            },
          };

          setPlaces(fallbackPlaceData);
        }
      };

      fetchPlaceDetails();
    }
  }, [searchParams, type]);
  // Effect to handle Instagram post data import
  useEffect(() => {
    const fromInstagram = searchParams.get('fromInstagram');


    if (fromInstagram === 'true' && type !== 'edit') {
      const loadInstagramData = async () => {
        try {
          // Get the stored Instagram data
          const storedData = sessionStorage.getItem('instagram_post_data');
          if (!storedData) {
            toast.error("No Instagram post data found");
            return;
          }

          const instagramData = JSON.parse(storedData);

          // Clear the stored data immediately to prevent duplicate processing
          sessionStorage.removeItem('instagram_post_data');

          // Set the Instagram embed URL via React state (triggers useMemo recalculation)
          if (instagramData.embedUrl) {
            setInstagramLink(instagramData.embedUrl);
          } else if (instagramData.postUrl) {
            setInstagramLink(instagramData.postUrl);
          }

          // Set the Instagram caption via React state
          if (instagramData.caption) {
            setInstagramCaption(instagramData.caption);
          }

          setIsImagesLoading(true);

          if (instagramData._type === 'person') {
            setPersonName(instagramData.fullName || instagramData.username || '');
            setInstagramLink(instagramData.profileUrl || '');
            setInstagramCaption(instagramData.bio || '');

            if (instagramData.profilePicture) {
              try {
                const token = localStorage.getItem('qrtoken');
                const INSTAGRAM_API_URL = import.meta.env.VITE_INSTAGRAM_API_URL || 'http://localhost:5000';
                const proxyUrl = `${INSTAGRAM_API_URL}/api/instagram/media-proxy?url=${encodeURIComponent(instagramData.profilePicture)}&token=${token}`;

                const pfpResponse = await fetch(proxyUrl);
                if (pfpResponse.ok) {
                  const photoBlob = await pfpResponse.blob();
                  const file = new File([photoBlob], 'profile-picture.jpg', { type: photoBlob.type || 'image/jpeg' });

                  const igThumbnail: GoogleMedia = {
                    isThumbnail: true,
                    photoBlob: file,
                    fileName: file.name,
                    url: URL.createObjectURL(file),
                  };
                  setPendingIgThumbnail(igThumbnail);
                  setInstagramMedia([igThumbnail]);
                }
              } catch (err) {
                console.warn('Failed to load Instagram profile picture via proxy:', err);
              }
            }

            toast.success(`Loaded profile data for ${instagramData.fullName || instagramData.username}`);
            setIsImagesLoading(false);
            return;
          }

          // Search for the location using Google Places API (for placebo/post mode)
          const searchResponse = await axios.post(
            'https://places.googleapis.com/v1/places:searchText',
            {
              textQuery: instagramData.location,
              languageCode: 'en'
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': mapsBrowserKey(),
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.types,places.primaryType,places.primaryTypeDisplayName,places.addressComponents,places.location,places.photos,places.rating'
              }
            }
          );

          if (searchResponse.data.places && searchResponse.data.places.length > 0) {
            const place = searchResponse.data.places[0];

            // Transform to Places format
            const transformedPlace: Places = {
              place_id: place.id,
              name: place.displayName?.text || instagramData.location,
              formatted_address: place.formattedAddress || instagramData.location,
              types: place.types || [],
              rating: place.rating,
              primaryType: place.primaryType,
              primaryTypeDisplayName: place.primaryTypeDisplayName?.text,
              address_components: place.addressComponents?.map((component: any) => ({
                long_name: component.longText,
                short_name: component.shortText,
                types: component.types,
              })) || [],
              geometry: {
                location: {
                  lat: () => place.location?.latitude || 0,
                  lng: () => place.location?.longitude || 0,
                },
              },
            };

            setPlaces(transformedPlace);

            // Convert Instagram images to File objects via backend proxy
            // Instagram CDN blocks direct browser fetches (CORS), so we proxy through our server
            const token = localStorage.getItem('qrtoken');
            const INSTAGRAM_API_URL = import.meta.env.VITE_INSTAGRAM_API_URL || 'http://localhost:5000';

            const instagramFiles = await Promise.all(
              instagramData.media.map(async (media: { type: string; url: string }, index: number) => {
                try {
                  // Use backend proxy to bypass CORS restrictions on Instagram CDN
                  const proxyUrl = `${INSTAGRAM_API_URL}/api/instagram/media-proxy?url=${encodeURIComponent(media.url)}`;
                  const imageResponse = await fetch(proxyUrl, {
                    headers: {
                      'Authorization': `Bearer ${token}`,
                    }
                  });

                  if (!imageResponse.ok) {
                    console.warn(`Failed to proxy Instagram media ${index}: ${imageResponse.status}`);
                    return null;
                  }

                  const photoBlob = await imageResponse.blob();
                  const isVideo = media.type === 'video' || photoBlob.type.startsWith('video');

                  // Create a File object from the blob
                  let file = new File([photoBlob], `instagram-import-${index}.${isVideo ? 'mp4' : 'jpg'}`, {
                    type: photoBlob.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
                  });

                  // Resize image to required dimensions (16:9) if it's not a video
                  if (!isVideo) {
                    try {
                      const resizedFile = await resizeImageToAspectRatio(file);
                      // Use the resized file but keep the deterministic name
                      file = new File([resizedFile], file.name, { type: resizedFile.type });
                    } catch (resizeError) {
                      console.warn("Failed to resize image, using original:", resizeError);
                    }
                  }

                  return file;
                } catch (error) {
                  console.error("Error fetching Instagram image via proxy:", error);
                  return null;
                }
              })
            );

            const validInstagramFiles = instagramFiles.filter(Boolean) as File[];

            // Add Instagram images to dedicated Instagram media section (Media powered by Instagram)
            if (validInstagramFiles.length > 0) {
              const igMediaItems: GoogleMedia[] = validInstagramFiles.map((file) => ({
                photoBlob: file,
                fileName: file.name,
                url: URL.createObjectURL(file),
              }));
              setInstagramMedia(igMediaItems);

              // Save the first Instagram image as pending thumbnail
              // It will be merged with Google photos once they load
              const firstImageFile = validInstagramFiles.find(f => f.type.startsWith('image'));
              if (firstImageFile) {
                const igThumbnail: GoogleMedia = {
                  isThumbnail: true,
                  photoBlob: firstImageFile,
                  fileName: firstImageFile.name,
                  url: URL.createObjectURL(firstImageFile),
                };
                setPendingIgThumbnail(igThumbnail);
              }
            }

            // Google photos are fetched by the separate fetchGoogleMedia effect





            toast.success(`Found location: ${transformedPlace.name} (${validInstagramFiles.length} Instagram photos)`);
          } else {
            toast.error("Could not find location on Google Maps");
          }
        } catch (error) {
          console.error("Error loading Instagram data:", error);
          toast.error("Failed to load Instagram post data");
        } finally {
          setIsImagesLoading(false);
        }
      };

      loadInstagramData();
    }
  }, [searchParams, type]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);


  // Removing an image only changes the draft. On save, the canonical update detaches it, and the
  // media cleanup sweep removes the stored object (P5-6/P5-10).
  const handleRemoveImage = (image: GoogleMedia) => {
    setFetchedGoogleMedia((prevMedia) => prevMedia.filter((img) => img !== image));
    setFetchedImageDeleteModal(false);
  };

  const handleSetAsThumbnail = (image: GoogleMedia) => {
    setFetchedGoogleMedia((prevImages) =>
      prevImages.map((img) => ({
        ...img,
        isThumbnail: img === image,
      }))
    );
  };

  const handleButtonClick = () => {
    // Find the submit button inside the form directly
    const directSubmitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (directSubmitBtn) {
      directSubmitBtn.click();
      return;
    }

    // Fallback: Get all form elements and search for submit buttons
    const forms = document.querySelectorAll("form");
    for (const form of Array.from(forms)) {
      const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      if (submitButton) {
        submitButton.click();
        return;
      }
    }
  };

  // Handle Instagram profile scraping for person recommendations
  const handleInstagramProfileScrape = async (input: string): Promise<{
    fullName: string;
    profileUrl: string;
    profilePicture: string;
  } | null> => {
    // Extract username from input (could be @username, username, or full URL)
    let username = input.trim();

    // Handle full URL: instagram.com/username
    const urlMatch = username.match(/instagram\.com\/([^/?]+)/);
    if (urlMatch) {
      username = urlMatch[1];
    }

    // Remove @ prefix
    username = username.replace(/^@/, '');

    // Skip non-Instagram inputs (LinkedIn URLs, etc.)
    if (!username || username.includes('linkedin.com') || username.includes(' ')) {
      return null;
    }

    try {
      setIsScrapingProfile(true);
      toast.info(`Scraping Instagram profile: @${username}...`);

      const token = localStorage.getItem('qrtoken');
      const INSTAGRAM_API_URL = import.meta.env.VITE_INSTAGRAM_API_URL || 'http://localhost:5000';

      const response = await axios.post(
        `${INSTAGRAM_API_URL}/api/instagram/account-posts`,
        { username, maxScrolls: 5 },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.data?.success || !response.data?.data) {
        toast.error('Could not scrape Instagram profile');
        return null;
      }

      const profileData = response.data.data;
      const { fullName, profilePicture, posts, username: scrapedUsername } = profileData;

      // 1. Fetch profile picture via proxy and set as thumbnail
      if (profilePicture) {
        try {
          const proxyUrl = `${INSTAGRAM_API_URL}/api/instagram/media-proxy?url=${encodeURIComponent(profilePicture)}&token=${token}`;
          const pfpResponse = await fetch(proxyUrl);
          if (pfpResponse.ok) {
            const pfpBlob = await pfpResponse.blob();
            const pfpFile = new File([pfpBlob], `${scrapedUsername}-profile.jpg`, { type: pfpBlob.type || 'image/jpeg' });
            const pfpThumbnail: GoogleMedia = {
              isThumbnail: true,
              photoBlob: pfpFile,
              fileName: pfpFile.name,
              url: URL.createObjectURL(pfpFile),
            };
            setFetchedGoogleMedia([pfpThumbnail]);
            setShowGoogleMedia(true);
          }
        } catch (err) {
          console.error('Error fetching profile picture:', err);
        }
      }

      // 2. Collect media from all posts (up to 10 items total)
      const collectedIgMedia: GoogleMedia[] = [];
      const MAX_MEDIA = 10;

      for (const post of posts) {
        if (collectedIgMedia.length >= MAX_MEDIA) break;
        for (const media of post.media) {
          if (collectedIgMedia.length >= MAX_MEDIA) break;
          try {
            const proxyUrl = `${INSTAGRAM_API_URL}/api/instagram/media-proxy?url=${encodeURIComponent(media.url)}&token=${token}`;
            const mediaResponse = await fetch(proxyUrl);
            if (mediaResponse.ok) {
              const mediaBlob = await mediaResponse.blob();
              const ext = media.type === 'video' ? 'mp4' : 'jpg';
              const fileName = `${scrapedUsername}-${post.shortcode}-${collectedIgMedia.length}.${ext}`;
              const mediaFile = new File(
                [mediaBlob],
                fileName,
                { type: mediaBlob.type || (media.type === 'video' ? 'video/mp4' : 'image/jpeg') }
              );
              collectedIgMedia.push({
                photoBlob: mediaFile,
                fileName,
                url: URL.createObjectURL(mediaFile),
              });
            }
          } catch (err) {
            console.error('Error fetching post media:', err);
          }
        }
      }

      // 3. Store scraped media in dedicated Instagram media state
      if (collectedIgMedia.length > 0) {
        setInstagramMedia(collectedIgMedia);
      }

      const profileUrl = `https://www.instagram.com/${scrapedUsername}/`;

      toast.success(`Scraped @${scrapedUsername}: ${fullName} (${posts.length} posts, ${collectedIgMedia.length} media files)`);

      return {
        fullName: fullName || scrapedUsername,
        profileUrl,
        profilePicture: profilePicture || '',
      };
    } catch (error) {
      console.error('Error scraping Instagram profile:', error);
      toast.error('Failed to scrape Instagram profile. The account may be private.');
      return null;
    } finally {
      setIsScrapingProfile(false);
    }
  };

  // Show loading if fetching place data in edit mode
  // The full-screen loader can never replace an already hydrated form.
  if (type === "edit" && isPlaceLoading && !editHydration) {
    return (
      <div className="flex bg-dashboard-bg z-50 items-center justify-center min-h-screen">
        <EarthLoader context="general" size="small" />
      </div>
    );
  }

  return (
    <div className="bg-dashboard-bg min-h-screen px-4 pb-4 md:pt-1 0 ">
      {/* Content-area overlay loader — portaled to body, offset to leave sidebar visible */}
      {isLoading && ReactDOM.createPortal(
        <div
          style={{
            position: "fixed",
            // Leave the sidebar visible — matches the CSS-variable-driven sidebar width
            top: 0,
            right: 0,
            bottom: 0,
            left: "var(--sidebar-width, 256px)",
            zIndex: 9999,
            backgroundColor: (() => {
              const themeEl = document.querySelector(".dashboard-theme");
              if (themeEl) {
                const val = getComputedStyle(themeEl).getPropertyValue("--dash-bg").trim();
                if (val) return val;
              }
              return "#060608";
            })(),
          }}
        >
          <EarthLoader context="general" statusMessage="Adding recommendation..." />
        </div>,
        document.body
      )}
      {(
        <div className="flex relative flex-col mb-10 items-center max-w-full gap-4">
          <div className="flex flex-row gap-4 md:w-[70%] w-full md:justify-between justify-between md:mt-0 mt-4 mx-6 md:mx-0 items-center">
            <Button
              size="xsmall"
              variant="ghost"
              onClickHandler={() => navigate("/recommendations")}
              startIcon={<BackIcon stroke="var(--dash-accent)" size="size-6" />}
            />
          </div>

          {hasMediaFailure && (
            <div
              role="alert"
              data-media-status={mediaStatus}
              className="w-full max-w-3xl rounded-xl border border-amber-400/50 bg-amber-400/10 p-4 text-dashboard"
            >
              <h2 className="font-poppins text-sm font-semibold">
                Place saved; image needs attention
              </h2>
              <p className="mt-1 font-poppins text-xs text-dashboard-light">
                {mediaFeedback}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void retryMediaUpload()}
                  className="min-h-11 rounded-lg bg-dashboard-accent px-4 font-poppins text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Retry image save
                </button>
                <button
                  type="button"
                  onClick={() => void continueWithoutImage()}
                  className="min-h-11 rounded-lg border border-dashboard px-4 font-poppins text-sm font-semibold text-dashboard transition-colors hover:border-dashboard-accent"
                >
                  Continue without image
                </button>
              </div>
            </div>
          )}

          {/* Recommendation Type Selector - Only show for new recommendations (not edit) */}
          {type !== "edit" && (
            <div className="w-full max-w-3xl mb-4 flex flex-row items-center justify-between gap-4">
              <label className="text-xs font-poppins text-dashboard font-semibold whitespace-nowrap">
                Recommendation Type
                <span className="text-white-danger font-poppins text-sm font-medium ml-1">
                  *
                </span>
              </label>
              <div className="relative inline-block w-auto min-w-[180px]" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full px-4 py-2.5 text-left border border-dashboard rounded-lg shadow-sm outline-none focus:ring-2 hover:ring-1 text-sm hover:ring-dashboard-accent font-poppins focus:ring-dashboard-accent bg-dashboard-muted text-dashboard flex items-center justify-between transition-all duration-200 hover:border-dashboard-accent"
                >
                  <span className="font-medium">{recommendationType === "place" ? t("dashboard.recommendations.addRecommendationForm.recommendationType.place") : t("dashboard.recommendations.addRecommendationForm.recommendationType.person")}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-4 w-4 text-dashboard-light transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""
                      }`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                {isDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1.5 bg-dashboard-sidebar border border-dashboard rounded-lg shadow-dashboard-elevated overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setRecommendationType("place");
                        setIsDropdownOpen(false);
                        setPlaces(null);
                        setFetchedGoogleMedia([]);
                        setShowGoogleMedia(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm font-poppins text-dashboard hover:bg-dashboard-accent hover:text-dashboard transition-colors duration-150 ${recommendationType === "place" ? "bg-dashboard-accent/20 text-dashboard-accent font-medium" : ""
                        }`}
                    >
                      {t("dashboard.recommendations.addRecommendationForm.recommendationType.place")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRecommendationType("person");
                        setIsDropdownOpen(false);
                        setPlaces(null);
                        setFetchedGoogleMedia([]);
                        setShowGoogleMedia(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm font-poppins text-dashboard hover:bg-dashboard-accent hover:text-dashboard transition-colors duration-150 ${recommendationType === "person" ? "bg-dashboard-accent/20 text-dashboard-accent font-medium" : ""
                        }`}
                    >
                      {t("dashboard.recommendations.addRecommendationForm.recommendationType.person")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {editConflict && <div role="alert">This recommendation changed. Your draft is retained.<button type="button" onClick={async()=>{
            if(!placeId || !editHydration)return;
            const captured=catalogScope;
            reviewController.current?.abort();const controller=new AbortController();reviewController.current=controller;
            try{const observation=await PlacesClient.observeRecommendation(placeId,controller.signal);if(controller.signal.aborted||editHydrationScope.current!==captured)return;setHydration(previous=>previous&&previous.scope===captured?{...previous,observation}:previous);clearEditConflict();setReviewMessage('Current revision loaded. Review your draft, then save again.');setReviewVersion(n=>n+1);}catch(error){if(!controller.signal.aborted)toast.error(error instanceof Error?error.message:'Refresh failed');}
          }}>Refresh and review</button></div>}
          {reviewMessage && <div>
            <p role="status">{reviewMessage}</p>
            <dl>
              <dt>Current saved title</dt><dd>{editObservation?.detail.displayTitle}</dd>
              <dt>Current saved category</dt><dd>{editObservation?.detail.placesTaxonomy?.category?.label ?? editObservation?.detail.placesTaxonomy?.category?.id ?? 'Unassigned'}{editObservation?.detail.placesTaxonomy?.category?.unavailable ? ' (unavailable)' : ''}</dd>
              <dt>Current saved subcategory</dt><dd>{editObservation?.detail.placesTaxonomy?.subcategory?.label ?? editObservation?.detail.placesTaxonomy?.subcategory?.id ?? 'No subcategory'}{editObservation?.detail.placesTaxonomy?.subcategory?.unavailable ? ' (unavailable)' : ''}</dd>
            </dl>
          </div>}
          <RecommendationForm
            onDraftChange={retireDraftIntent}
            ref={formRef}
            categories={fetchedCategories.recommendationCategories}
            taxonomyState={catalogError ? "error" : !catalog ? "loading" : catalog.state === "UNCONFIGURED" ? "unconfigured" : "configured"}
            taxonomyError={catalogError}
            retryTaxonomy={()=>setCatalogAttempt(n=>n+1)}
            setPlaces={setPlaces}
            places={places}
            isCustom={true}
            type={type}
            recommendationType={recommendationType}
            initialValues={type === "edit" ? editInitialValues : initialValues}
            validationSchema={validationSchema}
            onSubmit={type === "edit" ? handleUpdatePlaceDetails : handleSubmit}
            formFields={formFields}
            placeId={placeId}
            onInstagramProfileScrape={handleInstagramProfileScrape}
            isScrapingProfile={isScrapingProfile}
          />
          {/* Media powered by Google — shows skeleton while loading, images once ready */}
          {(isImagesLoading && type !== "edit" && recommendationType === "place" && places?.place_id) && (
            <div className="w-full max-w-3xl mb-10 bg-dashboard-sidebar md:p-10 p-7 rounded-md shadow-dashboard-elevated">
              <div>
                <div className="flex text-white flex-row gap-2 w-full items-center mb-5">
                  <h2 className="dt-label">Media</h2>
                  <span className="text-white-danger text-[0.6rem] font-poppins">
                    <em>powered by Google</em>
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-[0.65rem] font-poppins text-dashboard-light animate-pulse">
                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Fetching photos…
                  </span>
                </div>
                <div className="relative mt-2 grid grid-cols-2 md:flex md:flex-row md:flex-wrap md:gap-6 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-32 w-32 rounded-xl overflow-hidden relative"
                      style={{ background: "var(--dash-muted, #1e2530)" }}
                    >
                      {/* shimmer overlay */}
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
                          backgroundSize: "200% 100%",
                          animation: `skeletonShimmer 1.4s ease-in-out ${i * 0.15}s infinite`,
                        }}
                      />
                      {/* subtle image icon */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-20">
                        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor">
                          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-8.5-5.5l2.5 3.01L18 14l3 4H3l4.5-6 3 4z" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isImagesLoading && fetchedGoogleMedia?.length > 0 && (
            <div className="w-full max-w-3xl mb-10 bg-dashboard-sidebar md:p-10 p-7 rounded-md shadow-dashboard-elevated">
              <div>
                <div className=" flex text-white   flex-row gap-2  w-full  items-center">
                  {type === "edit" ? (
                    <>
                      <h2 className="dt-label">Uploaded Media</h2>
                    </>
                  ) : (
                    <>
                      <h2 className="dt-label">Media</h2>
                      <span className="text-white-danger text-[0.6rem] font-poppins">
                        <em>{recommendationType === "person" ? "Profile Picture" : "powered by Google"}</em>
                      </span>
                    </>
                  )}
                </div>

                <div className="md:p-4">
                  {showGoogleMedia &&
                    fetchedGoogleMedia.length > 0 && (
                      <div className="relative mt-4 grid grid-cols-2 md:flex md:flex-row md:flex-wrap md:gap-6 gap-4">
                        {fetchedGoogleMedia.map(
                          (
                            image: {
                              documentId?: string;
                              photoBlob?: Blob;
                              url?: string;
                              fileName?: string;
                              isThumbnail?: boolean;
                            },
                            index: number
                          ) => (
                            <div
                              key={image.documentId ?? index}
                              className={`relative rounded-2xl ${image.isThumbnail &&
                                "border-2 p-1 border-white-accent"
                                }`}
                            >
                              <img
                                src={image.url}
                                alt={t("dashboard.recommendations.addRecommendationForm.imagePreview.alt")}
                                className={`object-cover  cursor-pointer h-32 w-32 rounded-xl `}
                              />
                              {/* Shared icon badge */}
                              <div className="absolute top-1.5 right-1.5 flex flex-col items-center bg-black/75 backdrop-blur-sm border border-white/15 rounded-xl shadow-lg overflow-hidden">
                                <button
                                  className="flex items-center justify-center w-7 h-7 hover:bg-red-600/70 transition-colors duration-200 focus:outline-none"
                                  data-tooltip-id={"Delete"}
                                  onClick={() =>
                                    setFetchedImageDeleteModal(true)
                                  }
                                >
                                  <DeleteIcon
                                    stroke="var(--dash-danger)"
                                    size="size-4"
                                  />
                                </button>
                                <Tooltip
                                  style={{ fontSize: "12px" }}
                                  id={"Delete"}
                                  place="right"
                                >
                                  {t("dashboard.recommendations.addRecommendationForm.imagePreview.deleteTooltip")}
                                </Tooltip>
                                <div className="w-full h-px bg-white/10" />
                                <button
                                  className="flex items-center justify-center w-7 h-7 hover:bg-yellow-500/30 transition-colors duration-200 focus:outline-none"
                                  data-tooltip-id={"thumbnail"}
                                  onClick={() => handleSetAsThumbnail(image)}
                                >
                                  <StarIcon
                                    size="size-[0.9rem]"
                                    fillColor={image.isThumbnail ? "yellow" : "white"}
                                  />
                                </button>
                                <Tooltip
                                  style={{ fontSize: "12px" }}
                                  id={"thumbnail"}
                                  place="right"
                                >
                                  {t("dashboard.recommendations.addRecommendationForm.imagePreview.setThumbnailTooltip")}
                                </Tooltip>
                              </div>
                              {fetchedImageDeleteModal && (
                                <Modal
                                  isOpen={fetchedImageDeleteModal}
                                  onClose={() =>
                                    setFetchedImageDeleteModal(false)
                                  }
                                >
                                  <div className="p-4">
                                    <h2 className="text-md font-poppins font-medium">
                                      {t("dashboard.recommendations.addRecommendationForm.imagePreview.confirmDeleteTitle")}
                                    </h2>
                                    <p className=" font-poppins text-sm text-gray-600">
                                      {t("dashboard.recommendations.addRecommendationForm.imagePreview.confirmDeleteMessage")}
                                    </p>
                                    <div className="flex justify-end gap-2 mt-4">
                                      <Button
                                        btnText={t("dashboard.recommendations.addRecommendationForm.imagePreview.cancel")}
                                        onClickHandler={() =>
                                          setFetchedImageDeleteModal(false)
                                        }
                                        size="small"
                                        variant="google"
                                      />
                                      <Button
                                        btnText={t("dashboard.recommendations.addRecommendationForm.imagePreview.confirm")}
                                        onClickHandler={() => {
                                          handleRemoveImage(image);
                                        }}
                                        size="small"
                                        variant="danger"
                                      />
                                    </div>
                                  </div>
                                </Modal>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Instagram Scraped Media Section */}
          {instagramMedia.length > 0 && (
            <div className="w-full max-w-3xl mb-10 bg-dashboard-sidebar md:p-10 p-7 rounded-md shadow-dashboard-elevated">
              <div>
                <div className="flex text-white flex-row gap-2 w-full items-center">
                  <h2 className="dt-label">Media</h2>
                  <span className="text-white-danger text-[0.6rem] font-poppins">
                    <em>powered by Instagram</em>
                  </span>
                </div>

                <div className="md:p-4">
                  <div className="relative mt-4 grid grid-cols-2 md:flex md:flex-row md:flex-wrap md:gap-6 gap-4">
                    {instagramMedia.map((media, index) => {
                      const isVideo = media.fileName?.endsWith('.mp4');
                      return (
                        <div
                          key={index}
                          className="relative rounded-2xl"
                        >
                          {isVideo ? (
                            <video
                              src={media.url}
                              className="object-cover cursor-pointer h-32 w-32 rounded-xl"
                              controls
                              muted
                            />
                          ) : (
                            <img
                              src={media.url}
                              alt={`Instagram media ${index + 1}`}
                              className="object-cover cursor-pointer h-32 w-32 rounded-xl"
                            />
                          )}
                          <div className="absolute top-1.5 right-1.5">
                            <button
                              className="flex items-center justify-center w-7 h-7 rounded-lg bg-black/70 border border-white/10 shadow-lg backdrop-blur-sm hover:bg-red-600/80 transition-all duration-200 focus:outline-none"
                              onClick={() =>
                                setInstagramMedia((prev) =>
                                  prev.filter((_, i) => i !== index)
                                )
                              }
                            >
                              <CrossIcon size="4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="w-full max-w-3xl mb-10 bg-dashboard-sidebar p-10 rounded-md shadow-dashboard-elevated">
            <div>

              <div className="relative flex text-white   flex-row gap-14  w-full  items-center">
                <h2 className=" font-poppins text-sm ">
                  {t(
                    "dashboard.recommendations.addRecommendationForm.fileUpload.text"
                  )}
                </h2>
                <span className="absolute left-36 -top-2 text-red-500 text-[0.6rem] font-poppins">
                  <em>
                    {t(
                      "dashboard.recommendations.addRecommendationForm.fileUpload.subtext"
                    )}
                    *
                  </em>

                </span>
                <SwitchButton
                  variant="purple"
                  isChecked={showUserMedia}
                  onChange={() => setShowUserMedia((prev) => !prev)}
                />
              </div>

              <div className="flex flex-row mt-4 gap-5 items-center">
                {showUserMedia &&
                  previewUrl.length > 0 &&
                  previewUrl.map((mediaItem, index: number) => (
                    <div className="relative" key={index}>
                      {mediaItem.type === "video" ? (
                        <video
                          src={mediaItem.url}
                          className="object-cover h-32 w-32 rounded-xl"
                          controls
                          muted
                        />
                      ) : (
                        <img
                          src={mediaItem.url}
                          alt={t("dashboard.recommendations.addRecommendationForm.imagePreview.alt")}
                          className="object-cover h-32 w-32 rounded-xl"
                        />
                      )}
                      <span
                        className="absolute -top-2 -right-2 bg-white-danger p-1 rounded-full flex items-center justify-center cursor-pointer text-white"
                        onClick={() =>
                          handleDeleteUserImage(mediaItem.url, index)
                        }
                      >
                        <CrossIcon size="4" />
                      </span>
                    </div>
                  ))}
                {showUserMedia && previewUrl.length < 10 && (
                  <div
                    className="h-32 w-32 border-dotted border-2 cursor-pointer rounded-xl border-dashboard-accent flex flex-col items-center justify-center"
                    onClick={handleUploadMedia}
                  >
                    <span className="text-dashboard-accent text-3xl font-poppins">+</span>
                    <span className="text-dashboard-accent text-xs font-poppins mt-1">
                      Add Media
                    </span>
                    <span className="text-white text-xs font-poppins">
                      {10 - previewUrl.length} left
                    </span>
                    <input
                      ref={userInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                      onChange={(e) => handleFileChange(e)}
                      className="hidden"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Submit button — disabled while Google media is still loading */}
          <div className="w-full max-w-3xl flex flex-col items-center gap-2 mt-6 mb-16 md:mb-16 md:relative fixed bottom-0 left-0 right-0 py-3 md:py-0 z-50">
            {isImagesLoading && type !== "edit" && recommendationType === "place" && places?.place_id && (
              <p className="text-[0.7rem] font-poppins text-dashboard-light animate-pulse">
                ⏳ Waiting for photos to load before saving…
              </p>
            )}
            <Button
              btnText={`${type === "edit"
                ? t("dashboard.recommendations.addRecommendationForm.mapModal.updateRecommendationButton")
                : t(
                  "dashboard.recommendations.addRecommendationForm.actionButton.text"
                )

                }`}
              type="button"
              onClickHandler={isImagesLoading || hasMediaFailure ? undefined : handleButtonClick}
              endIcon={isImagesLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : <AddIcon size="4" />}
              variant={isImagesLoading || hasMediaFailure ? "google" : "primary"}
              size="medium"
              className={`w-auto text-sm md:text-base py-2 md:py-3 transition-all duration-300 ${isImagesLoading ? "opacity-60 cursor-not-allowed pointer-events-none" : ""
                } ${hasMediaFailure ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default AddRecommendation;
