import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import type { ObjectStorage } from '../../services/objectStorage';
import { expect, it } from 'vitest';
import { runAccountLifecycleMaintenance } from '../../application/accountLifecycleMaintenance';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const prelocks = " PERFORM public.lock_explorers_taxonomy_catalog('people');\n PERFORM public.lock_explorers_taxonomy_catalog('places');\n";
function purge(source: string) {
 const match = source.match(/CREATE OR REPLACE FUNCTION public\.purge_explorers_account_content\(target_account uuid,target_operation uuid\) RETURNS integer\nLANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS \$\$[\s\S]*?END \$\$;/);
 expect(match, 'latest guarded purge definition exists').not.toBeNull();
 return match![0];
}
it('source only: catalog prelocks are the sole change to the latest guarded purge body', () => {
 const previous = purge(read('../../../migrations/0049_explorers_collection_location_links.sql'));
 const current = purge(read('../../../migrations/0053_explorers_taxonomy_catalogs.sql'));
 expect(current).toContain('BEGIN\n' + prelocks + ' SELECT status INTO current_status');
 expect(current.replace(prelocks, '')).toBe(previous);
 expect(current.match(/lock_explorers_taxonomy_catalog\(/g)).toHaveLength(2);
});
it('source only: DELETE retains catalog serialization before taxonomy parent locking', () => {
 const source = read('../../../migrations/0053_explorers_taxonomy_catalogs.sql');
 expect(source).toContain("target_category:=CASE WHEN TG_OP='DELETE' THEN OLD.category ELSE NEW.category END");
 expect(source).toContain('BEFORE INSERT OR UPDATE OR DELETE ON public.recommendation_taxonomy');
 expect(source.indexOf('PERFORM public.lock_explorers_taxonomy_catalog(target_category)')).toBeLessThan(source.indexOf("IF TG_OP<>'DELETE' THEN"));
});
it('mocked maintenance: finalization locks people then places before account, category and purge locks', async () => {
 const statements: string[] = [];
 const query = async (sql: string) => {
  statements.push(sql);
  if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }], rowCount: 1 };
  if (sql.includes('SELECT a.status,m.user_id')) return { rows: [{ status: 'pending_deletion', user_id: 'owner' }], rowCount: 1 };
  if (sql.includes("state='running' FOR UPDATE")) return { rows: [{}], rowCount: 1 };
  return { rows: [], rowCount: 0 };
 };
 const pool = {
  query: async (sql: string) => sql.includes('RETURNING o.id,o.account_id')
   ? { rows: [{ id: 'operation', account_id: 'account' }], rowCount: 1 }
   : { rows: [], rowCount: 0 },
  connect: async () => ({ query, release: () => undefined }),
 } as unknown as Pool;
 const storage: ObjectStorage = { environment: 'local', put: async () => undefined, get: async () => Buffer.alloc(0), delete: async () => undefined };
 expect(await runAccountLifecycleMaintenance(pool, storage)).toBe(1);
 const begin = statements.indexOf('BEGIN');
 expect(begin).toBeGreaterThan(-1);
 expect(statements.slice(begin + 1, begin + 3)).toEqual([
  "SELECT lock_explorers_taxonomy_catalog('people')", "SELECT lock_explorers_taxonomy_catalog('places')",
 ]);
 expect(statements[begin + 3]).toContain('FOR UPDATE OF a');
 const category = statements.findIndex(sql => sql.includes('pg_advisory_xact_lock'));
 const guardedPurge = statements.indexOf('SELECT purge_explorers_account_content($1,$2)');
 expect(category).toBeGreaterThan(begin + 3);
 expect(guardedPurge).toBeGreaterThan(category);
 expect(statements).toContain('COMMIT');
 expect(statements).not.toContain('ROLLBACK');
 expect(statements.slice(0, begin).join('\n')).not.toMatch(/FOR UPDATE|lock_explorers_taxonomy_catalog/);
});
