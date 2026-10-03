import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { createCanonicalApp } from '../server/auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../server/auth/betterAuth';
import { issueRecoveryProof } from '../server/auth/recoveryProof';
import { ensureInitialAccount } from '../server/auth/initialAccount';
import { migrateMusicDatabase } from '../server/db/migrate';
import { MUSIC_UAT_DATABASE_ACK, startOwnedUatDatabase, stopOwnedUatDatabase,
  type OwnedUatDatabaseAuthority } from './music-uat-database';
import { prepareFixtureMusicTokenSecret, cleanupFixtureMusicTokenSecret } from './music-fixture-secret';
import { readSecureMusicSecretFile } from '../server/config/secure-music-secret-file';
import { provisionMusicRuntimeLogin } from '../server/db/music-runtime-role';
import { startLifecycleControl } from './lifecycle-browser-support';
import { parseBrowserSuite, assertBrowserEnvironment, assertLifecycleResults, assertOwnedCleanup } from './lifecycle-browser-guards';
import { extractProtectedReceiptArguments, createProtectedReceipt } from './protected-browser-receipt';

const root = resolve(import.meta.dirname, '../..');
const frontend = resolve(root, 'explorers-earth');
const receiptArguments = extractProtectedReceiptArguments(process.argv.slice(2));
const suite = parseBrowserSuite(receiptArguments.args);
assertBrowserEnvironment(process.env);
const protectedReceipt = await createProtectedReceipt(root, suite, receiptArguments);
const runId = randomBytes(16).toString('hex');
const database = `music_uat_${runId}`;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const disposable = mkdtempSync(join(tmpdir(), 'explorers-profile-e2e-'));
const passwordFile = prepareFixtureMusicTokenSecret(root);
let authority: OwnedUatDatabaseAuthority | undefined;
let db: pg.Pool | undefined;
let runtime: pg.Pool | undefined;
let lifecycleControl: Awaited<ReturnType<typeof startLifecycleControl>> | undefined;
let lifecycleReceipt: Record<string, unknown> | undefined;
const artifacts = suite === 'lifecycle' && !protectedReceipt ? mkdtempSync(join(tmpdir(), 'explorers-lifecycle-artifacts-')) : undefined;
let apiServer: ReturnType<ReturnType<typeof createCanonicalApp>['app']['listen']> | undefined;
let vite: ChildProcess | undefined;
let browser: ChildProcess | undefined;
let interrupted = false;

async function freePort(min = 55000, max = 60999): Promise<number> {
  for (let i = 0; i < 150; i++) {
    const port = min + randomBytes(2).readUInt16BE(0) % (max - min + 1);
    const free = await new Promise<boolean>((done) => {
      const server = createServer();
      server.once('error', () => done(false));
      server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error('No local fixture port available');
}
async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('Local fixture server did not start');
}
function stopChild(child: ChildProcess | undefined): void {
  if (!child || child.exitCode !== null) return;
  child.kill();
}
async function stopLifecycleChild(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => reject(new Error('Owned child did not exit')), 5000);
    child.once('exit', () => { clearTimeout(timer); done(); });
    child.kill();
  });
}
async function dropOwnedDatabase(owned: OwnedUatDatabaseAuthority, password: string): Promise<void> {
  const url = new URL('postgresql://127.0.0.1/postgres');
  url.username = 'music_migrator'; url.password = password; url.port = String(owned.port);
  const admin = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try { await admin.query(`DROP DATABASE ${owned.database}`); }
  finally { await admin.end(); }
}
async function main(): Promise<number> {
  const password = await readSecureMusicSecretFile(passwordFile, { mode: 'fixture' });
  const pgPort = await freePort(56000, 60999);
  const apiPort = await freePort(54000, 55999);
  const webPort = await freePort(52000, 53999);
  authority = await startOwnedUatDatabase({ runId, database, commit, port: pgPort, passwordFile });
  const dbUrl = new URL('postgresql://127.0.0.1');
  dbUrl.username = 'music_migrator'; dbUrl.password = password;
  dbUrl.port = String(pgPort); dbUrl.pathname = database;
  db = new pg.Pool({ connectionString: dbUrl.toString(), max: 4 });
  await migrateMusicDatabase(db);
  const origin = `http://127.0.0.1:${webPort}`;
  const config = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: origin,
    EXPLORERS_AUTH_SECRET: randomBytes(32).toString('hex'),
    GOOGLE_CLIENT_ID: 'profile-fixture-google', GOOGLE_CLIENT_SECRET: 'profile-fixture-secret' });
  if (suite === 'lifecycle') {
    const runtimePassword = randomBytes(32).toString('hex');
    await provisionMusicRuntimeLogin(db, { loginRole: 'lifecycle_runtime', password: runtimePassword },
      { ownershipComment: `owned-lifecycle:${runId}:${commit}` });
    const runtimeUrl = new URL(dbUrl); runtimeUrl.username = 'lifecycle_runtime'; runtimeUrl.password = runtimePassword;
    runtime = new pg.Pool({ connectionString: runtimeUrl.toString(), max: 5 });
  }
  const composed = createCanonicalApp(runtime ?? db, config);
  if (suite === 'lifecycle') lifecycleControl = await startLifecycleControl(db, composed, config, await freePort(51000, 51999));
  apiServer = await new Promise((done) => {
    const server = composed.app.listen(apiPort, '127.0.0.1', () => done(server));
  });
  const personas: Record<string, { userId: string; cookie: string; handle: string }> = {};
  for (const name of ['ownerA', 'ownerB', 'ownerC']) {
    const userId = `profile-e2e-${randomUUID()}`;
    await db.query('INSERT INTO auth_user(id,name,email) VALUES ($1,$2,$3)', [userId, name, `${userId}@example.invalid`]);
    await db.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
      [randomUUID(), `google-${userId}`, userId]);
    const context = await composed.auth.$context;
    const session = await context.internalAdapter.createSession(userId, false);
    const signature = createHmac('sha256', config.secret).update(session.token).digest('base64');
    const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
    personas[name] = { userId, cookie, handle: `profile${name.toLowerCase()}${runId.slice(0, 4)}` };
  }
  let recoveryProof: string | undefined;
  if (suite === 'auth') {
    const recovery = personas.ownerB;
    const selected = await ensureInitialAccount(db, recovery.userId);
    await db.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1", [selected.accountId]);
    await db.query('UPDATE user_security_state SET blocked_at=now(),session_version=session_version+1 WHERE user_id=$1', [recovery.userId]);
    await db.query('DELETE FROM auth_session WHERE user_id=$1', [recovery.userId]);
    const context = await composed.auth.$context;
    const temporary = await context.internalAdapter.createSession(recovery.userId, false);
    recoveryProof = (await issueRecoveryProof(db, { userId: recovery.userId,
      subject: `google-${recovery.userId}`, sessionId: temporary.id })).token;
  }
  const fixturePath = join(disposable, 'sessions.json');
  writeFileSync(fixturePath, JSON.stringify({ origin, personas, recoveryProof, lifecycleControl }), { mode: 0o600 });
  vite = spawn(process.execPath, [resolve(frontend, 'node_modules/vite/bin/vite.js'),
    '--config', 'e2e/replatform/profile.vite.config.ts'], {
    cwd: frontend, windowsHide: true, stdio: 'inherit', env: { ...process.env,
      PROFILE_E2E_LOCAL_AUTHORITY: 'owned-disposable-pg15', PROFILE_E2E_WEB_PORT: String(webPort),
      PROFILE_E2E_API_PORT: String(apiPort) },
  });
  await waitFor(origin);
  const lifecycleConfig = ['--config', 'e2e/replatform/lifecycle.playwright.config.ts', '--project=lifecycle-chromium', '--retries=0'];
  const lifecycleEnv = { ...process.env, LIFECYCLE_E2E_FIXTURE_PATH: fixturePath, PLAYWRIGHT_EXTERNAL_BASE_URL: origin };
  let discovered: string[] = [];
  let browserArgs = suite === 'lifecycle' ? lifecycleConfig : [`e2e/replatform/${suite}.spec.ts`, '--project=chromium-pr-safe', '--retries=0'];
  const browserEnv = { ...process.env,
    [suite === 'lifecycle' ? 'LIFECYCLE_E2E_FIXTURE_PATH' : suite === 'auth' ? 'AUTH_E2E_FIXTURE_PATH' : 'PROFILE_E2E_FIXTURE_PATH']: fixturePath,
    PLAYWRIGHT_EXTERNAL_BASE_URL: origin };
  if (protectedReceipt) browserArgs = protectedReceipt.arguments(browserArgs, disposable);
  if (protectedReceipt) protectedReceipt.discovery(frontend, [...browserArgs, '--workers=1', '--forbid-only'], browserEnv, disposable);
  if (suite === 'lifecycle' && !protectedReceipt) {
    const listPath = join(artifacts!, 'discovery.json');
    const result = spawnSync(process.execPath, [resolve(frontend, 'node_modules/@playwright/test/cli.js'), 'test', ...lifecycleConfig, '--list', '--reporter=json'],
      { cwd: frontend, windowsHide: true, encoding: 'utf8', env: { ...lifecycleEnv, PLAYWRIGHT_JSON_OUTPUT_NAME: listPath } });
    if (result.status !== 0) throw new Error('Lifecycle discovery failed');
    const collect = (report: any): any[] => [...(report.specs ?? []), ...(report.suites ?? []).flatMap(collect)];
    discovered = collect(JSON.parse(readFileSync(listPath, 'utf8'))).map(spec => spec.title);
    // Reject omissions/additions before executing any lifecycle case.
    assertLifecycleResults(discovered, discovered.map(title => ({ title, status: 'passed', retry: 0 })));
  }
  browser = spawn(process.execPath, [resolve(frontend, 'node_modules/@playwright/test/cli.js'),
    'test', ...browserArgs, ...(protectedReceipt ? ['--workers=1', '--forbid-only', '--reporter=json,line'] : suite === 'lifecycle' ? ['--reporter=json,line'] : [])], {
    cwd: frontend, windowsHide: true, stdio: 'inherit', env: { ...process.env,
      [suite === 'lifecycle' ? 'LIFECYCLE_E2E_FIXTURE_PATH' : suite === 'auth' ? 'AUTH_E2E_FIXTURE_PATH' : 'PROFILE_E2E_FIXTURE_PATH']: fixturePath,
      ...(protectedReceipt ? protectedReceipt.executionEnvironment({}, disposable) : suite === 'lifecycle' ? { PLAYWRIGHT_JSON_OUTPUT_NAME: join(artifacts!, 'execution.json') } : {}),
      PLAYWRIGHT_EXTERNAL_BASE_URL: origin },
  });
  const exitCode = await new Promise<number>((done) => browser!.once('exit', (code) => done(code ?? 1)));
  if (protectedReceipt) protectedReceipt.execution(exitCode, browser.signalCode, disposable);
  if (suite === 'lifecycle' && !protectedReceipt) {
    if (exitCode !== 0) throw new Error('Lifecycle browser child failed');
    const collect = (report: any): any[] => [...(report.specs ?? []), ...(report.suites ?? []).flatMap(collect)];
    const results = collect(JSON.parse(readFileSync(join(artifacts!, 'execution.json'), 'utf8'))).flatMap(spec => spec.tests.flatMap((test: any) => test.results.map((result: any) => ({ title: spec.title, status: result.status, retry: result.retry }))));
    assertLifecycleResults(discovered, results);
    const paths = ['tunes/scripts/profile-browser-fixture.ts', 'tunes/scripts/lifecycle-browser-support.ts', 'tunes/scripts/lifecycle-browser-guards.ts', 'tunes/server/auth/recoveryCallback.ts', 'tunes/package.json', 'explorers-earth/e2e/replatform/lifecycle.spec.ts', 'explorers-earth/e2e/replatform/lifecycle.playwright.config.ts'];
    lifecycleReceipt = { version: 'canonical-lifecycle-browser/v1', sourceCommit: commit, runId, sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex')])), discovered, results, provider: 'simulated validateAuthorizationCode/getUserInfo only', runtime: 'separate protected lifecycle_runtime', postgres: { database, containerId: authority.containerId, imageId: authority.imageId }, cleanup: 'pending' };
  }
  return exitCode;
}
const signal = () => { interrupted = true; stopChild(browser); stopChild(vite); };
process.once('SIGINT', signal);
process.once('SIGTERM', signal);
process.on('message', (message: unknown) => {
  const input = message as { type?: string; capability?: string };
  if (protectedReceipt && input.type === 'replatform-cancel' && input.capability === protectedReceipt.capability) signal();
});
try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`Profile E2E fixture failed: ${error instanceof Error ? error.message.replaceAll(disposable, '<fixture>') : 'unknown'}\n`);
  process.exitCode = 1;
} finally {
  const failures: string[] = [];
  const cleanup = async (label: string, action: () => unknown) => { try { await action(); } catch { failures.push(label); } };
  await cleanup('browser child', () => suite === 'lifecycle' || protectedReceipt ? stopLifecycleChild(browser) : stopChild(browser));
  await cleanup('Vite child', () => suite === 'lifecycle' || protectedReceipt ? stopLifecycleChild(vite) : stopChild(vite));
  await cleanup('API server', () => new Promise<void>((done, reject) => apiServer?.close(error => error ? reject(error) : done()) ?? done()));
  await cleanup('private lifecycle control', () => lifecycleControl?.close());
  await cleanup('runtime pool', () => runtime?.end());
  await cleanup('seed pool', () => db?.end());
  await cleanup('attested owned database/container', async () => {
    if (authority) {
      const password = await readSecureMusicSecretFile(passwordFile, { mode: 'fixture' });
      await stopOwnedUatDatabase(authority, { dropDatabase: (owned) => dropOwnedDatabase(owned, password) });
    }
  });
  await cleanup('fixture secret', () => cleanupFixtureMusicTokenSecret(root, passwordFile));
  await cleanup('private fixture directory', () => rmSync(disposable, { recursive: true, force: true }));
  if (protectedReceipt && authority) await cleanup('protected receipt qualification', () => protectedReceipt.finish(authority!, failures, interrupted));
  try { assertOwnedCleanup(failures); } catch (error) { process.exitCode = 1; process.stderr.write(`${(error as Error).message}\n`); }
  if (lifecycleReceipt && artifacts) { lifecycleReceipt.cleanup = failures.length ? { failed: failures } : 'owned database dropped; attested container removed; pools/control/children closed; secret removed'; writeFileSync(join(artifacts, 'receipt.json'), JSON.stringify(lifecycleReceipt, null, 2)); process.stdout.write(`Lifecycle receipt: ${join(artifacts, 'receipt.json')}\n`); }
  if (interrupted) process.exitCode = 130;
  if (process.connected) process.disconnect();
}
