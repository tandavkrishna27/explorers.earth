import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Music2 } from "lucide-react";
import SEO from "../../components/SEO";
import { type PublicMusicResource } from "../../features/music/publicMusicClient";
import { PublicMusicSections } from "../../features/music/components/PublicMusicSections";
import { PublicMusicProfileHeader } from '../../features/music/components/PublicMusicProfileHeader';
import { PublicMusicSkeleton } from '../../features/music/components/PublicMusicSkeleton';
import '../../features/music/components/PublicMusicPresentation.css';
import { usePublicMusicResource } from "../../features/music/usePublicMusicResource";
import { createPublicMusicAnalyticsOccurrence, usePublicMusicProductAnalytics, type PublicMusicProductEvent } from "../../features/music/publicMusicAnalytics";

type PublicMusicViewState = "loading" | "ready" | "not-found" | "rate-limited" | "unavailable";

function capabilityFromFragment(fragment: string): string | undefined {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const capability = params.get("access") ?? undefined;
  return capability && /^[A-Za-z0-9_-]{43}$/.test(capability) ? capability : undefined;
}

function capabilityStorageKey(publicSlug: string): string {
  return `explorers.music.unlisted-capability.v1:${publicSlug}`;
}

function retainedCapability(publicSlug: string): string | undefined {
  try {
    return capabilityFromFragment(`#access=${window.sessionStorage.getItem(capabilityStorageKey(publicSlug)) ?? ""}`);
  } catch {
    return undefined;
  }
}

function retainCapability(publicSlug: string, capability: string): void {
  try { window.sessionStorage.setItem(capabilityStorageKey(publicSlug), capability); } catch { /* storage can be unavailable */ }
}

function forgetCapability(publicSlug: string): void {
  try { window.sessionStorage.removeItem(capabilityStorageKey(publicSlug)); } catch { /* storage can be unavailable */ }
}

export function PublicMusicContent({
  state,
  resource,
  retryAfterSeconds = 60,
  stale = false,
  revalidating = false,
  guestActionsEnabled = true,
  onRetry,
  standalone = true,
  initialOverlayActive = false,
  returnTo = "/",
  publicSlug,
  capability,
  analyticsRoute = "direct",
  onAnalytics,
}: {
  state: PublicMusicViewState;
  resource?: PublicMusicResource;
  retryAfterSeconds?: number;
  stale?: boolean;
  revalidating?: boolean;
  guestActionsEnabled?: boolean;
  onRetry?: () => void;
  standalone?: boolean;
  initialOverlayActive?: boolean;
  returnTo?: string;
  publicSlug?: string;
  capability?: string;
  analyticsRoute?: "friendly" | "direct";
  onAnalytics?: (event: PublicMusicProductEvent, occurrenceId?: string) => void | Promise<void>;
}) {
  const Frame = standalone ? "main" : "div";
  const acknowledgedState = useRef<PublicMusicViewState>();
  const stateOccurrence = useRef<string>();
  useEffect(() => {
    if (acknowledgedState.current === state) return;
    stateOccurrence.current = createPublicMusicAnalyticsOccurrence();
    if (state === "ready") {
      acknowledgedState.current = state;
      void onAnalytics?.({ name: "navigation_opened", route: analyticsRoute }, stateOccurrence.current);
    } else if (state === "not-found" || state === "rate-limited" || state === "unavailable") {
      acknowledgedState.current = state;
      void onAnalytics?.({
        name: "unavailable",
        reason: state === "not-found" ? "not_public" : state === "rate-limited" ? "rate_limited" : "service_unavailable",
      }, stateOccurrence.current);
    } else {
      acknowledgedState.current = state;
    }
  }, [analyticsRoute, onAnalytics, state]);
  if (state === "loading") {
    return (
      <Frame className="public-music public-music__frame">
        <div className="public-music__content"><PublicMusicSkeleton announce={!initialOverlayActive} /></div>
      </Frame>
    );
  }
  if (state === "not-found") {
    return (
      <Frame className="public-music public-music__frame public-music__state-frame">
        <section className="public-music__state public-music__surface">
          <Music2 aria-hidden="true" className="public-music__state-icon mx-auto mb-4 h-10 w-10" />
          <h1 className="text-2xl font-semibold">Music page unavailable</h1>
          <div className="public-music__state-actions"><Link className="public-music__secondary" to={returnTo}>{standalone ? "Return to Explorers" : "Return to Profile"}</Link></div>
        </section>
      </Frame>
    );
  }
  if (state === "rate-limited") {
    return <RateLimitedMusic retryAfterSeconds={retryAfterSeconds} onRetry={onRetry} standalone={standalone} />;
  }
  if (state === "unavailable" || !resource) {
    return (
      <Frame className="public-music public-music__frame public-music__state-frame">
        <section className="public-music__state public-music__surface" role="alert">
          <h1 className="text-2xl font-semibold">Music is temporarily unavailable.</h1>
          <div className="public-music__state-actions">{onRetry ? <button className="public-music__primary" type="button" onClick={onRetry}>Retry</button> : null}
          <Link className="public-music__secondary" to={returnTo}>{standalone ? "Return to Explorers" : "Return to Profile"}</Link></div>
        </section>
      </Frame>
    );
  }

  return (
    <Frame className="public-music public-music__frame">
      <div className="public-music__content">
        {standalone && <PublicMusicProfileHeader name={resource.user.venueName || resource.user.username} username={resource.user.username} />}
        <h1 id="public-music-heading" tabIndex={-1} className={standalone ? "public-music__heading" : "sr-only"}>Music</h1>
        {stale ? (
          <p
            role="status"
            aria-label="Music connection status"
            aria-live="polite"
            aria-atomic="true"
            className="public-music__surface public-music__connection"
          >
            Reconnecting… Your last Music update remains visible.
          </p>
        ) : null}
        {revalidating ? (
          <p
            role="status"
            aria-label="Music availability status"
            aria-live="polite"
            aria-atomic="true"
            className="public-music__surface public-music__connection"
          >
            Checking Music availability…
          </p>
        ) : null}
        <PublicMusicSections resource={resource} publicSlug={publicSlug} capability={capability} guestActionsEnabled={guestActionsEnabled} onReconcile={onRetry} onAnalytics={onAnalytics} />
      </div>
    </Frame>
  );
}

function RateLimitedMusic({ retryAfterSeconds, onRetry, standalone }: { retryAfterSeconds: number; onRetry?: () => void; standalone: boolean }) {
  const Frame = standalone ? 'main' : 'div';
  const [ready, setReady] = useState(retryAfterSeconds <= 0);
  useEffect(() => {
    setReady(retryAfterSeconds <= 0);
    if (retryAfterSeconds <= 0) return;
    const timer = window.setTimeout(() => setReady(true), retryAfterSeconds * 1_000);
    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);
  return (
    <Frame className="public-music public-music__frame public-music__state-frame">
      <section className="public-music__state public-music__surface" role="alert">
        <h1 className="text-2xl font-semibold">Too many requests. Try again in {retryAfterSeconds} seconds.</h1>
        <div className="public-music__state-actions"><button type="button" disabled={!ready} onClick={onRetry} className="public-music__primary">Retry</button></div>
      </section>
    </Frame>
  );
}

export default function PublicMusic() {
  const { publicSlug } = useParams<{ publicSlug: string }>();
  const location = useLocation();
  const capability = publicSlug ? capabilityFromFragment(location.hash || window.location.hash) ?? retainedCapability(publicSlug) : undefined;
  const revoke = useCallback(() => { if (publicSlug) forgetCapability(publicSlug); }, [publicSlug]);

  useEffect(() => {
    if (!publicSlug) return;
    const fragment = location.hash || window.location.hash;
    const fragmentCapability = capabilityFromFragment(fragment);
    if (fragmentCapability) retainCapability(publicSlug, fragmentCapability);
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }
  }, [location.hash, location.pathname, publicSlug]);

  const music = usePublicMusicResource({
    publicSlug, capability, enabled: Boolean(publicSlug), disabledState: "not-found", onRevoked: revoke,
  });
  const trackMusic = usePublicMusicProductAnalytics({ publicSlug, capability, route: "direct" });

  return (
    <>
      <SEO
        title="Music | Explorers"
        description="Public Music playlists on Explorers."
        canonical={publicSlug ? `${window.location.origin}/music/share/${encodeURIComponent(publicSlug)}` : undefined}
        noIndex={Boolean(capability)}
        noFollow={Boolean(capability)}
      />
      <PublicMusicContent state={music.state} resource={music.resource} stale={music.stale} publicSlug={publicSlug} capability={capability} retryAfterSeconds={music.retryAfterSeconds} onRetry={music.retry} analyticsRoute="direct" onAnalytics={trackMusic} />
    </>
  );
}
