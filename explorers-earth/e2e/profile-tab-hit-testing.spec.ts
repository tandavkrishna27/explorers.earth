import { expect, test } from "@playwright/test";
import {
  installSyntheticProfileRoutes, selectSyntheticGallery, SYNTHETIC_PROFILE_PATH,
  type SyntheticProfileVariant,
} from "./setup/profile-tab-hit-testing";

const viewports = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 375, height: 667 },
] as const;

for (const viewport of viewports) {
  test(`row1 normal Gallery pointer selects populated content at ${viewport.name}`, async ({ context, page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const counters = await installSyntheticProfileRoutes(context, {
      preset: "cinematic-dark", wallpaperMode: "banner-top", business: false,
    });
    try {
      await page.goto(SYNTHETIC_PROFILE_PATH, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("public-profile-theme-root")).toHaveAttribute("data-theme-preset", "cinematic-dark");
      const heroBackdrop = page.locator("[data-profile-hero-backdrop]");
      await expect(heroBackdrop).toHaveCSS("height", viewport.name === "desktop" ? "420px" : "380px");
      await expect(heroBackdrop).toHaveCSS("pointer-events", "none");
      await expect(page.getByTestId("recommendations-shelves")).toBeVisible();
      await expect(page.getByRole("tab", { name: "Recommendations", exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tab", { name: "Business Details", exact: true })).toHaveCount(0);
      await selectSyntheticGallery(page, testInfo);
    } finally {
      await testInfo.attach("synthetic-network-counts", { body: JSON.stringify(counters), contentType: "application/json" });
      expect.soft(counters.publicQueries).toBeGreaterThanOrEqual(12);
      expect.soft(counters.deniedAuthority).toBe(0);
      expect.soft(counters.deniedUnknown).toBe(0);
      expect.soft(counters.forwardedData).toBe(0);
    }
  });
}

const variants: SyntheticProfileVariant[] = [
  ...(["cinematic-dark", "minimal-light", "glassmorphism"] as const).flatMap((preset) => (
    (["banner-top", "solid-color"] as const).map((wallpaperMode) => ({ preset, wallpaperMode, business: true }))
  )),
  { preset: "cinematic-dark", wallpaperMode: "ambient-gradient", business: true },
  { preset: "cinematic-dark", wallpaperMode: "full-wallpaper-image", business: true },
];

for (const viewport of viewports) {
  for (const variant of variants) {
    test(`all tabs pointer and keyboard ${viewport.name} ${variant.preset} ${variant.wallpaperMode}`, async ({ context, page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const counters = await installSyntheticProfileRoutes(context, variant);
      try {
        await page.goto(SYNTHETIC_PROFILE_PATH, { waitUntil: "domcontentloaded" });
        const root = page.getByTestId("public-profile-theme-root");
        await expect(root).toHaveAttribute("data-theme-preset", variant.preset);
        await expect(root).toHaveAttribute("data-wallpaper-mode", variant.wallpaperMode);
        const heroBackdrop = page.locator("[data-profile-hero-backdrop]");
        await expect(heroBackdrop).toHaveCount(variant.wallpaperMode === "banner-top" ? 1 : 0);
        if (variant.wallpaperMode === "banner-top") {
          await expect(heroBackdrop).toHaveCSS("pointer-events", "none");
        }
        const recommendations = page.getByRole("tab", { name: "Recommendations", exact: true });
        const gallery = page.getByRole("tab", { name: "Gallery", exact: true });
        const business = page.getByRole("tab", { name: "Business Details", exact: true });
        await selectSyntheticGallery(page, testInfo);
        await business.click();
        await expect(business).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("tabpanel", { name: "Business Details", exact: true })).toContainText("Synthetic workshop");
        await recommendations.click();
        await expect(page.getByRole("tabpanel", { name: "Recommendations", exact: true })).toBeVisible();
        await expect(recommendations).toHaveAttribute("aria-selected", "true");

        // Roving focus is separate from activation, including Space and Enter.
        await recommendations.focus();
        await page.keyboard.press("ArrowRight");
        await expect(gallery).toBeFocused();
        await expect(recommendations).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("Enter");
        await expect(gallery).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("End");
        await expect(business).toBeFocused();
        await expect(gallery).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("Space");
        await expect(business).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("Home");
        await expect(recommendations).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(recommendations).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("tab", { selected: true })).toHaveCount(1);
      } finally {
        await testInfo.attach("synthetic-network-counts", { body: JSON.stringify(counters), contentType: "application/json" });
        expect.soft(counters.publicQueries).toBeGreaterThanOrEqual(12);
        expect.soft(counters.deniedAuthority).toBe(0);
        expect.soft(counters.deniedUnknown).toBe(0);
        expect.soft(counters.forwardedData).toBe(0);
      }
    });
  }
}
