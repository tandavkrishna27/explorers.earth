import { usePublicCategoryThemeStyles } from "../PublicCategoryThemeContext";
import { FC, memo, useState, useRef, useEffect, type CSSProperties } from "react";
import CrossIcon from "../../../../assets/icons/CrossIcon";
import Button from "../../../../components/ui/Button";
import StarIcon from "../../../../assets/icons/StarIcon";
import ClockIcon from "../../../../assets/icons/ClockIcon";
import GoogleIcon from "../../../../assets/icons/GoogleIcon";
import Tab from "../../../../components/ui/Tab";
import Overview from "./Details/Overview";
import MediaGallery from "./Details/MediaGallery";
import Address from "./Details/Address";
import { EarthLoader } from "../../../../components/EarthLoader";
import SEO from "../../../../components/SEO";
import { useParams } from "react-router-dom";
import { createPlaceGEOData } from "../../../../utils/geoHelpers";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { IMAGE_CONFIG } from "../../../../config";
import { resolvePublicPlaceImage } from "../publicPlaceMedia";

interface PlaceOverviewProps {
  placeId: string | null;
  onClose: () => void;
  mobile?: string;
  placeLink?: string;
  isPublicProfile?: boolean;
  scrollLockOwner?: "self" | "wrapper";
  publicPlace?: Record<string, unknown>;
  parentListThumbnail?: unknown;
}

const placePhotoCandidates = (place: any): unknown[] => [
  ...(Array.isArray(place?.media_details?.imageDetails)
    ? place.media_details.imageDetails
    : []),
  ...(Array.isArray(place?.Place_Details?.Photos)
    ? place.Place_Details.Photos
    : []),
];

const PlaceOverview: FC<PlaceOverviewProps> = memo(
  ({ placeId, onClose, isPublicProfile = false, scrollLockOwner = "self", publicPlace, parentListThumbnail }) => {
    const categoryStyles = usePublicCategoryThemeStyles();
    const [activeTab, setActiveTab] = useState("Overview");

    // Swipe-to-close functionality
    const [isDragging, setIsDragging] = useState(false);
    const [dragY, setDragY] = useState(0);
    const startYRef = useRef(0);
    const currentYRef = useRef(0);

    // Ticket 5.1/5.3. No fetch. The public caller already passed the place in - the
    // query was skipped whenever it did - and the owner dashboard holds it in its own
    // canonical read, so a second fetch here was asking the server for something the
    // caller was already holding.
    const loading = false;

    const fetchedPlace: any = publicPlace;
    const isPersonType = fetchedPlace?.Recommendation_Type === "person";
    const googleRating = fetchedPlace?.google_rating ?? fetchedPlace?.Place_Details?.Rating;
    const googleRatingText = googleRating ? (googleRating * 2).toFixed(1) : null;
    const userRating = fetchedPlace?.user_rating;

    // Prevent background scrolling when modal is open
    useEffect(() => {
      if (scrollLockOwner === "wrapper") return;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "unset";
      };
    }, [scrollLockOwner]);

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

    // tabs with data
    const tabs = {
      Overview: (
        <Overview fetchedPlace={fetchedPlace} onTabChange={handleTabChange} isPublicCategory={isPublicProfile && Boolean(categoryStyles)} />
      ),
      Media: <MediaGallery Media={fetchedPlace?.media_details?.imageDetails} />,
      Address: !isPersonType ? (
        <Address
          address={fetchedPlace?.Place_Details?.Place_Address}
          placeCoordinates={{
            lat: fetchedPlace?.Place_Details?.Geometry?.lat,
            lng: fetchedPlace?.Place_Details?.Geometry?.lng,
          }}
        />
      ) : null,
    };

    // Get username from URL for SEO
    const { username } = useParams();

    // Generate GEO data for individual place pages
    const placeData: any = publicPlace;
    const placeName = isPersonType
      ? placeData?.Contact_Name || "Person"
      : (placeData?.Place_Details?.Place_Name || "Place");
    const placeAddress = placeData?.Place_Details?.Place_Address || "";
    const locationName = placeAddress
      ? placeAddress.split(",").slice(-2, -1)[0]?.trim() || "Location"
      : "Location";
    const category = placeData?.recommendation_category?.Category_Name || "";
    const recommendationNote = placeData?.user_recommendation_note || "";

    const geoData = placeData && !isPersonType
      ? createPlaceGEOData({
        placeName: placeName,
        locationName: locationName,
        category: category,
        address: placeAddress,
        recommenderName: username || "explorers User",
        description: recommendationNote,
        coordinates: placeData?.Place_Details?.Geometry
          ? {
            lat: placeData.Place_Details.Geometry.lat,
            lng: placeData.Place_Details.Geometry.lng,
          }
          : undefined,
      })
      : null;

    // Dynamic SEO data
    const pageTitle = isPersonType
      ? `${placeName} - Recommended by ${username} | explorers`
      : `${placeName} in ${locationName} - Recommended by ${username} | explorers`;
    const metaDescription = recommendationNote
      ? `${placeName} recommended by ${username}. ${recommendationNote.substring(
        0,
        120
      )}...`
      : `Discover ${placeName} in ${locationName}, recommended by ${username}. ${category ? `Great ${category.toLowerCase()} spot with ` : ""
      }authentic local insights.`;

    if (loading && !publicPlace)
      return (
        <div className="bg-dashboard-bg min-h-screen">
          <EarthLoader context="recommendations" />
        </div>
      );

    return (
      <>
        {placeData && geoData && (
          <SEO
            title={pageTitle}
            description={metaDescription}
            keywords={[
              placeName,
              category,
              locationName,
              `${placeName} ${locationName}`,
              `${category} ${locationName}`,
              "local recommendation",
              "place details",
              "authentic experience",
              username || "local guide",
            ].filter(Boolean)}
            canonical={
              placeData?.Users_Social_URL ||
              createCanonicalUrl(`/${username}/place/${placeId}`)
            }
            image={
              isPersonType
                ? placeData?.Media?.[0]?.url || placeData?.media_details?.imageDetails?.[0]?.url
                : resolvePublicPlaceImage({
                    itemMedia: placeData?.Media,
                    itemThumbnail: placeData?.media_details?.thumbnail,
                    itemPhotos: placePhotoCandidates(placeData),
                    parentListThumbnail,
                  })
            }
            url={
              placeData?.Users_Social_URL ||
              createCanonicalUrl(`/${username}/place/${placeId}`)
            }
            type="article"
            author={username || "explorers User"}
            siteName="explorers"
            enableGEO={true}
            geoData={geoData}
          />
        )}

        <div
          data-public-place-detail={isPublicProfile ? true : undefined}
          className={`${isPublicProfile
            ? "public-place-detail border"
            : "dashboard-theme bg-dashboard-sidebar"
            } h-full overflow-y-auto overflow-x-hidden scrollbar-hide rounded-t-2xl shadow-dashboard-elevated flex flex-col transition-transform duration-200 ease-out`}
          style={{
            ...(isPublicProfile && categoryStyles ? {
              ...categoryStyles,
              background: "var(--category-panel)",
              color: "var(--category-text)",
              "--dash-text": "var(--category-text)",
              "--text-secondary": "var(--category-muted)",
              "--dash-text-light": "var(--category-muted)",
              "--dash-border": "var(--category-control-border)",
              "--border-card": "var(--category-control-border)",
              "--dash-accent": "var(--category-accent)",
              "--dash-muted": "var(--category-hover)",
            } as CSSProperties : isPublicProfile ? {
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              "--dash-text": "var(--text-primary)",
              "--dash-text-light": "var(--text-secondary)",
              "--dash-border": "var(--border-card)",
              "--dash-accent": "var(--accent-color)",
            } as CSSProperties : {}),
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
              <div className={`border border-dashboard hover:border-dashboard-light transition-colors rounded-full flex items-center justify-center bg-dashboard-muted/20 backdrop-blur-sm ${isPublicProfile ? "w-11 h-11" : "w-8 h-8"}`}>
                <Button
                  variant="ghost"
                  size="xsmall"
                  onClickHandler={onClose}
                  aria-label={isPublicProfile ? "Close place details" : undefined}
                  className={isPublicProfile ? "min-h-11 min-w-11 focus-visible:!transform-none" : undefined}
                  style={isPublicProfile ? { minHeight: "44px", minWidth: "44px" } : undefined}
                  startIcon={<CrossIcon stroke="var(--dash-text)" />}
                />
              </div>
            </div>

            {/* Place Name Only */}
            <div className="pr-12">
              <h3 className="md:text-base text-sm font-poppins">
                {isPersonType
                  ? fetchedPlace?.Contact_Name
                  : fetchedPlace?.Place_Details?.Title}
              </h3>
            </div>
          </div>

          {/* Image Section */}
          <div className="relative">
            <img
              src={
                isPersonType
                  ? (fetchedPlace?.media_details?.imageDetails?.[0]?.url ?? IMAGE_CONFIG.defaultImages.place)
                  : resolvePublicPlaceImage({
                      itemMedia: fetchedPlace?.Media,
                      itemThumbnail: fetchedPlace?.media_details?.thumbnail,
                      itemPhotos: placePhotoCandidates(fetchedPlace),
                      parentListThumbnail,
                    })
              }
              alt="Place"
              className="h-60 w-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== IMAGE_CONFIG.defaultImages.place) {
                  target.src = IMAGE_CONFIG.defaultImages.place;
                }
              }}
            />
            {/* Google Rating Badge overlayed on bottom-left of image */}
            {!isPersonType && googleRatingText && (
              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 z-10 shadow-lg">
                <GoogleIcon size="4" />
                <span className="text-sm font-bold text-white font-poppins">
                  {googleRatingText}/10
                </span>
                <span className="text-[10px] text-white/60 font-poppins font-medium">
                  ({fetchedPlace?.Place_Details?.Rating_Count ?? 0} reviews)
                </span>
              </div>
            )}
          </div>

          {/* Rating, Category, and Timing Section */}
          <div className="p-3 text-dashboard">
            {/* Top row: User rating (left) and Timings (right) */}
            <div className="flex flex-row justify-between items-center gap-4 flex-wrap mb-1.5">
              {!isPersonType && userRating ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span style={isPublicProfile && categoryStyles ? { color: "var(--category-rating)" } : undefined} className="text-xs font-semibold text-yellow-500 uppercase tracking-wider">Creator's Rating:</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                      <StarIcon
                        key={star}
                        size="size-3.5"
                        fillColor={userRating >= star ? (isPublicProfile && categoryStyles ? "var(--category-rating)" : "#FFEE58") : "transparent"}
                      />
                    ))}
                  </div>
                  <span style={isPublicProfile && categoryStyles ? { color: "var(--category-rating)" } : undefined} className="text-xs font-semibold text-yellow-500 font-poppins">{userRating}/10</span>
                </div>
              ) : (
                <div />
              )}

              {/* Timings */}
              <div className="flex flex-row gap-2 items-center text-dashboard-light">
                <ClockIcon size={4} />
                <span className="font-poppins text-xs md:text-sm">9:00 am - 11:30 pm</span>
              </div>
            </div>

            {/* Bottom: Category */}
            <div className="text-xs md:text-sm text-dashboard-light font-medium mt-1">
              {fetchedPlace?.recommendation_category?.Category_Name}
            </div>
          </div>

          <div className="md:flex md:justify-center md:items-center">
            <Tab
              tabs={tabs}
              type={isPublicProfile ? "public-profile" : "public"}
              activeTab={activeTab}
              onTabChange={handleTabChange}
            />
          </div>
        </div>
      </>
    );
  }
);

export default PlaceOverview;
