import path from "node:path";

export const LOCAL_MUSIC_TARGET = Object.freeze({
  containerName: "explorers-local-music-pg15",
  volumeName: "explorers-local-music-pg15-data",
  databaseHost: "127.0.0.1",
  databasePort: 55433,
  databaseName: "explorers_music_local_uat",
  migratorUser: "explorers_music_local_uat_migrator",
  runtimeUser: "explorers_music_local_uat_runtime",
  apiHost: "127.0.0.1",
  apiPort: 5000,
  strapiOrigin: "https://api.localqr.earth",
  frontendOrigins: Object.freeze(["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5174"]),
  musicOrigin: "https://music.localhost",
  secretFiles: Object.freeze({
    admin: "db-admin", migrator: "db-migrator", runtime: "db-runtime",
    musicToken: "music-token", publicId: "public-id", publicationKey: "publication-key",
    cookie: "cookie", session: "session",
  }),
} as const);

export interface LocalMusicManifest {
  version: 1;
  instanceId: string;
  worktreeRoot: string;
  ownerId: string;
  imageId: string;
  stateDirectory: string;
  lifecycleProofFile?: string;
  cohortUserDocumentIds: string[];
}

export interface LocalMusicAdmission {
  readonly choice: "disabled" | "cohort";
  readonly cohortUserDocumentIds: readonly string[];
  readonly newEntryKillSwitch: boolean;
  readonly workspaceKillSwitch: boolean;
  readonly ownerWorkspace: boolean;
  readonly guestWorkspace: boolean;
  readonly playlistImports: false;
}

export interface ValidatedLocalMusicProfile {
  readonly kind: "local-music";
  readonly instanceId: string;
  readonly source: Readonly<{ commit: string; dirty: boolean }>;
  readonly admission: LocalMusicAdmission;
  readonly applicationEnvironment: Readonly<Record<string, string>>;
}

const validatedProfiles = new WeakSet<object>();
let activeRuntime: { profile: ValidatedLocalMusicProfile; environment: NodeJS.ProcessEnv } | undefined;

export function createValidatedLocalMusicProfile(input: {
  manifest: LocalMusicManifest;
  applicationEnvironment: Record<string, string>;
  resourcesValidated: boolean;
  credentialsValidated: boolean;
  databaseReady: boolean;
  enableCohort: boolean;
  source: { commit: string; dirty: boolean };
}): ValidatedLocalMusicProfile {
  const manifest = parseLocalMusicManifest(input.manifest);
  assertLocalMusicEnvironment(input.applicationEnvironment);
  const expected = buildLocalMusicEnvironment(manifest);
  if (Object.keys(expected).length !== Object.keys(input.applicationEnvironment).length
      || Object.entries(expected).some(([name, value]) => input.applicationEnvironment[name] !== value)
      || input.resourcesValidated !== true || input.credentialsValidated !== true || input.databaseReady !== true) {
    fail("validated_profile");
  }
  if (!/^[a-f0-9]{40}$/.test(input.source.commit) || typeof input.source.dirty !== "boolean") fail("source_identity");
  if (input.enableCohort && manifest.cohortUserDocumentIds.length === 0) fail("cohort_admission");
  const cohort = Object.freeze(input.enableCohort ? [...manifest.cohortUserDocumentIds] : []);
  const profile: ValidatedLocalMusicProfile = Object.freeze({
    kind: "local-music",
    instanceId: manifest.instanceId,
    source: Object.freeze({ ...input.source }),
    admission: Object.freeze({
      choice: input.enableCohort ? "cohort" : "disabled",
      cohortUserDocumentIds: cohort,
      newEntryKillSwitch: !input.enableCohort,
      workspaceKillSwitch: !input.enableCohort,
      ownerWorkspace: input.enableCohort,
      guestWorkspace: input.enableCohort,
      playlistImports: false,
    }),
    applicationEnvironment: Object.freeze({ ...expected }),
  });
  validatedProfiles.add(profile);
  return profile;
}

export function assertValidatedLocalMusicProfile(
  profile: ValidatedLocalMusicProfile,
  environment?: Record<string, string | undefined>,
): void {
  if (!profile || !validatedProfiles.has(profile)) fail("validated_profile");
  if (!environment) return;
  const boundaryEnvironment = Object.fromEntries(Object.entries(environment)
    .filter(([name]) => !["DATABASE_URL", "COOKIE_SECRET", "SESSION_SECRET"].includes(name)));
  assertLocalMusicEnvironment(boundaryEnvironment);
  if (Object.entries(profile.applicationEnvironment).some(([name, value]) => environment[name] !== value)) {
    fail("environment_target");
  }
}

/** In-memory capability installed only after the launcher has validated files/resources. */
export function activateValidatedLocalMusicRuntime(
  profile: ValidatedLocalMusicProfile,
  environment: NodeJS.ProcessEnv,
): () => void {
  assertValidatedLocalMusicProfile(profile, environment);
  if (environment !== process.env || activeRuntime) fail("runtime_context");
  activeRuntime = { profile, environment };
  return () => { if (activeRuntime?.profile === profile) activeRuntime = undefined; };
}

export function hasValidatedLocalMusicRuntime(environment: NodeJS.ProcessEnv): boolean {
  return activeRuntime?.environment === environment
    && activeRuntime.profile.kind === "local-music"
    && validatedProfiles.has(activeRuntime.profile);
}

export function parseLocalMusicManifest(value: unknown): LocalMusicManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("manifest");
  const input = value as Record<string, unknown>;
  const keys = new Set(["version", "instanceId", "worktreeRoot", "ownerId", "imageId", "stateDirectory", "lifecycleProofFile", "cohortUserDocumentIds"]);
  if (Reflect.ownKeys(input).some((key) => typeof key !== "string" || !keys.has(key))) fail("manifest_fields");
  if (input.version !== 1) fail("manifest_version");
  if (typeof input.instanceId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.instanceId)) fail("instance_id");
  if (typeof input.imageId !== "string" || !/^sha256:[a-f0-9]{64}$/.test(input.imageId)) fail("image_id");
  if (typeof input.ownerId !== "string" || !/^(?:0|[1-9][0-9]*|S-1-(?:0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*)){1,15})$/.test(input.ownerId)) fail("owner_id");
  const worktreeRoot = absolutePath(input.worktreeRoot);
  const stateDirectory = absolutePath(input.stateDirectory);
  assertOutsideWorktree(stateDirectory, worktreeRoot);
  const lifecycleProofFile = input.lifecycleProofFile === undefined ? undefined : absolutePath(input.lifecycleProofFile);
  if (lifecycleProofFile !== undefined) assertOutsideWorktree(lifecycleProofFile, worktreeRoot);
  const cohortUserDocumentIds = parseCohort(input.cohortUserDocumentIds === undefined ? [] : input.cohortUserDocumentIds);
  return {
    version: 1, instanceId: input.instanceId, worktreeRoot, ownerId: input.ownerId,
    imageId: input.imageId, stateDirectory, cohortUserDocumentIds,
    ...(lifecycleProofFile === undefined ? {} : { lifecycleProofFile }),
  };
}

/** Pre-secret-load policy. Filesystem identity/ACL checks belong to the launcher. */
export function assertLocalMusicEnvironment(env: Record<string, string | undefined>): void {
  for (const [name, expected] of Object.entries(fixedEnvironment)) {
    if (env[name] !== expected) fail("environment_target");
  }
  const allowed = new Set([
    ...Object.keys(fixedEnvironment), ...Object.keys(runtimeSecretFiles),
    "STRAPI_LIFECYCLE_PROOF_TOKEN_FILE", "MUSIC_COHORT_ENABLED", "MUSIC_COHORT_USER_DOCUMENT_IDS",
  ]);
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || allowed.has(name)) continue;
    if (/^(?:MUSIC_|STRAPI_|DATABASE_|PG|EXPLORERS_ANALYTICS_|COOKIE_SECRET|SESSION_SECRET)/i.test(name)
        || /(?:STRAPI|ANALYTICS)/i.test(name)) fail("environment_authority");
  }
  const stateDirectory = path.dirname(absolutePath(env.MUSIC_DATABASE_PASSWORD_FILE));
  for (const [name, filename] of Object.entries(runtimeSecretFiles)) {
    if (absolutePath(env[name]) !== path.join(stateDirectory, filename)) fail("secret_file");
  }
  if (env.STRAPI_LIFECYCLE_PROOF_TOKEN_FILE !== undefined) {
    const proofFile = absolutePath(env.STRAPI_LIFECYCLE_PROOF_TOKEN_FILE);
    if (Object.values(LOCAL_MUSIC_TARGET.secretFiles).some((filename) => path.relative(proofFile, path.join(stateDirectory, filename)) === "")) fail("secret_authority");
  }
  if (env.MUSIC_COHORT_ENABLED !== "true" && env.MUSIC_COHORT_ENABLED !== "false") fail("cohort");
  if (typeof env.MUSIC_COHORT_USER_DOCUMENT_IDS !== "string") fail("cohort");
  const cohort = parseCohort(env.MUSIC_COHORT_USER_DOCUMENT_IDS === "" ? [] : env.MUSIC_COHORT_USER_DOCUMENT_IDS.split(","));
  if (env.MUSIC_COHORT_ENABLED !== String(cohort.length > 0)) fail("cohort");
}

function fail(category: string): never {
  // Categories are fixed by callers; never echo paths, credentials or supplied values.
  throw new Error(`LOCAL_MUSIC_INVALID_${category.toUpperCase()}`);
}

function absolutePath(value: unknown): string {
  if (typeof value !== "string" || !value || /[\u0000-\u001f\u007f]/.test(value)
      || !path.isAbsolute(value) || path.resolve(value) !== value) fail("path");
  return value;
}

function assertOutsideWorktree(candidate: string, worktreeRoot: string): void {
  const relative = path.relative(worktreeRoot, candidate);
  if (relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))) fail("path_containment");
}

function parseCohort(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100
      || value.some((id) => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id))
      || new Set(value).size !== value.length) fail("cohort");
  return [...value];
}

const fixedEnvironment: Readonly<Record<string, string>> = Object.freeze({
  MUSIC_RUNTIME_PROFILE: "local-music", NODE_ENV: "development", MUSIC_MODE: "live",
  HOST: LOCAL_MUSIC_TARGET.apiHost, PORT: String(LOCAL_MUSIC_TARGET.apiPort),
  MUSIC_DATABASE_HOST: LOCAL_MUSIC_TARGET.databaseHost,
  MUSIC_DATABASE_PORT: String(LOCAL_MUSIC_TARGET.databasePort),
  MUSIC_DATABASE_NAME: LOCAL_MUSIC_TARGET.databaseName,
  MUSIC_DATABASE_USER: LOCAL_MUSIC_TARGET.runtimeUser,
  MUSIC_DATABASE_MIGRATOR_USER: LOCAL_MUSIC_TARGET.migratorUser,
  STRAPI_URL: LOCAL_MUSIC_TARGET.strapiOrigin,
  MUSIC_STRAPI_ALLOWED_ORIGINS: LOCAL_MUSIC_TARGET.strapiOrigin,
  TRUST_PROXY_HOPS: "1", MUSIC_TRUSTED_PROXY_IP: LOCAL_MUSIC_TARGET.apiHost,
  ALLOWED_ORIGINS: [...LOCAL_MUSIC_TARGET.frontendOrigins, LOCAL_MUSIC_TARGET.musicOrigin].join(","),
  MUSIC_NEW_ENTRY_KILL_SWITCH: "true", MUSIC_WORKSPACE_KILL_SWITCH: "true",
  // Hosted development Strapi includes database work before response headers;
  // retain bounded fail-closed deadlines while avoiding the production default's 2s false outage.
  MUSIC_CONNECT_TIMEOUT_MS: "5000", MUSIC_READ_TIMEOUT_MS: "5000", MUSIC_IDENTITY_OVERALL_TIMEOUT_MS: "15000",
  MUSIC_RECONCILIATION_ENABLED: "false", MUSIC_RECONCILIATION_APPLY_ENABLED: "false",
  MUSIC_RECONCILIATION_MAX_ROWS: "0",
  MUSIC_TOKEN_CURRENT_KID: "local-music-v1", MUSIC_TOKEN_LIFETIME_SECONDS: "600", MUSIC_TOKEN_CLOCK_SKEW_SECONDS: "15",
  MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "local-publication-v1",
});

const runtimeSecretFiles = {
  MUSIC_DATABASE_PASSWORD_FILE: LOCAL_MUSIC_TARGET.secretFiles.runtime,
  MUSIC_TOKEN_CURRENT_SECRET_FILE: LOCAL_MUSIC_TARGET.secretFiles.musicToken,
  MUSIC_PUBLIC_ID_HMAC_KEY_FILE: LOCAL_MUSIC_TARGET.secretFiles.publicId,
  MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: LOCAL_MUSIC_TARGET.secretFiles.publicationKey,
  COOKIE_SECRET_FILE: LOCAL_MUSIC_TARGET.secretFiles.cookie,
  SESSION_SECRET_FILE: LOCAL_MUSIC_TARGET.secretFiles.session,
} as const;

/** Builds only app configuration; never reads ambient environment or secret files. */
export function buildLocalMusicEnvironment(manifest: LocalMusicManifest): Record<string, string> {
  const validated = parseLocalMusicManifest(manifest);
  const environment: Record<string, string> = {
    ...fixedEnvironment,
    MUSIC_COHORT_ENABLED: String(validated.cohortUserDocumentIds.length > 0),
    MUSIC_COHORT_USER_DOCUMENT_IDS: validated.cohortUserDocumentIds.join(","),
  };
  for (const [name, filename] of Object.entries(runtimeSecretFiles)) {
    environment[name] = path.join(validated.stateDirectory, filename);
  }
  if (validated.lifecycleProofFile !== undefined) {
    environment.STRAPI_LIFECYCLE_PROOF_TOKEN_FILE = validated.lifecycleProofFile;
  }
  return environment;
}
