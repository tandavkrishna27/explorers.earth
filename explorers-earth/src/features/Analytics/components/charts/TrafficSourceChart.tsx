import React, { useMemo, useState, useRef, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AnalyticsEvent } from '../../api/queries';
import { useResponsiveChart } from '../../../../hooks/useResponsiveChart';
import EmptyState from '../EmptyState';
import { resolveTrafficSource } from '../../utils/trafficSource';

/**
 * Props interface for TrafficSourceChart component
 */
interface TrafficSourceChartProps {
  events: AnalyticsEvent[];
}

/**
 * Chart data interface for Recharts
 */
interface TrafficDataPoint {
  timestamp: string;
  views: number;
  [key: string]: string | number; // Dynamic traffic source keys
}

/**
 * Traffic source options for dropdown
 */
const TRAFFIC_SOURCES = [
  { value: 'all', label: 'All Sources' },
  { value: 'direct', label: 'Direct' },
  { value: 'qr_code_scan', label: 'QR Code' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'twitter', label: 'Twitter' },
] as const;

type TrafficSource = typeof TRAFFIC_SOURCES[number]['value'];

/**
 * Traffic Source Chart Component
 * 
 * This component:
 * 1. Takes analytics events as props
 * 2. Extracts traffic source from utmParams.utm_source (defaults to 'direct' if missing)
 * 3. Groups events by timestamp and traffic source
 * 4. Renders a line chart showing traffic over time
 * 5. Includes dropdown for filtering by specific traffic source
 * 6. Uses the dashboard theme colors from index.css
 */
const TrafficSourceChart: React.FC<TrafficSourceChartProps> = ({ events }) => {
  const [selectedSource, setSelectedSource] = useState<TrafficSource>('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { chartConfig } = useResponsiveChart();

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Transform events into chart-ready data
  const chartData = useMemo(() => {
    // Filter for view events only
    const viewEvents = events.filter(event => event.type === 'view');
    
    if (viewEvents.length === 0) {
      return [];
    }

    // Group events by timestamp (day level for better visualization)
    const timeGroups: Record<string, Record<string, number>> = {};
    
    viewEvents.forEach(event => {
      // Extract traffic source from utmParams.utm_source
      // Default to 'direct' if utm_source is missing or empty
      const trafficSource = resolveTrafficSource(event);
      
      // Convert timestamp to date string (YYYY-MM-DD) for grouping
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      
      // Initialize time group if it doesn't exist
      if (!timeGroups[date]) {
        timeGroups[date] = {};
      }
      
      // Count views for this traffic source on this date
      timeGroups[date][trafficSource] = (timeGroups[date][trafficSource] || 0) + 1;
    });

    // Get all unique traffic sources across all time periods
    const allSources = new Set<string>();
    Object.values(timeGroups).forEach(sources => {
      Object.keys(sources).forEach(source => allSources.add(source));
    });

    // Convert to array format for Recharts, ensuring all sources are represented
    // This is crucial for "All Sources" view - each data point must have all sources
    // even if some sources have 0 views on certain days
    const sortedData: TrafficDataPoint[] = Object.entries(timeGroups)
      .map(([timestamp, sources]) => {
        const dataPoint: TrafficDataPoint = {
          timestamp,
          views: Object.values(sources).reduce((sum, count) => sum + count, 0)
        };
        
        // Ensure all sources are represented, even if they have 0 views
        // This prevents missing lines when "All Sources" is selected
        allSources.forEach(source => {
          dataPoint[source] = sources[source] || 0;
        });
        
        return dataPoint;
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return sortedData;
  }, [events]);

  // Get available traffic sources from the data
  const availableSources = useMemo(() => {
    if (chartData.length === 0) return [];
    
    // Get all sources from the first data point (since all sources are now represented in every point)
    const sources = Object.keys(chartData[0]).filter(key => 
      key !== 'timestamp' && key !== 'views'
    );
    
    return sources.sort();
  }, [chartData]);

  // Filter data based on selected source
  const filteredData = useMemo(() => {
    if (selectedSource === 'all') {
      return chartData;
    }
    
    return chartData.map(dataPoint => ({
      timestamp: dataPoint.timestamp,
      views: dataPoint[selectedSource] || 0,
      [selectedSource]: dataPoint[selectedSource] || 0
    }));
  }, [chartData, selectedSource]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="dt-surface p-3 rounded-lg border border-dashboard shadow-dashboard-elevated">
          <p className="dt-label text-sm mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="dt-subtext text-xs" style={{ color: entry.color }}>
              {entry.dataKey}: {entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // No data state
  if (chartData.length === 0) {
    const viewEvents = events.filter(e => e.type === 'view');
    
    return (
      <div className="w-full">
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <EmptyState 
            icon="bar-chart"
            message="No Traffic Data Available"
            description="No view events found with traffic source information."
          />
          
          <div className="space-y-2 text-left mt-4">
            <div className="p-3 bg-dashboard-muted rounded-lg">
              <p className="dt-subtext text-sm">
                <strong>Analytics Summary:</strong>
              </p>
              <ul className="dt-subtext text-xs mt-1 space-y-1">
                <li>• {viewEvents.length} total view events</li>
                <li>• {viewEvents.filter(e => e.utmParams?.utm_source).length} events with UTM source</li>
                <li>• {viewEvents.filter(e => !e.utmParams?.utm_source).length} direct traffic events</li>
              </ul>
            </div>
            
            <p className="dt-subtext text-xs opacity-75">
              Traffic source data will appear once users visit your pages with UTM parameters.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Traffic Source Selector */}
      <div className="mb-4">
        <label className="dt-label block mb-2">
          Select Traffic Source:
        </label>
        <div className="w-full sm:max-w-xs relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="dt-input w-full text-left flex justify-between items-center dt-label"
          >
            <span>
              {selectedSource === 'all' 
                ? 'All Sources' 
                : TRAFFIC_SOURCES.find(s => s.value === selectedSource)?.label || 
                  selectedSource.charAt(0).toUpperCase() + selectedSource.slice(1)
              }
            </span>
            <svg 
              className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 dt-surface border border-dashboard rounded-lg shadow-dashboard-elevated z-50 max-h-60 overflow-y-auto scrollbar-hide">
              <button
                type="button"
                onClick={() => {
                  setSelectedSource('all');
                  setIsDropdownOpen(false);
                }}
                className={`w-full px-3 py-2 text-left dt-label hover:bg-dashboard-muted transition-colors ${
                  selectedSource === 'all' ? 'bg-dashboard-muted text-dashboard-accent' : ''
                }`}
              >
                All Sources
              </button>
              {availableSources.map(source => {
                const sourceOption = TRAFFIC_SOURCES.find(s => s.value === source);
                return (
                  <button
                    key={source}
                    type="button"
                    onClick={() => {
                      setSelectedSource(source as TrafficSource);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left dt-label hover:bg-dashboard-muted transition-colors ${
                      selectedSource === source ? 'bg-dashboard-muted text-dashboard-accent' : ''
                    }`}
                  >
                    {sourceOption?.label || source.charAt(0).toUpperCase() + source.slice(1)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="w-full px-2 sm:px-0" style={{ height: `${chartConfig.chartHeight}px` }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
          <LineChart
            data={filteredData}
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
              dataKey="timestamp" 
              stroke="var(--dash-text)"
              fontSize={chartConfig.fontSize}
              tickFormatter={formatTimestamp}
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
            
            {/* Render lines for each traffic source */}
            {selectedSource === 'all' ? (
              // Show all sources with different colors
              availableSources.map((source, index) => {
                const colors = [
                  'var(--dash-accent)',
                  '#10B981', // green
                  '#F59E0B', // amber
                  '#EF4444', // red
                  '#8B5CF6', // violet
                  '#06B6D4', // cyan
                ];
                return (
                  <Line
                    key={source}
                    type="monotone"
                    dataKey={source}
                    stroke={colors[index % colors.length]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name={TRAFFIC_SOURCES.find(s => s.value === source)?.label || source}
                  />
                );
              })
            ) : (
              // Show only selected source
              <Line
                type="monotone"
                dataKey={selectedSource}
                stroke="var(--dash-accent)"
                strokeWidth={2}
                dot={{ r: 4 }}
                name={TRAFFIC_SOURCES.find(s => s.value === selectedSource)?.label || selectedSource}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrafficSourceChart;
