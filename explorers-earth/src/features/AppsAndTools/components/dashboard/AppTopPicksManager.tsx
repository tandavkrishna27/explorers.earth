import { useState } from "react";
import { motion, Reorder } from "framer-motion";
import { X, Star, Minus, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useAppsCommands, useAppsCallerCustody } from "../../api/query";
import type { RecommendedApp } from "../../types";
import { buildLogoUrl } from "../../utils/appHelpers";

interface AppTopPicksManagerProps {
  apps: RecommendedApp[];
  allApps: RecommendedApp[];
  onClose: () => void;
  onRefetch: () => void;
  listId: string;
}

const AppTopPicksManager = ({
  apps,
  allApps,
  onClose,
  onRefetch,
}: AppTopPicksManagerProps) => {
  const [pinnedApps, setPinnedApps] = useState<RecommendedApp[]>(
    [...apps].sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999))
  );
  const [saving, setSaving] = useState(false);
  const commands = useAppsCommands();
  const beginEffects = useAppsCallerCustody();

  const unpinnedApps = allApps.filter(
    (a) => !pinnedApps.find((pa) => pa.documentId === a.documentId)
  );

  const handleUnpin = (app: RecommendedApp) => {
    setPinnedApps((prev) => prev.filter((a) => a.documentId !== app.documentId));
  };

  const handlePin = (app: RecommendedApp) => {
    if (pinnedApps.length >= 15) {
      toast.error("Max 15 top picks allowed.");
      return;
    }
    setPinnedApps((prev) => [...prev, app]);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setPinnedApps((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === pinnedApps.length - 1) return;
    setPinnedApps((prev) => {
      const next = [...prev];
      [next[index + 1], next[index]] = [next[index], next[index + 1]];
      return next;
    });
  };

  // The whole pin set is written in one command, so the order is the array order and an
  // unpin needs no separate pass. The Strapi path wrote one mutation per row and could
  // leave the set half-applied; reordering is now local until Save.
  const handleSave = async () => {
    const current = beginEffects();
    setSaving(true);
    try {
      const pins = pinnedApps.map((app) => {
        if (!app.app_list?.documentId) throw new Error("App membership unavailable");
        return { recommendationId: app.documentId, collectionId: app.app_list.documentId };
      });
      await commands.savePins(pins);
      if (!current()) return;
      toast.success("Top picks updated!");
      if (!current()) return;
      onRefetch();
      if (!current()) return;
      onClose();
    } catch {
      if (current()) toast.error("Failed to save. Please try again.");
    } finally {
      if (current()) setSaving(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-end md:items-center justify-center md:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-[#0d1117] rounded-t-3xl md:rounded-2xl border border-white/10 w-full max-w-lg shadow-2xl"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Star size={16} className="text-blue-400" fill="currentColor" />
            Manage Top Picks ({pinnedApps.length}/15)
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto space-y-5">
          {/* Pinned section */}
          <div>
            <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Pinned (shown in top picks)</p>
            {pinnedApps.length === 0 ? (
              <p className="text-sm text-white/30 py-4 text-center border border-dashed border-white/10 rounded-xl">
                No top picks selected. Add some below.
              </p>
            ) : (
              <Reorder.Group axis="y" values={pinnedApps} onReorder={setPinnedApps} className="space-y-1">
                {pinnedApps.map((app, i) => (
                  <Reorder.Item
                    key={app.documentId}
                    value={app}
                    className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0 bg-[#0d1117] cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMoveUp(i); }}
                        disabled={i === 0}
                        className="text-white/20 hover:text-white disabled:opacity-0 transition-colors p-0.5"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMoveDown(i); }}
                        disabled={i === pinnedApps.length - 1}
                        className="text-white/20 hover:text-white disabled:opacity-0 transition-colors p-0.5"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                    <span className="text-xs text-white/30 w-4 text-center">{i + 1}</span>
                    <div className="w-8 h-8 flex-shrink-0 rounded-lg overflow-hidden bg-white/5 pointer-events-none">
                      {app.logo_url ? (
                        <img src={buildLogoUrl(app.logo_url)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-violet-950/30" />
                      )}
                    </div>
                    <p className="text-sm text-white flex-1 min-w-0 truncate pointer-events-none">{app.title}</p>
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); handleUnpin(app); }}
                      className="text-white/30 hover:text-red-400 transition-colors flex-shrink-0 mx-2"
                    >
                      <Minus size={16} />
                    </button>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </div>

          {/* Unpinned section */}
          {unpinnedApps.length > 0 && (
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Available to pin</p>
              <div className="space-y-1">
                {unpinnedApps.map((app) => (
                  <button
                    key={app.documentId}
                    onClick={() => handlePin(app)}
                    disabled={pinnedApps.length >= 15}
                    className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0 w-full text-left hover:bg-white/3 rounded transition-colors disabled:opacity-40"
                  >
                    <div className="w-8 h-8 flex-shrink-0 rounded-lg overflow-hidden bg-white/5">
                      {app.logo_url ? (
                        <img src={buildLogoUrl(app.logo_url)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-violet-950/30" />
                      )}
                    </div>
                    <p className="text-sm text-white flex-1 min-w-0 truncate">{app.title}</p>
                    <Star size={12} className="text-white/20 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/8">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-dashboard-accent hover:opacity-90 text-sm text-white font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Star size={15} fill="currentColor" />}
            Save Top Picks
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AppTopPicksManager;
