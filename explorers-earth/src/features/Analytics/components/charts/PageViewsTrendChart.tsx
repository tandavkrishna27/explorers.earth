import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AnalyticsEvent } from '../../api/queries';

interface PageViewsTrendChartProps {
  events: AnalyticsEvent[];
}

// Colour palette per page group
const PAGE_GROUPS: Record<string, { label: string; color: string; pages: string[] }> = {
  places:   { label: 'Places',  color: '#3b82f6', pages: ['public-home', 'recommendation-detail'] },
  profile:  { label: 'Profile', color: '#ec4899', pages: ['public-profile'] },
  guides:   { label: 'Guides',  color: '#f97316', pages: ['public-guides'] },
  music:    { label: 'Music',   color: '#a78bfa', pages: ['public-music'] },
  movies:   { label: 'Movies',  color: '#60a5fa', pages: ['public-movies'] },
  books:    { label: 'Books',   color: '#f59e0b', pages: ['public-books'] },
  games:    { label: 'Games',   color: '#34d399', pages: ['public-games'] },
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const PageViewsTrendChart: React.FC<PageViewsTrendChartProps> = ({ events }) => {
  // Only view events
  const viewEvents = useMemo(() => events.filter(e => e.type === 'view'), [events]);

  // Build daily time-series grouped by page group
  const { chartData, activeGroups } = useMemo(() => {
    if (viewEvents.length === 0) return { chartData: [], activeGroups: [] };

    // Collect all unique dates (YYYY-MM-DD)
    const dateSet = new Set<string>();
    viewEvents.forEach(e => {
      dateSet.add(e.timestamp.split('T')[0]);
    });
    const sortedDates = Array.from(dateSet).sort();

    // For each date, count views by group
    const data = sortedDates.map(date => {
      const dayEvents = viewEvents.filter(e => e.timestamp.startsWith(date));
      const row: Record<string, any> = { date, label: formatDate(date) };
      Object.entries(PAGE_GROUPS).forEach(([key, grp]) => {
        row[key] = dayEvents.filter(e => grp.pages.includes(e.page)).length;
      });
      return row;
    });

    // Only surface groups that have at least 1 view in the whole period
    const active = Object.keys(PAGE_GROUPS).filter(key =>
      data.some(row => row[key] > 0)
    );

    return { chartData: data, activeGroups: active };
  }, [viewEvents]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-dashboard/40">
        <div className="text-center">
          <div className="text-2xl mb-1">📈</div>
          <p className="text-sm">Not enough data to show trends.</p>
        </div>
      </div>
    );
  }

  // Don't bother rendering a single-day chart as a line chart — use a note instead
  const isMultiDay = chartData.length > 1;

  return (
    <div className="space-y-4">
      {/* Legend pills */}
      <div className="flex flex-wrap gap-2">
        {activeGroups.map(key => (
          <span
            key={key}
            className="flex items-center gap-1.5 text-xs dt-label px-2.5 py-1 rounded-full"
            style={{ backgroundColor: `${PAGE_GROUPS[key].color}18`, color: PAGE_GROUPS[key].color }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: PAGE_GROUPS[key].color }}
            />
            {PAGE_GROUPS[key].label}
          </span>
        ))}
      </div>

      {isMultiDay ? (
        <ResponsiveContainer width="100%" height={240} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface, #1e293b)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: 'var(--color-text, #f1f5f9)',
                fontSize: '12px',
              }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
            />
            {activeGroups.map(key => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={PAGE_GROUPS[key].label}
                stroke={PAGE_GROUPS[key].color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        /* Single day — show as a simple count row */
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {activeGroups.map(key => (
            <div key={key} className="dt-surface rounded-lg p-3 flex items-center gap-3">
              <div
                className="w-2 h-10 rounded-full flex-shrink-0"
                style={{ backgroundColor: PAGE_GROUPS[key].color }}
              />
              <div>
                <p className="text-sm font-bold text-dashboard-accent">{chartData[0][key]}</p>
                <p className="text-xs dt-subtext">{PAGE_GROUPS[key].label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PageViewsTrendChart;
