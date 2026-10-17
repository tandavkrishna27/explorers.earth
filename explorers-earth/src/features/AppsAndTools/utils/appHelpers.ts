import { isCanonicalMediaPath } from "../../../lib/canonicalMedia";
// ============================================================
// Apps & Tools Utilities — slug, format helpers, rich text
// ============================================================

// ─────────────────────────────────────────────────────────────
// Slug generation (same logic as Games/Books)
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

export function extractUniqueCategories(
  catArrays: ({ name: string; slug: string } | null | undefined)[][]
): { name: string; slug: string }[] {
  const seen = new Set<string>();
  const result: { name: string; slug: string }[] = [];
  for (const arr of catArrays) {
    if (!arr) continue;
    for (const cat of arr) {
      if (cat && !seen.has(cat.slug)) {
        seen.add(cat.slug);
        result.push(cat);
      }
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────
// Platform badge colors
// ─────────────────────────────────────────────────────────────
export function getPlatformColor(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes("ios") || p.includes("iphone") || p.includes("ipad") || p.includes("macos") || p.includes("mac"))
    return "bg-gray-600/30 text-gray-300";
  if (p.includes("android")) return "bg-green-700/30 text-green-300";
  if (p.includes("windows") || p.includes("win")) return "bg-blue-700/30 text-blue-300";
  if (p.includes("web") || p.includes("browser")) return "bg-violet-700/30 text-violet-300";
  if (p.includes("linux")) return "bg-orange-700/30 text-orange-300";
  return "bg-white/10 text-white/60";
}

// ─────────────────────────────────────────────────────────────
// Price tier badge color
// ─────────────────────────────────────────────────────────────
export function getPriceTierColor(tier: string | null | undefined): string {
  switch (tier) {
    case "Free": return "bg-emerald-500/20 text-emerald-400";
    case "Freemium": return "bg-cyan-500/20 text-cyan-400";
    case "Paid": return "bg-amber-500/20 text-amber-400";
    case "Subscription": return "bg-purple-500/20 text-purple-400";
    default: return "bg-white/10 text-white/50";
  }
}

// ─────────────────────────────────────────────────────────────
// Format rating (1-10 integer)
// ─────────────────────────────────────────────────────────────
export function formatRating(rating: number | null | undefined): string {
  if (!rating) return "";
  return rating.toString();
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
// Deduplicate apps (same pattern as deduplicateGames)
// ─────────────────────────────────────────────────────────────
export function deduplicateApps<
  T extends {
    documentId: string;
    app_url?: string;
    is_pinned?: boolean;
    pin_order?: number | null;
    user_rating?: number | null;
    user_recommendation_note?: any;
  }
>(apps: T[] | null | undefined): T[] {
  if (!apps || !Array.isArray(apps)) return [];

  const groups = new Map<string, T[]>();
  for (const a of apps) {
    if (!a) continue;
    // Group by app_url (canonical identity) or fallback to documentId
    const key = a.app_url || a.documentId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
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
// Logo URL builder (Strapi relative → full)
// ─────────────────────────────────────────────────────────────
export function buildLogoUrl(logoUrl: string | null | undefined): string {
  if (!logoUrl) return "";
  if (logoUrl.startsWith("http")) return logoUrl;
  // Ticket 7.1: a canonical media URL is same-origin and already complete. Without this
  // it falls into the Strapi-origin branch below and the image is fetched from the wrong
  // host. See `src/lib/canonicalMedia.ts` for why this rule lives in one place.
  if (isCanonicalMediaPath(logoUrl)) return logoUrl;
  if (logoUrl.startsWith("/")) {
    const base =
      import.meta.env.VITE_REST_API_URL?.replace("/api", "") || "http://localhost:1337";
    return `${base}${logoUrl}`;
  }
  return logoUrl;
}
