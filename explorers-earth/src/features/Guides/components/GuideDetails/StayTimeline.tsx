import React, { useMemo, useState } from "react";
import {
  VerticalTimeline,
  VerticalTimelineElement,
} from "react-vertical-timeline-component";
import "react-vertical-timeline-component/style.min.css";
import { DayPlace } from "../../types/guideSectionTypes";
import { parseStay } from "../../utils/guideDataParser";
import StayIcon from "../../../../assets/icons/StayIcon";
import DirectionIcon from "../../../../assets/icons/DirectionIcon";
import EditIcon from "../../../../assets/icons/EditIcon";
import EditStayModal from "./EditStayModal";

interface StayTimelineProps {
  guide: {
    documentId: string;
    guide_sections?: any[];
  };
}

interface SectionGroup {
  sectionId: string;
  sectionTitle: string;
  sectionSequence: number;
  accommodations: DayPlace[];
}

interface EditingStay {
  stay: DayPlace;
  sectionId: string;
  sectionTitle: string;
}

const StayTimeline: React.FC<StayTimelineProps> = ({ guide }) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );
  const [editingStay, setEditingStay] = useState<EditingStay | null>(null);

  const sectionGroups = useMemo(() => {
    const sections = guide.guide_sections || [];

    // De-dup sections by id
    const uniqueSections = sections.filter(
      (section: any, index: number, self: any[]) =>
        index ===
        self.findIndex((s: any) => s.documentId === section.documentId)
    );

    // Sort by sequence
    const sortedSections = [...uniqueSections].sort(
      (a, b) => (a.Sequence || 0) - (b.Sequence || 0)
    );

    const groups: SectionGroup[] = [];

    sortedSections.forEach((section) => {
      if (!section.Stay) return;
      const stayData = parseStay(section.Stay);
      const accommodations = Array.isArray(stayData.accommodations)
        ? stayData.accommodations
        : [];
      if (accommodations.length === 0) return;

      groups.push({
        sectionId: section.documentId,
        sectionTitle: section.Title || `Day ${section.Sequence || 1}`,
        sectionSequence: section.Sequence || 0,
        accommodations,
      });
    });

    return groups.sort((a, b) => a.sectionSequence - b.sectionSequence);
  }, [guide.guide_sections]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const ns = new Set(prev);
      if (ns.has(sectionId)) ns.delete(sectionId);
      else ns.add(sectionId);
      return ns;
    });
  };

  const renderAccommodation = (
    place: DayPlace,
    idx: number,
    sectionId: string,
    sectionTitle: string
  ) => {
    // Google Maps URL for the accommodation
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      place.name
    )}&query_place_id=${place.place_id}`;

    return (
      <div
        key={`${place.place_id}-${idx}`}
        className="rounded-lg border border-dashboard-muted/30 bg-gradient-to-br from-dashboard-bg/40 to-dashboard-bg/20 backdrop-blur-sm p-3.5"
      >
        <div className="flex items-center gap-3">
          {/* Stay Icon */}
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 text-blue-400 flex items-center justify-center ring-1 ring-blue-400/20">
            <StayIcon size="5" />
          </div>

          {/* Accommodation Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-dashboard font-poppins font-semibold text-sm flex-1 min-w-0 truncate">
                {place.name}
              </h4>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5">
                {/* Direction Button */}
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 p-2 rounded-lg hover:bg-blue-500/10 text-blue-400 hover:text-blue-500 transition-all duration-200"
                  title="Open in Google Maps"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DirectionIcon size="5" />
                </a>

                {/* Edit Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingStay({
                      stay: place,
                      sectionId,
                      sectionTitle,
                    });
                  }}
                  className="bg-dashboard-accent p-2 rounded-full shadow-md hover:bg-dashboard-accent/90 hover:scale-110 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:ring-offset-2"
                  title="Edit accommodation"
                  aria-label="Edit accommodation"
                >
                  <EditIcon color="white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (sectionGroups.length === 0) {
    return (
      <div className="bg-dashboard-sidebar rounded-lg shadow-dashboard-elevated p-6 border border-dashboard-muted">
        <h2 className="text-dashboard text-xl font-poppins font-bold mb-2">
          Stay Timeline
        </h2>
        <p className="text-dashboard-light text-sm font-poppins">
          No accommodations added yet. Add stays while building your guide
          sections.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-dashboard-sidebar rounded-lg shadow-dashboard-elevated p-6 border border-dashboard-muted">
      <div className="mb-6">
        <h2 className="text-dashboard text-xl font-poppins font-bold mb-2">
          Stay Timeline
        </h2>
        <p className="text-dashboard-light text-sm font-poppins">
          All accommodations grouped by day across your guide
        </p>
      </div>

      <VerticalTimeline lineColor="var(--dash-accent)">
        {sectionGroups.map((group) => (
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
              padding: 0,
            }}
            contentArrowStyle={{
              borderRight: "7px solid rgba(255, 255, 255, 0.1)",
            }}
            iconStyle={{
              background:
                "linear-gradient(to bottom right, rgb(59 130 246), rgb(37 99 235))",
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
              <button
                onClick={() => toggleSection(group.sectionId)}
                className="w-full flex items-center justify-between p-4 rounded-t-2xl"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <h3 className="text-dashboard font-poppins font-bold text-base">
                    {group.sectionTitle}
                  </h3>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-poppins font-semibold bg-blue-500/15 text-blue-400 border border-blue-400/30 whitespace-nowrap">
                    <StayIcon size="3" />
                    {group.accommodations.length}{" "}
                    {group.accommodations.length === 1 ? "stay" : "stays"}
                  </span>
                </div>
              </button>

              {expandedSections.has(group.sectionId) && (
                <div className="px-4 pb-4 pt-2 border-t border-dashboard-muted/30">
                  <div className="space-y-2.5">
                    {group.accommodations.map((place, idx) =>
                      renderAccommodation(
                        place,
                        idx,
                        group.sectionId,
                        group.sectionTitle
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </VerticalTimelineElement>
        ))}
      </VerticalTimeline>

      {/* Edit Stay Modal */}
      {editingStay && (
        <EditStayModal
          isOpen={!!editingStay}
          onClose={() => setEditingStay(null)}
          stay={editingStay.stay}
          sectionId={editingStay.sectionId}
          sectionTitle={editingStay.sectionTitle}
          onSuccess={() => {
            // Modal will handle refetching, just close it
            setEditingStay(null);
          }}
        />
      )}
    </div>
  );
};

export default StayTimeline;
