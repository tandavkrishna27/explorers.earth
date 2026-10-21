/**
 * EditTipModal Component
 * Modal for editing a single tip from the Tips tab
 * 
 * SINGLE SOURCE OF TRUTH ENFORCEMENT:
 * When a tip is edited, this component updates ALL related fields to maintain perfect sync:
 * 
 * 1. Timeline Field: Updates the tip in morning/afternoon/evening arrays (matched by id)
 * 
 * This ensures that:
 * - Editing from Tips tab updates Timeline tab (and vice versa)
 * - All views reflect the most recent data
 * - No duplicate or stale data exists
 * - ID-based matching ensures correct object updates everywhere
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {useGuideEditing} from '../../context/GuideEditingProvider';
import { toast } from "sonner";
import Button from "../../../../components/ui/Button";
import { DayPlace, TimelineData } from "../../types/guideSectionTypes";
import { parseTimeline } from "../../utils/guideDataParser";
import TipsIcon from "../../../../assets/icons/TipsIcon";
import DeleteIcon from "../../../../assets/icons/DeleteIcon";
import ConfirmationModal from "../../../../components/ui/ConfirmationModal";
import DialogPanel from "../../../../components/ui/DialogPanel";

interface EditTipModalProps {
  isOpen: boolean;
  onClose: () => void;
  tip: {
    placeId: string;
    placeName: string;
    tip: string;
  };
  sectionId: string;
  sectionTitle: string;
  onSuccess?: () => void;
}

const EditTipModal: React.FC<EditTipModalProps> = ({
  isOpen,
  onClose,
  tip,
  sectionId,
  sectionTitle,
  onSuccess,
}) => {
  const [tipText, setTipText] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const {getSection, saveSection} = useGuideEditing();


  // Initialize form with current tip data
  useEffect(() => {
    if (isOpen && tip) {
      setTipText(tip.tip || "");
    }
  }, [isOpen, tip.placeId, tip.tip]);

  const saveTip = async (newTipText: string, isDelete: boolean = false) => {
    setLoading(true);

    try {
      const section = getSection(sectionId);
      if (!section) {
        throw new Error("Section not found");
      }

      // Parse current Timeline data
      const currentTimelineData = parseTimeline(section.Timeline);

      // Helper function to update tip in an array by place ID
      const updateTipInArray = (places: DayPlace[]): DayPlace[] => {
        return places.map((place) => {
          // If this place has the same ID as the tip's place, update its tips property
          if (place.id === tip.placeId) {
            return {
              ...place,
              tips: newTipText,
            };
          }
          return place;
        });
      };

      // Update all timeline arrays (morning, afternoon, evening)
      const updatedTimeline: TimelineData = {
        morning: updateTipInArray(currentTimelineData.morning || []),
        afternoon: updateTipInArray(currentTimelineData.afternoon || []),
        evening: updateTipInArray(currentTimelineData.evening || []),
      };


      // Only the timeline changes; every other block keeps its current value because the
      // save fills in what the caller does not name.
      await saveSection(sectionId, {
        title: section.Title,
        description: section.Description ?? null,
        Timeline: updatedTimeline,
      });

      toast.success(isDelete ? "Tip deleted successfully!" : "Tip updated successfully!");
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error("Error updating tip:", error);
      toast.error(error.message || "Failed to update tip. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!tipText.trim()) {
      toast.error("Please enter a tip");
      return;
    }
    saveTip(tipText.trim(), false);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    await saveTip("", true);
    setShowDeleteConfirm(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <DialogPanel onClose={onClose}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-dashboard-sidebar rounded-2xl shadow-2xl border border-dashboard-muted w-full max-w-md max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-dashboard-sidebar border-b border-dashboard-muted p-6 rounded-t-2xl z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 text-blue-400 flex items-center justify-center ring-1 ring-blue-400/20">
                    <TipsIcon size="5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-dashboard font-poppins font-bold text-lg">
                      Edit Tip
                    </h2>
                    <p className="text-dashboard-light text-xs font-poppins truncate">
                      {sectionTitle}
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                {/* Place Name */}
                <div>
                  <label className="block text-dashboard font-poppins font-medium text-sm mb-2">
                    Place
                  </label>
                  <div className="p-3 bg-dashboard-bg/50 rounded-lg border border-dashboard-muted/30">
                    <p className="text-sm text-dashboard font-poppins font-medium">
                      {tip.placeName}
                    </p>
                  </div>
                </div>

                {/* Tip Text */}
                <div>
                  <label className="block text-dashboard font-poppins font-medium text-sm mb-2">
                    Tip
                  </label>
                  <textarea
                    value={tipText}
                    onChange={(e) => setTipText(e.target.value)}
                    placeholder="e.g., Wake up early to avoid crowds, Try their signature dish, Best visited during sunset..."
                    className="w-full p-3 bg-dashboard-muted text-dashboard rounded-lg border border-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent font-poppins text-sm resize-none"
                    rows={4}
                  />
                </div>

                {/* Current tip info */}
                {tip.tip && (
                  <div className="p-3 bg-dashboard-bg/50 rounded-lg border border-dashboard-muted/30">
                    <p className="text-xs text-dashboard-light font-poppins mb-1">
                      Current:
                    </p>
                    <p className="text-sm text-dashboard font-poppins">
                      {tip.tip}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-dashboard-sidebar border-t border-dashboard-muted p-6 rounded-b-2xl flex gap-3 items-center">
                {tip.tip && (
                  <Button
                    variant="icon"
                    onClickHandler={handleDelete}
                    startIcon={<DeleteIcon />}
                    className="!p-2 text-dashboard-danger hover:bg-dashboard-danger/10 mr-auto"
                    title="Delete Tip"
                  />
                )}
                <Button
                  variant="ghost"
                  onClickHandler={onClose}
                  btnText="Cancel"
                  className={tip.tip ? "flex-1 max-w-[120px]" : "flex-1"}
                />
                <Button
                  variant="primary"
                  onClickHandler={handleSubmit}
                  btnText={loading ? "Saving..." : "Save Changes"}
                  className="flex-1"
                  disabled={loading || !tipText.trim()}
                />
              </div>
            </div>
          </DialogPanel>
        </>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Delete Tip"
        message="Are you sure you want to delete this tip? This action cannot be undone."
        confirmText="Delete"
        isDanger={true}
        isLoading={loading}
      />
    </AnimatePresence>
  );
};

export default EditTipModal;

