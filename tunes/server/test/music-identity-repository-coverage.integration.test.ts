import { describe, expect, it, vi } from "vitest";
import { MusicIdentityError } from "../../shared/musicError";
import {
  MusicIdentityRepository,
  StaleLifecycleOperationError,
  type EnsureMusicIdentityInput,
} from "../repositories/musicIdentityRepository";
import type { ClaimedLifecycleDeletion } from "../workers/musicLifecycleWorker";

type Reply = { rows?: any[]; rowCount?: number } | Error | { throwValue: unknown };
type Script = Array<{ sql: string | RegExp; reply: Reply | Reply[] }>;

const empty = { rows: [], rowCount: 0 };

function scriptedRepository(script: Script, options: {
  rejectRollback?: boolean;
  hooks?: ConstructorParameters<typeof MusicIdentityRepository>[1];
} = {}) {
  const queues = script.map(({ sql, reply }) => ({ sql, replies: Array.isArray(reply) ? [...reply] : [reply] }));
  const query = vi.fn(async (text: string) => {
    if (text === "ROLLBACK" && options.rejectRollback) throw new Error("rollback failed");
    const entry = queues.find(({ sql, replies }) => replies.length > 0
      && (typeof sql === "string" ? text.includes(sql) : sql.test(text)));
    if (!entry) return empty;
    const reply = entry.replies.shift()!;
    if (reply instanceof Error) throw reply;
    if ("throwValue" in reply) throw reply.throwValue;
    const rows = reply.rows ?? [];
    return { rows, rowCount: reply.rowCount ?? rows.length };
  });
  const client = { query, release: vi.fn() };
  const pool = { query, connect: vi.fn(async () => client) };
  return { repository: new MusicIdentityRepository(pool as any, options.hooks), query, client };
}

function ensureInput(suffix = "coverage"): EnsureMusicIdentityInput {
  return {
    userDocumentId: `user-${suffix}`,
    accountDocumentId: `account-${suffix}`,
    username: `username-${suffix}`,
    email: `${suffix}@example.invalid`,
    provider: "local",
    accountName: `Account ${suffix}`,
    accountType: "Venue",
    accountMobile: "+15555550100",
    internalUsername: `internal-${suffix}`,
    password: `password-${suffix}`,
    guestUrl: `guest-${suffix}`,
    guestCapabilityHash: "a".repeat(64),
    operationId: `operation-${suffix}`,
    requestId: `request-${suffix}`,
  };
}

const identityRow = {
  id: 7,
  strapi_user_document_id: "user-coverage",
  strapi_account_document_id: "account-coverage",
  identity_status: "active",
  session_version: 2,
  lifecycle_operation_id: "operation-coverage",
};

const lifecycleInput = {
  userDocumentId: "user-coverage",
  accountDocumentId: "account-coverage",
  operationId: "lifecycle-coverage",
};

const claimed: ClaimedLifecycleDeletion = {
  operationId: "delete-coverage",
  musicUserId: 7,
  userDocumentId: "user-coverage",
  accountDocumentId: "account-coverage",
  attemptCount: 2,
  leaseUpdatedAt: "2026-08-21T00:00:00.000Z",
};

async function rejectsCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("MusicIdentityRepository defensive coverage", () => {
  it("fails closed for malformed reactivation claims and covers bounded token revocation", async () => {
    expect(new StaleLifecycleOperationError("operation-a").message).toContain("operation-a");
    const tokenHash = "a".repeat(64);
    const leaseOwner = "20000000-0000-4000-8000-000000000001";
    const malformed = scriptedRepository([{ sql: "WITH claimed AS", reply: { rows: [{
      disposition: "claimed", strapi_user_id: "not-an-id", strapi_user_document_id: "user",
      strapi_account_document_id: "account", operation_id: leaseOwner,
    }] } }]);
    await expect(malformed.repository.claimReactivationToken(tokenHash, leaseOwner))
      .rejects.toThrow(/token authority is malformed/i);

    const revoked = scriptedRepository([{ sql: "UPDATE music_reactivation_tokens", reply: { rowCount: 1 } }]);
    await expect(revoked.repository.revokeReactivationToken(tokenHash)).resolves.toBe(true);
    const absent = scriptedRepository([{ sql: "UPDATE music_reactivation_tokens", reply: { rowCount: 0 } }]);
    await expect(absent.repository.revokeReactivationToken(tokenHash)).resolves.toBe(false);
    await expect(absent.repository.revokeReactivationToken("bad")).rejects.toThrow();

    const validIssue = {
      tokenHash,
      strapiUserId: 7,
      userDocumentId: "user-coverage",
      accountDocumentId: "account-coverage",
      operationId: "10000000-0000-4000-8000-000000000001",
      expiresInSeconds: 60,
    };
    await expect(absent.repository.issueReactivationToken({ ...validIssue, operationId: "invalid" }))
      .rejects.toThrow(/reactivation operation ID is invalid/);
    await expect(absent.repository.issueReactivationToken({ ...validIssue, strapiUserId: 0 }))
      .rejects.toThrow(/token authority is invalid/);
    await expect(absent.repository.claimReactivationToken(tokenHash, "invalid-owner"))
      .rejects.toThrow(/reactivation lease owner is invalid/);
    await expect(absent.repository.claimReactivationToken(tokenHash, leaseOwner, 0))
      .rejects.toThrow(/lease duration is invalid/);
    await expect(absent.repository.claimReactivationToken(tokenHash, leaseOwner))
      .resolves.toEqual({ disposition: "missing" });
  });
  it("validates every ensure input family", async () => {
    const valid = ensureInput();
    const invalid = [
      { ...valid, userDocumentId: "" },
      { ...valid, accountDocumentId: "x".repeat(513) },
      { ...valid, provider: "github" as any },
      { ...valid, guestCapabilityHash: "nope" },
    ];
    for (const input of invalid) {
      const { repository } = scriptedRepository([]);
      await rejectsCode(repository.ensureIdentity(input), "REQUEST_INVALID");
    }
  });

  it("rejects corrupt nullable authority and normalizes ensure database failures", async () => {
    const mismatch = scriptedRepository([{ sql: "music_user_id IS NULL", reply: { rows: [{
      operation_kind: "delete", strapi_user_document_id: "other", strapi_account_document_id: "account-coverage",
    }] } }], { rejectRollback: true });
    await rejectsCode(mismatch.repository.ensureIdentity(ensureInput()), "IDENTITY_CONFLICT");
    const nullPendingDeletion = scriptedRepository([{ sql: "music_user_id IS NULL", reply: { rows: [{
      operation_kind: "delete", error_code: null,
      strapi_user_document_id: "user-coverage", strapi_account_document_id: "account-coverage",
    }] } }]);
    await rejectsCode(nullPendingDeletion.repository.ensureIdentity(ensureInput()), "IDENTITY_PENDING_DELETION");

    for (const [error, code] of [
      [Object.assign(new Error("unique"), { code: "23505" }), "IDENTITY_CONFLICT"],
      [Object.assign(new Error("network"), { code: "08006" }), "DATABASE_UNAVAILABLE"],
      [Object.assign(new Error("deadlock"), { code: "40P01" }), "DATABASE_UNAVAILABLE"],
    ] as const) {
      const { repository } = scriptedRepository([{ sql: "BEGIN", reply: error }]);
      await rejectsCode(repository.ensureIdentity(ensureInput()), code);
    }
    const primitive = scriptedRepository([{ sql: "BEGIN", reply: new Error("plain") }]);
    await expect(primitive.repository.ensureIdentity(ensureInput())).rejects.toThrow("plain");
  });

  it("covers credential validation, mismatched replays, update races, and operation-id collisions", async () => {
    const valid = {
      operationId: "00000000-0000-4000-8000-000000000000",
      musicUserId: 7,
      expectedSessionVersion: 2,
      reason: "logout_all" as const,
    };
    for (const input of [
      { ...valid, operationId: "bad" },
      { ...valid, musicUserId: 0 },
      { ...valid, expectedSessionVersion: 0 },
      { ...valid, reason: "bad" as any },
    ]) {
      const { repository } = scriptedRepository([]);
      await rejectsCode(repository.revokeAllCredentials(input), "REQUEST_INVALID");
    }

    const operation = {
      operation_id: valid.operationId, music_user_id: 7,
      strapi_user_document_id: "user-coverage", strapi_account_document_id: "account-coverage",
      reason: "logout_all", expected_session_version: 2, result_session_version: 3, operation_state: "completed",
    };
    for (const override of [
      { music_user_id: 8 }, { reason: "credential_compromise" }, { expected_session_version: 3 },
      { result_session_version: 4 }, { operation_state: "running" },
    ]) {
      const { repository } = scriptedRepository([{ sql: "FROM music_credential_revocation_operations", reply: { rows: [{ ...operation, ...override }] } }]);
      await rejectsCode(repository.revokeAllCredentials(valid), "IDENTITY_CONFLICT");
    }

    const updateRace = scriptedRepository([
      { sql: "FROM music_credential_revocation_operations", reply: [{ rows: [] }, { rows: [] }] },
      { sql: "FROM users WHERE id", reply: { rows: [identityRow] } },
      { sql: "INSERT INTO music_credential_revocation_operations", reply: { rows: [operation] } },
      { sql: "UPDATE users SET session_version", reply: { rows: [] } },
    ]);
    await rejectsCode(updateRace.repository.revokeAllCredentials(valid), "IDENTITY_CONFLICT");

    for (const collision of [
      Object.assign(new Error("collision"), { code: "23505", constraint: "music_credential_revocation_operations_pkey" }),
      Object.assign(new Error("other"), { code: "23505", constraint: "other_constraint" }),
      Object.assign(new Error("primitive"), { code: undefined }),
    ]) {
      const { repository } = scriptedRepository([{ sql: "BEGIN", reply: collision }], { rejectRollback: true });
      if (collision.constraint === "music_credential_revocation_operations_pkey") {
        await rejectsCode(repository.revokeAllCredentials(valid), "IDENTITY_CONFLICT");
      } else {
        await expect(repository.revokeAllCredentials(valid)).rejects.toThrow(collision.message);
      }
    }
    const primitiveCollision = scriptedRepository([{ sql: "BEGIN", reply: { throwValue: "primitive" } }]);
    await expect(primitiveCollision.repository.revokeAllCredentials(valid)).rejects.toBe("primitive");
  });

  it("covers create and tombstone replays, mismatches, and rollback failures", async () => {
    const createInput = {
      username: "owner", password: "secret", guestUrl: "guest", venueName: "venue",
      strapiUserDocumentId: "user-coverage", strapiAccountDocumentId: "account-coverage",
      guestCapabilityHash: "a".repeat(64), operationId: "operation-coverage",
    };
    const replay = scriptedRepository([
      { sql: "FROM music_identity_tombstones", reply: empty },
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [identityRow] } },
    ]);
    await expect(replay.repository.createIdentity(createInput)).resolves.toMatchObject({ id: 7 });
    const tombstoned = scriptedRepository([{ sql: "FROM music_identity_tombstones", reply: { rowCount: 1 } }], { rejectRollback: true });
    await expect(tombstoned.repository.createIdentity(createInput)).rejects.toThrow("tombstoned");

    const tombstoneInput = { ...lifecycleInput, strapiUserDocumentId: lifecycleInput.userDocumentId,
      strapiAccountDocumentId: lifecycleInput.accountDocumentId, reason: "deleted" };
    const mismatched = scriptedRepository([{ sql: "FROM music_identity_tombstones", reply: { rows: [{
      strapi_user_document_id: lifecycleInput.userDocumentId,
      strapi_account_document_id: lifecycleInput.accountDocumentId,
      lifecycle_operation_id: "other",
    }] } }], { rejectRollback: true });
    await expect(mismatched.repository.tombstoneIdentity(tombstoneInput)).rejects.toThrow("mismatch");
    const liveMismatch = scriptedRepository([
      { sql: "FROM music_identity_tombstones", reply: empty },
      { sql: "FROM users", reply: { rows: [{ id: 7, strapi_user_document_id: "other", strapi_account_document_id: lifecycleInput.accountDocumentId }] } },
    ]);
    await expect(liveMismatch.repository.tombstoneIdentity(tombstoneInput)).rejects.toThrow("mismatch");
  });

  it("defends transition replays and covers idempotent target transitions", async () => {
    const base = { strapiUserDocumentId: "user-coverage", operationId: "transition", kind: "suspend" as const, targetStatus: "suspended" as const };
    const missing = scriptedRepository([{ sql: "FROM users WHERE strapi_user_document_id", reply: empty }], { rejectRollback: true });
    await expect(missing.repository.transitionIdentity(base)).rejects.toThrow("not found");
    const missingLocked = scriptedRepository([
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [identityRow] } },
      { sql: "FROM users WHERE id", reply: empty },
    ]);
    await expect(missingLocked.repository.transitionIdentity(base)).rejects.toThrow("not found");

    const locked = { ...identityRow, identity_status: "suspended" };
    const idempotent = scriptedRepository([
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [locked] } },
      { sql: "FROM users WHERE id", reply: { rows: [locked] } },
      { sql: "FROM music_identity_lifecycle_operations", reply: empty },
    ]);
    await expect(idempotent.repository.transitionIdentity(base)).resolves.toMatchObject({ identityStatus: "suspended" });

    const prior = {
      operation_id: "transition", strapi_user_document_id: "user-coverage", strapi_account_document_id: "account-coverage",
      music_user_id: 7, operation_kind: "suspend", requested_identity_status: "suspended",
      operation_state: "completed", result_session_version: 3,
    };
    for (const override of [
      { strapi_user_document_id: "other" }, { strapi_account_document_id: "other" }, { music_user_id: 8 },
      { operation_kind: "reactivate" }, { requested_identity_status: "active" },
    ]) {
      const repo = scriptedRepository([
        { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [identityRow] } },
        { sql: "FROM users WHERE id", reply: { rows: [{ ...identityRow, identity_status: "suspended", session_version: 3, lifecycle_operation_id: "transition" }] } },
        { sql: "FROM music_identity_lifecycle_operations", reply: { rows: [{ ...prior, ...override }] } },
      ]);
      await expect(repo.repository.transitionIdentity(base)).rejects.toThrow("mismatch");
    }
    const incomplete = scriptedRepository([
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [identityRow] } },
      { sql: "FROM users WHERE id", reply: { rows: [{ ...locked, session_version: 3, lifecycle_operation_id: "transition" }] } },
      { sql: "FROM music_identity_lifecycle_operations", reply: { rows: [{ ...prior, operation_state: "running" }] } },
    ]);
    await expect(incomplete.repository.transitionIdentity(base)).rejects.toThrow("incomplete");
    const stale = scriptedRepository([
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [identityRow] } },
      { sql: "FROM users WHERE id", reply: { rows: [{ ...locked, session_version: 4, lifecycle_operation_id: "transition" }] } },
      { sql: "FROM music_identity_lifecycle_operations", reply: { rows: [prior] } },
    ]);
    await expect(stale.repository.transitionIdentity(base)).rejects.toBeInstanceOf(StaleLifecycleOperationError);
  });

  it("covers absent availability authority, replay, conflict, and rollback normalization", async () => {
    for (const method of ["suspendIdentity", "reactivateIdentity"] as const) {
      for (const invalid of [
        { ...lifecycleInput, userDocumentId: "" },
        { ...lifecycleInput, accountDocumentId: "x".repeat(513) },
        { ...lifecycleInput, operationId: "" },
      ]) {
        const { repository } = scriptedRepository([]);
        await rejectsCode(repository[method](invalid), "REQUEST_INVALID");
      }
    }

    const noLocalSuspend = scriptedRepository([],{ hooks: { afterWrite: vi.fn(async () => undefined) } });
    await expect(noLocalSuspend.repository.suspendIdentity(lifecycleInput)).resolves.toMatchObject({ identityStatus: "not_present" });
    const noLocalReactivate = scriptedRepository([]);
    await expect(noLocalReactivate.repository.reactivateIdentity(lifecycleInput)).resolves.toMatchObject({ identityStatus: "not_present" });

    const nullableSuspend = {
      operation_id: "old", strapi_user_document_id: lifecycleInput.userDocumentId,
      strapi_account_document_id: lifecycleInput.accountDocumentId, operation_kind: "suspend",
    };
    const sameAuthority = scriptedRepository([{ sql: "music_user_id IS NULL", reply: { rows: [nullableSuspend] } }]);
    await expect(sameAuthority.repository.suspendIdentity(lifecycleInput)).resolves.toMatchObject({ identityStatus: "not_present" });
    const conflictingAuthority = scriptedRepository([{ sql: "music_user_id IS NULL", reply: { rows: [{ ...nullableSuspend, strapi_user_document_id: "other" }] } }]);
    await rejectsCode(conflictingAuthority.repository.suspendIdentity(lifecycleInput), "IDENTITY_CONFLICT");

    const completedCollision = { ...nullableSuspend, operation_id: lifecycleInput.operationId, music_user_id: null,
      requested_identity_status: "suspended", operation_state: "completed" };
    const replay = scriptedRepository([
      { sql: "WHERE operation_id=$1 FOR UPDATE", reply: { rows: [completedCollision] } },
      { sql: "music_user_id IS NULL", reply: { rows: [{ ...nullableSuspend, operation_id: lifecycleInput.operationId }] } },
    ]);
    await expect(replay.repository.suspendIdentity(lifecycleInput)).resolves.toMatchObject({ identityStatus: "not_present" });
    const badReplay = scriptedRepository([
      { sql: "WHERE operation_id=$1 FOR UPDATE", reply: { rows: [{ ...completedCollision, music_user_id: 7 }] } },
      { sql: "music_user_id IS NULL", reply: { rows: [nullableSuspend] } },
    ], { rejectRollback: true });
    await rejectsCode(badReplay.repository.suspendIdentity(lifecycleInput), "IDENTITY_CONFLICT");

    const collisionMismatch = scriptedRepository([{ sql: "WHERE operation_id=$1 FOR UPDATE", reply: { rows: [{
      ...completedCollision, strapi_user_document_id: "other",
    }] } }]);
    await rejectsCode(collisionMismatch.repository.suspendIdentity(lifecycleInput), "IDENTITY_CONFLICT");
    const tombstoneMismatch = scriptedRepository([{ sql: "FROM music_identity_tombstones", reply: { rows: [{
      strapi_user_document_id: "other", strapi_account_document_id: lifecycleInput.accountDocumentId,
    }] } }]);
    await rejectsCode(tombstoneMismatch.repository.suspendIdentity(lifecycleInput), "IDENTITY_CONFLICT");
    const liveMismatch = scriptedRepository([{ sql: "FROM users", reply: { rows: [{
      ...identityRow, strapi_user_document_id: "other",
    }] } }]);
    await rejectsCode(liveMismatch.repository.suspendIdentity(lifecycleInput), "IDENTITY_CONFLICT");

    const livePending = scriptedRepository([{ sql: "FROM users", reply: { rows: [{ ...identityRow, identity_status: "pending_deletion" }] } }]);
    await rejectsCode(livePending.repository.suspendIdentity(lifecycleInput), "IDENTITY_PENDING_DELETION");
    const liveAlreadyTarget = scriptedRepository([{ sql: "FROM users", reply: { rows: [{ ...identityRow, identity_status: "suspended" }] } }]);
    await expect(liveAlreadyTarget.repository.suspendIdentity(lifecycleInput)).resolves.toMatchObject({ identityStatus: "suspended" });
    const liveInvalid = scriptedRepository([{ sql: "FROM users", reply: { rows: [{ ...identityRow, identity_status: "suspended" }] } },
      { sql: "music_user_id IS NULL", reply: { rows: [{ ...nullableSuspend, operation_kind: "delete", error_code: null }] } }]);
    await rejectsCode(liveInvalid.repository.reactivateIdentity(lifecycleInput), "IDENTITY_CONFLICT");

    const liveCollision = scriptedRepository([
      { sql: "WHERE operation_id=$1 FOR UPDATE", reply: { rows: [{ ...completedCollision, music_user_id: 8 }] } },
      { sql: "FROM users", reply: { rows: [{ ...identityRow, identity_status: "active" }] } },
    ]);
    await rejectsCode(liveCollision.repository.suspendIdentity(lifecycleInput), "IDENTITY_CONFLICT");
  });

  it("covers no-local deletion prepare, status, boundary, cancel, and lifecycle binding variants", async () => {
    const noLocal = {
      operation_id: "delete-coverage", strapi_user_document_id: lifecycleInput.userDocumentId,
      strapi_account_document_id: lifecycleInput.accountDocumentId, music_user_id: null, operation_kind: "delete",
      operation_phase: "prepared", operation_state: "completed", error_code: "NO_LOCAL:PREPARED",
    };
    const preparePrior = scriptedRepository([{ sql: "music_user_id IS NULL AND operation_kind='delete'", reply: { rows: [noLocal] } }]);
    await expect(preparePrior.repository.prepareDeletion(lifecycleInput)).resolves.toMatchObject({ musicUserId: null });
    const prepareMismatch = scriptedRepository([{ sql: "music_user_id IS NULL AND operation_kind='delete'", reply: { rows: [{ ...noLocal, strapi_account_document_id: "other" }] } }]);
    await rejectsCode(prepareMismatch.repository.prepareDeletion(lifecycleInput), "IDENTITY_CONFLICT");
    const prepareCollision = scriptedRepository([{ sql: "SELECT 1 FROM music_identity_lifecycle_operations", reply: { rowCount: 1 } }], { rejectRollback: true });
    await rejectsCode(prepareCollision.repository.prepareDeletion(lifecycleInput), "IDENTITY_CONFLICT");

    const retired = { music_user_id: null, lifecycle_operation_id: "retired", operation_phase: "finalized", operation_state: "completed" };
    const retiredExact = scriptedRepository([
      { sql: "JOIN music_identity_lifecycle_operations", reply: { rows: [retired] } },
      { sql: "WHERE lifecycle_operation_id=$1", reply: { rows: [{
        strapi_user_document_id: lifecycleInput.userDocumentId, strapi_account_document_id: lifecycleInput.accountDocumentId,
      }] } },
    ]);
    await expect(retiredExact.repository.prepareDeletion(lifecycleInput)).resolves.toMatchObject({ identityStatus: "tombstoned" });
    const retiredMismatch = scriptedRepository([
      { sql: "JOIN music_identity_lifecycle_operations", reply: { rows: [retired] } },
      { sql: "WHERE lifecycle_operation_id=$1", reply: empty },
    ]);
    await rejectsCode(retiredMismatch.repository.prepareDeletion(lifecycleInput), "IDENTITY_CONFLICT");
    const initialMismatch = scriptedRepository([{ sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [{
      id: 7, strapi_user_document_id: "other", strapi_account_document_id: lifecycleInput.accountDocumentId,
    }] } }]);
    await rejectsCode(initialMismatch.repository.prepareDeletion(lifecycleInput), "IDENTITY_CONFLICT");
    const lockedMissing = scriptedRepository([
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [{
        id: 7, strapi_user_document_id: lifecycleInput.userDocumentId, strapi_account_document_id: lifecycleInput.accountDocumentId,
      }] } },
      { sql: "FROM users WHERE id=$1 FOR UPDATE", reply: empty },
    ]);
    await rejectsCode(lockedMissing.repository.prepareDeletion(lifecycleInput), "IDENTITY_CONFLICT");
    const liveCollision = scriptedRepository([
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [{
        id: 7, strapi_user_document_id: lifecycleInput.userDocumentId, strapi_account_document_id: lifecycleInput.accountDocumentId,
      }] } },
      { sql: "FROM users WHERE id=$1 FOR UPDATE", reply: { rows: [{ ...identityRow, lifecycle_operation_id: null }] } },
      { sql: "SELECT 1 FROM music_identity_lifecycle_operations", reply: { rowCount: 1 } },
    ]);
    await rejectsCode(liveCollision.repository.prepareDeletion(lifecycleInput), "IDENTITY_CONFLICT");

    const statusMissing = scriptedRepository([]);
    await rejectsCode(statusMissing.repository.lifecycleStatus(lifecycleInput), "LIFECYCLE_NOT_FOUND");
    const statusMismatch = scriptedRepository([{ sql: "FROM users u JOIN", reply: { rows: [{ ...identityRow, strapi_account_document_id: "other", operation_kind: "delete" }] } }]);
    await rejectsCode(statusMismatch.repository.lifecycleStatus(lifecycleInput), "IDENTITY_CONFLICT");
    const statusActive = scriptedRepository([{ sql: "FROM users u JOIN", reply: { rows: [{ ...identityRow, operation_kind: "delete" }] } }]);
    await rejectsCode(statusActive.repository.lifecycleStatus(lifecycleInput), "LIFECYCLE_NOT_FOUND");
    const statusSuspendedWrong = scriptedRepository([{ sql: "FROM users u JOIN", reply: { rows: [{ ...identityRow, identity_status: "suspended", operation_kind: "suspend" }] } }]);
    await rejectsCode(statusSuspendedWrong.repository.lifecycleStatus(lifecycleInput), "LIFECYCLE_NOT_FOUND");

    const bindingTombstone = scriptedRepository([{ sql: "FROM music_identity_tombstones", reply: { rows: [{
      strapi_user_document_id: lifecycleInput.userDocumentId, strapi_account_document_id: lifecycleInput.accountDocumentId,
    }] } }]);
    await expect(bindingTombstone.repository.lifecycleBinding(lifecycleInput.userDocumentId)).resolves.toMatchObject({ identityStatus: "pending_deletion" });
    const bindingBoundTombstone = scriptedRepository([{ sql: "FROM music_identity_tombstones", reply: { rows: [{
      strapi_user_document_id: lifecycleInput.userDocumentId, strapi_account_document_id: lifecycleInput.accountDocumentId,
    }] } }]);
    await rejectsCode(bindingBoundTombstone.repository.lifecycleBinding(lifecycleInput.userDocumentId, lifecycleInput.accountDocumentId), "IDENTITY_TOMBSTONED");
    for (const operation of [
      { ...noLocal, error_code: "NO_LOCAL:PREPARED" },
      { ...noLocal, error_code: "NO_LOCAL:CANCELLED" },
      { ...noLocal, operation_kind: "suspend", error_code: "NO_LOCAL:SUSPENDED" },
      { ...noLocal, operation_kind: "reactivate", error_code: "NO_LOCAL:REACTIVATED" },
    ]) {
      const binding = scriptedRepository([{ sql: "music_user_id IS NULL", reply: { rows: [operation] } }]);
      await expect(binding.repository.lifecycleBinding(lifecycleInput.userDocumentId)).resolves.toBeDefined();
    }
    const bindingMismatch = scriptedRepository([{ sql: "music_user_id IS NULL", reply: { rows: [{ ...noLocal, strapi_user_document_id: "other" }] } }]);
    await rejectsCode(bindingMismatch.repository.lifecycleBinding(lifecycleInput.userDocumentId), "IDENTITY_CONFLICT");
    const bindingLiveMismatch = scriptedRepository([{ sql: "FROM users", reply: { rows: [{ ...identityRow, strapi_user_document_id: "other" }] } }]);
    await rejectsCode(bindingLiveMismatch.repository.lifecycleBinding(lifecycleInput.userDocumentId), "IDENTITY_CONFLICT");
    const bindingAccountMismatch = scriptedRepository([{ sql: "FROM users", reply: { rows: [{ ...identityRow, strapi_account_document_id: "other" }] } }]);
    await rejectsCode(bindingAccountMismatch.repository.lifecycleBinding(lifecycleInput.userDocumentId, lifecycleInput.accountDocumentId), "IDENTITY_CONFLICT");
    const bindingNullPending = scriptedRepository([{ sql: "music_user_id IS NULL", reply: { rows: [{ ...noLocal, error_code: null }] } }]);
    await expect(bindingNullPending.repository.lifecycleBinding(lifecycleInput.userDocumentId)).resolves.toMatchObject({ identityStatus: "pending_deletion" });
    let errorReads = 0;
    const changingError = { ...noLocal, get error_code() { errorReads += 1; return errorReads === 1 ? "NO_LOCAL:CANCELLED" : null; } };
    const bindingChangingError = scriptedRepository([{ sql: "music_user_id IS NULL", reply: { rows: [changingError] } }]);
    await expect(bindingChangingError.repository.lifecycleBinding(lifecycleInput.userDocumentId)).resolves.toEqual({ disposition: "not_present" });
    const bindingRollback = scriptedRepository([{ sql: "BEGIN", reply: new Error("binding failed") }], { rejectRollback: true });
    await expect(bindingRollback.repository.lifecycleBinding(lifecycleInput.userDocumentId)).rejects.toThrow("binding failed");

    const statusNoLocalMismatch = scriptedRepository([{ sql: "music_user_id IS NULL AND operation_kind='delete'", reply: { rows: [{ ...noLocal, strapi_account_document_id: "other" }] } }]);
    await rejectsCode(statusNoLocalMismatch.repository.lifecycleStatus(lifecycleInput), "IDENTITY_CONFLICT");

    const boundaryNoLocal = scriptedRepository([{ sql: "music_user_id IS NULL AND operation_kind='delete'", reply: { rows: [noLocal] } },
      { sql: "UPDATE music_identity_lifecycle_operations", reply: { rows: [{ ...noLocal, error_code: "NO_LOCAL:BOUNDARY" }] } }]);
    await expect(boundaryNoLocal.repository.markDeletionBoundary(lifecycleInput)).resolves.toMatchObject({ boundaryCrossed: true });
    const boundaryReplay = scriptedRepository([{ sql: "music_user_id IS NULL AND operation_kind='delete'", reply: { rows: [{ ...noLocal, error_code: "NO_LOCAL:BOUNDARY" }] } }]);
    await expect(boundaryReplay.repository.markDeletionBoundary(lifecycleInput)).resolves.toMatchObject({ boundaryCrossed: true });
    const boundaryNullError = scriptedRepository([{ sql: "music_user_id IS NULL AND operation_kind='delete'", reply: { rows: [{ ...noLocal, error_code: null }] } }]);
    await expect(boundaryNullError.repository.markDeletionBoundary(lifecycleInput)).resolves.toMatchObject({ boundaryCrossed: true });
    const boundaryAccountCollision = scriptedRepository([{ sql: "SELECT 1 FROM users WHERE strapi_account_document_id", reply: { rowCount: 1 } }]);
    await rejectsCode(boundaryAccountCollision.repository.markDeletionBoundary(lifecycleInput), "IDENTITY_CONFLICT");
    const boundaryLiveMismatch = scriptedRepository([{ sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [{
      ...identityRow, strapi_account_document_id: "other", identity_status: "pending_deletion",
    }] } }]);
    await rejectsCode(boundaryLiveMismatch.repository.markDeletionBoundary(lifecycleInput), "IDENTITY_CONFLICT");
    const boundaryOperationMismatch = scriptedRepository([
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [{ ...identityRow, identity_status: "pending_deletion" }] } },
      { sql: "FROM music_identity_lifecycle_operations", reply: { rows: [{ operation_kind: "suspend", operation_phase: "prepared", operation_state: "completed" }] } },
    ]);
    await rejectsCode(boundaryOperationMismatch.repository.markDeletionBoundary(lifecycleInput), "IDENTITY_CONFLICT");
    const boundaryReplayLive = scriptedRepository([
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [{ ...identityRow, identity_status: "pending_deletion", lifecycle_retention_stage: "upstream-delete-attempted" }] } },
      { sql: "FROM music_identity_lifecycle_operations", reply: { rows: [{ operation_id: "delete", operation_kind: "delete", operation_phase: "prepared", operation_state: "completed" }] } },
    ]);
    await expect(boundaryReplayLive.repository.markDeletionBoundary(lifecycleInput)).resolves.toMatchObject({ boundaryCrossed: true });
    const boundaryRollback = scriptedRepository([{ sql: "BEGIN", reply: Object.assign(new Error("constraint"), { code: "23505" }) }], { rejectRollback: true });
    await rejectsCode(boundaryRollback.repository.markDeletionBoundary(lifecycleInput), "IDENTITY_CONFLICT");

    const cancelReplay = scriptedRepository([{ sql: "music_user_id IS NULL AND operation_kind='delete'", reply: { rows: [{ ...noLocal, error_code: "NO_LOCAL:CANCELLED" }] } }]);
    await expect(cancelReplay.repository.cancelDeletion(lifecycleInput)).resolves.toMatchObject({ state: "cancelled" });
    const cancelLiveReplay = scriptedRepository([
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [{ ...identityRow, identity_status: "suspended", lifecycle_retention_stage: "identity-suspended", lifecycle_operation_id: "cancelled-operation" }] } },
      { sql: "FROM music_identity_lifecycle_operations", reply: { rows: [{ operation_id: "cancelled-operation", operation_kind: "cancel_deletion", operation_phase: "prepared", operation_state: "completed" }] } },
    ]);
    await expect(cancelLiveReplay.repository.cancelDeletion(lifecycleInput)).resolves.toMatchObject({ state: "cancelled", identityStatus: "suspended" });
    const cancelSuspendedWithoutReplay = scriptedRepository([
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [{ ...identityRow, identity_status: "suspended", lifecycle_retention_stage: "identity-suspended", lifecycle_operation_id: "missing-cancel-operation" }] } },
      { sql: "FROM music_identity_lifecycle_operations", reply: { rows: [] } },
      { sql: "FROM music_identity_lifecycle_operations", reply: { rows: [] } },
    ]);
    await rejectsCode(cancelSuspendedWithoutReplay.repository.cancelDeletion(lifecycleInput), "LIFECYCLE_CANCEL_FORBIDDEN");
    const cancelForbidden = scriptedRepository([{ sql: "music_user_id IS NULL AND operation_kind='delete'", reply: { rows: [{ ...noLocal, error_code: "NO_LOCAL:BOUNDARY" }] } }]);
    await rejectsCode(cancelForbidden.repository.cancelDeletion(lifecycleInput), "LIFECYCLE_CANCEL_FORBIDDEN");
    const cancelAccountCollision = scriptedRepository([{ sql: "SELECT 1 FROM users WHERE strapi_account_document_id", reply: { rowCount: 1 } }]);
    await rejectsCode(cancelAccountCollision.repository.cancelDeletion(lifecycleInput), "IDENTITY_CONFLICT");
    const cancelNoOperation = scriptedRepository([]);
    await rejectsCode(cancelNoOperation.repository.cancelDeletion(lifecycleInput), "IDENTITY_CONFLICT");
    const cancelLiveMismatch = scriptedRepository([{ sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [{
      ...identityRow, strapi_account_document_id: "other",
    }] } }]);
    await rejectsCode(cancelLiveMismatch.repository.cancelDeletion(lifecycleInput), "IDENTITY_CONFLICT");
    const cancelRollback = scriptedRepository([{ sql: "BEGIN", reply: Object.assign(new Error("constraint"), { code: "P0001" }) }], { rejectRollback: true });
    await rejectsCode(cancelRollback.repository.cancelDeletion(lifecycleInput), "IDENTITY_CONFLICT");

    const pendingInvalidOperation = scriptedRepository([
      { sql: "FROM users WHERE strapi_user_document_id", reply: { rows: [{
        id: 7, strapi_user_document_id: lifecycleInput.userDocumentId, strapi_account_document_id: lifecycleInput.accountDocumentId,
      }] } },
      { sql: "FROM users WHERE id=$1 FOR UPDATE", reply: { rows: [{ ...identityRow, identity_status: "pending_deletion" }] } },
      { sql: "FROM music_identity_lifecycle_operations", reply: { rows: [{ operation_kind: "suspend" }] } },
    ]);
    await rejectsCode(pendingInvalidOperation.repository.prepareDeletion(lifecycleInput), "IDENTITY_CONFLICT");

    for (const operation of [
      { ...noLocal, operation_phase: "finalized", error_code: null },
      { ...noLocal, error_code: "NO_LOCAL:CLAIMED" },
    ]) {
      const helper = scriptedRepository([{ sql: "music_user_id IS NULL AND operation_kind='delete'", reply: { rows: [operation] } }]);
      await expect(helper.repository.prepareDeletion(lifecycleInput)).resolves.toBeDefined();
    }
  });

  it("covers claim/rearm/finalize/outcome lease failures and rollback callbacks", async () => {
    for (const input of [{ batchSize: 2, maxAttempts: 1 }, { batchSize: 1, maxAttempts: 0 }, { batchSize: 1, maxAttempts: 101 }]) {
      const { repository } = scriptedRepository([]);
      await rejectsCode(repository.claimDueDeletions(input), "REQUEST_INVALID");
    }
    const claimFailure = scriptedRepository([{ sql: "BEGIN", reply: new Error("claim failed") }], { rejectRollback: true });
    await expect(claimFailure.repository.claimDueDeletions({ batchSize: 1, maxAttempts: 2 })).rejects.toThrow("claim failed");

    const rearmMissing = scriptedRepository([]);
    await expect(rearmMissing.repository.rearmDeletion("missing")).resolves.toBe(false);
    const rearmNoLocal = scriptedRepository([{ sql: "music_user_id IS NULL", reply: { rows: [{ operation_id: "delete", attempt_count: 3 }] } }]);
    await expect(rearmNoLocal.repository.rearmDeletion("delete")).resolves.toBe(true);
    const rearmFailure = scriptedRepository([{ sql: "BEGIN", reply: Object.assign(new Error("constraint"), { code: "23505" }) }], { rejectRollback: true });
    await rejectsCode(rearmFailure.repository.rearmDeletion("delete"), "IDENTITY_CONFLICT");

    const staleFinalize = scriptedRepository([]);
    await expect(staleFinalize.repository.finalizeDeletion(claimed)).resolves.toBe(false);
    const nullClaim = { ...claimed, musicUserId: null };
    const staleNoLocal = scriptedRepository([{ sql: "FROM music_identity_lifecycle_operations", reply: empty }, { sql: "FROM music_identity_tombstones", reply: { rowCount: 1 } }]);
    await expect(staleNoLocal.repository.finalizeDeletion(nullClaim)).resolves.toBe(false);
    const staleNoLocalAbsent = scriptedRepository([]);
    await expect(staleNoLocalAbsent.repository.finalizeDeletion(nullClaim)).resolves.toBe(false);
    const finalizeCollision = scriptedRepository([
      { sql: "FROM music_identity_lifecycle_operations", reply: { rowCount: 1, rows: [noLocalClaim()] } },
      { sql: "SELECT 1 FROM users", reply: { rowCount: 1 } },
    ], { rejectRollback: true });
    await rejectsCode(finalizeCollision.repository.finalizeDeletion(nullClaim), "IDENTITY_CONFLICT");

    for (const deadLetter of [false, true]) {
      const staleOutcome = scriptedRepository([]);
      await expect(staleOutcome.repository.recordDeletionFailure(claimed, "observation", deadLetter)).resolves.toBe(false);
      const staleNullOutcome = scriptedRepository([]);
      await expect(staleNullOutcome.repository.recordDeletionObservation(nullClaim, "outage", deadLetter)).resolves.toBe(false);
    }
    const successfulNullDeadLetter = scriptedRepository([{ sql: "FROM music_identity_lifecycle_operations", reply: { rowCount: 1 } }]);
    await expect(successfulNullDeadLetter.repository.recordDeletionObservation(nullClaim, "present", true)).resolves.toBe(true);
    const outcomeFailure = scriptedRepository([{ sql: "BEGIN", reply: Object.assign(new Error("constraint"), { code: "23514" }) }], { rejectRollback: true });
    await rejectsCode(outcomeFailure.repository.recordDeletionFailure(claimed, "finalize", true), "IDENTITY_CONFLICT");
  });
});

function noLocalClaim() {
  return {
    operation_id: "delete-coverage", strapi_user_document_id: lifecycleInput.userDocumentId,
    strapi_account_document_id: lifecycleInput.accountDocumentId, music_user_id: null,
    operation_kind: "delete", operation_phase: "prepared", operation_state: "completed",
    error_code: "NO_LOCAL:CLAIMED", attempt_count: 2,
  };
}
