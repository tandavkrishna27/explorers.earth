import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../routes/AppRoutes', () => ({
  default: () => <main>Current route</main>,
}));
vi.mock('../components/ScrollToTop', () => ({ default: () => null }));
vi.mock('../components/AuthSyncManager', () => ({ default: () => null }));
vi.mock('../components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../features/LandingPage/components/CookieConsent', () => ({
  default: () => <div data-testid="global-cookie-consent" />,
}));

import App from '../App';

describe('App consent boundary', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/tk2727/places');
  });

  it('mounts consent UI for direct public-route visits', () => {
    render(<App />);
    expect(screen.getByTestId('global-cookie-consent')).toBeInTheDocument();
  });
});
