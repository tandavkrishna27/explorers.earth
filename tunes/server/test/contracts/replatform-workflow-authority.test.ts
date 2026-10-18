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
  it("validates every main PR and exact-source integration pushes only in required validation workflows", () => {
    const ci = workflow("ci");
    expect(ci.on.pull_request.branches).toContain("main");
    expect(ci.on.pull_request).not.toHaveProperty("paths");
    expect(ci.on.pull_request).not.toHaveProperty("paths-ignore");
    for (const name of ["ci", "test"]) {
      expect(workflow(name).on.push.branches).toEqual(["main", "develop", "codex/unified-replatform"]);
      expect(workflow(name).on.push).not.toHaveProperty("paths");
      expect(workflow(name).on.push).not.toHaveProperty("paths-ignore");
    }
    for (const name of ["music-c0-contracts", "tunes"]) {
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
      "changes", "lint", "typecheck", "unit-tests", "build", "integration-tests",
      "e2e-category-a", "e2e-category-b", "e2e-public-shell", "e2e-publishing", "e2e-music-account",
    ]));
    for (const name of ["e2e-category-a", "e2e-category-b", "e2e-public-shell", "e2e-publishing", "e2e-music-account"]) {
      expect(ci.jobs[name]).toBeDefined();
      // Independent of lint, typecheck and unit tests: the only upstream is the change classifier.
      expect(ci.jobs[name].needs).toEqual(["changes"]);
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
      // The report upload stays always(). The trace upload is failure() for the
      // four lanes that fail normally; e2e-music-account is the exception and must
      // be always(), because it has been cancelled at its job timeout on every
      // recorded SHA (46eea549, 1a5c6942, 225d83e5) and a cancelled job never
      // satisfies failure() — so the one lane whose failures are least understood
      // was the only lane discarding its traces. always() retains strictly more
      // than failure() and is never the weaker condition, so this pins a stronger
      // per-lane policy rather than relaxing the check.
      expect(uploads[1].if).toBe(name === "e2e-music-account" ? "always()" : "failure()");
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

  describe("documentation-only pull requests", () => {
    const GATE = "needs.changes.outputs.docs_only != 'true'";
    const gatedMusic = ["static", "unit-coverage", "database", "security", "frontend", "browser", "image-deploy-contract", "platform-fixture"];
    const documentationReaders = ["docs-contracts", "contracts"];
    const aggregateScript = (job: any) => {
      const step = job.steps.find((candidate: any) => String(candidate.run ?? "").includes("REQUIRED_RESULTS"));
      return String(step.run).replace(/^node -e \"|\"\s*$/g, "");
    };
    type Outcome = "success" | "skipped" | "failure" | "cancelled";
    const aggregate = (job: any, event: string, results: Record<string, Outcome>, docsOnly: string | undefined, lane = "") => {
      const needs = Object.fromEntries(job.needs.map((name: string) => [
        name,
        name === "changes" ? { result: results[name] ?? "success", outputs: docsOnly === undefined ? {} : { docs_only: docsOnly } } : { result: results[name] ?? "success" },
      ]));
      const env = { REQUIRED_RESULTS: JSON.stringify(needs), EVENT_NAME: event, LANE: lane };
      // In-process, not a spawned `node -e` per case: the matrices below are ~150 cases and a
      // process per case timed out under load in the whole-tree run. realNodeAggregate keeps one
      // genuine `node -e` execution per aggregate to prove the quoting survives the shell.
      class Exited extends Error { constructor(readonly code: number) { super("exit"); } }
      const runner = { env, exit: (code: number) => { throw new Exited(code); } };
      try {
        new Function("process", "console", aggregateScript(job))(runner, { error: () => undefined });
        return 0;
      } catch (error) {
        if (error instanceof Exited) return error.code;
        throw error;
      }
    };
    const realNodeAggregate = (job: any, event: string, results: Record<string, Outcome>, docsOnly: string) => spawnSync(process.execPath, ["-e", aggregateScript(job)], {
      encoding: "utf8",
      env: {
        ...process.env, EVENT_NAME: event, LANE: "",
        REQUIRED_RESULTS: JSON.stringify(Object.fromEntries(job.needs.map((name: string) => [name, name === "changes" ? { result: "success", outputs: { docs_only: docsOnly } } : { result: results[name] ?? "success" }]))),
      },
    }).status;
    const skippedExcept = (job: any, keep: string[]) => Object.fromEntries(
      job.needs.filter((name: string) => name !== "changes" && !keep.includes(name)).map((name: string) => [name, "skipped" as Outcome]),
    );

    it("classifies the change set once per required workflow with an exact, fail-closed contract", () => {
      for (const name of ["ci", "test"]) {
        const changes = workflow(name).jobs.changes;
        expect(changes, name).toBeDefined();
        expect(changes.needs, name).toBeUndefined();
        expect(changes.outputs, name).toEqual({ docs_only: "${{ steps.classify.outputs.docs_only }}" });
        const checkout = changes.steps.find((step: any) => String(step.uses ?? "").startsWith("actions/checkout@"));
        // The PR merge commit and its base parent: both are needed to diff the PR against its base.
        expect(checkout.with["fetch-depth"], name).toBe(2);
        const classify = changes.steps.find((step: any) => step.id === "classify");
        expect(classify.run, name).toBe("node scripts/ci-docs-only.cjs");
        expect(classify.env, name).toEqual({ EVENT_NAME: "${{ github.event_name }}" });
        // No secrets, no write scope, and no third-party action deciding which lanes run.
        expect(JSON.stringify(changes), name).not.toMatch(/secrets\.|dorny\/|paths-filter/);
      }
      expect(workflow("ci").jobs.changes["timeout-minutes"]).toBeLessThanOrEqual(5);
    });

    it("gates every heavy lane on the classifier and leaves the documentation readers ungated", () => {
      const ci = workflow("ci");
      const ciLanes = Object.keys(ci.jobs).filter(name => !["changes", "replatform-required"].includes(name));
      expect(ciLanes).toEqual(expect.arrayContaining(["lint", "typecheck", "unit-tests", "build", "integration-tests", "e2e-category-a", "e2e-category-b", "e2e-public-shell", "e2e-publishing", "e2e-music-account"]));
      for (const name of ciLanes) {
        expect(ci.jobs[name].needs, name).toEqual(expect.arrayContaining(["changes"]));
        expect(ci.jobs[name].if, name).toBe(GATE);
      }
      const music = workflow("test");
      for (const name of gatedMusic) {
        expect(music.jobs[name].needs, name).toEqual(["changes"]);
        expect(music.jobs[name].if, name).toBe(GATE);
      }
      // docs-contracts and contracts read docs/, READMEs and CLAUDE.md. They are what keeps
      // documentation honest on a docs-only change, so no diff may be able to skip them.
      for (const name of documentationReaders) {
        expect(music.jobs[name], name).toBeDefined();
        expect(music.jobs[name], name).not.toHaveProperty("if");
        expect(music.jobs[name], name).not.toHaveProperty("needs");
      }
      // Nightly-only and release-adjacent lanes keep their own exact conditions.
      expect(music.jobs["load-chaos"].needs).toBe("browser");
      expect(music.jobs["load-chaos"].if).toBe("github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && inputs.lane == 'nightly')");
      // Every music job is accounted for: gated, a documentation reader, the classifier, or the aggregate.
      const accounted = new Set([...gatedMusic, ...documentationReaders, "changes", "load-chaos", "music-required"]);
      expect(Object.keys(music.jobs).filter(name => !accounted.has(name))).toEqual([]);
    });

    it("keeps the aggregates bound to every job and unconditionally running", () => {
      for (const [name, aggregateName] of [["ci", "replatform-required"], ["test", "music-required"]] as const) {
        const wf = workflow(name);
        const lanes = Object.keys(wf.jobs).filter(job => job !== aggregateName);
        expect(wf.jobs[aggregateName].needs.slice().sort(), name).toEqual(lanes.slice().sort());
        expect(wf.jobs[aggregateName].if, name).toBe("always()");
        expect(wf.jobs[aggregateName], name).not.toHaveProperty("continue-on-error");
      }
    });

    it("both aggregates behave identically when run as a real node -e command", () => {
      for (const [name, aggregateName] of [["ci", "replatform-required"], ["test", "music-required"]] as const) {
        const job = workflow(name).jobs[aggregateName];
        const mustRun = name === "test" ? documentationReaders : [];
        const skipped = Object.fromEntries(job.needs.filter((lane: string) => lane !== "changes" && !mustRun.includes(lane)).map((lane: string) => [lane, "skipped" as Outcome]));
        expect(realNodeAggregate(job, "pull_request", skipped, "true"), `${name} docs-only`).toBe(0);
        expect(realNodeAggregate(job, "pull_request", skipped, "false"), `${name} not docs-only`).toBe(1);
        expect(realNodeAggregate(job, "pull_request", {}, "false"), `${name} all success`).toBe(0);
        expect(realNodeAggregate(job, "push", skipped, "true"), `${name} push`).toBe(1);
      }
    });

    it("replatform-required passes a docs-only PR with every lane skipped, and nothing else", () => {
      const job = workflow("ci").jobs["replatform-required"];
      const lanes = job.needs.filter((name: string) => name !== "changes");
      const allSkipped = Object.fromEntries(lanes.map((name: string) => [name, "skipped" as Outcome]));
      expect(aggregate(job, "pull_request", allSkipped, "true")).toBe(0);
      // The same skips are a failure whenever the classifier did not positively say docs-only.
      for (const docsOnly of ["false", "", "TRUE", "1", undefined]) {
        expect(aggregate(job, "pull_request", allSkipped, docsOnly), `docs_only=${String(docsOnly)}`).toBe(1);
      }
      for (const changes of ["failure", "cancelled", "skipped"] as Outcome[]) {
        expect(aggregate(job, "pull_request", { ...allSkipped, changes }, "true"), `changes=${changes}`).toBe(1);
      }
      // A skip is only tolerated for pull_request; push, schedule and dispatch need real success.
      for (const event of ["push", "schedule", "workflow_dispatch", "merge_group"]) {
        expect(aggregate(job, event, allSkipped, "true"), event).toBe(1);
      }
      // A lane that ran and failed, or was cancelled, still fails a docs-only PR.
      for (const lane of lanes) for (const outcome of ["failure", "cancelled"] as Outcome[]) {
        expect(aggregate(job, "pull_request", { ...allSkipped, [lane]: outcome }, "true"), `${lane}=${outcome}`).toBe(1);
      }
      // A code PR still needs every lane to succeed: one skipped or failed lane fails it.
      expect(aggregate(job, "pull_request", {}, "false")).toBe(0);
      for (const lane of lanes) for (const outcome of ["skipped", "failure", "cancelled"] as Outcome[]) {
        expect(aggregate(job, "pull_request", { [lane]: outcome }, "false"), `code ${lane}=${outcome}`).toBe(1);
      }
      for (const event of ["push", "schedule", "workflow_dispatch"]) expect(aggregate(job, event, {}, "false"), event).toBe(0);
    });

    it("music-required passes a docs-only PR only while the documentation readers succeed", () => {
      const job = workflow("test").jobs["music-required"];
      const skipHeavy = skippedExcept(job, documentationReaders);
      expect(aggregate(job, "pull_request", skipHeavy, "true")).toBe(0);
      // load-chaos is part of the skipped set above; it is also accepted on its own for non-nightly runs.
      for (const docsOnly of ["false", "", "TRUE", undefined]) {
        expect(aggregate(job, "pull_request", skipHeavy, docsOnly), `docs_only=${String(docsOnly)}`).toBe(1);
      }
      for (const changes of ["failure", "cancelled", "skipped"] as Outcome[]) {
        expect(aggregate(job, "pull_request", { ...skipHeavy, changes }, "true"), `changes=${changes}`).toBe(1);
      }
      for (const event of ["push", "schedule", "workflow_dispatch", "merge_group"]) {
        expect(aggregate(job, event, skipHeavy, "true", event === "workflow_dispatch" ? "pr" : ""), event).toBe(1);
      }
      // The documentation readers may never skip, fail or be cancelled, even on a docs-only PR.
      for (const reader of documentationReaders) for (const outcome of ["skipped", "failure", "cancelled"] as Outcome[]) {
        expect(aggregate(job, "pull_request", { ...skipHeavy, [reader]: outcome }, "true"), `${reader}=${outcome}`).toBe(1);
      }
      // A heavy lane that ran must still succeed.
      for (const lane of gatedMusic) for (const outcome of ["failure", "cancelled"] as Outcome[]) {
        expect(aggregate(job, "pull_request", { ...skipHeavy, [lane]: outcome }, "true"), `${lane}=${outcome}`).toBe(1);
      }
      // Code PRs are unchanged: every gated lane must succeed.
      for (const lane of gatedMusic) {
        expect(aggregate(job, "pull_request", { [lane]: "skipped" }, "false"), `code ${lane}`).toBe(1);
      }
      expect(aggregate(job, "pull_request", { "load-chaos": "skipped" }, "false")).toBe(0);
      expect(aggregate(job, "schedule", { "load-chaos": "skipped" }, "false")).toBe(1);
    });

    it("excludes Markdown, and only Markdown, from the optional image and C0 path filters", () => {
      for (const name of ["tunes", "music-c0-contracts"]) {
        const on = workflow(name).on;
        for (const event of ["pull_request", "push"]) {
          const paths: string[] = on[event].paths;
          // Last matching pattern wins, so the exclusion has to come after every inclusion.
          expect(paths.at(-1), `${name} ${event}`).toBe("!**/*.md");
          expect(paths.filter(path => path.startsWith("!")), `${name} ${event}`).toEqual(["!**/*.md"]);
        }
      }
      // docs/ is not Markdown-only: the runtime surface inventory feeds the image, so it still triggers.
      expect(workflow("tunes").on.pull_request.paths).toContain("docs/architecture/music-runtime-surface-inventory.json");
      expect(workflow("music-c0-contracts").on.pull_request.paths).toContain("docs/**");
    });
  });

  it("keeps feature pushes and PRs out of all deployment jobs", () => {
    const frontend = workflow("explorers");
    expect(frontend.on).not.toHaveProperty("workflow_run");
    expect(frontend.on).not.toHaveProperty("push");
    expect(frontend.on).not.toHaveProperty("pull_request");
    // explorers.yml (P2 Task 7) replaced the disabled `build-and-deploy` job with an
    // `authorize` gate and a `deploy` job. Dispatch is its only trigger, and every job
    // except the gate itself must statically require dispatch, main, the typed
    // cutover phrase and the gate's success - so no push or PR can reach one.
    expect(Object.keys(frontend.on)).toEqual(["workflow_dispatch"]);
    expect(frontend.jobs).not.toHaveProperty("build-and-deploy");
    const gated = Object.entries(frontend.jobs).filter(([name]) => name !== "authorize");
    expect(gated.map(([name]) => name)).toEqual(["deploy"]);
    for (const [name, job] of gated as Array<[string, any]>) {
      expect(job.needs, name).toBe("authorize");
      expect(job.if, name).toContain("needs.authorize.result == 'success'");
      expect(job.if, name).toContain("github.event_name == 'workflow_dispatch'");
      expect(job.if, name).toContain("github.ref == 'refs/heads/main'");
      expect(job.if, name).toContain("inputs.confirm_cutover == 'replace-explorers-host'");
      expect(job.if, name).not.toMatch(/\|\||always\(\)|!cancelled\(\)|failure\(\)/);
    }
    expect(JSON.stringify(frontend.jobs.authorize)).not.toMatch(/secrets\./);
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
    // packages: read pulls the GHCR base-image mirror only; any write scope stays refused.
    expect(image.jobs["build-test-scan-push"].permissions).toEqual({ contents: "read", packages: "read" });
    const publish = image.jobs["publish-image"];
    expect(publish.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(publish.if).toContain("github.ref == 'refs/heads/main'");
  });
});
