import { getBaseUrl } from "./getCurrentDomain";
import { appendUtmParams, createUtmParams } from "./urlHelpers";

export type ListQrCategory = "apps" | "products" | "people" | "movies" | "books" | "games" | "places";

/**
 * Public URL of a curated list. The origin is resolved when called (never at module load),
 * so it follows the runtime public config exactly like the profile Share modal does.
 */
export function buildListPublicUrl(username: string | undefined | null, category: ListQrCategory, slug: string): string {
  return `${getBaseUrl()}/${username || "user"}/${category}/${slug}`;
}

/** The URL encoded in a QR code: the public URL tagged so scans count as QR Code traffic. */
export function buildQrUrl(url: string): string {
  return url ? appendUtmParams(url, createUtmParams.qrCode()) : url;
}
