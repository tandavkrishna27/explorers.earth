import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Settings from '../Settings';
import { loginSurface, surfaceHarness } from '../../navigation/__tests__/surfaceHarness';
import useAuthStore from '../../../store/store';
vi.mock('../../Profile/api/useCanonicalAccount', () => ({ useCanonicalAccount: () => ({ data: { id: '11111111-1111-4111-8111-111111111111', revision: 1 }, isLoading: false }) }));
vi.mock('../components/ProfileAccountSettings', () => ({ default: () => null }));
vi.mock('../components/BillingTab', () => ({ default: () => null }));
vi.mock('../components/LanguageSelector', () => ({ default: () => null, LANGUAGES: [{ code: 'en', name: 'English' }] }));
beforeEach(() => { vi.restoreAllMocks(); loginSurface('distinct-auth-user'); window.history.replaceState(null, '', '/settings#public-navigation'); });
afterEach(() => { cleanup(); useAuthStore.getState().logout(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('publishes and hides native categories through mounted handlers with the public panel scroll callback queued', async () => {
  const h = surfaceHarness(<Settings />, { initial: { public_books: 'No', public_movie: 'No', public_games: 'No', pinned_nav_tabs: ['public_profile'] } });
  await h.ready();
  const queued: Array<() => void> = [];
  const original = window.setTimeout.bind(window);
  vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 100 && typeof handler === 'function') { queued.push(() => handler(...args)); return 0; }
    return original(handler, delay, ...args);
  }) as typeof window.setTimeout);
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 2000, left: 0, right: 300, height: 2000, width: 300, x: 0, y: 0, toJSON: () => ({}) });
  fireEvent.click(screen.getByRole('button', { name: /Public Visibility/i }));
  expect(queued).toHaveLength(1);
  let writes = 0;
  for (const [field, label] of [['public_books', 'Books Tab'], ['public_movie', 'Movies & Shows Tab'], ['public_games', 'Games Tab']] as const) {
    const control = within(screen.getByRole('region', { name: 'Public visibility settings' })).getByRole('checkbox', { name: label });
    expect(control).not.toBeChecked();
    expect(control).toBeEnabled();
    fireEvent.click(control);
    if (field === 'public_books') act(() => queued.forEach(callback => callback()));
    await waitFor(() => { expect(h.saved[field]).toBe('Yes'); expect(control).toBeChecked(); expect(control).toBeEnabled(); });
    expect(h.writes).toHaveLength(++writes);
    fireEvent.click(control);
    await waitFor(() => { expect(h.saved[field]).toBe('No'); expect(control).not.toBeChecked(); expect(control).toBeEnabled(); });
    expect(h.writes).toHaveLength(++writes);
  }
  expect(h.writes.map(write => write.variables.input.expectedRevision)).toEqual([1, 2, 3, 4, 5, 6]);
});
