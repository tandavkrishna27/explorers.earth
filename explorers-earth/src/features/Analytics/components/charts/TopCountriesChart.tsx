import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AnalyticsEvent } from '../../api/queries';
import { useResponsiveChart } from '../../../../hooks/useResponsiveChart';
import { getCountryName } from '../../utils/countryMapping';
import EmptyState from '../EmptyState';

/**
 * Props interface for TopCountriesChart component
 */
interface TopCountriesChartProps {
  events: AnalyticsEvent[];
  isResolvingCountries?: boolean;
}

/**
 * Chart data interface for Recharts
 */
interface CountryDataPoint {
  country: string;
  views: number;
}

/**
 * Top Countries Chart Component
 * 
 * Displays top 3 countries by view count in a bar chart format.
 */
const TopCountriesChart: React.FC<TopCountriesChartProps> = ({ events, isResolvingCountries = false }) => {
  const { chartConfig } = useResponsiveChart();

  // Transform events into chart-ready data
  const chartData = useMemo(() => {
    // Group events by country
    const countryData: Record<string, number> = {};

    events.forEach(event => {
      if (event.type === 'view' && event.country) {
        const country = event.country;
        countryData[country] = (countryData[country] || 0) + 1;
      }
    });

    // Convert to array, sort by views (descending), and take top 3
    const sortedData: CountryDataPoint[] = Object.entries(countryData)
      .map(([country, views]) => ({
        country: getCountryName(country), // Use shared utility function
        views
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 3); // Limit to top 3 countries

    return sortedData;
  }, [events]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="dt-surface p-3 rounded-lg border border-dashboard shadow-dashboard-elevated">
          <p className="dt-label mb-1">{`Country: ${label}`}</p>
          <p className="dt-subtext text-dashboard-accent">
            Views: {payload[0]?.value || 0}
          </p>
        </div>
      );
    }
    return null;
  };

  // Show loading state while resolving countries
  if (isResolvingCountries) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <div style={{ width: "40px", height: "40px", overflow: "visible" }}>
            <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="dt-subtext text-sm">
            Resolving country data...
          </p>
        </div>
      </div>
    );
  }

  // No data state
  if (chartData.length === 0) {
    const viewEvents = events.filter(e => e.type === 'view');
    const eventsWithCountry = events.filter(e => e.type === 'view' && e.country);

    return (
      <div className="w-full">
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <EmptyState
            icon="globe"
            message="Country Data Unavailable"
            description="Unable to resolve IP addresses to countries at this time. This may be due to network restrictions or service limitations."
          />

          <div className="space-y-2 text-left mt-4">
            <div className="p-3 bg-dashboard-muted rounded-lg">
              <p className="dt-subtext text-sm">
                <strong>Analytics Summary:</strong>
              </p>
              <ul className="dt-subtext text-xs mt-1 space-y-1">
                <li>• {viewEvents.length} total view events</li>
                <li>• {eventsWithCountry.length} events with country data</li>
                <li>• {viewEvents.length - eventsWithCountry.length} events pending geolocation</li>
              </ul>
            </div>

            <p className="dt-subtext text-xs opacity-75">
              Country data will appear automatically once IP geolocation services are available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-2 sm:px-0" style={{ height: `${chartConfig.chartHeight}px` }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
        <BarChart
          data={chartData}
          margin={{
            top: 5,
            right: 10,
            left: 10,
            bottom: 5,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--dash-border)"
            opacity={0.3}
          />
          <XAxis
            dataKey="country"
            stroke="var(--dash-text)"
            fontSize={chartConfig.fontSize}
            angle={-45}
            textAnchor="end"
            height={60}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="var(--dash-text)"
            fontSize={chartConfig.fontSize}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              fontSize: `${chartConfig.legendFontSize}px`,
              paddingTop: '10px'
            }}
          />
          <Bar
            dataKey="views"
            fill="var(--dash-accent)"
            radius={[4, 4, 0, 0]}
            name="Views"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TopCountriesChart;
