import type { Pool } from 'pg';
import type { Express } from 'express';
import type { ExplorersAuth } from '../auth/betterAuth';
import { AnalyticsService } from '../application/analytics';
import { setupExplorersAnalyticsRoutes, type ExplorersAnalyticsRouteDependencies } from './explorersAnalyticsRoutes';
import { resolveCountryFromIp } from '../services/explorers-analytics-adapters';
import { InMemoryAnalyticsRateLimiter } from '../services/explorers-analytics-rate-limit';
import { requireActor, sendActorError } from '../middleware/explorersPrincipal';
import { authorizeOperation, AuthorizationError } from '../application/authorization';
import type { Actor } from '../application/actor';
function canonicalIngest(service: AnalyticsService): ExplorersAnalyticsRouteDependencies['service']['ingest'] {
    return async (input, context) => { const result = await service.recordAnalyticsEvent(input, { requestId: 'analytics-ingest', resolveCountry: () => resolveCountryFromIp(context.getIp()) }); if (result.status === 'consent-denied')
                return result; return { status: 'committed', duplicate: result.status === 'duplicate', ...('eventId' in result ? { documentId: result.eventId } : {}), ...('retired' in result ? { retired: true as const } : {}) }; };
}
/**
 * The canonical runtime: owner reads are authorised by the canonical session and served from
 * analytics_events (P5-1). The historical Strapi owner read is gone (P6-2), so `auth` is required.
 * Canonical writes never publish externally.
 */
export function createCanonicalAnalyticsDependencies(pool: Pool, auth: ExplorersAuth): ExplorersAnalyticsRouteDependencies {
    const service = new AnalyticsService(pool), limiter = new InMemoryAnalyticsRateLimiter();
    // The route authorises before it reads; the read reuses the actor that check resolved.
    const owners = new WeakMap<object, Actor>();
    return {
        service: { ingest: canonicalIngest(service), readAccountEvents: async (scope, request) => {
                const actor = request ? owners.get(request) : undefined;
                if (!actor) throw new AuthorizationError(403, 'FORBIDDEN', 'Analytics owner was not authorised');
                return service.readOwnerEvents(actor, scope);
            } },
        authorizeOwner: async (request, accountId) => {
            try {
                const actor = await requireActor(request, auth, pool);
                if (!actor || actor.accountId !== accountId) return false;
                await authorizeOperation(pool, actor, 'analytics:read', accountId);
                owners.set(request, actor);
                return true;
            }
            catch {
                return false;
            }
        }, validatePublicTarget: async () => true, allowWrite: (request, key) => limiter.allow(request, key),
    };
}
/**
 * The legacy composition only, which P3-7 deletes. It has no Better Auth instance, so it cannot
 * authorise an owner, and the owner read is refused (403) rather than delegated to Strapi.
 */
export function createIngestOnlyAnalyticsDependencies(pool: Pool): ExplorersAnalyticsRouteDependencies {
    const service = new AnalyticsService(pool), limiter = new InMemoryAnalyticsRateLimiter();
    return { service: { ingest: canonicalIngest(service), readAccountEvents: async () => [] }, authorizeOwner: async () => false,
        validatePublicTarget: async () => true, allowWrite: (request, key) => limiter.allow(request, key) };
}
export function setupCanonicalAnalyticsRoutes(app: Express, pool: Pool, auth: ExplorersAuth) {
    setupExplorersAnalyticsRoutes(app, createCanonicalAnalyticsDependencies(pool, auth));
    const service = new AnalyticsService(pool);
    app.get('/api/explorers/analytics/summary', async (request, response) => { response.set('Cache-Control', 'no-store'); try {
        const actor = await requireActor(request, auth, pool);
        response.json(await service.getCreatorAnalytics(actor, request.query));
    }
    catch (error) {
        sendActorError(request, response, error);
    } });
}
