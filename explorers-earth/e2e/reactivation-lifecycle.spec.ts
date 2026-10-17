import { expect, test } from "@playwright/test";

test("reactivation replacement conflict is rendered as retry-safe failure", async ({ context, page }) => {
  const calls: string[] = [];
  await context.route("**/api/user/reactivate?**", async (route) => {
    calls.push(route.request().url());
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ success: false, error: "Failed to verify the current account identity. Please request a new link." }),
    });
  });

  await page.goto("/reactivate-confirm?token=opaque-test-token");
  await expect(page.getByText("Failed to verify the current account identity. Please request a new link.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request New Link" })).toBeVisible();
  expect(calls).toHaveLength(1);
});

test("permanently removed Music identity remains a retry-safe reactivation failure", async ({ context, page }) => {
  // Break caught: a tombstoned Music tuple is presented as completed Explorer reactivation.
  let calls = 0;
  await context.route("**/api/user/reactivate?**", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ success: false, error: "Failed to reactivate account. Please try again." }),
    });
  });

  await page.goto("/reactivate-confirm?token=tombstoned-test-token");
  await expect(page.getByText("Failed to reactivate account. Please try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request New Link" })).toBeVisible();
  expect(calls).toBe(1);
});

test("exact current reactivation tuple reaches the completion destination", async ({ context, page }) => {
  await context.route("**/api/user/reactivate?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true }),
  }));

  await page.goto("/reactivate-confirm?token=opaque-test-token");
  await expect(page.getByRole("button", { name: /go to login/i })).toBeVisible();
});
