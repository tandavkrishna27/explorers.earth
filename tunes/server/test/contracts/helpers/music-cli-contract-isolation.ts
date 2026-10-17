import { execFileSync } from "node:child_process";
import {
  constants,
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
  type BigIntStats,
} from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, win32 } from "node:path";
import {
  acquireMusicCliContractAuthority,
  createDeterministicMusicCliContractComposeModel,
  type MusicCliContractAuthority,
} from "../../../../scripts/music-cli-contract-authority.ts";

export interface IsolatedMusicCliContractRepository {
  isolationRoot: string;
  repositoryRoot: string;
  tunesRoot: string;
  cliAuthority: MusicCliContractAuthority;
}

interface TrackedRepositoryEntry {
  mode: "100644" | "100755";
  path: string;
}

const isolationPrefix = ".music-cli-contract-isolated-";
const forbiddenFixtureAuthority = [
  ".artifacts/music-token-secrets",
  ".artifacts/music-environment-generations",
  ".artifacts/music-rotation-journals",
] as const;

function isWithin(parent: string, candidate: string): boolean {
  const remainder = relative(parent, candidate);
  return remainder !== "" && !remainder.startsWith("..") && !isAbsolute(remainder);
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function assertOwnedDirectory(path: string): BigIntStats {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("music CLI contract isolation requires owned directories");
  }
  return stat;
}

function assertUnlinkedAncestors(root: string, path: string): void {
  let current = dirname(path);
  while (current !== root) {
    if (!isWithin(root, current)) throw new Error("tracked path escapes the repository root");
    assertOwnedDirectory(current);
    current = dirname(current);
  }
  assertOwnedDirectory(root);
}

function isFixtureAuthorityPath(path: string): boolean {
  if (path === ".env.music.test"
      || /^\.env\.music\.test\.(?:[a-f0-9]{32}|reference-[a-f0-9]{32})\.tmp$/.test(path)
      || path === ".artifacts/music-fixture-cleanup.intent") return true;
  return forbiddenFixtureAuthority.some((directory) => path === directory || path.startsWith(`${directory}/`));
}

function validateTrackedPath(root: string, path: string): string {
  if (!path || path.includes("\\") || path.includes("\0") || isAbsolute(path) || win32.isAbsolute(path) || posix.isAbsolute(path)) {
    throw new Error("tracked path must be a normalized repository-relative path");
  }
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("tracked path must be a normalized repository-relative path");
  }
  if (isFixtureAuthorityPath(path)) throw new Error("tracked fixture authority cannot enter the isolated contract repository");
  const absolute = resolve(root, ...segments);
  if (!isWithin(root, absolute)) throw new Error("tracked path escapes the repository root");
  return absolute;
}

function readTrackedEntries(sourceRoot: string): TrackedRepositoryEntry[] {
  const output = execFileSync("git", ["ls-files", "--stage", "-z"], {
    cwd: sourceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const seen = new Set<string>();
  return output.split("\0").filter(Boolean).map((record) => {
    const match = record.match(/^(\d{6}) [a-f0-9]+ ([0-3])\t([\s\S]+)$/);
    if (!match || match[2] !== "0" || (match[1] !== "100644" && match[1] !== "100755")) {
      throw new Error("music CLI contract isolation accepts only regular tracked files");
    }
    const path = match[3]!;
    validateTrackedPath(sourceRoot, path);
    if (seen.has(path)) throw new Error("music CLI contract isolation rejects ambiguous tracked files");
    seen.add(path);
    return { mode: match[1], path } as TrackedRepositoryEntry;
  });
}

function sourceCommit(sourceRoot: string): string {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("music CLI contract source commit is invalid");
  return commit;
}

function copyTrackedRepository(sourceRoot: string, destinationRoot: string, entries: readonly TrackedRepositoryEntry[]): void {
  const realSourceRoot = realpathSync(sourceRoot);
  for (const entry of entries) {
    const source = validateTrackedPath(sourceRoot, entry.path);
    assertUnlinkedAncestors(sourceRoot, source);
    const before = lstatSync(source, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || !isWithin(realSourceRoot, realpathSync(source))) {
      throw new Error("music CLI contract isolation accepts only regular tracked files");
    }
    const destination = resolve(destinationRoot, ...entry.path.split("/"));
    if (!isWithin(destinationRoot, destination)) throw new Error("isolated destination escapes its repository root");
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination, constants.COPYFILE_EXCL);
    chmodSync(destination, entry.mode === "100755" ? 0o755 : 0o644);
    const after = lstatSync(source, { bigint: true });
    const copied = lstatSync(destination, { bigint: true });
    if (!sameIdentity(before, after) || before.size !== after.size || before.mtimeNs !== after.mtimeNs
        || !copied.isFile() || copied.isSymbolicLink() || copied.size !== before.size) {
      throw new Error("tracked source changed while the isolated repository was copied");
    }
  }
}

export async function withIsolatedMusicCliContractRepository<T>(
  sourceRepositoryRoot: string,
  run: (repository: IsolatedMusicCliContractRepository) => T | Promise<T>,
): Promise<T> {
  const sourceRoot = resolve(sourceRepositoryRoot);
  const sourceRootStat = assertOwnedDirectory(sourceRoot);
  const sourceTunesRoot = join(sourceRoot, "tunes");
  assertOwnedDirectory(sourceTunesRoot);
  if (!isWithin(realpathSync(sourceRoot), realpathSync(sourceTunesRoot))) {
    throw new Error("Tunes dependency anchor escapes the source repository");
  }
  const entries = readTrackedEntries(sourceRoot);
  const commit = sourceCommit(sourceRoot);
  if (!sameIdentity(sourceRootStat, lstatSync(sourceRoot, { bigint: true }))) {
    throw new Error("source repository identity changed during isolation authorization");
  }

  const isolationRoot = mkdtempSync(join(sourceTunesRoot, isolationPrefix));
  const isolationStat = lstatSync(isolationRoot, { bigint: true });
  const repositoryRoot = join(isolationRoot, "repository");
  const tunesRoot = join(repositoryRoot, "tunes");
  try {
    mkdirSync(repositoryRoot, { recursive: false });
    copyTrackedRepository(sourceRoot, repositoryRoot, entries);
    const gitDirectory = join(repositoryRoot, ".git");
    mkdirSync(gitDirectory, { mode: 0o700 });
    writeFileSync(join(gitDirectory, "HEAD"), `${commit}\n`, { mode: 0o600 });
    const lease = acquireMusicCliContractAuthority({
      mode: "borrow-or-create",
      environment: process.env,
      composeModel: createDeterministicMusicCliContractComposeModel(repositoryRoot),
    });
    try {
      return await run({ isolationRoot, repositoryRoot, tunesRoot, cliAuthority: lease.authority });
    } finally {
      lease.dispose();
    }
  } finally {
    if (existsSync(isolationRoot)) {
      const observed = lstatSync(isolationRoot, { bigint: true });
      const exactParent = dirname(isolationRoot) === sourceTunesRoot && basename(isolationRoot).startsWith(isolationPrefix);
      if (!exactParent || !observed.isDirectory() || observed.isSymbolicLink() || !sameIdentity(isolationStat, observed)) {
        throw new Error("unsafe music CLI contract isolation cleanup target");
      }
      rmSync(isolationRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
    if (existsSync(isolationRoot)) throw new Error("music CLI contract isolation cleanup did not remove its temporary root");
  }
}
