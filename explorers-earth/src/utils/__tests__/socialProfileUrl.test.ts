import { describe, expect, it } from "vitest";
import { normalizeRecommendationLink, normalizeSocialProfileUrl } from "../url";
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

// OWN-11. "Recommended by" on a place takes a handle, a profile URL or any web link, and
// the stored creatorSocialUrl must be a full http(s) URL.
describe("normalizeRecommendationLink", () => {
  it.each([
    ["@explorer.one", "https://www.instagram.com/explorer.one"],
    ["instagram.com/explorer", "https://instagram.com/explorer"],
    ["linkedin.com/in/jane-doe", "https://linkedin.com/in/jane-doe"],
    ["https://example.com/blog/post", "https://example.com/blog/post"],
    ["http://example.com", "http://example.com"],
    ["  https://example.com/x  ", "https://example.com/x"],
  ])("turns %j into %j", (input, expected) => {
    expect(normalizeRecommendationLink(input)).toBe(expected);
  });

  it.each(["", "   ", "not a link!", "example.com/path", "ftp://example.com", "javascript:alert(1)"])(
    "refuses %j", (input) => {
      expect(normalizeRecommendationLink(input)).toBeUndefined();
    });
});

// OWN-11. A place saved with a handle in "Recommended by" must pass the real contract.
describe("place recommendationContext creatorSocialUrl", () => {
  it.each([
    ["@explorer.one", "https://www.instagram.com/explorer.one"],
    ["instagram.com/x", "https://instagram.com/x"],
    ["https://example.com/blog", "https://example.com/blog"],
  ])("stores %j as %j and passes the contract", (link, expected) => {
    const context = recommendationContext({ recommendationLink: link, address: "Somewhere" }, { recommendationType: "place", source: "self" });
    expect(context.creatorSocialUrl).toBe(expected);
    expect(placeRecommendationContextSchema.safeParse(context).success).toBe(true);
  });

  it("keeps an existing creatorSocialUrl when the field is blank", () => {
    const existing = recommendationContext({ recommendationLink: "@kept" }, { recommendationType: "place", source: "self" });
    const edited = recommendationContext({ recommendationLink: "  " }, { recommendationType: "place", source: "self", existing });
    expect(edited.creatorSocialUrl).toBe("https://www.instagram.com/kept");
  });
});
