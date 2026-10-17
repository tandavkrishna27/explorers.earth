import { execFileSync, spawnSync } from "node:child_process";
import {
  closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync,
  realpathSync, readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireMusicCliContractAuthority,
  assertMusicCliContractDockerEnvironment,
  classifyMusicCliContractAuthorityPresence,
  createDeterministicMusicCliContractComposeModel,
  musicCliContractChildEnvironment,
  readMusicCliContractDockerTrace,
  type MusicCliContractAuthorityLease,
  type MusicCliContractSetupWriteFile,
} from "../../../scripts/music-cli-contract-authority";
import { validateComposeModel } from "../../../scripts/music-compose-safety";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const temporaryRoot = realpathSync(tmpdir());
const composeModel = createDeterministicMusicCliContractComposeModel(repositoryRoot);
const temporaryRoots: string[] = [];
const configArgs = ["compose", "-p", "explorers-music-fixture", "-f", "docker-compose.music-test.yml", "config", "--format", "json"];
const psArgs = ["compose", "-p", "explorers-music-fixture", "-f", "docker-compose.music-test.yml", "ps", "-a", "-q"];

function createFreshRoot(name = "music-c10-cli-contract-test-"): string {
  const root = mkdtempSync(join(temporaryRoot, name));
  temporaryRoots.push(root);
  return root;
}

function acquireOwned(environment: NodeJS.ProcessEnv = {}): MusicCliContractAuthorityLease {
  return acquireMusicCliContractAuthority({ mode: "borrow-or-create", environment, composeModel });
}

function acquireFresh(root = createFreshRoot()): MusicCliContractAuthorityLease {
  return acquireMusicCliContractAuthority({ mode: "fresh", environment: {}, composeModel, authorityRoot: root });
}

function runFake(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", windowsHide: true });
}

function readBoundedTraceBytes(path: string): Buffer {
  const descriptor = openSync(path, "r");
  const buffer = Buffer.alloc(65_537);
  let bytesRead = 0;
  try {
    while (bytesRead < buffer.length) {
      const count = readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (count === 0) break;
      bytesRead += count;
    }
  } finally {
    closeSync(descriptor);
  }
  if (bytesRead > 65_536) throw new Error("test trace bound exceeded");
  return buffer.subarray(0, bytesRead);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0).reverse()) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe("Music CLI contract child authority", () => {
  it("distinguishes true absence from explicit empty, partial, and case-aliased authority", () => {
    expect(classifyMusicCliContractAuthorityPresence({})).toBe("absent");
    expect(() => classifyMusicCliContractAuthorityPresence({ MUSIC_C10_ISOLATED_DOCKER_ACK: "" }))
      .toThrow("music CLI contract authority is partial");
    expect(() => classifyMusicCliContractAuthorityPresence({
      MUSIC_C10_ISOLATED_DOCKER_ACK: "C10_MUTATION_BLOCKED",
      MUSIC_C10_ISOLATED_DOCKER_SCRIPT: "",
      MUSIC_C10_ISOLATED_NPM_EXECPATH: "",
    })).toThrow("music CLI contract authority is empty");
    expect(() => classifyMusicCliContractAuthorityPresence({
      music_c10_isolated_docker_ack: "C10_MUTATION_BLOCKED",
      MUSIC_C10_ISOLATED_DOCKER_SCRIPT: "C:\\temp\\fake-docker.cjs",
      MUSIC_C10_ISOLATED_NPM_EXECPATH: "C:\\temp\\fake-npm.cjs",
    })).toThrow("music CLI contract authority key casing is ambiguous");
    expect(() => classifyMusicCliContractAuthorityPresence({
      MUSIC_C10_ISOLATED_DOCKER_ACK: "C10_MUTATION_BLOCKED",
      music_c10_isolated_docker_ack: "C10_MUTATION_BLOCKED",
      MUSIC_C10_ISOLATED_DOCKER_SCRIPT: "C:\\temp\\fake-docker.cjs",
      MUSIC_C10_ISOLATED_NPM_EXECPATH: "C:\\temp\\fake-npm.cjs",
    })).toThrow("music CLI contract authority key casing is ambiguous");
  });

  it("builds a valid deterministic Compose model", () => {
    expect(() => validateComposeModel(JSON.parse(composeModel))).not.toThrow();
  });

  it("creates direct-child executable fakes that allow only exact bounded reads", () => {
    const lease = acquireOwned();
    temporaryRoots.push(lease.authority.authorityRoot);
    try {
      expect(dirname(lease.authority.authorityRoot)).toBe(temporaryRoot);
      expect(basename(lease.authority.authorityRoot)).toMatch(/^music-c10-cli-contract-/);
      expect(relative(temporaryRoot, lease.authority.dockerScript).split(/[\\/]/)).toEqual([
        basename(lease.authority.authorityRoot), "fake-docker", "fake-docker.cjs",
      ]);
      expect(relative(temporaryRoot, lease.authority.npmScript).split(/[\\/]/)).toEqual([
        basename(lease.authority.authorityRoot), "fake-docker", "fake-npm.cjs",
      ]);
      expect(JSON.parse(execFileSync(process.execPath, [lease.authority.dockerScript, "info"], { encoding: "utf8" }))).toEqual({});
      expect(JSON.parse(execFileSync(process.execPath, [lease.authority.dockerScript, ...configArgs], { encoding: "utf8" }))).toHaveProperty("services");
      expect(runFake(lease.authority.dockerScript, psArgs).status).toBe(0);
      const blocked = runFake(lease.authority.dockerScript, ["compose", "-p", "explorers-music-fixture", "down"]);
      expect(blocked.status).toBe(70);
      expect(blocked.stderr).toBe("fixture Docker mutation blocked\n");
      for (const args of [
        [...configArgs.slice(0, -2), "json", "--format"],
        [...configArgs, "--extra"],
        [...configArgs, ...psArgs],
      ]) expect(runFake(lease.authority.dockerScript, args).status).toBe(70);
      expect(execFileSync(process.execPath, [lease.authority.npmScript, "--version"], { encoding: "utf8" })).toBe("10.0.0\n");
      expect(readMusicCliContractDockerTrace(lease.authority.dockerTrace)).toEqual([
        { kind: "info", args: ["info"] },
        { kind: "compose-config", args: configArgs },
        { kind: "compose-ps", args: psArgs },
        { kind: "blocked", argumentCount: 4 },
        { kind: "blocked", argumentCount: configArgs.length },
        { kind: "blocked", argumentCount: configArgs.length + 1 },
        { kind: "blocked", argumentCount: configArgs.length + psArgs.length },
      ]);
    } finally {
      lease.dispose();
    }
  });

  it.runIf(process.platform === "win32")("quotes generated executable paths containing spaces and rejects nested fresh roots", () => {
    const spacedRoot = join(temporaryRoot, "music-c10-cli-contract-path with spaces");
    mkdirSync(spacedRoot);
    temporaryRoots.push(spacedRoot);
    const lease = acquireFresh(spacedRoot);
    expect(runFake(lease.authority.dockerScript, ["info"]).status).toBe(0);
    expect(runFake(lease.authority.npmScript, ["--version"]).status).toBe(0);
    lease.dispose();

    const outer = createFreshRoot();
    const nested = join(outer, "nested", "music-c10-cli-contract-rejected");
    mkdirSync(nested, { recursive: true });
    const sentinel = join(nested, "sentinel");
    writeFileSync(sentinel, "unchanged");
    expect(() => acquireFresh(nested)).toThrow("music CLI contract authority is hostile");
    expect(readFileSync(sentinel, "utf8")).toBe("unchanged");
    expect(existsSync(join(nested, "fake-docker"))).toBe(false);
  });

  it("enforces projected trace byte and line bounds with bounded reads", () => {
    const lease = acquireFresh();
    try {
      const line = `${JSON.stringify({ kind: "info", args: ["info"] })}\n`;
      writeFileSync(lease.authority.dockerTrace, line.repeat(256));
      const lineBytes = lstatSync(lease.authority.dockerTrace).size;
      expect(runFake(lease.authority.dockerScript, ["info"]).status).toBe(71);
      expect(lstatSync(lease.authority.dockerTrace).size).toBe(lineBytes);
      writeFileSync(lease.authority.dockerTrace, " ".repeat(65_520));
      const projectedBytes = lstatSync(lease.authority.dockerTrace).size;
      expect(runFake(lease.authority.dockerScript, ["info"]).status).toBe(71);
      expect(lstatSync(lease.authority.dockerTrace).size).toBe(projectedBytes);
      writeFileSync(lease.authority.dockerTrace, Buffer.alloc(65_537, 0x20));
      expect(runFake(lease.authority.dockerScript, ["info"]).status).toBe(71);
      expect(() => readMusicCliContractDockerTrace(lease.authority.dockerTrace)).toThrow("music CLI contract Docker trace bound exceeded");
    } finally {
      lease.dispose();
    }
  });

  it("rejects extra trace fields without exposing their values", () => {
    const lease = acquireFresh();
    try {
      writeFileSync(lease.authority.dockerTrace, `${JSON.stringify({ kind: "info", args: ["info"], secret: "must-not-escape" })}\n`);
      let message = "";
      try {
        readMusicCliContractDockerTrace(lease.authority.dockerTrace);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain("music CLI contract Docker trace is invalid");
      expect(message).not.toContain("must-not-escape");
    } finally {
      lease.dispose();
    }
  });

  it("scrubs forbidden selectors, preserves Path, and permits only the explicit npm override", () => {
    const lease = acquireFresh();
    try {
      const child = musicCliContractChildEnvironment(lease.authority, {
        Path: "C:\\controlled path", docker_host: "secret-host-value", DoCkEr_CoNtExT: "secret-context-value",
        gate_prod: "secret-gate-value", Music_Deploy_Production: "secret-production-value",
        music_deploy_prod: "secret-prod-value", npm_execpath: "C:\\real npm\\npm-cli.js",
      });
      expect(child.Path).toBe("C:\\controlled path");
      for (const key of Object.keys(child)) {
        expect(["docker_host", "docker_context", "gate_prod", "music_deploy_production", "music_deploy_prod"]).not.toContain(key.toLowerCase());
      }
      expect(child.MUSIC_C10_ISOLATED_DOCKER_ACK).toBe("C10_MUTATION_BLOCKED");
      expect(child.MUSIC_C10_ISOLATED_DOCKER_SCRIPT).toBe(lease.authority.dockerScript);
      expect(child.MUSIC_C10_ISOLATED_NPM_EXECPATH).toBeUndefined();
      expect(JSON.stringify(child)).not.toContain("secret-host-value");
      assertMusicCliContractDockerEnvironment(child);
    } finally {
      lease.dispose();
    }
  });

  it("accepts ordinary and matching complete process-shaped overrides but rejects hostile overrides", () => {
    const lease = acquireFresh();
    try {
      const ordinary = musicCliContractChildEnvironment(lease.authority, { SAFE: "yes", npm_execpath: "C:\\npm-cli.js" });
      expect(ordinary.SAFE).toBe("yes");
      expect(ordinary.MUSIC_C10_ISOLATED_NPM_EXECPATH).toBeUndefined();
      const complete = musicCliContractChildEnvironment(lease.authority, { ...lease.authority.environment, npm_execpath: "C:\\npm-cli.js" });
      expect(complete.MUSIC_C10_ISOLATED_DOCKER_SCRIPT).toBe(lease.authority.dockerScript);
      expect(complete.MUSIC_C10_ISOLATED_NPM_EXECPATH).toBeUndefined();
      expect(() => musicCliContractChildEnvironment(lease.authority, { MUSIC_C10_ISOLATED_DOCKER_ACK: "C10_MUTATION_BLOCKED" }))
        .toThrow("music CLI contract authority is partial");
      expect(() => musicCliContractChildEnvironment(lease.authority, { music_c10_isolated_docker_ack: "C10_MUTATION_BLOCKED" }))
        .toThrow("music CLI contract authority key casing is ambiguous");
      expect(() => musicCliContractChildEnvironment(lease.authority, {
        ...lease.authority.environment, MUSIC_C10_ISOLATED_DOCKER_SCRIPT: "C:\\other\\fake-docker.cjs",
      })).toThrow("music CLI contract authority override does not match lease");
    } finally {
      lease.dispose();
    }
  });

  it("rejects incomplete, empty, aliased, and hostile acquisition inputs before use", () => {
    const undefinedEnvironment: NodeJS.ProcessEnv = {};
    Object.defineProperty(undefinedEnvironment, "MUSIC_C10_ISOLATED_DOCKER_ACK", { enumerable: true, value: undefined });
    expect(() => acquireOwned(undefinedEnvironment)).toThrow("music CLI contract authority is partial");
    expect(() => acquireOwned({ MUSIC_C10_ISOLATED_DOCKER_ACK: "C10_MUTATION_BLOCKED", MUSIC_C10_ISOLATED_DOCKER_SCRIPT: "x" }))
      .toThrow("music CLI contract authority is partial");
    expect(() => acquireOwned({
      MUSIC_C10_ISOLATED_DOCKER_ACK: "C10_MUTATION_BLOCKED", MUSIC_C10_ISOLATED_DOCKER_SCRIPT: "x", MUSIC_C10_ISOLATED_NPM_EXECPATH: "",
    })).toThrow("music CLI contract authority is empty");
    expect(() => classifyMusicCliContractAuthorityPresence({
      MUSIC_C10_ISOLATED_DOCKER_ACK: undefined,
      MUSIC_C10_ISOLATED_DOCKER_SCRIPT: undefined,
      MUSIC_C10_ISOLATED_NPM_EXECPATH: undefined,
    })).toThrow("music CLI contract authority is empty");
    expect(() => acquireOwned({ music_c10_isolated_docker_ack: "x" })).toThrow("music CLI contract authority key casing is ambiguous");
    const outside = createFreshRoot("outside-authority-");
    const outsideDocker = join(outside, "fake-docker.cjs");
    const outsideNpm = join(outside, "fake-npm.cjs");
    writeFileSync(outsideDocker, "process.exit(0)\n");
    writeFileSync(outsideNpm, "process.exit(0)\n");
    expect(() => acquireOwned({
      MUSIC_C10_ISOLATED_DOCKER_ACK: "C10_MUTATION_BLOCKED",
      MUSIC_C10_ISOLATED_DOCKER_SCRIPT: outsideDocker,
      MUSIC_C10_ISOLATED_NPM_EXECPATH: outsideNpm,
    })).toThrow("music CLI contract authority is hostile");
    const missingDirectory = join(temporaryRoot, "music-c10-cli-contract-missing", "fake-docker");
    expect(() => acquireOwned({
      MUSIC_C10_ISOLATED_DOCKER_ACK: "C10_MUTATION_BLOCKED",
      MUSIC_C10_ISOLATED_DOCKER_SCRIPT: join(missingDirectory, "fake-docker.cjs"),
      MUSIC_C10_ISOLATED_NPM_EXECPATH: join(missingDirectory, "fake-npm.cjs"),
    })).toThrow("music CLI contract authority is hostile");
    const incompleteRoot = createFreshRoot();
    const incompleteDirectory = join(incompleteRoot, "fake-docker");
    mkdirSync(incompleteDirectory);
    const incompleteDocker = join(incompleteDirectory, "fake-docker.cjs");
    const incompleteNpm = join(incompleteDirectory, "fake-npm.cjs");
    writeFileSync(incompleteDocker, "process.exit(0)\n");
    writeFileSync(incompleteNpm, "process.exit(0)\n");
    writeFileSync(join(incompleteDirectory, "docker-calls.jsonl"), "");
    expect(() => acquireOwned({
      MUSIC_C10_ISOLATED_DOCKER_ACK: "C10_MUTATION_BLOCKED",
      MUSIC_C10_ISOLATED_DOCKER_SCRIPT: incompleteDocker,
      MUSIC_C10_ISOLATED_NPM_EXECPATH: incompleteNpm,
    })).toThrow("music CLI contract authority is hostile");
  });

  it("guards the Docker child boundary before launch", () => {
    const lease = acquireFresh();
    try {
      let launched = false;
      const broken = { ...lease.authority.environment };
      delete broken.MUSIC_C10_ISOLATED_DOCKER_ACK;
      expect(() => {
        assertMusicCliContractDockerEnvironment(broken);
        launched = true;
      }).toThrow("music CLI contract Docker authority is incomplete");
      expect(launched).toBe(false);
      expect(readMusicCliContractDockerTrace(lease.authority.dockerTrace)).toEqual([]);
    } finally {
      lease.dispose();
    }
  });

  it("borrows a complete authority as an exact no-op lease", () => {
    const original = acquireFresh();
    const scriptBefore = readFileSync(original.authority.dockerScript);
    runFake(original.authority.dockerScript, ["info"]);
    const traceBefore = readBoundedTraceBytes(original.authority.dockerTrace);
    const borrowed = acquireOwned({ ...original.authority.environment });
    expect(borrowed.authority).toMatchObject({
      authorityRoot: original.authority.authorityRoot, dockerDirectory: original.authority.dockerDirectory,
      dockerScript: original.authority.dockerScript, npmScript: original.authority.npmScript,
      dockerTrace: original.authority.dockerTrace, owned: false,
    });
    borrowed.dispose();
    borrowed.dispose();
    expect(readFileSync(original.authority.dockerScript)).toEqual(scriptBefore);
    expect(readBoundedTraceBytes(original.authority.dockerTrace)).toEqual(traceBefore);
    original.dispose();
    expect(existsSync(original.authority.authorityRoot)).toBe(true);
    expect(existsSync(original.authority.dockerDirectory)).toBe(false);
  });

  it("fresh acquisition cannot inherit or reuse another authority trace", () => {
    const first = acquireFresh();
    runFake(first.authority.dockerScript, ["info"]);
    const traceBefore = readBoundedTraceBytes(first.authority.dockerTrace);
    const secondRoot = createFreshRoot();
    const sentinel = join(secondRoot, "sentinel");
    writeFileSync(sentinel, "unchanged");
    expect(() => acquireMusicCliContractAuthority({
      mode: "fresh", environment: { ...first.authority.environment }, composeModel, authorityRoot: secondRoot,
    })).toThrow("fresh music CLI contract authority forbids inherited authority");
    expect(readBoundedTraceBytes(first.authority.dockerTrace)).toEqual(traceBefore);
    expect(readFileSync(sentinel, "utf8")).toBe("unchanged");
    expect(existsSync(join(secondRoot, "fake-docker"))).toBe(false);
    first.dispose();
  });

  it("disposes owned and caller-owned roots after success and callback failure", () => {
    const sibling = createFreshRoot("music-authority-sentinel-");
    const siblingFile = join(sibling, "sentinel");
    writeFileSync(siblingFile, "unchanged");
    const owned = acquireOwned();
    const ownedRoot = owned.authority.authorityRoot;
    owned.dispose();
    owned.dispose();
    expect(existsSync(ownedRoot)).toBe(false);
    let failedRoot = "";
    expect(() => {
      const failed = acquireOwned();
      failedRoot = failed.authority.authorityRoot;
      try { throw new Error("simulated callback error"); } finally { failed.dispose(); }
    }).toThrow("simulated callback error");
    expect(existsSync(failedRoot)).toBe(false);
    expect(readFileSync(siblingFile, "utf8")).toBe("unchanged");
    const callerRoot = createFreshRoot();
    const caller = acquireFresh(callerRoot);
    caller.dispose();
    expect(existsSync(callerRoot)).toBe(true);
    expect(existsSync(join(callerRoot, "fake-docker"))).toBe(false);
  });

  it("validates Compose JSON before allocating owned or caller-owned fake directories", () => {
    const before = readdirSync(temporaryRoot).filter((name) => name.startsWith("music-c10-cli-contract-"));
    expect(() => acquireMusicCliContractAuthority({ mode: "borrow-or-create", environment: {}, composeModel: "{" }))
      .toThrow("music CLI contract Compose model is invalid");
    expect(() => acquireMusicCliContractAuthority({ mode: "borrow-or-create", environment: {}, composeModel: "{}" }))
      .toThrow("music CLI contract Compose model is invalid");
    expect(readdirSync(temporaryRoot).filter((name) => name.startsWith("music-c10-cli-contract-"))).toEqual(before);
    const root = createFreshRoot();
    const sentinel = join(root, "sentinel");
    writeFileSync(sentinel, "unchanged");
    expect(() => acquireMusicCliContractAuthority({ mode: "fresh", environment: {}, composeModel: "{}", authorityRoot: root }))
      .toThrow("music CLI contract Compose model is invalid");
    expect(readFileSync(sentinel, "utf8")).toBe("unchanged");
    expect(existsSync(join(root, "fake-docker"))).toBe(false);
  });

  it("rolls back partially written owned and caller-owned acquisitions", () => {
    for (const mode of ["owned", "fresh"] as const) {
      let firstPath = "";
      let calls = 0;
      const setupWriteFile: MusicCliContractSetupWriteFile = (path, _data, _options, write) => {
        calls += 1;
        if (calls === 2) throw new Error("injected setup write failure");
        write();
        firstPath = path;
      };
      const root = mode === "fresh" ? createFreshRoot() : undefined;
      const sentinel = root === undefined ? undefined : join(root, "sentinel");
      if (sentinel !== undefined) writeFileSync(sentinel, "unchanged");
      expect(() => acquireMusicCliContractAuthority(mode === "fresh"
        ? { mode: "fresh", environment: {}, composeModel, authorityRoot: root!, setupWriteFile }
        : { mode: "borrow-or-create", environment: {}, composeModel, setupWriteFile }))
        .toThrow("injected setup write failure");
      expect(firstPath).not.toBe("");
      expect(existsSync(dirname(firstPath))).toBe(false);
      if (root !== undefined && sentinel !== undefined) {
        expect(existsSync(root)).toBe(true);
        expect(readFileSync(sentinel, "utf8")).toBe("unchanged");
      } else expect(existsSync(dirname(dirname(firstPath)))).toBe(false);
    }
  });

  it.each(["owned", "fresh"] as const)("preserves a competing second-write sentinel in %s mode", (mode) => {
    let calls = 0;
    let competingPath = "";
    let capturedOwnedRoot = "";
    const setupWriteFile = (
      path: string,
      _data: string,
      options: { flag: "wx"; mode: number },
      write: (writeBytes?: (descriptor: number, data: string) => void) => void,
    ): void => {
      calls += 1;
      capturedOwnedRoot = dirname(dirname(path));
      if (calls === 2) {
        competingPath = path;
        writeFileSync(path, "competing-sentinel", options);
        if (typeof write === "function") write();
        else writeFileSync(path, _data, options);
        return;
      }
      if (typeof write === "function") write();
      else writeFileSync(path, _data, options);
    };
    const root = mode === "fresh" ? createFreshRoot() : undefined;
    let failure = "";
    try {
      try {
        acquireMusicCliContractAuthority(mode === "fresh"
          ? { mode: "fresh", environment: {}, composeModel, authorityRoot: root!, setupWriteFile }
          : { mode: "borrow-or-create", environment: {}, composeModel, setupWriteFile });
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      expect(existsSync(competingPath)).toBe(true);
      expect(readFileSync(competingPath, "utf8")).toBe("competing-sentinel");
      expect(failure).toContain("unsafe music CLI contract authority cleanup target");
    } finally {
      if (mode === "owned" && capturedOwnedRoot !== "" && existsSync(capturedOwnedRoot)) {
        rmSync(capturedOwnedRoot, { recursive: true, force: true });
      }
    }
  });

  it.each(["owned", "fresh"] as const)("rolls back a second file created before its byte write fails in %s mode", (mode) => {
    let calls = 0;
    let secondPath = "";
    const setupWriteFile = (
      path: string,
      _data: string,
      _options: { flag: "wx"; mode: number },
      write: (writeBytes?: (descriptor: number, data: string) => void) => void,
    ): void => {
      calls += 1;
      if (calls === 2) {
        secondPath = path;
        write(() => { throw new Error("injected authority byte write failure"); });
        return;
      }
      write();
    };
    const root = mode === "fresh" ? createFreshRoot() : undefined;
    expect(() => acquireMusicCliContractAuthority(mode === "fresh"
      ? { mode: "fresh", environment: {}, composeModel, authorityRoot: root!, setupWriteFile }
      : { mode: "borrow-or-create", environment: {}, composeModel, setupWriteFile }))
      .toThrow("injected authority byte write failure");
    expect(secondPath).not.toBe("");
    expect(existsSync(dirname(secondPath))).toBe(false);
    if (root === undefined) expect(existsSync(dirname(dirname(secondPath)))).toBe(false);
    else expect(existsSync(root)).toBe(true);
  });

  it("rolls back an exclusive write that reaches disk before setup reports failure", () => {
    for (const mode of ["owned", "fresh"] as const) {
      let writtenPath = "";
      let calls = 0;
      const setupWriteFile: MusicCliContractSetupWriteFile = (path, _data, _options, write) => {
        calls += 1;
        write();
        writtenPath = path;
        if (calls === 2) throw new Error("injected post-write setup failure");
      };
      const root = mode === "fresh" ? createFreshRoot() : undefined;
      expect(() => acquireMusicCliContractAuthority(mode === "fresh"
        ? { mode: "fresh", environment: {}, composeModel, authorityRoot: root!, setupWriteFile }
        : { mode: "borrow-or-create", environment: {}, composeModel, setupWriteFile }))
        .toThrow("injected post-write setup failure");
      expect(writtenPath).not.toBe("");
      expect(existsSync(dirname(writtenPath))).toBe(false);
      if (root === undefined) expect(existsSync(dirname(dirname(writtenPath)))).toBe(false);
      else expect(existsSync(root)).toBe(true);
    }
  });

  it("refuses to delete a replaced authority directory during disposal or acquisition rollback", () => {
    const sibling = createFreshRoot("music-authority-sentinel-");
    const siblingFile = join(sibling, "sentinel");
    writeFileSync(siblingFile, "unchanged");
    const lease = acquireFresh();
    rmSync(lease.authority.dockerDirectory, { recursive: true });
    mkdirSync(lease.authority.dockerDirectory);
    const replacement = join(lease.authority.dockerDirectory, "replacement");
    writeFileSync(replacement, "preserve");
    expect(() => lease.dispose()).toThrow("unsafe music CLI contract authority cleanup target");
    expect(readFileSync(replacement, "utf8")).toBe("preserve");
    expect(readFileSync(siblingFile, "utf8")).toBe("unchanged");
    const rollbackRoot = createFreshRoot();
    let calls = 0;
    const setupWriteFile: MusicCliContractSetupWriteFile = (path, _data, _options, write) => {
      calls += 1;
      if (calls === 2) {
        const directory = dirname(path);
        rmSync(directory, { recursive: true });
        mkdirSync(directory);
        writeFileSync(join(directory, "replacement"), "preserve");
        throw new Error("injected setup write failure");
      }
      write();
    };
    expect(() => acquireMusicCliContractAuthority({
      mode: "fresh", environment: {}, composeModel, authorityRoot: rollbackRoot, setupWriteFile,
    })).toThrow("unsafe music CLI contract authority cleanup target");
    expect(readFileSync(join(rollbackRoot, "fake-docker", "replacement"), "utf8")).toBe("preserve");
    expect(readFileSync(siblingFile, "utf8")).toBe("unchanged");
  });
});
