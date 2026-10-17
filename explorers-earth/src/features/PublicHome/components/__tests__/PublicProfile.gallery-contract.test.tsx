import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable, type FetchResult } from "@apollo/client";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { print } from "graphql";
import { HelmetProvider } from "react-helmet-async";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureProfileController } from "../../../../../../tunes/scripts/music-fixture-profile";
import PublicProfile from "../PublicProfile";
import { getPublicAccountBasicQuery } from "../../api/query";

const publicGateway = vi.hoisted(() => ({
  shell: vi.fn(),
  category: vi.fn(),
  peekCategory: vi.fn(),
  detail: vi.fn(),
}));

vi.mock("../../api/publicProfileGatewayClient", () => ({
  publicProfileGatewayClient: publicGateway,
}));

// Analytics is the external write boundary. Profile, FeedLayout, Gallery,
// and the fixture's checked-in document registry stay real. Anonymous public
// reads are now served by the public gateway rather than Apollo.
vi.mock("../../../../services/analyticsService", () => ({
  createAnalyticsOptions: { profile: () => ({}) },
  useTrackAnalytics: () => ({ trackClick: () => undefined }),
}));

const widthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth")!;
const heightDescriptor = Object.getOwnPropertyDescriptor(window, "innerHeight")!;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "innerWidth", widthDescriptor);
  Object.defineProperty(window, "innerHeight", heightDescriptor);
});

describe("populated fixture Gallery with the real public profile renderer", () => {
  it("serves the shared PublicAccountBasic document and denies the obsolete CheckUsername operation", () => {
    const controller = createFixtureProfileController({
      username: "e2e-public-music-gallery-contract-owner",
      accountDocumentId: "e2e-public-music-gallery-contract-account",
      userDocumentId: "e2e-public-music-gallery-contract-user",
      baseUser: { provider: "local", confirmed: true, blocked: false },
      baseAccount: { mobile_number: "+10000000000" },
    });

    expect(controller.graphql(print(getPublicAccountBasicQuery), {
      filters: { username: { eq: "e2e-public-music-gallery-contract-owner" } },
    }).status).toBe(200);
    expect(controller.graphql(`query CheckUsername($username: String!) {
      accounts(filters: { username: { eq: $username } }) { documentId Account_Name }
    }`, { username: "e2e-public-music-gallery-contract-owner" }).status).toBe(403);
  });

  it.each([
    { label: "mobile", width: 375, height: 667 },
    { label: "desktop", width: 1280, height: 720 },
  ])("selects and renders the real image for row1 at $label width", async ({ width, height }) => {
    // jsdom has no layout engine. Supply the measured gallery width only;
    // this is component/layout-input coverage, not browser screenshot evidence.
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    const nativeRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      return this.classList.contains("ReactGridGallery")
        ? new DOMRect(0, 0, width - 32, 200)
        : nativeRect.call(this);
    });
    // The shared arrow-function mock is not constructible in Vitest 4.
    // Gallery's real ref callback still measures its initial container width.
    vi.stubGlobal("ResizeObserver", class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    });
    const network = vi.fn(() => Promise.reject(new Error("Gallery contract forbids network access")));
    vi.stubGlobal("fetch", network);
    const controller = createFixtureProfileController({
      username: "e2e-public-music-gallery-contract-owner",
      accountDocumentId: "e2e-public-music-gallery-contract-account",
      userDocumentId: "e2e-public-music-gallery-contract-user",
      baseUser: { provider: "local", confirmed: true, blocked: false },
      baseAccount: { mobile_number: "+10000000000" },
    });
    const baseline = controller.account();
    const rawBefore = JSON.stringify(baseline);
    expect(baseline.social_media).toMatchObject({ theme_settings: {
      preset: "cinematic-dark", accentColor: "#10B981", wallpaperMode: "banner-top",
      landingTab: "all-recommendations", visibleTabs: { gallery: true },
      recommendations: { layout: "shelves", categoryOrder: ["places", "movies", "books", "games", "guides", "apps", "products", "people"] },
    } });
    expect(baseline.Feed_Data).toEqual([{
      id: "e2e-public-music-gallery-contract-gallery-image",
      documentId: "e2e-public-music-gallery-contract-gallery-image",
      url: "/images/tuneslogo.png", fileName: "tuneslogo.png", type: "image",
      aspectRatio: "1:1", width: 512, height: 512, uploadSource: "fixture",
    }]);
    publicGateway.shell.mockResolvedValue(baseline);
    publicGateway.category.mockResolvedValue({
      recommendationLists: [{
        documentId: "fixture-places-list",
        List_Name: "Fixture places",
        slug: "fixture-places",
        Visibility: true,
        recommended_places: [{
          documentId: "fixture-place",
          Place_Details: { name: "Fixture place" },
          recommendation_category: { Category_Name: "Places" },
          Media: null,
        }],
      }],
    });
    const operations: string[] = [];
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink((operation) => new Observable((observer) => {
        operations.push(operation.operationName);
        const result = controller.graphql(print(operation.query), operation.variables);
        if (result.status !== 200) {
          observer.error(new Error("Gallery fixture document was rejected"));
        } else {
          observer.next(result.body as FetchResult);
          observer.complete();
        }
      })),
    });
    const router = createMemoryRouter([
      { path: "/:username", element: <PublicProfile /> },
    ], { initialEntries: ["/e2e-public-music-gallery-contract-owner"] });
    const mounted = render(<ApolloProvider client={client}>
      <HelmetProvider><RouterProvider router={router} /></HelmetProvider>
    </ApolloProvider>);
    try {
      const root = await screen.findByTestId("public-profile-theme-root");
      expect(root).toHaveAttribute("data-theme-preset", "cinematic-dark");
      expect(root).toHaveAttribute("data-wallpaper-mode", "banner-top");
      const recommendations = screen.getByRole("tab", { name: "Recommendations", exact: true });
      fireEvent.click(recommendations);
      expect(await screen.findByTestId("recommendations-shelves")).toBeVisible();
      expect(recommendations).toHaveAttribute("aria-selected", "true");
      const gallery = screen.getByRole("tab", { name: "Gallery", exact: true });
      expect(screen.getAllByRole("tab", { name: "Gallery", exact: true })).toHaveLength(1);
      expect(gallery).toBeVisible();
      fireEvent.click(gallery);
      expect(gallery).toHaveAttribute("aria-selected", "true");
      const panel = await screen.findByRole("tabpanel", { name: "Gallery", exact: true });
      expect(panel).toBeVisible();
      expect(panel).toHaveAttribute("id", "public-profile-gallery-panel");
      expect(panel).toHaveAttribute("aria-labelledby", gallery.id);
      const image = within(panel).getByRole("img", { name: "tuneslogo.png", exact: true });
      expect(within(panel).getAllByRole("img")).toHaveLength(1);
      expect(image).toBeVisible();
      expect(image).toHaveAttribute("src", "/images/tuneslogo.png");
      expect(panel.querySelector(".ReactGridGallery")).not.toBeNull();
      expect(router.state.location.pathname).toBe("/e2e-public-music-gallery-contract-owner");
      expect(publicGateway.shell).toHaveBeenCalledWith("e2e-public-music-gallery-contract-owner", expect.any(AbortSignal), false);
      expect(publicGateway.category).toHaveBeenCalled();
      expect(operations).not.toContain("CheckUsername");
      expect(operations.some((name) => name.startsWith("Update"))).toBe(false);
      expect(JSON.stringify(controller.account())).toBe(rawBefore);
      expect(network).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
      router.dispose();
      client.stop();
    }
  });
});
