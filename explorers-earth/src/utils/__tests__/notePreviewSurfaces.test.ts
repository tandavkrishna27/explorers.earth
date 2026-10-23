import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { notePreviewText } from "../notePreviewText";

// Notes are stored as HTML. A preview that only strips tags shows entities such as &nbsp;
// literally, so every surface that previews a note or description goes through
// notePreviewText instead of its own tag-stripping regex.
const surfaces = [
  "features/shared/list/adapters/books.ts",
  "features/shared/list/adapters/people.ts",
  "features/shared/list/adapters/products.ts",
  "features/shared/list/adapters/apps.ts",
  "features/Books/components/public/TopReadsHero.tsx",
  "features/PublicHome/components/PublicHome.tsx",
  // Places (Favorites/components/Recommendations.tsx) previewed only the descriptions of the
  // linked People/Products lists, which WP10 retired; its place cards show no note preview.
  "features/shared/list/adapters/games.ts",
  "features/shared/list/adapters/movies.ts",
  // The *Home.tsx category pages render the shared template (WP3A), which shows no note previews.
  "features/People/components/public/PersonCarouselRow.tsx",
  "features/Products/components/public/ProductCarouselRow.tsx",
  "features/AppsAndTools/components/public/AppCarouselRow.tsx",
];

describe("note previews", () => {
  it("decodes entities and drops tags", () => {
    expect(notePreviewText("<p>Great&nbsp;read</p><p>&amp; more</p>")).toBe("Great read & more");
  });

  it.each(surfaces)("%s previews notes with notePreviewText", (file) => {
    const source = readFileSync(resolve(__dirname, "../..", file), "utf8");
    expect(source).toContain("notePreviewText(");
    expect(source).not.toMatch(/\.replace\(\/<\[\^>\]/);
  });
});
