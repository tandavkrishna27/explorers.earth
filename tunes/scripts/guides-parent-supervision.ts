import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type Socket, type Server } from 'node:net';
import { lstatSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import type { OwnedUatDatabaseAuthority } from './music-uat-database';
import { GUIDES_CASES, GUIDES_PROJECTS, guidesManifestSchema, buildGuidesSeedPlan } from './guides-browser-support';

type Label = 'browser' | 'vite' | 'service-children' | 'control' | 'runtime-pool' | 'migrator-pool' | 'owned-database' | 'private-directory' | 'artifacts' | 'receipt';
const LABELS: readonly Label[] = ['browser', 'vite', 'service-children', 'control', 'runtime-pool', 'migrator-pool', 'owned-database', 'private-directory', 'artifacts', 'receipt'];
type Identity = Readonly<{ caseId: string; project: string; repeat: 0 }>;
type Clock = { now(): number; setTimeout(callback: () => void, ms: number): unknown; clearTimeout(timer: unknown): void };
type Stream = { read(): Promise<Buffer | null>; write(bytes: Buffer): Promise<void>; close(): Promise<void> };
type Launcher = { stream: Stream; exited(): Promise<{ code: number | null; closed: boolean }> };
type Listener = { next(): Promise<Stream>; close(): Promise<void> };
type Witness = { maintenanceDatabase: 'postgres'; databaseOid: number; privileged: true; maxPreparedTransactions: 0; preparedTransactions: 0; clientSessions: 0; fresh: true };
type Acquisition = { intent: Readonly<{ runId: string; commit: string; database: string; port: number; passwordFile: string }>; create(): Promise<OwnedUatDatabaseAuthority>; dispose(drop: (authority: OwnedUatDatabaseAuthority) => Promise<void>): Promise<void> };
type FileIdentity = Readonly<{ kind: 'ancestor' | 'root' | 'storage' | 'secret'; path: string; dev: string; ino: string }>;
type SupervisorInput = Readonly<{
 runId: string; commit: string; acquisition: Acquisition; inventory: readonly Identity[];
 configure: Readonly<{ nodeExecutable: string; loaderPath: string; fixtureEntrypoint: string; workerEntrypoint: string; cwd: string; environment: Readonly<Record<string, string>>; receiptArguments: readonly string[] }>;
 powershellExecutable: string; jobScript: string; disposableDirectory: string; storageDirectory: string;
 origin: string; apiOrigin: string; harnessPort: number; apiPort: number; controlPort: number; frontendPort: number;
 personas: Readonly<Record<'ownerA' | 'ownerB' | 'ownerC', { userId: string; handle: string }>>;
 databasePassword: string; authSecret: string; custody: readonly FileIdentity[];
}>;
type SupervisorDependencies = {
 clock: Clock; randomHex(bytes: number): string;
 listen(pipe: string): Promise<Listener>; launch(executable: string, args: readonly string[], cwd: string): Launcher;
 witness(authority: OwnedUatDatabaseAuthority, remainingMs: number): Promise<Witness>;
 drop(authority: OwnedUatDatabaseAuthority, remainingMs: number): Promise<void>;
 disposeCustody(custody: readonly FileIdentity[], remainingMs: number): Promise<void>;
};
const FIXTURE_BASE64 = {
    'old-cover':'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP8z4AdMDEMKQkAzUEBD7t4NqoAAAAASUVORK5CYII=',
    'replacement-cover':'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR42mNkYPjPgA0wMeAAg1MCAMtDAQ9w2TiCAAAAAElFTkSuQmCC',
    'activity-import':'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDu6/h8/wA4j//Z',
} as const;
type SupervisorEvidence = Readonly<{ completedEpochs: number; activeProcesses: 0; fixtureExitCode: 0; launcherExitCode: 0; handlesClosed: true; databaseOid: number }>;
type DisposalEvidence = Readonly<{ disposed: boolean; failures: readonly Label[] }>;
type Frame = { v: 1; seq: number; id: string; type: string; payload: Record<string, unknown> };
const CONTROLLER_CLEANUP_LABELS = ['listener', 'drain', 'authority', 'custody', 'storage'] as const;
type ControllerCleanup = Readonly<{ code: 'GUIDES_CONTROL_CLEANUP_FAILED'; unsettled: boolean; failures: readonly typeof CONTROLLER_CLEANUP_LABELS[number][] }>;
class Failure extends Error {
 constructor(readonly label: Label, readonly cleanup?: ControllerCleanup) { super(label); }
}
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new Failure('service-children');
}
function integer(value: unknown, min: number, max: number): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Failure('service-children'); }
function loopbackPort(value: unknown): number {
 if (typeof value !== 'string') throw new Failure('service-children');
 const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(value);
 if (!match) throw new Failure('service-children');
 const port = Number(match[1]); integer(port, 1024, 65535);
 if (value !== `http://127.0.0.1:${port}`) throw new Failure('service-children');
 return port;
}
function hex(value: unknown, length: number): asserts value is string { if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) throw new Failure('service-children'); }
function sameIdentity(a: unknown, b: Identity): void { exact(a, ['caseId', 'project', 'repeat']); if (a.caseId !== b.caseId || a.project !== b.project || a.repeat !== 0) throw new Failure('control'); }
// Validate duplicate keys at every depth before JSON.parse can discard them.
function parseJson(text: string): unknown {
 let offset = 0;
 const whitespace = () => { while (/\s/.test(text[offset] ?? '') && offset < text.length) offset++; };
 const string = (): string => { const start = offset++; while (offset < text.length) { const c = text[offset++]; if (c === '\\') { offset++; continue; } if (c === '"') return JSON.parse(text.slice(start, offset)); } throw new Failure('service-children'); };
 const value = (): void => { whitespace(); const c = text[offset]; if (c === '{') { offset++; whitespace(); const keys = new Set<string>(); if (text[offset] === '}') { offset++; return; } while (true) { whitespace(); if (text[offset] !== '"') throw new Failure('service-children'); const key = string(); if (keys.has(key)) throw new Failure('service-children'); keys.add(key); whitespace(); if (text[offset++] !== ':') throw new Failure('service-children'); value(); whitespace(); const end = text[offset++]; if (end === '}') return; if (end !== ',') throw new Failure('service-children'); } } if (c === '[') { offset++; whitespace(); if (text[offset] === ']') { offset++; return; } while (true) { value(); whitespace(); const end = text[offset++]; if (end === ']') return; if (end !== ',') throw new Failure('service-children'); } } if (c === '"') { string(); return; } const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(offset)); if (!match) throw new Failure('service-children'); offset += match[0].length; };
 value(); whitespace(); if (offset !== text.length) throw new Failure('service-children'); return JSON.parse(text);
}
function bounded<T>(clock: Clock, deadline: number, operation: () => Promise<T>, label: Label): Promise<T> {
 const ms = Math.floor(deadline - clock.now()); if (ms < 1 || !Number.isFinite(ms)) return Promise.reject(new Failure(label));
 return new Promise((resolve, reject) => {
  const timer = clock.setTimeout(() => reject(new Failure(label)), ms);
  let result: Promise<T>;
  try { result = operation(); } catch (error) { clock.clearTimeout(timer); reject(error); return; }
  Promise.resolve(result).then(resolve, reject).finally(() => clock.clearTimeout(timer));
 });
}
class CleanEof extends Error {}
class Channel {
 private bytes = Buffer.alloc(0); private incoming = 0; private outgoing = 0; private pending = false;
 private started = false; private allowed = false; private fatal: Error | undefined;
 private queued: Frame[] = []; private waiter: { resolve(frame: Frame): void; reject(error: unknown): void } | undefined;
 private replies = new Map<string, { expected: string; cancelled?: boolean; resolve(frame: Frame): void; reject(error: unknown): void }>();
 private logBytes = { stdout: 0, stderr: 0 };
 private stopped = false;
  private terminal = false;
  private cleanEofSeen = false;
  private completion: { promise: Promise<void>; accept(): void } | undefined;
  private requireIdle(): void { if (!this.started || this.fatal || this.terminal || this.cleanEofSeen || this.pending || this.replies.size || this.queued.length || this.waiter) throw this.fatal ?? new Failure('service-children'); }
  beginWorkerRetirement(): void { this.requireIdle(); if (this.role !== 'worker') throw new Failure('control'); this.terminal = true; }
  acceptFixtureCompletion(): void { this.requireIdle(); if (this.role !== 'fixture' || !this.completion) throw new Failure('control'); this.terminal = true; this.completion.accept(); }
 constructor(readonly stream: Stream, private clock: Clock, private id: () => string, private max: number, private role: 'fixture' | 'worker' | 'launcher' = 'launcher') {}
  resume(): void { if (this.terminal) throw new Failure('service-children'); this.allowed = true; }
 stop(): void { this.stopped = true; }
 cancel(): void {
  this.stopped = true; this.fatal = new Failure('service-children');
   this.completion?.accept();
  for (const reply of this.replies.values()) reply.reject(this.fatal);
  this.replies.clear(); this.waiter?.reject(this.fatal); this.waiter = undefined;
 }
 cancelOrdinary(): void { for (const reply of this.replies.values()) { reply.cancelled = true; reply.reject(new Failure('service-children')); } }
 activate(deadline: number, onFailure: (error: Error) => void): void {
  if (this.started) throw new Failure('service-children'); this.started = true;
  void (async () => { try { while (true) {
   const frame = await this.decode(deadline); if (this.stopped) return;
   if (this.max === 65536 && frame.type === 'log') { exact(frame.payload, ['slot', 'stream', 'text']); const stream = frame.payload.stream; if (stream !== 'stdout' && stream !== 'stderr' || typeof frame.payload.text !== 'string' || Buffer.byteLength(frame.payload.text) > 16384 || !(frame.payload.slot === 'fixture' || Number.isInteger(frame.payload.slot) && Number(frame.payload.slot) >= 1 && Number(frame.payload.slot) <= 16)) throw new Failure('service-children'); this.logBytes[stream] += Buffer.byteLength(frame.payload.text); if (this.logBytes[stream] > 8388608) throw new Failure('service-children'); continue; }
   if (frame.type === 'fatal') {
    exact(frame.payload, ['phase', 'code', 'cleanup']);
    if (!['bootstrap', 'reset', 'observe', 'execution', 'retirement'].includes(String(frame.payload.phase)) || !['failed', 'timeout', 'protocol', 'unsettled'].includes(String(frame.payload.code))) throw new Failure('control');
    let cleanup: ControllerCleanup | undefined;
    if (frame.payload.cleanup !== null) {
     exact(frame.payload.cleanup, ['code', 'unsettled', 'failures']);
     const value = frame.payload.cleanup;
     if (value.code !== 'GUIDES_CONTROL_CLEANUP_FAILED' || typeof value.unsettled !== 'boolean' || !Array.isArray(value.failures)) throw new Failure('control');
     let previous = -1;
     for (const label of value.failures) {
      const index = CONTROLLER_CLEANUP_LABELS.indexOf(label);
      if (index <= previous) throw new Failure('control');
      previous = index;
     }
     cleanup = Object.freeze({ code: 'GUIDES_CONTROL_CLEANUP_FAILED', unsettled: value.unsettled, failures: Object.freeze([...value.failures]) });
    }
    throw new Failure('control', cleanup);
   }
   const reply = this.replies.get(frame.id);
   if (reply) { this.replies.delete(frame.id); if (reply.cancelled && frame.type !== 'cancelled') throw new Failure('service-children'); if (frame.type === 'cancelled') { exact(frame.payload, ['commandId']); if (!reply.cancelled || frame.payload.commandId !== frame.id) throw new Failure('service-children'); reply.reject(new Failure('service-children')); } else if (frame.type !== reply.expected) { reply.reject(new Failure('service-children')); throw new Failure('service-children'); } else reply.resolve(frame); if (frame.type === 'exit-ack') return; continue; }
    if (this.terminal || !this.allowed || this.queued.length || this.role === 'worker' && frame.type !== 'ready') throw new Failure('service-children'); this.allowed = false;
    if (this.role === 'fixture' && frame.type === 'complete') { let accept!: () => void; const promise = new Promise<void>(resolve => { accept = resolve; }); this.completion = { promise, accept }; }
   if (this.waiter) { const waiter = this.waiter; this.waiter = undefined; waiter.resolve(frame); } else this.queued.push(frame);
   if (this.role === 'fixture' && frame.type === 'ready') this.allowed = true;
    if (this.completion) await this.completion.promise;
   } } catch (error) { if (this.stopped) return; if (error instanceof CleanEof && this.terminal && !this.pending && !this.replies.size && !this.waiter && !this.queued.length && !this.fatal) { this.cleanEofSeen = true; return; } this.fatal = error instanceof CleanEof ? new Failure('service-children') : error instanceof Error ? error : new Failure('service-children'); for (const reply of this.replies.values()) reply.reject(this.fatal); this.replies.clear(); this.waiter?.reject(this.fatal); this.waiter = undefined; onFailure(this.fatal); } })();
 }
 async raw(deadline: number): Promise<unknown> {
  let end = this.bytes.length ? Math.min(deadline, this.clock.now() + 5000) : deadline;
  while (true) { if (this.bytes.length >= 4) { const size = this.bytes.readUInt32BE(); if (size < 1 || size > this.max) throw new Failure('service-children'); if (this.bytes.length >= size + 4) { const body = this.bytes.subarray(4, size + 4); this.bytes = this.bytes.subarray(size + 4); return parseJson(new TextDecoder('utf-8', { fatal: true }).decode(body)); } }
    const chunk = await bounded(this.clock, end, () => this.stream.read(), 'service-children'); if (chunk === null) { if (this.bytes.length) throw new Failure('service-children'); throw new CleanEof(); } if (!chunk.length || this.bytes.length + chunk.length > this.max + 4) throw new Failure('service-children'); if (!this.bytes.length) end = Math.min(deadline, this.clock.now() + 5000); this.bytes = Buffer.concat([this.bytes, chunk]);
  }
 }
 private async decode(deadline: number): Promise<Frame> { const frame = await this.raw(deadline); exact(frame, ['v', 'seq', 'id', 'type', 'payload']); if (frame.v !== 1 || frame.seq !== ++this.incoming || this.incoming > 4096 || typeof frame.type !== 'string') throw new Failure('service-children'); hex(frame.id, 32); if (!frame.payload || typeof frame.payload !== 'object' || Array.isArray(frame.payload)) throw new Failure('service-children'); if (frame.type !== 'ready' && frame.type !== 'observed' && frame.type !== 'start-worker-result' && frame.type !== 'observe-result' && Buffer.byteLength(JSON.stringify(frame)) > 65536) throw new Failure('service-children'); return frame as Frame; }
 async receive(deadline: number): Promise<Frame> { if (this.terminal) throw this.fatal ?? new Failure('service-children'); if (!this.started) return this.decode(deadline); if (this.fatal) throw this.fatal; if (this.queued.length) return this.queued.shift()!; if (this.waiter) throw new Failure('service-children'); this.allowed = true; return bounded(this.clock, deadline, () => new Promise<Frame>((resolve, reject) => { this.waiter = { resolve, reject }; }), 'service-children'); }
 async send(type: string, payload: Record<string, unknown>, deadline: number, id = this.id()): Promise<string> { if (this.terminal) throw this.fatal ?? new Failure('service-children'); hex(id, 32); if (++this.outgoing > 4096) throw new Failure('service-children'); const body = Buffer.from(JSON.stringify({ v: 1, seq: this.outgoing, id, type, payload })); if (body.length > this.max) throw new Failure('service-children'); const head = Buffer.alloc(4); head.writeUInt32BE(body.length); await bounded(this.clock, Math.min(deadline, this.clock.now() + 5000), () => this.stream.write(Buffer.concat([head, body])), 'service-children'); return id; }
 async request(type: string, payload: Record<string, unknown>, expected: string, deadline: number): Promise<Frame> {
  if (this.terminal) throw this.fatal ?? new Failure('service-children'); if (this.pending) throw new Failure('control');
  this.pending = true;
  const id = this.id();
  const result = new Promise<Frame>((resolve, reject) => {
   this.replies.set(id, { expected, resolve, reject });
  });
  // A synchronous transport failure may precede the awaited reply. Observe its
  // rejection immediately while keeping the original promise for correlation.
  result.catch(() => undefined);
  try {
   await this.send(type, payload, deadline, id);
   return await bounded(this.clock, deadline, () => result, 'service-children');
  } finally {
   this.pending = false;
  }
 }
}
function socketStream(socket: Socket): Stream {
 const chunks: Buffer[] = []; let ended = false, failure: Error | undefined; let waiter: (() => void) | undefined; let queued = 0;
 socket.on('data', chunk => { queued += chunk.length; if (queued > 9 * 1024 * 1024 + 4) { failure = new Failure('service-children'); socket.destroy(); } else chunks.push(chunk); waiter?.(); });
  socket.on('error', error => { failure = error; waiter?.(); }); socket.on('end', () => { ended = true; waiter?.(); }); socket.on('close', () => { if (!ended && !failure) failure = new Failure('service-children'); ended = true; waiter?.(); });
 return { async read() { while (!chunks.length && !ended && !failure) await new Promise<void>(resolve => { waiter = resolve; }); waiter = undefined; if (failure) throw failure; const chunk = chunks.shift(); if (chunk) queued -= chunk.length; return chunk ?? null; }, write(bytes) { return new Promise((resolve, reject) => socket.write(bytes, error => error ? reject(error) : resolve())); }, close() { socket.destroy(); return Promise.resolve(); } };
}
function production(input: SupervisorInput): SupervisorDependencies {
 if (process.platform !== 'win32') throw new Failure('service-children');
 let witnessedOid: number | undefined;
 const clock: Clock = { now: () => performance.now(), setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: timer => clearTimeout(timer as NodeJS.Timeout) };
 const admin = async <T>(authority: OwnedUatDatabaseAuthority, ms: number, fn: (client: Client) => Promise<T>): Promise<T> => {
  const deadline = clock.now() + Math.min(ms, 15000); const client = new Client({ host: '127.0.0.1', port: authority.port, database: 'postgres', user: 'music_migrator', password: input.databasePassword, connectionTimeoutMillis: Math.min(3000, ms), query_timeout: Math.min(3000, ms), statement_timeout: 3000 });
  try { await bounded(clock, deadline, () => client.connect(), 'runtime-pool'); await bounded(clock, deadline, () => client.query("SET lock_timeout='1000ms'"), 'runtime-pool'); return await bounded(clock, deadline, () => fn(client), 'runtime-pool'); } finally { await bounded(clock, deadline, () => client.end(), 'runtime-pool'); }
 };
 return { clock, randomHex: bytes => randomBytes(bytes).toString('hex'),
  async listen(pipe) { let server: Server; const connections: Stream[] = []; let waiter: (() => void) | undefined; let failed = false; server = createServer(socket => { if (connections.length) { socket.destroy(); failed = true; } else connections.push(socketStream(socket)); waiter?.(); }); await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(pipe, resolve); }); server.on('error', () => { failed = true; waiter?.(); }); return { async next() { while (!connections.length && !failed) await new Promise<void>(resolve => { waiter = resolve; }); waiter = undefined; if (failed) throw new Failure('service-children'); return connections.shift()!; }, close() { return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } }; },
  launch(executable, args, cwd) { const child: ChildProcessWithoutNullStreams = spawn(executable, [...args], { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } }); let stderr = 0; child.stderr.on('data', bytes => { stderr += bytes.length; if (stderr > 1024 * 1024) child.stderr.destroy(new Failure('service-children')); }); const stream = socketStream(child.stdout as unknown as Socket); stream.write = bytes => new Promise((resolve, reject) => child.stdin.write(bytes, error => error ? reject(error) : resolve())); stream.close = async () => { child.stdin.end(); }; const exit = new Promise<{ code: number | null; closed: boolean }>((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve({ code, closed: true })); }); return { stream, exited: () => exit }; },
  witness(authority, ms) { return admin(authority, ms, async client => { const end = clock.now() + Math.min(ms, 15000); while (true) { await client.query('SELECT pg_stat_clear_snapshot()'); const result = await client.query("SELECT current_database() AS maintenance, (SELECT oid::int FROM pg_database WHERE datname=$1) AS oid, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS privileged, current_setting('max_prepared_transactions')::int AS config, (SELECT count(*)::int FROM pg_prepared_xacts WHERE database=$1) AS prepared, (SELECT count(*)::int FROM pg_stat_activity WHERE datname=$1 AND backend_type='client backend') AS sessions", [authority.database]); const r = result.rows[0]; integer(r.oid, 1, 0xffffffff); if (r.maintenance !== 'postgres' || witnessedOid !== undefined && r.oid !== witnessedOid || r.privileged !== true || r.config !== 0 || r.prepared !== 0) throw new Failure('runtime-pool'); if (r.sessions === 0) { witnessedOid ??= r.oid; return { maintenanceDatabase: 'postgres', databaseOid: r.oid, privileged: true, maxPreparedTransactions: 0, preparedTransactions: 0, clientSessions: 0, fresh: true }; } await bounded(clock, end, () => new Promise<void>(resolve => clock.setTimeout(resolve, 250)), 'runtime-pool'); } }); },
  drop(authority, ms) { return admin(authority, ms, async client => { if (!/^[a-z0-9_]+$/.test(authority.database)) throw new Failure('owned-database'); await client.query(`DROP DATABASE "${authority.database}"`); }); },
  async disposeCustody(custody, ms) {
   const end = clock.now() + ms;
   const verify = (item: FileIdentity) => {
    if (clock.now() >= end) throw new Failure('private-directory');
    const stat = lstatSync(item.path, { bigint: true });
    if (stat.isSymbolicLink() || String(stat.dev) !== item.dev || String(stat.ino) !== item.ino || realpathSync(item.path) !== item.path || (item.kind === 'secret' ? !stat.isFile() || stat.nlink !== 1n : !stat.isDirectory())) throw new Failure('private-directory');
   };
   for (const item of custody) verify(item);
   for (const kind of ['storage', 'root', 'secret'] as const) {
    const item = custody.find(entry => entry.kind === kind)!;
    for (const ancestor of custody.filter(entry => entry.kind === 'ancestor')) verify(ancestor);
    verify(item);
    await rm(item.path, { recursive: kind !== 'secret', force: false });
   }
  },
 };
}
/** Import and construction perform no resource operations. Only the retained root may run it. */
export function createGuidesParentSupervisor(input: SupervisorInput, dependencies?: SupervisorDependencies): { run(): Promise<SupervisorEvidence>; abort(reason: 'failure' | 'interrupt' | 'deadline'): void; dispose(): Promise<DisposalEvidence> } {
 if (!input || !/^[a-f0-9]{32}$/.test(input.runId) || !/^[a-f0-9]{40}$/.test(input.commit) || !input.acquisition || input.acquisition.intent.runId !== input.runId || input.acquisition.intent.commit !== input.commit || !Array.isArray(input.inventory) || input.inventory.length !== 16) throw new Failure('receipt');
 const identities = new Set<string>(); for (const identity of input.inventory) { exact(identity, ['caseId', 'project', 'repeat']); if (!GUIDES_CASES.includes(identity.caseId as typeof GUIDES_CASES[number]) || !GUIDES_PROJECTS.includes(identity.project as typeof GUIDES_PROJECTS[number]) || identity.repeat !== 0) throw new Failure('receipt'); const key = JSON.stringify([identity.caseId, identity.project, identity.repeat]); if (identities.has(key)) throw new Failure('receipt'); identities.add(key); }
 const targets = { root: input.disposableDirectory, storage: input.storageDirectory, secret: input.acquisition.intent.passwordFile };
 if (path.win32.dirname(input.storageDirectory) !== input.disposableDirectory || targets.secret.startsWith(input.disposableDirectory + '\\')) throw new Failure('private-directory');
 const seenPaths = new Set<string>();
 for (const item of input.custody) {
  exact(item, ['kind', 'path', 'dev', 'ino']);
  if (typeof item.path !== 'string' || !/^[A-Za-z]:\\/.test(item.path) || item.path.includes('/') || path.win32.normalize(item.path) !== item.path || item.path.slice(2).includes(':') || /[\x00-\x1f]/.test(item.path) || seenPaths.has(item.path) || !/^\d+$/.test(item.dev) || !/^\d+$/.test(item.ino)) throw new Failure('private-directory');
  seenPaths.add(item.path);
  if (item.kind !== 'ancestor' && (!['root', 'storage', 'secret'].includes(item.kind) || targets[item.kind] !== item.path || path.win32.parse(item.path).root === item.path)) throw new Failure('private-directory');
 }
 for (const [kind, target] of Object.entries(targets)) {
  if (input.custody.filter(item => item.kind === kind && item.path === target).length !== 1) throw new Failure('private-directory');
  for (let ancestor = path.win32.dirname(target); ; ancestor = path.win32.dirname(ancestor)) {
   if (!input.custody.some(item => item.path === ancestor && (item.kind === 'ancestor' || item.kind === 'root'))) throw new Failure('private-directory');
   if (ancestor === path.win32.dirname(ancestor)) break;
  }
 }
 for (const item of input.custody.filter(item => item.kind === 'ancestor')) if (!Object.values(targets).some(target => target.startsWith(item.path.endsWith('\\') ? item.path : item.path + '\\'))) throw new Failure('private-directory');
 for (const file of [input.powershellExecutable, input.jobScript, input.configure.nodeExecutable, input.configure.loaderPath, input.configure.fixtureEntrypoint, input.configure.workerEntrypoint, input.configure.cwd]) if (typeof file !== 'string' || !path.win32.isAbsolute(file) || file.length > 4096 || /[\x00-\x1f]/.test(file)) throw new Failure('receipt');
 for (const secret of [input.authSecret, input.databasePassword]) if (typeof secret !== 'string' || secret.length < 1 || secret.length > 256 || /[\x00-\x1f]/.test(secret)) throw new Failure('receipt');
 for (const port of [input.harnessPort, input.apiPort, input.controlPort, input.frontendPort]) integer(port, 1024, 65535);
 const gatewayPort = loopbackPort(input.origin); loopbackPort(input.apiOrigin);
 if (input.apiOrigin !== `http://127.0.0.1:${input.apiPort}`) throw new Failure('service-children');
 const intendedPgPort = input.acquisition.intent.port; integer(intendedPgPort, 56000, 60999);
 const servicePorts = [gatewayPort, input.frontendPort, input.harnessPort, input.apiPort, input.controlPort];
 const validatePgPort = (port: number) => { integer(port, 56000, 60999); if (port !== intendedPgPort || new Set([...servicePorts, port]).size !== 6) throw new Failure('owned-database'); };
 validatePgPort(intendedPgPort);
 if (dependencies && ['clock', 'randomHex', 'listen', 'launch', 'witness', 'drop', 'disposeCustody'].some(key => !(key in dependencies))) throw new Failure('receipt');
 const d = dependencies ?? production(input); const failures = new Set<Label>(); let first: Label | undefined; let channelFailure: Failure | undefined; let disposed = false; let runPromise: Promise<SupervisorEvidence> | undefined, disposalPromise: Promise<DisposalEvidence> | undefined;
 let laneDeadline = 0, recoveryDeadline = 0, databaseOid: number | undefined; let launcher: Launcher | undefined, channel: Channel | undefined, listener: Listener | undefined, authority: OwnedUatDatabaseAuthority | undefined;
 let fixture: Channel | undefined, worker: Channel | undefined; let containment = false, handles = false, launcherClosed = false, exitAttempted = false; const peers: Channel[] = []; let priority: Promise<void> | undefined;
 const fail = (label: Label) => { first ??= label; failures.add(label); };
 const check = () => { if (first || disposed) throw channelFailure ?? new Failure(first ?? 'service-children'); if (d.clock.now() >= laneDeadline) { fail('service-children'); throw new Failure('service-children'); } };
 const remaining = (ceiling: number, deadline = laneDeadline) => { const ms = Math.min(ceiling, Math.floor(deadline - d.clock.now())); if (ms < 1 || !Number.isFinite(ms)) throw new Failure('service-children'); return ms; };
 const id = () => { const value = d.randomHex(16); hex(value, 32); return value; };
 const accountBindings = new Map<string, string>(); const sessionCookies = new Set<string>();
 const validateReset = (value: unknown, identity: Identity): void => {
  exact(value, ['version', 'action', 'runId', 'commit', 'caseId', 'project', 'repeat', 'generation', 'manifest', 'sessions']);
  if (value.version !== 1 || value.action !== 'reset' || value.runId !== input.runId || value.commit !== input.commit || value.caseId !== identity.caseId || value.project !== identity.project || value.repeat !== 0 || value.generation !== 1) throw new Failure('control');
  const manifest = value.manifest as { personas?: unknown }; exact(manifest?.personas, ['ownerA', 'ownerB', 'ownerC']); exact(value.sessions, ['ownerA', 'ownerB', 'ownerC']);
  const bindings: Record<string, unknown> = {};
  for (const owner of ['ownerA', 'ownerB', 'ownerC'] as const) {
   const persona = manifest.personas[owner]; exact(persona, ['userId', 'accountId', 'handle', 'accountRevision']);
   if (persona.userId !== input.personas[owner].userId || persona.handle !== input.personas[owner].handle || typeof persona.accountId !== 'string' || accountBindings.has(owner) && accountBindings.get(owner) !== persona.accountId) throw new Failure('control');
   bindings[owner] = { userId: persona.userId, accountId: persona.accountId, handle: persona.handle };
   const session = value.sessions[owner]; exact(session, ['cookie']);
   if (typeof session.cookie !== 'string' || session.cookie.length > 8192 || /[\x00-\x20\x7f;]/.test(session.cookie) || sessionCookies.has(session.cookie)) throw new Failure('control');
   const match = /^better-auth\.session_token=([^.]+)\.([A-Za-z0-9+/=]+)$/.exec(session.cookie);
   if (!match) throw new Failure('control');
   const expected = createHmac('sha256', input.authSecret).update(match[1]).digest('base64');
   if (Buffer.byteLength(match[2]) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(match[2]), Buffer.from(expected))) throw new Failure('control');
  }
  const fixtureBytes: Partial<Record<keyof typeof FIXTURE_BASE64, Buffer>> = {};
  for (const role of buildGuidesSeedPlan(identity.caseId).mediaRoles) { const key = role.key === 'replacement-cover' ? 'replacement-cover' : role.key === 'activity-import' ? 'activity-import' : 'old-cover'; fixtureBytes[key] = Buffer.from(FIXTURE_BASE64[key], 'base64'); }
  guidesManifestSchema.parse({ expected: { version: 1, runId: input.runId, commit: input.commit, ...identity, generation: 1, personas: bindings }, manifest: value.manifest, fixtureBytes });
  for (const owner of ['ownerA', 'ownerB', 'ownerC'] as const) { accountBindings.set(owner, (manifest.personas[owner] as { accountId: string }).accountId); sessionCookies.add((value.sessions[owner] as { cookie: string }).cookie); }
 };
 const request = async (type: string, payload: Record<string, unknown>, expected: string, ceiling: number, recovering = false) => { if (!channel) throw new Failure('service-children'); if (!recovering) check(); const deadline = Math.min(recovering ? recoveryDeadline : laneDeadline, d.clock.now() + ceiling); const result = await channel.request(type, payload, expected, deadline); if (!recovering) check(); return result; };
 const jobEmpty = (result: Frame, success: boolean) => { exact(result.payload, ['activeProcesses', 'fixtureSignaled', 'fixtureExitCode', 'workersSignaled']); integer(result.payload.fixtureExitCode, 0, 0xffffffff); if (result.payload.activeProcesses !== 0 || result.payload.fixtureSignaled !== true || result.payload.workersSignaled !== true || success && result.payload.fixtureExitCode !== 0) throw new Failure('service-children'); containment = true; };
 const witness = async (deadline: number) => { if (!authority) throw new Failure('owned-database'); const ms = remaining(15000, deadline); const result = await bounded(d.clock, d.clock.now() + ms, () => d.witness(authority!, ms), 'runtime-pool'); exact(result, ['maintenanceDatabase', 'databaseOid', 'privileged', 'maxPreparedTransactions', 'preparedTransactions', 'clientSessions', 'fresh']); if (result.maintenanceDatabase !== 'postgres' || databaseOid !== undefined && result.databaseOid !== databaseOid || result.privileged !== true || result.maxPreparedTransactions !== 0 || result.preparedTransactions !== 0 || result.clientSessions !== 0 || result.fresh !== true) throw new Failure('runtime-pool'); integer(result.databaseOid, 1, 0xffffffff); databaseOid ??= result.databaseOid; };
 const authenticate = async (role: 'fixture' | 'worker', epoch: number, token: string, deadline: number) => { if (!listener) throw new Failure('service-children'); check(); const stream = await bounded(d.clock, deadline, () => listener!.next(), 'service-children'); const peer = new Channel(stream, d.clock, id, 9 * 1024 * 1024, role); peers.push(peer); const hello = await peer.raw(deadline); exact(hello, ['v', 'type', 'role', 'epoch', 'token']); hex(hello.token, 64); if (hello.v !== 1 || hello.type !== 'hello' || hello.role !== role || hello.epoch !== epoch || !timingSafeEqual(Buffer.from(hello.token), Buffer.from(token))) throw new Failure('service-children'); check(); peer.activate(laneDeadline, error => { if (!first && error instanceof Failure) { channelFailure = error; fail(error.label); } abort('failure'); }); return peer; };
 const initialize = async (peer: Channel, payload: Record<string, unknown>, deadline: number) => {
  check();
  const ack = await peer.request('init', { ...payload, remainingLaneMs: remaining(21600000) }, 'init-ack', deadline);
  exact(ack.payload, []);
  check();
  const pendingReady = peer.receive(deadline);
  pendingReady.catch(() => undefined);
  await peer.send('begin', {}, deadline);
  const ready = await pendingReady;
  if (ready.type !== 'ready') throw new Failure('control');
  check();
  return ready;
 };
 const abort = (reason: 'failure' | 'interrupt' | 'deadline') => { if (!['failure', 'interrupt', 'deadline'].includes(reason)) throw new Failure('service-children'); fail('service-children'); for (const peer of peers) peer.cancel(); channel?.cancelOrdinary(); if (!recoveryDeadline) recoveryDeadline = d.clock.now() + 300000; if (channel && !priority && !containment) { const deadline = Math.min(recoveryDeadline, d.clock.now() + 15000); channel.resume(); priority = channel.send('abort-job', { remainingMs: remaining(15000, recoveryDeadline) }, deadline).then(async abortId => { const result = await channel!.receive(deadline); if (result.type === 'cancelled') { exact(result.payload, ['commandId']); hex(result.payload.commandId, 32); const next = await channel!.receive(deadline); if (next.id !== abortId) throw new Failure('service-children'); jobEmpty(next, false); } else { if (result.id !== abortId || result.type !== 'job-empty') throw new Failure('service-children'); jobEmpty(result, false); } }).catch(() => { fail('service-children'); }); } };
 function run(): Promise<SupervisorEvidence> {
  if (runPromise) return runPromise; if (disposed || first) { runPromise = Promise.reject(new Failure(first ?? 'service-children')); return runPromise; }
  laneDeadline = d.clock.now() + 21600000;
  runPromise = (async () => { try {
   check();
   if (!dependencies) {
    // Read-only source/executable preflight precedes owned resource acquisition.
    const files = [input.powershellExecutable, input.jobScript, input.configure.nodeExecutable, input.configure.loaderPath, input.configure.fixtureEntrypoint, input.configure.workerEntrypoint];
    for (const file of files) {
     const stat = lstatSync(file);
     if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(file) !== file) throw new Failure('receipt');
    }
    const cwd = lstatSync(input.configure.cwd);
    if (!cwd.isDirectory() || cwd.isSymbolicLink() || realpathSync(input.configure.cwd) !== input.configure.cwd) throw new Failure('receipt');
   }
   authority = await bounded(d.clock, Math.min(laneDeadline, d.clock.now() + 60000), () => input.acquisition.create(), 'owned-database'); check(); validatePgPort(authority.port);
   const pipe = `\\\\.\\pipe\\explorers-guides-${input.runId}-${id()}`;
   listener = await bounded(d.clock, Math.min(laneDeadline, d.clock.now() + 10000), () => d.listen(pipe), 'service-children'); check();
   launcher = d.launch(input.powershellExecutable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', input.jobScript], input.configure.cwd); channel = new Channel(launcher.stream, d.clock, id, 65536); channel.activate(laneDeadline, error => { if (!first && error instanceof Failure) { channelFailure = error; fail(error.label); } abort('failure'); });
   const configured = await request('configure', { ...input.configure }, 'configured', 10000); exact(configured.payload, []);
   const fixtureToken = d.randomHex(32); hex(fixtureToken, 64); const launched = await request('launch-fixture', { pipe, token: fixtureToken }, 'launched', 10000); exact(launched.payload, ['slot']); if (launched.payload.slot !== 'fixture') throw new Failure('service-children');
   fixture = await authenticate('fixture', 0, fixtureToken, Math.min(laneDeadline, d.clock.now() + 60000));
   const fixtureReady = await initialize(fixture, { runId: input.runId, commit: input.commit, authority, disposableDirectory: input.disposableDirectory, storageDirectory: input.storageDirectory, origin: input.origin, apiOrigin: input.apiOrigin, harnessPort: input.harnessPort, frontendPort: input.frontendPort, personas: input.personas, harnessCapability: d.randomHex(32) }, Math.min(laneDeadline, d.clock.now() + 60000)); exact(fixtureReady.payload, ['harnessOrigin']); if (fixtureReady.payload.harnessOrigin !== `http://127.0.0.1:${input.harnessPort}`) throw new Failure('vite');
   const completed = new Set<string>(); let epoch = 0, active: Identity | undefined, observed = false;
   while (true) { check(); const command = await fixture.receive(laneDeadline); check();
    if (command.type === 'start-worker') { exact(command.payload, ['epoch', 'identity']); if (worker || active || epoch === 16 || command.payload.epoch !== epoch + 1) throw new Failure('control'); const identity = input.inventory.find(item => { const value = command.payload.identity as Identity; return value?.caseId === item.caseId && value?.project === item.project && value?.repeat === 0; }); if (!identity || completed.has(JSON.stringify(identity))) throw new Failure('control'); sameIdentity(command.payload.identity, identity); const end = Math.min(laneDeadline, d.clock.now() + 630000); await witness(end); check(); epoch++; active = identity; observed = false; const token = d.randomHex(32); hex(token, 64);
     const result = await request('launch-worker', { epoch, pipe, token }, 'launched', 10000); exact(result.payload, ['slot']); if (result.payload.slot !== epoch) throw new Failure('service-children'); worker = await authenticate('worker', epoch, token, end);
     const ready = await initialize(worker, { runId: input.runId, commit: input.commit, epoch, identity, authority, disposableDirectory: input.disposableDirectory, storageDirectory: input.storageDirectory, origin: input.origin, personas: input.personas, databasePassword: input.databasePassword, authSecret: input.authSecret, apiPort: input.apiPort, controlPort: input.controlPort, initializeDatabase: epoch === 1 }, end);
     exact(ready.payload, ['epoch', 'apiOrigin', 'reset']); if (ready.payload.epoch !== epoch || ready.payload.apiOrigin !== `http://127.0.0.1:${input.apiPort}`) throw new Failure('control'); validateReset(ready.payload.reset, identity);
     check(); fixture.resume(); await fixture.send('start-worker-result', ready.payload, end, command.id); continue;
    }
    if (command.type === 'observe') { exact(command.payload, ['epoch', 'identity']); if (!worker || !active || command.payload.epoch !== epoch) throw new Failure('control'); sameIdentity(command.payload.identity, active); const end = Math.min(laneDeadline, d.clock.now() + 310000); const result = await worker.request('observe', { ...command.payload, remainingLaneMs: remaining(21600000) }, 'observed', end); exact(result.payload, ['epoch', 'observation']); if (result.payload.epoch !== epoch) throw new Failure('control');
     const observation = result.payload.observation;
     exact(observation, ['version', 'action', 'runId', 'commit', 'caseId', 'project', 'repeat', 'generation', 'personas', 'guides', 'sections', 'media', 'objects', 'attachments']);
     if (observation.version !== 1 || observation.action !== 'observe' || observation.runId !== input.runId || observation.commit !== input.commit || observation.generation !== 1 || Buffer.byteLength(JSON.stringify(observation)) > 8 * 1024 * 1024) throw new Failure('control');
     sameIdentity({ caseId: observation.caseId, project: observation.project, repeat: observation.repeat }, active);
     for (const key of ['guides', 'sections', 'media', 'objects', 'attachments']) if (!Array.isArray(observation[key])) throw new Failure('control');
     check(); observed = true; fixture.resume(); await fixture.send('observe-result', result.payload, end, command.id); continue; }
    if (command.type === 'retire-worker') { exact(command.payload, ['epoch', 'identity', 'nativeComplete', 'producersClosed', 'controlIdle']); if (!worker || !active || !observed || command.payload.epoch !== epoch || command.payload.nativeComplete !== true || command.payload.producersClosed !== true || command.payload.controlIdle !== true) throw new Failure('control'); sameIdentity(command.payload.identity, active); const end = Math.min(laneDeadline, d.clock.now() + 30000); check(); worker.beginWorkerRetirement(); const result = await request('terminate-worker', { epoch, remainingMs: remaining(10000, end) }, 'terminated', 10000); exact(result.payload, ['epoch', 'processSignaled']); if (result.payload.epoch !== epoch || result.payload.processSignaled !== true) throw new Failure('service-children'); check(); await witness(end); check(); worker.stop(); await worker.stream.close(); worker = undefined; completed.add(JSON.stringify(active)); active = undefined; fixture.resume(); await fixture.send('retired', { epoch }, end, command.id); continue; }
    if (command.type === 'complete') { exact(command.payload, ['browserExitCode']); if (command.payload.browserExitCode !== 0 || completed.size !== 16 || worker || active) throw new Failure('browser'); check(); fixture.acceptFixtureCompletion(); const finish = await request('finish-job', { remainingMs: remaining(15000) }, 'job-empty', 15000); jobEmpty(finish, true); exitAttempted = true; const exit = await request('exit', { remainingMs: remaining(5000) }, 'exit-ack', 5000); exact(exit.payload, ['handlesClosed']); if (exit.payload.handlesClosed !== true) throw new Failure('service-children'); handles = true; const actual = await bounded(d.clock, Math.min(laneDeadline, d.clock.now() + 5000), () => launcher!.exited(), 'service-children'); if (actual.code !== 0 || actual.closed !== true) throw new Failure('service-children'); launcherClosed = true; check(); fixture.stop(); return Object.freeze({ completedEpochs: 16, activeProcesses: 0, fixtureExitCode: 0, launcherExitCode: 0, handlesClosed: true, databaseOid: databaseOid! }); }
    throw new Failure(command.type === 'fatal' ? 'control' : 'service-children');
   }
  } catch (error) { fail(error instanceof Failure ? error.label : 'service-children'); abort('failure'); throw new Failure(first!, channelFailure?.cleanup ?? (error instanceof Failure ? error.cleanup : undefined)); } })(); return runPromise;
 }
 function dispose(): Promise<DisposalEvidence> {
  if (disposalPromise) return disposalPromise; disposed = true; if (!recoveryDeadline) recoveryDeadline = d.clock.now() + 300000;
  disposalPromise = (async () => { if (launcher && !containment) abort('failure'); if (priority) await bounded(d.clock, recoveryDeadline, () => priority!, 'service-children').catch(() => fail('service-children'));
   if (launcher && (!containment || !handles || !launcherClosed)) { fail('service-children'); if (containment && channel && !handles && !exitAttempted) try { exitAttempted = true; const result = await request('exit', { remainingMs: remaining(5000, recoveryDeadline) }, 'exit-ack', 5000, true); exact(result.payload, ['handlesClosed']); if (result.payload.handlesClosed !== true) throw new Failure('service-children'); handles = true; const actual = await bounded(d.clock, Math.min(recoveryDeadline, d.clock.now() + 5000), () => launcher!.exited(), 'service-children'); launcherClosed = actual.code === 0 && actual.closed; } catch { fail('service-children'); } }
   let pg = false; if (!launcher || containment && handles && launcherClosed) { try { if (authority) await witness(recoveryDeadline); await bounded(d.clock, recoveryDeadline, () => input.acquisition.dispose(a => d.drop(a, remaining(15000, recoveryDeadline))), 'owned-database'); pg = true; } catch { fail('owned-database'); } } else fail('owned-database');
   for (const peer of peers) peer.stop(); for (const peer of peers) await bounded(d.clock, recoveryDeadline, () => peer.stream.close(), 'service-children').catch(() => fail('service-children')); if (listener) await bounded(d.clock, recoveryDeadline, () => listener!.close(), 'service-children').catch(() => fail('service-children'));
   if (pg) try { await bounded(d.clock, recoveryDeadline, () => d.disposeCustody(input.custody, remaining(300000, recoveryDeadline)), 'private-directory'); } catch { fail('private-directory'); fail('artifacts'); } else { fail('private-directory'); fail('artifacts'); }
   return Object.freeze({ disposed: failures.size === 0, failures: Object.freeze(LABELS.filter(label => failures.has(label))) }); })(); return disposalPromise;
 }
 return Object.freeze({ run, abort, dispose });
}







