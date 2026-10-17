/**
 * MediaListEngagementChart
 * ─────────────────────────────────────────────────────────────────────────────
 * Section 1 of the Movies / Books / Games analytics pair.
 * Mirrors "Engagement with Location" — shows a line chart of page views over
 * time, switchable between "All Lists" and a specific list.
 *
 * Since media pages track views at the page level (not list level), this chart:
 * • Uses page-level view events to show overall views over time
 * • Uses click events with metadata.listName to count click activity per list
 * • Shows a dropdown to filter the time-series to a specific list's items
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { AnalyticsEvent } from '../../api/queries';
import EmptyState from '../EmptyState';

interface MediaListEngagementChartProps {
  events: AnalyticsEvent[];
  pageName: string;   // e.g. 'public-movies'
  pageLabel: string;  // e.g. 'Movies'
  elementPrefix: string; // e.g. 'movie-card'
  color: string;
  icon: string;
}

const CHART_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
];

const formatDate = (iso: string) => iso.split('T')[0];

const MediaListEngagementChart: React.FC<MediaListEngagementChartProps> = ({
  events, pageName, pageLabel, elementPrefix, color, icon,
}) => {
  const [selectedList, setSelectedList] = useState<string>('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // All events on this page
  const pageEvents = useMemo(
    () => events.filter(e => e.page === pageName),
    [events, pageName]
  );

  const viewEvents = useMemo(
    () => pageEvents.filter(e => e.type === 'view'),
    [pageEvents]
  );

  /** Click events for this media type, enriched with listName from metadata */
  const clickEvents = useMemo(
    () =>
      pageEvents.filter(
        e =>
          e.type === 'click' &&
          (e.element?.startsWith(elementPrefix) ||
            e.metadata?.originalElement === elementPrefix)
      ),
    [pageEvents, elementPrefix]
  );

  /** Unique lists derived from click event metadata */
  const listOptions = useMemo(() => {
    const map = new Map<string, { name: string; clickCount: number }>();
    clickEvents.forEach(e => {
      const listName = e.metadata?.listName ?? 'Unknown List';
      const existing = map.get(listName) ?? { name: listName, clickCount: 0 };
      existing.clickCount++;
      map.set(listName, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.clickCount - a.clickCount);
  }, [clickEvents]);

  /**
   * Time-series: views per day (page-level views, not list-specific —
   * since we don't store list context on view events).
   * When a specific list is selected, we show clicks for that list per day instead.
   */
  const timeSeriesData = useMemo(() => {
    const dateMap = new Map<string, { views: number; clicks: number }>();

    // Count page views per day (always page-level)
    viewEvents.forEach(e => {
      const date = formatDate(e.timestamp);
      const entry = dateMap.get(date) ?? { views: 0, clicks: 0 };
      entry.views++;
      dateMap.set(date, entry);
    });

    // Count clicks per day (filtered by selected list if needed)
    const relevantClicks = selectedList === 'all'
      ? clickEvents
      : clickEvents.filter(e => (e.metadata?.listName ?? 'Unknown List') === selectedList);

    relevantClicks.forEach(e => {
      const date = formatDate(e.timestamp);
      const entry = dateMap.get(date) ?? { views: 0, clicks: 0 };
      entry.clicks++;
      dateMap.set(date, entry);
    });

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));
  }, [viewEvents, clickEvents, selectedList]);

  /** Bar chart: clicks per list (for overview mode) */
  const listClicksData = useMemo(
    () => listOptions.map(l => ({ name: l.name, Clicks: l.clickCount })),
    [listOptions]
  );

  // ── Empty state ──────────────────────────────────────────────────────────
  if (viewEvents.length === 0 && clickEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4">
        <EmptyState icon="line-chart" message={`No ${pageLabel.toLowerCase()} engagement data yet`} />
        <p className="dt-subtext text-xs mt-3 opacity-70 text-center">
          {icon} Views and item clicks from your {pageLabel.toLowerCase()} page will appear here.
        </p>
      </div>
    );
  }

  const selectedListLabel = selectedList === 'all'
    ? 'All Lists'
    : selectedList;

  const totalPageViews = viewEvents.length;
  const totalClicks    = clickEvents.length;

  return (
    <div className="w-full space-y-6">
      {/* ── List selector dropdown ───────────────────────────────────── */}
      <div>
        <label className="dt-label block mb-2">Select List:</label>
        <div className="w-full sm:max-w-xs relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="dt-input w-full text-left flex justify-between items-center dt-label"
          >
            <span>{selectedListLabel}</span>
            <svg
              className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 dt-surface border border-dashboard rounded-lg shadow-dashboard-elevated z-50 max-h-60 overflow-y-auto scrollbar-hide">
              <button
                type="button"
                onClick={() => { setSelectedList('all'); setIsDropdownOpen(false); }}
                className={`w-full px-3 py-2 text-left dt-label hover:bg-dashboard-muted transition-colors ${selectedList === 'all' ? 'bg-dashboard-muted text-dashboard-accent' : ''}`}
              >
                All Lists
              </button>
              {listOptions.map(list => (
                <button
                  key={list.name}
                  type="button"
                  onClick={() => { setSelectedList(list.name); setIsDropdownOpen(false); }}
                  className={`w-full px-3 py-2 text-left dt-label hover:bg-dashboard-muted transition-colors ${selectedList === list.name ? 'bg-dashboard-muted text-dashboard-accent' : ''}`}
                >
                  {list.name} ({list.clickCount} clicks)
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Time-series line chart ───────────────────────────────── */}
      {timeSeriesData.length > 0 && (
        <div className="w-full" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
            <LineChart data={timeSeriesData} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                stroke="var(--dash-text)"
                fontSize={10}
                angle={-35}
                textAnchor="end"
                height={55}
                interval="preserveStartEnd"
              />
              <YAxis stroke="var(--dash-text)" fontSize={10} width={28} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface, #1e293b)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelFormatter={(l) => `Date: ${l}`}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Line type="monotone" dataKey="views" stroke={color} strokeWidth={2} dot={{ r: 3 }} name="Page Views" />
              <Line type="monotone" dataKey="clicks" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} name={`${selectedList === 'all' ? 'All' : selectedListLabel} Clicks`} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Clicks-per-list bar chart (only in "All Lists" mode) ──── */}
      {selectedList === 'all' && listClicksData.length > 0 && (
        <div>
          <p className="text-xs font-semibold dt-label uppercase tracking-wider mb-3">Clicks by List</p>
          <ResponsiveContainer width="100%" height={Math.max(160, listClicksData.length * 38)} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
            <BarChart data={listClicksData} layout="vertical" margin={{ left: 8, right: 32, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={130}
                tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 10 }}
                axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 18 ? `${v.slice(0, 17)}…` : v}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--color-surface, #1e293b)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v) => [`${v} click${v !== 1 ? 's' : ''}`, 'Clicks']}
              />
              <Bar dataKey="Clicks" radius={[0, 4, 4, 0]}>
                {listClicksData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Summary stats ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className="text-lg font-bold text-dashboard-accent">{listOptions.length}</p>
          <p className="dt-subtext text-xs sm:text-sm">Total Lists</p>
        </div>
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className="text-lg font-bold text-dashboard-accent">{totalPageViews}</p>
          <p className="dt-subtext text-xs sm:text-sm">Total Views</p>
        </div>
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className="text-lg font-bold text-dashboard-accent">{totalClicks}</p>
          <p className="dt-subtext text-xs sm:text-sm">Total Item Clicks</p>
        </div>
      </div>
    </div>
  );
};

export default MediaListEngagementChart;
