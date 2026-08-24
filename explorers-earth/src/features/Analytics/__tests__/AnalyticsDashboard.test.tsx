import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from '@apollo/client';
import useAuthStore from '../../../store/store';
import { readExplorersAnalyticsEvents } from '../../../services/explorersAnalyticsClient';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

const chartSpies = vi.hoisted(() => ({
  topCountries: vi.fn(),
}));

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>();
  return { ...actual, useQuery: vi.fn() };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../services/explorersAnalyticsClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/explorersAnalyticsClient')>();
  return { ...actual, readExplorersAnalyticsEvents: vi.fn() };
});

vi.mock('../components/charts/TopCountriesChart', () => ({
  default: (props: unknown) => {
    chartSpies.topCountries(props);
    return <div data-testid="top-countries-chart" />;
  },
}));

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

const operationName = (query: any) =>
  query?.definitions?.find((definition: any) => definition.kind === 'OperationDefinition')?.name?.value;

describe('AnalyticsDashboard data boundary', () => {
  const queryMock = vi.mocked(useQuery);
  const readEvents = vi.mocked(readExplorersAnalyticsEvents);

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      isAuthenticated: true,
      token: 'private-user-token',
      user: {
        id: '1',
        documentId: 'user-1',
        username: 'tk2727',
        email: 'tk@example.com',
        blocked: false,
      },
    });
    const accountQueryResult = {
      data: {
        usersPermissionsUser: {
          accounts: [{ documentId: 'account-1' }],
        },
      },
      loading: false,
      error: undefined,
    } as any;
    queryMock.mockImplementation((query: any) => {
      if (operationName(query) === 'GetAccountId') {
        return accountQueryResult;
      }
      throw new Error(`Unexpected analytics GraphQL operation: ${operationName(query)}`);
    });
    readEvents.mockResolvedValue([
      {
        Account_Id: 'account-1',
        Location_Id: null,
        Recommendation_Id: null,
        Stats: [
          {
            type: 'view',
            timestamp: new Date(2026, 7, 24, 10).toISOString(),
            page: 'public-profile',
            canonicalPath: '/tk2727',
            country: 'IN',
            utmParams: { utm_source: 'qr_code_scan', utm_medium: 'qr_code' },
          },
        ],
      },
    ]);
  });

  it('requests only the signed-in account and selected date range from Local Tunes', async () => {
    render(<AnalyticsDashboard />);

    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(1));
    const scope = readEvents.mock.calls[0][0];
    expect(scope).toMatchObject({
      accountId: 'account-1',
      token: 'private-user-token',
    });
    const requestedDuration = new Date(scope.to).getTime() - new Date(scope.from).getTime();
    expect(requestedDuration).toBeGreaterThanOrEqual(29 * 24 * 60 * 60 * 1000);
    expect(requestedDuration).toBeLessThan(30 * 24 * 60 * 60 * 1000);

    const queriedOperations = queryMock.mock.calls.map(([query]) => operationName(query));
    expect(new Set(queriedOperations)).toEqual(new Set(['GetAccountId']));
  });

  it('uses the coarse country supplied by the server without client IP resolution', async () => {
    render(<AnalyticsDashboard />);

    await waitFor(() => {
      const latest = chartSpies.topCountries.mock.calls.at(-1)?.[0] as any;
      expect(latest.events).toEqual([
        expect.objectContaining({ country: 'IN', canonicalPath: '/tk2727' }),
      ]);
      expect(latest.isResolvingCountries).toBe(false);
    });
  });

  it('does not request analytics until authentication and account scope are ready', async () => {
    useAuthStore.setState({ isAuthenticated: false, token: null, user: null });
    queryMock.mockReturnValue({ data: undefined, loading: false, error: undefined } as any);

    render(<AnalyticsDashboard />);
    await Promise.resolve();
    expect(readEvents).not.toHaveBeenCalled();
  });
});
