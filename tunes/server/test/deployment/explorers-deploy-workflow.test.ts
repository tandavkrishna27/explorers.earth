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

  it("reads the migration journal in a statement of its own", () => {
    // Break caught (cutover rehearsal): one CASE that read the journal only when
    // to_regclass found it. PostgreSQL resolves every table a statement names
    // before running it, so the very first deploy, onto an empty database, died
    // with 'relation "music_schema_migrations" does not exist'.
    const statements = [...hostScript.matchAll(/<<'SQL'\n([\s\S]*?)\nSQL\n/g)].map((match) => match[1]);
    expect(statements.length).toBeGreaterThanOrEqual(2);
    for (const sql of statements) {
      expect(/to_regclass/.test(sql) && /FROM\s+\S*music_schema_migrations/.test(sql), sql).toBe(false);
    }
  });

  it("puts the previous compose file back when stage refuses before starting the image", () => {
    // Break caught (cutover rehearsal): a refused rollback left the older release's
    // compose file, with its older migration marker, beside the newer running
    // image; the next `compose up` then failed the migration gate.
    const stage = hostScript.slice(hostScript.indexOf("stage() {"), hostScript.indexOf("activate() {"));
    expect(stage).toMatch(/refuse\(\) \{[\s\S]*?cp -p "\$COMPOSE_FILE\.previous" "\$COMPOSE_FILE"/);
    const fullUp = stage.indexOf("compose up -d --wait ||");
    expect(stage.indexOf('refuse "image bundles migrations up to')).toBeGreaterThan(0);
    expect(stage.indexOf('refuse "image bundles migrations up to')).toBeLessThan(fullUp);
    expect(stage.slice(stage.indexOf("refuse() {"), fullUp)).not.toMatch(/\|\| fail "/);
  });

  it("polls nginx after the reload instead of probing it once", () => {
    // Break caught (cutover rehearsal): `nginx -s reload` returns before the new
    // workers listen. On the first deploy :443 was not open yet, curl exited 7, and
    // set -e ended activate with no message and no restore.
    const activate = hostScript.slice(hostScript.indexOf("activate() {"));
    const reload = activate.indexOf("systemctl reload nginx ||");
    const poll = activate.indexOf('until [[ "$served" == "$expected"');
    expect(reload).toBeGreaterThan(0);
    expect(poll).toBeGreaterThan(reload);
    expect(activate.slice(poll, activate.indexOf("is live"))).toContain("restore");
  });

  it("records the running image for the operator's own compose commands", () => {
    expect(hostScript).toContain('readonly IMAGE_ENV="$OPT/image.env"');
    expect(hostScript.indexOf('mv -f "$IMAGE_ENV.next" "$IMAGE_ENV"')).toBeGreaterThan(hostScript.indexOf('echo "API ready: $IMAGE"'));
  });

  it("runs the same API acceptance file the rehearsal runs", () => {
    const accept = deploySteps[stepIndex(/API acceptance checks/)];
    expect(accept.run).toContain("bash deploy/host/api-acceptance.sh http://127.0.0.1:15000");
    const script = readFileSync(resolve(repositoryRoot, "deploy/host/api-acceptance.sh"), "utf8");
    for (const probe of ["check /health/ready 200", "check /api/explorers/v1/me 401", "check /api/auth/get-session 200"]) {
      expect(script).toContain(probe);
    }
  });

  it("ships host scripts that parse", () => {
    for (const file of ["deploy/host/explorers-deploy.sh", "deploy/host/explorers-bootstrap.sh", "deploy/host/api-acceptance.sh", "deploy/rehearsal/rehearse.sh"]) {
      const result = spawnSync("bash", ["-n", resolve(repositoryRoot, file)], { encoding: "utf8" });
      expect(result.status, `${file}: ${result.stderr}`).toBe(0);
    }
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
