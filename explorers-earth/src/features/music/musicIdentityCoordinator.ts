import {
  selectExplorerAccountDocument,
  selectExplorerAccountUploadTarget,
  selectExplorerAccountState,
  selectCompletedAccount,
  type ExplorerAccountCandidate,
  type SelectedExplorerAccount,
  type SelectedExplorerAccountUploadTarget,
  type ExplorerAccountDocumentSelection,
  type ExplorerAccountUploadTargetSelection,
  type ExplorerAccountSelection,
} from "../../lib/explorerAccountSelection";

export {
  selectExplorerAccountDocument,
  selectExplorerAccountUploadTarget,
  selectExplorerAccountState,
  selectCompletedAccount,
  type ExplorerAccountCandidate,
  type SelectedExplorerAccountUploadTarget,
  type ExplorerAccountDocumentSelection,
  type ExplorerAccountUploadTargetSelection,
  type ExplorerAccountSelection,
};
export type SelectedMusicAccount = SelectedExplorerAccount;

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
