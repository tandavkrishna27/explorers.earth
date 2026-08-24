import {
  RECOMMENDATION_CATEGORY_IDS,
  ThemeTokenConfig,
  ThemeSettings,
  ThemePresetId,
} from '../types/themeTypes';

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  preset: 'cinematic-dark',
  wallpaperMode: 'banner-top',
  wallpaperUrl: '',
  accentColor: '#10B981',
  customTextColor: '',
  landingTab: 'all-recommendations',
  visibleTabs: {
    recommendations: true,
    gallery: true,
    business: true,
  },
  footerBranding: 'enabled',
  recommendations: {
    layout: 'shelves',
    categoryOrder: [...RECOMMENDATION_CATEGORY_IDS],
  },
};

export const THEME_PRESETS: Record<ThemePresetId, ThemeTokenConfig> = {
  'cinematic-dark': {
    id: 'cinematic-dark',
    name: 'Cinematic Dark',
    description: 'Deep OLED black background with glowing emerald highlights',
    defaultAccent: '#10B981',
    styles: {
      bgPage: '#090D16',
      bgCard: '#111827',
      borderCard: 'rgba(255, 255, 255, 0.1)',
      textPrimary: '#FFFFFF',
      textSecondary: '#9CA3AF',
      backdropBlur: 'none',
      navBg: 'rgba(42, 42, 42, 0.9)',
    },
  },
  'glassmorphism': {
    id: 'glassmorphism',
    name: 'Glassmorphism Frost',
    description: 'Translucent frosted glass containers with soft cyan accents',
    defaultAccent: '#38BDF8',
    styles: {
      bgPage: '#0F172A',
      bgCard: 'rgba(255, 255, 255, 0.07)',
      borderCard: 'rgba(255, 255, 255, 0.2)',
      textPrimary: '#FFFFFF',
      textSecondary: '#94A3B8',
      backdropBlur: 'backdrop-blur-md',
      navBg: 'rgba(15, 23, 42, 0.8)',
    },
  },
  'sunset-glow': {
    id: 'sunset-glow',
    name: 'Sunset Glow',
    description: 'Warm twilight violet to magenta gradients with glowing highlights',
    defaultAccent: '#EC4899',
    styles: {
      bgPage: '#1A0B2E',
      bgCard: '#2D124D',
      borderCard: '#3B1766',
      textPrimary: '#FFFFFF',
      textSecondary: '#E9D5FF',
      backdropBlur: 'none',
      navBg: 'rgba(26, 11, 46, 0.9)',
    },
  },
  'minimal-light': {
    id: 'minimal-light',
    name: 'Minimal Light',
    description: 'Crisp clean white background with dark slate typography',
    defaultAccent: '#0F172A',
    styles: {
      bgPage: '#F8FAFC',
      bgCard: '#FFFFFF',
      borderCard: '#E2E8F0',
      textPrimary: '#0F172A',
      textSecondary: '#64748B',
      backdropBlur: 'none',
      navBg: 'rgba(255, 255, 255, 0.95)',
    },
  },
  'emerald-nature': {
    id: 'emerald-nature',
    name: 'Emerald Nature',
    description: 'Dark forest charcoal with organic green accents',
    defaultAccent: '#059669',
    styles: {
      bgPage: '#064E3B',
      bgCard: '#047857',
      borderCard: 'rgba(255, 255, 255, 0.15)',
      textPrimary: '#FFFFFF',
      textSecondary: '#A7F3D0',
      backdropBlur: 'none',
      navBg: 'rgba(6, 78, 59, 0.9)',
    },
  },
  'neon-cyber': {
    id: 'neon-cyber',
    name: 'Neon Cyber',
    description: 'Ultra dark background with vibrant neon highlights',
    defaultAccent: '#F43F5E',
    styles: {
      bgPage: '#030712',
      bgCard: '#111827',
      borderCard: '#F43F5E',
      textPrimary: '#FFFFFF',
      textSecondary: '#FCA5A5',
      backdropBlur: 'none',
      navBg: 'rgba(3, 7, 18, 0.95)',
    },
  },
};

export function getThemeTokenStyles(settings?: Partial<ThemeSettings>): Record<string, string> {
  const safeSettings = { ...DEFAULT_THEME_SETTINGS, ...settings };
  const presetConfig = THEME_PRESETS[safeSettings.preset] || THEME_PRESETS['cinematic-dark'];
  const accent = safeSettings.accentColor || presetConfig.defaultAccent;
  const textPrimary = safeSettings.customTextColor || presetConfig.styles.textPrimary;

  return {
    '--bg-page': presetConfig.styles.bgPage,
    '--bg-card': presetConfig.styles.bgCard,
    '--border-card': presetConfig.styles.borderCard,
    '--text-primary': textPrimary,
    '--text-secondary': presetConfig.styles.textSecondary,
    '--accent-color': accent,
    '--nav-bg': presetConfig.styles.navBg,
  };
}
