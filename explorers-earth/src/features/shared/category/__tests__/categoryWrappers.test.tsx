/* eslint-disable @typescript-eslint/no-explicit-any -- captured template props */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { englishI18n } from "../../../../test/englishI18n";

const captured: Record<string, unknown>[] = [];
vi.mock("../CategoryPage", () => ({ default: (props: Record<string, unknown>) => { captured.push(props); return <div data-testid="category-page" data-category={String(props.category)} />; } }));
vi.mock("../../../navigation/CategoryNavigationProvider", () => ({ useCategoryNavigation: () => ({ snapshot: { visibility: { public_movie: "Yes", public_games: "No", public_apps: "No", public_products: "No", public_people: "No" } }, authority: "origin", busy: false, request: vi.fn() }) }));
vi.mock("../../../../store/store", () => ({ default: () => ({ user: { username: "fixture" }, accountId: "acc" }) }));
vi.mock("../../../Movies/api/explorersAdapter", () => ({
  invalidateMovies: vi.fn(),
  useMoviesOwner: () => ({ loading: false, error: null, refetch: vi.fn(), data: { movieLists: [
    { documentId: "l1", List_Name: "Comfort movies", Visibility: true, recommended_movies: [{ documentId: "m1", title: "Chef", poster_path: "/c.jpg", is_pinned: true, pin_order: 1 }] },
  ] } }),
}));
vi.mock("../../../Books/api/useBooksNavigation", () => ({ useBooksNavigation: () => ({ snapshot: { visibility: { public_books: "No" } }, authority: "origin", busy: false, request: vi.fn() }) }));
vi.mock("../../../Books/api/useBooksOwnerContent", () => ({ useBooksOwnerContent: () => ({ loading: false, error: null, refetch: vi.fn(), data: { bookLists: [
  { documentId: "b1", List_Name: "Read in a weekend", visibility: false, recommended_books: [{ documentId: "k1", title: "Siddhartha", cover_url: null, is_pinned: false }] },
] } }) }));

const page =(ui: React.ReactElement) => render(<I18nextProvider i18n={englishI18n}><MemoryRouter>{ui}</MemoryRouter></I18nextProvider>);
const last = () => captured[captured.length - 1] as Record<string, any>;

describe("category wrappers render the shared template", () => {
  it("movies", async () => {
    const { default: MoviesHome } = await import("../../../Movies/components/dashboard/MoviesHome");
    page(<MoviesHome />);
    expect(screen.getByTestId("category-page")).toHaveAttribute("data-category", "movies");
    expect(last()).toMatchObject({ categoryVisibility: "public", lists: [{ id: "l1", title: "Comfort movies", status: "public", itemCount: 1, pinnedCount: 1 }] });
    expect(last().topPicks.map((p: { id: string }) => p.id)).toEqual(["m1"]);
    expect(last()).toMatchSnapshot({ onCategoryVisibility: expect.any(Function), onOpenList: expect.any(Function), onRetry: expect.any(Function), onChanged: expect.any(Function), newList: expect.any(Object) });
  });

  it("books", async () => {
    const { default: BooksHome } = await import("../../../Books/components/dashboard/BooksHome");
    page(<BooksHome />);
    expect(last()).toMatchObject({ category: "books", categoryVisibility: "hidden", lists: [{ id: "b1", status: "draft", itemCount: 1, pinnedCount: 0 }], topPicks: [] });
    expect(last()).toMatchSnapshot({ onCategoryVisibility: expect.any(Function), onOpenList: expect.any(Function), onRetry: expect.any(Function), onChanged: expect.any(Function), newList: expect.any(Object) });
  });
});
