import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import pg, { type Pool, type PoolConfig } from 'pg';
import * as db from '../../../scripts/music-local-database';
import { LOCAL_MUSIC_TARGET as target, type LocalMusicManifest } from '../../config/music-local-profile';
const manifest: LocalMusicManifest = { version: 1, instanceId: '12345678-1234-4234-8234-123456789abc', ownerId: '1000', imageId: `sha256:${'a'.repeat(64)}`, worktreeRoot: path.resolve('worktree'), stateDirectory: path.resolve('../private-state'), cohortUserDocumentIds: [] };
const secrets = { admin: 'A'.repeat(43), migrator: 'B'.repeat(43), runtime: 'C'.repeat(43) };
afterEach(() => vi.unstubAllEnvs());
function harness(mode: 'fresh' | 'foreign' | 'retry' = 'fresh', failAt?: string, foreignRole?: 'migrator' | 'runtime' | 'capability') {
  const events: string[] = []; const sql: string[] = []; const configs: unknown[] = [];
  const marker = `explorers-local-music:${manifest.instanceId}:${manifest.ownerId}`;
  const pool = (user: string) => ({
    query: async (query: string) => {
      sql.push(query);
      if (query.includes('local_music_identity')) return { rows: [{ database_name: target.databaseName, login_name: user, owner_name: mode === 'fresh' ? 'postgres' : target.migratorUser, marker: mode === 'fresh' ? null : mode === 'foreign' ? 'foreign' : marker }] };
      if (query.includes('local_music_roles')) return { rows: mode === 'fresh' ? [] : [{ rolname: target.migratorUser, marker: foreignRole === 'migrator' ? 'foreign' : marker, rolsuper: false, rolcanlogin: true, rolcreaterole: true, rolcreatedb: false, rolreplication: false, rolbypassrls: false }] };
      if (query.includes('local_music_pristine')) return { rows: [{ count: '0' }] };
      if (query.includes('local_music_runtime_marker')) return { rows: foreignRole === 'runtime' ? [{ marker: 'foreign' }] : [] };
      if (query.includes('local_music_capability_ownership')) return { rows: [{ present: foreignRole === 'capability', journal: false }] };
      return { rows: [] };
    }, end: async () => { events.push(`close:${user}`); },
  } as unknown as Pool);
  const step = (name: string, result: unknown = undefined) => async () => { events.push(name); if (failAt === name) throw new Error('SENTINEL_PRIVATE_PG_ERROR'); return result; };
  const schema = { ready: true, currentId: '0037_explorers_movies_provider_context', currentChecksum: 'd'.repeat(64), schemaChecksum: 'e'.repeat(64) };
  const deps = {
    requireOwned: step('owned'), createPool: (config: { user?: string }) => { configs.push(config); events.push(`pool:${config.user}`); return pool(config.user!); },
    assertMigrator: step('authority'), preflight: step('preflight'), migrate: step('migrate', schema),
    provisionRuntime: step('provision-runtime'), verifyRuntime: step('active-verify'), inspectSchema: step('schema', schema), readRuntimeGraph: step('graph', {}), validateRuntimeGraph: () => {},
  } as unknown as db.LocalDatabaseDependencies;
  return { deps, events, sql, configs };
}
describe('guarded local database provisioning', () => {
  it('refuses ownership failure before opening any connection', async () => {
    const h = harness('fresh', 'owned');
    await expect(db.provisionLocalMusicDatabase(manifest, secrets, h.deps)).rejects.toThrow(/^LOCAL_MUSIC_/);
    expect(h.events).toEqual(['owned']);
  });
  it('refuses an existing foreign database before DDL and closes admin pool', async () => {
    const h = harness('foreign');
    await expect(db.provisionLocalMusicDatabase(manifest, secrets, h.deps)).rejects.toThrow(/^LOCAL_MUSIC_/);
    expect(h.sql.every((sql) => /^SELECT/.test(sql))).toBe(true);
    expect(h.events).toContain('close:postgres');
    expect(h.events).not.toContain('migrate');
  });
  it('bootstraps distinct non-superuser migrator and reuses the migration/role chain', async () => {
    const h = harness();
    await expect(db.provisionLocalMusicDatabase(manifest, secrets, h.deps)).resolves.toMatchObject({ ready: true, migrationId: '0037_explorers_movies_provider_context' });
    expect(h.sql.some((sql) => sql.includes('CREATE ROLE "explorers_music_local_uat_migrator" LOGIN NOSUPERUSER NOCREATEDB CREATEROLE'))).toBe(true);
    expect(h.sql.some((sql) => /ALTER SCHEMA|DROP DATABASE|DROP ROLE/.test(sql))).toBe(false);
    expect(h.events.filter((event) => ['authority', 'preflight', 'migrate', 'provision-runtime', 'active-verify'].includes(event))).toEqual(['authority', 'preflight', 'migrate', 'provision-runtime', 'active-verify']);
    expect(h.configs).toEqual(expect.arrayContaining([expect.objectContaining({ host: '127.0.0.1', port: 55433, database: 'explorers_music_local_uat', user: target.runtimeUser, password: secrets.runtime })]));
    expect(h.events.filter((e) => e.startsWith('close:'))).toHaveLength(3);
  });
  it('resumes owned schema without rotating migrator credentials', async () => {
    const h = harness('retry');
    await db.provisionLocalMusicDatabase(manifest, secrets, h.deps);
    expect(h.sql.some((sql) => /CREATE ROLE|ALTER ROLE/.test(sql))).toBe(false);
    expect(h.events).toContain('migrate');
  });
  it('passes provenance into canonical provisioning rather than issuing a post-commit comment', async () => {
    const h = harness('retry'); const received: unknown[] = [];
    h.deps.provisionRuntime = async (...args) => { received.push(args[2]); };
    await db.provisionLocalMusicDatabase(manifest, secrets, h.deps);
    expect(received).toEqual([{ ownershipComment: 'explorers-local-music:12345678-1234-4234-8234-123456789abc:1000' }]);
    expect(h.sql.some((statement) => statement.startsWith('COMMENT ON ROLE'))).toBe(false);
  });
  it.each(['migrator', 'runtime', 'capability'] as const)('rejects an unowned %s role before DDL or migration', async (role) => {
    const h = harness('retry', undefined, role);
    await expect(db.provisionLocalMusicDatabase(manifest, secrets, h.deps)).rejects.toThrow(/^LOCAL_MUSIC_DATABASE_REFUSED$/);
    expect(h.sql.every((statement) => /^SELECT/.test(statement))).toBe(true);
    expect(h.events).not.toContain('migrate');
  });
  it.each(['authority', 'preflight', 'migrate', 'provision-runtime', 'active-verify'])('sanitizes %s failure and closes all opened pools', async (phase) => {
    const h = harness('retry', phase);
    await expect(db.provisionLocalMusicDatabase(manifest, secrets, h.deps)).rejects.toThrow(/^LOCAL_MUSIC_DATABASE_REFUSED$/);
    expect(h.events.filter((e) => e.startsWith('close:')).length).toBe(h.events.filter((e) => e.startsWith('pool:')).length);
  });
  it('check only reads schema/catalogs using runtime read-only bounded connections', async () => {
    const h = harness('retry');
    await expect(db.checkLocalMusicDatabase(manifest, secrets.runtime, h.deps)).resolves.toMatchObject({ ready: true });
    expect(h.events).not.toEqual(expect.arrayContaining(['migrate', 'provision-runtime', 'active-verify']));
    expect(h.sql.every((sql) => /^SELECT/.test(sql))).toBe(true);
    expect(h.configs).toEqual([expect.objectContaining({ user: target.runtimeUser, options: expect.stringContaining('default_transaction_read_only=on'), connectionTimeoutMillis: 5000, statement_timeout: 5000 })]);
    expect(h.events).toContain(`close:${target.runtimeUser}`);
  });
});

describe('actual pg driver environment boundary (constructors only; no connect)', () => {
  function parameters(config: PoolConfig): Record<string, unknown> {
    return (new pg.Client(config) as unknown as { connectionParameters: Record<string, unknown> }).connectionParameters;
  }
  it.each([
    { name: 'PGSSLMODE', value: 'require', field: 'ssl', inherited: true },
    { name: 'PGREPLICATION', value: 'database', field: 'replication', inherited: 'database' },
    { name: 'PGCLIENT_ENCODING', value: 'SQL_ASCII', field: 'client_encoding', inherited: 'SQL_ASCII' },
    { name: 'PGBINARY', value: '1', field: 'binary', inherited: '1' },
    { name: 'PGAPPNAME', value: 'foreign-session', field: 'application_name', inherited: 'foreign-session' },
  ])('rejects $name, whose override the actual pg Client would otherwise inherit', async ({ name, value, field, inherited }) => {
    vi.stubEnv(name, value);
    // Characterize the real driver fallback, not just our config object.
    expect(parameters({ host: '127.0.0.1', port: 55433, user: target.runtimeUser, database: target.databaseName, password: secrets.runtime })[field]).toEqual(inherited);
    const h = harness('retry');
    await expect(db.provisionLocalMusicDatabase(manifest, secrets, h.deps)).rejects.toThrow(/^LOCAL_MUSIC_DATABASE_REFUSED$/);
    await expect(db.checkLocalMusicDatabase(manifest, secrets.runtime, h.deps)).rejects.toThrow(/^LOCAL_MUSIC_DATABASE_REFUSED$/);
    expect(h.configs).toEqual([]); expect(h.sql).toEqual([]);
  });
  it.each(['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGOPTIONS', 'PGPASSFILE', 'PGSERVICEFILE', 'PGCONNECT_TIMEOUT', 'pgsslmode'])('refuses unsupported %s before the default pool factory', (name) => {
    vi.stubEnv(name, 'generated-ambient-override');
    expect(() => db.localDatabaseDependencies(async () => {}).createPool({ host: '127.0.0.1', port: 55433 })).toThrow(/^LOCAL_MUSIC_DATABASE_REFUSED$/);
  });
  it('the actual driver receives fixed targets and read-only startup options for local check', async () => {
    const h = harness('retry'); const parsed: Record<string, unknown>[] = [];
    const makePool = h.deps.createPool;
    h.deps.createPool = (config) => { parsed.push(parameters(config)); return makePool(config); };
    await db.checkLocalMusicDatabase(manifest, secrets.runtime, h.deps);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ host: '127.0.0.1', port: 55433, database: 'explorers_music_local_uat', user: target.runtimeUser,
      ssl: false, binary: false, connect_timeout: 5, statement_timeout: 5000 });
    expect(parsed[0].replication).toBeUndefined();
    expect(parsed[0].options).toBe('-c standard_conforming_strings=on -c idle_in_transaction_session_timeout=10000 -c default_transaction_read_only=on');
  });
});
