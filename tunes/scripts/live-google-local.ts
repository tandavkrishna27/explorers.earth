import { randomBytes } from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'dotenv';
import pg from 'pg';
import { createCanonicalApp } from '../server/auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../server/auth/betterAuth';
import { migrateMusicDatabase } from '../server/db/migrate';
import { MUSIC_UAT_DATABASE_ACK, startOwnedUatDatabase, stopOwnedUatDatabase,
  type OwnedUatDatabaseAuthority } from './music-uat-database';
import { prepareFixtureMusicTokenSecret, cleanupFixtureMusicTokenSecret } from './music-fixture-secret';
import { readSecureMusicSecretFile } from '../server/config/secure-music-secret-file';
import { createLiveGoogleMediaStorage } from './live-google-media';

const root = resolve(import.meta.dirname, '../..');
const frontend = resolve(root, 'explorers-earth');
const credentialFile = resolve(root, 'tunes/.env.oauth.local');
const origin = 'http://localhost:5175';
if (process.argv.slice(2).join(' ') !== `--ack ${MUSIC_UAT_DATABASE_ACK}`)
  throw new Error('Exact disposable PostgreSQL acknowledgement is required');
for (const key of ['DATABASE_URL', 'DATABASE_URL_TEST', 'DOCKER_HOST', 'DOCKER_CONTEXT',
  'GATE_PROD', 'MUSIC_DEPLOY_PRODUCTION', 'MUSIC_DEPLOY_PROD']) {
  if (process.env[key]) throw new Error('Ambient database, Docker or production authority is forbidden');
}
if (process.env.NODE_ENV === 'production' || Object.keys(process.env).some((key) => key.startsWith('MUSIC_C10_STANDALONE_POSTGRES_')))
  throw new Error('Production or unrelated database authority is forbidden');
if (!lstatSync(credentialFile).isFile() || lstatSync(credentialFile).isSymbolicLink())
  throw new Error('Expected a regular local OAuth credential file');
const credentials = parse(readFileSync(credentialFile));
if (!credentials.GOOGLE_CLIENT_ID || !credentials.GOOGLE_CLIENT_SECRET)
  throw new Error('Local OAuth credential file needs Google client ID and secret');

const runId = randomBytes(16).toString('hex');
const database = `music_uat_${runId}`;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const disposable = mkdtempSync(join(tmpdir(), 'explorers-live-google-'));
const passwordFile = prepareFixtureMusicTokenSecret(root);
let authority: OwnedUatDatabaseAuthority | undefined;
let db: pg.Pool | undefined;
let apiServer: ReturnType<ReturnType<typeof createCanonicalApp>['app']['listen']> | undefined;
let vite: ChildProcess | undefined;
let stage = 'initialization';

async function freePort(min: number, max: number): Promise<number> {
  for (let i = 0; i < 150; i++) {
    const port = min + randomBytes(2).readUInt16BE(0) % (max - min + 1);
    const free = await new Promise<boolean>((done) => {
      const server = createServer();
      server.once('error', () => done(false));
      server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error('No loopback port available');
}
async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if (vite?.exitCode !== null) throw new Error('Vite stopped before readiness');
    try { if ((await fetch(url)).ok) return; } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('Local runner did not start');
}
async function dropOwnedDatabase(owned: OwnedUatDatabaseAuthority, password: string): Promise<void> {
  const url = new URL('postgresql://127.0.0.1/postgres');
  url.username = 'music_migrator'; url.password = password; url.port = String(owned.port);
  const admin = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try { await admin.query(`DROP DATABASE ${owned.database}`); }
  finally { await admin.end(); }
}
async function main() {
  stage = 'fixture secret';
  const password = await readSecureMusicSecretFile(passwordFile, { mode: 'fixture' });
  const pgPort = await freePort(56000, 60999);
  const apiPort = await freePort(54000, 55999);
  stage = 'owned database';
  authority = await startOwnedUatDatabase({ runId, database, commit, port: pgPort, passwordFile });
  const dbUrl = new URL('postgresql://127.0.0.1');
  dbUrl.username = 'music_migrator'; dbUrl.password = password;
  dbUrl.port = String(pgPort); dbUrl.pathname = database;
  db = new pg.Pool({ connectionString: dbUrl.toString(), max: 4 });
  stage = 'migrations';
  await migrateMusicDatabase(db);
  stage = 'canonical API';
  const config = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: origin,
    EXPLORERS_AUTH_SECRET: randomBytes(32).toString('hex'),
    GOOGLE_CLIENT_ID: credentials.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: credentials.GOOGLE_CLIENT_SECRET });
  const composed = createCanonicalApp(db, config, { mediaStorage: createLiveGoogleMediaStorage(disposable) });
  apiServer = await new Promise((done) => {
    const server = composed.app.listen(apiPort, '127.0.0.1', () => done(server));
  });
  const childEnv = { ...process.env, EXPLORERS_LIVE_OAUTH_AUTHORITY: 'owned-disposable-pg15',
    EXPLORERS_LIVE_OAUTH_API_PORT: String(apiPort) };
  delete childEnv.GOOGLE_CLIENT_ID;
  delete childEnv.GOOGLE_CLIENT_SECRET;
  delete childEnv.EXPLORERS_AUTH_SECRET;
  stage = 'Vite startup';
  vite = spawn(process.execPath, [resolve(frontend, 'node_modules/vite/bin/vite.js'),
    '--config', 'e2e/replatform/live-oauth.vite.config.ts'], {
    cwd: frontend, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'], env: childEnv,
  });
  stage = 'Vite readiness';
  await waitFor(`${origin}/login`);
  stage = 'interactive consent';
  console.log(`Live Google local flow ready at ${origin}/login`);
  console.log(`Configured callback: ${config.googleCallbackURL}`);
  console.log('Complete Google consent in a browser. Press Enter here to stop and remove the disposable database.');
  await new Promise<void>((done) => { process.stdin.once('data', () => done()); process.once('SIGINT', () => done());
    process.once('SIGTERM', () => done()); });
  process.stdin.pause();
}
try { await main(); }
catch { process.stderr.write(`Live Google local runner failed during ${stage}; local resources will be stopped.\n`);
  process.exitCode = 1; }
finally {
  vite?.kill();
  apiServer?.closeAllConnections();
  await new Promise<void>((done) => apiServer?.close(() => done()) ?? done());
  await db?.end();
  if (authority) {
    const password = await readSecureMusicSecretFile(passwordFile, { mode: 'fixture' });
    await stopOwnedUatDatabase(authority, { dropDatabase: (owned) => dropOwnedDatabase(owned, password) });
  }
  cleanupFixtureMusicTokenSecret(root, passwordFile);
  rmSync(disposable, { recursive: true, force: true });
}
