import {describe, expect, it} from "vitest";
import {emptyPlaceContext, placeRecommendationContextSchema, placeRecommendationContextWriteSchema} from "../../../shared/explorersPlaceContract";

// WP6 Task 6-3: people are recommended in the People category. Existing person rows inside
// Places stay readable, but no new write may create or restate one.
describe("place recommendation type 'person'", () => {
  const person = {...emptyPlaceContext(), recommendationType: "person" as const, personAddress: "Lisbon"};

  it("is refused on writes with a pointer to the People category", () => {
    const parsed = placeRecommendationContextWriteSchema.safeParse(person);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.map(i => i.message)).toContain("Recommend people in the People category");
  });

  it("still accepts an ordinary place write", () => {
    expect(placeRecommendationContextWriteSchema.safeParse(emptyPlaceContext()).success).toBe(true);
  });

  it("keeps existing person rows readable", () => {
    expect(placeRecommendationContextSchema.safeParse(person).success).toBe(true);
  });
});
