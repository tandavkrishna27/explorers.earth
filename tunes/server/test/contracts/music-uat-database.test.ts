import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateIntegrationDatabaseTarget } from "../integration-global-setup";
import {
  MUSIC_UAT_DATABASE_ACK,
  MUSIC_UAT_DATABASE_CHILD_OUTPUT_MAX_BYTES,
  MUSIC_UAT_DATABASE_TEST_FILES,
  buildUatDatabaseTestCommand,
  executeOwnedUatEvidence,
  parseUatDatabaseAuthority,
  runUatDatabaseTestChild,
  startOwnedUatDatabase,
  stopOwnedUatDatabase,
  validateUatDatabaseInspect,
  withOwnedUatDatabase,
} from "../../../scripts/music-uat-database";

const runId = "1".repeat(32);
const database = `music_uat_${runId}`;
const commit = "c".repeat(40);
const containerId = "a".repeat(64);
const imageId = `sha256:${"b".repeat(64)}`;
const contextHost = "npipe:////./pipe/dockerDesktopLinuxEngine";

function authorityEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    MUSIC_UAT_DATABASE_ACK,
    MUSIC_UAT_DATABASE_RUN_ID: runId,
    MUSIC_UAT_DATABASE_NAME: database,
    MUSIC_UAT_DATABASE_PORT: "58543",
    MUSIC_UAT_DATABASE_CONTAINER_ID: containerId,
    MUSIC_UAT_DATABASE_COMMIT: commit,
    ...overrides,
  };
}

function ownedInspect() {
  return {
    Id: containerId,
    Name: `/explorers-music-uat-db-${runId}`,
    Image: imageId,
    Config: {
      Image: "postgres:15-alpine",
      Env: [
        "POSTGRES_USER=music_migrator",
        `POSTGRES_DB=${database}`,
        "POSTGRES_PASSWORD_FILE=/run/secrets/music-uat-database-password",
      ],
      Labels: {
        "com.explorers.music.fixture": "true",
        "com.explorers.music.project": "explorers-music-fixture",
        "com.explorers.music.uat-database": "true",
        "com.explorers.music.uat-run": runId,
        "com.explorers.music.database": database,
        "com.explorers.music.commit": commit,
      },
    },
    State: { Running: true, Health: { Status: "healthy" } },
    HostConfig: {
      PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "58543" }] },
      Tmpfs: { "/var/lib/postgresql/data": "rw,noexec,nosuid,size=536870912" },
    },
    Mounts: [{ Type: "bind", Destination: "/run/secrets/music-uat-database-password", RW: false }],
  };
}

describe("owned Task-4 UAT database lane", () => {
  it("requires one complete unique fixture-owned database authority tuple", () => {
    expect(parseUatDatabaseAuthority({})).toBeUndefined();
    expect(parseUatDatabaseAuthority(authorityEnvironment())).toEqual({
      runId, database, port: 58543, containerId, commit,
    });
    expect(() => parseUatDatabaseAuthority({ MUSIC_UAT_DATABASE_ACK }))
      .toThrow(/exact acknowledgement.*run ID.*database.*port.*container ID.*commit/i);
    expect(() => parseUatDatabaseAuthority(authorityEnvironment({
      MUSIC_UAT_DATABASE_NAME: "music_fixture",
    }))).toThrow(/unique database/i);
    expect(() => parseUatDatabaseAuthority(authorityEnvironment({
      MUSIC_UAT_DATABASE_NAME: `music_uat_${"2".repeat(32)}`,
    }))).toThrow(/run ID/i);
    for (const hostile of [
      { DOCKER_HOST: "tcp://production.example:2376" },
      { DOCKER_CONTEXT: "production" },
      { DATABASE_URL: "postgresql://production.example/music" },
      { GATE_PROD: "1" },
    ]) {
      expect(() => parseUatDatabaseAuthority(authorityEnvironment(hostile))).toThrow(/ambient.*forbidden/i);
    }
  });

  it("attests exact local fixture labels, identity, loopback binding, secret mount, and tmpfs", () => {
    const authority = parseUatDatabaseAuthority(authorityEnvironment())!;
    expect(validateUatDatabaseInspect(authority, {
      contextHost, imageId, inspect: ownedInspect(),
    })).toEqual(expect.objectContaining({ database, imageId }));
    expect(() => validateUatDatabaseInspect(authority, {
      contextHost: "tcp://production.example:2376", imageId, inspect: ownedInspect(),
    })).toThrow(/local Docker/i);
    expect(() => validateUatDatabaseInspect(authority, {
      contextHost, imageId,
      inspect: { ...ownedInspect(), Config: { ...ownedInspect().Config, Labels: {} } },
    })).toThrow(/exact fixture-owned/i);
    expect(() => validateUatDatabaseInspect(authority, {
      contextHost, imageId,
      inspect: { ...ownedInspect(), HostConfig: { ...ownedInspect().HostConfig, Tmpfs: {} } },
    })).toThrow(/exact fixture-owned/i);
  });

  it("creates the unique database without an argument secret and always drops/removes the exact owner", async () => {
    const passwordFile = "C:\\protected\\music-uat-db-password";
    const mutations: string[][] = [];
    const drops: string[] = [];
    const dockerRead = (args: string[]) => {
      if (args[0] === "context" && args[1] === "show") return "desktop-linux\n";
      if (args[0] === "context" && args[1] === "inspect") return JSON.stringify(contextHost);
      if (args.includes("image")) return `${imageId}\n`;
      if (args.includes("inspect") && args.includes(containerId)) return JSON.stringify(ownedInspect());
      throw new Error(`unexpected read: ${args.join(" ")}`);
    };
    const authority = await startOwnedUatDatabase({
      runId, database, commit, port: 58543, passwordFile,
    }, {
      dockerRead,
      dockerOptionalRead: () => undefined,
      dockerRun: (args) => { mutations.push(args); return containerId; },
      healthyInspect: async () => ownedInspect(),
    });
    expect(authority).toEqual({
      runId, database, port: 58543, containerId, commit, imageId, contextHost, owned: true,
    });
    const creation = mutations[0]!;
    expect(creation).toEqual(expect.arrayContaining([
      "--rm",
      "--publish", "127.0.0.1:58543:5432",
      "--env", `POSTGRES_DB=${database}`,
      "--env", "POSTGRES_PASSWORD_FILE=/run/secrets/music-uat-database-password",
      "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=536870912",
    ]));
    expect(creation.join(" ")).toContain("com.explorers.music.fixture=true");
    expect(creation.join(" ")).toContain(`com.explorers.music.uat-run=${runId}`);
    expect(creation.join(" ")).toContain(passwordFile);
    expect(creation.join(" ")).not.toContain("known-password-value");

    await stopOwnedUatDatabase(authority, {
      dockerRead,
      dockerOptionalRead: () => undefined,
      dockerRun: (args) => { mutations.push(args); return ""; },
      dropDatabase: async (owned) => { drops.push(owned.database); },
    });
    expect(drops).toEqual([database]);
    expect(mutations.at(-1)).toEqual(["--host", contextHost, "rm", "--force", "--volumes", containerId]);
  });

  it("releases the exact owned database once when the repository child fails", async () => {
    const authority = { owned: true as const, containerId };
    const events: string[] = [];
    await expect(withOwnedUatDatabase({
      acquire: async () => { events.push("acquire"); return authority; },
      run: async (value) => { events.push(`run:${value.containerId}`); throw new Error("repository lane red"); },
      release: async (value) => { events.push(`release:${value.containerId}`); },
    })).rejects.toThrow("repository lane red");
    expect(events).toEqual(["acquire", `run:${containerId}`, `release:${containerId}`]);
  });

  it("removes the exact container even when SQL drop reports failure", async () => {
    const mutations: string[][] = [];
    const dockerRead = (args: string[]) => {
      if (args[0] === "context" && args[1] === "show") return "desktop-linux\n";
      if (args[0] === "context" && args[1] === "inspect") return JSON.stringify(contextHost);
      if (args.includes("image")) return `${imageId}\n`;
      if (args.includes("inspect") && args.includes(containerId)) return JSON.stringify(ownedInspect());
      throw new Error(`unexpected read: ${args.join(" ")}`);
    };
    const authority = {
      runId, database, port: 58543, containerId, commit, imageId, contextHost, owned: true as const,
    };
    await expect(stopOwnedUatDatabase(authority, {
      dockerRead,
      dockerOptionalRead: () => undefined,
      dockerRun: (args) => { mutations.push(args); return ""; },
      dropDatabase: async () => { throw new Error("injected drop failure"); },
    })).rejects.toThrow(/database drop failed/i);
    expect(mutations).toEqual([
      ["--host", contextHost, "rm", "--force", "--volumes", containerId],
    ]);
  });

  it("removes the created exact ID when startup attestation fails", async () => {
    const mutations: string[][] = [];
    const dockerRead = (args: string[]) => {
      if (args[0] === "context" && args[1] === "show") return "desktop-linux\n";
      if (args[0] === "context" && args[1] === "inspect") return JSON.stringify(contextHost);
      if (args.includes("image")) return `${imageId}\n`;
      throw new Error(`unexpected read: ${args.join(" ")}`);
    };
    await expect(startOwnedUatDatabase({
      runId, database, commit, port: 58543, passwordFile: "C:\\protected\\music-uat-db-password",
    }, {
      dockerRead,
      dockerOptionalRead: () => undefined,
      dockerRun: (args) => { mutations.push(args); return containerId; },
      healthyInspect: async () => ({
        ...ownedInspect(),
        Config: { ...ownedInspect().Config, Labels: {} },
      }),
    })).rejects.toThrow(/exact fixture-owned/i);
    expect(mutations.at(-1)).toEqual([
      "--host", contextHost, "rm", "--force", "--volumes", containerId,
    ]);
  });

  it("allows integration setup to reach only the tuple-bound unique database", () => {
    const environment = authorityEnvironment();
    expect(validateIntegrationDatabaseTarget(
      `postgresql://music_migrator:secret@127.0.0.1:58543/${database}`,
      environment,
    ).pathname).toBe(`/${database}`);
    expect(() => validateIntegrationDatabaseTarget(
      "postgresql://music_migrator:secret@127.0.0.1:58543/music_fixture",
      environment,
    )).toThrow(/exact disposable/i);
    expect(() => validateIntegrationDatabaseTarget(
      `postgresql://music_migrator:secret@localhost:58543/${database}`,
      environment,
    )).toThrow(/exact disposable/i);
  });

  it("publishes one narrow root command and a frozen repository integration allowlist", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../../..");
    const rootPackage = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const tunesPackage = JSON.parse(readFileSync(resolve(repositoryRoot, "tunes/package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(rootPackage.scripts["music:test:uat-database"])
      .toBe("npm --prefix tunes run music:test:uat-database --");
    expect(tunesPackage.scripts["music:test:uat-database"])
      .toBe("tsx scripts/music-uat-database.ts");
    const runnerSource = readFileSync(resolve(repositoryRoot, "tunes/scripts/music-uat-database.ts"), "utf8");
    expect(runnerSource).toContain("prepareFixtureMusicTokenSecret");
    expect(runnerSource).toContain("readSecureMusicSecretFile");
    expect(runnerSource).toContain("cleanupFixtureMusicTokenSecret");
    expect(runnerSource).toContain('MUSIC_C12_INITIAL_CAPTURE_POSTGRES_TEST: "1"');
    expect(runnerSource).toContain('MUSIC_C13_IDENTITY_COUNT_ADAPTER_POSTGRES_TEST: "1"');
    expect(runnerSource).not.toContain("writeFileSync(passwordFile");
    expect(MUSIC_UAT_DATABASE_TEST_FILES).toEqual([
      "server/test/explorers-lifecycle.integration.test.ts",
      "server/test/account-recovery.test.ts",
      "server/test/explorers-recovery.integration.test.ts",
      "server/test/explorers-recovery-callback.integration.test.ts",
      "server/test/explorers-profile.integration.test.ts",
      "server/test/explorers-media.integration.test.ts",
      "server/test/migrations/music-migration.integration.test.ts",
      "server/test/music-credential.integration.test.ts",
      "server/test/music-domain-repository.integration.test.ts",
      "server/test/music-identity-projection.integration.test.ts",
      "server/test/music-publication-operation.integration.test.ts",
      "server/test/music-runtime-role.integration.test.ts",
      "server/test/musicLifecycle.integration.test.ts",
      "server/test/musicReconciler.integration.test.ts",
      "server/test/reconciliationRepository.integration.test.ts",
      "server/test/load/music-load-postgres.integration.test.ts",
      "server/test/music-e2e-state-restore.integration.test.ts",
      "server/test/music-e2e-initial-capture.integration.test.ts",
      "server/test/music-e2e-identity-count-adapter.integration.test.ts",
    ]);
    const restoreIntegration = readFileSync(resolve(
      repositoryRoot, "tunes/server/test/music-e2e-state-restore.integration.test.ts",
    ), "utf8");
    expect(restoreIntegration).toContain("MUSIC_C11_STATE_RESTORE_POSTGRES_TEST");
    expect(restoreIntegration).toContain("runMusicFixtureRestoreTransaction");
    expect(restoreIntegration).toContain("replay-failed-rolled-back");
    const captureIntegration = readFileSync(resolve(
      repositoryRoot, "tunes/server/test/music-e2e-initial-capture.integration.test.ts",
    ), "utf8");
    expect(captureIntegration).toContain("MUSIC_C12_INITIAL_CAPTURE_POSTGRES_TEST");
    expect(captureIntegration).toContain("captureMusicFixtureState");
    expect(captureIntegration).toContain("requestMusicFixturePrivateProfileSnapshot");
    expect(captureIntegration).toMatch(/127\.0\.0\.1/);
    expect(captureIntegration).not.toMatch(/console\.(?:log|error)|process\.(?:stdout|stderr)\.write/);

    const adapterIntegrationPath = resolve(
      repositoryRoot, "tunes/server/test/music-e2e-identity-count-adapter.integration.test.ts",
    );
    expect(existsSync(adapterIntegrationPath)).toBe(true);
    if (existsSync(adapterIntegrationPath)) {
      const adapterIntegration = readFileSync(adapterIntegrationPath, "utf8");
      expect(adapterIntegration).toContain("MUSIC_C13_IDENTITY_COUNT_ADAPTER_POSTGRES_TEST");
      expect(adapterIntegration).toContain("runMusicFixtureIdentityCountPsql");
      expect(adapterIntegration).toContain("attestUatDatabaseAuthority");
      expect(adapterIntegration).not.toMatch(/console\.(?:log|error)|process\.(?:stdout|stderr)\.write/);
    }
  });

  it("scopes the verified ten-second timeout to the exact owned database child command", () => {
    expect(buildUatDatabaseTestCommand("C:\\node\\npm-cli.js", "C:\\owned\\vitest.json")).toEqual({
      file: process.execPath,
      args: [
        "C:\\node\\npm-cli.js", "run", "test:integration", "--",
        ...MUSIC_UAT_DATABASE_TEST_FILES,
        "--maxWorkers=1", "--fileParallelism=false", "--testTimeout=10000",
        "--reporter=default", "--reporter=json", "--outputFile.json=C:\\owned\\vitest.json",
      ],
    });
  });

  it("releases owned authority before constructing and writing successful UAT evidence", async () => {
    const events: string[] = [];
    const vitestRaw = JSON.stringify({ success: true });
    const written: unknown[] = [];
    const result = await executeOwnedUatEvidence({
      acquire: async () => { events.push("acquire"); return { id: "owned" }; },
      run: async () => { events.push("run"); return { exitCode: 0, signal: null }; },
      release: async () => { events.push("release"); },
      readRaw: () => { events.push("read"); return vitestRaw; },
      buildEnvelope: (input) => { events.push("build"); return { ...input, ok: true }; },
      writeEnvelope: async (envelope) => { events.push("write"); written.push(envelope); },
    });
    expect(events).toEqual(["acquire", "run", "release", "read", "build", "write"]);
    expect(result).toEqual(written[0]);
  });

  it("does not construct or write successful UAT evidence when cleanup fails", async () => {
    const events: string[] = [];
    await expect(executeOwnedUatEvidence({
      acquire: async () => ({ id: "owned" }),
      run: async () => ({ exitCode: 0, signal: null }),
      release: async () => { events.push("release"); throw new Error("cleanup failed"); },
      readRaw: () => { events.push("read"); return "{}"; },
      buildEnvelope: () => { events.push("build"); return { ok: true }; },
      writeEnvelope: async () => { events.push("write"); },
    })).rejects.toThrow("cleanup failed");
    expect(events).toEqual(["release"]);
  });

  it("redacts hostile database and configured secrets before child output reaches writers", async () => {
    const hostilePassword = "hostile:/@output-password%9f1d";
    const configuredSecret = "configured-session-secret-4e2a";
    const target = new URL(`postgresql://music_migrator@127.0.0.1:58543/${database}`);
    target.password = hostilePassword;
    const databaseUrl = target.toString();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const source = [
      `process.stdout.write(${JSON.stringify("useful stdout before ")});`,
      `process.stdout.write(${JSON.stringify(hostilePassword.slice(0, 11))});`,
      `process.stdout.write(${JSON.stringify(`${hostilePassword.slice(11)} useful stdout after\n`)});`,
      `process.stderr.write(${JSON.stringify(`assertion mismatch DATABASE_URL_TEST=${databaseUrl}\n`)});`,
      `process.stderr.write(${JSON.stringify(`SESSION_SECRET=${configuredSecret}\n`)});`,
      "process.exitCode = 1;",
    ].join("");

    const result = await runUatDatabaseTestChild(
      { file: process.execPath, args: ["-e", source] },
      { DATABASE_URL_TEST: databaseUrl, SESSION_SECRET: configuredSecret },
      {
        setChild: () => undefined,
        exactSensitiveValues: [hostilePassword],
        writeStdout: (value) => { stdout.push(value); },
        writeStderr: (value) => { stderr.push(value); },
      },
    );

    const retained = [...stdout, ...stderr].join("");
    expect(result).toEqual({ exitCode: 1, signal: null });
    expect(retained).toContain("useful stdout before");
    expect(retained).toContain("useful stdout after");
    expect(retained).toContain("assertion mismatch");
    expect(retained).not.toContain(hostilePassword);
    expect(retained).not.toContain(encodeURIComponent(hostilePassword));
    expect(retained).not.toContain(databaseUrl);
    expect(retained).not.toContain(configuredSecret);
  });

  it("discards an independently overflowing child stream without emitting its raw prefix", async () => {
    const hostilePrefix = "overflow-secret-prefix-18d2";
    const stdout: string[] = [];
    const stderr: string[] = [];
    const source = [
      `process.stdout.write(${JSON.stringify(hostilePrefix)});`,
      `process.stdout.write("x".repeat(${MUSIC_UAT_DATABASE_CHILD_OUTPUT_MAX_BYTES}));`,
      `process.stderr.write(${JSON.stringify("useful bounded stderr\n")});`,
    ].join("");

    const result = await runUatDatabaseTestChild(
      { file: process.execPath, args: ["-e", source] },
      { HOSTILE_SECRET: hostilePrefix },
      {
        setChild: () => undefined,
        writeStdout: (value) => { stdout.push(value); },
        writeStderr: (value) => { stderr.push(value); },
      },
    );

    expect(result).toEqual({ exitCode: 0, signal: null });
    expect(stdout.join("")).toContain("stdout discarded");
    expect(stdout.join("")).not.toContain(hostilePrefix);
    expect(stdout.join("")).not.toContain("xxxxx");
    expect(stderr.join("")).toBe("useful bounded stderr\n");
  });

  it("binds the migration suite admin lifecycle to the validated owned target and tolerates setup refusal", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../../..");
    const source = readFileSync(resolve(
      repositoryRoot,
      "tunes/server/test/migrations/music-migration.integration.test.ts",
    ), "utf8");
    expect(source).toContain("validateIntegrationDatabaseTarget(adminUrl)");
    expect(source).not.toContain("127.0.0.1:55432/music_fixture");
    expect(source).not.toContain('pathname: "/music_fixture"');
    expect(source).toMatch(/afterAll\(async \(\) => \{\s+if \(!admin\) return;[\s\S]+await admin\.end\(\)/);
  });

  it("derives the runtime-role migration count from the checked-in migration inventory", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../../..");
    const source = readFileSync(resolve(
      repositoryRoot,
      "tunes/server/test/music-runtime-role.integration.test.ts",
    ), "utf8");
    expect(source).toContain("EXPECTED_MUSIC_MIGRATION_CHAIN.length");
    expect(source).not.toMatch(/music_schema_migrations[\s\S]{0,160}\.toBe\(20\)/);
  });

  it("uses a file-backed public ID key in the live runtime-role fixture and cleans its protected root", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../../..");
    const source = readFileSync(resolve(
      repositoryRoot,
      "tunes/server/test/music-runtime-role.integration.test.ts",
    ), "utf8");
    expect(source).toContain("writeFileSync(publicIdHmacPath");
    expect(source).toContain("chmodSync(publicIdHmacPath, 0o600)");
    expect(source).toContain("delete values.MUSIC_PUBLIC_ID_HMAC_KEY");
    expect(source).toContain("MUSIC_PUBLIC_ID_HMAC_KEY_FILE: publicIdHmacPath");
    expect(source).toMatch(/afterAll\(async \(\) => \{[\s\S]+finally \{\s+rmSync\(runtimeSecretRoot, \{ recursive: true, force: true \}\)/);
  });

  it("keeps live runtime-role startup on the owned database socket after file-key validation", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../../..");
    const source = readFileSync(resolve(
      repositoryRoot,
      "tunes/server/test/music-runtime-role.integration.test.ts",
    ), "utf8");
    expect(source).toContain("const databaseAuthority = new URL(ownerTarget)");
    expect(source).toContain("MUSIC_DATABASE_HOST: databaseAuthority.hostname");
    expect(source).toContain("MUSIC_DATABASE_PORT: databaseAuthority.port");
  });
});
