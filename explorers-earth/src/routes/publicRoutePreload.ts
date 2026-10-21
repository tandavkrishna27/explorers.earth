/**
 * Dynamic imports for the top-level public tab routes, keyed by nav tab id.
 *
 * The router swaps the page for the Suspense fallback the moment a tab is
 * activated, so a tab whose chunk is still unfetched collapses the layout to the
 * spinner and then jumps again when the page arrives. PublicNav calls these once
 * the shell is ready so a tab's chunk is already resolved by the time it is
 * tapped. The specifiers must stay identical to the lazy() imports in
 * PublicRoutes.tsx so both resolve to the same module instance.
 */
export const PUBLIC_TAB_PRELOADERS: Readonly<Record<string, () => Promise<unknown>>> = {
  public_profile: () => import("../features/PublicHome/components/PublicProfile"),
  public_recommendations: () => import("../pages/public/PublicHomePage"),
  public_guides: () => import("../features/PublicHome/components/PublicGuides"),
  public_movie: () => import("../features/Movies"),
  public_books: () => import("../features/Books"),
  public_games: () => import("../features/Games"),
  public_apps: () => import("../features/AppsAndTools"),
  public_products: () => import("../features/Products"),
  public_people: () => import("../features/People"),
};

export function preloadPublicTabs(tabIds: readonly string[]): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  for (const id of tabIds) {
    // A failed preload is harmless: the real navigation retries the import and
    // the route error boundary reports it there.
    PUBLIC_TAB_PRELOADERS[id]?.().catch(() => undefined);
  }
}
