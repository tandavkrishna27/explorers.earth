import { memo } from "react";
import { useTranslation } from "react-i18next";
import {
  mergeThemeSettingsWire,
  normalizeThemeSettings,
  RECOMMENDATION_CATEGORY_METADATA,
} from "../constants/recommendationsPresentation";
import { THEME_PRESETS } from "../constants/themePresets";
import {
  THEME_ACCENT_OPTIONS,
  WALLPAPER_OPTIONS,
} from "../constants/themeOptions";
import type {
  LandingTabId,
  ThemeSettingsWire,
  WallpaperMode,
} from "../types/themeTypes";
import RecommendationsPresentationControls from "./RecommendationsPresentationControls";

interface ThemeAppearanceSectionProps {
  themeSettings: ThemeSettingsWire;
  isActive?: boolean;
  scopeKey?: string;
  onChange: (updatedSettings: ThemeSettingsWire) => void;
}

interface AppearanceAreaHeadingProps {
  description: string;
  id: string;
  title: string;
}

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

const AppearanceAreaHeading = ({
  description,
  id,
  title,
}: AppearanceAreaHeadingProps) => (
  <header className="appearance-area-heading">
    <h3 className="appearance-area-title" id={id}>
      {title}
    </h3>
    <p className="appearance-area-description">{description}</p>
  </header>
);

export const ThemeAppearanceSection = memo(
  ({
    themeSettings,
    isActive = true,
    scopeKey = "theme-appearance",
    onChange,
  }: ThemeAppearanceSectionProps) => {
    const { t } = useTranslation();
    const normalized = normalizeThemeSettings(themeSettings);
    const emitPatch = (
      patch: Parameters<typeof mergeThemeSettingsWire>[1],
    ) => onChange(mergeThemeSettingsWire(themeSettings, patch));

    return (
      <div className="appearance-workspace" data-testid="appearance-workspace">
        <section
          aria-labelledby="appearance-theme-style-title"
          className="appearance-area"
          data-appearance-area="theme-style"
        >
          <AppearanceAreaHeading
            description={t(
              "dashboard.profile.editor.appearance.themeStyleDescription",
              "Choose the visual foundation visitors see across your public profile.",
            )}
            id="appearance-theme-style-title"
            title={t(
              "dashboard.profile.editor.appearance.themeStyle",
              "Theme style",
            )}
          />

          <section aria-labelledby="theme-preset-title">
            <h4
              className="appearance-control-title"
              id="theme-preset-title"
            >
              {t(
                "dashboard.profile.themeAppearance.presetTitle",
                "Select theme preset",
              )}
            </h4>
            <div className="appearance-theme-presets appearance-horizontal-strip">
              {Object.values(THEME_PRESETS).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-theme-preset={preset.id}
                  aria-pressed={normalized.preset === preset.id}
                  onClick={() =>
                    emitPatch({
                      preset: preset.id,
                      accentColor: preset.defaultAccent,
                    })
                  }
                  className={`appearance-theme-preset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent ${
                    normalized.preset === preset.id
                      ? "appearance-theme-preset-selected"
                      : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="appearance-theme-preview"
                    style={{
                      backgroundColor: preset.styles.bgPage,
                      borderColor: preset.styles.borderCard,
                    }}
                  >
                    <span
                      className="appearance-theme-preview-nav"
                      style={{ backgroundColor: preset.styles.navBg }}
                    >
                      <span
                        className="appearance-theme-preview-accent"
                        style={{ backgroundColor: preset.defaultAccent }}
                      />
                    </span>
                    <span className="appearance-theme-preview-body">
                      <span
                        className="appearance-theme-preview-card appearance-theme-preview-card-featured"
                        style={{
                          backgroundColor: preset.styles.bgCard,
                          borderColor: preset.styles.borderCard,
                        }}
                      />
                      <span className="appearance-theme-preview-stack">
                        <span
                          className="appearance-theme-preview-card"
                          style={{
                            backgroundColor: preset.styles.bgCard,
                            borderColor: preset.styles.borderCard,
                          }}
                        />
                        <span
                          className="appearance-theme-preview-card"
                          style={{
                            backgroundColor: preset.styles.bgCard,
                            borderColor: preset.styles.borderCard,
                          }}
                        />
                      </span>
                    </span>
                  </span>
                  <span className="appearance-theme-preset-copy">
                    <span className="appearance-theme-preset-name">
                      {preset.name}
                    </span>
                    <span className="appearance-theme-preset-description">
                      {preset.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <div className="appearance-theme-secondary-grid">
            <section aria-labelledby="accent-color-title">
              <h4
                className="appearance-control-title"
                id="accent-color-title"
              >
                {t(
                  "dashboard.profile.themeAppearance.accentTitle",
                  "Accent color",
                )}
              </h4>
              <div className="appearance-accent-strip flex items-center gap-3">
                {THEME_ACCENT_OPTIONS.map((color) => (
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

            <div>
              <label
                htmlFor="theme-wallpaper-mode"
                className="appearance-control-title block"
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
                {WALLPAPER_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {t(option.labelKey, option.defaultLabel)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="appearance-public-landing-title"
          className="appearance-area"
          data-appearance-area="public-landing"
        >
          <AppearanceAreaHeading
            description={t(
              "dashboard.profile.editor.appearance.publicLandingDescription",
              "Choose which public profile view visitors see first.",
            )}
            id="appearance-public-landing-title"
            title={t(
              "dashboard.profile.editor.appearance.publicLanding",
              "Public landing",
            )}
          />
          <label
            htmlFor="theme-first-view"
            className="appearance-control-title block"
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
        </section>

        <RecommendationsPresentationControls
          value={themeSettings.recommendations}
          landingTab={normalized.landingTab}
          isActive={isActive}
          scopeKey={scopeKey}
          layoutHeading={
            <AppearanceAreaHeading
              description={t(
                "dashboard.profile.themeAppearance.recommendations.help",
                "Choose how recommendation categories are arranged on your public profile.",
              )}
              id="appearance-recommendations-layout-title"
              title={t(
                "dashboard.profile.editor.appearance.recommendationsLayout",
                "Recommendations layout",
              )}
            />
          }
          layoutHeadingId="appearance-recommendations-layout-title"
          orderHeading={
            <AppearanceAreaHeading
              description={t(
                "dashboard.profile.themeAppearance.recommendations.orderHelp",
                "Move categories into the order visitors should scan them.",
              )}
              id="appearance-category-order-title"
              title={t(
                "dashboard.profile.editor.appearance.categoryOrder",
                "Category order",
              )}
            />
          }
          orderHeadingId="appearance-category-order-title"
          showStructuralHeadings={false}
          onChange={(recommendations) => emitPatch({ recommendations })}
        />
      </div>
    );
  },
);

ThemeAppearanceSection.displayName = "ThemeAppearanceSection";
export default ThemeAppearanceSection;
