import { render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import ItineraryView from '../ItineraryView';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => children,
  motion: {
    div: ({ initial: _initial, animate: _animate, exit: _exit, transition: _transition, whileHover: _whileHover, ...props }: HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props} />,
  },
}));

// Local acceptance 2026-10: in List view a section with no places returned null, so an
// owner who wrote a day as title and overview alone saw an empty itinerary.
it('lists a section that has a title and overview but no places', () => {
  render(
    <ItineraryView
      sections={[{ documentId: 'section-1', Sequence: 1, Title: 'Day 1: Higashiyama', Description: 'Temples and tea in the old town.', Timeline: { morning: [], afternoon: [], evening: [] } }]}
      viewMode="list"
      onViewModeChange={() => undefined}
      onAddSection={() => undefined}
      onSectionSelect={() => undefined}
      onSectionEdit={() => undefined}
      onSectionDelete={() => undefined}
      openMenuId={null}
      deletingSection={null}
      kebabRefs={{ current: {} }}
      onMenuToggle={() => undefined}
    />,
  );
  expect(screen.getByText('Higashiyama')).toBeVisible();
  expect(screen.getByText('Temples and tea in the old town.')).toBeVisible();
});
