export type AccountAction = "use" | "abort";

/**
 * The canonical auth boundary provisions exactly one account. Onboarding can
 * update that account only after an authoritative owner read; absence or a
 * failed read is retryable and must never create a second account.
 */
export const decideAccountAction = (
  accountDocId: string | null | undefined,
  _existenceCheckSucceeded: boolean
): AccountAction => {
  if (accountDocId) return "use";
  return "abort";
};
