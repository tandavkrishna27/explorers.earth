import { randomBytes, randomUUID, createHmac, createHash } from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createPortServer } from 'node:net';
import type { Socket as NetworkSocket } from 'node:net';
import { mkdirSync, writeFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { startOwnedUatDatabase, stopOwnedUatDatabase, MUSIC_UAT_DATABASE_ACK, type OwnedUatDatabaseAuthority } from './music-uat-database';
import { readSecureMusicSecretFile } from '../server/config/secure-music-secret-file';
import { migrateMusicDatabase } from '../server/db/migrate';
import { provisionMusicRuntimeLogin, verifyMusicRuntimeLogin } from '../server/db/music-runtime-role';
import { checkMusicDatabaseReadiness, type MusicDatabaseReadiness } from '../server/db/readiness';
import { createExplorersAuth, resolveExplorersAuthConfig } from '../server/auth/betterAuth';
import { ensureInitialAccount } from '../server/auth/initialAccount';
import { extractProtectedReceiptArguments, createProtectedReceipt, stopProtectedChild, waitProtectedChild } from './protected-browser-receipt';

const root = resolve(import.meta.dirname, '../..'), tunes = join(root, 'tunes'), frontend = join(root, 'explorers-earth');
const pinnedNode = process.execPath;
type Owner = { userId: string; accountId: string; handle: string; cookie: string };
const databaseDeadline = 35000;
function bounded<T>(operation: Promise<T>, milliseconds: number, signal?: AbortSignal): Promise<T> {
  return new Promise((done, reject) => {
    const abort = () => finish(() => reject(new Error('Owned operation interrupted')));
    const timer = setTimeout(() => finish(() => reject(new Error('Owned operation deadline exceeded'))), milliseconds);
    const finish = (complete: () => void) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); complete(); };
    operation.then(value => finish(() => done(value)), () => finish(() => reject(new Error('Owned operation failed'))));
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  });
}
function ownedPool(connectionString: string, clients: Set<pg.PoolClient>) {
  const pool = new pg.Pool({ connectionString, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 30000, query_timeout: 30000 });
  pool.on('acquire', client => clients.add(client)); pool.on('release', (_error, client) => clients.delete(client)); pool.on('remove', client => clients.delete(client));
  // Explicit client termination during interrupted/expired cleanup may emit pool errors.
  pool.on('error', () => undefined);
  return pool;
}
async function closePool(pool: pg.Pool | undefined, clients: Set<pg.PoolClient>) {
  if (!pool) return;
  const closing = pool.end();
  try { await bounded(closing, 5000); }
  catch {
    for (const client of [...clients]) { try { client.release(true); } catch { } }
    await bounded(closing, 5000).catch(() => undefined);
    throw new Error('Owned pool close exceeded deadline');
  }
}
async function privateChild(kind: 'music' | 'canonical') {
  if (!process.send || !process.connected || process.argv.length !== 4) throw new Error('Private child custody missing');
  const initialization = await new Promise<any>(done => process.once('message', done));
  if (initialization?.action !== 'initialize' || !/^[a-f0-9]{64}$/.test(initialization.capability)) throw new Error('Private child initialization rejected');
  const wallNow = Date.now; let offset = 0, provider = 'success';
  Date.now = () => wallNow() + offset;
  const realFetch = globalThis.fetch;
  // Explicit deterministic transport seam: production YouTube service still performs
  // its own timeout, bounded body decoding and error shaping.
  if (kind === 'music') globalThis.fetch = async (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    if (target.origin !== 'https://www.googleapis.com' || !['/youtube/v3/search', '/youtube/v3/videos'].includes(target.pathname)) return realFetch(input, init);
    if (target.searchParams.get('key') !== 'fixture-provider-key') throw new Error('Owned provider authority rejected');
    if (provider === 'unavailable') throw new TypeError('Deterministic provider unavailable');
    if (provider === 'timeout') return new Promise((_done, reject) => { const signal = init?.signal; if (!signal) return reject(new Error('Bounded service abort signal missing')); if (signal.aborted) return reject(signal.reason); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
    if (provider === 'rate-limit') return new Response('', { status: 429 });
    if (provider === 'oversized') return new Response(JSON.stringify({ items: [], overflow: 'x'.repeat(140000) }));
    return Response.json({ items: [{ id: { videoId: 'fixture0001' }, snippet: { title: 'Owned provider result', channelTitle: 'Owned provider', thumbnails: { default: { url: 'https://music-fixture.test/thumb.png' } } } }] });
  };
  let shutdown: (() => Promise<void>) | undefined;
  try {
    if (kind === 'music') {
      const { validateOwnedBrowserMusicProfile } = await import('../server/config/music-owned-browser-profile');
      const profile = await validateOwnedBrowserMusicProfile(process.env, initialization.markerPath, initialization.capability);
      const { startMusicServer } = await import('../server/config/music-startup');
      shutdown = (await startMusicServer(process.env, { apiOnly: true }, profile)).shutdown;
    } else {
      const { startCanonicalServer } = await import('../server/auth/canonicalStartup');
      shutdown = (await startCanonicalServer(process.env, { host: '127.0.0.1' })).shutdown;
    }
    process.send!({ action: 'ready', kind });
    process.on('message', async (message: any) => {
      if (message?.capability !== initialization.capability || typeof message.requestId !== 'string') return;
      try {
        if (message.action === 'clock' && [0, 601000].includes(message.offsetMs)) offset = message.offsetMs;
        else if (kind === 'music' && message.action === 'provider' && ['success', 'unavailable', 'timeout', 'rate-limit', 'oversized'].includes(message.mode)) provider = message.mode;
        else if (message.action === 'shutdown') { const close = shutdown; shutdown = undefined; await close!(); process.send!({ action: 'ack', requestId: message.requestId }); process.disconnect(); return; }
        else throw new Error('Private control action rejected');
        process.send!({ action: 'ack', requestId: message.requestId });
      } catch { process.send!({ action: 'failed', requestId: message.requestId }); }
    });
    process.once('disconnect', () => { void shutdown?.().finally(() => process.exit(0)); });
  } catch { await shutdown?.().catch(() => undefined); process.send?.({ action: 'startup-failed', kind }); process.exitCode = 1; process.disconnect(); }
}
async function freePort(min: number, max: number) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const port = min + randomBytes(2).readUInt16BE() % (max - min + 1);
    if (await new Promise<boolean>(done => { const server = createPortServer(); server.once('error', () => done(false)); server.listen(port, '127.0.0.1', () => server.close(() => done(true))); })) return port;
  }
  throw new Error('Owned fixture port allocation failed');
}
function privateWrite(path: string, value: unknown) {
  const contents = typeof value === 'string' ? value : JSON.stringify(value);
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(tunes, 'scripts/music-local-private-files.ps1'), 'create-file', path], { windowsHide: true, input: contents, stdio: ['pipe', 'ignore', 'ignore'] });
  } else writeFileSync(path, contents, { mode: 0o600, flag: 'wx' });
}
async function ipc(child: ChildProcess, capability: string, action: string, values: Record<string, unknown> = {}) {
  if (!child.connected || child.exitCode !== null || child.signalCode !== null) throw new Error('[music-cause:child-unavailable]');
  const requestId = randomUUID();
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => { child.off('message', listener); reject(new Error('[music-cause:child-timeout]')); }, 10000);
    const listener = (message: any) => { if (message?.requestId !== requestId) return; clearTimeout(timer); child.off('message', listener); message.action === 'ack' ? done() : reject(new Error('[music-cause:child-failed]')); };
    child.on('message', listener); child.send!({ capability, action, requestId, ...values });
  });
}
async function boundedStop(child: ChildProcess | undefined) {
  if (!child?.pid) return;
  try { await stopProtectedChild(child); } catch {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32' && Number.isInteger(child.pid)) execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { timeout: 5000, windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGKILL');
    await new Promise<void>((done, reject) => { if (child.exitCode !== null || child.signalCode !== null) return done(); const timer = setTimeout(() => reject(new Error('Owned child force termination timed out')), 5000); child.once('exit', () => { clearTimeout(timer); done(); }); });
  }
}
type ChildOutcome = { kind: 'music' | 'canonical'; pid: number; startedAt: string; stoppedAt?: string; exitCode?: number | null; signal?: NodeJS.Signals | null };
async function launch(kind: 'music' | 'canonical', environment: NodeJS.ProcessEnv, markerPath: string, capability: string, registry: ChildProcess[], outcomes: ChildOutcome[]) {
  const child = spawn(pinnedNode, ['--import', 'tsx', resolve(import.meta.filename), '--private-child', kind], { cwd: tunes, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: environment });
  registry.push(child);
  const outcome: ChildOutcome = { kind, pid: child.pid ?? 0, startedAt: new Date().toISOString() }; outcomes.push(outcome);
  child.once('exit', (exitCode, signal) => Object.assign(outcome, { stoppedAt: new Date().toISOString(), exitCode, signal }));
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => reject(new Error(`Owned ${kind} startup timed out`)), 60000);
    child.once('error', () => { clearTimeout(timer); reject(new Error(`Owned ${kind} spawn failed`)); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`Owned ${kind} exited before readiness`)); });
    child.on('message', (message: any) => { if (message?.action === 'ready') { clearTimeout(timer); done(); } else if (message?.action === 'startup-failed') { clearTimeout(timer); reject(new Error(`Owned ${kind} production startup failed`)); } });
    child.send!({ action: 'initialize', markerPath, capability }, error => { if (error) { clearTimeout(timer); reject(new Error(`Owned ${kind} IPC initialization failed`)); } });
  });
  return child;
}
async function main() {
  const args = extractProtectedReceiptArguments(process.argv.slice(2));
  if (JSON.stringify(args.args) !== JSON.stringify(['--ack', MUSIC_UAT_DATABASE_ACK])) throw new Error('Music browser requires exact disposable PG15 acknowledgement');
  if (process.version !== 'v24.21.0') throw new Error('Pinned Music qualification Node runtime required');
  for (const [key, value] of Object.entries(process.env)) if (value && (/^(DATABASE_URL|DATABASE_URL_TEST|DOCKER_HOST|DOCKER_CONTEXT|GATE_PROD|STRAPI_|GOOGLE_|YOUTUBE_|EXPLORERS_AUTH_|MUSIC_)/.test(key) || key.startsWith('PLAYWRIGHT_') || key.startsWith('VITE_'))) throw new Error('Ambient Music/provider/browser authority forbidden');
  const receipt = await createProtectedReceipt(root, 'music', args);
  if (!receipt) throw new Error('Music requires protected registration and source freeze receipt custody');
  const contract = await import(pathToFileURL(join(root, 'scripts/replatform-e2e.mjs')).href);
  const provenance = contract.snapshotSource(root).provenance;
  const unchanged = () => { if (JSON.stringify(contract.snapshotSource(root).provenance) !== JSON.stringify(provenance)) throw new Error('Music frozen source changed'); };
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const runId = randomBytes(16).toString('hex'), capability = randomBytes(32).toString('hex');
  const disposable = join(tmpdir(), `explorers-music-e2e-${runId}`);
  const secretFiles: string[] = [], children: ChildProcess[] = [], failures: string[] = [];
  const outcomes: ChildOutcome[] = [];
  const databaseClients = new Set<pg.PoolClient>(), controlConnections = new Set<NetworkSocket>(), cancellation = new AbortController();
  let schema: MusicDatabaseReadiness | undefined, topologyTransport: Record<string, string> | undefined, verifiedRuntimeRole: string | undefined;
  let phase: 'startup' | 'discovery' | 'execution' | 'cleanup' = 'startup', qualificationFailed = false, browserSucceeded = false;
  let authority: OwnedUatDatabaseAuthority | undefined, migrator: pg.Pool | undefined, runtime: pg.Pool | undefined, controlServer: ReturnType<typeof createHttpServer> | undefined, vite: ChildProcess | undefined, browser: ChildProcess | undefined, interrupted = false;
  const secret = (name: string) => { const file = join(disposable, name); privateWrite(file, randomBytes(32).toString('base64url')); secretFiles.push(file); return file; };
  const stop = () => { interrupted = true; cancellation.abort(); browser?.kill(); for (const child of children) child.kill(); vite?.kill(); for (const connection of controlConnections) connection.destroy(); for (const client of [...databaseClients]) { try { client.release(true); } catch { } } };
  const continuing = () => { if (interrupted) throw new Error('Owned Music qualification interrupted'); unchanged(); };
  const setup = <T>(operation: Promise<T>, milliseconds = databaseDeadline) => bounded(operation, milliseconds, cancellation.signal);
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    continuing();
    if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(tunes, 'scripts/music-local-private-files.ps1'), 'create-directory', disposable], { windowsHide: true, stdio: 'ignore' });
    else mkdirSync(disposable, { mode: 0o700 });
    const pgPort = await freePort(56000, 60999), canonicalPort = await freePort(54000, 54999), musicPort = await freePort(55000, 55999), webPort = await freePort(52000, 52999), controlPort = await freePort(51000, 51999);
    const browserOrigin = `http://127.0.0.1:${webPort}`, controlOrigin = `http://127.0.0.1:${controlPort}`;
    const migratorPasswordFile = secret('migrator-password'), runtimePasswordFile = secret('runtime-password'), tokenSecretFile = secret('token-secret'), capabilityFile = join(disposable, 'capability'); privateWrite(capabilityFile, capability);
    const migratorPassword = await readSecureMusicSecretFile(migratorPasswordFile, { mode: 'live' }), runtimePassword = await readSecureMusicSecretFile(runtimePasswordFile, { mode: 'live' });
    continuing(); authority = await startOwnedUatDatabase({ runId, database: `music_uat_${runId}`, commit, port: pgPort, passwordFile: migratorPasswordFile }); continuing();
    const migratorUrl = `postgresql://music_migrator:${migratorPassword}@127.0.0.1:${pgPort}/${authority.database}`;
    migrator = ownedPool(migratorUrl, databaseClients); await setup(migrateMusicDatabase(migrator), 120000); continuing();
    const runtimeRole = `music_browser_${runId.slice(0, 12)}`;
    await setup(provisionMusicRuntimeLogin(migrator, { loginRole: runtimeRole, password: runtimePassword }, { ownershipComment: `music-browser:${runId}:${commit}` })); continuing();
    runtime = ownedPool(`postgresql://${runtimeRole}:${runtimePassword}@127.0.0.1:${pgPort}/${authority.database}`, databaseClients);
    await setup(verifyMusicRuntimeLogin(migrator, runtime, { loginRole: runtimeRole })); continuing();
    schema = await setup(checkMusicDatabaseReadiness(runtime)); if (!schema.ready) throw new Error('Owned runtime schema is not ready'); verifiedRuntimeRole = runtimeRole; continuing();
    topologyTransport = { browserOrigin, canonicalOrigin: `http://127.0.0.1:${canonicalPort}`, musicOrigin: `http://127.0.0.1:${musicPort}`, logicalMusicOrigin: 'https://music-fixture.test', socketPath: '/__localtunes/ws' };
    const authSecret = randomBytes(32).toString('base64url');
    const authConfig = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: browserOrigin, EXPLORERS_AUTH_SECRET: authSecret, GOOGLE_CLIENT_ID: 'owned-google-fixture', GOOGLE_CLIENT_SECRET: 'owned-google-fixture-only' });
    const auth = createExplorersAuth(runtime, authConfig), authContext = await setup(auth.$context); continuing();
    async function issueSession(owner: Omit<Owner, 'cookie'>): Promise<Owner> { continuing(); const session = await setup(authContext.internalAdapter.createSession(owner.userId, false)); continuing(); const signature = createHmac('sha256', authSecret).update(session.token).digest('base64'); return { ...owner, cookie: `${authContext.authCookies.sessionToken.name}=${session.token}.${signature}` }; }
    const owners: Owner[] = [];
    for (let n = 0; n < 48; n++) {
      continuing();
      const userId = `music-browser-${randomUUID()}`, handle = `music${runId.slice(0, 8)}${n}`;
      await setup(migrator.query('INSERT INTO auth_user(id,name,email) VALUES($1,$2,$3)', [userId, `Owned Music ${n}`, `${userId}@example.invalid`])); continuing();
      await setup(migrator.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())", [randomUUID(), `google-${userId}`, userId])); continuing();
      const { accountId } = await setup(ensureInitialAccount(runtime, userId)); continuing();
      await setup(migrator.query("UPDATE creator_accounts SET handle=$2,display_name=$3,account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1", [accountId, handle, `Owned Music ${n}`])); continuing();
      owners.push(await issueSession({ userId, accountId, handle }));
    }
    const environment: NodeJS.ProcessEnv = { ...contract.childNodeEnvironment(process.env), NODE_ENV: 'test', TZ: 'UTC', PORT: String(musicPort), EXPLORERS_PUBLIC_ORIGIN: browserOrigin, EXPLORERS_AUTH_SECRET: authSecret, GOOGLE_CLIENT_ID: authConfig.googleClientId, GOOGLE_CLIENT_SECRET: authConfig.googleClientSecret, MUSIC_MODE: 'fixture', MUSIC_DATABASE_HOST: '127.0.0.1', MUSIC_DATABASE_PORT: String(pgPort), MUSIC_DATABASE_NAME: authority.database, MUSIC_DATABASE_USER: runtimeRole, MUSIC_DATABASE_MIGRATOR_USER: 'music_migrator', MUSIC_DATABASE_PASSWORD_FILE: runtimePasswordFile, MUSIC_TOKEN_CURRENT_KID: `owned-${runId}`, MUSIC_TOKEN_CURRENT_SECRET_FILE: tokenSecretFile, MUSIC_TOKEN_LIFETIME_SECONDS: '600', MUSIC_TOKEN_CLOCK_SKEW_SECONDS: '0', MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: 'fixture-publication-v1', MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY: 'fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI', MUSIC_PUBLIC_ID_HMAC_KEY: 'VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ', SESSION_SECRET: randomBytes(32).toString('base64url'), COOKIE_SECRET: randomBytes(32).toString('base64url'), STRAPI_JWT_SECRET: randomBytes(32).toString('base64url'), ALLOWED_ORIGINS: browserOrigin, STRAPI_URL: controlOrigin, MUSIC_FIXTURE_STRAPI_ORIGIN: controlOrigin, STRAPI_ACCESS_TOKEN: 'fixture-read-only-token', STRAPI_LIFECYCLE_PROOF_TOKEN: 'fixture-read-only-token', TRUST_PROXY_HOPS: '0', YOUTUBE_API_KEY: 'fixture-provider-key', MUSIC_PROVISIONING_KILL_SWITCH: 'true', MUSIC_PROVISIONING_COHORT: 'disabled', MUSIC_NEW_ENTRY_KILL_SWITCH: 'true', MUSIC_RECONCILIATION_ENABLED: 'false', MUSIC_RECONCILIATION_MAX_ROWS: '0', MUSIC_RECONCILIATION_APPLY_ENABLED: 'false', MUSIC_WORKSPACE_KILL_SWITCH: 'false', MUSIC_FEATURE_OWNER_WORKSPACE_ALLOWLIST: owners.map(value => value.accountId).join(','), MUSIC_FEATURE_GUEST_WORKSPACE_ALLOWLIST: owners.map(value => value.accountId).join(','), MUSIC_FEATURE_OWNER_WORKSPACE_PERCENT: '0', MUSIC_FEATURE_GUEST_WORKSPACE_PERCENT: '0', MUSIC_FEATURE_PLAYLIST_IMPORTS_ALLOWLIST: '', MUSIC_FEATURE_PLAYLIST_IMPORTS_PERCENT: '0', MUSIC_FEATURE_COHORT_VERSION: `owned-browser-${runId}`, MUSIC_FEATURE_COHORT_SALT: runId, MUSIC_FIXTURE_SKIP_ANALYTICS_SCHEMA_DDL: 'true', MUSIC_FIXTURE_ANALYTICS_SCHEMA_MARKER: 'explorers-analytics-receipts-v1' };
    const markerPath = join(disposable, 'startup-marker.json');
    privateWrite(markerPath, { version: 1, root, runId, commit, provenance: createHash('sha256').update(JSON.stringify(provenance)).digest('hex'), authority: { database: authority.database, port: authority.port, containerId: authority.containerId, imageId: authority.imageId }, runtimeRole, runtimePasswordFile, migratorPasswordFile, tokenSecretFile, capabilityFile, browserOrigin, canonicalPort, musicPort, accounts: owners.map(value => value.accountId), environment });
    let next = 0, activeCase: { id: string; owner: Owner; second: Owner } | undefined;
    let musicChild: ChildProcess | undefined, canonicalChild: ChildProcess | undefined;
    controlServer = createHttpServer(async (request, response) => {
      try {
        continuing();
        if (request.method !== 'POST' || request.url !== '/control' || request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== `127.0.0.1:${controlPort}` || request.headers['x-music-fixture-capability'] !== capability) throw new Error('Owned control denied');
        let bytes = ''; await setup((async () => { for await (const chunk of request) { bytes += chunk; if (bytes.length > 4096) throw new Error('Owned control bounds'); } })(), 5000); continuing();
        const body = JSON.parse(bytes); if (typeof body.caseId !== 'string' || !/^music-(desktop|mobile):/.test(body.caseId)) throw new Error('Owned case identity denied');
        let value: unknown = {};
        if (body.action === 'prepare') { if (activeCase) throw new Error('[music-cause:control-active-case]'); if (next >= owners.length) throw new Error('[music-cause:control-scenario-exhausted]'); const owner = owners[next++], second = owners[next++]; activeCase = { id: body.caseId, owner, second }; let secondSession: Owner; try { secondSession = await issueSession(owner); } catch { throw new Error('[music-cause:control-session-failed]'); } value = { owners: [owner, second], secondSession }; }
        else {
          if (!activeCase || body.caseId !== activeCase.id) throw new Error('[music-cause:control-case-mismatch]');
          if (body.action === 'clock') { if (![0, 601000].includes(body.offsetMs)) throw new Error('Clock bounds'); await ipc(musicChild!, capability, 'clock', { offsetMs: body.offsetMs }); await ipc(canonicalChild!, capability, 'clock', { offsetMs: body.offsetMs }); }
          else if (body.action === 'provider') await ipc(musicChild!, capability, 'provider', { mode: body.mode });
          else if (body.action === 'reset') { await ipc(musicChild!, capability, 'clock', { offsetMs: 0 }); await ipc(canonicalChild!, capability, 'clock', { offsetMs: 0 }); await ipc(musicChild!, capability, 'provider', { mode: 'success' }); activeCase = undefined; }
          else if (body.action === 'mapping') { const result = await setup(runtime!.query('SELECT count(*)::int AS count FROM account_music_identity WHERE account_id=$1', [activeCase.owner.accountId])); value = { identityRows: result.rows[0].count }; }
          else if (body.action === 'suspend') {
            const account = await setup(runtime!.query('SELECT revision::text FROM creator_accounts WHERE id=$1', [activeCase.owner.accountId]));
            if (account.rows.length !== 1) throw new Error('Owned canonical account missing');
            const deactivated = await setup(fetch(`http://127.0.0.1:${canonicalPort}/api/explorers/v1/account/deactivation`, {
              method: 'POST', headers: { Cookie: activeCase.owner.cookie, Origin: browserOrigin, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
              body: JSON.stringify({ expectedRevision: Number(account.rows[0].revision) }), signal: cancellation.signal,
            }));
            const deactivation = await setup(deactivated.json()) as { lifecycle?: { status?: string; operationId?: string } };
            if (deactivated.status !== 200 || deactivation.lifecycle?.status !== 'suspended' || !deactivation.lifecycle.operationId)
              throw new Error('Owned canonical deactivation incomplete');
          }
          else if (body.action === 'notify' && Number.isSafeInteger(body.revision) && body.revision >= 1) { const mapping = await setup(runtime!.query('SELECT music_user_id FROM account_music_identity WHERE account_id=$1', [activeCase.owner.accountId])); continuing(); await setup(runtime!.query("SELECT pg_notify('music_public_change',$1)", [JSON.stringify({ musicUserId: mapping.rows[0].music_user_id, kind: 'queue_changed', revision: body.revision })])); }
          else throw new Error('Owned action denied');
        }
        continuing(); response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value));
      } catch (error) {
        const cause = error instanceof Error ? error.message.match(/^\[music-cause:(child-unavailable|child-timeout|child-failed|control-active-case|control-scenario-exhausted|control-case-mismatch|control-session-failed)\]$/)?.[1] : undefined;
        response.writeHead(403, { 'content-type': 'application/json' }); response.end(JSON.stringify({ cause: cause ?? 'control-other' }));
      }
    });
    controlServer.requestTimeout = 5000; controlServer.headersTimeout = 5000; controlServer.keepAliveTimeout = 1000;
    controlServer.on('connection', connection => { controlConnections.add(connection); connection.setTimeout(5000, () => connection.destroy()); connection.once('close', () => controlConnections.delete(connection)); });
    await setup(new Promise<void>((done, reject) => { controlServer!.once('error', reject); controlServer!.listen(controlPort, '127.0.0.1', done); }), 5000); continuing();
    continuing(); musicChild = await launch('music', environment, markerPath, capability, children, outcomes); continuing();
    canonicalChild = await launch('canonical', { ...environment, PORT: String(canonicalPort) }, markerPath, capability, children, outcomes); continuing();
    const fixturePath = join(disposable, 'sessions.json'); privateWrite(fixturePath, { origin: browserOrigin, musicOrigin: `http://127.0.0.1:${musicPort}`, control: { origin: controlOrigin, capability }, sessionSeam: 'better-auth-internal-adapter' });
    vite = spawn(pinnedNode, [join(frontend, 'node_modules/vite/bin/vite.js'), '--config', 'e2e/replatform/music.vite.config.ts'], { cwd: frontend, windowsHide: true, stdio: 'ignore', env: { ...process.env, PATH: environment.PATH, MUSIC_E2E_LOCAL_AUTHORITY: 'owned-disposable-pg15', MUSIC_E2E_WEB_PORT: String(webPort), MUSIC_E2E_CANONICAL_PORT: String(canonicalPort), MUSIC_E2E_MUSIC_PORT: String(musicPort) } });
    for (let attempt = 0; ; attempt++) { continuing(); try { if ((await fetch(browserOrigin, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { } if (attempt === 120) throw new Error('Owned Music web startup failed'); await new Promise(done => setTimeout(done, 250)); }
    const browserEnvironment = { ...process.env, PATH: environment.PATH, MUSIC_E2E_FIXTURE_PATH: fixturePath, PLAYWRIGHT_EXTERNAL_BASE_URL: browserOrigin };
    const browserArguments = receipt.arguments(['--config', 'e2e/replatform/music.playwright.config.ts', '--workers=1', '--retries=0', '--forbid-only'], disposable);
    continuing(); phase = 'discovery'; receipt.discovery(frontend, browserArguments, browserEnvironment, disposable); continuing(); phase = 'execution';
    browser = spawn(pinnedNode, [join(frontend, 'node_modules/@playwright/test/cli.js'), 'test', ...browserArguments, '--reporter=json,line'], { cwd: frontend, windowsHide: true, stdio: 'ignore', env: receipt.executionEnvironment(browserEnvironment, disposable) });
    const result = await new Promise<{status: number | null; signal: NodeJS.Signals | null}>((done, reject) => { const deadline = setTimeout(() => { browser!.kill(); reject(new Error('Owned browser deadline exceeded')); }, 60 * 60 * 1000); browser!.once('error', () => { clearTimeout(deadline); reject(new Error('Owned browser launch failed')); }); browser!.once('exit', (status, signal) => { clearTimeout(deadline); done({status, signal}); }); });
    receipt.execution(result.status, result.signal, disposable); browserSucceeded = result.status === 0 && result.signal === null; unchanged();
  } catch { qualificationFailed = true; }
  finally {
    try { await boundedStop(browser); } catch { failures.push('browser'); }
    try { await boundedStop(vite); } catch { failures.push('vite'); }
    for (const child of [...children].reverse()) { try { await ipc(child, capability, 'shutdown'); await waitProtectedChild(child); } catch { try { await boundedStop(child); } catch { failures.push('service-children'); } } }
    if (controlServer) try { const closing = new Promise<void>((done, reject) => controlServer!.close(error => error ? reject(error) : done())); for (const connection of controlConnections) connection.destroy(); controlServer.closeAllConnections(); await bounded(closing, 5000); } catch { failures.push('control'); }
    await closePool(runtime, databaseClients).catch(() => failures.push('runtime-pool')); await closePool(migrator, databaseClients).catch(() => failures.push('migrator-pool'));
    if (authority) try { await stopOwnedUatDatabase(authority, { dropDatabase: async owned => { const password = await bounded(readSecureMusicSecretFile(secretFiles[0], { mode: 'live' }), 5000); const adminClients = new Set<pg.PoolClient>(); const admin = ownedPool(`postgresql://music_migrator:${password}@127.0.0.1:${owned.port}/postgres`, adminClients); try { await bounded(admin.query(`DROP DATABASE ${owned.database}`), databaseDeadline); } finally { await closePool(admin, adminClients); } } }); } catch { failures.push('owned-database'); }
    try { if (existsSync(disposable)) { if (realpathSync(disposable) !== resolve(disposable) || dirname(resolve(disposable)) !== resolve(tmpdir())) failures.push('private-directory'); else rmSync(disposable, { recursive: true, force: true }); } } catch { failures.push('artifacts'); }
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
  }
  if (failures.length) phase = 'cleanup';
  try { if (authority && !failures.length && !interrupted && phase === 'execution') {
    if (!qualificationFailed && browserSucceeded && schema?.ready && verifiedRuntimeRole && topologyTransport) receipt.topology({ version: 1, lane: 'music', provenance, authority: { database: authority.database, containerId: authority.containerId, imageId: authority.imageId }, runtime: { role: verifiedRuntimeRole, migratorRole: 'music_migrator', verified: true }, schema, transport: topologyTransport, children: ['canonical', 'music'].map(kind => outcomes.find(item => item.kind === kind)), seams: { session: 'better-auth-internal-adapter', provider: 'guarded-youtube-transport', clock: 'virtual-date-now-601000ms' }, cleanup: { status: 'passed' } });
    receipt.finish(authority, failures, interrupted);
  } else qualificationFailed = true; } catch { qualificationFailed = true; }
  if (qualificationFailed || failures.length || interrupted) { receipt.failure(phase, [...new Set(failures)], interrupted); process.stderr.write('Owned Music qualification failed; sanitized evidence retained\n'); process.exitCode = 1; }
}
if (process.argv[2] === '--private-child') {
  const kind = process.argv[3]; if (kind !== 'music' && kind !== 'canonical') throw new Error('Unknown private child'); await privateChild(kind);
} else await main();
