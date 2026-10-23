import { expect, test, type Page } from '@playwright/test';
import { categories, closeFixture, fixtureState, openFixture } from './setup/category-navigation';

// Owner-reported layout regressions after Wave 1: every dashboard category page and the
// All Recommendations hub share one centred container, the phone publish pill clears the
// header with a visible gap, and each page shows exactly one title.
const pages = [{ route: 'hub', path: '/recommendations' }, ...categories.map(c => ({ route: c.route, path: `/recommendations/${c.route}` }))];
const shots = process.env.DASHBOARD_LAYOUT_SHOTS;

async function container(page: Page) {
  const box = await page.getByTestId('dashboard-page-container').boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function headerBox(page: Page) {
  const box = await page.locator('.dashboard-header').boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

for (const width of [1440, 375]) {
  test(`one centred container across category pages at ${width}px`, async ({ browser, baseURL }) => {
    const owner = await openFixture(browser, baseURL!, fixtureState(), { owner: true, width, height: 900 });
    try {
      const boxes: { route: string; x: number; width: number; centre: number }[] = [];
      for (const target of pages) {
        await owner.page.goto(target.path);
        const box = await container(owner.page);
        boxes.push({ route: target.route, x: Math.round(box.x), width: Math.round(box.width), centre: Math.round(box.x + box.width / 2) });
        if (shots) await owner.page.screenshot({ path: `${shots}/${width}-${target.route}.png` });
      }
      const [first] = boxes;
      for (const box of boxes) expect({ route: box.route, x: box.x, width: box.width }).toEqual({ route: box.route, x: first.x, width: first.width });
      if (width >= 1024) expect(first.width).toBeLessThanOrEqual(720);
    } finally { await closeFixture(owner); }
  });
}

test('each category page shows exactly one title', async ({ browser, baseURL }) => {
  const owner = await openFixture(browser, baseURL!, fixtureState(), { owner: true, width: 1440, height: 900 });
  try {
    for (const category of categories) {
      await owner.page.goto(`/recommendations/${category.route}`);
      await expect(owner.page.getByTestId('dashboard-page-container')).toBeVisible();
      const name = category.label.replace(/ Tab$/, '');
      // The header keeps the title; the page itself repeats it only for assistive tech (sidebar nav entries are not titles).
      await expect(owner.page.locator('.dashboard-header').getByText(name, { exact: true }).filter({ visible: true })).toHaveCount(1);
      const inPage = owner.page.getByTestId('dashboard-page-container').getByText(name, { exact: true });
      await expect(inPage).toHaveCount(1);
      await expect(inPage).toHaveJSProperty('tagName', 'H2');
      const box = (await inPage.boundingBox())!;
      expect(box.width * box.height, `${category.route} in-page title is not painted`).toBeLessThanOrEqual(1);
    }
  } finally { await closeFixture(owner); }
});

test('phone publish pill and its menu never overlap the header', async ({ browser, baseURL }) => {
  const owner = await openFixture(browser, baseURL!, fixtureState(), { owner: true, width: 375, height: 812, touch: true });
  try {
    for (const category of categories) {
      await owner.page.goto(`/recommendations/${category.route}`);
      const pill = owner.page.getByRole('button', { name: /^Visibility:/ });
      await expect(pill).toBeVisible();
      const header = await headerBox(owner.page);
      const pillBox = (await pill.boundingBox())!;
      expect(pillBox.y, `${category.route} pill top`).toBeGreaterThanOrEqual(header.y + header.height + 4);
      await pill.click();
      const menu = owner.page.getByRole('menu');
      await expect(menu).toBeVisible();
      const menuBox = (await menu.boundingBox())!;
      expect(menuBox.y, `${category.route} menu top`).toBeGreaterThanOrEqual(header.y + header.height + 4);
      await owner.page.keyboard.press('Escape');
    }
  } finally { await closeFixture(owner); }
});
