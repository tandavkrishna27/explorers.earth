import { useRef, memo, useState, useEffect } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import type { RecommendedMovie } from "../../types";
import MoviePosterCard from "./MoviePosterCard";
import MoviePosterSkeleton from "./MoviePosterSkeleton";

interface MovieCarouselRowProps {
  title: string;
  description?: string | null;
  movies: RecommendedMovie[];
  loading?: boolean;
  seeAllLink?: string;
  onMovieClick: (movie: RecommendedMovie) => void;
  emptyMessage?: string;
}

const MovieCarouselRow = memo(({
  title,
  description,
  movies,
  loading = false,
  seeAllLink,
  onMovieClick,
  emptyMessage = "No movies yet",
}: MovieCarouselRowProps) => {
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
  }, [movies, loading]);

  const handleScrollClick = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -400 : 400;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (!loading && movies.length === 0) return null;

  return (
    <section className="mb-8">
      {/* Row header */}
      <div className="flex items-start justify-between mb-4 px-4 md:px-0">
        <div>
          <div className="flex items-center gap-2 group">
            <div className="w-1.5 h-[22px] bg-yellow-400 rounded-sm flex-shrink-0" />
            {seeAllLink ? (
              <Link to={seeAllLink} className="flex items-center text-xl font-bold text-[color:var(--category-text,#fff)] hover:text-[color:var(--category-text,#fff)] transition-colors">
                {title} <ChevronRight size={22} className="ml-0.5 text-[color:var(--category-text,rgba(255,255,255,0.8))] group-hover:translate-x-1 transition-transform" />
              </Link>
            ) : (
              <h2 className="text-xl font-bold text-[color:var(--category-text,#fff)] flex items-center">
                {title}
              </h2>
            )}
          </div>
          {description && <p className="text-[color:var(--category-muted,rgba(255,255,255,0.6))] text-sm mt-1">{description}</p>}
        </div>

        <div className="flex flex-col items-end pt-1 flex-shrink-0">
          {seeAllLink && !loading && movies.length > 0 && (
            <Link
              to={seeAllLink}
              className="text-xs font-bold text-[color:var(--category-text,#3b82f6)] hover:text-[color:var(--category-text,#60a5fa)] transition-colors flex items-center gap-0.5"
            >
              See All ➔
            </Link>
          )}
        </div>
      </div>

      {/* Horizontal scroll with Navigation Arrows */}
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

        {canScrollRight && !loading && movies.length > 0 && (
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
          className="flex gap-3 overflow-x-auto px-4 md:px-0 pb-2 scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
        {loading ? (
          <MoviePosterSkeleton count={6} />
        ) : movies.length === 0 ? (
          <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))] text-sm py-4">{emptyMessage}</p>
        ) : (
          movies.map((movie) => (
            <MoviePosterCard
              key={movie.documentId}
              movie={movie}
              onClick={onMovieClick}
            />
          ))
        )}
        </div>
      </div>
    </section>
  );
});

MovieCarouselRow.displayName = "MovieCarouselRow";

export default MovieCarouselRow;
