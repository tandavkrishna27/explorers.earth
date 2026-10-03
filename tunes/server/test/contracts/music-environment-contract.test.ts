import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeMusicFixtureChildEnvironment, parseMusicEnvironment } from "../../config/music-environment.ts";

const validEnvironment = {
  MUSIC_MODE: "fixture",
  MUSIC_FIXTURE_VERSION: "1",
  MUSIC_STRAPI_HOST_PORT: "51337",
  STRAPI_FIXTURE_URL: "http://127.0.0.1:51337",
  DATABASE_URL_TEST: "postgresql://music_migrator@127.0.0.1:55432/music_fixture",
  MUSIC_DATABASE_HOST: "postgres",
  MUSIC_DATABASE_PORT: "5432",
  MUSIC_DATABASE_NAME: "music_fixture",
  MUSIC_DATABASE_USER: "music_runtime_login",
  MUSIC_DATABASE_MIGRATOR_USER: "music_migrator",
  MUSIC_DATABASE_PASSWORD_FILE: "/run/secrets/music-db-runtime",
  MUSIC_TOKEN_SECRET_FILE_HOST: "./.artifacts/music-token-secrets/current-11111111111111111111111111111111",
  MUSIC_DB_MIGRATOR_SECRET_FILE_HOST: "./.artifacts/music-token-secrets/current-22222222222222222222222222222222",
  MUSIC_DB_RUNTIME_SECRET_FILE_HOST: "./.artifacts/music-token-secrets/current-33333333333333333333333333333333",
  SESSION_SECRET: "fixture-session-secret-at-least-32-characters",
  COOKIE_SECRET: "fixture-cookie-secret-at-least-32-characters",
  MUSIC_SIGNING_KEY_CURRENT_ID: "fixture-current",
  MUSIC_SIGNING_KEY_CURRENT_SECRET: "fixture-current-secret-at-least-32-chars",
  MUSIC_SIGNING_KEY_PREVIOUS_ID: "fixture-previous",
  MUSIC_SIGNING_KEY_PREVIOUS_SECRET: "fixture-previous-secret-at-least-32-chars",
  MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "fixture-publication-v1",
  MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY: "fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI",
  MUSIC_PUBLIC_ID_HMAC_KEY: "VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ",
  MUSIC_CONNECT_TIMEOUT_MS: "5000",
  MUSIC_READ_TIMEOUT_MS: "10000",
  MUSIC_CIRCUIT_FAILURE_THRESHOLD: "3",
  MUSIC_RATE_LIMIT_PER_MINUTE: "60",
  MUSIC_PROVISIONING_KILL_SWITCH: "true",
  MUSIC_PROVISIONING_COHORT: "disabled",
  MUSIC_EXPECTED_MIGRATION_ID: "0037_explorers_movies_provider_context",
  MUSIC_RECONCILIATION_ENABLED: "false",
  MUSIC_RECONCILIATION_MAX_ROWS: "0",
};

describe("server-side Music environment contract", () => {
  it("keeps the tracked fixture example on the canonical migration marker", () => {
    const productionExample = readFileSync(resolve(process.cwd(), "../.env.music.example"), "utf8");
    const fixtureExample = readFileSync(resolve(process.cwd(), "../.env.music.test.example"), "utf8");
    for (const example of [productionExample, fixtureExample]) {
      expect(example).toContain("MUSIC_EXPECTED_MIGRATION_ID=0037_explorers_movies_provider_context");
      expect(example).toContain("MUSIC_COHORT_ENABLED=false");
      expect(example).toContain("MUSIC_COHORT_USER_DOCUMENT_IDS=");
      expect(example).toContain("MUSIC_PUBLIC_ID_HMAC_KEY=VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ");
    }
  });

  it("parses validated numeric controls and recorded safe gates", () => {
    const environment = parseMusicEnvironment(validEnvironment);
    expect(environment).toMatchObject({
      MUSIC_CONNECT_TIMEOUT_MS: 5000,
      MUSIC_READ_TIMEOUT_MS: 10000,
      MUSIC_PROVISIONING_KILL_SWITCH: true,
      MUSIC_PROVISIONING_COHORT: "disabled",
      MUSIC_RECONCILIATION_ENABLED: false,
      MUSIC_RECONCILIATION_MAX_ROWS: 0,
    });
  });

  it("rejects a production-like database whose name merely contains the fixture suffix", () => {
    // Production break caught: substring allowlisting could accept a real host
    // or database such as production_music_fixture.
    expect(() =>
      parseMusicEnvironment({
        ...validEnvironment,
        DATABASE_URL_TEST: "postgresql://owner:secret@production.example.com:5432/production_music_fixture",
      }),
    ).toThrow("DATABASE_URL_TEST must exactly target 127.0.0.1:55432/music_fixture");
  });

  it("rejects a non-loopback Strapi fixture URL", () => {
    // Production break caught: fixture mode can silently call a live Strapi
    // host even though its database remains disposable.
    expect(() => parseMusicEnvironment({ ...validEnvironment, STRAPI_FIXTURE_URL: "https://strapi.example.com" })).toThrow(/loopback Strapi fixture/i);
  });

  it("binds a distinct explicit loopback Strapi port into authenticated fixture authority", () => {
    expect(parseMusicEnvironment({
      ...validEnvironment,
      MUSIC_STRAPI_HOST_PORT: "52359",
      STRAPI_FIXTURE_URL: "http://127.0.0.1:52359",
    })).toMatchObject({ MUSIC_STRAPI_HOST_PORT: 52359, STRAPI_FIXTURE_URL: "http://127.0.0.1:52359" });
    for (const invalid of [
      { MUSIC_STRAPI_HOST_PORT: "52359", STRAPI_FIXTURE_URL: "http://127.0.0.1:51337" },
      { MUSIC_STRAPI_HOST_PORT: "55000", STRAPI_FIXTURE_URL: "http://127.0.0.1:55000" },
      { MUSIC_STRAPI_HOST_PORT: "52359", STRAPI_FIXTURE_URL: "http://127.0.0.2:52359" },
      { MUSIC_STRAPI_HOST_PORT: "", STRAPI_FIXTURE_URL: "http://127.0.0.1:51337" },
    ]) expect(() => parseMusicEnvironment({ ...validEnvironment, ...invalid })).toThrow();
  });

  it("normalizes legacy authenticated fixture authority ahead of ambient child overrides", () => {
    const { MUSIC_STRAPI_HOST_PORT: _legacyMissing, ...legacyEnvironment } = validEnvironment;
    const normalized = normalizeMusicFixtureChildEnvironment(legacyEnvironment);
    expect(normalized).toMatchObject({
      MUSIC_STRAPI_HOST_PORT: "51337",
      STRAPI_FIXTURE_URL: "http://127.0.0.1:51337",
    });
    expect({ MUSIC_STRAPI_HOST_PORT: "52359", ...normalized }.MUSIC_STRAPI_HOST_PORT).toBe("51337");
  });

  it("rejects out-of-range controls and unsafe recorded gates", () => {
    expect(() => parseMusicEnvironment({ ...validEnvironment, MUSIC_CONNECT_TIMEOUT_MS: "0" })).toThrow("MUSIC_CONNECT_TIMEOUT_MS must be between 100 and 60000");
    expect(() => parseMusicEnvironment({ ...validEnvironment, MUSIC_PROVISIONING_KILL_SWITCH: "false" })).toThrow("C0 requires the provisioning kill switch");
    expect(() => parseMusicEnvironment({ ...validEnvironment, MUSIC_RECONCILIATION_MAX_ROWS: "1" })).toThrow("C0 requires reconciliation disabled with zero rows");
  });
});

export { validEnvironment };
