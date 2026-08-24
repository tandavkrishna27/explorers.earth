import { describe, expect, it } from 'vitest';
import { getAnalyticsDateRange } from '../utils/analyticsDateRange';

const now = new Date(2026, 7, 24, 14, 35, 20);
const local = (year: number, month: number, day: number, endOfDay = false) =>
  new Date(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);

describe('getAnalyticsDateRange', () => {
  it.each([
    ['today', local(2026, 7, 24), local(2026, 7, 24, true)],
    ['last7days', local(2026, 7, 18), local(2026, 7, 24, true)],
    ['last30days', local(2026, 6, 26), local(2026, 7, 24, true)],
  ] as const)('returns an inclusive server scope for %s', (type, from, to) => {
    expect(getAnalyticsDateRange({ type }, now)).toEqual({
      startDate: from,
      endDate: to,
    });
  });

  it('makes the full custom end day inclusive', () => {
    expect(
      getAnalyticsDateRange(
        {
          type: 'custom',
          startDate: local(2026, 7, 3),
          endDate: local(2026, 7, 7),
        },
        now,
      ),
    ).toEqual({
      startDate: local(2026, 7, 3),
      endDate: local(2026, 7, 7, true),
    });
  });

  it('returns null for incomplete or reversed custom ranges', () => {
    expect(
      getAnalyticsDateRange(
        { type: 'custom', startDate: local(2026, 7, 3) },
        now,
      ),
    ).toBeNull();
    expect(
      getAnalyticsDateRange(
        {
          type: 'custom',
          startDate: local(2026, 7, 8),
          endDate: local(2026, 7, 7),
        },
        now,
      ),
    ).toBeNull();
  });
});
