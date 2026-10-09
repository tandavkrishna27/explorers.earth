import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
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
vi.mock("../../features/Favorites/hooks/usePlacesOwner", () => ({ usePlacesOwner: () => ({ data: { recommendationLists: h.lists }, content: { lists: new Map(h.native ? [["location-a", h.native]] : []) }, loading: false, refetch: h.refetch }) }));
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

import Favorites from "../Favorites";

async function openEdit() {
  render(<MemoryRouter initialEntries={["/recommendations/places"]}><Favorites /></MemoryRouter>);
  fireEvent.click(screen.getAllByText("Fixture Zero City")[0]);
  fireEvent.click(screen.getByRole("button", { name: "Manage" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit selected location" }));
  await waitFor(() => expect(document.querySelector('[name="placeUrl"]')).toHaveValue("fixture-zero-city"));
}
function change(name: string, value: string) {
  fireEvent.change(document.querySelector(`[name="${name}"]`)!, { target: { value } });
}

describe("Favorites retained location edits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.row = { documentId: "location-a", List_Name: "Fixture Zero City", slug: "fixture-zero-city", Visibility: true, recommended_places: [], List_Name_Details: { name: "Fixture Zero City", place_id: "provider-city", thumbnail: "/owned-cover.png", note: "old note", location: { address: "Stored address", latitude: 0, longitude: 0 } }, Instagram_Media_URL: "old social" };
    h.lists = [h.row, { documentId: "location-b", List_Name: "Other City", slug: "other-city", List_Name_Details: { place_id: "other-provider" }, recommended_places: [] }];
    h.selected = h.row;
    h.native = { kind: "collection", accountId: "owner-a", generation: 1, resourceId: "location-a", detail: { id: "location-a", accountId: "owner-a", category: "places", archived: false, placeLocation: { locationEntityId: null, locationSnapshot: { version: 1, name: "Fixture Zero City", address: "Stored address", providerPlaceId: "provider-city", latitude: 0, longitude: 0 }, instagramMediaUrl: "old social" } } };
    h.updateList.mockResolvedValue({});
    h.setLocation.mockResolvedValue({});
    h.providerGet.mockRejectedValue(new Error("unexpected provider fetch"));
    h.providerFetch.mockRejectedValue(new Error("unexpected provider media"));
    vi.stubGlobal("fetch", h.providerFetch);
    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each(["unchanged", "changed", "absent"])("saves %s slug/snapshot edits without provider traffic", async (mode) => {
    if (mode === "absent") {
      h.row.List_Name_Details.location = { address: "Stored address", latitude: null, longitude: null };
      h.native.detail.placeLocation.locationSnapshot.latitude = null;
      h.native.detail.placeLocation.locationSnapshot.longitude = null;
    }
    await openEdit();
    const slug = mode === "changed" ? "edited-fixture-city" : h.row.slug;
    if (mode === "changed") change("placeUrl", slug);
    change("note", "new note");
    change("recommendationSocialLink", "https://example.com/new-social");
    fireEvent.click(screen.getByRole("button", { name: "Update Location" }));
    await waitFor(() => expect(h.updateList).toHaveBeenCalledWith("location-a", { description: "new note" }));
    expect(h.providerGet).not.toHaveBeenCalled();
    expect(h.providerFetch).not.toHaveBeenCalled();
    expect(h.updateList).toHaveBeenCalledWith("location-a", { title: "Fixture Zero City", slug });
    expect(h.setLocation).toHaveBeenCalledWith("location-a", { locationEntityId: null, locationSnapshot: { version: 1, name: "Fixture Zero City", address: "Stored address", providerPlaceId: "provider-city", latitude: mode === "absent" ? null : 0, longitude: mode === "absent" ? null : 0 }, instagramMediaUrl: "https://example.com/new-social" });
    expect(h.selected.slug).toBe(slug);
    expect(h.selected.List_Name_Details.thumbnail).toBe("/owned-cover.png");
    expect(h.refetch).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Update Location" })).toBeNull());
  });

  it("refuses another list's slug before commands or provider requests", async () => {
    await openEdit();
    change("placeUrl", "other-city");
    fireEvent.click(screen.getByRole("button", { name: "Update Location" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("toast.error.conflictError"));
    expect(h.updateList).not.toHaveBeenCalled();
    expect(h.providerGet).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Update Location" })).toBeInTheDocument();
  });

  it("keeps the edit draft after a native command failure", async () => {
    h.updateList.mockRejectedValue(new Error("stale observation"));
    await openEdit();
    change("note", "retained draft");
    fireEvent.click(screen.getByRole("button", { name: "Update Location" }));
    await waitFor(() => expect(h.updateList).toHaveBeenCalled());
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("toast.error.recommendedListUpdateFailed"));
    expect(document.querySelector('[name="note"]')).toHaveValue("retained draft");
    expect(screen.getByRole("button", { name: "Update Location" })).toBeInTheDocument();
    expect(h.setLocation).not.toHaveBeenCalled();
  });

  it.each(["different-name", "null-name", "entity", "null-snapshot"])("preserves exact original native location for %s", async (mode) => {
    const original = h.native.detail.placeLocation;
    if (mode === "different-name") original.locationSnapshot.name = "Provider city name";
    if (mode === "null-name") original.locationSnapshot.name = null;
    if (mode === "entity") original.locationEntityId = "c151dffb-8abc-48c1-8dfb-fd688d79c702";
    if (mode === "null-snapshot") original.locationSnapshot = null;
    await openEdit();
    change("note", "native preserved");
    change("recommendationSocialLink", "https://example.com/changed");
    fireEvent.click(screen.getByRole("button", { name: "Update Location" }));
    await waitFor(() => expect(h.setLocation).toHaveBeenCalledWith("location-a", { ...original, instagramMediaUrl: "https://example.com/changed" }));
    expect(h.updateList).toHaveBeenCalledWith("location-a", { title: "Fixture Zero City", slug: "fixture-zero-city" });
    expect(h.updateList).toHaveBeenCalledWith("location-a", { description: "native preserved" });
    expect(h.updateList.mock.invocationCallOrder[0]).toBeLessThan(h.setLocation.mock.invocationCallOrder[0]);
    expect(h.setLocation.mock.invocationCallOrder[0]).toBeLessThan(h.updateList.mock.invocationCallOrder[1]);
    expect(h.providerGet).not.toHaveBeenCalled();
    expect(h.providerFetch).not.toHaveBeenCalled();
  });

  it.each(["missing", "foreign-owner", "old-generation", "missing-location"])("refuses %s original native details before any metadata write", async (mode) => {
    if (mode === "missing") h.native = null;
    if (mode === "foreign-owner") h.native.accountId = "owner-b";
    if (mode === "old-generation") h.native.generation = 0;
    if (mode === "missing-location") delete h.native.detail.placeLocation;
    await openEdit();
    change("note", "retained native draft");
    fireEvent.click(screen.getByRole("button", { name: "Update Location" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("toast.error.recommendedListUpdateFailed"));
    expect(h.updateList).not.toHaveBeenCalled();
    expect(h.setLocation).not.toHaveBeenCalled();
    expect(document.querySelector('[name="note"]')).toHaveValue("retained native draft");
    expect(screen.getByRole("button", { name: "Update Location" })).toBeInTheDocument();
  });
});
