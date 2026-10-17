import { expect, test } from '@playwright/test';
import { categories, closeFixture, openFixture as openContainedFixture } from './setup/category-navigation';
import { assertCategoryKeyboardFocus, assertCategoryTokens, assertCompositedContrast, mediaFamilies, seedCategoryThemeState } from './setup/public-category-themes';

async function openFixture(...args: Parameters<typeof openContainedFixture>) {
  const visitor = await openContainedFixture(...args);
  await visitor.context.route(url => url.origin === new URL(args[1]).origin && url.pathname === '/e2e/setup/category-theme-maps-fixture.tsx', route => route.continue());
  await visitor.context.route(url => url.origin === new URL(args[1]).origin && url.pathname === '/images/category-theme-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#203040"/></svg>' }));
  return visitor;
}

const colorExpect = expect.configure({ soft: true, timeout: 1000 });

test('map adapter allowance preserves wrong-origin and unknown-module denial', async ({ browser, baseURL }) => {
  const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'));
  try {
    await visitor.page.goto('/fixture-owner');
    // Top-level navigation reaches the route boundary even when page CSP blocks cross-origin fetch.
    await visitor.page.goto('https://wrong-origin.invalid/e2e/setup/category-theme-maps-fixture.tsx').catch(() => undefined);
    await visitor.page.goto('/fixture-owner');
    await visitor.page.evaluate(async () => { await fetch('/e2e/setup/not-allowed.tsx').catch(() => undefined); });
    expect(visitor.guard.denied).toEqual(['GET external wrong-origin.invalid', 'GET /e2e/setup/not-allowed.tsx']);
    await test.info().attach('expected-containment-denials', { contentType: 'application/json', body: JSON.stringify(visitor.guard.denied) });
  } finally { await visitor.context.close(); }
});

const themes = {
  // closeHover is the independent Chromium oracle for the category-text/category-card
  // srgb mix declared by the theme contract (2% text for emerald, 8% otherwise).
  'minimal-light': { page: 'rgb(248, 250, 252)', text: 'rgb(15, 23, 42)', muted: 'rgb(71, 85, 105)', card: 'rgb(255, 255, 255)', panel: 'rgb(255, 255, 255)', border: 'rgb(226, 232, 240)', closeHover: 'color(srgb 0.924706 0.927216 0.933177)' },
  'cinematic-dark': { page: 'rgb(9, 13, 22)', text: 'rgb(255, 255, 255)', muted: 'rgb(156, 163, 175)', card: 'rgb(17, 24, 39)', panel: 'rgb(17, 24, 39)', border: 'rgba(255, 255, 255, 0.1)', closeHover: 'color(srgb 0.141333 0.166588 0.220706)' },
  glassmorphism: { page: 'rgb(15, 23, 42)', text: 'rgb(255, 255, 255)', muted: 'rgb(148, 163, 184)', card: 'rgba(255, 255, 255, 0.07)', panel: 'rgb(15, 23, 42)', border: 'rgba(255, 255, 255, 0.2)', closeHover: 'color(srgb 1 1 1 / 0.144941)' },
  'sunset-glow': { page: 'rgb(26, 11, 46)', text: 'rgb(255, 255, 255)', muted: 'rgb(233, 213, 255)', card: 'rgb(45, 18, 77)', panel: 'rgb(45, 18, 77)', border: 'rgb(59, 23, 102)', closeHover: 'color(srgb 0.242353 0.144941 0.357804)' },
  'emerald-nature': { page: 'rgb(6, 78, 59)', text: 'rgb(255, 255, 255)', muted: 'rgb(209, 250, 229)', card: 'rgb(4, 120, 87)', panel: 'rgb(6, 78, 59)', border: 'rgba(255, 255, 255, 0.15)', closeHover: 'color(srgb 0.0353725 0.481176 0.354353)' },
  'neon-cyber': { page: 'rgb(3, 7, 18)', text: 'rgb(255, 255, 255)', muted: 'rgb(252, 165, 165)', card: 'rgb(17, 24, 39)', panel: 'rgb(17, 24, 39)', border: 'rgb(244, 63, 94)', closeHover: 'color(srgb 0.141333 0.166588 0.220706)' },
} as const;
const names = { movies: 'Movie', books: 'Book', games: 'Game', apps: 'App', products: 'Product', people: 'Person' };
const derived = { movies: 'genre/drama', books: 'subject/fiction', games: 'genre/adventure', people: 'sector/design' };
const stateContracts = {
  places: ['PublicPlacesData', 'Places', 'No Places Yet', 'place', 'Destination 1'],
  guides: ['PublicGuidesData', 'Guides', 'No Guides Yet', 'guide', 'Public guides'],
  movies: ['PublicMoviesData', 'Movies', 'No movies shared yet', 'movie', 'Movie 2'],
  books: ['PublicBooksData', 'Books', 'No books yet', 'book', 'Book 2'],
  games: ['PublicGamesData', 'Games', 'No games shared yet', 'game', 'Game 2'],
  apps: ['PublicAppData', 'Apps', 'No apps shared yet', 'app', 'App 2'],
  products: ['PublicProductsData', 'Products', 'No products shared yet', 'product', 'Product 2'],
  people: ['PublicPeopleData', 'People', 'No people shared yet', 'people', 'Person 2'],
} as const;

test('visible journey description decodes entities as inert text', async ({ browser, baseURL }, info) => {
  const viewport = info.project.use.viewport!;
  const state = seedCategoryThemeState('minimal-light');
  state.lists.guides[0].Description = [{
    children: [{ text: 'A&nbsp;focused &#160;walk &amp; food &lt;script&gt;unsafe&lt;/script&gt;' }],
  }];
  const visitor = await openFixture(browser, baseURL!, state, { ...viewport, touch: info.project.name === 'mobile', reducedMotion: 'reduce' });
  const { page } = visitor;
  try {
    await page.goto('/fixture-owner/guides/public-guides');
    expect(page.viewportSize()).toEqual(viewport);
    await expect(page.getByText('About This Journey', { exact: true })).toBeVisible();
    const description = page.getByText('A focused walk & food <script>unsafe</script>', { exact: true });
    await expect(description).toBeVisible();
    expect(await description.textContent()).not.toContain('&nbsp;');
    await expect(description.locator('script')).toHaveCount(0);
  } finally { await closeFixture(visitor); }
});

// Catch ordinary Places list navigation regressing to decorative accent ink.
for (const [preset, colors] of Object.entries(themes)) {
  test(`places ${preset} See All and hovered list title keep ordinary text ink`, async ({ browser, baseURL }, info) => {
    const viewport = info.project.use.viewport!;
    const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState(preset as keyof typeof themes), { ...viewport, touch: info.project.name === 'mobile', reducedMotion: 'reduce' });
    const { page } = visitor;
    try {
      await page.goto('/fixture-owner/places');
      expect(page.viewportSize()).toEqual(viewport);
      const title = page.getByRole('heading', { name: 'Destination 1', exact: true }).filter({ has: page.locator('svg') });
      const seeAll = title.locator('xpath=../..').getByRole('button', { name: 'See All ➔', exact: true });
      await expect(title).toBeVisible();
      await expect(seeAll).toBeVisible();

      await colorExpect(seeAll).toHaveCSS('color', colors.text);
      const seeAllRest = await assertCompositedContrast(seeAll, 4.5);
      await seeAll.hover();
      await seeAll.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
      await colorExpect(seeAll).toHaveCSS('color', colors.text);
      const seeAllHover = await assertCompositedContrast(seeAll, 4.5);

      await title.hover();
      await title.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
      await colorExpect(title).toHaveCSS('color', colors.text);
      const titleHover = await assertCompositedContrast(title, 4.5);

      await seeAll.click();
      await expect(page).toHaveURL(/\/fixture-owner\/places\/city-1$/);
      await expect(page.getByRole('button', { name: 'City 1 place 1', exact: true })).toBeVisible();
      await info.attach('places-ordinary-navigation-contrast', {
        contentType: 'application/json',
        body: JSON.stringify({ preset, viewport, expectedInk: colors.text, seeAllRest, seeAllHover, titleHover, pointerNavigation: true }),
      });
    } finally { await closeFixture(visitor); }
  });
}

// Catch readable day content becoming translucent or losing its artwork caption protection.
// This narrow follow-up is reported separately from the completed frozen 458-case matrix.
for (const preset of ['minimal-light', 'emerald-nature'] as const) {
  test(`settled guides ${preset} visible day text and media scrim`, async ({ browser, baseURL }, info) => {
    const viewport = info.project.use.viewport!;
    const state = seedCategoryThemeState(preset);
    state.lists.guides[0].Description = 'A thoughtful guide with practical details for a relaxed visit. '.repeat(7);
    state.lists.guides[0].Place_Details = { ...state.lists.guides[0].Place_Details, Place_Name: 'Fixture journey city' };
    for (const section of state.lists.guides[0].guide_sections) {
      const places = [...section.Timeline.morning, ...section.Timeline.afternoon, ...section.Timeline.evening];
      section.Recommendation_Activity = { activities: places.map(place => ({ place_id: place.place_id, photos: [{ url: `${baseURL}/images/category-theme-fixture.svg` }] })) };
    }
    const visitor = await openFixture(browser, baseURL!, state, { ...viewport, touch: info.project.name === 'mobile' });
    const { page } = visitor;
    try {
      await page.goto('/fixture-owner/guides');
      await page.getByText('Public guides', { exact: true }).click();
      await expect(page).toHaveURL(/\/guides\/public-guides$/);
      expect(page.viewportSize()).toEqual(viewport);
      await assertCategoryTokens(page, preset);
      for (const day of [1, 2]) {
        const heading = page.getByRole('heading', { level: 2 }).filter({ hasText: `Day ${day}` });
        const caption = page.getByRole('heading', { name: `Guide place ${day}`, exact: true });
        await expect(heading).toBeVisible();
        await heading.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
        for (const target of [heading, caption]) {
          await expect.poll(() => target.evaluate(element => {
            const opacity: string[] = [];
            for (let current: Element | null = element; current; current = current.parentElement) opacity.push(getComputedStyle(current).opacity);
            return opacity.every(value => value === '1');
          }), { message: 'Every day/card ancestor must finish its real opacity animation' }).toBe(true);
        }
        await expect(heading).toBeInViewport();
        await expect(caption).toBeInViewport();
        await expect(heading).toHaveCSS('color', themes[preset].text);
        const dayLabel = heading.getByText(`Day ${day}`, { exact: true });
        const typography = await dayLabel.evaluate(element => { const css = getComputedStyle(element); return { size: parseFloat(css.fontSize), weight: Number(css.fontWeight) }; });
        const dayContrast = await assertCompositedContrast(dayLabel, typography.size >= 18.666 && typography.weight >= 700 ? 3 : 4.5);
        const imageOwner = caption.locator('xpath=../..');
        const artwork = imageOwner.getByRole('img', { name: `Guide place ${day}`, exact: true });
        await expect.poll(() => artwork.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 900)).toBe(true);
        await expect(caption).toHaveCSS('color', 'rgb(255, 255, 255)');
        const scrim = imageOwner.locator(':scope > div').first();
        const gradient = await scrim.evaluate(element => getComputedStyle(element).backgroundImage);
        expect(gradient).toContain('linear-gradient');
        expect(gradient).toContain('rgba(0, 0, 0, 0.9)');
        expect(gradient).toContain('rgba(0, 0, 0, 0.5)');
        // Uniform contained artwork is #203040; a black scrim can only improve white ink contrast.
        const luminance = [32, 48, 64].map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const mediaContrastLowerBound = 1.05 / (luminance + .05);
        expect(mediaContrastLowerBound).toBeGreaterThanOrEqual(4.5);
        await info.attach(`settled-day-${day}`, { contentType: 'application/json', body: JSON.stringify({ viewport, preset, dayContrast, typography, gradient, mediaContrastLowerBound, ancestorOpacity: 1 }) });
        await page.screenshot({ path: info.outputPath(`settled-guide-${preset}-${viewport.width}-day-${day}.png`) });
      }
      const journey = page.locator('[data-public-guide-main-tabs]').getByText('Journey', { exact: true });
      await journey.scrollIntoViewIfNeeded();
      const controlEvidence: Record<string, unknown> = {};
      controlEvidence.journeyRest = await assertCompositedContrast(journey);
      await journey.hover();
      await journey.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
      controlEvidence.journeyHover = await assertCompositedContrast(journey);
      controlEvidence.journeySemantics = await journey.locator('..').evaluate(element => ({ tag: element.tagName, role: element.getAttribute('role'), tabIndex: (element as HTMLElement).tabIndex }));
      const dayControl = page.getByRole('button', { name: 'Day 1', exact: true });
      controlEvidence.dayRest = await assertCompositedContrast(dayControl);
      await dayControl.hover();
      await dayControl.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
      controlEvidence.dayHover = await assertCompositedContrast(dayControl);
      await page.mouse.move(0, 0);
      for (let step = 0; step < 40 && !await dayControl.evaluate(element => element === document.activeElement); step++) await page.keyboard.press('Tab');
      await expect(dayControl).toBeFocused();
      await dayControl.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
      controlEvidence.dayFocus = await assertCompositedContrast(dayControl);
      controlEvidence.dayFocusOutline = await dayControl.evaluate(element => { const style = getComputedStyle(element); return { style: style.outlineStyle, color: style.outlineColor, width: style.outlineWidth }; });
      await expect.soft(dayControl).toHaveCSS('outline-style', 'solid', { timeout: 700 });
      // Inventory only actual rendered ordinary accent-ink consumers, excluding artwork ink.
      controlEvidence.visibleOrdinaryAccentLabels = await page.locator('[data-category-page="guides"]').evaluate(root => Array.from(root.querySelectorAll('*')).filter(element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return element.className?.toString().includes('text-[var(--category-accent,') && [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) && style.visibility === 'visible' && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      }).map(element => { const style = getComputedStyle(element); return { text: element.textContent?.trim(), tag: element.tagName, color: style.color, background: style.backgroundColor, className: element.className }; }));
      await info.attach('guide-control-contrast', { contentType: 'application/json', body: JSON.stringify(controlEvidence) });
      await page.screenshot({ path: info.outputPath(`settled-guide-controls-${preset}-${viewport.width}.png`) });
      const about = page.getByRole('heading', { name: 'About This Journey', exact: true }).locator('span');
      await about.scrollIntoViewIfNeeded();
      const aboutContrast = await assertCompositedContrast(about, 3, { uniformGradientText: true, uniformBackgroundGradients: true });
      const readMore = page.getByRole('button', { name: 'Read More', exact: true });
      const readRest = await assertCompositedContrast(readMore, 4.5, { uniformBackgroundGradients: true });
      await readMore.hover();
      await readMore.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
      const readHover = await assertCompositedContrast(readMore, 4.5, { uniformBackgroundGradients: true });
      await page.mouse.move(0, 0);
      for (let step = 0; step < 40 && !await readMore.evaluate(element => element === document.activeElement); step++) await page.keyboard.press('Tab');
      await expect(readMore).toBeFocused();
      await readMore.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
      const readFocus = await assertCompositedContrast(readMore, 4.5, { uniformBackgroundGradients: true });
      const readFocusOutline = await readMore.evaluate(element => getComputedStyle(element).outlineStyle);
      await expect.soft(readMore).toHaveCSS('outline-style', 'solid', { timeout: 700 });
      await readMore.click();
      const readLess = page.getByRole('button', { name: 'Read Less', exact: true });
      await expect(readLess).toBeVisible();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(readLess).toBeFocused();
      const readLessFocusOutline = await readLess.evaluate(element => getComputedStyle(element).outlineStyle);
      await expect.soft(readLess).toHaveCSS('outline-style', 'solid', { timeout: 700 });
      await dayControl.click();
      const location = page.getByRole('heading', { name: 'Fixture journey city', exact: true }).locator('span');
      await location.scrollIntoViewIfNeeded();
      await expect.poll(() => location.evaluate(element => { for (let current: Element | null = element; current; current = current.parentElement) if (getComputedStyle(current).opacity !== '1') return false; return true; })).toBe(true);
      const locationContrast = await assertCompositedContrast(location, 3, { uniformGradientText: true, uniformBackgroundGradients: true });
      await info.attach('guide-description-selected-day', { contentType: 'application/json', body: JSON.stringify({ aboutContrast, readRest, readHover, readFocus, readFocusOutline, readLessFocusOutline, locationContrast }) });
      await page.screenshot({ path: info.outputPath(`settled-guide-selected-day-${preset}-${viewport.width}.png`) });
    } finally { await closeFixture(visitor); }
  });
}

for (const preset of ['minimal-light', 'emerald-nature'] as const) {
  test(`secondary guides ${preset} reachable tabs and map ordinary controls`, async ({ browser, baseURL }, info) => {
    test.setTimeout(180_000);
    const viewport = info.project.use.viewport!;
    const state = seedCategoryThemeState(preset);
    const guide = state.lists.guides[0], section = guide.guide_sections[0], first = section.Timeline.morning[0];
    guide.Tips_Notes = 'Practical master packing advice for a thoughtful contained journey. '.repeat(9);
    guide.Place_Details = { ...guide.Place_Details, Place_Name: 'Fixture journey city' };
    first.tips = 'Carry a refillable water bottle and allow time for a calm visit. '.repeat(5);
    const second = { ...structuredClone(first), place_id: 'guide-transfer', name: 'Guide transfer', tips: 'Transfer tip.' };
    section.Timeline.morning.push(second);
    section.Transport = { segments: [{ fromPlaceId: first.place_id, toPlaceId: second.place_id, mode: 'walking', duration: '10 minutes', distance: '1 km' }] };
    section.Recommendation_Activity = { activities: [{ place_id: 'fixture-stay', photos: [{ url: `${baseURL}/images/category-theme-fixture.svg` }] }] };
    section.Stay = { accommodations: [{ ...structuredClone(first), place_id: 'fixture-stay', name: 'Fixture accommodation' }] };
    section.Budget = { morning: [{ name: 'Fixture admission', budgetAmount: 100, budgetCurrency: 'INR' }], afternoon: [], evening: [] };
    const visitor = await openFixture(browser, baseURL!, state, { ...viewport, touch: info.project.name === 'mobile' });
    const { page } = visitor;
    const evidence: Record<string, unknown> = {};
    const focus = async (target: ReturnType<typeof page.getByRole>) => {
      for (let step = 0; step < 45 && !await target.evaluate(element => element === document.activeElement); step++) await page.keyboard.press('Tab');
      await expect(target).toBeFocused();
      await expect.soft(target).toHaveCSS('outline-style', 'solid', { timeout: 700 });
      return target.evaluate(element => ({ outline: getComputedStyle(element).outlineStyle, color: getComputedStyle(element).outlineColor }));
    };
    const settled = async (target: ReturnType<typeof page.getByRole>) => {
      await expect(async () => {
        await target.scrollIntoViewIfNeeded();
        expect(await target.evaluate(element => { for (let current: Element | null = element; current; current = current.parentElement) if (getComputedStyle(current).opacity !== '1') return false; return true; })).toBe(true);
      }).toPass({ timeout: 12_000 });
    };
    try {
      await page.goto('/fixture-owner/guides');
      await page.getByText('Public guides', { exact: true }).click();
      for (const tab of ['Transport', 'Stay'] as const) {
        await page.locator('[data-public-guide-main-tabs]').getByText(tab, { exact: true }).click();
        await expect(page.getByText(tab === 'Transport' ? 'Guide transfer' : 'Fixture accommodation', { exact: true }).last()).toBeVisible();
        await page.getByRole('button', { name: 'Overview', exact: true }).click();
        for (const mode of ['overview', 'selected']) {
          if (mode === 'selected') await page.getByRole('button', { name: 'Day 1', exact: true }).click();
          const day = page.getByRole('heading', { level: 2 }).filter({ hasText: 'Day 1' }).locator('span').first();
          await settled(day);
          evidence[`${tab}-${mode}`] = await assertCompositedContrast(day, 3, { uniformGradientText: true, uniformBackgroundGradients: true });
        }
      }
      await page.locator('[data-public-guide-main-tabs]').getByText('Budget', { exact: true }).click();
      await page.getByRole('button', { name: 'Overview', exact: true }).click();
      for (const label of ['Day & Title', 'Place / Activity', 'Amount']) {
        const target = page.getByText(label, { exact: true });
        await settled(target);
        evidence[`Budget-${label}`] = await assertCompositedContrast(target, 4.5, { uniformGradientText: true, uniformBackgroundGradients: true });
      }
      evidence.budgetDayNumber = await assertCompositedContrast(page.locator('[data-category-page="guides"]').getByText('1', { exact: true }));
      await page.locator('[data-public-guide-main-tabs]').getByText('Tips', { exact: true }).click();
      const tipDay = page.getByRole('heading', { level: 2 }).filter({ hasText: 'Day 1' }).getByText('Day 1', { exact: true });
      await settled(tipDay);
      evidence.tipsDay = await assertCompositedContrast(tipDay, 3);
      await expect(page.getByRole('button', { name: 'See More', exact: true })).toHaveCount(2);
      for (const kind of ['master', 'place']) {
        const more = page.getByRole('button', { name: 'See More', exact: true }).first();
        await settled(more);
        const rest = await assertCompositedContrast(more, 4.5, { uniformBackgroundGradients: true });
        await more.hover();
        await more.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
        const hover = await assertCompositedContrast(more, 4.5, { uniformBackgroundGradients: true });
        await page.mouse.move(0, 0);
        const outline = await focus(more);
        const focused = await assertCompositedContrast(more, 4.5, { uniformBackgroundGradients: true });
        await more.click();
        const less = page.getByRole('button', { name: 'See Less', exact: true }).last();
        await expect(less).toBeVisible();
        await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        const lessOutline = await focus(less);
        evidence[`Tips-${kind}`] = { rest, hover, focused, outline, lessOutline };
      }
      await info.attach('secondary-guide-tabs', { contentType: 'application/json', body: JSON.stringify(evidence) });
      const mapEntry = page.getByRole('button', { name: 'Map View', exact: true });
      const launcher = page.locator('[data-public-guide-map-launcher]').or(mapEntry.locator('..')).first();
      const delta = await page.evaluate(() => {
        const footer = document.querySelector('[data-public-footer-links]')!.getBoundingClientRect();
        const launcher = (document.querySelector('[data-public-guide-map-launcher]')
          ?? Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Map View')!.parentElement)!.getBoundingClientRect();
        return footer.y + footer.height / 2 - launcher.y - launcher.height / 2;
      });
      await page.evaluate(delta => window.scrollBy({ top: delta, behavior: 'instant' }), delta);
      await expect.poll(() => page.evaluate(async () => {
        const measure = () => {
          const footer = document.querySelector('[data-public-footer-links]')!.getBoundingClientRect();
          const launcher = (document.querySelector('[data-public-guide-map-launcher]')
            ?? Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Map View')!.parentElement)!.getBoundingClientRect();
          return {
            footer: footer.toJSON(),
            launcher: launcher.toJSON(),
            centerDelta: Math.abs(footer.y + footer.height / 2 - launcher.y - launcher.height / 2),
            overlap: Math.min(footer.bottom, launcher.bottom) - Math.max(footer.top, launcher.top),
          };
        };
        const first = measure();
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const second = measure();
        const stable = (['x', 'y', 'width', 'height'] as const).every(key =>
          Math.abs(first.footer[key] - second.footer[key]) <= 0.5
          && Math.abs(first.launcher[key] - second.launcher[key]) <= 0.5);
        return stable && second.centerDelta <= 2 && second.overlap > 0;
      }), { message: 'Footer and launcher rectangles must settle with aligned centers and positive overlap' }).toBe(true);
      const collision = await launcher.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { rect: rect.toJSON(), centerDelta: Math.abs(document.querySelector('[data-public-footer-links]')!.getBoundingClientRect().y + document.querySelector('[data-public-footer-links]')!.getBoundingClientRect().height / 2 - rect.y - rect.height / 2), overlap: Math.min(document.querySelector('[data-public-footer-links]')!.getBoundingClientRect().bottom, rect.bottom) - Math.max(document.querySelector('[data-public-footer-links]')!.getBoundingClientRect().top, rect.top), center: center?.outerHTML, ownsCenter: element.contains(center) };
      });
      expect(collision.centerDelta, JSON.stringify(collision)).toBeLessThanOrEqual(2);
      expect(collision.overlap, JSON.stringify(collision)).toBeGreaterThan(0);
      expect(collision.ownsCenter, JSON.stringify(collision)).toBe(true);
      await info.attach('footer-aligned-map-launcher', { contentType: 'application/json', body: JSON.stringify(collision) });
      await mapEntry.click();
      const mapRoot = page.locator('[data-public-guide-map-surface]');
      await expect(mapRoot).toBeVisible();
      const map = mapRoot.locator('#guide-map-container');
      await expect(map).toBeVisible();
      const normalTray = map.locator('[data-public-guide-map-tray]');
      const normalCollapse = normalTray.getByRole('button', { name: 'Collapse cards', exact: true });
      evidence.mapCollapseFocus = await focus(normalCollapse);
      await normalCollapse.click();
      const transitionDurations = await normalTray.evaluate(element => element.getAnimations().map(animation => animation.effect?.getTiming().duration));
      expect(transitionDurations).toContain(300);
      await expect.poll(() => normalTray.evaluate(element => {
        const transform = getComputedStyle(element).transform;
        return (transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform)).m42 > 0
          && element.getAnimations().every(animation => animation.playState === 'finished');
      })).toBe(true);
      await normalTray.getByRole('button', { name: 'Expand cards', exact: true }).click();
      await expect.poll(() => normalTray.evaluate(element => {
        const transform = getComputedStyle(element).transform;
        return Math.abs((transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform)).m42) < 1
          && element.getAnimations().every(animation => animation.playState === 'finished');
      })).toBe(true);
      evidence.mapExpandFocus = await focus(map.getByRole('button', { name: 'Expand map', exact: true }));
      // The deterministic local adapter deliberately shares one anchor; use its exposed last marker.
      const marker = map.locator('[data-map-marker]').last();
      await info.attach('map-marker-reachability', { contentType: 'application/json', body: JSON.stringify(await marker.evaluate(element => ({ rect: element.getBoundingClientRect().toJSON(), html: element.outerHTML }))) });
      await marker.click();
      const link = map.getByRole('link', { name: 'View on Google Maps', exact: true });
      await expect(link).toBeVisible();
      evidence.mapLink = await assertCompositedContrast(link);
      await link.hover();
      await link.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
      evidence.mapLinkHover = await assertCompositedContrast(link);
      evidence.mapLinkFocusOutline = await focus(link);
      evidence.mapLinkFocus = await assertCompositedContrast(link);
      evidence.mapCloseFocus = await focus(map.getByRole('button', { name: 'Close', exact: true }));
      await map.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(link).toHaveCount(0);
      await mapRoot.getByRole('button', { name: 'List View', exact: true }).click();
      await expect(mapRoot).toHaveCount(0);
      await expect(page.locator('[data-public-guide-map-launcher]')).toBeVisible();
      const privacy = page.getByRole('link', { name: 'Privacy', exact: true });
      await privacy.scrollIntoViewIfNeeded();
      await privacy.click();
      await expect(page).toHaveURL(/\/privacy$/);
    } finally {
      await info.attach('secondary-guide-final', { contentType: 'application/json', body: JSON.stringify(evidence) });
      await closeFixture(visitor);
    }
  });
}

test('@once guide control geometry direct navigation loading and ready', async ({ browser, baseURL }, info) => {
  const evidence: unknown[] = [];
  for (const width of [390, 1440]) {
    for (const safeBottom of [0, 24]) {
      const state = seedCategoryThemeState('minimal-light');
      let release = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; });
      state.faults.set('PublicProfileData', [{ gate }]);
      const visitor = await openFixture(browser, baseURL!, state, { width, height: 900, touch: width < 500, reducedMotion: 'reduce', safeArea: { bottom: safeBottom } });
      await visitor.context.route(url => url.origin === new URL(baseURL!).origin && ['/e2e/setup/category-theme-portals.html', '/e2e/setup/category-theme-portals.tsx'].includes(url.pathname), route => route.continue());
      try {
        const { page } = visitor;
        await page.goto('/e2e/setup/category-theme-portals.html?component=nav');
        const nav = page.getByRole('navigation', { name: 'Public navigation' });
        await expect(nav).toHaveAttribute('data-public-nav-state', 'loading');
        await expect.poll(() => nav.evaluate(element => element.getBoundingClientRect().height)).toBe(48 + safeBottom);
        const loading = await nav.boundingBox();
        expect(loading!.height).toBe(48 + safeBottom);
        expect(Math.abs(900 - (loading!.y + loading!.height) - (width >= 768 ? 8 : 0))).toBeLessThanOrEqual(0.5);
        expect(await nav.evaluate(element => getComputedStyle(element).zIndex)).toBe('80');
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--public-safe-bottom').trim())).toBe(`${safeBottom}px`);

        release();
        await expect(nav).toHaveAttribute('data-public-nav-state', 'ready');
        await expect(nav.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
        await expect.poll(() => nav.evaluate(element => element.getBoundingClientRect().height)).toBe(48 + safeBottom);
        const ready = await nav.boundingBox();
        const readyStyles = await nav.evaluate(element => ({
          fontSize: getComputedStyle(document.documentElement).fontSize,
          paddingTop: getComputedStyle(element).paddingTop,
          paddingBottom: getComputedStyle(element).paddingBottom,
          inlineStyle: element.getAttribute('style'),
          rowHeight: (element.firstElementChild as HTMLElement).getBoundingClientRect().height,
          rowClass: element.firstElementChild?.className,
          boxSizing: getComputedStyle(element).boxSizing,
          borderTop: getComputedStyle(element).borderTopWidth,
          borderBottom: getComputedStyle(element).borderBottomWidth,
          offsetHeight: (element as HTMLElement).offsetHeight,
          clientHeight: (element as HTMLElement).clientHeight,
          scrollHeight: (element as HTMLElement).scrollHeight,
          rowRect: element.firstElementChild?.getBoundingClientRect().toJSON(),
          controlRects: Array.from(element.firstElementChild?.children ?? []).map(child => child.getBoundingClientRect().toJSON()),
        }));
        expect(ready!.height, JSON.stringify({ ready, readyStyles })).toBe(48 + safeBottom);
        expect(Math.abs(900 - (ready!.y + ready!.height) - (width >= 768 ? 8 : 0))).toBeLessThanOrEqual(0.5);
        evidence.push({ width, safeBottom, loading, ready });
      } finally {
        release();
        await closeFixture(visitor);
      }
    }
  }
  await info.attach('direct-nav-geometry', { contentType: 'application/json', body: JSON.stringify(evidence) });
});

for (const scenario of [
  { preset: 'minimal-light', width: 320, safeBottom: 0, safeTop: 0 },
  { preset: 'cinematic-dark', width: 320, safeBottom: 24, safeTop: 24 },
  { preset: 'cinematic-dark', width: 390, safeBottom: 0, safeTop: 0 },
  { preset: 'minimal-light', width: 390, safeBottom: 24, safeTop: 24 },
  { preset: 'minimal-light', width: 768, safeBottom: 24, safeTop: 24 },
  { preset: 'minimal-light', width: 1440, safeBottom: 0, safeTop: 0 },
  { preset: 'cinematic-dark', width: 1440, safeBottom: 24, safeTop: 24 },
  { preset: 'cinematic-dark', width: 768, safeBottom: 0, safeTop: 0 },
] as const) {
  test(`@once guide control geometry ${scenario.preset} ${scenario.width} safe${scenario.safeBottom}`, async ({ browser, baseURL }, info) => {
    const state = seedCategoryThemeState(scenario.preset);
    const visitor = await openFixture(browser, baseURL!, state, { width: scenario.width, height: 900, touch: scenario.width < 500, reducedMotion: 'reduce', safeArea: { top: scenario.safeTop, bottom: scenario.safeBottom } });
    const { page } = visitor;
    try {
      await visitor.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL! });
      await page.addInitScript(({ safeTop }) => {
        const install = () => {
          const style = document.createElement('style');
          style.dataset.guideControlSafeTop = 'true';
          style.textContent = `:root, [data-public-profile-chrome], [data-public-guide-map-surface], [data-public-guide-map-portal] { --public-safe-top: ${safeTop}px !important; }`;
          (document.head || document.documentElement).append(style);
        };
        if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install, { once: true });
        else install();
      }, { safeTop: scenario.safeTop });
      await page.goto('/fixture-owner/guides/public-guides');
      const shell = page.locator('[data-public-profile-chrome]');
      const launcher = page.locator('[data-public-guide-map-launcher]');
      const mapEntry = launcher.getByRole('button', { name: 'Map View', exact: true });
      await expect(launcher).toBeVisible();
      expect(await launcher.evaluate(element => element.parentElement === document.body)).toBe(true);
      expect(await launcher.evaluate(element => getComputedStyle(element).zIndex)).toBe('40');
      expect(await shell.evaluate(element => getComputedStyle(element).isolation)).toBe('auto');
      const launcherHit = await launcher.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { rect: rect.toJSON(), ownsCenter: element.contains(hit) };
      });
      expect(launcherHit.ownsCenter).toBe(true);
      await mapEntry.click();

      const mapRoot = page.locator('[data-public-guide-map-surface]');
      await expect(mapRoot).toBeVisible();
      await expect(launcher).toHaveCount(0);
      expect(await mapRoot.evaluate(element => element.parentElement === document.body)).toBe(true);
      const layers = await page.evaluate(() => ({
        map: getComputedStyle(document.querySelector('[data-public-guide-map-surface]')!).zIndex,
        nav: getComputedStyle(document.querySelector('[data-public-nav-state]')!).zIndex,
        header: getComputedStyle(document.querySelector('.public-brand-header')!).zIndex,
        shellIsolation: getComputedStyle(document.querySelector('[data-public-profile-chrome]')!).isolation,
      }));
      expect(layers).toEqual({ map: '40', nav: '80', header: '90', shellIsolation: 'auto' });
      await expect(mapRoot).toHaveCSS('background-color', themes[scenario.preset].page);

      const tray = mapRoot.locator('[data-public-guide-map-tray]').first();
      const collapse = tray.getByRole('button', { name: 'Collapse cards', exact: true });
      await collapse.click();
      const expand = tray.getByRole('button', { name: 'Expand cards', exact: true });
      await expect.poll(() => tray.evaluate(element => {
        const transform = getComputedStyle(element).transform;
        const matrix = transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform);
        return element.getAnimations().every(animation => animation.playState === 'finished') && matrix.m42 > 0;
      })).toBe(true);
      const nav = page.getByRole('navigation', { name: 'Public navigation' });
      const geometry = await expand.evaluate((element, navElement) => {
        const rect = element.getBoundingClientRect();
        const navRect = (navElement as Element).getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { rect: rect.toJSON(), nav: navRect.toJSON(), ownsCenter: element.contains(hit), centerWinner: hit?.outerHTML };
      }, await nav.elementHandle());
      expect(geometry.rect.width).toBeGreaterThanOrEqual(44);
      expect(geometry.rect.height).toBeGreaterThanOrEqual(44);
      expect(geometry.rect.bottom).toBeLessThanOrEqual(geometry.nav.top - 8);
      expect(geometry.ownsCenter, JSON.stringify(geometry)).toBe(true);
      const listView = mapRoot.getByRole('button', { name: 'List View', exact: true }).first();
      const independentControls = await page.evaluate(({ toggleSelector, listText }) => {
        const toggle = document.querySelector(toggleSelector)!;
        const list = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === listText)!;
        const toggleRect = toggle.getBoundingClientRect(), listRect = list.getBoundingClientRect();
        const toggleHit = document.elementFromPoint(toggleRect.x + toggleRect.width / 2, toggleRect.y + toggleRect.height / 2);
        const listHit = document.elementFromPoint(listRect.x + listRect.width / 2, listRect.y + listRect.height / 2);
        const horizontalGap = Math.max(toggleRect.left, listRect.left) - Math.min(toggleRect.right, listRect.right);
        const verticalGap = Math.max(toggleRect.top, listRect.top) - Math.min(toggleRect.bottom, listRect.bottom);
        return { toggle: toggleRect.toJSON(), list: listRect.toJSON(), toggleOwnsCenter: toggle.contains(toggleHit), listOwnsCenter: list.contains(listHit), separation: Math.max(horizontalGap, verticalGap) };
      }, { toggleSelector: '[data-public-guide-map-tray] button[aria-label="Expand cards"]', listText: 'List View' });
      expect(independentControls.toggleOwnsCenter).toBe(true);
      expect(independentControls.listOwnsCenter).toBe(true);
      expect(independentControls.separation).toBeGreaterThan(0);
      expect(independentControls.list.bottom).toBeLessThanOrEqual(geometry.nav.top - 8);
      expect(independentControls.list.width).toBeGreaterThanOrEqual(44);
      expect(independentControls.list.height).toBeGreaterThanOrEqual(44);
      await listView.hover();
      const rail = tray.locator('[data-public-guide-map-card-rail]');
      await expect(rail).toHaveAttribute('aria-hidden', 'true');
      await expect(rail).toHaveAttribute('inert', '');
      await expect(rail).toHaveCSS('visibility', 'hidden');
      const cardHit = await rail.locator('.white-theme').first().evaluate(element => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return element.contains(hit);
      });
      expect(cardHit).toBe(false);
      await expand.focus();
      await page.keyboard.press('Tab');
      expect(await rail.evaluate(element => !element.contains(document.activeElement))).toBe(true);
      await expand.click();
      await expect.poll(() => tray.evaluate(element => {
        const transform = getComputedStyle(element).transform;
        const matrix = transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform);
        return element.getAnimations().every(animation => animation.playState === 'finished') && Math.abs(matrix.m42) < 1;
      })).toBe(true);
      await expect(rail).toHaveAttribute('aria-hidden', 'false');
      await expect(rail).not.toHaveAttribute('inert');
      await expect(rail).toHaveCSS('visibility', 'visible');

      const fullscreen = mapRoot.getByRole('button', { name: 'Expand map', exact: true });
      const fullscreenHit = await fullscreen.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { rect: rect.toJSON(), ownsCenter: element.contains(hit), centerWinner: hit?.outerHTML, winnerRect: hit?.getBoundingClientRect().toJSON() };
      });
      expect(fullscreenHit.ownsCenter, JSON.stringify(fullscreenHit)).toBe(true);
      const enteredHeaderGeometry = await page.evaluate(() => ({
        header: document.querySelector('.public-brand-header')!.getBoundingClientRect().toJSON(),
        share: document.querySelector('.public-brand-action')!.getBoundingClientRect().toJSON(),
        toggle: document.querySelector('button[aria-label="Expand map"]')!.getBoundingClientRect().toJSON(),
        safeTop: getComputedStyle(document.querySelector('[data-public-guide-map-surface]')!).getPropertyValue('--public-safe-top').trim(),
        reserved: getComputedStyle(document.querySelector('[data-public-guide-map-surface]')!).getPropertyValue('--public-header-reserved-offset').trim(),
      }));
      expect(enteredHeaderGeometry.toggle.top).toBeGreaterThanOrEqual(enteredHeaderGeometry.header.bottom + 16);
      expect(enteredHeaderGeometry.safeTop).toBe(`${scenario.safeTop}px`);
      expect(enteredHeaderGeometry.reserved).toBe(`calc(${scenario.safeTop}px + 80px)`);
      await fullscreen.click();
      const nested = page.locator('[data-public-guide-map-portal]');
      await expect(nested).toBeVisible();
      expect(await nested.evaluate(element => element.parentElement === document.body)).toBe(true);
      expect(await nested.evaluate(element => getComputedStyle(element).zIndex)).toBe('40');
      expect(await nested.evaluate(element => getComputedStyle(element).getPropertyValue('--public-safe-top').trim())).toBe(`${scenario.safeTop}px`);
      const share = page.getByRole('button', { name: 'Share', exact: true });
      await share.click();
      await expect(page.getByText('Link copied!', { exact: true })).toBeVisible();
      await nested.getByRole('button', { name: 'List View', exact: true }).click();
      await expect(mapRoot).toHaveCount(0);
      await expect(nested).toHaveCount(0);
      await expect(launcher).toBeVisible();
      await nav.getByRole('link', { name: 'Profile', exact: true }).click();
      await expect(page).toHaveURL(/\/fixture-owner$/);
      await expect(page.locator('[data-public-guide-map-launcher], [data-public-guide-map-surface]')).toHaveCount(0);
      await expect(shell).toHaveCSS('isolation', 'isolate');
      await info.attach('guide-control-geometry', { contentType: 'application/json', body: JSON.stringify({ scenario, launcherHit, layers, geometry }) });
    } finally {
      await closeFixture(visitor);
    }
  });
}

test('@once guide control geometry entered map keeps Profile navigation ordinarily clickable', async ({ browser, baseURL }, info) => {
  const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'), { width: 390, height: 900, touch: true, reducedMotion: 'reduce' });
  const { page } = visitor;
  try {
    await page.goto('/fixture-owner/guides/public-guides');
    await page.locator('[data-public-guide-map-launcher]').getByRole('button', { name: 'Map View', exact: true }).click();
    const mapRoot = page.locator('[data-public-guide-map-surface]');
    await expect(mapRoot).toBeVisible();
    expect(await mapRoot.evaluate(element => element.parentElement === document.body && getComputedStyle(element).position === 'fixed')).toBe(true);

    const profile = page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Profile', exact: true });
    const profileHit = await profile.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const winner = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { rect: rect.toJSON(), ownsCenter: element.contains(winner), winner: winner?.outerHTML };
    });
    expect(profileHit.ownsCenter, JSON.stringify(profileHit)).toBe(true);
    await profile.click();
    await expect(page).toHaveURL(/\/fixture-owner$/);
    await expect(page.getByRole('tablist', { name: 'Profile sections' })).toBeVisible();
    await expect(page.locator('[data-public-guide-map-launcher], [data-public-guide-map-surface], [data-public-guide-map-portal]')).toHaveCount(0);
    await info.attach('entered-map-profile-navigation', { contentType: 'application/json', body: JSON.stringify(profileHit) });
  } finally {
    await closeFixture(visitor);
  }
});

for (const preset of ['minimal-light', 'cinematic-dark'] as const) {
  test(`review fix1 places ${preset} selected count pairs and filled hover`, async ({ browser, baseURL }, info) => {
    const reviewExpect = expect.configure({ soft: true, timeout: 700 });
    const state = seedCategoryThemeState(preset);
    state.lists.guides[0].Guide_Type = 'Adventure';
    state.lists.guides.push({
      ...structuredClone(state.lists.guides[0]),
      documentId: 'guides-list-filtered-out',
      slug: 'relaxed-guide',
      Title: 'Relaxed guide',
      Guide_Type: 'Relaxed',
    });
    const visitor = await openFixture(browser, baseURL!, state, { ...info.project.use.viewport!, touch: info.project.name === 'mobile', reducedMotion: 'reduce' });
    const { page } = visitor;
    const readable = async (control: ReturnType<typeof page.getByRole>) => {
      const pair = await control.evaluate(element => {
        const style = getComputedStyle(element);
        const rgb = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(channel => value.startsWith('color(srgb ') ? channel * 255 : channel);
        const luminance = (values: number[]) => values.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const fg = luminance(rgb(style.color)), bg = luminance(rgb(style.backgroundColor));
        return { color: style.color, background: style.backgroundColor, ratio: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) };
      });
      reviewExpect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(4.5);
      return pair;
    };
    try {
      await page.goto('/fixture-owner/places/city-1');
      const places = page.getByRole('button', { name: /^Places\s+\d+$/ });
      await expect(places).toBeVisible();
      const pill = places.locator('span');
      await reviewExpect(pill).toHaveCSS('color', themes[preset].text);
      await readable(pill);
      await places.locator('..').getByRole('button', { name: 'People', exact: true }).click();
      await reviewExpect(pill).toHaveCSS('color', themes[preset].muted);
      await readable(pill);
      await places.click();
      const map = page.getByRole('button', { name: 'Map View', exact: true });
      await map.hover();
      await reviewExpect(map).toHaveCSS('background-color', preset === 'minimal-light' ? 'rgb(15, 23, 42)' : 'rgb(16, 185, 129)');
      await readable(map);
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto('/fixture-owner/guides');
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      const filterDialog = page.getByRole('dialog', { name: 'Guide filters', exact: true });
      await expect(filterDialog).toBeVisible();
      await filterDialog.locator('select').first().selectOption('Adventure');
      await expect(page.getByText('Relaxed guide', { exact: true })).toHaveCount(0);
      await expect(page.getByText('1 of 2 guides', { exact: true })).toBeVisible();
      const apply = page.getByRole('button', { name: 'Apply Filters', exact: true });
      await expect(apply).toBeVisible();
      expect((await apply.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      let centerHoverFailure: unknown;
      try {
        await apply.hover();
      } catch (error) {
        centerHoverFailure = error;
        const hit = await apply.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const edge = { x: 10, y: 3 };
          return { rect: rect.toJSON(), centerTarget: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.outerHTML, edge, edgeIsControl: element.contains(document.elementFromPoint(rect.x + edge.x, rect.y + edge.y)) };
        });
        await info.attach('apply-center-hover-obstruction', { contentType: 'application/json', body: JSON.stringify(hit) });
        await info.attach('apply-center-hover-screenshot', { contentType: 'image/png', body: await page.screenshot() });
        expect(hit.edgeIsControl).toBe(true);
        await apply.hover({ position: hit.edge });
      }
      await reviewExpect(apply).toHaveCSS('background-color', preset === 'minimal-light' ? 'rgb(15, 23, 42)' : 'rgb(16, 185, 129)');
      const applyPair = await readable(apply);
      await info.attach('independent-apply-hover-palette', { contentType: 'application/json', body: JSON.stringify(applyPair) });
      await apply.click();
      await expect(filterDialog).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
      await expect(page.getByText('1 of 2 guides', { exact: true })).toBeVisible();
      if (centerHoverFailure) throw centerHoverFailure;
    } finally { await closeFixture(visitor); }
  });
}

for (const preset of ['minimal-light', 'cinematic-dark'] as const) {
  test(`places ${preset} disabled phone glyph and action boundary`, async ({ browser, baseURL }, info) => {
    for (const enabled of [false]) {
      const state = seedCategoryThemeState(preset);
      state.lists.recommendationLists[0].recommended_places[0].Contact_Number = enabled ? '123456' : '';
      const visitor = await openFixture(browser, baseURL!, state, { ...info.project.use.viewport!, touch: info.project.name === 'mobile' });
      try {
        await visitor.page.goto('/fixture-owner/places/city-1');
        await visitor.page.getByRole('button', { name: 'City 1 place 1', exact: true }).click();
        const phone = visitor.page.locator('[data-public-place-detail]').getByText('Call', { exact: true }).locator('xpath=../button');
        await expect(phone).toBeDisabled();
        await colorExpect(phone.locator('svg path')).toHaveCSS('fill', themes[preset].text);
        await colorExpect(phone).toHaveCSS('border-top-color', preset === 'minimal-light' ? 'rgb(100, 116, 139)' : 'rgb(156, 163, 175)');
      } finally { await closeFixture(visitor); }
    }
  });
  for (const family of ['places', 'guides'] as const) {
    test(`${family} ${preset} minimal and disabled footer modes`, async ({ browser, baseURL }, info) => {
      for (const footerBranding of ['minimal', 'disabled']) {
        const state = seedCategoryThemeState(preset);
        state.account.social_media.theme_settings.footerBranding = footerBranding;
        const visitor = await openFixture(browser, baseURL!, state, { ...info.project.use.viewport!, touch: info.project.name === 'mobile' });
        try {
          await visitor.page.goto(`/fixture-owner/${family}`);
          await expect(visitor.page.getByText(family === 'places' ? 'Destination 1' : 'Public guides', { exact: true }).last()).toBeVisible();
          const footer = visitor.page.getByRole('contentinfo');
          await expect(footer).toHaveCount(footerBranding === 'disabled' ? 0 : 1);
          if (footerBranding === 'minimal') {
            await expect(footer).toHaveCSS('background-color', themes[preset].page);
            await expect(footer.getByRole('link', { name: 'Privacy', exact: true })).toHaveCount(0);
          }
        } finally { await closeFixture(visitor); }
      }
    });
  }
}

for (const preset of ['minimal-light', 'cinematic-dark'] as const) {
  for (const route of ['places/map', 'places/city-1/placesmap']) {
    test(`places ${route} ${preset} unavailable map fallback`, async ({ browser, baseURL }, info) => {
      const viewport = info.project.use.viewport!;
      const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState(preset), { ...viewport, touch: info.project.name === 'mobile' });
      await visitor.context.addInitScript(() => { (globalThis as any).__categoryMapUnavailable = true; });
      try {
        await visitor.page.goto(`/fixture-owner/${route}`);
        const title = visitor.page.getByRole('heading', { name: 'Map Unavailable', exact: true });
        await expect(title).toBeVisible();
        await colorExpect(title).toHaveCSS('color', themes[preset].text);
        await colorExpect(title.locator('xpath=following-sibling::p[1]')).toHaveCSS('color', themes[preset].muted);
        await expect(visitor.page.locator('[data-category-theme-map]')).toHaveCount(0);
      } finally { await closeFixture(visitor); }
    });
  }
  test(`guides ${preset} day nested Google place and detail tabs`, async ({ browser, baseURL }, info) => {
    const viewport = info.project.use.viewport!;
    const state = seedCategoryThemeState(preset);
    const section = state.lists.guides[0].guide_sections[0];
    const first = section.Timeline.morning[0];
    const second = { ...structuredClone(first), place_id: 'guide-transfer', name: 'Guide transfer' };
    first.tips = 'Carry a refillable water bottle.';
    section.Timeline.morning.push(second);
    section.Transport = { segments: [{ fromPlaceId: first.place_id, toPlaceId: second.place_id, mode: 'walking', duration: '10 minutes', distance: '1 km' }] };
    section.Recommendation_Activity = { activities: [{ place_id: 'fixture-stay', photos: [{ url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600"%3E%3Crect width="800" height="600" fill="%23203040"/%3E%3C/svg%3E' }] }] };
    section.Stay = { accommodations: [{ ...structuredClone(first), place_id: 'fixture-stay', name: 'Fixture accommodation' }] };
    section.Budget = { morning: [{ name: 'Fixture admission', budgetAmount: 100, budgetCurrency: 'INR' }], afternoon: [], evening: [] };
    const visitor = await openFixture(browser, baseURL!, state, { ...viewport, touch: info.project.name === 'mobile', reducedMotion: 'reduce' });
    const { page } = visitor;
    await visitor.context.addInitScript(() => {
      // Synthetic coordinates only; no browser/account permission is granted.
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: 26.9124, longitude: 75.7873, accuracy: 1 } } as GeolocationPosition) } });
    });
    try {
      await page.goto('/fixture-owner/guides/public-guides');
      const artworkTitle = page.getByRole('heading', { name: 'Guide place 1', exact: true });
      await expect(artworkTitle).toBeVisible();
      await expect(artworkTitle).toHaveCSS('color', 'rgb(255, 255, 255)');
      await artworkTitle.click();
      const panel = page.locator('[data-category-google-place]');
      await expect(panel).toBeVisible();
      await colorExpect(panel).toHaveCSS('background-color', themes[preset].panel);
      await colorExpect(panel.getByRole('heading', { name: 'Guide place 1', exact: true })).toHaveCSS('color', themes[preset].text);
      for (const name of ['Overview', 'Media', 'Address']) {
        const tab = panel.getByRole('button', { name, exact: true });
        for (let index = 0; index < 20 && !await tab.evaluate(element => element === document.activeElement); index++) await page.keyboard.press('Tab');
        await expect(tab).toBeFocused();
        await colorExpect(tab).toHaveCSS('outline-style', 'solid');
        await colorExpect(tab).toHaveCSS('outline-color', preset === 'minimal-light' ? 'rgb(15, 23, 42)' : 'rgb(16, 185, 129)');
        await colorExpect(tab).toHaveCSS('transform', 'none');
      }
      await panel.getByRole('button', { name: 'Media', exact: true }).click();
      await colorExpect(panel.getByText('No media available', { exact: true })).toHaveCSS('color', themes[preset].muted);
      await panel.getByRole('button', { name: 'Address', exact: true }).click();
      await colorExpect(panel.getByRole('link', { name: 'Fixture City', exact: true })).toHaveCSS('color', themes[preset].text);
      await panel.getByRole('button').first().click();
      await expect(panel).toHaveCount(0);
      for (const [tab, text] of [['Transport', 'Guide transfer'], ['Stay', 'Fixture accommodation'], ['Budget', 'Fixture admission'], ['Tips', 'Carry a refillable water bottle.']]) {
        await page.locator('[data-public-guide-main-tabs]').getByText(tab, { exact: true }).click();
        const message = page.getByText(text, { exact: true }).last();
        await expect(message).toBeVisible();
        await colorExpect(message).toHaveCSS('color', tab === 'Stay' ? 'rgb(255, 255, 255)' : ['Tips', 'Budget'].includes(tab) ? themes[preset].muted : themes[preset].text);
      }
    } finally { await closeFixture(visitor); }
  });
}

for (const preset of ['minimal-light', 'cinematic-dark'] as const) {
  for (const family of Object.keys(stateContracts) as (keyof typeof stateContracts)[]) {
    for (const scenario of ['loading', 'empty', 'error', 'partial', 'retry', 'all-null'] as const) {
      test(`${family} ${preset} ${scenario} state palette`, async ({ browser, baseURL }, info) => {
        const viewport = info.project.use.viewport!;
        const state = seedCategoryThemeState(preset);
        const target = categories.find(category => category.route === family)!;
        const [readKey, navLabel, emptyText, singular, populatedText] = stateContracts[family];
        const media = family !== 'places' && family !== 'guides';
        state.lists.recommendationLists = state.lists.recommendationLists.slice(0, 1);
        if (scenario === 'empty') state.lists[target.root] = [];
        if (scenario === 'error' || scenario === 'retry') state.faults.set(readKey, [{ kind: 'error', status: 503 }, { kind: 'error', status: 503 }]);
        if (scenario === 'partial' || scenario === 'all-null') state.faults.set(readKey, [{ kind: 'partial', nullRootPage: scenario === 'all-null' }, { kind: 'partial', nullRootPage: scenario === 'all-null' }]);
        let release = () => {};
        if (scenario === 'loading') {
          for (const category of categories) state.account[category.field] = category.field === target.field ? 'Yes' : 'No';
          state.account.auto_pinning = false;
          state.account.pinned_nav_tabs = ['public_profile', target.field];
          Object.assign(state.account.social_media.theme_settings, { landingTab: 'gallery', visibleTabs: { recommendations: false, gallery: true, business: false } });
          const gate = new Promise<void>(resolve => { release = resolve; });
          state.faults.set(readKey, Array.from({ length: 4 }, () => ({ gate })));
        }
        const visitor = await openFixture(browser, baseURL!, state, { ...viewport, touch: info.project.name === 'mobile', reducedMotion: 'reduce' });
        const { page } = visitor;
        try {
          expect(page.viewportSize()).toEqual(viewport);
          if (scenario === 'loading') {
            await page.goto('/fixture-owner');
            await expect(page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: navLabel, exact: true })).toBeVisible();
            await expect.poll(() => state.reads.filter(read => read.name === readKey).length).toBeGreaterThan(0);
            await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: navLabel, exact: true }).click();
            await expect(page.locator(media ? '[data-category-page][aria-busy="true"], [data-category-page] [aria-busy="true"]' : `[data-category-page="${family}"][aria-busy="true"]`)).toBeVisible();
            const skeleton = page.locator(media ? '[data-category-page] [class*="category-skeleton"]' : '.skeleton-card').filter({ visible: true }).first();
            await expect(skeleton).toBeVisible();
            if (!media) await colorExpect(skeleton).toHaveCSS('background-color', themes[preset].card);
            else {
              const pixel = await skeleton.evaluate(element => {
                const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
                const context = canvas.getContext('2d')!; context.fillStyle = getComputedStyle(element).backgroundColor; context.fillRect(0, 0, 1, 1);
                return Array.from(context.getImageData(0, 0, 1, 1).data);
              });
              expect.soft(pixel).toEqual(preset === 'minimal-light' ? [220, 223, 227, 255] : [39, 42, 50, 255]);
            }
          } else {
            await page.goto(`/fixture-owner/${family}`);
            if (scenario === 'empty') {
              const heading = page.getByText(emptyText, { exact: true });
              await expect(heading).toBeVisible();
              await colorExpect(heading).toHaveCSS('color', media ? themes[preset].muted : themes[preset].text);
              await assertCompositedContrast(heading);
            } else if (scenario === 'partial') {
              await expect(page.getByRole('status').filter({ hasText: `Some ${singular} data is unavailable.` })).toBeVisible();
              await assertCompositedContrast(page.getByRole('status').filter({ hasText: `Some ${singular} data is unavailable.` }));
              await expect(page.getByText(populatedText, { exact: true }).last()).toBeVisible();
            } else {
              const heading = page.getByRole('heading', { name: `${family[0].toUpperCase()}${family.slice(1)} unavailable`, exact: true });
              await expect(heading).toBeVisible();
              await colorExpect(heading).toHaveCSS('color', themes[preset].text);
              await assertCompositedContrast(heading);
              const retry = page.getByRole('button', { name: 'Retry', exact: true });
              for (let step = 0; step < 30 && !await retry.evaluate(element => element === document.activeElement); step++) await page.keyboard.press('Tab');
              await expect(retry).toBeFocused();
              await colorExpect(retry).toHaveCSS('outline-style', 'solid');
              await assertCompositedContrast(retry);
              if (scenario === 'retry') {
                const before = state.reads.filter(read => read.name === readKey).length;
                state.faults.set(readKey, []);
                await page.getByRole('button', { name: 'Retry', exact: true }).click();
                await expect(heading).toHaveCount(0);
                await expect(page.getByText(populatedText, { exact: true }).last()).toBeVisible();
                expect(state.reads.filter(read => read.name === readKey).length).toBeGreaterThan(before);
              }
            }
          }
          expect(await page.evaluate(() => innerWidth)).toBe(viewport.width);
          await colorExpect(page.locator(media ? '[data-category-page]' : `[data-category-page="${family}"]`)).toHaveCSS('background-color', themes[preset].page);
          await expect(page.locator('[data-public-profile-chrome]')).toHaveAttribute('data-theme-preset', preset);
          await assertCategoryTokens(page, preset);
          for (const other of Object.keys(stateContracts) as (keyof typeof stateContracts)[]) if (other !== family) await expect(page.getByText(stateContracts[other][4], { exact: true })).toHaveCount(0);
          await expect(page.locator('[data-profile-wallpaper], [data-profile-hero-backdrop], [data-music-cover]')).toHaveCount(0);
          await info.attach('state-case', { contentType: 'application/json', body: JSON.stringify({ route: `/fixture-owner/${family}`, preset, scenario, readKey, viewport, reads: state.reads.filter(read => read.name === readKey).length }) });
        } finally { release(); await closeFixture(visitor); }
      });
    }
  }
}

for (const preset of ['minimal-light', 'cinematic-dark'] as const) {
  for (const route of ['places/map', 'places/city-1/placesmap', 'guides/public-guides']) {
    test(`portal ${route} ${preset} loaded adapter controls and config`, async ({ browser, baseURL }, info) => {
      const viewport = info.project.use.viewport!;
      const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState(preset), { ...viewport, touch: info.project.name === 'mobile', reducedMotion: 'reduce' });
      const { page } = visitor;
      try {
        await page.goto(`/fixture-owner/${route}`);
        expect(page.viewportSize()).toEqual(viewport);
        expect(await page.evaluate(() => innerWidth)).toBe(viewport.width);
        const isGuide = route.startsWith('guides');
        if (isGuide) await page.getByRole('button', { name: 'Map View', exact: true }).click();
        const map = page.locator('[data-category-theme-map]').last();
        await expect(map).toBeVisible();
        const config = JSON.parse((await map.getAttribute('data-map-options'))!);
        expect(config).toMatchObject({ mapId: isGuide ? 'guide-map' : 'mapView', gestureHandling: 'greedy', ...(isGuide ? { disableDefaultUI: false } : { fullscreenControl: false, scrollwheel: true }) });
        expect(await map.locator('[data-map-marker]').count()).toBeGreaterThanOrEqual(2);
        expect(await map.evaluate((element: HTMLElement) => ({ height: element.style.height, width: element.style.width }))).toEqual({ height: '100vh', width: '100%' });
        const selected = page.getByRole('button', { name: route === 'places/map' ? 'All Regions' : 'All', exact: true }).first();
        await colorExpect(selected).toHaveCSS('background-color', preset === 'minimal-light' ? 'rgb(15, 23, 42)' : 'rgb(16, 185, 129)');
        if (isGuide) {
          await expect(page.locator('#guide-map-container').getByRole('button', { name: 'Day 1', exact: true })).toBeVisible();
          await expect(page.locator('#guide-map-container').getByRole('button', { name: 'Day 2', exact: true })).toBeVisible();
          const day = page.locator('#guide-map-container').getByRole('button', { name: 'Day 1', exact: true });
          await day.click();
          await colorExpect(day).toHaveCSS('background-color', preset === 'minimal-light' ? 'rgb(15, 23, 42)' : 'rgb(16, 185, 129)');
          await selected.click();
          await page.getByRole('button', { name: 'Expand map', exact: true }).click();
          const portal = page.locator('[data-public-guide-map-portal]');
          await expect(portal).toBeVisible();
          await portal.getByRole('button', { name: 'Collapse cards', exact: true }).click();
          let trayExpandFailure: unknown;
          const expandCards = portal.getByRole('button', { name: 'Expand cards', exact: true });
          try {
            await expandCards.click();
          } catch (error) {
            // Keep this pointer obstruction failed, but independently exercise reachable List View close.
            trayExpandFailure = error;
            const hit = await expandCards.evaluate(element => {
              const rect = element.getBoundingClientRect();
              const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
              return { rect: rect.toJSON(), target: target?.outerHTML, navigation: target?.closest('nav')?.outerHTML };
            });
            await info.attach('tray-expand-hit-target', { contentType: 'application/json', body: JSON.stringify(hit) });
            await info.attach('tray-expand-obstruction', { contentType: 'image/png', body: await page.screenshot() });
          }
          await colorExpect(portal).toHaveCSS('background-color', themes[preset].page);
          expect(await portal.evaluate((element: HTMLElement) => ({ parent: element.parentElement === document.body, width: element.style.width, height: element.style.height, page: element.style.getPropertyValue('--category-page') }))).toEqual({ parent: true, width: '100vw', height: '100vh', page: preset === 'minimal-light' ? '#F8FAFC' : '#090D16' });
          const close = portal.getByRole('button', { name: 'List View', exact: true });
          expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          await close.click();
          await expect(portal).toHaveCount(0);
          await expect(page.locator('body')).not.toHaveClass(/public-guide-map-portal-open/);
          const calls = await page.evaluate(() => (globalThis as any).__categoryMapCalls.map((call: any) => call.method));
          expect(calls).toContain('fitBounds');
          expect(calls).toContain('Polyline');
          await info.attach('independent-list-view-close', { contentType: 'application/json', body: JSON.stringify({ pointerClose: true, portalRemoved: true, bodyClassRemoved: true }) });
          if (trayExpandFailure) throw trayExpandFailure;
        } else {
          await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'List View', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Cafe', exact: true }).first()).toBeVisible();
          const cafe = page.getByRole('button', { name: 'Cafe', exact: true }).first();
          await cafe.click();
          await colorExpect(cafe).toHaveCSS('background-color', preset === 'minimal-light' ? 'rgb(15, 23, 42)' : 'rgb(16, 185, 129)');
          if (route === 'places/map') {
            await page.getByRole('button', { name: 'Collapse filters and cards', exact: true }).click();
            await page.getByRole('button', { name: 'Expand filters and cards', exact: true }).click();
          }
        }
      } finally { await closeFixture(visitor); }
    });
  }
}

for (const [preset, colors] of Object.entries(themes)) {
  for (const family of ['places', 'guides'] as const) {
    test(`${family} ${preset} root and detail category palette`, async ({ browser, baseURL }, info) => {
      const viewport = info.project.use.viewport!;
      const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState(preset as keyof typeof themes), { ...viewport, touch: info.project.name === 'mobile', reducedMotion: 'reduce' });
      const { page } = visitor;
      try {
        expect(page.viewportSize()).toEqual(viewport);
        await page.goto(`/fixture-owner/${family}`);
        expect(await page.evaluate(() => innerWidth)).toBe(viewport.width);
        const title = page.getByText(family === 'places' ? 'Destination 1' : 'Public guides', { exact: true }).filter({ visible: true }).last();
        await expect(title).toBeVisible();
        await colorExpect(title).toHaveCSS('color', colors.text);
        await assertCategoryTokens(page, preset as keyof typeof themes);
        await assertCompositedContrast(title);
        await assertCategoryKeyboardFocus(page, preset as keyof typeof themes);
        if (family === 'guides') await colorExpect(page.getByRole('heading', { name: 'Travel Guides', exact: true })).toHaveCSS('color', colors.text);
        await colorExpect(page.locator(`[data-category-page="${family}"]`)).toHaveCSS('background-color', colors.page);
        await page.goto(`/fixture-owner/${family}/${family === 'places' ? 'city-1' : 'public-guides'}`);
        if (family === 'places') {
          await expect(page.getByRole('heading', { name: 'Destination 1', exact: true })).toBeVisible();
          await colorExpect(page.getByRole('heading', { name: 'Destination 1', exact: true })).toHaveCSS('color', colors.text);
          const opener = page.getByRole('button', { name: 'City 1 place 1', exact: true });
          await opener.click();
          const overlay = page.getByRole('dialog', { name: 'Place details', exact: true });
          await expect(overlay).toBeFocused();
          await expect.poll(() => overlay.locator(':scope > div').last().evaluate(element => {
            const transform = getComputedStyle(element).transform;
            return Math.abs(transform === 'none' ? 0 : new DOMMatrix(transform).m42);
          })).toBeLessThan(0.01);
          expect(await overlay.evaluate(element => element.parentElement === document.body)).toBe(true);
          await colorExpect(page.locator('[data-public-place-detail]')).toHaveCSS('background-color', colors.panel);
          await colorExpect(page.locator('[data-public-place-detail]').getByRole('heading').first()).toHaveCSS('color', colors.text);
          const close = page.getByRole('button', { name: 'Close place details', exact: true });
          await page.keyboard.press('Tab');
          await expect(close).toBeFocused();
          await colorExpect(close).toHaveCSS('color', colors.text);
          expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
          const restBackground = await close.evaluate(element => getComputedStyle(element).backgroundColor);
          await close.hover();
          await close.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
          const hoverBackground = await close.evaluate(element => getComputedStyle(element).backgroundColor);
          expect(hoverBackground).toBe(colors.closeHover);
          await colorExpect(close).toHaveCSS('color', colors.text);
          const hit = await close.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return { button: rect.toJSON(), hitTag: target?.tagName, hitHeader: Boolean(target?.closest('.public-brand-header')), header: document.querySelector('.public-brand-header')?.getBoundingClientRect().toJSON() };
          });
          await info.attach('place-close-hit-target', { contentType: 'application/json', body: JSON.stringify({ ...hit, restBackground, hoverBackground }) });
          await close.click();
          await expect(page.locator('[data-public-place-detail]')).toHaveCount(0);
          await expect(overlay).toHaveCount(0);
          await expect(opener).toBeFocused();
          await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
        } else {
          await expect(page.getByRole('heading', { name: 'Public guides', exact: true })).toBeVisible();
          await colorExpect(page.locator('[data-category-page="guides"]')).toHaveCSS('background-color', colors.page);
          await colorExpect(page.locator('[data-public-guide-main-tabs]')).toHaveCSS('background-color', colors.page);
          if (viewport.width === 390) {
            await page.getByRole('heading', { name: 'Guide place 1', exact: true }).click();
            const nested = page.locator('[data-category-google-place]');
            await colorExpect(nested).toHaveCSS('background-color', colors.panel);
            await nested.getByRole('button').first().click();
            await expect(nested).toHaveCount(0);
          }
        }
        await page.screenshot({ path: info.outputPath(`${family}-${preset}-${viewport.width}.png`), fullPage: true });
      } finally { await closeFixture(visitor); }
    });
  }
}

for (const [preset, colors] of Object.entries(themes)) {
  for (const family of mediaFamilies) {
    test(`media category ${family} ${preset} root list detail and derived colors`, async ({ browser, baseURL }, info) => {
      const viewport = info.project.use.viewport!;
      const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState(preset as keyof typeof themes), {
        ...viewport, touch: info.project.name === 'mobile', reducedMotion: 'reduce',
      });
      // Test artwork is fulfilled locally; it never calls any image provider.
      await visitor.context.route('**/images/category-theme-fixture.svg', route => route.fulfill({
        contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#203040"/><circle cx="450" cy="240" r="140" fill="#406080"/></svg>',
      }));
      const { page } = visitor;
      try {
        expect(page.viewportSize()).toEqual(viewport);
        await page.goto(`/fixture-owner/${family}`);
        expect(await page.evaluate(() => innerWidth)).toBe(viewport.width);
        await info.attach('actual-viewport', { contentType: 'application/json', body: JSON.stringify(viewport) });
        const list = ['movies', 'books', 'games'].includes(family)
          ? page.getByRole('link', { name: `Public ${family}`, exact: true })
          : page.getByRole('heading', { name: `Public ${family}`, exact: true });
        await expect(list).toBeVisible();
        await assertCategoryTokens(page, preset as keyof typeof themes);
        await assertCompositedContrast(list);
        await assertCategoryKeyboardFocus(page, preset as keyof typeof themes);
        // Removing the owner foreground/page tokens must break these computed-color checks.
        await colorExpect(list).toHaveCSS('color', colors.text);
        await colorExpect(page.locator('[data-public-profile-chrome]')).toHaveCSS('background-color', colors.page);
        const surface = page.locator('div.min-h-screen').filter({ has: list }).last();
        await colorExpect(surface).toHaveCSS('background-color', colors.page);
        const title = page.getByText(`${names[family]} 2`, { exact: true }).last();
        await colorExpect(title).toHaveCSS('color', colors.text);
        await colorExpect(page.getByText('A thoughtful collection', { exact: true }).last()).toHaveCSS('color', colors.muted);
        await assertCompositedContrast(page.getByText('A thoughtful collection', { exact: true }).last());
        const ordinaryCard = family === 'movies' || family === 'games' ? title.locator('xpath=../..') : title.locator('xpath=ancestor::button[1]');
        const expectedWidth = { movies: 144, books: 120, games: viewport.width === 390 ? 130 : 170, apps: 130, products: 140, people: 110 }[family];
        expect.soft((await ordinaryCard.boundingBox())!.width).toBeCloseTo(expectedWidth, 0);
        if (family === 'movies' || family === 'people') await colorExpect(ordinaryCard.locator(':scope > div').first()).toHaveCSS('background-color', colors.card);
        if (family === 'games') {
          const gameSurface = ordinaryCard.getByRole('button', { name: 'Game 2', exact: true }).locator(':scope > div');
          await colorExpect(gameSurface).toHaveCSS('background-color', colors.card);
          await colorExpect(gameSurface).toHaveCSS('border-top-color', colors.border);
        }
        if (family === 'apps' || family === 'products') {
          const card = title.locator('xpath=ancestor::button[1]');
          await colorExpect(card).toHaveCSS('background-color', colors.card);
          await colorExpect(card).toHaveCSS('border-top-color', colors.border);
          const before = await card.boundingBox();
          await card.hover();
          await assertCompositedContrast(title);
          const after = await card.boundingBox();
          expect.soft(after!.width).toBeCloseTo(before!.width, 0);
          expect.soft(after!.height).toBeCloseTo(before!.height, 0);
        }
        await ordinaryCard.hover();
        await assertCompositedContrast(title);
        expect.soft((await ordinaryCard.boundingBox())!.width).toBeCloseTo(expectedWidth, 0);
        const caption = page.getByRole('heading', { name: `${names[family]} 1`, exact: true }).filter({ visible: true }).first();
        await expect(caption).toBeVisible();
        await colorExpect(caption).toHaveCSS('color', 'rgb(255, 255, 255)');
        if (family === 'games') await page.getByRole('button', { name: 'Game 2', exact: true }).click();
        else await title.click();
        const modalTitle = page.getByRole('heading', { name: `${names[family]} 2`, exact: true, level: 2 });
        await expect(modalTitle).toBeVisible();
        await colorExpect(modalTitle).toHaveCSS('color', colors.text);
        const panel = page.locator('[data-category-detail-panel]');
        await colorExpect(panel).toHaveCSS('background-color', colors.panel);
        await assertCompositedContrast(modalTitle);
        await colorExpect(page.getByText('A considered recommendation with useful details.', { exact: true }).filter({ visible: true }).last()).toHaveCSS('color', colors.muted);
        if (viewport.width === 390 || ['minimal-light', 'cinematic-dark'].includes(preset)) {
          // Movies/Books/Games/Products use the existing unlabeled first header button for onClose.
          const close = ['apps', 'people'].includes(family) ? panel.getByRole('button', { name: /close/i }).first() : panel.getByRole('button').first();
          await close.click();
        } else await page.keyboard.press('Escape');
        await expect(modalTitle).toBeHidden();
        await page.goto(`/fixture-owner/${family}/public-${family}`);
        await expect(page.getByRole('heading', { name: `Public ${family}`, exact: true })).toBeVisible();
        await colorExpect(page.getByRole('heading', { name: `Public ${family}`, exact: true })).toHaveCSS('color', colors.text);
        await colorExpect(page.locator('[data-category-page]')).toHaveCSS('background-color', colors.page);
        await assertCategoryTokens(page, preset as keyof typeof themes);
        if (family in derived) {
          await page.goto(`/fixture-owner/${family}/${derived[family as keyof typeof derived]}`);
          await expect(page.getByText(`${names[family]} 2`, { exact: true }).last()).toBeVisible();
          await colorExpect(page.getByText(`${names[family]} 2`, { exact: true }).last()).toHaveCSS('color', colors.text);
          await assertCategoryTokens(page, preset as keyof typeof themes);
          await assertCompositedContrast(page.getByText(`${names[family]} 2`, { exact: true }).last());
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`${family}-${preset}-${viewport.width}.png`), fullPage: true });
      } finally { await closeFixture(visitor); }
    });
  }
}

for (const family of mediaFamilies) {
  test(`shared dashboard modal ${family} retains its original palette`, async ({ browser, baseURL }, info) => {
    const viewport = info.project.use.viewport!;
    const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'), { ...viewport, owner: true, theme: 'light', touch: info.project.name === 'mobile' });
    await visitor.context.route('**/images/category-theme-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#203040"/></svg>' }));
    try {
      expect(visitor.page.viewportSize()).toEqual(viewport);
      await visitor.page.goto(`/recommendations/${family}/${family}-list-1`);
      expect(await visitor.page.evaluate(() => innerWidth)).toBe(viewport.width);
      const title = visitor.page.getByText(`${names[family]} 2`, { exact: true }).last();
      await expect(title).toBeVisible();
      await title.click();
      const panel = visitor.page.locator('[data-category-detail-panel]');
      await expect(panel).toBeVisible();
      await expect(panel).toHaveCSS('background-color', 'rgb(13, 17, 23)');
      await expect(panel.getByRole('heading', { name: `${names[family]} 2`, level: 2 })).toHaveCSS('color', 'rgb(255, 255, 255)');
      expect(await panel.evaluate(element => getComputedStyle(element).getPropertyValue('--category-text'))).toBe('');
      await visitor.page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    } finally { await closeFixture(visitor); }
  });
}

for (const family of mediaFamilies) {
  test(`media category details ${family} readable semantic labels and unclipped controls`, async ({ browser, baseURL }, info) => {
    const viewport = info.project.use.viewport!;
    const state = seedCategoryThemeState('minimal-light');
    for (const lists of Object.values(state.lists)) for (const list of lists) {
      for (const item of list[`recommended_${family}`] ?? []) Object.assign(item, {
        user_rating: 8, price_tier: 'Free', platforms: ['Web'], specifications: { Material: 'Aluminium', Weight: '200g' },
      });
    }
    const visitor = await openFixture(browser, baseURL!, state, { ...viewport, touch: info.project.name === 'mobile' });
    await visitor.context.route('**/images/category-theme-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#203040"/></svg>' }));
    const page = visitor.page;
    try {
      expect(page.viewportSize()).toEqual(viewport);
      await page.goto(`/fixture-owner/${family}`);
      expect(await page.evaluate(() => innerWidth)).toBe(viewport.width);
      const title = page.getByText(`${names[family]} 2`, { exact: true }).last();
      await expect(title).toBeVisible();
      if (family === 'apps') await colorExpect(title.locator('xpath=ancestor::button[1]').getByText('Free', { exact: true })).toHaveCSS('color', themes['minimal-light'].text);
      if (family === 'games') await page.getByRole('button', { name: 'Game 2', exact: true }).click();
      else await title.click();
      const panel = page.locator('[data-category-detail-panel]');
      await expect(panel).toBeVisible();
      await colorExpect(panel.getByText("Creator's Rating", { exact: true })).toHaveCSS('color', themes['minimal-light'].text);
      if (['apps', 'products', 'people'].includes(family)) {
        const rating = panel.getByText('8/10', { exact: true });
        await colorExpect(rating).toHaveCSS('color', themes['minimal-light'].text);
        await colorExpect(rating.locator('svg')).toHaveCSS('color', 'rgb(161, 98, 7)');
      }
      if (family === 'apps') {
        await colorExpect(panel.getByText('Free', { exact: true })).toHaveCSS('color', themes['minimal-light'].text);
        await colorExpect(panel.getByText('Web', { exact: true })).toHaveCSS('color', themes['minimal-light'].text);
      }
      if (family === 'products') {
        await colorExpect(panel.getByRole('button', { name: 'Gallery 1', exact: true })).toHaveCSS('border-top-color', themes['minimal-light'].text);
        await colorExpect(panel.getByText('200g', { exact: true }).locator('..').locator('..')).toHaveCSS('background-color', themes['minimal-light'].card);
      }
      await panel.getByText("Creator's Rating", { exact: true }).scrollIntoViewIfNeeded();
      await expect(panel.getByText("Creator's Rating", { exact: true })).toBeInViewport();
      const rect = await panel.boundingBox();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.y).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({ path: info.outputPath(`${family}-minimal-light-modal-${viewport.width}.png`) });
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    } finally { await closeFixture(visitor); }
  });
}

const cssRgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
function contrast(foreground: number[], background: number[]) {
  const luminance = (rgb: number[]) => rgb.slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
const composite = (foreground: number[], background: number[]) => foreground.slice(0, 3).map((c, i) => c * (foreground[3] ?? 1) + background[i] * (1 - (foreground[3] ?? 1)));
const fixtureArtwork = 'http://127.0.0.1:55184/images/category-theme-fixture.svg';

for (const mode of ['banner-top', 'full-wallpaper-image', 'ambient-gradient', 'solid-color']) {
  for (const cover of ['selected', 'absent', 'broken']) {
    test(`@once wallpaper ${mode} ${cover} keeps category solid`, async ({ browser, baseURL }) => {
      const state = seedCategoryThemeState('minimal-light');
      state.account.social_media.theme_settings.wallpaperMode = mode;
      state.account.bg_picture = cover === 'absent' ? null : { url: cover === 'selected' ? fixtureArtwork : `${baseURL}/images/broken-category-cover.svg` };
      const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 900, touch: true });
      try {
        await visitor.page.goto('/fixture-owner/apps');
        await expect(visitor.page.getByText('App 2', { exact: true }).last()).toBeVisible();
        await assertCategoryTokens(visitor.page, 'minimal-light');
        await expect(visitor.page.locator('[data-public-category-artwork]').filter({ visible: true }).first()).toBeVisible();
      } finally { await closeFixture(visitor); }
    });
  }
}

for (const mode of ['banner-top', 'full-wallpaper-image', 'ambient-gradient', 'solid-color']) {
  test(`@once root and Music ${mode} retain selected absent broken backdrop behavior`, async ({ browser, baseURL }, info) => {
    for (const cover of ['selected', 'absent', 'broken']) {
      const state = seedCategoryThemeState('minimal-light');
      state.mode = 'public';
      state.account.public_music = 'Yes';
      state.account.social_media.theme_settings.wallpaperMode = mode;
      state.account.bg_picture = cover === 'absent' ? null : { url: cover === 'selected' ? fixtureArtwork : `${baseURL}/images/broken-category-cover.svg` };
      const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 900, touch: true });
      await visitor.context.route(url => url.origin === new URL(baseURL!).origin && url.pathname === '/images/broken-category-cover.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: 'invalid-image' }));
      try {
        for (const route of ['', '/music']) {
          await visitor.page.goto(`/fixture-owner${route}`);
          const shell = visitor.page.locator('[data-public-profile-chrome]');
          await expect(shell).toHaveAttribute('data-theme-preset', 'minimal-light');
          expect(await shell.evaluate(element => getComputedStyle(element).getPropertyValue('--category-page'))).toBe('');
          const root = route === '';
          const wallpaperCount = mode === 'ambient-gradient' || mode === 'full-wallpaper-image' && (root || cover === 'selected') ? 1 : 0;
          await expect(visitor.page.locator('[data-profile-wallpaper]')).toHaveCount(wallpaperCount);
          await expect(visitor.page.locator('[data-profile-hero-backdrop]')).toHaveCount(root && mode === 'banner-top' ? 1 : 0);
          await expect(visitor.page.locator('[data-music-cover]')).toHaveCount(!root && mode === 'banner-top' && cover === 'selected' ? 1 : 0);
          await info.attach(`backdrop-${mode}-${cover}-${root ? 'root' : 'music'}`, { contentType: 'application/json', body: JSON.stringify({ mode, cover, route, wallpaperCount }) });
        }
      } finally { await closeFixture(visitor); }
    }
  });
}

for (const preset of ['glassmorphism', 'sunset-glow', 'emerald-nature', 'neon-cyber'] as const) {
  for (const component of ['share', 'qr', 'circular', 'day', 'google']) {
    test(`@once supplemental mobile ${component} ${preset} portal palette and pointer close`, async ({ browser, baseURL }) => {
      const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState(preset), { width: 390, height: 900, touch: true, reducedMotion: 'reduce' });
      await visitor.context.route(url => url.origin === new URL(baseURL!).origin && ['/e2e/setup/category-theme-portals.html', '/e2e/setup/category-theme-portals.tsx', '/LogoQR.svg'].includes(url.pathname), route => route.continue());
      try {
        const { page } = visitor;
        await page.goto(`/e2e/setup/category-theme-portals.html?component=${component}&preset=${preset}`);
        const panel = component === 'share' ? page.locator('[data-category-modal] .border-2') : component === 'circular' ? page.locator('[data-category-circular-places]') : component === 'google' ? page.locator('[data-category-google-place]') : component === 'day' ? page.getByRole('heading', { name: 'Fixture day', exact: true }).locator('xpath=../..') : page.getByRole('heading', { name: 'Profile QR', exact: true }).locator('xpath=../..');
        await expect(panel).toBeVisible();
        await colorExpect(panel).toHaveCSS('background-color', themes[preset].panel);
        if (component === 'share') {
          await colorExpect(page.getByRole('heading', { name: 'Share on Social Media', exact: true })).toHaveCSS('color', themes[preset].muted);
          await page.getByRole('button', { name: 'QR', exact: true }).click();
          await expect(page.locator('#qr-sticker-container .p-2')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        }
        const close = component === 'share' ? page.locator('[data-category-modal]').getByRole('button').first() : page.locator('[data-portal-component]').getByRole('button').first();
        await close.click();
        await expect(page.locator('[data-component-closed]')).toBeVisible();
      } finally { await closeFixture(visitor); }
    });
  }
}

for (const edge of [
  { name: 'custom text', customTextColor: '#7C3AED', accentColor: '#0F172A', text: '#7C3AED', ink: '#ffffff' },
  { name: 'black accent', customTextColor: '', accentColor: '#000000', text: '#0F172A', ink: '#ffffff' },
  { name: 'white accent', customTextColor: '', accentColor: '#FFFFFF', text: '#0F172A', ink: '#000000' },
  { name: 'custom accent', customTextColor: '', accentColor: '#FBBF24', text: '#0F172A', ink: '#000000' },
]) {
  test(`@once custom settings ${edge.name} preserve stored fields`, async ({ browser, baseURL }) => {
    const state = seedCategoryThemeState('minimal-light');
    Object.assign(state.account.social_media.theme_settings, { customTextColor: edge.customTextColor, accentColor: edge.accentColor, future: { rich: '<p style="color:#ff0000">Personal prose</p>' } });
    state.account.Bio = '<p><strong>Personal</strong> prose</p>';
    const before = structuredClone(state.account);
    const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 900, touch: true });
    try {
      await visitor.page.goto('/fixture-owner/apps');
      const title = visitor.page.getByText('App 2', { exact: true }).last();
      await expect(title).toBeVisible();
      const shell = visitor.page.locator('[data-public-profile-chrome]');
      expect(await shell.evaluate(element => ['--category-text', '--category-accent', '--category-accent-ink'].map(key => getComputedStyle(element).getPropertyValue(key).trim()))).toEqual([edge.text, edge.accentColor, edge.ink]);
      expect(state.account).toEqual(before);
      expect(state.writes).toEqual([]);
    } finally { await closeFixture(visitor); }
  });
}

for (const width of [320, 768, 1024]) {
  for (const shape of ['media', 'places', 'guide']) {
    test(`@once responsive ${width} ${shape} pointer and bounds`, async ({ browser, baseURL }, info) => {
      const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'), { width, height: 900, touch: width < 500, reducedMotion: 'reduce' });
      const { page } = visitor;
      try {
        expect(page.viewportSize()).toEqual({ width, height: 900 });
        await page.goto(`/fixture-owner/${shape === 'media' ? 'apps' : shape === 'places' ? 'places/city-1' : 'guides/public-guides'}`);
        let control;
        let panel;
        if (shape === 'media') {
          await page.getByText('App 2', { exact: true }).last().click();
          panel = page.locator('[data-category-detail-panel]');
          control = panel.getByRole('button', { name: 'Close', exact: true });
        } else if (shape === 'places') {
          await page.getByRole('button', { name: 'City 1 place 1', exact: true }).click();
          panel = page.locator('[data-public-place-detail]');
          control = panel.getByRole('button', { name: 'Close place details', exact: true });
        } else {
          await page.getByRole('button', { name: 'Map View', exact: true }).click();
          await page.getByRole('button', { name: 'Expand map', exact: true }).click();
          panel = page.locator('[data-public-guide-map-portal]');
          control = panel.getByRole('button', { name: 'List View', exact: true });
        }
        await expect(panel).toBeVisible();
        const viewportEdges = () => panel.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left >= 0,
            top: rect.top >= 0,
            right: rect.right <= innerWidth,
            bottom: rect.bottom <= innerHeight,
          };
        });
        await expect.poll(viewportEdges).toEqual({ left: true, top: true, right: true, bottom: true });
        const rect = await panel.boundingBox();
        expect.soft(rect!.x).toBeGreaterThanOrEqual(0);
        expect.soft(rect!.y).toBeGreaterThanOrEqual(0);
        expect.soft(rect!.x + rect!.width).toBeLessThanOrEqual(width);
        expect.soft(rect!.y + rect!.height).toBeLessThanOrEqual(900);
        expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await info.attach('responsive-hit-target', { contentType: 'application/json', body: JSON.stringify(await control.evaluate(element => { const rect = element.getBoundingClientRect(); return { rect: rect.toJSON(), center: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.outerHTML }; })) });
        await control.click();
        if (shape === 'places') await expect(panel).toHaveCount(0);
        else await expect(panel).toBeHidden();
        if (shape === 'guide') await expect(page.locator('body')).not.toHaveClass(/public-guide-map-portal-open/);
      } finally { await closeFixture(visitor); }
    });
  }
}

test('@once blocking overlay Places and Guide retain entry and exit motion', async ({ browser, baseURL }) => {
  const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'), { width: 390, height: 900, touch: true, reducedMotion: 'no-preference' });
  const { page } = visitor;
  const motionExpect = expect.configure({ soft: true });
  const exerciseMotion = async ({ label, opener, closeName, axis, expectBackdropFade }: {
    label: string;
    opener: ReturnType<typeof page.getByRole>;
    closeName: string;
    axis: 'x' | 'y';
    expectBackdropFade: boolean;
  }) => {
    await page.evaluate(({ dialogLabel, translationAxis }) => {
      (window as any).__task1OverlayEntry = null;
      const observer = new MutationObserver(() => {
        const root = document.querySelector<HTMLElement>(`[data-public-blocking-overlay][aria-label="${dialogLabel}"]`);
        const panel = root?.lastElementChild as HTMLElement | null;
        const backdrop = root?.firstElementChild as HTMLElement | null;
        if (!root || !panel || !backdrop) return;
        observer.disconnect();
        const transform = getComputedStyle(panel).transform;
        const matrix = transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform);
        (window as any).__task1OverlayEntry = {
          translation: translationAxis === 'x' ? matrix.m41 : matrix.m42,
          backdropOpacity: Number(getComputedStyle(backdrop).opacity),
        };
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }, { dialogLabel: label, translationAxis: axis });

    await opener.click();
    const dialog = page.getByRole('dialog', { name: label, exact: true });
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__task1OverlayEntry))).toBe(true);
    const entry = await page.evaluate(() => (window as any).__task1OverlayEntry as { translation: number; backdropOpacity: number });
    motionExpect(Math.abs(entry.translation)).toBeGreaterThan(100);
    if (expectBackdropFade) motionExpect(entry.backdropOpacity).toBeLessThan(0.2);

    const panel = dialog.locator(':scope > div').last();
    await expect.poll(() => panel.evaluate((element, translationAxis) => {
      const transform = getComputedStyle(element).transform;
      const matrix = transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform);
      return Math.abs(translationAxis === 'x' ? matrix.m41 : matrix.m42);
    }, axis)).toBeLessThan(1);

    await page.evaluate(({ dialogLabel, buttonName, translationAxis }) => {
      const root = document.querySelector<HTMLElement>(`[data-public-blocking-overlay][aria-label="${dialogLabel}"]`)!;
      const panel = root.lastElementChild as HTMLElement;
      const backdrop = root.firstElementChild as HTMLElement;
      const close = Array.from(root.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === buttonName || button.textContent?.trim() === buttonName)!;
      const record = { requestedAt: 0, removedAt: 0, maxTranslation: 0, minBackdropOpacity: 1 };
      (window as any).__task1OverlayExit = record;
      const sample = () => {
        if (!root.isConnected) return;
        const transform = getComputedStyle(panel).transform;
        const matrix = transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform);
        record.maxTranslation = Math.max(record.maxTranslation, Math.abs(translationAxis === 'x' ? matrix.m41 : matrix.m42));
        record.minBackdropOpacity = Math.min(record.minBackdropOpacity, Number(getComputedStyle(backdrop).opacity));
        requestAnimationFrame(sample);
      };
      close.addEventListener('click', () => {
        record.requestedAt = performance.now();
        requestAnimationFrame(sample);
      }, { once: true });
      const observer = new MutationObserver(() => {
        if (root.isConnected) return;
        record.removedAt = performance.now();
        observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }, { dialogLabel: label, buttonName: closeName, translationAxis: axis });

    await dialog.getByRole('button', { name: closeName, exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__task1OverlayExit.removedAt > 0)).toBe(true);
    const exit = await page.evaluate(() => (window as any).__task1OverlayExit as { requestedAt: number; removedAt: number; maxTranslation: number; minBackdropOpacity: number });
    motionExpect(exit.removedAt - exit.requestedAt).toBeGreaterThan(180);
    motionExpect(exit.maxTranslation).toBeGreaterThan(100);
    if (expectBackdropFade) motionExpect(exit.minBackdropOpacity).toBeLessThan(0.2);
    await expect(dialog).toHaveCount(0);
  };

  try {
    await page.goto('/fixture-owner/places/city-1');
    await exerciseMotion({ label: 'Place details', opener: page.getByRole('button', { name: 'City 1 place 1', exact: true }), closeName: 'Close place details', axis: 'y', expectBackdropFade: false });
    await page.goto('/fixture-owner/guides');
    await exerciseMotion({ label: 'Guide filters', opener: page.getByRole('button', { name: 'Filters', exact: true }), closeName: 'Close filters', axis: 'x', expectBackdropFade: true });
  } finally { await closeFixture(visitor); }
});

test('@once blocking overlay same-document history cleanup covers Guide and Place owners', async ({ browser, baseURL }, info) => {
  const state = seedCategoryThemeState('minimal-light');
  state.account.pinned_nav_tabs = ['public_profile', 'public_recommendations', 'public_guides'];
  const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 900, touch: true, reducedMotion: 'reduce' });
  const { page } = visitor;
  try {
    await page.goto('/fixture-owner');
    const documentMarker = await page.evaluate(() => {
      const marker = `task-1-${crypto.randomUUID()}`;
      document.documentElement.dataset.task1DocumentMarker = marker;
      return marker;
    });
    const publicNavigation = page.getByRole('navigation', { name: 'Public navigation' });

    await publicNavigation.getByRole('link', { name: 'Guides', exact: true }).click();
    await expect(page).toHaveURL(/\/fixture-owner\/guides$/);
    const filterOpener = page.getByRole('button', { name: 'Filters', exact: true });
    await expect(filterOpener).toBeVisible();
    await page.evaluate(() => { document.body.style.overflow = 'clip'; });
    await expect(page.locator('body')).toHaveCSS('overflow', 'clip');
    await filterOpener.click();
    await expect(page.getByRole('dialog', { name: 'Guide filters', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/fixture-owner$/);
    expect(await page.evaluate(() => document.documentElement.dataset.task1DocumentMarker)).toBe(documentMarker);
    await expect(page.locator('[data-public-blocking-overlay]')).toHaveCount(0);
    await expect(page.locator('body')).toHaveCSS('overflow', 'clip');

    await publicNavigation.getByRole('link', { name: 'Places', exact: true }).click();
    await expect(page).toHaveURL(/\/fixture-owner\/places$/);
    const destination = page.getByRole('heading', { name: 'Destination 1', exact: true }).filter({ has: page.locator('svg') });
    await destination.locator('xpath=../..').getByRole('button', { name: 'See All ➔', exact: true }).click();
    await expect(page).toHaveURL(/\/fixture-owner\/places\/city-1$/);
    const placeOpener = page.getByRole('button', { name: 'City 1 place 1', exact: true });
    await expect(placeOpener).toBeVisible();
    const placeOverflowBefore = await page.evaluate(() => document.body.style.overflow);
    await placeOpener.click();
    await expect(page.getByRole('dialog', { name: 'Place details', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/fixture-owner\/places$/);
    expect(await page.evaluate(() => document.documentElement.dataset.task1DocumentMarker)).toBe(documentMarker);
    await expect(page.locator('[data-public-blocking-overlay]')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(placeOverflowBefore);
    await info.attach('same-document-overlay-cleanup', { contentType: 'application/json', body: JSON.stringify({ documentMarker, guideHistoryCleanup: true, placeHistoryCleanup: true, restoredOverflow: { guide: 'clip', place: placeOverflowBefore } }) });
  } finally { await closeFixture(visitor); }
});

test('@once blocking overlay Guide filters preserve values and clean up across 767 to 768 lifecycle', async ({ browser, baseURL }, info) => {
  const state = seedCategoryThemeState('minimal-light');
  state.lists.guides[0].Guide_Type = 'Adventure';
  state.lists.guides.push({
    ...structuredClone(state.lists.guides[0]),
    documentId: 'guides-list-filter-lifecycle',
    slug: 'relaxed-guide',
    Title: 'Relaxed guide',
    Guide_Type: 'Relaxed',
  });
  const visitor = await openFixture(browser, baseURL!, state, { width: 767, height: 900, touch: true, reducedMotion: 'reduce' });
  const { page } = visitor;
  try {
    await page.goto('/fixture-owner/guides');
    const opener = page.getByRole('button', { name: 'Filters', exact: true });
    await expect(opener).toBeVisible();
    await page.evaluate(() => { document.body.style.overflow = 'clip'; });
    await expect(page.locator('body')).toHaveCSS('overflow', 'clip');
    await opener.click();
    let dialog = page.getByRole('dialog', { name: 'Guide filters', exact: true });
    await expect(dialog).toBeFocused();
    expect(await dialog.evaluate(element => element.parentElement === document.body)).toBe(true);
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.keyboard.press('Tab');
    const close = dialog.getByRole('button', { name: 'Close filters', exact: true });
    await expect(close).toBeFocused();
    expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await dialog.locator('select').first().selectOption('Adventure');
    await expect(page.getByText('Relaxed guide', { exact: true })).toHaveCount(0);
    await expect(page.getByText('1 of 2 guides', { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 768, height: 900 });
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('body')).toHaveCSS('overflow', 'clip');
    await page.setViewportSize({ width: 767, height: 900 });
    dialog = page.getByRole('dialog', { name: 'Guide filters', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('select').first()).toHaveValue('Adventure');
    const apply = dialog.getByRole('button', { name: 'Apply Filters', exact: true });
    expect((await apply.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await apply.click();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page.locator('body')).toHaveCSS('overflow', 'clip');
    await expect(page.getByText('1 of 2 guides', { exact: true })).toBeVisible();

    await opener.click();
    dialog = page.getByRole('dialog', { name: 'Guide filters', exact: true });
    await dialog.getByRole('button', { name: 'Close filters', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await opener.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Guide filters', exact: true })).toHaveCount(0);
    await opener.click();
    await page.mouse.click(740, 450);
    await expect(page.getByRole('dialog', { name: 'Guide filters', exact: true })).toHaveCount(0);

    await opener.click();
    await page.goto('/fixture-owner/places');
    await expect(page.locator('[data-public-blocking-overlay]')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    await page.goto('/fixture-owner/guides');
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Guide filters', exact: true })).toBeVisible();
    await info.attach('guide-filter-blocking-lifecycle', { contentType: 'application/json', body: JSON.stringify({ breakpoints: [767, 768, 767], selected: 'Adventure', closePaths: ['apply', 'close', 'escape', 'backdrop', 'route-unmount'], reopenedAfterRoute: true }) });
  } finally { await closeFixture(visitor); }
});

test('@once blocking overlay nested YARL owns one Escape before Place cleanup', async ({ browser, baseURL }, info) => {
  const state = seedCategoryThemeState('minimal-light');
  const place = state.lists.recommendationLists[0].recommended_places[0];
  place.media_details = {
    thumbnail: { id: 'saved-thumb', url: `${baseURL}/images/category-theme-fixture.svg` },
    imageDetails: [{ id: 'saved-place-photo', url: `${baseURL}/images/category-theme-fixture.svg`, alt: 'Saved place photo' }],
  };
  const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 900, touch: true, reducedMotion: 'reduce' });
  const { page } = visitor;
  try {
    await page.goto('/fixture-owner/places/city-1');
    const opener = page.getByRole('button', { name: 'City 1 place 1', exact: true });
    await expect(opener).toBeVisible();
    await page.evaluate(() => { document.body.style.overflow = 'clip'; });
    await expect(page.locator('body')).toHaveCSS('overflow', 'clip');
    await opener.click();
    const placeDialog = page.getByRole('dialog', { name: 'Place details', exact: true });
    await expect(placeDialog).toBeFocused();
    await page.getByRole('img', { name: 'Saved place photo', exact: true }).click();
    const viewer = page.locator('.yarl__root');
    await expect(viewer).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.yarl__root')))).toBe(true);
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.yarl__root')))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(placeDialog).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-public-blocking-overlay]')))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(placeDialog).toHaveCount(0);
    await expect(page.locator('body')).toHaveCSS('overflow', 'clip');
    await expect(opener).toBeFocused();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await opener.click();
      await expect(page.getByRole('dialog', { name: 'Place details', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Place details', exact: true })).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
    await info.attach('nested-yarl-blocking-lifecycle', { contentType: 'application/json', body: JSON.stringify({ viewerEscapeOnly: true, parentStayedLocked: true, parentEscapeRestored: 'clip', reopened: 2 }) });
  } finally { await closeFixture(visitor); }
});

test('review fix dark dashboard shared hero CTA preserves fill label and icon ink', async ({ browser, baseURL }, info) => {
  const viewport = info.project.use.viewport!;
  const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'), { ...viewport, owner: true, theme: 'dark', touch: info.project.name === 'mobile' });
  await visitor.context.route('**/images/category-theme-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#203040"/></svg>' }));
  try {
    expect(visitor.page.viewportSize()).toEqual(viewport);
    for (const family of (info.project.name === 'mobile' ? ['books'] : ['books', 'games', 'movies'])) {
      await visitor.page.goto(`/recommendations/${family}`);
      expect(await visitor.page.evaluate(() => innerWidth)).toBe(viewport.width);
      const manage = visitor.page.getByRole('button', { name: /Manage Top (Reads|Picks)/ }).filter({ visible: true }).first();
      await expect(manage).toBeVisible();
      await info.attach(`dashboard-${family}-cta-cascade`, { contentType: 'application/json', body: JSON.stringify(await manage.evaluate(element => {
        const computed = getComputedStyle(element);
        const matches: { selector: string; color: string; priority: string }[] = [];
        const walk = (rules: CSSRuleList) => { for (const rule of rules) {
          if (rule instanceof CSSStyleRule && rule.style.color) { try { if (element.matches(rule.selectorText)) matches.push({ selector: rule.selectorText, color: rule.style.color, priority: rule.style.getPropertyPriority('color') }); } catch (error) {
            if (!(error instanceof DOMException) || error.name !== 'SyntaxError') throw error;
            // Unsupported selectors are irrelevant to this best-effort cascade diagnostic.
          } }
          if ('cssRules' in rule && !(rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches)) walk((rule as CSSGroupingRule).cssRules);
        } };
        for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch (error) {
          if (!(error instanceof DOMException) || error.name !== 'SecurityError') throw error;
          // Cross-origin stylesheets are unreadable; the computed-color assertions still run.
        } }
        return { color: computed.color, accentInk: computed.getPropertyValue('--dash-accent-text'), ancestors: Array.from((function* () { let node: Element | null = element; while (node) { yield node; node = node.parentElement; } })()).map(node => node.className), matches };
      })) });
      await colorExpect(manage).toHaveCSS('background-color', 'rgb(96, 165, 250)');
      // Original button.text-white !important wins over the less-specific accent contract.
      await colorExpect(manage).toHaveCSS('color', 'rgb(255, 255, 255)');
      await colorExpect(manage.locator('svg').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
    }
    await visitor.page.goto('/fixture-owner/books');
    const categoryCTA = visitor.page.getByRole('button', { name: 'See Details', exact: true }).filter({ visible: true }).first();
    await expect(categoryCTA).toBeVisible();
    await colorExpect(categoryCTA).toHaveCSS('background-color', 'rgb(15, 23, 42)');
    await colorExpect(categoryCTA).toHaveCSS('color', 'rgb(255, 255, 255)');
    await colorExpect(categoryCTA.locator('svg').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  } finally { await closeFixture(visitor); }
});

test('review fix star-only Books creator rating has visible active and inactive stars', async ({ browser, baseURL }, info) => {
  const viewport = info.project.use.viewport!;
  const state = seedCategoryThemeState('minimal-light');
  for (const list of state.lists.bookLists) for (const book of list.recommended_books) book.user_rating = 8;
  const visitor = await openFixture(browser, baseURL!, state, { ...viewport, touch: info.project.name === 'mobile' });
  await visitor.context.route('**/images/category-theme-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#203040"/></svg>' }));
  try {
    expect(visitor.page.viewportSize()).toEqual(viewport);
    await visitor.page.goto('/fixture-owner/books');
    expect(await visitor.page.evaluate(() => innerWidth)).toBe(viewport.width);
    await visitor.page.getByText('Book 2', { exact: true }).last().click();
    const panel = visitor.page.locator('[data-category-detail-panel]');
    const rating = panel.getByText("Creator's Rating", { exact: true }).locator('..');
    await expect(rating.locator('svg')).toHaveCount(10);
    const colors = await rating.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, active: getComputedStyle(element.querySelector('svg[fill="currentColor"]')!).color, inactive: getComputedStyle(element.querySelector('svg[fill="none"]')!).color }));
    const surface = composite(cssRgb(colors.background), [255, 255, 255]);
    colorExpect(contrast(cssRgb(colors.active), surface)).toBeGreaterThanOrEqual(3);
    colorExpect(contrast(cssRgb(colors.inactive), surface)).toBeGreaterThanOrEqual(3);
    await rating.scrollIntoViewIfNeeded();
    await visitor.page.screenshot({ path: info.outputPath(`review-rating-${viewport.width}.png`) });
  } finally { await closeFixture(visitor); }
});

test('review fix TV badge has a contrasting semantic pair on poster and modal', async ({ browser, baseURL }, info) => {
  const viewport = info.project.use.viewport!;
  const state = seedCategoryThemeState('minimal-light');
  for (const list of state.lists.movieLists) for (const movie of list.recommended_movies) movie.media_type = 'TV';
  const visitor = await openFixture(browser, baseURL!, state, { ...viewport, touch: info.project.name === 'mobile' });
  await visitor.context.route('**/images/category-theme-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#203040"/></svg>' }));
  try {
    expect(visitor.page.viewportSize()).toEqual(viewport);
    await visitor.page.goto('/fixture-owner/movies');
    expect(await visitor.page.evaluate(() => innerWidth)).toBe(viewport.width);
    const badge = visitor.page.getByText('Series', { exact: true }).last().locator('..');
    await colorExpect(badge).toHaveCSS('color', 'rgb(255, 255, 255)');
    await colorExpect(badge).toHaveCSS('background-color', 'rgb(29, 78, 216)');
    await visitor.page.getByText('Movie 2', { exact: true }).last().click();
    const modalBadge = visitor.page.locator('[data-category-detail-panel]').getByText('Series', { exact: true });
    await colorExpect(modalBadge).toHaveCSS('color', 'rgb(255, 255, 255)');
    await colorExpect(modalBadge).toHaveCSS('background-color', 'rgb(29, 78, 216)');
    colorExpect(contrast([255, 255, 255], [29, 78, 216])).toBeGreaterThanOrEqual(4.5);
    await visitor.page.screenshot({ path: info.outputPath(`review-series-${viewport.width}.png`) });
  } finally { await closeFixture(visitor); }
});

test('review fix Games list ratings missing action and artwork banner stay readable', async ({ browser, baseURL }, info) => {
  const viewport = info.project.use.viewport!;
  const state = seedCategoryThemeState('minimal-light');
  for (const list of state.lists.gameLists) for (const game of list.recommended_games) game.igdb_rating = 8.7;
  const visitor = await openFixture(browser, baseURL!, state, { ...viewport, touch: info.project.name === 'mobile' });
  await visitor.context.route('**/images/category-theme-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#203040"/></svg>' }));
  try {
    expect(visitor.page.viewportSize()).toEqual(viewport);
    for (const cover of [false, true]) {
      state.lists.gameLists[0].cover_image = cover ? { url: fixtureArtwork } : null;
      await visitor.page.goto('/fixture-owner/games/public-games');
      expect(await visitor.page.evaluate(() => innerWidth)).toBe(viewport.width);
      const title = visitor.page.getByRole('heading', { name: 'Public games', exact: true });
      await expect(title).toBeVisible();
      await colorExpect(title).toHaveCSS('color', cover ? 'rgb(255, 255, 255)' : themes['minimal-light'].text);
      await colorExpect(visitor.page.getByText('A thoughtful collection', { exact: true })).toHaveCSS('color', cover ? 'rgba(255, 255, 255, 0.7)' : themes['minimal-light'].muted);
      await colorExpect(visitor.page.getByText('8.7', { exact: true }).first()).toHaveCSS('color', themes['minimal-light'].text);
      await visitor.page.screenshot({ path: info.outputPath(`review-games-banner-${cover}-${viewport.width}.png`) });
    }
    await visitor.page.goto('/fixture-owner/games/missing-list');
    await expect(visitor.page.getByText('List not found', { exact: true })).toBeVisible();
    await colorExpect(visitor.page.getByRole('button', { name: 'Back to Games', exact: true })).toHaveCSS('color', themes['minimal-light'].text);
  } finally { await closeFixture(visitor); }
});

test('media category header uses independent artwork ink and returns to solid route ink', async ({ browser, baseURL }, info) => {
  const viewport = info.project.use.viewport!;
  const visitor = await openFixture(browser, baseURL!, seedCategoryThemeState('minimal-light'), { ...viewport, touch: info.project.name === 'mobile' });
  await visitor.context.route('**/images/category-theme-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#203040"/></svg>' }));
  const page = visitor.page;
  try {
    await page.goto('/fixture-owner/apps');
    expect(page.viewportSize()).toEqual(viewport);
    expect(await page.evaluate(() => innerWidth)).toBe(viewport.width);
    const artwork = page.locator('[data-public-category-artwork]').filter({ visible: true }).first();
    const logo = page.locator('.public-brand-logo');
    const glyph = logo.locator('path[fill="currentColor"]');
    const share = page.locator('.public-brand-header .public-brand-action');
    const shareGlyph = share.locator('[data-public-header-share-icon]');
    const solid = async () => {
      await expect(logo).toHaveCSS('color', 'rgb(15, 23, 42)');
      await expect(share).toHaveCSS('color', 'rgb(15, 23, 42)');
      await expect(glyph).toHaveCSS('filter', 'none');
      await expect(shareGlyph).toHaveCSS('filter', 'none');
      await expect(page.locator('.public-brand-header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    };
    await solid();
    await page.screenshot({ path: info.outputPath(`header-solid-${viewport.width}.png`) });
    for (const width of [viewport.width, viewport.width > 500 ? 390 : 1440]) {
      await page.setViewportSize({ width, height: width > 500 ? 1000 : 900 });
      await expect(artwork.getByRole('heading', { name: 'App 1', exact: true })).toHaveCSS('opacity', '1');
      await artwork.evaluate(element => window.scrollTo({ top: scrollY + element.getBoundingClientRect().top + 80, behavior: 'instant' }));
      await expect.poll(() => artwork.evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(0);
      const image = await artwork.boundingBox();
      const letter = await glyph.boundingBox();
      const icon = await shareGlyph.boundingBox();
      expect(letter!.y).toBeGreaterThan(image!.y);
      expect(letter!.y + letter!.height).toBeLessThan(image!.y + image!.height);
      if (width < 500) {
        // The painted e crosses the left artwork edge; the Share glyph is entirely on solid page.
        expect(letter!.x).toBeLessThan(image!.x);
        expect(letter!.x + letter!.width).toBeGreaterThan(image!.x);
        expect(icon!.x).toBeGreaterThan(image!.x + image!.width);
        await expect(glyph).not.toHaveCSS('filter', 'none');
        await expect(shareGlyph).toHaveCSS('filter', 'none');
        await expect(share).toHaveCSS('color', 'rgb(15, 23, 42)');
      } else {
        expect(letter!.x).toBeGreaterThan(image!.x);
        expect(letter!.x + letter!.width).toBeLessThan(image!.x + image!.width);
        expect(icon!.x + icon!.width).toBeLessThan(image!.x + image!.width);
        await expect(glyph).toHaveCSS('filter', 'none');
        await expect(shareGlyph).toHaveCSS('filter', 'none');
        await expect(share).toHaveCSS('color', 'rgb(255, 255, 255)');
      }
      await expect(glyph).toHaveCSS('fill', 'rgb(255, 255, 255)');
      for (const control of [logo, share]) {
        await control.evaluate(element => (element as HTMLElement).focus({ preventScroll: true }));
        await expect(control).toHaveCSS('color', control === logo || width > 500 ? 'rgb(255, 255, 255)' : 'rgb(15, 23, 42)');
        await expect(control).toHaveCSS('outline-color', control === logo || width > 500 ? 'rgb(255, 255, 255)' : 'rgb(15, 23, 42)');
      }
      await expect(shareGlyph).toHaveCSS('color', width > 500 ? 'rgb(255, 255, 255)' : 'rgb(15, 23, 42)');
      await page.screenshot({ path: info.outputPath(`header-${width < 500 ? 'partial' : 'full'}-${width}.png`) });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await solid();
    }
    // Navigate while artwork ink is active: route-key cleanup must not depend on first scrolling out.
    await artwork.evaluate(element => window.scrollTo({ top: scrollY + element.getBoundingClientRect().top + 80, behavior: 'instant' }));
    await expect(glyph).toHaveCSS('fill', 'rgb(255, 255, 255)');
    await page.getByRole('button', { name: 'View all →', exact: true }).evaluate(element => (element as HTMLElement).click());
    await expect(page).toHaveURL(baseURL + '/fixture-owner/apps/public-apps');
    await solid();
  } finally { await closeFixture(visitor); }
});
