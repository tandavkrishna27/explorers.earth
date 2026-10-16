// ============================================================
// Movie Utilities — image URL builders, genre helpers
// ============================================================

import type { TMDBGenreObject } from "../types";

// ─────────────────────────────────────────────────────────────
// Image URL builders (delegate to tmdbService)
// ─────────────────────────────────────────────────────────────
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function buildImageUrl(path: string | null | undefined, size: string): string {
  if (!path) return "";
  if (/^https?:\/\//.test(path) || path.startsWith('/api/')) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function buildPosterUrl(path: string | null | undefined, size = "w342"): string {
  return buildImageUrl(path, size);
}

export function buildBackdropUrl(path: string | null | undefined, size = "w780"): string {
  return buildImageUrl(path, size);
}

export function buildLogoUrl(path: string | null | undefined, size = "w92"): string {
  return buildImageUrl(path, size);
}

// ─────────────────────────────────────────────────────────────
// Year extraction
// ─────────────────────────────────────────────────────────────
export function extractYear(dateString: string | null | undefined): string {
  if (!dateString) return "";
  return dateString.substring(0, 4);
}

// ─────────────────────────────────────────────────────────────
// Genre helpers
// ─────────────────────────────────────────────────────────────
export function genreToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function slugToGenreName(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function extractUniqueGenres(genreArrays: (TMDBGenreObject[] | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const arr of genreArrays) {
    if (!arr) continue;
    for (const g of arr) {
      const name = typeof g === "string" ? g : g?.name;
      if (name && !seen.has(name)) {
        seen.add(name);
        result.push(name);
      }
    }
  }
  return result.sort();
}

// Given a raw genres field from Strapi (could be JSON array of objects or strings)
export function parseGenres(genres: unknown): TMDBGenreObject[] {
  if (!genres) return [];
  if (!Array.isArray(genres)) return [];
  return genres.map((g: unknown) => {
    if (typeof g === "string") return { id: 0, name: g };
    if (typeof g === "object" && g !== null && "name" in g) return g as TMDBGenreObject;
    return { id: 0, name: String(g) };
  });
}

export function getGenreNames(genres: unknown): string[] {
  return parseGenres(genres).map((g) => g.name).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// Slug generation (for movie lists)
// ─────────────────────────────────────────────────────────────
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 100);
}

// ─────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────
export function formatRuntime(minutes: number | null | undefined): string {
  if (minutes == null) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatRating(rating: number | null | undefined): string {
  if (rating == null) return "";
  return rating.toFixed(1);
}

// ─────────────────────────────────────────────────────────────
// Rich Text Blocks helper
// ─────────────────────────────────────────────────────────────
export function extractNoteText(note: any): string {
  if (!note) return "";
  if (typeof note === "string") return note;
  if (Array.isArray(note)) {
    return note
      .map((block) => {
        if (block?.children && Array.isArray(block.children)) {
          return block.children.map((c: any) => c.text || "").join("");
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

// ─────────────────────────────────────────────────────────────
// Deduplicate array relationships (fixes Draft&Publish duplication)
// ─────────────────────────────────────────────────────────────
export function deduplicateMovies<T extends { documentId: string; tmdb_id?: string; is_pinned?: boolean; pin_order?: number | null; user_rating?: number | null; user_recommendation_note?: any }>(movies: T[] | null | undefined): T[] {
  if (!movies || !Array.isArray(movies)) return [];
  
  // Provider identifiers are facts; recommendation IDs define card identity.
  const groups = new Map<string, T[]>();
  for (const m of movies) {
    if (!m) continue;
    const key = m.documentId;
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(m);
  }

  const result: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Sort to determine base record: pinned first, then rated, then first occurrence
    group.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      if (a.user_rating && !b.user_rating) return -1;
      if (!a.user_rating && b.user_rating) return 1;
      return 0;
    });

    const merged = { ...group[0] };
    for (let i = 1; i < group.length; i++) {
      const other = group[i];
      if (other.is_pinned) {
        merged.is_pinned = true;
        if (other.pin_order !== null && other.pin_order !== undefined) {
          merged.pin_order = other.pin_order;
        }
      }
      for (const key of Object.keys(other) as Array<keyof T>) {
        if (key === "is_pinned" || key === "pin_order") continue;
        const val = merged[key];
        const otherVal = other[key];
        if (
          (val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) &&
          (otherVal !== null && otherVal !== undefined && otherVal !== "" && (!Array.isArray(otherVal) || otherVal.length > 0))
        ) {
          merged[key] = otherVal;
        }
      }
    }
    result.push(merged);
  }
  return result;
}

