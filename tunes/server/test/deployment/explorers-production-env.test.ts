import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// All application configuration for the canonical deploy lives in the
// explorers-production GitHub environment. explorers.yml renders production.env
// from it (deploy/render-production-env.sh), validates it with the rules
// explorers-bootstrap.sh check also uses (deploy/host/validate-production-env.sh)
// before any SSH, and explorers-deploy.sh installs it root-owned 0600, keeping
// the previous file. These pin that no value is ever printed, that the rules
// cannot drift, and that the host side installs exactly as documented.
const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml") as { load(source: string): any };

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const read = (file: string) => readFileSync(resolve(repositoryRoot, file), "utf8");
const renderer = resolve(repositoryRoot, "deploy/render-production-env.sh");
const validator = resolve(repositoryRoot, "deploy/host/validate-production-env.sh");
const raw = read(".github/workflows/explorers.yml");
const workflow = parseYaml(raw);
const deployJob = workflow.jobs.deploy;
type Step = { name?: string; uses?: string; run?: string; env?: Record<string, string> };
const deploySteps: Step[] = deployJob.steps;
const hostScript = read("deploy/host/explorers-deploy.sh");
const bootstrapScript = read("deploy/host/explorers-bootstrap.sh");
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

const SERVER_NAME = "explorers.test";
// Distinctive values, so a leak into any output is unmistakable.
const INPUTS: Record<string, string> = {
  EXPLORERS_SERVER_NAME: SERVER_NAME,
  EXPLORERS_AUTH_SECRET: `authsentinel${"a".repeat(40)}`,
  MUSIC_GATE_ATTESTATION_KEY: `gatesentinel${"b".repeat(40)}`,
  GOOGLE_CLIENT_ID: "1234-clientsentinel.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "GOCSPX-clientsecretsentinel",
  GOOGLE_BOOKS_API_KEY: "AIzabookssentinel",
  TMDB_ACCESS_TOKEN: "eyJtmdbsentinel.payload.sig",
  EXPLORERS_S3_ACCESS_KEY_ID: "AKIAS3SENTINEL",
  EXPLORERS_S3_SECRET_ACCESS_KEY: "s3secret/sentinel+value=",
  EXPLORERS_MEDIA_S3_BUCKET: "bucketsentinel",
  EXPLORERS_MEDIA_S3_REGION: "ap-south-1",
  EXPLORERS_BACKUP_AGE_RECIPIENT: `age1${"q".repeat(58)}`,
};
// Optional: Games search uses IGDB only when both are set.
const IGDB = { IGDB_CLIENT_ID: "igdbclientsentinel", IGDB_CLIENT_SECRET: "igdbsecretsentinel0123" };
const SECRET_VALUES = [
  INPUTS.EXPLORERS_AUTH_SECRET, INPUTS.MUSIC_GATE_ATTESTATION_KEY, INPUTS.GOOGLE_CLIENT_SECRET,
  INPUTS.GOOGLE_BOOKS_API_KEY, INPUTS.TMDB_ACCESS_TOKEN, INPUTS.EXPLORERS_S3_ACCESS_KEY_ID,
  INPUTS.EXPLORERS_S3_SECRET_ACCESS_KEY,
];

const temporary: string[] = [];
const scratch = () => {
  const directory = mkdtempSync(join(tmpdir(), "explorers-env-"));
  temporary.push(directory);
  return directory;
};
afterEach(() => { while (temporary.length) rmSync(temporary.pop()!, { recursive: true, force: true }); });

function render(env: Record<string, string>, out = join(scratch(), "production.env")) {
  const result = spawnSync("bash", [renderer, out], { env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
  return { ...result, out, output: `${result.stdout}${result.stderr}` };
}
function validate(content: string) {
  const file = join(scratch(), "production.env");
  writeFileSync(file, content, { mode: 0o600 });
  const result = spawnSync("bash", [validator, file, SERVER_NAME], { encoding: "utf8" });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}
const validFile = () => {
  const rendered = render(INPUTS);
  expect(rendered.status, rendered.output).toBe(0);
  return readFileSync(rendered.out, "utf8");
};
const setValue = (content: string, name: string, value: string) =>
  content.replace(new RegExp(`^${name}=.*$`, "m"), `${name}=${value}`);
/** A bash function's full text, from its `name() {` line to the closing brace at column 0 or 2. */
function shellFunction(source: string, name: string, indent = "") {
  const start = source.indexOf(`${indent}${name}() {`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(`\n${indent}}\n`, start);
  return source.slice(start, end + indent.length + 3);
}

describe("explorers.yml renders production.env from the explorers-production environment", () => {
  const renderIndex = deploySteps.findIndex((step) => /deploy\/render-production-env\.sh/.test(step.run ?? ""));
  const renderStep = deploySteps[renderIndex];

  it("renders and validates before any SSH connection, inside the explorers-production environment", () => {
    expect(deployJob.environment).toBe("explorers-production");
    expect(renderIndex).toBeGreaterThan(deploySteps.findIndex((step) => /actions\/checkout/.test(step.uses ?? "")));
    const firstSsh = deploySteps.findIndex((step) => /\b(ssh|scp) /.test(step.run ?? ""));
    expect(firstSsh).toBeGreaterThan(renderIndex);
    expect(renderStep.run).toContain('bash deploy/render-production-env.sh "$RUNNER_TEMP/stage/production.env"');
    expect(renderStep.run).toContain("umask 077");
    // The upload sends everything staged, which is where the file lands.
    const upload = deploySteps.find((step) => step.name === "Upload the release")!;
    expect(upload.run).toContain('scp -q "$RUNNER_TEMP"/stage/* ');
  });

  it("takes every value from a step environment variable of the same GitHub name", () => {
    const secrets = ["EXPLORERS_AUTH_SECRET", "MUSIC_GATE_ATTESTATION_KEY", "GOOGLE_CLIENT_SECRET", "GOOGLE_BOOKS_API_KEY",
      "TMDB_ACCESS_TOKEN", "EXPLORERS_S3_ACCESS_KEY_ID", "EXPLORERS_S3_SECRET_ACCESS_KEY", "IGDB_CLIENT_SECRET"];
    const variables = ["GOOGLE_CLIENT_ID", "EXPLORERS_MEDIA_S3_BUCKET", "EXPLORERS_MEDIA_S3_REGION",
      "EXPLORERS_BACKUP_AGE_RECIPIENT", "EXPLORERS_TRUSTED_PROXY_IP", "IGDB_CLIENT_ID"];
    const expected = Object.fromEntries([
      ...secrets.map((name) => [name, `\${{ secrets.${name} }}`]),
      ...variables.map((name) => [name, `\${{ vars.${name} }}`]),
    ]);
    expect(renderStep.env).toEqual(expected);
    // The origin is derived from the existing server-name variable.
    expect(deployJob.env.EXPLORERS_SERVER_NAME).toBe("${{ vars.EXPLORERS_SERVER_NAME }}");
    // Secrets live only in the step that needs them, never in the job's env.
    expect(JSON.stringify(deployJob.env)).not.toMatch(/secrets\./);
  });

  it("never picks up the repository's SES AWS_* secrets", () => {
    expect(raw).not.toMatch(/secrets\.AWS_/);
    expect(read("deploy/render-production-env.sh")).not.toMatch(/\$\{?AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)\b/);
  });

  it("never prints, traces or interpolates a value into the script", () => {
    const run = renderStep.run ?? "";
    expect(run).not.toMatch(/\$\{\{/);
    expect(run).not.toMatch(/set\s+-[a-z]*x|set\s+-o\s+xtrace|bash\s+-x/);
    for (const name of Object.keys(renderStep.env ?? {})) {
      expect(run, name).not.toMatch(new RegExp(`(echo|printf|cat)[^\\n]*\\$\\{?${name}\\b`));
    }
    for (const step of deploySteps) expect(step.run ?? "", step.name).not.toMatch(/set\s+-[a-z]*x\b|set\s+-o\s+xtrace/);
    const script = read("deploy/render-production-env.sh");
    expect(script).not.toMatch(/^\s*set\s+-[a-z]*x|xtrace/m);
    expect(script).toContain("set +x");
    expect(script).not.toMatch(/\becho\b[^\n]*\$\{!/);
  });

  it("removes the rendered file from the runner whatever happens", () => {
    const cleanup = deploySteps.at(-1)!;
    expect(cleanup.run).toContain('rm -f "$RUNNER_TEMP/stage/production.env"');
    expect((cleanup as { if?: string }).if).toBe("always()");
  });
});

describe("deploy/render-production-env.sh", () => {
  it("renders every name 0600, maps the S3 keys, and prints no value", () => {
    // A decoy in the runner environment: the renderer must never read the SES keys.
    const result = render({ ...INPUTS, AWS_ACCESS_KEY_ID: "SESDECOYKEY", AWS_SECRET_ACCESS_KEY: "SESDECOYSECRET" });
    expect(result.status, result.output).toBe(0);
    for (const value of [...SECRET_VALUES, "SESDECOYKEY", "SESDECOYSECRET"]) expect(result.output).not.toContain(value);
    expect(statSync(result.out).mode & 0o777).toBe(0o600);
    const file = readFileSync(result.out, "utf8");
    expect(file).not.toContain("SESDECOY");
    const values = new Map(file.split("\n").filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)] as const;
    }));
    expect(Object.fromEntries(values)).toEqual({
      EXPLORERS_API_IMAGE_NAME: "ghcr.io/example-owner/explorers-tunes",
      EXPLORERS_API_DIGEST: `sha256:${"0".repeat(64)}`,
      EXPLORERS_API_COMMIT: "0".repeat(40),
      DB_NAME: "explorers",
      DB_MIGRATOR_USER: "explorers_migrator",
      DB_RUNTIME_USER: "explorers_runtime",
      DB_MIGRATOR_PASSWORD_FILE_HOST: "/opt/explorers/secrets/db-migrator",
      DB_RUNTIME_PASSWORD_FILE_HOST: "/opt/explorers/secrets/db-runtime",
      EXPLORERS_PUBLIC_ORIGIN: `https://${SERVER_NAME}`,
      EXPLORERS_TRUSTED_PROXY_IP: "172.18.0.1",
      MUSIC_GATE_ATTESTATION_KEY: INPUTS.MUSIC_GATE_ATTESTATION_KEY,
      EXPLORERS_AUTH_SECRET: INPUTS.EXPLORERS_AUTH_SECRET,
      GOOGLE_CLIENT_ID: INPUTS.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: INPUTS.GOOGLE_CLIENT_SECRET,
      EXPLORERS_MEDIA_S3_BUCKET: INPUTS.EXPLORERS_MEDIA_S3_BUCKET,
      EXPLORERS_MEDIA_S3_REGION: INPUTS.EXPLORERS_MEDIA_S3_REGION,
      AWS_ACCESS_KEY_ID: INPUTS.EXPLORERS_S3_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: INPUTS.EXPLORERS_S3_SECRET_ACCESS_KEY,
      GOOGLE_BOOKS_API_KEY: INPUTS.GOOGLE_BOOKS_API_KEY,
      TMDB_ACCESS_TOKEN: INPUTS.TMDB_ACCESS_TOKEN,
      EXPLORERS_BACKUP_AGE_RECIPIENT: INPUTS.EXPLORERS_BACKUP_AGE_RECIPIENT,
      IGDB_CLIENT_ID: "",
      IGDB_CLIENT_SECRET: "",
    });
  });

  it("treats IGDB as optional: blank when unset, both values when set, never one without the other", () => {
    const unset = render(INPUTS);
    expect(unset.status, unset.output).toBe(0);
    expect(unset.output).toContain("::notice::IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are not set; Games search stays manual-only.");
    const set = render({ ...INPUTS, ...IGDB });
    expect(set.status, set.output).toBe(0);
    expect(set.output).not.toContain(IGDB.IGDB_CLIENT_SECRET);
    const file = readFileSync(set.out, "utf8");
    expect(file).toMatch(new RegExp(`^IGDB_CLIENT_ID=${IGDB.IGDB_CLIENT_ID}$`, "m"));
    expect(file).toMatch(new RegExp(`^IGDB_CLIENT_SECRET=${IGDB.IGDB_CLIENT_SECRET}$`, "m"));
    for (const [name, kind] of [["IGDB_CLIENT_ID", "variable"], ["IGDB_CLIENT_SECRET", "secret"]]) {
      const { [name]: _omitted, ...half } = { ...INPUTS, ...IGDB };
      const result = render(half);
      expect(result.status, name).toBe(1);
      expect(result.output).toContain(`::error::Environment ${kind} ${name} is not set in explorers-production; IGDB needs both IGDB_CLIENT_ID and IGDB_CLIENT_SECRET, or neither.`);
      expect(result.output).not.toContain(IGDB.IGDB_CLIENT_SECRET);
      expect(existsSync(result.out)).toBe(false);
    }
  });

  it("keeps the image placeholders and fixed database names identical to production.env.example", () => {
    const example = read("deploy/production.env.example");
    const file = validFile();
    for (const name of ["EXPLORERS_API_IMAGE_NAME", "EXPLORERS_API_DIGEST", "EXPLORERS_API_COMMIT", "DB_NAME", "DB_MIGRATOR_USER",
      "DB_RUNTIME_USER", "DB_MIGRATOR_PASSWORD_FILE_HOST", "DB_RUNTIME_PASSWORD_FILE_HOST", "EXPLORERS_TRUSTED_PROXY_IP"]) {
      const line = new RegExp(`^${name}=.*$`, "m");
      expect(file.match(line)?.[0], name).toBe(example.match(line)?.[0]);
    }
  });

  it("uses EXPLORERS_TRUSTED_PROXY_IP when it is set, and notices the default when it is not", () => {
    const set = render({ ...INPUTS, EXPLORERS_TRUSTED_PROXY_IP: "172.20.0.1" });
    expect(set.status, set.output).toBe(0);
    expect(readFileSync(set.out, "utf8")).toMatch(/^EXPLORERS_TRUSTED_PROXY_IP=172\.20\.0\.1$/m);
    expect(set.output).not.toContain("is not set");
    const unset = render(INPUTS);
    expect(unset.output).toContain("::notice::Environment variable EXPLORERS_TRUSTED_PROXY_IP is not set; using 172.18.0.1");
  });

  it("refuses a missing secret or variable by its GitHub name, before writing anything", () => {
    for (const [name, kind] of [["EXPLORERS_S3_SECRET_ACCESS_KEY", "secret"], ["GOOGLE_CLIENT_ID", "variable"], ["TMDB_ACCESS_TOKEN", "secret"]]) {
      const { [name]: _omitted, ...rest } = INPUTS;
      const result = render(rest);
      expect(result.status, name).toBe(1);
      expect(result.output).toContain(`::error::Environment ${kind} ${name} is not set in explorers-production.`);
      expect(existsSync(result.out)).toBe(false);
      for (const value of SECRET_VALUES) expect(result.output).not.toContain(value);
    }
    const noServer = render({ ...INPUTS, EXPLORERS_SERVER_NAME: "" });
    expect(noServer.status).toBe(1);
    expect(noServer.output).toContain("Repository variable EXPLORERS_SERVER_NAME is not set.");
  });

  it("refuses a value with a line break, which would add lines to the file", () => {
    const result = render({ ...INPUTS, GOOGLE_CLIENT_SECRET: "GOCSPX-line\nEXPLORERS_TRUSTED_PROXY_IP=6.6.6.6" });
    expect(result.status).toBe(1);
    expect(result.output).toContain("::error::GOOGLE_CLIENT_SECRET must be a single line");
    expect(result.output).not.toContain("GOCSPX-line");
    expect(result.output).not.toContain("6.6.6.6");
    expect(existsSync(result.out)).toBe(false);
  });

  it("fails validation by name only and leaves no file behind", () => {
    const result = render({ ...INPUTS, EXPLORERS_AUTH_SECRET: "shortauthsentinel" });
    expect(result.status).toBe(1);
    expect(result.output).toContain("FAIL: production.env: EXPLORERS_AUTH_SECRET must be at least 32 characters");
    expect(result.output).not.toContain("shortauthsentinel");
    expect(existsSync(result.out)).toBe(false);
  });
});

describe("deploy/host/validate-production-env.sh", () => {
  it("accepts a valid file", () => {
    const result = validate(validFile());
    expect(result.status, result.output).toBe(0);
    expect(result.stdout).toContain("production.env: every rule passes");
  });

  it("rejects the example file for every example value", () => {
    const result = validate(read("deploy/production.env.example"));
    expect(result.status).toBe(1);
    for (const name of ["MUSIC_GATE_ATTESTATION_KEY", "EXPLORERS_PUBLIC_ORIGIN", "EXPLORERS_AUTH_SECRET", "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET", "EXPLORERS_MEDIA_S3_BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "GOOGLE_BOOKS_API_KEY", "TMDB_ACCESS_TOKEN"]) {
      expect(result.stderr, name).toContain(`FAIL: production.env: ${name} still holds the example value`);
    }
    expect(result.stderr).toContain("FAIL: production.env: EXPLORERS_BACKUP_AGE_RECIPIENT must be the age PUBLIC key");
  });

  it("checks a set IGDB pair like any other value, and only the characters Twitch issues", () => {
    let file = setValue(setValue(validFile(), "IGDB_CLIENT_ID", IGDB.IGDB_CLIENT_ID), "IGDB_CLIENT_SECRET", IGDB.IGDB_CLIENT_SECRET);
    expect(validate(file).status).toBe(0);
    file = setValue(file, "IGDB_CLIENT_SECRET", "igdb.secret$sentinel");
    const result = validate(file);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("FAIL: production.env: IGDB_CLIENT_SECRET must be letters, digits, _ or -");
    expect(result.output).not.toContain("igdb.secret$sentinel");
  });

  // [name, bad value, expected message after "FAIL: production.env: "]
  const cases: Array<[string, string, string]> = [
    ["GOOGLE_BOOKS_API_KEY", "", "GOOGLE_BOOKS_API_KEY is empty or missing"],
    ["GOOGLE_CLIENT_SECRET", "sentinel-example-secret", "GOOGLE_CLIENT_SECRET still holds the example value"],
    ["EXPLORERS_MEDIA_S3_BUCKET", "0000", "EXPLORERS_MEDIA_S3_BUCKET still holds the example value"],
    ["TMDB_ACCESS_TOKEN", "tmdb$sentinel", "TMDB_ACCESS_TOKEN must be one plain value"],
    ["AWS_SECRET_ACCESS_KEY", "aws sentinel", "AWS_SECRET_ACCESS_KEY must be one plain value"],
    ["IGDB_CLIENT_ID", "igdbclientsentinel", "IGDB_CLIENT_ID and IGDB_CLIENT_SECRET must be set together"],
    ["IGDB_CLIENT_SECRET", "igdb.secret", "IGDB_CLIENT_ID and IGDB_CLIENT_SECRET must be set together"],
    ["GOOGLE_CLIENT_SECRET", "\"quotedsentinel\"", "GOOGLE_CLIENT_SECRET must be one plain value"],
    ["EXPLORERS_PUBLIC_ORIGIN", "https://other.sentinel", `EXPLORERS_PUBLIC_ORIGIN must be exactly https://${SERVER_NAME}`],
    ["EXPLORERS_PUBLIC_ORIGIN", `https://${SERVER_NAME}/`, `EXPLORERS_PUBLIC_ORIGIN must be exactly https://${SERVER_NAME}`],
    ["EXPLORERS_AUTH_SECRET", "authshortsentinel", "EXPLORERS_AUTH_SECRET must be at least 32 characters"],
    ["MUSIC_GATE_ATTESTATION_KEY", "gateshortsentinel", "MUSIC_GATE_ATTESTATION_KEY must be at least 32 characters"],
    ["DB_RUNTIME_USER", "explorers_migrator", "DB_MIGRATOR_USER and DB_RUNTIME_USER must differ"],
    ["DB_RUNTIME_USER", "Runtime-Sentinel", "DB_RUNTIME_USER is not a plain lowercase identifier"],
    ["DB_MIGRATOR_USER", "postgres", "DB_MIGRATOR_USER may not be postgres or music_runtime"],
    ["DB_RUNTIME_USER", "music_runtime", "DB_RUNTIME_USER may not be postgres or music_runtime"],
    ["DB_RUNTIME_PASSWORD_FILE_HOST", "relative/sentinel", "DB_RUNTIME_PASSWORD_FILE_HOST must be an absolute host path"],
    ["EXPLORERS_BACKUP_AGE_RECIPIENT", "AGE-SECRET-KEY-1SENTINEL", "EXPLORERS_BACKUP_AGE_RECIPIENT must be the age PUBLIC key"],
    ["EXPLORERS_TRUSTED_PROXY_IP", "172.18.0.0/16", "EXPLORERS_TRUSTED_PROXY_IP must be one IPv4 address"],
  ];
  it.each(cases)("rejects %s = %j by name, never by value", (name, value, message) => {
    const result = validate(setValue(validFile(), name, value));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`FAIL: production.env: ${message}`);
    // Words the rule itself names (postgres, music_runtime) are not leaks.
    if (value.length > 4 && !message.includes(value)) expect(result.output).not.toContain(value);
  });

  it("rejects a variable set twice", () => {
    const result = validate(`${validFile()}EXPLORERS_AUTH_SECRET=${"z".repeat(40)}\n`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("FAIL: production.env: EXPLORERS_AUTH_SECRET is set more than once");
    expect(result.output).not.toContain("z".repeat(40));
  });

  it("is the only copy of the rules: the bootstrap calls it and repeats none of them", () => {
    expect(bootstrapScript).toContain("validate-production-env.sh");
    expect(read("deploy/render-production-env.sh")).toContain('validator="$here/host/validate-production-env.sh"');
    for (const rule of ["age1[0-9a-z]{58}", "[Ee][Xx][Aa][Mm][Pp][Ll][Ee]", "must be at least 32 characters", "readonly REQUIRED="]) {
      expect(bootstrapScript, rule).not.toContain(rule);
      expect(read("deploy/host/validate-production-env.sh"), rule).toContain(rule);
    }
    expect(read("deploy/host/validate-production-env.sh")).not.toMatch(/^\s*set\s+-[a-z]*x/m);
  });
});

describe("explorers-deploy.sh installs the uploaded production.env", () => {
  const installFunction = shellFunction(hostScript, "install_staged_env");

  function runInstall(setup: (staging: string, opt: string) => void) {
    const root = scratch();
    const staging = join(root, "staging");
    const opt = join(root, "opt");
    spawnSync("install", ["-d", "-m", "0700", staging]);
    setup(staging, opt);
    // Not root (CI): the same function, minus the chown it cannot do.
    const body = isRoot ? installFunction : installFunction.replaceAll(" -o root -g root", "");
    const script = `set -Eeuo pipefail
fail() { echo "::error::$*" >&2; exit 1; }
staging='${staging}'; OPT='${opt}'; ENV_FILE="$OPT/production.env"
${body}
install_staged_env`;
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
    return { ...result, staging, opt, env: join(opt, "production.env"), output: `${result.stdout}${result.stderr}` };
  }

  it("runs first in backup and in stage, before preflight reads the file", () => {
    for (const phase of ["backup", "stage"]) {
      const body = hostScript.slice(hostScript.indexOf(`${phase}() {`));
      expect(body.split("\n").slice(1, 3).map((line) => line.trim()), phase).toEqual(["install_staged_env", "preflight"]);
    }
    // The installed file must still pass the existing root-owned 0600 check.
    expect(hostScript).toContain(`[[ "$(stat -c '%u %a' "$ENV_FILE")" == "0 600" ]] || fail "$ENV_FILE must be root-owned mode 0600"`);
    expect(installFunction).toContain('install -m 0600 -o root -g root "$staged" "$ENV_FILE.next"');
    expect(installFunction).toContain('mv -f "$ENV_FILE.next" "$ENV_FILE"');
  });

  it("installs 0600 (root-owned under sudo), keeps the previous file 0600, and shreds the staged copy", () => {
    const result = runInstall((staging, opt) => {
      spawnSync("install", ["-d", "-m", "0700", opt]);
      writeFileSync(join(opt, "production.env"), "OLD=previous-sentinel\n", { mode: 0o600 });
      writeFileSync(join(staging, "production.env"), "NEW=current-sentinel\n", { mode: 0o600 });
    });
    expect(result.status, result.output).toBe(0);
    expect(readFileSync(result.env, "utf8")).toBe("NEW=current-sentinel\n");
    expect(readFileSync(`${result.env}.previous`, "utf8")).toBe("OLD=previous-sentinel\n");
    for (const file of [result.env, `${result.env}.previous`]) {
      const stat = statSync(file);
      expect(stat.mode & 0o777, file).toBe(0o600);
      if (isRoot) expect(stat.uid, file).toBe(0);
    }
    expect(statSync(result.opt).mode & 0o777).toBe(0o700);
    expect(existsSync(join(result.staging, "production.env"))).toBe(false);
    expect(existsSync(`${result.env}.next`)).toBe(false);
    expect(result.output).not.toMatch(/sentinel/);
    expect(result.stdout).toContain("installed production.env from the explorers-production environment");
  });

  it("installs on a first deploy, where there is no previous file", () => {
    const result = runInstall((staging) => writeFileSync(join(staging, "production.env"), "NEW=1\n", { mode: 0o600 }));
    expect(result.status, result.output).toBe(0);
    expect(readFileSync(result.env, "utf8")).toBe("NEW=1\n");
    expect(existsSync(`${result.env}.previous`)).toBe(false);
  });

  it("leaves a hand-made production.env alone when nothing was uploaded", () => {
    const result = runInstall((_staging, opt) => {
      spawnSync("install", ["-d", "-m", "0700", opt]);
      writeFileSync(join(opt, "production.env"), "HAND=made\n", { mode: 0o600 });
    });
    expect(result.status, result.output).toBe(0);
    expect(readFileSync(result.env, "utf8")).toBe("HAND=made\n");
    expect(existsSync(`${result.env}.previous`)).toBe(false);
    expect(result.output).toBe("");
  });

  it("refuses a staged symlink and changes nothing", () => {
    const result = runInstall((staging, opt) => {
      spawnSync("install", ["-d", "-m", "0700", opt]);
      writeFileSync(join(opt, "production.env"), "OLD=kept\n", { mode: 0o600 });
      writeFileSync(join(staging, "elsewhere"), "SECRET=elsewhere-sentinel\n", { mode: 0o600 });
      symlinkSync(join(staging, "elsewhere"), join(staging, "production.env"));
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("the staged production.env is not a regular file; refusing it");
    expect(readFileSync(result.env, "utf8")).toBe("OLD=kept\n");
    expect(existsSync(`${result.env}.previous`)).toBe(false);
    expect(lstatSync(join(result.staging, "production.env")).isSymbolicLink()).toBe(true);
    expect(result.output).not.toContain("elsewhere-sentinel");
  });

  it("tells the owner to set the GitHub variable, not to edit the host file", () => {
    expect(hostScript).toContain("Set the explorers-production environment variable EXPLORERS_TRUSTED_PROXY_IP to $gateway and redeploy");
    expect(hostScript).not.toMatch(/Set it to \$gateway in \$ENV_FILE/);
  });
});

describe("explorers-bootstrap.sh check", () => {
  function runCheckEnv(envFile: string) {
    const script = `set -Eeuo pipefail
problems=0
problem() { echo "FAIL: $*" >&2; problems=$((problems + 1)); }
ok() { echo "ok:   $*"; }
note() { echo "note: $*"; }
check_secret_file() { :; }
SECRETS=/opt/explorers/secrets
ENV_FILE='${envFile}'
VALIDATOR='${validator}'
server_name='${SERVER_NAME}'
${shellFunction(bootstrapScript, "env_value").split("\n")[0]}
${shellFunction(bootstrapScript, "check_env")}
check_env
echo "problems=$problems"`;
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
    return { ...result, output: `${result.stdout}${result.stderr}` };
  }

  it("accepts a missing production.env before the first deploy", () => {
    const result = runCheckEnv(join(scratch(), "production.env"));
    expect(result.status, result.output).toBe(0);
    expect(result.stdout).toContain("does not exist yet: the first deploy writes it from the explorers-production GitHub environment");
    expect(result.stdout).toContain("problems=0");
  });

  it("validates a present file with the shared validator, by name only", () => {
    const file = join(scratch(), "production.env");
    writeFileSync(file, setValue(validFile(), "EXPLORERS_AUTH_SECRET", "bootstrapshortsentinel"), { mode: 0o600 });
    const result = runCheckEnv(file);
    expect(result.stderr).toContain("FAIL: production.env: EXPLORERS_AUTH_SECRET must be at least 32 characters");
    expect(result.stderr).toContain("fails validate-production-env.sh");
    expect(result.output).not.toContain("bootstrapshortsentinel");
    expect(result.stdout).not.toContain("problems=0");
  });

  it("accepts a valid, root-owned 0600 file", () => {
    if (!isRoot) return; // the ownership rule needs root to be satisfiable
    const file = join(scratch(), "production.env");
    writeFileSync(file, validFile(), { mode: 0o600 });
    chmodSync(file, 0o600);
    const result = runCheckEnv(file);
    expect(result.stdout, result.output).toContain("problems=0");
    expect(result.stdout).toContain("is complete");
  });

  it("refuses a symlinked production.env", () => {
    const directory = scratch();
    writeFileSync(join(directory, "real"), validFile(), { mode: 0o600 });
    symlinkSync(join(directory, "real"), join(directory, "production.env"));
    const result = runCheckEnv(join(directory, "production.env"));
    expect(result.stderr).toContain("is a symlink; it must be a regular file");
  });

  it("no longer installs the example or tells anyone to fill it in", () => {
    expect(bootstrapScript).toContain('usage: explorers-bootstrap.sh init|check <server-name>');
    expect(bootstrapScript).not.toMatch(/install[^\n]*"\$3"/);
    expect(bootstrapScript).not.toMatch(/Fill in every value/);
    // init still makes the directories and the two password files, which never leave the host.
    expect(bootstrapScript).toMatch(/for name in db-migrator db-runtime; do[\s\S]*openssl rand 48 \| basenc --base64url -w0/);
  });
});

describe("the cutover rehearsal exercises the same path", () => {
  const rehearsal = read("deploy/rehearsal/rehearse.sh");
  it("renders with the workflow's script and never writes production.env on the stand-in", () => {
    expect(rehearsal).toContain('bash "$repo/deploy/render-production-env.sh" "$1/production.env"');
    expect(rehearsal).not.toMatch(/sed -i[^\n]*production\.env/);
    expect(rehearsal).not.toContain("fill production.env");
    expect(read("deploy/rehearsal/standin-host/make-age-identity.sh")).not.toContain("/opt/explorers/production.env");
    expect(rehearsal).toContain("production.env came from the upload: root 0600, previous kept, staged copy gone");
  });
});
