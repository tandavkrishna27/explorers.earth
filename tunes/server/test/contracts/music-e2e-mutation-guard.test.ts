import { linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function loadGuardContract(): Promise<Record<string, unknown>> {
  try {
    const modulePath: string = "../../../scripts/music-e2e-mutation-guard.mjs";
    return await import(modulePath);
  } catch {
    return {};
  }
}

describe("Music E2E durable mutation guard", () => {
  it("is observed by a fresh controller and persists only the strict safe record", async () => {
    // Production break caught: a worker-local latch lets a fresh Playwright
    // worker continue mutating after another worker's restore has failed.
    const contract = await loadGuardContract();
    const create = contract.createMusicMutationGuard as undefined | ((input: {
      runDirectory: string;
      guardPath: string;
      recoveryPath: string;
    }) => { read: () => unknown; block: (reason: string, stage: string) => unknown });
    expect(create).toBeTypeOf("function");
    if (!create) return;

    const runDirectory = mkdtempSync(join(tmpdir(), "music-mutation-guard-"));
    const guardPath = join(runDirectory, "mutation-guard.json");
    const recoveryPath = join(runDirectory, "mutation-recovery.private.jsonl");
    try {
      const first = create({ runDirectory, guardPath, recoveryPath });
      expect(first.read()).toEqual({
        version: "music-e2e-mutation-guard/v1", state: "clear", reason: "none", stage: "preflight",
      });
      expect(first.block("restore-failed", "restore")).toEqual({
        version: "music-e2e-mutation-guard/v1", state: "blocked", reason: "restore-failed", stage: "restore",
      });
      const fresh = create({ runDirectory, guardPath, recoveryPath });
      expect(fresh.read()).toEqual({
        version: "music-e2e-mutation-guard/v1", state: "blocked", reason: "restore-failed", stage: "restore",
      });
      expect(JSON.parse(readFileSync(guardPath, "utf8"))).toEqual(fresh.read());
    } finally {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  });

  it("makes a fresh controller refuse before invoking a mutation", async () => {
    // Production break caught: observing a durable record without enforcing it
    // still lets a restarted worker enter its mutation callback.
    const contract = await loadGuardContract();
    const create = contract.createMusicMutationGuard as (input: {
      runDirectory: string;
      guardPath: string;
      recoveryPath: string;
    }) => {
      block: (reason: string, stage: string) => unknown;
      runIfAllowed: <T>(mutation: () => T) => T;
    };
    expect(create).toBeTypeOf("function");
    if (!create) return;
    const runDirectory = mkdtempSync(join(tmpdir(), "music-mutation-refusal-"));
    const input = {
      runDirectory,
      guardPath: join(runDirectory, "mutation-guard.json"),
      recoveryPath: join(runDirectory, "mutation-recovery.private.jsonl"),
    };
    try {
      create(input).block("restore-mismatch", "verification");
      let invoked = 0;
      expect(() => create(input).runIfAllowed(() => { invoked += 1; }))
        .toThrow("MUSIC_MUTATION_BLOCKED");
      expect(invoked).toBe(0);
    } finally {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  });

  it("atomically retains only a fixed-code private recovery record inside the run", async () => {
    const contract = await loadGuardContract();
    const create = contract.createMusicMutationGuard as (input: {
      runDirectory: string; guardPath: string; recoveryPath: string;
    }) => { recordRecovery: (reason: string, stage: string) => unknown };
    expect(create).toBeTypeOf("function");
    if (!create) return;
    const runDirectory = mkdtempSync(join(tmpdir(), "music-mutation-recovery-"));
    const input = {
      runDirectory,
      guardPath: join(runDirectory, "mutation-guard.json"),
      recoveryPath: join(runDirectory, "mutation-recovery.private.jsonl"),
    };
    try {
      expect(create(input).recordRecovery("restore-failed", "restore")).toEqual({
        version: "music-e2e-mutation-recovery/v1", reason: "restore-failed", stage: "restore",
      });
      expect(JSON.parse(readFileSync(input.recoveryPath, "utf8"))).toEqual({
        version: "music-e2e-mutation-recovery/v1", reason: "restore-failed", stage: "restore",
      });
      expect(create(input).recordRecovery("restore-failed", "restore")).toEqual({
        version: "music-e2e-mutation-recovery/v1", reason: "restore-failed", stage: "restore",
      });
      expect(() => create(input).recordRecovery("password=C:\\private", "restore"))
        .toThrow("mutation recovery record is invalid");
    } finally {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  });

  it("accepts only the exact manifest-safe guard schema and fixed codes", async () => {
    // Production break caught: retaining arbitrary restore text in the guard
    // would leak paths, SQL, or credentials into immutable evidence.
    const contract = await loadGuardContract();
    const validate = contract.validateMusicMutationGuardRecord as undefined | ((value: unknown) => boolean);
    expect(validate).toBeTypeOf("function");
    if (!validate) return;
    expect(validate({
      version: "music-e2e-mutation-guard/v1", state: "clear", reason: "none", stage: "preflight",
    })).toBe(true);
    expect(validate({
      version: "music-e2e-mutation-guard/v1", state: "blocked", reason: "restore-failed", stage: "restore",
    })).toBe(true);
    expect(validate({
      version: "music-e2e-mutation-guard/v1", state: "blocked", reason: "profile-batch-failed", stage: "body",
    })).toBe(true);
    expect(validate({
      version: "music-e2e-mutation-guard/v1", state: "blocked", reason: "password=hostile", stage: "restore",
    })).toBe(false);
    expect(validate({
      version: "music-e2e-mutation-guard/v1", state: "blocked", reason: "restore-failed", stage: "restore",
      path: "C:\\private\\dump.sql",
    })).toBe(false);
  });

  it("rejects noncanonical names, escaping paths, and linked authority files", async () => {
    // Production break caught: a caller-selected or linked path could publish
    // safe evidence over another file or make cleanup escape the exclusive run.
    const contract = await loadGuardContract();
    const create = contract.createMusicMutationGuard as (input: {
      runDirectory: string;
      guardPath: string;
      recoveryPath: string;
    }) => unknown;
    expect(create).toBeTypeOf("function");
    if (!create) return;
    const runDirectory = mkdtempSync(join(tmpdir(), "music-mutation-path-"));
    const canonical = {
      runDirectory,
      guardPath: join(runDirectory, "mutation-guard.json"),
      recoveryPath: join(runDirectory, "mutation-recovery.private.jsonl"),
    };
    try {
      expect(() => create({ ...canonical, guardPath: join(runDirectory, "other.json") }))
        .toThrow("mutation guard path is unsafe");
      expect(() => create({ ...canonical, recoveryPath: join(runDirectory, "..", "escape.jsonl") }))
        .toThrow("mutation guard path is unsafe");
      const source = join(runDirectory, "linked-source");
      writeFileSync(source, "{}\n");
      linkSync(source, canonical.guardPath);
      expect(() => create(canonical)).toThrow("mutation guard path is unsafe");
    } finally {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  });

  it("fails closed if a guard becomes hard-linked after controller construction", async () => {
    // Production break caught: path validation only at controller construction
    // would let a later hard link turn the retained run artifact into shared state.
    const contract = await loadGuardContract();
    const create = contract.createMusicMutationGuard as (input: {
      runDirectory: string;
      guardPath: string;
      recoveryPath: string;
    }) => {
      read: () => unknown;
      block: (reason: string, stage: string) => unknown;
      runIfAllowed: <T>(mutation: () => T) => T;
    };
    expect(create).toBeTypeOf("function");
    if (!create) return;
    const runDirectory = mkdtempSync(join(tmpdir(), "music-mutation-link-race-"));
    const input = {
      runDirectory,
      guardPath: join(runDirectory, "mutation-guard.json"),
      recoveryPath: join(runDirectory, "mutation-recovery.private.jsonl"),
    };
    try {
      const controller = create(input);
      controller.block("restore-failed", "restore");
      linkSync(input.guardPath, join(runDirectory, "guard-alias.json"));
      expect(controller.read()).toEqual({
        version: "music-e2e-mutation-guard/v1",
        state: "blocked",
        reason: "guard-invalid",
        stage: "preflight",
      });
      let invoked = 0;
      expect(() => controller.runIfAllowed(() => { invoked += 1; }))
        .toThrow("MUSIC_MUTATION_BLOCKED");
      expect(invoked).toBe(0);
    } finally {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  });
});
