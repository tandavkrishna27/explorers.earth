import { resolve } from "node:path";
import { resolveMusicFixtureStrapiUrl, validateMusicFixtureStrapiUrl } from "./music-environment";

export interface MusicReconciliationCommandConfig {
  environment: "fixture" | "staging" | "production";
  applyEnabled: boolean;
  liveContractVerified: boolean;
  sourceUrl: string;
  serviceToken?: string;
  serviceTokenFile?: string;
  lifecycleProofTokenFile?: string;
  accessTokenFile?: string;
  pageSize: number;
  maxRows: number;
  batchSize: number;
  maxChangeAbsolute: number;
  maxChangePercent: number;
  maxPages: number;
  scanTimeoutMs: number;
  timeoutMs: number;
  maxResponseBytes: number;
  maxCanonicalBytes: number;
  databaseLockTimeoutMs: number;
  databaseStatementTimeoutMs: number;
  databaseIdleTransactionTimeoutMs: number;
}

function booleanValue(input: Record<string, unknown>, name: string, fallback: boolean): boolean {
  const value = input[name];
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function integerValue(
  input: Record<string, unknown>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = input[name];
  if (raw === undefined || raw === "") return fallback;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) throw new Error(`${name} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} is out of bounds`);
  return value;
}

function percentValue(input: Record<string, unknown>, name: string, fallback: number): number {
  const raw = input[name];
  if (raw === undefined || raw === "") return fallback;
  if (typeof raw !== "string" || !/^(?:\d+|\d+\.\d+)$/.test(raw)) throw new Error(`${name} must be a percentage`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${name} is out of bounds`);
  return value;
}

function requiredString(input: Record<string, unknown>, name: string): string {
  const value = input[name];
  if (typeof value !== "string" || !value.trim() || value.length > 4_096) throw new Error(`${name} is required`);
  return value;
}

export function parseMusicReconciliationCommandConfig(input: Record<string, unknown>): MusicReconciliationCommandConfig {
  const mode = input.MUSIC_MODE;
  if (mode !== "fixture" && mode !== "live") throw new Error("MUSIC_MODE must be fixture or live");
  const configuredEnvironment = input.MUSIC_RECONCILIATION_ENVIRONMENT;
  const environment = configuredEnvironment === undefined || configuredEnvironment === ""
    ? mode === "fixture" ? "fixture" : undefined
    : configuredEnvironment;
  if (environment !== "fixture" && environment !== "staging" && environment !== "production") {
    throw new Error("MUSIC_RECONCILIATION_ENVIRONMENT must be fixture, staging, or production");
  }
  if ((mode === "fixture") !== (environment === "fixture")) {
    throw new Error("MUSIC_MODE and MUSIC_RECONCILIATION_ENVIRONMENT do not agree");
  }
  const reconciliationEnvironment: MusicReconciliationCommandConfig["environment"] = environment;

  const applyEnabled = booleanValue(input, "MUSIC_RECONCILIATION_APPLY_ENABLED", false);
  const liveContractVerified = booleanValue(input, "MUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED", false);
  if (reconciliationEnvironment === "production" && applyEnabled) throw new Error("Production reconciliation apply is disabled for this release");
  if (mode === "live" && !liveContractVerified) {
    throw new Error("Live reconciliation is blocked until the C0 pagination and service-token contract is verified");
  }

  const common = {
    environment: reconciliationEnvironment,
    applyEnabled,
    liveContractVerified,
    pageSize: integerValue(input, "MUSIC_RECONCILIATION_PAGE_SIZE", 100, 1, 1_000),
    maxRows: integerValue(input, "MUSIC_RECONCILIATION_SCAN_MAX_ROWS", 1_000, 1, 100_000),
    batchSize: integerValue(input, "MUSIC_RECONCILIATION_BATCH_SIZE", 100, 1, 1_000),
    maxChangeAbsolute: integerValue(input, "MUSIC_RECONCILIATION_MAX_CHANGE_ABSOLUTE", 0, 0, 100_000),
    maxChangePercent: percentValue(input, "MUSIC_RECONCILIATION_MAX_CHANGE_PERCENT", 0),
    maxPages: integerValue(input, "MUSIC_RECONCILIATION_MAX_PAGES", 100, 1, 1_000),
    scanTimeoutMs: integerValue(input, "MUSIC_RECONCILIATION_SCAN_TIMEOUT_MS", 300_000, 1_000, 1_800_000),
    timeoutMs: integerValue(input, "MUSIC_RECONCILIATION_TIMEOUT_MS", 10_000, 100, 120_000),
    maxResponseBytes: integerValue(input, "MUSIC_RECONCILIATION_MAX_RESPONSE_BYTES", 1_048_576, 1_024, 16 * 1024 * 1024),
    maxCanonicalBytes: integerValue(input, "MUSIC_RECONCILIATION_MAX_CANONICAL_BYTES", 16 * 1024 * 1024, 1_024, 16 * 1024 * 1024),
    databaseLockTimeoutMs: integerValue(input, "MUSIC_RECONCILIATION_DB_LOCK_TIMEOUT_MS", 5_000, 1, 60_000),
    databaseStatementTimeoutMs: integerValue(input, "MUSIC_RECONCILIATION_DB_STATEMENT_TIMEOUT_MS", 120_000, 1, 600_000),
    databaseIdleTransactionTimeoutMs: integerValue(input, "MUSIC_RECONCILIATION_DB_IDLE_TRANSACTION_TIMEOUT_MS", 30_000, 1, 600_000),
  };

  if (mode === "fixture") {
    const sourceUrl = validateMusicFixtureStrapiUrl(requiredString(input, "STRAPI_FIXTURE_URL"));
    if (sourceUrl !== resolveMusicFixtureStrapiUrl(input.MUSIC_STRAPI_HOST_PORT as string | undefined)) {
      throw new Error("Fixture reconciliation source and host port do not agree");
    }
    const serviceToken = requiredString(input, "STRAPI_RECONCILIATION_TOKEN");
    if (serviceToken !== "fixture-read-only-token") throw new Error("Fixture reconciliation token does not match fixture authority");
    return { ...common, sourceUrl, serviceToken };
  }

  const sourceUrl = requiredString(input, "STRAPI_URL");
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Live reconciliation requires a credential-free HTTPS Strapi URL");
  const serviceTokenFile = requiredString(input, "STRAPI_RECONCILIATION_TOKEN_FILE");
  const lifecycleProofTokenFile = requiredString(input, "STRAPI_LIFECYCLE_PROOF_TOKEN_FILE");
  const accessTokenFile = requiredString(input, "STRAPI_ACCESS_TOKEN_FILE");
  requiredString(input, "STRAPI_ACCESS_TOKEN");
  if (input.STRAPI_RECONCILIATION_TOKEN !== undefined && input.STRAPI_RECONCILIATION_TOKEN !== "") {
    throw new Error("Live reconciliation service tokens must be file-backed");
  }
  const tokenFileIdentities = [serviceTokenFile, lifecycleProofTokenFile, accessTokenFile].map(normalizedTokenPath);
  if (new Set(tokenFileIdentities).size !== tokenFileIdentities.length) {
    throw new Error("Reconciliation requires dedicated service-token files");
  }
  return {
    ...common,
    sourceUrl,
    serviceTokenFile,
    lifecycleProofTokenFile,
    accessTokenFile,
    serviceToken: undefined,
  };
}

function normalizedTokenPath(path: string): string {
  const normalized = resolve(path).replace(/^\\\\\?\\/, "");
  /* c8 ignore next -- both path-case semantics are covered on their native CI workers. */
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function validateMusicReconciliationServiceToken(value: string): string {
  if (value.length < 16 || value.length > 4_096 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("The reconciliation service token is invalid");
  }
  return value;
}
