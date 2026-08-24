/**
 * MediaItemsInListChart
 * ─────────────────────────────────────────────────────────────────────────────
 * Section 2 of the Movies / Books / Games analytics pair.
 * Mirrors "Engagement with Recommended Places" — dropdown to select a list,
 * pie chart showing which specific items (movies / books / games) got clicked
 * most within that list.
 *
 * List name is extracted from event.metadata.listName on click events.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { AnalyticsEvent } from '../../api/queries';
import { useResponsiveChart } from '../../../../hooks/useResponsiveChart';
import EmptyState from '../EmptyState';

interface MediaItemsInListChartProps {
  events: AnalyticsEvent[];
  pageName: string;      // e.g. 'public-movies'
  pageLabel: string;     // e.g. 'Movies'
  itemLabel: string;     // e.g. 'movie'  (singular, lowercase)
  elementPrefix: string; // e.g. 'movie-card'
  color: string;
  icon: string;
}

const PIE_COLORS = [
  '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E67E22', '#E91E63', '#00BCD4', '#FF5722',
];

const MediaItemsInListChart: React.FC<MediaItemsInListChartProps> = ({
  events, pageName, pageLabel, itemLabel, elementPrefix, icon,
}) => {
  const [selectedList, setSelectedList] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { showPieLabels, chartConfig } = useResponsiveChart();

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /** All item-click events for this page */
  const clickEvents = useMemo(
    () =>
      events.filter(
        e =>
          e.page === pageName &&
          e.type === 'click' &&
          (e.element?.startsWith(elementPrefix) ||
            e.metadata?.originalElement === elementPrefix)
      ),
    [events, pageName, elementPrefix]
  );

  /**
   * Lists derived from click events (metadata.listName).
   * Each entry: { name, totalClicks, items: [{title, id, count}] }
   */
  const listMap = useMemo(() => {
    const map = new Map<string, { name: string; items: Map<string, { title: string; count: number }> }>();
    clickEvents.forEach(e => {
      const listName = e.metadata?.listName ?? 'Unknown List';
      const itemId   = e.metadata?.id ?? e.element ?? 'unknown';
      const itemTitle = e.metadata?.title ?? e.metadata?.originalElement ?? itemId;

      if (!map.has(listName)) {
        map.set(listName, { name: listName, items: new Map() });
      }
      const listEntry = map.get(listName)!;
      const existing  = listEntry.items.get(itemId) ?? { title: itemTitle, count: 0 };
      existing.count++;
      listEntry.items.set(itemId, existing);
    });
    return map;
  }, [clickEvents]);

  /** Sorted list options */
  const listOptions = useMemo(
    () =>
      Array.from(listMap.values())
        .map(l => ({
          name: l.name,
          totalClicks: Array.from(l.items.values()).reduce((s, i) => s + i.count, 0),
        }))
        .sort((a, b) => b.totalClicks - a.totalClicks),
    [listMap]
  );

  // Auto-select first list when data arrives
  useEffect(() => {
    if (listOptions.length > 0 && !selectedList) {
      setSelectedList(listOptions[0].name);
    }
  }, [listOptions, selectedList]);

  /** Pie chart data for the selected list */
  const pieData = useMemo(() => {
    if (!selectedList || !listMap.has(selectedList)) return [];
    return Array.from(listMap.get(selectedList)!.items.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(item => ({ name: item.title, value: item.count }));
  }, [listMap, selectedList]);

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="dt-surface p-3 rounded-lg border border-dashboard shadow-dashboard-elevated">
          <p className="dt-label mb-1 text-sm">{d.name}</p>
          <p className="dt-subtext text-xs">Clicks: {d.value}</p>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ name, percent }: any) => {
    if (!showPieLabels) return null;
    return `${name.length > 14 ? name.slice(0, 13) + '…' : name} (${(percent * 100).toFixed(0)}%)`;
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (clickEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4">
        <EmptyState icon="map-pin" message={`No ${pageLabel.toLowerCase()} click data available`} />
        <div className="mt-4 p-3 bg-dashboard-muted rounded-lg w-full max-w-sm">
          <p className="dt-subtext text-xs">
            <strong>Analytics Summary:</strong>
          </p>
          <ul className="dt-subtext text-xs mt-1 space-y-1">
            <li>• 0 {itemLabel} click events</li>
            <li>• 0 lists with click data</li>
          </ul>
        </div>
        <p className="dt-subtext text-xs mt-3 opacity-70 text-center">
          {icon} {pageLabel} item clicks will appear here once visitors open {itemLabel}s from your lists.
        </p>
      </div>
    );
  }

  const selectedListData  = listMap.get(selectedList);
  const totalClicksInList = selectedListData
    ? Array.from(selectedListData.items.values()).reduce((s, i) => s + i.count, 0)
    : 0;
  const uniqueItemsInList = selectedListData?.items.size ?? 0;

  return (
    <div className="w-full space-y-6">
      {/* ── List selector dropdown ────────────────────────────────── */}
      <div>
        <label className="dt-label block mb-2">Select List:</label>
        <div className="w-full sm:max-w-xs relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="dt-input w-full text-left flex justify-between items-center dt-label"
          >
            <span>{selectedList || 'Select a list'}</span>
            <svg
              className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 dt-surface border border-dashboard rounded-lg shadow-dashboard-elevated z-50 max-h-60 overflow-y-auto scrollbar-hide">
              {listOptions.map(list => (
                <button
                  key={list.name}
                  type="button"
                  onClick={() => { setSelectedList(list.name); setIsDropdownOpen(false); }}
                  className={`w-full px-3 py-2 text-left dt-label hover:bg-dashboard-muted transition-colors ${selectedList === list.name ? 'bg-dashboard-muted text-dashboard-accent' : ''}`}
                >
                  {list.name} ({list.totalClicks} click{list.totalClicks !== 1 ? 's' : ''})
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Pie chart ─────────────────────────────────────────────── */}
      {pieData.length > 0 ? (
        <div className="w-full" style={{ height: `${chartConfig.chartHeight}px` }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={chartConfig.chartHeight / 3}
                dataKey="value"
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: `${chartConfig.legendFontSize}px`, paddingTop: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="dt-subtext text-sm text-center py-6">
          No click data for this list yet.
        </p>
      )}

      {/* ── Summary stats ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className="text-lg font-bold text-dashboard-accent">{pieData.length}</p>
          <p className="dt-subtext text-xs sm:text-sm">{pageLabel} Shown</p>
        </div>
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className="text-lg font-bold text-dashboard-accent">{totalClicksInList}</p>
          <p className="dt-subtext text-xs sm:text-sm">Total Clicks</p>
        </div>
        <div className="dt-surface p-3 sm:p-4 rounded-lg text-center">
          <p className="text-lg font-bold text-dashboard-accent">
            {uniqueItemsInList > 0
              ? Math.round(totalClicksInList / uniqueItemsInList)
              : 0}
          </p>
          <p className="dt-subtext text-xs sm:text-sm">Avg Clicks / {pageLabel.replace(/s$/, '')}</p>
        </div>
      </div>
    </div>
  );
};

export default MediaItemsInListChart;
