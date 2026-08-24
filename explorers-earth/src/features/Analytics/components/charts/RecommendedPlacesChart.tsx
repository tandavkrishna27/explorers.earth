import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useQuery } from '@apollo/client';
import { PublicPageAnalyticsData } from '../../api/queries';
import { useResponsiveChart } from '../../../../hooks/useResponsiveChart';
import { recommendationListQuery } from '../../../Favorites/api/query';
import EmptyState from '../EmptyState';

interface RecommendedPlacesChartProps {
  rawAnalyticsData: PublicPageAnalyticsData[];
}

interface RecommendationData {
  id: string;
  name: string;
  category: string;
  clickCount: number;
  locationId: string;
  locationName: string;
}

interface ChartDataPoint {
  name: string;
  value: number;
  category: string;
  recommendationId: string;
  [key: string]: any;
}

interface LocationOption {
  id: string;
  name: string;
  recommendationCount: number;
}

const RecommendedPlacesChart: React.FC<RecommendedPlacesChartProps> = ({ rawAnalyticsData }) => {
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { showPieLabels, chartConfig } = useResponsiveChart();

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

  // Process recommendation data from raw analytics data
  const recommendationData = useMemo(() => {
    // Filter for click events on place cards only
    const clickEvents = rawAnalyticsData.flatMap(item => 
      item.Stats.filter(stat => 
        stat.type === 'click' && 
        stat.element?.startsWith('place-card-') &&
        item.Recommendation_Id
      )
    );

    // Group by Recommendation_Id and count clicks
    const recommendationMap = new Map<string, RecommendationData>();
    
    clickEvents.forEach(event => {
      // Find the corresponding analytics record to get Recommendation_Id and Location_Id
      const analyticsRecord = rawAnalyticsData.find(item => 
        item.Stats.some(stat => stat === event)
      );
      
      if (analyticsRecord?.Recommendation_Id && analyticsRecord?.Location_Id) {
        const recommendationId = analyticsRecord.Recommendation_Id;
        
        // Extract place information from metadata
        const placeName = event.metadata?.placeName || 'Unknown Place';
        const category = event.metadata?.category || 'Unknown Category';
        
        // Extract location name with improved logic
        let locationName = 'Unknown Location';
        
        // 1. First try to get from database lookup using Location_Id
        const dbLocationName = locationIdToNameMap.get(analyticsRecord.Location_Id);
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
        
        const existing = recommendationMap.get(recommendationId);
        if (existing) {
          existing.clickCount += 1;
        } else {
          recommendationMap.set(recommendationId, {
            id: recommendationId,
            name: placeName,
            category,
            clickCount: 1,
            locationId: analyticsRecord.Location_Id,
            locationName
          });
        }
      }
    });

    return Array.from(recommendationMap.values());
  }, [rawAnalyticsData, locationIdToNameMap]);

  // Get unique locations with recommendation counts
  const locationData = useMemo(() => {
    const locationMap = new Map<string, { name: string; recommendationCount: number }>();
    
    recommendationData.forEach(rec => {
      const existing = locationMap.get(rec.locationId) || { name: rec.locationName, recommendationCount: 0 };
      existing.recommendationCount += 1;
      locationMap.set(rec.locationId, existing);
    });

    const locations: LocationOption[] = Array.from(locationMap.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        recommendationCount: data.recommendationCount
      }))
      .sort((a, b) => b.recommendationCount - a.recommendationCount);

    return locations;
  }, [recommendationData]);

  // Set first location as default when locationData changes
  useEffect(() => {
    if (locationData.length > 0 && !selectedLocation) {
      setSelectedLocation(locationData[0].id);
    }
  }, [locationData, selectedLocation]);

  // Transform data for chart
  const chartData = useMemo(() => {
    // Filter recommendations by selected location
    const filteredRecommendations = recommendationData.filter(rec => rec.locationId === selectedLocation);

    // Sort by click count and limit to top 10 for better visualization
    const sortedRecommendations = filteredRecommendations
      .sort((a, b) => b.clickCount - a.clickCount)
      .slice(0, 10);

    const chartDataPoints: ChartDataPoint[] = sortedRecommendations.map(rec => ({
      name: rec.name,
      value: rec.clickCount,
      category: rec.category,
      recommendationId: rec.id
    }));

    return chartDataPoints;
  }, [recommendationData, selectedLocation]);

  // Colors for pie chart slices
  const colors = [
    '#3498DB', // Blue
    '#E74C3C', // Red
    '#2ECC71', // Green
    '#F39C12', // Orange
    '#9B59B6', // Purple
    '#1ABC9C', // Turquoise
    '#E67E22', // Dark Orange
    '#34495E', // Dark Blue
    '#E91E63', // Pink
    '#00BCD4', // Cyan
  ];

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="dt-surface p-3 rounded-lg border border-dashboard shadow-dashboard-elevated">
          <p className="dt-label mb-1">{data.name}</p>
          <p className="dt-subtext text-xs mb-1">Category: {data.category}</p>
          <p className="dt-subtext text-xs">Clicks: {data.value}</p>
        </div>
      );
    }
    return null;
  };

  // Custom label function for pie chart
  const renderCustomLabel = ({ name, percent }: any) => {
    if (!showPieLabels) return null;
    return `${name} (${(percent * 100).toFixed(0)}%)`;
  };

  // Custom dropdown component
  const CustomDropdown = () => {
    const selectedLabel = locationData.find(loc => loc.id === selectedLocation)?.name || 'Select Location';

    return (
      <div className="w-full sm:max-w-xs relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="dt-input w-full text-left flex justify-between items-center dt-label"
        >
          <span>{selectedLabel}</span>
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
            {locationData.map(location => (
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
                {location.name} ({location.recommendationCount} places)
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (recommendationData.length === 0 || !selectedLocation || chartData.length === 0) {
    const totalClickEvents = rawAnalyticsData.reduce((total, record) => 
      total + record.Stats.filter(s => s.type === 'click').length, 0
    );
    const recordsWithRecommendations = rawAnalyticsData.filter(r => r.Recommendation_Id).length;

    return (
      <div className="w-full">
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <EmptyState 
            icon="map-pin"
            message="No recommended places data available"
          />
          
          <div className="space-y-2 text-left mt-4">
            <div className="p-3 bg-dashboard-muted rounded-lg">
              <p className="dt-subtext text-sm">
                <strong>Analytics Summary:</strong>
              </p>
              <ul className="dt-subtext text-xs mt-1 space-y-1">
                <li>• {totalClickEvents} total click events</li>
                <li>• {recordsWithRecommendations} records with Recommendation ID</li>
                <li>• {recommendationData.length} unique recommendations</li>
              </ul>
            </div>
            
            <p className="dt-subtext text-xs opacity-75">
              {!selectedLocation 
                ? 'Please select a location to view recommendation data.'
                : 'No recommendation clicks found for the selected location. Recommendation data will appear once users click on place cards in your location pages.'
              }
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
        <CustomDropdown />
      </div>

      {/* Chart */}
      <div className={`w-full px-2 sm:px-0`} style={{ height: `${chartConfig.chartHeight}px` }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius={chartConfig.chartHeight / 3}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ 
                fontSize: `${chartConfig.legendFontSize}px`,
                paddingTop: '10px'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Statistics */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className={`${chartData.length > 3 ? 'text-base' : 'text-lg'} font-bold text-dashboard-accent`}>
            {chartData.length}
          </p>
          <p className="dt-subtext text-xs sm:text-sm">Places Shown</p>
        </div>
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className={`${chartData.length > 3 ? 'text-base' : 'text-lg'} font-bold text-dashboard-accent`}>
            {chartData.reduce((sum, place) => sum + place.value, 0)}
          </p>
          <p className="dt-subtext text-xs sm:text-sm">Total Clicks</p>
        </div>
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className={`${chartData.length > 3 ? 'text-base' : 'text-lg'} font-bold text-dashboard-accent`}>
            {chartData.length > 0 ? Math.round(chartData.reduce((sum, place) => sum + place.value, 0) / chartData.length) : 0}
          </p>
          <p className="dt-subtext text-xs sm:text-sm">Avg Clicks/Place</p>
        </div>
      </div>
    </div>
  );
};

export default RecommendedPlacesChart;
