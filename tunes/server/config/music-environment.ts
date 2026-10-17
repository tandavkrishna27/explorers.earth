import { z } from "zod";
import { EXPECTED_MUSIC_MIGRATION_ID } from "../../shared/music-migration-contract";

export const DEFAULT_MUSIC_FIXTURE_STRAPI_HOST_PORT = 51_337;
const FIXED_MUSIC_FIXTURE_HOST_PORTS = new Set([55_432, 55_000, 55_173]);

export function parseMusicFixtureStrapiHostPort(value: string | number | undefined): number {
  const text = value === undefined ? String(DEFAULT_MUSIC_FIXTURE_STRAPI_HOST_PORT) : String(value);
  if (!/^[1-9]\d*$/.test(text)) throw new Error("MUSIC_STRAPI_HOST_PORT must be an explicit integer");
  const port = Number(text);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535 || FIXED_MUSIC_FIXTURE_HOST_PORTS.has(port)) {
    throw new Error("MUSIC_STRAPI_HOST_PORT must be a distinct unprivileged fixture port");
  }
  return port;
}

export function resolveMusicFixtureStrapiUrl(hostPort?: string | number): string {
  return `http://127.0.0.1:${parseMusicFixtureStrapiHostPort(hostPort)}`;
}

export function validateMusicFixtureStrapiUrl(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error("STRAPI_FIXTURE_URL must target an explicit loopback Strapi fixture port"); }
  if (!parsed.port) throw new Error("STRAPI_FIXTURE_URL must target an explicit loopback Strapi fixture port");
  const canonical = resolveMusicFixtureStrapiUrl(parsed.port);
  if (value !== canonical || parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1"
      || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash
      || parsed.origin !== canonical) {
    throw new Error("STRAPI_FIXTURE_URL must target an explicit loopback Strapi fixture port");
  }
  return canonical;
}

const integerString = (name: string, minimum: number, maximum: number) =>
  z.string().regex(/^\d+$/, `${name} must be an integer`).transform(Number).refine((value) => value >= minimum && value <= maximum, `${name} must be between ${minimum} and ${maximum}`);

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

const fixtureStrapiHostPort = z.string().default(String(DEFAULT_MUSIC_FIXTURE_STRAPI_HOST_PORT)).transform((value, context) => {
  try { return parseMusicFixtureStrapiHostPort(value); }
  catch (error) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
    return z.NEVER;
  }
});

const fixtureRuntimeShape = {
  MUSIC_MODE: z.enum(["fixture", "live"]),
  MUSIC_FIXTURE_VERSION: z.literal("1"),
  MUSIC_STRAPI_HOST_PORT: fixtureStrapiHostPort,
  STRAPI_FIXTURE_URL: z.string().min(1).max(128),
  MUSIC_DATABASE_HOST: z.literal("postgres"),
  MUSIC_DATABASE_PORT: z.literal("5432"),
  MUSIC_DATABASE_NAME: z.literal("music_fixture"),
  MUSIC_DATABASE_USER: z.literal("music_runtime_login"),
  MUSIC_DATABASE_MIGRATOR_USER: z.literal("music_migrator"),
  MUSIC_DATABASE_PASSWORD_FILE: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  MUSIC_SIGNING_KEY_CURRENT_ID: z.string().min(1),
  MUSIC_SIGNING_KEY_CURRENT_SECRET: z.string().min(32),
  MUSIC_SIGNING_KEY_PREVIOUS_ID: z.string().min(1),
  MUSIC_SIGNING_KEY_PREVIOUS_SECRET: z.string().min(32),
  MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: z.literal("fixture-publication-v1"),
  MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY: z.literal("fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI"),
  MUSIC_PUBLIC_ID_HMAC_KEY: z.literal("VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ"),
  MUSIC_CONNECT_TIMEOUT_MS: integerString("MUSIC_CONNECT_TIMEOUT_MS", 100, 60_000),
  MUSIC_READ_TIMEOUT_MS: integerString("MUSIC_READ_TIMEOUT_MS", 100, 120_000),
  MUSIC_CIRCUIT_FAILURE_THRESHOLD: integerString("MUSIC_CIRCUIT_FAILURE_THRESHOLD", 1, 100),
  MUSIC_RATE_LIMIT_PER_MINUTE: integerString("MUSIC_RATE_LIMIT_PER_MINUTE", 1, 10_000),
  MUSIC_PROVISIONING_KILL_SWITCH: booleanString,
  MUSIC_PROVISIONING_COHORT: z.string().min(1),
  MUSIC_EXPECTED_MIGRATION_ID: z.literal(EXPECTED_MUSIC_MIGRATION_ID),
  MUSIC_RECONCILIATION_ENABLED: booleanString,
  MUSIC_RECONCILIATION_MAX_ROWS: integerString("MUSIC_RECONCILIATION_MAX_ROWS", 0, 100_000),
} as const;

function enforceContainmentState(environment: {
  MUSIC_PROVISIONING_KILL_SWITCH: boolean;
  MUSIC_PROVISIONING_COHORT: string;
  MUSIC_RECONCILIATION_ENABLED: boolean;
  MUSIC_RECONCILIATION_MAX_ROWS: number;
}, context: z.RefinementCtx): void {
  if (!environment.MUSIC_PROVISIONING_KILL_SWITCH) context.addIssue({ code: z.ZodIssueCode.custom, path: ["MUSIC_PROVISIONING_KILL_SWITCH"], message: "C0 requires the provisioning kill switch" });
  if (environment.MUSIC_PROVISIONING_COHORT !== "disabled") context.addIssue({ code: z.ZodIssueCode.custom, path: ["MUSIC_PROVISIONING_COHORT"], message: "C0 requires the disabled cohort" });
  if (environment.MUSIC_RECONCILIATION_ENABLED || environment.MUSIC_RECONCILIATION_MAX_ROWS !== 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["MUSIC_RECONCILIATION_ENABLED"], message: "C0 requires reconciliation disabled with zero rows" });
}

function enforceFixtureTransportState(environment: {
  MUSIC_STRAPI_HOST_PORT: number;
  STRAPI_FIXTURE_URL: string;
}, context: z.RefinementCtx): void {
  try {
    const canonical = validateMusicFixtureStrapiUrl(environment.STRAPI_FIXTURE_URL);
    if (canonical !== resolveMusicFixtureStrapiUrl(environment.MUSIC_STRAPI_HOST_PORT)) {
      throw new Error("STRAPI_FIXTURE_URL and MUSIC_STRAPI_HOST_PORT must identify the same loopback fixture");
    }
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["STRAPI_FIXTURE_URL"],
      message: (error as Error).message,
    });
  }
}

export const musicRuntimeFixtureEnvironmentSchema = z.object(fixtureRuntimeShape).passthrough()
  .superRefine(enforceContainmentState)
  .superRefine(enforceFixtureTransportState);

export const musicEnvironmentSchema = z.object({
  ...fixtureRuntimeShape,
  DATABASE_URL_TEST: z.string().min(1),
  MUSIC_TOKEN_SECRET_FILE_HOST: z.string().regex(/^\.\/\.artifacts\/music-token-secrets\/current-[a-f0-9]{32}$/),
  MUSIC_DB_MIGRATOR_SECRET_FILE_HOST: z.string().regex(/^\.\/\.artifacts\/music-token-secrets\/current-[a-f0-9]{32}$/),
  MUSIC_DB_RUNTIME_SECRET_FILE_HOST: z.string().regex(/^\.\/\.artifacts\/music-token-secrets\/current-[a-f0-9]{32}$/),
}).passthrough().superRefine((environment, context) => {
  enforceContainmentState(environment, context);
  enforceFixtureTransportState(environment, context);
  let database: URL;
  try {
    database = new URL(environment.DATABASE_URL_TEST);
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["DATABASE_URL_TEST"], message: "DATABASE_URL_TEST must be a PostgreSQL URL" });
    return;
  }
  if (database.protocol !== "postgresql:" || database.username !== "music_migrator" || database.password
      || database.hostname !== "127.0.0.1" || database.port !== "55432" || database.pathname !== "/music_fixture" || database.search || database.hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["DATABASE_URL_TEST"], message: "DATABASE_URL_TEST must exactly target 127.0.0.1:55432/music_fixture" });
  }
});

export function parseMusicEnvironment(input: Record<string, unknown>) {
  return musicEnvironmentSchema.parse(input);
}

export function normalizeMusicFixtureChildEnvironment(input: Record<string, string>): Record<string, string> {
  const environment = parseMusicEnvironment(input);
  return {
    ...input,
    MUSIC_STRAPI_HOST_PORT: String(environment.MUSIC_STRAPI_HOST_PORT),
    STRAPI_FIXTURE_URL: environment.STRAPI_FIXTURE_URL,
  };
}

export function parseMusicRuntimeFixtureEnvironment(input: Record<string, unknown>) {
  return musicRuntimeFixtureEnvironmentSchema.parse(input);
}
