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

// The shared WP4 add template (served on the Movies add route by dashboard-layout.vite.config.ts).
const addPath = '/recommendations/movies/layout-list/add';
const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('add page is centred at 1440px', async ({ browser, baseURL }) => {
  const owner = await openFixture(browser, baseURL!, fixtureState(), { owner: true, width: 1440, height: 900 });
  try {
    await owner.page.goto(addPath);
    const page = await container(owner.page);
    const content = (await owner.page.locator('.dashboard-content').boundingBox())!;
    expect(page.width).toBeLessThanOrEqual(720);
    expect(Math.abs((page.x + page.width / 2) - (content.x + content.width / 2))).toBeLessThanOrEqual(1);
    if (shots) await owner.page.screenshot({ path: `${shots}/1440-add.png` });
  } finally { await closeFixture(owner); }
});

test('phone add page: back link clears the header, Save clears the bottom nav and is clickable', async ({ browser, baseURL }) => {
  const owner = await openFixture(browser, baseURL!, fixtureState(), { owner: true, width: 375, height: 812, touch: true });
  try {
    await owner.page.goto(addPath);
    const back = owner.page.getByRole('button', { name: /Back to Public movies/ });
    await expect(back).toBeVisible();
    expect(intersects((await back.boundingBox())!, await headerBox(owner.page)), 'back link under header').toBe(false);
    const nav = (await owner.page.getByTestId('phone-bottom-nav').boundingBox())!;
    const save = owner.page.getByRole('button', { name: 'Save', exact: true });
    for (const scroll of ['top', 'bottom'] as const) {
      if (scroll === 'bottom') await owner.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(() => owner.page.evaluate(() => window.scrollY)).toBe(scroll === 'top' ? 0 : await owner.page.evaluate(() => document.documentElement.scrollHeight - innerHeight));
      await expect(save).toBeVisible();
      expect(intersects((await save.boundingBox())!, nav), `Save under bottom nav (${scroll})`).toBe(false);
      if (shots) await owner.page.screenshot({ path: `${shots}/375-add-${scroll}.png` });
    }
    // A trial click fails if another element (the bottom nav) would receive it.
    await save.click({ trial: true, timeout: 3000 });
  } finally { await closeFixture(owner); }
});
