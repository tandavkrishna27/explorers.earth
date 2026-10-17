import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PublicMusicError, publicMusicClient, type PublicMusicRequestVideo } from "../publicMusicClient";

import { Search } from "lucide-react";
import { PublicMusicArtwork } from "./PublicMusicArtwork";

export interface PublicMusicRequestSelection { youtubeId: string; selectionId: number }

type RequestClient = Pick<typeof publicMusicClient, "search" | "videoFromUrl" | "requestSong">;

export function PublicMusicRequest({ publicSlug, capability, allowed, actionsEnabled = true, selection, client = publicMusicClient, onOutcome, onRequestOutcome, onCanonicalRevoked }: {
  publicSlug: string; capability?: string; allowed: boolean; actionsEnabled?: boolean; selection?: PublicMusicRequestSelection; client?: RequestClient;
  onOutcome?: (event: { action: "search" | "request"; outcome: "success" | "empty" | "invalid" | "rate_limited" | "queue_full" | "forbidden" | "unavailable" }) => void;
  onRequestOutcome?: (outcome: "accepted" | "invalid" | "rate_limited" | "queue_full" | "forbidden" | "unavailable") => void;
  onCanonicalRevoked?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicMusicRequestVideo[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState<string>();
  const [message, setMessage] = useState("");
  const [retrySeconds, setRetrySeconds] = useState(0);
  const active = useRef<AbortController>();
  const submissionGeneration = useRef(0);
  const mounted = useRef(true);
  const scope = useRef({ publicSlug, capability, generation: 0, revoked: false });
  if (scope.current.publicSlug !== publicSlug || scope.current.capability !== capability) {
    active.current?.abort();
    active.current = undefined;
    submissionGeneration.current += 1;
    scope.current = { publicSlug, capability, generation: scope.current.generation + 1, revoked: false };
    setBusy(false);
    setSubmitting(undefined);
    setResults([]);
    setMessage("");
    setRetrySeconds(0);
  }
  const statusRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resolveSelection = useRef<(youtubeId: string) => AbortController | undefined>(() => undefined);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; submissionGeneration.current += 1; active.current?.abort(); }; }, []);
  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = window.setTimeout(() => setRetrySeconds((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [retrySeconds]);
  useEffect(() => { if (!allowed) { active.current?.abort(); setResults([]); setMessage(""); setRetrySeconds(0); } }, [allowed]);
  useEffect(() => {
    if (actionsEnabled) return;
    submissionGeneration.current += 1;
    active.current?.abort();
    active.current = undefined;
    setBusy(false);
    setSubmitting(undefined);
  }, [actionsEnabled]);
  const errorCopy = (error: unknown) => error instanceof PublicMusicError
    ? error.code === "RATE_LIMITED" ? `Too many requests. Try again in ${error.retryAfterSeconds ?? 60} seconds.`
      : error.code === "QUEUE_FULL" ? "The request queue is full. Try again later."
        : error.code === "REQUEST_FORBIDDEN" ? "Song requests are no longer available."
          : error.code === "REQUEST_INVALID" ? "Enter a valid song search or YouTube URL."
            : "Music is temporarily unavailable."
    : "Music is temporarily unavailable.";
  const handleCanonicalRevocation = (error: unknown, generation: number): boolean => {
    if (!mounted.current || generation !== scope.current.generation) return true;
    if (!isCanonicalRevocation(error)) return false;
    if (scope.current.revoked) return true;
    scope.current.revoked = true;
    active.current?.abort();
    active.current = undefined;
    setBusy(false);
    setSubmitting(undefined);
    setResults([]);
    onCanonicalRevoked?.();
    return true;
  };
  const search = async (input = query) => {
    if (!allowed || !actionsEnabled || scope.current.revoked || retrySeconds > 0 || !input.trim()) return;
    const generation = scope.current.generation;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller; setBusy(true); setMessage(""); setResults([]);
    try {
      const value = /^https?:\/\//i.test(input.trim())
        ? { items: [await client.videoFromUrl(publicSlug, input.trim(), capability, controller.signal)] }
        : await client.search(publicSlug, input, capability, controller.signal);
      if (!controller.signal.aborted && mounted.current && generation === scope.current.generation && !scope.current.revoked) { setRetrySeconds(0); setResults(value.items); onOutcome?.({ action: "search", outcome: value.items.length ? "success" : "empty" }); if (value.items.length === 0) setMessage("No songs found."); }
    } catch (error) { if (!controller.signal.aborted) { if (handleCanonicalRevocation(error, generation)) return; setMessage(errorCopy(error)); if (error instanceof PublicMusicError && error.code === "RATE_LIMITED") setRetrySeconds(error.retryAfterSeconds ?? 60); onOutcome?.({ action: "search", outcome: normalizedOutcome(error) }); } }
    finally { if (!controller.signal.aborted && mounted.current && generation === scope.current.generation && !scope.current.revoked) setBusy(false); }
  };
  const submit = async (video: PublicMusicRequestVideo) => {
    if (submitting || !allowed || !actionsEnabled || scope.current.revoked || retrySeconds > 0) return;
    const generation = scope.current.generation;
    const requestGeneration = ++submissionGeneration.current;
    setSubmitting(video.id.videoId); setMessage("");
    try {
      await client.requestSong(publicSlug, { youtubeId: video.id.videoId, title: video.snippet.title, artist: video.snippet.channelTitle, thumbnailUrl: video.snippet.thumbnails.default.url }, capability, `tunes-share-v1-${Date.now()}-${crypto.randomUUID()}`);
      if (!mounted.current || generation !== scope.current.generation || requestGeneration !== submissionGeneration.current || scope.current.revoked) return;
      setResults([]); setMessage("Song requested."); onOutcome?.({ action: "request", outcome: "success" }); onRequestOutcome?.("accepted");
      window.setTimeout(() => statusRef.current?.focus(), 0);
    } catch (error) {
      if (!mounted.current || generation !== scope.current.generation || requestGeneration !== submissionGeneration.current || scope.current.revoked) return;
      if (isCanonicalRevocation(error)) onRequestOutcome?.("forbidden");
      if (handleCanonicalRevocation(error, generation)) return;
      setMessage(errorCopy(error));
      if (error instanceof PublicMusicError && error.code === "RATE_LIMITED") setRetrySeconds(error.retryAfterSeconds ?? 60);
      onOutcome?.({ action: "request", outcome: normalizedOutcome(error) });
      onRequestOutcome?.(normalizedOutcome(error));
    }
    finally { if (mounted.current && generation === scope.current.generation && requestGeneration === submissionGeneration.current && !scope.current.revoked) setSubmitting(undefined); }
  };
  // A selection is an intent, not a subscription: a cooldown expiring must not
  // replay it. The committed callback keeps request guards fresh without making
  // the selection effect rerun when search state changes.
  useLayoutEffect(() => {
    resolveSelection.current = (youtubeId) => {
      if (!actionsEnabled || retrySeconds > 0 || submitting || scope.current.revoked) return;
      const url = `https://www.youtube.com/watch?v=${youtubeId}`;
      setQuery(url);
      void search(url);
      headingRef.current?.focus();
      headingRef.current?.scrollIntoView?.({ block: "nearest" });
      return active.current;
    };
  });
  const selectedYoutubeId = selection?.youtubeId;
  const selectionId = selection?.selectionId;
  useEffect(() => {
    if (!allowed || !selectedYoutubeId || !/^[A-Za-z0-9_-]{11}$/.test(selectedYoutubeId)) return;
    const selectionRead = resolveSelection.current(selectedYoutubeId);
    return () => selectionRead?.abort();
  }, [actionsEnabled, allowed, publicSlug, capability, selectionId, selectedYoutubeId]);

  if (!allowed) return null;
  return <section aria-labelledby="public-music-request-heading" className="public-music__request">
    <h2 ref={headingRef} id="public-music-request-heading" tabIndex={-1}>Request a song</h2>
    <label htmlFor="public-music-request-query">Search for a song or paste a YouTube URL</label>
    <div className="public-music__search">
      <Search size={18} aria-hidden="true" />
      <input id="public-music-request-query" value={query} maxLength={200} placeholder="Song, artist or YouTube link" disabled={!actionsEnabled}
        onChange={(event) => { active.current?.abort(); active.current = undefined; setBusy(false); setResults([]); setQuery(event.target.value); }}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && !busy) { event.preventDefault(); void search(); } }} />
      <button type="button" disabled={!actionsEnabled || busy || retrySeconds > 0 || query.trim().length === 0} onClick={() => void search()} className="public-music__primary">{busy ? "Searching…" : retrySeconds > 0 ? `Retry in ${retrySeconds}s` : "Search"}</button>
    </div>
    {results.length ? <ul className="public-music__songs" aria-label="Song search results">{results.map((video) => <li key={video.id.videoId}>
      <button type="button" disabled={!actionsEnabled || Boolean(submitting) || retrySeconds > 0} onClick={() => submit(video)}
        aria-label={`${retrySeconds > 0 ? `Retry in ${retrySeconds} seconds:` : submitting === video.id.videoId ? "Requesting" : "Request"} ${video.snippet.title} by ${video.snippet.channelTitle}`}
        className="public-music__search-result">
        <PublicMusicArtwork url={video.snippet.thumbnails.default.url} className="public-music__song-art" />
        <span className="public-music__song-copy"><strong>{video.snippet.title}</strong><span>{video.snippet.channelTitle}</span></span>
        <span className="public-music__request-label">{submitting === video.id.videoId ? "Requesting…" : "Request"}</span>
      </button>
    </li>)}</ul> : null}
    {message ? <p ref={statusRef} role="status" tabIndex={message === "Song requested." ? -1 : undefined} className="public-music__feedback">{message}</p> : null}
  </section>;
}

function normalizedOutcome(error: unknown): "invalid" | "rate_limited" | "queue_full" | "forbidden" | "unavailable" {
  if (!(error instanceof PublicMusicError)) return "unavailable";
  if (error.code === "REQUEST_INVALID") return "invalid";
  if (error.code === "RATE_LIMITED") return "rate_limited";
  if (error.code === "QUEUE_FULL") return "queue_full";
  if (error.code === "REQUEST_FORBIDDEN" || error.code === "PUBLIC_NOT_FOUND") return "forbidden";
  return "unavailable";
}

function isCanonicalRevocation(error: unknown): boolean {
  return error instanceof PublicMusicError && (error.code === "REQUEST_FORBIDDEN" || error.code === "PUBLIC_NOT_FOUND");
}
