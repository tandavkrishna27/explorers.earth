import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { englishI18n } from "../../../../test/englishI18n";
import { ExplorersApiError } from "../../../../lib/explorersApiClient";

const writes = vi.hoisted(() => ({ createList: vi.fn() }));
vi.mock("../../category/listWrites", () => writes);
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
// The Google autocomplete is replaced by a button that "picks" Goa.
vi.mock("../../../Profile/components/AddressInput", () => ({
  default: (p: { setPlaces?: (place: unknown) => void; placeHolder?: string; label?: string }) => (
    <>{p.label && <span>{p.label}</span>}<button type="button" onClick={() => p.setPlaces?.({ name: "Goa", place_id: "ChIJ_goa", formatted_address: "Goa, India",
      address_components: [{ long_name: "Goa", short_name: "GA", types: ["administrative_area_level_1"] }, { long_name: "Panaji", short_name: "Panaji", types: ["locality"] }],
      types: [], geometry: { location: { lat: () => 15.4909, lng: () => 73.8278 } } })}>{p.placeHolder}</button></>
  ),
}));
import NewListDialog from "../NewListDialog";

const wrap = (ui: React.ReactElement) => render(<I18nextProvider i18n={englishI18n}>{ui}</I18nextProvider>);
beforeEach(() => { vi.clearAllMocks(); writes.createList.mockResolvedValue({ id: "new-id" }); });

describe("NewListDialog", () => {
  it("uses a category-appropriate name placeholder and one Location label for places (UAT A)", () => {
    wrap(<NewListDialog open category="places" username="fixture" onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getAllByText("Location")).toHaveLength(1);
    expect(screen.getByLabelText("Name")).toHaveAttribute("placeholder", "e.g. Goa weekend");
  });

  it("creates with name, optional description and auto slug, then lands on the list", async () => {
    const onCreated = vi.fn();
    wrap(<NewListDialog open category="movies" username="fixture" onClose={() => {}} onCreated={onCreated} />);
    expect(screen.getByRole("dialog", { name: "New list" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/social|instagram|note/i)).toBeNull();
    await userEvent.type(screen.getByLabelText("Name"), "Comfort Movies!");
    expect(screen.getByLabelText("Web address")).toHaveValue("comfort-movies");
    await userEvent.click(screen.getByRole("button", { name: "Create list" }));
    expect(writes.createList).toHaveBeenCalledWith({ category: "movies", title: "Comfort Movies!", slug: "comfort-movies", description: null });
    expect(onCreated).toHaveBeenCalledWith("new-id");
    expect(toast.success).toHaveBeenCalledWith("List created");
  });
  it("keeps a hand-edited slug when the name changes", async () => {
    wrap(<NewListDialog open category="books" username="fixture" onClose={() => {}} onCreated={() => {}} />);
    await userEvent.type(screen.getByLabelText("Name"), "Reads");
    await userEvent.clear(screen.getByLabelText("Web address"));
    await userEvent.type(screen.getByLabelText("Web address"), "my-reads");
    await userEvent.type(screen.getByLabelText("Name"), " 2026");
    expect(screen.getByLabelText("Web address")).toHaveValue("my-reads");
  });
  it("shows the taken message on a 409 and stays open", async () => {
    writes.createList.mockRejectedValueOnce(new ExplorersApiError(409, "CONFLICT", "Content conflicts with an existing resource"));
    const onCreated = vi.fn();
    wrap(<NewListDialog open category="games" username="fixture" onClose={() => {}} onCreated={onCreated} />);
    await userEvent.type(screen.getByLabelText("Name"), "Co-op");
    await userEvent.click(screen.getByRole("button", { name: "Create list" }));
    expect(await screen.findByText("This web address is taken. Try another.")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
  it("requires a name", async () => {
    wrap(<NewListDialog open category="apps" username="fixture" onClose={() => {}} onCreated={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Create list" }));
    expect(screen.getByText("Give your list a name")).toBeInTheDocument();
    expect(writes.createList).not.toHaveBeenCalled();
  });
  it("Places: requires a location, prefills the name with the city and sends the snapshot", async () => {
    wrap(<NewListDialog open category="places" username="fixture" onClose={() => {}} onCreated={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Create list" }));
    expect(screen.getByText("Pick a location from the suggestions")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Search a city or area (e.g. Goa)" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Panaji");
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Goa food");
    await userEvent.click(screen.getByRole("button", { name: "Create list" }));
    expect(writes.createList).toHaveBeenCalledWith({ category: "places", title: "Goa food", slug: "goa-food", description: null,
      placeLocation: { locationEntityId: null, instagramMediaUrl: null,
        locationSnapshot: { version: 1, name: "Panaji", address: "Goa, India", providerPlaceId: "ChIJ_goa", latitude: 15.4909, longitude: 73.8278 } } });
  });
  it("Places: a second list for the same city is allowed (no duplicate check)", async () => {
    wrap(<NewListDialog open category="places" username="fixture" onClose={() => {}} onCreated={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Search a city or area (e.g. Goa)" }));
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Goa beaches");
    await userEvent.click(screen.getByRole("button", { name: "Create list" }));
    expect(writes.createList).toHaveBeenCalledTimes(1);
  });
  it("uses a caller-supplied create (Places cover import) when given", async () => {
    const create = vi.fn().mockResolvedValue({ id: "x" });
    wrap(<NewListDialog open category="places" username="fixture" onClose={() => {}} onCreated={() => {}} create={create} />);
    await userEvent.click(screen.getByRole("button", { name: "Search a city or area (e.g. Goa)" }));
    await userEvent.click(screen.getByRole("button", { name: "Create list" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ category: "places", title: "Panaji" }), expect.objectContaining({ place_id: "ChIJ_goa" }));
    expect(writes.createList).not.toHaveBeenCalled();
  });
});
