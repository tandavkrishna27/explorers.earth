import { useRef, memo, useState, useEffect } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import type { RecommendedBook } from "../../types";
import BookCoverCard from "./BookCoverCard";

interface BookCarouselRowProps {
  title: string;
  description?: string | null;
  books: RecommendedBook[];
  loading?: boolean;
  seeAllLink?: string;
  onBookClick: (book: RecommendedBook) => void;
  emptyMessage?: string;
}

const BookCarouselRow = memo(({
  title,
  description,
  books,
  loading = false,
  seeAllLink,
  onBookClick,
  emptyMessage = "No books yet",
}: BookCarouselRowProps) => {
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
    const t = setTimeout(updateScrollButtons, 500);
    return () => clearTimeout(t);
  }, [books, loading]);

  const handleScroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -360 : 360, behavior: "smooth" });
    }
  };

  if (!loading && books.length === 0) return null;

  return (
    <section className="mb-8">
      {/* Row header */}
      <div className="flex items-start justify-between mb-4 px-4 md:px-0">
        <div>
          <div className="flex items-center gap-2 group">
            <div className="w-1.5 h-[22px] bg-amber-400 rounded-sm flex-shrink-0" />
            {seeAllLink ? (
              <Link to={seeAllLink} className="flex items-center text-xl font-bold text-[color:var(--category-text,#fff)] hover:text-[color:var(--category-text,#fff)] transition-colors">
                {title} <ChevronRight size={22} className="ml-0.5 text-[color:var(--category-text,rgba(255,255,255,0.8))] group-hover:translate-x-1 transition-transform" />
              </Link>
            ) : (
              <h2 className="text-xl font-bold text-[color:var(--category-text,#fff)]">{title}</h2>
            )}
          </div>
          {description && <p className="text-[color:var(--category-muted,rgba(255,255,255,0.6))] text-sm mt-1">{description}</p>}
        </div>

        <div className="flex flex-col items-end pt-1 flex-shrink-0">
          {seeAllLink && !loading && books.length > 0 && (
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
            onClick={() => handleScroll("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-black/80 hover:bg-black text-white rounded-r-xl p-3 shadow-2xl opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md hidden md:flex items-center justify-center -ml-4"
            aria-label="Scroll left"
          >
            <ChevronLeft size={28} className="drop-shadow-lg" />
          </button>
        )}
        {canScrollRight && !loading && books.length > 0 && (
          <button
            onClick={() => handleScroll("right")}
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
            // Skeleton placeholders
            [...Array(5)].map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[120px] animate-pulse"
              >
                <div className="w-full aspect-[2/3] bg-[var(--category-card,rgba(255,255,255,0.08))] rounded-xl mb-2" />
                <div className="h-3 bg-[var(--category-skeleton,rgba(255,255,255,0.08))] rounded w-3/4 mb-1" />
                <div className="h-3 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] rounded w-1/2" />
              </div>
            ))
          ) : books.length === 0 ? (
            <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))] text-sm py-4">{emptyMessage}</p>
          ) : (
            books.map((book) => (
              <BookCoverCard key={book.documentId} book={book} onClick={onBookClick} />
            ))
          )}
        </div>
      </div>
    </section>
  );
});

BookCarouselRow.displayName = "BookCarouselRow";
export default BookCarouselRow;
