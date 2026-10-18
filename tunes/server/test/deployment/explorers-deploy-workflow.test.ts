import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// P2 Task 7: .github/workflows/explorers.yml deploys the whole application over
// the live explorers host. These pin the properties that keep it from doing so by
// accident, and the ordering that keeps a failed API deploy from switching the SPA.
const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml") as { load(source: string): any };

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const raw = readFileSync(resolve(repositoryRoot, ".github/workflows/explorers.yml"), "utf8");
const workflow = parseYaml(raw);
const hostScript = readFileSync(resolve(repositoryRoot, "deploy/host/explorers-deploy.sh"), "utf8");

type Step = { name?: string; uses?: string; run?: string; env?: Record<string, string> };
const deploySteps: Step[] = workflow.jobs.deploy.steps;
const stepIndex = (pattern: RegExp) => {
  const index = deploySteps.findIndex((step) => pattern.test(`${step.name ?? ""} ${step.run ?? ""} ${step.uses ?? ""}`));
  expect(index, String(pattern)).toBeGreaterThanOrEqual(0);
  return index;
};

function runAuthorize(env: Record<string, string>) {
  const script = workflow.jobs.authorize.steps[0].run as string;
  return spawnSync("bash", ["-c", script], { env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
}

const CONFIRMED = {
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main",
  CONFIRM: "replace-explorers-host", DIGEST: `sha256:${"a".repeat(64)}`,
};

describe("explorers deploy workflow", () => {
  it("can only be dispatched by hand", () => {
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.on.workflow_dispatch.inputs.confirm_cutover.required).toBe(true);
    expect(workflow.on.workflow_dispatch.inputs.confirm_cutover.default).toBe("");
  });

  it("refuses unless the cutover phrase is typed exactly, from main", () => {
    // Break caught: a mis-click on "Run workflow" replacing the live host.
    expect(runAuthorize(CONFIRMED).status).toBe(0);
    for (const env of [
      { ...CONFIRMED, CONFIRM: "" },
      { ...CONFIRMED, CONFIRM: "yes" },
      { ...CONFIRMED, CONFIRM: "replace-explorers-host " },
      { ...CONFIRMED, GITHUB_REF: "refs/heads/feature" },
      { ...CONFIRMED, GITHUB_EVENT_NAME: "push" },
      { ...CONFIRMED, DIGEST: "latest" },
    ]) {
      const result = runAuthorize(env);
      expect(result.status, JSON.stringify(env)).not.toBe(0);
    }
  });

  it("touches no secret before the gate has passed", () => {
    const authorize = JSON.stringify(workflow.jobs.authorize);
    expect(authorize).not.toMatch(/secrets\./);
    expect(workflow.jobs.deploy.needs).toBe("authorize");
    const jobsWithSecrets = Object.entries(workflow.jobs)
      .filter(([, job]) => /secrets\./.test(JSON.stringify(job))).map(([name]) => name);
    expect(jobsWithSecrets).toEqual(["deploy"]);
  });

  it("builds no image and inlines no VITE_ secret", () => {
    // auditDeploymentAuthority keeps tunes.yml the single, scanned build authority.
    expect(raw).not.toMatch(/build-push-action/);
    expect(raw).not.toMatch(/secrets\.VITE_/);
    expect(raw).not.toMatch(/if:\s*\$\{\{\s*false\s*\}\}/);
    expect(raw).toMatch(/--signer-workflow "\$GITHUB_REPOSITORY\/\.github\/workflows\/tunes\.yml"/);
    expect(raw).toMatch(/--source-digest "\$GITHUB_SHA"/);
  });

  it("fails fast when the production public.json variable is missing", () => {
    const first = deploySteps[0];
    expect(first.run).toContain("EXPLORERS_PUBLIC_JSON is not set");
    expect(workflow.jobs.deploy.env.PUBLIC_JSON).toBe("${{ vars.EXPLORERS_PUBLIC_JSON }}");
  });

  it("verifies the image, then stages the API, checks it, and only then switches the SPA", () => {
    const verify = stepIndex(/gh attestation verify/);
    const stage = stepIndex(/explorers-deploy\.sh' stage/);
    const accept = stepIndex(/API acceptance checks/);
    const activate = stepIndex(/explorers-deploy\.sh' activate/);
    const firstSsh = deploySteps.findIndex((step) => /\b(ssh|scp) /.test(step.run ?? ""));
    expect(verify).toBeLessThan(firstSsh);
    expect(stage).toBeLessThan(accept);
    expect(accept).toBeLessThan(activate);
  });

  it("refuses an image older than the database before starting it", () => {
    const marker = hostScript.indexOf("refusing an older image");
    const fullUp = hostScript.indexOf("compose up -d --wait ||");
    expect(marker).toBeGreaterThan(0);
    expect(hostScript.indexOf("music_schema_migrations")).toBeGreaterThan(0);
    expect(marker).toBeLessThan(fullUp);
  });

  it("gates on readiness with a bounded timeout", () => {
    expect(hostScript).toContain("readonly READY_URL=http://127.0.0.1:5000/health/ready");
    expect(hostScript).toMatch(/readonly READY_TIMEOUT_SECONDS=\d+/);
  });

  it("backs up the nginx site, swaps the symlink atomically, tests, then reloads", () => {
    const activate = hostScript.slice(hostScript.indexOf("activate() {"));
    const order = ["cp -pL \"$NGINX_SITE_PATH\" \"$backup\"", "mv -Tf \"$SRV/current.next\" \"$SRV/current\"",
      "test_output=\"$(nginx -t 2>&1)\"", "systemctl reload nginx"].map((needle) => activate.indexOf(needle));
    expect(order.every((index) => index >= 0), String(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
