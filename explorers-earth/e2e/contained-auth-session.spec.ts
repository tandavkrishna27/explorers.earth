import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalCategoryAccount, fixtureState, fixtureUser, installContainedRoutes, openFixture } from './setup/category-navigation';

test('owner session and canonical account agree with included cookies and no legacy credentials', async ({ browser, baseURL }) => {
  const state = fixtureState();
  const fixture = await openFixture(browser, baseURL!, state, { owner: true });
  try {
    await fixture.page.goto('/logo.svg');
    const result = await fixture.page.evaluate(async () => {
      const session = await fetch('/api/auth/get-session', { credentials: 'include' });
      const me = await fetch('/api/explorers/v1/me', { credentials: 'include' });
      const lifecycle = await fetch('/api/explorers/v1/account/lifecycle', { credentials: 'include' });
      return { sessionStatus: session.status, session: await session.json(), meStatus: me.status, me: await me.json(),
        lifecycleStatus: lifecycle.status, lifecycle: await lifecycle.json(),
        legacy: ['auth-storage', 'qrtoken', 'user'].map(key => localStorage.getItem(key)) };
    });
    expect(result.sessionStatus).toBe(200);
    expect(result.session).toEqual({ user: { id: fixtureUser.id, email: fixtureUser.email }, session: { id: 'contained-browser-session-id' } });
    expect(result.meStatus).toBe(200);
    expect(result.me).toEqual({ account: canonicalCategoryAccount(state) });
    expect(result.me.account.categories).toHaveLength(9);
    expect(result.me.account.categories.map((category: { category: string }) => category.category))
      .toEqual(['places', 'movies', 'books', 'games', 'apps', 'products', 'people', 'guides', 'music']);
    expect(result.me.account.categories.find((category: { category: string }) => category.category === 'books'))
      .toEqual({ category: 'books', isPublic: true, displayOrder: 2, pinnedOrder: 1 });
    expect(result.me.account.categories.find((category: { category: string }) => category.category === 'music'))
      .toEqual({ category: 'music', isPublic: false, displayOrder: 8, pinnedOrder: null });
    expect(result.session.user.id).not.toBe(result.me.account.id);
    expect(result.lifecycleStatus).toBe(200);
    expect(result.lifecycle).toEqual({ lifecycle: { accountId: result.me.account.id,
      status: 'active', operationId: null, revision: result.me.account.revision } });
    expect(result.legacy).toEqual([null, null, null]);
    fixture.guard.assertClean();
  } finally { await fixture.context.close(); }
});

test('owner context with omitted credentials receives no canonical authority', async ({ browser, baseURL }) => {
  const fixture = await openFixture(browser, baseURL!, fixtureState(), { owner: true });
  try {
    await fixture.page.goto('/logo.svg');
    const result = await fixture.page.evaluate(async () => {
      const session = await fetch('/api/auth/get-session', { credentials: 'omit' });
      const me = await fetch('/api/explorers/v1/me', { credentials: 'omit' });
      const lifecycle = await fetch('/api/explorers/v1/account/lifecycle', { credentials: 'omit' });
      return { sessionStatus: session.status, session: await session.json(), meStatus: me.status,
        lifecycleStatus: lifecycle.status };
    });
    expect(result).toEqual({ sessionStatus: 200, session: null, meStatus: 401, lifecycleStatus: 401 });
    fixture.guard.assertClean();
  } finally { await fixture.context.close(); }
});

test('guest session is null and canonical account requires a session', async ({ browser, baseURL }) => {
  const fixture = await openFixture(browser, baseURL!, fixtureState());
  try {
    await fixture.page.goto('/logo.svg');
    const result = await fixture.page.evaluate(async () => {
      const session = await fetch('/api/auth/get-session', { credentials: 'include' });
      const me = await fetch('/api/explorers/v1/me', { credentials: 'include' });
      const lifecycle = await fetch('/api/explorers/v1/account/lifecycle', { credentials: 'include' });
      return { sessionStatus: session.status, session: await session.json(), meStatus: me.status,
        lifecycleStatus: lifecycle.status };
    });
    expect(result).toEqual({ sessionStatus: 200, session: null, meStatus: 401, lifecycleStatus: 401 });
    fixture.guard.assertClean();
  } finally { await fixture.context.close(); }
});

test('foreign auth origin, other auth paths, and writes stay denied', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const guard = await installContainedRoutes(context, baseURL!, fixtureState());
  try {
    const page = await context.newPage();
    await page.goto('/logo.svg');
    await page.evaluate(async () => {
      await Promise.allSettled([
        fetch('/api/auth/get-session', { method: 'POST' }),
        fetch('/api/auth/get-session?unexpected=1'),
        fetch('/api/auth/sign-out', { method: 'POST' }),
        fetch('/api/explorers/v1/account/lifecycle?unexpected=1'),
        fetch('https://auth.example.test/api/auth/get-session'),
      ]);
    });
    expect(guard.denied).toEqual(expect.arrayContaining([
      'POST /api/auth/get-session', 'GET /api/auth/get-session', 'POST /api/auth/sign-out', 'GET external auth.example.test',
      'GET /api/explorers/v1/account/lifecycle',
    ]));
  } finally { await context.close(); }
});

test('a foreign cookie and a wrong legacy subject cannot acquire owner authority', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  await context.addCookies([{ name: 'better-auth.session_token', value: 'foreign-session',
    domain: '127.0.0.1', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }]);
  const guard = await installContainedRoutes(context, baseURL!, fixtureState());
  try {
    const page = await context.newPage();
    await page.goto('/logo.svg');
    const query = readFileSync(resolve(process.cwd(), 'src/features/navigation/categoryNavigationApi.ts'), 'utf8')
      .match(/gql`([\s\S]*?query CategoryNavigationAccount[\s\S]*?)`/)?.[1];
    expect(query).toBeTruthy();
    const result = await page.evaluate(async ({ source, subject }) => {
      const session = await fetch('/api/auth/get-session', { credentials: 'include' });
      const me = await fetch('/api/explorers/v1/me', { credentials: 'include' });
      const lifecycle = await fetch('/api/explorers/v1/account/lifecycle', { credentials: 'include' });
      const correctSubject = await fetch('/graphql', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operationName: 'CategoryNavigationAccount', query: source,
          variables: { documentId: subject } }) });
      const graph = await fetch('/graphql', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operationName: 'CategoryNavigationAccount', query: source,
          variables: { documentId: 'another-account' } }) });
      return { session: await session.json(), meStatus: me.status, lifecycleStatus: lifecycle.status,
        correctSubject: await correctSubject.json(), graph: await graph.json() };
    }, { source: query!, subject: fixtureUser.documentId });
    expect(result.session).toBeNull();
    expect(result.meStatus).toBe(401);
    expect(result.lifecycleStatus).toBe(401);
    expect(result.correctSubject).toEqual({ errors: [{ message: 'Fixture operation denied' }] });
    expect(result.graph).toEqual({ errors: [{ message: 'Fixture operation denied' }] });
    expect(guard.denied).toContain('graphql CategoryNavigationAccount: Error: wrong owner subject');
  } finally { await context.close(); }
});

test('a valid session still cannot read another legacy GraphQL subject', async ({ browser, baseURL }) => {
  const fixture = await openFixture(browser, baseURL!, fixtureState(), { owner: true });
  try {
    await fixture.page.goto('/logo.svg');
    const query = readFileSync(resolve(process.cwd(), 'src/features/navigation/categoryNavigationApi.ts'), 'utf8')
      .match(/gql`([\s\S]*?query CategoryNavigationAccount[\s\S]*?)`/)?.[1];
    expect(query).toBeTruthy();
    const graph = await fixture.page.evaluate(async (source) => {
      const response = await fetch('/graphql', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operationName: 'CategoryNavigationAccount', query: source,
          variables: { documentId: 'another-account' } }) });
      return response.json();
    }, query!);
    expect(graph).toEqual({ errors: [{ message: 'Fixture operation denied' }] });
    expect(fixture.guard.denied).toContain('graphql CategoryNavigationAccount: Error: wrong owner subject');
  } finally { await fixture.context.close(); }
});
