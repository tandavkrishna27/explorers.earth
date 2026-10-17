import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, requestInterceptor, VirtualConsole } from 'jsdom';
import { describe, expect, it } from 'vitest';

// Execute the real document's inline scripts, not a sanitized fixture. The module
// entry is inert in JSDOM; utility startup is exercised by analytics.consent.test.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const vendorUrl = /googletagmanager\.com\/gtag\/js|clarity\.ms\/tag\//;

describe('actual index.html analytics bootstrap (offline)', () => {
  it.each([null, '{bad', 'null', '{"analytics":false}', '{"analytics":"false"}'])(
    'does not attempt vendor loads or GA config before opt-in: %s', async (stored) => {
      const requests: string[] = [];
      const errors: unknown[] = [];
      const virtualConsole = new VirtualConsole();
      virtualConsole.on('jsdomError', (error) => errors.push(error));
      const dom = new JSDOM(html, {
        url: 'https://explorers.earth/tk2727/music',
        runScripts: 'dangerously',
        resources: {
          interceptors: [requestInterceptor((request, { element }) => {
            requests.push(request.url);
            // Every URL gets an inert response; the production inline scripts
            // still run and all attempted vendor loads remain observable.
            return new Response('', { headers: { 'Content-Type': element?.localName === 'link' ? 'text/css' : 'application/javascript' } });
          })],
        },
        virtualConsole,
        beforeParse(window) {
          if (stored !== null) window.localStorage.setItem('explorers-cookie-consent', stored);
        },
      });
      try {
        await new Promise<void>((resolve) => dom.window.addEventListener('load', () => resolve(), { once: true }));
        const scripts = Array.from(dom.window.document.scripts, (script) => script.src).filter((src) => vendorUrl.test(src));
        const configs = (dom.window.dataLayer ?? []).map((entry: ArrayLike<unknown>) => Array.from(entry)).filter((entry: unknown[]) => entry[0] === 'config');
        expect(errors).toEqual([]);
        expect({ attemptedLoads: requests.filter((url) => vendorUrl.test(url)), insertedScripts: scripts, configs }).toEqual({ attemptedLoads: [], insertedScripts: [], configs: [] });
      } finally {
        dom.window.close();
      }
    },
  );
});
