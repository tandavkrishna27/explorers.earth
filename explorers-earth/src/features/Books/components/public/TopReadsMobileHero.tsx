import { usePublicCategoryThemeStyles } from "../../../PublicHome/components/PublicCategoryThemeContext";
import { useState, useEffect } from "react";
import { motion, PanInfo } from "framer-motion";
import { BookOpen, Star } from "lucide-react";
import type { RecommendedBook } from "../../types";
import { buildCoverUrl, formatAuthors } from "../../utils/bookHelpers";

interface TopReadsMobileHeroProps {
  books: RecommendedBook[];
  onBookClick: (book: RecommendedBook) => void;
  showManageButton?: boolean;
  onManageClick?: () => void;
}

const TopReadsMobileHero = ({ books, onBookClick, showManageButton = false, onManageClick }: TopReadsMobileHeroProps) => {
  const categoryStyles = usePublicCategoryThemeStyles();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (books.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % books.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [books?.length]);

  if (!books || books.length === 0) return null;

  const handleDragEnd = (_e: any, { offset, velocity }: PanInfo) => {
    if (offset.x < -50 || velocity.x < -300) {
      setActiveIndex((prev) => (prev + 1) % books.length);
    } else if (offset.x > 50 || velocity.x > 300) {
      setActiveIndex((prev) => (prev - 1 + books.length) % books.length);
    }
  };

  return (
    <div className="relative w-full h-[65vh] min-h-[480px] max-h-[650px] overflow-hidden flex items-center justify-start py-6 mb-8 mt-2 touch-pan-y">
      <div className="absolute inset-0 left-6 right-14">
        {books.map((book, i) => {
          const diff = (i - activeIndex + books.length) % books.length;
          
          let position = "hiddenRight";
          if (diff === 0) position = "active";
          else if (diff === 1) position = "next";
          else if (diff === 2) position = "nextNext";
          else if (diff === books.length - 1) position = "hiddenLeft";

          const variants = {
            active: { x: 0, scale: 1, zIndex: 10, opacity: 1 },
            next: { x: "12%", scale: 0.9, zIndex: 5, opacity: 1 },
            nextNext: { x: "24%", scale: 0.8, zIndex: 4, opacity: 1 },
            hiddenRight: { x: "40%", scale: 0.7, zIndex: 1, opacity: 0 },
            hiddenLeft: { x: "-110%", scale: 1, zIndex: 11, opacity: 0 }
          };

          const coverUrl = buildCoverUrl(book.cover_url_large || book.cover_url);
          const authors = formatAuthors(book.authors);

          return (
            <motion.div
              key={book.documentId}
              data-public-category-artwork={diff === 0 ? true : undefined}
              variants={variants}
              initial={false}
              animate={position}
              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
              drag={diff === 0 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.8}
              onDragEnd={handleDragEnd}
              className={`absolute inset-0 h-full rounded-r-2xl overflow-hidden shadow-2xl bg-[#1a2332] border border-white/10 ${diff === 0 ? 'cursor-grab active:cursor-grabbing book-tilt' : 'pointer-events-none opacity-40'} transition-all duration-500`}
              onClick={() => diff === 0 && onBookClick(book)}
              style={{ perspective: "1000px" }}
            >
              <img 
                src={coverUrl} 
                alt={book.title}
                className="w-full h-full object-cover select-none pointer-events-none"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "https://images.unsplash.com/photo-1512820790803-83ca734da794";
                }}
              />
              
              {/* Spine Effect */}
              <div className="absolute inset-y-0 left-0 w-[12%] bg-gradient-to-r from-black/80 via-black/20 to-transparent pointer-events-none z-10" />

              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 pointer-events-none" />
              
              <div className="absolute top-5 left-6 right-5 flex justify-between items-start pointer-events-auto z-20">
                <div className="flex items-center pointer-events-none drop-shadow-md">
                  <span className="w-1 h-5 bg-amber-500 mr-2 rounded-full inline-block"></span>
                  <h2 className="text-lg font-bold text-white tracking-tight">Top Reads</h2>
                </div>

                {/* Manage button moved to bottom z-index:20 */}
              </div>
              
              <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col gap-1.5 pointer-events-none">
                <h2 className="text-3xl font-poppins font-black text-white leading-tight drop-shadow-xl select-none">
                  {book.title}
                </h2>
                
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/80 font-semibold tracking-wide mt-1">
                  {book.year && <span className="text-white">{book.year}</span>}
                  {book.year && authors && <span className="text-white/40">•</span>}
                  {authors && <span className="truncate max-w-[140px]">{authors}</span>}
                </div>
                
                <div className="flex items-center gap-3 mt-4 pointer-events-auto">
                  {showManageButton ? (
                    <button 
                      className={`flex-1 ${categoryStyles ? 'bg-[var(--category-accent)]' : 'bg-dashboard-accent'} hover:opacity-90 ${categoryStyles ? 'text-[color:var(--category-accent-ink)]' : 'text-white'} font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onManageClick?.();
                      }}
                    >
                      <Star size={18} fill="currentColor" /> Manage Top Reads
                    </button>
                  ) : (
                    <button 
                      className={`flex-1 ${categoryStyles ? 'bg-[var(--category-accent)]' : 'bg-dashboard-accent'} hover:opacity-90 ${categoryStyles ? 'text-[color:var(--category-accent-ink)]' : 'text-white'} font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onBookClick(book);
                      }}
                    >
                      <BookOpen size={18} /> See Details
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

export default TopReadsMobileHero;
