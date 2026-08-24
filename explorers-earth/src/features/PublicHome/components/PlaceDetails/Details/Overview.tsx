import { FC, memo, useEffect, useState, useMemo } from "react";
import MediaPreviewGrid from "../../../../../components/ui/MediaPreviewGrid";
import MediaViewer from "../../../../../components/ui/MediaViewer";
import {
  useMediaViewer,
  convertToMediaItems,
} from "../../../../../hooks/useMediaViewer";
import Dailer from "../../../../../assets/icons/Dailer";
import DirectionBoard from "../../../../../assets/icons/DirectionBoard";
import BoldLinkIcon from "../../../../../assets/icons/BoldLinkIcon";
import YouTubeEmbed from "../../../../../components/YoutubeEmbed";
import { getCurrentLocation } from "../../../../../utils/getCurrentLocation";
import { coordinatesState } from "./Address";
import SafePublicRichText from "../../SafePublicRichText";
import { normalizePublicWebHref } from "../../../utils/publicProfileContent";

interface OverviewProps {
  fetchedPlace: {
    Place_Details: {
      Geometry?: {
        lat: number;
        lng: number;
      };
    };
    Contact_Number?: string;
    Places_Social_Link?: string;
    Users_Social_URL?: string;
    user_recommendation_note?: string;
    media_details?: {
      imageDetails?: Array<{
        url: string;
        alt?: string;
      }>;
    };
  };
  onTabChange?: (tabName: string) => void;
}

const Overview: FC<OverviewProps> = memo(({ fetchedPlace, onTabChange }) => {
  const [coordinates, setCoordinates] = useState<coordinatesState | undefined>(
    undefined
  );

  // MediaViewer state
  const { isOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();

  // Convert media items for MediaViewer
  const mediaItems = useMemo(() => {
    const items = fetchedPlace?.media_details?.imageDetails || [];
    return convertToMediaItems(
      items.map((item, index) => ({
        id: `media-${index}`,
        url: item.url,
        alt: item.alt || `Media ${index + 1}`,
        type: "image" as const,
      }))
    );
  }, [fetchedPlace?.media_details?.imageDetails]);
  const websiteHref = useMemo(
    () => normalizePublicWebHref(fetchedPlace.Places_Social_Link),
    [fetchedPlace.Places_Social_Link],
  );

  // Handle media click
  const handleMediaClick = (index: number) => {
    openViewer(index);
  };

  useEffect(() => {
    // Get current location and set coordinates
    const fetchLocation = async () => {
      const location = await getCurrentLocation();
      if (location) {
        setCoordinates({ lat: location.latitude, lng: location.longitude });
      }
    };

    fetchLocation();
  }, []);

  const handleDirections = () => {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${coordinates?.lat},${coordinates?.lng}&destination=${fetchedPlace.Place_Details.Geometry?.lat},${fetchedPlace.Place_Details.Geometry?.lng}&travelmode=driving`;
    window.open(url, "_blank");
  };

  const handlePhoneCall = () => {
    if (fetchedPlace.Contact_Number) {
      window.open(`tel:${fetchedPlace.Contact_Number}`, "_self");
    }
  };

  const handleWebsiteRedirect = () => {
    if (websiteHref) {
      window.open(websiteHref, "_blank", "noopener,noreferrer");
    }
  };

  const handleViewAllMedia = () => {
    if (onTabChange) {
      onTabChange("Media");
    }
  };

  return (
    <div className="px-4 mb-20 overflow-x-hidden">
      {/* Action Icons with Labels */}
      <div className="flex flex-row items-center justify-around py-4">
        {/* Directions Icon */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleDirections}
            className="w-12 h-12 rounded-full border border-dashboard flex items-center justify-center hover:bg-dashboard-muted transition-colors"
          >
            <DirectionBoard fill="var(--dash-text)" />
          </button>
          <span className="text-dashboard text-xs font-poppins">
            Directions
          </span>
        </div>

        {/* Phone Icon */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handlePhoneCall}
            disabled={!fetchedPlace.Contact_Number}
            className="w-12 h-12 rounded-full border border-dashboard flex items-center justify-center hover:bg-dashboard-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Dailer size="20" />
          </button>
          <span className="text-dashboard text-xs font-poppins">Call</span>
        </div>

        {/* Website Link Icon */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleWebsiteRedirect}
            disabled={!websiteHref}
            className="w-12 h-12 rounded-full border border-dashboard flex items-center justify-center hover:bg-dashboard-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <BoldLinkIcon color="var(--dash-text)" />
          </button>
          <span className="text-dashboard text-xs font-poppins">Website</span>
        </div>
      </div>

      {/* Conditional Rendering: If both sections are available, show them first, then photos */}
      {fetchedPlace?.Users_Social_URL &&
      fetchedPlace?.user_recommendation_note ? (
        <>
          {/* Social URL Section */}
          <div>
            <h1 className="font-poppins text-dashboard font-semibold text-sm mt-4 py-2 border-dashboard">
              Social Url
            </h1>
            <YouTubeEmbed url={fetchedPlace?.Users_Social_URL} />
          </div>

          {/* Recommendation Note Section */}
          <div>
            <h1 className="font-poppins text-dashboard font-semibold text-sm mt-4 py-2 border-dashboard">
              Why would you recommend?
            </h1>
            <SafePublicRichText
              className="text-dashboard text-sm leading-6 p-2"
              html={fetchedPlace?.user_recommendation_note}
            />
          </div>

          {/* Media Preview Gallery - After both sections */}
          <MediaPreviewGrid
            mediaItems={fetchedPlace?.media_details?.imageDetails || []}
            onViewAllMedia={handleViewAllMedia}
            onMediaClick={handleMediaClick}
          />
        </>
      ) : (
        <>
          {/* Media Preview Gallery - At the top when sections are missing */}
          <MediaPreviewGrid
            mediaItems={fetchedPlace?.media_details?.imageDetails || []}
            onViewAllMedia={handleViewAllMedia}
            onMediaClick={handleMediaClick}
          />

          {/* Individual sections if they exist (but media are already shown above) */}
          {fetchedPlace?.Users_Social_URL && (
            <div>
              <h1 className="font-poppins text-dashboard font-semibold text-sm mt-4 py-2 border-dashboard">
                Social Url
              </h1>
              <YouTubeEmbed url={fetchedPlace?.Users_Social_URL} />
            </div>
          )}

          {fetchedPlace?.user_recommendation_note && (
            <div>
              <h1 className="font-poppins text-dashboard font-semibold text-sm mt-4 py-2 border-dashboard">
                Why would you recommend?
              </h1>
              <SafePublicRichText
                className="text-dashboard text-sm leading-6 p-2"
                html={fetchedPlace?.user_recommendation_note}
              />
            </div>
          )}
        </>
      )}

      {/* MediaViewer for place media */}
      <MediaViewer
        mediaItems={mediaItems}
        initialIndex={currentIndex}
        isOpen={isOpen}
        onClose={closeViewer}
      />
    </div>
  );
});

export default Overview;
