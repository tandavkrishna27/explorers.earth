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
/**
 * With `auth` (the canonical runtime) the owner read is served from canonical storage and
 * authorised by the canonical session - P5-1. Before, the canonical GET lazily loaded the
 * legacy Strapi composition, whose Bearer JWT canonical sign-in never issues, so every
 * owner's dashboard was "unavailable". Without `auth` (the legacy runtime composition)
 * the historical Strapi reader is kept until P6 retires it. Canonical writes never
 * publish externally either way.
 */
export function createCanonicalAnalyticsDependencies(pool: Pool, auth?: ExplorersAuth): ExplorersAnalyticsRouteDependencies {
    const service = new AnalyticsService(pool), limiter = new InMemoryAnalyticsRateLimiter();
    // The route authorises before it reads; the read reuses the actor that check resolved.
    const owners = new WeakMap<object, Actor>();
    let legacy: Promise<ExplorersAnalyticsRouteDependencies> | undefined;
    const historical = () => legacy ??= import('../services/explorers-analytics-composition').then(module => module.createLegacyExplorersAnalyticsDependencies());
    return {
        service: { ingest: async (input, context) => { const result = await service.recordAnalyticsEvent(input, { requestId: 'analytics-ingest', resolveCountry: () => resolveCountryFromIp(context.getIp()) }); if (result.status === 'consent-denied')
                return result; return { status: 'committed', duplicate: result.status === 'duplicate', ...('eventId' in result ? { documentId: result.eventId } : {}), ...('retired' in result ? { retired: true as const } : {}) }; }, readAccountEvents: async (scope, request) => {
                if (!auth) return (await historical()).service.readAccountEvents(scope);
                const actor = request ? owners.get(request) : undefined;
                if (!actor) throw new AuthorizationError(403, 'FORBIDDEN', 'Analytics owner was not authorised');
                return service.readOwnerEvents(actor, scope);
            } },
        authorizeOwner: async (request, accountId) => {
            if (!auth) return (await historical()).authorizeOwner(request, accountId);
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
