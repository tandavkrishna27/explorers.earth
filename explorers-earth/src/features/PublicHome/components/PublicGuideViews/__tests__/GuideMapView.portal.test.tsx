import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { forwardRef, StrictMode, type CSSProperties, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GuideMapView from '../GuideMapView';
import { PublicCategoryThemeProvider } from '../../PublicCategoryThemeContext';

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  AdvancedMarker: forwardRef<HTMLDivElement, { children?: ReactNode }>(({ children }, ref) => <div ref={ref}>{children}</div>),
  Map: ({ children }: { children?: ReactNode }) => <div data-map-id="guide-map">{children}</div>,
  Pin: () => <span aria-hidden="true" />,
  useMap: () => null,
}));

vi.mock('../../../../Guides/utils/guideDataParser', () => ({
  parseTimeline: () => ({
    morning: [{
      geometry: { location: { lat: 15.2993, lng: 74.124 } },
      name: 'Fixture place',
      place_id: 'fixture-place',
    }],
    afternoon: [],
    evening: [],
  }),
}));

describe('GuideMapView public portal stacking', () => {
  it('copies the category palette to its body portal without changing its viewport geometry', () => {
    render(<PublicCategoryThemeProvider styles={{ '--category-page': '#F8FAFC', '--category-panel': '#FFFFFF', '--category-text': '#0F172A' }}>
      <GuideMapView sections={[{ Sequence: 1, Timeline: 'fixture' }]} guide={{}} isMapView onCloseMap={vi.fn()} />
    </PublicCategoryThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Expand map' }));
    const portal = document.querySelector<HTMLElement>('[data-public-guide-map-portal]')!;
    expect(portal.parentElement).toBe(document.body);
    expect(portal.style.getPropertyValue('--category-page')).toBe('#F8FAFC');
    expect(portal.style.width).toBe('100vw');
    expect(portal.style.height).toBe('100vh');
  });
  afterEach(() => {
    document.querySelectorAll('style[data-guide-map-portal-test]').forEach(style => style.remove());
  });

  it('places the non-fullscreen Expand map control below the public reserved header with a standalone fallback', () => {
    render(
      <GuideMapView
        sections={[{ Sequence: 1, Timeline: 'fixture' }]}
        guide={{}}
        isMapView
        onCloseMap={vi.fn()}
      />,
    );

    const expand = screen.getByRole('button', { name: 'Expand map' });
    expect(expand).toHaveStyle({
      top: 'calc(var(--public-header-reserved-offset, 0px) + 1rem)',
    });
    expect(expand).toHaveClass('min-h-11', 'min-w-11', 'items-center', 'justify-center');
  });

  it('keeps the nested fullscreen map in the public map-controls layer', () => {
    const styles = document.createElement('style');
    styles.dataset.guideMapPortalTest = 'true';
    styles.textContent = readFileSync(
      path.resolve(__dirname, '../../PublicBranding.css'),
      'utf8',
    );
    document.head.append(styles);

    const view = render(
      <StrictMode>
        <div
          className="public-profile-shell"
          data-public-profile-chrome
          style={{ '--z-public-map-controls': '40' } as CSSProperties}
        >
          <div className="public-profile-content-layer">
            <GuideMapView
              sections={[{ Sequence: 1, Timeline: 'fixture' }]}
              guide={{}}
              isMapView
              onCloseMap={vi.fn()}
            />
          </div>
          <header className="public-brand-header">
            <button type="button">Shared Share</button>
          </header>
        </div>
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand map' }));

    const portal = document.body.querySelector<HTMLElement>('[data-public-guide-map-portal]');
    expect(portal).toBeInTheDocument();
    expect(portal?.parentElement).toBe(document.body);
    expect(portal).toHaveClass('public-guide-map-portal');
    expect(portal).toHaveClass('bg-black');
    expect(portal?.style.getPropertyValue('--category-page')).toBe('');
    expect(getComputedStyle(portal!).zIndex).toBe('var(--z-public-map-controls)');
    expect(screen.getAllByRole('button', { name: 'List View' }).at(-1)).toHaveClass('min-h-11');

    view.unmount();
    expect(document.body.querySelector('[data-public-guide-map-portal]')).not.toBeInTheDocument();
  });

  it('keeps the collapsed toggle reachable while hiding and inerting the card rail', async () => {
    const user = userEvent.setup();
    render(
      <GuideMapView
        sections={[{ Sequence: 1, Timeline: 'fixture' }]}
        guide={{}}
        isMapView
        onCloseMap={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Collapse cards' });
    const tray = document.querySelector<HTMLElement>('[data-public-guide-map-tray]')!;
    const rail = document.querySelector<HTMLElement>('[data-public-guide-map-card-rail]')!;
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveClass('min-h-11', 'min-w-11', 'inline-flex', 'items-center', 'justify-center');
    expect(tray).toHaveStyle({ bottom: 'calc(var(--public-nav-reserved-bottom) + var(--public-guide-tray-gap))' });
    expect(rail).toHaveAttribute('aria-hidden', 'false');
    expect(rail).not.toHaveAttribute('inert');

    await user.click(toggle);
    const expand = screen.getByRole('button', { name: 'Expand cards' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(tray).toHaveStyle({ transform: 'translateY(calc(100% - var(--public-guide-tray-visible-height) + var(--public-guide-tray-gap)))' });
    expect(rail).toHaveAttribute('aria-hidden', 'true');
    expect(rail).toHaveAttribute('inert');
    expect(rail).toHaveStyle({ visibility: 'hidden' });

    await user.tab();
    expect(document.activeElement).not.toBe(rail.querySelector('[role="button"]'));
    await user.click(expand);
    expect(screen.getByRole('button', { name: 'Collapse cards' })).toHaveAttribute('aria-expanded', 'true');
    expect(rail).toHaveAttribute('aria-hidden', 'false');
    expect(rail).not.toHaveAttribute('inert');
    expect(rail).toHaveStyle({ visibility: 'visible' });
  });
});
