import { expect, test } from "@playwright/test";
import { installMusicPresentationFixture, populatedPublicResource } from "./setup/music-presentation";
import { PUBLIC_SHELL_VISUAL_MATRIX } from "./fixtures/public-shell-visual-matrix";
import { REQUIRED_THEMES, assertPublicShellVisualCoverage } from "./setup/public-shell-continuity";

const footerColours = {
  "cinematic-dark": { background: "rgb(9, 13, 22)", ink: "rgb(255, 255, 255)" },
  glassmorphism: { background: "rgb(15, 23, 42)", ink: "rgb(255, 255, 255)" },
  "sunset-glow": { background: "rgb(26, 11, 46)", ink: "rgb(255, 255, 255)" },
  "minimal-light": { background: "rgb(248, 250, 252)", ink: "rgb(15, 23, 42)" },
  "emerald-nature": { background: "rgb(6, 78, 59)", ink: "rgb(255, 255, 255)" },
  "neon-cyber": { background: "rgb(3, 7, 18)", ink: "rgb(255, 255, 255)" },
} as const;

const publicChromeColours = {
  "cinematic-dark": { header: "rgba(0, 0, 0, 0)", ink: "rgb(255, 255, 255)", categoryInk: "rgb(255, 255, 255)", focus: "rgb(16, 185, 129)" },
  glassmorphism: { header: "rgba(0, 0, 0, 0)", ink: "rgb(255, 255, 255)", categoryInk: "rgb(255, 255, 255)", focus: "rgb(56, 189, 248)" },
  "sunset-glow": { header: "rgba(0, 0, 0, 0)", ink: "rgb(255, 255, 255)", categoryInk: "rgb(255, 255, 255)", focus: "rgb(236, 72, 153)" },
  "minimal-light": { header: "rgba(0, 0, 0, 0)", ink: "rgb(15, 23, 42)", categoryInk: "rgb(15, 23, 42)", focus: "rgb(15, 23, 42)" },
  "emerald-nature": { header: "rgba(0, 0, 0, 0)", ink: "rgb(255, 255, 255)", categoryInk: "rgb(255, 255, 255)", focus: "rgb(167, 243, 208)" },
  "neon-cyber": { header: "rgba(0, 0, 0, 0)", ink: "rgb(255, 255, 255)", categoryInk: "rgb(255, 255, 255)", focus: "rgb(244, 63, 94)" },
} as const;

test("consumes the checked-in Task 7 theme and visual-pair contract", () => {
  expect(Object.keys(footerColours)).toEqual([...REQUIRED_THEMES]);
  expect(Object.keys(publicChromeColours)).toEqual([...REQUIRED_THEMES]);
  expect(() => assertPublicShellVisualCoverage(PUBLIC_SHELL_VISUAL_MATRIX)).not.toThrow();
});

const categoryHeaders = [
  { name: "places", path: "/fixture-owner/places", sharePath: "/fixture-owner/places/public-places", title: "Fixture Explorer's Places", text: "Check out these recommendations!" },
  { name: "guides", path: "/fixture-owner/guides", title: "Fixture Explorer's Guides", text: "Check out these travel guides!" },
  { name: "guide detail", path: "/fixture-owner/guides/public-guides", title: "Public guides", text: "Check out this guide!" },
  { name: "movies", path: "/fixture-owner/movies", title: "Fixture Explorer's Movies" },
  { name: "movie genre", path: "/fixture-owner/movies/genre/drama", title: "Drama" },
  { name: "movie list", path: "/fixture-owner/movies/public-movies", title: "Public movies" },
  { name: "books", path: "/fixture-owner/books", title: "fixture-owner's Books" },
  { name: "book subject", path: "/fixture-owner/books/subject/fiction", title: "Fiction Books" },
  { name: "book list", path: "/fixture-owner/books/public-books", title: "Public books" },
  { name: "games", path: "/fixture-owner/games", title: "Fixture Explorer's Games" },
  { name: "game genre", path: "/fixture-owner/games/genre/action", title: "Action Games" },
  { name: "game list", path: "/fixture-owner/games/public-games", title: "Public games" },
  { name: "apps", path: "/fixture-owner/apps", title: "Fixture Explorer's Apps" },
  { name: "app list", path: "/fixture-owner/apps/public-apps", title: "Public apps" },
  { name: "products", path: "/fixture-owner/products", title: "Fixture Explorer's Products" },
  { name: "product list", path: "/fixture-owner/products/public-products", title: "Public products" },
  { name: "people", path: "/fixture-owner/people", title: "Fixture Explorer's People" },
  { name: "people sector", path: "/fixture-owner/people/sector/creators", title: "Creators recommendations by Fixture Explorer" },
  { name: "people list", path: "/fixture-owner/people/public-people", title: "Public people" },
] as const;

async function installHeaderShareSpies(context: import("@playwright/test").BrowserContext) {
  await context.addInitScript(() => {
    const nativeShare = async (payload: unknown) => {
      (window as unknown as { __publicThemeNativeShares: unknown[] }).__publicThemeNativeShares.push(payload);
    };
    Object.defineProperty(window, "__publicThemeNativeShares", { configurable: true, value: [], writable: true });
    Object.defineProperty(window, "__publicThemeCopies", { configurable: true, value: [], writable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      get: () => sessionStorage.getItem("public-theme-share-mode") === "copy" ? undefined : nativeShare,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => (window as unknown as { __publicThemeCopies: string[] }).__publicThemeCopies.push(text) },
    });
  });
}

async function visitCategoryHeader(page: import("@playwright/test").Page, name: string, path: string) {
  await page.goto(path);
  const share = page.getByRole("button", { name: "Share", exact: true });
  await expect(share, `${name} header Share`).toBeVisible();
  await expect(share).toHaveCSS("min-width", "44px");
  await expect(page.getByRole("link", { name: "Explorers.Earth home" }).or(page.getByRole("button", { name: "Explorers.Earth home" }))).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await share.focus();
  await share.press("Enter");
}

test("Music footer uses palette chrome while the shared header and controls remain transparent", async ({ page, context, baseURL }, info) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  for (const [preset, expected] of Object.entries(footerColours)) {
    const chrome = publicChromeColours[preset as keyof typeof publicChromeColours];
    for (const footerBranding of ["enabled", "minimal", "disabled"] as const) {
      fixture.setAppearance(preset);
      fixture.state.account.social_media.theme_settings.footerBranding = footerBranding;
      fixture.state.account.social_media.theme_settings.customTextColor = "#f43f5e";
      await page.goto("/fixture-owner/music");
      await expect.poll(() => page.locator(".public-brand-header").evaluate(header => ({
        background: getComputedStyle(header).backgroundColor,
        letter: getComputedStyle(header.querySelector(".public-brand-logo svg path[fill='currentColor']")!).fill,
        border: getComputedStyle(header).borderTopWidth,
        radius: getComputedStyle(header).borderRadius,
        actionBackground: getComputedStyle(header.querySelector(".public-brand-action")!).backgroundColor,
        actionBorder: getComputedStyle(header.querySelector(".public-brand-action")!).borderTopWidth,
      }))).toEqual({ background: chrome.header, letter: chrome.ink, border: "0px", radius: "0px", actionBackground: chrome.header, actionBorder: "0px" });
      const footer = page.getByRole("contentinfo");
      await expect(footer).toHaveCount(footerBranding === "disabled" ? 0 : 1);
      if (footerBranding !== "disabled") {
        const colours = await footer.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color }));
        expect(colours).toEqual(expected);
        await expect(footer.getByRole("img", { name: "Explorers.Earth" })).toBeVisible();
        await expect(footer.getByRole("link", { name: "Privacy", exact: true })).toHaveCount(footerBranding === "enabled" ? 1 : 0);
        await expect(footer.locator(".public-brand-wordmark svg path[fill='currentColor']").first()).toHaveCSS("fill", expected.ink);
        await expect(footer.locator(".public-brand-wordmark svg path[fill='#32A621']").first()).toHaveCSS("fill", "rgb(50, 166, 33)");
        await expect(footer.locator(".public-brand-wordmark svg path[fill='#085ABF']").first()).toHaveCSS("fill", "rgb(8, 90, 191)");
        if (info.project.name === "theme-mobile" && footerBranding === "enabled" && ["cinematic-dark", "glassmorphism", "minimal-light"].includes(preset)) {
          await footer.scrollIntoViewIfNeeded();
          await page.screenshot({ path: info.outputPath(`mobile-${preset}-footer.png`) });
        }
      }
      await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCSS("color", chrome.ink);
      await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveText("");
      await expect(page.locator(".public-brand-header .public-brand-icon")).toHaveCount(1);
      await expect(page.locator(".public-brand-header .public-brand-wordmark")).toHaveCount(0);
      await expect(page.locator(".public-brand-logo svg path[fill='currentColor']").first()).toHaveCSS("fill", chrome.ink);
      await expect(page.locator(".public-brand-logo svg path[fill='#32A621']").first()).toHaveCSS("fill", "rgb(50, 166, 33)");
      await expect(page.locator(".public-brand-logo svg path[fill='#085ABF']").first()).toHaveCSS("fill", "rgb(8, 90, 191)");
    }
  }
  fixture.assertClean();
});

test("transparent chrome overlays the root hero and leaves one collision-free offset on non-hero routes", async ({ page, context, baseURL }) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  const analyticsWrites: Array<Record<string, any>> = [];
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => undefined });
  });
  const analyticsEndpoints = new Set([
    "https://localtunes.test/api/explorers/analytics/events",
    new URL("/__localtunes/api/explorers/analytics/events", baseURL!).href,
  ]);
  await page.route(url => analyticsEndpoints.has(url.href), async route => {
    expect(route.request().method()).toBe("POST");
    analyticsWrites.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: "application/json", body: '{"accepted":true}' });
  });
  fixture.setAppearance("minimal-light", "banner-top");
  await page.goto("/fixture-owner");
  await expect(page.locator("[data-profile-hero-backdrop]")).toBeVisible();
  const rootGeometry = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".public-brand-header")!;
    const content = document.querySelector<HTMLElement>("[data-public-content-layer]")!;
    const hero = document.querySelector<HTMLElement>("[data-profile-hero-backdrop]")!;
    const identity = document.querySelector<HTMLElement>("[data-testid='public-profile-header-metadata']")!;
    const logo = document.querySelector<HTMLElement>(".public-brand-logo")!;
    const share = document.querySelector<HTMLButtonElement>(".public-brand-action")!;
    const headerRect = header.getBoundingClientRect();
    const logoRect = logo.getBoundingClientRect();
    const shareRect = share.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      headerBackground: getComputedStyle(header).backgroundColor,
      headerBorder: getComputedStyle(header).borderTopWidth,
      headerOutline: getComputedStyle(header).outlineStyle,
      actionBorder: getComputedStyle(share).borderTopWidth,
      actionOutline: getComputedStyle(share).outlineStyle,
      rootPadding: getComputedStyle(content).paddingTop,
      heroTop: hero.getBoundingClientRect().top,
      heroBottom: hero.getBoundingClientRect().bottom,
      headerTop: headerRect.top,
      headerBottom: headerRect.bottom,
      headerInkToken: document.querySelector<HTMLElement>('[data-public-profile-chrome]')!.style.getPropertyValue('--public-header-ink'),
      inheritedHeaderInk: getComputedStyle(header).getPropertyValue('--public-header-ink').trim(),
      inheritedLogoInk: getComputedStyle(logo).getPropertyValue('--public-header-ink').trim(),
      headerColor: getComputedStyle(header).color,
      identityTop: identity.getBoundingClientRect().top,
      logoTarget: [logoRect.width, logoRect.height],
      shareTarget: [shareRect.width, shareRect.height],
      shareText: share.textContent?.trim() ?? "",
      logoInk: getComputedStyle(logo).color,
      shareInk: getComputedStyle(share).color,
    };
  });
  expect(rootGeometry.viewport).toBe(test.info().project.name === "theme-mobile" ? 320 : 1440);
  expect(rootGeometry.heroBottom).toBeGreaterThan(rootGeometry.headerBottom);
  expect(rootGeometry.headerInkToken).toBe('#FFFFFF');
  expect(rootGeometry.inheritedHeaderInk).toBe('#FFFFFF');
  expect(rootGeometry.inheritedLogoInk).toBe('#FFFFFF');
  expect(rootGeometry.headerColor).toBe('rgb(255, 255, 255)');
  expect(rootGeometry).toMatchObject({
    headerBackground: "rgba(0, 0, 0, 0)",
    headerBorder: "0px",
    headerOutline: "none",
    actionBorder: "0px",
    actionOutline: "none",
    rootPadding: "0px",
    shareText: "",
    logoInk: "rgb(255, 255, 255)",
    shareInk: "rgb(255, 255, 255)",
  });
  expect(rootGeometry.heroTop).toBeLessThanOrEqual(rootGeometry.headerTop);
  expect(rootGeometry.identityTop).toBeGreaterThanOrEqual(rootGeometry.headerBottom);
  expect(Math.min(...rootGeometry.logoTarget)).toBeGreaterThanOrEqual(44);
  expect(Math.min(...rootGeometry.shareTarget)).toBeGreaterThanOrEqual(44);

  await page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>('[data-profile-hero-backdrop]')!;
    window.scrollTo(0, hero.getBoundingClientRect().bottom + window.scrollY);
  });
  await expect(page.locator('.public-brand-header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.public-brand-header')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.public-brand-logo')).toHaveCSS('color', 'rgb(15, 23, 42)');
  const share = page.getByRole('button', { name: 'Share', exact: true });
  await expect(share).toHaveCSS('border-top-width', '0px');
  await expect(share).toHaveCSS('color', 'rgb(15, 23, 42)');
  await share.focus();
  await expect(share).toBeFocused();
  await expect(share).toHaveCSS('outline-style', 'solid');
  await expect(share).toHaveCSS('outline-color', 'rgb(15, 23, 42)');

  await page.goto("/fixture-owner/places");
  await expect(page.locator(".public-brand-header")).toBeVisible();
  await expect(page.locator("[data-public-content-layer]")).toHaveCount(1);
  await expect(page.locator("[data-public-content-layer] [data-category-page='places']").first()).toBeVisible();
  const nonHeroGeometry = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".public-brand-header")!;
    const content = document.querySelector<HTMLElement>("[data-public-content-layer]")!;
    const shell = document.querySelector<HTMLElement>("[data-public-profile-chrome]")!;
    const routeSurface = content.querySelector<HTMLElement>("[data-category-page='places']")!;
    const logo = header.querySelector<HTMLElement>(".public-brand-logo")!;
    const share = header.querySelector<HTMLElement>(".public-brand-action")!;
    return {
      background: getComputedStyle(header).backgroundColor,
      contentPadding: Number.parseFloat(getComputedStyle(content).paddingTop),
      headerBottom: header.getBoundingClientRect().bottom,
      shellSurface: getComputedStyle(shell).backgroundColor,
      routeSurface: getComputedStyle(routeSurface).backgroundColor,
      logoInk: getComputedStyle(logo).color,
      shareInk: getComputedStyle(share).color,
    };
  });
  expect(nonHeroGeometry.background).toBe("rgba(0, 0, 0, 0)");
  expect(nonHeroGeometry.contentPadding).toBeGreaterThanOrEqual(nonHeroGeometry.headerBottom);
  expect(nonHeroGeometry.shellSurface).toBe(nonHeroGeometry.routeSurface);
  expect(nonHeroGeometry.routeSurface).toBe("rgb(248, 250, 252)");
  expect(nonHeroGeometry.logoInk).toBe("rgb(15, 23, 42)");
  expect(nonHeroGeometry.shareInk).toBe("rgb(15, 23, 42)");

  await page.goto("/fixture-owner/guides/public-guides");
  const guideScrollRoot = page.locator("[data-public-content-layer] .preview-scroll").first();
  const guideMainTabs = guideScrollRoot.locator("[data-public-guide-main-tabs]").first();
  await expect(guideMainTabs).toBeVisible();
  await page.waitForTimeout(600);
  await guideScrollRoot.evaluate(element => {
    element.style.minHeight = "0";
    element.style.height = "120px";
    element.style.maxHeight = "120px";
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(async () => guideMainTabs.evaluate(element => getComputedStyle(element).position)).toBe("fixed");
  const guideGeometry = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".public-brand-header")!;
    const content = document.querySelector<HTMLElement>("[data-public-content-layer]")!;
    const scrollRoot = content.querySelector<HTMLElement>(".preview-scroll")!;
    const mainTabs = scrollRoot.querySelector<HTMLElement>("[data-public-guide-main-tabs]")!;
    const mainRect = mainTabs.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      physicalHeaderBottom: header.getBoundingClientRect().bottom,
      reservedOffset: Number.parseFloat(getComputedStyle(content).paddingTop),
      mainTop: mainRect.top,
      mainPosition: getComputedStyle(mainTabs).position,
      windowScrollY: window.scrollY,
    };
  });
  expect(guideGeometry.viewport).toBe(test.info().project.name === "theme-mobile" ? 320 : 1440);
  expect(guideGeometry.physicalHeaderBottom).toBe(56);
  expect(guideGeometry.reservedOffset).toBe(80);
  expect(guideGeometry.mainPosition).toBe("fixed");
  expect(guideGeometry.mainTop).toBeCloseTo(guideGeometry.reservedOffset, 0);
  expect(guideGeometry.windowScrollY).toBe(0);

  const guideShare = page.getByRole("button", { name: "Share", exact: true });
  await page.evaluate(() => {
    localStorage.setItem("explorers-cookie-consent", JSON.stringify({ necessary: true, analytics: true }));
    window.dispatchEvent(new Event("explorers:analytics-consent-changed"));
  });
  await guideShare.click();
  await expect.poll(() => analyticsWrites.filter(write =>
    write?.event?.type === "click"
    && write?.event?.element === "share-button"
    && write?.event?.canonicalPath === "/fixture-owner/guides/public-guides"
  )).toHaveLength(1);
  const [guideShareAttempt] = analyticsWrites.filter(write =>
    write?.event?.type === "click"
    && write?.event?.element === "share-button"
    && write?.event?.canonicalPath === "/fixture-owner/guides/public-guides"
  );
  expect(guideShareAttempt.event.metadata).toEqual({
    context: "guide-header",
    guideId: "guides-list",
    guideName: "Public guides",
    originalElement: "share-button",
  });
  fixture.assertClean();
});

test("footer does not cover the fixed Profile navigation target at the bottom of a friendly page", async ({ page, context, baseURL }) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  fixture.state.account.social_media.theme_settings.footerBranding = "enabled";
  await page.goto("/fixture-owner/music");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toBeVisible();
  await footer.scrollIntoViewIfNeeded();
  const profile = page.getByRole("link", { name: "Profile", exact: true });
  const hit = await profile.evaluate(link => {
    const rect = link.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + Math.min(10, rect.width / 2), rect.top + Math.min(10, rect.height / 2));
    return target === link || Boolean(target && link.contains(target));
  });
  expect(hit).toBe(true);
  await profile.click();
  await expect(page).toHaveURL(/\/fixture-owner$/);
  fixture.assertClean();
});

test("focused public chrome uses each preset's semantic focus token despite custom text colour", async ({ page, context, baseURL }) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  fixture.state.account.social_media.theme_settings.footerBranding = "enabled";
  fixture.state.account.social_media.theme_settings.customTextColor = "#f43f5e";
  for (const [preset, expected] of Object.entries(publicChromeColours)) {
    fixture.setAppearance(preset);
    await page.goto("/fixture-owner/music");
    for (const target of [page.getByRole("link", { name: "Explorers.Earth home" }), page.getByRole("button", { name: "Share" }), page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true })]) {
      await target.focus();
      await expect(target).toHaveCSS("outline-style", "solid");
      await expect(target).toHaveCSS("outline-width", "3px");
      await expect(target).toHaveCSS("outline-color", expected.focus);
      await expect(target).toHaveCSS("color", expected.ink);
    }
  }
  fixture.assertClean();
});

test("each of the 19 changed category headers preserves its native Share payload and responsive chrome", async ({ page, context, baseURL }) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  await installHeaderShareSpies(context);
  for (const header of categoryHeaders) {
    await visitCategoryHeader(page, header.name, header.path);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __publicThemeNativeShares: unknown[] }).__publicThemeNativeShares)).toHaveLength(1);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __publicThemeNativeShares: Array<Record<string, string>> }).__publicThemeNativeShares[0])).toEqual({
      title: header.title,
      text: header.text,
      url: `${baseURL}${header.sharePath ?? header.path}`,
    });
  }
  fixture.assertClean();
});

test("each of the 19 changed category headers preserves its clipboard Share fallback", async ({ page, context, baseURL }) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  await installHeaderShareSpies(context);
  await page.goto("/fixture-owner/music");
  await page.evaluate(() => sessionStorage.setItem("public-theme-share-mode", "copy"));
  for (const header of categoryHeaders) {
    await visitCategoryHeader(page, header.name, header.path);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __publicThemeCopies: string[] }).__publicThemeCopies)).toEqual([`${baseURL}${header.sharePath ?? header.path}`]);
  }
  fixture.assertClean();
});

test("all 19 changed category headers resolve dark and light chrome, focus, and native sharing", async ({ page, context, baseURL }) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  await installHeaderShareSpies(context);
  for (const preset of ["cinematic-dark", "minimal-light"] as const) {
    const expected = publicChromeColours[preset];
    fixture.setAppearance(preset);
    fixture.state.account.social_media.theme_settings.footerBranding = "enabled";
    fixture.state.account.social_media.theme_settings.customTextColor = "#f43f5e";
    await page.goto("/fixture-owner");
    await expect.poll(() => page.locator(".public-brand-header").first().evaluate(element => ({
      background: getComputedStyle(element).backgroundColor,
      letter: getComputedStyle(element.querySelector(".public-brand-logo svg path[fill='currentColor']")!).fill,
      action: getComputedStyle(element.querySelector(".public-brand-action")!).color,
    }))).toEqual({ background: expected.header, letter: expected.ink, action: expected.ink });
    for (const header of categoryHeaders) {
      await page.goto(header.path);
      await expect.poll(() => page.locator(".public-brand-header").first().evaluate(element => ({
        background: getComputedStyle(element).backgroundColor,
        letter: getComputedStyle(element.querySelector(".public-brand-logo svg path[fill='currentColor']")!).fill,
        action: getComputedStyle(element.querySelector(".public-brand-action")!).color,
      }))).toEqual({ background: expected.header, letter: expected.categoryInk, action: expected.categoryInk });
      const share = page.getByRole("button", { name: "Share", exact: true });
      await share.focus();
      await expect(share).toHaveCSS("outline-style", "solid");
      await expect(share).toHaveCSS("outline-width", "3px");
      await expect(share).toHaveCSS("outline-color", expected.focus);
      await share.press("Enter");
      await expect.poll(() => page.evaluate(() => (window as unknown as { __publicThemeNativeShares: unknown[] }).__publicThemeNativeShares)).toHaveLength(1);
    }
  }
  fixture.assertClean();
});
