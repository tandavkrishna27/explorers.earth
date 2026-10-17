import { useState, useEffect } from "react";
import { motion, PanInfo } from "framer-motion";
import { Star, ExternalLink } from "lucide-react";
import { Users } from "lucide-react";
import type { RecommendedPerson } from "../../types";
import { buildImageUrl, getPlatformColor } from "../../utils/personHelpers";
import PlatformIcon from "../PlatformIcon";

interface PersonTopPicksMobileHeroProps {
  people: RecommendedPerson[];
  onPersonClick: (person: RecommendedPerson) => void;
  showManageButton?: boolean;
  onManageClick?: () => void;
}

const PersonTopPicksMobileHero = ({ people, onPersonClick, showManageButton = false, onManageClick }: PersonTopPicksMobileHeroProps) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (people.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % people.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [people.length]);

  if (!people || people.length === 0) return null;

  const handleDragEnd = (_e: any, { offset, velocity }: PanInfo) => {
    if (offset.x < -50 || velocity.x < -300) {
      setActiveIndex((prev) => (prev + 1) % people.length);
    } else if (offset.x > 50 || velocity.x > 300) {
      setActiveIndex((prev) => (prev - 1 + people.length) % people.length);
    }
  };

  return (
    <div className="relative w-full h-[65vh] min-h-[480px] max-h-[650px] overflow-hidden flex items-center justify-start py-6 mb-8 mt-2 touch-pan-y">
      <div className="absolute inset-0 left-4 right-14">
        {people.map((person, i) => {
          const diff = (i - activeIndex + people.length) % people.length;

          let position = "hiddenRight";
          if (diff === 0) position = "active";
          else if (diff === 1) position = "next";
          else if (diff === 2) position = "nextNext";
          else if (diff === people.length - 1) position = "hiddenLeft";

          const variants = {
            active: { x: 0, scale: 1, zIndex: 10, opacity: 1 },
            next: { x: "12%", scale: 0.9, zIndex: 5, opacity: 1 },
            nextNext: { x: "24%", scale: 0.8, zIndex: 4, opacity: 1 },
            hiddenRight: { x: "40%", scale: 0.7, zIndex: 1, opacity: 0 },
            hiddenLeft: { x: "-110%", scale: 1, zIndex: 11, opacity: 0 }
          };

          const avatarUrl = buildImageUrl(person.avatar_url);
          const platformGradient = getPlatformColor(person.platform || null);

          return (
            <motion.div
              key={person.documentId}
              data-public-category-artwork={diff === 0 ? true : undefined}
              variants={variants}
              initial={false}
              animate={position}
              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
              drag={diff === 0 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.8}
              onDragEnd={handleDragEnd}
              className={`absolute inset-0 h-full rounded-2xl overflow-hidden shadow-2xl bg-[#121824] border border-white/10 ${diff === 0 ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
              onClick={() => diff === 0 && onPersonClick(person)}
            >
              {/* Background */}
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={person.full_name}
                  className="w-full h-full object-cover select-none pointer-events-none opacity-70"
                />
              ) : (
                <div className={`w-full h-full bg-gradient-to-br ${platformGradient} opacity-40`} />
              )}

              {/* Gradient dark overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 pointer-events-none" />

              {/* Top picks label */}
              <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto z-20">
                <div className="flex items-center pointer-events-none drop-shadow-md">
                  <span className="w-1 h-5 bg-violet-500 mr-2 rounded-full inline-block"></span>
                  <h2 className="text-lg font-bold text-white tracking-tight">Top Picks</h2>
                </div>
                {person.platform && (
                  <PlatformIcon platform={person.platform} size={16} className="flex-shrink-0" />
                )}
              </div>

              {/* Avatar + Info */}
              <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-1.5 pointer-events-none">
                {/* Circular avatar */}
                <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-white/30 shadow-xl mb-2 bg-[#1a2332]">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={person.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Users size={20} className="text-white/30" />
                    </div>
                  )}
                </div>

                <h2 className="text-3xl font-poppins font-black text-white leading-tight drop-shadow-xl select-none">
                  {person.full_name}
                </h2>

                <div className="flex flex-wrap items-center gap-2 text-xs text-white/80 font-semibold tracking-wide mt-1">
                  {person.handle && <span className="text-white/60">@{person.handle}</span>}
                  {person.headline && (
                    <>
                      {person.handle && <span className="text-white/30">·</span>}
                      <span className="text-white/70 line-clamp-1">{person.headline}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-4 pointer-events-auto">
                  {showManageButton ? (
                    <button
                      className="flex-1 bg-[var(--category-accent,#7c3aed)] hover:bg-[var(--category-accent,#6d28d9)] text-[color:var(--category-accent-ink,#fff)] font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl"
                      onClick={(e) => {
                        e.stopPropagation();
                        onManageClick?.();
                      }}
                    >
                      <Star size={18} fill="currentColor" /> Manage Top Picks
                    </button>
                  ) : (
                    <button
                      className="flex-1 bg-[var(--category-accent,#7c3aed)] hover:bg-[var(--category-accent,#6d28d9)] text-[color:var(--category-accent-ink,#fff)] font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPersonClick(person);
                      }}
                    >
                      <ExternalLink size={18} /> View Profile
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

export default PersonTopPicksMobileHero;
