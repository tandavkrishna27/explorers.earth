import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml") as { load(source: string): any };

describe("Tunes workflow provenance and input boundary", () => {
  it("retires the expired temporary direct-deploy workflow", () => {
    expect(existsSync(resolve(repoRoot, ".github/workflows/tunes-test-direct-deploy.yml"))).toBe(false);
  });

  it("pins every privileged production action to an immutable commit", () => {
    for (const path of [
      ".github/workflows/tunes.yml",
      ".github/workflows/tunes-deploy.yml",
    ]) {
      const workflow = parseYaml(read(path));
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value || typeof value !== "object") return;
        for (const [key, nested] of Object.entries(value)) {
          if (
            key === "uses" &&
            typeof nested === "string" &&
            !nested.startsWith("./")
          ) {
            expect(nested, `${path} contains mutable action authority`).toMatch(
              /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/,
            );
          }
          visit(nested);
        }
      };
      visit(workflow);
    }
  });

  it("bounds full-suite worker contention before image qualification", () => {
    // Break caught: unconstrained process-heavy Vitest files starve each other
    // and fail their bounded filesystem/subprocess deadlines before image scan.
    const workflow = parseYaml(read(".github/workflows/tunes.yml"));
    const step = workflow.jobs["build-test-scan-push"].steps.find(
      (candidate: any) => candidate.name === "Test Tunes",
    );
    expect(step.run).toContain("npm test -- --maxWorkers=2");
  });

  it("blocks fixable high vulnerabilities and retains a complete disclosure scan", () => {
    const workflow = parseYaml(read(".github/workflows/tunes.yml"));
    const steps = workflow.jobs["build-test-scan-push"].steps;
    const actionable = steps.find(
      (step: any) =>
        step.name === "Block fixable high and critical image vulnerabilities",
    );
    const disclosure = steps.find(
      (step: any) =>
        step.name === "Report all high and critical image vulnerabilities",
    );
    const upload = steps.find(
      (step: any) => step.name === "Retain complete vulnerability report",
    );
    expect(actionable.with).toMatchObject({
      "fail-build": true,
      "severity-cutoff": "high",
      "only-fixed": true,
    });
    expect(actionable["continue-on-error"]).toBeUndefined();
    const reserve = steps.find((step: any) => step.id === "report_reserve");
    expect(reserve.if).toBe("always() && steps.scan_reserve.outcome == 'success'");
    expect(reserve.run).toContain("bash scripts/image-ci-disk.sh reserve");
    expect(steps.indexOf(reserve)).toBeLessThan(steps.indexOf(disclosure));
    expect(disclosure.if).toBe("always() && steps.report_reserve.outcome == 'success'");
    expect(disclosure["continue-on-error"]).toBe(true);
    expect(disclosure.with).toMatchObject({
      "fail-build": false,
      "severity-cutoff": "high",
      "only-fixed": false,
      "output-format": "sarif",
    });
    expect(disclosure.with["output-file"]).toBe("grype-complete.sarif");
    const validation = steps.find((step: any) => step.id === "report_valid");
    expect(validation.if).toBe("always()");
    expect(validation.run).toContain('test "$REPORT_RESERVE_OUTCOME" = success');
    expect(validation.run).toContain('test "$COMPLETE_SCAN_OUTCOME" = success');
    expect(validation.run).toContain("bash scripts/image-ci-disk.sh identity");
    expect(validation.run).toContain("node scripts/image-ci-report.cjs grype-complete.sarif grype-complete.log");
    expect(steps.indexOf(validation)).toBeLessThan(steps.indexOf(upload));
    expect(upload.if).toBe("always() && steps.report_valid.outcome == 'success'");
    expect(upload.uses).toBe(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    );
    expect(upload.with.path.trim().split(/\r?\n/)).toEqual(["grype-complete.sarif", "grype-complete.log"]);
    expect(disclosure.env.GRYPE_LOG_FILE).toBe("${{ github.workspace }}/grype-complete.log");
    for (const name of ["Save the qualified image for an explicit release", "Transfer the qualified image to the release job"]) {
      const step = steps.find((candidate: any) => candidate.name === name);
      expect(step.if).toContain("success() && steps.scan_reserve.outcome == 'success' && steps.report_valid.outcome == 'success'");
      expect(step.if).toContain("github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.release_production");
    }
    const publish = workflow.jobs["publish-image"];
    expect(steps.indexOf(actionable)).toBeLessThan(
      steps.findIndex((step: any) => step.name === "Transfer the qualified image to the release job"),
    );
    expect(publish.needs).toEqual(["build-test-scan-push", "release-preflight"]);
    expect(publish.steps.some((step: any) => step.name === "Push and expose registry digest")).toBe(true);
  });

  it("limits manual dispatch to one-time bootstrap or rollback and keeps normal deploy internal", () => {
    // Production break caught: a manual caller selects an arbitrary package or commit for production deploy.
    const workflow = parseYaml(read(".github/workflows/tunes-deploy.yml"));
    expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual([
      "operation",
      "target_digest",
      "target_commit",
      "compose_project",
      "legacy_service",
    ]);
    expect(workflow.on.workflow_dispatch.inputs.operation.options).toEqual([
      "rollback",
      "bootstrap",
    ]);
    expect(
      workflow.on.workflow_dispatch.inputs.operation.options,
    ).not.toContain("deploy");
    expect(workflow.on.workflow_dispatch.inputs.target_digest.required).toBe(
      true,
    );
    expect(workflow.on.workflow_call.inputs).toEqual({
      digest: { type: "string", required: true },
      commit: { type: "string", required: true },
    });
  });

  it("derives the canonical repository and verifies GitHub plus OCI provenance", () => {
    // Production break caught: a valid digest from another owner reaches the production pull path.
    const ci = read(".github/workflows/tunes.yml");
    const deploy = read(".github/workflows/tunes-deploy.yml");
    const dockerfile = read("tunes/Dockerfile");
    const executable = `${read("tunes/deployment/music-deploy.sh")}\n${read("tunes/deployment/music-deploy-engine.sh")}`;
    expect(ci).toContain(
      "actions/attest-build-provenance@977bb373ede98d70efdf65b84cb5f73e068dcc2a",
    );
    expect(deploy).toContain(
      'IMAGE_REPOSITORY="ghcr.io/${owner}/explorers-tunes"',
    );
    expect(deploy).toContain("gh attestation verify");
    expect(executable).toContain("org.opencontainers.image.source");
    expect(executable).toContain("org.opencontainers.image.revision");
    expect(executable).toContain(
      "com.explorers.music.minimum-containment-commit",
    );
    expect(dockerfile).toContain("org.opencontainers.image.source");
    expect(dockerfile).toContain(
      "com.explorers.music.minimum-containment-commit",
    );
    expect(dockerfile).toContain(
      "FROM public.ecr.aws/docker/library/node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base",
    );
  });

  it("keeps the local OCI rehearsal outside every production authority", () => {
    const production = read("tunes/deployment/music-deploy.sh");
    const fixture = read("tunes/deployment/music-deploy-fixture.sh");
    const engine = read("tunes/deployment/music-deploy-engine.sh");
    const rehearsal = read("tunes/scripts/music-docker-release-rehearsal.ts");
    const authority = read("tunes/scripts/music-docker-release-authority.ts");
    expect(production).toContain(
      '"${MUSIC_DEPLOY_MODE:-production}" == production',
    );
    expect(production).toContain("^ghcr\\.io/");
    expect(production).toContain(
      "fixture deployment settings are forbidden in production mode",
    );
    expect(fixture).toContain(
      "direct fixture deployment authority is forbidden",
    );
    expect(fixture).not.toContain("MUSIC_DEPLOY_ROOT");
    expect(fixture).not.toContain("MUSIC_DEPLOY_HMAC_KEY_FILE");
    expect(fixture).not.toMatch(/^\s*(?:command\s+)?docker(?:\.exe)?\b/m);
    expect(engine).toContain(
      "deployment engine must be sourced by an authorized policy wrapper",
    );
    expect(authority).toContain("executing rehearsal script must be tracked");
    expect(authority).toContain("tracked source checkout must be clean");
    expect(authority).toContain(
      '["archive", "--format=tar", `${commit}:tunes`]',
    );
    expect(authority).toContain(
      "external fixture deployment authority is forbidden",
    );
    expect(authority).toContain(
      "fixture candidate is not an internally built registry digest",
    );
    expect(rehearsal).toContain(
      "const repository = `127.0.0.1:${registryPort}/explorers-tunes`",
    );
    expect(rehearsal).toContain("loopback transfer");
    expect(rehearsal).toContain('["push", tag]');
    expect(authority).toContain("REVIEWED_FIXTURE_IMAGES");
    expect(rehearsal).toContain('requireReviewedLocalImage("registry")');
    expect(rehearsal).toContain('requireReviewedLocalImage("postgres")');
    expect(rehearsal).toContain('requireReviewedLocalImage("traefik")');
    expect(rehearsal).toContain('requireReviewedLocalImage("node")');
    expect(rehearsal).not.toMatch(
      /registry:2|postgres:15-alpine|traefik:v3\.1|node:22\.12-alpine/,
    );
    expect(rehearsal.match(/"--pull=never"/g)).toHaveLength(2);
    expect(rehearsal.match(/pull_policy: "never"/g)).toHaveLength(6);
    expect(rehearsal.match(/"build", "--pull=false"/g)).toHaveLength(2);
    expect(rehearsal).toContain(
      '["--config", dockerConfigDirectory, "--host", dockerEndpoint, ...args]',
    );
    expect(rehearsal).not.toContain("DOCKER_HOST: dockerEndpoint");
    expect(rehearsal).toContain(
      "assertNoExternalFixtureAuthority(process.env)",
    );
    expect(rehearsal).toContain(
      "captureTrustedFixtureSource(fileURLToPath(import.meta.url))",
    );
    expect(rehearsal).toContain(
      "privateTemporaryDirectory(join(dirname(repoRoot)",
    );
    expect(rehearsal).not.toContain("tmpdir()");
    expect(rehearsal).toContain('method: "HEAD"');
    expect(rehearsal).toContain("application/vnd.oci.image.index.v1+json");
    expect(rehearsal).toContain(
      "application/vnd.docker.distribution.manifest.list.v2+json",
    );
    expect(rehearsal).toContain(
      'response.headers.get("docker-content-digest")',
    );
    expect(
      rehearsal.indexOf("await registryDigest(repositoryName, destinationTag"),
    ).toBeLessThan(rehearsal.indexOf("immutable registry pull"));
    expect(rehearsal.indexOf("immutable registry pull")).toBeLessThan(
      rehearsal.indexOf("immutable local identity"),
    );
    expect(rehearsal).toContain(
      "assertStableLocalImageTransfer(repositoryName, sourceId",
    );
    expect(rehearsal).not.toContain("candidate ${candidate} local eviction");
    expect(rehearsal).toContain("trustedSource.tunesArchive");
    expect(rehearsal).toContain("assertPrivateFixtureFileUnchanged(authority)");
    expect(rehearsal).toContain('"npipe:////./pipe/dockerDesktopLinuxEngine"');
    expect(rehearsal).toContain("createSanitizedFixtureEnvironment");
    expect(rehearsal).toContain("dockerConfigDirectory");
    expect(rehearsal).not.toContain("ghcr.io");
    expect(rehearsal).not.toContain("GATE_PROD");
    expect(rehearsal).not.toContain("--api.insecure=true");
  });

  it("transmits only an encoded fixed-schema bundle and runs the checked-in executable", () => {
    // Production break caught: shell metacharacters from a dispatch input enter OpenSSH's remote command string.
    const deploy = read(".github/workflows/tunes-deploy.yml");
    expect(deploy).toContain("music-deploy-request-v2");
    expect(deploy).toContain("base64");
    expect(deploy).toContain("tunes/deployment/music-deploy.sh");
    expect(deploy).toContain(
      'install -m 700 tunes/deployment/music-deploy-engine.sh "$bundle/music-deploy-engine.sh"',
    );
    expect(deploy).toContain(
      'chmod 700 "$incoming/music-deploy.sh" "$incoming/music-deploy-engine.sh"',
    );
    expect(deploy).not.toMatch(/ssh[^\n]*\$\{\{\s*inputs\./);
    expect(deploy).not.toContain("ghcr.io/*/explorers-tunes");
    expect(deploy).not.toContain("inputs.image_ref");
    expect(deploy).not.toMatch(/ssh[^\n]*\$\{\{\s*inputs\./);
  });

  it("admits normal deploys only from the pinned main CI caller with attestation permission", () => {
    // Production break caught: another repository workflow calls the reusable
    // deploy authority with an attacker-selected but otherwise valid request.
    const ci = read(".github/workflows/tunes.yml");
    const deploy = read(".github/workflows/tunes-deploy.yml");
    expect(deploy).toContain(
      "$GITHUB_REPOSITORY/.github/workflows/tunes.yml@refs/heads/main",
    );
    expect(ci).toContain("github.event_name == 'workflow_dispatch' && inputs.release_production");
    expect(ci).toMatch(
      /deploy-production:[\s\S]*?permissions:[\s\S]*?attestations: read/,
    );
    expect(deploy).toContain("inputs.operation == 'bootstrap'");
    expect(deploy).toContain("gh attestation verify");
    expect(deploy).toContain(
      'gh attestation verify "oci://${IMAGE_REPOSITORY}@${DIGEST}"',
    );
    expect(deploy).toContain(
      "docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9",
    );
    expect(deploy).toContain("password: ${{ github.token }}");
    expect(deploy).toContain(
      'git merge-base --is-ancestor "$commit" "$GITHUB_SHA"',
    );
    expect(deploy).toContain(
      '--signer-workflow "$GITHUB_REPOSITORY/.github/workflows/tunes.yml"',
    );
    expect(deploy).not.toContain(
      '--signer-workflow "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/.github/workflows/tunes.yml"',
    );
    expect(deploy).toContain("--source-ref refs/heads/main");
    expect(deploy).toContain('--source-digest "$COMMIT"');
  });

  it("cleans only the fixed bundle files without recursive deletion", () => {
    const deploy = read(".github/workflows/tunes-deploy.yml");
    expect(deploy).not.toContain("rm -rf");
    expect(deploy).toContain('rm -f -- "$bundle/music-deploy.sh"');
    expect(deploy).toContain('rm -f -- "$incoming/music-deploy.sh"');
  });

  it("unexports the injected HMAC secret before the first child process", () => {
    // Secret break caught: mktemp/install/tar/ssh inherit the GitHub-injected
    // HMAC bytes even though only the protected key file needs them.
    const workflow = parseYaml(read(".github/workflows/tunes-deploy.yml"));
    const run = workflow.jobs.deploy.steps.find(
      (step: any) =>
        step.name === "Run checked-in transactional deploy executable",
    ).run as string;
    const capture = run.indexOf(
      'hmac_key_value="$MUSIC_DEPLOY_STATE_HMAC_KEY"',
    );
    const unexport = run.indexOf("unset MUSIC_DEPLOY_STATE_HMAC_KEY");
    const firstChild = run.indexOf('bundle="$(mktemp -d)"');
    const persist = run.indexOf(
      'printf \'%s\' "$hmac_key_value" > "$bundle/hmac.key"',
    );
    const eraseShellValue = run.indexOf("unset hmac_key_value");
    expect(capture).toBeGreaterThan(-1);
    expect(unexport).toBeGreaterThan(capture);
    expect(firstChild).toBeGreaterThan(unexport);
    expect(persist).toBeGreaterThan(firstChild);
    expect(eraseShellValue).toBeGreaterThan(persist);
  });

  it("gates the environment-bearing job on a no-secret protected-main policy preflight", () => {
    // Production break caught: a branch dispatch enters tunes-production before
    // proving the ref and external environment policy are protected-main only.
    const workflow = parseYaml(read(".github/workflows/tunes-deploy.yml"));
    const preflight = workflow.jobs["production-authority-preflight"];
    const deploy = workflow.jobs.deploy;
    expect(preflight).toBeDefined();
    expect(preflight.environment).toBeUndefined();
    expect(JSON.stringify(preflight)).not.toContain("secrets.");
    expect(preflight.if).toBeUndefined();
    expect(
      preflight.steps.some((step: any) =>
        String(step.run ?? "").includes(
          "verify-production-environment-policy.mjs",
        ),
      ),
    ).toBe(true);
    expect(deploy.needs).toBe("production-authority-preflight");
    expect(deploy.if).toContain("github.ref == 'refs/heads/main'");
    expect(deploy.if).toContain(
      "needs.production-authority-preflight.result == 'success'",
    );
    expect(deploy.environment).toBe("tunes-production");
  });

  it("documents protected-main environment policy as a prerequisite rather than a YAML guarantee", () => {
    const runbook = read("docs/operations/music-deploy-runbook.md");
    const prose = runbook.replace(/\s+/g, " ");
    expect(prose).toContain("deployment branch policy");
    expect(prose).toContain("protected branches only");
    expect(prose).toContain("main must be the sole protected branch");
    expect(prose).toContain("main is protected");
    expect(prose).toContain(
      "legacy repository-scoped `TUNES_DEPLOY_HOST` and `TUNES_DEPLOY_KEY`",
    );
    expect(prose).toContain("job-scoped GitHub token");
    expect(prose).toContain(
      "new production credentials are environment-scoped only",
    );
    expect(prose).toContain("YAML check is not the security boundary");
    expect(prose).toContain("independent approval");
  });
});
