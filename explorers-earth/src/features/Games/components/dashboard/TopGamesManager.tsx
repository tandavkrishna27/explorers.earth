import { useState } from "react";
import { motion, Reorder } from "framer-motion";

import { X, Trophy, Minus, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useGamesCommands, useGamesCallerCustody } from "../../api/query";
import type { RecommendedGame } from "../../types";
import { buildCoverUrl } from "../../utils/gameHelpers";

interface TopGamesManagerProps {
  games: RecommendedGame[];
  allGames: RecommendedGame[];
  onClose: () => void;
  onRefetch: () => void;
}

const TopGamesManager = ({ games, allGames, onClose, onRefetch }: TopGamesManagerProps) => {
  const [pinnedGames, setPinnedGames] = useState<RecommendedGame[]>(
    [...games].sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999))
  );
  const [saving, setSaving] = useState(false);
  const commands = useGamesCommands();
  const beginEffects = useGamesCallerCustody();

  const unpinnedGames = allGames.filter(
    (g) => !pinnedGames.find((pg) => pg.documentId === g.documentId)
  );

  const handleUnpin = (game: RecommendedGame) => {
    setPinnedGames((prev) => prev.filter((g) => g.documentId !== game.documentId));
  };

  const handlePin = (game: RecommendedGame) => {
    if (pinnedGames.length >= 15) {
      toast.error("Max 15 top picks allowed.");
      return;
    }
    setPinnedGames((prev) => [...prev, game]);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setPinnedGames(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];

      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === pinnedGames.length - 1) return;
    setPinnedGames(prev => {
      const next = [...prev];
      [next[index + 1], next[index]] = [next[index], next[index + 1]];

      return next;
    });
  };

  const handleSave = async () => {
    const current = beginEffects();
    setSaving(true);
    try {
      const pins = pinnedGames.map(game => { if (!game.game_list?.documentId) throw new Error('Game membership unavailable'); return { recommendationId: game.documentId, collectionId: game.game_list.documentId }; });
      await commands.savePins(pins);
      if (!current()) return;
      toast.success("Top Picks updated!");
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
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center md:p-4"
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
        {/* Mobile drag handle */}
        <div className="flex items-center justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Trophy size={16} className="text-amber-400" />
            Manage Top Picks ({pinnedGames.length}/15)
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto space-y-5">
          {/* Pinned section */}
          <div>
            <p className="text-xs text-white/50 uppercase tracking-wider mb-2">
              Pinned (shown in top picks)
            </p>
            {pinnedGames.length === 0 ? (
              <p className="text-sm text-white/30 py-4 text-center border border-dashed border-white/10 rounded-xl">
                No top picks selected. Add some below.
              </p>
            ) : (
              <Reorder.Group axis="y" values={pinnedGames} onReorder={setPinnedGames} className="space-y-1">
                {pinnedGames.map((game, i) => {
                  const coverUrl = buildCoverUrl(game.cover_url_large || game.cover_url);
                  return (
                    <Reorder.Item
                      key={game.documentId}
                      value={game}
                      className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0 bg-[#0d1117] cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveUp(i); }}
                          aria-label={`Move ${game.title} up`}
                          disabled={saving || i === 0}
                          className="text-white/20 hover:text-white disabled:opacity-0 transition-colors p-0.5"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveDown(i); }}
                          aria-label={`Move ${game.title} down`}
                          disabled={saving || i === pinnedGames.length - 1}
                          className="text-white/20 hover:text-white disabled:opacity-0 transition-colors p-0.5"
                        >
                          <ChevronDown size={12} />
                        </button>
                      </div>
                      <span className="text-xs text-white/30 w-4 text-center">{i + 1}</span>
                      <div className="w-8 h-10 flex-shrink-0 rounded overflow-hidden bg-white/5 pointer-events-none">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-amber-950/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pointer-events-none">
                        <p className="text-sm text-white truncate">{game.title}</p>
                        <p className="text-xs text-white/40 truncate">{game.game_list?.List_Name || game.developer}</p>
                      </div>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); handleUnpin(game); }}
                        aria-label={`Unpin ${game.title}`} disabled={saving}
                        className="text-white/30 hover:text-red-400 transition-colors flex-shrink-0 mx-2"
                      >
                        <Minus size={16} />
                      </button>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            )}
          </div>

          {/* Unpinned section */}
          {unpinnedGames.length > 0 && (
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Available to pin</p>
              <div className="space-y-1">
                {unpinnedGames.map((game) => {
                  const coverUrl = buildCoverUrl(game.cover_url_large || game.cover_url);
                  return (
                    <button
                      key={`${game.documentId}:${game.game_list?.documentId}`}
                      onClick={() => handlePin(game)}
                      disabled={saving || pinnedGames.length >= 15}
                      className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0 w-full text-left hover:bg-white/3 rounded transition-colors disabled:opacity-40"
                    >
                      <div className="w-8 h-10 flex-shrink-0 rounded overflow-hidden bg-white/5">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-amber-950/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{game.title}</p>
                        <p className="text-xs text-white/40 truncate">{game.developer}</p>
                      </div>
                      <Trophy size={12} className="text-white/20 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/8">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-sm text-gray-900 font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Trophy size={15} />}
            Save Top Picks
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TopGamesManager;
