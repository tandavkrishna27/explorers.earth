import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { StrictMode } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicApps from "../../features/AppsAndTools/components/public/PublicApps";
import PublicGuideDetailPage from "../../features/PublicHome/components/PublicGuideDetailPage";
import { PublicHeaderDescriptorProvider } from "../../features/PublicHome/components/PublicHeaderDescriptorContext";
import { createPublicProfileGatewayClient } from "../../features/PublicHome/api/publicProfileGatewayClient";
import { publishPublicProfileInvalidation } from "../../features/PublicHome/api/publicProfileInvalidation";

// Each case gets a real gateway cache. Only the external HTTP boundary is fake.
const gateway = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createPublicProfileGatewayClient> | undefined }));
vi.mock("../../features/PublicHome/api/publicProfileGatewayClient", async importOriginal => ({
  ...await importOriginal<typeof import("../../features/PublicHome/api/publicProfileGatewayClient")>(),
  publicProfileGatewayClient: new Proxy({}, { get: (_target, key) => gateway.client?.[key as keyof typeof gateway.client] }),
}));
vi.mock("../../services/analyticsService", () => ({
  useTrackAnalytics: () => ({ trackClick: vi.fn(), trackEvent: vi.fn(), trackView: vi.fn(), trackInteraction: vi.fn(), loading: false, error: null }),
  createAnalyticsOptions: { apps: () => ({}) },
}));
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => children,
  AdvancedMarker: ({ children }: { children?: React.ReactNode }) => children,
  Map: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Pin: () => null, useApiIsLoaded: () => false, useMap: () => null,
}));

const shell = (username = "alice") => ({ documentId: `${username}-account`, username, Account_Name: username === "alice" ? "Alice" : "Bob", public_apps: "Yes", public_guides: "Yes" });
const appListData = (name: string) => ({
  appLists: [{
    documentId: name, List_Name: name, list_description: null, slug: name, cover_image: null, top_apps_heading: null,
    recommended_apps: [{
      documentId: `${name}-app`, app_url: "https://example.com", title: `${name} pick`, logo_url: null,
      description: null, developer: null, platforms: [], price_tier: null, download_url: null, screenshots: [],
      user_recommendation_note: null, user_rating: null, is_pinned: false, pin_order: null, app_category: null,
    }],
  }], recommendedApps: [],
});
const guideData = () => ({ guides: [{
  documentId: "guide-1", Title: "Weekend", Description: "A useful weekend guide", Guide_Type: null,
  Visibility: true, Estimated_Budget: null, Number_Of_Days: null, slug: "weekend", Guide_Media: [],
  Place_Details: null, Tips_Notes: null, Guide_Section_Details: null, Guide_Tags: [], guide_sections: [],
  is_pinned: false, pin_order: null, display_order: null, createdAt: null, updatedAt: null,
}] });
function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
const prefix = "/api/explorers/v1/profiles/";
function installHttp(handler: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  gateway.client = createPublicProfileGatewayClient("https://gateway.test", async (input, init) => {
    const path = new URL(String(input)).pathname;
    requests.push({ path, init });
    return handler(path, init);
  });
  return requests;
}
function TestShell() {
  return <PublicHeaderDescriptorProvider username="alice" profileName="Alice">
    <header role="banner">Persistent public header</header>
    <nav aria-label="Public navigation">Persistent public navigation</nav>
    <Outlet context={{ isShellRevealed: true, setIsPageLoaded: vi.fn() }} />
  </PublicHeaderDescriptorProvider>;
}
function renderPage(path = "/alice/apps", strict = false) {
  const content = <HelmetProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<TestShell />}>
      <Route path="/:username/apps" element={<PublicApps />} />
      <Route path="/:username/guides/:guideSlug" element={<PublicGuideDetailPage />} />
    </Route>
  </Routes></MemoryRouter></HelmetProvider>;
  return render(strict ? <StrictMode>{content}</StrictMode> : content);
}

describe("public shell gateway cache integration", () => {
  beforeEach(() => { gateway.client = undefined; });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  // Matching/ownership moved to the server. The browser must use a scoped slug,
  // not fetch a globally addressed document after a client-side index lookup.
  it("requests the username-scoped Guide slug and waits for usable detail", async () => {
    const detail = deferredResponse();
    let shellAttempt = 0;
    const requests = installHttp(path => {
      if (path === `${prefix}alice`) return ++shellAttempt === 1 ? Response.json(shell()) : Response.json({}, { status: 503 });
      if (path === `${prefix}alice/recommendations/guides/weekend`) return detail.promise;
      throw new Error(`Unexpected request: ${path}`);
    });
    renderPage("/alice/guides/weekend");
    await waitFor(() => expect(requests.map(request => request.path)).toEqual([
      `${prefix}alice`, `${prefix}alice/recommendations/guides/weekend`,
    ]));
    expect(screen.queryByRole("heading", { name: "Weekend" })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    detail.resolve(Response.json(guideData()));
    expect(await screen.findByRole("heading", { name: "Weekend" })).toBeInTheDocument();
    act(() => publishPublicProfileInvalidation({ accountDocumentId: "alice-account", username: "alice", category: "public_guides", action: "pin", eventId: "guide-shell-refresh" }));
    expect(await screen.findByText("Some guide data is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weekend" })).toBeInTheDocument();
  });

  it.each(["unmatched", "unsafe"])("does not render %s Guide detail", async kind => {
    const requests = installHttp(path => {
      if (path === `${prefix}alice`) return Response.json(shell());
      if (path !== `${prefix}alice/recommendations/guides/weekend`) throw new Error(`Unexpected request: ${path}`);
      return kind === "unmatched" ? Response.json({}, { status: 404 })
        : Response.json({ guides: [{ documentId: "foreign-guide", Title: "Foreign account guide", slug: "weekend", guide_sections: null }] });
    });
    renderPage("/alice/guides/weekend");
    if (kind === "unmatched") expect(await screen.findByRole("heading", { name: "Guide unavailable" })).toBeInTheDocument();
    else {
      expect(await screen.findByRole("heading", { name: "Guide unavailable" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Back to Guides" })).toBeInTheDocument();
      expect(screen.queryByText("Failed to load guide", { exact: true })).not.toBeInTheDocument();
    }
    expect(requests.map(request => request.path)).toEqual([`${prefix}alice`, `${prefix}alice/recommendations/guides/weekend`]);
    expect(screen.queryByRole("heading", { name: "Foreign account guide" })).not.toBeInTheDocument();
  });

  it("retains network-populated content when the route unmounts and remounts", async () => {
    const refresh = deferredResponse();
    let appAttempt = 0;
    const requests = installHttp(path => path === `${prefix}alice` ? Response.json(shell())
      : ++appAttempt === 1 ? Response.json(appListData("Network-cached apps"), { headers: { ETag: '"apps-1"' } }) : refresh.promise);
    const first = renderPage("/alice/apps", true);
    expect(await screen.findByText("Network-cached apps")).toBeInTheDocument();
    first.unmount();
    renderPage("/alice/apps", true);
    expect(await screen.findByText("Network-cached apps")).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    await waitFor(() => expect(appAttempt).toBe(2));
    expect(new Headers(requests.at(-1)?.init?.headers).get("If-None-Match")).toBe('"apps-1"');
    refresh.resolve(Response.json(appListData("Refreshed apps")));
    expect(await screen.findByText("Refreshed apps")).toBeInTheDocument();
  });

  it("retains complete cached content and shell during gateway revalidation", async () => {
    const refresh = deferredResponse();
    let seeded = false;
    installHttp(path => path === `${prefix}alice` ? Response.json(shell())
      : seeded ? refresh.promise : Response.json(appListData("Cached apps")));
    await gateway.client!.category("alice", "apps");
    seeded = true;
    renderPage();
    expect(await screen.findByText("Cached apps")).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Public navigation" })).toBeInTheDocument();
    refresh.resolve(Response.json(appListData("Fresh apps")));
    expect(await screen.findByText("Fresh apps")).toBeInTheDocument();
  });

  it("does not treat an incomplete cached collection as usable content", async () => {
    const refresh = deferredResponse();
    let seeded = false;
    const requests = installHttp(path => path === `${prefix}alice` ? Response.json(shell())
      : seeded ? refresh.promise : Response.json({ appLists: [{ documentId: "partial-list", List_Name: "Incomplete apps" }], recommendedApps: [] }));
    await gateway.client!.category("alice", "apps");
    seeded = true;
    renderPage();
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(screen.queryByText("Incomplete apps")).not.toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    refresh.resolve(Response.json(appListData("Complete apps")));
    expect(await screen.findByText("Complete apps")).toBeInTheDocument();
  });

  it("retains usable partial collection data and adds a non-destructive notice", async () => {
    installHttp(path => path === `${prefix}alice` ? Response.json(shell()) : Response.json({
      ...appListData("Partial apps"), appLists: [...appListData("Partial apps").appLists, { documentId: "broken-list", recommended_apps: null }],
    }));
    renderPage();
    expect(await screen.findByText("Partial apps")).toBeInTheDocument();
    expect(screen.getByText("Some app data is unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("No apps shared yet")).not.toBeInTheDocument();
  });

  it("renders a terminal HTTP error and Retry resolves without shell removal", async () => {
    let appAttempt = 0;
    const requests = installHttp(path => path === `${prefix}alice` ? Response.json(shell())
      : ++appAttempt === 1 ? Response.json({}, { status: 503 }) : Response.json(appListData("Recovered apps")));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Apps unavailable" })).toBeInTheDocument();
    const header = screen.getByRole("banner");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("banner")).toBe(header);
    expect(screen.getByRole("navigation", { name: "Public navigation" })).toBeInTheDocument();
    expect(await screen.findByText("Recovered apps")).toBeInTheDocument();
    expect(new Headers(requests.filter(request => request.path.endsWith("/apps")).at(-1)?.init?.headers).get("Cache-Control")).toBe("no-cache");
  });

  it("does not display cached content for a different username", async () => {
    const bob = deferredResponse();
    const requests = installHttp(path => {
      if (path === `${prefix}bob`) return Response.json(shell("bob"));
      if (path === `${prefix}bob/recommendations/apps`) return bob.promise;
      if (path === `${prefix}alice/recommendations/apps`) return Response.json(appListData("Alice apps"), { headers: { ETag: '"alice-only"' } });
      throw new Error(`Unexpected request: ${path}`);
    });
    await gateway.client!.category("alice", "apps");
    const view = renderPage("/bob/apps");
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(view.queryByText("Alice apps")).not.toBeInTheDocument();
    expect(new Headers(requests.at(-1)?.init?.headers).has("If-None-Match")).toBe(false);
    bob.resolve(Response.json(appListData("Bob apps")));
    expect(await screen.findByText("Bob apps")).toBeInTheDocument();
  });
});
