import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectApiMode } from "../../apiMode";
import { EXPECTED_MUSIC_MIGRATION_ID } from "../../../shared/music-migration-contract";

// `yaml` is not a declared dependency; js-yaml resolves transitively. This is the
// form music-deployment-files.test.ts already uses.
const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml") as { load(source: string): any };

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const raw = readFileSync(resolve(repositoryRoot, "deploy/production.compose.yml"), "utf8");
const compose = parseYaml(raw);

describe("production canonical compose", () => {
  it("starts the canonical API, never the Music composition", () => {
    expect(selectApiMode(compose.services.api.environment)).toBe("canonical");
  });

  it("runs migrations before the API accepts traffic", () => {
    // Break caught: migrate is present but nothing depends on it, so the API
    // starts first, fails readiness and crash-loops while the deploy reports
    // success.
    expect(compose.services.migrate.restart).toBe("no");
    expect(compose.services.migrate.command).toEqual(["node", "dist/server/deployment/run-migration-gate.js"]);
    expect(compose.services.migrate.depends_on.postgres.condition).toBe("service_healthy");
    expect(compose.services.api.depends_on.migrate.condition).toBe("service_completed_successfully");
  });

  it("gives the migration gate every variable it reads before touching the database", () => {
    // Break caught: the gate throws on MUSIC_GATE_ATTESTATION_PATH before
    // PostgreSQL is dialled, so the failure looks nothing like a migration problem.
    for (const required of ["MUSIC_IMAGE_DIGEST", "MUSIC_IMAGE_COMMIT", "MUSIC_MIGRATION_MARKER",
      "MUSIC_GATE_ATTESTATION_PATH", "MUSIC_GATE_ATTESTATION_KEY",
      "MUSIC_DATABASE_HOST", "MUSIC_DATABASE_NAME", "MUSIC_DATABASE_USER", "MUSIC_DATABASE_PASSWORD_FILE",
      "MUSIC_RUNTIME_DATABASE_USER", "MUSIC_RUNTIME_DATABASE_PASSWORD_FILE", "MUSIC_MODE"]) {
      expect(Object.keys(compose.services.migrate.environment)).toContain(required);
    }
    // Break caught: a new migration lands and the marker is not bumped, so the gate
    // throws on its first statement and every deploy fails.
    expect(compose.services.migrate.environment.MUSIC_MIGRATION_MARKER).toBe(EXPECTED_MUSIC_MIGRATION_ID);
    expect(compose.services.api.environment.MUSIC_MIGRATION_MARKER).toBe(EXPECTED_MUSIC_MIGRATION_ID);
    expect(compose.services.migrate.environment.DATABASE_URL).toBeUndefined();
  });

  it("gives the gate the migrator identity and the API the runtime identity", () => {
    // Break caught: one shared YAML anchor. assertMusicMigratorAuthority then
    // fails against the runtime login with an error that reads like a password
    // problem.
    const migrate = compose.services.migrate.environment;
    const api = compose.services.api.environment;
    expect(migrate.MUSIC_DATABASE_USER).toBe(api.MUSIC_DATABASE_MIGRATOR_USER);
    expect(migrate.MUSIC_DATABASE_USER).not.toBe(api.MUSIC_DATABASE_USER);
    expect(migrate.MUSIC_RUNTIME_DATABASE_USER).toBe(api.MUSIC_DATABASE_USER);
    expect(migrate.MUSIC_RUNTIME_DATABASE_PASSWORD_FILE).toBe(api.MUSIC_DATABASE_PASSWORD_FILE);
    expect(migrate.MUSIC_DATABASE_PASSWORD_FILE).not.toBe(api.MUSIC_DATABASE_PASSWORD_FILE);
  });

  it("declares every variable the canonical API crashes without", () => {
    for (const required of ["EXPLORERS_PUBLIC_ORIGIN", "EXPLORERS_AUTH_SECRET",
      "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "EXPLORERS_MEDIA_ENVIRONMENT",
      "EXPLORERS_DEPLOYMENT_TIER", "EXPLORERS_MEDIA_S3_BUCKET", "EXPLORERS_MEDIA_S3_REGION",
      "MUSIC_DATABASE_HOST", "MUSIC_DATABASE_NAME", "MUSIC_DATABASE_USER",
      "MUSIC_DATABASE_MIGRATOR_USER", "MUSIC_DATABASE_PASSWORD_FILE", "MUSIC_MODE"]) {
      expect(Object.keys(compose.services.api.environment)).toContain(required);
    }
    expect(compose.services.api.environment.DATABASE_URL).toBeUndefined();
  });

  it("configures the trusted proxy, without which P1's trust-proxy change is inert", () => {
    // Break caught: resolveTrustedProxy trusts NOBODY when the variable is unset,
    // so req.ip stays the Docker bridge gateway for every request and
    // express-rate-limit (keyed on req.ip) puts the entire internet in one bucket.
    expect(Object.keys(compose.services.api.environment)).toContain("EXPLORERS_TRUSTED_PROXY_IP");
  });

  it("supplies S3 credentials, which the release contract omits", () => {
    // Break caught: resolveObjectStorage validates only bucket and region shape and
    // then builds an S3Client with the SDK's default credential chain. On a host
    // with no instance role that means every media read and write fails at request
    // time, with no boot-time signal at all.
    for (const required of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
      expect(Object.keys(compose.services.api.environment)).toContain(required);
    }
  });

  it("supplies the provider keys the release contract omits", () => {
    // Break caught: runtimeMapping lists neither TMDB nor Google Books, so a file
    // built strictly from it boots fine and then 503s every Books and Movies search.
    for (const required of ["GOOGLE_BOOKS_API_KEY", "TMDB_ACCESS_TOKEN"]) {
      expect(Object.keys(compose.services.api.environment)).toContain(required);
    }
  });

  it("names no Strapi variable", () => {
    expect(raw).not.toMatch(/STRAPI/i);
  });

  it("gates the API healthcheck on readiness, not liveness", () => {
    // Break caught: /health/live is a blind 200 that never touches PostgreSQL.
    expect(compose.services.api.healthcheck.test.join(" ")).toContain("/health/ready");
  });

  it("runs the API and the gate from one image pinned by digest", () => {
    // Break caught: a tag-addressed image lets the gate and the API run different
    // builds, so the attested migration chain is not the one serving traffic.
    expect(compose.services.api.image).toMatch(/@\$\{[A-Z_]+:\?[^}]+\}$/);
    expect(compose.services.migrate.image).toBe(compose.services.api.image);
  });

  it("bind-mounts secret files instead of using Docker secrets", () => {
    // Break caught: Docker `secrets:` mount at 0444, which secure-music-secret-file
    // rejects, so the gate and the API both die reading their password.
    expect(compose.secrets).toBeUndefined();
    for (const name of ["api", "migrate", "postgres"]) {
      expect(compose.services[name].secrets).toBeUndefined();
    }
  });

  it("publishes the API only on loopback", () => {
    // Break caught: `5000:5000` exposes the API publicly, bypassing nginx and every
    // Origin check that assumes one front door.
    expect(compose.services.api.ports).toEqual(["127.0.0.1:5000:5000"]);
    expect(compose.services.migrate.ports).toBeUndefined();
    expect(compose.services.postgres.ports).toBeUndefined();
  });

  it("bounds its own logs", () => {
    // Break caught: compose's default json-file driver is unbounded, and this is now
    // one host carrying the SPA, the API and PostgreSQL. The first symptom is a full
    // disk, which takes all three down at once.
    for (const name of ["api", "migrate", "postgres"]) {
      expect(compose.services[name].logging?.options?.["max-size"]).toBeDefined();
    }
  });
});
