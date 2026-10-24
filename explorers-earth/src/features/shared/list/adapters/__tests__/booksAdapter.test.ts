import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const state = vi.hoisted(() => ({ books: [] as Array<{ documentId: string; title: string; is_pinned: boolean; authors: string[] }>, topPicks: [] as Array<{ recommendationId: string; collectionId: string }> }));
const commands = vi.hoisted(() => ({ update: vi.fn(), archive: vi.fn() }));
const refetch = vi.hoisted(() => vi.fn());
const client = vi.hoisted(() => ({ getMyEditableCollection: vi.fn(), purgeMyCollection: vi.fn(), setMyCategoryTopPicks: vi.fn(), archiveMyRecommendation: vi.fn() }));
const reorder = vi.hoisted(() => ({ reorderListItems: vi.fn() }));
vi.mock("../../../../Books/api/useBooksOwnerContent", () => ({
  useBooksOwnerContent: () => ({
    data: { bookLists: [{ documentId: "list_1", List_Name: "Summer Reads", list_description: null, slug: "summer-reads", visibility: false, display_order: 0, top_reads_heading: null, account: { documentId: "acc-1", username: "qa" }, recommended_books: state.books }] },
    content: { observation: { topPicks: state.topPicks }, details: new Map([["b1", { detail: { id: "b1" } }]]) },
    loading: false, error: undefined, refetch,
  }),
}));
vi.mock("../../../../Books/api/useBookListCommands", () => ({ useBookListCommands: () => ({ ...commands, loading: false }) }));
vi.mock("../../../../../store/store", () => ({ default: () => ({ user: { username: "qa", accountDocumentId: "acc-1" } }) }));
vi.mock("../../../../../lib/explorersApiClient", () => ({ explorersApiClient: client }));
vi.mock("../../../../../lib/reorderListItems", () => reorder);
import { useBooksListAdapter } from "../books";

describe("books list adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); state.books = []; state.topPicks = []; });

  it("maps the owner read to the list view", () => {
    const { result } = renderHook(() => useBooksListAdapter("list_1"));
    expect(result.current.list).toMatchObject({ id: "list_1", title: "Summer Reads", slug: "summer-reads", status: "draft", itemCount: 0 });
    expect(result.current.list?.publicUrl).toMatch(/\/qa\/books\/summer-reads$/);
  });

  it("refuses to publish an empty list with the existing message", async () => {
    const { result } = renderHook(() => useBooksListAdapter("list_1"));
    await expect(act(() => result.current.setStatus("public"))).rejects.toThrow("Add at least one book before publishing.");
    expect(commands.update).not.toHaveBeenCalled();
  });

  it("publishes a non-empty list through the list command", async () => {
    state.books = [{ documentId: "b1", title: "Dune", is_pinned: false, authors: [] }];
    const { result } = renderHook(() => useBooksListAdapter("list_1"));
    await act(() => result.current.setStatus("public"));
    expect(commands.update).toHaveBeenCalledWith({ variables: { documentId: "list_1", visibility: true } });
  });

  it("archive calls the archive list command", async () => {
    const { result } = renderHook(() => useBooksListAdapter("list_1"));
    await act(() => result.current.archive());
    expect(commands.archive).toHaveBeenCalledWith({ variables: { documentId: "list_1" } });
  });

  it("refuses a 16th pin", async () => {
    state.books = [{ documentId: "b1", title: "Dune", is_pinned: false, authors: [] }];
    state.topPicks = Array.from({ length: 15 }, (_, i) => ({ recommendationId: `x${i}`, collectionId: "c" }));
    const { result } = renderHook(() => useBooksListAdapter("list_1"));
    await expect(act(() => result.current.togglePin("b1", true))).rejects.toThrow("Max 15 top reads allowed.");
    expect(client.setMyCategoryTopPicks).not.toHaveBeenCalled();
  });

  it("rename sends title, description and slug; reorder uses the shared helper; purge uses the collection observation", async () => {
    const observed = { complete: true, detail: { id: "list_1" } };
    client.getMyEditableCollection.mockResolvedValue(observed);
    const { result } = renderHook(() => useBooksListAdapter("list_1"));
    await act(() => result.current.rename({ title: "New", description: "d", slug: "new" }));
    expect(commands.update).toHaveBeenCalledWith({ variables: { documentId: "list_1", List_Name: "New", list_description: "d", slug: "new" } });
    await act(() => result.current.reorder(["b", "a"]));
    expect(reorder.reorderListItems).toHaveBeenCalledWith("books", "list_1", ["b", "a"]);
    await act(() => result.current.purge());
    expect(client.purgeMyCollection).toHaveBeenCalledWith(observed, expect.any(String));
  });
});
