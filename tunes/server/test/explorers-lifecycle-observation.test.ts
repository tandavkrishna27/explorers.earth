import { describe, expect, it } from "vitest";
import {
  classifyLifecycleObservation,
  lifecycleIsRecoverable,
  lifecycleObservationSchema,
  type LifecycleObservationInput,
} from "../../shared/explorersLifecycleObservation";

// Ticket 2.4 package L0. The classifier is pure, so every outcome including the ones that
// are hard to reach against a real database - an unrecognised status, a mid-transition
// account with no operation - is exercised here rather than left to an integration test
// that cannot construct them.

const ACCOUNT = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
const OPERATION = "11111111-2222-4333-8444-555555555555";

const observe = (overrides: Partial<LifecycleObservationInput> = {}) => classifyLifecycleObservation({
  accountId: ACCOUNT, status: "suspended", revision: 7,
  operation: { id: OPERATION, kind: "deactivate", state: "pending", failureCode: null },
  ...overrides,
});

describe("lifecycle observation", () => {
  it("returns a shape the published union accepts, for every outcome", () => {
    const outcomes = [
      observe(),
      observe({ status: "active" }),
      observe({ status: "deleted" }),
      observe({ operation: { id: OPERATION, kind: "delete", state: "failed", failureCode: "music_release_timeout" } }),
      observe({ status: "nonsense" }),
    ];
    for (const outcome of outcomes) expect(lifecycleObservationSchema.safeParse(outcome).success).toBe(true);
    expect(outcomes.map((outcome) => outcome.outcome)).toEqual([
      "pending", "recovered", "terminal", "manual_review", "unknown",
    ]);
  });

  // The defect this union exists for. A recovery that succeeded and lost its response
  // leaves the account active, and the client read that as "cannot be recovered".
  it("reports a successful recovery whose response was lost as recovered, not as a failure", () => {
    const observation = observe({ status: "active", operation: { id: OPERATION, kind: "reactivate", state: "succeeded", failureCode: null } });
    expect(observation).toEqual({ outcome: "recovered", accountId: ACCOUNT, revision: 7, status: "active", operationId: OPERATION });
    expect(lifecycleIsRecoverable(observation)).toBe(false);
  });

  it("separates a still-pending transition from a decided one, and carries the kind in flight", () => {
    expect(observe({ operation: { id: OPERATION, kind: "delete", state: "pending", failureCode: null } }))
      .toMatchObject({ outcome: "pending", kind: "delete" });
    expect(observe({ status: "pending_deletion", operation: { id: OPERATION, kind: "delete", state: "running", failureCode: null } }))
      .toMatchObject({ outcome: "pending", status: "pending_deletion", kind: "delete" });
    expect(lifecycleIsRecoverable(observe())).toBe(true);
  });

  // Order, stated as behaviour rather than as a comment: terminal outranks a failed
  // operation, because a failed delete on an already-deleted account is not reviewable.
  it("keeps a deleted account terminal even when its last operation failed", () => {
    expect(observe({ status: "deleted", operation: { id: OPERATION, kind: "delete", state: "failed", failureCode: "stuck" } }))
      .toMatchObject({ outcome: "terminal", status: "deleted" });
  });

  // And a failed operation outranks pending, so a client cannot retry past it.
  it("routes a failed operation to manual review with its code, not back to a retryable pending", () => {
    const observation = observe({ status: "pending_deletion",
      operation: { id: OPERATION, kind: "delete", state: "failed", failureCode: "music_release_timeout" } });
    expect(observation).toEqual({ outcome: "manual_review", accountId: ACCOUNT, revision: 7,
      status: "pending_deletion", operationId: OPERATION, reason: "operation_failed", failureCode: "music_release_timeout" });
    expect(lifecycleIsRecoverable(observation)).toBe(false);
  });

  it("treats a mid-transition account with no operation as orphaned rather than pending", () => {
    expect(observe({ operation: null })).toEqual({ outcome: "manual_review", accountId: ACCOUNT, revision: 7,
      status: "suspended", operationId: null, reason: "orphaned_transition", failureCode: null });
    expect(observe({ status: "pending_deletion", operation: null }))
      .toMatchObject({ outcome: "manual_review", reason: "orphaned_transition" });
  });

  // An active account with no operation is not orphaned - it is simply an account that has
  // never had a lifecycle operation, which is the ordinary case.
  it("does not call an untouched active account orphaned", () => {
    expect(observe({ status: "active", operation: null }))
      .toEqual({ outcome: "recovered", accountId: ACCOUNT, revision: 7, status: "active", operationId: null });
  });

  it.each([
    ["an absent status", { status: null }],
    ["an undefined status", { status: undefined }],
    ["a status this contract does not know", { status: "archived" }],
    ["an absent revision", { revision: null }],
    ["a zero revision", { revision: 0 }],
    ["a negative revision", { revision: -1 }],
    ["a non-integer revision", { revision: 1.5 }],
    ["an unsafe revision", { revision: Number.MAX_SAFE_INTEGER + 2 }],
  ])("is indeterminate, and carries no revision to act on, given %s", (_label, overrides) => {
    // Deliberately asserted as exact equality: "unknown" must not leak a revision a caller
    // could pass to a transition, because not knowing it is the whole point.
    expect(observe(overrides as Partial<LifecycleObservationInput>)).toEqual({ outcome: "unknown" });
  });

  it("does not invent an operation kind the contract does not know", () => {
    expect(observe({ operation: { id: OPERATION, kind: "defenestrate", state: "pending", failureCode: null } }))
      .toMatchObject({ outcome: "pending", operationId: OPERATION, kind: null });
  });

  // The manual-review DTO is what a support conversation quotes. It must not become a
  // channel for account content: a code is a classification, a reason text is not.
  it("carries only a reference and a code in the manual-review payload", () => {
    const observation = observe({ operation: { id: OPERATION, kind: "delete", state: "failed", failureCode: "x" } });
    expect(Object.keys(observation).sort()).toEqual(
      ["accountId", "failureCode", "operationId", "outcome", "reason", "revision", "status"]);
    expect(lifecycleObservationSchema.safeParse({ ...observation, reasonText: "I am leaving because…" }).success).toBe(false);
  });
});
