import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from '@apollo/client';
import useAuthStore from '../../../store/store';
import {
  readExplorersAnalyticsEvents,
  type ExplorersAnalyticsRecord,
} from '../../../services/explorersAnalyticsClient';
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

const customControlStates: Array<[string, ExplorersAnalyticsRecord[]]> = [
  ['empty', []],
  ['populated', [{
    Account_Id: 'account-1',
    Location_Id: null,
    Recommendation_Id: null,
    Stats: [{
      type: 'view',
      timestamp: new Date(2026, 7, 24, 10).toISOString(),
      page: 'public-profile',
      canonicalPath: '/tk2727',
    }],
  }]],
];

describe('AnalyticsDashboard data boundary', () => {
  const queryMock = vi.mocked(useQuery);
  const readEvents = vi.mocked(readExplorersAnalyticsEvents);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
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
          accounts: [{
            documentId: 'account-1',
            Account_Name: 'TK Explorer',
            Account_Type: 'personal',
            mobile_number: '+919999999999',
          }],
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requests only the signed-in account and selected date range from Local Tunes', async () => {
    render(<AnalyticsDashboard />);

    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(1));
    const scope = readEvents.mock.calls[0][0];
    expect(scope).toMatchObject({
      accountId: 'account-1',
      token: 'private-user-token',
    });
    const requestedDuration = new Date(scope.toDate).getTime() - new Date(scope.fromDate).getTime();
    expect(requestedDuration).toBeGreaterThanOrEqual(29 * 24 * 60 * 60 * 1000);
    expect(requestedDuration).toBeLessThan(30 * 24 * 60 * 60 * 1000);

    const queriedOperations = queryMock.mock.calls.map(([query]) => operationName(query));
    expect(new Set(queriedOperations)).toEqual(new Set(['GetAccountId']));
  });

  it('uses the only completed account when an incomplete row is returned first', async () => {
    queryMock.mockImplementation((query: any) => {
      if (operationName(query) === 'GetAccountId') {
        return {
          data: {
            usersPermissionsUser: {
              accounts: [
                {
                  documentId: 'provisioning-account',
                  Account_Name: 'Provisioning',
                  Account_Type: 'personal',
                  mobile_number: '',
                },
                {
                  documentId: 'account-1',
                  Account_Name: 'TK Explorer',
                  Account_Type: 'personal',
                  mobile_number: '+919999999999',
                },
              ],
            },
          },
          loading: false,
          error: undefined,
        } as any;
      }
      throw new Error(`Unexpected analytics GraphQL operation: ${operationName(query)}`);
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(1));
    expect(readEvents.mock.calls[0][0].accountId).toBe('account-1');
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

  it('limits custom inputs to 93 inclusive calendar days', async () => {
    const { container } = render(<AnalyticsDashboard />);
    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getByRole('button', {
        name: 'analytics.dashboard.timeFilter.last30days',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'analytics.dashboard.timeFilter.custom',
      }),
    );

    const [from, to] = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="date"]'),
    );
    fireEvent.change(from, { target: { value: '2026-01-01' } });

    expect(to.max).toBe('2026-04-03');
  });

  it.each(customControlStates)('uses one shared date range control in the %s dashboard state', async (_state, records) => {
    const user = userEvent.setup();
    readEvents.mockImplementation(() => (
      readEvents.mock.calls.length === 1
        ? Promise.resolve(records)
        : new Promise(() => {})
    ));
    render(<AnalyticsDashboard />);

    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', {
      name: 'analytics.dashboard.timeFilter.last30days',
    }));
    await user.click(screen.getByRole('button', {
      name: 'analytics.dashboard.timeFilter.custom',
    }));

    const fromInputs = screen.getAllByLabelText(/from/i);
    const toInputs = screen.getAllByLabelText(/to/i);
    expect(fromInputs).toHaveLength(1);
    expect(toInputs).toHaveLength(1);

    await user.type(fromInputs[0], '2026-03-08');
    expect(fromInputs[0]).toHaveValue('2026-03-08');
    await user.type(toInputs[0], '2026-03-10');

    expect(toInputs[0]).toHaveValue('2026-03-10');
    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(2));
    expect(readEvents.mock.calls[1][0]).toMatchObject({
      accountId: 'account-1',
      fromDate: '2026-03-08',
      toDate: '2026-03-10',
    });
  });
});
