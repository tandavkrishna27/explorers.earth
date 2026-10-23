import { describe, expect, it } from "vitest";
import { PLACE_LIST_PARAM, placeListPath } from "../placeListRoute";

// OWN-05. The open Places list lives in the URL, so every return path can name it.
describe("placeListPath", () => {
  it("names the list in the query", () => {
    expect(PLACE_LIST_PARAM).toBe("list");
    expect(placeListPath("location-a")).toBe("/recommendations/places?list=location-a");
  });
  it("encodes the id", () => {
    expect(placeListPath("a b/c")).toBe("/recommendations/places?list=a%20b%2Fc");
  });
  it("falls back to the category page without an id", () => {
    expect(placeListPath(undefined)).toBe("/recommendations/places");
    expect(placeListPath("")).toBe("/recommendations/places");
  });
});
