import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as musicCli from "../../../scripts/music-cli";
import {
  attestRetiredFixtureMusicAuthority,
  rotateFixtureMusicAuthority,
  type FixtureAuthorityPaths,
} from "../../../scripts/music-fixture-secret";
import type { RetainedFixtureVolumeInspection } from "../../../scripts/music-cli";
import { validateOwnedResources } from "../../../scripts/music-compose-safety";

const POSTGRES = "explorers-music-fixture_music-fixture-postgres";
const GATES = "explorers-music-fixture_music-fixture-gates";

type BoundaryState = {
  containers: string[];
  names: string[];
  inspections: Record<string, RetainedFixtureVolumeInspection[]>;
};

type ResetDependencies = {
  listContainerIds: () => Promise<readonly string[]>;
  listLabeledVolumeNames: () => Promise<readonly string[]>;
  inspectVolume: (name: string) => Promise<readonly RetainedFixtureVolumeInspection[]>;
  removeVolumes: (names: readonly string[]) => Promise<string>;
};

type ResetVolumeOnlyFixtureVolumes = (
  repositoryRoot: string,
  dependencies: ResetDependencies,
) => Promise<{
  removalArtifact: string;
  attestation: ReturnType<typeof attestRetiredFixtureMusicAuthority>;
}>;

type DockerCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  artifact?: string;
};

type CreateVolumeOnlyFixtureResetDockerAdapter = (input: {
  required: (args: readonly string[], phase: string) => Promise<DockerCommandResult & { artifact: string }>;
  observed: (args: readonly string[]) => Promise<DockerCommandResult>;
}) => { dependencies: ResetDependencies; artifacts: string[] };

const roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "music-db-reset-volume-only-"));
  roots.push(root);
  return root;
}

function fixtureEnvironment(root: string, paths: FixtureAuthorityPaths): string {
  const fixturePath = (path: string) => `./${relative(root, path).replace(/\\/g, "/")}`;
  return [
    `MUSIC_TOKEN_SECRET_FILE_HOST=${fixturePath(paths.tokenPath)}`,
    `MUSIC_DB_MIGRATOR_SECRET_FILE_HOST=${fixturePath(paths.migratorPasswordPath)}`,
    `MUSIC_DB_RUNTIME_SECRET_FILE_HOST=${fixturePath(paths.runtimePasswordPath)}`,
    "",
  ].join("\n");
}

function supportedAuthorityRoot(): string {
  const root = fixtureRoot();
  rotateFixtureMusicAuthority(root, (paths) => fixtureEnvironment(root, paths), {
    operationIdBytes: () => Buffer.alloc(16, 0x51),
    credentialSecretBytes: (index) => Buffer.alloc(32, 0x61 + index),
    durableReplace: (source, destination) => renameSync(source, destination),
  });
  return root;
}

function snapshotTree(root: string): Record<string, string> {
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

function pointerSize(root: string): number {
  const pointer = join(root, ".env.music.test");
  return existsSync(pointer) ? readFileSync(pointer).length : -1;
}

function volume(
  logicalName: "music-fixture-postgres" | "music-fixture-gates",
  overrides: Partial<RetainedFixtureVolumeInspection> = {},
): RetainedFixtureVolumeInspection {
  const labels = {
    "com.explorers.music.fixture": "true",
    "com.explorers.music.project": "explorers-music-fixture",
    "com.docker.compose.project": "explorers-music-fixture",
    "com.docker.compose.volume": logicalName,
    ...(overrides.Labels ?? {}),
  };
  return {
    Name: `explorers-music-fixture_${logicalName}`,
    CreatedAt: "2026-08-29T04:13:36Z",
    Mountpoint: `/var/lib/docker/volumes/explorers-music-fixture_${logicalName}/_data`,
    ...overrides,
    Labels: labels,
  };
}

function validState(includeGates = true): BoundaryState {
  return {
    containers: [],
    names: includeGates ? [POSTGRES, GATES] : [POSTGRES],
    inspections: {
      [POSTGRES]: [volume("music-fixture-postgres")],
      [GATES]: includeGates ? [volume("music-fixture-gates")] : [],
    },
  };
}

function emptyState(): BoundaryState {
  return { containers: [], names: [], inspections: { [POSTGRES]: [], [GATES]: [] } };
}

function fakeBoundary(
  root: string,
  states: BoundaryState[],
  options: { removalError?: Error } = {},
): {
  dependencies: ResetDependencies;
  events: string[];
  authoritySizes: number[];
  removed: string[][];
} {
  const events: string[] = [];
  const authoritySizes: number[] = [];
  const removed: string[][] = [];
  let index = -1;
  let state: BoundaryState | undefined;
  return {
    dependencies: {
      listContainerIds: async () => {
        index += 1;
        state = states[index];
        if (!state) throw new Error(`unexpected observation ${index}`);
        events.push(`containers:${index}`);
        authoritySizes.push(pointerSize(root));
        return state.containers;
      },
      listLabeledVolumeNames: async () => {
        if (!state) throw new Error("container observation must run first");
        events.push(`volumes:${index}`);
        return state.names;
      },
      inspectVolume: async (name) => {
        if (!state) throw new Error("container observation must run first");
        events.push(`inspect:${index}:${name}`);
        return state.inspections[name] ?? [];
      },
      removeVolumes: async (names) => {
        events.push(`remove:${names.join(",")}`);
        removed.push([...names]);
        if (options.removalError) throw options.removalError;
        return "child-volume-rm.log";
      },
    },
    events,
    authoritySizes,
    removed,
  };
}

function resetVolumeOnlyFixtureVolumes(): ResetVolumeOnlyFixtureVolumes {
  const candidate = (musicCli as unknown as {
    resetVolumeOnlyFixtureVolumes?: ResetVolumeOnlyFixtureVolumes;
  }).resetVolumeOnlyFixtureVolumes;
  expect(candidate, "the dedicated volume-only db:reset state machine must exist").toBeTypeOf("function");
  return candidate!;
}

function createVolumeOnlyFixtureResetDockerAdapter(): CreateVolumeOnlyFixtureResetDockerAdapter {
  const candidate = (musicCli as unknown as {
    createVolumeOnlyFixtureResetDockerAdapter?: CreateVolumeOnlyFixtureResetDockerAdapter;
  }).createVolumeOnlyFixtureResetDockerAdapter;
  expect(candidate, "the production Docker argv adapter must be independently testable").toBeTypeOf("function");
  return candidate!;
}

describe("volume-only fixture database reset", () => {
  it("keeps generic cleanup's all-resource authority requirement unchanged", () => {
    expect(() => validateOwnedResources([{
      kind: "volume",
      name: POSTGRES,
      labels: {
        "com.explorers.music.fixture": "true",
        "com.explorers.music.project": "explorers-music-fixture",
        "com.docker.compose.project": "explorers-music-fixture",
        "com.docker.compose.volume": "music-fixture-postgres",
      },
    }])).toThrow("no resolved fixture container");
  });

  it("preauthorizes twice, retires reference authority, revalidates, removes one exact allowlist, and proves absence", async () => {
    // Production break caught: the first reset refuses a safe volume-only state
    // because generic Compose cleanup requires at least one container.
    const root = supportedAuthorityRoot();
    const boundary = fakeBoundary(root, [validState(), validState(), validState(), emptyState()]);

    const result = await resetVolumeOnlyFixtureVolumes()(root, boundary.dependencies);

    expect(result).toEqual({
      removalArtifact: "child-volume-rm.log",
      attestation: {
        schemaVersion: "music-fixture-authority-attestation/v1",
        state: "tombstone",
        safeToBootstrap: true,
        usableRecords: 0,
      },
    });
    expect(boundary.authoritySizes.slice(0, 2).every((size) => size > 0)).toBe(true);
    expect(boundary.authoritySizes.slice(2)).toEqual([0, 0]);
    expect(boundary.removed).toEqual([[POSTGRES, GATES]]);
    expect(boundary.events).toEqual([
      "containers:0", "volumes:0", `inspect:0:${POSTGRES}`, `inspect:0:${GATES}`,
      "containers:1", "volumes:1", `inspect:1:${POSTGRES}`, `inspect:1:${GATES}`,
      "containers:2", "volumes:2", `inspect:2:${POSTGRES}`, `inspect:2:${GATES}`,
      `remove:${POSTGRES},${GATES}`,
      "containers:3", "volumes:3", `inspect:3:${POSTGRES}`, `inspect:3:${GATES}`,
    ]);
  });

  it("uses the exact Docker argv and one removal command across preauthorization, containment, and absence proof", async () => {
    const root = fixtureRoot();
    writeFileSync(join(root, ".env.music.test"), Buffer.alloc(0), { mode: 0o600 });
    const calls: string[][] = [];
    let removed = false;
    const adapter = createVolumeOnlyFixtureResetDockerAdapter()({
      required: async (args, phase) => {
        calls.push([...args]);
        const artifact = `${phase}-${calls.length}.log`;
        if (args[0] === "compose") return { exitCode: 0, stdout: "", stderr: "", artifact };
        if (args[0] === "volume" && args[1] === "ls") {
          return { exitCode: 0, stdout: removed ? "" : `${POSTGRES}\n${GATES}\n`, stderr: "", artifact };
        }
        if (args[0] === "volume" && args[1] === "rm") {
          removed = true;
          return { exitCode: 0, stdout: `${POSTGRES}\n${GATES}\n`, stderr: "", artifact };
        }
        throw new Error(`unexpected required command ${args.join(" ")}`);
      },
      observed: async (args) => {
        calls.push([...args]);
        if (args[0] !== "volume" || args[1] !== "inspect") throw new Error(`unexpected observation ${args.join(" ")}`);
        if (removed) return { exitCode: 1, stdout: "", stderr: "Error: No such volume" };
        const logicalName = args[2] === POSTGRES ? "music-fixture-postgres" : "music-fixture-gates";
        return { exitCode: 0, stdout: JSON.stringify([volume(logicalName)]), stderr: "" };
      },
    });

    await resetVolumeOnlyFixtureVolumes()(root, adapter.dependencies);

    const ps = ["compose", "-p", "explorers-music-fixture", "-f", "docker-compose.music-test.yml", "ps", "-a", "-q"];
    const ls = ["volume", "ls", "-q", "--filter", "label=com.explorers.music.fixture=true", "--filter", "label=com.explorers.music.project=explorers-music-fixture"];
    const inspectPostgres = ["volume", "inspect", POSTGRES];
    const inspectGates = ["volume", "inspect", GATES];
    expect(calls).toEqual([
      ps, ls, inspectPostgres, inspectGates,
      ps, ls, inspectPostgres, inspectGates,
      ps, ls, inspectPostgres, inspectGates,
      ["volume", "rm", POSTGRES, GATES],
      ps, ls, inspectPostgres, inspectGates,
    ]);
    expect(adapter.artifacts).toHaveLength(9);
    expect(calls.filter((args) => args[0] === "volume" && args[1] === "rm")).toHaveLength(1);
  });

  it.each(["missing", "tombstone"] as const)("supports an already-safe %s authority and an optional absent gates volume", async (kind) => {
    const root = fixtureRoot();
    if (kind === "tombstone") writeFileSync(join(root, ".env.music.test"), Buffer.alloc(0), { mode: 0o600 });
    const boundary = fakeBoundary(root, [validState(false), validState(false), validState(false), emptyState()]);

    const result = await resetVolumeOnlyFixtureVolumes()(root, boundary.dependencies);

    expect(result.attestation.state).toBe(kind === "missing" ? "absent" : "tombstone");
    expect(boundary.removed).toEqual([[POSTGRES]]);
    expect(boundary.authoritySizes).toEqual(Array(4).fill(kind === "missing" ? -1 : 0));
  });

  it.each([
    ["owned containers are present", { ...validState(), containers: ["a".repeat(64)] }],
    ["the mandatory postgres volume is missing", {
      ...validState(), names: [GATES], inspections: { [POSTGRES]: [], [GATES]: [volume("music-fixture-gates")] },
    }],
    ["an extra dual-labeled volume exists", { ...validState(), names: [POSTGRES, GATES, "explorers-music-fixture_extra"] }],
    ["the dual-labeled inventory contains a duplicate", { ...validState(), names: [POSTGRES, POSTGRES, GATES] }],
    ["an inspected volume has the wrong exact name", {
      ...validState(),
      inspections: { ...validState().inspections, [POSTGRES]: [volume("music-fixture-postgres", { Name: "other_music-fixture-postgres" })] },
    }],
    ["an inspected volume has no creation identity", {
      ...validState(),
      inspections: { ...validState().inspections, [POSTGRES]: [volume("music-fixture-postgres", { CreatedAt: undefined })] },
    }],
    ["an inspected volume has no mountpoint identity", {
      ...validState(),
      inspections: { ...validState().inspections, [POSTGRES]: [volume("music-fixture-postgres", { Mountpoint: undefined })] },
    }],
    ["an exact-name volume is unlabeled", {
      ...validState(),
      inspections: { ...validState().inspections, [POSTGRES]: [volume("music-fixture-postgres", { Labels: { "com.explorers.music.fixture": "false" } })] },
    }],
    ["the fixture project label is mismatched", {
      ...validState(),
      inspections: { ...validState().inspections, [POSTGRES]: [volume("music-fixture-postgres", { Labels: { "com.explorers.music.project": "other" } })] },
    }],
    ["the Compose project label is mismatched", {
      ...validState(),
      inspections: { ...validState().inspections, [POSTGRES]: [volume("music-fixture-postgres", { Labels: { "com.docker.compose.project": "other" } })] },
    }],
    ["Compose volume identity is mismatched", {
      ...validState(),
      inspections: { ...validState().inspections, [POSTGRES]: [volume("music-fixture-postgres", { Labels: { "com.docker.compose.volume": "other" } })] },
    }],
    ["an inspection is malformed", {
      ...validState(), inspections: { ...validState().inspections, [POSTGRES]: [{}] },
    }],
    ["an inspection is ambiguous", {
      ...validState(), inspections: { ...validState().inspections, [POSTGRES]: [volume("music-fixture-postgres"), volume("music-fixture-postgres")] },
    }],
  ] as const)("rejects before mutation when %s", async (_label, hostile) => {
    const root = supportedAuthorityRoot();
    const before = snapshotTree(root);
    const boundary = fakeBoundary(root, [hostile as unknown as BoundaryState]);

    await expect(resetVolumeOnlyFixtureVolumes()(root, boundary.dependencies)).rejects.toThrow();

    expect(boundary.removed).toEqual([]);
    expect(snapshotTree(root)).toEqual(before);
  });

  it("rejects a preauthorization TOCTOU fingerprint change with byte-identical authority", async () => {
    const root = supportedAuthorityRoot();
    const before = snapshotTree(root);
    const changed = validState();
    changed.inspections[POSTGRES] = [volume("music-fixture-postgres", { CreatedAt: "2026-08-29T04:13:37Z" })];
    const boundary = fakeBoundary(root, [validState(), changed]);

    await expect(resetVolumeOnlyFixtureVolumes()(root, boundary.dependencies)).rejects.toThrow(/changed|authority|fingerprint/i);

    expect(boundary.removed).toEqual([]);
    expect(snapshotTree(root)).toEqual(before);
  });

  it("retires authority but does not delete when identity changes after preauthorization", async () => {
    const root = supportedAuthorityRoot();
    const changed = validState();
    changed.inspections[GATES] = [volume("music-fixture-gates", { Mountpoint: "/changed" })];
    const boundary = fakeBoundary(root, [validState(), validState(), changed]);

    await expect(resetVolumeOnlyFixtureVolumes()(root, boundary.dependencies)).rejects.toThrow(/changed|authority|fingerprint/i);

    expect(boundary.removed).toEqual([]);
    expect(attestRetiredFixtureMusicAuthority(root).state).toBe("tombstone");
    expect(boundary.authoritySizes).toEqual([expect.any(Number), expect.any(Number), 0]);
  });

  it("keeps attempted deletion failure non-success while authority remains retired", async () => {
    const root = supportedAuthorityRoot();
    const boundary = fakeBoundary(root, [validState(), validState(), validState()], {
      removalError: new Error("synthetic volume removal failure"),
    });

    await expect(resetVolumeOnlyFixtureVolumes()(root, boundary.dependencies)).rejects.toThrow("synthetic volume removal failure");

    expect(boundary.removed).toEqual([[POSTGRES, GATES]]);
    expect(attestRetiredFixtureMusicAuthority(root).state).toBe("tombstone");
  });

  it.each([
    ["the dual-label enumeration", validState(false)],
    ["an exact-name inspection", {
      ...emptyState(), inspections: { ...emptyState().inspections, [POSTGRES]: [volume("music-fixture-postgres")] },
    }],
    ["a fixture container", { ...emptyState(), containers: ["b".repeat(64)] }],
  ] as const)("fails after one removal when %s remains", async (_label, residue) => {
    const root = supportedAuthorityRoot();
    const boundary = fakeBoundary(root, [validState(), validState(), validState(), residue as unknown as BoundaryState]);

    await expect(resetVolumeOnlyFixtureVolumes()(root, boundary.dependencies)).rejects.toThrow(/remains|absence|cleanup/i);

    expect(boundary.removed).toEqual([[POSTGRES, GATES]]);
    expect(attestRetiredFixtureMusicAuthority(root).state).toBe("tombstone");
  });
});
