import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PublicPageAnalyticsData } from '../../api/queries';
import { useResponsiveChart } from '../../../../hooks/useResponsiveChart';
import EmptyState from '../EmptyState';

interface SocialMediaInteractionChartProps {
  rawAnalyticsData: PublicPageAnalyticsData[];
}

interface SocialMediaData {
  platform: string;
  clickCount: number;
  displayName: string;
}

const SocialMediaInteractionChart: React.FC<SocialMediaInteractionChartProps> = ({ rawAnalyticsData }) => {
  const { chartConfig } = useResponsiveChart();
  // Process social media data from raw analytics data
  const socialMediaData = useMemo(() => {
    // Filter for click events on social links from public-profile page only
    const socialClickEvents = rawAnalyticsData.flatMap(item => 
      item.Stats.filter(stat => 
        stat.type === 'click' && 
        stat.element?.startsWith('social-link-') &&
        stat.page === 'public-profile' &&
        stat.metadata?.platform
      )
    );

    // Group by platform and count clicks
    const platformMap = new Map<string, SocialMediaData>();
    
    socialClickEvents.forEach(event => {
      const platform = event.metadata?.platform;
      if (platform) {
        const displayName = platform.charAt(0).toUpperCase() + platform.slice(1);
        
        const existing = platformMap.get(platform);
        if (existing) {
          existing.clickCount += 1;
        } else {
          platformMap.set(platform, {
            platform,
            clickCount: 1,
            displayName
          });
        }
      }
    });

    return Array.from(platformMap.values()).sort((a, b) => b.clickCount - a.clickCount);
  }, [rawAnalyticsData]);

  // Transform data for chart - shows all platforms
  const chartData = useMemo(() => {
    return socialMediaData.map(data => ({
      name: data.displayName,
      value: data.clickCount
    }));
  }, [socialMediaData]);

  // Colors for pie chart slices
  const colors = [
    '#25D366', // WhatsApp Green
    '#E4405F', // Instagram Pink
    '#0077B5', // LinkedIn Blue
    '#1DA1F2', // Twitter Blue
    '#FF0000', // YouTube Red
    '#1877F2', // Facebook Blue
    '#FF4500', // Reddit Orange
    '#8A3AB9', // Snapchat Purple
    '#00A2ED', // Skype Blue
    '#FFFC00', // TikTok Yellow
  ];

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="dt-surface p-3 rounded-lg border border-dashboard shadow-dashboard-elevated">
          <p className="dt-label mb-1">{data.name}</p>
          <p className="dt-subtext text-xs">Clicks: {data.value}</p>
        </div>
      );
    }
    return null;
  };

  if (socialMediaData.length === 0) {
    const totalSocialClicks = rawAnalyticsData.reduce((total, record) => 
      total + record.Stats.filter(s => 
        s.type === 'click' && 
        s.element?.startsWith('social-link-') && 
        s.page === 'public-profile'
      ).length, 0
    );

    return (
      <div className="w-full">
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <EmptyState 
            icon="share"
            message="No Social Media Interaction Data"
            description="No social media click data available from your public profile page."
          />
          
          <div className="space-y-2 text-left mt-4">
            <div className="p-3 bg-dashboard-muted rounded-lg">
              <p className="dt-subtext text-sm">
                <strong>Analytics Summary:</strong>
              </p>
              <ul className="dt-subtext text-xs mt-1 space-y-1">
                <li>• {totalSocialClicks} total social media clicks</li>
                <li>• {socialMediaData.length} unique platforms</li>
                <li>• Only tracking clicks from public-profile page</li>
              </ul>
            </div>
            
            <p className="dt-subtext text-xs opacity-75">
              Social media interaction data will appear once users click on your social media links.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Chart */}
      <div className={`w-full px-2 sm:px-0`} style={{ height: `${chartConfig.chartHeight}px` }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={chartConfig.chartHeight / 4}
              outerRadius={chartConfig.chartHeight / 3}
              fill="#8884d8"
              paddingAngle={5}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${entry.name}`} fill={colors[index % colors.length]} />
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
          <p className="dt-subtext text-xs sm:text-sm">Platforms</p>
        </div>
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className={`${chartData.length > 3 ? 'text-base' : 'text-lg'} font-bold text-dashboard-accent`}>
            {chartData.reduce((sum, platform) => sum + platform.value, 0)}
          </p>
          <p className="dt-subtext text-xs sm:text-sm">Total Clicks</p>
        </div>
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className={`${chartData.length > 3 ? 'text-base' : 'text-lg'} font-bold text-dashboard-accent`}>
            {chartData.length > 0 ? Math.round(chartData.reduce((sum, platform) => sum + platform.value, 0) / chartData.length) : 0}
          </p>
          <p className="dt-subtext text-xs sm:text-sm">Avg Clicks/Platform</p>
        </div>
      </div>
    </div>
  );
};

export default SocialMediaInteractionChart;
