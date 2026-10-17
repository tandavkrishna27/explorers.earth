/**
 * ItineraryView Component
 * Container for displaying guide sections in timeline or list view
 */

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import Button from "../../../../components/ui/Button";
import {
  VerticalTimeline,
  VerticalTimelineElement,
} from "react-vertical-timeline-component";
import "react-vertical-timeline-component/style.min.css";
import VerticalKebab from "../../../../assets/icons/VerticalKebab";
import EditIcon from "../../../../assets/icons/EditIcon";
import DeleteIcon from "../../../../assets/icons/DeleteIcon";
import ClockIcon from "../../../../assets/icons/ClockIcon";
import TransportationIcon from "../../../../assets/icons/TransportationIcon";
import StayIcon from "../../../../assets/icons/StayIcon";
import Location from "../../../../assets/icons/Location";
import BudgetIcon from "../../../../assets/icons/BudgetIcon";
import TipsIcon from "../../../../assets/icons/TipsIcon";
import { getAvailableTabs } from "../../utils/guideHelpers";
import { parseTimeline } from "../../utils/guideDataParser";
import MultiCityJourneyDisplay from "./MultiCityJourneyDisplay";
import type { Guide } from "../../types";

interface ItineraryViewProps {
  sections: any[];
  guide?: Guide;
  viewMode: "timeline" | "list";
  onViewModeChange: (mode: "timeline" | "list") => void;
  onAddSection: () => void;
  onSectionSelect: (section: any) => void;
  onSectionEdit: (section: any) => void;
  onSectionDelete: (sectionId: string, sectionTitle: string) => void;
  openMenuId: string | null;
  deletingSection: string | null;
  kebabRefs: React.MutableRefObject<{ [key: string]: HTMLDivElement | null }>;
  onMenuToggle: (sectionId: string) => void;
  onGuideUpdate?: () => void;
  onPlaceClick?: (place: any) => void;
}

const ItineraryView: React.FC<ItineraryViewProps> = ({
  sections,
  guide,
  viewMode,
  onViewModeChange,
  onAddSection,
  onSectionSelect,
  onSectionEdit,
  onSectionDelete,
  openMenuId,
  deletingSection,
  kebabRefs,
  onMenuToggle,
  onGuideUpdate,
  onPlaceClick,
}) => {
  const sortedSections = [...sections].sort(
    (a: any, b: any) => (a.Sequence || 0) - (b.Sequence || 0)
  );

  // Helper function to remove redundant "Day X:" prefix from title
  const cleanTitle = (title: string, dayNumber: number): string => {
    if (!title) return title;
    // Remove patterns like "Day X: ", "Day X ", or "Day X" at the start
    const patterns = [
      new RegExp(`^Day ${dayNumber}:\\s*`, 'i'),
      new RegExp(`^Day ${dayNumber}\\s+`, 'i'),
      new RegExp(`^Day ${dayNumber}$`, 'i'),
    ];
    let cleaned = title;
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '').trim();
    }
    return cleaned;
  };

  // Helper function to get S3 image from guide data by place_id
  const getS3ImageForPlace = useMemo(() => {
    const imageMap: Record<string, string | null> = {};

    // Iterate through all sections to find activity photos
    sections.forEach((section) => {
      if (section.Recommendation_Activity?.activities) {
        section.Recommendation_Activity.activities.forEach((activity: any) => {
          if (activity.place_id && activity.photos && activity.photos.length > 0) {
            // Use first photo from S3
            const firstPhoto = activity.photos[0];
            if (firstPhoto.url) {
              imageMap[activity.place_id] = firstPhoto.url;
            }
          }
        });
      }
    });

    return imageMap;
  }, [sections]);

  // Get image URL for a place - prioritize S3 images from guide data
  const getPlaceImage = (place: any): string => {
    if (!place?.place_id) return "https://placehold.co/400x400";

    // First check S3 images from guide data
    const s3Image = getS3ImageForPlace[place.place_id];
    if (s3Image) {
      return s3Image;
    }

    // Fallback to placeholder
    return "https://placehold.co/400x400";
  };

  // Helper to get location name from section Map_Details
  const getSectionLocation = (section: any) => {
    if (!section.Map_Details || !guide?.Place_Details) return null;

    try {
      const mapDetails =
        typeof section.Map_Details === "string"
          ? JSON.parse(section.Map_Details)
          : section.Map_Details;

      if (!mapDetails.location) return null;

      // Parse guide Place_Details
      let placeDetails: any = guide.Place_Details;
      if (typeof guide.Place_Details === "string") {
        placeDetails = JSON.parse(guide.Place_Details);
      }

      if (!placeDetails?.isMultiCity) return null;

      const locationValue = mapDetails.location;

      // Check for ending
      if (locationValue === "ending" || locationValue === "arrival") {
        const ending = placeDetails.ending || placeDetails.arrival || placeDetails.to;
        return ending?.Place_Name || ending?.Place_Address || "Ending Point";
      }

      // Check for starting
      if (locationValue === "starting" || locationValue === "departure") {
        const starting = placeDetails.starting || placeDetails.departure || placeDetails.from;
        return starting?.Place_Name || starting?.Place_Address || "Starting Point";
      }

      // Check for intermediate city by ID
      if (locationValue.startsWith("intermediate-")) {
        const intermediateCities = placeDetails.intermediateCities || [];
        const cityId = locationValue.replace("intermediate-", "");
        const city = intermediateCities.find(
          (c: any) => c.id === cityId || intermediateCities.indexOf(c) === parseInt(cityId)
        );
        if (city) {
          return city.Place_Name || city.Place_Address || "City";
        }
      }

      // Check for intermediate city by name (for AI-generated sections)
      const intermediateCities = placeDetails.intermediateCities || [];
      const cityByName = intermediateCities.find(
        (c: any) => c.Place_Name === locationValue || c.Place_Address === locationValue
      );
      if (cityByName) {
        return cityByName.Place_Name || cityByName.Place_Address;
      }

      return null;
    } catch (error) {
      console.error("Error parsing location:", error);
      return null;
    }
  };

  return (
    <div className="bg-dashboard-sidebar rounded-lg shadow-dashboard-elevated p-2 border border-dashboard-muted">
      {/* Multi-City Journey Display */}
      {guide && <MultiCityJourneyDisplay guide={guide} onUpdate={onGuideUpdate} />}

      <div className="mb-6">
        <h2 className="text-dashboard text-xl font-poppins font-bold mb-4">
          Your Itinerary
        </h2>

        <div className="flex items-center justify-between w-full">
          {/* View Toggle - Left side */}
          <div className="flex items-center gap-1 bg-dashboard-bg rounded-lg p-1 border border-dashboard-muted">
            <button
              onClick={() => onViewModeChange("timeline")}
              className={`px-3 py-1.5 rounded-md text-xs font-poppins font-medium transition-all duration-200 ${viewMode === "timeline"
                ? "bg-dashboard-accent text-white shadow-sm"
                : "text-dashboard-light hover:text-dashboard"
                }`}
            >
              <div className="flex items-center gap-1.5">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                <span className="hidden sm:inline">Timeline</span>
              </div>
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              className={`px-3 py-1.5 rounded-md text-xs font-poppins font-medium transition-all duration-200 ${viewMode === "list"
                ? "bg-dashboard-accent text-white shadow-sm"
                : "text-dashboard-light hover:text-dashboard"
                }`}
            >
              <div className="flex items-center gap-1.5">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
                <span className="hidden sm:inline">List</span>
              </div>
            </button>
          </div>

          {/* Action Buttons - Right side */}
          <div className="flex items-center gap-2">
            <Button
              size="small"
              variant="primary"
              onClickHandler={onAddSection}
              btnText="+ Add Day/Stop"
            />
          </div>
        </div>
      </div>

      {/* Sections Display */}
      {sections.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 opacity-20 text-dashboard-light">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-dashboard-light font-poppins">
            Your itinerary is empty
          </p>
          <p className="text-dashboard-light text-sm font-poppins mt-2">
            Click &quot;+ Add Day/Stop&quot; above to start building your guide
          </p>
        </div>
      ) : viewMode === "timeline" ? (
        /* Timeline View */
        <VerticalTimeline lineColor="var(--dash-accent)">
          {sortedSections.map((section: any) => {
            const availableTabs = getAvailableTabs(section);

            return (
              <VerticalTimelineElement
                key={section.documentId}
                className="vertical-timeline-element--work cursor-pointer"
                contentStyle={{
                  background: "rgba(30, 33, 42, 0.8)",
                  color: "var(--dash-text)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "12px",
                  boxShadow:
                    "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
                  backdropFilter: "blur(10px)",
                }}
                contentArrowStyle={{
                  borderRight: "7px solid rgba(255, 255, 255, 0.1)",
                }}
                iconStyle={{
                  background:
                    "linear-gradient(to bottom right, rgb(59 130 246), rgb(79 70 229))",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  // boxShadow handled by CSS for responsive adjustments
                }}
                icon={
                  <span className="text-lg font-bold font-poppins">
                    {section.Sequence}
                  </span>
                }
              >
                <div
                  className="relative hover:bg-opacity-90 transition-all duration-200"
                  onClick={() => onSectionSelect(section)}
                >
                  {/* Kebab Menu Container */}
                  <div
                    ref={(el) =>
                      (kebabRefs.current[`timeline-${section.documentId}`] = el)
                    }
                    className="absolute z-50 -right-3 -top-3"
                  >
                    {/* Kebab Button */}
                    <button
                      className="p-1 hover:bg-dashboard-muted/50 rounded transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMenuToggle(section.documentId);
                      }}
                    >
                      <VerticalKebab size={"5"} />
                    </button>

                    {/* Kebab Menu Dropdown */}
                    {openMenuId === section.documentId && (
                      <div
                        className="absolute right-0 top-full mt-1 bg-dashboard-sidebar shadow-dashboard-elevated rounded-md p-1 border border-dashboard z-50 min-w-[120px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="flex items-center gap-2 w-full text-left text-sm text-dashboard hover:bg-dashboard-muted rounded px-3 py-1.5 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSectionEdit(section);
                            onMenuToggle(section.documentId);
                          }}
                          disabled={deletingSection === section.documentId}
                        >
                          <EditIcon />
                          <span>Edit</span>
                        </button>
                        <button
                          className="flex items-center gap-2 w-full text-left text-sm text-red-400 hover:bg-dashboard-muted rounded px-3 py-1.5 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSectionDelete(section.documentId, section.Title);
                            onMenuToggle(section.documentId);
                          }}
                          disabled={deletingSection === section.documentId}
                        >
                          <DeleteIcon stroke="currentColor" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Content with spacing */}
                  <div className="space-y-3">
                    {/* Title */}
                    <div className="pr-10">
                      <h3 className="text-dashboard text-xl font-poppins font-bold">
                        {section.Title}
                      </h3>
                    </div>

                    {/* Location Badge - Separate Line */}
                    {getSectionLocation(section) && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/20 border border-blue-500/30 rounded-md">
                        <svg
                          className="w-3.5 h-3.5 text-blue-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span className="text-xs font-poppins font-medium text-blue-400">
                          {getSectionLocation(section)}
                        </span>
                      </div>
                    )}

                    {/* Description */}
                    {section.Description && (
                      <div className="text-dashboard-light text-sm leading-relaxed font-poppins font-normal">
                        {typeof section.Description === "string" ? (
                          <p className="line-clamp-3">{section.Description}</p>
                        ) : Array.isArray(section.Description) ? (
                          <div className="line-clamp-3">
                            {section.Description.map(
                              (block: any, idx: number) => {
                                if (block.type === "paragraph") {
                                  return (
                                    <p key={idx} className="inline">
                                      {block.children
                                        ?.map((child: any) => child.text)
                                        .join(" ")}{" "}
                                    </p>
                                  );
                                }
                                return null;
                              }
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Available Tab Icons */}
                    {availableTabs.length > 0 && (
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-dashboard-light text-xs font-poppins font-medium">
                          Includes:
                        </span>
                        {availableTabs.includes("timeline") && (
                          <div
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-dashboard-accent/10 hover:bg-dashboard-accent/20 transition-colors duration-200 text-dashboard-accent"
                            title="Timeline (Daily Schedule)"
                          >
                            <ClockIcon size={4} />
                          </div>
                        )}
                        {availableTabs.includes("transportation") && (
                          <div
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-dashboard-accent/10 hover:bg-dashboard-accent/20 transition-colors duration-200 text-dashboard-accent"
                            title="Transportation"
                          >
                            <TransportationIcon size="4" />
                          </div>
                        )}
                        {availableTabs.includes("stay") && (
                          <div
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-dashboard-accent/10 hover:bg-dashboard-accent/20 transition-colors duration-200 text-dashboard-accent"
                            title="Stay (Accommodation)"
                          >
                            <StayIcon size="4" />
                          </div>
                        )}
                        {availableTabs.includes("activities") && (
                          <div
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-dashboard-accent/10 hover:bg-dashboard-accent/20 transition-colors duration-200 text-dashboard-accent"
                            title="Places"
                          >
                            <Location size="4" />
                          </div>
                        )}
                        {availableTabs.includes("tips") && (
                          <div
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-dashboard-accent/10 hover:bg-dashboard-accent/20 transition-colors duration-200 text-dashboard-accent"
                            title="Tips & Notes"
                          >
                            <TipsIcon size="4" />
                          </div>
                        )}
                        {availableTabs.includes("budget") && (
                          <div
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-dashboard-accent/10 hover:bg-dashboard-accent/20 transition-colors duration-200 text-dashboard-accent"
                            title="Budget"
                          >
                            <BudgetIcon size="4" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </VerticalTimelineElement>
            );
          })}
        </VerticalTimeline>
      ) : (
        /* List View - Card Grid Layout Matching Public Side */
        <div className="space-y-10 sm:space-y-12 md:space-y-14">
          {sortedSections.map((section: any, idx: number) => {
            const dayNum = section.Sequence || idx + 1;
            const timeline = parseTimeline(section.Timeline);
            const allPlaces = [
              ...(timeline.morning || []),
              ...(timeline.afternoon || []),
              ...(timeline.evening || []),
            ];

            if (allPlaces.length === 0) return null;

            const cleanedTitle = cleanTitle(section.Title || `Day ${dayNum}`, dayNum);

            return (
              <motion.div
                key={section.documentId || `day-${dayNum}`}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1, ease: "easeOut" }}
                className="relative"
              >
                {/* Wrapped Day Container - Clickable Box */}
                <div
                  onClick={() => onSectionSelect(section)}
                  className="bg-gray-900/50 rounded-lg p-4 sm:p-6 border border-gray-700/50 hover:border-gray-600/50 transition-all duration-200 cursor-pointer space-y-6 sm:space-y-7 md:space-y-9"
                >
                  {/* Day Heading - Matching Public Side */}
                  <div className="flex items-center gap-3 pb-2 border-b border-gray-700/50">
                    <div className="flex items-center gap-2.5 flex-1">
                      <div className="w-1 h-8 sm:h-10 bg-gradient-to-b from-[hsl(var(--blue-cta))] to-[hsl(var(--blue-final))] rounded-full"></div>
                      <h2 className="text-white font-poppins font-bold text-xl sm:text-2xl md:text-3xl tracking-tight" style={{
                        textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                        textRendering: 'optimizeLegibility',
                        WebkitFontSmoothing: 'antialiased',
                        MozOsxFontSmoothing: 'grayscale'
                      }}>
                        <span className="text-[hsl(var(--blue-cta))]">
                          Day {dayNum}
                        </span>
                        {cleanedTitle && (
                          <>
                            <span className="text-gray-400/60 mx-2">|</span>
                            <span className="text-white font-semibold text-base sm:text-lg md:text-xl tracking-normal" style={{
                              textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                              textRendering: 'optimizeLegibility',
                              WebkitFontSmoothing: 'antialiased',
                              MozOsxFontSmoothing: 'grayscale',
                              letterSpacing: '0.01em'
                            }}>
                              {cleanedTitle}
                            </span>
                          </>
                        )}
                      </h2>
                    </div>

                    {/* Kebab Menu Container */}
                    <div
                      ref={(el) =>
                        (kebabRefs.current[`list-${section.documentId}`] = el)
                      }
                      className="relative z-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="p-1 hover:bg-dashboard-muted/50 rounded transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMenuToggle(section.documentId);
                        }}
                      >
                        <VerticalKebab size={"5"} />
                      </button>

                      {/* Kebab Menu Dropdown */}
                      {openMenuId === section.documentId && (
                        <div
                          className="absolute right-0 top-full mt-1 bg-dashboard-sidebar shadow-dashboard-elevated rounded-md p-1 border border-dashboard z-50 min-w-[120px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="flex items-center gap-2 w-full text-left text-sm text-dashboard hover:bg-dashboard-muted rounded px-3 py-1.5 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSectionEdit(section);
                              onMenuToggle(section.documentId);
                            }}
                            disabled={deletingSection === section.documentId}
                          >
                            <EditIcon />
                            <span>Edit</span>
                          </button>
                          <button
                            className="flex items-center gap-2 w-full text-left text-sm text-red-400 hover:bg-dashboard-muted rounded px-3 py-1.5 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSectionDelete(section.documentId, section.Title);
                              onMenuToggle(section.documentId);
                            }}
                            disabled={deletingSection === section.documentId}
                          >
                            <DeleteIcon stroke="currentColor" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Place Cards Grid - Matching Public Side */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                    {allPlaces.map((place: any, placeIndex: number) => {
                      const placeImage = getPlaceImage(place);

                      return (
                        <motion.div
                          key={place.place_id || `place-${placeIndex}`}
                          initial={{ opacity: 0, scale: 0.95, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: placeIndex * 0.06, ease: "easeOut" }}
                          whileHover={{ scale: 1.03, y: -4 }}
                          className="relative group cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onPlaceClick) {
                              onPlaceClick(place);
                            }
                          }}
                        >
                          {/* Place Card - Matching Public Side */}
                          <div className="relative bg-gradient-to-br from-gray-900/95 to-gray-800/95 rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 border border-gray-700/50 hover:border-[hsl(var(--blue-cta))]/50 w-full aspect-square max-w-[200px] md:max-w-md lg:max-w-lg mx-auto">
                            {/* Image Container - Fills entire card */}
                            <div className="relative w-full h-full overflow-hidden">
                              <img
                                src={placeImage}
                                alt={place.name || "Place"}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                onError={(e) => {
                                  e.currentTarget.src = "https://placehold.co/800x600/1a1a1a/666666?text=Place";
                                }}
                              />
                              {/* Gradient Overlay */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent"></div>

                              {/* Place Info Overlay */}
                              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 md:p-4 lg:p-5">
                                <h3 className="text-white font-poppins font-bold text-lg sm:text-xl md:text-2xl mb-2 drop-shadow-lg" style={{
                                  textRendering: 'optimizeLegibility',
                                  WebkitFontSmoothing: 'antialiased',
                                  MozOsxFontSmoothing: 'grayscale'
                                }}>
                                  {place.name || place.formatted_address || "Place"}
                                </h3>
                                {(place.rating || place.user_ratings_total) && (
                                  <div className="flex items-center gap-2">
                                    {place.rating && (
                                      <div className="flex items-center gap-1">
                                        <span className="text-yellow-400 text-sm sm:text-base">★</span>
                                        <span className="text-white font-poppins font-semibold text-sm sm:text-base">
                                          {place.rating.toFixed(1)}
                                        </span>
                                      </div>
                                    )}
                                    {place.user_ratings_total && (
                                      <span className="text-gray-300 font-poppins text-xs sm:text-sm">
                                        ({place.user_ratings_total > 999 ? `${Math.floor(place.user_ratings_total / 1000)}k` : place.user_ratings_total})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ItineraryView;
