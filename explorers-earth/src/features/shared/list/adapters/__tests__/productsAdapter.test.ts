import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({
  commands: { loading: false, updateList: vi.fn(), archiveList: vi.fn(), pin: vi.fn(), membership: vi.fn() },
  owner: {
    lists: [{ documentId: "list_1", List_Name: "Gear", list_description: null, slug: "gear", Visibility: false, cover_image: null, recommended_products: [] as unknown[] }],
  },
  refetch: vi.fn(),
  observeCollection: vi.fn(),
  updateMyCollection: vi.fn(),
  purgeMyCollection: vi.fn(),
  reorderListItems: vi.fn(),
}));
vi.mock("../../../../Products/api/query", () => ({ useProductsCommands: () => api.commands }));
vi.mock("../../../../Products/hooks/useProductsOwner", () => ({
  useProductsOwner: () => ({ data: { productLists: api.owner.lists }, loading: false, error: undefined, refetch: api.refetch }),
  invalidateProducts: vi.fn(),
}));
vi.mock("../../../../Products/api/productsClient", () => ({ ProductsClient: { observeCollection: api.observeCollection } }));
vi.mock("../../../../../lib/explorersApiClient", () => ({ explorersApiClient: { updateMyCollection: api.updateMyCollection, purgeMyCollection: api.purgeMyCollection } }));
vi.mock("../../../../../lib/reorderListItems", () => ({ reorderListItems: api.reorderListItems }));

import { useProductsListAdapter } from "../products";

const wrapper = ({ children }: { children: ReactNode }) => createElement(MemoryRouter, null, children);
const product = (id: string, pinned = false) => ({ documentId: id, title: `P ${id}`, brand: "Acme", logo_url: null, user_rating: 7, is_pinned: pinned });

describe("products list adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); api.owner.lists[0].recommended_products = []; api.owner.lists[0].Visibility = false; });

  it("maps the owner read to the list view", () => {
    const { result } = renderHook(() => useProductsListAdapter("list_1"), { wrapper });
    expect(result.current.list).toMatchObject({ id: "list_1", title: "Gear", slug: "gear", status: "draft", itemCount: 0 });
    expect(result.current.list?.publicUrl).toMatch(/\/products\/gear$/);
    expect(result.current.addPath).toBe("/recommendations/products/list_1/add");
    expect(result.current.editPath("p1")).toBe("/recommendations/products/list_1/edit/p1");
  });

  it("refuses to publish an empty list with the existing message", async () => {
    const { result } = renderHook(() => useProductsListAdapter("list_1"), { wrapper });
    await expect(act(() => result.current.setStatus("public"))).rejects.toThrow("Add at least one product before publishing.");
    expect(api.commands.updateList).not.toHaveBeenCalled();
  });

  it("publishes a non-empty list through updateList", async () => {
    api.owner.lists[0].recommended_products = [product("p1")];
    const { result } = renderHook(() => useProductsListAdapter("list_1"), { wrapper });
    await act(() => result.current.setStatus("public"));
    expect(api.commands.updateList).toHaveBeenCalledWith("list_1", { visibility: "public", publicationState: "published" });
  });

  it("archive calls archiveList", async () => {
    const { result } = renderHook(() => useProductsListAdapter("list_1"), { wrapper });
    await act(() => result.current.archive());
    expect(api.commands.archiveList).toHaveBeenCalledWith("list_1");
  });

  it("refuses a 16th pin", async () => {
    api.owner.lists[0].recommended_products = Array.from({ length: 16 }, (_, i) => product(`p${i}`, i < 15));
    const { result } = renderHook(() => useProductsListAdapter("list_1"), { wrapper });
    await expect(act(() => result.current.togglePin("p15", true))).rejects.toThrow("Max 15 pinned products allowed.");
    expect(api.commands.pin).not.toHaveBeenCalled();
  });

  it("rename and purge use the collection observation", async () => {
    const observed = { detail: { id: "list_1" } };
    api.observeCollection.mockResolvedValue(observed);
    const { result } = renderHook(() => useProductsListAdapter("list_1"), { wrapper });
    await act(() => result.current.rename({ title: "New", slug: "new" }));
    expect(api.updateMyCollection).toHaveBeenCalledWith(observed, { title: "New", slug: "new" }, expect.any(String));
    await act(() => result.current.purge());
    expect(api.purgeMyCollection).toHaveBeenCalledWith(observed, expect.any(String));
  });

  it("reorders through the shared helper and removes via membership", async () => {
    const { result } = renderHook(() => useProductsListAdapter("list_1"), { wrapper });
    await act(() => result.current.reorder(["b", "a"]));
    expect(api.reorderListItems).toHaveBeenCalledWith("products", "list_1", ["b", "a"]);
    await act(() => result.current.removeItem("a"));
    expect(api.commands.membership).toHaveBeenCalledWith("a", "list_1", false);
  });
});
