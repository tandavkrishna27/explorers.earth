import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Gamepad2, Calendar, Share2, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import type { RecommendedGame } from "../../types";
import { buildCoverUrl, extractNoteText } from "../../utils/gameHelpers";
import MediaViewer from "../../../../components/ui/MediaViewer";
import { useMediaViewer, convertToMediaItems } from "../../../../hooks/useMediaViewer";
import SafePublicRichText from "../../../PublicHome/components/SafePublicRichText";

interface GameDetailModalProps {
  game: RecommendedGame | null;
  open: boolean;
  onClose: () => void;
}

const FALLBACK_COVER = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'><rect width='300' height='450' fill='%23171e2e'/></svg>`;

const GameDetailModal = ({ game, open, onClose }: GameDetailModalProps) => {
  const { isOpen: isMediaOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const snapshotsScrollRef = useRef<HTMLDivElement>(null);

  const scrollSnapshots = (dir: "left" | "right") => {
    if (snapshotsScrollRef.current) {
      const amount = dir === "left" ? -300 : 300;
      snapshotsScrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Swipe to dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    setDragStartY(e.touches[0].clientY);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (dragStartY === null) return;
    const delta = e.changedTouches[0].clientY - dragStartY;
    if (delta > 100) onClose();
    setDragStartY(null);
  };

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: game?.title, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
    }
  }, [game?.title]);

  const lightboxMediaItems = useMemo(() => {
    if (!game) return [];
    const coverUrl = buildCoverUrl(game.cover_url_large || game.cover_url);
    const screenshots = game.media_details?.imageDetails?.length 
      ? game.media_details.imageDetails.map((img: any) => buildCoverUrl(img.url))
      : (game.screenshot_ids?.map((id: string) => `https://images.igdb.com/igdb/image/upload/t_1080p/${id}.jpg`) || []);

    const items: any[] = [];
    if (coverUrl && coverUrl !== FALLBACK_COVER) {
      items.push({
        id: "cover",
        url: coverUrl,
        alt: game.title,
      });
    }
    if (screenshots && screenshots.length > 0) {
      screenshots.forEach((url: string, index: number) => {
        items.push({
          id: `screenshot-${index}`,
          url,
          alt: `Screenshot ${index + 1}`,
        });
      });
    }
    return convertToMediaItems(items);
  }, [game]);

  if (!game) return null;

  const coverUrl = buildCoverUrl(game.cover_url_large || game.cover_url);
  const screenshots = game.media_details?.imageDetails?.length 
    ? game.media_details.imageDetails.map((img: any) => buildCoverUrl(img.url))
    : (game.screenshot_ids?.map((id: string) => `https://images.igdb.com/igdb/image/upload/t_1080p/${id}.jpg`) || []);

  const backdropUrl = screenshots.length > 0 ? screenshots[0] : null;
  const noteText = extractNoteText(game.user_recommendation_note);

  const handleImageClick = (type: 'cover' | 'screenshot', index: number = 0) => {
    let targetIndex = 0;
    const hasCover = coverUrl && coverUrl !== FALLBACK_COVER;
    if (type === 'cover') {
      targetIndex = 0;
    } else if (type === 'screenshot') {
      targetIndex = (hasCover ? 1 : 0) + index;
    }
    openViewer(targetIndex);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal panel wrapper */}
          <div className="fixed inset-0 pt-[88px] md:pt-8 flex items-end justify-center z-[150] pointer-events-none">
            <motion.div
              className="relative bg-[#0d1117] rounded-t-2xl w-full h-full md:max-w-3xl overflow-y-auto overflow-x-hidden flex flex-col shadow-2xl ring-1 ring-white/10 hide-scrollbar scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pointer-events-auto"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Backdrop hero */}
              <div className="relative h-48 md:h-56 flex-shrink-0 overflow-hidden">
                {backdropUrl ? (
                  <img src={backdropUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#1a2332] to-[#0d1117]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d1117] via-[#0d1117]/40 to-transparent" />

                {/* Drag handle (mobile) */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/30 md:hidden" />

                {/* Close button */}
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80 hover:text-white transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content area */}
              <div ref={contentRef} className="flex-1 pb-24 md:pb-6 w-full">
                <div className="flex gap-4 px-5 -mt-16 relative z-10">
                  {/* Poster */}
                  <div 
                    onClick={() => handleImageClick("cover")}
                    className="flex-shrink-0 w-28 rounded-xl overflow-hidden ring-2 ring-white/10 shadow-2xl bg-[#161b22] cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <img
                      src={coverUrl || FALLBACK_COVER}
                      alt={game.title}
                      className="w-full aspect-[3/4] object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_COVER; }}
                    />
                  </div>

                  {/* Title */}
                  <div className="flex-1 pt-16 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      {game.is_pinned && (
                        <span className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                          <Trophy size={10} className="fill-current" /> Top Pick
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-white mt-1 leading-tight">{game.title}</h2>
                    {game.developer && (
                      <p className="text-xs text-white/40 mt-0.5">{game.developer}</p>
                    )}
                  </div>
                </div>

                <div className="px-5 mt-4 space-y-5 pb-6">
                  {/* Metadata pills */}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {game.release_year && (
                      <span className="text-white/60 flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                        <Calendar size={13} /> {game.release_year}
                      </span>
                    )}
                    {game.igdb_rating && (
                      <span className="flex items-center gap-1.5 text-blue-400 font-semibold bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/10">
                        <Star size={13} fill="currentColor" /> {game.igdb_rating.toFixed(1)} IGDB
                      </span>
                    )}
                    {game.platforms && game.platforms.length > 0 && (
                      <span className="flex items-center gap-1.5 text-white/50 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                        <Gamepad2 size={13} /> {game.platforms[0]}
                      </span>
                    )}
                  </div>

                  {/* Genres */}
                  {game.genres && game.genres.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {game.genres.map((g) => (
                        <span key={g} className="text-xs bg-white/8 text-white/60 px-2.5 py-1 rounded-full border border-white/10">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Summary */}
                  {game.summary && (
                    <p className="text-sm text-white/60 leading-relaxed">{game.summary}</p>
                  )}

                   {/* Creator note */}
                   {noteText && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                      <p className="text-xs font-semibold text-blue-400 mb-1.5 uppercase tracking-wider">Creator's Note</p>
                      <SafePublicRichText
                        className="text-sm text-white/80 leading-relaxed font-normal max-w-none prose prose-invert prose-sm"
                        html={noteText}
                      />
                    </div>
                  )}

                  {/* Creator Rating */}
                  {game.user_rating && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between">
                      <p className="text-xs font-semibold text-yellow-500 uppercase tracking-wider">Creator's Rating</p>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(star => (
                          <Star 
                            key={star} 
                            size={16} 
                            fill={game.user_rating! >= star ? "currentColor" : "none"} 
                            className={game.user_rating! >= star ? "text-yellow-400" : "text-white/20"} 
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Screenshots gallery */}
                  {screenshots.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                        Screenshots & Media
                      </p>
                      <div className="relative group">
                        <button
                          onClick={() => scrollSnapshots("left")}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -ml-2 backdrop-blur-sm"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <div ref={snapshotsScrollRef} className="flex overflow-x-auto pb-4 -mx-5 px-5 gap-3 hide-scrollbar scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          {screenshots.map((url, i) => (
                            <div 
                              key={i} 
                              onClick={() => handleImageClick("screenshot", i)}
                              className="flex-shrink-0 w-64 aspect-video rounded-xl overflow-hidden border border-white/10 bg-[#1a2332] cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                            >
                              <img 
                                src={url} 
                                className="w-full h-full object-cover" 
                                alt={`Screenshot ${i + 1}`} 
                              />
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => scrollSnapshots("right")}
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -mr-2 backdrop-blur-sm"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Source list */}
                  {game.game_list && (
                    <p className="text-xs text-white/30">
                      From the list: <span className="text-blue-400">{game.game_list.List_Name}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Footer actions */}
              <div className="flex-shrink-0 border-t border-white/8 px-5 py-3 flex items-center justify-end gap-2 bg-[#0d1117]">
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/8 transition-all"
                >
                  <Share2 size={14} /> Share
                </button>
              </div>
            </motion.div>
          </div>
          <MediaViewer
            mediaItems={lightboxMediaItems}
            initialIndex={currentIndex}
            isOpen={isMediaOpen}
            onClose={closeViewer}
          />
        </>
      )}
    </AnimatePresence>
  );
};

export default GameDetailModal;
