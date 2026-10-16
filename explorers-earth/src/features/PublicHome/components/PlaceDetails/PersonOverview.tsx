import { FC, memo, useState, useRef, useMemo, useEffect } from "react";
import CrossIcon from "../../../../assets/icons/CrossIcon";
import Button from "../../../../components/ui/Button";
import Tab from "../../../../components/ui/Tab";
import MediaGallery from "./Details/MediaGallery";
import { EarthLoader } from "../../../../components/EarthLoader";
import SEO from "../../../../components/SEO";
import { useParams } from "react-router-dom";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import Dailer from "../../../../assets/icons/Dailer";
import BoldLinkIcon from "../../../../assets/icons/BoldLinkIcon";
import MediaPreviewGrid from "../../../../components/ui/MediaPreviewGrid";
import MediaViewer from "../../../../components/ui/MediaViewer";
import {
  useMediaViewer,
  convertToMediaItems,
} from "../../../../hooks/useMediaViewer";
import YouTubeEmbed from "../../../../components/YoutubeEmbed";

interface PersonOverviewProps {
  personId: string | null;
  /**
   * The person, supplied by the caller.
   *
   * Ticket 5.1/5.3: the caller has already found this person in the list it is rendering -
   * that is how it knows the row is a person at all - so fetching it again here asked the
   * server for something the caller was holding. PlaceOverview already worked this way.
   */
  person?: Record<string, unknown>;
  onClose: () => void;
  mobile?: string;
  personLink?: string;
  isPublicProfile?: boolean;
}

const PersonOverview: FC<PersonOverviewProps> = memo(({ personId, onClose, isPublicProfile = false, person }) => {
  const [activeTab, setActiveTab] = useState("Overview");

  // Swipe-to-close functionality
  const [isDragging, setIsDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);

  const loading = false;
  const fetchedPerson: any = person;

  // Prevent background scrolling when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const handleTabChange = (tabName: string) => {
    setActiveTab(tabName);
  };

  // Helper function to get person image with avatar fallback
  const getPersonAvatarUrl = (): string => {
    const imageUrl = fetchedPerson?.media_details?.imageDetails?.[0]?.url;
    if (imageUrl) return imageUrl;

    // Return data URL for inline SVG avatar
    const svgString = `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="400" fill="#1a1a1a"/><circle cx="200" cy="160" r="70" fill="#2a2a2a"/><circle cx="200" cy="160" r="50" fill="#3a3a3a"/><ellipse cx="200" cy="320" rx="100" ry="80" fill="#3a3a3a"/><circle cx="200" cy="200" r="120" fill="none" stroke="#2a2a2a" stroke-width="2" opacity="0.3"/></svg>`;
    return `data:image/svg+xml;base64,${btoa(svgString)}`;
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

  // Parse Person_Details JSON
  const personDetails = fetchedPerson?.Person_Details ?
    (typeof fetchedPerson.Person_Details === 'string'
      ? JSON.parse(fetchedPerson.Person_Details)
      : fetchedPerson.Person_Details)
    : {};

  // MediaViewer state
  const { isOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();

  // Convert media items for MediaViewer
  const mediaItems = useMemo(() => {
    const items = fetchedPerson?.media_details?.imageDetails || [];
    return convertToMediaItems(
      items.map((item: any, index: number) => ({
        id: `media-${index}`,
        url: item.url,
        alt: item.alt || `Media ${index + 1}`,
        type: "image" as const,
      }))
    );
  }, [fetchedPerson?.media_details?.imageDetails]);

  // Handle media click
  const handleMediaClick = (index: number) => {
    openViewer(index);
  };

  const handlePhoneCall = () => {
    if (fetchedPerson?.Contact_Number) {
      window.open(`tel:${fetchedPerson.Contact_Number}`, "_self");
    }
  };

  const handleInstagramRedirect = () => {
    if (personDetails?.instagram) {
      window.open(personDetails.instagram, "_blank");
    }
  };

  const handleWebsiteRedirect = () => {
    if (fetchedPerson?.Users_Social_URL) {
      window.open(fetchedPerson.Users_Social_URL, "_blank");
    }
  };

  const handleViewAllMedia = () => {
    setActiveTab("Media");
  };

  // Overview content for person
  const OverviewContent = () => (
    <div className="px-4 mb-20 overflow-x-hidden">
      {/* Action Icons with Labels */}
      <div className="flex flex-row items-center justify-around py-4">
        {/* Phone Icon */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handlePhoneCall}
            disabled={!fetchedPerson?.Contact_Number}
            className="w-12 h-12 rounded-full border border-dashboard flex items-center justify-center hover:bg-dashboard-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Dailer size="20" />
          </button>
          <span className="text-dashboard text-xs font-poppins">Call</span>
        </div>

        {/* Instagram/LinkedIn Icon */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleInstagramRedirect}
            disabled={!personDetails?.instagram}
            className="w-12 h-12 rounded-full border border-dashboard flex items-center justify-center hover:bg-dashboard-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <BoldLinkIcon color="var(--dash-text)" />
          </button>
          <span className="text-dashboard text-xs font-poppins">Social</span>
        </div>

        {/* Website/Portfolio Icon */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleWebsiteRedirect}
            disabled={!fetchedPerson?.Users_Social_URL}
            className="w-12 h-12 rounded-full border border-dashboard flex items-center justify-center hover:bg-dashboard-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <BoldLinkIcon color="var(--dash-text)" />
          </button>
          <span className="text-dashboard text-xs font-poppins">Website</span>
        </div>
      </div>

      {/* Conditional Rendering: If both Users_Social_URL and recommendation note exist */}
      {fetchedPerson?.Users_Social_URL && fetchedPerson?.user_recommendation_note ? (
        <>
          {/* Social URL Section */}
          <div>
            <h1 className="font-poppins text-dashboard font-semibold text-sm mt-4 py-2 border-dashboard">
              Website / Portfolio
            </h1>
            <YouTubeEmbed url={fetchedPerson.Users_Social_URL} />
          </div>

          {/* Recommendation Note Section */}
          <div>
            <h1 className="font-poppins text-dashboard font-semibold text-sm mt-4 py-2 border-dashboard">
              Why would you recommend?
            </h1>
            <div
              className="text-dashboard text-sm leading-6 p-2"
              dangerouslySetInnerHTML={{
                __html: fetchedPerson.user_recommendation_note,
              }}
            />
          </div>

          {/* Address Section */}
          {personDetails?.address && (
            <div>
              <h1 className="font-poppins text-dashboard font-semibold text-sm mt-4 py-2 border-dashboard">
                Address
              </h1>
              <p className="text-dashboard text-sm leading-6 p-2">{personDetails.address}</p>
            </div>
          )}

          {/* Media Preview Gallery - After sections */}
          <MediaPreviewGrid
            mediaItems={fetchedPerson?.media_details?.imageDetails || []}
            onViewAllMedia={handleViewAllMedia}
            onMediaClick={handleMediaClick}
          />
        </>
      ) : (
        <>
          {/* Media Preview Gallery - At the top when sections are missing */}
          <MediaPreviewGrid
            mediaItems={fetchedPerson?.media_details?.imageDetails || []}
            onViewAllMedia={handleViewAllMedia}
            onMediaClick={handleMediaClick}
          />

          {/* Individual sections if they exist */}
          {fetchedPerson?.Users_Social_URL && (
            <div>
              <h1 className="font-poppins text-dashboard font-semibold text-sm mt-4 py-2 border-dashboard">
                Website / Portfolio
              </h1>
              <YouTubeEmbed url={fetchedPerson.Users_Social_URL} />
            </div>
          )}

          {fetchedPerson?.user_recommendation_note && (
            <div>
              <h1 className="font-poppins text-dashboard font-semibold text-sm mt-4 py-2 border-dashboard">
                Why would you recommend?
              </h1>
              <div
                className="text-dashboard text-sm leading-6 p-2"
                dangerouslySetInnerHTML={{
                  __html: fetchedPerson.user_recommendation_note,
                }}
              />
            </div>
          )}

          {/* Address Section */}
          {personDetails?.address && (
            <div>
              <h1 className="font-poppins text-dashboard font-semibold text-sm mt-4 py-2 border-dashboard">
                Address
              </h1>
              <p className="text-dashboard text-sm leading-6 p-2">{personDetails.address}</p>
            </div>
          )}
        </>
      )}

      {/* MediaViewer for person media */}
      <MediaViewer
        mediaItems={mediaItems}
        initialIndex={currentIndex}
        isOpen={isOpen}
        onClose={closeViewer}
      />
    </div>
  );

  // tabs with data
  const tabs = {
    Overview: <OverviewContent />,
    Media: <MediaGallery Media={fetchedPerson?.media_details?.imageDetails} />,
  };

  // Get username from URL for SEO
  const { username } = useParams();

  // Dynamic SEO data
  const personName = fetchedPerson?.Contact_Name || "Person";
  const category = fetchedPerson?.recommendation_category?.Category_Name || "";
  const recommendationNote = fetchedPerson?.user_recommendation_note || "";

  const pageTitle = `${personName} - Recommended by ${username} | explorers`;
  const metaDescription = recommendationNote
    ? `${personName} recommended by ${username}. ${recommendationNote.substring(0, 120)}...`
    : `Discover ${personName}, recommended by ${username}. ${category ? `Expert in ${category.toLowerCase()} with ` : ''}authentic local insights.`;

  if (loading)
    return (
      <div className="flex bg-dashboard-bg items-center justify-center min-h-screen">
        <EarthLoader context="general" size="small" />
      </div>
    );

  return (
    <>
      {fetchedPerson && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={[
            personName,
            category,
            'local recommendation',
            'person recommendation',
            'expert',
            username || 'local guide'
          ].filter(Boolean)}
          canonical={fetchedPerson?.Users_Social_URL || createCanonicalUrl(`/${username}/person/${personId}`)}
          image={fetchedPerson?.Media?.[0]?.url || fetchedPerson?.media_details?.imageDetails?.[0]?.url}
          url={fetchedPerson?.Users_Social_URL || createCanonicalUrl(`/${username}/person/${personId}`)}
          type="profile"
          author={username || "explorers User"}
          siteName="explorers"
        />
      )}

      <div
        className={`dashboard-theme ${isPublicProfile ? 'bg-[#2a2a2a]/90' : 'bg-dashboard-sidebar'} h-full overflow-y-auto overflow-x-hidden scrollbar-hide rounded-t-2xl shadow-dashboard-elevated flex flex-col transition-transform duration-200 ease-out`}
        style={{
          transform: `translateY(${dragY}px)`,
          opacity: isDragging ? Math.max(0.7, 1 - dragY / 300) : 1,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Mobile Drag Bar - Only visible on mobile */}
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-gray-400 rounded-full" />
        </div>

        {/* Header Section with Person Name and Close Button */}
        <div className="relative p-3 md:pt-4 pt-2 text-dashboard">
          {/* Close Button */}
          <div className="absolute top-1 right-1 z-10">
            <div className="border border-dashboard hover:border-dashboard-light transition-colors rounded-full w-8 h-8 flex items-center justify-center bg-dashboard-muted/20 backdrop-blur-sm">
              <Button
                variant="ghost"
                size="xsmall"
                onClickHandler={onClose}
                startIcon={<CrossIcon stroke="var(--dash-text)" />}
              />
            </div>
          </div>

          {/* Person Name */}
          <div className="pr-12">
            <h3 className="md:text-base text-sm font-poppins">
              {fetchedPerson?.Contact_Name || "Person Details"}
            </h3>
          </div>
        </div>

        {/* Image Section */}
        <div className="relative">
          <img
            src={getPersonAvatarUrl()}
            alt={fetchedPerson?.Contact_Name || "Person"}
            className="h-60 w-full object-cover"
          />
        </div>

        {/* Category Section */}
        <div className="p-3 text-dashboard">
          <div className="flex flex-row justify-between items-start gap-1">
            <div className="flex flex-col gap-1">
              {/* Category */}
              <span className="text-xs md:text-sm">
                {fetchedPerson?.recommendation_category?.Category_Name}
              </span>
            </div>
          </div>
        </div>

        <div className="md:flex md:justify-center md:items-center">
          <Tab
            tabs={tabs}
            type={"public"}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </div>
      </div>
    </>
  );
});

export default PersonOverview;
