import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");
const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml") as { load(source: string): any };

describe("Music reconciliation automation contract", () => {
  it("pins every external action used by credential-bearing jobs to an immutable commit", () => {
    const workflow = parseYaml(read(".github/workflows/music-reconcile.yml"));
    const externalActions: Array<{ jobName: string; uses: string }> = [];
    for (const [jobName, job] of Object.entries(workflow.jobs) as Array<[string, any]>) {
      for (const step of job.steps ?? []) {
        if (typeof step.uses === "string" && !step.uses.startsWith("./")) {
          externalActions.push({ jobName, uses: step.uses });
        }
      }
    }
    expect(externalActions.length).toBeGreaterThan(0);
    for (const action of externalActions) {
      const separator = action.uses.lastIndexOf("@");
      expect(separator, `${action.jobName}: ${action.uses}`).toBeGreaterThan(0);
      expect(action.uses.slice(separator + 1), `${action.jobName}: ${action.uses}`)
        .toMatch(/^[a-f0-9]{40}$/);
    }
  });

  it("provides every live token identity as an environment secret to every credential-bearing job", () => {
    const workflow = parseYaml(read(".github/workflows/music-reconcile.yml"));
    const expected = {
      STRAPI_RECONCILIATION_TOKEN_FILE: "${{ secrets.STRAPI_RECONCILIATION_TOKEN_FILE }}",
      STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: "${{ secrets.STRAPI_LIFECYCLE_PROOF_TOKEN_FILE }}",
      STRAPI_ACCESS_TOKEN_FILE: "${{ secrets.STRAPI_ACCESS_TOKEN_FILE }}",
      STRAPI_ACCESS_TOKEN: "${{ secrets.STRAPI_ACCESS_TOKEN }}",
    };
    for (const name of ["report-only", "staging-report", "staging-apply"]) {
      expect(workflow.jobs[name].env, name).toMatchObject(expected);
      for (const step of workflow.jobs[name].steps ?? []) {
        expect(`${step.run ?? ""}\n${step.with?.script ?? ""}`, name)
          .not.toMatch(/secrets\.STRAPI_(?:RECONCILIATION|LIFECYCLE_PROOF|ACCESS)_TOKEN(?:_FILE)?/);
      }
    }
    expect(read(".github/workflows/music-reconcile.yml"))
      .not.toMatch(/vars\.STRAPI_(?:RECONCILIATION|LIFECYCLE_PROOF|ACCESS)_TOKEN(?:_FILE)?/);
  });

  it("hardcodes scheduled production work to report-only", () => {
    const workflow = parseYaml(read(".github/workflows/music-reconcile.yml"));
    expect(workflow.permissions).toEqual({ actions: "read", contents: "read" });
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    expect(workflow.on.schedule).toEqual([{ cron: "17 * * * *" }]);
    const report = workflow.jobs["report-only"];
    expect(report.environment).toBe("music-reconciliation-production-report");
    expect(report.env).toMatchObject({
      MUSIC_MODE: "live",
      MUSIC_RECONCILIATION_ENVIRONMENT: "production",
      MUSIC_RECONCILIATION_APPLY_ENABLED: "false",
    });
    const command = report.steps.find((step: any) => step.name === "Run redacted report-only reconciliation").run as string;
    expect(command).toContain("music:reconcile");
    expect(command).toContain("--dry-run");
    expect(command).not.toContain("--apply");
  });

  it("allows apply only through a manual protected staging review", () => {
    const workflow = parseYaml(read(".github/workflows/music-reconcile.yml"));
    const review = workflow.jobs["staging-report"];
    expect(review.if).toContain("inputs.action == 'staging-report'");
    expect(review.environment).toBe("music-reconciliation-staging-report");
    expect(review.env).toMatchObject({
      MUSIC_MODE: "live",
      MUSIC_RECONCILIATION_ENVIRONMENT: "staging",
      MUSIC_RECONCILIATION_APPLY_ENABLED: "true",
    });
    const reviewUpload = review.steps.find((step: any) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(reviewUpload.with.name).toContain("music-reconciliation-staging-review-");

    const apply = workflow.jobs["staging-apply"];
    expect(apply.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(apply.if).toContain("inputs.action == 'staging-apply'");
    expect(apply.if).toContain("github.ref == 'refs/heads/main'");
    expect(apply.environment).toBe("music-reconciliation-staging-apply");
    expect(apply.env).toMatchObject({
      MUSIC_MODE: "live",
      MUSIC_RECONCILIATION_ENVIRONMENT: "staging",
      MUSIC_RECONCILIATION_APPLY_ENABLED: "true",
    });
    const download = apply.steps.find((step: any) => step.uses?.startsWith("actions/download-artifact@"));
    expect(download.with).toMatchObject({
      "github-token": "${{ github.token }}",
      "run-id": "${{ inputs.review_run_id }}",
      name: "music-reconciliation-staging-review-${{ inputs.review_run_id }}-${{ inputs.review_run_attempt }}",
      path: ".artifacts/music-runs/reviewed",
    });
    const command = apply.steps.find((step: any) => step.name === "Apply the reviewed staging checkpoint").run as string;
    expect(command).toContain("--apply");
    expect(command).toContain("--resume \"$MUSIC_RESUME_CHECKPOINT\"");
    expect(command).toContain("--approval-token \"$MUSIC_APPROVAL_TOKEN\"");
    expect(workflow.on.workflow_dispatch.inputs).not.toHaveProperty("resume_checkpoint");
    const provenance = apply.steps.find((step: any) => step.name === "Verify reviewed workflow provenance");
    expect(provenance.uses).toMatch(/^actions\/github-script@[a-f0-9]{40}$/);
    expect(provenance.with.script).toContain("reviewed.path !== '.github/workflows/music-reconcile.yml'");
    expect(provenance.with.script).toContain("reviewed.head_sha !== context.sha");
    expect(provenance.with.script).toContain("reviewed.conclusion !== 'success'");
    expect(provenance.with.script).not.toContain("${{ inputs.");
    expect(apply.steps.indexOf(provenance)).toBeLessThan(apply.steps.indexOf(download));
    expect(apply.steps.indexOf(download)).toBeLessThan(apply.steps.findIndex((step: any) => step.name === "Apply the reviewed staging checkpoint"));
  });

  it("is non-deploying and uploads only the reconciler's bounded artifacts", () => {
    const source = read(".github/workflows/music-reconcile.yml");
    const workflow = parseYaml(source);
    expect(source).not.toMatch(/\b(?:ssh|scp)\b/i);
    expect(source).not.toMatch(/docker\s+compose/i);
    expect(source).not.toContain("GATE_PROD");
    expect(source).not.toContain("packages: write");
    expect(source).not.toContain("--apply --mode live --environment production");
    expect(source).toContain("actions/upload-artifact@");
    expect(source).toContain(".artifacts/music-runs/");
    for (const job of Object.values(workflow.jobs) as any[]) {
      for (const step of job.steps ?? []) {
        if (typeof step.run === "string" || typeof step.with?.script === "string") {
          expect(`${step.run ?? ""}\n${step.with?.script ?? ""}`).not.toMatch(/\$\{\{\s*inputs\.(?:review_run_id|review_run_attempt|approval_token)/);
        }
      }
    }
    for (const [jobName, job] of Object.entries(workflow.jobs) as Array<[string, any]>) {
      for (const step of job.steps ?? []) {
        if (typeof step.run === "string" && step.run.includes("--apply")) {
          expect(jobName).toBe("staging-apply");
          expect(job.environment).toBe("music-reconciliation-staging-apply");
          expect(job.if).toContain("github.event_name == 'workflow_dispatch'");
          expect(job.if).toContain("github.ref == 'refs/heads/main'");
        }
      }
      if (job.env?.MUSIC_RECONCILIATION_ENVIRONMENT === "production") {
        expect(job.env.MUSIC_RECONCILIATION_APPLY_ENABLED).toBe("false");
        expect((job.steps ?? []).map((step: any) => step.run ?? "").join("\n")).not.toContain("--apply");
      }
    }
  });

  it("runs the real C8 PostgreSQL suite in Tunes CI and watches the public root command authority", () => {
    const tunes = parseYaml(read(".github/workflows/tunes.yml"));
    const testStep = tunes.jobs["build-test-scan-push"].steps.find((step: any) => step.name === "Test Tunes");
    expect(testStep.env.MUSIC_C8_POSTGRES_TEST).toBe("1");
    expect(testStep.env.STRAPI_ANALYTICS_ACCESS_TOKEN).toBe("fixture-analytics-token");
    expect(testStep.run).toContain("npm run test:music-c8:coverage");
    expect(testStep.run).toContain("npm run test:music-c8:repository-coverage");

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
    const windowsContracts = c0.jobs.contracts.steps.find((step: any) => step.if === "runner.os == 'Windows'");
    expect(windowsContracts.run).toContain("music-reconciliation-workflow.test.ts");
    expect(windowsContracts.run).toContain("music-documentation-contract.test.ts");
    expect(windowsContracts.run).toContain("music-openapi-contract.test.ts");
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
