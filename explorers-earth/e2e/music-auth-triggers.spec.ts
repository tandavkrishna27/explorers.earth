import { expect, test } from "@playwright/test";
import { completeMusicAccount } from "./setup/music";
import { installMusicAuthTriggerHarness } from "./setup/music-auth-trigger";

test.describe.configure({ mode: "parallel" });

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
    await testInfo.attach("sanitized-auth-trigger-page", { body: await page.screenshot(), contentType: "image/png" });
  }
});

test("the actual Google callback enables one bodyless identity ensure and immutable owner workspace", async ({ page }) => {
  const audit = await installMusicAuthTriggerHarness(page, { provider: "google", accounts: [completeMusicAccount] });
  expect(audit.ensureCalls()).toBe(0);
  await page.goto(`/google-auth/callback?access_token=${audit.applicationToken}`);
  await expect(page.getByText("Login successful! Redirecting...")).toBeVisible();
  await expect.poll(audit.ensureCalls).toBe(1);
  expect(audit.ensures).toEqual([{
    body: null,
    authorization: `Bearer ${audit.applicationToken}`,
    xUsername: undefined,
  }]);
  await page.goto("/recommendations/music");
  await expect(page.getByRole("heading", { name: "Create your first playlist" })).toBeVisible();
  expect(audit.ownerRequests).toContainEqual({ authorization: `Bearer ${audit.musicCredential}`, xUsername: undefined });
  expect(audit.createAccountCalls()).toBe(0);
});

test("confirmed email login completes real onboarding before the sole observer ensures exactly once", async ({ page }) => {
  const audit = await installMusicAuthTriggerHarness(page, { provider: "local", confirmed: true, accounts: [] });
  await page.goto("/email-confirmed");
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await page.getByRole("button", { name: "Go to login" }).click();
  await page.getByPlaceholder("Enter your username or email").fill("auth-trigger@example.invalid");
  await page.getByTestId("password-input").fill("correct-password");
  const loginRedirect = page.waitForURL(/\/home$/);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await loginRedirect;
  await expect(page).toHaveURL(/\/onboarding$/);
  // Authentication state redirects immediately; Login then performs its own
  // documented completion redirect after the success message delay. Observe
  // that second transition before entering data so it cannot remount the form.
  await page.waitForURL(/\/home$/);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText("Account", { exact: true })).toBeVisible();
  await expect.poll(audit.accountCheckCalls).toBeGreaterThan(0);
  expect(audit.ensureCalls()).toBe(0);

  await page.getByPlaceholder("Enter your display name").fill("Trigger Explorer");
  await expect(page.getByPlaceholder("Enter your username")).toHaveValue("riverstone");
  await page.getByPlaceholder("Tell us about yourself").fill("A qualification explorer account.");
  await page.getByLabel("Personal").check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Contact", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Enter your mobile number").fill("9876543210");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Address", exact: true })).toBeVisible();
  await page.getByPlaceholder("Enter city").fill("Austin");
  await page.getByPlaceholder("Enter state").fill("Texas");
  await page.getByPlaceholder("Enter country").fill("United States");
  await page.getByPlaceholder("Enter postal code").fill("78701");
  await page.getByPlaceholder("Enter primary address").fill("Austin, United States");
  await page.getByPlaceholder("Enter your address").fill("1 Qualification Way");
  await page.getByRole("button", { name: "Confirm Details" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });

  await expect.poll(audit.createAccountCalls).toBe(1);
  await expect(page).toHaveURL(/\/home$/);
  await expect.poll(audit.ensureCalls).toBe(1);
  expect(audit.createAccountCalls()).toBe(1);
  expect(audit.createdAccounts).toHaveLength(1);
  expect(audit.accounts()).toHaveLength(1);
  expect(audit.ensures).toEqual([{
    body: null,
    authorization: `Bearer ${audit.applicationToken}`,
    xUsername: undefined,
  }]);
  await page.goto("/recommendations/music");
  await expect(page.getByRole("heading", { name: "Create your first playlist" })).toBeVisible();
  expect(audit.ownerRequests).toContainEqual({ authorization: `Bearer ${audit.musicCredential}`, xUsername: undefined });
});

test("actual authentication triggers contain incomplete, unconfirmed, and ambiguous authority", async ({ page }) => {
  const incomplete = await installMusicAuthTriggerHarness(page, { provider: "google", accounts: [] });
  await page.goto(`/google-auth/callback?access_token=${incomplete.applicationToken}`);
  await expect.poll(incomplete.eligibilityQueries).toBeGreaterThan(0);
  expect(incomplete.ensureCalls()).toBe(0);
  await page.goto("/recommendations/music");
  await expect(page.getByText("Finish your Explorer profile to use Music.")).toBeVisible();

  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  const ambiguous = await installMusicAuthTriggerHarness(page, {
    provider: "google",
    accounts: [completeMusicAccount, { ...completeMusicAccount, documentId: "second-complete-account" }],
  });
  await page.goto(`/google-auth/callback?access_token=${ambiguous.applicationToken}`);
  await expect.poll(ambiguous.eligibilityQueries).toBeGreaterThan(0);
  expect(ambiguous.ensureCalls()).toBe(0);

  await page.evaluate(() => localStorage.clear());
  const unconfirmed = await installMusicAuthTriggerHarness(page, {
    provider: "local", confirmed: false, accounts: [completeMusicAccount],
  });
  await page.goto("/login");
  await page.getByPlaceholder("Enter your username or email").fill("unconfirmed@example.invalid");
  await page.getByTestId("password-input").fill("correct-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.goto("/recommendations/music");
  await expect(page.getByText("Finish your Explorer profile to use Music.")).toBeVisible();
  expect(unconfirmed.ensureCalls()).toBe(0);
});
