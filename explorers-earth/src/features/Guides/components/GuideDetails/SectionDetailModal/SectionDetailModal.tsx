/**
 * SectionDetailModal Component
 * Modal for viewing detailed section information
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAvailableTabs } from "../../../utils/guideHelpers";
import ClockIcon from "../../../../../assets/icons/ClockIcon";
import TransportationIcon from "../../../../../assets/icons/TransportationIcon";
import StayIcon from "../../../../../assets/icons/StayIcon";
import Location from "../../../../../assets/icons/Location";
import TipsIcon from "../../../../../assets/icons/TipsIcon";
import BudgetIcon from "../../../../../assets/icons/BudgetIcon";
import DescriptionRenderer from "../../Shared/DescriptionRenderer";
import TimelineView from "./Views/TimelineView";
import TransportView from "./Views/TransportView";
import StayView from "./Views/StayView";
import ActivitiesView from "./Views/ActivitiesView";
import TipsView from "./Views/TipsView";
import BudgetView from "./Views/BudgetView";
import DialogPanel from "../../../../../components/ui/DialogPanel";

interface SectionDetailModalProps {
  section: any;
  guide?: any; // Guide data to get location info
  isOpen: boolean;
  onClose: () => void;
  onEdit: (section: any) => void;
}

const SectionDetailModal: React.FC<SectionDetailModalProps> = ({
  section,
  guide,
  isOpen,
  onClose,
  onEdit,
}) => {
  const [activeTab, setActiveTab] = useState<string>("timeline");

  // Calculate available tabs (safely handle null section)
  const availableTabs = section ? getAvailableTabs(section) : [];

  // Helper to get location name from section Map_Details
  const getSectionLocation = () => {
    if (!section?.Map_Details || !guide?.Place_Details) return null;

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

  // Auto-select first available tab if current tab is not available
  useEffect(() => {
    if (isOpen && section && availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [isOpen, section, availableTabs, activeTab]);

  // Early return after all hooks
  if (!isOpen || !section) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000]"
            onClick={onClose}
          />

          {/* Modal */}
          <DialogPanel onClose={onClose}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed top-16 bottom-16 left-2 right-2 sm:top-20 sm:bottom-20 sm:left-4 sm:right-4 md:inset-8 lg:inset-x-[15%] lg:inset-y-8 xl:inset-x-[20%] xl:inset-y-12 z-[10001] overflow-hidden"
          >
            <div className="h-full bg-dashboard-sidebar rounded-2xl shadow-2xl border-2 border-white overflow-y-auto scrollbar-hide">
              {/* Modal Header */}
              <div className="sticky top-0 bg-dashboard-bg/95 backdrop-blur-sm border-b border-dashboard-muted px-4 sm:px-6 py-3 sm:py-4 z-10">
                <div className="flex justify-between items-start gap-2 sm:gap-4">
                  <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                    {/* Sequence Badge */}
                    {section.Sequence && (
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                          <span className="text-white text-base sm:text-xl font-bold font-poppins drop-shadow-md">
                            {section.Sequence}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Title */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h2 className="text-dashboard text-lg sm:text-2xl font-poppins font-bold truncate flex-1 min-w-0">
                        {section.Title}
                      </h2>
                        {sectionLocation && (
                          <div className="flex-shrink-0 px-2.5 py-1 bg-blue-500/20 border border-blue-500/30 rounded-md">
                            <div className="flex items-center gap-1.5">
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
                              <span className="text-xs font-poppins font-medium text-blue-400 truncate max-w-[120px] sm:max-w-[150px]">
                                {sectionLocation}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      {section.Timeline && (
                        <div className="flex items-center gap-1.5 text-dashboard-accent">
                          <ClockIcon size="4" />
                          <span className="text-sm font-poppins font-medium">
                            Daily Schedule Available
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    {/* Edit Button */}
                    <button
                      onClick={() => {
                        onClose();
                        onEdit(section);
                      }}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-dashboard-accent hover:bg-dashboard-accent/90 text-white transition-all duration-200"
                      aria-label="Edit section"
                    >
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
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>

                    {/* Close Button */}
                    <button
                      onClick={onClose}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-dashboard-bg hover:bg-dashboard-muted text-dashboard-light hover:text-dashboard transition-all duration-200"
                      aria-label="Close detail view"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Content - Scrollable */}
              <div className="p-4 sm:p-6 space-y-6">
                {/* Tabs for section content */}
                {availableTabs.length > 1 && (
                  <div className="border-b border-dashboard-muted pb-2 mb-4">
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-2 px-2 sm:mx-0 sm:px-0">
                      {availableTabs.includes("timeline") && (
                        <button
                          onClick={() => setActiveTab("timeline")}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-poppins font-medium text-sm transition-all whitespace-nowrap flex-shrink-0 ${
                            activeTab === "timeline"
                              ? "bg-dashboard-accent text-white"
                              : "text-dashboard-light hover:bg-dashboard-bg"
                          }`}
                        >
                          <ClockIcon />
                          <span>Timeline</span>
                        </button>
                      )}
                      {availableTabs.includes("transportation") && (
                        <button
                          onClick={() => setActiveTab("transportation")}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-poppins font-medium text-sm transition-all whitespace-nowrap flex-shrink-0 ${
                            activeTab === "transportation"
                              ? "bg-dashboard-accent text-white"
                              : "text-dashboard-light hover:bg-dashboard-bg"
                          }`}
                        >
                          <TransportationIcon />
                          <span>Transport</span>
                        </button>
                      )}
                      {availableTabs.includes("stay") && (
                        <button
                          onClick={() => setActiveTab("stay")}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-poppins font-medium text-sm transition-all whitespace-nowrap flex-shrink-0 ${
                            activeTab === "stay"
                              ? "bg-dashboard-accent text-white"
                              : "text-dashboard-light hover:bg-dashboard-bg"
                          }`}
                        >
                          <StayIcon />
                          <span>Stay</span>
                        </button>
                      )}
                      {availableTabs.includes("activities") && (
                        <button
                          onClick={() => setActiveTab("activities")}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-poppins font-medium text-sm transition-all whitespace-nowrap flex-shrink-0 ${
                            activeTab === "activities"
                              ? "bg-dashboard-accent text-white"
                              : "text-dashboard-light hover:bg-dashboard-bg"
                          }`}
                        >
                          <Location size="5" />
                          <span>Places</span>
                        </button>
                      )}
                      {availableTabs.includes("tips") && (
                        <button
                          onClick={() => setActiveTab("tips")}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-poppins font-medium text-sm transition-all whitespace-nowrap flex-shrink-0 ${
                            activeTab === "tips"
                              ? "bg-dashboard-accent text-white"
                              : "text-dashboard-light hover:bg-dashboard-bg"
                          }`}
                        >
                          <TipsIcon />
                          <span>Tips</span>
                        </button>
                      )}
                      {availableTabs.includes("budget") && (
                        <button
                          onClick={() => setActiveTab("budget")}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-poppins font-medium text-sm transition-all whitespace-nowrap flex-shrink-0 ${
                            activeTab === "budget"
                              ? "bg-dashboard-accent text-white"
                              : "text-dashboard-light hover:bg-dashboard-bg"
                          }`}
                        >
                          <BudgetIcon />
                          <span>Budget</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Description */}
                {section.Description && (
                  <DescriptionRenderer
                    description={section.Description}
                    showTitle={true}
                  />
                )}

                {/* Tab Content */}
                {activeTab === "timeline" && section.Timeline && (
                  <TimelineView timeline={section.Timeline} section={section} />
                )}

                {activeTab === "transportation" && section.Transport && (
                  <TransportView
                    transport={section.Transport}
                    timeline={section.Timeline}
                    section={section}
                  />
                )}

                {activeTab === "stay" && section.Stay && (
                  <StayView stay={section.Stay} />
                )}

                {activeTab === "activities" && section.Recommendation_Activity && (
                  <ActivitiesView activities={section.Recommendation_Activity} />
                )}

                {activeTab === "tips" && section.Timeline && (
                  <TipsView timeline={section.Timeline} />
                )}

                {activeTab === "budget" && section.Budget && (
                  <BudgetView budget={section.Budget} />
                )}
              </div>
            </div>
          </DialogPanel>
        </>
      )}
    </AnimatePresence>
  );
};

export default SectionDetailModal;

