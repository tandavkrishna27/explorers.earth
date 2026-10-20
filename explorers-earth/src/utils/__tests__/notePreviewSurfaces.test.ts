import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { notePreviewText } from "../notePreviewText";

// Notes are stored as HTML. A preview that only strips tags shows entities such as &nbsp;
// literally, so every surface that previews a note or description goes through
// notePreviewText instead of its own tag-stripping regex.
const surfaces = [
  "features/Books/components/dashboard/BookListView.tsx",
  "features/People/components/dashboard/PersonListView.tsx",
  "features/Products/components/dashboard/ProductListView.tsx",
  "features/AppsAndTools/components/dashboard/AppListView.tsx",
  "features/Books/components/public/TopReadsHero.tsx",
  "features/PublicHome/components/PublicHome.tsx",
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
