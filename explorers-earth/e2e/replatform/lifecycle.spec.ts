import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { LIFECYCLE_CASES, classifyLifecycleRequest } from '../../../tunes/scripts/lifecycle-browser-guards';
type Owner = {
    userId: string;
    accountId: string;
    handle: string;
    cookie: string;
};
const fixture = JSON.parse(readFileSync(process.env.LIFECYCLE_E2E_FIXTURE_PATH!, 'utf8')) as {
    origin: string;
    lifecycleControl: {
        url: string;
        capability: string;
    };
};
if (fixture.origin !== process.env.PLAYWRIGHT_EXTERNAL_BASE_URL || new URL(fixture.lifecycleControl.url).hostname !== '127.0.0.1')
    throw new Error('Lifecycle authority mismatch');
const base = '/api/explorers/v1';
let caseId: string, owners: Owner[], violations: string[], callbackCode: string;
async function control(action: string, owner = 0, extra: Record<string, unknown> = {}) {
    const r = await fetch(fixture.lifecycleControl.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lifecycle-Capability': fixture.lifecycleControl.capability }, body: JSON.stringify({ caseId, action, owner, ...extra }) });
    expect(r.status).toBe(200);
    return r.json();
}
async function session(context: BrowserContext, owner: Owner) { const i = owner.cookie.indexOf('='); await context.addCookies([{ name: owner.cookie.slice(0, i), value: owner.cookie.slice(i + 1), url: fixture.origin, httpOnly: true, sameSite: 'Lax' }]); }
async function command(page: Page, path: string, data: unknown, owner = 0, origin: string | null = fixture.origin, key = randomUUID()) {
    return page.request.post(`${base}${path}`, { headers: { Cookie: owners[owner].cookie, ...(origin === null ? {} : { Origin: origin }), 'Idempotency-Key': key }, data });
}
async function guard(context: BrowserContext) {
    await context.route('**/*', async (route) => {
        const r = route.request(), u = new URL(r.url());
        const classification = classifyLifecycleRequest({ url: r.url(), origin: fixture.origin, resource: r.resourceType(), navigation: r.isNavigationRequest() });
        if (classification === 'local') {
            if (u.pathname === '/graphql') {
                const headers = await r.allHeaders();
                if (/\bmutation\b/.test(r.postData() ?? '') || headers['authorization'] || headers['cookie']) {
                    violations.push('legacy credential or mutation');
                    return route.abort();
                }
            }
            return route.continue();
        }
        if (classification === 'google')
            return route.fulfill({ status: 302, headers: { location: fixture.origin + '/api/auth/callback/google?code=' + encodeURIComponent(callbackCode) + '&state=' + encodeURIComponent(u.searchParams.get('state')!) }, body: '' });
        if (classification === 'font')
            return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
        if (classification === 'image')
            return route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
        violations.push(`${r.method()} ${u.origin}${u.pathname}`);
        return route.abort();
    });
    await context.routeWebSocket(/.*/, socket => { const u = new URL(socket.url()); if (u.origin !== fixture.origin.replace('http:', 'ws:') || u.pathname !== '/' || !u.searchParams.has('token'))
        violations.push(`socket ${u.origin}${u.pathname}`); socket.close(); });
}
async function settings(page: Page, owner = 0) { await session(page.context(), owners[owner]); await page.goto('/settings'); await expect(page.getByRole('button', { name: 'Delete your account? Permanently delete your account and all data', exact: true })).toBeVisible(); }
async function deletionReason(page: Page) { await page.getByRole('button', { name: 'Delete your account? Permanently delete your account and all data', exact: true }).click(); await page.getByRole('button', { name: 'Continue with deletion', exact: true }).click(); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await expect(page.getByPlaceholder('Please let us know the reason for leaving...')).toBeVisible(); }
async function deletion(page: Page) { await deletionReason(page); await page.getByPlaceholder('Please let us know the reason for leaving...').fill(' Leaving through real UI '); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.getByPlaceholder("Type 'CONFIRM DELETE' to confirm").fill('CONFIRM DELETE'); const response = page.waitForResponse(r => new URL(r.url()).pathname === `${base}/account/deletion` && r.request().method() === 'POST'); await page.getByRole('button', { name: 'Delete My Account', exact: true }).click(); expect((await response).status()).toBe(200); await expect(page).toHaveURL(/\/login(?:\?.*)?$/); }
async function deactivate(page: Page) { const state = await control('observe'); expect((await command(page, '/account/deactivation', { expectedRevision: state.account.revision })).status()).toBe(200); }
async function recover(page: Page, wrongSubject = false) { await control('provider', 0, { wrongSubject }); await page.context().clearCookies(); await page.goto('/reactivate'); await page.getByRole('button', { name: 'Continue with Google', exact: true }).click(); await page.waitForURL(u => u.pathname === '/reactivate-confirm'); }
test.beforeEach(async ({ context }, info) => { caseId = info.title; violations = []; const prepared = await control('prepare'); owners = prepared.owners; callbackCode = prepared.callbackCode; await guard(context); });
test.afterEach(async () => { expect(violations).toEqual([]); });
test(LIFECYCLE_CASES[0], async ({ page }) => {
    await settings(page);
    expect((await page.request.get(`${base}/account/lifecycle`)).status()).toBe(200);
    await deletionReason(page);
    for (const reason of ['   ', 'x'.repeat(2001)]) {
        await page.getByPlaceholder('Please let us know the reason for leaving...').fill(reason);
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        expect((await control('observe')).feedback).toEqual([]);
        await expect(page.getByPlaceholder('Please let us know the reason for leaving...')).toBeVisible();
    }
    let attempts = 0;
    const keys: string[] = [];
    let releaseDuplicate!: () => void;
    const duplicateArrived = new Promise<void>(done => releaseDuplicate = done);
    await page.route(`**${base}/account/deletion-feedback`, async (route) => { keys.push(route.request().headers()['idempotency-key']); const response = await route.fetch(); expect(response.status()).toBe(201); const attempt = ++attempts; if (attempt === 1)
        return route.abort(); if (attempt === 2)
        await duplicateArrived;
    else
        releaseDuplicate(); return route.fulfill({ response }); });
    await page.getByPlaceholder('Please let us know the reason for leaving...').fill('  Leaving  ');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('Account service is unavailable.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).dblclick();
    await expect(page.getByPlaceholder("Type 'CONFIRM DELETE' to confirm")).toBeVisible();
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect((await control('observe')).feedback).toMatchObject([{ reason: 'Leaving' }]);
    expect((await control('observe')).account.status).toBe('active');
});
test(LIFECYCLE_CASES[1], async ({ page }) => {
    await settings(page);
    const feedback = await command(page, '/account/deletion-feedback', { reason: 'Foreign feedback' }, 1);
    expect(feedback.status()).toBe(201);
    const id = (await feedback.json()).feedback.id, state = await control('observe');
    expect((await command(page, '/account/deletion', { expectedRevision: state.account.revision, feedbackId: id })).status()).toBe(404);
    expect((await control('observe')).operations).toEqual([]);
    await deletionReason(page);
    await page.getByPlaceholder('Please let us know the reason for leaving...').fill('Stale revision');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await control('bump');
    await page.getByPlaceholder("Type 'CONFIRM DELETE' to confirm").fill('CONFIRM DELETE');
    const rejected = page.waitForResponse(r => new URL(r.url()).pathname === `${base}/account/deletion`);
    await page.getByRole('button', { name: 'Delete My Account', exact: true }).click();
    expect((await rejected).status()).toBe(409);
    await expect(page).toHaveURL(/\/settings$/);
    expect((await control('observe')).account.status).toBe('active');
    expect((await page.request.get(`${base}/me`)).status()).toBe(200);
});
test(LIFECYCLE_CASES[2], async ({ page, context }) => {
    await settings(page);
    const before = await control('observe');
    const second = await context.newPage();
    await second.goto('/settings');
    await expect(second.getByRole('button', { name: 'Deactivate your account? Temporarily disable your account', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Deactivate your account? Temporarily disable your account', exact: true }).click();
    await page.getByRole('button', { name: 'Deactivate My Account', exact: true }).click();
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
    await expect(second).toHaveURL(/\/login(?:\?.*)?$/);
    const state = await control('observe');
    expect(state).toMatchObject({ account: { status: 'suspended' }, security: { blocked: true, session_version: before.security.session_version + 1 }, sessions: 0 });
    expect((await page.request.get(`${base}/me`, { headers: { Cookie: owners[0].cookie } })).status()).toBe(401);
    await second.close();
});
test(LIFECYCLE_CASES[3], async ({ page }) => {
    await settings(page);
    await deletion(page);
    expect((await control('observe')).account.status).toBe('pending_deletion');
    await recover(page);
    await expect(page.getByRole('button', { name: 'Reactivate account', exact: true })).toBeVisible();
    expect((await page.request.get(`${base}/me`)).status()).toBe(401);
    await page.getByRole('button', { name: 'Reactivate account', exact: true }).click();
    await expect(page.getByText('Account reactivated', { exact: true })).toBeVisible();
    const state = await control('observe');
    expect(state).toMatchObject({ account: { id: owners[0].accountId, status: 'active' }, bindings: 1, sessions: 0, proofs: 0, operations: [{ kind: 'delete', state: 'cancelled' }, { kind: 'cancel_deletion', state: 'succeeded' }] });
    expect((await page.request.get(`${base}/me`)).status()).toBe(401);
    await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
    await expect.poll(async () => (await page.request.get(`${base}/me`)).status()).toBe(200);
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Delete your account? Permanently delete your account and all data', exact: true })).toBeVisible();
    expect((await (await page.request.get(`${base}/me`)).json()).account.id).toBe(owners[0].accountId);
});
test(LIFECYCLE_CASES[4], async ({ page }) => { await session(page.context(), owners[0]); await deactivate(page); await recover(page); await expect(page.getByRole('button', { name: 'Reactivate account', exact: true })).toBeVisible(); expect((await page.request.get(`${base}/me`)).status()).toBe(401); expect((await page.request.get(`${base}/account/lifecycle`)).status()).toBe(401); await control('expire'); await page.reload(); await expect(page.getByRole('alert')).toContainText('expired or unavailable'); expect((await control('observe')).account.status).toBe('suspended'); });
test(LIFECYCLE_CASES[5], async ({ page }) => { await session(page.context(), owners[0]); await deactivate(page); await recover(page); await expect(page.getByRole('button', { name: 'Reactivate account', exact: true })).toBeVisible(); const state = await control('observe'); const headers = { Origin: fixture.origin }; const responses = await Promise.all([page.request.post(`${base}/recovery/complete`, { headers, data: { expectedRevision: state.account.revision } }), page.request.post(`${base}/recovery/complete`, { headers, data: { expectedRevision: state.account.revision } })]); expect(responses.map(r => r.status()).sort()).toEqual([200, 403]); expect((await page.request.post(`${base}/recovery/complete`, { headers, data: { expectedRevision: state.account.revision } })).status()).toBe(403); expect((await control('observe')).account.revision).toBe(state.account.revision + 1); expect((await page.request.get(`${base}/me`)).status()).toBe(401); });
test(LIFECYCLE_CASES[6], async ({ page }) => { await session(page.context(), owners[0]); await deactivate(page); await recover(page, true); await expect(page.getByRole('alert')).toContainText('expired or unavailable'); expect((await control('observe'))).toMatchObject({ account: { status: 'suspended' }, sessions: 0, proofs: 0, bindings: 1 }); });
test(LIFECYCLE_CASES[7], async ({ page }) => { await settings(page); expect((await command(page, '/collections', { category: 'books', title: 'Owned terminal content', slug: 'terminal', visibility: 'private', publicationState: 'draft' })).status()).toBe(201); await deletion(page); await control('terminal'); expect((await control('observe'))).toMatchObject({ account: { id: owners[0].accountId, status: 'deleted' }, collections: 0, bindings: 1, sessions: 0 }); await recover(page); await expect(page.getByRole('alert')).toContainText('expired or unavailable'); expect((await control('observe'))).toMatchObject({ account: { status: 'deleted' }, bindings: 1, proofs: 0, sessions: 0 }); expect((await command(page, '/collections', { category: 'books', title: 'Denied recreation', slug: 'denied', visibility: 'private', publicationState: 'draft' })).status()).toBe(401); expect((await control('observe')).collections).toBe(0); });
test(LIFECYCLE_CASES[8], async ({ page }) => { await session(page.context(), owners[0]); const before = await control('observe'); for (const origin of [null, 'https://attacker.invalid'])
    for (const path of ['/account/deletion-feedback', '/account/deactivation', '/account/deletion'])
        expect((await command(page, path, { reason: 'denied', expectedRevision: before.account.revision, feedbackId: randomUUID() }, 0, origin)).status()).toBe(403); expect(await control('observe')).toEqual(before); await deactivate(page); await recover(page); await expect(page.getByRole('button', { name: 'Reactivate account', exact: true })).toBeVisible(); const state = await control('observe'); for (const headers of [{}, { Origin: 'https://attacker.invalid' }] as Record<string, string>[])
    expect((await page.request.post(`${base}/recovery/complete`, { headers, data: { expectedRevision: state.account.revision } })).status()).toBe(403); expect((await control('observe')).account.status).toBe('suspended'); });
test(LIFECYCLE_CASES[9], async ({ page }) => {
    await settings(page);
    await deletionReason(page);
    let release!: () => void, arrived!: () => void;
    const held = new Promise<void>(r => release = r), ready = new Promise<void>(r => arrived = r);
    await page.route(`**${base}/account/deletion-feedback`, async (route) => { const response = await route.fetch(); expect(response.status()).toBe(201); arrived(); await held; await route.fulfill({ response }); });
    await page.getByPlaceholder('Please let us know the reason for leaving...').fill('Old generation feedback');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await ready;
    await session(page.context(), owners[1]);
    await page.evaluate(async () => { const authModule = '/src/lib/authClient.ts'; const { authClient } = await import(authModule); await authClient.refresh(); });
    release();
    await expect(page.getByPlaceholder("Type 'CONFIRM DELETE' to confirm")).toHaveCount(0);
    await expect(page).toHaveURL(/\/settings$/);
    expect((await (await page.request.get(`${base}/me`)).json()).account.id).toBe(owners[1].accountId);
    expect((await control('observe', 1)).feedback).toEqual([]);
    expect((await control('observe', 0)).feedback).toHaveLength(1);
});
