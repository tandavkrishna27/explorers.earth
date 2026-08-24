import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useQuery } from '@apollo/client';
import { PublicPageAnalyticsData } from '../../api/queries';
import { useResponsiveChart } from '../../../../hooks/useResponsiveChart';
import { recommendationListQuery } from '../../../Favorites/api/query';
import EmptyState from '../EmptyState';

interface LocationEngagementChartProps {
  rawAnalyticsData: PublicPageAnalyticsData[];
}

interface ChartDataPoint {
  timestamp: string;
  [locationId: string]: string | number;
}

interface LocationOption {
  id: string;
  name: string;
  viewCount: number;
}

const LocationEngagementChart: React.FC<LocationEngagementChartProps> = ({ rawAnalyticsData }) => {
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { chartConfig } = useResponsiveChart();

  // Fetch recommendation lists to get location names by ID
  const { data: recommendationListsData } = useQuery(recommendationListQuery);

  // Create a map of Location_Id to List_Name for quick lookup
  const locationIdToNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (recommendationListsData?.recommendationLists) {
      recommendationListsData.recommendationLists.forEach((list: any) => {
        if (list.documentId && list.List_Name) {
          map.set(list.documentId, list.List_Name);
        }
      });
    }
    return map;
  }, [recommendationListsData]);

  // Close dropdown when clicking outside
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

  // Process location data from raw analytics data
  const locationData = useMemo(() => {
    // Filter for view events only
    const viewEvents = rawAnalyticsData.flatMap(item => 
      item.Stats.filter(stat => stat.type === 'view')
    );

    // Group by Location_Id and count views
    const locationMap = new Map<string, { name: string; viewCount: number }>();
    
    viewEvents.forEach(event => {
      // Find the corresponding analytics record to get Location_Id
      const analyticsRecord = rawAnalyticsData.find(item => 
        item.Stats.some(stat => stat === event)
      );
      
      if (analyticsRecord?.Location_Id) {
        const locationId = analyticsRecord.Location_Id;
        
        // Extract location name with improved logic
        let locationName = 'Unknown Location';
        
        // 1. First try to get from database lookup using Location_Id
        const dbLocationName = locationIdToNameMap.get(locationId);
        if (dbLocationName) {
          locationName = dbLocationName;
        }
        // 2. If not found in DB, try metadata cityname (corrected field name)
        else if (event.metadata?.cityname) {
          locationName = event.metadata.cityname;
        }
        // 3. Fallback to URL extraction for specific location pages
        else if (event.metadata?.url) {
          const urlMatch = event.metadata.url.match(/\/places\/([^/?]+)/);
          if (urlMatch) {
            locationName = urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          }
        }
        
        // 4. Final fallback - use a more descriptive name
        if (locationName === 'Unknown Location') {
          locationName = `Location ${locationId.slice(0, 8)}`;
        }
        
        const existing = locationMap.get(locationId) || { name: locationName, viewCount: 0 };
        existing.viewCount += 1;
        locationMap.set(locationId, existing);
      }
    });

    const locations: LocationOption[] = Array.from(locationMap.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        viewCount: data.viewCount
      }))
      .sort((a, b) => b.viewCount - a.viewCount);

    return locations;
  }, [rawAnalyticsData, locationIdToNameMap]);

  // Transform data for chart
  const chartData = useMemo(() => {
    // Filter for view events only
    const viewEvents = rawAnalyticsData.flatMap(item => 
      item.Stats.filter(stat => stat.type === 'view')
    );

    // Group by timestamp and location
    const timeMap = new Map<string, Map<string, number>>();
    
    viewEvents.forEach(event => {
      // Find the corresponding analytics record to get Location_Id
      const analyticsRecord = rawAnalyticsData.find(item => 
        item.Stats.some(stat => stat === event)
      );
      
      if (analyticsRecord?.Location_Id) {
        const locationId = analyticsRecord.Location_Id;
        const timestamp = new Date(event.timestamp).toISOString().split('T')[0]; // Group by day
        
        if (!timeMap.has(timestamp)) {
          timeMap.set(timestamp, new Map());
        }
        
        const locationMap = timeMap.get(timestamp)!;
        const currentCount = locationMap.get(locationId) || 0;
        locationMap.set(locationId, currentCount + 1);
      }
    });

    const chartDataPoints: ChartDataPoint[] = [];
    
    const timestamps = Array.from(timeMap.keys()).sort();
    
    timestamps.forEach(timestamp => {
      const dataPoint: ChartDataPoint = { timestamp };
      const locationMap = timeMap.get(timestamp)!;
      
      if (selectedLocation === 'all') {
        locationData.forEach(location => {
          dataPoint[location.id] = locationMap.get(location.id) || 0;
        });
      } else {
        dataPoint[selectedLocation] = locationMap.get(selectedLocation) || 0;
      }
      
      chartDataPoints.push(dataPoint);
    });

    return chartDataPoints;
  }, [rawAnalyticsData, locationData, selectedLocation]);

  // Colors for different locations
  const colors = [
    '#3B82F6', // Blue
    '#EF4444', // Red
    '#10B981', // Green
    '#F59E0B', // Yellow
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#84CC16', // Lime
  ];

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="dt-surface p-3 rounded-lg border border-dashboard shadow-dashboard-elevated">
          <p className="dt-label mb-2">{`Date: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="dt-subtext" style={{ color: entry.color }}>
              {`${entry.name}: ${entry.value} views`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // No data state
  if (locationData.length === 0) {
    const viewEvents = rawAnalyticsData.flatMap(item => 
      item.Stats.filter(stat => stat.type === 'view')
    );
    const recordsWithLocationId = rawAnalyticsData.filter(r => r.Location_Id).length;

    return (
      <div className="w-full">
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <EmptyState 
            icon="line-chart"
            message="No location view data available"
          />
          
          <div className="space-y-2 text-left mt-4">
            <div className="p-3 bg-dashboard-muted rounded-lg">
              <p className="dt-subtext text-sm">
                <strong>Analytics Summary:</strong>
              </p>
              <ul className="dt-subtext text-xs mt-1 space-y-1">
                <li>• {viewEvents.length} total view events</li>
                <li>• {recordsWithLocationId} records with Location ID</li>
                <li>• {locationData.length} unique locations</li>
              </ul>
            </div>
            
            <p className="dt-subtext text-xs opacity-75">
              Location engagement data will appear once users view your location pages.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Location Selector */}
      <div className="mb-4">
        <label className="dt-label block mb-2">
          Select Location:
        </label>
        <div className="w-full sm:max-w-xs relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="dt-input w-full text-left flex justify-between items-center dt-label"
          >
            <span>
              {selectedLocation === 'all' 
                ? 'All Locations' 
                : locationData.find(loc => loc.id === selectedLocation)?.name || 'Select Location'
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
                  setSelectedLocation('all');
                  setIsDropdownOpen(false);
                }}
                className={`w-full px-3 py-2 text-left dt-label hover:bg-dashboard-muted transition-colors ${
                  selectedLocation === 'all' ? 'bg-dashboard-muted text-dashboard-accent' : ''
                }`}
              >
                All Locations
              </button>
              {locationData.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => {
                    setSelectedLocation(location.id);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left dt-label hover:bg-dashboard-muted transition-colors ${
                    selectedLocation === location.id ? 'bg-dashboard-muted text-dashboard-accent' : ''
                  }`}
                >
                  {location.name} ({location.viewCount} views)
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="w-full px-2 sm:px-0" style={{ height: `${chartConfig.chartHeight}px` }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
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
            
            {selectedLocation === 'all' ? (
              locationData.map((location, index) => (
                <Line
                  key={location.id}
                  type="monotone"
                  dataKey={location.id}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name={location.name}
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey={selectedLocation}
                stroke={colors[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
                name={locationData.find(loc => loc.id === selectedLocation)?.name || 'Location'}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Statistics */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className={`${locationData.length > 3 ? 'text-base' : 'text-lg'} font-bold text-dashboard-accent`}>
            {locationData.length}
          </p>
          <p className="dt-subtext text-xs sm:text-sm">Total Locations</p>
        </div>
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className={`${locationData.length > 3 ? 'text-base' : 'text-lg'} font-bold text-dashboard-accent`}>
            {locationData.reduce((sum, loc) => sum + loc.viewCount, 0)}
          </p>
          <p className="dt-subtext text-xs sm:text-sm">Total Views</p>
        </div>
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className={`${locationData.length > 3 ? 'text-base' : 'text-lg'} font-bold text-dashboard-accent`}>
            {locationData.length > 0 ? Math.round(locationData.reduce((sum, loc) => sum + loc.viewCount, 0) / locationData.length) : 0}
          </p>
          <p className="dt-subtext text-xs sm:text-sm">Avg Views/Location</p>
        </div>
      </div>
    </div>
  );
};

export default LocationEngagementChart;
