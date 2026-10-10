import { selectGuidePlaceThumbnail } from "../../utils/publicGuidePhotoViewModel";
import { memo, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseTimeline } from "../../../Guides/utils/guideDataParser";
import { getTransportSegments } from "../../../Guides/utils/guideHelpers";
import { getTravelModeConfig } from "../../../Guides/utils/travelModeConfig";
import DayDetailModal from "./DayDetailModal";
import PlaceOverview from "../PlaceDetails/PlaceOverview";
import GooglePlaceModal from "./GooglePlaceModal";
import TransportationIcon from "../../../../assets/icons/TransportationIcon";
import { usePublicCategoryThemeStyles } from "../PublicCategoryThemeContext";
import { guideDescriptionText } from "../../../../utils/guideDescriptionText";

interface DayNavigationViewProps {
  sections: any[];
  guide: any;
  selectedDay?: string;
}

const DayNavigationView = memo(({ sections, guide, selectedDay: externalSelectedDay }: DayNavigationViewProps) => {
  const selectedDay = externalSelectedDay !== undefined ? externalSelectedDay : "overview";
  const [selectedDayForModal, setSelectedDayForModal] = useState<any>(null);
  const [selectedPlace, setSelectedPlace] = useState<{ visible: boolean; placeId: string | null }>({
    visible: false,
    placeId: null,
  });
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<{ visible: boolean; place: any | null }>({
    visible: false,
    place: null,
  });
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const categoryStyles = usePublicCategoryThemeStyles();

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

  // Get all sections with timeline data
  const daysWithData = useMemo(() => {
    return sections
      .filter((section) => {
        const timeline = parseTimeline(section.Timeline);
        const hasPlaces =
          (timeline.morning?.length || 0) +
          (timeline.afternoon?.length || 0) +
          (timeline.evening?.length || 0) >
          0;
        return hasPlaces || section.Description;
      })
      .sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0));
  }, [sections]);

  // Get city/country location for a day section
  const getDayLocation = (day: any): string | null => {
    let placeDetails: any = null;
    if (guide?.Place_Details) {
      try {
        placeDetails = typeof guide.Place_Details === "string"
          ? JSON.parse(guide.Place_Details)
          : guide.Place_Details;
      } catch {
        placeDetails = null;
      }
    }

    if (!placeDetails) return null;

    // Store main location as fallback
    const mainLocation = placeDetails.Place_Name || placeDetails.Place_Address || null;

    // For multi-city guides, MUST check Map_Details for section location
    if (placeDetails.isMultiCity === true) {
      // Try to get location from Map_Details - this is the source of truth
      if (day.Map_Details) {
        try {
          let mapDetails = day.Map_Details;

          // Parse if it's a string
          if (typeof day.Map_Details === "string") {
            mapDetails = JSON.parse(day.Map_Details);
          }

          // Get location value from Map_Details
          const locationValue = mapDetails?.location;

          if (locationValue) {
            // Check for ending/arrival
            if (locationValue === "ending" || locationValue === "arrival" || locationValue === "to") {
              const ending = placeDetails.ending || placeDetails.arrival || placeDetails.to;
              if (ending?.Place_Name || ending?.Place_Address) {
                return ending.Place_Name || ending.Place_Address;
              }
            }

            // Check for starting/departure
            if (locationValue === "starting" || locationValue === "departure" || locationValue === "from") {
              const starting = placeDetails.starting || placeDetails.departure || placeDetails.from;
              if (starting?.Place_Name || starting?.Place_Address) {
                return starting.Place_Name || starting.Place_Address;
              }
            }

            // Check for intermediate cities - handle both "intermediate-0" and "intermediate-1" formats
            if (locationValue?.startsWith("intermediate-")) {
              const indexStr = locationValue.replace("intermediate-", "");
              const index = parseInt(indexStr);

              if (!isNaN(index)) {
                const intermediateCities = placeDetails.intermediateCities || [];
                // Try by index first
                if (intermediateCities[index]) {
                  const city = intermediateCities[index];
                  if (city?.Place_Name || city?.Place_Address) {
                    return city.Place_Name || city.Place_Address;
                  }
                }
                // Also try by id if index doesn't work
                const cityById = intermediateCities.find((c: any) => c.id === indexStr || c.id === index);
                if (cityById?.Place_Name || cityById?.Place_Address) {
                  return cityById.Place_Name || cityById.Place_Address;
                }
              }
            }
          }
        } catch (error) {
          // If parsing fails, log for debugging but don't use fallback
          console.warn("Error parsing Map_Details for day:", day.Sequence, error, day.Map_Details);
        }
      }

      // For multi-city guides, if Map_Details doesn't exist or location not found,
      // return null instead of guessing - the location should be in Map_Details
      return null;
    }

    // For single-city guides, use main location
    return mainLocation;
  };

  // Get guide description
  const guideDescription = useMemo(
    () => guideDescriptionText(guide?.Description) || null,
    [guide?.Description],
  );


  const getPlaceImage = (place: unknown): string => selectGuidePlaceThumbnail(place, sections)?.url ?? "https://placehold.co/400x400";

  // Filter days based on selected tab
  const displayedDays = useMemo(() => {
    if (selectedDay === "overview") {
      return daysWithData;
    }
    const dayNumber = parseInt(selectedDay.replace("day-", ""));
    return daysWithData.filter((day) => (day.Sequence || 0) === dayNumber);
  }, [selectedDay, daysWithData]);

  if (daysWithData.length === 0) {
    return (
      <div className="bg-[var(--category-card,#111827)] rounded-lg p-3 sm:p-4 md:p-6 border border-[var(--category-control-border,#374151)]">
        <h2 className="text-[var(--category-text,#FFFFFF)] text-base sm:text-lg md:text-xl font-poppins font-bold mb-1 sm:mb-2">
          Journey
        </h2>
        <p className="text-[var(--category-muted,#9CA3AF)] text-xs sm:text-sm font-poppins">
          No journey information available yet.
        </p>
      </div>
    );
  }


  return (
    <div className="space-y-6 sm:space-y-8">

      {/* Overview Tab Content - Enhanced UI */}
      {selectedDay === "overview" && (
        <div className="space-y-10 sm:space-y-12 md:space-y-14">
          {/* Guide Description - Premium Card */}
          {guideDescription && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative bg-gradient-to-br from-[var(--category-card,rgba(17,24,39,0.98))] via-[var(--category-card,rgba(31,41,55,0.95))] to-[var(--category-card,rgba(17,24,39,0.98))] rounded-2xl p-6 sm:p-8 md:p-10 border border-[var(--category-control-border,rgba(55,65,81,0.8))] backdrop-blur-md shadow-2xl overflow-hidden group hover:border-[hsl(var(--blue-cta))]/40 transition-all duration-300"
            >
              {/* Decorative gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--blue-cta))]/5 via-transparent to-[hsl(var(--blue-final))]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

              {/* Content */}
              <div className="relative z-10">
                <div className="flex items-center gap-3 pb-2 border-b border-[var(--category-control-border,rgba(55,65,81,0.5))] mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-1 h-8 sm:h-10 bg-gradient-to-b from-[var(--category-accent,hsl(var(--blue-cta)))] to-[var(--category-accent,hsl(var(--blue-final)))] rounded-full"></div>
                    <h3 className="text-[var(--category-text,#FFFFFF)] font-poppins font-bold text-xl sm:text-2xl md:text-3xl tracking-tight" style={{
                      textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                      textRendering: 'optimizeLegibility',
                      WebkitFontSmoothing: 'antialiased',
                      MozOsxFontSmoothing: 'grayscale'
                    }}>
                      <span className="bg-gradient-to-r from-[var(--category-text,hsl(var(--blue-cta)))] via-[var(--category-text,hsl(var(--blue-cta)))] to-[var(--category-text,hsl(var(--blue-final)))] bg-clip-text text-transparent">
                        About This Journey
                      </span>
                    </h3>
                  </div>
                </div>
                <div className="relative">
                  <p
                    className={`text-[var(--category-muted,#D1D5DB)] font-poppins text-sm sm:text-base md:text-lg font-normal leading-relaxed transition-all duration-300 ${!isDescriptionExpanded ? 'line-clamp-3' : ''
                      }`}
                    style={{
                      textRendering: 'optimizeLegibility',
                      WebkitFontSmoothing: 'antialiased',
                      MozOsxFontSmoothing: 'grayscale'
                    }}
                  >
                    {guideDescription}
                  </p>
                  {/* Read More/Less Button - Only show if description is long enough */}
                  {guideDescription && guideDescription.length > 300 && (
                    <button
                      onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                      className={`mt-3 text-[var(--category-text,hsl(var(--blue-cta)))] hover:text-[var(--category-text,hsl(var(--blue-final)))] font-medium text-sm sm:text-base transition-colors duration-200 flex items-center gap-1.5 group ${categoryStyles ? "focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-[var(--category-focus)] focus-visible:!transform-none" : ""}`}
                    >
                      <span>{isDescriptionExpanded ? 'Read Less' : 'Read More'}</span>
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${isDescriptionExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Day-wise Sections - Enhanced Layout */}
          {daysWithData.map((day, idx) => {
            const dayNum = day.Sequence || idx + 1;
            const timeline = parseTimeline(day.Timeline);
            const allPlaces = [
              ...(timeline.morning || []),
              ...(timeline.afternoon || []),
              ...(timeline.evening || []),
            ];

            if (allPlaces.length === 0) return null;

            return (
              <motion.div
                key={day.documentId || `day-${dayNum}`}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1, ease: "easeOut" }}
                className="space-y-6 sm:space-y-7 md:space-y-9"
              >
                {/* Day Heading - Standard Typography (Matching Transport Tab) */}
                <div className="flex items-center gap-3 pb-2 border-b border-[var(--category-control-border,rgba(55,65,81,0.5))]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-1 h-8 sm:h-10 bg-gradient-to-b from-[var(--category-accent,hsl(var(--blue-cta)))] to-[var(--category-accent,hsl(var(--blue-final)))] rounded-full"></div>
                    <h2 className="text-[var(--category-text,#FFFFFF)] font-poppins font-bold text-xl sm:text-2xl md:text-3xl tracking-tight" style={{
                      textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                      textRendering: 'optimizeLegibility',
                      WebkitFontSmoothing: 'antialiased',
                      MozOsxFontSmoothing: 'grayscale'
                    }}>
                      <span className="text-[var(--category-text,hsl(var(--blue-cta)))]">
                        Day {dayNum}
                      </span>
                      {day.Title && (() => {
                        const cleanedTitle = cleanTitle(day.Title, dayNum);
                        return cleanedTitle ? (
                          <>
                            <span className="text-[var(--category-muted,rgba(156,163,175,0.6))] mx-2">|</span>
                            <span className="text-[var(--category-text,#FFFFFF)] font-semibold text-base sm:text-lg md:text-xl tracking-normal" style={{
                              textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                              textRendering: 'optimizeLegibility',
                              WebkitFontSmoothing: 'antialiased',
                              MozOsxFontSmoothing: 'grayscale',
                              letterSpacing: '0.01em'
                            }}>
                              {cleanedTitle}
                            </span>
                          </>
                        ) : null;
                      })()}
                    </h2>
                  </div>
                </div>

                {/* Place Cards Grid - Enhanced */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                  {allPlaces.map((place: any, placeIndex: number) => {
                    const placeImage = getPlaceImage(place);
                    const badgeLabel = `${dayNum}.${placeIndex + 1}`;

                    return (
                      <motion.div
                        key={place.place_id || `place-${placeIndex}`}
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: placeIndex * 0.06, ease: "easeOut" }}
                        whileHover={{ scale: 1.03, y: -4 }}
                        className="relative group"
                      >
                        {/* Place Card - Standard Large Travel Card (Same as Individual Days) */}
                        <motion.div
                          initial={{ opacity: 0, y: 30 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: placeIndex * 0.1 }}
                          whileHover={{ scale: 1.02 }}
                          className="relative group cursor-pointer w-full aspect-square max-w-[200px] md:max-w-md lg:max-w-lg mx-auto"
                          onClick={() => {
                            // Open Google Place modal for this specific place
                            setSelectedGooglePlace({ visible: true, place });
                          }}
                        >
                          <div className="relative bg-gradient-to-br from-[var(--category-card,rgba(17,24,39,0.95))] to-[var(--category-card,rgba(31,41,55,0.95))] rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 border border-gray-700/50 hover:border-[hsl(var(--blue-cta))]/50">
                            {/* Enhanced Index Badge - Exact top-left corner, fully rounded to match card */}
                            <div className="absolute top-2 left-2 z-10 bg-black/40 backdrop-blur-sm text-white px-1.5 py-0.5 rounded-2xl text-[10px] font-poppins font-bold shadow-md border border-white/20">
                              {badgeLabel}
                            </div>
                            {/* Standard Large Image Height - Smaller on desktop for overview */}
                            <div className="relative w-full aspect-square md:h-56 lg:h-64 overflow-hidden">
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
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Individual Day Tab Content - Premium Travel Timeline */}
      {selectedDay !== "overview" && (
        <div className="space-y-8 sm:space-y-10 md:space-y-12">
          <AnimatePresence mode="wait">
            {displayedDays.map((day, idx) => {
              const dayNum = day.Sequence || idx + 1;
              const timeline = parseTimeline(day.Timeline);
              const allPlaces = [
                ...(timeline.morning || []),
                ...(timeline.afternoon || []),
                ...(timeline.evening || []),
              ];
              const dayLocation = getDayLocation(day);
              const transportSegments = getTransportSegments(day);

              if (allPlaces.length === 0) {
                return (
                  <motion.div
                    key={day.documentId || `day-${dayNum}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="bg-[var(--category-card,#111827)] rounded-lg p-4 sm:p-6 border border-[var(--category-control-border,#374151)]"
                  >
                    <p className="text-[var(--category-muted,#9CA3AF)] font-poppins text-sm sm:text-base">
                      No places available for this day.
                    </p>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={day.documentId || `day-${dayNum}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                  className="relative"
                >
                  {/* Day Heading - Title and Location with Equal Prominence (Matching Transport Tab) */}
                  <div className="mb-20 sm:mb-24 md:mb-28">
                    <div className="flex items-center gap-3 pb-3 border-b border-[var(--category-control-border,rgba(55,65,81,0.5))] mb-4">
                      <div className="flex items-center gap-2.5 flex-1">
                        <div className="w-1 h-8 sm:h-10 bg-gradient-to-b from-[var(--category-accent,hsl(var(--blue-cta)))] to-[var(--category-accent,hsl(var(--blue-final)))] rounded-full flex-shrink-0"></div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-1">
                          {/* Location - Blue gradient color (First) */}
                          {dayLocation && (
                            <h2 className="text-[var(--category-text,#FFFFFF)] font-poppins font-bold text-xl sm:text-2xl md:text-3xl tracking-tight" style={{
                              textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                              textRendering: 'optimizeLegibility',
                              WebkitFontSmoothing: 'antialiased',
                              MozOsxFontSmoothing: 'grayscale'
                            }}>
                              <span className="bg-gradient-to-r from-[var(--category-text,hsl(var(--blue-cta)))] via-[var(--category-text,hsl(var(--blue-cta)))] to-[var(--category-text,hsl(var(--blue-final)))] bg-clip-text text-transparent">
                                {dayLocation}
                              </span>
                            </h2>
                          )}
                          {/* Day Title - Nice font style without blue (Second) - Matching Transport Tab */}
                          {day.Title && (
                            <div className="flex items-center gap-2">
                              {dayLocation && (
                                <span className="text-[var(--category-muted,#6B7280)] hidden sm:inline">•</span>
                              )}
                              <span className="text-[var(--category-text,#FFFFFF)] font-poppins font-semibold text-base sm:text-lg md:text-xl tracking-normal" style={{
                                textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                                textRendering: 'optimizeLegibility',
                                WebkitFontSmoothing: 'antialiased',
                                MozOsxFontSmoothing: 'grayscale',
                                letterSpacing: '0.01em'
                              }}>
                                {day.Title}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Premium Travel Timeline - Centered */}
                  <div className="relative flex justify-center">
                    {/* Vertical Timeline Line - Starts from top, ends at last card (Smaller length) */}
                    {allPlaces.length > 0 && (
                      <div
                        className="absolute left-1/2 w-0.5 -translate-x-1/2 bg-gradient-to-b from-[hsl(var(--blue-cta))]/40 via-[hsl(var(--blue-cta))]/60 to-[hsl(var(--blue-cta))]/40"
                        style={{
                          top: '0',
                          bottom: '6rem',
                        }}
                      ></div>
                    )}

                    {/* Timeline Items - Perfect Spacing */}
                    <div className="space-y-20 sm:space-y-24 md:space-y-28 w-full max-w-md md:max-w-lg lg:max-w-xl">
                      {allPlaces.map((place: any, placeIndex: number) => {
                        const placeImage = getPlaceImage(place);
                        const placeNumber = placeIndex + 1;
                        const isLastPlace = placeIndex === allPlaces.length - 1;

                        // Get transport info FROM previous place TO current place
                        const prevPlace = placeIndex > 0 ? allPlaces[placeIndex - 1] : null;
                        const transportInfo = prevPlace
                          ? transportSegments.find(
                            (seg) =>
                              seg.fromPlaceId === prevPlace.place_id &&
                              seg.toPlaceId === place.place_id
                          )
                          : null;

                        // Get travel mode config for dynamic icon
                        const modeConfig = transportInfo ? getTravelModeConfig(transportInfo.mode) : null;

                        return (
                          <div key={place.place_id || `place-${placeIndex}`} className={`relative ${isLastPlace ? 'pb-0' : 'pb-16 sm:pb-20 md:pb-24'}`}>
                            {/* Travel Info Above Numbered Circle (for places after first) - Shifted More Upward */}
                            {transportInfo && placeIndex > 0 && (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: placeIndex * 0.1 }}
                                className="absolute left-1/2 -translate-x-1/2 -top-32 sm:-top-36 md:-top-40 z-10 flex items-center gap-3 sm:gap-4"
                              >
                                {/* Left Side - Distance */}
                                <div className="flex items-center gap-1 sm:gap-1.5 text-[var(--category-muted,#D1D5DB)] font-poppins text-xs sm:text-sm">
                                  <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 text-[var(--category-accent,hsl(var(--blue-cta)))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                  {transportInfo.distanceKm !== null && (
                                    <span className="whitespace-nowrap">{transportInfo.distanceKm.toFixed(1)} km</span>
                                  )}
                                </div>

                                {/* Center - Dynamic Transport Icon */}
                                <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[var(--category-accent,hsl(var(--blue-cta)))]/20 flex items-center justify-center border border-[hsl(var(--blue-cta))]/40">
                                  {modeConfig?.icon ? (
                                    <div className="text-[var(--category-accent,hsl(var(--blue-cta)))] flex items-center justify-center w-full h-full">
                                      <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex items-center justify-center">
                                        {modeConfig.icon}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-center w-full h-full">
                                      <TransportationIcon size="3" color="hsl(var(--blue-cta))" />
                                    </div>
                                  )}
                                </div>

                                {/* Right Side - Time */}
                                <div className="flex items-center gap-1 sm:gap-1.5 text-[var(--category-muted,#D1D5DB)] font-poppins text-xs sm:text-sm">
                                  <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 text-[var(--category-accent,hsl(var(--blue-cta)))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span className="whitespace-nowrap">{transportInfo.estimatedMinutes} min</span>
                                </div>
                              </motion.div>
                            )}

                            {/* Small Straight Line Before First Card - Extended to Touch First Card */}
                            {placeIndex === 0 && (
                              <div className="absolute left-1/2 w-0.5 -translate-x-1/2 -top-20 sm:-top-24 md:-top-28 h-20 sm:h-24 md:h-28 bg-gradient-to-b from-[hsl(var(--blue-cta))]/40 to-[hsl(var(--blue-cta))]/60 z-10"></div>
                            )}

                            {/* Numbered Circle - Centered on Timeline Line, Positioned to Not Overlap Card - First Circle Moved Down */}
                            <div className={`absolute left-1/2 -translate-x-1/2 z-20 ${placeIndex === 0 ? '-top-16 sm:-top-18 md:-top-20' : '-top-24 sm:-top-26 md:-top-28'}`}>
                              <div className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br from-[var(--category-accent,hsl(var(--blue-cta)))] to-[var(--category-accent,hsl(var(--blue-final)))] border-2 border-[var(--category-control-border,#111827)] shadow-xl flex items-center justify-center">
                                <span className="text-[var(--category-accent-ink,#FFFFFF)] text-sm sm:text-base md:text-lg font-poppins font-extrabold">
                                  {placeNumber}
                                </span>
                              </div>
                            </div>

                            {/* Place Card - Standard Large Travel Card */}
                            <motion.div
                              initial={{ opacity: 0, y: 30 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.5, delay: placeIndex * 0.1 }}
                              whileHover={{ scale: 1.02 }}
                              className="relative group cursor-pointer w-full aspect-square max-w-[200px] md:max-w-md lg:max-w-lg mx-auto"
                              onClick={() => {
                                // Open Google Place modal for this specific place
                                setSelectedGooglePlace({ visible: true, place });
                              }}
                            >
                              <div className="bg-gradient-to-br from-[var(--category-card,rgba(17,24,39,0.95))] to-[var(--category-card,rgba(31,41,55,0.95))] rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 border border-gray-700/50 hover:border-[hsl(var(--blue-cta))]/50">
                                {/* Standard Large Image Height */}
                                <div className="relative w-full aspect-square md:h-80 lg:h-96 overflow-hidden">
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
                                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 md:p-8">
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
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Day Detail Modal */}
      {selectedDayForModal && (
        <DayDetailModal
          day={selectedDayForModal}
          isOpen={!!selectedDayForModal}
          onClose={() => setSelectedDayForModal(null)}
        />
      )}

      {/* Place Overview Modal (for recommendations) */}
      {selectedPlace.visible && selectedPlace.placeId && (
        <>
          <div className="fixed inset-0 bg-black md:bg-opacity-40 md:backdrop-blur-md z-[150]"></div>
          <div
            className={`fixed md:max-w-4xl md:mx-auto inset-x-0 bottom-0 top-0 z-[150] transition-transform duration-300 ease-in-out overflow-x-hidden ${selectedPlace.visible ? "translate-y-0" : "translate-y-full"
              }`}
          >
            <PlaceOverview
              placeId={selectedPlace.placeId}
              onClose={() => setSelectedPlace({ visible: false, placeId: null })}
              isPublicProfile={true}
            />
          </div>
        </>
      )}

      {/* Google Place Modal (for guide places) */}
      {selectedGooglePlace.visible && selectedGooglePlace.place && (
        <>
          <div className="fixed inset-0 bg-black md:bg-opacity-40 md:backdrop-blur-md z-[150]"></div>
          <div
            className={`fixed md:max-w-4xl md:mx-auto inset-x-0 bottom-0 top-0 z-[150] transition-transform duration-300 ease-in-out overflow-x-hidden ${selectedGooglePlace.visible ? "translate-y-0" : "translate-y-full"
              }`}
          >
            <GooglePlaceModal
              place={selectedGooglePlace.place}
              isOpen={selectedGooglePlace.visible}
              onClose={() => setSelectedGooglePlace({ visible: false, place: null })}
              sections={sections}
            />
          </div>
        </>
      )}
    </div>
  );
});

DayNavigationView.displayName = "DayNavigationView";

export default DayNavigationView;
