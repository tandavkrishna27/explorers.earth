import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { modalOpenRenders, listState, ownerState, refetch, update } = vi.hoisted(() => ({
  modalOpenRenders: { n: 0 },
  // Mutable fixture so each test can drive an empty vs. non-empty list.
  listState: { books: [] as any[] },
  ownerState: { present: true, loading: false, error: undefined as Error | undefined },
  refetch: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../../../../components/ListVisibilityModal", () => ({
  ListVisibilityModal: ({ isOpen }: { isOpen: boolean }) => {
    if (!isOpen) return null;
    modalOpenRenders.n += 1;
    return <div>PUBLISH-PROMPT</div>;
  },
}));

vi.mock("../../../../../store/store", () => ({
  default: () => ({ user: { username: "qa", accountDocumentId: "acc-1" } }),
}));

vi.mock("../../../api/useBooksOwnerContent", () => ({ useBooksOwnerContent: () => ({

      data: {
        bookLists: ownerState.present ? [
          {
            documentId: "list_1",
            List_Name: "Summer Reads",
            list_description: null,
            slug: "summer-reads",
            visibility: false, // NOTE: lowercase for books — draft → prompt opens
            display_order: 0,
            top_reads_heading: null,
            account: { documentId: "acc-1", username: "qa" },
            recommended_books: listState.books,
          },
        ] : [],
      },
      loading: ownerState.loading,
      error: ownerState.error,
      refetch,
    }) }));
vi.mock("../../../api/useBookListCommands",()=>({useBookListCommands:()=>({update,archive:vi.fn(),loading:false})}));

import BookListView from "../BookListView";

const renderView = (state: { justCreatedList?: boolean; justAddedRecommendation?: boolean }) =>
  render(
    <MemoryRouter
      initialEntries={[{ pathname: "/recommendations/books/list_1", state }]}
    >
      <Routes>
        <Route path="/recommendations/books/:listId" element={<BookListView />} />
      </Routes>
    </MemoryRouter>
  );

describe("BookListView publish prompt (lowercase visibility)", () => {
  beforeEach(() => {
    modalOpenRenders.n = 0;
    listState.books = [];
    ownerState.present = true; ownerState.loading = false; ownerState.error = undefined;
    refetch.mockClear(); update.mockClear();
  });

  it("does NOT open the publish prompt for an empty just-created list (no loop)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    listState.books = [];

    expect(() => renderView({ justCreatedList: true })).not.toThrow();

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
    listState.books = [{ documentId: "b1", title: "Dune", is_pinned: false }];

    expect(() => renderView({ justAddedRecommendation: true })).not.toThrow();

    expect(screen.getByText("PUBLISH-PROMPT")).toBeInTheDocument();
    expect(modalOpenRenders.n).toBeLessThan(5);
    const loopWarned = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes("Maximum update depth")
    );
    expect(loopWarned).toBe(false);

    errorSpy.mockRestore();
  });
});

describe("Books bounded diagnostic rendered branch attributes", () => {
  beforeEach(() => {
    listState.books = []; ownerState.present = true; ownerState.loading = false;
    ownerState.error = undefined; refetch.mockClear(); update.mockClear();
  });
  const marker = (container: HTMLElement, value: string) => {
    const roots = container.querySelectorAll("[data-books-owner-state]");
    expect(roots).toHaveLength(1);
    expect(roots[0]).toHaveAttribute("data-books-owner-state", value);
    // Existing return root remains directly under the router's render container.
    expect(roots[0].parentElement).toBe(container);
    expect(refetch).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  };
  it.each([
    ["error", false, true, true, false],
    ["loading", false, true, false, false],
    ["missing", false, false, false, false],
    ["ready-empty", true, false, false, true],
    ["ready-nonempty", true, false, false, true],
    ["ready-empty", true, true, true, true],
    ["ready-nonempty", true, true, true, true],
  ])("labels %s from the existing rendered branch", (state, present, loading, error, add) => {
    ownerState.present = present as boolean; ownerState.loading = loading as boolean;
    ownerState.error = error ? new Error("Owner read failed") : undefined;
    if (state === "ready-nonempty") listState.books = [{ documentId: "b1", title: "Dune", is_pinned: false }];
    const { container } = renderView({}); marker(container, state as string);
    if (add) {
      expect(screen.getByRole("button", { name: "Add Book", exact: true })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Back", exact: true })).toBeInTheDocument();
    } else expect(screen.queryByRole("button", { name: "Add Book", exact: true })).not.toBeInTheDocument();
    if (state === "missing") expect(screen.getByRole("alert")).toHaveTextContent("List not found.");
    if (state === "error") {
      expect(screen.getByRole("alert")).toHaveTextContent("Owner read failed");
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    }
  });
  it("rerenders across existing branches without retaining duplicate roots", () => {
    ownerState.present = false; ownerState.loading = true;
    const ui = () => <MemoryRouter initialEntries={["/recommendations/books/list_1"]}><Routes><Route path="/recommendations/books/:listId" element={<BookListView />} /></Routes></MemoryRouter>;
    const view = render(ui()); marker(view.container, "loading");
    ownerState.error = new Error("Owner read failed"); view.rerender(ui()); marker(view.container, "error");
    ownerState.loading = false; ownerState.error = undefined; view.rerender(ui()); marker(view.container, "missing");
    expect(screen.getByRole("alert")).toHaveTextContent("List not found.");
    ownerState.present = true; view.rerender(ui()); marker(view.container, "ready-empty");
    listState.books = [{ documentId: "b1", title: "Dune", is_pinned: false }];
    view.rerender(ui()); marker(view.container, "ready-nonempty");
  });
});
