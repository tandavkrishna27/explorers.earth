export function PublicMusicSkeleton({ announce = true }: { announce?: boolean }) {
  return <div data-music-skeleton className="public-music__skeleton" role={announce ? 'status' : undefined} aria-live={announce ? 'polite' : undefined} aria-hidden={!announce || undefined}>
    {announce && <span className="sr-only">Loading Music…</span>}
    <div aria-hidden="true"><div className="public-music__skeleton-search" /><div className="public-music__skeleton-artwork" />
      {[0, 1, 2, 3].map(index => <div key={index} className="public-music__skeleton-row" />)}
    </div>
  </div>;
}
