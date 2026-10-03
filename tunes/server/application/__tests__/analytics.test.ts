import { describe, it, expect, vi } from 'vitest';
import { analyticsQuerySchema } from '../../../shared/explorersContract';
import { analyticsInputHash, buildAnalyticsSummary, AnalyticsService } from '../analytics';
const input = { consent: true, eventId: 'event-12345', accountId: '00000000-0000-4000-8000-000000000001', event: { type: 'view' as const, page: 'public-books' as const, timestamp: '2026-10-03T12:00:00.000Z', canonicalPath: '/fixture/books' } };
describe('canonical analytics contract', () => {
    it('binds generic client time/body while ignoring trusted enrichment and key order', () => {
        expect(analyticsInputHash(input)).toEqual(analyticsInputHash({ ...input, event: { ...input.event } }));
        expect(analyticsInputHash(input)).not.toEqual(analyticsInputHash({ ...input, event: { ...input.event, timestamp: '2026-10-03T12:00:01.000Z' } }));
        expect(analyticsInputHash(input)).not.toEqual(analyticsInputHash({ ...input, event: { ...input.event, type: 'click' } }));
    });
    it('Music server time never changes minimal semantic identity', () => {
        expect(analyticsInputHash(input, 'music')).toEqual(analyticsInputHash({ ...input, event: { ...input.event, timestamp: '1970-01-01T00:00:00.000Z' } }, 'music'));
        expect(analyticsInputHash(input, 'music')).not.toEqual(analyticsInputHash(input));
    });
    it('accepts366 absolute days and rejects oversized/reversed/timezoneless/foreign authority queries', () => {
        expect(analyticsQuerySchema.safeParse({ from: '2025-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' }).success).toBe(true);
        for (const q of [{ from: '2025-01-01T00:00:00Z', to: '2026-01-02T00:00:01Z' }, { from: '2026-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }, { from: '2026-01-01', to: '2026-01-02' }, { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z', accountId: input.accountId }])
            expect(analyticsQuerySchema.safeParse(q).success).toBe(false);
    });
    it('fills UTC days and preserves exact totals beyond bounded dimensions without private payload', () => {
        const rows = Array.from({ length: 102 }, (_, n) => ({ dimension: 'page', key: `page-${String(n).padStart(3, '0')}`, views: '1', clicks: '0', interactions: '0' }));
        const summary = buildAnalyticsSummary({ from: '2026-10-02T23:59:59Z', to: '2026-10-04T00:00:00Z' }, [{ dimension: 'total', key: 'total', views: '102', clicks: '0', interactions: '0' }, ...rows, { dimension: 'daily', key: '2026-10-03', views: '102', clicks: '0', interactions: '0' }]);
        expect(summary.totals.views).toBe(102);
        expect(summary.daily.map(x => x.day)).toEqual(['2026-10-02', '2026-10-03']);
        expect(summary.dimensions.page.buckets).toHaveLength(100);
        expect(summary.dimensions.page.other.views).toBe(2);
        expect(summary.dimensions.page.truncated).toBe(true);
        expect(summary.dimensions.page.buckets[0].key).toBe('page-000');
        expect(JSON.stringify(summary)).not.toContain('accountId');
    });
    it('direct consent-denied caller never connects/enriches or persists a receipt', async () => {
        const connect = vi.fn(), resolveCountry = vi.fn();
        const service = new AnalyticsService({ connect } as any);
        await expect(service.recordAnalyticsEvent({ ...input, consent: false }, { requestId: 'consent', resolveCountry })).resolves.toEqual({ status: 'consent-denied' });
        expect(connect).not.toHaveBeenCalled();
        expect(resolveCountry).not.toHaveBeenCalled();
    });
});

it('rejects missing Actor before acquiring an analytics database connection',async()=>{
 const connect=vi.fn();await expect(new AnalyticsService({connect} as any).getCreatorAnalytics(undefined as any,{from:'2026-10-02T00:00:00Z',to:'2026-10-03T00:00:00Z'})).rejects.toMatchObject({status:401});expect(connect).not.toHaveBeenCalled();
});