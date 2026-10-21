/**
 * SectionFormModal Component
 * Modal for adding or editing guide sections
 */

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import GuideSectionForm from "../GuideSectionForm";
import DialogPanel from "../../../../components/ui/DialogPanel";

interface SectionFormModalProps {
  isOpen: boolean;
  editingSection: any;
  guideId: string;
  sections: any[];
  guide?: any; // Guide data to check for multi-city
  onClose: () => void;
  onSuccess: () => void;
}

const SectionFormModal: React.FC<SectionFormModalProps> = ({
  isOpen,
  editingSection,
  guideId,
  sections,
  guide,
  onClose,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset submitting state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Fallback: Reset submitting state after 10 seconds (in case of error)
  useEffect(() => {
    if (isSubmitting) {
      const timeout = setTimeout(() => {
        setIsSubmitting(false);
      }, 10000);
      return () => clearTimeout(timeout);
    }
  }, [isSubmitting]);

  if (!isOpen && !editingSection) return null;

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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]"
            onClick={onClose}
          />

          {/* Modal */}
          <DialogPanel onClose={onClose}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed top-16 bottom-16 left-0.5 right-0.5 sm:top-20 sm:bottom-20 sm:left-2 sm:right-2 md:inset-8 lg:inset-x-[15%] lg:inset-y-8 xl:inset-x-[20%] xl:inset-y-12 z-[10001] overflow-hidden"
          >
            <div className="h-full bg-dashboard-bg rounded-2xl shadow-2xl border-2 border-white flex flex-col overflow-hidden">
              <div className="sticky top-0 bg-dashboard-bg/95 backdrop-blur-sm border-b border-dashboard-muted px-3 sm:px-6 py-4 z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-dashboard text-xl font-poppins font-bold">
                      {editingSection ? "Edit Day/Stop" : "Add Day or Stop"}
                    </h3>
                    {editingSection?._isAIGenerated && (
                      <span className="px-2 py-1 text-xs font-poppins font-medium bg-dashboard-accent/10 text-dashboard-accent rounded-md border border-dashboard-accent/30">
                        ✨ AI Generated
                      </span>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-dashboard-sidebar hover:bg-dashboard-muted text-dashboard-light hover:text-dashboard transition-all duration-200"
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

              {editingSection?._isAIGenerated && (
                <div className="px-3 sm:px-6 pt-4 pb-2">
                  <div className="bg-dashboard-accent/10 border border-dashboard-accent/30 rounded-lg p-3">
                    <p className="text-sm text-dashboard-light font-poppins">
                      <span className="font-medium text-dashboard-accent">💡 Tip:</span> Review and edit the AI-generated content below. Feel free to modify any details before saving to your guide.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto modal-thin-scrollbar p-3 sm:p-6 pb-24">
                <GuideSectionForm
                  guideDocumentId={guideId}
                  sectionId={editingSection?.documentId}
                  initialData={editingSection}
                  existingSections={sections}
                  guide={guide}
                  onSuccess={() => {
                    setIsSubmitting(false);
                    onSuccess();
                  }}
                  onCancel={() => {
                    setIsSubmitting(false);
                    onClose();
                  }}
                  onLoadingChange={(loading) => {
                    // Sync modal's isSubmitting with form's loading state
                    setIsSubmitting(loading);
                  }}
                />
              </div>

              {/* Floating Action Buttons - Fixed at bottom of modal */}
              <div className="sticky bottom-0 bg-dashboard-bg/95 backdrop-blur-sm border-t border-dashboard-muted px-3 sm:px-6 py-4 z-20 shadow-lg">
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-dashboard-sidebar hover:bg-dashboard-muted text-dashboard rounded-lg transition-colors font-poppins text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingSection?._isAIGenerated ? "Discard" : "Cancel"}
                  </button>
                  <button
                    type="submit"
                    form="guide-section-form-content"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-dashboard-accent hover:bg-dashboard-accent/90 text-white rounded-lg transition-colors font-poppins text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting
                      ? editingSection?._isAIGenerated
                        ? "Keeping..."
                        : editingSection
                          ? "Updating..."
                          : "Adding..."
                      : editingSection?._isAIGenerated
                        ? "Keep & Save"
                        : editingSection
                          ? "Update"
                          : "Add to Guide"}
                  </button>
                </div>
              </div>
            </div>
          </DialogPanel>
        </>
      )}
    </AnimatePresence>
  );
};

export default SectionFormModal;

