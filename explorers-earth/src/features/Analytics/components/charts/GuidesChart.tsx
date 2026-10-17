import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AnalyticsEvent } from '../../api/queries';

interface GuidesChartProps {
  events: AnalyticsEvent[];
}

const BAR_COLORS = [
  '#f97316', '#fb923c', '#fdba74', '#fcd34d', '#fbbf24',
  '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f',
];

const GuidesChart: React.FC<GuidesChartProps> = ({ events }) => {
  const guideEvents = useMemo(
    () => events.filter(e => e.page === 'public-guides'),
    [events]
  );

  const totalViews = useMemo(
    () => guideEvents.filter(e => e.type === 'view').length,
    [guideEvents]
  );

  const guideClicks = useMemo(
    () =>
      guideEvents.filter(
        e =>
          e.type === 'click' &&
          (e.element?.startsWith('guide-card') || e.metadata?.originalElement === 'guide-card')
      ),
    [guideEvents]
  );

  /** Group by guide id → { title, guideType, count } */
  const guideRanking = useMemo(() => {
    const map = new Map<string, { title: string; guideType?: string; count: number }>();
    guideClicks.forEach(e => {
      const id       = e.metadata?.id ?? e.element ?? 'unknown';
      const title    = e.metadata?.title ?? id;
      const guideType = e.metadata?.guideType;
      const existing = map.get(id);
      if (existing) {
        existing.count++;
      } else {
        map.set(id, { title, guideType, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [guideClicks]);

  const top10 = guideRanking.slice(0, 10);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (totalViews === 0 && guideClicks.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-dashboard/40">
        <div className="text-center">
          <div className="text-2xl mb-1">🗺️</div>
          <p className="text-sm">No guides page activity yet.</p>
          <p className="text-xs mt-1 opacity-60">
            Views and guide opens will appear here once visitors browse your guides.
          </p>
        </div>
      </div>
    );
  }

  const maxCount = top10[0]?.count ?? 1;
  const color = '#f97316';

  return (
    <div className="space-y-6">
      {/* ── KPI row ───────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="dt-surface rounded-lg p-3 text-center">
          <p className="text-xl font-bold" style={{ color }}>{totalViews}</p>
          <p className="text-xs dt-subtext mt-0.5">Page Views</p>
        </div>
        <div className="dt-surface rounded-lg p-3 text-center">
          <p className="text-xl font-bold" style={{ color }}>{guideClicks.length}</p>
          <p className="text-xs dt-subtext mt-0.5">Guide Opens</p>
        </div>
        <div className="dt-surface rounded-lg p-3 text-center">
          <p className="text-xl font-bold" style={{ color }}>{guideRanking.length}</p>
          <p className="text-xs dt-subtext mt-0.5">Unique Guides</p>
        </div>
      </div>

      {/* ── Bar chart: top 10 ──────────────────────── */}
      {top10.length > 0 && (
        <div>
          <p className="text-xs font-semibold dt-label uppercase tracking-wider mb-3">
            Most Opened Guides (Top {top10.length})
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
                formatter={(value) => [`${Number(value)} open${Number(value) !== 1 ? 's' : ''}`, 'Opens']}
                labelFormatter={(label) => label}
              />
              <Bar dataKey="count" name="Opens" radius={[0, 4, 4, 0]}>
                {top10.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Full ranked list ──────────────────────── */}
      {guideRanking.length > 0 && (
        <div>
          <p className="text-xs font-semibold dt-label uppercase tracking-wider mb-3">
            All Opened Guides ({guideRanking.length})
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide pr-1">
            {guideRanking.map((guide, index) => {
              const pct = (guide.count / maxCount) * 100;
              return (
                <div key={index} className="flex items-center gap-3">
                  <span className="text-xs dt-subtext w-4 text-right flex-shrink-0">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs dt-label truncate max-w-[180px]">{guide.title}</span>
                        {guide.guideType && (
                          <span className="text-[10px] text-orange-400/70 bg-orange-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
                            {guide.guideType}
                          </span>
                        )}
                      </div>
                      <span className="text-xs dt-subtext ml-2 flex-shrink-0">
                        {guide.count} open{guide.count !== 1 ? 's' : ''}
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

      {guideClicks.length === 0 && totalViews > 0 && (
        <p className="text-xs dt-subtext text-center py-4">
          🗺️ {totalViews} view{totalViews !== 1 ? 's' : ''} recorded — no guide opens tracked yet.
        </p>
      )}
    </div>
  );
};

export default GuidesChart;
