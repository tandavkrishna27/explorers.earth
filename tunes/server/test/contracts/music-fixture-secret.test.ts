import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, closeSync, constants, existsSync, fsyncSync, ftruncateSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupAllFixtureMusicTokenSecrets,
  cleanupFixtureMusicTokenSecret,
  prepareFixtureMusicTokenSecret,
  withAllFixtureMusicSecretsCleanup,
} from "../../../scripts/music-fixture-secret";
import * as fixtureSecrets from "../../../scripts/music-fixture-secret";

const fixtureCleanupContentionTimeoutMs = 30_000;
let roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "music-fixture-secret-"));
  roots.push(root);
  return root;
}

const semanticDurableReplace = (source: string, destination: string): void => {
  renameSync(source, destination);
};

function snapshotFixtureTree(root: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) snapshot[relative(root, path).replace(/\\/g, "/")] = readFileSync(path).toString("base64");
    }
  };
  visit(root);
  return snapshot;
}

type WindowsNativeIdentity = fixtureSecrets.FixtureWindowsNativeIdentity;

function inspectWindowsNativeAuthority(helper: string, path: string): WindowsNativeIdentity {
  const result = spawnSync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", helper, "inspect", path,
  ], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as WindowsNativeIdentity;
}

function runWindowsNativeReplace(
  helper: string,
  source: string,
  destination: string,
  timeout = 15_000,
): ReturnType<typeof spawnSync> {
  const sourceIdentity = inspectWindowsNativeAuthority(helper, source);
  const parentIdentity = inspectWindowsNativeAuthority(helper, resolve(source, ".."));
  const destinationIdentity = inspectWindowsNativeAuthority(helper, destination);
  const encode = (identity: WindowsNativeIdentity, content: boolean) => [
    identity.volumeSerial, identity.fileId, String(identity.attributes), String(identity.linkCount),
    ...(content ? [String(identity.size), identity.sha256] : []),
  ];
  return spawnSync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", helper, "replace", source, destination,
    ...encode(sourceIdentity, true), ...encode(parentIdentity, false), "1",
    ...encode(destinationIdentity, true),
  ], { encoding: "utf8", windowsHide: true, timeout });
}

describe("disposable fixture Music token secret", () => {
  it("creates a fresh unpredictable exclusive leaf without overwriting the prior valid key", () => {
    const root = fixtureRoot();
    const directory = join(root, ".artifacts", "music-token-secrets");
    mkdirSync(directory, { recursive: true });
    const first = prepareFixtureMusicTokenSecret(root, () => Buffer.alloc(32, 0x71), {
      randomNameBytes: () => Buffer.alloc(16, 0x11),
    } as never);
    const firstBytes = readFileSync(first, "utf8");
    const second = prepareFixtureMusicTokenSecret(root, () => Buffer.alloc(32, 0x72), {
      randomNameBytes: () => Buffer.alloc(16, 0x22),
    } as never);

    expect(first).not.toBe(second);
    expect(first).toMatch(/current-[a-f0-9]{32}$/);
    expect(second).toMatch(/current-[a-f0-9]{32}$/);
    expect(firstBytes).toBe(Buffer.alloc(32, 0x71).toString("base64url"));
    expect(readFileSync(first, "utf8")).toBe(firstBytes);
    expect(readFileSync(second, "utf8")).toBe(Buffer.alloc(32, 0x72).toString("base64url"));
    if (process.platform !== "win32") expect(statSync(second).mode & 0o777).toBe(0o600);
  }, 20_000);

  it("leaves the prior key byte-exact when a fresh key write crashes or is short", () => {
    const root = fixtureRoot();
    const prior = prepareFixtureMusicTokenSecret(root, () => Buffer.alloc(32, 0x73), {
      randomNameBytes: () => Buffer.alloc(16, 0x31),
      durableReplace: semanticDurableReplace,
    } as never);
    const priorBytes = readFileSync(prior);

    expect(() => prepareFixtureMusicTokenSecret(root, () => Buffer.alloc(32, 0x74), {
      randomNameBytes: () => Buffer.alloc(16, 0x32),
      write: (descriptor: number, buffer: Uint8Array) => writeSync(descriptor, buffer, 0, 3, 0),
      durableReplace: semanticDurableReplace,
    } as never)).toThrow(/fixture signing key|short|write/i);

    expect(readFileSync(prior)).toEqual(priorBytes);
    const failedLeaf = join(root, ".artifacts", "music-token-secrets", `current-${Buffer.alloc(16, 0x32).toString("hex")}`);
    expect(lstatSync(failedLeaf).size).toBe(0);
  });

  it("refuses a leaf swapped to an outside symlink before descriptor writes", () => {
    const root = fixtureRoot();
    const outsideRoot = fixtureRoot();
    const directory = join(root, ".artifacts", "music-token-secrets");
    const path = join(directory, `current-${Buffer.alloc(16, 0x41).toString("hex")}`);
    const outside = join(outsideRoot, "outside-sentinel");
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, "owned-old-secret", { mode: 0o600 });
    writeFileSync(outside, "outside-must-not-change", { mode: 0o600 });
    let swapRan = false;

    expect(() => (prepareFixtureMusicTokenSecret as unknown as (
      root: string,
      random: () => Buffer,
      dependencies: { randomNameBytes: () => Buffer; open: (path: string, flags: number, mode: number) => number },
    ) => string)(root, () => Buffer.alloc(32, 0x74), {
      randomNameBytes: () => Buffer.alloc(16, 0x41),
      open: (target, flags, mode) => {
        swapRan = true;
        unlinkSync(target);
        symlinkSync(outside, target, "file");
        return openSync(target, flags, mode);
      },
    })).toThrow(/fixture signing key|regular|link/i);

    expect(swapRan).toBe(true);
    expect(readFileSync(outside, "utf8")).toBe("outside-must-not-change");
  });

  it("refuses an ancestor junction swap before descriptor writes and leaves the outside file untouched", () => {
    const root = fixtureRoot();
    const outsideRoot = fixtureRoot();
    const directory = join(root, ".artifacts", "music-token-secrets");
    const movedDirectory = join(root, ".artifacts", "music-token-secrets-owned");
    const path = join(directory, `current-${Buffer.alloc(16, 0x42).toString("hex")}`);
    const outside = join(outsideRoot, `current-${Buffer.alloc(16, 0x42).toString("hex")}`);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, "owned-old-secret", { mode: 0o600 });
    writeFileSync(outside, "outside-must-not-change", { mode: 0o600 });
    let swapRan = false;

    expect(() => prepareFixtureMusicTokenSecret(root, () => Buffer.alloc(32, 0x76), {
      randomNameBytes: () => Buffer.alloc(16, 0x42),
      open: (target, flags, mode) => {
        swapRan = true;
        renameSync(directory, movedDirectory);
        symlinkSync(outsideRoot, directory, "junction");
        return openSync(target, flags, mode);
      },
    })).toThrow(/fixture signing key|regular|link/i);
    expect(swapRan).toBe(true);
    expect(readFileSync(outside, "utf8")).toBe("outside-must-not-change");
    expect(readFileSync(join(movedDirectory, basename(path)), "utf8")).toBe("owned-old-secret");
  });

  it("erases through the verified descriptor and never unlinks an outside target after an ancestor swap", () => {
    const root = fixtureRoot();
    const outsideRoot = fixtureRoot();
    const directory = join(root, ".artifacts", "music-token-secrets");
    const movedDirectory = join(root, ".artifacts", "music-token-secrets-owned");
    const durableReplace = vi.fn(semanticDurableReplace);
    const path = prepareFixtureMusicTokenSecret(root, () => Buffer.alloc(32, 0x75), {
      randomNameBytes: () => Buffer.alloc(16, 0x43),
      durableReplace,
    } as never);
    const outside = join(outsideRoot, path.slice(path.lastIndexOf(process.platform === "win32" ? "\\" : "/") + 1));
    writeFileSync(outside, "outside-must-not-change", { mode: 0o640 });
    const outsideMode = statSync(outside).mode;
    let swapRan = false;
    let swapBlocked = false;

    (cleanupFixtureMusicTokenSecret as unknown as (
      root: string,
      exactPath: string,
      dependencies: { beforeErase: () => void },
    ) => void)(root, path, {
      beforeErase: () => {
        swapRan = true;
        try {
          renameSync(directory, movedDirectory);
          symlinkSync(outsideRoot, directory, "junction");
        } catch (error) {
          if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
          swapBlocked = true;
        }
      },
    });

    expect(swapRan).toBe(true);
    expect(readFileSync(outside, "utf8")).toBe("outside-must-not-change");
    expect(statSync(outside).mode).toBe(outsideMode);
    const erased = swapBlocked ? path : join(movedDirectory, basename(path));
    expect(lstatSync(erased).size).toBe(0);
    expect(durableReplace).toHaveBeenCalledTimes(process.platform === "win32" ? 1 : 0);
  });

  it("erases the exact fixture secret on reset/teardown success or failure without pathname deletion", async () => {
    for (const shouldFail of [false, true]) {
      const root = fixtureRoot();
      const path = prepareFixtureMusicTokenSecret(root, () => Buffer.alloc(32, shouldFail ? 0x77 : 0x76), {
        randomNameBytes: () => Buffer.alloc(16, shouldFail ? 0x45 : 0x44),
        durableReplace: semanticDurableReplace,
      } as never);
      const action = async () => { if (shouldFail) throw new Error("forced fixture teardown failure"); };
      const cleanup = (fixtureSecrets as unknown as {
        withFixtureMusicTokenSecretCleanup: <T>(root: string, path: string, action: () => Promise<T>) => Promise<T>;
      }).withFixtureMusicTokenSecretCleanup(root, path, action);
      if (shouldFail) await expect(cleanup).rejects.toThrow("forced fixture teardown failure");
      else await expect(cleanup).resolves.toBeUndefined();
      expect(lstatSync(path).isFile()).toBe(true);
      expect(lstatSync(path).size).toBe(0);
    }
  });

  it.each(["truncate", "sync", "close"] as const)("fails closed when descriptor %s erasure fails and a verified retry removes the secret", (failure) => {
    // Production break caught: eraseDescriptor swallows the syscall failure
    // and teardown reports success while credential bytes can remain.
    const root = fixtureRoot();
    const path = prepareFixtureMusicTokenSecret(root, () => Buffer.alloc(32, 0x7a), {
      randomNameBytes: () => Buffer.alloc(16, failure === "truncate" ? 0x51 : failure === "sync" ? 0x52 : 0x53),
      durableReplace: semanticDurableReplace,
    } as never);
    const targetId = basename(path);
    const dependencies = failure === "truncate"
      ? { truncate: () => { throw new Error("truncate-secret-sentinel"); } }
      : failure === "sync"
        ? { sync: () => { throw new Error("sync-secret-sentinel"); } }
        : { close: (descriptor: number) => { closeSync(descriptor); throw new Error("close-secret-sentinel"); } };

    let caught: unknown;
    try {
      cleanupFixtureMusicTokenSecret(root, path, dependencies as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      name: "FixtureSecretCleanupError",
      code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED",
      targetId,
    });
    expect(String(caught)).not.toContain(root);
    expect(String(caught)).not.toContain(`${failure}-secret-sentinel`);

    cleanupFixtureMusicTokenSecret(root, path);
    expect(lstatSync(path).size).toBe(0);
  });

  it("rejects teardown success when failure-path erasure itself cannot complete", async () => {
    // Production break caught: an action failure hides a second cleanup
    // failure and returns an apparently ordinary teardown error.
    const root = fixtureRoot();
    const path = prepareFixtureMusicTokenSecret(root, () => Buffer.alloc(32, 0x7b), {
      randomNameBytes: () => Buffer.alloc(16, 0x54),
      durableReplace: semanticDurableReplace,
    } as never);
    const cleanup = (fixtureSecrets as unknown as {
      withFixtureMusicTokenSecretCleanup: <T>(root: string, path: string, action: () => Promise<T>, dependencies?: unknown) => Promise<T>;
    }).withFixtureMusicTokenSecretCleanup(root, path, async () => { throw new Error("action-secret-sentinel"); }, {
      truncate: () => { throw new Error("truncate-secret-sentinel"); },
    });

    await expect(cleanup).rejects.toMatchObject({
      name: "FixtureSecretCleanupError",
      code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED",
      targetId: basename(path),
    });
    cleanupFixtureMusicTokenSecret(root, path);
    expect(lstatSync(path).size).toBe(0);
  });
});

describe("fixture environment secret persistence", () => {
  type PersistenceDependencies = {
    randomNameBytes?: (size: number) => Buffer;
    open?: typeof openSync;
    write?: typeof writeSync;
    sync?: typeof fsyncSync;
    close?: typeof closeSync;
    truncate?: typeof ftruncateSync;
    rename?: typeof renameSync;
    beforePublish?: () => void;
    syncDirectory?: (path: string) => void;
    afterReferenceCommit?: () => void;
    durableReplace?: (source: string, destination: string) => void;
  };
  type Persist = (root: string, contents: string, dependencies?: PersistenceDependencies) => string;

  function requiredPersist(): Persist {
    const candidate = (fixtureSecrets as unknown as { persistFixtureMusicEnvironment?: Persist }).persistFixtureMusicEnvironment;
    expect(candidate, "secure environment persistence API is required").toBeTypeOf("function");
    return (root, contents, dependencies = {}) => candidate!(root, contents, dependencies.rename
      ? dependencies
      : {
          ...dependencies,
          durableReplace: dependencies.durableReplace
            ?? ((source, destination) => renameSync(source, destination)),
        });
  }

  function seedPersistedEnvironment(root: string, contents = "PREVIOUS=byte-exact\n"): Buffer {
    requiredPersist()(root, contents, { randomNameBytes: () => Buffer.alloc(16, 0x5f) });
    return readFileSync(join(root, ".env.music.test"));
  }

  it("never follows or overwrites a precreated attacker temporary leaf", () => {
    // Production break caught: .env.music.test.<pid>.tmp is opened with `w`
    // and follows a precreated link to an outside sentinel.
    const root = fixtureRoot();
    const attacker = join(root, `.env.music.test.${Buffer.alloc(16, 0x61).toString("hex")}.tmp`);
    const destination = join(root, ".env.music.test");
    writeFileSync(attacker, "attacker-temp-must-not-change", { mode: 0o640 });
    seedPersistedEnvironment(root);
    const attackerMode = statSync(attacker).mode;

    expect(requiredPersist()(root, "SESSION_SECRET=new-secret-sentinel\n", {
      randomNameBytes: () => Buffer.alloc(16, 0x61),
    })).toBe(destination);
    expect(readFileSync(attacker, "utf8")).toBe("attacker-temp-must-not-change");
    expect(statSync(attacker).mode).toBe(attackerMode);
    expect(readFileSync(destination, "utf8")).not.toContain("new-secret-sentinel");
    expect((fixtureSecrets as unknown as { readFixtureMusicEnvironment: (root: string) => string }).readFixtureMusicEnvironment(root)).toBe("SESSION_SECRET=new-secret-sentinel\n");
  });

  it.each(["short-write", "sync", "rename"] as const)("preserves the prior environment and leaves no secret residue after %s failure", (failure) => {
    // Production break caught: a populated predictable temp remains after a
    // write/fsync/rename failure and the prior valid environment can be lost.
    const root = fixtureRoot();
    const destination = join(root, ".env.music.test");
    const previous = "PREVIOUS=byte-exact\n";
    const secret = "SESSION_SECRET=raw-secret-residue-sentinel\n";
    const previousReference = seedPersistedEnvironment(root, previous);
    const dependencies: Record<string, unknown> = {
      randomNameBytes: () => Buffer.alloc(16, failure === "short-write" ? 0x62 : failure === "sync" ? 0x63 : 0x64),
    };
    if (failure === "short-write") dependencies.write = () => 3;
    if (failure === "sync") {
      let calls = 0;
      dependencies.sync = (descriptor: number) => {
        calls += 1;
        if (calls === 1) throw new Error("environment-sync-sentinel");
        return fsyncSync(descriptor);
      };
    }
    if (failure === "rename") dependencies.rename = () => { throw new Error("environment-rename-sentinel"); };

    expect(() => requiredPersist()(root, secret, dependencies as PersistenceDependencies))
      .toThrow(/fixture environment|publish|secure|cleanup/i);
    expect(readFileSync(destination)).toEqual(previousReference);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(previous);
    const byte = failure === "short-write" ? 0x62 : failure === "sync" ? 0x63 : 0x64;
    const generation = join(root, ".artifacts", "music-environment-generations", `generation-${Buffer.alloc(16, byte).toString("hex")}`);
    expect(!existsSync(generation) || readFileSync(generation, "utf8") === "").toBe(true);
    expect(readdirSync(root).filter((name) => name.endsWith(".tmp")).every((name) => !readFileSync(join(root, name), "utf8").includes("raw-secret-residue-sentinel"))).toBe(true);
  });

  it.each(["close", "directory-sync"] as const)("finishes %s before commit and preserves the prior environment on failure", (failure) => {
    // Production break caught: close/directory durability runs after rename,
    // so an injected failure truncates the newly published destination and
    // has already destroyed the byte-exact prior environment.
    const root = fixtureRoot();
    const destination = join(root, ".env.music.test");
    const previous = "PREVIOUS=byte-exact\n";
    const secret = "SESSION_SECRET=must-remain-unpublished\n";
    const previousReference = seedPersistedEnvironment(root, previous);
    const before = lstatSync(destination);
    let closeCalls = 0;
    const dependencies: PersistenceDependencies = {
      randomNameBytes: () => Buffer.alloc(16, failure === "close" ? 0x68 : 0x69),
    };
    if (failure === "close") {
      dependencies.close = (descriptor) => {
        closeCalls += 1;
        if (closeCalls === 1) throw new Error("environment-close-sentinel");
        return closeSync(descriptor);
      };
    } else {
      dependencies.syncDirectory = () => { throw new Error("environment-directory-sync-sentinel"); };
    }

    expect(() => requiredPersist()(root, secret, dependencies)).toThrow(/fixture environment|publish|cleanup/i);
    const after = lstatSync(destination);
    expect(readFileSync(destination)).toEqual(previousReference);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(previous);
    expect({ dev: after.dev, ino: after.ino, mode: after.mode }).toEqual({ dev: before.dev, ino: before.ino, mode: before.mode });
    const byte = failure === "close" ? 0x68 : 0x69;
    const generation = join(root, ".artifacts", "music-environment-generations", `generation-${Buffer.alloc(16, byte).toString("hex")}`);
    expect(readFileSync(generation, "utf8")).toBe("");
  });

  it("validates the opened temporary inode before commit and never publishes or mutates an attacker replacement", () => {
    // Production break caught: final temporary-path validation happens only
    // after rename, when the prior destination has already been replaced.
    const root = fixtureRoot();
    const destination = join(root, ".env.music.test");
    const previous = "PREVIOUS=byte-exact\n";
    const temporaryName = `.env.music.test.reference-${Buffer.alloc(16, 0x6a).toString("hex")}.tmp`;
    const temporary = join(root, temporaryName);
    const displaced = join(root, "opened-temp-displaced-by-attacker");
    seedPersistedEnvironment(root, previous);

    expect(() => requiredPersist()(root, "SESSION_SECRET=opened-secret-sentinel\n", {
      randomNameBytes: () => Buffer.alloc(16, 0x6a),
      beforePublish: () => {
        renameSync(temporary, displaced);
        writeFileSync(temporary, "attacker-replacement-must-not-change", { mode: 0o640 });
      },
    })).toThrow(/fixture environment|publish|cleanup/i);

    expect(readFileSync(destination, "utf8")).toBe("attacker-replacement-must-not-change");
    expect(readFileSync(displaced, "utf8")).toMatch(/^music-fixture-env\/v1\n/);
    const generation = join(root, ".artifacts", "music-environment-generations", `generation-${Buffer.alloc(16, 0x6a).toString("hex")}`);
    expect(readFileSync(generation, "utf8")).toBe("");
  });

  it("never publishes a secret-bearing source path swapped after final descriptor validation", () => {
    // Production break caught: syncDirectory is the last injected operation
    // before pathname rename, so a Windows source swap publishes attacker
    // content and strands the genuine secret-bearing inode.
    const root = fixtureRoot();
    const destination = join(root, ".env.music.test");
    const previous = "PREVIOUS=byte-exact\n";
    const generation = join(root, ".artifacts", "music-environment-generations", `generation-${Buffer.alloc(16, 0x6d).toString("hex")}`);
    const displaced = join(root, "reviewer-displaced-secret");
    const previousReference = seedPersistedEnvironment(root, previous);

    expect(() => requiredPersist()(root, "SESSION_SECRET=reviewer-secret-sentinel\n", {
      randomNameBytes: () => Buffer.alloc(16, 0x6d),
      syncDirectory: (directory) => {
        if (directory !== join(root, ".artifacts", "music-environment-generations")) return;
        renameSync(generation, displaced);
        writeFileSync(generation, "ATTACKER=published", { mode: 0o666 });
      },
    })).toThrow(/fixture environment|publish|cleanup/i);
    expect(readFileSync(destination)).toEqual(previousReference);
    expect(readFileSync(generation, "utf8")).toBe("ATTACKER=published");
    expect(readFileSync(displaced, "utf8")).toBe("");
  });

  it("publishes only a nonsecret generation reference and reads the generation through guarded authority", () => {
    // Production break caught: `.env.music.test` is itself the renamed secret
    // payload and Docker later reopens it through --env-file.
    const root = fixtureRoot();
    const contents = "SESSION_SECRET=reference-secret-sentinel\nMUSIC_MODE=fixture\n";
    const readGeneration = (fixtureSecrets as unknown as {
      readFixtureMusicEnvironment?: (repositoryRoot: string) => string;
    }).readFixtureMusicEnvironment;
    expect(readGeneration, "guarded generation reader is required").toBeTypeOf("function");
    const reference = requiredPersist()(root, contents, {
      randomNameBytes: () => Buffer.alloc(16, 0x6e),
    });

    expect(reference).toBe(join(root, ".env.music.test"));
    expect(readFileSync(reference, "utf8")).toMatch(/^music-fixture-env\/v1\n/);
    expect(readFileSync(reference, "utf8")).not.toContain("reference-secret-sentinel");
    expect(readGeneration!(root)).toBe(contents);
  });

  it("treats an observed completed atomic rename as committed and restarts deterministically", () => {
    // Production break caught: a rename wrapper that reports uncertainty
    // after committing routes the published destination through temp erasure.
    const root = fixtureRoot();
    const destination = join(root, ".env.music.test");
    const first = "SESSION_SECRET=first-committed-value\n";
    const second = "SESSION_SECRET=restart-value\n";
    seedPersistedEnvironment(root);

    const result = requiredPersist()(root, first, {
      randomNameBytes: () => Buffer.alloc(16, 0x6b),
      rename: (source, target) => {
        renameSync(source, target);
        throw new Error("rename-result-uncertain-after-commit");
      },
    });
    expect(result).toBe(destination);
    expect((fixtureSecrets as unknown as { readFixtureMusicEnvironment: (root: string) => string }).readFixtureMusicEnvironment(root)).toBe(first);
    expect(readdirSync(root).filter((name) => name.endsWith(".tmp"))).toHaveLength(0);

    expect(requiredPersist()(root, second, {
      randomNameBytes: () => Buffer.alloc(16, 0x6c),
    })).toBe(destination);
    expect((fixtureSecrets as unknown as { readFixtureMusicEnvironment: (root: string) => string }).readFixtureMusicEnvironment(root)).toBe(second);
    expect(readdirSync(root).filter((name) => name.endsWith(".tmp"))).toHaveLength(0);
  });

  it("rejects an ancestor swap before publish without mutating the outside target or prior environment", () => {
    // Production break caught: pathname rename follows a swapped ancestor
    // after the temp descriptor was validated.
    const container = fixtureRoot();
    const root = join(container, "repo");
    const moved = join(container, "repo-owned");
    const outside = join(container, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    const previousReference = seedPersistedEnvironment(root);
    writeFileSync(join(outside, ".env.music.test"), "outside-must-not-change", { mode: 0o640 });
    let swapped = false;
    let swapBlocked = false;
    try {
      expect(() => requiredPersist()(root, "SESSION_SECRET=new-secret-sentinel\n", {
        randomNameBytes: () => Buffer.alloc(16, 0x65),
        beforePublish: () => {
          try {
            renameSync(root, moved);
            symlinkSync(outside, root, "junction");
            swapped = true;
          } catch (error) {
            if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
            swapBlocked = true;
            throw error;
          }
        },
      })).toThrow(/fixture environment|publish|secure/i);
      expect(swapped || swapBlocked).toBe(true);
      expect(readFileSync(join(outside, ".env.music.test"), "utf8")).toBe("outside-must-not-change");
      const ownedRoot = swapBlocked ? root : moved;
      expect(readFileSync(join(ownedRoot, ".env.music.test"))).toEqual(previousReference);
      const generation = join(ownedRoot, ".artifacts", "music-environment-generations", `generation-${Buffer.alloc(16, 0x65).toString("hex")}`);
      expect(readFileSync(generation, "utf8")).toBe("");
    } finally {
      if (swapped) unlinkSync(root);
    }
  });

  it("publishes a complete mode-0600 environment through a fresh exclusive descriptor", () => {
    // Production break caught: bootstrap writes a default-mode path-following
    // temporary environment instead of an exclusively opened descriptor.
    const root = fixtureRoot();
    const contents = "SESSION_SECRET=complete-secret\nCOOKIE_SECRET=complete-cookie\n";
    const destination = requiredPersist()(root, contents, {
      randomNameBytes: () => Buffer.alloc(16, 0x66),
    });
    expect(destination).toBe(join(root, ".env.music.test"));
    expect(readFileSync(destination, "utf8")).toMatch(/^music-fixture-env\/v1\n/);
    expect(readFileSync(destination, "utf8")).not.toContain("complete-secret");
    expect((fixtureSecrets as unknown as { readFixtureMusicEnvironment: (root: string) => string }).readFixtureMusicEnvironment(root)).toBe(contents);
    const generation = join(root, ".artifacts", "music-environment-generations", `generation-${Buffer.alloc(16, 0x66).toString("hex")}`);
    if (process.platform !== "win32") expect(statSync(generation).mode & 0o777).toBe(0o600);
    expect(readdirSync(root).filter((name) => name.endsWith(".tmp"))).toHaveLength(0);
  });

  it("surfaces failed environment erasure and refuses unauthenticated aggregate retry", () => {
    // Production break caught: a failed pre-pointer generation is treated as
    // cleanup authority even though no supported pointer authenticates it.
    const root = fixtureRoot();
    const targetId = `generation-${Buffer.alloc(16, 0x67).toString("hex")}`;
    expect(() => requiredPersist()(root, "SESSION_SECRET=raw-secret-residue-sentinel\n", {
      randomNameBytes: () => Buffer.alloc(16, 0x67),
      write: ((descriptor: number, buffer: Uint8Array) => writeSync(descriptor, buffer, 0, 3, 0)) as typeof writeSync,
      truncate: () => { throw new Error("environment-erase-sentinel"); },
    })).toThrow(expect.objectContaining({
      name: "FixtureSecretCleanupError",
      code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED",
      targetId,
    }));
    const target = join(root, ".artifacts", "music-environment-generations", targetId);
    expect(lstatSync(target).size).toBe(3);

    const beforeRetry = readFileSync(target);
    expect(() => cleanupAllFixtureMusicTokenSecrets(root)).toThrow(expect.objectContaining({
      code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED",
      targetId: "aggregate-authority",
    }));
    expect(readFileSync(target)).toEqual(beforeRetry);
    expect(() => cleanupAllFixtureMusicTokenSecrets(root)).toThrow(expect.objectContaining({
      code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED",
      targetId: "aggregate-authority",
    }));
    expect(readFileSync(target)).toEqual(beforeRetry);
  });

  it("rotates generations, erases the previous authority, and fails closed on reader races", () => {
    const root = fixtureRoot();
    const reader = (fixtureSecrets as unknown as {
      readFixtureMusicEnvironment: (root: string, dependencies?: { afterReferenceRead?: () => void; afterGenerationOpen?: () => void }) => string;
    }).readFixtureMusicEnvironment;
    requiredPersist()(root, "SESSION_SECRET=first\n", { randomNameBytes: () => Buffer.alloc(16, 0x71) });
    requiredPersist()(root, "SESSION_SECRET=second\n", { randomNameBytes: () => Buffer.alloc(16, 0x72) });
    const first = join(root, ".artifacts", "music-environment-generations", `generation-${Buffer.alloc(16, 0x71).toString("hex")}`);
    const second = join(root, ".artifacts", "music-environment-generations", `generation-${Buffer.alloc(16, 0x72).toString("hex")}`);
    expect(readFileSync(first, "utf8")).toBe("");
    expect(reader(root)).toBe("SESSION_SECRET=second\n");

    const displaced = join(root, "displaced-current-generation");
    expect(() => reader(root, { afterGenerationOpen: () => {
      renameSync(second, displaced);
      writeFileSync(second, "x".repeat("SESSION_SECRET=second\n".length), { mode: 0o600 });
    } })).toThrow(/fixture environment|publish/i);
    expect(readFileSync(second, "utf8")).toBe("x".repeat("SESSION_SECRET=second\n".length));
    expect(readFileSync(displaced, "utf8")).toBe("SESSION_SECRET=second\n");
  });

  it("fails cleanup closed when the referenced generation was attacker-replaced", () => {
    const root = fixtureRoot();
    requiredPersist()(root, "SESSION_SECRET=owned-current\n", {
      randomNameBytes: () => Buffer.alloc(16, 0x73),
    });
    const generation = join(root, ".artifacts", "music-environment-generations", `generation-${Buffer.alloc(16, 0x73).toString("hex")}`);
    const displaced = join(root, "displaced-owned-generation");
    const attacker = "ATTACKER_ENV=unchanged_value\n";
    expect(Buffer.byteLength(attacker)).toBe(Buffer.byteLength("SESSION_SECRET=owned-current\n"));
    renameSync(generation, displaced);
    writeFileSync(generation, attacker, { mode: 0o600 });

    expect(() => cleanupAllFixtureMusicTokenSecrets(root)).toThrow(expect.objectContaining({
      code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED",
      targetId: basename(generation),
    }));
    expect(readFileSync(generation, "utf8")).toBe(attacker);
    expect(readFileSync(displaced, "utf8")).toBe("SESSION_SECRET=owned-current\n");
  });

  it("fails a pointer swap closed without reading or mutating the attacker generation", () => {
    const root = fixtureRoot();
    const reader = (fixtureSecrets as unknown as {
      readFixtureMusicEnvironment: (root: string, dependencies?: { afterReferenceRead?: () => void }) => string;
    }).readFixtureMusicEnvironment;
    requiredPersist()(root, "SESSION_SECRET=owned-current\n", {
      randomNameBytes: () => Buffer.alloc(16, 0x74),
    });
    const reference = join(root, ".env.music.test");
    const displacedReference = join(root, "displaced-owned-reference");
    const attackerName = `generation-${Buffer.alloc(16, 0x75).toString("hex")}`;
    const attackerGeneration = join(root, ".artifacts", "music-environment-generations", attackerName);
    const attacker = "ATTACKER_ENV=must_not_be_read\n";
    const attackerDigest = createHash("sha256").update(attacker).digest("hex");
    writeFileSync(attackerGeneration, attacker, { mode: 0o600 });

    expect(() => reader(root, { afterReferenceRead: () => {
      renameSync(reference, displacedReference);
      writeFileSync(reference, `music-fixture-env/v1\ngeneration=${attackerName}\nsha256=${attackerDigest}\nsize=${Buffer.byteLength(attacker)}\n`, { mode: 0o600 });
    } })).toThrow(/fixture environment|publish/i);
    expect(readFileSync(attackerGeneration, "utf8")).toBe(attacker);
    expect(readFileSync(reference, "utf8")).toContain(attackerName);
  });

  it("detects a same-inode pointer rewrite during guarded resolution", () => {
    const root = fixtureRoot();
    const reader = (fixtureSecrets as unknown as {
      readFixtureMusicEnvironment: (root: string, dependencies?: { afterReferenceRead?: () => void }) => string;
    }).readFixtureMusicEnvironment;
    requiredPersist()(root, "SESSION_SECRET=owned-current\n", {
      randomNameBytes: () => Buffer.alloc(16, 0x76),
    });
    const reference = join(root, ".env.music.test");
    const attackerName = `generation-${Buffer.alloc(16, 0x77).toString("hex")}`;
    const attacker = "ATTACKER_ENV=must_not_be_read\n";
    const attackerDigest = createHash("sha256").update(attacker).digest("hex");
    const attackerReference = `music-fixture-env/v1\ngeneration=${attackerName}\nsha256=${attackerDigest}\nsize=${Buffer.byteLength(attacker)}\n`;
    expect(Buffer.byteLength(attackerReference)).toBe(lstatSync(reference).size);

    expect(() => reader(root, { afterReferenceRead: () => {
      const descriptor = openSync(reference, constants.O_WRONLY);
      try { expect(writeSync(descriptor, Buffer.from(attackerReference), 0, Buffer.byteLength(attackerReference), 0)).toBe(Buffer.byteLength(attackerReference)); }
      finally { closeSync(descriptor); }
    } })).toThrow(/fixture environment|publish/i);
  });

  it("keeps the committed generation readable when a postcommit callback fails", () => {
    const root = fixtureRoot();
    requiredPersist()(root, "SESSION_SECRET=prior-authority\n", {
      randomNameBytes: () => Buffer.alloc(16, 0x78),
    });
    const current = "SESSION_SECRET=committed-authority\n";
    expect(() => requiredPersist()(root, current, {
      randomNameBytes: () => Buffer.alloc(16, 0x79),
      afterReferenceCommit: () => { throw new Error("postcommit-callback-sentinel"); },
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));

    expect((fixtureSecrets as unknown as { readFixtureMusicEnvironment: (root: string) => string }).readFixtureMusicEnvironment(root)).toBe(current);
    const generation = join(root, ".artifacts", "music-environment-generations", `generation-${Buffer.alloc(16, 0x79).toString("hex")}`);
    expect(readFileSync(generation, "utf8")).toBe(current);
  });

  it("binds postcommit prior-generation cleanup to the captured inode and digest", () => {
    const root = fixtureRoot();
    const prior = "SESSION_SECRET=prior-authority\n";
    const current = "SESSION_SECRET=current-authority\n";
    requiredPersist()(root, prior, { randomNameBytes: () => Buffer.alloc(16, 0x7a) });
    const priorGeneration = join(root, ".artifacts", "music-environment-generations", `generation-${Buffer.alloc(16, 0x7a).toString("hex")}`);
    const displaced = join(root, "displaced-prior-generation");
    const attacker = "ATTACKER_ENV=do_not_mutate____\n";
    expect(Buffer.byteLength(attacker)).toBe(Buffer.byteLength(prior));

    expect(() => requiredPersist()(root, current, {
      randomNameBytes: () => Buffer.alloc(16, 0x7b),
      afterReferenceCommit: () => {
        renameSync(priorGeneration, displaced);
        writeFileSync(priorGeneration, attacker, { mode: 0o600 });
      },
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));
    expect((fixtureSecrets as unknown as { readFixtureMusicEnvironment: (root: string) => string }).readFixtureMusicEnvironment(root)).toBe(current);
    expect(readFileSync(priorGeneration, "utf8")).toBe(attacker);
    expect(readFileSync(displaced, "utf8")).toBe(prior);
  });
});

describe("fixture bundle rotation transaction", () => {
  type RotationDependencies = fixtureSecrets.FixtureAuthorityRotationDependencies;
  const rotate = fixtureSecrets.rotateFixtureMusicAuthority;
  const recover = fixtureSecrets.recoverFixtureAuthorityRotations;

  function authorityWithSeed(seed: number): RotationDependencies {
    return {
      operationIdBytes: () => Buffer.alloc(16, seed),
      credentialSecretBytes: (index) => Buffer.alloc(32, seed + index),
      // Unit tests exercise durable phase semantics without paying a PowerShell
      // process cost at every barrier; the integration test below invokes the
      // checked-in Windows write-through helper itself.
      durableReplace: (source, destination) => renameSync(source, destination),
    };
  }

  function rotationLeafId(seed: number, role: "token" | "migrator" | "runtime" | "environment"): string {
    const operationId = Buffer.alloc(16, seed).toString("hex");
    return createHash("sha256")
      .update(`music-fixture-authority/v1\0${operationId}\0${role}`)
      .digest("hex")
      .slice(0, 32);
  }

  function rotationCredentialPath(root: string, seed: number, role: "token" | "migrator" | "runtime"): string {
    return join(root, ".artifacts", "music-token-secrets", `current-${rotationLeafId(seed, role)}`);
  }

  function rotationEnvironmentPath(root: string, seed: number): string {
    return join(root, ".artifacts", "music-environment-generations", `generation-${rotationLeafId(seed, "environment")}`);
  }

  function environment(root: string, paths: fixtureSecrets.FixtureAuthorityPaths, label: string): string {
    const fixturePath = (path: string) => `./${relative(root, path).replace(/\\/g, "/")}`;
    return `MUSIC_TOKEN_SECRET_FILE_HOST=${fixturePath(paths.tokenPath)}\nMUSIC_DB_MIGRATOR_SECRET_FILE_HOST=${fixturePath(paths.migratorPasswordPath)}\nMUSIC_DB_RUNTIME_SECRET_FILE_HOST=${fixturePath(paths.runtimePasswordPath)}\nROTATION_LABEL=${label}\n`;
  }

  function credentialPaths(root: string, contents: string): string[] {
    const values = Object.fromEntries(contents.trim().split(/\r?\n/).map((line) => line.split("=", 2)));
    return ["MUSIC_TOKEN_SECRET_FILE_HOST", "MUSIC_DB_MIGRATOR_SECRET_FILE_HOST", "MUSIC_DB_RUNTIME_SECRET_FILE_HOST"]
      .map((key) => resolve(root, values[key]!));
  }

  it("rejects fixture publication-key reuse before writing credentials, journal, or environment", () => {
    const root = fixtureRoot();
    const publication = "fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI";
    expect(() => rotate(root, (paths) => `${environment(root, paths, "publication-alias")}
MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY=${publication}
SESSION_SECRET=dedicated-fixture-session
COOKIE_SECRET=dedicated-fixture-cookie
STRAPI_ACCESS_TOKEN=dedicated-fixture-access
`, {
      ...authorityWithSeed(0x18),
      credentialSecretBytes: (index) => index === 0 ? Buffer.from(publication, "base64url") : Buffer.alloc(32, 0x40 + index),
    })).toThrow(/fixture environment|publication|authority/i);
    expect(existsSync(join(root, ".env.music.test"))).toBe(false);
    expect(readdirSync(join(root, ".artifacts", "music-token-secrets"))).toEqual([]);
    expect(existsSync(join(root, ".artifacts", "music-rotation-journals"))).toBe(false);
  });

  function replacePointerWithUnsupportedAuthority(root: string, kind: "raw" | "malformed"): Buffer {
    const current = fixtureSecrets.readFixtureMusicEnvironment(root);
    const pointer = kind === "raw"
      ? Buffer.from(`${current}RAW_AGGREGATE_CLEANUP_SENTINEL=must-not-be-reflected\n`)
      : Buffer.from("music-fixture-env/v1\ngeneration=not-authority\nsha256=MALFORMED_AGGREGATE_CLEANUP_SENTINEL\nsize=nope\n");
    writeFileSync(join(root, ".env.music.test"), pointer, { mode: 0o600 });
    writeFileSync(join(root, `.env.music.test.${"a".repeat(32)}.tmp`), "temporary-secret-must-remain", { mode: 0o600 });
    writeFileSync(join(root, "unrelated-byte-sentinel"), "unrelated-must-remain", { mode: 0o600 });
    return pointer;
  }

  it.each(["raw", "malformed"] as const)(
    "refuses direct aggregate cleanup for %s unsupported authority before the first erase",
    (kind) => {
      // Production break caught: aggregate cleanup catches the invalid pointer
      // and proceeds to erase grammar-matching credentials and generations.
      const root = fixtureRoot();
      rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(kind === "raw" ? 0x13 : 0x14));
      replacePointerWithUnsupportedAuthority(root, kind);
      const before = snapshotFixtureTree(root);

      expect(() => cleanupAllFixtureMusicTokenSecrets(root)).toThrow(expect.objectContaining({
        name: "FixtureUnsupportedLegacyEnvironmentError",
        code: "MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED",
      }));
      expect(snapshotFixtureTree(root)).toEqual(before);
    },
  );

  it.each(["raw", "malformed"] as const)(
    "refuses aggregate wrapper entry for %s unsupported authority before running the action",
    async (kind) => {
      // Production break caught: the wrapper runs caller work and reaches its
      // erasing finally block even though entry authority is unsupported.
      const root = fixtureRoot();
      rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(kind === "raw" ? 0x15 : 0x16));
      replacePointerWithUnsupportedAuthority(root, kind);
      const before = snapshotFixtureTree(root);
      let actionCalled = false;

      await expect(withAllFixtureMusicSecretsCleanup(root, async () => {
        actionCalled = true;
      })).rejects.toMatchObject({
        name: "FixtureUnsupportedLegacyEnvironmentError",
        code: "MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED",
      });
      expect(actionCalled).toBe(false);
      expect(snapshotFixtureTree(root)).toEqual(before);
    },
  );

  it("refuses wrapper cleanup when supported authority becomes raw inside the action", async () => {
    // Production break caught: a supported entry can be replaced with raw
    // bytes before finally, after which aggregate cleanup erases the bundle.
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x17));
    const directoriesBefore = snapshotFixtureTree(root);
    const raw = Buffer.from("RAW_WRAPPER_REPLACEMENT_SENTINEL=must-remain-byte-exact\n");

    await expect(withAllFixtureMusicSecretsCleanup(root, async () => {
      writeFileSync(join(root, ".env.music.test"), raw, { mode: 0o600 });
    })).rejects.toMatchObject({
      name: "FixtureUnsupportedLegacyEnvironmentError",
      code: "MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED",
    });
    const after = snapshotFixtureTree(root);
    expect(after[".env.music.test"]).toBe(raw.toString("base64"));
    expect(Object.fromEntries(Object.entries(after).filter(([path]) => path !== ".env.music.test")))
      .toEqual(Object.fromEntries(Object.entries(directoriesBefore).filter(([path]) => path !== ".env.music.test")));
  });

  it("authenticates the supported pointer and generation before running a wrapper action", async () => {
    // Production break caught: wrapper entry checks only pointer syntax, so a
    // replaced referenced generation still permits Docker/destructive work.
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x18));
    const pointer = readFileSync(join(root, ".env.music.test"), "utf8");
    const generationName = pointer.match(/generation=(generation-[a-f0-9]{32})/)![1]!;
    const generation = join(root, ".artifacts", "music-environment-generations", generationName);
    const displaced = join(root, "displaced-supported-generation");
    renameSync(generation, displaced);
    writeFileSync(generation, Buffer.alloc(lstatSync(displaced).size, 0x5c), { mode: 0o600 });
    const before = snapshotFixtureTree(root);
    let actionCalled = false;

    await expect(withAllFixtureMusicSecretsCleanup(root, async () => {
      actionCalled = true;
    })).rejects.toMatchObject({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED", targetId: generationName });
    expect(actionCalled).toBe(false);
    expect(snapshotFixtureTree(root)).toEqual(before);
  });

  type AggregateCleanupPhase = "credentials" | "other-generations" | "journals" | "temporaries" | "current-generation" | "pointer";
  type AggregateCleanupDependencies = {
    afterAuthenticated?: () => void;
    beforePhase?: (phase: AggregateCleanupPhase) => void;
    targetDependencies?: (phase: AggregateCleanupPhase, path: string) => {
      truncate?: (descriptor: number) => void;
      sync?: (descriptor: number) => void;
      close?: (descriptor: number) => void;
    };
  };
  const aggregateCleanup = cleanupAllFixtureMusicTokenSecrets as unknown as (
    root: string,
    dependencies?: AggregateCleanupDependencies,
  ) => void;
  const aggregateWrapper = withAllFixtureMusicSecretsCleanup as unknown as <T>(
    root: string,
    action: () => Promise<T>,
    dependencies?: AggregateCleanupDependencies,
  ) => Promise<T>;

  function populatedUnsupportedAggregateRoot(kind: "missing" | "tombstone"): string {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "populated"), authorityWithSeed(kind === "missing" ? 0x19 : 0x1a));
    writeFileSync(join(root, `.env.music.test.${"b".repeat(32)}.tmp`), "recognized-temporary-secret", { mode: 0o600 });
    if (kind === "missing") unlinkSync(join(root, ".env.music.test"));
    else writeFileSync(join(root, ".env.music.test"), Buffer.alloc(0), { mode: 0o600 });
    return root;
  }

  type RetiredFixtureAuthorityAttestation = {
    schemaVersion: "music-fixture-authority-attestation/v1";
    state: "absent" | "tombstone";
    safeToBootstrap: true;
    usableRecords: 0;
  };
  const attestRetiredFixtureMusicAuthority = (fixtureSecrets as unknown as {
    attestRetiredFixtureMusicAuthority: (root: string) => RetiredFixtureAuthorityAttestation;
  }).attestRetiredFixtureMusicAuthority;
  const withRetiredFixtureMusicAuthority = (fixtureSecrets as unknown as {
    withRetiredFixtureMusicAuthority: <T>(root: string, action: () => Promise<T>) => Promise<T>;
  }).withRetiredFixtureMusicAuthority;

  it.each(["missing", "tombstone"] as const)(
    "attests only a %s pointer with an all-zero recognized authority inventory",
    (kind) => {
      // Production break caught: bootstrap has no exact post-reset oracle, so a
      // retired pointer can be treated as safe without proving every recognized
      // authority target is absent or zero bytes.
      const root = fixtureRoot();
      const tokenDirectory = join(root, ".artifacts", "music-token-secrets");
      mkdirSync(tokenDirectory, { recursive: true });
      writeFileSync(join(tokenDirectory, `current-${"0".repeat(32)}`), Buffer.alloc(0), { mode: 0o600 });
      writeFileSync(join(root, `.env.music.test.${"1".repeat(32)}.tmp`), Buffer.alloc(0), { mode: 0o600 });
      if (kind === "tombstone") writeFileSync(join(root, ".env.music.test"), Buffer.alloc(0), { mode: 0o600 });

      expect(attestRetiredFixtureMusicAuthority(root)).toEqual({
        schemaVersion: "music-fixture-authority-attestation/v1",
        state: kind === "missing" ? "absent" : "tombstone",
        safeToBootstrap: true,
        usableRecords: 0,
      });
    },
  );

  it.each(["reference", "raw", "malformed", "missing-populated", "tombstone-populated"] as const)(
    "rejects the %s authority state instead of producing a bootstrap-safe record",
    (kind) => {
      const root = fixtureRoot();
      if (kind === "reference") {
        rotate(root, (paths) => environment(root, paths, "unsafe-reference"), authorityWithSeed(0x2a));
      } else if (kind === "raw") {
        writeFileSync(join(root, ".env.music.test"), "RAW_FIXTURE_AUTHORITY=must-never-be-retained\n", { mode: 0o600 });
      } else if (kind === "malformed") {
        writeFileSync(join(root, ".env.music.test"), "music-fixture-env/v1\ngeneration=bad\n", { mode: 0o600 });
      } else {
        const tokenDirectory = join(root, ".artifacts", "music-token-secrets");
        mkdirSync(tokenDirectory, { recursive: true });
        writeFileSync(join(tokenDirectory, `current-${"2".repeat(32)}`), "must-never-be-retained", { mode: 0o600 });
        if (kind === "tombstone-populated") writeFileSync(join(root, ".env.music.test"), Buffer.alloc(0), { mode: 0o600 });
      }

      expect(() => attestRetiredFixtureMusicAuthority(root)).toThrow();
    },
  );

  it("rejects a symlinked pointer without following its target", () => {
    const root = fixtureRoot();
    const outsideRoot = fixtureRoot();
    symlinkSync(outsideRoot, join(root, ".env.music.test"), "junction");

    expect(() => attestRetiredFixtureMusicAuthority(root)).toThrow();
  });

  it("rejects a symlinked recognized authority leaf instead of ignoring its filename", () => {
    const root = fixtureRoot();
    const outsideRoot = fixtureRoot();
    const tokenDirectory = join(root, ".artifacts", "music-token-secrets");
    mkdirSync(tokenDirectory, { recursive: true });
    symlinkSync(outsideRoot, join(tokenDirectory, `current-${"3".repeat(32)}`), "junction");

    expect(() => attestRetiredFixtureMusicAuthority(root)).toThrow();
  });

  it("retires only the authenticated fixture bundle and re-attests a tombstone before reset success", async () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "reset-retirement"), authorityWithSeed(0x2b));
    writeFileSync(join(root, "unrelated-byte-sentinel"), "must-remain-byte-exact", { mode: 0o600 });
    const calls: string[] = [];

    await expect(withRetiredFixtureMusicAuthority(root, async () => {
      calls.push("reset");
      return "reset-complete";
    })).resolves.toBe("reset-complete");

    calls.push(attestRetiredFixtureMusicAuthority(root).state);
    expect(calls).toEqual(["reset", "tombstone"]);
    expect(readFileSync(join(root, "unrelated-byte-sentinel"), "utf8")).toBe("must-remain-byte-exact");
    expect(Object.entries(snapshotFixtureTree(root))
      .filter(([path]) => path !== "unrelated-byte-sentinel")
      .every(([, bytes]) => bytes === "")).toBe(true);
  });

  it("runs the fixed-root attestation CLI with no caller-selected path and emits only the allowlisted schema", async () => {
    const root = fixtureRoot();
    writeFileSync(join(root, ".env.music.test"), Buffer.alloc(0), { mode: 0o600 });
    const stdout: string[] = [];
    const stderr: string[] = [];
    const cli = await import("../../../scripts/music-fixture-authority-attest");

    expect(cli.runFixtureAuthorityAttestation({
      arguments: [],
      repositoryRoot: root,
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    })).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout).toEqual([`${JSON.stringify({
      schemaVersion: "music-fixture-authority-attestation/v1",
      state: "tombstone",
      safeToBootstrap: true,
      usableRecords: 0,
    })}\n`]);
    expect(Object.keys(JSON.parse(stdout[0]!)).sort()).toEqual([
      "safeToBootstrap", "schemaVersion", "state", "usableRecords",
    ]);

    stdout.length = 0;
    expect(cli.runFixtureAuthorityAttestation({
      arguments: [root],
      repositoryRoot: root,
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    })).toBe(2);
    expect(stdout).toEqual([]);
    expect(stderr.at(-1)).toBe("Fixture authority attestation refused; invoke the fixed repository command with no arguments.\n");

    writeFileSync(join(root, ".env.music.test"), "RAW_AUTHORITY_VALUE=must-never-be-reflected\n", { mode: 0o600 });
    stderr.length = 0;
    expect(cli.runFixtureAuthorityAttestation({
      arguments: [],
      repositoryRoot: root,
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    })).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["Fixture authority attestation refused; state is not bootstrap-safe.\n"]);
    expect(stderr.join("")).not.toContain("must-never-be-reflected");

    const rootPackage = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = readFileSync(resolve(import.meta.dirname, "../../../scripts/music-fixture-authority-attest.ts"), "utf8");
    expect(rootPackage.scripts["music:fixture:authority:attest"])
      .toBe("tsx tunes/scripts/music-fixture-authority-attest.ts");
    expect(source).toContain('repositoryRoot: path.resolve(import.meta.dirname, "../..")');
    expect(source).toContain("arguments: process.argv.slice(2)");
  });

  it.each(["missing", "tombstone"] as const)(
    "refuses direct aggregate cleanup for a %s pointer with populated targets",
    (kind) => {
      // Production break caught: missing/zero pointer state is treated as
      // cleanup authority even though generated targets remain populated.
      const root = populatedUnsupportedAggregateRoot(kind);
      const before = snapshotFixtureTree(root);
      expect(() => aggregateCleanup(root)).toThrow(expect.objectContaining({
        code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED",
        targetId: "aggregate-authority",
      }));
      expect(snapshotFixtureTree(root)).toEqual(before);
    },
  );

  it.each(["missing", "tombstone"] as const)(
    "refuses aggregate wrapper action for a %s pointer with populated targets",
    async (kind) => {
      const root = populatedUnsupportedAggregateRoot(kind);
      const before = snapshotFixtureTree(root);
      let actionCalled = false;
      await expect(aggregateWrapper(root, async () => {
        actionCalled = true;
      })).rejects.toMatchObject({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED", targetId: "aggregate-authority" });
      expect(actionCalled).toBe(false);
      expect(snapshotFixtureTree(root)).toEqual(before);
    },
  );

  it.each([
    "after-authenticated",
    "credentials",
    "other-generations",
    "journals",
    "temporaries",
    "current-generation",
    "pointer",
  ] as const)("fails closed when the pointer is swapped at aggregate phase %s", (swapPhase) => {
    // Production break caught: closed authentication descriptors allow a
    // pathname replacement before or between destructive phases.
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "phase-swap"), authorityWithSeed(0x1b));
    writeFileSync(join(root, `.env.music.test.${"c".repeat(32)}.tmp`), "phase-temporary-secret", { mode: 0o600 });
    const pointer = join(root, ".env.music.test");
    const displaced = join(root, "displaced-phase-pointer");
    const attacker = Buffer.from("RAW_PHASE_SWAP_SENTINEL=must-not-be-erased\n");
    let swapped = false;
    const swap = () => {
      if (swapped) return;
      swapped = true;
      renameSync(pointer, displaced);
      writeFileSync(pointer, attacker, { mode: 0o600 });
    };

    expect(() => aggregateCleanup(root, {
      afterAuthenticated: swapPhase === "after-authenticated" ? swap : undefined,
      beforePhase: (phase) => { if (phase === swapPhase) swap(); },
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));
    expect(swapped).toBe(true);
    expect(readFileSync(pointer)).toEqual(attacker);
    expect(lstatSync(displaced).size).toBeGreaterThan(0);
  }, fixtureCleanupContentionTimeoutMs);

  it("rejects an added recognized target after authentication before erasing the original bundle", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "added-target"), authorityWithSeed(0x24));
    const before = snapshotFixtureTree(root);
    const added = join(root, ".artifacts", "music-token-secrets", `current-${"d".repeat(32)}`);
    const attacker = Buffer.from("ADDED_TARGET_SENTINEL");

    expect(() => aggregateCleanup(root, {
      afterAuthenticated: () => writeFileSync(added, attacker, { mode: 0o600 }),
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));
    expect(readFileSync(added)).toEqual(attacker);
    const after = snapshotFixtureTree(root);
    for (const [path, bytes] of Object.entries(before)) expect(after[path]).toBe(bytes);
  });

  it("rejects a missing recognized target after authentication without touching its displaced bytes", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "missing-target"), authorityWithSeed(0x25));
    const before = snapshotFixtureTree(root);
    const generationDirectory = join(root, ".artifacts", "music-environment-generations");
    const generationName = readdirSync(generationDirectory).find((name) => name.startsWith("generation-"))!;
    const generation = join(generationDirectory, generationName);
    const displaced = join(root, "displaced-generation-target");

    expect(() => aggregateCleanup(root, {
      afterAuthenticated: () => renameSync(generation, displaced),
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));
    expect(readFileSync(displaced).toString("base64")).toBe(before[`.artifacts/music-environment-generations/${generationName}`]);
    const after = snapshotFixtureTree(root);
    for (const [path, bytes] of Object.entries(before)) {
      if (path !== `.artifacts/music-environment-generations/${generationName}`) expect(after[path]).toBe(bytes);
    }
  });

  it("makes two consecutive direct cleanups of supported authority idempotent", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "idempotent-direct"), authorityWithSeed(0x1c));
    aggregateCleanup(root);
    expect(() => aggregateCleanup(root)).not.toThrow();
    expect(lstatSync(join(root, ".env.music.test")).size).toBe(0);
    expect(Object.entries(snapshotFixtureTree(root)).filter(([path, bytes]) =>
      (path === ".env.music.test" || path.includes("music-token-secrets/") || path.includes("music-environment-generations/") || path.includes("music-rotation-journals/"))
      && Buffer.from(bytes, "base64").length > 0)).toEqual([]);
  });

  it("runs two consecutive wrapper actions after one supported teardown", async () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "idempotent-wrapper"), authorityWithSeed(0x1d));
    let actions = 0;
    await aggregateWrapper(root, async () => { actions += 1; });
    await aggregateWrapper(root, async () => { actions += 1; });
    expect(actions).toBe(2);
  });

  it("propagates a first action failure after cleanup and reaches the retry action", async () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "action-retry"), authorityWithSeed(0x1e));
    let actions = 0;
    await expect(aggregateWrapper(root, async () => {
      actions += 1;
      throw new Error("first-action-sentinel");
    })).rejects.toThrow("first-action-sentinel");
    await expect(aggregateWrapper(root, async () => { actions += 1; return "retried"; })).resolves.toBe("retried");
    expect(actions).toBe(2);
  });

  it("returns the typed cleanup failure when both action and cleanup fail without exposing the action", async () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "combined-failure"), authorityWithSeed(0x26));
    const promise = aggregateWrapper(root, async () => {
      throw new Error("RAW_ACTION_FAILURE_SENTINEL");
    }, {
      targetDependencies: (phase) => phase === "credentials"
        ? { truncate: () => { throw new Error("RAW_CLEANUP_FAILURE_SENTINEL"); } }
        : {},
    });

    const error = await promise.catch((caught: unknown) => caught) as Error & { code?: string; cause?: unknown };
    expect(error).toMatchObject({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" });
    expect(error.message).not.toContain("RAW_ACTION_FAILURE_SENTINEL");
    expect(error.message).not.toContain("RAW_CLEANUP_FAILURE_SENTINEL");
    expect(error.cause).toEqual({ name: "fixture-action-failed" });
    expect(Object.keys(error)).not.toContain("cause");
  });

  it.each(["truncate", "sync", "close"] as const)(
    "fails closed on current-generation %s retirement failure",
    (failure) => {
      const root = fixtureRoot();
      rotate(root, (paths) => environment(root, paths, "generation-failure"), authorityWithSeed(failure === "truncate" ? 0x21 : failure === "sync" ? 0x22 : 0x23));
      const pointer = readFileSync(join(root, ".env.music.test"));
      const dependencies = failure === "truncate"
        ? { truncate: () => { throw new Error("generation-truncate-sentinel"); } }
        : failure === "sync"
          ? { sync: () => { throw new Error("generation-sync-sentinel"); } }
          : { close: (descriptor: number) => { closeSync(descriptor); throw new Error("generation-close-sentinel"); } };

      expect(() => aggregateCleanup(root, {
        targetDependencies: (phase) => phase === "current-generation" ? dependencies : {},
      })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));
      expect(readFileSync(join(root, ".env.music.test"))).toEqual(pointer);
      const afterFailure = snapshotFixtureTree(root);
      expect(() => aggregateCleanup(root)).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));
      expect(snapshotFixtureTree(root)).toEqual(afterFailure);
    },
  );

  function authoritySnapshot(root: string, path: string, kind: "credential" | "environment"): Record<string, unknown> {
    const directory = lstatSync(resolve(path, ".."), { bigint: true });
    const file = lstatSync(path, { bigint: true });
    const bytes = readFileSync(path);
    return {
      kind,
      relativePath: relative(root, path).replace(/\\/g, "/"),
      directoryDev: directory.dev.toString(),
      directoryIno: directory.ino.toString(),
      fileDev: file.dev.toString(),
      fileIno: file.ino.toString(),
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  function activeJournalPath(root: string): string {
    const directory = join(root, ".artifacts", "music-rotation-journals");
    const name = readdirSync(directory).find((candidate) => fixtureRotationJournalForTest(candidate)
      && lstatSync(join(directory, candidate)).size > 0);
    if (!name) throw new Error("active fixture rotation journal is required");
    return join(directory, name);
  }

  it.each(["honest", "malicious"] as const)(
    "rejects an unsupported %s raw fixture environment before authority mutation",
    (kind) => {
      const root = fixtureRoot();
      const tokenDirectory = join(root, ".artifacts", "music-token-secrets");
      mkdirSync(tokenDirectory, { recursive: true });
      const paths: fixtureSecrets.FixtureAuthorityPaths = {
        tokenPath: join(tokenDirectory, `current-${"1".repeat(32)}`),
        migratorPasswordPath: join(tokenDirectory, `current-${"2".repeat(32)}`),
        runtimePasswordPath: join(tokenDirectory, `current-${"3".repeat(32)}`),
      };
      const credentialBytes = Object.values(paths).map((path, index) => {
        const bytes = Buffer.from(`raw-credential-secret-${kind}-${index}`);
        writeFileSync(path, bytes, { mode: 0o600 });
        return bytes;
      });
      const raw = kind === "honest"
        ? Buffer.from(environment(root, paths, "raw-legacy-secret-sentinel"))
        : Buffer.from("MALICIOUS_RAW_SECRET=must-not-be-reflected\n../outside=must-not-be-read\n");
      const pointer = join(root, ".env.music.test");
      writeFileSync(pointer, raw, { mode: 0o600 });
      const rootBefore = readdirSync(root).sort();
      const tokenNamesBefore = readdirSync(tokenDirectory).sort();
      let buildEnvironmentCalled = false;
      let thrown: unknown;

      try {
        rotate(root, (candidatePaths) => {
          buildEnvironmentCalled = true;
          return environment(root, candidatePaths, "must-not-build");
        }, authorityWithSeed(kind === "honest" ? 0x41 : 0x42));
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toMatchObject({
        name: "FixtureUnsupportedLegacyEnvironmentError",
        code: "MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED",
      });
      expect(String((thrown as Error).message)).toContain("MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED");
      expect(String((thrown as Error).message)).toContain("discard");
      expect(String((thrown as Error).message)).not.toContain("cleanup/re-bootstrap");
      expect(String((thrown as Error).message)).not.toContain("raw-legacy-secret-sentinel");
      expect(String((thrown as Error).message)).not.toContain("must-not-be-reflected");
      expect(buildEnvironmentCalled).toBe(false);
      const persist = (fixtureSecrets as unknown as {
        persistFixtureMusicEnvironment: (root: string, contents: string) => string;
      }).persistFixtureMusicEnvironment;
      expect(() => persist(root, "SESSION_SECRET=must-not-persist\n")).toThrow(expect.objectContaining({
        code: "MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED",
      }));
      expect(readFileSync(pointer)).toEqual(raw);
      expect(Object.values(paths).map((path) => readFileSync(path))).toEqual(credentialBytes);
      expect(readdirSync(root).sort()).toEqual(rootBefore);
      expect(readdirSync(tokenDirectory).sort()).toEqual(tokenNamesBefore);
    },
  );

  it("contains no raw legacy selection, conversion, or upgrade hook", () => {
    const source = readFileSync(resolve("scripts/music-fixture-secret.ts"), "utf8");
    expect(source).not.toMatch(/legacyUpgrade|expectedLegacyAuthority|afterLegacyFinalValidation|cleanupMatchingLegacyUpgradeResidue|cleanupUnsupportedFixtureEnvironmentForRebootstrap|music-fixture-cleanup/);
    expect(source).not.toContain("music-fixture-legacy-upgrade");
  });

  it("preserves the complete prior bundle when replacement credential creation fails", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x21));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const priorEnvironment = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, priorEnvironment);
    const priorBytes = priorCredentials.map((path) => readFileSync(path));
    const candidateFirst = rotationCredentialPath(root, 0x31, "token");

    expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
      ...authorityWithSeed(0x31),
      beforeCandidateCreate: (_kind, index) => {
        if (index === 1) throw new Error("replacement-credential-write-sentinel");
      },
    })).toThrow(/replacement-credential-write-sentinel/);
    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(priorEnvironment);
    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
    expect(lstatSync(candidateFirst).size).toBe(0);
  });

  it("retires only the exact prior bundle after a successful pointer commit", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x41));
    const priorEnvironment = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, priorEnvironment);
    const priorReference = readFileSync(join(root, ".env.music.test"), "utf8");
    const priorGeneration = join(root, ".artifacts", "music-environment-generations", priorReference.match(/generation=(generation-[a-f0-9]{32})/)![1]!);

    rotate(root, (paths) => environment(root, paths, "current"), authorityWithSeed(0x51));
    const current = fixtureSecrets.readFixtureMusicEnvironment(root);
    expect(current).toContain("ROTATION_LABEL=current");
    for (const path of [...priorCredentials, priorGeneration]) expect(lstatSync(path).size).toBe(0);
    for (const path of credentialPaths(root, current)) expect(lstatSync(path).size).toBeGreaterThan(0);
    expect(readdirSync(join(root, ".artifacts", "music-rotation-journals"))
      .filter((name) => fixtureRotationJournalForTest(name))
      .every((name) => lstatSync(join(root, ".artifacts", "music-rotation-journals", name)).size === 0)).toBe(true);
    expect(() => recover(root)).not.toThrow();
  });

  it("rolls back only candidate leaves when environment publication fails before commit", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x61));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const priorEnvironment = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, priorEnvironment);
    const priorBytes = priorCredentials.map((path) => readFileSync(path));

    expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
      ...authorityWithSeed(0x71),
      persistence: {
        randomNameBytes: () => Buffer.alloc(16, 0x74),
        beforePublish: () => { throw new Error("precommit-publish-sentinel"); },
      },
    })).toThrow(/precommit-publish-sentinel|fixture environment/i);
    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(priorEnvironment);
    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
    for (const role of ["token", "migrator", "runtime"] as const) {
      expect(lstatSync(rotationCredentialPath(root, 0x71, role)).size).toBe(0);
    }
    expect(lstatSync(rotationEnvironmentPath(root, 0x71)).size).toBe(0);
  });

  it("uses the retained zero-generation pointer as precommit authority after down", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x25));
    cleanupAllFixtureMusicTokenSecrets(root);
    const retainedPointer = readFileSync(join(root, ".env.music.test"));

    expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
      ...authorityWithSeed(0x35),
      persistence: {
        randomNameBytes: () => Buffer.alloc(16, 0x38),
        beforePublish: () => { throw new Error("post-down-precommit-sentinel"); },
      },
    })).toThrow();
    expect(readFileSync(join(root, ".env.music.test"))).toEqual(retainedPointer);
    for (const role of ["token", "migrator", "runtime"] as const) {
      expect(lstatSync(rotationCredentialPath(root, 0x35, role)).size).toBe(0);
    }
    expect(lstatSync(rotationEnvironmentPath(root, 0x35)).size).toBe(0);
    expect(() => recover(root)).not.toThrow();
  });

  it("does not switch authority when durable rotation-journal publication fails", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x26));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const prior = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentialBytes = credentialPaths(root, prior).map((path) => readFileSync(path));

    expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
      ...authorityWithSeed(0x36),
      persistence: { randomNameBytes: () => Buffer.alloc(16, 0x39) },
      syncJournalDirectory: () => { throw new Error("journal-directory-sync-sentinel"); },
    } as RotationDependencies & { syncJournalDirectory: (path: string) => void })).toThrow(/journal|fixture environment/i);
    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(prior);
    expect(credentialPaths(root, prior).map((path) => readFileSync(path))).toEqual(priorCredentialBytes);
    expect(() => recover(root)).not.toThrow();
  });

  it.each(["generation-write", "generation-fsync", "generation-close", "pointer-rename"] as const)(
    "preserves prior authority at the %s precommit failure phase",
    (phase) => {
      const root = fixtureRoot();
      rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0xa1));
      const priorPointer = readFileSync(join(root, ".env.music.test"));
      const priorEnvironment = fixtureSecrets.readFixtureMusicEnvironment(root);
      const priorCredentials = credentialPaths(root, priorEnvironment);
      const priorBytes = priorCredentials.map((path) => readFileSync(path));
      const persistence: fixtureSecrets.FixtureEnvironmentPersistenceDependencies = {
        randomNameBytes: () => Buffer.alloc(16, 0xb4),
      };
      if (phase === "pointer-rename") persistence.rename = () => { throw new Error("pointer-rename-sentinel"); };

      let candidateWrites = 0;
      let candidateSyncs = 0;
      let candidateCloses = 0;
      const rotationDependencies: RotationDependencies = {
        ...authorityWithSeed(0xb1),
        persistence,
      };
      if (phase === "generation-write") rotationDependencies.candidateWrite = ((descriptor, buffer, offset, length, position) => {
        candidateWrites += 1;
        return candidateWrites === 4 ? writeSync(descriptor, buffer, offset, 3, position) : writeSync(descriptor, buffer, offset, length, position);
      }) as typeof writeSync;
      if (phase === "generation-fsync") rotationDependencies.candidateSync = (descriptor) => {
        candidateSyncs += 1;
        if (candidateSyncs === 4) throw new Error("candidate-fsync-sentinel");
        fsyncSync(descriptor);
      };
      if (phase === "generation-close") rotationDependencies.candidateClose = (descriptor) => {
        candidateCloses += 1;
        if (candidateCloses === 4) throw new Error("candidate-close-sentinel");
        closeSync(descriptor);
      };

      expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), rotationDependencies)).toThrow();
      expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
      expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(priorEnvironment);
      expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
      for (const role of ["token", "migrator", "runtime"] as const) {
        expect(lstatSync(rotationCredentialPath(root, 0xb1, role)).size).toBe(0);
      }
      expect(lstatSync(rotationEnvironmentPath(root, 0xb1)).size).toBe(0);
    },
  );

  it.each(["callback", "generation-close"] as const)(
    "keeps current authority complete after the %s postcommit failure phase",
    (phase) => {
      const root = fixtureRoot();
      rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0xc1));
      const prior = fixtureSecrets.readFixtureMusicEnvironment(root);
      const priorCredentials = credentialPaths(root, prior);
      let closeCalls = 0;
      const persistence: fixtureSecrets.FixtureEnvironmentPersistenceDependencies = {
        randomNameBytes: () => Buffer.alloc(16, 0xd4),
        afterReferenceCommit: phase === "callback" ? () => { throw new Error("postcommit-callback-sentinel"); } : undefined,
        close: phase === "generation-close" ? (descriptor) => {
          closeCalls += 1;
          if (closeCalls === 2) throw new Error("postcommit-close-sentinel");
          closeSync(descriptor);
        } : undefined,
      };

      expect(() => rotate(root, (paths) => environment(root, paths, "current"), {
        ...authorityWithSeed(0xd1),
        persistence,
      })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));
      const current = fixtureSecrets.readFixtureMusicEnvironment(root);
      expect(current).toContain("ROTATION_LABEL=current");
      for (const path of credentialPaths(root, current)) expect(lstatSync(path).size).toBeGreaterThan(0);
      for (const path of priorCredentials) expect(lstatSync(path).size).toBe(0);
      const reference = readFileSync(join(root, ".env.music.test"), "utf8");
      const generation = join(root, ".artifacts", "music-environment-generations", reference.match(/generation=(generation-[a-f0-9]{32})/)![1]!);
      expect(lstatSync(generation).size).toBeGreaterThan(0);
      expect(() => recover(root)).not.toThrow();
    },
  );

  it("keeps new authority live and retries exact old-credential cleanup after a swap", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x81));
    const priorEnvironment = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, priorEnvironment);
    const swapped = priorCredentials[0]!;
    const displaced = join(root, "displaced-prior-credential");
    const attackerPreserved = join(root, "attacker-preserved-after-repair");
    const attacker = Buffer.alloc(readFileSync(swapped).length, 0x5a);

    expect(() => rotate(root, (paths) => environment(root, paths, "current"), {
      ...authorityWithSeed(0x91),
      persistence: { afterReferenceCommit: () => {
        renameSync(swapped, displaced);
        writeFileSync(swapped, attacker, { mode: 0o600 });
      } },
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));
    const current = fixtureSecrets.readFixtureMusicEnvironment(root);
    expect(current).toContain("ROTATION_LABEL=current");
    for (const path of credentialPaths(root, current)) expect(lstatSync(path).size).toBeGreaterThan(0);
    expect(readFileSync(swapped)).toEqual(attacker);
    expect(lstatSync(displaced).size).toBeGreaterThan(0);
    expect(readdirSync(join(root, ".artifacts", "music-rotation-journals")).some((name) => {
      return fixtureRotationJournalForTest(name) && lstatSync(join(root, ".artifacts", "music-rotation-journals", name)).size > 0;
    })).toBe(true);
    expect(() => cleanupAllFixtureMusicTokenSecrets(root)).toThrow(expect.objectContaining({
      code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED",
    }));
    expect(readFileSync(swapped)).toEqual(attacker);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(current);

    renameSync(swapped, attackerPreserved);
    renameSync(displaced, swapped);
    recover(root);
    expect(readFileSync(attackerPreserved)).toEqual(attacker);
    expect(lstatSync(swapped).size).toBe(0);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(current);
    expect(readdirSync(join(root, ".artifacts", "music-rotation-journals"))
      .filter((name) => fixtureRotationJournalForTest(name))
      .every((name) => lstatSync(join(root, ".artifacts", "music-rotation-journals", name)).size === 0)).toBe(true);
  });

  it("rejects a replaced candidate credential before commit without retiring prior authority", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x11));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const priorEnvironment = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, priorEnvironment);
    const priorBytes = priorCredentials.map((path) => readFileSync(path));
    let candidateCredentials: string[] = [];
    const displaced = join(root, "displaced-candidate-before-commit");
    const attacker = Buffer.alloc(43, 0x5e);

    expect(() => rotate(root, (paths) => {
      const contents = environment(root, paths, "candidate");
      candidateCredentials = credentialPaths(root, contents);
      return contents;
    }, {
      ...authorityWithSeed(0x21),
      persistence: {
        randomNameBytes: () => Buffer.alloc(16, 0x24),
        beforeReferenceCommit: () => {
          renameSync(candidateCredentials[0]!, displaced);
          writeFileSync(candidateCredentials[0]!, attacker, { mode: 0o600 });
        },
      },
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));

    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(priorEnvironment);
    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
    expect(readFileSync(candidateCredentials[0]!)).toEqual(attacker);
    expect(lstatSync(displaced).size).toBeGreaterThan(0);
  });

  it("publishes a durable intent journal before creating the first candidate secret", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x31));
    let journalPresentBeforeFirstSecret = false;
    let observedJournals: string[] = [];

    expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
      ...authorityWithSeed(0x41),
      beforeCandidateCreate: (_kind, index) => {
        if (index === 0) {
          try {
            observedJournals = readdirSync(join(root, ".artifacts", "music-rotation-journals"));
            journalPresentBeforeFirstSecret = observedJournals
              .some((name) => fixtureRotationJournalForTest(name)
                && lstatSync(join(root, ".artifacts", "music-rotation-journals", name)).size > 0);
          } catch {
            journalPresentBeforeFirstSecret = false;
          }
          throw new Error("hard-exit-before-first-candidate-journal-update");
        }
      },
    })).toThrow(/hard-exit-before-first-candidate-journal-update/);

    expect(journalPresentBeforeFirstSecret, observedJournals.join(",")).toBe(true);
  });

  it("restores prior authority when committed recovery finds a replaced candidate credential", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x51));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const priorEnvironment = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, priorEnvironment);
    const priorBytes = priorCredentials.map((path) => readFileSync(path));
    let candidateCredentials: string[] = [];
    const displaced = join(root, "displaced-candidate-after-commit");
    const attacker = Buffer.alloc(43, 0x6e);

    expect(() => rotate(root, (paths) => {
      const contents = environment(root, paths, "candidate");
      candidateCredentials = credentialPaths(root, contents);
      return contents;
    }, {
      ...authorityWithSeed(0x61),
      persistence: {
        randomNameBytes: () => Buffer.alloc(16, 0x64),
        afterReferenceCommit: () => {
          renameSync(candidateCredentials[0]!, displaced);
          writeFileSync(candidateCredentials[0]!, attacker, { mode: 0o600 });
          throw new Error("postcommit-candidate-replacement-sentinel");
        },
      },
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));

    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(priorEnvironment);
    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
    expect(readFileSync(candidateCredentials[0]!)).toEqual(attacker);
    expect(lstatSync(displaced).size).toBeGreaterThan(0);
  });

  it.each([0, 1, 2])("rejects a same-inode rewrite of candidate credential %s before commit", (candidateIndex) => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x71));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const priorEnvironment = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, priorEnvironment);
    const priorBytes = priorCredentials.map((path) => readFileSync(path));
    let candidates: string[] = [];

    expect(() => rotate(root, (paths) => {
      const contents = environment(root, paths, "candidate");
      candidates = credentialPaths(root, contents);
      return contents;
    }, {
      ...authorityWithSeed(0x81),
      persistence: { beforeReferenceCommit: () => {
        const length = lstatSync(candidates[candidateIndex]!).size;
        writeFileSync(candidates[candidateIndex]!, Buffer.alloc(length, 0x7e));
      } },
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));

    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
    expect(lstatSync(candidates[candidateIndex]!).size).toBeGreaterThan(0);
  });

  it.each([0, 1, 2])("restores prior authority after a same-inode rewrite of candidate credential %s postcommit", (candidateIndex) => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x29));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const priorEnvironment = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, priorEnvironment);
    const priorBytes = priorCredentials.map((path) => readFileSync(path));
    let candidates: string[] = [];

    expect(() => rotate(root, (paths) => {
      const contents = environment(root, paths, "candidate");
      candidates = credentialPaths(root, contents);
      return contents;
    }, {
      ...authorityWithSeed(0x39),
      persistence: { afterReferenceCommit: () => {
        const length = lstatSync(candidates[candidateIndex]!).size;
        writeFileSync(candidates[candidateIndex]!, Buffer.alloc(length, 0x6d));
      } },
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));

    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(priorEnvironment);
    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
    expect(lstatSync(candidates[candidateIndex]!).size).toBeGreaterThan(0);
  });

  it("erases a failed initial intent publication without leaving an unrecoverable journal", () => {
    const root = fixtureRoot();
    let writes = 0;
    expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
      ...authorityWithSeed(0x49),
      journal: { write: ((descriptor: number, buffer: NodeJS.ArrayBufferView, offset?: number | null, length?: number | null, position?: number | null) => {
        writes += 1;
        if (writes === 1) {
          writeSync(descriptor, Buffer.from("{"), 0, 1, 0);
          return 1;
        }
        return writeSync(descriptor, buffer, offset, length, position);
      }) as typeof writeSync },
    })).toThrow();
    expect(() => recover(root)).not.toThrow();
    const journalDirectory = join(root, ".artifacts", "music-rotation-journals");
    expect(readdirSync(journalDirectory).every((name) => lstatSync(join(journalDirectory, name)).size === 0)).toBe(true);
    expect(readdirSync(join(root, ".artifacts", "music-token-secrets"))).toHaveLength(0);
  });

  it("rejects a replayed or root-tampered intent journal before candidate cleanup", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x59));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const prior = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorBytes = credentialPaths(root, prior).map((path) => readFileSync(path));
    let tamperedJournal = "";

    expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
      ...authorityWithSeed(0x69),
      afterCandidateCreatedBeforeJournalUpdate: (_kind, index) => {
        if (index !== 0) return;
        const directory = join(root, ".artifacts", "music-rotation-journals");
        const name = readdirSync(directory).find((candidate) => fixtureRotationJournalForTest(candidate)
          && lstatSync(join(directory, candidate)).size > 0)!;
        tamperedJournal = join(directory, name);
        const parsed = JSON.parse(readFileSync(tamperedJournal, "utf8")) as Record<string, unknown>;
        parsed.rootIno = "999999999";
        writeFileSync(tamperedJournal, JSON.stringify(parsed));
        throw new Error("tampered-intent-sentinel");
      },
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));

    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(credentialPaths(root, prior).map((path) => readFileSync(path))).toEqual(priorBytes);
    expect(lstatSync(tamperedJournal).size).toBeGreaterThan(0);
  });

  it("rejects an intent journal redirected onto a live prior credential without mutation", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x6a));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const prior = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, prior);
    const priorBytes = priorCredentials.map((path) => readFileSync(path));
    const target = priorCredentials[0]!;
    const targetStat = lstatSync(target, { bigint: true });
    const targetDirectoryStat = lstatSync(join(target, ".."), { bigint: true });
    let journalPath = "";

    expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
      ...authorityWithSeed(0x7a),
      afterCandidateCreatedBeforeJournalUpdate: (_kind, index) => {
        if (index !== 0) return;
        const directory = join(root, ".artifacts", "music-rotation-journals");
        const name = readdirSync(directory).find((candidate) => fixtureRotationJournalForTest(candidate)
          && lstatSync(join(directory, candidate)).size > 0)!;
        journalPath = join(directory, name);
        const parsed = JSON.parse(readFileSync(journalPath, "utf8")) as {
          candidate: Array<Record<string, unknown>>;
        };
        parsed.candidate[0] = {
          kind: "credential",
          role: "token",
          state: "complete",
          relativePath: relative(root, target).replace(/\\/g, "/"),
          directoryDev: targetDirectoryStat.dev.toString(),
          directoryIno: targetDirectoryStat.ino.toString(),
          fileDev: targetStat.dev.toString(),
          fileIno: targetStat.ino.toString(),
          size: priorBytes[0]!.length,
          sha256: createHash("sha256").update(priorBytes[0]!).digest("hex"),
        };
        writeFileSync(journalPath, JSON.stringify(parsed));
        throw new Error("semantic-journal-redirection-sentinel");
      },
    })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));

    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
    expect(lstatSync(journalPath).size).toBeGreaterThan(0);
  }, 20_000);

  it.each(["duplicate-candidate", "duplicate-prior", "prior-reference-hash", "replayed-operation"] as const)(
    "rejects %s journal graph tampering before any authority mutation",
    (tamper) => {
      const root = fixtureRoot();
      rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x6b));
      const priorPointer = readFileSync(join(root, ".env.music.test"));
      const prior = fixtureSecrets.readFixtureMusicEnvironment(root);
      const priorCredentials = credentialPaths(root, prior);
      const priorBytes = priorCredentials.map((path) => readFileSync(path));
      let journalPath = "";

      expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
        ...authorityWithSeed(0x7b),
        afterCandidateCreatedBeforeJournalUpdate: (_kind, index) => {
          if (index !== 0) return;
          const directory = join(root, ".artifacts", "music-rotation-journals");
          const name = readdirSync(directory).find((candidate) => fixtureRotationJournalForTest(candidate)
            && lstatSync(join(directory, candidate)).size > 0)!;
          journalPath = join(directory, name);
          const parsed = JSON.parse(readFileSync(journalPath, "utf8")) as {
            operationId: string;
            priorPointerSha256: string;
            prior: Array<Record<string, unknown>>;
            candidate: Array<Record<string, unknown>>;
          };
          if (tamper === "duplicate-candidate") parsed.candidate[1]!.relativePath = parsed.candidate[0]!.relativePath;
          if (tamper === "duplicate-prior") parsed.prior[1] = { ...parsed.prior[0] };
          if (tamper === "prior-reference-hash") parsed.priorPointerSha256 = "0".repeat(64);
          if (tamper === "replayed-operation") parsed.operationId = "f".repeat(32);
          writeFileSync(journalPath, JSON.stringify(parsed));
          throw new Error("journal-graph-tamper-sentinel");
        },
      })).toThrow(expect.objectContaining({ code: "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED" }));

      expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
      expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
      expect(lstatSync(journalPath).size).toBeGreaterThan(0);
    },
  );

  it("rejects rewritten prior environment metadata that disagrees with the unchanged prior reference", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x3a));
    const priorReference = readFileSync(join(root, ".env.music.test"), "utf8");
    const priorGenerationName = priorReference.match(/generation=(generation-[a-f0-9]{32})/)![1]!;
    const priorGeneration = join(root, ".artifacts", "music-environment-generations", priorGenerationName);
    const priorEnvironment = readFileSync(priorGeneration);
    const priorCredentials = credentialPaths(root, priorEnvironment.toString("utf8"));
    const priorCredentialBytes = priorCredentials.map((path) => readFileSync(path));
    const outsideCredentials = [0, 1, 2].map((index) => {
      const path = join(root, ".artifacts", "music-token-secrets", `current-${Buffer.alloc(16, 0xe1 + index).toString("hex")}`);
      writeFileSync(path, Buffer.alloc(43, 0xe1 + index), { mode: 0o600 });
      return path;
    });
    const outsideBytes = outsideCredentials.map((path) => readFileSync(path));
    let journalPath = "";
    let rewrittenBytes = Buffer.alloc(0);

    expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
      ...authorityWithSeed(0x4a),
      afterJournalCommit: () => {
        journalPath = activeJournalPath(root);
        const parsed = JSON.parse(readFileSync(journalPath, "utf8")) as {
          prior: Array<Record<string, unknown>>;
        };
        const rewritten = environment(root, {
          tokenPath: outsideCredentials[0]!,
          migratorPasswordPath: outsideCredentials[1]!,
          runtimePasswordPath: outsideCredentials[2]!,
        }, "rewritten-prior");
        rewrittenBytes = Buffer.from(rewritten);
        writeFileSync(priorGeneration, rewritten);
        parsed.prior = [
          ...outsideCredentials.map((path) => authoritySnapshot(root, path, "credential")),
          authoritySnapshot(root, priorGeneration, "environment"),
        ];
        writeFileSync(journalPath, JSON.stringify(parsed));
        throw new Error("prior-reference-metadata-rewrite-sentinel");
      },
    })).toThrow();

    expect(readFileSync(priorGeneration)).toEqual(rewrittenBytes);
    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorCredentialBytes);
    expect(outsideCredentials.map((path) => readFileSync(path))).toEqual(outsideBytes);
    expect(lstatSync(journalPath).size).toBeGreaterThan(0);
  });

  it("rejects unbound three-credential legacy recovery redirected to unrelated authority", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x3b));
    const priorReference = readFileSync(join(root, ".env.music.test"));
    const prior = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, prior);
    const priorBytes = priorCredentials.map((path) => readFileSync(path));
    const outsideCredentials = [0, 1, 2].map((index) => {
      const path = join(root, ".artifacts", "music-token-secrets", `current-${Buffer.alloc(16, 0xd1 + index).toString("hex")}`);
      writeFileSync(path, Buffer.alloc(43, 0xd1 + index), { mode: 0o600 });
      return path;
    });
    const outsideBytes = outsideCredentials.map((path) => readFileSync(path));
    let journalPath = "";
    let committedPointer = Buffer.alloc(0);

    expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
      ...authorityWithSeed(0x4b),
      afterJournalCommit: () => {
        committedPointer = readFileSync(join(root, ".env.music.test"));
        journalPath = activeJournalPath(root);
        const parsed = JSON.parse(readFileSync(journalPath, "utf8")) as {
          prior: Array<Record<string, unknown>>;
        };
        parsed.prior = outsideCredentials.map((path) => authoritySnapshot(root, path, "credential"));
        writeFileSync(journalPath, JSON.stringify(parsed));
        throw new Error("legacy-prior-redirection-sentinel");
      },
    })).toThrow();

    expect(committedPointer).not.toEqual(priorReference);
    expect(readFileSync(join(root, ".env.music.test"))).toEqual(committedPointer);
    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
    expect(outsideCredentials.map((path) => readFileSync(path))).toEqual(outsideBytes);
    expect(lstatSync(journalPath).size).toBeGreaterThan(0);
  });

  it("rejects candidate and prior path aliases that share one native file identity", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x3c));
    const prior = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, prior);
    const priorBytes = priorCredentials.map((path) => readFileSync(path));
    let candidateCredential = "";
    let displacedCandidate = "";
    let journalPath = "";

    expect(() => rotate(root, (paths) => {
      candidateCredential = paths.tokenPath;
      displacedCandidate = join(root, "displaced-candidate-identity");
      return environment(root, paths, "candidate");
    }, {
      ...authorityWithSeed(0x4c),
      afterJournalCommit: () => {
        renameSync(candidateCredential, displacedCandidate);
        linkSync(priorCredentials[0]!, candidateCredential);
        journalPath = activeJournalPath(root);
        const parsed = JSON.parse(readFileSync(journalPath, "utf8")) as {
          candidate: Array<Record<string, unknown>>;
        };
        parsed.candidate[0] = {
          ...authoritySnapshot(root, candidateCredential, "credential"),
          role: "token",
          state: "complete",
        };
        writeFileSync(journalPath, JSON.stringify(parsed));
        throw new Error("candidate-prior-inode-alias-sentinel");
      },
    })).toThrow();

    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
    expect(readFileSync(candidateCredential)).toEqual(priorBytes[0]);
    expect(lstatSync(journalPath).size).toBeGreaterThan(0);
  });

  it("does not truncate an unrelated hard-link from a journal-bound allocated candidate", () => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x3d));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const outside = join(root, "unrelated-hard-link");
    const outsideBytes = Buffer.from("unrelated-hard-link-must-remain");
    let journalPath = "";

    expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
      ...authorityWithSeed(0x4d),
      afterCandidateAllocatedBeforeWrite: (_kind, index) => {
        if (index !== 0) return;
        const candidate = rotationCredentialPath(root, 0x4d, "token");
        linkSync(candidate, outside);
        writeFileSync(outside, outsideBytes);
        journalPath = activeJournalPath(root);
        throw new Error("allocated-hard-link-sentinel");
      },
    })).toThrow();

    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(readFileSync(outside)).toEqual(outsideBytes);
    expect(lstatSync(journalPath).size).toBeGreaterThan(0);
  });

  it.each([0, 1, 2, 3])("recovers a hard exit during candidate %s write using its journal-bound inode", (candidateIndex) => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x8a));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const prior = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, prior);
    const priorBytes = priorCredentials.map((path) => readFileSync(path));
    const moduleUrl = pathToFileURL(resolve("scripts/music-fixture-secret.ts")).href;
    const script = `
      import { renameSync, writeSync } from 'node:fs';
      import { rotateFixtureMusicAuthority } from ${JSON.stringify(moduleUrl)};
      const root = process.env.MUSIC_CRASH_ROOT;
      const targetIndex = Number(process.env.MUSIC_CRASH_INDEX);
      let writeIndex = 0;
      const rel = (value) => './' + value.slice(root.length + 1).replaceAll('\\\\', '/');
      rotateFixtureMusicAuthority(root, (paths) =>
        'MUSIC_TOKEN_SECRET_FILE_HOST=' + rel(paths.tokenPath) + '\\n'
        + 'MUSIC_DB_MIGRATOR_SECRET_FILE_HOST=' + rel(paths.migratorPasswordPath) + '\\n'
        + 'MUSIC_DB_RUNTIME_SECRET_FILE_HOST=' + rel(paths.runtimePasswordPath) + '\\nROTATION_LABEL=mid-write\\n', {
          credentialNameBytes: (index) => Buffer.alloc(16, 0x9a + index),
          credentialSecretBytes: (index) => Buffer.alloc(32, 0x9a + index),
          durableReplace: renameSync,
          candidateWrite: (descriptor, buffer, offset, _length, position) => {
            const currentIndex = writeIndex++;
            if (currentIndex === targetIndex) {
              writeSync(descriptor, buffer, offset, 3, position);
              process.exit(89);
            }
            return writeSync(descriptor, buffer, offset, buffer.byteLength, position);
          },
        });
    `;
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: { ...process.env, MUSIC_CRASH_ROOT: root, MUSIC_CRASH_INDEX: String(candidateIndex) },
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(child.status, child.stderr).toBe(89);
    expect(() => recover(root)).not.toThrow();
    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(prior);
    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
    expect(readdirSync(join(root, ".artifacts", "music-rotation-journals"))
      .filter((name) => fixtureRotationJournalForTest(name))
      .every((name) => lstatSync(join(root, ".artifacts", "music-rotation-journals", name)).size === 0)).toBe(true);
  }, 20_000);

  it.each([
    "allocated-before-write",
    "written-before-sync",
    "synced-before-close",
    "closed-before-complete",
  ] as const)("recovers every candidate from a hard exit at %s", (phase) => {
    for (const candidateIndex of [0, 1, 2, 3]) {
      const root = fixtureRoot();
      rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x8b + candidateIndex));
      const priorPointer = readFileSync(join(root, ".env.music.test"));
      const prior = fixtureSecrets.readFixtureMusicEnvironment(root);
      const priorCredentials = credentialPaths(root, prior);
      const priorBytes = priorCredentials.map((path) => readFileSync(path));
      const moduleUrl = pathToFileURL(resolve("scripts/music-fixture-secret.ts")).href;
      const script = `
        import { renameSync } from 'node:fs';
        import { rotateFixtureMusicAuthority } from ${JSON.stringify(moduleUrl)};
        const root = process.env.MUSIC_CRASH_ROOT;
        const target = Number(process.env.MUSIC_CRASH_INDEX);
        const phase = process.env.MUSIC_CRASH_PHASE;
        const rel = (value) => './' + value.slice(root.length + 1).replaceAll('\\\\', '/');
        const exitAt = (expected, index) => { if (phase === expected && index === target) process.exit(90); };
        rotateFixtureMusicAuthority(root, (paths) =>
          'MUSIC_TOKEN_SECRET_FILE_HOST=' + rel(paths.tokenPath) + '\\n'
          + 'MUSIC_DB_MIGRATOR_SECRET_FILE_HOST=' + rel(paths.migratorPasswordPath) + '\\n'
          + 'MUSIC_DB_RUNTIME_SECRET_FILE_HOST=' + rel(paths.runtimePasswordPath) + '\\nROTATION_LABEL=phase-crash\\n', {
            operationIdBytes: () => Buffer.alloc(16, 0xaa + target),
            credentialSecretBytes: (index) => Buffer.alloc(32, 0xaa + index),
            durableReplace: renameSync,
            afterCandidateAllocatedBeforeWrite: (_kind, index) => exitAt('allocated-before-write', index),
            afterCandidateWriteBeforeSync: (_kind, index) => exitAt('written-before-sync', index),
            afterCandidateSyncBeforeClose: (_kind, index) => exitAt('synced-before-close', index),
            afterCandidateCloseBeforeComplete: (_kind, index) => exitAt('closed-before-complete', index),
          });
      `;
      const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MUSIC_CRASH_ROOT: root,
          MUSIC_CRASH_INDEX: String(candidateIndex),
          MUSIC_CRASH_PHASE: phase,
        },
        encoding: "utf8",
        timeout: 15_000,
      });
      expect(child.status, child.stderr).toBe(90);
      expect(() => recover(root)).not.toThrow();
      expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
      expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(prior);
      expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
      expect(readdirSync(join(root, ".artifacts", "music-rotation-journals"))
        .filter((name) => fixtureRotationJournalForTest(name))
        .every((name) => lstatSync(join(root, ".artifacts", "music-rotation-journals", name)).size === 0)).toBe(true);
    }
  }, 60_000);

  it("uses a real Windows write-through metadata primitive instead of a no-op barrier", () => {
    if (process.platform !== "win32") return;
    const source = readFileSync(resolve("scripts/music-fixture-secret.ts"), "utf8");
    expect(source).not.toMatch(/if \(process\.platform === "win32"\) return;/);
    expect(existsSync(resolve("scripts/windows-write-through.ps1"))).toBe(true);
  });

  it("uses one direct source-handle replace and never creates a private native backup", () => {
    const helper = readFileSync(resolve("scripts/windows-write-through.ps1"), "utf8");
    expect(helper).not.toContain(".music-fixture-backup-");
    expect(helper).not.toMatch(/RenameHandle\(destinationHandle/);
    expect(helper).toMatch(/RenameHandle\(sourceHandle, targetParent, destinationName, true, "commit"\)/);
  });

  it.each([
    ["before-call", "Environment.FailFast(\"native-before-call\");\n            RenameHandle(sourceHandle, targetParent, destinationName, true, \"commit\");", false, 15_000],
    ["after-commit", "RenameHandle(sourceHandle, targetParent, destinationName, true, \"commit\");\n            Environment.FailFast(\"native-after-commit\");", true, 15_000],
    ["before-flush", "Environment.FailFast(\"native-before-flush\");\n            if (!FlushFileBuffers(sourceHandle)) throw NativeFailure(\"renamed authority flush\");", true, 15_000],
    ["before-barrier", "Environment.FailFast(\"native-before-barrier\");\n            MetadataBarrier(lockedTargetDirectory);", true, 15_000],
    ["timeout-after-commit", "RenameHandle(sourceHandle, targetParent, destinationName, true, \"commit\");\n            System.Threading.Thread.Sleep(30000);", true, 1_000],
  ] as const)("leaves exact prior-or-source authority after native phase %s termination", (phase, replacement, committed, timeout) => {
    if (process.platform !== "win32") return;
    const root = fixtureRoot();
    const source = join(root, `native-${phase}.tmp`);
    const destination = join(root, `native-${phase}.ref`);
    const helper = join(root, `native-${phase}.ps1`);
    const expected = Buffer.from(`candidate-${phase}`);
    const prior = Buffer.from(`prior-${phase}`);
    writeFileSync(source, expected, { mode: 0o600 });
    writeFileSync(destination, prior, { mode: 0o600 });
    const original = readFileSync(resolve("scripts/windows-write-through.ps1"), "utf8");
    const needle = phase === "before-call" || phase === "after-commit" || phase === "timeout-after-commit"
      ? "RenameHandle(sourceHandle, targetParent, destinationName, true, \"commit\");"
      : phase === "before-flush"
        ? "if (!FlushFileBuffers(sourceHandle)) throw NativeFailure(\"renamed authority flush\");"
        : "MetadataBarrier(lockedTargetDirectory);";
    expect(original.split(needle)).toHaveLength(2);
    writeFileSync(helper, original.replace(needle, replacement), { mode: 0o600 });

    const result = runWindowsNativeReplace(helper, source, destination, timeout);
    expect(result.status === 0).toBe(false);
    expect(readFileSync(destination)).toEqual(committed ? expected : prior);
    expect(existsSync(source)).toBe(!committed);
    expect(readdirSync(root).filter((name) => name.startsWith(".music-fixture-backup-"))).toHaveLength(0);
  }, 30_000);

  it("executes the Windows write-through replacement and fails closed when the helper fails", () => {
    if (process.platform !== "win32") return;
    const root = fixtureRoot();
    const source = join(root, "source.tmp");
    const destination = join(root, "authority.ref");
    const oldBytes = Buffer.from("prior-authority");
    const newBytes = Buffer.from("current-authority");
    writeFileSync(source, newBytes, { mode: 0o600 });
    writeFileSync(destination, oldBytes, { mode: 0o600 });

    fixtureSecrets.replaceFixtureMetadataDurably(source, destination);

    expect(existsSync(source)).toBe(false);
    expect(readFileSync(destination)).toEqual(newBytes);

    const failingSource = join(root, "failing-source.tmp");
    const failingDestination = join(root, "failing-authority.ref");
    writeFileSync(failingSource, Buffer.from("candidate"), { mode: 0o600 });
    writeFileSync(failingDestination, Buffer.from("retained"), { mode: 0o600 });
    expect(() => fixtureSecrets.replaceFixtureMetadataDurably(failingSource, failingDestination, {
      platform: "win32",
      runWindowsHelper: () => ({ status: 1 }),
    })).toThrow(/fixture environment/i);
    expect(readFileSync(failingSource, "utf8")).toBe("candidate");
    expect(readFileSync(failingDestination, "utf8")).toBe("retained");
  }, 20_000);

  it("does not accept a successful helper status unless the exact validated source identity committed", () => {
    if (process.platform !== "win32") return;
    const root = fixtureRoot();
    const source = join(root, "validated-source.tmp");
    const destination = join(root, "prior-authority.ref");
    const expected = Buffer.from("expected-new-authority");
    const prior = Buffer.from("prior-authority-must-remain");
    writeFileSync(source, expected, { mode: 0o600 });
    writeFileSync(destination, prior, { mode: 0o600 });

    expect(() => fixtureSecrets.replaceFixtureMetadataDurably(source, destination, {
      platform: "win32",
      runWindowsHelper: () => ({ status: 0 }),
    })).toThrow(/fixture environment/i);

    expect(readFileSync(destination)).toEqual(prior);
    expect(readFileSync(source)).toEqual(expected);
  });

  it("makes the real Windows helper reject a source swap inside the native identity boundary", () => {
    if (process.platform !== "win32") return;
    const root = fixtureRoot();
    const source = join(root, "real-source-swap.tmp");
    const destination = join(root, "real-source-swap.ref");
    const parked = join(root, "real-source-swap.parked");
    const expected = Buffer.from("real-expected-source");
    const prior = Buffer.from("real-prior-destination");
    const attacker = Buffer.from("real-attacker-source");
    writeFileSync(source, expected, { mode: 0o600 });
    writeFileSync(destination, prior, { mode: 0o600 });

    expect(() => fixtureSecrets.replaceFixtureMetadataDurably(source, destination, {
      beforeWindowsReplace: () => {
        renameSync(source, parked);
        writeFileSync(source, attacker, { mode: 0o600 });
      },
    } as fixtureSecrets.FixtureDurableReplaceDependencies & { beforeWindowsReplace: () => void })).toThrow(/fixture environment/i);

    expect(readFileSync(destination)).toEqual(prior);
    expect(readFileSync(parked)).toEqual(expected);
    expect(readFileSync(source)).toEqual(attacker);
  }, 20_000);

  it("makes the real Windows helper reject a same-inode source rewrite before rename", () => {
    if (process.platform !== "win32") return;
    const root = fixtureRoot();
    const source = join(root, "real-rewrite.tmp");
    const destination = join(root, "real-rewrite.ref");
    const expected = Buffer.from("expected-source-bytes");
    const attacker = Buffer.from("attacker-source-bytes");
    const prior = Buffer.from("prior-destination");
    expect(attacker.length).toBe(expected.length);
    writeFileSync(source, expected, { mode: 0o600 });
    writeFileSync(destination, prior, { mode: 0o600 });

    expect(() => fixtureSecrets.replaceFixtureMetadataDurably(source, destination, {
      beforeWindowsReplace: () => writeFileSync(source, attacker),
    } as fixtureSecrets.FixtureDurableReplaceDependencies & { beforeWindowsReplace: () => void })).toThrow(/fixture environment/i);

    expect(readFileSync(destination)).toEqual(prior);
    expect(readFileSync(source)).toEqual(attacker);
  }, 20_000);

  it("makes the real Windows helper reject a destination swap without touching either identity", () => {
    if (process.platform !== "win32") return;
    const root = fixtureRoot();
    const source = join(root, "real-destination-swap.tmp");
    const destination = join(root, "real-destination-swap.ref");
    const parked = join(root, "real-destination-swap.parked");
    const expected = Buffer.from("expected-new-destination");
    const prior = Buffer.from("prior-destination-identity");
    const attacker = Buffer.from("attacker-destination-identity");
    writeFileSync(source, expected, { mode: 0o600 });
    writeFileSync(destination, prior, { mode: 0o600 });

    expect(() => fixtureSecrets.replaceFixtureMetadataDurably(source, destination, {
      beforeWindowsReplace: () => {
        renameSync(destination, parked);
        writeFileSync(destination, attacker, { mode: 0o600 });
      },
    } as fixtureSecrets.FixtureDurableReplaceDependencies & { beforeWindowsReplace: () => void })).toThrow(/fixture environment/i);

    expect(readFileSync(source)).toEqual(expected);
    expect(readFileSync(destination)).toEqual(attacker);
    expect(readFileSync(parked)).toEqual(prior);
  }, 20_000);

  it("makes the real Windows helper reject an ancestor junction swap without touching outside files", () => {
    if (process.platform !== "win32") return;
    const container = fixtureRoot();
    const authority = join(container, "authority");
    const parkedAuthority = join(container, "authority-parked");
    const outside = join(container, "outside");
    mkdirSync(authority);
    mkdirSync(outside);
    const source = join(authority, "junction-source.tmp");
    const destination = join(authority, "junction-destination.ref");
    const outsideSource = join(outside, "junction-source.tmp");
    const outsideDestination = join(outside, "junction-destination.ref");
    writeFileSync(source, "owned-source", { mode: 0o600 });
    writeFileSync(destination, "owned-prior", { mode: 0o600 });
    writeFileSync(outsideSource, "outside-source", { mode: 0o600 });
    writeFileSync(outsideDestination, "outside-destination", { mode: 0o600 });
    let swapped = false;
    try {
      expect(() => fixtureSecrets.replaceFixtureMetadataDurably(source, destination, {
        beforeWindowsReplace: () => {
          renameSync(authority, parkedAuthority);
          symlinkSync(outside, authority, "junction");
          swapped = true;
        },
      } as fixtureSecrets.FixtureDurableReplaceDependencies & { beforeWindowsReplace: () => void })).toThrow(/fixture environment/i);
      expect(swapped).toBe(true);
      expect(readFileSync(join(parkedAuthority, "junction-source.tmp"), "utf8")).toBe("owned-source");
      expect(readFileSync(join(parkedAuthority, "junction-destination.ref"), "utf8")).toBe("owned-prior");
      expect(readFileSync(outsideSource, "utf8")).toBe("outside-source");
      expect(readFileSync(outsideDestination, "utf8")).toBe("outside-destination");
    } finally {
      if (swapped) unlinkSync(authority);
    }
  }, 20_000);

  it("reconciles an injected Windows helper error after the exact source identity committed", () => {
    if (process.platform !== "win32") return;
    const root = fixtureRoot();
    const source = join(root, "committed-uncertain.tmp");
    const destination = join(root, "committed-uncertain.ref");
    const expected = Buffer.from("committed-source-identity");
    writeFileSync(source, expected, { mode: 0o600 });
    writeFileSync(destination, "prior", { mode: 0o600 });

    expect(() => fixtureSecrets.replaceFixtureMetadataDurably(source, destination, {
      platform: "win32",
      runWindowsHelper: (validatedSource, validatedDestination) => {
        const helper = resolve("scripts/windows-write-through.ps1");
        const inspect = (path: string) => {
          const result = spawnSync("powershell.exe", [
            "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
            "-File", helper, "inspect", path,
          ], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
          expect(result.status, result.stderr).toBe(0);
          return JSON.parse(result.stdout) as fixtureSecrets.FixtureWindowsNativeIdentity;
        };
        const sourceIdentity = inspect(validatedSource);
        const parentIdentity = inspect(resolve(validatedSource, ".."));
        const destinationIdentity = inspect(validatedDestination);
        const encode = (identity: fixtureSecrets.FixtureWindowsNativeIdentity, content: boolean) => [
          identity.volumeSerial, identity.fileId, String(identity.attributes), String(identity.linkCount),
          ...(content ? [String(identity.size), identity.sha256] : []),
        ];
        const result = spawnSync("powershell.exe", [
          "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
          "-File", helper, "replace", validatedSource, validatedDestination,
          ...encode(sourceIdentity, true), ...encode(parentIdentity, false), "1",
          ...encode(destinationIdentity, true),
        ], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
        expect(result.status, result.stderr).toBe(0);
        // Model loss of the successful helper exit status after the real
        // handle-bound commit; the caller must reconcile exact identity.
        return { status: 19 };
      },
    })).not.toThrow();
    expect(existsSync(source)).toBe(false);
    expect(readFileSync(destination)).toEqual(expected);
  }, 20_000);

  it.each([0, 1, 2, 3])("recovers a hard exit after candidate %s creation but before journal update", (candidateIndex) => {
    const root = fixtureRoot();
    rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x91));
    const priorPointer = readFileSync(join(root, ".env.music.test"));
    const priorEnvironment = fixtureSecrets.readFixtureMusicEnvironment(root);
    const priorCredentials = credentialPaths(root, priorEnvironment);
    const priorBytes = priorCredentials.map((path) => readFileSync(path));
    const moduleUrl = pathToFileURL(resolve("scripts/music-fixture-secret.ts")).href;
    const seed = 0xa1 + candidateIndex * 4;
    const script = `
      import { renameSync } from 'node:fs';
      import { rotateFixtureMusicAuthority } from ${JSON.stringify(moduleUrl)};
      const root = process.env.MUSIC_CRASH_ROOT;
      const candidateIndex = Number(process.env.MUSIC_CRASH_INDEX);
      const seed = Number(process.env.MUSIC_CRASH_SEED);
      const rel = (value) => './' + value.slice(root.length + 1).replaceAll('\\\\', '/');
      rotateFixtureMusicAuthority(root, (paths) =>
        'MUSIC_TOKEN_SECRET_FILE_HOST=' + rel(paths.tokenPath) + '\\n'
        + 'MUSIC_DB_MIGRATOR_SECRET_FILE_HOST=' + rel(paths.migratorPasswordPath) + '\\n'
        + 'MUSIC_DB_RUNTIME_SECRET_FILE_HOST=' + rel(paths.runtimePasswordPath) + '\\nROTATION_LABEL=crash\\n', {
          credentialNameBytes: (index) => Buffer.alloc(16, seed + index),
          credentialSecretBytes: (index) => Buffer.alloc(32, seed + index),
          durableReplace: (source, destination) => renameSync(source, destination),
          persistence: { randomNameBytes: () => Buffer.alloc(16, seed + 3) },
          afterCandidateCreatedBeforeJournalUpdate: (_kind, index) => {
            if (index === candidateIndex) process.exit(86);
          },
        });
    `;
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MUSIC_CRASH_ROOT: root,
        MUSIC_CRASH_INDEX: String(candidateIndex),
        MUSIC_CRASH_SEED: String(seed),
      },
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(child.status, child.stderr).toBe(86);
    expect(readdirSync(join(root, ".artifacts", "music-rotation-journals")).some((name) => {
      return fixtureRotationJournalForTest(name) && lstatSync(join(root, ".artifacts", "music-rotation-journals", name)).size > 0;
    })).toBe(true);
    const journalText = readdirSync(join(root, ".artifacts", "music-rotation-journals"))
      .filter((name) => fixtureRotationJournalForTest(name) && lstatSync(join(root, ".artifacts", "music-rotation-journals", name)).size > 0)
      .map((name) => readFileSync(join(root, ".artifacts", "music-rotation-journals", name), "utf8"))
      .join("\n");
    for (let index = 0; index < 3; index += 1) {
      expect(journalText).not.toContain(Buffer.alloc(32, seed + index).toString("base64url"));
    }
    expect(journalText).not.toContain("ROTATION_LABEL=crash");
    expect(child.stderr).not.toContain(Buffer.alloc(32, seed).toString("base64url"));

    recover(root);
    expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
    expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(priorEnvironment);
    expect(priorCredentials.map((path) => readFileSync(path))).toEqual(priorBytes);
    expect(readdirSync(join(root, ".artifacts", "music-rotation-journals"))
      .filter((name) => fixtureRotationJournalForTest(name))
      .every((name) => lstatSync(join(root, ".artifacts", "music-rotation-journals", name)).size === 0)).toBe(true);
  });

  it.each(["journal-write", "journal-rename", "journal-directory-sync", "candidate-directory-sync"] as const)(
    "keeps prior authority and recovers the %s failure",
    (phase) => {
      const root = fixtureRoot();
      rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0xc1));
      const priorPointer = readFileSync(join(root, ".env.music.test"));
      const prior = fixtureSecrets.readFixtureMusicEnvironment(root);
      const priorCredentialBytes = credentialPaths(root, prior).map((path) => readFileSync(path));
      let writeCalls = 0;
      let directorySyncCalls = 0;
      let candidateDirectorySyncCalls = 0;

      expect(() => rotate(root, (paths) => environment(root, paths, "candidate"), {
        ...authorityWithSeed(0xd1),
        journal: {
          write: phase === "journal-write" ? ((descriptor: number, buffer: NodeJS.ArrayBufferView, offset?: number | null, length?: number | null, position?: number | null) => {
            writeCalls += 1;
            return writeCalls === 2 ? 1 : writeSync(descriptor, buffer, offset, length, position);
          }) as typeof writeSync : undefined,
          rename: phase === "journal-rename" ? (() => { throw new Error("journal-rename-sentinel"); }) : undefined,
        },
        syncJournalDirectory: (path) => {
          directorySyncCalls += 1;
          if (phase === "journal-directory-sync" && directorySyncCalls === 2) throw new Error("journal-directory-sync-sentinel");
          const descriptor = openSync(path, constants.O_RDONLY);
          closeSync(descriptor);
        },
        syncCandidateDirectory: (path) => {
          candidateDirectorySyncCalls += 1;
          if (phase === "candidate-directory-sync" && candidateDirectorySyncCalls === 1) throw new Error("candidate-directory-sync-sentinel");
          const descriptor = openSync(path, constants.O_RDONLY);
          closeSync(descriptor);
        },
      })).toThrow();

      expect(readFileSync(join(root, ".env.music.test"))).toEqual(priorPointer);
      expect(fixtureSecrets.readFixtureMusicEnvironment(root)).toBe(prior);
      expect(credentialPaths(root, prior).map((path) => readFileSync(path))).toEqual(priorCredentialBytes);
      expect(() => recover(root)).not.toThrow();
      const journalDirectory = join(root, ".artifacts", "music-rotation-journals");
      expect(readdirSync(journalDirectory).every((name) => lstatSync(join(journalDirectory, name)).size === 0)).toBe(true);
    },
  );

  it.each(["pointer-renamed", "journal-committed"] as const)(
    "recovers a hard exit at the %s boundary to one complete new bundle",
    (phase) => {
      const root = fixtureRoot();
      rotate(root, (paths) => environment(root, paths, "prior"), authorityWithSeed(0x15));
      const prior = fixtureSecrets.readFixtureMusicEnvironment(root);
      const priorCredentials = credentialPaths(root, prior);
      const moduleUrl = pathToFileURL(resolve("scripts/music-fixture-secret.ts")).href;
      const script = `
        import { renameSync } from 'node:fs';
        import { rotateFixtureMusicAuthority } from ${JSON.stringify(moduleUrl)};
        const root = process.env.MUSIC_CRASH_ROOT;
        const phase = process.env.MUSIC_CRASH_PHASE;
        const rel = (value) => './' + value.slice(root.length + 1).replaceAll('\\\\', '/');
        rotateFixtureMusicAuthority(root, (paths) =>
          'MUSIC_TOKEN_SECRET_FILE_HOST=' + rel(paths.tokenPath) + '\\n'
          + 'MUSIC_DB_MIGRATOR_SECRET_FILE_HOST=' + rel(paths.migratorPasswordPath) + '\\n'
          + 'MUSIC_DB_RUNTIME_SECRET_FILE_HOST=' + rel(paths.runtimePasswordPath) + '\\nROTATION_LABEL=recovered-new\\n', {
            credentialNameBytes: (index) => Buffer.alloc(16, 0x25 + index),
            credentialSecretBytes: (index) => Buffer.alloc(32, 0x25 + index),
            durableReplace: (source, destination) => renameSync(source, destination),
            persistence: {
              randomNameBytes: () => Buffer.alloc(16, 0x28),
              afterReferenceRename: () => { if (phase === 'pointer-renamed') process.exit(87); },
            },
            afterJournalCommit: () => { if (phase === 'journal-committed') process.exit(88); },
          });
      `;
      const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
        cwd: process.cwd(),
        env: { ...process.env, MUSIC_CRASH_ROOT: root, MUSIC_CRASH_PHASE: phase },
        encoding: "utf8",
        timeout: 15_000,
      });
      expect(child.status, child.stderr).toBe(phase === "pointer-renamed" ? 87 : 88);

      recover(root);
      const current = fixtureSecrets.readFixtureMusicEnvironment(root);
      expect(current).toContain("ROTATION_LABEL=recovered-new");
      for (const path of credentialPaths(root, current)) expect(lstatSync(path).size).toBeGreaterThan(0);
      for (const path of priorCredentials) expect(lstatSync(path).size).toBe(0);
      expect(readdirSync(join(root, ".artifacts", "music-rotation-journals"))
        .filter((name) => fixtureRotationJournalForTest(name))
        .every((name) => lstatSync(join(root, ".artifacts", "music-rotation-journals", name)).size === 0)).toBe(true);
    },
  );

  function fixtureRotationJournalForTest(name: string): boolean {
    return /^rotation-[a-f0-9]{32}\.json$/.test(name);
  }
});
