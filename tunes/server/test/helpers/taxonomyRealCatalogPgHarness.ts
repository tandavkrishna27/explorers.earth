import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { isProxy } from 'node:util/types';
import { expect } from 'vitest';
import type { Actor } from '../../application/actor';
import { TaxonomyCatalogService } from '../../application/taxonomyCatalog';
import { EXPECTED_MUSIC_MIGRATION_CHAIN } from '../../../shared/music-migration-contract';
import { assertMusicMigratorAuthority,assertMusicRuntimeCapabilityPreflight,verifyMusicRuntimeLogin } from '../../db/music-runtime-role';
import { AccountLifecycleService } from '../../application/accountLifecycle';
import { runAccountLifecycleMaintenance } from '../../application/accountLifecycleMaintenance';
import { applyTaxonomyCatalogImport, dryRunTaxonomyCatalogImport } from '../../services/taxonomyCatalogImport';
import type { TaxonomyImport } from '../../../shared/explorersTaxonomyContract';
import type { ReviewedTaxonomyInputs } from '../../../scripts/taxonomy-owned-import';
import type { ObjectStorage } from '../../services/objectStorage';
export type TaxonomyRealAdmissionBinding = Readonly<{
    admission: unknown;
    inputs: ReviewedTaxonomyInputs;
    migrator: Pool;
    runtime: Pool;
    signal: AbortSignal;
    operation: 'qualification-apply-replay';
}>;
export type TaxonomyRealCatalogPgInput = {
    admission: unknown;
    inputs: ReviewedTaxonomyInputs;
    migrator: Pool;
    runtime: Pool;
    signal: AbortSignal;
    verifyAdmission: (binding: TaxonomyRealAdmissionBinding) => void;
    expectedIdentity: {
        databaseName: string;
        migratorUser: 'music_migrator';
        runtimeUser: string;
        migrationId: 56;
    };
    case: (id: string, work: () => Promise<void>) => Promise<void>;
    cursorSecret: string;
    barrierPolicy: {
        timeoutMs: number;
        pollMs: number;
    };
    runtimeApplicationName: string;
};
const unavailable = (): never => {
    throw Error('Taxonomy qualification admission refused');
};
/** Inert factory. Handles must ALREADY be root-owned bounded wrappers tracking
 * every query, client and late acquire through the enclosing writer supervisor.
 * Callback is root's private verifier, never a JSON approval or pool predicate. */
export function createTaxonomyRealCatalogPgHarness(input: TaxonomyRealCatalogPgInput) {
    if (!input || typeof input !== 'object' || isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype)
        unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Object.values(descriptors).some(value => !Object.hasOwn(value, 'value')) || Reflect.ownKeys(descriptors).some(key => typeof key !== 'string') || typeof descriptors.verifyAdmission?.value !== 'function')
        unavailable();
    for (const control of [input.expectedIdentity, input.barrierPolicy]) {
        if (!control || typeof control !== 'object' || isProxy(control) || Object.getPrototypeOf(control) !== Object.prototype || Object.values(Object.getOwnPropertyDescriptors(control)).some(descriptor => !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')))
            unavailable();
    }
    input = Object.freeze({ ...input, expectedIdentity: Object.freeze({ ...input.expectedIdentity }), barrierPolicy: Object.freeze({ ...input.barrierPolicy }) });
    const binding = Object.freeze({ admission: input.admission, inputs: input.inputs, migrator: input.migrator, runtime: input.runtime, signal: input.signal, operation: 'qualification-apply-replay' as const });
    input.verifyAdmission(binding);
    const e = input.expectedIdentity, p = input.barrierPolicy;
    if (!(input.signal instanceof AbortSignal) || typeof input.case !== 'function' || !Object.isFrozen(input.inputs) || input.migrator === input.runtime || !/^music_uat_[a-f0-9]{32}$/.test(e.databaseName) || e.migratorUser !== 'music_migrator' || !(/^[a-z][a-z0-9_]{0,62}$/.test(e.runtimeUser)) || e.runtimeUser === e.migratorUser || e.runtimeUser === 'music_runtime' || e.migrationId !== 56 || typeof input.cursorSecret !== 'string' || !input.cursorSecret || !Number.isSafeInteger(p.timeoutMs) || p.timeoutMs < 1 || !Number.isSafeInteger(p.pollMs) || p.pollMs < 1 || p.pollMs > p.timeoutMs || typeof input.runtimeApplicationName !== 'string' || !input.runtimeApplicationName)
        unavailable();
    let failed = false, executed = 0, registered = 0;
    const verify = () => {
        if (failed || input.signal.aborted)
            unavailable();
        input.verifyAdmission(binding);
    };
    const query = async (sql: string, values: unknown[] = []) => {
        verify();
        return input.migrator.query(sql, values);
    };
    const runtimeQuery = async (sql: string, values: unknown[] = []) => {
        verify();
        return input.runtime.query(sql, values);
    };
    const tables = ['taxonomy_catalogs', 'taxonomy_terms', 'taxonomy_term_translations', 'taxonomy_source_mappings', 'taxonomy_legacy_slug_mappings', 'taxonomy_import_receipts', 'account_category_content_state', 'recommendation_taxonomy'] as const;
    async function snapshot() {
        const output: Record<string, unknown> = {};
        for (const table of tables)
            output[table] = (await query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM public.${table} t`)).rows[0].rows;
        return output;
    }
    async function movies() {
        return (await query(`SELECT jsonb_build_object('terms',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM taxonomy_terms t WHERE category='movies'),'translations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY term_id,locale) FROM taxonomy_term_translations x JOIN taxonomy_terms t ON t.id=x.term_id WHERE t.category='movies'),'mapping',(SELECT jsonb_agg(to_jsonb(m) ORDER BY external_kind,provider_genre_id) FROM movie_provider_genre_terms m),'entityGenres',(SELECT jsonb_agg(to_jsonb(g) ORDER BY entity_id,position) FROM movie_entity_provider_genres g)) AS rows`)).rows[0].rows;
    }
    async function seedOwner(withSelection = false): Promise<{
        actor: Actor;
        recommendationId: string | null;
    }> {
        verify();
        const userId = randomUUID(), accountId = randomUUID(), actor: Actor = { userId, accountId, role: 'owner', credential: { kind: 'oauth', grantId: randomUUID(), scopes: ['entities:resolve', 'lifecycle:feedback', 'lifecycle:delete'] } };
        const client = await input.migrator.connect();
        let recommendationId: string | null = null;
        try {
            await client.query('BEGIN');
            await client.query('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,clock_timestamp(),clock_timestamp())', [userId, 'Synthetic taxonomy owner', `${userId}@invalid.local`]);
            await client.query('INSERT INTO user_security_state(user_id) VALUES($1)', [userId]);
            await client.query("INSERT INTO creator_accounts(id,handle,display_name,account_type,onboarding_status,public_profile) VALUES($1,$2,'Synthetic taxonomy owner','Personal','complete',true)", [accountId, 'tax-' + accountId.replaceAll('-', '').slice(0, 20)]);
            await client.query("INSERT INTO account_memberships(account_id,user_id,role) VALUES($1,$2,'owner')", [accountId, userId]);
            for (const category of ['places', 'people']) {
                await client.query('INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,$2,true,0)', [accountId, category]);
                await client.query('INSERT INTO account_category_content_state(account_id,category,revision) VALUES($1,$2,1)', [accountId, category]);
            }
            if (withSelection) {
                const entityId = randomUUID();
                recommendationId = randomUUID();
                await client.query("INSERT INTO entities(id,kind,title,origin) VALUES($1,'place','Synthetic taxonomy race place','manual')", [entityId]);
                await client.query('INSERT INTO place_entity_details(entity_id) VALUES($1)', [entityId]);
                await client.query("INSERT INTO recommendations(id,account_id,entity_id,category,publication_state) VALUES($1,$2,$3,'places','draft')", [recommendationId, accountId, entityId]);
                const root = input.inputs.places.terms.find(term => term.parentId === null && input.inputs.places.terms.some(child => child.parentId === term.id))!, child = input.inputs.places.terms.find(term => term.parentId === root.id)!;
                for (const [position, term] of [root, child].entries())
                    await client.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'places',$3,$4)", [recommendationId, accountId, term.id, position]);
            }
            await client.query('COMMIT');
            return { actor, recommendationId };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async function nativeIdentity() {
        verify();
        for (const [pool, login] of [[input.migrator, e.migratorUser], [input.runtime, e.runtimeUser]] as const) {
            const row = (await pool.query("SELECT current_database() AS database,session_user AS login,current_setting('server_version_num')::int AS version,current_setting('application_name') AS \"applicationName\",(SELECT rolcanlogin FROM pg_roles WHERE rolname=session_user) AS \"loginAllowed\",pg_has_role(session_user,'music_runtime','MEMBER') AS runtime")).rows[0];
            expect(row.database).toBe(e.databaseName);
            expect(row.login).toBe(login);
            expect(row.version).toBe(150019);
            expect(row.loginAllowed).toBe(true);
            if (pool === input.runtime) {
                expect(row.runtime).toBe(true);
                expect(row.applicationName).toBe(input.runtimeApplicationName);
            }
        }
        const migrations = (await query('SELECT id FROM music_schema_migrations ORDER BY id')).rows;
        expect(migrations.map(row=>row.id)).toEqual([...EXPECTED_MUSIC_MIGRATION_CHAIN]);
    }
    const assertRoleMatrix=async()=>{verify();await assertMusicMigratorAuthority(input.migrator,{runtimeLoginRole:e.runtimeUser});await assertMusicRuntimeCapabilityPreflight(input.migrator,{runtimeLoginRole:e.runtimeUser});await verifyMusicRuntimeLogin(input.migrator,input.runtime,{loginRole:e.runtimeUser});};
    const apply = async (category: 'places' | 'people', raw: TaxonomyImport = input.inputs[category]) => {
        verify();
        return applyTaxonomyCatalogImport(input.migrator, raw, 'isolated-real-taxonomy-qualification');
    };
    const dryRun = async (category: 'places' | 'people') => {
        verify();
        return dryRunTaxonomyCatalogImport(input.migrator, input.inputs[category]);
    };
    const page = async (actor: Actor, category: 'places' | 'people', cursor?: string) => {
        verify();
        return new TaxonomyCatalogService(input.runtime, input.cursorSecret).read(actor, { category, limit: '24', ...(cursor ? { cursor } : {}) });
    };
    async function translationFault(raw: TaxonomyImport) {
        verify();
        let injected = false, released = 0;
        const wrapped = { connect: async () => {
                const client = await input.migrator.connect();
                return { query: async (sql: string, values?: unknown[]) => {
                        const result = await client.query(sql, values);
                        if (sql.startsWith('INSERT INTO public.taxonomy_term_translations')) {
                            injected = true;
                            throw Error('taxonomy-qualification-translation-fault');
                        }
                        return result;
                    }, release() {
                        released++;
                        client.release();
                    } };
            } };
        await expect(applyTaxonomyCatalogImport(wrapped, raw, 'isolated-real-taxonomy-qualification')).rejects.toThrow('taxonomy-qualification-translation-fault');
        expect(injected).toBe(true);
        expect(released).toBe(1);
    }
    async function lifecycleRace(order: 'import-first' | 'lifecycle-first') {
        verify();
        const fixture = await seedOwner(true), service = new AccountLifecycleService(input.runtime), state = await service.getAccountLifecycle(fixture.actor), feedback = await service.recordDeletionFeedback(fixture.actor, { reason: 'Synthetic taxonomy lock-order qualification' }, { requestId: randomUUID(), idempotencyKey: randomUUID() });
        await service.requestAccountDeletion(fixture.actor, { expectedRevision: state.revision, feedbackId: feedback.id }, { requestId: randomUUID(), idempotencyKey: randomUUID() });
        const operations: Promise<unknown>[] = [];
        let releaseGate!: () => void, heldResolve!: () => void, heldReject!: (error: unknown) => void;
        const gate = new Promise<void>(resolve => {
            releaseGate = resolve;
        }), held = new Promise<void>((resolve, reject) => {
            heldResolve = resolve;
            heldReject = reject;
        });
        let heldPid = 0, blockedPid = 0;
        function wrap(pool: Pool, first: boolean) {
            return { query: (...args: Parameters<Pool['query']>) => (pool.query as any)(...args), connect: async () => {
                    const client = await pool.connect();
                    let pid: number;
                    try {
                        pid = Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
                    }
                    catch (error) {
                        client.release(true);
                        throw error;
                    }
                    if (first)
                        heldPid = pid;
                    else
                        blockedPid = pid;
                    return { query: async (sql: string, values?: unknown[]) => {
                            const result = await client.query(sql, values);
                            if (first && (order === 'import-first' ? sql.includes('/* catalog */') : sql === "SELECT lock_explorers_taxonomy_catalog('places')")) {
                                heldResolve();
                                await gate;
                            }
                            return result;
                        }, release: () => client.release() };
                } } as unknown as Pool;
        }
        const importer = () => applyTaxonomyCatalogImport(wrap(input.migrator, order === 'import-first'), input.inputs.places, 'isolated-real-taxonomy-qualification');
        const storage = { environment: 'taxonomy-real-isolated', delete: async () => {
                throw Error('Unexpected taxonomy media deletion');
            } } as unknown as ObjectStorage;
        const lifecycle = () => runAccountLifecycleMaintenance(wrap(input.runtime, order === 'lifecycle-first'), storage, 1);
        const start = (work: () => Promise<unknown>) => {
            const promise = work();
            promise.catch(() => {
            });
            operations.push(promise);
            return promise;
        };
        const onAbort = () => {
            releaseGate();
            heldReject(Error('Taxonomy qualification aborted'));
        };
        input.signal.addEventListener('abort', onAbort, { once: true });
        if (input.signal.aborted)
            onAbort();
        const first = start(order === 'import-first' ? importer : lifecycle);
        first.then(() => heldReject(Error('Taxonomy barrier not reached')), heldReject);
        try {
            await held;
            start(order === 'import-first' ? lifecycle : importer);
            const deadline = Date.now() + p.timeoutMs;
            let blocked = false;
            while (Date.now() < deadline) {
                verify();
                if (blockedPid) {
                    const row = (await query('SELECT $2::int=ANY(pg_blocking_pids($1)) AS blocked', [blockedPid, heldPid])).rows[0];
                    if (row.blocked === true) {
                        blocked = true;
                        break;
                    }
                }
                await new Promise<void>((resolve, reject) => {
                    let timer: ReturnType<typeof setTimeout>;
                    const cancel = () => {
                        clearTimeout(timer);
                        input.signal.removeEventListener('abort', cancel);
                        reject(Error('Taxonomy qualification aborted'));
                    };
                    if (input.signal.aborted) {
                        cancel();
                        return;
                    }
                    input.signal.addEventListener('abort', cancel, { once: true });
                    timer = setTimeout(() => {
                        input.signal.removeEventListener('abort', cancel);
                        resolve();
                    }, p.pollMs);
                });
            }
            expect(blocked).toBe(true);
            releaseGate();
            const settled = await Promise.allSettled(operations);
            for (const result of settled)
                if (result.status === 'rejected')
                    throw result.reason;
            expect((await query('SELECT status FROM creator_accounts WHERE id=$1', [fixture.actor.accountId])).rows[0].status).toBe('deleted');
            expect(Number((await query('SELECT count(*) AS count FROM recommendation_taxonomy WHERE recommendation_id=$1', [fixture.recommendationId])).rows[0].count)).toBe(0);
        }
        finally {
            releaseGate();
            await Promise.allSettled(operations);
            input.signal.removeEventListener('abort', onAbort);
        }
    }
    return { inputs: input.inputs, query, runtimeQuery, snapshot, movies, seedOwner, nativeIdentity, assertRoleMatrix, apply, dryRun, page, translationFault, lifecycleRace, case: async (id: string, work: () => Promise<void>) => {
            const index = registered++;
            await input.case(id, async () => {
                verify();
                if (executed !== index)
                    unavailable();
                try {
                    await nativeIdentity();
                    await work();
                    executed++;
                }
                catch (error) {
                    failed = true;
                    throw error;
                }
            });
        } };
}
export type TaxonomyRealCatalogPgHarness = ReturnType<typeof createTaxonomyRealCatalogPgHarness>;
