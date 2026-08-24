import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AnalyticsEvent } from '../../api/queries';

interface ContentEngagementChartProps {
  events: AnalyticsEvent[];
}

// Page display config: internal page name → { label, color }
const PAGE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  'public-music':  { label: 'Music',  color: '#a78bfa', icon: '🎵' },
  'public-movies': { label: 'Movies', color: '#60a5fa', icon: '🎬' },
  'public-books':  { label: 'Books',  color: '#f59e0b', icon: '📚' },
  'public-games':  { label: 'Games',  color: '#34d399', icon: '🎮' },
  'public-guides': { label: 'Guides', color: '#f97316', icon: '🗺️' },
};

const MEDIA_PAGES = Object.keys(PAGE_CONFIG);

/**
 * Click element prefixes used to identify item-click events.
 * The analytics service stores elements as "{prefix}-{id}" (e.g. "game-card-abc123"),
 * so we match via startsWith OR via metadata.originalElement which always holds the
 * clean prefix name ("game-card").
 */
const ITEM_CLICK_PREFIXES = ['movie-card', 'book-card', 'game-card', 'song-request'];

const isItemClick = (e: AnalyticsEvent) =>
  e.type === 'click' &&
  ITEM_CLICK_PREFIXES.some(
    prefix =>
      e.element?.startsWith(prefix) ||
      e.metadata?.originalElement === prefix
  );

const isSongRequest = (e: AnalyticsEvent) =>
  e.type === 'click' &&
  (e.element?.startsWith('song-request') || e.metadata?.originalElement === 'song-request');

const ContentEngagementChart: React.FC<ContentEngagementChartProps> = ({ events }) => {
  // ── Per-page bar chart data ───────────────────────────────────────────────
  const chartData = useMemo(() => {
    return MEDIA_PAGES.map(pageKey => {
      const pageEvents = events.filter(e => e.page === pageKey);
      return {
        name: PAGE_CONFIG[pageKey].label,
        Views:  pageEvents.filter(e => e.type === 'view').length,
        Clicks: pageEvents.filter(e => isItemClick(e)).length,
        color:  PAGE_CONFIG[pageKey].color,
      };
    }).filter(d => d.Views > 0 || d.Clicks > 0);
  }, [events]);

  // ── Most-clicked items leaderboard ────────────────────────────────────────
  const topItems = useMemo(() => {
    const clickEvents = events.filter(
      e => MEDIA_PAGES.includes(e.page) && isItemClick(e)
    );

    const countMap = new Map<string, { label: string; page: string; count: number }>();
    clickEvents.forEach(e => {
      // Use title from metadata; fall back to originalElement or first element segment
      const label  = e.metadata?.title ?? e.metadata?.originalElement ?? e.element?.split('-')[0] ?? 'Unknown';
      // Unique key = page + item id (prevents double-counting same item across records)
      const key    = `${e.page}::${e.metadata?.id ?? label}`;
      const existing = countMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        countMap.set(key, { label, page: e.page, count: 1 });
      }
    });

    return Array.from(countMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [events]);

  // ── Aggregates ────────────────────────────────────────────────────────────
  const totalMediaViews  = chartData.reduce((s, d) => s + d.Views, 0);
  const totalItemClicks  = events.filter(e => MEDIA_PAGES.includes(e.page) && isItemClick(e)).length;
  const songRequestCount = events.filter(isSongRequest).length;

  if (totalMediaViews === 0 && totalItemClicks === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-dashboard/40">
        <div className="text-center">
          <div className="text-2xl mb-1">🎭</div>
          <p className="text-sm">No media page activity yet.</p>
          <p className="text-xs mt-1 opacity-60">Views from Music, Movies, Books &amp; Games will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── KPI row ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="dt-surface rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-dashboard-accent">{totalMediaViews}</p>
          <p className="text-xs dt-subtext mt-0.5">Media Views</p>
        </div>
        <div className="dt-surface rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-dashboard-accent">{totalItemClicks}</p>
          <p className="text-xs dt-subtext mt-0.5">Item Clicks</p>
        </div>
        <div className="dt-surface rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-dashboard-accent">{songRequestCount}</p>
          <p className="text-xs dt-subtext mt-0.5">Song Requests</p>
        </div>
      </div>

      {/* ── Views vs Clicks per page bar chart ──────── */}
      {chartData.length > 0 && (
        <div>
          <p className="text-xs font-semibold dt-label uppercase tracking-wider mb-3">Views &amp; Clicks by Page</p>
          <ResponsiveContainer width="100%" height={220} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
            <BarChart data={chartData} barCategoryGap="25%" barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 11 }}
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
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Bar dataKey="Views"  fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Clicks" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Most clicked items leaderboard ───────────── */}
      {topItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold dt-label uppercase tracking-wider mb-3">Most Clicked Items</p>
          <div className="space-y-2">
            {topItems.map((item, index) => {
              const cfg = PAGE_CONFIG[item.page];
              const maxCount = topItems[0].count;
              const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
              return (
                <div key={index} className="flex items-center gap-3">
                  <span className="text-sm w-5 text-center">{cfg?.icon ?? '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs dt-label truncate max-w-[200px]">{item.label}</span>
                      <span className="text-xs dt-subtext ml-2 flex-shrink-0">
                        {item.count} click{item.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: cfg?.color ?? '#60a5fa' }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Per-page pill breakdown ───────────────────── */}
      <div>
        <p className="text-xs font-semibold dt-label uppercase tracking-wider mb-3">Page Breakdown</p>
        <div className="flex flex-wrap gap-2">
          {MEDIA_PAGES.map(pageKey => {
            const cfg = PAGE_CONFIG[pageKey];
            const pageViews  = events.filter(e => e.page === pageKey && e.type === 'view').length;
            const pageClicks = events.filter(e => e.page === pageKey && isItemClick(e)).length;
            if (pageViews === 0 && pageClicks === 0) return null;
            return (
              <div
                key={pageKey}
                className="dt-surface border border-white/5 rounded-xl px-3 py-2 flex items-center gap-2"
                style={{ borderLeftColor: cfg.color, borderLeftWidth: 3 }}
              >
                <span>{cfg.icon}</span>
                <div>
                  <p className="text-xs font-semibold dt-label">{cfg.label}</p>
                  <p className="text-[10px] dt-subtext">{pageViews}v · {pageClicks}c</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ContentEngagementChart;
