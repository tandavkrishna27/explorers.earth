import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createMusicMutationGuard } from "./music-e2e-mutation-guard.mjs";
import {
  captureMusicFixtureState,
  hashMusicFixtureDump,
  requestMusicFixturePrivateProfileSnapshot,
  runMusicFixtureIdentityCountPsql,
  safeMusicFixtureCaptureFailure,
} from "./music-e2e-state-capture.mjs";
import {
  MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES,
  attestMusicFixtureRestoreContainer,
  buildMusicFixtureSchemaInventoryOperation,
  runMusicFixtureRestoreTransaction,
} from "./music-e2e-state-restore.mjs";

const repositoryRoot = new URL("../../", import.meta.url);
const dockerExecutable = process.platform === "win32" ? "docker.exe" : "docker";
const port = Number(process.env.MUSIC_E2E_STATE_PORT ?? "55174");
const journeyToken = process.env.MUSIC_E2E_STATE_TOKEN ?? "";
const orchestrationToken = process.env.MUSIC_E2E_ORCHESTRATION_STATE_TOKEN ?? "";
const accountDocumentId = process.env.MUSIC_E2E_ACCOUNT_DOCUMENT_ID ?? "";
const userDocumentId = process.env.MUSIC_E2E_USER_DOCUMENT_ID ?? "";
const username = process.env.MUSIC_E2E_ACCOUNT_USERNAME ?? "";
const namespace = username.replace(/-owner$/, "");
const strapiOrigin = process.env.MUSIC_E2E_STRAPI_URL ?? "";
const strapiToken = process.env.MUSIC_E2E_STRAPI_TOKEN ?? "";
const guard = createMusicMutationGuard({
  runDirectory: process.env.MUSIC_E2E_RUN_DIRECTORY,
  guardPath: process.env.MUSIC_E2E_MUTATION_GUARD_PATH,
  recoveryPath: process.env.MUSIC_E2E_RECOVERY_ARTIFACT_PATH,
});
const snapshots = new Map();
let initialSnapshotId;
const captureAuthority = Object.freeze({ namespace, username, accountDocumentId, userDocumentId });

if (!Number.isInteger(port) || port < 1024 || port > 65535
    || !/^[A-Za-z0-9_-]{43,128}$/.test(journeyToken)
    || !/^[A-Za-z0-9_-]{43,128}$/.test(orchestrationToken) || journeyToken === orchestrationToken
    || !/^e2e-public-music-[a-z0-9-]+-account$/.test(accountDocumentId)
    || !/^e2e-public-music-[a-z0-9-]+-owner$/.test(username)
    || userDocumentId !== `${namespace}-user` || accountDocumentId !== `${namespace}-account`
    || !/^[A-Za-z0-9_-]{43,128}$/.test(strapiToken)
    || strapiOrigin !== "http://127.0.0.1:51337") {
  throw new Error("state service requires complete exclusive loopback fixture authority");
}

function inspectDatabaseContainer() {
  const result = spawnSync(dockerExecutable, ["inspect", "explorers-music-fixture-postgres-1"], {
    cwd: repositoryRoot, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) throw new Error("fixture restore target attestation failed");
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error("fixture restore target attestation failed"); }
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error("fixture restore target attestation failed");
  return attestMusicFixtureRestoreContainer(parsed[0]);
}

function schemaInventory(containerId) {
  const current = inspectDatabaseContainer();
  if (current.containerId !== containerId) throw new Error("fixture restore target changed");
  const operation = buildMusicFixtureSchemaInventoryOperation({ containerId });
  const result = spawnSync(operation.file, operation.args, {
    cwd: repositoryRoot, input: operation.input, windowsHide: true, maxBuffer: 64 * 1024,
  });
  if (result.status !== 0) throw new Error("fixture schema inventory inspection failed");
}

function databaseDump(containerId, dataOnly = false) {
  const current = inspectDatabaseContainer();
  if (current.containerId !== containerId) throw new Error("fixture restore target changed");
  const args = [
    "exec", "-i", containerId, "pg_dump", "-U", "music_migrator", "-d", "music_fixture",
    "--format=plain", ...(dataOnly ? ["--data-only"] : ["--clean", "--if-exists", "--no-owner"]),
  ];
  const result = spawnSync(dockerExecutable, args, {
    cwd: repositoryRoot, windowsHide: true, maxBuffer: MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES,
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length === 0
      || result.stdout.length > MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES) {
    throw new Error("fixture database snapshot failed");
  }
  return result.stdout;
}

function databaseIdentityRows(containerId) {
  return runMusicFixtureIdentityCountPsql({
    containerId,
    authority: captureAuthority,
    attestContainer: inspectDatabaseContainer,
  });
}

async function json(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), ...options });
  if (!response.ok) throw new Error("fixture profile operation failed");
  return response.json();
}

async function capture({ initial = false } = {}) {
  return await captureMusicFixtureState({
    authority: captureAuthority,
    initial,
    adapters: {
      containerAuthority: () => inspectDatabaseContainer(),
      schemaInventory: ({ containerId }) => schemaInventory(containerId),
      pgDump: ({ containerId, dataOnly }) => databaseDump(containerId, dataOnly),
      identityCountQuery: ({ containerId }) => databaseIdentityRows(containerId),
      profilePrivateFetch: () => requestMusicFixturePrivateProfileSnapshot({
        origin: strapiOrigin,
        token: strapiToken,
        authority: captureAuthority,
      }),
      snapshotStore: ({ containerId, dataDump, profileSnapshot, snapshot, initial: storeInitial }) => {
        if (storeInitial && initialSnapshotId !== undefined) throw new Error("initial fixture snapshot already exists");
        snapshots.set(snapshot.snapshotId, { containerId, dataDump, profileSnapshot, snapshot });
        if (storeInitial) initialSnapshotId = snapshot.snapshotId;
      },
    },
  });
}

function block(reason, stage) {
  const record = guard.block(reason, stage);
  try { guard.recordRecovery(reason, stage); } catch { /* durable guard remains authoritative */ }
  return record;
}

async function restore(snapshot, { final = false } = {}) {
  const stored = snapshots.get(snapshot?.snapshotId);
  if (!stored || stored.snapshot.database.dumpHash !== snapshot?.database?.dumpHash
      || (final && snapshot.snapshotId !== initialSnapshotId)) throw new Error("unknown fixture snapshot");
  const current = inspectDatabaseContainer();
  if (current.containerId !== stored.containerId) throw new Error("fixture restore target changed");
  const restored = runMusicFixtureRestoreTransaction({
    containerId: current.containerId,
    dataDump: stored.dataDump,
    snapshotHash: stored.snapshot.database.dumpHash,
    captureHash: () => hashMusicFixtureDump(databaseDump(current.containerId)),
    execute: (operation) => spawnSync(operation.file, operation.args, {
      cwd: repositoryRoot, input: operation.input, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
    }),
  });
  if (!restored.ok) {
    block(restored.code === "restore-mismatch" ? "restore-mismatch" : "restore-failed",
      restored.stage === "verification" ? "verification" : "restore");
    throw new Error("fixture database restoration failed");
  }
  let profileRestored;
  try {
    profileRestored = await json(`${strapiOrigin}/__music-fixture/profile-state/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${strapiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ namespace, username, accountDocumentId, userDocumentId, snapshot: stored.profileSnapshot }),
    });
    if (profileRestored?.version !== "music-fixture-profile-state/v1" || profileRestored?.restored !== true
        || profileRestored?.revision !== snapshot.profile.profileRevision
        || profileRestored?.stateHash !== snapshot.profile.profileHash) throw new Error("profile mismatch");
  } catch {
    block("profile-restore-failed", "profile-restore");
    throw new Error("fixture profile restoration failed");
  }
  if (!final) snapshots.delete(snapshot.snapshotId);
  return {
    restored: true,
    beforeHash: restored.beforeHash,
    afterHash: restored.afterHash,
    profileHash: profileRestored.stateHash,
    profileRevision: profileRestored.revision,
  };
}

function authorized(request, expected) {
  return request.headers.authorization === `Bearer ${expected}`;
}

async function body(request) {
  let retained = "";
  for await (const chunk of request) {
    retained += chunk;
    if (Buffer.byteLength(retained) > 64 * 1024) throw new Error("request too large");
  }
  return JSON.parse(retained);
}

function respond(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

createServer(async (request, response) => {
  try {
    const journey = authorized(request, journeyToken);
    const orchestration = authorized(request, orchestrationToken);
    if (!journey && !orchestration) return respond(response, 403, { state: "refused", code: "authority-invalid" });
    if (request.url === "/health" && request.method === "GET") {
      return respond(response, 200, { status: "ready", service: "music-e2e-state", mutationGuard: guard.read() });
    }
    if (request.url === "/snapshot" && request.method === "POST") {
      const payload = orchestration
        ? await capture({ initial: true })
        : await guard.runIfAllowed(() => capture());
      return respond(response, 200, payload);
    }
    if (request.url === "/restore" && request.method === "POST" && journey) {
      const payload = await guard.runIfAllowed(async () => restore(await body(request)));
      return respond(response, 200, payload);
    }
    if (request.url === "/restore-final" && request.method === "POST" && orchestration) {
      const payload = await restore(await body(request), { final: true });
      return respond(response, 200, payload);
    }
    if (request.url === "/block" && request.method === "POST" && journey) {
      const payload = await body(request);
      return respond(response, 200, block(payload?.reason, payload?.stage));
    }
    return respond(response, 404, { state: "refused", code: "route-invalid" });
  } catch (error) {
    const captureFailure = safeMusicFixtureCaptureFailure(error);
    if (captureFailure) return respond(response, 500, captureFailure);
    return respond(response, 500, { state: "failed", stage: "state-service", code: "operation-failed" });
  }
}).listen(port, "127.0.0.1", () => process.stdout.write(`music-e2e-state ready http://127.0.0.1:${port}\n`));
