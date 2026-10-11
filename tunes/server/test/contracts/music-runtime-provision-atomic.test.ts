import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { provisionMusicRuntimeLogin } from '../../db/music-runtime-role';

const login = 'explorers_music_local_uat_runtime';
const migrator = 'explorers_music_local_uat_migrator';
const comment = 'explorers-local-music:12345678-1234-4234-8234-123456789abc:1000';
const input = { loginRole: login, password: Buffer.alloc(32, 17).toString('base64url') };

// Only the pg query/transaction boundary is simulated. The canonical role provisioner,
// reverse-membership checks, role-graph parser/validator and privilege SQL remain real.
function transactionDatabase(interrupt?: 'comment' | 'before-commit' | 'after-commit', existing?: string | null) {
  let durable = { role: existing !== undefined, comment: existing ?? null as string | null };
  let pending: typeof durable | undefined;
  let released = 0; let connected = 0;
  const statements: string[] = [];
  const attributes = { record_kind: 'role', rolinherit: true, rolsuper: false, rolcreaterole: false,
    rolcreatedb: false, rolreplication: false, rolbypassrls: false, cycle: false,
    incoming_root_role: null, incoming_granted_role: null, incoming_member_role: null, incoming_grantor_role: null,
    incoming_admin_option: null, incoming_inherit_option: null, incoming_set_option: null, incoming_depth: null };
  const graphRows = [
    { ...attributes, source_role: login, rolcanlogin: true, granted_role: 'music_runtime' },
    { ...attributes, source_role: 'music_runtime', rolcanlogin: false, granted_role: null },
    { ...attributes, record_kind: 'incoming', source_role: null, granted_role: null, incoming_root_role: 'music_runtime',
      incoming_granted_role: 'music_runtime', incoming_member_role: login, incoming_grantor_role: migrator,
      incoming_admin_option: false, incoming_inherit_option: true, incoming_set_option: true, incoming_depth: 1 },
  ];
  const client = {
    query: async (statement: string) => {
      statements.push(statement);
      if (statement === 'BEGIN') { expect(pending).toBeUndefined(); pending = { ...durable }; }
      else if (statement === 'COMMIT') {
        if (interrupt === 'before-commit') throw new Error('generated interruption before commit');
        durable = { ...pending! }; pending = undefined;
        if (interrupt === 'after-commit') throw new Error('generated lost commit acknowledgement');
      } else if (statement === 'ROLLBACK') pending = undefined;
      else if (statement.includes('shobj_description')) return { rows: pending?.role ? [{ ownership_comment: pending.comment }] : [] };
      else if (statement.startsWith('SELECT provision_music_runtime_login')) { expect(pending).toBeDefined(); pending!.role = true; }
      else if (statement.startsWith('WITH RECURSIVE music_role_closure')) return { rows: graphRows };
      else if (statement.startsWith('WITH RECURSIVE incoming')) return { rows: [] };
      else if (statement.startsWith('SELECT current_user,current_database()')) return { rows: [{ current_user: migrator, current_database: 'explorers_music_local_uat', database_owner: migrator }] };
      else if (statement.startsWith('COMMENT ON ROLE')) {
        expect(pending?.role).toBe(true);
        if (interrupt === 'comment') throw new Error('generated comment failure');
        expect(statement).toBe(`COMMENT ON ROLE "${login}" IS '${comment}'`);
        pending!.comment = comment;
      } else if (!/^(?:GRANT|REVOKE|ALTER DEFAULT PRIVILEGES)/.test(statement)) throw new Error('unexpected database operation');
      return { rows: [] };
    },
    release: () => { released++; },
  };
  const pool = { connect: async () => { connected++; return client; } } as unknown as Pick<Pool, 'connect'>;
  return { pool, statements, snapshot: () => durable, released: () => released, connected: () => connected };
}
describe('canonical runtime provisioning atomic provenance', () => {
  it('commits the role and optional provenance comment in one existing transaction', async () => {
    const database = transactionDatabase();
    await provisionMusicRuntimeLogin(database.pool, input, { ownershipComment: comment });
    expect(database.snapshot()).toEqual({ role: true, comment });
    expect(database.statements.slice(-2)).toEqual([`COMMENT ON ROLE "${login}" IS '${comment}'`, 'COMMIT']);
    expect(database.statements.filter((sql) => sql === 'BEGIN')).toHaveLength(1);
    expect(database.released()).toBe(1);
  });
  it('restores taxonomy read and lock boundaries after blanket runtime grants', async () => {
    const database = transactionDatabase();
    await provisionMusicRuntimeLogin(database.pool, input);
    const statements = database.statements;
    const revoke = 'REVOKE ALL ON taxonomy_catalogs,taxonomy_source_mappings,taxonomy_legacy_slug_mappings,taxonomy_import_receipts FROM music_runtime';
    expect(statements).toContain(revoke);
    expect(statements).toContain('GRANT SELECT ON taxonomy_catalogs,taxonomy_source_mappings,taxonomy_legacy_slug_mappings TO music_runtime');
    expect(statements).toContain('REVOKE ALL ON FUNCTION lock_explorers_taxonomy_catalog(text),lock_recommendation_taxonomy_catalog(),validate_explorers_taxonomy_catalogs(),guard_explorers_taxonomy_catalogs(),guard_taxonomy_import_receipt_immutable() FROM music_runtime');
    expect(statements).toContain('GRANT EXECUTE ON FUNCTION lock_explorers_taxonomy_catalog(text) TO music_runtime');
    expect(statements.findIndex(sql => sql.startsWith('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES'))).toBeLessThan(statements.indexOf(revoke));
  });
  it.each(['comment', 'before-commit'] as const)('rolls back role and provenance on %s interruption', async (interrupt) => {
    const database = transactionDatabase(interrupt);
    await expect(provisionMusicRuntimeLogin(database.pool, input, { ownershipComment: comment })).rejects.toThrow();
    expect(database.snapshot()).toEqual({ role: false, comment: null });
    expect(database.statements.at(-1)).toBe('ROLLBACK');
    expect(database.released()).toBe(1);
  });
  it('lost COMMIT acknowledgement can only leave a fully marked role', async () => {
    const database = transactionDatabase('after-commit');
    await expect(provisionMusicRuntimeLogin(database.pool, input, { ownershipComment: comment })).rejects.toThrow();
    expect(database.snapshot()).toEqual({ role: true, comment });
    expect(database.released()).toBe(1);
    const retry = transactionDatabase(undefined, database.snapshot().comment);
    await provisionMusicRuntimeLogin(retry.pool, input, { ownershipComment: comment });
    expect(retry.snapshot()).toEqual({ role: true, comment });
  });
  it.each([null, 'foreign'])('rejects an existing foreign or unmarked role (%s) inside the transaction', async (existing) => {
    const database = transactionDatabase(undefined, existing);
    await expect(provisionMusicRuntimeLogin(database.pool, input, { ownershipComment: comment })).rejects.toThrow();
    expect(database.snapshot()).toEqual({ role: true, comment: existing });
    expect(database.statements.some((sql) => sql.startsWith('SELECT provision_music_runtime_login'))).toBe(false);
  });
  it('keeps default canonical consumers unchanged, without ownership reads or comment writes', async () => {
    const database = transactionDatabase(undefined, null);
    await provisionMusicRuntimeLogin(database.pool, input);
    expect(database.snapshot()).toEqual({ role: true, comment: null });
    expect(database.statements.some((sql) => /shobj_description|COMMENT ON ROLE/.test(sql))).toBe(false);
    expect(database.statements.at(-1)).toBe('COMMIT');
    expect(database.released()).toBe(1);
  });
  it('validates comment syntax before opening the transaction', async () => {
    const database = transactionDatabase();
    await expect(provisionMusicRuntimeLogin(database.pool, input, { ownershipComment: "invalid'; DROP ROLE other;--" })).rejects.toThrow();
    expect(database.connected()).toBe(0);
  });
});
