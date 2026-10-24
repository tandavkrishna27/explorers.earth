import { expect, test } from '@playwright/test';
import { bookFixtureId } from './setup/books-owner-content';
import { closeFixture, fixtureState, openFixture } from './setup/category-navigation';
import { canonicalAccountFixture } from '../src/test/canonicalAccountFixture';
import { personEntityDtoSchema } from '../../tunes/shared/explorersPersonContract';
import { recommendationCoreDtoSchema } from '../../tunes/shared/explorersContract';
import { taxonomyCatalogPageSchema } from '../../tunes/shared/explorersTaxonomyContract';

// WP8 Task 8-14 (DS-02, DS-08, DS-09, ADD-12). Replaces the Strapi-era People flow, which drove
// GraphQL list mutations and the retired /api/people/scrape-profile step. Runs on the contained
// owner fixture (native owner reads) and stubs only the sector catalog, the link preview, the
// photo import and the two save commands. The contained fixture serves empty lists only, so the
// detail view's "no rating" is asserted by its unit test (PersonDetailModal.noRating.test.tsx);
// here the write itself carries no rating and no follower count.

const PROFILE = 'https://www.instagram.com/ada.example/';
const SECTOR = '7b0e8a52-4c1d-4f7e-9a51-0d6c2f1e3a30';
const PHOTO_ID = '7b0e8a52-4c1d-4f7e-9a51-0d6c2f1e3a31';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const preview = { url: PROFILE, title: 'Ada (@ada.example)', description: null, imageUrl: 'https://cdn.example/ada.jpg', siteName: 'Instagram', product: null,
  person: { name: 'Ada Example', headline: 'Type designer', sameAs: [] } };

test('People: paste a profile link, prefill, sector required, save without rating or follower count', async ({ browser, baseURL }) => {
  const state = fixtureState();
  const template = state.lists.personLists[0];
  state.lists.personLists = [{ ...template, documentId: 'people-0', List_Name: 'Makers', Title: 'Makers', slug: 'makers', Visibility: false, visibility: false }];
  const handle = await openFixture(browser, baseURL!, state, { owner: true });
  const writes: { path: string; body: any }[] = [];
  const collectionId = bookFixtureId('collection', 'people-0');
  const entityId = '7b0e8a52-4c1d-4f7e-9a51-0d6c2f1e3a32';
  await handle.page.route('**/catalog/link-preview', async (route) => {
    writes.push({ path: 'link-preview', body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preview }) });
  });
  await handle.page.route('**/catalog/link-preview/image', async (route) => {
    writes.push({ path: 'link-preview/image', body: route.request().postDataJSON() });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ media: { id: PHOTO_ID } }) });
  });
  await handle.page.route(`**/api/explorers/v1/media/${PHOTO_ID}/content`, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await handle.page.route('**/api/explorers/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (request.method() === 'GET' && path === '/api/explorers/v1/catalog/taxonomy' && url.searchParams.get('category') === 'people') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(taxonomyCatalogPageSchema.parse({
        version: 'explorers-taxonomy-catalog/v1', category: 'people', state: 'CONFIGURED', catalogVersion: 1, requestedLocale: null, defaultLocale: 'en',
        items: [{ id: SECTOR, category: 'people', slug: 'design', parentId: null, position: 0, label: 'Design', resolvedLocale: 'en' }], nextCursor: null })) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/entities/resolve') {
      const body = request.postDataJSON(); writes.push({ path, body });
      const { title, ...details } = body.details;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entity: personEntityDtoSchema.parse({
        id: entityId, kind: 'person', title, origin: 'manual', suppressed: false, details }) }) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/recommendations') {
      const body = request.postDataJSON(); writes.push({ path, body });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ recommendation: recommendationCoreDtoSchema.parse({
        id: '7b0e8a52-4c1d-4f7e-9a51-0d6c2f1e3a33', accountId: canonicalAccountFixture().id, entityId, category: 'people',
        userRating: null, publicationState: 'draft', revision: 1, mediaIds: [PHOTO_ID] }) }) });
    }
    return route.fallback();
  });
  try {
    const { page } = handle;
    await page.goto(`/recommendations/people/${collectionId}/add`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Add Person' })).toBeVisible();
    await expect(page.getByLabel('Followers')).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Your rating' })).toHaveCount(0);

    const link = page.getByLabel('Profile link');
    await link.fill(PROFILE);
    await link.blur();
    await expect(page.getByLabel('Full Name')).toHaveValue('Ada Example');
    await expect(page.getByLabel('Headline / Role')).toHaveValue('Type designer');
    await expect(page.locator('[data-detected-platform]')).toHaveText('Instagram');
    await expect(page.locator(`img[src="/api/explorers/v1/media/${PHOTO_ID}/content"]`)).toBeVisible();

    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await page.getByLabel('Sector', { exact: true }).selectOption(SECTOR);
    await expect(save).toBeEnabled();
    await save.click();

    await expect.poll(() => writes.some((w) => w.path === '/api/explorers/v1/recommendations')).toBe(true);
    expect(writes.find((w) => w.path === 'link-preview')?.body).toEqual({ url: PROFILE });
    expect(writes.find((w) => w.path === 'link-preview/image')?.body).toEqual({ imageUrl: preview.imageUrl });
    expect(writes.find((w) => w.path === '/api/explorers/v1/entities/resolve')?.body.details).toMatchObject({
      title: 'Ada Example', headline: 'Type designer', primaryPlatform: 'instagram', externalFollowerCountText: null,
      socialUrls: { primary: PROFILE, instagram: PROFILE } });
    expect(writes.find((w) => w.path === '/api/explorers/v1/recommendations')?.body).toMatchObject({ userRating: null, peopleSectorTermId: SECTOR, mediaIds: [PHOTO_ID] });
  } finally { await closeFixture(handle); }
});
