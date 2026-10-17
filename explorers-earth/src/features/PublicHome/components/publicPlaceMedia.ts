import { IMAGE_CONFIG } from "../../../config";
// One definition of the canonical media route, shared with the owner dashboard and the
// public profile tab. This file had the only correct copy; the other two had drifted.
import { isCanonicalMediaPath } from "../../../lib/canonicalMedia";

export interface PublicPlaceImageSources {
  itemMedia?: unknown;
  itemThumbnail?: unknown;
  itemPhotos?: unknown;
  parentListThumbnail?: unknown;
}

const readCandidateUrl = (candidate: unknown): string | undefined => {
  if (typeof candidate === "string") return candidate.trim() || undefined;
  if (
    candidate
    && typeof candidate === "object"
    && "url" in candidate
    && typeof candidate.url === "string"
  ) {
    return candidate.url.trim() || undefined;
  }
  return undefined;
};


const resolveSavedMediaUrl = (candidate: unknown): string | undefined => {
  const value = readCandidateUrl(candidate);
  if (!value) return undefined;

  if (isCanonicalMediaPath(value)) return value;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    // The canonical media route and nothing else. Ticket 7.1: "admit only the controlled
    // same-origin media-content route alongside explicitly retained approved provider
    // imagery; do not introduce a generic URL proxy."
    //
    // What was here before, and why it had to go: a bare `/uploads/...` path prefixed with
    // the Strapi origin, any URL on the Strapi origin, and any `*.amazonaws.com` host. The
    // media route is where visibility is applied, so a direct S3 URL skipped the gate -
    // hiding a place's only public attachment did not deny its bytes.
    //
    // Canonical publicPlacesProjection emits only controlled media paths for these inputs.
    // The opt-in legacy Strapi gateway can still return raw attachment URLs; those
    // intentionally fall back to the default image here. Canonical launch must use the
    // canonical public-profile composition. Supporting legacy saved attachments would
    // require authorized media normalization, not restoring direct storage URL access.
    if (typeof window !== "undefined" && parsed.origin === window.location.origin
      && isCanonicalMediaPath(parsed.pathname) && !parsed.search && !parsed.hash) return parsed.toString();
  } catch {
    return undefined;
  }

  return undefined;
};

const firstSavedMediaUrl = (source: unknown): string | undefined => {
  const candidates = Array.isArray(source) ? source : [source];
  for (const candidate of candidates) {
    const resolved = resolveSavedMediaUrl(candidate);
    if (resolved) return resolved;
  }
  return undefined;
};

export const resolvePublicPlaceImage = ({
  itemMedia,
  itemThumbnail,
  itemPhotos,
  parentListThumbnail,
}: PublicPlaceImageSources): string => (
  firstSavedMediaUrl(itemMedia)
  || firstSavedMediaUrl(itemThumbnail)
  || firstSavedMediaUrl(itemPhotos)
  || firstSavedMediaUrl(parentListThumbnail)
  || IMAGE_CONFIG.defaultImages.place
);
