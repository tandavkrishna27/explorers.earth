import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BrowserContext } from '@playwright/test';
import { canonicalCategoryAccount, fixtureState, installContainedRoutes } from './category-navigation';

const origin = 'http://127.0.0.1:59998';
const me = '/api/explorers/v1/me';
const account = '/api/explorers/v1/account';

async function harness() {
  const state = fixtureState();
  let handler: (route: any) => Promise<unknown>;
  const context = { pages: () => [], on() {}, routeWebSocket: async () => {},
    route: async (_pattern: string, callback: typeof handler) => { handler = callback; } };
  await installContainedRoutes(context as unknown as BrowserContext, origin, state);
  async function request(path: string, method = 'GET', body?: unknown, authenticated = true) {
    let result: { status?: number; body?: string; aborted?: string } = {};
    await handler!({ request: () => ({ url: () => origin + path, method: () => method,
      headerValue: async (name: string) => name === 'cookie' && authenticated ? 'better-auth.session_token=contained-browser-session' : null,
      headers: () => ({}), resourceType: () => 'fetch', postDataJSON: () => body }), fulfill: async (reply: typeof result) => { result = reply; },
      abort: async (reason: string) => { result = { aborted: reason }; } });
    return result;
  }
  return { state, request };
}

test('canonical read consumes a fault and the next explicit read recovers', async () => {
  const { state, request } = await harness();
  state.faults.set(me, [{ kind: 'error' }]);
  assert.equal((await request(me)).status, 503);
  assert.equal((await request(me)).status, 200);
  assert.equal(state.writes.length, 0);
});

test('canonical read offline fault aborts without fabricated account data', async () => {
  const { state, request } = await harness();
  state.faults.set(me, [{ kind: 'offline' }]);
  assert.deepEqual(await request(me), { aborted: 'internetdisconnected' });
});

test('canonical read holds its reply at the actual request boundary', async () => {
  const { state, request } = await harness();
  let release!: () => void;
  state.faults.set(me, [{ gate: new Promise<void>(resolve => { release = resolve; }) }]);
  let settled = false;
  const pending = request(me).then(reply => { settled = true; return reply; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  release();
  assert.equal((await pending).status, 200);
});

test('canonical write error records one attempt without mutation or revision advance', async () => {
  const { state, request } = await harness();
  const before = canonicalCategoryAccount(state);
  state.faults.set(account, [{ kind: 'error' }]);
  assert.equal((await request(account, 'PATCH', { expectedRevision: before.revision, autoPinning: !before.autoPinning })).status, 503);
  assert.deepEqual(canonicalCategoryAccount(state), before);
  assert.equal(state.writes.length, 1);
});

test('lost canonical write response commits once and fresh read observes it', async () => {
  const { state, request } = await harness();
  const before = canonicalCategoryAccount(state);
  state.faults.set(account, [{ kind: 'lost' }]);
  assert.equal((await request(account, 'PATCH', { expectedRevision: before.revision, autoPinning: !before.autoPinning })).status, 503);
  const observed = JSON.parse((await request(me)).body!).account;
  assert.equal(observed.revision, before.revision + 1);
  assert.equal(observed.autoPinning, !before.autoPinning);
  assert.equal(state.writes.length, 1);
});

test('held write checks revision again and cannot overwrite an external update', async () => {
  const { state, request } = await harness();
  let release!: () => void;
  state.faults.set(account, [{ gate: new Promise<void>(resolve => { release = resolve; }) }]);
  const pending = request(account, 'PATCH', { expectedRevision: 1, autoPinning: true });
  await new Promise(resolve => setImmediate(resolve));
  state.canonicalAccountRevision++;
  release();
  assert.equal((await pending).status, 409);
  assert.equal(state.account.auto_pinning, false);
  assert.equal(state.canonicalAccountRevision, 2);
});

test('unauthenticated requests do not consume an owner fault or write', async () => {
  const { state, request } = await harness();
  state.faults.set(account, [{ kind: 'lost' }]);
  assert.equal((await request(account, 'PATCH', { expectedRevision: 1, autoPinning: true }, false)).status, 401);
  assert.equal(state.faults.get(account)?.length, 1);
  assert.equal(state.writes.length, 0);
});

test('Music descriptor fixture recognizes the canonical account but denies foreign subjects', async () => {
  const { state, request } = await harness();
  state.mode = 'public';
  assert.equal((await request(`/__localtunes/api/music/public-profile/${canonicalCategoryAccount(state).id}`)).status, 200);
  assert.deepEqual(await request('/__localtunes/api/music/public-profile/22222222-2222-4222-8222-222222222222'), { aborted: 'blockedbyclient' });
});

test('first Books collection page establishes its snapshot without a preissued token', async () => {
  const { request } = await harness();
  const response = await request('/api/explorers/v1/collections?category=books&status=active&limit=100');
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body!);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].publicationState, 'published');
  assert.equal(body.nextCursor, null);
  assert.equal(typeof body.snapshotToken, 'string');
});

test('Books continuation without a token and stale snapshot reads remain denied', async () => {
  const { state, request } = await harness();
  const first = JSON.parse((await request('/api/explorers/v1/collections?category=books&status=active&limit=100')).body!);
  assert.equal((await request('/api/explorers/v1/collections?category=books&status=active&limit=100&cursor=books-offset-1')).status, 409);
  state.lists.bookLists[0].Visibility = false;
  assert.equal((await request(`/api/explorers/v1/collections?category=books&status=active&limit=100&snapshotToken=${first.snapshotToken}`)).status, 409);
});

for (const [category, root, relation] of [['movies', 'movieLists', 'recommended_movies'], ['games', 'gameLists', 'recommended_games']] as const) {
  test(`${category} snapshot binds collection and empty recommendation pages to one revision`, async () => {
    const { request } = await harness();
    const response = await request(`/api/explorers/v1/categories/${category}/content-snapshot`);
    assert.equal(response.status, 200);
    const snapshot = JSON.parse(response.body!);
    for (const path of [`/collections?category=${category}&status=all`, `/recommendations?category=${category}&status=all`,
      `/categories/${category}/memberships?collectionStatus=all&recommendationStatus=all`, `/categories/${category}/top-picks?`]) {
      const page = await request(`/api/explorers/v1${path}&limit=24&snapshotToken=${snapshot.snapshotToken}`);
      assert.equal(page.status, 200);
      const body = JSON.parse(page.body!);
      assert.equal(body.snapshot, snapshot.revision);
      assert.equal(body.snapshotToken, snapshot.snapshotToken);
      assert.equal(body.expiresAt, snapshot.expiresAt);
      assert.equal(body.nextCursor, null);
      assert.equal(body.items.length, path.startsWith('/collections') ? 1 : 0);
    }
    assert.equal((await request(`/api/explorers/v1/categories/${category}/content-snapshot/validate?snapshotToken=${snapshot.snapshotToken}`)).status, 200);
  });

  test(`${category} pagination retains its snapshot and rejects stale or missing tokens`, async () => {
    const { state, request } = await harness();
    state.lists[root].push({ ...state.lists[root][0], documentId: `${category}-second`, slug: `${category}-second` });
    const first = JSON.parse((await request(`/api/explorers/v1/collections?category=${category}&status=active&limit=1`)).body!);
    assert.equal(first.items.length, 1);
    assert.equal(typeof first.nextCursor, 'string');
    const next = await request(`/api/explorers/v1/collections?category=${category}&status=active&limit=1&cursor=${first.nextCursor}&snapshotToken=${first.snapshotToken}`);
    assert.equal(next.status, 200);
    assert.notEqual(JSON.parse(next.body!).items[0].id, first.items[0].id);
    assert.equal((await request(`/api/explorers/v1/collections?category=${category}&status=active&limit=1&cursor=${first.nextCursor}`)).status, 409);
    state.lists[root][0].Visibility = false;
    assert.equal((await request(`/api/explorers/v1/categories/${category}/content-snapshot/validate?snapshotToken=${first.snapshotToken}`)).status, 409);
  });

  test(`${category} snapshot requires cookie membership and rejects foreign collection ownership`, async () => {
    const { state, request } = await harness();
    const path = `/api/explorers/v1/categories/${category}/content-snapshot`;
    assert.equal((await request(path, 'GET', undefined, false)).status, 401);
    assert.match(JSON.parse((await request(path)).body!).snapshotToken, /-0$/);
    state.lists[root][0].account = { documentId: 'foreign-owner' };
    assert.equal((await request(path)).status, 403);
  });

  test(`${category} fixture cannot silently replace unconverted recommendation data with emptiness`, async () => {
    const { state, request } = await harness();
    state.lists[root][0][relation] = [{ documentId: 'unconverted-item' }];
    assert.equal((await request(`/api/explorers/v1/categories/${category}/content-snapshot`)).status, 503);
  });
}
