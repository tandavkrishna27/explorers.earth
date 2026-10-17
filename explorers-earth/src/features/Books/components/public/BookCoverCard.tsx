import { memo } from "react";
import { Star } from "lucide-react";
import type { RecommendedBook } from "../../types";
import { buildCoverUrl, formatAuthors } from "../../utils/bookHelpers";

interface BookCoverCardProps {
  book: RecommendedBook;
  onClick: (book: RecommendedBook) => void;
}

const FALLBACK = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='180' viewBox='0 0 120 180'><rect width='120' height='180' fill='%23171e2e'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='32' fill='%23ffffff20'>📚</text></svg>`;

const BookCoverCard = memo(({ book, onClick }: BookCoverCardProps) => {
  const coverUrl = buildCoverUrl(book.cover_url) || FALLBACK;
  const rating = book.user_rating ?? (book.google_rating ? book.google_rating * 2 : null);
  const authors = formatAuthors(book.authors);

  return (
    <button
      onClick={() => onClick(book)}
      className="flex-shrink-0 w-[120px] group cursor-pointer text-left"
    >
      {/* "Physical Book" Container */}
      <div className="relative w-full aspect-[2/3] mb-4 group/book book-perspective">
        {/* The Actual Book Structure (Rotate) */}
        <div className="relative w-full h-full transition-all duration-500 ease-out book-static-tilt group-hover/book:book-tilt preserve-3d">
          
          {/* 1. BACK COVER (Shows as thin edge) */}
          <div className="absolute inset-x-0 inset-y-0 bg-[#0d0d0d] rounded-r-md transform translate-z-[-5px]" />

          {/* 2. TOP DEPTH (Visible pages top) */}
          <div className="absolute top-[-4px] inset-x-0 h-[6px] bg-[#f8f8f8] border-b border-black/10 transform rotate-x-90 origin-bottom z-0" 
               style={{ background: "linear-gradient(to bottom, #d1d1d1 0%, #ffffff 100%)", backgroundSize: "100% 2px" }} />

          {/* 3. RIGHT DEPTH (Visible pages right) */}
          <div className="absolute inset-y-[1%] right-[-10px] w-[20px] book-pages-stack rounded-r-sm transform rotate-y-90 origin-left opacity-100 z-0" />
          
          {/* 4. MAIN COVER LAYER */}
          <div className="relative w-full h-full overflow-hidden bg-white shadow-[15px_15px_30px_rgba(0,0,0,0.4)] z-10 book-corner-curl">
            <img
              src={coverUrl}
              alt={book.title}
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK; }}
            />

            {/* Spine Highlight & Indent */}
            <div className="absolute inset-y-0 left-0 w-[12%] bg-gradient-to-r from-black/50 via-black/10 to-transparent z-20" />
            <div className="absolute inset-y-0 left-[1px] w-[1px] bg-white/30 z-20" />
            <div className="absolute inset-y-0 left-[11%] w-[1px] bg-black/30 z-20" />

            {/* Rating Badge (Ditto to Photo) */}
            {rating && (
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-[#121212] text-amber-500 text-[10px] font-bold px-2 py-1.5 rounded-sm border border-white/5 z-30 shadow-lg">
                <Star size={10} fill="currentColor" />
                <span className="text-white text-[11px] leading-none mb-[1px]">{Number(rating).toFixed(1)}</span>
              </div>
            )}
          </div>

          {/* 4. CURLED CORNER (Bottom Right) */}
          <div className="absolute bottom-0 right-0 w-[12%] aspect-square z-[25] pointer-events-none transform origin-bottom-right" 
               style={{ 
                 clipPath: "polygon(100% 0, 0 100%, 100% 100%)", 
                 background: "linear-gradient(135deg, #eee 0%, #bbb 45%, #777 50%, #eee 55%, #fff 100%)",
                 filter: "drop-shadow(-2px -2px 3px rgba(0,0,0,0.4))"
               }} 
          />
          {/* White Page behind curl */}
          <div className="absolute bottom-0 right-0 w-[12%] aspect-square bg-white z-[24] pointer-events-none" 
               style={{ clipPath: "polygon(100% 0, 0 100%, 100% 100%)" }} 
          />
        </div>

        {/* Floor Shadow */}
        <div className="absolute -bottom-3 left-4 right-4 h-6 bg-black/60 blur-2xl rounded-full opacity-60 group-hover/book:opacity-100 transition-all duration-500 transform scale-x-125" />
      </div>

      {/* Title & Author */}
      <p className="text-xs font-semibold text-[color:var(--category-text,rgba(255,255,255,0.9))] line-clamp-2 leading-tight mb-0.5">
        {book.title}
      </p>
      <p className="text-[10px] text-[color:var(--category-muted,rgba(255,255,255,0.45))] truncate">{authors}</p>
    </button>
  );
});

BookCoverCard.displayName = "BookCoverCard";
export default BookCoverCard;
