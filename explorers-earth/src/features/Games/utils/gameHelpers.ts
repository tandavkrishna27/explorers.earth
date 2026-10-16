import { isCanonicalMediaPath } from "../../../lib/canonicalMedia";
// ============================================================
// Game Utilities — slug, format helpers, rich text
// ============================================================

// ─────────────────────────────────────────────────────────────
// Slug generation (for game lists — same logic as Movies/Books)
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
// Genre/category helpers
// ─────────────────────────────────────────────────────────────
export function genreToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function slugToGenreName(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function extractUniqueGenres(genreArrays: (string[] | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const arr of genreArrays) {
    if (!arr) continue;
    for (const s of arr) {
      if (s && !seen.has(s)) {
        seen.add(s);
        result.push(s);
      }
    }
  }
  return result.sort();
}

export function parseGenres(genres: unknown): string[] {
  if (!genres) return [];
  if (Array.isArray(genres)) return genres.filter((s) => typeof s === "string");
  return [];
}

// ─────────────────────────────────────────────────────────────
// Format rating
// ─────────────────────────────────────────────────────────────
export function formatRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return "";
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
// Deduplicate games (fixes Draft & Publish duplication from Strapi)
// ─────────────────────────────────────────────────────────────
export function deduplicateGames<T extends { documentId: string; igdb_id?: number | null; is_pinned?: boolean; pin_order?: number | null; user_rating?: number | null; user_recommendation_note?: any }>(
  games: T[] | null | undefined
): T[] {
  if (!games || !Array.isArray(games)) return [];
  
  // Recommendation UUID is editorial identity; provider IDs never merge owners or memberships.
  const groups = new Map<string | number, T[]>();
  for (const g of games) {
    if (!g) continue;
    const key = g.documentId;
    if (key === undefined || key === null) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(g);
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

// ─────────────────────────────────────────────────────────────
// Cover URL helper
// ─────────────────────────────────────────────────────────────
export function buildCoverUrl(coverUrl: string | null | undefined): string {
  if (!coverUrl) return "";
  // If it's already an absolute URL (S3, IGDB), use as-is
  if (coverUrl.startsWith("http")) return coverUrl;
  /*
   * Ticket 7.1. This builder already handled the canonical route, so unlike its four
   * siblings it was not broken - but it matched by prefix
   * (`startsWith("/api/explorers/v1/media/")`), which also accepts a non-uuid id and
   * anything appended after `/content`. Replaced with the exact shared match so all five
   * agree, and so nothing else under that prefix can be returned as media.
   */
  if (isCanonicalMediaPath(coverUrl)) return coverUrl;
  // If it's a Strapi relative path, prefix with the REST API URL
  if (coverUrl.startsWith("/")) {
    const base =
      import.meta.env.VITE_REST_API_URL?.replace("/api", "") || "http://localhost:1337";
    return `${base}${coverUrl}`;
  }
  return coverUrl;
}
