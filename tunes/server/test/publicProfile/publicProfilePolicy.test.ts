import { describe, expect, it } from "vitest";
import { canReadPublicCategory, parsePublicCategory } from "../../publicProfile/publicProfilePolicy";

describe("public profile category policy", () => {
  it.each(["places", "movies", "books", "games", "guides", "apps", "products", "people"])("accepts %s", (category) => {
    expect(parsePublicCategory(category)).toBe(category);
  });

  it.each(["spaces", "music", "Apps", "../apps", ""])("rejects invalid category %j", (category) => {
    expect(() => parsePublicCategory(category)).toThrow("PUBLIC_CATEGORY_INVALID");
  });

  it("requires the profile and requested category to be public", () => {
    expect(canReadPublicCategory({ public_profile: "Yes", public_apps: "No" }, "apps")).toBe(false);
    expect(canReadPublicCategory({ public_profile: "No", public_apps: "Yes" }, "apps")).toBe(false);
    expect(canReadPublicCategory({ public_profile: "Yes", public_apps: "Yes" }, "apps")).toBe(true);
  });
});
