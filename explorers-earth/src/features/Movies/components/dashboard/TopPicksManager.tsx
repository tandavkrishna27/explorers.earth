import { useState, useRef } from "react";
import { motion, Reorder } from "framer-motion";
import { explorersApiClient } from "../../../../lib/explorersApiClient";
import { readMoviesOwnerContent, moviesCommandKey } from "../../api/moviesClient";
import { invalidateMovies } from "../../api/explorersAdapter";
import { X, Star, Minus, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import type { RecommendedMovie } from "../../types";
import { buildPosterUrl } from "../../utils/movieHelpers";

interface TopPicksManagerProps {
  movies: RecommendedMovie[];
  allMovies: RecommendedMovie[];
  onClose: () => void;
  onRefetch: () => void;
  listId: string;
}

const TopPicksManager = ({
  movies,
  allMovies,
  onClose,
  onRefetch,
  // listId kept in interface for future drag-and-drop reorder API call
}: TopPicksManagerProps) => {
  const [pinnedMovies, setPinnedMovies] = useState<RecommendedMovie[]>(
    [...movies].sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999))
  );
  const [saving, setSaving] = useState(false);
  const busy=useRef(false);


  const unpinnedMovies = allMovies.filter(m => !pinnedMovies.find(pm => pm.documentId === m.documentId));

  const handleUnpin = (movie: RecommendedMovie) => {
    if(busy.current)return;
    setPinnedMovies(prev => prev.filter(m => m.documentId !== movie.documentId));
  };

  const handlePin = (movie: RecommendedMovie) => {
    if(busy.current)return;
    if (pinnedMovies.length >= 15) {
      toast.error("Max 15 top picks allowed.");
      return;
    }
    setPinnedMovies(prev => [...prev, movie]);
  };

  const persist = async (order:RecommendedMovie[], exact:boolean) => {
    const content=await readMoviesOwnerContent();
    const pins=order.map(movie=>{const saved=content.observation.topPicks?.find(pin=>pin.recommendationId===movie.documentId);const members=content.observation.memberships.filter(member=>member.recommendationId===movie.documentId&&!member.collectionArchived&&!member.recommendationArchived);const member=members.find(value=>value.collectionId===saved?.collectionId)??members[0];if(!member)throw Error('Movie membership changed. Refresh and try again.');return {recommendationId:movie.documentId,collectionId:member.collectionId};});
    if(exact)await explorersApiClient.setMyCategoryTopPicks(content.observation,pins,moviesCommandKey());
    else await explorersApiClient.upsertMyCategoryTopPickOrder(content.observation,pins,moviesCommandKey());
    invalidateMovies();
  };
  const syncOrder=async(order:RecommendedMovie[])=>{if(busy.current)return;busy.current=true;setSaving(true);try{await persist(order,false);onRefetch();}catch{toast.error('Failed to save order. Your staged selection is preserved.');}finally{busy.current=false;setSaving(false);}};
  const move=(index:number,offset:number)=>{if(saving||index+offset<0||index+offset>=pinnedMovies.length)return;const next=[...pinnedMovies];[next[index],next[index+offset]]=[next[index+offset],next[index]];setPinnedMovies(next);void syncOrder(next);};
  const handleMoveUp=(index:number)=>move(index,-1);
  const handleMoveDown=(index:number)=>move(index,1);
  const handleSave=async()=>{if(busy.current)return;busy.current=true;setSaving(true);try{await persist(pinnedMovies,true);toast.success('Top picks updated!');onRefetch();onClose();}catch{toast.error('Failed to save. Your staged selection is preserved.');}finally{busy.current=false;setSaving(false);}};
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
            <Star size={16} className="text-yellow-400" fill="currentColor" />
            Manage Top Picks ({pinnedMovies.length}/15)
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto space-y-5">
          {/* Pinned section */}
          <div>
            <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Pinned (shown in top picks)</p>
            {pinnedMovies.length === 0 ? (
              <p className="text-sm text-white/30 py-4 text-center border border-dashed border-white/10 rounded-xl">
                No top picks selected. Add some below.
              </p>
            ) : (
              <Reorder.Group axis="y" values={pinnedMovies} onReorder={setPinnedMovies} className="space-y-1">
                {pinnedMovies.map((movie, i) => (
                  <Reorder.Item
                    key={movie.documentId}
                    value={movie}
                    onDragEnd={() => syncOrder(pinnedMovies)}
                    className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0 bg-[#0d1117] cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMoveUp(i); }}
                        disabled={saving || i === 0}
                        className="text-white/20 hover:text-white disabled:opacity-0 transition-colors p-0.5"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMoveDown(i); }}
                        disabled={saving || i === pinnedMovies.length - 1}
                        className="text-white/20 hover:text-white disabled:opacity-0 transition-colors p-0.5"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                    <span className="text-xs text-white/30 w-4 text-center">{i + 1}</span>
                    <div className="w-8 h-12 flex-shrink-0 rounded overflow-hidden bg-white/5 pointer-events-none">
                      {movie.poster_path ? (
                        <img src={buildPosterUrl(movie.poster_path, "w92")} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-blue-950/30" />
                      )}
                    </div>
                    <p className="text-sm text-white flex-1 min-w-0 truncate pointer-events-none">{movie.title}</p>
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); handleUnpin(movie); }}
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
          {unpinnedMovies.length > 0 && (
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Available to pin</p>
              <div className="space-y-1">
                {unpinnedMovies.map((movie) => (
                  <button
                    key={movie.documentId}
                    onClick={() => handlePin(movie)}
                    disabled={pinnedMovies.length >= 15}
                    className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0 w-full text-left hover:bg-white/3 rounded transition-colors disabled:opacity-40"
                  >
                    <div className="w-8 h-12 flex-shrink-0 rounded overflow-hidden bg-white/5">
                      {movie.poster_path ? (
                        <img src={buildPosterUrl(movie.poster_path, "w92")} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-blue-950/30" />
                      )}
                    </div>
                    <p className="text-sm text-white flex-1 min-w-0 truncate">{movie.title}</p>
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
            className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-sm text-gray-900 font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Star size={15} fill="currentColor" />}
            Save Top Picks
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TopPicksManager;
