import React, { useState, useEffect, useRef } from "react";
import {useGuideEditing} from '../context/GuideEditingProvider';
import { toast } from "sonner";
import { Reorder } from "framer-motion";
import TiptapEditor from "../../Favorites/components/TiptapEditor";
import AddressInput from "../../Profile/components/AddressInput";
import { Places } from "../../Profile/types/types";
import {
  htmlToBlocks,
  blocksToHtml,
} from "../../../utils/strapiBlocksConverter";
import ClockIcon from "../../../assets/icons/ClockIcon";
import TransportationIcon from "../../../assets/icons/TransportationIcon";
import StayIcon from "../../../assets/icons/StayIcon";
import Location from "../../../assets/icons/Location";
import BudgetIcon from "../../../assets/icons/BudgetIcon";
import TipsIcon from "../../../assets/icons/TipsIcon";
import DirectionIcon from "../../../assets/icons/DirectionIcon";
import VerticalKebab from "../../../assets/icons/VerticalKebab";
import DeleteIcon from "../../../assets/icons/DeleteIcon";
import BudgetInputModal from "./BudgetInputModal";
import {
  DayPlace,
  TimelineData,
  TransportSegment,
  TravelMode,
  StayData,
  ActivityData,
} from "../types/guideSectionTypes";
import { getPlaceIcon } from "../utils/placeIconMapper";
import { calculateDistance } from "../utils/distanceCalculator";
import {
  getTravelModeConfig,
  calculateTravelTime,
  getTravelModeLabel,
} from "../utils/travelModeConfig";
import { getBudgetDisplayText } from "../utils/priceLevelUtils";
import { TravelModeSelector } from "./TravelModeSelector";
import { isAccommodation } from "../utils/accommodationDetector";
import { isActivity } from "../utils/activityDetector";
import ActivityCard from "./ActivityCard";
import { fetchGooglePlacePhotos } from "../utils/googlePhotosService";
import { fetchPlacePriceLevel } from "../utils/googlePlaceService";
import { uploadActivityPhotos } from "../services/activityPhotoService";
import MediaViewer from "../../../components/ui/MediaViewer";
import { useMediaViewer } from "../../../hooks/useMediaViewer";
import type { MediaItem } from "../../../components/ui/MediaViewer";
import TopPlacesByCategory from "../../Favorites/components/TopPlacesByCategory";

interface GuideSectionFormProps {
  guideDocumentId: string; // Document ID for guide relation
  sectionId?: string; // For edit mode (documentId)
  initialData?: any; // Initial section data for editing
  existingSections?: any[]; // Existing sections to calculate next sequence
  guide?: any; // Guide data to check for multi-city
  onSuccess?: () => void;
  onCancel?: () => void;
  onLoadingChange?: (loading: boolean) => void; // Callback to sync loading state with parent
}

const GuideSectionForm: React.FC<GuideSectionFormProps> = ({
  sectionId,
  initialData,
  existingSections = [],
  guide,
  onSuccess,
  // @ts-expect-error - onCancel is part of the component interface
  onCancel,
  onLoadingChange,
}) => {
  const {addSection, saveSection} = useGuideEditing();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Calculate next sequence number based on existing sections
  const getNextSequence = () => {
    if (existingSections.length === 0) return 1;
    const maxSequence = Math.max(
      ...existingSections.map((s: any) => s.Sequence || 0)
    );
    return maxSequence + 1;
  };

  const [sequence, setSequence] = useState<number>(
    initialData?.Sequence || getNextSequence()
  );
  // @ts-expect-error - loading is used via setLoading throughout the component
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("timeline");

  // Location selection for multi-city guides
  const [selectedLocation, setSelectedLocation] = useState<string>(() => {
    if (initialData?.Map_Details) {
      try {
        const details = typeof initialData.Map_Details === 'string'
          ? JSON.parse(initialData.Map_Details)
          : initialData.Map_Details;
        return details?.location || "";
      } catch (e) {
        return "";
      }
    }
    return "";
  });

  // Day Division state for Timeline tab - now stores arrays of places
  const [morningPlaces, setMorningPlaces] = useState<DayPlace[]>([]);
  const [afternoonPlaces, setAfternoonPlaces] = useState<DayPlace[]>([]);
  const [eveningPlaces, setEveningPlaces] = useState<DayPlace[]>([]);

  // Transport segments state
  const [transportSegments, setTransportSegments] = useState<
    TransportSegment[]
  >([]);

  // Stay accommodations state
  const [stayAccommodations, setStayAccommodations] = useState<DayPlace[]>([]);

  // Activity places state
  const [activityPlaces, setActivityPlaces] = useState<DayPlace[]>([]);

  // Tracks in-flight activity photo uploads so submit can await them before
  // serializing Recommendation_Activity. Without this, saving a day/stop before
  // the Google-photo upload finishes persists an empty photos array, and the
  // guide detail view falls back to placehold.co (the "images don't come back
  // after adding" bug). Each promise resolves to the uploaded photos for a place.
  const pendingActivityUploadsRef = useRef<
    Promise<{ place_id: string; photos: DayPlace["photos"] } | null>[]
  >([]);

  // Travel mode selector state
  const [selectorOpen, setSelectorOpen] = useState<{
    period: "morning" | "afternoon" | "evening";
    fromIndex: number;
  } | null>(null);

  // Kebab menu state for place cards
  const [openKebabMenu, setOpenKebabMenu] = useState<string | null>(null);

  // Tips modal state
  const [editingTips, setEditingTips] = useState<{
    placeId: string;
    period: "morning" | "afternoon" | "evening";
    currentTips: string;
  } | null>(null);

  // Budget modal state
  const [editingBudget, setEditingBudget] = useState<{
    placeId: string;
    period: "morning" | "afternoon" | "evening";
    placeName: string;
    currentBudget?: string;
    budgetAmount?: number;
    budgetCurrency?: string;
    priceLevel?: number;
    priceRange?: string;
  } | null>(null);

  // Unified search state for timeline
  const [timelineSearch, setTimelineSearch] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState<"morning" | "afternoon" | "evening">("morning");
  const [tempTimelinePlace, setTempTimelinePlace] = useState<Places | null>(null);



  // Media viewer for activity photos - track which activity is being viewed
  const { isOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    null
  );


  // Pre-populate form when editing
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.Title || "");
      setSequence(initialData.Sequence || 1);

      // Convert blocks to HTML for the editor
      if (initialData.Description) {
        if (typeof initialData.Description === "string") {
          setDescription(initialData.Description);
        } else if (Array.isArray(initialData.Description)) {
          const htmlContent = blocksToHtml(initialData.Description);
          setDescription(htmlContent);
        }
      }

      // Populate timeline data
      if (initialData.Timeline) {
        try {
          const timeline: TimelineData =
            typeof initialData.Timeline === "string"
              ? JSON.parse(initialData.Timeline)
              : initialData.Timeline;

          // Load places from timeline
          if (timeline.morning && Array.isArray(timeline.morning)) {
            setMorningPlaces(timeline.morning);
          }

          if (timeline.afternoon && Array.isArray(timeline.afternoon)) {
            setAfternoonPlaces(timeline.afternoon);
          }

          if (timeline.evening && Array.isArray(timeline.evening)) {
            setEveningPlaces(timeline.evening);
          }
        } catch {
          // Invalid JSON, skip parsing
        }
      }

      // Populate transport data separately
      if (initialData.Transport) {
        try {
          const transport =
            typeof initialData.Transport === "string"
              ? JSON.parse(initialData.Transport)
              : initialData.Transport;

          if (transport.segments && Array.isArray(transport.segments)) {
            setTransportSegments(transport.segments);
          }
        } catch {
          // Invalid JSON, skip parsing
        }
      }

      // Populate stay data separately
      if (initialData.Stay) {
        try {
          const stay =
            typeof initialData.Stay === "string"
              ? JSON.parse(initialData.Stay)
              : initialData.Stay;

          if (stay.accommodations && Array.isArray(stay.accommodations)) {
            setStayAccommodations(stay.accommodations);
          }
        } catch {
          // Invalid JSON, skip parsing
        }
      }

      // Populate activity data separately
      if (initialData.Recommendation_Activity) {
        try {
          const activity =
            typeof initialData.Recommendation_Activity === "string"
              ? JSON.parse(initialData.Recommendation_Activity)
              : initialData.Recommendation_Activity;

          if (activity.activities && Array.isArray(activity.activities)) {
            setActivityPlaces(activity.activities);
          }
        } catch {
          // Invalid JSON, skip parsing
        }
      }

      // Populate location from Map_Details for multi-city guides
      if (initialData.Map_Details) {
        try {
          const mapDetails =
            typeof initialData.Map_Details === "string"
              ? JSON.parse(initialData.Map_Details)
              : initialData.Map_Details;

          if (mapDetails.location) {
            setSelectedLocation(mapDetails.location);
          }
        } catch {
          // Invalid JSON, skip parsing
        }
      }
    }
  }, [initialData]);

  // Parse multi-city locations from guide Place_Details
  const getMultiCityLocations = () => {
    if (!guide?.Place_Details) return [];

    try {
      let placeDetails: any = guide.Place_Details;
      if (typeof guide.Place_Details === "string") {
        placeDetails = JSON.parse(guide.Place_Details);
      }

      // Check if it's a multi-city format
      if (
        placeDetails?.isMultiCity === true &&
        ((placeDetails.ending || placeDetails.arrival || placeDetails.to) &&
          (placeDetails.starting || placeDetails.departure || placeDetails.from))
      ) {
        const locations: Array<{ value: string; label: string; type: string }> = [];

        // Add Ending location
        const ending = placeDetails.ending || placeDetails.arrival || placeDetails.to;
        if (ending) {
          locations.push({
            value: "ending",
            label: ending.Place_Name || ending.Place_Address || "Ending Point",
            type: "ending",
          });
        }

        // Add Intermediate Cities
        const intermediateCities = placeDetails.intermediateCities || [];
        intermediateCities.forEach((city: any, index: number) => {
          locations.push({
            value: `intermediate-${city.id || index}`,
            label: city.Place_Name || city.Place_Address || `City ${index + 1}`,
            type: "intermediate",
          });
        });

        // Add Starting location
        const starting = placeDetails.starting || placeDetails.departure || placeDetails.from;
        if (starting) {
          locations.push({
            value: "starting",
            label: starting.Place_Name || starting.Place_Address || "Starting Point",
            type: "starting",
          });
        }

        return locations;
      }
    } catch (error) {
      console.error("Error parsing Place_Details for multi-city locations:", error);
    }

    return [];
  };

  const multiCityLocations = getMultiCityLocations();
  const isMultiCityGuide = multiCityLocations.length > 0;

  // Helper function to get location coordinates for suggestions
  const getLocationForSuggestions = (): {
    locationName?: string;
    locationCoords?: { lat: number; lng: number } | null;
  } => {
    // For multi-city guides, require selectedLocation to be set
    if (isMultiCityGuide) {
      if (!selectedLocation) {
        // No location selected - return empty to prevent showing suggestions
        return {
          locationName: undefined,
          locationCoords: null,
        };
      }

      // Multi-city guide: use the selected location for this itinerary
      const selectedLocationData = multiCityLocations.find(
        (loc) => loc.value === selectedLocation
      );
      if (selectedLocationData) {
        // Try to get coordinates from guide Place_Details
        try {
          let placeDetails: any = guide?.Place_Details;
          if (typeof guide?.Place_Details === "string") {
            placeDetails = JSON.parse(guide.Place_Details);
          }

          let locationData: any = null;
          if (selectedLocationData.type === "starting") {
            locationData = placeDetails?.starting || placeDetails?.departure || placeDetails?.from;
          } else if (selectedLocationData.type === "ending") {
            locationData = placeDetails?.ending || placeDetails?.arrival || placeDetails?.to;
          } else if (selectedLocationData.type === "intermediate") {
            const intermediateCities = placeDetails?.intermediateCities || [];
            const cityId = selectedLocationData.value.replace("intermediate-", "");
            locationData = intermediateCities.find(
              (city: any) => city.id === cityId || city.Place_Name === selectedLocationData.label
            );
          }

          if (locationData?.Geometry) {
            return {
              locationName: selectedLocationData.label,
              locationCoords: {
                lat: parseFloat(locationData.Geometry.lat?.toString() || "0"),
                lng: parseFloat(locationData.Geometry.lng?.toString() || "0"),
              },
            };
          }
        } catch (error) {
          console.error("Error parsing location data:", error);
        }
      }
      return {
        locationName: selectedLocationData?.label,
        locationCoords: null,
      };
    } else {
      // Single-city guide: use the guide's main location
      try {
        let placeDetails: any = guide?.Place_Details;
        if (typeof guide?.Place_Details === "string") {
          placeDetails = JSON.parse(guide.Place_Details);
        } else if (!placeDetails && guide?.Place_Details) {
          placeDetails = guide.Place_Details;
        }

        if (placeDetails) {
          const locationName =
            placeDetails.Place_Name || placeDetails.Place_Address || "";
          const locationCoords =
            placeDetails.Geometry?.lat && placeDetails.Geometry?.lng
              ? {
                lat: parseFloat(placeDetails.Geometry.lat.toString()),
                lng: parseFloat(placeDetails.Geometry.lng.toString()),
              }
              : null;

          return {
            locationName,
            locationCoords,
          };
        }
      } catch (error) {
        console.error("Error parsing single-city location:", error);
      }
    }

    return {
      locationName: undefined,
      locationCoords: null,
    };
  };

  // Handle outside clicks to close suggestions

  // Auto-add place when selected from Google autocomplete
  useEffect(() => {
    if (tempTimelinePlace) {
      addPlaceToSegment(selectedPeriod, tempTimelinePlace);
      setTempTimelinePlace(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempTimelinePlace, selectedPeriod]);

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
  };

  /**
   * Get or create a transport segment between two places
   * Returns existing segment or creates a default "drive" segment
   */
  const getTransportSegment = (
    fromPlace: DayPlace,
    toPlace: DayPlace
  ): TransportSegment | undefined => {
    // Check if segment already exists
    const existingSegment = transportSegments.find(
      (seg) =>
        seg.fromPlaceId === fromPlace.id &&
        seg.toPlaceId === toPlace.id
    );

    if (existingSegment) {
      return existingSegment;
    }

    // Create default segment if both places have geometry
    if (fromPlace.geometry && toPlace.geometry) {
      const distanceKm = calculateDistance(
        fromPlace.geometry.location.lat,
        fromPlace.geometry.location.lng,
        toPlace.geometry.location.lat,
        toPlace.geometry.location.lng
      );

      const defaultMode: TravelMode = "drive";
      const estimatedMinutes = calculateTravelTime(distanceKm, defaultMode);

      return {
        fromPlaceId: fromPlace.id,
        toPlaceId: toPlace.id,
        mode: defaultMode,
        distanceKm,
        estimatedMinutes,
      };
    }

    return undefined;
  };

  /**
   * Update or create a transport segment
   */
  const updateTransportSegment = (
    fromPlace: DayPlace,
    toPlace: DayPlace,
    mode: TravelMode
  ) => {
    // Calculate distance
    const existing = transportSegments.find(seg => seg.fromPlaceId === fromPlace.id && seg.toPlaceId === toPlace.id);
    if ((!fromPlace.geometry || !toPlace.geometry) && !existing) return;

    const distanceKm = fromPlace.geometry && toPlace.geometry ? calculateDistance(
      fromPlace.geometry.location.lat,
      fromPlace.geometry.location.lng,
      toPlace.geometry.location.lat,
      toPlace.geometry.location.lng
    ) : existing!.distanceKm;

    const estimatedMinutes = distanceKm === null ? null : calculateTravelTime(distanceKm, mode);

    const newSegment: TransportSegment = {
      fromPlaceId: fromPlace.id,
      toPlaceId: toPlace.id,
      mode,
      distanceKm,
      estimatedMinutes,
    };

    setTransportSegments((prev) => {
      // Remove existing segment if it exists
      const filtered = prev.filter(
        (seg) =>
          !(
            seg.fromPlaceId === fromPlace.id &&
            seg.toPlaceId === toPlace.id
          )
      );
      return [...filtered, newSegment];
    });

    toast.success(`Travel mode updated to ${mode}`);
  };

  /**
   * Converts GooglePlace from TopPlacesByCategory to Places format
   * @param googlePlace - GooglePlace from TopPlacesByCategory
   * @returns Places object compatible with addPlaceToSegment
   */
  const convertGooglePlaceToPlaces = (googlePlace: any): Places => {
    const lat = googlePlace.location?.latitude || 0;
    const lng = googlePlace.location?.longitude || 0;

    // Create a mock google.maps.places.PlaceResult-like object
    const mockPlace: Places = {
      name: googlePlace.displayName?.text || "",
      place_id: googlePlace.id || "",
      formatted_address: "", // Will be fetched if needed
      geometry: {
        location: {
          lat: () => lat,
          lng: () => lng,
        },
      },
      types: googlePlace.primaryType ? [googlePlace.primaryType] : [],
      address_components: [], // Empty array for address components
    };

    return mockPlace;
  };

  /**
   * Handles place selection from TopPlacesByCategory suggestions
   * @param period - The time period (morning, afternoon, evening)
   * @param googlePlace - GooglePlace from TopPlacesByCategory
   */
  const handleSuggestionPlaceSelect = (
    period: "morning" | "afternoon" | "evening",
    googlePlace: any
  ) => {
    const placesFormat = convertGooglePlaceToPlaces(googlePlace);
    addPlaceToSegment(period, placesFormat);
  };

  /**
   * Adds a Google Place to a specific time segment (morning, afternoon, or evening)
   * Converts the Google Places API result to our DayPlace format and saves it
   * Also auto-adds to Stay tab if the place is an accommodation
   * Fetches price level from Google Places API asynchronously
   * @param segment - The time segment to add the place to
   * @param place - The Google Places API result object
   */
  const addPlaceToSegment = (
    segment: "morning" | "afternoon" | "evening",
    place: Places
  ) => {
    const placeId = `${Date.now()}-${Math.random()}`;
    const newPlace: DayPlace = {
      id: placeId,
      name: place.name || "",
      formatted_address: place.formatted_address || "",
      place_id: place.place_id || "",
      geometry: place.geometry
        ? {
          location: {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          },
        }
        : undefined,
      types: place.types || [], // Capture place types for dynamic icon rendering
      // priceLevel and priceRange will be fetched asynchronously below
    };

    if (segment === "morning") {
      setMorningPlaces((prev) => [...prev, newPlace]);
    } else if (segment === "afternoon") {
      setAfternoonPlaces((prev) => [...prev, newPlace]);
    } else if (segment === "evening") {
      setEveningPlaces((prev) => [...prev, newPlace]);
    }

    // Clear unified search state
    setTimelineSearch("");
    setTempTimelinePlace(null);

    // Fetch price level and price range asynchronously and update the place
    if (place.place_id) {
      fetchPlacePriceLevel(place.place_id)
        .then((priceInfo) => {
          if (priceInfo) {
            // Update the place with price level and price range
            if (segment === "morning") {
              setMorningPlaces((prev) =>
                prev.map((p) =>
                  p.id === placeId
                    ? { ...p, priceLevel: priceInfo.priceLevel, priceRange: priceInfo.priceRange }
                    : p
                )
              );
            } else if (segment === "afternoon") {
              setAfternoonPlaces((prev) =>
                prev.map((p) =>
                  p.id === placeId
                    ? { ...p, priceLevel: priceInfo.priceLevel, priceRange: priceInfo.priceRange }
                    : p
                )
              );
            } else if (segment === "evening") {
              setEveningPlaces((prev) =>
                prev.map((p) =>
                  p.id === placeId
                    ? { ...p, priceLevel: priceInfo.priceLevel, priceRange: priceInfo.priceRange }
                    : p
                )
              );
            }
          }
        })
        .catch((error) => {
          console.error("Error fetching price info:", error);
          // Silently fail - price info is optional
        });
    }

    // Auto-add to Stay tab if the place is an accommodation
    if (isAccommodation(newPlace.types)) {
      setStayAccommodations((prev) => {
        // Check if accommodation already exists
        const exists = prev.some((acc) => acc.place_id === newPlace.place_id);
        if (!exists) {
          return [...prev, newPlace];
        }
        return prev;
      });
    }

    // Auto-add to Activities tab if the place is an activity/attraction
    if (isActivity(newPlace.types)) {
      const alreadyExists = activityPlaces.some(
        (act) => act.place_id === newPlace.place_id
      );

      if (!alreadyExists) {
        // Show toast for activity detection
        toast.success("Activity found!");

        // Keep the updater pure: React may replay it in StrictMode.
        const activityWithLoadingState = {
          ...newPlace,
          photosLoading: true,
          photos: [],
        };
        setActivityPlaces((prev) => [...prev, activityWithLoadingState]);

        // Launch once from the event handler and retain the promise so submit
        // can await the photos before persisting the activity.
        pendingActivityUploadsRef.current.push(
          fetchAndUploadActivityPhotos(activityWithLoadingState)
        );
      }
    }

    toast.success(`Added ${place.name} to ${segment}`);
  };

  /**
   * Fetch photos from Google Places and upload to Strapi
   * Updates the activity place with uploaded photos
   */
  const fetchAndUploadActivityPhotos = async (activity: DayPlace) => {
    try {
      // Fetch photos from Google Places API
      const photos = await fetchGooglePlacePhotos(activity.place_id, 6);

      if (photos.length === 0) {
        // No photos found, update loading state
        setActivityPlaces((prev) =>
          prev.map((act) =>
            act.place_id === activity.place_id
              ? { ...act, photosLoading: false, photos: [] }
              : act
          )
        );
        return { place_id: activity.place_id, photos: [] };
      }


      const uploadedPhotos = await uploadActivityPhotos(photos);

      // Update activity with uploaded photos
      setActivityPlaces((prev) =>
        prev.map((act) =>
          act.place_id === activity.place_id
            ? { ...act, photos: uploadedPhotos, photosLoading: false }
            : act
        )
      );

      // No toast notification - photos load silently in background
      return { place_id: activity.place_id, photos: uploadedPhotos };
    } catch (error) {
      console.error("Error fetching/uploading activity photos:", error);

      // Update loading state on error
      setActivityPlaces((prev) =>
        prev.map((act) =>
          act.place_id === activity.place_id
            ? { ...act, photosLoading: false, photos: [] }
            : act
        )
      );
      return { place_id: activity.place_id, photos: [] };
    }
  };

  /**
   * Removes a place from a specific time segment
   * Also removes from Stay tab if it's an accommodation
   * @param segment - The time segment to remove the place from
   * @param placeId - The unique ID of the place to remove
   */
  const removePlaceFromSegment = (
    segment: "morning" | "afternoon" | "evening",
    placeId: string
  ) => {
    let removedPlace: DayPlace | undefined;

    if (segment === "morning") {
      removedPlace = morningPlaces.find((p) => p.id === placeId);
      setMorningPlaces((prev) => prev.filter((p) => p.id !== placeId));
    } else if (segment === "afternoon") {
      removedPlace = afternoonPlaces.find((p) => p.id === placeId);
      setAfternoonPlaces((prev) => prev.filter((p) => p.id !== placeId));
    } else if (segment === "evening") {
      removedPlace = eveningPlaces.find((p) => p.id === placeId);
      setEveningPlaces((prev) => prev.filter((p) => p.id !== placeId));
    }
    setTransportSegments(prev => prev.filter(seg => seg.fromPlaceId !== placeId && seg.toPlaceId !== placeId));

    // Remove from Stay tab if it's an accommodation
    if (removedPlace && isAccommodation(removedPlace.types)) {
      setStayAccommodations((prev) =>
        prev.filter((acc) => acc.place_id !== removedPlace!.place_id)
      );
    }

    // Remove from Activities tab if it's an activity
    if (removedPlace && isActivity(removedPlace.types)) {
      setActivityPlaces((prev) =>
        prev.filter((act) => act.place_id !== removedPlace!.place_id)
      );
    }
  };

  /**
   * Update tips for a specific place
   * @param segment - The time segment (morning, afternoon, evening)
   * @param placeId - The unique ID of the place
   * @param tips - The tips text to save
   */
  const updatePlaceTips = (
    segment: "morning" | "afternoon" | "evening",
    placeId: string,
    tips: string
  ) => {
    if (segment === "morning") {
      setMorningPlaces((prev) =>
        prev.map((place) => (place.id === placeId ? { ...place, tips } : place))
      );
    } else if (segment === "afternoon") {
      setAfternoonPlaces((prev) =>
        prev.map((place) => (place.id === placeId ? { ...place, tips } : place))
      );
    } else if (segment === "evening") {
      setEveningPlaces((prev) =>
        prev.map((place) => (place.id === placeId ? { ...place, tips } : place))
      );
    }

    toast.success("Tips updated successfully!");
    setEditingTips(null);
  };

  /**
   * Save custom budget for a place in a specific segment (legacy string format)
   */
  const handleSaveBudget = (
    segment: "morning" | "afternoon" | "evening",
    placeId: string,
    customBudget: string
  ) => {
    if (segment === "morning") {
      setMorningPlaces((prev) =>
        prev.map((place) =>
          place.id === placeId ? { ...place, customBudget } : place
        )
      );
    } else if (segment === "afternoon") {
      setAfternoonPlaces((prev) =>
        prev.map((place) =>
          place.id === placeId ? { ...place, customBudget } : place
        )
      );
    } else if (segment === "evening") {
      setEveningPlaces((prev) =>
        prev.map((place) =>
          place.id === placeId ? { ...place, customBudget } : place
        )
      );
    }

    if (customBudget) {
      toast.success("Custom budget updated successfully!");
    } else {
      toast.success("Custom budget removed!");
    }
    setEditingBudget(null);
  };

  /**
   * Save budget with currency format (new format)
   */
  const handleSaveBudgetCurrency = (
    segment: "morning" | "afternoon" | "evening",
    placeId: string,
    amount: number,
    currency: string
  ) => {
    const updatePlace = (place: any) => {
      if (amount > 0) {
        return {
          ...place,
          budgetAmount: amount,
          budgetCurrency: currency,
          // Clear legacy customBudget when using new format
          customBudget: undefined,
        };
      } else {
        // Clear budget
        return {
          ...place,
          budgetAmount: undefined,
          budgetCurrency: undefined,
          customBudget: undefined,
        };
      }
    };

    if (segment === "morning") {
      setMorningPlaces((prev) =>
        prev.map((place) =>
          place.id === placeId ? updatePlace(place) : place
        )
      );
    } else if (segment === "afternoon") {
      setAfternoonPlaces((prev) =>
        prev.map((place) =>
          place.id === placeId ? updatePlace(place) : place
        )
      );
    } else if (segment === "evening") {
      setEveningPlaces((prev) =>
        prev.map((place) =>
          place.id === placeId ? updatePlace(place) : place
        )
      );
    }

    if (amount > 0) {
      toast.success("Budget updated successfully!");
    } else {
      toast.success("Budget removed!");
    }
    setEditingBudget(null);
  };

  /**
   * Generate complete transport segments with defaults for all consecutive places
   * If a segment doesn't exist, create one with default "drive" mode
   */
  const generateCompleteTransportSegments = (): TransportSegment[] => {
    const allPlaces = [...morningPlaces, ...afternoonPlaces, ...eveningPlaces];
    // A title, budget or mode edit must not invent connections that were absent.
    if (initialData?.Timeline) {
      const original = typeof initialData.Timeline === "string" ? JSON.parse(initialData.Timeline) : initialData.Timeline;
      const route = (timeline: TimelineData) => [timeline.morning ?? [], timeline.afternoon ?? [], timeline.evening ?? []]
        .map(places => places.map(place => ({id: place.id, geometry: place.geometry})));
      if (JSON.stringify(route(original)) === JSON.stringify(route({morning: morningPlaces, afternoon: afternoonPlaces, evening: eveningPlaces}))) {
        return transportSegments;
      }
    }
    const localIds = new Set([...allPlaces, ...stayAccommodations, ...activityPlaces].map(place => place.id));
    const completeSegments: TransportSegment[] = transportSegments.filter(seg => localIds.has(seg.fromPlaceId) && localIds.has(seg.toPlaceId));

    for (let i = 0; i < allPlaces.length - 1; i++) {
      const currentPlace = allPlaces[i];
      const nextPlace = allPlaces[i + 1];

      // Check if a segment already exists
      const existingSegment = transportSegments.find(
        (seg) =>
          seg.fromPlaceId === currentPlace.id &&
          seg.toPlaceId === nextPlace.id
      );

      if (existingSegment) {
        // Existing manual segments were retained above, including unknown distances.
        continue;
      } else {
        if (!currentPlace.geometry || !nextPlace.geometry) continue;
        // Create default segment with "drive" mode
        const distanceKm = calculateDistance(
          currentPlace.geometry.location.lat,
          currentPlace.geometry.location.lng,
          nextPlace.geometry.location.lat,
          nextPlace.geometry.location.lng
        );

        const defaultMode: TravelMode = "drive";
        const estimatedMinutes = calculateTravelTime(distanceKm, defaultMode);

        completeSegments.push({
          fromPlaceId: currentPlace.id,
          toPlaceId: nextPlace.id,
          mode: defaultMode,
          distanceKm,
          estimatedMinutes,
        });
      }
    }

    return completeSegments;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!title.trim()) {
      toast.error("Please enter a title for this day/stop");
      setLoading(false);
      onLoadingChange?.(false);
      return;
    }

    setLoading(true);
    onLoadingChange?.(true);

    try {
      const descriptionBlocks = htmlToBlocks(description);

      // Prepare Timeline JSON (places only)
      const timelineData: TimelineData = {
        morning: morningPlaces,
        afternoon: afternoonPlaces,
        evening: eveningPlaces,
      };

      // Extract budget data from timeline places
      // Prioritize new currency format (budgetAmount/budgetCurrency) over customBudget, then Google API data
      const extractBudgetData = (places: any[]) => {
        return places
          .filter(p =>
            p.budgetAmount !== undefined ||
            p.customBudget ||
            p.priceLevel !== undefined ||
            p.priceRange !== undefined
          )
          .map(p => ({
            localId: p.id,
            place_id: p.place_id,
            name: p.name,
            priceLevel: p.priceLevel,
            priceRange: p.priceRange,
            customBudget: p.customBudget, // Legacy format
            budgetAmount: p.budgetAmount, // New format
            budgetCurrency: p.budgetCurrency, // New format
          }));
      };

      // Prepare Budget JSON (separate from timeline)
      const budgetData = {
        morning: extractBudgetData(morningPlaces),
        afternoon: extractBudgetData(afternoonPlaces),
        evening: extractBudgetData(eveningPlaces),
      };
      if (initialData?.Budget && initialData?.Timeline) {
        const originalBudget = typeof initialData.Budget === "string" ? JSON.parse(initialData.Budget) : initialData.Budget;
        const originalTimeline = typeof initialData.Timeline === "string" ? JSON.parse(initialData.Timeline) : initialData.Timeline;
        for (const period of ["morning", "afternoon", "evening"] as const) {
          const originalRows = extractBudgetData(originalTimeline[period] ?? []);
          const currentPlaces = [...morningPlaces, ...afternoonPlaces, ...eveningPlaces, ...stayAccommodations, ...activityPlaces];
          // Budget is independently stored and can differ from timeline metadata.
          // Retain each untouched local entry, including zero and exact money.
          const retained = (originalBudget[period] ?? []).filter((row: any) => {
            const before = originalRows.find(p => p.localId === row.localId);
            const after = budgetData[period].find(p => p.localId === row.localId);
            return currentPlaces.some(p => p.id === row.localId) && JSON.stringify(before) === JSON.stringify(after);
          });
          const updated = budgetData[period];
          budgetData[period] = (originalBudget[period] ?? []).flatMap((row: any) => {
            const value = retained.find((p: any) => p.localId === row.localId) ?? updated.find(p => p.localId === row.localId);
            return value ? [value] : [];
          });
          budgetData[period].push(...updated.filter(row => !(originalBudget[period] ?? []).some((p: any) => p.localId === row.localId)));
        }
      }

      // Generate complete transport segments (including defaults)
      const completeSegments = generateCompleteTransportSegments();

      // Prepare Transport JSON (transportation segments)
      const transportData = {
        segments: completeSegments,
      };

      // Prepare Stay JSON (accommodations)
      const stayData: StayData = {
        accommodations: stayAccommodations,
      };

      // Prepare Activity JSON (activities/attractions)
      // Wait for any in-flight activity photo uploads so we never persist an
      // empty photos array (the "images don't come back after adding" bug).
      // We merge the resolved upload results directly rather than relying on
      // React state having flushed, which makes the save deterministic.
      let activitiesForSave = activityPlaces;
      if (pendingActivityUploadsRef.current.length > 0) {
        const uploadResults = await Promise.allSettled(
          pendingActivityUploadsRef.current
        );
        const uploadedByPlace = new Map<string, DayPlace["photos"]>();
        uploadResults.forEach((result) => {
          if (
            result.status === "fulfilled" &&
            result.value &&
            result.value.photos &&
            result.value.photos.length > 0
          ) {
            uploadedByPlace.set(result.value.place_id, result.value.photos);
          }
        });
        activitiesForSave = activityPlaces.map((act) =>
          uploadedByPlace.has(act.place_id)
            ? {
                ...act,
                photos: uploadedByPlace.get(act.place_id),
                photosLoading: false,
              }
            : act
        );
        pendingActivityUploadsRef.current = [];
      }

      const activityData: ActivityData = {
        activities: activitiesForSave,
      };

      // Prepare Map_Details with location for multi-city guides
      // Map_Details carries the chosen location for a multi-city stop.
      const mapDetails = isMultiCityGuide && selectedLocation ? {location: selectedLocation} : initialData?.Map_Details ?? null;

      // The form always composes the whole section, so create and update send the same
      // blocks; only where they land differs.
      const blocks = {
        Timeline: timelineData,
        Transport: transportData,
        Stay: stayData,
        Recommendation_Activity: activityData,
        Budget: budgetData,
        Map_Details: mapDetails,
        Packing_List: initialData?.Packing_List ?? [],
        Pre_Tasks: initialData?.Pre_Tasks ?? [],
        Section_tags: initialData?.Section_tags ?? [],
      };
      // Description is rich blocks in the form and plain text on the section, so it is
      // flattened rather than stored twice in two shapes.
      const descriptionText = Array.isArray(descriptionBlocks)
        ? descriptionBlocks
            .map((block: any) => (block.children ?? []).map((child: any) => child.text ?? "").join(""))
            .join(String.fromCharCode(10))
            .trim() || null
        : null;

      if (sectionId) {
        await saveSection(sectionId, {title, description: descriptionText, ...blocks});
        toast.success("Changes saved successfully!");
      } else {
        if (isMultiCityGuide && !selectedLocation) {
          toast.error("Please select a location for this day/stop");
          setLoading(false);
          return;
        }
        // No guide id and no REST lookup: Strapi needed its internal numeric id to build
        // the relation, which is why this used to fetch the guide before every create.
        // Sequence is 1-based in the form and the position is 0-based in storage.
        await addSection({title, description: descriptionText, ...blocks},
          Number.isFinite(sequence) && sequence > 0 ? sequence - 1 : undefined);
        toast.success("Added to your guide!");
      }

      if (onSuccess) {
        onSuccess();
      }

      // Reset form only for create mode
      if (!sectionId) {
        setTitle("");
        setDescription("");
        setSequence(sequence + 1);
        setMorningPlaces([]);
        setAfternoonPlaces([]);
        setEveningPlaces([]);
        setTransportSegments([]);
        setStayAccommodations([]);
        setActivityPlaces([]);
        pendingActivityUploadsRef.current = [];
        setTimelineSearch("");
      }
    } catch (err: any) {
      console.error("Error submitting guide section:", err);
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(e);
      }}
      className="space-y-5"
      id="guide-section-form-content"
      onKeyDown={(e) => {
        // Prevent form submission on Enter key press anywhere in the form
        // Only allow submission via the Update button
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {/* Sequence and Title in one row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Sequence - Smaller width */}
        <div className="md:col-span-1">
          <label className="text-dashboard block font-medium mb-2 font-poppins text-sm">
            Day <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            className="w-full px-3 py-2 bg-dashboard-bg border border-dashboard-muted rounded-lg text-dashboard placeholder-dashboard-light focus:outline-none focus:ring-2 focus:ring-dashboard-accent/50 focus:border-dashboard-accent transition-all duration-200 font-poppins"
            placeholder="#"
            value={sequence}
            onChange={(e) => setSequence(parseInt(e.target.value) || 1)}
            min={1}
            required
          />
        </div>

        {/* Title - Larger width */}
        <div className="md:col-span-3">
          <label className="text-dashboard block font-medium mb-2 font-poppins text-sm">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-dashboard-bg border border-dashboard-muted rounded-lg text-dashboard placeholder-dashboard-light focus:outline-none focus:ring-2 focus:ring-dashboard-accent/50 focus:border-dashboard-accent transition-all duration-200 font-poppins"
            placeholder="e.g., Day 1: Arrival & City Exploration"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Location Selection for Multi-City Guides */}
      {isMultiCityGuide && (
        <div>
          <label className="text-dashboard block font-medium mb-2 font-poppins text-sm">
            Location <span className="text-red-500">*</span>
          </label>
          <select
            className="w-full px-3 py-2 bg-dashboard-bg border border-dashboard-muted rounded-lg text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent/50 focus:border-dashboard-accent transition-all duration-200 font-poppins"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            required
          >
            <option value="">Select a location for this day/stop</option>
            {multiCityLocations.map((location) => (
              <option key={location.value} value={location.value}>
                {location.label}
              </option>
            ))}
          </select>
          <p className="text-dashboard-light text-xs font-poppins mt-1">
            Select which city/location this day/stop belongs to
          </p>
        </div>
      )}

      {/* Description */}
      <div>
        <label className="text-dashboard block font-medium mb-2 font-poppins text-sm">
          Overview <span className="text-red-500">*</span>
        </label>
        <div className="rounded-lg overflow-hidden border border-dashboard-muted">
          <TiptapEditor
            value={description}
            onChange={handleDescriptionChange}
            placeholder="Give a brief overview of what travelers can expect during this part of the journey..."
          />
        </div>
      </div>

      {/* Section Details Tabs - Compact Form Version */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 py-2 overflow-x-auto scrollbar-hide">
          {[
            {
              id: "timeline",
              label: "Timeline",
              icon: <ClockIcon size="5" />,
            },
            {
              id: "transportation",
              label: "Transport",
              icon: <TransportationIcon size="5" />,
            },
            {
              id: "stay",
              label: "Stay",
              icon: <StayIcon size="5" />,
            },
            {
              id: "things-to-do",
              label: "Places",
              icon: <Location size="5" />,
            },
            {
              id: "budget",
              label: "Budget",
              icon: <BudgetIcon size="5" />,
            },
            {
              id: "tips",
              label: "Tips",
              icon: <TipsIcon size="5" />,
            },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                  transition-all duration-200 flex-shrink-0
                  ${isActive
                    ? "bg-dashboard-accent text-white shadow-md"
                    : "bg-dashboard-sidebar text-dashboard-light hover:bg-dashboard-muted hover:text-dashboard"
                  }
                `}
              >
                <span className="flex-shrink-0">{tab.icon}</span>
                <span className="text-xs font-poppins font-medium whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="bg-dashboard-sidebar rounded-lg p-3 sm:p-5 border border-dashboard-muted">
          {activeTab === "timeline" && (
            <div className="space-y-5 pr-2">
              <div>
                <h4 className="text-dashboard font-poppins font-semibold mb-1.5">
                  Daily Schedule
                </h4>
                <p className="text-dashboard-light text-xs font-poppins">
                  Search and add places for each part of the day
                </p>
              </div>

              {/* Unified Search Input with Period Dropdown */}
              <div className="space-y-3 mb-6">
                <div>
                  <div className="flex gap-2 items-center mb-2">
                    {/* Period Dropdown */}
                    <div className="flex-shrink-0">
                      <select
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value as "morning" | "afternoon" | "evening")}
                        className="p-3 bg-dashboard-muted border border-dashboard rounded-md text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent/50 focus:border-dashboard-accent transition-all duration-200 font-poppins text-sm min-w-[120px]"
                      >
                        <option value="morning">Morning</option>
                        <option value="afternoon">Afternoon</option>
                        <option value="evening">Evening</option>
                      </select>
                    </div>
                    {/* Search Input */}
                    <div className="flex-1">
                      <div onKeyDown={(e) => {
                        // Prevent form submission when Enter is pressed in search input
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}>
                        <AddressInput
                          value={timelineSearch}
                          onChange={setTimelineSearch}
                          setPlaces={setTempTimelinePlace}
                          label=""
                          placeHolder="Search for a place (e.g., Cafe Lake Side, Central Park...)"
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Suggestions Section - Only show when location is selected */}
                  <div className="relative mb-4 mt-4">
                    {isMultiCityGuide && !selectedLocation ? (
                      <div className="bg-dashboard-sidebar border border-dashboard-muted rounded-lg p-4">
                        <p className="text-dashboard-light text-sm font-poppins text-center">
                          Please select a location above to see place suggestions for this day/stop.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-dashboard-bg py-4">
                        <TopPlacesByCategory
                          selectedLocationName={getLocationForSuggestions().locationName}
                          selectedLocationCoords={getLocationForSuggestions().locationCoords}
                          existingRecommendations={[]}
                          onPlaceSelect={(googlePlace: any) => {
                            handleSuggestionPlaceSelect(selectedPeriod, googlePlace);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Timeline Container with Continuous Bar - Only show when places exist */}
              {(morningPlaces.length > 0 || afternoonPlaces.length > 0 || eveningPlaces.length > 0) && (
                <div className="relative pl-6 space-y-6">
                  {/* Continuous vertical timeline bar */}
                  <div className="absolute left-2 top-0 bottom-0 w-0.5 border-l-2 border-dashed border-red-500"></div>

                  {/* Morning Section - Only show if places exist */}
                  {morningPlaces.length > 0 && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-dashboard font-poppins font-semibold text-sm ml-2">
                          Morning
                        </label>
                      </div>

                      {/* Added Places Timeline */}
                      <div className="relative">
                        <Reorder.Group
                          axis="y"
                          values={morningPlaces}
                          onReorder={setMorningPlaces}
                          className="space-y-0"
                        >
                          {morningPlaces.map((place, index) => (
                            <Reorder.Item
                              key={place.id}
                              value={place}
                              className="relative"
                              style={{ listStyle: "none" }}
                            >
                              <div className="relative">
                                {/* Timeline dot */}
                                <div className="absolute -left-[22px] top-3 w-3 h-3 rounded-full bg-amber-400 border-2 border-dashboard-sidebar shadow-md"></div>

                                {/* Place card */}
                                <div className="flex items-center gap-3 p-3 bg-dashboard-bg rounded-lg border border-amber-200/20 hover:border-amber-400/40 transition-all shadow-sm mb-3 touch-none">
                                  {/* Drag Handle */}
                                  <div
                                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-amber-400/40 hover:text-amber-400/80 transition-colors touch-none"
                                    title="Drag to reorder"
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 16 16"
                                      fill="currentColor"
                                    >
                                      <circle cx="5" cy="4" r="1.5" />
                                      <circle cx="11" cy="4" r="1.5" />
                                      <circle cx="5" cy="8" r="1.5" />
                                      <circle cx="11" cy="8" r="1.5" />
                                      <circle cx="5" cy="12" r="1.5" />
                                      <circle cx="11" cy="12" r="1.5" />
                                    </svg>
                                  </div>
                                  {getPlaceIcon(place.types, "5", "white")}
                                  <div className="flex-1 min-w-0">
                                    <h5 className="text-dashboard font-poppins font-semibold text-sm truncate">
                                      {place.name}
                                    </h5>
                                  </div>
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                      place.name
                                    )}&query_place_id=${place.place_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-400 hover:text-blue-500 transition-all touch-auto"
                                    title="Open in Google Maps"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <DirectionIcon size="4" />
                                  </a>
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenKebabMenu(
                                          openKebabMenu === `morning-${place.id}`
                                            ? null
                                            : `morning-${place.id}`
                                        );
                                      }}
                                      className="flex-shrink-0 p-1.5 rounded-lg hover:bg-dashboard-muted transition-all touch-auto"
                                    >
                                      <VerticalKebab size="4" />
                                    </button>
                                    {openKebabMenu === `morning-${place.id}` && (
                                      <div className="absolute right-0 top-full mt-1 bg-dashboard-sidebar shadow-dashboard-elevated rounded-md border border-dashboard z-50 min-w-[140px]">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingTips({
                                              placeId: place.id,
                                              period: "morning",
                                              currentTips: place.tips || "",
                                            });
                                            setOpenKebabMenu(null);
                                          }}
                                          className="flex items-center gap-2 w-full text-dashboard hover:bg-dashboard-muted px-3 py-2 transition-colors text-sm font-poppins"
                                          title="Add Tips"
                                        >
                                          <TipsIcon size="4" />
                                          <span>Add Tips</span>
                                        </button>
                                        <div className="h-px bg-dashboard-muted"></div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingBudget({
                                              placeId: place.id,
                                              period: "morning",
                                              placeName: place.name,
                                              currentBudget: place.customBudget,
                                              budgetAmount: place.budgetAmount,
                                              budgetCurrency: place.budgetCurrency,
                                              priceLevel: place.priceLevel,
                                              priceRange: place.priceRange,
                                            });
                                            setOpenKebabMenu(null);
                                          }}
                                          className="flex items-center gap-2 w-full text-dashboard hover:bg-dashboard-muted px-3 py-2 transition-colors text-sm font-poppins"
                                          title="Add Budget"
                                        >
                                          <BudgetIcon size="4" />
                                          <span>Add Budget</span>
                                        </button>
                                        <div className="h-px bg-dashboard-muted"></div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            removePlaceFromSegment(
                                              "morning",
                                              place.id
                                            );
                                            setOpenKebabMenu(null);
                                          }}
                                          className="flex items-center gap-2 w-full text-red-400 hover:bg-dashboard-muted px-3 py-2 transition-colors text-sm font-poppins"
                                          title="Delete"
                                        >
                                          <DeleteIcon stroke="currentColor" />
                                          <span>Delete</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Distance Connector (if not last place) */}
                              {index < morningPlaces.length - 1 &&
                                (() => {
                                  const nextPlace = morningPlaces[index + 1];

                                  // Calculate distance
                                  if (!place.geometry || !nextPlace.geometry)
                                    return null;

                                  const distanceKm = calculateDistance(
                                    place.geometry.location.lat,
                                    place.geometry.location.lng,
                                    nextPlace.geometry.location.lat,
                                    nextPlace.geometry.location.lng
                                  );

                                  if (!distanceKm) return null;

                                  // Get existing transport segment or create default (Morning)
                                  const segment = getTransportSegment(
                                    place,
                                    nextPlace
                                  );
                                  const mode = segment?.mode || "drive";
                                  const modeConfig = getTravelModeConfig(mode);
                                  const travelMinutes =
                                    segment?.estimatedMinutes ||
                                    calculateTravelTime(distanceKm, mode);
                                  const travelLabel = getTravelModeLabel(
                                    mode,
                                    travelMinutes
                                  );

                                  // Format distance
                                  const distanceStr =
                                    distanceKm < 1
                                      ? `${Math.round(distanceKm * 1000)} m`
                                      : `${distanceKm.toFixed(1)} km`;

                                  const isOpen =
                                    selectorOpen?.period === "morning" &&
                                    selectorOpen?.fromIndex === index;

                                  return (
                                    <div className="relative py-2 mb-3">
                                      {/* Distance info with icon inside */}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectorOpen({
                                            period: "morning",
                                            fromIndex: index,
                                          })
                                        }
                                        className="flex items-center gap-2 px-2 py-1 bg-amber-500/10 rounded-md border border-amber-300/20 hover:bg-amber-500/20 hover:border-amber-300/40 transition-all cursor-pointer ml-6"
                                        title="Change travel mode"
                                      >
                                        <span className="w-4 h-4 flex items-center justify-center">
                                          {modeConfig?.icon || (
                                            <TransportationIcon
                                              size="4"
                                              color="rgb(252 211 77 / 0.6)"
                                            />
                                          )}
                                        </span>
                                        <span className="text-amber-300 text-xs font-poppins font-medium">
                                          {distanceStr}
                                        </span>
                                        <span className="text-amber-300/60 text-xs font-poppins">
                                          •
                                        </span>
                                        <span className="text-amber-300/80 text-xs font-poppins">
                                          {travelLabel}
                                        </span>
                                      </button>

                                      {/* Travel Mode Selector */}
                                      {isOpen && (
                                        <TravelModeSelector
                                          distanceKm={distanceKm}
                                          selectedMode={mode}
                                          onSelectMode={(newMode) =>
                                            updateTransportSegment(
                                              place,
                                              nextPlace,
                                              newMode
                                            )
                                          }
                                          onClose={() => setSelectorOpen(null)}
                                          colorTheme="amber"
                                        />
                                      )}
                                    </div>
                                  );
                                })()}

                              {/* Tips Display */}
                              {place.tips && (
                                <div className="mb-3 ml-6 p-2 bg-amber-500/10 rounded-md border border-amber-300/20">
                                  <div className="flex items-start gap-2">
                                    <TipsIcon size="4" color="rgb(251 191 36)" />
                                    <p className="text-dashboard-light text-xs font-poppins italic flex-1">
                                      {place.tips}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* Custom Budget Display */}
                              {(() => {
                                const budgetText = getBudgetDisplayText({
                                  budgetAmount: place.budgetAmount,
                                  budgetCurrency: place.budgetCurrency,
                                  customBudget: place.customBudget,
                                  priceRange: place.priceRange,
                                  priceLevel: place.priceLevel,
                                });
                                return budgetText ? (
                                  <div className="mb-3 ml-6 p-2 bg-green-500/10 rounded-md border border-green-300/20">
                                    <div className="flex items-center gap-2">
                                      <BudgetIcon size="4" />
                                      <p className="text-dashboard-light text-xs font-poppins flex-1">
                                        {budgetText}
                                      </p>
                                    </div>
                                  </div>
                                ) : null;
                              })()}
                            </Reorder.Item>
                          ))}
                        </Reorder.Group>

                        {/* Cross-section connector: Morning to Afternoon */}
                        {morningPlaces.length > 0 && afternoonPlaces.length > 0 && (() => {
                          const lastMorningPlace = morningPlaces[morningPlaces.length - 1];
                          const firstAfternoonPlace = afternoonPlaces[0];

                          // Calculate distance
                          if (!lastMorningPlace.geometry || !firstAfternoonPlace.geometry) return null;

                          const distanceKm = calculateDistance(
                            lastMorningPlace.geometry.location.lat,
                            lastMorningPlace.geometry.location.lng,
                            firstAfternoonPlace.geometry.location.lat,
                            firstAfternoonPlace.geometry.location.lng
                          );

                          if (!distanceKm) return null;

                          // Get existing transport segment or create default
                          const segment = getTransportSegment(lastMorningPlace, firstAfternoonPlace);
                          const mode = segment?.mode || "drive";
                          const modeConfig = getTravelModeConfig(mode);
                          const travelMinutes = segment?.estimatedMinutes || calculateTravelTime(distanceKm, mode);
                          const travelLabel = getTravelModeLabel(mode, travelMinutes);

                          // Format distance
                          const distanceStr = distanceKm < 1
                            ? `${Math.round(distanceKm * 1000)} m`
                            : `${distanceKm.toFixed(1)} km`;

                          const isOpen = selectorOpen?.period === "morning" && selectorOpen?.fromIndex === -1;

                          return (
                            <div className="relative py-2 mb-3">
                              {/* Distance info with icon inside */}
                              <button
                                type="button"
                                onClick={() => setSelectorOpen({ period: "morning", fromIndex: -1 })}
                                className="flex items-center gap-2 px-2 py-1 bg-amber-500/10 rounded-md border border-amber-300/20 hover:bg-amber-500/20 hover:border-amber-300/40 transition-all cursor-pointer ml-6"
                                title="Change travel mode"
                              >
                                <span className="w-4 h-4 flex items-center justify-center">
                                  {modeConfig?.icon || (
                                    <TransportationIcon size="4" color="rgb(252 211 77 / 0.6)" />
                                  )}
                                </span>
                                <span className="text-amber-300 text-xs font-poppins font-medium">
                                  {distanceStr}
                                </span>
                                <span className="text-amber-300/60 text-xs font-poppins">•</span>
                                <span className="text-amber-300/80 text-xs font-poppins">
                                  {travelLabel}
                                </span>
                              </button>

                              {/* Travel Mode Selector */}
                              {isOpen && (
                                <TravelModeSelector
                                  distanceKm={distanceKm}
                                  selectedMode={mode}
                                  onSelectMode={(newMode) =>
                                    updateTransportSegment(lastMorningPlace, firstAfternoonPlace, newMode)
                                  }
                                  onClose={() => setSelectorOpen(null)}
                                  colorTheme="amber"
                                />
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Afternoon Section - Only show if places exist */}
                  {afternoonPlaces.length > 0 && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-dashboard font-poppins font-semibold text-sm ml-2">
                          Afternoon
                        </label>
                      </div>

                      {/* Added Places Timeline */}
                      <div className="relative">

                        <Reorder.Group
                          axis="y"
                          values={afternoonPlaces}
                          onReorder={setAfternoonPlaces}
                          className="space-y-0"
                        >
                          {afternoonPlaces.map((place, index) => (
                            <Reorder.Item
                              key={place.id}
                              value={place}
                              className="relative"
                              style={{ listStyle: "none" }}
                            >
                              <div className="relative">
                                {/* Timeline dot */}
                                <div className="absolute -left-[22px] top-3 w-3 h-3 rounded-full bg-sky-400 border-2 border-dashboard-sidebar shadow-md"></div>

                                {/* Place card */}
                                <div className="flex items-center gap-3 p-3 bg-dashboard-bg rounded-lg border border-sky-200/20 hover:border-sky-400/40 transition-all shadow-sm mb-3 touch-none">
                                  {/* Drag Handle */}
                                  <div
                                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-sky-400/40 hover:text-sky-400/80 transition-colors touch-none"
                                    title="Drag to reorder"
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 16 16"
                                      fill="currentColor"
                                    >
                                      <circle cx="5" cy="4" r="1.5" />
                                      <circle cx="11" cy="4" r="1.5" />
                                      <circle cx="5" cy="8" r="1.5" />
                                      <circle cx="11" cy="8" r="1.5" />
                                      <circle cx="5" cy="12" r="1.5" />
                                      <circle cx="11" cy="12" r="1.5" />
                                    </svg>
                                  </div>
                                  {getPlaceIcon(place.types, "5", "white")}
                                  <div className="flex-1 min-w-0">
                                    <h5 className="text-dashboard font-poppins font-semibold text-sm truncate">
                                      {place.name}
                                    </h5>
                                  </div>
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                      place.name
                                    )}&query_place_id=${place.place_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-400 hover:text-blue-500 transition-all touch-auto"
                                    title="Open in Google Maps"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <DirectionIcon size="4" />
                                  </a>
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenKebabMenu(
                                          openKebabMenu === `afternoon-${place.id}`
                                            ? null
                                            : `afternoon-${place.id}`
                                        );
                                      }}
                                      className="flex-shrink-0 p-1.5 rounded-lg hover:bg-dashboard-muted transition-all touch-auto"
                                    >
                                      <VerticalKebab size="4" />
                                    </button>
                                    {openKebabMenu === `afternoon-${place.id}` && (
                                      <div className="absolute right-0 top-full mt-1 bg-dashboard-sidebar shadow-dashboard-elevated rounded-md border border-dashboard z-50 min-w-[140px]">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingTips({
                                              placeId: place.id,
                                              period: "afternoon",
                                              currentTips: place.tips || "",
                                            });
                                            setOpenKebabMenu(null);
                                          }}
                                          className="flex items-center gap-2 w-full text-dashboard hover:bg-dashboard-muted px-3 py-2 transition-colors text-sm font-poppins"
                                          title="Add Tips"
                                        >
                                          <TipsIcon size="4" />
                                          <span>Add Tips</span>
                                        </button>
                                        <div className="h-px bg-dashboard-muted"></div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingBudget({
                                              placeId: place.id,
                                              period: "afternoon",
                                              placeName: place.name,
                                              currentBudget: place.customBudget,
                                              budgetAmount: place.budgetAmount,
                                              budgetCurrency: place.budgetCurrency,
                                              priceLevel: place.priceLevel,
                                              priceRange: place.priceRange,
                                            });
                                            setOpenKebabMenu(null);
                                          }}
                                          className="flex items-center gap-2 w-full text-dashboard hover:bg-dashboard-muted px-3 py-2 transition-colors text-sm font-poppins"
                                          title="Add Budget"
                                        >
                                          <BudgetIcon size="4" />
                                          <span>Add Budget</span>
                                        </button>
                                        <div className="h-px bg-dashboard-muted"></div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            removePlaceFromSegment(
                                              "afternoon",
                                              place.id
                                            );
                                            setOpenKebabMenu(null);
                                          }}
                                          className="flex items-center gap-2 w-full text-red-400 hover:bg-dashboard-muted px-3 py-2 transition-colors text-sm font-poppins"
                                          title="Delete"
                                        >
                                          <DeleteIcon stroke="currentColor" />
                                          <span>Delete</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Distance Connector (if not last place) */}
                              {index < afternoonPlaces.length - 1 &&
                                (() => {
                                  const nextPlace = afternoonPlaces[index + 1];

                                  // Calculate distance
                                  if (!place.geometry || !nextPlace.geometry)
                                    return null;

                                  const distanceKm = calculateDistance(
                                    place.geometry.location.lat,
                                    place.geometry.location.lng,
                                    nextPlace.geometry.location.lat,
                                    nextPlace.geometry.location.lng
                                  );

                                  if (!distanceKm) return null;

                                  // Get existing transport segment or create default (Afternoon)
                                  const segment = getTransportSegment(
                                    place,
                                    nextPlace
                                  );
                                  const mode = segment?.mode || "drive";
                                  const modeConfig = getTravelModeConfig(mode);
                                  const travelMinutes =
                                    segment?.estimatedMinutes ||
                                    calculateTravelTime(distanceKm, mode);
                                  const travelLabel = getTravelModeLabel(
                                    mode,
                                    travelMinutes
                                  );

                                  // Format distance
                                  const distanceStr =
                                    distanceKm < 1
                                      ? `${Math.round(distanceKm * 1000)} m`
                                      : `${distanceKm.toFixed(1)} km`;

                                  const isOpen =
                                    selectorOpen?.period === "afternoon" &&
                                    selectorOpen?.fromIndex === index;

                                  return (
                                    <div className="relative py-2 mb-3">
                                      {/* Distance info with icon inside */}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectorOpen({
                                            period: "afternoon",
                                            fromIndex: index,
                                          })
                                        }
                                        className="flex items-center gap-2 px-2 py-1 bg-sky-500/10 rounded-md border border-sky-300/20 hover:bg-sky-500/20 hover:border-sky-300/40 transition-all cursor-pointer ml-6"
                                        title="Change travel mode"
                                      >
                                        <span className="w-4 h-4 flex items-center justify-center">
                                          {modeConfig?.icon || (
                                            <TransportationIcon
                                              size="4"
                                              color="rgb(125 211 252 / 0.6)"
                                            />
                                          )}
                                        </span>
                                        <span className="text-sky-300 text-xs font-poppins font-medium">
                                          {distanceStr}
                                        </span>
                                        <span className="text-sky-300/60 text-xs font-poppins">
                                          •
                                        </span>
                                        <span className="text-sky-300/80 text-xs font-poppins">
                                          {travelLabel}
                                        </span>
                                      </button>

                                      {/* Travel Mode Selector */}
                                      {isOpen && (
                                        <TravelModeSelector
                                          distanceKm={distanceKm}
                                          selectedMode={mode}
                                          onSelectMode={(newMode) =>
                                            updateTransportSegment(
                                              place,
                                              nextPlace,
                                              newMode
                                            )
                                          }
                                          onClose={() => setSelectorOpen(null)}
                                          colorTheme="sky"
                                        />
                                      )}
                                    </div>
                                  );
                                })()}

                              {/* Tips Display */}
                              {place.tips && (
                                <div className="mb-3 ml-6 p-2 bg-sky-500/10 rounded-md border border-sky-300/20">
                                  <div className="flex items-start gap-2">
                                    <TipsIcon size="4" color="rgb(125 211 252)" />
                                    <p className="text-dashboard-light text-xs font-poppins italic flex-1">
                                      {place.tips}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* Custom Budget Display */}
                              {(() => {
                                const budgetText = getBudgetDisplayText({
                                  budgetAmount: place.budgetAmount,
                                  budgetCurrency: place.budgetCurrency,
                                  customBudget: place.customBudget,
                                  priceRange: place.priceRange,
                                  priceLevel: place.priceLevel,
                                });
                                return budgetText ? (
                                  <div className="mb-3 ml-6 p-2 bg-green-500/10 rounded-md border border-green-300/20">
                                    <div className="flex items-center gap-2">
                                      <BudgetIcon size="4" />
                                      <p className="text-dashboard-light text-xs font-poppins flex-1">
                                        {budgetText}
                                      </p>
                                    </div>
                                  </div>
                                ) : null;
                              })()}
                            </Reorder.Item>
                          ))}
                        </Reorder.Group>

                        {/* Cross-section connector: Afternoon to Evening */}
                        {afternoonPlaces.length > 0 && eveningPlaces.length > 0 && (() => {
                          const lastAfternoonPlace = afternoonPlaces[afternoonPlaces.length - 1];
                          const firstEveningPlace = eveningPlaces[0];

                          // Calculate distance
                          if (!lastAfternoonPlace.geometry || !firstEveningPlace.geometry) return null;

                          const distanceKm = calculateDistance(
                            lastAfternoonPlace.geometry.location.lat,
                            lastAfternoonPlace.geometry.location.lng,
                            firstEveningPlace.geometry.location.lat,
                            firstEveningPlace.geometry.location.lng
                          );

                          if (!distanceKm) return null;

                          // Get existing transport segment or create default
                          const segment = getTransportSegment(lastAfternoonPlace, firstEveningPlace);
                          const mode = segment?.mode || "drive";
                          const modeConfig = getTravelModeConfig(mode);
                          const travelMinutes = segment?.estimatedMinutes || calculateTravelTime(distanceKm, mode);
                          const travelLabel = getTravelModeLabel(mode, travelMinutes);

                          // Format distance
                          const distanceStr = distanceKm < 1
                            ? `${Math.round(distanceKm * 1000)} m`
                            : `${distanceKm.toFixed(1)} km`;

                          const isOpen = selectorOpen?.period === "afternoon" && selectorOpen?.fromIndex === -1;

                          return (
                            <div className="relative py-2 mb-3">
                              {/* Distance info with icon inside */}
                              <button
                                type="button"
                                onClick={() => setSelectorOpen({ period: "afternoon", fromIndex: -1 })}
                                className="flex items-center gap-2 px-2 py-1 bg-sky-500/10 rounded-md border border-sky-300/20 hover:bg-sky-500/20 hover:border-sky-300/40 transition-all cursor-pointer ml-6"
                                title="Change travel mode"
                              >
                                <span className="w-4 h-4 flex items-center justify-center">
                                  {modeConfig?.icon || (
                                    <TransportationIcon size="4" color="rgb(125 211 252 / 0.6)" />
                                  )}
                                </span>
                                <span className="text-sky-300 text-xs font-poppins font-medium">
                                  {distanceStr}
                                </span>
                                <span className="text-sky-300/60 text-xs font-poppins">•</span>
                                <span className="text-sky-300/80 text-xs font-poppins">
                                  {travelLabel}
                                </span>
                              </button>

                              {/* Travel Mode Selector */}
                              {isOpen && (
                                <TravelModeSelector
                                  distanceKm={distanceKm}
                                  selectedMode={mode}
                                  onSelectMode={(newMode) =>
                                    updateTransportSegment(lastAfternoonPlace, firstEveningPlace, newMode)
                                  }
                                  onClose={() => setSelectorOpen(null)}
                                  colorTheme="sky"
                                />
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Evening Section - Only show if places exist */}
                  {eveningPlaces.length > 0 && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-dashboard font-poppins font-semibold text-sm ml-2">
                          Evening
                        </label>
                      </div>

                      {/* Added Places Timeline */}
                      <div className="relative">

                        <Reorder.Group
                          axis="y"
                          values={eveningPlaces}
                          onReorder={setEveningPlaces}
                          className="space-y-0"
                        >
                          {eveningPlaces.map((place, index) => (
                            <Reorder.Item
                              key={place.id}
                              value={place}
                              className="relative"
                              style={{ listStyle: "none" }}
                            >
                              <div className="relative">
                                {/* Timeline dot */}
                                <div className="absolute -left-[22px] top-3 w-3 h-3 rounded-full bg-indigo-400 border-2 border-dashboard-sidebar shadow-md"></div>

                                {/* Place card */}
                                <div className="flex items-center gap-3 p-3 bg-dashboard-bg rounded-lg border border-indigo-200/20 hover:border-indigo-400/40 transition-all shadow-sm mb-3 touch-none">
                                  {/* Drag Handle */}
                                  <div
                                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-indigo-400/40 hover:text-indigo-400/80 transition-colors touch-none"
                                    title="Drag to reorder"
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 16 16"
                                      fill="currentColor"
                                    >
                                      <circle cx="5" cy="4" r="1.5" />
                                      <circle cx="11" cy="4" r="1.5" />
                                      <circle cx="5" cy="8" r="1.5" />
                                      <circle cx="11" cy="8" r="1.5" />
                                      <circle cx="5" cy="12" r="1.5" />
                                      <circle cx="11" cy="12" r="1.5" />
                                    </svg>
                                  </div>
                                  {getPlaceIcon(place.types, "5", "white")}
                                  <div className="flex-1 min-w-0">
                                    <h5 className="text-dashboard font-poppins font-semibold text-sm truncate">
                                      {place.name}
                                    </h5>
                                  </div>
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                      place.name
                                    )}&query_place_id=${place.place_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-400 hover:text-blue-500 transition-all touch-auto"
                                    title="Open in Google Maps"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <DirectionIcon size="4" />
                                  </a>
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenKebabMenu(
                                          openKebabMenu === `evening-${place.id}`
                                            ? null
                                            : `evening-${place.id}`
                                        );
                                      }}
                                      className="flex-shrink-0 p-1.5 rounded-lg hover:bg-dashboard-muted transition-all touch-auto"
                                    >
                                      <VerticalKebab size="4" />
                                    </button>
                                    {openKebabMenu === `evening-${place.id}` && (
                                      <div className="absolute right-0 top-full mt-1 bg-dashboard-sidebar shadow-dashboard-elevated rounded-md border border-dashboard z-50 min-w-[140px]">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingTips({
                                              placeId: place.id,
                                              period: "evening",
                                              currentTips: place.tips || "",
                                            });
                                            setOpenKebabMenu(null);
                                          }}
                                          className="flex items-center gap-2 w-full text-dashboard hover:bg-dashboard-muted px-3 py-2 transition-colors text-sm font-poppins"
                                          title="Add Tips"
                                        >
                                          <TipsIcon size="4" />
                                          <span>Add Tips</span>
                                        </button>
                                        <div className="h-px bg-dashboard-muted"></div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingBudget({
                                              placeId: place.id,
                                              period: "evening",
                                              placeName: place.name,
                                              currentBudget: place.customBudget,
                                              budgetAmount: place.budgetAmount,
                                              budgetCurrency: place.budgetCurrency,
                                              priceLevel: place.priceLevel,
                                              priceRange: place.priceRange,
                                            });
                                            setOpenKebabMenu(null);
                                          }}
                                          className="flex items-center gap-2 w-full text-dashboard hover:bg-dashboard-muted px-3 py-2 transition-colors text-sm font-poppins"
                                          title="Add Budget"
                                        >
                                          <BudgetIcon size="4" />
                                          <span>Add Budget</span>
                                        </button>
                                        <div className="h-px bg-dashboard-muted"></div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            removePlaceFromSegment(
                                              "evening",
                                              place.id
                                            );
                                            setOpenKebabMenu(null);
                                          }}
                                          className="flex items-center gap-2 w-full text-red-400 hover:bg-dashboard-muted px-3 py-2 transition-colors text-sm font-poppins"
                                          title="Delete"
                                        >
                                          <DeleteIcon stroke="currentColor" />
                                          <span>Delete</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Distance Connector (if not last place) */}
                              {index < eveningPlaces.length - 1 &&
                                (() => {
                                  const nextPlace = eveningPlaces[index + 1];

                                  // Calculate distance
                                  if (!place.geometry || !nextPlace.geometry)
                                    return null;

                                  const distanceKm = calculateDistance(
                                    place.geometry.location.lat,
                                    place.geometry.location.lng,
                                    nextPlace.geometry.location.lat,
                                    nextPlace.geometry.location.lng
                                  );

                                  if (!distanceKm) return null;

                                  // Get existing transport segment or create default (Evening)
                                  const segment = getTransportSegment(
                                    place,
                                    nextPlace
                                  );
                                  const mode = segment?.mode || "drive";
                                  const modeConfig = getTravelModeConfig(mode);
                                  const travelMinutes =
                                    segment?.estimatedMinutes ||
                                    calculateTravelTime(distanceKm, mode);
                                  const travelLabel = getTravelModeLabel(
                                    mode,
                                    travelMinutes
                                  );

                                  // Format distance
                                  const distanceStr =
                                    distanceKm < 1
                                      ? `${Math.round(distanceKm * 1000)} m`
                                      : `${distanceKm.toFixed(1)} km`;

                                  const isOpen =
                                    selectorOpen?.period === "evening" &&
                                    selectorOpen?.fromIndex === index;

                                  return (
                                    <div className="relative py-2 mb-3">
                                      {/* Distance info with icon inside */}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectorOpen({
                                            period: "evening",
                                            fromIndex: index,
                                          })
                                        }
                                        className="flex items-center gap-2 px-2 py-1 bg-indigo-500/10 rounded-md border border-indigo-300/20 hover:bg-indigo-500/20 hover:border-indigo-300/40 transition-all cursor-pointer ml-6"
                                        title="Change travel mode"
                                      >
                                        <span className="w-4 h-4 flex items-center justify-center">
                                          {modeConfig?.icon || (
                                            <TransportationIcon
                                              size="4"
                                              color="rgb(165 180 252 / 0.6)"
                                            />
                                          )}
                                        </span>
                                        <span className="text-indigo-300 text-xs font-poppins font-medium">
                                          {distanceStr}
                                        </span>
                                        <span className="text-indigo-300/60 text-xs font-poppins">
                                          •
                                        </span>
                                        <span className="text-indigo-300/80 text-xs font-poppins">
                                          {travelLabel}
                                        </span>
                                      </button>

                                      {/* Travel Mode Selector */}
                                      {isOpen && (
                                        <TravelModeSelector
                                          distanceKm={distanceKm}
                                          selectedMode={mode}
                                          onSelectMode={(newMode) =>
                                            updateTransportSegment(
                                              place,
                                              nextPlace,
                                              newMode
                                            )
                                          }
                                          onClose={() => setSelectorOpen(null)}
                                          colorTheme="indigo"
                                          openUpward={true}
                                        />
                                      )}
                                    </div>
                                  );
                                })()}

                              {/* Tips Display */}
                              {place.tips && (
                                <div className="mb-3 ml-6 p-2 bg-indigo-500/10 rounded-md border border-indigo-300/20">
                                  <div className="flex items-start gap-2">
                                    <TipsIcon size="4" color="rgb(165 180 252)" />
                                    <p className="text-dashboard-light text-xs font-poppins italic flex-1">
                                      {place.tips}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* Custom Budget Display */}
                              {(() => {
                                const budgetText = getBudgetDisplayText({
                                  budgetAmount: place.budgetAmount,
                                  budgetCurrency: place.budgetCurrency,
                                  customBudget: place.customBudget,
                                  priceRange: place.priceRange,
                                  priceLevel: place.priceLevel,
                                });
                                return budgetText ? (
                                  <div className="mb-3 ml-6 p-2 bg-green-500/10 rounded-md border border-green-300/20">
                                    <div className="flex items-center gap-2">
                                      <BudgetIcon size="4" />
                                      <p className="text-dashboard-light text-xs font-poppins flex-1">
                                        {budgetText}
                                      </p>
                                    </div>
                                  </div>
                                ) : null;
                              })()}
                            </Reorder.Item>
                          ))}
                        </Reorder.Group>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {activeTab === "transportation" && (
            <div>
              <h4 className="text-dashboard font-poppins font-semibold mb-3">
                Getting Around
              </h4>
              <p className="text-dashboard-light text-sm font-poppins mb-4">
                Your selected transportation modes between places:
              </p>

              {/* Transport Segments Display */}
              {transportSegments.length > 0 ? (
                <div className="space-y-6">
                  {/* Morning Routes */}
                  {morningPlaces.length > 1 && (
                    <div className="space-y-3">
                      <div className="mb-3">
                        <h5 className="text-dashboard font-poppins font-semibold text-sm">
                          Morning Routes
                        </h5>
                      </div>
                      {morningPlaces.slice(0, -1).map((place, index) => {
                        const nextPlace = morningPlaces[index + 1];
                        const segment = getTransportSegment(place, nextPlace);
                        const modeConfig = getTravelModeConfig(
                          segment?.mode || "drive"
                        );

                        return (
                          <div
                            key={`morning-transport-${index}`}
                            className="flex items-center gap-3 p-3 bg-amber-500/5 border border-amber-300/20 rounded-lg"
                          >
                            <div className="flex-shrink-0 text-amber-400">
                              {modeConfig?.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-dashboard-light font-poppins truncate">
                                {place.name}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <svg
                                  className="w-3 h-3 text-amber-400"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                              <div className="text-xs text-dashboard-light font-poppins truncate">
                                {nextPlace.name}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-xs text-amber-400 font-poppins font-semibold">
                                {modeConfig?.label}
                              </div>
                              <div className="text-xs text-dashboard-light font-poppins">
                                {segment
                                  ? [
                                      segment.distanceKm === null ? null : `${segment.distanceKm.toFixed(1)} km`,
                                      segment.estimatedMinutes === null ? null : `${segment.estimatedMinutes} min`,
                                    ].filter(Boolean).join(" • ") || "Not set"
                                  : "Not set"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Afternoon Routes */}
                  {afternoonPlaces.length > 1 && (
                    <div className="space-y-3">
                      <div className="mb-3">
                        <h5 className="text-dashboard font-poppins font-semibold text-sm">
                          Afternoon Routes
                        </h5>
                      </div>
                      {afternoonPlaces.slice(0, -1).map((place, index) => {
                        const nextPlace = afternoonPlaces[index + 1];
                        const segment = getTransportSegment(place, nextPlace);
                        const modeConfig = getTravelModeConfig(
                          segment?.mode || "drive"
                        );

                        return (
                          <div
                            key={`afternoon-transport-${index}`}
                            className="flex items-center gap-3 p-3 bg-sky-500/5 border border-sky-300/20 rounded-lg"
                          >
                            <div className="flex-shrink-0 text-sky-400">
                              {modeConfig?.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-dashboard-light font-poppins truncate">
                                {place.name}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <svg
                                  className="w-3 h-3 text-sky-400"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                              <div className="text-xs text-dashboard-light font-poppins truncate">
                                {nextPlace.name}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-xs text-sky-400 font-poppins font-semibold">
                                {modeConfig?.label}
                              </div>
                              <div className="text-xs text-dashboard-light font-poppins">
                                {segment
                                  ? [
                                      segment.distanceKm === null ? null : `${segment.distanceKm.toFixed(1)} km`,
                                      segment.estimatedMinutes === null ? null : `${segment.estimatedMinutes} min`,
                                    ].filter(Boolean).join(" • ") || "Not set"
                                  : "Not set"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Evening Routes */}
                  {eveningPlaces.length > 1 && (
                    <div className="space-y-3">
                      <div className="mb-3">
                        <h5 className="text-dashboard font-poppins font-semibold text-sm">
                          Evening Routes
                        </h5>
                      </div>
                      {eveningPlaces.slice(0, -1).map((place, index) => {
                        const nextPlace = eveningPlaces[index + 1];
                        const segment = getTransportSegment(place, nextPlace);
                        const modeConfig = getTravelModeConfig(
                          segment?.mode || "drive"
                        );

                        return (
                          <div
                            key={`evening-transport-${index}`}
                            className="flex items-center gap-3 p-3 bg-indigo-500/5 border border-indigo-300/20 rounded-lg"
                          >
                            <div className="flex-shrink-0 text-indigo-400">
                              {modeConfig?.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-dashboard-light font-poppins truncate">
                                {place.name}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <svg
                                  className="w-3 h-3 text-indigo-400"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                              <div className="text-xs text-dashboard-light font-poppins truncate">
                                {nextPlace.name}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-xs text-indigo-400 font-poppins font-semibold">
                                {modeConfig?.label}
                              </div>
                              <div className="text-xs text-dashboard-light font-poppins">
                                {segment
                                  ? [
                                      segment.distanceKm === null ? null : `${segment.distanceKm.toFixed(1)} km`,
                                      segment.estimatedMinutes === null ? null : `${segment.estimatedMinutes} min`,
                                    ].filter(Boolean).join(" • ") || "Not set"
                                  : "Not set"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="flex justify-center mb-3">
                    <TransportationIcon size="8" color="rgb(156 163 175)" />
                  </div>
                  <p className="text-dashboard-light text-sm font-poppins">
                    No transportation routes set yet. Add places in the Timeline
                    tab and select travel modes.
                  </p>
                </div>
              )}
            </div>
          )}
          {activeTab === "stay" && (
            <div className="space-y-4">
              <div>
                <h4 className="text-dashboard font-poppins font-semibold mb-1.5">
                  Accommodation & Lodging
                </h4>
                <p className="text-dashboard-light text-xs font-poppins">
                  Accommodations are automatically added when you select hotels,
                  lodging, or similar places in the Timeline tab
                </p>
              </div>

              {stayAccommodations.length > 0 ? (
                <div className="space-y-3">
                  {stayAccommodations.map((accommodation) => (
                    <div
                      key={accommodation.place_id}
                      className="flex items-center gap-3 p-3 bg-dashboard-bg rounded-lg border border-purple-200/20 hover:border-purple-400/40 transition-all shadow-sm"
                    >
                      {getPlaceIcon(accommodation.types, "5", "white")}
                      <div className="flex-1 min-w-0">
                        <h5 className="text-dashboard font-poppins font-semibold text-sm truncate">
                          {accommodation.name}
                        </h5>
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          accommodation.name
                        )}&query_place_id=${accommodation.place_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-400 hover:text-blue-500 transition-all"
                        title="Open in Google Maps"
                      >
                        <DirectionIcon size="4" />
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="flex justify-center mb-3">
                    <StayIcon size="8" color="rgb(156 163 175)" />
                  </div>
                  <p className="text-dashboard-light text-sm font-poppins">
                    No accommodations added yet. Add hotels or lodging in the
                    Timeline tab and they will appear here automatically.
                  </p>
                </div>
              )}
            </div>
          )}
          {activeTab === "things-to-do" && (
            <div className="space-y-4">
              <div>
                <h4 className="text-dashboard font-poppins font-semibold mb-1.5">
                  Things to Do
                </h4>
                <p className="text-dashboard-light text-xs font-poppins">
                  Attractions, activities, and experiences for travelers
                </p>
              </div>

              {/* Display activity cards or placeholder */}
              {activityPlaces.length > 0 ? (
                <div>
                  <p className="text-dashboard-light text-xs font-poppins mb-4 italic">
                    Activities are automatically added when you select activity
                    places in the Timeline tab
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {activityPlaces.map((activity) => (
                      <ActivityCard
                        key={activity.id}
                        activity={activity}
                        onClick={() => {
                          // Only open viewer if photos are available
                          if (activity.photos && activity.photos.length > 0) {
                            setSelectedActivityId(activity.id);
                            openViewer(0);
                          }
                        }}
                      />
                    ))}
                  </div>

                  {/* Media Viewer for selected activity photos */}
                  {selectedActivityId &&
                    (() => {
                      const selectedActivity = activityPlaces.find(
                        (a) => a.id === selectedActivityId
                      );
                      if (
                        !selectedActivity ||
                        !selectedActivity.photos ||
                        selectedActivity.photos.length === 0
                      ) {
                        return null;
                      }

                      return (
                        <MediaViewer
                          isOpen={isOpen}
                          onClose={() => {
                            closeViewer();
                            setSelectedActivityId(null);
                          }}
                          initialIndex={currentIndex}
                          mediaItems={selectedActivity.photos.map(
                            (photo): MediaItem => ({
                              id: photo.id,
                              url: photo.url,
                              alt: selectedActivity.name,
                              type: "image",
                              fileName: photo.fileName,
                              width: photo.width,
                              height: photo.height,
                              aspectRatio: photo.aspectRatio,
                            })
                          )}
                        />
                      );
                    })()}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="flex justify-center mb-3">
                    <Location size="8" fill="rgb(156 163 175)" />
                  </div>
                  <p className="text-dashboard-light text-sm font-poppins">
                    No activities added yet. When you add activity places (like
                    museums, parks, attractions) to the Timeline tab, they will
                    automatically appear here.
                  </p>
                </div>
              )}
            </div>
          )}
          {activeTab === "budget" && (
            <div className="space-y-4">
              <div>
                <h4 className="text-dashboard font-poppins font-semibold mb-1.5">
                  Cost Estimate
                </h4>
                <p className="text-dashboard-light text-xs font-poppins">
                  Budget breakdown for places in this part of the journey
                </p>
              </div>

              {/* Check if any places have price level or price range */}
              {(() => {
                const allPlacesWithBudget = [
                  ...morningPlaces.filter(
                    (p) => p.priceLevel !== undefined || p.priceRange !== undefined
                  ),
                  ...afternoonPlaces.filter(
                    (p) => p.priceLevel !== undefined || p.priceRange !== undefined
                  ),
                  ...eveningPlaces.filter(
                    (p) => p.priceLevel !== undefined || p.priceRange !== undefined
                  ),
                ];

                return allPlacesWithBudget.length > 0 ? (
                  <div className="space-y-6">
                    {/* Morning Budget */}
                    {morningPlaces.filter(
                      (p) => p.priceLevel !== undefined || p.priceRange !== undefined
                    ).length > 0 && (
                        <div className="space-y-3">
                          <div className="mb-3">
                            <h5 className="text-dashboard font-poppins font-semibold text-sm flex items-center gap-2">
                              <span className="text-amber-400">Morning</span>
                            </h5>
                          </div>
                          {morningPlaces
                            .filter(
                              (p) => p.priceLevel !== undefined || p.priceRange !== undefined
                            )
                            .map((place) => (
                              <div
                                key={place.id}
                                className="p-3 bg-amber-500/5 border border-amber-300/20 rounded-lg"
                              >
                                <div className="flex items-start gap-3">
                                  {getPlaceIcon(place.types, "5", "white")}
                                  <div className="flex-1 min-w-0">
                                    <h6 className="text-dashboard font-poppins font-semibold text-sm mb-2">
                                      {place.name}
                                    </h6>
                                    <div className="flex items-center gap-2">
                                      <BudgetIcon
                                        size="4"
                                        color="rgb(251 191 36)"
                                      />
                                      <span className="text-amber-400 font-poppins font-semibold text-sm">
                                        {getBudgetDisplayText(place)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}

                    {/* Afternoon Budget */}
                    {afternoonPlaces.filter(
                      (p) => p.priceLevel !== undefined || p.priceRange !== undefined
                    ).length > 0 && (
                        <div className="space-y-3">
                          <div className="mb-3">
                            <h5 className="text-dashboard font-poppins font-semibold text-sm flex items-center gap-2">
                              <span className="text-sky-400">Afternoon</span>
                            </h5>
                          </div>
                          {afternoonPlaces
                            .filter(
                              (p) => p.priceLevel !== undefined || p.priceRange !== undefined
                            )
                            .map((place) => (
                              <div
                                key={place.id}
                                className="p-3 bg-sky-500/5 border border-sky-300/20 rounded-lg"
                              >
                                <div className="flex items-start gap-3">
                                  {getPlaceIcon(place.types, "5", "white")}
                                  <div className="flex-1 min-w-0">
                                    <h6 className="text-dashboard font-poppins font-semibold text-sm mb-2">
                                      {place.name}
                                    </h6>
                                    <div className="flex items-center gap-2">
                                      <BudgetIcon
                                        size="4"
                                        color="rgb(125 211 252)"
                                      />
                                      <span className="text-sky-400 font-poppins font-semibold text-sm">
                                        {getBudgetDisplayText(place)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}

                    {/* Evening Budget */}
                    {eveningPlaces.filter(
                      (p) => p.priceLevel !== undefined || p.priceRange !== undefined
                    ).length > 0 && (
                        <div className="space-y-3">
                          <div className="mb-3">
                            <h5 className="text-dashboard font-poppins font-semibold text-sm flex items-center gap-2">
                              <span className="text-indigo-400">Evening</span>
                            </h5>
                          </div>
                          {eveningPlaces
                            .filter(
                              (p) => p.priceLevel !== undefined || p.priceRange !== undefined
                            )
                            .map((place) => (
                              <div
                                key={place.id}
                                className="p-3 bg-indigo-500/5 border border-indigo-300/20 rounded-lg"
                              >
                                <div className="flex items-start gap-3">
                                  {getPlaceIcon(place.types, "5", "white")}
                                  <div className="flex-1 min-w-0">
                                    <h6 className="text-dashboard font-poppins font-semibold text-sm mb-2">
                                      {place.name}
                                    </h6>
                                    <div className="flex items-center gap-2">
                                      <BudgetIcon
                                        size="4"
                                        color="rgb(165 180 252)"
                                      />
                                      <span className="text-indigo-400 font-poppins font-semibold text-sm">
                                        {getBudgetDisplayText(place)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="flex justify-center mb-3">
                      <BudgetIcon size="8" color="rgb(156 163 175)" />
                    </div>
                    <p className="text-dashboard-light text-sm font-poppins">
                      No budget information available yet. When you add places
                      to the Timeline tab, their price levels will automatically
                      appear here.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
          {activeTab === "tips" && (
            <div className="space-y-4">
              <div>
                <h4 className="text-dashboard font-poppins font-semibold mb-1.5">
                  Place-Specific Tips
                </h4>
                <p className="text-dashboard-light text-xs font-poppins">
                  All tips added to places in the Timeline tab appear here
                </p>
              </div>

              {/* Check if any places have tips */}
              {(() => {
                const allPlacesWithTips = [
                  ...morningPlaces.filter((p) => p.tips),
                  ...afternoonPlaces.filter((p) => p.tips),
                  ...eveningPlaces.filter((p) => p.tips),
                ];

                return allPlacesWithTips.length > 0 ? (
                  <div className="space-y-6">
                    {/* Morning Tips */}
                    {morningPlaces.filter((p) => p.tips).length > 0 && (
                      <div className="space-y-3">
                        <div className="mb-3">
                          <h5 className="text-dashboard font-poppins font-semibold text-sm flex items-center gap-2">
                            <span className="text-amber-400">Morning</span>
                          </h5>
                        </div>
                        {morningPlaces
                          .filter((p) => p.tips)
                          .map((place) => (
                            <div
                              key={place.id}
                              className="p-3 bg-amber-500/5 border border-amber-300/20 rounded-lg"
                            >
                              <div className="flex items-start gap-3">
                                {getPlaceIcon(place.types, "5", "white")}
                                <div className="flex-1 min-w-0">
                                  <h6 className="text-dashboard font-poppins font-semibold text-sm mb-2">
                                    {place.name}
                                  </h6>
                                  <div className="flex items-start gap-2">
                                    <TipsIcon
                                      size="4"
                                      color="rgb(251 191 36)"
                                    />
                                    <p className="text-dashboard-light text-xs font-poppins italic flex-1">
                                      {place.tips}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Afternoon Tips */}
                    {afternoonPlaces.filter((p) => p.tips).length > 0 && (
                      <div className="space-y-3">
                        <div className="mb-3">
                          <h5 className="text-dashboard font-poppins font-semibold text-sm flex items-center gap-2">
                            <span className="text-sky-400">Afternoon</span>
                          </h5>
                        </div>
                        {afternoonPlaces
                          .filter((p) => p.tips)
                          .map((place) => (
                            <div
                              key={place.id}
                              className="p-3 bg-sky-500/5 border border-sky-300/20 rounded-lg"
                            >
                              <div className="flex items-start gap-3">
                                {getPlaceIcon(place.types, "5", "white")}
                                <div className="flex-1 min-w-0">
                                  <h6 className="text-dashboard font-poppins font-semibold text-sm mb-2">
                                    {place.name}
                                  </h6>
                                  <div className="flex items-start gap-2">
                                    <TipsIcon
                                      size="4"
                                      color="rgb(125 211 252)"
                                    />
                                    <p className="text-dashboard-light text-xs font-poppins italic flex-1">
                                      {place.tips}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Evening Tips */}
                    {eveningPlaces.filter((p) => p.tips).length > 0 && (
                      <div className="space-y-3">
                        <div className="mb-3">
                          <h5 className="text-dashboard font-poppins font-semibold text-sm flex items-center gap-2">
                            <span className="text-indigo-400">Evening</span>
                          </h5>
                        </div>
                        {eveningPlaces
                          .filter((p) => p.tips)
                          .map((place) => (
                            <div
                              key={place.id}
                              className="p-3 bg-indigo-500/5 border border-indigo-300/20 rounded-lg"
                            >
                              <div className="flex items-start gap-3">
                                {getPlaceIcon(place.types, "5", "white")}
                                <div className="flex-1 min-w-0">
                                  <h6 className="text-dashboard font-poppins font-semibold text-sm mb-2">
                                    {place.name}
                                  </h6>
                                  <div className="flex items-start gap-2">
                                    <TipsIcon
                                      size="4"
                                      color="rgb(165 180 252)"
                                    />
                                    <p className="text-dashboard-light text-xs font-poppins italic flex-1">
                                      {place.tips}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="flex justify-center mb-3">
                      <TipsIcon size="8" color="rgb(156 163 175)" />
                    </div>
                    <p className="text-dashboard-light text-sm font-poppins">
                      No tips added yet. Add tips to places in the Timeline tab
                      and they will appear here.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons - Removed from here, now in modal footer */}

      {/* Tips Edit Modal */}
      {editingTips && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dashboard-sidebar rounded-lg shadow-dashboard-elevated border border-dashboard max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <TipsIcon size="6" color="white" />
              <h3 className="text-dashboard font-poppins font-semibold text-lg">
                Add Tips for Place
              </h3>
            </div>
            <p className="text-dashboard-light text-sm font-poppins mb-4">
              Share helpful tips, recommendations, or important notes about this
              place.
            </p>
            <textarea
              value={editingTips.currentTips}
              onChange={(e) =>
                setEditingTips({
                  ...editingTips,
                  currentTips: e.target.value,
                })
              }
              placeholder="e.g., Wake up early to avoid crowds, Try their signature dish, Best visited during sunset..."
              className="w-full p-3 bg-dashboard-muted text-dashboard rounded-lg border border-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent font-poppins text-sm resize-none"
              rows={4}
            />
            <div className="flex gap-2 justify-end mt-4">
              <button
                type="button"
                onClick={() => setEditingTips(null)}
                className="px-4 py-2 bg-dashboard-muted text-dashboard rounded-lg hover:bg-dashboard-bg transition-colors font-poppins text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  updatePlaceTips(
                    editingTips.period,
                    editingTips.placeId,
                    editingTips.currentTips
                  );
                }}
                className="px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:opacity-90 transition-opacity font-poppins text-sm font-medium"
              >
                Save Tips
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget Input Modal */}
      {editingBudget && (
        <BudgetInputModal
          isOpen={!!editingBudget}
          placeName={editingBudget.placeName}
          currentBudget={editingBudget.currentBudget}
          budgetAmount={editingBudget.budgetAmount}
          budgetCurrency={editingBudget.budgetCurrency}
          existingPriceRange={editingBudget.priceRange}
          existingPriceLevel={editingBudget.priceLevel}
          onSave={(budget) =>
            handleSaveBudget(
              editingBudget.period,
              editingBudget.placeId,
              budget
            )
          }
          onSaveCurrency={(amount, currency) =>
            handleSaveBudgetCurrency(
              editingBudget.period,
              editingBudget.placeId,
              amount,
              currency
            )
          }
          onClose={() => setEditingBudget(null)}
        />
      )}
    </form>
  );
};

export default GuideSectionForm;
