import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { usePublicColdEntry } from "../../layouts/PublicColdEntryBoundary";
import NotFound from "../../pages/NotFound";
import { usePublicAccountIdentity } from "../../features/music/PublicMusicAvailabilityProvider";

interface UsernameValidatorProps { children: ReactNode }

const VALID_ROUTES = new Set([
  "places", "music", "guides", "movies", "books", "games", "apps", "products", "people",
]);

function decodedLowerSegments(pathname: string): string[] {
  return pathname.replace(/\/+$/, "").split("/").filter(Boolean).map((segment) => {
    try { return decodeURIComponent(segment.trim()).toLowerCase(); }
    catch { return segment.trim().toLowerCase(); }
  });
}

function isValidPublicPath(pathname: string): boolean {
  const [, ...restSegments] = decodedLowerSegments(pathname);
  if (restSegments.length === 0) return true;
  const currentRoute = restSegments[0];
  if (!VALID_ROUTES.has(currentRoute)) return false;
  if (currentRoute === "places") {
    if (restSegments.length > 3) return false;
    if (restSegments.length === 3 && !["map", "placesmap"].includes(restSegments[2])) return false;
    return true;
  }
  return !(
    (currentRoute === "music" && restSegments.length !== 1)
    || (currentRoute === "guides" && ![1, 2].includes(restSegments.length))
    || (currentRoute === "movies" && !(restSegments.length === 1 || restSegments.length === 2 || (restSegments.length === 3 && restSegments[1] === "genre")))
    || (currentRoute === "books" && !(restSegments.length === 1 || restSegments.length === 2 || (restSegments.length === 3 && restSegments[1] === "subject")))
    || (currentRoute === "games" && !(restSegments.length === 1 || restSegments.length === 2 || (restSegments.length === 3 && restSegments[1] === "genre")))
    || (currentRoute === "apps" && restSegments.length > 2)
    || (currentRoute === "products" && ![1, 2].includes(restSegments.length))
    || (currentRoute === "people" && !(restSegments.length === 1 || restSegments.length === 2 || (restSegments.length === 3 && restSegments[1] === "sector")))
  );
}

function withCanonicalUsername(pathname: string, canonicalUsername: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return `/${[canonicalUsername, ...segments.slice(1)].join("/")}`;
}

const UsernameValidator = ({ children }: UsernameValidatorProps) => {
  const { username } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const cold = usePublicColdEntry();
  const normalizedUsername = username?.trim().toLowerCase();
  const identity = usePublicAccountIdentity();
  const loading = identity.status === "loading";
  const error = identity.status === "terminal-error"
    ? identity.error ?? new Error("PROFILE_UNAVAILABLE")
    : undefined;
  const account = identity.account as { username?: unknown } | undefined;
  const canonicalUsername = typeof account?.username === "string"
    ? account.username.trim().toLowerCase()
    : undefined;
  const accountMatches = !!normalizedUsername && canonicalUsername === normalizedUsername;
  const canonicalPathname = canonicalUsername
    ? withCanonicalUsername(location.pathname, canonicalUsername)
    : undefined;
  const needsCanonicalRedirect = accountMatches && canonicalPathname !== location.pathname;
  const validPath = isValidPublicPath(location.pathname);
  const [, routeSegment, ...remainingSegments] = decodedLowerSegments(location.pathname);
  const allowsInlineRecovery = Boolean(error)
    && !String(error).includes("PUBLIC_PROFILE_404")
    && routeSegment === "music"
    && remainingSegments.length === 0;

  useEffect(() => {
    if (accountMatches) {
      if (!validPath) {
        navigate({ pathname: `/${canonicalUsername}`, search: location.search, hash: location.hash }, { replace: true });
        return;
      }
      if (needsCanonicalRedirect && canonicalPathname) {
        navigate({ pathname: canonicalPathname, search: location.search, hash: location.hash }, { replace: true });
        return;
      }
      cold.reportValidation("valid");
      return;
    }
    if (allowsInlineRecovery) { cold.reportValidation("valid"); return; }
    if (loading) { cold.reportValidation("pending"); return; }
    cold.reportValidation("terminal-invalid");
  }, [accountMatches, canonicalPathname, canonicalUsername, cold.reportValidation, error, loading,
    location.hash, location.search, navigate, needsCanonicalRedirect, validPath, allowsInlineRecovery]);

  if (accountMatches) {
    if (needsCanonicalRedirect || !validPath) return null;
    return <>{children}</>;
  }
  if (allowsInlineRecovery) return <>{children}</>;
  if (loading) return null;
  return <NotFound />;
};

export default UsernameValidator;
