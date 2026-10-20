import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { usePublicColdEntry } from "../../layouts/PublicColdEntryBoundary";
import NotFound from "../../pages/NotFound";
import { usePublicAccountIdentity } from "../../features/PublicHome/api/PublicAccountIdentityProvider";
import { isPublicProfileNotFound } from "../../features/PublicHome/api/publicProfileGatewayClient";
import PublicProfileLoadError from "../../features/PublicHome/components/PublicProfileLoadError";

interface UsernameValidatorProps { children: ReactNode }

const VALID_ROUTES = new Set([
  "places", "guides", "movies", "books", "games", "apps", "products", "people",
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
    (currentRoute === "guides" && ![1, 2].includes(restSegments.length))
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
  // No error at all means the shell resolved without this account: absent, so not-found.
  const error = identity.status === "terminal-error" ? identity.error : undefined;
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
    if (loading) { cold.reportValidation("pending"); return; }
    // Both a real 404 and a retryable failure end cold entry (the overlay must not hide the
    // error view); only the 404 renders not-found below.
    cold.reportValidation("terminal-invalid");
  }, [accountMatches, canonicalPathname, canonicalUsername, cold.reportValidation, error, loading,
    location.hash, location.search, navigate, needsCanonicalRedirect, validPath]);

  if (accountMatches) {
    if (needsCanonicalRedirect || !validPath) return null;
    return <>{children}</>;
  }
  if (loading) return null;
  // Only a real 404 (or a shell that resolved to a different account) is "not found". 429, 5xx and
  // network failures say nothing about whether the profile exists (UAT PUB-X01).
  if (error !== undefined && !isPublicProfileNotFound(error)) {
    return <PublicProfileLoadError error={error} onRetry={() => identity.refetch?.() ?? Promise.resolve()} />;
  }
  return <NotFound />;
};

export default UsernameValidator;
