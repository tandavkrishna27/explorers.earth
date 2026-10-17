import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { genreToSlug, extractUniqueGenres } from "../../utils/gameHelpers";
import type { RecommendedGame } from "../../types";

interface GenreBrowseProps {
  games: RecommendedGame[];
  username: string;
}

// A palette of gradient pairs for genre cards (consistent with Movies)
const GENRE_GRADIENTS = [
  ["#1a1a2e", "#16213e"],
  ["#0f3460", "#533483"],
  ["#1b1b2f", "#2d132c"],
  ["#0a3d62", "#1e3799"],
  ["#1a1a2e", "#7f1d1d"],
  ["#064663", "#04293a"],
  ["#2c003e", "#512b58"],
  ["#1b262c", "#0f3460"],
];

const GenreBrowse = ({ games, username }: GenreBrowseProps) => {
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
    const timeoutMsg = setTimeout(updateScrollButtons, 500);
    return () => clearTimeout(timeoutMsg);
  }, [games]);

  const handleScrollClick = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -400 : 400;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const genres = extractUniqueGenres(games.map(g => g.genres));

  // Count games per genre
  const genreCount: Record<string, number> = {};
  for (const g of genres) {
    genreCount[g] = games.filter(game => game.genres?.includes(g)).length;
  }

  // Only show genres with at least 1 game
  const visibleGenres = genres.filter(g => genreCount[g] > 0);

  if (visibleGenres.length === 0) return null;

  return (
    <section className="mt-10 mb-8">
      <h2 className="text-lg font-semibold text-[color:var(--category-text,#fff)] mb-4 px-4 md:px-0">Browse by Genre</h2>
      <div className="relative group">
        {canScrollLeft && (
          <button
            onClick={() => handleScrollClick('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-black/80 hover:bg-black text-white rounded-r-xl p-3 shadow-2xl opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md hidden md:flex items-center justify-center -ml-4"
            aria-label="Scroll left"
          >
            <ChevronLeft size={28} className="drop-shadow-lg" />
          </button>
        )}

        {canScrollRight && (
          <button
            onClick={() => handleScrollClick('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-black/80 hover:bg-black text-white rounded-l-xl p-3 shadow-2xl opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md hidden md:flex items-center justify-center -mr-4"
            aria-label="Scroll right"
          >
            <ChevronRight size={28} className="drop-shadow-lg" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={updateScrollButtons}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4 md:px-0 pb-4"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
        {visibleGenres.map((genre, i) => {
          const gradient = GENRE_GRADIENTS[i % GENRE_GRADIENTS.length];
          return (
            <motion.div
              key={genre}
              className="flex-shrink-0 w-40"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Link
                to={`/${username}/games/genre/${genreToSlug(genre)}`}
                className="relative flex flex-col justify-between h-24 rounded-xl overflow-hidden p-3 border border-[color:var(--category-border,rgba(255,255,255,0.1))] hover:border-[color:var(--category-focus,color-mix(in_srgb,var(--dash-accent,#3b82f6)_40%,transparent))] transition-all group"
                style={{
                  background: `var(--category-card,linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}))`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <ChevronRight size={14} className="self-end text-[color:var(--category-muted,rgba(255,255,255,0.3))] group-hover:text-[color:var(--category-muted,rgba(255,255,255,0.6))] transition-colors" />
                <div>
                  <p className="text-sm font-semibold text-[color:var(--category-text,#fff)]">{genre}</p>
                  <p className="text-xs text-[color:var(--category-muted,rgba(255,255,255,0.4))]">{genreCount[genre]} game{genreCount[genre] !== 1 ? "s" : ""}</p>
                </div>
              </Link>
            </motion.div>
          );
        })}
        </div>
      </div>
    </section>
  );
};

export default GenreBrowse;
