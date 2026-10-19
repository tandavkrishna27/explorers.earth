import type { Browser, BrowserContext } from '@playwright/test';
import { isOptionalFontRequest, isOptionalLoaderImage } from './proxy-fixture-authority.mjs';

export const POISON_ORIGIN = 'https://strapi.poison.invalid';
const POISONED_HOSTS = new Set(['strapi.poison.invalid', 'api.localqr.earth', '77.42.95.255', '13.126.235.177']);
/** Strapi's REST, upload and GraphQL surfaces. Canonical mounts none of them (P6-1 Step 9). */
const POISONED_SAME_ORIGIN = [/^\/graphql\/?$/, /^\/api\/strapi(?:\/|$)/, /^\/api\/upload(?:\/|$)/,
  /^\/upload(?:\/|$)/, /^\/uploads\//, /^\/api\/users(?:\/|$)/, /^\/api\/accounts(?:\/|$)/,
  /^\/api\/auth\/local(?:\/|$)/, /^\/api\/connect(?:\/|$)/];
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/** Named third-party destinations the app legitimately touches. Every entry says why. */
const STUBS: { name: string; test: (url: URL, resource: string) => boolean }[] = [
  { name: 'google-fonts', test: (url, resource) => isOptionalFontRequest(url.href, resource) },
  { name: 'loader-gif', test: (url, resource) => isOptionalLoaderImage(url.href, resource) },
  // Landing hero country flags (features/LandingPage/components/Hero.tsx).
  { name: 'flagcdn', test: (url, resource) => url.hostname === 'flagcdn.com' && resource === 'image' },
  // Decorative CSS background textures on the recommendations hub (pages/RecommendationsHub.tsx).
  { name: 'transparenttextures', test: (url, resource) => url.hostname === 'www.transparenttextures.com'
    && url.pathname.startsWith('/patterns/') && resource === 'image' },
];

export type Verdict = 'poisoned' | 'local' | 'stub' | 'unknown';
export type Observation = { verdict: Verdict; method: string; url: string; resource: string };

export function classify(raw: string, origin: string, resource = ''): Verdict {
  const url = new URL(raw);
  if (POISONED_HOSTS.has(url.hostname) || url.port === '1337' || /strapi|localqr/i.test(url.hostname)) return 'poisoned';
  if (url.origin === new URL(origin).origin)
    return POISONED_SAME_ORIGIN.some((path) => path.test(url.pathname)) ? 'poisoned' : 'local';
  if (STUBS.some((stub) => stub.test(url, resource))) return 'stub';
  return 'unknown';
}

/** Vite 8's client opens ws://<origin>/?token=… on every page, even with hmr:false. */
function isViteClientSocket(raw: string, origin: string): boolean {
  const url = new URL(raw);
  return url.host === new URL(origin).host && url.pathname === '/' && url.searchParams.has('token');
}

export class Monitor {
  readonly observations: Observation[] = [];
  readonly modules = new Set<string>();
  /** Canonical API paths, with ids normalised, for the API-surface floor. */
  readonly apiPaths = new Set<string>();
  /** Canonical API calls refused by a rate limit: the page under test never got its data. */
  readonly throttled: string[] = [];
  /** Only the nonce this monitor's own self-test issued is exempt. */
  private readonly nonces = new Set<string>();
  issueNonce(nonce: string) { this.nonces.add(nonce); }
  violations(): Observation[] {
    return this.observations.filter((o) => (o.verdict === 'poisoned' || o.verdict === 'unknown')
      && ![...this.nonces].some((nonce) => o.url.includes(`nostrapi-selftest=${nonce}`)));
  }
  selfTest(nonce: string): Observation[] {
    return this.observations.filter((o) => o.url.includes(`nostrapi-selftest=${nonce}`));
  }
}

/** The one factory every context in the spec comes from, so the self-test exercises the real monitor. */
export async function guardedContext(browser: Browser, monitor: Monitor, origin: string,
    viewport: { width: number; height: number }): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: origin, viewport, serviceWorkers: 'block' });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const verdict = classify(request.url(), origin, request.resourceType());
    monitor.observations.push({ verdict, method: request.method(), url: request.url(), resource: request.resourceType() });
    if (verdict === 'local') {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/src/')) monitor.modules.add(path);
      if (!path.startsWith('/api/explorers/')) return route.continue();
      // Count a canonical API path only once it has succeeded, not when it was merely attempted.
      const response = await route.fetch();
      if (response.status() < 400) monitor.apiPaths.add(path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id'));
      if (response.status() === 429) monitor.throttled.push(request.url());
      return route.fulfill({ response });
    }
    if (verdict === 'stub')
      return request.resourceType() === 'image'
        ? route.fulfill({ status: 200, contentType: 'image/gif', body: GIF })
        : route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, (socket) => {
    const url = socket.url();
    const verdict: Verdict = isViteClientSocket(url, origin) ? 'stub'
      : classify(url.replace(/^ws/, 'http'), origin) === 'poisoned' ? 'poisoned' : 'unknown';
    monitor.observations.push({ verdict, method: 'WEBSOCKET', url, resource: 'websocket' });
    socket.close();
  });
  return context;
}
