import { usePublicCategoryThemeStyles } from "../../../PublicHome/components/PublicCategoryThemeContext";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { RecommendedMovie } from "../../types";
import { buildBackdropUrl, buildPosterUrl, formatRuntime, getGenreNames } from "../../utils/movieHelpers";

interface TopPicksHeroProps {
  movies: RecommendedMovie[];
  onMovieClick: (movie: RecommendedMovie) => void;
  showManageButton?: boolean;
  onManageClick?: () => void;
}

const TopPicksHero = ({ movies, onMovieClick, showManageButton = false, onManageClick }: TopPicksHeroProps) => {
  const categoryStyles = usePublicCategoryThemeStyles();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollButtons = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
    }
  };

  useEffect(() => {
    updateScrollButtons();
  }, [movies]);

  useEffect(() => {
    // Scroll active thumbnail into view
    if (scrollRef.current) {
      const btn = scrollRef.current.children[activeIndex] as HTMLElement;
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeIndex]);

  useEffect(() => {
    if (movies.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % movies.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [movies.length]);

  if (!movies || movies.length === 0) return null;

  const activeMovie = movies[activeIndex];
  const backdropUrl = buildBackdropUrl(activeMovie.backdrop_path, "original") || buildPosterUrl(activeMovie.poster_path, "original");
  const genres = getGenreNames(activeMovie.genres).slice(0, 4);
  const runtime = formatRuntime(activeMovie.runtime);

  const handleScrollClick = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -300 : 300;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div data-public-category-artwork className="relative w-full h-[60vh] min-h-[500px] max-h-[700px] rounded-2xl overflow-hidden bg-black shadow-2xl group/hero mb-12">
      {/* Background Presentation & Click Target */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeMovie.documentId}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 cursor-pointer"
          onClick={() => onMovieClick(activeMovie)}
        >
          <img
            src={backdropUrl || "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba"}
            alt={activeMovie.title}
            className="w-full h-full object-cover opacity-90"
          />
          {/* Gradients to fade bottom and left */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Top Picks Heading */}
      <div className="absolute top-8 left-8 md:top-12 md:left-12 z-50 pointer-events-none flex flex-col gap-1">
        <h2 className="text-xl md:text-2xl font-bold text-white flex items-center drop-shadow-lg">
          <span className="w-1.5 h-6 bg-yellow-400 mr-2.5 rounded-full inline-block"></span>
          Top Picks
        </h2>
      </div>

      {/* Manage Top Picks Button (Always visible on Dashboard top right) */}
      {/* Manage Button moved to bottom left for dashboard */}

      {/* Main Content Area */}
      <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12 z-10 pointer-events-none">
        <div className="flex justify-between items-end w-full">
          {/* Left Text Detail Section */}
          <div 
            className="w-full lg:w-1/2 flex flex-col gap-4 pointer-events-auto cursor-pointer"
            onClick={() => onMovieClick(activeMovie)}
          >
            <motion.h1 
              key={`title-${activeMovie.documentId}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight font-poppins"
            >
              {activeMovie.title}
            </motion.h1>
            
            <motion.div 
              key={`meta-${activeMovie.documentId}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="flex items-center gap-3 text-sm md:text-base text-white/80 font-semibold"
            >
              {activeMovie.year && <span>{activeMovie.year}</span>}
              {activeMovie.year && runtime && <span className="text-white/40">•</span>}
              {runtime && <span>{runtime}</span>}
              {genres.length > 0 && <span className="text-white/40">•</span>}
              {genres.length > 0 && <span>{genres.join("  |  ")}</span>}
            </motion.div>

            <motion.p 
              key={`desc-${activeMovie.documentId}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="text-white/70 text-sm md:text-base leading-relaxed line-clamp-3 max-w-xl"
            >
              {activeMovie.overview || "No synopsis available."}
            </motion.p>
            
            <motion.div 
              key={`btns-${activeMovie.documentId}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="flex items-center gap-4 mt-2"
              onClick={(e) => e.stopPropagation()}
            >
              {showManageButton ? (
                <button 
                  onClick={(e) => { e.stopPropagation(); onManageClick?.(); }}
                  className={`flex items-center gap-2 ${categoryStyles ? 'bg-[var(--category-accent)]' : 'bg-dashboard-accent'} hover:opacity-90 ${categoryStyles ? 'text-[color:var(--category-accent-ink)]' : 'text-white'} font-bold py-3 px-8 rounded-lg shadow-xl shadow-blue-500/20 transition-all hover:scale-105`}
                >
                  <Star size={20} fill="currentColor" />
                  Manage Top Picks
                </button>
              ) : (
                <button 
                  onClick={() => onMovieClick(activeMovie)}
                  className={`flex items-center gap-2 ${categoryStyles ? 'bg-[var(--category-accent)]' : 'bg-dashboard-accent'} hover:opacity-90 ${categoryStyles ? 'text-[color:var(--category-accent-ink)]' : 'text-white'} font-bold py-3 px-8 rounded-lg shadow-xl shadow-blue-500/20 transition-all hover:scale-105`}
                >
                  <Play size={20} fill="currentColor" />
                  See Details
                </button>
              )}
            </motion.div>
          </div>

          {/* Right Bottom Top Picks Thumbnail Row */}
          <div className="hidden lg:flex flex-col items-end max-w-[50%] z-20 pointer-events-auto">
            <div className="relative group/thumbs w-full max-w-2xl pl-12">
               {/* Nav arrows for thumbnails */}
               {canScrollLeft && (
                <button
                  onClick={() => handleScrollClick('left')}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-black/80 hover:bg-black text-white rounded-r-xl p-2 shadow-2xl opacity-0 group-hover/thumbs:opacity-100 transition-all backdrop-blur-md"
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              {canScrollRight && (
                <button
                  onClick={() => handleScrollClick('right')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-30 bg-black/80 hover:bg-black text-white rounded-l-xl p-2 shadow-2xl opacity-0 group-hover/thumbs:opacity-100 transition-all backdrop-blur-md"
                >
                  <ChevronRight size={24} />
                </button>
              )}

              {/* Thumbnails list */}
              <div 
                ref={scrollRef}
                onScroll={updateScrollButtons}
                className="flex gap-3 overflow-x-auto scrollbar-hide py-4 px-2"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {movies.map((movie, index) => {
                  const isSelected = index === activeIndex;
                  const thumbUrl = buildPosterUrl(movie.backdrop_path || movie.poster_path, "w342");
                  return (
                    <button
                      key={`thumb-${movie.documentId}`}
                      onClick={(e) => { e.stopPropagation(); setActiveIndex(index); }}
                      className={`relative flex-shrink-0 w-32 aspect-video rounded-md overflow-hidden transition-all duration-300 ${isSelected ? 'ring-2 ring-white scale-110 z-10 shadow-xl' : 'opacity-60 hover:opacity-100 hover:scale-105 filter brightness-75 hover:brightness-100'}`}
                    >
                      <img 
                        src={thumbUrl || "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba"} 
                        alt={movie.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/20" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopPicksHero;
