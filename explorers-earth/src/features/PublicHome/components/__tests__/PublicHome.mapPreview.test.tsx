import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicHome from "../PublicHome";
import { PublicHeaderDescriptorProvider } from "../PublicHeaderDescriptorContext";
import { PublicProfileFixedHeader } from "../PublicProfileChromePrimitives";

const queryState = vi.hoisted(() => ({
  account: {} as Record<string, unknown>,
  mapLists: [] as Array<Record<string, unknown>>,
  partialAccountError: false,
}));
const analytics = vi.hoisted(() => ({ trackClick: vi.fn(), trackEvent: vi.fn() }));

vi.mock("@apollo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@apollo/client")>()),
  useQuery: (document: any, options?: { errorPolicy?: string }) => {
    const operation = document.definitions.find(
      (definition: any) => definition.kind === "OperationDefinition",
    )?.name?.value;
    if (operation === "user") {
      const keepPartialData = !queryState.partialAccountError || options?.errorPolicy === "all";
      return {
        loading: false,
        data: keepPartialData ? { accounts: [queryState.account] } : undefined,
        error: queryState.partialAccountError ? new Error("Forbidden optional relation") : undefined,
      };
    }
    if (operation === "RecommendedPlaces") {
      return { loading: false, data: { recommendedPlaces: [] }, fetchMore: vi.fn() };
    }
    if (operation === "Account") {
      return {
        loading: false,
        data: { accounts: [{ recommendation_lists: queryState.mapLists }] },
      };
    }
    return { loading: false, data: undefined, fetchMore: vi.fn() };
  },
}));

vi.mock("../../api/usePublicProfileShell", () => ({
  usePublicProfileShell: () => ({
    data: queryState.account,
    loading: false,
    error: queryState.partialAccountError ? new Error("Forbidden optional relation") : null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../../api/usePublicRecommendationCategory", () => ({
  usePublicRecommendationCategory: () => ({
    data: {
      recommendationLists: Array.isArray(queryState.account.recommendation_lists)
        ? queryState.account.recommendation_lists
        : [],
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => children,
  AdvancedMarker: ({ children }: { children?: React.ReactNode }) => children,
  Map: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Pin: () => null,
  useApiIsLoaded: () => false,
  useMap: () => null,
}));

vi.mock("../../../../services/analyticsService", () => ({
  useTrackAnalytics: () => analytics,
}));
vi.mock("../../../../hooks/useQRActions", () => ({
  useQRActions: () => ({ handleCopyLink: vi.fn() }),
}));
vi.mock("../../../../components/SEO", () => ({ default: () => null }));
vi.mock("../../../../components/ui/QRModal", () => ({ default: () => null }));
vi.mock("../../../../components/ShareModal", () => ({ default: () => null }));
vi.mock("../../../../components/CircularPlacesModal", () => ({ default: () => null }));
vi.mock("../PlaceDetails/PlaceOverview", () => ({ default: () => null }));
vi.mock("../../../Products/components/public/ProductDetailModal", () => ({ default: () => null }));
vi.mock("../../../People/components/public/PersonDetailModal", () => ({ default: () => null }));
vi.mock("../PublicPlaceCard", () => ({ default: () => null }));

const savedPlace = {
  documentId: "place-1",
  Place_Details: {
    Title: "Fixture Cafe",
    Place_Name: "Fixture Cafe",
    Geometry: { lat: 17.385, lng: 78.4867 },
  },
  Media: [],
  recommendation_category: { Category_Name: "Cafe" },
};

function renderPublicHome(path = "/alice/places") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PublicHeaderDescriptorProvider origin={window.location.origin} username="alice" profileName="Alice">
        <PublicProfileFixedHeader onTrackClick={analytics.trackClick} />
        <Routes>
          <Route path=":username" element={<Outlet context={{ setIsPageLoaded: vi.fn() }} />}>
            <Route path="places" element={<PublicHome />} />
            <Route path="places/:placeSlug" element={<PublicHome />} />
          </Route>
        </Routes>
      </PublicHeaderDescriptorProvider>
    </MemoryRouter>,
  );
}

describe("PublicHome map preview fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    class TestIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    queryState.account = {
      documentId: "account-1",
      Account_Name: "Alice",
      Primary_Address: { address: "Hyderabad" },
      recommendation_lists: [{
        documentId: "list-1",
        List_Name: "Hyderabad",
        slug: "hyderabad",
        Visibility: true,
        is_pinned: false,
        recommended_places: [savedPlace],
        person_lists: [],
        product_lists: [],
      }],
    };
    queryState.mapLists = [{ List_Name: "Hyderabad", recommended_places: [savedPlace] }];
    queryState.partialAccountError = false;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("keeps usable public account data when an optional nested relation is forbidden", () => {
    queryState.partialAccountError = true;
    queryState.account = {
      ...queryState.account,
      recommendation_lists: [{
        ...((queryState.account.recommendation_lists as Array<Record<string, unknown>>)[0]),
        person_lists: [null],
      }, null],
    };

    renderPublicHome();

    expect(screen.queryByText("Profile not found")).not.toBeInTheDocument();
    expect(screen.getAllByText("1 saved place").length).toBeGreaterThan(0);
  });

  it("describes saved places when the live preview is unavailable", () => {
    renderPublicHome();

    expect(screen.queryByText("No locations available")).not.toBeInTheDocument();
    expect(screen.getAllByText("1 saved place").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Open map").length).toBeGreaterThan(0);
  });

  it("uses empty copy only when no saved place coordinates exist", () => {
    queryState.account = {
      ...queryState.account,
      recommendation_lists: [{
        documentId: "list-1",
        List_Name: "Hyderabad",
        Visibility: true,
        is_pinned: false,
        recommended_places: [],
        person_lists: [],
        product_lists: [],
      }],
    };
    queryState.mapLists = [];

    renderPublicHome();

    expect(screen.getAllByText("No saved locations yet").length).toBeGreaterThan(0);
    expect(screen.queryByText("1 saved place")).not.toBeInTheDocument();
  });

  it("shares the selected city's canonical route through the one shared header", async () => {
    renderPublicHome("/alice/places?utm_source=review&access=private");

    expect(screen.getAllByRole("button", { name: "Share" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(navigator.share).toHaveBeenCalledWith({
      title: "Alice's Places",
      text: "Check out these recommendations!",
      url: `${window.location.origin}/alice/places/hyderabad?utm_source=review`,
    }));
    expect(analytics.trackClick).toHaveBeenCalledTimes(1);
    expect(analytics.trackClick).toHaveBeenCalledWith("share-button", {
      context: "places-header",
      city: "Hyderabad",
    });
  });
});
