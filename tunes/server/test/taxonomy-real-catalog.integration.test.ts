import { expect } from 'vitest';
import type { Actor } from '../application/actor';
import type { TaxonomyImport } from '../../shared/explorersTaxonomyContract';
import type { TaxonomyImportReceipt } from '../services/taxonomyCatalogImport';
import type { TaxonomyRealCatalogPgHarness } from './helpers/taxonomyRealCatalogPgHarness';
/** Inert finite producer. Registration/import performs no connection or DDL.
 * Real PostgreSQL execution requires root-owned admission after bootstrap. */
export const taxonomyRealCatalogCaseIds = Object.freeze([
    'taxonomy-real-pg-owned-canonical56-identity', 'taxonomy-real-pg-dry-run-no-mutation', 'taxonomy-real-pg-places335-atomic-apply', 'taxonomy-real-pg-people-empty-atomic-apply', 'taxonomy-real-pg-places-replay-no-op', 'taxonomy-real-pg-people-replay-no-op', 'taxonomy-real-pg-owner-paged335-read', 'taxonomy-real-pg-duplicate-case-identity', 'taxonomy-real-pg-mixed-label-movie-isolation', 'taxonomy-real-pg-people-configured-empty-read', 'taxonomy-real-pg-runtime-read-only-matrix', 'taxonomy-real-pg-translation-fault-rollback', 'taxonomy-real-pg-stale-identity-source-conflicts', 'taxonomy-real-pg-import-lifecycle-two-order-race',
] as const);
export async function runTaxonomyRealCatalogAcceptance(h: TaxonomyRealCatalogPgHarness): Promise<void> {
    if (!h || typeof h.case !== 'function')
        throw Error('Taxonomy qualification harness absent');
    let actor: Actor, nativeMovies: unknown, placesChanged: TaxonomyImportReceipt, peopleChanged: TaxonomyImportReceipt;
    const catalog = async (category: 'places' | 'people') => (await h.query('SELECT state,version::int AS version,default_locale FROM taxonomy_catalogs WHERE category=$1', [category])).rows[0];
    const receipts = async (category: 'places' | 'people') => (await h.query('SELECT id,changed,receipt FROM taxonomy_import_receipts WHERE category=$1 ORDER BY created_at,id', [category])).rows;
    const scopes = async () => (await h.query('SELECT account_id,category,revision FROM account_category_content_state ORDER BY account_id,category')).rows;
    const copied = (input: TaxonomyImport): TaxonomyImport => JSON.parse(JSON.stringify(input));
    const cases: Array<() => Promise<void>> = [
        async () => {
            await h.nativeIdentity();
            await h.assertRoleMatrix();
            expect(await catalog('places')).toMatchObject({ state: 'UNCONFIGURED', version: 0, default_locale: null });
            expect(await catalog('people')).toMatchObject({ state: 'UNCONFIGURED', version: 0, default_locale: null });
            expect((await h.query("SELECT count(*)::int AS count FROM taxonomy_terms WHERE category IN ('places','people')")).rows[0].count).toBe(0);
            nativeMovies = await h.movies();
            expect((nativeMovies as any).terms.length).toBeGreaterThan(0);
            expect((nativeMovies as any).mapping.length).toBeGreaterThan(0);
            actor = (await h.seedOwner()).actor;
            expect(await h.page(actor, 'people')).toMatchObject({ state: 'UNCONFIGURED', catalogVersion: 0, items: [], nextCursor: null });
        },
        async () => {
            const before = await h.snapshot();
            for (const category of ['places', 'people'] as const) {
                const plan = await h.dryRun(category);
                expect(plan).toMatchObject({ qualification: 'unqualified-core', inputHash: h.inputs.inputHashes[category], observedCatalogVersion: 0, catalogVersion: 1, changed: true, conflicts: [], affectedAssignments: [] });
                expect(plan.affectedAccounts).toContain(actor.accountId);
                expect(plan.changes.filter(change => change.startsWith('term:add:'))).toHaveLength(category === 'places' ? 335 : 0);
            }
            expect(await h.snapshot()).toEqual(before);
        },
        async () => {
            placesChanged = await h.apply('places');
            expect(placesChanged).toMatchObject({ qualification: 'unqualified-core', changed: true, inputHash: h.inputs.inputHashes.places, observedCatalogVersion: 0, catalogVersion: 1, conflicts: [] });
            expect(await catalog('places')).toMatchObject({ state: 'CONFIGURED', version: 1, default_locale: 'en' });
            const actual = (await h.query("SELECT t.id,t.category,t.slug,t.parent_id AS \"parentId\",t.position,t.active,jsonb_object_agg(x.locale,x.label) AS labels FROM taxonomy_terms t JOIN taxonomy_term_translations x ON x.term_id=t.id WHERE t.category='places' GROUP BY t.id ORDER BY t.id")).rows;
            expect(actual).toEqual(h.inputs.places.terms);
            expect((await h.query("SELECT source_host AS \"sourceHost\",entity_kind AS \"entityKind\",document_id AS \"documentId\",term_id AS \"termId\" FROM taxonomy_source_mappings WHERE category='places' ORDER BY source_host,entity_kind,document_id")).rows).toEqual(h.inputs.places.sourceMappings);
            expect((await receipts('places')).map(row => row.changed)).toEqual([true]);
        },
        async () => {
            peopleChanged = await h.apply('people');
            expect(peopleChanged).toMatchObject({ qualification: 'unqualified-core', changed: true, inputHash: h.inputs.inputHashes.people, observedCatalogVersion: 0, catalogVersion: 1, conflicts: [] });
            expect(await catalog('people')).toMatchObject({ state: 'CONFIGURED', version: 1, default_locale: 'en' });
            expect((await h.query("SELECT count(*)::int AS count FROM taxonomy_terms WHERE category='people'")).rows[0].count).toBe(0);
            expect((await receipts('people')).map(row => row.changed)).toEqual([true]);
        },
        async () => {
            const beforeScopes = await scopes(), replay = await h.apply('places');
            expect(replay.changed).toBe(false);
            expect(replay.catalogVersion).toBe(1);
            expect(replay.receiptId).not.toBe(placesChanged.receiptId);
            expect(await h.apply('places')).toEqual(replay);
            const rows = await receipts('places');
            expect(rows).toHaveLength(2);
            expect(rows.find(row => row.id === placesChanged.receiptId)?.receipt).toEqual(placesChanged);
            expect(await scopes()).toEqual(beforeScopes);
            expect(await catalog('places')).toMatchObject({ version: 1 });
        },
        async () => {
            const beforeScopes = await scopes(), replay = await h.apply('people');
            expect(replay.changed).toBe(false);
            expect(replay.catalogVersion).toBe(1);
            expect(replay.receiptId).not.toBe(peopleChanged.receiptId);
            expect(await h.apply('people')).toEqual(replay);
            const rows = await receipts('people');
            expect(rows).toHaveLength(2);
            expect(rows.find(row => row.id === peopleChanged.receiptId)?.receipt).toEqual(peopleChanged);
            expect(await scopes()).toEqual(beforeScopes);
        },
        async () => {
            const seen: any[] = [], cursors = new Set<string>();
            let cursor: string | undefined, pages = 0;
            do {
                expect(++pages).toBeLessThanOrEqual(14);
                const page = await h.page(actor, 'places', cursor);
                expect(page).toMatchObject({ state: 'CONFIGURED', catalogVersion: 1, defaultLocale: 'en' });
                expect(page.items.length).toBeLessThanOrEqual(24);
                seen.push(...page.items);
                if (page.nextCursor) {
                    expect(page.items).toHaveLength(24);
                    expect(cursors.has(page.nextCursor)).toBe(false);
                    cursors.add(page.nextCursor);
                    cursor = page.nextCursor;
                }
                else
                    cursor = undefined;
            } while (cursor);
            expect(pages).toBe(14);
            expect(seen).toHaveLength(335);
            expect(new Set(seen.map(term => term.id)).size).toBe(335);
            expect(seen).toEqual([...h.inputs.places.terms].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map(term => ({ id: term.id, category: 'places', slug: term.slug, parentId: term.parentId, position: term.position, label: term.labels.en, resolvedLocale: 'en' })));
        },
        async () => {
            const groups = new Map<string, typeof h.inputs.places.terms>();
            for (const term of h.inputs.places.terms) {
                const key = term.labels.en.toLowerCase();
                groups.set(key, [...(groups.get(key) ?? []), term]);
            }
            const duplicates = [...groups.values()].filter(group => group.length > 1);
            expect(duplicates).toHaveLength(9);
            for (const group of duplicates) {
                expect(new Set(group.map(term => term.id)).size).toBe(group.length);
                expect(new Set(group.map(term => term.slug)).size).toBe(group.length);
                const rows = (await h.query('SELECT t.id,t.slug,t.parent_id AS "parentId",x.label FROM taxonomy_terms t JOIN taxonomy_term_translations x ON x.term_id=t.id AND x.locale=\'en\' WHERE t.id=ANY($1::uuid[]) ORDER BY t.id', [group.map(term => term.id)])).rows;
                expect(rows).toEqual([...group].sort((a, b) => a.id.localeCompare(b.id)).map(term => ({ id: term.id, slug: term.slug, parentId: term.parentId, label: term.labels.en })));
            }
        },
        async () => {
            for (const label of ['Movies&Shows', 'Horror', 'Thriller'])
                expect((await h.query("SELECT count(*)::int AS count FROM taxonomy_terms t JOIN taxonomy_term_translations x ON x.term_id=t.id WHERE t.category='places' AND x.locale='en' AND x.label=$1", [label])).rows[0].count).toBe(1);
            expect(await h.movies()).toEqual(nativeMovies);
        },
        async () => {
            expect(await h.page(actor, 'people')).toMatchObject({ state: 'CONFIGURED', catalogVersion: 1, defaultLocale: 'en', items: [], nextCursor: null });
            expect((await h.query("SELECT count(*)::int AS count FROM taxonomy_source_mappings WHERE category='people'")).rows[0].count).toBe(0);
            expect(h.inputs.manifest.peopleRelationAudit).toMatchObject({ recommendations: 25, selectedRelations: 0 });
        },
        async () => {
            for (const [table, column] of [['taxonomy_catalogs', 'version'], ['taxonomy_terms', 'position'], ['taxonomy_term_translations', 'label'], ['taxonomy_source_mappings', 'document_id'], ['taxonomy_legacy_slug_mappings', 'legacy_slug'], ['taxonomy_import_receipts', 'reviewed_by']] as const) {
                for (const statement of [`UPDATE public.${table} SET ${column}=${column} WHERE false`, `DELETE FROM public.${table} WHERE false`, `INSERT INTO public.${table} DEFAULT VALUES`]) {
                    let code: unknown;
                    try {
                        await h.runtimeQuery(statement);
                    }
                    catch (error) {
                        code = (error as {
                            code?: unknown;
                        }).code;
                    }
                    expect(code).toBe('42501');
                }
            }
            expect((await h.page(actor, 'places')).items).toHaveLength(24);
        },
        async () => {
            const before = await h.snapshot(), input = copied(h.inputs.places);
            input.catalogVersion = 2;
            input.terms[0].labels.en += ' rollback probe';
            await h.translationFault(input);
            expect(await h.snapshot()).toEqual(before);
            expect(await h.movies()).toEqual(nativeMovies);
        },
        async () => {
            for (const mutate of [(input: TaxonomyImport) => {
                    input.terms[0].labels.en += ' stale probe';
                }, (input: TaxonomyImport) => {
                    input.catalogVersion = 2;
                    input.terms[0].slug = 'qualification-conflicting-slug';
                }, (input: TaxonomyImport) => {
                    input.catalogVersion = 2;
                    input.sourceMappings[0].termId = input.terms.find(term => term.id !== input.sourceMappings[0].termId)!.id;
                }]) {
                const before = await h.snapshot(), input = copied(h.inputs.places);
                mutate(input);
                await expect(h.apply('places', input)).rejects.toThrow();
                expect(await h.snapshot()).toEqual(before);
            }
        },
        async () => {
            const before = await receipts('places');
            await h.lifecycleRace('import-first');
            await h.lifecycleRace('lifecycle-first');
            expect(await receipts('places')).toEqual(before);
            expect(await catalog('places')).toMatchObject({ version: 1, state: 'CONFIGURED' });
            expect(await h.movies()).toEqual(nativeMovies);
        },
    ];
    if (cases.length !== taxonomyRealCatalogCaseIds.length)
        throw Error('Taxonomy finite inventory mismatch');
    for (let index = 0; index < cases.length; index++)
        await h.case(taxonomyRealCatalogCaseIds[index], cases[index]);
}
