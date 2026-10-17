import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../routes/AppRoutes', () => ({
  default: () => <main><Link to="/settings">Away</Link><Link to="/">Landing</Link></main>,
}));
vi.mock('../components/ScrollToTop', () => ({ default: () => null }));
vi.mock('../components/AuthSyncManager', () => ({ default: () => null }));
vi.mock('../components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../i18n', () => ({}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import App from '../App';

describe('App consent boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => vi.useRealTimers());

  it.each(['/', '/?utm_source=example#welcome'])('shows the real delayed banner at %s', (path) => {
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(screen.queryByTestId('cookie-consent-positioner')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole('button', { name: 'cookieConsent.acceptAll' })).toBeInTheDocument();
  });

  it.each(['/settings', '/profile', '/home', '/recommendations/music', '/tk2727', '/tk2727/music', '/tk2727/places', '/music/share/example', '/cookies'])('does not mount a delayed banner at %s', (path) => {
    window.history.replaceState({}, '', path);
    render(<App />);
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByTestId('cookie-consent-positioner')).not.toBeInTheDocument();
  });

  it('cancels the landing timer on navigation and starts a fresh delay on return', () => {
    render(<App />);
    act(() => vi.advanceTimersByTime(1_000));
    fireEvent.click(screen.getByRole('link', { name: 'Away' }));
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.queryByTestId('cookie-consent-positioner')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Landing' }));
    act(() => vi.advanceTimersByTime(1_999));
    expect(screen.queryByTestId('cookie-consent-positioner')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('cookie-consent-positioner')).toBeInTheDocument();
  });

  it('honors the persisted rejection when the landing banner remounts', () => {
    render(<App />);
    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.click(screen.getByRole('button', { name: 'cookieConsent.rejectNonEssential' }));
    expect(JSON.parse(localStorage.getItem('explorers-cookie-consent')!)).toMatchObject({ analytics: false });
    fireEvent.click(screen.getByRole('link', { name: 'Away' }));
    fireEvent.click(screen.getByRole('link', { name: 'Landing' }));
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByTestId('cookie-consent-positioner')).not.toBeInTheDocument();
  });
});
