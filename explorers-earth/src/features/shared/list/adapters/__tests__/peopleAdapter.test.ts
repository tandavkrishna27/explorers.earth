import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({
  commands: { loading: false, updateList: vi.fn(), archiveList: vi.fn(), pin: vi.fn(), membership: vi.fn() },
  owner: {
    lists: [{ documentId: "list_1", List_Name: "Mentors", list_description: null, slug: "mentors", Visibility: false, cover_image: null, recommended_people: [] as unknown[] }],
  },
  refetch: vi.fn(),
  observeCollection: vi.fn(),
  updateMyCollection: vi.fn(),
  purgeMyCollection: vi.fn(),
  reorderListItems: vi.fn(),
}));
vi.mock("../../../../People/api/query", () => ({ usePeopleCommands: () => api.commands }));
vi.mock("../../../../People/hooks/usePeopleOwner", () => ({
  usePeopleOwner: () => ({ data: { personLists: api.owner.lists }, loading: false, error: undefined, refetch: api.refetch }),
  invalidatePeople: vi.fn(),
}));
vi.mock("../../../../People/api/peopleClient", () => ({ PeopleClient: { observeCollection: api.observeCollection } }));
vi.mock("../../../../../lib/explorersApiClient", () => ({ explorersApiClient: { updateMyCollection: api.updateMyCollection, purgeMyCollection: api.purgeMyCollection } }));
vi.mock("../../../../../lib/reorderListItems", () => ({ reorderListItems: api.reorderListItems }));

import { usePeopleListAdapter } from "../people";

const wrapper = ({ children }: { children: ReactNode }) => createElement(MemoryRouter, null, children);
const person = (id: string, pinned = false) => ({ documentId: id, full_name: `Person ${id}`, handle: "h", avatar_url: null, user_rating: 7, is_pinned: pinned });

describe("people list adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); api.owner.lists[0].recommended_people = []; });

  it("maps the owner read to the list view", () => {
    api.owner.lists[0].recommended_people = [person("a")];
    const { result } = renderHook(() => usePeopleListAdapter("list_1"), { wrapper });
    expect(result.current.list).toMatchObject({ id: "list_1", title: "Mentors", slug: "mentors", status: "draft", itemCount: 1 });
    expect(result.current.list?.publicUrl).toMatch(/\/people\/mentors$/);
    expect(result.current.items[0]).toMatchObject({ id: "a", title: "Person a", subtitle: "@h", pinned: false });
  });

  it("refuses to publish an empty list with the existing message", async () => {
    const { result } = renderHook(() => usePeopleListAdapter("list_1"), { wrapper });
    await expect(act(() => result.current.setStatus("public"))).rejects.toThrow("Add at least one person before publishing.");
    expect(api.commands.updateList).not.toHaveBeenCalled();
  });

  it("archive calls archiveList", async () => {
    const { result } = renderHook(() => usePeopleListAdapter("list_1"), { wrapper });
    await act(() => result.current.archive());
    expect(api.commands.archiveList).toHaveBeenCalledWith("list_1");
  });

  it("refuses a 16th pin", async () => {
    api.owner.lists[0].recommended_people = Array.from({ length: 16 }, (_, i) => person(`p${i}`, i < 15));
    const { result } = renderHook(() => usePeopleListAdapter("list_1"), { wrapper });
    await expect(act(() => result.current.togglePin("p15", true))).rejects.toThrow(/Max 15 pinned/);
    expect(api.commands.pin).not.toHaveBeenCalled();
  });

  it("rename and purge use the collection observation", async () => {
    const observed = { detail: { id: "list_1" } };
    api.observeCollection.mockResolvedValue(observed);
    const { result } = renderHook(() => usePeopleListAdapter("list_1"), { wrapper });
    await act(() => result.current.rename({ slug: "new" }));
    expect(api.updateMyCollection).toHaveBeenCalledWith(observed, { slug: "new" }, expect.any(String));
    await act(() => result.current.purge());
    expect(api.purgeMyCollection).toHaveBeenCalledWith(observed, expect.any(String));
  });

  it("reorders through the shared helper", async () => {
    const { result } = renderHook(() => usePeopleListAdapter("list_1"), { wrapper });
    await act(() => result.current.reorder(["b", "a"]));
    expect(api.reorderListItems).toHaveBeenCalledWith("people", "list_1", ["b", "a"]);
  });
});
