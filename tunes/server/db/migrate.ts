import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool, PoolClient } from "pg";
import { EXPECTED_MUSIC_MIGRATION_CHAIN, EXPECTED_MUSIC_MIGRATION_ID } from "../../shared/music-migration-contract";
import {prepareAppWorkerCustody,sealAppWorkerCustody} from './app-enrichment-worker-custody';

const JOURNAL_TABLE = "music_schema_migrations";
const ADVISORY_LOCK_KEY = 7_346_283_104;
const migrationFilePattern = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export interface MusicMigration {
  id: string;
  sql: string;
  checksum: string;
}

export interface MusicMigrationState {
  ready: boolean;
  expectedId: string;
  currentId?: string;
  currentChecksum?: string;
  schemaChecksum?: string;
  pendingIds: string[];
  appliedIds: string[];
  conflictTables?: Array<{ table: string; rows: number }>;
}

interface JournalRow {
  id: string;
  checksum: string;
  schema_checksum: string;
}

export function createMigrationDefinition(id: string, sql: string): MusicMigration {
  if (!/^\d{4}_[a-z0-9_]+$/.test(id)) throw new Error(`invalid migration ID: ${id}`);
  if (!sql.trim()) throw new Error(`migration ${id} is empty`);
  return { id, sql, checksum: createHash("sha256").update(sql).digest("hex") };
}

function defaultMigrationDirectory(): string {
  const sourceTree = resolve(import.meta.dirname, "../../migrations");
  return existsSync(sourceTree) ? sourceTree : resolve(process.cwd(), "migrations");
}

export function loadMusicMigrations(directory = defaultMigrationDirectory()): MusicMigration[] {
  const files = readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
  if (!files.length) throw new Error("music migration chain is empty");
  const migrations = files.map((file) => {
    const match = migrationFilePattern.exec(file);
    if (!match) throw new Error(`invalid migration filename: ${file}`);
    return createMigrationDefinition(file.slice(0, -4), readFileSync(resolve(directory, file), "utf8"));
  });
  migrations.forEach((migration, index) => {
    const expected = String(index + 1).padStart(4, "0");
    if (!migration.id.startsWith(`${expected}_`)) throw new Error(`missing migration sequence ${expected}`);
  });
  const ids = new Set(migrations.map(({ id }) => id));
  if (ids.size !== migrations.length) throw new Error("duplicate migration ID");
  return migrations;
}

function assertCanonicalChain(migrations: MusicMigration[], expectedIds: readonly string[]): void {
  if (!migrations.length) throw new Error("music migration chain is empty");
  migrations.forEach((migration, index) => {
    const expected = String(index + 1).padStart(4, "0");
    if (!migration.id.startsWith(`${expected}_`)) throw new Error(`missing migration sequence ${expected}`);
    if (migration.checksum !== createHash("sha256").update(migration.sql).digest("hex")) {
      throw new Error(`migration checksum object mismatch: ${migration.id}`);
    }
  });
  const actualIds = migrations.map(({ id }) => id);
  if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) {
    throw new Error(`exact production migration chain mismatch: expected=${expectedIds.join(",")} actual=${actualIds.join(",")}`);
  }
}

export interface MusicMigrationOptions {
  migrations?: MusicMigration[];
  /** Deliberately failing/instrumented chains are only legal inside Vitest. */
  testOnlyExpectedIds?: readonly string[];
}

function resolveExpectedIds(options: MusicMigrationOptions): readonly string[] {
  if (!options.testOnlyExpectedIds) return EXPECTED_MUSIC_MIGRATION_CHAIN;
  if (process.env.NODE_ENV !== "test") throw new Error("test-only migration chain is forbidden outside tests");
  return options.testOnlyExpectedIds;
}

async function tableNames(client: Pick<PoolClient, "query">): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
  );
  return result.rows.map(({ table_name }) => table_name);
}

async function conflictInventory(client: Pick<PoolClient, "query">, tables: string[]): Promise<Array<{ table: string; rows: number }>> {
  const inventory: Array<{ table: string; rows: number }> = [];
  for (const table of tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error("unsafe catalog identifier");
    const result = await client.query<{ rows: number }>(`SELECT count(*)::int AS rows FROM "${table}"`);
    inventory.push({ table, rows: result.rows[0]?.rows ?? 0 });
  }
  return inventory;
}

async function journalExists(client: Pick<PoolClient, "query">): Promise<boolean> {
  const result = await client.query<{ present: boolean }>("SELECT to_regclass('public.music_schema_migrations') IS NOT NULL AS present");
  return result.rows[0]?.present === true;
}

async function readJournal(client: Pick<PoolClient, "query">): Promise<JournalRow[]> {
  if (!await journalExists(client)) return [];
  const result = await client.query<JournalRow>(
    `SELECT id, checksum, schema_checksum FROM ${JOURNAL_TABLE} ORDER BY id`,
  );
  return result.rows;
}

async function schemaFingerprint(client: Pick<PoolClient, "query">): Promise<string> {
  const queries = [
    `SELECT c.relname AS table_name, a.attnum, a.attname, format_type(a.atttypid,a.atttypmod) AS data_type,
       a.attnotnull, coalesce(pg_get_expr(d.adbin,d.adrelid),'') AS default_expression
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
     LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
     WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname,a.attnum`,
    `SELECT c.relname AS table_name, x.conname, x.contype, pg_get_constraintdef(x.oid,true) AS definition
     FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' ORDER BY c.relname,x.conname`,
    `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`,
    `SELECT c.relname AS table_name, t.tgname AS trigger_name, pg_get_triggerdef(t.oid,true) AS definition,
       pn.nspname AS function_schema, p.proname AS function_name
     FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
     WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
    `SELECT n.nspname AS function_schema, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments, pg_get_functiondef(p.oid) AS definition
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' ORDER BY p.proname,identity_arguments`,
    `SELECT c.relname AS sequence_name, format_type(s.seqtypid,NULL) AS data_type,
       s.seqstart::text AS start_value,s.seqincrement::text AS increment_by,s.seqmax::text AS max_value,
       s.seqmin::text AS min_value,s.seqcache::text AS cache_size,s.seqcycle AS cycle,
       oc.relname AS owned_table,a.attname AS owned_column,d.deptype AS ownership_type
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid
     LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN ('a','i')
     LEFT JOIN pg_class oc ON oc.oid=d.refobjid LEFT JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
     WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname`,
  ];
  const catalog: unknown[] = [];
  for (const query of queries) catalog.push((await client.query(query)).rows);
  return createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
}

function validateJournal(rows: JournalRow[], migrations: MusicMigration[]): void {
  if (rows.length > migrations.length) throw new Error("unknown future migration in journal");
  rows.forEach((row, index) => {
    const expected = migrations[index];
    if (!expected) throw new Error("unknown future migration in journal");
    if (row.id !== expected.id) {
      if (row.id > migrations.at(-1)!.id) throw new Error(`unknown future migration: ${row.id}`);
      throw new Error(`missing migration before journal row: ${row.id}`);
    }
    if (!/^[a-f0-9]{64}$/.test(row.checksum) || row.checksum !== expected.checksum) {
      throw new Error(`migration checksum mismatch: ${row.id}`);
    }
    if (!/^[a-f0-9]{64}$/.test(row.schema_checksum)) throw new Error(`invalid schema checksum: ${row.id}`);
  });
}

async function inspectWithClient(client: Pick<PoolClient, "query">, migrations: MusicMigration[], expectedIds: readonly string[]): Promise<MusicMigrationState> {
  assertCanonicalChain(migrations, expectedIds);
  const expectedId = migrations.at(-1)!.id;
  const tables = await tableNames(client);
  const hasJournal = tables.includes(JOURNAL_TABLE);
  if (!hasJournal) {
    if (tables.length) {
      return {
        ready: false,
        expectedId,
        pendingIds: migrations.map(({ id }) => id),
        appliedIds: [],
        conflictTables: await conflictInventory(client, tables),
      };
    }
    return { ready: false, expectedId, pendingIds: migrations.map(({ id }) => id), appliedIds: [] };
  }
  const rows = await readJournal(client);
  if (!rows.length && tables.some((table) => table !== JOURNAL_TABLE)) {
    return {
      ready: false,
      expectedId,
      pendingIds: migrations.map(({ id }) => id),
      appliedIds: [],
      conflictTables: await conflictInventory(client, tables.filter((table) => table !== JOURNAL_TABLE)),
    };
  }
  validateJournal(rows, migrations);
  const current = rows.at(-1);
  if (current) {
    const actualSchema = await schemaFingerprint(client);
    if (actualSchema !== current.schema_checksum) throw new Error(`schema drift after ${current.id}`);
  }
  return {
    ready: rows.length === migrations.length,
    expectedId,
    currentId: current?.id,
    currentChecksum: current?.checksum,
    schemaChecksum: current?.schema_checksum,
    pendingIds: migrations.slice(rows.length).map(({ id }) => id),
    appliedIds: rows.map(({ id }) => id),
  };
}

export async function inspectMusicDatabase(pool: Pick<Pool, "connect">, options: MusicMigrationOptions = {}): Promise<MusicMigrationState> {
  const migrations = options.migrations ?? loadMusicMigrations();
  const expectedIds = resolveExpectedIds(options);
  assertCanonicalChain(migrations, expectedIds);
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    return await inspectWithClient(client, migrations, expectedIds);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

export async function migrateMusicDatabase(pool: Pick<Pool, "connect">, options: MusicMigrationOptions = {}): Promise<MusicMigrationState> {
  const migrations = options.migrations ?? loadMusicMigrations();
  const expectedIds = resolveExpectedIds(options);
  assertCanonicalChain(migrations, expectedIds);
  const client = await pool.connect();
  const newlyApplied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    let state = await inspectWithClient(client, migrations, expectedIds);
    if (state.conflictTables?.length) {
      throw new Error(`unversioned application tables conflict; sanitized inventory=${JSON.stringify(state.conflictTables)}`);
    }
    if (!await journalExists(client)) {
      await client.query("BEGIN");
      try {
        await client.query(`CREATE TABLE ${JOURNAL_TABLE} (
          id text PRIMARY KEY,
          checksum character(64) NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
          schema_checksum character(64) NOT NULL CHECK (schema_checksum ~ '^[a-f0-9]{64}$'),
          applied_at timestamp with time zone NOT NULL DEFAULT now()
        )`);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      state = await inspectWithClient(client, migrations, expectedIds);
    }
    for (const migration of migrations.slice(state.appliedIds.length)) {
      await client.query("BEGIN");
      try {
        if(migration.id==='0056_explorers_app_enrichment_jobs')await prepareAppWorkerCustody(client);
        await client.query(migration.sql);
        if(migration.id==='0056_explorers_app_enrichment_jobs')await sealAppWorkerCustody(client);
        const fingerprint = await schemaFingerprint(client);
        await client.query(
          `INSERT INTO ${JOURNAL_TABLE}(id,checksum,schema_checksum) VALUES ($1,$2,$3)`,
          [migration.id, migration.checksum, fingerprint],
        );
        await client.query("COMMIT");
        newlyApplied.push(migration.id);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const complete = await inspectWithClient(client, migrations, expectedIds);
    if (!complete.ready) throw new Error(`migration chain stopped before ${complete.expectedId}`);
    return { ...complete, appliedIds: newlyApplied };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

export async function verifyMusicDatabase(pool: Pick<Pool, "connect">, options: MusicMigrationOptions = {}): Promise<MusicMigrationState> {
  const migrations = options.migrations ?? loadMusicMigrations();
  const state = await inspectMusicDatabase(pool, { migrations, testOnlyExpectedIds: options.testOnlyExpectedIds });
  if (state.conflictTables?.length) throw new Error(`unversioned application tables conflict; sanitized inventory=${JSON.stringify(state.conflictTables)}`);
  if (!state.ready || state.currentId !== migrations.at(-1)?.id) throw new Error(`database is not at expected migration ${migrations.at(-1)?.id}`);
  return state;
}

export interface DisposableTargetInput {
  databaseUrlTest?: string;
  databaseUrl?: string;
  composeProject?: string;
  confirmation?: string;
}

export function validateDisposableDatabaseTarget(input: DisposableTargetInput): { sanitizedUrl: string; host: string; port: number; database: string; project: string } {
  if (input.databaseUrl) throw new Error("ambient DATABASE_URL is forbidden for disposable database commands");
  if (!input.databaseUrlTest) throw new Error("DATABASE_URL_TEST is required");
  let url: URL;
  try { url = new URL(input.databaseUrlTest); }
  catch { throw new Error("DATABASE_URL_TEST is unresolved"); }
  const database = url.pathname.slice(1);
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== "55432" || database !== "music_fixture" || url.search || url.hash) {
    throw new Error("database target is outside the exact disposable allowlist");
  }
  if (input.composeProject !== "explorers-music-fixture") throw new Error("fixture Compose ownership mismatch");
  if (input.confirmation !== "RESET explorers-music-fixture/music_fixture") throw new Error("exact reset confirmation is required");
  return { sanitizedUrl: "postgresql://[REDACTED]@127.0.0.1:55432/music_fixture", host: url.hostname, port: Number(url.port), database, project: input.composeProject };
}

export function expectedMigrationContract(): { id: typeof EXPECTED_MUSIC_MIGRATION_ID; checksum: string } {
  const migration = loadMusicMigrations().find(({ id }) => id === EXPECTED_MUSIC_MIGRATION_ID);
  if (!migration) throw new Error(`expected migration ${EXPECTED_MUSIC_MIGRATION_ID} is absent`);
  return { id: EXPECTED_MUSIC_MIGRATION_ID, checksum: migration.checksum };
}
