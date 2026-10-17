import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getThemeTokenStyles, THEME_PRESETS } from '../features/Profile/constants/themePresets';

type Rgb = { red: number; green: number; blue: number };

const parseOpaqueHex = (value: string | undefined): Rgb => {
  expect(value, 'expected an opaque colour token').toEqual(expect.stringMatching(/^#[0-9a-f]{6}$/i));
  const hex = value!.slice(1);
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  };
};

const luminance = ({ red, green, blue }: Rgb) => {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (0.2126 * channel(red)) + (0.7152 * channel(green)) + (0.0722 * channel(blue));
};

const contrast = (foreground: string | undefined, background: string | undefined) => {
  const foregroundLuminance = luminance(parseOpaqueHex(foreground));
  const backgroundLuminance = luminance(parseOpaqueHex(background));
  const light = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (light + 0.05) / (dark + 0.05);
};

describe('Theme CSS Contrast Variables', () => {
  it('should define distinct background color variables for light and dark themes', () => {
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');

    expect(cssContent).toContain('--dash-sidebar-bg: #ffffff;');
    expect(cssContent).toContain('--dash-sidebar-bg: #14141C;');
  });

  it.each(Object.keys(THEME_PRESETS))('resolves opaque, contrast-safe public chrome tokens for %s', (preset) => {
    const styles = getThemeTokenStyles({ preset: preset as keyof typeof THEME_PRESETS });
    const surface = styles['--public-chrome-surface'];

    expect(contrast(styles['--public-chrome-ink'], surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(styles['--public-chrome-icon'], surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(styles['--public-chrome-border'], surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(styles['--public-chrome-focus'], surface)).toBeGreaterThanOrEqual(3);
  });

  it.each(
    Object.keys(THEME_PRESETS).flatMap((preset) =>
      ['#000000', '#FFFFFF', THEME_PRESETS[preset as keyof typeof THEME_PRESETS].styles.bgCard]
        .map((customTextColor) => [preset, customTextColor] as const),
    ),
  )('keeps %s chrome independent from the custom body ink boundary %s', (preset, customTextColor) => {
    const styles = getThemeTokenStyles({
      preset: preset as keyof typeof THEME_PRESETS,
      customTextColor,
    });
    expect(styles['--text-primary']).toBe(customTextColor);
    expect(contrast(styles['--public-chrome-ink'], styles['--public-chrome-surface'])).toBeGreaterThanOrEqual(4.5);
  });
});
