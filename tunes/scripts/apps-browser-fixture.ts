import path from 'node:path';
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod/v3';
import {extractAppsControlDiagnostic,extractAppsRequestDrainDiagnostic,extractAppsRequestDrainSnapshot,type AppsRequestDrainDiagnostic,type AppsControllerDiagnostic,type AppsControlOptions} from './apps-browser-support';
import { parseBrowserSuite, assertBrowserEnvironment } from './lifecycle-browser-guards';
import {registerAppsPrivateDirectory,inspectAppsPrivateDescendant} from './apps-private-custody';
type EnrichmentGrant=import('./apps-enrichment-native-runtime').AppsEnrichmentProvisionState;
const enrichmentGrants=new WeakMap<object,{options:object;state:EnrichmentGrant;authority:Authority;snapshot:string;closed:boolean}>();
/** Verifier only; opaque tokens are issued inside the owned native fixture lifecycle. */
/** Verifier only; opaque tokens are issued inside the owned native fixture lifecycle. */
export function inspectAppsEnrichmentProvisionGrant(token: object, options: object): EnrichmentGrant {
    const issued = enrichmentGrants.get(token);
    if (!issued || issued.closed || issued.options !== options || JSON.stringify(issued.authority) !== issued.snapshot)
        throw Error('Apps enrichment native custody refused');
    issued.state.assertCurrent();
    return issued.state;
}
function issueAppsEnrichmentProvisionGrant(options: object, authority: Authority, state: EnrichmentGrant) {
    state.assertCurrent();
    const token = Object.freeze({}), record = { options, state, authority, snapshot: JSON.stringify(authority), closed: false };
    enrichmentGrants.set(token, record);
    return { token, closeAfterDrain() { if (state.pending.size)
            throw Error('Apps enrichment native custody refused'); record.closed = true; } };
}
/** Immediate custody exists before capability verification or grant publication. */
/** Immediate custody exists before capability verification or grant publication. */
function createAppsEnrichmentProvisioningOwner(nativePool: import('pg').Pool, controller: AbortController) {
    const pending = new Set<Promise<unknown>>(), clients = new Set<import('pg').PoolClient>();
    let closing: Promise<void> | undefined, closed = false;
    const retain = <T>(original: Promise<T>) => { pending.add(original); void original.then(() => pending.delete(original), () => pending.delete(original)); return original; };
    const stop = () => { for (const client of [...clients])
        client.release(true); };
    controller.signal.addEventListener('abort', stop);
    const connect = () => retain((async () => {
        const client = await nativePool.connect();
        if (closed || closing || controller.signal.aborted) {
            client.release(true);
            throw new Refusal();
        }
        clients.add(client);
        const originalQueryMethod = client.query, originalQuery = client.query.bind(client), originalRelease = client.release.bind(client);
        let released = false;
        client.query = ((...args: any[]) => { if (released || controller.signal.aborted)
            throw new Refusal(); return retain((originalQuery as any)(...args)); }) as any;
        client.release = ((error?: Error | boolean) => { if (released)
            return; released = true; clients.delete(client); client.query = originalQueryMethod; originalRelease(error); }) as any;
        return client;
    })());
    const close = () => closing ??= (async () => { controller.abort(); stop(); while (pending.size)
        await Promise.allSettled([...pending]); await nativePool.end(); closed = true; controller.signal.removeEventListener('abort', stop); })();
    const pool = { options: (nativePool as any).options, connect, query: async (...args: any[]) => { const client = await connect(); try {
            return await (client.query as any)(...args);
        }
        finally {
            client.release();
        } }, end: close, on: nativePool.on.bind(nativePool) } as unknown as import('pg').Pool;
    return Object.freeze({ pool, close, pending });
}
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
type CleanupStep = 'request-seal' | 'browser-stop' | 'browser-close' | 'discovery-stop' | 'discovery-close' | 'vite-stop' | 'vite-close' | 'producer-settlement' | 'request-drain' | 'control-close' | 'storage-drain' | 'api-close' | 'artifact-remove' | 'runtime-pool-close' | 'database-budget' | 'admin-pool-open' | 'database-drop' | 'admin-pool-close' | 'database-dispose' | 'root-check' | 'root-remove' | 'secret-clean' | 'failure-receipt' | 'finish-receipt';
export type NativeUnknownOrigin='clock-callback'|'clock-late-clear'|'guard-expiry'|'child-error'|'child-output-overflow'|'child-stdin'|'powershell-deadline'|'privacy-refusal'|'capture-rejection'|'directory-create'|'secret-create'|'api-failure'|'descriptor-create'|'vite-output-overflow';
export type RequestDrainBoundary='native-unknown-before'|'ledger-missing'|'handler-drain'|'remaining-budget'|'support-drain'|'native-unknown-after'|'canonical-evidence';
type NativeContext=Readonly<{stage:DiagnosticStage;cleanupStep?:CleanupStep}>;
export type RequestDrainPending=Readonly<{phase:'handler-wait'|'canonical-wait';handlers:number;evidence?:AppsRequestDrainDiagnostic}>;
type NativeUnknownDetail=Readonly<NativeContext&{origin:NativeUnknownOrigin;budgetMs?:number}>;
export type AppsViteDiagnostic=Readonly<{
    origin:'launch'|'closed-before-ready'|'advertisement-budget'|'probe-budget'|'output-overflow';
    childCode:number|null;childSignal:'none'|'SIGTERM'|'SIGKILL'|'other';stdioClosed:boolean;
    advertised:boolean;httpReady:boolean;probeOutcome:'none'|'http200'|'non200'|'transport-refused'|'transport-timeout'|'redirect-refused'|'body-refused'|'unknown';
    stderr:'port-in-use'|'config-load'|'module-not-found'|'unknown';stderrBytes:number;stderrOverflow:boolean;
}>;
type Diagnostic = Readonly<{
    stage: DiagnosticStage;
    category: DiagnosticCategory;
    cleanupStep?: CleanupStep;
    nativeUnknownOrigin?:NativeUnknownDetail;requestDrainBoundary?:RequestDrainBoundary;requestDrain?:AppsRequestDrainDiagnostic;requestDrainPending?:RequestDrainPending;
    control?: AppsControllerDiagnostic;
    vite?:AppsViteDiagnostic;
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
export function createAppsBrowserFixture(dependencies?: Dependencies, family: 'apps'|'apps-enrichment'='apps'): {
    run(): Promise<void>;
} {
    let stage: DiagnosticStage = 'validation', category: DiagnosticCategory = 'refusal', captured: Diagnostic | undefined;
    let cleanupStep: CleanupStep | undefined;
    let nativeUnknownOrigin:NativeUnknownDetail|undefined,requestDrainBoundary:RequestDrainBoundary|undefined;
    let readDrainPending:(()=>RequestDrainPending|undefined)|undefined,deadlinePending:RequestDrainPending|undefined;
    const registerDrainPending=(reader:()=>RequestDrainPending|undefined)=>{readDrainPending=reader;};
    const safeDrainPending=():RequestDrainPending|undefined=>{try{return readDrainPending?.();}catch{return undefined;}};
    const readContext=():NativeContext=>Object.freeze({stage,...(stage==='cleanup'&&cleanupStep?{cleanupStep}:{})});
    const recordUnknown=(origin:NativeUnknownOrigin,context:NativeContext,budgetMs?:number)=>{if(!nativeUnknownOrigin){nativeUnknownOrigin=Object.freeze({...context,origin,...(Number.isSafeInteger(budgetMs)&&budgetMs!>=1&&budgetMs!<=21600000?{budgetMs}:{})});if(['clock-callback','clock-late-clear','guard-expiry','powershell-deadline'].includes(origin))recordCategory('deadline');}};
    const recordDrain=(boundary:RequestDrainBoundary)=>{requestDrainBoundary??=boundary;};
    let readViteDiagnostic:(()=>AppsViteDiagnostic|undefined)|undefined;
    const registerViteDiagnostic=(reader:()=>AppsViteDiagnostic|undefined)=>{readViteDiagnostic=reader;};
    const safeViteDiagnostic=()=>{if(stage!=='vite')return undefined;try{return readViteDiagnostic?.();}catch{return undefined;}};
    const snapshot = (control?:unknown,options?:unknown): Diagnostic => {const vite=safeViteDiagnostic(),detail=extractAppsControlDiagnostic(control),requestDrain=extractAppsRequestDrainDiagnostic(options),requestDrainPending=deadlinePending??(stage==='cleanup'&&cleanupStep==='request-drain'?safeDrainPending():undefined);return Object.freeze({stage,category,...(vite?{vite}:{}),...(stage==='cleanup'&&cleanupStep?{cleanupStep}:{}),...(detail?{control:detail}:{}),...(nativeUnknownOrigin?{nativeUnknownOrigin}:{}),...(requestDrainBoundary?{requestDrainBoundary}:{}),...(requestDrain?{requestDrain}:{}),...(requestDrainPending?{requestDrainPending}:{})});};
    const recordCategory = (value: DiagnosticCategory) => { if (category === 'refusal')
        category = value; };
    let nativeFailure:(()=>void)|undefined;
    const d = dependencies === undefined ? defaultDependencies(recordCategory,()=>nativeFailure?.(),recordUnknown,readContext,recordDrain,registerDrainPending,registerViteDiagnostic,family) : dependencies;
    let promise: Promise<void> | undefined;
    return { run() {
            return promise ??= Promise.resolve().then(execute).catch(() => {
                const error = new Refusal();
                diagnostics.set(error, captured ?? snapshot());
                throw error;
            });
        } };
    async function execute() {
        if (!d || Object.keys(d).sort().join(',') !== [...keys].sort().join(',') || keys.filter(key => !['platform', 'argv', 'environment', 'temporaryRoot', 'clock'].includes(key)).some(key => typeof Reflect.get(d, key) !== 'function') || !d.clock || ['now', 'setTimeout', 'clearTimeout'].some(key => typeof Reflect.get(d.clock, key) !== 'function'))
            throw new Refusal();
        if (!['win32', 'linux', 'darwin'].includes(d.platform) || d.argv.length !== 8 || parseBrowserSuite(d.argv.slice(0, 4)) !== family || d.argv[4] !== '--receipt-directory' || d.argv[6] !== '--receipt-capability' || !/^[a-f0-9]{64}$/.test(d.argv[7]))
            throw new Refusal();
        assertBrowserEnvironment(d.environment);
        if (d.environment.PLAYWRIGHT_LAST_RUN_OUTPUT_FILE !== undefined || d.environment.NODE_OPTIONS !== undefined || d.environment.NODE_CHANNEL_FD !== undefined)
            throw new Refusal();
        const paths = d.platform === 'win32' ? path.win32 : path.posix;
        if (!paths.isAbsolute(d.temporaryRoot) || paths.normalize(d.temporaryRoot) !== d.temporaryRoot || !paths.isAbsolute(d.argv[5]) || paths.basename(d.argv[5]) !== family || paths.dirname(paths.dirname(d.argv[5])) !== d.temporaryRoot || !/^replatform-e2e-[A-Za-z0-9-]{8,64}$/.test(paths.basename(paths.dirname(d.argv[5]))))
            throw new Refusal();
        const originals = new Set<Promise<unknown>>();
        let deadline = d.clock.now() + 21600000, uncertain = false, interrupted = false, knownFailure = false, setupComplete = false, stopping = false, cleanupSettled = false;
        const failures: string[] = [];
        let phase: 'startup' | 'discovery' | 'execution' | 'cleanup' = 'startup', failurePhase: 'startup' | 'discovery' | 'execution' | 'cleanup' | undefined;
        async function bounded<T>(work: () => Promise<T>, limit = 15000, margin = false): Promise<T> { const ms = Math.min(limit, Math.floor(deadline - d.clock.now())); if (ms < 1 || margin && ms < limit)
            throw new Refusal(); let timer: unknown; const original = Promise.resolve().then(work); originals.add(original); original.then(() => originals.delete(original), () => originals.delete(original)); try {
            return await Promise.race([original, ...(phase === 'cleanup' ? [] : [lifecycleFailed]), new Promise<never>((_, reject) => { timer = d.clock.setTimeout(() => { if(stage==='cleanup'&&cleanupStep==='request-drain')deadlinePending??=safeDrainPending();recordCategory('deadline'); uncertain = true; reject(new Refusal()); }, ms); })]);
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
            const value = { ...(family==='apps-enrichment'?{lane:family,enrichmentPolicy:{requestTimeoutMs:15000,maxJsonBytes:65536,nativeRefreshTimeoutMs:60000,caseTimeoutMs:120000}}:{}),origin, controlCapability: control!.capability, personas: initialPersons, version: 1, runId, commit: input.commit, fixtureFilesRoot: options.fixtureFilesRoot };
            if (Buffer.byteLength(JSON.stringify(value)) > 65536)
                throw new Refusal();
            stage='check-directory'; for (const root of roots)
                await bounded(() => d.assertDirectory(root));
            stage = 'descriptor';
            descriptor = await bounded(() => d.writeDescriptor(roots[0], value));
            stage = 'browser-context';
            const args = await bounded(() => Promise.resolve(receipt!.arguments(['--config', family==='apps-enrichment'?'e2e/replatform/apps-enrichment.playwright.config.ts':'e2e/replatform/apps.playwright.config.ts', '--retries=0', '--workers=1', '--forbid-only'], candidate!)));
            const fixturePath = paths.join(candidate, 'sessions.json');
            const context = { arguments: args, environment: { ...receipt.executionEnvironment({}, candidate), APPS_E2E_FIXTURE_PATH: fixturePath, REPLATFORM_E2E_FIXTURE_PATH: fixturePath, REPLATFORM_E2E_LANE: family, PLAYWRIGHT_EXTERNAL_BASE_URL: origin } };
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
            captured ??= snapshot(control,options);
            error = value;
            failurePhase = phase;
            failures.push(phase === 'startup' ? 'control' : 'browser');
        }
        phase = 'cleanup';
        stage = 'cleanup';
        stopping = true;
        deadline = d.clock.now() + 300000;
        try {
            if (options) { cleanupStep = 'request-seal'; d.sealRequests(options); }
            let producerFailure = false;
            for (const [name, child] of [['browser',browser],['discovery',discovery],['vite',vite]] as const)
                if (child) {
                    cleanupStep = `${name}-stop`;
                    try { await bounded(() => child.stop()); }
                    catch { captured ??= snapshot(control,options); producerFailure = true; }
                    try {
                        cleanupStep = `${name}-close`;
                        const result = await bounded(() => child.closed);
                        if (result.stdioClosed !== true) { captured ??= snapshot(control,options); producerFailure = true; }
                    }
                    catch { captured ??= snapshot(control,options); producerFailure = true; }
                }
            if (producerFailure) throw new Refusal();
            cleanupStep = 'producer-settlement';
            if (originals.size || uncertain || error && !knownFailure && !(interrupted && setupComplete))
                throw new Refusal();
            if (options) {
                cleanupStep = 'request-drain';
                const request = await bounded(() => d.drainRequests(options!, 15000));
                if (request.status !== 'settled' || request.sealed !== true || request.requests !== 0 || request.frames !== 0 || request.unknown !== false || request.uncertain !== false){recordDrain('canonical-evidence');
                    throw new Refusal();}
                if (control) { cleanupStep = 'control-close'; await bounded(() => control!.close()); }
                cleanupStep = 'storage-drain';
                const storage = await bounded(() => d.drainStorage(options!, 15000));
                if (storage.status !== 'settled' || storage.sealed !== true || storage.pending !== 0 || storage.overflow !== false)
                    throw new Refusal();
                if (api) { cleanupStep = 'api-close'; await bounded(() => api!.close()); }
                cleanupStep = 'artifact-remove';
                await bounded(() => d.removeArtifacts(options!, roots, descriptor));
            }
            if (pool) { cleanupStep = 'runtime-pool-close'; await bounded(() => pool!.end()); }
            if (authority && secret && acquisition) {
                cleanupStep = 'database-budget';
                if (deadline - d.clock.now() < 155000)
                    throw new Refusal();
                cleanupStep = 'admin-pool-open';
                const admin = await bounded(() => d.createAdminPool(authority!, secret!));
                cleanupStep = 'database-drop';
                await bounded(() => admin.query({ text: `DROP DATABASE ${authority!.database}` }));
                cleanupStep = 'admin-pool-close';
                await bounded(() => admin.end());
                cleanupStep = 'database-dispose';
                await bounded(() => acquisition!.dispose(async () => { }), 125000, true);
            }
            if (roots.length) {
                if (roots.length !== 3 || !options)
                    throw new Refusal();
                cleanupStep = 'root-check';
                await bounded(() => d.assertDirectory(roots[0]));
                cleanupStep = 'root-remove';
                await bounded(() => d.removeRoot(roots[0]));
            }
            else if (candidate)
                throw new Refusal();
            if (secret) { cleanupStep = 'secret-clean'; await bounded(() => d.cleanupSecret(secret!)); }
            cleanupSettled = true;
        }
        catch (value) {
            error ??= value;
            failurePhase ??= 'cleanup';
            captured ??= snapshot(control,options);
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
                    cleanupStep = 'failure-receipt';
                    await bounded(() => Promise.resolve(receipt!.failure(failurePhase ?? phase, Array.from(new Set(failures)), interrupted)));
                }
                catch { }
            }
            throw new Refusal();
        }
        if (!receipt || !authority)
            throw new Refusal();
        cleanupStep = 'finish-receipt';
        await bounded(() => Promise.resolve(receipt!.finish(authority!, [], interrupted)));
    }
}
/** Distinct protected additive family; construction remains inert. */
/** Distinct protected additive family; construction remains inert. */
export function createAppsEnrichmentBrowserFixture(dependencies?: Dependencies) { return createAppsBrowserFixture(dependencies, 'apps-enrichment'); }
function defaultDependencies(recordCategory: (value: DiagnosticCategory) => void, reportFailure:()=>void,reportUnknown:(origin:NativeUnknownOrigin,context:NativeContext,budgetMs?:number)=>void,readContext:()=>NativeContext,reportDrain:(boundary:RequestDrainBoundary)=>void,registerDrainPending:(reader:()=>RequestDrainPending|undefined)=>void,registerViteDiagnostic:(reader:()=>AppsViteDiagnostic|undefined)=>void=()=>{},family:'apps'|'apps-enrichment'='apps'): Dependencies {
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
    function latchUnknown(origin:NativeUnknownOrigin,context:NativeContext=readContext(),budgetMs?:number){if(!nativeUnknown)reportUnknown(origin,context,budgetMs);nativeUnknown=true;}

    const enrichmentAbort=new AbortController(),enrichmentPending=new Set<Promise<unknown>>(),ownedAuthorities=new WeakSet<object>();
    let enrichmentRegistry:Awaited<ReturnType<typeof import('./apps-enrichment-native-runtime').createReviewedAppsEnrichmentRegistry>>|undefined,workerPool:import('pg').Pool|undefined,enrichmentControl:any,sourceSnapshot:string|undefined,protectedReceiptIssued=false,enrichmentState:EnrichmentGrant|undefined,workerClosed=false,workerOwner:ReturnType<typeof createAppsEnrichmentProvisioningOwner>|undefined;
    const nativeTokens=new Set<symbol>(),nativeTokenWaiters=new Set<()=>void>();
    const retainEnrichment=<T>(original:Promise<T>)=>{enrichmentPending.add(original);void original.then(()=>enrichmentPending.delete(original),()=>{enrichmentPending.delete(original);enrichmentAbort.abort();});return original;};
    async function enrichmentQuery(pool: import('pg').Pool, text: string, values: unknown[] = []) {
    nativeGuard();
    if (enrichmentAbort.signal.aborted)
        throw new Refusal();
    let client: import('pg').PoolClient | undefined, released = false, stopped = false;
    const stop = () => { stopped = true; enrichmentAbort.abort(); if (client && !released) {
        released = true;
        client.release(true);
    } };
    const timer = setTimeout(stop, 10000);
    enrichmentAbort.signal.addEventListener('abort', stop, { once: true });
    const original = (async () => { try {
        client = await pool.connect();
        if (stopped) {
            released = true;
            client.release(true);
            throw new Refusal();
        }
        const result = await client.query(text, values);
        if (stopped)
            throw new Refusal();
        nativeGuard();
        return result;
    }
    finally {
        clearTimeout(timer);
        enrichmentAbort.signal.removeEventListener('abort', stop);
        if (client && !released) {
            released = true;
            client.release();
        }
    } })();
    return retainEnrichment(original);
}
    async function prepareEnrichmentGrant(options: Options) {
    nativeGuard();
    if (!protectedReceiptIssued || !sourceSnapshot || !ownedAuthorities.has(options.ownedAuthority) || !enrichmentRegistry || workerPool)
        throw new Refusal();
    const contract = await import(pathToFileURL(path.join(root, 'scripts/replatform-e2e.mjs')).href);
    if (JSON.stringify(contract.snapshotSource(root)) !== sourceSnapshot)
        throw new Refusal();
    const proof = await enrichmentQuery(options.pool as any, 'SELECT current_database() AS database,session_user AS login');
    if (proof.rows[0]?.database !== options.ownedAuthority.database || proof.rows[0]?.login !== 'music_migrator' || !/^music_uat_[a-f0-9]{32}$/.test(options.ownedAuthority.database))
        throw new Refusal();
    const authority = options.ownedAuthority, attest = await import('./music-uat-database');
    const attested = attest.attestUatDatabaseAuthority({ MUSIC_UAT_DATABASE_ACK: attest.MUSIC_UAT_DATABASE_ACK, MUSIC_UAT_DATABASE_RUN_ID: authority.runId, MUSIC_UAT_DATABASE_NAME: authority.database, MUSIC_UAT_DATABASE_PORT: String(authority.port), MUSIC_UAT_DATABASE_CONTAINER_ID: authority.containerId, MUSIC_UAT_DATABASE_COMMIT: authority.commit }, authority.commit);
    if (!attested || attested.imageId !== authority.imageId || attested.contextHost !== authority.contextHost || attested.containerId !== authority.containerId)
        throw new Refusal();
    const login = 'apps_http_worker_' + authority.runId, password = randomBytes(32).toString('hex'), quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
    await enrichmentQuery(options.pool as any, 'CREATE ROLE ' + quote(login) + ' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT');
    const formatted = await enrichmentQuery(options.pool as any, "SELECT format('ALTER ROLE %I PASSWORD %L',$1,$2) AS command", [login, password]);
    await enrichmentQuery(options.pool as any, formatted.rows[0].command);
    await enrichmentQuery(options.pool as any, 'GRANT CONNECT ON DATABASE ' + quote(authority.database) + ' TO ' + quote(login));
    await enrichmentQuery(options.pool as any, 'GRANT app_enrichment_worker TO ' + quote(login));
    for (const source of enrichmentRegistry.workerSources)
        await enrichmentQuery(options.pool as any, 'INSERT INTO app_enrichment_source_approvals(source_id,source_identity,source_identity_hash,canonicalization_version,enabled,approval_revision,adapter_version,canonical_url,canonical_url_policy_version,allowed_fields,allowed_hosts,configuration_fingerprint,operational_configuration) VALUES($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)', [source.identity.sourceId, source.identity.sourceIdentity, source.identity.sourceIdentityHash, source.identity.canonicalizationVersion, source.approvalRevision, source.adapterVersion, source.canonicalUrl, source.canonicalUrlPolicyVersion, source.allowedFields, source.fetch.allowedHosts, source.configurationFingerprint, JSON.stringify(source.limits)]);
    // Reattest the exact native migrator before constructing the separate worker pool.
    nativeGuard();
    if (JSON.stringify(contract.snapshotSource(root)) !== sourceSnapshot || !ownedAuthorities.has(authority) || enrichmentAbort.signal.aborted)
        throw new Refusal();
    const beforePool = await enrichmentQuery(options.pool as any, 'SELECT current_database() AS database,session_user AS login');
    if (beforePool.rows[0]?.database !== authority.database || beforePool.rows[0]?.login !== 'music_migrator')
        throw new Refusal();
    const { default: pg } = await import('pg');nativeGuard();if(enrichmentAbort.signal.aborted)throw new Refusal();
    const nativeWorkerPool = new pg.Pool({ host: '127.0.0.1', port: authority.port, database: authority.database, user: login, password, max: 4, connectionTimeoutMillis: 2000, statement_timeout: 60000, options: '-c role=app_enrichment_worker -c lock_timeout=1000' });workerOwner=createAppsEnrichmentProvisioningOwner(nativeWorkerPool,enrichmentAbort);workerPool=workerOwner.pool;
    workerPool.on('error', () => { enrichmentAbort.abort(); latchUnknown('api-failure'); reportFailure(); });
    await retainEnrichment((await import('../server/db/app-enrichment-worker-role')).verifyAppEnrichmentWorkerLogin(workerPool, { loginRole: login, databaseName: authority.database }));
    const { createAppsEnrichmentQualificationLedger } = await import('../server/services/appEnrichmentQualificationLedger');
    const ledger = createAppsEnrichmentQualificationLedger(enrichmentRegistry.workerSources, { maxAttempts: 8, maxAdmittedBodyBytes: 16777216, maxDurationMs: 600000 }, { observeNativeLifecycle(event, token) { if (event === 'request-opened' || event === 'socket-opened')
            nativeTokens.add(token);
        else {
            nativeTokens.delete(token);
            if (!nativeTokens.size)
                for (const wake of nativeTokenWaiters)
                    wake();
        } } });
    const optionsSnapshot = JSON.stringify({ authority, runId: options.runId, commit: options.commit, personas: options.personas }), pool = options.pool, composed = options.composed, registry = enrichmentRegistry, worker = workerPool, poolMethods = [(pool as any).query, (pool as any).connect, (pool as any).end], workerMethods = [worker.query, worker.connect, worker.end], configSnapshot = JSON.stringify(options.config);
    let issued: ReturnType<typeof issueAppsEnrichmentProvisionGrant>;
    const state: EnrichmentGrant = { abort: () => enrichmentAbort.abort(), signal: enrichmentAbort.signal, pending: enrichmentPending, registry, adapters: registry.adapters, ledger, workerPool, runId: options.runId,
        assertCurrent() { try {
            nativeGuard();
        }
        catch {
            enrichmentAbort.abort();
            throw new Refusal();
        } if (workerPool !== worker || [worker.query, worker.connect, worker.end].some((method, index) => method !== workerMethods[index]) || [(pool as any).query, (pool as any).connect, (pool as any).end].some((method, index) => method !== poolMethods[index]) || JSON.stringify(options.config) !== configSnapshot || JSON.stringify(contract.snapshotSource(root)) !== sourceSnapshot || options.pool !== pool || options.composed !== composed || JSON.stringify({ authority, runId: options.runId, commit: options.commit, personas: options.personas }) !== optionsSnapshot || !ownedAuthorities.has(authority))
            throw new Refusal(); },
        query: (text, values) => enrichmentQuery(pool as any, text, values), trustedInstant: async () => { const result = await enrichmentQuery(pool as any, 'SELECT clock_timestamp() AS now'); return result.rows[0].now; },
        verifyAck: (admission, signal) => enrichmentControl ? enrichmentControl.verifyNativeAdmission(admission, signal) : Promise.resolve(false),
        async close() { enrichmentAbort.abort(); while (enrichmentPending.size) {
            const originals = [...enrichmentPending];
            await Promise.allSettled(originals);
        } if (nativeTokens.size) {
            await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => { nativeTokenWaiters.delete(done); reject(new Refusal()); }, 10000), done = () => { clearTimeout(timer); nativeTokenWaiters.delete(done); resolve(); }; nativeTokenWaiters.add(done); });
        } if (!workerClosed) {
            await workerPool!.end();
            workerClosed = true;
        } issued.closeAfterDrain(); }
    };
    Object.freeze(state);
    enrichmentState = state;
    issued = issueAppsEnrichmentProvisionGrant(options, authority, state);
    return issued.token;
}
    const activeDeadlines = new Map<unknown, {deadline:number;context:NativeContext;budgetMs:number}>();
    function nativeGuard() {
        for(const entry of activeDeadlines.values())if(performance.now()>=entry.deadline)latchUnknown('guard-expiry',entry.context,entry.budgetMs);
        if (nativeUnknown) throw new Refusal();
    }
    function nativeClock(): Clock {
        return { now: () => performance.now(), setTimeout(fn, ms) {
            const deadline = performance.now() + ms,context=readContext();
            const timer = setTimeout(() => { latchUnknown('clock-callback',context,ms); fn(); }, ms);
            activeDeadlines.set(timer,{deadline,context,budgetMs:ms}); return timer;
        }, clearTimeout(timer) {
            const entry = activeDeadlines.get(timer);
            if (entry !== undefined && performance.now() >= entry.deadline) latchUnknown('clock-late-clear',entry.context,entry.budgetMs);
            activeDeadlines.delete(timer); clearTimeout(timer as ReturnType<typeof setTimeout>);
        } };
    }
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
    async function fixedChild(executable: string, args: string[], environment: Record<string, string>, cwd: string, input?: string, capture = false, onStdout?: (bytes: Buffer) => void,onStderr?: (bytes:Buffer)=>void,onClose?:(value:{code:number|null;signal:string|null;stdioClosed:boolean})=>void,onError?:()=>void): Promise<Child & {
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
            child.once('error', () => { try{onError?.();}catch{} if (capture)
                recordCategory('spawn-error'); latchUnknown('child-error'); reject(new Refusal()); });
            child.stdout.on('data', (bytes: Buffer) => {
                try{onStdout?.(bytes);}catch{}
                if (capture) {
                    if (Buffer.byteLength(output) + bytes.length > 4096) {
                        overflow = true;
                        recordCategory('output-overflow');
                        latchUnknown('child-output-overflow');
                        child.kill();
                    }
                    else
                        output += bytes.toString('utf8');
                }
            });
            if(onStderr)child.stderr.on('data',(bytes:Buffer)=>{try{onStderr(bytes);}catch{}});else child.stderr.resume();
            child.once('close', (code, signal) => { const value={code:overflow?null:code,signal,stdioClosed:true};try{onClose?.(value);}catch{}resolve(value); });
        });
        closed.catch(() => undefined);
        const handle = { ready: Promise.resolve(), closed, async stop() { if (child.exitCode === null && child.signalCode === null)
                child.kill(); await closed; }, output: () => output };
        nativeChildren.add(handle);
        closed.then(() => nativeChildren.delete(handle), () => undefined);
        child.stdin.on('error', () => { latchUnknown('child-stdin'); });
        child.stdin.end(input);
        return handle;
    }
    async function fixedPowerShell(args: string[], input?: string) {
        nativeGuard();const context=readContext();
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
            const result = await Promise.race([child.closed, new Promise<never>((_, reject) => { timer = setTimeout(() => { recordCategory('deadline'); latchUnknown('powershell-deadline',context,10000); void child.stop().catch(() => undefined); reject(new Refusal()); }, 10000); })]);
            if (result.signal !== null) {
                recordCategory('signal');
                throw new Refusal();
            }
            if (result.code !== 0 || !result.stdioClosed) {
                recordCategory('nonzero');
                throw new Refusal();
            }
            nativeGuard(); return child.output().trim();
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
    async function inspect(target: string) { nativeGuard(); await canonical(target); nativeGuard(); try { const accepted=inspectAppsPrivateDescendant(target); nativeGuard(); if(accepted)return; await privateOperation('inspect', target); nativeGuard(); } catch(error) { latchUnknown('privacy-refusal'); throw error; } }
    let actualSupport: typeof import('./apps-browser-support') | undefined;
    const configurations = new WeakMap<object, any>(), nativeAccounts = new WeakMap<object, string[]>(), handlerDrains = new WeakMap<object, (ms: number) => Promise<boolean>>(),handlerCounts=new WeakMap<object,()=>number>();
    let drainOptions:Options|undefined,drainPhase:RequestDrainPending['phase']|undefined,drainCounter:(()=>number)|undefined;
    function readRequestDrainPending():RequestDrainPending|undefined{if(!drainOptions||!drainPhase||!drainCounter)return undefined;const handlers=drainCounter();if(!Number.isSafeInteger(handlers)||handlers<0||handlers>128)return undefined;const evidence=extractAppsRequestDrainSnapshot(drainOptions);return Object.freeze({phase:drainPhase,handlers,...(evidence?{evidence}:{})});}
    registerDrainPending(readRequestDrainPending);
    async function support() { return actualSupport ??= await import('./apps-browser-support'); }
    async function outputNames() { const { APPS_CASES: manualCases } = await support();const APPS_CASES=family==='apps-enrichment'?(await import('./apps-enrichment-browser-support')).APPS_ENRICHMENT_CASES:manualCases; const sanitize = (value: string) => value.replace(/[\x00-\x2c\x2e-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g, '-'); const trim = (value: string) => { if (value.length <= 60)
        return value; const middle = '-' + createHash('sha1').update(value).digest('hex').slice(0, 5) + '-', start = Math.floor((60 - middle.length) / 2); return value.slice(0, start) + middle + value.slice(-(60 - middle.length - start)); }; return APPS_CASES.flatMap(title => ['apps-desktop', 'apps-mobile'].map(project => trim((family==='apps-enrichment'?'apps-enrichment-':'apps-') + sanitize(title)) + '-' + sanitize(project))); }
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
        if (names.length > (family==='apps-enrichment'?5:9) || names.some(name => !allowed.has(name)))
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
        child.closed.catch(() => { latchUnknown('capture-rejection'); });
        return child;
    }
    async function exactUnlink(target: string, optional = false) { nativeGuard(); const fs = await import('node:fs/promises'); nativeGuard(); try {
        await fs.lstat(target);
        nativeGuard();
    }
    catch (error) {
        if (optional && (error as any).code === 'ENOENT')
            return;
        throw error;
    } if (!retained.has(target))
        throw new Refusal(); await inspect(target); nativeGuard(); await same(target, false); nativeGuard(); await fs.unlink(target); nativeGuard(); retained.delete(target); }
    async function emptyDirectory(target: string, optional = false) { nativeGuard(); const fs = await import('node:fs/promises'); nativeGuard(); try {
        await fs.lstat(target);
        nativeGuard();
    }
    catch (error) {
        if (optional && (error as any).code === 'ENOENT')
            return;
        throw error;
    } if (!retained.has(target))
        throw new Refusal(); await inspect(target); nativeGuard(); await same(target, true); nativeGuard(); const names = await fs.readdir(target); nativeGuard(); if (names.length)
        throw new Refusal(); await fs.rmdir(target); nativeGuard(); retained.delete(target); }
    return { platform: process.platform, argv: process.argv.slice(2), environment: process.env, temporaryRoot, clock: nativeClock(), randomHex: n => randomBytes(n).toString('hex'), installSignals(callback) { process.on('SIGINT', callback); process.on('SIGTERM', callback); return () => { process.removeListener('SIGINT', callback); process.removeListener('SIGTERM', callback); }; },
        async preflight() {
            const fs = await import('node:fs/promises');
            for (const file of [process.execPath, helper, cli, viteCli, path.join(frontend, family==='apps-enrichment'?'e2e/replatform/apps-enrichment.playwright.config.ts':'e2e/replatform/apps.playwright.config.ts'), path.join(frontend, 'e2e/replatform/profile.vite.config.ts'), path.join(frontend, family==='apps-enrichment'?'e2e/replatform/apps-enrichment.spec.ts':'e2e/replatform/apps.spec.ts')]) {
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
            const source = contract.snapshotSource(root);if(family==='apps-enrichment')sourceSnapshot=JSON.stringify(source);
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
        async createReceipt(argv) { const { extractProtectedReceiptArguments, createProtectedReceipt } = await import('./protected-browser-receipt'); const receipt = await createProtectedReceipt(root, family, extractProtectedReceiptArguments(argv)); if (!receipt)
            throw new Refusal();if(family==='apps-enrichment')protectedReceiptIssued=true; return { ...receipt, async arguments(args: string[], directory: string) { const result = receipt.arguments(args, directory); const target = path.join(directory, 'protected.playwright.config.mjs'); await inspect(target); await remember(target, false); return result; } } as Receipt; },
        async createDirectory(target) { try {
            await canonical(path.dirname(target));
            await privateOperation('create-directory', target);
            await canonical(target);
            await privateOperation('inspect', target);
            if(process.platform==='win32')registerAppsPrivateDirectory(target);
            return await remember(target, true);
        }
        catch {
            latchUnknown('directory-create');
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
            latchUnknown('secret-create');
            throw new Refusal();
        } },
        async prepareDatabase(input) { nativeGuard(); const { prepareOwnedUatDatabaseAcquisition } = await import('./music-uat-database'); nativeGuard(); const acquisition=await prepareOwnedUatDatabaseAcquisition({ runId: input.runId, database: `music_uat_${input.runId}`, commit: input.commit, port: input.port, passwordFile: input.secret.path }); nativeGuard(); return {...acquisition,async create(){nativeGuard();const result=await acquisition.create();nativeGuard();if(family==='apps-enrichment')ownedAuthorities.add(result);return result;},async dispose(drop){nativeGuard();await acquisition.dispose(async authority=>{nativeGuard();await drop(authority);nativeGuard();});nativeGuard();}}; }, async createPool(authority, secret) { const { readSecureMusicSecretFile } = await import('../server/config/secure-music-secret-file'); const password = await readSecureMusicSecretFile(secret.path, { mode: 'fixture' }); const { default: pg } = await import('pg'); return new pg.Pool({ host: '127.0.0.1', user: 'music_migrator', password, database: authority.database, port: authority.port, max: 4, connectionTimeoutMillis: 3000, statement_timeout: 10000, options: '-c lock_timeout=5000' }) as unknown as Pool; },
        async migrate(pool) { const { migrateMusicDatabase } = await import('../server/db/migrate'); await migrateMusicDatabase(pool as any); },
        async seedAuth(pool, runId) { const result = {} as {
            ownerA: Persona;
            ownerB: Persona;
        }; for (const key of ['ownerA', 'ownerB'] as const) {
            const userId = family==='apps-enrichment'?randomUUID():`apps-e2e-${randomUUID()}`;
            await pool.query({ text: 'INSERT INTO auth_user(id,name,email) VALUES ($1,$2,$3)', values: [userId, key, `${userId}@example.invalid`] });
            await pool.query({ text: "INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())", values: [randomUUID(), `google-${userId}`, userId] });
            result[key] = { userId, handle: `apps${key.toLowerCase()}${runId.slice(0, 4)}`, cookie: '' };
        } return result; },
        async ensureInitialAccount(pool, userId) { const { ensureInitialAccount } = await import('../server/auth/initialAccount'); return ensureInitialAccount(pool as any, userId); },
        async createConfig(origin) { const { resolveExplorersAuthConfig } = await import('../server/auth/betterAuth'); return resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: origin, EXPLORERS_AUTH_SECRET: randomBytes(32).toString('hex'), GOOGLE_CLIENT_ID: 'apps-fixture-google', GOOGLE_CLIENT_SECRET: 'apps-fixture-secret' }); },
        async createComposition(pool, config, directory, binding) { if(family==='apps-enrichment')enrichmentRegistry=await (await import('./apps-enrichment-native-runtime')).createReviewedAppsEnrichmentRegistry(()=>{enrichmentAbort.abort();latchUnknown('api-failure');reportFailure();});const pair = family==='apps-enrichment'?await (await support()).createAppsEnrichmentFixtureComposition(pool as any,config,directory,{...binding,registry:enrichmentRegistry} as any):await (await support()).createAppsFixtureComposition(pool as any, config, directory, binding as any); configurations.set(pair.composed, config); nativeAccounts.set(pair.composed, Object.values(binding.personasWithActualAccountIds).map(person => person.accountId!)); return pair; },
        async startApi(options,getControl){
            const {createServer}=await import('node:http');const binding=await support();
            const handlers=new Set<Promise<unknown>>(),sockets=new Set<import('node:net').Socket>();
            const fail=()=>{
                latchUnknown('api-failure');
                try{binding.sealAppsFixtureRequests(options as unknown as AppsControlOptions);}catch{}
                try{reportFailure();}catch{}
            };
            const respond=(res:import('node:http').ServerResponse,status:number)=>{
                if(res.headersSent||res.writableEnded||res.destroyed)return;
                try{res.statusCode=status;res.setHeader('Cache-Control','no-store');res.end();}
                catch{fail();try{res.destroy();}catch{}}
            };
            handlerCounts.set(options.composed,()=>handlers.size);
            handlerDrains.set(options.composed,async(ms)=>{
                if(!handlers.size)return true;let timer:ReturnType<typeof setTimeout>;
                try{return await Promise.race([Promise.all([...handlers]).then(()=>handlers.size===0),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),ms);})]);}
                catch{return false;}finally{clearTimeout(timer!);}
            });
            const server=createServer((req,res)=>{
                const original=(async()=>{
                    if(!binding.admitAppsFixtureRequest(options as unknown as AppsControlOptions,req,res)){respond(res,503);return;}
                    const control=getControl();if(control&&await control.handle(req,res))return;if(family==='apps-enrichment'&&control)await control.observeNativeAck(req,res);
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
        async createControl(options) {if(family==='apps-enrichment'){try{const token=await prepareEnrichmentGrant(options);enrichmentControl=await (await support()).createAppsEnrichmentControl(options as unknown as AppsControlOptions,token);return enrichmentControl;}catch{if(workerOwner){const physicalClose=workerOwner.close();while(enrichmentPending.size)await Promise.allSettled([...enrichmentPending]);await physicalClose;workerClosed=true;}throw new Refusal();}}return (await support()).createAppsControl(options as unknown as AppsControlOptions,undefined,nativeGuard); },
        async writeDescriptor(directory, value) { await same(directory.path, true); await inspect(directory.path); const target = path.join(directory.path, 'sessions.json'), text = JSON.stringify(value); if (Buffer.byteLength(text) > 65536)
            throw new Refusal(); try {
            await privateOperation('create-file', target, text);
        }
        catch {
            latchUnknown('descriptor-create');
            throw new Refusal();
        } await inspect(target); return remember(target, false); },
        async launchVite(options, read) {
            let advertised!:()=>void,text='',witness=false,outputOverflow=false,httpReady=false,probeOutcome:AppsViteDiagnostic['probeOutcome']='none';
            let childCode:number|null=null,childSignal:AppsViteDiagnostic['childSignal']='none',stdioClosed=false;
            let stderr:AppsViteDiagnostic['stderr']='unknown',stderrBytes=0,stderrOverflow=false,stderrText='';
            let first:AppsViteDiagnostic|undefined;
            const capture=(origin:AppsViteDiagnostic['origin'])=>first??=Object.freeze({origin,childCode,childSignal,stdioClosed,advertised:witness,httpReady,probeOutcome,stderr,stderrBytes,stderrOverflow});
            // This reader freezes only at the existing fixture failure boundary. It adds no clock or wait.
            registerViteDiagnostic(()=>httpReady&&!first?undefined:capture(witness?'probe-budget':'advertisement-budget'));
            const advertisement=new Promise<void>(resolve=>{advertised=resolve;});
            let child:Awaited<ReturnType<typeof fixedChild>>;
            try{child=await fixedChild(process.execPath,[viteCli,'--config','e2e/replatform/profile.vite.config.ts'],{...env(),PROFILE_E2E_WEB_PORT:new URL(options.origin).port,PROFILE_E2E_API_PORT:new URL(options.apiOrigin).port,PROFILE_E2E_LOCAL_AUTHORITY:'owned-disposable-pg15'},frontend,undefined,false,bytes=>{
                if(witness||outputOverflow)return;
                if(Buffer.byteLength(text)+bytes.length>4096){outputOverflow=true;capture('output-overflow');latchUnknown('vite-output-overflow');return;}
                text+=bytes.toString('utf8');const plain=text.replace(/\x1b\[[0-9;]*m/g,'');
                if(plain.split(/\r?\n/).some(line=>line.includes('Local:')&&line.trimEnd().endsWith(options.origin+'/'))){witness=true;advertised();}
            },bytes=>{
                if(first)return;const remaining=4096-stderrBytes;stderrOverflow||=bytes.length>remaining;const bounded=bytes.subarray(0,remaining);stderrBytes+=bounded.length;
                stderrText+=bounded.toString('utf8');if(stderr==='unknown'){
                    if(/port[^\r\n]{0,80}already in use|EADDRINUSE/i.test(stderrText))stderr='port-in-use';
                    else if(/failed to load config/i.test(stderrText))stderr='config-load';
                    else if(/cannot find (?:module|package)|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/i.test(stderrText))stderr='module-not-found';
                }
            },result=>{
                if(httpReady||first)return;childCode=Number.isSafeInteger(result.code)&&result.code!>=-2147483648&&result.code!<=2147483647?result.code:null;
                childSignal=result.signal===null?'none':result.signal==='SIGTERM'||result.signal==='SIGKILL'?result.signal:'other';stdioClosed=result.stdioClosed===true;capture('closed-before-ready');
            },()=>{if(!httpReady)capture('launch');});}catch{capture('launch');throw new Refusal();}
            child.ready=Promise.race([child.closed.then(()=>{if(!httpReady)capture('closed-before-ready');throw new Refusal();}),(async()=>{
                await advertisement;const end=performance.now()+60000;while(true){
                    let probeSignal:AbortSignal|undefined,bodyRefused=false;
                    try{
                        probeSignal=AbortSignal.timeout(1000);const response=await fetch(options.origin,{redirect:'error',signal:probeSignal});
                        try{await read(response,4096);}catch{bodyRefused=true;probeOutcome='body-refused';throw new Refusal();}
                        if(response.status===200){probeOutcome='http200';httpReady=true;return;}probeOutcome='non200';
                    }catch{if(!bodyRefused)probeOutcome=probeSignal?.aborted?'transport-timeout':'unknown';}
                    if(performance.now()>=end){capture('probe-budget');throw new Refusal();}
                    await new Promise(resolve=>setTimeout(resolve,250));
                }
            })()]);child.ready.catch(()=>undefined);return child;
        }, launchDiscovery: (context, options) => nativeChild(context, options, true),
        async openReport(directory, execution) { const file = path.join(directory.path, execution ? 'protected-execution.json' : 'protected-discovery.json'); const fs = await same(file, false); await inspect(file); const { constants } = await import('node:fs'); const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW); const identity = (stat: import('node:fs').BigIntStats) => [stat.dev, stat.ino, stat.mode, stat.uid, stat.size, stat.mtimeNs, stat.ctimeNs, stat.nlink].map(String).join(':'); const original = retained.get(file)!; const expected = [original.dev, original.ino, original.mode, original.uid, original.size, original.mtimeNs, original.ctimeNs, original.nlink].map(String).join(':'); return { async stat() { const stat = await handle.stat({ bigint: true }); if (identity(stat) !== expected || !stat.isFile())
                throw new Refusal(); return { identity: identity(stat), size: Number(stat.size), regular: stat.isFile() }; }, async read(buffer, offset, length, position) { return (await handle.read(buffer, offset, length, position)).bytesRead; }, async verify() { await same(file, false); await inspect(file); }, async close() { await handle.close(); } }; },
        launchBrowser: (context, options) => nativeChild(context, options),
        sealRequests(options) { if (!actualSupport)
            throw new Refusal(); actualSupport.sealAppsFixtureRequests(options as any); },
        async drainRequests(options, ms) {drainOptions=options;drainPhase='handler-wait';drainCounter=handlerCounts.get(options.composed);readRequestDrainPending();const began=performance.now(),drain=handlerDrains.get(options.composed);
            if(nativeUnknown){reportDrain('native-unknown-before');throw new Refusal();}
            if(!drain){reportDrain('ledger-missing');throw new Refusal();}
            let handlerSettled;try{handlerSettled=await drain(ms);}catch{reportDrain('handler-drain');throw new Refusal();}if(!handlerSettled){reportDrain('handler-drain');throw new Refusal();}
            const remaining=Math.floor(ms-(performance.now()-began));if(remaining<1){reportDrain('remaining-budget');throw new Refusal();}
            drainPhase='canonical-wait';readRequestDrainPending();let result;try{result=await(await support()).drainAppsFixtureRequests(options as unknown as AppsControlOptions,remaining);}catch{reportDrain('support-drain');throw new Refusal();}
            if(nativeUnknown){reportDrain('native-unknown-after');throw new Refusal();}return result;
        },
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
            nativeGuard();
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
            nativeGuard();
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
                const names = await outputNames();
                for (const name of names)
                    await emptyDirectory(path.join(output, name), true);
                await emptyDirectory(output);
            }
            await same(options.disposableDirectory, true);
            await inspect(options.disposableDirectory);
            const remainingNames=await fs.readdir(options.disposableDirectory); nativeGuard();
            if (remainingNames.length)
                throw new Refusal();
        },
        async createAdminPool(authority, secret) { if (nativeUnknown || nativeChildren.size)
            throw new Refusal(); nativeGuard(); const { readSecureMusicSecretFile } = await import('../server/config/secure-music-secret-file'); nativeGuard(); const password = await readSecureMusicSecretFile(secret.path, { mode: 'fixture' }); nativeGuard(); const { default: pg } = await import('pg'); nativeGuard(); const admin=new pg.Pool({ host: '127.0.0.1', port: authority.port, user: 'music_migrator', password, database: 'postgres', max: 1, connectionTimeoutMillis: 3000, statement_timeout: 10000, options: '-c lock_timeout=5000' }); return {async query(input){nativeGuard();const result=await admin.query(input as any);nativeGuard();return result;},async end(){nativeGuard();await admin.end();nativeGuard();}} as Pool; }, async cleanupSecret(secret) { if (nativeUnknown || nativeChildren.size)
            throw new Refusal(); nativeGuard(); const { cleanupFixtureMusicTokenSecret } = await import('./music-fixture-secret'); nativeGuard(); cleanupFixtureMusicTokenSecret(root, secret.path); nativeGuard(); },
        async removeRoot(directory) { if (nativeUnknown || nativeChildren.size)
            throw new Refusal(); await same(directory.path, true); await emptyDirectory(directory.path); },
    };
}
