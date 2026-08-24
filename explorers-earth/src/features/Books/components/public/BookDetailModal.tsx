import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, ExternalLink, Share2, ChevronLeft, ChevronRight, BookOpen, Hash, Calendar } from "lucide-react";
import type { RecommendedBook } from "../../types";
import { buildCoverUrl, formatAuthors, extractNoteText, formatRating, formatPageCount } from "../../utils/bookHelpers";
import MediaViewer from "../../../../components/ui/MediaViewer";
import { useMediaViewer, convertToMediaItems } from "../../../../hooks/useMediaViewer";
import SafePublicRichText from "../../../PublicHome/components/SafePublicRichText";

interface BookDetailModalProps {
  book: RecommendedBook | null;
  open: boolean;
  onClose: () => void;
}

const FALLBACK = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'><rect width='300' height='450' fill='%23171e2e'/></svg>`;

const BookDetailModal = ({ book, open, onClose }: BookDetailModalProps) => {
  const { isOpen: isMediaOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const snapshotsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setPhotoIndex(0);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Swipe down to dismiss
  const handleTouchStart = (e: React.TouchEvent) => setDragStartY(e.touches[0].clientY);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (dragStartY === null) return;
    if (e.changedTouches[0].clientY - dragStartY > 100) onClose();
    setDragStartY(null);
  };

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: book?.title, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
    }
  }, [book?.title]);

  const lightboxMediaItems = useMemo(() => {
    if (!book) return [];
    const thumbnailUrl = buildCoverUrl(book.cover_url_large || book.cover_url) || FALLBACK;
    const snapshots = book.media_details?.imageDetails ?? [];
    const photos = book.Media?.filter((m) => m.url) ?? [];

    const items: any[] = [];
    if (thumbnailUrl && thumbnailUrl !== FALLBACK) {
      items.push({
        id: "cover",
        url: thumbnailUrl,
        alt: book.title,
      });
    }
    if (snapshots && snapshots.length > 0) {
      snapshots.forEach((snap: any, index: number) => {
        const url = snap.url.startsWith("http") ? snap.url : `${import.meta.env.VITE_REST_API_URL?.replace("/api", "") || "http://localhost:1337"}${snap.url}`;
        items.push({
          id: `snap-${index}`,
          url,
          alt: `Snapshot ${index + 1}`,
        });
      });
    }
    if (photos && photos.length > 0) {
      photos.forEach((photo: any, index: number) => {
        items.push({
          id: `photo-${index}`,
          url: photo.url,
          alt: `Creator Photo ${index + 1}`,
        });
      });
    }
    return convertToMediaItems(items);
  }, [book]);

  if (!book) return null;

  const coverUrl = buildCoverUrl(book.cover_url) || FALLBACK;
  const thumbnailUrl = buildCoverUrl(book.cover_url_large || book.cover_url) || FALLBACK;
  const authors = formatAuthors(book.authors);
  const noteText = extractNoteText(book.user_recommendation_note);
  const googleRating = formatRating(book.google_rating);
  const pageCount = formatPageCount(book.page_count);
  const photos = book.Media?.filter((m) => m.url) ?? [];
  const buyLinks = book.buy_links ?? [];
  const snapshots = book.media_details?.imageDetails ?? [];

  const handleImageClick = (type: 'cover' | 'snap' | 'photo', index: number = 0) => {
    let targetIndex = 0;
    const hasCover = thumbnailUrl && thumbnailUrl !== FALLBACK;
    if (type === 'cover') {
      targetIndex = 0;
    } else if (type === 'snap') {
      targetIndex = (hasCover ? 1 : 0) + index;
    } else if (type === 'photo') {
      const snapCount = snapshots.length;
      targetIndex = (hasCover ? 1 : 0) + snapCount + index;
    }
    openViewer(targetIndex);
  };

  const scrollSnapshots = (dir: "left" | "right") => {
    if (snapshotsScrollRef.current) {
      snapshotsScrollRef.current.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
    }
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

          {/* Modal Overlay Container */}
          <div className="fixed inset-0 pt-[88px] md:pt-8 flex items-end justify-center z-[150] pointer-events-none">
            <motion.div
              className="relative bg-[#0d1117] rounded-t-2xl w-full h-full md:max-w-2xl overflow-y-auto overflow-x-hidden flex flex-col shadow-2xl ring-1 ring-white/10 hide-scrollbar scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pointer-events-auto"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header gradient area */}
              <div className="relative h-40 md:h-48 flex-shrink-0 overflow-hidden bg-gradient-to-br from-amber-950/60 to-[#0d1117]">
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d1117] via-[#0d1117]/40 to-transparent" />

                {/* Drag handle (mobile) */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/30 md:hidden" />

                {/* Background cover art (blurred) */}
                {coverUrl && (
                  <img
                    src={coverUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-20 blur-xl scale-110 pointer-events-none"
                  />
                )}

                {/* Close button - Moved after image to be on top */}
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80 hover:text-white transition-all z-20 pointer-events-auto"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content area */}
              <div className="flex-1 pb-24 md:pb-6 w-full">
                <div className="flex gap-4 px-5 -mt-28 relative z-10">
                  {/* Book cover (portrait) */}
                  <div 
                    onClick={() => handleImageClick("cover")}
                    className="flex-shrink-0 w-28 rounded-xl overflow-hidden ring-2 ring-white/10 shadow-2xl self-end cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <img
                      src={thumbnailUrl}
                      alt={book.title}
                      className="w-full aspect-[2/3] object-cover"
                      onError={(e) => { 
                        const target = e.currentTarget as HTMLImageElement;
                        if (target.src === book.cover_url_large && book.cover_url) {
                          target.src = buildCoverUrl(book.cover_url);
                        } else {
                          target.src = FALLBACK;
                        }
                      }}
                    />
                  </div>

                  {/* Title info */}
                  <div className="flex-1 pt-28 min-w-0">
                    <h2 className="text-xl font-bold text-white mt-1 leading-tight">{book.title}</h2>
                    {book.subtitle && (
                      <p className="text-sm text-white/50 mt-0.5 leading-tight">{book.subtitle}</p>
                    )}
                  </div>
                </div>

                <div className="px-5 mt-4 space-y-5 pb-6">
                  {/* Authors */}
                  <p className="text-sm text-white/70 font-medium">{authors}</p>

                  {/* Metadata pills */}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {book.year && (
                      <span className="flex items-center gap-1 text-white/50">
                        <Calendar size={12} /> {book.year}
                      </span>
                    )}
                    {googleRating && (
                      <span className="flex items-center gap-1 text-white/50 font-medium">
                        <Star size={12} fill="currentColor" className="text-amber-400" /> {googleRating}
                      </span>
                    )}
                    {pageCount && (
                      <span className="flex items-center gap-1 text-white/50">
                        <Hash size={12} /> {pageCount}
                      </span>
                    )}
                    {book.publisher && (
                      <span className="flex items-center gap-1 text-white/50">
                        <BookOpen size={12} /> {book.publisher}
                      </span>
                    )}
                  </div>

                  {/* Subjects */}
                  {book.subjects && book.subjects.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {book.subjects.slice(0, 5).map((s) => (
                        <span key={s} className="text-xs bg-white/8 text-white/60 px-2.5 py-1 rounded-full border border-white/10">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Description */}
                  {book.description && (
                    <p className="text-sm text-white/60 leading-relaxed line-clamp-6">{book.description}</p>
                  )}

                  {/* Creator note */}
                  {noteText && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                      <p className="text-xs font-semibold text-amber-400 mb-1.5 uppercase tracking-wider">Creator's Note</p>
                      <SafePublicRichText
                        className="text-sm text-white/80 leading-relaxed [&_p]:mb-2 [&_p]:last:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 font-normal max-w-none"
                        html={noteText}
                      />
                    </div>
                  )}

                  {/* Creator Rating */}
                  {book.user_rating && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between">
                      <p className="text-xs font-semibold text-yellow-500 uppercase tracking-wider">Creator's Rating</p>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                          <Star
                            key={star}
                            size={14}
                            fill={book.user_rating! >= star ? "currentColor" : "none"}
                            className={book.user_rating! >= star ? "text-yellow-400" : "text-white/20"}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manual Snapshots */}
                  {snapshots.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Photos</p>
                      <div className="relative group">
                        <button onClick={() => scrollSnapshots("left")} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -ml-2 backdrop-blur-sm">
                          <ChevronLeft size={16} />
                        </button>
                        <div ref={snapshotsScrollRef} className="flex overflow-x-auto pb-4 -mx-5 px-5 gap-3 hide-scrollbar scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          {snapshots.map((snap: any, i: number) => (
                            <div 
                              key={snap.id} 
                              onClick={() => handleImageClick("snap", i)}
                              className="flex-shrink-0 w-56 aspect-video rounded-xl overflow-hidden border border-white/10 bg-[#1a2332] cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                            >
                              <img
                                src={snap.url.startsWith("http") ? snap.url : `${import.meta.env.VITE_REST_API_URL?.replace("/api", "") || "http://localhost:1337"}${snap.url}`}
                                className="w-full h-full object-cover"
                                alt=""
                              />
                            </div>
                          ))}
                        </div>
                        <button onClick={() => scrollSnapshots("right")} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -mr-2 backdrop-blur-sm">
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Creator photos from Media */}
                  {photos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Photos</p>
                      <div className="relative">
                        <div 
                          onClick={() => handleImageClick("photo", photoIndex)}
                          className="aspect-video rounded-xl overflow-hidden bg-white/5 cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
                        >
                          <img src={photos[photoIndex]?.url} alt="" className="w-full h-full object-cover" />
                        </div>
                        {photos.length > 1 && (
                          <div className="flex items-center justify-between mt-2">
                            <button onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))} disabled={photoIndex === 0} className="p-1 text-white/50 hover:text-white disabled:opacity-30">
                              <ChevronLeft size={20} />
                            </button>
                            <span className="text-xs text-white/40">{photoIndex + 1} / {photos.length}</span>
                            <button onClick={() => setPhotoIndex((i) => Math.min(photos.length - 1, i + 1))} disabled={photoIndex === photos.length - 1} className="p-1 text-white/50 hover:text-white disabled:opacity-30">
                              <ChevronRight size={20} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Buy links */}
                  {buyLinks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Where to Find / Buy</p>
                      <div className="flex flex-wrap gap-2">
                        {buyLinks.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-white/8 hover:bg-white/12 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 transition-colors"
                          >
                            {link.name}
                            <ExternalLink size={11} className="text-white/30" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview link */}
                  {/* Source list */}
                  {book.book_list && (
                    <p className="text-xs text-white/30">
                      From the list: <span className="text-amber-400">{book.book_list.List_Name}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Footer */}
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

export default BookDetailModal;
