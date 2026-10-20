import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanonicalAccount } from '../../Profile/api/useCanonicalAccount';
import useAuthStore from '../../../store/store';
import { readExplorersAnalyticsEvents } from '../../../services/explorersAnalyticsClient';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

vi.mock('../../Profile/api/useCanonicalAccount', () => ({ useCanonicalAccount: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../services/explorersAnalyticsClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/explorersAnalyticsClient')>();
  return { ...actual, readExplorersAnalyticsEvents: vi.fn() };
});
vi.mock('../components/charts/TopCountriesChart', () => ({ default: () => <div /> }));
vi.mock('../components/charts/TrafficSourceChart', () => ({ default: () => <div /> }));
vi.mock('../components/charts/LocationEngagementChart', () => ({ default: () => <div /> }));
vi.mock('../components/charts/RecommendedPlacesChart', () => ({ default: () => <div /> }));
vi.mock('../components/charts/SocialMediaInteractionChart', () => ({ default: () => <div /> }));
vi.mock('../components/charts/WorldMapChart', () => ({ default: () => <div /> }));
vi.mock('../components/charts/ContentEngagementChart', () => ({ default: () => <div /> }));
vi.mock('../components/charts/PageViewsTrendChart', () => ({ default: () => <div /> }));
vi.mock('../components/charts/MediaListEngagementChart', () => ({ default: () => <div /> }));
vi.mock('../components/charts/MediaItemsInListChart', () => ({ default: () => <div /> }));
vi.mock('../components/charts/GuidesChart', () => ({ default: () => <div /> }));

describe('AnalyticsDashboard error and custom-range states', () => {
  const readEvents = vi.mocked(readExplorersAnalyticsEvents);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
    vi.clearAllMocks();
    useAuthStore.setState({ isAuthenticated: true, token: null, user: null });
    vi.mocked(useCanonicalAccount).mockReturnValue({
      data: { id: 'account-1', onboardingStatus: 'complete' },
      isPending: false,
      error: null,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a friendly message and Retry instead of the raw failure, and keeps the period control', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    readEvents.mockRejectedValueOnce(new Error('Analytics request failed with 500: {"message":"boom"}'));
    readEvents.mockResolvedValue([]);
    render(<AnalyticsDashboard />);

    expect(await screen.findByText('analytics.dashboard.error.message')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/boom|500|request failed/i);
    expect(consoleError).toHaveBeenCalled();
    // The time period can still be changed from the error state.
    expect(screen.getByRole('button', { name: 'analytics.dashboard.timeFilter.last30days' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'analytics.dashboard.error.retry' }));
    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(2));
    expect(readEvents.mock.calls[1][0]).toMatchObject({ accountId: 'account-1' });
    await waitFor(() => expect(screen.queryByText('analytics.dashboard.error.message')).toBeNull());
  });

  it('refetches with a new period chosen from the error state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    readEvents.mockRejectedValueOnce(new Error('boom'));
    readEvents.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<AnalyticsDashboard />);
    await screen.findByText('analytics.dashboard.error.message');

    await user.click(screen.getByRole('button', { name: 'analytics.dashboard.timeFilter.last30days' }));
    await user.click(screen.getByRole('button', { name: 'analytics.dashboard.timeFilter.today' }));

    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(2));
  });

  it('says the end date is before the start date, without a request or empty-data tips', async () => {
    readEvents.mockResolvedValue([]);
    const user = userEvent.setup();
    const { container } = render(<AnalyticsDashboard />);
    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'analytics.dashboard.timeFilter.last30days' }));
    await user.click(screen.getByRole('button', { name: 'analytics.dashboard.timeFilter.custom' }));
    const [from, to] = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    fireEvent.change(from, { target: { value: '2026-08-20' } });
    fireEvent.change(to, { target: { value: '2026-08-10' } });

    expect((await screen.findAllByText('analytics.dashboard.dateRange.endBeforeStart')).length).toBeGreaterThan(0);
    expect(screen.queryByText('analytics.dashboard.dateRange.maxRange')).toBeNull();
    expect(screen.queryByText('analytics.dashboard.emptyState.howToStart.title')).toBeNull();
    // Only the initial 30-day read happened; the inverted range sent nothing.
    expect(readEvents).toHaveBeenCalledTimes(1);
  });

  it('still says "93 days or less" for a range that is too long', async () => {
    readEvents.mockResolvedValue([]);
    const user = userEvent.setup();
    const { container } = render(<AnalyticsDashboard />);
    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'analytics.dashboard.timeFilter.last30days' }));
    await user.click(screen.getByRole('button', { name: 'analytics.dashboard.timeFilter.custom' }));
    const [from, to] = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    fireEvent.change(from, { target: { value: '2026-01-01' } });
    fireEvent.change(to, { target: { value: '2026-08-10' } });

    expect((await screen.findAllByText('analytics.dashboard.dateRange.maxRange')).length).toBeGreaterThan(0);
    expect(screen.queryByText('analytics.dashboard.dateRange.endBeforeStart')).toBeNull();
    expect(readEvents).toHaveBeenCalledTimes(1);
  });

  it('shows the how-to-start tips for an empty account but hides them for every range problem', async () => {
    readEvents.mockResolvedValue([]);
    const user = userEvent.setup();
    const { container } = render(<AnalyticsDashboard />);
    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(1));
    expect(screen.getByText('analytics.dashboard.emptyState.howToStart.title')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'analytics.dashboard.timeFilter.last30days' }));
    await user.click(screen.getByRole('button', { name: 'analytics.dashboard.timeFilter.custom' }));
    // Neither date chosen yet.
    expect(screen.queryByText('analytics.dashboard.emptyState.howToStart.title')).toBeNull();
    const [from, to] = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    // One date chosen.
    fireEvent.change(from, { target: { value: '2026-08-20' } });
    expect(screen.queryByText('analytics.dashboard.emptyState.howToStart.title')).toBeNull();
    // Both chosen, inverted.
    fireEvent.change(to, { target: { value: '2026-08-10' } });
    expect(screen.queryByText('analytics.dashboard.emptyState.howToStart.title')).toBeNull();
    // Corrected: a valid range with no data is the ordinary empty state again.
    fireEvent.change(to, { target: { value: '2026-08-25' } });
    await waitFor(() => expect(screen.getByText('analytics.dashboard.emptyState.howToStart.title')).toBeTruthy());
  });
});
