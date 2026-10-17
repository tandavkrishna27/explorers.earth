/**
 * TipsTagsTab Component
 * Displays and allows editing of guide-level tips
 */

import { useState } from "react";
import EditIcon from "../../../../assets/icons/EditIcon";
import TipsIcon from "../../../../assets/icons/TipsIcon";
import EditGeneralTipsModal from "./EditGeneralTipsModal";
import type { Guide } from "../../types";

interface TipsTagsTabProps {
  guide: Guide;
  guideId: string;
  saveTips: (input: {tipsNotes: unknown; tags: string[]}) => Promise<void>;
  onUpdate?: () => void;
}

const TipsTagsTab: React.FC<TipsTagsTabProps> = ({
  guide,
  guideId,
  saveTips,
  onUpdate,
}) => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTipsExpanded, setIsTipsExpanded] = useState(false);

  // Get tips content as string for truncation
  const tipsContent = guide.Tips_Notes
    ? typeof guide.Tips_Notes === "string"
      ? guide.Tips_Notes.trim()
      : Array.isArray(guide.Tips_Notes)
      ? guide.Tips_Notes
          .map((block: any) => {
            if (block.type === "paragraph" && block.children) {
              return block.children.map((child: any) => child.text || "").join("");
            }
            return "";
          })
          .filter((text: string) => text.trim().length > 0)
          .join("\n\n")
      : ""
    : "";

  const needsExpansion = tipsContent.length > 400; // Approximate 6 lines

  // Ticket 5.3. This tab only presents and delegates; the page owns the write.
  // For now, we'll return the component structure and handle mutation in parent
  return (
    <div className="space-y-6">
      {/* Guide-Level Tips Section */}
      <div className="bg-gradient-to-br from-dashboard-sidebar via-dashboard-sidebar to-dashboard-sidebar/95 rounded-xl shadow-dashboard-elevated border border-dashboard-muted overflow-hidden">
        {/* Header with gradient accent */}
        <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-b border-dashboard-muted/50 p-4 sm:p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-600/20 text-blue-400 flex items-center justify-center ring-1 ring-blue-400/30 flex-shrink-0">
                <TipsIcon size="5" />
              </div>
              <h2 className="text-dashboard text-xl sm:text-2xl font-poppins font-bold">
                General Guides and Packaging Tips
              </h2>
            </div>
            <button
              className="bg-dashboard-accent hover:bg-dashboard-accent/90 p-2.5 sm:p-3 rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:ring-offset-2 focus:ring-offset-dashboard-sidebar flex-shrink-0 group ring-2 ring-dashboard-accent/50"
              onClick={() => setIsEditModalOpen(true)}
              title="Edit guides and packaging tips"
              aria-label="Edit guides and packaging tips"
            >
              <EditIcon color="white" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-5 md:p-6 space-y-6">
          {/* Tips Notes */}
          <div className="space-y-3">
            <label className="text-dashboard block font-semibold font-poppins text-sm sm:text-base">
              Tips & Recommendations
            </label>
            <div className="rounded-xl border border-dashboard-muted/40 bg-gradient-to-br from-dashboard-bg/50 via-dashboard-bg/30 to-dashboard-bg/20 backdrop-blur-sm p-4 sm:p-5 md:p-6 min-h-[140px] sm:min-h-[160px] shadow-inner">
              {guide.Tips_Notes ? (
                typeof guide.Tips_Notes === "string" ? (
                  <div className="prose prose-invert max-w-none">
                    <div 
                      className={`text-dashboard font-poppins text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words transition-all duration-300 ${
                        !isTipsExpanded && needsExpansion ? 'line-clamp-6' : ''
                      }`}
                    >
                      {guide.Tips_Notes.split("\n\n").map((paragraph: string, idx: number) => (
                        paragraph.trim() && (
                          <p key={idx} className="text-dashboard leading-relaxed">
                            {paragraph.trim()}
                          </p>
                        )
                      ))}
                    </div>
                    {/* See More/Less Button */}
                    {needsExpansion && (
                      <button
                        onClick={() => setIsTipsExpanded(!isTipsExpanded)}
                        className="mt-4 text-dashboard-accent hover:text-purple-600 font-medium text-sm sm:text-base transition-colors duration-200 flex items-center gap-1.5 group"
                      >
                        <span>{isTipsExpanded ? 'See Less' : 'See More'}</span>
                        <svg 
                          className={`w-4 h-4 transition-transform duration-200 ${isTipsExpanded ? 'rotate-180' : ''}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>
                ) : Array.isArray(guide.Tips_Notes) ? (
                  <div className="space-y-3 prose prose-invert max-w-none">
                    <div 
                      className={`text-dashboard font-poppins text-sm sm:text-base leading-relaxed break-words transition-all duration-300 ${
                        !isTipsExpanded && needsExpansion ? 'line-clamp-6' : ''
                      }`}
                    >
                      {guide.Tips_Notes.map((block: any, idx: number) => {
                        if (block.type === "paragraph") {
                          return (
                            <p key={idx} className="text-dashboard leading-relaxed break-words">
                              {block.children?.map((child: any) => child.text).join("")}
                            </p>
                          );
                        }
                        return null;
                      })}
                    </div>
                    {/* See More/Less Button */}
                    {needsExpansion && (
                      <button
                        onClick={() => setIsTipsExpanded(!isTipsExpanded)}
                        className="mt-4 text-dashboard-accent hover:text-purple-600 font-medium text-sm sm:text-base transition-colors duration-200 flex items-center gap-1.5 group"
                      >
                        <span>{isTipsExpanded ? 'See Less' : 'See More'}</span>
                        <svg 
                          className={`w-4 h-4 transition-transform duration-200 ${isTipsExpanded ? 'rotate-180' : ''}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>
                ) : null
              ) : (
                <div className="flex items-center justify-center h-full min-h-[100px]">
                  <p className="text-dashboard-light/50 italic text-sm sm:text-base font-poppins text-center">
                    No tips or recommendations added yet. Click the edit button to add some.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-3">
            <label className="text-dashboard block font-semibold font-poppins text-sm sm:text-base">
              Tags
            </label>
            <div className="rounded-xl border border-dashboard-muted/40 bg-gradient-to-br from-dashboard-bg/50 via-dashboard-bg/30 to-dashboard-bg/20 backdrop-blur-sm p-4 sm:p-5 md:p-6 min-h-[100px] sm:min-h-[120px] shadow-inner">
              {guide.Guide_Tags && Array.isArray(guide.Guide_Tags) && guide.Guide_Tags.length > 0 ? (
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {guide.Guide_Tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-300 sm:text-blue-400 rounded-lg sm:rounded-xl text-xs sm:text-sm font-poppins font-medium border border-blue-400/40 shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full min-h-[60px]">
                  <p className="text-dashboard-light/50 italic text-sm sm:text-base font-poppins text-center">
                    No tags added yet. Click the edit button to add tags.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit General Tips Modal */}
      <EditGeneralTipsModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        guide={guide}
        guideId={guideId}
        saveTips={saveTips}
        onSuccess={() => {
          if (onUpdate) onUpdate();
          setIsEditModalOpen(false);
        }}
      />
    </div>
  );
};

export default TipsTagsTab;

