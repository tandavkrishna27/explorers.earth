import type { Pool } from 'pg';
import type { Express } from 'express';
import type { ExplorersAuth } from '../auth/betterAuth';
import { AnalyticsService } from '../application/analytics';
import { setupExplorersAnalyticsRoutes, type ExplorersAnalyticsRouteDependencies } from './explorersAnalyticsRoutes';
import { resolveCountryFromIp } from '../services/explorers-analytics-adapters';
import { InMemoryAnalyticsRateLimiter } from '../services/explorers-analytics-rate-limit';
import { requireActor, sendActorError } from '../middleware/explorersPrincipal';
import { hashGuestCapability, verifyGuestCapability } from '../policies/musicSurfacePolicy';
export function createCanonicalAnalyticsDependencies(pool: Pool): ExplorersAnalyticsRouteDependencies {
    const service = new AnalyticsService(pool), limiter = new InMemoryAnalyticsRateLimiter();
    // Only the historical GET activates its legacy owner reader. Canonical writes never publish externally.
    let legacy: Promise<ExplorersAnalyticsRouteDependencies> | undefined;
    const historical = () => legacy ??= import('../services/explorers-analytics-composition').then(module => module.createLegacyExplorersAnalyticsDependencies());
    return {
        service: { ingest: async (input, context) => { const result = await service.recordAnalyticsEvent(input, { requestId: 'analytics-ingest', resolveCountry: () => resolveCountryFromIp(context.getIp()), music: context.music }); if (result.status === 'consent-denied')
                return result; return { status: 'committed', duplicate: result.status === 'duplicate', ...('eventId' in result ? { documentId: result.eventId } : {}), ...('retired' in result ? { retired: true as const } : {}) }; }, readAccountEvents: async (scope) => (await historical()).service.readAccountEvents(scope) },
        authorizeOwner: async (request, accountId) => (await historical()).authorizeOwner(request, accountId), validatePublicTarget: async () => true, allowWrite: (request, key) => limiter.allow(request, key),
        resolvePublicMusicAnalyticsTarget: async (publicSlug, capability) => { const valid = typeof capability === 'string' && /^[A-Za-z0-9_-]{43}$/.test(capability); const rows = (await pool.query(`SELECT i.account_id,u.guest_discoverable,u.guest_capability_hash,u.guest_capability_revoked_at FROM users u JOIN account_music_identity i ON i.music_user_id=u.id WHERE u.guest_url=$1 AND u.identity_status='active' LIMIT 2`, [publicSlug])).rows; if (rows.length !== 1)
            return undefined; const row = rows[0]; if (row.guest_discoverable)
            return { accountId: row.account_id, mode: 'public' }; if (valid && row.guest_capability_revoked_at === null && row.guest_capability_hash === hashGuestCapability(capability!) && verifyGuestCapability(capability!, row.guest_capability_hash))
            return { accountId: row.account_id, mode: 'unlisted' }; return undefined; },
        resolveFriendlyMusicAnalyticsTarget: async (legacyId) => { const rows = (await pool.query(`SELECT i.account_id FROM users u JOIN account_music_identity i ON i.music_user_id=u.id WHERE u.strapi_account_document_id=$1 AND u.identity_status='active' LIMIT 2`, [legacyId])).rows; return rows.length === 1 ? { accountId: rows[0].account_id, mode: 'friendly' } : undefined; },
    };
}
export function setupCanonicalAnalyticsRoutes(app: Express, pool: Pool, auth: ExplorersAuth) {
    setupExplorersAnalyticsRoutes(app, createCanonicalAnalyticsDependencies(pool));
    const service = new AnalyticsService(pool);
    app.get('/api/explorers/analytics/summary', async (request, response) => { response.set('Cache-Control', 'no-store'); try {
        const actor = await requireActor(request, auth, pool);
        response.json(await service.getCreatorAnalytics(actor, request.query));
    }
    catch (error) {
        sendActorError(request, response, error);
    } });
}
