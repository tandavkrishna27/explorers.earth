import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { ChevronDown, Copy, ListMusic, MoreHorizontal, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import type { TunesDashboardData } from "../hooks/useTunesDashboard";
import { musicWorkspaceClient } from "../hooks/useTunesDashboard";
import type { MusicPlaylist, MusicPublicationMode } from "../features/music/musicWorkspaceClient";
import { MusicClientError } from "../lib/localTunesApiClient";
import type { MusicPublicationOwnerScope } from "../features/music/musicPublicationCommandRegistry";
import { createMusicQueueClient } from "../features/music/musicQueueClient";
import { createMusicSearchClient } from "../features/music/musicSearchClient";
import { musicApi } from "../features/music/musicApi";
import { MusicWorkspaceShell } from "../features/music/components/MusicWorkspaceShell";
import { MusicSearch } from "../features/music/components/MusicSearch";
import { MusicQueue } from "../features/music/components/MusicQueue";
import { MusicPlayer, type MusicPlaybackRequest } from "../features/music/components/MusicPlayer";
import { MusicHistory } from "../features/music/components/MusicHistory";
import { MusicGuestControls } from "../features/music/components/MusicGuestControls";
import { MusicSectionTabs, type MusicSection } from "../features/music/components/MusicSectionTabs";
import { MusicPlaylistCollection } from "../features/music/components/MusicPlaylistCollection";
import { createMusicPlaybackArbiter, type MusicPlaybackCommand } from "../features/music/components/musicPlaybackCommand";
import Switch from "./ui/Switch";
import { useMusicPublish } from "../features/music/MusicPublishProvider";
import { MusicPublishSwitch } from "../features/music/components/MusicPublishSwitch";
import { useAccountNavigationWriter, useCategoryNavigation } from "../features/navigation/CategoryNavigationProvider";
import type { IntentAuthority } from "../features/navigation/categoryNavigationPolicy";

interface MusicDashboardProps {
  data: TunesDashboardData;
  scope: MusicPublicationOwnerScope;
  readOnly?: boolean;
  complete?: boolean;
}

const completeQueueClient = createMusicQueueClient((input) => musicApi.request(input));
const completeSearchClient = createMusicSearchClient((input) => musicApi.request(input));

async function refreshMusicDashboard(refetch: TunesDashboardData["refetch"]): Promise<void> {
  const result = await refetch();
  if (result && typeof result === "object" && "error" in result && result.error) throw result.error;
}

function CompleteMusicDashboard({ data, readOnly, playbackRequest, authorityGeneration, beginPlaybackRequest, onPlaybackRequested }: Pick<MusicDashboardProps, "data" | "readOnly"> & { playbackRequest: MusicPlaybackRequest | null; authorityGeneration: string; beginPlaybackRequest: () => number; onPlaybackRequested: MusicPlaybackCommand }) {
  const dashboard = data.dashboard ?? { queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: "private" as const, publicSlug: "" } };
  const refresh = () => refreshMusicDashboard(data.refetch);
  const discovery = <MusicSearch searchClient={completeSearchClient} queueClient={completeQueueClient} playlists={data.playlists.map(({ id, name }) => ({ id, name }))} playlistClient={musicWorkspaceClient} onChanged={refresh} />;
  const queue = <MusicQueue songs={dashboard.songs} client={completeQueueClient} onChanged={refresh} beginPlaybackRequest={beginPlaybackRequest} onPlaybackRequested={onPlaybackRequested} />;
  const history = <MusicHistory songs={dashboard.playedSongs} loading={data.isLoading} queueClient={completeQueueClient} onChanged={refresh} beginPlaybackRequest={beginPlaybackRequest} onPlaybackRequested={onPlaybackRequested} />;
  const guestControls = data.guestControls
    ? <MusicGuestControls value={data.guestControls} readOnly={readOnly} onSave={async (controls) => {
      await musicWorkspaceClient.updateGuestControls(controls, operationKey("guest-controls"));
      try { await refresh(); return undefined; }
      catch { return { reconciliationFailed: true }; }
    }} />
    : <p className="text-sm text-dashboard-muted">Guest controls are temporarily unavailable.</p>;
  return <MusicWorkspaceShell
    loading={data.isLoading}
    stale={readOnly}
    empty={!data.isLoading && dashboard.songs.length === 0 && !dashboard.currentlyPlaying}
    player={<MusicPlayer currentSong={dashboard.currentlyPlaying} queuedSongs={dashboard.songs.filter((song) => song.status === "queued")} playedSongs={dashboard.playedSongs} queueClient={completeQueueClient} onChanged={refresh} readOnly={readOnly} playbackRequest={playbackRequest} authorityGeneration={authorityGeneration} beginPlaybackRequest={beginPlaybackRequest} onPlaybackRequested={onPlaybackRequested} />}
    search={readOnly ? <fieldset disabled aria-label="Music search unavailable">{discovery}</fieldset> : discovery}
    queue={readOnly ? <fieldset disabled aria-label="Queue changes unavailable">{queue}</fieldset> : queue}
    history={readOnly ? <fieldset disabled aria-label="History changes unavailable">{history}</fieldset> : history}
    guestControls={guestControls}
  />;
}

const buttonClass = "min-h-11 min-w-11 rounded-xl px-4 text-sm font-semibold outline-none ring-offset-2 ring-offset-dashboard-bg focus-visible:ring-2 focus-visible:ring-dashboard-accent disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

function operationKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function WorkspaceDialog({
  title,
  description,
  children,
  onClose,
  opener,
  closeDisabled = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
  opener: RefObject<HTMLButtonElement>;
  closeDisabled?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const close = () => {
    if (closeDisabled) return;
    onClose();
  };

  useEffect(() => {
    const root = dialog.current;
    const first = root?.querySelector<HTMLElement>("[data-autofocus]");
    first?.focus();
    return () => { opener.current?.focus(); };
  }, [opener]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={onKeyDown}
        className="dashboard-theme dashboard-theme-dark max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-dashboard bg-dashboard-sidebar p-5 shadow-2xl sm:p-6"
      >
        <h2 id={titleId} className="text-xl font-semibold text-dashboard">{title}</h2>
        <p id={descriptionId} className="mt-2 text-base text-dashboard-light">{description}</p>
        {children}
      </div>
    </div>
  );
}

function CreatePlaylistDialog({ onClose, opener, onCreated, makePublic = false }: { onClose: () => void; opener: RefObject<HTMLButtonElement>; onCreated: (message: string) => Promise<boolean>; makePublic?: boolean }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const submitLock = useRef(false);
  const createIdempotencyKey = useRef<string | null>(null);
  const [createdPlaylist, setCreatedPlaylist] = useState<MusicPlaylist | null>(null);
  const [sharingError, setSharingError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    setSharingError("");
    let created = createdPlaylist;
    if (!created) try {
      createIdempotencyKey.current ??= operationKey("playlist-create");
      created = await musicWorkspaceClient.createPlaylist(name.trim(), description.trim() || null, createIdempotencyKey.current);
      setCreatedPlaylist(created);
    } catch {
      toast.error("Music is temporarily unavailable.");
      submitLock.current = false;
      setSaving(false);
      return;
    }
    if (makePublic) try {
      await musicWorkspaceClient.setPlaylistVisibility(created.id, true, operationKey("playlist-visibility"));
    } catch {
      setSharingError("Playlist was created, but sharing failed. Retry sharing without creating another playlist.");
      toast.error("Playlist created, but sharing failed.");
      submitLock.current = false;
      setSaving(false);
      return;
    }
    // Reconcile separately so a refresh error cannot invite a duplicate create submit.
    await onCreated("Playlist was created, but the latest playlists could not be loaded.");
    toast.success("Playlist created.");
    onClose();
    submitLock.current = false;
    setSaving(false);
  };
  return (
    <WorkspaceDialog title="Create playlist" description={makePublic ? "Anyone allowed into your shared Music page can see this playlist." : "Only you can see this playlist until you change its visibility."} onClose={onClose} opener={opener} closeDisabled={saving}>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-sm text-dashboard-light">
          Playlist name
          <input data-autofocus value={name} onChange={(event) => setName(event.target.value)} disabled={createdPlaylist !== null} maxLength={120} required className="mt-2 min-h-11 w-full rounded-xl border border-dashboard bg-dashboard-muted px-3 text-dashboard outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent" />
        </label>
        <label className="block text-sm text-dashboard-light">
          Description <span className="text-dashboard-muted">(optional)</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={createdPlaylist !== null} maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-dashboard bg-dashboard-muted p-3 text-dashboard outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent" />
        </label>
        {sharingError && <p role="alert" className="text-sm text-red-400">{sharingError}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className={`${buttonClass} bg-dashboard-muted text-dashboard`}>Cancel</button>
          <button type="submit" disabled={saving || !name.trim()} className={`${buttonClass} bg-dashboard-accent text-[var(--dash-accent-text)]`}>{saving ? (createdPlaylist ? "Sharing…" : "Creating…") : createdPlaylist ? "Retry sharing" : "Create playlist"}</button>
        </div>
      </form>
    </WorkspaceDialog>
  );
}

function RenamePlaylistDialog({
  playlist,
  onClose,
  opener,
  onRenamed,
}: {
  playlist: MusicPlaylist;
  onClose: () => void;
  opener: RefObject<HTMLButtonElement>;
  onRenamed: (message: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description ?? "");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await musicWorkspaceClient.renamePlaylist(
        playlist.id,
        name.trim(),
        description.trim() || null,
        operationKey("playlist-rename"),
      );
    } catch {
      toast.error("Music is temporarily unavailable.");
      setSaving(false);
      return;
    }
    await onRenamed("Playlist was renamed, but the latest playlists could not be loaded.");
    toast.success("Playlist renamed.");
    onClose();
    setSaving(false);
  };
  return (
    <WorkspaceDialog title="Rename playlist" description="Update this playlist name and description." onClose={onClose} opener={opener} closeDisabled={saving}>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-sm text-dashboard-light">
          Playlist name
          <input data-autofocus value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required className="mt-2 min-h-11 w-full rounded-xl border border-dashboard bg-dashboard-muted px-3 text-dashboard outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent" />
        </label>
        <label className="block text-sm text-dashboard-light">
          Description <span className="text-dashboard-muted">(optional)</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-dashboard bg-dashboard-muted p-3 text-dashboard outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent" />
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className={`${buttonClass} bg-dashboard-muted text-dashboard`}>Cancel</button>
          <button type="submit" disabled={saving || !name.trim()} className={`${buttonClass} bg-dashboard-accent text-[var(--dash-accent-text)]`}>{saving ? "Saving…" : "Save playlist"}</button>
        </div>
      </form>
    </WorkspaceDialog>
  );
}

const publicationCopy: Record<MusicPublicationMode, string> = {
  private: "Only you can open this Music workspace.",
  unlisted: "Anyone with the private link can view shared playlists. The page won’t appear in search.",
  public: "Anyone can view shared playlists, and the page can appear in search.",
};

function SharingDialog({ data, origin, ready, onClose, opener }: { data: TunesDashboardData; origin: IntentAuthority; ready: boolean; onClose: () => void; opener: RefObject<HTMLButtonElement> }) {
  const music = useMusicPublish(origin, { ready });
  const { isCurrent } = useAccountNavigationWriter();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [error, setError] = useState("");
  const current = music.state.confirmed ?? data.dashboard?.publication;
  const [mode, setMode] = useState<MusicPublicationMode>(current?.mode ?? "private");
  const [capability, setCapability] = useState<string>();
  const [saving, setSaving] = useState(false);
  const publicSlug = current?.publicSlug ?? "";
  const base = `${window.location.origin}/music/share/${encodeURIComponent(publicSlug)}`;
  const shareLink = mode === "public" && music.state.kind === "published" ? base
    : mode === "unlisted" && capability && current?.mode === "unlisted" && music.canRecover ? `${base}#access=${capability}` : undefined;
  const save = async () => {
    if (!music.canRecover || !isCurrent(origin)) return;
    setSaving(true); setError(""); setCapability(undefined);
    try {
      const result = await music.request(mode);
      if (!alive.current || !isCurrent(origin)) return;
      if (result.status !== "verified") { setError("Music publication was not confirmed. Review the status and retry."); return; }
      setCapability(result.response && "capability" in result.response ? result.response.capability : undefined);
      void refreshMusicDashboard(data.refetch).catch(() => undefined);
      toast.success(mode === "public" ? "Music is public." : mode === "unlisted" ? "Private link created." : "Music is private.");
      if (mode !== "unlisted") onClose();
    } finally {
      if (alive.current && isCurrent(origin)) setSaving(false);
    }
  };
  return (
    <WorkspaceDialog title="Music sharing" description="Choose who can view the playlists you share." onClose={onClose} opener={opener} closeDisabled={saving}>
      {error && <p role="alert" tabIndex={0} className="mt-3 text-sm text-dashboard-danger">{error}</p>}
      {music.state.kind === "conflict" && <p role="alert" className="mt-3 text-sm text-dashboard-danger">The previous action conflicts or expired. Review the mode, then confirm a new action.</p>}
      <fieldset className="mt-5 space-y-2">
        <legend className="sr-only">Visibility mode</legend>
        {(["private", "unlisted", "public"] as const).map((value, index) => (
          <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashboard bg-dashboard-bg/40 px-3 text-dashboard focus-within:ring-2 focus-within:ring-dashboard-accent">
            <input data-autofocus={index === 0 || undefined} type="radio" name="music-publication" value={value} checked={mode === value} disabled={saving || !music.canRecover} onChange={() => { setMode(value); setCapability(undefined); }} className="h-5 w-5 accent-[var(--dash-accent)]" />
            <span>{value[0].toUpperCase() + value.slice(1)}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4 rounded-xl bg-dashboard-muted p-4">
        <p className="text-base text-dashboard-light">{publicationCopy[mode]}</p>
        {mode === "unlisted" && !shareLink && <p className="mt-2 text-base text-dashboard-muted">Save to create a new private link. Creating another link replaces the previous one.</p>}
        {shareLink && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <input readOnly aria-label="Music share link" value={shareLink} className="min-h-11 min-w-0 flex-1 rounded-xl border border-dashboard bg-dashboard-bg px-3 text-base text-dashboard" />
              <button type="button" aria-label="Copy Music link" onClick={() => void navigator.clipboard.writeText(shareLink)} className={`${buttonClass} bg-dashboard-bg text-dashboard`}><Copy className="h-4 w-4" /></button>
            </div>
            <a href={shareLink} target="_blank" rel="noopener noreferrer" aria-label="Preview public Music page" className={`${buttonClass} inline-flex items-center border border-dashboard bg-dashboard-bg text-dashboard`}>Preview</a>
          </div>
        )}
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={saving} className={`${buttonClass} bg-dashboard-muted text-dashboard`}>Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving || !music.canRecover} className={`${buttonClass} bg-dashboard-accent text-[var(--dash-accent-text)]`}>{saving ? "Saving…" : music.state.kind === "conflict" ? "Confirm new sharing action" : "Save sharing"}</button>
      </div>
    </WorkspaceDialog>
  );
}

function PlaylistPanel({ playlist, queueRevision, readOnly, onChanged, onCommitted, announce, beginPlaybackRequest, onPlaybackRequested, onQueueRevisionAcknowledged }: { playlist: MusicPlaylist; queueRevision: number; readOnly: boolean; onChanged: () => Promise<unknown>; onCommitted: (message: string) => Promise<boolean>; announce: (message: string) => void; beginPlaybackRequest: () => number; onPlaybackRequested: MusicPlaybackCommand; onQueueRevisionAcknowledged: (revision: number) => void }) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [visibilityPending, setVisibilityPending] = useState(false);
  const [reorderPending, setReorderPending] = useState(false);
  const [visibleToGuests, setVisibleToGuests] = useState(playlist.isVisibleToGuests);
  const [orderedSongs, setOrderedSongs] = useState(playlist.songs);
  const visibilityLock = useRef(false);
  const canonicalVisibility = useRef({ playlistId: playlist.id, value: playlist.isVisibleToGuests });
  canonicalVisibility.current = { playlistId: playlist.id, value: playlist.isVisibleToGuests };
  const reorderLock = useRef(false);
  const [confirmAction, setConfirmAction] = useState<"replace" | "shuffle" | "delete">();
  const [queueActionMenuOpen, setQueueActionMenuOpen] = useState(false);
  const renameOpener = useRef<HTMLButtonElement>(null);
  const replaceOpener = useRef<HTMLButtonElement>(null);
  const deleteOpener = useRef<HTMLButtonElement>(null);
  const queueActionOpener = useRef<HTMLButtonElement>(null);
  const queueActionMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!queueActionMenuOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (!queueActionMenu.current?.contains(event.target as Node) && !queueActionOpener.current?.contains(event.target as Node)) {
        setQueueActionMenuOpen(false); queueActionOpener.current?.focus();
      }
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [queueActionMenuOpen]);
  const pendingQueueReplacement = useRef<{ kind: "replace" | "shuffle"; key: string; expectedRevision: number; songs: Array<{ playlistId: number; songId: number }> } | undefined>(undefined);
  const pendingQueueAppend = useRef<{ key: string; expectedRevision: number; songs: Array<{ playlistId: number; songId: number }> } | undefined>(undefined);
  useEffect(() => {
    if (!visibilityLock.current) setVisibleToGuests(playlist.isVisibleToGuests);
  }, [playlist.id, playlist.isVisibleToGuests]);
  useEffect(() => {
    if (!reorderLock.current) setOrderedSongs(playlist.songs);
  }, [playlist.id, playlist.songs]);
  const setVisible = async (next: boolean) => {
    if (visibilityLock.current) return;
    visibilityLock.current = true;
    setVisibilityPending(true);
    setVisibleToGuests(next);
    try {
      try { await musicWorkspaceClient.setPlaylistVisibility(playlist.id, next, operationKey("playlist-visibility")); }
      catch {
        const canonical = canonicalVisibility.current;
        setVisibleToGuests(canonical.playlistId === playlist.id ? canonical.value : playlist.isVisibleToGuests);
        toast.error("Music is temporarily unavailable.");
        return;
      }
      await onCommitted("Playlist visibility was saved, but the latest playlists could not be loaded.");
    } finally { visibilityLock.current = false; setVisibilityPending(false); }
  };
  const move = async (songId: number, to: number, title: string) => {
    if (reorderLock.current || to < 0 || to >= orderedSongs.length) return;
    const previous = orderedSongs;
    const current = previous.findIndex((song) => song.id === songId);
    if (current < 0) return;
    const next = [...previous];
    const [moved] = next.splice(current, 1);
    next.splice(to, 0, moved);
    reorderLock.current = true;
    setReorderPending(true);
    setOrderedSongs(next);
    try {
      try { await musicWorkspaceClient.reorderPlaylistSong(playlist.id, songId, to, operationKey("playlist-reorder")); }
      catch { setOrderedSongs(previous); toast.error("Music is temporarily unavailable."); return; }
      announce(`${title} moved to position ${to + 1}.`);
      await onCommitted("Playlist order was saved, but the latest playlist could not be loaded.");
    } finally { reorderLock.current = false; setReorderPending(false); }
  };
  const [playbackRetry, setPlaybackRetry] = useState<number | null>(null);
  const appendQueue = async () => {
    setSaving(true);
    const operation = pendingQueueAppend.current ?? { key: operationKey("queue-append"), expectedRevision: queueRevision, songs: orderedSongs.map((song) => ({ playlistId: playlist.id, songId: song.id })) };
    pendingQueueAppend.current = operation;
    try { const result = await completeQueueClient.appendQueue(operation.expectedRevision, operation.songs, operation.key); onQueueRevisionAcknowledged(result.revision); pendingQueueAppend.current = undefined; }
    catch (cause) {
      if (cause instanceof MusicClientError && cause.status === 409 && cause.upstreamCode === "QUEUE_REVISION_CONFLICT") pendingQueueAppend.current = undefined;
      try { await onChanged(); } catch { /* reconciliation is best effort */ }
      toast.error("Music is temporarily unavailable."); setSaving(false); return;
    }
    await onCommitted("Queue was updated, but the latest Music workspace could not be loaded.");
    toast.success(`Added ${playlist.name} to the queue.`); setSaving(false);
  };
  const replaceQueue = async (shuffle = false) => {
    setSaving(true);
    const kind = shuffle ? "shuffle" as const : "replace" as const;
    const operation = pendingQueueReplacement.current?.kind === kind ? pendingQueueReplacement.current : {
      kind,
      key: operationKey("queue-replace"),
      expectedRevision: queueRevision,
      songs: shuffle ? [...orderedSongs].sort(() => Math.random() - 0.5).map((song) => ({ playlistId: playlist.id, songId: song.id })) : orderedSongs.map((song) => ({ playlistId: playlist.id, songId: song.id })),
    };
    pendingQueueReplacement.current = operation;
    try {
      const result = await completeQueueClient.replaceQueue(
        operation.expectedRevision,
        operation.songs,
        operation.key,
      );
      pendingQueueReplacement.current = undefined;
      onQueueRevisionAcknowledged(result.revision);
      const first = result.songs[0];
      if (shuffle && first) try { await onPlaybackRequested(first.id, beginPlaybackRequest(), "playlist-shuffle"); }
      catch { setPlaybackRetry(first.id); }
    } catch (cause) {
      if (cause instanceof MusicClientError && cause.status === 409 && cause.upstreamCode === "QUEUE_REVISION_CONFLICT") pendingQueueReplacement.current = undefined;
      try { await onChanged(); } catch { /* Keep the original operation available for an explicit retry. */ }
      toast.error("Music is temporarily unavailable.");
      setSaving(false);
      return;
    }
    await onCommitted("Queue was replaced, but the latest Music workspace could not be loaded.");
    toast.success(`Queue replaced with ${playlist.name}.`);
    setConfirmAction(undefined);
    setSaving(false);
  };
  const removeSong = async (songId: number, title: string) => {
    setSaving(true);
    try {
      await musicWorkspaceClient.removePlaylistSong(playlist.id, songId, operationKey("playlist-song-remove"));
      announce(`${title} removed from ${playlist.name}.`);
    } catch { toast.error("Music is temporarily unavailable."); setSaving(false); return; }
    await onCommitted(`${title} was removed from ${playlist.name}, but the latest playlist could not be loaded.`);
    setSaving(false);
  };
  const deletePlaylist = async () => {
    setSaving(true);
    try {
      await musicWorkspaceClient.deletePlaylist(playlist.id, operationKey("playlist-delete"));
    } catch { toast.error("Music is temporarily unavailable."); setSaving(false); return; }
    await onCommitted("Playlist was deleted, but the latest playlists could not be loaded.");
    toast.success("Playlist deleted.");
    setConfirmAction(undefined);
    setSaving(false);
  };
  return (
    <>
    <section role="tabpanel" aria-label={playlist.name} className="rounded-2xl border border-dashboard bg-dashboard-sidebar p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h3 className="font-semibold text-dashboard">{playlist.name}</h3>{playlist.description && <p className="mt-1 text-sm text-dashboard-muted">{playlist.description}</p>}</div>
        <div className="flex flex-wrap gap-2">
          <div className="relative"><button ref={queueActionOpener} type="button" aria-label={`Queue actions for ${playlist.name}`} aria-haspopup="menu" aria-expanded={queueActionMenuOpen} aria-controls={`playlist-queue-actions-${playlist.id}`} disabled={readOnly || saving || orderedSongs.length === 0} onClick={() => setQueueActionMenuOpen((open) => !open)} className={`${buttonClass} bg-dashboard-accent text-[var(--dash-accent-text)]`}><MoreHorizontal className="h-5 w-5" /></button>{queueActionMenuOpen && <div ref={queueActionMenu} id={`playlist-queue-actions-${playlist.id}`} role="menu" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setQueueActionMenuOpen(false); queueActionOpener.current?.focus(); } }} className="absolute right-0 top-12 z-30 min-w-52 rounded-xl border border-dashboard bg-dashboard-sidebar p-2 shadow-xl"><button role="menuitem" type="button" onClick={() => { setQueueActionMenuOpen(false); void appendQueue(); }} className={`${buttonClass} w-full bg-dashboard-muted text-left text-dashboard`}>Add to queue</button><button ref={replaceOpener} role="menuitem" type="button" onClick={() => { setQueueActionMenuOpen(false); setConfirmAction("replace"); }} className={`${buttonClass} mt-1 w-full bg-dashboard-muted text-left text-dashboard`}>Replace queue</button><button role="menuitem" type="button" onClick={() => { setQueueActionMenuOpen(false); setConfirmAction("shuffle"); }} className={`${buttonClass} mt-1 w-full bg-dashboard-muted text-left text-dashboard`}>Shuffle and play</button></div>}</div>
          <button ref={renameOpener} type="button" onClick={() => setRenameOpen(true)} disabled={readOnly || saving} className={`${buttonClass} bg-dashboard-muted text-dashboard`}>Rename playlist</button>
          <Switch
            checked={visibleToGuests}
            onChange={(next) => void setVisible(next)}
            disabled={readOnly || saving}
            loading={visibilityPending}
            label={visibleToGuests ? "Shared" : "Private"}
            ariaLabel={`Make ${playlist.name} ${visibleToGuests ? "private" : "public"}`}
          />
          <button ref={deleteOpener} type="button" onClick={() => setConfirmAction("delete")} disabled={readOnly || saving} aria-label={`Delete playlist ${playlist.name}`} className={`${buttonClass} bg-dashboard-muted text-dashboard`}>Delete playlist</button>
        </div>
      </div>
      {orderedSongs.length === 0 ? <p className="mt-6 text-sm text-dashboard-muted">This playlist is empty.</p> : (
        <ol className="mt-5 space-y-2">
          {orderedSongs.map((song, index) => (
            <li key={song.id} className="flex items-center gap-3 rounded-xl bg-dashboard-muted/60 p-2">
              <img src={song.thumbnailUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-dashboard">{song.title}</p><p className="truncate text-xs text-dashboard-muted">{song.artist}</p></div>
              <div className="flex gap-1">
                <button type="button" aria-label={`Move ${song.title} up`} disabled={readOnly || saving || reorderPending || index === 0} onClick={() => void move(song.id, index - 1, song.title)} className={`${buttonClass} bg-dashboard-bg px-2 text-dashboard`}>↑</button>
                <button type="button" aria-label={`Move ${song.title} down`} disabled={readOnly || saving || reorderPending || index === orderedSongs.length - 1} onClick={() => void move(song.id, index + 1, song.title)} className={`${buttonClass} bg-dashboard-bg px-2 text-dashboard`}>↓</button>
                <button type="button" aria-label={`Remove ${song.title} from ${playlist.name}`} disabled={readOnly || saving} onClick={() => void removeSong(song.id, song.title)} className={`${buttonClass} bg-dashboard-bg px-2 text-dashboard`}>Remove</button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {renameOpen && (
        <RenamePlaylistDialog
          playlist={playlist}
          opener={renameOpener}
          onClose={() => setRenameOpen(false)}
          onRenamed={onCommitted}
        />
      )}
      {playbackRetry !== null && <button type="button" onClick={() => void onPlaybackRequested(playbackRetry, beginPlaybackRequest(), "playlist-retry").then(() => setPlaybackRetry(null)).catch(() => undefined)} className={`${buttonClass} mt-4 bg-dashboard-muted text-dashboard`}>Retry playback</button>}
    </section>
    {confirmAction === "replace" && (
      <WorkspaceDialog title="Replace active queue" description={`Replace the current queue with all songs from ${playlist.name}?`} onClose={() => setConfirmAction(undefined)} opener={queueActionOpener} closeDisabled={saving}>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setConfirmAction(undefined)} disabled={saving} className={`${buttonClass} bg-dashboard-muted text-dashboard`}>Cancel</button>
          <button data-autofocus type="button" aria-label="Confirm queue replacement" onClick={() => void replaceQueue()} disabled={saving} className={`${buttonClass} bg-dashboard-accent text-[var(--dash-accent-text)]`}>{saving ? "Replacing…" : "Replace queue"}</button>
        </div>
      </WorkspaceDialog>
    )}
    {confirmAction === "shuffle" && <WorkspaceDialog title="Shuffle and replace active queue" description={`Replace the current queue with a shuffled ${playlist.name} and start playback?`} onClose={() => setConfirmAction(undefined)} opener={queueActionOpener} closeDisabled={saving}><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setConfirmAction(undefined)} disabled={saving} className={`${buttonClass} bg-dashboard-muted text-dashboard`}>Cancel</button><button data-autofocus type="button" onClick={() => void replaceQueue(true)} disabled={saving} className={`${buttonClass} bg-dashboard-accent text-[var(--dash-accent-text)]`}>{saving ? "Replacing…" : "Shuffle and play"}</button></div></WorkspaceDialog>}
    {confirmAction === "delete" && (
      <WorkspaceDialog title={`Delete ${playlist.name}`} description="Delete this playlist and all of its saved songs? This cannot be undone." onClose={() => setConfirmAction(undefined)} opener={deleteOpener} closeDisabled={saving}>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setConfirmAction(undefined)} disabled={saving} className={`${buttonClass} bg-dashboard-muted text-dashboard`}>Cancel</button>
          <button data-autofocus type="button" aria-label="Confirm playlist deletion" onClick={() => void deletePlaylist()} disabled={saving} className={`${buttonClass} bg-dashboard-accent text-[var(--dash-accent-text)]`}>{saving ? "Deleting…" : "Delete playlist"}</button>
        </div>
      </WorkspaceDialog>
    )}
    </>
  );
}

export default function MusicDashboard({ data, scope, readOnly = false, complete = false }: MusicDashboardProps) {
  const { authority } = useCategoryNavigation();
  const origin = authority?.userDocumentId === scope.userDocumentId && authority?.accountDocumentId === scope.accountDocumentId ? authority : undefined;
  const publishReady = !readOnly && !data.error && data.entitlement?.coreMutation === true;
  const [sharingOrigin, setSharingOrigin] = useState<IntentAuthority>();
  useEffect(() => { if (sharingOrigin && (!origin || origin.generation !== sharingOrigin.generation)) { setSharingOpen(false); setSharingOrigin(undefined); } }, [origin?.generation, sharingOrigin]);
  const [section, setSection] = useState<MusicSection>("playlists");
  const [createOpen, setCreateOpen] = useState(false);
  const [createPublic, setCreatePublic] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<number | undefined>();
  const [announcement, setAnnouncement] = useState("");
  const [playlistReconciliation, setPlaylistReconciliation] = useState<string | null>(null);
  const [playbackRequest, setPlaybackRequest] = useState<MusicPlaybackRequest | null>(null);
  const authorityGeneration = JSON.stringify([scope.userDocumentId ?? null, scope.accountDocumentId ?? null]);
  const currentAuthorityGeneration = useRef(authorityGeneration);
  const playbackLifecycleGeneration = useRef(0);
  const currentPlaybackArbiter = useRef<ReturnType<typeof createMusicPlaybackArbiter> | null>(null);
  currentAuthorityGeneration.current = authorityGeneration;
  const queueRevision = useRef(data.dashboard?.queueRevision ?? 0);
  queueRevision.current = data.dashboard?.queueRevision ?? 0;
  const playbackRevision = useRef(data.dashboard?.playbackRevision ?? 0);
  playbackRevision.current = data.dashboard?.playbackRevision ?? 0;
  const playbackArbiter = useMemo(() => createMusicPlaybackArbiter({
    write: async (songId, expectedRevision, operation, signal, expectedPlaybackRevision) => {
      const authorityIsCurrent = () => currentAuthorityGeneration.current === authorityGeneration;
      if (!scope.userDocumentId || !scope.accountDocumentId || !authorityIsCurrent()) throw new Error("Music playback authority is unavailable.");
      try {
        return await completeQueueClient.setPlayingRevision(songId, expectedRevision, expectedPlaybackRevision, operationKey(`playback-${operation}`), signal);
      } catch (cause) {
        if (!(cause instanceof MusicClientError) || cause.status !== 409 || !["PLAYBACK_REVISION_CONFLICT", "PLAYBACK_QUEUE_REVISION_CONFLICT"].includes(cause.upstreamCode ?? "")) throw cause;
        if (!authorityIsCurrent()) throw new Error("Music playback authority changed.");
        const canonical = await completeQueueClient.loadDashboard();
        if (!authorityIsCurrent()) throw new Error("Music playback authority changed.");
        const canonicalSongId = canonical.currentlyPlaying?.id ?? null;
        const acknowledged = canonicalSongId === songId;
        return {
          revision: canonical.queueRevision,
          playbackRevision: canonical.playbackRevision ?? 0,
          acknowledged,
          retryable: !acknowledged && cause.upstreamCode === "PLAYBACK_QUEUE_REVISION_CONFLICT",
        };
      }
    },
    currentRevision: () => queueRevision.current,
    currentPlaybackRevision: () => playbackRevision.current,
    isAuthorityCurrent: () => currentAuthorityGeneration.current === authorityGeneration,
    onAcknowledged: (songId, requestId) => setPlaybackRequest(songId === null ? null : { songId, requestId, authorityGeneration }),
  }), [authorityGeneration, scope.accountDocumentId, scope.userDocumentId]);
  currentPlaybackArbiter.current = playbackArbiter;
  const beginPlaybackRequest = playbackArbiter.beginPlaybackRequest;
  const requestPlayback: MusicPlaybackCommand = playbackArbiter.requestPlayback;
  const createOpener = useRef<HTMLButtonElement>(null);
  const [createDialogOpener, setCreateDialogOpener] = useState<RefObject<HTMLButtonElement>>(createOpener);
  const sharingOpener = useRef<HTMLButtonElement>(null);
  const sharingMenuItem = useRef<HTMLButtonElement>(null);
  const active = data.playlists.find((playlist) => playlist.id === activeId);
  const refresh = async () => {
    await refreshMusicDashboard(data.refetch);
    setPlaylistReconciliation(null);
  };
  const reconcilePlaylist = async (message: string) => {
    try { await refresh(); return true; }
    catch { setPlaylistReconciliation(message); return false; }
  };

  useEffect(() => {
    const lifecycleGeneration = ++playbackLifecycleGeneration.current;
    setPlaybackRequest(null);
    return () => {
      queueMicrotask(() => {
        if (currentPlaybackArbiter.current !== playbackArbiter || playbackLifecycleGeneration.current === lifecycleGeneration) playbackArbiter.cancel();
      });
    };
  }, [playbackArbiter]);

  useEffect(() => {
    if (activeId !== undefined && !data.playlists.some((playlist) => playlist.id === activeId)) setActiveId(undefined);
  }, [activeId, data.playlists]);

  useEffect(() => {
    if (actionMenuOpen) sharingMenuItem.current?.focus();
  }, [actionMenuOpen]);

  const createAction = <div data-music-page-actions className="relative inline-flex w-full sm:w-auto">
    <button ref={createOpener} type="button" onClick={() => { setCreatePublic(false); setCreateDialogOpener(createOpener); setCreateOpen(true); }} disabled={readOnly} className={`${buttonClass} flex-1 rounded-r-none bg-dashboard-accent text-[var(--dash-accent-text)] sm:flex-none`}><Plus className="mr-2 inline h-4 w-4" />New playlist</button>
    <button ref={sharingOpener} type="button" aria-label="Open playlist and sharing menu" aria-expanded={actionMenuOpen} onClick={() => setActionMenuOpen((open) => !open)} disabled={readOnly} className={`${buttonClass} rounded-l-none border-l border-black/20 bg-dashboard-accent px-3 text-[var(--dash-accent-text)]`}><ChevronDown className="h-4 w-4" /></button>
    {actionMenuOpen && <div role="menu" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setActionMenuOpen(false); sharingOpener.current?.focus(); } }} className="absolute right-0 top-[calc(100%+0.5rem)] z-30 min-w-56 rounded-xl border border-dashboard bg-dashboard-sidebar p-2 shadow-xl">
      <button ref={sharingMenuItem} role="menuitem" type="button" onClick={() => { setActionMenuOpen(false); setCreatePublic(false); setCreateDialogOpener(sharingOpener); setCreateOpen(true); }} className={`${buttonClass} w-full bg-dashboard-muted text-left text-dashboard`}><ListMusic className="mr-2 inline h-4 w-4" />Private playlist</button>
      <button role="menuitem" type="button" onClick={() => { setActionMenuOpen(false); setCreatePublic(true); setCreateDialogOpener(sharingOpener); setCreateOpen(true); }} className={`${buttonClass} mt-1 w-full bg-dashboard-muted text-left text-dashboard`}><ListMusic className="mr-2 inline h-4 w-4" />Public playlist</button>
      <button role="menuitem" type="button" onClick={() => { setActionMenuOpen(false); if (origin) { setSharingOrigin(origin); setSharingOpen(true); } }} className={`${buttonClass} mt-1 w-full bg-dashboard-muted text-left text-dashboard`}><Settings2 className="mr-2 inline h-4 w-4" />Sharing settings</button>
    </div>}
  </div>;

  const playlistWorkspace = active ? <div>
    <button type="button" onClick={() => setActiveId(undefined)} className={`${buttonClass} mb-4 bg-dashboard-muted text-dashboard`}>← All playlists</button>
    {complete && <section aria-label={`Add songs to ${active.name}`} className="mb-5 rounded-2xl border border-dashboard bg-dashboard-sidebar p-4 md:p-5">
      <MusicSearch searchClient={completeSearchClient} queueClient={completeQueueClient} playlists={[{ id: active.id, name: active.name }]} playlistClient={musicWorkspaceClient} onChanged={refresh} />
    </section>}
    <PlaylistPanel playlist={active} queueRevision={data.dashboard?.queueRevision ?? 0} readOnly={readOnly} onChanged={refresh} onCommitted={reconcilePlaylist} announce={setAnnouncement} beginPlaybackRequest={beginPlaybackRequest} onPlaybackRequested={requestPlayback} onQueueRevisionAcknowledged={(revision) => { queueRevision.current = revision; }} />
  </div> : <MusicPlaylistCollection
    playlists={data.playlists}
    readOnly={readOnly}
    onSelect={(playlist) => setActiveId(playlist.id)}
    onCreate={() => { setCreatePublic(false); setCreateDialogOpener(createOpener); setCreateOpen(true); }}
    onVisibilityChange={async (playlist, visible) => {
      await musicWorkspaceClient.setPlaylistVisibility(playlist.id, visible, operationKey("playlist-visibility"));
      try { await refresh(); return undefined; }
      catch { return { reconciliationFailed: true }; }
    }}
    emptyAction={null}
  />;

  return (
    <div className="space-y-5">
      <section aria-label="Music publication" className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border border-dashboard bg-dashboard-sidebar p-4">
        <MusicPublishSwitch origin={origin} ready={publishReady} />
        {createAction}
      </section>
      {playlistReconciliation && <div role="alert" aria-label="Playlist reconciliation needed" className="rounded-xl border border-dashboard bg-dashboard-sidebar p-4 text-sm text-dashboard-light">
        <p>{playlistReconciliation}</p>
        <button type="button" onClick={() => void refresh().catch(() => undefined)} className={`${buttonClass} mt-3 bg-dashboard-muted text-dashboard`}>Retry loading playlists</button>
      </div>}
      {complete && <MusicSectionTabs value={section} onChange={(next) => { setSection(next); setActionMenuOpen(false); }} />}
      <section role={complete ? "tabpanel" : undefined} id="music-section-playlists-panel" aria-labelledby={complete ? "music-section-playlists" : undefined} hidden={complete && section !== "playlists"}>{playlistWorkspace}</section>
      {complete && <section role="tabpanel" id="music-section-live-panel" aria-labelledby="music-section-live" hidden={section !== "live"}><CompleteMusicDashboard data={data} readOnly={readOnly} playbackRequest={playbackRequest} authorityGeneration={authorityGeneration} beginPlaybackRequest={beginPlaybackRequest} onPlaybackRequested={requestPlayback} /></section>}

      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
      {createOpen && <CreatePlaylistDialog makePublic={createPublic} onClose={() => setCreateOpen(false)} opener={createDialogOpener} onCreated={reconcilePlaylist} />}
      {sharingOpen && sharingOrigin && <SharingDialog data={data} origin={sharingOrigin} ready={publishReady} onClose={() => { setSharingOpen(false); setSharingOrigin(undefined); }} opener={sharingOpener} />}
    </div>
  );
}
