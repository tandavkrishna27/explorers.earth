import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

const fx = vi.hoisted(() => ({
  lists: [] as unknown[],
  refetch: vi.fn(),
  commands: { loading: false, updateList: vi.fn(), archiveList: vi.fn(), pin: vi.fn(), membership: vi.fn() },
  observeCollection: vi.fn(),
  purgeMyCollection: vi.fn(),
  reorderListItems: vi.fn(),
}));
vi.mock("../../../../Games/hooks/useGamesOwner", () => ({
  useGamesOwner: () => ({ content: { view: { lists: fx.lists } }, data: { gameLists: fx.lists.filter((l) => (l as { documentId: string }).documentId === "list_1") }, loading: false, error: undefined, refetch: fx.refetch }),
}));
vi.mock("../../../../Games/api/query", () => ({ useGamesCommands: () => fx.commands }));
vi.mock("../../../../Games/api/gamesClient", () => ({ GamesClient: { observeCollection: fx.observeCollection } }));
vi.mock("../../../../../lib/explorersApiClient", () => ({ explorersApiClient: { purgeMyCollection: fx.purgeMyCollection, createMedia: vi.fn() } }));
vi.mock("../../../../../lib/reorderListItems", () => ({ reorderListItems: fx.reorderListItems }));

import { useGamesListAdapter } from "../games";

const wrapper = ({ children }: { children: ReactNode }) => createElement(MemoryRouter, null, children);
const game = (id: string, pinned = false) => ({ documentId: id, title: `Game ${id}`, developer: "Dev", release_year: 2020, user_rating: 8, cover_url: null, is_pinned: pinned });
const list = (games: unknown[], extra: Record<string, unknown> = {}) => ({ documentId: "list_1", List_Name: "My Games", list_description: null, slug: "my-games", Visibility: false, cover_image: null, recommended_games: games, account: { documentId: "a1", username: "owner" }, ...extra });

describe("games list adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); fx.lists = [list([])]; });

  it("maps the owner read to the list view", () => {
    fx.lists = [list([game("g1", true)])];
    const { result } = renderHook(() => useGamesListAdapter("list_1"), { wrapper });
    expect(result.current.list).toMatchObject({ id: "list_1", title: "My Games", slug: "my-games", status: "draft", itemCount: 1 });
    expect(result.current.list?.publicUrl).toMatch(/\/owner\/games\/my-games$/);
    expect(result.current.items[0]).toMatchObject({ id: "g1", title: "Game g1", pinned: true });
    expect(result.current.addPath).toBe("/recommendations/games/list_1/add");
    expect(result.current.editPath("g1")).toBe("/recommendations/games/list_1/edit/g1");
  });

  it("refuses to publish an empty list with the existing message", async () => {
    const { result } = renderHook(() => useGamesListAdapter("list_1"), { wrapper });
    await expect(act(() => result.current.setStatus("public"))).rejects.toThrow("Add at least one game before publishing.");
    expect(fx.commands.updateList).not.toHaveBeenCalled();
  });

  it("publishes a non-empty list through updateList (visibility + publication)", async () => {
    fx.lists = [list([game("g1")])];
    const { result } = renderHook(() => useGamesListAdapter("list_1"), { wrapper });
    await act(() => result.current.setStatus("public"));
    expect(fx.commands.updateList).toHaveBeenCalledWith("list_1", { visibility: "public", publicationState: "published" });
  });

  it("archive calls archiveList", async () => {
    const { result } = renderHook(() => useGamesListAdapter("list_1"), { wrapper });
    await act(() => result.current.archive());
    expect(fx.commands.archiveList).toHaveBeenCalledWith("list_1");
  });

  it("rename sends title, description and slug through updateList", async () => {
    const { result } = renderHook(() => useGamesListAdapter("list_1"), { wrapper });
    await act(() => result.current.rename({ title: "New", description: null, slug: "new-slug" }));
    expect(fx.commands.updateList).toHaveBeenCalledWith("list_1", { title: "New", description: "", slug: "new-slug" });
  });

  it("purge observes the collection and permanently deletes it", async () => {
    const observed = { detail: { id: "list_1", revision: 3 } };
    fx.observeCollection.mockResolvedValue(observed);
    const { result } = renderHook(() => useGamesListAdapter("list_1"), { wrapper });
    await act(() => result.current.purge());
    expect(fx.purgeMyCollection).toHaveBeenCalledWith(observed, expect.any(String));
  });

  it("reorders through the shared helper", async () => {
    const { result } = renderHook(() => useGamesListAdapter("list_1"), { wrapper });
    await act(() => result.current.reorder(["b", "a"]));
    expect(fx.reorderListItems).toHaveBeenCalledWith("games", "list_1", ["b", "a"]);
  });

  it("refuses a 16th Top Pick across the category, but allows re-pinning an existing pick", async () => {
    const others = Array.from({ length: 15 }, (_, i) => game(`p${i}`, true));
    fx.lists = [list([game("g1"), { ...others[0] }]), { ...list(others.slice(1)), documentId: "other" }];
    const { result } = renderHook(() => useGamesListAdapter("list_1"), { wrapper });
    await expect(act(() => result.current.togglePin("g1", true))).rejects.toThrow("Max 15 top picks allowed.");
    expect(fx.commands.pin).not.toHaveBeenCalled();
    await act(() => result.current.togglePin("p0", true));
    expect(fx.commands.pin).toHaveBeenCalledWith("p0", "list_1", true);
  });

  it("removeItem detaches the membership from this list", async () => {
    const { result } = renderHook(() => useGamesListAdapter("list_1"), { wrapper });
    await act(() => result.current.removeItem("g1"));
    expect(fx.commands.membership).toHaveBeenCalledWith("g1", "list_1", false);
  });
});
