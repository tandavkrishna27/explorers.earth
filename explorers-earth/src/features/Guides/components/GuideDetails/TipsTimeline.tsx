import React, { useMemo, useState } from "react";
import { DayPlace } from "../../types/guideSectionTypes";
import { parseTimeline } from "../../utils/guideDataParser";
import TipsIcon from "../../../../assets/icons/TipsIcon";
import EditIcon from "../../../../assets/icons/EditIcon";
import EditTipModal from "./EditTipModal";

interface TipsTimelineProps {
  guide: {
    documentId: string;
    guide_sections?: any[];
  };
}

interface SectionGroup {
  sectionId: string;
  sectionTitle: string;
  sectionSequence: number;
  tags: string[];
  tipPlaces: { placeId: string; name: string; tip: string }[];
}

interface EditingTip {
  placeId: string;
  placeName: string;
  tip: string;
  sectionId: string;
  sectionTitle: string;
}

const TipsTimeline: React.FC<TipsTimelineProps> = ({ guide }) => {
  const [editingTip, setEditingTip] = useState<EditingTip | null>(null);
  const [expandedTips, setExpandedTips] = useState<Set<string>>(new Set());

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

  const sectionGroups = useMemo(() => {
    const sections = guide.guide_sections || [];

    const uniqueSections = sections.filter(
      (section: any, index: number, self: any[]) =>
        index ===
        self.findIndex((s: any) => s.documentId === section.documentId)
    );

    const sortedSections = [...uniqueSections].sort(
      (a, b) => (a.Sequence || 0) - (b.Sequence || 0)
    );

    const groups: SectionGroup[] = [];

    sortedSections.forEach((section) => {
      const timeline = parseTimeline(section.Timeline);
      const allPlaces: DayPlace[] = [
        ...(timeline.morning || []),
        ...(timeline.afternoon || []),
        ...(timeline.evening || []),
      ];

      const tipPlaces = allPlaces
        .filter(
          (p) => p && typeof p.tips === "string" && p.tips.trim().length > 0
        )
        .map((p) => ({
          placeId: p.id, // Store place ID for editing
          name: p.name,
          tip: p.tips!.trim(),
        }));

      const tags: string[] = Array.isArray(section.Section_tags)
        ? (section.Section_tags as string[])
        : [];

      if (tipPlaces.length === 0) return;

      groups.push({
        sectionId: section.documentId,
        sectionTitle: section.Title || `Day ${section.Sequence || 1}`,
        sectionSequence: section.Sequence || 0,
        tipPlaces,
        tags,
      });
    });

    return groups.sort((a, b) => a.sectionSequence - b.sectionSequence);
  }, [guide.guide_sections]);

  if (sectionGroups.length === 0) {
    return (
      <div className="bg-dashboard-sidebar rounded-lg shadow-dashboard-elevated p-4 md:p-6 border border-dashboard-muted">
        <h2 className="text-dashboard text-lg md:text-xl font-poppins font-bold mb-2">
          Tips Timeline
        </h2>
        <p className="text-dashboard-light text-sm font-poppins mb-4">
          Place tips across your guide
        </p>
        <div className="bg-dashboard-bg/30 rounded-lg p-6 text-center border border-dashboard-muted/30">
          <p className="text-dashboard-light text-sm font-poppins">
            No tips found yet. Add tips to places in your journey sections.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {sectionGroups.map((group) => (
        <div key={group.sectionId} className="space-y-4 sm:space-y-5">
          {/* Day Heading - Format: Day X | {title} */}
          <div className="flex items-center gap-3 pb-2 border-b border-dashboard-muted/50">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-8 sm:h-10 bg-gradient-to-b from-dashboard-accent to-purple-600 rounded-full"></div>
              <h2 className="text-dashboard font-poppins font-bold text-xl sm:text-2xl md:text-3xl tracking-tight">
                <span className="text-dashboard-accent">
                  Day {group.sectionSequence || 0}
                </span>
                {group.sectionTitle && (() => {
                  const cleanedTitle = cleanTitle(group.sectionTitle, group.sectionSequence);
                  // Always show the pipe and title if sectionTitle exists, even if cleaned is empty
                  // This ensures the heading format is consistent
                  if (cleanedTitle && cleanedTitle.length > 0) {
                    return (
                      <>
                        <span className="text-dashboard-light/60 mx-2">|</span>
                        <span className="text-dashboard font-semibold text-base sm:text-lg md:text-xl tracking-normal">
                          {cleanedTitle}
                        </span>
                      </>
                    );
                  } else if (group.sectionTitle && group.sectionTitle !== `Day ${group.sectionSequence}`) {
                    // If cleaned is empty but original title exists and is different, show original
                    return (
                      <>
                        <span className="text-dashboard-light/60 mx-2">|</span>
                        <span className="text-dashboard font-semibold text-base sm:text-lg md:text-xl tracking-normal">
                          {group.sectionTitle}
                        </span>
                      </>
                    );
                  }
                  return null;
                })()}
              </h2>
            </div>
          </div>

          {/* Tips Cards - Full Width Responsive */}
          <div className="space-y-3 sm:space-y-4">
            {group.tipPlaces.map((item, idx) => {
              const tipId = `${group.sectionId}-${item.placeId}-${idx}`;
              const isExpanded = expandedTips.has(tipId);
              // Approximate 3 lines: ~60-80 chars per line = ~180-240 chars, using 200 as threshold
              const needsExpansion = item.tip.length > 200;

              return (
                <div
                  key={`${item.placeId}-${idx}`}
                  className="w-full rounded-xl border border-dashboard-muted/40 bg-gradient-to-br from-dashboard-bg/50 via-dashboard-bg/30 to-dashboard-bg/20 backdrop-blur-sm p-4 sm:p-5 md:p-6 hover:border-dashboard-accent/50 hover:shadow-lg transition-all duration-300"
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    {/* Tips Icon */}
                    <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-400 flex items-center justify-center ring-1 ring-amber-400/20">
                      <TipsIcon size="5" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
                        <h4 className="text-dashboard font-poppins font-semibold text-sm sm:text-base md:text-lg">
                          {item.name}
                        </h4>
                        {/* Edit Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTip({
                              placeId: item.placeId,
                              placeName: item.name,
                              tip: item.tip,
                              sectionId: group.sectionId,
                              sectionTitle: group.sectionTitle,
                            });
                          }}
                          className="bg-dashboard-accent p-2 rounded-full shadow-md hover:bg-dashboard-accent/90 hover:scale-110 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:ring-offset-2 flex-shrink-0"
                          title="Edit tip"
                          aria-label="Edit tip"
                        >
                          <EditIcon color="white" />
                        </button>
                      </div>
                      <p 
                        className={`text-dashboard-light font-poppins text-sm sm:text-base leading-relaxed transition-all duration-300 ${
                          !isExpanded && needsExpansion ? 'line-clamp-3' : ''
                        }`}
                      >
                        {item.tip}
                      </p>
                      {/* See More/Less Button */}
                      {needsExpansion && (
                        <button
                          onClick={() => toggleTipExpansion(tipId)}
                          className="mt-2 text-dashboard-accent hover:text-purple-600 font-medium text-xs sm:text-sm transition-colors duration-200 flex items-center gap-1.5 group"
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

      {/* Edit Tip Modal */}
      {editingTip && (
        <EditTipModal
          isOpen={!!editingTip}
          onClose={() => setEditingTip(null)}
          tip={{
            placeId: editingTip.placeId,
            placeName: editingTip.placeName,
            tip: editingTip.tip,
          }}
          sectionId={editingTip.sectionId}
          sectionTitle={editingTip.sectionTitle}
          onSuccess={() => {
            // Modal will handle refetching, just close it
            setEditingTip(null);
          }}
        />
      )}
    </div>
  );
};

export default TipsTimeline;
