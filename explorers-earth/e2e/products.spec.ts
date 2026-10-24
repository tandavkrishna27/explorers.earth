import { expect, test } from '@playwright/test';
import { bookFixtureId } from './setup/books-owner-content';
import { closeFixture, fixtureState, openFixture } from './setup/category-navigation';
import { canonicalAccountFixture } from '../src/test/canonicalAccountFixture';
import { productEntityDtoSchema } from '../../tunes/shared/explorersProductContract';
import { recommendationCoreDtoSchema } from '../../tunes/shared/explorersContract';

// WP8 Task 8-11 (DS-03..06, DS-14). Replaces the Strapi-era "Flow 5", which drove the retired
// /api/products/scrape-link step. This runs on the contained owner fixture (native owner reads)
// and stubs only the link preview and the two save commands it exercises.

const LINK = 'https://shop.example/p';
const preview = {
  url: LINK, title: 'Trail Shoe | Shop', description: 'Light trail shoe', imageUrl: null, siteName: 'Shop',
  product: { name: 'Trail Shoe', brand: 'Acme', price: null, currencyCode: null }, person: null,
};

test('Products: paste a link, prefill, price defaults to the region currency, save one link with disclosure', async ({ browser, baseURL }) => {
  const state = fixtureState();
  const template = state.lists.productLists[0];
  state.lists.productLists = [{ ...template, documentId: 'products-0', List_Name: 'Running gear', Title: 'Running gear', slug: 'running-gear', Visibility: false, visibility: false }];
  const handle = await openFixture(browser, baseURL!, state, { owner: true });
  // The page picks its starting currency from the browser region; en-IN means INR.
  await handle.context.addInitScript(() => {
    Object.defineProperty(navigator, 'language', { get: () => 'en-IN' });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en'] });
  });
  const writes: { path: string; body: any }[] = [];
  const collectionId = bookFixtureId('collection', 'products-0');
  const entityId = '7b0e8a52-4c1d-4f7e-9a51-0d6c2f1e3a11';
  await handle.page.route('**/catalog/link-preview', async (route) => {
    const body = route.request().postDataJSON();
    writes.push({ path: 'link-preview', body });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preview }) });
  });
  await handle.page.route('**/api/explorers/v1/**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/explorers/v1/entities/resolve') {
      const body = request.postDataJSON(); writes.push({ path, body });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entity: productEntityDtoSchema.parse({
        id: entityId, kind: 'product', title: body.details.title, origin: 'manual',
        details: { productUrl: body.details.productUrl, brand: body.details.brand ?? null, logoUrl: null, description: body.details.description ?? null, specifications: body.details.specifications ?? [], imageUrls: [] } }) }) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/recommendations') {
      const body = request.postDataJSON(); writes.push({ path, body });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ recommendation: recommendationCoreDtoSchema.parse({
        id: '7b0e8a52-4c1d-4f7e-9a51-0d6c2f1e3a12', accountId: canonicalAccountFixture().id, entityId, category: 'products',
        userRating: null, publicationState: 'draft', revision: 1, mediaIds: [] }) }) });
    }
    return route.fallback();
  });
  try {
    const { page } = handle;
    await page.goto(`/recommendations/products/${collectionId}/add`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Add Product' })).toBeVisible();
    await expect(page.getByLabel('Logo URL')).toHaveCount(0);
    await expect(page.getByLabel('Currency')).toHaveValue('INR');

    const link = page.getByLabel('Where to buy');
    await link.fill(LINK);
    await link.blur();
    await expect(page.getByLabel('Title')).toHaveValue('Trail Shoe');
    await expect(page.getByLabel('Brand')).toHaveValue('Acme');
    await expect(page.getByText('Filled from link').first()).toBeVisible();
    expect(writes.find((w) => w.path === 'link-preview')?.body).toEqual({ url: LINK });

    await page.getByLabel('Price').fill('4999');
    await page.getByRole('checkbox', { name: 'This is an affiliate link' }).check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect.poll(() => writes.some((w) => w.path === '/api/explorers/v1/recommendations')).toBe(true);
    expect(writes.find((w) => w.path === '/api/explorers/v1/entities/resolve')?.body.details).toMatchObject({ title: 'Trail Shoe', productUrl: LINK, brand: 'Acme', logoUrl: null });
    expect(writes.find((w) => w.path === '/api/explorers/v1/recommendations')?.body.productOffer)
      .toEqual({ price: '4999', currencyCode: 'INR', buyUrl: LINK, affiliateDisclosed: true });
  } finally { await closeFixture(handle); }
});
