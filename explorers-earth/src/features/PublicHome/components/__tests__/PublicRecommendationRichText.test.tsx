import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendedBook } from "../../../Books/types";
import BookDetailModal from "../../../Books/components/public/BookDetailModal";
import type { RecommendedGame } from "../../../Games/types";
import GameDetailModal from "../../../Games/components/public/GameDetailModal";
import type { RecommendedMovie } from "../../../Movies/types";
import MovieDetailModal from "../../../Movies/components/public/MovieDetailModal";
import type { RecommendedPerson } from "../../../People/types";
import PersonDetailModal from "../../../People/components/public/PersonDetailModal";
import Overview from "../PlaceDetails/Details/Overview";
import Address from "../PlaceDetails/Details/Address";

const getCurrentLocation = vi.hoisted(() => vi.fn());

vi.mock("../../../../components/ui/MediaViewer", () => ({
  default: () => null,
}));

vi.mock("../../../../components/ui/MediaPreviewGrid", () => ({
  default: () => null,
}));

vi.mock("../../../../components/YoutubeEmbed", () => ({
  default: () => null,
}));

vi.mock("../../../../hooks/useMediaViewer", () => ({
  convertToMediaItems: () => [],
  useMediaViewer: () => ({
    isOpen: false,
    currentIndex: 0,
    openViewer: vi.fn(),
    closeViewer: vi.fn(),
  }),
}));

vi.mock("../../../../utils/getCurrentLocation", () => ({
  getCurrentLocation,
}));

const unsafeRichText = [
  '<p>Safe <strong>Quill bold</strong> <em>Quill emphasis</em> ',
  '<a href="https://trusted.example/note">Trusted note</a></p>',
  "<ul><li>Quill list item</li></ul>",
  '<img src="x" onerror="window.__publicNoteXss=\'image\'">',
  '<svg onload="window.__publicNoteXss=\'svg\'"></svg>',
  '<script>window.__publicNoteXss="script"</script>',
  '<a href="javascript:window.__publicNoteXss=\'link\'">Unsafe note link</a>',
].join("");

const structuredUnsafeRichText = [
  {
    type: "paragraph",
    children: [{ type: "text", text: unsafeRichText }],
  },
];

const baseGame = {
  documentId: "game-1",
  igdb_id: 1,
  title: "Fixture game",
  cover_url: null,
  cover_url_large: null,
  screenshot_ids: [],
  media_details: null,
  genres: [],
  platforms: [],
  Media: [],
  game_list: null,
};

const baseBook = {
  documentId: "book-1",
  volume_id: "volume-1",
  title: "Fixture book",
  authors: ["Fixture author"],
  cover_url: null,
  cover_url_large: null,
  subjects: [],
  buy_links: [],
  media_details: null,
  Media: [],
  book_list: null,
};

const basePerson = {
  documentId: "person-1",
  name: "Fixture person",
  avatar_path: null,
  media_details: null,
  social_urls: {},
  skills_tags: [],
  Media: [],
  person_list: null,
};

const baseMovie = {
  documentId: "movie-1",
  tmdb_id: "1",
  media_type: "Movie",
  title: "Fixture movie",
  poster_path: null,
  backdrop_path: null,
  genres: [],
  watch_providers: [],
  media_details: null,
  Media: [],
  movie_list: null,
};

type PublicNoteFixture = {
  name: string;
  renderFixture: () => ReturnType<typeof render>;
};

const fixtures: PublicNoteFixture[] = [
  {
    name: "game modal string note",
    renderFixture: () =>
      render(
        <GameDetailModal
          game={{
            ...baseGame,
            user_recommendation_note: unsafeRichText,
          } as RecommendedGame}
          open
          onClose={vi.fn()}
        />,
      ),
  },
  {
    name: "book modal structured note",
    renderFixture: () =>
      render(
        <BookDetailModal
          book={{
            ...baseBook,
            user_recommendation_note: structuredUnsafeRichText,
          } as RecommendedBook}
          open
          onClose={vi.fn()}
        />,
      ),
  },
  {
    name: "person modal string note",
    renderFixture: () =>
      render(
        <PersonDetailModal
          person={{
            ...basePerson,
            user_recommendation_note: unsafeRichText,
          } as unknown as RecommendedPerson}
          open
          onClose={vi.fn()}
        />,
      ),
  },
  {
    name: "movie modal structured child note",
    renderFixture: () =>
      render(
        <MovieDetailModal
          movie={{
            ...baseMovie,
            user_recommendation_note: structuredUnsafeRichText,
          } as RecommendedMovie}
          open
          onClose={vi.fn()}
        />,
      ),
  },
  {
    name: "place overview note beside social media",
    renderFixture: () =>
      render(
        <Overview
          fetchedPlace={{
            Place_Details: {},
            Users_Social_URL: "https://www.youtube.com/watch?v=test",
            user_recommendation_note: unsafeRichText,
          }}
        />,
      ),
  },
  {
    name: "place overview standalone note",
    renderFixture: () =>
      render(
        <Overview
          fetchedPlace={{
            Place_Details: {},
            user_recommendation_note: unsafeRichText,
          }}
        />,
      ),
  },
];

describe("public recommendation rich text render boundaries", () => {
  beforeEach(() => {
    getCurrentLocation.mockReset();
    getCurrentLocation.mockResolvedValue(null);
  });

  it.each(fixtures)("sanitizes $name while preserving safe Quill markup", ({ renderFixture }) => {
    const { container } = renderFixture();

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("[onerror]")).not.toBeInTheDocument();
    expect(container.querySelector("[onload]")).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="javascript:"]')).not.toBeInTheDocument();

    expect(screen.getByText("Quill bold").tagName).toBe("STRONG");
    expect(screen.getByText("Quill emphasis").tagName).toBe("EM");
    expect(screen.getByText("Quill list item").tagName).toBe("LI");
    expect(screen.getByRole("link", { name: "Trusted note" })).toHaveAttribute(
      "href",
      "https://trusted.example/note",
    );
    expect(screen.getByRole("link", { name: "Trusted note" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByText("Unsafe note link")).not.toHaveAttribute("href");
  });
});

describe("public place directions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getCurrentLocation.mockReset();
    getCurrentLocation.mockResolvedValue(null);
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("omits viewer origin when browser geolocation is unavailable", () => {
    render(
      <Overview
        fetchedPlace={{
          Place_Details: { Geometry: { lat: 17.385, lng: 78.4867 } },
        }}
      />,
    );

    fireEvent.click(screen.getAllByRole("button")[0]);

    expect(window.open).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/?api=1&destination=17.385%2C78.4867&travelmode=driving",
      "_blank",
    );
  });

  it("keeps the Place detail usable when browser geolocation is denied", async () => {
    getCurrentLocation.mockRejectedValueOnce(new Error("GeolocationPositionError"));
    render(
      <Overview
        fetchedPlace={{
          Place_Details: { Geometry: { lat: 17.385, lng: 78.4867 } },
        }}
      />,
    );

    await waitFor(() => expect(getCurrentLocation).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button")[0]);

    expect(window.open).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/?api=1&destination=17.385%2C78.4867&travelmode=driving",
      "_blank",
    );
  });

  it("does not open directions without a finite destination", () => {
    render(<Overview fetchedPlace={{ Place_Details: {} }} />);

    fireEvent.click(screen.getAllByRole("button")[0]);

    expect(window.open).not.toHaveBeenCalled();
  });

  it("includes an available viewer origin using an encoded Maps URL", async () => {
    getCurrentLocation.mockResolvedValue({ latitude: 12.9716, longitude: 77.5946 });
    render(
      <Overview
        fetchedPlace={{
          Place_Details: { Geometry: { lat: 17.385, lng: 78.4867 } },
        }}
      />,
    );
    await waitFor(() => expect(getCurrentLocation).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("button")[0]);

    expect(window.open).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/?api=1&destination=17.385%2C78.4867&travelmode=driving&origin=12.9716%2C77.5946",
      "_blank",
    );
  });

  it("removes the Address link target when destination coordinates are invalid", () => {
    render(
      <Address
        address="Unknown destination"
        placeCoordinates={{ lat: Number.NaN, lng: Number.NaN }}
      />,
    );

    expect(screen.getByText("Unknown destination")).not.toHaveAttribute("href");
  });
});
