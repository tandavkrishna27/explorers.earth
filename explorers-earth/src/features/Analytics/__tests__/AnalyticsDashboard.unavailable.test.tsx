import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanonicalAccount } from '../../Profile/api/useCanonicalAccount';
import useAuthStore from '../../../store/store';
import { readExplorersAnalyticsEvents } from '../../../services/explorersAnalyticsClient';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

/**
 * Ticket 3.4. The detailed event read needs an auth-store `token`, and canonical
 * sign-in never issues one: `acceptVerified` sets `token: null`, and the only
 * action that sets a token is the retired Strapi password `login`, which has no
 * caller outside tests. So this file covers the state every signed-in owner is
 * actually in today.
 *
 * It is a separate file from `AnalyticsDashboard.test.tsx` on purpose. That suite
 * seeds `token: 'private-user-token'` in `beforeEach` — a credential production
 * does not issue — which is exactly why the dashboard could tell every real owner
 * "No Analytics Data" with a full suite passing. Fixing the message without
 * covering the token-less case would leave that hole open.
 */
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

const UNAVAILABLE_TITLE = 'analytics.dashboard.emptyState.unavailableTitle';
const UNAVAILABLE_MESSAGE = 'analytics.dashboard.emptyState.unavailableMessage';
const NO_DATA_TITLE = 'analytics.dashboard.emptyState.title';
const NO_DATA_MESSAGE = 'analytics.dashboard.emptyState.noDataMessage';
const HOW_TO_START = 'analytics.dashboard.emptyState.howToStart.title';
const ERROR_TITLE = 'analytics.dashboard.error.title';

describe('AnalyticsDashboard when the detailed read is unavailable', () => {
  const accountMock = vi.mocked(useCanonicalAccount);
  const readEvents = vi.mocked(readExplorersAnalyticsEvents);

  beforeEach(() => {
    vi.clearAllMocks();
    accountMock.mockReturnValue({
      data: { id: 'account-1', onboardingStatus: 'complete' },
      isPending: false,
      error: null,
    } as never);
    readEvents.mockResolvedValue([]);
  });

  afterEach(() => {
    useAuthStore.setState({ isAuthenticated: false, token: null, user: null });
  });

  /** The state a canonical session is always in: authenticated, no token. */
  function signInCanonically() {
    useAuthStore.setState({
      isAuthenticated: true,
      token: null,
      user: {
        id: '1',
        documentId: 'user-1',
        username: 'tk2727',
        email: 'tk@example.com',
        blocked: false,
      },
    });
  }

  it('does not claim the owner has no analytics data', async () => {
    signInCanonically();
    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText(UNAVAILABLE_TITLE)).toBeInTheDocument());

    // The defect: both of these asserted something false about the account.
    expect(screen.queryByText(NO_DATA_TITLE)).toBeNull();
    expect(screen.queryByText(NO_DATA_MESSAGE)).toBeNull();
  });

  it('says the detailed read is unavailable instead', async () => {
    signInCanonically();
    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText(UNAVAILABLE_TITLE)).toBeInTheDocument());
    expect(screen.getByText(UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  });

  it('hides the "share your QR codes" advice, which is for a different problem', async () => {
    signInCanonically();
    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText(UNAVAILABLE_TITLE)).toBeInTheDocument());
    expect(screen.queryByText(HOW_TO_START)).toBeNull();
  });

  it('does not report an error, because there is no failure and nothing to retry', async () => {
    signInCanonically();
    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText(UNAVAILABLE_TITLE)).toBeInTheDocument());
    expect(screen.queryByText(ERROR_TITLE)).toBeNull();
  });

  it('reaches no network, so an outage cannot be the reason it is empty', async () => {
    signInCanonically();
    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText(UNAVAILABLE_TITLE)).toBeInTheDocument());
    expect(readEvents).not.toHaveBeenCalled();
  });

  it('still reports a genuine absence of data when the read can run', async () => {
    // Guards the other direction: the honest message must not swallow the real
    // empty state once a token exists, or repointing the dashboard at the
    // canonical route would silently keep showing "unavailable" forever.
    useAuthStore.setState({
      isAuthenticated: true,
      token: 'a-token-the-read-can-use',
      user: {
        id: '1',
        documentId: 'user-1',
        username: 'tk2727',
        email: 'tk@example.com',
        blocked: false,
      },
    });
    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText(NO_DATA_TITLE)).toBeInTheDocument());
    expect(screen.queryByText(UNAVAILABLE_TITLE)).toBeNull();
    expect(screen.getByText(HOW_TO_START)).toBeInTheDocument();
    expect(readEvents).toHaveBeenCalled();
  });
});
