import { readFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");

describe("clean Music bootstrap", () => {
  it("rebuilds service images from the checked-out source before startup", () => {
    // Production break caught: a fixed Compose image tag from an earlier
    // checkout is reused, so an exact-commit rehearsal runs stale server code.
    const source = readFileSync(join(repositoryRoot, "tunes", "scripts", "music-cli.ts"), "utf8");
    const start = source.indexOf('if (parsed.command === "up")');
    const end = source.indexOf('if (parsed.command === "test:smoke")', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(source.slice(start, end)).toContain('"up", "--build"');
  });

  it("copies the complete dependency-free qualification import closure", () => {
    const source = readFileSync(join(
      repositoryRoot, "tunes", "server", "test", "contracts", "music-clean-bootstrap.real-tool.test.ts",
    ), "utf8");
    expect(source).toContain('"tunes/scripts/music-vitest-evidence.ts"');
    expect(source).not.toContain('"tunes/scripts/music-uat-database.ts"');
    const arrayBody = source.match(/const bootstrapSourceFiles = \[([\s\S]*?)\] as const;/)?.[1];
    expect(arrayBody).toBeTruthy();
    const copied = [...arrayBody!.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
    const expected = [
      "package.json", "package-lock.json", "docker-compose.music-test.yml",
      ".env.music.example", ".env.music.test.example",
      "fixtures/strapi/music-identity/identity.fixture.json",
      "tunes/scripts/music-cli.ts", "tunes/scripts/music-release-channel.mjs",
      "tunes/scripts/music-qualification.ts", "tunes/scripts/music-vitest-evidence.ts",
      "tunes/scripts/music-qualification-postgres.ts", "tunes/scripts/music-fixture-secret.ts",
      "tunes/scripts/windows-write-through.ps1", "tunes/scripts/music-compose-safety.ts",
      "tunes/scripts/music-process-runner.ts", "tunes/scripts/music-output-redaction.ts",
      "tunes/server/config/music-environment.ts", "tunes/server/config/secure-music-secret-file.ts",
      "tunes/shared/music-migration-contract.ts",
    ];
    expect(copied).toEqual(expected);

    const copiedSet = new Set(copied);
    for (const relativeFile of copied.filter((file) => /\.(?:ts|mjs)$/.test(file))) {
      const fileSource = readFileSync(resolve(repositoryRoot, relativeFile), "utf8");
      const specifiers = [...fileSource.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)]
        .map((match) => match[1]!);
      for (const specifier of specifiers.filter((value) => value.startsWith("."))) {
        const rawTarget = normalize(join(dirname(relativeFile), specifier)).replaceAll("\\", "/");
        const candidates = /\.(?:ts|mjs|js)$/.test(rawTarget)
          ? [rawTarget]
          : [`${rawTarget}.ts`, `${rawTarget}.mjs`, `${rawTarget}.js`];
        expect(candidates.some((candidate) => copiedSet.has(candidate)),
          `${relative(repositoryRoot, resolve(repositoryRoot, relativeFile))} has uncopied eager edge ${specifier}`)
          .toBe(true);
      }
    }

    const pureManifest = readFileSync(resolve(repositoryRoot, "tunes/scripts/music-vitest-evidence.ts"), "utf8");
    expect(pureManifest).not.toMatch(/(?:import|export)[^\n]*["']pg["']/);
    const qualification = readFileSync(resolve(repositoryRoot, "tunes/scripts/music-qualification.ts"), "utf8");
    expect(qualification).not.toContain("music-uat-database");
    const uat = readFileSync(resolve(repositoryRoot, "tunes/scripts/music-uat-database.ts"), "utf8");
    expect(uat).toContain('await import("pg")');
    expect(uat).not.toMatch(/^import\s+.*from\s+["']pg["']/m);
  });
});
