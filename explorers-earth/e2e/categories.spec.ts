import { expect, test, type Browser } from "@playwright/test";
import { bookFixtureId } from "./setup/books-owner-content";
import { closeFixture, fixtureState, openFixture } from "./setup/category-navigation";
import { canonicalAccountFixture } from "../src/test/canonicalAccountFixture";
import { collectionCoreDtoSchema } from "../../tunes/shared/explorersContract";

// The hub runs on the contained owner fixture (canonical session, GET /api/explorers/v1/me,
// native owner reads). The Strapi-era GraphQL mocks it used before left the canonical account
// read unanswered, so the app showed "Couldn't load your account" instead of the hub.
// closeFixture() asserts no denied request and no console error; failed responses are
// asserted here as before.
test("recommendations hub renders every supported category cleanly", async ({ browser, baseURL }) => {
  const handle = await openFixture(browser, baseURL!, fixtureState(), { owner: true });
  const failedResponses: string[] = [];
  handle.page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  try {
    const { page } = handle;
    await page.goto("/recommendations", { waitUntil: "domcontentloaded" });
    // The redesigned hub keeps its title as a screen-reader-only h1.
    await expect(
      page.getByRole("heading", { level: 1, name: "All Your Recommendations in One Place" }),
    ).toBeAttached();

    const cards = page.locator(".rec-card");
    await expect(cards).toHaveCount(8);
    for (const label of [
      "Places",
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
    expect(failedResponses).toEqual([]);
  } finally { await closeFixture(handle); }
});

// WP3A: the shared category template. These cases run on the contained owner fixture
// (canonical account, native owner reads) and add only the two writes they exercise:
// the list create and the category list order.
type TemplateCategory = "movies" | "books" | "games" | "apps" | "products" | "people";
const listRoot: Record<TemplateCategory, string> = { movies: "movieLists", books: "bookLists", games: "gameLists", apps: "appLists", products: "productLists", people: "personLists" };
const categoryTitle: Record<TemplateCategory, string> = { movies: "Movies & Shows", books: "Books", games: "Games", apps: "Apps & Tools", products: "Products", people: "People" };

async function openCategory(browser: Browser, baseURL: string, category: TemplateCategory, names: string[], options: { width?: number; height?: number } = {}) {
  const state = fixtureState();
  const root = listRoot[category];
  const template = state.lists[root][0];
  state.lists[root] = names.map((name, index) => ({ ...template, documentId: `${category}-${index}`, List_Name: name, Title: name,
    slug: name.toLowerCase().replace(/\s+/g, "-"), Visibility: false, visibility: false }));
  const handle = await openFixture(browser, baseURL, state, { owner: true, ...options });
  const writes: { method: string; path: string; body: any }[] = [];
  await handle.page.route("**/api/explorers/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/explorers/v1/collections") {
      const body = request.postDataJSON();
      writes.push({ method: "POST", path: url.pathname, body });
      const lists = state.lists[root];
      const created = { ...template, documentId: `${category}-new-${lists.length}`, List_Name: body.title, Title: body.title, slug: body.slug, Visibility: false, visibility: false };
      lists.push(created);
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ collection: collectionCoreDtoSchema.parse({
        id: bookFixtureId("collection", created.documentId), accountId: canonicalAccountFixture().id, category, title: body.title, slug: body.slug,
        visibility: "private", publicationState: "draft", revision: 1, description: body.description ?? null, heading: null, coverMediaId: null, isSample: false }) }) });
    }
    if (request.method() === "PATCH" && url.pathname === `/api/explorers/v1/categories/${category}/lists/order`) {
      const body = request.postDataJSON();
      writes.push({ method: "PATCH", path: url.pathname, body });
      const order: string[] = body.orderedCollectionIds;
      state.lists[root].sort((a, b) => order.indexOf(bookFixtureId("collection", a.documentId)) - order.indexOf(bookFixtureId("collection", b.documentId)));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ lists: { category, scope: body.scope, categoryRevision: "2",
        lists: order.map((id, position) => ({ id, position })) } }) });
    }
    return route.fallback();
  });
  return { ...handle, state, writes };
}

for (const category of Object.keys(listRoot) as TemplateCategory[]) {
  test(`${category}: create a list from the shared popup and land on it`, async ({ browser, baseURL }) => {
    const fixture = await openCategory(browser, baseURL!, category, ["First list"]);
    try {
      const { page, writes } = fixture;
      await page.goto(`/recommendations/${category}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 2, name: categoryTitle[category], exact: true })).toBeVisible();
      await page.getByRole("button", { name: "＋ New list" }).first().click();
      const dialog = page.getByRole("dialog", { name: "New list" });
      await dialog.getByLabel("Name").fill("E2E list");
      await expect(dialog.getByLabel("Web address")).toHaveValue("e2e-list");
      await dialog.getByRole("button", { name: "Create list" }).click();
      await expect(page).toHaveURL(new RegExp(`/recommendations/${category}/`));
      expect(writes.find((w) => w.method === "POST")?.body).toMatchObject({ category, title: "E2E list", slug: "e2e-list", visibility: "private", publicationState: "draft" });
    } finally { await fixture.context.close(); }
  });
}

test("Top Picks: first-visit state on an empty category", async ({ browser, baseURL }) => {
  const fixture = await openCategory(browser, baseURL!, "games", []);
  try {
    const { page } = fixture;
    await page.goto("/recommendations/games", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Your best picks go here")).toBeVisible();
    await expect(page.getByRole("button", { name: /Manage Top Picks/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Create your first list/ })).toBeVisible();
  } finally { await closeFixture(fixture); }
});

test("Top Picks empty state and Manage never disappears", async ({ browser, baseURL }) => {
  const fixture = await openCategory(browser, baseURL!, "movies", ["Comfort movies"]);
  try {
    const { page } = fixture;
    await page.goto("/recommendations/movies", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Pin items to feature them here")).toBeVisible();
    await page.getByRole("button", { name: /Manage Top Picks/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Manage Top Picks", exact: true })).toBeVisible();
  } finally { await closeFixture(fixture); }
});

test("drag-reorder list cards saves the order and toasts", async ({ browser, baseURL }) => {
  const fixture = await openCategory(browser, baseURL!, "apps", ["Alpha", "Beta", "Gamma"]);
  try {
    const { page, writes } = fixture;
    await page.goto("/recommendations/apps", { waitUntil: "domcontentloaded" });
    const cards = page.getByTestId("list-card");
    await expect(cards).toHaveCount(3);
    await cards.nth(2).dragTo(cards.nth(0));
    await expect(page.getByText("Order saved")).toBeVisible();
    const order = writes.find((w) => w.method === "PATCH")?.body.orderedCollectionIds;
    expect(order[0]).toBe(bookFixtureId("collection", "apps-2"));
  } finally { await closeFixture(fixture); }
});

test("keyboard reorder: Space, ArrowRight, Space", async ({ browser, baseURL }) => {
  const fixture = await openCategory(browser, baseURL!, "people", ["One", "Two"]);
  try {
    const { page, writes } = fixture;
    await page.goto("/recommendations/people", { waitUntil: "domcontentloaded" });
    const grip = page.getByRole("button", { name: /Reorder One/ });
    await grip.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await expect(page.getByText("Order saved")).toBeVisible();
    expect(writes.filter((w) => w.method === "PATCH")).toHaveLength(1);
  } finally { await closeFixture(fixture); }
});

test("phone: bottom New list button opens the popup", async ({ browser, baseURL }) => {
  const fixture = await openCategory(browser, baseURL!, "products", ["Desk setup"], { width: 375, height: 812 });
  try {
    const { page } = fixture;
    await page.goto("/recommendations/products", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "＋ New list" }).last().click();
    await expect(page.getByRole("dialog", { name: "New list" })).toBeVisible();
  } finally { await closeFixture(fixture); }
});
