import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import PublicGuideControlPortal from '../PublicGuideControlPortal';
import { PublicCategoryThemeProvider } from '../PublicCategoryThemeContext';
import { getPublicCategoryThemeStyles } from '../PublicCategoryThemeContext';
import { DEFAULT_THEME_SETTINGS } from '../../../Profile/constants/themePresets';

function renderPortal(kind: 'launcher' | 'map', styles: Record<string, string> | null, children: ReactNode = <button>Control</button>) {
  return render(
    <PublicCategoryThemeProvider styles={styles}>
      <PublicGuideControlPortal kind={kind}>{children}</PublicGuideControlPortal>
    </PublicCategoryThemeProvider>,
  );
}

describe('PublicGuideControlPortal', () => {
  it('owns a footprint-only launcher body root and copies the category palette', () => {
    const view = renderPortal('launcher', { '--category-page': '#F8FAFC', '--category-accent': '#0F172A' });
    const root = document.body.querySelector<HTMLElement>('[data-public-guide-map-launcher]')!;

    expect(root.parentElement).toBe(document.body);
    expect(root).toContainElement(screen.getByRole('button', { name: 'Control' }));
    expect(root.style.getPropertyValue('--category-page')).toBe('#F8FAFC');
    expect(root).toHaveClass('public-guide-map-launcher');
    expect(root).not.toHaveClass('inset-0');

    view.unmount();
    expect(document.body.querySelector('[data-public-guide-map-launcher]')).not.toBeInTheDocument();
  });

  it('owns a full-viewport map root and preserves the standalone black fallback', () => {
    const view = renderPortal('map', null);
    const root = document.body.querySelector<HTMLElement>('[data-public-guide-map-surface]')!;

    expect(root.parentElement).toBe(document.body);
    expect(root).toHaveClass('public-guide-map-surface', 'fixed', 'inset-0', 'bg-black');
    expect(root.style.getPropertyValue('--category-page')).toBe('');
    expect(document.body.querySelector('[data-public-guide-map-launcher]')).not.toBeInTheDocument();

    view.unmount();
    expect(document.body.querySelector('[data-public-guide-map-surface]')).not.toBeInTheDocument();
  });

  it('carries the canonical header geometry tokens into themed body roots', () => {
    const styles = getPublicCategoryThemeStyles(DEFAULT_THEME_SETTINGS);
    renderPortal('map', styles);
    const root = document.body.querySelector<HTMLElement>('[data-public-guide-map-surface]')!;

    expect(root.style.getPropertyValue('--public-safe-top')).toBe('env(safe-area-inset-top, 0px)');
    expect(root.style.getPropertyValue('--public-header-reserved-offset')).toBe('calc(var(--public-safe-top) + 80px)');
  });
});
