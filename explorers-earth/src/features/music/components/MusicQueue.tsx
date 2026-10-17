import { useEffect, useRef, useState } from "react";
import { GripVertical, MoreHorizontal, Play, Trash2 } from "lucide-react";
import type { MusicSong } from "../musicWorkspaceClient";
import type { MusicPlaybackCommand } from "./musicPlaybackCommand";

type QueueClient = {
  setPlaying(songId: number | null, idempotencyKey: string): Promise<void | MusicSong>;
  removeSong(songId: number, idempotencyKey: string): Promise<void>;
  removeSongs(songIds: number[], idempotencyKey: string): Promise<void>;
  moveSong(songId: number, position: number, idempotencyKey: string): Promise<MusicSong>;
};
export interface MusicQueueProps {
  songs: MusicSong[];
  client: QueueClient;
  onChanged: () => void | Promise<void>;
  beginPlaybackRequest?: () => number;
  onPlaybackRequested?: MusicPlaybackCommand;
}
const key = (operation: string) => `music-${operation}-${crypto.randomUUID()}`;

export function MusicQueue({ songs, client, onChanged, beginPlaybackRequest, onPlaybackRequested }: MusicQueueProps) {
  const [ordered, setOrdered] = useState(songs);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<number | null>(null);
  const [clearConfirmation, setClearConfirmation] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const canonicalRevision = useRef(0);
  const operationRevision = useRef(0);
  const rowMenuContainer = useRef<HTMLDivElement>(null);
  const headerMenuContainer = useRef<HTMLDivElement>(null);
  const headerMenuTrigger = useRef<HTMLButtonElement>(null);
  const focusRowMenuOpener = (songId: number) => {
    queueMicrotask(() => document.getElementById(`queue-row-trigger-${songId}`)?.focus());
  };
  const closeHeaderMenu = () => {
    setMenuOpen(false);
    queueMicrotask(() => headerMenuTrigger.current?.focus());
  };
  useEffect(() => {
    if (!menuOpen) return;
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeHeaderMenu();
    };
    const closeFromPointer = (event: MouseEvent) => {
      if (headerMenuContainer.current?.contains(event.target as Node) || headerMenuTrigger.current?.contains(event.target as Node)) return;
      closeHeaderMenu();
    };
    document.addEventListener("keydown", closeFromKeyboard);
    document.addEventListener("mousedown", closeFromPointer);
    return () => {
      document.removeEventListener("keydown", closeFromKeyboard);
      document.removeEventListener("mousedown", closeFromPointer);
    };
  }, [menuOpen]);
  useEffect(() => {
    if (rowMenuId === null) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setRowMenuId(null);
      focusRowMenuOpener(rowMenuId);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [rowMenuId]);
  useEffect(() => {
    if (rowMenuId === null) return;
    const closeOutside = (event: MouseEvent) => {
      if (rowMenuContainer.current?.contains(event.target as Node)) return;
      setRowMenuId(null);
      focusRowMenuOpener(rowMenuId);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [rowMenuId]);
  useEffect(() => {
    canonicalRevision.current += 1;
    setOrdered(songs);
  }, [songs]);

  async function mutate(operation: () => Promise<unknown>, failure = "Queue update failed. Try again.", committedFailure = "Queue updated, but the latest queue could not be loaded.") {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await operation();
      try { await onChanged(); }
      catch { setError(committedFailure); }
      return true;
    } catch {
      setError(failure);
      try { await onChanged(); } catch { /* The visible error already contains reconciliation failure. */ }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, target: number) {
    if (busy || target < 0 || target >= ordered.length || ordered[index]?.status !== "queued" || ordered[target]?.status !== "queued") return;
    const previous = ordered;
    const canonicalAtStart = canonicalRevision.current;
    const operation = ++operationRevision.current;
    const next = [...ordered];
    const [song] = next.splice(index, 1);
    next.splice(target, 0, song);
    setOrdered(next);
    setAnnouncement(`Moved ${song.title} to position ${target + 1}.`);
    setBusy(true);
    setError(null);
    try {
      await client.moveSong(song.id, target, key("move"));
    } catch {
      if (operationRevision.current === operation && canonicalRevision.current === canonicalAtStart) setOrdered(previous);
      setAnnouncement(`Could not move ${song.title}; the previous order was restored.`);
      setError("Queue update failed. Try again.");
      try { await onChanged(); } catch { /* The visible error contains reconciliation failure. */ }
      if (operationRevision.current === operation) setBusy(false);
      return;
    }
    try { await onChanged(); }
    catch {
      setAnnouncement(`${song.title} moved, but the latest queue could not be loaded.`);
      setError("Queue reordered, but the latest queue could not be loaded.");
    } finally {
      if (operationRevision.current === operation) setBusy(false);
    }
  }

  async function play(song: MusicSong) {
    if (busy) return;
    const requestId = beginPlaybackRequest?.() ?? 0;
    setBusy(true); setError(null);
    try {
      const outcome = onPlaybackRequested
        ? await onPlaybackRequested(song.id, requestId, "queue")
        : (await client.setPlaying(song.id, key("play")), "acknowledged");
      if (outcome === "superseded") { setBusy(false); return; }
    }
    catch {
      setError("Could not play this song. Try again.");
      try { await onChanged(); } catch { /* Reconciliation is best effort after a rejected write. */ }
      setBusy(false);
      return;
    }
    try { await onChanged(); }
    catch { setError("Song changed, but the latest queue could not be loaded."); }
    finally { setBusy(false); }
  }

  const selectedIds = ordered.filter((song) => selected.has(song.id)).map((song) => song.id);
  const closeRowMenu = () => setRowMenuId(null);
  return <section aria-labelledby="music-queue-heading" className="space-y-4">
    <div className="relative flex items-center justify-between"><div><h2 id="music-queue-heading" className="text-xl font-semibold">Queue</h2><p className="text-xs text-dashboard-muted">{ordered.length} {ordered.length === 1 ? "song" : "songs"}</p></div><button ref={headerMenuTrigger} type="button" aria-label="Queue actions" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="music-queue-actions-menu" onClick={() => { setMenuOpen((open) => !open); setClearConfirmation(false); }} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-dashboard-muted"><MoreHorizontal className="h-5 w-5" /></button>{menuOpen && <div ref={headerMenuContainer} id="music-queue-actions-menu" role="menu" className="absolute right-0 top-12 z-30 min-w-52 rounded-xl border border-dashboard bg-dashboard-sidebar p-2 shadow-xl"><button role="menuitem" type="button" onClick={() => { setReordering((value) => !value); setMenuOpen(false); }} className="min-h-11 w-full rounded-lg px-3 text-left hover:bg-dashboard-muted">{reordering ? "Done reordering" : "Reorder queue"}</button><button role="menuitem" type="button" onClick={() => { setSelecting((value) => !value); setMenuOpen(false); if (selecting) setSelected(new Set()); }} className="min-h-11 w-full rounded-lg px-3 text-left hover:bg-dashboard-muted">{selecting ? "Done selecting" : "Select songs"}</button><button role="menuitem" type="button" disabled={!selectedIds.length || busy} onClick={() => { setMenuOpen(false); void mutate(async () => { await client.removeSongs(selectedIds, key("remove-many")); setSelected(new Set()); setSelecting(false); }); }} className="min-h-11 w-full rounded-lg px-3 text-left disabled:opacity-50 hover:bg-dashboard-muted">Remove {selectedIds.length} selected</button><button role="menuitem" type="button" disabled={!ordered.length || busy} onClick={() => { if (!clearConfirmation) { setClearConfirmation(true); return; } setMenuOpen(false); setClearConfirmation(false); void mutate(() => client.removeSongs(ordered.map((song) => song.id), key("clear"))); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-red-400 disabled:opacity-50 hover:bg-dashboard-muted"><Trash2 className="h-4 w-4" />{clearConfirmation ? "Confirm clear queue" : "Clear queue"}</button></div>}</div>
    <div role="status" aria-live="polite" className="sr-only">{busy ? "Updating queue" : announcement}</div>
    {error && <p role="alert">{error}</p>}
    {ordered.length === 0 ? <p>Your queue is empty.</p> : <>
      <ul className="divide-y divide-white/5">{ordered.map((song, index) => <li key={song.id} aria-label={`${song.title} by ${song.artist}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const source = ordered.findIndex((item) => item.id === draggingId); setDraggingId(null); if (source >= 0 && source !== index) void move(source, index); }} className={`flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 ${draggingId === song.id ? "opacity-50" : ""}`}>
        {selecting && <input type="checkbox" aria-label={`Select ${song.title}`} checked={selected.has(song.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(song.id)) next.delete(song.id); else next.add(song.id); return next; })} className="h-5 w-5 accent-dashboard-accent" />}
        <span role="button" tabIndex={reordering && song.status === "queued" ? 0 : -1} draggable={reordering && song.status === "queued" && !busy} aria-label={`Reorder ${song.title}`} onDragStart={() => setDraggingId(song.id)} onDragEnd={() => setDraggingId(null)} onKeyDown={(event) => { if (!reordering) return; if (event.key === "ArrowUp") { event.preventDefault(); void move(index, index - 1); } if (event.key === "ArrowDown") { event.preventDefault(); void move(index, index + 1); } }} className={`${reordering ? "inline-flex" : "hidden"} min-h-11 min-w-11 cursor-grab items-center justify-center rounded-lg text-dashboard-muted focus-visible:ring-2 focus-visible:ring-dashboard-accent`}><GripVertical className="h-5 w-5" /></span>
        <img src={song.thumbnailUrl} alt="" className="h-11 w-11 rounded-lg object-cover" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-dashboard">{song.title}</strong><span className="block truncate text-xs text-dashboard-muted">{song.artist}</span></span>
        <button type="button" disabled={busy} onClick={() => void play(song)} aria-label={`Play ${song.title}`} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-dashboard hover:bg-dashboard-muted"><Play className="ml-0.5 h-4 w-4 fill-current" /></button>
        <div ref={rowMenuId === song.id ? rowMenuContainer : undefined} className="relative shrink-0"><button id={`queue-row-trigger-${song.id}`} type="button" disabled={busy} aria-label={`Queue actions for ${song.title}`} aria-haspopup="menu" aria-expanded={rowMenuId === song.id} aria-controls={`queue-row-menu-${song.id}`} onClick={() => setRowMenuId((open) => open === song.id ? null : song.id)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-dashboard-muted"><MoreHorizontal className="h-5 w-5" /></button>{rowMenuId === song.id && <div id={`queue-row-menu-${song.id}`} role="menu" className="absolute right-0 top-12 z-30 min-w-44 rounded-xl border border-dashboard bg-dashboard-sidebar p-2 shadow-xl"><button role="menuitem" type="button" disabled={busy} onClick={() => { closeRowMenu(); void play(song).finally(() => focusRowMenuOpener(song.id)); }} className="min-h-11 w-full rounded-lg px-3 text-left hover:bg-dashboard-muted">Play now</button><button role="menuitem" type="button" disabled={busy} onClick={() => { closeRowMenu(); void mutate(() => client.removeSong(song.id, key("remove"))).finally(() => focusRowMenuOpener(song.id)); }} className="min-h-11 w-full rounded-lg px-3 text-left text-red-400 hover:bg-dashboard-muted">Remove from queue</button></div>}</div>
      </li>)}</ul>
    </>}
  </section>;
}
