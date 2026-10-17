import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createLiveMusicReconciliationRunContext,
  createTrackedMusicReconciliationAuthorityFingerprint,
  MUSIC_RECONCILIATION_AUTHORITY_FILES,
  assertLiveMusicReconciliationWorktreeClean,
  parseMusicCliArguments,
  resolveMusicReconciliationCheckpointPath,
} from "../../../scripts/music-cli";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");

describe("music:reconcile CLI contract", () => {
  it("is a public root command with a safe dry-run default", () => {
    const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["music:reconcile"]).toBe("npm run --silent music-cli -- reconcile");
    expect(parseMusicCliArguments(["reconcile"])).toMatchObject({
      command: "reconcile",
      reconciliationMode: "dry-run",
      format: "human",
    });
  });

  it("accepts the explicit checkpoint/report flags", () => {
    expect(parseMusicCliArguments([
      "reconcile", "--dry-run", "--format", "json", "--checkpoint", ".artifacts/music-runs/review.json",
    ])).toMatchObject({
      command: "reconcile",
      reconciliationMode: "dry-run",
      format: "json",
      checkpoint: ".artifacts/music-runs/review.json",
    });
  });

  it("requires apply, approval, and reviewed resume intent to agree", () => {
    const token = "a".repeat(64);
    expect(parseMusicCliArguments([
      "reconcile", "--apply", "--approval-token", token,
      "--resume", ".artifacts/music-runs/review.json",
      "--checkpoint", ".artifacts/music-runs/apply.json",
    ])).toMatchObject({
      command: "reconcile",
      reconciliationMode: "apply",
      approvalToken: token,
      resume: ".artifacts/music-runs/review.json",
      checkpoint: ".artifacts/music-runs/apply.json",
    });
    for (const args of [
      ["reconcile", "--dry-run", "--apply"],
      ["reconcile", "--apply"],
      ["reconcile", "--apply", "--approval-token", token],
      ["reconcile", "--approval-token", token],
      ["reconcile", "--checkpoint", "--format", "json"],
    ]) expect(() => parseMusicCliArguments(args)).toThrow();
  });

  it("does not expose reconciliation flags to unrelated commands", () => {
    expect(() => parseMusicCliArguments(["doctor", "--apply", "--approval-token", "a".repeat(64)])).toThrow();
  });

  it("confines explicit checkpoints to the bounded Music artifact tree", () => {
    expect(resolveMusicReconciliationCheckpointPath(".artifacts/music-runs/review/checkpoint.json", "run"))
      .toMatch(/[\\/]\.artifacts[\\/]music-runs[\\/]review[\\/]checkpoint\.json$/);
    for (const path of ["outside.json", ".artifacts/outside.json", ".artifacts/music-runs/review/checkpoint.txt"]) {
      expect(() => resolveMusicReconciliationCheckpointPath(path, "run")).toThrow(/under \.artifacts\/music-runs/i);
    }
  });

  it("binds live resume evidence to redacted source, database, token-file, and gate authority", () => {
    const base = {
      commit: "abc123",
      fixtureVersion: "1",
      fixtureSchemaVersion: "strapi-identity-fixture/v1",
      gateValues: {},
      environmentFingerprint: "tracked",
    };
    const input = {
      base,
      environment: {
        STRAPI_RECONCILIATION_TOKEN_FILE: "/run/secrets/reconcile-a",
        STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: "/run/secrets/lifecycle-a",
        STRAPI_ACCESS_TOKEN_FILE: "/run/secrets/access-a",
        MUSIC_DATABASE_PASSWORD_FILE: "/run/secrets/database-a",
        MUSIC_RECONCILIATION_ENVIRONMENT: "staging",
        MUSIC_RECONCILIATION_APPLY_ENABLED: "false",
        MUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED: "true",
        MUSIC_RECONCILIATION_ENABLED: "false",
        MUSIC_RECONCILIATION_MAX_ROWS: "0",
      },
      sourceUrl: "https://strapi-a.example.test",
      databaseUrl: "postgresql://runtime:database-secret-a@db-a.example.test:5432/music_a",
      serviceToken: "service-secret-a",
      credentialAuthorities: {
        reconciliation: { nativeDev: "1", nativeIno: "11", digest: "1".repeat(64) },
        lifecycleProof: { nativeDev: "1", nativeIno: "12", digest: "2".repeat(64) },
        access: { nativeDev: "1", nativeIno: "13", digest: "3".repeat(64) },
      },
    };
    const context = createLiveMusicReconciliationRunContext(input);
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("service-secret-a");
    expect(serialized).not.toContain("database-secret-a");
    expect(context.gateValues).toMatchObject({
      MUSIC_RECONCILIATION_ENVIRONMENT: "staging",
      MUSIC_RECONCILIATION_APPLY_ENABLED: "false",
      MUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED: "true",
    });

    for (const changed of [
      { sourceUrl: "https://strapi-b.example.test" },
      { databaseUrl: "postgresql://runtime:database-secret-a@db-b.example.test:5432/music_a" },
      { databaseUrl: "postgresql://runtime_b:database-secret-a@db-a.example.test:5432/music_a" },
      { serviceToken: "service-secret-b" },
      { base: { ...base, environmentFingerprint: "changed-code-authority" } },
      { environment: { ...input.environment, STRAPI_RECONCILIATION_TOKEN_FILE: "/run/secrets/reconcile-b" } },
      { environment: { ...input.environment, STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: "/run/secrets/lifecycle-b" } },
      { environment: { ...input.environment, STRAPI_ACCESS_TOKEN_FILE: "/run/secrets/access-b" } },
      { credentialAuthorities: { ...input.credentialAuthorities, lifecycleProof: { nativeDev: "1", nativeIno: "12", digest: "4".repeat(64) } } },
      { credentialAuthorities: { ...input.credentialAuthorities, access: { nativeDev: "1", nativeIno: "14", digest: "3".repeat(64) } } },
      { environment: { ...input.environment, MUSIC_RECONCILIATION_APPLY_ENABLED: "true" } },
    ]) {
      expect(createLiveMusicReconciliationRunContext({ ...input, ...changed }).environmentFingerprint)
        .not.toBe(context.environmentFingerprint);
    }
  });

  it("binds same-commit resume evidence to every executable reconciliation authority file", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "music-reconcile-authority-"));
    for (const file of MUSIC_RECONCILIATION_AUTHORITY_FILES) {
      const target = join(sandbox, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `authority:${file}\n`);
    }
    const before = createTrackedMusicReconciliationAuthorityFingerprint(sandbox);
    await writeFile(join(sandbox, "tunes/server/services/musicReconciler.ts"), "changed at the same commit\n");
    expect(createTrackedMusicReconciliationAuthorityFingerprint(sandbox)).not.toBe(before);
  });

  it("refuses live review or apply from any dirty non-ignored worktree", () => {
    expect(() => assertLiveMusicReconciliationWorktreeClean(" M tunes/server/config/music-database-config.ts\n"))
      .toThrow(/clean tracked worktree/i);
    expect(() => assertLiveMusicReconciliationWorktreeClean("?? untracked-authority.ts\n"))
      .toThrow(/clean tracked worktree/i);
    expect(() => assertLiveMusicReconciliationWorktreeClean("\n")).not.toThrow();
  });

  it("attests the runtime role and exact migration before contacting the live source", () => {
    const cli = readFileSync(resolve(repositoryRoot, "tunes/scripts/music-cli.ts"), "utf8");
    expect(cli).toContain("await verifyMusicRuntimeDatabaseConnection(database");
    expect(cli).toContain("await checkMusicDatabaseReadiness(pool)");
    expect(cli.indexOf("await checkMusicDatabaseReadiness(pool)"))
      .toBeLessThan(cli.indexOf("new command.HttpMusicReconciliationSource"));
  });

  it("requires and native-identity-checks every live token authority before database or source access", () => {
    const cli = readFileSync(resolve(repositoryRoot, "tunes/scripts/music-cli.ts"), "utf8");
    const parse = cli.indexOf("parseMusicReconciliationCommandConfig(environment)");
    const identityCheck = cli.indexOf("readSecureMusicReconciliationAuthorities(");
    const database = cli.indexOf("resolveMusicDatabaseConnection(environment, \"runtime\")");
    const source = cli.indexOf("new command.HttpMusicReconciliationSource");
    expect(parse).toBeGreaterThan(-1);
    expect(identityCheck).toBeGreaterThan(parse);
    expect(identityCheck).toBeLessThan(database);
    expect(identityCheck).toBeLessThan(source);
    expect(cli).toContain("config.lifecycleProofTokenFile!");
    expect(cli).toContain("config.accessTokenFile!");
    expect(cli).toContain("environment.STRAPI_ACCESS_TOKEN");
  });

  it("maps typed resume drift to the common prerequisite/state-mismatch exit", () => {
    const cli = readFileSync(resolve(repositoryRoot, "tunes/scripts/music-cli.ts"), "utf8");
    expect(cli).toContain("error instanceof command.MusicReconciliationResumeError");
    expect(cli).toContain("throw new ResumeMismatchError(redactedError(error))");
    expect(cli).toContain("prerequisite: 3");
  });
});
