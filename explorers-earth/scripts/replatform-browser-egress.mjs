import { chromium } from '@playwright/test';

const sentinel = 'http://192.0.2.1:9/replatform-csp-sentinel';
const origins = ['http://127.0.0.1:51474/', 'http://127.0.0.1:5175/'];
const browser = await chromium.launch({ headless: true });
try {
  for (const origin of origins) {
    const page = await browser.newPage();
    try {
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if (response?.status() !== 200) throw new Error(`fixture browser entrypoint unavailable: ${origin}`);
      const policy = response.headers()['content-security-policy'] ?? '';
      if (!policy.includes("connect-src 'self' http://127.0.0.1:*") || policy.includes('192.0.2.1')) {
        throw new Error(`fixture browser CSP missing: ${origin}`);
      }
      let sent = false;
      page.on('request', request => { if (request.url().startsWith(sentinel)) sent = true; });
      const result = await page.evaluate(async url => {
        try {
          await fetch(url, { signal: AbortSignal.timeout(3000) });
          return 'resolved';
        } catch { return 'rejected'; }
      }, sentinel);
      if (result !== 'rejected' || sent) throw new Error(`synthetic nonlocal fetch escaped CSP: ${origin}`);
    } finally { await page.close(); }
  }
  process.stdout.write('Both fixture browser entrypoints blocked synthetic nonlocal fetch before network dispatch.\n');
} finally { await browser.close(); }
