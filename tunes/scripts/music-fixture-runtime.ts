import { execFileSync } from "node:child_process";
import pg from "pg";
import { MUSIC_COMPOSE_PROJECT } from "./music-compose-safety";

const project = MUSIC_COMPOSE_PROJECT;
const docker = process.platform === "win32" ? "docker.exe" : "docker";

interface DockerInspection {
  Config: { Labels?: Record<string, string> };
  State: { Running: boolean; ExitCode: number; Health?: { Status?: string } };
}

function dockerOutput(args: string[]): string {
  return execFileSync(docker, args, { encoding: "utf8", timeout: 30_000 }).trim();
}

function dockerCompose(args: string[]): string {
  return dockerOutput(["compose", "-p", project, "-f", "docker-compose.music-test.yml", ...args]);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const ids = dockerOutput([
  "ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}",
]).split(/\r?\n/).filter(Boolean);
assert(ids.length === 5, `expected five disposable fixture containers, received ${ids.length}`);

const inspections = JSON.parse(dockerOutput(["inspect", ...ids])) as DockerInspection[];
const services = new Map(inspections.map((inspection) => [
  inspection.Config.Labels?.["com.docker.compose.service"], inspection,
]));
for (const service of ["postgres", "strapi", "tunes", "explorers"] as const) {
  const inspection = services.get(service);
  assert(inspection, `missing disposable ${service} container`);
  assert(inspection.Config.Labels?.["com.explorers.music.fixture"] === "true", `${service} fixture label mismatch`);
  assert(inspection.State.Running, `${service} is not running`);
  assert(inspection.State.Health?.Status === "healthy", `${service} is not healthy`);
}
const migration = services.get("tunes-migrate");
assert(migration?.Config.Labels?.["com.explorers.music.fixture"] === "true", "migration fixture label mismatch");
assert(!migration.State.Running && migration.State.ExitCode === 0, "fixture migration did not exit successfully");

for (const [name, url] of [
  ["Tunes", "http://127.0.0.1:55000/api/music-fixture/readiness"],
  ["Explorer proxy", "http://127.0.0.1:55173/api/music-fixture/readiness"],
] as const) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  assert(response.ok, `${name} readiness returned ${response.status}`);
}

let compatibilityRouteUsage = 0;
for (const body of [undefined, JSON.stringify({ username: "forged-fixture-owner" })]) {
  const response = await fetch("http://127.0.0.1:55000/api/register", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:55173",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
    signal: AbortSignal.timeout(5_000),
  });
  if (response.ok) compatibilityRouteUsage += 1;
  const envelope = await response.json() as { error?: { code?: string }; version?: string };
  assert(response.status === 410, `compatibility route returned ${response.status}`);
  assert(envelope.error?.code === "LEGACY_IDENTITY_ROUTE_REMOVED", "compatibility route did not return the containment code");
  assert(!JSON.stringify(envelope).includes("forged-fixture-owner"), "compatibility route reflected request material");
}
assert(compatibilityRouteUsage === 0, "compatibility route accepted a legacy identity request");

async function ensureIdentity(): Promise<string> {
  const response = await fetch("http://127.0.0.1:55000/api/music/identity/ensure", {
    method: "POST",
    headers: { authorization: "Bearer fixture-read-only-token", origin: "http://127.0.0.1:55173" },
    signal: AbortSignal.timeout(15_000),
  });
  assert(response.ok, `real fixture identity ensure returned ${response.status}`);
  const body = await response.json() as { credential?: { token?: string }; identity?: { status?: string } };
  assert(body.identity?.status === "active", "real fixture identity is not active");
  assert(typeof body.credential?.token === "string", "real fixture credential is absent");
  return body.credential.token;
}

const firstCredential = await ensureIdentity();
const owner = await fetch("http://127.0.0.1:55000/api/playlists", {
  headers: { authorization: `Bearer ${firstCredential}`, origin: "http://127.0.0.1:55173" },
  signal: AbortSignal.timeout(5_000),
});
assert(owner.ok && Array.isArray(await owner.json()), `real fixture owner read returned ${owner.status}`);

async function readinessOk(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

dockerCompose(["stop", "tunes"]);
const outageObserved = !await readinessOk("http://127.0.0.1:55173/api/music-fixture/readiness");
try {
  assert(outageObserved, "stopped Tunes remained reachable through the Explorer proxy");
} finally {
  dockerCompose(["start", "tunes"]);
}
let recoveryVerified = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  if (await readinessOk("http://127.0.0.1:55000/api/music-fixture/readiness")
      && await readinessOk("http://127.0.0.1:55173/api/music-fixture/readiness")) {
    recoveryVerified = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
assert(recoveryVerified, "Tunes did not recover through both direct and Explorer proxy readiness");
await ensureIdentity();

assert(process.env.DATABASE_URL_TEST, "DATABASE_URL_TEST is required for disposable runtime evidence");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 1 });
try {
  const result = await pool.query(
    `SELECT strapi_account_document_id AS account_document_id,
            identity_status
       FROM users
      WHERE strapi_user_document_id = $1`,
    ["fixture-user-document-id"],
  );
  assert(result.rows.length === 1, "real fixture did not preserve one stable Music identity row");
  assert(result.rows[0]?.account_document_id === "fixture-account-document-id", "real fixture selected Account mismatch");
  assert(result.rows[0]?.identity_status === "active", "real fixture identity row is not active");
} finally {
  await pool.end();
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: "music-real-docker-evidence/v1",
  project,
  containerCount: ids.length,
  healthyServices: 4,
  migrationExitCode: 0,
  identityRows: 1,
  repeatedEnsureStable: true,
  ownerPredicate: "verified",
  outageObserved: true,
  recoveryVerified: true,
  compatibilityRouteUsage: 0,
})}\n`);
