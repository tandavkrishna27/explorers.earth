import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

export const MUSIC_MUTATION_GUARD_VERSION = "music-e2e-mutation-guard/v1";
export const MUSIC_MUTATION_RECOVERY_VERSION = "music-e2e-mutation-recovery/v1";
const reasons = new Set([
  "restore-failed", "restore-mismatch", "cleanup-failed", "profile-restore-failed", "profile-batch-failed", "guard-invalid",
]);
const stages = new Set(["restore", "verification", "cleanup", "profile-restore", "body", "preflight"]);
const clearRecord = Object.freeze({
  version: MUSIC_MUTATION_GUARD_VERSION,
  state: "clear",
  reason: "none",
  stage: "preflight",
});
const invalidRecord = Object.freeze({
  version: MUSIC_MUTATION_GUARD_VERSION,
  state: "blocked",
  reason: "guard-invalid",
  stage: "preflight",
});

function comparablePath(value) {
  const exact = resolve(value);
  return process.platform === "win32" ? exact.toLowerCase() : exact;
}

function exactRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join("\0") !== ["reason", "stage", "state", "version"].join("\0")
      || value.version !== MUSIC_MUTATION_GUARD_VERSION || value.state !== "blocked"
      || !reasons.has(value.reason) || !stages.has(value.stage)) return undefined;
  return Object.freeze({ version: value.version, state: value.state, reason: value.reason, stage: value.stage });
}

export function validateMusicMutationGuardRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join("\0") !== ["reason", "stage", "state", "version"].join("\0")
      || value.version !== MUSIC_MUTATION_GUARD_VERSION) return false;
  if (value.state === "clear") return value.reason === "none" && value.stage === "preflight";
  return Boolean(exactRecord(value));
}

function assertRegularPathIfPresent(file) {
  if (!existsSync(file)) return;
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024) {
    throw new Error("mutation guard path is unsafe");
  }
}

function assertGuardedPaths({ runDirectory, guardPath, recoveryPath }) {
  const run = resolve(runDirectory ?? "");
  const guard = resolve(guardPath ?? "");
  const recovery = resolve(recoveryPath ?? "");
  const runStat = lstatSync(run);
  if (!runStat.isDirectory() || runStat.isSymbolicLink()
      || comparablePath(realpathSync(run)) !== comparablePath(run)
      || dirname(guard) !== run || dirname(recovery) !== run || guard === recovery
      || basename(guard) !== "mutation-guard.json"
      || basename(recovery) !== "mutation-recovery.private.jsonl") {
    throw new Error("mutation guard path is unsafe");
  }
  assertRegularPathIfPresent(guard);
  assertRegularPathIfPresent(recovery);
  return { run, guard, recovery };
}

function readGuard(path) {
  if (!existsSync(path)) return clearRecord;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
        || stat.size < 2 || stat.size > 1024) return invalidRecord;
    return exactRecord(JSON.parse(readFileSync(path, "utf8"))) ?? invalidRecord;
  } catch {
    return invalidRecord;
  }
}

function publishGuard(path, record) {
  const temporary = `${path}.private-tmp`;
  if (existsSync(path) || existsSync(temporary)) throw new Error("mutation guard artifact already exists");
  const bytes = `${JSON.stringify(record)}\n`;
  let descriptor;
  let published = false;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, bytes, { encoding: "utf8" });
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, path);
    published = true;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { if (existsSync(temporary)) unlinkSync(temporary); }
    catch {
      if (published) {
        try { unlinkSync(path); } catch { /* caller remains fail-closed */ }
      }
      throw new Error("mutation guard temporary cleanup failed");
    }
  }
}

function exactRecoveryRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join("\0") !== ["reason", "stage", "version"].join("\0")
      || value.version !== MUSIC_MUTATION_RECOVERY_VERSION
      || !reasons.has(value.reason) || value.reason === "guard-invalid" || !stages.has(value.stage)) return undefined;
  return Object.freeze({ version: value.version, reason: value.reason, stage: value.stage });
}

function readRecovery(path) {
  if (!existsSync(path)) return undefined;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 2 || stat.size > 1024) return undefined;
    return exactRecoveryRecord(JSON.parse(readFileSync(path, "utf8")));
  } catch { return undefined; }
}

export function createMusicMutationGuard(input) {
  const paths = assertGuardedPaths(input ?? {});
  return Object.freeze({
    paths,
    read: () => readGuard(paths.guard),
    runIfAllowed: (mutation) => {
      if (typeof mutation !== "function") throw new Error("mutation guard callback is invalid");
      if (readGuard(paths.guard).state !== "clear") throw new Error("MUSIC_MUTATION_BLOCKED");
      return mutation();
    },
    block: (reason, stage) => {
      const current = readGuard(paths.guard);
      if (current.state === "blocked") return current;
      if (!reasons.has(reason) || reason === "guard-invalid" || !stages.has(stage)) {
        throw new Error("mutation guard record is invalid");
      }
      const record = Object.freeze({ version: MUSIC_MUTATION_GUARD_VERSION, state: "blocked", reason, stage });
      try { publishGuard(paths.guard, record); }
      catch {
        const observed = readGuard(paths.guard);
        if (observed.state === "blocked") return observed;
        throw new Error("mutation guard persistence failed");
      }
      return readGuard(paths.guard);
    },
    recordRecovery: (reason, stage) => {
      const record = exactRecoveryRecord({ version: MUSIC_MUTATION_RECOVERY_VERSION, reason, stage });
      if (!record) throw new Error("mutation recovery record is invalid");
      const existing = readRecovery(paths.recovery);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(record)) throw new Error("mutation recovery artifact already exists");
        return existing;
      }
      try { publishGuard(paths.recovery, record); }
      catch {
        const observed = readRecovery(paths.recovery);
        if (observed && JSON.stringify(observed) === JSON.stringify(record)) return observed;
        throw new Error("mutation recovery persistence failed");
      }
      return readRecovery(paths.recovery);
    },
  });
}
