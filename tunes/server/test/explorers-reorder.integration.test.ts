import { createHash, createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCanonicalApp } from '../auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../auth/betterAuth';
import { guideEmptySectionBlocks } from '../../shared/explorersGuideContract';

// Every owner reorder endpoint, over real HTTP and a real database:
//   PATCH /collections/:id/order                       items within a list
//   PATCH /categories/:category/lists/order            lists within a category (display and pinned)
//   PATCH /categories/:category/top-picks/order        Top Picks
//   PATCH /collections/:id/guide/sections/order        guide days
//   PATCH /recommendations/:id  (mediaIds)             images / snapshots / photos of one item
// Each must enforce ownership, check the revision the caller read, and leave positions dense.

const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51474',EXPLORERS_AUTH_SECRET:'integration-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-google-id',GOOGLE_CLIENT_SECRET:'fixture-google-secret'});
let pool:pg.Pool, composed:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:6});composed=createCanonicalApp(pool,config);});
afterAll(async()=>{await pool.end();});

type Owner = { userId: string; accountId: string; cookie: string };
async function persona(): Promise<Owner> {
  const userId = `reorder-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Owner',$2)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())", [randomUUID(), `google-${userId}`, userId]);
  const context = await composed.auth.$context, session = await context.internalAdapter.createSession(userId, false);
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256', config.secret).update(session.token).digest('base64')}`;
  const me = await request(composed.app).get('/api/explorers/v1/me').set('cookie', cookie);
  expect(me.status).toBe(200);
  return { userId, accountId: me.body.account.id as string, cookie };
}
function send(owner: Owner, method: 'post' | 'patch' | 'put' | 'delete', path: string, body: object, key: string = randomUUID()) {
  return request(composed.app)[method](`/api/explorers/v1${path}`).set('cookie', owner.cookie).set('origin', config.baseURL).set('Idempotency-Key', key).send(body);
}
async function newList(owner: Owner, category = 'books', title = 'List') {
  const result = await send(owner, 'post', '/collections', { category, title, slug: `l-${randomUUID()}`, visibility: 'private', publicationState: 'draft' });
  expect(result.status).toBe(201);
  return result.body.collection as { id: string; category: string; revision: number };
}
async function entity(kind = 'book') {
  return (await pool.query("INSERT INTO entities(kind,title,origin) VALUES($1,'Shared title','manual') RETURNING id", [kind])).rows[0].id as string;
}
async function addItem(owner: Owner, list: { id: string; category: string }, revision: number) {
  const result = await send(owner, 'post', '/recommendations', { category: list.category, entityId: await entity(), collectionId: list.id, expectedCollectionRevision: revision, userRating: 8, publicationState: 'draft' });
  expect(result.status).toBe(201);
  return result.body.recommendation as { id: string };
}
async function listWithItems(owner: Owner, count: number, category = 'books') {
  const list = await newList(owner, category);
  const items: { id: string }[] = [];
  for (let i = 0; i < count; i += 1) items.push(await addItem(owner, list, list.revision + i));
  return { list, items, revision: list.revision + count };
}
const revisionOf = async (id: string) => Number((await pool.query('SELECT revision FROM collections WHERE id=$1', [id])).rows[0].revision);
const categoryRevision = async (owner: Owner, category: string) =>
  String((await pool.query("SELECT coalesce((SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category=$2),'0') r", [owner.accountId, category])).rows[0].r);
const itemOrder = async (listId: string) => (await pool.query('SELECT recommendation_id id, display_order o FROM collection_items WHERE collection_id=$1 ORDER BY display_order', [listId])).rows;
const listOrder = async (owner: Owner, category: string, column = 'display_order') =>
  (await pool.query(`SELECT id, ${column} o FROM collections WHERE account_id=$1 AND category=$2 AND archived_at IS NULL ORDER BY ${column}, id`, [owner.accountId, category])).rows;

describe('items within a list: PATCH /collections/:id/order', () => {
  it('stores the new order as dense unique positions and replays an identical command', async () => {
    const a = await persona();
    const { list, items, revision } = await listWithItems(a, 3);
    const order = [items[2].id, items[0].id, items[1].id], key = randomUUID();
    const done = await send(a, 'patch', `/collections/${list.id}/order`, { expectedRevision: revision, orderedRecommendationIds: order }, key);
    expect(done.status).toBe(200);
    expect((await itemOrder(list.id)).map(r => [r.id, r.o])).toEqual(order.map((id, o) => [id, o]));
    expect(await revisionOf(list.id)).toBe(revision + 1);
    const replay = await send(a, 'patch', `/collections/${list.id}/order`, { expectedRevision: revision, orderedRecommendationIds: order }, key);
    expect(replay.body).toEqual(done.body);
    expect(await revisionOf(list.id)).toBe(revision + 1);
  });

  it("will not let another owner reorder your list, and says nothing about it", async () => {
    const a = await persona(), b = await persona();
    const { list, items, revision } = await listWithItems(a, 2);
    const before = await itemOrder(list.id);
    const denied = await send(b, 'patch', `/collections/${list.id}/order`, { expectedRevision: revision, orderedRecommendationIds: [items[1].id, items[0].id] });
    expect(denied.status).toBe(404);
    expect(await itemOrder(list.id)).toEqual(before);
    expect(await revisionOf(list.id)).toBe(revision);
  });

  it('refuses a stale revision, an incomplete set and a foreign item without changing anything', async () => {
    const a = await persona(), b = await persona();
    const { list, items, revision } = await listWithItems(a, 2);
    const foreign = await listWithItems(b, 1);
    const before = await itemOrder(list.id);
    expect((await send(a, 'patch', `/collections/${list.id}/order`, { expectedRevision: revision - 1, orderedRecommendationIds: [items[1].id, items[0].id] })).status).toBe(409);
    expect((await send(a, 'patch', `/collections/${list.id}/order`, { expectedRevision: revision, orderedRecommendationIds: [items[1].id] })).status).toBe(422);
    expect((await send(a, 'patch', `/collections/${list.id}/order`, { expectedRevision: revision, orderedRecommendationIds: [items[0].id, foreign.items[0].id] })).status).toBe(422);
    expect(await itemOrder(list.id)).toEqual(before);
  });

  it('lets exactly one of two concurrent reorders at the same revision win', async () => {
    const a = await persona();
    const { list, items, revision } = await listWithItems(a, 3);
    const one = [items[2].id, items[1].id, items[0].id], two = [items[1].id, items[0].id, items[2].id];
    const results = await Promise.all([one, two].map(order => send(a, 'patch', `/collections/${list.id}/order`, { expectedRevision: revision, orderedRecommendationIds: order })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const winner = results[0].status === 200 ? one : two;
    expect((await itemOrder(list.id)).map(r => [r.id, r.o])).toEqual(winner.map((id, o) => [id, o]));
  });
});

describe('lists within a category: PATCH /categories/:category/lists/order', () => {
  const lists = (owner: Owner, category: string, count: number) => Promise.all(Array.from({ length: count }, (_, i) => newList(owner, category, `L${i}`)));
  const order = (owner: Owner, category: string, body: object, key?: string) => send(owner, 'patch', `/categories/${category}/lists/order`, body, key);

  it('assigns dense unique display positions in one command, even from a messy start', async () => {
    const a = await persona();
    const made = await lists(a, 'movies', 3);
    await pool.query('UPDATE collections SET display_order = CASE id WHEN $1 THEN 5 WHEN $2 THEN 5 ELSE 9 END WHERE id = ANY($3::uuid[])', [made[0].id, made[1].id, made.map(l => l.id)]);
    const wanted = [made[2].id, made[0].id, made[1].id];
    const done = await order(a, 'movies', { expectedCategoryRevision: await categoryRevision(a, 'movies'), scope: 'display', orderedCollectionIds: wanted });
    expect(done.status).toBe(200);
    expect(done.body.lists.lists).toEqual(wanted.map((id, position) => ({ id, position })));
    expect((await listOrder(a, 'movies')).map(r => [r.id, r.o])).toEqual(wanted.map((id, o) => [id, o]));
    expect(Number(done.body.lists.categoryRevision)).toBeGreaterThan(0);
  });

  it("never touches another owner's lists, and another owner cannot reorder yours", async () => {
    const a = await persona(), b = await persona();
    const mine = await lists(a, 'books', 2), theirs = await lists(b, 'books', 2);
    const beforeA = await listOrder(a, 'books'), beforeB = await listOrder(b, 'books');
    // b names a's lists
    const denied = await order(b, 'books', { expectedCategoryRevision: await categoryRevision(b, 'books'), scope: 'display', orderedCollectionIds: [mine[1].id, mine[0].id] });
    expect(denied.status).toBe(409);
    // b mixes its own and a's
    expect((await order(b, 'books', { expectedCategoryRevision: await categoryRevision(b, 'books'), scope: 'display', orderedCollectionIds: [theirs[0].id, mine[0].id] })).status).toBe(409);
    expect(await listOrder(a, 'books')).toEqual(beforeA);
    expect(await listOrder(b, 'books')).toEqual(beforeB);
    // a's own reorder leaves b untouched
    expect((await order(a, 'books', { expectedCategoryRevision: await categoryRevision(a, 'books'), scope: 'display', orderedCollectionIds: [mine[1].id, mine[0].id] })).status).toBe(200);
    expect(await listOrder(b, 'books')).toEqual(beforeB);
  });

  it('refuses a stale category revision, an omitted, extra, archived or repeated list, and bad input', async () => {
    const a = await persona();
    const [x, y, z] = await lists(a, 'apps', 3);
    await pool.query('UPDATE collections SET archived_at=now() WHERE id=$1', [z.id]);
    const before = await listOrder(a, 'apps');
    const revision = await categoryRevision(a, 'apps');
    expect((await order(a, 'apps', { expectedCategoryRevision: String(Number(revision) - 1), scope: 'display', orderedCollectionIds: [y.id, x.id] })).status).toBe(409);
    expect((await order(a, 'apps', { expectedCategoryRevision: revision, scope: 'display', orderedCollectionIds: [x.id] })).status).toBe(409);
    expect((await order(a, 'apps', { expectedCategoryRevision: revision, scope: 'display', orderedCollectionIds: [x.id, y.id, z.id] })).status).toBe(409);
    expect((await order(a, 'apps', { expectedCategoryRevision: revision, scope: 'display', orderedCollectionIds: [x.id, x.id] })).status).toBe(422);
    expect((await order(a, 'apps', { expectedCategoryRevision: revision, scope: 'display', orderedCollectionIds: [] })).status).toBe(422);
    expect((await order(a, 'apps', { expectedCategoryRevision: revision, scope: 'sideways', orderedCollectionIds: [x.id, y.id] })).status).toBe(422);
    expect((await order(a, 'apps', { expectedCategoryRevision: revision, scope: 'display', orderedCollectionIds: [x.id, y.id], extra: 1 })).status).toBe(422);
    expect((await order(a, 'music', { expectedCategoryRevision: revision, scope: 'display', orderedCollectionIds: [x.id, y.id] })).status).toBe(422);
    expect((await request(composed.app).patch('/api/explorers/v1/categories/apps/lists/order').set('origin', config.baseURL).set('Idempotency-Key', randomUUID()).send({})).status).toBe(401);
    expect(await listOrder(a, 'apps')).toEqual(before);
  });

  it('orders only the pinned lists with scope pinned, and refuses a set that is not exactly the pinned ones', async () => {
    const a = await persona();
    const [p, q, r] = await lists(a, 'guides', 3);
    await pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=ANY($1::uuid[])", [[p.id, q.id, r.id]]);
    await pool.query('UPDATE collections SET pin_order=CASE id WHEN $1 THEN 3 ELSE 7 END WHERE id=ANY($2::uuid[])', [p.id, [p.id, q.id]]);
    const stateOf = async () => (await pool.query('SELECT id, pin_order FROM collections WHERE account_id=$1 ORDER BY id', [a.accountId])).rows;
    const before = await stateOf();
    expect((await order(a, 'guides', { expectedCategoryRevision: await categoryRevision(a, 'guides'), scope: 'pinned', orderedCollectionIds: [q.id, p.id, r.id] })).status).toBe(409);
    expect(await stateOf()).toEqual(before);
    const done = await order(a, 'guides', { expectedCategoryRevision: await categoryRevision(a, 'guides'), scope: 'pinned', orderedCollectionIds: [q.id, p.id] });
    expect(done.status).toBe(200);
    const pins = await pool.query('SELECT id, pin_order FROM collections WHERE account_id=$1 AND pin_order IS NOT NULL ORDER BY pin_order', [a.accountId]);
    expect(pins.rows.map(row => [row.id, row.pin_order])).toEqual([[q.id, 0], [p.id, 1]]);
    expect((await pool.query('SELECT pin_order FROM collections WHERE id=$1', [r.id])).rows[0].pin_order).toBeNull();
  });

  it('serialises concurrent reorders: the second, composed at the same revision, is refused', async () => {
    const a = await persona();
    const [x, y, z] = await lists(a, 'games', 3);
    const revision = await categoryRevision(a, 'games');
    const results = await Promise.all([[z.id, y.id, x.id], [y.id, x.id, z.id]].map(ids => order(a, 'games', { expectedCategoryRevision: revision, scope: 'display', orderedCollectionIds: ids })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const rows = await listOrder(a, 'games');
    expect(rows.map(r => r.o)).toEqual([0, 1, 2]);
  });

  it('replays an identical command without applying it twice', async () => {
    const a = await persona();
    const [x, y] = await lists(a, 'people', 2);
    const body = { expectedCategoryRevision: await categoryRevision(a, 'people'), scope: 'display', orderedCollectionIds: [y.id, x.id] }, key = randomUUID();
    const first = await order(a, 'people', body, key), revision = await categoryRevision(a, 'people');
    const again = await order(a, 'people', body, key);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(await categoryRevision(a, 'people')).toBe(revision);
  });
});

describe('Top Picks: PATCH /categories/:category/top-picks/order', () => {
  const pins = (owner: Owner, method: 'put' | 'patch', body: object) =>
    request(composed.app)[method](`/api/explorers/v1/categories/books/top-picks${method === 'patch' ? '/order' : ''}`).set('cookie', owner.cookie).set('origin', config.baseURL).set('Idempotency-Key', randomUUID()).send(body);
  const snapshot = async (owner: Owner) => (await request(composed.app).get('/api/explorers/v1/categories/books/content-snapshot').set('cookie', owner.cookie)).body;

  it('stores a saved Top Picks order as dense positions and refuses a stale pin revision', async () => {
    const a = await persona();
    const { list, items } = await listWithItems(a, 3);
    const pick = (i: number) => ({ recommendationId: items[i].id, collectionId: list.id });
    const first = await snapshot(a);
    const saved = await pins(a, 'put', { expectedCategoryRevision: first.revision, expectedPinRevision: first.pinRevision, orderedPins: [pick(0), pick(1), pick(2)] });
    expect(saved.status).toBe(200);
    const next = await snapshot(a);
    const reordered = await pins(a, 'put', { expectedCategoryRevision: next.revision, expectedPinRevision: next.pinRevision, orderedPins: [pick(2), pick(0), pick(1)] });
    expect(reordered.status).toBe(200);
    expect((await pool.query('SELECT recommendation_id id, position p FROM category_recommendation_pins WHERE account_id=$1 ORDER BY position', [a.accountId])).rows.map(r => [r.id, r.p]))
      .toEqual([[items[2].id, 0], [items[0].id, 1], [items[1].id, 2]]);
    const stale = await pins(a, 'patch', { expectedCategoryRevision: next.revision, expectedPinRevision: next.pinRevision, orderedPins: [pick(1)] });
    expect(stale.status).toBe(409);
  });

  it("refuses to pin or order another owner's recommendation", async () => {
    const a = await persona(), b = await persona();
    const mine = await listWithItems(a, 1), theirs = await listWithItems(b, 1);
    const first = await snapshot(a);
    const denied = await pins(a, 'patch', { expectedCategoryRevision: first.revision, expectedPinRevision: first.pinRevision, orderedPins: [{ recommendationId: theirs.items[0].id, collectionId: theirs.list.id }] });
    expect(denied.status).toBe(422);
    expect((await pool.query('SELECT count(*)::int n FROM category_recommendation_pins WHERE account_id=ANY($1::uuid[])', [[a.accountId, b.accountId]])).rows[0].n).toBe(0);
    void mine;
  });
});

describe('guide days: PATCH /collections/:id/guide/sections/order', () => {
  async function guideWithDays(owner: Owner, count: number) {
    const guide = await newList(owner, 'guides', 'Trip');
    const days: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const read = await request(composed.app).get(`/api/explorers/v1/collections/${guide.id}/guide`).set('cookie', owner.cookie);
      expect(read.status).toBe(200);
      const added = await send(owner, 'post', `/collections/${guide.id}/guide/sections`, { revision: read.body.guide.revision, title: `Day ${i + 1}`, description: null, blocks: guideEmptySectionBlocks });
      expect(added.status).toBe(201);
      days.push(added.body.guide.sections[i].id);
    }
    const read = await request(composed.app).get(`/api/explorers/v1/collections/${guide.id}/guide`).set('cookie', owner.cookie);
    return { guide, days, revision: read.body.guide.revision as number };
  }
  const positions = async (guideId: string) => (await pool.query('SELECT id, display_order o FROM guide_sections WHERE collection_id=$1 ORDER BY display_order', [guideId])).rows;

  it('renumbers the days densely, so the public Sequence follows', async () => {
    const a = await persona();
    const { guide, days, revision } = await guideWithDays(a, 3);
    const wanted = [days[2], days[0], days[1]];
    const done = await send(a, 'patch', `/collections/${guide.id}/guide/sections/order`, { revision, sectionIds: wanted });
    expect(done.status).toBe(200);
    expect((await positions(guide.id)).map(r => [r.id, r.o])).toEqual(wanted.map((id, o) => [id, o]));
    expect(done.body.guide.sections.map((s: { id: string; displayOrder: number }) => [s.id, s.displayOrder])).toEqual(wanted.map((id, o) => [id, o]));
  });

  it("will not let another owner reorder your guide, and refuses a stale or incomplete order", async () => {
    const a = await persona(), b = await persona();
    const { guide, days, revision } = await guideWithDays(a, 2);
    const before = await positions(guide.id);
    const foreign = await send(b, 'patch', `/collections/${guide.id}/guide/sections/order`, { revision, sectionIds: [days[1], days[0]] });
    expect([403, 404, 409]).toContain(foreign.status);
    expect((await send(a, 'patch', `/collections/${guide.id}/guide/sections/order`, { revision: revision - 1, sectionIds: [days[1], days[0]] })).status).toBe(409);
    expect((await send(a, 'patch', `/collections/${guide.id}/guide/sections/order`, { revision, sectionIds: [days[1]] })).status).toBe(409);
    expect(await positions(guide.id)).toEqual(before);
  });
});

describe('images of one item: PATCH /recommendations/:id with mediaIds', () => {
  async function readyMedia(accountId: string) {
    return (await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at)
      VALUES($1,'recommendation','ready','image/jpeg',2048,$2,now()) RETURNING id`, [accountId, createHash('sha256').update(randomUUID()).digest()])).rows[0].id as string;
  }
  const stored = async (recommendationId: string) => (await pool.query('SELECT media_id id, display_order o FROM recommendation_media WHERE recommendation_id=$1 ORDER BY display_order', [recommendationId])).rows;

  it('keeps the order given, as dense positions', async () => {
    const a = await persona();
    const { items } = await listWithItems(a, 1);
    const [m1, m2, m3] = [await readyMedia(a.accountId), await readyMedia(a.accountId), await readyMedia(a.accountId)];
    expect((await send(a, 'patch', `/recommendations/${items[0].id}`, { expectedRevision: 1, mediaIds: [m1, m2, m3] })).status).toBe(200);
    const done = await send(a, 'patch', `/recommendations/${items[0].id}`, { expectedRevision: 2, mediaIds: [m3, m1, m2] });
    expect(done.status).toBe(200);
    expect(done.body.recommendation.mediaIds).toEqual([m3, m1, m2]);
    expect((await stored(items[0].id)).map(r => [r.id, r.o])).toEqual([[m3, 0], [m1, 1], [m2, 2]]);
  });

  it("will not reorder another owner's item, nor accept their media", async () => {
    const a = await persona(), b = await persona();
    const { items } = await listWithItems(a, 1);
    const mine = await readyMedia(a.accountId), theirs = await readyMedia(b.accountId);
    expect((await send(a, 'patch', `/recommendations/${items[0].id}`, { expectedRevision: 1, mediaIds: [mine] })).status).toBe(200);
    expect((await send(b, 'patch', `/recommendations/${items[0].id}`, { expectedRevision: 2, mediaIds: [theirs] })).status).toBe(404);
    expect((await send(a, 'patch', `/recommendations/${items[0].id}`, { expectedRevision: 2, mediaIds: [mine, theirs] })).status).toBe(422);
    expect((await send(a, 'patch', `/recommendations/${items[0].id}`, { expectedRevision: 1, mediaIds: [mine] })).status).toBe(409);
    expect((await stored(items[0].id)).map(r => r.id)).toEqual([mine]);
  });
});
