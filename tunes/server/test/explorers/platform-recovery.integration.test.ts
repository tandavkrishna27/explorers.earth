/**
 * The first executed restore in this repository's history, as a test: a migrated
 * database through a custom-format dump and back, against real PostgreSQL 15.
 *
 * pg_dump, pg_dumpall and pg_restore run from the pinned postgres:15-alpine image
 * against DATABASE_URL_TEST (host networking on Linux CI, host.docker.internal on
 * Docker Desktop), so the client major always matches the server and nothing has to
 * be installed - the same choice the host backup makes.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inspectMusicDatabase, loadMusicMigrations, migrateMusicDatabase } from "../../db/migrate";
import { provisionMusicRuntimeLogin, verifyMusicRuntimeDatabaseConnection } from "../../db/music-runtime-role";
import {
  assertDisposableRestoreTarget, assertRestoredSchema, assertRowCounts, migrateRestoredForward, planRoleBootstrap,
  PERMITTED_RESTORE_ROLES, RESTORE_DEPARSE_REPAIRS, repairRestoreDeparseDrift,
} from "../../../../scripts/platform-restore-drill";

// Same gate the other real-database suites use (music-migration.integration.test.ts).
const runIntegration = process.env.MUSIC_C3_POSTGRES_TEST === "1";
const describePostgres = runIntegration ? describe.sequential : describe.skip;

describePostgres("platform recovery round trip", () => {
  let admin: pg.Pool;
  const databases: string[] = [];
  const adminUrl = process.env.DATABASE_URL_TEST ?? "";
  const target = () => new URL(adminUrl);
  const url = (name: string) => { const value = target(); value.pathname = `/${name}`; return value.toString(); };

  /** A PostgreSQL 15 client in a throwaway container, connecting back to the test server. */
  function client(program: string, args: string[], input?: Buffer) {
    const server = target();
    const linux = process.platform === "linux";
    const result = spawnSync("docker", ["run", "--rm", "-i", ...(linux ? ["--network", "host"] : []), "--env", "PGPASSWORD",
      "postgres:15-alpine", program, "--host", linux ? server.hostname : "host.docker.internal", "--port", server.port,
      "--username", decodeURIComponent(server.username), "--no-password", ...args],
    { env: { ...process.env, PGPASSWORD: decodeURIComponent(server.password) }, input, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
    return { status: result.status, stdout: result.stdout as Buffer, stderr: String(result.stderr ?? "") };
  }

  async function freshDatabase(name: string): Promise<pg.Pool> {
    await admin.query(`CREATE DATABASE ${name}`);
    databases.push(name);
    return new pg.Pool({ connectionString: url(name), max: 4 });
  }

  async function tableCounts(pool: pg.Pool): Promise<Record<string, number>> {
    const tables = (await pool.query<{ name: string }>(
      "SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1")).rows;
    const counts: Record<string, number> = {};
    for (const { name } of tables) counts[name] = (await pool.query<{ rows: number }>(`SELECT count(*)::int AS rows FROM public."${name}"`)).rows[0].rows;
    return counts;
  }

  beforeAll(async () => {
    expect(adminUrl).toMatch(/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\//);
    admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^15\./);
  });

  afterAll(async () => {
    if (!admin) return;
    try {
      for (const name of databases.reverse()) {
        await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [name]);
        await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      }
    } finally { await admin.end(); }
  }, 120_000);

  it("round-trips a migrated database through a custom-format dump with the fingerprint intact", async () => {
    const sourceName = `platform_recovery_src_${process.pid}`;
    const source = await freshDatabase(sourceName);
    await migrateMusicDatabase(source);
    const sourceState = await inspectMusicDatabase(source);
    expect(sourceState.ready).toBe(true);
    const manifest = {
      migrationMarker: sourceState.currentId!,
      journalChecksum: sourceState.currentChecksum!,
      schemaChecksum: sourceState.schemaChecksum!,
    };
    const sourceCounts = await tableCounts(source);
    await source.end();

    const dump = client("pg_dump", ["--format=custom", "--compress=9", "--dbname", sourceName]);
    expect(dump.stderr).toBe("");
    expect(dump.status).toBe(0);
    expect(dump.stdout.subarray(0, 5).toString("latin1")).toBe("PGDMP");

    const globals = client("pg_dumpall", ["--globals-only", "--no-role-passwords"]);
    expect(globals.status).toBe(0);
    const globalsText = globals.stdout.toString("utf8");
    expect(globalsText).toContain("CREATE ROLE music_runtime");
    expect(globalsText).toContain("CREATE ROLE app_enrichment_worker_owner");
    expect(globalsText).not.toContain("SCRAM-SHA-256");

    const targetName = `explorers_restore_drill_${createHash("sha256").update(sourceName).digest("hex").slice(0, 8)}`;
    const restoredPool = await freshDatabase(targetName);
    const existing = (await admin.query<{ rolname: string }>("SELECT rolname FROM pg_roles")).rows.map(row => row.rolname);
    const plan = planRoleBootstrap(globalsText,
      { roles: [...PERMITTED_RESTORE_ROLES], migratorRole: decodeURIComponent(target().username), runtimeLoginRole: "explorers_runtime" },
      { existingRoles: existing });
    // The cluster already carries every role from the source migration, so nothing to create.
    expect(plan.create).toEqual([]);

    const restore = client("pg_restore", ["--exit-on-error", "--single-transaction", "--dbname", targetName], dump.stdout);
    expect(restore.stderr).toBe("");
    expect(restore.status).toBe(0);

    // The finding this file exists for. The journal row inside the dump records the
    // fingerprint the migration produced; inspectMusicDatabase recomputes it against
    // the restored catalog. A raw restore drifts because three varchar CHECK
    // constraints deparse differently after a round trip - so a restored production
    // database would not boot. If a future migration removes them, this expectation
    // fails and RESTORE_DEPARSE_REPAIRS should shrink with it.
    await expect(inspectMusicDatabase(restoredPool)).rejects.toThrow(/schema drift after/);
    expect(await repairRestoreDeparseDrift(restoredPool)).toBe(RESTORE_DEPARSE_REPAIRS.length);

    const restoredState = await inspectMusicDatabase(restoredPool);
    expect(assertRestoredSchema(restoredState as never, manifest)).toEqual({
      rows: sourceState.appliedIds.length, currentId: manifest.migrationMarker, pending: [],
    });
    expect(assertRowCounts(await tableCounts(restoredPool), sourceCounts)).toBe(true);
    await restoredPool.end();
  }, 600_000);

  it("refuses to restore into a populated namespace", async () => {
    const name = `explorers_restore_drill_${"b".repeat(8)}`;
    const populated = await freshDatabase(name);
    await populated.query("CREATE TABLE squatter(id int)");
    const tables = (await populated.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(row => row.table_name);
    expect(() => assertDisposableRestoreTarget(
      { connectionString: url(name).replace(/:\d+\//, ":57421/"), containerId: "a".repeat(64), owned: true, port: 57421 },
      {}, { existingTables: tables })).toThrow(/populated/);
    await populated.end();
  }, 120_000);

  it("proves that a restore stripped of owners is wrongly owned", async () => {
    // --no-owner is what the repository's earlier dump precedents use
    // (games.integration.test.ts), and it is wrong for a recovery: the restricted-role
    // attestation checks the owner of every function (music-runtime-role.ts).
    const sourceName = `platform_recovery_noowner_${process.pid}`;
    const source = await freshDatabase(sourceName);
    await migrateMusicDatabase(source);
    await source.end();
    const dump = client("pg_dump", ["--format=custom", "--no-owner", "--dbname", sourceName]);
    expect(dump.status).toBe(0);
    const targetName = `explorers_restore_drill_${"c".repeat(8)}`;
    const target = await freshDatabase(targetName);
    expect(client("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--dbname", targetName], dump.stdout).status).toBe(0);
    const owners = await target.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       JOIN pg_roles r ON r.oid=p.proowner
       WHERE n.nspname='public' AND p.proname LIKE 'app_enrichment_worker_%' AND r.rolname<>'app_enrichment_worker_owner'`);
    expect(owners.rows[0].count).toBeGreaterThan(0);
    await target.end();
  }, 600_000);

  it("migrates a restore forward as the production migrator, so the runtime attestation still passes", async () => {
    // A backup taken at an older head (the nightly 0064 dump drilled from 0066 code) is
    // owned by the production migrator, not by the drill container's login. Migrating it
    // forward as the login made 0066's new table the login's, and the runtime attestation
    // (every public table owned by the migrator) refused the drill.
    const owner = `drill_prod_migrator_${process.pid}`, login = `drill_runtime_${process.pid}`;
    await admin.query(`DROP ROLE IF EXISTS ${owner}`);
    await admin.query(`CREATE ROLE ${owner} NOLOGIN SUPERUSER`);
    const name = `platform_recovery_forward_${process.pid}`;
    (await freshDatabase(name)).end();
    await admin.query(`ALTER DATABASE ${name} OWNER TO ${owner}`);
    const restored = new pg.Pool({ connectionString: url(name), max: 2 });
    restored.on("connect", connection => { connection.query(`SET ROLE ${owner}`).catch(() => undefined); });
    const prior = loadMusicMigrations().filter(migration => migration.id < "0065");
    await migrateMusicDatabase(restored, { migrations: prior, testOnlyExpectedIds: prior.map(migration => migration.id) });
    await restored.end();

    await migrateRestoredForward(url(name), owner);

    const ownerPool = new pg.Pool({ connectionString: url(name), max: 2 });
    try {
      expect((await ownerPool.query("SELECT DISTINCT r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')")).rows)
        .toEqual([{ rolname: owner }]);
      const password = createHash("sha256").update(name).digest("base64url");
      await provisionMusicRuntimeLogin(ownerPool, { loginRole: login, password });
      const runtime = new URL(url(name)); runtime.username = login; runtime.password = password;
      await expect(verifyMusicRuntimeDatabaseConnection({ connectionString: runtime.toString(), user: login } as never, owner)).resolves.toBeUndefined();
    } finally { await ownerPool.end(); }
  }, 600_000);
});
