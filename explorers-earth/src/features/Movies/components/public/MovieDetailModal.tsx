import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Clock, User, ExternalLink, Share2, Tv, ChevronLeft, ChevronRight } from "lucide-react";
import type { RecommendedMovie, TMDBCastMember } from "../../types";
import { buildPosterUrl, buildBackdropUrl, buildLogoUrl, formatRating, formatRuntime, getGenreNames, extractNoteText } from "../../utils/movieHelpers";
import MediaViewer from "../../../../components/ui/MediaViewer";
import { useMediaViewer, convertToMediaItems } from "../../../../hooks/useMediaViewer";
import SafePublicRichText from "../../../PublicHome/components/SafePublicRichText";

interface MovieDetailModalProps {
  movie: RecommendedMovie | null;
  open: boolean;
  onClose: () => void;
}

const FALLBACK_POSTER = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'><rect width='300' height='450' fill='%23171e2e'/></svg>`;

const MovieDetailModal = ({ movie, open, onClose }: MovieDetailModalProps) => {
  const { isOpen: isMediaOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [cast, setCast] = useState<TMDBCastMember[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const castScrollRef = useRef<HTMLDivElement>(null);
  const snapshotsScrollRef = useRef<HTMLDivElement>(null);

  const scrollCast = (dir: "left" | "right") => {
    if (castScrollRef.current) {
      const amount = dir === "left" ? -250 : 250;
      castScrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  const scrollSnapshots = (dir: "left" | "right") => {
    if (snapshotsScrollRef.current) {
      const amount = dir === "left" ? -300 : 300;
      snapshotsScrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (!open) {
      setPhotoIndex(0);
      setCast([]);
      return;
    }
    if (movie) {
      // Cast is now directly embedded inside the Strapi response JSON structure!
      // We map the structure (CastDetail) to the state shape we need (TMDBCastMember)
      if (movie.cast_details && Array.isArray(movie.cast_details)) {
        const mappedCast = movie.cast_details.map((c: any, index: number) => ({
          id: index, // Since our DB doesn't inherently need TMDB ID for display, using index mapping works if ID is missing
          name: c.original_name,
          character: c.character,
          profile_path: c.profile_url // In the UI, if `c.profile_url` starts with http, we shouldn't prepend image.tmdb.org
        }));
        setCast(mappedCast);
      } else {
        setCast([]);
      }
    }
  }, [open, movie]);

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
      try { await navigator.share({ title: movie?.title, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
    }
  }, [movie?.title]);

  const lightboxMediaItems = useMemo(() => {
    if (!movie) return [];
    const posterUrl = buildPosterUrl(movie.poster_path, "w500");
    const photos = movie.Media?.filter(m => m.url) ?? [];
    const items: any[] = [];
    if (posterUrl && posterUrl !== FALLBACK_POSTER) {
      items.push({
        id: "poster",
        url: posterUrl,
        alt: movie.title,
      });
    }
    if (movie.media_details?.imageDetails) {
      movie.media_details.imageDetails.forEach((snap: any, index: number) => {
        const url = snap.url.startsWith('http') ? snap.url : (snap.url.startsWith('/') ? `${import.meta.env.VITE_REST_API_URL?.replace('/api', '') || 'http://localhost:1337'}${snap.url}` : snap.url);
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
  }, [movie]);

  if (!movie) return null;

  const genres = getGenreNames(movie.genres);
  const rating = formatRating(movie.tmdb_rating);
  const runtime = formatRuntime(movie.runtime);
  const posterUrl = buildPosterUrl(movie.poster_path, "w500");
  const backdropUrl = buildBackdropUrl(movie.backdrop_path, "w1280");
  const photos = movie.Media?.filter(m => m.url) ?? [];
  const watchProviders = movie.watch_providers ?? [];
  const noteText = extractNoteText(movie.user_recommendation_note);

  const handleImageClick = (type: 'poster' | 'snap' | 'photo', index: number = 0) => {
    let targetIndex = 0;
    const hasPoster = posterUrl && posterUrl !== FALLBACK_POSTER;
    if (type === 'poster') {
      targetIndex = 0;
    } else if (type === 'snap') {
      targetIndex = (hasPoster ? 1 : 0) + index;
    } else if (type === 'photo') {
      const snapCount = movie.media_details?.imageDetails?.length || 0;
      targetIndex = (hasPoster ? 1 : 0) + snapCount + index;
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
                    onClick={() => handleImageClick("poster")}
                    className="flex-shrink-0 w-28 rounded-xl overflow-hidden ring-2 ring-white/10 shadow-2xl cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <img
                      src={posterUrl || FALLBACK_POSTER}
                      alt={movie.title}
                      className="w-full aspect-[2/3] object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
                    />
                  </div>

                  {/* Title */}
                  <div className="flex-1 pt-16 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      {movie.media_type === "TV" && (
                        <span className="flex items-center gap-1 text-xs bg-blue-600/80 text-white px-2 py-0.5 rounded-full">
                          <Tv size={10} /> Series
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-white mt-1 leading-tight">{movie.title}</h2>
                    {movie.original_title && movie.original_title !== movie.title && (
                      <p className="text-xs text-white/40 mt-0.5">{movie.original_title}</p>
                    )}
                  </div>
                </div>

                <div className="px-5 mt-4 space-y-5 pb-6">
                  {/* Metadata pills */}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {movie.year && (
                      <span className="text-white/60">{movie.year}</span>
                    )}
                    {rating && (
                      <span className="flex items-center gap-1 text-yellow-400 font-semibold">
                        <Star size={13} fill="currentColor" /> {rating}
                      </span>
                    )}
                    {runtime && (
                      <span className="flex items-center gap-1 text-white/50">
                        <Clock size={13} /> {runtime}
                      </span>
                    )}
                    {movie.director && (
                      <span className="flex items-center gap-1 text-white/50">
                        <User size={13} /> {movie.director}
                      </span>
                    )}
                    {movie.season_count && (
                      <span className="text-white/50">{movie.season_count} season{movie.season_count > 1 ? "s" : ""}</span>
                    )}
                  </div>

                  {/* Genres */}
                  {genres.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {genres.map((g) => (
                        <span key={g} className="text-xs bg-white/8 text-white/60 px-2.5 py-1 rounded-full border border-white/10">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Overview */}
                  {movie.overview && (
                    <p className="text-sm text-white/60 leading-relaxed">{movie.overview}</p>
                  )}

                  {/* Creator note */}
                  {noteText && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                      <p className="text-xs font-semibold text-blue-400 mb-1.5 uppercase tracking-wider">Creator's Note</p>
                      <SafePublicRichText
                        className="text-sm text-white/80 leading-relaxed [&_p]:mb-2 [&_p]:last:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h2]:text-md [&_h3]:text-base font-normal max-w-none"
                        html={noteText}
                      />
                    </div>
                  )}

                  {/* Creator Rating */}
                  {movie.user_rating && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between">
                      <p className="text-xs font-semibold text-yellow-500 uppercase tracking-wider">Creator's Rating</p>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(star => (
                          <Star 
                            key={star} 
                            size={16} 
                            fill={movie.user_rating! >= star ? "currentColor" : "none"} 
                            className={movie.user_rating! >= star ? "text-yellow-400" : "text-white/20"} 
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cast */}
                  {cast.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Cast</p>
                      <div className="relative group">
                        <button
                          onClick={() => scrollCast("left")}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -ml-2 backdrop-blur-sm"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <div ref={castScrollRef} className="flex overflow-x-auto pb-4 -mx-5 px-5 gap-3 hide-scrollbar scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          {cast.map(c => (
                            <div key={c.id} className="flex flex-col flex-shrink-0 w-20 gap-1 rounded-xl">
                              <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 border border-white/10 bg-[#1a2332]">
                                {c.profile_path ? (
                                  <img 
                                    src={c.profile_path.startsWith('http') ? c.profile_path : (c.profile_path.startsWith('/') ? `${import.meta.env.VITE_REST_API_URL?.replace('/api', '') || 'http://localhost:1337'}${c.profile_path}` : `https://image.tmdb.org/t/p/w185${c.profile_path}`)} 
                                    className="w-full h-full object-cover" 
                                    alt="" 
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-white/20">
                                    <User size={24} />
                                  </div>
                                )}
                              </div>
                              <span className="text-xs text-center leading-tight mt-1 text-white/90">{c.name}</span>
                              <span className="text-[10px] text-center text-white/40 leading-tight">{c.character}</span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => scrollCast("right")}
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -mr-2 backdrop-blur-sm"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Manual Snapshots */}
                  {movie.media_details?.imageDetails && movie.media_details.imageDetails.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                        Snapshots from {movie.media_type === "TV" ? "Show" : "Movie"}
                      </p>
                      <div className="relative group">
                        <button
                          onClick={() => scrollSnapshots("left")}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -ml-2 backdrop-blur-sm"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <div ref={snapshotsScrollRef} className="flex overflow-x-auto pb-4 -mx-5 px-5 gap-3 hide-scrollbar scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          {movie.media_details.imageDetails.map((snap: any, i: number) => (
                            <div 
                              key={snap.id} 
                              onClick={() => handleImageClick("snap", i)}
                              className="flex-shrink-0 w-56 aspect-video rounded-xl overflow-hidden border border-white/10 bg-[#1a2332] cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                            >
                              <img 
                                src={snap.url.startsWith('http') ? snap.url : (snap.url.startsWith('/') ? `${import.meta.env.VITE_REST_API_URL?.replace('/api', '') || 'http://localhost:1337'}${snap.url}` : snap.url)} 
                                className="w-full h-full object-cover" 
                                alt="Snapshot" 
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

                  {/* Watch providers */}
                  {watchProviders.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Where to Watch</p>
                      <div className="flex flex-wrap gap-2">
                        {watchProviders.map((p, i) => (
                          p.link ? (
                            <a
                              key={i}
                              href={p.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 bg-white/8 hover:bg-white/12 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 transition-colors"
                            >
                              {p.logo_path && (
                                <img src={buildLogoUrl(p.logo_path)} alt="" className="w-5 h-5 rounded" />
                              )}
                              {p.provider_name}
                              <ExternalLink size={11} className="text-white/30" />
                            </a>
                          ) : (
                            <span
                              key={i}
                              className="flex items-center gap-2 bg-white/8 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80"
                            >
                              {p.logo_path && (
                                <img src={buildLogoUrl(p.logo_path)} alt="" className="w-5 h-5 rounded" />
                              )}
                              {p.provider_name}
                            </span>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Creator photos */}
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
                            <button
                              onClick={() => setPhotoIndex(i => Math.max(0, i - 1))}
                              disabled={photoIndex === 0}
                              className="p-1 text-white/50 hover:text-white disabled:opacity-30"
                            >
                              <ChevronLeft size={20} />
                            </button>
                            <span className="text-xs text-white/40">{photoIndex + 1} / {photos.length}</span>
                            <button
                              onClick={() => setPhotoIndex(i => Math.min(photos.length - 1, i + 1))}
                              disabled={photoIndex === photos.length - 1}
                              className="p-1 text-white/50 hover:text-white disabled:opacity-30"
                            >
                              <ChevronRight size={20} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Source list */}
                  {movie.movie_list && (
                    <p className="text-xs text-white/30">
                      From the list: <span className="text-blue-400">{movie.movie_list.List_Name}</span>
                    </p>
                  )}
                </div>
              </div>

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

export default MovieDetailModal;
