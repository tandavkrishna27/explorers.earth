/**
 * Selection of the signed-in user's single Explorer account from the account candidates
 * the profile query returns. Moved out of the Music feature in P3-3: navigation, settings and
 * the profile page use it, and none of it is about Music.
 */
export interface ExplorerAccountCandidate {
  id?: unknown;
  documentId?: unknown;
  Account_Name?: unknown;
  Account_Type?: unknown;
  mobile_number?: unknown;
}

export interface SelectedExplorerAccount {
  documentId: string;
}

export type ExplorerAccountDocumentSelection =
  | { kind: "unknown" }
  | { kind: "missing" }
  | { kind: "incomplete" }
  | { kind: "ambiguous" }
  | { kind: "selected"; account: SelectedExplorerAccount };

export function selectExplorerAccountDocument(
  accounts: readonly ExplorerAccountCandidate[] | null | undefined,
  options: { authoritative: boolean },
): ExplorerAccountDocumentSelection {
  if (!options.authoritative || !Array.isArray(accounts)) return { kind: "unknown" };
  if (accounts.length === 0) return { kind: "missing" };
  const candidates = accounts.filter((account) =>
    typeof account.documentId === "string" && account.documentId.length > 0,
  );
  if (candidates.length !== accounts.length) return { kind: "incomplete" };
  if (candidates.length > 1) return { kind: "ambiguous" };
  return { kind: "selected", account: { documentId: candidates[0].documentId as string } };
}

export type ExplorerAccountSelection =
  | { kind: "unknown" }
  | { kind: "incomplete" }
  | { kind: "ambiguous" }
  | { kind: "selected"; account: SelectedExplorerAccount };

export function selectExplorerAccountState(
  accounts: readonly ExplorerAccountCandidate[] | null | undefined,
  options: { authoritative: boolean },
): ExplorerAccountSelection {
  if (!options.authoritative || !Array.isArray(accounts)) return { kind: "unknown" };
  const complete = accounts.filter((account) =>
    typeof account.documentId === "string" && account.documentId.length > 0
    && typeof account.Account_Name === "string" && account.Account_Name.trim().length > 0
    && typeof account.Account_Type === "string" && account.Account_Type.trim().length > 0
    && typeof account.mobile_number === "string" && account.mobile_number.trim().length > 0,
  );
  if (complete.length === 1) return { kind: "selected", account: { documentId: complete[0].documentId as string } };
  if (complete.length > 1) return { kind: "ambiguous" };
  return { kind: "incomplete" };
}

export function selectCompletedAccount(accounts: readonly ExplorerAccountCandidate[] | null | undefined): SelectedExplorerAccount | undefined {
  const selection = selectExplorerAccountState(accounts, { authoritative: Array.isArray(accounts) });
  return selection.kind === "selected" ? selection.account : undefined;
}
