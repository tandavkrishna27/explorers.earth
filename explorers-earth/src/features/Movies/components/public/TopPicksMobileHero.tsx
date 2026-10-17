import { useState, useEffect } from "react";
import { motion, PanInfo } from "framer-motion";
import { Play, Star } from "lucide-react";
import type { RecommendedMovie } from "../../types";
import { buildPosterUrl, getGenreNames, extractYear } from "../../utils/movieHelpers";

interface TopPicksMobileHeroProps {
  movies: RecommendedMovie[];
  onMovieClick: (movie: RecommendedMovie) => void;
  showManageButton?: boolean;
  onManageClick?: () => void;
}

const TopPicksMobileHero = ({ movies, onMovieClick, showManageButton = false, onManageClick }: TopPicksMobileHeroProps) => {
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-iterate the carousel every 4 seconds
  useEffect(() => {
    if (movies.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % movies.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [movies.length]);

  if (!movies || movies.length === 0) return null;

  const handleDragEnd = (_e: any, { offset, velocity }: PanInfo) => {
    if (offset.x < -50 || velocity.x < -300) {
      setActiveIndex((prev) => (prev + 1) % movies.length);
    } else if (offset.x > 50 || velocity.x > 300) {
      setActiveIndex((prev) => (prev - 1 + movies.length) % movies.length);
    }
  };

  return (
    <div className="relative w-full h-[65vh] min-h-[480px] max-h-[650px] overflow-hidden flex items-center justify-start py-6 mb-8 mt-2 touch-pan-y">
      <div className="absolute inset-0 left-4 right-14">
        {movies.map((movie, i) => {
          const diff = (i - activeIndex + movies.length) % movies.length;
          
          let position = "hiddenRight";
          if (diff === 0) position = "active";
          else if (diff === 1) position = "next";
          else if (diff === 2) position = "nextNext";
          else if (diff === movies.length - 1) position = "hiddenLeft";

          const variants = {
            active: { x: 0, scale: 1, zIndex: 10, opacity: 1 },
            next: { x: "12%", scale: 0.9, zIndex: 5, opacity: 1 },
            nextNext: { x: "24%", scale: 0.8, zIndex: 4, opacity: 1 },
            hiddenRight: { x: "40%", scale: 0.7, zIndex: 1, opacity: 0 },
            hiddenLeft: { x: "-110%", scale: 1, zIndex: 11, opacity: 0 }
          };

          const posterUrl = buildPosterUrl(movie.poster_path, "w500");
          const genres = getGenreNames(movie.genres).slice(0, 3);
          const year = extractYear(movie.year);

          return (
            <motion.div
              key={movie.documentId}
              data-public-category-artwork={diff === 0 ? true : undefined}
              variants={variants}
              initial={false}
              animate={position}
              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
              drag={diff === 0 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.8}
              onDragEnd={handleDragEnd}
              className={`absolute inset-0 h-full rounded-2xl overflow-hidden shadow-2xl bg-[#1a2332] border border-white/10 ${diff === 0 ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
              onClick={() => diff === 0 && onMovieClick(movie)}
            >
              <img 
                src={posterUrl || "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba"} 
                alt={movie.title}
                className="w-full h-full object-cover select-none pointer-events-none filter contrast-125"
              />
              
              {/* Gradient dark overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 pointer-events-none" />
              
              {/* Hotstar-style Top Banner / Manage Button */}
              <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto z-20">
                <div className="flex items-center pointer-events-none drop-shadow-md">
                  <span className="w-1 h-5 bg-yellow-400 mr-2 rounded-full inline-block"></span>
                  <h2 className="text-lg font-bold text-white tracking-tight">Top Picks</h2>
                </div>

                {/* Manage button moved to bottom z-index:20 */}
              </div>
              
              {/* Title & Metadata */}
              <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-1.5 pointer-events-none">
                <h2 className="text-3xl font-poppins font-black text-white leading-tight drop-shadow-xl select-none">
                  {movie.title}
                </h2>
                
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/80 font-semibold tracking-wide mt-1">
                  {year && <span className="text-white">{year}</span>}
                  {year && genres.length > 0 && <span className="text-white/40">•</span>}
                  {genres.length > 0 && <span>{genres.join(" | ")}</span>}
                  <span className="text-white/40">•</span>
                  <span>{movie.media_type === "Movie" ? "Movie" : "Series"}</span>
                </div>
                
                <div className="flex items-center gap-3 mt-4 pointer-events-auto">
                  {showManageButton ? (
                    <button 
                      className="flex-1 bg-[var(--category-accent,var(--dash-accent,#3b82f6))] hover:opacity-90 text-[color:var(--category-accent-ink,#fff)] font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl"
                      onClick={(e) => {
                        e.stopPropagation();
                        onManageClick?.();
                      }}
                    >
                      <Star size={18} fill="currentColor" /> Manage Top Picks
                    </button>
                  ) : (
                    <button 
                      className="flex-1 bg-[var(--category-accent,var(--dash-accent,#3b82f6))] hover:opacity-90 text-[color:var(--category-accent-ink,#fff)] font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMovieClick(movie);
                      }}
                    >
                      <Play size={18} fill="currentColor" /> See Details
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default TopPicksMobileHero;
