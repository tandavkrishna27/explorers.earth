import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useQuery, gql } from '@apollo/client';
import { AnalyticsEvent, PublicPageAnalyticsData } from '../api/queries';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../../store/store';
import TopCountriesChart from './charts/TopCountriesChart';
import TrafficSourceChart from './charts/TrafficSourceChart';
import LocationEngagementChart from './charts/LocationEngagementChart';
import RecommendedPlacesChart from './charts/RecommendedPlacesChart';
import SocialMediaInteractionChart from './charts/SocialMediaInteractionChart';
import WorldMapChart from './charts/WorldMapChart';
import ContentEngagementChart from './charts/ContentEngagementChart';
import PageViewsTrendChart from './charts/PageViewsTrendChart';
import MediaListEngagementChart from './charts/MediaListEngagementChart';
import MediaItemsInListChart from './charts/MediaItemsInListChart';
import GuidesChart from './charts/GuidesChart';
import { readExplorersAnalyticsEvents } from '../../../services/explorersAnalyticsClient';
import { getAnalyticsDateRange } from '../utils/analyticsDateRange';

// Time filter types
type TimeFilter = 'today' | 'last7days' | 'last30days' | 'custom';
const MAX_CUSTOM_RANGE_MS = 93 * 24 * 60 * 60 * 1000;
const inputDate = (date?: Date) => date?.toISOString().split('T')[0];
const shiftDate = (date: Date | undefined, deltaMs: number) =>
  date ? inputDate(new Date(date.getTime() + deltaMs)) : undefined;

interface TimeFilterState {
  type: TimeFilter;
  startDate?: Date;
  endDate?: Date;
}

// Time filter options will be created using translations

/**
 * Analytics Dashboard Component
 * 
 * Fetches an authenticated, account-scoped analytics window from Local Tunes
 * and renders summary metrics with interactive charts.
 */
const AnalyticsDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { user, isAuthenticated, token } = useAuthStore();
  const [eventsWithCountries, setEventsWithCountries] = useState<AnalyticsEvent[]>([]);
  const [accountAnalyticsData, setAccountAnalyticsData] = useState<PublicPageAnalyticsData[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<Error | null>(null);

  // Time filter state
  const [timeFilter, setTimeFilter] = useState<TimeFilterState>({
    type: 'last30days',
    startDate: undefined,
    endDate: undefined
  });

  // Time filter dropdown state
  const [isTimeFilterDropdownOpen, setIsTimeFilterDropdownOpen] = useState(false);
  const timeFilterDropdownRef = useRef<HTMLDivElement>(null);

  // Time filter options for dropdown (with translations)
  const TIME_FILTER_OPTIONS = useMemo(() => [
    { value: 'today', label: t('analytics.dashboard.timeFilter.today') },
    { value: 'last7days', label: t('analytics.dashboard.timeFilter.last7days') },
    { value: 'last30days', label: t('analytics.dashboard.timeFilter.last30days') },
    { value: 'custom', label: t('analytics.dashboard.timeFilter.custom') },
  ] as const, [t]);

  // Fetch account data to get the correct account ID for filtering analytics
  const {
    data: accountData,
    loading: accountLoading,
    error: accountError,
  } = useQuery(gql`
    query GetAccountId($documentId: ID!) {
      usersPermissionsUser(documentId: $documentId) {
        createdAt
        accounts {
          documentId
          createdAt
        }
      }
    }
  `, {
    variables: { documentId: user?.documentId },
    skip: !user?.documentId,
  });

  const accountDocumentId = accountData?.usersPermissionsUser?.accounts?.[0]?.documentId;
  const loading = accountLoading || analyticsLoading;
  const error = accountError || analyticsError;

  useEffect(() => {
    if (!loading) {
      (window as any).__dashboardLoaded = true;
    }
  }, [loading]);

  const getDateRange = useMemo(() => getAnalyticsDateRange(timeFilter), [timeFilter]);

  // Check if custom range is complete
  const isCustomRangeValid = useMemo(() => {
    if (timeFilter.type !== 'custom') return true;
    if (!timeFilter.startDate || !timeFilter.endDate) return false;
    const duration = timeFilter.endDate.getTime() - timeFilter.startDate.getTime();
    return duration >= 0 && duration <= MAX_CUSTOM_RANGE_MS;
  }, [timeFilter]);
  const isCustomRangeComplete =
    timeFilter.type !== 'custom' ||
    Boolean(timeFilter.startDate && timeFilter.endDate && isCustomRangeValid);

  // Filter events by date range
  const filteredEvents = useMemo(() => {
    if (!eventsWithCountries.length || !getDateRange) return [];

    return eventsWithCountries.filter(event => {
      const eventDate = new Date(event.timestamp);
      return eventDate >= getDateRange.startDate && eventDate <= getDateRange.endDate;
    });
  }, [eventsWithCountries, getDateRange]);

  // Filter raw analytics data by date range
  const filteredRawAnalyticsData = useMemo(() => {
    if (!accountAnalyticsData.length || !getDateRange) return [];

    return accountAnalyticsData.map(data => ({
      ...data,
      Stats: data.Stats?.filter(event => {
        const eventDate = new Date(event.timestamp);
        return eventDate >= getDateRange.startDate && eventDate <= getDateRange.endDate;
      }) || []
    })).filter(data => data.Stats.length > 0);
  }, [accountAnalyticsData, getDateRange]);

  // Check if there's any analytics data at all (before date filtering)
  // MUST be before any early returns to follow Rules of Hooks
  const hasAnyAnalyticsData = useMemo(() => {
    return accountAnalyticsData.some((item: PublicPageAnalyticsData) =>
      item.Stats && item.Stats.length > 0
    );
  }, [accountAnalyticsData]);

  // Generate context-aware empty state message
  const getEmptyStateMessage = () => {
    // Check if custom range is incomplete
    if (timeFilter.type === 'custom' && !isCustomRangeComplete) {
      if (!timeFilter.startDate && !timeFilter.endDate) {
        return t('analytics.dashboard.emptyState.customRange.bothMissing');
      } else if (!timeFilter.startDate) {
        return t('analytics.dashboard.emptyState.customRange.startMissing');
      } else if (!timeFilter.endDate) {
        return t('analytics.dashboard.emptyState.customRange.endMissing');
      }
      return t('analytics.dashboard.dateRange.maxRange', {
        days: 93,
        defaultValue: 'Choose a date range of 93 days or less.',
      });
    }
    if (!hasAnyAnalyticsData) {
      return t('analytics.dashboard.emptyState.noDataMessage');

    }

    // If there's data but not for the selected time range
    switch (timeFilter.type) {
      case 'today':
        return t('analytics.dashboard.emptyState.noDataForPeriod.today');
      case 'last7days':
        return t('analytics.dashboard.emptyState.noDataForPeriod.last7days');
      case 'last30days':

        return t('analytics.dashboard.emptyState.noDataForPeriod.last30days');

      case 'custom': {
        const startDateStr = timeFilter.startDate
          ? timeFilter.startDate.toLocaleDateString()
          : t('analytics.dashboard.dateRange.from');

        const endDateStr = timeFilter.endDate
          ? timeFilter.endDate.toLocaleDateString()
          : t('analytics.dashboard.dateRange.to');

        return t('analytics.dashboard.emptyState.noDataForPeriod.custom', {
          startDate: startDateStr,
          endDate: endDateStr,
        });
      }

      default:
        return t('analytics.dashboard.emptyState.noDataForPeriod.default');
    }
  };

  // Handle click outside to close time filter dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timeFilterDropdownRef.current && !timeFilterDropdownRef.current.contains(event.target as Node)) {
        setIsTimeFilterDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch only the authenticated account and selected date window. Country is
  // already reduced to a coarse ISO code by the server; raw IP never reaches UI.
  useEffect(() => {
    let active = true;
    if (
      !isAuthenticated ||
      !token ||
      !accountDocumentId ||
      !getDateRange ||
      !isCustomRangeComplete
    ) {
      setAnalyticsLoading(false);
      setAnalyticsError(null);
      setEventsWithCountries([]);
      setAccountAnalyticsData([]);
      return () => {
        active = false;
      };
    }

    setAnalyticsLoading(true);
    setAnalyticsError(null);
    void readExplorersAnalyticsEvents({
      accountId: accountDocumentId,
      from: getDateRange.startDate.toISOString(),
      to: getDateRange.endDate.toISOString(),
      token,
    })
      .then((records) => {
        if (!active) return;
        const accountRecords = records as PublicPageAnalyticsData[];
        setAccountAnalyticsData(accountRecords);
        setEventsWithCountries(accountRecords.flatMap((item) => item.Stats || []));
      })
      .catch((caught) => {
        if (!active) return;
        setAccountAnalyticsData([]);
        setEventsWithCountries([]);
        setAnalyticsError(
          caught instanceof Error ? caught : new Error('Analytics read failed'),
        );
      })
      .finally(() => {
        if (active) setAnalyticsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accountDocumentId, getDateRange, isAuthenticated, isCustomRangeComplete, token]);

  // Calculate metrics from filtered events
  const processedData = useMemo(() => {
    if (filteredEvents.length === 0) {
      return {
        totalViews: 0,
        totalClicks: 0,
        totalQRScans: 0,
        totalViewsOtherSources: 0
      };
    }

    // Calculate totals from filtered events
    const totalViews = filteredEvents.filter(event => event.type === 'view').length;
    const totalClicks = filteredEvents.filter(event => event.type === 'click').length;

    // Calculate QR views based on UTM parameters
    const totalQRScans = filteredEvents.filter(event =>
      event.type === 'view' &&
      event.utmParams?.utm_source === 'qr_code_scan' &&
      event.utmParams?.utm_medium === 'qr_code'
    ).length;

    // Calculate views from other sources (non-QR views)
    const totalViewsOtherSources = filteredEvents.filter(event =>
      event.type === 'view' &&
      !(event.utmParams?.utm_source === 'qr_code_scan' && event.utmParams?.utm_medium === 'qr_code')
    ).length;

    return {
      totalViews,
      totalClicks,
      totalQRScans,
      totalViewsOtherSources
    };
  }, [filteredEvents]);

  // Loading state — render structured shimmer skeleton instead of a spinner
  if (loading) {
    return (
      <div className="bg-dashboard-bg min-h-screen">
        <div className="dashboard-theme p-4 sm:p-6 space-y-6">

          {/* Header shimmer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex flex-col gap-2">
              <div className="h-6 w-44 rounded bg-white/8 skeleton-shimmer relative overflow-hidden" />
              <div className="h-4 w-72 rounded bg-white/5 skeleton-shimmer relative overflow-hidden" />
            </div>
            {/* Time filter placeholder */}
            <div className="h-9 w-44 rounded-lg bg-white/8 skeleton-shimmer relative overflow-hidden" />
          </div>

          {/* 4 Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="relative rounded-lg bg-dashboard-muted p-4 overflow-hidden border border-white/4 min-w-[150px] skeleton-card">
                <div className="absolute inset-0 skeleton-shimmer" />
                <div className="h-3 w-20 rounded bg-white/8 mb-3" />
                <div className="h-7 w-14 rounded bg-white/10" />
              </div>
            ))}
          </div>

          {/* Chart placeholders */}
          {[280, 220, 200, 200].map((h, i) => (
            <div
              key={i}
              className="relative rounded-lg bg-dashboard-muted overflow-hidden border border-white/4 skeleton-card"
              style={{ height: `${h}px` }}
            >
              <div className="absolute inset-0 skeleton-shimmer" />
              {/* Chart title */}
              <div className="absolute top-5 left-5 flex flex-col gap-2">
                <div className="h-4 w-40 rounded bg-white/8" />
                <div className="h-3 w-60 rounded bg-white/5" />
              </div>
              {/* Fake bar/line graph shapes */}
              <div className="absolute bottom-6 left-5 right-5 flex items-end gap-3 h-24">
                {[60, 85, 45, 100, 70, 55, 90, 40, 75, 65].slice(0, i === 0 ? 10 : 6).map((pct, j) => (
                  <div
                    key={j}
                    className="flex-1 rounded-t bg-white/8"
                    style={{ height: `${pct}%` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-dashboard-bg min-h-screen">
        <div className="dashboard-theme flex items-center justify-center min-h-[400px]">
          <div className="dt-surface p-6 rounded-lg text-center max-w-md">
            <h3 className="dt-heading mb-2 text-dashboard-danger">{t('analytics.dashboard.error.title')}</h3>
            <p className="dt-subtext mb-4">
              {t('analytics.dashboard.error.message')}
            </p>
            <p className="dt-subtext text-xs">
              {t('analytics.dashboard.error.errorLabel')} {error.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No data state - ONLY show if there's truly NO analytics data in the account at all
  // If there's data (even if filtered out), show the dashboard with appropriate messaging
  if (!hasAnyAnalyticsData) {
    return (
      <div className="bg-dashboard-bg min-h-screen">
        <div className="dashboard-theme p-4 sm:p-5 md:p-6 space-y-6">
          {/* Header with Time Filter - Always Visible */}
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="dt-heading mb-2">{t('analytics.dashboard.title')}</h1>
                <p className="dt-subtext">
                  {t('analytics.dashboard.subtitle')}
                </p>
              </div>

              {/* Time Filter Dropdown - Always Visible */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="dt-label text-sm">{t('analytics.dashboard.timePeriod')}</label>
                <div className="w-full sm:w-auto sm:min-w-[180px] relative" ref={timeFilterDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsTimeFilterDropdownOpen(!isTimeFilterDropdownOpen)}
                    className="dt-input w-full text-left flex justify-between items-center dt-label px-3 py-2 text-sm border border-dashboard-border rounded-lg bg-dashboard-surface text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-transparent"
                  >
                    <span>
                      {TIME_FILTER_OPTIONS.find(option => option.value === timeFilter.type)?.label || t('analytics.dashboard.timeFilter.selectPeriod')}
                    </span>
                    <svg
                      className={`w-4 h-4 transition-transform ${isTimeFilterDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isTimeFilterDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 dt-surface border border-dashboard rounded-lg shadow-dashboard-elevated z-50 max-h-60 overflow-y-auto scrollbar-hide">
                      {TIME_FILTER_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setTimeFilter(prev => ({
                              ...prev,
                              type: option.value as TimeFilter,
                              startDate: option.value === 'custom' ? prev.startDate : undefined,
                              endDate: option.value === 'custom' ? prev.endDate : undefined
                            }));
                            setIsTimeFilterDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left dt-label hover:bg-dashboard-muted transition-colors ${timeFilter.type === option.value ? 'bg-dashboard-muted text-dashboard-accent' : ''
                            }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Date Range Inputs */}
            {timeFilter.type === 'custom' && (
              <div className="mt-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex items-center gap-2">
                  <label className="dt-label text-sm">
                    {t('analytics.dashboard.dateRange.from')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    min={shiftDate(timeFilter.endDate, -MAX_CUSTOM_RANGE_MS)}
                    max={inputDate(timeFilter.endDate)}
                    value={timeFilter.startDate ? timeFilter.startDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const date = e.target.value ? new Date(e.target.value) : undefined;
                      setTimeFilter(prev => ({ ...prev, startDate: date }));
                    }}
                    className={`dt-input px-3 py-2 text-sm border rounded-lg bg-dashboard-surface text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-transparent ${timeFilter.type === 'custom' && !timeFilter.startDate
                        ? 'border-red-300'
                        : 'border-dashboard-border'
                      }`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="dt-label text-sm">
                    {t('analytics.dashboard.dateRange.to')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    min={inputDate(timeFilter.startDate)}
                    max={shiftDate(timeFilter.startDate, MAX_CUSTOM_RANGE_MS)}
                    value={timeFilter.endDate ? timeFilter.endDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const date = e.target.value ? new Date(e.target.value) : undefined;
                      setTimeFilter(prev => ({ ...prev, endDate: date }));
                    }}
                    className={`dt-input px-3 py-2 text-sm border rounded-lg bg-dashboard-surface text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-transparent ${timeFilter.type === 'custom' && !timeFilter.endDate
                        ? 'border-red-300'
                        : 'border-dashboard-border'
                      }`}
                  />
                </div>
                {!isCustomRangeValid && timeFilter.startDate && timeFilter.endDate && (
                  <p role="alert" className="dt-label text-sm text-red-600">
                    {t('analytics.dashboard.dateRange.maxRange', {
                      days: 93,
                      defaultValue: 'Choose a date range of 93 days or less.',
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Context-Aware Empty State */}
          <div className="flex items-center justify-center min-h-[400px] px-4">
            <div className="dt-surface p-4 sm:p-5 md:p-6 rounded-lg text-center w-full max-w-md mx-auto">
              <div className="mb-4">
                <div className="w-16 h-16 mx-auto mb-4 bg-dashboard-muted rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-dashboard" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="dt-heading mb-2">{t('analytics.dashboard.emptyState.title')}</h3>
                <p className="dt-subtext mb-4">
                  {getEmptyStateMessage()}
                </p>
              </div>

              <div className="space-y-2 text-left">
                <h4 className="dt-label mb-2">{t('analytics.dashboard.emptyState.howToStart.title')}</h4>
                <ul className="dt-subtext space-y-1">
                  <li>{t('analytics.dashboard.emptyState.howToStart.shareQR')}</li>
                  <li>{t('analytics.dashboard.emptyState.howToStart.includeQR')}</li>
                  <li>{t('analytics.dashboard.emptyState.howToStart.askFriends')}</li>
                  <li>{t('analytics.dashboard.emptyState.howToStart.viewProfile')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dashboard-bg min-h-screen">
      <div className="dashboard-theme p-6 space-y-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="dt-heading mb-2">{t('analytics.dashboard.title')}</h1>
              <p className="dt-subtext">
                {t('analytics.dashboard.subtitle')}
              </p>
            </div>

            {/* Time Filter Dropdown */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <label className="dt-label text-sm">{t('analytics.dashboard.timePeriod')}</label>
              <div className="w-full sm:w-auto sm:min-w-[180px] relative" ref={timeFilterDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsTimeFilterDropdownOpen(!isTimeFilterDropdownOpen)}
                  className="dt-input w-full text-left flex justify-between items-center dt-label px-3 py-2 text-sm border border-dashboard-border rounded-lg bg-dashboard-surface text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-transparent"
                >
                  <span>
                    {TIME_FILTER_OPTIONS.find(option => option.value === timeFilter.type)?.label || t('analytics.dashboard.timeFilter.selectPeriod')}
                  </span>
                  <svg
                    className={`w-4 h-4 transition-transform ${isTimeFilterDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isTimeFilterDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 dt-surface border border-dashboard rounded-lg shadow-dashboard-elevated z-50 max-h-60 overflow-y-auto scrollbar-hide">
                    {TIME_FILTER_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setTimeFilter(prev => ({
                            ...prev,
                            type: option.value as TimeFilter,
                            startDate: option.value === 'custom' ? prev.startDate : undefined,
                            endDate: option.value === 'custom' ? prev.endDate : undefined
                          }));
                          setIsTimeFilterDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left dt-label hover:bg-dashboard-muted transition-colors ${timeFilter.type === option.value ? 'bg-dashboard-muted text-dashboard-accent' : ''
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Custom Date Range Inputs */}
          {timeFilter.type === 'custom' && (
            <div className="mt-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex items-center gap-2">
                <label className="dt-label text-sm">{t('analytics.dashboard.dateRange.from')}</label>
                <input
                  type="date"
                  min={shiftDate(timeFilter.endDate, -MAX_CUSTOM_RANGE_MS)}
                  max={inputDate(timeFilter.endDate)}
                  value={timeFilter.startDate ? timeFilter.startDate.toISOString().split('T')[0] : ''}
                  onChange={(e) => {
                    const date = e.target.value ? new Date(e.target.value) : undefined;
                    setTimeFilter(prev => ({ ...prev, startDate: date }));
                  }}
                  className="dt-input px-3 py-2 text-sm border border-dashboard-border rounded-lg bg-dashboard-surface text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-transparent"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="dt-label text-sm">{t('analytics.dashboard.dateRange.to')}</label>
                <input
                  type="date"
                  min={inputDate(timeFilter.startDate)}
                  max={shiftDate(timeFilter.startDate, MAX_CUSTOM_RANGE_MS)}
                  value={timeFilter.endDate ? timeFilter.endDate.toISOString().split('T')[0] : ''}
                  onChange={(e) => {
                    const date = e.target.value ? new Date(e.target.value) : undefined;
                    setTimeFilter(prev => ({ ...prev, endDate: date }));
                  }}
                  className="dt-input px-3 py-2 text-sm border border-dashboard-border rounded-lg bg-dashboard-surface text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-transparent"
                />
              </div>
              {!isCustomRangeValid && timeFilter.startDate && timeFilter.endDate && (
                <p role="alert" className="dt-label text-sm text-red-600">
                  {t('analytics.dashboard.dateRange.maxRange', {
                    days: 93,
                    defaultValue: 'Choose a date range of 93 days or less.',
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="flex md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: "none" }}>
          <div className="dt-surface p-4 rounded-lg flex-shrink-0 min-w-[200px]">
            <h3 className="dt-label mb-1">{t('analytics.dashboard.summaryCards.totalViews')}</h3>
            <p className="text-2xl font-bold text-dashboard-accent">
              {processedData.totalViews.toLocaleString()}
            </p>
          </div>
          <div className="dt-surface p-4 rounded-lg flex-shrink-0 min-w-[200px]">
            <h3 className="dt-label mb-1">{t('analytics.dashboard.summaryCards.totalClicks')}</h3>
            <p className="text-2xl font-bold text-dashboard-accent">
              {processedData.totalClicks.toLocaleString()}
            </p>
          </div>
          <div className="dt-surface p-4 rounded-lg flex-shrink-0 min-w-[200px]">
            <h3 className="dt-label mb-1">{t('analytics.dashboard.summaryCards.totalQRViews')}</h3>
            <p className="text-2xl font-bold text-dashboard-accent">
              {processedData.totalQRScans.toLocaleString()}
            </p>
          </div>
          <div className="dt-surface p-4 rounded-lg flex-shrink-0 min-w-[200px]">
            <h3 className="dt-label mb-1">{t('analytics.dashboard.summaryCards.totalLinkViews')}</h3>
            <p className="text-2xl font-bold text-dashboard-accent">
              {processedData.totalViewsOtherSources.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Charts Section */}
        <div className="space-y-6 pb-20 md:pb-6">
          {/* Top Countries Chart */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <h2 className="dt-heading">{t('analytics.dashboard.charts.topCountries.title')}</h2>
            </div>
            <TopCountriesChart events={filteredEvents} isResolvingCountries={false} />
          </div>

          {/* World Map Chart */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <h2 className="dt-heading">{t('analytics.dashboard.charts.worldMap.title')}</h2>
              <p className="dt-subtext">
                {t('analytics.dashboard.charts.worldMap.subtitle')}
              </p>
            </div>

            <WorldMapChart events={filteredEvents} isResolvingCountries={false} />
          </div>

          {/* Traffic Source Chart */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <h2 className="dt-heading">{t('analytics.dashboard.charts.trafficSource.title')}</h2>
              <p className="dt-subtext">
                {t('analytics.dashboard.charts.trafficSource.subtitle')}
              </p>
            </div>

            <TrafficSourceChart events={filteredEvents} />
          </div>

          {/* Location Engagement Chart */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <h2 className="dt-heading">{t('analytics.dashboard.charts.locationEngagement.title')}</h2>
              <p className="dt-subtext">
                {t('analytics.dashboard.charts.locationEngagement.subtitle')}
              </p>
            </div>

            <LocationEngagementChart
              rawAnalyticsData={filteredRawAnalyticsData}
            />
          </div>

          {/* Recommended Places Chart */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <h2 className="dt-heading">{t('analytics.dashboard.charts.recommendedPlaces.title')}</h2>
              <p className="dt-subtext">
                {t('analytics.dashboard.charts.recommendedPlaces.subtitle')}
              </p>
            </div>

            <RecommendedPlacesChart
              rawAnalyticsData={filteredRawAnalyticsData}
            />
          </div>

          {/* Social Media Interaction Chart */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <h2 className="dt-heading">{t('analytics.dashboard.charts.socialMedia.title')}</h2>
              <p className="dt-subtext">
                {t('analytics.dashboard.charts.socialMedia.subtitle')}
              </p>
            </div>

            <SocialMediaInteractionChart
              rawAnalyticsData={filteredRawAnalyticsData}
            />
          </div>

          {/* Content Page Performance — unified overview */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <h2 className="dt-heading">Content Page Performance</h2>
              <p className="dt-subtext">
                Views &amp; click-throughs across Music, Movies, Books, Games and Guides pages.
              </p>
            </div>
            <ContentEngagementChart events={filteredEvents} />
          </div>

          {/* ───────────── MOVIES ───────────── */}

          {/* Movies — Section 1: Engagement with Movie Lists */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🎬</span>
                <h2 className="dt-heading">Engagement with Movie Lists</h2>
              </div>
              <p className="dt-subtext">Track views &amp; clicks over time for each of your movie lists.</p>
            </div>
            <MediaListEngagementChart
              events={filteredEvents}
              pageName="public-movies"
              pageLabel="Movies"
              elementPrefix="movie-card"
              color="#60a5fa"
              icon="🎬"
            />
          </div>

          {/* Movies — Section 2: Movies within a list (pie chart) */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🎬</span>
                <h2 className="dt-heading">Movies Clicked within a List</h2>
              </div>
              <p className="dt-subtext">Select a list to see which movies visitors clicked most.</p>
            </div>
            <MediaItemsInListChart
              events={filteredEvents}
              pageName="public-movies"
              pageLabel="Movies"
              itemLabel="movie"
              elementPrefix="movie-card"
              color="#60a5fa"
              icon="🎬"
            />
          </div>

          {/* ───────────── BOOKS ───────────── */}

          {/* Books — Section 1: Engagement with Book Lists */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">📚</span>
                <h2 className="dt-heading">Engagement with Book Lists</h2>
              </div>
              <p className="dt-subtext">Track views &amp; clicks over time for each of your book lists.</p>
            </div>
            <MediaListEngagementChart
              events={filteredEvents}
              pageName="public-books"
              pageLabel="Books"
              elementPrefix="book-card"
              color="#f59e0b"
              icon="📚"
            />
          </div>

          {/* Books — Section 2: Books within a list (pie chart) */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">📚</span>
                <h2 className="dt-heading">Books Clicked within a List</h2>
              </div>
              <p className="dt-subtext">Select a list to see which books visitors clicked most.</p>
            </div>
            <MediaItemsInListChart
              events={filteredEvents}
              pageName="public-books"
              pageLabel="Books"
              itemLabel="book"
              elementPrefix="book-card"
              color="#f59e0b"
              icon="📚"
            />
          </div>

          {/* ───────────── GAMES ───────────── */}

          {/* Games — Section 1: Engagement with Game Lists */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🎮</span>
                <h2 className="dt-heading">Engagement with Game Lists</h2>
              </div>
              <p className="dt-subtext">Track views &amp; clicks over time for each of your game lists.</p>
            </div>
            <MediaListEngagementChart
              events={filteredEvents}
              pageName="public-games"
              pageLabel="Games"
              elementPrefix="game-card"
              color="#34d399"
              icon="🎮"
            />
          </div>

          {/* Games — Section 2: Games within a list (pie chart) */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🎮</span>
                <h2 className="dt-heading">Games Clicked within a List</h2>
              </div>
              <p className="dt-subtext">Select a list to see which games visitors clicked most.</p>
            </div>
            <MediaItemsInListChart
              events={filteredEvents}
              pageName="public-games"
              pageLabel="Games"
              itemLabel="game"
              elementPrefix="game-card"
              color="#34d399"
              icon="🎮"
            />
          </div>

          {/* Guides — dedicated section */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xl">🗺️</span>
              <div>
                <h2 className="dt-heading">Travel Guides</h2>
                <p className="dt-subtext">Views and guide opens from your public guides page.</p>
              </div>
            </div>
            <GuidesChart events={filteredEvents} />
          </div>

          {/* Daily Views Trend by Section */}
          <div className="dt-surface p-6 rounded-lg">
            <div className="mb-4">
              <h2 className="dt-heading">Daily Views Trend by Section</h2>
              <p className="dt-subtext">
                How each content section (Places, Music, Movies, Books, Games, Guides) is trending over time.
              </p>
            </div>
            <PageViewsTrendChart events={filteredEvents} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
