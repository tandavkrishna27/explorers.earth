import { expect, test } from '@playwright/test';
import { closeFixture, fixtureState, fixtureUser, openFixture } from './setup/category-navigation';
import {
  REQUIRED_DATA_STATES,
  REQUIRED_HIGH_RISK_ROUTE_TYPES,
  REQUIRED_THEMES,
  REQUIRED_VIEWPORTS,
  TOP_LEVEL_DESTINATIONS,
  assertPublicShellVisualCoverage,
  beginFrameRecorder,
  configureVisualState,
  finishFrameRecorder,
  framesAfterActivation,
  holdDestination,
  percentile,
  publicPath,
  readFrameRecorder,
  seedRenderableApp,
  warmFrameFailures,
} from './setup/public-shell-continuity';
import { PUBLIC_SHELL_VISUAL_MATRIX } from './fixtures/public-shell-visual-matrix';

test('Task 7 fixture/config/checked-in visual matrix contract', () => {
  expect(TOP_LEVEL_DESTINATIONS.map(destination => destination.id)).toEqual([
    'profile', 'places', 'guides', 'movies', 'books', 'games', 'apps', 'products', 'people',
  ]);
  expect(REQUIRED_THEMES).toHaveLength(6);
  expect(REQUIRED_VIEWPORTS).toEqual([320, 390, 768, 1024, 1440]);
  expect(REQUIRED_HIGH_RISK_ROUTE_TYPES).toEqual(['profile', 'list', 'detail', 'map']);
  expect(REQUIRED_DATA_STATES).toEqual(['success', 'empty', 'error', 'partial']);
  expect(() => assertPublicShellVisualCoverage(PUBLIC_SHELL_VISUAL_MATRIX)).not.toThrow();
  expect(framesAfterActivation(['before', 'first', 'second'], 1)).toEqual(['first', 'second']);
});

const PAGE_DESTINATIONS = TOP_LEVEL_DESTINATIONS;

async function expectSettledShell(page: import('@playwright/test').Page, options: { map?: boolean; footer?: boolean } = {}) {
  await expect(page.getByRole('status', { name: 'Earth loading' })).toHaveCount(0);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toHaveCount(options.map ? 0 : 1);
  if (options.footer === false || options.map) await expect(page.getByRole('contentinfo')).toHaveCount(0);
  else expect(await page.getByRole('contentinfo').count()).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('cookie-consent-positioner')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function readVisualAudit(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const parseColour = (value: string) => {
      const values = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return { r: values[0] ?? 0, g: values[1] ?? 0, b: values[2] ?? 0, a: values[3] ?? 1 };
    };
    const blend = (front: ReturnType<typeof parseColour>, back: ReturnType<typeof parseColour>) => ({
      r: front.r * front.a + back.r * (1 - front.a),
      g: front.g * front.a + back.g * (1 - front.a),
      b: front.b * front.a + back.b * (1 - front.a),
      a: 1,
    });
    const effectiveBackground = (element: Element) => {
      const ancestors: Element[] = [];
      for (let current: Element | null = element; current; current = current.parentElement) ancestors.unshift(current);
      return ancestors.reduce((colour, current) => blend(parseColour(getComputedStyle(current).backgroundColor), colour), { r: 255, g: 255, b: 255, a: 1 });
    };
    const luminance = (colour: ReturnType<typeof parseColour>) => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return channel(colour.r) * 0.2126 + channel(colour.g) * 0.7152 + channel(colour.b) * 0.0722;
    };
    const contrast = (foreground: ReturnType<typeof parseColour>, background: ReturnType<typeof parseColour>) => {
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    };
    const ratioFor = (element: Element, property: 'color' | 'outlineColor' = 'color') => {
      const background = effectiveBackground(element);
      return contrast(blend(parseColour(getComputedStyle(element)[property]), background), background);
    };
    const rect = (element: Element | null) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const shell = document.querySelector<HTMLElement>('[data-public-profile-chrome]')!;
    const header = document.querySelector<HTMLElement>('.public-brand-header')!;
    const content = document.querySelector<HTMLElement>('[data-public-content-layer]')!;
    const contentStart = content.firstElementChild;
    const logo = header.querySelector<HTMLElement>('.public-brand-logo')!;
    const share = header.querySelector<HTMLButtonElement>('.public-brand-action')!;
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Public navigation"]');
    const navLayer = nav?.closest<HTMLElement>('.public-profile-nav-layer') ?? null;
    const footer = document.querySelector<HTMLElement>('footer.public-brand-footer');
    const wordmark = footer?.querySelector<HTMLElement>('.public-brand-wordmark') ?? null;
    const targets = [logo, share, ...Array.from(nav?.querySelectorAll<HTMLElement>('a,button') ?? [])];
    const targetGeometry = targets.map(target => ({ label: target.getAttribute('aria-label') || target.textContent?.trim() || target.tagName, ...rect(target)! }));
    const hitTargets = targets.map(target => {
      const bounds = target.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return { label: target.getAttribute('aria-label') || target.textContent?.trim() || target.tagName, hit: hit === target || Boolean(hit && target.contains(hit)) };
    });
    const style = getComputedStyle(shell);
    const z = (name: string) => Number.parseFloat(style.getPropertyValue(name));
    const animations = document.getAnimations().map(animation => Number(animation.effect?.getTiming().duration ?? 0)).filter(Number.isFinite);
    const shareStyle = getComputedStyle(share);
    const footerStyle = footer ? getComputedStyle(footer) : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      theme: shell.dataset.themePreset,
      overflow: document.documentElement.scrollWidth - innerWidth,
      header: rect(header),
      content: rect(content),
      contentStart: rect(contentStart),
      firstMeaningfulContent: rect(content.querySelector('[data-profile-identity], main h1, h1, h2, [role="status"]')),
      identity: rect(document.querySelector('[data-profile-identity]')),
      nav: rect(nav),
      footer: rect(footer),
      wordmark: rect(wordmark),
      targetGeometry,
      headerControlBottom: Math.max(...targetGeometry.slice(0, 2).map(target => target.bottom)),
      hitTargets,
      contrast: {
        headerAction: ratioFor(share),
        focus: ratioFor(share, 'outlineColor'),
        footerInk: footer ? ratioFor(footer) : null,
      },
      focus: { outlineStyle: shareStyle.outlineStyle, outlineWidth: shareStyle.outlineWidth, outlineColor: shareStyle.outlineColor },
      safeArea: {
        top: style.getPropertyValue('--public-safe-top').trim(),
        right: style.getPropertyValue('--public-safe-right').trim(),
        bottom: style.getPropertyValue('--public-safe-bottom').trim(),
        left: style.getPropertyValue('--public-safe-left').trim(),
        footerBottom: footerStyle?.getPropertyValue('--public-safe-bottom').trim() ?? null,
        footerPaddingBottom: footerStyle?.paddingBottom ?? null,
      },
      zIndex: {
        content: z('--z-public-content'), map: z('--z-public-map-controls'), nav: z('--z-public-nav'),
        header: z('--z-public-header'), toast: z('--z-public-toast'), modal: z('--z-public-modal'), cold: z('--z-public-cold-overlay'),
        headerActual: Number.parseFloat(getComputedStyle(header).zIndex),
        navLayerActual: navLayer ? Number.parseFloat(getComputedStyle(navLayer).zIndex) : null,
      },
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      longestAnimationMs: animations.length ? Math.max(...animations) : 0,
    };
  });
}

test('checked-in visual matrix preserves public chrome geometry contrast focus and accessibility', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name !== 'chromium', 'The complete visual matrix runs once in contained Chromium.');
  test.setTimeout(360_000);
  const summary: Record<string, unknown> = {};
  const selectedRowIds = new Set(process.env.TASK7_VISUAL_ROW?.split(',').filter(Boolean) ?? []);
  const selectedRows = selectedRowIds.size > 0
    ? PUBLIC_SHELL_VISUAL_MATRIX.filter(row => selectedRowIds.has(row.id))
    : PUBLIC_SHELL_VISUAL_MATRIX;
  expect(selectedRows, 'TASK7_VISUAL_ROW must name one checked-in row').not.toHaveLength(0);
  if (selectedRowIds.size > 0) expect(selectedRows, 'every TASK7_VISUAL_ROW id must exist').toHaveLength(selectedRowIds.size);
  for (const row of selectedRows) {
    const state = configureVisualState(fixtureState(), row);
    const visitor = await openFixture(browser, baseURL!, state, {
      width: row.viewport,
      height: row.viewport <= 390 ? 900 : 1000,
      touch: row.viewport <= 390,
      reducedMotion: 'reduce',
      safeArea: { top: 17, right: 13, bottom: 19, left: 11 },
    });
    try {
      await visitor.page.goto(row.path);
      await expectSettledShell(visitor.page, { map: row.routeType === 'map', footer: row.routeType === 'map' ? false : undefined });
      await expect(visitor.page.locator('[data-public-profile-chrome]')).toHaveAttribute('data-theme-preset', row.theme);
      const share = visitor.page.getByRole('button', { name: 'Share', exact: true });
      await share.focus();
      await expect(share).toBeFocused();
      await visitor.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const audit = await readVisualAudit(visitor.page);
      summary[row.id] = audit;
      console.info(`[task7-visual ${row.id}] ${JSON.stringify(audit)}`);

      expect.soft(audit.viewport.width, `${row.id}: viewport`).toBe(row.viewport);
      expect.soft(audit.theme, `${row.id}: theme`).toBe(row.theme);
      expect.soft(audit.overflow, `${row.id}: horizontal overflow`).toBeLessThanOrEqual(0);
      expect.soft(audit.header?.top, `${row.id}: safe-area top`).toBeCloseTo(17, 0);
      expect.soft(audit.header?.left, `${row.id}: safe-area left`).toBeCloseTo(11, 0);
      expect.soft(audit.header?.right, `${row.id}: safe-area right`).toBeCloseTo(row.viewport - 13, 0);
      expect.soft(audit.targetGeometry.every(target => target.width >= 44 && target.height >= 44), `${row.id}: 44px public chrome targets`).toBe(true);
      expect.soft(audit.hitTargets.every(target => target.hit), `${row.id}: public chrome remains the hit target`).toBe(true);
      expect.soft(audit.focus.outlineStyle, `${row.id}: visible focus style`).toBe('solid');
      expect.soft(Number.parseFloat(audit.focus.outlineWidth), `${row.id}: visible focus width`).toBeGreaterThanOrEqual(3);
      expect.soft(audit.contrast.headerAction, `${row.id}: header action contrast`).toBeGreaterThanOrEqual(3);
      expect.soft(audit.contrast.focus, `${row.id}: focus contrast`).toBeGreaterThanOrEqual(3);
      if (audit.contrast.footerInk !== null) expect.soft(audit.contrast.footerInk, `${row.id}: footer ink contrast`).toBeGreaterThanOrEqual(4.5);
      if (audit.footer && audit.wordmark) {
        expect.soft(audit.wordmark.left, `${row.id}: wordmark left fit`).toBeGreaterThanOrEqual(0);
        expect.soft(audit.wordmark.right, `${row.id}: wordmark right fit`).toBeLessThanOrEqual(row.viewport);
        expect.soft(audit.wordmark.width, `${row.id}: wordmark footer fit`).toBeLessThanOrEqual(audit.footer.width);
        expect.soft(Number.parseFloat(audit.safeArea.footerPaddingBottom ?? '0'), `${row.id}: footer safe-area reserve`).toBeGreaterThanOrEqual(115);
      }
      expect.soft(audit.reducedMotion, `${row.id}: reduced-motion media query`).toBe(true);
      expect.soft(audit.longestAnimationMs, `${row.id}: reduced animations`).toBeLessThanOrEqual(1);
      expect.soft([
        audit.zIndex.content, audit.zIndex.map, audit.zIndex.nav, audit.zIndex.header,
        audit.zIndex.toast, audit.zIndex.modal, audit.zIndex.cold,
      ], `${row.id}: public z-index contract`).toEqual([0, 40, 80, 90, 1000, 2000, 3000]);
      expect.soft(audit.zIndex.headerActual, `${row.id}: real header z-index`).toBe(90);
      if (row.routeType !== 'map') expect.soft(audit.zIndex.navLayerActual, `${row.id}: real nav layer z-index`).toBe(80);
      if (audit.firstMeaningfulContent && row.routeType !== 'profile') {
        expect.soft(audit.firstMeaningfulContent.top, `${row.id}: content clears fixed header`).toBeGreaterThanOrEqual(audit.header?.bottom ?? 0);
      }
      if (audit.identity) expect.soft(audit.identity.top, `${row.id}: profile identity clears header controls`).toBeGreaterThanOrEqual(audit.headerControlBottom);

      const screenshotPath = test.info().outputPath(`task7-visual-${row.id}.png`);
      await visitor.page.screenshot({ path: screenshotPath, fullPage: true });
      await test.info().attach(`task7-geometry-contrast-${row.id}`, {
        contentType: 'application/json', body: JSON.stringify(audit, null, 2),
      });
    } finally {
      await closeFixture(visitor);
    }
  }
  await test.info().attach('task7-visual-matrix-summary', { contentType: 'application/json', body: JSON.stringify(summary, null, 2) });
});

test('real toast photo viewer guide map portal and cold Earth obey the public stacking and reduced-motion contract', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name !== 'chromium', 'Overlay and animation geometry is qualified in contained Chromium.');
  const overlayState = fixtureState({
    pinned_nav_tabs: ['public_profile', 'public_guides'],
  }, 'public');
  overlayState.account.social_media.theme_settings.footerBranding = 'enabled';
  overlayState.lists.guides[0].guide_sections = [{
    __typename: 'GuideSection', documentId: 'guide-section-map', Title: 'Map day', Sequence: 1,
    Description: 'A mapped day',
    Timeline: {
      // `id` is required: 24b942c0 made convertPublicGuideSection reject a place without one
      // (legacyPlace returns undefined). This fixture needs it either way -- a rejected place
      // is now skipped rather than deleting its whole section, but a section whose only place
      // was rejected still leaves morning empty, so hasPlacesForMap would be false, the Map
      // View button would not exist, and the click below would time out exactly as before.
      // The production rejection is deliberate and unit-tested
      // (publicGuidePhotoViewModel.test.ts); only this fixture was stale.
      morning: [{ id: 'fixture-map-entry', place_id: 'fixture-map-place', name: 'Fixture map place', formatted_address: 'Fixture City', geometry: { location: { lat: 26.9124, lng: 75.7873 } }, photos: [] }],
      afternoon: [], evening: [],
    },
    Transport: null, Stay: null, Recommendation_Activity: null, Map_Details: null,
    Packing_List: null, Pre_Tasks: null, Section_tags: [], Budget: null,
  }];
  const overlay = await openFixture(browser, baseURL!, overlayState, { width: 390, height: 900, reducedMotion: 'reduce' });
  await overlay.context.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, get: () => undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } });
  });
  const evidence: Record<string, unknown> = {};
  try {
    await overlay.page.goto(publicPath());
    await expectSettledShell(overlay.page);
    await overlay.page.getByRole('button', { name: 'Share', exact: true }).click();
    const toast = overlay.page.locator('[data-sonner-toast]').first();
    await expect(toast).toBeVisible();
    const toastZ = await overlay.page.locator('[data-sonner-toaster]').evaluate(node => Number.parseFloat(getComputedStyle(node).zIndex));
    expect(toastZ).toBe(1000);
    expect(await toast.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === node || Boolean(hit && node.contains(hit));
    })).toBe(true);
    evidence.toast = { zIndex: toastZ, hit: true };

    await overlay.page.getByRole('button', { name: "View Fixture Explorer's profile photo" }).click();
    const viewer = overlay.page.locator('.yarl__root');
    await expect(viewer).toBeVisible();
    const viewerZ = await viewer.evaluate(node => Number.parseFloat(getComputedStyle(node).zIndex));
    expect(viewerZ).toBe(2000);
    await expect(viewer.getByRole('button', { name: /Close/i })).toBeVisible();
    expect(await viewer.getByRole('button', { name: /Close/i }).evaluate(node => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === node || Boolean(hit && node.contains(hit));
    })).toBe(true);
    evidence.photoViewer = { zIndex: viewerZ, closeHit: true };
    await overlay.page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    await overlay.page.goto(publicPath('guides/public-guides'));
    await expect(overlay.page.getByRole('heading', { name: 'Public guides' })).toBeVisible();
    await overlay.page.getByRole('button', { name: 'Map View' }).click();
    const expandMap = overlay.page.getByRole('button', { name: 'Expand map' });
    const expandAudit = await expandMap.evaluate(button => {
      const rect = button.getBoundingClientRect();
      const share = document.querySelector<HTMLElement>('.public-brand-action')!;
      const shareRect = share.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
        shareRect: { left: shareRect.left, right: shareRect.right, top: shareRect.top, bottom: shareRect.bottom },
        hit: hit === button || Boolean(hit && button.contains(hit)),
      };
    });
    expect(expandAudit.hit).toBe(true);
    expect(Math.min(expandAudit.rect.width, expandAudit.rect.height)).toBeGreaterThanOrEqual(44);
    evidence.expandMap = expandAudit;
    console.info(`[task7-expand-map] ${JSON.stringify(expandAudit)}`);
    await expandMap.click();
    const portal = overlay.page.locator('[data-public-guide-map-portal]');
    await expect(portal).toBeVisible();
    const portalAudit = await portal.evaluate(node => {
      const style = getComputedStyle(node);
      const share = document.querySelector<HTMLElement>('.public-brand-action')!;
      const shareRect = share.getBoundingClientRect();
      const shareHit = document.elementFromPoint(shareRect.left + shareRect.width / 2, shareRect.top + shareRect.height / 2);
      const list = Array.from(node.querySelectorAll<HTMLElement>('button')).find(button => button.textContent?.includes('List View'))!;
      const listRect = list.getBoundingClientRect();
      const listHit = document.elementFromPoint(listRect.left + listRect.width / 2, listRect.top + listRect.height / 2);
      return {
        zIndex: Number.parseFloat(style.zIndex),
        shellIsolation: getComputedStyle(document.querySelector<HTMLElement>('[data-public-profile-chrome]')!).isolation,
        shareHit: shareHit === share || Boolean(shareHit && share.contains(shareHit)),
        listHit: listHit === list || Boolean(listHit && list.contains(listHit)),
        listRect: { width: listRect.width, height: listRect.height },
      };
    });
    expect(portalAudit).toMatchObject({ zIndex: 40, shellIsolation: 'auto', shareHit: true, listHit: true });
    console.info(`[task7-guide-map-portal] ${JSON.stringify(portalAudit)}`);
    expect(Math.min(portalAudit.listRect.width, portalAudit.listRect.height)).toBeGreaterThanOrEqual(44);
    evidence.guideMapPortal = portalAudit;
  } finally { await closeFixture(overlay); }

  const coldState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_books'] });
  const coldGate = holdDestination(coldState, publicPath('books'));
  const cold = await openFixture(browser, baseURL!, coldState, { width: 390, height: 900, reducedMotion: 'reduce' });
  try {
    await cold.page.goto(publicPath('books'));
    await expect.poll(() => coldState.destinationWaits.includes(publicPath('books'))).toBe(true);
    const earth = cold.page.getByRole('status', { name: 'Earth loading' });
    await expect(earth).toBeVisible();
    const earthAudit = await earth.evaluate(node => {
      const animations = Array.from(node.querySelectorAll<HTMLElement>('*')).flatMap(element => {
        const style = getComputedStyle(element);
        return style.animationDuration.split(',').map(value => Number.parseFloat(value) * (value.includes('ms') ? 1 : 1000));
      }).filter(Number.isFinite);
      return {
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        maxCssAnimationMs: animations.length ? Math.max(...animations) : 0,
        maxWebAnimationMs: Math.max(0, ...node.getAnimations({ subtree: true }).map(animation => Number(animation.effect?.getTiming().duration ?? 0))),
        overlayZ: Number.parseFloat(getComputedStyle(node.parentElement!).zIndex),
      };
    });
    expect(earthAudit.reduced).toBe(true);
    expect(earthAudit.maxCssAnimationMs).toBeLessThanOrEqual(1);
    expect(earthAudit.maxWebAnimationMs).toBeLessThanOrEqual(1);
    expect(earthAudit.overlayZ).toBe(3000);
    evidence.coldEarth = earthAudit;
    coldGate.release();
    await expectSettledShell(cold.page);
  } finally {
    coldGate.release();
    await closeFixture(cold);
  }
  await test.info().attach('task7-real-overlay-reduced-motion', { contentType: 'application/json', body: JSON.stringify(evidence, null, 2) });
});

test('cold entry covers every top-level destination with one continuous Earth owner', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const evidence: Record<string, unknown> = {};
  for (const destination of PAGE_DESTINATIONS) {
    const state = fixtureState({
      pinned_nav_tabs: destination.id === 'profile'
        ? ['public_profile', 'public_books']
        : ['public_profile', destination.field],
    }, 'public');
    state.account.social_media.theme_settings.footerBranding = 'enabled';
    const path = publicPath(destination.route);
    const gate = holdDestination(state, path);
    const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 900 });
    try {
      await visitor.page.goto(path);
      await expect.poll(() => state.destinationWaits.includes(path)).toBe(true);
      await expect(visitor.page.getByRole('status', { name: 'Earth loading' })).toHaveCount(1);
      await expect(visitor.page.getByRole('banner')).toHaveCount(0);
      await expect(visitor.page.getByRole('navigation', { name: 'Public navigation' })).toHaveCount(0);
      expect(await visitor.page.getByRole('status', { name: 'Earth loading' }).count()).toBe(1);
      gate.release();
      await expectSettledShell(visitor.page);
      await expect(visitor.page.getByRole('navigation', { name: 'Public navigation' })
        .getByRole('link', { name: destination.label, exact: true })).toHaveAttribute('aria-current', 'page');
      evidence[destination.id] = { path, waits: state.destinationWaits.filter(value => value === path).length };
    } finally {
      gate.release();
      await closeFixture(visitor);
    }
  }
  await test.info().attach('task7-cold-entry-destinations', { contentType: 'application/json', body: JSON.stringify(evidence, null, 2) });
});

test('same-profile continuity covers every destination and first trusted post-click rAF is active', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const evidence: Record<string, unknown> = {};
  for (const destination of PAGE_DESTINATIONS) {
    const source = destination.id === 'profile' ? 'books' : '';
    const state = fixtureState({
      pinned_nav_tabs: destination.id === 'profile'
        ? ['public_profile', 'public_books']
        : ['public_profile', destination.field],
    }, 'public');
    state.account.social_media.theme_settings.footerBranding = 'enabled';
    const destinationPath = publicPath(destination.route);
    const sourcePath = publicPath(source);
    const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 900 });
    let gate: ReturnType<typeof holdDestination> | undefined;
    try {
      await visitor.page.goto(sourcePath);
      await expectSettledShell(visitor.page);
      gate = holdDestination(state, destinationPath);
      await beginFrameRecorder(visitor.page);
      await visitor.page.getByRole('navigation', { name: 'Public navigation' })
        .getByRole('link', { name: destination.label, exact: true }).click();
      await expect(visitor.page).toHaveURL(`${baseURL}${destinationPath}`);
      await expect.poll(() => state.destinationWaits.includes(destinationPath)).toBe(true);
      await expect.poll(async () => (await readFrameRecorder(visitor.page)).postActivation.length).toBeGreaterThan(0);
      const held = await readFrameRecorder(visitor.page);
      expect(held.clickTrusted).toBe(true);
      expect(held.postActivation[0].pathname).toBe(destinationPath);
      expect(held.postActivation[0].activeHref?.split('?')[0]).toBe(destinationPath);
      expect(warmFrameFailures(held.postActivation, destinationPath)).toEqual([]);
      gate.release();
      gate = undefined;
      await expectSettledShell(visitor.page);
      const completed = await finishFrameRecorder(visitor.page);
      expect(warmFrameFailures(completed.postActivation, destinationPath)).toEqual([]);

      const returnLabel = destination.id === 'profile' ? 'Books' : 'Profile';
      const returnPath = destination.id === 'profile' ? publicPath('books') : publicPath();
      await visitor.page.getByRole('navigation', { name: 'Public navigation' })
        .getByRole('link', { name: returnLabel, exact: true }).click();
      await expect(visitor.page).toHaveURL(`${baseURL}${returnPath}`);
      await expectSettledShell(visitor.page);
      evidence[destination.id] = { heldFrames: held.postActivation.length, totalFrames: completed.postActivation.length, first: held.postActivation[0] };
    } finally {
      gate?.release();
      await closeFixture(visitor);
    }
  }
  await test.info().attach('task7-warm-destination-frames', { contentType: 'application/json', body: JSON.stringify(evidence, null, 2) });
});

test('routing history, canonical username, redirects, attribution, and identity isolation stay truthful', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name !== 'chromium', 'Expanded routing matrix runs in contained Chromium.');
  const state = fixtureState({
    public_products: 'No',
    pinned_nav_tabs: ['public_profile', 'public_books'],
  }, 'public');
  state.account.social_media.theme_settings.footerBranding = 'enabled';
  const secondAccount = structuredClone(state.account);
  secondAccount.documentId = 'browser-account-b';
  secondAccount.username = 'fixture-friend';
  secondAccount.Account_Name = 'Fixture Friend';
  secondAccount.social_media.theme_settings = { ...secondAccount.social_media.theme_settings, preset: 'neon-cyber' };
  state.alternateAccounts.set(secondAccount.username, secondAccount);
  const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 900 });
  try {
    await visitor.page.goto(`/${fixtureUser.username.toUpperCase()}/books?utm_source=Task7&ignored=secret#matrix`);
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}/books?utm_source=Task7&ignored=secret#matrix`);
    await expectSettledShell(visitor.page);

    await visitor.page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Profile', exact: true }).click();
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}`);
    await visitor.page.goBack();
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}/books?utm_source=Task7&ignored=secret#matrix`);
    await expectSettledShell(visitor.page);
    await visitor.page.goForward();
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}`);
    await expectSettledShell(visitor.page);

    await visitor.page.evaluate(() => {
      history.pushState({ samePath: 1 }, '', `${location.pathname}?utm_campaign=same-path#same`);
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}?utm_campaign=same-path#same`);
    await expectSettledShell(visitor.page);
    await visitor.page.goBack();
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}`);
    await visitor.page.goForward();
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}?utm_campaign=same-path#same`);
    await expectSettledShell(visitor.page);

    await visitor.page.evaluate(() => {
      history.pushState({}, '', `${location.pathname}?utm_medium=search-only`);
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}?utm_medium=search-only`);
    await expectSettledShell(visitor.page);
    await visitor.page.evaluate(() => { location.hash = 'profile-footer'; });
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}?utm_medium=search-only#profile-footer`);
    await expectSettledShell(visitor.page);

    await visitor.page.goto(`/${fixtureUser.username}/products?utm_source=hidden#preserved`);
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}?utm_source=hidden#preserved`);
    await expectSettledShell(visitor.page);
    await visitor.page.goto(`/${fixtureUser.username}/not-a-route?utm_campaign=invalid#kept`);
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}?utm_campaign=invalid#kept`);
    await expectSettledShell(visitor.page);

    await visitor.page.goto(`/${fixtureUser.username}`);
    await expect(visitor.page.locator('[data-public-profile-chrome]')).toHaveAttribute('data-theme-preset', 'minimal-light');
    const identityGate = holdDestination(state, '/fixture-friend/books');
    await visitor.page.evaluate(() => {
      history.pushState({}, '', '/fixture-friend/books');
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });
    await expect.poll(() => state.destinationWaits.includes('/fixture-friend/books')).toBe(true);
    await expect(visitor.page.getByRole('status', { name: 'Earth loading' })).toHaveCount(1);
    await expect(visitor.page.getByText('Fixture Explorer', { exact: true })).toHaveCount(0);
    identityGate.release();
    await expect(visitor.page).toHaveURL(`${baseURL}/fixture-friend/books`);
    await expect(visitor.page.locator('[data-public-profile-chrome]')).toHaveAttribute('data-theme-preset', 'neon-cyber');
    await expect(visitor.page.getByText('Fixture Explorer', { exact: true })).toHaveCount(0);
    await expectSettledShell(visitor.page);
  } finally {
    await closeFixture(visitor);
  }
});

test('ordered five-tab cycle and map chrome exception retain unique shell ownership', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name !== 'chromium', 'Expanded navigation matrix runs in contained Chromium.');
  const state = fixtureState({
    pinned_nav_tabs: ['public_profile', 'public_recommendations', 'public_books', 'public_apps', 'public_movie'],
  }, 'public');
  state.account.social_media.theme_settings.footerBranding = 'enabled';
  const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 900 });
  try {
    await visitor.page.goto(publicPath());
    for (const destination of [
      { label: 'Places', route: 'places' },
      { label: 'Books', route: 'books' },
      { label: 'Apps', route: 'apps' },
      { label: 'Movies', route: 'movies' },
      { label: 'Profile', route: '' },
    ]) {
      const link = visitor.page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: destination.label, exact: true });
      await link.click();
      await expect(visitor.page).toHaveURL(`${baseURL}${publicPath(destination.route)}`);
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expectSettledShell(visitor.page);
    }
    await visitor.page.goto(publicPath('places/map'));
    await expect(visitor.page.getByRole('heading', { name: /Map Unavailable|Failed to Load Map|No Data Available/ })).toBeVisible();
    await expectSettledShell(visitor.page, { map: true, footer: false });
  } finally {
    await closeFixture(visitor);
  }
});

test('cache empty error retry and partial states retain the real shell and safe content', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name !== 'chromium', 'Expanded content-state matrix runs in contained Chromium.');
  const evidence: Record<string, unknown> = {};

  const warmState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_apps'] }, 'public');
  seedRenderableApp(warmState);
  const warm = await openFixture(browser, baseURL!, warmState, { width: 390, height: 900 });
  try {
    await warm.page.goto(publicPath());
    await expect(warm.page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
    await warm.page.evaluate(async data => {
      const { PUBLIC_APP_DATA } = await import('/src/features/AppsAndTools/api/query.ts');
      (window as any).__APOLLO_CLIENT__.cache.writeQuery({
        query: PUBLIC_APP_DATA,
        variables: { accountDocumentId: 'browser-account' },
        data,
      });
    }, {
      appLists: [{
        __typename: 'AppList', documentId: 'apps-list', List_Name: 'Public apps', list_description: null,
        slug: 'public-apps', cover_image: null, top_apps_heading: null,
        recommended_apps: warmState.lists.appLists[0].recommended_apps,
      }],
      recommendedApps: [],
    });
    let releaseWarm!: () => void;
    warmState.faults.set('PublicAppData', [{ gate: new Promise<void>(resolve => { releaseWarm = resolve; }) }]);
    const readsBeforeWarm = warmState.reads.filter(read => read.name === 'PublicAppData').length;
    await beginFrameRecorder(warm.page);
    await warm.page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Apps', exact: true }).click();
    await expect.poll(() => warmState.reads.filter(read => read.name === 'PublicAppData').length).toBe(readsBeforeWarm + 1);
    await expect(warm.page.getByText('Public apps', { exact: true })).toBeVisible();
    await expect(warm.page.locator('[aria-busy="true"]').first()).toBeVisible();
    const held = await readFrameRecorder(warm.page);
    expect(warmFrameFailures(held.postActivation, publicPath('apps'))).toEqual([]);
    releaseWarm();
    await expect(warm.page.locator('[aria-busy="true"]')).toHaveCount(0);
    evidence.warmCache = await finishFrameRecorder(warm.page);
  } finally { await closeFixture(warm); }

  const emptyState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_apps'] });
  emptyState.lists.appLists = [];
  const empty = await openFixture(browser, baseURL!, emptyState, { width: 390, height: 900 });
  try {
    await empty.page.goto(publicPath('apps'));
    await expect(empty.page.getByText('No apps shared yet', { exact: true })).toBeVisible();
    await expectSettledShell(empty.page);
    evidence.empty = 'No apps shared yet';
  } finally { await closeFixture(empty); }

  const errorState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_apps'] });
  seedRenderableApp(errorState);
  errorState.faults.set('PublicAppData', [{ kind: 'error' }]);
  const error = await openFixture(browser, baseURL!, errorState, { width: 390, height: 900 });
  try {
    await error.page.goto(publicPath('apps'));
    await expect(error.page.getByRole('heading', { name: 'Apps unavailable' })).toBeVisible();
    await expect(error.page.getByText('Contained fixture failure', { exact: true })).toHaveCount(0);
    await expectSettledShell(error.page);
    await error.page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(error.page.getByText('Public apps', { exact: true })).toBeVisible();
    await expectSettledShell(error.page);
    evidence.errorRetry = 'recovered';
  } finally { await closeFixture(error); }

  const partialState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_apps'] });
  seedRenderableApp(partialState);
  partialState.faults.set('PublicAppData', [{ kind: 'partial' }]);
  const partial = await openFixture(browser, baseURL!, partialState, { width: 390, height: 900 });
  try {
    await partial.page.goto(publicPath('apps'));
    await expect(partial.page.getByText('Public apps', { exact: true })).toBeVisible();
    await expect(partial.page.getByText('Some app data is unavailable.', { exact: true })).toBeVisible();
    await expectSettledShell(partial.page);
    evidence.partial = 'safe app retained';
  } finally { await closeFixture(partial); }

  await test.info().attach('task7-content-states', { contentType: 'application/json', body: JSON.stringify(evidence, null, 2) });
});

test('share fallback copies one canonical bounded URL without external traffic', async ({ browser, baseURL }) => {
  const state = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_books'] });
  const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 900 });
  await visitor.context.addInitScript(() => {
    Object.defineProperty(window, '__task7Copies', { configurable: true, value: [], writable: true });
    Object.defineProperty(navigator, 'share', { configurable: true, get: () => undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => (window as any).__task7Copies.push(value) },
    });
  });
  try {
    await visitor.page.goto(`${publicPath('books')}?utm_source=qr&access=secret&utm_medium=email#hidden`);
    await visitor.page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect.poll(() => visitor.page.evaluate(() => (window as any).__task7Copies)).toEqual([
      `${baseURL}${publicPath('books')}?utm_source=qr&utm_medium=email`,
    ]);
    await expectSettledShell(visitor.page);
  } finally { await closeFixture(visitor); }
});

test('deterministic cold and in-shell transitions meet route-state frame and CLS budgets', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name !== 'chromium', 'Deterministic experience sampling runs in contained Chromium.');
  test.setTimeout(360_000);
  const coldRunCount = Number.parseInt(process.env.TASK7_TIMING_COLD_RUNS ?? '20', 10);
  const warmRunCount = Number.parseInt(process.env.TASK7_TIMING_WARM_RUNS ?? '20', 10);
  const coldRouteOnly = process.env.TASK7_TIMING_COLD_ROUTE;
  type TimingSample = {
    run: number;
    width: number;
    destination: string;
    navigationMs: number;
    routeStateMs: number | null;
    cls: number;
    frameCount: number;
    badFrameCount: number;
    theme: string;
    coldShellHidden?: boolean;
    accessibleEarthMax?: number;
    revealedShellSafe?: boolean;
    shellHitTargetsWin?: boolean;
    gateTimings?: { firstEarth: number | null; lastEarth: number | null; firstChrome: number | null; firstActive: number | null };
    shifts?: Array<{
      value: number;
      startTime: number;
      hadRecentInput: boolean;
      sources: Array<{
        selector: string;
        previousRect: { x: number; y: number; width: number; height: number };
        currentRect: { x: number; y: number; width: number; height: number };
      }>;
    }>;
  };
  const evidence: Record<string, { cold: TimingSample[]; warm: TimingSample[]; summary?: unknown }> = {};

  for (const width of [390, 1440] as const) {
    const cold: TimingSample[] = [];
    for (let run = 0; run < coldRunCount; run += 1) {
      const destination = coldRouteOnly === 'books' || run % 2 === 0
        ? { route: 'books', label: 'Books' }
        : { route: '', label: 'Profile' };
      const destinationPath = publicPath(destination.route);
      const state = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_books'] }, 'public');
      const visitor = await openFixture(browser, baseURL!, state, { width, height: 900 });
      try {
        await visitor.context.addInitScript(() => {
          const recorder = {
            cls: 0,
            frames: 0,
            firstChrome: null as number | null,
            firstActive: null as number | null,
            firstEarth: null as number | null,
            lastEarth: null as number | null,
            accessibleEarthMax: 0,
            coldShellHidden: false,
            shifts: [] as NonNullable<TimingSample['shifts']>,
            stop: false,
          };
          (window as any).__task7ColdTiming = recorder;
          try {
            const observer = new PerformanceObserver(list => {
              for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
                if (!entry.hadRecentInput) {
                  recorder.cls += entry.value ?? 0;
                  recorder.shifts.push({
                    value: entry.value ?? 0,
                    startTime: entry.startTime,
                    hadRecentInput: Boolean(entry.hadRecentInput),
                    sources: ((entry as any).sources ?? []).map((source: any) => {
                      const node = source.node as HTMLElement | null;
                      const rect = (value: DOMRectReadOnly) => ({ x: value.x, y: value.y, width: value.width, height: value.height });
                      return {
                        selector: node ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.className ? `.${String(node.className).trim().replace(/\s+/g, '.')}` : ''}` : 'unknown',
                        previousRect: rect(source.previousRect),
                        currentRect: rect(source.currentRect),
                      };
                    }),
                  });
                }
              }
            });
            observer.observe({ type: 'layout-shift', buffered: true });
            (recorder as any).observer = observer;
          } catch { /* The cold CLS gate is Chromium-only. */ }
          const sample = (time: number) => {
            recorder.frames += 1;
            const banner = document.querySelectorAll('[role="banner"], header').length;
            const nav = document.querySelector('nav[aria-label="Public navigation"]');
            const content = document.querySelector('[data-public-content-layer]');
            const earth = Array.from(document.querySelectorAll<HTMLElement>('[role="status"][aria-label="Earth loading"]'))
              .filter(element => !element.closest('[aria-hidden="true"]') && getComputedStyle(element).visibility !== 'hidden').length;
            recorder.accessibleEarthMax = Math.max(recorder.accessibleEarthMax, earth);
            if (earth > 0 && recorder.firstEarth === null) recorder.firstEarth = time;
            if (earth > 0) recorder.lastEarth = time;
            const coldShell = document.querySelector<HTMLElement>('[data-testid="public-cold-entry-shell"]');
            if (earth === 1 && coldShell?.getAttribute('aria-hidden') === 'true' && coldShell.hasAttribute('inert')
              && getComputedStyle(coldShell).visibility === 'hidden') recorder.coldShellHidden = true;
            if (recorder.firstChrome === null && banner === 1 && nav && (content?.children.length ?? 0) > 0) recorder.firstChrome = time;
            const activeHref = nav?.querySelector('a[aria-current="page"]')?.getAttribute('href')?.split('?')[0] ?? null;
            if (recorder.firstChrome !== null && recorder.firstActive === null && activeHref === location.pathname) recorder.firstActive = time;
            if (!recorder.stop) requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        await visitor.page.goto(destinationPath);
        await expectSettledShell(visitor.page);
        await expect(visitor.page.getByRole('navigation', { name: 'Public navigation' })
          .getByRole('link', { name: destination.label, exact: true })).toHaveAttribute('aria-current', 'page');
        const measured = await visitor.page.evaluate(() => {
          const recorder = (window as any).__task7ColdTiming;
          const shell = document.querySelector<HTMLElement>('[data-testid="public-cold-entry-shell"]')!;
          const shellStyle = getComputedStyle(shell);
          const share = document.querySelector<HTMLElement>('.public-brand-action')!;
          const shareBounds = share.getBoundingClientRect();
          const shareHit = document.elementFromPoint(shareBounds.left + shareBounds.width / 2, shareBounds.top + shareBounds.height / 2);
          recorder.stop = true;
          recorder.observer?.disconnect();
          return {
            navigationMs: performance.now(),
            routeStateMs: recorder.firstChrome === null || recorder.firstActive === null
              ? null
              : recorder.firstActive - recorder.firstChrome,
            cls: recorder.cls as number,
            frameCount: recorder.frames as number,
            coldShellHidden: recorder.coldShellHidden,
            accessibleEarthMax: recorder.accessibleEarthMax,
            revealedShellSafe: !shell.hasAttribute('aria-hidden')
              && !shell.hasAttribute('inert')
              && shellStyle.visibility === 'visible'
              && document.querySelectorAll('[data-testid="public-cold-entry-overlay"]').length === 0
              && document.documentElement.scrollWidth <= innerWidth,
            shellHitTargetsWin: shareHit === share || Boolean(shareHit && share.contains(shareHit)),
            gateTimings: {
              firstEarth: recorder.firstEarth,
              lastEarth: recorder.lastEarth,
              firstChrome: recorder.firstChrome,
              firstActive: recorder.firstActive,
            },
            shifts: recorder.shifts,
          };
        });
        cold.push({ run: run + 1, width, destination: destinationPath, theme: 'minimal-light', ...measured, badFrameCount: 0 });
      } finally {
        await closeFixture(visitor);
      }
    }

    const warm: TimingSample[] = [];
    const warmState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_books'] }, 'public');
    const visitor = await openFixture(browser, baseURL!, warmState, { width, height: 900 });
    try {
      await visitor.page.goto(publicPath());
      await expectSettledShell(visitor.page);
      for (let run = 0; run < warmRunCount; run += 1) {
        const destination = run % 2 === 0 ? { route: 'books', label: 'Books' } : { route: '', label: 'Profile' };
        const destinationPath = publicPath(destination.route);
        await beginFrameRecorder(visitor.page);
        const link = visitor.page.getByRole('navigation', { name: 'Public navigation' })
          .getByRole('link', { name: destination.label, exact: true });
        await link.click();
        await expect(visitor.page).toHaveURL(`${baseURL}${destinationPath}`);
        await expect(link).toHaveAttribute('aria-current', 'page');
        await expectSettledShell(visitor.page);
        const measured = await finishFrameRecorder(visitor.page);
        const firstActive = measured.postActivation.find(frame => frame.activeHref?.split('?')[0] === destinationPath);
        const lastFrame = measured.postActivation.at(-1);
        const failures = warmFrameFailures(measured.postActivation, destinationPath);
        warm.push({
          run: run + 1,
          width,
          destination: destinationPath,
          theme: 'minimal-light',
          navigationMs: measured.clickTime === null || !lastFrame ? 0 : lastFrame.time - measured.clickTime,
          routeStateMs: measured.clickTime === null || !firstActive ? null : firstActive.time - measured.clickTime,
          cls: measured.cls,
          frameCount: measured.postActivation.length,
          badFrameCount: failures.length,
        });
      }
    } finally {
      await closeFixture(visitor);
    }

    const summarize = (samples: TimingSample[]) => ({
      count: samples.length,
      navigationMs: {
        p50: percentile(samples.map(sample => sample.navigationMs), 0.5),
        p95: percentile(samples.map(sample => sample.navigationMs), 0.95),
        max: Math.max(...samples.map(sample => sample.navigationMs)),
      },
      routeStateMs: {
        p50: percentile(samples.map(sample => sample.routeStateMs ?? Number.POSITIVE_INFINITY), 0.5),
        p95: percentile(samples.map(sample => sample.routeStateMs ?? Number.POSITIVE_INFINITY), 0.95),
        max: Math.max(...samples.map(sample => sample.routeStateMs ?? Number.POSITIVE_INFINITY)),
      },
      cls: {
        p50: percentile(samples.map(sample => sample.cls), 0.5),
        p95: percentile(samples.map(sample => sample.cls), 0.95),
        max: Math.max(...samples.map(sample => sample.cls)),
      },
      badFrames: samples.reduce((total, sample) => total + sample.badFrameCount, 0),
    });
    evidence[String(width)] = { cold, warm, summary: { cold: summarize(cold), warm: summarize(warm) } };
  }

  await test.info().attach('task7-timing-cls-raw', {
    contentType: 'application/json',
    body: JSON.stringify(evidence, null, 2),
  });
  for (const result of Object.values(evidence)) {
    for (const sample of [...result.cold, ...result.warm]) {
      expect(sample.routeStateMs, `${sample.width}px ${sample.destination} run ${sample.run}: missing route state`).not.toBeNull();
      expect(sample.routeStateMs!, `${sample.width}px ${sample.destination} run ${sample.run}: route-state latency`).toBeLessThanOrEqual(100);
      expect(sample.cls, `${sample.width}px ${sample.destination} run ${sample.run}: CLS`).toBeLessThan(0.1);
    }
    expect(result.cold.every(sample => sample.coldShellHidden)).toBe(true);
    expect(result.cold.every(sample => sample.accessibleEarthMax === 1)).toBe(true);
    expect(result.cold.every(sample => sample.revealedShellSafe)).toBe(true);
    expect(result.cold.every(sample => sample.shellHitTargetsWin)).toBe(true);
    expect(result.cold).toHaveLength(coldRunCount);
    expect(result.warm).toHaveLength(warmRunCount);
    expect(result.warm.reduce((total, sample) => total + sample.badFrameCount, 0)).toBe(0);
  }
  console.info(`[task7-timing-cls] ${JSON.stringify(Object.fromEntries(Object.entries(evidence).map(([width, result]) => [width, result.summary])))}`);
});
