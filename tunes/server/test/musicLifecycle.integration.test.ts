import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateMusicDatabase } from "../db/migrate";
import { MusicDomainRepository } from "../repositories/musicDomainRepository";
import { MusicIdentityRepository, type EnsureMusicIdentityInput } from "../repositories/musicIdentityRepository";
import { MusicPrincipalService } from "../middleware/musicPrincipal";
import { MusicLifecycleService } from "../services/musicLifecycleService";
import { MusicTokenService } from "../services/musicTokenService";
import { manuallyRepairMusicDeletion, runMusicLifecycleWorkerOnce } from "../workers/musicLifecycleWorker";
import { trackPostgresPoolShutdown } from "./helpers/postgresPoolShutdown";

const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C7_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `music_c7_lifecycle_${process.pid}`;
let admin: pg.Pool;
let pool: pg.Pool;
let closePool: (() => Promise<void>) | undefined;

function identityInput(suffix: string): EnsureMusicIdentityInput {
  return {
    userDocumentId: `c7-user-${suffix}`,
    accountDocumentId: `c7-account-${suffix}`,
    username: `mutable-${suffix}`,
    email: `${suffix}@example.invalid`,
    provider: "local",
    accountName: `Account ${suffix}`,
    accountType: "Explorer",
    accountMobile: "+15555550100",
    internalUsername: `c7-owner-${suffix}`,
    password: `disabled-password-${suffix}`,
    guestUrl: `c7-public-${suffix}`,
    guestCapabilityHash: Buffer.from(suffix).toString("hex").padEnd(64, "a").slice(0, 64),
    operationId: `provision-${suffix}`,
    requestId: `request-${suffix}`,
  };
}

async function ageOperations(operationIds: string[], seconds: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE music_identity_lifecycle_operations DISABLE TRIGGER music_lifecycle_operation_state");
    await client.query(
      "UPDATE music_identity_lifecycle_operations SET updated_at=clock_timestamp()-make_interval(secs => $2) WHERE operation_id=ANY($1::text[])",
      [operationIds, seconds],
    );
    await client.query("ALTER TABLE music_identity_lifecycle_operations ENABLE TRIGGER music_lifecycle_operation_state");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function deferOtherOperations(operationIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE music_identity_lifecycle_operations DISABLE TRIGGER music_lifecycle_operation_state");
    await client.query(
      "UPDATE music_identity_lifecycle_operations SET updated_at=clock_timestamp()+interval '5 minutes' WHERE NOT (operation_id=ANY($1::text[]))",
      [operationIds],
    );
    await client.query("ALTER TABLE music_identity_lifecycle_operations ENABLE TRIGGER music_lifecycle_operation_state");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describePg("C7 durable Music lifecycle on PostgreSQL 15", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: exactTarget });
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^15\./);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const target = new URL(exactTarget);
    target.pathname = `/${databaseName}`;
    pool = new pg.Pool({ connectionString: target.toString(), max: 24 });
    closePool = trackPostgresPoolShutdown(pool);
    await migrateMusicDatabase(pool);
  });

  afterAll(async () => {
    await closePool?.();
    await admin?.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [databaseName]);
    await admin?.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin?.end();
  });

  it("converges concurrent prepare calls, rotates the session, revokes publication, and hides the public resource", async () => {
    // Break caught: multi-tab prepare creates divergent operations or leaves owner/public authority live.
    const repository = new MusicIdentityRepository(pool);
    const projection = await repository.ensureIdentity(identityInput("prepare"));
    await pool.query("INSERT INTO playlists(user_id,name,is_visible_to_guests) VALUES ($1,'Public',true)", [projection.id]);
    await pool.query("UPDATE users SET guest_discoverable=true WHERE id=$1", [projection.id]);

    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => repository.prepareDeletion({
      userDocumentId: "c7-user-prepare",
      accountDocumentId: "c7-account-prepare",
      operationId: `delete-prepare-${index}`,
    })));

    expect(new Set(results.map(({ operationId }) => operationId))).toEqual(new Set([results[0].operationId]));
    expect(results[0]).toMatchObject({
      musicUserId: projection.id,
      identityStatus: "pending_deletion",
      phase: "prepared",
      state: "completed",
      boundaryCrossed: false,
    });
    const row = (await pool.query("SELECT session_version,guest_discoverable,guest_capability_revoked_at FROM users WHERE id=$1", [projection.id])).rows[0];
    expect(row.session_version).toBe(projection.sessionVersion + 1);
    expect(row.guest_discoverable).toBe(false);
    expect(row.guest_capability_revoked_at).not.toBeNull();
    await expect(repository.lifecycleBinding("c7-user-prepare")).resolves.toEqual({
      disposition: "present",
      userDocumentId: "c7-user-prepare",
      accountDocumentId: "c7-account-prepare",
      identityStatus: "pending_deletion",
    });
    await expect(new MusicDomainRepository(pool).resolveGuestResource("c7-public-prepare")).resolves.toBeUndefined();
  });

  it("durably tombstones a never-provisioned tuple after authoritative upstream absence without creating a Music user", async () => {
    // Break caught: an Explorer-only identity is stranded or can be provisioned after Explorer deletion.
    const repository = new MusicIdentityRepository(pool);
    const tuple = { userDocumentId: "c7-user-never-provisioned", accountDocumentId: "c7-account-never-provisioned" };
    await expect(repository.lifecycleBinding(tuple.userDocumentId, tuple.accountDocumentId))
      .resolves.toEqual({ disposition: "not_present" });
    expect(Number((await pool.query("SELECT count(*) FROM music_identity_lifecycle_operations WHERE strapi_user_document_id=$1", [tuple.userDocumentId])).rows[0].count)).toBe(0);
    const prepared = await repository.prepareDeletion({ ...tuple, operationId: "delete-never-provisioned" });
    expect(prepared).toMatchObject({ musicUserId: null, identityStatus: "pending_deletion", boundaryCrossed: false });
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE strapi_user_document_id=$1", [tuple.userDocumentId])).rows[0].count)).toBe(0);

    await expect(repository.markDeletionBoundary(tuple)).resolves.toMatchObject({ boundaryCrossed: true, state: "requested" });
    await ageOperations(["delete-never-provisioned"], 2);
    const claim = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))
      .find(({ operationId }) => operationId === "delete-never-provisioned")!;
    expect(claim).toMatchObject({ musicUserId: null, ...tuple });
    await expect(repository.finalizeDeletion(claim)).resolves.toBe(true);
    await expect(repository.finalizeDeletion(claim)).resolves.toBe(false);
    await expect(repository.lifecycleStatus(tuple)).resolves.toMatchObject({
      musicUserId: null, identityStatus: "tombstoned", phase: "finalized", boundaryCrossed: true,
    });
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE strapi_user_document_id=$1", [tuple.userDocumentId])).rows[0].count)).toBe(0);
    await expect(repository.ensureIdentity(identityInput("never-provisioned"))).rejects.toMatchObject({ code: "IDENTITY_TOMBSTONED" });
    await expect(repository.lifecycleBinding(tuple.userDocumentId, "replacement-account"))
      .rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
  });

  it("fences ensure behind a nullable deletion both before and after the upstream boundary", async () => {
    // Break caught: ensure creates an active owner after a never-provisioned tuple entered durable deletion.
    const repository = new MusicIdentityRepository(pool);
    const tuple = { userDocumentId: "c7-user-nullable-delete-guard", accountDocumentId: "c7-account-nullable-delete-guard" };
    await repository.prepareDeletion({ ...tuple, operationId: "delete-nullable-guard" });

    await expect(repository.ensureIdentity(identityInput("nullable-delete-guard")))
      .rejects.toMatchObject({ code: "IDENTITY_PENDING_DELETION" });
    await repository.markDeletionBoundary(tuple);
    await expect(repository.ensureIdentity(identityInput("nullable-delete-guard")))
      .rejects.toMatchObject({ code: "IDENTITY_PENDING_DELETION" });
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE strapi_user_document_id=$1", [tuple.userDocumentId])).rows[0].count)).toBe(0);

    await ageOperations(["delete-nullable-guard"], 2);
    const claim = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))
      .find(({ operationId }) => operationId === "delete-nullable-guard")!;
    await expect(repository.finalizeDeletion(claim)).resolves.toBe(true);
    await expect(repository.ensureIdentity(identityInput("nullable-delete-guard")))
      .rejects.toMatchObject({ code: "IDENTITY_TOMBSTONED" });
  });

  it("rejects suspension and reactivation for exact nullable and former-owner tombstones", async () => {
    // Break caught: permanent deletion is reported as ordinary absence and public reactivation restores Strapi only.
    const repository = new MusicIdentityRepository(pool);
    const finalize = async (suffix: string, provisioned: boolean) => {
      const tuple = { userDocumentId: `c7-user-${suffix}`, accountDocumentId: `c7-account-${suffix}` };
      if (provisioned) await repository.ensureIdentity(identityInput(suffix));
      const prepared = await repository.prepareDeletion({ ...tuple, operationId: `delete-${suffix}` });
      await repository.markDeletionBoundary(tuple);
      await ageOperations([prepared.operationId], 2);
      const claim = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))
        .find(({ operationId }) => operationId === prepared.operationId)!;
      await expect(repository.finalizeDeletion(claim)).resolves.toBe(true);
      return tuple;
    };
    const tuples = [
      await finalize("nullable-tombstone-transition", false),
      await finalize("numeric-tombstone-transition", true),
    ];

    for (const [index, tuple] of tuples.entries()) {
      const before = Number((await pool.query(`SELECT count(*) FROM music_identity_lifecycle_operations
        WHERE strapi_user_document_id=$1 AND operation_kind IN ('suspend','reactivate')`, [tuple.userDocumentId])).rows[0].count);
      await expect(repository.suspendIdentity({ ...tuple, operationId: `suspend-tombstone-${index}` }))
        .rejects.toMatchObject({ code: "IDENTITY_TOMBSTONED", status: 409 });
      await expect(repository.reactivateIdentity({ ...tuple, operationId: `reactivate-tombstone-${index}` }))
        .rejects.toMatchObject({ code: "IDENTITY_TOMBSTONED", status: 409 });
      const after = Number((await pool.query(`SELECT count(*) FROM music_identity_lifecycle_operations
        WHERE strapi_user_document_id=$1 AND operation_kind IN ('suspend','reactivate')`, [tuple.userDocumentId])).rows[0].count);
      expect(after).toBe(before);
      await expect(repository.ensureIdentity(identityInput(index === 0 ? "nullable-tombstone-transition" : "numeric-tombstone-transition")))
        .rejects.toMatchObject({ code: "IDENTITY_TOMBSTONED" });
    }
  });

  it("rejects suspension throughout prepared crossed running and dead-letter nullable deletion states", async () => {
    // Break caught: stale Settings deactivation swallows durable deletion authority as a successful no-owner suspension.
    const repository = new MusicIdentityRepository(pool);
    const assertDenied = async (tuple: { userDocumentId: string; accountDocumentId: string }, label: string) => {
      const before = Number((await pool.query(`SELECT count(*) FROM music_identity_lifecycle_operations
        WHERE strapi_user_document_id=$1 AND operation_kind IN ('suspend','reactivate')`, [tuple.userDocumentId])).rows[0].count);
      await expect(repository.suspendIdentity({ ...tuple, operationId: `suspend-during-${label}` }))
        .rejects.toMatchObject({ code: "IDENTITY_PENDING_DELETION", status: 409 });
      const after = Number((await pool.query(`SELECT count(*) FROM music_identity_lifecycle_operations
        WHERE strapi_user_document_id=$1 AND operation_kind IN ('suspend','reactivate')`, [tuple.userDocumentId])).rows[0].count);
      expect(after).toBe(before);
    };

    const preparedTuple = { userDocumentId: "c7-user-delete-prepared-suspend", accountDocumentId: "c7-account-delete-prepared-suspend" };
    const prepared = await repository.prepareDeletion({ ...preparedTuple, operationId: "delete-prepared-suspend" });
    await assertDenied(preparedTuple, "prepared");
    await expect(repository.cancelDeletion({ ...preparedTuple, operationId: "cancel-prepared-suspend" }))
      .resolves.toMatchObject({ state: "cancelled" });

    const crossedTuple = { userDocumentId: "c7-user-delete-crossed-suspend", accountDocumentId: "c7-account-delete-crossed-suspend" };
    const crossed = await repository.prepareDeletion({ ...crossedTuple, operationId: "delete-crossed-suspend" });
    await repository.markDeletionBoundary(crossedTuple);
    await assertDenied(crossedTuple, "crossed");
    await ageOperations([crossed.operationId], 2);
    const crossedClaim = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))[0];
    await expect(repository.finalizeDeletion(crossedClaim)).resolves.toBe(true);

    const runningTuple = { userDocumentId: "c7-user-delete-running-suspend", accountDocumentId: "c7-account-delete-running-suspend" };
    const running = await repository.prepareDeletion({ ...runningTuple, operationId: "delete-running-suspend" });
    await repository.markDeletionBoundary(runningTuple);
    await ageOperations([running.operationId], 2);
    const runningClaim = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))[0];
    await assertDenied(runningTuple, "running");
    await expect(repository.finalizeDeletion(runningClaim)).resolves.toBe(true);

    const deadTuple = { userDocumentId: "c7-user-delete-dead-suspend", accountDocumentId: "c7-account-delete-dead-suspend" };
    const dead = await repository.prepareDeletion({ ...deadTuple, operationId: "delete-dead-suspend" });
    await repository.markDeletionBoundary(deadTuple);
    await ageOperations([dead.operationId], 2);
    await expect(repository.claimDueDeletions({ batchSize: 1, maxAttempts: 2 })).resolves.toHaveLength(1);
    await ageOperations([dead.operationId], 46);
    await expect(repository.claimDueDeletions({ batchSize: 1, maxAttempts: 2 })).resolves.toEqual([]);
    await expect(repository.lifecycleStatus(deadTuple)).resolves.toMatchObject({ state: "failed", deadLetter: true });
    await assertDenied(deadTuple, "dead-letter");
    await expect(repository.rearmDeletion(dead.operationId)).resolves.toBe(true);
    await ageOperations([dead.operationId], 3);
    const repaired = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 2 }))[0];
    await expect(repository.finalizeDeletion(repaired)).resolves.toBe(true);
    expect(prepared.operationId).toBe("delete-prepared-suspend");
  });

  it("serializes prepare-first against a second repository ensure without creating an active owner", async () => {
    // Break caught: a nullable prepare commits while an already-waiting ensure ignores its durable authority.
    let releaseWrite!: () => void;
    let reportWrite!: () => void;
    const writeEntered = new Promise<void>((resolve) => { reportWrite = resolve; });
    const holdWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const prepareRepository = new MusicIdentityRepository(pool, { afterWrite: async () => { reportWrite(); await holdWrite; } });
    const ensureRepository = new MusicIdentityRepository(pool);
    const tuple = { userDocumentId: "c7-user-prepare-race-first", accountDocumentId: "c7-account-prepare-race-first" };

    const preparing = prepareRepository.prepareDeletion({ ...tuple, operationId: "delete-prepare-race-first" });
    await writeEntered;
    const ensuring = ensureRepository.ensureIdentity(identityInput("prepare-race-first"));
    releaseWrite();

    await expect(preparing).resolves.toMatchObject({ musicUserId: null, identityStatus: "pending_deletion" });
    await expect(ensuring).rejects.toMatchObject({ code: "IDENTITY_PENDING_DELETION" });
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE strapi_user_document_id=$1", [tuple.userDocumentId])).rows[0].count)).toBe(0);
  });

  it("serializes ensure-first against a second repository prepare into one pending numeric owner", async () => {
    // Break caught: opposite queue order leaves an active owner alongside a nullable deletion operation.
    let releaseWrite!: () => void;
    let reportWrite!: () => void;
    const writeEntered = new Promise<void>((resolve) => { reportWrite = resolve; });
    const holdWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const ensureRepository = new MusicIdentityRepository(pool, { afterWrite: async () => { reportWrite(); await holdWrite; } });
    const prepareRepository = new MusicIdentityRepository(pool);
    const tuple = { userDocumentId: "c7-user-ensure-race-first", accountDocumentId: "c7-account-ensure-race-first" };

    const ensuring = ensureRepository.ensureIdentity(identityInput("ensure-race-first"));
    await writeEntered;
    const preparing = prepareRepository.prepareDeletion({ ...tuple, operationId: "delete-ensure-race-first" });
    releaseWrite();

    const ensured = await ensuring;
    await expect(preparing).resolves.toMatchObject({ musicUserId: ensured.id, identityStatus: "pending_deletion" });
    expect(Number((await pool.query(`SELECT count(*) FROM music_identity_lifecycle_operations
      WHERE strapi_user_document_id=$1 AND music_user_id IS NULL`, [tuple.userDocumentId])).rows[0].count)).toBe(0);
    await expect(prepareRepository.findByExternalIdentity(tuple.userDocumentId))
      .resolves.toMatchObject({ id: ensured.id, identityStatus: "pending_deletion" });
  });

  it("serializes absent-suspend-first against ensure and leaves no active owner", async () => {
    // Break caught: a suspended Explorer can provision while the nullable suspension transaction commits.
    let releaseWrite!: () => void;
    let reportWrite!: () => void;
    const writeEntered = new Promise<void>((resolve) => { reportWrite = resolve; });
    const holdWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const suspendRepository = new MusicIdentityRepository(pool, { afterWrite: async () => { reportWrite(); await holdWrite; } });
    const ensureRepository = new MusicIdentityRepository(pool);
    const tuple = { userDocumentId: "c7-user-suspend-race-first", accountDocumentId: "c7-account-suspend-race-first" };

    const suspending = (suspendRepository as MusicIdentityRepository & {
      suspendIdentity(input: typeof tuple & { operationId: string }): Promise<{ identityStatus: string }>;
    }).suspendIdentity({ ...tuple, operationId: "suspend-race-first" });
    await writeEntered;
    const ensuring = ensureRepository.ensureIdentity(identityInput("suspend-race-first"));
    releaseWrite();

    await expect(suspending).resolves.toMatchObject({ identityStatus: "not_present" });
    await expect(ensuring).rejects.toMatchObject({ code: "IDENTITY_SUSPENDED" });
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE strapi_user_document_id=$1", [tuple.userDocumentId])).rows[0].count)).toBe(0);
  });

  it("serializes ensure-first against absent suspension into one suspended numeric owner", async () => {
    // Break caught: suspension records a nullable no-op after a concurrent ensure already created an active owner.
    let releaseWrite!: () => void;
    let reportWrite!: () => void;
    const writeEntered = new Promise<void>((resolve) => { reportWrite = resolve; });
    const holdWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const ensureRepository = new MusicIdentityRepository(pool, { afterWrite: async () => { reportWrite(); await holdWrite; } });
    const suspendRepository = new MusicIdentityRepository(pool);
    const tuple = { userDocumentId: "c7-user-ensure-before-suspend", accountDocumentId: "c7-account-ensure-before-suspend" };

    const ensuring = ensureRepository.ensureIdentity(identityInput("ensure-before-suspend"));
    await writeEntered;
    let suspending: Promise<{ id?: number; identityStatus: string }>;
    try {
      suspending = (suspendRepository as MusicIdentityRepository & {
        suspendIdentity(input: typeof tuple & { operationId: string }): Promise<{ id?: number; identityStatus: string }>;
      }).suspendIdentity({ ...tuple, operationId: "suspend-after-ensure" });
    } finally {
      releaseWrite();
    }

    const ensured = await ensuring;
    await expect(suspending).resolves.toMatchObject({ id: ensured.id, identityStatus: "suspended" });
    await expect(suspendRepository.findByExternalIdentity(tuple.userDocumentId))
      .resolves.toMatchObject({ id: ensured.id, identityStatus: "suspended", sessionVersion: ensured.sessionVersion + 1 });
  });

  it("persists an absent suspension guard until exact reactivation and keeps token/public authority unavailable", async () => {
    // Break caught: a transient not-present acknowledgement lets ensure provision an active owner after deactivation.
    const repository = new MusicIdentityRepository(pool);
    const tuple = { userDocumentId: "c7-user-absent-suspend-guard", accountDocumentId: "c7-account-absent-suspend-guard" };
    const service = new MusicLifecycleService({
      resolve: async () => ({
        ...identityInput("absent-suspend-guard"),
        ...tuple,
        username: "absent-suspend-guard",
        provider: "local" as const,
      }),
      resolveUser: async () => ({ userDocumentId: tuple.userDocumentId }),
    }, repository, {
      operationIdFactory: () => "suspend-absent-guard",
      disconnectOwner: async () => undefined,
    });

    await expect(service.suspendFromProof("proof", "request-suspend-guard")).resolves.toMatchObject({ identityStatus: "not_present" });
    expect(Number((await pool.query(`SELECT count(*) FROM music_identity_lifecycle_operations
      WHERE operation_id='suspend-absent-guard' AND music_user_id IS NULL`, [])).rows[0].count)).toBe(1);
    await expect(repository.ensureIdentity(identityInput("absent-suspend-guard")))
      .rejects.toMatchObject({ code: "IDENTITY_SUSPENDED" });
    await expect(repository.resolveCredentialSubject(tuple.userDocumentId)).resolves.toEqual({ identity: undefined, tombstoned: false });
    const tokens = new MusicTokenService({
      current: { kid: "c7-absent-suspend", secret: Buffer.alloc(32, 23).toString("base64url") },
      tokenLifetimeSeconds: 600,
      clockSkewSeconds: 0,
    });
    const impossibleCredential = tokens.mint({
      id: 999_999,
      strapiUserDocumentId: tuple.userDocumentId,
      strapiAccountDocumentId: tuple.accountDocumentId,
      identityStatus: "active",
      sessionVersion: 1,
    }).token;
    await expect(new MusicPrincipalService(tokens, repository).resolve(impossibleCredential))
      .rejects.toMatchObject({ code: "TOKEN_REVOKED" });
    await expect(new MusicDomainRepository(pool).resolveGuestResource("c7-public-absent-suspend-guard")).resolves.toBeUndefined();

    await expect(service.reactivateBoundIdentity({ ...tuple, operationId: "reactivate-absent-guard" }))
      .resolves.toMatchObject({ identityStatus: "not_present" });
    await expect(repository.ensureIdentity(identityInput("absent-suspend-guard")))
      .resolves.toMatchObject({ identityStatus: "active" });
  });

  it("cancels and retries an absent-identity deletion without swallowing outage or tuple conflict", async () => {
    const repository = new MusicIdentityRepository(pool);
    const tuple = { userDocumentId: "c7-user-absent-retry", accountDocumentId: "c7-account-absent-retry" };
    await repository.prepareDeletion({ ...tuple, operationId: "delete-absent-cancelled" });
    const cancelled = await repository.cancelDeletion({ ...tuple, operationId: "cancel-absent" });
    expect(cancelled).toMatchObject({ musicUserId: null, identityStatus: "not_present", state: "cancelled" });
    await expect(repository.lifecycleStatus(tuple)).resolves.toMatchObject({ identityStatus: "not_present", state: "cancelled" });
    await expect(repository.cancelDeletion({ ...tuple, operationId: "cancel-absent-lost-response" }))
      .resolves.toEqual(cancelled);
    await expect(repository.lifecycleStatus(tuple)).resolves.toEqual(cancelled);
    const service = new MusicLifecycleService({
      resolveUser: async () => ({ userDocumentId: tuple.userDocumentId }),
      resolve: async () => ({
        ...identityInput("absent-retry"), ...tuple, username: "absent-retry", provider: "local" as const,
      }),
    }, repository, {
      operationIdFactory: () => "cancel-absent-service-replay",
      disconnectOwner: async () => undefined,
    });
    await expect(service.status("proof", "request-cancel-status-reload")).resolves.toMatchObject({
      musicUserId: null, identityStatus: "not_present", state: "cancelled", boundaryCrossed: false,
      upstreamUserDocumentId: tuple.userDocumentId, upstreamAccountDocumentId: tuple.accountDocumentId,
    });
    await expect(service.cancelDeletion("proof", "request-cancel-lost-response"))
      .resolves.toMatchObject({ musicUserId: null, identityStatus: "not_present", state: "cancelled" });
    await expect(repository.markDeletionBoundary({ ...tuple, accountDocumentId: "replacement-account" }))
      .rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });

    const prepared = await repository.prepareDeletion({ ...tuple, operationId: "delete-absent-retry" });
    expect(prepared.operationId).toBe("delete-absent-retry");
    await repository.markDeletionBoundary(tuple);
    await ageOperations([prepared.operationId], 2);
    const first = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))[0];
    expect(first).toMatchObject({ musicUserId: null, ...tuple });
    await expect(repository.recordDeletionObservation(first, "outage", false)).resolves.toBe(true);
    await expect(repository.lifecycleStatus(tuple)).resolves.toMatchObject({
      identityStatus: "pending_deletion", state: "requested", boundaryCrossed: true, retryable: true,
    });
    await ageOperations([prepared.operationId], 3);
    const retry = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))[0];
    expect(retry.attemptCount).toBe(first.attemptCount + 1);
    await expect(repository.finalizeDeletion(retry)).resolves.toBe(true);
    await expect(repository.lifecycleStatus(tuple)).resolves.toMatchObject({ identityStatus: "tombstoned" });
  });

  it("dead-letters an expired absent-identity claim and requires explicit repair before one final success", async () => {
    const repository = new MusicIdentityRepository(pool);
    const tuple = { userDocumentId: "c7-user-absent-repair", accountDocumentId: "c7-account-absent-repair" };
    const prepared = await repository.prepareDeletion({ ...tuple, operationId: "delete-absent-repair" });
    await repository.markDeletionBoundary(tuple);
    await ageOperations([prepared.operationId], 2);
    const crashed = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 2 }))[0];
    expect(crashed).toMatchObject({ musicUserId: null, attemptCount: 2 });
    await ageOperations([prepared.operationId], 46);
    await expect(repository.claimDueDeletions({ batchSize: 1, maxAttempts: 2 })).resolves.toEqual([]);
    await expect(repository.lifecycleStatus(tuple)).resolves.toMatchObject({ state: "failed", deadLetter: true, retryable: false });

    await expect(repository.rearmDeletion(prepared.operationId)).resolves.toBe(true);
    await ageOperations([prepared.operationId], 3);
    const repaired = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 2 }))[0];
    expect(repaired).toMatchObject({ musicUserId: null, attemptCount: 3 });
    await expect(repository.finalizeDeletion(repaired)).resolves.toBe(true);
    await expect(repository.finalizeDeletion(repaired)).resolves.toBe(false);
  });

  it("cancels only before the durable upstream-attempt boundary", async () => {
    // Break caught: cancellation racing past an irreversible upstream deletion attempt.
    const repository = new MusicIdentityRepository(pool);
    await repository.ensureIdentity(identityInput("cancel"));
    const prepared = await repository.prepareDeletion({
      userDocumentId: "c7-user-cancel", accountDocumentId: "c7-account-cancel", operationId: "delete-cancel",
    });
    const cancelled = await repository.cancelDeletion({
      userDocumentId: "c7-user-cancel", accountDocumentId: "c7-account-cancel", operationId: "cancel-cancel",
    });
    expect(cancelled).toMatchObject({ identityStatus: "suspended", state: "cancelled", boundaryCrossed: false });
    await expect(repository.lifecycleStatus({ userDocumentId: "c7-user-cancel", accountDocumentId: "c7-account-cancel" }))
      .resolves.toMatchObject({ identityStatus: "suspended", phase: "prepared", state: "cancelled", boundaryCrossed: false });

    await repository.transitionIdentity({
      strapiUserDocumentId: "c7-user-cancel", operationId: "reactivate-cancel", kind: "reactivate", targetStatus: "active",
    });
    await repository.prepareDeletion({
      userDocumentId: "c7-user-cancel", accountDocumentId: "c7-account-cancel", operationId: "delete-boundary",
    });
    await repository.markDeletionBoundary({ userDocumentId: "c7-user-cancel", accountDocumentId: "c7-account-cancel" });
    await expect(repository.cancelDeletion({
      userDocumentId: "c7-user-cancel", accountDocumentId: "c7-account-cancel", operationId: "cancel-too-late",
    })).rejects.toMatchObject({ code: "LIFECYCLE_CANCEL_FORBIDDEN", status: 409 });
    expect(prepared.operationId).toBe("delete-cancel");
  });

  it("claims once, retains only safe aggregate data, atomically tombstones, and denies recreation", async () => {
    // Break caught: cleanup before absence, partial PII retention, duplicate workers, or identity recreation.
    const repository = new MusicIdentityRepository(pool);
    const projection = await repository.ensureIdentity(identityInput("finalize"));
    await pool.query("INSERT INTO youtube_api_usage(endpoint_type,user_id,quota_cost) VALUES ('search',$1,100)", [projection.id]);
    await pool.query("INSERT INTO guest_interactions(user_id,guest_id,interaction_type) VALUES ($1,'pii-guest','view')", [projection.id]);
    await pool.query("INSERT INTO activity_logs(user_id,event_type,event_data) VALUES ($1,'login','{\"email\":\"pii@example.invalid\"}')", [projection.id]);
    await pool.query("INSERT INTO playlists(user_id,name) VALUES ($1,'private content')", [projection.id]);
    const tokenId = (await pool.query("INSERT INTO api_tokens(token,name,user_id,scopes) VALUES ('secret-token','secret',$1,'{}') RETURNING id", [projection.id])).rows[0].id;
    const templateId = (await pool.query(`INSERT INTO email_templates(name,subject,html_content,text_content,variables,created_by)
      VALUES ('private-template','private subject','private html','private text','{"email":"private@example.invalid"}',$1) RETURNING id`, [projection.id])).rows[0].id;
    await pool.query(`INSERT INTO email_logs(recipient,subject,template_id,status,error_message,api_token_id,message_id,metadata,variables)
      VALUES ('recipient@example.invalid','token subject',NULL,'failed','private error',$1,'private-message-token','{"email":"private@example.invalid"}','private variables')`, [tokenId]);
    await pool.query(`INSERT INTO email_logs(recipient,subject,template_id,status,error_message,api_token_id,message_id,metadata,variables)
      VALUES ('recipient2@example.invalid','template subject',$1,'failed','private error',NULL,'private-message-template','{"email":"private2@example.invalid"}','private variables')`, [templateId]);
    const sharedOwner = await repository.ensureIdentity(identityInput("shared-page-owner"));
    await pool.query("INSERT INTO page_contents(slug,title,content,created_by,updated_by) VALUES ('private-page','Private','private body',$1,$1)", [projection.id]);
    await pool.query("INSERT INTO page_contents(slug,title,content,created_by,updated_by) VALUES ('shared-page','Shared','shared body',$1,$2)", [sharedOwner.id,projection.id]);
    await repository.prepareDeletion({
      userDocumentId: "c7-user-finalize", accountDocumentId: "c7-account-finalize", operationId: "delete-finalize",
    });
    await repository.markDeletionBoundary({ userDocumentId: "c7-user-finalize", accountDocumentId: "c7-account-finalize" });
    await ageOperations(["delete-finalize"], 2);

    const [first, second] = await Promise.all([
      repository.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }),
      repository.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }),
    ]);
    const targetClaims = [...first, ...second].filter(({ operationId }) => operationId === "delete-finalize");
    expect(targetClaims).toHaveLength(1);
    const claimed = targetClaims[0];
    await expect(repository.finalizeDeletion(claimed)).resolves.toBe(true);
    await expect(repository.finalizeDeletion(claimed)).resolves.toBe(false);

    expect(Number((await pool.query("SELECT count(*) FROM users WHERE id=$1", [projection.id])).rows[0].count)).toBe(0);
    expect((await pool.query("SELECT user_id FROM youtube_api_usage WHERE endpoint_type='search'")).rows[0].user_id).toBeNull();
    expect(Number((await pool.query("SELECT count(*) FROM guest_interactions WHERE user_id=$1", [projection.id])).rows[0].count)).toBe(0);
    expect(Number((await pool.query("SELECT count(*) FROM email_logs WHERE id IN (SELECT id FROM email_logs WHERE recipient LIKE 'recipient%@example.invalid')")).rows[0].count)).toBe(0);
    expect(Number((await pool.query("SELECT count(*) FROM page_contents WHERE slug='private-page'")).rows[0].count)).toBe(0);
    expect((await pool.query("SELECT created_by,updated_by,content FROM page_contents WHERE slug='shared-page'")).rows[0])
      .toEqual({ created_by: sharedOwner.id, updated_by: null, content: "shared body" });
    const tombstone = (await pool.query("SELECT music_user_id,lifecycle_operation_id,retention_stage FROM music_identity_tombstones WHERE strapi_user_document_id='c7-user-finalize'")).rows[0];
    expect(tombstone).toEqual({ music_user_id: projection.id, lifecycle_operation_id: "delete-finalize", retention_stage: "classified-v1" });
    await expect(repository.ensureIdentity(identityInput("finalize"))).rejects.toMatchObject({ code: "IDENTITY_TOMBSTONED" });
  });

  it("rolls back the complete retention transaction when cleanup fails", async () => {
    // Break caught: a partial cleanup commits before the tombstone/finalization operation.
    const base = new MusicIdentityRepository(pool);
    const projection = await base.ensureIdentity(identityInput("rollback"));
    await pool.query("INSERT INTO playlists(user_id,name) VALUES ($1,'must survive rollback')", [projection.id]);
    const tokenId = (await pool.query("INSERT INTO api_tokens(token,name,user_id,scopes) VALUES ('rollback-token','rollback',$1,'{}') RETURNING id", [projection.id])).rows[0].id;
    await pool.query("INSERT INTO email_logs(recipient,subject,status,api_token_id) VALUES ('rollback@example.invalid','rollback','failed',$1)", [tokenId]);
    await pool.query("INSERT INTO page_contents(slug,title,content,created_by,updated_by) VALUES ('rollback-page','Rollback','must survive',$1,$1)", [projection.id]);
    await base.prepareDeletion({
      userDocumentId: "c7-user-rollback", accountDocumentId: "c7-account-rollback", operationId: "delete-rollback",
    });
    await base.markDeletionBoundary({ userDocumentId: "c7-user-rollback", accountDocumentId: "c7-account-rollback" });
    await ageOperations(["delete-rollback"], 2);
    const claimed = (await base.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))
      .find(({ operationId }) => operationId === "delete-rollback")!;
    const failing = new MusicIdentityRepository(pool, {
      afterRetentionCleanup: async () => { throw new Error("injected-retention-failure"); },
    });

    await expect(failing.finalizeDeletion(claimed)).rejects.toThrow("injected-retention-failure");
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE id=$1", [projection.id])).rows[0].count)).toBe(1);
    expect(Number((await pool.query("SELECT count(*) FROM playlists WHERE user_id=$1", [projection.id])).rows[0].count)).toBe(1);
    expect(Number((await pool.query("SELECT count(*) FROM email_logs WHERE recipient='rollback@example.invalid'")).rows[0].count)).toBe(1);
    expect(Number((await pool.query("SELECT count(*) FROM page_contents WHERE slug='rollback-page'")).rows[0].count)).toBe(1);
    expect(Number((await pool.query("SELECT count(*) FROM music_identity_tombstones WHERE music_user_id=$1", [projection.id])).rows[0].count)).toBe(0);
  });

  it("suspends and reactivates the stable owner/content without restoring publication authority", async () => {
    // Break caught: suspension remaps/deletes content or reactivation silently republishes it.
    const repository = new MusicIdentityRepository(pool);
    const projection = await repository.ensureIdentity(identityInput("suspend"));
    const tokens = new MusicTokenService({
      current: { kid: "c7-suspend", secret: Buffer.alloc(32, 17).toString("base64url") },
      tokenLifetimeSeconds: 600,
      clockSkewSeconds: 0,
    });
    const principals = new MusicPrincipalService(tokens, repository);
    const oldCredential = tokens.mint(projection).token;
    await pool.query("INSERT INTO playlists(user_id,name,is_visible_to_guests) VALUES ($1,'preserved',true)", [projection.id]);
    await pool.query("UPDATE users SET guest_discoverable=true WHERE id=$1", [projection.id]);
    const suspended = await repository.suspendIdentity({
      userDocumentId: "c7-user-suspend", accountDocumentId: "c7-account-suspend", operationId: "suspend-c7",
    });
    expect(suspended.identityStatus).not.toBe("not_present");
    if (suspended.identityStatus === "not_present") throw new Error("numeric suspension unexpectedly absent");
    expect(suspended).toMatchObject({ id: projection.id, identityStatus: "suspended", sessionVersion: projection.sessionVersion + 1 });
    await expect(principals.resolve(oldCredential)).rejects.toMatchObject({ code: "IDENTITY_SUSPENDED" });
    expect(await new MusicDomainRepository(pool).resolveGuestResource("c7-public-suspend")).toBeUndefined();
    const reactivated = await repository.reactivateIdentity({
      userDocumentId: "c7-user-suspend", accountDocumentId: "c7-account-suspend", operationId: "reactivate-c7",
    });
    expect(reactivated.identityStatus).not.toBe("not_present");
    if (reactivated.identityStatus === "not_present") throw new Error("numeric reactivation unexpectedly absent");
    expect(reactivated).toMatchObject({ id: projection.id, identityStatus: "active", sessionVersion: suspended.sessionVersion + 1 });
    const replay = await repository.reactivateIdentity({
      userDocumentId: "c7-user-suspend", accountDocumentId: "c7-account-suspend", operationId: "reactivate-c7",
    });
    expect(replay).toEqual(reactivated);
    await expect(principals.resolve(oldCredential)).rejects.toMatchObject({ code: "TOKEN_REVOKED" });
    expect(Number((await pool.query("SELECT count(*) FROM playlists WHERE user_id=$1", [projection.id])).rows[0].count)).toBe(1);
    expect(await new MusicDomainRepository(pool).resolveGuestResource("c7-public-suspend")).toBeUndefined();
  });

  it("revokes a previously valid C5 credential in the prepare transaction", async () => {
    // Break caught: a stale browser credential remains usable after prepare commits.
    const repository = new MusicIdentityRepository(pool);
    const projection = await repository.ensureIdentity(identityInput("stale-token"));
    const tokens = new MusicTokenService({
      current: { kid: "c7-current", secret: Buffer.alloc(32, 7).toString("base64url") },
      tokenLifetimeSeconds: 600,
      clockSkewSeconds: 0,
    });
    const principals = new MusicPrincipalService(tokens, repository);
    const credential = tokens.mint(projection).token;
    await expect(principals.resolve(credential)).resolves.toMatchObject({ musicUserId: projection.id });
    await repository.prepareDeletion({
      userDocumentId: "c7-user-stale-token", accountDocumentId: "c7-account-stale-token", operationId: "delete-stale-token",
    });
    await expect(principals.resolve(credential)).rejects.toMatchObject({ code: "IDENTITY_PENDING_DELETION", status: 409 });
  });

  it("persists retry backoff, typed dead-letter state, and authoritative manual repair", async () => {
    // Break caught: presence/outage deletes data, spins immediately, or cannot be safely repaired.
    const repository = new MusicIdentityRepository(pool);
    const projection = await repository.ensureIdentity(identityInput("retry"));
    await pool.query("INSERT INTO playlists(user_id,name) VALUES ($1,'retain until absence')", [projection.id]);
    await repository.prepareDeletion({
      userDocumentId: "c7-user-retry", accountDocumentId: "c7-account-retry", operationId: "delete-retry",
    });
    await repository.markDeletionBoundary({ userDocumentId: "c7-user-retry", accountDocumentId: "c7-account-retry" });
    await ageOperations(["delete-retry"], 2);
    const first = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 3 }))
      .find(({ operationId }) => operationId === "delete-retry")!;
    await repository.recordDeletionObservation(first, "present", false);
    expect(Number((await pool.query("SELECT count(*) FROM playlists WHERE user_id=$1", [projection.id])).rows[0].count)).toBe(1);
    const immediate = await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 3 });
    expect(immediate.some(({ operationId }) => operationId === "delete-retry")).toBe(false);
    await ageOperations(["delete-retry"], 3);
    const second = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 3 }))
      .find(({ operationId }) => operationId === "delete-retry")!;
    await repository.recordDeletionObservation(second, "outage", true);
    await expect(repository.lifecycleStatus({ userDocumentId: "c7-user-retry", accountDocumentId: "c7-account-retry" }))
      .resolves.toMatchObject({ state: "failed", deadLetter: true, retryable: false });
    await expect(manuallyRepairMusicDeletion({
      operationId: second.operationId,
      rearmDeletion: (operationId) => repository.rearmDeletion(operationId),
    })).resolves.toBe(true);
    await ageOperations(["delete-retry"], 5);
    const repaired = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 3 }))
      .find(({ operationId }) => operationId === "delete-retry")!;
    expect(repaired.attemptCount).toBeGreaterThan(second.attemptCount);
    await expect(repository.finalizeDeletion(repaired)).resolves.toBe(true);
    await expect(repository.finalizeDeletion(repaired)).resolves.toBe(false);
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE id=$1", [projection.id])).rows[0].count)).toBe(0);
  });

  it("consumes one manual-repair authorization so an expired repair lease dead-letters again", async () => {
    // Break caught: a preserved repair marker permits unbounded claims after the repair worker crashes.
    const repository = new MusicIdentityRepository(pool);
    await repository.ensureIdentity(identityInput("repair-crash"));
    await repository.prepareDeletion({
      userDocumentId: "c7-user-repair-crash", accountDocumentId: "c7-account-repair-crash", operationId: "delete-repair-crash",
    });
    await repository.markDeletionBoundary({ userDocumentId: "c7-user-repair-crash", accountDocumentId: "c7-account-repair-crash" });
    await ageOperations(["delete-repair-crash"], 2);
    const first = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 2 }))
      .find(({ operationId }) => operationId === "delete-repair-crash")!;
    await repository.recordDeletionObservation(first, "outage", true);
    await expect(repository.rearmDeletion("delete-repair-crash")).resolves.toBe(true);
    await ageOperations(["delete-repair-crash"], 3);
    const repaired = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 2 }))
      .find(({ operationId }) => operationId === "delete-repair-crash")!;
    expect(repaired.attemptCount).toBeGreaterThan(2);

    await ageOperations(["delete-repair-crash"], 46);
    const afterExpiredLease = await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 2 });
    expect(afterExpiredLease.some(({ operationId }) => operationId === "delete-repair-crash")).toBe(false);
    await expect(repository.lifecycleStatus({
      userDocumentId: "c7-user-repair-crash", accountDocumentId: "c7-account-repair-crash",
    })).resolves.toMatchObject({ state: "failed", deadLetter: true, retryable: false });
  });

  it("reclaims a stale running operation after a worker crash", async () => {
    // Break caught: a process crash after claim strands deletion in running forever.
    const repository = new MusicIdentityRepository(pool);
    await repository.ensureIdentity(identityInput("crash-recovery"));
    await repository.prepareDeletion({
      userDocumentId: "c7-user-crash-recovery",
      accountDocumentId: "c7-account-crash-recovery",
      operationId: "delete-crash-recovery",
    });
    await repository.markDeletionBoundary({
      userDocumentId: "c7-user-crash-recovery", accountDocumentId: "c7-account-crash-recovery",
    });
    await ageOperations(["delete-crash-recovery"], 2);
    const first = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))
      .find(({ operationId }) => operationId === "delete-crash-recovery")!;
    expect(first.attemptCount).toBe(2);

    await ageOperations(["delete-crash-recovery"], 46);
    const reclaimed = (await repository.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))
      .find(({ operationId }) => operationId === "delete-crash-recovery");
    expect(reclaimed).toMatchObject({ operationId: "delete-crash-recovery", attemptCount: 3 });
  });

  it("claims immediately before each proof so a slow item never leases the rest of a ten-item scan", async () => {
    // Break caught: one 10-item claim leases later identities while the first 30s proof is still in flight.
    const firstReplica = new MusicIdentityRepository(pool);
    const secondReplica = new MusicIdentityRepository(pool);
    const operationIds: string[] = [];
    const operationByUser = new Map<string, string>();
    for (let index = 0; index < 10; index += 1) {
      const suffix = `per-item-${String(index).padStart(2, "0")}`;
      const operationId = `delete-${suffix}`;
      operationIds.push(operationId);
      operationByUser.set(`c7-user-${suffix}`, operationId);
      await firstReplica.ensureIdentity(identityInput(suffix));
      await firstReplica.prepareDeletion({
        userDocumentId: `c7-user-${suffix}`,
        accountDocumentId: `c7-account-${suffix}`,
        operationId,
      });
      await firstReplica.markDeletionBoundary({
        userDocumentId: `c7-user-${suffix}`,
        accountDocumentId: `c7-account-${suffix}`,
      });
    }
    await ageOperations(operationIds, 2);
    // This file intentionally shares one database across sequential cases. Keep
    // earlier cases' unfinished operations out of this worker's bounded scan so
    // the first claimed identity always belongs to the ten rows under test.
    await deferOtherOperations(operationIds);
    await expect(firstReplica.claimDueDeletions({ batchSize: 10, maxAttempts: 5 }))
      .rejects.toMatchObject({ code: "REQUEST_INVALID" });

    let releaseFirstProof!: () => void;
    let notifyFirstProof!: (userDocumentId: string) => void;
    const firstProofStarted = new Promise<string>((resolve) => { notifyFirstProof = resolve; });
    const firstProofRelease = new Promise<void>((resolve) => { releaseFirstProof = resolve; });
    const firstRun = runMusicLifecycleWorkerOnce({
      repository: firstReplica,
      maxAttempts: 5,
      batchSize: 10,
      proveAbsence: async ({ userDocumentId }) => {
        notifyFirstProof(userDocumentId);
        await firstProofRelease;
        return "present";
      },
    });
    const firstUserDocumentId = await firstProofStarted;
    const firstOperationId = operationByUser.get(firstUserDocumentId)!;
    const waitingOperationIds = operationIds.filter((operationId) => operationId !== firstOperationId);

    // Simulate the old shared-lease deadline passing for every still-waiting item.
    // They remain unclaimed until replica B begins each proof, so none can be reclaimed.
    await ageOperations(waitingOperationIds, 46);
    const secondRun = await runMusicLifecycleWorkerOnce({
      repository: secondReplica,
      maxAttempts: 5,
      batchSize: 10,
      proveAbsence: async () => "present",
    });
    expect(secondRun).toEqual({ claimed: 9, finalized: 0, deferred: 9, deadLettered: 0 });
    const whileSlow = (await pool.query(
      "SELECT operation_id,attempt_count FROM music_identity_lifecycle_operations WHERE operation_id=ANY($1::text[])",
      [operationIds],
    )).rows;
    expect(whileSlow.find(({ operation_id }) => operation_id === firstOperationId)?.attempt_count).toBe(2);
    expect(whileSlow.filter(({ operation_id }) => operation_id !== firstOperationId).every(({ attempt_count }) => attempt_count === 2)).toBe(true);

    // Keep replica B's just-deferred retries outside this proof window. On a loaded
    // PG runner, processing nine rows can exceed their two-second retry backoff,
    // which would let replica A legitimately begin a later retry before it exits.
    await pool.query(
      "UPDATE music_identity_lifecycle_operations SET updated_at=clock_timestamp()+interval '5 minutes' WHERE operation_id=ANY($1::text[])",
      [waitingOperationIds],
    );

    releaseFirstProof();
    await expect(firstRun).resolves.toEqual({ claimed: 1, finalized: 0, deferred: 1, deadLettered: 0 });
    const results = (await pool.query(
      "SELECT attempt_count,error_code FROM music_identity_lifecycle_operations WHERE operation_id=ANY($1::text[])",
      [operationIds],
    )).rows;
    expect(results.every(({ attempt_count, error_code }) => attempt_count === 2 && !String(error_code ?? "").startsWith("DEAD_LETTER:"))).toBe(true);
  });

  it("fences two worker replicas by the exact attempt lease epoch", async () => {
    // Break caught: stale replica A finalizes after newer replica B proves presence/uncertainty.
    const firstReplica = new MusicIdentityRepository(pool);
    const secondReplica = new MusicIdentityRepository(pool);
    const projection = await firstReplica.ensureIdentity(identityInput("worker-fence"));
    await pool.query("INSERT INTO playlists(user_id,name) VALUES ($1,'must survive stale proof')", [projection.id]);
    await firstReplica.prepareDeletion({
      userDocumentId: "c7-user-worker-fence", accountDocumentId: "c7-account-worker-fence", operationId: "delete-worker-fence",
    });
    await firstReplica.markDeletionBoundary({ userDocumentId: "c7-user-worker-fence", accountDocumentId: "c7-account-worker-fence" });
    await ageOperations(["delete-worker-fence"], 2);
    const claimA = (await firstReplica.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))
      .find(({ operationId }) => operationId === "delete-worker-fence")!;
    expect(claimA.leaseUpdatedAt).toEqual(expect.any(String));
    const premature = await secondReplica.claimDueDeletions({
      batchSize: 1, maxAttempts: 5, now: new Date(Date.now() + 86_400_000),
    } as { batchSize: number; maxAttempts: number });
    expect(premature.some(({ operationId }) => operationId === "delete-worker-fence")).toBe(false);
    await ageOperations(["delete-worker-fence"], 46);
    const claimB = (await secondReplica.claimDueDeletions({
      batchSize: 1, maxAttempts: 5, now: new Date(Date.now() - 86_400_000),
    } as { batchSize: number; maxAttempts: number }))
      .find(({ operationId }) => operationId === "delete-worker-fence")!;
    expect(claimB.attemptCount).toBe(claimA.attemptCount + 1);
    expect(claimB.leaseUpdatedAt).not.toBe(claimA.leaseUpdatedAt);
    await secondReplica.recordDeletionObservation(claimB, "present", false);
    await expect(firstReplica.finalizeDeletion(claimA)).resolves.toBe(false);
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE id=$1", [projection.id])).rows[0].count)).toBe(1);
    expect(Number((await pool.query("SELECT count(*) FROM playlists WHERE user_id=$1", [projection.id])).rows[0].count)).toBe(1);
  });
});
