import { describe, expect, it } from "vitest";
import { COVER_CATEGORIES, GENERIC_MEDIA_CATEGORIES } from "../../repositories/mediaRepository";
import { contentCategorySchema, recommendationCategorySchema } from "../../../shared/explorersContract";

/**
 * The cover list in isPublicAttachment grew by accretion and three categories were never
 * appended, so an owner could set a list cover the public got a 404 on. These two
 * assertions turn that class of drift into an instant failure rather than something a
 * reviewer has to notice.
 */
describe("media visibility category lists", () => {
  it("admits a cover for every category that can own a collection", () => {
    // Any category with a collection can carry a cover, and every projection emits it, so
    // this list is not a judgement call - it is the enum.
    expect([...COVER_CATEGORIES].sort()).toEqual([...contentCategorySchema.options].sort());
  });

  it("admits generic recommendation media only where a projection reads it", () => {
    // Deliberately a subset, so it is pinned by exact membership rather than to an enum.
    // Each exclusion has a reason:
    //   guides - has no recommendations rows at all, only sections and a cover
    //   apps   - recommendation_app_screenshots, matched by required_category
    //   places - recommendation_place_photos, matched by required_category
    // Admitting either typed category here would publish an upload that no public
    // projection references.
    expect([...GENERIC_MEDIA_CATEGORIES].sort()).toEqual(["books", "games", "movies", "people", "products"]);
    const excluded = recommendationCategorySchema.options.filter(category => !GENERIC_MEDIA_CATEGORIES.includes(category as never));
    expect([...excluded].sort()).toEqual(["apps", "places"]);
  });

  it("never admits a category for generic media that cannot hold a recommendation", () => {
    for (const category of GENERIC_MEDIA_CATEGORIES) expect(recommendationCategorySchema.options).toContain(category);
  });
});
