import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Count how many times the publish modal is rendered while open — a loop would
// blow this up (or throw "Maximum update depth exceeded" before we even assert).
const { modalOpenRenders, listState } = vi.hoisted(() => ({
  modalOpenRenders: { n: 0 },
  // Mutable fixture so each test can drive an empty vs. non-empty list.
  listState: { movies: [] as any[] },
}));

vi.mock("../../../../../components/ListVisibilityModal", () => ({
  ListVisibilityModal: ({ isOpen }: { isOpen: boolean }) => {
    if (!isOpen) return null;
    modalOpenRenders.n += 1;
    return <div>PUBLISH-PROMPT</div>;
  },
}));

vi.mock('../../../api/explorersAdapter', () => ({
 useMoviesOwner: () => ({data:{movieLists:[{documentId:'list_1',List_Name:'My Sci-Fi',list_description:null,slug:'my-sci-fi',Visibility:false,display_order:0,top_picks_heading:null,recommended_movies:listState.movies}]},loading:false,refetch:vi.fn()}),
 changeMovieList:vi.fn(),archiveMovieList:vi.fn(),archiveMovie:vi.fn(),toggleMoviePin:vi.fn(),
}));
import MovieListView from "../MovieListView";

const renderView = (state: { justCreatedList?: boolean; justAddedRecommendation?: boolean }) =>
  render(
    <MemoryRouter
      initialEntries={[{ pathname: "/recommendations/movies/list_1", state }]}
    >
      <Routes>
        <Route path="/recommendations/movies/:listId" element={<MovieListView />} />
      </Routes>
    </MemoryRouter>
  );

describe("MovieListView publish prompt", () => {
  beforeEach(() => {
    modalOpenRenders.n = 0;
    listState.movies = [];
  });

  it("does NOT open the publish prompt for an empty just-created list (no loop)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    listState.movies = [];

    expect(() => renderView({ justCreatedList: true })).not.toThrow();

    // Empty list → publishing is meaningless, so the prompt must stay closed.
    expect(screen.queryByText("PUBLISH-PROMPT")).not.toBeInTheDocument();
    expect(modalOpenRenders.n).toBe(0);
    const loopWarned = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes("Maximum update depth")
    );
    expect(loopWarned).toBe(false);

    errorSpy.mockRestore();
  });

  it("opens the publish prompt once after the first item is added (no loop)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    listState.movies = [{ documentId: "m1", title: "Dune", is_pinned: false }];

    expect(() => renderView({ justAddedRecommendation: true })).not.toThrow();

    expect(screen.getByText("PUBLISH-PROMPT")).toBeInTheDocument();
    // …and it did not loop (a loop renders the open modal dozens of times).
    expect(modalOpenRenders.n).toBeLessThan(5);
    const loopWarned = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes("Maximum update depth")
    );
    expect(loopWarned).toBe(false);

    errorSpy.mockRestore();
  });
});
