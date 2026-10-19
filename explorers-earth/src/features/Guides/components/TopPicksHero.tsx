import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { Guide } from "../types";
import { guideDescriptionText } from "../../../utils/guideDescriptionText";

interface TopPicksHeroProps {
  guides: Guide[];
  onGuideClick: (guide: Guide) => void;
  showManageButton?: boolean;
  onManageClick?: () => void;
}

const getBudgetTypeLabel = (value: string | null): string => {
  if (!value) return "";
  const budgetTypeMap: Record<string, string> = {
    "Budget": "Budget",
    "Mid_Range": "Mid-Range",
    "Luxury": "Luxury",
    "Backpacker": "Backpacker",
    "Ultra_Luxury": "Ultra-Luxury",
  };
  return budgetTypeMap[value] || value;
};

const renderGuideDescription = (description: any) =>
  guideDescriptionText(description).trim() || "No description provided.";

const TopPicksHero = ({ guides, onGuideClick, showManageButton = false, onManageClick }: TopPicksHeroProps) => {
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
  }, [guides]);

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
    if (guides.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % guides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [guides.length]);

  if (!guides || guides.length === 0) return null;

  const activeGuide = guides[activeIndex >= guides.length ? 0 : activeIndex];
  const coverImage = activeGuide.Guide_Media?.[0]?.url || "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80";

  const handleScrollClick = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -300 : 300;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="relative w-full h-[60vh] min-h-[500px] max-h-[700px] rounded-[20px] overflow-hidden bg-black shadow-2xl group/hero mb-12 border border-white/10">
      {/* Background Presentation & Click Target */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeGuide.documentId}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 cursor-pointer"
          onClick={() => onGuideClick(activeGuide)}
        >
          <img
            src={coverImage}
            alt={activeGuide.Title}
            className="w-full h-full object-cover opacity-90"
          />
          {/* Gradients to fade bottom and left */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Top Picks Heading */}
      <div className="absolute top-8 left-8 md:top-12 md:left-12 z-50 pointer-events-none flex flex-col gap-1">
        <h2 className="text-xl md:text-2xl font-bold text-white flex items-center drop-shadow-lg font-poppins">
          <span className="w-1.5 h-6 bg-yellow-400 mr-2.5 rounded-full inline-block"></span>
          Featured
        </h2>
      </div>

      {/* Main Content Area */}
      <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12 z-10">
        <div className="flex justify-between items-end w-full">
          {/* Left Text Detail Section */}
          <div className="w-full lg:w-1/2 flex flex-col gap-4">
            <motion.h1 
              key={`title-${activeGuide.documentId}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight font-poppins"
            >
              {activeGuide.Title}
            </motion.h1>
            
            <motion.div 
              key={`meta-${activeGuide.documentId}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="flex items-center gap-3 text-sm md:text-base text-white/80 font-semibold"
            >
              <span>{activeGuide.Guide_Type || "Travel Guide"}</span>
              {activeGuide.Number_Of_Days !== null && activeGuide.Number_Of_Days !== undefined && (
                <>
                  <span className="text-white/40">•</span>
                  <span>{activeGuide.Number_Of_Days} {activeGuide.Number_Of_Days === 1 ? 'day' : 'days'}</span>
                </>
              )}
              {activeGuide.Budget_Type && (
                <>
                  <span className="text-white/40">•</span>
                  <span>{getBudgetTypeLabel(activeGuide.Budget_Type)}</span>
                </>
              )}
            </motion.div>

            <motion.p 
              key={`desc-${activeGuide.documentId}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="text-white/70 text-sm md:text-base leading-relaxed line-clamp-3 max-w-xl"
            >
              {renderGuideDescription(activeGuide.Description)}
            </motion.p>
            
            <motion.div 
              key={`btns-${activeGuide.documentId}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="flex items-center gap-4 mt-2"
            >
              {showManageButton ? (
                <button 
                  onClick={(e) => { e.stopPropagation(); onManageClick?.(); }}
                  className="flex items-center gap-2 bg-dashboard-accent hover:opacity-90 text-white font-bold py-3 px-8 rounded-lg shadow-xl shadow-blue-500/20 transition-all hover:scale-105 border-none cursor-pointer font-poppins text-sm"
                >
                  <Star size={20} fill="currentColor" />
                  Manage Top Picks
                </button>
              ) : (
                <button 
                  onClick={() => onGuideClick(activeGuide)}
                  className="flex items-center gap-2 bg-dashboard-accent hover:opacity-90 text-white font-bold py-3 px-8 rounded-lg shadow-xl shadow-blue-500/20 transition-all hover:scale-105 border-none cursor-pointer font-poppins text-sm"
                >
                  <Play size={20} fill="currentColor" />
                  See Details
                </button>
              )}
            </motion.div>
          </div>

          {/* Right Bottom Top Picks Thumbnail Row */}
          <div className="hidden lg:flex flex-col items-end max-w-[50%] z-20">
            <div className="relative group/thumbs w-full max-w-2xl pl-12">
               {/* Nav arrows for thumbnails */}
               {canScrollLeft && (
                <button
                  onClick={() => handleScrollClick('left')}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-black/80 hover:bg-black text-white rounded-r-xl p-2 shadow-2xl opacity-0 group-hover/thumbs:opacity-100 transition-all backdrop-blur-md cursor-pointer border-none"
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              {canScrollRight && (
                <button
                  onClick={() => handleScrollClick('right')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-30 bg-black/80 hover:bg-black text-white rounded-l-xl p-2 shadow-2xl opacity-0 group-hover/thumbs:opacity-100 transition-all backdrop-blur-md cursor-pointer border-none"
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
                {guides.map((guide, index) => {
                  const isSelected = index === activeIndex;
                  const thumbUrl = guide.Guide_Media?.[0]?.url || "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=300&q=80";
                  return (
                    <button
                      key={`thumb-${guide.documentId}`}
                      onClick={(e) => { e.stopPropagation(); setActiveIndex(index); }}
                      className={`relative flex-shrink-0 w-32 aspect-video rounded-md overflow-hidden transition-all duration-300 border-none cursor-pointer ${isSelected ? 'ring-2 ring-white scale-110 z-10 shadow-xl' : 'opacity-60 hover:opacity-100 hover:scale-105 filter brightness-75 hover:brightness-100'}`}
                    >
                      <img 
                        src={thumbUrl} 
                        alt={guide.Title}
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
