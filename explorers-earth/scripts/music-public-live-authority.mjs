import { Buffer } from "node:buffer";

export const MUSIC_PUBLIC_LIVE_FIXTURE_VERSION = "music-public-e2e-fixture/v1";
export const MUSIC_PUBLIC_LIVE_PROJECT = "explorers-music-fixture";
export const MUSIC_PUBLIC_LIVE_ACKNOWLEDGEMENT = "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE";
export const MUSIC_PUBLIC_LIVE_NAMESPACE_RESET = "RESET_EXPLORERS_MUSIC_FIXTURE_NAMESPACE";

export const MUSIC_PUBLIC_LIVE_AUTHORITY_ARGS = Object.freeze([
  "--ack",
  MUSIC_PUBLIC_LIVE_ACKNOWLEDGEMENT,
  "--fixture-version",
  MUSIC_PUBLIC_LIVE_FIXTURE_VERSION,
  "--confirm-project",
  MUSIC_PUBLIC_LIVE_PROJECT,
  "--confirm-namespace-reset",
  MUSIC_PUBLIC_LIVE_NAMESPACE_RESET,
]);

const SERVICE_ORIGINS = Object.freeze([
  "tcp://127.0.0.1:55432",
  "http://127.0.0.1:51337",
  "http://127.0.0.1:55000",
  "http://localhost:55173",
  "http://127.0.0.1:55174",
]);

const HEALTH_URLS = Object.freeze([
  "tcp://127.0.0.1:55432",
  "http://127.0.0.1:51337/health",
  "http://127.0.0.1:55000/api/music-fixture/readiness",
  "http://localhost:55173/health",
  "http://127.0.0.1:55174/health",
]);

const FORBIDDEN_AMBIENT_KEYS = new Set([
  "COMPOSE_PROJECT_NAME",
  "DATABASE_URL",
  "DATABASE_URL_TEST",
  "DOCKER_CONTEXT",
  "DOCKER_HOST",
  "E2E_PROFILE_LIVE_WRITES",
  "E2E_PROFILE_STORAGE_STATE",
  "E2E_PROFILE_USERNAME",
  "GATE_PROD",
  "MUSIC_API_BASE_URL",
  "MUSIC_MODE",
  "MUSIC_PUBLIC_RUN_ID",
  "MUSIC_STRAPI_HOST_PORT",
  "PLAYWRIGHT_EXTERNAL_BASE_URL",
  "PLAYWRIGHT_PR_SAFE",
  "STRAPI_ACCESS_TOKEN",
  "STRAPI_ANALYTICS_ACCESS_TOKEN",
  "STRAPI_URL",
  "VITE_API_URL",
  "VITE_BASE_URL",
  "VITE_LOCAL_TUNES_API_URL",
  "VITE_PUBLIC_ACCESS_TOKEN",
  "VITE_REST_API_URL",
]);

const FORBIDDEN_AMBIENT_PREFIXES = Object.freeze([
  "LIVE_STRAPI_",
  "MUSIC_C10_STANDALONE_POSTGRES_",
  "MUSIC_DATABASE_",
  "MUSIC_DB_",
  "MUSIC_DEPLOY_",
  "MUSIC_E2E_",
  "MUSIC_UAT_DATABASE_",
]);

function exactArgs(args) {
  return Array.isArray(args)
    && args.length === MUSIC_PUBLIC_LIVE_AUTHORITY_ARGS.length
    && args.every((value, index) => value === MUSIC_PUBLIC_LIVE_AUTHORITY_ARGS[index]);
}

function hasForbiddenAmbientAuthority(environment) {
  return Object.keys(environment).some((rawKey) => {
    const key = rawKey.toUpperCase();
    return FORBIDDEN_AMBIENT_KEYS.has(key)
      || FORBIDDEN_AMBIENT_PREFIXES.some((prefix) => key.startsWith(prefix));
  });
}

export function validateMusicPublicLiveInvocation({ args, environment } = {}) {
  return exactArgs(args)
    && environment && typeof environment === "object" && !Array.isArray(environment)
    && !hasForbiddenAmbientAuthority(environment);
}

function generatedBytes(randomBytes, size) {
  const value = randomBytes(size);
  if (!(value instanceof Uint8Array) || value.byteLength !== size) {
    throw new Error("Live public Music E2E authority generation refused.");
  }
  return Buffer.from(value);
}

/**
 * Validates the complete public live invocation before generating any local
 * capability. The returned object is detached from both argv and process.env;
 * callers decide when to install the derived environment.
 */
export function buildMusicPublicLiveAuthority({ args, environment, randomBytes }) {
  if (!validateMusicPublicLiveInvocation({ args, environment }) || typeof randomBytes !== "function") {
    throw new Error("Live public Music E2E invocation refused.");
  }

  const runId = generatedBytes(randomBytes, 16).toString("hex");
  const fixtureToken = generatedBytes(randomBytes, 32).toString("base64url");
  const namespace = `e2e-public-music-${runId}`;
  const username = `${namespace}-owner`;
  const accountDocumentId = `${namespace}-account`;
  const userDocumentId = `${namespace}-user`;
  const externalUrl = "http://localhost:55173";
  const strapiUrl = "http://127.0.0.1:51337";
  const serviceOrigins = [...SERVICE_ORIGINS];
  const healthUrls = [...HEALTH_URLS];

  return {
    runId,
    namespace,
    username,
    accountDocumentId,
    userDocumentId,
    fixtureToken,
    project: MUSIC_PUBLIC_LIVE_PROJECT,
    fixtureVersion: MUSIC_PUBLIC_LIVE_FIXTURE_VERSION,
    namespaceResetConfirmation: MUSIC_PUBLIC_LIVE_NAMESPACE_RESET,
    externalUrl,
    strapiUrl,
    serviceOrigins,
    healthUrls,
    environment: {
      MUSIC_PUBLIC_RUN_ID: runId,
      PLAYWRIGHT_EXTERNAL_BASE_URL: externalUrl,
      PLAYWRIGHT_PR_SAFE: "false",
      MUSIC_STRAPI_HOST_PORT: "51337",
      MUSIC_E2E_LIVE_WRITE: "true",
      MUSIC_E2E_LIVE_WRITE_CONFIRMATION: MUSIC_PUBLIC_LIVE_ACKNOWLEDGEMENT,
      MUSIC_E2E_FIXTURE_VERSION: MUSIC_PUBLIC_LIVE_FIXTURE_VERSION,
      MUSIC_E2E_ACCOUNT_USERNAME: username,
      MUSIC_E2E_ACCOUNT_DOCUMENT_ID: accountDocumentId,
      MUSIC_E2E_USER_DOCUMENT_ID: userDocumentId,
      MUSIC_E2E_STRAPI_URL: strapiUrl,
      MUSIC_E2E_STRAPI_TOKEN: fixtureToken,
      MUSIC_E2E_NAMESPACE_RESET_CONFIRMATION: MUSIC_PUBLIC_LIVE_NAMESPACE_RESET,
      MUSIC_E2E_SERVICE_ORIGINS: serviceOrigins.join(","),
      MUSIC_E2E_HEALTH_URLS: healthUrls.join(","),
    },
  };
}
