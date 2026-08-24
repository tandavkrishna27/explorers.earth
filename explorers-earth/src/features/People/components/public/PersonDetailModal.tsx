import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Share2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import type { RecommendedPerson } from "../../types";
import { buildImageUrl, extractNoteText, getPlatformColor } from "../../utils/personHelpers";
import PlatformIcon from "../PlatformIcon";
import MediaViewer from "../../../../components/ui/MediaViewer";
import { useMediaViewer, convertToMediaItems } from "../../../../hooks/useMediaViewer";
import SafePublicRichText from "../../../PublicHome/components/SafePublicRichText";

interface PersonDetailModalProps {
  person: RecommendedPerson | null;
  open: boolean;
  onClose: () => void;
}

const FALLBACK_IMAGE = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23171e2e'/></svg>`;

const PersonDetailModal = ({ person, open, onClose }: PersonDetailModalProps) => {
  const { isOpen: isMediaOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const snapshotsScrollRef = useRef<HTMLDivElement>(null);

  const scrollSnapshots = (dir: "left" | "right") => {
    if (snapshotsScrollRef.current) {
      snapshotsScrollRef.current.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "unset";
    return () => { document.body.style.overflow = "unset"; };
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

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
      try { await navigator.share({ title: person?.full_name, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
    }
  }, [person?.full_name]);

  const lightboxMediaItems = useMemo(() => {
    if (!person) return [];
    const avatarUrl = buildImageUrl(person.avatar_url);
    const snapshots = person.media_details?.imageDetails ?? [];

    const items: any[] = [];
    if (avatarUrl && avatarUrl !== FALLBACK_IMAGE) {
      items.push({
        id: "avatar",
        url: avatarUrl,
        alt: person.full_name,
      });
    }
    if (snapshots && snapshots.length > 0) {
      snapshots.forEach((snap: any, index: number) => {
        items.push({
          id: `snap-${index}`,
          url: buildImageUrl(snap.url),
          alt: `Snapshot ${index + 1}`,
        });
      });
    }
    return convertToMediaItems(items);
  }, [person]);

  if (!person) return null;

  const avatarUrl = buildImageUrl(person.avatar_url);
  const noteText = extractNoteText(person.user_recommendation_note);
  const platformGradient = getPlatformColor(person.platform || null);
  const snapshots = person.media_details?.imageDetails ?? [];

  const handleImageClick = (type: 'avatar' | 'snap', index: number = 0) => {
    let targetIndex = 0;
    const hasAvatar = avatarUrl && avatarUrl !== FALLBACK_IMAGE;
    if (type === 'avatar') {
      targetIndex = 0;
    } else if (type === 'snap') {
      targetIndex = (hasAvatar ? 1 : 0) + index;
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
              className="relative bg-[#0d1117] rounded-t-2xl w-full h-full md:max-w-2xl overflow-y-auto overflow-x-hidden flex flex-col shadow-2xl ring-1 ring-white/10 hide-scrollbar scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pointer-events-auto"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Hero backdrop (gradient based on platform) */}
              <div className={`relative h-40 md:h-48 flex-shrink-0 overflow-hidden bg-gradient-to-br ${platformGradient}`}>
                {avatarUrl && (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover opacity-30 filter blur-lg scale-110" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d1117] via-[#0d1117]/20 to-transparent" />

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
                {/* Avatar + Name row */}
                <div className="flex gap-4 px-5 -mt-16 relative z-10 items-end">
                  <div 
                    onClick={() => handleImageClick("avatar")}
                    className="flex-shrink-0 w-28 h-28 rounded-full overflow-hidden ring-4 ring-[#0d1117] shadow-2xl bg-[#1a2332] cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <img
                      src={avatarUrl || FALLBACK_IMAGE}
                      alt={person.full_name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE; }}
                    />
                  </div>
                  <div className="flex-1 pt-16 min-w-0 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-bold text-white leading-tight">{person.full_name}</h2>
                      {person.platform && (
                        <PlatformIcon platform={person.platform} size={16} className="flex-shrink-0" />
                      )}
                    </div>
                    {person.handle && (
                      <p className="text-sm text-white/40 mt-0.5">@{person.handle}</p>
                    )}
                  </div>
                </div>

                <div className="px-5 mt-4 space-y-5 pb-6">
                  {/* Meta pills */}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {person.user_rating && (
                      <span className="flex items-center gap-1 text-yellow-400 font-semibold">
                        <Star size={13} fill="currentColor" /> {person.user_rating}/10
                      </span>
                    )}
                    {person.follower_count && (
                      <span className="text-white/40 text-xs">{person.follower_count} followers</span>
                    )}
                    {person.location && (
                      <span className="text-white/40 text-xs">📍 {person.location}</span>
                    )}
                  </div>

                  {/* Headline */}
                  {person.headline && (
                    <p className="text-sm font-semibold text-white/80">{person.headline}</p>
                  )}

                  {/* Bio */}
                  {person.bio && (
                    <p className="text-sm text-white/60 leading-relaxed">{person.bio}</p>
                  )}

                  {/* Tags */}
                  {person.tags && person.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {person.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-violet-500/15 border border-violet-500/25 text-violet-300 px-2.5 py-1 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Creator note */}
                  {noteText && (
                    <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                      <p className="text-xs font-semibold text-violet-400 mb-1.5 uppercase tracking-wider">Creator's Note</p>
                      <SafePublicRichText
                        className="text-sm text-white/80 leading-relaxed [&_p]:mb-2 [&_p]:last:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h2]:text-md [&_h3]:text-base font-normal max-w-none"
                        html={noteText}
                      />
                    </div>
                  )}

                  {/* Creator Rating */}
                  {person.user_rating && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between">
                      <p className="text-xs font-semibold text-yellow-500 uppercase tracking-wider">Creator's Rating</p>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(star => (
                          <Star
                            key={star}
                            size={16}
                            fill={person.user_rating! >= star ? "currentColor" : "none"}
                            className={person.user_rating! >= star ? "text-yellow-400" : "text-white/20"}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Photos & Media Gallery */}
                  {snapshots.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                        Photos & Media
                      </p>
                      <div className="relative group">
                        <button
                          onClick={() => scrollSnapshots("left")}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -ml-2 backdrop-blur-sm pointer-events-auto"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <div
                          ref={snapshotsScrollRef}
                          className="flex overflow-x-auto pb-4 -mx-5 px-5 gap-3 hide-scrollbar scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                        >
                          {snapshots.map((snap: any, i: number) => (
                            <div
                              key={snap.id}
                              onClick={() => handleImageClick("snap", i)}
                              className="flex-shrink-0 w-56 aspect-video rounded-xl overflow-hidden border border-white/10 bg-[#1a2332] cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                            >
                              <img
                                src={buildImageUrl(snap.url)}
                                className="w-full h-full object-cover"
                                alt="Snapshot"
                              />
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => scrollSnapshots("right")}
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -mr-2 backdrop-blur-sm pointer-events-auto"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Source list */}
                  {person.person_list && (
                    <p className="text-xs text-white/30">
                      From the list: <span className="text-violet-400">{person.person_list.List_Name}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Footer actions */}
              <div className="flex-shrink-0 border-t border-white/8 px-5 py-4 flex items-center justify-between gap-3 bg-[#0d1117]">
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/8 transition-all"
                >
                  <Share2 size={14} /> Share
                </button>
                <div className="flex gap-2">
                  {person.profile_url && (
                    <a
                      href={person.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-sm text-white font-medium transition-colors"
                    >
                      <ExternalLink size={14} /> View Profile
                    </a>
                  )}
                </div>
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

export default PersonDetailModal;
