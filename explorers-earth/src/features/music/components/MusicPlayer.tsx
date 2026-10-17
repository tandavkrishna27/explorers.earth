import { useCallback, useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { Eye, EyeOff, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { MusicSong } from "../musicWorkspaceClient";
import type { MusicPlaybackCommand } from "./musicPlaybackCommand";
import { createYouTubePlayerConfig, isYouTubeEmbedRejection, youTubeWatchUrl } from "./youtubePlayerConfig";

interface PlayerQueueClient {
  setPlaying(songId: number | null, idempotencyKey: string): Promise<void | MusicSong>;
}

export interface MusicPlaybackRequest { songId: number; requestId: number; authorityGeneration: string }

export interface MusicPlayerProps {
  currentSong: MusicSong | null;
  queuedSongs: MusicSong[];
  playedSongs: MusicSong[];
  queueClient: PlayerQueueClient;
  onChanged: () => void | Promise<void>;
  broadcastPlayerState?: (state: { songId: number; playing: boolean }) => void | Promise<void>;
  readOnly?: boolean;
  playbackRequest?: MusicPlaybackRequest | null;
  authorityGeneration?: string;
  beginPlaybackRequest?: () => number;
  onPlaybackRequested?: MusicPlaybackCommand;
}

const controlSize = { minWidth: "44px", minHeight: "44px" };
const idempotencyKey = (operation: string) => `music-player-${operation}-${crypto.randomUUID()}`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export function MusicPlayer({ currentSong, queuedSongs, playedSongs, queueClient, onChanged, broadcastPlayerState, readOnly = false, playbackRequest = null, authorityGeneration, beginPlaybackRequest, onPlaybackRequested }: MusicPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [embedRejected, setEmbedRejected] = useState(false);
  const [transitionPending, setTransitionPending] = useState(false);
  const recoveryAttempts = useRef(0);
  const skippedSongId = useRef<number | null>(null);
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const recoveryTimers = useRef(new Set<number>());
  const generation = useRef(0);
  const transitionLock = useRef(false);
  const playAfterChange = useRef<number | null>(null);
  const handledPlaybackRequest = useRef<string | null>(null);
  const playbackRequestRef = useRef(playbackRequest);
  playbackRequestRef.current = playbackRequest;
  const mounted = useRef(true);
  const currentSongId = currentSong?.id ?? null;
  const previousSong = playedSongs.reduce<MusicSong | undefined>((latest, song) => {
    if (!latest) return song;
    const latestTime = latest.playedAt ? Date.parse(latest.playedAt) : 0;
    const songTime = song.playedAt ? Date.parse(song.playedAt) : 0;
    return songTime > latestTime || (songTime === latestTime && song.id > latest.id) ? song : latest;
  }, undefined);

  const clearRecovery = useCallback(() => {
    recoveryTimers.current.forEach((timer) => window.clearTimeout(timer));
    recoveryTimers.current.clear();
  }, []);

  useEffect(() => {
    generation.current += 1;
    clearRecovery();
    const request = playbackRequestRef.current;
    const requestKey = request ? JSON.stringify([request.authorityGeneration ?? null, request.requestId]) : null;
    const externalPlay = currentSongId !== null
      && request?.songId === currentSongId
      && request.authorityGeneration === authorityGeneration
      && handledPlaybackRequest.current !== requestKey;
    if (externalPlay) handledPlaybackRequest.current = requestKey;
    const shouldPlay = currentSongId !== null && (playAfterChange.current === currentSongId || externalPlay);
    playAfterChange.current = null;
    setPlaying(shouldPlay); setProgress(0); setDuration(0); setMessage(""); setError(""); setEmbedRejected(false);
    recoveryAttempts.current = 0; skippedSongId.current = null;
  }, [authorityGeneration, clearRecovery, currentSongId]);

  useEffect(() => {
    const requestKey = playbackRequest
      ? JSON.stringify([playbackRequest.authorityGeneration ?? null, playbackRequest.requestId])
      : null;
    if (
      currentSongId !== null
      && playbackRequest?.songId === currentSongId
      && playbackRequest.authorityGeneration === authorityGeneration
      && handledPlaybackRequest.current !== requestKey
    ) {
      handledPlaybackRequest.current = requestKey;
      setMessage(""); setError(""); setPlaying(true);
    }
  }, [authorityGeneration, currentSongId, playbackRequest]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; clearRecovery(); transitionLock.current = false; };
  }, [clearRecovery]);

  const broadcast = useCallback(async (songId: number, isPlaying: boolean) => {
    if (readOnly) return;
    try { await broadcastPlayerState?.({ songId, playing: isPlaying }); } catch { /* Socket notification is optional. */ }
  }, [broadcastPlayerState, readOnly]);

  const transition = useCallback(async (song: MusicSong | undefined, operation: "next" | "previous" | "skip") => {
    if (!song || transitionLock.current) return;
    const requestId = beginPlaybackRequest?.() ?? 0;
    transitionLock.current = true; setTransitionPending(true); setError("");
    const operationGeneration = generation.current;
    try {
      const outcome = onPlaybackRequested
        ? await onPlaybackRequested(song.id, requestId, `player-${operation}`)
        : (await queueClient.setPlaying(song.id, idempotencyKey(operation)), "acknowledged");
      if (outcome === "superseded") {
        transitionLock.current = false; if (mounted.current) setTransitionPending(false);
        return;
      }
    } catch {
      if (operation === "skip") clearRecovery();
      if (generation.current === operationGeneration) {
        setError("Could not change songs. Try again.");
      }
      transitionLock.current = false; if (mounted.current) setTransitionPending(false);
      return;
    }
    if (generation.current === operationGeneration) playAfterChange.current = song.id;
    try { await onChanged(); }
    catch { if (generation.current === operationGeneration) setError("Song changed, but the latest queue could not be loaded."); }
    finally {
      if (operation === "skip") clearRecovery();
      transitionLock.current = false; if (mounted.current) setTransitionPending(false);
    }
  }, [beginPlaybackRequest, clearRecovery, onChanged, onPlaybackRequested, queueClient]);

  const finish = useCallback(async () => {
    if (!currentSong || transitionLock.current) return;
    const requestId = beginPlaybackRequest?.() ?? 0;
    transitionLock.current = true; setTransitionPending(true); setError(""); setPlaying(false); clearRecovery();
    const operationGeneration = generation.current;
    try {
      const outcome = onPlaybackRequested
        ? await onPlaybackRequested(null, requestId, "player-ended")
        : (await queueClient.setPlaying(null, idempotencyKey("ended")), "acknowledged");
      if (outcome === "superseded") {
        transitionLock.current = false; if (mounted.current) setTransitionPending(false);
        return;
      }
    }
    catch {
      if (generation.current === operationGeneration) {
        skippedSongId.current = null;
        setError("Could not finish this song. Try again.");
      }
      transitionLock.current = false; if (mounted.current) setTransitionPending(false);
      return;
    }
    if (generation.current === operationGeneration) await broadcast(currentSong.id, false);
    try { await onChanged(); }
    catch { if (generation.current === operationGeneration) setError("Song finished, but the latest history could not be loaded."); }
    finally { transitionLock.current = false; if (mounted.current) setTransitionPending(false); }
  }, [beginPlaybackRequest, broadcast, clearRecovery, currentSong, onChanged, onPlaybackRequested, queueClient]);

  const handleMediaError = useCallback((cause: unknown) => {
    if (cause instanceof DOMException && cause.name === "NotAllowedError") {
      clearRecovery(); setPlaying(false); setMessage("Press play to start this song."); return;
    }
    if (isYouTubeEmbedRejection(cause)) {
      clearRecovery(); setPlaying(false); setMessage(""); setError("This video cannot be played here. Watch it on YouTube instead."); setEmbedRejected(true); return;
    }
    if (readOnly) {
      clearRecovery(); setPlaying(false); setMessage("Playback changed elsewhere. Refresh to reconnect."); return;
    }
    if (!currentSong || skippedSongId.current === currentSong.id || transitionLock.current) return;
    if (recoveryAttempts.current < 2) {
      recoveryAttempts.current += 1;
      setPlaying(false);
      const songGeneration = generation.current;
      const recoverySongId = currentSong.id;
      const timer = window.setTimeout(() => {
        recoveryTimers.current.delete(timer);
        if (generation.current === songGeneration && skippedSongId.current !== recoverySongId) setPlaying(true);
      }, 250 * recoveryAttempts.current);
      recoveryTimers.current.add(timer);
      return;
    }
    skippedSongId.current = currentSong.id;
    clearRecovery(); setPlaying(false);
    if (queuedSongs[0]) {
      setMessage(`${currentSong.title} is unavailable. Skipping once.`);
      void transition(queuedSongs[0], "skip");
    } else {
      setMessage(`${currentSong.title} is unavailable. Finishing playback.`);
      void finish();
    }
  }, [clearRecovery, currentSong, finish, queuedSongs, readOnly, transition]);

  if (!currentSong) return <section aria-label="Music player"><p role="status">Choose a song to start listening.</p></section>;

  return (
    <section aria-label="Music player" className="motion-reduce:transition-none">
      <div className="grid gap-5 md:grid-cols-[9rem_minmax(0,1fr)] md:items-center">
        <img src={currentSong.thumbnailUrl} alt={`Now playing: ${currentSong.title}`} className="mx-auto aspect-square w-32 rounded-2xl object-cover shadow-lg md:w-36" />
        <div className="min-w-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-xl font-semibold text-dashboard">{currentSong.title}</h2><p className="truncate text-sm text-dashboard-muted">{currentSong.artist}</p></div><button type="button" style={controlSize} aria-label={showVideo ? "Hide video" : "Show video"} aria-pressed={showVideo} onClick={() => setShowVideo((visible) => !visible)} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-dashboard bg-dashboard-muted px-3 text-sm font-semibold text-dashboard">{showVideo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}<span className="hidden sm:inline">{showVideo ? "Hide video" : "Show video"}</span></button></div>
        <div data-testid="primary-media-controls" className="mt-5 flex items-center justify-center gap-4">
          <button type="button" style={controlSize} aria-label="Previous song" disabled={readOnly || !previousSong || transitionPending} onClick={() => { void transition(previousSong, "previous"); }} className="inline-flex items-center justify-center rounded-full border border-dashboard bg-dashboard-muted disabled:opacity-45"><SkipBack className="h-5 w-5" /></button>
          <button type="button" style={controlSize} aria-label={playing ? "Pause" : "Play"} onClick={() => { setMessage(""); setPlaying((value) => !value); }} className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-dashboard-accent text-[var(--dash-accent-text)] shadow-lg">{playing ? <Pause className="h-6 w-6 fill-current" /> : <Play className="ml-0.5 h-6 w-6 fill-current" />}</button>
          <button type="button" style={controlSize} aria-label="Next song" disabled={readOnly || !queuedSongs[0] || transitionPending} onClick={() => { void transition(queuedSongs[0], "next"); }} className="inline-flex items-center justify-center rounded-full border border-dashboard bg-dashboard-muted disabled:opacity-45"><SkipForward className="h-5 w-5" /></button>
        </div></div>
      </div>
      <div data-testid="video-surface" aria-hidden={!showVideo} className={showVideo ? "mt-4 aspect-video overflow-hidden rounded-xl" : "h-0 overflow-hidden opacity-0 pointer-events-none"}>
      <ReactPlayer
        ref={mediaRef}
        src={`https://www.youtube.com/watch?v=${currentSong.youtubeId}`}
        config={createYouTubePlayerConfig()}
        playing={playing}
        volume={volume}
        muted={muted}
        width="100%"
        height="auto"
        onPlay={() => { clearRecovery(); setPlaying(true); void broadcast(currentSong.id, true); }}
        onPause={() => { setPlaying(false); void broadcast(currentSong.id, false); }}
        onEnded={() => { if (readOnly) { setPlaying(false); setMessage("Reconnect to continue the queue."); } else if (queuedSongs[0]) void transition(queuedSongs[0], "next"); else void finish(); }}
        onError={handleMediaError}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime || 0)}
      />
      </div>
      <label className="mt-5 grid gap-1 text-sm font-medium text-dashboard"><span className="flex justify-between"><span className="sr-only">Playback position</span><span className="text-dashboard-muted">{clock(progress)}</span><span className="text-dashboard-muted">{clock(duration)}</span></span>
        <input className="w-full accent-dashboard-accent" style={{ minHeight: "44px" }} aria-label="Playback position" type="range" min="0" max={duration || 0} value={progress} aria-valuetext={`${clock(progress)} of ${clock(duration)}`} onChange={(event) => {
          const nextTime = Number(event.target.value); setProgress(nextTime);
          if (mediaRef.current) mediaRef.current.currentTime = nextTime;
        }} />
      </label>
      <div className="mt-2 flex items-center justify-end gap-2">
        <button type="button" style={controlSize} aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((value) => !value)} className="inline-flex items-center justify-center rounded-full text-dashboard">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>
        <label className="grid w-32 gap-1 text-sm font-medium text-dashboard"><span className="sr-only">Volume</span>
          <input className="w-full accent-dashboard-accent" style={{ minHeight: "44px" }} aria-label="Volume" type="range" min="0" max="100" value={Math.round(volume * 100)} aria-valuetext={`${Math.round(volume * 100)} percent`} onChange={(event) => setVolume(Number(event.target.value) / 100)} />
        </label>
      </div>
      {message && <p role="status" aria-live="polite">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {embedRejected && <a href={youTubeWatchUrl(currentSong.youtubeId)} target="_blank" rel="noreferrer">Watch {currentSong.title} on YouTube</a>}
    </section>
  );
}
