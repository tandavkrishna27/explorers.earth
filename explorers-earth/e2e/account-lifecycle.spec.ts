import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { setupMockAuthentication } from "./setup/auth";
import { canonicalAccountFixture } from "../src/test/canonicalAccountFixture";

type LifecycleOperation = {
  operationId: string;
  status: "pending_deletion" | "suspended" | "tombstoned" | "not_present";
  phase: "prepared" | "finalized";
  state: "completed" | "requested" | "running" | "failed" | "cancelled";
  boundaryCrossed: boolean;
  retryable: boolean;
  deadLetter: boolean;
};

const envelope = (operation: LifecycleOperation, userDocumentId = "mock-user-123") => ({
  version: "music-lifecycle/v1",
  operation: {
    ...operation,
    upstreamUserDocumentId: userDocumentId,
    upstreamAccountDocumentId: userDocumentId === "mock-user-123" ? "account-document-123" : "account-document-b",
  },
});

const openSettings = (page: Page) => page.goto("/settings", { waitUntil: "domcontentloaded" });
const reloadSettings = (page: Page) => page.reload({ waitUntil: "domcontentloaded" });

async function mockSettings(
  context: BrowserContext,
  operation: LifecycleOperation,
  events: string[] = [],
  options: {
    loseAccountDeleteResponseOnce?: boolean;
    statusMode?: "normal" | "delayed" | "error";
    additionalAccount?: boolean;
    provider?: "google" | "local";
    musicNotPresent?: boolean;
    suspensionUnavailable?: boolean;
    suspensionPendingDeletion?: boolean;
    strapiBlockUnconfirmed?: boolean;
    cancelAsNotPresent?: boolean;
    loseCancelResponseOnce?: boolean;
    resumeFailsOnce?: boolean;
    accountAbsent?: boolean;
    beforeLifecycleReply?: (action: string) => Promise<void>;
  } = {},
) {
  let accountPresent = !options.accountAbsent;
  let loseAccountDeleteResponse = options.loseAccountDeleteResponseOnce === true;
  let loseCancelResponse = options.loseCancelResponseOnce === true;
  let resumeFails = options.resumeFailsOnce === true;
  const fixtureOrigin = new URL(String(test.info().project.use.baseURL));
  if (fixtureOrigin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(fixtureOrigin.hostname)) {
    throw new Error("Account lifecycle fixtures require a configured loopback HTTP baseURL.");
  }
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
  // The canonical login account remains available independently of the legacy
  // Music binding absence/deletion states exercised below.
  await context.route("**/api/explorers/v1/me", route => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).origin !== fixtureOrigin.origin) return route.abort("blockedbyclient");
    return route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ account: canonicalAccountFixture({
      handle: "testuser",
    }) }),
    });
  });
  await context.route("**/api/music/identity/lifecycle/**", async (route) => {
    const action = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const userDocumentId = route.request().headers().authorization?.includes("fixture-user-b") ? "fixture-user-b" : "mock-user-123";
    events.push(action);
    await options.beforeLifecycleReply?.(action);
    if (action === "suspend" && options.suspensionUnavailable) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: {
        code: "LIFECYCLE_UNAVAILABLE", message: "Music lifecycle is unavailable.", retryable: true,
      } }) });
      return;
    }
    if (action === "suspend" && options.suspensionPendingDeletion) {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: {
        code: "IDENTITY_PENDING_DELETION", message: "This Music identity is pending deletion.", retryable: false,
      } }) });
      return;
    }
    if (action === "status" && options.statusMode === "delayed") await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (action === "status" && options.statusMode === "error") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: {
        code: "UPSTREAM_UNAVAILABLE", message: "Lifecycle state unavailable.", retryable: true,
      } }) });
      return;
    }
    if (action === "cancel") {
      operation = {
        ...operation,
        status: options.cancelAsNotPresent ? "not_present" : "suspended",
        state: "cancelled",
        boundaryCrossed: false,
        retryable: false,
      };
      if (loseCancelResponse) {
        loseCancelResponse = false;
        await route.abort("connectionreset");
        return;
      }
    }
    if (action === "suspend") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: "music-lifecycle/v1",
          identity: { status: options.musicNotPresent ? "not_present" : "suspended" },
        }),
      });
      return;
    }
    if (action === "resume") {
      if (resumeFails) {
        resumeFails = false;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: {
          code: "SERVICE_UNAVAILABLE", message: "Fixture Music resume unavailable.", retryable: true,
        } }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: "music-lifecycle/v1", identity: { status: options.musicNotPresent ? "not_present" : "active" } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope(operation, userDocumentId)) });
  });
  await context.route("**/graphql", async (route) => {
    const query = String(route.request().postDataJSON()?.query ?? "");
    const requestedUser = route.request().postDataJSON()?.variables?.documentId;
    const userDocumentId = requestedUser === "fixture-user-b" ? "fixture-user-b" : "mock-user-123";
    const account = {
      __typename: "Account",
      Account_Name: "Test", Account_Type: "Explorer", mobile_number: "+15555550100",
      documentId: "account-document-123", username: "testuser", localtunes_integrated: "No",
      localtunes_public: "No", public_profile: "Yes", public_recommendations: "No", public_music: "No",
      public_movie: "No", public_guides: "No", public_books: "No", public_games: "No", public_apps: "No",
      public_products: "No", public_people: "No", pinned_nav_tabs: [], auto_pinning: false,
      Bio: null, Addresss: null, Primary_Address: null, Public_Profile_Address: null,
      Feed_Data: null, social_media: [], mobile_number_visibility: false,
      profile_picture: null, bg_picture: null,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    if (userDocumentId === "fixture-user-b") account.documentId = "account-document-b";
    const currentUser = {
      __typename: "UsersPermissionsUser",
      id: userDocumentId, documentId: userDocumentId, username: "testuser", email: "test@example.test",
      blocked: false, provider: options.provider ?? "google", confirmed: true,
      mobile_number: "+15555550100", mobile_number_visibility: false,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      accounts: accountPresent ? [account] : [],
    };
    let data: Record<string, unknown>;
    if (query.includes("mutation login")) {
      events.push("login");
      data = { login: { jwt: "mock-jwt-token-xyz", user: currentUser } };
    } else if (query.includes("mutation UpdateUsersPermissionsUser")) {
      events.push("strapi-block");
      data = options.strapiBlockUnconfirmed
        ? { updateUsersPermissionsUser: { data: null } }
        : { updateUsersPermissionsUser: { data: { ...currentUser, blocked: true } } };
    } else if (query.includes("mutation DeleteExplorerAccount")) {
      events.push("account-delete");
      accountPresent = false;
      if (loseAccountDeleteResponse) {
        loseAccountDeleteResponse = false;
        await route.abort("connectionreset");
        return;
      }
      data = { deleteAccount: { __typename: "Account", documentId: "account-document-123" } };
    } else if (query.includes("mutation DeleteExplorerUser")) {
      events.push("user-delete");
      data = {
        deleteRecommendationList: { __typename: "RecommendationList", documentId: "mock-user-123" },
        deleteUsersPermissionsUser: { data: { __typename: "UsersPermissionsUser", documentId: "mock-user-123", accounts: [{ __typename: "Account", Account_Name: "Test", Account_Type: "Explorer", documentId: "account-document-123", Bio: null, Addresss: null }] } },
      };
    } else if (query.includes("CheckOnboardingStatus")) {
      data = { usersPermissionsUser: currentUser };
    } else if (query.includes("query Account")) {
      data = { accounts: accountPresent ? [account] : [] };
    } else if (query.includes("usersPermissionsUser")) {
      const deletionPresenceRead = query.includes("username") && query.includes("accounts") && !query.includes("Account_Name");
      data = { usersPermissionsUser: deletionPresenceRead && options.additionalAccount
        ? { ...currentUser, accounts: [account, { ...account, documentId: "account-document-b" }] }
        : currentUser };
    } else {
      data = {
        bookLists: [], gameLists: [], appLists: [], productLists: [], movieLists: [], personLists: [],
        guides: [], recommendationLists: [], subscriptions: [], plans: [],
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
}

async function switchFixtureIdentity(page: Page, documentId = "fixture-user-b") {
  await page.evaluate(async (nextDocumentId) => {
    const path = "/src/store/store.ts";
    const { default: store } = await import(/* @vite-ignore */ path);
    store.getState().login({
      id: nextDocumentId, documentId: nextDocumentId, username: "testuser", email: "test@example.test", blocked: false,
      token: nextDocumentId === "mock-user-123" ? "mock-jwt-token-xyz" : "mock-jwt-fixture-user-b",
    });
  }, documentId);
}

for (const action of ["cancel", "boundary"] as const) {
  test(`an in-flight ${action} cannot continue under replacement identity`, async ({ context, page }) => {
    const events: string[] = [];
    let release!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    await mockSettings(context, {
      operationId: "delete-operation-durable", status: "pending_deletion", phase: "prepared",
      state: action === "cancel" ? "completed" : "requested",
      boundaryCrossed: action === "boundary", retryable: action === "boundary", deadLetter: false,
    }, events, { beforeLifecycleReply: async (currentAction) => { if (currentAction === action) await paused; } });
    await openSettings(page);
    await page.getByRole("button", { name: action === "cancel" ? "Cancel deletion" : "Retry account deletion" }).click();
    await expect.poll(() => events.includes(action)).toBe(true);
    await switchFixtureIdentity(page);
    await expect(page.getByRole("tab", { name: "Account", exact: true })).toBeVisible();
    const completion = page.waitForResponse((response) => response.url().endsWith(`/lifecycle/${action}`));
    release();
    await (await completion).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    // Flush the old response and any ensuing microtasks before checking calls.
    await expect.poll(() => events.filter((event) => event === "status").length).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole("button", { name: action === "cancel" ? "Cancel deletion" : "Retry account deletion" })).toBeVisible();
    expect(events.filter((event) => ["resume", "account-delete", "user-delete"].includes(event))).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem("auth-storage"))).toContain("fixture-user-b");
  });
}

test("same-identity partial cancellation retries only Music resume after token refresh", async ({ context, page }) => {
  const events: string[] = [];
  await mockSettings(context, {
    operationId: "delete-operation-durable", status: "pending_deletion", phase: "prepared", state: "completed",
    boundaryCrossed: false, retryable: false, deadLetter: false,
  }, events, { resumeFailsOnce: true });
  await openSettings(page);
  await page.getByRole("button", { name: "Cancel deletion" }).click();
  await expect(page.getByText("Fixture Music resume unavailable.")).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/store/store.ts";
    const { default: store } = await import(/* @vite-ignore */ path);
    store.setState({ token: "refreshed-fixture-token-a" });
  });
  await page.getByRole("button", { name: "Cancel deletion" }).click();
  await expect(page.getByText("Account deletion was cancelled and Music was reactivated.")).toBeVisible();
  expect(events.filter((event) => ["cancel", "resume"].includes(event))).toEqual(["cancel", "resume", "resume"]);
});

test("a never-provisioned Explorer identity treats exact Music absence as a safe deactivation no-op", async ({ context, page }) => {
  const events: string[] = [];
  await mockSettings(context, {
    operationId: "delete-operation-durable", status: "not_present", phase: "prepared", state: "cancelled",
    boundaryCrossed: false, retryable: false, deadLetter: false,
  }, events, { musicNotPresent: true });
  await openSettings(page);
  await page.getByRole("button", { name: "Deactivate your account?" }).click();
  await page.getByRole("button", { name: "Deactivate My Account" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(events.filter((event) => ["suspend", "strapi-block"].includes(event))).toEqual(["suspend", "strapi-block"]);
});

for (const provider of ["google", "local"] as const) {
  test(`${provider} account deactivation suspends Music before blocking Strapi`, async ({ context, page }) => {
    const events: string[] = [];
    await mockSettings(context, {
      operationId: "delete-operation-durable", status: "suspended", phase: "prepared", state: "cancelled",
      boundaryCrossed: false, retryable: false, deadLetter: false,
    }, events, { provider });
    await openSettings(page);
    await page.getByRole("button", { name: "Deactivate your account?" }).click();
    if (provider === "local") await page.getByPlaceholder("Enter your current password").fill("valid-password");
    await page.getByRole("button", { name: "Deactivate My Account" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(events.filter((event) => ["login", "suspend", "strapi-block"].includes(event))).toEqual(
      provider === "local" ? ["login", "suspend", "strapi-block"] : ["suspend", "strapi-block"],
    );
  });
}

test("Music suspension outage leaves Strapi and browser authority active for retry", async ({ context, page }) => {
  const events: string[] = [];
  await mockSettings(context, {
    operationId: "delete-operation-durable", status: "suspended", phase: "prepared", state: "cancelled",
    boundaryCrossed: false, retryable: false, deadLetter: false,
  }, events, { suspensionUnavailable: true });
  await openSettings(page);
  await page.getByRole("button", { name: "Deactivate your account?" }).click();
  await page.getByRole("button", { name: "Deactivate My Account" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  expect(events.filter((event) => event === "strapi-block")).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("auth-storage"))).toContain("mock-jwt-token-xyz");
});

test("pending Music deletion prevents Strapi deactivation and browser auth cleanup", async ({ context, page }) => {
  // Break caught: pending/dead-letter Music deletion is swallowed as not-present and Settings logs the user out.
  const events: string[] = [];
  await mockSettings(context, {
    operationId: "delete-operation-durable", status: "suspended", phase: "prepared", state: "cancelled",
    boundaryCrossed: false, retryable: false, deadLetter: false,
  }, events, { suspensionPendingDeletion: true });
  await openSettings(page);
  await page.getByRole("button", { name: "Deactivate your account?" }).click();
  await page.getByRole("button", { name: "Deactivate My Account" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  expect(events.filter((event) => event === "strapi-block")).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("auth-storage"))).toContain("mock-jwt-token-xyz");
});

test("an unconfirmed Strapi block compensates Music without reporting success", async ({ context, page }) => {
  const events: string[] = [];
  await mockSettings(context, {
    operationId: "delete-operation-durable", status: "suspended", phase: "prepared", state: "cancelled",
    boundaryCrossed: false, retryable: false, deadLetter: false,
  }, events, { strapiBlockUnconfirmed: true });
  await openSettings(page);
  await page.getByRole("button", { name: "Deactivate your account?" }).click();
  await page.getByRole("button", { name: "Deactivate My Account" }).click();
  await expect.poll(() => events.filter((event) => event === "strapi-block").length).toBe(1);
  await expect(page).toHaveURL(/\/settings$/);
  await expect.poll(() => events.filter((event) => ["suspend", "strapi-block", "resume"].includes(event)))
    .toEqual(["suspend", "strapi-block", "resume"]);
  expect(await page.evaluate(() => localStorage.getItem("auth-storage"))).toContain("mock-jwt-token-xyz");
});

async function assertNoLifecyclePersistence(page: Page) {
  const persisted = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
    url: location.href,
    cookies: document.cookie,
  }));
  expect(JSON.stringify(persisted)).not.toContain("delete-operation-durable");
  expect(persisted.url).not.toMatch(/operation|secret/i);
}

test("pending deletion survives reload and a second tab, then cancels only before the boundary", async ({ context, page }) => {
  const pending: LifecycleOperation = {
    operationId: "delete-operation-durable", status: "pending_deletion", phase: "prepared", state: "completed",
    boundaryCrossed: false, retryable: false, deadLetter: false,
  };
  await mockSettings(context, pending);
  await openSettings(page);
  await expect(page.getByText("Account deletion is prepared. Music access is paused.")).toBeVisible();
  await reloadSettings(page);
  await expect(page.getByRole("button", { name: "Cancel deletion" })).toBeVisible();
  const secondTab = await context.newPage();
  await openSettings(secondTab);
  await expect(secondTab.getByText("Account deletion is prepared. Music access is paused.")).toBeVisible();
  await assertNoLifecyclePersistence(page);
  await page.getByRole("button", { name: "Cancel deletion" }).click();
  await expect(page.getByText("Account deletion is prepared. Music access is paused.")).toBeHidden();
});

test("a lost nullable cancel response reloads the exact cancelled terminal state without another prepare", async ({ context, page }) => {
  // Break caught: a never-provisioned cancellation is collapsed to LIFECYCLE_NOT_FOUND after the response is lost.
  const events: string[] = [];
  await mockSettings(context, {
    operationId: "delete-operation-durable", status: "pending_deletion", phase: "prepared", state: "completed",
    boundaryCrossed: false, retryable: false, deadLetter: false,
  }, events, { cancelAsNotPresent: true, loseCancelResponseOnce: true });
  await openSettings(page);
  await page.getByRole("button", { name: "Cancel deletion" }).click();
  await expect.poll(() => events.filter((event) => event === "cancel").length).toBe(1);
  await reloadSettings(page);
  await expect(page.getByText("Account deletion is prepared. Music access is paused.")).toBeHidden();
  await expect(page.getByRole("button", { name: "Delete your account?" })).toBeVisible();
  expect(events.filter((event) => event === "prepare")).toEqual([]);
  await assertNoLifecyclePersistence(page);
});

test("a crossed-boundary retry preserves ordering and completes at login", async ({ context, page }) => {
  const events: string[] = [];
  await mockSettings(context, {
    operationId: "delete-operation-durable", status: "pending_deletion", phase: "prepared", state: "requested",
    boundaryCrossed: true, retryable: true, deadLetter: false,
  }, events);
  await openSettings(page);
  await page.getByRole("button", { name: "Retry account deletion" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(events.filter((event) => ["prepare", "boundary", "account-delete", "user-delete"].includes(event)).slice(-4))
    .toEqual(["prepare", "boundary", "account-delete", "user-delete"]);
});

test("a crossed-boundary retry refuses any additional Account outside the durable tuple", async ({ context, page }) => {
  const events: string[] = [];
  await mockSettings(context, {
    operationId: "delete-operation-durable", status: "pending_deletion", phase: "prepared", state: "requested",
    boundaryCrossed: true, retryable: true, deadLetter: false,
  }, events, { additionalAccount: true });
  await openSettings(page);
  await page.getByRole("button", { name: "Retry account deletion" }).click();
  await expect(page.getByText("The Explorer Account state could not be verified. Try again without signing out.")).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  expect(events.filter((event) => ["account-delete", "user-delete"].includes(event))).toEqual([]);
});

test("a lost Account mutation response keeps user authority and reload resumes with only the user deletion", async ({ context, page }) => {
  // Break caught: ambiguous Account deletion is followed by user deletion in the same request/attempt.
  const events: string[] = [];
  await mockSettings(context, {
    operationId: "delete-operation-durable", status: "pending_deletion", phase: "prepared", state: "requested",
    boundaryCrossed: true, retryable: true, deadLetter: false,
  }, events, { loseAccountDeleteResponseOnce: true });
  await openSettings(page);
  await page.getByRole("button", { name: "Retry account deletion" }).click();
  await expect.poll(() => events.filter((event) => event === "account-delete").length).toBe(1);
  await expect(page).toHaveURL(/\/settings$/);
  expect(events.filter((event) => event === "account-delete")).toHaveLength(1);
  expect(events.filter((event) => event === "user-delete")).toHaveLength(0);

  await reloadSettings(page);
  await page.getByRole("button", { name: "Retry account deletion" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(events.filter((event) => event === "account-delete")).toHaveLength(1);
  expect(events.filter((event) => event === "user-delete")).toHaveLength(1);
});

test("dead-letter escalation is typed and offers no destructive retry", async ({ context, page }) => {
  const events: string[] = [];
  await mockSettings(context, {
    operationId: "delete-operation-durable", status: "pending_deletion", phase: "prepared", state: "failed",
    boundaryCrossed: true, retryable: false, deadLetter: true,
  }, events);
  await openSettings(page);
  await expect(page.getByRole("alert")).toContainText("manual review");
  await expect(page.getByRole("button", { name: /retry account deletion|cancel deletion/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /delete (?:your|my) account/i })).toHaveCount(0);
  expect(events.filter((event) => ["prepare", "boundary", "account-delete", "user-delete"].includes(event))).toEqual([]);
  await assertNoLifecyclePersistence(page);
});

test("finalized deletion hides every ordinary delete entry point and performs no destructive call", async ({ context, page }) => {
  // Break caught: tombstoned reload exposes a fresh confirmation saga.
  const events: string[] = [];
  await mockSettings(context, {
    operationId: "delete-operation-durable", status: "tombstoned", phase: "finalized", state: "completed",
    boundaryCrossed: true, retryable: false, deadLetter: false,
  }, events);
  await openSettings(page);
  await expect(page.getByRole("button", { name: /delete (?:your|my) account/i })).toHaveCount(0);
  expect(events.filter((event) => ["prepare", "boundary", "account-delete", "user-delete"].includes(event))).toEqual([]);
  await assertNoLifecyclePersistence(page);
});

for (const statusMode of ["delayed", "error"] as const) {
  test(`unresolved ${statusMode} lifecycle authority fails closed before any destructive control`, async ({ context, page }) => {
    const events: string[] = [];
    await mockSettings(context, {
      operationId: "delete-operation-durable", status: "pending_deletion", phase: "prepared", state: "completed",
      boundaryCrossed: false, retryable: false, deadLetter: false,
    }, events, { statusMode });
    await openSettings(page);
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: /delete (?:your|my) account/i })).toHaveCount(0);
    expect(events.filter((event) => ["prepare", "boundary", "account-delete", "user-delete"].includes(event))).toEqual([]);
  });
}
