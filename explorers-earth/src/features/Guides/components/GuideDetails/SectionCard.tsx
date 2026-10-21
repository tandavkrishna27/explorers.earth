/**
 * SectionCard Component
 * Reusable card component for displaying a guide section in list view
 */

import React from "react";
import EditIcon from "../../../../assets/icons/EditIcon";
import DeleteIcon from "../../../../assets/icons/DeleteIcon";
import VerticalKebab from "../../../../assets/icons/VerticalKebab";
import ClockIcon from "../../../../assets/icons/ClockIcon";
import TransportationIcon from "../../../../assets/icons/TransportationIcon";
import StayIcon from "../../../../assets/icons/StayIcon";
import Location from "../../../../assets/icons/Location";
import BudgetIcon from "../../../../assets/icons/BudgetIcon";
import TipsIcon from "../../../../assets/icons/TipsIcon";
import { getAvailableTabs } from "../../utils/guideHelpers";
import { parseTimeline } from "../../utils/guideDataParser";
import { guideDescriptionText } from "../../../../utils/guideDescriptionText";
import { keyboardActivation } from "../../../../utils/keyboardActivation";

interface SectionCardProps {
  section: any;
  guide?: any; // Guide data to get location info
  openMenuId: string | null;
  deletingSection: string | null;
  kebabRef: (el: HTMLDivElement | null) => void;
  onMenuToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
}

const SectionCard: React.FC<SectionCardProps> = ({
  section,
  guide,
  openMenuId,
  deletingSection,
  kebabRef,
  onMenuToggle,
  onEdit,
  onDelete,
  onSelect,
}) => {
  const availableTabs = getAvailableTabs(section);

  // Parse timeline data to get places organized by time periods
  const timeline = parseTimeline(section.Timeline);
  const allPlaces = [
    ...(timeline.morning || []),
    ...(timeline.afternoon || []),
    ...(timeline.evening || []),
  ];

  // Helper to get location name from section Map_Details
  const getSectionLocation = () => {
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

  const sectionLocation = getSectionLocation();

  return (
    <div
      {...keyboardActivation(onSelect)}
      className="group relative bg-gradient-to-br from-dashboard-sidebar to-dashboard-bg rounded-xl border border-dashboard-muted hover:border-dashboard-accent hover:shadow-lg transition-all duration-300 cursor-pointer"
    >
      {/* Accent line on left */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-dashboard-accent to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-l-xl" />

      {/* Kebab Menu Container */}
      <div ref={kebabRef} className="absolute right-2 top-2 z-50">
        <button
          className="p-1 hover:bg-dashboard-muted/50 rounded transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onMenuToggle();
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
                onEdit();
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
                onDelete();
              }}
              disabled={deletingSection === section.documentId}
            >
              <DeleteIcon stroke="currentColor" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>

      <div className="p-5">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-4 flex-1 pr-8">
            {/* Sequence Badge */}
            {section.Sequence && (
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all duration-300">
                  <span className="text-white text-lg font-bold font-poppins drop-shadow-md">
                    {section.Sequence}
                  </span>
                </div>
              </div>
            )}

            {/* Title */}
            <div className="flex-1 min-w-0 pr-12">
              <h3 className="text-dashboard text-xl font-poppins font-bold group-hover:text-dashboard-accent transition-colors duration-200 mb-1">
                {section.Title}
              </h3>
              {sectionLocation && (
                <div className="mt-1.5 mb-1 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/20 border border-blue-500/30 rounded-md">
                  <svg
                    className="w-3.5 h-3.5 text-blue-400 flex-shrink-0"
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
                    {sectionLocation}
                  </span>
                </div>
              )}

              {/* Description */}
              {section.Description && (
                <div className="text-dashboard-light text-sm leading-relaxed font-poppins font-normal mt-2">
                  <p className="line-clamp-2">{guideDescriptionText(section.Description)}</p>
                </div>
              )}

              {/* Places by Time Period */}
              {allPlaces.length > 0 && (
                <div className="space-y-2 sm:space-y-3 md:space-y-4 mt-4">
                  {timeline.morning && timeline.morning.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                        <div className="text-dashboard-light">
                          <ClockIcon size="4" />
                        </div>
                        <span className="text-dashboard-light text-xs sm:text-sm font-poppins font-medium">
                          Morning
                        </span>
                      </div>
                      <div className="space-y-1.5 sm:space-y-2 ml-4 sm:ml-5 md:ml-6">
                        {timeline.morning.map((place: any, placeIdx: number) => (
                          <div
                            key={placeIdx}
                            className="flex items-start gap-1.5 sm:gap-2 text-dashboard-light text-xs sm:text-sm"
                          >
                            <div className="text-dashboard-light mt-0.5 sm:mt-1 flex-shrink-0">
                              <Location size="4" fill="currentColor" />
                            </div>
                            <span className="line-clamp-2">{place.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {timeline.afternoon && timeline.afternoon.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                        <div className="text-dashboard-light">
                          <ClockIcon size="4" />
                        </div>
                        <span className="text-dashboard-light text-xs sm:text-sm font-poppins font-medium">
                          Afternoon
                        </span>
                      </div>
                      <div className="space-y-1.5 sm:space-y-2 ml-4 sm:ml-5 md:ml-6">
                        {timeline.afternoon.map((place: any, placeIdx: number) => (
                          <div
                            key={placeIdx}
                            className="flex items-start gap-1.5 sm:gap-2 text-dashboard-light text-xs sm:text-sm"
                          >
                            <div className="text-dashboard-light mt-0.5 sm:mt-1 flex-shrink-0">
                              <Location size="4" fill="currentColor" />
                            </div>
                            <span className="line-clamp-2">{place.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {timeline.evening && timeline.evening.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                        <div className="text-dashboard-light">
                          <ClockIcon size="4" />
                        </div>
                        <span className="text-dashboard-light text-xs sm:text-sm font-poppins font-medium">
                          Evening
                        </span>
                      </div>
                      <div className="space-y-1.5 sm:space-y-2 ml-4 sm:ml-5 md:ml-6">
                        {timeline.evening.map((place: any, placeIdx: number) => (
                          <div
                            key={placeIdx}
                            className="flex items-start gap-1.5 sm:gap-2 text-dashboard-light text-xs sm:text-sm"
                          >
                            <div className="text-dashboard-light mt-0.5 sm:mt-1 flex-shrink-0">
                              <Location size="4" fill="currentColor" />
                            </div>
                            <span className="line-clamp-2">{place.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
        </div>
      </div>
    </div>
  );
};

export default SectionCard;

