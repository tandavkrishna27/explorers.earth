import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const tunesRoot = join(repositoryRoot, "tunes");
const rehearsal = join(tunesRoot, "scripts", "music-docker-release-rehearsal.ts");
const qualification = join(tunesRoot, "scripts", "music-cli.ts");
const tsxCli = join(tunesRoot, "node_modules", "tsx", "dist", "cli.mjs");
const sandboxes: string[] = [];
const posixShell = process.platform === "win32" ? "C:/Program Files/Git/bin/sh.exe" : "/bin/sh";

function shellPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const drive = normalized.match(/^([A-Za-z]):(\/.*)$/);
  return drive ? `/${drive[1]!.toLowerCase()}${drive[2]}` : normalized;
}

function protectedPreflightFixture(): {
  root: string;
  args: string[];
  npmCli: string;
  browserExecutable: string;
} {
  const root = mkdtempSync(join(tmpdir(), "music-linux-authority-"));
  sandboxes.push(root);
  const bin = join(root, "bin");
  const npmRoot = join(root, "npm");
  const npmCli = join(npmRoot, "bin", "npm-cli.js");
  const npmPath = join(bin, "npm");
  const browserRoot = join(root, "playwright");
  const browserExecutable = join(browserRoot, "chromium-1", "chrome-linux", "chrome");
  const browserManifest = join(browserRoot, ".chromium-executable.sha256");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(npmRoot, "bin"), { recursive: true });
  mkdirSync(join(browserRoot, "chromium-1", "chrome-linux"), { recursive: true });
  const node = join(bin, "node");
  const git = join(bin, "git");
  const sha = join(bin, "sha256sum");
  const find = join(bin, "find");
  for (const [path, source] of [
    [node, "#!/bin/sh\nprintf '%s\\n' v24.21.0\n"],
    [git, "#!/bin/sh\nexit 0\n"],
    [sha, "#!/bin/sh\nexec /usr/bin/sha256sum \"$@\"\n"],
    [find, "#!/bin/sh\nexec /usr/bin/find \"$@\"\n"],
    [npmCli, "#!/usr/bin/env node\n"],
    [npmPath, "#!/bin/sh\nexit 0\n"],
    [browserExecutable, "#!/bin/sh\nexit 0\n"],
  ] as const) {
    writeFileSync(path, source);
    chmodSync(path, 0o755);
  }
  const metadata = spawnSync(posixShell, ["-c", `/usr/bin/stat -c '%u:%g' '${shellPath(node)}'`], { encoding: "utf8" });
  expect(metadata.status, metadata.stderr).toBe(0);
  const [uid, gid] = metadata.stdout.trim().split(":");
  writeFileSync(browserManifest, `${createHash("sha256").update(readFileSync(browserExecutable)).digest("hex")}\n`);
  return {
    root,
    npmCli,
    browserExecutable,
    args: [
      shellPath(node), shellPath(git), shellPath(sha), "/usr/bin/stat", shellPath(find),
      shellPath(npmRoot), shellPath(npmCli), shellPath(npmPath), shellPath(browserRoot),
      uid!, gid!, "755", "v24.21.0", "*/chrome-linux*/chrome",
      createHash("sha256").update(readFileSync(npmCli)).digest("hex"),
      shellPath(browserManifest),
    ],
  };
}

function withoutNodeStartupAuthority(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^NODE(?:_|$)/i.test(key)) delete environment[key];
  }
  return { ...environment, ...extra };
}

function preloadProbe(): { root: string; preload: string; marker: string } {
  const root = mkdtempSync(join(tmpdir(), "music-c10-native-launch-red-"));
  sandboxes.push(root);
  const marker = join(root, "preload-ran");
  const preload = join(root, "preload.cjs");
  writeFileSync(preload, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran")\n`);
  return { root, preload, marker };
}

function nativeLauncher(): { file: string; args: string[]; source: string } {
  if (process.platform === "win32") {
    const source = join(tunesRoot, "scripts", "music-release-launcher.ps1");
    return {
      file: "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", source, "-Mode", "rehearsal"],
      source,
    };
  }
  const source = join(tunesRoot, "scripts", "music-release-launcher.sh");
  return { file: "/bin/sh", args: [source, "rehearsal"], source };
}

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("native Music release launch boundary", () => {
  const installedWindowsNodeVersion = process.platform === "win32"
    ? spawnSync("C:/Program Files/nodejs/node.exe", ["--version"], { encoding: "utf8", windowsHide: true }).stdout.trim()
    : "";

  it("keeps mutable-checkout qualification outside the production release trust boundary", () => {
    // Break caught: a verifier loaded from the checkout claims to authenticate
    // that same checkout, making local qualification evidence self-attesting.
    const linuxLauncher = readFileSync(join(tunesRoot, "scripts", "music-release-launcher.sh"), "utf8");
    const windowsLauncher = readFileSync(join(tunesRoot, "scripts", "music-release-launcher.ps1"), "utf8");
    const imageWorkflow = readFileSync(join(repositoryRoot, ".github", "workflows", "tunes.yml"), "utf8");
    const deployWorkflow = readFileSync(join(repositoryRoot, ".github", "workflows", "tunes-deploy.yml"), "utf8");

    expect(existsSync(join(tunesRoot, "scripts", "music-git-authority-preflight.sh"))).toBe(false);
    expect(existsSync(join(tunesRoot, "scripts", "music-git-authority-preflight.ps1"))).toBe(false);
    expect(linuxLauncher).not.toContain("music-git-authority-preflight");
    expect(windowsLauncher).not.toContain("music-git-authority-preflight");
    expect(imageWorkflow).not.toContain("music-release-launcher");
    expect(deployWorkflow).not.toContain("music-release-launcher");
  });

  it.skipIf(process.platform !== "win32" || installedWindowsNodeVersion === "v24.21.0")(
    "rejects a signed host Node that is not exact v24.21.0 before reaching the target",
    () => {
      const launcher = nativeLauncher();
      const result = spawnSync(launcher.file, launcher.args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: withoutNodeStartupAuthority({
          PSModulePath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules",
        }),
        windowsHide: true,
      });
      expect(result.status, result.stderr).toBe(78);
      expect(result.stderr).toContain("trusted native Node version must be exactly v24.21.0");
      expect(result.stderr).not.toContain("native release source checkout must be clean");
    },
  );

  it.skipIf(!existsSync(posixShell))("accepts a complete protected npm and Chromium preflight", () => {
    const fixture = protectedPreflightFixture();
    const helper = join(tunesRoot, "scripts", "music-linux-qualification-preflight.sh");
    const result = spawnSync(posixShell, [shellPath(helper), ...fixture.args], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  it.skipIf(!existsSync(posixShell)).each([
    ["missing npm", "npm", "missing"],
    ["tampered npm", "npm", "content"],
    ["missing browser", "browser", "missing"],
    ["tampered browser", "browser", "content"],
  ] as const)("fails closed for %s authority", (_label, authority, mutation) => {
    const fixture = protectedPreflightFixture();
    const target = authority === "npm" ? fixture.npmCli : fixture.browserExecutable;
    if (mutation === "missing") rmSync(target, { force: true });
    if (mutation === "content") writeFileSync(target, `${readFileSync(target, "utf8")}# tampered\n`);
    if (mutation === "directory") {
      rmSync(target, { force: true });
      mkdirSync(target);
    }
    const helper = join(tunesRoot, "scripts", "music-linux-qualification-preflight.sh");
    const result = spawnSync(posixShell, [shellPath(helper), ...fixture.args], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(78);
    expect(result.stderr).toContain(authority === "npm" ? "trusted native npm authority is unavailable" : "trusted native Playwright authority is unavailable");
  });
  it("records why a direct Node launch can never be the trusted preload boundary", () => {
    const probe = preloadProbe();
    const result = spawnSync(process.execPath, [tsxCli, rehearsal], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: withoutNodeStartupAuthority({
        MUSIC_DEPLOY_ROOT: "caller-owned",
        NODE_OPTIONS: `--require=${probe.preload}`,
      }),
      windowsHide: true,
    });
    expect(result.status).not.toBe(0);
    expect(existsSync(probe.marker)).toBe(true);
    expect(result.stderr).toContain("native Music release launcher attestation is required");
  });

  it("rejects hostile Node startup variables in native code before Node begins", () => {
    const probe = preloadProbe();
    const launcher = nativeLauncher();
    const launcherSource = readFileSync(launcher.source, "utf8");
    expect(launcherSource).toContain("native Music release launcher rejected Node startup authority");
    expect(launcherSource).toContain("--experimental-transform-types");
    expect(launcherSource).not.toMatch(/NPM_CONFIG_USERCONFIG[^\n]+(?:NUL|\/dev\/null)[\s\S]{0,120}NPM_CONFIG_GLOBALCONFIG[^\n]+(?:NUL|\/dev\/null)/);
    const result = spawnSync(launcher.file, launcher.args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: withoutNodeStartupAuthority({ NODE_OPTIONS: `--require=${probe.preload}` }),
      windowsHide: true,
    });
    expect(result.status).toBe(78);
    expect(result.stderr).toContain("native Music release launcher rejected Node startup authority");
    expect(existsSync(probe.marker)).toBe(false);
  });

  it("retains the canonical Windows native helper directory in the minimal executable allowlist", () => {
    const windowsLauncher = readFileSync(
      join(tunesRoot, "scripts", "music-release-launcher.ps1"),
      "utf8",
    );
    expect(windowsLauncher).toContain(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0",
    );
  });

  it.each([
    "NODE_PATH",
    "NODE_DEBUG_NATIVE",
    "NODE_INSPECT_RESUME_ON_START",
    "NODE_REPL_EXTERNAL_MODULE",
    "NODE_V8_COVERAGE",
  ])("rejects the %s startup-authority substitution before Node begins", (name) => {
    const launcher = nativeLauncher();
    const result = spawnSync(launcher.file, launcher.args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: withoutNodeStartupAuthority({ [name]: "caller-owned" }),
      windowsHide: true,
    });
    expect(result.status).toBe(78);
    expect(result.stderr).toContain("native Music release launcher rejected Node startup authority");
  });

  it("requires an anonymous native-launcher channel before direct Node can reach Docker authority", () => {
    const result = spawnSync(process.execPath, [tsxCli, rehearsal], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: withoutNodeStartupAuthority({ DOCKER_HOST: "tcp://caller.invalid:2375" }),
      windowsHide: true,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("native Music release launcher attestation is required");
    expect(result.stderr).not.toContain("external fixture deployment authority is forbidden");
  });

  it("refuses the direct qualification entrypoint before it can start a release lane", () => {
    const result = spawnSync(process.execPath, [tsxCli, qualification, "test:release"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: withoutNodeStartupAuthority({ DOCKER_HOST: "tcp://caller.invalid:2375" }),
      windowsHide: true,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("native Music release launcher attestation is required");
    expect(result.stderr).not.toContain("external fixture deployment authority is forbidden");
  });

  it("rejects a caller-forged nonce even when the anonymous channel matches", () => {
    const nonce = "a".repeat(64);
    const channel = pathToFileURL(join(tunesRoot, "scripts", "music-release-channel.mjs")).href;
    const result = spawnSync(process.execPath, [
      "--import", channel,
      "--eval", "",
      "--",
      "--music-native-release-channel", "rehearsal", nonce,
    ], {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: `${nonce}\n`,
      env: withoutNodeStartupAuthority(),
      windowsHide: true,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("native Music release launcher attestation is invalid");
  });
});
