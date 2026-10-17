import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { productionComposeInputs } from "../fixtures/music-production-environment";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const fixtureSecret = Buffer.alloc(32, 0x71).toString("base64url");
const forbiddenCredentialSource = /MUSIC_TOKEN_|SIGNING_KEY|import\.meta\.env(?!\.DEV\b)/;

describe("C5 credential configuration contracts", () => {
  it("keeps ambient semantic variables out of production Compose inputs", () => {
    const hostileValues = [
      "ambient-session-must-not-survive",
      "ambient-key-must-not-survive",
      "ambient-database-must-not-survive",
    ];
    const inputs = productionComposeInputs({
      Path: "bounded-system-path",
      sEsSiOn_SeCrEt: hostileValues[0],
      music_token_current_kid: hostileValues[1],
      Music_Database_User: hostileValues[2],
    });

    expect(inputs.Path).toBe("bounded-system-path");
    expect(inputs).toMatchObject({
      SESSION_SECRET: "production-session-secret-at-least-32-characters",
      MUSIC_TOKEN_CURRENT_KID: "production-current",
      DB_RUNTIME_USER: "music_runtime_login",
    });
    expect(inputs).not.toHaveProperty("sEsSiOn_SeCrEt");
    expect(inputs).not.toHaveProperty("music_token_current_kid");
    expect(inputs).not.toHaveProperty("Music_Database_User");
    const serialized = JSON.stringify(inputs);
    for (const hostile of hostileValues) expect(serialized).not.toContain(hostile);
  });

  it("uses generated fixture files and never checks a token secret into Compose or examples", () => {
    const compose = readFileSync(resolve(repositoryRoot, "docker-compose.music-test.yml"), "utf8");
    const examples = [".env.music.example", ".env.music.test.example"]
      .map((name) => readFileSync(resolve(repositoryRoot, name), "utf8")).join("\n");
    expect(compose).toContain("MUSIC_TOKEN_CURRENT_SECRET_FILE: /run/secrets/music-token/current");
    expect(compose).toContain("${MUSIC_TOKEN_SECRET_FILE_HOST:?MUSIC_TOKEN_SECRET_FILE_HOST is required}:/run/secrets/music-token/current:ro");
    expect(compose).not.toContain("./.artifacts/music-token-secrets:/run/secrets/music-token:ro");
    expect(compose).toContain("POSTGRES_PASSWORD_FILE: /run/secrets/music-db-migrator");
    expect(compose).not.toMatch(/POSTGRES_PASSWORD:\s/);
    expect(compose).not.toMatch(/postgresql:\/\/[^\s:$]+:[^\s@]+@/);
    expect(compose).not.toMatch(/MUSIC_TOKEN_CURRENT_SECRET:\s*[^$]/);
    expect(examples).toContain("MUSIC_TOKEN_CURRENT_SECRET_FILE=/run/secrets/music-token/current");
    expect(examples).toContain("MUSIC_TOKEN_PREVIOUS_SECRET_FILE=/run/secrets/music-token/previous");
    expect(examples).not.toContain(fixtureSecret);
  });

  it("keeps all credential material out of browser source and built-time variable names", () => {
    const credentialSources = [
      "explorers-earth/src/lib/localTunesApiClient.ts",
      "explorers-earth/src/services/accountLifecycleService.ts",
    ].map((path) => readFileSync(resolve(repositoryRoot, path), "utf8"));
    for (const source of credentialSources) {
      expect(source).not.toMatch(forbiddenCredentialSource);
    }
    const productionCompose = readFileSync(resolve(repositoryRoot, "docker-compose.yml"), "utf8");
    expect(productionCompose).not.toMatch(/^\s+(?:build|args):/m);
  });

  it.each([
    "import.meta.env.VITE_SECRET",
    "import.meta.env.DEV_SECRET",
    "import.meta.env['DEV']",
    "const env = import.meta.env",
    "MUSIC_TOKEN_CURRENT_SECRET",
    "SIGNING_KEY",
  ])("rejects credential or unrestricted environment access: %s", (source) => {
    expect(source).toMatch(forbiddenCredentialSource);
  });
});
