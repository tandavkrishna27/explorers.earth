import { describe, it, expect } from "vitest";
import {
  MAX_NAV_SLOTS,
  getVisibleNavTabIds,
  resolveAutoPinning,
  normalizePinnedTabs,
  computePinnedNavTabIds,
  getNavSlotExclusion,
} from "../navPinning";

const ZERO_COUNTS: Record<string, number> = {};

describe("getVisibleNavTabIds", () => {
  it("is strict opt-in: a fresh (null) account shows only the profile tab", () => {
    const visible = getVisibleNavTabIds(null);
    expect([...visible]).toEqual(["public_profile"]);
  });

  it('shows a category only when its field is explicitly "Yes"', () => {
    const visible = getVisibleNavTabIds({
      public_recommendations: "Yes",
      public_games: null, // unset -> hidden (no magic default)
      public_music: "No",
      public_movie: "Yes",
    });
    expect(visible.has("public_recommendations")).toBe(true);
    expect(visible.has("public_movie")).toBe(true);
    expect(visible.has("public_games")).toBe(false);
    expect(visible.has("public_music")).toBe(false);
    expect(visible.has("public_profile")).toBe(true);
  });

  it("does not derive canonical Music sharing from the retired Account flag", () => {
    expect(getVisibleNavTabIds({ public_music: "Yes" }).has("public_music")).toBe(false);
  });
});

describe("resolveAutoPinning", () => {
  it("defaults to true when unset", () => {
    expect(resolveAutoPinning(null)).toBe(true);
    expect(resolveAutoPinning({})).toBe(true);
    expect(resolveAutoPinning({ auto_pinning: null })).toBe(true);
  });
  it("honors an explicit false", () => {
    expect(resolveAutoPinning({ auto_pinning: false })).toBe(false);
  });
});

describe("normalizePinnedTabs", () => {
  it("moves Profile first and removes unknown and duplicate saved pins without reordering categories", () => {
    const account = { auto_pinning: false, public_music: "Yes", public_recommendations: "Yes",
      pinned_nav_tabs: ["public_music", "unknown", "public_profile", "public_recommendations", "public_music", null] };
    expect(normalizePinnedTabs(account)).toEqual(["public_profile", "public_music", "public_recommendations"]);
    expect(computePinnedNavTabIds(account, {}, { musicAvailable: true })).toEqual(["public_profile", "public_music", "public_recommendations"]);
  });
  it("falls back to just the profile tab for a fresh account (not a 5-item default)", () => {
    // This is the core of the data-corruption blocker: the old code fabricated
    // a 5-item list here, which blocked pinning and persisted phantom pins.
    expect(normalizePinnedTabs(null)).toEqual(["public_profile"]);
    expect(normalizePinnedTabs({ pinned_nav_tabs: null })).toEqual(["public_profile"]);
  });
  it("prepends public_profile when the stored array omits it", () => {
    expect(normalizePinnedTabs({ pinned_nav_tabs: ["public_movie"] })).toEqual([
      "public_profile",
      "public_movie",
    ]);
  });
  it("leaves an array that already includes public_profile as-is", () => {
    expect(
      normalizePinnedTabs({ pinned_nav_tabs: ["public_profile", "public_books"] })
    ).toEqual(["public_profile", "public_books"]);
  });
});

describe("computePinnedNavTabIds — auto-pinning mode (default)", () => {
  it("gives available Music a deterministic rank independent of list counts", () => {
    const account = { public_music: "Yes", public_recommendations: "Yes", public_movie: "Yes" };
    expect(computePinnedNavTabIds(account, { public_recommendations: 999, public_movie: 1 }, { musicAvailable: true }))
      .toEqual(["public_profile", "public_music", "public_recommendations", "public_movie"]);
  });

  it("fails closed for Music without disturbing other navigation items", () => {
    const account = { public_music: "Yes", public_recommendations: "Yes", public_movie: "Yes" };
    expect(computePinnedNavTabIds(account, ZERO_COUNTS, { musicAvailable: false }))
      .toEqual(["public_profile", "public_recommendations", "public_movie"]);
  });
  it("fresh (null) account shows only the profile — nothing is public yet", () => {
    const pinned = computePinnedNavTabIds(null, ZERO_COUNTS);
    expect(pinned).toEqual(["public_profile"]);
    expect(pinned.length).toBeLessThanOrEqual(MAX_NAV_SLOTS);
  });

  it("ranks visible categories by list count descending", () => {
    const account = {
      public_recommendations: "Yes",
      public_movie: "Yes",
      public_books: "Yes",
    };
    const counts = { public_movie: 10, public_books: 5, public_recommendations: 1 };
    const pinned = computePinnedNavTabIds(account, counts);
    expect(pinned).toEqual([
      "public_profile",
      "public_movie",
      "public_books",
      "public_recommendations",
    ]);
  });

  it("never exceeds 5 slots even with many visible categories", () => {
    const account = {
      public_recommendations: "Yes",
      public_music: "Yes",
      public_guides: "Yes",
      public_movie: "Yes",
      public_books: "Yes",
      public_games: "Yes",
      public_apps: "Yes",
      public_products: "Yes",
      public_people: "Yes",
    };
    const pinned = computePinnedNavTabIds(account, ZERO_COUNTS);
    expect(pinned.length).toBe(MAX_NAV_SLOTS);
    expect(pinned[0]).toBe("public_profile");
  });
});

describe("computePinnedNavTabIds — manual mode", () => {
  it.each([
    [[], ["public_profile"]],
    [["public_music", "public_recommendations", "public_guides", "public_books"], ["public_profile", "public_music", "public_recommendations", "public_guides", "public_books"]],
    [["public_music", "public_recommendations", "public_guides", "public_books", "public_apps"], ["public_profile", "public_music", "public_recommendations", "public_guides", "public_books"]],
    [["public_music", "public_recommendations", "public_guides", "public_books", "public_apps", "public_games"], ["public_profile", "public_music", "public_recommendations", "public_guides", "public_books"]],
  ])("caps auto and manual effective navigation for eligible set %j", (eligible, expected) => {
    const account = { ...Object.fromEntries(eligible.map(id => [id, "Yes"])), pinned_nav_tabs: ["public_profile", ...eligible] };
    expect(computePinnedNavTabIds({ ...account, auto_pinning: false }, {}, { musicAvailable: true })).toEqual(expected);
    expect(computePinnedNavTabIds({ ...account, auto_pinning: true }, { public_books: 3, public_apps: 2, public_games: 1, public_recommendations: 5, public_guides: 4 }, { musicAvailable: true })).toEqual(expected);
  });
  it.each(["Yes", "No", undefined])("keeps saved preference %s distinct from available navigation and outage recovery", (preference) => {
    const account = { public_music: preference, auto_pinning: false, public_books: "Yes", pinned_nav_tabs: ["public_profile", "public_music", "public_books"] };
    expect(computePinnedNavTabIds(account, {}, { musicAvailable: false })).toEqual(["public_profile", "public_books"]);
    expect(normalizePinnedTabs(account)).toEqual(["public_profile", "public_music", "public_books"]);
    expect(computePinnedNavTabIds(account, {}, { musicAvailable: true })).toEqual(preference === "Yes" ? ["public_profile", "public_music", "public_books"] : ["public_profile", "public_books"]);
  });
  it("explains when enabled Music is excluded by the five-slot manual selection", () => {
    const account = {
      auto_pinning: false,
      public_music: "Yes",
      public_recommendations: "Yes",
      public_guides: "Yes",
      public_movie: "Yes",
      public_books: "Yes",
      pinned_nav_tabs: ["public_profile", "public_recommendations", "public_guides", "public_movie", "public_books", "public_music"],
    };
    expect(getNavSlotExclusion(account, "public_music", { musicAvailable: true })).toEqual({ reason: "slot-limit", maxSlots: 5 });
  });
  it("does not claim slot exclusion for intentionally unpinned or non-public Music", () => {
    const unpinned = { auto_pinning: false, public_music: "Yes", pinned_nav_tabs: ["public_profile", "public_movie"] };
    expect(getNavSlotExclusion(unpinned, "public_music", { musicAvailable: true })).toBeNull();
    const requested = { ...unpinned, pinned_nav_tabs: ["public_profile", "public_movie", "public_music"] };
    expect(getNavSlotExclusion(requested, "public_music", { musicAvailable: false })).toBeNull();
  });
  it("retains a stored Music position while unavailable and restores it without blanks or duplicates", () => {
    const account = {
      auto_pinning: false,
      pinned_nav_tabs: ["public_profile", "public_music", "public_movie", "public_music", ""],
      public_music: "Yes",
      public_movie: "Yes",
    };
    expect(normalizePinnedTabs(account)).toEqual(["public_profile", "public_music", "public_movie"]);
    expect(computePinnedNavTabIds(account, ZERO_COUNTS, { musicAvailable: false })).toEqual(["public_profile", "public_movie"]);
    expect(computePinnedNavTabIds(account, ZERO_COUNTS, { musicAvailable: true })).toEqual(["public_profile", "public_music", "public_movie"]);
  });
  const manual = {
    auto_pinning: false,
    pinned_nav_tabs: ["public_profile", "public_movie", "public_books"],
    public_movie: "Yes",
    public_books: "Yes",
  };

  it("returns the manually pinned, currently-visible tabs in pinned order", () => {
    expect(computePinnedNavTabIds(manual, ZERO_COUNTS)).toEqual([
      "public_profile",
      "public_movie",
      "public_books",
    ]);
  });

  it("drops a manually pinned tab that is no longer visible", () => {
    const hiddenBooks = { ...manual, public_books: "No" };
    expect(computePinnedNavTabIds(hiddenBooks, ZERO_COUNTS)).toEqual([
      "public_profile",
      "public_movie",
    ]);
  });

  it("a fresh manual account (empty pins) shows only the profile — pinning is NOT blocked", () => {
    const fresh = { auto_pinning: false, pinned_nav_tabs: null };
    const pinned = computePinnedNavTabIds(fresh, ZERO_COUNTS);
    expect(pinned).toEqual(["public_profile"]);
    // length 1 < MAX_NAV_SLOTS, so a pin action would be allowed (regression guard
    // for the blocker where a fabricated 5-item list falsely tripped the max check)
    expect(pinned.length).toBeLessThan(MAX_NAV_SLOTS);
  });
});
