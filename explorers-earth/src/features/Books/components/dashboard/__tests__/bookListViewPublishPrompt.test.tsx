import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { modalOpenRenders, listState } = vi.hoisted(() => ({
  modalOpenRenders: { n: 0 },
  // Mutable fixture so each test can drive an empty vs. non-empty list.
  listState: { books: [] as any[] },
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
        bookLists: [
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
        ],
      },
      loading: false,
      refetch: vi.fn(),
    }) }));
vi.mock("../../../api/useBookListCommands",()=>({useBookListCommands:()=>({update:vi.fn(),archive:vi.fn(),loading:false})}));

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
