import { useEffect, useMemo, useRef, useState } from "react";
import { ListMusic, Plus, Search } from "lucide-react";
import type { MusicPlaylist } from "../musicWorkspaceClient";
import Switch from "../../../components/ui/Switch";

export function MusicPlaylistCollection({ playlists, onSelect, onVisibilityChange, onCreate, emptyAction, readOnly = false }: {
  playlists: MusicPlaylist[];
  onSelect: (playlist: MusicPlaylist) => void;
  onVisibilityChange: (playlist: MusicPlaylist, visible: boolean) => void | Promise<void | { reconciliationFailed?: boolean }>;
  onCreate: () => void;
  emptyAction: React.ReactNode;
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<Record<number, boolean>>({});
  const [pending, setPending] = useState<Set<number>>(new Set());
  const pendingRef = useRef(new Set<number>());
  const unreconciledRef = useRef(new Set<number>());
  const canonicalVisibilityRef = useRef(new Map<number, boolean>());
  canonicalVisibilityRef.current = new Map(playlists.map((playlist) => [playlist.id, playlist.isVisibleToGuests]));
  const [errors, setErrors] = useState<Record<number, string>>({});
  useEffect(() => {
    setVisibility((current) => Object.fromEntries(Object.entries(current).filter(([rawId, optimistic]) => {
      const id = Number(rawId);
      if (pendingRef.current.has(id)) return true;
      if (!unreconciledRef.current.has(id)) return false;
      const canonical = playlists.find((playlist) => playlist.id === id);
      if (!canonical || canonical.isVisibleToGuests === optimistic) {
        unreconciledRef.current.delete(id);
        return false;
      }
      return true;
    })));
  }, [playlists]);
  const changeVisibility = async (playlist: MusicPlaylist, next: boolean) => {
    if (pendingRef.current.has(playlist.id)) return;
    pendingRef.current.add(playlist.id);
    unreconciledRef.current.delete(playlist.id);
    setVisibility((current) => ({ ...current, [playlist.id]: next }));
    setPending((current) => new Set(current).add(playlist.id));
    setErrors((current) => { const copy = { ...current }; delete copy[playlist.id]; return copy; });
    try {
      const outcome = await onVisibilityChange(playlist, next);
      if (outcome?.reconciliationFailed) {
        unreconciledRef.current.add(playlist.id);
        setErrors((current) => ({ ...current, [playlist.id]: `${playlist.name} visibility was saved, but the latest playlists could not be loaded.` }));
      }
    }
    catch {
      unreconciledRef.current.delete(playlist.id);
      setVisibility((current) => ({ ...current, [playlist.id]: canonicalVisibilityRef.current.get(playlist.id) ?? playlist.isVisibleToGuests }));
      setErrors((current) => ({ ...current, [playlist.id]: `${playlist.name} visibility could not be saved. Try again.` }));
    } finally {
      pendingRef.current.delete(playlist.id);
      setPending((current) => { const copy = new Set(current); copy.delete(playlist.id); return copy; });
    }
  };
  const visible = useMemo(() => playlists.filter((playlist) => `${playlist.name} ${playlist.description ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [playlists, query]);
  if (!playlists.length) return <div><div className="mb-5 flex justify-end">{emptyAction}</div><section className="rounded-2xl border border-dashboard bg-dashboard-sidebar px-5 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-dashboard-muted text-dashboard-accent"><ListMusic className="h-6 w-6" /></div><h2 className="mt-4 text-xl font-semibold text-dashboard">Create your first playlist</h2><p className="mx-auto mt-2 max-w-md text-base text-dashboard-muted">Build a playlist to collect and share the music you love.</p><p className="mt-4 text-sm text-dashboard-muted">Use New playlist above to choose private or public visibility.</p></section></div>;

  return <div className="min-w-0">
    <div><h2 className="text-2xl font-semibold text-dashboard">Your playlists</h2><p className="mt-1 text-sm text-dashboard-muted">{playlists.length} {playlists.length === 1 ? "playlist" : "playlists"}</p></div>
    <div className="mt-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center"><label className="relative block min-w-0 flex-1"><span className="sr-only">Search playlists</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dashboard-muted" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search playlists…" className="min-h-11 w-full rounded-xl border border-dashboard bg-dashboard-sidebar pl-10 pr-3 text-dashboard outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent" /></label><div className="shrink-0">{emptyAction}</div></div>
    <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {visible.map((playlist) => { const checked = visibility[playlist.id] ?? playlist.isVisibleToGuests; const errorId = `music-playlist-visibility-error-${playlist.id}`; return <article key={playlist.id} className="group min-w-0 w-full rounded-2xl border border-dashboard bg-dashboard-sidebar p-5 transition-transform hover:-translate-y-0.5 motion-reduce:transition-none">
        <div className="flex min-w-0 items-start justify-between gap-3"><button type="button" onClick={() => onSelect(playlist)} className="min-w-0 flex-1 overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"><span className="flex min-w-0 items-center gap-2"><strong className="min-w-0 truncate text-base text-dashboard">{playlist.name}</strong><span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white ${checked ? "bg-emerald-500/90" : "bg-slate-500/90"}`}>{checked ? "PUBLIC" : "DRAFT"}</span></span><span className="mt-1 block line-clamp-2 min-h-8 text-xs text-dashboard-muted">{playlist.description || "A saved Music playlist."}</span></button><Switch checked={checked} onChange={(next) => void changeVisibility(playlist, next)} disabled={readOnly} loading={pending.has(playlist.id)} ariaLabel={`Make ${playlist.name} ${checked ? "private" : "public"}`} ariaDescribedBy={errors[playlist.id] ? errorId : undefined} /></div>
        {pending.has(playlist.id) && <p role="status" className="sr-only">Updating {playlist.name} visibility…</p>}
        {errors[playlist.id] && <p id={errorId} role="alert" className="mt-2 text-sm text-red-400">{errors[playlist.id]}</p>}
        <button type="button" onClick={() => onSelect(playlist)} aria-label={`Open ${playlist.name}`} className="mt-4 block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"><span className="flex gap-1.5">{playlist.songs.slice(0, 4).map((song) => <img key={song.id} src={song.thumbnailUrl} alt="" className="h-16 min-w-0 flex-1 rounded-lg object-cover" />)}{playlist.songs.length === 0 && <span className="flex h-16 w-full items-center justify-center rounded-lg bg-dashboard-muted"><ListMusic aria-hidden="true" className="h-6 w-6 text-dashboard-muted" /></span>}</span><span className="mt-4 block text-xs text-dashboard-muted">{playlist.songs.length} {playlist.songs.length === 1 ? "song" : "songs"}</span></button>
      </article>; })}
      <button type="button" aria-label="Add new playlist" onClick={onCreate} disabled={readOnly} className="flex min-h-44 min-w-0 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-dashboard p-5 text-dashboard-muted outline-none hover:border-dashboard-accent hover:text-dashboard focus-visible:ring-2 focus-visible:ring-dashboard-accent disabled:cursor-not-allowed disabled:opacity-50"><Plus aria-hidden="true" className="h-6 w-6" /><span className="text-sm">Add new playlist</span></button>
    </div>{!visible.length && <div role="status" className="mt-5 rounded-2xl border border-dashboard bg-dashboard-sidebar p-8 text-center text-dashboard-muted">No playlists match your search.</div>}
  </div>;
}
