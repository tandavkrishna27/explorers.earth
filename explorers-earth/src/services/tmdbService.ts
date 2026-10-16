// Provider requests now use the canonical Explorers API. This compatibility
// module keeps display helpers only; it never holds browser provider credentials.
import type { TMDBMovieDetail } from '../features/Movies/types';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
export function buildImageUrl(path: string | null | undefined, size: string): string {
  if (!path) return "";
  if (/^https?:\/\//.test(path) || path.startsWith("/api/")) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function buildPosterUrl(
  path: string | null | undefined,
  size: "w185" | "w342" | "w500" | "w780" = "w342"
): string {
  return buildImageUrl(path, size);
}

export function buildBackdropUrl(
  path: string | null | undefined,
  size: "w300" | "w780" | "w1280" = "w780"
): string {
  return buildImageUrl(path, size);
}

export function buildLogoUrl(
  path: string | null | undefined,
  size: "w92" | "w154" | "original" = "w92"
): string {
  return buildImageUrl(path, size);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
export function extractYear(dateString: string | null | undefined): string {
  if (!dateString) return "";
  return dateString.substring(0, 4);
}

export function extractDirector(movie: TMDBMovieDetail): string | null {
  return movie.credits?.crew?.find((c) => c.job === "Director")?.name ?? null;
}

const tmdbService = { buildImageUrl, buildPosterUrl, buildBackdropUrl, buildLogoUrl, extractYear, extractDirector };
export default tmdbService;
