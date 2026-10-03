import { useState, useRef, useEffect } from "react";
import useAuthStore from "../../../../store/store";
import { motion, Reorder } from "framer-motion";
import { explorersApiClient } from "../../../../lib/explorersApiClient";
import { useBooksOwnerContent } from "../../api/useBooksOwnerContent";
import { booksCommandKey } from "../../api/booksClient";
import { X, Star, Minus, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import type { RecommendedBook } from "../../types";
import { buildCoverUrl, formatAuthors } from "../../utils/bookHelpers";

interface TopReadsManagerProps {
  books: RecommendedBook[];
  allBooks: RecommendedBook[];
  onClose: () => void;
  onRefetch: () => void;
}

const TopReadsManager = ({ books, allBooks, onClose, onRefetch }: TopReadsManagerProps) => {
  const generation = useAuthStore(state=>state.generation);
  const origin = useRef(generation);
  const current = () => useAuthStore.getState().generation === origin.current;
  useEffect(()=>{if(generation!==origin.current)onClose();},[generation,onClose]);
  const [pinnedBooks, setPinnedBooks] = useState<RecommendedBook[]>(
    [...books].sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999))
  );
  const [saving, setSaving] = useState(false);
  const {content,refetch} = useBooksOwnerContent();

  const unpinnedBooks = allBooks.filter(
    (b) => !pinnedBooks.find((pb) => pb.documentId === b.documentId)
  );

  const handleUnpin = (book: RecommendedBook) => {
    setPinnedBooks((prev) => prev.filter((b) => b.documentId !== book.documentId));
  };

  const handlePin = (book: RecommendedBook) => {
    if (pinnedBooks.length >= 15) {
      toast.error("Max 15 top reads allowed.");
      return;
    }
    setPinnedBooks((prev) => [...prev, book]);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    if(saving || !content) return;
    const next=[...pinnedBooks];[next[index-1],next[index]]=[next[index],next[index-1]];setPinnedBooks(next);void syncOrder(next);
  };

  const handleMoveDown = (index: number) => {
    if (index === pinnedBooks.length - 1) return;
    if(saving || !content) return;
    const next=[...pinnedBooks];[next[index+1],next[index]]=[next[index],next[index+1]];setPinnedBooks(next);void syncOrder(next);
  };

  const pinsFor = (items:RecommendedBook[]) => items.map(book => {
    const selectedCollection=content?.observation.topPicks?.find(pin=>pin.recommendationId===book.documentId)?.collectionId ?? book.book_list?.documentId;
    const membership=content?.observation.memberships.find(m=>m.recommendationId===book.documentId && m.collectionId===selectedCollection);
    if(!membership) throw new Error("Refresh Books before saving pins");
    return {recommendationId:book.documentId,collectionId:membership.collectionId};
  });
  const syncOrder = async (orderToSync:RecommendedBook[]) => {
    if(saving || !content) return; setSaving(true);
    try { await explorersApiClient.upsertMyCategoryTopPickOrder(content.observation,pinsFor(orderToSync),booksCommandKey()); if(!current())return;await refetch();if(current())onRefetch(); }
    catch(error){ if(current())toast.error(error instanceof Error?error.message:"Failed to auto-save new order."); }
    finally {if(current())setSaving(false);}
  };
  const handleSave=async()=> {
    if(saving || !content) return; setSaving(true);
    try {await explorersApiClient.setMyCategoryTopPicks(content.observation,pinsFor(pinnedBooks),booksCommandKey());if(!current())return;await refetch();if(!current())return;toast.success("Top Reads updated!");onRefetch();onClose();}
    catch(error){if(current())toast.error(error instanceof Error?error.message:"Failed to save. Please try again.");}
    finally {if(current())setSaving(false);}
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
            <Star size={16} className="text-amber-400" fill="currentColor" />
            Manage Top Reads ({pinnedBooks.length}/15)
          </h2>
          <button aria-label="Close Top Reads" onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto space-y-5">
          {/* Pinned section */}
          <div>
            <p className="text-xs text-white/50 uppercase tracking-wider mb-2">
              Pinned (shown in top reads)
            </p>
            {pinnedBooks.length === 0 ? (
              <p className="text-sm text-white/30 py-4 text-center border border-dashed border-white/10 rounded-xl">
                No top reads selected. Add some below.
              </p>
            ) : (
              <Reorder.Group axis="y" values={pinnedBooks} onReorder={setPinnedBooks} className="space-y-1">
                {pinnedBooks.map((book, i) => {
                  const coverUrl = buildCoverUrl(book.cover_url_large || book.cover_url);
                  return (
                    <Reorder.Item
                      key={book.documentId}
                      value={book}
                      onDragEnd={() => syncOrder(pinnedBooks)}
                      className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0 bg-[#0d1117] cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveUp(i); }}
                          aria-label={`Move ${book.title} up`}
                          disabled={i === 0 || saving || !content}
                          className="text-white/20 hover:text-white disabled:opacity-0 transition-colors p-0.5"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveDown(i); }}
                          aria-label={`Move ${book.title} down`}
                          disabled={i === pinnedBooks.length - 1 || saving || !content}
                          className="text-white/20 hover:text-white disabled:opacity-0 transition-colors p-0.5"
                        >
                          <ChevronDown size={12} />
                        </button>
                      </div>
                      <span className="text-xs text-white/30 w-4 text-center">{i + 1}</span>
                      <div className="w-8 h-11 flex-shrink-0 rounded overflow-hidden bg-white/5 pointer-events-none">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-amber-950/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pointer-events-none">
                        <p className="text-sm text-white truncate">{book.title}</p>
                        <p className="text-xs text-white/40 truncate">{formatAuthors(book.authors)}</p>
                      </div>
                      <button
                        aria-label={`Unpin ${book.title}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); handleUnpin(book); }}
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
          {unpinnedBooks.length > 0 && (
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Available to pin</p>
              <div className="space-y-1">
                {unpinnedBooks.map((book) => {
                  const coverUrl = buildCoverUrl(book.cover_url_large || book.cover_url);
                  return (
                    <button
                      key={book.documentId}
                      onClick={() => handlePin(book)}
                      disabled={pinnedBooks.length >= 15}
                      className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0 w-full text-left hover:bg-white/3 rounded transition-colors disabled:opacity-40"
                    >
                      <div className="w-8 h-11 flex-shrink-0 rounded overflow-hidden bg-white/5">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-amber-950/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{book.title}</p>
                        <p className="text-xs text-white/40 truncate">{formatAuthors(book.authors)}</p>
                      </div>
                      <Star size={12} className="text-white/20 flex-shrink-0" />
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
            disabled={saving || !content}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-sm text-gray-900 font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Star size={15} fill="currentColor" />}
            Save Top Reads
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TopReadsManager;
