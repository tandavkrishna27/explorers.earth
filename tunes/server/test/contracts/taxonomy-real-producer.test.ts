import { it, expect, vi } from 'vitest';
import { createTaxonomyRealCatalogPgHarness } from '../helpers/taxonomyRealCatalogPgHarness';
import { runTaxonomyRealCatalogAcceptance, taxonomyRealCatalogCaseIds } from '../taxonomy-real-catalog.integration.test';
import { loadReviewedTaxonomyInputs, reviewedTaxonomyInputDirectory } from '../../../scripts/taxonomy-owned-import';
const inputs = () => loadReviewedTaxonomyInputs({ fixedDirectory: reviewedTaxonomyInputDirectory, expectedManifestHash: '0087cf143b6f8ae68f60087539083bd0f7992c50c846b4c98a02dc1e9155ccff' });
const make = () => {
    const query = vi.fn(() => {
        throw Error('Unexpected resource');
    });
    const pool = { query, connect: query };
    return { query, input: { admission: Object.freeze({}), signal: new AbortController().signal, inputs: inputs(), migrator: pool as any, runtime: { ...pool } as any, verifyAdmission: vi.fn(), expectedIdentity: { databaseName: 'music_uat_' + 'a'.repeat(32), migratorUser: 'music_migrator' as const, runtimeUser: 'music_runtime_login', migrationId: 56 as const }, case: vi.fn(async (_id: string, _work: () => Promise<void>) => {
            }), cursorSecret: 'synthetic-test-only-secret', barrierPolicy: { timeoutMs: 1000, pollMs: 10 }, runtimeApplicationName: 'synthetic-taxonomy-runtime' } };
};
it('requires opaque admission verifier before any handle use and never accepts JSON approval alone', () => {
    const f = make();
    f.input.verifyAdmission.mockImplementation(() => {
        throw Error('Refused admission');
    });
    expect(() => createTaxonomyRealCatalogPgHarness(f.input)).toThrow();
    expect(f.query).not.toHaveBeenCalled();
    const { verifyAdmission, ...rest } = f.input;
    expect(() => createTaxonomyRealCatalogPgHarness(rest as any)).toThrow();
    expect(f.query).not.toHaveBeenCalled();
});
it('collection registers fourteen exact finite cases without queries connections or fixture DML', async () => {
    const f = make(), h = createTaxonomyRealCatalogPgHarness(f.input);
    await runTaxonomyRealCatalogAcceptance(h);
    expect(f.input.case.mock.calls.map(([id]) => id)).toEqual(taxonomyRealCatalogCaseIds);
    expect(taxonomyRealCatalogCaseIds).toHaveLength(14);
    expect(new Set(taxonomyRealCatalogCaseIds).size).toBe(14);
    expect(f.query).not.toHaveBeenCalled();
});
it('rechecks admission before registered callback obtains a connection', async () => {
    const f = make(), h = createTaxonomyRealCatalogPgHarness(f.input);
    await runTaxonomyRealCatalogAcceptance(h);
    f.input.verifyAdmission.mockImplementation(() => {
        throw Error('Closed admission');
    });
    await expect(f.input.case.mock.calls[0][1]()).rejects.toThrow('Closed admission');
    expect(f.query).not.toHaveBeenCalled();
});
it('captures exact admitted handle identities rather than following caller mutation', async () => {
    const f = make(), h = createTaxonomyRealCatalogPgHarness(f.input), replacement = vi.fn(async () => ({ rows: [] }));
    f.input.migrator = { query: replacement, connect: replacement } as any;
    await expect(h.query('SELECT 1')).rejects.toThrow('Unexpected resource');
    expect(replacement).not.toHaveBeenCalled();
});
import { AccountLifecycleService } from '../../application/accountLifecycle';
import * as maintenance from '../../application/accountLifecycleMaintenance';
it('settles an early barrier failure and releases the exact acquired client', async () => {
    const f = make(), seedRelease = vi.fn(), runtimeRelease = vi.fn();
    f.input.migrator.connect = vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [] })), release: seedRelease })) as any;
    f.input.runtime.connect = vi.fn(async () => ({ query: vi.fn(async (sql: string) => {
            if (sql === 'SELECT pg_backend_pid() AS pid')
                throw Error('synthetic pid refusal');
            return { rows: [] };
        }), release: runtimeRelease })) as any;
    vi.spyOn(AccountLifecycleService.prototype, 'getAccountLifecycle').mockResolvedValue({ accountId: 'synthetic', status: 'active', revision: 1, operationId: null });
    vi.spyOn(AccountLifecycleService.prototype, 'recordDeletionFeedback').mockResolvedValue({ id: 'synthetic' } as any);
    vi.spyOn(AccountLifecycleService.prototype, 'requestAccountDeletion').mockResolvedValue({ accountId: 'synthetic', status: 'pending_deletion', revision: 2, operationId: 'synthetic' });
    vi.spyOn(maintenance, 'runAccountLifecycleMaintenance').mockImplementation(async (pool: any) => {
        const client = await pool.connect();
        try {
            await client.query("SELECT lock_explorers_taxonomy_catalog('places')");
            return 1;
        }
        finally {
            client.release();
        }
    });
    try {
        const h = createTaxonomyRealCatalogPgHarness(f.input);
        await expect(h.lifecycleRace('lifecycle-first')).rejects.toThrow('synthetic pid refusal');
        expect(seedRelease).toHaveBeenCalledTimes(1);
        expect(runtimeRelease).toHaveBeenCalledExactlyOnceWith(true);
    }
    finally {
        vi.restoreAllMocks();
    }
});
it('abort releases a held barrier and drains both owned operations before rejecting', async () => {
    const f = make(), stop = new AbortController();
    f.input.signal = stop.signal;
    const released: string[] = [];
    const client = (label: string, pid: number) => ({ query: vi.fn(async (sql: string) => {
            if (stop.signal.aborted)
                throw Error('synthetic root abort');
            return { rows: sql === 'SELECT pg_backend_pid() AS pid' ? [{ pid }] : [] };
        }), release: vi.fn(() => {
            released.push(label);
        }) });
    f.input.migrator.connect = vi.fn(async () => client('migrator', 202)) as any;
    f.input.runtime.connect = vi.fn(async () => client('runtime', 201)) as any;
    f.input.migrator.query = vi.fn(async () => {
        queueMicrotask(() => stop.abort());
        return { rows: [{ blocked: false }] };
    }) as any;
    vi.spyOn(AccountLifecycleService.prototype, 'getAccountLifecycle').mockResolvedValue({ accountId: 'synthetic', status: 'active', revision: 1, operationId: null });
    vi.spyOn(AccountLifecycleService.prototype, 'recordDeletionFeedback').mockResolvedValue({ id: 'synthetic' } as any);
    vi.spyOn(AccountLifecycleService.prototype, 'requestAccountDeletion').mockResolvedValue({ accountId: 'synthetic', status: 'pending_deletion', revision: 2, operationId: 'synthetic' });
    vi.spyOn(maintenance, 'runAccountLifecycleMaintenance').mockImplementation(async (pool: any) => {
        const db = await pool.connect();
        try {
            await db.query("SELECT lock_explorers_taxonomy_catalog('places')");
            return 1;
        }
        finally {
            db.release();
        }
    });
    try {
        await expect(createTaxonomyRealCatalogPgHarness(f.input).lifecycleRace('lifecycle-first')).rejects.toThrow();
        expect(stop.signal.aborted).toBe(true);
        expect(released.filter(label => label === 'runtime')).toHaveLength(1);
        expect(released.filter(label => label === 'migrator')).toHaveLength(2);
    }
    finally {
        vi.restoreAllMocks();
    }
});
