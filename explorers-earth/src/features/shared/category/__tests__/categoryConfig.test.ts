import { describe, expect, it } from "vitest";
import { CATEGORY_CONFIG, CATEGORY_KEYS } from "../categoryConfig";

describe("CATEGORY_CONFIG", () => {
  it("covers all 8 categories", () => {
    expect(CATEGORY_KEYS).toEqual(["places", "movies", "books", "games", "apps", "products", "people", "guides"]);
  });
  it("uses item pins (limit 15) for the six item categories and list pins (limit 5) for places and guides", () => {
    for (const key of ["movies", "books", "games", "apps", "products", "people"] as const) {
      expect(CATEGORY_CONFIG[key]).toMatchObject({ topPicks: "items", pinLimit: 15 });
    }
    expect(CATEGORY_CONFIG.places).toMatchObject({ topPicks: "lists", pinLimit: 5 });
    expect(CATEGORY_CONFIG.guides).toMatchObject({ topPicks: "lists", pinLimit: 5 });
  });
  it("maps profile visibility fields and list routes", () => {
    expect(CATEGORY_CONFIG.movies.visibilityField).toBe("public_movie");
    expect(CATEGORY_CONFIG.places.visibilityField).toBe("public_recommendations");
    expect(CATEGORY_CONFIG.books.listRoute("abc")).toBe("/recommendations/books/abc");
    expect(CATEGORY_CONFIG.guides.listRoute("g1")).toBe("/guides/g1");
    expect(CATEGORY_CONFIG.places.listRoute("p1")).toBe("/recommendations/places?list=p1");
  });
});
