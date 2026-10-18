import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IMAGE_TEST_COMMANDS } from "../../../scripts/music-image-ci-tests";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");
const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml") as { load(source: string): any };

describe("Music reconciliation automation contract", () => {
  /*
   * P2 Task 8 retired `.github/workflows/music-reconcile.yml`. Its hourly report reached
   * production Strapi read-only, and once Strapi is gone it can only fail. The
   * `music:reconcile` command itself stays until Epic 8 removes it, runnable by hand
   * under the runbook; what must not come back is a workflow that runs it on a
   * schedule or carries its Strapi credentials.
   */
  it("has no workflow that schedules or runs the reconciler", () => {
    const directory = resolve(repositoryRoot, ".github/workflows");
    expect(existsSync(resolve(directory, "music-reconcile.yml"))).toBe(false);
    const workflows = readdirSync(directory).filter((name) => /\.ya?ml$/.test(name));
    expect(workflows.length).toBeGreaterThan(0);
    for (const name of workflows) {
      const source = read(`.github/workflows/${name}`);
      expect(source, name).not.toContain("music:reconcile");
      expect(source, name).not.toMatch(/STRAPI_RECONCILIATION_TOKEN|music-reconciliation-(?:production|staging)/);
    }
  });

  it("runs the real C8 PostgreSQL suite in Tunes CI and watches the public root command authority", () => {
    const tunes = parseYaml(read(".github/workflows/tunes.yml"));
    const testStep = tunes.jobs["build-test-scan-push"].steps.find((step: any) => step.name === "Test Tunes");
    expect(testStep.env.MUSIC_C8_POSTGRES_TEST).toBe("1");
    expect(testStep.env.STRAPI_ANALYTICS_ACCESS_TOKEN).toBe("fixture-analytics-token");
    expect(testStep.run.trim().split("\n")).toEqual([
      "npm ci --legacy-peer-deps",
      "node node_modules/tsx/dist/cli.mjs scripts/music-image-ci-tests.ts",
    ]);
    expect(IMAGE_TEST_COMMANDS).toEqual([
      ["test", "--", "--maxWorkers=2"],
      ["run", "test:integration"],
      ["run", "test:music-c8:coverage"],
      ["run", "test:music-c8:repository-coverage"],
      ["run", "music:types:scoped"],
      ["run", "music:types:baseline"],
    ]);

    const c0 = parseYaml(read(".github/workflows/music-c0-contracts.yml"));
    expect(c0.on.pull_request.paths).toContain("package.json");
    expect(c0.on.push.paths).toContain("package.json");
    expect(c0.jobs.contracts.steps.map((step: any) => step.run).filter(Boolean)).toEqual(expect.arrayContaining([
      "npm ci",
      "npm ci --prefix tunes",
    ]));
    expect(c0.jobs.contracts.steps.findIndex((step: any) => step.run === "npm ci"))
      .toBeLessThan(c0.jobs.contracts.steps.findIndex((step: any) => step.name === "Prove public JSON command on Node 24.21.0"));
    expect(c0.jobs.contracts.steps.find((step: any) => step.name === "Prove public JSON command on Node 24.21.0").run)
      .toBe("node node_modules/tsx/dist/cli.mjs tunes/scripts/music-cli.ts fixtures:capture --format json");
    expect(c0.jobs.contracts.steps.find((step: any) => step.run?.includes("docker compose")).run)
      .toContain("--env-file .env.music.test.example");
    const windowsContracts = c0.jobs.contracts.steps.find((step: any) => step.if === "runner.os == 'Windows'" && step.run?.includes("npm test --prefix tunes"));
    expect(windowsContracts.run).toContain("music-reconciliation-workflow.test.ts");
    expect(windowsContracts.run).toContain("music-documentation-contract.test.ts");
    expect(windowsContracts.run).toContain("music-openapi-contract.test.ts");
    for (const contract of ['music-local-state.test.ts', 'music-cli-contract-authority.test.ts', 'music-owned-browser-profile.test.ts', 'music-fixture-services.test.ts']) {
      expect(windowsContracts.run).toContain(contract);
    }
    expect(tunes.on.pull_request.paths).toEqual(expect.arrayContaining([".env.music.example", ".env.music.test.example"]));
    expect(tunes.on.push.paths).toEqual(expect.arrayContaining([".env.music.example", ".env.music.test.example"]));
  });

  it("documents the fail-closed approval and first-run operating contract", () => {
    const runbook = read("docs/operations/music-reconciliation-runbook.md").replace(/\s+/g, " ");
    for (const phrase of [
      "first production run is report-only",
      "C0 pagination and service-token proof remains BLOCKING",
      "two independent complete scans",
      "zero suspension writes",
      "never recreates, reactivates, deletes, or finalizes deletion",
      "PostgreSQL advisory lock",
      "direct, session-affine PostgreSQL connection",
      "transaction-pooled PgBouncer",
      "reviewed checkpoint",
      "tombstone",
    ]) expect(runbook).toContain(phrase);
  });
});
