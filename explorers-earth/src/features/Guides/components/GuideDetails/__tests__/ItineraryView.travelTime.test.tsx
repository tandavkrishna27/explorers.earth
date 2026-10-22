import { render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ItineraryView from '../ItineraryView';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => children,
  motion: {
    div: ({ initial: _initial, animate: _animate, exit: _exit, transition: _transition, whileHover: _whileHover, ...props }: HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props} />,
  },
}));
vi.mock('react-vertical-timeline-component', () => ({
  VerticalTimeline: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  VerticalTimelineElement: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

const place = (id: string, name: string, lat: number) => ({ id: `day-${id}`, place_id: `g-${id}`, name, geometry: { location: { lat, lng: 77.5946 } } });
const section = (places: unknown[]) => ({ documentId: 's1', Sequence: 1, Title: 'Day 1: City', Timeline: { morning: places, afternoon: [], evening: [] } });
const props = { onViewModeChange: () => undefined, onAddSection: () => undefined, onSectionSelect: () => undefined,
  onSectionEdit: () => undefined, onSectionDelete: () => undefined, openMenuId: null, deletingSection: null,
  kebabRefs: { current: {} }, onMenuToggle: () => undefined };

// UAT GDE-X05: travel time between stops appeared only in the Edit Day form.
describe.each(['list', 'timeline'] as const)('owner %s view travel time', (viewMode) => {
  it('shows distance and time between consecutive places', () => {
    render(<ItineraryView {...props} viewMode={viewMode} sections={[section([place('a', 'Fort', 12.9716), place('b', 'Market', 12.9816)])]} />);
    expect(screen.getByText(/1\.1 km • \d+ min/)).toBeInTheDocument();
  });
  it('shows nothing for a single place', () => {
    render(<ItineraryView {...props} viewMode={viewMode} sections={[section([place('a', 'Fort', 12.9716)])]} />);
    expect(screen.queryByText(/km •/)).toBeNull();
  });
});
