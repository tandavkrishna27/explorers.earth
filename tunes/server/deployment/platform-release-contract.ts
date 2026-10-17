import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EXPECTED_MUSIC_MIGRATION_ID } from '../../shared/music-migration-contract';

export class ReleaseContractError extends Error { constructor(public readonly code: string) { super(code); } }
function fail(code: string): never { throw new ReleaseContractError(code); }
export const SCHEMA_FLOOR = Number(EXPECTED_MUSIC_MIGRATION_ID.slice(0, 4));
const short = z.string().min(1).max(256);
const reference = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{1,95}$/);
const identifier = z.string().regex(/^[a-z_][a-z0-9_]{1,62}$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const architecture = z.enum(['linux/amd64', 'linux/arm64']);
const evidence = z.string().regex(/^artifact:[1-9][0-9]{0,19}\/[a-zA-Z0-9_-]{1,96}$/);
const platform = z.object({ digest, smokeEvidenceRef: evidence }).strict();
const image = z.object({ repository: short, digest, platforms: z.record(platform).refine(p => Object.keys(p).length >= 1 && Object.keys(p).length <= 2 && Object.keys(p).every(k => architecture.safeParse(k).success)) }).strict();
const releaseSchema = z.object({ version: z.literal(1), sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), schemaVersion: z.literal(SCHEMA_FLOOR), producerRunId: z.string().regex(/^[1-9][0-9]{0,19}$/), producerRepository: z.literal('tandavkrishna27/explorers.earth'), producerWorkflow: z.literal('.github/workflows/platform-candidate.yml'), testEvidenceRef: evidence, images: z.object({ api: image, web: image }).strict(), manifestDigest: digest }).strict();
export type ReleaseManifest = z.infer<typeof releaseSchema>;
export function canonicalDigest(value: unknown): string {
  function canonical(v: unknown, depth: number, root = false): string {
    if (depth > 32) fail('JSON_DEPTH_LIMIT');
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(e => canonical(e, depth + 1)).join(',') + ']';
    if (typeof v === 'object' && v && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)) return '{' + Object.keys(v).filter(k => !(root && k === 'manifestDigest')).sort().map(k => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k], depth + 1)).join(',') + '}';
    return fail('NON_JSON_VALUE');
  }
  return 'sha256:' + createHash('sha256').update(canonical(value, 0, true), 'utf8').digest('hex');
}
export function parseRelease(value: unknown): ReleaseManifest {
  const parsed = releaseSchema.safeParse(value); if (!parsed.success) fail('RELEASE_SCHEMA_INVALID');
  const result = parsed.data;
  if (result.images.api.repository !== 'ghcr.io/tandavkrishna27/explorers-api' || result.images.web.repository !== 'ghcr.io/tandavkrishna27/explorers-web') fail('IMAGE_REPOSITORY_INVALID');
  for (const i of Object.values(result.images)) for (const p of Object.values(i.platforms)) if (!p.smokeEvidenceRef.startsWith(`artifact:${result.producerRunId}/`)) fail('EVIDENCE_RUN_MISMATCH');
  if (!result.testEvidenceRef.startsWith(`artifact:${result.producerRunId}/`)) fail('EVIDENCE_RUN_MISMATCH');
  if (canonicalDigest(result) !== result.manifestDigest) fail('MANIFEST_DIGEST_MISMATCH');
  return result;
}
const publicConfig = z.object({ origin: short, apiPath: z.literal('/api'), socketPath: z.literal('/socket.io'), mapsBrowserKeyRef: reference.optional(), analytics: z.object({ enabled: z.boolean(), identifier: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional() }).strict().optional() }).strict();
const readinessSchema = z.object({ version: z.literal(1), environment: z.enum(['qa', 'production']), hostAlias: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/), sshUser: identifier, sshPort: z.number().int().min(1).max(65535), knownHostKeyRef: reference, architecture, dockerVersion: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/), composeVersion: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/), publicOrigin: short, internalPorts: z.object({ api: z.number().int().min(1024).max(65535), web: z.literal(80), postgres: z.literal(5432) }).strict(), database: z.object({ name: identifier, volume: identifier, runtimeRole: identifier, migratorRole: identifier, runtimePasswordRef: reference, migratorPasswordRef: reference }).strict(), storage: z.object({ bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/), region: z.string().regex(/^[a-z]{2}-[a-z]+-[1-9]$/), prefix: short, boundary: z.literal('application-shared-principal') }).strict(), google: z.object({ clientIdRef: reference, clientSecretRef: reference, callback: short }).strict(), appSecretRef: reference, publicConfig }).strict();
export type ReadinessManifest = z.infer<typeof readinessSchema>;
export function parseReadiness(value: unknown): ReadinessManifest {
  if (value && typeof value === 'object' && (value as any).environment === 'qa' && !(value as any).publicOrigin) fail('QA_HOSTNAME_MISSING');
  const parsed = readinessSchema.safeParse(value); if (!parsed.success) fail('READINESS_SCHEMA_INVALID');
  const r = parsed.data; let origin: URL; try { origin = new URL(r.publicOrigin); } catch { return fail('ORIGIN_INVALID'); }
  if (origin.protocol !== 'https:' || origin.origin !== r.publicOrigin || origin.username || origin.password || origin.hostname === 'localhost' || origin.hostname === '127.0.0.1') fail('ORIGIN_INVALID');
  if (r.google.callback !== r.publicOrigin + '/api/auth/callback/google') fail('CALLBACK_MISMATCH');
  if (r.publicConfig.origin !== r.publicOrigin) fail('PUBLIC_ORIGIN_MISMATCH');
  if (r.publicConfig.analytics?.enabled && !r.publicConfig.analytics.identifier || r.publicConfig.analytics?.enabled === false && r.publicConfig.analytics.identifier) fail('PUBLIC_ANALYTICS_INVALID');
  if (r.storage.prefix !== (r.environment === 'qa' ? 'qa/' : 'prod/')) fail('STORAGE_NAMESPACE_INVALID');
  if (r.database.runtimeRole === r.database.migratorRole || ['postgres', 'music_runtime'].includes(r.database.runtimeRole)) fail('DATABASE_ROLE_INVALID');
  if (new Set([r.database.runtimePasswordRef, r.database.migratorPasswordRef, r.appSecretRef]).size !== 3) fail('SECRET_REFERENCE_COLLISION');
  if (r.publicConfig.mapsBrowserKeyRef && [r.database.runtimePasswordRef, r.database.migratorPasswordRef, r.appSecretRef, r.google.clientSecretRef, r.knownHostKeyRef].includes(r.publicConfig.mapsBrowserKeyRef)) fail('PUBLIC_SECRET_REFERENCE');
  return r;
}
export function validateEnvironmentPair(qaValue: unknown, prodValue: unknown): void {
  const qa = parseReadiness(qaValue), prod = parseReadiness(prodValue);
  if (qa.environment !== 'qa' || prod.environment !== 'production') fail('ENVIRONMENT_PAIR_INVALID');
  if (qa.hostAlias === prod.hostAlias || qa.publicOrigin === prod.publicOrigin || qa.database.name === prod.database.name || qa.database.volume === prod.database.volume) fail('ENVIRONMENT_ISOLATION_INVALID');
  const qaSecrets = [qa.database.runtimePasswordRef, qa.database.migratorPasswordRef, qa.appSecretRef];
  if ([prod.database.runtimePasswordRef, prod.database.migratorPasswordRef, prod.appSecretRef].some(r => qaSecrets.includes(r))) fail('ENVIRONMENT_SECRET_COLLISION');
  if (qa.storage.bucket !== prod.storage.bucket || qa.storage.region !== prod.storage.region || qa.google.clientIdRef !== prod.google.clientIdRef || qa.google.clientSecretRef !== prod.google.clientSecretRef) fail('SHARED_SERVICE_POLICY_INVALID');
}
export function runtimeMapping(value: unknown) {
  const r = parseReadiness(value);
  return { values: { NODE_ENV: 'production', EXPLORERS_DEPLOYMENT_TIER: r.environment === 'qa' ? 'qa' : 'production', EXPLORERS_PUBLIC_ORIGIN: r.publicOrigin, EXPLORERS_MEDIA_ENVIRONMENT: r.environment === 'qa' ? 'qa' : 'prod', EXPLORERS_MEDIA_S3_BUCKET: r.storage.bucket, EXPLORERS_MEDIA_S3_REGION: r.storage.region, MUSIC_DATABASE_HOST: 'postgres', MUSIC_DATABASE_NAME: r.database.name, MUSIC_DATABASE_USER: r.database.runtimeRole, MUSIC_DATABASE_MIGRATOR_USER: r.database.migratorRole, MUSIC_DATABASE_PORT: String(r.internalPorts.postgres), PORT: String(r.internalPorts.api) }, secretRefs: { EXPLORERS_AUTH_SECRET: r.appSecretRef, GOOGLE_CLIENT_ID: r.google.clientIdRef, GOOGLE_CLIENT_SECRET: r.google.clientSecretRef, MUSIC_DATABASE_PASSWORD_FILE: r.database.runtimePasswordRef }, migratorSecretRefs: { MUSIC_DATABASE_PASSWORD_FILE: r.database.migratorPasswordRef } };
}
// This offline package intentionally has no production trust adapter. Caller claims cannot authorize a release.
export function verifyRelease(manifest: unknown, readiness: unknown, _authority?: never): never {
  const m = parseRelease(manifest), r = parseReadiness(readiness);
  if (!m.images.api.platforms[r.architecture] || !m.images.web.platforms[r.architecture]) fail('ARCHITECTURE_EVIDENCE_MISSING');
  return fail('TRUSTED_AUTHORITY_UNAVAILABLE');
}
// Recursive descent prevents duplicate escaped keys and bounded-depth parser abuse before JSON.parse.
export function parseStrictJson(text: string): unknown {
  if (Buffer.byteLength(text, 'utf8') > 65536) fail('JSON_SIZE_LIMIT');
  let i = 0;
  const ws = () => { while (/[\t\n\r ]/.test(text[i] ?? '!')) i++; };
  function string(): string { const start = i++; while (i < text.length) { const c = text[i++]; if (c === '"') { try { return JSON.parse(text.slice(start, i)); } catch { fail('JSON_INVALID'); } } if (c === '\\') i++; } return fail('JSON_INVALID'); }
  function value(depth: number): void {
    if (depth > 32) fail('JSON_DEPTH_LIMIT'); ws();
    if (text[i] === '{') { i++; ws(); const keys = new Set<string>(); if (text[i] !== '}') { while (true) { if (text[i] !== '"') fail('JSON_INVALID'); const key = string(); if (keys.has(key)) fail('DUPLICATE_JSON_KEY'); keys.add(key); ws(); if (text[i++] !== ':') fail('JSON_INVALID'); value(depth + 1); ws(); if (text[i] !== ',') break; i++; ws(); } } if (text[i++] !== '}') fail('JSON_INVALID'); }
    else if (text[i] === '[') { i++; ws(); if (text[i] !== ']') { while (true) { value(depth + 1); ws(); if (text[i] !== ',') break; i++; } } if (text[i++] !== ']') fail('JSON_INVALID'); }
    else if (text[i] === '"') string();
    else { const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(i)); if (!match) fail('JSON_INVALID'); i += match[0].length; }
  }
  value(0); ws(); if (i !== text.length) fail('JSON_INVALID');
  let result: unknown; try { result = JSON.parse(text); } catch { return fail('JSON_INVALID'); }
  canonicalDigest(result); return result;
}
