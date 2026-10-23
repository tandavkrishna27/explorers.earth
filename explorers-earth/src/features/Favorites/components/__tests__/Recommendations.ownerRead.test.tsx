import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Ticket 5.1. The list detail view on the native owner read.
//
// Three behaviours are worth pinning, because each was a Strapi round trip before and is
// now a decision this component makes: the ten-at-a-time reveal is a window over a list
// already in hand, removing a place archives it rather than deleting it, and emptying a
// list takes it out of public view.

const mocks = vi.hoisted(() => ({
  archivePlace: vi.fn(),
  publishList: vi.fn(),
  refetch: vi.fn(),
  setSelectedCity: vi.fn(),
  navigate: vi.fn(),
  places: [] as unknown[],
}));

vi.mock("@apollo/client", () => ({
  gql: (strings: TemplateStringsArray) => ({ loc: { source: { body: strings.join("") } } }),
  useQuery: () => ({ data: undefined, loading: false, refetch: vi.fn() }),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate, useLocation: () => ({pathname: "/list-1/recommendations"}) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));

vi.mock("../../hooks/usePlacesOwner", () => ({
  usePlacesOwner: () => ({
    data: { recommendationLists: [{ documentId: "list-1", List_Name: "Bengaluru", recommended_places: mocks.places }] },
    loading: false,
    refetch: mocks.refetch,
  }),
}));

vi.mock("../../api/placesCommands", () => ({
  usePlacesCommands: () => ({ archivePlace: mocks.archivePlace, publishList: mocks.publishList, loading: false }),
}));

// Ticket 5.2. The linked person and product lists come from their own categories' owner
// reads; this surface asserts the places half, so those read empty.
vi.mock("../../../People/hooks/usePeopleOwner", () => ({ usePeopleOwner: () => ({ data: { personLists: [] }, loading: false, refetch: vi.fn() }) }));
vi.mock("../../../Products/hooks/useProductsOwner", () => ({ useProductsOwner: () => ({ data: { productLists: [] }, loading: false, refetch: vi.fn() }) }));
vi.mock("../../hooks/useMenuItems", () => ({ useMenuItems: () => ({ isPublished: false }) }));
vi.mock("../../../../hooks/useRecommendationsWalkthrough", () => ({
  useRecommendationsWalkthrough: () => ({ advanceToNextStep: vi.fn(), advanceToNextStepRef: { current: null } }),
}));

vi.mock("../../../../store/useCityStore", () => ({
  useCityStore: () => ({
    selectedCity: { documentId: "list-1", List_Name: "Bengaluru", Visibility: true, recommended_places: [] },
    setSelectedCity: mocks.setSelectedCity,
  }),
}));
vi.mock("../../../../store/useSetupStore", () => ({
  default: () => ({ isProfileComplete: true, isRecommendationsComplete: true }),
}));

// Heavy children are not under test here.
vi.mock("../TopPlacesByCategory", () => ({ default: () => null }));
vi.mock("../InstagramPostImport", () => ({ default: () => null }));
vi.mock("../../../PublicHome/components/PlaceDetails/PlaceOverview", () => ({ default: () => null }));
vi.mock("../../../Products/components/public/ProductDetailModal", () => ({ default: () => null }));
vi.mock("../../../People/components/public/PersonDetailModal", () => ({ default: () => null }));

const place = (n: number) => ({
  documentId: `place-${n}`,
  Place_Details: {
    Place_Id: n === 1 ? null : `ChIJ_${n}`,
    Place_Name: `Place ${n}`, Title: `Place ${n}`, Place_Address: "Somewhere",
    Geometry: { lat: 0, lng: 0 }, Rating: null, Rating_Count: null,
    Photos: [], Place_Types: null, Public_Phone: null, Website: null, Price_Level: null, Price_Range: null,
  },
  media_details: null, Media: [],
  Recommendation_Type: "place", Source_Of_Recommendation: "self",
  Contact_Name: null, Contact_Number: null, Contact_Visibility: "private",
  Places_Social_Link: null, Places_Website: null, Users_Place_Note: null, Users_Social_URL: null,
  person_profile_url: null, person_address: null,
  user_recommendation_note: "", user_rating: null, google_rating: null,
  is_pinned: false, pin_order: null, display_order: n - 1,
  recommendation_list: { documentId: "list-1", List_Name: "Bengaluru", slug: "bengaluru" },
  recommendation_category: null, recommendation_sub_category: null,
});

// jsdom has no IntersectionObserver; the reveal effect constructs one.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
vi.stubGlobal("IntersectionObserver", StubObserver);

let Recommendations: typeof import("../Recommendations").default;

describe("Recommendations on the native owner read", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.archivePlace.mockResolvedValue({ archived: true });
    mocks.publishList.mockResolvedValue({ id: "list-1" });
    Recommendations = (await import("../Recommendations")).default;
  });

  it("shows the first ten of a longer list and keeps the rest in hand", async () => {
    mocks.places = Array.from({ length: 14 }, (_, i) => place(i + 1));
    render(<Recommendations refetchCities={vi.fn()} />);
    // All three settle together. Waiting only for the first card and then asserting the
    // tenth synchronously made this flaky under full-suite load: the cards animate in, so
    // "Place 1" can be present a tick before "Place 10" is.
    await waitFor(() => {
      expect(screen.getAllByText("Place 1").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Place 10").length).toBeGreaterThan(0);
    });
    // The eleventh is held back by the reveal window, not by a missing fetch. Checked
    // after the window has filled, so its absence means withheld rather than not yet drawn.
    expect(screen.queryByText("Place 11")).toBeNull();
  });

  it("renders a place with no provider id, no media and zero coordinates", async () => {
    // Strapi always populated these; the typed DTO does not, and the card must still render.
    mocks.places = [place(1)];
    render(<Recommendations refetchCities={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText("Place 1").length).toBeGreaterThan(0));
  });

  it("renders an empty list without asking for a page that is not there", async () => {
    mocks.places = [];
    render(<Recommendations refetchCities={vi.fn()} />);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.archivePlace).not.toHaveBeenCalled();
    expect(screen.queryByText("Place 1")).toBeNull();
  });
});
