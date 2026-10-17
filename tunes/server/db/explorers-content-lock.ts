import type { PoolClient } from 'pg';

export const CONTENT_CATEGORIES = ['apps','books','games','guides','movies','people','places','products'] as const;
// Dedicated two-int advisory namespace, distinct from media 44024 and Music keys.
export const CONTENT_CATEGORY_LOCK_NAMESPACE = 44031;

/** Caller locks account rows in UUID order before this helper, then aggregates.
 * Arbitrary raw DML may lock aggregates first and deadlock; PostgreSQL aborts
 * one entire transaction, including all revision changes. */
export async function lockContentCategories(db:Pick<PoolClient,'query'>,accountId:string,categories:readonly string[]) {
  for(const category of Array.from(new Set(categories)).sort()) {
    await db.query('SELECT pg_advisory_xact_lock($1,hashtext($2))',
      [CONTENT_CATEGORY_LOCK_NAMESPACE,`${accountId.toLowerCase()}:${category}`]);
  }
}
