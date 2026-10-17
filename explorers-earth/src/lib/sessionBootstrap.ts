import { useEffect } from "react";
import useAuthStore from "../store/store";
import { authClient } from "./authClient";

/**
 * Bootstraps cookie authority exactly once per page load, for the surfaces that need it.
 *
 * This used to run unconditionally at the app root, which meant every anonymous visitor to
 * a public profile issued an auth request on the most cacheable pages in the product. No
 * public surface reads auth state - PublicLayout does not render Header, and nothing under
 * features/PublicHome, layouts or routes/validators touches the store - so a public view
 * has nothing to bootstrap for.
 *
 * It cannot simply be dropped from the root either. ProtectedRoute, GuestRoute and
 * ReactivateConfirm all gate on a terminal status, and GuestRoute wraps "/" and "/login"
 * while ReactivateConfirm sits outside ProtectedRoute, so removing the root bootstrap
 * without giving it to each of them leaves those pages on an EarthLoader forever. The
 * invariant to hold on every path: a surface that gates on status must also ensure the
 * status will settle.
 *
 * The guard is module-level rather than a ref so two gates mounting in the same commit
 * cannot both fire, and `started` is reset by resetSessionBootstrapForTests.
 */
let started = false;

export function ensureSessionBootstrap(): void {
  if (started) return;
  // Bootstrapping means establishing initial authority. If the store has already settled
  // there is nothing to establish, and starting a verification anyway would bump the
  // generation - which ReactivateConfirm reads as its recovery custody being invalidated.
  if (useAuthStore.getState().status !== "loading") return;
  started = true;
  void authClient.refresh();
}

/** Tests mount these gates repeatedly in one process, where a page load would be once. */
export function resetSessionBootstrapForTests(): void {
  started = false;
}

/**
 * Call from any surface that gates on auth status, so the status is guaranteed to settle.
 *
 * Fires on mount; ensureSessionBootstrap decides whether there is anything to do. A real
 * page load always starts at "loading", so this bootstraps exactly once; a client-side
 * navigation arrives with the store already settled and correctly does nothing.
 */
export function useSessionBootstrap(): void {
  useEffect(() => { ensureSessionBootstrap(); }, []);
}
