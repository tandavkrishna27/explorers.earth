import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d?: string, o?: Record<string, unknown>) => (d ?? _k).replace(/{{(\w+)}}/g, (_m, k) => String(o?.[k] ?? "")) }) }));
vi.mock("../../../../components/GoogleMapsProvider", () => ({ withGoogleMapsProvider: (component: unknown) => component }));
vi.mock("@vis.gl/react-google-maps", () => ({ Map: () => null, AdvancedMarker: () => null, useMapsLibrary: () => null }));
vi.mock("../TiptapEditor", () => ({ default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <textarea aria-label="Note" value={value} onChange={(e) => onChange(e.target.value)} /> }));

const handleSubmit = vi.fn().mockResolvedValue(undefined);
const handleUpdatePlaceDetails = vi.fn().mockResolvedValue(undefined);
const hookOptions: Array<Record<string, unknown>> = [];
vi.mock("../../hooks/useAddRecommendation", () => ({
  PLACE_PHOTO_LIMIT: 10,
  useAddRecommendation: (options: Record<string, unknown>) => {
    hookOptions.push(options);
    return {
      handleSubmit, handleUpdatePlaceDetails, handleFileChange: vi.fn(), handleUploadMedia: vi.fn(), handleDeleteUserImage: vi.fn(),
      reorderUserMedia: vi.fn(), savedPhotoIds: [], setSavedPhotoIds: vi.fn(), mediaStatus: null, mediaFeedback: null,
      retryMediaUpload: vi.fn(), continueWithoutImage: vi.fn(), editConflict: false, clearEditConflict: vi.fn(), retireDraftIntent: vi.fn(),
    };
  },
}));
let ownerData: unknown;
vi.mock("../../hooks/usePlacesOwner", () => ({ usePlacesOwner: () => ownerData }));
vi.mock("../../api/placesClient", () => ({
  PlacesClient: {
    readTaxonomyCatalog: vi.fn().mockResolvedValue({ state: "CONFIGURED", items: [
      { id: "c1", parentId: null, position: 0, label: "Food" },
      { id: "s1", parentId: "c1", position: 0, label: "Cafe" },
    ] }),
  },
}));
const select = vi.fn();
const search = vi.fn().mockResolvedValue([]);
vi.mock("../../api/placeNameSearch", () => ({ usePlaceNameSearch: () => ({ search, select }) }));

import AddPlacePage from "../AddPlacePage";

let nearbyBody: unknown;
const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => nearbyBody }));

const mount = (path = "/recommendations/places/list-1/add", type?: "edit") => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/recommendations/places/:listId/add" element={<AddPlacePage />} />
      <Route path="/recommendations/places/:listId/edit/:placeId" element={<AddPlacePage type={type} />} />
    </Routes>
  </MemoryRouter>,
);
const searchBox = () => screen.getByPlaceholderText("Search a place or paste coordinates");

describe("AddPlacePage", () => {
  beforeEach(() => {
    handleSubmit.mockClear(); handleUpdatePlaceDetails.mockClear(); select.mockReset(); hookOptions.length = 0;
    ownerData = { data: undefined, content: undefined, loading: false };
    nearbyBody = { source: "google", places: [] };
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("never offers a Person type", async () => {
    mount();
    expect(screen.queryByText(/Person/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Can't find it? Add manually" }));
    expect(screen.queryByText(/Person/)).toBeNull();
  });

  it("coordinates -> use the pin -> manual form with lat/lng filled -> save", async () => {
    mount();
    fireEvent.change(searchBox(), { target: { value: "15.49, 73.82" } });
    fireEvent.click(await screen.findByRole("button", { name: "Use the pin as a custom place" }));
    expect(screen.getByLabelText("Latitude")).toHaveValue("15.49");
    expect(screen.getByLabelText("Longitude")).toHaveValue("73.82");
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "Secret beach" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: "Secret beach", geoCoords: JSON.stringify({ lat: 15.49, lng: 73.82 }) })));
    expect(handleSubmit.mock.calls[0][0]).not.toHaveProperty("placesTaxonomy");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/explorers/v1/places/nearby?lat=15.49&lng=73.82"), expect.anything());
  });

  it("chooses category then subcategory with the shared combobox", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Can't find it? Add manually" }));
    const category = screen.getByRole("combobox", { name: "Category" });
    await waitFor(() => { fireEvent.focus(category); expect(screen.getByRole("option", { name: "Food" })).toBeInTheDocument(); });
    fireEvent.mouseDown(screen.getByRole("option", { name: "Food" }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Subcategory" }));
    fireEvent.mouseDown(await screen.findByRole("option", { name: "Cafe" }));
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "Cafe X" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: "Cafe X", placesTaxonomy: { categoryTermId: "c1", subcategoryTermId: "s1" } })));
  });

  it("a picked nearby place shows a confirmed card with Change", async () => {
    nearbyBody = { source: "google", places: [{ id: "p1", title: "Fontainhas", subtitle: "Panaji", lat: 15.49, lng: 73.83 }] };
    select.mockResolvedValue({ place_id: "p1", name: "Fontainhas", formatted_address: "Panaji, Goa", types: [], address_components: [], geometry: { location: { lat: () => 15.49, lng: () => 73.83 } } });
    mount();
    fireEvent.change(searchBox(), { target: { value: "15.49, 73.83" } });
    fireEvent.click(await screen.findByRole("option", { name: /Fontainhas/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Fontainhas");
    await waitFor(() => expect(screen.getByLabelText("Address")).toHaveValue("Panaji, Goa"));
    expect(select).toHaveBeenCalledWith("p1");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(searchBox()).toBeInTheDocument();
  });

  it("an OpenStreetMap row is never sent to Google and becomes a pin with its name", async () => {
    nearbyBody = { source: "osm", places: [{ id: "osm:node/1", title: "Hidden cove", subtitle: null, lat: 15.5, lng: 73.8 }] };
    mount();
    fireEvent.change(searchBox(), { target: { value: "15.5, 73.8" } });
    const row = await screen.findByRole("option", { name: /Hidden cove/ });
    expect(screen.getByText("Showing OpenStreetMap results.")).toBeInTheDocument();
    fireEvent.click(row);
    expect(select).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Place name")).toHaveValue("Hidden cove");
    expect(screen.getByLabelText("Latitude")).toHaveValue("15.5");
  });

  it("Save and add another stays on the add page; Save returns to the list", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Can't find it? Add manually" }));
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "One" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and add another" }));
    await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));
    const ref = hookOptions.at(-1)!.afterCreatePathRef as { current: string | null };
    expect(ref.current).toBe("/recommendations/places/list-1/add");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(2));
    expect(ref.current).toBe("/recommendations/places/list-1");
  });

  it("edit mode is prefilled and saves through the update path", async () => {
    const place = {
      documentId: "r1", Recommendation_Type: "place", user_rating: 8, user_recommendation_note: "<p>Great</p>", Users_Social_URL: null,
      Places_Website: null, Places_Social_Link: null, Contact_Name: "Asha", Contact_Number: null, Contact_Visibility: "public",
      Place_Details: { Title: "Old fort", Place_Address: "Hill road", Place_Id: null, Geometry: { lat: 1, lng: 2 } },
      placesTaxonomy: { category: { id: "c1", label: "Food" }, subcategory: null }, recommendation_list: { documentId: "list-1" },
    };
    ownerData = { data: { recommendationLists: [{ recommended_places: [place] }] }, content: { details: new Map([["r1", { detail: {} }]]) }, loading: false };
    mount("/recommendations/places/list-1/edit/r1", "edit");
    expect(await screen.findByLabelText("Place name")).toHaveValue("Old fort");
    expect(screen.queryByRole("button", { name: "Save and add another" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "New fort" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(handleUpdatePlaceDetails).toHaveBeenCalledWith(expect.objectContaining({
      title: "New fort", address: "Hill road", geoCoords: JSON.stringify({ lat: 1, lng: 2 }), contactName: "Asha", contactVisibility: "public", userRating: 8,
    })));
    expect(handleUpdatePlaceDetails.mock.calls[0][0]).not.toHaveProperty("placesTaxonomy");
  });
});
