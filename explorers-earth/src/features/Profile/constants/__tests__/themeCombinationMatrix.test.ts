import { describe, expect, it } from "vitest";
import {
  LANDING_TAB_IDS,
  THEME_ACCENT_OPTIONS,
  WALLPAPER_MODES,
} from "../themeOptions";
import {
  getThemeTokenStyles,
  THEME_PRESETS,
} from "../themePresets";
import { normalizeThemeSettings } from "../recommendationsPresentation";

const PRESET_IDS = Object.keys(THEME_PRESETS) as Array<keyof typeof THEME_PRESETS>;
const ACCENT_COLORS = THEME_ACCENT_OPTIONS.map((option) => option.hex);

const rows = PRESET_IDS.flatMap((preset) =>
  ACCENT_COLORS.flatMap((accentColor) =>
    WALLPAPER_MODES.flatMap((wallpaperMode) =>
      LANDING_TAB_IDS.map((landingTab) => ({
        preset,
        accentColor,
        wallpaperMode,
        landingTab,
      })),
    ),
  ),
);

describe("theme appearance Cartesian matrix", () => {
  it("contains exactly 1,728 unique canonical controlled states", () => {
    expect(PRESET_IDS).toHaveLength(6);
    expect(ACCENT_COLORS).toHaveLength(6);
    expect(WALLPAPER_MODES).toHaveLength(4);
    expect(LANDING_TAB_IDS).toHaveLength(12);
    expect(rows).toHaveLength(1_728);
    expect(new Set(rows.map((row) => JSON.stringify(row))).size).toBe(1_728);
  });

  it("covers every pair between every two factors", () => {
    const factors = {
      preset: PRESET_IDS,
      accentColor: ACCENT_COLORS,
      wallpaperMode: WALLPAPER_MODES,
      landingTab: LANDING_TAB_IDS,
    } as const;
    const names = Object.keys(factors) as Array<keyof typeof factors>;

    for (let left = 0; left < names.length; left += 1) {
      for (let right = left + 1; right < names.length; right += 1) {
        const leftName = names[left];
        const rightName = names[right];
        const covered = new Set(
          rows.map((row) => `${row[leftName]}|${row[rightName]}`),
        );
        expect(covered.size).toBe(
          factors[leftName].length * factors[rightName].length,
        );
      }
    }
  });

  it("normalizes every row without fallback and emits the selected theme tokens", () => {
    for (const row of rows) {
      const normalized = normalizeThemeSettings(row);
      expect(normalized.preset).toBe(row.preset);
      expect(normalized.accentColor).toBe(row.accentColor);
      expect(normalized.wallpaperMode).toBe(row.wallpaperMode);
      expect(normalized.landingTab).toBe(row.landingTab);

      const tokens = getThemeTokenStyles(normalized);
      expect(tokens["--accent-color"]).toBe(row.accentColor);
      expect(tokens["--bg-page"]).toBe(THEME_PRESETS[row.preset].styles.bgPage);
      expect(tokens["--bg-card"]).toBe(THEME_PRESETS[row.preset].styles.bgCard);
      expect(tokens["--nav-bg"]).toBe(THEME_PRESETS[row.preset].styles.navBg);
    }
  });
});
