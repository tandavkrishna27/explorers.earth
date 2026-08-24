import {
  RECOMMENDATION_CATEGORY_IDS,
  type LandingTabId,
  type NormalizedRecommendationsPresentationSettings,
  type RecommendationCategoryId,
  type RecommendationCategoryMetadata,
  type RecommendationsLayout,
  type SocialMediaWire,
  type ThemePresetId,
  type ThemeSettings,
  type ThemeSettingsWire,
  type WallpaperMode,
} from '../types/themeTypes';
import { DEFAULT_THEME_SETTINGS, THEME_PRESETS } from './themePresets';
import { LANDING_TAB_IDS, WALLPAPER_MODES } from './themeOptions';

export type PublicProfileTab = 'recommendations' | 'gallery' | 'business';

export interface KnownThemeSettingsPatch {
  preset?: ThemePresetId;
  wallpaperMode?: WallpaperMode;
  wallpaperUrl?: string;
  accentColor?: string;
  customTextColor?: string;
  landingTab?: LandingTabId;
  recommendations?: NormalizedRecommendationsPresentationSettings;
}

const RECOMMENDATION_LAYOUTS = new Set<RecommendationsLayout>([
  'shelves',
  'grid',
  'featured',
]);
const RECOMMENDATION_CATEGORY_SET = new Set<string>(
  RECOMMENDATION_CATEGORY_IDS,
);
const THEME_PRESET_SET = new Set<string>(Object.keys(THEME_PRESETS));
const WALLPAPER_MODE_SET = new Set<WallpaperMode>(WALLPAPER_MODES);
const LANDING_TAB_SET = new Set<LandingTabId>(LANDING_TAB_IDS);
const FOOTER_BRANDING_SET = new Set<ThemeSettings['footerBranding']>([
  'enabled',
  'minimal',
  'disabled',
]);
const SAFE_CSS_COLOR = /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([^;{}]+\))$/i;

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const isSafeColor = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_CSS_COLOR.test(value.trim());

export const DEFAULT_RECOMMENDATIONS_PRESENTATION: NormalizedRecommendationsPresentationSettings = {
  layout: 'shelves',
  categoryOrder: [...RECOMMENDATION_CATEGORY_IDS],
};

export const RECOMMENDATION_CATEGORY_METADATA: readonly RecommendationCategoryMetadata[] = [
  {
    id: 'places',
    labelKey: 'dashboard.profile.themeAppearance.recommendations.categories.places',
    visibilityField: 'public_recommendations',
    legacyEnabledWhenMissing: true,
  },
  {
    id: 'music',
    labelKey: 'dashboard.profile.themeAppearance.recommendations.categories.music',
    visibilityField: 'public_music',
    legacyEnabledWhenMissing: false,
  },
  {
    id: 'movies',
    labelKey: 'dashboard.profile.themeAppearance.recommendations.categories.movies',
    visibilityField: 'public_movie',
    legacyEnabledWhenMissing: false,
  },
  {
    id: 'books',
    labelKey: 'dashboard.profile.themeAppearance.recommendations.categories.books',
    visibilityField: 'public_books',
    legacyEnabledWhenMissing: false,
  },
  {
    id: 'games',
    labelKey: 'dashboard.profile.themeAppearance.recommendations.categories.games',
    visibilityField: 'public_games',
    legacyEnabledWhenMissing: false,
  },
  {
    id: 'guides',
    labelKey: 'dashboard.profile.themeAppearance.recommendations.categories.guides',
    visibilityField: 'public_guides',
    legacyEnabledWhenMissing: false,
  },
  {
    id: 'apps',
    labelKey: 'dashboard.profile.themeAppearance.recommendations.categories.apps',
    visibilityField: 'public_apps',
    legacyEnabledWhenMissing: false,
  },
  {
    id: 'products',
    labelKey: 'dashboard.profile.themeAppearance.recommendations.categories.products',
    visibilityField: 'public_products',
    legacyEnabledWhenMissing: false,
  },
  {
    id: 'people',
    labelKey: 'dashboard.profile.themeAppearance.recommendations.categories.people',
    visibilityField: 'public_people',
    legacyEnabledWhenMissing: false,
  },
] as const;

const METADATA_BY_ID = new Map(
  RECOMMENDATION_CATEGORY_METADATA.map((metadata) => [metadata.id, metadata]),
);

export function normalizeRecommendationsPresentation(
  value: unknown,
): NormalizedRecommendationsPresentationSettings {
  const raw = asRecord(value);
  const layout =
    typeof raw.layout === 'string' &&
    RECOMMENDATION_LAYOUTS.has(raw.layout as RecommendationsLayout)
      ? (raw.layout as RecommendationsLayout)
      : DEFAULT_RECOMMENDATIONS_PRESENTATION.layout;
  const savedOrder = Array.isArray(raw.categoryOrder) ? raw.categoryOrder : [];
  const seen = new Set<string>();
  const categoryOrder = savedOrder.filter(
    (id): id is RecommendationCategoryId => {
      if (
        typeof id !== 'string' ||
        !RECOMMENDATION_CATEGORY_SET.has(id) ||
        seen.has(id)
      ) {
        return false;
      }
      seen.add(id);
      return true;
    },
  );

  for (const id of RECOMMENDATION_CATEGORY_IDS) {
    if (!seen.has(id)) categoryOrder.push(id);
  }

  return { layout, categoryOrder };
}

export function normalizeThemeSettings(value: unknown): ThemeSettings {
  const raw = asRecord(value);
  const preset =
    typeof raw.preset === 'string' && THEME_PRESET_SET.has(raw.preset)
      ? (raw.preset as ThemePresetId)
      : DEFAULT_THEME_SETTINGS.preset;
  const wallpaperMode =
    typeof raw.wallpaperMode === 'string' &&
    WALLPAPER_MODE_SET.has(raw.wallpaperMode as WallpaperMode)
      ? (raw.wallpaperMode as WallpaperMode)
      : DEFAULT_THEME_SETTINGS.wallpaperMode;
  const landingTab =
    typeof raw.landingTab === 'string' &&
    LANDING_TAB_SET.has(raw.landingTab as LandingTabId)
      ? (raw.landingTab as LandingTabId)
      : DEFAULT_THEME_SETTINGS.landingTab;
  const visibleTabs = asRecord(raw.visibleTabs);
  const footerBranding =
    typeof raw.footerBranding === 'string' &&
    FOOTER_BRANDING_SET.has(
      raw.footerBranding as ThemeSettings['footerBranding'],
    )
      ? (raw.footerBranding as ThemeSettings['footerBranding'])
      : DEFAULT_THEME_SETTINGS.footerBranding;

  return {
    preset,
    wallpaperMode,
    wallpaperUrl:
      typeof raw.wallpaperUrl === 'string'
        ? raw.wallpaperUrl
        : DEFAULT_THEME_SETTINGS.wallpaperUrl,
    accentColor: isSafeColor(raw.accentColor)
      ? raw.accentColor
      : THEME_PRESETS[preset].defaultAccent,
    customTextColor: isSafeColor(raw.customTextColor)
      ? raw.customTextColor
      : DEFAULT_THEME_SETTINGS.customTextColor,
    landingTab,
    visibleTabs: {
      recommendations:
        typeof visibleTabs.recommendations === 'boolean'
          ? visibleTabs.recommendations
          : DEFAULT_THEME_SETTINGS.visibleTabs.recommendations,
      gallery:
        typeof visibleTabs.gallery === 'boolean'
          ? visibleTabs.gallery
          : DEFAULT_THEME_SETTINGS.visibleTabs.gallery,
      business:
        typeof visibleTabs.business === 'boolean'
          ? visibleTabs.business
          : DEFAULT_THEME_SETTINGS.visibleTabs.business,
    },
    footerBranding,
    recommendations: normalizeRecommendationsPresentation(raw.recommendations),
  };
}

export function mergeThemeSettingsWire(
  raw: unknown,
  patch: KnownThemeSettingsPatch,
): ThemeSettingsWire {
  const current = asRecord(raw);
  const { recommendations, ...themePatch } = patch;
  const merged: ThemeSettingsWire = { ...current, ...themePatch };

  if (recommendations) {
    merged.recommendations = {
      ...asRecord(current.recommendations),
      ...recommendations,
      categoryOrder: [...recommendations.categoryOrder],
    };
  }

  return merged;
}

export function mergeSocialMediaWire(
  raw: unknown,
  themePatch: KnownThemeSettingsPatch,
): SocialMediaWire {
  const current = asRecord(raw);
  return {
    ...current,
    theme_settings: mergeThemeSettingsWire(
      current.theme_settings,
      themePatch,
    ),
  };
}

export function isRecommendationCategoryVisible(
  account: Record<string, unknown>,
  id: RecommendationCategoryId,
): boolean {
  const metadata = METADATA_BY_ID.get(id);
  if (!metadata) return false;
  const value = account[metadata.visibilityField];
  if (value === 'Yes') return true;
  return metadata.legacyEnabledWhenMissing && (value === null || value === undefined);
}

export function getPreferredRecommendationCategory(
  landingTab?: LandingTabId | string | null,
): RecommendationCategoryId | undefined {
  return typeof landingTab === 'string' &&
    RECOMMENDATION_CATEGORY_SET.has(landingTab)
    ? (landingTab as RecommendationCategoryId)
    : undefined;
}

export function resolveInitialPublicProfileTab({
  landingTab,
  hasVisibleRecommendationCategories,
  hasGallery,
  hasBusiness,
}: {
  landingTab?: LandingTabId | string | null;
  hasVisibleRecommendationCategories: boolean;
  hasGallery: boolean;
  hasBusiness: boolean;
}): PublicProfileTab {
  if (landingTab === 'gallery' && hasGallery) return 'gallery';
  if (landingTab === 'business' && hasBusiness) return 'business';
  if (hasVisibleRecommendationCategories) return 'recommendations';
  if (hasGallery) return 'gallery';
  if (hasBusiness) return 'business';
  return 'recommendations';
}

export function orderEligibleRecommendationCategoryIds({
  savedOrder,
  eligible,
  preferred,
}: {
  savedOrder: readonly RecommendationCategoryId[];
  eligible: readonly RecommendationCategoryId[];
  preferred?: RecommendationCategoryId;
}): RecommendationCategoryId[] {
  const eligibleSet = new Set(eligible);
  const seen = new Set<RecommendationCategoryId>();
  const ordered = savedOrder.filter((id) => {
    if (!eligibleSet.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  for (const id of eligible) {
    if (!seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }

  if (preferred && eligibleSet.has(preferred)) {
    return [preferred, ...ordered.filter((id) => id !== preferred)];
  }

  return ordered;
}
