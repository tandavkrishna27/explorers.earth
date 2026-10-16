import { expect, type Locator, type Page } from '@playwright/test';
import { fixtureState } from './category-navigation';

export async function expectTask6Shell(page: Page) {
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Earth loading' })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toHaveLength(0);
}

/** Submit the explicit confirmation required when a pinned category is unpublished. */
export async function submitPinnedCategoryUnpublish(page: Page, control: Locator, categoryLabel: string) {
  await expect(control).toBeEnabled();
  await control.focus();
  await control.press('Space');
  const categoryName = categoryLabel.replace(/ Tab$/, '');
  const dialog = page.getByRole('dialog', { name: `Unpublish ${categoryName}`, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: `Unpublish ${categoryName}`, exact: true }).click();
  return dialog;
}

export async function beginTask6FrameAudit(page: Page) {
  await page.evaluate(() => {
    const audit = { frames: [] as { banner: number; nav: number; earth: number; nonblank: boolean }[], stop: false };
    (window as any).__task6ContentFrames = audit;
    const record = () => {
      audit.frames.push({
        banner: document.querySelectorAll('header').length,
        nav: document.querySelectorAll('nav[aria-label="Public navigation"]').length,
        earth: document.querySelectorAll('[role="status"][aria-label="Earth loading"]').length,
        nonblank: Boolean(document.body.innerText.trim()),
      });
      if (!audit.stop) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
}

export async function finishTask6FrameAudit(page: Page) {
  return page.evaluate(() => {
    const audit = (window as any).__task6ContentFrames;
    audit.stop = true;
    return audit.frames;
  });
}

type Task6FrameExpectation = { banner: number; nav: number; earth: number; nonblank: boolean };

export async function assertTask6FrameWindow(page: Page, expected: Task6FrameExpectation) {
  await beginTask6FrameAudit(page);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const frames = await finishTask6FrameAudit(page);
  expect(frames.length).toBeGreaterThan(0);
  const mismatches = frames.filter((frame) => !(
    frame.banner === expected.banner
    && frame.nav === expected.nav
    && frame.earth === expected.earth
    && frame.nonblank === expected.nonblank
  ));
  expect(mismatches, `all sampled frames must match ${JSON.stringify(expected)}`).toEqual([]);
  return frames.length;
}

export async function computedContrast(locator: ReturnType<Page['locator']>) {
  return locator.evaluate((element) => {
    const parse = (value: string) => {
      const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
    };
    const blend = (front: ReturnType<typeof parse>, back: ReturnType<typeof parse>) => ({
      r: front.r * front.a + back.r * (1 - front.a),
      g: front.g * front.a + back.g * (1 - front.a),
      b: front.b * front.a + back.b * (1 - front.a),
      a: 1,
    });
    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
    const background = ancestors.reduce((color, node) => blend(parse(getComputedStyle(node).backgroundColor), color), { r: 255, g: 255, b: 255, a: 1 });
    const foreground = blend(parse(getComputedStyle(element).color), background);
    const luminance = (color: typeof background) => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return channel(color.r) * 0.2126 + channel(color.g) * 0.7152 + channel(color.b) * 0.0722;
    };
    const light = Math.max(luminance(foreground), luminance(background));
    const dark = Math.min(luminance(foreground), luminance(background));
    return { ratio: (light + 0.05) / (dark + 0.05), foreground, background };
  });
}

export function seedTask6App(state: ReturnType<typeof fixtureState>) {
  state.lists.appLists[0].recommended_apps = [{
    __typename: 'RecommendedApp',
    documentId: 'fixture-app',
    app_url: 'https://example.test/app',
    title: 'Fixture app',
    logo_url: null,
    description: null,
    developer: null,
    platforms: [],
    price_tier: null,
    download_url: null,
    screenshots: [],
    user_recommendation_note: null,
    user_rating: null,
    is_pinned: false,
    pin_order: null,
    app_category: null,
  }];
}
