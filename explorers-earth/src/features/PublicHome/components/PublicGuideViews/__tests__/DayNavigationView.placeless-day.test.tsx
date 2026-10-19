import { render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import DayNavigationView from '../DayNavigationView';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => children,
  motion: {
    div: ({ initial: _initial, animate: _animate, exit: _exit, transition: _transition, whileHover: _whileHover, ...props }: HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props} />,
  },
}));

// Local acceptance 2026-10: a day written without any places (its title and overview
// only) rendered just "No places available for this day." on the public guide.
it('shows the title and overview of a day that has no places', () => {
  render(
    <DayNavigationView
      sections={[{ Sequence: 1, Title: 'Day 1: Higashiyama', Description: 'Temples and tea in the old town.', Timeline: { morning: [], afternoon: [], evening: [] } }]}
      guide={{}}
      selectedDay="day-1"
    />,
  );
  expect(screen.getByText(/Higashiyama/)).toBeVisible();
  expect(screen.getByText('Temples and tea in the old town.')).toBeVisible();
});
