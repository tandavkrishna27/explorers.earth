/**
 * GuideHeader Component
 * Displays guide cover image, title, description, budget, edit button, and visibility toggle
 */

import React, { useState } from "react";
import {useGuideEditing} from '../../context/GuideEditingProvider';
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import EditIcon from "../../../../assets/icons/EditIcon";
import SwitchButton from "../../../../components/ui/SwitchButton";
import type { Guide } from "../../types";

interface GuideHeaderProps {
  guide: Guide;
  guideId: string;
  onVisibilityChange?: () => void;
}

const GuideHeader: React.FC<GuideHeaderProps> = ({ guide, guideId, onVisibilityChange }) => {
  const navigate = useNavigate();
  const [isPublished, setIsPublished] = useState<boolean>(guide.Visibility || false);

  const {setPublished} = useGuideEditing();
  const [isUpdating, setIsUpdating] = useState(false);

  // Optimistic, then reverted on failure. Unpublishing also unpins, which the server does
  // in its own transaction rather than this component doing it as a second write.
  const handleVisibilityToggle = async () => {
    const newVisibility = !isPublished;
    setIsPublished(newVisibility);
    setIsUpdating(true);
    try {
      await setPublished(newVisibility);
      toast.success(newVisibility ? "Guide published" : "Guide unpublished");
      onVisibilityChange?.();
    } catch (error: any) {
      setIsPublished(!newVisibility);
      toast.error(`Failed to update visibility: ${error?.message ?? "unknown error"}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Helper to check if guide is multi-city
  const isMultiCityGuide = () => {
    if (!guide.Place_Details) return false;

    try {
      let placeDetails: any = guide.Place_Details;
      if (typeof guide.Place_Details === "string") {
        placeDetails = JSON.parse(guide.Place_Details);
      }

      // Check if it's a multi-city format (has isMultiCity flag)
      return placeDetails?.isMultiCity === true &&
        ((placeDetails.ending || placeDetails.arrival || placeDetails.to) &&
          (placeDetails.starting || placeDetails.departure || placeDetails.from));
    } catch (error) {
      console.error("Error parsing Place_Details for multi-city check:", error);
      return false;
    }
  };

  // Helper to render description (handles both string and blocks format)
  const renderDescription = () => {
    if (!guide.Description) {
      return (
        <p className="text-sm md:text-base opacity-70 italic">
          No description provided
        </p>
      );
    }

    if (typeof guide.Description === "string") {
      return (
        <p className="text-sm md:text-base opacity-90 line-clamp-3">
          {guide.Description}
        </p>
      );
    }

    if (Array.isArray(guide.Description)) {
      return (
        <div className="text-sm md:text-base opacity-90 line-clamp-3">
          {(guide.Description as any[]).map((block: any, idx: number) => {
            if (block.type === "paragraph") {
              return (
                <span key={idx}>
                  {block.children?.map((child: any) => child.text).join(" ")}
                </span>
              );
            }
            return null;
          })}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className="relative flex flex-col justify-end w-full rounded-2xl overflow-hidden shadow-xl"
      style={{
        minHeight: "320px",
        backgroundImage: guide.Guide_Media?.[0]?.url
          ? `url('${guide.Guide_Media[0].url}')`
          : "linear-gradient(135deg, hsl(var(--dash-accent)) 0%, hsl(var(--dash-secondary)) 100%)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        height: "clamp(280px, 30vh, 400px)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-0"></div>

      {/* Visibility Toggle - Top Left */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-2">
        <SwitchButton
          isChecked={isPublished}
          onChange={handleVisibilityToggle}
          variant="green"
          disabled={isUpdating}
        />
        <span className="text-xs font-medium text-white">
          {isPublished ? "Published" : "Draft"}
        </span>
      </div>

      {/* Badges - Top Right (Multi-City above Guide Type) */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
        {/* Multi-City Badge - Above Guide Type */}
        {isMultiCityGuide() && (
          <span className="px-3 py-1.5 text-xs font-medium bg-white/20 backdrop-blur-sm rounded-full text-white">
            Multi-City
          </span>
        )}
        {/* Guide Type Badge */}
        {guide.Guide_Type && (
          <span className="px-3 py-1.5 text-xs font-medium bg-white/20 backdrop-blur-sm rounded-full text-white">
            {guide.Guide_Type}
          </span>
        )}
      </div>

      {/* Title, Description and Budget - Bottom Left */}
      <div className="relative z-10 p-6 sm:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 leading-tight">
          {guide.Title}
        </h1>

        {/* Description */}
        <div className="mb-3 sm:mb-4 max-w-3xl">{renderDescription()}</div>

        {/* Budget */}
        {guide.Estimated_Budget &&
          typeof guide.Estimated_Budget === 'object' &&
          ((guide.Estimated_Budget as any).currency ||
            (guide.Estimated_Budget as any).amount) && (
            <p className="text-sm md:text-base opacity-90 font-medium">
              Budget: {(guide.Estimated_Budget as any).currency}{" "}
              {(guide.Estimated_Budget as any).amount}
            </p>
          )}
      </div>

      {/* Edit Guide Button - Bottom Right */}
      <button
        onClick={() => navigate(`/guides/${guideId}/edit`)}
        className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-10 bg-dashboard-accent p-3 rounded-full shadow-lg hover:bg-dashboard-accent/90 hover:scale-110 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:ring-offset-2"
        title="Edit Guide"
        aria-label="Edit Guide"
      >
        <EditIcon color="white" />
      </button>
    </div>
  );
};

export default GuideHeader;

