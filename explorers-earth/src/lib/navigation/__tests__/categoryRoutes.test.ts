import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_ROUTES, addItemPath, categoryPath, listPath } from "../categoryRoutes";

const routesSource = readFileSync(resolve(__dirname, "../../../routes/ProtectedRoutes.tsx"), "utf8");

describe("category route table", () => {
  it("covers exactly the seven non-Places categories", () => {
    expect(CATEGORY_ROUTES.map(c => c.key)).toEqual(["movies", "books", "games", "apps", "products", "people", "guides"]);
  });

  it.each(CATEGORY_ROUTES.map(c => [c.key, c] as const))("%s list/add routes are registered", (_key, c) => {
    expect(routesSource).toContain(`path="recommendations/${c.key}"`);
    expect(routesSource).toContain(`path="recommendations/${c.key}/${c.listParam}"`);
    if (c.addSuffix) expect(routesSource).toContain(`path="recommendations/${c.key}/${c.listParam}/${c.addSuffix}"`);
  });

  it("builds encoded paths", () => {
    expect(categoryPath("movies")).toBe("/recommendations/movies");
    expect(listPath("books", "a b/c")).toBe("/recommendations/books/a%20b%2Fc");
    expect(addItemPath("people", "p1")).toBe("/recommendations/people/p1/add");
    expect(addItemPath("guides", "g1")).toBe("/recommendations/guides/g1/sections/new");
  });
});
