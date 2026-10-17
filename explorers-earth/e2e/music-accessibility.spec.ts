import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator } from "@playwright/test";
import { setupMockAuthentication } from "./setup/auth";
import { installMusicQualificationMocks } from "./setup/music";

test.beforeEach(async ({ context }) => {
  await setupMockAuthentication(context);
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach("sanitized-fixture-page", { body: await page.screenshot(), contentType: "image/png" });
  }
});

async function expectButtonsToMeetTouchTarget(root: Locator) {
  for (const control of await root.getByRole("button").or(root.getByRole("switch")).all()) {
    if (await control.isVisible()) {
      await expect.poll(async () => {
        const box = await control.boundingBox();
        return Math.round(Math.min(box?.height ?? 0, box?.width ?? 0));
      }, { message: `expected ${await control.getAttribute("aria-label") ?? await control.innerText()} to settle at a 44px touch target` })
        .toBeGreaterThanOrEqual(44);
    }
  }
}

for (const viewport of [
  { label: "375px", width: 375, height: 820 },
  { label: "desktop", width: 1280, height: 900 },
]) {
  test(`axe and keyboard-only Music sharing are clean at ${viewport.label}`, async ({ page }) => {
    const qualification = await installMusicQualificationMocks(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/recommendations/music");
    await expect.poll(qualification.ensureCalls).toBe(1);
    await expect(page.getByRole("heading", { name: "Create your first playlist" })).toBeVisible();

    const initialAudit = await new AxeBuilder({ page }).include("section.dashboard-theme").analyze();
    expect(initialAudit.violations).toEqual([]);

    const sharing = page.getByRole("button", { name: "Open playlist and sharing menu" });
    for (let index = 0; index < 80 && !(await sharing.evaluate((element) => element === document.activeElement)); index += 1) {
      await page.keyboard.press("Tab");
    }
    await expect(sharing).toBeFocused();
    await page.keyboard.press("Enter");
    const firstMenuItem = page.getByRole("menuitem", { name: "Private playlist" });
    await expect(firstMenuItem).toBeFocused();
    const sharingMenuItem = page.getByRole("menuitem", { name: "Sharing settings" });
    await sharingMenuItem.click();
    const dialog = page.getByRole("dialog", { name: "Music sharing" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radio")).toHaveCount(3);
    const privateMode = dialog.getByRole("radio", { name: "Private" });
    const publicMode = dialog.getByRole("radio", { name: "Public" });
    await expect(privateMode).toBeFocused();
    const dialogAudit = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(dialogAudit.violations).toEqual([]);
    await expectButtonsToMeetTouchTarget(dialog);

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(publicMode).toBeChecked();
    await expect(dialog.getByText("Anyone can view shared playlists, and the page can appear in search.")).toBeVisible();

    const save = dialog.getByRole("button", { name: "Save sharing" });
    for (let index = 0; index < 12 && !(await save.evaluate((element) => element === document.activeElement)); index += 1) {
      await page.keyboard.press("Tab");
    }
    await expect(save).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(sharing).toBeFocused();
    const publicAnnouncement = page.locator('p[role="status"]', { hasText: "Music is public." });
    await expect(publicAnnouncement).toBeVisible();
    await expect(publicAnnouncement.locator("xpath=ancestor-or-self::*[@role='status' or @aria-live][1]")).toBeAttached();
    expect(qualification.publicationMode()).toBe("public");
    expect(qualification.publicationCommands).toEqual([{
      body: { mode: "public" },
      idempotencyKey: expect.stringMatching(/^tunes-share-v1-\d{13}-[0-9a-f-]{36}$/),
    }]);

    await expectButtonsToMeetTouchTarget(page.locator("section.dashboard-theme"));
  });
}

for (const viewport of [
  { label: "mobile", width: 375, height: 820 },
  { label: "desktop", width: 1280, height: 900 },
]) {
  test(`approved owner workspace is responsive and complete on ${viewport.label}`, async ({ page }) => {
    const qualification = await installMusicQualificationMocks(page, {
      playlists: [{ id: 10, name: "Road songs", description: "For the drive", isVisibleToGuests: false, songs: [] }],
      ownerWorkspace: true,
    });
    await page.route("**/api/music/dashboard", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        queueRevision: 2,
        songs: [],
        currentlyPlaying: { id: 1, youtubeId: "abcdefghijk", title: "First song", artist: "Artist one", thumbnailUrl: "https://img.example/1", position: 0, status: "playing", playedAt: null },
        playedSongs: [],
        publication: { mode: "private", publicSlug: "qualification-public" },
        guestControls: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false },
      }),
    }));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/recommendations/music");

    const workspace = page.getByRole("region", { name: "Music workspace" });
    const pageActions = page.locator("[data-music-page-actions]");
    await expect(pageActions.getByRole("button", { name: "New playlist" })).toBeVisible();
    await page.getByRole("tab", { name: "Live" }).click();
    await expect(page.getByRole("searchbox", { name: "Search music or paste a URL" })).toBeVisible();
    await page.getByRole("button", { name: "Open discovery actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Add from URL" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Import playlist/ })).toBeDisabled();
    await page.getByRole("button", { name: "Open discovery actions" }).click();

    const searchRegion = page.getByRole("region", { name: "Music search region" });
    const playerRegion = page.getByRole("region", { name: "Music player region" });
    const [searchBox, playerBox] = await Promise.all([searchRegion.boundingBox(), playerRegion.boundingBox()]);
    expect((playerBox?.y ?? 0)).toBeGreaterThan((searchBox?.y ?? 0));
    await expect(page.getByTestId("video-surface")).toHaveAttribute("aria-hidden", "true");
    await page.getByRole("button", { name: "Show video" }).click();
    await expect(page.getByTestId("video-surface")).toHaveAttribute("aria-hidden", "false");
    await page.getByRole("button", { name: "Hide video" }).click();
    await expect(page.getByTestId("video-surface")).toHaveAttribute("aria-hidden", "true");

    const guestControls = page.getByRole("region", { name: "Guest controls" });
    await expect(guestControls.getByRole("switch")).toHaveCount(5);
    const songRequests = page.getByRole("switch", { name: "Allow song requests" });
    await songRequests.click();
    await expect(songRequests).toHaveAttribute("aria-checked", "true");
    expect(await playerRegion.evaluate((element) => getComputedStyle(element).position)).toBe(viewport.label === "mobile" ? "sticky" : "static");
    await expectButtonsToMeetTouchTarget(workspace);
    await page.getByRole("tab", { name: "Playlists" }).click();
    await expect(page.getByRole("button", { name: /^Road songs/ })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).include("section.dashboard-theme").analyze();
    const firstPartyViolations = audit.violations.filter((violation) => !(
      violation.id === "region"
      && violation.nodes.every((node) => JSON.stringify(node.target).includes("youtube-video"))
    ));
    expect(firstPartyViolations).toEqual([]);
    const artifactDirectory = resolve(process.cwd(), "../.artifacts/music-dashboard-responsive");
    mkdirSync(artifactDirectory, { recursive: true });
    await page.screenshot({ path: resolve(artifactDirectory, `owner-workspace-${viewport.label}.png`), fullPage: true });
  });
}
