import React from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryVisibilityModal } from '../CategoryVisibilityModal';
import { useCategoryNavigation } from '../../features/navigation/CategoryNavigationProvider';
import { loginSurface, ordinaryCategories, surfaceHarness } from '../../features/navigation/__tests__/surfaceHarness';
import useAuthStore from '../../store/store';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Canonical row order and the pins surfaceAccount is seeded with (public_music,
// public_books), used to assert publishing carries them through untouched.
const CANONICAL_ORDER = ['places', 'music', 'guides', 'movies', 'books', 'games', 'apps', 'products', 'people'] as const;
const SAVED_PINS: Record<string, number> = { music: 0, books: 1 };
function Prompt({ category, onSuccess = vi.fn() }: { category: string; onSuccess?: () => void }) {
  const navigation = useCategoryNavigation();
  const [origin, setOrigin] = React.useState<any>();
  return <><button disabled={!navigation.authority} onClick={() => setOrigin(navigation.authority)}>Open prompt</button>
    {origin && <CategoryVisibilityModal isOpen onClose={() => {}} categoryName="Category" visibilityField={category} accountDocumentId={origin.accountDocumentId} onSuccess={onSuccess} {...{ origin }} />}</>;
}
describe('CategoryVisibilityModal verified publication', () => {
  beforeEach(loginSurface);
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); vi.clearAllMocks(); });
  it.each(ordinaryCategories)('publishes only %s without adding a pin', async category => {
    const h = surfaceHarness(<Prompt category={category} />, { initial: { [category]: 'No' } }); await h.ready();
    fireEvent.click(screen.getByText('Open prompt')); fireEvent.click(await screen.findByRole('button', { name: 'Yes, Make Public' }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    const input = h.writes[0].variables.input;
    expect(input.expectedRevision).toBe(1);
    // The prompted category was the only non-public one, so every row ends public, and
    // the saved pins come through unchanged - publishing must never add a pin.
    expect(input.categories).toEqual(CANONICAL_ORDER.map((key, displayOrder) => ({
      category: key, displayOrder, isPublic: true, pinnedOrder: SAVED_PINS[key] ?? null })));
  });
  it.each(['switch', 'switch-back', 'logout-login'])('rejects stale confirmation after %s', async transition => {
    const h = surfaceHarness(<Prompt category="public_books" />, { initial: { public_books: 'No' } }); await h.ready();
    fireEvent.click(screen.getByText('Open prompt'));
    await act(async () => { if (transition === 'logout-login') useAuthStore.getState().logout(); else loginSurface('u2'); if (transition !== 'switch') loginSurface(); });
    await h.ready(); const confirm = screen.queryByRole('button', { name: 'Yes, Make Public' });
    if (confirm) fireEvent.click(confirm);
    await act(async () => { await Promise.resolve(); }); expect(h.writes).toEqual([]);
  });
  it('keeps the prompt open with an error if post-confirmation save cannot be verified', async () => {
    const success = vi.fn(); const h = surfaceHarness(<Prompt category="public_books" onSuccess={success} />, { initial: { public_books: 'No' } }); await h.ready(); h.failMutation = true;
    fireEvent.click(screen.getByText('Open prompt')); fireEvent.click(await screen.findByRole('button', { name: 'Yes, Make Public' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument(); expect(success).not.toHaveBeenCalled();
  });
});
