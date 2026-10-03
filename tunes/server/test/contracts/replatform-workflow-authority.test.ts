import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const read = (name: string) => readFileSync(resolve(root, `.github/workflows/${name}.yml`), "utf8");
const require = createRequire(import.meta.url);
const { load } = require("js-yaml") as { load(source: string): any };
const workflow = (name: string) => load(read(name));

describe("replatform workflow authority", () => {
  it("validates every main PR, including drafts, without duplicate integration pushes", () => {
    const ci = workflow("ci");
    expect(ci.on.pull_request.branches).toContain("main");
    expect(ci.on.pull_request).not.toHaveProperty("paths");
    expect(ci.on.pull_request).not.toHaveProperty("paths-ignore");
    for (const name of ["ci", "test", "music-c0-contracts", "tunes"]) {
      expect(workflow(name).on.push.branches).not.toContain("codex/unified-replatform");
    }
    expect(ci.on.push).not.toHaveProperty("paths");
    expect(ci.on.push).not.toHaveProperty("paths-ignore");
    expect(read("ci")).not.toMatch(/\bdraft\s*==\s*false/);
  });

  it("requires all validation lanes to succeed, including jobs unexpectedly skipped", () => {
    const ci = workflow("ci");
    const required = ci.jobs["replatform-required"];
    expect(required).toBeDefined();
    expect(required.needs).toEqual(expect.arrayContaining([
      "lint", "typecheck", "unit-tests", "build", "integration-tests",
      "e2e-category-a", "e2e-category-b", "e2e-public-shell", "e2e-publishing", "e2e-music-account",
    ]));
    for (const name of ["e2e-category-a", "e2e-category-b", "e2e-public-shell", "e2e-publishing", "e2e-music-account"]) {
      expect(ci.jobs[name]).toBeDefined();
      expect(ci.jobs[name]).not.toHaveProperty("needs");
    }
    const commands = [
      "--config=playwright.category-navigation-a.config.ts",
      "--config=playwright.category-navigation-b.config.ts",
      "--config=playwright.public-shell-continuity.config.ts --project=chromium",
      "--config=playwright.music-publishing.config.ts",
      "e2e/music.spec.ts e2e/music-accessibility.spec.ts e2e/account-lifecycle.spec.ts --project=chromium-pr-safe --project=firefox-music-visual --project=webkit-music-visual",
    ];
    const artifacts = new Set<string>();
    ["e2e-category-a", "e2e-category-b", "e2e-public-shell", "e2e-publishing", "e2e-music-account"].forEach((name, index) => {
      const job = ci.jobs[name];
      expect(job.steps.some((step: any) => String(step.run ?? "").includes(commands[index]))).toBe(true);
      const run = job.steps.find((step: any) => String(step.run ?? "").includes(commands[index]));
      expect(run.env).toMatchObject({ CI: true, PLAYWRIGHT_PR_SAFE: true, VITE_API_URL: "http://localhost:5173/graphql" });
      const uploads = job.steps.filter((step: any) => step.uses === "actions/upload-artifact@v4");
      expect(uploads).toHaveLength(2);
      for (const upload of uploads) {
        expect(artifacts.has(upload.with.name)).toBe(false);
        artifacts.add(upload.with.name);
        expect(upload.with["if-no-files-found"]).toBe("ignore");
      }
      expect(uploads[0].if).toBe("always()");
      expect(uploads[1].if).toBe("failure()");
    });
    expect(ci.jobs["backend-validation"]).toBeUndefined();
    expect(required.if).toContain("always()");
    expect(required.steps.some((step: any) =>
      typeof step.run === "string" && step.run.includes("result !== 'success'"),
    )).toBe(true);
  });

  it("runs the checkout-free aggregate from the existing runner workspace", () => {
    const ci = workflow("ci");
    const aggregate = ci.jobs["replatform-required"];
    expect(aggregate.steps.some((step: any) => String(step.uses ?? "").startsWith("actions/checkout@"))).toBe(false);
    const check = aggregate.steps.find((step: any) =>
      typeof step.run === "string" && step.run.includes("result !== 'success'"),
    );
    const effectiveWorkingDirectory = check["working-directory"]
      ?? aggregate.defaults?.run?.["working-directory"]
      ?? ci.defaults?.run?.["working-directory"];
    expect(effectiveWorkingDirectory).toBe("${{ github.workspace }}");
  });

  it("requires retained Music and local fixture lanes with event-specific nightly load", () => {
    const music = workflow("test");
    const required = music.jobs["music-required"];
    expect(required.needs).toEqual(expect.arrayContaining([
      "docs-contracts", "static", "unit-coverage", "contracts", "database",
      "security", "frontend", "browser", "image-deploy-contract", "platform-fixture",
    ]));
    expect(required.needs).toContain("load-chaos");
    expect(required.if).toContain("always()");
    expect(required.steps.some((step: any) =>
      typeof step.run === "string" && step.run.includes("result !== 'success'"),
    )).toBe(true);
    const check = required.steps.find((step: any) => String(step.run ?? "").includes("REQUIRED_RESULTS"));
    const cases = [
      { event: "pull_request", lane: "", nightly: false },
      { event: "push", lane: "", nightly: false },
      { event: "workflow_dispatch", lane: "pr", nightly: false },
      { event: "schedule", lane: "", nightly: true },
      { event: "workflow_dispatch", lane: "nightly", nightly: true },
    ] as const;
    const script = check.run.replace(/^node -e \"|\"\s*$/g, "");
    for (const { event, lane, nightly } of cases) {
      for (const load of ["success", "skipped", "failure", "cancelled"] as const) {
        const results = Object.fromEntries(required.needs.map((name: string) => [name, { result: name === "load-chaos" ? load : "success" }]));
        const result = spawnSync(process.execPath, ["-e", script], {
          encoding: "utf8", env: { ...process.env, REQUIRED_RESULTS: JSON.stringify(results), EVENT_NAME: event, LANE: lane },
        });
        const expected = load === "success" || (load === "skipped" && !nightly) ? 0 : 1;
        expect(result.status, `${event}/${lane}/${load}: ${result.stderr}`).toBe(expected);
      }
      for (const outcome of ["skipped", "failure", "cancelled"] as const) {
        const results = Object.fromEntries(required.needs.map((name: string) => [name, { result: name === "static" ? outcome : "success" }]));
        const result = spawnSync(process.execPath, ["-e", script], {
          encoding: "utf8", env: { ...process.env, REQUIRED_RESULTS: JSON.stringify(results), EVENT_NAME: event, LANE: lane },
        });
        expect(result.status, `${event}/${lane}/static=${outcome}: ${result.stderr}`).toBe(1);
      }
    }
  });

  it("keeps feature pushes and PRs out of all deployment jobs", () => {
    const frontend = workflow("explorers");
    expect(frontend.on).not.toHaveProperty("workflow_run");
    expect(frontend.on).not.toHaveProperty("push");
    expect(frontend.on).not.toHaveProperty("pull_request");
    expect(frontend.jobs["build-and-deploy"].if).toBe("${{ false }}");
    const image = workflow("tunes");
    expect(image.jobs["deploy-production"].if).toContain("github.event_name == 'workflow_dispatch'");
    expect(image.jobs["deploy-production"].if).toContain("inputs.release_production");
    expect(image.jobs["deploy-production"].if).toContain("github.ref == 'refs/heads/main'");
  });

  it("requires exact main source and image digest for a deliberate Tunes release", () => {
    const image = workflow("tunes");
    const deploy = workflow("tunes-deploy");
    expect(image.on.workflow_dispatch.inputs.release_production).toMatchObject({ type: "boolean", default: false });
    expect(image.jobs["deploy-production"].with).toMatchObject({
      digest: "${{ needs.publish-image.outputs.digest }}",
      commit: "${{ needs.publish-image.outputs.commit }}",
    });
    expect(deploy.jobs.deploy.environment).toBe("tunes-production");
    expect(deploy.jobs.deploy.if).toContain("github.ref == 'refs/heads/main'");
    expect(read("tunes-deploy")).not.toContain("GATE_PROD");
    expect(read("tunes-deploy")).toContain("--source-digest \"$COMMIT\"");
    expect(read("tunes-deploy")).toContain('[[ "$commit" == "$GITHUB_SHA" ]]');
  });

  it("requires a successful aggregate from the same main source before registry publication", () => {
    const image = workflow("tunes");
    expect(image.on.workflow_dispatch.inputs.validated_run_id).toMatchObject({ type: "string", required: true });
    expect(image.on.workflow_dispatch.inputs.music_validated_run_id).toMatchObject({ type: "string", required: true });
    const preflight = image.jobs["release-preflight"];
    expect(preflight.permissions).toEqual({ actions: "read", contents: "read" });
    const step = preflight.steps.find((step: any) => typeof step.run === "string");
    const script = step.run as string;
    expect(step.env.VALIDATED_RUN_ID).toBe("${{ inputs.validated_run_id }}");
    expect(script).toContain("replatform-required");
    expect(script).toContain("music-required");
    expect(script).toContain("GITHUB_SHA");
    expect(script).toContain("require_aggregate");
    expect(script).toContain(".github/workflows/ci.yml replatform-required");
    expect(script).toContain(".github/workflows/test.yml music-required");
    expect(image.jobs["publish-image"].needs).toContain("release-preflight");
  });

  it("retired temporary direct deployment has no callable workflow file", () => {
    expect(existsSync(resolve(root, ".github/workflows/tunes-test-direct-deploy.yml"))).toBe(false);
  });

  it("does not give PR validation deploy credentials or package write scope", () => {
    const ci = workflow("ci");
    expect(ci.permissions).toEqual({ contents: "read" });
    expect(read("ci")).not.toMatch(/secrets\.(?:TUNES_DEPLOY|EXPLORERS_DEPLOY)/);
    const image = workflow("tunes");
    expect(image.jobs["build-test-scan-push"].permissions).toEqual({ contents: "read" });
    const publish = image.jobs["publish-image"];
    expect(publish.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(publish.if).toContain("github.ref == 'refs/heads/main'");
  });
});
