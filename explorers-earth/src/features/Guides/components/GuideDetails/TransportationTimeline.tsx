/**
 * TransportationTimeline Component
 * Displays all transportation routes and modes used throughout the guide journey
 * Groups transport segments by day/section with collapsible cards
 */

import React, { useMemo, useState } from "react";
import {
  VerticalTimeline,
  VerticalTimelineElement,
} from "react-vertical-timeline-component";
import "react-vertical-timeline-component/style.min.css";
import {
  TransportSegment,
  DayPlace,
  TravelMode,
} from "../../types/guideSectionTypes";
import { getTransportSegments } from "../../utils/guideHelpers";
import { parseTimeline, parseStay, parseActivity } from "../../utils/guideDataParser";
import {
  getTravelModeConfig,
  getTravelModeLabel,
} from "../../utils/travelModeConfig";
import { calculateDistance } from "../../utils/distanceCalculator";
import TransportationIcon from "../../../../assets/icons/TransportationIcon";
import DirectionIcon from "../../../../assets/icons/DirectionIcon";
import { motion, AnimatePresence } from "framer-motion";
import {useGuideEditing} from '../../context/GuideEditingProvider';
import { TravelModeSelector } from "../TravelModeSelector";
import { toast } from "sonner";

interface TransportationTimelineProps {
  guide: {
    guide_sections?: any[];
    documentId?: string;
    Place_Details?: any;
  };
}

interface TransportNode {
  id: string;
  type: "intermediate";
  from: {
    name: string;
    address?: string;
    place_id?: string;
    geometry?: {
      location: {
        lat: number;
        lng: number;
      };
    };
  };
  to: {
    name: string;
    address?: string;
    place_id?: string;
    geometry?: {
      location: {
        lat: number;
        lng: number;
      };
    };
  };
  segment?: TransportSegment;
  sectionTitle?: string;
  sectionSequence?: number;
  sectionId?: string; // Added to track which section this belongs to
}

interface SectionGroup {
  sectionId: string;
  sectionTitle: string;
  sectionSequence: number;
  transportNodes: TransportNode[];
}

const TransportationTimeline: React.FC<TransportationTimelineProps> = ({
  guide,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );
  const [editingModeForSegment, setEditingModeForSegment] = useState<
    string | null
  >(null);
  const [updatingSegment, setUpdatingSegment] = useState<string | null>(null);

  // Helper to check if guide is multi-city and parse Place_Details
  const getMultiCityData = useMemo(() => {
    if (!guide.Place_Details) return null;

    try {
      let placeDetails: any = guide.Place_Details;
      if (typeof guide.Place_Details === "string") {
        placeDetails = JSON.parse(guide.Place_Details);
      }

      // Check if it's a multi-city format
      if (
        placeDetails?.isMultiCity === true &&
        ((placeDetails.ending || placeDetails.starting) ||
         (placeDetails.arrival || placeDetails.to) ||
         (placeDetails.departure || placeDetails.from))
      ) {
        const ending = placeDetails.ending || placeDetails.arrival || placeDetails.to;
        const starting = placeDetails.starting || placeDetails.departure || placeDetails.from;

        return {
          ending: {
            name: ending?.Place_Name || ending?.Place_Address || "Ending Point",
            address: ending?.Place_Address || "",
            place_id: ending?.Place_Id || "",
            geometry: ending?.Geometry || null,
          },
          starting: {
            name:
              starting?.Place_Name || starting?.Place_Address || "Starting Point",
            address: starting?.Place_Address || "",
            place_id: starting?.Place_Id || "",
            geometry: starting?.Geometry || null,
          },
        };
      }
    } catch (error) {
      console.error("Error parsing Place_Details for multi-city:", error);
    }

    return null;
  }, [guide.Place_Details]);

  const {getSection, saveSection} = useGuideEditing();

  // Group transport segments by section
  const sectionGroups = useMemo(() => {
    const seenSegmentIds = new Set<string>();
    const sections = guide.guide_sections || [];
    const groupsMap = new Map<string, SectionGroup>();

    // Remove duplicate sections based on documentId
    const uniqueSections = sections.filter(
      (section: any, index: number, self: any[]) =>
        index ===
        self.findIndex((s: any) => s.documentId === section.documentId)
    );

    // Sort sections by sequence
    const sortedSections = [...uniqueSections].sort(
      (a, b) => (a.Sequence || 0) - (b.Sequence || 0)
    );

    // Group transport segments by section
    sortedSections.forEach((section) => {
      const transportSegments = getTransportSegments(section);
      const timelineData = parseTimeline(section.Timeline);

      // Collect all places from the section
      const allPlaces: DayPlace[] = [
        ...(timelineData.morning || []),
        ...(timelineData.afternoon || []),
        ...(timelineData.evening || []),
        ...parseStay(section.Stay).accommodations,
        ...parseActivity(section.Recommendation_Activity).activities,
      ];

      const sectionNodes: TransportNode[] = [];

      // Create nodes for each transport segment
      transportSegments.forEach((segment) => {
        const fromPlace = allPlaces.find(
          (p) => p.id === segment.fromPlaceId
        );
        const toPlace = allPlaces.find((p) => p.id === segment.toPlaceId);

        if (fromPlace && toPlace) {
          // Create unique ID for this segment
          const segmentId = `${section.documentId}-${segment.fromPlaceId}-${segment.toPlaceId}`;

          // Skip if we've already seen this exact segment
          if (seenSegmentIds.has(segmentId)) {
            return;
          }

          seenSegmentIds.add(segmentId);

          sectionNodes.push({
            id: `segment-${segmentId}`,
            type: "intermediate",
            from: {
              name: fromPlace.name,
              address: fromPlace.formatted_address,
              place_id: fromPlace.place_id,
              geometry: fromPlace.geometry,
            },
            to: {
              name: toPlace.name,
              address: toPlace.formatted_address,
              place_id: toPlace.place_id,
              geometry: toPlace.geometry,
            },
            segment,
            sectionTitle: section.Title,
            sectionSequence: section.Sequence,
            sectionId: section.documentId, // Added sectionId for updates
          });
        }
      });

      // Only add section if it has transport segments
      if (sectionNodes.length > 0) {
        groupsMap.set(section.documentId, {
          sectionId: section.documentId,
          sectionTitle: section.Title || `Day ${section.Sequence || 1}`,
          sectionSequence: section.Sequence || 0,
          transportNodes: sectionNodes,
        });
      }
    });

    return Array.from(groupsMap.values()).sort(
      (a, b) => a.sectionSequence - b.sectionSequence
    );
  }, [guide.guide_sections]);

  // Toggle section expansion
  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  // Update travel mode for a specific segment
  const updateTravelMode = async (
    node: TransportNode,
    newMode: TravelMode,
    sectionDocumentId: string
  ) => {
    if (!node.segment) return;

    setUpdatingSegment(node.id);
    try {
      // Find the section
      const section = guide.guide_sections?.find(
        (s: any) => s.documentId === sectionDocumentId
      );
      if (!section) {
        throw new Error("Section not found");
      }

      // Get all current transport segments
      const currentSegments = getTransportSegments(section);

      // Update the specific segment
      const updatedSegments = currentSegments.map((seg) => {
        if (
          seg.fromPlaceId === node.segment?.fromPlaceId &&
          seg.toPlaceId === node.segment?.toPlaceId
        ) {
          return {
            ...seg,
            mode: newMode,
          };
        }
        return seg;
      });

      // Only transport changes; every other block keeps its current value.
      const target = getSection(sectionDocumentId);
      if (!target) throw new Error("That part of the guide is no longer there. Refresh and try again.");
      await saveSection(sectionDocumentId, {
        title: target.Title,
        description: target.Description ?? null,
        Transport: {segments: updatedSegments},
      });

      toast.success("Travel mode updated successfully");
    } catch (error: any) {
      console.error("Error updating travel mode:", error);
      toast.error(error.message || "Failed to update travel mode");
    } finally {
      setUpdatingSegment(null);
      setEditingModeForSegment(null);
    }
  };

  // Render a single transport segment (nested under day card)
  const renderTransportSegment = (
    node: TransportNode,
    sectionId: string,
    isLastItem: boolean
  ) => {
    const mode = node.segment?.mode || "drive";
    const modeConfig = getTravelModeConfig(mode);
    const travelMinutes = node.segment?.estimatedMinutes || 0;
    const distanceKm = node.segment?.distanceKm || 0;
    const isUpdating = updatingSegment === node.id;
    const isEditingMode = editingModeForSegment === node.id;

    // Calculate distance if not provided
    let calculatedDistance = distanceKm;
    if (!calculatedDistance && node.from.geometry && node.to.geometry) {
      calculatedDistance = calculateDistance(
        node.from.geometry.location.lat,
        node.from.geometry.location.lng,
        node.to.geometry.location.lat,
        node.to.geometry.location.lng
      );
    }

    const travelLabel =
      travelMinutes > 0
        ? getTravelModeLabel(mode, travelMinutes)
        : calculatedDistance > 0
        ? `${Math.round(
            (calculatedDistance / (modeConfig?.speedKmh || 40)) * 60
          )} min ${modeConfig?.label.toLowerCase() || "drive"}`
        : "";

    const distanceStr =
      calculatedDistance < 1
        ? `${Math.round(calculatedDistance * 1000)} m`
        : `${calculatedDistance.toFixed(1)} km`;

    // Google Maps URL for directions
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      node.from.name
    )}&origin_place_id=${node.from.place_id}&destination=${encodeURIComponent(
      node.to.name
    )}&destination_place_id=${node.to.place_id}&travelmode=${
      mode === "public_transit"
        ? "transit"
        : mode === "walk"
        ? "walking"
        : mode === "bike"
        ? "bicycling"
        : "driving"
    }`;

    return (
      <motion.div
        key={node.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={`group relative rounded-lg border border-dashboard-muted/30 bg-gradient-to-br from-dashboard-bg/40 to-dashboard-bg/20 hover:from-dashboard-accent/5 hover:to-dashboard-bg/30 backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-dashboard-accent/40 p-3 ${
          isEditingMode ? "z-50" : "z-0"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Mode Icon with Enhanced Styling */}
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-dashboard-accent/20 to-dashboard-accent/10 text-dashboard-accent flex items-center justify-center ring-1 ring-dashboard-accent/20 group-hover:ring-dashboard-accent/50 transition-all duration-300">
            {modeConfig?.icon || <TransportationIcon size="4" />}
          </div>

          {/* Route Info - Responsive Layout */}
          <div className="flex-1 min-w-0">
            {/* Locations - Stacked on mobile, inline on desktop */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"></div>
                <span className="text-dashboard font-poppins font-medium text-sm truncate">
                  {node.from.name}
                </span>
              </div>

              <svg
                className="hidden sm:block w-4 h-4 text-dashboard-muted/60 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>

              {/* Mobile arrow */}
              <div className="flex sm:hidden items-center gap-2 ml-2">
                <svg
                  className="w-3 h-3 text-dashboard-muted/60 rotate-90"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </div>

              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"></div>
                <span className="text-dashboard font-poppins font-medium text-sm truncate">
                  {node.to.name}
                </span>
              </div>
            </div>

            {/* Badges Row - Wraps on mobile */}
            <div className="flex items-center gap-1.5 flex-wrap relative">
              {/* Drive Mode Badge - FILLED STYLE with dropdown */}
              <div className="relative z-50">
                <button
                  onClick={() =>
                    setEditingModeForSegment(isEditingMode ? null : node.id)
                  }
                  disabled={isUpdating}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-poppins font-semibold bg-dashboard-accent text-white shadow-sm hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Click to change travel mode"
                >
                  {isUpdating ? (
                    <>
                      <svg
                        className="animate-spin h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <span>{modeConfig?.label || "Transport"}</span>
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </>
                  )}
                </button>

                {/* Travel Mode Selector Dropdown */}
                {isEditingMode && !isUpdating && (
                  <div className="absolute z-[100] left-4 sm:left-12">
                    <TravelModeSelector
                      distanceKm={calculatedDistance}
                      selectedMode={mode}
                      onSelectMode={(newMode) =>
                        updateTravelMode(node, newMode, sectionId)
                      }
                      onClose={() => setEditingModeForSegment(null)}
                      colorTheme="sky"
                      openUpward={isLastItem}
                    />
                  </div>
                )}
              </div>

              {/* Travel Time Badge - OUTLINE STYLE */}
              {travelLabel && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-poppins font-medium bg-transparent text-dashboard-light border border-dashboard-muted/60 whitespace-nowrap">
                  <svg
                    className="w-3 h-3 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="truncate">{travelLabel}</span>
                </span>
              )}
              {/* Distance Badge - OUTLINE STYLE */}
              {calculatedDistance > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-poppins font-medium bg-transparent text-dashboard-light border border-dashboard-muted/60 whitespace-nowrap">
                  <svg
                    className="w-3 h-3 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    />
                  </svg>
                  <span className="truncate">{distanceStr}</span>
                </span>
              )}
            </div>
          </div>

          {/* Directions Button - Absolute positioned on mobile */}
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 sm:static flex-shrink-0 p-2 rounded-lg hover:bg-blue-500/10 text-blue-400 hover:text-blue-500 transition-all duration-200"
            title="Get Directions"
            onClick={(e) => e.stopPropagation()}
          >
            <DirectionIcon size="5" />
          </a>
        </div>
      </motion.div>
    );
  };

  // Render arrival location card
  const renderEndingPointCard = () => {
    if (!getMultiCityData?.ending) return null;

    const ending = getMultiCityData.ending;

    return (
      <VerticalTimelineElement
        key="arrival-location"
        className="vertical-timeline-element--work"
        contentStyle={{
          background: "rgba(30, 33, 42, 0.95)",
          color: "var(--dash-text)",
          border: "1px solid rgba(34, 197, 94, 0.3)",
          borderRadius: "16px",
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
          backdropFilter: "blur(10px)",
          padding: "0",
        }}
        contentArrowStyle={{
          borderRight: "7px solid rgba(34, 197, 94, 0.3)",
        }}
        iconStyle={{
          background: "linear-gradient(to bottom right, rgb(34, 197, 94), rgb(22, 163, 74))",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
        icon={
          <svg
            className="timeline-icon-airplane timeline-icon-arrival"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{
              display: "block",
            }}
          >
            {/* Airplane landing icon - rotated to point downward */}
            <path
              d="M20.56 3.91c.59.59.59 1.54 0 2.12l-3.89 3.89l2.12 9.19l-1.41 1.42l-3.88-7.43L9.6 17l.36 2.47l-1.07 1.06l-1.76-3.18l-3.19-1.77L5 14.5l2.5.37L11.37 11L3.94 7.09l1.42-1.41l9.19 2.12l3.89-3.89c.56-.58 1.56-.58 2.12 0"
              transform="rotate(90 12 12)"
            />
          </svg>
        }
      >
        <div className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-dashboard font-poppins font-bold text-base">
              Ending Point
            </h3>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-poppins font-semibold bg-green-500/15 text-green-400 border border-green-400/30 whitespace-nowrap">
              End
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></div>
              <p className="text-dashboard font-poppins font-medium text-sm">
                {ending.name}
              </p>
            </div>
            {ending.address && (
              <p className="text-dashboard-light text-xs font-poppins ml-4">
                {ending.address}
              </p>
            )}
          </div>
        </div>
      </VerticalTimelineElement>
    );
  };

  // Render departure location card
  const renderStartingPointCard = () => {
    if (!getMultiCityData?.starting) return null;

    const starting = getMultiCityData.starting;

    return (
      <VerticalTimelineElement
        key="departure-location"
        className="vertical-timeline-element--work"
        contentStyle={{
          background: "rgba(30, 33, 42, 0.95)",
          color: "var(--dash-text)",
          border: "1px solid rgba(59, 130, 246, 0.3)",
          borderRadius: "16px",
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
          backdropFilter: "blur(10px)",
          padding: "0",
        }}
        contentArrowStyle={{
          borderRight: "7px solid rgba(59, 130, 246, 0.3)",
        }}
        iconStyle={{
          background: "linear-gradient(to bottom right, rgb(59 130 246), rgb(37 99 235))",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
        icon={
          <svg
            className="timeline-icon-airplane timeline-icon-departure"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{
              display: "block",
            }}
          >
            {/* Airplane taking off icon - pointing upward */}
            <path
              d="M20.56 3.91c.59.59.59 1.54 0 2.12l-3.89 3.89l2.12 9.19l-1.41 1.42l-3.88-7.43L9.6 17l.36 2.47l-1.07 1.06l-1.76-3.18l-3.19-1.77L5 14.5l2.5.37L11.37 11L3.94 7.09l1.42-1.41l9.19 2.12l3.89-3.89c.56-.58 1.56-.58 2.12 0"
            />
          </svg>
        }
      >
        <div className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-dashboard font-poppins font-bold text-base">
              Starting Point
            </h3>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-poppins font-semibold bg-blue-500/15 text-blue-400 border border-blue-400/30 whitespace-nowrap">
              Start
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
              <p className="text-dashboard font-poppins font-medium text-sm">
                {starting.name}
              </p>
            </div>
            {starting.address && (
              <p className="text-dashboard-light text-xs font-poppins ml-4">
                {starting.address}
              </p>
            )}
          </div>
        </div>
      </VerticalTimelineElement>
    );
  };

  // Render a section group (day card)
  const renderSectionGroup = (group: SectionGroup) => {
    const isExpanded = expandedSections.has(group.sectionId);
    const transportCount = group.transportNodes.length;

    return (
      <VerticalTimelineElement
        key={group.sectionId}
        className="vertical-timeline-element--work"
        contentStyle={{
          background: "rgba(30, 33, 42, 0.95)",
          color: "var(--dash-text)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "16px",
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
          backdropFilter: "blur(10px)",
          padding: "0",
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
            {group.sectionSequence}
          </span>
        }
      >
        <div>
          {/* Section Header - Collapsible */}
          <button
            onClick={() => toggleSection(group.sectionId)}
            className="w-full flex items-center justify-between p-4 hover:bg-dashboard-bg/20 transition-colors rounded-t-lg group"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <h3 className="text-dashboard font-poppins font-bold text-base">
                {group.sectionTitle}
              </h3>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-poppins font-semibold bg-blue-500/15 text-blue-400 border border-blue-400/30 whitespace-nowrap">
                <TransportationIcon size="3" />
                {transportCount} {transportCount === 1 ? "route" : "routes"}
              </span>
            </div>
          </button>

          {/* Collapsible Content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: "visible" }}
              >
                <div className="px-4 pb-4 pt-2 border-t border-dashboard-muted/50 overflow-visible">
                  <div className="space-y-3 overflow-visible">
                    {group.transportNodes.map((node, index) =>
                      renderTransportSegment(
                        node,
                        group.sectionId,
                        index === group.transportNodes.length - 1
                      )
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </VerticalTimelineElement>
    );
  };

  // If no section groups but it's a multi-city guide, show starting/ending cards
  if (sectionGroups.length === 0 && getMultiCityData) {
    return (
      <div className="bg-dashboard-sidebar rounded-lg shadow-dashboard-elevated p-6 border border-dashboard-muted">
        <div className="mb-6">
          <h2 className="text-dashboard text-xl font-poppins font-bold mb-2">
            Transportation Timeline
          </h2>
          <p className="text-dashboard-light text-sm font-poppins">
            All transportation routes and modes used throughout your journey
          </p>
        </div>
        <VerticalTimeline lineColor="var(--dash-accent)">
          {renderStartingPointCard()}
          {renderEndingPointCard()}
        </VerticalTimeline>
        <div className="text-center py-8 mt-6">
          <p className="text-dashboard-light text-sm font-poppins">
            Add your travel routes and modes in the Journey sections to see them
            here
          </p>
        </div>
      </div>
    );
  }

  // If no section groups and not multi-city, show empty state
  if (sectionGroups.length === 0) {
    return (
      <div className="bg-dashboard-sidebar rounded-lg shadow-dashboard-elevated p-6 border border-dashboard-muted">
        <div className="mb-6">
          <h2 className="text-dashboard text-xl font-poppins font-bold mb-2">
            Transportation Timeline
          </h2>
          <p className="text-dashboard-light text-sm font-poppins">
            All transportation routes and modes used throughout your journey
          </p>
        </div>
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 opacity-20 text-dashboard-light">
            <TransportationIcon size="16" />
          </div>
          <p className="text-dashboard-light font-poppins mb-2">
            No transportation data available
          </p>
          <p className="text-dashboard-light text-sm font-poppins">
            Add your travel routes and modes in the Journey sections to see them
            here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dashboard-sidebar rounded-lg shadow-dashboard-elevated p-6 border border-dashboard-muted">
      <div className="mb-6">
        <h2 className="text-dashboard text-xl font-poppins font-bold mb-2">
          Transportation Timeline
        </h2>
        <p className="text-dashboard-light text-sm font-poppins">
          All transportation routes and modes used throughout your journey
        </p>
      </div>

      <VerticalTimeline lineColor="var(--dash-accent)">
        {renderStartingPointCard()}
        {sectionGroups.map((group) => renderSectionGroup(group))}
        {renderEndingPointCard()}
      </VerticalTimeline>
    </div>
  );
};

export default TransportationTimeline;
