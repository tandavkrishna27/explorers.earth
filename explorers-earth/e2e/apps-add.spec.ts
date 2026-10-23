import { expect, test } from '@playwright/test';
import { bookFixtureId } from './setup/books-owner-content';
import { closeFixture, fixtureState, openFixture } from './setup/category-navigation';
import { canonicalAccountFixture } from '../src/test/canonicalAccountFixture';
import { appEntityDtoSchema } from '../../tunes/shared/explorersAppContract';
import { recommendationCoreDtoSchema } from '../../tunes/shared/explorersContract';

// WP8 Task 8-8. Runs on the contained owner fixture (native owner reads) and stubs only the
// App Store catalog search, the icon import, the link preview and the two save commands.
// The contained fixture serves empty lists only, so "reopen" is asserted on what was written
// (the entity carries both links); the edit form reading them back is a unit test
// (AddAppPage.template.test.tsx).

const APP_STORE = 'https://apps.apple.com/app/notion/id1232780281';
const PLAY = 'https://play.google.com/store/apps/details?id=notion.id';
const hit = { title: 'Notion', developer: 'Notion Labs', appUrl: APP_STORE, iconUrl: 'https://is1.example/notion.png', priceTier: 'Free', platforms: ['iOS'], genres: ['Productivity'], screenshotUrls: [] };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const ICON_ID = '7b0e8a52-4c1d-4f7e-9a51-0d6c2f1e3a20';

test('Apps: search the App Store, pick, add an Android link, save both links', async ({ browser, baseURL }) => {
  const state = fixtureState();
  const template = state.lists.appLists[0];
  state.lists.appLists = [{ ...template, documentId: 'apps-0', List_Name: 'Daily tools', Title: 'Daily tools', slug: 'daily-tools', Visibility: false, visibility: false }];
  const handle = await openFixture(browser, baseURL!, state, { owner: true });
  const writes: { path: string; body: any }[] = [];
  const collectionId = bookFixtureId('collection', 'apps-0');
  const entityId = '7b0e8a52-4c1d-4f7e-9a51-0d6c2f1e3a21';
  await handle.page.route('**/catalog/apps**', async (route) => {
    writes.push({ path: 'catalog/apps', body: new URL(route.request().url()).searchParams.get('query') });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ apps: [hit] }) });
  });
  await handle.page.route('**/catalog/link-preview', async (route) => {
    const body = route.request().postDataJSON(); writes.push({ path: 'link-preview', body });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preview: { url: body.url, title: 'Notion - Apps on Google Play', description: null, imageUrl: null, siteName: 'Google Play', product: null, person: null } }) });
  });
  await handle.page.route('**/catalog/link-preview/image', async (route) => {
    writes.push({ path: 'link-preview/image', body: route.request().postDataJSON() });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ media: { id: ICON_ID } }) });
  });
  // The result list shows the store's own thumbnail before anything is imported.
  await handle.page.route('https://is1.example/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await handle.page.route(`**/api/explorers/v1/media/${ICON_ID}/content`, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await handle.page.route('**/api/explorers/v1/**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/explorers/v1/entities/resolve') {
      const body = request.postDataJSON(); writes.push({ path, body });
      const { title, ...details } = body.details;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entity: appEntityDtoSchema.parse({ id: entityId, kind: 'app', title, origin: 'manual', details }) }) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/recommendations') {
      const body = request.postDataJSON(); writes.push({ path, body });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ recommendation: recommendationCoreDtoSchema.parse({
        id: '7b0e8a52-4c1d-4f7e-9a51-0d6c2f1e3a22', accountId: canonicalAccountFixture().id, entityId, category: 'apps',
        userRating: null, publicationState: 'draft', revision: 1, mediaIds: [ICON_ID] }) }) });
    }
    return route.fallback();
  });
  try {
    const { page } = handle;
    await page.goto(`/recommendations/apps/${collectionId}/add`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Add App' })).toBeVisible();
    await expect(page.getByLabel('Download URL')).toHaveCount(0);

    const search = page.getByPlaceholder('Search the App Store');
    await search.fill('notion');
    await search.press('Enter');
    await page.getByRole('option', { name: /Notion/ }).click();
    await expect(page.getByLabel('App title')).toHaveValue('Notion');
    await expect(page.getByLabel('Developer')).toHaveValue('Notion Labs');
    await expect(page.getByLabel('App URL')).toHaveValue(APP_STORE);
    await expect(page.locator(`img[src="/api/explorers/v1/media/${ICON_ID}/content"]`)).toBeVisible();

    await page.getByRole('button', { name: '+ Add another platform link' }).click();
    const other = page.getByLabel('Other link 1', { exact: true });
    await other.fill(PLAY);
    await other.blur();
    await page.getByRole('button', { name: 'Android' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect.poll(() => writes.some((w) => w.path === '/api/explorers/v1/recommendations')).toBe(true);
    expect(writes.find((w) => w.path === 'catalog/apps')?.body).toBe('notion');
    expect(writes.find((w) => w.path === 'link-preview/image')?.body).toEqual({ imageUrl: hit.iconUrl });
    expect(writes.find((w) => w.path === '/api/explorers/v1/entities/resolve')?.body.details).toMatchObject({
      title: 'Notion', appUrl: APP_STORE, developer: 'Notion Labs', downloadUrl: null, logoUrl: null, priceTier: 'Free', platforms: ['iOS', 'Android'],
      otherLinks: [{ label: 'Google Play', url: PLAY }] });
    expect(writes.find((w) => w.path === '/api/explorers/v1/recommendations')?.body.mediaIds).toEqual([ICON_ID]);
  } finally { await closeFixture(handle); }
});
