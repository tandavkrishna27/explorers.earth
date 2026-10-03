import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as releaseAuthority from "../../../scripts/music-docker-release-authority";
import {
  assertNoExternalFixtureAuthority,
  assertPrivateFixtureFileUnchanged,
  assertTrustedFixtureSourceUnchanged,
  capturePrivateFixtureFile,
  captureTrustedFixtureSource,
  createSanitizedFixtureEnvironment,
  createInternalFixturePolicyScript,
  requireRegistryReturnedDigest,
  resolveTrustedSystemDirectory,
  resolveTrustedSystemExecutable,
} from "../../../scripts/music-docker-release-authority";

const sandboxes: string[] = [];
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash";
const shellPath = (path: string) => {
  const normalized = path.replaceAll("\\", "/");
  return process.platform === "win32" ? `/${normalized[0]!.toLowerCase()}${normalized.slice(2)}` : normalized;
};
const git = (root: string, ...args: string[]) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
};

const reviewedImages = [
  ["registry", "registry@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373"],
  ["postgres", "postgres@sha256:fceb6f86328c36f2438fae3b851b0cc57c4a7e69a58c866d9ce24281f2cf0c9c"],
  ["traefik", "traefik@sha256:74d72c7a1345984f186bddbabcc462b2128d0d8054177dc84afaeac4db1f0f56"],
  ["node", "node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1"],
] as const;

function requireReviewedImage(
  name: string,
  platform: string,
  inspection: Record<string, unknown>,
): string {
  const candidate = (releaseAuthority as unknown as {
    requireReviewedFixtureImage?: (imageName: string, imagePlatform: string, value: Record<string, unknown>) => string;
  }).requireReviewedFixtureImage;
  if (!candidate) throw new Error("reviewed fixture image API unavailable");
  return candidate(name, platform, inspection);
}

function assertStableImageTransfer(name: string, expectedId: string, ...observedIds: string[]): void {
  const candidate = (releaseAuthority as unknown as {
    assertStableLocalImageTransfer?: (imageName: string, imageId: string, values: readonly string[]) => void;
  }).assertStableLocalImageTransfer;
  if (!candidate) throw new Error("stable local image transfer API unavailable");
  candidate(name, expectedId, observedIds);
}

function assertEquivalentImageTransfer(
  name: string,
  exactReference: string,
  expected: Record<string, unknown>,
  observed: Record<string, unknown>,
): void {
  const candidate = (releaseAuthority as unknown as {
    assertEquivalentLocalImageTransfer?: (
      imageName: string,
      reference: string,
      expectedValue: Record<string, unknown>,
      observedValue: Record<string, unknown>,
    ) => void;
  }).assertEquivalentLocalImageTransfer;
  if (!candidate) throw new Error("equivalent local image transfer API unavailable");
  candidate(name, exactReference, expected, observed);
}

function cleanFixtureRepository(crlfScript = false): { root: string; script: string; commit: string } {
  const root = mkdtempSync(join(tmpdir(), "music-c10-source-authority-"));
  sandboxes.push(root);
  const files = {
    ...(crlfScript ? { ".gitattributes": "*.ts text eol=crlf\n" } : {}),
    "tunes/scripts/music-docker-release-rehearsal.ts": "export const tracked = true;\n",
    "tunes/Dockerfile": "FROM scratch\nCOPY . /app\n",
    "tunes/app.ts": "export const exact = 1;\n",
    "tunes/deployment/music-deploy-engine.sh": "engine\n",
    "tunes/deployment/music-hmac.mjs": "hmac\n",
    "tunes/deployment/verify-publication-authority.mjs": "verify\n",
  };
  for (const [relative, contents] of Object.entries(files)) {
    const path = join(root, ...relative.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  git(root, "init");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "user.name", "Fixture Test");
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture");
  const script = join(root, "tunes/scripts/music-docker-release-rehearsal.ts");
  if (crlfScript) {
    rmSync(script);
    git(root, "checkout", "--", "tunes/scripts/music-docker-release-rehearsal.ts");
  }
  return {
    root,
    script,
    commit: git(root, "rev-parse", "HEAD"),
  };
}

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("Music Docker release source authority", () => {
  it("refuses caller-selected source, root, Compose, expected-image map, and HMAC authority", () => {
    for (const name of [
      "MUSIC_DEPLOY_ROOT",
      "MUSIC_DEPLOY_REQUEST_FILE",
      "MUSIC_DEPLOY_HMAC_KEY_FILE",
      "MUSIC_DEPLOY_FIXTURE_EXPECTED_IMAGE_FILE",
      "MUSIC_DEPLOY_FIXTURE_COMPOSE_FILE",
      "MUSIC_DEPLOY_FIXTURE_SOURCE_ROOT",
    ]) {
      expect(() => assertNoExternalFixtureAuthority({ [name]: "caller-owned" })).toThrow(
        `external fixture deployment authority is forbidden: ${name}`,
      );
    }
    expect(() => assertNoExternalFixtureAuthority({ PATH: process.env.PATH })).not.toThrow();
    const root = mkdtempSync(join(tmpdir(), "music-c10-host-tool-"));
    sandboxes.push(root);
    const callerTool = join(root, process.platform === "win32" ? "git.exe" : "git");
    writeFileSync(callerTool, "caller selected\n");
    chmodSync(callerTool, 0o777);
    expect(() => resolveTrustedSystemExecutable("caller tool", [callerTool]))
      .toThrow("trusted system caller tool executable is unavailable");
  });

  it.runIf(process.platform === "win32")("accepts an ACL-protected Windows system executable with native hardlinks", () => {
    expect(resolveTrustedSystemExecutable("whoami", ["C:/Windows/System32/whoami.exe"]))
      .toBe("C:\\Windows\\System32\\whoami.exe");
  });

  it.runIf(process.platform === "win32")("ignores inherit-only creator ACLs on protected tool directories", () => {
    expect(resolveTrustedSystemDirectory("Git Unix tools", "C:/Program Files/Git/usr/bin"))
      .toBe("C:\\Program Files\\Git\\usr\\bin");
  });

  it.runIf(process.platform === "win32")("retains only the fixed Windows root needed for protected Docker plugins", () => {
    const root = mkdtempSync(join(tmpdir(), "music-c10-sanitized-env-"));
    sandboxes.push(root);
    const environment = createSanitizedFixtureEnvironment(root, ["C:/Windows/System32"]);
    expect(environment.ProgramFiles).toBe("C:\\Program Files");
    expect(environment.ProgramW6432).toBe("C:\\Program Files");
    expect(environment.USERPROFILE).toBeUndefined();
    expect(environment.DOCKER_CONFIG).toBeUndefined();
  });

  it.each([
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_SYSTEM",
    "GIT_CONFIG_COUNT",
    "GIT_EXEC_PATH",
    "BASH_ENV",
    "ENV",
    "CDPATH",
    "SHELLOPTS",
    "BASHOPTS",
    "BASH_FUNC_sha256sum%%",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
    "DOCKER_HOST",
    "DOCKER_CERT_PATH",
    "DOCKER_TLS_VERIFY",
    "NODE_OPTIONS",
    "NODE_PATH",
    "LD_PRELOAD",
    "DYLD_INSERT_LIBRARIES",
  ])("rejects inherited execution authority %s before mutation", (name) => {
    expect(() => assertNoExternalFixtureAuthority({ [name]: "caller-owned" })).toThrow(
      `external fixture deployment authority is forbidden: ${name}`,
    );
  });

  it("captures exact Git-object bytes from the executing tracked script and fails on source changes", () => {
    const fixture = cleanFixtureRepository(true);
    const fakeBin = join(fixture.root, "caller-bin");
    mkdirSync(fakeBin);
    const fakeGit = join(fakeBin, process.platform === "win32" ? "git.exe" : "git");
    writeFileSync(fakeGit, "#!/usr/bin/env bash\nexit 91\n");
    chmodSync(fakeGit, 0o700);
    const originalPath = process.env.PATH;
    let authority: ReturnType<typeof captureTrustedFixtureSource>;
    try {
      process.env.PATH = `${fakeBin}${process.platform === "win32" ? ";" : ":"}${originalPath ?? ""}`;
      authority = captureTrustedFixtureSource(fixture.script);
    } finally {
      process.env.PATH = originalPath;
    }
    expect(authority.repoRoot).toBe(fixture.root.replaceAll("\\", "/"));
    expect(readFileSync(fixture.script, "utf8")).toContain("\r\n");
    expect(authority.commit).toBe(fixture.commit);
    expect(authority.tunesArchive.subarray(257, 265).toString("utf8")).toBe("ustar\0" + "00");
    expect(authority.codeFiles["music-deploy-engine.sh"].toString("utf8")).toBe("engine\n");

    writeFileSync(join(fixture.root, "tunes/app.ts"), "export const exact = 2;\n");
    expect(() => assertTrustedFixtureSourceUnchanged(authority)).toThrow("tracked source checkout changed");
    expect(authority.tunesArchive.includes(Buffer.from("export const exact = 1;"))).toBe(true);
    expect(authority.tunesArchive.includes(Buffer.from("export const exact = 2;"))).toBe(false);
  });

  it("rejects dirty, detached-script, and hidden index authority before source capture", () => {
    const dirty = cleanFixtureRepository();
    writeFileSync(join(dirty.root, "tunes/app.ts"), "dirty\n");
    expect(() => captureTrustedFixtureSource(dirty.script)).toThrow("tracked source checkout must be clean");

    const detached = cleanFixtureRepository();
    const outside = join(detached.root, "outside.ts");
    writeFileSync(outside, "outside\n");
    expect(() => captureTrustedFixtureSource(outside)).toThrow("executing rehearsal script must be tracked");

    const hidden = cleanFixtureRepository();
    git(hidden.root, "update-index", "--assume-unchanged", "tunes/app.ts");
    expect(() => captureTrustedFixtureSource(hidden.script)).toThrow("hidden tracked source flags are forbidden");
  });

  it("binds internally generated authority to its native identity and exact bytes", () => {
    const root = mkdtempSync(join(tmpdir(), "music-c10-native-authority-"));
    sandboxes.push(root);
    const path = join(root, "compose.json");
    writeFileSync(path, "exact-model", { mode: 0o600 });
    const authority = capturePrivateFixtureFile(path, Buffer.from("exact-model"));
    expect(() => assertPrivateFixtureFileUnchanged(authority)).not.toThrow();

    const replacement = join(root, "replacement");
    writeFileSync(replacement, "exact-model", { mode: 0o600 });
    rmSync(path);
    renameSync(replacement, path);
    expect(readFileSync(path, "utf8")).toBe("exact-model");
    expect(() => assertPrivateFixtureFileUnchanged(authority)).toThrow("fixture authority native identity changed");
  });

  it("keeps captured authority bytes out of the generated adapter argument manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "music-c10-compact-adapter-"));
    sandboxes.push(root);
    const engine = join(root, "engine.sh");
    writeFileSync(engine, "#".repeat(128 * 1024), { mode: 0o600 });
    const authority = capturePrivateFixtureFile(engine, readFileSync(engine));
    const adapter = createInternalFixturePolicyScript({
      engineFile: shellPath(engine),
      root: shellPath(root),
      repository: "127.0.0.1:55123/explorers-tunes",
      source: "https://github.com/explorers-earth/explorers.earth",
      composeProject: "music-c10-release-compact",
      nodeExecutable: shellPath(process.execPath),
      dockerExecutable: shellPath(process.execPath),
      dockerConfigDirectory: shellPath(root),
      dockerEndpoint: "unix:///var/run/docker.sock",
      approvedImages: ["127.0.0.1:55123/explorers-tunes@sha256:" + "a".repeat(64)],
      authorities: [{ ...authority, path: shellPath(authority.path) }],
    });
    expect(adapter.length).toBeLessThan(20_000);
  });

  it("accepts only one immutable digest returned by the loopback registry", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    expect(requireRegistryReturnedDigest(digest)).toBe(digest);
    for (const value of [undefined, "", `sha256:${"a".repeat(63)}`, `sha256:${"A".repeat(64)}`, `${digest}\n${digest}`]) {
      expect(() => requireRegistryReturnedDigest(value)).toThrow("loopback registry returned an invalid immutable digest");
    }
  });

  it.each(reviewedImages)("accepts only the reviewed immutable %s image on linux/amd64", (name, reference) => {
    const digest = reference.slice(reference.indexOf("@") + 1);
    expect(requireReviewedImage(name, "linux/amd64", {
      Id: digest,
      RepoDigests: [reference],
      RepoTags: [],
      Os: "linux",
      Architecture: "amd64",
    })).toBe(reference);
  });

  it.each(reviewedImages)("rejects a mutable-tag substitution for %s before Docker mutation", (name, reference) => {
    expect(() => requireReviewedImage(name, "linux/amd64", {
      Id: `sha256:${"e".repeat(64)}`,
      RepoDigests: [reference.replace(/sha256:[a-f0-9]{64}/, `sha256:${"e".repeat(64)}`)],
      RepoTags: [`${name}:caller-retagged`],
      Os: "linux",
      Architecture: "amd64",
    })).toThrow(`reviewed fixture image identity mismatch: ${name}`);
  });

  it("fails closed when the Docker engine platform has no reviewed image manifest", () => {
    expect(() => requireReviewedImage("node", "linux/arm64", {
      Id: `sha256:${"a".repeat(64)}`,
      RepoDigests: [],
      Os: "linux",
      Architecture: "arm64",
    })).toThrow("reviewed fixture image platform is unavailable: linux/arm64");
  });

  it("rejects a mutable local tag substitution anywhere in an image transfer", () => {
    const expected = `sha256:${"a".repeat(64)}`;
    expect(() => assertStableImageTransfer("tunes-build-base", expected,
      expected, `sha256:${"b".repeat(64)}`, expected,
    )).toThrow("fixture image identity changed during transfer: tunes-build-base");
  });

  it("accepts a registry manifest-ID conversion only when immutable image content is equivalent", () => {
    const exactReference = `127.0.0.1:55123/fixture@sha256:${"c".repeat(64)}`;
    const content = {
      Architecture: "amd64",
      Os: "linux",
      Variant: "",
      Created: "2026-08-23T00:00:00Z",
      Author: "",
      Config: { Entrypoint: ["/entrypoint"], Labels: { fixture: "exact" } },
      RootFS: { Type: "layers", Layers: [`sha256:${"d".repeat(64)}`] },
    };
    expect(() => assertEquivalentImageTransfer("fixture", exactReference,
      { ...content, Id: `sha256:${"a".repeat(64)}` },
      { ...content, Id: `sha256:${"b".repeat(64)}`, RepoDigests: [exactReference] },
    )).not.toThrow();
    expect(() => assertEquivalentImageTransfer("fixture", exactReference,
      { ...content, Id: `sha256:${"a".repeat(64)}` },
      { ...content, RootFS: { Type: "layers", Layers: [`sha256:${"e".repeat(64)}`] }, RepoDigests: [exactReference] },
    )).toThrow("fixture image content changed during transfer: fixture");
  });

  it("executes only the internal exact-image policy adapter against the shared engine", () => {
    const root = mkdtempSync(join(tmpdir(), "music-c10-policy-adapter-"));
    sandboxes.push(root);
    const fakeBin = join(root, "bin");
    mkdirSync(fakeBin);
    const dockerLog = join(root, "docker.log");
    const dockerShim = join(fakeBin, "docker");
    writeFileSync(dockerShim, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(shellPath(dockerLog))}\n`);
    chmodSync(dockerShim, 0o700);
    const dockerConfigDirectory = join(root, "docker-client");
    mkdirSync(dockerConfigDirectory);
    writeFileSync(join(dockerConfigDirectory, "config.json"), '{"auths":{}}\n', { mode: 0o600 });
    const digest = `sha256:${"a".repeat(64)}`;
    const repository = "127.0.0.1:55123/explorers-tunes";
    const approved = `${repository}@${digest}`;
    const engine = join(root, "music-deploy-engine.sh");
    writeFileSync(engine, [
      '[[ "$MUSIC_DEPLOY_POLICY_ID" == fixture-loopback-v1 ]] || exit 70',
      '[[ "$MUSIC_DEPLOY_EXPECTED_REPOSITORY" == "127.0.0.1:55123/explorers-tunes" ]] || exit 71',
      'music_deploy_validate_compose_project "music-c10-release-adapter"',
      `music_deploy_registry_materialize ${JSON.stringify(shellPath(join(root, "auth")))} ${JSON.stringify(approved)}`,
      "",
    ].join("\n"), { mode: 0o600 });
    const authority = capturePrivateFixtureFile(engine, readFileSync(engine));
    const adapter = createInternalFixturePolicyScript({
      engineFile: shellPath(engine),
      root: shellPath(root),
      repository,
      source: "https://github.com/explorers-earth/explorers.earth",
      composeProject: "music-c10-release-adapter",
      nodeExecutable: shellPath(process.execPath),
      dockerExecutable: shellPath(dockerShim),
      dockerConfigDirectory: shellPath(dockerConfigDirectory),
      dockerEndpoint: "unix:///var/run/docker.sock",
      approvedImages: [approved],
      authorities: [{ ...authority, path: shellPath(authority.path) }],
    });
    const result = spawnSync(bash, ["--noprofile", "--norc", "-s"], {
      input: adapter,
      encoding: "utf8",
      env: { ...process.env, PATH: `${fakeBin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` },
      windowsHide: true,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(dockerLog, "utf8")).toContain(`--config ${shellPath(dockerConfigDirectory)} --host unix:///var/run/docker.sock --config ${shellPath(join(root, "auth"))} pull ${approved}`);

    writeFileSync(engine, readFileSync(engine, "utf8").replace(approved, `${repository}@sha256:${"b".repeat(64)}`));
    const tampered = spawnSync(bash, ["--noprofile", "--norc", "-s"], {
      input: adapter,
      encoding: "utf8",
      env: { ...process.env, PATH: `${fakeBin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` },
      windowsHide: true,
    });
    expect(tampered.status).not.toBe(0);
    expect(tampered.stderr).toContain("internal fixture authority changed");
  });

  it("does not let ambient sha256sum or awk bless a replaced internal engine", () => {
    const root = mkdtempSync(join(tmpdir(), "music-c10-policy-hash-"));
    sandboxes.push(root);
    const fakeBin = join(root, "bin");
    mkdirSync(fakeBin);
    const dockerLog = join(root, "docker.log");
    const dockerShim = join(fakeBin, "docker");
    writeFileSync(dockerShim, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(shellPath(dockerLog))}\n`);
    chmodSync(dockerShim, 0o700);
    const dockerConfigDirectory = join(root, "docker-client");
    mkdirSync(dockerConfigDirectory);
    writeFileSync(join(dockerConfigDirectory, "config.json"), '{"auths":{}}\n', { mode: 0o600 });
    const engine = join(root, "music-deploy-engine.sh");
    writeFileSync(engine, "printf 'trusted-engine\\n'\n", { mode: 0o600 });
    const authority = capturePrivateFixtureFile(engine, readFileSync(engine));
    const bashEnvironment = join(root, "hostile-bash-env");
    writeFileSync(bashEnvironment, [
      `sha256sum() { printf '%s  %s\\n' ${JSON.stringify(authority.digest)} "$1"; }`,
      "awk() { while read -r first _; do printf '%s\\n' \"$first\"; done; }",
      "",
    ].join("\n"), { mode: 0o600 });
    const adapter = createInternalFixturePolicyScript({
      engineFile: shellPath(engine),
      root: shellPath(root),
      repository: "127.0.0.1:55123/explorers-tunes",
      source: "https://github.com/explorers-earth/explorers.earth",
      composeProject: "music-c10-release-hash",
      nodeExecutable: shellPath(process.execPath),
      dockerExecutable: shellPath(dockerShim),
      dockerConfigDirectory: shellPath(dockerConfigDirectory),
      dockerEndpoint: "unix:///var/run/docker.sock",
      approvedImages: ["127.0.0.1:55123/explorers-tunes@sha256:" + "a".repeat(64)],
      authorities: [{ ...authority, path: shellPath(authority.path) }],
    });
    writeFileSync(engine, "printf 'caller-engine\\n'\n", { mode: 0o600 });
    const result = spawnSync(bash, ["--noprofile", "--norc", "-s"], {
      input: adapter,
      encoding: "utf8",
      env: { BASH_ENV: shellPath(bashEnvironment), PATH: "/usr/bin" },
      windowsHide: true,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("internal fixture authority changed");
    expect(existsSync(dockerLog)).toBe(false);
  });
});
