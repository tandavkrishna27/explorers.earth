import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecommendedBook } from "../../../Books/types";
import BookDetailModal from "../../../Books/components/public/BookDetailModal";
import type { RecommendedGame } from "../../../Games/types";
import GameDetailModal from "../../../Games/components/public/GameDetailModal";
import type { RecommendedMovie } from "../../../Movies/types";
import MovieDetailModal from "../../../Movies/components/public/MovieDetailModal";
import type { RecommendedPerson } from "../../../People/types";
import PersonDetailModal from "../../../People/components/public/PersonDetailModal";
import Overview from "../PlaceDetails/Details/Overview";

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
  getCurrentLocation: vi.fn().mockResolvedValue(null),
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
