export function productionEnvironmentFixture(
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const digest = `sha256:${"a".repeat(64)}`;
  return {
    NODE_ENV: "production", PORT: "5000", MUSIC_MODE: "live",
    MUSIC_DATABASE_HOST: "db", MUSIC_DATABASE_PORT: "5432", MUSIC_DATABASE_NAME: "music",
    MUSIC_DATABASE_USER: "music_runtime_login", MUSIC_DATABASE_MIGRATOR_USER: "music_migrator",
    MUSIC_DATABASE_PASSWORD_FILE: "/run/secrets/music-db-runtime",
    SESSION_SECRET: "production-session-secret-at-least-32-characters",
    COOKIE_SECRET: "production-cookie-secret-at-least-32-characters",
    STRAPI_URL: "https://cms.example.com", MUSIC_STRAPI_ALLOWED_ORIGINS: "https://cms.example.com",
    TRUST_PROXY_HOPS: "1", MUSIC_TRUSTED_PROXY_IP: "172.31.250.2",
    STRAPI_ACCESS_TOKEN: "read-only-token", STRAPI_ANALYTICS_ACCESS_TOKEN: "analytics-read-only-token",
    STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: "/run/secrets/strapi-lifecycle-proof",
    STRAPI_JWT_SECRET: "production-jwt-secret-at-least-32-characters",
    MUSIC_GATE_ATTESTATION_KEY: "production-gate-key-at-least-32-characters",
    MUSIC_DEPLOYMENT_HEALTH_ENABLED: "true", MUSIC_NEW_ENTRY_KILL_SWITCH: "true",
    MUSIC_COHORT_ENABLED: "false", MUSIC_IDENTITY_MAX_CONCURRENCY: "8",
    MUSIC_IDENTITY_MAX_PENDING: "32", MUSIC_IDENTITY_MAX_INFLIGHT: "32",
    MUSIC_IDENTITY_RETRIES: "2", MUSIC_CONNECT_TIMEOUT_MS: "2000",
    MUSIC_READ_TIMEOUT_MS: "4000", MUSIC_IDENTITY_OVERALL_TIMEOUT_MS: "10000",
    MUSIC_IDENTITY_CACHE_TTL_MS: "30000", MUSIC_CIRCUIT_FAILURE_THRESHOLD: "3",
    MUSIC_IDENTITY_CIRCUIT_OPEN_MS: "15000", MUSIC_RATE_LIMIT_PER_MINUTE: "30",
    MUSIC_IDENTITY_GLOBAL_RATE_PER_MINUTE: "300", MUSIC_IDENTITY_RATE_MAX_ENTRIES: "10000",
    MUSIC_TOKEN_CURRENT_KID: "production-current", MUSIC_TOKEN_CURRENT_SECRET_FILE: "/run/secrets/music-token/current",
    MUSIC_TOKEN_LIFETIME_SECONDS: "600", MUSIC_TOKEN_CLOCK_SKEW_SECONDS: "15",
    MUSIC_TOKEN_PREVIOUS_KID: "", MUSIC_TOKEN_PREVIOUS_SECRET_FILE: "", MUSIC_TOKEN_PREVIOUS_ACCEPT_UNTIL: "",
    MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "production-publication-current",
    MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: "/run/secrets/music-publication-response/current",
    MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: "", MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KEY_FILE: "",
    MUSIC_PUBLICATION_RESPONSE_PREVIOUS_ACCEPT_UNTIL: "",
    MUSIC_PUBLIC_ID_HMAC_KEY_FILE: "/run/secrets/music-publication-response/public-id",
    ALLOWED_ORIGINS: "https://localtunes.earth,https://explorers.earth",
    MUSIC_IMAGE_DIGEST: digest, MUSIC_IMAGE_COMMIT: "a".repeat(40),
    MUSIC_MIGRATION_MARKER: "0038_explorers_movie_media",
    MUSIC_GATE_ATTESTATION_PATH: `/deployment-gates/${digest}.json`,
    ...overrides,
  };
}

export function productionComposeInputs(ambient: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const system = Object.fromEntries(Object.entries(ambient).filter(([key]) =>
    ["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE"].includes(key.toUpperCase())));
  const digest = `sha256:${"a".repeat(64)}`;
  return {
    ...system, COMPOSE_DISABLE_ENV_FILE: "1",
    ACME_EMAIL: "ops@example.invalid", DB_USER: "legacy-owner",
    DB_PASS: "legacy-owner-password-sentinel", DB_NAME: "music",
    DB_MIGRATOR_USER: "music_migrator", DB_MIGRATOR_PASSWORD_FILE_HOST: "/opt/explorers/secrets/db-migrator",
    DB_RUNTIME_USER: "music_runtime_login", DB_RUNTIME_PASSWORD_FILE_HOST: "/opt/explorers/secrets/db-runtime",
    SESSION_SECRET: "production-session-secret-at-least-32-characters",
    COOKIE_SECRET: "production-cookie-secret-at-least-32-characters",
    STRAPI_URL: "https://cms.example.com", MUSIC_STRAPI_ALLOWED_ORIGINS: "https://cms.example.com",
    STRAPI_ACCESS_TOKEN: "read-only-token", STRAPI_ANALYTICS_ACCESS_TOKEN: "analytics-read-only-token",
    STRAPI_JWT_SECRET: "production-jwt-secret-at-least-32-characters",
    MUSIC_GATE_ATTESTATION_KEY: "production-gate-key-at-least-32-characters",
    MUSIC_TOKEN_CURRENT_KID: "production-current",
    MUSIC_TOKEN_SECRET_DIRECTORY_HOST: "/opt/explorers/music-token-secrets",
    MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "production-publication-current",
    MUSIC_PUBLICATION_RESPONSE_KEY_DIRECTORY_HOST: "/opt/explorers/music-publication-response",
    STRAPI_LIFECYCLE_PROOF_TOKEN_FILE_HOST: "/opt/explorers/strapi-lifecycle-proof",
    EXPLORERS_IMAGE: `ghcr.io/example/explorers@${digest}`,
    TUNES_BLUE_IMAGE: `ghcr.io/example/tunes@${digest}`, TUNES_BLUE_DIGEST: digest, TUNES_BLUE_COMMIT: "a".repeat(40),
    TUNES_GREEN_IMAGE: `ghcr.io/example/tunes@${digest}`, TUNES_GREEN_DIGEST: digest, TUNES_GREEN_COMMIT: "a".repeat(40),
    TUNES_CANDIDATE_IMAGE: `ghcr.io/example/tunes@${digest}`, TUNES_CANDIDATE_DIGEST: digest, TUNES_CANDIDATE_COMMIT: "a".repeat(40),
    TUNES_COMPAT_IMAGE: `ghcr.io/example/tunes@${digest}`,
  };
}
