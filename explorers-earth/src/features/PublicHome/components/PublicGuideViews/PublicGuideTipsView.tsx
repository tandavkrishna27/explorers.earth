import { memo, useMemo, useState } from "react";
import { parseTimeline } from "../../../Guides/utils/guideDataParser";
import TipsIcon from "../../../../assets/icons/TipsIcon";
import { usePublicCategoryThemeStyles } from "../PublicCategoryThemeContext";

interface PublicGuideTipsViewProps {
  guide: any;
  sections: any[];
  selectedDay?: string;
}

const PublicGuideTipsView = memo(({ guide, sections, selectedDay: externalSelectedDay }: PublicGuideTipsViewProps) => {
  const [internalSelectedDay] = useState<string>("overview");
  const selectedDay = externalSelectedDay !== undefined ? externalSelectedDay : internalSelectedDay;
  const [isMasterTipsExpanded, setIsMasterTipsExpanded] = useState<boolean>(false);
  const [expandedTips, setExpandedTips] = useState<Set<string>>(new Set());
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

  // Get all tips items grouped by section
  const sectionGroups = useMemo(() => {
    const groups: Array<{
      sectionId: string;
      sectionTitle: string;
      sectionSequence: number;
      tipPlaces: Array<{
        placeName: string;
        tip: string;
      }>;
    }> = [];

    sections.forEach((section) => {
      const timeline = parseTimeline(section.Timeline);
      const allPlaces = [
        ...(timeline.morning || []),
        ...(timeline.afternoon || []),
        ...(timeline.evening || []),
      ];

      const tipPlaces = allPlaces
        .filter((place) => place && typeof place.tips === "string" && place.tips.trim().length > 0)
        .map((place) => ({
          placeName: place.name || "",
          tip: place.tips!.trim(),
        }));

      if (tipPlaces.length > 0) {
        groups.push({
          sectionId: section.documentId || `section-${section.Sequence}`,
          sectionTitle: section.Title || `Day ${section.Sequence || 1}`,
          sectionSequence: section.Sequence || 0,
          tipPlaces,
        });
      }
    });

    return groups.sort((a, b) => a.sectionSequence - b.sectionSequence);
  }, [sections]);

  // Filter groups based on selected day
  const displayedGroups = useMemo(() => {
    if (selectedDay === "overview") {
      return sectionGroups;
    }
    const dayNum = parseInt(selectedDay.replace("day-", ""));
    return sectionGroups.filter((group) => group.sectionSequence === dayNum);
  }, [sectionGroups, selectedDay]);

  // Parse master tips (Tips_Notes) from guide
  const masterTips = useMemo(() => {
    if (!guide?.Tips_Notes) return null;
    
    if (typeof guide.Tips_Notes === "string") {
      return guide.Tips_Notes.trim();
    } else if (Array.isArray(guide.Tips_Notes)) {
      // Parse rich text blocks
      return guide.Tips_Notes
        .map((block: any) => {
          if (block.type === "paragraph" && block.children) {
            return block.children.map((child: any) => child.text || "").join("");
          }
          return "";
        })
        .filter((text: string) => text.trim().length > 0)
        .join("\n\n");
    }
    return null;
  }, [guide?.Tips_Notes]);

  // Toggle tip card expansion
  const toggleTipExpansion = (tipId: string) => {
    setExpandedTips((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tipId)) {
        newSet.delete(tipId);
      } else {
        newSet.add(tipId);
      }
      return newSet;
    });
  };


  // Show empty state only if there are no tips at all (neither master nor day-wise)
  if (sectionGroups.length === 0 && !masterTips) {
    return (
      <div className="bg-[var(--category-card,#111827)] rounded-lg p-3 sm:p-4 md:p-6 border border-[var(--category-control-border,#374151)]">
        <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
          <TipsIcon size="5" color="#F59E0B" />
          <h2 className="text-[var(--category-text,#FFFFFF)] text-base sm:text-lg md:text-xl font-poppins font-bold">Tips</h2>
        </div>
        <p className="text-[var(--category-muted,#9CA3AF)] text-xs sm:text-sm font-poppins">
          No tips available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Master Tips Section - Only show in overview */}
      {selectedDay === "overview" && masterTips && (
        <div className="bg-gradient-to-br from-[var(--category-card,rgba(17,24,39,1))] via-[var(--category-card,rgba(17,24,39,0.95))] to-[var(--category-card,rgba(31,41,55,0.9))] rounded-lg border border-[var(--category-control-border,rgba(55,65,81,0.8))] shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-600/20 via-orange-500/20 to-amber-600/20 border-b border-amber-500/30 px-4 sm:px-6 py-4 sm:py-5">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-amber-500/30 to-orange-500/30 flex items-center justify-center border border-amber-400/40">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-[var(--category-text,#FFFFFF)] text-base sm:text-lg md:text-xl font-poppins font-bold bg-gradient-to-r from-[var(--category-text,#FBBF24)] via-[var(--category-text,#FB923C)] to-[var(--category-text,#FCD34D)] bg-clip-text text-transparent">
                  Essential Travel Guide & Packing Tips
                </h3>
                <p className="text-[var(--category-muted,#9CA3AF)] text-xs sm:text-sm font-poppins mt-0.5">
                  General recommendations for your entire journey
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-4 sm:px-6 py-4 sm:py-6">
            <div className="prose prose-invert max-w-none">
              <div 
                className={`text-[var(--category-muted,#E5E7EB)] text-sm sm:text-base font-poppins leading-relaxed whitespace-pre-wrap break-words space-y-3 transition-all duration-300 ${
                  !isMasterTipsExpanded ? 'line-clamp-6' : ''
                }`}
              >
                {masterTips.split("\n\n").map((paragraph: string, idx: number) => (
                  paragraph.trim() && (
                    <p key={idx} className="text-[var(--category-muted,#E5E7EB)] leading-relaxed">
                      {paragraph.trim()}
                    </p>
                  )
                ))}
              </div>
              {/* See More/Less Button */}
              {masterTips && masterTips.length > 400 && (
                <button
                  onClick={() => setIsMasterTipsExpanded(!isMasterTipsExpanded)}
                  className={`mt-4 text-[var(--category-text,hsl(var(--blue-cta)))] hover:text-[var(--category-text,hsl(var(--blue-final)))] font-medium text-sm sm:text-base transition-colors duration-200 flex items-center gap-1.5 group ${categoryStyles ? "focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-[var(--category-focus)] focus-visible:!transform-none" : ""}`}
                >
                  <span>{isMasterTipsExpanded ? 'See Less' : 'See More'}</span>
                  <svg 
                    className={`w-4 h-4 transition-transform duration-200 ${isMasterTipsExpanded ? 'rotate-180' : ''}`}
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
        </div>
      )}

      {/* Tips by Day - Card Layout */}
      {displayedGroups.length === 0 ? (
        <div className="bg-[var(--category-card,#111827)] rounded-lg border border-[var(--category-control-border,#374151)] p-6 sm:p-8 text-center">
          <p className="text-[var(--category-muted,#9CA3AF)] text-sm sm:text-base font-poppins">
            No tips available for this day.
          </p>
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {displayedGroups.map((group) => (
            <div key={group.sectionId} className="space-y-4 sm:space-y-5">
              {/* Day Heading - Format: Day X | {title} */}
              <div className="flex items-center gap-3 pb-2 border-b border-[var(--category-control-border,rgba(55,65,81,0.5))]">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-8 sm:h-10 bg-gradient-to-b from-[var(--category-accent,hsl(var(--blue-cta)))] to-[var(--category-accent,hsl(var(--blue-final)))] rounded-full"></div>
                  <h2 className="text-[var(--category-text,#FFFFFF)] font-poppins font-bold text-xl sm:text-2xl md:text-3xl tracking-tight">
                    <span className="text-[var(--category-text,hsl(var(--blue-cta)))]">
                      Day {group.sectionSequence || 0}
                    </span>
                    {group.sectionTitle && (() => {
                      const cleanedTitle = cleanTitle(group.sectionTitle, group.sectionSequence);
                      return cleanedTitle ? (
                        <>
                          <span className="text-[var(--category-muted,rgba(156,163,175,0.6))] mx-2">|</span>
                          <span className="text-[var(--category-text,#FFFFFF)] font-semibold text-base sm:text-lg md:text-xl tracking-normal">
                            {cleanedTitle}
                          </span>
                        </>
                      ) : null;
                    })()}
                  </h2>
                </div>
              </div>

              {/* Tips Cards - Full Width Responsive */}
              <div className="space-y-3 sm:space-y-4">
                {group.tipPlaces.map((item, idx) => {
                  const tipId = `${group.sectionId}-${idx}`;
                  const isExpanded = expandedTips.has(tipId);
                  // Approximate 3 lines: ~60-80 chars per line = ~180-240 chars, using 200 as threshold
                  const needsExpansion = item.tip.length > 200;
                  
                  return (
                    <div
                      key={tipId}
                      className="w-full rounded-xl border border-[var(--category-control-border,rgba(55,65,81,0.4))] bg-gradient-to-br from-[var(--category-card,rgba(17,24,39,0.5))] via-[var(--category-card,rgba(31,41,55,0.3))] to-[var(--category-card,rgba(17,24,39,0.2))] backdrop-blur-sm p-4 sm:p-5 md:p-6 hover:border-[hsl(var(--blue-cta))]/50 hover:shadow-lg transition-all duration-300"
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        {/* Tips Icon */}
                        <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-400 flex items-center justify-center ring-1 ring-amber-400/20">
                          <TipsIcon size="5" color="#F59E0B" />
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[var(--category-text,#FFFFFF)] font-poppins font-semibold text-sm sm:text-base md:text-lg mb-2 sm:mb-3">
                            {item.placeName}
                          </h4>
                          <p 
                            className={`text-[var(--category-muted,#E5E7EB)] font-poppins text-sm sm:text-base leading-relaxed transition-all duration-300 ${
                              !isExpanded && needsExpansion ? 'line-clamp-3' : ''
                            }`}
                          >
                            {item.tip}
                          </p>
                          {/* See More/Less Button */}
                          {needsExpansion && (
                            <button
                              onClick={() => toggleTipExpansion(tipId)}
                              className={`mt-2 text-[var(--category-text,hsl(var(--blue-cta)))] hover:text-[var(--category-text,hsl(var(--blue-final)))] font-medium text-xs sm:text-sm transition-colors duration-200 flex items-center gap-1.5 group ${categoryStyles ? "focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-[var(--category-focus)] focus-visible:!transform-none" : ""}`}
                            >
                              <span>{isExpanded ? 'See Less' : 'See More'}</span>
                              <svg 
                                className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
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
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

PublicGuideTipsView.displayName = "PublicGuideTipsView";

export default PublicGuideTipsView;
