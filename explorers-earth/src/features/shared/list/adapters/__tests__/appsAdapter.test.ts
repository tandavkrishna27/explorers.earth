import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

const fx = vi.hoisted(() => ({
  lists: [] as unknown[],
  refetch: vi.fn(),
  commands: { loading: false, updateList: vi.fn(), archiveList: vi.fn(), pin: vi.fn(), membership: vi.fn(), publishRecommendation: vi.fn() },
  observeCollection: vi.fn(),
  purgeMyCollection: vi.fn(),
  reorderListItems: vi.fn(),
}));
vi.mock("../../../../AppsAndTools/hooks/useAppsOwner", () => ({
  useAppsOwner: () => ({ content: { view: { lists: fx.lists } }, data: { appLists: fx.lists }, loading: false, error: undefined, refetch: fx.refetch }),
}));
vi.mock("../../../../AppsAndTools/api/query", () => ({ useAppsCommands: () => fx.commands }));
vi.mock("../../../../AppsAndTools/api/appsClient", () => ({ AppsClient: { observeCollection: fx.observeCollection } }));
vi.mock("../../../../../lib/explorersApiClient", () => ({ explorersApiClient: { purgeMyCollection: fx.purgeMyCollection, createMedia: vi.fn() } }));
vi.mock("../../../../../lib/reorderListItems", () => ({ reorderListItems: fx.reorderListItems }));

import { useAppsListAdapter } from "../apps";

const wrapper = ({ children }: { children: ReactNode }) => createElement(MemoryRouter, null, children);
const app = (id: string, pinned = false) => ({ documentId: id, title: `App ${id}`, developer: "Dev", price_tier: "Free", user_rating: 7, logo_url: null, is_pinned: pinned });
const list = (apps: unknown[]) => ({ documentId: "list_1", List_Name: "My Apps", list_description: "Tools", slug: "my-apps", Visibility: true, cover_image: null, recommended_apps: apps, account: { documentId: "a1", username: "owner" } });

describe("apps list adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); fx.lists = [list([])]; });

  it("maps the owner read to the list view", () => {
    fx.lists = [list([app("x1", true)])];
    const { result } = renderHook(() => useAppsListAdapter("list_1"), { wrapper });
    expect(result.current.list).toMatchObject({ id: "list_1", title: "My Apps", description: "Tools", slug: "my-apps", status: "public", itemCount: 1 });
    expect(result.current.list?.publicUrl).toMatch(/\/owner\/apps\/my-apps$/);
    expect(result.current.items[0]).toMatchObject({ id: "x1", title: "App x1", pinned: true });
    expect(result.current.addPath).toBe("/recommendations/apps/list_1/add");
  });

  it("refuses to publish an empty list with the existing message", async () => {
    const { result } = renderHook(() => useAppsListAdapter("list_1"), { wrapper });
    await expect(act(() => result.current.setStatus("public"))).rejects.toThrow("Add at least one app before publishing.");
    expect(fx.commands.updateList).not.toHaveBeenCalled();
  });

  it("archive calls archiveList", async () => {
    const { result } = renderHook(() => useAppsListAdapter("list_1"), { wrapper });
    await act(() => result.current.archive());
    expect(fx.commands.archiveList).toHaveBeenCalledWith("list_1");
  });

  it("setting draft unpublishes the list only, never a recommendation", async () => {
    fx.lists = [list([app("x1")])];
    const { result } = renderHook(() => useAppsListAdapter("list_1"), { wrapper });
    await act(() => result.current.setStatus("draft"));
    expect(fx.commands.updateList).toHaveBeenCalledWith("list_1", { visibility: "private", publicationState: "draft" });
    expect(fx.commands.publishRecommendation).not.toHaveBeenCalled();
  });

  it("rename sends the slug through updateList", async () => {
    const { result } = renderHook(() => useAppsListAdapter("list_1"), { wrapper });
    await act(() => result.current.rename({ slug: "tools" }));
    expect(fx.commands.updateList).toHaveBeenCalledWith("list_1", { slug: "tools" });
  });

  it("purge observes the collection and permanently deletes it", async () => {
    const observed = { detail: { id: "list_1" } };
    fx.observeCollection.mockResolvedValue(observed);
    const { result } = renderHook(() => useAppsListAdapter("list_1"), { wrapper });
    await act(() => result.current.purge());
    expect(fx.observeCollection).toHaveBeenCalledWith("list_1");
    expect(fx.purgeMyCollection).toHaveBeenCalledWith(observed, expect.any(String));
  });

  it("reorders through the shared helper", async () => {
    const { result } = renderHook(() => useAppsListAdapter("list_1"), { wrapper });
    await act(() => result.current.reorder(["b", "a"]));
    expect(fx.reorderListItems).toHaveBeenCalledWith("apps", "list_1", ["b", "a"]);
  });

  it("refuses a 16th pin with the existing message", async () => {
    fx.lists = [list([...Array.from({ length: 15 }, (_, i) => app(`p${i}`, true)), app("new")])];
    const { result } = renderHook(() => useAppsListAdapter("list_1"), { wrapper });
    await expect(act(() => result.current.togglePin("new", true))).rejects.toThrow("Max 15 pinned apps allowed.");
    expect(fx.commands.pin).not.toHaveBeenCalled();
    await act(() => result.current.togglePin("p3", false));
    expect(fx.commands.pin).toHaveBeenCalledWith("p3", "list_1", false);
  });

  it("removeItem detaches the membership from this list", async () => {
    const { result } = renderHook(() => useAppsListAdapter("list_1"), { wrapper });
    await act(() => result.current.removeItem("x1"));
    expect(fx.commands.membership).toHaveBeenCalledWith("x1", "list_1", false);
  });
});
