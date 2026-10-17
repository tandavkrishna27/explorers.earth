import { createHash, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants, lstatSync, openSync, closeSync, fstatSync, readSync, realpathSync, type BigIntStats } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { readSecureMusicSecretFileWithDistinctAuthorities } from './secure-music-secret-file';
import { resolveMusicDatabaseConnection } from './music-database-config';
import { verifyMusicRuntimeDatabaseConnection } from '../db/music-runtime-role';
import { checkMusicDatabaseReadiness } from '../db/readiness';

export interface ValidatedOwnedBrowserMusicProfile { readonly kind: 'owned-browser-music/v1' }
type Environment = Record<string, string | undefined>;
type Marker = { version: 1; root: string; runId: string; commit: string; provenance: unknown; authority: { database: string; port: number; containerId: string; imageId: string }; runtimeRole: string; runtimePasswordFile: string; migratorPasswordFile: string; tokenSecretFile: string; capabilityFile: string; browserOrigin: string; canonicalPort: number; musicPort: number; accounts: string[]; environment: Environment };
type Custody = { marker: Marker; markerPath: string; identity: string; digest: string; snapshot: string; expectedDatabaseUrl: string; secrets: { path: string; identity: string; digest: string }[]; derived?: string };
const profiles = new WeakMap<ValidatedOwnedBrowserMusicProfile, Custody>();
let active: { profile: ValidatedOwnedBrowserMusicProfile; environment: Environment } | undefined;
const snapshot = (environment: Environment) => JSON.stringify(Object.entries(environment).sort(([a], [b]) => a.localeCompare(b)));
function fail(): never { throw new Error('Owned Music startup authority rejected'); }
const sameMetadata = (a: BigIntStats, b: BigIntStats) => ['dev', 'ino', 'nlink', 'size', 'mode', 'uid', 'gid', 'mtimeNs', 'ctimeNs'].every(key => a[key as keyof BigIntStats] === b[key as keyof BigIntStats]);
/** Read-only custody evidence; never issues or activates an admission profile. */
export async function readOwnedBrowserMusicSecretSnapshot(paths: readonly string[], retained?: readonly Readonly<Custody['secrets'][number]>[]): Promise<ReadonlyArray<Readonly<Custody['secrets'][number]>>> {
  const secrets: Custody['secrets'] = [];
  const initialMetadata = paths.map(path => lstatSync(path, { bigint: true }));
  for (const [index, path] of paths.entries()) {
    const before = initialMetadata[index];
    const value = await readSecureMusicSecretFileWithDistinctAuthorities(path, paths.filter(other => other !== path), { mode: 'live', requireDistinctValues: true });
    const after = lstatSync(path, { bigint: true }); if (!sameMetadata(before, after)) fail();
    secrets.push({ path, identity: `${after.dev}:${after.ino}`, digest: createHash('sha256').update(value).digest('hex') });
  }
  for (const [index, path] of paths.entries()) if (!sameMetadata(initialMetadata[index], lstatSync(path, { bigint: true }))) fail();
  if (new Set(secrets.map(secret => secret.identity)).size !== paths.length || new Set(secrets.map(secret => secret.digest)).size !== paths.length) fail();
  if (retained && JSON.stringify(secrets) !== JSON.stringify(retained)) fail();
  return Object.freeze(secrets.map(secret => Object.freeze(secret)));
}
function securityReceipt(paths: string[], metadata: BigIntStats[]) {
  if (process.platform !== 'win32') { if (metadata.some(stat => stat.uid !== BigInt(process.getuid!()) || (stat.mode & BigInt(0o077)) !== BigInt(0))) fail(); return 'posix-private'; }
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', resolve(import.meta.dirname, '../../scripts/windows-write-through.ps1'), 'inspect-security', ...paths], { encoding: 'utf8', windowsHide: true });
  const lines = output.trim().split(/\r?\n/); if (lines.length !== paths.length) fail();
  for (let n = 0; n < lines.length; n++) { const value = JSON.parse(lines[n]); if (value.ownerMatchesEffectiveUser !== true || value.unsafeWritePrincipalCount !== 0 || !/^\d+$/.test(value.nativeDev) || !/^\d+$/.test(value.nativeIno) || BigInt(value.nativeDev) !== metadata[n].dev || BigInt(value.nativeIno) !== metadata[n].ino) fail(); }
  return output;
}
function readMarker(path: string) {
  const absolute = resolve(path), parent = dirname(absolute);
  if (absolute !== path || dirname(parent) !== resolve(tmpdir()) || !/^explorers-music-e2e-[A-Za-z0-9]+$/.test(parent.slice(dirname(parent).length + 1)) || realpathSync(parent) !== parent || realpathSync(absolute) !== absolute) fail();
  const before = lstatSync(absolute, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== BigInt(1) || before.size > BigInt(65536)) fail();
  const parentBefore = lstatSync(parent, { bigint: true }); if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink()) fail();
  const securityBefore = securityReceipt([parent, absolute], [parentBefore, before]);
  const fd = openSync(absolute, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW));
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!sameMetadata(before, opened)) fail();
    const bytes = Buffer.alloc(65537); let length = 0;
    while (length < bytes.length) { const count = readSync(fd, bytes, length, bytes.length - length, length); if (!count) break; length += count; }
    if (length > 65536 || BigInt(length) !== opened.size) fail();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)); const marker = JSON.parse(text) as Marker;
    // Canonical serialization rejects duplicate keys, whitespace and trailing input.
    if (JSON.stringify(marker) !== text) fail();
    const depth = (value: unknown, level = 0): void => { if (level > 12) fail(); if (value && typeof value === 'object') for (const item of Object.values(value)) depth(item, level + 1); }; depth(marker);
    if (!marker || !marker.authority || typeof marker.environment !== 'object' || !marker.environment || !Array.isArray(marker.accounts)) fail();
    if (!sameMetadata(opened, fstatSync(fd, { bigint: true })) || !sameMetadata(before, lstatSync(absolute, { bigint: true })) || !sameMetadata(parentBefore, lstatSync(parent, { bigint: true })) || realpathSync(parent) !== parent || realpathSync(absolute) !== absolute || securityReceipt([parent, absolute], [parentBefore, before]) !== securityBefore) fail();
    return { marker, identity: `${parentBefore.dev}:${parentBefore.ino}:${opened.dev}:${opened.ino}`, digest: createHash('sha256').update(text).digest('hex') };
  } finally { closeSync(fd); }
}
async function sourceMatches(marker: Marker) {
  const expectedRoot = resolve(import.meta.dirname, '../../..');
  if (marker.root !== expectedRoot || realpathSync(marker.root) !== marker.root || !/^[a-f0-9]{40}$/.test(marker.commit)) fail();
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: marker.root, encoding: 'utf8', windowsHide: true }).trim() !== marker.commit) fail();
  const contract = await import(pathToFileURL(join(marker.root, 'scripts/replatform-e2e.mjs')).href);
  if (createHash('sha256').update(JSON.stringify(contract.snapshotSource(marker.root).provenance)).digest('hex') !== marker.provenance) fail();
}
function validateEnvironment(environment: Environment, marker: Marker) {
  const authorityKeys = new Set('NODE_ENV TZ PORT EXPLORERS_PUBLIC_ORIGIN EXPLORERS_AUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET MUSIC_MODE MUSIC_DATABASE_HOST MUSIC_DATABASE_PORT MUSIC_DATABASE_NAME MUSIC_DATABASE_USER MUSIC_DATABASE_MIGRATOR_USER MUSIC_DATABASE_PASSWORD_FILE MUSIC_TOKEN_CURRENT_KID MUSIC_TOKEN_CURRENT_SECRET_FILE MUSIC_TOKEN_LIFETIME_SECONDS MUSIC_TOKEN_CLOCK_SKEW_SECONDS MUSIC_PUBLICATION_RESPONSE_CURRENT_KID MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY MUSIC_PUBLIC_ID_HMAC_KEY SESSION_SECRET COOKIE_SECRET STRAPI_JWT_SECRET ALLOWED_ORIGINS STRAPI_URL MUSIC_FIXTURE_STRAPI_ORIGIN STRAPI_ACCESS_TOKEN STRAPI_LIFECYCLE_PROOF_TOKEN TRUST_PROXY_HOPS YOUTUBE_API_KEY MUSIC_PROVISIONING_KILL_SWITCH MUSIC_PROVISIONING_COHORT MUSIC_NEW_ENTRY_KILL_SWITCH MUSIC_RECONCILIATION_ENABLED MUSIC_RECONCILIATION_MAX_ROWS MUSIC_RECONCILIATION_APPLY_ENABLED MUSIC_WORKSPACE_KILL_SWITCH MUSIC_FEATURE_OWNER_WORKSPACE_ALLOWLIST MUSIC_FEATURE_GUEST_WORKSPACE_ALLOWLIST MUSIC_FEATURE_OWNER_WORKSPACE_PERCENT MUSIC_FEATURE_GUEST_WORKSPACE_PERCENT MUSIC_FEATURE_PLAYLIST_IMPORTS_ALLOWLIST MUSIC_FEATURE_PLAYLIST_IMPORTS_PERCENT MUSIC_FEATURE_COHORT_VERSION MUSIC_FEATURE_COHORT_SALT MUSIC_FIXTURE_SKIP_ANALYTICS_SCHEMA_DDL MUSIC_FIXTURE_ANALYTICS_SCHEMA_MARKER'.split(' '));
  for (const key of Object.keys(environment)) if (/^(MUSIC_|STRAPI_|EXPLORERS_|GOOGLE_|YOUTUBE_|DATABASE_|DOCKER_|VITE_|PLAYWRIGHT_|GATE_PROD)/i.test(key) && !authorityKeys.has(key)) fail();
  const allowedMarkerKeys = ['accounts', 'authority', 'browserOrigin', 'canonicalPort', 'capabilityFile', 'commit', 'environment', 'migratorPasswordFile', 'musicPort', 'provenance', 'root', 'runId', 'runtimePasswordFile', 'runtimeRole', 'tokenSecretFile', 'version'];
  if (Object.keys(marker).sort().join(',') !== allowedMarkerKeys.sort().join(',') || marker.version !== 1 || !/^[a-f0-9]{32}$/.test(marker.runId) || marker.authority.database !== `music_uat_${marker.runId}`) fail();
  if (environment !== process.env || environment.DATABASE_URL || environment.NODE_ENV !== 'test' || environment.MUSIC_MODE !== 'fixture' || snapshot(environment) !== snapshot(marker.environment)) fail();
  if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{3,4}$/.test(marker.browserOrigin) || environment.EXPLORERS_PUBLIC_ORIGIN !== marker.browserOrigin || environment.ALLOWED_ORIGINS !== marker.browserOrigin) fail();
  const ports = [marker.canonicalPort, marker.musicPort, marker.authority.port, Number(new URL(marker.browserOrigin).port)];
  if (ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535) || new Set(ports).size !== ports.length || environment.PORT !== String(marker.musicPort)) fail();
  if (environment.MUSIC_DATABASE_HOST !== '127.0.0.1' || environment.MUSIC_DATABASE_PORT !== String(marker.authority.port) || environment.MUSIC_DATABASE_NAME !== marker.authority.database || environment.MUSIC_DATABASE_USER !== marker.runtimeRole || environment.MUSIC_DATABASE_MIGRATOR_USER !== 'music_migrator' || environment.MUSIC_DATABASE_PASSWORD_FILE !== marker.runtimePasswordFile || environment.MUSIC_TOKEN_CURRENT_SECRET_FILE !== marker.tokenSecretFile) fail();
  if (!/^music_browser_[a-f0-9]{12}$/.test(marker.runtimeRole) || !Array.isArray(marker.accounts) || marker.accounts.length < 2 || new Set(marker.accounts).size !== marker.accounts.length || marker.accounts.some(id => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))) fail();
  for (const flag of ['OWNER_WORKSPACE', 'GUEST_WORKSPACE']) if (environment[`MUSIC_FEATURE_${flag}_ALLOWLIST`] !== marker.accounts.join(',') || environment[`MUSIC_FEATURE_${flag}_PERCENT`] !== '0') fail();
  if (environment.MUSIC_FEATURE_PLAYLIST_IMPORTS_ALLOWLIST !== '' || environment.MUSIC_FEATURE_PLAYLIST_IMPORTS_PERCENT !== '0' || environment.MUSIC_WORKSPACE_KILL_SWITCH !== 'false' || environment.MUSIC_FEATURE_COHORT_VERSION !== `owned-browser-${marker.runId}` || environment.MUSIC_FEATURE_COHORT_SALT !== marker.runId) fail();
  if (environment.MUSIC_PROVISIONING_KILL_SWITCH !== 'true' || environment.MUSIC_PROVISIONING_COHORT !== 'disabled' || environment.MUSIC_RECONCILIATION_ENABLED !== 'false' || environment.MUSIC_RECONCILIATION_MAX_ROWS !== '0' || environment.MUSIC_RECONCILIATION_APPLY_ENABLED !== 'false' || environment.MUSIC_NEW_ENTRY_KILL_SWITCH !== 'true') fail();
  if (environment.YOUTUBE_API_KEY !== 'fixture-provider-key' || environment.STRAPI_ACCESS_TOKEN !== 'fixture-read-only-token' || environment.STRAPI_LIFECYCLE_PROOF_TOKEN !== 'fixture-read-only-token' || environment.STRAPI_URL !== environment.MUSIC_FIXTURE_STRAPI_ORIGIN || !/^http:\/\/127\.0\.0\.1:[1-9]\d{3,4}$/.test(environment.STRAPI_URL ?? '') || environment.TRUST_PROXY_HOPS !== '0') fail();
  if (environment.MUSIC_FIXTURE_SKIP_ANALYTICS_SCHEMA_DDL !== 'true' || environment.MUSIC_FIXTURE_ANALYTICS_SCHEMA_MARKER !== 'explorers-analytics-receipts-v1' || environment.MUSIC_RUNTIME_PROFILE !== undefined) fail();
}
export async function validateOwnedBrowserMusicProfile(environment: Environment, markerPath: string, capability: string): Promise<ValidatedOwnedBrowserMusicProfile> {
  if (!/^[a-f0-9]{64}$/.test(capability)) fail();
  const custody = readMarker(markerPath); const { marker } = custody; validateEnvironment(environment, marker); await sourceMatches(marker);
  const privateParent = dirname(markerPath);
  for (const [path, name] of [[marker.capabilityFile, 'capability'], [marker.runtimePasswordFile, 'runtime-password'], [marker.migratorPasswordFile, 'migrator-password'], [marker.tokenSecretFile, 'token-secret']]) if (path !== join(privateParent, name) || realpathSync(path) !== path) fail();
  const secretPaths = [marker.capabilityFile, marker.runtimePasswordFile, marker.migratorPasswordFile, marker.tokenSecretFile];
  const initialSecrets = await readOwnedBrowserMusicSecretSnapshot(secretPaths);
  if (!timingSafeEqual(Buffer.from(initialSecrets[0].digest, 'hex'), createHash('sha256').update(capability).digest())) fail();
  const { attestUatDatabaseAuthority, MUSIC_UAT_DATABASE_ACK } = await import('../../scripts/music-uat-database');
  const attested = attestUatDatabaseAuthority({ MUSIC_UAT_DATABASE_ACK, MUSIC_UAT_DATABASE_RUN_ID: marker.runId, MUSIC_UAT_DATABASE_NAME: marker.authority.database, MUSIC_UAT_DATABASE_PORT: String(marker.authority.port), MUSIC_UAT_DATABASE_CONTAINER_ID: marker.authority.containerId, MUSIC_UAT_DATABASE_COMMIT: marker.commit }, marker.commit);
  if (!attested || attested.imageId !== marker.authority.imageId) fail();
  const connection = await resolveMusicDatabaseConnection(environment, 'runtime'); await verifyMusicRuntimeDatabaseConnection(connection, 'music_migrator');
  const pool = new pg.Pool({ connectionString: connection.connectionString, max: 1 });
  try {
    const ready = await checkMusicDatabaseReadiness(pool); if (!ready.ready) fail();
    const seeds = await pool.query('SELECT id FROM creator_accounts WHERE id=ANY($1::uuid[])', [marker.accounts]); if (seeds.rows.length !== marker.accounts.length) fail();
    const ownedRole = await pool.query("SELECT shobj_description(oid,'pg_authid') AS ownership FROM pg_roles WHERE rolname=$1", [marker.runtimeRole]); if (ownedRole.rows[0]?.ownership !== `music-browser:${marker.runId}:${marker.commit}`) fail();
  } finally { await pool.end(); }
  validateEnvironment(environment, marker); await sourceMatches(marker);
  const after = readMarker(markerPath); if (after.digest !== custody.digest || after.identity !== custody.identity) fail();
  const secrets = await readOwnedBrowserMusicSecretSnapshot(secretPaths, initialSecrets);
  validateEnvironment(environment, marker);
  const profile = Object.freeze({ kind: 'owned-browser-music/v1' as const }); profiles.set(profile, { ...custody, markerPath, snapshot: snapshot(marker.environment), expectedDatabaseUrl: connection.connectionString, secrets: [...secrets] }); return profile;
}
export async function assertOwnedBrowserMusicProfile(profile: ValidatedOwnedBrowserMusicProfile, environment: Environment) {
  const custody = profiles.get(profile); if (!custody || environment !== process.env || snapshot(environment) !== custody.snapshot) fail();
  const current = readMarker(custody.markerPath); if (current.identity !== custody.identity || current.digest !== custody.digest) fail(); await sourceMatches(custody.marker);
  for (const expected of custody.secrets) { const value = await readSecureMusicSecretFileWithDistinctAuthorities(expected.path, [], { mode: 'live' }); const metadata = lstatSync(expected.path, { bigint: true }); if (`${metadata.dev}:${metadata.ino}` !== expected.identity || createHash('sha256').update(value).digest('hex') !== expected.digest) fail(); }
  if (snapshot(environment) !== custody.snapshot) fail();
}
export function activateOwnedBrowserMusicRuntime(profile: ValidatedOwnedBrowserMusicProfile, environment: Environment, derivedDatabaseUrl: string) {
  const custody = profiles.get(profile); if (!custody || active || environment !== process.env || snapshot(environment) !== custody.snapshot || derivedDatabaseUrl !== custody.expectedDatabaseUrl) fail();
  custody.derived = derivedDatabaseUrl; environment.DATABASE_URL = derivedDatabaseUrl; active = { profile, environment };
  return () => { if (active?.profile === profile) { active = undefined; delete environment.DATABASE_URL; custody.derived = undefined; } };
}
export function hasValidatedOwnedBrowserMusicRuntime(environment: Environment): boolean {
  if (!active) return false;
  if (active.environment !== environment) fail();
  const custody = profiles.get(active.profile)!; const withoutDerived = { ...environment }; delete withoutDerived.DATABASE_URL;
  if (environment.DATABASE_URL !== custody.derived || snapshot(withoutDerived) !== custody.snapshot) fail();
  return true;
}
export async function assertActiveOwnedBrowserMusicRuntime(profile: ValidatedOwnedBrowserMusicProfile, environment: Environment) {
  if (active?.profile !== profile || !hasValidatedOwnedBrowserMusicRuntime(environment)) fail();
  const custody = profiles.get(profile)!;
  const current = readMarker(custody.markerPath); if (current.identity !== custody.identity || current.digest !== custody.digest) fail();
  await sourceMatches(custody.marker);
  for (const expected of custody.secrets) { const value = await readSecureMusicSecretFileWithDistinctAuthorities(expected.path, [], { mode: 'live' }); const metadata = lstatSync(expected.path, { bigint: true }); if (`${metadata.dev}:${metadata.ino}` !== expected.identity || createHash('sha256').update(value).digest('hex') !== expected.digest) fail(); }
  if (!hasValidatedOwnedBrowserMusicRuntime(environment)) fail();
}
