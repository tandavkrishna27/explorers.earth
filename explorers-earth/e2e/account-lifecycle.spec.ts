import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { setupMockAuthentication } from "./setup/auth";
import { canonicalCategoryAccount } from "../src/test/canonicalAccountFixture";

/**
 * Canonical account lifecycle in the browser.
 *
 * This spec previously drove a Music-mediated deletion saga: a Strapi
 * `UpdateUsersPermissionsUser` block ordered against Music
 * `/api/music/identity/lifecycle/{suspend,resume,cancel}` calls, with
 * boundary-crossing, dead-letter escalation and compensation. Settings no longer
 * has that flow. It uses `createCanonicalAccountLifecycleService`, which derives
 * identity from the Better Auth cookie and speaks four commands:
 *
 *   GET  /api/explorers/v1/account/lifecycle
 *   POST /api/explorers/v1/account/deactivation       { expectedRevision }
 *   POST /api/explorers/v1/account/deletion           { expectedRevision, feedbackId }
 *   POST /api/explorers/v1/account/deletion-feedback  { reason }
 *
 * Per the 2026-10-05 lifecycle acceptance ledger, a replaced protocol loses only
 * the obsolete assertion while every safety behaviour stays required. The rows
 * carried over, and where each one now lives:
 *
 *   authority fails closed before any destructive control -> "unresolved ... authority"
 *   finalized deletion hides every delete entry point     -> "a finalized deletion ..."
 *   pending deletion survives reload and a second tab     -> "a pending deletion ..."
 *   cancel only before the boundary                       -> "cancelling a pending deletion ..."
 *   deactivation ends at login                            -> "deactivation issues exactly one ..."
 *   refuses anything outside the durable tuple            -> "a stale revision ..."
 *   a lost mutation response keeps user authority          -> "a lost deletion response ..."
 *   retries one durable submission                        -> "deletion records trimmed feedback ..."
 *   in-flight cancel/boundary under replacement identity  -> "an identity change mid-flight ..."
 *
 * Rows whose protocol no longer exists are not re-created as invented coverage:
 * Music suspend-before-Strapi-block ordering, Music suspension outage, pending
 * Music deletion gating Strapi deactivation, unconfirmed Strapi block
 * compensation, Music resume after token refresh, and dead-letter escalation.
 * There is no Music step in canonical deactivation or deletion and no Strapi
 * mutation to order against, so those assertions describe a flow the product does
 * not perform. Music credential teardown on logout is still covered, by
 * `music.spec.ts` ("logout boundary clears Explorer authentication in another tab").
 */

type LifecycleStatus = "active" | "suspended" | "pending_deletion" | "deleted";

type LifecycleCommand = { path: string; body: unknown; idempotencyKey: string | null };

const ACCOUNT_REVISION = 1;
const openSettings = (page: Page) => page.goto("/settings", { waitUntil: "domcontentloaded" });
const reloadSettings = (page: Page) => page.reload({ waitUntil: "domcontentloaded" });

/** The danger-zone row, which is hidden while lifecycle authority is unresolved. */
const deleteEntryPoint = (page: Page) => page.getByRole("button", { name: /^Delete your account\?/ });
const deactivateEntryPoint = (page: Page) => page.getByRole("button", { name: /^Deactivate your account\?/ });

async function mockSettings(
  context: BrowserContext,
  initialStatus: LifecycleStatus,
  commands: LifecycleCommand[] = [],
  options: {
    statusMode?: "normal" | "delayed" | "error";
    expectedRevision?: number;
    loseDeletionResponseOnce?: boolean;
    beforeCommandReply?: (path: string) => Promise<void>;
  } = {},
) {
  let status = initialStatus;
  let loseDeletionResponse = options.loseDeletionResponseOnce === true;
  const fixtureOrigin = new URL(String(test.info().project.use.baseURL));
  if (fixtureOrigin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(fixtureOrigin.hostname)) {
    throw new Error("Account lifecycle fixtures require a configured loopback HTTP baseURL.");
  }
  const account = canonicalCategoryAccount({ handle: "testuser", revision: ACCOUNT_REVISION });
  const lifecycle = () => ({
    accountId: account.id,
    status,
    operationId: status === "active" ? null : "canonical-lifecycle-operation",
    revision: account.revision,
  });

  // This spec is a synthetic fixture only. Never forward an unhandled data
  // request, including when someone invokes it outside the isolated config.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const local = url.origin === fixtureOrigin.origin;
    const dataRequest = ["fetch", "xhr", "eventsource"].includes(route.request().resourceType());
    if (local && route.request().method() === "GET" && !dataRequest
      && !url.pathname.startsWith("/api/") && url.pathname !== "/graphql") await route.continue();
    else await route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await setupMockAuthentication(context, { cookieDomain: fixtureOrigin.hostname });

  await context.route("**/api/explorers/v1/me", route => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).origin !== fixtureOrigin.origin) {
      return route.abort("blockedbyclient");
    }
    return route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ account }),
    });
  });

  await context.route("**/api/explorers/v1/account/lifecycle", async route => {
    if (route.request().method() !== "GET") return route.abort("blockedbyclient");
    if (options.statusMode === "delayed") await new Promise((settle) => setTimeout(settle, 2_000));
    if (options.statusMode === "error") {
      return route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "Lifecycle state is unavailable." } }),
      });
    }
    return route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ lifecycle: lifecycle() }),
    });
  });

  await context.route("**/api/explorers/v1/account/deletion-feedback", async route => {
    if (route.request().method() !== "POST") return route.abort("blockedbyclient");
    const request = route.request();
    commands.push({ path: "deletion-feedback", body: request.postDataJSON(), idempotencyKey: request.headers()["idempotency-key"] ?? null });
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ feedback: { id: "canonical-feedback-1" } }),
    });
  });

  for (const command of ["deactivation", "deletion"] as const) {
    await context.route(`**/api/explorers/v1/account/${command}`, async route => {
      const request = route.request();
      if (request.method() !== "POST") return route.abort("blockedbyclient");
      const body = request.postDataJSON() as { expectedRevision?: number };
      commands.push({ path: command, body, idempotencyKey: request.headers()["idempotency-key"] ?? null });
      await options.beforeCommandReply?.(command);
      if (body.expectedRevision !== (options.expectedRevision ?? account.revision)) {
        return route.fulfill({
          status: 409, contentType: "application/json",
          body: JSON.stringify({ error: { code: "CONFLICT", message: "The account changed. Refresh and try again." } }),
        });
      }
      if (command === "deletion" && loseDeletionResponse) {
        loseDeletionResponse = false;
        return route.abort("connectionreset");
      }
      status = command === "deactivation" ? "suspended" : "pending_deletion";
      return route.fulfill({
        status: 200, contentType: "application/json", body: JSON.stringify({ lifecycle: lifecycle() }),
      });
    });
  }

  // Recovery is the only route out of a pending deletion, and signing out is the
  // tail of both destructive commands.
  await context.route("**/api/explorers/v1/recovery/start", route =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
      : route.abort("blockedbyclient"));
  await context.route("**/api/auth/sign-out", route =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
      : route.abort("blockedbyclient"));

  await context.route("**/graphql", async (route) => {
    const query = String(route.request().postDataJSON()?.query ?? "");
    const currentUser = {
      __typename: "UsersPermissionsUser",
      id: "mock-user-123", documentId: "mock-user-123", username: "testuser", email: "test@example.test",
      blocked: false, provider: "google", confirmed: true, accounts: [],
    };
    const data: Record<string, unknown> = query.includes("usersPermissionsUser") || query.includes("CheckOnboardingStatus")
      ? { usersPermissionsUser: currentUser }
      : {
        bookLists: [], gameLists: [], appLists: [], productLists: [], movieLists: [], personLists: [],
        guides: [], recommendationLists: [], subscriptions: [], plans: [], accounts: [],
      };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  });

  return { account };
}

/**
 * Replaces the signed-in identity the way the canonical store does, which bumps the
 * session generation. `useAccountLifecycleIdentity` watches that generation, so any
 * in-flight lifecycle command is abandoned rather than applied to the new account.
 */
async function switchFixtureIdentity(page: Page) {
  await page.evaluate(async () => {
    const path = "/src/store/store.ts";
    const { default: store } = await import(/* @vite-ignore */ path);
    const generation = store.getState().beginVerification();
    store.getState().acceptVerified(generation, {
      id: "22222222-2222-4222-8222-222222222222", userId: "fixture-user-b",
      username: "replacement", email: "b@example.test", onboardingStatus: "complete", revision: 9,
    });
  });
}

/**
 * Walks the delete modal from the danger zone to the final confirmation. The username
 * is readonly and prefilled from the signed-in account, and the password step is only
 * rendered for a non-Google provider, so neither is typed here.
 */
async function openDeletionConfirmation(page: Page, reason = "  Leaving for now  ") {
  await deleteEntryPoint(page).click();
  await page.getByRole("button", { name: "Continue with deletion" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder("Please let us know the reason for leaving...").fill(reason);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder("Type 'CONFIRM DELETE' to confirm").fill("CONFIRM DELETE");
}

/** Deactivation confirms against the readonly prefilled username, so nothing is typed. */
async function confirmDeactivation(page: Page) {
  await deactivateEntryPoint(page).click();
  await page.getByRole("button", { name: "Deactivate My Account" }).click();
}

for (const statusMode of ["delayed", "error"] as const) {
  test(`unresolved ${statusMode} lifecycle authority fails closed before any destructive control`, async ({ context, page }) => {
    // Break caught: an unresolved lifecycle read leaves a destructive entry point
    // reachable, so a deletion can be started against unknown account state.
    const commands: LifecycleCommand[] = [];
    await mockSettings(context, "active", commands, { statusMode });
    await openSettings(page);

    await expect(page.getByRole("tab", { name: "Account", exact: true })).toBeVisible();
    await expect(deleteEntryPoint(page)).toHaveCount(0);
    expect(commands).toEqual([]);
  });
}

test("a finalized deletion hides every ordinary delete entry point and performs no destructive call", async ({ context, page }) => {
  // Break caught: a terminal account still offers deletion, which would issue a
  // command against an account that no longer exists.
  const commands: LifecycleCommand[] = [];
  await mockSettings(context, "deleted", commands);
  await openSettings(page);

  // Filtered, not a bare status role: the shell renders its own loading and
  // "verifying your account" statuses, so on a slower runner a bare getByRole
  // resolves to several elements and fails strict mode before this one appears.
  await expect(page.getByRole("status").filter({ hasText: "Account deletion is complete." }))
    .toBeVisible();
  await expect(deleteEntryPoint(page)).toHaveCount(0);
  expect(commands).toEqual([]);
});

test("a pending deletion survives reload and a second tab", async ({ context, page }) => {
  // Break caught: pending deletion is held in component state only, so a reload or a
  // second tab shows an ordinary account and re-offers deletion.
  const commands: LifecycleCommand[] = [];
  await mockSettings(context, "pending_deletion", commands);
  await openSettings(page);

  const paused = page.getByRole("status").filter({ hasText: "Account deletion is pending." });
  await expect(paused).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel deletion with Google" })).toBeVisible();

  await reloadSettings(page);
  await expect(page.getByRole("button", { name: "Cancel deletion with Google" })).toBeVisible();

  const secondTab = await context.newPage();
  await openSettings(secondTab);
  await expect(secondTab.getByRole("button", { name: "Cancel deletion with Google" })).toBeVisible();
  await secondTab.close();

  expect(commands).toEqual([]);
});

test("cancelling a pending deletion requires a fresh Google recovery and issues no lifecycle command", async ({ context, page }) => {
  // Break caught: cancellation is accepted from the pending session itself. A pending
  // deletion has no ordinary Actor, so the only way back is a fresh recovery proof.
  const commands: LifecycleCommand[] = [];
  await mockSettings(context, "pending_deletion", commands);
  await openSettings(page);

  await page.getByRole("button", { name: "Cancel deletion with Google" }).click();
  await expect(page).toHaveURL(/\/reactivate$/);
  expect(commands).toEqual([]);
});

test("checking a pending deletion re-reads the authority without mutating it", async ({ context, page }) => {
  // Break caught: the status control reuses a destructive command, or reports a cached
  // state the server never confirmed.
  const commands: LifecycleCommand[] = [];
  const reads: string[] = [];
  await mockSettings(context, "pending_deletion", commands);
  page.on("request", (request) => {
    if (request.url().endsWith("/api/explorers/v1/account/lifecycle")) reads.push(request.method());
  });
  await openSettings(page);
  await expect(page.getByRole("button", { name: "Check deletion status" })).toBeVisible();
  const before = reads.length;

  await page.getByRole("button", { name: "Check deletion status" }).click();

  await expect.poll(() => reads.length).toBeGreaterThan(before);
  expect(reads.every((method) => method === "GET")).toBe(true);
  expect(commands).toEqual([]);
});

test("deactivation issues exactly one canonical command carrying the observed revision and ends at login", async ({ context, page }) => {
  // Break caught: deactivation runs through Strapi, omits the revision it observed, or
  // leaves the browser authenticated after the server revoked the session.
  const commands: LifecycleCommand[] = [];
  await mockSettings(context, "active", commands);
  await openSettings(page);

  await confirmDeactivation(page);

  await expect(page).toHaveURL(/\/login$/);
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({ path: "deactivation", body: { expectedRevision: ACCOUNT_REVISION } });
  expect(commands[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
});

test("a stale revision cannot deactivate and reports without a second command", async ({ context, page }) => {
  // Break caught: a rejected command is retried blind, or the failure is reported as
  // success and the browser signs itself out of a still-active account.
  const commands: LifecycleCommand[] = [];
  await mockSettings(context, "active", commands, { expectedRevision: ACCOUNT_REVISION + 5 });
  await openSettings(page);

  await confirmDeactivation(page);

  await expect(page.getByText("The account changed. Refresh and try again.")).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  expect(commands.filter((command) => command.path === "deactivation")).toHaveLength(1);
});

test("deletion records trimmed feedback once and then issues one durable deletion command", async ({ context, page }) => {
  // Break caught: untrimmed feedback reaches the server, or the deletion is sent without
  // the feedback the account owner actually submitted.
  const commands: LifecycleCommand[] = [];
  await mockSettings(context, "active", commands);
  await openSettings(page);

  await openDeletionConfirmation(page);
  await page.getByRole("button", { name: "Delete My Account" }).click();

  await expect(page).toHaveURL(/\/login$/);
  expect(commands.map((command) => command.path)).toEqual(["deletion-feedback", "deletion"]);
  expect(commands[0].body).toEqual({ reason: "Leaving for now" });
  expect(commands[1]).toMatchObject({
    path: "deletion", body: { expectedRevision: ACCOUNT_REVISION, feedbackId: "canonical-feedback-1" },
  });
});

test("a lost deletion response keeps authority and the retry reuses the same durable key", async ({ context, page }) => {
  // Break caught: a dropped response is treated as a completed deletion, or the retry
  // mints a new idempotency key and so is no longer the same durable attempt.
  const commands: LifecycleCommand[] = [];
  await mockSettings(context, "active", commands, { loseDeletionResponseOnce: true });
  await openSettings(page);

  await openDeletionConfirmation(page);
  await page.getByRole("button", { name: "Delete My Account" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.getByRole("button", { name: "Delete My Account" }).click();
  await expect(page).toHaveURL(/\/login$/);

  const deletions = commands.filter((command) => command.path === "deletion");
  expect(deletions).toHaveLength(2);
  expect(deletions[0].idempotencyKey).toBe(deletions[1].idempotencyKey);
  expect(commands.filter((command) => command.path === "deletion-feedback")).toHaveLength(1);
});

test("an identity change mid-flight abandons the in-flight lifecycle command", async ({ context, page }) => {
  // Break caught: a command authorized by one session completes against whichever
  // identity is signed in when the response lands, and navigates or signs it out.
  const commands: LifecycleCommand[] = [];
  let release!: () => void;
  const held = new Promise<void>((settle) => { release = settle; });
  await mockSettings(context, "active", commands, { beforeCommandReply: async () => { await held; } });
  await openSettings(page);

  await confirmDeactivation(page);
  await expect.poll(() => commands.length).toBe(1);

  await switchFixtureIdentity(page);
  release();

  // The replacement identity keeps its own session and is never navigated by the
  // abandoned command, and no second command is issued on its behalf.
  await expect(page).not.toHaveURL(/\/login$/);
  await expect.poll(() => commands.length).toBe(1);
});
