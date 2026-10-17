import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES } from "./music-e2e-state-restore.mjs";

export const MUSIC_E2E_STATE_CAPTURE_FAILURE_VERSION = "music-e2e-state-capture-failure/v1";
export const MUSIC_E2E_STATE_CAPTURE_STAGES = Object.freeze([
  "container-authority",
  "schema-inventory",
  "pg-dump",
  "dump-hash",
  "identity-count-query",
  "profile-private-fetch",
  "profile-schema",
  "profile-field-count",
  "snapshot-store",
]);
export const MUSIC_E2E_STATE_CAPTURE_CODES = Object.freeze([
  "operation-failed",
  "operation-timeout",
  "contract-invalid",
]);

const stages = new Set(MUSIC_E2E_STATE_CAPTURE_STAGES);
const codes = new Set(MUSIC_E2E_STATE_CAPTURE_CODES);
const PRIVATE_PROFILE_MAX_BYTES = 64 * 1024;
const IDENTITY_COUNT_OUTPUT_MAX_BYTES = 4 * 1024;
const IDENTITY_COUNT_TIMEOUT_MS = 10_000;
const dockerExecutable = process.platform === "win32" ? "docker.exe" : "docker";
const repositoryRoot = new URL("../../", import.meta.url);

class MusicFixtureCaptureFailure extends Error {
  constructor(stage, code) {
    super("music fixture state capture failed");
    this.name = "MusicFixtureCaptureFailure";
    this.stage = stage;
    this.code = code;
  }
}

function fail(stage, code) {
  throw new MusicFixtureCaptureFailure(stage, code);
}

function timeoutError(error) {
  return error && typeof error === "object"
    && ["AbortError", "TimeoutError"].includes(String(error.name));
}

async function operation(stage, callback) {
  try {
    return await callback();
  } catch (error) {
    if (error instanceof MusicFixtureCaptureFailure) throw error;
    fail(stage, timeoutError(error) ? "operation-timeout" : "operation-failed");
  }
}

function exactAuthority(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && /^e2e-public-music-[a-z0-9-]+$/.test(String(value.namespace))
    && value.username === `${value.namespace}-owner`
    && value.accountDocumentId === `${value.namespace}-account`
    && value.userDocumentId === `${value.namespace}-user`;
}

function exactAdapters(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && [
      "containerAuthority", "schemaInventory", "pgDump", "identityCountQuery",
      "profilePrivateFetch", "snapshotStore",
    ].every((name) => typeof value[name] === "function");
}

function normalizeDump(dump) {
  if (!Buffer.isBuffer(dump) || dump.length === 0 || dump.length > MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES) {
    fail("pg-dump", "contract-invalid");
  }
  return dump.toString("utf8").split(/\r?\n/)
    .filter((line) => !line.startsWith("--") && !line.startsWith("\\restrict") && !line.startsWith("\\unrestrict"))
    .join("\n");
}

export function hashMusicFixtureDump(dump) {
  return createHash("sha256").update(normalizeDump(dump)).digest("hex");
}

export function safeMusicFixtureCaptureFailure(error) {
  if (!(error instanceof MusicFixtureCaptureFailure)
      || !stages.has(error.stage) || !codes.has(error.code)) return undefined;
  return Object.freeze({
    schemaVersion: MUSIC_E2E_STATE_CAPTURE_FAILURE_VERSION,
    state: "failed",
    stage: error.stage,
    code: error.code,
  });
}

const identityPredicates = Object.freeze([
  Object.freeze({ column: "strapi_user_document_id", key: "userDocumentId" }),
  Object.freeze({ column: "strapi_account_document_id", key: "accountDocumentId" }),
  Object.freeze({ column: "strapi_username_snapshot", key: "username" }),
]);

export function buildMusicFixtureIdentityCountPgQuery(authority) {
  if (!exactAuthority(authority)) throw new Error("fixture identity count authority is invalid");
  return Object.freeze({
    text: `SELECT count(*)::int AS count FROM users WHERE ${identityPredicates.map(
      ({ column }, index) => `${column} = $${index + 1}`,
    ).join(" AND ")} AND identity_status = 'active';`,
    values: Object.freeze(identityPredicates.map(({ key }) => authority[key])),
  });
}

export function buildMusicFixtureIdentityCountPsqlQuery(authority) {
  if (!exactAuthority(authority)) throw new Error("fixture identity count authority is invalid");
  return Object.freeze({
    text: `SELECT count(*) FROM users WHERE ${identityPredicates.map(
      ({ column, key }) => `${column} = :'fixture_${key.replace(/[A-Z]/g, (value) => `_${value.toLowerCase()}`)}'`,
    ).join(" AND ")} AND identity_status = 'active';`,
    variables: Object.freeze(identityPredicates.map(({ key }) => Object.freeze({
      name: `fixture_${key.replace(/[A-Z]/g, (value) => `_${value.toLowerCase()}`)}`,
      value: authority[key],
    }))),
  });
}

function identityCountFailure(timeout = false) {
  const error = new Error("fixture identity population inspection failed");
  if (timeout) error.name = "TimeoutError";
  throw error;
}

export function buildMusicFixtureIdentityCountPsqlOperation({ containerId, authority } = {}) {
  if (typeof containerId !== "string" || !/^[a-f0-9]{64}$/.test(containerId)
      || !exactAuthority(authority)) identityCountFailure();
  const query = buildMusicFixtureIdentityCountPsqlQuery(authority);
  return Object.freeze({
    file: dockerExecutable,
    args: Object.freeze([
      "exec", "-i", containerId,
      "psql", "-X", "-U", "music_migrator", "-d", "music_fixture",
      "-v", "ON_ERROR_STOP=1",
      ...query.variables.flatMap(({ name, value }) => ["-v", `${name}=${value}`]),
      "-A", "-t", "-f", "-",
    ]),
    input: Buffer.from(`${query.text}\n`, "utf8"),
  });
}

function exactContainerAttestation(attestContainer, containerId) {
  let attested;
  try { attested = attestContainer(); }
  catch { identityCountFailure(); }
  if (!attested || typeof attested !== "object" || Array.isArray(attested)
      || Object.keys(attested).join("\0") !== "containerId"
      || attested.containerId !== containerId) identityCountFailure();
}

function timeoutResult(error) {
  return error && typeof error === "object" && error.code === "ETIMEDOUT";
}

export function runMusicFixtureIdentityCountPsql({
  containerId,
  authority,
  attestContainer,
  spawn = spawnSync,
} = {}) {
  if (typeof attestContainer !== "function" || typeof spawn !== "function") identityCountFailure();
  let operation;
  try { operation = buildMusicFixtureIdentityCountPsqlOperation({ containerId, authority }); }
  catch { identityCountFailure(); }
  exactContainerAttestation(attestContainer, containerId);

  let result;
  let spawnFailure;
  try {
    result = spawn(operation.file, operation.args, {
      cwd: repositoryRoot,
      input: operation.input,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: IDENTITY_COUNT_OUTPUT_MAX_BYTES,
      timeout: IDENTITY_COUNT_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    spawnFailure = error;
  } finally {
    exactContainerAttestation(attestContainer, containerId);
  }

  if (timeoutResult(spawnFailure) || timeoutResult(result?.error)) identityCountFailure(true);
  if (spawnFailure || result?.status !== 0 || result?.signal !== null || result?.error
      || typeof result?.stdout !== "string" || !/^[01](?:\r?\n)?$/.test(result.stdout)) {
    identityCountFailure();
  }
  return Number(result.stdout[0]);
}

async function boundedResponseText(response) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > PRIVATE_PROFILE_MAX_BYTES) {
    throw new Error("fixture profile endpoint operation failed");
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > PRIVATE_PROFILE_MAX_BYTES) throw new Error("fixture profile endpoint operation failed");
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const value = await reader.read();
    if (value.done) break;
    bytes += value.value.byteLength;
    if (bytes > PRIVATE_PROFILE_MAX_BYTES) {
      await reader.cancel();
      throw new Error("fixture profile endpoint operation failed");
    }
    chunks.push(Buffer.from(value.value));
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

export async function requestMusicFixturePrivateProfileSnapshot({
  fetchImpl = fetch,
  origin,
  token,
  authority,
} = {}) {
  if (typeof fetchImpl !== "function"
      || !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(String(origin))
      || !/^[A-Za-z0-9_-]{43,128}$/.test(String(token))
      || !exactAuthority(authority)) {
    throw new Error("fixture profile endpoint authority is invalid");
  }
  const response = await fetchImpl(`${origin}/__music-fixture/profile-state/snapshot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(authority),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response?.ok) throw new Error("fixture profile endpoint operation failed");
  const text = await boundedResponseText(response);
  try { return JSON.parse(text); }
  catch { throw new Error("fixture profile endpoint operation failed"); }
}

function exactProfileState(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && value.version === "music-fixture-profile-state/v1"
    && Number.isSafeInteger(value.revision) && value.revision >= 0
    && /^[a-f0-9]{64}$/.test(String(value.stateHash))
    && value.snapshot && typeof value.snapshot === "object" && !Array.isArray(value.snapshot)
    && value.snapshot.account && typeof value.snapshot.account === "object"
    && !Array.isArray(value.snapshot.account);
}

function exactSnapshotId(value) {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
}

export async function captureMusicFixtureState({
  authority,
  initial = false,
  adapters,
  createSnapshotId = randomUUID,
  hashDump = hashMusicFixtureDump,
} = {}) {
  if (!exactAuthority(authority) || !exactAdapters(adapters)
      || typeof createSnapshotId !== "function" || typeof hashDump !== "function" || typeof initial !== "boolean") {
    fail("container-authority", "contract-invalid");
  }

  const container = await operation("container-authority", () => adapters.containerAuthority());
  if (!container || typeof container !== "object" || !/^[a-f0-9]{64}$/.test(String(container.containerId))) {
    fail("container-authority", "contract-invalid");
  }
  await operation("schema-inventory", () => adapters.schemaInventory({ containerId: container.containerId }));

  const dump = await operation("pg-dump", () => adapters.pgDump({ containerId: container.containerId, dataOnly: false }));
  const dataDump = await operation("pg-dump", () => adapters.pgDump({ containerId: container.containerId, dataOnly: true }));
  if (!Buffer.isBuffer(dump) || dump.length === 0 || dump.length > MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES
      || !Buffer.isBuffer(dataDump) || dataDump.length === 0 || dataDump.length > MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES) {
    fail("pg-dump", "contract-invalid");
  }

  const databaseHash = await operation("dump-hash", () => hashDump(dump));
  if (!/^[a-f0-9]{64}$/.test(String(databaseHash))) fail("dump-hash", "contract-invalid");

  const identityRows = await operation("identity-count-query", () => adapters.identityCountQuery({
    containerId: container.containerId,
    authority,
  }));
  if (![0, 1].includes(identityRows)) fail("identity-count-query", "contract-invalid");

  const profileState = await operation("profile-private-fetch", () => adapters.profilePrivateFetch({ authority }));
  if (!exactProfileState(profileState)) fail("profile-schema", "contract-invalid");
  const fieldCount = Object.keys(profileState.snapshot.account).length;
  if (!Number.isSafeInteger(fieldCount) || fieldCount < 1 || fieldCount > 128) {
    fail("profile-field-count", "contract-invalid");
  }

  const createdSnapshotId = await operation("snapshot-store", () => createSnapshotId());
  if (!exactSnapshotId(createdSnapshotId)) fail("snapshot-store", "contract-invalid");
  const snapshot = {
    version: "music-live-account-snapshot/v1",
    snapshotId: createdSnapshotId,
    publication: { coveredByDatabaseDump: true },
    guestControls: { coveredByDatabaseDump: true },
    queue: { coveredByDatabaseDump: true },
    playlists: { coveredByDatabaseDump: true },
    requests: { coveredByDatabaseDump: true },
    profile: {
      accountDocumentId: authority.accountDocumentId,
      publicMusic: profileState.snapshot.account.public_music === "Yes",
      profileRevision: profileState.revision,
      profileHash: profileState.stateHash,
      fieldCount,
    },
    database: { namespace: authority.namespace, dumpHash: databaseHash, identityRows },
  };
  await operation("snapshot-store", () => adapters.snapshotStore({
    containerId: container.containerId,
    dataDump,
    profileSnapshot: profileState.snapshot,
    snapshot,
    initial,
  }));
  return snapshot;
}
