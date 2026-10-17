import { isCanonicalMediaPath } from "../../../lib/canonicalMedia";
// ============================================================
// People Utilities — slug, helpers, rich text, platform icons
// ============================================================

// ─────────────────────────────────────────────────────────────
// Slug generation
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
// Category helpers
// ─────────────────────────────────────────────────────────────
export function categoryToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function slugToCategoryName(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────
// Platform display helpers
// ─────────────────────────────────────────────────────────────
export type PersonPlatform = "instagram" | "linkedin" | "twitter" | "x" | "github" | "youtube" | "website" | "other" | null;

export function getPlatformLabel(platform: PersonPlatform): string {
  const map: Record<string, string> = {
    instagram: "Instagram",
    linkedin: "LinkedIn",
    twitter: "X (Twitter)",
    x: "X (Twitter)",
    github: "GitHub",
    youtube: "YouTube",
    website: "Website",
    other: "Link",
  };
  return platform ? (map[platform] ?? "Link") : "Link";
}

export function getPlatformColor(platform: PersonPlatform): string {
  const map: Record<string, string> = {
    instagram: "from-purple-500 to-pink-500",
    linkedin: "from-blue-600 to-blue-700",
    twitter: "from-slate-700 to-slate-900",
    x: "from-slate-700 to-slate-900",
    github: "from-gray-700 to-gray-900",
    youtube: "from-red-600 to-red-700",
    website: "from-teal-600 to-teal-700",
    other: "from-slate-600 to-slate-800",
  };
  return platform ? (map[platform] ?? "from-slate-600 to-slate-800") : "from-slate-600 to-slate-800";
}

export function getPlatformBadgeClass(platform: PersonPlatform): string {
  const map: Record<string, string> = {
    instagram: "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/30 text-pink-400",
    linkedin: "bg-blue-600/20 border-blue-500/30 text-blue-400",
    twitter: "bg-slate-700/30 border-slate-500/30 text-slate-300",
    x: "bg-slate-700/30 border-slate-500/30 text-slate-300",
    github: "bg-gray-700/30 border-gray-500/30 text-gray-300",
    youtube: "bg-red-600/20 border-red-500/30 text-red-400",
    website: "bg-teal-600/20 border-teal-500/30 text-teal-400",
    other: "bg-slate-600/20 border-slate-500/30 text-slate-300",
  };
  return platform ? (map[platform] ?? "bg-slate-600/20 border-slate-500/30 text-slate-300") : "bg-slate-600/20 border-slate-500/30 text-slate-300";
}

export function detectPlatform(url: string): PersonPlatform {
  if (!url) return "other";
  const lower = url.toLowerCase();
  if (lower.includes("instagram.com")) return "instagram";
  if (lower.includes("linkedin.com")) return "linkedin";
  if (lower.includes("x.com") || lower.includes("twitter.com")) return "x";
  if (lower.includes("github.com")) return "github";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  return "website";
}

// ─────────────────────────────────────────────────────────────
// Rich Text Blocks helper (Tiptap)
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
// Deduplicate people (same pattern as deduplicateProducts)
// ─────────────────────────────────────────────────────────────
export function deduplicatePeople<
  T extends {
    documentId: string;
    social_urls?: any;
    is_pinned?: boolean;
    pin_order?: number | null;
    user_rating?: number | null;
    user_recommendation_note?: any;
  }
>(people: T[] | null | undefined): T[] {
  if (!people || !Array.isArray(people)) return [];

  // Map raw Strapi fields to compatibility fields for the frontend components
  const mapped = people.map(p => {
    if (!p) return p;
    const item = { ...p } as any;
    item.full_name = item.full_name || item.name || "";
    item.handle = item.handle || item.username_handle || "";
    item.avatar_url = item.avatar_url || item.avatar_path || "";
    // If the platform from Strapi is "twitter", we map it to "x" (which the frontend expects for icon/badge styling)
    const rawPlatform = item.primary_platform || item.platform;
    item.platform = rawPlatform === "twitter" ? "x" : rawPlatform || "other";
    item.profile_url = item.profile_url || item.social_urls?.primary || item.social_urls?.instagram || item.social_urls?.linkedin || "";
    item.tags = item.tags || item.skills_tags || [];
    item.bio = item.bio || item.media_details?.bio || "";
    item.follower_count = item.follower_count || item.media_details?.follower_count || "";
    return item as T;
  });

  const groups = new Map<string, T[]>();
  for (const p of mapped) {
    if (!p) continue;
    const key = p.social_urls?.primary || p.social_urls?.instagram || p.social_urls?.linkedin || p.documentId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const result: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
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
          (val === null || val === undefined || val === "" ||
            (Array.isArray(val) && val.length === 0)) &&
          (otherVal !== null && otherVal !== undefined && otherVal !== "" &&
            (!Array.isArray(otherVal) || otherVal.length > 0))
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
// Avatar/image URL builder (Strapi relative → full)
// ─────────────────────────────────────────────────────────────
export function buildImageUrl(imageUrl: string | null | undefined): string {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("http")) return imageUrl;
  // Ticket 7.1: a canonical media URL is same-origin and already complete. Without this
  // it falls into the Strapi-origin branch below and the image is fetched from the wrong
  // host. See `src/lib/canonicalMedia.ts` for why this rule lives in one place.
  if (isCanonicalMediaPath(imageUrl)) return imageUrl;
  if (imageUrl.startsWith("/")) {
    const base =
      import.meta.env.VITE_REST_API_URL?.replace("/api", "") || "http://localhost:1337";
    return `${base}${imageUrl}`;
  }
  return imageUrl;
}

// ─────────────────────────────────────────────────────────────
// Extract unique tags/skills
// ─────────────────────────────────────────────────────────────
export function extractUniqueCategories(
  tagArrays: (string[] | null | undefined)[]
): { name: string; slug: string }[] {
  const seen = new Set<string>();
  const result: { name: string; slug: string }[] = [];
  for (const arr of tagArrays) {
    if (!arr) continue;
    for (const tag of arr) {
      if (tag && !seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        result.push({ name: tag, slug: categoryToSlug(tag) });
      }
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────
// Format follower count
// ─────────────────────────────────────────────────────────────
export function formatFollowerCount(count: string | null | undefined): string {
  if (!count) return "";
  return count;
}
