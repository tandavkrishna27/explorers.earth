import { NavigationStatus } from "../features/navigation/NavigationStatus";
import { FC } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { useCategoryNavigation } from "../features/navigation/CategoryNavigationProvider";
import { CATEGORY_IDS, type IntentAuthority, type CategoryId } from "../features/navigation/categoryNavigationPolicy";

interface CategoryVisibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryName: string; // e.g. "Places", "Games", "Books", "Movies", "Music", "Guides"
  visibilityField: string; // e.g. "public_recommendations", "public_games", etc.
  accountDocumentId: string;
  origin?: IntentAuthority;
  onSuccess?: () => void;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  Places: "📍",
  Games: "🎮",
  Books: "📚",
  Movies: "🎬",
  Music: "🎵",
  Guides: "📖",
};

export const CategoryVisibilityModal: FC<CategoryVisibilityModalProps> = ({
  isOpen,
  onClose,
  categoryName,
  visibilityField,
  accountDocumentId,
  origin,
  onSuccess,
}) => {
  const navigation = useCategoryNavigation();
  const loading = navigation.busy;
  const current = !!origin && origin.accountDocumentId === accountDocumentId
    && origin.accountDocumentId === navigation.authority?.accountDocumentId
    && origin.userDocumentId === navigation.authority?.userDocumentId
    && origin.generation === navigation.authority?.generation;
  const supported = visibilityField !== "public_music" && CATEGORY_IDS.includes(visibilityField as CategoryId);
  const handleMakePublic = async () => {
    if (!origin || !current || !supported || loading) return;
    const result = await navigation.request({ category: visibilityField as Exclude<CategoryId, "public_music">, action: "publish" }, origin);
    if (result.kind !== "confirmed") return;
    toast.success(`${categoryName} visibility updated to Public!`);
    onSuccess?.();
    onClose();
  };

  const emoji = CATEGORY_EMOJIS[categoryName] || "✨";

  // AnimatePresence must always be mounted in the tree so it can intercept
  // the child unmount and play the exit animation before removing the DOM node.
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="dashboard-theme fixed inset-0 z-[160] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
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
                Make your {categoryName} public?
              </h3>

              <p className="text-sm text-dashboard-light mb-6 font-poppins leading-relaxed">
                Your {categoryName} tab is currently hidden on your public profile. Would you like to make it public so others can see your recommendations?
              </p>

              {!current && <p role="alert">Account changed. Close and reopen this prompt.</p>}
              <NavigationStatus navigation={navigation} />
              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 w-full border-t border-dashboard-border pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-sm text-white font-medium transition-colors border-none cursor-pointer font-poppins"
                >
                  Keep Private
                </button>
                <button
                  type="button"
                  onClick={handleMakePublic}
                  disabled={loading || !current || !supported}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-sm text-white font-bold transition-all flex items-center justify-center gap-2 border-none cursor-pointer font-poppins shadow-lg shadow-blue-900/30 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Yes, Make Public
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
