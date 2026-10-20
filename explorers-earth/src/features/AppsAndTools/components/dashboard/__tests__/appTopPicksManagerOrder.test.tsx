import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppTopPicksManager from '../AppTopPicksManager';

vi.mock('../../../api/query', () => ({ useAppsCommands: () => ({ savePins: vi.fn(), loading: false }), useAppsCallerCustody: () => () => () => true }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
afterEach(cleanup);

const app = (n: number, pin: number | null) => ({ documentId: `a${n}`, title: `App ${n}`, logo_url: null, is_pinned: pin !== null, pin_order: pin }) as never;

describe('app Top Picks ordering controls', () => {
  it('labels the move buttons by app and announces the move', () => {
    render(<AppTopPicksManager apps={[app(1, 0), app(2, 1)]} allApps={[app(1, 0), app(2, 1)]} onClose={() => {}} onRefetch={() => {}} listId="l" />);
    fireEvent.click(screen.getByRole('button', { name: 'Move App 2 up' }));
    expect(screen.getByRole('status').textContent).toBe('App 2 moved to position 1 of 2.');
    expect(screen.getByRole('button', { name: 'Move App 1 down' })).toBeDisabled();
  });

  it('says why the pin buttons are disabled once fifteen are pinned', () => {
    const pinned = Array.from({ length: 15 }, (_, i) => app(i + 1, i));
    render(<AppTopPicksManager apps={pinned} allApps={[...pinned, app(16, null)]} onClose={() => {}} onRefetch={() => {}} listId="l" />);
    expect(screen.getByText('Top Picks are full (15). Unpin one to pin another.')).toBeInTheDocument();
  });
});
