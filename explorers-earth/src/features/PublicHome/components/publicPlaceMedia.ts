import { IMAGE_CONFIG } from "../../../config";

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

const publicStrapiOrigin = () => {
  const configured = import.meta.env.VITE_REST_API_URL || "http://localhost:1337/api";
  const browserOrigin = typeof window === "undefined"
    ? "http://localhost"
    : window.location.origin;
  try {
    return new URL(configured, browserOrigin).origin;
  } catch {
    return "http://localhost:1337";
  }
};

const isAmazonS3Host = (hostname: string) => (
  hostname === "s3.amazonaws.com"
  || /^s3[.-][a-z0-9-]+\.amazonaws\.com$/i.test(hostname)
  || /^[a-z0-9][a-z0-9.-]*\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/i.test(hostname)
);

const resolveSavedMediaUrl = (candidate: unknown): string | undefined => {
  const value = readCandidateUrl(candidate);
  if (!value) return undefined;

  const canonicalMediaPath = /^\/api\/explorers\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/content$/i;
  if (canonicalMediaPath.test(value)) return value;

  if (value.startsWith("/uploads/")) {
    return `${publicStrapiOrigin()}${value}`;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    if (typeof window !== "undefined" && parsed.origin === window.location.origin
      && canonicalMediaPath.test(parsed.pathname) && !parsed.search && !parsed.hash) return parsed.toString();
    if (parsed.origin === publicStrapiOrigin() || isAmazonS3Host(parsed.hostname)) {
      return parsed.toString();
    }
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
