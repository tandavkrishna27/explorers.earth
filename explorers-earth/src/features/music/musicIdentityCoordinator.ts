export interface ExplorerAccountCandidate {
  id?: unknown;
  documentId?: unknown;
  Account_Name?: unknown;
  Account_Type?: unknown;
  mobile_number?: unknown;
}

export interface SelectedMusicAccount {
  documentId: string;
}

export interface SelectedExplorerAccountUploadTarget extends SelectedMusicAccount {
  id: string;
}

export type ExplorerAccountDocumentSelection =
  | { kind: "unknown" }
  | { kind: "missing" }
  | { kind: "incomplete" }
  | { kind: "ambiguous" }
  | { kind: "selected"; account: SelectedMusicAccount };

export type ExplorerAccountUploadTargetSelection =
  | { kind: "unknown" }
  | { kind: "missing" }
  | { kind: "incomplete" }
  | { kind: "ambiguous" }
  | { kind: "selected"; account: SelectedExplorerAccountUploadTarget };

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

export function selectExplorerAccountUploadTarget(
  accounts: readonly ExplorerAccountCandidate[] | null | undefined,
  accountDocumentId: string,
  options: { authoritative: boolean },
): ExplorerAccountUploadTargetSelection {
  if (!options.authoritative || !Array.isArray(accounts)) return { kind: "unknown" };
  if (accounts.length === 0) return { kind: "missing" };
  if (accounts.length > 1) return { kind: "ambiguous" };
  const candidate = accounts[0];
  if (candidate.documentId !== accountDocumentId) return { kind: "missing" };
  const rawId = candidate.id;
  const serializedId = typeof rawId === "number" ? String(rawId) : rawId;
  const numericId = typeof serializedId === "string" && /^[1-9]\d*$/.test(serializedId) ? Number(serializedId) : Number.NaN;
  if (!Number.isSafeInteger(numericId)) return { kind: "incomplete" };
  return { kind: "selected", account: { documentId: accountDocumentId, id: serializedId as string } };
}

export type ExplorerAccountSelection =
  | { kind: "unknown" }
  | { kind: "incomplete" }
  | { kind: "ambiguous" }
  | { kind: "selected"; account: SelectedMusicAccount };

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

export function selectCompletedAccount(accounts: readonly ExplorerAccountCandidate[] | null | undefined): SelectedMusicAccount | undefined {
  const selection = selectExplorerAccountState(accounts, { authoritative: Array.isArray(accounts) });
  return selection.kind === "selected" ? selection.account : undefined;
}

export interface MusicIdentityEligibility {
  provider: "google" | "email";
  authenticated: boolean;
  verified: boolean;
  userDocumentId?: string;
  account?: SelectedMusicAccount;
}

export interface MusicIdentityCoordinator {
  reconcile(input: MusicIdentityEligibility): Promise<void>;
  retry(): Promise<void>;
  reportFailure(error: unknown): void;
  reset(): void;
  getSnapshot(): MusicIdentityCoordinatorStatus;
  isReadyFor(scope: { userDocumentId: string; accountDocumentId: string }): boolean;
  getDiagnosticSnapshot(): MusicIdentityDiagnosticSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface MusicIdentityDiagnosticSnapshot {
  requestId?: string;
}

export type MusicIdentityCoordinatorStatus =
  | "idle" | "setting_up" | "ready" | "retryable" | "unavailable" | "conflict"
  | "auth_required" | "suspended" | "pending_deletion";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export function createMusicIdentityCoordinator(dependencies: {
  ensureIdentity: () => Promise<unknown>;
}): MusicIdentityCoordinator {
  let activeKey: string | undefined;
  let completedKey: string | undefined;
  let flight: Promise<void> | undefined;
  let lastEligible: MusicIdentityEligibility | undefined;
  let status: MusicIdentityCoordinatorStatus = "idle";
  let diagnostic: MusicIdentityDiagnosticSnapshot = Object.freeze({});
  let failedKey: string | undefined;
  let canRetry = false;
  let generation = 0;
  const listeners = new Set<() => void>();

  const publish = (next: MusicIdentityCoordinatorStatus) => {
    if (status === next) return;
    status = next;
    for (const listener of listeners) listener();
  };

  const publishDiagnostic = (requestId: unknown) => {
    const safeRequestId = typeof requestId === "string" && REQUEST_ID_PATTERN.test(requestId) ? requestId : undefined;
    if (diagnostic.requestId === safeRequestId) return;
    diagnostic = Object.freeze(safeRequestId ? { requestId: safeRequestId } : {});
    for (const listener of listeners) listener();
  };

  const eligibleKey = (input: MusicIdentityEligibility): string | undefined => {
    if (!input.authenticated || !input.verified || !input.userDocumentId || !input.account?.documentId) return undefined;
    return `${input.userDocumentId}:${input.account.documentId}`;
  };

  const publishFailure = (cause: unknown) => {
    const error = cause as { code?: unknown; upstreamCode?: unknown; retryable?: unknown; requestId?: unknown };
    const code = typeof error?.code === "string" ? error.code : "";
    const upstreamCode = typeof error?.upstreamCode === "string" ? error.upstreamCode : "";
    const canonicalCodes = new Set([code, upstreamCode]);
    canRetry = error?.retryable === true;
    publishDiagnostic(error?.requestId);
    if (canonicalCodes.has("IDENTITY_PENDING_DELETION") || canonicalCodes.has("IDENTITY_TOMBSTONED")) {
      canRetry = false;
      publish("pending_deletion");
    } else if (canonicalCodes.has("IDENTITY_SUSPENDED")) {
      canRetry = false;
      publish("suspended");
    } else if (code === "AUTH_REQUIRED" || upstreamCode === "AUTH_REQUIRED" || upstreamCode === "AUTH_INVALID") {
      canRetry = false;
      publish("auth_required");
    } else if (["IDENTITY_CONFLICT", "ACCOUNT_AMBIGUOUS", "ACCOUNT_SWITCH_CONFLICT"].includes(upstreamCode)) {
      canRetry = false;
      publish("conflict");
    }
    else {
      publish(canRetry ? "retryable" : "unavailable");
    }
  };

  const start = (key: string, force = false): Promise<void> => {
    if (!force && completedKey === key) return Promise.resolve();
    if (flight && activeKey === key) return flight;
    if (!force && failedKey === key) return Promise.resolve();
    if (activeKey !== key) {
      generation += 1;
      completedKey = undefined;
      failedKey = undefined;
      canRetry = false;
    }
    activeKey = key;
    const startedGeneration = generation;
    publishDiagnostic(undefined);
    publish("setting_up");
    const current = Promise.resolve(dependencies.ensureIdentity()).then(() => {
      if (generation !== startedGeneration) return;
      completedKey = key;
      failedKey = undefined;
      canRetry = false;
      publish("ready");
    }).catch((cause: unknown) => {
      if (generation !== startedGeneration) throw cause;
      failedKey = key;
      publishFailure(cause);
      throw cause;
    }).finally(() => {
      if (generation === startedGeneration && flight === current) flight = undefined;
    });
    flight = current;
    return current;
  };

  return {
    reconcile(input) {
      const key = eligibleKey(input);
      if (!key) return Promise.resolve();
      lastEligible = input;
      return start(key);
    },
    retry() {
      const key = lastEligible && eligibleKey(lastEligible);
      return key && (canRetry || status === "unavailable") ? start(key, true) : Promise.resolve();
    },
    reportFailure(error) {
      publishFailure(error);
    },
    reset() {
      generation += 1;
      activeKey = undefined;
      completedKey = undefined;
      failedKey = undefined;
      flight = undefined;
      lastEligible = undefined;
      canRetry = false;
      publishDiagnostic(undefined);
      publish("idle");
    },
    getSnapshot: () => status,
    // Read-only: a ready projection belongs to the exact completed owner scope.
    isReadyFor: (scope) => status === "ready" && completedKey === `${scope.userDocumentId}:${scope.accountDocumentId}`,
    getDiagnosticSnapshot: () => diagnostic,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
