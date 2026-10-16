import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { Pool } from 'pg';
import type { createCanonicalApp } from '../server/auth/canonicalApp';
import type { ExplorersAuthConfig } from '../server/auth/betterAuth';
import type { LocalObjectStorage } from '../server/services/objectStorage';
import type { startGuidesControl } from './guides-browser-support';
import { GUIDES_CASES, GUIDES_PROJECTS, guidesManifestSchema, buildGuidesSeedPlan } from './guides-browser-support';
import { guideCollectionDetailsSchema, guideSectionDtoSchema, guideSectionBlocksSchema } from '../shared/explorersGuideContract';
import { accountDtoSchema } from '../shared/explorersContract';
import { createGuidesProviderFixture, GuidesProviderFixtureError } from './guides-provider-fixture';

type Clock = { now(): number; setTimeout(callback: () => void, ms: number): unknown; clearTimeout(timer: unknown): void };
type Stream = { read(): Promise<Buffer | null>; write(bytes: Buffer): Promise<void>; close(): Promise<void> };
type Composed = ReturnType<typeof createCanonicalApp>;
type Storage = LocalObjectStorage;
type Dependencies = {
  platform: string; argv: readonly string[]; environment: Readonly<Record<string, string | undefined>>;
  clock: Clock; randomHex(bytes: number): string; connectPipe(pipe: string): Promise<Stream>;
  createPool(configuration: { host: string; user: string; password: string; database: string; port: number; max: number; connectionTimeoutMillis: number; statement_timeout: number; lock_timeout: number }): Promise<Pool>;
  migrate(pool: Pool): Promise<unknown>;
  resolveConfig(environment: Record<string, string>): Promise<ExplorersAuthConfig>;
  createStorage(directory: string): Promise<Storage>;
  compose(pool: Pool, config: ExplorersAuthConfig, options: { mediaStorage: Storage }): Promise<Composed>;
  listen(composed: Composed, port: number, host: '127.0.0.1', provider: ReturnType<typeof createGuidesProviderFixture>): Promise<{ failed: Promise<never> }>;
  startControl(options: Parameters<typeof startGuidesControl>[0]): ReturnType<typeof startGuidesControl>;
  fetch: typeof globalThis.fetch;
};
type Frame = { v: 1; seq: number; id: string; type: string; payload: Record<string, unknown> };
type Phase = 'bootstrap' | 'reset' | 'observe' | 'execution' | 'retirement';
type Code = 'failed' | 'timeout' | 'protocol' | 'unsettled';
const owners = ['ownerA', 'ownerB', 'ownerC'] as const;
const cleanupLabels = ['listener', 'drain', 'authority', 'custody', 'storage'] as const;
type Cleanup = { code: 'GUIDES_CONTROL_CLEANUP_FAILED'; unsettled: boolean; failures: typeof cleanupLabels[number][] };
class Failure extends Error { constructor(readonly code: Code) { super(`Guides worker ${code}`); } }
const hex = (length: number) => z.string().regex(new RegExp(`^[a-f0-9]{${length}}$`));
const nat = z.number().int().nonnegative().safe(), positive = nat.refine(value => value > 0);
const text = (maximum: number) => z.string().refine(value => Buffer.byteLength(value) <= maximum && !/[\x00-\x1f\x7f]/.test(value));
const uuid = z.string().uuid().refine(value => value === value.toLowerCase());
const identitySchema = z.object({ caseId: z.enum(GUIDES_CASES), project: z.enum(GUIDES_PROJECTS), repeat: z.literal(0) }).strict();
const personaSchema = z.object({ userId: text(200).refine(value => value.length > 0).refine(value => value.trim() === value), handle: z.string().regex(/^[a-z][a-z0-9-]{2,29}$/).refine(value => !value.includes('--') && !value.endsWith('-')) }).strict();
const three = <T extends z.ZodTypeAny>(schema: T) => z.object({ ownerA: schema, ownerB: schema, ownerC: schema }).strict();
const port = z.number().int().min(1024).max(65535);
const authoritySchema = z.object({ runId: hex(32), commit: hex(40), database: text(100), port: port.min(56000).max(60999), owned: z.literal(true), containerId: hex(64), imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/), contextHost: text(1024).refine(value => value.length > 0) }).strict();
const initSchema = z.object({ runId: hex(32), commit: hex(40), epoch: z.number().int().min(1).max(16), identity: identitySchema, authority: authoritySchema,
  disposableDirectory: text(4096), storageDirectory: text(4096), origin: text(200), personas: three(personaSchema), databasePassword: text(256).refine(value => value.length > 0), authSecret: text(256).refine(value => value.length > 0),
  apiPort: port, controlPort: port, initializeDatabase: z.boolean(), remainingLaneMs: z.number().int().min(1).max(21600000) }).strict();
type Init = z.infer<typeof initSchema>;
const dtoBaseline = z.object({ id: uuid, revision: positive, displayName: z.string().nullable(), handle: z.string().nullable() });
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new Failure('protocol');
}
// Check duplicate object members before JSON.parse can erase them, at every depth.
function parseJson(input: string): unknown {
  let offset = 0;
  const space = () => { while (offset < input.length && /[\x20\t\r\n]/.test(input[offset])) offset++; };
  const string = (): string => { const start = offset++; while (offset < input.length) { const c = input[offset++]; if (c === '\\') { offset++; continue; } if (c === '"') return JSON.parse(input.slice(start, offset)); } throw new Failure('protocol'); };
  const value = (depth: number): void => { if (depth > 100) throw new Failure('protocol'); space(); const c = input[offset];
    if (c === '{') { offset++; space(); const keys = new Set<string>(); if (input[offset] === '}') { offset++; return; }
      while (true) { space(); if (input[offset] !== '"') throw new Failure('protocol'); const key = string(); if (keys.has(key)) throw new Failure('protocol'); keys.add(key); space(); if (input[offset++] !== ':') throw new Failure('protocol'); value(depth + 1); space(); const end = input[offset++]; if (end === '}') return; if (end !== ',') throw new Failure('protocol'); } }
    if (c === '[') { offset++; space(); if (input[offset] === ']') { offset++; return; } while (true) { value(depth + 1); space(); const end = input[offset++]; if (end === ']') return; if (end !== ',') throw new Failure('protocol'); } }
    if (c === '"') { string(); return; } const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(input.slice(offset)); if (!match) throw new Failure('protocol'); offset += match[0].length;
  };
  value(0); space(); if (offset !== input.length) throw new Failure('protocol'); return JSON.parse(input);
}
function validateInit(value: unknown, epoch: number, pipe: string): Init {
  const init = initSchema.parse(value);
  if (init.epoch !== epoch || init.initializeDatabase !== (epoch === 1) || init.authority.runId !== init.runId || init.authority.commit !== init.commit || init.authority.database !== `music_uat_${init.runId}` || !pipe.startsWith(`\\\\.\\pipe\\explorers-guides-${init.runId}-`)) throw new Failure('protocol');
  const canonical = (value: string) => /^[A-Za-z]:\\/.test(value) && !value.includes('/') && !value.slice(2).includes(':') && path.win32.normalize(value) === value && value.slice(3).split('\\').every(part => part.length > 0 && !/[. ]$/.test(part));
  if (!canonical(init.disposableDirectory) || !canonical(init.storageDirectory) || !/^explorers-profile-e2e-[A-Za-z0-9]+$/.test(path.win32.basename(init.disposableDirectory)) || init.storageDirectory !== path.win32.join(init.disposableDirectory, 'owned-media')) throw new Failure('protocol');
  const origin = new URL(init.origin); const originPort = Number(origin.port);
  if (init.origin !== `http://127.0.0.1:${originPort}` || !port.safeParse(originPort).success || new Set([originPort, init.apiPort, init.controlPort, init.authority.port]).size !== 4) throw new Failure('protocol');
  for (const key of ['userId', 'handle'] as const) if (new Set(owners.map(owner => init.personas[owner][key])).size !== 3) throw new Failure('protocol');
  return init;
}
function cleanupMetadata(error: unknown): Cleanup | null {
  if (!(error instanceof Error) || error.name !== 'GuidesControlCleanupError') return null;
  const value = error as Error & Partial<Cleanup>;
  if (Object.keys(value).sort().join(',') !== ['code', 'failures', 'name', 'unsettled'].sort().join(',') || value.code !== 'GUIDES_CONTROL_CLEANUP_FAILED' || typeof value.unsettled !== 'boolean' || !Array.isArray(value.failures)) throw new Failure('protocol');
  let index = -1; for (const label of value.failures) { const next = cleanupLabels.indexOf(label); if (next <= index) throw new Failure('protocol'); index = next; }
  return { code: value.code, unsettled: value.unsettled, failures: [...value.failures] };
}
function defaultDependencies(): Dependencies {
  return {
    platform: process.platform, argv: process.argv.slice(2), environment: process.env,
    clock: { now: () => performance.now(), setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>) },
    randomHex: bytes => randomBytes(bytes).toString('hex'),
    async connectPipe(pipe) {
      const { createConnection } = await import('node:net');
      const socket = createConnection(pipe); const chunks: Buffer[] = []; let ended = false, failure: Error | undefined, queued = 0, wake: (() => void) | undefined;
      socket.on('data', bytes => { queued += bytes.length; if (queued > 9 * 1024 * 1024 + 4) { failure = new Failure('protocol'); socket.destroy(); } else chunks.push(bytes); wake?.(); });
      socket.on('error', error => { failure = error; wake?.(); }); socket.on('end', () => { ended = true; wake?.(); }); socket.on('close', () => { ended = true; wake?.(); });
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
      return { async read() { while (!chunks.length && !ended && !failure) await new Promise<void>(resolve => { wake = resolve; }); wake = undefined; if (failure) throw failure; const chunk = chunks.shift(); if (chunk) queued -= chunk.length; return chunk ?? null; },
        write(bytes) { return new Promise<void>((resolve, reject) => socket.write(bytes, error => error ? reject(error) : resolve())); }, async close() { socket.destroy(); } };
    },
    async createPool(configuration) { const { default: pg } = await import('pg'); return new pg.Pool(configuration); },
    async migrate(pool) { return (await import('../server/db/migrate')).migrateMusicDatabase(pool); },
    async resolveConfig(environment) { return (await import('../server/auth/betterAuth')).resolveExplorersAuthConfig(environment); },
    async createStorage(directory) { const { LocalObjectStorage } = await import('../server/services/objectStorage'); return new LocalObjectStorage(directory); },
    async compose(pool, config, options) { return (await import('../server/auth/canonicalApp')).createCanonicalApp(pool, config, options); },
    async listen(composed, port, host, provider) {
      const { createServer } = await import('node:http');
      let rejectFailure!: (error: unknown) => void;
      const failed = new Promise<never>((_, reject) => { rejectFailure = reject; }); failed.catch(() => undefined);
      await new Promise<void>((resolve, reject) => { const server = createServer((request, response) => {
        if (!provider.handle(request, response)) composed.app(request, response);
      }).listen(port, host, resolve);
        server.on('error', error => { rejectFailure(error); reject(error); }); server.on('close', () => rejectFailure(new Failure('failed'))); });
      return { failed };
    },
    async startControl(options) { return (await import('./guides-browser-support')).startGuidesControl(options); },
    fetch: globalThis.fetch,
  };
}

/** Fixed private worker. It stays alive until the root terminates its retained process. */
export async function runGuidesResourceWorker(dependencies?: Dependencies): Promise<void> {
  const d = dependencies ?? defaultDependencies();
  exact(d, ['platform', 'argv', 'environment', 'clock', 'randomHex', 'connectPipe', 'createPool', 'migrate', 'resolveConfig', 'createStorage', 'compose', 'listen', 'startControl', 'fetch']);
  exact(d.clock, ['now', 'setTimeout', 'clearTimeout']);
  for (const key of ['randomHex', 'connectPipe', 'createPool', 'migrate', 'resolveConfig', 'createStorage', 'compose', 'listen', 'startControl', 'fetch'] as const) if (typeof d[key] !== 'function') throw new Failure('protocol');
  if (!d.clock || ['now', 'setTimeout', 'clearTimeout'].some(key => typeof Reflect.get(d.clock, key) !== 'function') || d.platform !== 'win32' || !Array.isArray(d.argv) || d.argv.length || !d.environment || typeof d.environment !== 'object') throw new Failure('protocol');
  const pipe = d.environment.GUIDES_PRIVATE_PIPE, token = d.environment.GUIDES_PRIVATE_TOKEN, rawEpoch = d.environment.GUIDES_PRIVATE_EPOCH;
  for (const key of Object.keys(d.environment)) if (/^GUIDES_PRIVATE_/i.test(key) && !['GUIDES_PRIVATE_PIPE', 'GUIDES_PRIVATE_TOKEN', 'GUIDES_PRIVATE_EPOCH'].includes(key)) throw new Failure('protocol');
  if (typeof pipe !== 'string' || !/^\\\\\.\\pipe\\explorers-guides-[a-f0-9]{32}-[a-f0-9]{32}$/.test(pipe) || !hex(64).safeParse(token).success || typeof rawEpoch !== 'string' || !/^(?:[1-9]|1[0-6])$/.test(rawEpoch)) throw new Failure('protocol');
  for (const [key, value] of Object.entries(d.environment)) if (value !== undefined && (/^(?:DATABASE_URL(?:_TEST)?|DOCKER_HOST|DOCKER_CONTEXT|NODE_CHANNEL_FD|NODE_OPTIONS|GATE_PROD|MUSIC_DEPLOY_PRODUCTION|MUSIC_C10_STANDALONE_POSTGRES_ACK|(?:PROFILE|AUTH|LIFECYCLE|PLACES|PLACE_LINKS|GUIDES)_E2E_.*)$/.test(key) || key === 'NODE_ENV' && value === 'production')) throw new Failure('protocol');
  const epoch = Number(rawEpoch); let stream: Stream | undefined, phase: Phase = 'bootstrap', terminal = false, failure: Failure | undefined;
  let laneDeadline = d.clock.now() + 60000, incoming = 0, outgoing = 0, bytes = Buffer.alloc(0), active = false, busy = false, pendingEffects = 0;
  let rejectTerminal!: (error: unknown) => void;
  const failed = new Promise<never>((_, reject) => { rejectTerminal = reject; }); failed.catch(() => undefined);
  const fail = (error: unknown) => { if (!terminal) { terminal = true; if (error instanceof GuidesProviderFixtureError) error = new Failure(error.code); failure = error instanceof Failure ? error.code === 'timeout' && pendingEffects ? new Failure('unsettled') : error : new Failure('failed'); rejectTerminal(failure); } };
  const check = () => { if (terminal) throw failure!; if (d.clock.now() >= laneDeadline) { fail(new Failure('timeout')); throw failure!; } };
  const bounded = <T>(deadline: number, operation: () => Promise<T>, unsettled = false, ignoreLatch = false): Promise<T> => {
    const ms = Math.floor(deadline - d.clock.now()); if (ms < 1) return Promise.reject(new Failure(unsettled ? 'unsettled' : 'timeout'));
    return new Promise<T>((resolve, reject) => { const timer = d.clock.setTimeout(() => { const error = new Failure(unsettled ? 'unsettled' : 'timeout'); if (!ignoreLatch) fail(error); reject(error); }, ms);
      let promise: Promise<T>; try { if (!ignoreLatch) check(); promise = operation(); } catch (error) { d.clock.clearTimeout(timer); reject(error); return; }
      Promise.resolve(promise).then(value => { if (!ignoreLatch) check(); resolve(value); }, reject).catch(reject).finally(() => d.clock.clearTimeout(timer));
    });
  };
  const rawWrite = (value: unknown, deadline: number, ignoreLatch = false) => { const body = Buffer.from(JSON.stringify(value)); if (body.length > 9 * 1024 * 1024) throw new Failure('protocol'); const header = Buffer.alloc(4); header.writeUInt32BE(body.length); return bounded(Math.min(deadline, d.clock.now() + 5000), () => stream!.write(Buffer.concat([header, body])), false, ignoreLatch); };
  const send = (type: string, payload: Record<string, unknown>, id: string, ignoreLatch = false) => { hex(32).parse(id); if (++outgoing > 4096) throw new Failure('protocol'); return rawWrite({ v: 1, seq: outgoing, id, type, payload }, ignoreLatch ? d.clock.now() + 5000 : laneDeadline, ignoreLatch); };
  const receive = async (deadline = laneDeadline): Promise<Frame> => {
    let frameDeadline = bytes.length ? Math.min(deadline, d.clock.now() + 5000) : deadline;
    while (true) { check(); if (bytes.length >= 4) { const size = bytes.readUInt32BE(); if (size < 1 || size > 9 * 1024 * 1024) throw new Failure('protocol');
      if (bytes.length >= size + 4) { const body = bytes.subarray(4, size + 4); bytes = bytes.subarray(size + 4); let frame: unknown;
        try { frame = parseJson(new TextDecoder('utf-8', { fatal: true }).decode(body)); } catch { throw new Failure('protocol'); } exact(frame, ['v', 'seq', 'id', 'type', 'payload']);
        if (frame.v !== 1 || frame.seq !== ++incoming || incoming > 4096 || typeof frame.type !== 'string' || body.length > 65536) throw new Failure('protocol'); hex(32).parse(frame.id); if (!frame.payload || typeof frame.payload !== 'object' || Array.isArray(frame.payload)) throw new Failure('protocol'); return frame as Frame; } }
      const chunk = await bounded(frameDeadline, () => stream!.read()); if (!chunk || !chunk.length || bytes.length + chunk.length > 9 * 1024 * 1024 + 4) throw new Failure('protocol'); if (!bytes.length) frameDeadline = Math.min(deadline, d.clock.now() + 5000); bytes = Buffer.concat([bytes, chunk]);
    }
  };
  let lastId = d.randomHex(16), cleanup: Cleanup | null = null, laneTimer: unknown;
  let provider: ReturnType<typeof createGuidesProviderFixture> | undefined;
  const inheritDeadline = (remaining: number) => { laneDeadline = Math.min(laneDeadline, d.clock.now() + remaining); d.clock.clearTimeout(laneTimer); laneTimer = d.clock.setTimeout(() => fail(new Failure('timeout')), Math.max(1, laneDeadline - d.clock.now())); };
  try {
    stream = await bounded(laneDeadline, () => d.connectPipe(pipe));
    await rawWrite({ v: 1, type: 'hello', role: 'worker', epoch, token }, laneDeadline);
    const initialize = await receive(); lastId = initialize.id; if (initialize.type !== 'init') throw new Failure('protocol');
    const init = validateInit(initialize.payload, epoch, pipe); laneDeadline = d.clock.now() + init.remainingLaneMs; inheritDeadline(init.remainingLaneMs);
    await send('init-ack', {}, initialize.id);
    const begin = await receive(Math.min(laneDeadline, d.clock.now() + 60000)); lastId = begin.id; if (begin.type !== 'begin') throw new Failure('protocol'); exact(begin.payload, []);
    // Consume commands concurrently: a repeated begin or busy observe latches
    // failure immediately, even while an initiated effect is still outstanding.
    let observe: ((frame: Frame) => void) | undefined, retireProvider: ((frame: Frame) => void) | undefined, retiring = false;
    void (async () => { try { while (!retiring) { const frame = await receive(); if (!active || busy) throw new Failure('protocol'); busy = true;
      if (frame.type === 'observe' && observe) observe(frame);
      else if (frame.type === 'retire-provider' && retireProvider) { retiring = true; retireProvider(frame); }
      else throw new Failure('protocol');
    } } catch (error) { fail(error); } })();
    const startDeadline = Math.min(laneDeadline, d.clock.now() + 630000);
    const step = <T>(operation: () => Promise<T>, deadline = startDeadline, unsettled = true) => Promise.race([bounded(Math.min(deadline, laneDeadline), () => {
      pendingEffects++; let work: Promise<T>;
      try { work = operation(); } catch (error) { pendingEffects--; throw error; }
      // Count physical adapter completion rather than the timed wrapper. A late
      // rejection stays observed but cannot resume source admission/publication.
      Promise.resolve(work).then(() => { pendingEffects--; }, () => { pendingEffects--; });
      return work;
    }, unsettled), failed]);
    const pool = await step(() => d.createPool({ host: '127.0.0.1', user: 'music_migrator', password: init.databasePassword, database: init.authority.database, port: init.authority.port, max: 4, connectionTimeoutMillis: 3000, statement_timeout: 10000, lock_timeout: 5000 }));
    const database = async () => { const result = await step(() => pool.query('SELECT current_database() AS database')); if (result.rows.length !== 1 || result.rows[0].database !== init.authority.database) throw new Failure('protocol'); };
    await database();
    if (init.initializeDatabase) {
      await step(() => d.migrate(pool), Math.min(startDeadline, d.clock.now() + 120000));
      for (const owner of owners) { const p = init.personas[owner]; await step(() => pool.query('INSERT INTO auth_user(id,name,email) VALUES ($1,$2,$3)', [p.userId, owner, `${p.userId}@example.invalid`]));
        await step(() => pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())", [`guides-google-${p.userId}`, `google-${p.userId}`, p.userId])); }
    }
    const startupDeadline = Math.min(startDeadline, d.clock.now() + 180000);
    const config = await step(() => d.resolveConfig({ EXPLORERS_PUBLIC_ORIGIN: init.origin, EXPLORERS_AUTH_SECRET: init.authSecret, GOOGLE_CLIENT_ID: 'profile-fixture-google', GOOGLE_CLIENT_SECRET: 'profile-fixture-secret' }), startupDeadline);
    if (config.baseURL !== init.origin || config.secret !== init.authSecret) throw new Failure('protocol');
    const storage = await step(() => d.createStorage(init.storageDirectory), startupDeadline);
    if (storage.environment !== 'local' || ['putOwned', 'get', 'delete'].some(key => typeof Reflect.get(storage, key) !== 'function')) throw new Failure('protocol');
    const composed = await step(() => d.compose(pool, config, { mediaStorage: storage }), startupDeadline);
    provider = createGuidesProviderFixture({ runId: init.runId, commit: init.commit, epoch, identity: init.identity, origin: init.origin }, { clock: d.clock, phase: () => phase, deadline: () => laneDeadline });
    const listener = await step(() => d.listen(composed, init.apiPort, '127.0.0.1', provider!), startupDeadline);
    if (!listener || !(listener.failed instanceof Promise)) throw new Failure('protocol');
    listener.failed.catch(error => fail(error));
    const apiOrigin = `http://127.0.0.1:${init.apiPort}`;
    const context = await step(() => composed.auth.$context, startupDeadline);
    if (context.authCookies.sessionToken.name !== 'better-auth.session_token') throw new Failure('protocol');
    const cookies = new Set<string>();
    const verifiedCookie = (value: unknown) => { if (typeof value !== 'string' || Buffer.byteLength(value) > 8192 || /[\x00-\x20\x7f;]/.test(value)) throw new Failure('protocol');
      const match = /^better-auth\.session_token=([^.]+)\.([A-Za-z0-9+/=]+)$/.exec(value); if (!match) throw new Failure('protocol'); const expected = createHmac('sha256', init.authSecret).update(match[1]).digest('base64');
      if (Buffer.byteLength(match[2]) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(match[2]), Buffer.from(expected)) || cookies.has(value)) throw new Failure('protocol'); cookies.add(value); return value; };
    const http = async (url: string, request: RequestInit, deadline: number, maximum: number): Promise<unknown> => {
      return step(async () => { try { const response = await d.fetch(url, { ...request, redirect: 'error' }); check(); if (response.status !== 200) throw new Failure('unsettled');
        const length = response.headers.get('content-length'); if (length !== null && (!/^(0|[1-9]\d*)$/.test(length) || Number(length) > maximum)) throw new Failure('protocol');
        let body: Buffer;
        if (response.body) { const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0; try { while (true) { const result = await reader.read(); check(); if (result.done) break; size += result.value.length; if (size > maximum) throw new Failure('protocol'); parts.push(result.value); } body = Buffer.concat(parts); } finally { reader.releaseLock(); } }
        else { const raw = await response.text(); body = Buffer.from(raw); if (body.length > maximum) throw new Failure('protocol'); }
        check(); return parseJson(new TextDecoder('utf-8', { fatal: true }).decode(body));
      } catch (error) { throw error instanceof Failure ? error : new Failure('unsettled'); }
      }, deadline);
    };
    const me = async (cookie: string, deadline: number) => { const result = await http(`${apiOrigin}/api/explorers/v1/me`, { headers: { Cookie: cookie } }, deadline, 65536); exact(result, ['account']); return dtoBaseline.parse(accountDtoSchema.parse(result.account)); };
    const personas = {} as Record<typeof owners[number], { userId: string; handle: string; cookie: string }>;
    const bindings = {} as Record<typeof owners[number], { userId: string; handle: string; accountId: string }>;
    const accountIds = new Set<string>();
    for (const owner of owners) {
      const p = init.personas[owner]; const session = await step(() => context.internalAdapter.createSession(p.userId, false), startupDeadline);
      const cookie = verifiedCookie(`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256', config.secret).update(session.token).digest('base64')}`);
      await database(); const account = await me(cookie, startupDeadline);
      const result = await step(() => pool.query('SELECT b.user_id,b.account_id,a.revision,a.display_name FROM initial_account_bindings b JOIN creator_accounts a ON a.id=b.account_id WHERE b.user_id=$1', [p.userId]), startupDeadline);
      const row = result.rows[0]; if (result.rows.length !== 1 || row.user_id !== p.userId || row.account_id !== account.id || !(typeof row.revision === 'number' && row.revision === account.revision || typeof row.revision === 'string' && /^[1-9][0-9]*$/.test(row.revision) && row.revision === String(account.revision)) || row.display_name !== account.displayName || accountIds.has(account.id)) throw new Failure('protocol');
      accountIds.add(account.id); personas[owner] = { ...p, cookie }; bindings[owner] = { ...p, accountId: account.id };
    }
    const helper = await step(() => d.startControl({ pool, composed, config, runId: init.runId, commit: init.commit, authority: init.authority, personas,
      expectedTemporaryRoot: path.win32.dirname(init.disposableDirectory), disposableDirectory: init.disposableDirectory, storage: { directory: init.storageDirectory, instance: storage }, port: init.controlPort, apiOrigin }), Math.min(startDeadline, startupDeadline + 125000));
    exact(helper, ['version', 'url', 'capability', 'runId', 'commit', 'close']);
    if (helper.version !== 1 || helper.url !== `http://127.0.0.1:${init.controlPort}/control` || helper.runId !== init.runId || helper.commit !== init.commit || !hex(64).safeParse(helper.capability).success || typeof helper.close !== 'function') throw new Failure('protocol');
    const control = (action: 'reset' | 'observe', deadline: number) => http(helper.url, { method: 'POST', headers: { Host: `127.0.0.1:${init.controlPort}`, 'x-guides-capability': helper.capability, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, action, runId: init.runId, commit: init.commit, ...init.identity, generation: action === 'reset' ? 0 : 1 }) }, deadline, 8 * 1024 * 1024);
    const matchResult = (result: Record<string, unknown>, action: string) => { for (const [key, value] of Object.entries({ version: 1, action, runId: init.runId, commit: init.commit, ...init.identity, generation: 1 })) if (result[key] !== value) throw new Failure('protocol'); };
    phase = 'reset';
    const resetDeadline = Math.min(startDeadline, laneDeadline, d.clock.now() + 305000);
    const reset = await control('reset', resetDeadline); exact(reset, ['version', 'action', 'runId', 'commit', 'caseId', 'project', 'repeat', 'generation', 'manifest', 'sessions']); matchResult(reset, 'reset');
    const fixtureBytes: Record<string, Uint8Array> = {};
    for (const role of buildGuidesSeedPlan(init.identity.caseId).mediaRoles) { const key = role.key === 'replacement-cover' ? 'replacement-cover' : role.key === 'activity-import' ? 'activity-import' : 'old-cover'; fixtureBytes[key] = Buffer.from(FIXTURE_BASE64[key], 'base64'); }
    const manifest = guidesManifestSchema.parse({ expected: { version: 1, runId: init.runId, commit: init.commit, ...init.identity, generation: 1, personas: bindings }, manifest: reset.manifest, fixtureBytes });
    exact(reset.sessions, owners);
    for (const owner of owners) { const entry = reset.sessions[owner]; exact(entry, ['cookie']); const cookie = verifiedCookie(entry.cookie); await database(); const account = await me(cookie, resetDeadline); if (account.id !== bindings[owner].accountId || account.handle !== bindings[owner].handle || account.revision !== manifest.personas[owner].accountRevision) throw new Failure('protocol'); }
    observe = frame => { void (async () => {
      phase = 'observe'; lastId = frame.id; exact(frame.payload, ['epoch', 'identity', 'remainingLaneMs']); if (frame.payload.epoch !== epoch || JSON.stringify(identitySchema.parse(frame.payload.identity)) !== JSON.stringify(init.identity)) throw new Failure('protocol');
      const remaining = z.number().int().min(1).max(21600000).parse(frame.payload.remainingLaneMs); inheritDeadline(remaining);
      const providerObservation = await step(() => provider!.observe(laneDeadline), laneDeadline);
      const result = await control('observe', Math.min(laneDeadline, d.clock.now() + 310000)); exact(result, ['version', 'action', 'runId', 'commit', 'caseId', 'project', 'repeat', 'generation', 'personas', 'guides', 'sections', 'media', 'objects', 'attachments']); matchResult(result, 'observe');
      validateObservation(result, bindings); check(); await send('observed', { epoch, observation: { ...result, provider: providerObservation } }, frame.id); check(); phase = 'execution'; provider!.resume(); busy = false;
    })().catch(error => fail(error)); };
    retireProvider = frame => { void (async () => {
      phase = 'retirement'; active = false; lastId = frame.id; exact(frame.payload, ['epoch', 'identity', 'remainingLaneMs']);
      if (frame.payload.epoch !== epoch || JSON.stringify(identitySchema.parse(frame.payload.identity)) !== JSON.stringify(init.identity)) throw new Failure('protocol');
      inheritDeadline(z.number().int().min(1).max(21600000).parse(frame.payload.remainingLaneMs));
      const observation = await step(() => provider!.retire(laneDeadline), laneDeadline); check();
      await send('provider-retired', { epoch, provider: observation }, frame.id); check(); busy = false;
    })().catch(error => fail(error)); };
    check(); phase = 'execution'; active = true; await send('ready', { epoch, apiOrigin, reset }, begin.id); await failed;
  } catch (error) {
    if (error instanceof GuidesProviderFixtureError) error = new Failure(error.code);
    if (error instanceof z.ZodError || error instanceof SyntaxError) error = new Failure('protocol');
    try { cleanup = cleanupMetadata(error); } catch { error = new Failure('protocol'); }
    fail(error); const code = cleanup?.unsettled ? 'unsettled' : error instanceof Failure ? error.code : 'failed';
    d.clock.clearTimeout(laneTimer);
    let finalCode = code;
    if (provider) { try { await provider.abort(laneDeadline); } catch { finalCode = 'unsettled'; } }
    if (stream) await send('fatal', { phase, code: finalCode, cleanup }, lastId, true).catch(() => undefined);
    // No helper.close, Pool.end, descendant creation or deletion here. Physical
    // settlement and disposal belong to the retained root process/PG witnesses.
    throw new Failure(finalCode);
  }
}

const FIXTURE_BASE64 = {
    'old-cover':'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP8z4AdMDEMKQkAzUEBD7t4NqoAAAAASUVORK5CYII=',
    'replacement-cover':'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR42mNkYPjPgA0wMeAAg1MCAMtDAQ9w2TiCAAAAAElFTkSuQmCC',
    'activity-import':'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDu6/h8/wA4j//Z',
} as const;
const time = z.string().datetime();
const livePersona = z.object({ userId: text(200), accountId: uuid, handle: text(200), accountRevision: positive, status: z.enum(['active', 'suspended', 'pending_deletion', 'deleted']), publicProfile: z.boolean(), guidesPublic: z.boolean(), guidesContentRevision: nat }).strict();
const liveGuide = z.object({ id: uuid, accountId: uuid, category: z.literal('guides'), title: z.string().min(1).max(200), description: z.string().max(65536).nullable(), slug: z.string().min(1).max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), displayOrder: nat, revision: positive, categoryContentRevision: positive, visibility: z.enum(['public', 'private']), publicationState: z.enum(['draft', 'published']), pinOrder: nat.nullable(), archivedAt: time.nullable(), details: guideCollectionDetailsSchema.nullable() }).strict();
const liveSection = z.object({ id: uuid, collectionId: uuid, accountId: uuid, title: guideSectionDtoSchema.shape.title, description: guideSectionDtoSchema.shape.description, displayOrder: nat.max(199), blocks: guideSectionBlocksSchema, archivedAt: time.nullable(), createdAt: time, updatedAt: time }).strict();
const liveMedia = z.object({ id: uuid, accountId: uuid, purpose: z.enum(['collection', 'guide']), status: z.enum(['uploading', 'ready', 'pending_delete', 'deleted', 'failed']), mimeType: z.string().max(128), byteLength: nat, sha256: hex(64).nullable(), originalFilename: z.string().max(65536).nullable(), width: positive.nullable(), height: positive.nullable(), alternativeText: z.string().max(65536).nullable(), caption: z.string().max(65536).nullable(), readyAt: time.nullable(), deletedAt: time.nullable() }).strict().refine(value => (value.width === null) === (value.height === null) && (value.status !== 'ready' || value.sha256 !== null));
const liveObject = z.object({ mediaId: uuid, accountId: uuid, variant: z.enum(['original', 'thumbnail', 'display']), environment: z.enum(['local', 'qa', 'prod']), key: z.string().max(1024), mimeType: z.string().max(128), byteLength: nat, sha256: hex(64), storageVersionId: z.string().max(65536).nullable(), deletedAt: time.nullable() }).strict();
const attachment = z.discriminatedUnion('slot', [z.object({ slot: z.literal('cover'), guideId: uuid, accountId: uuid, mediaId: uuid }).strict(), z.object({ slot: z.literal('section-photo'), guideId: uuid, sectionId: uuid, accountId: uuid, mediaId: uuid }).strict()]);
function validateObservation(result: Record<string, unknown>, bindings: Record<typeof owners[number], { userId: string; handle: string; accountId: string }>): void {
  const personas = three(livePersona).parse(result.personas);
  for (const owner of owners) for (const key of ['userId', 'accountId', 'handle'] as const) if (personas[owner][key] !== bindings[owner][key]) throw new Failure('protocol');
  const guides = z.array(liveGuide).max(256).parse(result.guides), sections = z.array(liveSection).max(1024).parse(result.sections), media = z.array(liveMedia).max(256).parse(result.media), objects = z.array(liveObject).max(768).parse(result.objects), attachments = z.array(attachment).max(8192).parse(result.attachments);
  const ids = new Set(owners.map(owner => bindings[owner].accountId));
  for (const rows of [guides, sections, media, objects, attachments]) if (rows.some(row => !ids.has(row.accountId))) throw new Failure('protocol');
  for (const rows of [guides, sections, media]) if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Failure('protocol');
  if (new Set(objects.map(row => `${row.mediaId}:${row.variant}`)).size !== objects.length) throw new Failure('protocol');
  for (const section of sections) if (!guides.some(guide => guide.id === section.collectionId && guide.accountId === section.accountId)) throw new Failure('protocol');
  for (const object of objects) if (!media.some(asset => asset.id === object.mediaId && asset.accountId === object.accountId)) throw new Failure('protocol');
  for (const entry of attachments) if (!guides.some(guide => guide.id === entry.guideId && guide.accountId === entry.accountId) || !media.some(asset => asset.id === entry.mediaId && asset.accountId === entry.accountId) || entry.slot === 'section-photo' && !sections.some(section => section.id === entry.sectionId && section.collectionId === entry.guideId && section.accountId === entry.accountId)) throw new Failure('protocol');
}

// Exact direct entry only; importing this module never acquires resources.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  void runGuidesResourceWorker().catch(() => { process.exitCode = 1; });
}


