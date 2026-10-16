/**
 * EditGeneralTipsModal Component
 * Modal for editing guide-level general tips and tags
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import Button from "../../../../components/ui/Button";
import TiptapEditor from "../../../Favorites/components/TiptapEditor";
import TipsIcon from "../../../../assets/icons/TipsIcon";
import {
  htmlToBlocks,
  blocksToHtml,
} from "../../../../utils/strapiBlocksConverter";
import type { Guide } from "../../types";
import {guideDescriptionText} from '../../../../utils/guideDescriptionText';
import {encode} from 'html-entities';

interface EditGeneralTipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  guide: Guide;
  guideId: string;
  /**
   * Saves the guide's tips and tags. Ticket 5.3: a typed callback rather than an Apollo
   * mutation function, so this editor cannot compose a write of its own - the page owns
   * the revision every write states.
   */
  saveTips: (input: {tipsNotes: unknown; tags: string[]}) => Promise<void>;
  onSuccess?: () => void;
}

const EditGeneralTipsModal: React.FC<EditGeneralTipsModalProps> = ({
  isOpen,
  onClose,
  guide,
  saveTips,
  onSuccess,
}) => {
  const [tipsNotes, setTipsNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Initialize state from guide data
  useEffect(() => {
    if (isOpen) {
      if (guide.Tips_Notes) {
        if (typeof guide.Tips_Notes === "string") {
          setTipsNotes(guide.Tips_Notes);
        } else if (Array.isArray(guide.Tips_Notes)) {
          const htmlContent = blocksToHtml(guide.Tips_Notes.map(block => Array.isArray(block.children) ? ({...block,
            children: block.children.map((child:any) => typeof child.text === 'string'
              ? {...child,text:encode(child.text,{mode:'specialChars'})} : child),
          }) : block));
          setTipsNotes(htmlContent);
        }
      } else {
        setTipsNotes("");
      }

      if (guide.Guide_Tags && Array.isArray(guide.Guide_Tags)) {
        setTags(guide.Guide_Tags);
      } else {
        setTags([]);
      }
    }
  }, [isOpen, guide.Tips_Notes, guide.Guide_Tags]);

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const tipsBlocks = htmlToBlocks(tipsNotes).map(block => Array.isArray(block.children) ? ({...block,
        children: block.children.map((child:any) => typeof child.text === 'string'
          ? {...child,text:guideDescriptionText(child.text)} : child),
      }) : block);

      await saveTips({tipsNotes: tipsBlocks, tags});

      toast.success("Tips saved successfully!");
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save tips");
    } finally {
      setLoading(false);
    }
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
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-dashboard-sidebar rounded-2xl shadow-2xl border border-dashboard-muted w-full max-w-2xl max-h-[85vh] sm:max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex-shrink-0 bg-dashboard-sidebar border-b border-dashboard-muted px-6 py-4 rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 text-blue-400 flex items-center justify-center ring-1 ring-blue-400/20">
                    <TipsIcon size="5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-dashboard font-poppins font-bold text-lg">
                      Edit General Guides and Packaging Tips
                    </h2>
                  </div>
                </div>
              </div>

              {/* Content - Scrollable */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
                {/* Tips Notes */}
                <div className="flex flex-col">
                  <label className="text-dashboard block font-medium mb-2 font-poppins text-sm">
                    Tips & Recommendations
                  </label>
                  <div className="editor-container-modal">
                    <TiptapEditor
                      value={tipsNotes}
                      onChange={setTipsNotes}
                      placeholder="Add helpful tips, recommendations, or notes for travelers..."
                    />
                  </div>
                  <style>{`
                    .editor-container-modal .bio-editor .ql-editor {
                      min-height: 120px !important;
                      max-height: 200px !important;
                      overflow-y: auto !important;
                    }
                    @media (min-width: 640px) {
                      .editor-container-modal .bio-editor .ql-editor {
                        max-height: 300px !important;
                      }
                    }
                    .editor-container-modal .bio-editor .ql-container {
                      max-height: 200px !important;
                    }
                    @media (min-width: 640px) {
                      .editor-container-modal .bio-editor .ql-container {
                        max-height: 300px !important;
                      }
                    }
                  `}</style>
                </div>

                {/* Tags */}
                <div>
                  <label className="text-dashboard block font-medium mb-2 font-poppins text-sm">
                    Tags
                  </label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="e.g., adventure, family-friendly, budget"
                        className="flex-1 px-3 py-2 bg-dashboard-bg border border-dashboard-muted rounded-lg text-dashboard text-sm placeholder-dashboard-light/50 focus:outline-none focus:ring-2 focus:ring-dashboard-accent/50 focus:border-dashboard-accent/50 transition-all duration-200"
                      />
                      <Button
                        size="small"
                        variant="primary"
                        onClickHandler={handleAddTag}
                        btnText="Add"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/15 text-blue-400 rounded-lg text-sm font-poppins font-medium border border-blue-400/30"
                        >
                          {tag}
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            className="text-blue-400 hover:text-red-400 transition-colors text-lg leading-none"
                            aria-label="Remove tag"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {tags.length === 0 && (
                        <p className="text-dashboard-light/60 text-sm italic py-2">
                          No tags added yet. Add tags for better searchability.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 bg-dashboard-sidebar border-t border-dashboard-muted px-6 py-4 rounded-b-2xl flex gap-3">
                <Button
                  variant="ghost"
                  onClickHandler={onClose}
                  btnText="Cancel"
                  className="flex-1"
                  disabled={loading}
                />
                <Button
                  variant="primary"
                  onClickHandler={handleSubmit}
                  btnText={loading ? "Saving..." : "Save Changes"}
                  className="flex-1"
                  disabled={loading}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default EditGeneralTipsModal;

