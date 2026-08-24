import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECOMMENDATIONS_PRESENTATION,
  RECOMMENDATION_CATEGORY_METADATA,
  getPreferredRecommendationCategory,
  isRecommendationCategoryVisible,
  mergeSocialMediaWire,
  mergeThemeSettingsWire,
  normalizeRecommendationsPresentation,
  normalizeThemeSettings,
  orderEligibleRecommendationCategoryIds,
  resolveInitialPublicProfileTab,
} from "../recommendationsPresentation";
import {
  RECOMMENDATION_CATEGORY_IDS,
  type RecommendationCategoryId,
} from "../../types/themeTypes";

describe("normalizeRecommendationsPresentation", () => {
  it("uses complete defaults for a profile without presentation settings", () => {
    expect(normalizeRecommendationsPresentation(undefined)).toEqual({
      layout: "shelves",
      categoryOrder: [
        "places",
        "music",
        "movies",
        "books",
        "games",
        "guides",
        "apps",
        "products",
        "people",
      ],
    });
    expect(DEFAULT_RECOMMENDATIONS_PRESENTATION).toEqual({
      layout: "shelves",
      categoryOrder: [
        "places",
        "music",
        "movies",
        "books",
        "games",
        "guides",
        "apps",
        "products",
        "people",
      ],
    });
  });

  it("drops unknown and duplicate IDs then appends missing IDs", () => {
    expect(
      normalizeRecommendationsPresentation({
        layout: "grid",
        categoryOrder: ["music", "music", "unknown", "books"],
      }),
    ).toEqual({
      layout: "grid",
      categoryOrder: [
        "music",
        "books",
        "places",
        "movies",
        "games",
        "guides",
        "apps",
        "products",
        "people",
      ],
    });
  });

  it.each([null, false, 7, "featured", [], { layout: "carousel" }])(
    "falls back safely for malformed input %#",
    (value) => {
      expect(normalizeRecommendationsPresentation(value).layout).toBe("shelves");
    },
  );
});

describe("lossless theme settings merging", () => {
  it("preserves unknown keys at social, theme, and recommendations levels", () => {
    const merged = mergeSocialMediaWire(
      {
        futureSocial: { keep: true },
        localTunes: ["still-here"],
        theme_settings: {
          futureTheme: "keep",
          wallpaperUrl: "/old-cover.jpg",
          recommendations: {
            layout: "grid",
            futureRecommendation: 7,
            categoryOrder: ["places"],
          },
        },
      },
      {
        preset: "minimal-light",
        recommendations: {
          layout: "featured",
          categoryOrder: [
            "music",
            "places",
            "movies",
            "books",
            "games",
            "guides",
            "apps",
            "products",
            "people",
          ],
        },
      },
    );

    expect(merged).toEqual({
      futureSocial: { keep: true },
      localTunes: ["still-here"],
      theme_settings: {
        futureTheme: "keep",
        wallpaperUrl: "/old-cover.jpg",
        preset: "minimal-light",
        recommendations: {
          layout: "featured",
          futureRecommendation: 7,
          categoryOrder: [
            "music",
            "places",
            "movies",
            "books",
            "games",
            "guides",
            "apps",
            "products",
            "people",
          ],
        },
      },
    });
  });

  it("builds a safe wire object from malformed persisted values", () => {
    expect(
      mergeThemeSettingsWire("not-an-object", {
        wallpaperMode: "solid-color",
      }),
    ).toEqual({ wallpaperMode: "solid-color" });

    expect(
      mergeSocialMediaWire(null, {
        landingTab: "gallery",
      }),
    ).toEqual({ theme_settings: { landingTab: "gallery" } });
  });
});

describe("normalizeThemeSettings", () => {
  it("normalizes malformed known fields without copying them into rendering", () => {
    expect(
      normalizeThemeSettings({
        preset: "future-theme",
        wallpaperMode: "parallax",
        wallpaperUrl: 42,
        accentColor: "url(javascript:bad)",
        customTextColor: { bad: true },
        landingTab: "mystery",
        visibleTabs: "all",
        footerBranding: "loud",
        recommendations: {
          layout: "carousel",
          categoryOrder: ["people", "people", "missing"],
        },
      }),
    ).toEqual({
      preset: "cinematic-dark",
      wallpaperMode: "banner-top",
      wallpaperUrl: "",
      accentColor: "#10B981",
      customTextColor: "",
      landingTab: "all-recommendations",
      visibleTabs: {
        recommendations: true,
        gallery: true,
        business: true,
      },
      footerBranding: "enabled",
      recommendations: {
        layout: "shelves",
        categoryOrder: [
          "people",
          "places",
          "music",
          "movies",
          "books",
          "games",
          "guides",
          "apps",
          "products",
        ],
      },
    });
  });

  it("uses a valid preset's default accent when the saved accent is invalid", () => {
    expect(
      normalizeThemeSettings({
        preset: "glassmorphism",
        accentColor: "definitely-not-a-color",
      }).accentColor,
    ).toBe("#38BDF8");
  });
});

describe("recommendation category visibility", () => {
  const expectedFields: Record<RecommendationCategoryId, string> = {
    places: "public_recommendations",
    music: "public_music",
    movies: "public_movie",
    books: "public_books",
    games: "public_games",
    guides: "public_guides",
    apps: "public_apps",
    products: "public_products",
    people: "public_people",
  };

  it("uses one canonical metadata entry for every category", () => {
    expect(RECOMMENDATION_CATEGORY_METADATA.map(({ id }) => id)).toEqual([
      "places",
      "music",
      "movies",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
    ]);
    for (const metadata of RECOMMENDATION_CATEGORY_METADATA) {
      expect(metadata.visibilityField).toBe(expectedFields[metadata.id]);
    }
  });

  for (const categoryId of RECOMMENDATION_CATEGORY_IDS) {
    const field = expectedFields[categoryId];
    const missingDefault = categoryId === "places";

    it.each([
      ["Yes", true],
      ["No", false],
      [undefined, missingDefault],
      [null, missingDefault],
      [true, false],
      ["yes", false],
    ])(`${categoryId} visibility %#`, (value, expected) => {
      expect(isRecommendationCategoryVisible({ [field]: value }, categoryId)).toBe(
        expected,
      );
    });
  }
});

describe("landing behavior", () => {
  it.each([
    ["all-recommendations", "recommendations", undefined],
    ["places", "recommendations", "places"],
    ["music", "recommendations", "music"],
    ["guides", "recommendations", "guides"],
    ["movies", "recommendations", "movies"],
    ["books", "recommendations", "books"],
    ["games", "recommendations", "games"],
    ["apps", "recommendations", "apps"],
    ["products", "recommendations", "products"],
    ["people", "recommendations", "people"],
    ["gallery", "gallery", undefined],
    ["business", "business", undefined],
  ] as const)("maps %s", (landingTab, expectedTab, expectedCategory) => {
    expect(
      resolveInitialPublicProfileTab({
        landingTab,
        hasVisibleRecommendationCategories: true,
        hasGallery: true,
        hasBusiness: true,
      }),
    ).toBe(expectedTab);
    expect(getPreferredRecommendationCategory(landingTab)).toBe(expectedCategory);
  });

  it("falls back from unavailable top-level tabs without route semantics", () => {
    expect(
      resolveInitialPublicProfileTab({
        landingTab: "business",
        hasVisibleRecommendationCategories: true,
        hasGallery: true,
        hasBusiness: false,
      }),
    ).toBe("recommendations");
    expect(
      resolveInitialPublicProfileTab({
        landingTab: "gallery",
        hasVisibleRecommendationCategories: false,
        hasGallery: false,
        hasBusiness: true,
      }),
    ).toBe("business");
    expect(
      resolveInitialPublicProfileTab({
        landingTab: "unknown",
        hasVisibleRecommendationCategories: false,
        hasGallery: true,
        hasBusiness: true,
      }),
    ).toBe("gallery");
  });
});

describe("orderEligibleRecommendationCategoryIds", () => {
  it("retains saved relative order and promotes an eligible preference", () => {
    expect(
      orderEligibleRecommendationCategoryIds({
        savedOrder: ["places", "books", "music", "people"],
        eligible: ["people", "music", "places"],
        preferred: "music",
      }),
    ).toEqual(["music", "places", "people"]);
  });

  it("ignores an unavailable preferred category", () => {
    expect(
      orderEligibleRecommendationCategoryIds({
        savedOrder: ["books", "places", "people"],
        eligible: ["places", "people"],
        preferred: "music",
      }),
    ).toEqual(["places", "people"]);
  });

  it("preserves every one of the 9! valid saved orders", () => {
    const values = [...RECOMMENDATION_CATEGORY_IDS];
    const eligible = new Set<RecommendationCategoryId>([
      "music",
      "books",
      "people",
    ]);
    let visited = 0;

    const visit = (start: number) => {
      if (start === values.length) {
        visited += 1;
        const savedOrder = [...values];
        const normalized = normalizeRecommendationsPresentation({
          categoryOrder: savedOrder,
        }).categoryOrder;
        if (normalized.join("|") !== savedOrder.join("|")) {
          throw new Error(`Normalization changed valid order ${savedOrder.join(",")}`);
        }

        const filtered = orderEligibleRecommendationCategoryIds({
          savedOrder,
          eligible: ["people", "books", "music"],
        });
        if (
          filtered.length !== 3 ||
          filtered.some((id) => !eligible.has(id)) ||
          savedOrder.indexOf(filtered[0]) >= savedOrder.indexOf(filtered[1]) ||
          savedOrder.indexOf(filtered[1]) >= savedOrder.indexOf(filtered[2])
        ) {
          throw new Error(`Eligibility changed relative order ${savedOrder.join(",")}`);
        }
        return;
      }

      for (let index = start; index < values.length; index += 1) {
        [values[start], values[index]] = [values[index], values[start]];
        visit(start + 1);
        [values[start], values[index]] = [values[index], values[start]];
      }
    };

    visit(0);
    expect(visited).toBe(362_880);
  });
});
