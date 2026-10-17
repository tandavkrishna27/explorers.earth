/**
 * Synchronous re-entrancy lock for the canonical onboarding save.
 *
 * Why a ref-backed lock and not the `isCreatingSubscription` state: React state
 * updates only on the next render, so a double-click can pass the state guard
 * twice before it flips. Two concurrent saves with the same account revision
 * would produce an avoidable conflict, and each might upload duplicate media.
 * The lock flips synchronously until the first caller releases it.
 */
export interface FinalizeLock {
  running: boolean;
}

export const createFinalizeLock = (): FinalizeLock => ({ running: false });

/**
 * Attempt to enter the finalize path.
 * @returns `true` if the caller acquired the lock (may proceed), `false` if a
 * finalize is already in flight (caller must bail out).
 */
export const beginFinalize = (lock: FinalizeLock): boolean => {
  if (lock.running) return false;
  lock.running = true;
  return true;
};

/** Release the lock so a later, legitimate finalize can run. Idempotent. */
export const endFinalize = (lock: FinalizeLock): void => {
  lock.running = false;
};
