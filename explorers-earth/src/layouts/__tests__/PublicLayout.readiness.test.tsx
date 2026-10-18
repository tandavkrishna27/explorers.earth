import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
  useOutletContext,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicProfileGatewayClient } from "../../features/PublicHome/api/publicProfileGatewayClient";
import PublicGuideDetailPage from "../../features/PublicHome/components/PublicGuideDetailPage";
import { PublicHeaderDescriptorProvider } from "../../features/PublicHome/components/PublicHeaderDescriptorContext";
import MapView from "../../features/PublicHome/components/MapView";
import PlaceMapView from "../../features/PublicHome/components/PlaceMapView";
import PublicLayout from "../PublicLayout";
import { PublicColdEntryBoundary, usePublicColdEntry } from "../PublicColdEntryBoundary";
import TabVisibilityGuard from "../../routes/validators/TabVisibilityGuard";

const gateway = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createPublicProfileGatewayClient> | undefined }));
vi.mock("../../features/PublicHome/api/publicProfileGatewayClient", async importOriginal => ({
  ...await importOriginal<typeof import("../../features/PublicHome/api/publicProfileGatewayClient")>(),
  publicProfileGatewayClient: new Proxy({}, { get: (_target, key) => gateway.client?.[key as keyof typeof gateway.client] }),
}));
const accountIdentity = vi.hoisted(() => ({
  usernameKey: "alice",
  status: "ready" as "ready" | "loading" | "terminal-error",
  account: { documentId: "account-1", username: "alice" },
}));


vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => children,
  AdvancedMarker: ({ children }: { children?: React.ReactNode }) => children,
  Map: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Pin: () => null,
  useApiIsLoaded: () => false,
  useMap: () => null,
}));

vi.mock("../../features/PublicHome/api/PublicAccountIdentityProvider", () => ({
  usePublicAccountIdentity: () => accountIdentity,
}));

vi.mock("../../features/PublicHome/components/PublicProfileThemeProvider", () => ({
  default: ({
    children,
    navigation,
  }: {
    children: React.ReactNode;
    navigation?: React.ReactNode;
  }) => (
    <>
      {children}
      {navigation}
    </>
  ),
}));

vi.mock("../../components/PublicNav", () => ({
  default: () => <nav>Public navigation</nav>,
}));

vi.mock("../../components/EarthLoader", () => ({
  EarthLoader: () => <div role="status">Earth loading</div>,
}));

vi.mock("../../components/ui/HeroSkeleton", () => ({
  default: () => <div>Destination skeleton</div>,
}));

type PublicOutlet = {
  isPageLoaded: boolean;
  isShellRevealed: boolean;
  setIsPageLoaded(loaded: boolean): void;
};

let settleOldRoute: ((loaded: boolean) => void) | undefined;

function RouteA() {
  const outlet = useOutletContext<PublicOutlet>();
  const navigate = useNavigate();
  useEffect(() => {
    settleOldRoute = outlet.setIsPageLoaded;
  }, [outlet.setIsPageLoaded]);
  return (
    <>
      <button onClick={() => outlet.setIsPageLoaded(true)}>Settle A</button>
      <button onClick={() => navigate("../b")}>Open B</button>
      <button onClick={() => navigate("../places/map")}>Open map</button>
      <button onClick={() => navigate("../broken")}>Open broken route</button>
    </>
  );
}

function RouteB() {
  return <div>Route B content</div>;
}

function BrokenRoute() {
  throw new Error("broken route render");
}

function ValidatedLayout() {
  const cold = usePublicColdEntry();
  useEffect(() => cold.reportValidation("valid"), [cold.reportValidation]);
  return <PublicLayout />;
}

function renderLayout(initialEntry: string, children: React.ReactNode) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <PublicHeaderDescriptorProvider username="alice" profileName="Alice">
          <Routes>
            <Route path=":username" element={<PublicColdEntryBoundary><ValidatedLayout /></PublicColdEntryBoundary>}>
                {children}
            </Route>
          </Routes>
        </PublicHeaderDescriptorProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("PublicLayout route readiness", () => {
  beforeEach(() => {
    settleOldRoute = undefined;
    accountIdentity.status = "ready";
    gateway.client = createPublicProfileGatewayClient("https://gateway.test", async () => Response.json({}, { status: 503 }));
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("keeps the revealed shell mounted while route B loads and ignores route A's stale completion", async () => {
    renderLayout("/alice/a", (
      <>
        <Route path="a" element={<RouteA />} />
        <Route path="b" element={<RouteB />} />
      </>
    ));

    expect(screen.getByRole("status")).toHaveTextContent("Earth loading");
    fireEvent.click(screen.getByText("Settle A", { selector: "button" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getByRole("navigation")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open B" }));
    await screen.findByText("Route B content");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();

    act(() => settleOldRoute?.(true));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("dismisses the route overlay when a terminal map-unavailable state is usable", async () => {
    gateway.client = createPublicProfileGatewayClient("https://gateway.test", async input => {
      expect(new URL(String(input)).pathname).toBe("/api/explorers/v1/profiles/alice/recommendations/places");
      return Response.json({
          recommendationLists: [{
            documentId: "list-1",
            slug: "paris",
            // The pinned-reader fence publicPlacesProjection emits on every list
            // (tunes/server/publicProfile/publicPlacesProjection.ts:154), shaped by
            // publicPlacePinsReadSchema. completePlacesPreviews refuses a list without it.
            collection_revision: "1",
            category_content_revision: "0",
            eligibility_fingerprint: "a".repeat(64),
            eligible_item_count: 1,
            eligible_pin_count: 0,
            recommended_places_next_cursor: null,
            recommended_places: [{
              documentId: "place-1",
              Place_Details: { Geometry: { lat: 17.385, lng: 78.4867 } },
              Media: [],
              recommendation_category: { Category_Name: "Cafe" },
            }],
          }],
      });
    });

    renderLayout(
      "/alice/places/paris/placesmap",
      <>
        <Route path="places/:place/placesmap" element={<PlaceMapView />} />
        <Route path="places/:place" element={<div>Places list</div>} />
      </>,
    );

    expect(await screen.findByRole("heading", { name: "Map Unavailable" })).toBeInTheDocument();
    expect(screen.getByText("Your saved places are still available in the list while the map service reconnects.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Back to Places" }));
    expect(await screen.findByText("Places list")).toBeInTheDocument();
  });

  it("dismisses the route overlay when the all-regions map reaches a terminal error", async () => {
    gateway.client = createPublicProfileGatewayClient("https://gateway.test", async input => {
      expect(new URL(String(input)).pathname).toBe("/api/explorers/v1/profiles/alice/recommendations/places");
      return Response.json({}, { status: 503 });
    });

    renderLayout(
      "/alice/places/map",
      <Route path="places/map" element={<MapView />} />,
    );

    expect(await screen.findByRole("heading", { name: "Failed to Load Map" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("dismisses the route overlay when guide detail reaches a terminal error", async () => {
    gateway.client = createPublicProfileGatewayClient("https://gateway.test", async input => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/explorers/v1/profiles/alice") return Response.json({ documentId: "account-1" });
      expect(path).toBe("/api/explorers/v1/profiles/alice/recommendations/guides/weekend");
      return Response.json({}, { status: 503 });
    });

    renderLayout(
      "/alice/guides/weekend",
      <Route path="guides/:guideSlug" element={<PublicGuideDetailPage />} />,
    );

    expect(await screen.findByRole("heading", { name: "Guide unavailable" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("shows a destination skeleton inside an already revealed shell while visibility revalidates", async () => {
    renderLayout("/alice/a", <>
      <Route path="a" element={<RouteA />} />
      <Route path="b" element={<TabVisibilityGuard tabField="public_books"><RouteB /></TabVisibilityGuard>} />
    </>);

    fireEvent.click(screen.getByText("Settle A", { selector: "button" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    accountIdentity.status = "loading";
    fireEvent.click(screen.getByRole("button", { name: "Open B" }));

    expect(screen.getByText("Destination skeleton")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps Earth absent while applying the intentional map navigation exception", async () => {
    renderLayout("/alice/a", <>
      <Route path="a" element={<RouteA />} />
      <Route path="places/map" element={<div>Map route content</div>} />
    </>);
    fireEvent.click(screen.getByText("Settle A", { selector: "button" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Open map" }));

    expect(screen.getByText("Map route content")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps persistent navigation around a warm fatal route fallback", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderLayout("/alice/a", <>
      <Route path="a" element={<RouteA />} />
      <Route path="broken" element={<BrokenRoute />} />
    </>);
    fireEvent.click(screen.getByText("Settle A", { selector: "button" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Open broken route" }));

    expect(screen.getByRole("heading", { name: "This section could not be displayed" })).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    errors.mockRestore();
  });

  it("settles a cold fatal route before removing Earth and rendering the shell fallback", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const frames: FrameRequestCallback[] = [];
    const frameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    renderLayout("/alice/broken", <Route path="broken" element={<BrokenRoute />} />);

    const heading = screen.getByText("This section could not be displayed", { selector: "h1" });
    expect(screen.getByTestId("public-cold-entry-shell")).toHaveAttribute("inert");
    // The route schedules focus and the cold boundary schedules reveal. Advance
    // the reveal callback first so focus is tested only on an interactive shell.
    expect(frames).toHaveLength(2);
    act(() => frames.pop()?.(performance.now()));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    const shell = screen.getByTestId("public-cold-entry-shell");
    expect(shell).not.toHaveAttribute("inert");
    expect(shell).not.toHaveAttribute("aria-hidden");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(document.activeElement).not.toBe(heading);
    expect(screen.getAllByRole("heading", { name: "This section could not be displayed" })).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelectorAll('[aria-live="assertive"]')).toHaveLength(0);
    expect(frames).toHaveLength(1);

    act(() => frames.shift()?.(performance.now()));
    expect(document.activeElement).toBe(heading);
    frameSpy.mockRestore();
    errors.mockRestore();
  });
});
