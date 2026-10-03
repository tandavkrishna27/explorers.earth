import type { Page } from '@playwright/test';

// Includes the replatform gateway (51474) and Vite (5175), plus existing
// loopback fixture ports selected by the bounded Playwright suites.
export function isAllowedLocalFixtureUrl(url: URL): boolean {
  return (url.protocol === 'http:' || url.protocol === 'https:')
    && !url.username && !url.password
    && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]');
}

export async function denyHostedEgress(page: Page) {
  await page.route(url => (url.protocol === 'http:' || url.protocol === 'https:') && !isAllowedLocalFixtureUrl(url), async route => {
    const type = route.request().resourceType();
    if (type === 'image') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" />' });
    if (type === 'stylesheet' || type === 'font' || type === 'script') {
      return route.fulfill({ status: 200, contentType: type === 'stylesheet' ? 'text/css' : 'application/javascript', body: '' });
    }
    return route.fulfill({ status: 418, contentType: 'application/json', body: '{"error":"HOSTED_EGRESS_DENIED"}' });
  });
}
