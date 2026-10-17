import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { productionComposeInputs } from "../fixtures/music-production-environment";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const fixtureSecret = Buffer.alloc(32, 0x71).toString("base64url");
const sandbox = mkdtempSync(resolve(tmpdir(), "music-production-compose-"));
const emptyEnvironmentPath = resolve(sandbox, "empty.env");
writeFileSync(emptyEnvironmentPath, "");
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

interface ComposeService {
  environment?: Record<string, string>;
  volumes?: Array<{ source: string; target: string; read_only?: boolean }>;
}

function productionModel(): { services: Record<string, ComposeService> } {
  return JSON.parse(execFileSync("docker", [
    "compose", "--env-file", emptyEnvironmentPath, "--profile", "deployment", "-f", "docker-compose.yml", "config", "--format", "json",
  ], {
    cwd: repositoryRoot,
    env: productionComposeInputs(process.env),
    encoding: "utf8",
    timeout: 10_000,
  })) as { services: Record<string, ComposeService> };
}

describe("production Compose credential contracts", () => {
  it("renders production key paths and bounded settings without key material", () => {
    const model = productionModel();
    const runtime = model.services["tunes-blue"];
    expect(runtime.environment).toMatchObject({
      MUSIC_TOKEN_CURRENT_KID: "production-current",
      MUSIC_TOKEN_CURRENT_SECRET_FILE: "/run/secrets/music-token/current",
      MUSIC_TOKEN_PREVIOUS_SECRET_FILE: "",
      MUSIC_TOKEN_LIFETIME_SECONDS: "600",
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "production-publication-current",
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: "/run/secrets/music-publication-response/current",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KEY_FILE: "",
      MUSIC_PUBLIC_ID_HMAC_KEY_FILE: "/run/secrets/music-publication-response/public-id",
    });
    expect(runtime.volumes).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "/opt/explorers/music-token-secrets", target: "/run/secrets/music-token", read_only: true }),
      expect.objectContaining({ source: "/opt/explorers/music-publication-response", target: "/run/secrets/music-publication-response", read_only: true }),
    ]));
    const rendered = JSON.stringify(model);
    expect(rendered).not.toContain(fixtureSecret);
    expect(runtime.environment).not.toHaveProperty("MUSIC_TOKEN_CURRENT_SECRET");
    expect(runtime.environment).not.toHaveProperty("MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY");
    expect(runtime.environment).not.toHaveProperty("MUSIC_PUBLIC_ID_HMAC_KEY");
  }, 15_000);

  it("renders separate file-backed migrator/runtime authority without any password value", () => {
    const model = productionModel();
    const runtime = model.services["tunes-blue"];
    const gate = model.services["tunes-gate"];
    const database = model.services.db;
    const runtimeEnvironment = runtime.environment ?? {};
    const gateEnvironment = gate.environment ?? {};

    expect(runtimeEnvironment).not.toHaveProperty("DATABASE_URL");
    expect(runtimeEnvironment).toMatchObject({
      MUSIC_DATABASE_USER: "music_runtime_login",
      MUSIC_DATABASE_PASSWORD_FILE: "/run/secrets/music-db-runtime",
    });
    expect(gateEnvironment).toMatchObject({
      MUSIC_DATABASE_USER: "music_migrator",
      MUSIC_DATABASE_PASSWORD_FILE: "/run/secrets/music-db-migrator",
      MUSIC_RUNTIME_DATABASE_USER: "music_runtime_login",
      MUSIC_RUNTIME_DATABASE_PASSWORD_FILE: "/run/secrets/music-db-runtime",
    });
    expect(database.environment).toMatchObject({
      POSTGRES_USER: "music_migrator",
      POSTGRES_PASSWORD_FILE: "/run/secrets/music-db-migrator",
    });
    expect(database.environment).not.toHaveProperty("POSTGRES_PASSWORD");
    expect(runtime.volumes).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "/opt/explorers/secrets/db-runtime", target: "/run/secrets/music-db-runtime", read_only: true }),
    ]));
    expect(runtime.volumes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ target: "/run/secrets/music-db-migrator" }),
    ]));
    expect(gate.volumes).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: "/run/secrets/music-db-migrator", read_only: true }),
      expect.objectContaining({ target: "/run/secrets/music-db-runtime", read_only: true }),
    ]));
    const rendered = JSON.stringify(model);
    expect(rendered).not.toContain("legacy-owner-password-sentinel");
    expect(rendered).not.toMatch(/postgres(?:ql)?:\/\/[^"@]+:[^"@]+@/);
  }, 15_000);
});
