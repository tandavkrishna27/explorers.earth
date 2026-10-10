import { selectGuidePlaceThumbnail } from "../../utils/publicGuidePhotoViewModel";
import { memo, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { parseStay } from "../../../Guides/utils/guideDataParser";
import GooglePlaceModal from "./GooglePlaceModal";

interface PublicGuideStayViewProps {
  guide: any;
  sections: any[];
  selectedDay?: string;
}

const PublicGuideStayView = memo(({ sections, guide: _guide, selectedDay: externalSelectedDay }: PublicGuideStayViewProps) => {
  const [internalSelectedDay] = useState<string>("overview");
  const selectedDay = externalSelectedDay !== undefined ? externalSelectedDay : internalSelectedDay;
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<{ visible: boolean; place: any | null }>({
    visible: false,
    place: null,
  });

  // Get all sections with stay data
  const daysWithStay = useMemo(() => {
    return sections
      .filter((section) => {
        if (!section.Stay) return false;
        const stayData = parseStay(section.Stay);
        const accoms = Array.isArray(stayData.accommodations)
          ? stayData.accommodations
          : [];
        return accoms.length > 0;
      })
      .sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0));
  }, [sections]);

  // Group accommodations by day
  const accommodationsByDay = useMemo(() => {
    const grouped: Record<string, Array<{
      sectionTitle: string;
      sectionSequence: number;
      accommodation: any;
    }>> = {};

    sections.forEach((section) => {
      if (!section.Stay) return;
      const stayData = parseStay(section.Stay);
      const accoms = Array.isArray(stayData.accommodations)
        ? stayData.accommodations
        : [];

      const sectionSequence = section.Sequence || 0;
      const dayId = `day-${sectionSequence}`;

      if (!grouped[dayId]) {
        grouped[dayId] = [];
      }

      accoms.forEach((accom) => {
        grouped[dayId].push({
          sectionTitle: section.Title || `Day ${sectionSequence}`,
          sectionSequence,
          accommodation: accom,
        });
      });
    });

    return grouped;
  }, [sections]);

  // Get all accommodations for Overview
  const allAccommodations = useMemo(() => {
    return Object.values(accommodationsByDay)
      .flat()
      .sort((a, b) => a.sectionSequence - b.sectionSequence);
  }, [accommodationsByDay]);

  // Get sections with stay data for Overview day-wise display
  const sectionsWithStay = useMemo(() => {
    return daysWithStay.map((section) => {
      const stayData = parseStay(section.Stay);
      const accoms = Array.isArray(stayData.accommodations)
        ? stayData.accommodations
        : [];
      return {
        section,
        accommodations: accoms,
        dayNum: section.Sequence || daysWithStay.indexOf(section) + 1,
      };
    });
  }, [daysWithStay]);

  const getPlaceImage = (place: unknown): string => selectGuidePlaceThumbnail(place, sections)?.url ?? "https://placehold.co/800x600/1a1a1a/666666?text=Accommodation";


  if (allAccommodations.length === 0) {
    return (
      <div className="bg-[var(--category-card,#111827)] rounded-lg p-3 sm:p-4 md:p-6 border border-[var(--category-control-border,#374151)]">
        <h2 className="text-[var(--category-text,#FFFFFF)] text-base sm:text-lg md:text-xl font-poppins font-bold mb-1 sm:mb-2">
          Stay
        </h2>
        <p className="text-[var(--category-muted,#9CA3AF)] text-xs sm:text-sm font-poppins">
          No accommodation information available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Overview Section - Day-wise Display */}
      {selectedDay === "overview" && (
        <div className="space-y-6 sm:space-y-8">
          {sectionsWithStay.map(({ section, accommodations, dayNum }, idx) => {
            if (accommodations.length === 0) return null;

            return (
              <motion.div
                key={section.documentId || dayNum}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1, ease: "easeOut" }}
                className="space-y-6 sm:space-y-7 md:space-y-9"
              >
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

                {/* Accommodation Cards - Same as Journey Tab */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 md:gap-7">
                  {accommodations.map((accom: any, placeIndex: number) => {
                    const placeImage = getPlaceImage(accom);

                    return (
                      <motion.div
                        key={accom.place_id || `accom-${placeIndex}`}
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: placeIndex * 0.06, ease: "easeOut" }}
                        whileHover={{ scale: 1.03, y: -4 }}
                        className="relative group"
                      >
                        {/* Place Card - Standard Large Travel Card (Same as Journey Tab) */}
                        <motion.div
                          initial={{ opacity: 0, y: 30 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: placeIndex * 0.1 }}
                          whileHover={{ scale: 1.02 }}
                          className="relative group cursor-pointer w-full aspect-square max-w-[200px] md:max-w-md lg:max-w-lg mx-auto"
                          onClick={() => {
                            // Open Google Place modal for this specific place
                            setSelectedGooglePlace({ visible: true, place: accom });
                          }}
                        >
                          <div className="relative bg-gradient-to-br from-[var(--category-card,rgba(17,24,39,0.95))] to-[var(--category-card,rgba(31,41,55,0.95))] rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 border border-[var(--category-control-border,rgba(55,65,81,0.5))] hover:border-[hsl(var(--blue-cta))]/50">
                            {/* Standard Large Image Height - Smaller on desktop for overview */}
                            <div className="relative w-full aspect-square md:h-56 lg:h-64 overflow-hidden">
                              <img
                                src={placeImage}
                                alt={accom.name || "Accommodation"}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                onError={(e) => {
                                  e.currentTarget.src = "https://placehold.co/800x600/1a1a1a/666666?text=Accommodation";
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
                                  {accom.name || accom.formatted_address || "Accommodation"}
                                </h3>
                                {(accom.rating || accom.user_ratings_total) && (
                                  <div className="flex items-center gap-2">
                                    {accom.rating && (
                                      <div className="flex items-center gap-1">
                                        <span className="text-yellow-400 text-sm sm:text-base">★</span>
                                        <span className="text-white font-poppins font-semibold text-sm sm:text-base">
                                          {accom.rating.toFixed(1)}
                                        </span>
                                      </div>
                                    )}
                                    {accom.user_ratings_total && (
                                      <span className="text-gray-300 font-poppins text-xs sm:text-sm">
                                        ({accom.user_ratings_total > 999 ? `${Math.floor(accom.user_ratings_total / 1000)}k` : accom.user_ratings_total})
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

      {/* Individual Day Tabs */}
      {selectedDay !== "overview" && (() => {
        const selectedDayNum = parseInt(selectedDay.replace("day-", ""));
        const selectedSection = sectionsWithStay.find(
          ({ dayNum }) => dayNum === selectedDayNum
        );

        if (!selectedSection || selectedSection.accommodations.length === 0) {
          return (
            <div className="bg-[var(--category-card,#111827)] rounded-lg p-3 sm:p-4 md:p-6 border border-[var(--category-control-border,#374151)]">
              <p className="text-[var(--category-muted,#9CA3AF)] text-xs sm:text-sm font-poppins">
                No accommodation information available for this day.
              </p>
            </div>
          );
        }

        const { section, accommodations, dayNum } = selectedSection;

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

            {/* Accommodation Cards - Same as Journey Tab */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 md:gap-7">
              {accommodations.map((accom: any, placeIndex: number) => {
                const placeImage = getPlaceImage(accom);

                return (
                  <motion.div
                    key={accom.place_id || `accom-${placeIndex}`}
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: placeIndex * 0.06, ease: "easeOut" }}
                    whileHover={{ scale: 1.03, y: -4 }}
                    className="relative group flex justify-center"
                  >
                    {/* Place Card - Standard Large Travel Card (Same as Journey Tab) */}
                    <motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: placeIndex * 0.1 }}
                      whileHover={{ scale: 1.02 }}
                      className="relative group cursor-pointer w-full aspect-square max-w-[200px] md:max-w-md lg:max-w-lg mx-auto"
                      onClick={() => {
                        // Open Google Place modal for this specific place
                        setSelectedGooglePlace({ visible: true, place: accom });
                      }}
                    >
                      <div className="relative bg-gradient-to-br from-[var(--category-card,rgba(17,24,39,0.95))] to-[var(--category-card,rgba(31,41,55,0.95))] rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 border border-[var(--category-control-border,rgba(55,65,81,0.5))] hover:border-[hsl(var(--blue-cta))]/50">
                        {/* Standard Large Image Height - Smaller on desktop for overview */}
                        <div className="relative w-full aspect-square md:h-56 lg:h-64 overflow-hidden">
                          <img
                            src={placeImage}
                            alt={accom.name || "Accommodation"}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            onError={(e) => {
                              e.currentTarget.src = "https://placehold.co/800x600/1a1a1a/666666?text=Accommodation";
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
                              {accom.name || accom.formatted_address || "Accommodation"}
                            </h3>
                            {(accom.rating || accom.user_ratings_total) && (
                              <div className="flex items-center gap-2">
                                {accom.rating && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-yellow-400 text-sm sm:text-base">★</span>
                                    <span className="text-white font-poppins font-semibold text-sm sm:text-base">
                                      {accom.rating.toFixed(1)}
                                    </span>
                                  </div>
                                )}
                                {accom.user_ratings_total && (
                                  <span className="text-gray-300 font-poppins text-xs sm:text-sm">
                                    ({accom.user_ratings_total > 999 ? `${Math.floor(accom.user_ratings_total / 1000)}k` : accom.user_ratings_total})
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
          </div>
        );
      })()}

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

PublicGuideStayView.displayName = "PublicGuideStayView";

export default PublicGuideStayView;
