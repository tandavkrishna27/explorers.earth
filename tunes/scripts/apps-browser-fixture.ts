import path from 'node:path';
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod/v3';
import type { AppsControlOptions } from './apps-browser-support';
import { parseBrowserSuite, assertBrowserEnvironment } from './lifecycle-browser-guards';
import {registerAppsPrivateDirectory,inspectAppsPrivateDescendant} from './apps-private-custody';
type Acquisition = Awaited<ReturnType<typeof import('./music-uat-database').prepareOwnedUatDatabaseAcquisition>>;
type ReportHandle = {
    stat(): Promise<{
        identity: string;
        size: number;
        regular: boolean;
    }>;
    read(buffer: Buffer, offset: number, length: number, position: number): Promise<number>;
    verify(): Promise<void>;
    close(): Promise<void>;
};
type ReadResponse = (response: Response, cap: number) => Promise<Buffer>;
type Clock = {
    now(): number;
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(value: unknown): void;
};
type Child = {
    ready: Promise<void>;
    closed: Promise<{
        code: number | null;
        signal: string | null;
        stdioClosed: boolean;
    }>;
    stop(): Promise<void>;
};
type Pool = {
    query(input: {
        text: string;
        values?: unknown[];
    }): Promise<{
        rows: any[];
    }>;
    end(): Promise<void>;
};
type RetainedDirectory = {
    path: string;
    identity: unknown;
};
type Persona = {
    userId: string;
    handle: string;
    cookie: string;
    accountId?: string;
};
type Authority = {
    runId: string;
    commit: string;
    database: string;
    port: number;
    owned: true;
    containerId: string;
    imageId: string;
    contextHost: string;
};
type Receipt = {
    arguments(args: string[], directory: string): string[] | Promise<string[]>;
    executionEnvironment(environment: Record<string, string>, directory: string): Record<string, string>;
    decodeDiscovery(report: unknown): void;
    decodeExecution(report: unknown, code: number | null, signal: string | null): void;
    failure(phase: 'startup' | 'discovery' | 'execution' | 'cleanup', failures: string[], interrupted: boolean): void;
    finish(authority: Authority, failures: string[], interrupted: boolean): void;
};
type Composition = {
    composed: any;
    storage: any;
};
type Options = {
    pool: Pool;
    config: any;
    runId: string;
    commit: string;
    origin: string;
    apiOrigin: string;
    personas: {
        ownerA: Persona;
        ownerB: Persona;
    };
    storage: any;
    composed: any;
    storageDirectory: string;
    fixtureFilesRoot: string;
    expectedTemporaryRoot: string;
    disposableDirectory: string;
    ownedAuthority: Authority;
};
type Dependencies = {
    platform: string;
    argv: string[];
    environment: Record<string, string | undefined>;
    temporaryRoot: string;
    clock: Clock;
    randomHex(bytes: number): string;
    installSignals(callback: () => void): () => void;
    preflight(): Promise<{
        commit: string;
        pgPort: number;
        apiPort: number;
        webPort: number;
    }>;
    createReceipt(argv: string[]): Promise<Receipt>;
    createDirectory(target: string): Promise<RetainedDirectory>;
    assertDirectory(directory: RetainedDirectory): Promise<void>;
    prepareSecret(): Promise<{
        path: string;
    }>;
    prepareDatabase(input: {
        runId: string;
        commit: string;
        port: number;
        secret: {
            path: string;
        };
    }): Promise<Acquisition>;
    createPool(authority: Authority, secret: {
        path: string;
    }): Promise<Pool>;
    migrate(pool: Pool): Promise<void>;
    seedAuth(pool: Pool, runId: string): Promise<{
        ownerA: Persona;
        ownerB: Persona;
    }>;
    ensureInitialAccount(pool: Pool, userId: string): Promise<{
        accountId: string;
    }>;
    createConfig(origin: string): Promise<any>;
    createSessions(composition: Composition, config: any, personas: {
        ownerA: Persona;
        ownerB: Persona;
    }): Promise<void>;
    createComposition(pool: Pool, config: any, storageDirectory: string, binding: {
        runAuthority: Authority;
        personasWithActualAccountIds: {
            ownerA: Persona;
            ownerB: Persona;
        };
    }): Promise<Composition>;
    startApi(options: Options, control: () => any): Promise<{
        close(): Promise<void>;
    }>;
    canonicalMe(composition: Composition, apiOrigin: string, person: Persona, read: ReadResponse): Promise<unknown>;
    createControl(options: Options): Promise<{
        capability: string;
        handle(req: any, res: any): Promise<boolean>;
        close(): Promise<void>;
    }>;
    writeDescriptor(root: RetainedDirectory, value: unknown): Promise<unknown>;
    launchVite(options: Options, read: ReadResponse): Promise<Child>;
    launchDiscovery(context: {
        arguments: string[];
        environment: Record<string, string>;
    }, options: Options): Promise<Child>;
    openReport(root: RetainedDirectory, execution: boolean): Promise<ReportHandle>;
    launchBrowser(context: {
        arguments: string[];
        environment: Record<string, string>;
    }, options: Options): Promise<Child>;
    sealRequests(options: Options): void;
    drainRequests(options: Options, ms: number): Promise<any>;
    drainStorage(options: Options, ms: number): Promise<any>;
    removeArtifacts(options: Options, roots: RetainedDirectory[], descriptor: unknown): Promise<void>;
    createAdminPool(authority: Authority, secret: {
        path: string;
    }): Promise<Pool>;
    cleanupSecret(secret: {
        path: string;
    }): Promise<void>;
    removeRoot(root: RetainedDirectory): Promise<void>;
};
const keys = ['platform', 'argv', 'environment', 'temporaryRoot', 'clock', 'randomHex', 'installSignals', 'preflight', 'createReceipt', 'createDirectory', 'assertDirectory', 'prepareSecret', 'prepareDatabase', 'createPool', 'migrate', 'seedAuth', 'ensureInitialAccount', 'createConfig', 'createSessions', 'createComposition', 'startApi', 'canonicalMe', 'createControl', 'writeDescriptor', 'launchVite', 'launchDiscovery', 'openReport', 'launchBrowser', 'sealRequests', 'drainRequests', 'drainStorage', 'removeArtifacts', 'createAdminPool', 'cleanupSecret', 'removeRoot'];
type DiagnosticStage = 'validation' | 'preflight' | 'receipt' | 'create-directory' | 'check-directory' | 'prepare-secret' | 'prepare-database' | 'create-database' | 'create-pool' | 'migrate' | 'current-database' | 'seed-auth' | 'initial-account' | 'config' | 'composition' | 'create-sessions' | 'start-api' | 'baseline' | 'create-control' | 'descriptor' | 'browser-context' | 'vite' | 'startup' | 'discovery' | 'execution' | 'cleanup';
type DiagnosticCategory = 'refusal' | 'spawn-error' | 'nonzero' | 'signal' | 'output-overflow' | 'deadline' | 'ack-mismatch';
type Diagnostic = Readonly<{
    stage: DiagnosticStage;
    category: DiagnosticCategory;
}>;
const diagnostics = new WeakMap<object, Diagnostic>();
/** Only runner-branded errors expose finite sanitized diagnostics; foreign getters are never read. */
export function extractAppsFixtureDiagnostic(error: unknown): Diagnostic | undefined {
    return typeof error === 'object' && error !== null ? diagnostics.get(error) : undefined;
}
class Refusal extends Error {
    constructor() { super('Apps owned fixture failed'); }
}
const uuid = z.string().uuid(), baseline = z.object({ id: uuid, revision: z.number().int().positive().safe(), displayName: z.string().nullable(), handle: z.string().nullable() });
/** Construction and import perform no allocation. Complete adapters are synthetic. */
export function createAppsBrowserFixture(dependencies?: Dependencies): {
    run(): Promise<void>;
} {
    let stage: DiagnosticStage = 'validation', category: DiagnosticCategory = 'refusal', captured: Diagnostic | undefined;
    const recordCategory = (value: DiagnosticCategory) => { if (category === 'refusal')
        category = value; };
    let nativeFailure:(()=>void)|undefined;
    const d = dependencies === undefined ? defaultDependencies(recordCategory,()=>nativeFailure?.()) : dependencies;
    let promise: Promise<void> | undefined;
    return { run() {
            return promise ??= Promise.resolve().then(execute).catch(() => {
                const error = new Refusal();
                diagnostics.set(error, captured ?? Object.freeze({ stage, category }));
                throw error;
            });
        } };
    async function execute() {
        if (!d || Object.keys(d).sort().join(',') !== [...keys].sort().join(',') || keys.filter(key => !['platform', 'argv', 'environment', 'temporaryRoot', 'clock'].includes(key)).some(key => typeof Reflect.get(d, key) !== 'function') || !d.clock || ['now', 'setTimeout', 'clearTimeout'].some(key => typeof Reflect.get(d.clock, key) !== 'function'))
            throw new Refusal();
        if (!['win32', 'linux', 'darwin'].includes(d.platform) || d.argv.length !== 8 || parseBrowserSuite(d.argv.slice(0, 4)) !== 'apps' || d.argv[4] !== '--receipt-directory' || d.argv[6] !== '--receipt-capability' || !/^[a-f0-9]{64}$/.test(d.argv[7]))
            throw new Refusal();
        assertBrowserEnvironment(d.environment);
        if (d.environment.PLAYWRIGHT_LAST_RUN_OUTPUT_FILE !== undefined || d.environment.NODE_OPTIONS !== undefined || d.environment.NODE_CHANNEL_FD !== undefined)
            throw new Refusal();
        const paths = d.platform === 'win32' ? path.win32 : path.posix;
        if (!paths.isAbsolute(d.temporaryRoot) || paths.normalize(d.temporaryRoot) !== d.temporaryRoot || !paths.isAbsolute(d.argv[5]) || paths.basename(d.argv[5]) !== 'apps' || paths.dirname(paths.dirname(d.argv[5])) !== d.temporaryRoot || !/^replatform-e2e-[A-Za-z0-9-]{8,64}$/.test(paths.basename(paths.dirname(d.argv[5]))))
            throw new Refusal();
        const originals = new Set<Promise<unknown>>();
        let deadline = d.clock.now() + 21600000, uncertain = false, interrupted = false, knownFailure = false, setupComplete = false, stopping = false, cleanupSettled = false;
        const failures: string[] = [];
        let phase: 'startup' | 'discovery' | 'execution' | 'cleanup' = 'startup', failurePhase: 'startup' | 'discovery' | 'execution' | 'cleanup' | undefined;
        async function bounded<T>(work: () => Promise<T>, limit = 15000, margin = false): Promise<T> { const ms = Math.min(limit, Math.floor(deadline - d.clock.now())); if (ms < 1 || margin && ms < limit)
            throw new Refusal(); let timer: unknown; const original = Promise.resolve().then(work); originals.add(original); original.then(() => originals.delete(original), () => originals.delete(original)); try {
            return await Promise.race([original, ...(phase === 'cleanup' ? [] : [lifecycleFailed]), new Promise<never>((_, reject) => { timer = d.clock.setTimeout(() => { recordCategory('deadline'); uncertain = true; reject(new Refusal()); }, ms); })]);
        }
        finally {
            d.clock.clearTimeout(timer);
        } }
        let acquisition: Acquisition | undefined;
        let receipt: Receipt | undefined, secret: {
        path: string;
    } | undefined, authority: Authority | undefined, pool: Pool | undefined, options: Options | undefined, api: {
        close(): Promise<void>;
    } | undefined, control: Awaited<ReturnType<Dependencies['createControl']>> | undefined, vite: Child | undefined, browser: Child | undefined, discovery: Child | undefined, descriptor: unknown;
        const roots: RetainedDirectory[] = [];
        let candidate: string | undefined, error: unknown;
        let rejectLifecycle!: (error: unknown) => void;
        const lifecycleFailed = new Promise<never>((_, reject) => { rejectLifecycle = reject; });
        lifecycleFailed.catch(() => undefined);
        nativeFailure=()=>{uncertain=true;rejectLifecycle(new Refusal());};
        const restoreSignals = d.installSignals(() => { interrupted = true; if (options) {
            try {
                d.sealRequests(options);
            }
            catch {
                uncertain = true;
            }
        } rejectLifecycle(new Refusal()); });
        async function readResponse(response: Response, cap: number): Promise<Buffer> {
            const declared = response.headers.get('content-length');
            if (declared !== null && (!/^(0|[1-9][0-9]*)$/.test(declared) || Number(declared) > cap)) {
                await response.body?.cancel();
                throw new Refusal();
            }
            if (!response.body)
                return Buffer.alloc(0);
            const reader = response.body.getReader();
            const chunks: Buffer[] = [];
            let total = 0, count = 0;
            try {
                while (true) {
                    const part = await reader.read();
                    if (part.done)
                        return Buffer.concat(chunks, total);
                    if (++count > 4096 || total + part.value.length > cap)
                        throw new Refusal();
                    total += part.value.length;
                    chunks.push(Buffer.from(part.value));
                }
            }
            catch (error) {
                await reader.cancel();
                throw error;
            }
            finally {
                reader.releaseLock();
            }
        }
        async function report(execution: boolean): Promise<unknown> {
            const handle = await bounded(() => d.openReport(roots[0], execution));
            try {
                const before = await bounded(() => handle.stat());
                if (!before.regular || before.size > 8 * 1024 * 1024)
                    throw new Refusal();
                const cap = 8 * 1024 * 1024;
                const blocks: Buffer[] = [];
                let position = 0;
                while (position <= cap) {
                    const buffer = Buffer.alloc(Math.min(65536, cap + 1 - position));
                    const count = await bounded(() => handle.read(buffer, 0, buffer.length, position));
                    if (!Number.isInteger(count) || count < 0 || count > buffer.length)
                        throw new Refusal();
                    if (!count)
                        break;
                    blocks.push(buffer.subarray(0, count));
                    position += count;
                }
                if (position > cap)
                    throw new Refusal();
                const after = await bounded(() => handle.stat());
                if (!after.regular || after.identity !== before.identity || after.size !== position)
                    throw new Refusal();
                await bounded(() => handle.verify());
                return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(blocks, position)));
            }
            finally {
                await bounded(() => handle.close());
            }
        }
        try {
            stage = 'preflight';
            const input = await bounded(() => d.preflight());
            if (!/^[a-f0-9]{40}$/.test(input.commit) || !Number.isInteger(input.pgPort) || input.pgPort < 56000 || input.pgPort > 60999 || [input.apiPort, input.webPort].some(n => !Number.isInteger(n) || n < 1024 || n > 65535) || new Set([input.pgPort, input.apiPort, input.webPort]).size !== 3)
                throw new Refusal();
            stage = 'receipt';
            receipt = await bounded(() => d.createReceipt(d.argv));
            const runId = d.randomHex(16);
            if (!/^[a-f0-9]{32}$/.test(runId))
                throw new Refusal();
            candidate = paths.join(d.temporaryRoot, `explorers-profile-e2e-${runId}`);
            if (candidate.length > 1024)
                throw new Refusal();
            for (const target of [candidate, paths.join(candidate, 'owned-media'), paths.join(candidate, 'apps-fixture-files')]) {
                stage = 'create-directory';
                await bounded(() => d.createDirectory(target).then(value => { if (value.path !== target)
                    throw new Refusal(); roots.push(value); return value; }));
                stage = 'check-directory';
                await bounded(() => d.assertDirectory(roots.at(-1)!));
            }
            stage = 'prepare-secret';
            await bounded(() => d.prepareSecret().then(value => { secret = value; return value; }));
            stage = 'prepare-database';
            await bounded(() => d.prepareDatabase({ runId, commit: input.commit, port: input.pgPort, secret: secret! }).then(value => { acquisition = value; return value; }), 65000, true);
            const intent = acquisition!.intent;
            if (intent.runId !== runId || intent.commit !== input.commit || intent.database !== `music_uat_${runId}` || intent.port !== input.pgPort || intent.passwordFile !== secret!.path)
                throw new Refusal();
            stage = 'create-database';
            await bounded(() => acquisition!.create().then(value => { authority = value; return value; }), 125000, true);
            if (authority!.runId !== runId || authority!.commit !== input.commit || authority!.database !== `music_uat_${runId}` || authority!.port !== input.pgPort || authority!.owned !== true)
                throw new Refusal();
            stage = 'create-pool';
            await bounded(() => d.createPool(authority!, secret!).then(value => { pool = value; return value; }));
            stage = 'migrate';
            await bounded(() => d.migrate(pool!), 600000);
            stage = 'current-database';
            const database = await bounded(() => pool!.query({ text: 'SELECT current_database() AS database' }));
            if (database.rows.length !== 1 || database.rows[0].database !== authority!.database)
                throw new Refusal();
            stage = 'seed-auth';
            const persons = await bounded(() => d.seedAuth(pool!, runId));
            if (Object.keys(persons).sort().join(',') !== 'ownerA,ownerB' || persons.ownerA.userId === persons.ownerB.userId)
                throw new Refusal();
            const accounts = new Set<string>();
            for (const person of Object.values(persons)) {
                stage = 'initial-account';
                const account = await bounded(() => d.ensureInitialAccount(pool!, person.userId));
                if (!uuid.safeParse(account.accountId).success || account.accountId === person.userId || accounts.has(account.accountId))
                    throw new Refusal();
                accounts.add(account.accountId);
                person.accountId = account.accountId;
            }
            stage = 'config';
            const origin = `http://127.0.0.1:${input.webPort}`, apiOrigin = `http://127.0.0.1:${input.apiPort}`, config = await bounded(() => d.createConfig(origin));
            const fixedPersons = Object.fromEntries(Object.entries(persons).map(([key, person]) => [key, { userId: person.userId, handle: person.handle, accountId: person.accountId! }])) as typeof persons;
            const initialPersons = Object.fromEntries(Object.entries(persons).map(([key, person]) => [key, { userId: person.userId, handle: person.handle, cookie: person.cookie }])) as typeof persons;
            stage = 'composition';
            const composition = await bounded(() => d.createComposition(pool!, config, roots[1].path, { runAuthority: authority!, personasWithActualAccountIds: fixedPersons }));
            stage = 'create-sessions';
            await bounded(() => d.createSessions(composition, config, initialPersons));
            options = { pool: pool!, config, runId, commit: input.commit, origin, apiOrigin, personas: initialPersons, storage: composition.storage, composed: composition.composed, storageDirectory: roots[1].path, fixtureFilesRoot: roots[2].path, expectedTemporaryRoot: d.temporaryRoot, disposableDirectory: candidate, ownedAuthority: authority! };
            stage = 'start-api';
            await bounded(() => d.startApi(options!, () => control).then(value => { api = value; return value; }));
            for (const [name, person] of Object.entries(persons)) {
                const nativePerson = initialPersons[name as keyof typeof initialPersons];
                stage = 'baseline';
                const me = baseline.parse(await bounded(() => d.canonicalMe(composition, apiOrigin, nativePerson, readResponse)));
                const result = await bounded(() => pool!.query({ text: 'SELECT b.user_id,b.account_id,a.revision,a.display_name FROM initial_account_bindings b JOIN creator_accounts a ON a.id=b.account_id WHERE b.user_id=$1', values: [person.userId] }));
                const row = result.rows[0];
                if (result.rows.length !== 1 || row.user_id !== person.userId || row.account_id !== person.accountId || me.id !== person.accountId || String(row.revision) !== String(me.revision) || row.display_name !== me.displayName)
                    throw new Refusal();
            }
            stage = 'create-control';
            await bounded(() => d.createControl(options!).then(value => { control = value; return value; }));
            if (!/^[a-f0-9]{64}$/.test(control!.capability))
                throw new Refusal();
            const value = { origin, controlCapability: control!.capability, personas: initialPersons, version: 1, runId, commit: input.commit, fixtureFilesRoot: options.fixtureFilesRoot };
            if (Buffer.byteLength(JSON.stringify(value)) > 65536)
                throw new Refusal();
            stage='check-directory'; for (const root of roots)
                await bounded(() => d.assertDirectory(root));
            stage = 'descriptor';
            descriptor = await bounded(() => d.writeDescriptor(roots[0], value));
            stage = 'browser-context';
            const args = await bounded(() => Promise.resolve(receipt!.arguments(['--config', 'e2e/replatform/apps.playwright.config.ts', '--retries=0', '--workers=1', '--forbid-only'], candidate!)));
            const fixturePath = paths.join(candidate, 'sessions.json');
            const context = { arguments: args, environment: { ...receipt.executionEnvironment({}, candidate), APPS_E2E_FIXTURE_PATH: fixturePath, REPLATFORM_E2E_FIXTURE_PATH: fixturePath, REPLATFORM_E2E_LANE: 'apps', PLAYWRIGHT_EXTERNAL_BASE_URL: origin } };
            stage = 'vite';
            setupComplete = true;
            await bounded(() => d.launchVite(options!, readResponse).then(value => { vite = value; return value; }));
            vite!.closed.then(result => { if (!stopping) {
                knownFailure = result.stdioClosed === true;
                rejectLifecycle(new Refusal());
            } }, () => { uncertain = true; rejectLifecycle(new Refusal()); });
            await bounded(() => vite!.ready, 60000);
            phase = 'discovery';
            stage = 'discovery';
            await bounded(() => d.launchDiscovery(context, options!).then(value => { discovery = value; return value; }));
            const listed = await bounded(() => discovery!.closed, 60000);
            if (listed.code !== 0 || listed.signal !== null || listed.stdioClosed !== true)
                throw new Refusal();
            receipt.decodeDiscovery(await report(false));
            phase = 'execution';
            stage = 'execution';
            await bounded(() => d.launchBrowser(context, options!).then(value => { browser = value; return value; }));
            const result = await bounded(() => browser!.closed, 21000000);
            if (result.stdioClosed !== true)
                throw new Refusal();
            receipt.decodeExecution(await report(true), result.code, result.signal);
            if (result.code !== 0 || result.signal !== null) {
                knownFailure = true;
                throw new Refusal();
            }
        }
        catch (value) {
            captured ??= Object.freeze({ stage, category });
            error = value;
            failurePhase = phase;
            failures.push(phase === 'startup' ? 'control' : 'browser');
        }
        phase = 'cleanup';
        stage = 'cleanup';
        stopping = true;
        deadline = d.clock.now() + 300000;
        try {
            if (options)
                d.sealRequests(options);
            let producerFailure = false;
            for (const child of [browser, discovery, vite])
                if (child) {
                    try { await bounded(() => child.stop()); }
                    catch { producerFailure = true; }
                    try {
                        const result = await bounded(() => child.closed);
                        if (result.stdioClosed !== true) producerFailure = true;
                    }
                    catch { producerFailure = true; }
                }
            if (producerFailure) throw new Refusal();
            if (originals.size || uncertain || error && !knownFailure && !(interrupted && setupComplete))
                throw new Refusal();
            if (options) {
                const request = await bounded(() => d.drainRequests(options!, 15000));
                if (request.status !== 'settled' || request.sealed !== true || request.requests !== 0 || request.frames !== 0 || request.unknown !== false || request.uncertain !== false)
                    throw new Refusal();
                if (control)
                    await bounded(() => control!.close());
                const storage = await bounded(() => d.drainStorage(options!, 15000));
                if (storage.status !== 'settled' || storage.sealed !== true || storage.pending !== 0 || storage.overflow !== false)
                    throw new Refusal();
                if (api)
                    await bounded(() => api!.close());
                await bounded(() => d.removeArtifacts(options!, roots, descriptor));
            }
            if (pool)
                await bounded(() => pool!.end());
            if (authority && secret && acquisition) {
                if (deadline - d.clock.now() < 155000)
                    throw new Refusal();
                const admin = await bounded(() => d.createAdminPool(authority!, secret!));
                await bounded(() => admin.query({ text: `DROP DATABASE ${authority!.database}` }));
                await bounded(() => admin.end());
                await bounded(() => acquisition!.dispose(async () => { }), 125000, true);
            }
            if (roots.length) {
                if (roots.length !== 3 || !options)
                    throw new Refusal();
                await bounded(() => d.assertDirectory(roots[0]));
                await bounded(() => d.removeRoot(roots[0]));
            }
            else if (candidate)
                throw new Refusal();
            if (secret)
                await bounded(() => d.cleanupSecret(secret!));
            cleanupSettled = true;
        }
        catch (value) {
            error ??= value;
            failurePhase ??= 'cleanup';
            captured ??= Object.freeze({ stage, category });
            failures.push('private-directory');
        }
        if (cleanupSettled && !originals.size && !uncertain)
            restoreSignals();
        if (interrupted && !error) {
            error = new Refusal();
            failurePhase ??= phase;
            failures.push("browser");
        }
        if (error || failures.length) {
            if (receipt) {
                try {
                    await bounded(() => Promise.resolve(receipt!.failure(failurePhase ?? phase, Array.from(new Set(failures)), interrupted)));
                }
                catch { }
            }
            throw new Refusal();
        }
        if (!receipt || !authority)
            throw new Refusal();
        await bounded(() => Promise.resolve(receipt!.finish(authority!, [], interrupted)));
    }
}
function defaultDependencies(recordCategory: (value: DiagnosticCategory) => void, reportFailure:()=>void): Dependencies {
    const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url))), frontend = path.join(root, 'explorers-earth'), temporaryRoot = tmpdir();
    const ps = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', helper = path.join(root, 'tunes/scripts/music-local-private-files.ps1'), cli = path.join(frontend, 'node_modules/@playwright/test/cli.js'), viteCli = path.join(frontend, 'node_modules/vite/bin/vite.js');
    const retained = new Map<string, {
        dev: bigint;
        ino: bigint;
        mode: bigint;
        uid: bigint;
        size?: bigint;
        mtimeNs?: bigint;
        ctimeNs?: bigint;
        nlink?: bigint;
        directory: boolean;
    }>(), nativeChildren = new Set<Child>();
    let nativeUnknown = false;
    const env = () => Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH'].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]!]]).concat([['TEMP', temporaryRoot], ['TMP', temporaryRoot]]));
    async function canonical(target: string) { const fs = await import('node:fs/promises'); if (!path.isAbsolute(target) || path.resolve(target) !== target || target.length > 1024 || target.startsWith('\\\\') || /[\x00-\x1f\x7f]/.test(target) || process.platform === 'win32' && target.slice(path.parse(target).root.length).includes(':'))
        throw new Refusal(); for (let current = target;; current = path.dirname(current)) {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink() || await fs.realpath(current) !== current)
            throw new Refusal();
        if (current === path.dirname(current))
            break;
    } return fs; }
    async function remember(target: string, directory: boolean) { const fs = await canonical(target), stat = await fs.lstat(target, { bigint: true }); if (directory ? !stat.isDirectory() : !stat.isFile())
        throw new Refusal(); retained.set(target, { dev: stat.dev, ino: stat.ino, mode: stat.mode, uid: stat.uid, ...(directory ? {} : { size: stat.size, mtimeNs: stat.mtimeNs, ctimeNs: stat.ctimeNs, nlink: stat.nlink }), directory }); return { path: target, identity: { dev: stat.dev, ino: stat.ino } }; }
    async function same(target: string, directory?: boolean) { const old = retained.get(target); if (!old)
        throw new Refusal(); const fs = await canonical(target), stat = await fs.lstat(target, { bigint: true }); if (stat.dev !== old.dev || stat.ino !== old.ino || stat.uid !== old.uid || stat.mode !== old.mode || old.directory !== (directory ?? old.directory) || (old.directory ? !stat.isDirectory() : !stat.isFile() || stat.size !== old.size || stat.mtimeNs !== old.mtimeNs || stat.ctimeNs !== old.ctimeNs || stat.nlink !== old.nlink))
        throw new Refusal(); return fs; }
    async function fixedChild(executable: string, args: string[], environment: Record<string, string>, cwd: string, input?: string, capture = false, onStdout?: (bytes: Buffer) => void): Promise<Child & {
        output(): string;
    }> {
        const { spawn } = await import('node:child_process');
        const child = spawn(executable, args, { cwd, env: environment, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '', overflow = false;
        const closed = new Promise<{
        code: number | null;
        signal: string | null;
        stdioClosed: boolean;
    }>((resolve, reject) => {
            child.once('error', () => { if (capture)
                recordCategory('spawn-error'); nativeUnknown = true; reject(new Refusal()); });
            child.stdout.on('data', (bytes: Buffer) => {
                onStdout?.(bytes);
                if (capture) {
                    if (Buffer.byteLength(output) + bytes.length > 4096) {
                        overflow = true;
                        recordCategory('output-overflow');
                        nativeUnknown = true;
                        child.kill();
                    }
                    else
                        output += bytes.toString('utf8');
                }
            });
            child.stderr.resume();
            child.once('close', (code, signal) => { resolve({ code: overflow ? null : code, signal, stdioClosed: true }); });
        });
        closed.catch(() => undefined);
        const handle = { ready: Promise.resolve(), closed, async stop() { if (child.exitCode === null && child.signalCode === null)
                child.kill(); await closed; }, output: () => output };
        nativeChildren.add(handle);
        closed.then(() => nativeChildren.delete(handle), () => undefined);
        child.stdin.on('error', () => { nativeUnknown = true; });
        child.stdin.end(input);
        return handle;
    }
    async function fixedPowerShell(args: string[], input?: string) {
        if (input !== undefined && (Buffer.byteLength(input) < 1 || Buffer.byteLength(input) > 65536))
        throw new Refusal();
        let child: Awaited<ReturnType<typeof fixedChild>>;
        try {
            child = await fixedChild(ps, args, env(), root, input, true);
        }
        catch {
            recordCategory('spawn-error');
            throw new Refusal();
        }
        let timer: ReturnType<typeof setTimeout>;
        try {
            const result = await Promise.race([child.closed, new Promise<never>((_, reject) => { timer = setTimeout(() => { recordCategory('deadline'); nativeUnknown = true; void child.stop().catch(() => undefined); reject(new Refusal()); }, 10000); })]);
            if (result.signal !== null) {
                recordCategory('signal');
                throw new Refusal();
            }
            if (result.code !== 0 || !result.stdioClosed) {
                recordCategory('nonzero');
                throw new Refusal();
            }
            return child.output().trim();
        }
        finally {
        clearTimeout(timer!);
    }
    }
    async function privateOperation(operation: 'create-directory' | 'create-file' | 'inspect', target: string, input?: string) {
        if (process.platform === 'win32') {
            const text = await fixedPowerShell(['-NoLogo', '-NoProfile', '-NonInteractive', '-File', helper, operation, target], input);
            if (text !== '{"ok":true}') {
                recordCategory('ack-mismatch');
                throw new Refusal();
            }
        }
        else {
        const fs = await import('node:fs/promises');
        if (operation === 'create-directory')
            await fs.mkdir(target, { mode: 0o700 });
        else if (operation === 'create-file') {
            const handle = await fs.open(target, 'wx', 0o600);
            try {
                await handle.writeFile(input!);
                await handle.sync();
            }
            finally {
                await handle.close();
            }
        }
        else {
            const stat = await fs.lstat(target);
            if (typeof process.getuid !== 'function' || stat.uid !== process.getuid() || stat.mode & 0o077)
                throw new Refusal();
        }
    }
    }
    async function inspect(target: string) { await canonical(target); try { if(inspectAppsPrivateDescendant(target))return; await privateOperation('inspect', target); } catch(error) { nativeUnknown=true; throw error; } }
    let actualSupport: typeof import('./apps-browser-support') | undefined;
    const configurations = new WeakMap<object, any>(), nativeAccounts = new WeakMap<object, string[]>(), handlerDrains = new WeakMap<object, (ms: number) => Promise<boolean>>();
    async function support() { return actualSupport ??= await import('./apps-browser-support'); }
    async function outputNames() { const { APPS_CASES } = await support(); const sanitize = (value: string) => value.replace(/[\x00-\x2c\x2e-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g, '-'); const trim = (value: string) => { if (value.length <= 60)
        return value; const middle = '-' + createHash('sha1').update(value).digest('hex').slice(0, 5) + '-', start = Math.floor((60 - middle.length) / 2); return value.slice(0, start) + middle + value.slice(-(60 - middle.length - start)); }; return APPS_CASES.flatMap(title => ['apps-desktop', 'apps-mobile'].map(project => trim('apps-' + sanitize(title)) + '-' + sanitize(project))); }
    async function captureBrowserArtifacts(options: Options, execution: boolean) {
        const fs = await import('node:fs/promises');
        const file = path.join(options.disposableDirectory, execution ? 'protected-execution.json' : 'protected-discovery.json');
        await inspect(file);
        await remember(file, false);
        const output = path.join(options.disposableDirectory, 'browser-output');
        let names: string[];
        try {
            names = await fs.readdir(output);
        }
        catch (error) {
            if ((error as any).code === 'ENOENT')
                return;
            throw error;
        }
        const allowed = new Set(['.last-run.json', ...await outputNames()]);
        if (names.length > 9 || names.some(name => !allowed.has(name)))
            throw new Refusal();
        await inspect(output);
        await remember(output, true);
        for (const name of names) {
            const target = path.join(output, name);
            await inspect(target);
            await remember(target, name !== '.last-run.json');
            if (name !== '.last-run.json' && (await fs.readdir(target)).length)
                throw new Refusal();
        }
    }
    async function nativeChild(context: {
        arguments: string[];
        environment: Record<string, string>;
    }, options: Options, discovery = false) {
        const child = await fixedChild(process.execPath, [cli, 'test', ...context.arguments, ...(discovery ? ['--list'] : []), '--reporter=json'], { ...env(), ...context.environment, ...(discovery ? { PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(options.disposableDirectory, 'protected-discovery.json') } : {}) }, frontend);
        const original = child.closed;
        child.closed = original.then(async (result) => { if (!result.stdioClosed)
            throw new Refusal(); await captureBrowserArtifacts(options, !discovery); return result; });
        child.closed.catch(() => { nativeUnknown = true; });
        return child;
    }
    async function exactUnlink(target: string, optional = false) { const fs = await import('node:fs/promises'); try {
        await fs.lstat(target);
    }
    catch (error) {
        if (optional && (error as any).code === 'ENOENT')
            return;
        throw error;
    } if (!retained.has(target))
        throw new Refusal(); await inspect(target); await same(target, false); await fs.unlink(target); retained.delete(target); }
    async function emptyDirectory(target: string, optional = false) { const fs = await import('node:fs/promises'); try {
        await fs.lstat(target);
    }
    catch (error) {
        if (optional && (error as any).code === 'ENOENT')
            return;
        throw error;
    } if (!retained.has(target))
        throw new Refusal(); await inspect(target); await same(target, true); if ((await fs.readdir(target)).length)
        throw new Refusal(); await fs.rmdir(target); retained.delete(target); }
    return { platform: process.platform, argv: process.argv.slice(2), environment: process.env, temporaryRoot, clock: { now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: value => clearTimeout(value as ReturnType<typeof setTimeout>) }, randomHex: n => randomBytes(n).toString('hex'), installSignals(callback) { process.on('SIGINT', callback); process.on('SIGTERM', callback); return () => { process.removeListener('SIGINT', callback); process.removeListener('SIGTERM', callback); }; },
        async preflight() {
            const fs = await import('node:fs/promises');
            for (const file of [process.execPath, helper, cli, viteCli, path.join(frontend, 'e2e/replatform/apps.playwright.config.ts'), path.join(frontend, 'e2e/replatform/profile.vite.config.ts'), path.join(frontend, 'e2e/replatform/apps.spec.ts')]) {
                await canonical(file);
                if (!(await fs.lstat(file)).isFile())
                    throw new Refusal();
            }
            if (createHash('sha256').update(await fs.readFile(helper)).digest('hex') !== 'd35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764')
                throw new Refusal();
            await canonical(temporaryRoot);
            if (process.platform === 'win32') {
                await canonical(ps);
                if (!(await fs.lstat(ps)).isFile() || !/^5\.1\.\d+\.\d+$/.test(await fixedPowerShell(['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'])))
                    throw new Refusal();
            }
            const contract = await import(pathToFileURL(path.join(root, 'scripts/replatform-e2e.mjs')).href);
            const source = contract.snapshotSource(root);
            const commit = source.provenance.commit;
            if (!/^[a-f0-9]{40}$/.test(commit))
                throw new Refusal();
            const binding = await support();
            for (const key of ['admitAppsFixtureRequest', 'sealAppsFixtureRequests', 'drainAppsFixtureRequests'] as const)
                if (typeof binding[key] !== 'function')
                    throw new Refusal();
            const port = (min: number, max: number) => min + randomBytes(2).readUInt16BE() % (max - min + 1);
            return { commit, pgPort: port(56000, 60999), apiPort: port(54000, 55999), webPort: port(52000, 53999) };
        },
        async createReceipt(argv) { const { extractProtectedReceiptArguments, createProtectedReceipt } = await import('./protected-browser-receipt'); const receipt = await createProtectedReceipt(root, 'apps', extractProtectedReceiptArguments(argv)); if (!receipt)
            throw new Refusal(); return { ...receipt, async arguments(args: string[], directory: string) { const result = receipt.arguments(args, directory); const target = path.join(directory, 'protected.playwright.config.mjs'); await inspect(target); await remember(target, false); return result; } } as Receipt; },
        async createDirectory(target) { try {
            await canonical(path.dirname(target));
            await privateOperation('create-directory', target);
            await canonical(target);
            await privateOperation('inspect', target);
            if(process.platform==='win32')registerAppsPrivateDirectory(target);
            return await remember(target, true);
        }
        catch {
            nativeUnknown = true;
            throw new Refusal();
        } },
        async assertDirectory(directory) { await same(directory.path, true); await inspect(directory.path); },
        async prepareSecret() { try {
            if (process.platform !== 'win32') {
                const { prepareFixtureMusicTokenSecret } = await import('./music-fixture-secret');
                return { path: prepareFixtureMusicTokenSecret(root) };
            }
            const artifactDirectory = path.join(root, '.artifacts');
            const tokenDirectory = path.join(artifactDirectory, 'music-token-secrets');
            await canonical(root);
            for (const directory of [artifactDirectory, tokenDirectory]) {
                const fs = await canonical(path.dirname(directory));
                let absent = false;
                try { if (!(await fs.lstat(directory)).isDirectory()) throw new Refusal(); }
                catch (error) { if ((error as {code?:string}).code !== 'ENOENT') throw error; absent = true; }
                if (absent) await privateOperation('create-directory', directory);
                await canonical(directory);
                if (directory === tokenDirectory) await inspect(directory);
                await remember(directory, true);
            }
            const target = path.join(tokenDirectory, `current-${randomBytes(16).toString('hex')}`);
            await same(artifactDirectory, true);
            await same(tokenDirectory, true);
            await inspect(tokenDirectory);
            await privateOperation('create-file', target, randomBytes(32).toString('base64url'));
            await same(artifactDirectory, true);
            await same(tokenDirectory, true);
            await inspect(tokenDirectory);
            await inspect(target);
            await remember(target, false);
            return { path: target };
        }
        catch {
            nativeUnknown = true;
            throw new Refusal();
        } },
        async prepareDatabase(input) { const { prepareOwnedUatDatabaseAcquisition } = await import('./music-uat-database'); return prepareOwnedUatDatabaseAcquisition({ runId: input.runId, database: `music_uat_${input.runId}`, commit: input.commit, port: input.port, passwordFile: input.secret.path }); }, async createPool(authority, secret) { const { readSecureMusicSecretFile } = await import('../server/config/secure-music-secret-file'); const password = await readSecureMusicSecretFile(secret.path, { mode: 'fixture' }); const { default: pg } = await import('pg'); return new pg.Pool({ host: '127.0.0.1', user: 'music_migrator', password, database: authority.database, port: authority.port, max: 4, connectionTimeoutMillis: 3000, statement_timeout: 10000, options: '-c lock_timeout=5000' }) as unknown as Pool; },
        async migrate(pool) { const { migrateMusicDatabase } = await import('../server/db/migrate'); await migrateMusicDatabase(pool as any); },
        async seedAuth(pool, runId) { const result = {} as {
            ownerA: Persona;
            ownerB: Persona;
        }; for (const key of ['ownerA', 'ownerB'] as const) {
            const userId = `apps-e2e-${randomUUID()}`;
            await pool.query({ text: 'INSERT INTO auth_user(id,name,email) VALUES ($1,$2,$3)', values: [userId, key, `${userId}@example.invalid`] });
            await pool.query({ text: "INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())", values: [randomUUID(), `google-${userId}`, userId] });
            result[key] = { userId, handle: `apps${key.toLowerCase()}${runId.slice(0, 4)}`, cookie: '' };
        } return result; },
        async ensureInitialAccount(pool, userId) { const { ensureInitialAccount } = await import('../server/auth/initialAccount'); return ensureInitialAccount(pool as any, userId); },
        async createConfig(origin) { const { resolveExplorersAuthConfig } = await import('../server/auth/betterAuth'); return resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: origin, EXPLORERS_AUTH_SECRET: randomBytes(32).toString('hex'), GOOGLE_CLIENT_ID: 'apps-fixture-google', GOOGLE_CLIENT_SECRET: 'apps-fixture-secret' }); },
        async createComposition(pool, config, directory, binding) { const pair = await (await support()).createAppsFixtureComposition(pool as any, config, directory, binding as any); configurations.set(pair.composed, config); nativeAccounts.set(pair.composed, Object.values(binding.personasWithActualAccountIds).map(person => person.accountId!)); return pair; },
        async startApi(options,getControl){
            const {createServer}=await import('node:http');const binding=await support();
            const handlers=new Set<Promise<unknown>>(),sockets=new Set<import('node:net').Socket>();
            const fail=()=>{
                nativeUnknown=true;
                try{binding.sealAppsFixtureRequests(options as unknown as AppsControlOptions);}catch{}
                try{reportFailure();}catch{}
            };
            const respond=(res:import('node:http').ServerResponse,status:number)=>{
                if(res.headersSent||res.writableEnded||res.destroyed)return;
                try{res.statusCode=status;res.setHeader('Cache-Control','no-store');res.end();}
                catch{fail();try{res.destroy();}catch{}}
            };
            handlerDrains.set(options.composed,async(ms)=>{
                if(!handlers.size)return true;let timer:ReturnType<typeof setTimeout>;
                try{return await Promise.race([Promise.all([...handlers]).then(()=>handlers.size===0),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),ms);})]);}
                catch{return false;}finally{clearTimeout(timer!);}
            });
            const server=createServer((req,res)=>{
                const original=(async()=>{
                    if(!binding.admitAppsFixtureRequest(options as unknown as AppsControlOptions,req,res)){respond(res,503);return;}
                    const control=getControl();if(control&&await control.handle(req,res))return;
                    options.composed.app(req,res);
                })();
                handlers.add(original);
                void original.then(()=>handlers.delete(original),()=>{handlers.delete(original);fail();respond(res,500);}).catch(()=>{fail();});
            });
            server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));if(sockets.size>128){fail();socket.destroy();}});
            server.on('error',fail);
            await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(Number(new URL(options.apiOrigin).port),'127.0.0.1',resolve);});
            return{async close(){if(handlers.size)throw new Refusal();for(const socket of sockets)socket.destroy();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
        },
        async createSessions(composition, config, personas) { const context = await composition.composed.auth.$context; for (const person of Object.values(personas)) {
            const session = await context.internalAdapter.createSession(person.userId, false);
            person.cookie = `${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256', config.secret).update(session.token).digest('base64')}`;
        } },
        async canonicalMe(_composition, origin, person, read) { const response = await fetch(`${origin}/api/explorers/v1/me`, { headers: { Cookie: person.cookie }, redirect: 'error', signal: AbortSignal.timeout(10000) }); if (response.status !== 200)
            throw new Refusal(); const bytes = await read(response, 65536); const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); const { accountDtoSchema } = await import('../shared/explorersContract'); return accountDtoSchema.parse(value.account); },
        async createControl(options) { return (await support()).createAppsControl(options as unknown as AppsControlOptions); },
        async writeDescriptor(directory, value) { await same(directory.path, true); await inspect(directory.path); const target = path.join(directory.path, 'sessions.json'), text = JSON.stringify(value); if (Buffer.byteLength(text) > 65536)
            throw new Refusal(); try {
            await privateOperation('create-file', target, text);
        }
        catch {
            nativeUnknown = true;
            throw new Refusal();
        } await inspect(target); return remember(target, false); },
        async launchVite(options, read) {
            let advertised!: () => void;
            let text = '', witness = false;
            const advertisement = new Promise<void>(resolve => { advertised = resolve; });
            const child = await fixedChild(process.execPath, [viteCli, '--config', 'e2e/replatform/profile.vite.config.ts'], { ...env(), PROFILE_E2E_WEB_PORT: new URL(options.origin).port, PROFILE_E2E_API_PORT: new URL(options.apiOrigin).port, PROFILE_E2E_LOCAL_AUTHORITY: 'owned-disposable-pg15' }, frontend, undefined, false, bytes => { if (witness)
                return; text += bytes.toString('utf8'); if (Buffer.byteLength(text) > 4096) {
                nativeUnknown = true;
                return;
            } const plain = text.replace(/\x1b\[[0-9;]*m/g, ''); if (plain.split(/\r?\n/).some(line => line.includes('Local:') && line.trimEnd().endsWith(options.origin + '/'))) {
                witness = true;
                advertised();
            } });
            child.ready = Promise.race([child.closed.then(() => { throw new Refusal(); }), (async () => { await advertisement; const end = performance.now() + 60000; while (true) {
                    try {
                        const response = await fetch(options.origin, { redirect: 'error', signal: AbortSignal.timeout(1000) });
                        await read(response, 4096);
                        if (response.status === 200)
                            return;
                    }
                    catch { }
                    if (performance.now() >= end)
                        throw new Refusal();
                    await new Promise(resolve => setTimeout(resolve, 250));
                } })()]);
            child.ready.catch(() => undefined);
            return child;
        }, launchDiscovery: (context, options) => nativeChild(context, options, true),
        async openReport(directory, execution) { const file = path.join(directory.path, execution ? 'protected-execution.json' : 'protected-discovery.json'); const fs = await same(file, false); await inspect(file); const { constants } = await import('node:fs'); const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW); const identity = (stat: import('node:fs').BigIntStats) => [stat.dev, stat.ino, stat.mode, stat.uid, stat.size, stat.mtimeNs, stat.ctimeNs, stat.nlink].map(String).join(':'); const original = retained.get(file)!; const expected = [original.dev, original.ino, original.mode, original.uid, original.size, original.mtimeNs, original.ctimeNs, original.nlink].map(String).join(':'); return { async stat() { const stat = await handle.stat({ bigint: true }); if (identity(stat) !== expected || !stat.isFile())
                throw new Refusal(); return { identity: identity(stat), size: Number(stat.size), regular: stat.isFile() }; }, async read(buffer, offset, length, position) { return (await handle.read(buffer, offset, length, position)).bytesRead; }, async verify() { await same(file, false); await inspect(file); }, async close() { await handle.close(); } }; },
        launchBrowser: (context, options) => nativeChild(context, options),
        sealRequests(options) { if (!actualSupport)
            throw new Refusal(); actualSupport.sealAppsFixtureRequests(options as any); },
        async drainRequests(options, ms) { const began = performance.now(), drain = handlerDrains.get(options.composed); if (nativeUnknown || !drain || !await drain(ms))
            throw new Refusal(); const remaining = Math.floor(ms - (performance.now() - began)); if (remaining < 1)
            throw new Refusal(); const result = await (await support()).drainAppsFixtureRequests(options as unknown as AppsControlOptions, remaining); if (nativeUnknown)
            throw new Refusal(); return result; },
        async drainStorage(options, ms) {
            const result = await (await support()).drainAppsFixtureStorage(options as unknown as AppsControlOptions, ms);
            if (result.status !== 'settled')
                return result;
            const accounts = nativeAccounts.get(options.composed);
            if (!accounts || accounts.length !== 2)
                throw new Refusal();
            const rows = await options.pool.query({ text: "SELECT a.id,a.account_id,a.purpose,o.variant,o.storage_environment,o.object_key FROM media_objects o JOIN media_assets a ON a.id=o.media_id WHERE a.account_id=ANY($1::uuid[]) LIMIT 129", values: [accounts] });
            if (rows.rows.length > 128)
                throw new Refusal();
            const targets = new Set<string>();
            for (const row of rows.rows) {
                if (!accounts.includes(row.account_id) || !uuid.safeParse(row.id).success || row.purpose !== 'recommendation' || row.variant !== 'original' || row.storage_environment !== 'local' || row.object_key !== `local/${row.account_id}/${row.id}`)
                    throw new Refusal();
                targets.add(path.join(options.storageDirectory, ...row.object_key.split('/')));
            }
            const fs = await import('node:fs/promises');
            for (const directory of [path.join(options.storageDirectory, 'local'), ...accounts.map(account => path.join(options.storageDirectory, 'local', account))]) {
                try {
                    await fs.lstat(directory);
                }
                catch (error) {
                    if ((error as any).code === 'ENOENT')
                        continue;
                    throw error;
                }
                await inspect(directory);
                await remember(directory, true);
            }
            for (const target of targets) {
                try {
                    await fs.lstat(target);
                }
                catch (error) {
                    if ((error as any).code === 'ENOENT')
                        continue;
                    throw error;
                }
                await inspect(target);
                await remember(target, false);
            }
            return result;
        },
        async removeArtifacts(options, roots, descriptor) {
            if (nativeUnknown || nativeChildren.size)
                throw new Refusal();
            for (const directory of roots)
                await same(directory.path, true);
            const fs = await import('node:fs/promises');
            const accounts = nativeAccounts.get(options.composed);
            if (!accounts || accounts.length !== 2)
                throw new Refusal();
            const result = await options.pool.query({ text: "SELECT a.id,a.account_id,a.purpose,o.variant,o.storage_environment,o.object_key FROM media_objects o JOIN media_assets a ON a.id=o.media_id WHERE a.account_id=ANY($1::uuid[]) LIMIT 129", values: [accounts] });
            if (result.rows.length > 128)
                throw new Refusal();
            const targets = new Set<string>();
            for (const row of result.rows) {
                if (!accounts.includes(row.account_id) || !uuid.safeParse(row.id).success || row.purpose !== 'recommendation' || row.variant !== 'original' || row.storage_environment !== 'local' || row.object_key !== `local/${row.account_id}/${row.id}`)
                    throw new Refusal();
                targets.add(path.join(options.storageDirectory, ...row.object_key.split('/')));
            }
            for (const target of targets)
                await exactUnlink(target, true);
            for (const account of accounts)
                await emptyDirectory(path.join(options.storageDirectory, 'local', account), true);
            await emptyDirectory(path.join(options.storageDirectory, 'local'), true);
            await emptyDirectory(options.storageDirectory);
            for (const name of ['apps-upload-1.png', 'apps-upload-2.png'])
                await exactUnlink(path.join(options.fixtureFilesRoot, name), true);
            await emptyDirectory(options.fixtureFilesRoot);
            if (descriptor)
                await exactUnlink((descriptor as RetainedDirectory).path);
            for (const name of ['protected.playwright.config.mjs', 'protected-discovery.json', 'protected-execution.json'])
                await exactUnlink(path.join(options.disposableDirectory, name), true);
            const output = path.join(options.disposableDirectory, 'browser-output');
            let outputExists = true;
            try {
                await fs.lstat(output);
            }
            catch (error) {
                if ((error as any).code === 'ENOENT')
                    outputExists = false;
                else
                    throw error;
            }
            if (outputExists) {
                await inspect(output);
                await exactUnlink(path.join(output, '.last-run.json'), true);
                const { APPS_CASES } = await import('./apps-browser-support');
                const sanitize = (value: string) => value.replace(/[\x00-\x2c\x2e-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g, '-');
                const trim = (value: string) => { if (value.length <= 60)
                    return value; const middle = '-' + createHash('sha1').update(value).digest('hex').slice(0, 5) + '-', start = Math.floor((60 - middle.length) / 2); return value.slice(0, start) + middle + value.slice(-(60 - middle.length - start)); };
                const names = APPS_CASES.flatMap(title => ['apps-desktop', 'apps-mobile'].map(project => trim('apps-' + sanitize(title)) + '-' + sanitize(project)));
                for (const name of names)
                    await emptyDirectory(path.join(output, name), true);
                await emptyDirectory(output);
            }
            await same(options.disposableDirectory, true);
            await inspect(options.disposableDirectory);
            if ((await fs.readdir(options.disposableDirectory)).length)
                throw new Refusal();
        },
        async createAdminPool(authority, secret) { if (nativeUnknown || nativeChildren.size)
            throw new Refusal(); const { readSecureMusicSecretFile } = await import('../server/config/secure-music-secret-file'); const password = await readSecureMusicSecretFile(secret.path, { mode: 'fixture' }); const { default: pg } = await import('pg'); return new pg.Pool({ host: '127.0.0.1', port: authority.port, user: 'music_migrator', password, database: 'postgres', max: 1, connectionTimeoutMillis: 3000, statement_timeout: 10000, options: '-c lock_timeout=5000' }) as unknown as Pool; }, async cleanupSecret(secret) { if (nativeUnknown || nativeChildren.size)
            throw new Refusal(); const { cleanupFixtureMusicTokenSecret } = await import('./music-fixture-secret'); cleanupFixtureMusicTokenSecret(root, secret.path); },
        async removeRoot(directory) { if (nativeUnknown || nativeChildren.size)
            throw new Refusal(); await same(directory.path, true); await emptyDirectory(directory.path); },
    };
}
