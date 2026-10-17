import { describe, expect, it } from 'vitest';
import {
  formatLocalDateInput,
  getAnalyticsDateRange,
  parseLocalDateInput,
} from '../utils/analyticsDateRange';

const now = new Date(2026, 7, 24, 14, 35, 20);
const local = (year: number, month: number, day: number, endOfDay = false) =>
  new Date(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);

describe('getAnalyticsDateRange', () => {
  it.each([
    ['2024-02-29', [2024, 1, 29]],
    ['2026-01-01', [2026, 0, 1]],
    ['2026-12-31', [2026, 11, 31]],
  ])('parses %s as a local calendar date', (input, expected) => {
    const parsed = parseLocalDateInput(input)!;
    expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate()]).toEqual(expected);
    expect(formatLocalDateInput(parsed)).toBe(input);
  });

  it.each(['', '2026-02-30', '2026-2-03', 'not-a-date'])(
    'rejects non-canonical date-only input %s',
    (input) => expect(parseLocalDateInput(input)).toBeNull(),
  );

  it.each([
    ['today', local(2026, 7, 24), local(2026, 7, 24, true)],
    ['last7days', local(2026, 7, 18), local(2026, 7, 24, true)],
    ['last30days', local(2026, 6, 26), local(2026, 7, 24, true)],
  ] as const)('returns an inclusive server scope for %s', (type, from, to) => {
    expect(getAnalyticsDateRange({ type }, now)).toMatchObject({
      startDate: from,
      endDate: to,
    });
  });

  it('makes the full custom end day inclusive', () => {
    expect(
      getAnalyticsDateRange(
        {
          type: 'custom',
          startDate: '2026-08-03',
          endDate: '2026-08-07',
        },
        now,
      ),
    ).toMatchObject({
      startDate: local(2026, 7, 3),
      endDate: local(2026, 7, 7, true),
    });
  });

  it('accepts exactly 93 inclusive calendar days within the server window', () => {
    const range = getAnalyticsDateRange(
      {
        type: 'custom',
        startDate: '2026-01-01',
        endDate: '2026-04-03',
      },
      now,
    );

    expect(range).toMatchObject({
      startDate: local(2026, 0, 1),
      endDate: local(2026, 3, 3, true),
    });
    expect(range).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-04-03' });
  });

  it('rejects a 94th inclusive calendar day that exceeds the server window', () => {
    expect(
      getAnalyticsDateRange(
        {
          type: 'custom',
          startDate: '2026-01-01',
          endDate: '2026-04-04',
        },
        now,
      ),
    ).toBeNull();
  });

  it('returns null for invalid or reversed custom ranges', () => {
    expect(
      getAnalyticsDateRange(
        { type: 'custom', startDate: '2026-08-03', endDate: 'invalid' },
        now,
      ),
    ).toBeNull();
    expect(
      getAnalyticsDateRange(
        {
          type: 'custom',
          startDate: '2026-08-08',
          endDate: '2026-08-07',
        },
        now,
      ),
    ).toBeNull();
  });

  it.each([
    ['2026-08-15', '2026-11-15'],
    ['2026-02-15', '2026-05-18'],
  ])('accepts 93 calendar days across a DST transition', (startDate, endDate) => {
    expect(getAnalyticsDateRange({ type: 'custom', startDate, endDate }, now)).not.toBeNull();
  });

  it.each([
    ['2026-08-15', '2026-11-16'],
    ['2026-02-15', '2026-05-19'],
  ])('rejects the adjacent 94-calendar-day range', (startDate, endDate) => {
    expect(getAnalyticsDateRange({ type: 'custom', startDate, endDate }, now)).toBeNull();
  });

  it('returns exactly 90 inclusive local calendar labels for the recent range', () => {
    const range = getAnalyticsDateRange({ type: 'last90days' }, new Date(2026, 10, 15, 14));
    expect(range).toMatchObject({ fromDate: '2026-08-18', toDate: '2026-11-15' });

    const labels: string[] = [];
    for (let day = new Date(range!.startDate); day <= range!.endDate; day.setDate(day.getDate() + 1)) {
      labels.push(formatLocalDateInput(day));
    }
    expect(labels).toHaveLength(90);
    expect(labels[0]).toBe('2026-08-18');
    expect(labels.at(-1)).toBe('2026-11-15');
  });

});
