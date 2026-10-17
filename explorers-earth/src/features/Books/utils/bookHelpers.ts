import { isCanonicalMediaPath } from "../../../lib/canonicalMedia";
// ============================================================
// Book Utilities — slug, format helpers, rich text
// ============================================================

// ─────────────────────────────────────────────────────────────
// Slug generation (for book lists — same logic as Movies)
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
// Subject/category helpers
// ─────────────────────────────────────────────────────────────
export function subjectToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function slugToSubjectName(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function extractUniqueSubjects(subjectArrays: (string[] | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const arr of subjectArrays) {
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

export function parseSubjects(subjects: unknown): string[] {
  if (!subjects) return [];
  if (Array.isArray(subjects)) return subjects.filter((s) => typeof s === "string");
  return [];
}

// ─────────────────────────────────────────────────────────────
// Format rating
// ─────────────────────────────────────────────────────────────
export function formatRating(rating: number | null | undefined): string {
  if (!rating) return "";
  return (rating * 2).toFixed(1);
}

// ─────────────────────────────────────────────────────────────
// Format page count
// ─────────────────────────────────────────────────────────────
export function formatPageCount(count: number | null | undefined): string {
  if (!count) return "";
  return `${count} pages`;
}

// ─────────────────────────────────────────────────────────────
// Format authors array for display
// ─────────────────────────────────────────────────────────────
export function formatAuthors(authors: string[] | null | undefined): string {
  if (!authors || authors.length === 0) return "Unknown Author";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return authors.join(" & ");
  return `${authors[0]} et al.`;
}

// ─────────────────────────────────────────────────────────────
// Parse authors (stored as JSON array in Strapi)
// ─────────────────────────────────────────────────────────────
export function parseAuthors(authors: unknown): string[] {
  if (!authors) return [];
  if (Array.isArray(authors)) return authors.filter((a) => typeof a === "string");
  if (typeof authors === "string") return [authors];
  return [];
}

// ─────────────────────────────────────────────────────────────
// Rich Text Blocks helper (same as Movies)
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
// Deduplicate books (fixes Draft & Publish duplication from Strapi)
// ─────────────────────────────────────────────────────────────
export function deduplicateBooks<T extends { documentId: string; volume_id?: string; is_pinned?: boolean; pin_order?: number | null; user_rating?: number | null; user_recommendation_note?: any }>(
  books: T[] | null | undefined
): T[] {
  if (!books || !Array.isArray(books)) return [];

  // Recommendation identity survives repeated memberships; provider identity does not merge owner records.
  const groups = new Map<string, T[]>();
  for (const b of books) {
    if (!b) continue;
    const key = b.documentId;
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(b);
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
  // If it's already an absolute URL (S3 or Google Books), use as-is
  if (coverUrl.startsWith("http")) return coverUrl;
  /*
   * Canonical media URLs are same-origin and carry server byte authority. Matched
   * exactly via `src/lib/canonicalMedia.ts` rather than by prefix: the prefix form also
   * accepted a non-uuid id and anything appended after `/content`.
   *
   * Note for anyone comparing this with its four siblings: this helper has **no**
   * Strapi-origin fallback - an unrecognised relative path becomes "" rather than being
   * concatenated onto another host. That is the stricter design and is deliberate.
   */
  if (isCanonicalMediaPath(coverUrl)) return coverUrl;
  return "";
}
