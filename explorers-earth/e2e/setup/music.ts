import { test as base, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalCategoryAccount } from "../../src/test/canonicalAccountFixture";

// Ensure accepts the canonical same-origin route (ADR-006/008) and the legacy
// Music-origin path, because the full-stack fixtures still answer the latter.
const ENSURE_ROUTE = /\/api\/(?:explorers\/v1\/)?music\/identity\/ensure$/;
import {
  LIVE_PROFILE_BATCH_FAILURE_CODES,
  LIVE_PROFILE_BATCH_FAILURE_STAGES,
  LIVE_PERMISSION_JOURNEY_IDS,
  LIVE_RECONNECT_FAILURE_STAGES,
  buildLiveJourneyResult,
  buildLiveJourneyTerminal,
} from "../../scripts/music-public-live-preflight.mjs";

export const MUSIC_PUBLIC_FIXTURE_VERSION = "music-public-e2e-fixture/v1" as const;
export const MUSIC_LIVE_WRITE_CONFIRMATION = "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE" as const;
export const MUSIC_MUTATION_CALLSITES = [
  "owner-publication",
  "playlist-create",
  "playlist-delete",
  "playlist-song-add",
  "playlist-song-delete",
  "playlist-visibility",
  "queue-replace",
  "guest-controls",
  "song-request",
  "request-accept",
  "request-revoke",
  "guest-playback",
  "player-update",
] as const;
export type MusicMutationCallsite = typeof MUSIC_MUTATION_CALLSITES[number];

export async function attachLiveFailureScreenshotBestEffort(
  page: Pick<Page, "isClosed" | "screenshot">,
  testInfo: Pick<TestInfo, "status" | "expectedStatus" | "attach">,
  name: string,
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
  try {
    const body = await page.screenshot();
    await testInfo.attach(name, { body, contentType: "image/png" });
  } catch {
    // A diagnostic must never change the terminal outcome of the journey it observes.
  }
}

export function musicOwnerCredentialFromAuthState(environment: Record<string, string | undefined> = process.env): string {
  const authPath = environment.MUSIC_E2E_AUTH_STATE_PATH;
  if (!authPath) throw new Error("MUSIC_E2E_AUTH_STATE_PATH is required after callback bootstrap");
  const decoded = JSON.parse(readFileSync(authPath, "utf8")) as { ownerCredential?: unknown };
  if (typeof decoded.ownerCredential !== "string" || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(decoded.ownerCredential)) {
    throw new Error("callback bootstrap auth state does not contain a valid opaque owner authority");
  }
  return decoded.ownerCredential;
}

export const MUSIC_PUBLIC_STATES = [
  "public",
  "unlisted",
  "private",
  "suspended",
  "tombstoned",
  "all-content",
  "empty",
  "queue-only",
  "playlists-only",
  "history-only",
  "request-allowed",
  "request-rate-limited",
] as const;

export type MusicTestLane = "pr-safe" | "fixture" | "live" | "visual";

export interface MusicPermissionRow {
  key: string;
  allowSongRequests: boolean;
  allowGuestPlayOnDevice: boolean;
  allowPlaylistSharing: boolean;
  allowRecentlyPlayedVisibility: boolean;
  allowQueueVisibility: boolean;
}

export function resolveMusicTestLane(environment: Record<string, string | undefined>): MusicTestLane {
  if (environment.PLAYWRIGHT_PR_SAFE === "true") return "pr-safe";
  if (environment.MUSIC_E2E_LIVE_WRITE === "true") return "live";
  if (environment.MUSIC_E2E_VISUAL === "true") return "visual";
  return "fixture";
}

export function fixtureNamespace(runId: string): string {
  const safeRunId = runId.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!safeRunId) throw new Error("Fixture run ID must contain an ASCII letter or digit");
  return `e2e-public-music-${safeRunId}`;
}

export function assertLiveWriteAuthority(input: {
  lane: MusicTestLane;
  liveWriteEnabled: boolean;
  baseUrl: string;
  serviceOrigins: string[];
  accountDocumentId: string;
  accountUsername: string;
  fixtureVersion: string;
  confirmation: string | undefined;
}): { authorized: true; namespace: string; callsites: readonly MusicMutationCallsite[] } {
  if (input.lane === "pr-safe") throw new Error("PR-safe lane cannot acquire live-write authority");
  if (input.lane !== "live") throw new Error("Live writes require the live lane");
  if (!input.liveWriteEnabled) throw new Error("Live writes require MUSIC_E2E_LIVE_WRITE=true");
  if (input.confirmation !== MUSIC_LIVE_WRITE_CONFIRMATION) {
    throw new Error("Live writes require the exact disposable-fixture confirmation");
  }
  if (input.fixtureVersion !== MUSIC_PUBLIC_FIXTURE_VERSION) {
    throw new Error(`Live writes require fixture version ${MUSIC_PUBLIC_FIXTURE_VERSION}`);
  }
  const allOrigins = [input.baseUrl, ...input.serviceOrigins];
  for (const rawOrigin of allOrigins) {
    const url = new URL(rawOrigin);
    if (!["http:", "tcp:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      throw new Error(`Live writes require every service origin to be disposable loopback: ${url.origin}`);
    }
  }
  const match = input.accountUsername.match(/^(e2e-public-music-[a-z0-9-]+)-owner$/);
  if (!match) throw new Error("Live writes require a namespaced disposable account");
  if (input.accountDocumentId !== `${match[1]}-account`) {
    throw new Error("Live writes require a namespaced disposable account document ID");
  }
  return { authorized: true, namespace: match[1], callsites: MUSIC_MUTATION_CALLSITES };
}

let liveMutationBlockedReason: string | null = null;

function exactDurableGuard(value: unknown): "clear" | "blocked" | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("\0") !== ["reason", "stage", "state", "version"].join("\0")
      || record.version !== "music-e2e-mutation-guard/v1") return undefined;
  if (record.state === "clear" && record.reason === "none" && record.stage === "preflight") return "clear";
  if (record.state === "blocked"
      && ["restore-failed", "restore-mismatch", "cleanup-failed", "profile-restore-failed", "profile-batch-failed", "guard-invalid"].includes(String(record.reason))
      && ["restore", "verification", "cleanup", "profile-restore", "body", "preflight"].includes(String(record.stage))) return "blocked";
  return undefined;
}

async function durableMusicMutationState(environment: Record<string, string | undefined> = process.env): Promise<"clear" | "blocked"> {
  if (environment.MUSIC_E2E_LIVE_WRITE !== "true") return "clear";
  const serviceUrl = environment.MUSIC_E2E_STATE_SERVICE_URL;
  const token = environment.MUSIC_E2E_STATE_TOKEN;
  if (!serviceUrl || !token || !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(serviceUrl)) return "blocked";
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return "blocked";
    const payload = await response.json() as Record<string, unknown>;
    if (payload.status !== "ready" || payload.service !== "music-e2e-state") return "blocked";
    return exactDurableGuard(payload.mutationGuard) ?? "blocked";
  } catch { return "blocked"; }
}

async function blockDurableMusicMutations(reason: string, stage: string): Promise<void> {
  if (process.env.MUSIC_E2E_LIVE_WRITE !== "true") return;
  const serviceUrl = process.env.MUSIC_E2E_STATE_SERVICE_URL;
  const token = process.env.MUSIC_E2E_STATE_TOKEN;
  if (!serviceUrl || !token) return;
  try {
    await fetch(`${serviceUrl}/block`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ reason, stage }), signal: AbortSignal.timeout(5_000),
    });
  } catch { /* a local fixed latch still fails this worker closed */ }
}

export function resetMusicRestoreBlockForContractTest(): void {
  liveMutationBlockedReason = null;
}

export async function runAuthorizedMusicMutation<T>(
  authorityInput: Parameters<typeof assertLiveWriteAuthority>[0],
  callsite: MusicMutationCallsite,
  mutation: () => Promise<T>,
): Promise<T> {
  if (liveMutationBlockedReason) {
    throw new Error(`Live Music mutations are blocked after a restoration failure: ${liveMutationBlockedReason}`);
  }
  const authority = assertLiveWriteAuthority(authorityInput);
  if (!authority.callsites.includes(callsite)) throw new Error(`Unknown Music mutation callsite: ${callsite}`);
  if (await durableMusicMutationState() !== "clear") throw new Error("MUSIC_MUTATION_BLOCKED");
  return mutation();
}

export function musicLiveAuthorityFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): Parameters<typeof assertLiveWriteAuthority>[0] {
  const serviceOrigins = (environment.MUSIC_E2E_SERVICE_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return {
    lane: resolveMusicTestLane(environment),
    liveWriteEnabled: environment.MUSIC_E2E_LIVE_WRITE === "true",
    baseUrl: environment.PLAYWRIGHT_EXTERNAL_BASE_URL ?? "",
    serviceOrigins,
    accountDocumentId: environment.MUSIC_E2E_ACCOUNT_DOCUMENT_ID ?? "",
    accountUsername: environment.MUSIC_E2E_ACCOUNT_USERNAME ?? "",
    fixtureVersion: environment.MUSIC_E2E_FIXTURE_VERSION ?? "",
    confirmation: environment.MUSIC_E2E_LIVE_WRITE_CONFIRMATION,
  };
}

export function musicLiveWriteSkipReason(environment: Record<string, string | undefined> = process.env): string | null {
  try {
    assertLiveWriteAuthority(musicLiveAuthorityFromEnvironment(environment));
    musicLiveStrapiTokenFromEnvironment(environment);
    return null;
  } catch (error) {
    return `live mutation skipped: ${error instanceof Error ? error.message : "authority unavailable"}`;
  }
}

export function musicLiveStrapiTokenFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): string {
  // Validate the complete disposable live tuple before reading callback
  // authority. PR-safe collection therefore never needs or fabricates it.
  assertLiveWriteAuthority(musicLiveAuthorityFromEnvironment(environment));
  const token = environment.MUSIC_E2E_STRAPI_TOKEN;
  if (typeof token !== "string" || token.length < 16 || /\s/.test(token)) {
    throw new Error("MUSIC_E2E_STRAPI_TOKEN is required after complete disposable live authority");
  }
  return token;
}

export const musicLiveTest = base.extend<{
  musicLiveAuthority: ReturnType<typeof assertLiveWriteAuthority>;
}>({
  musicLiveAuthority: [async ({ browserName }, use, testInfo) => {
    void browserName;
    const reason = musicLiveWriteSkipReason();
    testInfo.skip(Boolean(reason), reason ?? "Complete disposable live-write authority is required.");
    const authority = assertLiveWriteAuthority(musicLiveAuthorityFromEnvironment());
    await use(authority);
  }, { auto: true }],
});

export function buildPermissionMatrix(): MusicPermissionRow[] {
  return Array.from({ length: 32 }, (_, mask) => {
    const bits = mask.toString(2).padStart(5, "0");
    return {
      key: bits,
      allowSongRequests: bits[0] === "1",
      allowGuestPlayOnDevice: bits[1] === "1",
      allowPlaylistSharing: bits[2] === "1",
      allowRecentlyPlayedVisibility: bits[3] === "1",
      allowQueueVisibility: bits[4] === "1",
    };
  });
}

export function buildPairwisePermissionMatrix(): MusicPermissionRow[] {
  const keys = ["allowSongRequests", "allowGuestPlayOnDevice", "allowPlaylistSharing", "allowRecentlyPlayedVisibility", "allowQueueVisibility"] as const;
  const uncovered = new Set<string>();
  for (let left = 0; left < keys.length; left += 1) for (let right = left + 1; right < keys.length; right += 1) {
    for (const a of [false, true]) for (const b of [false, true]) uncovered.add(`${left}:${a}-${right}:${b}`);
  }
  const selected: MusicPermissionRow[] = [];
  for (const row of buildPermissionMatrix()) {
    const covers: string[] = [];
    for (let left = 0; left < keys.length; left += 1) for (let right = left + 1; right < keys.length; right += 1) {
      covers.push(`${left}:${row[keys[left]!]}-${right}:${row[keys[right]!]}`);
    }
    if (covers.some((pair) => uncovered.has(pair))) {
      selected.push(row);
      covers.forEach((pair) => uncovered.delete(pair));
    }
    if (uncovered.size === 0) break;
  }
  if (uncovered.size > 0) throw new Error(`Pairwise Music permission matrix is incomplete: ${[...uncovered].join(",")}`);
  return selected;
}

const VOLATILE_SNAPSHOT_KEYS = new Set(["capturedAt", "requestId", "snapshotId", "updatedAt", "createdAt", "revision", "queueRevision", "playbackRevision", "preferenceRevision", "profileRevision"]);

function canonicalSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSnapshotValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !VOLATILE_SNAPSHOT_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalSnapshotValue(nested)]),
  );
}

export function normalizedSnapshotHash(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalSnapshotValue(snapshot))).digest("hex");
}

export const MUSIC_LIVE_ACCOUNT_SNAPSHOT_VERSION = "music-live-account-snapshot/v1" as const;

export interface CanonicalMusicAccountSnapshot {
  version: typeof MUSIC_LIVE_ACCOUNT_SNAPSHOT_VERSION;
  snapshotId: string;
  publication: { coveredByDatabaseDump: true };
  guestControls: { coveredByDatabaseDump: true };
  queue: { coveredByDatabaseDump: true };
  playlists: { coveredByDatabaseDump: true };
  requests: { coveredByDatabaseDump: true };
  profile: { accountDocumentId: string; publicMusic: boolean; profileRevision: number; profileHash: string; fieldCount: number };
  database: { namespace: string; dumpHash: string; identityRows: number };
}

function requiredRecord(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`canonical Music snapshot requires ${key}`);
  return value as Record<string, unknown>;
}

export function assertCanonicalMusicAccountSnapshot(value: unknown): asserts value is CanonicalMusicAccountSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("canonical Music snapshot is missing");
  const source = value as Record<string, unknown>;
  if (source.version !== MUSIC_LIVE_ACCOUNT_SNAPSHOT_VERSION) throw new Error("canonical Music snapshot version is invalid");
  if (typeof source.snapshotId !== "string" || !source.snapshotId) throw new Error("canonical Music snapshot requires a restore identifier");
  const publication = requiredRecord(source, "publication");
  if (publication.coveredByDatabaseDump !== true) {
    throw new Error("canonical Music snapshot requires complete publication lifecycle state");
  }
  if (requiredRecord(source, "guestControls").coveredByDatabaseDump !== true) throw new Error("canonical Music snapshot requires guest controls in the full database dump");
  const queue = requiredRecord(source, "queue");
  if (queue.coveredByDatabaseDump !== true) {
    throw new Error("canonical Music snapshot requires queue, player, and history state");
  }
  if (requiredRecord(source, "playlists").coveredByDatabaseDump !== true) throw new Error("canonical Music snapshot requires playlists in the full database dump");
  const requests = requiredRecord(source, "requests");
  if (requests.coveredByDatabaseDump !== true) {
    throw new Error("canonical Music snapshot requires requests, idempotency receipts, and rate state in the full database dump");
  }
  const profile = requiredRecord(source, "profile");
  if (typeof profile.accountDocumentId !== "string" || typeof profile.publicMusic !== "boolean"
      || !Number.isSafeInteger(profile.profileRevision) || !/^[a-f0-9]{64}$/.test(String(profile.profileHash))
      || !Number.isSafeInteger(profile.fieldCount) || Number(profile.fieldCount) < 1 || Number(profile.fieldCount) > 128) {
    throw new Error("canonical Music snapshot requires complete Strapi profile state");
  }
  const database = requiredRecord(source, "database");
  if (typeof database.namespace !== "string" || !/^e2e-public-music-[a-z0-9-]+$/.test(database.namespace)
      || !/^[a-f0-9]{64}$/.test(String(database.dumpHash))
      || !Number.isSafeInteger(database.identityRows) || ![0, 1].includes(Number(database.identityRows))) {
    throw new Error("canonical Music snapshot requires the complete disposable database namespace");
  }
}

export function createCanonicalMusicFixtureAdapter(dependencies: {
  readFullSnapshot: () => Promise<unknown>;
  resetNamespace: (snapshot: CanonicalMusicAccountSnapshot) => Promise<void>;
}) {
  return {
    snapshot: async (): Promise<CanonicalMusicAccountSnapshot> => {
      const snapshot = await dependencies.readFullSnapshot();
      assertCanonicalMusicAccountSnapshot(snapshot);
      return snapshot;
    },
    cleanupNamespace: async (): Promise<void> => undefined,
    restore: async (snapshot: unknown): Promise<void> => {
      assertCanonicalMusicAccountSnapshot(snapshot);
      await dependencies.resetNamespace(snapshot);
    },
  };
}

export function canonicalMusicFixtureAdapterFromEnvironment() {
  const serviceUrl = process.env.MUSIC_E2E_STATE_SERVICE_URL;
  const token = process.env.MUSIC_E2E_STATE_TOKEN;
  if (!serviceUrl || !token || !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(serviceUrl)) {
    throw new Error("canonical Music state service authority is unavailable");
  }
  const call = async (path: "/snapshot" | "/restore", body?: unknown) => {
    const response = await fetch(`${serviceUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`canonical Music state service failed ${path}: ${response.status}`);
    return response.json();
  };
  return createCanonicalMusicFixtureAdapter({
    readFullSnapshot: () => call("/snapshot"),
    resetNamespace: async (snapshot) => { await call("/restore", snapshot); },
  });
}

function sanitizedUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/capability|token|credential|authorization/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString().replace(/\/$/, "");
}

export function buildSanitizedFixtureEvidence(input: {
  runId: string;
  lane: MusicTestLane;
  accountDocumentId: string;
  username: string;
  explorerUrl: string;
  shareUrl: string;
  result: "passed" | "failed" | "skipped";
  cleanup: "restored" | "failed" | "not-required";
  evidencePath: string;
}) {
  return {
    version: MUSIC_PUBLIC_FIXTURE_VERSION,
    runId: input.runId.replace(/[^a-zA-Z0-9_-]/g, "-"),
    lane: input.lane,
    accountDocumentId: input.accountDocumentId,
    username: input.username,
    explorerUrl: sanitizedUrl(input.explorerUrl),
    shareUrl: sanitizedUrl(input.shareUrl),
    result: input.result,
    cleanup: input.cleanup,
    evidencePath: input.evidencePath.replace(/\\/g, "/"),
  } as const;
}

export type LivePublicJourneyControls = {
  allowSongRequests: boolean;
  allowGuestPlayOnDevice: boolean;
  allowPlaylistSharing: boolean;
  allowRecentlyPlayedVisibility: boolean;
  allowQueueVisibility: boolean;
};

export type LivePublicJourneyResponse = { status: number; body?: unknown };

export const LIVE_PUBLIC_JOURNEY_FAILURE_STAGES = [
  "owner-dashboard",
  "private-transition",
  "private-dashboard",
  "playlist",
  "saved-song-1",
  "saved-song-2",
  "saved-song-3",
  "visibility",
  "queue",
  "playback-1",
  "playback-2",
  "controls",
  "profile",
  "publication",
  "public-resource",
  "guest-control-visible",
] as const;

export type LivePublicJourneyFailureStage = typeof LIVE_PUBLIC_JOURNEY_FAILURE_STAGES[number];
export type LivePublicJourneyFailureCode = "operation-failed" | "http-failed" | "contract-invalid" | "assertion-failed";

export class LivePublicJourneyFailure extends Error {
  readonly stage: LivePublicJourneyFailureStage;
  readonly code: LivePublicJourneyFailureCode;

  constructor(stage: LivePublicJourneyFailureStage, code: LivePublicJourneyFailureCode) {
    super("Live public permission journey failed");
    this.name = "LivePublicJourneyFailure";
    this.stage = stage;
    this.code = code;
  }
}

export const LIVE_RECONNECT_JOURNEY_FAILURE_STAGES = LIVE_RECONNECT_FAILURE_STAGES;
export type LiveReconnectJourneyFailureStage = typeof LIVE_RECONNECT_JOURNEY_FAILURE_STAGES[number];
export type LiveReconnectJourneyFailureCode = "operation-failed" | "operation-timeout" | "http-failed" | "contract-invalid" | "assertion-failed";

export class LiveReconnectJourneyFailure extends Error {
  readonly stage: LiveReconnectJourneyFailureStage;
  readonly code: LiveReconnectJourneyFailureCode;

  constructor(stage: LiveReconnectJourneyFailureStage, code: LiveReconnectJourneyFailureCode) {
    super("Live public reconnect journey failed");
    this.name = "LiveReconnectJourneyFailure";
    this.stage = stage;
    this.code = code;
  }
}

export { LIVE_PROFILE_BATCH_FAILURE_CODES, LIVE_PROFILE_BATCH_FAILURE_STAGES };
export type LiveProfileBatchFailureStage = typeof LIVE_PROFILE_BATCH_FAILURE_STAGES[number];
export type LiveProfileBatchFailureCode = typeof LIVE_PROFILE_BATCH_FAILURE_CODES[number];

export class LiveProfileBatchFailure extends Error {
  readonly stage: LiveProfileBatchFailureStage;
  readonly code: LiveProfileBatchFailureCode;
  readonly rowOrdinal: number;
  readonly completedRows: number;

  constructor(
    stage: LiveProfileBatchFailureStage,
    code: LiveProfileBatchFailureCode,
    rowOrdinal: number,
    completedRows: number,
  ) {
    super("Live profile batch journey failed");
    const rowStage = String(stage).startsWith("row-");
    if (!LIVE_PROFILE_BATCH_FAILURE_STAGES.includes(stage)
        || !LIVE_PROFILE_BATCH_FAILURE_CODES.includes(code)
        || !Number.isSafeInteger(rowOrdinal)
        || !Number.isSafeInteger(completedRows)
        || (rowStage
          ? (rowOrdinal < 1 || rowOrdinal > 12 || completedRows !== rowOrdinal - 1)
          : (rowOrdinal !== 0 || completedRows !== 0))) {
      throw new Error("Live profile batch failure input is invalid");
    }
    this.name = "LiveProfileBatchFailure";
    this.stage = stage;
    this.code = code;
    this.rowOrdinal = rowOrdinal;
    this.completedRows = completedRows;
  }
}

const LIVE_PERMISSION_JOURNEY_ID_SET = new Set<string>(LIVE_PERMISSION_JOURNEY_IDS);

export async function assertLivePermissionGuestControlVisible(assertion: () => Promise<void>): Promise<void> {
  try {
    await assertion();
  } catch {
    throw new LivePublicJourneyFailure("guest-control-visible", "assertion-failed");
  }
}

export function assertLivePublicSlug(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(value) || value === "qualification-public") {
    throw new Error("Fixture publication did not return a valid live returned public slug");
  }
}

export async function readLiveCanonicalPublicRevision(input: {
  publicSlug: string;
  stage: "initial-canonical-resource" | "online-canonical-apply";
  read: (path: string) => Promise<LivePublicJourneyResponse>;
}): Promise<number> {
  try {
    assertLivePublicSlug(input.publicSlug);
  } catch {
    throw new LiveReconnectJourneyFailure(input.stage, "contract-invalid");
  }
  let response: LivePublicJourneyResponse;
  try {
    response = await input.read(`/api/music/public-resource/v1/${encodeURIComponent(input.publicSlug)}`);
  } catch {
    throw new LiveReconnectJourneyFailure(input.stage, "operation-failed");
  }
  if (!response || typeof response !== "object" || response.status !== 200) {
    throw new LiveReconnectJourneyFailure(input.stage, "http-failed");
  }
  const body = recordValue(response.body);
  if (!body || !exactRecord(body, [
    "version", "revision", "user", "permissions", "currentlyPlaying", "queue", "recentlyPlayed", "playlists",
  ]) || body.version !== "music-public-resource/v1"
      || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) {
    throw new LiveReconnectJourneyFailure(input.stage, "contract-invalid");
  }
  return Number(body.revision);
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).sort().join("\0") === [...keys].sort().join("\0");
}

async function stageResponse(
  stage: LivePublicJourneyFailureStage,
  status: number,
  operation: () => Promise<LivePublicJourneyResponse>,
): Promise<LivePublicJourneyResponse> {
  let response: LivePublicJourneyResponse;
  try {
    response = await operation();
  } catch {
    throw new LivePublicJourneyFailure(stage, "operation-failed");
  }
  if (!response || typeof response !== "object" || response.status !== status) {
    throw new LivePublicJourneyFailure(stage, "http-failed");
  }
  return response;
}

async function stageRecord(
  stage: LivePublicJourneyFailureStage,
  status: number,
  operation: () => Promise<LivePublicJourneyResponse>,
): Promise<Record<string, unknown>> {
  const response = await stageResponse(stage, status, operation);
  if (!response.body || typeof response.body !== "object" || Array.isArray(response.body)) {
    throw new LivePublicJourneyFailure(stage, "contract-invalid");
  }
  return response.body as Record<string, unknown>;
}

function contract(stage: LivePublicJourneyFailureStage, condition: unknown): asserts condition {
  if (!condition) throw new LivePublicJourneyFailure(stage, "contract-invalid");
}

const FRESH_GUEST_CONTROLS: LivePublicJourneyControls = {
  allowSongRequests: true,
  allowGuestPlayOnDevice: true,
  allowPlaylistSharing: false,
  allowRecentlyPlayedVisibility: true,
  allowQueueVisibility: false,
};

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function itemsContainValue(value: unknown, key: string, expected: string): boolean {
  const record = recordValue(value);
  return Array.isArray(record?.items)
    && record.items.some((item) => recordValue(item)?.[key] === expected);
}

function freshDashboard(
  stage: "owner-dashboard" | "private-dashboard",
  dashboard: Record<string, unknown>,
  mode: "unlisted" | "private",
  expectedSlug?: string,
): string {
  contract(stage, exactRecord(dashboard, [
    "queueRevision", "playbackRevision", "songs", "currentlyPlaying", "playedSongs", "publication", "guestControls",
  ]));
  const publication = dashboard.publication;
  const guestControls = dashboard.guestControls;
  contract(stage, exactRecord(publication, ["mode", "publicSlug"]));
  contract(stage, exactRecord(guestControls, Object.keys(FRESH_GUEST_CONTROLS)));
  contract(stage, dashboard.queueRevision === 0 && dashboard.playbackRevision === 0
    && Array.isArray(dashboard.songs) && dashboard.songs.length === 0
    && dashboard.currentlyPlaying === null
    && Array.isArray(dashboard.playedSongs) && dashboard.playedSongs.length === 0
    && publication.mode === mode
    && Object.entries(FRESH_GUEST_CONTROLS).every(([key, value]) => guestControls[key] === value));
  try {
    assertLivePublicSlug(publication.publicSlug);
  } catch {
    throw new LivePublicJourneyFailure(stage, "contract-invalid");
  }
  contract(stage, expectedSlug === undefined || publication.publicSlug === expectedSlug);
  return publication.publicSlug;
}

export async function prepareLivePublicMusicJourney(input: {
  seedId: string;
  privatePublicationIdempotencyKey: string;
  publicationIdempotencyKey: string;
  controls: LivePublicJourneyControls;
  read: (path: string) => Promise<LivePublicJourneyResponse>;
  updatePublicProfile: () => Promise<LivePublicJourneyResponse>;
  mutate: (callsite: MusicMutationCallsite, request: {
    method: "POST" | "PATCH";
    path: string;
    data: unknown;
    idempotencyKey?: string;
  }) => Promise<LivePublicJourneyResponse>;
}): Promise<{
  publicSlug: string;
  playlistId: number;
  playlistName: string;
  songs: { history: number; playing: number; queued: number };
}> {
  if (!/^[a-z0-9]{8}$/.test(input.seedId)
      || !/^tunes-share-v1-\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.privatePublicationIdempotencyKey)
      || !/^tunes-share-v1-\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.publicationIdempotencyKey)
      || input.privatePublicationIdempotencyKey === input.publicationIdempotencyKey
      || Object.keys(input.controls).sort().join("\0") !== [
        "allowGuestPlayOnDevice", "allowPlaylistSharing", "allowQueueVisibility",
        "allowRecentlyPlayedVisibility", "allowSongRequests",
      ].join("\0")
      || Object.values(input.controls).some((value) => typeof value !== "boolean")) {
    throw new Error("Live fixture preparation input is invalid");
  }
  const ownerDashboard = await stageRecord("owner-dashboard", 200, () => input.read("/api/music/dashboard"));
  const publicSlug = freshDashboard("owner-dashboard", ownerDashboard, "unlisted");
  const privatePublication = await stageRecord("private-transition", 200, () => input.mutate("owner-publication", {
    method: "POST", path: "/api/music/publication", data: { mode: "private" },
    idempotencyKey: input.privatePublicationIdempotencyKey,
  }));
  const privatePublicationState = privatePublication.publication;
  contract("private-transition", exactRecord(privatePublication, ["version", "publication"])
    && privatePublication.version === "music-publication/v1"
    && exactRecord(privatePublicationState, ["mode", "publicSlug"])
    && privatePublicationState.mode === "private"
    && privatePublicationState.publicSlug === publicSlug);
  const dashboard = await stageRecord("private-dashboard", 200, () => input.read("/api/music/dashboard"));
  freshDashboard("private-dashboard", dashboard, "private", publicSlug);

  const playlistName = `Fixture public ${input.seedId}`;
  const playlist = await stageRecord("playlist", 201, () => input.mutate("playlist-create", {
    method: "POST",
    path: "/api/playlists",
    data: { name: playlistName, description: "Canonical guest journey prerequisites" },
    idempotencyKey: `fixture-playlist-${input.seedId}`,
  }));
  contract("playlist", typeof playlist.id === "number" && Number.isSafeInteger(playlist.id) && playlist.id > 0);

  const songInputs = [
    { youtubeId: "abcdefghijk", title: "Fixture history song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png" },
    { youtubeId: "lmnopqrstuv", title: "Fixture playing song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png" },
    { youtubeId: "wxyzABC1234", title: "Fixture queued song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png" },
  ];
  const songIds: number[] = [];
  for (const [index, song] of songInputs.entries()) {
    const stage = `saved-song-${index + 1}` as "saved-song-1" | "saved-song-2" | "saved-song-3";
    const saved = await stageRecord(stage, 201, () => input.mutate("playlist-song-add", {
      method: "POST",
      path: `/api/playlists/${playlist.id}/songs`,
      data: song,
      idempotencyKey: `fixture-song-${input.seedId}-${index + 1}`,
    }));
    contract(stage, typeof saved.id === "number" && Number.isSafeInteger(saved.id) && saved.id > 0 && !songIds.includes(saved.id));
    songIds.push(saved.id);
  }

  await stageResponse("visibility", 204, () => input.mutate("playlist-visibility", {
    method: "PATCH", path: `/api/playlists/${playlist.id}/visibility`, data: { isVisibleToGuests: true },
    idempotencyKey: `fixture-visibility-${input.seedId}`,
  }));

  const queued = await stageRecord("queue", 200, () => input.mutate("queue-replace", {
    method: "POST",
    path: "/api/music/queue/replace",
    data: { expectedRevision: dashboard.queueRevision, songs: songIds.map((songId) => ({ playlistId: playlist.id, songId })) },
    idempotencyKey: `fixture-queue-${input.seedId}`,
  }));
  const queuedSongs = queued.songs;
  contract("queue", exactRecord(queued, ["version", "revision", "songs"])
    && queued.version === "music-queue/v1" && queued.revision === 1
    && Array.isArray(queuedSongs) && queuedSongs.length === 3);
  const queueSongIds: number[] = [];
  let queueUserId: number | undefined;
  for (const [index, queueSong] of queuedSongs.entries()) {
    contract("queue", exactRecord(queueSong, [
      "id", "userId", "youtubeId", "title", "artist", "thumbnailUrl", "position", "status", "playedAt",
    ]) && typeof queueSong.id === "number" && Number.isSafeInteger(queueSong.id) && queueSong.id > 0 && !queueSongIds.includes(queueSong.id)
      && typeof queueSong.userId === "number" && Number.isSafeInteger(queueSong.userId) && queueSong.userId > 0
      && (queueUserId === undefined || queueSong.userId === queueUserId)
      && queueSong.youtubeId === songInputs[index]!.youtubeId
      && queueSong.title === songInputs[index]!.title
      && queueSong.artist === songInputs[index]!.artist
      && queueSong.thumbnailUrl === songInputs[index]!.thumbnailUrl
      && queueSong.position === index && queueSong.status === "queued" && queueSong.playedAt === null);
    queueUserId ??= queueSong.userId as number;
    queueSongIds.push(queueSong.id as number);
  }

  const firstPlayback = await stageRecord("playback-1", 200, () => input.mutate("player-update", {
    method: "POST",
    path: "/api/playlist/currently-playing",
    data: { songId: queueSongIds[0], expectedRevision: queued.revision, expectedPlaybackRevision: dashboard.playbackRevision },
    idempotencyKey: `fixture-playback-${input.seedId}-1`,
  }));
  contract("playback-1", firstPlayback.version === "music-playback/v1"
    && typeof firstPlayback.revision === "number" && Number.isSafeInteger(firstPlayback.revision)
    && typeof firstPlayback.playbackRevision === "number" && Number.isSafeInteger(firstPlayback.playbackRevision)
    && recordValue(firstPlayback.song)?.id === queueSongIds[0]);
  const secondPlayback = await stageRecord("playback-2", 200, () => input.mutate("player-update", {
    method: "POST",
    path: "/api/playlist/currently-playing",
    data: { songId: queueSongIds[1], expectedRevision: firstPlayback.revision, expectedPlaybackRevision: firstPlayback.playbackRevision },
    idempotencyKey: `fixture-playback-${input.seedId}-2`,
  }));
  contract("playback-2", secondPlayback.version === "music-playback/v1"
    && typeof secondPlayback.revision === "number" && Number.isSafeInteger(secondPlayback.revision)
    && typeof secondPlayback.playbackRevision === "number" && Number.isSafeInteger(secondPlayback.playbackRevision)
    && recordValue(secondPlayback.song)?.id === queueSongIds[1]);

  const controls = await stageRecord("controls", 200, () => input.mutate("guest-controls", {
    method: "PATCH", path: "/api/music/guest-controls", data: input.controls,
    idempotencyKey: `fixture-controls-${input.seedId}`,
  }));
  contract("controls", exactRecord(controls, Object.keys(input.controls))
    && Object.entries(input.controls).every(([key, value]) => controls[key] === value));
  const profileUpdate = await stageRecord("profile", 200, input.updatePublicProfile);
  contract("profile", recordValue(recordValue(profileUpdate.data)?.updateAccount)?.public_music === "Yes");
  const publication = await stageRecord("publication", 200, () => input.mutate("owner-publication", {
    method: "POST", path: "/api/music/publication", data: { mode: "public" },
    idempotencyKey: input.publicationIdempotencyKey,
  }));
  const publicationState = publication.publication;
  contract("publication", exactRecord(publication, ["version", "publication"])
    && publication.version === "music-publication/v1"
    && exactRecord(publicationState, ["mode", "publicSlug"])
    && publicationState.mode === "public" && publicationState.publicSlug === publicSlug);

  const publicResource = await stageRecord("public-resource", 200,
    () => input.read(`/api/music/public-resource/v1/${encodeURIComponent(publicSlug)}`));
  const permissions = recordValue(publicResource.permissions);
  contract("public-resource", publicResource.version === "music-public-resource/v1"
      && !(input.controls.allowGuestPlayOnDevice && recordValue(publicResource.currentlyPlaying)?.title !== songInputs[1].title)
      && !(input.controls.allowQueueVisibility
        && !itemsContainValue(publicResource.queue, "title", songInputs[2].title))
      && !(input.controls.allowRecentlyPlayedVisibility
        && !itemsContainValue(publicResource.recentlyPlayed, "title", songInputs[0].title))
      && !(input.controls.allowPlaylistSharing
        && !itemsContainValue(publicResource.playlists, "name", playlistName))
      && permissions !== undefined
      && !Object.entries(input.controls).some(([key, enabled]) => permissions[key] !== enabled));
  return { publicSlug, playlistId: playlist.id, playlistName, songs: { history: queueSongIds[0]!, playing: queueSongIds[1]!, queued: queueSongIds[2]! } };
}

export async function withRestoredMusicFixture<T>(adapters: {
  journeyId?: string;
  journeyRows?: readonly unknown[];
  snapshot: () => Promise<unknown>;
  cleanupNamespace: () => Promise<void>;
  restore: (snapshot: unknown) => Promise<void>;
  writeRecoveryArtifact?: (artifact: { reason: string; beforeHash: string; afterHash?: string }) => Promise<void>;
  writeJourneyResult?: (record: unknown) => Promise<void>;
  onBodyFailureAfterRestore?: () => Promise<void>;
}, journey: () => Promise<T>): Promise<{
  value: T;
  cleanup: "restored";
  beforeHash: string;
  afterHash: string;
}> {
  const live = process.env.MUSIC_E2E_LIVE_WRITE === "true";
  if (live) {
    const { journeyId, journeyRows, writeJourneyResult, onBodyFailureAfterRestore } = adapters;
    adapters = { ...canonicalMusicFixtureAdapterFromEnvironment(), journeyId, journeyRows, writeJourneyResult, onBodyFailureAfterRestore };
  }
  const before = await adapters.snapshot();
  const beforeHash = normalizedSnapshotHash(before);
  const writeRecoveryArtifact = async (artifact: { reason: string; beforeHash: string; afterHash?: string }) => {
    if (adapters.writeRecoveryArtifact) return adapters.writeRecoveryArtifact(artifact);
    if (live) {
      const stage = artifact.reason === "restore-mismatch" ? "verification"
        : (artifact.reason === "cleanup-failed" ? "cleanup" : "restore");
      await blockDurableMusicMutations(artifact.reason, stage);
      return;
    }
    const recoveryPath = process.env.MUSIC_E2E_RECOVERY_ARTIFACT_PATH
      ?? `.artifacts/music-public/recovery-${process.pid}.json`;
    mkdirSync(dirname(recoveryPath), { recursive: true });
    writeFileSync(recoveryPath, `${JSON.stringify({ version: MUSIC_PUBLIC_FIXTURE_VERSION, ...artifact }, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  };
  let value!: T;
  let journeyFailure: unknown;
  let restorationFailure: unknown;
  let terminalWritten = false;
  const writeTerminal = async (record: unknown) => {
    if (terminalWritten) throw new Error("Live journey terminal already written");
    terminalWritten = true;
    const restoreEvidencePath = process.env.MUSIC_E2E_RESTORE_EVIDENCE_PATH;
    if (adapters.writeJourneyResult) await adapters.writeJourneyResult(record);
    else if (restoreEvidencePath) {
      mkdirSync(dirname(restoreEvidencePath), { recursive: true });
      appendFileSync(restoreEvidencePath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    } else if (live && adapters.journeyId) {
      throw new Error("MUSIC_E2E_RESTORE_EVIDENCE_PATH is required for manifested live journeys");
    }
  };
  try {
    value = await journey();
  } catch (error) {
    journeyFailure = error;
  } finally {
    let cleanupFailure: unknown;
    try {
      await adapters.cleanupNamespace();
    } catch (error) {
      cleanupFailure = error;
    }
    try {
      await adapters.restore(before);
    } catch (restoreError) {
      liveMutationBlockedReason = "restore-failed";
      await writeRecoveryArtifact({ reason: "restore-failed", beforeHash });
      restorationFailure = restoreError;
    }
    if (!restorationFailure && cleanupFailure) {
      liveMutationBlockedReason = "cleanup-failed";
      await writeRecoveryArtifact({ reason: "cleanup-failed", beforeHash });
      restorationFailure = cleanupFailure;
    }
  }
  if (restorationFailure) {
    if (adapters.journeyId) await writeTerminal(buildLiveJourneyTerminal({
      id: adapters.journeyId,
      status: "failed",
      reason: liveMutationBlockedReason === "cleanup-failed" ? "cleanup-failed" : "restore-failed",
      stage: liveMutationBlockedReason === "cleanup-failed" ? "cleanup" : "restore",
      cleanup: "failed",
      beforeHash,
      rows: adapters.journeyRows,
    }));
    throw restorationFailure;
  }
  let afterHash: string;
  try {
    afterHash = normalizedSnapshotHash(await adapters.snapshot());
  } catch (verificationError) {
    liveMutationBlockedReason = "restore-failed";
    await writeRecoveryArtifact({ reason: "restore-failed", beforeHash });
    if (adapters.journeyId) await writeTerminal(buildLiveJourneyTerminal({
      id: adapters.journeyId, status: "failed", reason: "restore-failed", stage: "restore",
      cleanup: "failed", beforeHash,
      rows: adapters.journeyRows,
    }));
    throw verificationError;
  }
  if (afterHash !== beforeHash) {
    liveMutationBlockedReason = "restore-mismatch";
    await writeRecoveryArtifact({ reason: "restore-mismatch", beforeHash, afterHash });
    if (adapters.journeyId) await writeTerminal(buildLiveJourneyTerminal({
      id: adapters.journeyId, status: "failed", reason: "restore-mismatch", stage: "verification",
      cleanup: "failed", beforeHash, afterHash,
      rows: adapters.journeyRows,
    }));
    throw new Error(`Public Music fixture restoration mismatch: before=${beforeHash} after=${afterHash}`);
  }
  if (journeyFailure) {
    if (adapters.onBodyFailureAfterRestore) await adapters.onBodyFailureAfterRestore();
    const permissionFailure = journeyFailure instanceof LivePublicJourneyFailure
      && adapters.journeyId && LIVE_PERMISSION_JOURNEY_ID_SET.has(adapters.journeyId)
      ? { stage: journeyFailure.stage, code: journeyFailure.code }
      : undefined;
    const reconnectFailure = journeyFailure instanceof LiveReconnectJourneyFailure
      && adapters.journeyId === "music.owner-guest.reconnect"
      ? { stage: journeyFailure.stage, code: journeyFailure.code }
      : undefined;
    const profileBatchFailure = journeyFailure instanceof LiveProfileBatchFailure
      && adapters.journeyId?.startsWith("profile.owner.pairwise.batch-")
      ? {
        stage: journeyFailure.stage,
        code: journeyFailure.code,
        rowOrdinal: journeyFailure.rowOrdinal,
        completedRows: journeyFailure.completedRows,
      }
      : undefined;
    if (adapters.journeyId) await writeTerminal(buildLiveJourneyTerminal({
      id: adapters.journeyId, status: "failed", reason: "body-failed", stage: "body",
      cleanup: "restored", beforeHash, afterHash, rows: adapters.journeyRows,
      permissionFailure, reconnectFailure, profileBatchFailure,
    }));
    throw journeyFailure;
  }
  if (adapters.journeyId) {
    const record = buildLiveJourneyResult({ id: adapters.journeyId, beforeHash, afterHash, rows: adapters.journeyRows });
    await writeTerminal(record);
  }
  return { value, cleanup: "restored", beforeHash, afterHash };
}

export const completeMusicAccount = {
  __typename: "Account",
  documentId: "account-document-qualification",
  Account_Name: "Qualification Fixture",
  Account_Type: "Personal",
  mobile_number: "+15555550123",
  profile_picture: null,
  public_profile: "Yes",
  public_recommendations: "No",
  public_music: "No",
  public_guides: "No",
  public_movie: "No",
  public_books: "No",
  public_games: "No",
  public_apps: "No",
  public_products: "No",
  public_people: "No",
  pinned_nav_tabs: [],
  auto_pinning: true,
};

export interface MusicQualificationMockOptions {
  provider?: "local" | "google";
  confirmed?: boolean;
  accounts?: Array<Record<string, unknown>>;
  ensureStatus?: number;
  ensureCode?: string;
  ensureFailures?: number;
  playlists?: Array<Record<string, unknown>>;
  ownerExpiredFailures?: number;
  holdEnsure?: boolean;
  ownerWorkspace?: boolean;
}

export async function installMusicQualificationMocks(page: Page, options: MusicQualificationMockOptions = {}) {
  const canonicalMusicPath = (rawUrl: string) => new URL(rawUrl).pathname.replace(/^\/__localtunes(?=\/api\/)/, "");
  let ensureCalls = 0;
  let strapiCalls = 0;
  let playlists = (options.playlists ?? []).map((playlist) => ({ ...playlist }));
  let publicationMode: "private" | "unlisted" | "public" = options.accounts?.[0]?.public_music === "Yes" ? "public" : "private";
  const publicationCommands: Array<{ body: { mode: string }; idempotencyKey: string | null }> = [];
  const requests: Array<{
    method: string;
    path: string;
    authorization: string | undefined;
    xUsername: string | undefined;
    body?: unknown;
    idempotencyKey?: string;
  }> = [];
  const credential = "fixture-browser-initial-music-credential";
  const renewedCredential = "fixture-browser-renewed-music-credential";
  let accountStates = (options.accounts ?? [completeMusicAccount]).map((account) => ({ ...account }));
  let markEnsureStarted!: () => void;
  const ensureStarted = new Promise<void>((resolveStarted) => { markEnsureStarted = resolveStarted; });
  let releaseHeldEnsure!: () => void;
  const heldEnsure = new Promise<void>((resolveHeld) => { releaseHeldEnsure = resolveHeld; });

  // The canonical account gates the dashboard independently of the Music
  // eligibility/provider/lifecycle fault scenarios in this synthetic fixture. It has to
  // be durable across read and write: publishing Music commits `public_music` through
  // PATCH /api/explorers/v1/account and re-reads to confirm it, so a fixture that
  // always replied with the seed would report the publication unconfirmed.
  // An Explorer who cannot use Music must not get a Music identity provisioned, and
  // under ADR-006 the canonical account is what says so: an unconfirmed profile and an
  // absent Explorer account both mean onboarding is unfinished, which is exactly the
  // "Finish your Explorer profile to use Music." state these cases render. The legacy
  // `confirmed` flag and the GraphQL accounts list are the retiring Strapi expression of
  // the same condition, so the canonical account is kept consistent with them here
  // rather than letting the two disagree.
  const canonicallyEligible = (options.confirmed ?? true) && (options.accounts ?? [completeMusicAccount]).length > 0;
  let canonicalAccount = canonicalCategoryAccount({
    handle: "testuser",
    ...(canonicallyEligible ? {} : { onboardingStatus: "incomplete" as const }),
  });

  await page.route("**/api/explorers/v1/me", route => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).origin !== new URL(String(base.info().project.use.baseURL)).origin) return route.abort("blockedbyclient");
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ account: canonicalAccount }),
    });
  });

  // The navigation client no longer issues the legacy UpdateTabVisibility mutation; it
  // writes the whole canonical preference set through this one command.
  await page.route("**/api/explorers/v1/account", async route => {
    const request = route.request();
    if (request.method() !== "PATCH") return route.abort("blockedbyclient");
    const patch = request.postDataJSON() as {
      expectedRevision?: number;
      categories?: Array<{ category: string; isPublic: boolean; displayOrder: number; pinnedOrder: number | null }>;
      autoPinning?: boolean;
    };
    if (patch.expectedRevision !== canonicalAccount.revision) {
      return route.fulfill({
        status: 409, contentType: "application/json",
        body: JSON.stringify({ error: { code: "CONFLICT", message: "Fixture revision moved.", requestId: "music-qualification-account" } }),
      });
    }
    canonicalAccount = {
      ...canonicalAccount,
      revision: canonicalAccount.revision + 1,
      ...(patch.categories ? { categories: patch.categories.map(row => ({ ...row })) } : {}),
      ...(patch.autoPinning === undefined ? {} : { autoPinning: patch.autoPinning }),
    };
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ account: canonicalAccount }),
    });
  });

  await page.route("**/graphql", async (route) => {
    strapiCalls += 1;
    const payload = route.request().postDataJSON();
    const query = payload?.query ?? "";
    if (query.includes("updateAccount")) {
      const accountState = { ...(accountStates[0] ?? completeMusicAccount), ...(payload?.variables?.data ?? {}) };
      accountStates = [accountState, ...accountStates.slice(1)];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { updateAccount: accountState } }),
      });
      return;
    }
    if (query.includes("usersPermissionsUser")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { usersPermissionsUser: {
          __typename: "UsersPermissionsUser",
          documentId: "mock-user-123",
          username: "testuser",
          email: "test@explorers.earth",
          razorpay_customer_id: null,
          provider: options.provider ?? "local",
          confirmed: options.confirmed ?? true,
          blocked: false,
          accounts: accountStates,
        } } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) });
  });

  await page.route(ENSURE_ROUTE, async (route) => {
    ensureCalls += 1;
    markEnsureStarted();
    requests.push({
      method: route.request().method(),
      path: canonicalMusicPath(route.request().url()),
      authorization: route.request().headers().authorization,
      xUsername: route.request().headers()["x-username"],
    });
    if (options.holdEnsure) await heldEnsure;
    if (ensureCalls <= (options.ensureFailures ?? 0) || (options.ensureStatus ?? 200) !== 200) {
      await route.fulfill({
        status: options.ensureStatus ?? 503,
        contentType: "application/json",
        headers: { "retry-after": "1" },
        body: JSON.stringify({
          version: "music-error/v1",
          error: {
            code: options.ensureCode ?? "UPSTREAM_UNAVAILABLE",
            message: "Contained fixture failure.",
            action: "retry",
            retryable: (options.ensureStatus ?? 503) >= 500,
            requestId: "qualification-request",
          },
        }),
      });
      return;
    }
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          credential: {
            token: (options.ownerExpiredFailures ?? 0) > 0 && ensureCalls > 1
              ? renewedCredential
              : credential,
            expiresAt: Date.now() + 600_000,
          },
        }),
      });
    } catch {
      if (!page.isClosed()) throw new Error("identity ensure fulfillment failed before browser exit");
    }
  });

  await page.route("**/api/music/public-profile/*", async (route) => {
    if (publicationMode !== "public") {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "PUBLIC_NOT_FOUND" } }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: "music-public-descriptor/v1",
        publication: { mode: "public", publicSlug: "qualification-public", revision: 1 },
      }),
    });
  });

  await page.route("**/api/playlists", async (route) => {
    requests.push({
      method: route.request().method(),
      path: canonicalMusicPath(route.request().url()),
      authorization: route.request().headers().authorization,
      xUsername: route.request().headers()["x-username"],
    });
    if (route.request().method() === "GET") {
      if (
        (options.ownerExpiredFailures ?? 0) > 0
        && route.request().headers().authorization !== `Bearer ${renewedCredential}`
      ) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ version: "music-error/v1", error: { code: "TOKEN_EXPIRED", retryable: false } }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(playlists) });
      return;
    }
    const created = { id: 99, name: "Qualification playlist", description: null, isVisibleToGuests: false, songs: [] };
    playlists = [...playlists, created];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(created) });
  });
  await page.route("**/api/music/dashboard", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      queueRevision: 0,
      songs: [],
      currentlyPlaying: null,
      playedSongs: [],
      publication: { mode: publicationMode, publicSlug: "qualification-public" },
      guestControls: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false },
    }),
  }));
  // Ticket 6.3. One purpose-limited handshake ticket per connection attempt.
  await page.route("**/api/music/socket-ticket", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      version: "music-socket-ticket/v1",
      ticket: { token: "fixture.socket.ticket", expiresAt: Math.floor(Date.now() / 1000) + 60 },
    }),
  }));
  await page.route("**/api/music/entitlement", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ state: "included", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 }),
  }));
  await page.route("**/api/music/features", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ownerWorkspace: options.ownerWorkspace ?? false,
      guestWorkspace: false,
      playlistImports: false,
      exposureId: "qualification-exposure",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  }));
  await page.route("**/api/music/publication", async (route) => {
    const body = route.request().postDataJSON() as { mode: string };
    publicationCommands.push({
      body,
      idempotencyKey: route.request().headers()["idempotency-key"] ?? null,
    });
    if (["private", "unlisted", "public"].includes(body.mode)) {
      publicationMode = body.mode as typeof publicationMode;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: "music-publication/v1",
        publication: { mode: body.mode, publicSlug: "qualification-public" },
        ...(body.mode === "unlisted" ? { capability: "A".repeat(43) } : {}),
      }),
    });
  });
  await page.route("**/api/music/guest-controls", async (route) => {
    const body = route.request().postDataJSON();
    requests.push({
      method: route.request().method(),
      path: canonicalMusicPath(route.request().url()),
      authorization: route.request().headers().authorization,
      xUsername: route.request().headers()["x-username"],
      body,
      idempotencyKey: route.request().headers()["idempotency-key"],
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/api/playlists/*", async (route) => {
    const path = canonicalMusicPath(route.request().url());
    const body = route.request().postDataJSON();
    requests.push({
      method: route.request().method(),
      path,
      authorization: route.request().headers().authorization,
      xUsername: route.request().headers()["x-username"],
      body,
      idempotencyKey: route.request().headers()["idempotency-key"],
    });
    const match = path.match(/^\/api\/playlists\/(\d+)$/);
    if (route.request().method() === "PATCH" && match) {
      const id = Number(match[1]);
      const existing = playlists.find((playlist) => playlist.id === id);
      const renamed = { ...existing, ...(body as Record<string, unknown>), id };
      playlists = playlists.map((playlist) => playlist.id === id ? renamed : playlist);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(renamed) });
      return;
    }
    await route.fulfill({ status: 204 });
  });

  return {
    ensureCalls: () => ensureCalls,
    strapiCalls: () => strapiCalls,
    requests,
    credential,
    renewedCredential,
    publicationCommands,
    publicationMode: () => publicationMode,
    ensureStarted: () => ensureStarted,
    releaseEnsure: () => releaseHeldEnsure(),
  };
}
