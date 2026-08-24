import {
  expect,
  test as base,
  type BrowserContext,
  type CDPSession,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

const CATEGORY_IDS = [
  "places",
  "music",
  "movies",
  "books",
  "games",
  "guides",
  "apps",
  "products",
  "people",
] as const;

type CategoryId = (typeof CATEGORY_IDS)[number];

const CATEGORY_LABELS: Record<CategoryId, string> = {
  places: "Places",
  music: "Music",
  movies: "Movies & Shows",
  books: "Books",
  games: "Games",
  guides: "Guides",
  apps: "Apps & Tools",
  products: "Products",
  people: "People",
};

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const FEED_ITEM = {
  id: "feed-seed",
  documentId: "feed-seed-document",
  url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  fileName: "synthetic-seed.png",
  type: "image",
  aspectRatio: "1:1",
  width: 1,
  height: 1,
  uploadSource: "manual",
};

const UPLOADED_FEED_ITEM = {
  id: "feed-uploaded-91",
  documentId: "synthetic-upload-document",
  url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  fileName: "task-6-gallery.png",
  type: "image",
  aspectRatio: "1:1",
  width: 1,
  height: 1,
  uploadSource: "manual",
};

const PLATFORM_LINKS = {
  instagram: "https://example.test/instagram",
  youtube: "https://example.test/youtube",
  whatsapp: "https://example.test/whatsapp",
  website: "https://example.test/website",
  facebook: "https://example.test/facebook",
  linkedin: "https://example.test/linkedin",
  snapchat: "https://example.test/snapchat",
  tiktok: "https://example.test/tiktok",
  email: "synthetic@example.test",
  X: "https://example.test/x",
  spotify: "https://example.test/spotify",
  youtubeMusic: "https://example.test/youtube-music",
  appleMusic: "https://example.test/apple-music",
} as const;

const platformFixture = (key: keyof typeof PLATFORM_LINKS) => ({
  link: PLATFORM_LINKS[key],
  visibility: key === "youtube" || key === "facebook" ? false : true,
  futurePlatform: `${key}-preserved`,
});

const INITIAL_SOCIAL_MEDIA = {
  futureSocial: { keep: "social-future" },
  localTunes: {
    link: "https://localtunes.earth/playlist/synthetic-playlist",
    visibility: true,
    futurePlatform: "localTunes-preserved",
  },
  instagram: platformFixture("instagram"),
  youtube: platformFixture("youtube"),
  whatsapp: platformFixture("whatsapp"),
  website: platformFixture("website"),
  facebook: platformFixture("facebook"),
  linkedin: platformFixture("linkedin"),
  snapchat: platformFixture("snapchat"),
  tiktok: platformFixture("tiktok"),
  email: platformFixture("email"),
  X: platformFixture("X"),
  spotify: platformFixture("spotify"),
  youtubeMusic: platformFixture("youtubeMusic"),
  appleMusic: platformFixture("appleMusic"),
  theme_settings: {
    preset: "cinematic-dark",
    wallpaperMode: "solid-color",
    accentColor: "#10B981",
    landingTab: "all-recommendations",
    futureTheme: { keep: "theme-future" },
    recommendations: {
      layout: "shelves",
      categoryOrder: [...CATEGORY_IDS],
      futureRecommendation: { keep: "recommendation-future" },
    },
  },
};

const INITIAL_ACCOUNT = {
  documentId: "fixture-account",
  username: "synthetic-explorer",
  Account_Name: "Synthetic Explorer",
  Account_Type: "personal",
  Bio: "A deterministic synthetic profile.",
  Addresss: {
    address: "1 Fixture Lane, Test City",
    streetName: "Fixture Lane",
    postalCode: "00001",
    state: "Test State",
    city: "Test City",
    country: "Test Country",
  },
  Primary_Address: { address: "Test City, Test Country" },
  Public_Profile_Address: {
    title: "Synthetic Studio",
    address: "9 Business Road",
    contact: "+10000000001",
    website: "https://business.example.test",
    about: "A synthetic business fixture.",
    placeId: "synthetic-place-id",
  },
  Feed_Data: [FEED_ITEM],
  social_media: INITIAL_SOCIAL_MEDIA,
  mobile_number: "+10000000000",
  mobile_number_visibility: false,
  profile_picture: null,
  bg_picture: null,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
  localtunes_public:
    "https://localtunes.earth/playlist/synthetic-playlist",
  localtunes_integrated: "No",
  public_profile: "Yes",
  public_recommendations: "Yes",
  public_music: "Yes",
  public_movie: "Yes",
  public_books: "Yes",
  public_guides: "Yes",
  public_games: "Yes",
  public_apps: "Yes",
  public_products: "Yes",
  public_people: "Yes",
  pinned_nav_tabs: [],
  auto_pinning: false,
};

const SAVED_ORDER: CategoryId[] = [
  "music",
  "movies",
  "books",
  "games",
  "guides",
  "apps",
  "products",
  "people",
  "places",
];

const EXPECTED_SAVED_DATA = {
  Bio: "<p>A&nbsp;deterministic&nbsp;synthetic&nbsp;profile.</p>",
  Account_Name: "Synthetic Explorer Edited",
  Addresss: {
    streetName: "Fixture Lane",
    postalCode: "00001",
    state: "Test State",
    city: "Test City",
    country: "Test Country",
    address: "1 Fixture Lane, Test City",
  },
  Primary_Address: { address: "Test City, Test Country" },
  Public_Profile_Address: {
    title: "Synthetic Studio",
    address: "9 Business Road",
    contact: "+10000000001",
    website: "https://business.example.test",
    about: "A synthetic business fixture.",
    placeId: "synthetic-place-id",
    places: null,
  },
  Feed_Data: [FEED_ITEM, UPLOADED_FEED_ITEM],
  social_media: {
    futureSocial: { keep: "social-future" },
    localTunes: {
      link: "https://localtunes.earth/playlist/synthetic-playlist",
      visibility: true,
      futurePlatform: "localTunes-preserved",
    },
    instagram: platformFixture("instagram"),
    youtube: platformFixture("youtube"),
    whatsapp: platformFixture("whatsapp"),
    website: platformFixture("website"),
    facebook: platformFixture("facebook"),
    linkedin: platformFixture("linkedin"),
    snapchat: platformFixture("snapchat"),
    tiktok: platformFixture("tiktok"),
    email: platformFixture("email"),
    X: platformFixture("X"),
    spotify: platformFixture("spotify"),
    youtubeMusic: platformFixture("youtubeMusic"),
    appleMusic: platformFixture("appleMusic"),
    theme_settings: {
      preset: "sunset-glow",
      wallpaperMode: "ambient-gradient",
      accentColor: "#EC4899",
      landingTab: "music",
      futureTheme: { keep: "theme-future" },
      recommendations: {
        layout: "featured",
        categoryOrder: SAVED_ORDER,
        futureRecommendation: { keep: "recommendation-future" },
      },
    },
  },
  Account_Type: "Personal",
  mobile_number_visibility: false,
  mobile_number: "+10000000000",
};

type AccountFixture = typeof INITIAL_ACCOUNT;

interface DeferredResponse {
  promise: Promise<"success" | "failure">;
  resolve: (result: "success" | "failure") => void;
}

const deferredResponse = (): DeferredResponse => {
  let resolve!: (result: "success" | "failure") => void;
  const promise = new Promise<"success" | "failure">((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const clone = <Value,>(value: Value): Value =>
  JSON.parse(JSON.stringify(value)) as Value;

const graphQLOperation = (route: Route) => {
  const payload = route.request().postDataJSON() as
    | { operationName?: string; query?: string }
    | undefined;
  return (
    payload?.operationName ||
    payload?.query?.match(/(?:query|mutation)\s+(\w+)/)?.[1] ||
    "Unknown"
  );
};

const fulfillJson = (
  route: Route,
  body: unknown,
  status = 200,
) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

const categoryPayload = (operation: string) => {
  const common = {
    documentId: `${operation}-list`,
    List_Name: `${operation} synthetic list`,
    slug: `${operation.toLowerCase()}-synthetic-list`,
    Visibility: true,
    cover_image: null,
    recommendationCount: [{ documentId: `${operation}-item` }],
  };
  const payloads: Record<string, unknown> = {
    GetPlacesLists: {
      recommendationLists: [
        {
          ...common,
          List_Name_Details: null,
          recommended_places: [],
        },
      ],
    },
    GetMoviesLists: {
      movieLists: [{ ...common, recommended_movies: [] }],
    },
    GetBooksLists: {
      bookLists: [
        { ...common, visibility: true, recommended_books: [] },
      ],
    },
    GetGamesLists: {
      gameLists: [{ ...common, recommended_games: [] }],
    },
    GetGuidesLists: {
      guides: [
        {
          documentId: "guide-list",
          Title: "Guides synthetic list",
          slug: "guides-synthetic-list",
          Visibility: true,
          Guide_Media: [],
        },
      ],
    },
    GetAppsLists: {
      appLists: [{ ...common, recommended_apps: [] }],
    },
    GetProductsLists: {
      productLists: [{ ...common, recommended_products: [] }],
    },
    GetPeopleLists: {
      personLists: [{ ...common, recommended_people: [] }],
    },
  };
  return payloads[operation];
};

class SyntheticProfileFixture {
  account: AccountFixture = clone(INITIAL_ACCOUNT);
  mutationVariables: Array<{ documentId: string; data: unknown }> = [];
  successfulMutations = 0;
  failNextUpdate = false;
  unhandledRequests: string[] = [];
  private instagramQueue: DeferredResponse[] = [];
  private uploadQueue: DeferredResponse[] = [];

  acknowledgeUnhandled(fragment: string) {
    const matches = this.unhandledRequests
      .map((description, index) => ({ description, index }))
      .filter(({ description }) => description.includes(fragment));
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one blocked request containing ${fragment}, found ${matches.length}`,
      );
    }
    this.unhandledRequests.splice(matches[0].index, 1);
  }

  deferInstagram() {
    const deferred = deferredResponse();
    this.instagramQueue.push(deferred);
    return deferred;
  }

  deferUpload() {
    const deferred = deferredResponse();
    this.uploadQueue.push(deferred);
    return deferred;
  }

  async install(context: BrowserContext) {
    await context.addInitScript(() => {
      class MockMap {
        addListener() { return { remove: () => {} }; }
        fitBounds() {}
        getBounds() { return null; }
        getCenter() { return { lat: () => 0, lng: () => 0 }; }
        getDiv() { return document.createElement("div"); }
        getHeading() { return 0; }
        getTilt() { return 0; }
        getZoom() { return 10; }
        moveCamera() {}
        setCenter() {}
        setOptions() {}
      }
      class MockAdvancedMarkerElement {
        map = null;
        content = document.createElement("div");
        element = this.content;
        addListener() { return { remove: () => {} }; }
      }
      class MockPinElement {
        element = document.createElement("div");
      }
      class MockAutocomplete {
        addListener() { return { remove: () => {} }; }
        getPlace() { return null; }
      }
      const placesLibrary = {
        Autocomplete: MockAutocomplete,
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: async () => ({ suggestions: [] }),
        },
      };
      (window as any).google = {
        maps: {
          importLibrary: async (library: string) => {
            if (library === "marker") {
              return {
                AdvancedMarkerElement: MockAdvancedMarkerElement,
                PinElement: MockPinElement,
              };
            }
            if (library === "places") return placesLibrary;
            return { Map: MockMap };
          },
          Map: MockMap,
          marker: {
            AdvancedMarkerElement: MockAdvancedMarkerElement,
            PinElement: MockPinElement,
          },
          places: placesLibrary,
          event: {
            addListener: () => ({ remove: () => {} }),
            clearInstanceListeners: () => {},
            removeListener: () => {},
          },
        },
      };
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({
          state: {
            isAuthenticated: true,
            token: null,
            user: {
              id: "synthetic-user-id",
              documentId: "synthetic-user-document",
              username: "synthetic-explorer",
              email: "synthetic@example.test",
              blocked: false,
            },
          },
          version: 0,
        }),
      );
      localStorage.setItem("hasSeenPublicProfileTooltip", "true");
      localStorage.setItem("dashboard-theme", "dark");
      localStorage.setItem(
        "explorers-cookie-consent",
        JSON.stringify({
          essential: true,
          analytics: false,
          marketing: false,
          timestamp: "2026-08-20T00:00:00.000Z",
        }),
      );
      sessionStorage.setItem("localtunes_sync_done", "1");
      window.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.dataset.testAnimationFreeze = "true";
        style.textContent = `
          @media (prefers-reduced-motion: no-preference) {
            *, *::before, *::after {
              animation-delay: 0s !important;
              animation-duration: 0.01ms !important;
              transition-delay: 0s !important;
              transition-duration: 0.01ms !important;
            }
          }
        `;
        document.head.appendChild(style);
      });
    });

    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;

      if (pathname.endsWith("/graphql") || pathname === "/graphql") {
        return this.handleGraphQL(route);
      }

      if (pathname === "/api/instagram/account-posts") {
        const result = this.instagramQueue.length
          ? await this.instagramQueue.shift()!.promise
          : "success";
        if (result === "failure") {
          return fulfillJson(
            route,
            { success: false, message: "Synthetic Instagram failure" },
            503,
          );
        }
        return fulfillJson(route, {
          success: true,
          data: {
            totalMedia: 1,
            posts: [
              {
                shortcode: "synthetic-post",
                media: [
                  {
                    url: "https://media.example.test/synthetic-instagram.png",
                    type: "image",
                    width: 1,
                    height: 1,
                  },
                ],
              },
            ],
          },
        });
      }

      if (pathname === "/api/instagram/media-proxy") {
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: ONE_PIXEL_PNG,
        });
      }

      if (pathname.endsWith("/upload")) {
        const result = this.uploadQueue.length
          ? await this.uploadQueue.shift()!.promise
          : "success";
        if (result === "failure") {
          return fulfillJson(route, { message: "Synthetic upload failure" }, 503);
        }
        return fulfillJson(route, [
          {
            id: 91,
            documentId: "synthetic-upload-document",
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          },
        ]);
      }

      if (pathname === "/api/playlist/synthetic-playlist") {
        return fulfillJson(route, {
          playlists: [
            {
              id: "synthetic-playlist-id",
              name: "Synthetic playlist",
              isVisibleToGuests: true,
              songs: [],
            },
          ],
        });
      }

      if (
        pathname.startsWith("/api/subscriptions/") ||
        pathname.startsWith("/api/song-limits/")
      ) {
        return fulfillJson(route, { success: true, data: [] });
      }

      if (
        url.hostname.includes("googleapis.com") ||
        url.hostname.includes("google.com") ||
        url.hostname.includes("gstatic.com")
      ) {
        const isImage = /\.(?:gif|jpe?g|png|webp)$/i.test(pathname);
        return route.fulfill({
          status: 200,
          contentType: isImage ? "image/png" : "application/javascript",
          body: isImage
            ? ONE_PIXEL_PNG
            : "/* External Google resources are supplied by the deterministic fixture. */",
        });
      }

      if (
        (url.hostname === "www.googletagmanager.com" &&
          pathname === "/gtag/js" &&
          url.searchParams.get("id") === "G-C3QBWP3ZSK") ||
        (url.hostname === "www.clarity.ms" && pathname === "/tag/t7xux4xstk")
      ) {
        return route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: "/* Analytics is disabled in deterministic browser tests. */",
        });
      }

      if (
        url.hostname === "zupimages.net" &&
        (pathname === "/up/19/34/4820.gif" || pathname === "/up/19/34/6vlb.gif")
      ) {
        return route.fulfill({
          status: 200,
          contentType: "image/gif",
          body: ONE_PIXEL_PNG,
        });
      }

      const isSameOrigin = url.origin === "http://localhost:5173";
      const resourceType = request.resourceType();
      const isAppDocument =
        isSameOrigin &&
        resourceType === "document" &&
        request.isNavigationRequest();
      const isClassifiedAssetPath =
        pathname.startsWith("/@vite/") ||
        pathname.startsWith("/@id/") ||
        pathname === "/@react-refresh" ||
        pathname.startsWith("/src/") ||
        pathname.startsWith("/node_modules/") ||
        pathname.startsWith("/@fs/") ||
        pathname.startsWith("/assets/") ||
         pathname === "/explorers.svg" ||
         pathname === "/logo.svg" ||
         pathname === "/eoe-icon.svg" ||
         pathname === "/eoe-full.svg" ||
         pathname === "/images/Profile.jpg" ||
        pathname === "/images/Background.jpg";
      const isClassifiedAsset =
        isSameOrigin &&
        isClassifiedAssetPath &&
        ["script", "stylesheet", "font", "image"].includes(resourceType);
      if (isAppDocument || isClassifiedAsset) {
        return route.continue();
      }

      const description = `${request.method()} ${request.url()}`;
      this.unhandledRequests.push(description);
      return route.abort("blockedbyclient");
    });
  }

  private async handleGraphQL(route: Route) {
    const operation = graphQLOperation(route);
    const account = clone(this.account);
    const user = {
      documentId: "synthetic-user-document",
      username: "synthetic-explorer",
      email: "synthetic@example.test",
      provider: "local",
      razorpay_customer_id: null,
      mobile_number: account.mobile_number,
      mobile_number_visibility: account.mobile_number_visibility,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
      accounts: [account],
    };

    if (
      operation === "CheckOnboardingStatus" ||
      operation === "CheckOnboardingForSync" ||
      operation === "SidebarAccount" ||
      operation === "user" ||
      operation === "UsersPermissionsUser"
    ) {
      return fulfillJson(route, { data: { usersPermissionsUser: user } });
    }

    if (operation === "UpdateAccount") {
      const payload = route.request().postDataJSON() as {
        variables: { documentId: string; data: Record<string, unknown> };
      };
      this.mutationVariables.push(clone(payload.variables));
      if (this.failNextUpdate) {
        this.failNextUpdate = false;
        return fulfillJson(route, {
          data: { updateAccount: null },
          errors: [{ message: "Synthetic save failure" }],
        });
      }
      this.account = {
        ...this.account,
        ...clone(payload.variables.data),
        updatedAt: "2026-08-21T00:00:00.000Z",
      } as AccountFixture;
      this.successfulMutations += 1;
      return fulfillJson(route, {
        data: { updateAccount: clone(this.account) },
      });
    }

    if (operation === "CheckUsername") {
      return fulfillJson(route, {
        data: {
          accounts: [
            {
              documentId: account.documentId,
              Account_Name: account.Account_Name,
            },
          ],
        },
      });
    }

    if (operation === "PublicAccountBasic" || operation === "PublicProfileData") {
      return fulfillJson(route, { data: { accounts: [account] } });
    }

    if (operation === "Account") {
      const payload = route.request().postDataJSON() as { query?: string };
      if (payload.query?.includes("accounts(")) {
        return fulfillJson(route, { data: { accounts: [account] } });
      }
      return fulfillJson(route, {
        data: { account: { mobile_number: account.mobile_number } },
      });
    }

    if (operation === "PublicCategoryListCounts") {
      const visibleList = [{ documentId: "synthetic-visible-list" }];
      return fulfillJson(route, {
        data: {
          recommendationLists: visibleList,
          bookLists: visibleList,
          movieLists: visibleList,
          gameLists: visibleList,
          appLists: visibleList,
          productLists: visibleList,
          personLists: visibleList,
          guides: visibleList,
        },
      });
    }

    if (operation === "CheckPublishedLists") {
      const visibleList = [{ documentId: "synthetic-visible-list" }];
      return fulfillJson(route, {
        data: {
          recommendationLists: visibleList,
          bookLists: visibleList,
          movieLists: visibleList,
          gameLists: visibleList,
          appLists: visibleList,
          productLists: visibleList,
          personLists: visibleList,
          guides: visibleList,
        },
      });
    }

    const category = categoryPayload(operation);
    if (category) return fulfillJson(route, { data: category });

    this.unhandledRequests.push(`GraphQL ${operation}`);
    return fulfillJson(
      route,
      { data: null, errors: [{ message: `Unhandled operation ${operation}` }] },
      500,
    );
  }
}

const test = base.extend<{ synthetic: SyntheticProfileFixture }>({
  synthetic: [
    async ({ context, page }, use) => {
      const fixture = new SyntheticProfileFixture();
      const consoleIssues: string[] = [];
      const failedResponses: string[] = [];
      page.on("console", (message) => {
        const text = message.text();
        const expectedFixtureFailure =
          text.includes("server responded with a status of 503") ||
          (text.includes("net::ERR_BLOCKED_BY_CLIENT") &&
            fixture.unhandledRequests.length > 0);
        if (
          !expectedFixtureFailure &&
          (message.type() === "error" ||
            (message.type() === "warning" && text.includes("go.apollo.dev")))
        ) {
          consoleIssues.push(text);
        }
      });
      page.on("response", (response) => {
        const expectedFixtureFailure =
          response.status() === 503 &&
          (response.url().includes("/api/instagram/account-posts") ||
            response.url().endsWith("/upload"));
        if (response.status() >= 400 && !expectedFixtureFailure) {
          failedResponses.push(`${response.status()} ${response.url()}`);
        }
      });
      await fixture.install(context);
      await use(fixture);
      expect(fixture.unhandledRequests).toEqual([]);
      expect(failedResponses).toEqual([]);
      expect(consoleIssues).toEqual([]);
    },
    { auto: true },
  ],
});

const orderRows = (page: Page) =>
  page.getByTestId("recommendations-order-category");

const readOrder = async (page: Page): Promise<string[]> =>
  orderRows(page).evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-category-id") || ""),
  );

const openDashboard = async (page: Page) => {
  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/profile$/);
  await expect(
    page.getByRole("tablist", { name: "Public profile editor" }),
  ).toBeVisible();
};

const openSettings = async (page: Page) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("tablist", { name: "Settings sections" }),
  ).toBeVisible();
};

const openAppearance = async (page: Page) => {
  const tab = page.getByRole("tab", { name: "Appearance", exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("appearance-workspace")).toBeVisible();
  await expect(orderRows(page)).toHaveCount(9);
};

const rowFor = (page: Page, id: CategoryId) =>
  orderRows(page).filter({ has: page.getByRole("button", { name: `Drag ${CATEGORY_LABELS[id]}` }) });

async function mouseDragCategory(
  page: Page,
  id: CategoryId,
  targetIndex: number,
) {
  const list = page.locator(".appearance-category-list");
  await list.scrollIntoViewIfNeeded();
  const handle = page.getByRole("button", {
    name: `Drag ${CATEGORY_LABELS[id]}`,
    exact: true,
  });
  const target = orderRows(page).nth(targetIndex);
  await expect(handle).toBeVisible();
  await expect(target).toBeVisible();
  const start = await handle.boundingBox();
  const destination = await target.boundingBox();
  if (!start || !destination) throw new Error("Drag geometry was unavailable");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    destination.x + Math.min(destination.width / 2, 120),
    destination.y + destination.height / 2,
    { steps: 24 },
  );
  await expect
    .poll(async () => (await readOrder(page)).indexOf(id))
    .toBe(targetIndex);
  await page.mouse.up();
  await expect
    .poll(async () => (await readOrder(page)).indexOf(id))
    .toBe(targetIndex);
  await expect(
    page.locator('[data-reorder-active="true"]'),
  ).toHaveCount(0);
}

const visiblePreviewCategoryIds = (page: Page) =>
  page
    .locator('[data-preview-variant="mobile"]:visible, [data-preview-variant="desktop"]:visible')
    .locator('[data-category-id]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-category-id") || ""),
    );

const publicCategoryIds = (page: Page) =>
  page
    .getByTestId("recommendations-featured")
    .locator("[data-category-id]")
    .evaluateAll((nodes) =>
      Array.from(
        new Set(nodes.map((node) => node.getAttribute("data-category-id") || "")),
      ).filter(Boolean),
    );

const expectNoHorizontalOverflow = async (page: Page) => {
  const geometry = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>(
      '[data-testid="profile-editor-root"]',
    );
    const workspace = document.querySelector<HTMLElement>(
      ".profile-editor-workspace-shell",
    );
    if (!editor || !workspace) {
      throw new Error("Profile editor overflow containers were not found");
    }
    return {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      editor: editor.scrollWidth - editor.clientWidth,
      workspace: workspace.scrollWidth - workspace.clientWidth,
    };
  });
  expect(geometry.document).toBeLessThanOrEqual(1);
  expect(geometry.editor).toBeLessThanOrEqual(1);
  expect(geometry.workspace).toBeLessThanOrEqual(1);
};

const expectNoDocumentOverflow = async (page: Page) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
};

const resolvePanelLabels = async (
  panel: Locator,
  expectedActiveIds: string[],
) => {
  for (const id of expectedActiveIds) {
    expect(id.trim(), "Expected an active panel label ID").not.toBe("");
  }
  const labelledBy = await panel.getAttribute("aria-labelledby");
  expect(labelledBy, "Active panel must have aria-labelledby").not.toBeNull();
  expect(labelledBy?.trim(), "aria-labelledby must not be empty").not.toBe("");
  const labels = labelledBy!.trim().split(/\s+/).filter(Boolean);
  for (const id of expectedActiveIds) expect(labels).toContain(id);
  const resolved = await panel.evaluate((node, ids) =>
    ids.map((id) => Boolean(node.ownerDocument.getElementById(id))),
    labels,
  );
  expect(resolved, "Every aria-labelledby token must resolve").not.toContain(false);
  return resolved;
};

test.describe("deterministic editor-to-public profile parity", () => {
  test("real pointer drag stays local, failed save retries the exact complete snapshot, and reloads preserve public parity", async ({
    page,
    synthetic,
  }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1400 });
    await openDashboard(page);

    const accountName = page.locator('input[name="accountName"]');
    await accountName.fill("Synthetic Explorer Edited");

    await page.getByRole("tab", { name: "Gallery", exact: true }).click();
    const galleryPanel = page.getByRole("tabpanel", { name: /Gallery/ });
    await expect(galleryPanel).toBeVisible();
    await expect(page.locator('img[alt="synthetic-seed.png"]')).toBeVisible();
    await galleryPanel.locator('input[type="file"]').setInputFiles({
      name: "task-6-gallery.png",
      mimeType: "image/png",
      buffer: ONE_PIXEL_PNG,
    });
    await expect(page.getByText(/1 file uploaded successfully/i)).toBeVisible();
    await expect(page.locator('img[alt="task-6-gallery.png"]')).toBeVisible();
    expect(synthetic.mutationVariables).toEqual([]);

    await openAppearance(page);
    await page.getByRole("button", { name: /Sunset Glow/ }).click();
    await page.getByLabel("Wallpaper and cover style").selectOption("ambient-gradient");
    await page.getByLabel("First view").selectOption("music");
    await page.getByRole("radio", { name: "Featured First" }).check();

    await mouseDragCategory(page, "places", 8);
    await mouseDragCategory(page, "places", 0);
    await mouseDragCategory(page, "places", 8);
    expect(await readOrder(page)).toEqual(SAVED_ORDER);
    expect((await visiblePreviewCategoryIds(page))[0]).toBe("music");
    expect(synthetic.mutationVariables).toEqual([]);

    const preFailureAccount = clone(synthetic.account);
    synthetic.failNextUpdate = true;
    await page.getByRole("button", { name: "Save & Publish", exact: true }).click();
    await expect.poll(() => synthetic.mutationVariables.length).toBe(1);
    await expect(page.getByText(/Synthetic save failure/)).toBeVisible();
    expect(synthetic.account).toEqual(preFailureAccount);
    expect(synthetic.successfulMutations).toBe(0);
    expect(await readOrder(page)).toEqual(SAVED_ORDER);
    await expect(page.getByLabel("First view")).toHaveValue("music");
    await expect(page.getByRole("radio", { name: "Featured First" })).toBeChecked();
    await expect(accountName).toHaveValue("Synthetic Explorer Edited");

    await page.getByRole("button", { name: "Save & Publish", exact: true }).click();
    await expect.poll(() => synthetic.mutationVariables.length).toBe(2);
    await expect.poll(() => synthetic.successfulMutations).toBe(1);
    expect(synthetic.mutationVariables).toEqual([
      { documentId: "fixture-account", data: EXPECTED_SAVED_DATA },
      { documentId: "fixture-account", data: EXPECTED_SAVED_DATA },
    ]);

    await page.reload({ waitUntil: "domcontentloaded" });
    await openAppearance(page);
    await expect(page.getByLabel("First view")).toHaveValue("music");
    await expect(page.getByRole("radio", { name: "Featured First" })).toBeChecked();
    expect(await readOrder(page)).toEqual(SAVED_ORDER);

    await page.goto("/synthetic-explorer", { waitUntil: "domcontentloaded" });
    const publicTabs = page.getByRole("tablist", { name: "Profile sections" });
    await expect(publicTabs).toBeVisible();
    await expect(publicTabs.getByRole("tab")).toHaveCount(3);
    expect(
      await publicTabs.getByRole("tab").evaluateAll((tabs) =>
        tabs.map((tab) => tab.getAttribute("aria-label")),
      ),
    ).toEqual(["Recommendations", "Gallery", "Business Details"]);
    await expect(page.getByRole("tab", { name: "Appearance" })).toHaveCount(0);
    await expect(
      page.getByRole("tab", { name: "Recommendations" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("recommendations-featured")).toBeVisible();
    expect(await publicCategoryIds(page)).toEqual([
      "music",
      "movies",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
      "places",
    ]);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("recommendations-featured")).toBeVisible();
    expect((await publicCategoryIds(page))[0]).toBe("music");
    await expect(page.getByRole("tab", { name: "Business Details" })).toHaveCount(1);
  });

  test("Gallery selection, progress, success, and failure survive workspace switches and block premature save", async ({
    page,
    synthetic,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1024, height: 900 });
    await openDashboard(page);
    await page.getByRole("tab", { name: "Gallery", exact: true }).click();

    const importDisclosure = page.getByRole("button", {
      name: "Import photos",
      exact: true,
    });
    await importDisclosure.click();
    await expect(importDisclosure).toHaveAttribute("aria-expanded", "true");
    const instagramAction = page.getByRole("button", {
      name: "Instagram",
      exact: true,
    });
    await instagramAction.click();
    await expect(instagramAction).toHaveAttribute("aria-pressed", "true");
    const input = page.getByPlaceholder("username or https://instagram.com/username");
    await input.fill("synthetic.account");

    const fetchSuccess = synthetic.deferInstagram();
    await page.getByRole("button", { name: "Fetch", exact: true }).click();
    await expect(page.getByRole("button", { name: "Fetching..." })).toBeDisabled();
    await page.getByRole("tab", { name: "Appearance", exact: true }).click();
    await page.getByRole("button", { name: "Save & Publish", exact: true }).click();
    await expect(page.getByText(/Finish the instagram fetch before saving/i)).toBeVisible();
    expect(synthetic.mutationVariables).toEqual([]);
    await page.getByRole("tab", { name: "Gallery", exact: true }).click();
    await expect(input).toHaveValue("synthetic.account");
    await expect(page.getByRole("button", { name: "Fetching..." })).toBeDisabled();

    fetchSuccess.resolve("success");
    await expect(page.getByText("1 selected of 1")).toBeVisible();
    expect(synthetic.mutationVariables).toEqual([]);
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await page.getByRole("tab", { name: "Gallery", exact: true }).click();
    await expect(page.getByText("1 selected of 1")).toBeVisible();

    const uploadSuccess = synthetic.deferUpload();
    await page.getByRole("button", { name: "Save to Feed", exact: true }).click();
    await expect(page.getByRole("button", { name: "Uploading..." })).toBeDisabled();
    await page.getByRole("tab", { name: "Appearance", exact: true }).click();
    await page.getByRole("button", { name: "Save & Publish", exact: true }).click();
    await expect(page.getByText(/Finish the instagram import before saving/i)).toBeVisible();
    expect(synthetic.mutationVariables).toEqual([]);
    await page.getByRole("tab", { name: "Gallery", exact: true }).click();
    await expect(page.getByRole("button", { name: "Uploading..." })).toBeDisabled();
    uploadSuccess.resolve("success");
    await expect(page.getByText(/uploaded to feed successfully/i)).toBeVisible();
    expect(synthetic.mutationVariables).toEqual([]);
    await expect(input).toHaveCount(0);

    await instagramAction.click();
    await expect(instagramAction).toHaveAttribute("aria-pressed", "true");
    const retryInput = page.getByPlaceholder("username or https://instagram.com/username");
    await retryInput.fill("failing.account");
    const fetchFailure = synthetic.deferInstagram();
    await page.getByRole("button", { name: "Fetch", exact: true }).click();
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await page.getByRole("tab", { name: "Gallery", exact: true }).click();
    await expect(retryInput).toHaveValue("failing.account");
    fetchFailure.resolve("failure");
    await expect(page.getByText("Synthetic Instagram failure")).toBeVisible();
    expect(synthetic.mutationVariables).toEqual([]);
    await expect(page.getByRole("button", { name: "Fetch", exact: true })).toBeEnabled();
    await expect(retryInput).toHaveValue("failing.account");
  });
});

test.describe("touch transaction and scroll ownership", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 1000 },
  });

  test("real touch is handle-only, supports edge scrolling, and cancellation/inactivation stop scrolling", async ({
    context,
    page,
    synthetic,
  }) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDashboard(page);
    await openAppearance(page);

    for (const target of await page
      .locator(
        '.appearance-drag-handle, .appearance-category-action, [data-walkthrough="save-publish-button"] button',
      )
      .all()) {
      const box = await target.boundingBox();
      expect(box?.width || 0).toBeGreaterThanOrEqual(44);
      expect(box?.height || 0).toBeGreaterThanOrEqual(44);
    }

    const cdp = await context.newCDPSession(page);
    await touchDragCategory(cdp, page, "places", 8);
    expect(await readOrder(page)).toEqual(SAVED_ORDER);
    expect(synthetic.mutationVariables).toEqual([]);

    await page.getByRole("button", { name: "Move Music down" }).click();
    await expect(page.locator('[data-reorder-active="true"]')).toHaveCount(0);
    const adjustedOrder = [
      "movies",
      "music",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
      "places",
    ];
    expect(await readOrder(page)).toEqual(adjustedOrder);

    const rowBody = rowFor(page, "music").locator(".appearance-category-copy");
    await rowBody.scrollIntoViewIfNeeded();
    const bodyBox = await rowBody.boundingBox();
    if (!bodyBox) throw new Error("Row body geometry was unavailable");
    const beforeSwipe = await page.evaluate(() => window.scrollY);
    const orderBeforeSwipe = await readOrder(page);
    await dispatchTouch(cdp, "touchStart", bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2);
    for (let offset = 20; offset <= 180; offset += 20) {
      await dispatchTouch(
        cdp,
        "touchMove",
        bodyBox.x + bodyBox.width / 2,
        bodyBox.y + bodyBox.height / 2 - offset,
      );
    }
    await dispatchTouch(cdp, "touchEnd");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeSwipe);
    expect(await readOrder(page)).toEqual(orderBeforeSwipe);

    await page.setViewportSize({ width: 375, height: 600 });
    await rowFor(page, "music").scrollIntoViewIfNeeded();
    const edgeHandle = page.getByRole("button", { name: "Drag Music", exact: true });
    const handleBox = await edgeHandle.boundingBox();
    if (!handleBox) throw new Error("Touch handle geometry was unavailable");
    const scrollBeforeEdge = await page.evaluate(() => window.scrollY);
    const orderBeforeCancel = await readOrder(page);
    await dispatchTouch(cdp, "touchStart", handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await dispatchTouch(cdp, "touchMove", handleBox.x + handleBox.width / 2, 590);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBeforeEdge);
    await dispatchTouch(cdp, "touchCancel");
    await expectScrollStable(page);
    expect(await readOrder(page)).toEqual(orderBeforeCancel);

    await rowFor(page, "movies").scrollIntoViewIfNeeded();
    const unmountHandle = page.getByRole("button", {
      name: "Drag Movies & Shows",
      exact: true,
    });
    const unmountBox = await unmountHandle.boundingBox();
    if (!unmountBox) throw new Error("Unmount handle geometry was unavailable");
    const orderBeforeInactivation = await readOrder(page);
    await dispatchTouch(cdp, "touchStart", unmountBox.x + unmountBox.width / 2, unmountBox.y + unmountBox.height / 2);
    await dispatchTouch(cdp, "touchMove", unmountBox.x + unmountBox.width / 2, 590);
    await page.locator("#profile-editor-tab-profile").click();
    await expect(page.locator("#profile-editor-panel-profile")).toBeVisible();
    await expectScrollStable(page);
    await dispatchTouch(cdp, "touchCancel");
    await openAppearance(page);
    expect(await readOrder(page)).toEqual(orderBeforeInactivation);
    expect(await visiblePreviewCategoryIds(page)).toEqual(
      orderBeforeInactivation.slice(0, 3),
    );
    expect(synthetic.mutationVariables).toEqual([]);
  });
});

async function dispatchTouch(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
  x?: number,
  y?: number,
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints:
      x === undefined || y === undefined
        ? []
        : [
            {
              x,
              y,
              id: 1,
              radiusX: 6,
              radiusY: 6,
              force: 1,
            },
          ],
  });
}

async function touchDragCategory(
  cdp: CDPSession,
  page: Page,
  id: CategoryId,
  targetIndex: number,
) {
  await page.locator(".appearance-category-list").scrollIntoViewIfNeeded();
  const handle = page.getByRole("button", {
    name: `Drag ${CATEGORY_LABELS[id]}`,
    exact: true,
  });
  const target = orderRows(page).nth(targetIndex);
  const start = await handle.boundingBox();
  const destination = await target.boundingBox();
  if (!start || !destination) throw new Error("Touch drag geometry was unavailable");
  const startX = start.x + start.width / 2;
  const startY = start.y + start.height / 2;
  const endY = destination.y + destination.height / 2;
  await dispatchTouch(cdp, "touchStart", startX, startY);
  for (let step = 1; step <= 24; step += 1) {
    await dispatchTouch(
      cdp,
      "touchMove",
      startX,
      startY + ((endY - startY) * step) / 24,
    );
  }
  await expect
    .poll(async () => (await readOrder(page)).indexOf(id))
    .toBe(targetIndex);
  await dispatchTouch(cdp, "touchEnd");
  await expect
    .poll(async () => (await readOrder(page)).indexOf(id))
    .toBe(targetIndex);
}

async function expectScrollStable(page: Page) {
  const samples = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const values: number[] = [];
        const sample = () => {
          values.push(window.scrollY);
          if (values.length === 8) resolve(values);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(new Set(samples.slice(2)).size).toBe(1);
}

test.describe("responsive and accessibility geometry gates", () => {
  test("Settings keeps moved Account and Billing data usable across keyboard, reload, and responsive layouts", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await openSettings(page);
      await expectNoDocumentOverflow(page);

      const accountTab = page.getByRole("tab", { name: "Account", exact: true });
      const billingTab = page.getByRole("tab", { name: "Billing", exact: true });
      await expect(page.getByRole("tab")).toHaveCount(2);
      await expect(accountTab).toHaveAttribute("aria-selected", "true");
      await expect(accountTab).toHaveAttribute("tabindex", "0");
      await expect(billingTab).toHaveAttribute("tabindex", "-1");
      await expect(page.locator("#settings-panel-account")).toBeVisible();

      const accountSettings = page.locator(
        '[data-profile-account-settings="account"]',
      );
      await accountSettings
        .getByRole("button", { name: "Account", exact: true })
        .click();
      await expect(accountSettings.locator('input[name="username"]'))
        .toHaveValue("synthetic-explorer");
      await expect(accountSettings.locator('input[name="accountType"]:checked'))
        .toHaveValue("personal");

      await accountTab.focus();
      await accountTab.press("ArrowRight");
      await expect(billingTab).toBeFocused();
      await expect(billingTab).toHaveAttribute("aria-selected", "true");
      await expect(accountTab).toHaveAttribute("tabindex", "-1");
      await expect(billingTab).toHaveAttribute("tabindex", "0");
      await expect(page.locator("#settings-panel-billing")).toBeVisible();

      const billingSettings = page.locator(
        '[data-profile-account-settings="billing"]',
      );
      await billingSettings
        .getByRole("button", { name: "Billing Address", exact: true })
        .click();
      const billingValues = await billingSettings.locator("input").evaluateAll(
        (inputs) => inputs.map((input) => (input as HTMLInputElement).value),
      );
      expect(billingValues).toEqual(expect.arrayContaining([
        "1 Fixture Lane, Test City",
        "Test City",
        "Test Country",
      ]));

      const currentPlan = page.getByRole("button", {
        name: "Current Plan",
        exact: true,
      });
      await currentPlan.click();
      await expect(page.getByText("No Active Plan", { exact: true }))
        .toBeVisible();

      if (width === 375) {
        for (const tab of [accountTab, billingTab]) {
          const box = await tab.boundingBox();
          expect(box?.height || 0).toBeGreaterThanOrEqual(44);
          expect(box?.width || 0).toBeGreaterThanOrEqual(44);
        }
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(accountTab).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("#settings-panel-account")).toBeVisible();
      await expectNoDocumentOverflow(page);

      await accountTab.focus();
      await accountTab.press("End");
      await expect(billingTab).toBeFocused();
      await expect(billingTab).toHaveAttribute("aria-selected", "true");
      await billingTab.press("Home");
      await expect(accountTab).toBeFocused();
      await expect(accountTab).toHaveAttribute("aria-selected", "true");
    }
  });

  test("viewport and Appearance container breakpoints, sticky gates, focus, IDREFs, and reduced motion are deterministic", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const width of [320, 375, 639, 640, 767, 768, 903, 904, 1024, 1440]) {
      await page.setViewportSize({ width, height: width === 1024 ? 719 : 900 });
      await openDashboard(page);
      await openAppearance(page);
      await expectNoHorizontalOverflow(page);
      const mobileStrips = page.locator(".appearance-horizontal-strip");
      const appearanceInlineSize = await containerInlineSize(
        page.locator(".profile-editor-workspace-shell"),
      );
      if (appearanceInlineSize < 520) {
        await expect(mobileStrips).toHaveCount(2);
        for (const strip of await mobileStrips.all()) {
          const geometry = await strip.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              overflowX: style.overflowX,
              scrollSnapType: style.scrollSnapType,
            };
          });
          expect(geometry.overflowX).toBe("auto");
          expect(geometry.scrollSnapType).toMatch(/(?:x|inline)/);
          expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
        }
      } else {
        for (const strip of await mobileStrips.all()) {
          const geometry = await strip.evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            overflowX: getComputedStyle(element).overflowX,
          }));
          expect(geometry.overflowX).not.toBe("auto");
          expect(geometry.scrollWidth).toBeLessThanOrEqual(
            geometry.clientWidth + 1,
          );
        }
      }
      const tabs = await page.locator(".profile-editor-tab").all();
      for (const tab of tabs) {
        const box = await tab.boundingBox();
        expect(box?.width || 0).toBeGreaterThanOrEqual(width < 640 ? 48 : 52);
        expect(box?.height || 0).toBeGreaterThanOrEqual(width < 640 ? 48 : 52);
      }
      if (width <= 375) {
        const geometry = await mobileFixedSurfaceGeometry(page);
        expect(geometry.saveBar.position).toBe("fixed");
        expect(geometry.saveBar.x).toBeLessThanOrEqual(1);
        expect(geometry.saveBar.width).toBeGreaterThanOrEqual(width - 1);
        expect(geometry.saveBar.paddingLeft).toBe(16);
        expect(geometry.saveBar.paddingRight).toBe(16);
        expect(geometry.saveBar.hasSafeAreaBottomRule).toBe(true);
        expect(geometry.saveBar.computedBottom).toBe(80);
        expect(geometry.saveButton.height).toBeGreaterThanOrEqual(44);
        expect(geometry.saveButton.x).toBeGreaterThanOrEqual(16);
        expect(geometry.saveButton.right).toBeLessThanOrEqual(width - 16);
        expect(geometry.saveBar.bottom).toBeLessThanOrEqual(
          geometry.bottomNav.top,
        );

        const bottomControl = page.getByRole("button", {
          name: "Move People up",
          exact: true,
        });
        await bottomControl.focus();
        await bottomControl.evaluate((element) =>
          element.scrollIntoView({ block: "center" }),
        );
        await expect(bottomControl).toBeFocused();
        await expectFocusedBetweenStickySurfaces(page, bottomControl);
      }
    }

    await page.setViewportSize({ width: 1072, height: 900 });
    await openDashboard(page);
    await openAppearance(page);
    const shell = page.locator(".profile-editor-workspace-shell");
    expect(await containerInlineSize(shell)).toBeLessThan(904);
    await expect(page.locator('[data-preview-variant="mobile"]')).toBeVisible();
    await expect(page.locator('[data-preview-variant="desktop"]')).toBeHidden();

    const sidebarToggle = page.locator(".dashboard-header button[data-button-component=true]").first();
    await sidebarToggle.click();
    await expect.poll(() => page.locator("body").getAttribute("data-sidebar-open")).toBe("false");
    expect(await containerInlineSize(shell)).toBe(904);
    await expect(page.locator('[data-preview-variant="mobile"]')).toBeHidden();
    await expect(page.locator('[data-preview-variant="desktop"]')).toBeVisible();
    const split = await orderPreviewGeometry(page);
    expect(Math.abs(split.order.y - split.preview.y)).toBeLessThanOrEqual(2);
    expect(split.preview.x).toBeGreaterThan(split.order.x + split.order.width);

    await page.setViewportSize({ width: 1071, height: 900 });
    expect(await containerInlineSize(shell)).toBe(903);
    const stacked = await orderPreviewGeometry(page);
    expect(stacked.preview.y).toBeGreaterThan(stacked.order.y + stacked.order.height - 2);
    await expect(page.locator('[data-preview-variant="mobile"]')).toBeVisible();

    await page.setViewportSize({ width: 935, height: 900 });
    expect(await containerInlineSize(shell)).toBe(767);
    expect(await sameRowCount(page.locator(".appearance-layout-option"))).toBe(2);
    await page.setViewportSize({ width: 936, height: 900 });
    expect(await containerInlineSize(shell)).toBe(768);
    expect(await sameRowCount(page.locator(".appearance-layout-option"))).toBe(3);

    await page.setViewportSize({ width: 1072, height: 719 });
    await expect(page.locator(".appearance-preview")).toHaveCSS("position", "static");
    await page.setViewportSize({ width: 1072, height: 720 });
    await expect(page.locator(".appearance-preview")).toHaveCSS("position", "sticky");

    for (const workspace of ["profile", "gallery", "appearance"] as const) {
      await page.locator(`#profile-editor-tab-${workspace}`).click();
      const panel = page.locator(`#profile-editor-panel-${workspace}`);
      await expect(panel).toBeVisible();
      const headingId = {
        profile: "profile-editor-heading-profile",
        gallery: "gallery-media-heading",
        appearance: "appearance-settings-heading",
      }[workspace];
      await expect(page.locator(`#${headingId}`)).toBeVisible();
      expect(
        await resolvePanelLabels(panel, [
          `profile-editor-tab-${workspace}`,
          headingId,
        ]),
      ).not.toContain(false);
    }

    await page.locator("#profile-editor-tab-appearance").click();
    const firstView = page.getByLabel("First view");
    await firstView.focus();
    const focus = await firstView.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    expect(focus.outlineStyle).not.toBe("none");
    expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
    await firstView.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expectFocusedBetweenStickySurfaces(page, firstView);

    expect(
      await page.evaluate(() =>
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);
    const transitionMs = await page
      .locator(".appearance-category-row")
      .first()
      .evaluate((element) => {
        const value = getComputedStyle(element).transitionDuration;
        return value.endsWith("ms")
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1000;
      });
    expect(transitionMs).toBeLessThanOrEqual(0.01);
  });

  test("desktop Profile polish keeps the primary action visible and aligns local surfaces", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDashboard(page);

    const saveDock = page
      .getByRole("button", { name: "Save & Publish", exact: true })
      .locator("..")
      .locator("..");
    await expect(saveDock).toHaveCSS("position", "fixed");
    const saveBox = await saveDock.boundingBox();
    expect(saveBox).not.toBeNull();
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(900 - 16);

    const railAndCover = await page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>(
        ".profile-editor-tab-rail",
      );
      const cover = document.querySelector<HTMLElement>(
        ".relative.max-w-3xl.mx-auto.w-full.mt-4",
      );
      if (!rail || !cover) throw new Error("Profile rail or cover was unavailable");
      return {
        coverWidth: cover.getBoundingClientRect().width,
        lineWidth: Number.parseFloat(getComputedStyle(rail, "::after").width),
      };
    });
    expect(Math.abs(railAndCover.lineWidth - railAndCover.coverWidth))
      .toBeLessThanOrEqual(1);

    const bioTrigger = page.getByRole("button", { name: "Bio", exact: true });
    const closedRadius = await bioTrigger.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
    );
    expect(closedRadius).toBeGreaterThanOrEqual(8);

    await page.getByRole("tab", { name: "Gallery", exact: true }).click();
    const galleryActions = page.getByRole("group", { name: "Gallery" });
    const galleryPanel = page.locator("#profile-editor-panel-gallery");
    const [actionsBox, panelBox] = await boxes([galleryActions, galleryPanel]);
    expect(actionsBox.x).toBeGreaterThan(panelBox.x + panelBox.width / 2);
    expect(Math.abs(actionsBox.x + actionsBox.width - (panelBox.x + panelBox.width)))
      .toBeLessThanOrEqual(2);

    await openAppearance(page);
    await expect(page.locator(".appearance-theme-preview")).toHaveCount(6);
    await expect(page.locator(".appearance-category-row").first())
      .toHaveCSS("cursor", "grab");
  });

  test("Profile fields span and split at the exact 639/640 container boundary", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 679, height: 900 });
    await openDashboard(page);
    const account = page.locator('input[name="accountName"]');
    const location = page.getByPlaceholder("City, Country", { exact: true });
    const bio = page.locator('[data-field="bio"]');
    expect(await fieldContainerInlineSize(account)).toBe(639);
    const narrowFields = await fieldCellBoxes([bio, account, location]);
    expect(narrowFields[2].y).toBeGreaterThan(narrowFields[1].y + narrowFields[1].height);
    expect(narrowFields[0].width).toBe(narrowFields[1].width);

    await page.setViewportSize({ width: 680, height: 900 });
    expect(await fieldContainerInlineSize(account)).toBe(640);
    const wideFields = await fieldCellBoxes([bio, account, location]);
    expect(Math.abs(wideFields[1].y - wideFields[2].y)).toBeLessThanOrEqual(2);
    expect(wideFields[2].x).toBeGreaterThan(wideFields[1].x + wideFields[1].width);
    expect(wideFields[0].width).toBeGreaterThan(wideFields[1].width * 1.8);
  });

  test("200% effective-viewport reflow and LTR/RTL tooltip containment remain usable", async ({
    page,
    synthetic,
  }) => {
    await page.setViewportSize({ width: 750, height: 900 });
    await openDashboard(page);
    await openAppearance(page);
    const baselineViewport = await browserViewportGeometry(page);
    expect(baselineViewport.layoutWidth).toBe(750);
    expect(baselineViewport.clientWidth).toBe(750);
    expect(baselineViewport.visualWidth).toBe(750);

    await page.setViewportSize({ width: 375, height: 900 });
    const effectiveZoomViewport = await browserViewportGeometry(page);
    expect(effectiveZoomViewport.layoutWidth).toBe(375);
    expect(effectiveZoomViewport.clientWidth).toBe(375);
    expect(effectiveZoomViewport.visualWidth).toBe(375);
    expect(effectiveZoomViewport.layoutWidth).toBe(
      baselineViewport.layoutWidth / 2,
    );
    await expectNoHorizontalOverflow(page);
    await expect(page.getByLabel("First view")).toBeVisible();
    await expect(page.locator('[data-preview-variant="mobile"]')).toBeVisible();
    await expect(page.locator('[data-preview-variant="desktop"]')).toBeHidden();

    const blockedProbe = await page.evaluate(async () => {
      try {
        await fetch("/__task6_unhandled_probe__");
        return "fulfilled";
      } catch {
        return "blocked";
      }
    });
    expect(blockedProbe).toBe("blocked");
    await expect
      .poll(() =>
        synthetic.unhandledRequests.some((request) =>
          request.includes("/__task6_unhandled_probe__"),
        ),
      )
      .toBe(true);
    synthetic.acknowledgeUnhandled("/__task6_unhandled_probe__");

    const blockedImageProbe = await page.evaluate(
      () =>
        new Promise<"blocked" | "fulfilled">((resolve) => {
          const image = new Image();
          image.onload = () => resolve("fulfilled");
          image.onerror = () => resolve("blocked");
          image.src = "/__task6_unhandled_image_probe__.png";
        }),
    );
    expect(blockedImageProbe).toBe("blocked");
    await expect
      .poll(() =>
        synthetic.unhandledRequests.some((request) =>
          request.includes("/__task6_unhandled_image_probe__.png"),
        ),
      )
      .toBe(true);
    synthetic.acknowledgeUnhandled("/__task6_unhandled_image_probe__.png");

    await page.evaluate(() => {
      localStorage.setItem("explorers-language", "en");
      document.documentElement.dir = "ltr";
    });
    await expectTooltipContained(page, "ltr");
    await page.evaluate(() => {
      localStorage.setItem("explorers-language", "ar");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-testid=profile-editor-root]")).toHaveAttribute("dir", "rtl");
    await expectTooltipContained(page, "rtl");
  });
});

async function containerInlineSize(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return Math.round(
      element.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight),
    );
  });
}

async function fieldContainerInlineSize(locator: Locator) {
  return locator.evaluate((element) => {
    const container = element.closest(".profile-fields-container");
    if (!container) throw new Error("Profile field container was not found");
    const style = getComputedStyle(container);
    return Math.round(
      (container as HTMLElement).clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight),
    );
  });
}

async function boxes(locators: Locator[]) {
  const result = [];
  for (const locator of locators) {
    const box = await locator.boundingBox();
    if (!box) throw new Error("Expected visible geometry");
    result.push(box);
  }
  return result;
}

async function fieldCellBoxes(locators: Locator[]) {
  const result = [];
  for (const locator of locators) {
    result.push(
      await locator.evaluate((element) => {
        const container = element.closest(".profile-fields-container");
        const grid = container?.firstElementChild;
        if (!grid) throw new Error("Profile field grid was not found");
        let cell: Element | null = element;
        while (cell?.parentElement && cell.parentElement !== grid) {
          cell = cell.parentElement;
        }
        if (!cell || cell.parentElement !== grid) {
          throw new Error("Profile field cell was not found");
        }
        const box = cell.getBoundingClientRect();
        return {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        };
      }),
    );
  }
  return result;
}

async function sameRowCount(locator: Locator) {
  const values = await locator.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().top)),
  );
  return Math.max(
    ...Array.from(new Set(values)).map(
      (top) => values.filter((value) => Math.abs(value - top) <= 2).length,
    ),
  );
}

async function orderPreviewGeometry(page: Page) {
  const [order, preview] = await boxes([
    page.locator(".appearance-order-editor"),
    page.locator(".appearance-preview"),
  ]);
  return { order, preview };
}

async function browserViewportGeometry(page: Page) {
  return page.evaluate(() => {
    if (!window.visualViewport) {
      throw new Error("visualViewport is unavailable");
    }
    return {
      layoutWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      visualWidth: Math.round(window.visualViewport.width),
    };
  });
}

async function mobileFixedSurfaceGeometry(page: Page) {
  const saveButton = page.getByRole("button", {
    name: "Save & Publish",
    exact: true,
  });
  const saveBar = saveButton.locator("..").locator("..");
  const bottomNav = page
    .getByRole("button", { name: "Home", exact: true })
    .locator("..")
    .locator("..");
  await expect(saveBar).toHaveCSS("position", "fixed");
  await expect(bottomNav).toHaveCSS("position", "fixed");
  return page.evaluate(
    ({ saveButtonElement, saveBarElement, bottomNavElement }) => {
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      const saveBarStyle = getComputedStyle(saveBarElement);
      const containsSafeAreaBottomRule = (rules: CSSRuleList): boolean =>
        Array.from(rules).some((rule) => {
          if (rule instanceof CSSStyleRule) {
            return (
              rule.selectorText.includes(".profile-editor-save-dock") &&
              rule.style.bottom.includes("env(safe-area-inset-bottom)")
            );
          }
          return (
            "cssRules" in rule &&
            containsSafeAreaBottomRule((rule as CSSGroupingRule).cssRules)
          );
        });
      return {
        saveButton: box(saveButtonElement),
        saveBar: {
          ...box(saveBarElement),
          position: saveBarStyle.position,
          paddingLeft: Number.parseFloat(saveBarStyle.paddingLeft),
          paddingRight: Number.parseFloat(saveBarStyle.paddingRight),
          computedBottom: Number.parseFloat(saveBarStyle.bottom),
          hasSafeAreaBottomRule: Array.from(document.styleSheets).some(
            (styleSheet) => {
              try {
                return containsSafeAreaBottomRule(styleSheet.cssRules);
              } catch {
                return false;
              }
            },
          ),
        },
        bottomNav: box(bottomNavElement),
      };
    },
    {
      saveButtonElement: await saveButton.elementHandle(),
      saveBarElement: await saveBar.elementHandle(),
      bottomNavElement: await bottomNav.elementHandle(),
    },
  );
}

async function expectFocusedBetweenStickySurfaces(page: Page, target: Locator) {
  const geometry = await page.evaluate((selector) => {
    const element = document.querySelector<HTMLElement>(selector);
    const rail = document.querySelector<HTMLElement>(".profile-editor-tab-rail");
    const saveWalkthrough = document.querySelector<HTMLElement>(
      '[data-walkthrough="save-publish-button"]',
    );
    const save = saveWalkthrough?.parentElement;
    if (!element || !rail || !save) {
      throw new Error("Focused-control sticky surface geometry was unavailable");
    }
    const targetBox = element.getBoundingClientRect();
    const railBox = rail.getBoundingClientRect();
    const saveBox = save.getBoundingClientRect();
    return {
      targetTop: targetBox.top,
      targetBottom: targetBox.bottom,
      railBottom: railBox.bottom,
      saveTop: saveBox.top,
    };
  }, await target.evaluate((element) => {
    if (!element.id) element.id = "task-6-focused-target";
    return `#${CSS.escape(element.id)}`;
  }));
  expect(geometry.targetTop).toBeGreaterThanOrEqual(geometry.railBottom - 1);
  expect(geometry.targetBottom).toBeLessThanOrEqual(geometry.saveTop + 1);
}

async function expectTooltipContained(page: Page, direction: "ltr" | "rtl") {
  const tab = page.locator("#profile-editor-tab-appearance");
  if (await tab.evaluate((element) => element.ownerDocument.activeElement === element)) {
    await page.getByLabel("First view").focus();
  }
  await tab.focus();
  const tooltip = page.locator(".profile-editor-tab-tooltip");
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  if (!box) throw new Error(`${direction} tooltip geometry was unavailable`);
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport?.width || 0);
}
