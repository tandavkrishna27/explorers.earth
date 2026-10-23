import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const state = vi.hoisted(() => ({ movies: [] as Array<{ documentId: string; title: string; is_pinned: boolean; user_recommendation_note?: string }> }));
const api = vi.hoisted(() => ({
  changeMovieList: vi.fn(), archiveMovieList: vi.fn(), archiveMovie: vi.fn(), toggleMoviePin: vi.fn(), invalidateMovies: vi.fn(),
  useMoviesOwner: () => ({
    data: { movieLists: [{ documentId: "list_1", List_Name: "My Sci-Fi", list_description: null, slug: "my-sci-fi", Visibility: false, display_order: 0, top_picks_heading: null, recommended_movies: state.movies }] },
    content: undefined, loading: false, error: undefined, refetch: vi.fn(),
  }),
}));
const client = vi.hoisted(() => ({ getMyEditableCollection: vi.fn(), purgeMyCollection: vi.fn() }));
const reorder = vi.hoisted(() => ({ reorderListItems: vi.fn() }));
vi.mock("../../../../Movies/api/explorersAdapter", () => api);
vi.mock("../../../../../lib/explorersApiClient", () => ({ explorersApiClient: client }));
vi.mock("../../../../../lib/reorderListItems", () => reorder);
import { useMoviesListAdapter } from "../movies";

describe("movies list adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); state.movies = []; });

  it("maps the owner read to the list view", () => {
    const { result } = renderHook(() => useMoviesListAdapter("list_1"));
    expect(result.current.list).toMatchObject({ id: "list_1", title: "My Sci-Fi", slug: "my-sci-fi", status: "draft", itemCount: 0 });
    expect(result.current.list?.publicUrl).toMatch(/\/movies\/my-sci-fi$/);
    expect(result.current.addPath).toBe("/recommendations/movies/list_1/add");
    expect(result.current.editPath("m1")).toBe("/recommendations/movies/list_1/edit/m1");
  });

  it("maps the recommendation note to a decoded preview, and omits it when empty", () => {
    state.movies = [
      { documentId: "m1", title: "Dune", is_pinned: false, user_recommendation_note: "<p>Great&nbsp;film</p>" },
      { documentId: "m2", title: "Alien", is_pinned: false },
    ];
    const { result } = renderHook(() => useMoviesListAdapter("list_1"));
    expect(result.current.items.find((i) => i.id === "m1")?.note).toBe("Great film");
    expect(result.current.items.find((i) => i.id === "m2")?.note).toBeUndefined();
  });

  it("refuses to publish an empty list with the existing message", async () => {
    const { result } = renderHook(() => useMoviesListAdapter("list_1"));
    await expect(act(() => result.current.setStatus("public"))).rejects.toThrow("Add at least one movie before publishing.");
    expect(api.changeMovieList).not.toHaveBeenCalled();
  });

  it("publishes a non-empty list through changeMovieList", async () => {
    state.movies = [{ documentId: "m1", title: "Dune", is_pinned: false }];
    const { result } = renderHook(() => useMoviesListAdapter("list_1"));
    await act(() => result.current.setStatus("public"));
    expect(api.changeMovieList).toHaveBeenCalledWith("list_1", { visibility: true });
  });

  it("archive calls archiveMovieList", async () => {
    const { result } = renderHook(() => useMoviesListAdapter("list_1"));
    await act(() => result.current.archive());
    expect(api.archiveMovieList).toHaveBeenCalledWith("list_1");
  });

  it("refuses a 16th pin", async () => {
    state.movies = Array.from({ length: 16 }, (_, i) => ({ documentId: `m${i}`, title: `M${i}`, is_pinned: i < 15 }));
    const { result } = renderHook(() => useMoviesListAdapter("list_1"));
    await expect(act(() => result.current.togglePin("m15", true))).rejects.toThrow("Max 15 pinned movies allowed.");
    expect(api.toggleMoviePin).not.toHaveBeenCalled();
  });

  it("rename sends title, description and slug; reorder uses the shared helper; purge uses the collection observation", async () => {
    const observed = { complete: true, detail: { id: "list_1" } };
    client.getMyEditableCollection.mockResolvedValue(observed);
    const { result } = renderHook(() => useMoviesListAdapter("list_1"));
    await act(() => result.current.rename({ title: "New", description: null, slug: "new" }));
    expect(api.changeMovieList).toHaveBeenCalledWith("list_1", { title: "New", description: null, slug: "new" });
    await act(() => result.current.reorder(["b", "a"]));
    expect(reorder.reorderListItems).toHaveBeenCalledWith("movies", "list_1", ["b", "a"]);
    await act(() => result.current.purge());
    expect(client.getMyEditableCollection).toHaveBeenCalledWith("list_1");
    expect(client.purgeMyCollection).toHaveBeenCalledWith(observed, expect.any(String));
  });
});
