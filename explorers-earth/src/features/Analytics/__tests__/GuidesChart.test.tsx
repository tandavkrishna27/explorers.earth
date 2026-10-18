import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('recharts', async importOriginal => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
import GuidesChart from '../components/charts/GuidesChart';
import type { AnalyticsEvent } from '../api/queries';

// The shape the canonical owner event read returns for public-guides Stats: a guide-card
// click targets the guide collection, so its id travels as metadata.listId.
const stat = (type: string, metadata?: Record<string, unknown>): AnalyticsEvent => ({
  type, page: 'public-guides', timestamp: '2026-10-19T10:00:00.000Z', canonicalPath: '/tk2727/guides', country: null,
  ...(metadata ? { element: 'guide-card', metadata } : {}),
} as AnalyticsEvent);

describe('GuidesChart', () => {
  it('ranks guide opens by guide collection from the canonical owner read', () => {
    const goa = { listId: 'c0a1e0c4-0000-4000-8000-000000000001', title: 'Goa in 3 days', guideType: 'itinerary' };
    const pune = { listId: 'c0a1e0c4-0000-4000-8000-000000000002', title: 'Pune weekend', guideType: 'city' };
    render(<GuidesChart events={[stat('view'), stat('view'), stat('click', goa), stat('click', goa), stat('click', pune),
      { ...stat('view'), page: 'public-books' } as AnalyticsEvent]} />);

    expect(screen.queryByText('No guides page activity yet.')).toBeNull();
    expect(screen.getByText('Page Views').previousElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Guide Opens').previousElementSibling).toHaveTextContent('3');
    expect(screen.getByText('Unique Guides').previousElementSibling).toHaveTextContent('2');
    expect(screen.getByText('All Opened Guides (2)')).toBeInTheDocument();
    expect(screen.getAllByText('Goa in 3 days').length).toBeGreaterThan(0);
    expect(screen.getByText('2 opens')).toBeInTheDocument();
    expect(screen.getByText('1 open')).toBeInTheDocument();
  });

  it('shows the empty state when no guide events exist', () => {
    render(<GuidesChart events={[]} />);
    expect(screen.getByText('No guides page activity yet.')).toBeInTheDocument();
  });
});
