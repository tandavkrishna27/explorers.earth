import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { YouTubeSearchResponse, YouTubeVideo } from "../musicSearchClient";
import type { MusicSongInput } from "../musicQueueClient";
import type { MusicSong } from "../musicWorkspaceClient";

type SearchClient = { searchYouTube(query: string, pageToken?: string): Promise<YouTubeSearchResponse>; videoFromUrl(url: string): Promise<YouTubeVideo> };
type QueueClient = { addSong(song: MusicSongInput, idempotencyKey: string): Promise<MusicSong> };
type PlaylistTarget = { id: number; name: string };
type PlaylistClient = { addPlaylistSong(playlistId: number, song: MusicSongInput, idempotencyKey: string): Promise<unknown> };
export interface MusicSearchProps { searchClient: SearchClient; queueClient: QueueClient; onChanged: () => void | Promise<void>; playlists?: PlaylistTarget[]; playlistClient?: PlaylistClient }
type DiscoveryError = "search" | "lookup" | "playlist" | null;
type MutationError = "queue" | "refresh" | null;
type PendingPlaylistAdd = { playlistId: number; song: MusicSongInput; idempotencyKey: string };
type DiscoveryInput = { kind: "search"; query: string } | { kind: "video"; url: string } | { kind: "playlist" };
const key = (operation: string) => `music-${operation}-${crypto.randomUUID()}`;
const songInput = (video: YouTubeVideo): MusicSongInput => ({ youtubeId: video.id.videoId, title: video.snippet.title, artist: video.snippet.channelTitle, thumbnailUrl: video.snippet.thumbnails.default.url });
const youtubeVideoId = /^[A-Za-z0-9_-]{11}$/;

function classifyDiscoveryInput(value: string): DiscoveryInput {
  const query = value.trim();
  let url: URL;
  try { url = new URL(query); }
  catch { return { kind: "search", query }; }

  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return { kind: "search", query };
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const youtubeHost = host === "youtu.be" || ["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host);
  if (!youtubeHost) return { kind: "search", query };
  if (url.searchParams.getAll("list").some((list) => list.trim())) return { kind: "playlist" };

  const segments = url.pathname.split("/").filter(Boolean);
  const videoId = host === "youtu.be"
    ? segments.length === 1 ? segments[0] : null
    : url.pathname === "/watch" ? url.searchParams.get("v")
      : segments[0] === "shorts" && segments.length === 2 ? segments[1] : null;
  if (!videoId || !youtubeVideoId.test(videoId)) return { kind: "search", query };
  return { kind: "video", url: `https://www.youtube.com/watch?v=${videoId}` };
}

export function MusicSearch({ searchClient, queueClient, onChanged, playlists = [], playlistClient }: MusicSearchProps) {
  const [query, setQuery] = useState("");
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [target, setTarget] = useState("queue");
  const [results, setResults] = useState<YouTubeVideo[] | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchBusy, setSearchBusy] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<DiscoveryError>(null);
  const [mutationError, setMutationError] = useState<MutationError>(null);
  const [mutationTarget, setMutationTarget] = useState<"queue" | "playlist">("queue");
  const [refreshErrorText, setRefreshErrorText] = useState("");
  const generation = useRef(0);
  const requestLock = useRef<number | null>(null);
  const pendingPlaylistAdds = useRef(new Map<string, PendingPlaylistAdd>());

  const invalidateDiscovery = () => { generation.current += 1; requestLock.current = null; setSearchBusy(false); setResults(null); setNextPageToken(null); setSelected(new Set()); setDiscoveryError(null); };

  async function runSearch(pageToken?: string) {
    const snapshot = { mode: "search" as const, query: query.trim(), pageToken };
    if (!snapshot.query || requestLock.current !== null) return;
    const requestGeneration = ++generation.current; requestLock.current = requestGeneration; setSearchBusy(true); setDiscoveryError(null);
    try {
      const response = await searchClient.searchYouTube(snapshot.query, snapshot.pageToken);
      if (generation.current !== requestGeneration) return;
      setResults(response.items); setNextPageToken(response.nextPageToken); setSelected(new Set());
    } catch { if (generation.current === requestGeneration) setDiscoveryError("search"); }
    finally { if (requestLock.current === requestGeneration) requestLock.current = null; if (generation.current === requestGeneration) setSearchBusy(false); }
  }
  async function lookupUrl(url = query.trim()) {
    const snapshot = { url };
    if (!snapshot.url || requestLock.current !== null) return;
    const requestGeneration = ++generation.current; requestLock.current = requestGeneration; setSearchBusy(true); setDiscoveryError(null);
    try {
      const video = await searchClient.videoFromUrl(snapshot.url);
      if (generation.current !== requestGeneration) return;
      setResults([video]); setNextPageToken(null); setSelected(new Set());
    } catch { if (generation.current === requestGeneration) setDiscoveryError("lookup"); }
    finally { if (requestLock.current === requestGeneration) requestLock.current = null; if (generation.current === requestGeneration) setSearchBusy(false); }
  }
  async function reconcile() { try { await onChanged(); } catch { /* Visible mutation error remains authoritative. */ } }
  const markCommitted = (youtubeId: string) => setSelected((current) => { const next = new Set(current); next.delete(youtubeId); return next; });

  async function retryRefresh() {
    if (mutationBusy) return;
    setMutationBusy(true);
    try { await onChanged(); setMutationError(null); setRefreshErrorText(""); }
    catch { setMutationError("refresh"); }
    finally { setMutationBusy(false); }
  }
  async function add(videos: YouTubeVideo[]) {
    if (mutationBusy || videos.length === 0) return;
    setMutationTarget("queue");
    setMutationBusy(true); setMutationError(null); setRefreshErrorText("");
    try {
      for (const video of videos) {
        await queueClient.addSong(songInput(video), key("add"));
        markCommitted(video.id.videoId);
      }
      try { await onChanged(); }
      catch {
        setRefreshErrorText(videos.length === 1 ? "Song was added, but the latest queue could not be loaded." : "Songs were added, but the latest queue could not be loaded.");
        setMutationError("refresh");
      }
    } catch { setMutationError("queue"); await reconcile(); }
    finally { setMutationBusy(false); }
  }
  async function submitDiscovery() {
    const input = classifyDiscoveryInput(query);
    if (input.kind === "playlist") {
      setDiscoveryError("playlist");
      return;
    }
    if (input.kind === "video") {
      await lookupUrl(input.url);
      return;
    }
    await runSearch();
  }

  async function addToPlaylist(videos: YouTubeVideo[], playlistId: number) {
    if (mutationBusy || !playlistClient || videos.length === 0) return;
    setMutationTarget("playlist");
    setMutationBusy(true); setMutationError(null); setRefreshErrorText("");
    try {
      for (const video of videos) {
        const operationId = `${playlistId}:${video.id.videoId}`;
        const operation = pendingPlaylistAdds.current.get(operationId) ?? {
          playlistId, song: songInput(video), idempotencyKey: key("playlist-add"),
        };
        pendingPlaylistAdds.current.set(operationId, operation);
        await playlistClient.addPlaylistSong(operation.playlistId, operation.song, operation.idempotencyKey);
        pendingPlaylistAdds.current.delete(operationId);
        markCommitted(video.id.videoId);
      }
      try { await onChanged(); }
      catch {
        const playlistName = playlists.find((playlist) => playlist.id === playlistId)?.name ?? "the playlist";
        setRefreshErrorText(videos.length === 1 ? `Song was added to ${playlistName}, but the latest playlists could not be loaded.` : `Songs were added to ${playlistName}, but the latest playlists could not be loaded.`);
        setMutationError("refresh");
      }
    } catch { setMutationError("queue"); await reconcile(); }
    finally { setMutationBusy(false); }
  }

  const selectedVideos = (results ?? []).filter((video) => selected.has(video.id.videoId));
  const discoveryErrorText = discoveryError === "search" ? "Music search is temporarily unavailable. Try again." : discoveryError === "lookup" ? "Music lookup is temporarily unavailable. Try again." : null;
  const mutationErrorText = mutationError === "queue"
    ? mutationTarget === "playlist" ? "Playlist update failed. Refresh to verify the latest playlist." : "Queue update failed. Refresh to verify the latest queue."
    : mutationError === "refresh" ? refreshErrorText : null;
  return <section aria-labelledby="music-search-heading" className="space-y-4">
    <h2 id="music-search-heading" className="text-xl font-semibold">Find music</h2>
    <form onSubmit={(event) => { event.preventDefault(); void submitDiscovery(); }} className="flex flex-col gap-2 sm:flex-row">
      <label className="min-w-0 flex-1"><span className="sr-only">Search music or paste a URL</span><input type="search" aria-label="Search music or paste a URL" placeholder="Search songs or paste a YouTube URL" value={query} onChange={(event) => { setQuery(event.target.value); invalidateDiscovery(); }} className="min-h-11 w-full rounded-xl border border-dashboard bg-dashboard-bg px-3" /></label>
      <div className="relative inline-flex">
        <button type="submit" disabled={searchBusy || !query.trim()} className="min-h-11 flex-1 rounded-l-xl bg-dashboard-accent px-4 font-semibold text-[var(--dash-accent-text)] sm:flex-none">Search</button>
        <button type="button" aria-label="Open discovery actions" aria-expanded={actionMenuOpen} onClick={() => setActionMenuOpen((open) => !open)} className="min-h-11 min-w-11 rounded-r-xl border-l border-black/20 bg-dashboard-accent px-3 text-[var(--dash-accent-text)]"><ChevronDown className="h-4 w-4" /></button>
        {actionMenuOpen && <div role="menu" className="absolute right-0 top-[calc(100%+0.5rem)] z-30 min-w-64 rounded-xl border border-dashboard bg-dashboard-sidebar p-2 shadow-xl">
          <button role="menuitem" type="button" disabled={!query.trim() || searchBusy} onClick={() => { setActionMenuOpen(false); void submitDiscovery(); }} className="min-h-11 w-full rounded-lg px-3 text-left">Add from URL</button>
          <button role="menuitem" type="button" disabled aria-describedby="music-import-unavailable" className="min-h-11 w-full rounded-lg px-3 text-left opacity-50">Import playlist unavailable</button>
          <p id="music-import-unavailable" className="px-3 py-2 text-xs text-dashboard-muted">Playlist import is not currently supported. You can add songs from a playlist individually.</p>
        </div>}
      </div>
    </form>
    {discoveryError === "playlist" && <div role="status" aria-live="polite" aria-label="Playlist import unavailable"><p>Playlist import is not currently supported. You can add songs from a playlist individually.</p></div>}
    {discoveryErrorText && <div role="alert" aria-label="Music discovery error" className="space-y-2"><p>{discoveryErrorText}</p>{discoveryError === "search" && <button type="button" onClick={() => void runSearch()} className="min-h-11 px-4">Try search again</button>}</div>}
    {mutationErrorText && <div role="alert" aria-label={mutationTarget === "playlist" ? "Playlist update error" : "Queue update error"} className="space-y-2"><p>{mutationErrorText}</p>{mutationError === "refresh" && <button type="button" disabled={mutationBusy} onClick={() => void retryRefresh()} className="min-h-11 px-4">Retry refreshing {mutationTarget === "playlist" ? "playlists" : "queue"}</button>}</div>}
    <div role="status" aria-live="polite" aria-label="Music discovery status" className="sr-only">{searchBusy ? "Searching" : ""}</div>
    <div role="status" aria-live="polite" aria-label={mutationTarget === "playlist" ? "Playlist update status" : "Queue update status"} className="sr-only">{mutationBusy ? `Updating ${mutationTarget}` : ""}</div>
    {results?.length === 0 && <p>No music found.</p>}
    {results && results.length > 0 && <>
      <ul className="space-y-2">{results.map((video) => <li key={video.id.videoId}>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashboard px-3 py-2 hover:bg-dashboard-sidebar">
          <input type="checkbox" aria-label={`Select ${video.snippet.title}`} checked={selected.has(video.id.videoId)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(video.id.videoId)) next.delete(video.id.videoId); else next.add(video.id.videoId); return next; })} className="min-h-11 min-w-11" />
          <span className="flex-1"><strong>{video.snippet.title}</strong> <span>{video.snippet.channelTitle}</span></span>
        </label>
      </li>)}</ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        {playlists.length > 0 && <label className="text-sm">Add selected to<select aria-label="Add selected to" value={target} onChange={(event) => setTarget(event.target.value)} className="ml-2 min-h-11 rounded-xl border border-dashboard bg-dashboard-bg px-3"><option value="queue">Queue</option>{playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}</select></label>}
        <button type="button" disabled={mutationBusy || selectedVideos.length === 0} onClick={() => target === "queue" ? void add(selectedVideos) : void addToPlaylist(selectedVideos, Number(target))} className="min-h-11 px-4">Add {selectedVideos.length} selected to {target === "queue" ? "queue" : playlists.find((playlist) => String(playlist.id) === target)?.name}</button>
        {nextPageToken && <button type="button" disabled={searchBusy} onClick={() => void runSearch(nextPageToken)} className="min-h-11 px-4">Next page</button>}
      </div>
    </>}
  </section>;
}
