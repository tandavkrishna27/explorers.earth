// Browser check of the deployed SPA (P2 Task 10 Step 4, the parts that need no
// real Google account). Uses explorers-earth's Playwright Chromium.
//
//   node deploy/rehearsal/spa-smoke.mjs <origin> [<connect-host:port>]
//
// <connect-host:port> maps the origin's hostname to another address inside the
// browser only (--host-resolver-rules), so the page still runs at the real origin,
// which runtime-config.json must equal byte for byte. With a mapping the browser
// ignores certificate errors (the rehearsal CA is not in the OS store).
//
// Passes when: the SPA boots past runtime-config.json (no "configuration is
// unavailable"), /login renders, and its Google button produces a navigation to
// accounts.google.com whose redirect_uri is <origin>/api/auth/callback/google.
// That navigation is aborted here, so Google is never contacted.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [origin, connect] = process.argv.slice(2);
if (!origin) throw new Error('usage: spa-smoke.mjs <origin> [<connect-host:port>]');
const host = new URL(origin).hostname;
const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../explorers-earth/package.json'));
const { chromium } = require('playwright');

const browser = await chromium.launch({ args: connect ? [`--host-resolver-rules=MAP ${host} ${connect}`] : [] });
const failures = [];
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: Boolean(connect) });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  let googleUrl;
  await page.route(/^https:\/\/accounts\.google\.com\//, (route) => { googleUrl = route.request().url(); return route.abort(); });

  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  const rootText = (await page.locator('#root').innerText()).trim();
  if (/configuration is unavailable/i.test(rootText)) failures.push('SPA refused runtime-config.json');
  else if (!rootText) failures.push('#root is empty on /');
  else console.log(`ok   / rendered (${rootText.split('\n')[0].slice(0, 60)}...)`);

  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  const google = page.getByRole('button', { name: /google/i }).first();
  if (!(await google.count())) failures.push('/login has no Google button');
  else {
    await google.click();
    for (let i = 0; i < 50 && !googleUrl; i++) await page.waitForTimeout(100);
    if (!googleUrl) failures.push('the Google button did not navigate to accounts.google.com');
    else {
      const callback = new URL(googleUrl).searchParams.get('redirect_uri');
      if (callback !== `${origin}/api/auth/callback/google`) failures.push(`redirect_uri is ${callback}`);
      else console.log(`ok   Google sign-in reaches accounts.google.com with redirect_uri ${callback} (aborted there)`);
    }
  }
  const csp = consoleErrors.filter((text) => /Content Security Policy/i.test(text));
  if (csp.length) failures.push(`CSP violations: ${csp.slice(0, 3).join(' | ')}`);
  const other = consoleErrors.filter((text) => !/Content Security Policy/i.test(text));
  if (other.length) console.log(`note ${other.length} other console error(s): ${other.slice(0, 3).join(' | ').slice(0, 300)}`);
} finally {
  await browser.close();
}
if (failures.length) {
  for (const failure of failures) console.log(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log('SPA smoke passed');
}
