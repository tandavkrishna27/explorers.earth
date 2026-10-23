/* eslint-disable @typescript-eslint/no-explicit-any -- captured template props */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { englishI18n } from "../../../../test/englishI18n";

const captured: Record<string, unknown>[] = [];
vi.mock("../CategoryPage", () => ({ default: (props: Record<string, unknown>) => { captured.push(props); return <div data-testid="category-page" data-category={String(props.category)}>{props.toolbar as React.ReactNode}</div>; } }));
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

vi.mock("../../../Games/hooks/useGamesOwner", () => ({ useGamesOwner: () => ({ loading: false, error: null, refetch: vi.fn(), data: { gameLists: [
  { documentId: "g1", List_Name: "Couch co-op", Visibility: false, recommended_games: [] }] } }) }));
vi.mock("../../../AppsAndTools/hooks/useAppsOwner", () => ({ useAppsOwner: () => ({ loading: false, error: null, refetch: vi.fn(), data: { appLists: [
  { documentId: "a1", List_Name: "Focus toolkit", Visibility: true, recommended_apps: [{ documentId: "x1", title: "Forest", logo_url: null, is_pinned: true, pin_order: 0 }] }] } }) }));
vi.mock("../../../Products/hooks/useProductsOwner", () => ({ useProductsOwner: () => ({ loading: false, error: null, refetch: vi.fn(), data: { productLists: [
  { documentId: "p1", List_Name: "Desk setup", Visibility: false, recommended_products: [] }] } }) }));
vi.mock("../../../People/hooks/usePeopleOwner", () => ({ usePeopleOwner: () => ({ loading: false, error: null, refetch: vi.fn(), data: { personLists: [
  { documentId: "q1", List_Name: "Design voices", Visibility: false, recommended_people: [{ documentId: "y1", name: "A type designer", is_pinned: false }] }] } }) }));
vi.mock("../../../../components/SEO", () => ({ default: () => null }));
const archivedReads = vi.hoisted(() => ({ categories: [] as string[], reload: vi.fn() }));
vi.mock("../useArchivedLists", () => ({ useArchivedLists: (category: string) => {
  archivedReads.categories.push(category);
  const lists = category === "movies" || category === "guides" ? [{ id: `${category}-old`, title: "Old", status: "draft", itemCount: 0, pinnedCount: 0, covers: [] }] : [];
  return { lists, reload: archivedReads.reload };
} }));
vi.mock("../../../Guides/hooks/useGuidesOwner", () => ({ invalidateGuides: vi.fn(), useGuidesOwner: () => ({ loading: false, error: null, refresh: vi.fn(), content: null, guides: [
  { documentId: "gd1", Title: "48 hours in Goa", Visibility: true, is_pinned: true, pin_order: 0, Guide_Media: [{ url: "/g.jpg" }], display_order: 0, Place_Details: { Place_Name: "Goa" } },
  { documentId: "gd2", Title: "Draft trip", Visibility: false, is_pinned: false, display_order: 1, Place_Details: { Place_Name: "Kochi" } },
] }) }));

const page = (ui: React.ReactElement) => render(<I18nextProvider i18n={englishI18n}><MemoryRouter>{ui}</MemoryRouter></I18nextProvider>);
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

  it.each([
    ["games", "../../../Games/components/dashboard/GamesHome", { lists: [{ id: "g1", status: "draft", itemCount: 0 }], topPicks: [] }],
    ["apps", "../../../AppsAndTools/components/dashboard/AppsHome", { lists: [{ id: "a1", status: "public", itemCount: 1, pinnedCount: 1 }] }],
    ["products", "../../../Products/components/dashboard/ProductsHome", { lists: [{ id: "p1", status: "draft" }] }],
    ["people", "../../../People/components/dashboard/PeopleHome", { lists: [{ id: "q1", itemCount: 1 }] }],
  ])("%s", async (category, path, expected) => {
    const { default: Home } = await import(/* @vite-ignore */ path);
    page(<Home />);
    expect(last()).toMatchObject({ category, ...expected });
    expect(last()).toMatchSnapshot({ onCategoryVisibility: expect.any(Function), onOpenList: expect.any(Function), onRetry: expect.any(Function), onChanged: expect.any(Function), newList: expect.any(Object) });
  });

  it("guides", async () => {
    const { default: GuidesPage } = await import("../../../Guides/GuidesPage");
    page(<GuidesPage />);
    expect(last()).toMatchObject({ category: "guides", newList: { kind: "navigate" },
      lists: [{ id: "gd1", status: "public" }, { id: "gd2", status: "draft" }],
      topPicks: [{ id: "gd1", listId: "gd1", pinned: true }] });
    expect(last().pinCandidates.find((p: { id: string }) => p.id === "gd2").pinnable).toBe(false);
  });

  it("guides location chips filter the guide cards", async () => {
    const { default: GuidesPage } = await import("../../../Guides/GuidesPage");
    page(<GuidesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Kochi" }));
    expect(last().lists.map((l: { id: string }) => l.id)).toEqual(["gd2"]);
    fireEvent.click(screen.getByRole("button", { name: "All Locations" }));
    expect(last().lists.map((l: { id: string }) => l.id)).toEqual(["gd1", "gd2"]);
  });

  it("books", async () => {
    const { default: BooksHome } = await import("../../../Books/components/dashboard/BooksHome");
    page(<BooksHome />);
    expect(last()).toMatchObject({ category: "books", categoryVisibility: "hidden", lists: [{ id: "b1", status: "draft", itemCount: 1, pinnedCount: 0 }], topPicks: [] });
    expect(last()).toMatchSnapshot({ onCategoryVisibility: expect.any(Function), onOpenList: expect.any(Function), onRetry: expect.any(Function), onChanged: expect.any(Function), newList: expect.any(Object) });
  });
});

describe("wrappers pass archived lists separately (ruling R8)", () => {
  it.each([
    ["movies", "../../../Movies/components/dashboard/MoviesHome", "l1"],
    ["guides", "../../../Guides/GuidesPage", "gd1"],
  ])("%s: the archived list is only in archivedLists, and a change reloads it", async (category, path, activeId) => {
    archivedReads.reload.mockClear();
    const { default: Home } = await import(/* @vite-ignore */ path);
    page(<Home />);
    expect(archivedReads.categories).toContain(category);
    expect(last().archivedLists.map((l: { id: string }) => l.id)).toEqual([`${category}-old`]);
    expect(last().lists.map((l: { id: string }) => l.id)).toContain(activeId);
    expect(last().lists.map((l: { id: string }) => l.id)).not.toContain(`${category}-old`);
    last().onChanged();
    expect(archivedReads.reload).toHaveBeenCalled();
  });
});
