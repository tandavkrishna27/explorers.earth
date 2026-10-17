export type AuthoritativeAbsence = "absent" | "present" | "unknown" | "outage";

export interface ClaimedLifecycleDeletion {
  operationId: string;
  musicUserId: number | null;
  userDocumentId: string;
  accountDocumentId: string;
  attemptCount: number;
  leaseUpdatedAt: string;
}

interface LifecycleWorkerRepository {
  claimDueDeletions(input: { batchSize: number; maxAttempts: number }): Promise<ClaimedLifecycleDeletion[]>;
  finalizeDeletion(operation: ClaimedLifecycleDeletion): Promise<boolean>;
  recordDeletionObservation(operation: ClaimedLifecycleDeletion, observation: Exclude<AuthoritativeAbsence, "absent">, deadLetter: boolean): Promise<boolean | void>;
  recordDeletionFailure(operation: ClaimedLifecycleDeletion, stage: "observation" | "finalize", deadLetter: boolean): Promise<boolean | void>;
}

export function lifecycleBackoffMs(attempt: number): number {
  const boundedAttempt = Math.max(1, Math.min(20, Math.trunc(attempt)));
  return Math.min(300_000, 1_000 * 2 ** (boundedAttempt - 1));
}

export async function runMusicLifecycleWorkerOnce(input: {
  repository: LifecycleWorkerRepository;
  proveAbsence: (identity: { userDocumentId: string; accountDocumentId: string }) => Promise<AuthoritativeAbsence>;
  maxAttempts: number;
  batchSize: number;
}): Promise<{ claimed: number; finalized: number; deferred: number; deadLettered: number }> {
  let claimed = 0;
  let finalized = 0;
  let deferred = 0;
  let deadLettered = 0;
  for (let index = 0; index < input.batchSize; index += 1) {
    const operations = await input.repository.claimDueDeletions({ batchSize: 1, maxAttempts: input.maxAttempts });
    const operation = operations[0];
    if (!operation) break;
    claimed += 1;
    let observation: AuthoritativeAbsence;
    try {
      observation = await input.proveAbsence({
        userDocumentId: operation.userDocumentId,
        accountDocumentId: operation.accountDocumentId,
      });
    } catch {
      observation = "outage";
    }
    if (observation === "absent") {
      try {
        if (await input.repository.finalizeDeletion(operation)) finalized += 1;
      } catch {
        const deadLetter = operation.attemptCount >= input.maxAttempts;
        try {
          if (await input.repository.recordDeletionFailure(operation, "finalize", deadLetter) !== false) {
            if (deadLetter) deadLettered += 1;
            else deferred += 1;
          }
        } catch { /* the next bounded scan repairs or dead-letters the stale running lease */ }
      }
      continue;
    }
    const deadLetter = operation.attemptCount >= input.maxAttempts;
    try {
      if (await input.repository.recordDeletionObservation(operation, observation, deadLetter) !== false) {
        if (deadLetter) deadLettered += 1;
        else deferred += 1;
      }
    } catch {
      try {
        if (await input.repository.recordDeletionFailure(operation, "observation", deadLetter) !== false) {
          if (deadLetter) deadLettered += 1;
          else deferred += 1;
        }
      } catch { /* contain this item; do not abort later identities */ }
    }
  }
  return { claimed, finalized, deferred, deadLettered };
}

export async function manuallyRepairMusicDeletion(input: {
  operationId: string;
  rearmDeletion: (operationId: string) => Promise<boolean>;
}): Promise<boolean> {
  return input.rearmDeletion(input.operationId);
}

export function startMusicLifecycleWorker(input: {
  intervalMs: number;
  runOnce: () => Promise<void>;
  onError: (error: unknown) => void;
}): { stop(): void } {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1_000 || input.intervalMs > 3_600_000) {
    throw new Error("Music lifecycle worker interval is invalid");
  }
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void input.runOnce().catch(input.onError).finally(() => { running = false; });
  }, input.intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
