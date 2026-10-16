import { usePublicCategoryThemeStyles } from "../../../PublicHome/components/PublicCategoryThemeContext";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid, ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { RecommendedGame } from "../../types";
import { buildCoverUrl } from "../../utils/gameHelpers";

interface TopGamesHeroProps {
  games: RecommendedGame[];
  onGameClick: (game: RecommendedGame) => void;
  showManageButton?: boolean;
  onManageClick?: () => void;
}

const TopGamesHero = ({ games, onGameClick, showManageButton = false, onManageClick }: TopGamesHeroProps) => {
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
  }, [games]);

  useEffect(() => {
    if (scrollRef.current) {
      const btn = scrollRef.current.children[activeIndex] as HTMLElement;
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeIndex]);

  useEffect(() => {
    if (games.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % games.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [games.length]);

  if (!games || games.length === 0) return null;

  const activeGame = games[activeIndex % games.length];

  // Backdrop logic: try first screenshot, then cover_url_large
  const backdropUrl = buildCoverUrl(activeGame.Media?.[0]?.url || activeGame.cover_url_large || activeGame.cover_url);

  const genres = activeGame.genres?.slice(0, 4) || [];
  const platforms = activeGame.platforms?.slice(0, 3) || [];

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
          key={activeGame.documentId}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 cursor-pointer"
          onClick={() => onGameClick(activeGame)}
        >
          <img
            src={backdropUrl || ""}
            alt={activeGame.title}
            className="w-full h-full object-cover opacity-80"
          />
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

      {/* Main Content Area */}
      <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12 z-10 pointer-events-none">
        <div className="flex justify-between items-end w-full">
          {/* Left Text Detail Section */}
          <div 
            className="w-full lg:w-1/2 flex flex-col gap-4 cursor-pointer pointer-events-auto"
            onClick={() => onGameClick(activeGame)}
          >
            <motion.h1 
              key={`title-${activeGame.documentId}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight font-poppins"
            >
              {activeGame.title}
            </motion.h1>
            
            <motion.div 
              key={`meta-${activeGame.documentId}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="flex flex-wrap items-center gap-3 text-sm md:text-base text-white/80 font-semibold"
            >
              {activeGame.release_year && <span>{activeGame.release_year}</span>}
              {activeGame.release_year && genres.length > 0 && <span className="text-white/40">•</span>}
              {genres.length > 0 && <span>{genres.join("  |  ")}</span>}
              {platforms.length > 0 && <span className="text-white/40">•</span>}
              {platforms.length > 0 && <span>{platforms.join("  |  ")}</span>}
            </motion.div>

            <motion.p 
              key={`desc-${activeGame.documentId}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="text-white/70 text-sm md:text-base leading-relaxed line-clamp-3 max-w-xl"
            >
              {activeGame.summary || "No description available. Check the details to learn more."}
            </motion.p>
            
            <motion.div 
              key={`btns-${activeGame.documentId}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="flex items-center gap-4 mt-2"
              onClick={(e) => e.stopPropagation()} // Keep buttons functional without triggering hero click
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
                  onClick={() => onGameClick(activeGame)}
                  className={`flex items-center gap-2 ${categoryStyles ? 'bg-[var(--category-accent)]' : 'bg-dashboard-accent'} hover:opacity-90 ${categoryStyles ? 'text-[color:var(--category-accent-ink)]' : 'text-white'} font-bold py-3 px-8 rounded-lg shadow-xl shadow-blue-500/20 transition-all hover:scale-105`}
                >
                  <Grid size={20} />
                  See Details
                </button>
              )}
            </motion.div>
          </div>

          {/* Right Bottom Thumbnail Row */}
          <div className="hidden lg:flex flex-col items-end max-w-[50%] z-20 pointer-events-auto">
            <div className="relative group/thumbs w-full max-w-2xl pl-12">
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

              <div 
                ref={scrollRef}
                onScroll={updateScrollButtons}
                className="flex gap-3 overflow-x-auto scrollbar-hide py-4 px-2"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {games.map((game, index) => {
                  const isSelected = index === activeIndex;
                  const thumbUrl = buildCoverUrl(game.cover_url_large || game.cover_url);
                  return (
                    <button
                      key={`thumb-${game.documentId}`}
                      onClick={(e) => { e.stopPropagation(); setActiveIndex(index); }}
                      className={`relative flex-shrink-0 w-32 aspect-[3/4] rounded-md overflow-hidden transition-all duration-300 ${isSelected ? 'ring-2 ring-white scale-110 z-10 shadow-xl' : 'opacity-60 hover:opacity-100 hover:scale-105 filter brightness-75 hover:brightness-100'}`}
                    >
                      <img 
                        src={thumbUrl || ""} 
                        alt={game.title}
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

export default TopGamesHero;
