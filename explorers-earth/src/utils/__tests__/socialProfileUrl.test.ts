import { describe, expect, it } from "vitest";
import { normalizeSocialProfileUrl } from "../url";
import { recommendationContext } from "../../features/Favorites/hooks/useAddRecommendation";
import { placeRecommendationContextSchema } from "../../../../tunes/shared/explorersPlaceContract";

// PLC-05. The person form's placeholder offers "@username" and "instagram.com/username",
// but the stored context requires a full URL, so those failed a schema the owner never saw.
describe("normalizeSocialProfileUrl", () => {
  it.each([
    ["@explorer.one", "https://www.instagram.com/explorer.one"],
    ["explorer_one", "https://www.instagram.com/explorer_one"],
    ["instagram.com/explorer", "https://instagram.com/explorer"],
    ["www.instagram.com/explorer/", "https://www.instagram.com/explorer/"],
    ["http://instagram.com/explorer", "https://instagram.com/explorer"],
    ["linkedin.com/in/jane-doe", "https://linkedin.com/in/jane-doe"],
    ["https://www.linkedin.com/company/acme", "https://www.linkedin.com/company/acme"],
    ["  @trimmed  ", "https://www.instagram.com/trimmed"],
  ])("turns %j into %j", (input, expected) => {
    expect(normalizeSocialProfileUrl(input)).toBe(expected);
  });

  it.each(["", "   ", "not a handle!", "facebook.com/x", "linkedin.com/feed", "@a..b", "javascript:alert(1)"])(
    "refuses %j", input => {
      expect(normalizeSocialProfileUrl(input)).toBeUndefined();
    });
});

describe("person recommendation context", () => {
  it.each(["@explorer", "instagram.com/explorer", "linkedin.com/in/jane"])("stores %j as a URL the contract accepts", value => {
    const context = recommendationContext({ recommendation: value } as never, { recommendationType: "person", source: "self" } as never);
    expect(context.personProfileUrl).toMatch(/^https:\/\//);
    expect(() => placeRecommendationContextSchema.parse(context)).not.toThrow();
  });
});
