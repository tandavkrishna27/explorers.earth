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

const place = (id: string, name: string, lat: number) => ({ id: `day-${id}`, place_id: `g-${id}`, name, geometry: { location: { lat, lng: 77.5946 } } });

// UAT GDE-X05: the public guide showed travel only when a saved segment matched by Google id,
// but the form saves segments under the day-place id, so it never did.
it('shows travel time between consecutive places from a segment saved by the form', () => {
  render(<DayNavigationView guide={{}} selectedDay="day-1" sections={[{ Sequence: 1, Title: 'Day 1',
    Timeline: { morning: [place('a', 'Fort', 12.9716), place('b', 'Market', 12.9816)], afternoon: [], evening: [] },
    Transport: { segments: [{ fromPlaceId: 'day-a', toPlaceId: 'day-b', mode: 'walk', distanceKm: 1.1, estimatedMinutes: 13 }] } }]} />);
  expect(screen.getByText('1.1 km')).toBeInTheDocument();
  expect(screen.getByText('13 min')).toBeInTheDocument();
});

it('estimates travel time when no segment was saved', () => {
  render(<DayNavigationView guide={{}} selectedDay="day-1" sections={[{ Sequence: 1, Title: 'Day 1',
    Timeline: { morning: [place('a', 'Fort', 12.9716), place('b', 'Market', 12.9816)], afternoon: [], evening: [] } }]} />);
  expect(screen.getByText('1.1 km')).toBeInTheDocument();
});
