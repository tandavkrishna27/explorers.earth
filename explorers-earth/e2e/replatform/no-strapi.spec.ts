import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { assertFixtureOrigin, publicReadBudgetDelayMs } from './proxy-fixture-authority.mjs';
import { Monitor, POISON_ORIGIN, guardedContext } from './no-strapi-monitor';
import { ROUTES, EXCLUDED, type RouteCase } from './no-strapi-routes';

type Persona = { userId: string; cookie: string; handle: string };
type Fixture = { origin: string; personas: Record<'ownerA' | 'ownerB' | 'ownerC', Persona> };
let cached: Fixture | undefined;
/** Read on first use, not at import, so `playwright test --list` can enumerate cases without the runner. */
function fixture(): Fixture {
  if (cached) return cached;
  const path = process.env.PROFILE_E2E_FIXTURE_PATH;
  if (!path) throw new Error('No-Strapi E2E requires the owned loopback fixture runner');
  const loaded = JSON.parse(readFileSync(path, 'utf8')) as Fixture;
  assertFixtureOrigin(loaded);
  return (cached = loaded);
}

/** Measured on the first green run (2026-10-19), then fixed here. Lower them only with a written reason. */
const MODULE_FLOOR = 500; // measured 572 distinct /src/ modules
const API_FLOOR = 40;     // 90% of the 45 distinct successful canonical API paths measured, rounded down
const VIEWPORT = { desktop: { width: 1365, height: 900 }, mobile: { width: 390, height: 844 } } as const;
const CASES = ROUTES.flatMap((route) => (route.viewport ? [route.viewport] : (['desktop', 'mobile'] as const))
  .map((viewport) => ({ route, viewport })));
/** A fixed number, not CASES.length: moving a case into EXCLUDED must trip this, not silently lower it. Measured: 176. */
const ROUTE_FLOOR = 176;

const RUN = new Monitor();
const executed = new Set<string>();
/**
 * The two states a broken owner page ends on without changing its URL (ProtectedRoute.tsx):
 * EarthLoader renders role="status" aria-label="Earth loading", and OnboardingCheckError renders
 * the heading "Couldn't load your account". A hidden category does not need one: TabVisibilityGuard
 * redirects to the username root, which the landing assertion catches.
 */
const BROKEN_STATE = `[role="status"][aria-label="Earth loading"], h1:has-text("Couldn't load your account")`;

async function signIn(context: BrowserContext, persona: Persona) {
  // The session cookie is the whole sign-in. The persisted auth store discards anything put in
  // localStorage (store.ts: partialize to {}, merge keeps current), so no init script is needed.
  const separator = persona.cookie.indexOf('=');
  await context.addCookies([{ name: persona.cookie.slice(0, separator), value: persona.cookie.slice(separator + 1),
    url: fixture().origin, sameSite: 'Lax' }]);
}

/**
 * Canonical rate-limits public profile reads (explorersPublicProfileRoutes.ts: 120 a minute, draft-7
 * RateLimit header). Visited back to back, the public cases exhaust it, and a throttled page renders
 * "404 Page Not Found" on an unchanged URL. Wait for the window when fewer reads remain than one public
 * page can spend (measured: well under PUBLIC_PAGE_READS), and let the 429 check below catch the rest.
 */
const PUBLIC_PAGE_READS = 40;
async function awaitPublicReadBudget(context: BrowserContext, handle: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await context.request.get(`/api/explorers/v1/profiles/${handle}`);
    // Validates the header's shape; returns the time to the window reset.
    const untilReset = publicReadBudgetDelayMs(response.headers().ratelimit);
    const remaining = Number(/remaining=(\d+)/.exec(response.headers().ratelimit ?? '')?.[1]);
    if (response.status() === 200 && (untilReset === 0 || remaining >= PUBLIC_PAGE_READS)) return;
    await new Promise((done) => setTimeout(done, untilReset || 1_000));
  }
  throw new Error('public read budget did not recover');
}

function routeOccurrences(): Set<string> {
  const directory = resolve(process.cwd(), 'src/routes');
  const found = new Set<string>();
  for (const file of readdirSync(directory).filter((name) => /\.tsx$/.test(name))) {
    const counts = new Map<string, number>();
    for (const match of readFileSync(resolve(directory, file), 'utf8').matchAll(/path="([^"]*)"/g)) {
      const n = (counts.get(match[1]) ?? 0) + 1;
      counts.set(match[1], n);
      found.add(`${file}:${match[1]}#${n}`);
    }
  }
  return found;
}

function landedOk(page: Page, route: RouteCase, visited: string): string | null {
  const landed = new URL(page.url()).pathname;
  if (route.as === 'owner' && /^\/(login|onboarding)(\/|$)/.test(landed)) return `owner case bounced to ${landed}`;
  const expected = route.lands ?? new RegExp(`^${visited.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return expected.test(landed) ? null : `landed on ${landed}, expected ${expected}`;
}

test('route table claims every route-literal occurrence exactly once, and nothing stale', () => {
  const occurrences = routeOccurrences();
  // VACUITY GUARD: an empty scan (wrong cwd, moved directory) must fail, not pass.
  expect(occurrences.size, 'route literal scan found nothing').toBeGreaterThan(80);
  const claims = [...ROUTES.flatMap((route) => route.source), ...Object.keys(EXCLUDED)];
  expect(claims.filter((claim, index) => claims.indexOf(claim) !== index), 'occurrence claimed twice').toEqual([]);
  expect([...occurrences].filter((key) => !claims.includes(key)), 'route occurrence with no case').toEqual([]);
  expect(claims.filter((claim) => !occurrences.has(claim)), 'stale claim').toEqual([]);
});

test('monitor self-test: every channel to Strapi is seen and refused, and canonical is allowed', async ({ browser }) => {
  const monitor = new Monitor();
  const context = await guardedContext(browser, monitor, fixture().origin, VIEWPORT.desktop);
  try {
    const page = await context.newPage();
    await page.goto('/about');
    const nonce = randomUUID();
    monitor.issueNonce(nonce);
    const outcome = await page.evaluate(async ({ nonce, poison }) => {
      const q = `nostrapi-selftest=${nonce}`;
      const settle = (promise: Promise<unknown>) => promise.then(() => 'reached', () => 'refused');
      const timeout = <T,>(promise: Promise<T>, label: T) => Promise.race([promise, new Promise<T>((done) => setTimeout(() => done(label), 5000))]);
      const image = new Promise<string>((done) => { const i = new Image(); i.onload = () => done('reached'); i.onerror = () => done('refused'); i.src = `http://localhost:1337/uploads/self-test.png?${q}`; });
      // A socket closed by routeWebSocket without connecting fires only onclose.
      const socket = new Promise<string>((done) => { let opened = false; const s = new WebSocket(`ws://localhost:1337/self-test?${q}`);
        s.onopen = () => { opened = true; }; s.onerror = () => done('refused'); s.onclose = () => done(opened ? 'reached' : 'refused'); });
      const worker = new Promise<string>((done) => {
        const source = `fetch(${JSON.stringify(`${poison}/worker?${q}`)}).then(()=>postMessage('reached'),()=>postMessage('refused'))`;
        new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))).onmessage = (event) => done(String(event.data));
      });
      navigator.sendBeacon(`${poison}/beacon?${q}`, 'x');
      return {
        poisonGraphql: await settle(fetch(`${poison}/graphql?${q}`, { method: 'POST', body: '{}' })),
        sameOriginGraphql: await settle(fetch(`/graphql?${q}`, { method: 'POST', body: '{}' })),
        productionStrapi: await settle(fetch(`https://api.localqr.earth/api/users/me?${q}`)),
        image: await timeout(image, 'timeout'), socket: await timeout(socket, 'timeout'), worker: await timeout(worker, 'timeout'),
        canonical: (await fetch('/api/explorers/v1/me')).status,
      };
    }, { nonce, poison: POISON_ORIGIN });
    expect(outcome).toMatchObject({ poisonGraphql: 'refused', sameOriginGraphql: 'refused', productionStrapi: 'refused',
      image: 'refused', socket: 'refused', worker: 'refused' });
    // Negative control: an unauthenticated canonical call answers through the monitor (401).
    expect(outcome.canonical).toBe(401);
    expect(monitor.observations.some((o) => o.verdict === 'local' && o.url.endsWith('/api/explorers/v1/me'))).toBe(true);
    const expected = [`${POISON_ORIGIN}/graphql`, `${fixture().origin}/graphql`, 'https://api.localqr.earth/api/users/me',
      'http://localhost:1337/uploads/self-test.png', 'ws://localhost:1337/self-test', `${POISON_ORIGIN}/worker`, `${POISON_ORIGIN}/beacon`];
    await expect.poll(() => expected.filter((target) => !monitor.selfTest(nonce)
      .some((o) => o.verdict === 'poisoned' && o.url.startsWith(target)))).toEqual([]);
    expect(monitor.violations(), 'loading /about itself reached Strapi or an unclassified origin').toEqual([]);
  } finally {
    await context.close();
  }
});

for (const { route, viewport } of CASES) {
  const title = `${viewport} ${route.source.join(' + ')} makes no Strapi request`;
  test(title, async ({ browser }) => {
    const { origin, personas } = fixture();
    const context = await guardedContext(browser, RUN, origin, VIEWPORT[viewport]);
    try {
      if (route.as === 'owner') await signIn(context, personas.ownerA);
      if (route.as === 'fresh') await signIn(context, personas.ownerB);
      const handle = personas.ownerA.handle;
      if (route.as === 'anon' && route.url(handle).startsWith(`/${handle}`)) await awaitPublicReadBudget(context, handle);
      const page = await context.newPage();
      const me = route.as === 'anon' ? undefined
        : page.waitForResponse((r) => new URL(r.url()).pathname === '/api/explorers/v1/me' && r.status() === 200, { timeout: 20_000 });
      const before = RUN.violations().length;
      const throttledBefore = RUN.throttled.length;
      const visited = route.url(personas.ownerA.handle);
      await page.goto(visited);
      if (me) await me; // the owner was really admitted, not bounced before any read
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      expect(RUN.violations().slice(before)).toEqual([]);
      expect(RUN.throttled.slice(throttledBefore), 'a canonical read was rate-limited, so the page never rendered its data').toEqual([]);
      expect(landedOk(page, route, visited)).toBeNull();
      // Same-path failure states: ProtectedRoute renders a loader or an error without navigating.
      // A hidden category redirects instead, and landedOk catches that. None may be what the case ends on.
      await expect(page.locator(BROKEN_STATE)).toHaveCount(0);
      if (route.marker) await expect(page.locator(route.marker).first()).toBeVisible();
      executed.add(title);
    } finally {
      await context.close();
    }
  });
}

/** A solid 16x16 RGB PNG, built here so the case owns its input. A 1x1 image crops to nothing. */
function solidPng(size = 16): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((size * 3 + 1) * size, 0x80);
  for (let row = 0; row < size; row++) rows[row * (size * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * The navigation cases cannot see calls made in event handlers. This one drives the profile-picture
 * upload a user makes (ImageCropper's hidden file input, then the crop modal's Confirm), which is the
 * handler P6-4 cut the Strapi /upload fallback out of. A reintroduced fallback fails it.
 */
const PROFILE_PICTURE_INPUT = '[data-walkthrough="profile-picture"] input[type="file"]';
test('desktop owner profile-picture upload uses only canonical media', async ({ browser }) => {
  const { origin, personas } = fixture();
  const context = await guardedContext(browser, RUN, origin, VIEWPORT.desktop);
  try {
    await signIn(context, personas.ownerA);
    const page = await context.newPage();
    const me = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/explorers/v1/me' && r.status() === 200);
    await page.goto('/profile');
    await me;
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    const before = RUN.violations().length;
    const media = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/explorers/v1/media' && r.request().method() === 'POST');
    await page.locator(PROFILE_PICTURE_INPUT).setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: solidPng() });
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect((await media).status()).toBeLessThan(400);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    expect(RUN.violations().slice(before)).toEqual([]);
  } finally {
    await context.close();
  }
});

test.afterAll(() => {
  // A failure restarts the Playwright worker, so after one this can also report partial floors. Fix the first failure first.
  expect(RUN.violations(), 'Strapi or unclassified requests').toEqual([]);
  expect(executed.size, 'route-coverage floor').toBeGreaterThanOrEqual(ROUTE_FLOOR);
  expect(RUN.modules.size, 'closure-size floor (boot)').toBeGreaterThanOrEqual(MODULE_FLOOR);
  expect(RUN.apiPaths.size, 'API-surface floor').toBeGreaterThanOrEqual(API_FLOOR);
});
