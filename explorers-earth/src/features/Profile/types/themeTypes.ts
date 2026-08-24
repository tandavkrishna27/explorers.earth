export type ThemePresetId =
  | 'cinematic-dark'
  | 'glassmorphism'
  | 'sunset-glow'
  | 'minimal-light'
  | 'emerald-nature'
  | 'neon-cyber';

export type WallpaperMode =
  | 'banner-top'
  | 'full-wallpaper-image'
  | 'ambient-gradient'
  | 'solid-color';

export type LandingTabId =
  | 'all-recommendations'
  | 'places'
  | 'music'
  | 'guides'
  | 'movies'
  | 'books'
  | 'games'
  | 'apps'
  | 'products'
  | 'people'
  | 'gallery'
  | 'business';

export const RECOMMENDATION_CATEGORY_IDS = [
  'places',
  'music',
  'movies',
  'books',
  'games',
  'guides',
  'apps',
  'products',
  'people',
] as const;

export type RecommendationCategoryId =
  (typeof RECOMMENDATION_CATEGORY_IDS)[number];

export type RecommendationsLayout = 'shelves' | 'grid' | 'featured';

export interface RecommendationCategoryMetadata {
  id: RecommendationCategoryId;
  labelKey: string;
  visibilityField:
    | 'public_recommendations'
    | 'public_music'
    | 'public_movie'
    | 'public_books'
    | 'public_games'
    | 'public_guides'
    | 'public_apps'
    | 'public_products'
    | 'public_people';
  legacyEnabledWhenMissing: boolean;
}

export interface RecommendationsPresentationWire {
  layout?: unknown;
  categoryOrder?: unknown;
  [futureKey: string]: unknown;
}

export interface ThemeSettingsWire {
  preset?: unknown;
  wallpaperMode?: unknown;
  wallpaperUrl?: unknown;
  accentColor?: unknown;
  customTextColor?: unknown;
  landingTab?: unknown;
  visibleTabs?: unknown;
  footerBranding?: unknown;
  recommendations?: RecommendationsPresentationWire | null;
  [futureKey: string]: unknown;
}

export interface SocialMediaWire {
  theme_settings?: ThemeSettingsWire | null;
  [futureKey: string]: unknown;
}

export interface NormalizedRecommendationsPresentationSettings {
  layout: RecommendationsLayout;
  categoryOrder: RecommendationCategoryId[];
}

export interface ThemeSettings {
  preset: ThemePresetId;
  wallpaperMode: WallpaperMode;
  wallpaperUrl?: string;
  accentColor: string;
  customTextColor?: string;
  landingTab: LandingTabId;
  visibleTabs: {
    recommendations: boolean;
    gallery: boolean;
    business: boolean;
  };
  footerBranding: 'enabled' | 'minimal' | 'disabled';
  recommendations: NormalizedRecommendationsPresentationSettings;
}

export interface ThemeTokenConfig {
  id: ThemePresetId;
  name: string;
  description: string;
  defaultAccent: string;
  styles: {
    bgPage: string;
    bgCard: string;
    borderCard: string;
    textPrimary: string;
    textSecondary: string;
    backdropBlur: string;
    navBg: string;
  };
}
