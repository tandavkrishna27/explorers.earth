import { expect, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createFixtureProfileController } from "../../../tunes/scripts/music-fixture-profile";

export const SYNTHETIC_PROFILE_ORIGIN = "http://127.0.0.1:55175";
export const SYNTHETIC_PROFILE_PATH = "/e2e-public-music-gallery-browser-owner";

const publicOperations = new Set([
  "CheckUsername", "PublicAccountBasic", "PublicProfileData", "PublicCategoryListCounts",
  "GetPlacesLists", "GetMoviesLists", "GetBooksLists", "GetGamesLists",
  "GetAppsLists", "GetProductsLists", "GetPeopleLists", "GetGuidesLists",
]);

export interface SyntheticProfileVariant {
  preset: "cinematic-dark" | "minimal-light" | "glassmorphism";
  wallpaperMode: "banner-top" | "solid-color" | "ambient-gradient" | "full-wallpaper-image";
  business: boolean;
}

/** Install before the first navigation. Only public fixture queries are data. */
export async function installSyntheticProfileRoutes(context: BrowserContext, variant: SyntheticProfileVariant) {
  const controller = createFixtureProfileController({
    username: SYNTHETIC_PROFILE_PATH.slice(1),
    accountDocumentId: "e2e-public-music-gallery-browser-account",
    userDocumentId: "e2e-public-music-gallery-browser-user",
    baseUser: { provider: "local", confirmed: true, blocked: false },
    baseAccount: { mobile_number: "+10000000000" },
  });
  const account = controller.account();
  const social = account.social_media as Record<string, unknown>;
  account.social_media = {
    ...social,
    theme_settings: {
      ...(social.theme_settings as Record<string, unknown>),
      preset: variant.preset,
      wallpaperMode: variant.wallpaperMode,
    },
  };
  if (variant.business) {
    account.Public_Profile_Address = JSON.stringify({
      title: "Synthetic workshop", address: "Fixture City", about: "Synthetic business details.",
    });
  }
  const counters = { publicQueries: 0, deniedExternal: 0, deniedAuthority: 0, deniedUnknown: 0, forwardedData: 0, pageErrors: [] as string[] };
  for (const page of context.pages()) {
    page.on("pageerror", (error) => {
      if (counters.pageErrors.length === 8) return;
      counters.pageErrors.push(error.message.includes("preamble") ? "react-preamble"
        : error.message.includes("does not provide an export") ? "module-export"
        : error.message.includes("process is not defined") ? "process-undefined"
        : error.message.includes("is not defined") ? "reference-undefined"
        : error.message.includes("Cannot read properties") ? "undefined-property"
        : error.message.includes("Invalid URL") ? "invalid-url"
        : error.message.includes("Content Security Policy") ? "content-policy"
        : "other");
    });
  }
  await context.routeWebSocket(/.*/, (socket) => socket.close());
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== SYNTHETIC_PROFILE_ORIGIN) {
      counters.deniedExternal += 1;
      await route.abort("blockedbyclient");
      return;
    }
    if (url.pathname === "/graphql" && request.method() === "POST") {
      const payload: unknown = request.postDataJSON();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        counters.deniedUnknown += 1;
        await route.abort("blockedbyclient");
        return;
      }
      const body = payload as { operationName?: string; query?: string; variables?: Record<string, unknown> };
      if (!body.operationName || !publicOperations.has(body.operationName)
          || typeof body.query !== "string" || !body.variables
          || request.headers().authorization) {
        counters.deniedAuthority += 1;
        await route.abort("blockedbyclient");
        return;
      }
      const result = controller.graphql(body.query, body.variables);
      if (result.status !== 200) {
        counters.deniedUnknown += 1;
        await route.abort("blockedbyclient");
        return;
      }
      // Variant data is entirely in-memory; no fixture mutation endpoint exists.
      const response = ["PublicAccountBasic", "PublicProfileData"].includes(body.operationName)
        ? { data: { accounts: [account] } }
        : result.body;
      counters.publicQueries += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
      return;
    }
    const publicGateway = controller.publicGateway(url.pathname, request.method());
    if (publicGateway) {
      if (request.headers().authorization) {
        counters.deniedAuthority += 1;
        await route.abort("blockedbyclient");
        return;
      }
      counters.publicQueries += 1;
      await route.fulfill({
        status: publicGateway.status,
        contentType: "application/json",
        body: JSON.stringify(
          url.pathname === `/api/explorers/v1/profiles/${encodeURIComponent(SYNTHETIC_PROFILE_PATH.slice(1))}`
            ? account
            : publicGateway.body,
        ),
      });
      return;
    }
    if (/^\/(?:api|accounts|graphql|google-auth|login|__music-fixture|__localtunes)(?:\/|$)/.test(url.pathname)
        || request.method() !== "GET") {
      counters.deniedAuthority += 1;
      await route.abort("blockedbyclient");
      return;
    }
    const isStatic = url.pathname === SYNTHETIC_PROFILE_PATH
      || /^\/(?:src|node_modules|images|assets)\//.test(url.pathname)
      || /^\/@(?:vite\/client|react-refresh|id\/|fs\/)/.test(url.pathname)
      || /^\/[A-Za-z0-9_-]+\.(?:svg|png|ico)$/.test(url.pathname);
    if (!isStatic) {
      counters.deniedUnknown += 1;
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await context.addInitScript(() => {
    // No session/identity credentials. Opt out before real analytics initializes.
    localStorage.setItem("explorers-cookie-consent", JSON.stringify({ essential: true, analytics: false, marketing: false }));
  });
  return counters;
}

export type TabClickPhase = "before-click" | "click" | "selected" | "panel" | "content" | "complete";

/** Fixed classifications only: never serialize HTML, CSS, URL, text, or errors. */
export async function tabHitState(tab: Locator) {
  return tab.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const obstruction = hit && element.contains(hit) ? "target"
      : hit?.closest("[data-profile-hero-backdrop]") ? "hero-backdrop"
      : hit?.closest('[data-testid="cookie-consent-positioner"]') ? "cookie-banner"
      : hit?.closest("header.fixed") ? "fixed-header"
      : hit?.closest(".fixed.inset-0.z-50") ? "public-loading-overlay"
      : hit ? "other" : "unavailable";
    const selected = element.getAttribute("aria-selected");
    return {
      obstruction,
      selected: selected === "true" ? "true" : selected === "false" ? "false" : "missing",
      attached: element.isConnected,
      enabled: !(element as HTMLButtonElement).disabled,
      insideViewport: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
      pageAtTop: scrollY === 0,
      profileAtTop: element.closest('[data-testid="public-profile-theme-root"]')?.scrollTop === 0,
    };
  });
}

export async function selectSyntheticGallery(page: Page, testInfo: TestInfo) {
  const tab = page.getByRole("tab", { name: "Gallery", exact: true });
  const panel = page.getByRole("tabpanel", { name: "Gallery", exact: true });
  let phase: TabClickPhase = "before-click";
  await expect(tab).toHaveCount(1);
  await expect(tab).toBeVisible();
  const before = await tabHitState(tab);
  try {
    phase = "click";
    await tab.click(); // Real pointer/actionability check: never force or dispatch.
    phase = "selected";
    await expect(tab).toHaveAttribute("aria-selected", "true");
    phase = "panel";
    await expect(panel).toBeVisible();
    phase = "content";
    const image = panel.getByRole("img", { name: "tuneslogo.png", exact: true });
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", "/images/tuneslogo.png");
    await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    phase = "complete";
  } finally {
    const after = await tabHitState(tab).catch(() => null);
    await testInfo.attach("synthetic-tab-hit-state", {
      body: JSON.stringify({ version: 1, phase, before, after }), contentType: "application/json",
    });
    if (phase !== "complete" && page.url() === `${SYNTHETIC_PROFILE_ORIGIN}${SYNTHETIC_PROFILE_PATH}`) {
      await testInfo.attach("synthetic-public-page", { body: await page.screenshot(), contentType: "image/png" });
    }
  }
}
