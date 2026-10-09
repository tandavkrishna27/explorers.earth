import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { createMusicPublicationIdempotencyKey } from '../../../tunes/shared/musicPublicationContract';

type Owner = { userId: string; accountId: string; handle: string; cookie: string };
type Scenario = { owners: [Owner, Owner]; secondSession: Owner };
type Fixture = { origin: string; musicOrigin: string; control: { origin: string; capability: string }; sessionSeam: string };
const fixturePath = process.env.MUSIC_E2E_FIXTURE_PATH;
if (!fixturePath) throw new Error('Owned Music fixture missing');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;
for (const origin of [fixture.origin, fixture.musicOrigin, fixture.control.origin])
  if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{3,4}$/.test(origin)) throw new Error('Owned Music loopback origin required');
if (fixture.origin !== process.env.PLAYWRIGHT_EXTERNAL_BASE_URL || fixture.sessionSeam !== 'better-auth-internal-adapter') throw new Error('Music fixture authority mismatch');
let caseId: string;
let scenario: Scenario;
const sockets = new Set<Socket>();
const contexts = new Set<BrowserContext>();
const ownerConnections = new WeakMap<Page, number>();
const song = (n: number) => ({ youtubeId: `fixture000${n}`.slice(-11), title: `Owned song ${n}`, artist: 'Owned artist', thumbnailUrl: 'https://music-fixture.test/thumb.png' });
async function control(action: string, input: Record<string, unknown> = {}) {
  const response = await fetch(`${fixture.control.origin}/control`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-music-fixture-capability': fixture.control.capability }, body: JSON.stringify({ caseId, action, ...input }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Owned Music control denied action ${action}`);
  return response.json();
}
async function install(page: Page, owner: Owner) {
  ownerConnections.set(page, 0);
  page.on('websocket', connection => connection.on('framereceived', frame => { const value = String(frame.payload); if (value.includes('connection_status') && value.includes('"role":"owner"') && value.includes('"status":"connected"')) ownerConnections.set(page, (ownerConnections.get(page) ?? 0) + 1); }));
  const separator = owner.cookie.indexOf('=');
  await page.context().addCookies([{ name: owner.cookie.slice(0, separator), value: owner.cookie.slice(separator + 1), url: fixture.origin, sameSite: 'Lax' }]);
  await page.route('**/*', route => {
    const target = new URL(route.request().url());
    return ['data:', 'blob:'].includes(target.protocol) || target.origin === fixture.origin ? route.continue() : route.abort();
  });
  const me = await page.context().request.get(`${fixture.origin}/api/explorers/v1/me`);
  expect(me.status(), 'Real canonical /me must validate the installed session').toBe(200);
  await page.goto('/recommendations/music');
  await expect(page.getByRole('tablist', { name: 'Music sections' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New playlist', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'Live', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Music workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search music or paste a URL' })).toBeEnabled();
  await page.getByRole('tab', { name: 'Playlists', exact: true }).click();
}
async function ensure(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/explorers/v1/music/identity/ensure', { method: 'POST', credentials: 'include' });
    if (!response.ok) throw new Error(`Canonical ensure failed ${response.status}`);
    const value = await response.json();
    if (!value.credential?.token || value.identity?.status !== 'active') throw new Error('Canonical issuance incomplete');
    return value;
  });
}
async function ownerRequest(page: Page, method: string, path: string, body?: unknown, key: string = randomUUID()) {
  return page.evaluate(async ({ method, path, body, key }) => {
    const musicApiPath = '/src/features/music/musicApi.ts'; const { musicApi } = await import(musicApiPath);
    const response = await musicApi.request({ method, path, body, idempotencyKey: key });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }, { method, path, body, key });
}
async function direct(token: string, method: string, path: string, body?: unknown, origin = fixture.origin, key: string = randomUUID()) {
  const response = await fetch(`${fixture.musicOrigin}${path}`, { method, headers: { authorization: `Bearer ${token}`, origin, 'content-type': 'application/json', 'idempotency-key': key }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function publication(page: Page, mode: string, key = createMusicPublicationIdempotencyKey(Date.now(), randomUUID())) {
  const response = await ownerRequest(page, 'POST', '/api/music/publication', { mode }, key);
  expect(response.status).toBe(200);
  return response.body;
}
async function savedReference(page: Page, n: number) {
  const list = await ownerRequest(page, 'POST', '/api/playlists', { name: `Reference ${n}` }); expect(list.status).toBe(201);
  const item = await ownerRequest(page, 'POST', `/api/playlists/${list.body.id}/songs`, song(n)); expect(item.status).toBe(201);
  return { playlistId: list.body.id, songId: item.body.id };
}
async function sharingControls(page: Page, visible = true) {
  expect((await ownerRequest(page, 'PATCH', '/api/music/guest-controls', { allowSongRequests: true, allowGuestPlayOnDevice: true, allowPlaylistSharing: visible, allowRecentlyPlayedVisibility: visible, allowQueueVisibility: visible })).status).toBe(200);
}
async function socket(auth: Record<string, string>, origin = fixture.origin) {
  const connection = io(fixture.musicOrigin, { path: '/ws', transports: ['websocket'], extraHeaders: { Origin: origin }, auth, reconnection: false, autoConnect: false });
  sockets.add(connection);
  const opened = new Promise<void>((resolve, reject) => { connection.once('connection_status', () => resolve()); connection.once('connect_error', () => reject(new Error('Owned socket handshake refused'))); setTimeout(() => reject(new Error('Owned socket never opened')), 10000).unref(); });
  connection.connect(); await opened; return connection;
}
async function ownerSocket(token: string) {
  const response = await direct(token, 'POST', '/api/music/socket-ticket');
  expect(response.status).toBe(200);
  return socket({ token: response.body.ticket.token ?? response.body.ticket });
}
async function event(connection: Socket, name: string, emit?: () => void) {
  const received = new Promise<any>((resolve, reject) => { const timer = setTimeout(() => { connection.off(name, done); reject(new Error(`Expected socket event ${name}`)); }, 10000); const done = (value: unknown) => { clearTimeout(timer); resolve(value); }; connection.once(name, done); });
  emit?.(); return received;
}
async function noEvent(connection: Socket, name: string, emit: () => unknown) {
  let observed = false; const listener = () => { observed = true; }; connection.on(name, listener);
  try { await emit(); await new Promise(resolve => setTimeout(resolve, 750)); expect(observed).toBe(false); } finally { connection.off(name, listener); }
}
async function guestResource(slug: string, capability?: string) {
  const response = await fetch(`${fixture.musicOrigin}/api/music/public-resource/v1/${slug}`, { headers: capability ? { 'x-music-guest-capability': capability } : {}, signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}
test.beforeEach(async ({ page }, info) => {
  caseId = `${info.project.name}:${info.title}`;
  scenario = await control('prepare');
  await install(page, scenario.owners[0]);
});
test.afterEach(async () => {
  for (const connection of sockets) connection.disconnect(); sockets.clear();
  for (const context of contexts) await context.close(); contexts.clear();
  await control('reset');
});

test('canonical cookie ensure opens one owner workspace and survives reload', async ({ page }) => {
  const first = await ensure(page), second = await ensure(page);
  expect(first.identity.musicUserId).toBe(second.identity.musicUserId);
  expect((await ownerRequest(page, 'GET', '/api/music/dashboard')).status).toBe(200);
  expect((await ownerRequest(page, 'GET', '/api/music/entitlement')).body.coreMutation).toBe(true);
  await page.reload();
  expect((await ensure(page)).identity.musicUserId).toBe(first.identity.musicUserId);
  const state = await control('mapping'); expect(state.identityRows).toBe(1);
});

test('owner playlists songs queue playback and history preserve transactions', async ({ page }) => {
  await page.getByRole('button', { name: 'New playlist', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create playlist', exact: true });
  await dialog.getByLabel('Playlist name', { exact: true }).fill('Owned list');
  await dialog.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await expect(dialog).toBeHidden();
  const lists = await ownerRequest(page, 'GET', '/api/playlists'); const id = lists.body.find((value: any) => value.name === 'Owned list').id;
  await page.getByRole('button', { name: 'Rename playlist', exact: true }).click();
  const rename = page.getByRole('dialog', { name: 'Rename playlist', exact: true });
  await rename.getByLabel('Playlist name', { exact: true }).fill('Owned edited');
  await rename.getByRole('button', { name: 'Save playlist', exact: true }).click();
  await expect(rename).toBeHidden(); expect((await ownerRequest(page, 'GET', `/api/playlists/${id}`)).body.name).toBe('Owned edited');
  const one = await ownerRequest(page, 'POST', `/api/playlists/${id}/songs`, song(1));
  const two = await ownerRequest(page, 'POST', `/api/playlists/${id}/songs`, song(2));
  expect(one.status).toBe(201); expect(two.status).toBe(201);
  expect((await ownerRequest(page, 'PATCH', `/api/playlists/${id}/reorder`, { songId: two.body.id, position: 0 })).status).toBe(204);
  expect((await ownerRequest(page, 'DELETE', `/api/playlists/${id}/songs/${one.body.id}`)).status).toBe(204);
  const start = (await ownerRequest(page, 'GET', '/api/music/dashboard')).body;
  const refs = [await savedReference(page, 3), await savedReference(page, 4), await savedReference(page, 5)];
  const replaced = await ownerRequest(page, 'POST', '/api/music/queue/replace', { expectedRevision: start.queueRevision, songs: refs.slice(0, 2) }); expect(replaced.status).toBe(200);
  const appended = await ownerRequest(page, 'POST', '/api/music/queue/append', { expectedRevision: replaced.body.revision, songs: refs.slice(2) }); expect(appended.status).toBe(200);
  expect((await ownerRequest(page, 'POST', '/api/playlist/currently-playing', { songId: appended.body.songs[0].id })).status).toBe(200);
  expect((await ownerRequest(page, 'POST', '/api/playlist/currently-playing', { songId: appended.body.songs[1].id })).status).toBe(200);
  await page.reload(); const final = (await ownerRequest(page, 'GET', '/api/music/dashboard')).body;
  expect(final.currentlyPlaying.id).toBe(appended.body.songs[1].id); expect(final.playedSongs.some((value: any) => value.id === appended.body.songs[0].id)).toBe(true);
  expect((await ownerRequest(page, 'DELETE', `/api/playlists/${id}`)).status).toBe(204);
});

test('foreign playlist song and venue identifiers deny owner access', async ({ page, browser }) => {
  const list = await ownerRequest(page, 'POST', '/api/playlists', { name: 'Private A' });
  const item = await ownerRequest(page, 'POST', `/api/playlists/${list.body.id}/songs`, song(6));
  const queued = await ownerRequest(page, 'POST', '/api/playlist/songs', song(6)); expect(queued.status).toBe(201);
  const context = await browser.newContext(); contexts.add(context); const other = await context.newPage(); await install(other, scenario.owners[1]);
  for (const [method, path, body] of [['GET', `/api/playlists/${list.body.id}`, undefined], ['PATCH', `/api/playlists/${list.body.id}`, { name: 'forged' }], ['DELETE', `/api/playlists/${list.body.id}/songs/${item.body.id}`, undefined]] as const)
    expect((await ownerRequest(other, method, path, body)).status).toBe(404);
  expect((await ownerRequest(other, 'POST', '/api/playlists', { name: 'forged', accountId: scenario.owners[0].accountId })).status).toBe(400);
  expect((await ownerRequest(other, 'DELETE', `/api/playlist/songs/${queued.body.id}`)).status).toBe(404);
  expect((await ownerRequest(other, 'POST', '/api/playlist/currently-playing', { songId: queued.body.id })).status).toBe(404);
  expect((await ownerRequest(other, 'GET', '/api/music/dashboard')).body.songs.some((value: any) => value.id === queued.body.id)).toBe(false);
  const foreignVenue = (await ensure(page)).identity.musicUserId;
  expect((await ownerRequest(other, 'GET', `/api/music/dashboard?userId=${foreignVenue}`)).status).toBe(400);
  await page.context().clearCookies(); await install(page, scenario.owners[1]);
  expect((await ownerRequest(page, 'GET', '/api/playlists')).body.some((value: any) => value.id === list.body.id)).toBe(false);
  await expect(page.getByText('Private A', { exact: true })).toHaveCount(0);
});

test('expired owner credential refresh safely replays one mutation', async ({ page }) => {
  const reference = await savedReference(page, 7);
  const original = await ensure(page); const before = (await ownerRequest(page, 'GET', '/api/music/dashboard')).body;
  await control('clock', { offsetMs: 601000 });
  expect((await direct(original.credential.token, 'GET', '/api/playlists')).status).toBe(401);
  let ensures = 0; page.on('request', request => { if (request.url().endsWith('/api/explorers/v1/music/identity/ensure')) ensures++; });
  const key: string = randomUUID(), body = { expectedRevision: before.queueRevision, songs: [reference] };
  const result = await ownerRequest(page, 'POST', '/api/music/queue/append', body, key); expect(result.status).toBe(200);
  expect((await ownerRequest(page, 'POST', '/api/music/queue/append', body, key)).status).toBe(200);
  expect(ensures).toBeGreaterThan(0); expect((await ownerRequest(page, 'GET', '/api/music/dashboard')).body.songs.filter((value: any) => value.youtubeId === song(7).youtubeId)).toHaveLength(1);
  expect((await page.context().request.get('/api/explorers/v1/me')).status()).toBe(200);
});

test('transport reconnect mints a new HTTP socket ticket', async ({ page }) => {
  await ensure(page);
  const proof = await page.evaluate(async () => {
    const musicApiPath = '/src/features/music/musicApi.ts'; const { musicApi } = await import(musicApiPath);
    const ownerLivePath = '/src/features/music/ownerMusicLiveClient.ts'; const { subscribeToOwnerMusic } = await import(ownerLivePath);
    const socketModulePath = '/node_modules/socket.io-client/build/esm/index.js'; const { io } = await import(socketModulePath);
    let connection: any, tickets = 0, previous = '', different = false, connections = 0;
    const subscription = subscribeToOwnerMusic({ mintTicket: async () => { const value = await (await musicApi.request({ method: 'POST', path: '/api/music/socket-ticket' })).json(); const token = value.ticket.token ?? value.ticket; tickets++; if (previous) different = previous !== token; previous = token; return token; }, onInvalidate: async () => undefined }, { socketFactory: (auth: any) => { connection = io(location.origin, { path: '/__localtunes/ws', transports: ['websocket'], auth, reconnectionDelay: 50 }); connection.on('connect', () => connections++); return connection; } });
    try { const wait = async (predicate: () => boolean) => { for (let n = 0; n < 200; n++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Successful real reconnect not observed'); }; await wait(() => connections === 1); connection.io.engine.close(); await wait(() => connections >= 2); return { tickets, different, connections }; } finally { subscription.unsubscribe(); }
  });
  expect(proof.tickets).toBeGreaterThanOrEqual(2); expect(proof.connections).toBeGreaterThanOrEqual(2); expect(proof.different).toBe(true);
});

test('browser sign out revokes same session activity and preserves another session', async ({ page, browser }) => {
  await sharingControls(page);
  await expect.poll(() => ownerConnections.get(page) ?? 0).toBeGreaterThan(0);
  const first = await ensure(page);
  const independentS1 = await ownerSocket(first.credential.token);
  const context = await browser.newContext(); contexts.add(context); const second = await context.newPage(); await install(second, scenario.secondSession); const issuedS2 = await ensure(second); const independentS2 = await ownerSocket(issuedS2.credential.token);
  const published = await publication(page, 'unlisted');
  const guest = await socket({ guestCapability: published.capability });
  const response = page.waitForResponse(value => value.url().endsWith('/api/auth/sign-out') && value.request().method() === 'POST');
  const logout = page.getByText('Logout', { exact: true }).first();
  if (!await logout.isVisible()) await page.getByAltText('profile', { exact: true }).first().click();
  await logout.click(); expect((await response).status()).toBe(200);
  expect((await page.context().request.get('/api/explorers/v1/me')).status()).toBe(401);
  const revoked = event(independentS1, 'music_error');
  await noEvent(guest, 'player_state', () => independentS1.emit('player_state', { playing: true, position: 11 }));
  expect((await revoked).error.code).toMatch(/AUTH|TOKEN|SESSION/);
  expect((await direct(first.credential.token, 'POST', '/api/playlists', { name: 'Denied S1' })).status).toBe(401);
  expect((await direct(issuedS2.credential.token, 'POST', '/api/playlists', { name: 'Surviving S2' })).status).toBe(201);
  const delivered = await event(guest, 'player_state', () => independentS2.emit('player_state', { playing: true, position: 22 })); expect(delivered.position).toBe(22);
  await noEvent(independentS1, 'guest_request', () => guest.emit('guest_request', { type: 'song', externalId: 'surviving-session' }));
});

test('owner publication replay and stale revisions preserve public state', async ({ page }) => {
  await sharingControls(page);
  const reference = await savedReference(page, 8);
  const key = createMusicPublicationIdempotencyKey(Date.now(), randomUUID());
  const first = await publication(page, 'unlisted', key), replay = await publication(page, 'unlisted', key);
  expect(first.publication).toEqual(replay.publication); expect(first.capability === replay.capability).toBe(true);
  expect((await ownerRequest(page, 'POST', '/api/music/publication', { mode: 'public' }, key)).status).toBe(409);
  const before = await guestResource(first.publication.publicSlug, first.capability);
  const observer = await socket({ publicSlug: first.publication.publicSlug, guestCapability: first.capability });
  await noEvent(observer, 'music_public_change', async () => { expect((await ownerRequest(page, 'POST', '/api/music/publication', { mode: 'unlisted' }, key)).status).toBe(200); });
  const draft = (await ownerRequest(page, 'GET', '/api/music/dashboard')).body;
  await noEvent(observer, 'music_public_change', async () => { expect((await ownerRequest(page, 'POST', '/api/music/queue/append', { expectedRevision: draft.queueRevision + 1, songs: [reference] })).status).toBe(409); });
  expect((await ownerRequest(page, 'GET', '/api/music/dashboard')).body).toEqual(draft);
  const after = await guestResource(first.publication.publicSlug, first.capability); expect(after.body).toEqual(before.body);
  // Start the visibility read in the notification callback, independently of the
  // mutation response. Buffering only the event and reading after HTTP would hide
  // a notification that announced state before it became publicly visible.
  const visibleAtNotification = new Promise<any>((resolve, reject) => {
    const listener = (notification: any) => {
      void guestResource(first.publication.publicSlug, first.capability).then(committed => {
        expect(committed.status).toBe(200);
        expect(committed.body.revision).toBeGreaterThanOrEqual(notification.revision);
        expect(committed.body.queue.items.some((value: any) => value.youtubeId === song(8).youtubeId)).toBe(true);
        resolve({ notification, committed });
      }).catch(reject).finally(() => clearTimeout(timer));
    };
    const timer = setTimeout(() => { observer.off('music_public_change', listener); reject(new Error('Expected committed public notification')); }, 15000);
    observer.once('music_public_change', listener);
  });
  const mutation = ownerRequest(page, 'POST', '/api/music/queue/append', { expectedRevision: draft.queueRevision, songs: [reference] });
  const [response, observed] = await Promise.all([mutation, visibleAtNotification]);
  expect(response.status).toBe(200);
  expect(response.body.revision).toBe(draft.queueRevision + 1);
  expect(observed.committed.body.queue.items.map((value: any) => value.youtubeId)).toEqual(response.body.songs.map((value: any) => value.youtubeId));
});

test('guest request owner acceptance and player updates use separate authority', async ({ page, browser }) => {
  await sharingControls(page);
  const credential = await ensure(page), owner = await ownerSocket(credential.credential.token), published = await publication(page, 'unlisted');
  const guestContext = await browser.newContext(); contexts.add(guestContext); const guestPage = await guestContext.newPage();
  await guestPage.route('**/*', route => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
  await guestPage.goto(`${fixture.origin}/music/share/${published.publication.publicSlug}#access=${published.capability}`);
  await expect(guestPage.getByRole('heading', { name: 'Request a song', exact: true })).toBeVisible();
  await guestPage.getByLabel('Search for a song or paste a YouTube URL').fill('Owned guest choice'); await guestPage.getByRole('button', { name: 'Search', exact: true }).click();
  await guestPage.getByRole('button', { name: 'Request Owned provider result by Owned provider', exact: true }).click(); await expect(guestPage.getByText('Song requested.', { exact: true })).toBeVisible();
  await expect.poll(async () => (await ownerRequest(page, 'GET', '/api/music/dashboard')).body.songs.filter((value: any) => value.youtubeId === 'fixture0001').length).toBe(1);
  const accepted = (await ownerRequest(page, 'GET', '/api/music/dashboard')).body.songs.find((value: any) => value.youtubeId === 'fixture0001');
  expect((await ownerRequest(page, 'POST', '/api/playlist/currently-playing', { songId: accepted.id })).status).toBe(200);
  const guest = await socket({ guestCapability: published.capability });
  const request = await event(owner, 'guest_request', () => guest.emit('guest_request', { type: 'song', externalId: song(9).youtubeId })); expect(request.type).toBe('song');
  expect((await event(guest, 'player_state', () => owner.emit('player_state', { playing: true, externalId: song(9).youtubeId }))).playing).toBe(true);
  expect((await direct(published.capability, 'POST', '/api/playlists', { name: 'guest-forged' })).status).toBe(401);
  expect((await event(guest, 'music_error', () => guest.emit('player_state', { playing: true }))).error.code).toBeTruthy();
});

test('public unlisted and revoked sharing deny hidden data', async ({ page }) => {
  await sharingControls(page, false);
  const hidden = await ownerRequest(page, 'POST', '/api/playlists', { name: 'Hidden owner-only playlist' }); expect(hidden.status).toBe(201);
  const publicState = await publication(page, 'public'); const projection = await guestResource(publicState.publication.publicSlug); expect(projection.status).toBe(200);
  expect(JSON.stringify(projection.body)).not.toMatch(/auth_session|credential|sessionVersion|accountId|userId/);
  expect(JSON.stringify(projection.body)).not.toContain('Hidden owner-only playlist');
  const publicObserver = await socket({ publicSlug: publicState.publication.publicSlug }); const payloads: unknown[] = [];
  publicObserver.onAny((_name, value) => payloads.push(value));
  const changed = event(publicObserver, 'music_public_change'); expect((await ownerRequest(page, 'POST', `/api/playlists/${hidden.body.id}/songs`, song(6))).status).toBe(201); await changed;
  expect(payloads.length).toBeGreaterThan(0); expect(JSON.stringify(payloads)).not.toMatch(/Hidden owner-only playlist|auth_session|credential|sessionVersion|accountId|musicUserId|userId/);
  const unlisted = await publication(page, 'unlisted'); expect((await guestResource(unlisted.publication.publicSlug)).status).toBe(404);
  expect((await guestResource(unlisted.publication.publicSlug, unlisted.capability)).status).toBe(200);
  const connected = await socket({ guestCapability: unlisted.capability }); const errors = event(connected, 'music_error');
  await publication(page, 'private'); connected.emit('guest_request', { type: 'song', externalId: 'revoked' }); expect((await errors).error.code).toBeTruthy();
  expect((await guestResource(unlisted.publication.publicSlug, unlisted.capability)).status).toBe(404);
  const fresh = await publication(page, 'unlisted'), suspended = await socket({ guestCapability: fresh.capability }); await control('suspend');
  expect((await guestResource(fresh.publication.publicSlug, fresh.capability)).status).toBe(404);
  expect((await event(suspended, 'music_error', () => suspended.emit('guest_request', { type: 'song', externalId: 'suspended' }))).error.code).toBeTruthy();
});

test('newer public revisions survive delayed and out of order notifications', async ({ page, browser }) => {
  await sharingControls(page);
  const published = await publication(page, 'public'); const observer = await socket({ publicSlug: published.publication.publicSlug });
  const before = await guestResource(published.publication.publicSlug);
  const context = await browser.newContext(); contexts.add(context); const publicPage = await context.newPage();
  const revisions: number[] = [], loaded: number[] = [];
  observer.on('music_public_change', value => revisions.push(value.revision));
  publicPage.on('response', response => { if (response.status() === 200 && response.url().includes('/api/music/public-resource/v1/')) void response.json().then(value => loaded.push(value.revision)); });
  await publicPage.route('**/*', route => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
  let subscribed = false; publicPage.on('websocket', connection => connection.on('framereceived', frame => { if (String(frame.payload).includes('"role":"public"') && String(frame.payload).includes('connection_status')) subscribed = true; }));
  await publicPage.goto(`${fixture.origin}/music/share/${published.publication.publicSlug}`); await expect.poll(() => subscribed).toBe(true);
  const firstChange = event(observer, 'music_public_change'); await ownerRequest(page, 'POST', '/api/playlist/songs', song(1)); await firstChange;
  const secondChange = event(observer, 'music_public_change'); await ownerRequest(page, 'POST', '/api/playlist/songs', song(2)); await secondChange;
  const newer = await guestResource(published.publication.publicSlug); expect(newer.body.revision).toBeGreaterThan(before.body.revision);
  await expect.poll(() => loaded.includes(newer.body.revision)).toBe(true); expect(revisions.length).toBeGreaterThanOrEqual(2);
  const queue = publicPage.getByRole('button', { name: 'Queue', exact: true }); if (await queue.getAttribute('aria-expanded') !== 'true') await queue.click();
  await expect(publicPage.getByText('Owned song 2', { exact: true })).toBeVisible();
  await control('notify', { revision: before.body.revision }); await control('notify', { revision: newer.body.revision }); await new Promise(resolve => setTimeout(resolve, 500));
  await expect.poll(() => revisions.slice(2).includes(before.body.revision)).toBe(true);
  expect((await guestResource(published.publication.publicSlug)).body.revision).toBe(newer.body.revision);
  expect(revisions.at(-1)).toBeGreaterThanOrEqual(newer.body.revision); expect(loaded.every((revision, index) => index === 0 || revision >= loaded[index - 1])).toBe(true);
  await expect(publicPage.getByText('Owned song 2', { exact: true })).toBeVisible(); await publicPage.reload(); await expect.poll(() => loaded.at(-1)).toBe(newer.body.revision);
  await page.reload(); expect((await ownerRequest(page, 'GET', '/api/music/dashboard')).body.songs).toHaveLength(2);
});

test('provider outage and retry preserve owner draft and bounded controls', async ({ page }) => {
  const draft = await ownerRequest(page, 'POST', '/api/playlists', { name: 'Persistent provider draft' }); expect(draft.status).toBe(201);
  await page.getByRole('tab', { name: 'Live', exact: true }).click();
  const region = page.getByRole('region', { name: 'Music workspace', exact: true });
  const input = region.getByRole('searchbox', { name: 'Search music or paste a URL' });
  await input.fill('Owned saved search draft');
  for (const mode of ['unavailable', 'timeout', 'rate-limit', 'oversized']) {
    await control('provider', { mode });
    const failed = page.waitForResponse(response => response.url().endsWith('/__localtunes/api/youtube/search'));
    await region.getByRole('button', { name: 'Search', exact: true }).click(); expect([502, 503]).toContain((await failed).status());
    await expect(region.getByRole('alert', { name: 'Music discovery error' })).toBeVisible();
    await expect(input).toHaveValue('Owned saved search draft');
    await expect(region.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
    expect((await ownerRequest(page, 'GET', `/api/playlists/${draft.body.id}`)).body.name).toBe('Persistent provider draft');
  }
  await control('provider', { mode: 'success' }); const retried = page.waitForResponse(response => response.url().endsWith('/__localtunes/api/youtube/search'));
  await region.getByRole('button', { name: 'Try search again', exact: true }).click(); expect((await retried).status()).toBe(200);
  await expect(region.getByText('Owned provider result', { exact: true })).toBeVisible();
  const persisted = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage])); expect(persisted).not.toMatch(/YOUTUBE_API_KEY|fixture-provider-key|Bearer|musicToken/);
});

test('origin expiry and guest request limits fail closed', async ({ page }) => {
  await sharingControls(page);
  const issued = await ensure(page); expect((await direct(issued.credential.token, 'POST', '/api/playlists', { name: 'Denied origin' }, 'https://foreign.invalid')).status).toBe(403);
  const credentialHandshake = io(fixture.musicOrigin, { path: '/ws', transports: ['websocket'], extraHeaders: { Origin: fixture.origin }, auth: { token: issued.credential.token }, reconnection: false, autoConnect: false }); sockets.add(credentialHandshake);
  const refused = event(credentialHandshake, 'connect_error'); credentialHandshake.connect(); await refused;
  const ticket = await direct(issued.credential.token, 'POST', '/api/music/socket-ticket'); expect((await direct(ticket.body.ticket.token ?? ticket.body.ticket, 'GET', '/api/playlists')).status).toBe(401);
  const published = await publication(page, 'unlisted'), guest = await socket({ guestCapability: published.capability });
  let httpLimited = false;
  for (let n = 0; n < 120 && !httpLimited; n++) { const response = await fetch(`${fixture.musicOrigin}/api/playlist/${published.publication.publicSlug}/requests`, { method: 'POST', headers: { Origin: fixture.origin, 'content-type': 'application/json', 'x-music-guest-capability': published.capability, 'idempotency-key': randomUUID() }, body: JSON.stringify(song(9)) }); if (response.status === 429) httpLimited = true; else expect(response.status).toBe(201); }
  expect(httpLimited).toBe(true);
  expect((await event(guest, 'music_error', () => guest.emit('unsupported_owned_event', { invalid: true }))).error.code).toBeTruthy();
  expect((await event(guest, 'music_error', () => guest.emit('guest_request', { type: 'song', externalId: 'x'.repeat(4096) }))).error.code).toBeTruthy();
  let limited = false; guest.on('music_error', value => { if (value.error?.code === 'RATE_LIMITED') limited = true; });
  for (let n = 0; n < 100; n++) guest.emit('guest_request', { type: 'song', externalId: `owned-${n}` });
  await expect.poll(() => limited).toBe(true);
  await control('clock', { offsetMs: 601000 }); expect((await direct(issued.credential.token, 'GET', '/api/playlists')).status).toBe(401);
});
