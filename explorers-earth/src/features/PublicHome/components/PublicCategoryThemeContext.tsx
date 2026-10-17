import { createContext, useContext, type ReactNode } from 'react';
import { getThemeTokenStyles } from '../../Profile/constants/themePresets';
import type { ThemeSettings } from '../../Profile/types/themeTypes';
import { getMusicAccentInk } from '../../music/publicMusicPresentation';

type PublicCategoryThemeStyles = Record<string, string> | null;

const PublicCategoryThemeContext = createContext<PublicCategoryThemeStyles>(null);

export function PublicCategoryThemeProvider({ styles, children }: { styles: PublicCategoryThemeStyles; children: ReactNode }) {
  return <PublicCategoryThemeContext.Provider value={styles}>{children}</PublicCategoryThemeContext.Provider>;
}

export function usePublicCategoryThemeStyles(): PublicCategoryThemeStyles {
  return useContext(PublicCategoryThemeContext);
}

export function getPublicCategoryThemeStyles(theme: ThemeSettings): Record<string, string> {
  const base = getThemeTokenStyles(theme);

  return {
    '--public-safe-top': base['--public-safe-top'],
    '--public-header-reserved-offset': base['--public-header-reserved-offset'],
    '--category-page': base['--bg-page'],
    '--category-card': base['--bg-card'],
    '--category-panel': base['--public-chrome-surface'],
    '--category-text': base['--text-primary'],
    '--category-muted': theme.preset === 'emerald-nature'
      ? '#D1FAE5'
      : theme.preset === 'minimal-light'
        ? '#475569'
        : base['--text-secondary'],
    '--category-border': base['--border-card'],
    '--category-control-border': base['--public-chrome-border'],
    '--category-accent': base['--accent-color'],
    '--category-accent-ink': getMusicAccentInk(base['--accent-color']),
    '--category-focus': base['--public-chrome-focus'],
    // Essential gold rating stars need an ochre shade on the light panel.
    '--category-rating': theme.preset === 'minimal-light' ? '#A16207' : '#FACC15',
    '--category-hover': theme.preset === 'emerald-nature'
      ? 'color-mix(in srgb, var(--category-text) 2%, var(--category-card))'
      : 'color-mix(in srgb, var(--category-text) 8%, var(--category-card))',
    '--category-skeleton': 'color-mix(in srgb, var(--category-text) 12%, var(--category-page))',
  };
}
