import type { Pool } from 'pg';
import type { Express } from 'express';
import type { ExplorersAuth } from '../auth/betterAuth';
import { AnalyticsService } from '../application/analytics';
import { setupExplorersAnalyticsRoutes, type ExplorersAnalyticsRouteDependencies } from './explorersAnalyticsRoutes';
import { resolveCountryFromIp } from '../services/explorers-analytics-adapters';
import { InMemoryAnalyticsRateLimiter } from '../services/explorers-analytics-rate-limit';
import { requireActor, sendActorError } from '../middleware/explorersPrincipal';
export function createCanonicalAnalyticsDependencies(pool: Pool): ExplorersAnalyticsRouteDependencies {
    const service = new AnalyticsService(pool), limiter = new InMemoryAnalyticsRateLimiter();
    // Only the historical GET activates its legacy owner reader. Canonical writes never publish externally.
    let legacy: Promise<ExplorersAnalyticsRouteDependencies> | undefined;
    const historical = () => legacy ??= import('../services/explorers-analytics-composition').then(module => module.createLegacyExplorersAnalyticsDependencies());
    return {
        service: { ingest: async (input, context) => { const result = await service.recordAnalyticsEvent(input, { requestId: 'analytics-ingest', resolveCountry: () => resolveCountryFromIp(context.getIp()) }); if (result.status === 'consent-denied')
                return result; return { status: 'committed', duplicate: result.status === 'duplicate', ...('eventId' in result ? { documentId: result.eventId } : {}), ...('retired' in result ? { retired: true as const } : {}) }; }, readAccountEvents: async (scope) => (await historical()).service.readAccountEvents(scope) },
        authorizeOwner: async (request, accountId) => (await historical()).authorizeOwner(request, accountId), validatePublicTarget: async () => true, allowWrite: (request, key) => limiter.allow(request, key),
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
