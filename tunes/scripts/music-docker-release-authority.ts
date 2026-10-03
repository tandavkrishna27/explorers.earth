import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, relative, resolve, sep } from "node:path";

const REQUIRED_CODE_FILES = [
  "music-deploy-engine.sh",
  "music-hmac.mjs",
  "verify-publication-authority.mjs",
] as const;

export const REVIEWED_FIXTURE_IMAGES = {
  "linux/amd64": {
    registry: "registry@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373",
    postgres: "postgres@sha256:fceb6f86328c36f2438fae3b851b0cc57c4a7e69a58c866d9ce24281f2cf0c9c",
    traefik: "traefik@sha256:74d72c7a1345984f186bddbabcc462b2128d0d8054177dc84afaeac4db1f0f56",
    node: "node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1",
  },
} as const;

export type ReviewedFixtureImageName = keyof (typeof REVIEWED_FIXTURE_IMAGES)["linux/amd64"];

export function requireReviewedFixtureImage(
  nameInput: string,
  platform: string,
  inspection: Record<string, unknown>,
): string {
  const manifest = REVIEWED_FIXTURE_IMAGES[platform as keyof typeof REVIEWED_FIXTURE_IMAGES];
  if (!manifest) fail(`reviewed fixture image platform is unavailable: ${platform}`);
  const name = nameInput as ReviewedFixtureImageName;
  const expected = manifest[name];
  if (!expected) fail(`reviewed fixture image name is invalid: ${nameInput}`);
  const digest = expected.slice(expected.indexOf("@") + 1);
  const [os, architecture] = platform.split("/");
  const repoDigests = inspection.RepoDigests;
  if (inspection.Id !== digest || inspection.Os !== os || inspection.Architecture !== architecture
    || !Array.isArray(repoDigests) || !repoDigests.every((value) => typeof value === "string")
    || !repoDigests.includes(expected)) {
    fail(`reviewed fixture image identity mismatch: ${name}`);
  }
  return expected;
}

export function assertStableLocalImageTransfer(
  imageName: string,
  expectedId: string,
  observedIds: readonly string[],
): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedId)
    || observedIds.length === 0
    || observedIds.some((value) => value !== expectedId)) {
    fail(`fixture image identity changed during transfer: ${imageName}`);
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function assertEquivalentLocalImageTransfer(
  imageName: string,
  exactReference: string,
  expected: Record<string, unknown>,
  observed: Record<string, unknown>,
): void {
  const content = (inspection: Record<string, unknown>) => ({
    Architecture: inspection.Architecture,
    Os: inspection.Os,
    Variant: inspection.Variant ?? "",
    Created: inspection.Created,
    Author: inspection.Author ?? "",
    Config: inspection.Config,
    RootFS: inspection.RootFS,
  });
  const repoDigests = observed.RepoDigests;
  if (!/^127\.0\.0\.1:[1-9][0-9]{3,4}\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(exactReference)
    || typeof expected.Architecture !== "string" || typeof expected.Os !== "string"
    || expected.Config === null || typeof expected.Config !== "object"
    || expected.RootFS === null || typeof expected.RootFS !== "object"
    || !Array.isArray(repoDigests) || !repoDigests.includes(exactReference)
    || canonicalJson(content(expected)) !== canonicalJson(content(observed))) {
    fail(`fixture image content changed during transfer: ${imageName}`);
  }
}

const TRUSTED_GIT_CANDIDATES = process.platform === "win32"
  ? ["C:/Program Files/Git/cmd/git.exe", "C:/Program Files/Git/bin/git.exe"]
  : process.platform === "darwin"
    ? ["/usr/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"]
    : ["/usr/bin/git", "/usr/local/bin/git"];

function fail(message: string): never {
  throw new Error(message);
}

export interface TrustedSystemExecutable {
  label: string;
  path: string;
  digest: string;
  device: string;
  inode: string;
  links: string;
  size: string;
}

const fixedWindowsEnvironment = (): NodeJS.ProcessEnv => ({
  SystemRoot: "C:\\Windows",
  WINDIR: "C:\\Windows",
  ComSpec: "C:\\Windows\\System32\\cmd.exe",
  ProgramFiles: "C:\\Program Files",
  ProgramW6432: "C:\\Program Files",
  PATHEXT: ".COM;.EXE;.BAT;.CMD",
  PATH: "C:\\Windows\\System32;C:\\Windows",
});

function executableAclIsProtected(path: string): boolean {
  if (process.platform !== "win32") {
    const stat = lstatSync(path);
    return stat.uid === 0 && (stat.mode & 0o022) === 0;
  }
  const acl = spawnSync("C:/Windows/System32/icacls.exe", [path], {
    encoding: "utf8",
    env: fixedWindowsEnvironment(),
    windowsHide: true,
  });
  if (acl.status !== 0) return false;
  return !acl.stdout.split(/\r?\n/).some((line) =>
    !line.includes("(IO)") && /\((?:F|M|W|WD|AD|DC|WO)\)/.test(line)
    && !/(?:NT AUTHORITY\\SYSTEM|BUILTIN\\Administrators|NT SERVICE\\TrustedInstaller)/i.test(line));
}

function captureExecutable(label: string, path: string): TrustedSystemExecutable {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink < 1n || !executableAclIsProtected(path)) {
    fail(`trusted system ${label} executable is unavailable`);
  }
  return {
    label,
    path,
    digest: sha256(readFileSync(path)),
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    links: stat.nlink.toString(),
    size: stat.size.toString(),
  };
}

export function captureTrustedSystemExecutable(
  label: string,
  candidates: readonly string[],
): TrustedSystemExecutable {
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const exact = realpathSync(candidate);
    try {
      return captureExecutable(label, exact);
    } catch {
      continue;
    }
  }
  fail(`trusted system ${label} executable is unavailable`);
}

export function resolveTrustedSystemExecutable(label: string, candidates: readonly string[]): string {
  return captureTrustedSystemExecutable(label, candidates).path;
}

export function resolveTrustedSystemDirectory(label: string, candidate: string): string {
  if (!existsSync(candidate)) fail(`trusted system ${label} directory is unavailable`);
  const exact = realpathSync(candidate);
  const stat = lstatSync(exact);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !executableAclIsProtected(exact)) {
    fail(`trusted system ${label} directory is unavailable`);
  }
  return exact;
}

export function assertTrustedSystemExecutableUnchanged(authority: TrustedSystemExecutable): void {
  let exact: string;
  try {
    exact = realpathSync(authority.path);
  } catch {
    fail(`trusted system ${authority.label} executable changed`);
  }
  const stat = lstatSync(exact, { bigint: true });
  if (exact !== authority.path || !stat.isFile() || stat.isSymbolicLink()
    || stat.dev.toString() !== authority.device || stat.ino.toString() !== authority.inode
    || stat.nlink.toString() !== authority.links || stat.size.toString() !== authority.size
    || sha256(readFileSync(exact)) !== authority.digest || !executableAclIsProtected(exact)) {
    fail(`trusted system ${authority.label} executable changed`);
  }
}

const gitAuthority = captureTrustedSystemExecutable("Git", TRUSTED_GIT_CANDIDATES);
const gitExecutable = gitAuthority.path;

function trustedGitEnvironment(): NodeJS.ProcessEnv {
  if (process.platform === "win32") {
    return {
      ...fixedWindowsEnvironment(),
      HOME: "C:\\Windows\\System32\\config\\systemprofile",
      LANG: "C",
      LC_ALL: "C",
      PATH: [dirname(gitExecutable), "C:\\Windows\\System32"].join(delimiter),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "NUL",
      GIT_CONFIG_SYSTEM: "NUL",
      GIT_ATTR_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
      GIT_PAGER: "",
    };
  }
  return {
    HOME: "/",
    LANG: "C",
    LC_ALL: "C",
    PATH: "/usr/bin:/bin",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_PAGER: "",
  };
}

const gitArguments = (args: string[]) => [
  "--no-replace-objects",
  "-c", "core.fsmonitor=false",
  "-c", "core.untrackedCache=false",
  "-c", "diff.external=",
  ...args,
];

function spawnGit(root: string, args: string[], encoding: "utf8"): SpawnSyncReturns<string>;
function spawnGit(root: string, args: string[], encoding: null): SpawnSyncReturns<Buffer>;
function spawnGit(
  root: string,
  args: string[],
  encoding: "utf8" | null,
): SpawnSyncReturns<string> | SpawnSyncReturns<Buffer> {
  assertTrustedSystemExecutableUnchanged(gitAuthority);
  const common = {
    cwd: root,
    env: trustedGitEnvironment(),
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  } as const;
  const result = encoding === "utf8"
    ? spawnSync(gitExecutable, gitArguments(args), { ...common, encoding: "utf8" })
    : spawnSync(gitExecutable, gitArguments(args), common);
  assertTrustedSystemExecutableUnchanged(gitAuthority);
  return result;
}

function runGit(root: string, args: string[], encoding: "utf8"): string;
function runGit(root: string, args: string[], encoding: null): Buffer;
function runGit(root: string, args: string[], encoding: "utf8" | null): string | Buffer {
  const result = encoding === "utf8" ? spawnGit(root, args, "utf8") : spawnGit(root, args, null);
  if (result.status !== 0) fail("trusted source Git operation failed");
  return result.stdout;
}

function portable(path: string): string {
  return path.replaceAll("\\", "/");
}

function trackedRelativePath(root: string, path: string): string {
  const candidate = relative(root, path).split(sep).join("/");
  if (!candidate || candidate === ".." || candidate.startsWith("../")) {
    fail("executing rehearsal script must be tracked");
  }
  const result = spawnGit(root, ["ls-files", "--error-unmatch", "--full-name", "--", candidate], "utf8");
  if (result.status !== 0) fail("executing rehearsal script must be tracked");
  const tracked = result.stdout.trim();
  if (tracked !== candidate) fail("executing rehearsal script must be tracked");
  return candidate;
}

function workingTreeMatchesTrackedObject(root: string, commit: string, path: string): boolean {
  const working = readFileSync(resolve(root, ...path.split("/")));
  const tracked = runGit(root, ["show", `${commit}:${path}`], null);
  const normalized = Buffer.from(working.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
  return normalized.length === tracked.length && timingSafeEqual(normalized, tracked);
}

function hiddenTrackedFlags(root: string): string[] {
  return runGit(root, ["ls-files", "-v"], "utf8").split(/\r?\n/).filter((line) => /^[a-zS] /.test(line));
}

function cleanTrackedCheckout(root: string): boolean {
  const worktree = spawnGit(root, ["diff", "--quiet", "--no-ext-diff", "--no-textconv", "HEAD", "--"], "utf8");
  const index = spawnGit(root, ["diff", "--cached", "--quiet", "--no-ext-diff", "--no-textconv", "HEAD", "--"], "utf8");
  return worktree.status === 0 && index.status === 0;
}

export interface TrustedFixtureSource {
  repoRoot: string;
  nativeRepoRoot: string;
  scriptPath: string;
  scriptRelativePath: string;
  commit: string;
  tunesArchive: Buffer;
  codeFiles: Record<(typeof REQUIRED_CODE_FILES)[number], Buffer>;
}

export function captureTrustedFixtureSource(scriptInput: string): TrustedFixtureSource {
  const scriptPath = realpathSync(resolve(scriptInput));
  const discovered = runGit(dirname(scriptPath), ["rev-parse", "--show-toplevel"], "utf8").trim();
  const nativeRepoRoot = realpathSync(discovered);
  const scriptRelativePath = trackedRelativePath(nativeRepoRoot, scriptPath);
  if (hiddenTrackedFlags(nativeRepoRoot).length) fail("hidden tracked source flags are forbidden");
  if (!cleanTrackedCheckout(nativeRepoRoot)) fail("tracked source checkout must be clean");
  const commit = runGit(nativeRepoRoot, ["rev-parse", "HEAD"], "utf8").trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) fail("exact source commit is invalid");
  if (!workingTreeMatchesTrackedObject(nativeRepoRoot, commit, scriptRelativePath)) {
    fail("executing rehearsal script does not match the exact source commit");
  }
  const tunesArchive = runGit(nativeRepoRoot, ["archive", "--format=tar", `${commit}:tunes`], null);
  const codeFiles = Object.fromEntries(REQUIRED_CODE_FILES.map((name) => [
    name,
    runGit(nativeRepoRoot, ["show", `${commit}:tunes/deployment/${name}`], null),
  ])) as TrustedFixtureSource["codeFiles"];
  return {
    repoRoot: portable(nativeRepoRoot),
    nativeRepoRoot,
    scriptPath: portable(scriptPath),
    scriptRelativePath,
    commit,
    tunesArchive,
    codeFiles,
  };
}

export function assertTrustedFixtureSourceUnchanged(authority: TrustedFixtureSource): void {
  const head = runGit(authority.nativeRepoRoot, ["rev-parse", "HEAD"], "utf8").trim();
  if (head !== authority.commit || hiddenTrackedFlags(authority.nativeRepoRoot).length
    || !cleanTrackedCheckout(authority.nativeRepoRoot)) {
    fail("tracked source checkout changed");
  }
  const path = realpathSync(resolve(authority.nativeRepoRoot, ...authority.scriptRelativePath.split("/")));
  if (portable(path) !== authority.scriptPath) fail("tracked source checkout changed");
  if (!workingTreeMatchesTrackedObject(authority.nativeRepoRoot, authority.commit, authority.scriptRelativePath)) {
    fail("tracked source checkout changed");
  }
}

export function assertNoExternalFixtureAuthority(environment: NodeJS.ProcessEnv): void {
  const forbidden = Object.keys(environment).sort().find((name) => {
    if (environment[name] === undefined || environment[name] === "") return false;
    const upper = name.toUpperCase();
    return upper.startsWith("MUSIC_DEPLOY_")
      || upper === "GIT_DIR" || upper === "GIT_WORK_TREE" || upper === "GIT_INDEX_FILE"
      || upper === "GIT_OBJECT_DIRECTORY" || upper === "GIT_ALTERNATE_OBJECT_DIRECTORIES"
      || upper === "GIT_COMMON_DIR" || upper === "GIT_EXEC_PATH" || upper === "GIT_NAMESPACE"
      || upper === "GIT_SHALLOW_FILE" || upper === "GIT_REPLACE_REF_BASE"
      || upper === "GIT_CEILING_DIRECTORIES" || upper === "GIT_DISCOVERY_ACROSS_FILESYSTEM"
      || upper === "GIT_SSH" || upper === "GIT_SSH_COMMAND" || upper === "GIT_ASKPASS"
      || upper === "GIT_PROXY_COMMAND" || upper === "GIT_CONFIG" || upper.startsWith("GIT_CONFIG_")
      || upper === "BASH_ENV" || upper === "ENV" || upper === "CDPATH" || upper === "SHELLOPTS"
      || upper === "BASHOPTS" || upper === "IFS" || upper === "PROMPT_COMMAND" || upper === "PS4"
      || upper.startsWith("BASH_FUNC_") || upper.endsWith("%%")
      || upper.startsWith("DOCKER_") || upper === "NODE_OPTIONS" || upper === "NODE_PATH"
      || upper.startsWith("LD_") || upper.startsWith("DYLD_");
  });
  if (forbidden) fail(`external fixture deployment authority is forbidden: ${forbidden}`);
}

export function createSanitizedFixtureEnvironment(
  privateRoot: string,
  trustedPathEntries: readonly string[],
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const exactRoot = realpathSync(privateRoot);
  const path = trustedPathEntries.map((entry) => realpathSync(entry)).join(delimiter);
  const base = process.platform === "win32"
    ? { ...fixedWindowsEnvironment(), HOME: exactRoot, TEMP: exactRoot, TMP: exactRoot }
    : { HOME: exactRoot, TMPDIR: exactRoot };
  return {
    ...base,
    PATH: path,
    LANG: "C",
    LC_ALL: "C",
    NO_COLOR: "1",
    ...extra,
  };
}

export interface PrivateFixtureFile {
  path: string;
  expected: Buffer;
  digest: string;
  device: string;
  inode: string;
  links: string;
  size: string;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function capturePrivateFixtureFile(pathInput: string, expected: Buffer): PrivateFixtureFile {
  const path = realpathSync(resolve(pathInput));
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) fail("fixture authority must be one regular file");
  const observed = readFileSync(path);
  if (observed.length !== expected.length || !timingSafeEqual(observed, expected)) {
    fail("fixture authority bytes changed");
  }
  return {
    path,
    expected: Buffer.from(expected),
    digest: sha256(expected),
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    links: stat.nlink.toString(),
    size: stat.size.toString(),
  };
}

export function assertPrivateFixtureFileUnchanged(authority: PrivateFixtureFile): void {
  let path: string;
  try {
    path = realpathSync(authority.path);
  } catch {
    fail("fixture authority native identity changed");
  }
  const stat = lstatSync(path, { bigint: true });
  if (path !== authority.path || !stat.isFile() || stat.isSymbolicLink()
    || stat.dev.toString() !== authority.device || stat.ino.toString() !== authority.inode
    || stat.nlink.toString() !== authority.links || stat.size.toString() !== authority.size) {
    fail("fixture authority native identity changed");
  }
  const observed = readFileSync(path);
  if (sha256(observed) !== authority.digest || observed.length !== authority.expected.length
    || !timingSafeEqual(observed, authority.expected)) {
    fail("fixture authority bytes changed");
  }
}

export function requireRegistryReturnedDigest(value: string | undefined): string {
  if (!value || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail("loopback registry returned an invalid immutable digest");
  }
  return value;
}

function shellLiteral(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export interface InternalFixturePolicyInput {
  engineFile: string;
  root: string;
  repository: string;
  source: string;
  composeProject: string;
  nodeExecutable: string;
  dockerExecutable: string;
  dockerConfigDirectory: string;
  dockerEndpoint: string;
  approvedImages: readonly string[];
  authorities: readonly Pick<PrivateFixtureFile, "path" | "digest" | "device" | "inode" | "links" | "size">[];
}

export function createInternalFixturePolicyScript(input: InternalFixturePolicyInput): string {
  if (!/^127\.0\.0\.1:[1-9][0-9]{3,4}\/[a-z0-9._/-]+$/.test(input.repository)
    || !/^music-c10-release-[a-z0-9-]+$/.test(input.composeProject)
    || !/^(?:\/[A-Za-z0-9._+ /-]+|[A-Za-z]:[\\/][A-Za-z0-9._+ \\/-]+)$/.test(input.nodeExecutable)
    || !/^(?:\/[A-Za-z0-9._+ /-]+|[A-Za-z]:[\\/][A-Za-z0-9._+ \\/-]+)$/.test(input.dockerExecutable)
    || !/^(?:\/[A-Za-z0-9._+ /-]+|[A-Za-z]:[\\/][A-Za-z0-9._+ \\/-]+)$/.test(input.dockerConfigDirectory)
    || !input.approvedImages.length
    || !input.approvedImages.every((image) => image.startsWith(`${input.repository}@sha256:`)
      && /^sha256:[a-f0-9]{64}$/.test(image.slice(image.lastIndexOf("@") + 1)))) {
    fail("internal fixture policy authority is invalid");
  }
  const authorityManifest = Buffer.from(JSON.stringify(input.authorities.map(({
    path, digest, device, inode, links, size,
  }) => ({ path, digest, device, inode, links, size }))), "utf8").toString("base64url");
  const nodeVerifier = [
    'const { createHash } = require("node:crypto");',
    'const { lstatSync, readFileSync, realpathSync } = require("node:fs");',
    'const entries = JSON.parse(Buffer.from(process.argv[1], "base64url").toString("utf8"));',
    'const nativePath = value => process.platform === "win32" && /^\\/[A-Za-z]\\//.test(value) ? `${value[1].toUpperCase()}:${value.slice(2)}` : value;',
    'for (const entry of entries) {',
    '  const path = nativePath(entry.path);',
    '  let exact, stat, bytes;',
    '  try { exact = realpathSync(path); stat = lstatSync(exact, { bigint: true }); bytes = readFileSync(exact); } catch { process.exit(1); }',
    '  const digest = createHash("sha256").update(bytes).digest("hex");',
    '  if (exact !== realpathSync(path) || !stat.isFile() || stat.isSymbolicLink()',
    '    || stat.dev.toString() !== entry.device || stat.ino.toString() !== entry.inode',
    '    || stat.nlink.toString() !== entry.links || stat.size.toString() !== entry.size || digest !== entry.digest) process.exit(1);',
    '}',
  ].join("");
  const checks = `command ${shellLiteral(input.nodeExecutable)} -e ${shellLiteral(nodeVerifier)} ${shellLiteral(authorityManifest)} \\\n+  || fail "internal fixture authority changed"`;
  const imageCases = input.approvedImages.map(shellLiteral).join("|");
  return `#!/usr/bin/env bash
set -euo pipefail
umask 077
fail() { printf '%s\\n' "$*" >&2; exit 1; }
verify_internal_authorities() {
  ${checks.replace("\n+", "\n")}
}
readonly -f verify_internal_authorities
verify_internal_authorities
docker() {
  local status=0
  verify_internal_authorities
  command ${shellLiteral(input.dockerExecutable)} --config ${shellLiteral(input.dockerConfigDirectory)} --host ${shellLiteral(input.dockerEndpoint)} "$@" || status=$?
  verify_internal_authorities
  return "$status"
}
readonly -f docker
readonly MUSIC_DEPLOY_POLICY_ID=fixture-loopback-v1
readonly MUSIC_DEPLOY_POLICY_REPOSITORY=${shellLiteral(input.repository)}
readonly MUSIC_DEPLOY_POLICY_SOURCE=${shellLiteral(input.source)}
export MUSIC_DEPLOY_EXPECTED_REPOSITORY="$MUSIC_DEPLOY_POLICY_REPOSITORY"
export MUSIC_DEPLOY_EXPECTED_SOURCE="$MUSIC_DEPLOY_POLICY_SOURCE"
music_deploy_registry_materialize() {
  local auth_dir="$1" candidate_image="$2"
  case "$candidate_image" in ${imageCases}) ;; *) fail "fixture candidate is not an internally built registry digest" ;; esac
  docker --config "$auth_dir" pull "$candidate_image"
}
music_deploy_registry_cleanup() {
  local auth_dir="$1"
  rm -f -- "$auth_dir/config.json"
  rmdir -- "$auth_dir" 2>/dev/null || true
}
music_deploy_validate_compose_project() {
  [[ "$1" == ${shellLiteral(input.composeProject)} ]] || fail "fixture signed Compose project mismatch"
}
music_deploy_router_security() { return 0; }
music_deploy_route_committed() {
  docker compose -p ${shellLiteral(input.composeProject)} --project-directory ${shellLiteral(input.root)} \\
    --env-file ${shellLiteral(`${input.root}/production.env`)} -f ${shellLiteral(`${input.root}/docker-compose.yml`)} restart traefik >/dev/null 2>&1 || true
}
source ${shellLiteral(input.engineFile)}
`;
}
