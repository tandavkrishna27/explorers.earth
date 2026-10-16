import { describe, it, expect } from "vitest";
import { toNumberOrNull, placeFacts } from "../hooks/useAddRecommendation";

describe("toNumberOrNull", () => {
  it("keeps finite numbers, including 0", () => {
    expect(toNumberOrNull(4.2)).toBe(4.2);
    expect(toNumberOrNull(0)).toBe(0);
  });

  it("maps undefined/null/empty-string/numeric-string to null (never persist strings)", () => {
    expect(toNumberOrNull(undefined)).toBeNull();
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull("")).toBeNull();
    expect(toNumberOrNull("8.8")).toBeNull();
  });

  it("maps non-finite numbers to null", () => {
    expect(toNumberOrNull(NaN)).toBeNull();
    expect(toNumberOrNull(Infinity)).toBeNull();
  });
});

describe("the provider rating reaches storage as a number or not at all", () => {
  // The crash this guards against was a persisted string: the public render called
  // value.toFixed on it. There is now one place the facts are built, for both the create
  // and the edit path, so the two can no longer drift apart.
  it("keeps a numeric rating and count, including zero", () => {
    const facts = placeFacts({ provider: { rating: 0, userRatingCount: 0 } });
    expect(facts.providerRating).toBe(0);
    expect(facts.ratingsCount).toBe(0);
  });

  it("drops a string, an empty string and a non-finite value rather than storing it", () => {
    for (const bad of ["8.8", "", null, undefined, NaN, Infinity]) {
      const facts = placeFacts({ provider: { rating: bad, userRatingCount: bad } });
      expect(facts.providerRating).toBeNull();
      expect(facts.ratingsCount).toBeNull();
    }
  });

  it("falls back to the picked place's own rating, still as a number or null", () => {
    expect(placeFacts({ places: { rating: 4.2 } as never }).providerRating).toBe(4.2);
    expect(placeFacts({ places: { rating: "4.2" } as never }).providerRating).toBeNull();
  });
});
