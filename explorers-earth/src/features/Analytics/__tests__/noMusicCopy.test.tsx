import { render, screen } from '@testing-library/react';
import '../../../test/englishI18n';
import { describe, expect, it, vi } from 'vitest';

vi.mock('recharts', async importOriginal => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
import ContentEngagementChart from '../components/charts/ContentEngagementChart';
import PageViewsTrendChart from '../components/charts/PageViewsTrendChart';
import type { AnalyticsEvent } from '../api/queries';

// Music was removed in P3; the owner analytics must not mention it or count song requests.
const view = (page: string): AnalyticsEvent => ({ type: 'view', page, timestamp: '2026-10-19T10:00:00.000Z', canonicalPath: '/tk2727', country: null } as AnalyticsEvent);

describe('analytics without Music', () => {
  it('shows no Song Requests KPI and no Music series', () => {
    const { container } = render(<ContentEngagementChart events={[view('public-movies'), view('public-books')]} />);
    expect(screen.queryByText('Song Requests')).toBeNull();
    expect(container.textContent).not.toMatch(/music|song/i);
    expect(screen.getByText('Media Views')).toBeInTheDocument();
  });

  it('has no Music trend line', () => {
    const { container } = render(<PageViewsTrendChart events={[view('public-movies'), view('public-profile'), view('public-music')]} />);
    expect(container.textContent).not.toMatch(/music/i);
  });
});
