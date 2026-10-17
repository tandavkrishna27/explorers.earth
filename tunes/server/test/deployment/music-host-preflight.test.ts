import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml") as { load(source: string): any };

describe("Tunes host preflight authority", () => {
  it("reports app and database metadata without reading container secrets", () => {
    const workflow = parseYaml(read(".github/workflows/tunes-host-preflight.yml"));
    const script = workflow.jobs.preflight.steps.find((s: any) => s.with?.script).with.script;
    const section = (script.split("# Migration inventory\n")[1] ?? "").split("# End migration inventory")[0];
    const result = spawnSync(process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash", ["-c", `
      set -euo pipefail
      expected_format='name={{.Name}} project={{index .Config.Labels "com.docker.compose.project"}} service={{index .Config.Labels "com.docker.compose.service"}} image={{.Image}} mounts={{range .Mounts}}type={{.Type}} volume={{.Name}} destination={{.Destination}};{{end}} networks={{range $name, $_ := .NetworkSettings.Networks}}{{$name}};{{end}}'
      docker() {
        if [[ "$1" == inspect && "$2" == --format && "$3" == "$expected_format" && "$#" == 4 ]]; then
          case "$4" in
            app-id) printf '%s\\n' 'name=/tunes-app-1 project=tunes service=app image=sha256:abc networks=tunes_cosmic-network;' ;;
            db-id) printf '%s\\n' 'name=/tunes-db-1 project=tunes service=db image=sha256:def volume=tunes_postgres-data networks=tunes_cosmic-network;' ;;
            *) return 92 ;;
          esac
          return
        fi
        case "$*" in
          'ps --filter label=com.docker.compose.project=tunes --format {{.ID}}') printf '%s\\n' app-id db-id ;;
          'inspect --format {{.Image}} app-id') printf '%s\\n' sha256:abc ;;
          'inspect --format {{.Image}} db-id') printf '%s\\n' sha256:def ;;
          'image inspect --format platform={{.Os}}/{{.Architecture}} sha256:abc'|'image inspect --format platform={{.Os}}/{{.Architecture}} sha256:def') printf '%s\\n' 'platform=linux/arm64' ;;
          *) printf 'unexpected command\\n' >&2; return 91 ;;
        esac
      }
      node() { [[ "$#" == 1 && "$1" == --version ]] || return 93; printf 'v22.12.0\\n'; }
      ss() { [[ "$#" == 1 && "$1" == -lntp ]] || return 94; printf 'LISTEN 0 128 0.0.0.0:5001 0.0.0.0:* users:(("node",pid=123,fd=4))\\n'; }
      ${section}
    `], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("service=app");
    expect(result.stdout).toContain("service=db");
    expect(result.stdout).toContain("platform=linux/arm64");
    expect(result.stdout).toContain("volume=tunes_postgres-data");
    expect(result.stdout.match(/networks=tunes_cosmic-network;/g)).toHaveLength(2);
    expect(result.stdout).toContain("v22.12.0");
    expect(result.stdout).toContain("LISTEN 0 128 0.0.0.0:5001");
    expect(result.stdout).toContain('users:(("node",pid=123,fd=4))');
    expect(section).not.toMatch(/\.Config\.Env|docker compose config|cat .*\.env/);
  });

  it("requires read-only database and backup evidence without dumping rows", () => {
    const script = parseYaml(read(".github/workflows/tunes-host-preflight.yml")).jobs.preflight.steps.find((s: any) => s.with?.script).with.script;
    expect(script).toContain("pg_isready");
    expect(script).toContain("pg_database_size");
    expect(script).toContain("deployment-backups");
    expect(script).toContain("find \"$compose_dir/deployment-backups\" -maxdepth 2 -type f");
    expect(script).not.toMatch(/pg_dump|pg_dumpall|SELECT\s+\*|\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i);
  });
  it("is manual, uses the proven SSH connection, and cannot deploy", () => {
    const source = read(".github/workflows/tunes-host-preflight.yml");
    const workflow = parseYaml(source);
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.jobs.preflight.if).toContain("github.ref == 'refs/heads/main'");
    expect(workflow.jobs.preflight.environment).toBe("tunes-production");
    expect(workflow.on.workflow_dispatch.inputs.confirm_read_only).toMatchObject({
      required: true,
      type: "boolean",
    });
    expect(source).toContain("secrets.TUNES_DEPLOY_HOST");
    expect(source).toContain("secrets.TUNES_DEPLOY_KEY");
    expect(source).toContain("fingerprint: ${{ secrets.TUNES_DEPLOY_SSH_FINGERPRINT }}");
    expect(source).toContain("username: deploy");
    expect(source).toContain("appleboy/ssh-action@7eaf76671a0d7eec5d98ee897acda4f968735a17");
    expect(source).not.toContain("GATE_PROD");
  });

  it("limits the remote script to sanitized read-only observations", () => {
    const workflow = parseYaml(read(".github/workflows/tunes-host-preflight.yml"));
    const remote = workflow.jobs.preflight.steps.find((step: any) => step.name === "Inspect Tunes host without mutation");
    expect(remote.with).not.toHaveProperty("script_stop");
    const script = String(remote.with.script);
    for (const evidence of ["id", "docker version", "docker compose version", "docker ps", "docker compose ls", "df -P", "stat -c"]) {
      expect(script).toContain(evidence);
    }
    for (const mutation of [
      /docker\s+compose\s+(?:up|down|restart|rm|pull|build)/,
      /docker\s+(?:stop|restart|rm|rmi|prune)/,
      /\b(?:sudo|rm|mv|cp|install|mkdir|chmod|chown|truncate|tee)\b/,
      /\b(?:DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE)\b/i,
      /(^|[^<])>(?!>)/m,
    ]) {
      expect(script).not.toMatch(mutation);
    }
  });
});
