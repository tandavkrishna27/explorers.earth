export type AnalyticsTimeFilter = 'today' | 'last7days' | 'last30days' | 'custom';

export interface AnalyticsTimeFilterState {
  type: AnalyticsTimeFilter;
  startDate?: Date;
  endDate?: Date;
}

const startOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

export function getAnalyticsDateRange(
  filter: AnalyticsTimeFilterState,
  now = new Date(),
): { startDate: Date; endDate: Date } | null {
  const today = startOfDay(now);

  if (filter.type === 'custom') {
    if (!filter.startDate || !filter.endDate) return null;
    const startDate = startOfDay(filter.startDate);
    const endDate = endOfDay(filter.endDate);
    return startDate <= endDate ? { startDate, endDate } : null;
  }

  const daysBack = filter.type === 'last7days' ? 6 : filter.type === 'last30days' ? 29 : 0;
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - daysBack);
  return { startDate, endDate: endOfDay(today) };
}
