import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import ReactPlayer from "react-player";
import type { PublicMusicSong } from "../publicMusicClient";
import { PublicMusicArtwork } from './PublicMusicArtwork';
import { createYouTubePlayerConfig, isYouTubeEmbedRejection, youTubeWatchUrl } from "./youtubePlayerConfig";

export interface PublicMusicPlayerProps {
  song: PublicMusicSong;
  allowed?: boolean;
  actionsEnabled?: boolean;
  onPlaybackStart?: () => void;
}

function mediaErrorMessage(cause: unknown): string | null {
  if (cause instanceof DOMException && cause.name === "NotAllowedError") return null;
  const code = typeof cause === "object" && cause !== null && "currentTarget" in cause
    && typeof cause.currentTarget === "object" && cause.currentTarget !== null && "error" in cause.currentTarget
    && typeof cause.currentTarget.error === "object" && cause.currentTarget.error !== null && "code" in cause.currentTarget.error
    && typeof cause.currentTarget.error.code === "number"
    ? cause.currentTarget.error.code
    : undefined;
  if (code === 100) {
    return "This video is no longer available. Choose another track.";
  }
  if (code === 101 || code === 150) {
    return "This video cannot be played here. Choose another track.";
  }
  if (code === 2) return "Playback could not connect. Check your connection and try again.";
  if (cause instanceof TypeError) return "Playback could not connect. Check your connection and try again.";
  return "Playback is unavailable right now. Choose another track or try again.";
}

export function PublicMusicPlayer({ song, allowed = true, actionsEnabled = true, onPlaybackStart }: PublicMusicPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [embedRejected, setEmbedRejected] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const generation = useRef(0);
  const playbackAcknowledged = useRef(false);
  const pendingAvailabilityPause = useRef(false);

  useLayoutEffect(() => {
    if (!actionsEnabled && playing) pendingAvailabilityPause.current = true;
  }, [actionsEnabled, playing]);

  useEffect(() => {
    generation.current += 1;
    setPlaying(false);
    setMessage("");
    setError("");
    setEmbedRejected(false);
    playbackAcknowledged.current = false;
    pendingAvailabilityPause.current = false;
    return () => { generation.current += 1; };
  }, [allowed, song.id]);

  if (!allowed) return null;

  const toggle = async () => {
    setError("");
    if (playing) {
      pendingAvailabilityPause.current = false;
      mediaRef.current?.pause();
      setPlaying(false);
      playbackAcknowledged.current = false;
      setMessage(`${song.title} is paused`);
      return;
    }
    if (!actionsEnabled) return;
    const requestGeneration = generation.current;
    try {
      await mediaRef.current?.play();
      if (generation.current !== requestGeneration) return;
      setPlaying(true);
      setMessage(`${song.title} is playing on this device`);
    } catch (cause) {
      if (generation.current !== requestGeneration) return;
      handleError(cause);
    }
  };

  const handleError = (cause: unknown) => {
    pendingAvailabilityPause.current = false;
    setPlaying(false);
    playbackAcknowledged.current = false;
    setEmbedRejected(isYouTubeEmbedRejection(cause));
    const normalized = mediaErrorMessage(cause);
    if (normalized === null) {
      setError("");
      setMessage("Press play to start this song on your device.");
      return;
    }
    setMessage("");
    setError(normalized);
  };

  return (
    <div className="public-music__device">
      <div className="flex min-w-0 items-center gap-3">
        <PublicMusicArtwork url={song.thumbnailUrl} className="public-music__song-art" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{song.title}</p>
          <p className="truncate text-sm public-music__muted">{song.artist}</p>
        </div>
        <button
          type="button"
          aria-label={playing ? `Pause ${song.title}` : `Play ${song.title} on this device`}
          aria-pressed={playing}
          disabled={!actionsEnabled && !playing}
          onClick={() => { void toggle(); }}
          className="public-music__device-toggle public-music__primary"
        >
          {playing ? <Pause aria-hidden="true" className="h-5 w-5 fill-current" /> : <Play aria-hidden="true" className="h-5 w-5 fill-current" />}
        </button>
      </div>
      <div className="mt-4 aspect-video overflow-hidden rounded-lg bg-black">
        <ReactPlayer
          ref={mediaRef}
          src={`https://www.youtube.com/watch?v=${song.youtubeId}`}
          config={createYouTubePlayerConfig()}
          playing={playing && actionsEnabled}
          width="100%"
          height="100%"
          onPlay={() => {
            if (!actionsEnabled) { pendingAvailabilityPause.current = true; mediaRef.current?.pause(); return; }
            pendingAvailabilityPause.current = false;
            setPlaying(true);
            if (!playbackAcknowledged.current) {
              playbackAcknowledged.current = true;
              onPlaybackStart?.();
            }
          }}
          // YouTube can acknowledge our forced pause after availability returns.
          // Consume that acknowledgement without cancelling the retained intent.
          onPause={() => {
            if (pendingAvailabilityPause.current) { pendingAvailabilityPause.current = false; return; }
            if (actionsEnabled) { setPlaying(false); playbackAcknowledged.current = false; }
          }}
          onEnded={() => {
            setPlaying(false);
            playbackAcknowledged.current = false;
            setMessage(`${song.title} has finished.`);
          }}
          onError={handleError}
        />
      </div>
      {message ? <p role="status" aria-live="polite" className="mt-3 text-sm public-music__muted">{message}</p> : null}
      {error ? <p role="alert" className="public-music__feedback">{error}</p> : null}
      {embedRejected ? <a className="public-music__secondary" href={youTubeWatchUrl(song.youtubeId)} target="_blank" rel="noreferrer">Watch {song.title} on YouTube</a> : null}
    </div>
  );
}
