import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { aroundAll, describe, expect, it } from "vitest";
import { createEnvironmentFingerprint, readGitSha, redactStructuredData, resolveNpmCommand, terminateBeforeCheckpoint, validateRetainedFixtureVolume } from "../../../scripts/music-cli.ts";
import {
  assertMusicCliContractDockerEnvironment,
  musicCliContractChildEnvironment,
  readMusicCliContractDockerTrace,
  type MusicCliContractAuthority,
} from "../../../scripts/music-cli-contract-authority.ts";
import { cleanupAllFixtureMusicTokenSecrets, persistFixtureMusicEnvironment, readFixtureMusicEnvironment, rotateFixtureMusicAuthority, withAllFixtureMusicSecretsCleanup } from "../../../scripts/music-fixture-secret.ts";
import { withIsolatedMusicCliContractRepository } from "./helpers/music-cli-contract-isolation.ts";

const sourceTunesRoot = resolve(import.meta.dirname, "../../..");
const sourceRepositoryRoot = resolve(sourceTunesRoot, "..");
const tsxCli = join(sourceTunesRoot, "node_modules", "tsx", "dist", "cli.mjs");
let tunesRoot: string;
let repositoryRoot: string;
let cliAuthority: MusicCliContractAuthority;

function ensureSupportedCliFixtureAuthority(): void {
  try {
    let contents = readFixtureMusicEnvironment(repositoryRoot);
    const normalized = `${contents.split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith("#")).join("\n")}\n`;
    if (normalized !== contents) {
      persistFixtureMusicEnvironment(repositoryRoot, normalized);
      contents = normalized;
    }
    const values = Object.fromEntries(contents.trim().split(/\r?\n/).map((line) => line.split("=", 2)));
    if (values.MUSIC_PUBLICATION_RESPONSE_CURRENT_KID !== "fixture-publication-v1"
        || values.MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY !== "fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI"
        || values.MUSIC_PUBLIC_ID_HMAC_KEY !== "VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ"
        || values.MUSIC_EXPECTED_MIGRATION_ID !== "0036_explorers_analytics_events") {
      throw new Error("fixture environment authority is from an older schema epoch");
    }
    const tokenDirectory = resolve(repositoryRoot, ".artifacts", "music-token-secrets");
    for (const key of ["MUSIC_TOKEN_SECRET_FILE_HOST", "MUSIC_DB_MIGRATOR_SECRET_FILE_HOST", "MUSIC_DB_RUNTIME_SECRET_FILE_HOST"]) {
      const path = resolve(repositoryRoot, values[key]);
      if (dirname(path) !== tokenDirectory || !/^current-[a-f0-9]{32}$/.test(basename(path))) throw new Error("fixture credential authority is invalid");
      if (!existsSync(path) || readFileSync(path).length === 0) writeFileSync(path, Buffer.alloc(32, 0x71), { mode: 0o600 });
    }
  }
  catch {
    rotateFixtureMusicAuthority(repositoryRoot, (paths) => {
      const fixturePath = (path: string) => `./${path.slice(repositoryRoot.length + 1).replace(/\\/g, "/")}`;
      return `${readFileSync(join(repositoryRoot, ".env.music.test.example"), "utf8").split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith("#")).join("\n")}\n`
        .replace(/^MUSIC_TOKEN_SECRET_FILE_HOST=.*\r?$/m, `MUSIC_TOKEN_SECRET_FILE_HOST=${fixturePath(paths.tokenPath)}`)
        .replace(/^MUSIC_DB_MIGRATOR_SECRET_FILE_HOST=.*\r?$/m, `MUSIC_DB_MIGRATOR_SECRET_FILE_HOST=${fixturePath(paths.migratorPasswordPath)}`)
        .replace(/^MUSIC_DB_RUNTIME_SECRET_FILE_HOST=.*\r?$/m, `MUSIC_DB_RUNTIME_SECRET_FILE_HOST=${fixturePath(paths.runtimePasswordPath)}`);
    });
  }
}

aroundAll(async (runSuite) => {
  await withIsolatedMusicCliContractRepository(sourceRepositoryRoot, async (isolated) => {
    repositoryRoot = isolated.repositoryRoot;
    tunesRoot = isolated.tunesRoot;
    cliAuthority = isolated.cliAuthority;
    ensureSupportedCliFixtureAuthority();
    await runSuite();
  });
}, 120_000);

function npmCliArgs(args: string[]): string[] {
  if (!process.env.npm_execpath) throw new Error("npm_execpath is required for the public command contract test");
  return [process.env.npm_execpath, ...args];
}

function runCli(args: string[], env?: NodeJS.ProcessEnv) {
  const boundedEnvironment = musicCliContractChildEnvironment(cliAuthority, env);
  assertMusicCliContractDockerEnvironment(boundedEnvironment);
  try {
    const stdout = execFileSync(process.execPath, [tsxCli, "scripts/music-cli.ts", ...args], {
      cwd: tunesRoot,
      encoding: "utf8",
      env: boundedEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { exitCode: failure.status, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

function snapshotAuthorityDirectory(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return Object.fromEntries(readdirSync(path).sort().flatMap((name) => {
    const entry = join(path, name);
    return lstatSync(entry).isFile() ? [[name, readFileSync(entry).toString("base64")]] : [];
  }));
}

function restoreAuthorityDirectory(path: string, snapshot: Record<string, string>): void {
  mkdirSync(path, { recursive: true });
  for (const name of readdirSync(path)) {
    if (!(name in snapshot)) rmSync(join(path, name), { recursive: true, force: true });
  }
  for (const [name, bytes] of Object.entries(snapshot)) {
    writeFileSync(join(path, name), Buffer.from(bytes, "base64"), { mode: 0o600 });
  }
}

describe("music CLI output contract", () => {
  it("accepts only the exact labeled retained fixture volumes", () => {
    const valid = {
      Name: "explorers-music-fixture_music-fixture-postgres",
      CreatedAt: "2026-08-24T00:00:00Z",
      Mountpoint: "/var/lib/docker/volumes/fixture/_data",
      Labels: {
        "com.explorers.music.fixture": "true",
        "com.explorers.music.project": "explorers-music-fixture",
        "com.docker.compose.project": "explorers-music-fixture",
        "com.docker.compose.volume": "music-fixture-postgres",
      },
    };
    expect(() => validateRetainedFixtureVolume(valid, "music-fixture-postgres")).not.toThrow();
    for (const hostile of [
      { ...valid, Name: "production_music-fixture-postgres" },
      { ...valid, CreatedAt: undefined },
      { ...valid, Mountpoint: undefined },
      { ...valid, Labels: { ...valid.Labels, "com.explorers.music.fixture": "false" } },
      { ...valid, Labels: { ...valid.Labels, "com.explorers.music.project": "production" } },
      { ...valid, Labels: { ...valid.Labels, "com.docker.compose.project": "other" } },
      { ...valid, Labels: { ...valid.Labels, "com.docker.compose.volume": "other" } },
    ]) expect(() => validateRetainedFixtureVolume(hostile, "music-fixture-postgres")).toThrow(/ownership validation/);
  });

  it("checks retained-volume recovery before bootstrap credential rotation", () => {
    const source = readFileSync(join(tunesRoot, "scripts", "music-cli.ts"), "utf8");
    const preflight = source.indexOf('fixtureAuthorityState === "tombstone"');
    const rotation = source.indexOf("createTestEnv();", preflight);
    expect(preflight).toBeGreaterThan(0);
    expect(rotation).toBeGreaterThan(preflight);
    expect(source.slice(preflight, rotation)).toContain("music:db:reset");
    expect(source).toContain("removeRetainedFixtureVolumes(id)");
  });

  it("rotates fixture authority without erasing the prior bundle before pointer commit", () => {
    const source = readFileSync(join(tunesRoot, "scripts", "music-cli.ts"), "utf8");
    const start = source.indexOf("function createTestEnv");
    const publicIdAuthority = source.slice(source.indexOf("function withFixturePublicIdAuthority"), start);
    const end = source.indexOf("async function fixtureMigratorUrl", start);
    const rotation = source.slice(start, end);
    expect(rotation).not.toContain("cleanupAllFixtureMusicTokenSecrets(root)");
    expect(rotation).toContain("rotateFixtureMusicAuthority");
    expect(rotation).toContain("MUSIC_PUBLICATION_RESPONSE_CURRENT_KID=fixture-publication-v1");
    expect(rotation).toContain("MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY=fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI");
    expect(publicIdAuthority).toContain("MUSIC_PUBLIC_ID_HMAC_KEY=VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ");
    expect(rotation).not.toContain("cleanupUnsupportedFixtureEnvironmentForRebootstrap");
    expect(rotation).not.toContain("confirmedProject");
    expect(rotation).not.toContain("legacyUpgrade");
  });

  it("returns a secret-free typed refusal for raw fixture authority without mutating its bundle", () => {
    const environmentPath = join(repositoryRoot, ".env.music.test");
    const pointerBefore = readFileSync(environmentPath);
    const environmentBefore = readFixtureMusicEnvironment(repositoryRoot);
    const environmentValues = Object.fromEntries(environmentBefore.trim().split(/\r?\n/).map((line) => line.split("=", 2)));
    const credentials = ["MUSIC_TOKEN_SECRET_FILE_HOST", "MUSIC_DB_MIGRATOR_SECRET_FILE_HOST", "MUSIC_DB_RUNTIME_SECRET_FILE_HOST"]
      .map((name) => resolve(repositoryRoot, environmentValues[name]))
      .filter(existsSync);
    const credentialBytes = credentials.map((path) => readFileSync(path));
    const authorityDirectories = [
      join(repositoryRoot, ".artifacts", "music-token-secrets"),
      join(repositoryRoot, ".artifacts", "music-environment-generations"),
      join(repositoryRoot, ".artifacts", "music-rotation-journals"),
    ];
    const authorityBefore = authorityDirectories.map(snapshotAuthorityDirectory);
    const raw = "RAW_FIXTURE_SECRET_SENTINEL=must-not-be-reflected\nMUSIC_TOKEN_SECRET_FILE_HOST=../must-not-be-read\n";
    writeFileSync(environmentPath, raw, { mode: 0o600 });
    try {
      const result = runCli(["bootstrap", "--format", "json"]);
      const lines = result.stdout.trim().split(/\r?\n/);
      expect(result.exitCode).toBe(5);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!)).toMatchObject({
        command: "bootstrap",
        status: "blocked",
        phase: "fixture-authority",
      });
      expect(result.stdout).toContain("MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED");
      expect(result.stdout).toContain("discard");
      expect(result.stdout).not.toContain("cleanup/re-bootstrap");
      expect(result.stdout).not.toContain("RAW_FIXTURE_SECRET_SENTINEL");
      expect(readFileSync(environmentPath, "utf8")).toBe(raw);
      expect(credentials.map((path) => readFileSync(path))).toEqual(credentialBytes);
      expect(authorityDirectories.map(snapshotAuthorityDirectory)).toEqual(authorityBefore);
    } finally {
      writeFileSync(environmentPath, pointerBefore, { mode: 0o600 });
    }
  });

  const unsupportedAuthorityCommands = [
    { name: "confirmed bootstrap", args: ["bootstrap", "--mode", "fixture", "--confirm-project", "explorers-music-fixture"] },
    { name: "doctor", args: ["doctor"] },
    { name: "up", args: ["up", "--detach", "--wait"] },
    { name: "smoke", args: ["test:smoke"] },
    { name: "full test", args: ["test:all"] },
    { name: "down", args: ["down", "--mode", "fixture", "--volumes", "--confirm-project", "explorers-music-fixture"] },
    { name: "database status", args: ["db:status", "--target", "test"] },
    { name: "database migrate", args: ["db:migrate", "--target", "test"] },
    { name: "database verify", args: ["db:verify", "--target", "test"] },
    { name: "database reset", args: ["db:reset", "--mode", "fixture", "--target", "test", "--volumes", "--confirm-project", "explorers-music-fixture"] },
    { name: "fixture capture", args: ["fixtures:capture"] },
  ];
  const unsupportedAuthorityKinds = [
    { name: "raw", contents: "RAW_FIXTURE_SECRET_SENTINEL=must-not-be-reflected\n" },
    { name: "malformed", contents: "music-fixture-env/v1\ngeneration=not-authority\nsha256=MALFORMED_RAW_FIXTURE_SECRET_SENTINEL\nsize=nope\n" },
  ];

  it.each(unsupportedAuthorityCommands.flatMap((command) => unsupportedAuthorityKinds.map((authority) => ({ command, authority }))))(
    "refuses $command.name with $authority.name fixture authority before any in-app mutation",
    ({ command, authority }) => {
      // Production break caught: an exact project confirmation turns raw
      // fixture bytes into cleanup authority and reaches npm/Docker work.
      const environmentPath = join(repositoryRoot, ".env.music.test");
      const pointerBefore = readFileSync(environmentPath);
      const authorityDirectories = [
        join(repositoryRoot, ".artifacts", "music-token-secrets"),
        join(repositoryRoot, ".artifacts", "music-environment-generations"),
        join(repositoryRoot, ".artifacts", "music-rotation-journals"),
      ];
      const authorityBefore = authorityDirectories.map(snapshotAuthorityDirectory);
      const cleanupIntent = join(repositoryRoot, ".artifacts", "music-fixture-cleanup.intent");
      const cleanupIntentBefore = existsSync(cleanupIntent) ? readFileSync(cleanupIntent) : undefined;
      const fakeDirectory = mkdtempSync(join(tmpdir(), "music-cli-no-mutation-"));
      const mutationMarker = join(fakeDirectory, "child-invoked");
      const fakeNpm = join(fakeDirectory, "npm-cli.cjs");
      writeFileSync(fakeNpm, "require('node:fs').writeFileSync(process.env.MUSIC_TEST_MUTATION_MARKER, 'invoked');\n");
      writeFileSync(environmentPath, authority.contents, { mode: 0o600 });
      try {
        const result = runCli([...command.args, "--format", "json"], {
          ...process.env,
          npm_execpath: fakeNpm,
          MUSIC_TEST_MUTATION_MARKER: mutationMarker,
        });
        const lines = result.stdout.trim().split(/\r?\n/);
        expect(result.exitCode).toBe(5);
        expect(lines).toHaveLength(1);
        const envelope = JSON.parse(lines[0]!) as {
          status: string;
          phase: string;
          error: string;
          artifacts: string[];
          nextCommand: string;
          recoveryCommand: string;
        };
        expect(envelope).toMatchObject({ status: "blocked", phase: "fixture-authority", artifacts: [] });
        expect(envelope.error).toContain("MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED");
        expect(envelope.error).toContain("discard");
        expect(envelope.error).not.toContain("cleanup/re-bootstrap");
        expect(envelope.nextCommand).toContain("discard");
        expect(envelope.recoveryCommand).toContain("clean checkout");
        expect(envelope.nextCommand).not.toContain("npm run");
        expect(envelope.recoveryCommand).not.toContain("npm run");
        expect(result.stdout).not.toContain("RAW_FIXTURE_SECRET_SENTINEL");
        expect(result.stdout).not.toContain("MALFORMED_RAW_FIXTURE_SECRET_SENTINEL");
        expect(readFileSync(environmentPath, "utf8")).toBe(authority.contents);
        expect(authorityDirectories.map(snapshotAuthorityDirectory)).toEqual(authorityBefore);
        expect(existsSync(mutationMarker)).toBe(false);
        expect(existsSync(cleanupIntent) ? readFileSync(cleanupIntent) : undefined).toEqual(cleanupIntentBefore);
      } finally {
        writeFileSync(environmentPath, pointerBefore, { mode: 0o600 });
        authorityDirectories.forEach((path, index) => restoreAuthorityDirectory(path, authorityBefore[index]!));
        if (cleanupIntentBefore === undefined) rmSync(cleanupIntent, { force: true });
        else writeFileSync(cleanupIntent, cleanupIntentBefore, { mode: 0o600 });
        rmSync(fakeDirectory, { recursive: true, force: true });
      }
    },
    30_000,
  );

  const unsupportedAuthorityArgumentCases = [
    { name: "invalid mode", args: ["doctor", "--mode", "invalid", "--format", "json"], parsed: false },
    { name: "invalid format", args: ["doctor", "--format", "yaml"], parsed: false },
    { name: "unknown option", args: ["doctor", "--unknown-option", "sentinel", "--format", "json"], parsed: false },
    { name: "missing command", args: ["--format", "json"], parsed: false },
    { name: "unknown command", args: ["unknown-command", "--format", "json"], parsed: false },
    { name: "malformed resume syntax", args: ["bootstrap", "--resume", "--format", "json"], parsed: false },
    { name: "valid resume", args: ["bootstrap", "--resume", "C:\\must-not-be-read\\checkpoint.json", "--format", "json"], parsed: true },
  ];

  it.each(unsupportedAuthorityArgumentCases.flatMap((argumentCase) => unsupportedAuthorityKinds.map((authority) => ({ argumentCase, authority }))))(
    "lets $authority.name unsupported authority win over $argumentCase.name before argument handling",
    ({ argumentCase, authority }) => {
      // Production break caught: full argument parsing or resume validation
      // throws before raw fixture authority receives the one safety response.
      const environmentPath = join(repositoryRoot, ".env.music.test");
      const pointerBefore = readFileSync(environmentPath);
      const authorityDirectories = [
        join(repositoryRoot, ".artifacts", "music-token-secrets"),
        join(repositoryRoot, ".artifacts", "music-environment-generations"),
        join(repositoryRoot, ".artifacts", "music-rotation-journals"),
      ];
      const authorityBefore = authorityDirectories.map(snapshotAuthorityDirectory);
      const fakeDirectory = mkdtempSync(join(tmpdir(), "music-cli-preparse-no-mutation-"));
      const mutationMarker = join(fakeDirectory, "child-invoked");
      const fakeNpm = join(fakeDirectory, "npm-cli.cjs");
      writeFileSync(fakeNpm, "require('node:fs').writeFileSync(process.env.MUSIC_TEST_MUTATION_MARKER, 'invoked');\n");
      writeFileSync(environmentPath, authority.contents, { mode: 0o600 });
      try {
        const result = runCli(argumentCase.args, {
          ...process.env,
          npm_execpath: fakeNpm,
          MUSIC_TEST_MUTATION_MARKER: mutationMarker,
        });
        expect(result.exitCode).toBe(5);
        expect(result.stderr).toBe("");
        expect((result.stdout.match(/MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED/g) ?? [])).toHaveLength(1);
        expect(result.stdout).toContain("fixture-authority");
        expect(result.stdout).toContain("discard");
        expect(result.stdout).toContain("clean checkout");
        expect(result.stdout).not.toContain("RAW_FIXTURE_SECRET_SENTINEL");
        expect(result.stdout).not.toContain("MALFORMED_RAW_FIXTURE_SECRET_SENTINEL");
        expect(result.stdout).not.toContain("at main");
        if (argumentCase.parsed) {
          expect(result.stdout.trim().split(/\r?\n/)).toHaveLength(1);
          expect(JSON.parse(result.stdout)).toMatchObject({ command: "bootstrap", status: "blocked", phase: "fixture-authority" });
        }
        expect(readFileSync(environmentPath, "utf8")).toBe(authority.contents);
        expect(authorityDirectories.map(snapshotAuthorityDirectory)).toEqual(authorityBefore);
        expect(existsSync(mutationMarker)).toBe(false);
      } finally {
        writeFileSync(environmentPath, pointerBefore, { mode: 0o600 });
        authorityDirectories.forEach((path, index) => restoreAuthorityDirectory(path, authorityBefore[index]!));
        rmSync(fakeDirectory, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it("emits only a JSON envelope through the documented public root command", () => {
    // Production break caught: tests bypass the npm entrypoint, while the
    // documented command prepends npm banners that break JSON parsers.
    const output = execFileSync(process.execPath, npmCliArgs(["run", "--silent", "music:fixtures:capture", "--", "--format", "json"]), {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: musicCliContractChildEnvironment(cliAuthority),
    });
    const envelope = JSON.parse(output.trim());
    expect(envelope).toMatchObject({ schemaVersion: "music-cli/v1", command: "fixtures:capture", status: "success", phase: "fixture-capture" });
    expect(envelope.runId).toEqual(expect.any(String));
    expect(envelope.checkpoint).toEqual(expect.any(String));
    const rootPackage = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
    const tunesPackage = JSON.parse(readFileSync(join(tunesRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(rootPackage.scripts["music-cli"]).toContain("tsx tunes/scripts/music-cli.ts");
    expect(rootPackage.scripts["music:fixtures:capture"]).toContain("npm run --silent music-cli");
    expect(tunesPackage.scripts["music:types:baseline"]).toBe("tsx scripts/music-typescript-baseline.ts --compare");
  });

  it("resolves the actual SHA from a normal checkout whose .git is a directory", () => {
    // Production break caught: SHA resolution always reads `.git` as a text
    // worktree pointer and crashes in a normal clone.
    const checkout = mkdtempSync(join(tmpdir(), "music-git-directory-"));
    mkdirSync(join(checkout, ".git", "refs", "heads"), { recursive: true });
    writeFileSync(join(checkout, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(checkout, ".git", "refs", "heads", "main"), "0123456789abcdef0123456789abcdef01234567\n");
    expect(readGitSha(checkout)).toBe("0123456789abcdef0123456789abcdef01234567");
  });

  it("changes the resume fingerprint when material configuration changes", () => {
    // Production break caught: resume accepts a changed Compose/application
    // topology because the fingerprint contains only OS, Node and gate values.
    const base = { platform: "win32", node: "22.12.0", configurationHashes: { compose: "hash-a", env: "hash-b" } };
    expect(createEnvironmentFingerprint(base)).not.toBe(createEnvironmentFingerprint({ ...base, configurationHashes: { ...base.configurationHashes, compose: "changed" } }));
  });

  it("awaits owned-child termination before writing an interruption checkpoint", async () => {
    // Production break caught: SIGTERM writes resumable evidence while an
    // owned child can still mutate fixture state.
    const events: string[] = [];
    await terminateBeforeCheckpoint(
      async () => { await new Promise((resolveWait) => setTimeout(resolveWait, 5)); events.push("terminated"); },
      () => { events.push("checkpoint"); },
    );
    expect(events).toEqual(["terminated", "checkpoint"]);
  });

  it("redacts quoted structured secret keys before artifact persistence", () => {
    // Production break caught: rendered Compose JSON persists values under
    // quoted POSTGRES_PASSWORD/authorization keys despite text redaction.
    expect(redactStructuredData({
      POSTGRES_PASSWORD: "quoted-secret",
      nested: { authorization: "Bearer private-token", safe: "visible" },
    })).toEqual({
      POSTGRES_PASSWORD: "[REDACTED]",
      nested: { authorization: "[REDACTED]", safe: "visible" },
    });
  });

  it("persists rendered Compose evidence with structured secrets redacted", () => {
    const result = runCli(["doctor", "--format", "json"]);
    const envelope = JSON.parse(result.stdout) as { artifacts: string[] };
    const composeArtifact = envelope.artifacts.find((artifact) => artifact.includes("compose-config"));
    expect(composeArtifact).toBeDefined();
    const evidence = readFileSync(resolve(repositoryRoot, composeArtifact!), "utf8");
    expect(evidence).toContain("[DOCKER_STRUCTURED_OUTPUT_REDACTED bytes=");
    expect(evidence).not.toContain('"POSTGRES_PASSWORD":"music"');
    expect(evidence).not.toContain("fixture-read-only-token");
    expect(evidence).not.toContain("--env-file");
  }, 15_000);

  it("returns a typed JSON doctor diagnosis for an invalid environment", () => {
    // Production break caught: run-context parsing throws before doctor can
    // emit its documented JSON failure and recovery guidance.
    const environmentPath = join(repositoryRoot, ".env.music.test");
    const previous = existsSync(environmentPath) ? readFileSync(environmentPath, "utf8") : undefined;
    const generationDirectory = join(repositoryRoot, ".artifacts", "music-environment-generations");
    const generationsBefore = snapshotAuthorityDirectory(generationDirectory);
    persistFixtureMusicEnvironment(repositoryRoot, "MUSIC_MODE=fixture\nDATABASE_URL_TEST=postgresql://production.example/music\n");
    try {
      const result = runCli(["doctor", "--format", "json"]);
      expect(result.exitCode).toBe(3);
      expect(JSON.parse(result.stdout)).toMatchObject({ command: "doctor", status: "failure", phase: "doctor" });
    } finally {
      if (previous === undefined) rmSync(environmentPath, { force: true });
      else writeFileSync(environmentPath, previous);
      restoreAuthorityDirectory(generationDirectory, generationsBefore);
    }
  }, 30_000);

  it("returns one typed JSON doctor diagnosis for malformed env-file syntax", () => {
    // Production break caught: a line without '=' throws while constructing
    // run context, before doctor can emit its categorized JSON result.
    const environmentPath = join(repositoryRoot, ".env.music.test");
    const previous = existsSync(environmentPath) ? readFileSync(environmentPath, "utf8") : undefined;
    const generationDirectory = join(repositoryRoot, ".artifacts", "music-environment-generations");
    const generationsBefore = snapshotAuthorityDirectory(generationDirectory);
    persistFixtureMusicEnvironment(repositoryRoot, "MUSIC_MODE=fixture\nMALFORMED_LINE_WITHOUT_EQUALS\n");
    try {
      const result = runCli(["doctor", "--format", "json"]);
      const lines = result.stdout.trim().split(/\r?\n/);
      expect(result.exitCode).toBe(3);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({ command: "doctor", status: "failure", phase: "doctor" });
    } finally {
      if (previous === undefined) rmSync(environmentPath, { force: true });
      else writeFileSync(environmentPath, previous);
      restoreAuthorityDirectory(generationDirectory, generationsBefore);
    }
  }, 30_000);

  it("refuses resume when the checkpoint commit differs", () => {
    // Production break caught: a resumed provisioning run could apply evidence
    // produced by another source revision.
    const checkpointDirectory = mkdtempSync(join(tmpdir(), "music-cli-contract-"));
    const checkpoint = join(checkpointDirectory, "checkpoint.json");
    const environmentPath = join(repositoryRoot, ".env.music.test");
    const environmentBefore = readFileSync(environmentPath, "utf8");
    const environmentValues = Object.fromEntries(readFixtureMusicEnvironment(repositoryRoot).trim().split(/\r?\n/).map((line) => line.split("=", 2)));
    const credentialPaths = ["MUSIC_TOKEN_SECRET_FILE_HOST", "MUSIC_DB_MIGRATOR_SECRET_FILE_HOST", "MUSIC_DB_RUNTIME_SECRET_FILE_HOST"]
      .map((name) => resolve(repositoryRoot, environmentValues[name])).filter(existsSync);
    const credentialBytesBefore = credentialPaths.map((path) => readFileSync(path));
    const captured = JSON.parse(runCli(["fixtures:capture", "--format", "json"]).stdout) as { checkpoint: string };
    const currentCheckpoint = JSON.parse(readFileSync(resolve(repositoryRoot, captured.checkpoint), "utf8")) as Record<string, unknown>;
    writeFileSync(checkpoint, JSON.stringify({ ...currentCheckpoint, commit: "previous-commit" }));
    try {
      execFileSync(process.execPath, [tsxCli, "scripts/music-cli.ts", "bootstrap", "--resume", checkpoint, "--format", "json"], {
        cwd: tunesRoot,
        encoding: "utf8",
        env: musicCliContractChildEnvironment(cliAuthority),
        stdio: ["ignore", "pipe", "pipe"],
      });
      throw new Error("expected the resume safety refusal");
    } catch (error) {
      const failure = error as { status?: number; stdout?: string };
      expect(failure.status).toBe(3);
      expect(failure.stdout).toContain("resume checkpoint commit does not match");
    }
    expect(readFileSync(environmentPath, "utf8")).toBe(environmentBefore);
    expect(credentialPaths.map((path) => readFileSync(path))).toEqual(credentialBytesBefore);
  });

  it("safety-refuses db:migrate without an explicit disposable target", () => {
    // Production break caught: a versioned migrator reads an ambient production
    // DATABASE_URL when the operator did not explicitly select the test target.
    const result = runCli(["db:migrate", "--format", "json"], {
      ...process.env,
      DATABASE_URL: "postgresql://owner:secret@production.example.com:5432/music",
    });

    expect(result.exitCode).toBe(5);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "db:migrate",
      status: "blocked",
      phase: "database-target",
    });
  });

  it("resolves npm through npm_execpath on Windows and Ubuntu/nvm", () => {
    // Production break caught: bootstrap hardcodes the Windows Node install
    // layout and cannot install child lockfiles on Ubuntu under nvm.
    expect(resolveNpmCommand({ npmExecPath: "C:\\node\\npm-cli.js", nodeExecPath: "C:\\node\\node.exe", platform: "win32" })).toEqual({
      file: "C:\\node\\node.exe",
      args: ["C:\\node\\npm-cli.js"],
    });
    expect(resolveNpmCommand({ npmExecPath: "/home/dev/.nvm/versions/node/v22/lib/node_modules/npm/bin/npm-cli.js", nodeExecPath: "/home/dev/.nvm/versions/node/v22/bin/node", platform: "linux" })).toEqual({
      file: "/home/dev/.nvm/versions/node/v22/bin/node",
      args: ["/home/dev/.nvm/versions/node/v22/lib/node_modules/npm/bin/npm-cli.js"],
    });
    expect(resolveNpmCommand({ nodeExecPath: "C:\\Program Files\\nodejs\\node.exe", platform: "win32" })).toEqual({
      file: "C:\\Program Files\\nodejs\\node.exe",
      args: ["C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"],
    });
  });

  it("emits exactly one JSON object and preserves verification failure category", () => {
    // Production break caught: child stdout corrupts JSON automation and a
    // failed smoke assertion is mislabeled as dependency unavailable.
    const result = runCli(["test:smoke", "--format", "json"]);
    const lines = result.stdout.trim().split(/\r?\n/);

    expect(result.exitCode, JSON.stringify(result)).toBe(1);
    expect(lines).toHaveLength(1);
    const envelope = JSON.parse(lines[0]) as { command: string; phase: string; status: string; error: string };
    expect(envelope).toMatchObject({ command: "test:smoke", phase: "smoke", status: "failure" });
    const childArtifact = envelope.error.match(/see (\.artifacts\/music-runs\/[A-Za-z0-9._/-]+child-[A-Za-z0-9._-]+-smoke\.log)/)?.[1];
    expect(childArtifact).toMatch(/^\.artifacts\/music-runs\//);
    expect(childArtifact).not.toContain("..");
    const childEvidence = readFileSync(resolve(repositoryRoot, childArtifact!), "utf8");
    expect(childEvidence).toContain("exit=1");
    expect(childEvidence).not.toContain("hostile-child-secret");
    expect(childEvidence).not.toContain("hostile-child-token");
  });

  it("returns a typed nonzero cleanup failure with only the exact recovery target identifier", () => {
    // Production break caught: down/reset reports success or only the action
    // error after a credential erasure syscall fails.
    const targetId = `.env.music.test.${"a".repeat(32)}.tmp`;
    const target = join(repositoryRoot, targetId);
    mkdirSync(target);
    try {
      const result = runCli(["down", "--format", "json"]);
      const envelope = JSON.parse(result.stdout) as { status: string; error?: string };
      expect(result.exitCode).not.toBe(0);
      expect(envelope.status).toBe("failure");
      expect(envelope.error).toContain(targetId);
      expect(envelope.error).not.toContain(repositoryRoot);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("runs interrupted-fixture recovery and ignores an unreferenced secret-name directory", async () => {
    const targetId = `current-${"1".repeat(32)}`;
    const target = join(repositoryRoot, ".artifacts", "music-token-secrets", targetId);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target);
    let recovered = false;
    try {
      await expect(withAllFixtureMusicSecretsCleanup(repositoryRoot, async () => {
        recovered = true;
      })).resolves.toBeUndefined();
      expect(recovered).toBe(true);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("reaches the guarded cleanup action on a second down after authority is already retired", () => {
    const traceOffset = readMusicCliContractDockerTrace(cliAuthority.dockerTrace).length;
    cleanupAllFixtureMusicTokenSecrets(repositoryRoot);
    const result = runCli(["down", "--format", "json"]);
    const calls = readMusicCliContractDockerTrace(cliAuthority.dockerTrace).slice(traceOffset);
    const lines = result.stdout.trim().split(/\r?\n/);

    expect(calls).toEqual([
      {
        kind: "compose-config",
        args: ["compose", "-p", "explorers-music-fixture", "-f", "docker-compose.music-test.yml", "config", "--format", "json"],
      },
      {
        kind: "compose-ps",
        args: ["compose", "-p", "explorers-music-fixture", "-f", "docker-compose.music-test.yml", "ps", "-a", "-q"],
      },
    ]);
    expect(calls.some(({ kind }) => kind === "blocked")).toBe(false);
    expect(result.exitCode).toBe(5);
    expect(result.stderr).toBe("");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      command: "down",
      phase: "cleanup-safety",
      status: "blocked",
      error: "no owned fixture containers were found; cleanup refused",
    });
    expect(readFileSync(join(repositoryRoot, ".env.music.test"))).toHaveLength(0);
  }, 60_000);
});
