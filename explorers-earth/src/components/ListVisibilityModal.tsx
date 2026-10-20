import { FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import DialogPanel from "../components/ui/DialogPanel";

interface ListVisibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  listName: string;
  categoryName: string; // e.g. "Places", "Games", "Books", "Movies", "Music", "Guides"
  onConfirm: () => Promise<void>;
  loading?: boolean;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  Places: "📍",
  Games: "🎮",
  Books: "📚",
  Movies: "🎬",
  Music: "🎵",
  Guides: "📖",
};

export const ListVisibilityModal: FC<ListVisibilityModalProps> = ({
  isOpen,
  onClose,
  listName,
  categoryName,
  onConfirm,
  loading = false,
}) => {
  const getListTypeLabel = () => {
    if (categoryName === "Music") return "playlist";
    if (categoryName === "Guides") return "guide";
    return "list";
  };

  if (!isOpen) return null;

  const emoji = CATEGORY_EMOJIS[categoryName] || "✨";
  const listType = getListTypeLabel();

  return (
    <AnimatePresence>
      <DialogPanel onClose={onClose} className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <motion.div
          className="bg-dashboard-sidebar rounded-xl border border-dashboard-border p-6 md:p-8 w-full max-w-md shadow-2xl relative"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-dashboard-muted hover:text-dashboard transition-colors border-none cursor-pointer"
          >
            <X size={16} />
          </button>

          {/* Content */}
          <div className="flex flex-col items-center text-center mt-2">
            <div className="w-16 h-16 rounded-full bg-dashboard-accent/15 border border-dashboard-accent/30 flex items-center justify-center mb-5 text-3xl">
              {emoji}
            </div>

            <h3 className="text-lg font-bold text-white font-poppins mb-2">
              Publish this {listType}?
            </h3>
            
            <p className="text-sm text-dashboard-light mb-6 font-poppins leading-relaxed">
              <span className="font-semibold text-white">"{listName}"</span> is currently set to Draft. Would you like to publish this {listType} so others can see it on your public profile?
            </p>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 w-full border-t border-dashboard-border pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-sm text-white font-medium transition-colors border-none cursor-pointer font-poppins"
              >
                Keep Draft
              </button>
              <button
                type="button"
                onClick={async () => {
                  // NOTE: the modal closes after onConfirm resolves regardless of
                  // whether the publish mutation actually succeeded. onConfirm is
                  // expected to surface its own error toast; if publish reliability
                  // becomes an issue, have onConfirm return a boolean and gate the
                  // close on it (kept out of scope here to avoid touching every caller).
                  await onConfirm();
                  onClose();
                }}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-sm text-white font-bold transition-all flex items-center justify-center gap-2 border-none cursor-pointer font-poppins shadow-lg shadow-blue-900/30"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Yes, Publish
              </button>
            </div>
          </div>
        </motion.div>
      </DialogPanel>
    </AnimatePresence>
  );
};
