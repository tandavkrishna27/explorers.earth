import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Outlet, Routes } from "react-router-dom";
import PublicRoutes from "../PublicRoutes";

vi.mock("../validators", () => ({
  UsernameValidator: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../validators/TabVisibilityGuard", () => ({
  default: ({
    children,
    tabField,
  }: {
    children: React.ReactNode;
    tabField: string;
  }) => <section data-testid={`visibility-${tabField}`}>{children}</section>,
}));

vi.mock("../../layouts/PublicLayout", () => ({
  default: () => <Outlet />,
}));

vi.mock("../../features/PublicHome/components/PublicProfile", () => ({
  default: () => <div>public-profile</div>,
}));
vi.mock("../../pages/public/PublicHomePage", () => ({
  default: () => <div>places-index</div>,
}));
vi.mock("../../features/PublicHome/components/Community", () => ({
  default: () => <div>community</div>,
}));
vi.mock("../../features/PublicHome/components/MapView", () => ({
  default: () => <div>places-map</div>,
}));
vi.mock("../../features/PublicHome/components/PlaceMapView", () => ({
  default: () => <div>place-map</div>,
}));
vi.mock("../../pages/public/PublicMusic", () => ({
  default: () => <div>music</div>,
}));
vi.mock("../../features/PublicHome/components/PublicGuides", () => ({
  default: () => <div>guides-index</div>,
}));
vi.mock("../../features/PublicHome/components/PublicGuideDetailPage", () => ({
  default: () => <div>guide-detail</div>,
}));
vi.mock("../../features/Movies", () => ({
  PublicMovies: () => <div>movies-index</div>,
  PublicMovieList: () => <div>movie-list</div>,
  PublicMovieGenre: () => <div>movie-genre</div>,
}));
vi.mock("../../features/Books", () => ({
  PublicBooks: () => <div>books-index</div>,
  PublicBookList: () => <div>book-list</div>,
  PublicBookSubject: () => <div>book-subject</div>,
}));
vi.mock("../../features/Games", () => ({
  PublicGames: () => <div>games-index</div>,
  PublicGamesList: () => <div>game-list</div>,
  PublicGamesGenre: () => <div>game-genre</div>,
}));
vi.mock("../../features/AppsAndTools", () => ({
  PublicApps: () => <div>apps-index</div>,
  PublicAppList: () => <div>app-list</div>,
}));
vi.mock("../../features/Products", () => ({
  PublicProducts: () => <div>products-index</div>,
  PublicProductList: () => <div>product-list</div>,
}));
vi.mock("../../features/People", () => ({
  PublicPeople: () => <div>people-index</div>,
  PublicPersonList: () => <div>person-list</div>,
  PublicPersonSector: () => <div>person-sector</div>,
}));

const cases = [
  ["/tk2727/music", "public_music", "music"],
  ["/tk2727/places", "public_recommendations", "places-index"],
  ["/tk2727/places/paris", "public_recommendations", "places-index"],
  ["/tk2727/places/map", "public_recommendations", "places-map"],
  ["/tk2727/places/paris/map", "public_recommendations", "places-map"],
  ["/tk2727/places/paris/placesmap", "public_recommendations", "place-map"],
  ["/tk2727/guides", "public_guides", "guides-index"],
  ["/tk2727/guides/weekend", "public_guides", "guide-detail"],
  ["/tk2727/movies", "public_movie", "movies-index"],
  ["/tk2727/movies/genre/drama", "public_movie", "movie-genre"],
  ["/tk2727/movies/favorites", "public_movie", "movie-list"],
  ["/tk2727/books", "public_books", "books-index"],
  ["/tk2727/books/subject/design", "public_books", "book-subject"],
  ["/tk2727/books/reading-list", "public_books", "book-list"],
  ["/tk2727/games", "public_games", "games-index"],
  ["/tk2727/games/genre/puzzle", "public_games", "game-genre"],
  ["/tk2727/games/co-op", "public_games", "game-list"],
  ["/tk2727/apps", "public_apps", "apps-index"],
  ["/tk2727/apps/productivity", "public_apps", "app-list"],
  ["/tk2727/products", "public_products", "products-index"],
  ["/tk2727/products/gear", "public_products", "product-list"],
  ["/tk2727/people", "public_people", "people-index"],
  ["/tk2727/people/sector/technology", "public_people", "person-sector"],
  ["/tk2727/people/founders", "public_people", "person-list"],
] as const;

describe("PublicRoutes category visibility boundaries", () => {
  it.each(cases)(
    "guards %s with %s before rendering %s",
    (path, visibilityField, leafText) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>{PublicRoutes}</Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText(leafText)).toBeInTheDocument();
      expect(
        screen.getByTestId(`visibility-${visibilityField}`),
      ).toContainElement(screen.getByText(leafText));
    },
  );

  it("redirects an unknown public-profile child path to the username root", async () => {
    render(
      <MemoryRouter initialEntries={["/tk2727/not-a-real-category"]}>
        <Routes>{PublicRoutes}</Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("public-profile")).toBeInTheDocument();
  });
});
