import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const root = new URL("../../", import.meta.url);
const authority = {
  MUSIC_E2E_STATE_PORT: "55174",
  MUSIC_E2E_STATE_TOKEN: randomBytes(32).toString("base64url"),
  MUSIC_E2E_ACCOUNT_USERNAME: process.env.MUSIC_E2E_ACCOUNT_USERNAME ?? "",
  MUSIC_E2E_ACCOUNT_DOCUMENT_ID: process.env.MUSIC_E2E_ACCOUNT_DOCUMENT_ID ?? "",
  MUSIC_E2E_STRAPI_URL: "http://127.0.0.1:51337",
  MUSIC_E2E_STRAPI_TOKEN: process.env.MUSIC_E2E_STRAPI_TOKEN ?? "",
};
const headers = { Authorization: `Bearer ${authority.MUSIC_E2E_STATE_TOKEN}` };
const state = spawn(process.execPath, ["tunes/scripts/music-e2e-state-service.mjs"], {
  cwd: root, env: { ...process.env, ...authority }, stdio: ["ignore", "ignore", "inherit"], windowsHide: true,
});

const request = async (path, init = {}) => {
  const response = await fetch(`http://127.0.0.1:55174${path}`, { ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    const diagnostic = await response.json().catch(() => ({}));
    throw new Error(`state smoke request failed: ${path} ${response.status} ${diagnostic.error ?? "unknown"}`);
  }
  return response.json();
};
const docker = (args) => {
  const result = spawnSync("docker", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`state smoke Docker step failed (${result.status})`);
  return result.stdout.trim();
};

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { await request("/health"); ready = true; break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  if (!ready) throw new Error("state smoke service did not become ready");
  const snapshot = await request("/snapshot", { method: "POST" });
  const roundtripOnly = process.argv.includes("--roundtrip-only");
  if (!roundtripOnly) {
    docker(["exec", "explorers-music-fixture-postgres-1", "psql", "-v", "ON_ERROR_STOP=1", "-U", "music_migrator", "-d", "music_fixture", "-c",
      "INSERT INTO system_settings(key,value,category) VALUES ('e2e-public-music-round4-restore-probe','mutated','e2e');"]);
    const preference = await fetch(`${authority.MUSIC_E2E_STRAPI_URL}/api/accounts/${encodeURIComponent(authority.MUSIC_E2E_ACCOUNT_DOCUMENT_ID)}`, {
      method: "PUT", headers: { Authorization: `Bearer ${authority.MUSIC_E2E_STRAPI_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ data: { public_music: "Yes" } }), signal: AbortSignal.timeout(5_000),
    });
    if (!preference.ok) throw new Error(`state smoke preference mutation failed (${preference.status})`);
  }
  const restored = await request("/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot) });
  const probeRemoved = roundtripOnly || docker(["exec", "explorers-music-fixture-postgres-1", "psql", "-U", "music_migrator", "-d", "music_fixture", "-Atc",
    "SELECT count(*)=0 FROM system_settings WHERE key='e2e-public-music-round4-restore-probe';"]) === "t";
  if (!restored.restored || restored.beforeHash !== restored.afterHash || !probeRemoved) throw new Error("state smoke exact restore proof failed");
  docker(["restart", "explorers-music-fixture-tunes-1", "explorers-music-fixture-explorers-1"]);
  let runtimeAttested = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const readiness = await fetch("http://127.0.0.1:55173/api/music-fixture/readiness", { signal: AbortSignal.timeout(2_000) });
      if (readiness.ok) { runtimeAttested = true; break; }
    } catch { /* wait for the restricted runtime's startup attestation */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!runtimeAttested) throw new Error("restored runtime privilege attestation did not become healthy");
  process.stdout.write(JSON.stringify({ ready: true, databaseHashEqual: true, preferenceRestored: true, probeRemoved: true, runtimeAttested: true }) + "\n");
} finally {
  state.kill();
}
