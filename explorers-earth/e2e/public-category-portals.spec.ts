import { expect, test } from '@playwright/test';
import { openFixture, closeFixture } from './setup/category-navigation';
import { seedCategoryThemeState } from './setup/public-category-themes';

for (const component of ['share', 'google'] as const) {
  test(`review fix1 ${component} raw keyboard focus and owner tab geometry`, async ({ browser, baseURL }, info) => {
    const reviewExpect = expect.configure({ soft: true, timeout: 700 });
    let baseline: unknown;
    for (const preset of ['default', 'minimal-light', 'cinematic-dark']) {
      const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'), { ...info.project.use.viewport!, touch: info.project.name === 'mobile', reducedMotion: 'reduce' });
      const allowed = ['/e2e/setup/category-theme-portals.html', '/e2e/setup/category-theme-portals.tsx', '/LogoQR.svg'];
      await visitor.context.route(url => url.origin === new URL(baseURL!).origin && allowed.includes(url.pathname), route => route.continue());
      const { page } = visitor;
      const keyboardFocus = async (control: ReturnType<typeof page.getByRole>) => {
        for (let index = 0; index < 20 && !await control.evaluate(element => element === document.activeElement); index++) await page.keyboard.press('Tab');
        await expect(control).toBeFocused();
        await reviewExpect(control).toHaveCSS('outline-style', 'solid');
        await reviewExpect(control).toHaveCSS('outline-width', '2px');
        await reviewExpect(control).toHaveCSS('transform', 'none');
        if (preset !== 'default') await reviewExpect(control).toHaveCSS('outline-color', preset === 'minimal-light' ? 'rgb(15, 23, 42)' : 'rgb(16, 185, 129)');
      };
      try {
        await page.goto(`/e2e/setup/category-theme-portals.html?component=${component}&preset=${preset}`);
        if (component === 'share') {
          const share = page.getByRole('button', { name: 'Share', exact: true });
          await expect(share).toBeVisible();
          await keyboardFocus(share);
          await keyboardFocus(page.getByRole('button', { name: 'QR', exact: true }));
          await keyboardFocus(page.getByRole('button', { name: 'Copy', exact: true }));
          const qr = page.getByRole('button', { name: 'QR', exact: true });
          await keyboardFocus(qr);
          await page.keyboard.press('Enter');
          await expect(page.locator('#qr-sticker-container')).toBeVisible();
          await keyboardFocus(page.locator(preset === 'default' ? '.dashboard-theme' : '[data-category-modal]').getByRole('button').last());
        } else {
          const overview = page.getByRole('button', { name: 'Overview', exact: true });
          await expect(overview).toBeVisible();
          const geometry = await overview.evaluate(element => {
            const strip = element.parentElement!;
            const content = strip.nextElementSibling!;
            const rect = strip.getBoundingClientRect();
            return { width: rect.width, height: rect.height, contentOffset: content.getBoundingClientRect().top - rect.top, buttons: [...strip.children].map(button => { const bounds = button.getBoundingClientRect(); return { width: bounds.width, height: bounds.height }; }) };
          });
          if (preset === 'default') baseline = geometry;
          else reviewExpect(geometry).toEqual(baseline);
          await info.attach(`google-tab-geometry-${preset}`, { contentType: 'application/json', body: JSON.stringify(geometry) });
          for (const name of ['Overview', 'Media', 'Address']) await keyboardFocus(page.getByRole('button', { name, exact: true }));
        }
      } finally { await closeFixture(visitor); }
    }
  });
}

test('phone component preserves enabled disabled and null-context glyph presentation', async ({ browser, baseURL }, info) => {
  for (const preset of ['default', 'minimal-light', 'cinematic-dark']) {
    for (const enabled of [true, false]) {
      const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'), { ...info.project.use.viewport!, touch: info.project.name === 'mobile' });
      const allowed = ['/e2e/setup/category-theme-portals.html', '/e2e/setup/category-theme-portals.tsx', '/LogoQR.svg'];
      await visitor.context.route(url => url.origin === new URL(baseURL!).origin && allowed.includes(url.pathname), route => route.continue());
      try {
        await visitor.page.goto(`/e2e/setup/category-theme-portals.html?component=phone&preset=${preset}&enabled=${enabled}`);
        const phone = visitor.page.getByText('Call', { exact: true }).locator('xpath=../button');
        if (enabled) await expect(phone).toBeEnabled();
        else await expect(phone).toBeDisabled();
        await expect(phone.locator('svg path')).toHaveCSS('fill', preset === 'minimal-light' ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)');
        await expect(phone).toHaveCSS('opacity', enabled ? '1' : '0.5');
      } finally { await closeFixture(visitor); }
    }
  }
});

const modalViewportSizes = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x900', width: 390, height: 900 },
  { name: '768x320', width: 768, height: 320 },
  { name: '768x1000', width: 768, height: 1000 },
  { name: '1440x1000', width: 1440, height: 1000 },
] as const;
const modalViewportPresets = ['default', 'minimal-light', 'cinematic-dark'] as const;
const modalViewportTypes = ['default', 'crop'] as const;

function expectInsideViewport(bounds: { x: number; y: number; width: number; height: number }, viewport: { width: number; height: number }) {
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
}

function rectanglesIntersect(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

for (const modalType of modalViewportTypes) {
  for (const preset of modalViewportPresets) {
    for (const viewport of modalViewportSizes) {
      test(`@once modal viewport ${modalType} ${preset} ${viewport.name} keeps controls reachable`, async ({ browser, baseURL }, info) => {
        const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'), { ...viewport, reducedMotion: 'reduce' });
        const allowed = ['/e2e/setup/category-theme-portals.html', '/e2e/setup/category-theme-portals.tsx', '/LogoQR.svg'];
        await visitor.context.route(url => url.origin === new URL(baseURL!).origin && allowed.includes(url.pathname), route => route.continue());
        if (modalType === 'default') await visitor.context.grantPermissions(['clipboard-write'], { origin: baseURL! });
        const { page } = visitor;
        try {
          await page.goto(`/e2e/setup/category-theme-portals.html?component=${modalType === 'crop' ? 'crop' : 'share'}&preset=${preset}`);
          expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

          const wrapper = page.locator('[data-modal-wrapper]');
          const panel = page.locator('[data-modal-panel]');
          const wrapperBounds = await wrapper.boundingBox();
          const panelBounds = await panel.boundingBox();
          expect(wrapperBounds).not.toBeNull();
          expect(panelBounds).not.toBeNull();
          expectInsideViewport(wrapperBounds!, viewport);
          expectInsideViewport(panelBounds!, viewport);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

          if (modalType === 'default') {
            const close = page.getByRole('button', { name: 'Close dialog', exact: true });
            const share = page.getByRole('button', { name: 'Share', exact: true });
            const qr = page.getByRole('button', { name: 'QR', exact: true });
            const closeBounds = await close.boundingBox();
            const shareBounds = await share.boundingBox();
            const qrBounds = await qr.boundingBox();
            expect(closeBounds).not.toBeNull();
            expect(shareBounds).not.toBeNull();
            expect(qrBounds).not.toBeNull();
            expectInsideViewport(closeBounds!, viewport);
            expect(closeBounds!.width).toBeGreaterThanOrEqual(44);
            expect(closeBounds!.height).toBeGreaterThanOrEqual(44);
            expect(rectanglesIntersect(closeBounds!, shareBounds!)).toBe(false);
            expect(rectanglesIntersect(closeBounds!, qrBounds!)).toBe(false);

            await qr.click();
            await expect(page.locator('#qr-sticker-container')).toBeVisible();
            await share.focus();
            await page.keyboard.press('Enter');
            const copy = page.getByRole('button', { name: 'Copy', exact: true });
            await copy.scrollIntoViewIfNeeded();
            await copy.click();
            await expect(page.getByRole('button', { name: 'Copied!', exact: true })).toBeVisible();
            await close.click();
            await expect(page.locator('[data-component-closed]')).toBeVisible();
          } else {
            await expect(page.getByRole('button', { name: 'Close dialog', exact: true })).toHaveCount(0);
            const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
            const confirm = page.getByRole('button', { name: 'Confirm', exact: true });
            await expect(cancel).toBeVisible();
            await expect(confirm).toBeVisible();
            if (viewport.height <= 568) {
              const overflow = await panel.evaluate(element => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
              expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
              await info.attach(`modal-crop-overflow-${preset}-${viewport.name}`, { contentType: 'application/json', body: JSON.stringify(overflow) });
            }
            const action = preset === 'default' && viewport.name === '390x900' ? cancel : confirm;
            const expectedResult = action === cancel ? 'cancelled' : 'confirmed';
            await action.scrollIntoViewIfNeeded();
            await action.click();
            await expect(page.locator('[data-crop-result]')).toHaveText(expectedResult);
            await expect(page.locator('[data-component-closed]')).toBeVisible();
          }
        } finally { await closeFixture(visitor); }
      });
    }
  }
}

test('@once modal viewport default 320x568 supports normal motion and normal Close', async ({ browser, baseURL }) => {
    const viewport = { width: 320, height: 568 };
    const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'), { ...viewport, reducedMotion: 'no-preference' });
    const allowed = ['/e2e/setup/category-theme-portals.html', '/e2e/setup/category-theme-portals.tsx', '/LogoQR.svg'];
    await visitor.context.route(url => url.origin === new URL(baseURL!).origin && allowed.includes(url.pathname), route => route.continue());
    const { page } = visitor;
    try {
      await page.goto('/e2e/setup/category-theme-portals.html?component=share&preset=default');
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
      const close = page.getByRole('button', { name: 'Close dialog', exact: true });
      const closeBounds = await close.boundingBox();
      expect(closeBounds).not.toBeNull();
      expectInsideViewport(closeBounds!, viewport);
      await close.click();
      await expect(page.locator('[data-component-closed]')).toBeVisible();
    } finally { await closeFixture(visitor); }
});

for (const preset of ['minimal-light', 'cinematic-dark', 'default']) {
  for (const component of ['share', 'qr', 'media', 'circular', 'day']) {
    test(`portal component ${component} ${preset} colors and pointer close`, async ({ browser, baseURL }, info) => {
      const viewport = info.project.use.viewport!;
      const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'), { ...viewport, touch: info.project.name === 'mobile', reducedMotion: 'reduce' });
      const allowed = ['/e2e/setup/category-theme-portals.html', '/e2e/setup/category-theme-portals.tsx', '/LogoQR.svg'];
      await visitor.context.route(url => url.origin === new URL(baseURL!).origin && allowed.includes(url.pathname), route => route.continue());
      const { page } = visitor;
      try {
        await page.goto(`/e2e/setup/category-theme-portals.html?component=${component}&preset=${preset}`);
        expect(page.viewportSize()).toEqual(viewport);
        expect(await page.evaluate(() => innerWidth)).toBe(viewport.width);
        const colors = preset === 'minimal-light' ? { panel: 'rgb(255, 255, 255)', text: 'rgb(15, 23, 42)' } : { panel: 'rgb(17, 24, 39)', text: 'rgb(255, 255, 255)' };
        if (component === 'share') {
          await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible();
          if (preset !== 'default') await expect(page.getByRole('heading', { name: 'Share on Social Media', exact: true })).toHaveCSS('color', preset === 'minimal-light' ? 'rgb(71, 85, 105)' : 'rgb(156, 163, 175)');
          if (preset !== 'default') await expect(page.locator('[data-category-modal] .border-2')).toHaveCSS('background-color', colors.panel);
          else await expect(page.locator('.dashboard-theme.bg-dashboard-overlay')).toBeVisible();
          await page.getByRole('button', { name: 'QR', exact: true }).click();
          if (preset !== 'default') await expect(page.getByRole('heading', { name: 'Share & Download', exact: true })).toHaveCSS('color', preset === 'minimal-light' ? 'rgb(71, 85, 105)' : 'rgb(156, 163, 175)');
          await expect(page.locator('#qr-sticker-container')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
          await expect(page.locator('#qr-sticker-container .p-2')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
          await expect(page.getByText('Travel like a local', { exact: true })).toHaveCSS('color', 'rgb(0, 0, 0)');
          await page.locator(preset === 'default' ? '.dashboard-theme' : '[data-category-modal]').getByRole('button').first().click();
        } else if (component === 'qr') {
          const title = page.getByRole('heading', { name: 'Profile QR', exact: true });
          await expect(title).toBeVisible();
          await expect(title).toHaveCSS('color', preset === 'default' ? 'rgb(255, 255, 255)' : colors.text);
          await expect(page.locator('.bg-white.p-4')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
          if (preset !== 'default') {
            const copy = page.getByRole('button', { name: 'Copy Link', exact: true });
            await copy.focus();
            await expect(copy).toHaveCSS('outline-style', 'solid');
            await expect(copy).toHaveCSS('outline-color', preset === 'minimal-light' ? 'rgb(15, 23, 42)' : 'rgb(16, 185, 129)');
          }
          await page.locator('[data-portal-component]').getByRole('button').first().click();
        } else if (component === 'day') {
          const title = page.getByRole('heading', { name: 'Fixture day', exact: true });
          await expect(title).toHaveCSS('color', preset === 'default' ? 'rgb(255, 255, 255)' : colors.text);
          if (preset !== 'default') {
            await expect(title.locator('xpath=../..')).toHaveCSS('background-color', colors.panel);
            await expect(title.locator('xpath=../..').getByRole('button').locator('svg')).toHaveCSS('stroke', colors.text);
          }
          await page.locator('[data-portal-component]').getByRole('button').first().click();
        } else if (component === 'circular') {
          await expect(page.getByText('Fixture city', { exact: true })).toHaveCSS('color', preset === 'default' ? 'rgb(255, 255, 255)' : colors.text);
          if (preset !== 'default') await expect(page.locator('[data-category-circular-places]')).toHaveCSS('background-color', colors.panel);
          await page.locator('[data-portal-component]').getByRole('button').first().click();
        } else {
          await expect(page.locator('.yarl__container')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.95)');
          await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
          await page.getByRole('button', { name: 'Close', exact: true }).click();
        }
        await expect(page.locator('[data-component-closed]')).toBeVisible();
      } finally { await closeFixture(visitor); }
    });
  }
}
