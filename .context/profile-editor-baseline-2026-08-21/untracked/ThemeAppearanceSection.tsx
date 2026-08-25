import { memo } from "react";
import { useTranslation } from "react-i18next";
import {
  mergeThemeSettingsWire,
  normalizeThemeSettings,
  RECOMMENDATION_CATEGORY_METADATA,
} from "../constants/recommendationsPresentation";
import { THEME_PRESETS } from "../constants/themePresets";
import type {
  LandingTabId,
  ThemeSettingsWire,
  WallpaperMode,
} from "../types/themeTypes";
import RecommendationsPresentationControls from "./RecommendationsPresentationControls";

interface ThemeAppearanceSectionProps {
  themeSettings: ThemeSettingsWire;
  onChange: (updatedSettings: ThemeSettingsWire) => void;
}

const ACCENT_COLORS = [
  { name: "Emerald", hex: "#10B981" },
  { name: "Ocean Blue", hex: "#38BDF8" },
  { name: "Sunset Pink", hex: "#EC4899" },
  { name: "Royal Purple", hex: "#8B5CF6" },
  { name: "Amber Gold", hex: "#F59E0B" },
  { name: "Crimson", hex: "#F43F5E" },
] as const;

const CATEGORY_FALLBACKS = {
  places: "Places",
  music: "Music",
  movies: "Movies & Shows",
  books: "Books",
  games: "Games",
  guides: "Guides",
  apps: "Apps & Tools",
  products: "Products",
  people: "People",
} as const;

export const ThemeAppearanceSection = memo(
  ({ themeSettings, onChange }: ThemeAppearanceSectionProps) => {
    const { t } = useTranslation();
    const normalized = normalizeThemeSettings(themeSettings);
    const emitPatch = (
      patch: Parameters<typeof mergeThemeSettingsWire>[1],
    ) => onChange(mergeThemeSettingsWire(themeSettings, patch));

    return (
      <div className="space-y-6 rounded-xl border border-dashboard bg-dashboard-sidebar p-5">
        <section aria-labelledby="theme-preset-title">
          <h4
            id="theme-preset-title"
            className="mb-2 text-sm font-semibold text-dashboard"
          >
            {t(
              "dashboard.profile.themeAppearance.presetTitle",
              "Select theme preset",
            )}
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {Object.values(THEME_PRESETS).map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={normalized.preset === preset.id}
                onClick={() =>
                  emitPatch({
                    preset: preset.id,
                    accentColor: preset.defaultAccent,
                  })
                }
                className={`min-h-20 rounded-lg border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent ${
                  normalized.preset === preset.id
                    ? "border-dashboard-accent bg-dashboard-accent/10"
                    : "border-dashboard bg-dashboard-muted hover:border-dashboard-accent"
                }`}
              >
                <span className="block text-xs font-bold text-dashboard">
                  {preset.name}
                </span>
                <span className="mt-1 block text-xs leading-5 text-dashboard-light">
                  {preset.description}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="accent-color-title">
          <h4
            id="accent-color-title"
            className="mb-2 text-sm font-semibold text-dashboard"
          >
            {t(
              "dashboard.profile.themeAppearance.accentTitle",
              "Accent color",
            )}
          </h4>
          <div className="flex flex-wrap items-center gap-3">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.hex}
                type="button"
                aria-label={color.name}
                aria-pressed={normalized.accentColor === color.hex}
                onClick={() => emitPatch({ accentColor: color.hex })}
                style={{ backgroundColor: color.hex }}
                className={`min-h-12 min-w-12 rounded-full border-2 transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent focus-visible:ring-offset-2 ${
                  normalized.accentColor === color.hex
                    ? "scale-110 border-dashboard"
                    : "border-transparent opacity-80 hover:opacity-100"
                }`}
              />
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label
              htmlFor="theme-wallpaper-mode"
              className="mb-2 block text-sm font-semibold text-dashboard"
            >
              {t(
                "dashboard.profile.themeAppearance.wallpaperLabel",
                "Wallpaper and cover style",
              )}
            </label>
            <select
              id="theme-wallpaper-mode"
              value={normalized.wallpaperMode}
              onChange={(event) =>
                emitPatch({
                  wallpaperMode: event.target.value as WallpaperMode,
                })
              }
              className="min-h-12 w-full rounded-lg border border-dashboard bg-dashboard-muted px-3 py-2 text-sm text-dashboard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"
            >
              <option value="banner-top">
                {t(
                  "dashboard.profile.themeAppearance.wallpaperOptions.bannerTop",
                  "Top cover banner photo",
                )}
              </option>
              <option value="full-wallpaper-image">
                {t(
                  "dashboard.profile.themeAppearance.wallpaperOptions.fullWallpaperImage",
                  "Full-screen background image",
                )}
              </option>
              <option value="ambient-gradient">
                {t(
                  "dashboard.profile.themeAppearance.wallpaperOptions.ambientGradient",
                  "Ambient mesh gradient",
                )}
              </option>
              <option value="solid-color">
                {t(
                  "dashboard.profile.themeAppearance.wallpaperOptions.solidColor",
                  "Solid minimal background",
                )}
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="theme-first-view"
              className="mb-2 block text-sm font-semibold text-dashboard"
            >
              {t(
                "dashboard.profile.themeAppearance.firstView.label",
                "First view",
              )}
            </label>
            <select
              id="theme-first-view"
              value={normalized.landingTab}
              onChange={(event) =>
                emitPatch({ landingTab: event.target.value as LandingTabId })
              }
              className="min-h-12 w-full rounded-lg border border-dashboard bg-dashboard-muted px-3 py-2 text-sm text-dashboard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"
            >
              <option value="all-recommendations">
                {t(
                  "dashboard.profile.themeAppearance.firstView.savedOrder",
                  "Recommendations — saved order",
                )}
              </option>
              {RECOMMENDATION_CATEGORY_METADATA.map((category) => {
                const categoryName = t(category.labelKey, {
                  defaultValue: CATEGORY_FALLBACKS[category.id],
                });
                return (
                  <option key={category.id} value={category.id}>
                    {t(
                      "dashboard.profile.themeAppearance.firstView.categoryFirst",
                      {
                        category: categoryName,
                        defaultValue: "Recommendations — {{category}} first",
                      },
                    )}
                  </option>
                );
              })}
              <option value="gallery">
                {t(
                  "dashboard.profile.themeAppearance.firstView.gallery",
                  "Gallery",
                )}
              </option>
              <option value="business">
                {t(
                  "dashboard.profile.themeAppearance.firstView.business",
                  "Business",
                )}
              </option>
            </select>
            <p className="mt-2 text-xs leading-5 text-dashboard-light">
              {t(
                "dashboard.profile.themeAppearance.firstView.help",
                "Category choices promote that category but keep all other public categories.",
              )}
            </p>
          </div>
        </section>

        <RecommendationsPresentationControls
          value={themeSettings.recommendations}
          landingTab={normalized.landingTab}
          onChange={(recommendations) => emitPatch({ recommendations })}
        />
      </div>
    );
  },
);

ThemeAppearanceSection.displayName = "ThemeAppearanceSection";
export default ThemeAppearanceSection;
