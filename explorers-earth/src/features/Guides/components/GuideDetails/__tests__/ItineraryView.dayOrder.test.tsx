import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ItineraryView from '../ItineraryView';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
// The vertical timeline observes each element; jsdom has no IntersectionObserver.
const stubObserver = () => vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });

const noop = () => undefined;
const section = (id: string, Sequence: number, Title: string) => ({ documentId: id, Sequence, Title, Description: `About ${Title}`, Timeline: { morning: [], afternoon: [], evening: [] } });
const view = (viewMode: 'list' | 'timeline', sections: ReturnType<typeof section>[], dayOrder?: React.ComponentProps<typeof ItineraryView>['dayOrder']) => (
  <ItineraryView sections={sections} viewMode={viewMode} onViewModeChange={noop} onAddSection={noop} onSectionSelect={noop}
    onSectionEdit={noop} onSectionDelete={noop} openMenuId={null} deletingSection={null} kebabRefs={{ current: {} }} onMenuToggle={noop} dayOrder={dayOrder} />
);

it.each(['list', 'timeline'] as const)('offers day reordering in the %s view', (mode) => {
  stubObserver();
  render(view(mode, [section('a', 1, 'Alpha'), section('b', 2, 'Beta')], { open: false, onOpenChange: noop, onReorder: async () => {} }));
  expect(screen.getByRole('button', { name: 'Reorder days' })).toBeVisible();
});

it('numbers the list view from the saved order, so a reordered day takes its new number', () => {
  // The server renumbers on reorder; Beta now arrives as Sequence 1 and Alpha as 2.
  render(view('list', [section('a', 2, 'Day 1: Alpha'), section('b', 1, 'Day 2: Beta')]));
  const headings = screen.getAllByText(/^Day [12]$/).map(node => node.textContent);
  expect(headings).toEqual(['Day 1', 'Day 2']);
  const body = document.body.textContent ?? '';
  expect(body.indexOf('Beta')).toBeLessThan(body.indexOf('Alpha'));
  // Titles typed with a stale "Day N:" prefix do not contradict the number beside them.
  expect(screen.queryByText('Day 2: Beta')).toBeNull();
});

it('hides the control where no reorder handler is supplied', () => {
  render(view('list', [section('a', 1, 'Alpha'), section('b', 2, 'Beta')]));
  expect(screen.queryByRole('button', { name: 'Reorder days' })).toBeNull();
});
