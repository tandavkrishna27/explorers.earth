import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v3';
import type { AnalyticsQuery } from '../../shared/explorersContract';
import type { AnalyticsAggregateRow } from '../application/analytics';
import { AuthorizationError } from '../application/authorization';
import { IdempotencyConflictError, type ExplorersAnalyticsInput } from '../services/explorers-analytics-service';
import { hashGuestCapability, verifyGuestCapability } from '../policies/musicSurfacePolicy';
export interface AnalyticsRequestContext {
    requestId: string;
    resolveCountry?: () => string | null;
    /** Trusted transport evidence; never copied from a generic browser payload. */
    music?: {
        mode: 'public' | 'unlisted' | 'friendly';
        publicSlug?: string;
        legacyAccountId?: string;
        capability?: string;
    };
}
const unavailable = () => new AuthorizationError(404, 'NOT_FOUND', 'Analytics target is unavailable');
const categoryByPage: Record<string, string> = { 'public-home': 'places', 'recommendation-detail': 'places', 'public-music': 'music', 'public-movies': 'movies', 'public-books': 'books', 'public-games': 'games', 'public-apps': 'apps', 'public-products': 'products', 'public-people': 'people', 'public-guides': 'guides' };
const uuid = z.string().uuid();
export class ExplorersAnalyticsEventRepository {
    constructor(private readonly pool: Pool) { }
    private async target(db: PoolClient, input: ExplorersAnalyticsInput, context: AnalyticsRequestContext): Promise<string | null> {
        if (!uuid.safeParse(input.accountId).success)
            throw unavailable();
        const category = categoryByPage[input.event.page] ?? null;
        if (category === 'guides')
            throw unavailable(); // Companion guide producer is owned by Epic5.
        const account = (await db.query(`SELECT id,handle_key,public_profile,onboarding_status,status FROM creator_accounts WHERE id=$1 FOR SHARE`, [input.accountId])).rows[0];
        if (!account || account.status !== 'active' || account.onboarding_status !== 'complete')
            throw unavailable();
        if (context.music) {
            if (category !== 'music' || input.event.canonicalPath !== '/music/share' || input.locationId || input.recommendationId)
                throw unavailable();
            const evidence = context.music, capability = evidence.capability, valid = typeof capability === 'string' && /^[A-Za-z0-9_-]{43}$/.test(capability), hash = valid ? hashGuestCapability(capability) : '0'.repeat(64);
            const users = (await db.query(`SELECT u.id,u.guest_discoverable,u.guest_capability_hash,u.guest_capability_revoked_at FROM users u JOIN account_music_identity i ON i.music_user_id=u.id WHERE i.account_id=$1 AND u.identity_status='active' AND (($2='friendly' AND u.strapi_account_document_id=$3) OR ($2<>'friendly' AND u.guest_url=$4)) FOR SHARE OF u`, [input.accountId, evidence.mode, evidence.legacyAccountId ?? null, evidence.publicSlug ?? null])).rows;
            if (users.length !== 1)
                throw unavailable();
            const user = users[0];
            if (evidence.mode !== 'friendly' && !user.guest_discoverable && (!valid || user.guest_capability_hash !== hash || user.guest_capability_revoked_at !== null || !verifyGuestCapability(capability!, user.guest_capability_hash)))
                throw unavailable();
        }
        else {
            const segments = input.event.canonicalPath.split('/').filter(Boolean).map(v => decodeURIComponent(v).toLowerCase());
            if (!account.public_profile || segments[0] !== account.handle_key)
                throw unavailable();
            if (category === 'music') {
                if (input.locationId || input.recommendationId)
                    throw unavailable();
                const bridge = (await db.query("SELECT u.id FROM users u JOIN account_music_identity i ON i.music_user_id=u.id WHERE i.account_id=$1 AND u.identity_status='active' FOR SHARE OF u", [input.accountId])).rows;
                if (bridge.length !== 1)
                    throw unavailable();
            }
        }
        if (category) {
            const settings = (await db.query('SELECT is_public FROM account_category_settings WHERE account_id=$1 AND category=$2 FOR SHARE', [input.accountId, category])).rows[0];
            if (!settings?.is_public)
                throw unavailable();
        }
        if (!category && (input.locationId || input.recommendationId))
            throw unavailable();
        if (input.locationId) {
            if (!uuid.safeParse(input.locationId).success)
                throw unavailable();
            const rows = await db.query(`SELECT id FROM collections WHERE id=$1 AND account_id=$2 AND category=$3 AND visibility='public' AND publication_state='published' AND archived_at IS NULL FOR SHARE`, [input.locationId, input.accountId, category]);
            if (!rows.rows.length)
                throw unavailable();
        }
        if (input.recommendationId) {
            if (!uuid.safeParse(input.recommendationId).success)
                throw unavailable();
            if (!(await db.query(`SELECT id FROM recommendations WHERE id=$1 AND account_id=$2 AND category=$3 AND publication_state='published' AND archived_at IS NULL FOR SHARE`, [input.recommendationId, input.accountId, category])).rows.length)
                throw unavailable();
            const eligible = await db.query(`SELECT ci.collection_id FROM collection_items ci JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category WHERE ci.recommendation_id=$1 AND ci.account_id=$2 AND ci.category=$3 AND ($4::uuid IS NULL OR ci.collection_id=$4) AND c.visibility='public' AND c.publication_state='published' AND c.archived_at IS NULL ORDER BY c.id FOR SHARE OF c,ci`, [input.recommendationId, input.accountId, category, input.locationId ?? null]);
            if (!eligible.rows.length)
                throw unavailable();
        }
        return category;
    }
    async record(input: ExplorersAnalyticsInput, hash: Buffer, context: AnalyticsRequestContext) {
        const db = await this.pool.connect();
        try {
            await db.query('BEGIN');
            await db.query("SET LOCAL statement_timeout='2000ms'");
            // Serialize before any target row locks, matching retention/purge account-first order.
            if (!uuid.safeParse(input.accountId).success)
                throw unavailable();
            await db.query('SELECT id FROM creator_accounts WHERE id=$1 FOR SHARE', [input.accountId]);
            await db.query('SELECT pg_advisory_xact_lock(44036,hashtext($1))', [`${input.accountId}:${input.eventId}`]);
            const category = await this.target(db, input, context);
            const prior = (await db.query('SELECT input_hash,event_id,retired_at FROM analytics_event_receipts WHERE account_id=$1 AND client_event_id=$2', [input.accountId, input.eventId])).rows[0];
            if (prior) {
                if (!Buffer.from(prior.input_hash).equals(hash))
                    throw new IdempotencyConflictError();
                await db.query('COMMIT');
                return { status: 'duplicate' as const, ...(prior.event_id ? { eventId: prior.event_id } : { retired: true as const }) };
            }
            const now = (await db.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
            const occurred = context.music ? now : new Date(input.event.timestamp);
            if (occurred.getTime() < now.getTime() - 366 * 86400000 || occurred.getTime() > now.getTime() + 300000)
                throw new AuthorizationError(422, 'INVALID_INPUT', 'Analytics timestamp is outside supported bounds');
            const resolved = context.resolveCountry?.(), country = typeof resolved === 'string' && /^[a-z]{2}$/i.test(resolved) ? resolved.toUpperCase() : null;
            const row = (await db.query(`INSERT INTO analytics_events(account_id,client_event_id,event_type,page,category,collection_id,recommendation_id,occurred_at,received_at,canonical_path,element,referrer_origin,utm,metadata,country_code,consent_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'explorers-analytics-v1') RETURNING id`, [input.accountId, input.eventId, input.event.type, input.event.page, category, input.locationId ?? null, input.recommendationId ?? null, occurred, now, input.event.canonicalPath, input.event.element ?? null, input.event.referrerOrigin ?? null, JSON.stringify(input.event.utmParams ?? {}), JSON.stringify(input.event.metadata ?? {}), country])).rows[0];
            await db.query('INSERT INTO analytics_event_receipts(account_id,client_event_id,input_hash,event_id,accepted_at) VALUES($1,$2,$3,$4,$5)', [input.accountId, input.eventId, hash, row.id, now]);
            await db.query('COMMIT');
            return { status: 'accepted' as const, eventId: row.id };
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
    async aggregate(db: PoolClient, accountId: string, input: AnalyticsQuery): Promise<AnalyticsAggregateRow[]> {
        // Aggregate in PostgreSQL; raw payloads never cross the repository boundary.
        const result = await db.query(`WITH eligible AS MATERIALIZED (SELECT event_type,occurred_at,page,category,country_code,element,metadata,utm,referrer_origin,collection_id,recommendation_id FROM analytics_events WHERE account_id=$1 AND occurred_at >= $2 AND occurred_at < $3 AND occurred_at >= clock_timestamp()-interval '366 days' AND ($4::text IS NULL OR category=$4) AND ($5::uuid IS NULL OR collection_id=$5) AND ($6::uuid IS NULL OR recommendation_id=$6)), dimensions AS (SELECT e.event_type,d.dimension,d.key FROM eligible e CROSS JOIN LATERAL (VALUES ('total','total'),('daily',to_char(e.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD')),('page',e.page),('category',e.category),('country',e.country_code),('trafficSource',CASE WHEN e.utm->>'utm_source' IS NOT NULL THEN e.utm->>'utm_source' WHEN e.referrer_origin IS NOT NULL THEN regexp_replace(lower(e.referrer_origin),'^[^:]+://(www[.])?([^/:]+).*$','\\2') ELSE 'direct' END),('element',e.element),('platform',e.metadata->>'platform'),('collection',e.collection_id::text),('recommendation',e.recommendation_id::text)) d(dimension,key)) , grouped AS (SELECT dimension,coalesce(key,'unknown') AS key,count(*) FILTER(WHERE event_type='view') AS views,count(*) FILTER(WHERE event_type='click') AS clicks,count(*) FILTER(WHERE event_type='interaction') AS interactions FROM dimensions GROUP BY dimension,coalesce(key,'unknown')), ranked AS (SELECT *,row_number() OVER(PARTITION BY dimension ORDER BY views+clicks+interactions DESC,key COLLATE "C") AS position FROM grouped) SELECT dimension,key,views,clicks,interactions FROM ranked WHERE dimension IN ('total','daily') OR position<=100 UNION ALL SELECT dimension||':other','other',sum(views)::bigint,sum(clicks)::bigint,sum(interactions)::bigint FROM ranked WHERE dimension NOT IN ('total','daily') AND position>100 GROUP BY dimension`, [accountId, input.from, input.to, input.category ?? null, input.collectionId ?? null, input.recommendationId ?? null]);
        return result.rows;
    }
}
