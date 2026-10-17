import { selectGuidePlaceGallery } from "../../utils/publicGuidePhotoViewModel";
import { FC, memo, useState, useEffect, useRef, type CSSProperties } from "react";
import { usePublicCategoryThemeStyles } from "../PublicCategoryThemeContext";
import CrossIcon from "../../../../assets/icons/CrossIcon";
import Button from "../../../../components/ui/Button";
import StarIcon from "../../../../assets/icons/StarIcon";
import ClockIcon from "../../../../assets/icons/ClockIcon";
import Tab from "../../../../components/ui/Tab";
import Overview from "../PlaceDetails/Details/Overview";
import MediaGallery from "../PlaceDetails/Details/MediaGallery";
import Address from "../PlaceDetails/Details/Address";
import { EarthLoader } from "../../../../components/EarthLoader";

interface GooglePlaceModalProps {
  place: any; // Google Place data with place_id, name, formatted_address, etc.
  isOpen: boolean;
  onClose: () => void;
  sections?: any[]; // Guide sections to look up S3 images
}

const GooglePlaceModal: FC<GooglePlaceModalProps> = memo(
  ({ place, isOpen, onClose, sections = [] }) => {
    const categoryStyles = usePublicCategoryThemeStyles();
    const [activeTab, setActiveTab] = useState("Overview");
    const [fetchedPlace, setFetchedPlace] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const [dragY, setDragY] = useState(0);
    const startYRef = useRef(0);
    const currentYRef = useRef(0);


    // Fetch detailed place information and transform to match PlaceOverview format
    useEffect(() => {
      if (!isOpen || !place?.place_id) return;

      const fetchDetails = async () => {
        setLoading(true);
        try {
          // First, try to get S3 images from guide data
          const s3Images = selectGuidePlaceGallery(place, sections).map(photo => ({ url: photo.url, alt: place.name || "Place" }));

          // Get location coordinates from place
          const lat = place.geometry?.location
            ? (typeof place.geometry.location.lat === "function"
              ? place.geometry.location.lat()
              : place.geometry.location.lat)
            : undefined;
          const lng = place.geometry?.location
            ? (typeof place.geometry.location.lng === "function"
              ? place.geometry.location.lng()
              : place.geometry.location.lng)
            : undefined;

          // Use S3 images if available, otherwise use place data
          const imageDetails: Array<{ url: string; alt?: string }> = s3Images.length > 0
            ? s3Images
            : [];

          // Transform to match PlaceOverview expected format
          const transformedPlace = {
            Place_Details: {
              Title: place.name || "Place",
              Place_Name: place.name || "Place",
              Place_Address: place.formatted_address || "",
              Geometry: lat && lng ? { lat, lng } : undefined,
              Rating: place.rating,
              Rating_Count: place.user_ratings_total || 0,
            },
            Contact_Number: "",
            Places_Social_Link: "",
            user_recommendation_note: "",
            Users_Social_URL: "",
            recommendation_category: {
              Category_Name: place.types?.[0]?.replace(/_/g, " ") || "Place",
            },
            media_details: {
              imageDetails: imageDetails,
            },
          };

          setFetchedPlace(transformedPlace);
        } catch (error) {
          console.error("Error processing place details:", error);
          // Fallback to place data with minimal transformation
          const lat = place.geometry?.location
            ? (typeof place.geometry.location.lat === "function"
              ? place.geometry.location.lat()
              : place.geometry.location.lat)
            : undefined;
          const lng = place.geometry?.location
            ? (typeof place.geometry.location.lng === "function"
              ? place.geometry.location.lng()
              : place.geometry.location.lng)
            : undefined;

          setFetchedPlace({
            Place_Details: {
              Title: place.name || "Place",
              Place_Name: place.name || "Place",
              Place_Address: place.formatted_address || "",
              Geometry: lat && lng ? { lat, lng } : undefined,
              Rating: place.rating,
              Rating_Count: place.user_ratings_total || 0,
            },
            Contact_Number: "",
            Places_Social_Link: "",
            user_recommendation_note: "",
            Users_Social_URL: "",
            recommendation_category: {
              Category_Name: place.types?.[0]?.replace(/_/g, " ") || "Place",
            },
            media_details: {
              imageDetails: [],
            },
          });
        } finally {
          setLoading(false);
        }
      };

      fetchDetails();
    }, [isOpen, place, sections]);

    // Prevent background scrolling when modal is open
    useEffect(() => {
      if (isOpen) {
        document.body.style.overflow = "hidden";
        return () => {
          document.body.style.overflow = "unset";
        };
      }
    }, [isOpen]);

    const handleTabChange = (tabName: string) => {
      setActiveTab(tabName);
    };

    // Touch event handlers for swipe-to-close
    const handleTouchStart = (e: React.TouchEvent) => {
      const touch = e.touches[0];
      startYRef.current = touch.clientY;
      currentYRef.current = touch.clientY;
      setIsDragging(true);
      setDragY(0);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (!isDragging) return;

      const touch = e.touches[0];
      currentYRef.current = touch.clientY;
      const deltaY = touch.clientY - startYRef.current;

      // Only allow downward drag
      if (deltaY > 0) {
        setDragY(deltaY);
        // Add some resistance when dragging
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (!isDragging) return;

      const deltaY = currentYRef.current - startYRef.current;

      // Close modal if dragged down more than 100px
      if (deltaY > 100) {
        onClose();
      }

      // Reset drag state
      setIsDragging(false);
      setDragY(0);
      startYRef.current = 0;
      currentYRef.current = 0;
    };

    // tabs with data - exactly like PlaceOverview
    const tabs = {
      Overview: fetchedPlace ? (
        <Overview fetchedPlace={fetchedPlace} onTabChange={handleTabChange} isPublicCategory={Boolean(categoryStyles)} />
      ) : null,
      Media: fetchedPlace ? (
        <MediaGallery Media={fetchedPlace?.media_details?.imageDetails} />
      ) : null,
      Address: fetchedPlace?.Place_Details?.Geometry ? (
        <Address
          address={fetchedPlace?.Place_Details?.Place_Address}
          placeCoordinates={{
            lat: fetchedPlace.Place_Details.Geometry.lat,
            lng: fetchedPlace.Place_Details.Geometry.lng,
          }}
        />
      ) : null,
    };

    if (!isOpen) return null;

    if (loading)
      return (
        <div className={categoryStyles ? "flex bg-[var(--category-page)] items-center justify-center min-h-screen" : "flex bg-dashboard-bg items-center justify-center min-h-screen"}>
          <EarthLoader context="general" size="small" />
        </div>
      );

    return (
      <>
        <div
          data-category-google-place={categoryStyles ? true : undefined}
          className={`${categoryStyles ? 'public-place-detail bg-[var(--category-panel)] text-[var(--category-text)]' : 'dashboard-theme bg-[#2a2a2a]/90'} h-full overflow-y-auto overflow-x-hidden scrollbar-hide rounded-t-2xl shadow-dashboard-elevated flex flex-col transition-transform duration-200 ease-out`}
          style={{
            ...(categoryStyles ? { ...categoryStyles, '--dash-text': 'var(--category-text)', '--text-secondary': 'var(--category-muted)', '--dash-text-light': 'var(--category-muted)', '--dash-border': 'var(--category-control-border)', '--border-card': 'var(--category-control-border)', '--dash-accent': 'var(--category-accent)', '--dash-muted': 'var(--category-hover)' } as CSSProperties : {}),
            transform: `translateY(${dragY}px)`,
            opacity: isDragging ? Math.max(0.7, 1 - dragY / 300) : 1,
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Mobile Drag Bar - Only visible on mobile */}
          <div className="md:hidden flex justify-center pt-3 pb-2">
            <div className="w-12 h-1 bg-gray-400 rounded-full" />
          </div>

          {/* Header Section with Place Name and Close Button */}
          <div className="relative p-3 md:pt-4 pt-2 text-dashboard">
            {/* Close Button */}
            <div className="absolute -top-1 right-3 md:top-1 md:right-1 z-10">
              <div className="border border-dashboard hover:border-dashboard-light transition-colors rounded-full w-8 h-8 flex items-center justify-center bg-dashboard-muted/20 backdrop-blur-sm">
                <Button
                  variant="ghost"
                  size="xsmall"
                  onClickHandler={onClose}
                  startIcon={<CrossIcon stroke="var(--dash-text)" />}
                />
              </div>
            </div>

            {/* Place Name Only */}
            <div className="pr-12">
              <h3 className="md:text-base text-sm font-poppins">
                {fetchedPlace?.Place_Details?.Title || place.name || "Place"}
              </h3>
            </div>
          </div>

          {/* Image Section */}
          <div className="relative">
            <img
              src={
                fetchedPlace?.media_details?.imageDetails?.[0]?.url ??
                "https://placehold.co/400x400?text=No+Image"
              }
              alt="Place"
              className="h-60 w-full object-cover"
            />
          </div>

          {/* Rating, Category, and Timing Section */}
          <div className="p-3 text-dashboard">
            <div className="flex flex-row justify-between items-start gap-1">
              <div className="flex flex-col gap-1">
                {/* Rating */}
                {fetchedPlace?.Place_Details?.Rating && (
                  <div className="flex flex-row gap-2">
                    <span className="flex flex-row gap-1">
                      {[...Array(5)].map((_, i) => (
                        <StarIcon
                          key={i}
                          fillColor={`${fetchedPlace?.Place_Details?.Rating &&
                            i < Math.floor(fetchedPlace.Place_Details.Rating)
                            ? categoryStyles ? "var(--category-rating)" : "#FFEE58"
                            : "#BDBDBD"
                            }`}
                        />
                      ))}
                    </span>
                    <span className="text-xs md:text-sm">
                      {fetchedPlace?.Place_Details?.Rating_Count ?? 0}
                    </span>
                  </div>
                )}

                {/* Category */}
                <span className="text-xs md:text-sm">
                  {fetchedPlace?.recommendation_category?.Category_Name || "Place"}
                </span>
              </div>

              {/* Timings - Not available for Google Places, show placeholder */}
              <div className="flex flex-row gap-2 items-center">
                <ClockIcon size={4} />
                <span className="font-poppins text-sm">9:00 am - 11:30 pm</span>
              </div>
            </div>
          </div>

          <div className="md:flex md:justify-center md:items-center">
            <Tab
              tabs={tabs}
              type="public"
              activeTab={activeTab}
              onTabChange={handleTabChange}
            />
          </div>
        </div>
      </>
    );
  }
);

GooglePlaceModal.displayName = "GooglePlaceModal";

export default GooglePlaceModal;
