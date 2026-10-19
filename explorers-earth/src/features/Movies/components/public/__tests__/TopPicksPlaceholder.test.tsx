import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TopPicksHero from "../TopPicksHero";
import TopPicksMobileHero from "../TopPicksMobileHero";
import { FALLBACK_POSTER } from "../../../utils/moviePoster";

const movie = { documentId: "m1", title: "No Poster", poster_path: null, backdrop_path: null, genres: [], runtime: null, year: "2020" } as never;

describe("Top Picks heroes for a movie without artwork", () => {
  it("uses the shared placeholder instead of a remote image", () => {
    for (const ui of [
      <TopPicksHero movies={[movie]} onMovieClick={vi.fn()} />,
      <TopPicksMobileHero movies={[movie]} onMovieClick={vi.fn()} />,
    ]) {
      const { container, unmount } = render(ui);
      const sources = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.every((src) => src === FALLBACK_POSTER)).toBe(true);
      unmount();
    }
  });
});
