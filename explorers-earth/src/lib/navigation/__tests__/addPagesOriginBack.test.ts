import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = resolve(__dirname, "../../..");
const pages = [
  ["features/Books/components/dashboard/AddBookPage.tsx", "books"],
  ["features/Games/components/dashboard/AddGamePage.tsx", "games"],
  ["features/AppsAndTools/components/dashboard/AddAppPage.tsx", "apps"],
  ["features/Products/components/dashboard/AddProductPage.tsx", "products"],
  ["features/People/components/dashboard/AddPersonPage.tsx", "people"],
  ["features/Movies/components/dashboard/AddMoviePage.tsx", "movies"],
] as const;

describe("add pages return to their origin", () => {
  it.each(pages)("%s uses useOriginBack and never hard-codes its list as the Back target", (file, category) => {
    const text = readFileSync(resolve(src, file), "utf8");
    expect(text).toContain("useOriginBack(");
    expect(text).not.toMatch(new RegExp("navigate\\(`/recommendations/" + category + "/\\$\\{listId\\}`"));
  });
});
