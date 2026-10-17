import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Star, ExternalLink } from "lucide-react";
import { Users } from "lucide-react";
import type { RecommendedPerson } from "../../types";
import { buildImageUrl, getPlatformColor } from "../../utils/personHelpers";
import PlatformIcon from "../PlatformIcon";

interface PersonTopPicksHeroProps {
  people: RecommendedPerson[];
  onPersonClick: (person: RecommendedPerson) => void;
  showManageButton?: boolean;
  onManageClick?: () => void;
}

const PersonTopPicksHero = ({ people, onPersonClick, showManageButton = false, onManageClick }: PersonTopPicksHeroProps) => {
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

  useEffect(() => { updateScrollButtons(); }, [people]);

  useEffect(() => {
    if (scrollRef.current) {
      const btn = scrollRef.current.children[activeIndex] as HTMLElement;
      if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeIndex]);

  useEffect(() => {
    if (people.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % people.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [people.length]);

  if (!people || people.length === 0) return null;

  const activePerson = people[activeIndex];
  const avatarUrl = buildImageUrl(activePerson.avatar_url);
  const platformGradient = getPlatformColor(activePerson.platform || null);

  const handleScrollClick = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
    }
  };

  return (
    <div data-public-category-artwork className="relative w-full h-[60vh] min-h-[500px] max-h-[700px] rounded-2xl overflow-hidden bg-black shadow-2xl group/hero mb-12">
      {/* Background — blurred avatar + platform gradient */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activePerson.documentId}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 cursor-pointer"
          onClick={() => onPersonClick(activePerson)}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={activePerson.full_name}
              className="w-full h-full object-cover opacity-60 filter brightness-90"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${platformGradient} opacity-40`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Top Picks Heading */}
      <div className="absolute top-8 left-8 md:top-12 md:left-12 z-50 pointer-events-none flex flex-col gap-1">
        <h2 className="text-xl md:text-2xl font-bold text-white flex items-center drop-shadow-lg">
          <span className="w-1.5 h-6 bg-violet-500 mr-2.5 rounded-full inline-block"></span>
          Top Picks
        </h2>
      </div>

      {/* Main Content Area */}
      <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12 z-10 pointer-events-none">
        <div className="flex justify-between items-end w-full">
          {/* Left side — avatar + info */}
          <div
            className="w-full lg:w-1/2 flex flex-col gap-4 pointer-events-auto cursor-pointer"
            onClick={() => onPersonClick(activePerson)}
          >
            {/* Circular avatar */}
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden ring-4 ring-white/20 shadow-2xl flex-shrink-0 bg-[#1a2332]">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={activePerson.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Users size={32} className="text-white/30" />
                  </div>
                )}
              </div>
              {activePerson.platform && (
                <PlatformIcon platform={activePerson.platform} size={20} className="flex-shrink-0" />
              )}
            </div>

            <motion.h1
              key={`title-${activePerson.documentId}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight font-poppins"
            >
              {activePerson.full_name}
            </motion.h1>

            <motion.div
              key={`meta-${activePerson.documentId}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="flex items-center gap-3 text-sm md:text-base text-white/80 font-semibold flex-wrap"
            >
              {activePerson.handle && <span className="text-white/50">@{activePerson.handle}</span>}
              {activePerson.headline && (
                <>
                  {activePerson.handle && <span className="text-white/30">·</span>}
                  <span className="text-white/70">{activePerson.headline}</span>
                </>
              )}
              {activePerson.user_rating && (
                <>
                  <span className="text-white/30">·</span>
                  <span className="flex items-center gap-1 text-yellow-400 font-bold">
                    <Star size={14} fill="currentColor" /> {activePerson.user_rating}/10
                  </span>
                </>
              )}
            </motion.div>

            {activePerson.bio && (
              <motion.p
                key={`desc-${activePerson.documentId}`}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="text-white/70 text-sm md:text-base leading-relaxed line-clamp-2 max-w-xl"
              >
                {activePerson.bio}
              </motion.p>
            )}

            <motion.div
              key={`btns-${activePerson.documentId}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="flex items-center gap-4 mt-2"
              onClick={(e) => e.stopPropagation()}
            >
              {showManageButton ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onManageClick?.(); }}
                  className="flex items-center gap-2 bg-[var(--category-accent,#7c3aed)] hover:bg-[var(--category-accent,#6d28d9)] text-[color:var(--category-accent-ink,#fff)] font-bold py-3 px-8 rounded-lg shadow-xl shadow-violet-500/20 transition-all hover:scale-105"
                >
                  <Star size={20} fill="currentColor" />
                  Manage Top Picks
                </button>
              ) : (
                <button
                  onClick={() => onPersonClick(activePerson)}
                  className="flex items-center gap-2 bg-[var(--category-accent,#7c3aed)] hover:bg-[var(--category-accent,#6d28d9)] text-[color:var(--category-accent-ink,#fff)] font-bold py-3 px-8 rounded-lg shadow-xl shadow-violet-500/20 transition-all hover:scale-105"
                >
                  <ExternalLink size={20} />
                  View Profile
                </button>
              )}
            </motion.div>
          </div>

          {/* Right side — thumbnail strip */}
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

              {/* Thumbnails */}
              <div
                ref={scrollRef}
                onScroll={updateScrollButtons}
                className="flex gap-4 overflow-x-auto scrollbar-hide py-4 px-2"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {people.map((person, index) => {
                  const isSelected = index === activeIndex;
                  const thumbUrl = buildImageUrl(person.avatar_url);
                  return (
                    <button
                      key={`thumb-${person.documentId}`}
                      onClick={(e) => { e.stopPropagation(); setActiveIndex(index); }}
                      className={`relative flex-shrink-0 flex flex-col items-center gap-1.5 transition-all duration-300 ${isSelected ? 'scale-110 z-10' : 'opacity-60 hover:opacity-100 hover:scale-105'}`}
                    >
                      <div className={`w-16 h-16 rounded-full overflow-hidden shadow-xl ${isSelected ? 'ring-2 ring-white shadow-white/20' : 'ring-1 ring-white/20'}`}>
                        {thumbUrl ? (
                          <img src={thumbUrl} alt={person.full_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-violet-950/50 flex items-center justify-center">
                            <Users size={16} className="text-white/30" />
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-white/70 truncate w-16 text-center">{(person.full_name || person.name || "").split(" ")[0]}</p>
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

export default PersonTopPicksHero;
