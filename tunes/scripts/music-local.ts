import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LOCAL_MUSIC_TARGET as target, activateValidatedLocalMusicRuntime, assertLocalMusicEnvironment, buildLocalMusicEnvironment,
  createValidatedLocalMusicProfile, parseLocalMusicManifest, type LocalMusicManifest, type ValidatedLocalMusicProfile } from '../server/config/music-local-profile';
import { assertCanonicalLocalPath, assertLocalPrivatePath, assertNoDockerOverrides, createLocalPrivateDirectory, createLocalPrivateFile,
  localMusicOsEnvironment, localMusicOsIdentity, readLocalPrivateSecret, runLocalProcess, validateLocalManifestPath, type LocalOsIdentity } from './music-local-state';
import { assertLocalDockerEndpoint, dockerOutput, inspectLocalMusicResources, localDockerLabels, resolveLocalDockerEndpoint,
  resolveLocalPostgresImage, type LocalResourceInspection, type RunDocker } from './music-local-docker';
import { checkLocalMusicDatabase, localDatabaseDependencies, provisionLocalMusicDatabase, type LocalDatabaseSecrets, type LocalDatabaseStatus } from './music-local-database';

export type LocalMusicPhase = 'validation' | 'manifest-missing' | 'state' | 'secrets-missing' | 'docker' | 'resources-missing' | 'database' | 'schema-missing' | 'identity-missing' | 'ready';
export interface SanitizedLocalStatus extends LocalDatabaseStatus {
  phase: LocalMusicPhase; databaseReady: boolean; missing: string[];
  containerName: string; volumeName: string; instanceId?: string; error?: 'refused';
}
export interface LocalResourceIdentity {
  version: 1; instanceId: string; endpoint: string; containerId: string; volumeCreatedAt: string;
}
export interface LocalMusicState { manifest: LocalMusicManifest; resourceIdentity?: LocalResourceIdentity }
export interface LocalMusicIo {
  exists(file: string): Promise<boolean>;
  canonical(file: string): Promise<void>;
  privatePath(file: string): Promise<void>;
  readJson(file: string): Promise<unknown>;
  readSecret(file: string): Promise<string>;
  createDirectory(file: string): Promise<void>;
  createFile(file: string, value: string): Promise<void>;
}
export interface LocalMusicDependencies {
  worktreeRoot: string; environment: NodeJS.ProcessEnv; osIdentity(): Promise<LocalOsIdentity>;
  io: LocalMusicIo; runDocker: RunDocker; portAvailable(): Promise<boolean>;
  provisionDatabase(manifest: LocalMusicManifest, secrets: LocalDatabaseSecrets, requireOwned: () => Promise<void>): Promise<LocalDatabaseStatus>;
  checkDatabase(manifest: LocalMusicManifest, password: string, requireOwned: () => Promise<void>): Promise<LocalDatabaseStatus>;
}
export interface LocalMusicStartDependencies {
  loadState(manifestPath: string): Promise<LocalMusicState>;
  requireOwnedResources(state: LocalMusicState): Promise<void>;
  readSecret(file: string): Promise<string>;
  readOptionalSecret(file: string): Promise<string | undefined>;
  checkDatabase(manifest: LocalMusicManifest, password: string, requireOwned: () => Promise<void>): Promise<LocalDatabaseStatus>;
  sourceIdentity(worktreeRoot: string): Promise<{ commit: string; dirty: boolean }>;
  installEnvironment(environment: NodeJS.ProcessEnv): void;
  activateRuntime?(profile: ValidatedLocalMusicProfile): () => void;
  loadStartup(): Promise<{ startLocalMusicServer: LocalMusicStarter }>;
}
export type LocalMusicStarter = (
  environment: Record<string, string | undefined>,
  profile: ValidatedLocalMusicProfile,
) => Promise<{ app: unknown; server: unknown; config: unknown; shutdown: () => Promise<void> }>;
function refuse(): never { throw new Error('LOCAL_MUSIC_REFUSED'); }
async function exists(file: string): Promise<boolean> {
  try { await lstat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
async function readPrivateJson(file: string): Promise<unknown> {
  await assertLocalPrivatePath(path.dirname(file)); await assertLocalPrivatePath(file);
  const before = await lstat(file, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n || before.size > 65536n) refuse();
  const handle = await open(file, 'r');
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) refuse();
    const value: unknown = JSON.parse(await handle.readFile('utf8'));
    const after = await lstat(file, { bigint: true });
    if (after.ino !== before.ino || after.dev !== before.dev || after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) refuse();
    await assertLocalPrivatePath(file); await assertLocalPrivatePath(path.dirname(file));
    return value;
  } finally { await handle.close(); }
}
export const defaultLocalMusicDependencies: LocalMusicDependencies = {
  worktreeRoot: path.resolve(import.meta.dirname, '../..'), environment: process.env, osIdentity: localMusicOsIdentity,
  io: { exists, canonical: assertCanonicalLocalPath, privatePath: assertLocalPrivatePath, readJson: readPrivateJson,
    readSecret: readLocalPrivateSecret, createDirectory: createLocalPrivateDirectory, createFile: createLocalPrivateFile },
  runDocker: (args, input) => runLocalProcess(process.platform === 'win32' ? 'docker.exe' : 'docker', args, input),
  portAvailable: () => new Promise((resolve) => {
    const server = createServer(); server.once('error', () => resolve(false));
    server.listen({ host: target.databaseHost, port: target.databasePort, exclusive: true }, () => server.close(() => resolve(true)));
  }),
  provisionDatabase: (manifest, secrets, requireOwned) => provisionLocalMusicDatabase(manifest, secrets, localDatabaseDependencies(requireOwned)),
  checkDatabase: (manifest, password, requireOwned) => checkLocalMusicDatabase(manifest, password, localDatabaseDependencies(requireOwned)),
};
function parseReceipt(value: unknown, manifest: LocalMusicManifest): LocalResourceIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(',') !== 'containerId,endpoint,instanceId,version,volumeCreatedAt'
    || input.version !== 1 || input.instanceId !== manifest.instanceId
    || typeof input.endpoint !== 'string' || typeof input.containerId !== 'string' || !/^[a-f0-9]{64}$/.test(input.containerId)
    || typeof input.volumeCreatedAt !== 'string' || !Number.isFinite(Date.parse(input.volumeCreatedAt))) refuse();
  assertLocalDockerEndpoint(input.endpoint);
  return input as unknown as LocalResourceIdentity;
}
async function context(manifestPath: string, deps: LocalMusicDependencies) {
  assertNoDockerOverrides(deps.environment);
  const os = await deps.osIdentity();
  const stateDirectory = validateLocalManifestPath(manifestPath, os.localAppData);
  await deps.io.canonical(os.localAppData); await deps.io.canonical(deps.worktreeRoot);
  return { os, stateDirectory };
}
/** Startup imports this: private metadata only, no Docker/database/secret loading or mutation. */
export async function loadLocalMusicState(manifestPath: string, deps: LocalMusicDependencies = defaultLocalMusicDependencies): Promise<LocalMusicState> {
  const { os, stateDirectory } = await context(manifestPath, deps);
  await deps.io.canonical(stateDirectory); await deps.io.privatePath(stateDirectory);
  const manifest = parseLocalMusicManifest(await deps.io.readJson(manifestPath));
  if (manifest.ownerId !== os.ownerId || path.relative(manifest.worktreeRoot, deps.worktreeRoot) !== '' || path.relative(manifest.stateDirectory, stateDirectory) !== '') refuse();
  assertLocalMusicEnvironment(buildLocalMusicEnvironment(manifest));
  const receiptPath = path.join(stateDirectory, 'resource-identity.json');
  const resourceIdentity = await deps.io.exists(receiptPath) ? parseReceipt(await deps.io.readJson(receiptPath), manifest) : undefined;
  return { manifest, resourceIdentity };
}
function sameResources(receipt: LocalResourceIdentity, inspection: LocalResourceInspection): boolean {
  return receipt.endpoint === inspection.endpoint && receipt.containerId === inspection.containerId && receipt.volumeCreatedAt === inspection.volumeCreatedAt;
}
/** Exact receipt + live Docker reinspection; must precede runtime credential derivation/TCP. */
export async function requireOwnedLocalMusicResources(state: LocalMusicState, run: RunDocker = defaultLocalMusicDependencies.runDocker): Promise<void> {
  if (!state.resourceIdentity) refuse();
  const inspection = await inspectLocalMusicResources(state.manifest, run, state.resourceIdentity.endpoint);
  if (!inspection.running || !sameResources(state.resourceIdentity, inspection)) refuse();
}
async function createState(manifestPath: string, manifest: LocalMusicManifest, deps: LocalMusicDependencies): Promise<void> {
  const base = path.dirname(manifest.stateDirectory);
  if (await deps.io.exists(manifest.stateDirectory)) refuse();
  if (await deps.io.exists(base)) await deps.io.privatePath(base); else await deps.io.createDirectory(base);
  await deps.io.createDirectory(manifest.stateDirectory);
  for (const filename of Object.values(target.secretFiles)) await deps.io.createFile(path.join(manifest.stateDirectory, filename), randomBytes(32).toString('base64url'));
  // Manifest is last: an interrupted initial state is retained, never silently repaired.
  await deps.io.createFile(manifestPath, JSON.stringify(manifest));
}
async function ensureResources(state: LocalMusicState, deps: LocalMusicDependencies, apply: boolean): Promise<boolean> {
  const { manifest } = state;
  const endpoint = await resolveLocalDockerEndpoint(deps.runDocker);
  let inspection = await inspectLocalMusicResources(manifest, deps.runDocker, endpoint);
  if (state.resourceIdentity) {
    if (!sameResources(state.resourceIdentity, inspection)) refuse();
    if (!inspection.running && apply) {
      if (!await deps.portAvailable()) refuse();
      await dockerOutput(deps.runDocker, ['--host', endpoint, 'start', state.resourceIdentity.containerId]);
      await requireOwnedLocalMusicResources(state, deps.runDocker);
      return true;
    }
    return inspection.running;
  }
  // Existing resources without an exclusive receipt are recovery work, never adoption.
  if (inspection.containerId || inspection.volumeCreatedAt) refuse();
  if (!apply) return false;
  if (!await deps.portAvailable()) refuse();
  const labelArgs = Object.entries(localDockerLabels(manifest)).flatMap(([name, value]) => ['--label', `${name}=${value}`]);
  await dockerOutput(deps.runDocker, ['--host', endpoint, 'volume', 'create', '--driver', 'local', ...labelArgs, target.volumeName]);
  const id = await dockerOutput(deps.runDocker, ['--host', endpoint, 'create', '--pull', 'never', '--name', target.containerName,
    ...labelArgs, '--network', 'bridge', '--restart', 'no', '--publish', '127.0.0.1:55433:5432',
    '--mount', `type=volume,source=${target.volumeName},target=/var/lib/postgresql/data`,
    '--mount', `type=bind,source=${path.join(manifest.stateDirectory, target.secretFiles.admin)},target=/run/secrets/db-admin,readonly`,
    '--env', `POSTGRES_DB=${target.databaseName}`, '--env', 'POSTGRES_PASSWORD_FILE=/run/secrets/db-admin', manifest.imageId]);
  if (!/^[a-f0-9]{64}$/.test(id)) refuse();
  inspection = await inspectLocalMusicResources(manifest, deps.runDocker, endpoint);
  if (inspection.containerId !== id || !inspection.volumeCreatedAt) refuse();
  const receipt: LocalResourceIdentity = { version: 1, instanceId: manifest.instanceId, endpoint, containerId: id, volumeCreatedAt: inspection.volumeCreatedAt };
  await deps.io.createFile(path.join(manifest.stateDirectory, 'resource-identity.json'), JSON.stringify(receipt));
  state.resourceIdentity = receipt;
  if (!await deps.portAvailable()) refuse();
  await dockerOutput(deps.runDocker, ['--host', endpoint, 'start', id]);
  await requireOwnedLocalMusicResources(state, deps.runDocker);
  return true;
}
async function operate(manifestPath: string, apply: boolean, deps: LocalMusicDependencies): Promise<SanitizedLocalStatus> {
  const report: SanitizedLocalStatus = { phase: 'validation', ready: false, databaseReady: false, missing: [], containerName: target.containerName, volumeName: target.volumeName };
  try {
    const { os, stateDirectory } = await context(manifestPath, deps);
    if (!await deps.io.exists(manifestPath)) {
      if (!apply) return { ...report, phase: 'manifest-missing', missing: ['manifest'] };
      report.phase = 'docker';
      const endpoint = await resolveLocalDockerEndpoint(deps.runDocker);
      const imageId = await resolveLocalPostgresImage(deps.runDocker, endpoint);
      const candidate = parseLocalMusicManifest({ version: 1, instanceId: randomUUID(), ownerId: os.ownerId, imageId, stateDirectory, worktreeRoot: deps.worktreeRoot, cohortUserDocumentIds: [] });
      const resources = await inspectLocalMusicResources(candidate, deps.runDocker, endpoint);
      if (resources.containerId || resources.volumeCreatedAt || !await deps.portAvailable()) refuse();
      report.phase = 'state'; await createState(manifestPath, candidate, deps);
    }
    const state = await loadLocalMusicState(manifestPath, deps);
    const { manifest } = state; report.instanceId = manifest.instanceId;
    report.phase = 'state';
    const secrets: Record<string, string> = {};
    for (const [name, filename] of Object.entries(target.secretFiles)) {
      const file = path.join(manifest.stateDirectory, filename);
      if (!await deps.io.exists(file)) report.missing.push(filename);
      else secrets[name] = await deps.io.readSecret(file);
    }
    if (report.missing.length) return { ...report, phase: 'secrets-missing' };
    if (new Set(Object.values(secrets)).size !== Object.keys(target.secretFiles).length) refuse();
    report.phase = 'docker';
    if (!await ensureResources(state, deps, apply)) return { ...report, phase: 'resources-missing', missing: ['owned-running-container'] };
    report.phase = 'database';
    const requireOwned = () => requireOwnedLocalMusicResources(state, deps.runDocker);
    const database = apply ? await deps.provisionDatabase(manifest, { admin: secrets.admin, migrator: secrets.migrator, runtime: secrets.runtime }, requireOwned)
      : await deps.checkDatabase(manifest, secrets.runtime, requireOwned);
    Object.assign(report, database, { ready: false, databaseReady: database.ready });
    if (!database.ready) return { ...report, phase: 'schema-missing', missing: ['canonical-migration'] };
    if (!manifest.lifecycleProofFile) return { ...report, phase: 'identity-missing', missing: ['STRAPI_LIFECYCLE_PROOF_TOKEN_FILE'] };
    await deps.io.readSecret(manifest.lifecycleProofFile);
    return { ...report, phase: 'ready', ready: true };
  } catch { return { ...report, ready: false, error: 'refused' }; }
}
export function parseLocalMusicArguments(args: string[]): ParsedLocalMusicArguments {
  if (!Array.isArray(args) || !['check', 'provision', 'start'].includes(args[0]) || args[1] !== '--manifest'
    || !args[2] || args[2].startsWith('--')) throw new Error('LOCAL_MUSIC_ARGUMENTS');
  if (args[0] === 'start') {
    if (args.length !== 3 && !(args.length === 4 && args[3] === '--enable-cohort')) throw new Error('LOCAL_MUSIC_ARGUMENTS');
    return { command: 'start', manifestPath: args[2], enableCohort: args.length === 4 };
  }
  if (!((args.length === 3) || (args[0] === 'provision' && args.length === 4 && args[3] === '--apply'))) throw new Error('LOCAL_MUSIC_ARGUMENTS');
  return { command: args[0] as 'check' | 'provision', manifestPath: args[2], apply: args.length === 4 };
}
export async function provisionLocalMusic(manifestPath: string, options: { apply: boolean }, deps: LocalMusicDependencies = defaultLocalMusicDependencies): Promise<SanitizedLocalStatus> {
  return operate(manifestPath, options.apply === true, deps);
}
export async function checkLocalMusic(manifestPath: string, deps: LocalMusicDependencies = defaultLocalMusicDependencies): Promise<SanitizedLocalStatus> {
  return operate(manifestPath, false, deps);
}

function installCleanLocalEnvironment(environment: NodeJS.ProcessEnv): void {
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, environment);
}

async function localSourceIdentity(worktreeRoot: string): Promise<{ commit: string; dirty: boolean }> {
  const commit = await runLocalProcess('git', ['-C', worktreeRoot, 'rev-parse', 'HEAD']);
  const status = await runLocalProcess('git', ['-C', worktreeRoot, 'status', '--porcelain', '--untracked-files=normal']);
  if (commit.exitCode !== 0 || status.exitCode !== 0) refuse();
  return { commit: commit.stdout.trim(), dirty: status.stdout.length > 0 };
}

const defaultLocalMusicStartDependencies: LocalMusicStartDependencies = {
  loadState: (manifestPath) => loadLocalMusicState(manifestPath),
  requireOwnedResources: (state) => requireOwnedLocalMusicResources(state),
  readSecret: readLocalPrivateSecret,
  readOptionalSecret: async (file) => await exists(file) ? await readLocalPrivateSecret(file) : undefined,
  checkDatabase: (manifest, password, requireOwned) => checkLocalMusicDatabase(manifest, password, localDatabaseDependencies(requireOwned)),
  sourceIdentity: localSourceIdentity,
  installEnvironment: installCleanLocalEnvironment,
  activateRuntime: (profile) => activateValidatedLocalMusicRuntime(profile, process.env),
  loadStartup: async () => {
    const startupModule = '../server/config/music-startup';
    return await import(startupModule) as { startLocalMusicServer: LocalMusicStarter };
  },
};

/** Validates every local authority and readiness proof before importing the server runtime. */
export async function startLocalMusic(
  manifestPath: string,
  options: { enableCohort: boolean },
  dependencies: LocalMusicStartDependencies = defaultLocalMusicStartDependencies,
): Promise<Awaited<ReturnType<LocalMusicStarter>> & { profile: ValidatedLocalMusicProfile }> {
  let deactivate: (() => void) | undefined;
  let phase = 'STATE';
  try {
    const state = await dependencies.loadState(manifestPath);
    const { manifest } = state;
    phase = 'ENVIRONMENT';
    const applicationEnvironment = buildLocalMusicEnvironment(manifest);
    assertLocalMusicEnvironment(applicationEnvironment);
    if (!manifest.lifecycleProofFile || options.enableCohort && manifest.cohortUserDocumentIds.length === 0) refuse();
    phase = 'RESOURCES';
    await dependencies.requireOwnedResources(state);

    phase = 'CREDENTIALS';
    const credentials: Record<string, string> = {};
    for (const [name, filename] of Object.entries(target.secretFiles)) {
      credentials[name] = await dependencies.readSecret(path.join(manifest.stateDirectory, filename));
      if (!credentials[name]) refuse();
    }
    credentials.lifecycleProof = await dependencies.readSecret(manifest.lifecycleProofFile);
    if (!credentials.lifecycleProof || new Set(Object.values(credentials)).size !== Object.keys(credentials).length) refuse();
    const youtubeApiKey = await dependencies.readOptionalSecret(path.join(manifest.stateDirectory, "youtube-api"));
    if (youtubeApiKey !== undefined && !youtubeApiKey) refuse();

    const requireOwned = () => dependencies.requireOwnedResources(state);
    phase = 'DATABASE';
    const database = await dependencies.checkDatabase(manifest, credentials.runtime, requireOwned);
    if (!database.ready || !database.migrationId || !database.migrationChecksum || !database.schemaChecksum) refuse();
    phase = 'SOURCE';
    const source = await dependencies.sourceIdentity(manifest.worktreeRoot);
    const profile = createValidatedLocalMusicProfile({
      manifest, applicationEnvironment, resourcesValidated: true, credentialsValidated: true,
      databaseReady: true, enableCohort: options.enableCohort === true, source,
    });
    const runtimeEnvironment: NodeJS.ProcessEnv = {
      ...localMusicOsEnvironment(process.env),
      ...applicationEnvironment,
      COOKIE_SECRET: credentials.cookie,
      SESSION_SECRET: credentials.session,
      ...(youtubeApiKey === undefined ? {} : { YOUTUBE_API_KEY: youtubeApiKey }),
    };
    phase = 'RUNTIME';
    dependencies.installEnvironment(runtimeEnvironment);
    deactivate = dependencies.activateRuntime?.(profile);
    const { startLocalMusicServer } = await dependencies.loadStartup();
    const started = await startLocalMusicServer(dependencies.activateRuntime ? process.env : runtimeEnvironment, profile);
    const shutdown = started.shutdown;
    return {
      ...started,
      profile,
      shutdown: async () => {
        try { await shutdown(); }
        finally { deactivate?.(); deactivate = undefined; }
      },
    };
  } catch {
    deactivate?.();
    throw new Error(`LOCAL_MUSIC_REFUSED_${phase}`);
  }
}

export type ParsedLocalMusicArguments =
  | { command: 'check' | 'provision'; manifestPath: string; apply: boolean }
  | { command: 'start'; manifestPath: string; enableCohort: boolean };

/** Emits only a fixed stage label; never surface a startup error's raw detail. */
export function sanitizeLocalMusicStartFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^LOCAL_MUSIC_REFUSED_(?:STATE|ENVIRONMENT|RESOURCES|CREDENTIALS|DATABASE|SOURCE|RUNTIME)$/.test(message)
    ? message
    : 'LOCAL_MUSIC_REFUSED';
}

export function installLocalMusicSignalShutdown(
  shutdown: () => Promise<void>,
  runtime: {
    exitCode?: string | number | null;
    once(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  } = process,
): () => Promise<void> {
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= shutdown().catch(() => { runtime.exitCode = 1; });
  runtime.once('SIGINT', () => { void stop(); });
  runtime.once('SIGTERM', () => { void stop(); });
  return stop;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void (async () => {
    try {
      const args = parseLocalMusicArguments(process.argv.slice(2));
      if (args.command === 'start') {
        const started = await startLocalMusic(args.manifestPath, { enableCohort: args.enableCohort });
        installLocalMusicSignalShutdown(started.shutdown);
        process.stdout.write(`${JSON.stringify({ phase: 'started', environment: 'local', deploymentQualified: false, admission: started.profile.admission.choice })}\n`);
        return;
      }
      const result = args.command === 'check' ? await checkLocalMusic(args.manifestPath) : await provisionLocalMusic(args.manifestPath, { apply: args.apply });
      process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.error || !result.databaseReady ? 1 : 0;
    } catch (error) { process.stderr.write(`${sanitizeLocalMusicStartFailure(error)}\n`); process.exitCode = 1; }
  })();
}
