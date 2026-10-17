import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, realpathSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  acquireMusicCliContractAuthority,
  classifyMusicCliContractAuthorityPresence,
  musicCliContractChildEnvironment,
  readMusicCliContractDockerTrace,
} from "./music-cli-contract-authority.ts";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const inheritedAuthority = classifyMusicCliContractAuthorityPresence(process.env);
assert(inheritedAuthority === "absent", "fresh music CLI contract authority forbids inherited authority");
const parent = mkdtempSync(join(realpathSync(tmpdir()), "music-c10-cli-contract-"));
const checkout = join(parent, "checkout");
let worktreeAdded = false;
const linkedPaths: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sanitize(value: string): string {
  return value
    .replaceAll(repositoryRoot, "<repository-root>")
    .replaceAll(repositoryRoot.replaceAll("\\", "/"), "<repository-root>")
    .replaceAll(parent, "<isolated-root>")
    .replaceAll(parent.replaceAll("\\", "/"), "<isolated-root>")
    .replace(/[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+/gi, "<developer-home>")
    .slice(-2_000);
}

function run(phase: string, file: string, args: string[], cwd = repositoryRoot, env = process.env) {
  const result = spawnSync(file, args, {
    cwd,
    encoding: "utf8",
    env,
    windowsHide: true,
    timeout: 12 * 60_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  const status = result.status ?? (result.error ? 127 : 1);
  if (status !== 0) throw new Error(`${phase} failed with exit ${status}: ${sanitize(`${result.stdout ?? ""}\n${result.stderr ?? ""}`)}`);
  return result.stdout ?? "";
}

function linkDependencies(source: string, target: string): void {
  if (!existsSync(source)) return;
  symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
  linkedPaths.push(target);
}

try {
  const status = run("source cleanliness", "git", ["status", "--porcelain=v1", "--untracked-files=all"]).trim();
  assert(status === "", "isolated CLI contract requires an exact clean source commit");
  const commit = run("source commit", "git", ["rev-parse", "HEAD"]).trim();
  assert(/^[a-f0-9]{40}$/.test(commit), "source commit is invalid");
  run("detached worktree creation", "git", ["worktree", "add", "--detach", checkout, commit]);
  worktreeAdded = true;
  linkDependencies(join(repositoryRoot, "node_modules"), join(checkout, "node_modules"));
  linkDependencies(join(repositoryRoot, "tunes", "node_modules"), join(checkout, "tunes", "node_modules"));
  const composeModel = run("compose-config fixture model", "docker", [
    "compose", "-p", "explorers-music-fixture", "--env-file", ".env.music.test.example",
    "-f", "docker-compose.music-test.yml", "config", "--format", "json",
  ], checkout);
  assert(Boolean(JSON.parse(composeModel)?.services), "fixture Compose model is invalid");
  const lease = acquireMusicCliContractAuthority({
    mode: "fresh",
    environment: process.env,
    composeModel,
    authorityRoot: parent,
  });
  try {
    assert(readMusicCliContractDockerTrace(lease.authority.dockerTrace).length === 0,
      "isolated Docker trace was not independent at acquisition");
    const mutationProbe = spawnSync(process.execPath, [lease.authority.dockerScript, "compose", "-p", "explorers-music-fixture", "down"], {
      cwd: checkout, encoding: "utf8", windowsHide: true,
    });
    assert(mutationProbe.status === 70 && mutationProbe.stderr.trim() === "fixture Docker mutation blocked",
      "fixture Docker mutation probe did not fail closed");
    const afterProbe = readMusicCliContractDockerTrace(lease.authority.dockerTrace);
    assert(afterProbe.length === 1 && afterProbe[0]?.kind === "blocked" && afterProbe[0].argumentCount === 4,
      "isolated Docker mutation probe did not create the exact first event");
    const vitest = join(repositoryRoot, "tunes", "node_modules", "vitest", "vitest.mjs");
    assert(existsSync(vitest), "isolated CLI contract Vitest runtime is unavailable");
    run("isolated CLI contract", process.execPath, [
      vitest, "run", "--config", "vitest.config.ts", "server/test/contracts/music-cli-contract.test.ts",
    ], join(checkout, "tunes"), musicCliContractChildEnvironment(lease.authority));
    const dockerCalls = readMusicCliContractDockerTrace(lease.authority.dockerTrace);
    assert(dockerCalls[0]?.kind === "blocked" && dockerCalls[0].argumentCount === 4
      && dockerCalls.some(({ kind }) => kind === "info")
      && dockerCalls.some(({ kind }) => kind === "compose-config")
      && dockerCalls.some(({ kind }) => kind === "compose-ps"),
    "isolated Docker probe did not observe the complete bounded command set");
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "music-operation/v1",
      metric: "isolated-cli-contract",
      exactCommit: true,
      sourceAuthorityUntouched: true,
    })}\n`);
  } finally {
    lease.dispose();
  }
} finally {
  assert(basename(parent).startsWith("music-c10-cli-contract-"), "unsafe isolated CLI cleanup root");
  for (const linkedPath of linkedPaths.reverse()) {
    if (existsSync(linkedPath) && lstatSync(linkedPath).isSymbolicLink()) unlinkSync(linkedPath);
  }
  if (worktreeAdded) {
    const removed = spawnSync("git", ["worktree", "remove", "--force", checkout], {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
    });
    if ((removed.status ?? 1) !== 0) throw new Error(`isolated worktree cleanup failed: ${sanitize(removed.stderr ?? "")}`);
  }
  assert(!existsSync(checkout), "isolated worktree remains after cleanup");
  rmdirSync(parent);
}
