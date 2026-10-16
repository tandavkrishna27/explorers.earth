import { appendAttributionParamsToPath, canonicalizePublicPathname } from "../../../utils/urlHelpers";

export type PublicHeaderAnalyticsMetadata = Record<string, string>;

export type PublicHeaderShareDescriptor = {
  navigationKey: string;
  title: string;
  text?: string;
  url: string;
  analyticsContext: string;
  analyticsReady?: boolean;
  analyticsMetadata?: PublicHeaderAnalyticsMetadata;
};

export type PublicHeaderFallbackInput = {
  origin: string;
  pathname: string;
  search: string;
  username: string;
  profileName?: string;
  navigationKey?: string;
};

export type PublicHeaderRegistrationUrlInput = {
  origin: string;
  username: string;
  currentSearch: string;
  registeredUrl: string;
  fallbackUrl: string;
};

const ROUTE_LABELS: Record<string, string> = {
  apps: "Apps",
  books: "Books",
  games: "Games",
  guides: "Guides",
  movies: "Movies",
  music: "Music",
  people: "People",
  places: "Places",
  products: "Products",
};

const getOrigin = (origin: string): string => {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, "");
  }
};

const decodedLower = (segment: string): string | undefined => {
  try {
    return decodeURIComponent(segment).trim().toLowerCase();
  } catch {
    return undefined;
  }
};

const isValidPublicPath = (pathname: string): boolean => {
  const [, ...tail] = pathname.split(/\/+/).filter(Boolean);
  if (tail.length === 0) return true;
  const category = decodedLower(tail[0]);
  if (!category || !ROUTE_LABELS[category]) return false;
  if (category === "music") return tail.length === 1;
  if (category === "guides" || category === "products") return tail.length <= 2;
  if (category === "apps") return tail.length <= 2;
  if (category === "places") {
    if (tail.length > 3) return false;
    if (tail.length === 3) return ["map", "placesmap"].includes(decodedLower(tail[2]) || "");
    return true;
  }
  const nestedPrefix = category === "books"
    ? "subject"
    : category === "movies" || category === "games"
      ? "genre"
      : category === "people"
        ? "sector"
        : undefined;
  return tail.length <= 2 || (tail.length === 3 && decodedLower(tail[1]) === nestedPrefix);
};

const publicRouteFamily = (pathname: string): string =>
  decodedLower(pathname.split(/\/+/).filter(Boolean)[1] || "") || "profile";

export const resolvePublicHeaderRegistrationUrl = ({
  origin,
  username,
  currentSearch,
  registeredUrl,
  fallbackUrl,
}: PublicHeaderRegistrationUrlInput): string => {
  try {
    const canonicalOrigin = new URL(origin).origin;
    const candidate = new URL(registeredUrl, `${canonicalOrigin}/`);
    if (candidate.origin !== canonicalOrigin || candidate.username || candidate.password) return fallbackUrl;
    const firstSegment = candidate.pathname.split(/\/+/).filter(Boolean)[0];
    if (decodedLower(firstSegment || "") !== username.trim().toLowerCase()) return fallbackUrl;
    const canonicalPathname = canonicalizePublicPathname(candidate.pathname, username);
    if (!isValidPublicPath(canonicalPathname)) return fallbackUrl;
    const fallbackPathname = new URL(fallbackUrl).pathname;
    if (publicRouteFamily(canonicalPathname) !== publicRouteFamily(fallbackPathname)) return fallbackUrl;
    return `${canonicalOrigin}${appendAttributionParamsToPath(canonicalPathname, currentSearch)}`;
  } catch {
    return fallbackUrl;
  }
};

export const getPublicHeaderFallback = ({
  origin,
  pathname,
  search,
  username,
  profileName,
  navigationKey = "default",
}: PublicHeaderFallbackInput): PublicHeaderShareDescriptor => {
  const canonicalPathname = canonicalizePublicPathname(pathname, username);
  const category = canonicalPathname.split("/").filter(Boolean)[1]?.toLowerCase();
  const label = (category && ROUTE_LABELS[category]) || "Profile";
  const owner = profileName?.trim() || username.trim() || "Explorer";
  const title = `${owner}'s ${label}`;

  return {
    navigationKey,
    title,
    text: `Check out ${title}!`,
    url: `${getOrigin(origin)}${appendAttributionParamsToPath(canonicalPathname, search)}`,
    analyticsContext: `${category && ROUTE_LABELS[category] ? category : "profile"}-header`,
    ...(category === 'books' ? { analyticsReady: false } : {}),
  };
};
