import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AnalyticsEvent } from '../../api/queries';

interface MediaItemChartProps {
  /** All flattened + date-filtered analytics events */
  events: AnalyticsEvent[];
  /** Internal page name stored in event.page */
  pageName: string;
  /** Human-readable label, e.g. "Movies" */
  pageLabel: string;
  /** Element prefix, e.g. "movie-card" */
  elementPrefix: string;
  /** Accent colour for chart bars */
  color: string;
  /** Emoji icon */
  icon: string;
  /** What to call individual items, e.g. "movie" */
  itemLabel: string;
}

const BAR_COLORS = [
  '#3b82f6', '#a78bfa', '#34d399', '#f59e0b', '#f97316',
  '#ec4899', '#60a5fa', '#fb923c', '#4ade80', '#c084fc',
];

/**
 * Generic chart used for Movies, Books, and Games sections.
 * Shows:
 *  - KPI row: total views, total item clicks, unique items clicked
 *  - Horizontal bar chart: top 10 most-clicked items
 *  - Full ranked list below the chart
 */
const MediaItemChart: React.FC<MediaItemChartProps> = ({
  events,
  pageName,
  pageLabel,
  elementPrefix,
  color,
  icon,
  itemLabel,
}) => {
  const pageEvents = useMemo(
    () => events.filter(e => e.page === pageName),
    [events, pageName]
  );

  const totalViews = useMemo(
    () => pageEvents.filter(e => e.type === 'view').length,
    [pageEvents]
  );

  /** All item-click events: element starts with the prefix OR originalElement matches */
  const itemClicks = useMemo(
    () =>
      pageEvents.filter(
        e =>
          e.type === 'click' &&
          (e.element?.startsWith(elementPrefix) ||
            e.metadata?.originalElement === elementPrefix)
      ),
    [pageEvents, elementPrefix]
  );

  /** Group by item ID → { title, count } */
  const itemRanking = useMemo(() => {
    const map = new Map<string, { title: string; count: number }>();
    itemClicks.forEach(e => {
      const id    = e.metadata?.id ?? e.element ?? 'unknown';
      const title = e.metadata?.title ?? e.metadata?.originalElement ?? id;
      const existing = map.get(id);
      if (existing) {
        existing.count++;
      } else {
        map.set(id, { title, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [itemClicks]);

  const top10 = itemRanking.slice(0, 10);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (totalViews === 0 && itemClicks.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-dashboard/40">
        <div className="text-center">
          <div className="text-2xl mb-1">{icon}</div>
          <p className="text-sm">No {pageLabel.toLowerCase()} page activity yet.</p>
        </div>
      </div>
    );
  }

  const maxCount = top10[0]?.count ?? 1;

  return (
    <div className="space-y-6">
      {/* ── KPI row ───────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="dt-surface rounded-lg p-3 text-center">
          <p className="text-xl font-bold" style={{ color }}>{totalViews}</p>
          <p className="text-xs dt-subtext mt-0.5">Page Views</p>
        </div>
        <div className="dt-surface rounded-lg p-3 text-center">
          <p className="text-xl font-bold" style={{ color }}>{itemClicks.length}</p>
          <p className="text-xs dt-subtext mt-0.5">Item Clicks</p>
        </div>
        <div className="dt-surface rounded-lg p-3 text-center">
          <p className="text-xl font-bold" style={{ color }}>{itemRanking.length}</p>
          <p className="text-xs dt-subtext mt-0.5">Unique {pageLabel}</p>
        </div>
      </div>

      {/* ── Bar chart: top 10 ──────────────────────── */}
      {top10.length > 0 && (
        <div>
          <p className="text-xs font-semibold dt-label uppercase tracking-wider mb-3">
            Top {top10.length} Most Clicked {pageLabel}
          </p>
          <ResponsiveContainer width="100%" height={Math.max(200, top10.length * 36)} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
            <BarChart data={top10} layout="vertical" margin={{ left: 8, right: 32, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="title"
                width={140}
                tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => v.length > 18 ? `${v.slice(0, 17)}…` : v}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface, #1e293b)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: 'var(--color-text, #f1f5f9)',
                  fontSize: '12px',
                }}
                formatter={(value) => [`${Number(value)} click${Number(value) !== 1 ? 's' : ''}`, 'Clicks']}
                labelFormatter={(label) => label}
              />
              <Bar dataKey="count" name="Clicks" radius={[0, 4, 4, 0]}>
                {top10.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Full ranked list ──────────────────────── */}
      {itemRanking.length > 0 && (
        <div>
          <p className="text-xs font-semibold dt-label uppercase tracking-wider mb-3">
            All Clicked {pageLabel} ({itemRanking.length})
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide pr-1">
            {itemRanking.map((item, index) => {
              const pct = (item.count / maxCount) * 100;
              return (
                <div key={index} className="flex items-center gap-3">
                  <span className="text-xs dt-subtext w-4 text-right flex-shrink-0">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs dt-label truncate max-w-[220px]">{item.title}</span>
                      <span className="text-xs dt-subtext ml-2 flex-shrink-0">
                        {item.count} click{item.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {itemClicks.length === 0 && totalViews > 0 && (
        <p className="text-xs dt-subtext text-center py-4">
          {icon} {totalViews} view{totalViews !== 1 ? 's' : ''} recorded — no {itemLabel} clicks yet.
        </p>
      )}
    </div>
  );
};

export default MediaItemChart;
