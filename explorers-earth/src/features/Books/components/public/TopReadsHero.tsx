import { usePublicCategoryThemeStyles } from "../../../PublicHome/components/PublicCategoryThemeContext";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { RecommendedBook } from "../../types";
import { buildCoverUrl, formatAuthors } from "../../utils/bookHelpers";

interface TopReadsHeroProps {
  books: RecommendedBook[];
  onBookClick: (book: RecommendedBook) => void;
  showManageButton?: boolean;
  onManageClick?: () => void;
}

const TopReadsHero = ({ books, onBookClick, showManageButton = false, onManageClick }: TopReadsHeroProps) => {
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
  }, [books]);

  useEffect(() => {
    if (scrollRef.current) {
      const btn = scrollRef.current.children[activeIndex] as HTMLElement;
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeIndex]);

  useEffect(() => {
    if (!books || books.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % books.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [books?.length]);

  const handleScrollClick = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -300 : 300;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (!books || books.length === 0) return null;

  const activeBook = books[activeIndex];
  const coverUrl = buildCoverUrl(activeBook.cover_url_large || activeBook.cover_url);
  const authors = formatAuthors(activeBook.authors);
  const subjects = activeBook.subjects?.slice(0, 3) || [];

  return (
    <div data-public-category-artwork className="relative w-full h-[60vh] min-h-[500px] max-h-[700px] rounded-2xl overflow-hidden bg-black shadow-2xl group/hero mb-12">
      {/* Cinematic Background Presentation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeBook.documentId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0 cursor-pointer overflow-hidden"
          onClick={() => onBookClick(activeBook)}
        >
          {/* Main Full-Cover Background */}
          <div className="absolute inset-0">
            <img
              src={coverUrl}
              alt=""
              className="w-full h-full object-cover transform scale-110 blur-md opacity-60"
              onError={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                if (target.src === activeBook.cover_url_large && activeBook.cover_url) {
                  target.src = buildCoverUrl(activeBook.cover_url);
                } else {
                  target.src = "https://images.unsplash.com/photo-1512820790803-83ca734da794";
                }
              }}
            />
            {/* The sharp cover centered or to the right */}
            <div className="absolute inset-0 flex items-center justify-end pr-[10%] lg:pr-[15%]">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, x: 50 }}
                  animate={{ scale: 1, opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="h-[85%] aspect-[2/3] book-perspective hidden md:block"
                >
                  <div className="relative w-full h-full rounded-r-lg overflow-hidden shadow-[20px_20px_60px_rgba(0,0,0,0.8)] border-l-[1px] border-white/10 group-hover:book-tilt transition-transform duration-700">
                    <img 
                      src={coverUrl} 
                      alt={activeBook.title} 
                      className="w-full h-full object-cover" 
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = "https://images.unsplash.com/photo-1512820790803-83ca734da794";
                      }}
                    />
                    
                    {/* Spine Effect */}
                    <div className="absolute inset-y-0 left-0 w-[10%] bg-gradient-to-r from-black/80 via-black/20 to-transparent" />
                    {/* Page Depth */}
                    <div className="absolute inset-y-0 right-0 w-[4px] bg-white/10 border-l border-black/20" />
                  </div>
                </motion.div>
            </div>
          </div>
          
          {/* Overlays for perfect legibility and cinematic feel */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent w-full md:w-3/4" />
        </motion.div>
      </AnimatePresence>

      {/* Top Reads Heading - Increased Left Margin */}
      <div className="absolute top-8 left-10 md:top-12 md:left-16 z-50 pointer-events-none flex flex-col gap-1">
        <h2 className="text-xl md:text-2xl font-bold text-white flex items-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          <span className="w-1.5 h-6 bg-amber-500 mr-3 rounded-full inline-block"></span>
          Top Reads
        </h2>
      </div>

      {/* Manage Button moved to bottom left for dashboard */}

      {/* Main Content Area - Increased Left Padding */}
      <div className="absolute inset-0 flex flex-col justify-end p-10 md:p-16 z-20 pointer-events-none">
        <div className="flex justify-between items-end w-full">
          {/* Left Text Detail Section */}
          <div 
            className="w-full lg:w-1/2 flex flex-col gap-4 pointer-events-auto cursor-pointer"
            onClick={() => onBookClick(activeBook)}
          >
            <motion.h1 
              key={`title-${activeBook.documentId}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-4xl md:text-5xl lg:text-7xl font-black text-white leading-none font-poppins drop-shadow-2xl"
            >
              {activeBook.title}
            </motion.h1>
            
            <motion.div 
              key={`meta-${activeBook.documentId}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="flex items-center gap-3 text-sm md:text-base text-white/90 font-bold tracking-tight"
            >
              {activeBook.year && <span className="text-amber-400">{activeBook.year}</span>}
              {activeBook.year && authors && <span className="text-white/40">•</span>}
              {authors && <span className="truncate max-w-[250px]">{authors}</span>}
              {subjects.length > 0 && <span className="text-white/40">•</span>}
              {subjects.length > 0 && <span className="text-amber-500/80">{subjects[0]}</span>}
            </motion.div>

            <motion.p 
              key={`desc-${activeBook.documentId}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="text-white/80 text-sm md:text-base leading-relaxed line-clamp-3 max-w-xl font-medium drop-shadow-md"
            >
              {activeBook.description?.replace(/<[^>]+>/g, '') || "Explore this featured recommendation."}
            </motion.p>
            
            <motion.div 
              key={`btns-${activeBook.documentId}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="flex items-center gap-4 mt-4"
              onClick={(e) => e.stopPropagation()}
            >
              {showManageButton ? (
                <button 
                  onClick={(e) => { e.stopPropagation(); onManageClick?.(); }}
                  className={`flex items-center gap-2 ${categoryStyles ? 'bg-[var(--category-accent)]' : 'bg-dashboard-accent'} hover:opacity-90 ${categoryStyles ? 'text-[color:var(--category-accent-ink)]' : 'text-white'} font-bold py-4 px-10 rounded-xl shadow-2xl shadow-blue-500/20 transition-all hover:scale-105 active:scale-95`}
                >
                  <Star size={20} fill="currentColor" />
                  Manage Top Reads
                </button>
              ) : (
                <button 
                  onClick={() => onBookClick(activeBook)}
                  className={`flex items-center gap-2 ${categoryStyles ? 'bg-[var(--category-accent)]' : 'bg-dashboard-accent'} hover:opacity-90 ${categoryStyles ? 'text-[color:var(--category-accent-ink)]' : 'text-white'} font-bold py-4 px-10 rounded-xl shadow-2xl shadow-blue-500/20 transition-all hover:scale-105 active:scale-95`}
                >
                  <BookOpen size={20} />
                  See Details
                </button>
              )}
            </motion.div>
          </div>

          {/* Right Bottom Thumbnail Row */}
          <div className="hidden lg:flex flex-col items-end max-w-[35%] pointer-events-auto">
            <div className="relative group/thumbs w-full max-w-xl pl-12">
               {/* Nav arrows */}
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

              {/* Thumbnails */}
              <div 
                ref={scrollRef}
                onScroll={updateScrollButtons}
                className="flex gap-4 overflow-x-auto scrollbar-hide py-4 px-2"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {books.map((book, index) => {
                  const isSelected = index === activeIndex;
                  const thumbUrl = buildCoverUrl(book.cover_url_large || book.cover_url);
                  return (
                    <button
                      key={`thumb-${book.documentId}`}
                      onClick={(e) => { e.stopPropagation(); setActiveIndex(index); }}
                      className={`relative flex-shrink-0 w-20 aspect-[2/3] book-perspective transition-all duration-300 ${isSelected ? 'scale-110 z-10' : 'opacity-50 hover:opacity-100 hover:scale-105 filter brightness-75 hover:brightness-100'}`}
                    >
                      <div className={`relative w-full h-full rounded-r-sm overflow-hidden shadow-xl ${isSelected ? 'ring-1 ring-white/50 book-tilt' : ''} transition-all duration-500`}>
                        <img 
                          src={thumbUrl} 
                          alt={book.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "https://images.unsplash.com/photo-1512820790803-83ca734da794"; }}
                        />
                        <div className="absolute inset-0 bg-black/20" />
                        {/* Thumbnail Spine */}
                        <div className="absolute inset-y-0 left-0 w-[15%] bg-gradient-to-r from-black/60 to-transparent" />
                      </div>
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

export default TopReadsHero;
