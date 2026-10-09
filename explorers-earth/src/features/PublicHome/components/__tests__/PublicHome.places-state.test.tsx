import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicLayout from "../../../../layouts/PublicLayout";
import { PublicColdEntryBoundary, usePublicColdEntry } from "../../../../layouts/PublicColdEntryBoundary";
import PublicHome from "../PublicHome";

const state = vi.hoisted(() => ({
  shell: {
    data: undefined as Record<string, unknown> | undefined,
    loading: false,
    error: null as Error | null,
    refetch: vi.fn().mockResolvedValue(undefined),
  },
  places: {
    data: undefined as Record<string, unknown> | undefined,
    loading: false,
    error: null as Error | null,
    refetch: vi.fn().mockResolvedValue(undefined),
  },
  mapsApiLoaded: false,
  modalRenders: [] as { kind: string; title: string | undefined; open: boolean }[],
}));

vi.mock("../../api/usePublicProfileShell", () => ({
  usePublicProfileShell: () => state.shell,
}));

vi.mock("../../api/usePublicRecommendationCategory", () => ({
  usePublicRecommendationCategory: () => state.places,
}));

vi.mock("../../../music/PublicMusicAvailabilityProvider", () => ({
  usePublicMusicAvailability: () => ({ state: "not-public", account: state.shell.data }),
  usePublicAccountIdentity: () => ({ usernameKey: "alice", status: "ready", account: state.shell.data }),
}));

vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => children,
  AdvancedMarker: ({ children }: { children?: React.ReactNode }) => children,
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="live-map-preview">{children}</div>,
  Pin: () => null,
  useApiIsLoaded: () => state.mapsApiLoaded,
  useMap: () => null,
}));

vi.mock("../../../../services/analyticsService", () => ({
  createAnalyticsOptions: { profile: vi.fn(() => ({})) },
  useTrackAnalytics: () => ({ trackClick: vi.fn(), trackEvent: vi.fn() }),
}));
vi.mock("../../../../hooks/useQRActions", () => ({
  useQRActions: () => ({ handleCopyLink: vi.fn() }),
}));
vi.mock("../../../../components/SEO", () => ({ default: () => null }));
vi.mock("../../../../components/ui/QRModal", () => ({ default: () => null }));
vi.mock("../../../../components/ShareModal", () => ({ default: () => null }));
vi.mock("../../../../components/CircularPlacesModal", () => ({ default: () => null }));
vi.mock("../PlaceDetails/PlaceOverview", () => ({ default: () => null }));
vi.mock("../../../Products/components/public/ProductDetailModal", () => ({
  default: ({ open, product, onClose }: { open: boolean; product: any; onClose: () => void }) => {
    state.modalRenders.push({ kind: "products", title: product?.title, open });
    return open ? <div role="dialog" aria-label="Product details">Product: {product?.title}<button onClick={onClose}>Close product</button></div> : null;
  },
}));
vi.mock("../../../People/components/public/PersonDetailModal", () => ({
  default: ({ open, person, onClose }: { open: boolean; person: any; onClose: () => void }) => {
    state.modalRenders.push({ kind: "people", title: person?.full_name, open });
    return open ? <div role="dialog" aria-label="Person details">Person: {person?.full_name}<button onClick={onClose}>Close person</button></div> : null;
  },
}));
vi.mock("../PublicPlaceCard", () => ({
  default: ({ title }: { title: string }) => <article data-testid="place-card">{title}</article>,
}));

vi.mock("../../api/usePublicProfileDetail", () => ({ usePublicProfileDetail: () => state.places }));

const account = {
  documentId: "account-1",
  username: "alice",
  Account_Name: "Alice",
  Primary_Address: { address: "Earth" },
  public_recommendations: "Yes",
  social_media: { theme_settings: { footerBranding: "enabled" } },
};

const place = (documentId: string, title: string) => ({
  documentId,
  Media: [],
  Place_Details: { Title: title, Place_Name: title, Photos: [], Geometry: { lat: 17.385, lng: 78.4867 } },
});

const list = (documentId: string, name: string, places: ReturnType<typeof place>[], is_pinned = false, pin_order: number | null = null) => ({
  documentId,
  List_Name: name,
  slug: name.toLowerCase(),
  Visibility: true,
  is_pinned,
  pin_order,
  recommended_places: places,
});

// The nested compatibility DTO emitted by publicLinkedPeople/ProductsLists.
const linkedCity = () => ({
  ...list("tokyo", "Tokyo", [place("tokyo-1", "Tokyo Tower")]),
  person_lists: [{ documentId: "people-list", List_Name: "Tokyo Creators", slug: "tokyo-creators", Visibility: true,
    display_order: 0, list_description: null, cover_image: null, recommended_people_next_cursor: null,
    recommended_people: [{ documentId: "person-1", title: "Aki", full_name: "Aki", headline: "Creator",
      social_urls: null, skills_tags: null, avatar_url: null, platform: null, primary_platform: null,
      profile_url: null, username_handle: null, location_text: null, follower_count: null,
      user_recommendation_note: "", user_rating: null, is_pinned: false, pin_order: null, display_order: 0,
      person_list: { documentId: "people-list", List_Name: "Tokyo Creators", slug: "tokyo-creators" }, person_category: null }] }],
  product_lists: [{ documentId: "products-list", List_Name: "Tokyo Gear", slug: "tokyo-gear", Visibility: true,
    display_order: 0, list_description: null, cover_image: null, recommended_products_next_cursor: null,
    recommended_products: [{ documentId: "product-1", title: "Travel Bag", product_url: null, brand: "Gear",
      price: null, currency: null, buy_url: null, logo_url: null, description: null, specifications: null,
      user_recommendation_note: "", user_rating: null, is_pinned: false, pin_order: null, display_order: 0,
      images: null, product_list: { documentId: "products-list", List_Name: "Tokyo Gear", slug: "tokyo-gear" }, product_category: null }] }],
});

function ValidatedPublicLayout() {
  const cold = usePublicColdEntry();
  useEffect(() => cold.reportValidation("valid"), [cold.reportValidation]);
  return <PublicLayout />;
}

function RouteControls() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate("/alice/places/hyderabad")}>Visit Hyderabad</button>
    <button onClick={() => navigate("/alice/places/tokyo")}>Visit Tokyo</button>
    <button onClick={() => navigate("/bob/places/tokyo")}>Visit Bob</button></>;
}

function placesTree(entry = "/alice/places") {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <RouteControls /><Routes>
        <Route path="/:username" element={<PublicColdEntryBoundary><ValidatedPublicLayout /></PublicColdEntryBoundary>}>
          <Route path="places" element={<PublicHome />} /><Route path="places/:placeSlug" element={<PublicHome />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

async function click(element: HTMLElement) {
  await act(async () => { fireEvent.click(element); });
}

function renderPlaces(entry = "/alice/places") {
  return render(placesTree(entry));
}

describe("PublicHome Places category states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    class TestIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    state.shell = { data: account, loading: false, error: null, refetch: vi.fn().mockResolvedValue(undefined) };
    state.places = { data: undefined, loading: false, error: null, refetch: vi.fn().mockResolvedValue(undefined) };
    state.mapsApiLoaded = false;
    state.modalRenders = [];
  });

  it("renders an eligible empty location alongside a populated location and navigates through See All", async () => {
    state.places.data = { recommendationLists: [list("tokyo", "Tokyo", [place("t-1", "Tokyo Tower")]), list("hyderabad", "Hyderabad", [])] };
    renderPlaces();
    const emptyHeading = await screen.findByRole("heading", { name: "Hyderabad" });
    expect(emptyHeading).toBeVisible();
    expect(screen.getByRole("heading", { name: "Tokyo" })).toBeVisible();
    expect(screen.getAllByTestId("place-card")).toHaveLength(1);
    expect(screen.queryByText("No Places Yet")).not.toBeInTheDocument();
    await click(within(emptyHeading.parentElement!.parentElement!).getByRole("button", { name: "See All ➔" }));
    expect(await screen.findByText("No Recommendation Available.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Hyderabad" })).toBeVisible();
    expect(screen.queryByTestId("place-card")).not.toBeInTheDocument();
    expect(screen.queryByText("No Places Yet")).not.toBeInTheDocument();
  });

  it("renders all 53 eligible projected location titles including the first populated and final empty location", async () => {
    state.places.data = { recommendationLists: Array.from({ length: 53 }, (_, index) =>
      list(`city-${index + 1}`, `City${String(index + 1).padStart(2, "0")}`, index === 0 ? [place("first-place", "First Place")] : [])) };
    renderPlaces();
    expect(await screen.findByRole("heading", { name: "City01" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "City53" })).toBeVisible();
    expect(screen.getAllByRole("heading", { name: /^City\d{2}$/ })).toHaveLength(53);
    for (let index = 1; index <= 53; index++) {
      expect(screen.getByRole("heading", { name: `City${String(index).padStart(2, "0")}` })).toBeVisible();
    }
    expect(screen.getAllByRole("button", { name: "See All ➔" })).toHaveLength(53);
    expect(screen.getAllByTestId("place-card")).toHaveLength(1);
  });

  it("renders a valid empty location detail with the existing recommendation empty view", async () => {
    state.places.data = { recommendationLists: [list("hyderabad", "Hyderabad", [])] };
    renderPlaces("/alice/places/hyderabad");
    expect(await screen.findByRole("heading", { name: "Hyderabad" })).toBeVisible();
    expect(screen.getByText("No Recommendation Available.")).toBeVisible();
    expect(screen.queryByText("No Places Yet")).not.toBeInTheDocument();
    expect(screen.queryByTestId("place-card")).not.toBeInTheDocument();
  });

  it("does not expose private or unavailable location rows alongside an eligible empty location", async () => {
    state.places.data = { recommendationLists: [list("hyderabad", "Hyderabad", []),
      { ...list("private", "Private City", [place("secret", "Private Place")]), Visibility: false },
      { ...list("invalid", "Unavailable City", []), recommended_places: null }] };
    renderPlaces();
    expect(await screen.findByRole("heading", { name: "Hyderabad" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Private City" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Unavailable City" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("place-card")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "See All ➔" })).toHaveLength(1);
  });

  it.each(["people", "products"])("invalidates the open %s modal when its child is withdrawn and does not resurrect it", async (kind) => {
    const city = linkedCity();
    state.places.data = { recommendationLists: [city] };
    const view = renderPlaces("/alice/places/tokyo");
    await click(await screen.findByRole("button", { name: kind === "people" ? /People\s*1/ : /Products\s*1/ }));
    await click(screen.getByText(kind === "people" ? "Aki" : "Travel Bag"));
    expect(screen.getByRole("dialog")).toBeVisible();
    state.modalRenders = [];
    state.places.data = { recommendationLists: [{ ...city,
      person_lists: [{ ...city.person_lists[0], Visibility: false }], product_lists: [],
    }] };
    await act(async () => { view.rerender(placesTree("/alice/places/tokyo")); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.modalRenders.some(render => render.open)).toBe(false);
    state.places.data = { recommendationLists: [city] };
    await act(async () => { view.rerender(placesTree("/alice/places/tokyo")); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["people", "products"])("closes the %s modal across populated location and handle transitions without reopening on return", async (kind) => {
    const city = linkedCity();
    state.places.data = { recommendationLists: [city, { ...city, documentId: "hyderabad", List_Name: "Hyderabad", slug: "hyderabad" }] };
    renderPlaces("/alice/places/tokyo");
    const openCard = async () => {
      await click(await screen.findByRole("button", { name: kind === "people" ? /People\s*1/ : /Products\s*1/ }));
      await click(screen.getByText(kind === "people" ? "Aki" : "Travel Bag"));
      expect(screen.getByRole("dialog")).toBeVisible();
    };
    await openCard();
    state.modalRenders = [];
    await click(screen.getByRole("button", { name: "Visit Hyderabad" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.modalRenders.some(render => render.open)).toBe(false);
    await click(screen.getByRole("button", { name: "Visit Tokyo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await openCard();
    state.modalRenders = [];
    state.shell.data = { ...account, documentId: "account-2", username: "bob", Account_Name: "Bob" };
    await click(screen.getByRole("button", { name: "Visit Bob" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.modalRenders.some(render => render.open)).toBe(false);
    state.shell.data = account;
    await click(screen.getByRole("button", { name: "Visit Tokyo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["people", "products"])("passes the current %s DTO to an open modal after same-scope replacement and preserves close", async (kind) => {
    const city = linkedCity();
    state.places.data = { recommendationLists: [city] };
    const view = renderPlaces("/alice/places/tokyo");
    await click(await screen.findByRole("button", { name: kind === "people" ? /People\s*1/ : /Products\s*1/ }));
    await click(screen.getByText(kind === "people" ? "Aki" : "Travel Bag"));
    state.modalRenders = [];
    state.places.data = { recommendationLists: [{ ...city,
      person_lists: [{ ...city.person_lists[0], recommended_people: [{ ...city.person_lists[0].recommended_people[0], title: "New Aki", full_name: "New Aki" }] }],
      product_lists: [{ ...city.product_lists[0], recommended_products: [{ ...city.product_lists[0].recommended_products[0], title: "New Bag" }] }],
    }] };
    await act(async () => { view.rerender(placesTree("/alice/places/tokyo")); });
    expect(screen.getByRole("dialog")).toHaveTextContent(kind === "people" ? "New Aki" : "New Bag");
    expect(state.modalRenders.filter(render => render.kind === kind && render.open).every(render => render.title === (kind === "people" ? "New Aki" : "New Bag"))).toBe(true);
    await click(screen.getByRole("button", { name: kind === "people" ? "Close person" : "Close product" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["people", "products"].flatMap(kind => ["parent", "hidden-parent", "parent-replaced", "category-error", "shell-error", "category-loading", "shell-loading", "shell-missing", "category-missing", "account-withdrawn"].map(boundary => ({ kind, boundary }))))(
    "clears $kind modal intent at $boundary boundary before restoration", async ({ kind, boundary }) => {
      const city = linkedCity();
      state.places.data = { recommendationLists: [city] };
      const view = renderPlaces("/alice/places/tokyo");
      await click(await screen.findByRole("button", { name: kind === "people" ? /People\s*1/ : /Products\s*1/ }));
      await click(screen.getByText(kind === "people" ? "Aki" : "Travel Bag"));
      expect(screen.getByRole("dialog")).toBeVisible();
      state.modalRenders = [];
      if (boundary === "parent") state.places.data = { recommendationLists: [] };
      if (boundary === "hidden-parent") state.places.data = { recommendationLists: [{ ...city, Visibility: false }] };
      if (boundary === "parent-replaced") state.places.data = { recommendationLists: [{ ...city, documentId: "replacement-parent" }] };
      if (boundary === "category-error") state.places.error = new Error("revalidation failed");
      if (boundary === "shell-error") state.shell.error = new Error("shell failed");
      if (boundary === "category-loading") state.places.loading = true;
      if (boundary === "shell-loading") state.shell.loading = true;
      if (boundary === "shell-missing") state.shell.data = undefined;
      if (boundary === "category-missing") state.places = { ...state.places, data: undefined, loading: true };
      if (boundary === "account-withdrawn") state.shell.data = { ...account, public_recommendations: "No" };
      await act(async () => { view.rerender(placesTree("/alice/places/tokyo")); });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(state.modalRenders.some(render => render.open)).toBe(false);
      state.places = { ...state.places, data: { recommendationLists: [city] }, loading: false, error: null };
      state.shell = { ...state.shell, data: account, loading: false, error: null };
      await act(async () => { view.rerender(placesTree("/alice/places/tokyo")); });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("renders canonical nested People and Products items for the selected location", async () => {
    state.places.data = { recommendationLists: [linkedCity()] };
    renderPlaces("/alice/places/tokyo");
    await click(await screen.findByRole("button", { name: /People\s*1/ }));
    expect(screen.getByText("Aki")).toBeVisible();
    expect(screen.getByText("List: Tokyo Creators")).toBeVisible();
    await click(screen.getByRole("button", { name: /Products\s*1/ }));
    expect(screen.getByText("Travel Bag")).toBeVisible();
    expect(screen.getByText("List: Tokyo Gear")).toBeVisible();
  });

  it("does not render another location's children during selected city navigation", async () => {
    state.places.data = { recommendationLists: [linkedCity(), list("hyderabad", "Hyderabad", [place("h-1", "Charminar")])] };
    renderPlaces("/alice/places/tokyo");
    await click(await screen.findByRole("button", { name: /People\s*1/ }));
    expect(screen.getByText("Aki")).toBeVisible();
    await click(screen.getByRole("button", { name: "Visit Hyderabad" }));
    expect(await screen.findByTestId("place-card")).toHaveTextContent("Charminar");
    expect(screen.queryByText("Aki")).not.toBeInTheDocument();
    expect(screen.queryByText("Travel Bag")).not.toBeInTheDocument();
    await click(screen.getByRole("button", { name: "People" }));
    expect(screen.getByText("No People linked to this location.")).toBeVisible();
  });

  it("renders valid linked siblings while discarding primitive recommendation entries", async () => {
    const city = linkedCity();
    state.places.data = { recommendationLists: [{ ...city,
      person_lists: [{ ...city.person_lists[0], recommended_people: [null, "invalid", 1, ...city.person_lists[0].recommended_people] }],
      product_lists: [{ ...city.product_lists[0], recommended_products: [false, "invalid", 1, ...city.product_lists[0].recommended_products] }],
    }] };
    renderPlaces("/alice/places/tokyo");
    await click(await screen.findByRole("button", { name: /People\s*1/ }));
    expect(screen.getByText("Aki")).toBeVisible();
    await click(screen.getByRole("button", { name: /Products\s*1/ }));
    expect(screen.getByText("Travel Bag")).toBeVisible();
  });

  it.each(["empty", "ineligible", "malformed", "malformed-people"])("removes linked items after a successful %s child revalidation", async (kind) => {
    const city = linkedCity();
    state.places.data = { recommendationLists: [city] };
    const view = renderPlaces("/alice/places/tokyo");
    await click(await screen.findByRole("button", { name: /People\s*1/ }));
    expect(screen.getByText("Aki")).toBeVisible();
    const updated = kind === "empty" ? { ...city, person_lists: [], product_lists: [] }
      : kind === "ineligible" ? { ...city, person_lists: [{ ...city.person_lists[0], Visibility: false }], product_lists: [{ ...city.product_lists[0], Visibility: false }] }
      : kind === "malformed" ? { ...city, person_lists: [{ ...city.person_lists[0], recommended_people: {} }], product_lists: "invalid" }
      : { ...city, person_lists: "invalid", product_lists: [{ ...city.product_lists[0], recommended_products: {} }] };
    state.places.data = { recommendationLists: [updated] };
    await act(async () => { view.rerender(placesTree("/alice/places/tokyo")); });
    expect(screen.queryByText("Aki")).not.toBeInTheDocument();
    expect(screen.getByText("No People linked to this location.")).toBeVisible();
    await click(screen.getByRole("button", { name: "Products" }));
    expect(screen.getByText("No Products linked to this location.")).toBeVisible();
    expect(screen.queryByText("Travel Bag")).not.toBeInTheDocument();
  });

  it("removes linked children when the selected public parent is withdrawn", async () => {
    state.places.data = { recommendationLists: [linkedCity()] };
    const view = renderPlaces("/alice/places/tokyo");
    await click(await screen.findByRole("button", { name: /Products\s*1/ }));
    expect(screen.getByText("Travel Bag")).toBeVisible();
    state.places.data = { recommendationLists: [] };
    await act(async () => { view.rerender(placesTree("/alice/places/tokyo")); });
    expect(screen.queryByText("Travel Bag")).not.toBeInTheDocument();
    expect(screen.queryByText("Aki")).not.toBeInTheDocument();
  });

  it("shows a Places skeleton rather than the final empty copy while a resolved shell waits for Places", async () => {
    state.places = { ...state.places, loading: true };

    renderPlaces();

    await waitFor(() => expect(screen.getByLabelText("Loading places")).toBeVisible());
    expect(screen.queryByText("No Places Yet")).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Public navigation" })).toBeVisible();
    expect(screen.getByRole("contentinfo")).toBeVisible();
  });

  it("renders two published lists containing four Places after a successful category response", async () => {
    state.places = {
      ...state.places,
      data: {
        recommendationLists: [
          list("tokyo", "Tokyo", [place("tokyo-1", "Senso-ji"), place("tokyo-2", "Shibuya Crossing")]),
          list("hyderabad", "Hyderabad", [place("hyderabad-1", "Charminar"), place("hyderabad-2", "Golconda Fort")]),
        ],
      },
    };

    renderPlaces();

    expect(await screen.findByRole("heading", { name: "Tokyo" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Hyderabad" })).toBeVisible();
    expect(screen.getAllByTestId("place-card")).toHaveLength(4);
  });

  it("renders the live map preview when the Maps provider is ready", async () => {
    state.mapsApiLoaded = true;
    state.places = {
      ...state.places,
      data: { recommendationLists: [list("tokyo", "Tokyo", [place("tokyo-1", "Tokyo Tower")])] },
    };

    renderPlaces();

    expect((await screen.findAllByTestId("live-map-preview")).length).toBeGreaterThan(0);
  });

  it("puts pinned published location lists after the map in the hero carousel by pin order", async () => {
    state.places = {
      ...state.places,
      data: {
        recommendationLists: [
          list("tokyo", "Tokyo", [place("tokyo-1", "Tokyo Tower")], true, 2),
          list("hyderabad", "Hyderabad", [place("hyderabad-1", "Charminar")], true, 1),
        ],
      },
    };

    renderPlaces();

    const hyderabadSlide = await screen.findByRole("button", { name: "Show Hyderabad" });
    await click(hyderabadSlide);
    expect(screen.getAllByRole("heading", { name: "Hyderabad" })).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Show Tokyo" })).toBeVisible();
  });

  it("shows the final empty state only after a successful normalized empty category response", async () => {
    state.places = { ...state.places, data: { recommendationLists: [] } };

    renderPlaces();

    expect(await screen.findByText("No Places Yet")).toBeVisible();
    expect(screen.queryByLabelText("Loading places")).not.toBeInTheDocument();
  });

  it("keeps a warm empty category cache in the loading state while it revalidates", async () => {
    state.places = { ...state.places, data: { recommendationLists: [] }, loading: true };

    renderPlaces();

    await waitFor(() => expect(screen.getByLabelText("Loading places")).toBeVisible());
    expect(screen.queryByText("No Places Yet")).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Public navigation" })).toBeVisible();
    expect(screen.getByRole("contentinfo")).toBeVisible();
  });

  it("shows an error recovery state and retries a rejected Places category response", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    state.places = { data: undefined, loading: false, error: new Error("gateway unavailable"), refetch: retry };

    renderPlaces();

    expect(await screen.findByRole("heading", { name: "Places unavailable" })).toBeVisible();
    expect(screen.queryByText("No Places Yet")).not.toBeInTheDocument();
    await click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Public navigation" })).toBeVisible();
    expect(screen.getByRole("contentinfo")).toBeVisible();
  });

  it("replaces a warm empty category cache with retryable error recovery after rejection", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    state.places = { data: { recommendationLists: [] }, loading: false, error: new Error("gateway unavailable"), refetch: retry };

    renderPlaces();

    expect(await screen.findByRole("heading", { name: "Places unavailable" })).toBeVisible();
    expect(screen.queryByText("No Places Yet")).not.toBeInTheDocument();
    await click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Public navigation" })).toBeVisible();
    expect(screen.getByRole("contentinfo")).toBeVisible();
  });
});
