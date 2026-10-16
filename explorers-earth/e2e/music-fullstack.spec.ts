import { expect, test } from "@playwright/test";
import { setupMockAuthentication } from "./setup/auth";
import { completeMusicAccount, installMusicQualificationMocks } from "./setup/music";

test.beforeEach(async ({ context }) => {
  await setupMockAuthentication(context);
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
    await testInfo.attach("sanitized-fixture-page", { body: await page.screenshot(), contentType: "image/png" });
  }
});

const qualificationPlaylist = {
  id: 7,
  name: "Road songs",
  description: "Before rename",
  isVisibleToGuests: false,
  songs: [],
};

for (const provider of ["google", "local"] as const) {
  test(`${provider === "local" ? "email" : "Google"} identity reaches one owner Music workspace without a second login`, async ({ page }) => {
    const audit = await installMusicQualificationMocks(page, { provider });
    await page.goto("/recommendations/music");
    await expect(page.getByRole("heading", { name: "Music", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create your first playlist" })).toBeVisible();
    expect(audit.ensureCalls()).toBe(1);
    // ADR-006: provisioning is a same-origin canonical command whose authority is the
    // session cookie. It carries no bearer at all, where it previously sent the Strapi
    // JWT as proof - asserting the absence is what proves the proof exchange is gone.
    const ensure = audit.requests.find(({ path }) => path === "/api/explorers/v1/music/identity/ensure");
    expect(ensure).toMatchObject({ method: "POST", xUsername: undefined });
    expect(ensure?.authorization).toBeUndefined();
    expect(audit.requests.some(({ path }) => path === "/api/music/identity/ensure")).toBe(false);
    const owner = audit.requests.find(({ path }) => path === "/api/playlists");
    expect(owner?.authorization).toBe(`Bearer ${audit.credential}`);
    expect(owner?.xUsername).toBeUndefined();
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(storage).not.toContain(audit.credential);
  });
}

test("unconfirmed and incomplete Accounts never create a Music identity", async ({ page }) => {
  const unconfirmed = await installMusicQualificationMocks(page, { confirmed: false });
  await page.goto("/recommendations/music");
  await expect(page.getByText("Finish your Explorer profile to use Music.")).toBeVisible();
  expect(unconfirmed.ensureCalls()).toBe(0);
});

test("an incomplete Account stays in Explorer onboarding and never calls ensure", async ({ page }) => {
  const incomplete = await installMusicQualificationMocks(page, { accounts: [] });
  await page.goto("/recommendations/music");
  await expect(page.getByText("Finish your Explorer profile to use Music.")).toBeVisible();
  expect(incomplete.ensureCalls()).toBe(0);
});

test("an ambiguous Account result is contained as one terminal identity conflict", async ({ page }) => {
  const audit = await installMusicQualificationMocks(page, {
    accounts: [completeMusicAccount],
    ensureStatus: 409,
    ensureCode: "ACCOUNT_AMBIGUOUS",
  });
  await page.goto("/recommendations/music");
  await expect(page.getByRole("status")).toHaveText("Music is temporarily unavailable.");
  await expect(page.getByRole("button", { name: "Get help" })).toBeVisible();
  expect(audit.ensureCalls()).toBe(1);
  await expect(page.getByRole("heading", { name: "Create your first playlist" })).toHaveCount(0);
});

test("an outage preserves the Explorer shell and explicit retry resumes sharing", async ({ page }) => {
  const audit = await installMusicQualificationMocks(page, { ensureFailures: 1 });
  await page.goto("/recommendations/music");
  await expect(page.getByRole("status")).toHaveText("Music is temporarily unavailable.");
  await expect(page.getByRole("link", { name: /Home/i }).or(page.getByRole("button", { name: /Home/i })).first()).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Create your first playlist" })).toBeVisible();
  await page.getByRole("button", { name: "Open playlist and sharing menu" }).click();
  await page.getByRole("menuitem", { name: "Sharing settings" }).click();
  await page.getByRole("radio", { name: "Unlisted" }).check();
  await page.getByRole("button", { name: "Save sharing" }).click();
  expect(audit.ensureCalls()).toBe(2);
});

test("an expired owner credential refreshes once, safely replays, and performs the authenticated live-sync read", async ({ page }) => {
  const audit = await installMusicQualificationMocks(page, {
    playlists: [qualificationPlaylist],
    ownerExpiredFailures: 1,
  });
  await page.goto("/recommendations/music");
  await expect(page.getByRole("button", { name: /^Road songs/ }).first()).toBeVisible();
  expect(audit.ensureCalls()).toBe(2);
  expect(audit.requests.filter(({ path }) => path === "/api/playlists")).toEqual([
    expect.objectContaining({ authorization: `Bearer ${audit.credential}`, xUsername: undefined }),
    expect.objectContaining({ authorization: `Bearer ${audit.renewedCredential}`, xUsername: undefined }),
    expect.objectContaining({ authorization: `Bearer ${audit.renewedCredential}`, xUsername: undefined }),
  ]);
});

test("an owner renames a playlist with one credential-bound idempotent mutation", async ({ page }) => {
  const audit = await installMusicQualificationMocks(page, { playlists: [qualificationPlaylist] });
  await page.goto("/recommendations/music");
  await page.getByRole("button", { name: /^Road songs/ }).first().click();
  await page.getByRole("button", { name: "Rename playlist" }).click();
  await page.getByRole("textbox", { name: "Playlist name" }).fill("Night roads");
  await page.getByRole("button", { name: "Save playlist" }).click();
  await expect(page.getByRole("heading", { name: "Night roads" })).toBeVisible();
  expect(audit.requests.find(({ method, path }) => method === "PATCH" && path === "/api/playlists/7"))
    .toMatchObject({
      authorization: `Bearer ${audit.credential}`,
      xUsername: undefined,
      body: { name: "Night roads", description: "Before rename" },
      idempotencyKey: expect.stringMatching(/^playlist-rename-/),
    });
});

test("closing the browser during identity ensure never reaches an owner request", async ({ page }) => {
  const audit = await installMusicQualificationMocks(page, { holdEnsure: true });
  const navigation = page.goto("/recommendations/music").catch(() => undefined);
  await audit.ensureStarted();
  const closing = page.close();
  await new Promise((resolve) => setTimeout(resolve, 25));
  audit.releaseEnsure();
  await Promise.all([navigation, closing]);
  expect(audit.requests.filter(({ path }) => path === "/api/playlists")).toHaveLength(0);
});
