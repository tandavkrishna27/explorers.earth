import {
  MUSIC_E2E_STATE_CAPTURE_CODES,
  MUSIC_E2E_STATE_CAPTURE_FAILURE_VERSION,
  MUSIC_E2E_STATE_CAPTURE_STAGES,
} from "../../tunes/scripts/music-e2e-state-capture.mjs";

export const MUSIC_PUBLIC_INITIAL_SNAPSHOT_VERSION = "explorers-public-initial-snapshot/v1";

const stages = new Set(MUSIC_E2E_STATE_CAPTURE_STAGES);
const codes = new Set(MUSIC_E2E_STATE_CAPTURE_CODES);
const RESPONSE_MAX_BYTES = 128 * 1024;
const metadataKeys = Object.freeze([
  "databaseHash", "profileHash", "identityRows", "profileRevision", "profileFieldCount",
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function emptyMetadata() {
  return {
    databaseHash: null,
    profileHash: null,
    identityRows: null,
    profileRevision: null,
    profileFieldCount: null,
  };
}

function record({ status, stage, code, metadata = emptyMetadata() }) {
  return {
    schemaVersion: MUSIC_PUBLIC_INITIAL_SNAPSHOT_VERSION,
    status,
    stage,
    code,
    metadata,
  };
}

function exactCoverage(value) {
  return exactKeys(value, ["coveredByDatabaseDump"]) && value.coveredByDatabaseDump === true;
}

function exactSnapshot(value) {
  return exactKeys(value, [
    "version", "snapshotId", "publication", "guestControls", "queue", "playlists", "requests", "profile", "database",
  ])
    && value.version === "music-live-account-snapshot/v1"
    && typeof value.snapshotId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value.snapshotId)
    && [value.publication, value.guestControls, value.queue, value.playlists, value.requests].every(exactCoverage)
    && exactKeys(value.profile, [
      "accountDocumentId", "publicMusic", "profileRevision", "profileHash", "fieldCount",
    ])
    && /^e2e-public-music-[a-z0-9-]+-account$/.test(String(value.profile.accountDocumentId))
    && typeof value.profile.publicMusic === "boolean"
    && Number.isSafeInteger(value.profile.profileRevision) && value.profile.profileRevision >= 0
    && /^[a-f0-9]{64}$/.test(String(value.profile.profileHash))
    && Number.isSafeInteger(value.profile.fieldCount) && value.profile.fieldCount >= 1 && value.profile.fieldCount <= 128
    && exactKeys(value.database, ["namespace", "dumpHash", "identityRows"])
    && /^e2e-public-music-[a-z0-9-]+$/.test(String(value.database.namespace))
    && value.profile.accountDocumentId === `${value.database.namespace}-account`
    && /^[a-f0-9]{64}$/.test(String(value.database.dumpHash))
    && [0, 1].includes(value.database.identityRows);
}

function exactServiceFailure(value) {
  return exactKeys(value, ["schemaVersion", "state", "stage", "code"])
    && value.schemaVersion === MUSIC_E2E_STATE_CAPTURE_FAILURE_VERSION
    && value.state === "failed" && stages.has(value.stage) && codes.has(value.code);
}

export function unavailableMusicInitialSnapshotQualification() {
  return record({ status: "unavailable", stage: "not-run", code: "not-run" });
}

function failed(stage, code) {
  return record({ status: "failed", stage, code });
}

function passed(snapshot) {
  return record({
    status: "passed",
    stage: "snapshot-store",
    code: "none",
    metadata: {
      databaseHash: snapshot.database.dumpHash,
      profileHash: snapshot.profile.profileHash,
      identityRows: snapshot.database.identityRows,
      profileRevision: snapshot.profile.profileRevision,
      profileFieldCount: snapshot.profile.fieldCount,
    },
  });
}

export function decodeMusicInitialSnapshotResponse({ status, body } = {}) {
  if (status === 200 && exactSnapshot(body)) return { ok: true, snapshot: body, record: passed(body) };
  if (status === 500 && exactServiceFailure(body)) {
    return { ok: false, record: failed(body.stage, body.code) };
  }
  return { ok: false, record: failed("snapshot-store", "contract-invalid") };
}

export async function readMusicInitialSnapshotHttpResponse(response) {
  if (!response || typeof response.status !== "number" || typeof response.text !== "function") {
    throw new Error("initial snapshot response contract is invalid");
  }
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > RESPONSE_MAX_BYTES) {
    throw new Error("initial snapshot response contract is invalid");
  }
  let text;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const value = await reader.read();
      if (value.done) break;
      bytes += value.value.byteLength;
      if (bytes > RESPONSE_MAX_BYTES) {
        await reader.cancel();
        throw new Error("initial snapshot response contract is invalid");
      }
      chunks.push(Buffer.from(value.value));
    }
    text = Buffer.concat(chunks, bytes).toString("utf8");
  } else {
    text = await response.text();
    if (Buffer.byteLength(text) > RESPONSE_MAX_BYTES) throw new Error("initial snapshot response contract is invalid");
  }
  let body;
  try { body = JSON.parse(text); }
  catch { body = undefined; }
  return { status: response.status, body };
}

export function musicInitialSnapshotRequestFailure(error) {
  const timeout = error && typeof error === "object"
    && ["AbortError", "TimeoutError"].includes(String(error.name));
  return failed("snapshot-store", timeout ? "operation-timeout" : "operation-failed");
}

export function validateMusicInitialSnapshotQualificationRecord(value) {
  if (!exactKeys(value, ["schemaVersion", "status", "stage", "code", "metadata"])
      || value.schemaVersion !== MUSIC_PUBLIC_INITIAL_SNAPSHOT_VERSION
      || !["unavailable", "failed", "passed"].includes(value.status)
      || !exactKeys(value.metadata, metadataKeys)) return false;
  const empty = metadataKeys.every((key) => value.metadata[key] === null);
  if (value.status === "unavailable") {
    return value.stage === "not-run" && value.code === "not-run" && empty;
  }
  if (value.status === "failed") {
    return stages.has(value.stage) && codes.has(value.code) && empty;
  }
  return value.stage === "snapshot-store" && value.code === "none"
    && /^[a-f0-9]{64}$/.test(String(value.metadata.databaseHash))
    && /^[a-f0-9]{64}$/.test(String(value.metadata.profileHash))
    && [0, 1].includes(value.metadata.identityRows)
    && Number.isSafeInteger(value.metadata.profileRevision) && value.metadata.profileRevision >= 0
    && Number.isSafeInteger(value.metadata.profileFieldCount)
    && value.metadata.profileFieldCount >= 1 && value.metadata.profileFieldCount <= 128;
}
