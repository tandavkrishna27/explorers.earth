import pg, { type Pool, type PoolConfig } from 'pg';
import { LOCAL_MUSIC_TARGET as target, parseLocalMusicManifest, type LocalMusicManifest } from '../server/config/music-local-profile';
import { inspectMusicDatabase, migrateMusicDatabase, type MusicMigrationState } from '../server/db/migrate';
import { assertMusicMigratorAuthority, assertMusicRuntimeCapabilityPreflight, provisionMusicRuntimeLogin, verifyMusicRuntimeLogin,
  readMusicRuntimeRoleGraph, validateMusicRuntimeRoleGraph } from '../server/db/music-runtime-role';

export interface LocalDatabaseStatus { ready: boolean; migrationId?: string; migrationChecksum?: string; schemaChecksum?: string }
export interface LocalDatabaseSecrets { admin: string; migrator: string; runtime: string }
export interface LocalDatabaseDependencies {
  /** Reattest the exact manifest + resource receipt before every TCP pool. */
  requireOwned(): Promise<void>;
  createPool(config: PoolConfig): Pool;
  assertMigrator: typeof assertMusicMigratorAuthority;
  preflight: typeof assertMusicRuntimeCapabilityPreflight;
  migrate: typeof migrateMusicDatabase;
  provisionRuntime: typeof provisionMusicRuntimeLogin;
  verifyRuntime: typeof verifyMusicRuntimeLogin;
  inspectSchema: typeof inspectMusicDatabase;
  readRuntimeGraph: typeof readMusicRuntimeRoleGraph;
  validateRuntimeGraph: typeof validateMusicRuntimeRoleGraph;
}
export function localDatabaseDependencies(requireOwned: () => Promise<void>): LocalDatabaseDependencies {
  return { requireOwned, createPool: (config) => { assertNoPostgresOverrides(); return new pg.Pool(config); }, assertMigrator: assertMusicMigratorAuthority,
    preflight: assertMusicRuntimeCapabilityPreflight, migrate: migrateMusicDatabase, provisionRuntime: provisionMusicRuntimeLogin,
    verifyRuntime: verifyMusicRuntimeLogin, inspectSchema: inspectMusicDatabase, readRuntimeGraph: readMusicRuntimeRoleGraph, validateRuntimeGraph: validateMusicRuntimeRoleGraph };
}
function refuse(): never { throw new Error('LOCAL_MUSIC_DATABASE_REFUSED'); }
function assertNoPostgresOverrides(): void {
  // pg's ConnectionParameters reads process.env itself, even for configured pools.
  // Reject every PG-prefixed override (including future/unsupported ones) without
  // mutating process.env or trusting the caller's injected environment snapshot.
  if (Object.entries(process.env).some(([name, value]) => value !== undefined && /^PG/i.test(name))) refuse();
}
function marker(manifest: LocalMusicManifest): string { return `explorers-local-music:${manifest.instanceId}:${manifest.ownerId}`; }
function literal(value: string): string { if (value.includes('\0')) refuse(); return `'${value.replaceAll("'", "''")}'`; }
function connection(user: string, password: string, readOnly = false): PoolConfig {
  assertNoPostgresOverrides();
  return { host: target.databaseHost, port: target.databasePort, database: target.databaseName, user, password,
    max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000, statement_timeout: 5000,
    query_timeout: 6000, options: `-c standard_conforming_strings=on -c idle_in_transaction_session_timeout=10000${readOnly ? ' -c default_transaction_read_only=on' : ''}` };
}
function status(state: MusicMigrationState): LocalDatabaseStatus {
  return { ready: state.ready === true,
    ...(state.currentId && /^\d{4}_[a-z0-9_]+$/.test(state.currentId) ? { migrationId: state.currentId } : {}),
    ...(state.currentChecksum && /^[a-f0-9]{64}$/.test(state.currentChecksum) ? { migrationChecksum: state.currentChecksum } : {}),
    ...(state.schemaChecksum && /^[a-f0-9]{64}$/.test(state.schemaChecksum) ? { schemaChecksum: state.schemaChecksum } : {}) };
}
async function identity(pool: Pool) {
  return (await pool.query(`SELECT /* local_music_identity */ current_database() AS database_name,current_user AS login_name,
    owner.rolname AS owner_name,shobj_description(database.oid,'pg_database') AS marker
    FROM pg_database database JOIN pg_roles owner ON owner.oid=database.datdba WHERE database.datname=current_database()`)).rows[0];
}
/** Active one-time bootstrap + canonical migration and denial-probe chain; never a reset. */
export async function provisionLocalMusicDatabase(manifest: LocalMusicManifest, secrets: LocalDatabaseSecrets, deps: LocalDatabaseDependencies): Promise<LocalDatabaseStatus> {
  const pools: Pool[] = [];
  try {
    parseLocalMusicManifest(manifest);
    if (new Set(Object.values(secrets)).size !== 3 || Object.values(secrets).some((value) => !/^[A-Za-z0-9_-]{43,128}$/.test(value))) refuse();
    const open = async (user: string, password: string) => { await deps.requireOwned(); const pool = deps.createPool(connection(user, password)); pools.push(pool); return pool; };
    const admin = await open('postgres', secrets.admin);
    const database = await identity(admin);
    if (!database || database.database_name !== target.databaseName || database.login_name !== 'postgres'
      || (database.marker !== null && database.marker !== marker(manifest))) refuse();
    const roles = (await admin.query(`SELECT /* local_music_roles */ rolname,rolsuper,rolcanlogin,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,
      shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1`, [target.migratorUser])).rows;
    if (database.marker === null) {
      const pristine = (await admin.query(`SELECT /* local_music_pristine */ (
        (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace) +
        (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace) +
        (SELECT count(*) FROM pg_roles WHERE rolname !~ '^pg_' AND rolname<>'postgres')
      )::text AS count`)).rows[0];
      if (database.owner_name !== 'postgres' || roles.length || pristine?.count !== '0') refuse();
      await admin.query('BEGIN');
      try {
        await admin.query(`CREATE ROLE "${target.migratorUser}" LOGIN NOSUPERUSER NOCREATEDB CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${literal(secrets.migrator)}`);
        await admin.query(`COMMENT ON ROLE "${target.migratorUser}" IS ${literal(marker(manifest))}`);
        await admin.query(`ALTER DATABASE "${target.databaseName}" OWNER TO "${target.migratorUser}"`);
        await admin.query(`COMMENT ON DATABASE "${target.databaseName}" IS ${literal(marker(manifest))}`);
        await admin.query('COMMIT');
      } catch { await admin.query('ROLLBACK').catch(() => undefined); refuse(); }
    } else {
      const role = roles[0];
      if (database.owner_name !== target.migratorUser || roles.length !== 1 || role.marker !== marker(manifest)
        || role.rolsuper || !role.rolcanlogin || !role.rolcreaterole || role.rolcreatedb || role.rolreplication || role.rolbypassrls) refuse();
    }
    const owner = await open(target.migratorUser, secrets.migrator);
    const input = { runtimeLoginRole: target.runtimeUser };
    await deps.assertMigrator(owner, input);
    await deps.preflight(owner, input);
    const existingRuntime = (await owner.query(`SELECT /* local_music_runtime_marker */ shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1`, [target.runtimeUser])).rows;
    if (existingRuntime.length && (existingRuntime.length !== 1 || existingRuntime[0].marker !== marker(manifest))) refuse();
    const capability = (await owner.query(`SELECT /* local_music_capability_ownership */ EXISTS(SELECT 1 FROM pg_roles WHERE rolname='music_runtime') AS present,
      (SELECT role.rolname FROM pg_class class JOIN pg_roles role ON role.oid=class.relowner
       WHERE class.oid=to_regclass('public.music_schema_migrations')) AS journal_owner`)).rows[0];
    if (!capability) refuse();
    if (capability.present) {
      if (capability.journal_owner !== target.migratorUser) refuse();
      const existingSchema = await deps.inspectSchema(owner);
      if (existingSchema.conflictTables?.length || !existingSchema.appliedIds.includes('0010_least_privilege_runtime_role')) refuse();
    }
    const migrated = await deps.migrate(owner);
    await deps.provisionRuntime(owner, { loginRole: target.runtimeUser, password: secrets.runtime }, { ownershipComment: marker(manifest) });
    const runtime = await open(target.runtimeUser, secrets.runtime);
    await deps.verifyRuntime(owner, runtime, { loginRole: target.runtimeUser });
    return status(migrated);
  } catch { return refuse(); }
  finally { await Promise.all(pools.map((pool) => pool.end().catch(() => undefined))); }
}
/** Catalog/schema inspection only. No migration/provision/active role-denial probes. */
export async function checkLocalMusicDatabase(manifest: LocalMusicManifest, password: string, deps: LocalDatabaseDependencies): Promise<LocalDatabaseStatus> {
  let pool: Pool | undefined;
  try {
    parseLocalMusicManifest(manifest);
    await deps.requireOwned();
    pool = deps.createPool(connection(target.runtimeUser, password, true));
    const database = await identity(pool);
    if (!database || database.database_name !== target.databaseName || database.login_name !== target.runtimeUser
      || database.owner_name !== target.migratorUser || database.marker !== marker(manifest)) refuse();
    deps.validateRuntimeGraph(await deps.readRuntimeGraph(pool, target.runtimeUser));
    return status(await deps.inspectSchema(pool));
  } catch { return refuse(); }
  finally { await pool?.end().catch(() => undefined); }
}
