/** Standalone, explicitly acknowledged owned PG15 custody proof. Never a browser receipt. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { registerHooks } from 'node:module';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync, readFileSync, renameSync, linkSync, unlinkSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { join, resolve, dirname, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { startOwnedUatDatabase, stopOwnedUatDatabase, MUSIC_UAT_DATABASE_ACK, type OwnedUatDatabaseAuthority } from './music-uat-database';
import { readSecureMusicSecretFile } from '../server/config/secure-music-secret-file';
import { migrateMusicDatabase } from '../server/db/migrate';
import { provisionMusicRuntimeLogin, verifyMusicRuntimeLogin } from '../server/db/music-runtime-role';
import { checkMusicDatabaseReadiness } from '../server/db/readiness';
import { ensureInitialAccount } from '../server/auth/initialAccount';

const root = resolve(import.meta.dirname, '../..'), tunes = join(root, 'tunes');
const scriptDigest = () => createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex');
const rejection = 'Owned preflight rejected';
type Result = { case: string; outcome: 'positive' | 'rejected'; listener: boolean; graceful: boolean; phase: string };
type Failure = { phase: string; locations: { source: string; line: number; column: number }[] };
function failureDiagnostic(error: unknown, phase: string): Failure {
  const sources = new Set(['music-owned-browser-preflight.ts', 'music-owned-browser-profile.ts', 'music-startup.ts', 'music-database-config.ts', 'secure-music-secret-file.ts', 'music-runtime-role.ts', 'readiness.ts']);
  const locations: Failure['locations'] = [];
  if (error instanceof Error) for (const match of (error.stack ?? '').matchAll(/[\\/]([^\\/:()\s]+):(\d+):(\d+)/g)) {
    if (sources.has(match[1]) && locations.length < 4) locations.push({ source: match[1], line: Number(match[2]), column: Number(match[3]) });
  }
  return { phase, locations };
}
function bounded<T>(operation: Promise<T>, milliseconds = 35000): Promise<T> {
  return new Promise((done, reject) => { const timer = setTimeout(() => reject(new Error(rejection)), milliseconds); operation.then(value => { clearTimeout(timer); done(value); }, error => { clearTimeout(timer); reject(error); }); });
}
function privateWrite(path: string, value: string | object) {
  const contents = typeof value === 'string' ? value : JSON.stringify(value);
  if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(tunes, 'scripts/music-local-private-files.ps1'), 'create-file', path], { input: contents, windowsHide: true, timeout: 10000, stdio: ['pipe', 'ignore', 'ignore'] });
  else writeFileSync(path, contents, { mode: 0o600, flag: 'wx' });
}
function ownedPool(connectionString: string) {
  const clients = new Set<pg.PoolClient>();
  const pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 30000, query_timeout: 30000 });
  pool.on('acquire', client => clients.add(client)); pool.on('release', (_error, client) => clients.delete(client)); pool.on('remove', client => clients.delete(client)); pool.on('error', () => undefined);
  return { pool, async close() { const closing = pool.end(); try { await bounded(closing, 5000); } catch { for (const client of clients) { try { client.release(true); } catch {} } await bounded(closing, 5000); throw new Error(rejection); } } };
}
async function freePort(min: number, max: number) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const port = min + randomBytes(2).readUInt16BE() % (max - min + 1);
    if (await bounded(new Promise<boolean>(done => { const server = createServer(); server.once('error', () => done(false)); server.listen(port, '127.0.0.1', () => server.close(() => done(true))); }), 5000)) return port;
  }
  throw new Error(rejection);
}
async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  try { await bounded(new Promise<void>(done => child.once('exit', () => done())), 5000); }
  catch {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32' && child.pid) execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { timeout: 5000, windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGKILL');
    await bounded(new Promise<void>(done => { if (child.exitCode !== null || child.signalCode !== null) done(); else child.once('exit', () => done()); }), 5000);
  }
}
async function childMain() {
  if (process.version !== 'v24.21.0' || !process.send || !process.connected || process.argv.length !== 3) throw new Error(rejection);
  const input = await bounded(new Promise<any>(done => process.once('message', done)), 10000);
  if (input?.action !== 'initialize' || input.scriptDigest !== scriptDigest() || !/^[a-f0-9]{64}$/.test(input.capability)) throw new Error(rejection);
  let phase = 'admission', barrierSeen = false, admitted = false;
  // Negative child only: synchronize after the real initial vector, before real resource attestation.
  // The original secure reader, resource verifier, pool, role and schema functions are delegated unchanged.
  let hook: ReturnType<typeof registerHooks> | undefined;
  if (input.barrier === 'after-initial' || input.barrier === 'during-initial') {
    (globalThis as any).__ownedNegativeBarrier = async () => {
      if (barrierSeen) return; barrierSeen = true;
      process.send!({ action: 'barrier' });
      const resume = await bounded(new Promise<any>(done => process.once('message', done)), 10000);
      if (resume?.action !== 'resume' || resume.capability !== input.capability) throw new Error(rejection);
    };
    hook = registerHooks({ load(url, context, nextLoad) {
      const loaded = nextLoad(url, context);
      if (url.split('?')[0] !== pathToFileURL(join(tunes, 'server/config/music-owned-browser-profile.ts')).href) return loaded;
      const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source as Uint8Array).toString('utf8');
      const pattern = input.barrier === 'after-initial'
        ? /(const\s+initialSecrets\s*=\s*await\s+readOwnedBrowserMusicSecretSnapshot\(secretPaths\);)/
        : /(const\s+value\s*=\s*await\s+readSecureMusicSecretFileWithDistinctAuthorities\(path,[^;]+;)/;
      if (!pattern.test(source)) throw new Error('Negative synchronization source mismatch');
      return { ...loaded, source: source.replace(pattern, '$1 await globalThis.__ownedNegativeBarrier();') };
    } });
  }
  let started: Awaited<ReturnType<typeof import('../server/config/music-startup')['startMusicServer']>> | undefined;
  try {
    const { validateOwnedBrowserMusicProfile } = await import('../server/config/music-owned-browser-profile');
    const profile = await validateOwnedBrowserMusicProfile(process.env, input.markerPath, input.capability);
    admitted = true;
    if (input.case !== 'positive') throw new Error('Negative admission unexpectedly succeeded');
    phase = 'production-startup';
    const { startMusicServer } = await import('../server/config/music-startup');
    started = await startMusicServer(process.env, { apiOnly: true }, profile);
    if (!started.server.listening) throw new Error(rejection);
    const response = await fetch(`http://127.0.0.1:${process.env.PORT}/api/music/owned-preflight-unknown`, { headers: { Origin: process.env.ALLOWED_ORIGINS! }, signal: AbortSignal.timeout(5000) });
    if (response.status < 400 || response.status > 499) throw new Error(rejection);
    phase = 'shutdown'; await bounded(started.shutdown(), 10000);
    if (started.server.listening || process.env.DATABASE_URL) throw new Error(rejection);
    process.send!({ action: 'result', result: { case: input.case, outcome: 'positive', listener: true, graceful: true, phase: 'complete' } });
  } catch (error) {
    if (input.case !== 'positive' && !admitted && phase === 'admission' && !(error instanceof Error && error.message === 'Negative synchronization source mismatch') && (!input.barrier || barrierSeen)) {
      process.send!({ action: 'result', result: { case: input.case, outcome: 'rejected', listener: false, graceful: true, phase } });
    } else { process.send!({ action: 'failed', diagnostic: failureDiagnostic(error, phase) }); process.exitCode = 1; }
  } finally {
    hook?.deregister(); delete (globalThis as any).__ownedNegativeBarrier;
    if (started?.server.listening) await bounded(started.shutdown(), 10000).catch(() => { process.exitCode = 1; });
    process.disconnect();
  }
}
async function main() {
  if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['--ack', MUSIC_UAT_DATABASE_ACK]) || process.version !== 'v24.21.0') throw new Error(rejection);
  for (const [key, value] of Object.entries(process.env)) if (value && /^(DATABASE_|DATABASE_URL|DOCKER_|GATE_PROD|STRAPI_|GOOGLE_|YOUTUBE_|EXPLORERS_|MUSIC_|PLAYWRIGHT_|VITE_|NODE_OPTIONS)/i.test(key)) throw new Error(rejection);
  const contract = await import(pathToFileURL(join(root, 'scripts/replatform-e2e.mjs')).href);
  const provenance = contract.snapshotSource(root).provenance, ownDigest = scriptDigest();
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true }).trim();
  const unchanged = () => { if (scriptDigest() !== ownDigest || JSON.stringify(contract.snapshotSource(root).provenance) !== JSON.stringify(provenance) || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true }).trim() !== commit) throw new Error(rejection); };
  const runId = randomBytes(16).toString('hex'), capability = randomBytes(32).toString('hex');
  const directory = join(tmpdir(), `explorers-music-e2e-${runId}`), results: Result[] = [], cleanupFailures: string[] = [], children = new Set<ChildProcess>();
  let authority: OwnedUatDatabaseAuthority | undefined, migrator: ReturnType<typeof ownedPool> | undefined, runtime: ReturnType<typeof ownedPool> | undefined, interrupted = false, failed = false, phase = 'private-files';
  let childFailure: Failure | undefined;
  const interrupt = () => { interrupted = true; for (const child of children) child.kill(); };
  const continuing = () => { if (interrupted) throw new Error(rejection); unchanged(); };
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(tunes, 'scripts/music-local-private-files.ps1'), 'create-directory', directory], { windowsHide: true, timeout: 10000, stdio: 'ignore' });
    else mkdirSync(directory, { mode: 0o700 });
    const secretPaths = ['capability', 'runtime-password', 'migrator-password', 'token-secret'].map(name => join(directory, name));
    const values = [capability, ...Array.from({ length: 3 }, () => randomBytes(32).toString('hex'))]; secretPaths.forEach((path, index) => privateWrite(path, values[index]));
    const [capabilityFile, runtimePasswordFile, migratorPasswordFile, tokenSecretFile] = secretPaths;
    const pgPort = await freePort(56000, 60999), canonicalPort = await freePort(54000, 54999), musicPort = await freePort(55000, 55999), webPort = await freePort(52000, 52999), controlPort = await freePort(51000, 51999);
    const browserOrigin = `http://127.0.0.1:${webPort}`, controlOrigin = `http://127.0.0.1:${controlPort}`;
    const migratorPassword = await readSecureMusicSecretFile(migratorPasswordFile, { mode: 'live' }), runtimePassword = await readSecureMusicSecretFile(runtimePasswordFile, { mode: 'live' });
    continuing(); phase = 'owned-resource'; authority = await startOwnedUatDatabase({ runId, database: `music_uat_${runId}`, commit, port: pgPort, passwordFile: migratorPasswordFile }); continuing();
    migrator = ownedPool(`postgresql://music_migrator:${migratorPassword}@127.0.0.1:${pgPort}/${authority.database}`);
    phase = 'migration'; await bounded(migrateMusicDatabase(migrator.pool), 120000); continuing();
    const runtimeRole = `music_browser_${runId.slice(0, 12)}`;
    await bounded(provisionMusicRuntimeLogin(migrator.pool, { loginRole: runtimeRole, password: runtimePassword }, { ownershipComment: `music-browser:${runId}:${commit}` })); continuing();
    runtime = ownedPool(`postgresql://${runtimeRole}:${runtimePassword}@127.0.0.1:${pgPort}/${authority.database}`);
    await bounded(verifyMusicRuntimeLogin(migrator.pool, runtime.pool, { loginRole: runtimeRole }));
    if (!(await bounded(checkMusicDatabaseReadiness(runtime.pool))).ready) throw new Error(rejection);
    const owners: { accountId: string }[] = [];
    for (let index = 0; index < 2; index++) {
      const userId = `owned-preflight-${randomUUID()}`;
      await bounded(migrator.pool.query('INSERT INTO auth_user(id,name,email) VALUES($1,$2,$3)', [userId, 'Owned preflight', `${userId}@example.invalid`]));
      await bounded(migrator.pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())", [randomUUID(), `google-${userId}`, userId]));
      owners.push(await bounded(ensureInitialAccount(runtime.pool, userId))); continuing();
    }
    const authSecret = randomBytes(32).toString('hex'), authConfig = { googleClientId: 'owned-google-fixture', googleClientSecret: 'owned-google-fixture-only' }, pinnedNode = process.execPath;
    const inherited = { ...process.env };
    // Windows child_process keeps one case-insensitive key; marker must bind that exact environment.
    if (process.platform === 'win32') for (const key of Object.keys(inherited)) if (key.toLowerCase() === 'path') delete inherited[key];
    const environment: NodeJS.ProcessEnv = { ...inherited, PATH: `${dirname(pinnedNode)}${delimiter}${process.env.PATH ?? ''}`, NODE_ENV: 'test', TZ: 'UTC', PORT: String(musicPort), EXPLORERS_PUBLIC_ORIGIN: browserOrigin, EXPLORERS_AUTH_SECRET: authSecret, GOOGLE_CLIENT_ID: authConfig.googleClientId, GOOGLE_CLIENT_SECRET: authConfig.googleClientSecret, MUSIC_MODE: 'fixture', MUSIC_DATABASE_HOST: '127.0.0.1', MUSIC_DATABASE_PORT: String(pgPort), MUSIC_DATABASE_NAME: authority.database, MUSIC_DATABASE_USER: runtimeRole, MUSIC_DATABASE_MIGRATOR_USER: 'music_migrator', MUSIC_DATABASE_PASSWORD_FILE: runtimePasswordFile, MUSIC_TOKEN_CURRENT_KID: `owned-${runId}`, MUSIC_TOKEN_CURRENT_SECRET_FILE: tokenSecretFile, MUSIC_TOKEN_LIFETIME_SECONDS: '600', MUSIC_TOKEN_CLOCK_SKEW_SECONDS: '0', MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: 'fixture-publication-v1', MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY: 'fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI', MUSIC_PUBLIC_ID_HMAC_KEY: 'VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ', SESSION_SECRET: randomBytes(32).toString('base64url'), COOKIE_SECRET: randomBytes(32).toString('base64url'), STRAPI_JWT_SECRET: randomBytes(32).toString('base64url'), ALLOWED_ORIGINS: browserOrigin, STRAPI_URL: controlOrigin, MUSIC_FIXTURE_STRAPI_ORIGIN: controlOrigin, STRAPI_ACCESS_TOKEN: 'fixture-read-only-token', STRAPI_LIFECYCLE_PROOF_TOKEN: 'fixture-read-only-token', TRUST_PROXY_HOPS: '0', YOUTUBE_API_KEY: 'fixture-provider-key', MUSIC_PROVISIONING_KILL_SWITCH: 'true', MUSIC_PROVISIONING_COHORT: 'disabled', MUSIC_NEW_ENTRY_KILL_SWITCH: 'true', MUSIC_RECONCILIATION_ENABLED: 'false', MUSIC_RECONCILIATION_MAX_ROWS: '0', MUSIC_RECONCILIATION_APPLY_ENABLED: 'false', MUSIC_WORKSPACE_KILL_SWITCH: 'false', MUSIC_FEATURE_OWNER_WORKSPACE_ALLOWLIST: owners.map(value => value.accountId).join(','), MUSIC_FEATURE_GUEST_WORKSPACE_ALLOWLIST: owners.map(value => value.accountId).join(','), MUSIC_FEATURE_OWNER_WORKSPACE_PERCENT: '0', MUSIC_FEATURE_GUEST_WORKSPACE_PERCENT: '0', MUSIC_FEATURE_PLAYLIST_IMPORTS_ALLOWLIST: '', MUSIC_FEATURE_PLAYLIST_IMPORTS_PERCENT: '0', MUSIC_FEATURE_COHORT_VERSION: `owned-browser-${runId}`, MUSIC_FEATURE_COHORT_SALT: runId, MUSIC_FIXTURE_SKIP_ANALYTICS_SCHEMA_DDL: 'true', MUSIC_FIXTURE_ANALYTICS_SCHEMA_MARKER: 'explorers-analytics-receipts-v1' };
    const markerPath = join(directory, 'startup-marker.json');
    const marker = { version: 1, root, runId, commit, provenance: createHash('sha256').update(JSON.stringify(provenance)).digest('hex'), authority: { database: authority.database, port: authority.port, containerId: authority.containerId, imageId: authority.imageId }, runtimeRole, runtimePasswordFile, migratorPasswordFile, tokenSecretFile, capabilityFile, browserOrigin, canonicalPort, musicPort, accounts: owners.map(value => value.accountId), environment };
    async function runCase(name: string, mutate: (candidate: typeof marker, env: NodeJS.ProcessEnv) => void = () => {}, race?: () => void, barrier = 'after-initial') {
      continuing(); phase = name;
      const candidate = structuredClone(marker), env = { ...environment }; mutate(candidate, env);
      if (existsSync(markerPath)) unlinkSync(markerPath); privateWrite(markerPath, candidate);
      const child = spawn(process.execPath, ['--import', 'tsx', import.meta.filename, '--private-child'], { cwd: tunes, env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }); children.add(child);
      try {
        const result = await bounded(new Promise<Result>((done, reject) => {
          let received: Result | undefined;
          child.once('error', () => reject(new Error(rejection)));
          child.once('exit', (code, signal) => code === 0 && !signal && received ? done(received) : reject(new Error(rejection)));
          child.on('message', (message: any) => {
            if (message?.action === 'barrier' && race) { try { continuing(); race(); child.send({ action: 'resume', capability }); } catch { reject(new Error(rejection)); } }
            else if (message?.action === 'result') received = message.result;
            else if (message?.action === 'failed') {
              const diagnostic = message.diagnostic;
              if (diagnostic && ['admission', 'production-startup', 'shutdown'].includes(diagnostic.phase) && Array.isArray(diagnostic.locations)) {
                const safeSources = new Set(['music-owned-browser-preflight.ts', 'music-owned-browser-profile.ts', 'music-startup.ts', 'music-database-config.ts', 'secure-music-secret-file.ts', 'music-runtime-role.ts', 'readiness.ts']);
                childFailure = { phase: diagnostic.phase, locations: diagnostic.locations.filter((item: any) => safeSources.has(item?.source) && Number.isSafeInteger(item.line) && item.line > 0 && Number.isSafeInteger(item.column) && item.column > 0).slice(0, 4).map((item: any) => ({ source: item.source, line: item.line, column: item.column })) };
              }
              reject(new Error(rejection));
            }
          });
          child.send({ action: 'initialize', case: name, markerPath, capability: name === 'capability-mismatch' ? '0'.repeat(64) : capability, scriptDigest: ownDigest, barrier: race ? barrier : undefined });
        }), 60000);
        if (result.case !== name || result.outcome !== (name === 'positive' ? 'positive' : 'rejected') || result.listener !== (name === 'positive') || !result.graceful) throw new Error(rejection);
        results.push(result); continuing();
        process.stdout.write(`${JSON.stringify({ type: 'owned-music-preflight-progress', case: result.case, outcome: result.outcome, phase: result.phase })}\n`);
      } finally { await stopChild(child); children.delete(child); }
    }
    await runCase('positive');
    await runCase('capability-mismatch');
    await runCase('source-digest', value => { value.provenance = '0'.repeat(64); });
    await runCase('source-commit', value => { value.commit = '0'.repeat(40); });
    await runCase('environment-substitution', (_value, env) => { env.ALLOWED_ORIGINS = controlOrigin; });
    await runCase('feature-import', (value, env) => { env.MUSIC_FEATURE_PLAYLIST_IMPORTS_PERCENT = value.environment.MUSIC_FEATURE_PLAYLIST_IMPORTS_PERCENT = '100'; });
    await runCase('provisioning', (value, env) => { env.MUSIC_PROVISIONING_KILL_SWITCH = value.environment.MUSIC_PROVISIONING_KILL_SWITCH = 'false'; });
    await runCase('escaped-marker-authority', value => { value.capabilityFile = join(dirname(directory), 'capability'); });
    await runCase('wrong-database', value => { value.authority.database = `music_uat_${'0'.repeat(32)}`; });
    await runCase('wrong-container', value => { value.authority.containerId = '0'.repeat(64); });
    await runCase('wrong-image', value => { value.authority.imageId = 'sha256:' + '0'.repeat(64); });
    await runCase('wrong-owned-port', (value, env) => { value.authority.port = 61000; env.MUSIC_DATABASE_PORT = value.environment.MUSIC_DATABASE_PORT = '61000'; });
    await runCase('wrong-run', value => { value.runId = '0'.repeat(32); });
    await runCase('missing-account', (value, env) => { value.accounts[0] = randomUUID(); value.environment.MUSIC_FEATURE_OWNER_WORKSPACE_ALLOWLIST = value.accounts.join(','); value.environment.MUSIC_FEATURE_GUEST_WORKSPACE_ALLOWLIST = value.accounts.join(','); Object.assign(env, value.environment); });
    await bounded(migrator.pool.query(`COMMENT ON ROLE ${runtimeRole} IS 'foreign-owner'`));
    try { await runCase('role-ownership'); } finally { await bounded(migrator.pool.query(`COMMENT ON ROLE ${runtimeRole} IS 'music-browser:${runId}:${commit}'`)); }
    await bounded(migrator.pool.query(`ALTER ROLE ${runtimeRole} SUPERUSER`));
    try { await runCase('overprivileged-role'); } finally { await bounded(migrator.pool.query(`ALTER ROLE ${runtimeRole} NOSUPERUSER`)); }
    await bounded(migrator.pool.query('ALTER TABLE creator_accounts RENAME TO preflight_hidden_accounts'));
    try { await runCase('missing-schema'); } finally { await bounded(migrator.pool.query('ALTER TABLE preflight_hidden_accounts RENAME TO creator_accounts')); }
    for (const kind of ['equal-material', 'hardlink', 'same-content-replacement', 'in-place-rewrite', 'marker-replacement'] as const) {
      try {
        await runCase(`after-initial-${kind}`, undefined, () => {
          if (kind === 'marker-replacement') { renameSync(markerPath, `${markerPath}.old`); privateWrite(markerPath, marker); }
          else if (kind === 'equal-material') writeFileSync(tokenSecretFile, values[0]);
          else if (kind === 'hardlink') { renameSync(tokenSecretFile, `${tokenSecretFile}.old`); linkSync(capabilityFile, tokenSecretFile); }
          else if (kind === 'same-content-replacement') { renameSync(tokenSecretFile, `${tokenSecretFile}.old`); privateWrite(tokenSecretFile, values[3]); }
          else writeFileSync(tokenSecretFile, randomBytes(32).toString('hex'));
        });
      } finally {
        if (existsSync(`${markerPath}.old`)) unlinkSync(`${markerPath}.old`);
        if (existsSync(tokenSecretFile)) unlinkSync(tokenSecretFile);
        if (existsSync(`${tokenSecretFile}.old`)) renameSync(`${tokenSecretFile}.old`, tokenSecretFile); else privateWrite(tokenSecretFile, values[3]);
      }
    }
    for (const barrier of ['after-initial', 'during-initial']) for (let index = 0; index < secretPaths.length; index++) {
      for (const kind of ['same-content-replacement', 'in-place-rewrite'] as const) {
        const path = secretPaths[index];
        try {
          await runCase(`${barrier}-${kind}-${index}`, undefined, () => {
            if (kind === 'same-content-replacement') { renameSync(path, `${path}.old`); privateWrite(path, values[index]); }
            else writeFileSync(path, randomBytes(32).toString('hex'));
          }, barrier);
        } finally {
          if (existsSync(path)) unlinkSync(path);
          if (existsSync(`${path}.old`)) renameSync(`${path}.old`, path); else privateWrite(path, values[index]);
        }
      }
    }
  } catch { failed = true; }
  finally {
    for (const child of children) try { await stopChild(child); } catch { cleanupFailures.push('child'); }
    for (const item of [runtime, migrator]) try { await item?.close(); } catch { cleanupFailures.push('pool'); }
    if (authority) try {
      const password = await readSecureMusicSecretFile(join(directory, 'migrator-password'), { mode: 'live' });
      await stopOwnedUatDatabase(authority, { dropDatabase: async owned => {
        const admin = ownedPool(`postgresql://music_migrator:${password}@127.0.0.1:${owned.port}/postgres`);
        try { await bounded(admin.pool.query(`DROP DATABASE ${owned.database}`)); } finally { await admin.close(); }
      } });
    } catch { cleanupFailures.push('owned-resource'); }
    try { if (existsSync(directory)) { if (realpathSync(directory) !== resolve(directory) || dirname(directory) !== resolve(tmpdir()) || !/^explorers-music-e2e-[a-f0-9]{32}$/.test(directory.slice(dirname(directory).length + 1))) throw new Error(rejection); rmSync(directory, { recursive: true, force: true }); } } catch { cleanupFailures.push('private-files'); }
    try { unchanged(); } catch { cleanupFailures.push('source-custody'); }
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    const report = { version: 'owned-music-preflight/v1', commit, scriptDigest: ownDigest, sourceDigest: createHash('sha256').update(JSON.stringify(provenance)).digest('hex'), node: process.version, successful: !failed && !interrupted && cleanupFailures.length === 0, failedPhase: failed ? phase : undefined, interrupted, childFailure, results, cleanupFailures };
    // Only controlled labels and source identities survive; no child output, raw errors or secrets.
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exitCode = report.successful ? 0 : 1;
  }
}
if (process.argv[2] === '--private-child') await childMain(); else await main();
