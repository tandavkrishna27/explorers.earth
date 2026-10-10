import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import BackIcon from "../../../assets/icons/BackIcon";
import Button from "../../../components/ui/Button";
import CreateGuideStep1 from "./CreateGuideStep1";
import CreateGuideStep2 from "./CreateGuideStep2";
import CreateGuideStep3 from "./CreateGuideStep3";
import { useGuidesOwner } from "../hooks/useGuidesOwner";
import { GuidesClient } from "../api/guidesClient";
import { createGuide } from "../api/guideCreation";
import { guideWizardDetails } from "../api/guideWizardDetails";
import { explorersApiClient } from "../../../lib/explorersApiClient";
import {
  blocksToHtml,
} from "../../../utils/strapiBlocksConverter";
import {
  fetchSingleCityLocationImage,
  fetchMultiCityLocationImage,
  type LocationImageResult
} from "../services/locationImageService";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface CreateGuidePageProps {
  type?: "create" | "edit";
  isModal?: boolean;
  onClose?: () => void;
  onCreated?: (newId?: string) => void;
  defaultTitle?: string;
}

// Location mode type
type LocationMode = "single" | "multi";

// Intermediate city interface
interface IntermediateCity {
  id: string;
  place: google.maps.places.PlaceResult | null;
  displayValue: string;
  hasDate?: boolean;
  date?: string; // ISO date string (YYYY-MM-DD)
}

// Form data interface
interface GuideFormData {
  guideType: string;
  // Single city location (backward compatible)
  selectedPlace: google.maps.places.PlaceResult | null;
  locationDisplayValue: string;
  // Multi city locations
  fromLocation: google.maps.places.PlaceResult | null;
  fromLocationDisplayValue: string;
  toLocation: google.maps.places.PlaceResult | null;
  toLocationDisplayValue: string;
  intermediateCities: IntermediateCity[];
  // Location mode indicator
  locationMode: LocationMode;
  // Number of days for itinerary guides
  numberOfDays: number | null;
  // Categories for itinerary guides
  categories: string[];
  // Best time to visit (months)
  bestTimeToVisit: string[];
  // Budget type
  budgetType: string | null;
  title: string;
  description: string;
  guideMedia: File | null;
}

const CreateGuidePage = ({
  type = "create",
  isModal = false,
  onClose,
  onCreated,
  defaultTitle,
}: CreateGuidePageProps) => {
  const navigate = useNavigate();
  const { guideId } = useParams();

  // Step management - support 3 steps for Itinerary, 2 steps for Theme
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form data state
  const [formData, setFormData] = useState<GuideFormData>({
    guideType: "",
    selectedPlace: null,
    locationDisplayValue: "",
    fromLocation: null,
    fromLocationDisplayValue: "",
    toLocation: null,
    toLocationDisplayValue: "",
    intermediateCities: [],
    locationMode: "single",
    numberOfDays: null,
    categories: [],
    bestTimeToVisit: [],
    budgetType: null,
    title: defaultTitle || "",
    description: "",
    guideMedia: null,
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (defaultTitle) {
      setFormData((prev) => ({ ...prev, title: defaultTitle }));
    }
  }, [defaultTitle]);


  // Location image pre-fill state

  const [isFetchingLocationImage, setIsFetchingLocationImage] = useState(false);

  // Calculate total steps based on guide type
  const totalSteps = formData.guideType === "Itinerary" ? 3 : 2;

  // No account lookup: the canonical owner read is already scoped to the signed-in owner.
  // In edit mode this also supplies the observation every write states its revision from.
  const isEdit = type === "edit" && !!guideId;
  const {
    guide: ownedGuide, observation, content, loading: guideLoading, refresh: refreshGuide,
  } = useGuidesOwner(guideId, isEdit);
  const guideData = ownedGuide ? { guide: ownedGuide } : undefined;

  // Pre-populate form when editing
  useEffect(() => {
    if (type === "edit" && guideData?.guide) {
      const guide = guideData.guide;

      // Set preview URL for existing media
      if (guide.Guide_Media?.[0]?.url) {
        setPreviewUrl(guide.Guide_Media[0].url);
      }

      // Convert description blocks to HTML
      let descriptionHtml = "";
      if (guide.Description) {
        if (typeof guide.Description === "string") {
          descriptionHtml = guide.Description;
        } else if (Array.isArray(guide.Description)) {
          descriptionHtml = blocksToHtml(guide.Description);
        }
      }

      // Reconstruct place object(s) if available
      // Handle both single-city (backward compatible) and multi-city formats
      let reconstructedPlace: google.maps.places.PlaceResult | null = null;
      let locationDisplay = "";
      let reconstructedFromPlace: google.maps.places.PlaceResult | null = null;
      let fromLocationDisplay = "";
      let reconstructedToPlace: google.maps.places.PlaceResult | null = null;
      let toLocationDisplay = "";
      let intermediateCities: IntermediateCity[] = [];
      let locationMode: LocationMode = "single";

      if (guide.Place_Details) {
        // Parse Place_Details if it's a string (JSON)
        let placeDetails: any = guide.Place_Details;
        if (typeof guide.Place_Details === "string") {
          try {
            placeDetails = JSON.parse(guide.Place_Details);
          } catch (e) {
            console.error("Error parsing Place_Details JSON:", e);
            placeDetails = null;
          }
        }

        if (!placeDetails) {
          // Invalid or empty place details
          // Fallback: check is_Multicity field from guide
          if (guide.is_Multicity === true) {
            locationMode = "multi";
          }
        } else if (placeDetails.isMultiCity || guide.is_Multicity === true) {
          // Multi-city format - support both new (starting/ending) and legacy (arrival/departure, from/to) keys for backward compatibility
          locationMode = "multi";

          // Reconstruct starting location - support new (starting) and legacy (departure, from) keys
          const startingDetails = placeDetails.starting || placeDetails.departure || placeDetails.from;
          if (startingDetails) {
            fromLocationDisplay = startingDetails.Place_Name || startingDetails.Place_Address || "";
            reconstructedFromPlace = {
              name: startingDetails.Place_Name,
              formatted_address: startingDetails.Place_Address,
              place_id: startingDetails.Place_Id,
              // Rating fields are optional (for backward compatibility with old data)
              rating: startingDetails.Rating || undefined,
              user_ratings_total: startingDetails.Rating_Count || undefined,
              geometry: {
                location: {
                  lat: () => startingDetails.Geometry?.lat || 0,
                  lng: () => startingDetails.Geometry?.lng || 0,
                } as google.maps.LatLng,
              } as google.maps.places.PlaceGeometry,
            };
          }

          // Reconstruct ending location - support new (ending) and legacy (arrival, to) keys
          const endingDetails = placeDetails.ending || placeDetails.arrival || placeDetails.to;
          if (endingDetails) {
            toLocationDisplay = endingDetails.Place_Name || endingDetails.Place_Address || "";
            reconstructedToPlace = {
              name: endingDetails.Place_Name,
              formatted_address: endingDetails.Place_Address,
              place_id: endingDetails.Place_Id,
              // Rating fields are optional (for backward compatibility with old data)
              rating: endingDetails.Rating || undefined,
              user_ratings_total: endingDetails.Rating_Count || undefined,
              geometry: {
                location: {
                  lat: () => endingDetails.Geometry?.lat || 0,
                  lng: () => endingDetails.Geometry?.lng || 0,
                } as google.maps.LatLng,
              } as google.maps.places.PlaceGeometry,
            };
          }

          // Reconstruct intermediate cities
          if (placeDetails.intermediateCities && Array.isArray(placeDetails.intermediateCities)) {
            intermediateCities = placeDetails.intermediateCities.map((city: any, index: number) => ({
              id: city.id || `intermediate-${index}-${Date.now()}`,
              place: {
                name: city.Place_Name,
                formatted_address: city.Place_Address,
                place_id: city.Place_Id,
                rating: city.Rating || undefined,
                user_ratings_total: city.Rating_Count || undefined,
                geometry: {
                  location: {
                    lat: () => city.Geometry?.lat || 0,
                    lng: () => city.Geometry?.lng || 0,
                  } as google.maps.LatLng,
                } as google.maps.places.PlaceGeometry,
              } as google.maps.places.PlaceResult,
              displayValue: city.Place_Name || city.Place_Address || "",
              hasDate: city.hasDate || false,
              date: city.date || undefined,
            }));
          }
        } else {
          // Single-city format (backward compatible)
          locationMode = "single";
          locationDisplay =
            placeDetails.Place_Name ||
            placeDetails.Place_Address ||
            "";

          reconstructedPlace = {
            name: placeDetails.Place_Name,
            formatted_address: placeDetails.Place_Address,
            place_id: placeDetails.Place_Id,
            // Rating fields are optional (for backward compatibility with old data)
            rating: placeDetails.Rating || undefined,
            user_ratings_total: placeDetails.Rating_Count || undefined,
            geometry: {
              location: {
                lat: () => placeDetails.Geometry?.lat || 0,
                lng: () => placeDetails.Geometry?.lng || 0,
              } as google.maps.LatLng,
            } as google.maps.places.PlaceGeometry,
          };
        }
      }

      // Parse categories - handle both array and string formats
      let categories: string[] = [];
      if (guide.Category) {
        if (Array.isArray(guide.Category)) {
          categories = guide.Category;
        } else if (typeof guide.Category === "string") {
          try {
            categories = JSON.parse(guide.Category);
          } catch {
            // If not JSON, treat as single category string
            categories = [guide.Category];
          }
        }
      }

      // Parse best time to visit - handle JSON format
      let bestTimeToVisit: string[] = [];
      if (guide.Best_Time_To_Visit) {
        if (Array.isArray(guide.Best_Time_To_Visit)) {
          bestTimeToVisit = guide.Best_Time_To_Visit;
        } else if (typeof guide.Best_Time_To_Visit === "string") {
          try {
            bestTimeToVisit = JSON.parse(guide.Best_Time_To_Visit);
          } catch {
            // If not JSON, treat as single month string
            bestTimeToVisit = [guide.Best_Time_To_Visit];
          }
        }
      }

      setFormData({
        guideType: guide.Guide_Type || "",
        selectedPlace: reconstructedPlace,
        locationDisplayValue: locationDisplay,
        fromLocation: reconstructedFromPlace,
        fromLocationDisplayValue: fromLocationDisplay,
        toLocation: reconstructedToPlace,
        toLocationDisplayValue: toLocationDisplay,
        intermediateCities: intermediateCities,
        locationMode: locationMode,
        numberOfDays: guide.Number_Of_Days || null,
        categories: categories,
        bestTimeToVisit: bestTimeToVisit,
        budgetType: guide.Budget_Type || null,
        title: guide.Title || "",
        description: descriptionHtml,
        guideMedia: null,
      });
    }
  }, [type, guideData]);

  // Format place details for storage - only essential place information
  const formatPlaceDetails = (place: google.maps.places.PlaceResult) => {
    return {
      Place_Id: place.place_id || "",
      Place_Name: place.name || "",
      Place_Address: place.formatted_address || "",
      Geometry: {
        lat: place.geometry?.location?.lat() || 0,
        lng: place.geometry?.location?.lng() || 0,
      },
    };
  };

  // Handle Step 1 completion - supports both single and multi-city
  const handleStep1Next = async (data: {
    guideType: string;
    // Single city payload (backward compatible)
    selectedPlace?: google.maps.places.PlaceResult;
    locationDisplayValue?: string;
    // Multi city payload
    fromLocation?: google.maps.places.PlaceResult;
    fromLocationDisplayValue?: string;
    toLocation?: google.maps.places.PlaceResult;
    toLocationDisplayValue?: string;
    intermediateCities?: IntermediateCity[];
    // Mode indicator
    locationMode: LocationMode;
  }) => {
    setFormData((prev) => ({
      ...prev,
      guideType: data.guideType,
      locationMode: data.locationMode,
      // Single city data (preserve if provided)
      selectedPlace: data.selectedPlace || prev.selectedPlace,
      locationDisplayValue: data.locationDisplayValue || prev.locationDisplayValue,
      // Multi city data (preserve if provided)
      fromLocation: data.fromLocation || prev.fromLocation,
      fromLocationDisplayValue: data.fromLocationDisplayValue || prev.fromLocationDisplayValue,
      toLocation: data.toLocation || prev.toLocation,
      toLocationDisplayValue: data.toLocationDisplayValue || prev.toLocationDisplayValue,
      intermediateCities: data.intermediateCities || prev.intermediateCities,
    }));

    // Fetch location image in background (only in create mode, not edit)
    if (type === "create") {
      fetchLocationImageInBackground(data);
    }

    // If Itinerary, go to Step 2 (number of days & categories)
    // If Theme, skip to Step 3 (final step - title, description, media)
    if (data.guideType === "Itinerary") {
      setCurrentStep(2);
    } else {
      setCurrentStep(3);
    }
  };

  /**
   * Fetch location image in the background after Step 1
   * Non-blocking - runs async while user proceeds to next step
   */
  const fetchLocationImageInBackground = async (locationData: {
    locationMode: LocationMode;
    selectedPlace?: google.maps.places.PlaceResult;
    toLocation?: google.maps.places.PlaceResult;
  }) => {
    setIsFetchingLocationImage(true);

    try {
      let imageResult: LocationImageResult | null = null;

      // Determine which location to use based on mode
      if (locationData.locationMode === "multi" && locationData.toLocation) {
        // Multi-city: use destination/arrival location
        imageResult = await fetchMultiCityLocationImage(locationData.toLocation);
      } else if (locationData.locationMode === "single" && locationData.selectedPlace) {
        // Single-city: use selected location
        imageResult = await fetchSingleCityLocationImage(locationData.selectedPlace);
      }

      if (imageResult) {
        // Only set if user hasn't manually uploaded an image yet
        setFormData((prev) => {
          if (!prev.guideMedia) {
            return {
              ...prev,
              guideMedia: imageResult.file,
            };
          }
          return prev;
        });

        setPreviewUrl(imageResult.previewUrl);
      }
    } catch (error) {
      console.error("Failed to fetch location image:", error);
      // Silent fail - user can still upload manually
    } finally {
      setIsFetchingLocationImage(false);
    }
  };

  // Handle Step 2 completion (number of days & categories for Itinerary)
  const handleStep2Next = (data: {
    numberOfDays: number | null;
    categories: string[];
    bestTimeToVisit: string[];
    budgetType: string | null;
  }) => {
    setFormData((prev) => ({
      ...prev,
      numberOfDays: data.numberOfDays,
      categories: data.categories,
      bestTimeToVisit: data.bestTimeToVisit,
      budgetType: data.budgetType,
    }));
    setCurrentStep(3);
  };

  // Handle Step 2 back (from Itinerary details)
  const handleStep2Back = () => {
    setCurrentStep(1);
  };

  // Handle Step 3 back (from final step)
  const handleStep3Back = () => {
    // If Itinerary, go back to Step 2, otherwise go back to Step 1
    if (formData.guideType === "Itinerary") {
      setCurrentStep(2);
    } else {
      setCurrentStep(1);
    }
  };

  // Handle final submission
  const handleStep3Submit = async (data: {
    title: string;
    description: string;
    guideMedia: File | null;
  }) => {
    setIsSubmitting(true);

    try {
      const plainDescription = (data.description ?? "").replace(/<[^>]*>/g, "").trim() || null;

      // The guide's place: a single point, or the whole route for a multi-city trip. The
      // route form is why the contract models both - reducing it to a point drops it.
      const placeSnapshot = formData.locationMode === "multi"
        ? {
            ending: formData.toLocation ? formatPlaceDetails(formData.toLocation) : null,
            starting: formData.fromLocation ? formatPlaceDetails(formData.fromLocation) : null,
            intermediateCities: formData.intermediateCities
              .filter((city) => city.place)
              .map((city) => ({
                id: city.id,
                ...formatPlaceDetails(city.place!),
                hasDate: city.hasDate || false,
                date: city.date || undefined,
              })),
            isMultiCity: true as const,
          }
        : formData.selectedPlace
          ? (() => {
              const place = formatPlaceDetails(formData.selectedPlace);
              return {
                name: place.Place_Name || null,
                address: place.Place_Address || null,
                placeId: place.Place_Id || null,
                rating: null,
                ratingsCount: null,
                lat: place.Geometry.lat,
                lng: place.Geometry.lng,
              };
            })()
          : {};

      const details = guideWizardDetails(formData, placeSnapshot);

      let resultDocumentId: string;

      if (type === "edit" && guideId) {
        if (!observation) throw new Error("Guide could not be loaded. Refresh and try again.");
        const list = content?.lists.get(guideId);
        if (!list) throw new Error("Guide could not be loaded. Refresh and try again.");

        // Title and description live on the collection; the guide's own fields live on the
        // aggregate. Both are written, each through the command that owns it.
        await explorersApiClient.updateMyCollection(list, {
          title: data.title,
          ...(plainDescription === null ? {} : {description: plainDescription}),
        }, crypto.randomUUID());
        let current = await GuidesClient.observeWholeGuide(guideId);
        current = await GuidesClient.writeDetails(GuidesClient.prepareIntent(current),
          guideWizardDetails(formData, placeSnapshot, current.aggregate.details));

        // The cover is uploaded and only then attached, so a failed upload leaves the
        // existing cover in place. The Strapi path deleted the old file first, which is
        // why a failed upload used to leave a guide with no image at all.
        if (data.guideMedia) {
          try {
            await GuidesClient.attachCover(GuidesClient.prepareIntent(current), data.guideMedia);
          } catch (uploadError) {
            console.error("Media upload failed:", uploadError);
            toast.warning("Media upload failed. The guide data was still updated.");
          }
        }
        refreshGuide();
        resultDocumentId = guideId;
        toast.success("Guide updated successfully!");
      } else {
        // One collection create, then writes against the guide it produced. The sections
        // and the cover go with it, so the wizard has nothing left to arrange afterwards.
        const created = await createGuide({
          title: data.title,
          description: plainDescription,
          details,
          sections: [],
          cover: data.guideMedia ?? null,
        });
        resultDocumentId = created.collectionId;

        // Show success toast only after ALL uploads (media + section photos) are complete
        toast.success("Guide created successfully!");
      }

      // Navigate to guide details page
      if (type === "create" && resultDocumentId) {
        if (isModal && onCreated) {
          onCreated(resultDocumentId);
        } else {
          navigate(`/guides/${resultDocumentId}`, { state: { justCreatedGuide: true } });
        }
      } else if (type === "edit" && guideId) {
        if (isModal && onClose) {
          onClose();
        } else {
          navigate(`/guides/${guideId}`, {
            replace: true,
            state: { refetch: Date.now() },
          });
        }
      }
    } catch (err: any) {
      console.error(
        `Error ${type === "edit" ? "updating" : "creating"} guide:`,
        err
      );
      toast.error(`Failed to ${type === "edit" ? "update" : "create"} guide`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (isModal && onClose) {
      onClose();
    } else {
      navigate(type === "edit" && guideId ? `/guides/${guideId}` : "/guides");
    }
  };

  // Show loading state while fetching guide data in edit mode
  if (type === "edit" && guideLoading) {
    return (
      <div className="dashboard-theme bg-dashboard-bg min-h-screen px-4 pb-4 md:pt-10">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="bg-dashboard-modal p-6 rounded-lg border border-dashboard-accent shadow-dashboard-elevated text-center">
            <p className="text-dashboard-light font-poppins">
              Loading guide data...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={isModal ? "dashboard-theme w-full" : "dashboard-theme bg-dashboard-bg min-h-screen px-4 pb-4 md:pt-10"}>
      <div className={isModal ? "flex relative flex-col max-w-full gap-4 w-full" : "flex relative flex-col mb-10 items-center justify-center min-h-[calc(100vh-8rem)] max-w-full gap-4"}>
        {/* Header with Back Button */}
        <div className="flex flex-row gap-2 md:gap-4 w-full md:justify-between justify-between items-center mb-4">
          {!isModal && (
            <Button
              size="xsmall"
              variant="ghost"
              onClickHandler={handleCancel}
              startIcon={<BackIcon stroke="var(--dash-accent)" size="size-5 md:size-6" />}
            />
          )}
          <h1 className="text-dashboard text-lg md:text-2xl font-poppins font-bold">
            {type === "edit" ? "Edit Guide" : "Create New Guide"}
          </h1>
          {isModal ? (
            <button onClick={handleCancel} className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors border-none cursor-pointer">
              <X size={16} />
            </button>
          ) : (
            <div className="w-10"></div>
          )}
        </div>

        {/* Render appropriate step */}
        {currentStep === 1 ? (
          <CreateGuideStep1
            initialGuideType={formData.guideType}
            initialLocation={formData.selectedPlace}
            initialLocationDisplay={formData.locationDisplayValue}
            initialFromLocation={formData.fromLocation}
            initialFromLocationDisplay={formData.fromLocationDisplayValue}
            initialToLocation={formData.toLocation}
            initialToLocationDisplay={formData.toLocationDisplayValue}
            initialIntermediateCities={formData.intermediateCities}
            initialLocationMode={formData.locationMode}
            onNext={handleStep1Next}
            onCancel={handleCancel}
          />
        ) : currentStep === 2 ? (
          <CreateGuideStep2
            initialNumberOfDays={formData.numberOfDays}
            initialCategories={formData.categories}
            initialBestTimeToVisit={formData.bestTimeToVisit}
            initialBudgetType={formData.budgetType}
            onBack={handleStep2Back}
            onNext={handleStep2Next}
          />
        ) : (
          <CreateGuideStep3
            initialTitle={formData.title}
            initialDescription={formData.description}
            initialMedia={formData.guideMedia}
            initialMediaPreview={previewUrl}

            isFetchingLocationImage={isFetchingLocationImage}
            onBack={handleStep3Back}
            onSubmit={handleStep3Submit}
            isSubmitting={isSubmitting}
            isEditMode={type === "edit"}
            totalSteps={totalSteps}
            onImageChange={() => { }}
          />
        )}
      </div>
    </div>
  );
};

export default CreateGuidePage;

export const CreateGuideModal = ({
  open,
  onClose,
  onCreated,
  defaultTitle,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (newId?: string) => void;
  defaultTitle?: string;
}) => {
  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4 text-center">
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="bg-dashboard-sidebar rounded-xl border border-dashboard-border p-6 md:p-8 w-full max-w-4xl shadow-2xl relative z-10 my-8 text-left overflow-y-auto max-h-[90vh]"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <CreateGuidePage
              isModal={true}
              onClose={onClose}
              onCreated={onCreated}
              type="create"
              defaultTitle={defaultTitle}
            />
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};
