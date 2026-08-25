import { expect, test, type Page, type Route } from "@playwright/test";
import { setupMockAuthentication } from "./setup/auth";

const consoleIssues = new WeakMap<Page, string[]>();
const failedResponses = new WeakMap<Page, string[]>();

const operationName = (route: Route) => {
  const payload = route.request().postDataJSON() as
    | { operationName?: string; query?: string }
    | undefined;
  return (
    payload?.operationName ||
    payload?.query?.match(/(?:query|mutation)\s+(\w+)/)?.[1] ||
    "Unknown"
  );
};

const account = {
  __typename: "Account",
  documentId: "mock-account-123",
  Account_Name: "Test Account",
  Account_Type: "business",
  mobile_number: "1234567890",
  localtunes_integrated: false,
  public_profile: "Yes",
  public_recommendations: "Yes",
  public_music: "No",
  public_movie: "No",
  public_guides: "No",
  public_books: "No",
  public_games: "No",
  public_apps: "No",
  public_products: "No",
  public_people: "No",
  pinned_nav_tabs: [],
  auto_pinning: false,
  profile_picture: null,
};

const user = {
  __typename: "UsersPermissionsUser",
  documentId: "mock-user-123",
  username: "testuser",
  email: "test@explorers.earth",
  accounts: [account],
};

test.beforeEach(async ({ context, page }) => {
  await setupMockAuthentication(context);
  await context.addInitScript(() => {
    sessionStorage.setItem("localtunes_sync_done", "1");
  });

  const pageConsoleIssues: string[] = [];
  const pageFailedResponses: string[] = [];
  consoleIssues.set(page, pageConsoleIssues);
  failedResponses.set(page, pageFailedResponses);
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" ||
      (message.type() === "warning" && text.includes("go.apollo.dev"))
    ) {
      pageConsoleIssues.push(text);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      pageFailedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.route("**/api/playlists?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ playlists: [] }),
    });
  });

  await page.route("**/graphql", async (route) => {
    const operation = operationName(route);
    if (
      operation === "CheckOnboardingStatus" ||
      operation === "CheckOnboardingForSync" ||
      operation === "SidebarAccount" ||
      operation === "user"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { usersPermissionsUser: user } }),
      });
    }
    if (operation === "Account") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { accounts: [account] } }),
      });
    }
    if (operation === "PublicCategoryListCounts") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            recommendationLists: [],
            bookLists: [],
            movieLists: [],
            gameLists: [],
            appLists: [],
            productLists: [],
            personLists: [],
            guides: [],
          },
        }),
      });
    }

    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        data: null,
        errors: [{ message: `Unhandled operation ${operation}` }],
      }),
    });
  });
});

test.afterEach(async ({ page }) => {
  expect(failedResponses.get(page) || []).toEqual([]);
  expect(consoleIssues.get(page) || []).toEqual([]);
});

test("recommendations hub renders every supported category cleanly", async ({
  page,
}) => {
  await page.goto("/recommendations", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "All Your Recommendations in One Place" }),
  ).toBeVisible();

  const cards = page.locator(".rec-card");
  await expect(cards).toHaveCount(9);
  for (const label of [
    "Places",
    "Music",
    "Movies & Shows",
    "Books",
    "Games",
    "Apps & Tools",
    "Products",
    "People",
    "Guides",
  ]) {
    await expect(cards.getByText(label, { exact: true })).toBeVisible();
  }
});
