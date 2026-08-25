import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getPreferredRecommendationCategory,
  normalizeRecommendationsPresentation,
  orderEligibleRecommendationCategoryIds,
  RECOMMENDATION_CATEGORY_METADATA,
} from "../constants/recommendationsPresentation";
import type {
  LandingTabId,
  NormalizedRecommendationsPresentationSettings,
  RecommendationsLayout,
  RecommendationsPresentationWire,
} from "../types/themeTypes";

interface RecommendationsPresentationControlsProps {
  value?: RecommendationsPresentationWire | null;
  landingTab?: LandingTabId | string | null;
  onChange: (value: NormalizedRecommendationsPresentationSettings) => void;
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

const LAYOUTS: readonly {
  value: RecommendationsLayout;
  label: string;
  description: string;
}[] = [
  {
    value: "shelves",
    label: "Classic Shelves",
    description: "Horizontal shelves with recommendation previews.",
  },
  {
    value: "grid",
    label: "Category Mosaic",
    description: "A compact grid that makes categories easy to scan.",
  },
  {
    value: "featured",
    label: "Featured First",
    description: "A larger first category followed by compact rows.",
  },
];

const fillTemplate = (
  template: string,
  values: Record<string, string | number>,
) =>
  Object.entries(values).reduce(
    (result, [key, value]) =>
      result.split(`{{${key}}}`).join(String(value)),
    template,
  );

export const RecommendationsPresentationControls = memo(
  ({ value, landingTab, onChange }: RecommendationsPresentationControlsProps) => {
    const { t } = useTranslation();
    const [announcement, setAnnouncement] = useState("");
    const normalized = normalizeRecommendationsPresentation(value);
    const previewOrder = orderEligibleRecommendationCategoryIds({
      savedOrder: normalized.categoryOrder,
      eligible: normalized.categoryOrder,
      preferred: getPreferredRecommendationCategory(landingTab),
    });

    const categoryLabel = (
      metadata: (typeof RECOMMENDATION_CATEGORY_METADATA)[number],
    ) =>
      t(metadata.labelKey, {
        defaultValue: CATEGORY_FALLBACKS[metadata.id],
      });

    const updateLayout = (layout: RecommendationsLayout) => {
      onChange({
        layout,
        categoryOrder: [...normalized.categoryOrder],
      });
    };

    const moveCategory = (index: number, delta: -1 | 1) => {
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= normalized.categoryOrder.length) {
        return;
      }

      const categoryOrder = [...normalized.categoryOrder];
      const [movedCategory] = categoryOrder.splice(index, 1);
      categoryOrder.splice(targetIndex, 0, movedCategory);
      const metadata = RECOMMENDATION_CATEGORY_METADATA.find(
        ({ id }) => id === movedCategory,
      );
      const label = metadata ? categoryLabel(metadata) : movedCategory;

      onChange({ layout: normalized.layout, categoryOrder });
      setAnnouncement(
        fillTemplate(
          t("dashboard.profile.themeAppearance.recommendations.moved", {
            category: label,
            position: targetIndex + 1,
            total: categoryOrder.length,
            defaultValue:
              "{{category}} moved to position {{position}} of {{total}}",
          }),
          {
            category: label,
            position: targetIndex + 1,
            total: categoryOrder.length,
          },
        ),
      );
    };

    return (
      <section
        aria-labelledby="recommendations-presentation-title"
        className="space-y-5"
      >
        <div>
          <h4
            id="recommendations-presentation-title"
            className="text-sm font-semibold text-dashboard"
          >
            {t(
              "dashboard.profile.themeAppearance.recommendations.title",
              "Recommendations presentation",
            )}
          </h4>
          <p className="mt-1 text-xs leading-5 text-dashboard-light">
            {t(
              "dashboard.profile.themeAppearance.recommendations.help",
              "Choose how recommendation categories are arranged on your public profile.",
            )}
          </p>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-dashboard">
            {t(
              "dashboard.profile.themeAppearance.recommendations.layoutLegend",
              "Recommendations layout",
            )}
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {LAYOUTS.map((layout) => {
              const label = t(
                `dashboard.profile.themeAppearance.recommendations.layouts.${layout.value}.label`,
                layout.label,
              );
              return (
                <label
                  key={layout.value}
                  className={`min-h-24 cursor-pointer rounded-lg border p-3 transition-colors duration-150 focus-within:ring-2 focus-within:ring-dashboard-accent ${
                    normalized.layout === layout.value
                      ? "border-dashboard-accent bg-dashboard-accent/10"
                      : "border-dashboard bg-dashboard-muted hover:border-dashboard-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="recommendations-layout"
                    value={layout.value}
                    checked={normalized.layout === layout.value}
                    onChange={() => updateLayout(layout.value)}
                    aria-label={label}
                    className="h-4 w-4 accent-dashboard-accent"
                  />
                  <span className="ml-2 text-sm font-semibold text-dashboard">
                    {label}
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-dashboard-light">
                    {t(
                      `dashboard.profile.themeAppearance.recommendations.layouts.${layout.value}.description`,
                      layout.description,
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <h5 className="text-xs font-semibold text-dashboard">
            {t(
              "dashboard.profile.themeAppearance.recommendations.orderTitle",
              "Category order",
            )}
          </h5>
          <p className="mt-1 text-xs leading-5 text-dashboard-light">
            {t(
              "dashboard.profile.themeAppearance.recommendations.orderHelp",
              "Move categories into the order visitors should scan them.",
            )}
          </p>
          <ol className="mt-3 space-y-2">
            {normalized.categoryOrder.map((id, index) => {
              const metadata = RECOMMENDATION_CATEGORY_METADATA.find(
                (category) => category.id === id,
              );
              if (!metadata) return null;
              const label = categoryLabel(metadata);
              return (
                <li
                  key={id}
                  className="flex min-h-12 items-center gap-3 rounded-lg border border-dashboard bg-dashboard-muted px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-dashboard">
                      {label}
                    </span>
                    <span className="block text-xs text-dashboard-light">
                      {fillTemplate(
                        t(
                          "dashboard.profile.themeAppearance.recommendations.position",
                          {
                          position: index + 1,
                          total: normalized.categoryOrder.length,
                          defaultValue: "{{position}} of {{total}}",
                          },
                        ),
                        {
                          position: index + 1,
                          total: normalized.categoryOrder.length,
                        },
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => moveCategory(index, -1)}
                    disabled={index === 0}
                    aria-label={fillTemplate(
                      t(
                        "dashboard.profile.themeAppearance.recommendations.moveUp",
                        {
                        category: label,
                        defaultValue: "Move {{category}} up",
                        },
                      ),
                      { category: label },
                    )}
                    className="min-h-12 min-w-12 rounded-md border border-dashboard text-dashboard transition-colors hover:border-dashboard-accent disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCategory(index, 1)}
                    disabled={index === normalized.categoryOrder.length - 1}
                    aria-label={fillTemplate(
                      t(
                        "dashboard.profile.themeAppearance.recommendations.moveDown",
                        {
                        category: label,
                        defaultValue: "Move {{category}} down",
                        },
                      ),
                      { category: label },
                    )}
                    className="min-h-12 min-w-12 rounded-md border border-dashboard text-dashboard transition-colors hover:border-dashboard-accent disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div role="status" aria-live="polite" className="sr-only">
            {announcement}
          </div>
          <p className="mt-2 text-xs text-dashboard-light">
            {t(
              "dashboard.profile.themeAppearance.recommendations.publicVisibilityNote",
              "Public Visibility controls whether a category appears.",
            )}
          </p>
        </div>

        <section
          role="region"
          aria-label={t(
            "dashboard.profile.themeAppearance.recommendations.previewLabel",
            "Recommendations layout preview",
          )}
          data-layout={normalized.layout}
          className="rounded-xl border border-dashboard bg-dashboard-sidebar p-4"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-dashboard-light">
            {t(
              "dashboard.profile.themeAppearance.recommendations.previewCaption",
              "Illustrative preview",
            )}
          </p>
          <div
            className={
              normalized.layout === "grid"
                ? "grid grid-cols-2 gap-2 sm:grid-cols-3"
                : "space-y-2"
            }
          >
            {previewOrder.map((id, index) => {
              const metadata = RECOMMENDATION_CATEGORY_METADATA.find(
                (category) => category.id === id,
              );
              if (!metadata) return null;
              return (
                <div
                  key={id}
                  data-testid="recommendations-preview-category"
                  data-category-id={id}
                  className={`rounded-md border border-dashboard bg-dashboard-muted p-3 text-sm text-dashboard ${
                    normalized.layout === "featured" && index === 0
                      ? "min-h-20 border-dashboard-accent"
                      : ""
                  }`}
                >
                  {normalized.layout === "featured" && index === 0 && (
                    <span className="mb-1 block text-xs font-semibold text-dashboard-accent">
                      {t(
                        "dashboard.profile.themeAppearance.recommendations.featured",
                        "Featured",
                      )}
                    </span>
                  )}
                  {categoryLabel(metadata)}
                </div>
              );
            })}
          </div>
        </section>
      </section>
    );
  },
);

RecommendationsPresentationControls.displayName =
  "RecommendationsPresentationControls";

export default RecommendationsPresentationControls;
