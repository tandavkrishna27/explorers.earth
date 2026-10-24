import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';

// R10. Deleting a list (WP3B "Delete", permanent) keeps the account's analytics and only
// drops the event's link to the list; the runtime role may delete lists and nothing more.
let pool: pg.Pool;
beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 }); });
afterAll(async () => { await pool.end(); });
async function account() { return (await pool.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string; }
async function collection(accountId: string) {
  return (await pool.query(`INSERT INTO collections(account_id,category,title,slug,display_order) VALUES ($1,'books','List',$2,0) RETURNING id`, [accountId, randomUUID()])).rows[0].id as string;
}
async function event(accountId: string, collectionId: string) {
  return (await pool.query(`INSERT INTO analytics_events(account_id,client_event_id,event_type,page,category,collection_id,occurred_at,canonical_path,consent_version)
    VALUES ($1,$2,'view','public-books','books',$3,now(),'/u/x/books/list','v1') RETURNING id`, [accountId, 'evt-' + randomUUID(), collectionId])).rows[0].id as string;
}
async function asRuntime<T>(work: (c: pg.PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try { await c.query('SET ROLE music_runtime'); return await work(c); } finally { await c.query('RESET ROLE'); c.release(); }
}

it('runtime deletes a list with analytics; the event stays, unlinked', async () => {
  const a = await account(), list = await collection(a), e = await event(a, list);
  await asRuntime(c => c.query('DELETE FROM collections WHERE id=$1', [list]));
  expect((await pool.query('SELECT collection_id,account_id,category FROM analytics_events WHERE id=$1', [e])).rows)
    .toEqual([{ collection_id: null, account_id: a, category: 'books' }]);
});

it('runtime still cannot update analytics or hard-delete recommendations and entities', async () => {
  await asRuntime(async c => {
    await expect(c.query('UPDATE analytics_events SET element=element WHERE false')).rejects.toMatchObject({ code: '42501' });
    await expect(c.query('DELETE FROM recommendations WHERE false')).rejects.toMatchObject({ code: '42501' });
    await expect(c.query('DELETE FROM entities WHERE false')).rejects.toMatchObject({ code: '42501' });
    await expect(c.query('TRUNCATE collections')).rejects.toMatchObject({ code: '42501' });
  });
});
