import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

const fx = vi.hoisted(() => ({
  lists: [] as unknown[],
  refetch: vi.fn(),
  location: { locationEntityId: null, locationSnapshot: null, instagramMediaUrl: null } as unknown,
  commands: { setLocation: vi.fn(), publishListWithPlaces: vi.fn(), reorderList: vi.fn(), membership: vi.fn(), updateList: vi.fn(), archiveList: vi.fn(), upload: vi.fn() },
  observeCollection: vi.fn(),
  purgeMyCollection: vi.fn(),
}));
vi.mock("../../../../Favorites/hooks/usePlacesOwner", () => ({
  usePlacesOwner: () => ({ data: { recommendationLists: fx.lists }, content: { lists: new Map([["l1", { detail: { placeLocation: fx.location } }]]) }, loading: false, error: undefined, refetch: fx.refetch }),
}));
vi.mock("../../../../Favorites/api/placesCommands", () => ({ usePlacesCommands: () => fx.commands }));
vi.mock("../../../../Favorites/api/placesClient", () => ({ PlacesClient: { observeCollection: fx.observeCollection } }));
vi.mock("../../../../../lib/explorersApiClient", () => ({ explorersApiClient: { purgeMyCollection: fx.purgeMyCollection } }));

import { usePlacesListAdapter } from "../places";

const wrapper = ({ children }: { children: ReactNode }) => createElement(MemoryRouter, null, children);
const place = (id: string) => ({
  documentId: id, Place_Details: { Title: `Place ${id}`, Place_Address: "Panaji" }, placesTaxonomy: { category: { id: "c1", label: "Food" } },
  user_recommendation_note: "<p>Lovely <b>spot</b></p>", user_rating: 8, is_pinned: false, media_details: { thumbnail: { url: "/m/1" } },
});
const list = (places: unknown[]) => ({ documentId: "l1", List_Name: "Goa", slug: "goa", Visibility: false, List_Name_Details: { note: "Beaches" }, cover_image: null, account: { username: "owner" }, recommended_places: places });

describe("places list adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); fx.lists = [list([])]; });

  it("maps the owner read to the shared list view and Places routes", () => {
    fx.lists = [list([place("p1")])];
    const { result } = renderHook(() => usePlacesListAdapter("l1"), { wrapper });
    expect(result.current.category).toBe("places");
    expect(result.current.list).toMatchObject({ id: "l1", title: "Goa", description: "Beaches", status: "draft", itemCount: 1 });
    expect(result.current.list?.publicUrl).toMatch(/\/owner\/places\/goa$/);
    expect(result.current.items[0]).toMatchObject({ id: "p1", title: "Place p1", subtitle: "Food · Panaji", note: "Lovely spot", rating: 8, imageUrl: "/m/1" });
    expect(result.current.addPath).toBe("/recommendations/places/l1/add");
    expect(result.current.editPath("p1")).toBe("/recommendations/places/l1/edit/p1");
  });

  it("carries a sample flag onto the list view only for a sample (WP11)", () => {
    fx.lists = [{ ...list([place("p1")]), isSample: true }];
    const sample = renderHook(() => usePlacesListAdapter("l1"), { wrapper }).result.current;
    expect(sample.list?.isSample).toBe(true);
    fx.lists = [list([place("p1")])];
    const mine = renderHook(() => usePlacesListAdapter("l1"), { wrapper }).result.current;
    expect(mine.list).not.toHaveProperty("isSample");
  });

  it("refuses to publish an empty list and publishes the places with the list", async () => {
    const { result, rerender } = renderHook(() => usePlacesListAdapter("l1"), { wrapper });
    await expect(result.current.setStatus("public")).rejects.toThrow(/at least one place/);
    fx.lists = [list([place("p1")])];
    rerender();
    await result.current.setStatus("public");
    expect(fx.commands.publishListWithPlaces).toHaveBeenCalledWith("l1", true, ["p1"]);
  });

  it("routes item and list commands to the Places commands", async () => {
    const { result } = renderHook(() => usePlacesListAdapter("l1"), { wrapper });
    await result.current.reorder(["b", "a"]);
    expect(fx.commands.reorderList).toHaveBeenCalledWith("l1", ["b", "a"]);
    await result.current.removeItem("p1");
    expect(fx.commands.membership).toHaveBeenCalledWith("p1", "l1", false);
    await result.current.rename({ title: "Goa 2" });
    expect(fx.commands.updateList).toHaveBeenCalledWith("l1", { title: "Goa 2" });
    await expect(result.current.togglePin("p1", true)).rejects.toThrow(/whole lists/);
  });

  it("keeps the Places social link on the Manage tab", async () => {
    const { result } = renderHook(() => usePlacesListAdapter("l1"), { wrapper });
    render(result.current.renderManageExtras!() as never);
    fireEvent.change(screen.getByLabelText("Social link for this list"), { target: { value: "https://www.instagram.com/goa/" } });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(fx.commands.setLocation).toHaveBeenCalledWith("l1", { locationEntityId: null, locationSnapshot: null, instagramMediaUrl: "https://www.instagram.com/goa/" }));
  });
});
