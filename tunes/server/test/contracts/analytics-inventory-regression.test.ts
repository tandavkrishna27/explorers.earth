import {test,expect} from 'vitest';
import {resolve} from 'node:path';
import {inventoryRuntimeSurfaces} from '../../../scripts/inventory-runtime-surfaces';
import {decisionForRoute} from '../../policies/musicSurfacePolicy';
test('canonical analytics route inventory includes historical read and Actor summary',()=>{const root=resolve(import.meta.dirname,'../../../..');const routes=inventoryRuntimeSurfaces(root).routes.filter(r=>r.path.includes('/analytics/'));expect(routes).toContainEqual(expect.objectContaining({method:'GET',path:'/api/explorers/analytics/summary',classification:'canonical-explorers-owner'}));expect(decisionForRoute({method:'GET',path:'/api/explorers/analytics/events',classification:'handler-authorization-unknown',source:'tunes/server/routes/explorersAnalyticsRoutes.ts'})).toBe('strapi-identity');});
