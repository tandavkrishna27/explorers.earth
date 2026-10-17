import { EllipsisVertical } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { MusicSong } from "../musicWorkspaceClient";
import type { MusicPlaybackCommand } from "./musicPlaybackCommand";
import { MusicClientError } from "../../../lib/localTunesApiClient";

interface HistoryQueueClient {
  clearHistory(idempotencyKey: string): Promise<void>;
  removeHistorySong?(songId: number, idempotencyKey: string): Promise<void>;
  setPlaying?(songId: number | null, idempotencyKey: string): Promise<void | MusicSong>;
}

export interface MusicHistoryProps {
  songs: MusicSong[];
  loading?: boolean;
  queueClient: HistoryQueueClient;
  onChanged: () => void | Promise<void>;
  beginPlaybackRequest?: () => number;
  onPlaybackRequested?: MusicPlaybackCommand;
}

type FocusIntent =
  | { kind: "row"; id: number }
  | { kind: "header" }
  | { kind: "empty" }
  | { kind: "last-removal"; id: number };

export function MusicHistory({ songs, loading = false, queueClient, onChanged, beginPlaybackRequest, onPlaybackRequested }: MusicHistoryProps) {
  const [clearing, setClearing] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [openMenu, setOpenMenu] = useState<"header" | number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [focusAfterAction, setFocusAfterAction] = useState<FocusIntent | null>(null);
  const [error, setError] = useState("");
  const transientPanel = useRef<HTMLDivElement>(null);
  const clearDialog = useRef<HTMLDivElement>(null);
  const headerTrigger = useRef<HTMLButtonElement>(null);
  const emptyState = useRef<HTMLParagraphElement>(null);
  const lock = useRef(false);
  const pendingRemovalKeys = useRef(new Map<number, string>());
  const restoreAfterClear = useRef(false);
  const actionLocked = clearing || removingId !== null || playingId !== null;

  const restoreHeaderFocus = () => headerTrigger.current?.focus();
  const closeMenu = (focus: "header" | number | null = openMenu) => {
    setOpenMenu(null);
    if (focus === "header") restoreHeaderFocus();
    else if (typeof focus === "number") document.getElementById(`music-history-row-trigger-${focus}`)?.focus();
  };
  const closeClearDialog = () => {
    restoreAfterClear.current = false;
    setConfirmClear(false);
    restoreHeaderFocus();
  };

  useEffect(() => {
    if (openMenu === null && !confirmClear) return;
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (confirmClear) closeClearDialog(); else closeMenu();
    };
    const closeFromPointer = (event: PointerEvent) => {
      // The dialog owns its backdrop dismissal. A document-level listener would
      // also see clicks on dialog actions before their click handlers run.
      if (confirmClear) return;
      if (transientPanel.current?.contains(event.target as Node)) return;
      event.preventDefault();
      closeMenu();
    };
    document.addEventListener("keydown", closeFromKeyboard);
    document.addEventListener("pointerdown", closeFromPointer);
    return () => {
      document.removeEventListener("keydown", closeFromKeyboard);
      document.removeEventListener("pointerdown", closeFromPointer);
    };
  }, [openMenu, confirmClear]);

  useEffect(() => {
    if (focusAfterAction === null) return;
    if (focusAfterAction.kind === "empty") {
      if (songs.length !== 0) return;
      emptyState.current?.focus();
    } else if (focusAfterAction.kind === "last-removal") {
      if (songs.some((song) => song.id === focusAfterAction.id)) return;
      if (songs.length === 0) emptyState.current?.focus();
      else restoreHeaderFocus();
    } else if (focusAfterAction.kind === "header") {
      restoreHeaderFocus();
    } else {
      document.getElementById(`music-history-row-trigger-${focusAfterAction.id}`)?.focus();
    }
    setFocusAfterAction(null);
  }, [focusAfterAction, songs]);

  useEffect(() => {
    if (!confirmClear) return;
    clearDialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [confirmClear]);

  const clear = async () => {
    if (lock.current) return;
    lock.current = true;
    setClearing(true);
    setError("");
    try {
      try { await queueClient.clearHistory(`music-history-clear-${crypto.randomUUID()}`); }
      catch {
        setError("Could not clear history. Try again.");
        restoreAfterClear.current = false;
        setFocusAfterAction({ kind: "header" });
        return;
      }
      try { await onChanged(); }
      catch {
        setError("History cleared, but the latest history could not be loaded.");
        restoreAfterClear.current = false;
        setFocusAfterAction({ kind: "header" });
        return;
      }
    } finally {
      lock.current = false;
      setClearing(false);
      if (restoreAfterClear.current) {
        restoreAfterClear.current = false;
        setFocusAfterAction({ kind: "empty" });
      }
    }
  };

  const play = async (song: MusicSong) => {
    if (actionLocked || !queueClient.setPlaying) return;
    const requestId = beginPlaybackRequest?.() ?? 0;
    setPlayingId(song.id);
    setError("");
    try {
      const outcome = onPlaybackRequested
        ? await onPlaybackRequested(song.id, requestId, "history")
        : (await queueClient.setPlaying(song.id, `music-history-play-${crypto.randomUUID()}`), "acknowledged");
      if (outcome === "superseded") return;
    } catch {
      setError(`Could not play ${song.title}. Try again.`);
      return;
    } finally {
      setPlayingId(null);
    }
    try { await onChanged(); }
    catch { setError(`${song.title} is playing, but the latest history could not be loaded.`); }
  };

  const remove = async (song: MusicSong) => {
    if (actionLocked || !queueClient.removeHistorySong) return;
    const index = songs.findIndex(({ id }) => id === song.id);
    setOpenMenu(null);
    setRemovingId(song.id);
    setError("");
    const idempotencyKey = pendingRemovalKeys.current.get(song.id) ?? `music-history-remove-${crypto.randomUUID()}`;
    pendingRemovalKeys.current.set(song.id, idempotencyKey);
    try {
      try { await queueClient.removeHistorySong(song.id, idempotencyKey); }
      catch (cause) {
        if (cause instanceof MusicClientError && !cause.retryable && cause.status < 500) pendingRemovalKeys.current.delete(song.id);
        setError(`Could not remove ${song.title} from history. Try again.`);
        setFocusAfterAction({ kind: "row", id: song.id });
        return;
      }
      pendingRemovalKeys.current.delete(song.id);
      try { await onChanged(); }
      catch {
        setError(`${song.title} was removed from history, but the latest history could not be loaded.`);
        setFocusAfterAction({ kind: "header" });
        return;
      }
      const next = songs[index + 1];
      setFocusAfterAction(next ? { kind: "row", id: next.id } : { kind: "last-removal", id: song.id });
    } finally {
      setRemovingId(null);
    }
  };

  const onClearDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeClearDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(clearDialog.current?.querySelectorAll<HTMLElement>(
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

  if (loading) return <section aria-label="Recently played"><p role="status" aria-live="polite">Loading listening history…</p></section>;
  if (songs.length === 0) return <section aria-labelledby="music-history-heading">
    <h2 id="music-history-heading" className="text-xl font-semibold text-dashboard">Recently played</h2>
    <p ref={emptyState} role="status" tabIndex={-1} className="mt-3 text-sm text-dashboard-muted">Songs you finish will appear here.</p>
  </section>;

  return <section aria-labelledby="music-history-heading">
    <div className="flex items-center justify-between gap-3">
      <h2 id="music-history-heading" className="text-xl font-semibold text-dashboard">Recently played</h2>
      <div className="relative">
        <button ref={headerTrigger} type="button" aria-label="History actions" aria-haspopup="menu" aria-expanded={openMenu === "header"} aria-controls="music-history-header-menu" disabled={actionLocked} onClick={() => setOpenMenu(openMenu === "header" ? null : "header")} style={{ minWidth: "44px", minHeight: "44px" }} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-dashboard-muted hover:text-dashboard disabled:opacity-50">
          <EllipsisVertical aria-hidden="true" className="h-5 w-5" />
        </button>
        {openMenu === "header" && <div ref={transientPanel} id="music-history-header-menu" role="menu" aria-label="History actions" className="absolute right-0 z-10 min-w-40 rounded-lg border border-dashboard bg-dashboard p-1 shadow-lg">
          <button type="button" role="menuitem" disabled={actionLocked} onClick={() => { setOpenMenu(null); setConfirmClear(true); }} className="w-full rounded px-3 py-2 text-left text-sm hover:bg-dashboard-muted disabled:opacity-50">Clear history</button>
        </div>}
      </div>
    </div>
    <ul aria-label="Recently played songs" className="mt-3 divide-y divide-white/5">
      {songs.map((song) => <li key={song.id} className="flex min-h-16 items-center gap-3 py-2">
        <img src={song.thumbnailUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-dashboard">{song.title}</strong><span className="block truncate text-xs text-dashboard-muted">{song.artist}</span></span>
        <div className="relative">
          <button id={`music-history-row-trigger-${song.id}`} type="button" aria-label={`More actions for ${song.title}`} aria-haspopup="menu" aria-expanded={openMenu === song.id} aria-controls={`music-history-row-menu-${song.id}`} disabled={actionLocked} onClick={() => setOpenMenu(openMenu === song.id ? null : song.id)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-dashboard hover:bg-dashboard-muted disabled:opacity-50">
            <EllipsisVertical aria-hidden="true" className="h-5 w-5" />
          </button>
          {openMenu === song.id && <div ref={transientPanel} id={`music-history-row-menu-${song.id}`} role="menu" aria-label={`Actions for ${song.title}`} className="absolute right-0 z-10 min-w-44 rounded-lg border border-dashboard bg-dashboard p-1 shadow-lg">
            <button type="button" role="menuitem" disabled={actionLocked || !queueClient.setPlaying} onClick={() => { closeMenu(song.id); void play(song); }} className="w-full rounded px-3 py-2 text-left text-sm hover:bg-dashboard-muted disabled:opacity-50">Play again</button>
            <button type="button" role="menuitem" disabled={actionLocked || !queueClient.removeHistorySong} onClick={() => { void remove(song); }} className="w-full rounded px-3 py-2 text-left text-sm hover:bg-dashboard-muted disabled:opacity-50">Remove from history</button>
          </div>}
        </div>
      </li>)}
    </ul>
    {confirmClear && <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeClearDialog(); }}>
      <div ref={clearDialog} role="dialog" aria-modal="true" aria-labelledby="music-history-clear-title" onKeyDown={onClearDialogKeyDown} className="w-full max-w-sm rounded-xl bg-dashboard p-5 shadow-xl">
        <h3 id="music-history-clear-title" className="text-lg font-semibold text-dashboard">Clear history</h3>
        <p className="mt-2 text-sm text-dashboard-muted">Remove every song from your listening history?</p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" data-autofocus disabled={clearing} onClick={closeClearDialog} className="min-h-11 rounded-lg px-3 text-sm text-dashboard-muted hover:text-dashboard">Cancel</button>
          <button type="button" disabled={clearing} onClick={() => { restoreAfterClear.current = true; setConfirmClear(false); void clear(); }} className="min-h-11 rounded-lg bg-red-600 px-3 text-sm text-white disabled:opacity-50">Clear history</button>
        </div>
      </div>
    </div>}
    {clearing && <p role="status" aria-live="polite">Clearing history…</p>}
    {removingId !== null && <p role="status" aria-live="polite">Removing from history…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
