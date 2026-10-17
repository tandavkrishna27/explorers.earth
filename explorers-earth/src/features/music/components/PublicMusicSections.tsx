import { useLayoutEffect, useRef, useState, type ComponentProps, type FocusEvent } from "react";
import type { PublicMusicResource, PublicMusicSong } from "../publicMusicClient";
import { derivePublicMusicViewPolicy } from "../publicMusicViewPolicy";
import { PublicMusicPlayer } from "./PublicMusicPlayer";
import { PublicMusicRequest, type PublicMusicRequestSelection } from "./PublicMusicRequest";
import type { PublicMusicProductEvent } from "../publicMusicAnalytics";
import { getMusicFeaturedCards } from "../publicMusicPresentation";
import { PublicMusicNowPlaying } from "./PublicMusicNowPlaying";
import { PublicMusicAccordion, type MusicAccordionId } from "./PublicMusicAccordion";
import { PublicMusicArtwork } from "./PublicMusicArtwork";

function useSectionEngagement(section: "player" | "request" | "queue" | "playlists" | "history", enabled: boolean, onAnalytics?: (event: PublicMusicProductEvent) => void) {
  const engaged = useRef(false);
  const pointerInside = useRef(false);
  const focusInside = useRef(false);
  useLayoutEffect(() => {
    if (enabled) return;
    engaged.current = false;
    pointerInside.current = false;
    focusInside.current = false;
  }, [enabled]);
  const enter = () => {
    if (engaged.current) return;
    engaged.current = true;
    onAnalytics?.({ name: "section_opened", section });
  };
  return {
    onPointerEnter: () => { pointerInside.current = true; enter(); },
    onPointerLeave: () => {
      pointerInside.current = false;
      if (!focusInside.current) engaged.current = false;
    },
    onFocusCapture: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        focusInside.current = true;
        enter();
      }
    },
    onBlurCapture: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        focusInside.current = false;
        if (!pointerInside.current) engaged.current = false;
      }
    },
  };
}

function CollectionSummary({ shown, total, noun }: { shown: number; total: number; noun?: string }) {
  if (total <= shown) return null;
  return (
    <p className="text-sm public-music__muted">
      Showing {shown} of {total}{noun ? ` ${noun}` : ""}
    </p>
  );
}

function SongArtwork({ song }: { song: PublicMusicSong }) {
  return <PublicMusicArtwork url={song.thumbnailUrl} className="public-music__song-art" />;
}

function SongDetails({ song }: { song: PublicMusicSong }) {
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium">{song.title}</span>
      <span className="block truncate text-sm public-music__muted">{song.artist}</span>
    </span>
  );
}

function SongRow({ song, playable = false, selected = false, onSelect, onRequest }: {
  song: PublicMusicSong;
  playable?: boolean;
  selected?: boolean;
  onSelect?: (song: PublicMusicSong) => void;
  onRequest?: (song: PublicMusicSong) => void;
}) {
  return (
    <li className="public-music__song-row">
      {playable ? (
        <button
          type="button"
          aria-label={`Choose ${song.title} to play on this device`}
          aria-current={selected ? "true" : undefined}
          onClick={() => onSelect?.(song)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
        >
          <SongArtwork song={song} />
          <SongDetails song={song} />
          {selected ? <span className="ml-auto shrink-0 text-xs font-semibold">Selected</span> : null}
        </button>
      ) : (
        <>
          <SongArtwork song={song} />
          <SongDetails song={song} />
        </>
      )}
      {onRequest && <button type="button" className="public-music__row-request" aria-label={`Prepare request for ${song.title}`} onClick={() => onRequest(song)}>Request</button>}
    </li>
  );
}

type PublicMusicSectionsProps = {
  resource: PublicMusicResource;
  publicSlug?: string;
  capability?: string;
  headingId?: string;
  onReconcile?: () => void;
  requestClient?: ComponentProps<typeof PublicMusicRequest>["client"];
  guestActionsEnabled?: boolean;
  onAnalytics?: (event: PublicMusicProductEvent) => void;
};
export function PublicMusicSections(props: PublicMusicSectionsProps) {
  return <MusicSections key={JSON.stringify([props.publicSlug ?? props.resource.user.username, props.capability])} {...props} />;
}
function MusicSections({ resource, publicSlug, capability, headingId = "public-music-heading", onReconcile, requestClient, guestActionsEnabled = true, onAnalytics }: PublicMusicSectionsProps) {
  const policy = derivePublicMusicViewPolicy(resource);
  const [open, setOpen] = useState<Record<MusicAccordionId, boolean>>(() => ({
    queue: policy.queueVisible,
    history: !policy.queueVisible && policy.historyVisible,
    playlists: !policy.queueVisible && !policy.historyVisible && policy.playlistsVisible,
    player: false,
  }));
  const [playlistId, setPlaylistId] = useState<string>();
  const [requestSelection, setRequestSelection] = useState<PublicMusicRequestSelection>();
  const selectionSequence = useRef(0);
  const [selectedSong, setSelectedSong] = useState<{ id: string; source: "queue" | "playlist" } | null>(null);
  const [revocationAnnouncement, setRevocationAnnouncement] = useState("");
  const playerHasFocus = useRef(false);
  const previousPlayerEligible = useRef(false);
  const requestHasFocus = useRef(false);
  const previousRequestEligible = useRef(false);
  const [requestRevocation, setRequestRevocation] = useState<{
    publicSlug?: string; capability?: string; revision: number;
  }>();
  const committedRequestScope = useRef({ publicSlug, capability, revision: resource.revision });
  useLayoutEffect(() => {
    committedRequestScope.current = { publicSlug, capability, revision: resource.revision };
  }, [publicSlug, capability, resource.revision]);
  const firstPlaylistSong = policy.playlistsVisible
    ? resource.playlists.items.find((playlist) => playlist.songs.items.length > 0)?.songs.items[0]
    : undefined;
  const explicitSong = selectedSong?.source === "queue" && policy.queueVisible
    ? resource.queue.items.find(({ id }) => id === selectedSong.id)
    : selectedSong?.source === "playlist" && policy.playlistsVisible
      ? resource.playlists.items.flatMap((playlist) => playlist.songs.items).find(({ id }) => id === selectedSong.id)
      : undefined;
  const playableSelection = policy.playerEligible
    ? explicitSong && selectedSong
      ? { song: explicitSong, source: selectedSong.source }
      : resource.currentlyPlaying
        ? { song: resource.currentlyPlaying, source: "current" as const }
        : policy.queueVisible && resource.queue.items[0]
          ? { song: resource.queue.items[0], source: "queue" as const }
          : firstPlaylistSong
            ? { song: firstPlaylistSong, source: "playlist" as const }
            : undefined
    : undefined;
  const playableSong = playableSelection?.song;
  const selectedSource = playableSelection?.source ?? "current";
  // A denied request invalidates this canonical generation, not every future
  // publication. Only a newer snapshot (or a different resource) can recover it.
  const requestRevoked = requestRevocation !== undefined
    && requestRevocation.publicSlug === publicSlug
    && requestRevocation.capability === capability
    && resource.revision <= requestRevocation.revision;
  const requestEligible = policy.requestEligible && Boolean(publicSlug) && !requestRevoked;
  const requestActionsEnabled = requestEligible && guestActionsEnabled;
  const hasVisibleContent = requestEligible
    || policy.currentVisible
    || (policy.queueVisible && resource.queue.items.length > 0)
    || (policy.historyVisible && resource.recentlyPlayed.items.length > 0)
    || (policy.playlistsVisible && resource.playlists.items.length > 0);
  const requestEngagement = useSectionEngagement("request", requestActionsEnabled, onAnalytics);

  useLayoutEffect(() => {
    setOpen((previous) => {
      const eligible = {
        queue: policy.queueVisible,
        history: policy.historyVisible,
        playlists: policy.playlistsVisible,
        player: policy.playerEligible && Boolean(playableSong),
      };
      const next = {
        queue: previous.queue && eligible.queue,
        history: previous.history && eligible.history,
        playlists: previous.playlists && eligible.playlists,
        player: previous.player && eligible.player,
      };
      if (!Object.values(next).some(Boolean)) {
        const fallback = (["queue", "history", "playlists"] as const).find((id) => eligible[id]);
        if (fallback) next[fallback] = true;
      }
      return Object.keys(next).some((id) => next[id as MusicAccordionId] !== previous[id as MusicAccordionId])
        ? next
        : previous;
    });
  }, [playableSong, policy.historyVisible, policy.playerEligible, policy.playlistsVisible, policy.queueVisible]);

  useLayoutEffect(() => {
    if (!selectedSong) return;
    const stillAvailable = selectedSong.source === "queue"
      ? policy.queueVisible && resource.queue.items.some(({ id }) => id === selectedSong.id)
      : policy.playlistsVisible && resource.playlists.items.some((playlist) => playlist.songs.items.some(({ id }) => id === selectedSong.id));
    if (!stillAvailable) setSelectedSong(null);
  }, [policy.playlistsVisible, policy.queueVisible, resource.playlists.items, resource.queue.items, selectedSong]);

  useLayoutEffect(() => {
    const revoked = previousPlayerEligible.current && !policy.playerEligible;
    previousPlayerEligible.current = policy.playerEligible;
    if (policy.playerEligible) setRevocationAnnouncement("");
    if (!revoked || !playerHasFocus.current) return;
    playerHasFocus.current = false;
    setRevocationAnnouncement("Playback on this device is no longer available.");
    document.getElementById(headingId)?.focus();
  }, [headingId, policy.playerEligible]);
  useLayoutEffect(() => {
    const revoked = previousRequestEligible.current && !requestEligible;
    previousRequestEligible.current = requestEligible;
    if (requestEligible) setRevocationAnnouncement("");
    if (!requestEligible) setRequestSelection(undefined);
    if (!revoked) return;
    setRevocationAnnouncement("Song requests are no longer available.");
    if (!requestHasFocus.current) return;
    requestHasFocus.current = false;
    document.getElementById(headingId)?.focus();
  }, [headingId, requestEligible]);
  const revokeRequest = () => {
    const current = committedRequestScope.current;
    // Denials carry no server revision: a same-scope late denial remains
    // authoritative even if another snapshot arrived while it was in flight.
    // Reconciliation must advance beyond BOTH snapshots before restoring UI.
    if (current.publicSlug !== publicSlug || current.capability !== capability) return;
    setRequestRevocation({ publicSlug, capability, revision: Math.max(resource.revision, current.revision) });
    onReconcile?.();
  };
  const revocationStatus = revocationAnnouncement
    ? <p role="status" aria-live="polite" className="sr-only">{revocationAnnouncement}</p>
    : null;

  const selectedPlaylist = policy.playlistsVisible
    ? resource.playlists.items.find(playlist => playlist.id === playlistId) ?? resource.playlists.items[0]
    : undefined;
  useLayoutEffect(() => {
    if (!policy.playerEligible) setOpen(previous => previous.player ? { ...previous, player: false } : previous);
    if (playlistId !== selectedPlaylist?.id) setPlaylistId(selectedPlaylist?.id);
  }, [policy.playerEligible, playlistId, selectedPlaylist?.id]);
  const changeOpen = (id: MusicAccordionId, value: boolean) => {
    if (value && !open[id]) {
      onAnalytics?.({ name: "section_opened", section: id });
      if (id === "playlists" && selectedPlaylist) onAnalytics?.({ name: "playlist_opened" });
    }
    setOpen(previous => ({ ...previous, [id]: value }));
  };
  const choose = (song: PublicMusicSong, source: "current" | "queue" | "playlist") => {
    if (!policy.playerEligible || !guestActionsEnabled) return;
    setSelectedSong(source === "current" ? null : { id: song.id, source });
    onAnalytics?.({ name: "song_selected", source });
    changeOpen("player", true);
  };
  const prepareRequest = (song: PublicMusicSong) => {
    if (!requestActionsEnabled) return;
    setRequestSelection({ youtubeId: song.youtubeId, selectionId: ++selectionSequence.current });
  };
  const featured = getMusicFeaturedCards(resource);
  if (!hasVisibleContent) return <div className="public-music__sections">
    <PublicMusicNowPlaying cards={[]} canListen={false} onListen={() => undefined} />
    <p className="public-music__muted text-center">Nothing has been shared here yet</p>{revocationStatus}
  </div>;
  return <div className="public-music__sections">
    {requestEligible && publicSlug ? <div {...requestEngagement} onFocusCapture={event => { requestHasFocus.current = true; requestEngagement.onFocusCapture(event); }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) requestHasFocus.current = false; requestEngagement.onBlurCapture(event); }}>
      <PublicMusicRequest publicSlug={publicSlug} capability={capability} selection={requestSelection} allowed actionsEnabled={guestActionsEnabled} client={requestClient} onCanonicalRevoked={revokeRequest} onRequestOutcome={outcome => onAnalytics?.({ name: "request_submitted", outcome })} />
    </div> : null}
    <PublicMusicNowPlaying cards={featured} canListen={policy.playerEligible && guestActionsEnabled} onListen={card => choose(card.song, card.source)} />
    {revocationStatus}
    <div className="public-music__accordions">
      {policy.queueVisible && <PublicMusicAccordion id="queue" title="Queue" open={open.queue} onOpenChange={value => changeOpen("queue", value)}>
        <CollectionSummary shown={resource.queue.items.length} total={resource.queue.total} />
        {resource.queue.items.length ? <ol aria-label="Up next" className="public-music__song-list">{resource.queue.items.map(song => <SongRow key={song.id} song={song} playable={policy.playerEligible && guestActionsEnabled} selected={selectedSong?.source === "queue" && selectedSong.id === song.id} onSelect={selection => choose(selection, "queue")} />)}</ol>
          : <p className="public-music__empty">Nothing queued yet</p>}
      </PublicMusicAccordion>}
      {policy.historyVisible && <PublicMusicAccordion id="history" title="Recently played" open={open.history} onOpenChange={value => changeOpen("history", value)}>
        <CollectionSummary shown={resource.recentlyPlayed.items.length} total={resource.recentlyPlayed.total} />
        {resource.recentlyPlayed.items.length ? <ol aria-label="Recently played" className="public-music__song-list">{resource.recentlyPlayed.items.map(song => <SongRow key={song.id} song={song} onRequest={requestActionsEnabled ? prepareRequest : undefined} />)}</ol> : <p className="public-music__empty">Nothing played recently</p>}
      </PublicMusicAccordion>}
      {policy.playlistsVisible && <PublicMusicAccordion id="playlists" title="Playlists" open={open.playlists} onOpenChange={value => changeOpen("playlists", value)}>
        <CollectionSummary shown={resource.playlists.items.length} total={resource.playlists.total} noun="playlists" />
        {selectedPlaylist ? <>
          <div className="public-music__playlist-choices" aria-label="Choose a playlist">{resource.playlists.items.map(playlist => <button type="button" key={playlist.id} aria-pressed={selectedPlaylist.id === playlist.id} onClick={() => { if (selectedPlaylist.id !== playlist.id) { setPlaylistId(playlist.id); onAnalytics?.({ name: "playlist_opened" }); } }}>{playlist.name}</button>)}</div>
          <article className="public-music__playlist"><h3 className="sr-only">{selectedPlaylist.name}</h3>
            {selectedPlaylist.description && <p className="public-music__muted public-music__playlist-description">{selectedPlaylist.description}</p>}
            <CollectionSummary shown={selectedPlaylist.songs.items.length} total={selectedPlaylist.songs.total} noun="songs" />
            {selectedPlaylist.songs.items.length ? <ol className="public-music__song-list" aria-label={`${selectedPlaylist.name} songs`}>{selectedPlaylist.songs.items.map(song => <SongRow key={song.id} song={song} playable={policy.playerEligible && guestActionsEnabled} selected={selectedSong?.source === "playlist" && selectedSong.id === song.id} onSelect={selection => choose(selection, "playlist")} onRequest={requestActionsEnabled ? prepareRequest : undefined} />)}</ol> : <p className="public-music__empty">No songs in this playlist yet</p>}
          </article>
        </> : <p className="public-music__empty">No shared playlists yet</p>}
      </PublicMusicAccordion>}
      {playableSong && <section data-testid="public-music-player" onFocusCapture={() => { playerHasFocus.current = true; }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) playerHasFocus.current = false; }}>
        <PublicMusicAccordion id="player" title="Play on this device" open={open.player} onOpenChange={value => changeOpen("player", value)}>
          <p className="public-music__muted text-sm">Your own listening session. This does not control the host's playback.</p>
          {open.player && <PublicMusicPlayer key={`${selectedSource}:${playableSong.id}`} song={playableSong} allowed={policy.playerEligible} actionsEnabled={guestActionsEnabled} onPlaybackStart={() => onAnalytics?.({ name: "playback_started", source: selectedSource })} />}
        </PublicMusicAccordion>
      </section>}
    </div>
  </div>;
}
