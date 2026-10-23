import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loading: false,
  row: {} as any, lists: [] as any[], selected: {} as any, native: {} as any,
  updateList: vi.fn(), setLocation: vi.fn(), refetch: vi.fn(), selectedChanged: vi.fn(),
  providerGet: vi.fn(), providerFetch: vi.fn(), error: vi.fn(),
  navigation: { snapshot: { visibility: { public_recommendations: "Yes" } }, authority: {}, busy: false, request: vi.fn() },
}));
vi.mock("axios", () => ({ default: { get: h.providerGet } }));
vi.mock("sonner", () => ({ toast: { error: h.error, success: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../store/store", () => ({ default: (selector?: any) => {
  const state = { accountId: "owner-a", generation: 1, user: { username: "owner" } };
  return selector ? selector(state) : state;
} }));
vi.mock("../../store/useCityStore", async () => {
  const React = await import("react");
  return { useCityStore: () => {
    const [selectedCity, set] = React.useState(h.row);
    return { selectedCity, setSelectedCity: (row: any) => { h.selected = row; h.selectedChanged(row); set(row); } };
  } };
});
vi.mock("../../store/useSetupStore", () => ({ default: () => ({ isProfileComplete: true, isRecommendationsComplete: true, setSetupStatus: vi.fn() }) }));
vi.mock("../../features/Profile/api/useCanonicalAccount", () => ({ useCanonicalAccount: () => ({ data: { id: "owner-a", onboardingStatus: "complete" } }) }));
vi.mock("../../features/navigation/CategoryNavigationProvider", () => ({ useCategoryNavigation: () => h.navigation }));
vi.mock("../../features/navigation/NavigationStatus", () => ({ NavigationStatus: () => null }));
vi.mock("../../features/Favorites/hooks/usePlacesOwner", () => ({ usePlacesOwner: () => ({ data: h.lists ? { recommendationLists: h.lists } : undefined, content: { lists: new Map() }, loading: h.loading, refetch: h.refetch }) }));
vi.mock("../../features/Favorites/api/placesCommands", () => ({ usePlacesCommands: () => ({ updateList: h.updateList, setLocation: h.setLocation }) }));
vi.mock("../../features/Favorites/hooks/useMenuItems", () => ({ useMenuItems: () => ({ handleDeleteRecommendedList: vi.fn() }) }));
vi.mock("../../hooks/useRecommendationsWalkthrough", () => ({ useRecommendationsWalkthrough: () => ({ run: false, steps: [], stepIndex: 0, setRun: vi.fn(), setStepIndex: vi.fn(), handleJoyrideCallback: vi.fn(), advanceToNextStep: vi.fn(), markProcessingComplete: vi.fn(), isWalkthroughComplete: true }) }));
vi.mock("../../features/Favorites/components/Recommendations", () => ({ default: () => null }));
// Presentation seam activates the real Favorites edit state and its real modal/handler.
vi.mock("../../features/Favorites/components/LinksAndQR", () => ({ default: (props: any) => <button onClick={() => { props.setIsEditing(true); props.setIsLocationModalOpen(true); }}>Edit selected location</button> }));
vi.mock("../../features/Profile/components/AddressInput", () => ({ default: (props: any) => <input aria-label="Location" disabled={props.disabled} value={props.initalValue} readOnly /> }));
vi.mock("../../components/SEO", () => ({ default: () => null }));
vi.mock("react-joyride", () => ({ default: () => null }));
vi.mock("../../components/CircularPlacesModal", () => ({ default: () => null }));
vi.mock("../../components/CategoryVisibilityModal", () => ({ CategoryVisibilityModal: () => null }));
vi.mock("../../components/ListVisibilityModal", () => ({ ListVisibilityModal: () => null }));
vi.mock("../../components/EarthLoader", () => ({ EarthLoader: () => <div data-testid="earth-loader" /> }));

import Favorites from "../Favorites";

function Probe() { const l = useLocation(); return <output data-testid="url">{l.pathname + l.search}</output>; }
function renderAt(url: string) {
  return render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/recommendations/places" element={<><Favorites /><Probe /></>} /></Routes></MemoryRouter>);
}
const listA = { documentId: "location-a", List_Name: "Alpha City", slug: "alpha", Visibility: true, recommended_places: [], List_Name_Details: {} };
const listB = { documentId: "location-b", List_Name: "Beta City", slug: "beta", Visibility: false, recommended_places: [], List_Name_Details: {} };

describe("Favorites open list in the URL (OWN-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.lists = [listA, listB]; h.loading = false; h.row = undefined as any; h.selected = undefined as any;
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("opens the list named by ?list= even when the store holds another", async () => {
    h.row = listA;
    renderAt("/recommendations/places?list=location-b");
    await waitFor(() => expect(h.selected?.documentId).toBe("location-b"));
    expect(screen.getByTestId("url").textContent).toBe("/recommendations/places?list=location-b");
  });

  it("falls back to the first list only when ?list= is absent, and writes it to the URL", async () => {
    renderAt("/recommendations/places");
    await waitFor(() => expect(h.selected?.documentId).toBe("location-a"));
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/recommendations/places?list=location-a"));
  });

  it("ignores an unknown ?list= and keeps a valid selection", async () => {
    renderAt("/recommendations/places?list=gone");
    await waitFor(() => expect(h.selected?.documentId).toBe("location-a"));
  });

  it("follows a selection change into the URL", async () => {
    renderAt("/recommendations/places?list=location-a");
    await waitFor(() => expect(h.selected?.documentId).toBe("location-a"));
    fireEvent.click(screen.getAllByText("Beta City")[0]);
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/recommendations/places?list=location-b"));
    expect(h.selected?.documentId).toBe("location-b");
  });
});

describe("Favorites tab switch (OWN-06)", () => {
  beforeEach(() => { vi.clearAllMocks(); h.lists = [listA, listB]; h.row = listA; h.loading = false; Element.prototype.scrollIntoView = vi.fn(); });

  it("keeps the page during a background refresh", async () => {
    h.loading = true;
    renderAt("/recommendations/places?list=location-a");
    expect(screen.queryByTestId("earth-loader")).toBeNull();
    expect(screen.getAllByText("Alpha City").length).toBeGreaterThan(0);
  });

  it("shows the loader only on a cold load", () => {
    h.loading = true; h.lists = undefined as any;
    renderAt("/recommendations/places");
    expect(screen.getByTestId("earth-loader")).toBeInTheDocument();
  });

  it("switching to Manage does not refetch", async () => {
    renderAt("/recommendations/places?list=location-a");
    fireEvent.click(screen.getAllByText("Alpha City")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(h.refetch).not.toHaveBeenCalled();
  });
});
