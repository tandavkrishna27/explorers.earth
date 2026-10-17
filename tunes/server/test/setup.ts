// Vitest global setup — runs before any test file imports app code.
// Sets env BEFORE any module that reads it at import time (db.ts creates its
// pool on import). Pure-unit tests (sanitize-user) don't import the app. The
// C0 fixture contract deliberately fixes its test database to loopback:55432.
import { randomBytes } from "node:crypto";
import { EXPECTED_MUSIC_MIGRATION_ID } from "../../shared/music-migration-contract";

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-at-least-32-characters';
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'test-cookie-secret-at-least-32-characters';
process.env.MUSIC_MODE = 'fixture';
process.env.STRAPI_URL = 'http://strapi:1337';
process.env.MUSIC_FIXTURE_STRAPI_ORIGIN = 'http://strapi:1337';
process.env.TRUST_PROXY_HOPS = '0';
delete process.env.MUSIC_TRUSTED_PROXY_IP;
process.env.MUSIC_FIXTURE_VERSION = '1';
process.env.STRAPI_LIFECYCLE_PROOF_TOKEN = 'fixture-read-only-token';
process.env.STRAPI_FIXTURE_URL = 'http://127.0.0.1:51337';
process.env.DATABASE_URL_TEST ||= 'postgresql://music_migrator:music@127.0.0.1:55432/music_fixture';
process.env.MUSIC_DATABASE_HOST = 'postgres';
process.env.MUSIC_DATABASE_PORT = '5432';
process.env.MUSIC_DATABASE_NAME = 'music_fixture';
process.env.MUSIC_DATABASE_USER = 'music_runtime_login';
process.env.MUSIC_DATABASE_MIGRATOR_USER = 'music_migrator';
process.env.MUSIC_DATABASE_PASSWORD_FILE = '/run/secrets/music-db-runtime';
process.env.MUSIC_TOKEN_SECRET_FILE_HOST = './.artifacts/music-token-secrets/current-11111111111111111111111111111111';
process.env.MUSIC_DB_MIGRATOR_SECRET_FILE_HOST = './.artifacts/music-token-secrets/current-22222222222222222222222222222222';
process.env.MUSIC_DB_RUNTIME_SECRET_FILE_HOST = './.artifacts/music-token-secrets/current-33333333333333333333333333333333';
process.env.MUSIC_SIGNING_KEY_CURRENT_ID = 'fixture-current';
process.env.MUSIC_SIGNING_KEY_CURRENT_SECRET = 'fixture-current-secret-at-least-32-characters';
process.env.MUSIC_SIGNING_KEY_PREVIOUS_ID = 'fixture-previous';
process.env.MUSIC_SIGNING_KEY_PREVIOUS_SECRET = 'fixture-previous-secret-at-least-32-characters';
process.env.MUSIC_TOKEN_CURRENT_KID = 'fixture-current';
process.env.MUSIC_TOKEN_CURRENT_SECRET = randomBytes(32).toString('base64url');
process.env.MUSIC_PUBLICATION_RESPONSE_CURRENT_KID = 'fixture-publication-v1';
process.env.MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY = 'fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI';
process.env.MUSIC_PUBLIC_ID_HMAC_KEY = 'VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ';
process.env.MUSIC_TOKEN_LIFETIME_SECONDS = '600';
process.env.MUSIC_TOKEN_CLOCK_SKEW_SECONDS = '15';
process.env.MUSIC_CONNECT_TIMEOUT_MS = '5000';
process.env.MUSIC_READ_TIMEOUT_MS = '10000';
process.env.MUSIC_CIRCUIT_FAILURE_THRESHOLD = '3';
process.env.MUSIC_RATE_LIMIT_PER_MINUTE = '60';
process.env.MUSIC_PROVISIONING_KILL_SWITCH = 'true';
process.env.MUSIC_PROVISIONING_COHORT = 'disabled';
process.env.MUSIC_EXPECTED_MIGRATION_ID = EXPECTED_MUSIC_MIGRATION_ID;
process.env.MUSIC_RECONCILIATION_ENABLED = 'false';
process.env.MUSIC_RECONCILIATION_MAX_ROWS = '0';
// The integration suite CREATES + DELETES a user. NEVER inherit an ambient
// DATABASE_URL (it could point at dev/prod): use DATABASE_URL_TEST if provided,
// otherwise a local throwaway. Any inherited DATABASE_URL is deliberately ignored.
if (process.env.MUSIC_INTEGRATION_SETUP === "1") delete process.env.DATABASE_URL;
else process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
