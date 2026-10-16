import { motion } from "framer-motion";
import { Gamepad2 } from "lucide-react";
import { useState } from "react";
import { buildCoverUrl } from "../../utils/gameHelpers";

interface GameCoverCardProps {
  coverUrl?: string | null;
  title: string;
  onClick: () => void;
}

const GameCoverCard = ({ coverUrl, title, onClick }: GameCoverCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const imageUrl = buildCoverUrl(coverUrl);
  const [failedUrl, setFailedUrl] = useState<string>();

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="relative w-full aspect-[3/4] rounded-xl overflow-hidden group perspective bg-transparent"
    >
      <div
        className={`w-full h-full relative preserve-3d transition-transform duration-500 rounded-xl overflow-hidden shadow-2xl bg-[var(--category-card,rgba(255,255,255,0.05))] border border-[color:var(--category-border,rgba(255,255,255,0.1))] flex items-center justify-center ${
          isHovered ? "rotate-y-[-10deg]" : ""
        }`}
      >
        {imageUrl && imageUrl !== failedUrl ? (
          <>
            <img
              src={imageUrl}
              onError={() => setFailedUrl(imageUrl)}
              alt={title}
              className="w-full h-full object-cover rounded-xl"
            />
            {/* Subtle gloss overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none rounded-xl" />
            
            {/* Edge shading for 3D effect */}
            <div className="absolute top-0 right-0 w-[4%] h-full bg-gradient-to-l from-black/40 to-transparent pointer-events-none rounded-r-xl" />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full text-[color:var(--category-muted,rgba(255,255,255,0.2))] p-4 relative rounded-xl bg-gradient-to-br from-[var(--category-card,#1a2332)] to-[var(--category-page,#0d1117)] border border-[color:var(--category-border,rgba(255,255,255,0.05))]">
             <Gamepad2 className="w-10 h-10 mb-2 opacity-50" />
             <span className="text-[10px] uppercase font-bold tracking-widest text-center line-clamp-2 leading-tight">
               {title}
             </span>
          </div>
        )}
      </div>
    </motion.button>
  );
};

export default GameCoverCard;
