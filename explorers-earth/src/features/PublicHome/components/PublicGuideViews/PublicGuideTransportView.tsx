import { memo, useMemo, useState } from "react";
import { getTransportSegments } from "../../../Guides/utils/guideHelpers";
import { parseTimeline } from "../../../Guides/utils/guideDataParser";
import { getTravelModeLabel, getTravelModeConfig } from "../../../Guides/utils/travelModeConfig";
import TransportationIcon from "../../../../assets/icons/TransportationIcon";
import { TravelMode } from "../../../Guides/types/guideSectionTypes";

interface PublicGuideTransportViewProps {
  guide: any;
  sections: any[];
  selectedDay?: string;
}

const PublicGuideTransportView = memo(({ sections, selectedDay: externalSelectedDay }: PublicGuideTransportViewProps) => {
  const [internalSelectedDay] = useState<string>("overview");
  const selectedDay = externalSelectedDay !== undefined ? externalSelectedDay : internalSelectedDay;

  // Get all sections with transport data
  const daysWithTransport = useMemo(() => {
    return sections
      .filter((section) => {
        const segments = getTransportSegments(section);
        return segments.length > 0;
      })
      .sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0));
  }, [sections]);

  // Group transport segments by section
  const transportSegmentsByDay = useMemo(() => {
    const grouped: Record<string, Array<{
      segment: any;
      sectionTitle: string;
      sectionSequence: number;
      fromPlace: any;
      toPlace: any;
    }>> = {};

    sections.forEach((section) => {
      const segments = getTransportSegments(section);
      const timeline = parseTimeline(section.Timeline);
      const allPlaces = [
        ...(timeline.morning || []),
        ...(timeline.afternoon || []),
        ...(timeline.evening || []),
      ];

      const sectionSequence = section.Sequence || 0;
      const dayId = `day-${sectionSequence}`;
      
      if (!grouped[dayId]) {
        grouped[dayId] = [];
      }

      segments.forEach((segment) => {
        const fromPlace = allPlaces.find(
          (p: any) => p.place_id === segment.fromPlaceId
        );
        const toPlace = allPlaces.find(
          (p: any) => p.place_id === segment.toPlaceId
        );

        if (fromPlace && toPlace) {
          grouped[dayId].push({
            segment,
            sectionTitle: section.Title || `Day ${sectionSequence}`,
            sectionSequence,
            fromPlace,
            toPlace,
          });
        }
      });
    });

    return grouped;
  }, [sections]);

  // Get all transport segments for Overview
  const allTransportSegments = useMemo(() => {
    return Object.values(transportSegmentsByDay)
      .flat()
      .sort((a, b) => a.sectionSequence - b.sectionSequence);
  }, [transportSegmentsByDay]);


  // Get sections with timeline data for Overview day-wise display
  const sectionsWithTimeline = useMemo(() => {
    return daysWithTransport.map((section) => {
      const timeline = parseTimeline(section.Timeline);
      const transportSegments = getTransportSegments(section);
      return {
        section,
        timeline,
        transportSegments,
        dayNum: section.Sequence || daysWithTransport.indexOf(section) + 1,
      };
    });
  }, [daysWithTransport]);

  // Render route function - Timeline style with alternating sides
  const renderRoute = (
    place: any,
    nextPlace: any,
    segment: any,
    periodColor: "amber" | "sky" | "indigo",
    side: "left" | "right",
    isLast: boolean = false,
    showHeading: boolean = false,
    headingText: string = ""
  ) => {
    const modeConfig = getTravelModeConfig(segment?.mode || "drive");
    const colorClasses = {
      amber: {
        bg: "bg-amber-500/10",
        border: "border-amber-400/30",
        icon: "text-amber-400",
        label: "text-[var(--category-text,#FCD34D)]",
        badge: "bg-amber-500/20",
        line: "bg-amber-400/40",
      },
      sky: {
        bg: "bg-sky-500/10",
        border: "border-sky-400/30",
        icon: "text-sky-400",
        label: "text-[var(--category-text,#7DD3FC)]",
        badge: "bg-sky-500/20",
        line: "bg-sky-400/40",
      },
      indigo: {
        bg: "bg-indigo-500/10",
        border: "border-indigo-400/30",
        icon: "text-indigo-400",
        label: "text-[var(--category-text,#A5B4FC)]",
        badge: "bg-indigo-500/20",
        line: "bg-indigo-400/40",
      },
    };

    const colors = colorClasses[periodColor];
    const travelTime = getTravelModeLabel(
      segment?.mode || "drive",
      segment?.estimatedMinutes || segment?.time || 0
    );

    return (
      <div
        key={`${place.place_id}-${nextPlace.place_id}`}
        className={`relative ${isLast ? "pb-0" : "pb-4 sm:pb-5 md:pb-6"} ${side === "left" ? "sm:pr-1/2" : "sm:pl-1/2"}`}
      >
        {/* Period Heading - Above first card, positioned to align with card - Subtle design */}
        {showHeading && (
          <div className={`mb-3 sm:mb-4 text-center sm:text-left w-full sm:max-w-[45%] md:max-w-[48%] ${side === "left" ? "sm:mr-auto sm:pr-4 md:pr-6" : "sm:ml-auto sm:pl-4 md:pl-6"}`}>
            <h5 className="text-[var(--category-muted,#D1D5DB)] font-poppins font-semibold text-sm sm:text-base md:text-lg tracking-wide">
              {headingText}
            </h5>
          </div>
        )}
        
        {/* Route Card - Full width on mobile, Left/Right on desktop - Elegant subtle design */}
        <div className={`w-full sm:max-w-[45%] md:max-w-[48%] ${side === "left" ? "sm:mr-auto sm:pr-4 md:pr-6" : "sm:ml-auto sm:pl-4 md:pl-6"}`}>
          <div className="bg-[var(--category-card,rgba(31,41,55,0.4))] border border-[var(--category-control-border,rgba(55,65,81,0.3))] rounded-lg p-3.5 sm:p-4 hover:border-[var(--category-control-border,rgba(55,65,81,0.5))] hover:bg-[var(--category-hover,rgba(31,41,55,0.5))] transition-all duration-200 backdrop-blur-sm">
            {/* From Location - Clean design */}
            <div className="mb-3">
              <div className="flex items-start gap-2.5">
                <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-400/80 mt-2"></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[8px] sm:text-[7px] text-[var(--category-muted,#6B7280)] font-poppins uppercase tracking-widest mb-1 font-medium">
                    From
                  </div>
                  <div className="text-sm sm:text-base text-[var(--category-text,#FFFFFF)] font-poppins font-medium leading-snug break-words">
                    {place.name}
                  </div>
                </div>
              </div>
            </div>

            {/* Transport Mode Icon & Time - Minimal design */}
            <div className="flex items-center gap-2.5 my-3 py-2.5 border-y border-[var(--category-control-border,rgba(55,65,81,0.2))]">
              <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full ${colors.badge} flex items-center justify-center ${colors.icon} opacity-80`}>
                <div className="w-3 h-3 sm:w-3.5 sm:h-3.5">
                  {modeConfig?.icon || <TransportationIcon size="3" />}
                </div>
              </div>
              <div className={`px-2 py-0.5 ${colors.badge} rounded-md text-[9px] sm:text-[8px] ${colors.label} font-poppins font-medium whitespace-nowrap`}>
                {travelTime}
              </div>
            </div>

            {/* To Location - Clean design */}
            <div className="mt-3">
              <div className="flex items-start gap-2.5">
                <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-400/80 mt-2"></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[8px] sm:text-[7px] text-[var(--category-muted,#6B7280)] font-poppins uppercase tracking-widest mb-1 font-medium">
                    To
                  </div>
                  <div className="text-sm sm:text-base text-[var(--category-text,#FFFFFF)] font-poppins font-medium leading-snug break-words">
                    {nextPlace.name}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Connection Line to Timeline - Hidden on mobile for cleaner look */}
        <div className={`hidden sm:block absolute ${side === "left" ? "right-0" : "left-0"} top-1/2 -translate-y-1/2 w-1/2 h-0.5 ${colors.line}`}></div>
        
        {/* Circle on Timeline - Hidden on mobile, visible on desktop */}
        <div className={`hidden sm:block absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 rounded-full ${colors.badge} border-2 ${colors.border} z-10 shadow-sm`}></div>
      </div>
    );
  };

  // Get unique transportation modes used in the itinerary (for Overview only)
  const uniqueTransportModes = useMemo(() => {
    if (selectedDay !== "overview") return [];
    
    const modes = new Set<TravelMode>();
    allTransportSegments.forEach((item) => {
      if (item.segment.mode) {
        modes.add(item.segment.mode);
      }
    });
    
    return Array.from(modes)
      .map((mode) => getTravelModeConfig(mode))
      .filter((config): config is NonNullable<typeof config> => config !== undefined);
  }, [selectedDay, allTransportSegments]);


  if (allTransportSegments.length === 0) {
    return (
      <div className="bg-[var(--category-card,#111827)] rounded-lg p-3 sm:p-4 md:p-6 border border-[var(--category-control-border,#374151)]">
        <h2 className="text-[var(--category-text,#FFFFFF)] text-base sm:text-lg md:text-xl font-poppins font-bold mb-1 sm:mb-2">
          Transportation
        </h2>
        <p className="text-[var(--category-muted,#9CA3AF)] text-xs sm:text-sm font-poppins">
          No transportation information available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Overview Section - Day-wise Timeline */}
      {selectedDay === "overview" && (
        <div className="space-y-6 sm:space-y-8">
          {/* Transportation Mode Icons - Enhanced design */}
          {uniqueTransportModes.length > 0 && (
            <div className="flex justify-center">
              <div className="bg-gradient-to-br from-[var(--category-card,rgba(17,24,39,0.95))] to-[var(--category-card,rgba(31,41,55,0.95))] rounded-2xl border border-[var(--category-control-border,rgba(55,65,81,0.6))] px-2 py-2.5 sm:px-8 sm:py-4 md:px-6 md:py-4 w-full md:max-w-fit md:w-auto shadow-xl backdrop-blur-sm">
                <h3 className="text-[var(--category-text,#FFFFFF)] font-poppins font-bold text-xs sm:text-sm md:text-base mb-2 sm:mb-3.5 text-center tracking-wide">
                  Transportation Modes
                </h3>
                <div className="flex flex-nowrap items-center justify-center gap-1 sm:gap-4 md:gap-5">
                  {uniqueTransportModes.map((modeConfig) => (
                    <div
                      key={modeConfig.mode}
                      className="flex flex-col items-center gap-1 sm:gap-1.5 group flex-shrink-0 w-[60px] sm:w-auto"
                    >
                    <div className="relative w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 rounded-full bg-gradient-to-br from-blue-500/30 to-indigo-500/30 border-2 border-[var(--category-control-border,rgba(96,165,250,0.5))] flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:border-[var(--category-control-border,#60A5FA)] group-hover:shadow-xl group-hover:shadow-blue-500/40 overflow-hidden ring-2 ring-blue-500/20 mx-auto">
                      <div className="text-[var(--category-accent,#60A5FA)] group-hover:text-blue-300 transition-colors duration-300 flex items-center justify-center w-full h-full p-1">
                        <div className="w-full h-full max-w-[14px] max-h-[14px] sm:max-w-[20px] sm:max-h-[20px] md:max-w-[24px] md:max-h-[24px] flex items-center justify-center flex-shrink-0 [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:object-contain">
                          {modeConfig.icon}
                        </div>
                      </div>
                    </div>
                      <span className="text-[var(--category-muted,#D1D5DB)] text-[8px] sm:text-[10px] md:text-[11px] font-poppins font-semibold text-center leading-tight sm:whitespace-nowrap max-w-[55px] sm:max-w-none whitespace-normal block w-full">
                        {modeConfig.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Day-wise Transportation Timeline */}
          {sectionsWithTimeline.map(({ section, timeline, transportSegments, dayNum }) => {
            const morningPlaces = timeline.morning || [];
            const afternoonPlaces = timeline.afternoon || [];
            const eveningPlaces = timeline.evening || [];
            const hasRoutes = transportSegments.length > 0;

            if (!hasRoutes) return null;

            return (
              <div key={section.documentId || dayNum} className="space-y-5 sm:space-y-6">
                {/* Day Heading - Standard Typography (Matching Journey Tab) */}
                <div className="flex items-center gap-3 pb-2 border-b border-[var(--category-control-border,rgba(55,65,81,0.5))]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-1 h-8 sm:h-10 bg-gradient-to-b from-[var(--category-accent,hsl(var(--blue-cta)))] to-[var(--category-accent,hsl(var(--blue-final)))] rounded-full"></div>
                    <h2 className="text-[var(--category-text,#FFFFFF)] font-poppins font-bold text-xl sm:text-2xl md:text-3xl tracking-tight" style={{
                      textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                      textRendering: 'optimizeLegibility',
                      WebkitFontSmoothing: 'antialiased',
                      MozOsxFontSmoothing: 'grayscale'
                    }}>
                      <span className="bg-gradient-to-r from-[var(--category-text,hsl(var(--blue-cta)))] via-[var(--category-text,hsl(var(--blue-cta)))] to-[var(--category-text,hsl(var(--blue-final)))] bg-clip-text text-transparent">
                        Day {dayNum}
                      </span>
                      {section.Title && (
                        <span className="text-[var(--category-text,#FFFFFF)] font-semibold ml-2.5 text-base sm:text-lg md:text-xl tracking-normal" style={{
                          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                          textRendering: 'optimizeLegibility',
                          WebkitFontSmoothing: 'antialiased',
                          MozOsxFontSmoothing: 'grayscale',
                          letterSpacing: '0.01em'
                        }}>
                          {section.Title}
                        </span>
                      )}
                    </h2>
                  </div>
                </div>

            {/* Transportation Routes by Period - Timeline Style */}
            <div className="relative">
              {/* Calculate total routes for timeline height */}
              {(() => {
                const totalRoutes = 
                  (morningPlaces.length > 1 ? morningPlaces.length - 1 : 0) +
                  (afternoonPlaces.length > 1 ? afternoonPlaces.length - 1 : 0) +
                  (eveningPlaces.length > 1 ? eveningPlaces.length - 1 : 0);
                const hasRoutes = totalRoutes > 0;
                
                return hasRoutes ? (
                  <div 
                    className="hidden sm:block absolute left-1/2 w-0.5 -translate-x-1/2 bg-gradient-to-b from-[hsl(var(--blue-cta))]/40 via-[hsl(var(--blue-cta))]/60 to-[hsl(var(--blue-cta))]/40"
                    style={{ 
                      top: '0',
                      bottom: '0',
                    }}
                  ></div>
                ) : null;
              })()}

              <div className="space-y-3 sm:space-y-3 md:space-y-4">
                {/* Morning Routes - Left Side */}
                {morningPlaces.length > 1 && (
                  <>
                    {morningPlaces.slice(0, -1).map((place: any, index: number) => {
                      const nextPlace = morningPlaces[index + 1];
                      const segment = transportSegments.find(
                        (seg: any) =>
                          seg.fromPlaceId === place.place_id &&
                          seg.toPlaceId === nextPlace.place_id
                      );
                      const isLast = index === morningPlaces.length - 2 && afternoonPlaces.length <= 1 && eveningPlaces.length <= 1;
                      const isFirst = index === 0;
                      return renderRoute(place, nextPlace, segment, "amber", "left", isLast, isFirst, "Morning Routes");
                    })}
                  </>
                )}

                {/* Afternoon Routes - Right Side */}
                {afternoonPlaces.length > 1 && (
                  <>
                    {afternoonPlaces.slice(0, -1).map((place: any, index: number) => {
                      const nextPlace = afternoonPlaces[index + 1];
                      const segment = transportSegments.find(
                        (seg: any) =>
                          seg.fromPlaceId === place.place_id &&
                          seg.toPlaceId === nextPlace.place_id
                      );
                      const isLast = index === afternoonPlaces.length - 2 && eveningPlaces.length <= 1;
                      const isFirst = index === 0;
                      return renderRoute(place, nextPlace, segment, "sky", "right", isLast, isFirst, "Afternoon Routes");
                    })}
                  </>
                )}

                {/* Evening Routes - Left Side */}
                {eveningPlaces.length > 1 && (
                  <>
                    {eveningPlaces.slice(0, -1).map((place: any, index: number) => {
                      const nextPlace = eveningPlaces[index + 1];
                      const segment = transportSegments.find(
                        (seg: any) =>
                          seg.fromPlaceId === place.place_id &&
                          seg.toPlaceId === nextPlace.place_id
                      );
                      const isLast = index === eveningPlaces.length - 2;
                      const isFirst = index === 0;
                      return renderRoute(place, nextPlace, segment, "indigo", "left", isLast, isFirst, "Evening Routes");
                    })}
                  </>
                )}
              </div>
            </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Individual Day Tabs - Graphical Timeline Display */}
      {selectedDay !== "overview" && (() => {
        // Find the selected day's section
        const selectedDayNum = parseInt(selectedDay.replace("day-", ""));
        const selectedSection = sectionsWithTimeline.find(
          ({ dayNum }) => dayNum === selectedDayNum
        );

        if (!selectedSection) {
          return (
            <div className="bg-[var(--category-card,#111827)] rounded-lg p-3 sm:p-4 md:p-6 border border-[var(--category-control-border,#374151)]">
              <p className="text-[var(--category-muted,#9CA3AF)] text-xs sm:text-sm font-poppins">
                No transportation information available for this day.
              </p>
            </div>
          );
        }

        const { section, timeline, transportSegments, dayNum } = selectedSection;
        const morningPlaces = timeline.morning || [];
        const afternoonPlaces = timeline.afternoon || [];
        const eveningPlaces = timeline.evening || [];
        const hasRoutes = transportSegments.length > 0;

        if (!hasRoutes) {
          return (
            <div className="bg-[var(--category-card,#111827)] rounded-lg p-3 sm:p-4 md:p-6 border border-[var(--category-control-border,#374151)]">
              <p className="text-[var(--category-muted,#9CA3AF)] text-xs sm:text-sm font-poppins">
                No transportation information available for this day.
              </p>
            </div>
          );
        }

        return (
          <div className="space-y-6 sm:space-y-8">
            {/* Day Heading - Standard Typography (Matching Journey Tab) */}
            <div className="flex items-center gap-3 pb-2 border-b border-[var(--category-control-border,rgba(55,65,81,0.5))]">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-8 sm:h-10 bg-gradient-to-b from-[var(--category-accent,hsl(var(--blue-cta)))] to-[var(--category-accent,hsl(var(--blue-final)))] rounded-full"></div>
                <h2 className="text-[var(--category-text,#FFFFFF)] font-poppins font-bold text-xl sm:text-2xl md:text-3xl tracking-tight" style={{
                  textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  textRendering: 'optimizeLegibility',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale'
                }}>
                  <span className="bg-gradient-to-r from-[var(--category-text,hsl(var(--blue-cta)))] via-[var(--category-text,hsl(var(--blue-cta)))] to-[var(--category-text,hsl(var(--blue-final)))] bg-clip-text text-transparent">
                    Day {dayNum}
                  </span>
                  {section.Title && (
                    <span className="text-[var(--category-text,#FFFFFF)] font-semibold ml-2.5 text-base sm:text-lg md:text-xl tracking-normal" style={{
                      textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                      textRendering: 'optimizeLegibility',
                      WebkitFontSmoothing: 'antialiased',
                      MozOsxFontSmoothing: 'grayscale',
                      letterSpacing: '0.01em'
                    }}>
                      {section.Title}
                    </span>
                  )}
                </h2>
              </div>
            </div>

            {/* Transportation Routes by Period - Timeline Style */}
            <div className="relative">
              {/* Calculate total routes for timeline height */}
              {(() => {
                const totalRoutes = 
                  (morningPlaces.length > 1 ? morningPlaces.length - 1 : 0) +
                  (afternoonPlaces.length > 1 ? afternoonPlaces.length - 1 : 0) +
                  (eveningPlaces.length > 1 ? eveningPlaces.length - 1 : 0);
                const hasRoutes = totalRoutes > 0;
                
                return hasRoutes ? (
                  <div 
                    className="hidden sm:block absolute left-1/2 w-0.5 -translate-x-1/2 bg-gradient-to-b from-[hsl(var(--blue-cta))]/40 via-[hsl(var(--blue-cta))]/60 to-[hsl(var(--blue-cta))]/40"
                    style={{ 
                      top: '0',
                      bottom: '0',
                    }}
                  ></div>
                ) : null;
              })()}

              <div className="space-y-3 sm:space-y-3 md:space-y-4">
                {/* Morning Routes - Left Side */}
                {morningPlaces.length > 1 && (
                  <>
                    {morningPlaces.slice(0, -1).map((place: any, index: number) => {
                      const nextPlace = morningPlaces[index + 1];
                      const segment = transportSegments.find(
                        (seg: any) =>
                          seg.fromPlaceId === place.place_id &&
                          seg.toPlaceId === nextPlace.place_id
                      );
                      const isLast = index === morningPlaces.length - 2 && afternoonPlaces.length <= 1 && eveningPlaces.length <= 1;
                      const isFirst = index === 0;
                      return renderRoute(place, nextPlace, segment, "amber", "left", isLast, isFirst, "Morning Routes");
                    })}
                  </>
                )}

                {/* Afternoon Routes - Right Side */}
                {afternoonPlaces.length > 1 && (
                  <>
                    {afternoonPlaces.slice(0, -1).map((place: any, index: number) => {
                      const nextPlace = afternoonPlaces[index + 1];
                      const segment = transportSegments.find(
                        (seg: any) =>
                          seg.fromPlaceId === place.place_id &&
                          seg.toPlaceId === nextPlace.place_id
                      );
                      const isLast = index === afternoonPlaces.length - 2 && eveningPlaces.length <= 1;
                      const isFirst = index === 0;
                      return renderRoute(place, nextPlace, segment, "sky", "right", isLast, isFirst, "Afternoon Routes");
                    })}
                  </>
                )}

                {/* Evening Routes - Left Side */}
                {eveningPlaces.length > 1 && (
                  <>
                    {eveningPlaces.slice(0, -1).map((place: any, index: number) => {
                      const nextPlace = eveningPlaces[index + 1];
                      const segment = transportSegments.find(
                        (seg: any) =>
                          seg.fromPlaceId === place.place_id &&
                          seg.toPlaceId === nextPlace.place_id
                      );
                      const isLast = index === eveningPlaces.length - 2;
                      const isFirst = index === 0;
                      return renderRoute(place, nextPlace, segment, "indigo", "left", isLast, isFirst, "Evening Routes");
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
});

PublicGuideTransportView.displayName = "PublicGuideTransportView";

export default PublicGuideTransportView;

