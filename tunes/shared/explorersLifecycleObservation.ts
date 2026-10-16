// zod/v3, not "zod": explorers-earth carries zod 4 and tunes carries zod 3, and every
// shared contract the frontend consumes imports the v3 compat subpath so one module
// resolves from both trees. Importing bare "zod" here failed CI's `tsc -b` with
// TS2307 from the frontend's resolution root.
import { z } from "zod/v3";

/**
 * Ticket 2.4, package L0. The typed lifecycle observation.
 *
 * `GET /api/explorers/v1/recovery/status` returned `{status, revision}` read straight off
 * creator_accounts. That is a state name, not an answer, and the client had to guess what
 * it meant - `ReactivateConfirm` treated anything other than suspended/pending_deletion as
 * "This account cannot be recovered."
 *
 * Three different situations were collapsed into that one sentence, and the first is a real
 * defect rather than a wording problem:
 *
 *  - A recovery that SUCCEEDED but whose response was lost. The account is `active`, which
 *    is exactly what the client asked for, and it told the user their account could not be
 *    recovered. This is the case the recovery design is built around: the proof cookie is
 *    cleared only on delivered success, precisely so a client that lost its response can
 *    re-observe instead of replaying. Re-observing then reported failure.
 *  - A terminally deleted account, which can never come back, shown identically to a
 *    transient failure - so the only suggestion offered is to try Google recovery again,
 *    forever.
 *  - A lifecycle operation that failed and needs a person, which nobody can tell apart
 *    from either of the above.
 *
 * So the observation is a union over OUTCOMES, not a status string. Each outcome answers
 * "what should happen next", and every one is derived from data the account and its latest
 * lifecycle operation already carry - this introduces no new state to keep in step.
 *
 * C3 of ticket 2.4 is explicit that the observation authority already exists and a second
 * endpoint must not be invented. This is a type over the existing route's answer.
 */

/** Why a lifecycle operation needs a person. Kept small on purpose: each value is actionable. */
export const manualReviewReasons = [
  /** The latest operation reached a failed state and carries a failure code. */
  "operation_failed",
  /** The account is mid-transition with no operation to account for it. */
  "orphaned_transition",
] as const;
export type ManualReviewReason = (typeof manualReviewReasons)[number];

export const lifecycleOperationKinds = ["deactivate", "delete", "reactivate", "cancel_deletion"] as const;
export const lifecycleOperationStates = ["pending", "running", "succeeded", "failed", "cancelled"] as const;
export const lifecycleAccountStatuses = ["active", "suspended", "pending_deletion", "deleted"] as const;

const base = { accountId: z.string().uuid(), revision: z.number().int().positive().safe() };

/**
 * The manual-review DTO. `manualReview` had zero hits in the server, the shared contract
 * and the client, so there was no way to express "a person must look at this" at all.
 *
 * It carries a reference the owner can quote and nothing else: no reason text, no address,
 * no email. A failure code is an internal classification, and it is included because a
 * support conversation is useless without it - but it is a code, not a message, so it
 * cannot leak a description of the account.
 */
export const lifecycleManualReviewSchema = z.object({
  outcome: z.literal("manual_review"),
  ...base,
  status: z.enum(lifecycleAccountStatuses),
  operationId: z.string().uuid().nullable(),
  reason: z.enum(manualReviewReasons),
  failureCode: z.string().max(100).nullable(),
}).strict();
export type LifecycleManualReview = z.infer<typeof lifecycleManualReviewSchema>;

export const lifecycleObservationSchema = z.discriminatedUnion("outcome", [
  /** Already active. Nothing to recover - including when a successful response was lost. */
  z.object({ outcome: z.literal("recovered"), ...base, status: z.literal("active"),
    operationId: z.string().uuid().nullable() }).strict(),
  /** A transition is in flight and may still be completed or cancelled by the owner. */
  z.object({ outcome: z.literal("pending"), ...base, status: z.enum(["suspended", "pending_deletion"]),
    operationId: z.string().uuid().nullable(), kind: z.enum(lifecycleOperationKinds).nullable() }).strict(),
  /** Deleted. No transition is possible, now or later; do not offer recovery. */
  z.object({ outcome: z.literal("terminal"), ...base, status: z.literal("deleted"),
    operationId: z.string().uuid().nullable() }).strict(),
  lifecycleManualReviewSchema,
  /**
   * Indeterminate. Not a failure and not a refusal: the observation could not be
   * established, so the only safe thing a client may do is observe again. It carries no
   * revision, because a revision a caller could act on is exactly what is not known.
   */
  z.object({ outcome: z.literal("unknown") }).strict(),
]);
export type LifecycleObservation = z.infer<typeof lifecycleObservationSchema>;

export type LifecycleObservationInput = {
  accountId: string;
  status: string | null | undefined;
  revision: number | null | undefined;
  operation: {
    id: string;
    kind: string;
    state: string;
    failureCode: string | null;
  } | null;
};

/**
 * Classify one observation. Pure, so every outcome is reachable in a unit test without a
 * database and without a session.
 *
 * Order matters and is deliberate:
 *
 *  1. A missing or unrecognised status is `unknown` before anything else. A status this
 *     contract does not know is not a status to reason about, and guessing would be worse
 *     than saying so.
 *  2. `deleted` is terminal next, ahead of any operation state. A failed operation on an
 *     account that is already gone does not make deletion reviewable; terminal is terminal.
 *  3. A failed operation is manual review. It outranks `pending` because the state is
 *     decided and wrong, and letting a client retry a transition that already failed is how
 *     one stuck account becomes a loop.
 *  4. `active` is `recovered`. This is the lost-response answer.
 *  5. Anything left - suspended or pending_deletion with a live or absent operation - is
 *     `pending`, except that a mid-transition account with NO operation at all is
 *     `orphaned_transition`: something moved the account and left no record, which a person
 *     has to look at rather than a client retry past.
 */
export function classifyLifecycleObservation(input: LifecycleObservationInput): LifecycleObservation {
  const status = input.status;
  const knownStatus = (lifecycleAccountStatuses as readonly string[]).includes(status ?? "");
  const revision = input.revision;
  const revisionIsUsable = typeof revision === "number" && Number.isSafeInteger(revision) && revision > 0;
  if (!knownStatus || !revisionIsUsable) return { outcome: "unknown" };

  const accountId = input.accountId;
  const operation = input.operation;
  const operationId = operation ? operation.id : null;
  const account = { accountId, revision: revision as number };

  if (status === "deleted") return { outcome: "terminal", ...account, status: "deleted", operationId };

  if (operation && operation.state === "failed") {
    return { outcome: "manual_review", ...account, status: status as LifecycleManualReview["status"],
      operationId, reason: "operation_failed", failureCode: operation.failureCode };
  }

  if (status === "active") return { outcome: "recovered", ...account, status: "active", operationId };

  if (!operation) {
    return { outcome: "manual_review", ...account, status: status as LifecycleManualReview["status"],
      operationId: null, reason: "orphaned_transition", failureCode: null };
  }

  const kind = (lifecycleOperationKinds as readonly string[]).includes(operation.kind)
    ? (operation.kind as (typeof lifecycleOperationKinds)[number]) : null;
  return { outcome: "pending", ...account, status: status as "suspended" | "pending_deletion", operationId, kind };
}

/** Whether an owner holding a recovery proof may still complete a transition. */
export const lifecycleIsRecoverable = (observation: LifecycleObservation): boolean =>
  observation.outcome === "pending";
