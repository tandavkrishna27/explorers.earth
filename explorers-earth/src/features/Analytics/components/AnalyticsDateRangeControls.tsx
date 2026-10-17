import { useTranslation } from 'react-i18next';
import {
  formatLocalDateInput,
  parseLocalDateInput,
} from '../utils/analyticsDateRange';

interface AnalyticsDateRangeControlsProps {
  startDate: string;
  endDate: string;
  error: string | null;
  onStartDateChange(value: string): void;
  onEndDateChange(value: string): void;
}

const MAX_CUSTOM_INPUT_DAYS = 92;

const shiftDateInput = (value: string, days: number) => {
  const date = parseLocalDateInput(value);
  if (!date) return undefined;
  date.setDate(date.getDate() + days);
  return formatLocalDateInput(date);
};

const AnalyticsDateRangeControls = ({
  startDate,
  endDate,
  error,
  onStartDateChange,
  onEndDateChange,
}: AnalyticsDateRangeControlsProps) => {
  const { t } = useTranslation();

  return (
    <div className="mt-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      <div className="flex items-center gap-2">
        <label className="dt-label text-sm" htmlFor="analytics-date-range-from">
          {t('analytics.dashboard.dateRange.from')} <span className="text-red-500">*</span>
        </label>
        <input
          id="analytics-date-range-from"
          type="date"
          min={endDate ? shiftDateInput(endDate, -MAX_CUSTOM_INPUT_DAYS) : undefined}
          max={endDate || undefined}
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          className={`dt-input px-3 py-2 text-sm border rounded-lg bg-dashboard-surface text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-transparent ${!startDate
            ? 'border-red-300'
            : 'border-dashboard-border'
            }`}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="dt-label text-sm" htmlFor="analytics-date-range-to">
          {t('analytics.dashboard.dateRange.to')} <span className="text-red-500">*</span>
        </label>
        <input
          id="analytics-date-range-to"
          type="date"
          min={startDate || undefined}
          max={startDate ? shiftDateInput(startDate, MAX_CUSTOM_INPUT_DAYS) : undefined}
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          className={`dt-input px-3 py-2 text-sm border rounded-lg bg-dashboard-surface text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-transparent ${!endDate
            ? 'border-red-300'
            : 'border-dashboard-border'
            }`}
        />
      </div>
      {error && <p role="alert" className="dt-label text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default AnalyticsDateRangeControls;
