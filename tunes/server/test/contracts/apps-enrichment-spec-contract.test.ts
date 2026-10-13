import { websiteProviderIdentity, appleProviderIdentity, appleLookupUrl } from '../../application/appEnrichmentProviderIdentity';
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { APPS_ENRICHMENT_CASES } from '../../../scripts/apps-enrichment-browser-support';
const load = () => import('../../../scripts/apps-enrichment-browser-support');
const id = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
function reset() { const personas = { ownerA: { userId: 'synthetic-user-a', accountId: id(1), handle: 'synthetic-owner-a' }, ownerB: { userId: 'synthetic-user-b', accountId: id(2), handle: 'synthetic-owner-b' } }; const collections = [1, 2].map(n => ({ id: id(n + 2), accountId: id(n), category: 'apps', title: `Synthetic list${n}`, slug: `synthetic-list-${n}`, visibility: 'private', publicationState: 'draft', revision: 1, description: null, heading: null, coverMediaId: null, archived: false, displayOrder: 0, categoryRevision: '1', pinOrder: null })); const details = { appUrl: 'https://example.test/manual-app', developer: 'Synthetic manual developer', logoUrl: null, description: 'Synthetic manual description', downloadUrl: null, priceTier: null, platforms: [] }; const items = ['website', 'apple', 'foreign-control'].map((role, n) => { const accountId = id(n === 2 ? 2 : 1), entityId = id(20 + n); return { role, collectionId: collections[n === 2 ? 1 : 0].id, recommendation: { id: id(10 + n), accountId, entityId, category: 'apps', userRating: null, publicationState: 'draft', revision: 1, mediaIds: [], archived: false, pin: null, categoryRevision: '1', note: null, entity: { id: entityId, kind: 'app', origin: 'manual', title: `Synthetic app${n}`, details }, displayOverrides: {}, displayTitle: `Synthetic app${n}`, appScreenshots: { screenshotMediaIds: [] }, effectiveAppDetails: details } }; }); return { version: 1, runId: 'a'.repeat(32), commit: 'b'.repeat(40), caseId: APPS_ENRICHMENT_CASES[0], project: 'apps-desktop', repeat: 0, epoch: 1, personas, collections, items, choices: [{ identity: websiteProviderIdentity('https://www.figma.com/'), sourceUrl: 'https://www.figma.com/', label: 'Synthetic website' }, { identity: appleProviderIdentity({ trackId: '1152747299', storefront: 'us', kind: 'software' }), sourceUrl: appleLookupUrl({ trackId: '1152747299', storefront: 'us', kind: 'software' }), label: 'Synthetic Apple' }] }; }
it('issued reset binds actual native editable rows, immutable owner/entity allocation and no imported snapshot', async () => {
    const m: any = await load();
    expect(typeof m.validateAppsEnrichmentReset).toBe('function');
    const input = reset(), value = m.validateAppsEnrichmentReset(input);
    expect(value).toEqual(input);
    expect(Object.isFrozen(value.items[0].recommendation.entity.details)).toBe(true);
    for (const altered of [{ ...input, items: [input.items[0], input.items[0], input.items[2]] }, { ...input, items: input.items.map((row, n) => n ? row : { ...row, recommendation: { ...row.recommendation, accountId: input.personas.ownerB.accountId } }) }, { ...input, snapshots: [] }, { ...input, items: input.items.map((row, n) => n ? row : { ...row, recommendation: { ...row.recommendation, displayOverrides: { title: 'Imported' } } }) }])
        expect(() => m.validateAppsEnrichmentReset(altered)).toThrow();
    let reads = 0;
    const getter = { ...input };
    Object.defineProperty(getter, 'items', { get() { reads++; return input.items; }, enumerable: true });
    expect(() => m.validateAppsEnrichmentReset(getter)).toThrow();
    expect(reads).toBe(0);
});
it('additive spec retains exact two approved titles and real native acknowledgement before worker effects', () => { const text = readFileSync(new URL('../../../../explorers-earth/e2e/replatform/apps-enrichment.spec.ts', import.meta.url), 'utf8'); expect(text).toContain('APPS_ENRICHMENT_CASES'); expect(text).toContain('configureAppEnrichment'); expect(text).toContain('acceptAppEnrichment'); expect(text).toContain('rebindAppEnrichment'); expect(text).toContain('disableAppEnrichment'); expect(text).toContain('refresh-enrichment'); expect(text).toContain('selectedFields'); expect(text).not.toMatch(/test\.(skip|fixme|only)|route\.fulfill|Pool\(|fetch\(['"]https|INSERT|UPDATE /); });
