import { memo } from "react";
import { usePublicCategoryThemeStyles } from "../../../PublicHome/components/PublicCategoryThemeContext";
import { motion } from "framer-motion";
import type { RecommendedMovie } from "../../types";
import { buildPosterUrl, formatRating, getGenreNames } from "../../utils/movieHelpers";
import { Star, Tv } from "lucide-react";

interface MoviePosterCardProps {
  movie: RecommendedMovie;
  onClick: (movie: RecommendedMovie) => void;
  size?: "sm" | "md" | "lg";
}

const FALLBACK_POSTER = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0%25' stop-color='%23171e2e'/><stop offset='100%25' stop-color='%230d1117'/></linearGradient></defs><rect width='300' height='450' fill='url(%23g)'/><rect x='110' y='150' width='80' height='100' rx='8' fill='%231d2d44' opacity='0.8'/><circle cx='150' cy='185' r='22' fill='%233a86ff' opacity='0.6'/><text x='150' y='290' text-anchor='middle' font-family='sans-serif' font-size='13' fill='%234a6fa5'>No Poster</text></svg>`;

const MoviePosterCard = memo(({ movie, onClick, size = "md" }: MoviePosterCardProps) => {
  const categoryStyles = usePublicCategoryThemeStyles();
  const posterUrl = buildPosterUrl(movie.poster_path, size === "lg" ? "w500" : "w342");
  const rating = formatRating(movie.tmdb_rating);
  const genres = getGenreNames(movie.genres);

  const sizeClasses = {
    sm: "w-28 min-w-[7rem]",
    md: "w-36 min-w-[9rem]",
    lg: "w-44 min-w-[11rem]",
  };

  return (
    <motion.div
      className={`${sizeClasses[size]} flex flex-col cursor-pointer group flex-shrink-0`}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onClick={() => onClick(movie)}
    >
      {/* Poster Image */}
      <div className="relative rounded-xl overflow-hidden bg-[var(--category-card,#1a2332)] shadow-lg ring-1 ring-[color:var(--category-border,rgba(255,255,255,0.05))] group-hover:ring-[color:var(--category-focus,rgba(59,130,246,0.4))] transition-all duration-300">
        <div className="aspect-[2/3]">
          <img
            src={posterUrl || FALLBACK_POSTER}
            alt={movie.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER;
            }}
          />
        </div>

        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Rating badge */}
        {rating && (
          <div className="absolute bottom-2 right-2 flex items-center gap-0.5 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-xs font-semibold text-yellow-400">
            <Star size={10} fill="currentColor" />
            <span>{rating}</span>
          </div>
        )}

        {/* TV Series badge */}
        {movie.media_type === "TV" && (
          <div style={categoryStyles ? { backgroundColor: '#1D4ED8' } : undefined} className="absolute top-2 left-2 flex items-center gap-1 bg-blue-600/90 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-xs font-semibold text-white">
            <Tv size={10} />
            <span>Series</span>
          </div>
        )}
      </div>

      {/* Title and year */}
      <div className="mt-2 px-0.5">
        <p className="text-sm font-medium text-[color:var(--category-text,rgba(255,255,255,0.9))] leading-tight line-clamp-2 group-hover:text-[color:var(--category-text,#fff)] transition-colors duration-200">
          {movie.title}
        </p>
        {(movie.year || genres[0]) && (
          <p className="text-xs text-[color:var(--category-muted,rgba(255,255,255,0.4))] mt-0.5 truncate">
            {movie.year}{movie.year && genres[0] ? " · " : ""}{genres[0]}
          </p>
        )}
      </div>
    </motion.div>
  );
});

MoviePosterCard.displayName = "MoviePosterCard";

export default MoviePosterCard;
