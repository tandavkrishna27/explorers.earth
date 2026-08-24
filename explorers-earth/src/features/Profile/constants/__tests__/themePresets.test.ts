import { describe, it, expect } from 'vitest';
import { getThemeTokenStyles, THEME_PRESETS } from '../themePresets';

describe('themePresets engine', () => {
  it('returns default cinematic dark styles when no settings are passed', () => {
    const styles = getThemeTokenStyles();
    expect(styles['--bg-page']).toBe(THEME_PRESETS['cinematic-dark'].styles.bgPage);
    expect(styles['--accent-color']).toBe('#10B981');
  });

  it('correctly applies custom accent color and text color overrides', () => {
    const styles = getThemeTokenStyles({
      preset: 'glassmorphism',
      accentColor: '#EC4899',
      customTextColor: '#FFFFFF',
    });
    expect(styles['--bg-page']).toBe(THEME_PRESETS['glassmorphism'].styles.bgPage);
    expect(styles['--accent-color']).toBe('#EC4899');
    expect(styles['--text-primary']).toBe('#FFFFFF');
  });

  it('falls back safely for invalid preset names', () => {
    const styles = getThemeTokenStyles({ preset: 'invalid-preset' as any });
    expect(styles['--bg-page']).toBe(THEME_PRESETS['cinematic-dark'].styles.bgPage);
  });
});
