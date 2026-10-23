import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { closeFixture, fixtureState, openFixture } from './setup/category-navigation';
import { installSampleRoutes, sampleDataset } from './setup/wp11-samples-fixture';

// WP11 first-visit samples: screenshots for review against mocks v3, plus the layout checks the
// screens depend on (no horizontal overflow, centred container at desktop width).
const out = resolve(process.cwd(), '../docs/superpowers/screenshots/wp11');
mkdirSync(out, { recursive: true });
const movies = '00000000-0000-4000-8000-000000000101';
const places = '00000000-0000-4000-8000-000000000201';

async function open(browser: Parameters<Parameters<typeof test>[1]>[0]['browser'], baseURL: string, width: number) {
  const state = fixtureState();
  // A new account: no ordinary lists, only the samples served by the sample dataset.
  state.lists.movieLists = []; state.lists.recommendationLists = [];
  const handle = await openFixture(browser, baseURL, state, { owner: true, width, height: width < 768 ? 812 : 900, touch: width < 768, theme: 'dark' });
  const data = sampleDataset();
  await installSampleRoutes(handle.context, baseURL, data);
  if (process.env.WP11_DEBUG) handle.page.on('response', r => { if (r.url().includes('/api/')) console.log(r.status(), r.request().method(), r.url().replace(baseURL, '')); });
  if (process.env.WP11_DEBUG) handle.page.on('console', m => console.log('console', m.type(), m.text().slice(0, 300)));
  return { handle, data };
}

async function shot(page: Page, name: string, width: number) {
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} scrolls horizontally`).toBeLessThanOrEqual(0);
  const container = page.getByTestId('dashboard-page-container');
  if (width >= 1024 && await container.count()) expect((await container.first().boundingBox())!.width, `${name} container stretched`).toBeLessThanOrEqual(720);
  await page.screenshot({ path: `${out}/${name}-${width}.png` });
}

for (const width of [1440, 375]) {
  test(`movies sample screens at ${width}px`, async ({ browser, baseURL }) => {
    const { handle, data } = await open(browser, baseURL!, width);
    const { page } = handle;
    try {
      await page.goto('/recommendations/movies');
      await expect(page.getByTestId('list-card')).toHaveCount(2);
      await expect(page.getByText('Only you can see this', { exact: true }).first()).toBeVisible();
      await shot(page, '01-category-samples', width);

      await page.getByTestId('list-card').first().locator('[aria-haspopup="menu"]').click();
      await expect(page.getByRole('menuitem', { name: 'Make it mine' })).toBeVisible();
      await shot(page, '02-card-menu', width);
      await page.keyboard.press('Escape');

      await page.goto(`/recommendations/movies/${movies}`);
      const bar = page.getByText('A sample to show how a list works.', { exact: false });
      await expect(bar).toBeVisible();
      // The bar's sentence keeps a readable measure: on a phone the buttons wrap below it.
      expect((await bar.boundingBox())!.width, 'sample bar text squeezed').toBeGreaterThanOrEqual(240);
      await shot(page, '03-sample-list', width);

      await page.getByRole('button', { name: 'Delete sample' }).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await shot(page, '04-delete-confirm', width);
      await page.getByRole('button', { name: 'Cancel' }).click();

      await page.getByRole('button', { name: 'Make it mine' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Now yours' })).toBeVisible();
      await expect(page.getByText('A sample to show how a list works.', { exact: false })).toBeHidden();
      await shot(page, '05-made-mine', width);

    } finally { if (data.errors.length) console.log(data.errors); await closeFixture(handle); }
  });

  test(`movies empty state after deleting the last sample at ${width}px`, async ({ browser, baseURL }) => {
    const { handle, data } = await open(browser, baseURL!, width);
    const { page } = handle;
    try {
      await page.goto('/recommendations/movies');
      for (const remaining of [1, 0]) {
        await page.getByTestId('list-card').first().locator('[aria-haspopup="menu"]').click();
        await page.getByRole('menuitem', { name: 'Delete sample' }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
        await expect(page.getByTestId('list-card')).toHaveCount(remaining);
      }
      await expect(page.getByRole('alertdialog')).toBeHidden();
      await shot(page, '06-category-empty', width);
    } finally { if (data.errors.length) console.log(data.errors); await closeFixture(handle); }
  });

  test(`places sample screens at ${width}px`, async ({ browser, baseURL }) => {
    const { handle, data } = await open(browser, baseURL!, width);
    const { page } = handle;
    try {
      await page.goto(`/recommendations/places/${places}`);
      await expect(page.getByText('A sample to show how a list works.', { exact: false })).toBeVisible();
      await shot(page, '07-places-sample-list', width);

      await page.goto('/recommendations/places');
      await expect(page.getByTestId('list-card')).toHaveCount(1);
      await shot(page, '08-places-category-samples', width);
    } finally { if (data.errors.length) console.log(data.errors); await closeFixture(handle); }
  });
}
