export type AccountAction = "use" | "create" | "abort";

/**
 * Decide what the onboarding finalizer should do about the user's Account.
 *
 * The finalizer first tries to look up an existing Account. If that lookup
 * FAILS (network blip, 5xx), we must not blindly create a new one — the user
 * may already have an account, and creating another produces a duplicate (and
 * `accounts[0]` is unordered, so the incomplete one can win). So:
 *
 *  - an account doc id is known            -> "use"    (never create a second)
 *  - no account AND the lookup succeeded   -> "create" (confirmed none exists)
 *  - no account AND the lookup failed      -> "abort"  (can't verify; retry)
 */
export const decideAccountAction = (
  accountDocId: string | null | undefined,
  existenceCheckSucceeded: boolean
): AccountAction => {
  if (accountDocId) return "use";
  return existenceCheckSucceeded ? "create" : "abort";
};
