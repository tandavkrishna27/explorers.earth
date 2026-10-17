import { useRef, type ReactNode } from "react";

export interface MusicWorkspaceShellProps {
  player: ReactNode; search: ReactNode; queue: ReactNode; history: ReactNode;
  guestControls?: ReactNode;
  loading?: boolean; stale?: boolean; empty?: boolean;
}

/**
 * Decision D1, 2026-10-08. Guest song requests are capped at this many per venue per
 * calendar month, and the surface is labelled beta while that holds.
 *
 * The number is stated rather than hidden behind the word "beta": an owner who hits the
 * ceiling mid-month should have been able to see it coming. The server is the authority
 * (MONTHLY_GUEST_REQUEST_CAP in musicDomainRepository) and refuses with a 429 naming the
 * same figure; this is the copy, not the control.
 */
const MONTHLY_GUEST_REQUEST_CAP = 100;

export function MusicWorkspaceShell({ player, search, queue, history, guestControls, loading = false, stale = false, empty = false }: MusicWorkspaceShellProps) {
  const searchRegion = useRef<HTMLElement>(null);
  return <div role="region" aria-label="Music workspace" aria-readonly={stale || undefined} className="relative max-w-full overflow-x-hidden pb-4 md:pb-0">
    <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-dashboard-light">
      <span className="rounded-full border border-dashboard px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">Beta</span>
      <span>Guests can request up to {MONTHLY_GUEST_REQUEST_CAP} songs a month.</span>
    </p>
    {loading && <p role="status" aria-live="polite" className="mb-3 text-sm text-dashboard-light">Refreshing Music…</p>}
    {stale && <p role="status" className="mb-3 rounded-xl border border-dashboard p-3 text-sm text-dashboard-light">Showing saved Music. Changes are unavailable until the connection returns.</p>}
    <section ref={searchRegion} id="music-search-region" aria-label="Music search region" className="rounded-2xl border border-dashboard bg-dashboard-sidebar p-4 md:p-5">{search}</section>
    <section id="music-player-region" aria-label="Music player region" className="sticky top-16 z-20 mt-5 rounded-2xl border border-dashboard bg-dashboard-sidebar p-4 shadow-lg md:static md:p-5">{player}</section>
    {empty && <section className="mt-5 rounded-2xl border border-dashboard bg-dashboard-sidebar p-6 text-center"><h2 className="text-xl font-semibold">Your queue is ready</h2><p className="mt-2 text-dashboard-light">Find something you love and start listening.</p><button type="button" onClick={() => searchRegion.current?.querySelector<HTMLElement>('input[type="search"], input, button, [tabindex]:not([tabindex="-1"])')?.focus()} className="mt-4 min-h-11 min-w-11 rounded-xl bg-dashboard-accent px-4 font-semibold text-[var(--dash-accent-text)]">Add your first song</button></section>}
    <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
      <section aria-label="Up next" className="min-w-0 rounded-2xl border border-dashboard bg-dashboard-sidebar p-4 md:p-5">{queue}</section>
      <div className="grid min-w-0 content-start gap-5">
        <section aria-label="Guest controls" className="min-w-0 rounded-2xl border border-dashboard bg-dashboard-sidebar p-4 md:p-5">{guestControls}</section>
        <section aria-label="Recently played panel" className="min-w-0 rounded-2xl border border-dashboard bg-dashboard-sidebar p-4 md:p-5">{history}</section>
      </div>
    </div>
  </div>;
}
