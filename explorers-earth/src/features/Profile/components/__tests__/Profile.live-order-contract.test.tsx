import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createFixtureProfileController } from "../../../../../../tunes/scripts/music-fixture-profile";
import {
  parseProfileBatchRecommendationOrder,
  profileBatchPublicOrder,
  profileBatchSavedOrder,
} from "../../../../../e2e/setup/profile-batch-order";
import { buildProfileCoveringRows } from "../../../../../scripts/music-public-live-preflight.mjs";
import { RECOMMENDATION_CATEGORY_IDS, type ThemeSettingsWire } from "../../types/themeTypes";
import ThemeAppearanceSection from "../ThemeAppearanceSection";

const CANONICAL = ["places", "movies", "books", "games", "guides", "apps", "products", "people"];
const LEGACY = ["places", "music", "movies", "books", "games", "guides", "apps", "products", "people"];
const REVERSE = ["people", "products", "apps", "guides", "games", "books", "movies", "places"];
const ROTATE = ["books", "games", "guides", "apps", "products", "people", "places", "movies"];

function fixtureController() {
  return createFixtureProfileController({
    username: "e2e-public-music-order-contract-owner",
    accountDocumentId: "e2e-public-music-order-contract-account",
    userDocumentId: "e2e-public-music-order-contract-user",
    baseUser: { provider: "local", confirmed: true, blocked: false },
    baseAccount: { mobile_number: "+10000000000" },
  });
}

const fixtureAccount = () => fixtureController().account();

function readRenderedOrder() {
  return parseProfileBatchRecommendationOrder(screen.getAllByTestId("recommendations-order-category")
    .map((row) => row.getAttribute("data-category-id")));
}

describe("live profile order contract against the real appearance component", () => {
  it("accepts the eight rendered categories from the actual fixture baseline", () => {
    const account = fixtureAccount();
    const raw = (account.social_media as { theme_settings: ThemeSettingsWire }).theme_settings;
    render(<ThemeAppearanceSection themeSettings={raw} onChange={vi.fn()} />);
    expect(readRenderedOrder()).toEqual(CANONICAL);
    expect(screen.queryByRole("button", { name: "Move Music up", exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "First view" })).toContainHTML('value="music"');
  });

  it("seeds only the canonical eight recommendation categories", () => {
    const account = fixtureAccount();
    const raw = (account.social_media as { theme_settings: ThemeSettingsWire }).theme_settings;
    expect(raw.recommendations?.categoryOrder).toEqual(CANONICAL);
    expect(raw.recommendations?.categoryOrder).toEqual([...RECOMMENDATION_CATEGORY_IDS]);
  });

  it("normalizes legacy nine-category wire data to eight rows without mutating raw state", () => {
    const controller = fixtureController();
    const account = controller.account();
    const raw = (account.social_media as { theme_settings: ThemeSettingsWire }).theme_settings;
    raw.recommendations = { layout: "shelves", categoryOrder: [...LEGACY], retainedFutureKey: "preserved" };
    // The profile save no longer ships a GraphQL document (ticket 3.4), so this reads the
    // one UpdateAccount mutation the app still has: Settings, which stays on Apollo until
    // the password flows it sits beside are decided. When that goes, this round-trip has no
    // real document left to use and the fixture needs seeding directly instead.
    const source = readFileSync(resolve(__dirname, "../../../Settings/api/mutation.ts"), "utf8");
    const documents = [...source.matchAll(/gql`([\s\S]*?)`/g)]
      .map((match) => match[1]).filter((query) => /mutation\s+UpdateAccount\b/.test(query));
    expect(documents).toHaveLength(1);
    expect(controller.graphql(documents[0], {
      documentId: account.documentId, data: { social_media: account.social_media },
    }).status).toBe(200);
    const stored = controller.account();
    expect(stored.updatedAt).toBe("2026-08-29T00:00:01.000Z");
    const storedTheme = (stored.social_media as { theme_settings: ThemeSettingsWire }).theme_settings;
    expect(storedTheme.recommendations?.categoryOrder).toEqual(LEGACY);
    const before = JSON.stringify(stored);
    render(<ThemeAppearanceSection themeSettings={storedTheme} onChange={vi.fn()} />);
    expect(readRenderedOrder()).toEqual(CANONICAL);
    expect(JSON.stringify(controller.account())).toBe(before);
    expect(JSON.stringify(stored)).toBe(before);
  });

  it("rejects missing, duplicate, foreign, malformed, and legacy DOM order IDs without raw errors", () => {
    for (const invalid of [
      [], CANONICAL.slice(1), [...CANONICAL, "music"], LEGACY,
      ["places", "places", ...CANONICAL.slice(2)],
      ["hostile-credential-path", ...CANONICAL.slice(1)],
      [null, ...CANONICAL.slice(1)], [7, ...CANONICAL.slice(1)], new Array(8), "places", null,
    ]) {
      expect(() => parseProfileBatchRecommendationOrder(invalid)).toThrow("Dashboard recommendation order is invalid");
    }
    expect(parseProfileBatchRecommendationOrder(REVERSE)).toEqual(REVERSE);
    expect(parseProfileBatchRecommendationOrder(REVERSE)).not.toBe(REVERSE);
  });

  it.each([
    ["canonical", "all-recommendations", CANONICAL, CANONICAL],
    ["reverse", "all-recommendations", REVERSE, REVERSE],
    ["rotate", "all-recommendations", ROTATE, ROTATE],
    ["preferred-first", "books", ["books", "places", "movies", "games", "guides", "apps", "products", "people"], ["books", "places", "movies", "games", "guides", "apps", "products", "people"]],
    ["reverse", "places", REVERSE, ["places", "people", "products", "apps", "guides", "games", "books", "movies"]],
    ["preferred-first", "music", CANONICAL, CANONICAL],
    ["reverse", "music", REVERSE, REVERSE],
    ["rotate", "gallery", ROTATE, ROTATE],
    ["canonical", "business", CANONICAL, CANONICAL],
  ] as const)("uses exact recommendation order for %s / %s", (shape, firstView, saved, publicOrder) => {
    expect(profileBatchSavedOrder(shape, firstView)).toEqual(saved);
    expect(profileBatchPublicOrder(shape, firstView)).toEqual(publicOrder);
  });

  const rows = buildProfileCoveringRows();
  it("recomputes every required factor pair with twelve landing destinations and eight orderable categories", () => {
    const factors = {
      preset: ["cinematic-dark", "glassmorphism", "sunset-glow", "minimal-light", "emerald-nature", "neon-cyber"],
      accent: ["#10B981", "#38BDF8", "#EC4899", "#8B5CF6", "#F59E0B", "#F43F5E"],
      wallpaper: ["banner-top", "full-wallpaper-image", "ambient-gradient", "solid-color"],
      firstView: ["all-recommendations", "places", "music", "movies", "books", "games", "guides", "apps", "products", "people", "gallery", "business"],
      layout: ["shelves", "grid", "featured"],
      orderShape: ["canonical", "reverse", "rotate", "preferred-first"],
    };
    const names = Object.keys(factors) as (keyof typeof factors)[];
    const required = new Set<string>();
    const observed = new Set<string>();
    for (let left = 0; left < names.length; left += 1) {
      for (let right = left + 1; right < names.length; right += 1) {
        const a = names[left]; const b = names[right];
        for (const x of factors[a]) for (const y of factors[b]) required.add(`${a}=${x}|${b}=${y}`);
        for (const row of rows) observed.add(`${a}=${row[a]}|${b}=${row[b]}`);
      }
    }
    expect(rows).toHaveLength(72);
    expect(new Set(rows.map((row) => JSON.stringify(row))).size).toBe(72);
    expect(required.size).toBe(484);
    expect(observed).toEqual(required);
  });

  it.each(rows.map((row, index) => ({ ...row, ordinal: index + 1 })))(
    "renders exact eight-category order and selected layout for covering row $ordinal",
    (row) => {
      const shape = row.orderShape as "canonical" | "reverse" | "rotate" | "preferred-first";
      const saved = profileBatchSavedOrder(shape, row.firstView);
      const base = shape === "reverse" ? REVERSE : shape === "rotate" ? ROTATE : CANONICAL;
      const expected = shape === "preferred-first" && CANONICAL.includes(row.firstView)
        ? [row.firstView, ...CANONICAL.filter((id) => id !== row.firstView)] : base;
      render(<ThemeAppearanceSection themeSettings={{
        preset: row.preset, accentColor: row.accent, wallpaperMode: row.wallpaper, landingTab: row.firstView,
        recommendations: { layout: row.layout, categoryOrder: saved },
      }} onChange={vi.fn()} />);
      expect(readRenderedOrder()).toEqual(expected);
      expect(screen.getAllByTestId("recommendations-order-category")).toHaveLength(8);
      expect(document.querySelector('input[name="recommendations-layout"]:checked')).toHaveAttribute("value", row.layout);
      const publicOrder = profileBatchPublicOrder(shape, row.firstView);
      const publicExpected = CANONICAL.includes(row.firstView)
        ? [row.firstView, ...expected.filter((id) => id !== row.firstView)] : expected;
      expect(publicOrder).toEqual(publicExpected);
      if (row.layout === "featured") expect(publicOrder[0]).toBe(publicExpected[0]);
    },
  );
});
