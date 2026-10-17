import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectFixtureEnvironmentAuthority } from "../../../scripts/music-fixture-secret";
import { withIsolatedMusicCliContractRepository } from "./helpers/music-cli-contract-isolation";

const temporaryRoots: string[] = [];

function git(root: string, args: string[], input?: string): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    windowsHide: true,
  }).trim();
}

function createTrackedSource(): string {
  const root = mkdtempSync(join(tmpdir(), "music-cli-isolation-source-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "tunes", "scripts"), { recursive: true });
  writeFileSync(join(root, "package.json"), "{\"name\":\"fixture-root\",\"private\":true}\n");
  writeFileSync(join(root, "tunes", "package.json"), "{\"name\":\"fixture-tunes\",\"private\":true,\"type\":\"module\"}\n");
  writeFileSync(join(root, "tunes", "scripts", "marker.ts"), "export const marker = true;\n");
  git(root, ["init", "--quiet"]);
  git(root, ["add", "package.json", "tunes/package.json", "tunes/scripts/marker.ts"]);
  git(root, ["-c", "user.name=Music Contract", "-c", "user.email=music-contract@example.invalid", "commit", "--quiet", "-m", "fixture"]);
  return root;
}

function writeAuthorityFile(root: string, relativePath: string, bytes: Buffer): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { mode: 0o600 });
}

function createTombstoneAuthority(root: string): void {
  writeAuthorityFile(root, ".env.music.test", Buffer.alloc(0));
  writeAuthorityFile(root, `.artifacts/music-token-secrets/current-${"1".repeat(32)}`, Buffer.alloc(0));
  writeAuthorityFile(root, `.artifacts/music-environment-generations/generation-${"2".repeat(32)}`, Buffer.alloc(0));
  writeAuthorityFile(root, `.artifacts/music-rotation-journals/rotation-${"3".repeat(32)}.json`, Buffer.alloc(0));
}

function createReferenceAuthority(root: string): void {
  const credentialNames = ["4", "5", "6"].map((value) => `current-${value.repeat(32)}`);
  credentialNames.forEach((name, index) => {
    writeAuthorityFile(root, `.artifacts/music-token-secrets/${name}`, Buffer.alloc(32, 0x31 + index));
  });
  const generationName = `generation-${"7".repeat(32)}`;
  const environment = Buffer.from([
    "MUSIC_MODE=fixture",
    `MUSIC_TOKEN_SECRET_FILE_HOST=./.artifacts/music-token-secrets/${credentialNames[0]}`,
    `MUSIC_DB_MIGRATOR_SECRET_FILE_HOST=./.artifacts/music-token-secrets/${credentialNames[1]}`,
    `MUSIC_DB_RUNTIME_SECRET_FILE_HOST=./.artifacts/music-token-secrets/${credentialNames[2]}`,
    "",
  ].join("\n"));
  writeAuthorityFile(root, `.artifacts/music-environment-generations/${generationName}`, environment);
  const digest = createHash("sha256").update(environment).digest("hex");
  writeAuthorityFile(root, ".env.music.test", Buffer.from(
    `music-fixture-env/v1\ngeneration=${generationName}\nsha256=${digest}\nsize=${environment.length}\n`,
    "ascii",
  ));
}

interface AuthorityEntry {
  path: string;
  kind: "directory" | "file" | "link";
  mode: string;
  size: string;
  birthtime: string;
  ctime: string;
  mtime: string;
  sha256?: string;
}

function captureAuthorityGraph(root: string): AuthorityEntry[] {
  const paths: string[] = [];
  const add = (path: string): void => {
    if (!existsSync(path)) return;
    paths.push(path);
    const stat = lstatSync(path);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      for (const name of readdirSync(path)) add(join(path, name));
    }
  };
  add(join(root, ".env.music.test"));
  add(join(root, ".artifacts", "music-token-secrets"));
  add(join(root, ".artifacts", "music-environment-generations"));
  add(join(root, ".artifacts", "music-rotation-journals"));
  return paths.sort().map((path) => {
    const stat = lstatSync(path, { bigint: true });
    const kind = stat.isSymbolicLink() ? "link" : stat.isDirectory() ? "directory" : "file";
    return {
      path: relative(root, path).replace(/\\/g, "/"),
      kind,
      mode: stat.mode.toString(),
      size: stat.size.toString(),
      birthtime: stat.birthtimeNs.toString(),
      ctime: stat.ctimeNs.toString(),
      mtime: stat.mtimeNs.toString(),
      ...(kind === "file" ? { sha256: createHash("sha256").update(readFileSync(path)).digest("hex") } : {}),
    };
  });
}

function writeIsolatedMutation(repositoryRoot: string): void {
  writeAuthorityFile(repositoryRoot, ".env.music.test", Buffer.from("isolated-only"));
  writeAuthorityFile(
    repositoryRoot,
    `.artifacts/music-token-secrets/current-${"8".repeat(32)}`,
    Buffer.alloc(32, 0x38),
  );
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0).reverse()) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe("music CLI contract repository isolation", () => {
  it("leaves a starting tombstone graph byte-for-byte and metadata-identical", async () => {
    const source = createTrackedSource();
    createTombstoneAuthority(source);
    const before = captureAuthorityGraph(source);
    let isolationRoot = "";

    await withIsolatedMusicCliContractRepository(source, async (isolated) => {
      isolationRoot = isolated.isolationRoot;
      expect(inspectFixtureEnvironmentAuthority(source)).toBe("tombstone");
      writeIsolatedMutation(isolated.repositoryRoot);
    });

    expect(inspectFixtureEnvironmentAuthority(source)).toBe("tombstone");
    expect(captureAuthorityGraph(source)).toEqual(before);
    expect(existsSync(isolationRoot)).toBe(false);
  });

  it("leaves a starting reference graph exact when the isolated case fails", async () => {
    const source = createTrackedSource();
    createReferenceAuthority(source);
    const before = captureAuthorityGraph(source);
    const credentialCount = before.filter(({ path, kind }) => path.startsWith(".artifacts/music-token-secrets/") && kind === "file").length;
    let isolationRoot = "";

    await expect(withIsolatedMusicCliContractRepository(source, async (isolated) => {
      isolationRoot = isolated.isolationRoot;
      writeIsolatedMutation(isolated.repositoryRoot);
      throw new Error("intentional isolated case failure");
    })).rejects.toThrow("intentional isolated case failure");

    expect(inspectFixtureEnvironmentAuthority(source)).toBe("reference");
    expect(captureAuthorityGraph(source)).toEqual(before);
    expect(captureAuthorityGraph(source).filter(({ path, kind }) => path.startsWith(".artifacts/music-token-secrets/") && kind === "file")).toHaveLength(credentialCount);
    expect(existsSync(isolationRoot)).toBe(false);
  });

  it("rejects tracked fixture authority before the isolated case can run", async () => {
    const source = createTrackedSource();
    createTombstoneAuthority(source);
    git(source, ["add", "--force", ".env.music.test"]);
    git(source, ["-c", "user.name=Music Contract", "-c", "user.email=music-contract@example.invalid", "commit", "--quiet", "-m", "hostile authority"]);
    const before = captureAuthorityGraph(source);
    let invoked = false;

    await expect(withIsolatedMusicCliContractRepository(source, async () => {
      invoked = true;
    })).rejects.toThrow(/fixture authority/i);

    expect(invoked).toBe(false);
    expect(captureAuthorityGraph(source)).toEqual(before);
  });

  it("rejects a Git-index symlink before the isolated case can run", async () => {
    const source = createTrackedSource();
    createTombstoneAuthority(source);
    const blob = git(source, ["hash-object", "-w", "--stdin"], "outside-authority");
    git(source, ["update-index", "--add", "--cacheinfo", `120000,${blob},hostile-link`]);
    const before = captureAuthorityGraph(source);
    let invoked = false;

    await expect(withIsolatedMusicCliContractRepository(source, async () => {
      invoked = true;
    })).rejects.toThrow(/regular tracked files/i);

    expect(invoked).toBe(false);
    expect(captureAuthorityGraph(source)).toEqual(before);
  });
});
