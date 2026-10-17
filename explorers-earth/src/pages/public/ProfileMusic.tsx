import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useOutletContext, useParams } from "react-router-dom";
import SEO from "../../components/SEO";
import { usePublicMusicAvailability } from "../../features/music/PublicMusicAvailabilityProvider";
import { usePublicMusicResource } from "../../features/music/usePublicMusicResource";
import { PublicMusicContent } from "./PublicMusic";
import { createPublicMusicAnalyticsOccurrence, usePublicMusicProductAnalytics } from "../../features/music/publicMusicAnalytics";
import { appendAttributionParamsToPath } from "../../utils/urlHelpers";

export default function ProfileMusic() {
  const { username } = useParams();
  const location = useLocation();
  const availability = usePublicMusicAvailability();
  const outlet = useOutletContext<{ isPageLoaded?: boolean; setIsPageLoaded?: (loaded: boolean) => void } | null>();
  const settleReadiness = outlet?.setIsPageLoaded;
  const descriptorSlug = availability.descriptor?.publication.publicSlug;
  const accountDocumentId = typeof availability.account?.documentId === "string" ? availability.account.documentId : undefined;
  const visit = `${location.key}:${username}:${accountDocumentId ?? ""}`;
  const settledVisit = useRef<string>();
  const settle = useCallback(() => {
    if (settledVisit.current === visit) return;
    settledVisit.current = visit;
    settleReadiness?.(true);
  }, [settleReadiness, visit]);
  const retainsAuthorizedSnapshot = Boolean(descriptorSlug)
    && (availability.state === "available" || availability.state === "revalidating");
  const guestActionsEnabled = availability.state === "available";
  const notPublic = availability.state === "not-public";
  const disabledState = availability.state === "loading" || availability.state === "revoked" || notPublic
    ? "loading" as const : "unavailable" as const;
  const music = usePublicMusicResource({
    publicSlug: descriptorSlug, enabled: retainsAuthorizedSnapshot, disabledState,
    onRevoked: availability.retry,
    onSettled: settle,
  });
  const trackMusic = usePublicMusicProductAnalytics({
    ...(descriptorSlug ? { publicSlug: descriptorSlug } : { accountDocumentId }),
    route: "friendly",
  });
  const acknowledgedRedirect = useRef<string>();
  const [settledRedirect, setSettledRedirect] = useState<string>();
  useEffect(() => {
    if (!notPublic || !username) { setSettledRedirect(undefined); return; }
    settle();
    if (acknowledgedRedirect.current !== visit) {
      acknowledgedRedirect.current = visit;
      void trackMusic({ name: "unavailable", reason: "not_public" }, createPublicMusicAnalyticsOccurrence());
    }
    setSettledRedirect(visit);
  }, [notPublic, settle, trackMusic, username, visit]);

  const returnTo = appendAttributionParamsToPath(`/${username ?? ""}`, location.search);
  // Readiness and the one unavailable acknowledgement settle before navigation.
  // Initial loading never authorizes a fallback. A previously verified snapshot
  // remains visible during revalidation, but new guest actions pause until it settles.
  if (notPublic && username && settledRedirect === visit) return <Navigate to={returnTo} replace />;
  // Resource revocation triggers descriptor revalidation. Do not acknowledge the
  // same not-public transition once here and again when its fallback settles.
  const viewState = retainsAuthorizedSnapshot ? music.state === "not-found" ? "loading" : music.state : availability.state === "unavailable" && availability.retryAfterSeconds !== undefined
    ? "rate-limited" : disabledState;

  const canonical = descriptorSlug ? `${window.location.origin}/music/share/${encodeURIComponent(descriptorSlug)}` : undefined;
  return <>
    <SEO title="Music | Explorers" description="Public Music on Explorers." canonical={canonical} />
    <PublicMusicContent
      standalone={false}
      initialOverlayActive={outlet?.isPageLoaded === false}
      stale={music.stale}
      revalidating={availability.state === "revalidating"}
      guestActionsEnabled={guestActionsEnabled}
      state={viewState}
      resource={retainsAuthorizedSnapshot ? music.resource : undefined}
      publicSlug={descriptorSlug}
      returnTo={returnTo}
      retryAfterSeconds={availability.retryAfterSeconds ?? music.retryAfterSeconds}
      onRetry={() => { availability.retry(); music.retry(); }}
      analyticsRoute="friendly"
      onAnalytics={trackMusic}
    />
  </>;
}
