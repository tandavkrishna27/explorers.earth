import { describe, expect, it } from "vitest";
import { accountDtoSchema } from "../../shared/explorersContract";
import { ExplorersAccountRepository, isAcceptedCategorySet } from "../repositories/explorersAccountRepository";

/**
 * P3-6. The owner read parses the repository's DTO through accountDtoSchema, and after
 * 0057 the schema no longer knows "music". A row or presentation value the migration
 * missed must degrade, not 503 that owner's /me. The 0057 CHECK now refuses a music row,
 * so this drives get() with a stub query rather than a database.
 */
const accountId = "11111111-1111-4111-8111-111111111111";

function stubQuery(themeSettings: unknown) {
  return {
    query: async (text: string) => {
      if (text.includes("FROM creator_accounts")) return { rows: [{
        id: accountId, handle: "owner", display_name: "Owner", account_type: "Personal", onboarding_status: "complete",
        status: "active", revision: "3", public_profile: true, auto_pinning: false, locale: "en", mobile_number: null,
        mobile_number_visible: false, bio_plain: null, bio_rich: null, primary_address: null, additional_addresses: [],
        public_address: null, profile_place_details: null,
      }] };
      if (text.includes("FROM account_category_settings")) return { rows: [
        { category: "places", is_public: true, display_order: 0, pinned_order: null },
        { category: "music", is_public: true, display_order: 1, pinned_order: 0 },
        { category: "books", is_public: false, display_order: 2, pinned_order: null },
      ] };
      if (text.includes("FROM account_presentation")) return { rows: [{ theme_settings: themeSettings, social_links: [], business_details: {} }] };
      return { rows: [] };
    },
  };
}

describe("account read after the music category is retired", () => {
  it("reads an account carrying a retired category row and order entry without throwing", async () => {
    const repository = new ExplorersAccountRepository({} as never);
    const dto = await repository.get(accountId, stubQuery({
      landingTab: "music", recommendations: { layout: "grid", categoryOrder: ["books", "music", "places"] },
    }) as never);
    const parsed = accountDtoSchema.parse(dto);
    expect(parsed.categories.map((row) => row.category)).toEqual(["places", "books"]);
    expect(parsed.themeSettings.recommendations?.categoryOrder).toEqual(["books", "places"]);
    // The stale first view degrades to the default (absent) rather than failing the read.
    expect(parsed.themeSettings.landingTab).toBeUndefined();
  });

  it("passes theme settings without a category order through unchanged", async () => {
    const repository = new ExplorersAccountRepository({} as never);
    const dto = await repository.get(accountId, stubQuery({ preset: "neon-cyber" }) as never);
    expect(dto.themeSettings).toEqual({ preset: "neon-cyber" });
  });

  it("accepts the eight-category set and the nine-category set a pre-0057 tab echoes, and nothing else", () => {
    const eight = ["places", "guides", "movies", "books", "games", "apps", "products", "people"];
    expect(isAcceptedCategorySet(eight)).toBe(true);
    expect(isAcceptedCategorySet([...eight, "music"])).toBe(true);
    expect(isAcceptedCategorySet(eight.slice(1))).toBe(false);
    expect(isAcceptedCategorySet([...eight, "places"])).toBe(false);
    expect(isAcceptedCategorySet([...eight.slice(1), "music"])).toBe(false);
  });
});
