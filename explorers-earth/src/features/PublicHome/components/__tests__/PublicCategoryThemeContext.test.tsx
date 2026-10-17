import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ThemePresetId, ThemeSettings } from '../../../Profile/types/themeTypes';
import {
  getPublicCategoryThemeStyles,
  PublicCategoryThemeProvider,
  usePublicCategoryThemeStyles,
} from '../PublicCategoryThemeContext';

function makeTheme(preset: ThemePresetId, accentColor: string, customTextColor = ''): ThemeSettings {
  return {
    preset,
    wallpaperMode: 'solid-color',
    wallpaperUrl: '',
    accentColor,
    customTextColor,
    landingTab: 'all-recommendations',
    visibleTabs: { recommendations: true, gallery: true, business: true },
    footerBranding: 'enabled',
    recommendations: {
      layout: 'shelves',
      categoryOrder: ['places', 'movies', 'books', 'games', 'guides', 'apps', 'products', 'people'],
    },
  };
}

function CategoryContextProbe() {
  const styles = usePublicCategoryThemeStyles();
  return <output data-testid="category-context-probe">{styles?.['--category-page'] ?? 'none'}</output>;
}

type Rgb = readonly [number, number, number];

function relativeLuminance([red, green, blue]: Rgb): number {
  const linearize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function mixSrgb(foreground: Rgb, foregroundWeight: number, background: Rgb): Rgb {
  const backgroundWeight = 1 - foregroundWeight;
  return [
    foreground[0] * foregroundWeight + background[0] * backgroundWeight,
    foreground[1] * foregroundWeight + background[1] * backgroundWeight,
    foreground[2] * foregroundWeight + background[2] * backgroundWeight,
  ];
}

describe('PublicCategoryThemeContext', () => {
  it('defaults to null outside a category provider', () => {
    render(<CategoryContextProbe />);
    expect(screen.getByTestId('category-context-probe')).toHaveTextContent('none');
  });

  it('provides an explicit category palette', () => {
    render(
      <PublicCategoryThemeProvider styles={{ '--category-page': '#F8FAFC' }}>
        <CategoryContextProbe />
      </PublicCategoryThemeProvider>,
    );
    expect(screen.getByTestId('category-context-probe')).toHaveTextContent('#F8FAFC');
  });

  it('maps the shared cinematic tokens to every category alias', () => {
    expect(getPublicCategoryThemeStyles(makeTheme('cinematic-dark', '#10B981'))).toEqual({
      '--category-page': '#090D16',
      '--category-card': '#111827',
      '--category-panel': '#111827',
      '--category-text': '#FFFFFF',
      '--category-muted': '#9CA3AF',
      '--category-border': 'rgba(255, 255, 255, 0.1)',
      '--category-control-border': '#9CA3AF',
      '--category-accent': '#10B981',
      '--category-accent-ink': '#000000',
      '--category-focus': '#10B981',
      '--category-rating': '#FACC15',
      '--category-hover': 'color-mix(in srgb, var(--category-text) 8%, var(--category-card))',
      '--category-skeleton': 'color-mix(in srgb, var(--category-text) 12%, var(--category-page))',
      '--public-safe-top': 'env(safe-area-inset-top, 0px)',
      '--public-header-reserved-offset': 'calc(var(--public-safe-top) + 80px)',
    });
  });

  it('keeps custom primary and accent colors user-controlled', () => {
    const styles = getPublicCategoryThemeStyles(makeTheme('minimal-light', '#FBBF24', '#7C3AED'));

    expect(styles['--category-text']).toBe('#7C3AED');
    expect(styles['--category-accent']).toBe('#FBBF24');
    expect(styles['--category-accent-ink']).toBe('#000000');
  });

  it.each([
    ['minimal-light', [255, 255, 255], [71, 85, 105]],
    ['cinematic-dark', [17, 24, 39], [156, 163, 175]],
    ['glassmorphism', [15, 23, 42], [148, 163, 184]],
    ['sunset-glow', [45, 18, 77], [233, 213, 255]],
    ['emerald-nature', [6, 78, 59], [209, 250, 229]],
    ['neon-cyber', [17, 24, 39], [252, 165, 165]],
  ] as const)('keeps gold and inactive stars readable on the composited %s rating panel', (preset, panel, inactive) => {
    const styles = getPublicCategoryThemeStyles(makeTheme(preset, '#FFFFFF'));
    expect(styles['--category-rating']).toMatch(/^#[0-9A-F]{6}$/);
    const gold = styles['--category-rating'].slice(1).match(/../g)!.map(channel => parseInt(channel, 16)) as unknown as Rgb;
    const background = mixSrgb([234, 179, 8], .1, panel);
    expect(contrastRatio(gold, background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(inactive, background)).toBeGreaterThanOrEqual(3);
    // Keep a gold/ochre hue, independently of an unsuitable saved accent.
    expect(gold[0]).toBeGreaterThan(gold[1]);
    expect(gold[1]).toBeGreaterThan(gold[2] * 2);
  });

  it('uses the Minimal Light category correction on the page surface', () => {
    const styles = getPublicCategoryThemeStyles(makeTheme('minimal-light', '#0F172A'));

    expect(styles['--category-muted']).toBe('#475569');
    expect(contrastRatio([71, 85, 105], [248, 250, 252])).toBeCloseTo(7.243, 3);
  });

  it('uses the Minimal Light category correction on the card surface', () => {
    const styles = getPublicCategoryThemeStyles(makeTheme('minimal-light', '#0F172A'));

    expect(styles['--category-muted']).toBe('#475569');
    expect(styles['--category-control-border']).toBe('#64748B');
    expect(contrastRatio([71, 85, 105], [255, 255, 255])).toBeCloseTo(7.578, 3);
    expect(contrastRatio([100, 116, 139], [255, 255, 255])).toBeCloseTo(4.759, 3);
  });

  it('uses the Minimal Light category correction on the hovered card surface', () => {
    const styles = getPublicCategoryThemeStyles(makeTheme('minimal-light', '#0F172A'));

    expect(styles['--category-muted']).toBe('#475569');
    expect(styles['--category-hover']).toBe('color-mix(in srgb, var(--category-text) 8%, var(--category-card))');
    expect(contrastRatio([71, 85, 105], [235.8, 236.44, 237.96])).toBeCloseTo(6.438, 3);
  });

  it('uses the exact Emerald muted ink and two-percent hovered-card composition', () => {
    const styles = getPublicCategoryThemeStyles(makeTheme('emerald-nature', '#059669'));
    const hoveredCard = mixSrgb([255, 255, 255], 0.02, [4, 120, 87]);

    expect(styles['--category-muted']).toBe('#D1FAE5');
    expect(styles['--category-hover']).toBe('color-mix(in srgb, var(--category-text) 2%, var(--category-card))');
    expect(contrastRatio([209, 250, 229], [4, 120, 87])).toBeCloseTo(4.835, 3);
    expect(hoveredCard[0]).toBeCloseTo(9.02, 8);
    expect(hoveredCard[1]).toBeCloseTo(122.7, 8);
    expect(hoveredCard[2]).toBeCloseTo(90.36, 8);
    expect(contrastRatio([209, 250, 229], hoveredCard)).toBeCloseTo(4.654, 3);
  });
});
