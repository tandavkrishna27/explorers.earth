/**
 * Shown while a route's code-split chunk is loading. Deliberately dependency-free (no
 * images, no animation library) so it can paint from the entry chunk alone.
 */
const RouteFallback = () => (
  <div role="status" aria-live="polite" aria-busy="true" className="flex min-h-[40vh] w-full items-center justify-center">
    <span className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-600" aria-hidden="true" />
    <span className="sr-only">Loading…</span>
  </div>
);

export default RouteFallback;
