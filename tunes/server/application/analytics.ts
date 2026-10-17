import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { analyticsQuerySchema, type AnalyticsQuery, type AnalyticsSummary, type AnalyticsCounts, type AnalyticsDimensionKey } from '../../shared/explorersContract';
import { explorersAnalyticsInputSchema, type ExplorersAnalyticsInput } from '../services/explorers-analytics-service';
import { authorizeOperation, AuthorizationError } from './authorization';
import type { Actor } from './actor';
import { ExplorersAnalyticsEventRepository, type AnalyticsRequestContext } from '../repositories/explorersAnalyticsEventRepository';
export type { AnalyticsRequestContext } from '../repositories/explorersAnalyticsEventRepository';
function stable(value: unknown): unknown { if (Array.isArray(value))
    return value.map(stable); if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, stable(v)])); return value; }
export function analyticsInputHash(input: ExplorersAnalyticsInput, mode: 'generic' | 'music' = 'generic'): Buffer {
    const parsed = explorersAnalyticsInputSchema.parse(input), event = { ...parsed.event };
    if (mode === 'music')
        delete (event as Partial<typeof event>).timestamp;
    return createHash('sha256').update(JSON.stringify(stable({ mode, accountId: parsed.accountId, locationId: parsed.locationId ?? null, recommendationId: parsed.recommendationId ?? null, event }))).digest();
}
export interface AnalyticsAggregateRow {
    dimension: string;
    key: string | null;
    views: string | number;
    clicks: string | number;
    interactions: string | number;
}
const dimensions: AnalyticsDimensionKey[] = ['page', 'category', 'country', 'trafficSource', 'element', 'platform', 'collection', 'recommendation'];
const zero = (): AnalyticsCounts => ({ views: 0, clicks: 0, interactions: 0 });
const counts = (row: AnalyticsAggregateRow): AnalyticsCounts => { const values = { views: Number(row.views), clicks: Number(row.clicks), interactions: Number(row.interactions) }; if (Object.values(values).some(v => !Number.isSafeInteger(v) || v < 0))
    throw new AuthorizationError(503, 'INVALID_INPUT', 'Analytics count exceeds supported bounds'); return values; };
export function buildAnalyticsSummary(query: AnalyticsQuery, rows: AnalyticsAggregateRow[]): AnalyticsSummary {
    const result: AnalyticsSummary = { version: 1, from: query.from, to: query.to, totals: zero(), daily: [], dimensions: { page: { buckets: [], truncated: false, other: zero() }, category: { buckets: [], truncated: false, other: zero() }, country: { buckets: [], truncated: false, other: zero() }, trafficSource: { buckets: [], truncated: false, other: zero() }, element: { buckets: [], truncated: false, other: zero() }, platform: { buckets: [], truncated: false, other: zero() }, collection: { buckets: [], truncated: false, other: zero() }, recommendation: { buckets: [], truncated: false, other: zero() } } };
    const days = new Map(rows.filter(r => r.dimension === 'daily').map(r => [r.key, counts(r)]));
    for (let day = Math.floor(Date.parse(query.from) / 86400000) * 86400000; day < Date.parse(query.to); day += 86400000) {
        const key = new Date(day).toISOString().slice(0, 10);
        result.daily.push({ day: key, ...(days.get(key) ?? zero()) });
    }
    const total = rows.find(r => r.dimension === 'total');
    if (total)
        result.totals = counts(total);
    for (const key of dimensions) {
        const buckets = rows.filter(r => r.dimension === key).map(r => ({ key: r.key ?? 'unknown', ...counts(r) })).sort((a, b) => (b.views + b.clicks + b.interactions) - (a.views + a.clicks + a.interactions) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        const dimension = result.dimensions[key];
        dimension.buckets = buckets.slice(0, 100);
        dimension.truncated = buckets.length > 100;
        const remainder = rows.find(r => r.dimension === `${key}:other`);
        if (remainder) {
            dimension.other = counts(remainder);
            dimension.truncated = true;
        }
        for (const bucket of buckets.slice(100))
            for (const type of ['views', 'clicks', 'interactions'] as const)
                dimension.other[type] += bucket[type];
    }
    return result;
}
export class AnalyticsService {
    private readonly repository: ExplorersAnalyticsEventRepository;
    constructor(private readonly pool: Pool) { this.repository = new ExplorersAnalyticsEventRepository(pool); }
    async recordAnalyticsEvent(raw: ExplorersAnalyticsInput, context: AnalyticsRequestContext) {
        const input = explorersAnalyticsInputSchema.parse(raw);
        if (!input.consent)
            return { status: 'consent-denied' as const };
        return this.repository.record(input, analyticsInputHash(input, context.music ? 'music' : 'generic'), context);
    }
    async getCreatorAnalytics(actor: Actor, raw: unknown): Promise<AnalyticsSummary> {
        const parsed = analyticsQuerySchema.safeParse(raw);
        if (!parsed.success)
            throw new AuthorizationError(422, 'INVALID_INPUT', 'Invalid analytics query');
        if (!actor) throw new AuthorizationError(401, 'UNAUTHENTICATED', 'Sign in is required');
        const db = await this.pool.connect();
        try {
            await db.query('BEGIN READ ONLY');
            await db.query("SET LOCAL statement_timeout='2000ms'");
            await authorizeOperation(db, actor, 'analytics:read', actor.accountId);
            for (const [table, id] of [['collections', parsed.data.collectionId], ['recommendations', parsed.data.recommendationId]] as const)
                if (id && !(await db.query(`SELECT id FROM ${table} WHERE id=$1 AND account_id=$2 AND ($3::text IS NULL OR category=$3)`, [id, actor.accountId, parsed.data.category ?? null])).rows.length)
                    throw new AuthorizationError(404, 'NOT_FOUND', 'Resource is unavailable');
            const rows = await this.repository.aggregate(db, actor.accountId, parsed.data), result = buildAnalyticsSummary(parsed.data, rows);
            await authorizeOperation(db, actor, 'analytics:read', actor.accountId);
            await db.query('COMMIT');
            await authorizeOperation(db, actor, 'analytics:read', actor.accountId);
            return result;
        }
        catch (error) {
            await db.query('ROLLBACK');
            if ((error as {
                code?: string;
            }).code === '57014')
                throw new AuthorizationError(503, 'INVALID_INPUT', 'Analytics service is unavailable');
            throw error;
        }
        finally {
            db.release();
        }
    }
}
