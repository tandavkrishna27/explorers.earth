import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";
import {
  MUSIC_MUTATION_CALLSITES,
  MUSIC_PUBLIC_FIXTURE_VERSION,
  LIVE_RECONNECT_JOURNEY_FAILURE_STAGES,
  LIVE_PROFILE_BATCH_FAILURE_CODES,
  LIVE_PROFILE_BATCH_FAILURE_STAGES,
  LIVE_PUBLIC_JOURNEY_FAILURE_STAGES,
  MUSIC_PUBLIC_STATES,
  LiveReconnectJourneyFailure,
  LiveProfileBatchFailure,
  LivePublicJourneyFailure,
  assertLivePermissionGuestControlVisible,
  assertLivePublicSlug,
  assertLiveWriteAuthority,
  attachLiveFailureScreenshotBestEffort,
  buildPermissionMatrix,
  buildPairwisePermissionMatrix,
  buildSanitizedFixtureEvidence,
  createCanonicalMusicFixtureAdapter,
  fixtureNamespace,
  normalizedSnapshotHash,
  prepareLivePublicMusicJourney,
  readLiveCanonicalPublicRevision,
  musicLiveStrapiTokenFromEnvironment,
  musicLiveTest,
  resetMusicRestoreBlockForContractTest,
  runAuthorizedMusicMutation,
  resolveMusicTestLane,
  withRestoredMusicFixture,
} from "./setup/music";
import {
  observeProfilePublish,
  settleAbortedProfileMutation,
  type ProfileBatchDialog,
  type ProfileBatchRawAccount,
  type ProfileBatchUpdateAccount,
} from "./setup/profile-batch";
import { stopMusicFixture } from "../scripts/music-fixture-cleanup.mjs";
import { runMusicFixtureOrchestration } from "../scripts/music-public-e2e-runner.mjs";
import {
  LIVE_JOURNEY_MANIFEST,
  LIVE_JOURNEY_MANIFEST_VERSION,
  LIVE_JOURNEY_RESULT_VERSION,
  buildLiveJourneyTerminal,
  buildProfileCoveringRows,
  canonicalEvidenceHash,
  classifyLivePreflight,
  profileFactorPairs,
  resolveDeclaredTsxCli,
  validateLiveJourneyEvidence,
} from "../scripts/music-public-live-preflight.mjs";
import { LIVE_QUALIFICATION_REQUIRED_ARTIFACTS } from "../scripts/music-public-qualification-artifacts.mjs";
import playwrightConfig from "../playwright.config";

const EXPECTED_LIVE_JOURNEYS = [
  { id: "music.owner.queue-add", title: "authenticated owner queue mutation reaches the branch-local Tunes fixture through the fixture browser origin", source: "e2e/music-fixture-fullstack.spec.ts" },
  { id: "music.owner.mobile-workspace", title: "full owner workspace remains usable at a mobile viewport", source: "e2e/music-fixture-fullstack.spec.ts" },
  { id: "music.owner-guest.permission.allow-song-requests", title: "live owner/guest toggle allowSongRequests restores the exact permission snapshot", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.owner-guest.permission.allow-guest-play-on-device", title: "live owner/guest toggle allowGuestPlayOnDevice restores the exact permission snapshot", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.owner-guest.permission.allow-playlist-sharing", title: "live owner/guest toggle allowPlaylistSharing restores the exact permission snapshot", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.owner-guest.permission.allow-recently-played-visibility", title: "live owner/guest toggle allowRecentlyPlayedVisibility restores the exact permission snapshot", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.owner-guest.permission.allow-queue-visibility", title: "live owner/guest toggle allowQueueVisibility restores the exact permission snapshot", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.owner-guest.reconnect", title: "live guest reconnect refetches canonical state after transport interruption", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.guest.request-lifecycle", title: "live guest request accepts once, replays, conflicts, rate-limits, and owner revokes it", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.guest.playback-second-guest", title: "live guest playback remains isolated while queue and player revisions refetch", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.owner.publication-playlist-sharing", title: "owner publication, playlist visibility, and playlist-sharing settings persist and control fixture public access", source: "e2e/music-public-contract.spec.ts" },
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `profile.owner.pairwise.batch-${String(index + 1).padStart(2, "0")}`,
    title: `publishes pairwise matrix batch ${index + 1}/6 and restores exact raw social_media`,
    source: "e2e/profile-theme.spec.ts",
  })),
] as const;

const EXPECTED_LIVE_READ_ONLY = [
  { id: "music.read-only.owner-view-as-guest", title: "owner View as guest link opens public Music in a separate logged-out browser context", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.permission-matrix", title: "all 32 permission masks expose exactly the independently expected guest surfaces", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.first-view-fallback", title: "first-view fallback selects the first permitted content and then the explicit empty state", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.a11y-announcements", title: "screen readers receive actual loading and request-success announcements", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.share-privacy", title: "public and unlisted shares preserve canonical and capability privacy", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.cache-isolation", title: "public and unlisted caches stay isolated and invalid capabilities recover generically", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.generic-recovery", title: "invalid, private, and missing resources converge on generic nonretryable recovery", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.viewport-320x700", title: "accessible public structure reflows at 320x700", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.viewport-375x667", title: "accessible public structure reflows at 375x667", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.viewport-390x844", title: "accessible public structure reflows at 390x844", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.viewport-768x1024", title: "accessible public structure reflows at 768x1024", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.viewport-1440x900", title: "accessible public structure reflows at 1440x900", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.friendly-descriptor", title: "friendly route resolves one stable Account descriptor and shares canonical content", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.friendly-navigation", title: "friendly Music navigation preserves history, current-page semantics, heading order, and announcements", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.wrong-user-recovery", title: "wrong username and descriptor outage use non-enumerating recovery", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.preference-true-missing", title: "explicit friendly recovery: preference=true descriptor=missing", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.preference-true-outage", title: "explicit friendly recovery: preference=true descriptor=outage", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.preference-false-available", title: "explicit friendly recovery: preference=false descriptor=available", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.visual-dark-banner", title: "visual baseline dark-banner-full-content", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.visual-minimal-light", title: "visual baseline minimal-light-solid", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.visual-image-fallback", title: "visual baseline failed-image-fallback", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.visual-mobile-reconnecting", title: "visual baseline mobile-reconnecting", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.visual-long-nav", title: "visual baseline 320-long-nav-stress", source: "e2e/music-public-contract.spec.ts" },
  { id: "music.read-only.visual-desktop-full", title: "visual baseline desktop-full-content", source: "e2e/music-public-contract.spec.ts" },
  { id: "profile.read-only.restore-emergency", title: "restore guard uses one emergency cleanup and preserves the original failure", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.read-only.restore-confirmed", title: "restore guard never performs an emergency write after a confirmed normal restore", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.read-only.restore-concurrent-change", title: "restore guard refuses every write after a concurrent profile change", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.read-only.covering-array", title: "covering array dry run proves all values and all factor pairs", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.read-only.live-timeout", title: "live timeout preserves at least five minutes for exact restore", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.read-only.live-batches", title: "live matrix is split into ordered batches of at most twelve rows", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.read-only.first-view-oracle", title: "live row oracle promotes a category first view independently of saved order", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.read-only.theme-elements", title: "renders homepage, navigation, and theme system elements", source: "e2e/profile-theme.spec.ts" },
] as const;

const LIVE_MUTATION_TAG = "@explorers-live-mutation";
const LIVE_READ_ONLY_TAG = "@explorers-live-read-only";

const EXACT_PUBLIC_LIVE_AUTHORITY_ARGS = [
  "--ack",
  "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
  "--fixture-version",
  MUSIC_PUBLIC_FIXTURE_VERSION,
  "--confirm-project",
  "explorers-music-fixture",
  "--confirm-namespace-reset",
  "RESET_EXPLORERS_MUSIC_FIXTURE_NAMESPACE",
] as const;

const EXACT_PUBLIC_C14_AUTHORITY_ARGS = [
  "--ack",
  "TASK4_FULL_FIXTURE_PREBROWSER_QUALIFICATION_V1",
  "--fixture-version",
  MUSIC_PUBLIC_FIXTURE_VERSION,
  "--confirm-project",
  "explorers-music-fixture",
  "--confirm-namespace-reset",
  "RESET_EXPLORERS_MUSIC_FIXTURE_NAMESPACE",
] as const;

const EXPECTED_PREBROWSER_PUBLIC_FLOW_STAGES = [
  "visibility", "owner", "playlist", "saved-song-1", "saved-song-2", "saved-song-3",
  "playlist-visible", "queue", "playback-1", "playback-2", "controls", "publication",
  "direct-public-profile", "direct-public-category-places", "direct-public-category-movies",
  "direct-public-category-books", "direct-public-category-games", "direct-public-category-apps",
  "direct-public-category-products", "direct-public-category-people", "direct-public-category-guides",
  "proxy-public-profile", "proxy-public-category-places", "proxy-public-category-movies",
  "proxy-public-category-books", "proxy-public-category-games", "proxy-public-category-apps",
  "proxy-public-category-products", "proxy-public-category-people", "proxy-public-category-guides",
  "direct-public-music", "proxy-public-music",
] as const;
const EXPECTED_PREBROWSER_PUBLIC_FLOW_FAILURE_CODES = [
  "operation-failed", "operation-timeout", "http-failed", "contract-invalid",
] as const;
const EXPECTED_PREBROWSER_PUBLIC_FLOW_SUBSTAGES = [
  "none", "transition-response", "dashboard-response",
] as const;

const AUTHORITATIVE_QUALIFICATION_STREAMS = [
  { role: "fixture-bootstrap-stdout", path: "logs/fixture-bootstrap.stdout.log", source: "fixture-bootstrap", stream: "stdout" },
  { role: "fixture-bootstrap-stderr", path: "logs/fixture-bootstrap.stderr.log", source: "fixture-bootstrap", stream: "stderr" },
  { role: "fixture-up-stdout", path: "logs/fixture-up.stdout.log", source: "fixture-up", stream: "stdout" },
  { role: "fixture-up-stderr", path: "logs/fixture-up.stderr.log", source: "fixture-up", stream: "stderr" },
  { role: "fixture-down-stdout", path: "logs/fixture-down.stdout.log", source: "fixture-down", stream: "stdout" },
  { role: "fixture-down-stderr", path: "logs/fixture-down.stderr.log", source: "fixture-down", stream: "stderr" },
  { role: "state-service-stdout", path: "logs/state-service.stdout.log", source: "state-service", stream: "stdout" },
  { role: "state-service-stderr", path: "logs/state-service.stderr.log", source: "state-service", stream: "stderr" },
] as const;
const REQUIRED_QUALIFICATION_ARTIFACTS = [
  ...AUTHORITATIVE_QUALIFICATION_STREAMS.map(({ role, path }) => ({ role, path })),
  { role: "fixture-authority", path: "fixture-authority.json" },
  { role: "analytics-ledger", path: "analytics-events.jsonl" },
  { role: "visual-trace-ledger", path: "visual-trace-ledger.json" },
  { role: "docker-inspection", path: "docker-inspection.json" },
  { role: "skip-ledger", path: "skip-reasons.json" },
  { role: "restoration-record", path: "restoration.json" },
  { role: "journey-outcomes", path: "journey-outcomes.json" },
  { role: "mutation-guard", path: "mutation-guard.json" },
  { role: "evidence", path: "evidence.json" },
] as const;
const SAFE_FIXTURE_AUTHORITY_GATE = Object.freeze({
  schemaVersion: "explorers-public-fixture-authority/v1",
  status: "accepted",
  command: ["npm", "run", "--silent", "music:fixture:authority:attest"],
  cwd: "<repository>",
  exitCode: 0,
  termination: "exited",
  attestation: {
    schemaVersion: "music-fixture-authority-attestation/v1",
    state: "tombstone",
    safeToBootstrap: true,
    usableRecords: 0,
  },
});
const NONE_RETAINED_VISUAL_LEDGER = `${JSON.stringify({
  schemaVersion: "explorers-public-visual-trace-ledger/v1",
  status: "none-retained",
  visuals: [],
  traces: [],
})}\n`;

function notRunJourneyOutcomeLedger() {
  return {
    schemaVersion: "explorers-public-journey-outcomes/v4",
    integrity: "not-run",
    counts: {
      execution: { total: 49, passed: 0, failed: 0, skipped: 0, notRun: 49 },
      terminal: { total: 17, passed: 0, failed: 0, missing: 0, invalid: 0, notRun: 17 },
    },
    executionOutcomes: [...EXPECTED_LIVE_JOURNEYS, ...EXPECTED_LIVE_READ_ONLY].map(({ id }) => ({
      id, status: "not-run", reason: "execution-not-run", stage: "preflight",
    })),
    mutationTerminals: EXPECTED_LIVE_JOURNEYS.map(({ id }) => ({
      id, status: "not-run", reason: "terminal-not-run", stage: "preflight",
    })),
  };
}

function unavailablePrebrowserQualification() {
  return {
    schemaVersion: "explorers-public-prebrowser-qualification/v4",
    status: "unavailable",
    code: "not-run",
    snapshotFailure: { phase: "none", stage: "none", code: "none" },
    publicFlowFailure: { stage: "none", code: "none" },
    publicFlowSubstage: "none",
    checks: {
      populatedRollback: false, profileCapability: false, privateAuthority: false,
      staleRejected: false, publicProjection: false, musicPrerequisites: false,
      baselineRestored: false, ephemeralOwnerRetired: false, guardClear: false,
    },
    counts: { identityRows: 0, categoryQueries: 0, musicPrerequisites: 0 },
    hashes: {
      populatedDatabase: null, rollbackDatabase: null, populatedProfile: null, rollbackProfile: null,
      baselineDatabase: null, restoredBaselineDatabase: null, baselineProfile: null,
      restoredBaselineProfile: null, publicSlug: null,
    },
    profileRevisions: { populated: null, rollback: null, baseline: null, restoredBaseline: null },
  };
}

function passedPrebrowserQualification() {
  return {
    schemaVersion: "explorers-public-prebrowser-qualification/v4",
    status: "passed",
    code: "none",
    snapshotFailure: { phase: "none", stage: "none", code: "none" },
    publicFlowFailure: { stage: "none", code: "none" },
    publicFlowSubstage: "none",
    checks: {
      populatedRollback: true, profileCapability: true, privateAuthority: true,
      staleRejected: true, publicProjection: true, musicPrerequisites: true,
      baselineRestored: true, ephemeralOwnerRetired: true, guardClear: true,
    },
    counts: { identityRows: 1, categoryQueries: 18, musicPrerequisites: 9 },
    hashes: {
      populatedDatabase: "1".repeat(64), rollbackDatabase: "1".repeat(64),
      populatedProfile: "2".repeat(64), rollbackProfile: "2".repeat(64),
      baselineDatabase: "3".repeat(64), restoredBaselineDatabase: "3".repeat(64),
      baselineProfile: "4".repeat(64), restoredBaselineProfile: "4".repeat(64),
      publicSlug: "5".repeat(64),
    },
    profileRevisions: { populated: 1, rollback: 1, baseline: 0, restoredBaseline: 0 },
  };
}

function failedPrebrowserQualification() {
  return {
    ...unavailablePrebrowserQualification(),
    status: "failed",
    code: "public-flow-failed",
    publicFlowFailure: { stage: "queue", code: "http-failed" },
  };
}

function unavailableInitialSnapshotQualification() {
  return {
    schemaVersion: "explorers-public-initial-snapshot/v1",
    status: "unavailable",
    stage: "not-run",
    code: "not-run",
    metadata: {
      databaseHash: null,
      profileHash: null,
      identityRows: null,
      profileRevision: null,
      profileFieldCount: null,
    },
  };
}

function passedInitialSnapshotQualification() {
  return {
    schemaVersion: "explorers-public-initial-snapshot/v1",
    status: "passed",
    stage: "snapshot-store",
    code: "none",
    metadata: {
      databaseHash: "a".repeat(64),
      profileHash: "b".repeat(64),
      identityRows: 0,
      profileRevision: 0,
      profileFieldCount: 2,
    },
  };
}

function seededQualificationEvidence() {
  return `${JSON.stringify({
    initialSnapshotQualification: unavailableInitialSnapshotQualification(),
    prebrowserQualification: unavailablePrebrowserQualification(),
    journeyOutcomes: notRunJourneyOutcomeLedger(),
    mutationGuard: {
      version: "music-e2e-mutation-guard/v1", state: "clear", reason: "none", stage: "preflight",
    },
    stateServiceLifecycle: {
      schemaVersion: "explorers-public-state-service-lifecycle/v1",
      error: { status: "unavailable" },
      exit: { status: "unavailable" },
      close: { status: "unavailable" },
    },
    streams: AUTHORITATIVE_QUALIFICATION_STREAMS.map((definition) => ({
      schemaVersion: "explorers-public-stream-artifact/v1",
      ...definition,
      status: "captured",
      observedBytes: 3,
      bytes: 3,
      truncated: false,
    })),
  }, null, 2)}\n`;
}

function seededQualificationArtifactContent(role: string) {
  if (role === "visual-trace-ledger") return NONE_RETAINED_VISUAL_LEDGER;
  if (role === "fixture-authority") return `${JSON.stringify(SAFE_FIXTURE_AUTHORITY_GATE, null, 2)}\n`;
  if (role === "journey-outcomes") return `${JSON.stringify(notRunJourneyOutcomeLedger(), null, 2)}\n`;
  if (role === "mutation-guard") return `${JSON.stringify({
    version: "music-e2e-mutation-guard/v1", state: "clear", reason: "none", stage: "preflight",
  })}\n`;
  if (role === "evidence") return seededQualificationEvidence();
  return "abc";
}

function seedQualificationArtifacts(runDirectory: string) {
  for (const artifact of REQUIRED_QUALIFICATION_ARTIFACTS) {
    const artifactPath = join(runDirectory, ...artifact.path.split("/"));
    mkdirSync(resolve(artifactPath, ".."), { recursive: true });
    writeFileSync(artifactPath, seededQualificationArtifactContent(artifact.role));
  }
}

function observedQualificationAnalyticsLedger() {
  return {
    schemaVersion: "explorers-public-analytics-ledger/v1",
    status: "observed",
    events: [{
      sequence: 1,
      event: { name: "navigation_opened", route: "friendly" },
      utm: { utm_source: "newsletter", utm_medium: "email", utm_campaign: "music_launch" },
      delivery: {
        occurrenceSha256: "a".repeat(64),
        eventIdSha256: "b".repeat(64),
        attempts: 2,
        distinctEventIds: 1,
        committedEvents: 1,
        duplicateResponses: 1,
        exactlyOnce: true,
      },
    }],
  };
}

function rewriteQualificationManifest(
  runDirectory: string,
  mutate: (manifest: { schemaVersion: string; artifacts: Array<Record<string, unknown>> }) => void,
) {
  const manifestPath = join(runDirectory, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  mutate(manifest);
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeQualificationManifestBytes(runDirectory, bytes);
}

function writeQualificationManifestBytes(runDirectory: string, bytes: Buffer) {
  const manifestPath = join(runDirectory, "manifest.json");
  writeFileSync(manifestPath, bytes);
  writeFileSync(join(runDirectory, "manifest.sha256"), `${createHash("sha256").update(bytes).digest("hex")}\n`);
}

function playwrightJourneyReport(
  entries: ReadonlyArray<{ id: string; title: string; source: string }> = EXPECTED_LIVE_JOURNEYS,
  options: { skippedId?: string; resultStatus?: string; statusById?: Readonly<Record<string, string>> } = {},
) {
  const statusFor = (entry: { id: string }) => options.statusById?.[entry.id] ?? options.resultStatus;
  const spec = (entry: { id: string; title: string; source: string }) => {
    const status = statusFor(entry);
    const skipped = entry.id === options.skippedId || status === "skipped";
    return {
      title: entry.title,
      file: entry.source.replace(/^e2e\//, ""),
      tags: [LIVE_MUTATION_TAG],
      tests: [{
        annotations: skipped ? [{ type: "skip", description: "Bearer should-not-survive" }] : [],
        expectedStatus: "passed",
        results: status ? [{ status }] : [],
        status: status ?? "skipped",
      }],
    };
  };
  const fixture = entries.filter(({ source }) => source.endsWith("music-fixture-fullstack.spec.ts"));
  const music = entries.filter(({ source }) => source.endsWith("music-public-contract.spec.ts"));
  const profile = entries.filter(({ source }) => source.endsWith("profile-theme.spec.ts"));
  const reviewedSources = new Set(["e2e/music-fixture-fullstack.spec.ts", "e2e/music-public-contract.spec.ts", "e2e/profile-theme.spec.ts"]);
  const unknownSources = entries.filter(({ source }) => !reviewedSources.has(source));
  const musicReadOnly = EXPECTED_LIVE_READ_ONLY.filter(({ source }) => source.endsWith("music-public-contract.spec.ts"));
  const profileReadOnly = EXPECTED_LIVE_READ_ONLY.filter(({ source }) => source.endsWith("profile-theme.spec.ts"));
  const readOnlySpec = (entry: { id: string; title: string; source: string }) => {
    const status = statusFor(entry);
    return {
      title: entry.title,
      file: entry.source.replace(/^e2e\//, ""),
      tags: [LIVE_READ_ONLY_TAG],
      tests: [{
        annotations: status === "skipped" ? [{ type: "skip", description: "Bearer should-not-survive" }] : [],
        expectedStatus: "passed",
        results: status ? [{ status }] : [],
      }],
    };
  };
  return {
    suites: [
      { title: "music-fixture-fullstack.spec.ts", file: "music-fixture-fullstack.spec.ts", specs: fixture.map(spec) },
      { title: "music-public-contract.spec.ts", file: "music-public-contract.spec.ts", specs: [...music.map(spec), ...musicReadOnly.map(readOnlySpec)] },
      {
        title: "profile-theme.spec.ts",
        file: "profile-theme.spec.ts",
        specs: profileReadOnly.slice(0, 7).map(readOnlySpec),
        suites: [{ title: "approved live profile writes", specs: profile.map(spec) }],
      },
      { title: "profile-theme.spec.ts", file: "profile-theme.spec.ts", specs: profileReadOnly.slice(7).map(readOnlySpec) },
      ...unknownSources.map((entry) => ({ title: entry.source, file: entry.source, specs: [spec(entry)] })),
    ],
  };
}

function preflightChild(status: number, stdout = "", stderr = "") {
  return { status, stdout, stderr, signal: null, error: undefined };
}

function validJourneyEvidenceRecords() {
  const profileRows = buildProfileCoveringRows();
  const profileHash = canonicalEvidenceHash({ profile: "restored", order: ["music", "places"] });
  return EXPECTED_LIVE_JOURNEYS.map((entry, index) => ({
    version: LIVE_JOURNEY_RESULT_VERSION,
    manifestVersion: LIVE_JOURNEY_MANIFEST_VERSION,
    ...entry,
    status: "passed",
    skipReason: null,
    cleanup: "restored",
    beforeHash: index < 11 ? String(index + 1).padStart(64, "a") : profileHash,
    afterHash: index < 11 ? String(index + 1).padStart(64, "a") : profileHash,
    ...(index < 11 ? {} : { rowCount: 12, rows: profileRows.slice((index - 11) * 12, (index - 10) * 12) }),
  }));
}

function inertLiveCollectionEnvironment() {
  const environment = {
    ...process.env,
    PLAYWRIGHT_EXTERNAL_BASE_URL: "http://127.0.0.1:55173",
    PLAYWRIGHT_PR_SAFE: "false",
    MUSIC_E2E_LIVE_WRITE: "true",
    MUSIC_E2E_LIVE_WRITE_CONFIRMATION: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
    MUSIC_E2E_FIXTURE_VERSION: MUSIC_PUBLIC_FIXTURE_VERSION,
    MUSIC_E2E_ACCOUNT_USERNAME: "e2e-public-music-sentinel-owner",
    MUSIC_E2E_ACCOUNT_DOCUMENT_ID: "e2e-public-music-sentinel-account",
    MUSIC_E2E_SERVICE_ORIGINS: "http://127.0.0.1:55173,http://127.0.0.1:55000,tcp://127.0.0.1:55432,http://127.0.0.1:51337,http://127.0.0.1:55174",
    MUSIC_E2E_STRAPI_TOKEN: "sentinel-authority-value",
    E2E_PROFILE_LIVE_WRITES: "1",
    E2E_PROFILE_STORAGE_STATE: resolve(".artifacts/inert-profile-storage-state.json"),
    E2E_PROFILE_USERNAME: "e2e-profile-sentinel",
  };
  delete environment.PLAYWRIGHT_JSON_OUTPUT_FILE;
  delete environment.PLAYWRIGHT_JSON_OUTPUT_NAME;
  delete environment.PLAYWRIGHT_JSON_OUTPUT_DIR;
  return environment;
}

function writeLifecycleContractShims(sandbox: string) {
  const fakeNpmPath = join(sandbox, "fake-npm.mjs");
  const fakeDockerPath = join(sandbox, "fake-docker.mjs");
  const fakeDockerHookPath = join(sandbox, "fake-docker-hook.cjs");
  const binDirectory = join(sandbox, "bin");
  mkdirSync(binDirectory);
  writeFileSync(fakeNpmPath, [
    'import { appendFileSync, existsSync, rmSync, writeFileSync } from "node:fs";',
    'import { createHash } from "node:crypto";',
    'const authority = process.argv.includes("music:fixture:authority:attest");',
    'const scenario = process.env.FAKE_LIFECYCLE_SCENARIO;',
    'if (authority) {',
    '  appendFileSync(process.env.FAKE_LIFECYCLE_LOG, "authority\\n");',
    '  if (scenario === "authority-credential") {',
    '    process.stdout.write(JSON.stringify({ schemaVersion: "music-fixture-authority-attestation/v1", state: "tombstone", safeToBootstrap: true, usableRecords: 0, password: process.env.FAKE_PRIVATE_VALUE }) + "\\n");',
    '    process.stderr.write(`path=/private/${process.env.FAKE_PRIVATE_VALUE}/authority.log\\n`);',
    '  } else {',
    '    process.stdout.write(JSON.stringify({ schemaVersion: "music-fixture-authority-attestation/v1", state: "tombstone", safeToBootstrap: true, usableRecords: 0 }) + "\\n");',
    '  }',
    '  process.exit(0);',
    '}',
    'const action = ["bootstrap", "up", "down"].find((candidate) => process.argv.includes(candidate));',
    'const fixtureToken = process.env.MUSIC_E2E_STRAPI_TOKEN;',
    'appendFileSync(process.env.FAKE_LIFECYCLE_LOG, `${action}\n`);',
    'process.stdout.write(`workspace=${process.cwd()} Bearer ${process.env.FAKE_PRIVATE_VALUE} fixture_token=${fixtureToken}\n${"bounded-child-output".repeat(600)}`);',
    'process.stderr.write(`credential=${process.env.FAKE_PRIVATE_VALUE} fixture_token=${fixtureToken} path=/private/fixture/lifecycle.log\n`);',
    'if (action === "bootstrap") {',
    '  writeFileSync(process.env.FAKE_FIXTURE_TOKEN_MARKER, fixtureToken);',
    '  if (scenario === "bootstrap-partial") writeFileSync(process.env.FAKE_RESOURCE_MARKER, "partial");',
    '  if (scenario.startsWith("bootstrap-")) process.exit(1);',
    '}',
    'if (action === "up") {',
    '  if (scenario === "up-partial") { writeFileSync(process.env.FAKE_RESOURCE_MARKER, "partial"); process.exit(1); }',
    '}',
    'if (action === "down") {',
    '  writeFileSync(process.env.FAKE_FIXTURE_TOKEN_DIGEST, createHash("sha256").update(fixtureToken).digest("hex"));',
    '  if (existsSync(process.env.FAKE_FIXTURE_TOKEN_MARKER)) rmSync(process.env.FAKE_FIXTURE_TOKEN_MARKER);',
    '  if (existsSync(process.env.FAKE_RESOURCE_MARKER)) rmSync(process.env.FAKE_RESOURCE_MARKER);',
    '  if (scenario.endsWith("down-failure")) process.exit(1);',
    '}',
    '',
  ].join("\n"));
  writeFileSync(fakeDockerPath, [
    'const mode = process.env.FAKE_DOCKER_MODE;',
    'if (mode === "unavailable") process.exit(2);',
    'if (mode === "residue") process.stdout.write(process.argv.includes("ps") ? `${"a".repeat(12)}\\n` : "explorers_music_fixture_residue\\n");',
    '',
  ].join("\n"));
  writeFileSync(fakeDockerHookPath, [
    'const { basename } = require("node:path");',
    'if (process.env.FAKE_LIFECYCLE_SCENARIO === "state-service-exit" && String(process.argv[1]).endsWith("music-public-e2e.mjs")) {',
    '  const { EventEmitter } = require("node:events");',
    '  const net = require("node:net");',
    '  const { syncBuiltinESMExports } = require("node:module");',
    '  net.createConnection = (_options, connected) => { const socket = new EventEmitter(); socket.setTimeout = () => socket; socket.destroy = () => undefined; queueMicrotask(connected); return socket; };',
    '  syncBuiltinESMExports();',
    '  global.fetch = async (input) => { await new Promise((resolve) => setTimeout(resolve, 25)); const url = String(input); return { ok: true, status: 200, async json() { if (url.includes("/api/accounts/")) return { data: { documentId: process.env.MUSIC_E2E_ACCOUNT_DOCUMENT_ID } }; if (url.endsWith("/api/users/me")) return { username: process.env.MUSIC_E2E_ACCOUNT_USERNAME, documentId: process.env.MUSIC_E2E_USER_DOCUMENT_ID, accounts: [{ documentId: process.env.MUSIC_E2E_ACCOUNT_DOCUMENT_ID }] }; return { database: { dumpHash: "b".repeat(64) } }; } }; };',
    '}',
    'if ([basename(process.execPath), basename(process.argv0)].some((name) => name.toLowerCase() === "docker.exe")) {',
    '  const mode = process.env.FAKE_DOCKER_MODE;',
    '  if (mode === "unavailable") process.exit(2);',
    '  if (mode === "residue") process.stdout.write(process.argv.includes("ps") ? `${"a".repeat(12)}\\n` : "explorers_music_fixture_residue\\n");',
    '  process.exit(0);',
    '}',
    '',
  ].join("\n"));
  if (process.platform === "win32") {
    copyFileSync(process.execPath, join(binDirectory, "docker.exe"));
  } else {
    const posixDocker = join(binDirectory, "docker");
    writeFileSync(posixDocker, `#!/usr/bin/env node\nawait import(${JSON.stringify(pathToFileURL(fakeDockerPath).href)});\n`);
    chmodSync(posixDocker, 0o755);
  }
  return { fakeNpmPath, fakeDockerHookPath, binDirectory };
}

function lifecycleFreshProcessEnvironment({
  sandbox,
  runId,
  fakeNpmPath,
  fakeDockerHookPath,
  binDirectory,
  scenario,
  dockerMode,
  privateValue,
}: {
  sandbox: string;
  runId: string;
  fakeNpmPath: string;
  fakeDockerHookPath: string;
  binDirectory: string;
  scenario: string;
  dockerMode: string;
  privateValue: string;
}) {
  const cleanEnvironment = withoutPublicLiveAuthority(process.env);
  return {
    ...cleanEnvironment,
    PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${fakeDockerHookPath}`.trim(),
    npm_execpath: fakeNpmPath,
    FAKE_LIFECYCLE_SCENARIO: scenario,
    FAKE_DOCKER_MODE: dockerMode,
    FAKE_LIFECYCLE_LOG: join(sandbox, `${runId}-lifecycle.log`),
    FAKE_RESOURCE_MARKER: join(sandbox, `${runId}-resource.marker`),
    FAKE_FIXTURE_TOKEN_MARKER: join(sandbox, `${runId}-fixture-token.private`),
    FAKE_FIXTURE_TOKEN_DIGEST: join(sandbox, `${runId}-fixture-token.sha256`),
    FAKE_PRIVATE_VALUE: privateValue,
  };
}

function withoutPublicLiveAuthority(environment: NodeJS.ProcessEnv) {
  const cleanEnvironment = { ...environment };
  for (const key of Object.keys(cleanEnvironment)) {
    const upper = key.toUpperCase();
    if (upper.startsWith("MUSIC_E2E_") || upper.startsWith("MUSIC_DEPLOY_")
        || upper.startsWith("MUSIC_DATABASE_") || upper.startsWith("MUSIC_DB_")
        || upper.startsWith("MUSIC_C10_STANDALONE_POSTGRES_") || upper.startsWith("MUSIC_UAT_DATABASE_")
        || upper.startsWith("LIVE_STRAPI_") || [
          "COMPOSE_PROJECT_NAME", "DATABASE_URL", "DATABASE_URL_TEST", "DOCKER_CONTEXT", "DOCKER_HOST",
          "E2E_PROFILE_LIVE_WRITES", "E2E_PROFILE_STORAGE_STATE", "E2E_PROFILE_USERNAME", "GATE_PROD",
          "MUSIC_API_BASE_URL", "MUSIC_MODE", "MUSIC_PUBLIC_RUN_ID", "MUSIC_STRAPI_HOST_PORT",
          "PLAYWRIGHT_EXTERNAL_BASE_URL", "PLAYWRIGHT_PR_SAFE", "STRAPI_ACCESS_TOKEN",
          "STRAPI_ANALYTICS_ACCESS_TOKEN", "STRAPI_URL", "VITE_API_URL", "VITE_BASE_URL",
          "VITE_LOCAL_TUNES_API_URL", "VITE_PUBLIC_ACCESS_TOKEN", "VITE_REST_API_URL",
        ].includes(upper)) delete cleanEnvironment[key];
  }
  return cleanEnvironment;
}

function onlyQualificationRunDirectory(sandbox: string) {
  const parent = join(sandbox, ".artifacts", "music-public");
  const entries = readdirSync(parent, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (entries.length !== 1) throw new Error(`expected one fresh qualification directory, received ${entries.length}`);
  return join(parent, entries[0]!.name);
}

type JsonCollectionSuite = {
  specs?: Array<{ title?: string; file?: string; tags?: string[] }>;
  suites?: JsonCollectionSuite[];
};

function allJsonCollectionSpecs(report: { suites?: JsonCollectionSuite[] }) {
  const specs: Array<{ title?: string; file?: string; tags: string[] }> = [];
  const visit = (suite: JsonCollectionSuite) => {
    for (const spec of suite.specs ?? []) specs.push({ ...spec, tags: (spec.tags ?? []).map((tag) => tag.replace(/^@/, "")) });
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return specs;
}

function syntheticJourneySpecSource(
  mutations: ReadonlyArray<{ title: string }>,
  readOnly: ReadonlyArray<{ title: string }>,
  hostileFailure?: {
    title: string;
    bearer: string;
    accessToken: string;
    capability: string;
    credential: string;
    absolutePath: string;
  },
) {
  const source = (title: string, tag: string) => {
    if (title !== hostileFailure?.title) {
      return `test(${JSON.stringify(title)}, { tag: ${JSON.stringify(tag)} }, async () => {});`;
    }
    const hostileValues = JSON.stringify([
      `Bearer ${hostileFailure.bearer}`,
      `access_token=${hostileFailure.accessToken}`,
      `capability=${hostileFailure.capability}`,
      `credential=${hostileFailure.credential}`,
      hostileFailure.absolutePath,
    ]);
    return [
      `test(${JSON.stringify(title)}, { tag: ${JSON.stringify(tag)} }, async ({}, testInfo) => {`,
      `  const hostile = ${hostileValues}.join(" ");`,
      '  const oversized = "hostile-output-".repeat(20000);',
      '  console.log(`${hostile} ${oversized}`);',
      '  console.error(`${hostile} ${oversized}`);',
      '  await testInfo.attach("hostile-private-attachment", { body: Buffer.from(`${hostile} ${oversized}`), contentType: "text/plain" });',
      '  throw new Error(`${hostile} ${oversized}`);',
      "});",
    ].join("\n");
  };
  return [
    'import { test } from "@playwright/test";',
    ...mutations.map(({ title }) => source(title, LIVE_MUTATION_TAG)),
    ...readOnly.map(({ title }) => source(title, LIVE_READ_ONLY_TAG)),
    "",
  ].join("\n");
}

async function runSyntheticTerminalOutcome(executionOutcome: unknown, runId: string) {
  const finalHash = "9".repeat(64);
  const retained: string[] = [];
  const outcome = await runMusicFixtureOrchestration({
    snapshotExists: true,
    baseReport: { version: MUSIC_PUBLIC_FIXTURE_VERSION, runId, lane: "live" },
    artifacts: {
      directory: `guarded/${runId}`,
      authPath: "owner-auth.json",
      storagePath: "profile-storage-state.json",
      mkdir: () => undefined,
      write: () => undefined,
      chmod: () => undefined,
    },
    restoreEvidence: {
      path: "restore-evidence.jsonl",
      exists: () => true,
      read: () => validJourneyEvidenceRecords().map((record) => JSON.stringify(record)).join("\n"),
    },
    execute: async () => executionOutcome,
    restore: async () => ({ ok: true, cleanup: "restored", beforeHash: finalHash, afterHash: finalHash }),
    teardown: {
      artifactPaths: [],
      artifactDirectories: [],
      exists: () => false,
      unlink: () => undefined,
      removeDirectory: () => undefined,
      stopStateService: () => undefined,
      down: () => 0,
    },
    writeReport: async (report: unknown) => { retained.push(JSON.stringify(report)); },
    writeStdout: (text: string) => { retained.push(text); },
    writeStderr: (text: string) => { retained.push(text); },
  });
  return { outcome, retained: retained.join("\n") };
}

test("live manifest binds exactly 17 collected mutation journeys", () => {
  expect(LIVE_JOURNEY_MANIFEST_VERSION).toBe("explorers-live-mutation-journeys/v1");
  expect(LIVE_JOURNEY_RESULT_VERSION).toBe("explorers-live-mutation-journey-result/v2");
  expect(LIVE_JOURNEY_MANIFEST).toEqual(EXPECTED_LIVE_JOURNEYS);

  const outcome = classifyLivePreflight({
    authorityResult: preflightChild(0, JSON.stringify({ skipReason: null })),
    collectionResult: preflightChild(0, JSON.stringify(playwrightJourneyReport())),
    workspaceRoot: process.cwd(),
    knownSecrets: [],
  });
  expect(outcome).toMatchObject({
    ok: true,
    exitCode: 0,
    manifestVersion: LIVE_JOURNEY_MANIFEST_VERSION,
    journeyIds: EXPECTED_LIVE_JOURNEYS.map(({ id }) => id),
  });
});

test("live preflight classifier distinguishes authority process, semantic, and collection failures", () => {
  const goodAuthority = preflightChild(0, JSON.stringify({ skipReason: null }));
  const goodCollection = preflightChild(0, JSON.stringify(playwrightJourneyReport()));
  const cases = [
    {
      name: "authority process",
      authorityResult: { ...preflightChild(1, "", "authority child failed"), error: { code: "ENOENT" } },
      collectionResult: goodCollection,
      subcheck: "authority-process",
    },
    {
      name: "authority semantic refusal",
      authorityResult: preflightChild(0, JSON.stringify({ skipReason: "live mutation skipped: incomplete authority" })),
      collectionResult: goodCollection,
      subcheck: "authority-semantic",
    },
    {
      name: "collection process",
      authorityResult: goodAuthority,
      collectionResult: preflightChild(1, "", "collection child failed"),
      subcheck: "collection-process",
    },
  ] as const;

  for (const entry of cases) {
    const outcome = classifyLivePreflight({ ...entry, workspaceRoot: process.cwd(), knownSecrets: [] });
    expect(outcome, entry.name).toMatchObject({
      ok: false,
      exitCode: 4,
      diagnostics: { failureStage: "preflight", subcheck: entry.subcheck },
    });
  }
});

test("live preflight rejects each missing journey plus duplicate, unknown, renamed, reordered, and skipped entries", () => {
  const classify = (entries: ReadonlyArray<{ id: string; title: string; source: string }>, skippedId?: string) => classifyLivePreflight({
    authorityResult: preflightChild(0, JSON.stringify({ skipReason: null })),
    collectionResult: preflightChild(0, JSON.stringify(playwrightJourneyReport(entries, { skippedId }))),
    workspaceRoot: process.cwd(),
    knownSecrets: [],
  });

  for (const missing of EXPECTED_LIVE_JOURNEYS) {
    const outcome = classify(EXPECTED_LIVE_JOURNEYS.filter(({ id }) => id !== missing.id));
    expect(outcome, missing.id).toMatchObject({
      ok: false,
      exitCode: 4,
      diagnostics: {
        failureStage: "preflight",
        subcheck: "manifest-missing",
        missingJourneyIds: [missing.id],
      },
    });
  }

  const duplicate = [...EXPECTED_LIVE_JOURNEYS];
  duplicate.splice(3, 0, EXPECTED_LIVE_JOURNEYS[3]);
  expect(classify(duplicate)).toMatchObject({ ok: false, diagnostics: { subcheck: "manifest-duplicate" } });

  const unknown = [...EXPECTED_LIVE_JOURNEYS, {
    id: "unknown-not-trusted",
    title: "live unexpected mutation journey",
    source: "e2e/music-public-contract.spec.ts",
  }];
  expect(classify(unknown)).toMatchObject({ ok: false, diagnostics: { subcheck: "manifest-unknown" } });

  const unknownSource = [...EXPECTED_LIVE_JOURNEYS, {
    id: "unknown-source-not-trusted",
    title: "live mutation from an unreviewed source",
    source: "e2e/unreviewed-live-mutation.spec.ts",
  }];
  expect(classify(unknownSource)).toMatchObject({ ok: false, diagnostics: { subcheck: "manifest-unknown" } });

  const renamed = EXPECTED_LIVE_JOURNEYS.map((entry, index) => index === 8 ? { ...entry, title: `${entry.title} renamed` } : entry);
  expect(classify(renamed)).toMatchObject({ ok: false, diagnostics: { subcheck: "manifest-unknown" } });

  const reordered = [...EXPECTED_LIVE_JOURNEYS];
  [reordered[3], reordered[4]] = [reordered[4], reordered[3]];
  expect(classify(reordered)).toMatchObject({ ok: false, diagnostics: { subcheck: "manifest-reordered" } });

  expect(classify(EXPECTED_LIVE_JOURNEYS, EXPECTED_LIVE_JOURNEYS[5].id)).toMatchObject({
    ok: false,
    diagnostics: { subcheck: "manifest-skipped", skippedJourneyIds: [EXPECTED_LIVE_JOURNEYS[5].id] },
  });
});

test("live preflight diagnostics are bounded, redacted, path-normalized, and allowlisted", () => {
  const workspaceRoot = process.cwd();
  const secret = "known-secret-value";
  const noisy = `${workspaceRoot} Bearer abc.def.ghi access_token=query-secret capability=cap-secret credential: cred-secret access-token="quoted-access-secret" capability='quoted-cap-secret' credential="quoted-cred-secret" ${secret} ${"x".repeat(10_000)}`;
  const outcome = classifyLivePreflight({
    authorityResult: preflightChild(1, noisy, noisy),
    collectionResult: preflightChild(0, ""),
    workspaceRoot,
    knownSecrets: [secret],
  });
  expect(outcome.ok).toBe(false);
  if (outcome.ok) return;
  const diagnostics = outcome.diagnostics;
  expect(Object.keys(diagnostics).sort()).toEqual([
    "child",
    "failureStage",
    "journeyPresence",
    "subcheck",
  ]);
  expect(Object.keys(diagnostics.child).sort()).toEqual([
    "errorCode",
    "signal",
    "status",
    "stderr",
    "stderrBytes",
    "stderrTruncated",
    "stdout",
    "stdoutBytes",
    "stdoutTruncated",
  ]);
  expect(Buffer.byteLength(diagnostics.child.stdout)).toBeLessThanOrEqual(4 * 1024);
  expect(Buffer.byteLength(diagnostics.child.stderr)).toBeLessThanOrEqual(4 * 1024);
  expect(diagnostics.child.stdoutBytes).toBeGreaterThan(4 * 1024);
  expect(diagnostics.child.stderrBytes).toBeGreaterThan(4 * 1024);
  expect(diagnostics.child.stdoutTruncated).toBe(true);
  expect(diagnostics.child.stderrTruncated).toBe(true);
  expect(`${diagnostics.child.stdout}\n${diagnostics.child.stderr}`).toContain("<workspace>");
  expect(`${diagnostics.child.stdout}\n${diagnostics.child.stderr}`).not.toMatch(/abc\.def\.ghi|query-secret|cap-secret|cred-secret|quoted-access-secret|quoted-cap-secret|quoted-cred-secret|known-secret-value/i);
  expect(diagnostics.journeyPresence).toEqual(EXPECTED_LIVE_JOURNEYS.map(({ id }) => ({ id, present: false })));
});

test("live journey evidence requires explicit ordered IDs and exact 72-row 484-pair profile coverage", () => {
  const profileRows = buildProfileCoveringRows();
  expect(profileRows).toHaveLength(72);
  expect(new Set(profileRows.map((row) => JSON.stringify(row))).size).toBe(72);
  expect(profileFactorPairs(profileRows).size).toBe(484);
  const hash = canonicalEvidenceHash({ profile: "restored", order: ["music", "places"] });
  expect(hash).toMatch(/^[a-f0-9]{64}$/);

  const records = validJourneyEvidenceRecords();
  const executionReport = playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, { resultStatus: "passed" });
  expect(validateLiveJourneyEvidence({ executionReport, records })).toMatchObject({
    ok: true,
    journeyResults: records,
  });

  const invalidCases = [
    records.slice(1),
    [records[0], ...records],
    [...records.slice(0, 4), records[5], records[4], ...records.slice(6)],
    [...records.slice(0, 8), { ...records[8], id: "unknown-not-trusted" }, ...records.slice(9)],
    records.map((record, index) => index === 11 ? { ...record, rows: [profileRows[0], ...profileRows.slice(0, 11)] } : record),
  ];
  for (const invalid of invalidCases) expect(validateLiveJourneyEvidence({ executionReport, records: invalid }).ok).toBe(false);
  expect(validateLiveJourneyEvidence({
    executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, { skippedId: EXPECTED_LIVE_JOURNEYS[12].id, resultStatus: "passed" }),
    records,
  }).ok).toBe(false);
});

test("music restoration emits one explicit ID-bound terminal result only after exact restore", async () => {
  resetMusicRestoreBlockForContractTest();
  const records: unknown[] = [];
  let state: unknown = { publication: { mode: "private" }, queue: [] };
  const result = await withRestoredMusicFixture({
    journeyId: "music.owner.queue-add",
    snapshot: async () => structuredClone(state),
    cleanupNamespace: async () => undefined,
    restore: async (snapshot) => { state = structuredClone(snapshot); },
    writeJourneyResult: async (record) => { records.push(record); },
  }, async () => {
    state = { publication: { mode: "public" }, queue: ["fixture-song"] };
    return "journey-value";
  });
  expect(result.value).toBe("journey-value");
  expect(records).toEqual([expect.objectContaining({
    version: LIVE_JOURNEY_RESULT_VERSION,
    manifestVersion: LIVE_JOURNEY_MANIFEST_VERSION,
    id: "music.owner.queue-add",
    title: EXPECTED_LIVE_JOURNEYS[0].title,
    source: EXPECTED_LIVE_JOURNEYS[0].source,
    status: "passed",
    skipReason: null,
    cleanup: "restored",
    beforeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    afterHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  })]);
  expect((records[0] as { beforeHash: string; afterHash: string }).beforeHash)
    .toBe((records[0] as { beforeHash: string; afterHash: string }).afterHash);

  const failedRecords: unknown[] = [];
  await expect(withRestoredMusicFixture({
    journeyId: "music.owner.queue-add",
    snapshot: async () => ({ publication: { mode: "private" } }),
    cleanupNamespace: async () => undefined,
    restore: async () => undefined,
    writeJourneyResult: async (record) => { failedRecords.push(record); },
  }, async () => { throw new Error("journey failed"); })).rejects.toThrow("journey failed");
  expect(failedRecords).toEqual([expect.objectContaining({
    id: "music.owner.queue-add",
    status: "failed",
    reason: "body-failed",
    stage: "body",
    cleanup: "restored",
    beforeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    afterHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  })]);

  const verificationRecords: unknown[] = [];
  let verificationSnapshots = 0;
  await expect(withRestoredMusicFixture({
    journeyId: "music.owner.queue-add",
    snapshot: async () => {
      if (verificationSnapshots++ === 0) return { publication: { mode: "private" } };
      throw new Error("verification read failed");
    },
    cleanupNamespace: async () => undefined,
    restore: async () => undefined,
    writeRecoveryArtifact: async () => undefined,
    writeJourneyResult: async (record) => { verificationRecords.push(record); },
  }, async () => undefined)).rejects.toThrow("verification read failed");
  expect(verificationRecords).toEqual([expect.objectContaining({
    id: "music.owner.queue-add", status: "failed", reason: "restore-failed", stage: "restore",
  })]);
});

test("live canonical restoration retains explicit journey identity for terminal evidence", async () => {
  resetMusicRestoreBlockForContractTest();
  const environmentKeys = ["MUSIC_E2E_LIVE_WRITE", "MUSIC_E2E_STATE_SERVICE_URL", "MUSIC_E2E_STATE_TOKEN"] as const;
  const originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const baseline = {
    version: "music-live-account-snapshot/v1",
    snapshotId: "snapshot-terminal-evidence",
    publication: { coveredByDatabaseDump: true },
    guestControls: { coveredByDatabaseDump: true },
    queue: { coveredByDatabaseDump: true },
    playlists: { coveredByDatabaseDump: true },
    requests: { coveredByDatabaseDump: true },
    profile: {
      accountDocumentId: "e2e-public-music-evidence-account", publicMusic: true,
      profileRevision: 4, profileHash: "b".repeat(64), fieldCount: 24,
    },
    database: { namespace: "e2e-public-music-evidence", dumpHash: "a".repeat(64), identityRows: 1 },
  };
  let current: unknown = structuredClone(baseline);
  const records: unknown[] = [];
  try {
    process.env.MUSIC_E2E_LIVE_WRITE = "true";
    process.env.MUSIC_E2E_STATE_SERVICE_URL = "http://127.0.0.1:55174";
    process.env.MUSIC_E2E_STATE_TOKEN = "sentinel-state-token";
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/restore")) {
        current = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify(current), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    await withRestoredMusicFixture({
      journeyId: "music.owner.queue-add",
      snapshot: async () => { throw new Error("live mode must use the canonical snapshot adapter"); },
      cleanupNamespace: async () => undefined,
      restore: async () => { throw new Error("live mode must use the canonical restore adapter"); },
      writeJourneyResult: async (record) => { records.push(record); },
    }, async () => { current = { mutated: true }; });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of environmentKeys) {
      const value = originalEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  expect(records).toEqual([expect.objectContaining({
    id: "music.owner.queue-add",
    cleanup: "restored",
    beforeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    afterHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  })]);
});

test("per-batch profile evidence hashes canonical state and refuses mismatch before writing", async () => {
  const { recordRestoredProfileJourney } = await import("../scripts/music-public-live-preflight.mjs");
  const rows = buildProfileCoveringRows().slice(0, 12);
  const written: unknown[] = [];
  const before = { social_media: { b: 2, a: 1 }, Feed_Data: ["music", "places"] };
  const after = { Feed_Data: ["music", "places"], social_media: { a: 1, b: 2 } };
  const record = await recordRestoredProfileJourney({
    id: "profile.owner.pairwise.batch-01",
    before,
    after,
    rows,
    write: async (value) => { written.push(value); },
  });
  expect(written).toEqual([record]);
  expect(record).toMatchObject({
    id: "profile.owner.pairwise.batch-01",
    rowCount: 12,
    rows,
    beforeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    afterHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(record.beforeHash).toBe(record.afterHash);

  const mismatched: unknown[] = [];
  await expect(recordRestoredProfileJourney({
    id: "profile.owner.pairwise.batch-01",
    before,
    after: { ...after, Feed_Data: ["places", "music"] },
    rows,
    write: async (value) => { mismatched.push(value); },
  })).rejects.toThrow(/canonical profile restoration mismatch/i);
  expect(mismatched).toEqual([]);
});

test("profile live batches delegate one fixed terminal and every failure path to the canonical restorer", () => {
  const profileSource = readFileSync("e2e/profile-theme.spec.ts", "utf8");
  const setupSource = readFileSync("e2e/setup/music.ts", "utf8");
  expect(profileSource).toContain("withRestoredMusicFixture");
  expect(profileSource).toContain("journeyRows: liveRows");
  expect(profileSource).toContain("onBodyFailureAfterRestore: blockProfileMutationsAfterBatchFailure");
  expect(profileSource).not.toContain("appendLiveJourneyResult");
  expect(setupSource.indexOf("if (journeyFailure)"))
    .toBeLessThan(setupSource.indexOf("throw journeyFailure"));
  expect(setupSource).toContain("if (terminalWritten) throw new Error");
});

test("runner propagates typed preflight and terminal journey evidence without inventing an eighteenth journey", async () => {
  const finalHash = "f".repeat(64);
  const records = validJourneyEvidenceRecords();
  const executionReport = playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, { resultStatus: "passed" });
  const reports: unknown[] = [];
  const common = {
    snapshotExists: true,
    baseReport: { version: MUSIC_PUBLIC_FIXTURE_VERSION, runId: "typed-evidence", lane: "live" },
    artifacts: {
      directory: "fixture-artifacts",
      authPath: "owner-auth.json",
      storagePath: "profile-storage-state.json",
      mkdir: () => undefined,
      write: () => undefined,
      chmod: () => undefined,
    },
    restoreEvidence: {
      path: "journey-results.jsonl",
      exists: () => true,
      read: () => records.map((record) => JSON.stringify(record)).join("\n"),
    },
    restore: async () => ({ ok: true, cleanup: "restored", beforeHash: finalHash, afterHash: finalHash }),
    teardown: {
      artifactPaths: [],
      exists: () => false,
      unlink: () => undefined,
      stopStateService: () => undefined,
      down: () => 0,
    },
    writeReport: async (report: unknown) => { reports.push(structuredClone(report)); },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  };
  const successful = await runMusicFixtureOrchestration({
    ...common,
    execute: async () => ({ status: 0, executionReport }),
  });
  expect(successful.exitCode).toBe(0);
  expect(successful.report).toMatchObject({
    result: "passed",
    cleanup: "restored",
    manifestVersion: LIVE_JOURNEY_MANIFEST_VERSION,
    journeys: records,
    finalRestore: { cleanup: "restored", beforeHash: finalHash, afterHash: finalHash },
  });
  expect(successful.report.journeys).toHaveLength(17);
  expect(successful.report).not.toHaveProperty("restoreHashes");

  const preflightDiagnostics = {
    failureStage: "preflight",
    subcheck: "authority-process",
    journeyPresence: EXPECTED_LIVE_JOURNEYS.map(({ id }) => ({ id, present: false })),
  };
  const preflight = await runMusicFixtureOrchestration({
    ...common,
    restoreEvidence: { ...common.restoreEvidence, exists: () => false },
    execute: async () => ({ status: 4, preflightDiagnostics }),
  });
  expect(preflight.exitCode).toBe(4);
  expect(preflight.report).toMatchObject({
    result: "failed",
    cleanup: "restored",
    preflightDiagnostics,
    finalRestore: { cleanup: "restored", beforeHash: finalHash, afterHash: finalHash },
  });
  expect(preflight.report).not.toHaveProperty("journeys");

  const cleanupFailure = await runMusicFixtureOrchestration({
    ...common,
    restoreEvidence: { ...common.restoreEvidence, exists: () => false },
    execute: async () => ({ status: 4, preflightDiagnostics }),
    teardown: { ...common.teardown, down: () => 1 },
  });
  expect(cleanupFailure.exitCode).toBe(5);
  expect(cleanupFailure.report.cleanup).toBe("teardown-failed");
});

test("declared root TSX CLI executes the exact inert authority child from Explorer cwd", () => {
  const tsxCli = resolveDeclaredTsxCli();
  expect(tsxCli.replace(/\\/g, "/")).toMatch(/\/node_modules\/tsx\/dist\/cli\.mjs$/);
  expect(tsxCli.replace(/\\/g, "/")).not.toContain("/explorers-earth/node_modules/");
  expect(tsxCli.replace(/\\/g, "/")).not.toContain("/tunes/node_modules/");
  const result = spawnSync(process.execPath, [tsxCli, "-e", "import { musicLiveWriteSkipReason } from './e2e/setup/music.ts'; const skipReason=musicLiveWriteSkipReason(); process.stdout.write(JSON.stringify({skipReason}));"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PLAYWRIGHT_EXTERNAL_BASE_URL: "http://127.0.0.1:55173",
      PLAYWRIGHT_PR_SAFE: "false",
      MUSIC_E2E_LIVE_WRITE: "true",
      MUSIC_E2E_LIVE_WRITE_CONFIRMATION: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
      MUSIC_E2E_FIXTURE_VERSION: MUSIC_PUBLIC_FIXTURE_VERSION,
      MUSIC_E2E_ACCOUNT_USERNAME: "e2e-public-music-sentinel-owner",
      MUSIC_E2E_ACCOUNT_DOCUMENT_ID: "e2e-public-music-sentinel-account",
      MUSIC_E2E_SERVICE_ORIGINS: "http://127.0.0.1:55173,http://127.0.0.1:55000,tcp://127.0.0.1:55432,http://127.0.0.1:51337,http://127.0.0.1:55174",
      MUSIC_E2E_STRAPI_TOKEN: "sentinel-authority-value",
    },
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ skipReason: null });
});

test("live preflight runner invokes package-resolved authority before exact JSON collection", async () => {
  const { runLivePreflight } = await import("../scripts/music-public-live-preflight.mjs");
  const calls: Array<{ executable: string; args: string[]; options: Record<string, unknown> }> = [];
  const collection = JSON.stringify(playwrightJourneyReport());
  const outcome = runLivePreflight({
    spawn: (executable: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ executable, args, options });
      return calls.length === 1
        ? preflightChild(0, JSON.stringify({ skipReason: null }))
        : preflightChild(0, collection);
    },
    processExecPath: process.execPath,
    tsxCli: "declared-package/tsx/cli.mjs",
    playwrightCli: "explorer-package/playwright/cli.js",
    project: "chromium-music-live",
    cwd: process.cwd(),
    environment: {
      ...process.env,
      MUSIC_E2E_STRAPI_TOKEN: "known-secret-value",
      PLAYWRIGHT_JSON_OUTPUT_FILE: "must-not-be-used-by-preflight.json",
    },
    workspaceRoot: process.cwd(),
    knownSecrets: ["known-secret-value"],
  });
  expect(outcome).toMatchObject({ ok: true, exitCode: 0, manifestVersion: LIVE_JOURNEY_MANIFEST_VERSION });
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject({
    executable: process.execPath,
    args: [
      "declared-package/tsx/cli.mjs",
      "-e",
      expect.stringContaining("musicLiveWriteSkipReason"),
    ],
    options: { cwd: process.cwd(), encoding: "utf8", windowsHide: true },
  });
  expect(calls[1]).toMatchObject({
    executable: process.execPath,
    args: [
      "explorer-package/playwright/cli.js",
      "test",
      "--project=chromium-music-live",
      "--list",
      "--reporter=json",
    ],
    options: { cwd: process.cwd(), encoding: "utf8", windowsHide: true },
  });
  expect(calls[0].options.env).not.toHaveProperty("PLAYWRIGHT_JSON_OUTPUT_FILE");
  expect(calls[1].options.env).not.toHaveProperty("PLAYWRIGHT_JSON_OUTPUT_FILE");
});

test("real inert live-project JSON collection classifies exactly 17 mutations and 32 read-only cases", () => {
  const environment = inertLiveCollectionEnvironment();
  expect(environment).not.toHaveProperty("PLAYWRIGHT_JSON_OUTPUT_FILE");
  expect(environment).not.toHaveProperty("PLAYWRIGHT_JSON_OUTPUT_NAME");
  expect(environment).not.toHaveProperty("PLAYWRIGHT_JSON_OUTPUT_DIR");
  const result = spawnSync(process.execPath, [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--project=chromium-music-live",
    "--list",
    "--reporter=json",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment,
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  const report = JSON.parse(result.stdout) as { suites?: JsonCollectionSuite[] };
  const specs = allJsonCollectionSpecs(report);
  const mutationTag = LIVE_MUTATION_TAG.replace(/^@/, "");
  const readOnlyTag = LIVE_READ_ONLY_TAG.replace(/^@/, "");
  const mutationSpecs = specs.filter(({ tags }) => tags.includes(mutationTag));
  const readOnlySpecs = specs.filter(({ tags }) => tags.includes(readOnlyTag));
  expect(specs).toHaveLength(49);
  expect(mutationSpecs).toHaveLength(17);
  expect(readOnlySpecs).toHaveLength(32);
  expect(specs.every(({ tags }) => Number(tags.includes(mutationTag)) + Number(tags.includes(readOnlyTag)) === 1)).toBe(true);
  const classification = classifyLivePreflight({
    authorityResult: preflightChild(0, JSON.stringify({ skipReason: null })),
    collectionResult: result,
    workspaceRoot: process.cwd(),
    knownSecrets: ["sentinel-authority-value"],
  });
  expect(classification, JSON.stringify(classification)).toMatchObject({
    ok: true,
    manifestVersion: LIVE_JOURNEY_MANIFEST_VERSION,
    journeyIds: EXPECTED_LIVE_JOURNEYS.map(({ id }) => id),
  });
});

test("production journey execution command writes JSON that terminal evidence validation consumes", async () => {
  const module = await import("../scripts/music-public-live-preflight.mjs") as unknown as Record<string, unknown>;
  const execute = module.runPlaywrightJourneyExecution;
  expect(typeof execute).toBe("function");
  if (typeof execute !== "function") return;

  const artifactRoot = resolve(".artifacts");
  mkdirSync(artifactRoot, { recursive: true });
  const syntheticRoot = mkdtempSync(join(artifactRoot, "journey-report-contract-"));
  const reportPath = join(syntheticRoot, "playwright-journey-results.json");
  const outputDirectory = join(syntheticRoot, "private-playwright-output");
  const terminalEvidencePath = join(syntheticRoot, "restore-evidence.jsonl");
  const outcomeLedgerPath = join(syntheticRoot, "journey-outcomes.json");
  try {
    const testDirectory = join(syntheticRoot, "e2e");
    mkdirSync(testDirectory, { recursive: true });
    writeFileSync(join(syntheticRoot, "playwright.config.mjs"), [
      'import { defineConfig } from "@playwright/test";',
      'export default defineConfig({ testDir: "./e2e", reporter: "line", projects: [{ name: "synthetic-journey-report" }] });',
      "",
    ].join("\n"));
    for (const source of [
      "e2e/music-fixture-fullstack.spec.ts",
      "e2e/music-public-contract.spec.ts",
      "e2e/profile-theme.spec.ts",
    ]) {
      writeFileSync(join(syntheticRoot, source), syntheticJourneySpecSource(
        EXPECTED_LIVE_JOURNEYS.filter((entry) => entry.source === source),
        EXPECTED_LIVE_READ_ONLY.filter((entry) => entry.source === source),
      ));
    }
    writeFileSync(terminalEvidencePath, `${validJourneyEvidenceRecords().map((record) => JSON.stringify(record)).join("\n")}\n`);

    const outcome = (execute as (input: Record<string, unknown>) => { status: number; executionReport?: unknown })({
      spawn: spawnSync,
      processExecPath: process.execPath,
      playwrightCli: resolve("node_modules/@playwright/test/cli.js"),
      files: [
        "e2e/music-fixture-fullstack.spec.ts",
        "e2e/music-public-contract.spec.ts",
        "e2e/profile-theme.spec.ts",
      ],
      project: "synthetic-journey-report",
      cwd: syntheticRoot,
      environment: { ...process.env },
      reportPath,
      outputDirectory,
      terminalEvidencePath,
      outcomeLedgerPath,
    });
    expect(outcome.status).toBe(0);
    expect(outcome).toMatchObject({ reportStatus: "accepted", privateArtifactCleanup: "deleted" });
    expect(existsSync(reportPath)).toBe(false);
    expect(existsSync(outputDirectory)).toBe(false);
    expect(existsSync(outcomeLedgerPath)).toBe(true);
    expect(JSON.stringify(outcome).length).toBeLessThan(48 * 1024);
    expect(validateLiveJourneyEvidence({
      executionReport: outcome.executionReport,
      records: validJourneyEvidenceRecords(),
    })).toMatchObject({ ok: true });
  } finally {
    rmSync(syntheticRoot, { recursive: true, force: true });
  }
});

test("live journey child is fail-fast with retries disabled without masking final cleanup", async () => {
  const module = await import("../scripts/music-public-live-preflight.mjs") as unknown as Record<string, unknown>;
  const execute = module.runPlaywrightJourneyExecution as (input: Record<string, unknown>) => { status: number };
  const root = resolve(".artifacts", "journey-fail-fast-contract");
  rmSync(root, { recursive: true, force: true });
  const calls: string[][] = [];
  try {
    execute({
    spawn: (_file: string, args: string[]) => { calls.push(args); return { status: 1 }; },
    processExecPath: process.execPath,
    playwrightCli: "playwright-cli",
    files: ["e2e/music-public-contract.spec.ts"],
    project: "chromium-music-live",
    cwd: process.cwd(),
    environment: {},
    reportPath: join(root, "playwright-journey-results.json"),
    outputDirectory: join(root, "private-playwright-output"),
    terminalEvidencePath: join(root, "restore-evidence.jsonl"),
    outcomeLedgerPath: join(root, "journey-outcomes.json"),
    privateArtifactIo: { exists: () => false },
    persistOutcomeLedger: () => ({ status: "persisted" }),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("--max-failures=1");
    expect(calls[0]).toContain("--retries=0");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runner separates orchestration authority from worker authority and binds final recovery to the run", () => {
  const source = readFileSync("scripts/music-public-e2e.mjs", "utf8");
  expect(source).toContain("MUSIC_E2E_ORCHESTRATION_STATE_TOKEN");
  expect(source).toContain('"mutation-guard.json"');
  expect(source).toContain('"mutation-recovery.private.jsonl"');
  expect(source).toContain('`${stateServiceUrl}/restore-final`');
  expect(source).toContain("orchestrationStateToken");
  expect(source).not.toContain('`${stateServiceUrl}/restore`, { method: "POST", headers: { Authorization: `Bearer ${stateToken}`');
});

test("immutable qualification evidence manifests the strict durable mutation guard", () => {
  expect(LIVE_QUALIFICATION_REQUIRED_ARTIFACTS).toContainEqual({
    role: "mutation-guard", path: "mutation-guard.json",
  });
});

test("sanitized journey outcome ledger retains exact 32/12/5 execution and all mutation terminal identities", async () => {
  const module = await import("../scripts/music-public-live-preflight.mjs") as unknown as Record<string, unknown>;
  const buildLedger = module.buildSanitizedJourneyOutcomeLedger;
  const validateLedger = module.validateSanitizedJourneyOutcomeLedger;
  expect(typeof buildLedger, "the stable safe outcome ledger builder must exist").toBe("function");
  expect(typeof validateLedger, "the safe outcome ledger validator must exist").toBe("function");
  if (typeof buildLedger !== "function" || typeof validateLedger !== "function") return;

  const expectedExecution = [...EXPECTED_LIVE_JOURNEYS, ...EXPECTED_LIVE_READ_ONLY];
  const statusById = Object.fromEntries(expectedExecution.map(({ id }, index) => [
    id,
    index < 32 ? "passed" : (index < 44 ? "failed" : "skipped"),
  ]));
  const terminalRecords = EXPECTED_LIVE_JOURNEYS.map(({ id }, index) => ({
    id,
    status: index < 12 ? "passed" : "failed",
    reason: "Bearer hostile-terminal-reason-must-not-survive",
    stage: "C:\\private\\hostile-terminal-stage",
  }));
  const ledger = (buildLedger as (input: Record<string, unknown>) => Record<string, unknown>)({
    executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, { statusById }),
    reportStatus: "accepted",
    terminalRecords,
  }) as {
    schemaVersion: string;
    integrity: string;
    counts: Record<string, Record<string, number>>;
    executionOutcomes: Array<Record<string, unknown>>;
    mutationTerminals: Array<Record<string, unknown>>;
  };

  expect(ledger).toMatchObject({
    schemaVersion: "explorers-public-journey-outcomes/v4",
    integrity: "accepted",
    counts: {
      execution: { total: 49, passed: 32, failed: 12, skipped: 5, notRun: 0 },
      terminal: { total: 17, passed: 12, failed: 5, missing: 0, invalid: 0, notRun: 0 },
    },
  });
  expect(ledger.executionOutcomes.map(({ id }) => id)).toEqual(expectedExecution.map(({ id }) => id));
  expect(ledger.mutationTerminals.map(({ id }) => id)).toEqual(EXPECTED_LIVE_JOURNEYS.map(({ id }) => id));
  expect(ledger.executionOutcomes.every((entry) => Object.keys(entry).sort().join(",") === "id,reason,stage,status")).toBe(true);
  expect(ledger.mutationTerminals.every((entry) => Object.keys(entry).sort().join(",") === "id,reason,stage,status")).toBe(true);
  expect(ledger.mutationTerminals.slice(12)).toEqual(EXPECTED_LIVE_JOURNEYS.slice(12).map(({ id }) => ({
    id,
    status: "failed",
    reason: "terminal-failed",
    stage: "terminal-evidence",
  })));
  const retained = JSON.stringify(ledger);
  expect(retained).not.toContain("hostile-terminal-reason");
  expect(retained).not.toContain("private");
  expect(retained).not.toMatch(/"(?:title|source|file|path|trace|screenshot|stdout|storage|auth)"\s*:/i);
  const hostileTuple = structuredClone(ledger);
  hostileTuple.executionOutcomes[0] = {
    id: EXPECTED_LIVE_JOURNEYS[0].id,
    status: "passed",
    reason: "report-missing",
    stage: "preflight",
  };
  expect((validateLedger as (value: unknown) => boolean)(hostileTuple)).toBe(false);
});

test("terminal reconciliation records skipped and unstarted mutations without inventing passes", async () => {
  const module = await import("../scripts/music-public-live-preflight.mjs") as unknown as Record<string, unknown>;
  const buildLedger = module.buildSanitizedJourneyOutcomeLedger as (input: Record<string, unknown>) => {
    integrity: string; mutationTerminals: Array<Record<string, unknown>>;
  };
  const skippedId = EXPECTED_LIVE_JOURNEYS[0]!.id;
  const ledger = buildLedger({
    executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, {
      resultStatus: "passed", statusById: { [skippedId]: "skipped" },
    }),
    reportStatus: "accepted",
    terminalRecords: [],
    terminalStatus: "accepted",
  });
  expect(ledger.integrity).toBe("incomplete");
  expect(ledger.mutationTerminals[0]).toEqual({
    id: skippedId, status: "skipped", reason: "test-skipped", stage: "execution",
  });
  expect(ledger.mutationTerminals.slice(1).every((record) => record.status === "missing")).toBe(true);
  expect(ledger.mutationTerminals.some((record) => record.status === "passed")).toBe(false);

  const notRun = buildLedger({ reportStatus: "not-run", terminalStatus: "not-run" });
  expect(notRun.mutationTerminals.every((record) => (
    record.status === "not-run" && record.reason === "terminal-not-run" && record.stage === "preflight"
  ))).toBe(true);
});

test("permission failure metadata is fixed, sanitized, and valid only on failed permission terminals", async () => {
  const permissionId = "music.owner-guest.permission.allow-song-requests";
  const hash = "a".repeat(64);
  const permissionFailure = { stage: "queue", code: "contract-invalid" } as const;
  const terminal = buildLiveJourneyTerminal({
    id: permissionId,
    status: "failed",
    reason: "body-failed",
    stage: "body",
    cleanup: "restored",
    beforeHash: hash,
    afterHash: hash,
    permissionFailure,
  });
  expect(terminal.permissionFailure).toEqual(permissionFailure);

  const preflight = await import("../scripts/music-public-live-preflight.mjs");
  const ledger = preflight.buildSanitizedJourneyOutcomeLedger({
    executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, {
      statusById: { [permissionId]: "failed" },
    }),
    reportStatus: "accepted",
    terminalRecords: [terminal],
    terminalStatus: "accepted",
  });
  expect(ledger.schemaVersion).toBe("explorers-public-journey-outcomes/v4");
  expect(ledger.mutationTerminals.find(({ id }) => id === permissionId)).toEqual({
    id: permissionId,
    status: "failed",
    reason: "terminal-failed",
    stage: "terminal-evidence",
    permissionFailure,
  });
  expect(preflight.validateSanitizedJourneyOutcomeLedger(ledger)).toBe(true);
  expect(JSON.stringify(ledger)).not.toMatch(/Bearer|https?:|[A-Z]:\\|qualification-public/i);

  expect(() => buildLiveJourneyTerminal({
    id: permissionId,
    beforeHash: hash,
    afterHash: hash,
    permissionFailure,
  })).toThrow(/permission failure/i);
  expect(() => buildLiveJourneyTerminal({
    id: "music.owner-guest.reconnect",
    status: "failed",
    reason: "body-failed",
    stage: "body",
    cleanup: "restored",
    beforeHash: hash,
    afterHash: hash,
    permissionFailure,
  })).toThrow(/permission failure/i);
  expect(() => buildLiveJourneyTerminal({
    id: permissionId,
    status: "failed",
    reason: "body-failed",
    stage: "body",
    cleanup: "restored",
    beforeHash: hash,
    afterHash: hash,
    permissionFailure: { stage: "C:\\private\\hostile", code: "Bearer hostile" },
  })).toThrow(/permission failure/i);

  const hostilePass = structuredClone(ledger);
  const passIndex = hostilePass.mutationTerminals.findIndex(({ status }) => status === "not-run");
  hostilePass.mutationTerminals[passIndex] = {
    ...hostilePass.mutationTerminals[passIndex],
    status: "passed",
    reason: "none",
    stage: "terminal-evidence",
    permissionFailure,
  };
  expect(preflight.validateSanitizedJourneyOutcomeLedger(hostilePass)).toBe(false);
  const hostileExecution = structuredClone(ledger);
  hostileExecution.executionOutcomes[0].permissionFailure = permissionFailure;
  expect(preflight.validateSanitizedJourneyOutcomeLedger(hostileExecution)).toBe(false);

  const hostilePassedEvidence = validJourneyEvidenceRecords();
  hostilePassedEvidence[2]!.permissionFailure = permissionFailure;
  expect(validateLiveJourneyEvidence({
    executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, { resultStatus: "passed" }),
    records: hostilePassedEvidence,
  })).toMatchObject({ ok: false, subchecks: expect.arrayContaining(["record-contract"]) });
});

test("reconnect canonical reads use the strict public resource revision contract", async () => {
  const requests: string[] = [];
  const revision = await readLiveCanonicalPublicRevision({
    publicSlug: "public_slug-123",
    stage: "initial-canonical-resource",
    read: async (path) => {
      requests.push(path);
      return {
        status: 200,
        body: {
          version: "music-public-resource/v1",
          revision: 9,
          user: { username: "fixture", venueName: null },
          permissions: {
            allowSongRequests: false,
            allowGuestPlayOnDevice: false,
            allowPlaylistSharing: false,
            allowRecentlyPlayedVisibility: false,
            allowQueueVisibility: false,
          },
          currentlyPlaying: null,
          queue: { items: [], total: 0, truncated: false },
          recentlyPlayed: { items: [], total: 0, truncated: false },
          playlists: { items: [], total: 0, truncated: false },
        },
      };
    },
  });
  expect(revision).toBe(9);
  expect(requests).toEqual(["/api/music/public-resource/v1/public_slug-123"]);

  await expect(readLiveCanonicalPublicRevision({
    publicSlug: "public_slug-123",
    stage: "online-canonical-apply",
    read: async () => ({ status: 200, body: { revision: 10 } }),
  })).rejects.toMatchObject({
    name: "LiveReconnectJourneyFailure",
    stage: "online-canonical-apply",
    code: "contract-invalid",
  });
  await expect(readLiveCanonicalPublicRevision({
    publicSlug: "public_slug-123",
    stage: "initial-canonical-resource",
    read: async () => ({ status: 404 }),
  })).rejects.toMatchObject({ code: "http-failed" });
});

test("reconnect failure metadata is fixed, sanitized, and valid only on the failed reconnect terminal", async () => {
  expect(LIVE_RECONNECT_JOURNEY_FAILURE_STAGES).toEqual([
    "preparation", "initial-canonical-resource", "guest-ready", "offline-announcement",
    "owner-controls", "online-canonical-apply", "online-announcement-cleared", "guest-control-visible",
  ]);
  const hash = "b".repeat(64);
  const reconnectFailure = { stage: "offline-announcement", code: "assertion-failed" } as const;
  const terminal = buildLiveJourneyTerminal({
    id: "music.owner-guest.reconnect",
    status: "failed",
    reason: "body-failed",
    stage: "body",
    cleanup: "restored",
    beforeHash: hash,
    afterHash: hash,
    reconnectFailure,
  });
  expect(terminal.reconnectFailure).toEqual(reconnectFailure);

  const preflight = await import("../scripts/music-public-live-preflight.mjs");
  const ledger = preflight.buildSanitizedJourneyOutcomeLedger({
    executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, {
      statusById: { "music.owner-guest.reconnect": "failed" },
    }),
    reportStatus: "accepted",
    terminalRecords: [terminal],
    terminalStatus: "accepted",
  });
  expect(ledger.mutationTerminals.find(({ id }) => id === "music.owner-guest.reconnect")).toEqual({
    id: "music.owner-guest.reconnect",
    status: "failed",
    reason: "terminal-failed",
    stage: "terminal-evidence",
    reconnectFailure,
  });
  expect(preflight.validateSanitizedJourneyOutcomeLedger(ledger)).toBe(true);
  expect(JSON.stringify(ledger)).not.toMatch(/Bearer|https?:|[A-Z]:\\|public_slug-123/i);

  for (const hostile of [
    { id: "music.owner.queue-add", reconnectFailure },
    { id: "music.owner-guest.reconnect", status: "passed", reason: "none", stage: "verification", reconnectFailure },
    { id: "music.owner-guest.reconnect", reconnectFailure: { stage: "C:\\private\\hostile", code: "Bearer hostile" } },
  ]) {
    expect(() => buildLiveJourneyTerminal({
      id: hostile.id,
      status: hostile.status ?? "failed",
      reason: hostile.reason ?? "body-failed",
      stage: hostile.stage ?? "body",
      cleanup: "restored",
      beforeHash: hash,
      afterHash: hash,
      reconnectFailure: hostile.reconnectFailure,
    })).toThrow(/reconnect failure/i);
  }
});

test("restored reconnect failures write one safe substage terminal after exact restoration", async () => {
  const events: string[] = [];
  const terminals: Array<Record<string, unknown>> = [];
  const state = { revision: 0 };
  await expect(withRestoredMusicFixture({
    journeyId: "music.owner-guest.reconnect",
    snapshot: async () => { events.push("snapshot"); return structuredClone(state); },
    cleanupNamespace: async () => { events.push("cleanup"); },
    restore: async () => { events.push("restore"); },
    writeJourneyResult: async (record) => { events.push("terminal"); terminals.push(record as Record<string, unknown>); },
  }, async () => {
    events.push("body");
    throw new LiveReconnectJourneyFailure("guest-ready", "assertion-failed");
  })).rejects.toMatchObject({ stage: "guest-ready", code: "assertion-failed" });
  expect(events).toEqual(["snapshot", "body", "cleanup", "restore", "snapshot", "terminal"]);
  expect(terminals).toEqual([expect.objectContaining({
    id: "music.owner-guest.reconnect",
    status: "failed",
    reason: "body-failed",
    stage: "body",
    cleanup: "restored",
    reconnectFailure: { stage: "guest-ready", code: "assertion-failed" },
  })]);
});

test("the fixture exposes only the exact Socket.IO ws boundary through Explorer", () => {
  // Break caught: the same-origin browser bundle points Socket.IO at Explorer,
  // but Nginx sends /ws to the SPA fallback or broadens Tunes proxy authority.
  const nginx = readFileSync("nginx.music-fixture.conf", "utf8");
  const socketLocations = [...nginx.matchAll(/location\s+~\s+\^\/ws\/\?\$\s*\{([\s\S]*?)\}/g)];
  expect(socketLocations).toHaveLength(1);
  const socket = socketLocations[0]![1]!;
  expect(socket).toContain("proxy_pass http://tunes:5000;");
  expect(socket).toContain("proxy_http_version 1.1;");
  expect(socket).toContain("proxy_set_header Upgrade $http_upgrade;");
  expect(socket).toContain('proxy_set_header Connection "upgrade";');
  expect(socket).toContain("proxy_set_header Host $host;");
  expect(socket).toContain("proxy_set_header Origin $scheme://$http_host;");
  expect(socket).not.toMatch(/proxy_pass\s+http:\/\/tunes:5000\//);
  expect(nginx.match(/proxy_pass http:\/\/tunes:5000;/g)).toHaveLength(3);
  expect(nginx).not.toMatch(/location\s+(?:\^~\s+)?\/ws(?:\/|\s)/);
  expect(nginx).not.toMatch(/location\s+\/\s*\{\s*proxy_pass\s+http:\/\/tunes:5000;/);
});

test("the fixture proxies the current public profile REST gateway through Explorer without authority headers", () => {
  const nginx = readFileSync(resolve("nginx.music-fixture.conf"), "utf8");
  const location = /location\s+\^~\s+\/api\/explorers\/v1\/profiles\/\s*\{([\s\S]*?)\}/.exec(nginx)?.[1];
  expect(location).toBeTruthy();
  expect(location).toContain("proxy_pass http://strapi:1337;");
  expect(location).toMatch(/proxy_set_header\s+Authorization\s+"";/);
  expect(location).toMatch(/proxy_set_header\s+Cookie\s+"";/);
  expect(location).not.toMatch(/\$http_authorization|MUSIC_E2E|STRAPI_ACCESS_TOKEN/i);
});

test("restored permission failures write one safe substage terminal after exact restoration", async () => {
  const events: string[] = [];
  const terminals: Array<Record<string, unknown>> = [];
  const state = { revision: 0 };
  await expect(withRestoredMusicFixture({
    journeyId: "music.owner-guest.permission.allow-song-requests",
    snapshot: async () => { events.push("snapshot"); return structuredClone(state); },
    cleanupNamespace: async () => { events.push("cleanup"); },
    restore: async () => { events.push("restore"); },
    writeJourneyResult: async (record) => { events.push("terminal"); terminals.push(record as Record<string, unknown>); },
  }, async () => {
    events.push("body");
    throw new LivePublicJourneyFailure("private-dashboard", "contract-invalid");
  })).rejects.toMatchObject({ stage: "private-dashboard", code: "contract-invalid" });
  expect(events).toEqual(["snapshot", "body", "cleanup", "restore", "snapshot", "terminal"]);
  expect(terminals).toEqual([expect.objectContaining({
    id: "music.owner-guest.permission.allow-song-requests",
    status: "failed",
    reason: "body-failed",
    stage: "body",
    cleanup: "restored",
    permissionFailure: { stage: "private-dashboard", code: "contract-invalid" },
  })]);
});

test("fail-fast partial reports retain stopped journeys and reject a passed terminal after execution failure", async () => {
  const livePreflight = await import("../scripts/music-public-live-preflight.mjs");
  const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
  const failedId = EXPECTED_LIVE_JOURNEYS[0]!.id;
  const executionReport = playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, {
    statusById: { [failedId]: "failed" },
  });
  const ledger = livePreflight.buildSanitizedJourneyOutcomeLedger({
    executionReport,
    reportStatus: "accepted",
    terminalRecords: [{ id: failedId, status: "passed" }],
    terminalStatus: "accepted",
  });

  expect(ledger).toMatchObject({
    schemaVersion: "explorers-public-journey-outcomes/v4",
    integrity: "invalid",
    counts: {
      execution: { total: 49, passed: 0, failed: 1, skipped: 0, notRun: 48 },
      terminal: { total: 17, passed: 0, failed: 0, missing: 0, invalid: 1, notRun: 16 },
    },
  });
  expect(ledger.executionOutcomes[0]).toEqual({
    id: failedId, status: "failed", reason: "test-failed", stage: "execution",
  });
  expect(ledger.executionOutcomes.slice(1).every((entry) => (
    entry.status === "not-run" && entry.reason === "execution-stopped" && entry.stage === "execution"
  ))).toBe(true);
  expect(ledger.mutationTerminals[0]).toEqual({
    id: failedId,
    status: "invalid",
    reason: "terminal-execution-mismatch",
    stage: "post-terminal",
  });
  expect(ledger.mutationTerminals.slice(1).every((entry) => (
    entry.status === "not-run" && entry.reason === "execution-stopped" && entry.stage === "execution"
  ))).toBe(true);
  expect(livePreflight.validateSanitizedJourneyOutcomeLedger(ledger)).toBe(true);
  const hostileMismatch = structuredClone(ledger);
  hostileMismatch.mutationTerminals[0] = {
    id: failedId, status: "invalid", reason: "terminal-execution-mismatch", stage: "terminal-evidence",
  };
  expect(livePreflight.validateSanitizedJourneyOutcomeLedger(hostileMismatch)).toBe(false);
  const staleMissingResult = structuredClone(ledger);
  staleMissingResult.executionOutcomes[1] = {
    id: EXPECTED_LIVE_JOURNEYS[1]!.id, status: "failed", reason: "result-missing", stage: "execution",
  };
  expect(livePreflight.validateSanitizedJourneyOutcomeLedger(staleMissingResult)).toBe(false);

  const runDirectory = resolve("guarded/run21df-shaped-ledger");
  const reportPath = join(runDirectory, "playwright-journey-results.json");
  const outputDirectory = join(runDirectory, "private-playwright-output");
  const terminalEvidencePath = join(runDirectory, "restore-evidence.jsonl");
  const outcomeLedgerPath = join(runDirectory, "journey-outcomes.json");
  let persistedLedger: unknown;
  const executionOutcome = livePreflight.runPlaywrightJourneyExecution({
    spawn: () => ({ status: 1 }),
    processExecPath: process.execPath,
    playwrightCli: "playwright-cli.js",
    files: ["e2e/music-fixture-fullstack.spec.ts", "e2e/music-public-contract.spec.ts", "e2e/profile-theme.spec.ts"],
    project: "synthetic-run21df",
    cwd: process.cwd(),
    environment: { ...process.env },
    reportPath,
    outputDirectory,
    terminalEvidencePath,
    outcomeLedgerPath,
    persistOutcomeLedger: ({ ledger: value }: { ledger: unknown }) => { persistedLedger = value; },
    privateArtifactIo: {
      exists: (path: string) => path === reportPath || path === terminalEvidencePath,
      size: (path: string) => Buffer.byteLength(path === reportPath
        ? JSON.stringify(executionReport)
        : JSON.stringify({ id: failedId, status: "passed" })),
      read: (path: string) => path === reportPath
        ? JSON.stringify(executionReport)
        : JSON.stringify({ id: failedId, status: "passed" }),
      unlink: () => undefined,
      removeDirectory: () => undefined,
    },
  });
  expect(executionOutcome).toMatchObject({
    status: expect.any(Number),
    reportStatus: "accepted",
    outcomeLedgerStatus: "persisted",
    privateArtifactCleanup: "deleted",
    journeyOutcomeLedger: ledger,
  });
  expect(executionOutcome.status).not.toBe(0);
  expect(persistedLedger).toEqual(ledger);

  const finalHash = "e".repeat(64);
  const records = qualificationArtifacts.buildQualificationOutcomeRecords({
    lane: "live",
    executionOutcome,
    report: {
      cleanup: "restored",
      finalRestore: { beforeHash: finalHash, afterHash: finalHash },
    },
  });
  expect(records.skipLedger).toEqual({
    schemaVersion: "explorers-public-skip-ledger/v1",
    lane: "live",
    execution: "execution-stopped",
    totals: { total: 1, passed: 0, failed: 1, skipped: 0 },
    reasons: [{ scope: "lane", reason: "execution-stopped" }],
  });
  expect(records.restorationRecord).toEqual({
    schemaVersion: "explorers-public-restoration/v1",
    status: "initial-restored",
    finalRestore: { beforeHash: finalHash, afterHash: finalHash },
    journeys: [],
  });
});

test("missing malformed and hostile journey reports retain only fixed safe diagnostics", async () => {
  const module = await import("../scripts/music-public-live-preflight.mjs") as unknown as Record<string, unknown>;
  const buildLedger = module.buildSanitizedJourneyOutcomeLedger;
  expect(typeof buildLedger, "the stable safe outcome ledger builder must exist").toBe("function");
  if (typeof buildLedger !== "function") return;

  const hostilePath = "C:\\private\\playwright\\Bearer hostile-report-secret.json";
  const cases = [
    { reportStatus: "missing", executionReport: undefined, reason: "report-missing" },
    { reportStatus: "parse-failed", executionReport: undefined, reason: "report-malformed" },
    { reportStatus: "too-large", executionReport: undefined, reason: "report-too-large" },
    {
      reportStatus: "accepted",
      executionReport: {
        suites: [{ specs: [{
          title: `Bearer hostile-report-secret ${hostilePath}`,
          file: hostilePath,
          tags: [LIVE_MUTATION_TAG],
          tests: [{ results: [{ status: "failed" }] }],
        }] }],
      },
      reason: "report-invalid",
    },
  ];
  for (const fixture of cases) {
    const ledger = (buildLedger as (input: Record<string, unknown>) => {
      integrity: string;
      executionOutcomes: Array<Record<string, unknown>>;
      mutationTerminals: Array<Record<string, unknown>>;
    })({ ...fixture, terminalRecords: undefined });
    expect(ledger.integrity).toBe("invalid");
    expect(ledger.executionOutcomes).toHaveLength(49);
    expect(ledger.executionOutcomes.every((entry) => entry.status === "failed" && entry.reason === fixture.reason)).toBe(true);
    expect(ledger.mutationTerminals).toHaveLength(17);
    expect(ledger.mutationTerminals.every((entry) => entry.status === "missing" && entry.reason === "terminal-missing")).toBe(true);
    const retained = JSON.stringify(ledger);
    expect(retained).not.toContain("hostile-report-secret");
    expect(retained).not.toContain(hostilePath);
    expect(retained.replaceAll("\\", "/")).not.toContain(hostilePath.replaceAll("\\", "/"));
  }
  const malformedTerminal = (buildLedger as (input: Record<string, unknown>) => {
    integrity: string;
    mutationTerminals: Array<Record<string, unknown>>;
  })({ reportStatus: "not-run", terminalStatus: "parse-failed", terminalRecords: undefined });
  expect(malformedTerminal.integrity).toBe("invalid");
  expect(malformedTerminal.mutationTerminals.every((entry) => (
    entry.status === "invalid" && entry.reason === "terminal-invalid" && entry.stage === "terminal-evidence"
  ))).toBe(true);
});

test("journey outcome ledger is persisted before private deletion and persistence failure still cleans fail-closed", async () => {
  const module = await import("../scripts/music-public-live-preflight.mjs") as unknown as Record<string, unknown>;
  const execute = module.runPlaywrightJourneyExecution;
  expect(typeof execute).toBe("function");
  if (typeof execute !== "function") return;

  for (const persistence of ["succeeds", "fails"] as const) {
    const runDirectory = resolve(`guarded/run-ledger-${persistence}`);
    const reportPath = join(runDirectory, "playwright-journey-results.json");
    const outputDirectory = join(runDirectory, "private-playwright-output");
    const terminalEvidencePath = join(runDirectory, "restore-evidence.jsonl");
    const outcomeLedgerPath = join(runDirectory, "journey-outcomes.json");
    const calls: string[] = [];
    const report = JSON.stringify(playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, { resultStatus: "failed" }));
    const terminals = validJourneyEvidenceRecords().map((record) => JSON.stringify(record)).join("\n");
    const outcome = (execute as (input: Record<string, unknown>) => Record<string, unknown>)({
      spawn: () => ({ status: 1 }),
      processExecPath: process.execPath,
      playwrightCli: "playwright-cli.js",
      files: ["e2e/profile-theme.spec.ts"],
      project: "synthetic-private-report",
      cwd: process.cwd(),
      environment: { ...process.env },
      reportPath,
      outputDirectory,
      terminalEvidencePath,
      outcomeLedgerPath,
      persistOutcomeLedger: ({ path: exactPath, ledger }: { path: string; ledger: unknown }) => {
        calls.push(`persist:${exactPath}`);
        expect(JSON.stringify(ledger)).not.toMatch(/(?:Bearer|beforeHash|afterHash|rows|title|source|path)/);
        if (persistence === "fails") throw new Error("Bearer persistence-secret");
      },
      privateArtifactIo: {
        exists: (path: string) => { calls.push(`exists:${path}`); return path !== outcomeLedgerPath; },
        size: (path: string) => { calls.push(`size:${path}`); return Buffer.byteLength(path === reportPath ? report : terminals); },
        read: (path: string) => { calls.push(`read:${path}`); return path === reportPath ? report : terminals; },
        unlink: (path: string) => { calls.push(`unlink:${path}`); },
        removeDirectory: (path: string) => { calls.push(`remove-directory:${path}`); },
      },
    });
    expect(calls.indexOf(`persist:${outcomeLedgerPath}`)).toBeGreaterThan(calls.indexOf(`read:${terminalEvidencePath}`));
    expect(calls.indexOf(`persist:${outcomeLedgerPath}`)).toBeLessThan(calls.indexOf(`unlink:${reportPath}`));
    expect(calls).toContain(`remove-directory:${outputDirectory}`);
    expect(outcome).toMatchObject({
      status: expect.any(Number),
      outcomeLedgerStatus: persistence === "succeeds" ? "persisted" : "persist-failed",
      privateArtifactCleanup: "deleted",
    });
    expect(outcome.status).not.toBe(0);
    expect(Object.hasOwn(outcome, "journeyOutcomeLedger")).toBe(persistence === "succeeds");
    expect(JSON.stringify(outcome)).not.toContain("persistence-secret");
  }
});

test("journey evidence validation accumulates execution and terminal defects while final restore remains independent", async () => {
  const executionReport = playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, { resultStatus: "failed" });
  const incompleteRecords = validJourneyEvidenceRecords().slice(0, 12);
  expect(validateLiveJourneyEvidence({ executionReport, records: incompleteRecords })).toMatchObject({
    ok: false,
    subcheck: "execution-status",
    subchecks: ["execution-status", "records-missing"],
  });

  const finalHash = "d".repeat(64);
  const orchestrationInput = {
    snapshotExists: true,
    baseReport: { version: MUSIC_PUBLIC_FIXTURE_VERSION, runId: "multi-defect-retention", lane: "live" },
    artifacts: {
      directory: "guarded/multi-defect-retention",
      authPath: "owner-auth.json",
      storagePath: "profile-storage-state.json",
      mkdir: () => undefined,
      write: () => undefined,
      chmod: () => undefined,
    },
    restoreEvidence: {
      path: "restore-evidence.jsonl",
      exists: () => true,
      read: () => incompleteRecords.map((record) => JSON.stringify(record)).join("\n"),
    },
    execute: async () => ({
      status: 1,
      reportStatus: "accepted",
      privateArtifactCleanup: "deleted",
      executionReport,
    }),
    teardown: {
      artifactPaths: [],
      artifactDirectories: [],
      exists: () => false,
      unlink: () => undefined,
      removeDirectory: () => undefined,
      stopStateService: () => undefined,
      down: () => 0,
    },
    writeReport: async () => undefined,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  };
  const outcome = await runMusicFixtureOrchestration({
    ...orchestrationInput,
    restore: async () => ({ ok: true, cleanup: "restored", beforeHash: finalHash, afterHash: finalHash }),
  });
  expect(outcome).toMatchObject({
    exitCode: 5,
    report: {
      result: "failed",
      cleanup: "restored",
      finalRestore: { beforeHash: finalHash, afterHash: finalHash },
      journeyDiagnostics: { subchecks: ["execution-status", "records-missing"] },
    },
  });

  const restoreFailure = await runMusicFixtureOrchestration({
    ...orchestrationInput,
    baseReport: { ...orchestrationInput.baseReport, runId: "multi-defect-restore-failure" },
    restore: async () => ({ ok: false, cleanup: "restore-failed" }),
  });
  expect(restoreFailure).toMatchObject({
    exitCode: 5,
    report: {
      result: "failed",
      cleanup: "restore-failed",
      journeyDiagnostics: { subchecks: ["execution-status", "records-missing"] },
    },
  });
  expect(restoreFailure.report.finalRestore).toBeUndefined();
});

test("failing production child retains only bounded canonical evidence and deletes every private Playwright artifact", async () => {
  const artifactRoot = resolve(".artifacts");
  mkdirSync(artifactRoot, { recursive: true });
  const syntheticRoot = mkdtempSync(join(artifactRoot, "hostile-journey-report-contract-"));
  const reportPath = join(syntheticRoot, "playwright-journey-results.json");
  const outputDirectory = join(syntheticRoot, "private-playwright-output");
  const terminalEvidencePath = join(syntheticRoot, "restore-evidence.jsonl");
  const outcomeLedgerPath = join(syntheticRoot, "journey-outcomes.json");
  const hostile = {
    title: EXPECTED_LIVE_JOURNEYS[0].title,
    bearer: "hostile.bearer.sentinel",
    accessToken: "hostile-access-token-sentinel",
    capability: "hostile-capability-sentinel",
    credential: "hostile-credential-sentinel",
    absolutePath: join(syntheticRoot, "private attachment", "hostile-secret.txt"),
  };
  try {
    const testDirectory = join(syntheticRoot, "e2e");
    mkdirSync(testDirectory, { recursive: true });
    writeFileSync(join(syntheticRoot, "playwright.config.mjs"), [
      'import { defineConfig } from "@playwright/test";',
      `export default defineConfig({ testDir: "./e2e", reporter: "line", outputDir: ${JSON.stringify(outputDirectory)}, projects: [{ name: "synthetic-hostile-report" }] });`,
      "",
    ].join("\n"));
    for (const source of [
      "e2e/music-fixture-fullstack.spec.ts",
      "e2e/music-public-contract.spec.ts",
      "e2e/profile-theme.spec.ts",
    ]) {
      writeFileSync(join(syntheticRoot, source), syntheticJourneySpecSource(
        EXPECTED_LIVE_JOURNEYS.filter((entry) => entry.source === source),
        EXPECTED_LIVE_READ_ONLY.filter((entry) => entry.source === source),
        hostile,
      ));
    }
    writeFileSync(terminalEvidencePath, `${validJourneyEvidenceRecords().map((record) => JSON.stringify(record)).join("\n")}\n`);

    const wrapperPath = join(syntheticRoot, "run-production-execution.mjs");
    writeFileSync(wrapperPath, [
      'import { spawnSync } from "node:child_process";',
      `import { runPlaywrightJourneyExecution } from ${JSON.stringify(pathToFileURL(resolve("scripts/music-public-live-preflight.mjs")).href)};`,
      "const outcome = runPlaywrightJourneyExecution({",
      "  spawn: spawnSync,",
      `  processExecPath: ${JSON.stringify(process.execPath)},`,
      `  playwrightCli: ${JSON.stringify(resolve("node_modules/@playwright/test/cli.js"))},`,
      `  files: ${JSON.stringify(["e2e/music-fixture-fullstack.spec.ts", "e2e/music-public-contract.spec.ts", "e2e/profile-theme.spec.ts"])},`,
      '  project: "synthetic-hostile-report",',
      `  cwd: ${JSON.stringify(syntheticRoot)},`,
      "  environment: { ...process.env },",
      `  reportPath: ${JSON.stringify(reportPath)},`,
      `  outputDirectory: ${JSON.stringify(outputDirectory)},`,
      `  terminalEvidencePath: ${JSON.stringify(terminalEvidencePath)},`,
      `  outcomeLedgerPath: ${JSON.stringify(outcomeLedgerPath)},`,
      "});",
      "process.stdout.write(JSON.stringify(outcome));",
      "",
    ].join("\n"));

    const result = spawnSync(process.execPath, [wrapperPath], {
      cwd: syntheticRoot,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      maxBuffer: 16 * 1024 * 1024,
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const outcome = JSON.parse(result.stdout) as {
      status: number;
      reportStatus?: string;
      privateArtifactCleanup?: string;
      executionReport?: unknown;
    };
    expect(outcome).toMatchObject({
      status: expect.any(Number),
      reportStatus: "accepted",
      privateArtifactCleanup: "deleted",
    });
    expect(outcome.status).not.toBe(0);
    expect(existsSync(reportPath)).toBe(false);
    expect(existsSync(outputDirectory)).toBe(false);
    expect(JSON.stringify(outcome).length).toBeLessThan(48 * 1024);
    expect(validateLiveJourneyEvidence({
      executionReport: outcome.executionReport,
      records: validJourneyEvidenceRecords(),
    })).toMatchObject({ ok: false, subcheck: "execution-status" });

    const terminal = await runSyntheticTerminalOutcome(outcome, "hostile-private-report");
    expect(terminal.outcome).toMatchObject({
      exitCode: 5,
      report: {
        result: "failed",
        cleanup: "restored",
        journeyReportStatus: "accepted",
        journeyArtifactCleanup: "deleted",
        journeyDiagnostics: { subcheck: "execution-status" },
      },
    });
    expect(JSON.stringify(terminal.outcome.report).length).toBeLessThan(16 * 1024);

    const retained = `${result.stdout}\n${result.stderr}\n${JSON.stringify(outcome)}\n${terminal.retained}`;
    for (const secret of [hostile.bearer, hostile.accessToken, hostile.capability, hostile.credential]) {
      expect(retained).not.toContain(secret);
    }
    expect(retained).not.toContain(hostile.absolutePath);
    expect(retained.replaceAll("\\", "/")).not.toContain(hostile.absolutePath.replaceAll("\\", "/"));
    expect(retained).not.toContain("hostile-output-hostile-output-hostile-output");
  } finally {
    rmSync(syntheticRoot, { recursive: true, force: true });
  }
});

test("unknown hostile mutation identity is replaced by fixed sentinels before manifest validation", async () => {
  const module = await import("../scripts/music-public-live-preflight.mjs") as unknown as Record<string, unknown>;
  const execute = module.runPlaywrightJourneyExecution;
  expect(typeof execute).toBe("function");
  if (typeof execute !== "function") return;

  const hostileTitle = "Bearer hostile.unknown.token access_token=unknown-access credential=unknown-credential";
  const hostileSource = resolve("private hostile source", "capability=unknown-capability.spec.ts");
  const entries = EXPECTED_LIVE_JOURNEYS.map((entry, index) => index === 0
    ? { ...entry, title: hostileTitle, source: hostileSource }
    : entry);
  const reportPath = resolve("guarded/run-hostile-identity/playwright-journey-results.json");
  const outputDirectory = resolve("guarded/run-hostile-identity/private-playwright-output");
  const terminalEvidencePath = resolve("guarded/run-hostile-identity/restore-evidence.jsonl");
  const outcomeLedgerPath = resolve("guarded/run-hostile-identity/journey-outcomes.json");
  const terminalRecords = validJourneyEvidenceRecords().map((record) => JSON.stringify(record)).join("\n");
  const calls: string[] = [];
  const outcome = (execute as (input: Record<string, unknown>) => {
    status: number;
    reportStatus?: string;
    privateArtifactCleanup?: string;
    executionReport?: unknown;
  })({
    spawn: () => ({ status: 0 }),
    processExecPath: process.execPath,
    playwrightCli: "playwright-cli.js",
    files: ["e2e/profile-theme.spec.ts"],
    project: "synthetic-private-report",
    cwd: process.cwd(),
    environment: { ...process.env },
    reportPath,
    outputDirectory,
    terminalEvidencePath,
    outcomeLedgerPath,
    persistOutcomeLedger: ({ path }: { path: string }) => { calls.push(`persist:${path}`); },
    privateArtifactIo: {
      exists: (path: string) => { calls.push(`exists:${path}`); return path !== outcomeLedgerPath; },
      size: (path: string) => { calls.push(`size:${path}`); return path === reportPath ? 4096 : Buffer.byteLength(terminalRecords); },
      read: (path: string) => { calls.push(`read:${path}`); return path === reportPath
        ? JSON.stringify(playwrightJourneyReport(entries, { resultStatus: "passed" }))
        : terminalRecords; },
      unlink: (path: string) => { calls.push(`unlink:${path}`); },
      removeDirectory: (path: string) => { calls.push(`remove-directory:${path}`); },
    },
  });
  expect(outcome).toMatchObject({ status: expect.any(Number), reportStatus: "accepted", privateArtifactCleanup: "deleted" });
  expect(outcome.status).not.toBe(0);
  expect(validateLiveJourneyEvidence({
    executionReport: outcome.executionReport,
    records: validJourneyEvidenceRecords(),
  })).toMatchObject({ ok: false, subcheck: "manifest-unknown" });
  const terminal = await runSyntheticTerminalOutcome(outcome, "hostile-identity");
  expect(terminal.outcome).toMatchObject({
    exitCode: 5,
    report: {
      result: "failed",
      cleanup: "restored",
      journeyDiagnostics: { subcheck: "manifest-unknown" },
    },
  });
  const retained = `${JSON.stringify(outcome)}\n${terminal.retained}`;
  expect(retained).not.toContain(hostileTitle);
  expect(retained).not.toContain(hostileSource);
  expect(retained.replaceAll("\\", "/")).not.toContain(hostileSource.replaceAll("\\", "/"));
  expect(retained).not.toMatch(/unknown-(?:access|credential|capability)/);
  expect(JSON.stringify(terminal.outcome.report).length).toBeLessThan(16 * 1024);
  expect(calls).toEqual([
    `exists:${reportPath}`,
    `size:${reportPath}`,
    `read:${reportPath}`,
    `exists:${terminalEvidencePath}`,
    `size:${terminalEvidencePath}`,
    `read:${terminalEvidencePath}`,
    `persist:${outcomeLedgerPath}`,
    `exists:${reportPath}`,
    `unlink:${reportPath}`,
    `exists:${outputDirectory}`,
    `remove-directory:${outputDirectory}`,
  ]);
});

test("private raw report size and parse failures are rejected before retention and deleted in finally", async () => {
  const module = await import("../scripts/music-public-live-preflight.mjs") as unknown as Record<string, unknown>;
  const execute = module.runPlaywrightJourneyExecution;
  expect(typeof execute).toBe("function");
  if (typeof execute !== "function") return;

  for (const failure of ["too-large", "parse-failed"] as const) {
    const calls: string[] = [];
    let reads = 0;
    const reportPath = resolve(`guarded/run-${failure}/playwright-journey-results.json`);
    const outputDirectory = resolve(`guarded/run-${failure}/private-playwright-output`);
    const terminalEvidencePath = resolve(`guarded/run-${failure}/restore-evidence.jsonl`);
    const outcomeLedgerPath = resolve(`guarded/run-${failure}/journey-outcomes.json`);
    const terminalRecords = validJourneyEvidenceRecords().map((record) => JSON.stringify(record)).join("\n");
    const outcome = (execute as (input: Record<string, unknown>) => {
      status: number;
      reportStatus?: string;
      privateArtifactCleanup?: string;
      executionReport?: unknown;
    })({
      spawn: () => ({ status: 0 }),
      processExecPath: process.execPath,
      playwrightCli: "playwright-cli.js",
      files: ["e2e/profile-theme.spec.ts"],
      project: "synthetic-private-report",
      cwd: process.cwd(),
      environment: { ...process.env },
      reportPath,
      outputDirectory,
      terminalEvidencePath,
      outcomeLedgerPath,
      persistOutcomeLedger: ({ path }: { path: string }) => { calls.push(`persist:${path}`); },
      privateArtifactIo: {
        exists: (path: string) => { calls.push(`exists:${path}`); return path !== outcomeLedgerPath; },
        size: (path: string) => { calls.push(`size:${path}`); return path === reportPath
          ? (failure === "too-large" ? 64 * 1024 * 1024 : 12)
          : Buffer.byteLength(terminalRecords); },
        read: (path: string) => {
          calls.push(`read:${path}`);
          if (path === reportPath) { reads += 1; return "{not-json"; }
          return terminalRecords;
        },
        unlink: (path: string) => { calls.push(`unlink:${path}`); },
        removeDirectory: (path: string) => { calls.push(`remove-directory:${path}`); },
      },
    });
    expect(outcome).toMatchObject({
      status: expect.any(Number),
      reportStatus: failure,
      privateArtifactCleanup: "deleted",
    });
    expect(outcome.status, failure).not.toBe(0);
    expect(outcome.executionReport, failure).toBeUndefined();
    expect(reads, failure).toBe(failure === "too-large" ? 0 : 1);
    expect(calls, failure).toEqual([
      `exists:${reportPath}`,
      `size:${reportPath}`,
      ...(failure === "too-large" ? [] : [`read:${reportPath}`]),
      `exists:${terminalEvidencePath}`,
      `size:${terminalEvidencePath}`,
      `read:${terminalEvidencePath}`,
      `persist:${outcomeLedgerPath}`,
      `exists:${reportPath}`,
      `unlink:${reportPath}`,
      `exists:${outputDirectory}`,
      `remove-directory:${outputDirectory}`,
    ]);
    const terminal = await runSyntheticTerminalOutcome(outcome, `private-report-${failure}`);
    expect(terminal.outcome).toMatchObject({
      exitCode: 5,
      report: {
        result: "failed",
        cleanup: "restored",
        journeyReportStatus: failure,
        journeyArtifactCleanup: "deleted",
        journeyDiagnostics: { subcheck: `execution-report-${failure}` },
      },
    });
  }
});

test("first private report deletion failure is evidence-missing while restore and every teardown step still run", async () => {
  const module = await import("../scripts/music-public-live-preflight.mjs") as unknown as Record<string, unknown>;
  const execute = module.runPlaywrightJourneyExecution;
  expect(typeof execute).toBe("function");
  if (typeof execute !== "function") return;

  const reportPath = resolve("guarded/run-delete-failure/playwright-journey-results.json");
  const outputDirectory = resolve("guarded/run-delete-failure/private-playwright-output");
  const terminalEvidencePath = resolve("guarded/run-delete-failure/restore-evidence.jsonl");
  const outcomeLedgerPath = resolve("guarded/run-delete-failure/journey-outcomes.json");
  const terminalRecords = validJourneyEvidenceRecords().map((record) => JSON.stringify(record)).join("\n");
  const helperCalls: string[] = [];
  const executionOutcome = (execute as (input: Record<string, unknown>) => {
    status: number;
    reportStatus?: string;
    privateArtifactCleanup?: string;
    executionReport?: unknown;
  })({
    spawn: () => ({ status: 0 }),
    processExecPath: process.execPath,
    playwrightCli: "playwright-cli.js",
    files: ["e2e/profile-theme.spec.ts"],
    project: "synthetic-private-report",
    cwd: process.cwd(),
    environment: { ...process.env },
    reportPath,
    outputDirectory,
    terminalEvidencePath,
    outcomeLedgerPath,
    persistOutcomeLedger: ({ path }: { path: string }) => { helperCalls.push(`persist:${path}`); },
    privateArtifactIo: {
      exists: (path: string) => { helperCalls.push(`exists:${path}`); return true; },
      size: (path: string) => { helperCalls.push(`size:${path}`); return path === reportPath ? 1024 : Buffer.byteLength(terminalRecords); },
      read: (path: string) => { helperCalls.push(`read:${path}`); return path === reportPath
        ? JSON.stringify(playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, { resultStatus: "passed" }))
        : terminalRecords; },
      unlink: (path: string) => { helperCalls.push(`unlink:${path}`); throw new Error("Bearer private-delete-secret"); },
      removeDirectory: (path: string) => { helperCalls.push(`remove-directory:${path}`); },
    },
  });
  expect(executionOutcome).toMatchObject({
    status: expect.any(Number),
    reportStatus: "accepted",
    privateArtifactCleanup: "delete-failed",
  });
  expect(executionOutcome.status).not.toBe(0);
  expect(helperCalls).toEqual([
    `exists:${reportPath}`,
    `size:${reportPath}`,
    `read:${reportPath}`,
    `exists:${terminalEvidencePath}`,
    `size:${terminalEvidencePath}`,
    `read:${terminalEvidencePath}`,
    `persist:${outcomeLedgerPath}`,
    `exists:${reportPath}`,
    `unlink:${reportPath}`,
    `exists:${outputDirectory}`,
    `remove-directory:${outputDirectory}`,
  ]);

  const finalHash = "e".repeat(64);
  const teardownCalls: string[] = [];
  const outcome = await runMusicFixtureOrchestration({
    snapshotExists: true,
    baseReport: { version: MUSIC_PUBLIC_FIXTURE_VERSION, runId: "private-delete-failure", lane: "live" },
    artifacts: {
      directory: "guarded/run-delete-failure",
      authPath: "owner-auth.json",
      storagePath: "profile-storage-state.json",
      mkdir: () => undefined,
      write: () => undefined,
      chmod: () => undefined,
    },
    restoreEvidence: {
      path: "restore-evidence.jsonl",
      exists: () => true,
      read: () => validJourneyEvidenceRecords().map((record) => JSON.stringify(record)).join("\n"),
    },
    execute: async () => executionOutcome,
    restore: async () => {
      teardownCalls.push("initial-restore");
      return { ok: true, cleanup: "restored", beforeHash: finalHash, afterHash: finalHash };
    },
    teardown: {
      artifactPaths: [reportPath, "owner-auth.json", "profile-storage-state.json"],
      artifactDirectories: [outputDirectory],
      exists: (path: string) => { teardownCalls.push(`exists:${path}`); return true; },
      unlink: (path: string) => { teardownCalls.push(`unlink:${path}`); },
      removeDirectory: (path: string) => { teardownCalls.push(`remove-directory:${path}`); },
      stopStateService: () => { teardownCalls.push("state-service-stop"); },
      down: () => { teardownCalls.push("exact-fixture-down"); return 0; },
    },
    writeReport: async () => undefined,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });
  expect(teardownCalls).toEqual([
    "initial-restore",
    `exists:${reportPath}`,
    `unlink:${reportPath}`,
    "exists:owner-auth.json",
    "unlink:owner-auth.json",
    "exists:profile-storage-state.json",
    "unlink:profile-storage-state.json",
    `exists:${outputDirectory}`,
    `remove-directory:${outputDirectory}`,
    "state-service-stop",
    "exact-fixture-down",
  ]);
  expect(outcome).toMatchObject({
    exitCode: 5,
    teardownStatus: 0,
    report: {
      result: "failed",
      cleanup: "evidence-missing",
      journeyArtifactCleanup: "delete-failed",
    },
  });
});

test("clean PR-safe collection does not require live Music environment", () => {
  const env = { ...process.env, PLAYWRIGHT_PR_SAFE: "true" };
  for (const key of Object.keys(env)) if (key.startsWith("MUSIC_E2E_")) delete env[key];
  const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--list", "--project=chromium-music-fixture", "e2e/music-fixture-fullstack.spec.ts", "e2e/music-public-contract.spec.ts"], {
    cwd: process.cwd(), encoding: "utf8", env,
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("Total:");
});

test("live callback token is required only after the complete authority tuple", () => {
  const authority = {
    PLAYWRIGHT_EXTERNAL_BASE_URL: "http://127.0.0.1:55173",
    MUSIC_E2E_LIVE_WRITE: "true",
    MUSIC_E2E_LIVE_WRITE_CONFIRMATION: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
    MUSIC_E2E_FIXTURE_VERSION: MUSIC_PUBLIC_FIXTURE_VERSION,
    MUSIC_E2E_ACCOUNT_USERNAME: "e2e-public-music-contract-owner",
    MUSIC_E2E_ACCOUNT_DOCUMENT_ID: "e2e-public-music-contract-account",
    MUSIC_E2E_SERVICE_ORIGINS: "http://127.0.0.1:55173,http://127.0.0.1:55000",
  };
  expect(() => musicLiveStrapiTokenFromEnvironment(authority)).toThrow(/MUSIC_E2E_STRAPI_TOKEN/);
  expect(musicLiveStrapiTokenFromEnvironment({ ...authority, MUSIC_E2E_STRAPI_TOKEN: "contract-token-0123456789" })).toBe("contract-token-0123456789");
});

test("Playwright and CI configuration do not inject or require a live callback token", () => {
  const config = readFileSync("playwright.config.ts", "utf8");
  const workflow = readFileSync("../.github/workflows/tunes.yml", "utf8");
  expect(config).not.toContain("fixture-read-only-token");
  expect(config).not.toContain("MUSIC_E2E_STRAPI_TOKEN ??=");
  expect(workflow).not.toMatch(/MUSIC_E2E_STRAPI_TOKEN:\s*\$\{\{/);
});

test("PR-safe execution cannot acquire live-write authority", () => {
  expect(resolveMusicTestLane({ PLAYWRIGHT_PR_SAFE: "true", MUSIC_E2E_LIVE_WRITE: "true" })).toBe("pr-safe");
  expect(() => assertLiveWriteAuthority({
    lane: "pr-safe",
    liveWriteEnabled: true,
    baseUrl: "http://127.0.0.1:55173",
    serviceOrigins: ["http://127.0.0.1:55173", "http://127.0.0.1:53001"],
    accountDocumentId: "e2e-public-music-run-123-account",
    accountUsername: "e2e-public-music-run-123-owner",
    fixtureVersion: MUSIC_PUBLIC_FIXTURE_VERSION,
    confirmation: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
  })).toThrow(/PR-safe lane cannot acquire live-write authority/);
});

test("live authority is restricted to a namespaced loopback fixture", () => {
  expect(() => assertLiveWriteAuthority({
    lane: "live",
    liveWriteEnabled: true,
    baseUrl: "https://explorers.earth",
    serviceOrigins: ["http://127.0.0.1:53001"],
    accountDocumentId: "real-account",
    accountUsername: "real-user",
    fixtureVersion: MUSIC_PUBLIC_FIXTURE_VERSION,
    confirmation: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
  })).toThrow(/service origin.*disposable loopback/);

  expect(assertLiveWriteAuthority({
    lane: "live",
    liveWriteEnabled: true,
    baseUrl: "http://127.0.0.1:55173",
    serviceOrigins: ["http://127.0.0.1:55173", "http://localhost:53001"],
    accountDocumentId: `${fixtureNamespace("run-123")}-account`,
    accountUsername: `${fixtureNamespace("run-123")}-owner`,
    fixtureVersion: MUSIC_PUBLIC_FIXTURE_VERSION,
    confirmation: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
  })).toMatchObject({ authorized: true, namespace: fixtureNamespace("run-123") });
});

test("live authority requires the flag, exact fixture version, account document, and every service on loopback", () => {
  const valid = {
    lane: "live" as const,
    liveWriteEnabled: true,
    baseUrl: "http://127.0.0.1:55173",
    serviceOrigins: ["http://127.0.0.1:55173", "http://localhost:53001"],
    accountDocumentId: "e2e-public-music-run-123-account",
    accountUsername: "e2e-public-music-run-123-owner",
    fixtureVersion: MUSIC_PUBLIC_FIXTURE_VERSION,
    confirmation: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
  };
  expect(() => assertLiveWriteAuthority({ ...valid, liveWriteEnabled: false })).toThrow(/MUSIC_E2E_LIVE_WRITE=true/);
  expect(() => assertLiveWriteAuthority({ ...valid, fixtureVersion: "wrong" })).toThrow(/fixture version/);
  expect(() => assertLiveWriteAuthority({ ...valid, accountDocumentId: "account-1" })).toThrow(/document ID/);
  expect(() => assertLiveWriteAuthority({ ...valid, serviceOrigins: [...valid.serviceOrigins, "https://tunes.example"] }))
    .toThrow(/service origin/);
});

test("live authority accepts owned PostgreSQL TCP and rejects remote TCP", () => {
  const valid = {
    lane: "live" as const, liveWriteEnabled: true, baseUrl: "http://127.0.0.1:55173",
    accountDocumentId: "e2e-public-music-contract-account", accountUsername: "e2e-public-music-contract-owner",
    fixtureVersion: MUSIC_PUBLIC_FIXTURE_VERSION, confirmation: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
  };
  expect(assertLiveWriteAuthority({ ...valid, serviceOrigins: ["tcp://127.0.0.1:55432", "http://127.0.0.1:55000"] })).toMatchObject({ authorized: true });
  expect(() => assertLiveWriteAuthority({ ...valid, serviceOrigins: ["tcp://db.example:5432"] })).toThrow(/loopback/);
});

test("every declared mutation callsite passes through the centralized authority gate", async () => {
  expect(MUSIC_MUTATION_CALLSITES).toEqual(expect.arrayContaining([
    "owner-publication", "playlist-create", "playlist-song-add", "playlist-visibility",
    "queue-replace", "guest-controls", "song-request", "request-accept", "request-revoke", "guest-playback",
  ]));
  let invoked = false;
  await expect(runAuthorizedMusicMutation({
    lane: "fixture",
    liveWriteEnabled: false,
    baseUrl: "http://127.0.0.1:55173",
    serviceOrigins: ["http://127.0.0.1:55173"],
    accountDocumentId: "e2e-public-music-run-account",
    accountUsername: "e2e-public-music-run-owner",
    fixtureVersion: MUSIC_PUBLIC_FIXTURE_VERSION,
    confirmation: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
  }, "queue-replace", async () => { invoked = true; })).rejects.toThrow(/Live writes require the live lane/);
  expect(invoked).toBe(false);
});

test("real Music API mutation callsites have no direct authority bypass", () => {
  for (const relativePath of ["e2e/music-public-contract.spec.ts", "e2e/music-fixture-fullstack.spec.ts"]) {
    const source = readFileSync(relativePath, "utf8");
    const directMutationLines = source.split(/\r?\n/).filter((line) => /page\.request\.(post|patch|put|delete)\(/.test(line));
    expect(directMutationLines, relativePath).not.toEqual([]);
    expect(directMutationLines, relativePath).toEqual(
      directMutationLines.filter((line) => line.includes("guardedMutation(")),
    );
  }
  const fullstack = readFileSync("e2e/music-fixture-fullstack.spec.ts", "utf8");
  expect(fullstack).toContain('runAuthorizedMusicMutation(musicLiveAuthorityFromEnvironment(), "playlist-song-add"');
  expect(fullstack).toContain('runAuthorizedMusicMutation(musicLiveAuthorityFromEnvironment(), "guest-controls"');
});

test("fixture contract is versioned and contains every required deterministic state", () => {
  expect(MUSIC_PUBLIC_FIXTURE_VERSION).toBe("music-public-e2e-fixture/v1");
  expect(MUSIC_PUBLIC_STATES).toEqual([
    "public", "unlisted", "private", "suspended", "tombstoned", "all-content",
    "empty", "queue-only", "playlists-only", "history-only", "request-allowed",
    "request-rate-limited",
  ]);
});

test("permission fixture enumerates all 32 combinations with stable names", () => {
  const rows = buildPermissionMatrix();
  expect(rows).toHaveLength(32);
  expect(new Set(rows.map((row) => row.key)).size).toBe(32);
  expect(rows[0]).toEqual({
    key: "00000",
    allowSongRequests: false,
    allowGuestPlayOnDevice: false,
    allowPlaylistSharing: false,
    allowRecentlyPlayedVisibility: false,
    allowQueueVisibility: false,
  });
  expect(rows[31]?.key).toBe("11111");
});

test("pairwise permission rows cover every binary interaction", () => {
  const rows = buildPairwisePermissionMatrix();
  const fields = ["allowSongRequests", "allowGuestPlayOnDevice", "allowPlaylistSharing", "allowRecentlyPlayedVisibility", "allowQueueVisibility"] as const;
  expect(rows.length).toBeLessThan(32);
  for (let left = 0; left < fields.length; left += 1) for (let right = left + 1; right < fields.length; right += 1) {
    expect(new Set(rows.map((row) => `${row[fields[left]!]}:${row[fields[right]!]}`))).toEqual(new Set(["false:false", "false:true", "true:false", "true:true"]));
  }
});

test("Playwright exposes explicit read-only, fixture, live, and visual projects", () => {
  const names = playwrightConfig.projects?.map((project) => project.name);
  expect(names).toEqual(expect.arrayContaining([
    "chromium-pr-safe",
    "chromium-music-fixture",
    "chromium-music-live",
    "firefox-music-visual",
    "webkit-music-visual",
  ]));
  expect(playwrightConfig.testIgnore).toBeUndefined();
});

test("failure evidence is retained without recording successful runs", () => {
  expect(playwrightConfig.use?.trace).toBe("retain-on-failure");
  expect(playwrightConfig.use?.screenshot).toBe("only-on-failure");
  expect(playwrightConfig.use?.video).toBe("retain-on-failure");
});

test("snapshot hashes ignore volatile fields but detect restorable state drift", () => {
  const before = {
    capturedAt: "2026-08-29T01:00:00.000Z",
    requestId: "secret-request-a",
    publication: { mode: "public", publicSlug: "fixture-public" },
    permissions: { allowSongRequests: true },
    queue: [{ publicId: "song-a", title: "One" }],
  };
  const after = { ...before, capturedAt: "2026-08-29T02:00:00.000Z", requestId: "secret-request-b" };
  expect(normalizedSnapshotHash(before)).toBe(normalizedSnapshotHash(after));
  expect(normalizedSnapshotHash({ ...after, publication: { mode: "private", publicSlug: "fixture-public" } }))
    .not.toBe(normalizedSnapshotHash(before));
});

test("fixture evidence prints useful metadata without capabilities or credentials", () => {
  const evidence = buildSanitizedFixtureEvidence({
    runId: "run-123",
    lane: "fixture",
    accountDocumentId: "fixture-account-document",
    username: "e2e-public-music-run-123-owner",
    explorerUrl: "http://127.0.0.1:55173/e2e-public-music-run-123",
    shareUrl: `http://127.0.0.1:55173/music/share/public-slug#${"A".repeat(43)}`,
    result: "passed",
    cleanup: "restored",
    evidencePath: ".artifacts/music-public/run-123/evidence.json",
  });
  expect(evidence).toMatchObject({
    version: "music-public-e2e-fixture/v1",
    lane: "fixture",
    result: "passed",
    cleanup: "restored",
  });
  expect(JSON.stringify(evidence)).not.toContain("A".repeat(43));
  expect(evidence.shareUrl).toBe("http://127.0.0.1:55173/music/share/public-slug");
});

test("developer fixture command prints a sanitized, versioned dry-run contract", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-dry-run-"));
  try {
    const runner = resolve("scripts/music-public-e2e.mjs");
    const result = spawnSync(process.execPath, [runner, "verify", "--dry-run"], {
      cwd: sandbox,
      encoding: "utf8",
      env: { ...process.env, MUSIC_PUBLIC_RUN_ID: "contract-run" },
      windowsHide: true,
    });
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    expect(report).toMatchObject({
      version: "music-public-e2e-fixture/v1",
      lane: "fixture",
      result: "dry-run",
      cleanup: "not-required",
    });
    expect(report).toHaveProperty("services");
    expect(JSON.stringify(report)).not.toContain('"postgres":"fixture-owned"');
    expect(report).toHaveProperty("accountDocumentId", "not-configured");
    expect(report).toHaveProperty("username", "not-configured");
    expect(report).toHaveProperty("evidencePath", ".artifacts/music-public/contract-run/evidence.json");

    const runDirectory = join(sandbox, ".artifacts", "music-public", "contract-run");
    const verify = spawnSync(process.execPath, [
      resolve("scripts/music-public-qualification-artifacts.mjs"), "verify", runDirectory,
    ], { cwd: sandbox, encoding: "utf8", windowsHide: true });
    expect(verify.status, `${verify.stdout}\n${verify.stderr}`).toBe(0);
    expect(JSON.parse(verify.stdout)).toMatchObject({ files: 17, manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.parse(readFileSync(join(runDirectory, "analytics-events.jsonl"), "utf8"))).toEqual({
      schemaVersion: "explorers-public-analytics-ledger/v1",
      status: "unavailable",
      reason: "not-observed",
      events: [],
    });
    expect(JSON.parse(readFileSync(join(runDirectory, "docker-inspection.json"), "utf8"))).toMatchObject({
      schemaVersion: "explorers-public-docker-inspection/v1",
      status: "unavailable",
      reason: "dry-run",
      cwd: "<workspace>",
      exitCodes: { containers: null, volumes: null },
      containerMatches: [],
      volumeMatches: [],
      containersRemaining: null,
      volumesRemaining: null,
    });
    expect(JSON.parse(readFileSync(join(runDirectory, "skip-reasons.json"), "utf8"))).toEqual({
      schemaVersion: "explorers-public-skip-ledger/v1",
      lane: "fixture",
      execution: "not-run",
      totals: { total: 0, passed: 0, failed: 0, skipped: 0 },
      reasons: [{ scope: "lane", reason: "not-observed" }],
    });
    expect(JSON.parse(readFileSync(join(runDirectory, "restoration.json"), "utf8"))).toEqual({
      schemaVersion: "explorers-public-restoration/v1",
      status: "unavailable",
      finalRestore: null,
      journeys: [],
    });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("qualification run allocation refuses a reused run ID before any fixture action", async () => {
  // Production break caught: a repeated run ID reopens the same directory and
  // can replace evidence that a reviewer already treated as immutable.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-exclusive-run-"));
  try {
    const { createExclusiveQualificationRunDirectory } = await import("../scripts/music-public-qualification-artifacts.mjs");
    const artifactParent = join(sandbox, ".artifacts", "music-public");
    const first = createExclusiveQualificationRunDirectory({ artifactParent, runId: "exclusive-contract-run" });
    expect(first).toBe(join(artifactParent, "exclusive-contract-run"));
    expect(() => createExclusiveQualificationRunDirectory({ artifactParent, runId: "exclusive-contract-run" }))
      .toThrow(/exist/i);
    expect(readdirSync(artifactParent)).toEqual(["exclusive-contract-run"]);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("fresh live runner rejects hostile fixture authority before bootstrap without attempting lifecycle teardown", () => {
  // The operator has separately proved the reset removed the reviewed volumes
  // and freed all five ports. A failed final authority gate is therefore a
  // pre-bootstrap refusal: no fixture command, service, or down is authorized.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-authority-gate-contract-"));
  try {
    const runId = "authority-gate-rejection-contract";
    const { fakeNpmPath, fakeDockerHookPath, binDirectory } = writeLifecycleContractShims(sandbox);
    const privateValue = "authority-gate-private-value";
    const environment = lifecycleFreshProcessEnvironment({
      sandbox,
      runId,
      fakeNpmPath,
      fakeDockerHookPath,
      binDirectory,
      scenario: "authority-credential",
      dockerMode: "clean",
      privateValue,
    });
    const result = spawnSync(process.execPath, [
      resolve("scripts/music-public-e2e.mjs"), "live", ...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS,
    ], {
      cwd: sandbox,
      env: environment,
      encoding: "utf8",
      windowsHide: true,
    });
    const runDirectory = onlyQualificationRunDirectory(sandbox);
    const evidence = JSON.parse(readFileSync(join(runDirectory, "evidence.json"), "utf8"));
    const retainedAuthority = JSON.parse(readFileSync(join(runDirectory, "fixture-authority.json"), "utf8"));

    expect(result.status, `${result.stdout}\n${result.stderr}\n${JSON.stringify(evidence)}`).toBe(4);
    expect(readFileSync(environment.FAKE_LIFECYCLE_LOG, "utf8").trim().split(/\r?\n/)).toEqual(["authority"]);
    expect(existsSync(environment.FAKE_RESOURCE_MARKER)).toBe(false);
    expect(evidence).toMatchObject({
      stage: "fixture-authority-gate-failed",
      result: "failed",
      cleanup: "not-required-safe",
      exitCode: 4,
      lifecycleCommands: [],
    });
    expect(retainedAuthority).toEqual({
      schemaVersion: "explorers-public-fixture-authority/v1",
      status: "rejected",
      command: ["npm", "run", "--silent", "music:fixture:authority:attest"],
      cwd: "<repository>",
      exitCode: 0,
      termination: "exited",
      attestation: null,
    });
    expect(`${result.stdout}\n${result.stderr}\n${JSON.stringify(evidence)}\n${JSON.stringify(retainedAuthority)}`)
      .not.toContain(privateValue);
    expect(`${result.stdout}\n${result.stderr}\n${JSON.stringify(evidence)}\n${JSON.stringify(retainedAuthority)}`)
      .not.toContain("/private/");
    expect(evidence.streams.every(({ status }: { status: string }) => status === "unavailable")).toBe(true);

    const verified = spawnSync(process.execPath, [
      resolve("scripts/music-public-qualification-artifacts.mjs"), "verify", runDirectory,
    ], { cwd: sandbox, encoding: "utf8", windowsHide: true });
    expect(verified.status, `${verified.stdout}\n${verified.stderr}`).toBe(0);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

for (const lifecycleCase of [
  {
    name: "bootstrap partial creation",
    runId: "bootstrap-partial-contract",
    scenario: "bootstrap-partial",
    dockerMode: "clean",
    expectedExit: 4,
    expectedCleanup: "not-required-safe",
    expectedStages: ["fixture-bootstrap", "fixture-down"],
  },
  {
    name: "up partial creation",
    runId: "up-partial-contract",
    scenario: "up-partial",
    dockerMode: "clean",
    expectedExit: 4,
    expectedCleanup: "not-required-safe",
    expectedStages: ["fixture-bootstrap", "fixture-up", "fixture-down"],
  },
  {
    name: "exact down failure",
    runId: "down-failure-contract",
    scenario: "bootstrap-down-failure",
    dockerMode: "clean",
    expectedExit: 5,
    expectedCleanup: "teardown-failed",
    expectedStages: ["fixture-bootstrap", "fixture-down"],
  },
  {
    name: "Docker inspection unavailable",
    runId: "docker-unavailable-contract",
    scenario: "bootstrap-no-resource",
    dockerMode: "unavailable",
    expectedExit: 5,
    expectedCleanup: "cleanup-inspection-failed",
    expectedStages: ["fixture-bootstrap", "fixture-down"],
  },
  {
    name: "Docker residue",
    runId: "docker-residue-contract",
    scenario: "bootstrap-no-resource",
    dockerMode: "residue",
    expectedExit: 5,
    expectedCleanup: "cleanup-inspection-failed",
    expectedStages: ["fixture-bootstrap", "fixture-down"],
  },
  {
    name: "verified no-resource cleanup",
    runId: "no-resource-contract",
    scenario: "bootstrap-no-resource",
    dockerMode: "clean",
    expectedExit: 4,
    expectedCleanup: "not-required-safe",
    expectedStages: ["fixture-bootstrap", "fixture-down"],
  },
] as const) {
  test(`early fixture failure finalizes exact cleanup evidence for ${lifecycleCase.name}`, () => {
    // Production break caught: a failed bootstrap/up could leave partial resources,
    // skip exact down, inherit raw child output, and still preserve exit 4 without cleanup proof.
    const sandbox = mkdtempSync(join(tmpdir(), "music-public-lifecycle-contract-"));
    try {
      const { fakeNpmPath, fakeDockerHookPath, binDirectory } = writeLifecycleContractShims(sandbox);
      const privateValue = `private-${lifecycleCase.runId}-value`;
      const environment = lifecycleFreshProcessEnvironment({
        sandbox,
        runId: lifecycleCase.runId,
        fakeNpmPath,
        fakeDockerHookPath,
        binDirectory,
        scenario: lifecycleCase.scenario,
        dockerMode: lifecycleCase.dockerMode,
        privateValue,
      });
      const result = spawnSync(process.execPath, [
        resolve("scripts/music-public-e2e.mjs"), "live", ...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS,
      ], {
        cwd: sandbox,
        env: environment,
        encoding: "utf8",
        windowsHide: true,
      });
      const runDirectory = onlyQualificationRunDirectory(sandbox);
      expect(existsSync(join(runDirectory, "evidence.json")), `${result.stdout}\n${result.stderr}`).toBe(true);
      const evidence = JSON.parse(readFileSync(join(runDirectory, "evidence.json"), "utf8"));
      const dockerInspection = JSON.parse(readFileSync(join(runDirectory, "docker-inspection.json"), "utf8"));
      expect(result.status, `${result.stdout}\n${result.stderr}\n${JSON.stringify({ evidence, dockerInspection })}`)
        .toBe(lifecycleCase.expectedExit);
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(privateValue);
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(sandbox);
      expect(readFileSync(environment.FAKE_LIFECYCLE_LOG, "utf8").trim().split(/\r?\n/))
        .toEqual(["authority", ...lifecycleCase.expectedStages.map((stage) => stage.replace("fixture-", ""))]);
      expect(existsSync(environment.FAKE_RESOURCE_MARKER)).toBe(false);

      expect(evidence).toMatchObject({
        result: "failed",
        cleanup: lifecycleCase.expectedCleanup,
        exitCode: lifecycleCase.expectedExit,
      });
      expect(evidence.lifecycleCommands.map(({ stage }: { stage: string }) => stage))
        .toEqual(lifecycleCase.expectedStages);
      expect(evidence.lifecycleCommands.every((record: Record<string, unknown>) => (
        JSON.stringify(record).includes(privateValue) === false
      ))).toBe(true);
      const retainedStreamFiles = AUTHORITATIVE_QUALIFICATION_STREAMS.map((definition) => (
        readFileSync(join(runDirectory, ...definition.path.split("/")), "utf8")
      ));
      const retainedStreams = retainedStreamFiles.join("\n");
      expect(retainedStreams).toContain("<redacted>");
      expect(retainedStreams).toContain("<path>");
      expect(retainedStreams).not.toContain(privateValue);
      expect(retainedStreams).not.toContain(sandbox);
      expect(retainedStreamFiles.every((stream) => Buffer.byteLength(stream) <= 4_096)).toBe(true);
      expect(evidence.streams).toHaveLength(8);
      expect(evidence.streams.filter(({ status }: { status: string }) => status === "captured")
        .map(({ source, stream }: { source: string; stream: string }) => `${source}:${stream}`))
        .toEqual(lifecycleCase.expectedStages.flatMap((stage) => [`${stage}:stdout`, `${stage}:stderr`]));

      const verified = spawnSync(process.execPath, [
        resolve("scripts/music-public-qualification-artifacts.mjs"), "verify", runDirectory,
      ], { cwd: sandbox, encoding: "utf8", windowsHide: true });
      expect(verified.status, `${verified.stdout}\n${verified.stderr}`).toBe(0);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
}

test("generated fixture token stays off argv and retained output and is retired on failure", () => {
  // Production break caught: generating the fixture token inside the runner is
  // safe only if hostile child output is sanitized and exact down retires the
  // simulated protected authority even when bootstrap fails.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-generated-token-"));
  try {
    const runLabel = "generated-token-contract";
    const { fakeNpmPath, fakeDockerHookPath, binDirectory } = writeLifecycleContractShims(sandbox);
    const environment = lifecycleFreshProcessEnvironment({
      sandbox,
      runId: runLabel,
      fakeNpmPath,
      fakeDockerHookPath,
      binDirectory,
      scenario: "bootstrap-partial",
      dockerMode: "clean",
      privateValue: "separate-hostile-child-value",
    });
    const result = spawnSync(process.execPath, [
      resolve("scripts/music-public-e2e.mjs"), "live", ...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS,
    ], { cwd: sandbox, env: environment, encoding: "utf8", windowsHide: true });
    const runDirectory = onlyQualificationRunDirectory(sandbox);
    const retainedFiles: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const target = join(directory, entry.name);
        if (entry.isDirectory()) visit(target);
        else retainedFiles.push(readFileSync(target, "utf8"));
      }
    };
    visit(runDirectory);
    const retainedText = `${result.stdout}\n${result.stderr}\n${retainedFiles.join("\n")}`;
    const evidence = JSON.parse(readFileSync(join(runDirectory, "evidence.json"), "utf8"));
    const digest = readFileSync(environment.FAKE_FIXTURE_TOKEN_DIGEST, "utf8");
    const tokenLikeValues = retainedText.match(/[A-Za-z0-9_-]{32,128}/g) ?? [];
    const argvValues = JSON.stringify(EXACT_PUBLIC_LIVE_AUTHORITY_ARGS).match(/[A-Za-z0-9_-]{32,128}/g) ?? [];

    expect(result.status, retainedText).toBe(4);
    expect(evidence.command).toEqual(["node", "scripts/music-public-e2e.mjs", "live", ...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS]);
    expect(readFileSync(environment.FAKE_LIFECYCLE_LOG, "utf8").trim().split(/\r?\n/))
      .toEqual(["authority", "bootstrap", "down"]);
    expect(existsSync(environment.FAKE_FIXTURE_TOKEN_MARKER)).toBe(false);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenLikeValues.some((value) => createHash("sha256").update(value).digest("hex") === digest)).toBe(false);
    expect(argvValues.some((value) => createHash("sha256").update(value).digest("hex") === digest)).toBe(false);
    expect(retainedText).toContain("<redacted>");
    expect(retainedText).not.toContain("separate-hostile-child-value");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("fresh runner routes asynchronous state-service exit through one exact cleanup and finalizer", () => {
  // Production break caught: an asynchronously failed state-service child had no
  // terminal listener, so another readiness branch could finalize first and call
  // an already-exited process safe without recording why it died.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-state-exit-contract-"));
  try {
    const runId = "state-service-exit-contract";
    const { fakeNpmPath, fakeDockerHookPath, binDirectory } = writeLifecycleContractShims(sandbox);
    const privateValue = "state-service-exit-private-value";
    const environment = lifecycleFreshProcessEnvironment({
      sandbox,
      runId,
      fakeNpmPath,
      fakeDockerHookPath,
      binDirectory,
      scenario: "state-service-exit",
      dockerMode: "clean",
      privateValue,
    });
    const result = spawnSync(process.execPath, [
      resolve("scripts/music-public-e2e.mjs"), "live", ...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS,
    ], {
      cwd: sandbox,
      env: environment,
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
    });
    const runDirectory = onlyQualificationRunDirectory(sandbox);
    const evidence = JSON.parse(readFileSync(join(runDirectory, "evidence.json"), "utf8"));
    const lifecycleActions = readFileSync(environment.FAKE_LIFECYCLE_LOG, "utf8").trim().split(/\r?\n/);

    expect(result.status, `${result.stdout}\n${result.stderr}\n${JSON.stringify(evidence)}`).toBe(5);
    expect(lifecycleActions).toEqual(["authority", "bootstrap", "up", "down"]);
    expect(lifecycleActions.filter((action) => action === "down")).toHaveLength(1);
    expect(evidence).toMatchObject({
      stage: "state-service-exit",
      result: "failed",
      cleanup: "teardown-failed",
      exitCode: 5,
      stateServiceLifecycle: {
        schemaVersion: "explorers-public-state-service-lifecycle/v1",
        error: { status: "unavailable" },
        exit: { status: "observed", code: 1, signal: null },
        close: { status: "observed", code: 1, signal: null },
      },
    });
    expect(`${result.stdout}\n${result.stderr}\n${JSON.stringify(evidence)}`).not.toContain(privateValue);
    expect(`${result.stdout}\n${result.stderr}\n${JSON.stringify(evidence)}`).not.toContain(sandbox);
    expect(result.stderr).not.toMatch(/Unhandled 'error' event|ERR_UNHANDLED_ERROR/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("qualification run allocation refuses a caller-selected parent outside the exact guarded path", async () => {
  // Production break caught: an environment-controlled or mistaken parent can
  // move retained evidence outside the reviewed .artifacts/music-public boundary.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-parent-guard-"));
  try {
    const { createExclusiveQualificationRunDirectory } = await import("../scripts/music-public-qualification-artifacts.mjs");
    expect(() => createExclusiveQualificationRunDirectory({
      artifactParent: join(sandbox, "unreviewed-artifact-parent"),
      runId: "guard-contract-run",
    })).toThrow("Qualification artifact parent must be the exact .artifacts/music-public directory");
    expect(existsSync(join(sandbox, "unreviewed-artifact-parent"))).toBe(false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("qualification artifact CLI creates and verifies one canonical manifest with a hash-only sidecar", () => {
  // Production break caught: copied evidence has no independently executable
  // role/path/size/hash inventory, or recreating the manifest silently replaces authority.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-manifest-"));
  try {
    const artifactParent = join(sandbox, ".artifacts", "music-public");
    const runDirectory = join(artifactParent, "manifest-contract-run");
    mkdirSync(runDirectory, { recursive: true });
    seedQualificationArtifacts(runDirectory);
    const helper = resolve("scripts/music-public-qualification-artifacts.mjs");
    const invoke = (operation: "create" | "verify") => spawnSync(
      process.execPath,
      [helper, operation, runDirectory],
      { cwd: process.cwd(), encoding: "utf8", windowsHide: true },
    );

    const created = invoke("create");
    expect(created.status, `${created.stdout}\n${created.stderr}`).toBe(0);
    const manifestBytes = readFileSync(join(runDirectory, "manifest.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    expect(manifest).toEqual({
      schemaVersion: "explorers-public-qualification-artifacts/v1",
      artifacts: REQUIRED_QUALIFICATION_ARTIFACTS.map((artifact) => {
        const content = seededQualificationArtifactContent(artifact.role);
        return {
          ...artifact,
          bytes: Buffer.byteLength(content),
          sha256: createHash("sha256").update(content).digest("hex"),
        };
      }),
    });
    const expectedManifestHash = createHash("sha256").update(manifestBytes).digest("hex");
    expect(readFileSync(join(runDirectory, "manifest.sha256"), "utf8")).toBe(`${expectedManifestHash}\n`);
    expect(JSON.parse(created.stdout)).toEqual({
      schemaVersion: "explorers-public-qualification-artifacts/v1",
      files: 17,
      manifestSha256: expectedManifestHash,
    });

    const verified = invoke("verify");
    expect(verified.status, `${verified.stdout}\n${verified.stderr}`).toBe(0);
    expect(JSON.parse(verified.stdout)).toEqual(JSON.parse(created.stdout));

    const duplicateCreate = invoke("create");
    expect(duplicateCreate.status).toBe(1);
    expect(duplicateCreate.stderr).toBe("qualification artifact error: manifest files already exist\n");
    expect(`${duplicateCreate.stdout}\n${duplicateCreate.stderr}`).not.toContain(sandbox);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("qualification visual/trace ledger makes every retained relative file manifest-required", () => {
  // Production break caught: a screenshot/trace can be retained without a hash
  // row, or a ledger can smuggle an absolute/private path into reviewer evidence.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-visual-ledger-"));
  try {
    const runDirectory = join(sandbox, ".artifacts", "music-public", "visual-ledger-run");
    mkdirSync(runDirectory, { recursive: true });
    seedQualificationArtifacts(runDirectory);
    const visualLedger = {
      schemaVersion: "explorers-public-visual-trace-ledger/v1",
      status: "retained",
      visuals: ["visuals/owner-public-music.png"],
      traces: ["traces/owner-public-music.zip"],
    };
    writeFileSync(join(runDirectory, "visual-trace-ledger.json"), `${JSON.stringify(visualLedger)}\n`);
    mkdirSync(join(runDirectory, "visuals"));
    mkdirSync(join(runDirectory, "traces"));
    writeFileSync(join(runDirectory, "visuals", "owner-public-music.png"), "png");
    writeFileSync(join(runDirectory, "traces", "owner-public-music.zip"), "zip");
    const helper = resolve("scripts/music-public-qualification-artifacts.mjs");
    const created = spawnSync(process.execPath, [helper, "create", runDirectory], {
      cwd: process.cwd(), encoding: "utf8", windowsHide: true,
    });
    expect(created.status, `${created.stdout}\n${created.stderr}`).toBe(0);
    const manifest = JSON.parse(readFileSync(join(runDirectory, "manifest.json"), "utf8"));
    expect(manifest.artifacts.slice(-2)).toEqual([
      {
        role: "visual-001",
        path: "visuals/owner-public-music.png",
        bytes: 3,
        sha256: "8f8cbb7dcf46e0bc7d53265749a6c17d116093a6ba95e442764060c76fd4a86c",
      },
      {
        role: "trace-001",
        path: "traces/owner-public-music.zip",
        bytes: 3,
        sha256: "4a70fe9aa6436e02c2dea340fbd1e352e4ef2d8ce6ca52ad25d4b95471fc8bf2",
      },
    ]);
    const verified = spawnSync(process.execPath, [helper, "verify", runDirectory], {
      cwd: process.cwd(), encoding: "utf8", windowsHide: true,
    });
    expect(verified.status, `${verified.stdout}\n${verified.stderr}`).toBe(0);
    expect(JSON.parse(verified.stdout)).toMatchObject({ files: 19 });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

const qualificationManifestTamperCases: Array<{
  name: string;
  expected: string;
  mutate: (runDirectory: string) => void;
}> = [
  {
    name: "a malformed sidecar",
    expected: "manifest sidecar format is invalid",
    mutate: (runDirectory) => writeFileSync(join(runDirectory, "manifest.sha256"), "not-a-canonical-sha\n"),
  },
  {
    name: "a sidecar hash that does not authenticate manifest bytes",
    expected: "manifest sidecar hash mismatch",
    mutate: (runDirectory) => writeFileSync(join(runDirectory, "manifest.sha256"), `${"0".repeat(64)}\n`),
  },
  {
    name: "a missing required artifact",
    expected: "required qualification artifact is missing or unreadable",
    mutate: (runDirectory) => rmSync(join(runDirectory, "evidence.json")),
  },
  {
    name: "a hard-linked retained mutation guard",
    expected: "qualification mutation guard evidence contract is invalid",
    mutate: (runDirectory) => linkSync(
      join(runDirectory, "mutation-guard.json"),
      join(dirname(runDirectory), "mutation-guard-alias.json"),
    ),
  },
  {
    name: "a required artifact byte-count mismatch",
    expected: "qualification artifact byte count mismatch",
    mutate: (runDirectory) => writeFileSync(join(runDirectory, "logs", "state-service.stderr.log"), "abcd"),
  },
  {
    name: "a same-size required artifact hash mismatch",
    expected: "qualification artifact SHA-256 mismatch",
    mutate: (runDirectory) => writeFileSync(join(runDirectory, "logs", "state-service.stderr.log"), "abd"),
  },
  {
    name: "an unmanifested private artifact",
    expected: "qualification artifact file set mismatch",
    mutate: (runDirectory) => writeFileSync(join(runDirectory, "private-playwright-secret.json"), "must-not-survive"),
  },
  {
    name: "a missing required manifest role/path",
    expected: "manifest required artifact set mismatch",
    mutate: (runDirectory) => rewriteQualificationManifest(runDirectory, (manifest) => { manifest.artifacts.pop(); }),
  },
  {
    name: "a duplicate manifest role/path",
    expected: "manifest contains duplicate role or path",
    mutate: (runDirectory) => rewriteQualificationManifest(runDirectory, (manifest) => {
      manifest.artifacts.push({ ...manifest.artifacts[0] });
    }),
  },
  {
    name: "an extra manifest role/path",
    expected: "manifest required artifact set mismatch",
    mutate: (runDirectory) => {
      writeFileSync(join(runDirectory, "unexpected-required.json"), "abc");
      rewriteQualificationManifest(runDirectory, (manifest) => {
        manifest.artifacts.push({
          role: "raw-reporter",
          path: "unexpected-required.json",
          bytes: 3,
          sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        });
      });
    },
  },
  {
    name: "a non-relative manifest artifact path",
    expected: "qualification artifact path is not a safe relative path",
    mutate: (runDirectory) => rewriteQualificationManifest(runDirectory, (manifest) => {
      manifest.artifacts[0].path = resolve("must-not-be-retained", "stdout.log");
    }),
  },
  {
    name: "non-canonical manifest JSON bytes",
    expected: "manifest JSON is not canonical",
    mutate: (runDirectory) => {
      const manifest = JSON.parse(readFileSync(join(runDirectory, "manifest.json"), "utf8"));
      writeQualificationManifestBytes(runDirectory, Buffer.from(JSON.stringify(manifest), "utf8"));
    },
  },
  {
    name: "an extra top-level manifest field",
    expected: "manifest contract is invalid",
    mutate: (runDirectory) => rewriteQualificationManifest(runDirectory, (manifest) => {
      Object.assign(manifest, { privateDiagnostic: "must-not-survive" });
    }),
  },
  {
    name: "an extra artifact-entry field",
    expected: "manifest contract is invalid",
    mutate: (runDirectory) => rewriteQualificationManifest(runDirectory, (manifest) => {
      manifest.artifacts[0].privateDiagnostic = "must-not-survive";
    }),
  },
  {
    name: "a reordered required role/path set",
    expected: "manifest required artifact set mismatch",
    mutate: (runDirectory) => rewriteQualificationManifest(runDirectory, (manifest) => {
      [manifest.artifacts[0], manifest.artifacts[1]] = [manifest.artifacts[1], manifest.artifacts[0]];
    }),
  },
  {
    name: "a rehashed reference-state fixture authority record",
    expected: "fixture authority evidence contract is invalid",
    mutate: (runDirectory) => {
      const value = {
        ...SAFE_FIXTURE_AUTHORITY_GATE,
        attestation: { ...SAFE_FIXTURE_AUTHORITY_GATE.attestation, state: "reference" },
      };
      const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      writeFileSync(join(runDirectory, "fixture-authority.json"), bytes);
      rewriteQualificationManifest(runDirectory, (manifest) => {
        const artifact = manifest.artifacts.find(({ role }) => role === "fixture-authority")!;
        artifact.bytes = bytes.length;
        artifact.sha256 = createHash("sha256").update(bytes).digest("hex");
      });
    },
  },
];

for (const contract of qualificationManifestTamperCases) {
  test(`qualification artifact verifier rejects ${contract.name}`, () => {
    const sandbox = mkdtempSync(join(tmpdir(), "music-public-manifest-tamper-"));
    try {
      const runDirectory = join(sandbox, ".artifacts", "music-public", "tamper-contract-run");
      mkdirSync(runDirectory, { recursive: true });
      seedQualificationArtifacts(runDirectory);
      const helper = resolve("scripts/music-public-qualification-artifacts.mjs");
      const create = spawnSync(process.execPath, [helper, "create", runDirectory], {
        cwd: process.cwd(), encoding: "utf8", windowsHide: true,
      });
      expect(create.status, `${create.stdout}\n${create.stderr}`).toBe(0);
      contract.mutate(runDirectory);

      const verify = spawnSync(process.execPath, [helper, "verify", runDirectory], {
        cwd: process.cwd(), encoding: "utf8", windowsHide: true,
      });
      expect(verify.status).toBe(1);
      expect(verify.stderr).toBe(`qualification artifact error: ${contract.expected}\n`);
      expect(`${verify.stdout}\n${verify.stderr}`).not.toContain(sandbox);
      expect(`${verify.stdout}\n${verify.stderr}`).not.toContain("must-not-survive");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
}

test("qualification logs are exclusively written after bounded path and secret sanitization", async () => {
  // Production break caught: child diagnostics can retain credentials, absolute
  // worktree paths, or arbitrarily large stdout/stderr in reviewer artifacts.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-sanitized-log-"));
  try {
    const runDirectory = join(sandbox, ".artifacts", "music-public", "sanitized-log-run");
    mkdirSync(runDirectory, { recursive: true });
    const privateValue = "qualification-private-value-0123456789";
    const hostile = [
      `workspace=${process.cwd()}\\private\\report.json`,
      `Bearer ${privateValue}`,
      `access_token="${privateValue}" capability='${privateValue}' credential=${privateValue}`,
      `C:\\Users\\Private\\outside.txt /private/absolute/outside.txt`,
      "oversized=".repeat(2_000),
    ].join("\n");
    const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
    let result: { bytes: number; truncated: boolean } | undefined;
    expect(() => {
      result = qualificationArtifacts.writeSanitizedQualificationLog({
        runDirectory,
        relativePath: "logs/stdout.log",
        chunks: [hostile],
        workspaceRoot: process.cwd(),
        knownSecrets: [privateValue],
        maximumBytes: 4_096,
      });
    }).not.toThrow();
    expect(result).toEqual({ bytes: expect.any(Number), truncated: true });
    expect(result!.bytes).toBeLessThanOrEqual(4_096);
    const retained = readFileSync(join(runDirectory, "logs", "stdout.log"), "utf8");
    expect(Buffer.byteLength(retained)).toBe(result!.bytes);
    expect(retained).toContain("<workspace>");
    expect(retained).toContain("<redacted>");
    expect(retained).toContain("<path>");
    expect(retained).toMatch(/\[truncated\]\n$/);
    expect(retained).not.toContain(privateValue);
    expect(retained).not.toContain(process.cwd());
    expect(retained).not.toContain("C:\\Users\\Private");
    expect(retained).not.toContain("/private/absolute");

    expect(() => qualificationArtifacts.writeSanitizedQualificationLog({
      runDirectory,
      relativePath: "logs/stdout.log",
      chunks: ["replacement"],
      workspaceRoot: process.cwd(),
      knownSecrets: [],
      maximumBytes: 4_096,
    })).toThrow("qualification artifact already exists");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("fixture authority gate invokes the exact fixed-root command and accepts only the strict safe attestation schema", async () => {
  // Production break caught: the live runner bootstraps immediately after the
  // operator reset, without a typed post-reset fixture-authority attestation.
  const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
  const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = [];
  const stdout = `${JSON.stringify({
    schemaVersion: "music-fixture-authority-attestation/v1",
    state: "absent",
    safeToBootstrap: true,
    usableRecords: 0,
  })}\n`;
  const captured = qualificationArtifacts.captureQualificationFixtureAuthority({
    processExecPath: "node-runtime",
    npmExecPath: "npm-cli",
    cwd: process.cwd(),
    retainedCwd: "<repository>",
    environment: { FIXTURE_TEST: "1" },
    spawn: (command: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ command, args, options });
      return { status: 0, signal: null, stdout, stderr: "" };
    },
  });

  expect(captured).toEqual({
    status: 0,
    record: {
      schemaVersion: "explorers-public-fixture-authority/v1",
      status: "accepted",
      command: ["npm", "run", "--silent", "music:fixture:authority:attest"],
      cwd: "<repository>",
      exitCode: 0,
      termination: "exited",
      attestation: {
        schemaVersion: "music-fixture-authority-attestation/v1",
        state: "absent",
        safeToBootstrap: true,
        usableRecords: 0,
      },
    },
  });
  expect(calls).toEqual([{
    command: "node-runtime",
    args: ["npm-cli", "run", "--silent", "music:fixture:authority:attest"],
    options: {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { FIXTURE_TEST: "1" },
      maxBuffer: 8 * 1024,
      windowsHide: true,
    },
  }]);
});

test("fixture authority gate rejects and redacts hostile credential-bearing malformed or ambiguous output", async () => {
  const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
  const privateValue = "authority-private-value-must-not-survive";
  const hostileOutputs = [
    `${JSON.stringify({
      schemaVersion: "music-fixture-authority-attestation/v1",
      state: "tombstone",
      safeToBootstrap: true,
      usableRecords: 0,
      password: privateValue,
    })}\n`,
    `${JSON.stringify({
      schemaVersion: "music-fixture-authority-attestation/v1",
      state: "reference",
      safeToBootstrap: true,
      usableRecords: 0,
    })}\n`,
    "not-json\n",
    `${JSON.stringify({
      schemaVersion: "music-fixture-authority-attestation/v1",
      state: "tombstone",
      safeToBootstrap: true,
      usableRecords: 0,
    })}\n${JSON.stringify({ path: `/private/${privateValue}` })}\n`,
  ];

  for (const stdout of hostileOutputs) {
    const captured = qualificationArtifacts.captureQualificationFixtureAuthority({
      processExecPath: "node-runtime",
      npmExecPath: "npm-cli",
      cwd: process.cwd(),
      retainedCwd: "<repository>",
      environment: { FIXTURE_TEST: "1" },
      spawn: () => ({
        status: 0,
        signal: null,
        stdout,
        stderr: `credential=${privateValue} path=/private/${privateValue}/authority.log`,
      }),
    });
    expect(captured).toEqual({
      status: 1,
      record: {
        schemaVersion: "explorers-public-fixture-authority/v1",
        status: "rejected",
        command: ["npm", "run", "--silent", "music:fixture:authority:attest"],
        cwd: "<repository>",
        exitCode: 0,
        termination: "exited",
        attestation: null,
      },
    });
    expect(JSON.stringify(captured)).not.toContain(privateValue);
    expect(JSON.stringify(captured)).not.toContain("/private/");
  }
});

test("fixture authority gate blocks nonzero signal and spawn-error terminal states without raw diagnostics", async () => {
  const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
  const privateValue = "terminal-authority-private-value";
  const cases = [
    { name: "nonzero", result: { status: 5, signal: null, stdout: privateValue, stderr: privateValue }, exitCode: 5, termination: "exited" },
    { name: "signal", result: { status: null, signal: "SIGTERM", stdout: privateValue, stderr: privateValue }, exitCode: null, termination: "signaled" },
    { name: "spawn-error", result: undefined, exitCode: null, termination: "spawn-error" },
  ] as const;

  for (const contract of cases) {
    const captured = qualificationArtifacts.captureQualificationFixtureAuthority({
      processExecPath: "node-runtime",
      npmExecPath: "npm-cli",
      cwd: process.cwd(),
      retainedCwd: "<repository>",
      environment: { FIXTURE_TEST: "1" },
      spawn: () => {
        if (contract.result === undefined) throw new Error(privateValue);
        return contract.result;
      },
    });
    expect(captured).toEqual({
      status: 1,
      record: {
        schemaVersion: "explorers-public-fixture-authority/v1",
        status: "rejected",
        command: ["npm", "run", "--silent", "music:fixture:authority:attest"],
        cwd: "<repository>",
        exitCode: contract.exitCode,
        termination: contract.termination,
        attestation: null,
      },
    });
    expect(JSON.stringify(captured), contract.name).not.toContain(privateValue);
  }
});

test("fixture lifecycle commands retain only bounded sanitized typed output without inheriting child streams", async () => {
  // Production break caught: bootstrap/up/down used stdio=inherit, so their raw,
  // unbounded output bypassed the qualification logs and could disclose paths or credentials.
  const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
  const privateValue = "lifecycle-private-value-0123456789";
  const absoluteOutsidePath = process.platform === "win32"
    ? "C:\\private\\fixture\\bootstrap.log"
    : "/private/fixture/bootstrap.log";
  const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = [];
  const captured = qualificationArtifacts.captureQualificationLifecycleCommand({
    stage: "fixture-bootstrap",
    processExecPath: "node-runtime",
    npmExecPath: "npm-cli",
    cwd: process.cwd(),
    retainedCwd: "<repository>",
    environment: { FIXTURE_TEST: "1" },
    workspaceRoot: process.cwd(),
    knownSecrets: [privateValue],
    spawn: (command: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ command, args, options });
      return {
        status: 7,
        signal: null,
        stdout: `workspace=${process.cwd()}\nBearer ${privateValue}\n${"bounded-stdout".repeat(600)}`,
        stderr: `credential=${privateValue}\npath=${absoluteOutsidePath}\n`,
      };
    },
  });

  expect(captured.record).toEqual({
    schemaVersion: "explorers-public-lifecycle-command/v1",
    stage: "fixture-bootstrap",
    command: ["npm", "run", "--silent", "music-cli", "--", "bootstrap"],
    cwd: "<repository>",
    exitCode: 7,
    termination: "exited",
    stdout: {
      status: "captured",
      observedBytes: Buffer.byteLength(`workspace=${process.cwd()}\nBearer ${privateValue}\n${"bounded-stdout".repeat(600)}`),
      retainedBytes: Buffer.byteLength(captured.stdout),
      truncated: true,
    },
    stderr: {
      status: "captured",
      observedBytes: Buffer.byteLength(`credential=${privateValue}\npath=${absoluteOutsidePath}\n`),
      retainedBytes: Buffer.byteLength(captured.stderr),
      truncated: false,
    },
  });
  expect(captured.status).toBe(7);
  expect(`${captured.stdout}\n${captured.stderr}`).toContain("<redacted>");
  expect(`${captured.stdout}\n${captured.stderr}`).toContain("<path>");
  expect(`${captured.stdout}\n${captured.stderr}`).not.toContain(privateValue);
  expect(`${captured.stdout}\n${captured.stderr}`).not.toContain(process.cwd());
  expect(`${captured.stdout}\n${captured.stderr}`).not.toContain(absoluteOutsidePath);
  expect(Buffer.byteLength(captured.stdout)).toBeLessThanOrEqual(4_096);
  expect(calls).toEqual([{
    command: "node-runtime",
    args: ["npm-cli", "run", "--silent", "music-cli", "--", "bootstrap"],
    options: {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { FIXTURE_TEST: "1" },
      maxBuffer: 64 * 1024,
      windowsHide: true,
    },
  }]);
});

test("fixture-down deletes volumes only for the exact reviewed fixture project", async () => {
  const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
  const calls: Array<{ command: string; args: string[] }> = [];
  const captured = qualificationArtifacts.captureQualificationLifecycleCommand({
    stage: "fixture-down",
    processExecPath: "node-runtime",
    npmExecPath: "npm-cli",
    cwd: process.cwd(),
    retainedCwd: "<repository>",
    environment: { FIXTURE_TEST: "1" },
    workspaceRoot: process.cwd(),
    spawn: (command: string, args: string[]) => {
      calls.push({ command, args });
      return { status: 0, signal: null, stdout: "", stderr: "" };
    },
  });
  const expected = [
    "npm", "run", "--silent", "music-cli", "--", "down",
    "--volumes", "--mode", "fixture", "--confirm-project", "explorers-music-fixture",
  ];
  expect(captured.record.command).toEqual(expected);
  expect(calls).toEqual([{
    command: "node-runtime",
    args: ["npm-cli", ...expected.slice(1)],
  }]);
});

test("authoritative per-source streams preserve later up down and state output after an early stream fills its cap", async () => {
  // Production break caught: the global 4 KiB aggregate could be filled by
  // bootstrap, silently dropping later up/down/state bytes while typed command
  // records still claimed those streams were captured.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-per-stream-"));
  try {
    const runId = "per-stream-finalization-run";
    const runDirectory = join(sandbox, ".artifacts", "music-public", runId);
    mkdirSync(runDirectory, { recursive: true });
    const privateValue = "per-stream-private-token";
    const values: Record<string, string> = {
      "fixture-bootstrap:stdout": `bootstrap-start\n${"B".repeat(12_000)}\nbootstrap-end\n`,
      "fixture-bootstrap:stderr": `Bearer ${privateValue}\n`,
      "fixture-up:stdout": "late-up-stdout\n",
      "fixture-up:stderr": "late-up-stderr\n",
      "fixture-down:stdout": "late-down-stdout\n",
      "fixture-down:stderr": "late-down-stderr\n",
      "state-service:stdout": `late-state-stdout\n${"S".repeat(5_000)}\n`,
      "state-service:stderr": "late-state-stderr path=/private/state/service.log\n",
    };
    const streamArtifacts = AUTHORITATIVE_QUALIFICATION_STREAMS.map(({ source, stream }) => {
      const value = values[`${source}:${stream}`];
      return {
        source,
        stream,
        status: "captured",
        observedBytes: Buffer.byteLength(value),
        chunks: [value],
        truncated: false,
      };
    });
    const evidence = {
      version: MUSIC_PUBLIC_FIXTURE_VERSION,
      runId,
      lane: "live",
      result: "failed",
      cleanup: "not-required-safe",
      initialSnapshotQualification: unavailableInitialSnapshotQualification(),
      prebrowserQualification: unavailablePrebrowserQualification(),
      stateServiceLifecycle: {
        schemaVersion: "explorers-public-state-service-lifecycle/v1",
        error: { status: "unavailable" },
        exit: { status: "observed", code: null, signal: "SIGKILL" },
        close: { status: "observed", code: null, signal: "SIGKILL" },
      },
    };
    const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
    const finalized = qualificationArtifacts.finalizeQualificationRunArtifacts({
      runDirectory,
      workspaceRoot: process.cwd(),
      knownSecrets: [privateValue],
      streamArtifacts,
      fixtureAuthority: SAFE_FIXTURE_AUTHORITY_GATE,
      analyticsLedger: {
        schemaVersion: "explorers-public-analytics-ledger/v1",
        status: "unavailable",
        reason: "execution-stopped",
        events: [],
      },
      visualTraceLedger: {
        schemaVersion: "explorers-public-visual-trace-ledger/v1",
        status: "none-retained",
        visuals: [],
        traces: [],
      },
      dockerInspection: {
        schemaVersion: "explorers-public-docker-inspection/v1",
        status: "observed",
        cwd: "<repository>",
        labels: {
          "com.explorers.music.fixture": "true",
          "com.explorers.music.project": "explorers-music-fixture",
        },
        commands: {
          containers: [
            "docker", "ps", "-aq",
            "--filter", "label=com.explorers.music.fixture=true",
            "--filter", "label=com.explorers.music.project=explorers-music-fixture",
          ],
          volumes: [
            "docker", "volume", "ls", "-q",
            "--filter", "label=com.explorers.music.fixture=true",
            "--filter", "label=com.explorers.music.project=explorers-music-fixture",
          ],
        },
        exitCodes: { containers: 0, volumes: 0 },
        containerMatches: [],
        volumeMatches: [],
        containersRemaining: 0,
        volumesRemaining: 0,
        authArtifacts: [
          { path: "owner-auth.json", state: "absent" },
          { path: "profile-storage-state.json", state: "absent" },
        ],
      },
      skipLedger: {
        schemaVersion: "explorers-public-skip-ledger/v1",
        lane: "live",
        execution: "execution-stopped",
        totals: { total: 0, passed: 0, failed: 0, skipped: 0 },
        reasons: [{ scope: "lane", reason: "execution-stopped" }],
      },
      restorationRecord: {
        schemaVersion: "explorers-public-restoration/v1",
        status: "unavailable",
        finalRestore: null,
        journeys: [],
      },
      journeyOutcomeLedger: notRunJourneyOutcomeLedger(),
      evidence,
    });

    expect(finalized).toMatchObject({ files: 17, verified: true });
    const retainedEvidence = JSON.parse(readFileSync(join(runDirectory, "evidence.json"), "utf8"));
    expect(retainedEvidence.streams).toHaveLength(8);
    for (const definition of AUTHORITATIVE_QUALIFICATION_STREAMS) {
      const retained = readFileSync(join(runDirectory, ...definition.path.split("/")), "utf8");
      const record = retainedEvidence.streams.find(({ role }: { role: string }) => role === definition.role);
      expect(record).toMatchObject({
        schemaVersion: "explorers-public-stream-artifact/v1",
        ...definition,
        status: "captured",
        bytes: Buffer.byteLength(retained),
        observedBytes: Buffer.byteLength(values[`${definition.source}:${definition.stream}`]),
        truncated: Buffer.byteLength(values[`${definition.source}:${definition.stream}`]) > 4_096,
      });
      expect(Buffer.byteLength(retained)).toBeLessThanOrEqual(4_096);
      expect(retained).not.toContain(privateValue);
      expect(retained).not.toContain(sandbox);
    }
    expect(readFileSync(join(runDirectory, "logs", "fixture-up.stdout.log"), "utf8")).toContain("late-up-stdout");
    expect(readFileSync(join(runDirectory, "logs", "fixture-down.stdout.log"), "utf8")).toContain("late-down-stdout");
    expect(readFileSync(join(runDirectory, "logs", "state-service.stdout.log"), "utf8")).toContain("late-state-stdout");
    expect(readFileSync(join(runDirectory, "logs", "state-service.stderr.log"), "utf8")).toContain("<path>");
    expect(existsSync(join(runDirectory, "logs", "stdout.log"))).toBe(false);
    expect(existsSync(join(runDirectory, "logs", "stderr.log"))).toBe(false);

    retainedEvidence.streams.pop();
    const tamperedEvidenceBytes = Buffer.from(`${JSON.stringify(retainedEvidence, null, 2)}\n`, "utf8");
    writeFileSync(join(runDirectory, "evidence.json"), tamperedEvidenceBytes);
    rewriteQualificationManifest(runDirectory, (manifest) => {
      const evidenceArtifact = manifest.artifacts.find((artifact) => artifact.role === "evidence");
      Object.assign(evidenceArtifact!, {
        bytes: tamperedEvidenceBytes.length,
        sha256: createHash("sha256").update(tamperedEvidenceBytes).digest("hex"),
      });
    });
    const tamperedVerify = spawnSync(process.execPath, [
      resolve("scripts/music-public-qualification-artifacts.mjs"), "verify", runDirectory,
    ], { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
    expect(tamperedVerify.status).toBe(1);
    expect(tamperedVerify.stderr).toBe("qualification artifact error: qualification stream metadata contract is invalid\n");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("qualification analytics ledger retains only safe UTM and exactly-once observations", async () => {
  // Production break caught: analytics evidence stores raw event/authority IDs,
  // accepts arbitrary event fields, or claims exactly-once without observed counts.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-analytics-ledger-"));
  try {
    const runDirectory = join(sandbox, ".artifacts", "music-public", "analytics-ledger-run");
    mkdirSync(runDirectory, { recursive: true });
    const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
    const ledger = observedQualificationAnalyticsLedger();
    let result: { bytes: number; events: number; status: string } | undefined;
    expect(() => {
      result = qualificationArtifacts.writeQualificationAnalyticsLedger({ runDirectory, ledger });
    }).not.toThrow();
    expect(result).toEqual({ bytes: expect.any(Number), events: 1, status: "observed" });
    const retained = readFileSync(join(runDirectory, "analytics-events.jsonl"), "utf8");
    expect(retained).toBe(`${JSON.stringify(ledger)}\n`);
    expect(Buffer.byteLength(retained)).toBe(result!.bytes);
    expect(retained).not.toMatch(/Bearer|authorization|capability|credential|access[_-]?token|https?:\/\//i);
    expect(() => qualificationArtifacts.writeQualificationAnalyticsLedger({ runDirectory, ledger }))
      .toThrow("qualification artifact already exists");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

const unsafeAnalyticsLedgerCases: Array<{
  name: string;
  mutate: (ledger: ReturnType<typeof observedQualificationAnalyticsLedger>) => void;
}> = [
  {
    name: "a raw event ID field",
    mutate: (ledger) => Object.assign(ledger.events[0].delivery, { eventId: "must-not-survive" }),
  },
  {
    name: "an arbitrary authority field",
    mutate: (ledger) => Object.assign(ledger.events[0], { authorization: "Bearer must-not-survive" }),
  },
  {
    name: "an unknown product event",
    mutate: (ledger) => { ledger.events[0].event = { name: "credential_exposed", route: "friendly" }; },
  },
  {
    name: "a URL-shaped UTM value",
    mutate: (ledger) => { ledger.events[0].utm.utm_source = "https://private.example/path"; },
  },
  {
    name: "an unknown UTM key",
    mutate: (ledger) => Object.assign(ledger.events[0].utm, { utm_token: "must-not-survive" }),
  },
  {
    name: "a noncanonical observation sequence",
    mutate: (ledger) => { ledger.events[0].sequence = 2; },
  },
  {
    name: "a non-SHA occurrence identifier",
    mutate: (ledger) => { ledger.events[0].delivery.occurrenceSha256 = "raw-occurrence-id"; },
  },
  {
    name: "a false exactly-once assertion",
    mutate: (ledger) => { ledger.events[0].delivery.exactlyOnce = false; },
  },
  {
    name: "multiple distinct event IDs for one occurrence",
    mutate: (ledger) => { ledger.events[0].delivery.distinctEventIds = 2; },
  },
  {
    name: "multiple committed events for one occurrence",
    mutate: (ledger) => { ledger.events[0].delivery.committedEvents = 2; },
  },
  {
    name: "more duplicate responses than attempts",
    mutate: (ledger) => { ledger.events[0].delivery.duplicateResponses = 3; },
  },
];

for (const contract of unsafeAnalyticsLedgerCases) {
  test(`qualification analytics ledger rejects ${contract.name}`, async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "music-public-unsafe-analytics-"));
    try {
      const runDirectory = join(sandbox, ".artifacts", "music-public", "unsafe-analytics-run");
      mkdirSync(runDirectory, { recursive: true });
      const ledger = observedQualificationAnalyticsLedger();
      contract.mutate(ledger);
      const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
      expect(() => qualificationArtifacts.writeQualificationAnalyticsLedger({ runDirectory, ledger }))
        .toThrow("qualification analytics ledger contract is invalid");
      expect(existsSync(join(runDirectory, "analytics-events.jsonl"))).toBe(false);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
}

test("qualification analytics ledger records a preflight evidence gap without placeholder events", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-unavailable-analytics-"));
  try {
    const runDirectory = join(sandbox, ".artifacts", "music-public", "unavailable-analytics-run");
    mkdirSync(runDirectory, { recursive: true });
    const ledger = {
      schemaVersion: "explorers-public-analytics-ledger/v1",
      status: "unavailable",
      reason: "preflight-stopped",
      events: [],
    };
    const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
    expect(qualificationArtifacts.writeQualificationAnalyticsLedger({ runDirectory, ledger })).toEqual({
      bytes: Buffer.byteLength(`${JSON.stringify(ledger)}\n`),
      events: 0,
      status: "unavailable",
    });
    expect(readFileSync(join(runDirectory, "analytics-events.jsonl"), "utf8")).toBe(`${JSON.stringify(ledger)}\n`);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("qualification Docker inspection retains exact bounded label-filter matches without raw command output", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-docker-inspection-"));
  try {
    const runDirectory = join(sandbox, ".artifacts", "music-public", "docker-inspection-run");
    mkdirSync(runDirectory, { recursive: true });
    writeFileSync(join(runDirectory, "owner-auth.json"), "private material must never be retained");
    const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = [];
    const containerId = "a".repeat(64);
    const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
    const inspection = qualificationArtifacts.inspectQualificationDockerCleanup({
      runDirectory,
      inspectionCwd: sandbox,
      retainedCwd: "<repository>",
      exists: existsSync,
      spawn: (command: string, args: string[], options: Record<string, unknown>) => {
        calls.push({ command, args, options });
        return {
          status: 0,
          stdout: args[0] === "ps" ? `${containerId}\n` : "explorers_music_fixture_cache\n",
          stderr: "must not be retained",
        };
      },
    });
    expect(inspection).toEqual({
      schemaVersion: "explorers-public-docker-inspection/v1",
      status: "observed",
      cwd: "<repository>",
      labels: {
        "com.explorers.music.fixture": "true",
        "com.explorers.music.project": "explorers-music-fixture",
      },
      commands: {
        containers: [
          "docker", "ps", "-aq",
          "--filter", "label=com.explorers.music.fixture=true",
          "--filter", "label=com.explorers.music.project=explorers-music-fixture",
        ],
        volumes: [
          "docker", "volume", "ls", "-q",
          "--filter", "label=com.explorers.music.fixture=true",
          "--filter", "label=com.explorers.music.project=explorers-music-fixture",
        ],
      },
      exitCodes: { containers: 0, volumes: 0 },
      containerMatches: [containerId],
      volumeMatches: ["explorers_music_fixture_cache"],
      containersRemaining: 1,
      volumesRemaining: 1,
      authArtifacts: [
        { path: "owner-auth.json", state: "present" },
        { path: "profile-storage-state.json", state: "absent" },
      ],
    });
    expect(calls).toHaveLength(2);
    expect(calls.every(({ command }) => command === "docker")).toBe(true);
    expect(calls.every(({ options }) => options.encoding === "utf8" && options.windowsHide === true
      && options.maxBuffer === 8 * 1024)).toBe(true);
    expect(JSON.stringify(inspection)).not.toContain("must not be retained");
    expect(JSON.stringify(inspection)).not.toContain(sandbox);
    expect(qualificationArtifacts.assessQualificationCleanup({
      lane: "live", cleanup: "not-required-safe", dockerInspection: inspection,
    })).toEqual({
      verified: false,
      gaps: [
        "docker-containers-remain",
        "docker-volumes-remain",
        "auth-artifact-present:owner-auth.json",
      ],
    });
    expect(qualificationArtifacts.assessQualificationCleanup({
      lane: "live",
      cleanup: "not-required-safe",
      dockerInspection: {
        ...inspection,
        containerMatches: [],
        volumeMatches: [],
        containersRemaining: 0,
        volumesRemaining: 0,
        authArtifacts: inspection.authArtifacts.map(({ path: relativePath }: { path: string }) => ({
          path: relativePath,
          state: "absent",
        })),
      },
    })).toEqual({ verified: true, gaps: [] });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("qualification outcome projection derives exact totals, skip gaps, and restoration hashes without private rows", async () => {
  const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
  const finalHash = "f".repeat(64);
  const records = validJourneyEvidenceRecords();
  const completed = qualificationArtifacts.buildQualificationOutcomeRecords({
    lane: "live",
    executionOutcome: {
      status: 0,
      executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, { resultStatus: "passed" }),
    },
    report: {
      finalRestore: { cleanup: "restored", beforeHash: finalHash, afterHash: finalHash },
      journeys: records,
    },
  });
  expect(completed.skipLedger).toEqual({
    schemaVersion: "explorers-public-skip-ledger/v1",
    lane: "live",
    execution: "completed",
    totals: { total: 49, passed: 49, failed: 0, skipped: 0 },
    reasons: [],
  });
  expect(completed.restorationRecord).toEqual({
    schemaVersion: "explorers-public-restoration/v1",
    status: "journeys-restored",
    finalRestore: { beforeHash: finalHash, afterHash: finalHash },
    journeys: records.map(({ id, beforeHash, afterHash }) => ({ id, beforeHash, afterHash })),
  });
  expect(JSON.stringify(completed)).not.toContain("rowCount");
  expect(JSON.stringify(completed)).not.toContain("rows");

  const preflight = qualificationArtifacts.buildQualificationOutcomeRecords({
    lane: "live",
    executionOutcome: {
      status: 4,
      preflightDiagnostics: { failureStage: "preflight", subcheck: "authority-process" },
    },
    report: {
      finalRestore: { cleanup: "restored", beforeHash: finalHash, afterHash: finalHash },
    },
  });
  expect(preflight.skipLedger).toEqual({
    schemaVersion: "explorers-public-skip-ledger/v1",
    lane: "live",
    execution: "preflight-stopped",
    totals: { total: 0, passed: 0, failed: 0, skipped: 0 },
    reasons: [{ scope: "authority", reason: "authority-process" }],
  });
  expect(preflight.restorationRecord).toEqual({
    schemaVersion: "explorers-public-restoration/v1",
    status: "initial-restored",
    finalRestore: { beforeHash: finalHash, afterHash: finalHash },
    journeys: [],
  });
});

test("preflight-stopped qualification finalization writes every safe artifact and verifies its manifest", async () => {
  // Production break caught: a failed guarded run leaves only evidence.json,
  // without immutable logs, exact cleanup inspection, skip/gap ledgers, or a verifier result.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-finalization-"));
  try {
    const runId = "preflight-finalization-run";
    const runDirectory = join(sandbox, ".artifacts", "music-public", runId);
    mkdirSync(runDirectory, { recursive: true });
    const finalHash = "c".repeat(64);
    const input = {
      runDirectory,
      workspaceRoot: process.cwd(),
      knownSecrets: ["finalization-private-token"],
      streamArtifacts: AUTHORITATIVE_QUALIFICATION_STREAMS.map(({ source, stream }) => {
        const value = source === "fixture-bootstrap" && stream === "stdout"
          ? "guarded run stopped before mutation callback\n"
          : (source === "fixture-bootstrap" && stream === "stderr"
            ? "access_token=finalization-private-token\n"
            : undefined);
        return value === undefined
          ? { source, stream, status: "unavailable", observedBytes: 0, chunks: [], truncated: false }
          : { source, stream, status: "captured", observedBytes: Buffer.byteLength(value), chunks: [value], truncated: false };
      }),
      fixtureAuthority: SAFE_FIXTURE_AUTHORITY_GATE,
      analyticsLedger: {
        schemaVersion: "explorers-public-analytics-ledger/v1",
        status: "unavailable",
        reason: "preflight-stopped",
        events: [],
      },
      visualTraceLedger: {
        schemaVersion: "explorers-public-visual-trace-ledger/v1",
        status: "none-retained",
        visuals: [],
        traces: [],
      },
      dockerInspection: {
        schemaVersion: "explorers-public-docker-inspection/v1",
        status: "observed",
        cwd: "<repository>",
        labels: {
          "com.explorers.music.fixture": "true",
          "com.explorers.music.project": "explorers-music-fixture",
        },
        commands: {
          containers: [
            "docker", "ps", "-aq",
            "--filter", "label=com.explorers.music.fixture=true",
            "--filter", "label=com.explorers.music.project=explorers-music-fixture",
          ],
          volumes: [
            "docker", "volume", "ls", "-q",
            "--filter", "label=com.explorers.music.fixture=true",
            "--filter", "label=com.explorers.music.project=explorers-music-fixture",
          ],
        },
        exitCodes: { containers: 0, volumes: 0 },
        containerMatches: [],
        volumeMatches: [],
        containersRemaining: 0,
        volumesRemaining: 0,
        authArtifacts: [
          { path: "owner-auth.json", state: "absent" },
          { path: "profile-storage-state.json", state: "absent" },
        ],
      },
      skipLedger: {
        schemaVersion: "explorers-public-skip-ledger/v1",
        lane: "live",
        execution: "preflight-stopped",
        totals: { total: 0, passed: 0, failed: 0, skipped: 0 },
        reasons: [{ scope: "live-manifest", reason: "manifest-missing" }],
      },
      restorationRecord: {
        schemaVersion: "explorers-public-restoration/v1",
        status: "initial-restored",
        finalRestore: { beforeHash: finalHash, afterHash: finalHash },
        journeys: [],
      },
      journeyOutcomeLedger: notRunJourneyOutcomeLedger(),
      evidence: {
        version: MUSIC_PUBLIC_FIXTURE_VERSION,
        runId,
        lane: "live",
        result: "failed",
        cleanup: "restored",
        commit: "c".repeat(40),
        command: "npm run music:test:public-e2e",
        cwd: "explorers-earth",
        initialSnapshotQualification: unavailableInitialSnapshotQualification(),
        prebrowserQualification: unavailablePrebrowserQualification(),
        stateServiceLifecycle: {
          schemaVersion: "explorers-public-state-service-lifecycle/v1",
          error: { status: "unavailable" },
          exit: { status: "unavailable" },
          close: { status: "unavailable" },
        },
      },
    };
    const qualificationArtifacts = await import("../scripts/music-public-qualification-artifacts.mjs");
    let finalized: { files: number; manifestSha256: string; verified: boolean } | undefined;
    expect(() => { finalized = qualificationArtifacts.finalizeQualificationRunArtifacts(input); }).not.toThrow();
    expect(finalized).toEqual({ files: 17, manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/), verified: true });
    expect(readFileSync(join(runDirectory, "logs", "fixture-bootstrap.stdout.log"), "utf8"))
      .toBe("guarded run stopped before mutation callback\n");
    expect(readFileSync(join(runDirectory, "logs", "fixture-bootstrap.stderr.log"), "utf8"))
      .toBe("access_token=<redacted>\n");
    expect(readFileSync(join(runDirectory, "logs", "state-service.stdout.log"), "utf8")).toBe("");
    expect(JSON.parse(readFileSync(join(runDirectory, "docker-inspection.json"), "utf8")))
      .toEqual(input.dockerInspection);
    expect(JSON.parse(readFileSync(join(runDirectory, "skip-reasons.json"), "utf8")))
      .toEqual(input.skipLedger);
    expect(JSON.parse(readFileSync(join(runDirectory, "restoration.json"), "utf8")))
      .toEqual(input.restorationRecord);
    expect(JSON.parse(readFileSync(join(runDirectory, "journey-outcomes.json"), "utf8")))
      .toEqual(input.journeyOutcomeLedger);
    expect(JSON.parse(readFileSync(join(runDirectory, "evidence.json"), "utf8")).journeyOutcomes)
      .toEqual(input.journeyOutcomeLedger);
    expect(readFileSync(join(runDirectory, "evidence.json"), "utf8").toString())
      .not.toContain("finalization-private-token");
    expect(existsSync(join(runDirectory, "restore-evidence.jsonl"))).toBe(false);
    const verify = spawnSync(process.execPath, [
      resolve("scripts/music-public-qualification-artifacts.mjs"), "verify", runDirectory,
    ], { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
    expect(verify.status, `${verify.stdout}\n${verify.stderr}`).toBe(0);
    expect(JSON.parse(verify.stdout)).toMatchObject({ files: 17, manifestSha256: finalized!.manifestSha256 });

    const failedQualifierRunId = "failed-qualifier-finalization-run";
    const failedQualifierRunDirectory = join(sandbox, ".artifacts", "music-public", failedQualifierRunId);
    mkdirSync(failedQualifierRunDirectory);
    const failedQualifierFinalized = qualificationArtifacts.finalizeQualificationRunArtifacts({
      ...input,
      runDirectory: failedQualifierRunDirectory,
      evidence: {
        ...input.evidence,
        runId: failedQualifierRunId,
        prebrowserQualification: failedPrebrowserQualification(),
      },
    });
    expect(failedQualifierFinalized).toEqual({
      files: 17,
      manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      verified: true,
    });
    const failedEvidence = JSON.parse(readFileSync(join(failedQualifierRunDirectory, "evidence.json"), "utf8"));
    expect(failedEvidence.prebrowserQualification).toEqual(failedPrebrowserQualification());
    expect(failedEvidence.journeyOutcomes.counts).toEqual({
      execution: { total: 49, passed: 0, failed: 0, skipped: 0, notRun: 49 },
      terminal: { total: 17, passed: 0, failed: 0, missing: 0, invalid: 0, notRun: 17 },
    });
    const failedManifest = JSON.parse(readFileSync(join(failedQualifierRunDirectory, "manifest.json"), "utf8"));
    expect(failedManifest.artifacts).toHaveLength(17);
    expect(failedManifest.artifacts).toEqual(expect.arrayContaining(
      REQUIRED_QUALIFICATION_ARTIFACTS.map(({ role, path: artifactPath }) => (
        expect.objectContaining({ role, path: artifactPath })
      )),
    ));
    const failedVerify = spawnSync(process.execPath, [
      resolve("scripts/music-public-qualification-artifacts.mjs"), "verify", failedQualifierRunDirectory,
    ], { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
    expect(failedVerify.status, `${failedVerify.stdout}\n${failedVerify.stderr}`).toBe(0);
    expect(JSON.parse(failedVerify.stdout)).toMatchObject({
      files: 17,
      manifestSha256: failedQualifierFinalized.manifestSha256,
    });
    expect(readFileSync(join(failedQualifierRunDirectory, "evidence.json"), "utf8"))
      .not.toMatch(/Bearer|C:\\Users|https?:\/\/|credential|access[_-]?token/i);

    const persistedRunId = "persisted-failure-ledger-run";
    const persistedRunDirectory = join(sandbox, ".artifacts", "music-public", persistedRunId);
    mkdirSync(persistedRunDirectory);
    const expectedExecution = [...EXPECTED_LIVE_JOURNEYS, ...EXPECTED_LIVE_READ_ONLY];
    const statusById = Object.fromEntries(expectedExecution.map(({ id }, index) => [
      id,
      index < 32 ? "passed" : (index < 44 ? "failed" : "skipped"),
    ]));
    const livePreflight = await import("../scripts/music-public-live-preflight.mjs");
    const persistedLedger = livePreflight.buildSanitizedJourneyOutcomeLedger({
      executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, { statusById }),
      reportStatus: "accepted",
      terminalRecords: EXPECTED_LIVE_JOURNEYS.map(({ id }, index) => ({ id, status: index < 12 ? "passed" : "failed" })),
      terminalStatus: "accepted",
    });
    livePreflight.persistSanitizedJourneyOutcomeLedger({
      path: join(persistedRunDirectory, "journey-outcomes.json"),
      ledger: persistedLedger,
    });
    expect(() => qualificationArtifacts.finalizeQualificationRunArtifacts({
      ...input,
      runDirectory: persistedRunDirectory,
      journeyOutcomeLedger: persistedLedger,
      journeyOutcomeLedgerPersisted: true,
      evidence: { ...input.evidence, runId: persistedRunId },
    })).toThrow("qualification structured artifact contract is invalid");
    const persistedFinalized = qualificationArtifacts.finalizeQualificationRunArtifacts({
      ...input,
      runDirectory: persistedRunDirectory,
      journeyOutcomeLedger: persistedLedger,
      journeyOutcomeLedgerPersisted: true,
      skipLedger: {
        schemaVersion: "explorers-public-skip-ledger/v1",
        lane: "live",
        execution: "completed",
        totals: { total: 49, passed: 32, failed: 12, skipped: 5 },
        reasons: [{ scope: "journey", reason: "test-skipped" }],
      },
      evidence: { ...input.evidence, runId: persistedRunId },
    });
    expect(persistedFinalized).toMatchObject({ files: 17, verified: true });
    expect(JSON.parse(readFileSync(join(persistedRunDirectory, "evidence.json"), "utf8")).journeyOutcomes)
      .toEqual(persistedLedger);
    expect(JSON.parse(readFileSync(join(persistedRunDirectory, "manifest.json"), "utf8")).artifacts)
      .toEqual(expect.arrayContaining([expect.objectContaining({ role: "journey-outcomes", path: "journey-outcomes.json" })]));

    const partialRunId = "run21df-shaped-finalization";
    const partialRunDirectory = join(sandbox, ".artifacts", "music-public", partialRunId);
    mkdirSync(partialRunDirectory);
    const failedId = EXPECTED_LIVE_JOURNEYS[0]!.id;
    const partialExecutionReport = playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, {
      statusById: { [failedId]: "failed" },
    });
    const partialLedger = livePreflight.buildSanitizedJourneyOutcomeLedger({
      executionReport: partialExecutionReport,
      reportStatus: "accepted",
      terminalRecords: [{ id: failedId, status: "passed" }],
      terminalStatus: "accepted",
    });
    livePreflight.persistSanitizedJourneyOutcomeLedger({
      path: join(partialRunDirectory, "journey-outcomes.json"),
      ledger: partialLedger,
    });
    const partialRecords = qualificationArtifacts.buildQualificationOutcomeRecords({
      lane: "live",
      executionOutcome: {
        status: 1,
        executionReport: partialExecutionReport,
        reportStatus: "accepted",
        outcomeLedgerStatus: "persisted",
        journeyOutcomeLedger: partialLedger,
      },
      report: {
        cleanup: "restored",
        finalRestore: { beforeHash: finalHash, afterHash: finalHash },
      },
    });
    const partialFinalized = qualificationArtifacts.finalizeQualificationRunArtifacts({
      ...input,
      runDirectory: partialRunDirectory,
      skipLedger: partialRecords.skipLedger,
      restorationRecord: partialRecords.restorationRecord,
      journeyOutcomeLedger: partialLedger,
      journeyOutcomeLedgerPersisted: true,
      evidence: { ...input.evidence, runId: partialRunId, result: "failed", cleanup: "restored" },
    });
    expect(partialFinalized).toMatchObject({ files: 17, verified: true });
    expect(JSON.parse(readFileSync(join(partialRunDirectory, "journey-outcomes.json"), "utf8"))).toMatchObject({
      integrity: "invalid",
      counts: {
        execution: { total: 49, failed: 1, notRun: 48 },
        terminal: { total: 17, invalid: 1, notRun: 16 },
      },
      mutationTerminals: [
        { id: failedId, status: "invalid", reason: "terminal-execution-mismatch", stage: "post-terminal" },
        ...EXPECTED_LIVE_JOURNEYS.slice(1).map(({ id }) => ({
          id, status: "not-run", reason: "execution-stopped", stage: "execution",
        })),
      ],
    });
    expect(JSON.parse(readFileSync(join(partialRunDirectory, "restoration.json"), "utf8"))).toEqual({
      schemaVersion: "explorers-public-restoration/v1",
      status: "initial-restored",
      finalRestore: { beforeHash: finalHash, afterHash: finalHash },
      journeys: [],
    });
    expect(JSON.parse(readFileSync(join(partialRunDirectory, "evidence.json"), "utf8"))).toMatchObject({
      result: "failed", cleanup: "restored",
    });
    const partialManifest = JSON.parse(readFileSync(join(partialRunDirectory, "manifest.json"), "utf8"));
    expect(partialManifest.artifacts).toHaveLength(17);
    const partialVerify = spawnSync(process.execPath, [
      resolve("scripts/music-public-qualification-artifacts.mjs"), "verify", partialRunDirectory,
    ], { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
    expect(partialVerify.status, `${partialVerify.stdout}\n${partialVerify.stderr}`).toBe(0);
    expect(JSON.parse(partialVerify.stdout)).toMatchObject({
      files: 17, manifestSha256: partialFinalized.manifestSha256,
    });

    const profileRunId = "profile-batch-failure-finalization";
    const profileRunDirectory = join(sandbox, ".artifacts", "music-public", profileRunId);
    mkdirSync(profileRunDirectory);
    const profileFailure = {
      stage: "row-public-gallery-panel", code: "timeout", rowOrdinal: 1, completedRows: 0,
    };
    const profileExecutionReport = playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, {
      statusById: {
        ...Object.fromEntries([
          ...EXPECTED_LIVE_JOURNEYS.slice(0, 11), ...EXPECTED_LIVE_READ_ONLY.slice(0, -1),
        ].map(({ id }) => [id, "passed"])),
        "profile.owner.pairwise.batch-01": "failed",
      },
    });
    const profileLedger = livePreflight.buildSanitizedJourneyOutcomeLedger({
      executionReport: profileExecutionReport,
      reportStatus: "accepted",
      terminalRecords: [
        ...validJourneyEvidenceRecords().slice(0, 11),
        buildLiveJourneyTerminal({
          id: "profile.owner.pairwise.batch-01", status: "failed", reason: "body-failed", stage: "body",
          cleanup: "restored", beforeHash: finalHash, afterHash: finalHash,
          rows: buildProfileCoveringRows().slice(0, 12), profileBatchFailure: profileFailure,
        }),
      ],
      terminalStatus: "accepted",
    });
    const profileRecords = qualificationArtifacts.buildQualificationOutcomeRecords({
      lane: "live",
      executionOutcome: {
        status: 1, executionReport: profileExecutionReport, reportStatus: "accepted",
        journeyOutcomeLedger: profileLedger,
      },
      report: { cleanup: "restored", finalRestore: { beforeHash: finalHash, afterHash: finalHash } },
    });
    const profileFinalized = qualificationArtifacts.finalizeQualificationRunArtifacts({
      ...input,
      runDirectory: profileRunDirectory,
      skipLedger: profileRecords.skipLedger,
      restorationRecord: profileRecords.restorationRecord,
      journeyOutcomeLedger: profileLedger,
      evidence: { ...input.evidence, runId: profileRunId, result: "failed", cleanup: "restored" },
    });
    expect(profileFinalized).toMatchObject({ files: 17, verified: true });
    expect(profileLedger.counts.execution).toEqual({ total: 49, passed: 42, failed: 1, skipped: 0, notRun: 6 });
    const profileRetained = JSON.parse(readFileSync(join(profileRunDirectory, "evidence.json"), "utf8"));
    expect(profileRetained.journeyOutcomes).toEqual(profileLedger);
    expect(profileRetained.journeyOutcomes.mutationTerminals[11].profileBatchFailure).toEqual(profileFailure);
    const profileVerify = spawnSync(process.execPath, [
      resolve("scripts/music-public-qualification-artifacts.mjs"), "verify", profileRunDirectory,
    ], { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
    expect(profileVerify.status, `${profileVerify.stdout}\n${profileVerify.stderr}`).toBe(0);

    // Build a separate historical fixture; current production never emits v3.
    const historicalDirectory = join(sandbox, ".artifacts", "music-public", "historical-gallery-v3");
    mkdirSync(historicalDirectory);
    mkdirSync(join(historicalDirectory, "logs"));
    for (const { path } of REQUIRED_QUALIFICATION_ARTIFACTS) {
      copyFileSync(join(profileRunDirectory, path), join(historicalDirectory, path));
    }
    const historicalLedger = structuredClone(profileLedger);
    historicalLedger.schemaVersion = "explorers-public-journey-outcomes/v3";
    historicalLedger.mutationTerminals[11].profileBatchFailure = {
      stage: "row-public-gallery", code: "locator-missing", rowOrdinal: 1, completedRows: 0,
    };
    const historicalEvidence = { ...profileRetained, journeyOutcomes: historicalLedger };
    writeFileSync(join(historicalDirectory, "journey-outcomes.json"), `${JSON.stringify(historicalLedger, null, 2)}\n`);
    writeFileSync(join(historicalDirectory, "evidence.json"), `${JSON.stringify(historicalEvidence, null, 2)}\n`);
    const historicalManifest = JSON.parse(readFileSync(join(profileRunDirectory, "manifest.json"), "utf8"));
    for (const artifact of historicalManifest.artifacts) {
      const bytes = readFileSync(join(historicalDirectory, artifact.path));
      artifact.bytes = bytes.length;
      artifact.sha256 = createHash("sha256").update(bytes).digest("hex");
    }
    const historicalManifestBytes = `${JSON.stringify(historicalManifest, null, 2)}\n`;
    writeFileSync(join(historicalDirectory, "manifest.json"), historicalManifestBytes);
    writeFileSync(join(historicalDirectory, "manifest.sha256"), `${createHash("sha256").update(historicalManifestBytes).digest("hex")}\n`);
    const historicalVerify = spawnSync(process.execPath, [
      resolve("scripts/music-public-qualification-artifacts.mjs"), "verify", historicalDirectory,
    ], { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
    expect(historicalVerify.status, `${historicalVerify.stdout}\n${historicalVerify.stderr}`).toBe(0);
    expect(JSON.parse(historicalVerify.stdout)).toMatchObject({ files: 17 });

    const unsafeRunDirectory = join(sandbox, ".artifacts", "music-public", "unsafe-finalization-run");
    mkdirSync(unsafeRunDirectory);
    expect(() => qualificationArtifacts.finalizeQualificationRunArtifacts({
      ...input,
      runDirectory: unsafeRunDirectory,
      evidence: { ...input.evidence, observedPath: "/private/build/output.log" },
    })).toThrow("qualification structured artifact is invalid");
    expect(existsSync(join(unsafeRunDirectory, "logs", "fixture-bootstrap.stdout.log"))).toBe(false);
    expect(existsSync(join(unsafeRunDirectory, "analytics-events.jsonl"))).toBe(false);

    const missingPersistedRunDirectory = join(sandbox, ".artifacts", "music-public", "missing-persisted-ledger-run");
    mkdirSync(missingPersistedRunDirectory);
    expect(() => qualificationArtifacts.finalizeQualificationRunArtifacts({
      ...input,
      runDirectory: missingPersistedRunDirectory,
      journeyOutcomeLedgerPersisted: true,
    })).toThrow("qualification journey outcome ledger is missing or unreadable");
    expect(existsSync(join(missingPersistedRunDirectory, "manifest.json"))).toBe(false);
    expect(existsSync(join(missingPersistedRunDirectory, "manifest.sha256"))).toBe(false);
    expect(existsSync(join(missingPersistedRunDirectory, "journey-outcomes.json"))).toBe(false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("explicit live authority rejects malformed argv before any random authority is generated", async () => {
  // Production break caught: the public runner previously accepted no argv at
  // all and tried to reconstruct mutation authority from ambient variables.
  const modulePath = "../scripts/music-public-live-authority.mjs";
  const authorityModule = await import(modulePath).catch(() => null) as null | {
    buildMusicPublicLiveAuthority(input: {
      args: readonly string[];
      environment: Record<string, string | undefined>;
      randomBytes: (size: number) => Buffer;
    }): unknown;
  };
  expect(authorityModule, "the side-effect-free live authority builder must exist").not.toBeNull();
  if (!authorityModule) return;

  let randomCalls = 0;
  const invoke = (args: readonly string[]) => authorityModule.buildMusicPublicLiveAuthority({
    args,
    environment: {},
    randomBytes: (size) => { randomCalls += 1; return Buffer.alloc(size, 0x11); },
  });
  const wrongValue = [...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS];
  wrongValue[1] = "not-the-reviewed-acknowledgement";
  const duplicate = [...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS, "--ack", EXACT_PUBLIC_LIVE_AUTHORITY_ARGS[1]];
  const extra = [...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS, "--dry-run"];
  const reordered = [...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS];
  [reordered[0], reordered[2]] = [reordered[2], reordered[0]];

  for (const invalid of [[], EXACT_PUBLIC_LIVE_AUTHORITY_ARGS.slice(0, -2), wrongValue, duplicate, extra, reordered]) {
    expect(() => invoke(invalid)).toThrow(/refused/i);
  }
  expect(randomCalls).toBe(0);
});

test("explicit live authority rejects every ambient target or credential override before randomness", async () => {
  // Production break caught: a correct-looking local argv could still inherit a
  // database, production, URL, token, or identity target from the shell.
  const modulePath = "../scripts/music-public-live-authority.mjs";
  const authorityModule = await import(modulePath).catch(() => null) as null | {
    buildMusicPublicLiveAuthority(input: {
      args: readonly string[];
      environment: Record<string, string | undefined>;
      randomBytes: (size: number) => Buffer;
    }): unknown;
  };
  expect(authorityModule, "the side-effect-free live authority builder must exist").not.toBeNull();
  if (!authorityModule) return;

  let randomCalls = 0;
  for (const hostileEnvironment of [
    { MUSIC_E2E_STRAPI_TOKEN: "hostile-token" },
    { music_e2e_account_username: "hostile-owner" },
    { MUSIC_PUBLIC_RUN_ID: "caller-selected-run" },
    { PLAYWRIGHT_EXTERNAL_BASE_URL: "https://explorers.earth" },
    { MUSIC_API_BASE_URL: "https://localtunes.earth" },
    { MUSIC_STRAPI_HOST_PORT: "1337" },
    { LIVE_STRAPI_URL: "https://cms.example" },
    { LIVE_STRAPI_READ_ONLY_CREDENTIAL: "hostile-credential" },
    { STRAPI_URL: "https://cms.example" },
    { STRAPI_ACCESS_TOKEN: "hostile-access-token" },
    { DATABASE_URL: "postgresql://production.example/music" },
    { DATABASE_URL_TEST: "postgresql://127.0.0.1:5432/shared" },
    { DOCKER_HOST: "tcp://production.example:2375" },
    { GATE_PROD: "1" },
    { MUSIC_DEPLOY_PRODUCTION: "1" },
  ]) {
    expect(() => authorityModule.buildMusicPublicLiveAuthority({
      args: EXACT_PUBLIC_LIVE_AUTHORITY_ARGS,
      environment: hostileEnvironment,
      randomBytes: (size) => { randomCalls += 1; return Buffer.alloc(size, 0x22); },
    })).toThrow(/refused/i);
  }
  expect(randomCalls).toBe(0);
});

test("explicit live authority derives one distinct namespaced tuple and fixed five-service topology", async () => {
  // Production break caught: the old shell recipe let ports, URLs, identities,
  // and the fixture token drift independently across one supposedly owned run.
  const modulePath = "../scripts/music-public-live-authority.mjs";
  const authorityModule = await import(modulePath).catch(() => null) as null | {
    buildMusicPublicLiveAuthority(input: {
      args: readonly string[];
      environment: Record<string, string | undefined>;
      randomBytes: (size: number) => Buffer;
    }): {
      runId: string;
      namespace: string;
      username: string;
      accountDocumentId: string;
      userDocumentId: string;
      fixtureToken: string;
      project: string;
      externalUrl: string;
      strapiUrl: string;
      serviceOrigins: string[];
      healthUrls: string[];
      environment: Record<string, string>;
    };
  };
  expect(authorityModule, "the side-effect-free live authority builder must exist").not.toBeNull();
  if (!authorityModule) return;

  const fills = [0x11, 0x22, 0x33, 0x44];
  const generated = [0, 1].map(() => authorityModule.buildMusicPublicLiveAuthority({
    args: EXACT_PUBLIC_LIVE_AUTHORITY_ARGS,
    environment: {},
    randomBytes: (size) => Buffer.alloc(size, fills.shift()),
  }));
  const first = generated[0];
  expect(first.runId).toBe("11".repeat(16));
  expect(first.namespace).toBe(`e2e-public-music-${first.runId}`);
  expect(new Set([first.namespace, first.username, first.accountDocumentId, first.userDocumentId]).size).toBe(4);
  expect(first).toMatchObject({
    project: "explorers-music-fixture",
    username: `${first.namespace}-owner`,
    accountDocumentId: `${first.namespace}-account`,
    userDocumentId: `${first.namespace}-user`,
    externalUrl: "http://localhost:55173",
    strapiUrl: "http://127.0.0.1:51337",
    serviceOrigins: [
      "tcp://127.0.0.1:55432",
      "http://127.0.0.1:51337",
      "http://127.0.0.1:55000",
      "http://localhost:55173",
      "http://127.0.0.1:55174",
    ],
    healthUrls: [
      "tcp://127.0.0.1:55432",
      "http://127.0.0.1:51337/health",
      "http://127.0.0.1:55000/api/music-fixture/readiness",
      "http://localhost:55173/health",
      "http://127.0.0.1:55174/health",
    ],
  });
  expect(first.environment).toMatchObject({
    MUSIC_PUBLIC_RUN_ID: first.runId,
    PLAYWRIGHT_EXTERNAL_BASE_URL: first.externalUrl,
    PLAYWRIGHT_PR_SAFE: "false",
    MUSIC_STRAPI_HOST_PORT: "51337",
    MUSIC_E2E_ACCOUNT_USERNAME: first.username,
    MUSIC_E2E_ACCOUNT_DOCUMENT_ID: first.accountDocumentId,
    MUSIC_E2E_USER_DOCUMENT_ID: first.userDocumentId,
    MUSIC_E2E_STRAPI_URL: first.strapiUrl,
    MUSIC_E2E_STRAPI_TOKEN: first.fixtureToken,
  });
  expect(first.fixtureToken).toBe(Buffer.alloc(32, 0x22).toString("base64url"));
  expect(generated[1].runId).not.toBe(first.runId);
  expect(generated[1].fixtureToken).not.toBe(first.fixtureToken);
  expect(JSON.stringify(EXACT_PUBLIC_LIVE_AUTHORITY_ARGS)).not.toContain(first.fixtureToken);
});

test("naked or ambient-hostile live invocation refuses before artifacts and fixture lifecycle", () => {
  // Production break caught: the documented naked command failed only after
  // trying to source a hand-built ambient tuple, while a hostile shell could
  // influence generated authority before the lifecycle gate.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-invocation-refusal-"));
  try {
    const lifecycleLog = join(sandbox, "lifecycle.log");
    const fakeNpmPath = join(sandbox, "fake-npm.cjs");
    writeFileSync(fakeNpmPath, [
      'require("node:fs").appendFileSync(process.env.FAKE_LIFECYCLE_LOG, `${process.argv.slice(2).join(" ")}\n`);',
      "process.exit(1);",
      "",
    ].join("\n"));
    const cleanEnvironment = withoutPublicLiveAuthority(process.env);
    const invoke = (args: readonly string[], hostileEnvironment: Record<string, string> = {}) => spawnSync(
      process.execPath,
      [resolve("scripts/music-public-e2e.mjs"), "live", ...args],
      {
        cwd: sandbox,
        encoding: "utf8",
        windowsHide: true,
        env: {
          ...cleanEnvironment,
          npm_execpath: fakeNpmPath,
          FAKE_LIFECYCLE_LOG: lifecycleLog,
          ...hostileEnvironment,
        },
      },
    );

    const naked = invoke([]);
    const hostile = invoke(EXACT_PUBLIC_LIVE_AUTHORITY_ARGS, { MUSIC_E2E_STRAPI_TOKEN: "hostile-ambient-token" });
    for (const result of [naked, hostile]) {
      expect(result.status).toBe(3);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/^Live public Music E2E refused:/);
      expect(`${result.stdout}\n${result.stderr}`).not.toContain("hostile-ambient-token");
    }
    expect(existsSync(lifecycleLog)).toBe(false);
    expect(existsSync(join(sandbox, ".artifacts"))).toBe(false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("the documented root public E2E command is the hard-gated live orchestration path", () => {
  const rootPackage = JSON.parse(readFileSync("../package.json", "utf8")) as { scripts: Record<string, string> };
  const clientPackage = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  const testingGuide = readFileSync("../docs/testing.md", "utf8");
  const exactRunbookCommand = `npm run music:test:public-e2e -- ${EXACT_PUBLIC_LIVE_AUTHORITY_ARGS.join(" ")}`;
  expect(rootPackage.scripts["music:fixture:authority:attest"])
    .toBe("tsx tunes/scripts/music-fixture-authority-attest.ts");
  expect(rootPackage.scripts["music:test:public-e2e"]).toBe("npm --prefix explorers-earth run music:test:public-e2e --");
  expect(clientPackage.scripts["music:test:public-e2e"]).toBe("node scripts/music-public-e2e.mjs live");
  expect(clientPackage.scripts["music:test:public-fast"]).toContain("music-public-e2e.mjs fast");
  expect(clientPackage.scripts["music:test:public-pr"]).toContain("music-public-e2e.mjs pr");
  expect(clientPackage.scripts["music:fixture:public:verify"]).toContain("music-public-e2e.mjs verify");
  expect(testingGuide).toContain(exactRunbookCommand);
  expect(testingGuide).not.toMatch(/\$env:MUSIC_E2E_/);
  expect(testingGuide).not.toContain("<account-scoped local fixture token>");

  const sandbox = mkdtempSync(join(tmpdir(), "music-public-package-command-"));
  try {
    const preloader = join(sandbox, "capture-runner.cjs");
    const capturePath = join(sandbox, "runner.json");
    writeFileSync(preloader, [
      'const { basename } = require("node:path");',
      'if (basename(String(process.argv[1])) === "music-public-e2e.mjs") {',
      '  require("node:fs").writeFileSync(process.env.FAKE_RUNNER_CAPTURE, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));',
      '  process.exit(0);',
      '}',
      '',
    ].join("\n"));
    const npmExecPath = process.env.npm_execpath
      ?? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    expect(existsSync(npmExecPath)).toBe(true);
    const result = spawnSync(process.execPath, [
      npmExecPath, "run", "--silent", "music:test:public-e2e", "--", ...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS,
    ], {
      cwd: resolve(".."),
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      env: {
        ...withoutPublicLiveAuthority(process.env),
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${preloader}`.trim(),
        FAKE_RUNNER_CAPTURE: capturePath,
      },
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(JSON.parse(readFileSync(capturePath, "utf8"))).toEqual({
      argv: ["live", ...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS],
      cwd: resolve(),
    });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  const runner = readFileSync("scripts/music-public-e2e.mjs", "utf8");
  expect(runner).toContain("process.env.npm_execpath");
  expect(runner).not.toContain('process.platform === "win32" ? "npm.cmd"');
  expect(runner).toContain("inspectQualificationDockerCleanup");
  expect(runner).toContain("assessQualificationCleanup");
  expect(runner).toContain("buildQualificationOutcomeRecords");
  expect(runner).toContain("finalizeQualificationRunArtifacts");
  expect(runner.indexOf("captureQualificationFixtureAuthority({"))
    .toBeLessThan(runner.indexOf("fixtureLifecycleAttempted = true"));
  expect(runner.indexOf("captureQualificationFixtureAuthority({"))
    .toBeLessThan(runner.indexOf('runLifecycleCommand("fixture-bootstrap")'));
  expect(runner).toMatch(/artifactPaths:\s*\[[^\]]*restoreEvidencePath[^\]]*authStatePath[^\]]*profileStorageStatePath[^\]]*\]/s);
  expect(runner).toContain("journeyOutcomeCleanupRequired = journeyExecutionOutcome.outcomeLedgerStatus === \"persist-failed\"");
  expect(runner).toContain("[journeyOutcomeLedgerPath, `${journeyOutcomeLedgerPath}.private-tmp`]");
  expect(runner.indexOf("const journeyExecutionOutcome = runPlaywrightJourneyExecution({"))
    .toBeLessThan(runner.indexOf("journeyOutcomeCleanupRequired = journeyExecutionOutcome.outcomeLedgerStatus"));
  expect(runner).toContain("writeReport: async () => undefined");
  expect(runner).not.toContain("function writeLiveReport");
  const livePreflight = readFileSync("scripts/music-public-live-preflight.mjs", "utf8");
  expect(livePreflight).toContain('"--reporter=json"');
  expect(livePreflight).toMatch(/"--output",\s*exactOutputDirectory/);
  expect(livePreflight).toContain("io.removeDirectory(exactOutputDirectory)");
  expect(runner).toMatch(/const executionOutcome = runPlaywrightJourneyExecution\(\{[\s\S]+requireJourneyLedger: false,[\s\S]+finalizeCurrentQualification\(\{[\s\S]+stage: "execution-finished"/);
  expect(runner).toMatch(/const finalized = await qualificationCoordinator\.runFinalization[\s\S]+return finalized\.exitCode/);
  expect(runner).toContain("process.exit(await runLiveQualification())");
  const stateService = readFileSync("../tunes/scripts/music-e2e-state-service.mjs", "utf8");
  const stateCapture = readFileSync("../tunes/scripts/music-e2e-state-capture.mjs", "utf8");
  const stateRestore = readFileSync("../tunes/scripts/music-e2e-state-restore.mjs", "utf8");
  expect(runner).toContain("music-e2e-state-service.mjs");
  expect(stateService).toContain('"pg_dump"');
  expect(stateRestore).toContain('"psql"');
  expect(stateService).toContain("MUSIC_E2E_STRAPI_TOKEN");
  expect(stateService).toContain("fixture profile restoration failed");
  expect(stateCapture).toContain("profileHash: profileState.stateHash");
  expect(stateService).not.toContain("domainHashes");
  expect(stateService).not.toContain("domainHash(");
  expect(stateService).not.toContain("MUSIC_E2E_FULL_SNAPSHOT_URL");
});

test("live browser authority is callback-minted and legacy fixture credentials cannot bypass the runner", () => {
  const runner = readFileSync("scripts/music-public-e2e.mjs", "utf8");
  const livePreflight = readFileSync("scripts/music-public-live-preflight.mjs", "utf8");
  const stateService = readFileSync("../tunes/scripts/music-e2e-state-service.mjs", "utf8");
  for (const file of ["e2e/music-fixture-fullstack.spec.ts", "e2e/music-public-contract.spec.ts"]) {
    const source = readFileSync(file, "utf8");
    expect(source).not.toContain("fixture-read-only-token");
    expect(source).toContain("musicLiveStrapiTokenFromEnvironment");
  }
  const liveFixture = readFileSync("e2e/setup/music.ts", "utf8");
  expect(liveFixture).toContain("MUSIC_E2E_STRAPI_TOKEN");
  expect(runner).not.toContain("MUSIC_E2E_OWNER_CREDENTIAL");
  expect(runner).toMatch(/runLifecycleCommand\("fixture-bootstrap"\)[\s\S]+runLifecycleCommand\("fixture-up"\)/);
  expect(runner).not.toContain('"inherit"');
  expect(stateService).not.toContain("MUSIC_E2E_OWNER_CREDENTIAL");
  expect(stateService).not.toContain("/api/music/dashboard");
  expect(stateService).not.toContain("/api/playlists");
  expect(runner).toContain("MUSIC_E2E_AUTH_STATE_PATH");
  expect(runner).toContain("google-auth/callback?access_token=");
  expect(runner).toContain("PLAYWRIGHT_EXTERNAL_BASE_URL: externalUrl");
  expect(runner).toContain("E2E_PROFILE_LIVE_WRITES: \"1\"");
  expect(runner).toContain("E2E_PROFILE_STORAGE_STATE: profileStorageStatePath");
  expect(runner).toContain("E2E_PROFILE_USERNAME: username");
  expect(livePreflight).toContain('"--list"');
  expect(runner).toContain("Live public Music E2E preflight refused");
  expect(runner).toContain('fetch(`${stateServiceUrl}/snapshot`');
  expect(runner).toMatch(/import \{[\s\S]*createMusicQualificationFailureCoordinator,[\s\S]*runMusicFixtureOrchestration,[\s\S]*\} from "\.\/music-public-e2e-runner\.mjs"/);
  expect(runner).toContain("runLivePreflight({");
  expect(runner).not.toContain('path.resolve("node_modules/tsx/dist/cli.mjs")');
  expect(runner).toContain("const liveOutcome = await runMusicFixtureOrchestration({");
  expect(runner.indexOf('fetch(`${stateServiceUrl}/snapshot`')).toBeLessThan(runner.indexOf("runLivePreflight({"));
  expect(runner.indexOf("runLivePreflight({")).toBeLessThan(runner.indexOf("google-auth/callback?access_token="));
  expect(runner.indexOf("google-auth/callback?access_token="))
    .toBeLessThan(runner.indexOf("writeFileSync(authStatePath"));
  expect(runner.indexOf("writeFileSync(authStatePath"))
    .toBeLessThan(runner.indexOf("runPlaywrightJourneyExecution({"));
  expect(runner).toContain('authorization !== `Bearer ${strapiToken}`');
  expect(runner).toMatch(/\^Bearer \[A-Za-z0-9_-\]\+\\\.\[A-Za-z0-9_-\]\+\\\.\[A-Za-z0-9_-\]\+\$/);
  expect(runner).toContain("browserApiPrefix");
  expect(runner).not.toContain("http://localhost:55173/api/");
  expect(runner).toContain("callback bootstrap failed; details redacted");
  expect(runner).not.toContain("callbackBootstrapError.message");
  expect(runner).toContain("result.beforeHash === expected && result.afterHash === expected");
  expect(runner).toContain('runLifecycleCommand("fixture-down")');
});

test("runner orchestration contains setup, parse, and report faults with restored abort hashes", async () => {
  type RunnerReport = { result: string; cleanup: string; restoreHashes: Array<{ beforeHash: string; afterHash: string }> };

  const hash = "a".repeat(64);
  for (const fault of ["setup", "parse", "report"] as const) {
    const calls: string[] = [];
    const stdout: string[] = [];
    const stderr: string[] = [];
    const reports: RunnerReport[] = [];
    const outcome = await runMusicFixtureOrchestration({
      snapshotExists: true,
      baseReport: { version: MUSIC_PUBLIC_FIXTURE_VERSION, runId: `fault-${fault}`, lane: "live" },
      artifacts: {
        directory: "fixture-artifacts",
        authPath: "owner-auth.json",
        storagePath: "profile-storage-state.json",
        mkdir: () => { calls.push("mkdir"); },
        write: (file) => {
          calls.push(`write:${file}`);
          if (fault === "setup") throw new Error("Bearer secret-token");
        },
        chmod: (file) => { calls.push(`chmod:${file}`); },
      },
      restoreEvidence: {
        path: "restore-evidence.jsonl",
        exists: () => true,
        read: () => {
          calls.push("parse-restore-evidence");
          if (fault === "parse") throw new Error("Bearer secret-token");
          return `${JSON.stringify({ cleanup: "restored", beforeHash: hash, afterHash: hash })}\n`;
        },
      },
      execute: async () => { calls.push("execute"); return 0; },
      restore: async () => {
        calls.push("initial-restore");
        return { ok: true, cleanup: "restored", beforeHash: hash, afterHash: hash };
      },
      teardown: {
        artifactPaths: ["owner-auth.json", "profile-storage-state.json"],
        exists: (file) => { calls.push(`exists:${file}`); return true; },
        unlink: (file) => { calls.push(`unlink:${file}`); },
        stopStateService: () => { calls.push("state-service-stop"); },
        down: () => { calls.push("npm run --silent music-cli -- down"); return 0; },
      },
      writeReport: async (report) => {
        calls.push("write-final-report");
        if (fault === "report") throw new Error("Bearer secret-token");
        reports.push(structuredClone(report));
      },
      writeStdout: (text) => { stdout.push(text); },
      writeStderr: (text) => { stderr.push(text); },
    });

    expect(calls.filter((call) => call === "initial-restore"), fault).toHaveLength(1);
    expect(calls, fault).toEqual(expect.arrayContaining([
      "exists:owner-auth.json",
      "unlink:owner-auth.json",
      "exists:profile-storage-state.json",
      "unlink:profile-storage-state.json",
      "state-service-stop",
      "npm run --silent music-cli -- down",
      "write-final-report",
    ]));
    expect(outcome.exitCode, fault).not.toBe(0);
    expect(outcome.report.result, fault).toBe("failed");
    expect(outcome.report.cleanup, fault).toBe(fault === "setup" ? "restored" : "evidence-missing");
    expect(outcome.report.restoreHashes, fault).toEqual(expect.arrayContaining([{ beforeHash: hash, afterHash: hash }]));
    expect(JSON.parse(stdout.join("")), fault).toEqual(outcome.report);
    expect(`${stdout.join("")}\n${stderr.join("")}`, fault).not.toMatch(/bearer|token/i);
    if (fault === "setup") {
      expect(reports, "restored abort evidence must be written with direct verified hashes").toEqual([
        expect.objectContaining({ cleanup: "restored", restoreHashes: [{ beforeHash: hash, afterHash: hash }] }),
      ]);
    }
  }
});

for (const teardownFault of [
  "raw-report-unlink",
  "owner-auth-unlink",
  "profile-storage-unlink",
  "private-output-remove",
  "state-service-stop",
  "exact-down",
] as const) {
  test(`runner orchestration preserves teardown after ${teardownFault} failure`, async () => {
    type RunnerReport = { result: string; cleanup: string; restoreHashes: Array<{ beforeHash: string; afterHash: string }> };
    const initialHash = "c".repeat(64);
    const journeyHash = "d".repeat(64);
    const calls: string[] = [];
    const stdout: string[] = [];
    const stderr: string[] = [];
    const reports: RunnerReport[] = [];
    const outcome = await runMusicFixtureOrchestration({
      snapshotExists: true,
      baseReport: { version: MUSIC_PUBLIC_FIXTURE_VERSION, runId: `teardown-${teardownFault}`, lane: "live" },
      artifacts: {
        directory: "fixture-artifacts",
        authPath: "owner-auth.json",
        storagePath: "profile-storage-state.json",
        mkdir: (directory) => { calls.push(`mkdir:${directory}`); },
        write: (file) => { calls.push(`write:${file}`); },
        chmod: (file) => { calls.push(`chmod:${file}`); },
      },
      restoreEvidence: {
        path: "restore-evidence.jsonl",
        exists: (file) => { calls.push(`restore-evidence-exists:${file}`); return true; },
        read: (file) => {
          calls.push(`parse-restore-evidence:${file}`);
          return `${JSON.stringify({ cleanup: "restored", beforeHash: journeyHash, afterHash: journeyHash })}\n`;
        },
      },
      execute: async () => { calls.push("execute"); return 0; },
      restore: async () => {
        calls.push("initial-restore");
        return { ok: true, cleanup: "restored", beforeHash: initialHash, afterHash: initialHash };
      },
      teardown: {
        artifactPaths: ["playwright-journey-results.json", "owner-auth.json", "profile-storage-state.json"],
        artifactDirectories: ["private-playwright-output"],
        exists: (file) => { calls.push(`exists:${file}`); return true; },
        unlink: (file) => {
          calls.push(`unlink:${file}`);
          if ((teardownFault === "raw-report-unlink" && file === "playwright-journey-results.json")
              || (teardownFault === "owner-auth-unlink" && file === "owner-auth.json")
              || (teardownFault === "profile-storage-unlink" && file === "profile-storage-state.json")) {
            throw new Error("Bearer teardown-token");
          }
        },
        removeDirectory: (directory) => {
          calls.push(`remove-directory:${directory}`);
          if (teardownFault === "private-output-remove") throw new Error("Bearer teardown-token");
        },
        stopStateService: () => {
          calls.push("state-service-stop");
          if (teardownFault === "state-service-stop") throw new Error("Bearer teardown-token");
        },
        down: () => {
          calls.push("npm run --silent music-cli -- down");
          if (teardownFault === "exact-down") throw new Error("Bearer teardown-token");
          return 0;
        },
      },
      writeReport: async (report: RunnerReport) => { calls.push("write-final-report"); reports.push(structuredClone(report)); },
      writeStdout: (text) => { stdout.push(text); },
      writeStderr: (text) => { stderr.push(text); },
    });

    expect(calls, teardownFault).toEqual([
      "mkdir:fixture-artifacts",
      "write:profile-storage-state.json",
      "chmod:profile-storage-state.json",
      "execute",
      "initial-restore",
      "restore-evidence-exists:restore-evidence.jsonl",
      "parse-restore-evidence:restore-evidence.jsonl",
      "exists:playwright-journey-results.json",
      "unlink:playwright-journey-results.json",
      "exists:owner-auth.json",
      "unlink:owner-auth.json",
      "exists:profile-storage-state.json",
      "unlink:profile-storage-state.json",
      "exists:private-playwright-output",
      "remove-directory:private-playwright-output",
      "state-service-stop",
      "npm run --silent music-cli -- down",
      "write-final-report",
    ]);
    expect(calls.filter((call) => call === "initial-restore"), teardownFault).toHaveLength(1);
    expect(outcome.teardownStatus, teardownFault).toBe(1);
    expect(outcome.exitCode, teardownFault).toBe(5);
    expect(outcome.report, teardownFault).toMatchObject({
      result: "failed",
      cleanup: "teardown-failed",
      restoreHashes: [
        { beforeHash: initialHash, afterHash: initialHash },
        { beforeHash: journeyHash, afterHash: journeyHash },
      ],
    });
    expect(outcome.report.restoreHashes.every(({ beforeHash, afterHash }) => beforeHash.length > 0 && beforeHash === afterHash), teardownFault).toBe(true);
    expect(reports, teardownFault).toEqual([outcome.report]);
    expect(JSON.parse(stdout.join("")), teardownFault).toEqual(outcome.report);
    expect(`${stdout.join("")}\n${stderr.join("")}`, teardownFault).not.toMatch(/bearer|token/i);
  });
}

test("teardown continues after an artifact existence check fails", async () => {
  const calls: string[] = [];
  const status = await stopMusicFixture({
    artifactPaths: ["owner-auth", "profile-state"],
    exists: (file) => {
      calls.push(`exists:${file}`);
      if (file === "owner-auth") throw new Error("denied");
      return true;
    },
    unlink: (file) => { calls.push(`unlink:${file}`); },
    stopStateService: () => { calls.push("state-stop"); },
    down: () => { calls.push("npm run --silent music-cli -- down"); return 0; },
  });
  expect(calls).toEqual([
    "exists:owner-auth",
    "exists:profile-state",
    "unlink:profile-state",
    "state-stop",
    "npm run --silent music-cli -- down",
  ]);
  expect(status).toBe(1);
});

type InjectedStateServiceChild = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  signalCode: string | null;
  kill: (signal: string) => boolean;
};

function injectedStateServiceChild(kill: (signal: string) => boolean): InjectedStateServiceChild {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null as string | null,
    kill,
  });
}

test("state-service stop rejects signal acceptance without an attested terminal event", async () => {
  // Production break caught: child.kill(true) proves only signal acceptance; the
  // child can remain alive while cleanup is reported as verified.
  const cleanup = await import("../scripts/music-fixture-cleanup.mjs") as typeof import("../scripts/music-fixture-cleanup.mjs") & {
    createMusicFixtureStateServiceGuard: (input: Record<string, unknown>) => {
      stop: () => Promise<unknown>;
      snapshot: () => Record<string, unknown>;
    };
  };
  const signals: string[] = [];
  const child = injectedStateServiceChild((signal) => { signals.push(signal); return true; });
  const guard = cleanup.createMusicFixtureStateServiceGuard({
    child,
    stopTimeoutMs: 25,
    onFailure: async () => undefined,
  });

  await expect(guard.stop()).rejects.toThrow("state service stop was not attested before timeout");
  expect(signals).toEqual(["SIGKILL"]);
  expect(guard.snapshot()).toMatchObject({
    lifecycle: {
      schemaVersion: "explorers-public-state-service-lifecycle/v1",
      error: { status: "unavailable" },
      exit: { status: "unavailable" },
      close: { status: "unavailable" },
    },
  });
});

test("state-service stop awaits a delayed expected SIGKILL exit and close", async () => {
  const cleanup = await import("../scripts/music-fixture-cleanup.mjs") as typeof import("../scripts/music-fixture-cleanup.mjs") & {
    createMusicFixtureStateServiceGuard: (input: Record<string, unknown>) => {
      stop: () => Promise<unknown>;
      snapshot: () => Record<string, unknown>;
    };
  };
  const child: InjectedStateServiceChild = injectedStateServiceChild((signal) => {
    queueMicrotask(() => {
      child.signalCode = signal;
      child.emit("exit", null, signal);
      child.emit("close", null, signal);
    });
    return true;
  });
  const guard = cleanup.createMusicFixtureStateServiceGuard({
    child,
    stopTimeoutMs: 100,
    onFailure: async () => { throw new Error("intentional stop must not finalize failure"); },
  });

  await expect(guard.stop()).resolves.toMatchObject({ status: "stopped" });
  expect(guard.snapshot()).toMatchObject({
    lifecycle: {
      error: { status: "unavailable" },
      exit: { status: "observed", code: null, signal: "SIGKILL" },
      close: { status: "observed", code: null, signal: "SIGKILL" },
    },
  });
});

test("unexpected normal state-service exit is attested and routed through failure once", async () => {
  const cleanup = await import("../scripts/music-fixture-cleanup.mjs") as typeof import("../scripts/music-fixture-cleanup.mjs") & {
    createMusicFixtureStateServiceGuard: (input: Record<string, unknown>) => {
      failure: Promise<unknown>;
      stop: () => Promise<unknown>;
      snapshot: () => Record<string, unknown>;
    };
  };
  let failures = 0;
  const child = injectedStateServiceChild(() => { throw new Error("already exited child must not be signaled"); });
  const guard = cleanup.createMusicFixtureStateServiceGuard({
    child,
    stopTimeoutMs: 100,
    onFailure: async () => { failures += 1; },
  });
  child.exitCode = 0;
  child.emit("exit", 0, null);
  child.emit("close", 0, null);

  await guard.failure;
  await expect(guard.stop()).resolves.toMatchObject({ status: "already-stopped" });
  expect(failures).toBe(1);
  expect(guard.snapshot()).toMatchObject({
    lifecycle: {
      exit: { status: "observed", code: 0, signal: null },
      close: { status: "observed", code: 0, signal: null },
    },
  });
});

test("state-service error and close races invoke one failure finalizer without an unhandled error", async () => {
  const cleanup = await import("../scripts/music-fixture-cleanup.mjs") as typeof import("../scripts/music-fixture-cleanup.mjs") & {
    createMusicFixtureStateServiceGuard: (input: Record<string, unknown>) => {
      failure: Promise<unknown>;
      stop: () => Promise<unknown>;
      snapshot: () => Record<string, unknown>;
    };
  };
  const calls: string[] = [];
  const child = injectedStateServiceChild(() => false);
  const guard = cleanup.createMusicFixtureStateServiceGuard({
    child,
    stopTimeoutMs: 100,
    onFailure: async () => {
      calls.push("private-artifacts", "state-stop", "exact-down", "docker-inspection", "artifact-finalization");
    },
  });

  child.emit("error", new Error("Bearer race-private-token"));
  child.emit("close", 1, null);
  child.emit("exit", 1, null);
  await guard.failure;

  expect(calls).toEqual(["private-artifacts", "state-stop", "exact-down", "docker-inspection", "artifact-finalization"]);
  expect(guard.snapshot()).toMatchObject({
    lifecycle: {
      error: { status: "observed" },
      exit: { status: "observed", code: 1, signal: null },
      close: { status: "observed", code: 1, signal: null },
    },
  });
  await expect(guard.stop()).rejects.toThrow(/state service .*failure|state service exited/i);
  expect(JSON.stringify(guard.snapshot())).not.toContain("race-private-token");
});

test("fresh-process state-service spawn error is handled and finalizes cleanup once", () => {
  const helperUrl = pathToFileURL(resolve("scripts/music-fixture-cleanup.mjs")).href;
  const script = [
    'import { spawn } from "node:child_process";',
    `import { createMusicFixtureStateServiceGuard } from ${JSON.stringify(helperUrl)};`,
    'const calls = [];',
    'const child = spawn("missing-state-service-private-command-92841", [], { stdio: ["ignore", "pipe", "pipe"] });',
    'let guard;',
    'guard = createMusicFixtureStateServiceGuard({ child, stopTimeoutMs: 1000, onFailure: async () => {',
    '  calls.push("private-artifacts", "state-stop");',
    '  try { await guard.stop(); } catch { calls.push("state-stop-unverified"); }',
    '  calls.push("exact-down", "docker-inspection", "artifact-finalization");',
    '} });',
    'await guard.failure;',
    'process.stdout.write(JSON.stringify({ calls, snapshot: guard.snapshot() }));',
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    timeout: 5_000,
  });

  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stderr).toBe("");
  const outcome = JSON.parse(result.stdout);
  expect(outcome.calls).toEqual([
    "private-artifacts",
    "state-stop",
    "state-stop-unverified",
    "exact-down",
    "docker-inspection",
    "artifact-finalization",
  ]);
  expect(outcome.snapshot.lifecycle).toMatchObject({
    error: { status: "observed" },
    close: { status: "observed" },
  });
  expect(result.stdout).not.toContain("missing-state-service-private-command-92841");
});

type QualificationFailureCoordinator = {
  signal: AbortSignal;
  markSnapshotReady: () => void;
  recordFailure: (failure: {
    stage: string;
    exitCode: number;
    cleanupWhenTeardownSucceeds?: string;
    executionOutcome?: Record<string, unknown>;
  }) => void;
  runRestoration: <T>(operation: () => Promise<T> | T) => Promise<T>;
  runFinalization: <T>(operation: () => Promise<T> | T) => Promise<T>;
  snapshot: () => {
    phase: string;
    snapshotReady: boolean;
    failure: { stage: string; exitCode: number } | null;
    ledger: string[];
  };
};

type QualificationCoordinatorModule = {
  createMusicQualificationFailureCoordinator: (options?: {
    onPhase?: (phase: string) => void;
  }) => QualificationFailureCoordinator;
  runMusicFixtureOrchestration: (input: Record<string, unknown>) => Promise<{
    exitCode: number;
    report: Record<string, unknown>;
    restoration: Record<string, unknown>;
    teardownStatus: number;
  }>;
};

type QualificationFailureTiming =
  | "before-snapshot"
  | "immediately-after-snapshot"
  | "simultaneous-with-restoration"
  | "during-execution"
  | "during-restoration"
  | "after-restoration-before-teardown"
  | "duplicate-terminal-events";

async function runInjectedQualificationFailureTiming(timing: QualificationFailureTiming) {
  const runner = await import("../scripts/music-public-e2e-runner.mjs") as unknown as QualificationCoordinatorModule;
  const calls: string[] = [];
  const reports: Array<Record<string, unknown>> = [];
  const equalHash = "7".repeat(64);
  const hasSnapshot = timing !== "before-snapshot";
  const coordinatorHolder: QualificationFailureCoordinator[] = [];
  const recordStateFailure = (stage = "state-service-exit") => {
    calls.push(`failure:${stage}`);
    coordinatorHolder[0].recordFailure({ stage, exitCode: 4 });
  };
  const coordinator = runner.createMusicQualificationFailureCoordinator({
    onPhase: (phase) => {
      if (timing === "simultaneous-with-restoration" && phase === "restoration") {
        recordStateFailure();
      }
      if (timing === "after-restoration-before-teardown" && phase === "restoration-complete") {
        recordStateFailure();
      }
    },
  });
  coordinatorHolder.push(coordinator);
  if (hasSnapshot) coordinator.markSnapshotReady();
  if (timing === "before-snapshot" || timing === "immediately-after-snapshot") recordStateFailure();

  const outcome = await runner.runMusicFixtureOrchestration({
    snapshotExists: hasSnapshot,
    coordinator,
    baseReport: { version: MUSIC_PUBLIC_FIXTURE_VERSION, runId: `phase-${timing}`, lane: "live" },
    artifacts: {
      directory: "guarded/phase-contract",
      authPath: "owner-auth.json",
      storagePath: "profile-storage-state.json",
      mkdir: () => undefined,
      write: () => undefined,
      chmod: () => undefined,
    },
    restoreEvidence: {
      path: "restore-evidence.jsonl",
      exists: () => false,
      read: () => "",
    },
    execute: async () => {
      calls.push("execution");
      if (timing === "during-execution") recordStateFailure();
      if (timing === "duplicate-terminal-events") {
        recordStateFailure("state-service-error");
        recordStateFailure("state-service-exit");
        recordStateFailure("state-service-close");
      }
      return { status: 0 };
    },
    restore: async () => {
      calls.push("restore");
      if (timing === "during-restoration") recordStateFailure();
      return timing === "during-restoration"
        ? { ok: false, cleanup: "restore-failed", beforeHash: equalHash, afterHash: "8".repeat(64) }
        : { ok: true, cleanup: "restored", beforeHash: equalHash, afterHash: equalHash };
    },
    teardown: {
      artifactPaths: ["restore-evidence.jsonl", "owner-auth.json", "profile-storage-state.json", "playwright-journey-results.json"],
      artifactDirectories: ["private-playwright-output"],
      exists: (artifact: string) => { calls.push(`exists:${artifact}`); return true; },
      unlink: (artifact: string) => { calls.push(`unlink:${artifact}`); },
      removeDirectory: (directory: string) => { calls.push(`remove:${directory}`); },
      stopStateService: async () => { calls.push("state-stop"); },
      down: async () => {
        calls.push("exact-down");
        return timing === "duplicate-terminal-events" ? 1 : 0;
      },
    },
    writeReport: async () => undefined,
    writeStdout: (text: string) => { reports.push(JSON.parse(text)); },
    writeStderr: () => undefined,
  });
  const finalized = await coordinator.runFinalization(async () => {
    calls.push("docker-inspection", "artifact-finalization");
    return { exitCode: outcome.exitCode };
  });
  calls.push("exit");
  return { calls, coordinator: coordinator.snapshot(), finalized, outcome, reports };
}

for (const phaseCase of [
  {
    timing: "before-snapshot",
    cleanup: "not-required-safe",
    exitCode: 4,
    restoreCalls: 0,
    ledger: [
      "failure:pre-snapshot", "orchestration", "execution-skipped", "teardown", "teardown-complete",
      "ready-to-finalize", "finalization", "settled",
    ],
  },
  {
    timing: "immediately-after-snapshot",
    cleanup: "restored",
    exitCode: 4,
    restoreCalls: 1,
    ledger: [
      "snapshot-ready", "failure:snapshot-ready", "orchestration", "execution-skipped", "restoration",
      "restoration-complete", "teardown", "teardown-complete", "ready-to-finalize", "finalization", "settled",
    ],
  },
  {
    timing: "during-execution",
    cleanup: "restored",
    exitCode: 4,
    restoreCalls: 1,
    ledger: [
      "snapshot-ready", "orchestration", "execution", "failure:execution", "execution-complete", "restoration",
      "restoration-complete", "teardown", "teardown-complete", "ready-to-finalize", "finalization", "settled",
    ],
  },
  {
    timing: "simultaneous-with-restoration",
    cleanup: "restored",
    exitCode: 4,
    restoreCalls: 1,
    ledger: [
      "snapshot-ready", "orchestration", "execution", "execution-complete", "restoration", "failure:restoration",
      "restoration-complete", "teardown", "teardown-complete", "ready-to-finalize", "finalization", "settled",
    ],
  },
  {
    timing: "during-restoration",
    cleanup: "restore-failed",
    exitCode: 5,
    restoreCalls: 1,
    ledger: [
      "snapshot-ready", "orchestration", "execution", "execution-complete", "restoration", "failure:restoration",
      "restoration-complete", "teardown", "teardown-complete", "ready-to-finalize", "finalization", "settled",
    ],
  },
  {
    timing: "after-restoration-before-teardown",
    cleanup: "restored",
    exitCode: 4,
    restoreCalls: 1,
    ledger: [
      "snapshot-ready", "orchestration", "execution", "execution-complete", "restoration", "restoration-complete",
      "failure:restoration-complete", "teardown", "teardown-complete", "ready-to-finalize", "finalization", "settled",
    ],
  },
  {
    timing: "duplicate-terminal-events",
    cleanup: "teardown-failed",
    exitCode: 5,
    restoreCalls: 1,
    ledger: [
      "snapshot-ready", "orchestration", "execution", "failure:execution", "execution-complete", "restoration",
      "restoration-complete", "teardown", "teardown-complete", "ready-to-finalize", "finalization", "settled",
    ],
  },
] as const) {
  test(`phase-aware failure coordinator restores and finalizes once for ${phaseCase.timing}`, async () => {
    // Production break caught: a state-service callback could independently exit
    // over the active orchestration, skipping or racing the required restore.
    const result = await runInjectedQualificationFailureTiming(phaseCase.timing);

    expect(result.calls.filter((call) => call === "restore")).toHaveLength(phaseCase.restoreCalls);
    expect(result.calls.filter((call) => call === "state-stop")).toHaveLength(1);
    expect(result.calls.filter((call) => call === "exact-down")).toHaveLength(1);
    expect(result.calls.filter((call) => call === "artifact-finalization")).toHaveLength(1);
    expect(result.calls.filter((call) => call === "exit")).toHaveLength(1);
    expect(result.reports).toHaveLength(1);
    expect(result.outcome.report.cleanup).toBe(phaseCase.cleanup);
    expect(result.outcome.exitCode).toBe(phaseCase.exitCode);
    expect(result.finalized).toEqual({ exitCode: phaseCase.exitCode });
    expect(result.coordinator.ledger).toEqual(phaseCase.ledger);
    expect(result.coordinator.failure).toMatchObject({ exitCode: 4 });
    if (phaseCase.restoreCalls === 0) {
      expect(result.calls.indexOf("restore")).toBe(-1);
    } else {
      expect(result.calls.indexOf("restore")).toBeGreaterThanOrEqual(0);
      expect(result.calls.indexOf("restore")).toBeLessThan(result.calls.indexOf("state-stop"));
    }
    expect(result.calls.indexOf("state-stop")).toBeLessThan(result.calls.indexOf("exact-down"));
    expect(result.calls.indexOf("exact-down")).toBeLessThan(result.calls.indexOf("docker-inspection"));
    expect(result.calls.indexOf("docker-inspection")).toBeLessThan(result.calls.indexOf("artifact-finalization"));
    expect(result.calls.indexOf("artifact-finalization")).toBeLessThan(result.calls.indexOf("exit"));
  });
}

test("fresh process preserves post-snapshot restoration ownership across duplicate terminal failures", () => {
  const runnerUrl = pathToFileURL(resolve("scripts/music-public-e2e-runner.mjs")).href;
  const script = [
    `import { createMusicQualificationFailureCoordinator, runMusicFixtureOrchestration } from ${JSON.stringify(runnerUrl)};`,
    'const calls = []; const reports = []; const hash = "a".repeat(64);',
    'const coordinator = createMusicQualificationFailureCoordinator();',
    'coordinator.markSnapshotReady();',
    'const outcome = await runMusicFixtureOrchestration({',
    '  snapshotExists: true, coordinator, baseReport: { version: "v1", runId: "fresh-phase", lane: "live" },',
    '  artifacts: { directory: "guarded", authPath: "owner-auth.json", storagePath: "profile-storage.json", mkdir() {}, write() {}, chmod() {} },',
    '  restoreEvidence: { path: "restore.jsonl", exists() { return false; }, read() { return ""; } },',
    '  execute: async () => { coordinator.recordFailure({ stage: "state-service-error", exitCode: 4 }); coordinator.recordFailure({ stage: "state-service-exit", exitCode: 4 }); coordinator.recordFailure({ stage: "state-service-close", exitCode: 4 }); return { status: 0 }; },',
    '  restore: async () => { calls.push("restore"); return { ok: true, cleanup: "restored", beforeHash: hash, afterHash: hash }; },',
    '  teardown: { artifactPaths: [], artifactDirectories: [], exists() { return false; }, unlink() {}, removeDirectory() {}, async stopStateService() { calls.push("state-stop"); }, async down() { calls.push("exact-down"); return 0; } },',
    '  async writeReport() {}, writeStdout(text) { reports.push(JSON.parse(text)); }, writeStderr() {},',
    '});',
    'await coordinator.runFinalization(async () => { calls.push("artifact-finalization"); return outcome.exitCode; });',
    'calls.push("exit");',
    'process.stdout.write(JSON.stringify({ calls, reports, outcome, coordinator: coordinator.snapshot() }));',
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    timeout: 5_000,
  });

  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stderr).toBe("");
  const observed = JSON.parse(result.stdout);
  expect(observed.calls).toEqual(["restore", "state-stop", "exact-down", "artifact-finalization", "exit"]);
  expect(observed.reports).toHaveLength(1);
  expect(observed.outcome).toMatchObject({ exitCode: 4, report: { cleanup: "restored", result: "failed" } });
  expect(observed.coordinator.ledger.filter((entry: string) => entry.startsWith("failure:"))).toEqual(["failure:execution"]);
  expect(result.stdout).not.toMatch(/Unhandled 'error' event|ERR_UNHANDLED_ERROR/);
});

test("fresh live runner lets verified restoration finish before a state-service failure finalizes", () => {
  // Production break caught: the guard callback called process.exit from a
  // microtask while restoreInitialSnapshot was awaiting its response.
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-phase-owner-"));
  try {
    const preloader = join(sandbox, "phase-owner-preload.cjs");
    const phaseLog = join(sandbox, "phase-owner.log");
    writeFileSync(preloader, [
      'const childProcess = require("node:child_process");',
      'const { EventEmitter } = require("node:events");',
      'const { appendFileSync } = require("node:fs");',
      'const { PassThrough } = require("node:stream");',
      'const net = require("node:net");',
      'const { syncBuiltinESMExports } = require("node:module");',
      'const append = (entry) => appendFileSync(process.env.FAKE_PHASE_LOG, `${entry}\n`);',
      'const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null, kill(signal) { this.signalCode = signal; queueMicrotask(() => { this.stdout.end(); this.stderr.end(); this.emit("exit", null, signal); this.emit("close", null, signal); }); return true; } });',
      'childProcess.spawn = () => child;',
      'childProcess.spawnSync = (file, args = []) => {',
      '  const joined = args.join(" ");',
      '  if (joined.includes("music:fixture:authority:attest")) { append("authority"); return { status: 0, stdout: `${JSON.stringify({ schemaVersion: "music-fixture-authority-attestation/v1", state: "tombstone", safeToBootstrap: true, usableRecords: 0 })}\n`, stderr: "", signal: null, error: undefined }; }',
      '  const action = ["bootstrap", "up", "down"].find((candidate) => joined.includes(`music-cli -- ${candidate}`));',
      '  if (action) { append(action); return { status: 0, stdout: "", stderr: "", signal: null, error: undefined }; }',
      '  if (String(file) === "git") return { status: 0, stdout: `${"a".repeat(40)}\n`, stderr: "", signal: null, error: undefined };',
      '  if (String(file).toLowerCase().includes("docker")) return { status: 0, stdout: "", stderr: "", signal: null, error: undefined };',
      '  return { status: 1, stdout: "", stderr: "preflight stopped", signal: null, error: undefined };',
      '};',
      'net.createConnection = (_options, connected) => { const socket = new EventEmitter(); socket.setTimeout = () => socket; socket.destroy = () => undefined; queueMicrotask(connected); return socket; };',
      'syncBuiltinESMExports();',
      'let terminalEmitted = false;',
      'global.fetch = async (input) => {',
      '  const url = String(input);',
      '  if (url.endsWith("/snapshot")) {',
      '    const namespace = process.env.MUSIC_E2E_ACCOUNT_USERNAME.replace(/-owner$/, "");',
      '    const snapshot = { version: "music-live-account-snapshot/v1", snapshotId: "phase-owner-snapshot", publication: { coveredByDatabaseDump: true }, guestControls: { coveredByDatabaseDump: true }, queue: { coveredByDatabaseDump: true }, playlists: { coveredByDatabaseDump: true }, requests: { coveredByDatabaseDump: true }, profile: { accountDocumentId: process.env.MUSIC_E2E_ACCOUNT_DOCUMENT_ID, publicMusic: false, profileRevision: 0, profileHash: "c".repeat(64), fieldCount: 2 }, database: { namespace, dumpHash: "b".repeat(64), identityRows: 0 } };',
      '    return { ok: true, status: 200, headers: { get() { return null; } }, async text() { append("snapshot-complete"); return JSON.stringify(snapshot); } };',
      '  }',
      '  if (url.endsWith("/restore-final")) {',
      '    append("restore-start");',
      '    if (!terminalEmitted) { terminalEmitted = true; child.exitCode = 1; child.emit("error", new Error("Bearer fresh-phase-private")); child.emit("exit", 1, null); child.stdout.end(); child.stderr.end(); child.emit("close", 1, null); }',
      '    return { ok: true, status: 200, async json() { append("restore-complete"); return { beforeHash: "b".repeat(64), afterHash: "b".repeat(64) }; } };',
      '  }',
      '  if (url.includes("/api/accounts/")) return { ok: true, status: 200, async json() { return { data: { documentId: process.env.MUSIC_E2E_ACCOUNT_DOCUMENT_ID } }; } };',
      '  if (url.endsWith("/api/users/me")) return { ok: true, status: 200, async json() { return { username: process.env.MUSIC_E2E_ACCOUNT_USERNAME, documentId: process.env.MUSIC_E2E_USER_DOCUMENT_ID, accounts: [{ documentId: process.env.MUSIC_E2E_ACCOUNT_DOCUMENT_ID }] }; } };',
      '  return { ok: true, status: 200, async json() { return {}; } };',
      '};',
      'process.exit = (code) => { append(`exit:${code}`); process.exitCode = 1; };',
      '',
    ].join("\n"));
    const runId = "post-snapshot-owner-contract";
    const environment = lifecycleFreshProcessEnvironment({
      sandbox,
      runId,
      fakeNpmPath: "phase-owner-fake-npm.mjs",
      fakeDockerHookPath: preloader,
      binDirectory: sandbox,
      scenario: "phase-owner",
      dockerMode: "clean",
      privateValue: "fresh-phase-private",
    });
    environment.NODE_OPTIONS = `--require=${preloader}`;
    environment.FAKE_PHASE_LOG = phaseLog;
    const result = spawnSync(process.execPath, [
      resolve("scripts/music-public-e2e.mjs"), "live", ...EXACT_PUBLIC_LIVE_AUTHORITY_ARGS,
    ], {
      cwd: sandbox,
      env: environment,
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
    });
    const runDirectory = onlyQualificationRunDirectory(sandbox);
    const phaseEntries = readFileSync(phaseLog, "utf8").trim().split(/\r?\n/);
    const evidence = JSON.parse(readFileSync(join(runDirectory, "evidence.json"), "utf8"));

    expect(result.status, `${result.stdout}\n${result.stderr}\n${JSON.stringify({ phaseEntries, evidence })}`).toBe(1);
    // The qualifier completes its baseline restore; outer recovery still
    // attempts the unconditional final restore after the injected service
    // failure, even though teardown can close that second response.
    expect(phaseEntries.filter((entry) => entry === "restore-start")).toHaveLength(2);
    expect(phaseEntries.filter((entry) => entry === "restore-complete")).toHaveLength(1);
    expect(phaseEntries.filter((entry) => entry === "down")).toHaveLength(1);
    expect(phaseEntries.filter((entry) => entry.startsWith("exit:"))).toEqual(["exit:5"]);
    expect(phaseEntries.indexOf("snapshot-complete")).toBeLessThan(phaseEntries.indexOf("restore-start"));
    expect(phaseEntries.lastIndexOf("restore-complete")).toBeLessThan(phaseEntries.indexOf("down"));
    expect(result.stdout.trim().split(/\r?\n/)).toHaveLength(1);
    expect(evidence).toMatchObject({ result: "failed", cleanup: "teardown-failed", exitCode: 5 });
    expect(`${result.stdout}\n${result.stderr}\n${JSON.stringify(evidence)}`).not.toContain("fresh-phase-private");
    expect(`${result.stdout}\n${result.stderr}\n${JSON.stringify(evidence)}`).not.toContain(sandbox);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("one canonical adapter refuses incomplete account state and restores every domain through namespace reset", async () => {
  const complete = {
    version: "music-live-account-snapshot/v1",
    snapshotId: "snapshot-fixture",
    publication: { coveredByDatabaseDump: true },
    guestControls: { coveredByDatabaseDump: true },
    queue: { coveredByDatabaseDump: true },
    playlists: { coveredByDatabaseDump: true },
    requests: { coveredByDatabaseDump: true },
    profile: {
      accountDocumentId: "e2e-public-music-run-account", publicMusic: true,
      profileRevision: 4, profileHash: "b".repeat(64), fieldCount: 24,
    },
    database: { namespace: "e2e-public-music-run", dumpHash: "a".repeat(64), identityRows: 1 },
  } as const;
  let current: unknown = structuredClone(complete);
  let resetValue: unknown;
  const adapter = createCanonicalMusicFixtureAdapter({
    readFullSnapshot: async () => structuredClone(current),
    resetNamespace: async (snapshot) => { resetValue = structuredClone(snapshot); current = structuredClone(snapshot); },
  });
  const snapshot = await adapter.snapshot();
  current = { ...complete, playlists: [] };
  await adapter.restore(snapshot);
  expect(resetValue).toEqual(complete);
  await expect(adapter.snapshot()).resolves.toEqual(complete);

  current = { ...complete, requests: undefined };
  await expect(adapter.snapshot()).rejects.toThrow(/requests/i);
});

test("mutating browser journeys use the automatic live-authority fixture before their test bodies", () => {
  expect(musicLiveTest).toBeDefined();
  const publicSource = readFileSync("e2e/music-public-contract.spec.ts", "utf8");
  const fullstackSource = readFileSync("e2e/music-fixture-fullstack.spec.ts", "utf8");
  expect(publicSource).toContain("const liveTest = musicLiveTest");
  expect(fullstackSource).toContain("const test = musicLiveTest");
  for (const title of [
    "live owner/guest toggle",
    "live guest reconnect",
    "live guest request",
    "live guest playback",
    "owner publication, playlist visibility",
  ]) {
    expect(publicSource).toMatch(new RegExp(`liveTest\\([^\\n]*${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
});

test("live public preparation publishes a returned non-literal slug and seeds every guest prerequisite inside canonical scope", async () => {
  const reads: string[] = [];
  const mutations: Array<{ callsite: string; method: string; path: string; data?: unknown; idempotencyKey?: string }> = [];
  let profileUpdates = 0;
  let playlistSong = 80;
  let dashboardReads = 0;
  const result = await prepareLivePublicMusicJourney({
    seedId: "a1b2c3d4",
    privatePublicationIdempotencyKey: "tunes-share-v1-1777000000000-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    publicationIdempotencyKey: "tunes-share-v1-1777000000000-11111111-2222-4333-8444-555555555555",
    controls: {
      allowSongRequests: true,
      allowGuestPlayOnDevice: true,
      allowPlaylistSharing: true,
      allowRecentlyPlayedVisibility: true,
      allowQueueVisibility: true,
    },
    read: async (path) => {
      reads.push(path);
      if (path === "/api/music/dashboard") {
        dashboardReads += 1;
        return {
          status: 200,
          body: {
            queueRevision: 0,
            playbackRevision: 0,
            songs: [],
            currentlyPlaying: null,
            playedSongs: [],
            publication: { mode: dashboardReads === 1 ? "unlisted" : "private", publicSlug: "actual-public-123" },
            guestControls: {
              allowSongRequests: true,
              allowGuestPlayOnDevice: true,
              allowPlaylistSharing: false,
              allowRecentlyPlayedVisibility: true,
              allowQueueVisibility: false,
            },
          },
        };
      }
      return {
        status: 200,
        body: {
          version: "music-public-resource/v1",
          publication: { mode: "public", publicSlug: "actual-public-123" },
          permissions: {
            allowSongRequests: true,
            allowGuestPlayOnDevice: true,
            allowPlaylistSharing: true,
            allowRecentlyPlayedVisibility: true,
            allowQueueVisibility: true,
          },
          queue: { items: [{ title: "Fixture queued song" }] },
          recentlyPlayed: { items: [{ title: "Fixture history song" }] },
          currentlyPlaying: { title: "Fixture playing song" },
          playlists: { items: [{ name: "Fixture public a1b2c3d4" }] },
        },
      };
    },
    updatePublicProfile: async () => {
      profileUpdates += 1;
      return { status: 200, body: { data: { updateAccount: { public_music: "Yes" } } } };
    },
    mutate: async (callsite, request) => {
      mutations.push({ callsite, ...request });
      if (request.path === "/api/playlists") return { status: 201, body: { id: 71 } };
      if (request.path.endsWith("/songs")) return { status: 201, body: { id: ++playlistSong } };
      if (request.path.endsWith("/visibility")) return { status: 204, body: undefined };
      if (request.path === "/api/music/queue/replace") return {
        status: 200,
        body: {
          version: "music-queue/v1",
          revision: 1,
          songs: [
            { id: 901, userId: 501, youtubeId: "abcdefghijk", title: "Fixture history song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png", position: 0, status: "queued", playedAt: null },
            { id: 902, userId: 501, youtubeId: "lmnopqrstuv", title: "Fixture playing song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png", position: 1, status: "queued", playedAt: null },
            { id: 903, userId: 501, youtubeId: "wxyzABC1234", title: "Fixture queued song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png", position: 2, status: "queued", playedAt: null },
          ],
        },
      };
      if (request.path === "/api/playlist/currently-playing") return {
        status: 200,
        body: request.data && (request.data as { songId?: number }).songId === 901
          ? { version: "music-playback/v1", revision: 2, playbackRevision: 1, song: { id: 901 } }
          : { version: "music-playback/v1", revision: 3, playbackRevision: 2, song: { id: 902 } },
      };
      if (request.path === "/api/music/guest-controls") return { status: 200, body: request.data };
      if (request.path === "/api/music/publication") return {
        status: 200,
        body: {
          version: "music-publication/v1",
          publication: {
            mode: (request.data as { mode: string }).mode,
            publicSlug: "actual-public-123",
          },
        },
      };
      throw new Error(`unexpected mutation ${request.path}`);
    },
  });

  expect(result).toMatchObject({
    publicSlug: "actual-public-123",
    playlistId: 71,
    songs: { history: 901, playing: 902, queued: 903 },
  });
  expect(profileUpdates).toBe(1);
  expect(reads).toEqual(["/api/music/dashboard", "/api/music/dashboard", "/api/music/public-resource/v1/actual-public-123"]);
  expect(mutations.map(({ callsite, path }) => [callsite, path])).toEqual([
    ["owner-publication", "/api/music/publication"],
    ["playlist-create", "/api/playlists"],
    ["playlist-song-add", "/api/playlists/71/songs"],
    ["playlist-song-add", "/api/playlists/71/songs"],
    ["playlist-song-add", "/api/playlists/71/songs"],
    ["playlist-visibility", "/api/playlists/71/visibility"],
    ["queue-replace", "/api/music/queue/replace"],
    ["player-update", "/api/playlist/currently-playing"],
    ["player-update", "/api/playlist/currently-playing"],
    ["guest-controls", "/api/music/guest-controls"],
    ["owner-publication", "/api/music/publication"],
  ]);
  expect(mutations.filter(({ path }) => path.endsWith("/currently-playing")).map(({ data }) => data)).toEqual([
    { songId: 901, expectedRevision: 1, expectedPlaybackRevision: 0 },
    { songId: 902, expectedRevision: 2, expectedPlaybackRevision: 1 },
  ]);
  expect(mutations.filter(({ callsite }) => callsite === "owner-publication").map(({ idempotencyKey }) => idempotencyKey)).toEqual([
    "tunes-share-v1-1777000000000-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "tunes-share-v1-1777000000000-11111111-2222-4333-8444-555555555555",
  ]);
  expect(mutations.at(-1)?.idempotencyKey)
    .toBe("tunes-share-v1-1777000000000-11111111-2222-4333-8444-555555555555");
  expect(() => assertLivePublicSlug("qualification-public")).toThrow(/returned public slug/i);
  expect(() => assertLivePublicSlug("short")).toThrow(/returned public slug/i);
});

test("live public preparation rejects a non-production queue contract before playback or later publication work", async () => {
  const events: string[] = [];
  let dashboardReads = 0;
  let savedId = 80;
  await expect(prepareLivePublicMusicJourney({
    seedId: "a1b2c3d4",
    privatePublicationIdempotencyKey: "tunes-share-v1-1777000000000-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    publicationIdempotencyKey: "tunes-share-v1-1777000000000-11111111-2222-4333-8444-555555555555",
    controls: {
      allowSongRequests: true,
      allowGuestPlayOnDevice: false,
      allowPlaylistSharing: false,
      allowRecentlyPlayedVisibility: false,
      allowQueueVisibility: false,
    },
    read: async (path) => {
      events.push(`read:${path}`);
      dashboardReads += 1;
      return {
        status: 200,
        body: {
          queueRevision: 0,
          playbackRevision: 0,
          songs: [], currentlyPlaying: null, playedSongs: [],
          publication: { mode: dashboardReads === 1 ? "unlisted" : "private", publicSlug: "actual-public-123" },
          guestControls: {
            allowSongRequests: true, allowGuestPlayOnDevice: true, allowPlaylistSharing: false,
            allowRecentlyPlayedVisibility: true, allowQueueVisibility: false,
          },
        },
      };
    },
    updatePublicProfile: async () => { events.push("profile"); return { status: 200, body: {} }; },
    mutate: async (callsite, request) => {
      events.push(callsite);
      if (request.path === "/api/music/publication") return {
        status: 200,
        body: { version: "music-publication/v1", publication: { mode: "private", publicSlug: "actual-public-123" } },
      };
      if (request.path === "/api/playlists") return { status: 201, body: { id: 71 } };
      if (request.path.endsWith("/songs")) return { status: 201, body: { id: ++savedId } };
      if (request.path.endsWith("/visibility")) return { status: 204 };
      if (request.path === "/api/music/queue/replace") return { status: 200, body: { version: "music-queue/v1", revision: 1, songs: [] } };
      throw new Error("later operation must not run");
    },
  })).rejects.toMatchObject({
    name: "LivePublicJourneyFailure",
    stage: "queue",
    code: "contract-invalid",
  } satisfies Partial<LivePublicJourneyFailure>);
  expect(events).not.toContain("player-update");
  expect(events).not.toContain("guest-controls");
  expect(events).not.toContain("profile");
  expect(events.filter((entry) => entry === "owner-publication")).toHaveLength(1);
});

test("permission preparation exposes only fixed safe substages and stops at hostile owner boundaries", async () => {
  const expectedStages = [
    "owner-dashboard", "private-transition", "private-dashboard", "playlist",
    "saved-song-1", "saved-song-2", "saved-song-3", "visibility", "queue",
    "playback-1", "playback-2", "controls", "profile", "publication",
    "public-resource", "guest-control-visible",
  ];
  expect(LIVE_PUBLIC_JOURNEY_FAILURE_STAGES).toEqual(expectedStages);
  const preflight = await import("../scripts/music-public-live-preflight.mjs");
  expect(preflight.LIVE_PERMISSION_FAILURE_STAGES).toEqual(expectedStages);

  const laterCalls: string[] = [];
  const input = {
    seedId: "a1b2c3d4",
    privatePublicationIdempotencyKey: "tunes-share-v1-1777000000000-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    publicationIdempotencyKey: "tunes-share-v1-1777000000000-11111111-2222-4333-8444-555555555555",
    controls: {
      allowSongRequests: true,
      allowGuestPlayOnDevice: false,
      allowPlaylistSharing: false,
      allowRecentlyPlayedVisibility: false,
      allowQueueVisibility: false,
    },
    updatePublicProfile: async () => { laterCalls.push("profile"); return { status: 200, body: {} }; },
    mutate: async (callsite: string) => {
      laterCalls.push(callsite);
      return { status: 500, body: { token: "Bearer must-not-survive" } };
    },
  };
  await expect(prepareLivePublicMusicJourney({
    ...input,
    read: async () => ({
      status: 200,
      body: {
        queueRevision: 0, playbackRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [],
        publication: { mode: "unlisted", publicSlug: "actual-public-123" },
        guestControls: {
          allowSongRequests: false,
          allowGuestPlayOnDevice: true,
          allowPlaylistSharing: false,
          allowRecentlyPlayedVisibility: true,
          allowQueueVisibility: false,
        },
      },
    }),
  })).rejects.toMatchObject({ stage: "owner-dashboard", code: "contract-invalid" });
  expect(laterCalls).toEqual([]);

  let reads = 0;
  await expect(prepareLivePublicMusicJourney({
    ...input,
    read: async () => {
      reads += 1;
      return {
        status: 200,
        body: {
          queueRevision: 0, playbackRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [],
          publication: { mode: "unlisted", publicSlug: "actual-public-123" },
          guestControls: {
            allowSongRequests: true,
            allowGuestPlayOnDevice: true,
            allowPlaylistSharing: false,
            allowRecentlyPlayedVisibility: true,
            allowQueueVisibility: false,
          },
        },
      };
    },
  })).rejects.toMatchObject({ stage: "private-transition", code: "http-failed" });
  expect(reads).toBe(1);
  expect(laterCalls).toEqual(["owner-publication"]);

  const hostile = "Bearer hostile C:\\private\\authority";
  const visibilityFailure = await assertLivePermissionGuestControlVisible(async () => { throw new Error(hostile); })
    .then(() => undefined, (error: unknown) => error);
  expect(visibilityFailure).toMatchObject({
    name: "LivePublicJourneyFailure", stage: "guest-control-visible", code: "assertion-failed",
  });
  expect(String(visibilityFailure)).not.toContain(hostile);
  await expect(assertLivePermissionGuestControlVisible(async () => undefined)).resolves.toBeUndefined();
});

test("profile batch body failures restore first, emit one row-bearing terminal, and then block subsequent batches", async () => {
  resetMusicRestoreBlockForContractTest();
  const rows = buildProfileCoveringRows().slice(0, 12);
  const events: string[] = [];
  const terminals: any[] = [];
  const state = { profile: { social_media: { theme_settings: { preset: "minimal-light" } } } };
  await expect(withRestoredMusicFixture({
    journeyId: "profile.owner.pairwise.batch-01",
    journeyRows: rows,
    snapshot: async () => { events.push("snapshot"); return structuredClone(state); },
    cleanupNamespace: async () => { events.push("cleanup"); },
    restore: async () => { events.push("restore"); },
    onBodyFailureAfterRestore: async () => { events.push("block"); },
    writeJourneyResult: async (record) => { events.push("terminal"); terminals.push(record); },
  }, async () => {
    events.push("body");
    throw new Error("profile baseline failed");
  })).rejects.toThrow("profile baseline failed");

  expect(events).toEqual(["snapshot", "body", "cleanup", "restore", "snapshot", "block", "terminal"]);
  expect(terminals).toEqual([expect.objectContaining({
    id: "profile.owner.pairwise.batch-01",
    status: "failed",
    reason: "body-failed",
    stage: "body",
    cleanup: "restored",
    rowCount: 12,
    rows,
  })]);
});

test("profile abort settlement accepts exactly one beforeunload and preserves the raw profile authority", async () => {
  const baseline = {
    documentId: "fixture-account",
    updatedAt: "2026-08-30T00:00:00.000Z",
    social_media: { theme_settings: { preset: "cinematic-dark", accentColor: "#10B981" } },
  };
  const events: string[] = [];
  let dirty = false;
  let dialogHandler: ((dialog: {
    type: () => string;
    accept: () => Promise<void>;
    dismiss: () => Promise<void>;
  }) => Promise<void>) | undefined;
  const result = await settleAbortedProfileMutation({
    baselineAccount: baseline,
    captureAbortedMutation: async () => {
      events.push("capture-aborted-update");
      dirty = true;
      return { operationName: "UpdateAccount", data: { accentColor: "#38BDF8" } };
    },
    waitForSaveSettled: async () => { events.push("save-settled"); },
    onDialog: (handler) => { events.push("dialog-on"); dialogHandler = handler; },
    offDialog: (handler) => {
      events.push("dialog-off");
      expect(handler).toBe(dialogHandler);
      dialogHandler = undefined;
    },
    reloadAndReadAccount: async () => {
      events.push("reload");
      expect(dialogHandler).toBeDefined();
      await dialogHandler!({
        type: () => "beforeunload",
        accept: async () => { events.push("beforeunload-accepted"); dirty = false; },
        dismiss: async () => { events.push("beforeunload-dismissed"); },
      });
      expect(dirty).toBe(false);
      return structuredClone(baseline);
    },
  });
  expect(result).toEqual({
    template: { operationName: "UpdateAccount", data: { accentColor: "#38BDF8" } },
    account: baseline,
  });
  expect(events).toEqual([
    "capture-aborted-update", "save-settled", "dialog-on", "reload",
    "beforeunload-accepted", "dialog-off",
  ]);
  expect(dialogHandler).toBeUndefined();

  for (const hostile of [
    { dialogTypes: [], expectedCode: "navigation-blocked" },
    { dialogTypes: ["alert"], expectedCode: "navigation-blocked" },
    { dialogTypes: ["beforeunload", "beforeunload"], expectedCode: "navigation-blocked" },
  ] as const) {
    let active: typeof dialogHandler;
    await expect(settleAbortedProfileMutation({
      baselineAccount: baseline,
      captureAbortedMutation: async () => ({ operationName: "UpdateAccount" }),
      waitForSaveSettled: async () => undefined,
      onDialog: (handler) => { active = handler; },
      offDialog: (handler) => { expect(handler).toBe(active); active = undefined; },
      reloadAndReadAccount: async () => {
        for (const type of hostile.dialogTypes) {
          await active!({ type: () => type, accept: async () => undefined, dismiss: async () => undefined });
        }
        return structuredClone(baseline);
      },
    })).rejects.toMatchObject({
      name: "LiveProfileBatchFailure",
      stage: "abort-discard-navigation",
      code: hostile.expectedCode,
      rowOrdinal: 0,
      completedRows: 0,
    });
    expect(active).toBeUndefined();
  }

  for (const changed of [
    { account: { ...structuredClone(baseline), updatedAt: "2026-08-30T00:00:01.000Z" }, code: "version-mismatch" },
    {
      account: { ...structuredClone(baseline), social_media: { theme_settings: { preset: "minimal-light" } } },
      code: "state-mismatch",
    },
  ] as const) {
    await expect(settleAbortedProfileMutation({
      baselineAccount: baseline,
      captureAbortedMutation: async () => ({ operationName: "UpdateAccount" }),
      waitForSaveSettled: async () => undefined,
      onDialog: (handler) => { dialogHandler = handler; },
      offDialog: () => { dialogHandler = undefined; },
      reloadAndReadAccount: async () => {
        await dialogHandler!({ type: () => "beforeunload", accept: async () => undefined, dismiss: async () => undefined });
        return changed.account;
      },
    })).rejects.toMatchObject({ stage: "abort-state-verify", code: changed.code });
  }
});

test("profile publish observes UpdateAccount, its exact refetch, and the saved terminal before public navigation", async () => {
  const socialMedia = { theme_settings: { preset: "cinematic-dark", accentColor: "#10B981" } };
  const events: string[] = [];
  let markUpdateObserved!: () => void;
  let canAcceptRefetch!: () => boolean;
  let resolveUpdate!: (account: ProfileBatchUpdateAccount) => void;
  let resolveRefetch!: (account: ProfileBatchRawAccount) => void;
  const account = await observeProfilePublish({
    rowOrdinal: 1,
    completedRows: 0,
    observeUpdate: (markObserved) => {
      events.push("observe-update");
      markUpdateObserved = markObserved;
      return new Promise((resolve) => { resolveUpdate = resolve; });
    },
    observeRefetch: (afterUpdateObserved) => {
      events.push("observe-refetch");
      canAcceptRefetch = afterUpdateObserved;
      return new Promise((resolve) => { resolveRefetch = resolve; });
    },
    triggerSave: async () => {
      events.push("trigger-save");
      expect(canAcceptRefetch()).toBe(false);
      markUpdateObserved();
      resolveUpdate({ documentId: "fixture-account", social_media: structuredClone(socialMedia) });
      expect(canAcceptRefetch()).toBe(true);
      resolveRefetch({ documentId: "fixture-account", updatedAt: "2026-08-30T00:00:01.000Z", social_media: structuredClone(socialMedia) });
    },
    waitForSavedTerminal: async () => { events.push("saved-terminal"); },
  });
  events.push("public-verification");
  expect(account.updatedAt).toBe("2026-08-30T00:00:01.000Z");
  expect(events).toEqual([
    "observe-update", "observe-refetch", "trigger-save", "saved-terminal", "public-verification",
  ]);

  await expect(observeProfilePublish({
    rowOrdinal: 4,
    completedRows: 3,
    observeUpdate: async (markObserved) => {
      markObserved();
      return { documentId: "fixture-account", social_media: structuredClone(socialMedia) };
    },
    observeRefetch: async () => ({
      documentId: "other-account",
      updatedAt: "2026-08-30T00:00:01.000Z",
      social_media: structuredClone(socialMedia),
    }),
    triggerSave: async () => undefined,
    waitForSavedTerminal: async () => undefined,
  })).rejects.toMatchObject({
    name: "LiveProfileBatchFailure",
    stage: "row-publish-settle",
    code: "state-mismatch",
    rowOrdinal: 4,
    completedRows: 3,
  });

  const hostile = "Bearer never-retain C:\\private\\raw-profile";
  await expect(observeProfilePublish({
    rowOrdinal: 1,
    completedRows: 0,
    observeUpdate: () => Promise.reject(new Error(hostile)),
    observeRefetch: () => Promise.reject(new Error(hostile)),
    triggerSave: async () => { throw new Error(hostile); },
    waitForSavedTerminal: async () => undefined,
  })).rejects.toMatchObject({
    name: "LiveProfileBatchFailure", stage: "row-publish-response", code: "http-failed",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
});

test("browser-inert profile batch uses the real fixture documents for abort discard and first-row public projection", async () => {
  const { createFixtureProfileController } = await import("../../tunes/scripts/music-fixture-profile");
  const { PROFILE_BATCH_CATEGORY_IDS } = await import("./setup/profile-batch-order");
  const document = (file: string, operation: string) => {
    const source = readFileSync(file, "utf8");
    const matches = [...source.matchAll(/gql`([\s\S]*?)`/g)]
      .map((match) => match[1]!)
      .filter((query) => new RegExp(`(?:query|mutation)\\s+${operation}\\b`).test(query));
    expect(matches).toHaveLength(1);
    return matches[0]!;
  };
  const profileQuery = document("src/features/Profile/api/query.ts", "UsersPermissionsUser");
  // Ticket 3.4 took the profile save off GraphQL, so the UpdateAccount document now comes
  // from Settings - the last surface that issues one.
  const updateMutation = document("src/features/Settings/api/mutation.ts", "UpdateAccount");
  const publicQuery = document("src/features/PublicHome/api/query.ts", "PublicProfileData");
  const username = "e2e-public-music-profile-contract-owner";
  const controller = createFixtureProfileController({
    username,
    accountDocumentId: "e2e-public-music-profile-contract-account",
    userDocumentId: "e2e-public-music-profile-contract-user",
    baseUser: { provider: "local", confirmed: true, blocked: false },
    baseAccount: { mobile_number: "+10000000000" },
  });
  const readAccount = () => {
    const response = controller.graphql(profileQuery, { documentId: "e2e-public-music-profile-contract-user" });
    expect(response.status).toBe(200);
    return (response.body as { data: { usersPermissionsUser: { accounts: ProfileBatchRawAccount[] } } })
      .data.usersPermissionsUser.accounts[0]!;
  };
  const baseline = readAccount();
  const events: string[] = [];
  let activeDialog: ((dialog: ProfileBatchDialog) => Promise<void>) | undefined;
  await settleAbortedProfileMutation({
    baselineAccount: baseline,
    captureAbortedMutation: async () => {
      events.push("abort-update-before-fixture");
      return { query: updateMutation, variables: { documentId: baseline.documentId, data: { social_media: {} } } };
    },
    waitForSaveSettled: async () => { events.push("failed-save-settled"); },
    onDialog: (handler) => { activeDialog = handler; },
    offDialog: () => { activeDialog = undefined; },
    reloadAndReadAccount: async () => {
      await activeDialog!({
        type: () => "beforeunload",
        accept: async () => { events.push("discard-dirty-ui"); },
        dismiss: async () => { throw new Error("unexpected dialog dismissal"); },
      });
      events.push("reload-profile-query");
      return readAccount();
    },
  });
  expect(readAccount()).toEqual(baseline);
  expect(activeDialog).toBeUndefined();

  let resolveUpdate!: (account: ProfileBatchUpdateAccount) => void;
  let resolveRefetch!: (account: ProfileBatchRawAccount) => void;
  let markPublishedResponse!: () => void;
  let acceptsPublishedRefetch!: () => boolean;
  let savePending = true;
  const nextSocialMedia = structuredClone(baseline.social_media);
  const theme = nextSocialMedia.theme_settings as Record<string, unknown>;
  theme.preset = "cinematic-dark";
  theme.accentColor = "#10B981";
  theme.wallpaperMode = "banner-top";
  theme.landingTab = "all-recommendations";
  theme.recommendations = {
    layout: "shelves",
    categoryOrder: [...PROFILE_BATCH_CATEGORY_IDS],
    __e2eSentinel: "profile-contract-sentinel",
  };
  const published = await observeProfilePublish({
    rowOrdinal: 1,
    completedRows: 0,
    observeUpdate: (markObserved) => new Promise((resolve) => {
      events.push("observe-update"); markPublishedResponse = markObserved; resolveUpdate = resolve;
    }),
    observeRefetch: (afterUpdateResponse) => new Promise((resolve) => {
      events.push("observe-refetch"); acceptsPublishedRefetch = afterUpdateResponse; resolveRefetch = resolve;
    }),
    triggerSave: async () => {
      events.push("publish-update");
      const response = controller.graphql(updateMutation, {
        documentId: baseline.documentId,
        data: { social_media: nextSocialMedia },
      });
      expect(response.status).toBe(200);
      expect(acceptsPublishedRefetch()).toBe(false);
      markPublishedResponse();
      resolveUpdate((response.body as { data: { updateAccount: ProfileBatchUpdateAccount } }).data.updateAccount);
      events.push("profile-refetch-applied");
      expect(acceptsPublishedRefetch()).toBe(true);
      resolveRefetch(readAccount());
      savePending = false;
    },
    waitForSavedTerminal: async () => {
      expect(savePending).toBe(false);
      events.push("saved-terminal");
    },
  });
  expect(published.updatedAt).toBe("2026-08-29T00:00:01.000Z");
  const publicResponse = controller.graphql(publicQuery, { filters: { username: { eq: username } } });
  expect(publicResponse.status).toBe(200);
  const publicAccount = (publicResponse.body as { data: { accounts: ProfileBatchRawAccount[] } }).data.accounts[0]!;
  expect(publicAccount.social_media).toEqual(nextSocialMedia);
  events.push("public-first-row-verified");
  expect(events).toEqual([
    "abort-update-before-fixture", "failed-save-settled", "discard-dirty-ui", "reload-profile-query",
    "observe-update", "observe-refetch", "publish-update", "profile-refetch-applied", "saved-terminal",
    "public-first-row-verified",
  ]);
});

test("profile batch diagnostics are fixed, progress-checked, sanitized, and forbidden outside failed profile terminals", async () => {
  expect(LIVE_PROFILE_BATCH_FAILURE_STAGES).toEqual([
    "baseline-dashboard", "baseline-presentation", "template-capture", "abort-settle",
    "abort-discard-navigation", "abort-state-verify", "sentinel-write", "sentinel-readback",
    "baseline-public", "row-dashboard", "row-apply", "row-publish-response",
    "row-publish-settle", "row-dashboard-readback", "row-public-theme", "row-public-tab",
    "row-public-layout", "row-public-order", "row-public-featured",
    "row-public-gallery-tab", "row-public-gallery-select", "row-public-gallery-panel", "row-public-gallery-content",
    "row-public-business",
  ]);
  expect(LIVE_PROFILE_BATCH_FAILURE_CODES).toEqual([
    "timeout", "http-failed", "contract-invalid", "version-mismatch", "state-mismatch",
    "navigation-blocked", "mutation-not-observed", "locator-missing", "attribute-mismatch",
    "order-mismatch", "content-insufficient", "unexpected",
  ]);
  const hash = "c".repeat(64);
  const rows = buildProfileCoveringRows().slice(0, 12);
  const profileBatchFailure = {
    stage: "row-public-order", code: "order-mismatch", rowOrdinal: 4, completedRows: 3,
  } as const;
  const terminal = buildLiveJourneyTerminal({
    id: "profile.owner.pairwise.batch-01",
    status: "failed",
    reason: "body-failed",
    stage: "body",
    cleanup: "restored",
    beforeHash: hash,
    afterHash: hash,
    rows,
    profileBatchFailure,
  });
  expect(terminal.profileBatchFailure).toEqual(profileBatchFailure);

  const preflight = await import("../scripts/music-public-live-preflight.mjs");
  const ledger = preflight.buildSanitizedJourneyOutcomeLedger({
    executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, {
      statusById: { "profile.owner.pairwise.batch-01": "failed" },
    }),
    reportStatus: "accepted",
    terminalRecords: [terminal],
    terminalStatus: "accepted",
  });
  expect(ledger.schemaVersion).toBe("explorers-public-journey-outcomes/v4");
  expect(ledger.mutationTerminals.find(({ id }) => id === "profile.owner.pairwise.batch-01")).toEqual({
    id: "profile.owner.pairwise.batch-01",
    status: "failed",
    reason: "terminal-failed",
    stage: "terminal-evidence",
    profileBatchFailure,
  });
  expect(preflight.validateSanitizedJourneyOutcomeLedger(ledger)).toBe(true);
  expect(JSON.stringify(ledger)).not.toMatch(/Bearer|https?:|[A-Z]:\\|social_media|updatedAt/i);

  for (const hostile of [
    { id: "profile.owner.pairwise.batch-01", status: "passed", failure: profileBatchFailure },
    { id: "music.owner.queue-add", status: "failed", failure: profileBatchFailure },
    { id: "profile.owner.pairwise.batch-01", status: "failed", failure: { ...profileBatchFailure, rowOrdinal: 0 } },
    { id: "profile.owner.pairwise.batch-01", status: "failed", failure: { ...profileBatchFailure, completedRows: 4 } },
    { id: "profile.owner.pairwise.batch-01", status: "failed", failure: { ...profileBatchFailure, rowOrdinal: 13, completedRows: 12 } },
    { id: "profile.owner.pairwise.batch-01", status: "failed", failure: { ...profileBatchFailure, rowOrdinal: 1.5, completedRows: 0.5 } },
    { id: "profile.owner.pairwise.batch-01", status: "failed", failure: { ...profileBatchFailure, stage: "baseline-dashboard" } },
    { id: "profile.owner.pairwise.batch-01", status: "failed", failure: { ...profileBatchFailure, stage: "C:\\private\\hostile" } },
    { id: "profile.owner.pairwise.batch-01", status: "failed", failure: { ...profileBatchFailure, code: "Bearer hostile" } },
    { id: "profile.owner.pairwise.batch-01", status: "failed", failure: { ...profileBatchFailure, raw: "forbidden" } },
  ] as const) {
    expect(() => buildLiveJourneyTerminal({
      id: hostile.id,
      status: hostile.status,
      reason: hostile.status === "passed" ? "none" : "body-failed",
      stage: hostile.status === "passed" ? "verification" : "body",
      cleanup: "restored",
      beforeHash: hash,
      afterHash: hash,
      rows: hostile.id.startsWith("profile.") ? rows : undefined,
      profileBatchFailure: hostile.failure,
    })).toThrow(/profile batch failure/i);
  }

  const hostileLedger = structuredClone(ledger);
  hostileLedger.mutationTerminals[0].profileBatchFailure = profileBatchFailure;
  expect(preflight.validateSanitizedJourneyOutcomeLedger(hostileLedger)).toBe(false);
  const hostileExecution = structuredClone(ledger);
  hostileExecution.executionOutcomes[11].profileBatchFailure = profileBatchFailure;
  expect(preflight.validateSanitizedJourneyOutcomeLedger(hostileExecution)).toBe(false);
  for (const id of EXPECTED_LIVE_JOURNEYS.slice(11).map((entry) => entry.id)) {
    expect(buildLiveJourneyTerminal({
      id, status: "failed", reason: "body-failed", stage: "body", cleanup: "restored",
      beforeHash: hash, afterHash: hash, rows,
      profileBatchFailure: { stage: "baseline-dashboard", code: "locator-missing", rowOrdinal: 0, completedRows: 0 },
    }).profileBatchFailure).toEqual({
      stage: "baseline-dashboard", code: "locator-missing", rowOrdinal: 0, completedRows: 0,
    });
  }
  const passedEvidence = validJourneyEvidenceRecords();
  passedEvidence[11]!.profileBatchFailure = profileBatchFailure;
  expect(validateLiveJourneyEvidence({
    executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, { resultStatus: "passed" }),
    records: passedEvidence,
  })).toMatchObject({ ok: false, subchecks: expect.arrayContaining(["record-contract"]) });
});

test("gallery qualification reports each failed predicate only after exact restoration and never advances progress", async () => {
  const module = await import("./setup/profile-batch") as Record<string, unknown>;
  expect(typeof module.verifyProfileBatchGallery).toBe("function");
  const verifyGallery = module.verifyProfileBatchGallery as (input: {
    progress: { rowOrdinal: number; completedRows: number };
    assertTabPresent: () => Promise<void>;
    assertTabVisible: () => Promise<void>;
    selectTab: () => Promise<void>;
    assertTabSelected: () => Promise<void>;
    assertPanelPresent: () => Promise<void>;
    assertPanelVisible: () => Promise<void>;
    assertPopulatedContent: () => Promise<void>;
    assertContentSource: () => Promise<void>;
  }) => Promise<void>;
  const predicates = [
    { name: "assertTabPresent", stage: "row-public-gallery-tab", code: "locator-missing" },
    { name: "assertTabVisible", stage: "row-public-gallery-tab", code: "timeout" },
    { name: "selectTab", stage: "row-public-gallery-select", code: "timeout" },
    { name: "assertTabSelected", stage: "row-public-gallery-select", code: "attribute-mismatch" },
    { name: "assertPanelPresent", stage: "row-public-gallery-panel", code: "locator-missing" },
    { name: "assertPanelVisible", stage: "row-public-gallery-panel", code: "timeout" },
    { name: "assertPopulatedContent", stage: "row-public-gallery-content", code: "content-insufficient" },
    { name: "assertContentSource", stage: "row-public-gallery-content", code: "attribute-mismatch" },
  ] as const;
  const preflight = await import("../scripts/music-public-live-preflight.mjs");
  for (let failedIndex = 0; failedIndex < predicates.length; failedIndex += 1) {
    const failed = predicates[failedIndex]!;
    const events: string[] = [];
    const terminals: Array<Record<string, unknown>> = [];
    const state = { revision: 0, galleryImages: 1 };
    const progress = { rowOrdinal: 1, completedRows: 0 };
    const operations = Object.fromEntries(predicates.map(({ name }, index) => [name, async () => {
      events.push(name);
      if (index === failedIndex) throw new Error("Bearer hostile-gallery https://secret.invalid C:\\private\\gallery.png");
    }])) as Omit<Parameters<typeof verifyGallery>[0], "progress">;
    await expect(withRestoredMusicFixture({
      journeyId: "profile.owner.pairwise.batch-01",
      journeyRows: buildProfileCoveringRows().slice(0, 12),
      snapshot: async () => { events.push("snapshot"); return structuredClone(state); },
      cleanupNamespace: async () => { events.push("cleanup"); },
      restore: async () => { events.push("restore"); state.revision = 0; },
      onBodyFailureAfterRestore: async () => { events.push("block"); },
      writeJourneyResult: async (record) => { events.push("terminal"); terminals.push(record as Record<string, unknown>); },
    }, async () => {
      state.revision = 1;
      await verifyGallery({ progress, ...operations });
      progress.completedRows += 1;
    })).rejects.toMatchObject({
      name: "LiveProfileBatchFailure", message: "Live profile batch journey failed",
      stage: failed.stage, code: failed.code, rowOrdinal: 1, completedRows: 0,
    });
    expect(events).toEqual([
      "snapshot", ...predicates.slice(0, failedIndex + 1).map(({ name }) => name),
      "cleanup", "restore", "snapshot", "block", "terminal",
    ]);
    expect(progress).toEqual({ rowOrdinal: 1, completedRows: 0 });
    expect(state).toEqual({ revision: 0, galleryImages: 1 });
    expect(terminals).toHaveLength(1);
    expect(terminals[0]).toMatchObject({
      status: "failed", cleanup: "restored", reason: "body-failed", stage: "body",
      profileBatchFailure: { stage: failed.stage, code: failed.code, rowOrdinal: 1, completedRows: 0 },
    });
    expect(terminals[0]!.beforeHash).toBe(terminals[0]!.afterHash);
    const ledger = preflight.buildSanitizedJourneyOutcomeLedger({
      executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, {
        statusById: { "profile.owner.pairwise.batch-01": "failed" },
      }),
      terminalRecords: terminals,
    });
    expect(preflight.validateSanitizedJourneyOutcomeLedger(ledger)).toBe(true);
    expect(ledger.schemaVersion).toBe("explorers-public-journey-outcomes/v4");
    expect(ledger.mutationTerminals[11].profileBatchFailure).toEqual(terminals[0]!.profileBatchFailure);
    expect(JSON.stringify(ledger)).not.toMatch(/Bearer|hostile-gallery|https?:|[A-Z]:\\|gallery\.png/i);
    for (const invalidProgress of [{ rowOrdinal: 0, completedRows: 0 }, { rowOrdinal: 1, completedRows: 1 }]) {
      const hostileLedger = structuredClone(ledger);
      Object.assign(hostileLedger.mutationTerminals[11].profileBatchFailure, invalidProgress);
      expect(preflight.validateSanitizedJourneyOutcomeLedger(hostileLedger)).toBe(false);
    }
    for (const record of [
      { ...terminals[0], status: "passed", reason: "none", stage: "verification" },
      { ...terminals[0], id: "music.owner.queue-add", rows: undefined },
    ]) {
      expect(() => buildLiveJourneyTerminal(record)).toThrow(/profile batch failure/i);
    }
    const hostileOtherJourney = structuredClone(ledger);
    hostileOtherJourney.mutationTerminals[0].profileBatchFailure = terminals[0]!.profileBatchFailure;
    expect(preflight.validateSanitizedJourneyOutcomeLedger(hostileOtherJourney)).toBe(false);
  }

  const events: string[] = [];
  const operations = Object.fromEntries(predicates.map(({ name }) => [name, async () => { events.push(name); }])) as
    Omit<Parameters<typeof verifyGallery>[0], "progress">;
  const progress = { rowOrdinal: 12, completedRows: 11 };
  await verifyGallery({ progress, ...operations });
  expect(events).toEqual(predicates.map(({ name }) => name));
  expect(progress).toEqual({ rowOrdinal: 12, completedRows: 11 });
  events.length = 0;
  await expect(verifyGallery({ progress: { rowOrdinal: 0, completedRows: 0 }, ...operations })).rejects.toThrow(
    "Live profile gallery progress is invalid",
  );
  expect(events).toEqual([]);
});

test("live gallery verification binds all four stages to exact accessible UI predicates", () => {
  const source = readFileSync("e2e/profile-theme.spec.ts", "utf8");
  const ast = ts.createSourceFile("profile-theme.spec.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const verifyRow = ast.statements.find((node): node is ts.FunctionDeclaration => (
    ts.isFunctionDeclaration(node) && node.name?.text === "verifyPublicRow"
  ));
  expect(verifyRow?.body).toBeDefined();
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "verifyProfileBatchGallery") calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(verifyRow!);
  expect(calls).toHaveLength(1);
  const body = verifyRow!.getText(ast);
  expect(body).not.toContain("'row-public-gallery'");
  expect(body).toContain("getByRole('tab', { name: 'Gallery', exact: true })");
  expect(body).toContain("getByRole('tabpanel', { name: 'Gallery', exact: true })");
  expect(body).toContain("getByRole('img', { name: 'tuneslogo.png', exact: true })");
  const input = calls[0]!.arguments[0]!;
  expect(ts.isObjectLiteralExpression(input)).toBe(true);
  if (!ts.isObjectLiteralExpression(input)) return;
  expect(input.properties.map((property) => property.name?.getText(ast))).toEqual([
    "progress", "assertTabPresent", "assertTabVisible", "selectTab", "assertTabSelected",
    "assertPanelPresent", "assertPanelVisible", "assertPopulatedContent", "assertContentSource",
  ]);
  expect(input.getText(ast)).toContain("toHaveAttribute('aria-selected', 'true')");
  expect(input.getText(ast)).toContain("toHaveAttribute('src', '/images/tuneslogo.png')");
});

test("gallery diagnostic versions reject coarse new production and isolate historical v3 reads", async () => {
  const preflight = await import("../scripts/music-public-live-preflight.mjs");
  const profileBatchFailure = {
    stage: "row-public-gallery", code: "locator-missing", rowOrdinal: 1, completedRows: 0,
  };
  expect(() => new LiveProfileBatchFailure("row-public-gallery", "locator-missing", 1, 0)).toThrow(
    "Live profile batch failure input is invalid",
  );
  expect(() => buildLiveJourneyTerminal({
    id: "profile.owner.pairwise.batch-01", status: "failed", reason: "body-failed", stage: "body",
    cleanup: "restored", beforeHash: "c".repeat(64), afterHash: "c".repeat(64),
    rows: buildProfileCoveringRows().slice(0, 12), profileBatchFailure,
  })).toThrow(/profile batch failure/i);
  const current = preflight.buildSanitizedJourneyOutcomeLedger({
    executionReport: playwrightJourneyReport(EXPECTED_LIVE_JOURNEYS, {
      statusById: { "profile.owner.pairwise.batch-01": "failed" },
    }),
    terminalRecords: [buildLiveJourneyTerminal({
      id: "profile.owner.pairwise.batch-01", status: "failed", reason: "body-failed", stage: "body",
      cleanup: "restored", beforeHash: "c".repeat(64), afterHash: "c".repeat(64),
      rows: buildProfileCoveringRows().slice(0, 12),
      profileBatchFailure: { ...profileBatchFailure, stage: "row-public-gallery-tab" },
    })],
  });
  expect(current.schemaVersion).toBe("explorers-public-journey-outcomes/v4");
  expect(preflight.validateSanitizedJourneyOutcomeLedger(current)).toBe(true);
  const historical = structuredClone(current);
  historical.schemaVersion = "explorers-public-journey-outcomes/v3";
  historical.mutationTerminals[11].profileBatchFailure = profileBatchFailure;
  expect(preflight.validateSanitizedJourneyOutcomeLedger(historical)).toBe(false);
  expect(preflight.validateSanitizedJourneyOutcomeLedger(historical, { allowHistorical: true })).toBe(true);
  for (const record of [
    { ...current, mutationTerminals: historical.mutationTerminals },
    { ...historical, mutationTerminals: current.mutationTerminals },
    { ...historical, schemaVersion: "explorers-public-journey-outcomes/v2" },
  ]) {
    expect(preflight.validateSanitizedJourneyOutcomeLedger(record)).toBe(false);
    expect(preflight.validateSanitizedJourneyOutcomeLedger(record, { allowHistorical: true })).toBe(false);
  }
  const sandbox = mkdtempSync(join(tmpdir(), "gallery-historical-ledger-"));
  try {
    expect(() => preflight.persistSanitizedJourneyOutcomeLedger({
      path: join(sandbox, "journey-outcomes.json"), ledger: historical,
    })).toThrow("sanitized journey outcome persistence contract is invalid");
    expect(readdirSync(sandbox)).toEqual([]);
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});

test("restored profile batch failures retain only fixed progress metadata after restoration", async () => {
  const events: string[] = [];
  const terminals: Array<Record<string, unknown>> = [];
  const rows = buildProfileCoveringRows().slice(0, 12);
  const state = { profile: { revision: 1 } };
  await expect(withRestoredMusicFixture({
    journeyId: "profile.owner.pairwise.batch-01",
    journeyRows: rows,
    snapshot: async () => { events.push("snapshot"); return structuredClone(state); },
    cleanupNamespace: async () => { events.push("cleanup"); },
    restore: async () => { events.push("restore"); },
    onBodyFailureAfterRestore: async () => { events.push("block"); },
    writeJourneyResult: async (record) => { events.push("terminal"); terminals.push(record as Record<string, unknown>); },
  }, async () => {
    events.push("body");
    throw new LiveProfileBatchFailure("row-public-layout", "attribute-mismatch", 7, 6);
  })).rejects.toMatchObject({
    stage: "row-public-layout", code: "attribute-mismatch", rowOrdinal: 7, completedRows: 6,
  });
  expect(events).toEqual(["snapshot", "body", "cleanup", "restore", "snapshot", "block", "terminal"]);
  expect(terminals).toEqual([expect.objectContaining({
    id: "profile.owner.pairwise.batch-01",
    status: "failed",
    cleanup: "restored",
    profileBatchFailure: {
      stage: "row-public-layout", code: "attribute-mismatch", rowOrdinal: 7, completedRows: 6,
    },
  })]);
  expect(JSON.stringify(terminals[0]!.profileBatchFailure)).not.toMatch(
    /social_media|updatedAt|Bearer|https?:|[A-Z]:\\/i,
  );
});

test("live Music afterEach hooks are read-only and every mutation journey owns its complete postcondition lifecycle", () => {
  const liveFiles = [
    { path: "e2e/music-fixture-fullstack.spec.ts", expectedWrappers: 2 },
    { path: "e2e/music-public-contract.spec.ts", expectedWrappers: 5 },
    { path: "e2e/profile-theme.spec.ts", expectedWrappers: 1 },
  ] as const;
  const wrapperNames = new Set(["withFixtureRestore", "withRestoredMusicFixture"]);

  for (const file of liveFiles) {
    const source = readFileSync(file.path, "utf8");
    const ast = ts.createSourceFile(file.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let wrapperCount = 0;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && wrapperNames.has(node.expression.text)) {
        let testBody: ts.Block | undefined;
        for (let ancestor: ts.Node | undefined = node.parent; ancestor; ancestor = ancestor.parent) {
          if (!ts.isArrowFunction(ancestor) || !ts.isBlock(ancestor.body) || !ts.isCallExpression(ancestor.parent)) continue;
          const callee = ancestor.parent.expression;
          if (ts.isIdentifier(callee) && (callee.text === "test" || callee.text === "liveTest")) {
            testBody = ancestor.body;
            break;
          }
        }
        if (testBody) {
          wrapperCount += 1;
          const statement = node.parent.parent;
          expect(ts.isExpressionStatement(statement), `${file.path} wrapper must be awaited as a statement`).toBe(true);
          expect(statement.parent, `${file.path} wrapper must be directly owned by the test body`).toBe(testBody);
          expect(testBody.statements.at(-1), `${file.path} wrapper must be the final test-body statement`).toBe(statement);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    expect(wrapperCount, `${file.path} reviewed wrapper count`).toBe(file.expectedWrappers);

    const afterEachHooks: string[] = [];
    const collectAfterEach = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "test"
          && node.expression.name.text === "afterEach") {
        afterEachHooks.push(node.getText(ast));
      }
      ts.forEachChild(node, collectAfterEach);
    };
    collectAfterEach(ast);
    for (const hook of afterEachHooks) {
      expect(hook, `${file.path} afterEach may not mutate fixture business state`)
        .not.toMatch(/guardedMutation|runAuthorizedMusicMutation|\.request\.(?:post|put|patch|delete)\s*\(/);
    }
  }

  const source = readFileSync("e2e/music-public-contract.spec.ts", "utf8");
  const liveSource = source.slice(source.indexOf("const permissionJourneyIds"));
  expect(liveSource).not.toContain("qualification-public");
  expect(liveSource).toContain("prepareOwnerPublicJourney");
  expect(source.slice(0, source.indexOf("const permissionJourneyIds"))).toContain("return prepareLivePublicMusicJourney({");
});

test("live queue visibility targets the canonical public Up next region", () => {
  const source = readFileSync("e2e/music-public-contract.spec.ts", "utf8");
  const liveSource = source.slice(source.indexOf("const permissionJourneyIds"));

  expect(liveSource).toContain('guestPage.getByRole("region", { name: "Up next", exact: true })');
  expect(liveSource).not.toContain('guestPage.getByRole("heading", { name: /queue/i })');
});

test("live failure screenshots are best-effort local diagnostics", async () => {
  const events: string[] = [];
  const failingPage = {
    isClosed: () => false,
    screenshot: async () => { events.push("screenshot"); throw new Error("local screenshot unavailable"); },
  };
  const failingInfo = {
    status: "failed",
    expectedStatus: "passed",
    attach: async () => { events.push("attach"); },
  };
  await expect(attachLiveFailureScreenshotBestEffort(
    failingPage as never,
    failingInfo as never,
    "fixture-failure",
  )).resolves.toBeUndefined();
  expect(events).toEqual(["screenshot"]);

  const attachmentInfo = {
    ...failingInfo,
    attach: async () => { events.push("attach"); throw new Error("local attachment unavailable"); },
  };
  await expect(attachLiveFailureScreenshotBestEffort(
    { isClosed: () => false, screenshot: async () => Buffer.from("local-image") } as never,
    attachmentInfo as never,
    "fixture-failure",
  )).resolves.toBeUndefined();
  expect(events).toEqual(["screenshot", "attach"]);

  await attachLiveFailureScreenshotBestEffort(
    { isClosed: () => true, screenshot: async () => { events.push("closed-screenshot"); return Buffer.alloc(0); } } as never,
    failingInfo as never,
    "fixture-failure",
  );
  expect(events).not.toContain("closed-screenshot");
});

test("guest-device playback is local-only and leaves the owner queue exact while a second guest stays isolated", () => {
  const source = readFileSync("e2e/music-public-contract.spec.ts", "utf8");
  const journey = source.slice(
    source.indexOf('liveTest("live guest playback'),
    source.indexOf('liveTest("owner publication'),
  );
  expect(journey).toContain("Choose Fixture queued song to play on this device");
  expect(journey).toContain("Play Fixture queued song on this device");
  expect(journey).toContain("expect(afterBody).toEqual(beforeBody)");
  expect(journey).toContain("second guest remains on the canonical owner selection");
  expect(journey).not.toContain("toBeGreaterThan(beforeRevision)");
  expect(journey).not.toContain("guest playback changes canonical player state");
});

test("profile batch baseline and every row execute inside canonical snapshot restoration and terminal ownership", () => {
  const source = readFileSync("e2e/profile-theme.spec.ts", "utf8");
  const liveBatch = source.slice(source.indexOf("test.describe('approved live profile writes'"), source.indexOf("test.describe('Public Profile Theme"));
  expect(liveBatch).toMatch(/withRestoredMusicFixture\([\s\S]+journeyRows:\s*liveRows[\s\S]+async \(\) => \{[\s\S]+const baselineAccount = await profileBatchBoundary/);
  expect(liveBatch.indexOf("withRestoredMusicFixture(")).toBeLessThan(liveBatch.indexOf("const baselineAccount = await profileBatchBoundary"));
  expect(liveBatch.indexOf("await verifyPublicRow(")).toBeLessThan(liveBatch.indexOf("completedRows += 1"));
  expect(liveBatch).not.toContain("appendLiveJourneyResult");
  expect(liveBatch).not.toContain("normalExactRestore");
});

test("static mutation guard rejects raw API writes and standard-test live bypasses", () => {
  for (const file of ["e2e/music-public-contract.spec.ts", "e2e/music-fixture-fullstack.spec.ts"]) {
    const source = readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\.request\.(?:post|put|patch|delete)\(/.test(line)) {
        const guardedContext = lines.slice(Math.max(0, index - 2), index + 1).join("\n");
        expect(guardedContext, `${file}:${index + 1} raw mutation bypass`).toMatch(/guardedMutation\(|runAuthorizedMusicMutation\(/);
      }
    });
    expect(source, `${file} must not suite-skip in place of per-body authority`).not.toMatch(/test\.skip\(Boolean\(liveSkipReason\)[\s\S]{0,120}describe/);
  }
  const publicSource = readFileSync("e2e/music-public-contract.spec.ts", "utf8");
  expect(publicSource).not.toMatch(/\btest\(["'`]live /);
  expect(publicSource).not.toMatch(/\btest\(["'`]owner publication,/);
});

test("live fixture always restores and rejects normalized state drift", async () => {
  resetMusicRestoreBlockForContractTest();
  const events: string[] = [];
  let state: unknown = { publication: { mode: "private" }, queue: [] };
  await expect(withRestoredMusicFixture({
    snapshot: async () => structuredClone(state),
    restore: async (snapshot) => { events.push("restore"); state = snapshot; },
    cleanupNamespace: async () => { events.push("cleanup"); },
  }, async () => {
    state = { publication: { mode: "public" }, queue: [{ publicId: "fixture-song" }] };
    events.push("journey");
  })).resolves.toMatchObject({ cleanup: "restored", beforeHash: expect.any(String), afterHash: expect.any(String) });
  expect(events).toEqual(["journey", "cleanup", "restore"]);

  let snapshots = 0;
  await expect(withRestoredMusicFixture({
    snapshot: async () => snapshots++ === 0
      ? ({ publication: { mode: "private" } })
      : ({ publication: { mode: "public" } }),
    restore: async () => undefined,
    cleanupNamespace: async () => undefined,
  }, async () => undefined)).rejects.toThrow(/restoration mismatch/);
});

test("restore runs after journey failure, preserves the original state, and teardown is idempotent", async () => {
  resetMusicRestoreBlockForContractTest();
  const original = { publication: { mode: "unlisted" }, permissions: { allowSongRequests: true }, queue: ["one"] };
  let state = structuredClone(original);
  let cleanupCount = 0;
  const adapters = {
    snapshot: async () => structuredClone(state),
    cleanupNamespace: async () => { cleanupCount += 1; },
    restore: async (snapshot: unknown) => { state = structuredClone(snapshot); },
  };
  await expect(withRestoredMusicFixture(adapters, async () => {
    state = { publication: { mode: "private" }, permissions: { allowSongRequests: false }, queue: [] };
    throw new Error("journey failed");
  })).rejects.toThrow("journey failed");
  expect(state).toEqual(original);
  await expect(withRestoredMusicFixture(adapters, async () => "second teardown")).resolves.toMatchObject({ cleanup: "restored" });
  expect(cleanupCount).toBe(2);
});

test("restore is still attempted when namespace cleanup fails and subsequent live mutations are blocked", async () => {
  resetMusicRestoreBlockForContractTest();
  let restoreCount = 0;
  const evidence: unknown[] = [];
  await expect(withRestoredMusicFixture({
    snapshot: async () => ({ publication: { mode: "unlisted" } }),
    cleanupNamespace: async () => { throw new Error("namespace cleanup failed"); },
    restore: async () => { restoreCount += 1; },
    writeRecoveryArtifact: async (artifact) => { evidence.push(artifact); },
  }, async () => undefined)).rejects.toThrow("namespace cleanup failed");
  expect(restoreCount).toBe(1);
  expect(evidence).toEqual([{ reason: "cleanup-failed", beforeHash: expect.any(String) }]);
  expect(JSON.stringify(evidence)).not.toMatch(/token|credential|capability/i);
  await expect(runAuthorizedMusicMutation({
    lane: "live",
    liveWriteEnabled: true,
    baseUrl: "http://127.0.0.1:55173",
    serviceOrigins: ["http://127.0.0.1:55173"],
    accountDocumentId: "e2e-public-music-run-account",
    accountUsername: "e2e-public-music-run-owner",
    fixtureVersion: MUSIC_PUBLIC_FIXTURE_VERSION,
    confirmation: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
  }, "guest-controls", async () => undefined)).rejects.toThrow(/blocked after a restoration failure/);
  resetMusicRestoreBlockForContractTest();
});

test("restore mismatch emits sanitized recovery evidence and blocks subsequent live mutations", async () => {
  resetMusicRestoreBlockForContractTest();
  const evidence: unknown[] = [];
  let snapshots = 0;
  await expect(withRestoredMusicFixture({
    snapshot: async () => snapshots++ === 0 ? ({ publication: { mode: "public" } }) : ({ publication: { mode: "private" } }),
    cleanupNamespace: async () => undefined,
    restore: async () => undefined,
    writeRecoveryArtifact: async (artifact) => { evidence.push(artifact); },
  }, async () => undefined)).rejects.toThrow(/restoration mismatch/);
  expect(JSON.stringify(evidence)).not.toMatch(/token|credential|capability/i);
  await expect(runAuthorizedMusicMutation({
    lane: "live",
    liveWriteEnabled: true,
    baseUrl: "http://127.0.0.1:55173",
    serviceOrigins: ["http://127.0.0.1:55173"],
    accountDocumentId: "e2e-public-music-run-account",
    accountUsername: "e2e-public-music-run-owner",
    fixtureVersion: MUSIC_PUBLIC_FIXTURE_VERSION,
    confirmation: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
  }, "guest-controls", async () => undefined)).rejects.toThrow(/blocked after a restoration failure/);
  resetMusicRestoreBlockForContractTest();
});

test("a fresh worker observes the durable state-service latch before invoking a mutation", async () => {
  resetMusicRestoreBlockForContractTest();
  const previous = {
    write: process.env.MUSIC_E2E_LIVE_WRITE,
    url: process.env.MUSIC_E2E_STATE_SERVICE_URL,
    token: process.env.MUSIC_E2E_STATE_TOKEN,
  };
  const originalFetch = globalThis.fetch;
  let invoked = 0;
  try {
    process.env.MUSIC_E2E_LIVE_WRITE = "true";
    process.env.MUSIC_E2E_STATE_SERVICE_URL = "http://127.0.0.1:55174";
    process.env.MUSIC_E2E_STATE_TOKEN = "A".repeat(43);
    globalThis.fetch = async () => new Response(JSON.stringify({
      status: "ready",
      service: "music-e2e-state",
      mutationGuard: {
        version: "music-e2e-mutation-guard/v1", state: "blocked", reason: "restore-failed", stage: "restore",
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
    await expect(runAuthorizedMusicMutation({
      lane: "live", liveWriteEnabled: true, baseUrl: "http://127.0.0.1:55173",
      serviceOrigins: ["http://127.0.0.1:55000"],
      accountDocumentId: "e2e-public-music-run-account", accountUsername: "e2e-public-music-run-owner",
      fixtureVersion: MUSIC_PUBLIC_FIXTURE_VERSION,
      confirmation: "I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE",
    }, "guest-controls", async () => { invoked += 1; })).rejects.toThrow("MUSIC_MUTATION_BLOCKED");
    expect(invoked).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.write === undefined) delete process.env.MUSIC_E2E_LIVE_WRITE; else process.env.MUSIC_E2E_LIVE_WRITE = previous.write;
    if (previous.url === undefined) delete process.env.MUSIC_E2E_STATE_SERVICE_URL; else process.env.MUSIC_E2E_STATE_SERVICE_URL = previous.url;
    if (previous.token === undefined) delete process.env.MUSIC_E2E_STATE_TOKEN; else process.env.MUSIC_E2E_STATE_TOKEN = previous.token;
    resetMusicRestoreBlockForContractTest();
  }
});

test("real restoration failures retain a sanitized recovery artifact without custom wiring", async ({ browserName }, testInfo) => {
  expect(browserName).toBe("chromium");
  resetMusicRestoreBlockForContractTest();
  const artifactPath = testInfo.outputPath("music-recovery.json");
  const previousPath = process.env.MUSIC_E2E_RECOVERY_ARTIFACT_PATH;
  process.env.MUSIC_E2E_RECOVERY_ARTIFACT_PATH = artifactPath;
  let snapshots = 0;
  try {
    await expect(withRestoredMusicFixture({
      snapshot: async () => snapshots++ === 0
        ? ({ publication: { mode: "public" }, credential: "must-not-be-recorded" })
        : ({ publication: { mode: "private" }, credential: "must-not-be-recorded" }),
      cleanupNamespace: async () => undefined,
      restore: async () => undefined,
    }, async () => undefined)).rejects.toThrow(/restoration mismatch/);
    const artifact = readFileSync(artifactPath, "utf8");
    expect(JSON.parse(artifact)).toMatchObject({
      version: MUSIC_PUBLIC_FIXTURE_VERSION,
      reason: "restore-mismatch",
      beforeHash: expect.any(String),
      afterHash: expect.any(String),
    });
    expect(artifact).not.toMatch(/must-not-be-recorded|credential|token|capability/i);
  } finally {
    if (previousPath === undefined) delete process.env.MUSIC_E2E_RECOVERY_ARTIFACT_PATH;
    else process.env.MUSIC_E2E_RECOVERY_ARTIFACT_PATH = previousPath;
    resetMusicRestoreBlockForContractTest();
  }
});

async function loadPrebrowserQualificationContract(): Promise<Record<string, unknown>> {
  try {
    const modulePath: string = "../scripts/music-public-prebrowser-qualification.mjs";
    return await import(modulePath);
  } catch {
    return {};
  }
}

type QualificationSnapshot = {
  version: "music-live-account-snapshot/v1";
  snapshotId: string;
  profile: { accountDocumentId: string; publicMusic: boolean; profileRevision: number; profileHash: string; fieldCount: number };
  database: { namespace: string; dumpHash: string; identityRows: number };
};

function qualificationSnapshot(snapshotId: string, databaseHash: string, profileHash: string, profileRevision: number, identityRows: number): QualificationSnapshot {
  return {
    version: "music-live-account-snapshot/v1",
    snapshotId,
    profile: {
      accountDocumentId: "e2e-public-music-qualification-account",
      publicMusic: false,
      profileRevision,
      profileHash,
      fieldCount: 24,
    },
    database: {
      namespace: "e2e-public-music-qualification",
      dumpHash: databaseHash,
      identityRows,
    },
  };
}

function passingPrebrowserQualificationAdapter(events: string[]) {
  const populated = qualificationSnapshot("populated-snapshot", "b".repeat(64), "c".repeat(64), 3, 1);
  const publicPhase = qualificationSnapshot("public-snapshot", "d".repeat(64), "e".repeat(64), 4, 1);
  let snapshots = 0;
  return {
    ensureEphemeralOwner: async () => { events.push("identity-ensure"); return "header.payload.qualifier-signature"; },
    capture: async () => {
      events.push(`snapshot:${snapshots === 0 ? "populated" : "public"}`);
      return snapshots++ === 0 ? populated : publicPhase;
    },
    verifyRollbackProbe: async () => {
      events.push("rollback-probe");
      return { profileCapability: true, privateAuthority: true, staleRejected: true };
    },
    restore: async (snapshot: QualificationSnapshot) => {
      events.push(`restore:${snapshot.snapshotId}`);
      return {
        restored: true,
        beforeHash: snapshot.database.dumpHash,
        afterHash: snapshot.database.dumpHash,
        profileHash: snapshot.profile.profileHash,
        profileRevision: snapshot.profile.profileRevision,
      };
    },
    verifyPublicProfileAndMusic: async () => {
      events.push("public-profile-category-music");
      return { publicSlug: "actual-fixture-public-slug", categoryQueries: 18, musicPrerequisites: 9 };
    },
    restoreBaseline: async (snapshot: QualificationSnapshot) => {
      events.push("restore:initial-baseline");
      return {
        restored: true,
        beforeHash: snapshot.database.dumpHash,
        afterHash: snapshot.database.dumpHash,
        profileHash: snapshot.profile.profileHash,
        profileRevision: snapshot.profile.profileRevision,
      };
    },
    verifyEphemeralOwnerRetired: async (jwt: string) => {
      events.push("qualifier-jwt-retired");
      return jwt === "header.payload.qualifier-signature";
    },
    readGuard: async () => {
      events.push("guard-clear");
      return { version: "music-e2e-mutation-guard/v1", state: "clear", reason: "none", stage: "preflight" };
    },
  };
}

test("pre-browser qualifier proves populated rollback, public/category/music capability, JWT retirement, and returns only fixed safe metadata", async () => {
  const contract = await loadPrebrowserQualificationContract();
  const run = contract.runMusicPrebrowserQualification as undefined | ((input: {
    initialSnapshot: QualificationSnapshot;
    adapter: ReturnType<typeof passingPrebrowserQualificationAdapter>;
  }) => Promise<{ ok: boolean; record: Record<string, unknown>; qualifierJwtFingerprint?: string }>);
  expect(typeof run).toBe("function");
  if (!run) return;
  const events: string[] = [];
  const initial = qualificationSnapshot("initial-snapshot", "a".repeat(64), "f".repeat(64), 0, 0);
  const result = await run({ initialSnapshot: initial, adapter: passingPrebrowserQualificationAdapter(events) });

  expect(events).toEqual([
    "identity-ensure",
    "snapshot:populated",
    "rollback-probe",
    "restore:populated-snapshot",
    "snapshot:public",
    "public-profile-category-music",
    "restore:public-snapshot",
    "restore:initial-baseline",
    "qualifier-jwt-retired",
    "guard-clear",
  ]);
  expect(result).toMatchObject({
    ok: true,
    qualifierJwtFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    record: {
      schemaVersion: "explorers-public-prebrowser-qualification/v4",
      snapshotFailure: { phase: "none", stage: "none", code: "none" },
      publicFlowFailure: { stage: "none", code: "none" },
      publicFlowSubstage: "none",
      status: "passed",
      code: "none",
      checks: {
        populatedRollback: true,
        profileCapability: true,
        privateAuthority: true,
        staleRejected: true,
        publicProjection: true,
        musicPrerequisites: true,
        baselineRestored: true,
        ephemeralOwnerRetired: true,
        guardClear: true,
      },
      counts: { identityRows: 1, categoryQueries: 18, musicPrerequisites: 9 },
      hashes: {
        populatedDatabase: "b".repeat(64),
        rollbackDatabase: "b".repeat(64),
        populatedProfile: "c".repeat(64),
        rollbackProfile: "c".repeat(64),
        baselineDatabase: "a".repeat(64),
        restoredBaselineDatabase: "a".repeat(64),
        baselineProfile: "f".repeat(64),
        restoredBaselineProfile: "f".repeat(64),
        publicSlug: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      profileRevisions: { populated: 3, rollback: 3, baseline: 0, restoredBaseline: 0 },
    },
  });
  const retained = JSON.stringify(result.record);
  expect(retained).not.toMatch(/header\.payload|actual-fixture-public-slug|jwt|credential|authorization|token|snapshotId|path/i);
});

test("pre-browser qualifier distinguishes a valid populated snapshot with zero exact identity rows", async () => {
  const contract = await loadPrebrowserQualificationContract();
  const run = contract.runMusicPrebrowserQualification as undefined | ((input: {
    initialSnapshot: QualificationSnapshot;
    adapter: ReturnType<typeof passingPrebrowserQualificationAdapter>;
  }) => Promise<{ ok: boolean; record: Record<string, unknown> }>);
  expect(typeof run).toBe("function");
  if (!run) return;

  const events: string[] = [];
  const adapter = passingPrebrowserQualificationAdapter(events);
  adapter.capture = async () => {
    events.push("snapshot:populated");
    return qualificationSnapshot("populated-zero", "b".repeat(64), "c".repeat(64), 0, 0);
  };
  const result = await run({
    initialSnapshot: qualificationSnapshot("initial-snapshot", "a".repeat(64), "f".repeat(64), 0, 0),
    adapter,
  });

  expect(events).toEqual([
    "identity-ensure", "snapshot:populated", "restore:initial-baseline", "qualifier-jwt-retired", "guard-clear",
  ]);
  expect(result).toMatchObject({
    ok: false,
    record: {
      schemaVersion: "explorers-public-prebrowser-qualification/v4",
      status: "failed",
      code: "populated-identity-cardinality",
      snapshotFailure: { phase: "none", stage: "none", code: "none" },
      publicFlowFailure: { stage: "none", code: "none" },
      publicFlowSubstage: "none",
      counts: { identityRows: 0, categoryQueries: 0, musicPrerequisites: 0 },
    },
  });
});

test("loopback qualifier retains only fixed state-capture stage codes and rejects hostile response detail", async () => {
  const contract = await loadPrebrowserQualificationContract();
  const createAdapter = contract.createLoopbackPrebrowserQualificationAdapter as undefined | ((input: {
    authority: Record<string, unknown>;
    initialSnapshot: QualificationSnapshot;
    fetchImpl: typeof fetch;
  }) => ReturnType<typeof passingPrebrowserQualificationAdapter>);
  const run = contract.runMusicPrebrowserQualification as undefined | ((input: {
    initialSnapshot: QualificationSnapshot;
    adapter: ReturnType<typeof passingPrebrowserQualificationAdapter>;
  }) => Promise<{ ok: boolean; record: Record<string, unknown> }>);
  const runLoopback = contract.runLoopbackMusicPrebrowserQualification as undefined | ((input: {
    authority: Record<string, unknown>;
    initialSnapshot: QualificationSnapshot;
    fetchImpl: typeof fetch;
  }) => Promise<{ ok: boolean; record: Record<string, unknown> }>);
  expect(typeof createAdapter).toBe("function");
  expect(typeof run).toBe("function");
  expect(typeof runLoopback).toBe("function");
  if (!createAdapter || !run || !runLoopback) return;

  const initial = qualificationSnapshot("initial-snapshot", "a".repeat(64), "f".repeat(64), 0, 0);
  const authority = {
    stateOrigin: "http://127.0.0.1:55174",
    tunesOrigin: "http://127.0.0.1:55000",
    explorerOrigin: "http://localhost:55173",
    strapiOrigin: "http://127.0.0.1:51337",
    stateToken: "S".repeat(43), orchestrationToken: "O".repeat(43), fixtureToken: "F".repeat(43),
    namespace: "e2e-public-music-qualification",
    username: "e2e-public-music-qualification-owner",
    accountDocumentId: "e2e-public-music-qualification-account",
    userDocumentId: "e2e-public-music-qualification-user",
  };
  const hostile = "Bearer hostile.capture.value from C:\\Users\\private\\capture.json";
  const cases = [
    {
      status: 500,
      body: {
        schemaVersion: "music-e2e-state-capture-failure/v1",
        state: "failed", stage: "identity-count-query", code: "operation-failed",
      },
      failure: { phase: "populated", stage: "identity-count-query", code: "operation-failed" },
    },
    {
      status: 500,
      body: {
        schemaVersion: "music-e2e-state-capture-failure/v1",
        state: "failed", stage: "identity-count-query", code: "operation-failed", detail: hostile,
      },
      failure: { phase: "populated", stage: "snapshot-store", code: "contract-invalid" },
    },
    {
      status: 503,
      body: { error: hostile },
      failure: { phase: "populated", stage: "snapshot-store", code: "operation-failed" },
    },
  ] as const;

  for (const scenario of cases) {
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status, headers: { "content-type": "application/json" },
    });
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.pathname === "/api/music/identity/ensure") {
        return json({ identity: { status: "active" }, credential: { token: "header.payload.qualifier-signature" } });
      }
      if (url.pathname === "/snapshot") return json(scenario.body, scenario.status);
      if (url.pathname === "/restore-final") return json({
        restored: true, beforeHash: initial.database.dumpHash, afterHash: initial.database.dumpHash,
        profileHash: initial.profile.profileHash, profileRevision: initial.profile.profileRevision,
      });
      if (url.pathname === "/api/playlists") return json({ error: "retired" }, 401);
      if (url.pathname === "/health") return json({
        status: "ready", service: "music-e2e-state",
        mutationGuard: { version: "music-e2e-mutation-guard/v1", state: "clear", reason: "none", stage: "preflight" },
      });
      throw new Error(hostile);
    };
    const result = await run({ initialSnapshot: initial, adapter: createAdapter({ authority, initialSnapshot: initial, fetchImpl }) });
    expect(result).toMatchObject({
      ok: false,
      record: {
        schemaVersion: "explorers-public-prebrowser-qualification/v4",
        status: "failed",
        code: "populated-snapshot-failed",
        snapshotFailure: scenario.failure,
        publicFlowFailure: { stage: "none", code: "none" },
        publicFlowSubstage: "none",
      },
    });
    expect(JSON.stringify(result.record)).not.toMatch(/hostile|Bearer|C:\\Users|detail|path|token|authorization/i);
  }
});

test("loopback qualifier adapter exercises exact fixture profile, stale, public category, and seeded Music protocols without persisting owner authority", async () => {
  const contract = await loadPrebrowserQualificationContract();
  const createAdapter = contract.createLoopbackPrebrowserQualificationAdapter as undefined | ((input: {
    authority: Record<string, unknown>;
    initialSnapshot: QualificationSnapshot;
    fetchImpl: typeof fetch;
  }) => ReturnType<typeof passingPrebrowserQualificationAdapter>);
  const run = contract.runMusicPrebrowserQualification as undefined | ((input: {
    initialSnapshot: QualificationSnapshot;
    adapter: ReturnType<typeof passingPrebrowserQualificationAdapter>;
  }) => Promise<{ ok: boolean; record: Record<string, unknown> }>);
  const runLoopback = contract.runLoopbackMusicPrebrowserQualification as undefined | ((input: {
    authority: Record<string, unknown>;
    initialSnapshot: QualificationSnapshot;
    fetchImpl: typeof fetch;
  }) => Promise<{ ok: boolean; record: Record<string, unknown> }>);
  expect(typeof createAdapter).toBe("function");
  expect(typeof run).toBe("function");
  expect(typeof runLoopback).toBe("function");
  if (!createAdapter || !run || !runLoopback) return;

  const initial = qualificationSnapshot("initial-snapshot", "a".repeat(64), "f".repeat(64), 0, 0);
  const populated = qualificationSnapshot("populated-snapshot", "b".repeat(64), "c".repeat(64), 3, 1);
  const publicPhase = qualificationSnapshot("public-snapshot", "d".repeat(64), "e".repeat(64), 4, 1);
  const ownerJwt = "qualifier.header.ephemeral-owner";
  const calls: Array<{
    origin: string; path: string; method: string; operation?: string;
    expectedRevision?: string; idempotencyKey?: string; publicationMode?: string; ownerAuthorized?: boolean;
  }> = [];
  let snapshotCount = 0;
  let playlistId = 40;
  let songId = 100;
  let playbackCalls = 0;
  const playbackSongIds: number[] = [];
  let baselineRestored = false;
  let directRevisionWrites = 0;
  let injectedPublicFailureStage: string | undefined;
  let injectedPublicFailureCode: "http-failed" | "contract-invalid" | "operation-failed" | "operation-timeout" = "http-failed";
  let publicFlowStarted = false;
  let savedPublicCalls = 0;
  let playbackPublicCalls = 0;
  let publicationMode: "private" | "unlisted" | "public" = "unlisted";
  let ownerTransitionMutation: "version" | "mode" | "slug" | "extra" | undefined;
  let ownerDashboardMutation:
    | "mode" | "queue-revision" | "playback-revision" | "slug"
    | "songs" | "currently-playing" | "played-songs"
    | "allow-song-requests" | "allow-guest-play-on-device" | "allow-playlist-sharing"
    | "allow-recently-played-visibility" | "allow-queue-visibility"
    | undefined;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { "content-type": "application/json" },
  });
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = init.method ?? (input instanceof Request ? input.method : "GET");
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    const rawBody = typeof init.body === "string" ? init.body : "";
    const decoded = rawBody ? JSON.parse(rawBody) as Record<string, any> : {};
    const operation = typeof decoded.query === "string"
      ? /(?:query|mutation)\s+([A-Za-z0-9_]+)/.exec(decoded.query)?.[1]
      : undefined;
    calls.push({
      origin: url.origin, path: url.pathname, method, operation,
      expectedRevision: headers.get("x-music-fixture-expected-revision") ?? undefined,
      idempotencyKey: headers.get("idempotency-key") ?? undefined,
      publicationMode: typeof decoded.mode === "string" ? decoded.mode : undefined,
      ownerAuthorized: url.origin === "http://127.0.0.1:55000"
        ? headers.get("authorization") === `Bearer ${ownerJwt}`
        : undefined,
    });

    let publicStage: string | undefined;
    if (operation === "UpdateAccount" && decoded.variables?.data?.public_profile === "Yes") {
      publicFlowStarted = true;
      publicStage = "visibility";
    } else if (publicFlowStarted) {
      if (url.pathname === "/api/music/publication" && decoded.mode === "private") publicStage = "owner";
      else if (url.pathname === "/api/music/dashboard") publicStage = "owner";
      else if (url.pathname === "/api/playlists" && method === "POST") publicStage = "playlist";
      else if (/^\/api\/playlists\/\d+\/songs$/.test(url.pathname)) publicStage = `saved-song-${++savedPublicCalls}`;
      else if (/^\/api\/playlists\/\d+\/visibility$/.test(url.pathname)) publicStage = "playlist-visible";
      else if (url.pathname === "/api/music/queue/replace") publicStage = "queue";
      else if (url.pathname === "/api/playlist/currently-playing") publicStage = `playback-${++playbackPublicCalls}`;
      else if (url.pathname === "/api/music/guest-controls") publicStage = "controls";
      else if (url.pathname === "/api/music/publication") publicStage = "publication";
      else if (url.pathname === "/api/explorers/v1/profiles/e2e-public-music-qualification-owner") {
        publicStage = `${url.origin === "http://127.0.0.1:51337" ? "direct" : "proxy"}-public-profile`;
      } else if (url.pathname.startsWith("/api/explorers/v1/profiles/e2e-public-music-qualification-owner/recommendations/")) {
        const category = url.pathname.split("/").at(-1);
        publicStage = `${url.origin === "http://127.0.0.1:51337" ? "direct" : "proxy"}-public-category-${category}`;
      } else if (url.pathname.startsWith("/api/music/public-resource/v1/")) {
        publicStage = url.origin === "http://127.0.0.1:55000" ? "direct-public-music" : "proxy-public-music";
      }
    }
    if (injectedPublicFailureStage !== undefined && publicStage === injectedPublicFailureStage) {
      if (injectedPublicFailureCode === "contract-invalid") return json({ revision: 1 }, 200);
      if (injectedPublicFailureCode === "operation-failed") {
        throw new Error("Bearer hostile.public.failure from C:\\Users\\private\\response.json");
      }
      if (injectedPublicFailureCode === "operation-timeout") {
        const timeout = new Error("Bearer hostile.public.timeout from C:\\Users\\private\\response.json");
        timeout.name = "TimeoutError";
        throw timeout;
      }
      return json({ error: "Bearer hostile.public.failure from C:\\Users\\private\\response.json" }, 503);
    }

    if (url.origin === "http://127.0.0.1:55174" && url.pathname === "/snapshot") {
      return json(snapshotCount++ === 0 ? populated : publicPhase);
    }
    if (url.origin === "http://127.0.0.1:55174" && url.pathname === "/restore") {
      const snapshot = decoded as unknown as QualificationSnapshot;
      return json({ restored: true, beforeHash: snapshot.database.dumpHash, afterHash: snapshot.database.dumpHash,
        profileHash: snapshot.profile.profileHash, profileRevision: snapshot.profile.profileRevision });
    }
    if (url.origin === "http://127.0.0.1:55174" && url.pathname === "/restore-final") {
      baselineRestored = true;
      return json({ restored: true, beforeHash: initial.database.dumpHash, afterHash: initial.database.dumpHash,
        profileHash: initial.profile.profileHash, profileRevision: initial.profile.profileRevision });
    }
    if (url.origin === "http://127.0.0.1:55174" && url.pathname === "/health") {
      return json({ status: "ready", service: "music-e2e-state",
        mutationGuard: { version: "music-e2e-mutation-guard/v1", state: "clear", reason: "none", stage: "preflight" } });
    }
    if (url.origin === "http://127.0.0.1:55000" && url.pathname === "/api/music/identity/ensure") {
      return json({ identity: { status: "active" }, credential: { token: ownerJwt } });
    }
    if (url.pathname === "/__music-fixture/profile-state/snapshot") {
      const exactTuple = decoded.namespace === "e2e-public-music-qualification"
        && decoded.username === "e2e-public-music-qualification-owner"
        && decoded.accountDocumentId === "e2e-public-music-qualification-account"
        && decoded.userDocumentId === "e2e-public-music-qualification-user";
      if (headers.get("authorization") !== `Bearer ${"F".repeat(43)}` || !exactTuple) return json({ error: "denied" }, 403);
      return json({ version: "music-fixture-profile-state/v1", revision: 3, stateHash: "c".repeat(64),
        snapshot: { version: "music-fixture-profile-snapshot/v1", revision: 3, account: { documentId: "e2e-public-music-qualification-account" } } });
    }
    if (url.pathname === "/__music-fixture/profile-state/restore") {
      return headers.get("authorization") === `Bearer ${"F".repeat(43)}`
        ? json({ version: "music-fixture-profile-state/v1", restored: true, revision: 3, stateHash: "c".repeat(64) })
        : json({ error: "denied" }, 403);
    }
    if (url.pathname === "/graphql") {
      if (headers.has("x-music-fixture-expected-revision")) {
        if (url.origin === "http://localhost:55173") return json({ error: "revision authority denied" }, 403);
        directRevisionWrites += 1;
        if (directRevisionWrites === 2) return json({ error: "fixture profile revision stale" }, 409);
      }
      if (operation === "UpdateAccount") return json({ data: { updateAccount: {
        documentId: "e2e-public-music-qualification-account",
        Bio: decoded.variables?.data?.Bio,
        public_profile: decoded.variables?.data?.public_profile ?? "Yes",
        public_recommendations: decoded.variables?.data?.public_recommendations ?? "Yes",
        public_music: decoded.variables?.data?.public_music ?? "Yes",
      } } });
      if (operation === "UsersPermissionsUser") return json({ data: { usersPermissionsUser: {
        documentId: "e2e-public-music-qualification-user", username: "e2e-public-music-qualification-owner",
        accounts: [{ documentId: "e2e-public-music-qualification-account", Bio: "fixture", updatedAt: "2026-08-29T00:00:03.000Z" }],
      } } });
      if (operation === "PublicProfileData" || operation === "PublicAccountBasic") return json({ data: { accounts: [{
        documentId: "e2e-public-music-qualification-account", username: "e2e-public-music-qualification-owner",
        Account_Name: "Fixture Explorer",
        public_profile: "Yes", public_recommendations: "Yes", public_music: "Yes",
      }] } });
      const categoryDefinitions: Record<string, { root: string; subject: string; contentKey: string }> = {
        GetPlacesLists: { root: "recommendationLists", subject: "places", contentKey: "recommended_places" },
        GetMoviesLists: { root: "movieLists", subject: "movies", contentKey: "recommended_movies" },
        GetBooksLists: { root: "bookLists", subject: "books", contentKey: "recommended_books" },
        GetGamesLists: { root: "gameLists", subject: "games", contentKey: "recommended_games" },
        GetAppsLists: { root: "appLists", subject: "apps", contentKey: "recommended_apps" },
        GetProductsLists: { root: "productLists", subject: "products", contentKey: "recommended_products" },
        GetPeopleLists: { root: "personLists", subject: "people", contentKey: "recommended_people" },
        GetGuidesLists: { root: "guides", subject: "guides", contentKey: "Title" },
      };
      if (operation === "PublicCategoryListCounts") return json({ data: Object.fromEntries(
        Object.values(categoryDefinitions).map(({ root }) => [root, [{ documentId: `e2e-public-music-qualification-${root}-count` }]]),
      ) });
      const category = operation ? categoryDefinitions[operation] : undefined;
      if (category) {
        const documentId = `e2e-public-music-qualification-${category.subject}-list`;
        return json({ data: { [category.root]: [{
          documentId,
          ...(category.contentKey === "Title"
            ? { Title: "Fixture Guide" }
            : { [category.contentKey]: [{ documentId: `${documentId}-item` }] }),
        }] } });
      }
      return json({ error: "unknown operation" }, 403);
    }
    const gatewayPrefix = "/api/explorers/v1/profiles/e2e-public-music-qualification-owner";
    if (["http://127.0.0.1:51337", "http://localhost:55173"].includes(url.origin) && url.pathname === gatewayPrefix) {
      return json({
        documentId: "e2e-public-music-qualification-account", username: "e2e-public-music-qualification-owner",
        Account_Name: "Fixture Explorer", public_profile: "Yes", public_recommendations: "Yes", public_music: "Yes",
      });
    }
    const gatewayCategory = url.pathname.startsWith(`${gatewayPrefix}/recommendations/`)
      ? url.pathname.slice(`${gatewayPrefix}/recommendations/`.length)
      : undefined;
    const gatewayDefinitions: Record<string, { root: string; contentKey: string }> = {
      places: { root: "recommendationLists", contentKey: "recommended_places" },
      movies: { root: "movieLists", contentKey: "recommended_movies" },
      books: { root: "bookLists", contentKey: "recommended_books" },
      games: { root: "gameLists", contentKey: "recommended_games" },
      apps: { root: "appLists", contentKey: "recommended_apps" },
      products: { root: "productLists", contentKey: "recommended_products" },
      people: { root: "personLists", contentKey: "recommended_people" },
      guides: { root: "guides", contentKey: "Title" },
    };
    if (gatewayCategory && gatewayDefinitions[gatewayCategory]) {
      const { root, contentKey } = gatewayDefinitions[gatewayCategory];
      const documentId = `e2e-public-music-qualification-${gatewayCategory}-list`;
      return json({ [root]: [{ documentId, ...(contentKey === "Title"
        ? { Title: "Fixture Guide" }
        : { [contentKey]: [{ documentId: `${documentId}-item` }] }) }] });
    }
    if (url.origin === "http://127.0.0.1:55000" && url.pathname === "/api/playlists" && method === "POST") {
      return json({ id: ++playlistId, name: decoded.name }, 201);
    }
    if (url.origin === "http://127.0.0.1:55000" && url.pathname === "/api/playlists" && method === "GET") {
      return baselineRestored ? json({ error: "retired" }, 401) : json([]);
    }
    if (/^\/api\/playlists\/\d+\/songs$/.test(url.pathname)) return json({ id: ++songId }, 201);
    if (/^\/api\/playlists\/\d+\/visibility$/.test(url.pathname)) return new Response(null, { status: 204 });
    if (url.pathname === "/api/music/dashboard") {
      const dashboard = {
        queueRevision: ownerDashboardMutation === "queue-revision" ? 1 : 0,
        playbackRevision: ownerDashboardMutation === "playback-revision" ? 1 : 0,
        songs: ownerDashboardMutation === "songs" ? [{ id: 1 }] : [],
        currentlyPlaying: ownerDashboardMutation === "currently-playing" ? { id: 1 } : null,
        playedSongs: ownerDashboardMutation === "played-songs" ? [{ id: 1 }] : [],
        publication: {
          mode: ownerDashboardMutation === "mode" ? "unlisted" : publicationMode,
          publicSlug: ownerDashboardMutation === "slug" ? "different-qualified-public-slug" : "actual-qualified-public-slug",
        },
        guestControls: {
          allowSongRequests: ownerDashboardMutation === "allow-song-requests" ? false : true,
          allowGuestPlayOnDevice: ownerDashboardMutation === "allow-guest-play-on-device" ? false : true,
          allowPlaylistSharing: ownerDashboardMutation === "allow-playlist-sharing" ? true : false,
          allowRecentlyPlayedVisibility: ownerDashboardMutation === "allow-recently-played-visibility" ? false : true,
          allowQueueVisibility: ownerDashboardMutation === "allow-queue-visibility" ? true : false,
        },
      };
      return json(dashboard);
    }
    if (url.pathname === "/api/music/queue/replace") return json({
      version: "music-queue/v1",
      revision: 1,
      songs: [
        { id: 901, userId: 501, youtubeId: "abcdefghijk", title: "Fixture history song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png", position: 0, status: "queued", playedAt: null },
        { id: 902, userId: 501, youtubeId: "lmnopqrstuv", title: "Fixture playing song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png", position: 1, status: "queued", playedAt: null },
        { id: 903, userId: 501, youtubeId: "wxyzABC1234", title: "Fixture queued song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png", position: 2, status: "queued", playedAt: null },
      ],
    });
    if (url.pathname === "/api/playlist/currently-playing") {
      const queueSongId = decoded.songId;
      if (![901, 902].includes(queueSongId)) return json({ error: "queue song not found" }, 404);
      playbackSongIds.push(queueSongId);
      const queueSong = [
        { id: 901, userId: 501, youtubeId: "abcdefghijk", title: "Fixture history song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png", position: 0, status: "queued", playedAt: null },
        { id: 902, userId: 501, youtubeId: "lmnopqrstuv", title: "Fixture playing song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png", position: 1, status: "queued", playedAt: null },
      ].find(({ id }) => id === queueSongId);
      return json({ version: "music-playback/v1", revision: 2 + playbackCalls, playbackRevision: ++playbackCalls, song: queueSong });
    }
    if (url.pathname === "/api/music/guest-controls") return json({
      allowSongRequests: true, allowGuestPlayOnDevice: true, allowPlaylistSharing: true,
      allowRecentlyPlayedVisibility: true, allowQueueVisibility: true,
    });
    if (url.pathname === "/api/music/publication" && ["private", "public"].includes(decoded.mode)) {
      publicationMode = decoded.mode;
      const response: Record<string, unknown> = {
        version: ownerTransitionMutation === "version" && decoded.mode === "private"
          ? "music-publication/v0"
          : "music-publication/v1",
        publication: {
          mode: ownerTransitionMutation === "mode" && decoded.mode === "private" ? "unlisted" : decoded.mode,
          publicSlug: ownerTransitionMutation === "slug" && decoded.mode === "private"
            ? "short"
            : "actual-qualified-public-slug",
        },
      };
      if (ownerTransitionMutation === "extra" && decoded.mode === "private") response.debug = "must-not-be-accepted";
      return json(response);
    }
    if (url.pathname === "/api/music/public-resource/v1/actual-qualified-public-slug") return json({
      version: "music-public-resource/v1",
      currentlyPlaying: { title: "Fixture playing song" },
      queue: { items: [{ title: "Fixture queued song" }] },
      recentlyPlayed: { items: [{ title: "Fixture history song" }] },
      playlists: { items: [{ name: "Pre-browser public fixture" }] },
      permissions: {
        allowSongRequests: true, allowGuestPlayOnDevice: true, allowPlaylistSharing: true,
        allowRecentlyPlayedVisibility: true, allowQueueVisibility: true,
      },
    });
    return json({ error: "unexpected fixture request" }, 404);
  };

  const authority = {
    stateOrigin: "http://127.0.0.1:55174",
    tunesOrigin: "http://127.0.0.1:55000",
    explorerOrigin: "http://localhost:55173",
    strapiOrigin: "http://127.0.0.1:51337",
    stateToken: "S".repeat(43),
    orchestrationToken: "O".repeat(43),
    fixtureToken: "F".repeat(43),
    namespace: "e2e-public-music-qualification",
    username: "e2e-public-music-qualification-owner",
    accountDocumentId: "e2e-public-music-qualification-account",
    userDocumentId: "e2e-public-music-qualification-user",
  };
  const result = await runLoopback({ authority, initialSnapshot: initial, fetchImpl });
  expect(result, JSON.stringify(result.record)).toMatchObject({ ok: true, record: { status: "passed", counts: { categoryQueries: 18, musicPrerequisites: 9 } } });
  expect(result.record).toMatchObject({
    schemaVersion: "explorers-public-prebrowser-qualification/v4",
    publicFlowFailure: { stage: "none", code: "none" },
    publicFlowSubstage: "none",
  });
  expect(calls.filter(({ operation }) => operation === "UsersPermissionsUser")).toHaveLength(2);
  expect(calls.filter(({ path }) => path === "/api/explorers/v1/profiles/e2e-public-music-qualification-owner"
    || path.startsWith("/api/explorers/v1/profiles/e2e-public-music-qualification-owner/recommendations/")))
    .toHaveLength(18);
  expect(calls.filter(({ expectedRevision }) => expectedRevision !== undefined)).toEqual(expect.arrayContaining([
    expect.objectContaining({ origin: "http://127.0.0.1:51337", operation: "UpdateAccount", expectedRevision: "3" }),
    expect.objectContaining({ origin: "http://localhost:55173", operation: "UpdateAccount", expectedRevision: "3" }),
  ]));
  const publicationCalls = calls.filter(({ path, method }) => path === "/api/music/publication" && method === "POST");
  expect(publicationCalls).toHaveLength(2);
  expect(publicationCalls).toEqual([
    expect.objectContaining({
      publicationMode: "private", ownerAuthorized: true,
      idempotencyKey: expect.stringMatching(/^tunes-share-v1-\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    }),
    expect.objectContaining({
      publicationMode: "public", ownerAuthorized: true,
      idempotencyKey: expect.stringMatching(/^tunes-share-v1-\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    }),
  ]);
  expect(publicationCalls[0].idempotencyKey).not.toBe(publicationCalls[1].idempotencyKey);
  expect(calls.findIndex(({ path, publicationMode: mode }) => path === "/api/music/publication" && mode === "private"))
    .toBeLessThan(calls.findIndex(({ path }) => path === "/api/music/dashboard"));
  expect(calls.filter(({ path }) => path === "/api/music/public-resource/v1/actual-qualified-public-slug"))
    .toEqual(expect.arrayContaining([
      expect.objectContaining({ origin: "http://127.0.0.1:55000" }),
      expect.objectContaining({ origin: "http://localhost:55173" }),
    ]));
  expect(playbackSongIds).toEqual([901, 902]);
  expect(playbackSongIds).not.toEqual([101, 102]);
  expect(JSON.stringify(result.record)).not.toContain(ownerJwt);

  for (const code of ["http-failed", "contract-invalid"] as const) {
    snapshotCount = 0;
    playlistId = 40;
    songId = 100;
    playbackCalls = 0;
    playbackSongIds.length = 0;
    baselineRestored = false;
    directRevisionWrites = 0;
    publicFlowStarted = false;
    savedPublicCalls = 0;
    playbackPublicCalls = 0;
    publicationMode = "unlisted";
    ownerTransitionMutation = undefined;
    ownerDashboardMutation = undefined;
    injectedPublicFailureStage = "owner";
    injectedPublicFailureCode = code;
    const callStart = calls.length;
    const failed = await runLoopback({ authority, initialSnapshot: initial, fetchImpl });
    const runCalls = calls.slice(callStart);
    expect(failed).toMatchObject({
      ok: false,
      record: {
        code: "public-flow-failed",
        publicFlowFailure: { stage: "owner", code },
        publicFlowSubstage: "transition-response",
        checks: { baselineRestored: true, ephemeralOwnerRetired: true, guardClear: true },
      },
    });
    expect(runCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/api/music/publication", method: "POST", publicationMode: "private", ownerAuthorized: true }),
    ]));
    const ownerCallIndex = runCalls.findIndex(({ path, publicationMode: mode }) => path === "/api/music/publication" && mode === "private");
    expect(ownerCallIndex).toBeGreaterThanOrEqual(0);
    expect(runCalls.slice(ownerCallIndex + 1).some(({ path, method }) => path === "/api/playlists" && method === "POST")).toBe(false);
    expect(JSON.stringify(failed.record)).not.toMatch(/hostile|Bearer|C:\\Users|response\.json|https?:\/\//i);
  }
  injectedPublicFailureStage = undefined;

  for (const mutation of ["version", "mode", "slug", "extra"] as const) {
    snapshotCount = 0;
    baselineRestored = false;
    directRevisionWrites = 0;
    publicFlowStarted = false;
    savedPublicCalls = 0;
    playbackPublicCalls = 0;
    publicationMode = "unlisted";
    ownerTransitionMutation = mutation;
    ownerDashboardMutation = undefined;
    const callStart = calls.length;
    const failed = await runLoopback({ authority, initialSnapshot: initial, fetchImpl });
    const runCalls = calls.slice(callStart);
    expect(failed).toMatchObject({
      ok: false,
      record: {
        code: "public-flow-failed",
        publicFlowFailure: { stage: "owner", code: "contract-invalid" },
        publicFlowSubstage: "transition-response",
        checks: { baselineRestored: true, ephemeralOwnerRetired: true, guardClear: true },
      },
    });
    const ownerCallIndex = runCalls.findIndex(({ path, publicationMode: mode }) => path === "/api/music/publication" && mode === "private");
    expect(ownerCallIndex).toBeGreaterThanOrEqual(0);
    expect(runCalls.slice(ownerCallIndex + 1).some(({ path, method }) => path === "/api/playlists" && method === "POST")).toBe(false);
  }
  ownerTransitionMutation = undefined;

  for (const mutation of [
    "mode", "queue-revision", "playback-revision", "slug", "songs", "currently-playing", "played-songs",
    "allow-song-requests", "allow-guest-play-on-device", "allow-playlist-sharing",
    "allow-recently-played-visibility", "allow-queue-visibility",
  ] as const) {
    snapshotCount = 0;
    baselineRestored = false;
    directRevisionWrites = 0;
    publicFlowStarted = false;
    savedPublicCalls = 0;
    playbackPublicCalls = 0;
    publicationMode = "unlisted";
    ownerDashboardMutation = mutation;
    const callStart = calls.length;
    const failed = await runLoopback({ authority, initialSnapshot: initial, fetchImpl });
    const runCalls = calls.slice(callStart);
    expect(failed).toMatchObject({
      ok: false,
      record: {
        code: "public-flow-failed",
        publicFlowFailure: { stage: "owner", code: "contract-invalid" },
        publicFlowSubstage: "dashboard-response",
        checks: { baselineRestored: true, ephemeralOwnerRetired: true, guardClear: true },
      },
    });
    expect(runCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/api/music/publication", publicationMode: "private", ownerAuthorized: true }),
      expect.objectContaining({ path: "/api/music/dashboard", ownerAuthorized: true }),
    ]));
    const dashboardCallIndex = runCalls.findIndex(({ path }) => path === "/api/music/dashboard");
    expect(dashboardCallIndex).toBeGreaterThanOrEqual(0);
    expect(runCalls.slice(dashboardCallIndex + 1).some(({ path, method }) => path === "/api/playlists" && method === "POST")).toBe(false);
  }
  ownerDashboardMutation = undefined;

  for (const stage of EXPECTED_PREBROWSER_PUBLIC_FLOW_STAGES) {
    snapshotCount = 0;
    playlistId = 40;
    songId = 100;
    playbackCalls = 0;
    playbackSongIds.length = 0;
    baselineRestored = false;
    directRevisionWrites = 0;
    publicFlowStarted = false;
    savedPublicCalls = 0;
    playbackPublicCalls = 0;
    publicationMode = "unlisted";
    ownerTransitionMutation = undefined;
    ownerDashboardMutation = undefined;
    injectedPublicFailureStage = stage;
    injectedPublicFailureCode = "http-failed";
    const failed = await runLoopback({ authority, initialSnapshot: initial, fetchImpl });
    expect(failed).toMatchObject({
      ok: false,
      record: {
        status: "failed",
        code: "public-flow-failed",
        publicFlowFailure: { stage, code: "http-failed" },
        publicFlowSubstage: stage === "owner" ? "transition-response" : "none",
      },
    });
    expect(JSON.stringify(failed.record)).not.toMatch(/hostile|Bearer|C:\\Users|response\.json|https?:\/\//i);
  }
  injectedPublicFailureStage = undefined;

  for (const code of ["contract-invalid", "operation-failed", "operation-timeout"] as const) {
    snapshotCount = 0;
    playlistId = 40;
    songId = 100;
    playbackCalls = 0;
    playbackSongIds.length = 0;
    baselineRestored = false;
    directRevisionWrites = 0;
    publicFlowStarted = false;
    savedPublicCalls = 0;
    playbackPublicCalls = 0;
    publicationMode = "unlisted";
    ownerTransitionMutation = undefined;
    ownerDashboardMutation = undefined;
    injectedPublicFailureStage = "queue";
    injectedPublicFailureCode = code;
    const failed = await runLoopback({ authority, initialSnapshot: initial, fetchImpl });
    expect(failed).toMatchObject({
      ok: false,
      record: {
        code: "public-flow-failed",
        publicFlowFailure: { stage: "queue", code },
        publicFlowSubstage: "none",
      },
    });
    expect(JSON.stringify(failed.record)).not.toMatch(/hostile|Bearer|C:\\Users|response\.json|https?:\/\//i);
  }
  injectedPublicFailureStage = undefined;

  snapshotCount = 0;
  playlistId = 40;
  songId = 100;
  playbackCalls = 0;
  playbackSongIds.length = 0;
  baselineRestored = false;
  directRevisionWrites = 0;
  publicFlowStarted = false;
  savedPublicCalls = 0;
  playbackPublicCalls = 0;
  publicationMode = "unlisted";
  ownerTransitionMutation = undefined;
  ownerDashboardMutation = undefined;
  injectedPublicFailureCode = "http-failed";
  const c14 = await import("../scripts/music-public-prebrowser-c14.mjs");
  let publicCapabilityProbeCalls = 0;
  const c14Outcome = await c14.runMusicPrebrowserC14Integration({
    ack: c14.MUSIC_PREBROWSER_C14_ACK,
    authority,
    initialSnapshot: initial,
    fetchImpl,
    publicCapabilityProbe: ({ publicSlug }: { publicSlug: string }) => {
      publicCapabilityProbeCalls += 1;
      expect(publicSlug).toBe("actual-qualified-public-slug");
      expect(baselineRestored).toBe(false);
      return true;
    },
  });
  expect(publicCapabilityProbeCalls).toBe(1);
  expect(baselineRestored).toBe(true);
  expect(c14Outcome).toMatchObject({
    schemaVersion: "explorers-public-prebrowser-c14/v1",
    status: "passed",
    counts: { graphqlOperations: 20, publicMusicResources: 2, queueSongs: 3 },
    qualification: {
      status: "passed",
      schemaVersion: "explorers-public-prebrowser-qualification/v4",
      publicFlowSubstage: "none",
      checks: { baselineRestored: true, ephemeralOwnerRetired: true, guardClear: true },
    },
  });
});

test("pre-browser public failures retain one exact boundary and fixed safe code for all 34 operations", async () => {
  // Production break caught: a public preflight failure collapses to one coarse
  // code, names a wrong request boundary, or retains raw response/error detail.
  const contract = await loadPrebrowserQualificationContract();
  const run = contract.runMusicPrebrowserQualification as undefined | ((input: {
    initialSnapshot: QualificationSnapshot;
    adapter: ReturnType<typeof passingPrebrowserQualificationAdapter>;
  }) => Promise<{ ok: boolean; record: Record<string, unknown> }>);
  const createFailure = contract.createMusicPrebrowserPublicFlowFailure as undefined | ((
    stage: string, code: string, substage?: string,
  ) => Error);
  expect(contract.MUSIC_PREBROWSER_PUBLIC_FLOW_STAGES).toEqual(EXPECTED_PREBROWSER_PUBLIC_FLOW_STAGES);
  expect(contract.MUSIC_PREBROWSER_PUBLIC_FLOW_FAILURE_CODES)
    .toEqual(EXPECTED_PREBROWSER_PUBLIC_FLOW_FAILURE_CODES);
  expect(contract.MUSIC_PREBROWSER_PUBLIC_FLOW_SUBSTAGES)
    .toEqual(EXPECTED_PREBROWSER_PUBLIC_FLOW_SUBSTAGES);
  expect(typeof run).toBe("function");
  expect(typeof createFailure).toBe("function");
  if (!run || !createFailure) return;

  for (const stage of EXPECTED_PREBROWSER_PUBLIC_FLOW_STAGES) {
    const events: string[] = [];
    const adapter = passingPrebrowserQualificationAdapter(events);
    const publicFlowSubstage = stage === "owner" ? "transition-response" : "none";
    adapter.verifyPublicProfileAndMusic = async () => {
      throw createFailure(stage, "operation-failed", publicFlowSubstage);
    };
    const result = await run({
      initialSnapshot: qualificationSnapshot("initial-snapshot", "a".repeat(64), "f".repeat(64), 0, 0),
      adapter,
    });
    expect(result).toMatchObject({
      ok: false,
      record: {
        schemaVersion: "explorers-public-prebrowser-qualification/v4",
        status: "failed",
        code: "public-flow-failed",
        publicFlowFailure: { stage, code: "operation-failed" },
        publicFlowSubstage,
      },
    });
    expect(JSON.stringify(result.record)).not.toMatch(/Bearer|C:\\Users|https?:\/\/|detail|body|statusText/i);
  }

  for (const [index, code] of EXPECTED_PREBROWSER_PUBLIC_FLOW_FAILURE_CODES.entries()) {
    const adapter = passingPrebrowserQualificationAdapter([]);
    const stage = EXPECTED_PREBROWSER_PUBLIC_FLOW_STAGES[index];
    const publicFlowSubstage = stage === "owner" ? "dashboard-response" : "none";
    adapter.verifyPublicProfileAndMusic = async () => {
      throw createFailure(stage, code, publicFlowSubstage);
    };
    const result = await run({
      initialSnapshot: qualificationSnapshot("initial-snapshot", "a".repeat(64), "f".repeat(64), 0, 0),
      adapter,
    });
    expect(result).toMatchObject({
      ok: false,
      record: { code: "public-flow-failed", publicFlowFailure: { code }, publicFlowSubstage },
    });
  }

  expect(() => createFailure("owner", "contract-invalid", "none")).toThrow();
  expect(() => createFailure("queue", "contract-invalid", "transition-response")).toThrow();
  expect(() => createFailure("owner", "contract-invalid", "unknown")).toThrow();
});

test("pre-browser queue qualification accepts only three ordered queue-domain rows", async () => {
  // Production break caught: queue qualification accepts only a revision,
  // reuses saved-song IDs, or loses the returned queue order/identity domain.
  const contract = await loadPrebrowserQualificationContract();
  const validate = contract.validateMusicQualificationQueueResponse as undefined | ((
    value: unknown, songInputs: readonly Record<string, unknown>[], priorRevision: number,
  ) => undefined | { revision: number; queueSongIds: number[] });
  expect(typeof validate).toBe("function");
  if (!validate) return;

  const songInputs = [
    { youtubeId: "abcdefghijk", title: "Fixture history song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png" },
    { youtubeId: "lmnopqrstuv", title: "Fixture playing song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png" },
    { youtubeId: "wxyzABC1234", title: "Fixture queued song", artist: "Fixture artist", thumbnailUrl: "http://localhost:55173/images/tuneslogo.png" },
  ];
  const queueSongs = songInputs.map((song, index) => ({
    id: 901 + index,
    userId: 501,
    ...song,
    position: index,
    status: "queued",
    playedAt: null,
  }));
  const valid = { version: "music-queue/v1", revision: 8, songs: queueSongs };
  expect(validate(valid, songInputs, 7)).toEqual({ revision: 8, queueSongIds: [901, 902, 903] });
  expect(validate(valid, songInputs, 7)?.queueSongIds).not.toEqual([101, 102, 103]);
  expect(validate(valid, songInputs.slice(0, 2), 7)).toBeUndefined();

  for (const hostile of [
    { revision: 8 },
    { ...valid, songs: queueSongs.slice(0, 2) },
    { ...valid, songs: [queueSongs[1], queueSongs[0], queueSongs[2]] },
    { ...valid, songs: [{ ...queueSongs[0] }, { ...queueSongs[1], id: 901 }, queueSongs[2]] },
    { ...valid, songs: [{ ...queueSongs[0], position: 2 }, queueSongs[1], queueSongs[2]] },
    { ...valid, songs: [{ ...queueSongs[0], status: "playing" }, queueSongs[1], queueSongs[2]] },
    { ...valid, songs: [{ ...queueSongs[0], raw: "must-not-be-accepted" }, queueSongs[1], queueSongs[2]] },
  ]) expect(validate(hostile, songInputs, 7)).toBeUndefined();
});

test("C14 full-fixture entrypoint is inert until exact authority is supplied", async () => {
  // Production break caught: merely importing/collecting C14 reaches a service,
  // or a caller can begin the full-fixture phase with missing/extra authority.
  let fetchCalls = 0;
  const fetchImpl: typeof fetch = async () => {
    fetchCalls += 1;
    throw new Error("network must remain inert");
  };
  const c14 = await import("../scripts/music-public-prebrowser-c14.mjs");
  const exactAuthority = {
    stateOrigin: "http://127.0.0.1:55174",
    tunesOrigin: "http://127.0.0.1:55000",
    explorerOrigin: "http://localhost:55173",
    strapiOrigin: "http://127.0.0.1:51337",
    stateToken: "S".repeat(43), orchestrationToken: "O".repeat(43), fixtureToken: "F".repeat(43),
    namespace: "e2e-public-music-qualification",
    username: "e2e-public-music-qualification-owner",
    accountDocumentId: "e2e-public-music-qualification-account",
    userDocumentId: "e2e-public-music-qualification-user",
  };
  await expect(c14.runMusicPrebrowserC14AgainstFullFixture({
    authority: exactAuthority,
    fetchImpl,
  })).rejects.toThrow("C14 full-fixture qualification refused");
  await expect(c14.runMusicPrebrowserC14AgainstFullFixture({
    ack: c14.MUSIC_PREBROWSER_C14_ACK,
    authority: { ...exactAuthority, unexpected: "ambient-override" },
    fetchImpl,
  })).rejects.toThrow("C14 full-fixture qualification refused");
  expect(fetchCalls).toBe(0);
});

for (const [method, expectedCode] of [
  ["ensureEphemeralOwner", "identity-ensure-failed"],
  ["capture", "populated-snapshot-failed"],
  ["verifyRollbackProbe", "rollback-probe-failed"],
  ["restore", "phase-restore-failed"],
  ["verifyPublicProfileAndMusic", "unexpected-failure"],
  ["restoreBaseline", "baseline-restore-failed"],
  ["verifyEphemeralOwnerRetired", "ephemeral-owner-not-retired"],
  ["readGuard", "guard-not-clear"],
] as const) {
  test(`pre-browser qualifier maps ${method} failure to fixed ${expectedCode} and still attempts baseline restore and guard inspection`, async () => {
    const contract = await loadPrebrowserQualificationContract();
    const run = contract.runMusicPrebrowserQualification as undefined | ((input: {
      initialSnapshot: QualificationSnapshot;
      adapter: ReturnType<typeof passingPrebrowserQualificationAdapter>;
    }) => Promise<{ ok: boolean; record: Record<string, unknown> }>);
    expect(typeof run).toBe("function");
    if (!run) return;
    const events: string[] = [];
    const adapter = passingPrebrowserQualificationAdapter(events);
    const original = adapter[method] as (...args: unknown[]) => Promise<unknown>;
    Object.assign(adapter, {
      [method]: async (...args: unknown[]) => {
        await original(...args);
        if (method === "verifyEphemeralOwnerRetired") return false;
        if (method === "readGuard") return { version: "music-e2e-mutation-guard/v1", state: "blocked", reason: "restore-failed", stage: "restore" };
        throw new Error("Bearer private-qualification-value from C:\\Users\\private\\state.json");
      },
    });
    const result = await run({
      initialSnapshot: qualificationSnapshot("initial-snapshot", "a".repeat(64), "f".repeat(64), 0, 0),
      adapter,
    });
    expect(result).toMatchObject({ ok: false, record: { status: "failed", code: expectedCode } });
    expect(events).toContain("restore:initial-baseline");
    expect(events).toContain("guard-clear");
    expect(JSON.stringify(result.record)).not.toMatch(/private-qualification|Bearer|C:\\Users|snapshotId|token|credential|authorization/i);
  });
}

test("runner qualifier refusal restores and tears down before any storage, collection, callback, or auth write", async () => {
  const events: string[] = [];
  const hash = "a".repeat(64);
  const outcome = await runMusicFixtureOrchestration({
    snapshotExists: true,
    baseReport: { version: MUSIC_PUBLIC_FIXTURE_VERSION, runId: "prebrowser-refusal", lane: "live" },
    qualify: async () => {
      events.push("qualify");
      return { ok: false, record: failedPrebrowserQualification() };
    },
    artifacts: {
      directory: "fixture-artifacts", authPath: "owner-auth.json", storagePath: "profile-storage-state.json",
      mkdir: () => { events.push("artifact-mkdir"); },
      write: (file: string) => { events.push(`auth-write:${file}`); },
      chmod: () => undefined,
    },
    restoreEvidence: { path: "restore.jsonl", exists: () => false, read: () => "" },
    execute: async () => { events.push("collection-callback-journeys"); return 0; },
    restore: async () => { events.push("initial-restore"); return { ok: true, beforeHash: hash, afterHash: hash }; },
    teardown: {
      artifactPaths: [], exists: () => false, unlink: () => undefined,
      stopStateService: async () => { events.push("state-service-stop"); },
      down: () => { events.push("fixture-down"); return 0; },
    },
    writeReport: async () => undefined,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });
  expect(events).toEqual(["qualify", "initial-restore", "state-service-stop", "fixture-down"]);
  expect(outcome).toMatchObject({ exitCode: 4, report: { result: "failed", cleanup: "restored" } });
});

test("runner starts artifact setup and collection/callback execution only after a green qualifier", async () => {
  const events: string[] = [];
  const hash = "a".repeat(64);
  await runMusicFixtureOrchestration({
    snapshotExists: true,
    baseReport: { version: MUSIC_PUBLIC_FIXTURE_VERSION, runId: "prebrowser-green", lane: "live" },
    qualify: async () => { events.push("qualify-green"); return { ok: true, record: passedPrebrowserQualification() }; },
    artifacts: {
      directory: "fixture-artifacts", authPath: "owner-auth.json", storagePath: "profile-storage-state.json",
      mkdir: () => { events.push("artifact-mkdir"); },
      write: () => { events.push("storage-write"); },
      chmod: () => undefined,
    },
    restoreEvidence: { path: "restore.jsonl", exists: () => false, read: () => "" },
    execute: async () => { events.push("collection-callback-journeys"); return 0; },
    restore: async () => { events.push("initial-restore"); return { ok: true, beforeHash: hash, afterHash: hash }; },
    teardown: {
      artifactPaths: [], exists: () => false, unlink: () => undefined,
      stopStateService: async () => { events.push("state-service-stop"); },
      down: () => { events.push("fixture-down"); return 0; },
    },
    writeReport: async () => undefined,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });
  expect(events).toEqual([
    "qualify-green", "artifact-mkdir", "storage-write", "collection-callback-journeys",
    "initial-restore", "state-service-stop", "fixture-down",
  ]);
});

test("runner rejects a hostile qualifier record before artifacts and never retains its extra field", async () => {
  const events: string[] = [];
  const reports: unknown[] = [];
  const hash = "a".repeat(64);
  const hostile = "Bearer hostile.qualifier.secret";
  const outcome = await runMusicFixtureOrchestration({
    snapshotExists: true,
    baseReport: { version: MUSIC_PUBLIC_FIXTURE_VERSION, runId: "prebrowser-hostile", lane: "live" },
    qualify: async () => {
      events.push("qualify");
      return { ok: true, record: { ...passedPrebrowserQualification(), credential: hostile } };
    },
    artifacts: {
      directory: "fixture-artifacts", authPath: "owner-auth.json", storagePath: "profile-storage-state.json",
      mkdir: () => { events.push("artifact-mkdir"); },
      write: () => { events.push("storage-write"); },
      chmod: () => undefined,
    },
    restoreEvidence: { path: "restore.jsonl", exists: () => false, read: () => "" },
    execute: async () => { events.push("collection-callback-journeys"); return 0; },
    restore: async () => { events.push("initial-restore"); return { ok: true, beforeHash: hash, afterHash: hash }; },
    teardown: {
      artifactPaths: [], exists: () => false, unlink: () => undefined,
      stopStateService: async () => { events.push("state-service-stop"); },
      down: () => { events.push("fixture-down"); return 0; },
    },
    writeReport: async (report: unknown) => { reports.push(report); },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });
  expect(events).toEqual(["qualify", "initial-restore", "state-service-stop", "fixture-down"]);
  expect(outcome).toMatchObject({ exitCode: 4, report: { result: "failed", cleanup: "restored" } });
  expect(JSON.stringify(reports)).not.toContain(hostile);
});

test("pre-browser qualification records have one exact fixed safe schema and reject hostile additions", async () => {
  const contract = await loadPrebrowserQualificationContract();
  const validate = contract.validateMusicPrebrowserQualificationRecord as undefined | ((value: unknown) => boolean);
  expect(typeof validate).toBe("function");
  if (!validate) return;
  const events: string[] = [];
  const result = await (contract.runMusicPrebrowserQualification as (input: {
    initialSnapshot: QualificationSnapshot;
    adapter: ReturnType<typeof passingPrebrowserQualificationAdapter>;
  }) => Promise<{ record: Record<string, unknown> }>)({
    initialSnapshot: qualificationSnapshot("initial-snapshot", "a".repeat(64), "f".repeat(64), 0, 0),
    adapter: passingPrebrowserQualificationAdapter(events),
  });
  expect(validate(result.record)).toBe(true);
  expect(validate({ ...result.record, token: "header.payload.secret" })).toBe(false);
  expect(validate({ ...result.record, code: "C:\\Users\\private\\raw.txt" })).toBe(false);
  expect(validate({ ...result.record, counts: { identityRows: 1, categoryQueries: 17, musicPrerequisites: 9 } })).toBe(false);
  expect(validate({ ...result.record, hashes: { ...(result.record.hashes as object), publicSlug: "actual-private-slug" } })).toBe(false);
  expect(validate({ ...failedPrebrowserQualification(), publicFlowFailure: {
    stage: "queue", code: "http-failed", detail: "Bearer hostile.private.detail",
  } })).toBe(false);
  expect(validate({ ...failedPrebrowserQualification(), publicFlowFailure: {
    stage: "https://private.example/path", code: "http-failed",
  } })).toBe(false);
  const withoutSubstage = { ...result.record };
  delete withoutSubstage.publicFlowSubstage;
  expect(validate(withoutSubstage)).toBe(false);
  expect(validate({ ...failedPrebrowserQualification(), publicFlowSubstage: "transition-response" })).toBe(false);
  expect(validate({
    ...failedPrebrowserQualification(),
    publicFlowFailure: { stage: "owner", code: "contract-invalid" },
    publicFlowSubstage: "none",
  })).toBe(false);
  expect(validate({
    ...failedPrebrowserQualification(),
    publicFlowFailure: { stage: "owner", code: "contract-invalid" },
    publicFlowSubstage: "transition-response",
  })).toBe(true);
  expect(validate({
    ...failedPrebrowserQualification(),
    publicFlowFailure: { stage: "owner", code: "contract-invalid" },
    publicFlowSubstage: "dashboard-response",
  })).toBe(true);
  expect(validate({ ...passedPrebrowserQualification(), publicFlowSubstage: "dashboard-response" })).toBe(false);
  expect(validate({ ...failedPrebrowserQualification(), publicFlowSubstage: "hostile-private-value" })).toBe(false);
});

test("pre-browser qualification top codes exclusively own public-flow failure metadata", async () => {
  // Production break caught: a non-public lifecycle failure can otherwise carry
  // a syntactically valid owner substage and misattribute its fixed safe cause.
  const contract = await loadPrebrowserQualificationContract();
  const validate = contract.validateMusicPrebrowserQualificationRecord as undefined | ((value: unknown) => boolean);
  expect(typeof validate).toBe("function");
  if (!validate) return;

  const nonPublicFailures = [
    { name: "unexpected", code: "unexpected-failure" },
    { name: "identity-ensure", code: "identity-ensure-failed" },
    {
      name: "populated-capture",
      code: "populated-snapshot-failed",
      snapshotFailure: { phase: "populated", stage: "identity-count-query", code: "operation-failed" },
    },
    { name: "populated-cardinality", code: "populated-identity-cardinality" },
    { name: "rollback-profile", code: "rollback-probe-failed" },
    { name: "phase-restore", code: "phase-restore-failed" },
    {
      name: "public-capture",
      code: "populated-snapshot-failed",
      snapshotFailure: { phase: "public", stage: "profile-private-fetch", code: "operation-failed" },
    },
    { name: "baseline-restore", code: "baseline-restore-failed" },
    { name: "owner-retirement", code: "ephemeral-owner-not-retired" },
    { name: "guard", code: "guard-not-clear" },
  ] as const;

  for (const scenario of nonPublicFailures) {
    const safeRecord = {
      ...failedPrebrowserQualification(),
      code: scenario.code,
      snapshotFailure: "snapshotFailure" in scenario
        ? scenario.snapshotFailure
        : { phase: "none", stage: "none", code: "none" },
      publicFlowFailure: { stage: "none", code: "none" },
      publicFlowSubstage: "none",
    };
    expect(validate(safeRecord), `${scenario.name}: safe fixed cause`).toBe(true);
    for (const publicFlowSubstage of ["transition-response", "dashboard-response"] as const) {
      expect(validate({
        ...safeRecord,
        publicFlowFailure: { stage: "owner", code: "contract-invalid" },
        publicFlowSubstage,
      }), `${scenario.name}: hostile ${publicFlowSubstage}`).toBe(false);
    }
  }

  expect(validate(failedPrebrowserQualification())).toBe(true);
  for (const publicFlowSubstage of ["transition-response", "dashboard-response"] as const) {
    expect(validate({
      ...failedPrebrowserQualification(),
      publicFlowFailure: { stage: "owner", code: "contract-invalid" },
      publicFlowSubstage,
    }), `valid owner ${publicFlowSubstage}`).toBe(true);
  }
});

test("public qualification accepts only the exact gateway shell and every namespaced category fixture", async () => {
  const contract = await loadPrebrowserQualificationContract();
  const validate = contract.validateMusicQualificationPublicGateway as undefined | ((input: {
    category?: string; root?: string; body: unknown; namespace: string; accountDocumentId: string;
  }) => boolean);
  expect(typeof validate).toBe("function");
  if (!validate) return;
  const namespace = "e2e-public-music-qualification";
  const accountDocumentId = `${namespace}-account`;
  const profile = {
    documentId: accountDocumentId, username: `${namespace}-owner`, Account_Name: "Fixture Explorer",
    public_profile: "Yes", public_recommendations: "Yes", public_music: "Yes",
  };
  expect(validate({ body: profile, namespace, accountDocumentId })).toBe(true);
  expect(validate({ body: { ...profile, documentId: `${namespace}-other-account` }, namespace, accountDocumentId })).toBe(false);
  expect(validate({ body: { ...profile, password: "must-not-pass" }, namespace, accountDocumentId })).toBe(false);

  const categoryCases = [
    ["places", "recommendationLists", "places", "recommended_places"],
    ["movies", "movieLists", "movies", "recommended_movies"],
    ["books", "bookLists", "books", "recommended_books"],
    ["games", "gameLists", "games", "recommended_games"],
    ["apps", "appLists", "apps", "recommended_apps"],
    ["products", "productLists", "products", "recommended_products"],
    ["people", "personLists", "people", "recommended_people"],
    ["guides", "guides", "guides", "Title"],
  ] as const;
  for (const [category, root, subject, contentKey] of categoryCases) {
    const item = {
      documentId: `${namespace}-${subject}-list`,
      ...(contentKey === "Title" ? { Title: "Fixture Guide" } : { [contentKey]: [{ documentId: `${namespace}-${subject}-list-item` }] }),
    };
    expect(validate({ category, root, body: { [root]: [item] }, namespace, accountDocumentId })).toBe(true);
    expect(validate({ category, root, body: { [root]: [item], secretRoot: [] }, namespace, accountDocumentId })).toBe(false);
    expect(validate({ category, root, body: { [root]: [{ ...item, privateField: "must-not-pass" }] }, namespace, accountDocumentId })).toBe(false);
    if (contentKey !== "Title") {
      expect(validate({ category, root, body: { [root]: [{ ...item, [contentKey]: [{ documentId: `${namespace}-${subject}-list-item`, token: "must-not-pass" }] }] }, namespace, accountDocumentId })).toBe(false);
    }
    expect(validate({ category, root, body: { [root]: [{ ...item, documentId: "foreign-list" }] }, namespace, accountDocumentId })).toBe(false);
  }
});

test("profile qualification requires the exact account and requested fields in UpdateAccount success", async () => {
  const contract = await loadPrebrowserQualificationContract();
  const validate = contract.validateMusicQualificationUpdateResponse as undefined | ((input: {
    status: number; body: unknown; accountDocumentId: string; expected: Record<string, unknown>;
  }) => boolean);
  expect(typeof validate).toBe("function");
  if (!validate) return;
  const accountDocumentId = "e2e-public-music-qualification-account";
  const body = { data: { updateAccount: { documentId: accountDocumentId, Bio: "rollback probe" } } };
  expect(validate({ status: 200, body, accountDocumentId, expected: { Bio: "rollback probe" } })).toBe(true);
  expect(validate({ status: 200, body: { data: { updateAccount: null } }, accountDocumentId, expected: { Bio: "rollback probe" } })).toBe(false);
  expect(validate({ status: 200, body, accountDocumentId: `${accountDocumentId}-other`, expected: { Bio: "rollback probe" } })).toBe(false);
  expect(validate({ status: 200, body, accountDocumentId, expected: { Bio: "different" } })).toBe(false);
});

test("qualifier credential fingerprint must differ from the later callback owner credential", async () => {
  const contract = await loadPrebrowserQualificationContract();
  const distinct = contract.isDistinctMusicCallbackCredential as undefined | ((input: {
    qualifierJwtFingerprint: string;
    callbackCredential: string;
  }) => boolean);
  expect(typeof distinct).toBe("function");
  if (!distinct) return;
  const qualifier = "qualifier.header.ephemeral-owner";
  const fingerprint = createHash("sha256").update(qualifier).digest("hex");
  expect(distinct({ qualifierJwtFingerprint: fingerprint, callbackCredential: `Bearer ${qualifier}` })).toBe(false);
  expect(distinct({ qualifierJwtFingerprint: fingerprint, callbackCredential: "Bearer callback.header.distinct-owner" })).toBe(true);
  expect(distinct({ qualifierJwtFingerprint: fingerprint, callbackCredential: "Bearer malformed" })).toBe(false);
});

test("canonical state snapshots require safe populated identity and profile field counts", async () => {
  const base = {
    version: "music-live-account-snapshot/v1",
    snapshotId: "safe-populated-snapshot",
    publication: { coveredByDatabaseDump: true },
    guestControls: { coveredByDatabaseDump: true },
    queue: { coveredByDatabaseDump: true },
    playlists: { coveredByDatabaseDump: true },
    requests: { coveredByDatabaseDump: true },
    profile: {
      accountDocumentId: "e2e-public-music-state-account", publicMusic: false,
      profileRevision: 3, profileHash: "a".repeat(64),
    },
    database: { namespace: "e2e-public-music-state", dumpHash: "b".repeat(64) },
  };
  await expect(createCanonicalMusicFixtureAdapter({
    readFullSnapshot: async () => base,
    resetNamespace: async () => undefined,
  }).snapshot()).rejects.toThrow(/complete Strapi profile state|database identity population/);
  await expect(createCanonicalMusicFixtureAdapter({
    readFullSnapshot: async () => ({
      ...base,
      profile: { ...base.profile, fieldCount: 24 },
      database: { ...base.database, identityRows: 1 },
    }),
    resetNamespace: async () => undefined,
  }).snapshot()).resolves.toMatchObject({
    profile: { fieldCount: 24 }, database: { identityRows: 1 },
  });
});

test("state service proves populated identity/profile metadata and returns exact profile restore equality", () => {
  const stateService = readFileSync("../tunes/scripts/music-e2e-state-service.mjs", "utf8");
  const captureCore = readFileSync("../tunes/scripts/music-e2e-state-capture.mjs", "utf8");
  expect(stateService).toContain("runMusicFixtureIdentityCountPsql");
  expect(stateService).not.toContain("buildMusicFixtureIdentityCountPsqlQuery");
  expect(stateService).not.toContain('"-Atc"');
  expect(captureCore).toContain("buildMusicFixtureIdentityCountPgQuery");
  expect(captureCore).toContain("buildMusicFixtureIdentityCountPsqlOperation");
  expect(captureCore).toContain("identityPredicates");
  expect(captureCore).toContain("identityRows");
  expect(captureCore).toContain("fieldCount");
  expect(stateService).toMatch(/return \{[\s\S]{0,320}beforeHash: restored\.beforeHash,[\s\S]{0,160}afterHash: restored\.afterHash,[\s\S]{0,160}profileHash:[\s\S]{0,160}profileRevision:/);
  expect(captureCore).not.toMatch(/SELECT[^`]*\$\{(?:authority|namespace|username)/);
});

test("live runner binds qualification before collection and callback without persisting qualifier authority", () => {
  const runner = readFileSync("scripts/music-public-e2e.mjs", "utf8");
  const snapshot = runner.indexOf('fetch(`${stateServiceUrl}/snapshot`');
  const qualification = runner.indexOf("runLoopbackMusicPrebrowserQualification({");
  const collection = runner.indexOf("runLivePreflight({");
  const callback = runner.indexOf("google-auth/callback?access_token=");
  const authWrite = runner.indexOf("writeFileSync(authStatePath");
  expect(snapshot).toBeGreaterThan(-1);
  expect(qualification).toBeGreaterThan(snapshot);
  expect(collection).toBeGreaterThan(qualification);
  expect(callback).toBeGreaterThan(collection);
  expect(authWrite).toBeGreaterThan(callback);
  expect(runner).toContain("isDistinctMusicCallbackCredential");
  expect(runner).toContain("prebrowserQualificationRecord");
  expect(runner).not.toMatch(/writeFileSync\([^\n]+qualifierJwt/i);
});

test("artifact finalization requires a validated safe pre-browser qualification record", () => {
  const artifacts = readFileSync("scripts/music-public-qualification-artifacts.mjs", "utf8");
  expect(artifacts).toContain("validateMusicPrebrowserQualificationRecord");
  expect(artifacts).toMatch(/!validateMusicPrebrowserQualificationRecord\(evidence\.prebrowserQualification\)/);
});

test("initial snapshot decoding retains only exact fixed stage/code and bounded success metadata", async () => {
  const contract = await import("../scripts/music-public-initial-snapshot.mjs").catch(() => null) as null | {
    decodeMusicInitialSnapshotResponse(input: { status: number; body: unknown }): {
      ok: boolean;
      snapshot?: unknown;
      record: ReturnType<typeof unavailableInitialSnapshotQualification>;
    };
    musicInitialSnapshotRequestFailure(error: unknown): ReturnType<typeof unavailableInitialSnapshotQualification>;
    validateMusicInitialSnapshotQualificationRecord(value: unknown): boolean;
  };
  expect(contract).not.toBeNull();
  if (!contract) return;
  const snapshot = {
    version: "music-live-account-snapshot/v1",
    snapshotId: "initial-safe-snapshot",
    publication: { coveredByDatabaseDump: true },
    guestControls: { coveredByDatabaseDump: true },
    queue: { coveredByDatabaseDump: true },
    playlists: { coveredByDatabaseDump: true },
    requests: { coveredByDatabaseDump: true },
    profile: {
      accountDocumentId: "e2e-public-music-state-account", publicMusic: false,
      profileRevision: 0, profileHash: "b".repeat(64), fieldCount: 2,
    },
    database: { namespace: "e2e-public-music-state", dumpHash: "a".repeat(64), identityRows: 0 },
  };
  expect(contract.decodeMusicInitialSnapshotResponse({ status: 200, body: snapshot })).toEqual({
    ok: true,
    snapshot,
    record: passedInitialSnapshotQualification(),
  });

  const serviceFailure = {
    schemaVersion: "music-e2e-state-capture-failure/v1",
    state: "failed",
    stage: "identity-count-query",
    code: "operation-failed",
  };
  expect(contract.decodeMusicInitialSnapshotResponse({ status: 500, body: serviceFailure })).toEqual({
    ok: false,
    record: {
      ...unavailableInitialSnapshotQualification(),
      status: "failed",
      stage: "identity-count-query",
      code: "operation-failed",
    },
  });
  const hostileValue = "token=never-retain C:\\private\\capture.sql postgresql://owner:secret@127.0.0.1/db";
  const malformed = contract.decodeMusicInitialSnapshotResponse({
    status: 500,
    body: { ...serviceFailure, debug: hostileValue },
  });
  expect(malformed).toEqual({
    ok: false,
    record: {
      ...unavailableInitialSnapshotQualification(),
      status: "failed",
      stage: "snapshot-store",
      code: "contract-invalid",
    },
  });
  expect(JSON.stringify(malformed)).not.toContain("never-retain");
  expect(contract.musicInitialSnapshotRequestFailure(Object.assign(new Error(hostileValue), { name: "TimeoutError" })))
    .toEqual({
      ...unavailableInitialSnapshotQualification(),
      status: "failed",
      stage: "snapshot-store",
      code: "operation-timeout",
    });
  expect(contract.validateMusicInitialSnapshotQualificationRecord(malformed.record)).toBe(true);
  expect(contract.validateMusicInitialSnapshotQualificationRecord({ ...malformed.record, path: hostileValue })).toBe(false);
});

test("live runner preserves safe initial-snapshot failure before qualifier and artifact validation", () => {
  const runner = readFileSync("scripts/music-public-e2e.mjs", "utf8");
  const decode = runner.indexOf("decodeMusicInitialSnapshotResponse({");
  const qualification = runner.indexOf("runLoopbackMusicPrebrowserQualification({");
  expect(decode).toBeGreaterThan(-1);
  expect(qualification).toBeGreaterThan(decode);
  expect(runner).toContain("initialSnapshotQualificationRecord");
  expect(runner).toMatch(/initialSnapshotQualification:\s*(?:report\.initialSnapshotQualification \?\? )?initialSnapshotQualificationRecord/);
  const artifacts = readFileSync("scripts/music-public-qualification-artifacts.mjs", "utf8");
  expect(artifacts).toContain("validateMusicInitialSnapshotQualificationRecord");
  expect(artifacts).toMatch(/!validateMusicInitialSnapshotQualificationRecord\(evidence\.initialSnapshotQualification\)/);
});

function c14CliInitialSnapshot() {
  const namespace = `e2e-public-music-${"1".repeat(32)}`;
  return {
    version: "music-live-account-snapshot/v1",
    snapshotId: "c14-initial-snapshot",
    publication: { coveredByDatabaseDump: true },
    guestControls: { coveredByDatabaseDump: true },
    queue: { coveredByDatabaseDump: true },
    playlists: { coveredByDatabaseDump: true },
    requests: { coveredByDatabaseDump: true },
    profile: {
      accountDocumentId: `${namespace}-account`,
      publicMusic: false,
      profileRevision: 0,
      profileHash: "b".repeat(64),
      fieldCount: 24,
    },
    database: { namespace, dumpHash: "a".repeat(64), identityRows: 0 },
  };
}

function c14CliDependencies(events: string[], overrides: Record<string, unknown> = {}) {
  const snapshot = c14CliInitialSnapshot();
  const initialSnapshotQualification = {
    schemaVersion: "explorers-public-initial-snapshot/v1",
    status: "passed",
    stage: "snapshot-store",
    code: "none",
    metadata: {
      databaseHash: snapshot.database.dumpHash,
      profileHash: snapshot.profile.profileHash,
      identityRows: snapshot.database.identityRows,
      profileRevision: snapshot.profile.profileRevision,
      profileFieldCount: snapshot.profile.fieldCount,
    },
  };
  let randomCall = 0;
  return {
    randomBytes: (size: number) => {
      randomCall += 1;
      events.push(`random:${size}`);
      return Buffer.alloc(size, randomCall);
    },
    inspectSource: () => {
      events.push("source");
      return { ok: true, commit: "c".repeat(40) };
    },
    attestAuthority: ({ phase }: { phase: string }) => {
      events.push(`authority:${phase}`);
      return { ok: true };
    },
    runLifecycle: ({ stage }: { stage: string }) => {
      events.push(`lifecycle:${stage}`);
      return { status: 0 };
    },
    createRuntimeDirectory: () => {
      events.push("temp:create");
      return {
        directory: "<test-c14-runtime>",
        mutationGuardPath: "<test-c14-guard>",
        recoveryPath: "<test-c14-recovery>",
      };
    },
    startStateService: () => {
      events.push("state:start");
      return {
        stop: async () => { events.push("state:stop"); },
      };
    },
    waitForReadiness: async () => {
      events.push("readiness");
      return true;
    },
    captureInitialSnapshot: async () => {
      events.push("initial:snapshot");
      return { ok: true, snapshot, record: initialSnapshotQualification };
    },
    qualify: async ({ authority }: { authority: Record<string, unknown> }) => {
      events.push("qualify");
      expect(Object.keys(authority).sort()).toEqual([
        "accountDocumentId", "explorerOrigin", "fixtureToken", "namespace", "orchestrationToken",
        "stateOrigin", "stateToken", "strapiOrigin", "tunesOrigin", "userDocumentId", "username",
      ]);
      return {
        schemaVersion: "explorers-public-prebrowser-c14/v1",
        status: "passed",
        counts: { graphqlOperations: 20, publicMusicResources: 2, queueSongs: 3 },
        qualification: passedPrebrowserQualification(),
      };
    },
    restoreFinal: async () => {
      events.push("final:restore");
      return { ok: true, databaseEqual: true, profileEqual: true };
    },
    removeRuntimeDirectory: () => {
      events.push("temp:remove");
      return true;
    },
    ...overrides,
  };
}

test("C15 probes the exact Explorer ws path through one bounded disconnect and reconnect", async () => {
  // Break caught: a static Nginx stanza looks correct while the reviewed
  // browser-free probe bypasses Explorer, leaks authority, or never reconnects.
  const c15 = await import("../scripts/music-public-socket-c15.mjs").catch(() => null) as null | {
    runMusicPublicSocketProxyProbe(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    validateMusicPublicSocketC15Record(value: unknown): boolean;
  };
  expect(c15).not.toBeNull();
  if (!c15) return;
  class FakeSocket extends EventEmitter {
    connectCalls = 0;
    disconnectCalls = 0;
    connected = false;
    disconnected = true;
    connect() {
      this.connectCalls += 1;
      this.connected = true;
      this.disconnected = false;
      queueMicrotask(() => this.emit("connect"));
      return this;
    }
    disconnect() {
      this.disconnectCalls += 1;
      this.connected = false;
      this.disconnected = true;
      this.emit("disconnect");
      return this;
    }
  }
  const socket = new FakeSocket();
  const options: Record<string, unknown>[] = [];
  const record = await c15.runMusicPublicSocketProxyProbe({
    explorerOrigin: "http://localhost:55173",
    publicSlug: "public_slug-123",
    socketFactory: (_origin: string, value: Record<string, unknown>) => { options.push(value); return socket; },
  });
  expect(record).toEqual({
    schemaVersion: "explorers-public-socket-c15/v1",
    status: "passed",
    code: "none",
    connections: 2,
    reconnects: 1,
    closed: true,
  });
  expect(c15.validateMusicPublicSocketC15Record(record)).toBe(true);
  expect(socket.connectCalls).toBe(2);
  expect(socket.disconnectCalls).toBe(2);
  expect(options).toEqual([{
    autoConnect: false,
    path: "/ws",
    transports: ["websocket", "polling"],
    auth: { publicSlug: "public_slug-123" },
    extraHeaders: { Origin: "http://localhost:55173" },
    reconnection: true,
  }]);
  expect(JSON.stringify(record)).not.toMatch(/public_slug|https?:|token|credential|authorization|path/i);

  class FailedSocket extends EventEmitter {
    connected = false;
    disconnected = true;
    connect() { queueMicrotask(() => this.emit("connect_error", new Error("Bearer secret at C:\\Users\\hostile"))); return this; }
    disconnect() {
      this.connected = false;
      this.disconnected = true;
      this.emit("disconnect");
      return this;
    }
  }
  const failed = await c15.runMusicPublicSocketProxyProbe({
    explorerOrigin: "http://localhost:55173",
    publicSlug: "public_slug-123",
    socketFactory: () => new FailedSocket(),
  });
  expect(failed).toEqual({
    schemaVersion: "explorers-public-socket-c15/v1",
    status: "failed",
    code: "connection-failed",
    connections: 0,
    reconnects: 0,
    closed: true,
  });
  expect(JSON.stringify(failed)).not.toMatch(/Bearer|secret|Users|hostile|public_slug|https?:|path/i);

  class FinalDisconnectThrowsSocket extends FakeSocket {
    override disconnect() {
      this.disconnectCalls += 1;
      if (this.disconnectCalls === 2) {
        throw new Error("Bearer terminal-secret at C:\\Users\\hostile\\socket.log");
      }
      this.connected = false;
      this.disconnected = true;
      this.emit("disconnect");
      return this;
    }
  }
  const finalDisconnectThrows = new FinalDisconnectThrowsSocket();
  const cleanupFailed = await c15.runMusicPublicSocketProxyProbe({
    explorerOrigin: "http://localhost:55173",
    publicSlug: "public_slug-123",
    socketFactory: () => finalDisconnectThrows,
  });
  expect(cleanupFailed).toEqual({
    schemaVersion: "explorers-public-socket-c15/v1",
    status: "failed",
    code: "disconnect-failed",
    connections: 2,
    reconnects: 1,
    closed: false,
  });
  expect(c15.validateMusicPublicSocketC15Record(cleanupFailed)).toBe(true);
  expect(finalDisconnectThrows.connectCalls).toBe(2);
  expect(finalDisconnectThrows.disconnectCalls).toBe(2);
  expect(JSON.stringify(cleanupFailed)).not.toMatch(/Bearer|secret|Users|hostile|socket\.log|public_slug|https?:|path/i);

  class FinalDisconnectDoesNotCloseSocket extends FakeSocket {
    override disconnect() {
      this.disconnectCalls += 1;
      if (this.disconnectCalls === 2) return this;
      this.connected = false;
      this.disconnected = true;
      this.emit("disconnect");
      return this;
    }
  }
  const finalDisconnectDoesNotClose = new FinalDisconnectDoesNotCloseSocket();
  await expect(c15.runMusicPublicSocketProxyProbe({
    explorerOrigin: "http://localhost:55173",
    publicSlug: "public_slug-123",
    socketFactory: () => finalDisconnectDoesNotClose,
  })).resolves.toMatchObject({
    status: "failed", code: "disconnect-failed", connections: 2, reconnects: 1, closed: false,
  });
});

test("C15 is inert without its exact flag and otherwise reuses the exact C14 lifecycle", async () => {
  // Break caught: C15 grows a second lifecycle implementation or can reach
  // source inspection/randomness/lifecycle from an ambient or malformed gate.
  const cli = await import("../scripts/music-public-socket-c15-cli.mjs").catch(() => null) as null | {
    runMusicPublicSocketC15Cli(input: Record<string, unknown>): Promise<{ exitCode: number; record: Record<string, unknown> }>;
    validateMusicPublicSocketC15CliRecord(value: unknown): boolean;
  };
  expect(cli).not.toBeNull();
  if (!cli) return;

  class CliSocket extends EventEmitter {
    connectCalls = 0;
    disconnectCalls = 0;
    connected = false;
    disconnected = true;
    connect() {
      this.connectCalls += 1;
      this.connected = true;
      this.disconnected = false;
      queueMicrotask(() => this.emit("connect"));
      return this;
    }
    disconnect() {
      this.disconnectCalls += 1;
      this.connected = false;
      this.disconnected = true;
      this.emit("disconnect");
      return this;
    }
  }
  const c15QualificationBoundary = (events: string[], socket: CliSocket) => ({
    socketFactory: () => socket,
    prebrowserRunner: async ({ publicCapabilityProbe }: {
      publicCapabilityProbe(input: { publicSlug: string }): Promise<boolean>;
    }) => {
      events.push("qualify");
      const probePassed = await publicCapabilityProbe({ publicSlug: "public_slug-123" });
      const qualification = passedPrebrowserQualification();
      return {
        schemaVersion: "explorers-public-prebrowser-c14/v1",
        status: probePassed ? "passed" : "failed",
        counts: probePassed
          ? { graphqlOperations: 20, publicMusicResources: 2, queueSongs: 3 }
          : { graphqlOperations: 0, publicMusicResources: 0, queueSongs: 0 },
        qualification: probePassed ? qualification : {
          ...qualification,
          status: "failed",
          code: "public-flow-failed",
          publicFlowFailure: { stage: "proxy-public-music", code: "contract-invalid" },
          checks: { ...qualification.checks, publicProjection: false },
        },
      };
    },
  });

  for (const environment of [
    {},
    { MUSIC_C15_SOCKET_PROXY_TEST: "0" },
    { music_c15_socket_proxy_test: "1" },
    { MUSIC_C15_SOCKET_PROXY_TEST: "1", MUSIC_C15_TOKEN: "hostile" },
  ]) {
    const events: string[] = [];
    const refused = await cli.runMusicPublicSocketC15Cli({
      args: EXACT_PUBLIC_C14_AUTHORITY_ARGS,
      environment,
      dependencies: { inspectSource: () => { events.push("source"); } },
    });
    expect(refused.exitCode).toBe(3);
    expect(events).toEqual([]);
    expect(cli.validateMusicPublicSocketC15CliRecord(refused.record)).toBe(true);
  }

  const events: string[] = [];
  const successSocket = new CliSocket();
  const result = await cli.runMusicPublicSocketC15Cli({
    args: EXACT_PUBLIC_C14_AUTHORITY_ARGS,
    environment: { MUSIC_C15_SOCKET_PROXY_TEST: "1" },
    dependencies: c14CliDependencies(events),
    ...c15QualificationBoundary(events, successSocket),
  });
  expect(events).toEqual([
    "source",
    "random:16", "random:32", "random:32", "random:32",
    "authority:pre",
    "lifecycle:fixture-bootstrap", "lifecycle:fixture-up",
    "temp:create", "state:start", "readiness", "initial:snapshot", "qualify",
    "final:restore", "state:stop", "lifecycle:fixture-down", "authority:post", "temp:remove",
  ]);
  expect(result).toEqual({
    exitCode: 0,
    record: {
      schemaVersion: "explorers-public-socket-c15-cli/v1",
      result: "passed",
      stage: "complete",
      code: "none",
      exitCode: 0,
      counts: { connections: 2, reconnects: 1 },
      finalRestore: { status: "passed", databaseEqual: true, profileEqual: true },
      cleanup: {
        status: "passed", code: "none", stateServiceStopped: true,
        fixtureDown: true, authorityRetired: true, tempRemoved: true,
      },
    },
  });
  expect(successSocket.connectCalls).toBe(2);
  expect(successSocket.disconnectCalls).toBe(2);
  expect(cli.validateMusicPublicSocketC15CliRecord(result.record)).toBe(true);
  expect(cli.validateMusicPublicSocketC15CliRecord({
    ...result.record,
    result: "failed",
    stage: "final-restore",
    code: "final-restore-failed",
    exitCode: 5,
    counts: { connections: 0, reconnects: 0 },
    finalRestore: { status: "failed", databaseEqual: true, profileEqual: true },
  })).toBe(false);
  expect(cli.validateMusicPublicSocketC15CliRecord({
    ...result.record,
    result: "failed",
    stage: "preflight",
    code: "ambient-refused",
    exitCode: 3,
    counts: { connections: 0, reconnects: 0 },
    finalRestore: { status: "not-run", databaseEqual: false, profileEqual: false },
    cleanup: { ...result.record.cleanup, status: "not-required", stateServiceStopped: true },
  })).toBe(false);
  expect(JSON.stringify(result.record)).not.toMatch(/Bearer|token|credential|authorization|https?:|[A-Z]:\\|stdout|stderr|raw/i);

  const cleanupEvents: string[] = [];
  const cleanupSocket = new CliSocket();
  const cleanupFailure = await cli.runMusicPublicSocketC15Cli({
    args: EXACT_PUBLIC_C14_AUTHORITY_ARGS,
    environment: { MUSIC_C15_SOCKET_PROXY_TEST: "1" },
    dependencies: c14CliDependencies(cleanupEvents, {
      startStateService: () => {
        cleanupEvents.push("state:start");
        return { stop: async () => { cleanupEvents.push("state:stop"); throw new Error("hostile cleanup detail"); } };
      },
    }),
    ...c15QualificationBoundary(cleanupEvents, cleanupSocket),
  });
  expect(cleanupFailure).toMatchObject({
    exitCode: 5,
    record: {
      result: "failed", stage: "state-stop", code: "state-stop-failed",
      counts: { connections: 0, reconnects: 0 },
      cleanup: { status: "failed", fixtureDown: true, authorityRetired: true, tempRemoved: true },
    },
  });
  expect(cleanupEvents.slice(cleanupEvents.indexOf("state:stop"))).toEqual([
    "state:stop", "lifecycle:fixture-down", "authority:post", "temp:remove",
  ]);
  expect(JSON.stringify(cleanupFailure.record)).not.toContain("hostile cleanup detail");

  class FinalDisconnectThrowsCliSocket extends CliSocket {
    override disconnect() {
      this.disconnectCalls += 1;
      if (this.disconnectCalls === 2) {
        throw new Error("Bearer terminal-secret at C:\\Users\\hostile\\socket.log");
      }
      this.connected = false;
      this.disconnected = true;
      this.emit("disconnect");
      return this;
    }
  }
  const disconnectFailureEvents: string[] = [];
  const disconnectFailureSocket = new FinalDisconnectThrowsCliSocket();
  const disconnectFailure = await cli.runMusicPublicSocketC15Cli({
    args: EXACT_PUBLIC_C14_AUTHORITY_ARGS,
    environment: { MUSIC_C15_SOCKET_PROXY_TEST: "1" },
    dependencies: c14CliDependencies(disconnectFailureEvents),
    ...c15QualificationBoundary(disconnectFailureEvents, disconnectFailureSocket),
  });
  expect(disconnectFailure).toMatchObject({
    exitCode: 4,
    record: {
      result: "failed", stage: "qualification", code: "qualification-failed", exitCode: 4,
      counts: { connections: 0, reconnects: 0 },
      finalRestore: { status: "passed", databaseEqual: true, profileEqual: true },
      cleanup: {
        status: "passed", code: "none", stateServiceStopped: true,
        fixtureDown: true, authorityRetired: true, tempRemoved: true,
      },
    },
  });
  expect(disconnectFailureEvents).toEqual([
    "source",
    "random:16", "random:32", "random:32", "random:32",
    "authority:pre",
    "lifecycle:fixture-bootstrap", "lifecycle:fixture-up",
    "temp:create", "state:start", "readiness", "initial:snapshot", "qualify",
    "final:restore", "state:stop", "lifecycle:fixture-down", "authority:post", "temp:remove",
  ]);
  expect(disconnectFailureSocket.connectCalls).toBe(2);
  expect(disconnectFailureSocket.disconnectCalls).toBe(2);
  expect(cli.validateMusicPublicSocketC15CliRecord(disconnectFailure.record)).toBe(true);
  expect(JSON.stringify(disconnectFailure.record)).not.toMatch(/Bearer|secret|Users|hostile|socket\.log|public_slug|https?:|path/i);

  const rootPackage = JSON.parse(readFileSync("../package.json", "utf8")) as { scripts: Record<string, string> };
  const clientPackage = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  expect(rootPackage.scripts["music:test:public-c15"]).toBe("npm --prefix explorers-earth run music:test:public-c15 --");
  expect(clientPackage.scripts["music:test:public-c15"]).toBe("node scripts/music-public-socket-c15-cli.mjs");

  const sandbox = mkdtempSync(join(tmpdir(), "music-public-c15-package-command-"));
  try {
    const preloader = join(sandbox, "capture-c15-runner.cjs");
    const capturePath = join(sandbox, "runner.json");
    writeFileSync(preloader, [
      'const { basename } = require("node:path");',
      'if (basename(String(process.argv[1])) === "music-public-socket-c15-cli.mjs") {',
      '  require("node:fs").writeFileSync(process.env.FAKE_C15_RUNNER_CAPTURE, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));',
      '  process.exit(0);',
      '}',
      '',
    ].join("\n"));
    const npmExecPath = process.env.npm_execpath
      ?? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    expect(existsSync(npmExecPath)).toBe(true);
    const packageResult = spawnSync(process.execPath, [
      npmExecPath, "run", "--silent", "music:test:public-c15", "--", ...EXACT_PUBLIC_C14_AUTHORITY_ARGS,
    ], {
      cwd: resolve(".."),
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      env: {
        ...withoutPublicLiveAuthority(process.env),
        MUSIC_C15_SOCKET_PROXY_TEST: "1",
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${preloader}`.trim(),
        FAKE_C15_RUNNER_CAPTURE: capturePath,
      },
    });
    expect(packageResult.status, `${packageResult.stdout}\n${packageResult.stderr}`).toBe(0);
    expect(JSON.parse(readFileSync(capturePath, "utf8"))).toEqual({
      argv: [...EXACT_PUBLIC_C14_AUTHORITY_ARGS],
      cwd: resolve(),
    });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("the documented root C14 command forwards only the exact reviewed eight-element argv", () => {
  // Production break caught: the approved C14 lane existed only as an importable
  // helper, so the reviewed root command could not reach a guarded orchestrator.
  const rootPackage = JSON.parse(readFileSync("../package.json", "utf8")) as { scripts: Record<string, string> };
  const clientPackage = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  const testingGuide = readFileSync("../docs/testing.md", "utf8");
  const exactCommand = `npm run music:test:public-c14 -- ${EXACT_PUBLIC_C14_AUTHORITY_ARGS.join(" ")}`;
  expect(rootPackage.scripts["music:test:public-c14"]).toBe("npm --prefix explorers-earth run music:test:public-c14 --");
  expect(clientPackage.scripts["music:test:public-c14"]).toBe("node scripts/music-public-prebrowser-c14-cli.mjs");
  expect(testingGuide).toContain(exactCommand);

  const sandbox = mkdtempSync(join(tmpdir(), "music-public-c14-package-command-"));
  try {
    const preloader = join(sandbox, "capture-c14-runner.cjs");
    const capturePath = join(sandbox, "runner.json");
    writeFileSync(preloader, [
      'const { basename } = require("node:path");',
      'if (basename(String(process.argv[1])) === "music-public-prebrowser-c14-cli.mjs") {',
      '  require("node:fs").writeFileSync(process.env.FAKE_C14_RUNNER_CAPTURE, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));',
      '  process.exit(0);',
      '}',
      '',
    ].join("\n"));
    const npmExecPath = process.env.npm_execpath
      ?? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    expect(existsSync(npmExecPath)).toBe(true);
    const result = spawnSync(process.execPath, [
      npmExecPath, "run", "--silent", "music:test:public-c14", "--", ...EXACT_PUBLIC_C14_AUTHORITY_ARGS,
    ], {
      cwd: resolve(".."),
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      env: {
        ...withoutPublicLiveAuthority(process.env),
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${preloader}`.trim(),
        FAKE_C14_RUNNER_CAPTURE: capturePath,
      },
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(JSON.parse(readFileSync(capturePath, "utf8"))).toEqual({
      argv: [...EXACT_PUBLIC_C14_AUTHORITY_ARGS],
      cwd: resolve(),
    });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("C14 authority rejects malformed argv and hostile ambient input before randomness or lifecycle", async () => {
  // Production break caught: a public helper must not grow an ambient or
  // backwards-compatible path that can mint fixture authority before refusal.
  const cli = await import("../scripts/music-public-prebrowser-c14-cli.mjs").catch(() => null) as null | {
    buildMusicPrebrowserC14Authority(input: Record<string, unknown>): Record<string, unknown>;
  };
  expect(cli).not.toBeNull();
  if (!cli) return;
  for (const candidate of [
    [],
    EXACT_PUBLIC_C14_AUTHORITY_ARGS.slice(0, -2),
    [...EXACT_PUBLIC_C14_AUTHORITY_ARGS, "--extra"],
    [EXACT_PUBLIC_C14_AUTHORITY_ARGS[2], EXACT_PUBLIC_C14_AUTHORITY_ARGS[3], ...EXACT_PUBLIC_C14_AUTHORITY_ARGS.slice(0, 2), ...EXACT_PUBLIC_C14_AUTHORITY_ARGS.slice(4)],
  ]) {
    let randomCalls = 0;
    expect(() => cli.buildMusicPrebrowserC14Authority({
      args: candidate,
      environment: {},
      randomBytes: () => { randomCalls += 1; return Buffer.alloc(32); },
    })).toThrow(/refused/i);
    expect(randomCalls).toBe(0);
  }
  for (const environment of [
    { MUSIC_E2E_STRAPI_TOKEN: "hostile" },
    { mUsIc_E2E_Strapi_Token: "hostile" },
    { DATABASE_URL: "postgresql://hostile" },
    { NODE_OPTIONS: "--require=hostile.cjs" },
    { C14_TOKEN: "hostile" },
    { MUSIC_PREBROWSER_C14_TOKEN: "hostile" },
  ]) {
    let randomCalls = 0;
    expect(() => cli.buildMusicPrebrowserC14Authority({
      args: EXACT_PUBLIC_C14_AUTHORITY_ARGS,
      environment,
      randomBytes: () => { randomCalls += 1; return Buffer.alloc(32); },
    })).toThrow(/refused/i);
    expect(randomCalls).toBe(0);
  }
});

test("C14 CLI executes the exact reviewed lifecycle and emits only canonical safe success metadata", async () => {
  // Production break caught: C14 lacked an owned full-fixture lifecycle and a
  // single terminal record proving 20/2/3 capability plus exact final restore.
  const cli = await import("../scripts/music-public-prebrowser-c14-cli.mjs").catch(() => null) as null | {
    runMusicPrebrowserC14Cli(input: Record<string, unknown>): Promise<{ exitCode: number; record: Record<string, unknown> }>;
    validateMusicPrebrowserC14CliRecord(value: unknown): boolean;
  };
  expect(cli).not.toBeNull();
  if (!cli) return;
  const events: string[] = [];
  const result = await cli.runMusicPrebrowserC14Cli({
    args: EXACT_PUBLIC_C14_AUTHORITY_ARGS,
    environment: {},
    dependencies: c14CliDependencies(events),
  });
  expect(events).toEqual([
    "source",
    "random:16", "random:32", "random:32", "random:32",
    "authority:pre",
    "lifecycle:fixture-bootstrap", "lifecycle:fixture-up",
    "temp:create", "state:start", "readiness", "initial:snapshot", "qualify",
    "final:restore", "state:stop", "lifecycle:fixture-down", "authority:post", "temp:remove",
  ]);
  expect(result).toMatchObject({
    exitCode: 0,
    record: {
      schemaVersion: "explorers-public-prebrowser-c14-cli/v1",
      runId: "01010101010101010101010101010101",
      commit: "c".repeat(40),
      result: "passed",
      stage: "complete",
      code: "none",
      exitCode: 0,
      initialSnapshotQualification: { status: "passed" },
      qualifier: { schemaVersion: "explorers-public-prebrowser-qualification/v4", status: "passed" },
      counts: { graphqlOperations: 20, publicMusicResources: 2, queueSongs: 3 },
      finalRestore: { status: "passed", databaseEqual: true, profileEqual: true },
      cleanup: {
        status: "passed", code: "none", stateServiceStopped: true,
        fixtureDown: true, authorityRetired: true, tempRemoved: true,
      },
    },
  });
  expect(cli.validateMusicPrebrowserC14CliRecord(result.record)).toBe(true);
  const serialized = JSON.stringify(result.record);
  expect(Buffer.byteLength(serialized)).toBeLessThanOrEqual(16 * 1024);
  expect(serialized).not.toMatch(/Bearer|token|credential|authorization|https?:\/\/|C:\\Users|<test-c14|stdout|stderr|raw/i);
  expect(cli.validateMusicPrebrowserC14CliRecord({ ...result.record, debug: "hostile" })).toBe(false);
});

test("C14 cleanup failures dominate without skipping later cleanup", async () => {
  // Production break caught: a qualification result must never conceal an
  // incomplete state stop, fixture down, authority retirement, or temp removal.
  const cli = await import("../scripts/music-public-prebrowser-c14-cli.mjs").catch(() => null) as null | {
    runMusicPrebrowserC14Cli(input: Record<string, unknown>): Promise<{ exitCode: number; record: Record<string, unknown> }>;
  };
  expect(cli).not.toBeNull();
  if (!cli) return;
  const cases = [
    ["state-stop-failed", {
      startStateService: () => ({ stop: async () => { throw new Error("Bearer hostile-state"); } }),
    }],
    ["fixture-down-failed", {
      runLifecycle: ({ stage }: { stage: string }) => ({ status: stage === "fixture-down" ? 1 : 0 }),
    }],
    ["authority-retirement-failed", {
      attestAuthority: ({ phase }: { phase: string }) => ({ ok: phase !== "post" }),
    }],
    ["temp-cleanup-failed", { removeRuntimeDirectory: () => false }],
  ] as const;
  for (const [expectedCode, overrides] of cases) {
    const events: string[] = [];
    const dependencies = c14CliDependencies(events, overrides as Record<string, unknown>);
    if (expectedCode === "state-stop-failed") {
      dependencies.startStateService = () => ({
        stop: async () => { events.push("state:stop"); throw new Error("Bearer hostile-state"); },
      });
    }
    if (expectedCode === "fixture-down-failed") {
      dependencies.runLifecycle = ({ stage }: { stage: string }) => {
        events.push(`lifecycle:${stage}`);
        return { status: stage === "fixture-down" ? 1 : 0 };
      };
    }
    if (expectedCode === "authority-retirement-failed") {
      dependencies.attestAuthority = ({ phase }: { phase: string }) => {
        events.push(`authority:${phase}`);
        return { ok: phase !== "post" };
      };
    }
    if (expectedCode === "temp-cleanup-failed") {
      dependencies.removeRuntimeDirectory = () => { events.push("temp:remove"); return false; };
    }
    const result = await cli.runMusicPrebrowserC14Cli({
      args: EXACT_PUBLIC_C14_AUTHORITY_ARGS,
      environment: {},
      dependencies,
    });
    expect(result).toMatchObject({
      exitCode: 5,
      record: { result: "failed", exitCode: 5, cleanup: { status: "failed", code: expectedCode } },
    });
    expect(events.slice(-3)).toEqual(["lifecycle:fixture-down", "authority:post", "temp:remove"]);
    expect(JSON.stringify(result.record)).not.toMatch(/hostile-state|Bearer/);
  }
});

test("C14 preflight and qualification failures stop forward work but preserve owned teardown", async () => {
  // Production break caught: a failed gate must stop later capability work while
  // every already-owned state/lifecycle resource still follows the fixed teardown.
  const cli = await import("../scripts/music-public-prebrowser-c14-cli.mjs").catch(() => null) as null | {
    runMusicPrebrowserC14Cli(input: Record<string, unknown>): Promise<{ exitCode: number; record: Record<string, unknown> }>;
  };
  expect(cli).not.toBeNull();
  if (!cli) return;
  const cases: Array<{
    expected: { stage: string; code: string };
    configure: (dependencies: ReturnType<typeof c14CliDependencies>, events: string[]) => void;
    absent: string[];
    tail: string[];
  }> = [
    {
      expected: { stage: "authority", code: "authority-gate-failed" },
      configure: (dependencies, events) => {
        dependencies.attestAuthority = ({ phase }: { phase: string }) => {
          events.push(`authority:${phase}`);
          return { ok: false };
        };
      },
      absent: ["lifecycle:fixture-bootstrap", "qualify", "final:restore"],
      tail: ["authority:pre"],
    },
    {
      expected: { stage: "bootstrap", code: "fixture-bootstrap-failed" },
      configure: (dependencies, events) => {
        dependencies.runLifecycle = ({ stage }: { stage: string }) => {
          events.push(`lifecycle:${stage}`);
          return { status: stage === "fixture-bootstrap" ? 1 : 0 };
        };
      },
      absent: ["lifecycle:fixture-up", "state:start", "qualify", "final:restore"],
      tail: ["lifecycle:fixture-down", "authority:post"],
    },
    {
      expected: { stage: "up", code: "fixture-up-failed" },
      configure: (dependencies, events) => {
        dependencies.runLifecycle = ({ stage }: { stage: string }) => {
          events.push(`lifecycle:${stage}`);
          return { status: stage === "fixture-up" ? 1 : 0 };
        };
      },
      absent: ["state:start", "qualify", "final:restore"],
      tail: ["lifecycle:fixture-down", "authority:post"],
    },
    {
      expected: { stage: "readiness", code: "readiness-failed" },
      configure: (dependencies, events) => {
        dependencies.waitForReadiness = async () => { events.push("readiness"); return false; };
      },
      absent: ["initial:snapshot", "qualify", "final:restore"],
      tail: ["lifecycle:fixture-down", "authority:post", "temp:remove"],
    },
    {
      expected: { stage: "initial-snapshot", code: "initial-snapshot-failed" },
      configure: (dependencies, events) => {
        dependencies.captureInitialSnapshot = async () => {
          events.push("initial:snapshot");
          return {
            ok: false,
            record: {
              ...unavailableInitialSnapshotQualification(),
              status: "failed", stage: "profile-schema", code: "contract-invalid",
            },
          };
        };
      },
      absent: ["qualify", "final:restore"],
      tail: ["lifecycle:fixture-down", "authority:post", "temp:remove"],
    },
    {
      expected: { stage: "qualification", code: "qualification-failed" },
      configure: (dependencies, events) => {
        dependencies.qualify = async () => {
          events.push("qualify");
          return {
            schemaVersion: "explorers-public-prebrowser-c14/v1",
            status: "failed",
            counts: { graphqlOperations: 0, publicMusicResources: 0, queueSongs: 0 },
            qualification: failedPrebrowserQualification(),
          };
        };
      },
      absent: [],
      tail: ["lifecycle:fixture-down", "authority:post", "temp:remove"],
    },
  ];
  for (const scenario of cases) {
    const events: string[] = [];
    const dependencies = c14CliDependencies(events);
    scenario.configure(dependencies, events);
    const result = await cli.runMusicPrebrowserC14Cli({
      args: EXACT_PUBLIC_C14_AUTHORITY_ARGS,
      environment: {},
      dependencies,
    });
    expect(result).toMatchObject({
      exitCode: 4,
      record: {
        result: "failed",
        ...scenario.expected,
        cleanup: { status: scenario.expected.stage === "authority" ? "not-required" : "passed" },
      },
    });
    for (const absent of scenario.absent) expect(events).not.toContain(absent);
    expect(events.slice(-scenario.tail.length)).toEqual(scenario.tail);
    if (scenario.expected.stage === "qualification") {
      expect(events).toContain("final:restore");
      expect(result.record).toMatchObject({ finalRestore: { status: "passed" } });
    }
  }
});

test("C14 runtime cleanup refuses a changed identity before deleting its exact temp child", async () => {
  // Production break caught: recursive temp cleanup must be bound to the exact
  // directory created by this invocation, not merely a prefix-shaped path.
  const cli = await import("../scripts/music-public-prebrowser-c14-cli.mjs").catch(() => null) as null | {
    createMusicPrebrowserC14RuntimeDirectory(input: { runId: string }): Record<string, unknown>;
    removeMusicPrebrowserC14RuntimeDirectory(runtime: Record<string, unknown>): boolean;
  };
  expect(cli).not.toBeNull();
  if (!cli) return;
  expect(() => cli.createMusicPrebrowserC14RuntimeDirectory({ runId: "../hostile" })).toThrow(/refused/i);
  const runtime = cli.createMusicPrebrowserC14RuntimeDirectory({ runId: "d".repeat(32) });
  const directory = String(runtime.directory);
  try {
    const identity = runtime.identity as { dev: bigint; ino: bigint };
    expect(existsSync(directory)).toBe(true);
    expect(cli.removeMusicPrebrowserC14RuntimeDirectory({
      ...runtime,
      identity: { ...identity, ino: identity.ino + 1n },
    })).toBe(false);
    expect(existsSync(directory)).toBe(true);
    expect(cli.removeMusicPrebrowserC14RuntimeDirectory(runtime)).toBe(true);
    expect(existsSync(directory)).toBe(false);
  } finally {
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  }
});

test("C14 production entrypoint contains no browser, callback, auth-file, or evidence-tree path", () => {
  const source = readFileSync("scripts/music-public-prebrowser-c14-cli.mjs", "utf8");
  expect(source).toContain("captureQualificationLifecycleCommand");
  expect(source).toContain("captureQualificationFixtureAuthority");
  expect(source).toContain("boundedSanitizedQualificationOutput");
  expect(source).toContain("sanitizeAndDiscardStreams");
  expect(source).toContain("createMusicFixtureStateServiceGuard");
  expect(source).toContain("runMusicPrebrowserC14Integration");
  expect(source).not.toMatch(/playwright|callback|authPath|storageState|\.artifacts\/music-public/i);
});

test("fresh-process C14 refusals emit one valid null-run record and invoke zero lifecycle", async () => {
  // Production break caught: malformed or hostile public invocation must be a
  // canonical refusal even before a run ID exists, without starting subprocesses.
  const cliPath = resolve("scripts/music-public-prebrowser-c14-cli.mjs");
  const sandbox = mkdtempSync(join(tmpdir(), "music-public-c14-refusal-"));
  try {
    const preloader = join(sandbox, "block-c14-side-effects.cjs");
    const lifecycleLog = join(sandbox, "side-effects.log");
    writeFileSync(preloader, [
      'const fs = require("node:fs");',
      'const cp = require("node:child_process");',
      'const crypto = require("node:crypto");',
      'const { syncBuiltinESMExports } = require("node:module");',
      'const observed = () => fs.appendFileSync(process.env.FAKE_C14_SIDE_EFFECT_LOG, "observed\\n");',
      'cp.spawnSync = () => { observed(); return { status: 91, stdout: "", stderr: "" }; };',
      'cp.spawn = () => { observed(); throw new Error("blocked test child"); };',
      'crypto.randomBytes = (size) => { observed(); return Buffer.alloc(size, 7); };',
      'delete process.env.NODE_OPTIONS;',
      'syncBuiltinESMExports();',
      '',
    ].join("\n"));
    const invoke = (args: readonly string[], extraEnvironment: Record<string, string> = {}) => spawnSync(
      process.execPath,
      [cliPath, ...args],
      {
        cwd: sandbox,
        encoding: "utf8",
        windowsHide: true,
        timeout: 10_000,
        env: {
          ...withoutPublicLiveAuthority(process.env),
          NODE_OPTIONS: `--require=${preloader}`,
          FAKE_C14_SIDE_EFFECT_LOG: lifecycleLog,
          ...extraEnvironment,
        },
      },
    );
    const malformed = invoke([]);
    const hostileExact = invoke(EXACT_PUBLIC_C14_AUTHORITY_ARGS, { DATABASE_URL: "hostile-ambient" });
    const hostilePrefix = invoke(EXACT_PUBLIC_C14_AUTHORITY_ARGS, { MUSIC_E2E_STRAPI_TOKEN: "hostile-ambient" });
    const hostileMixedCasePrefix = invoke(EXACT_PUBLIC_C14_AUTHORITY_ARGS, { mUsIc_E2E_Strapi_Token: "hostile-ambient" });
    const cli = await import("../scripts/music-public-prebrowser-c14-cli.mjs").catch(() => null) as null | {
      validateMusicPrebrowserC14CliRecord(value: unknown): boolean;
    };
    expect(cli).not.toBeNull();
    if (!cli) return;
    for (const result of [malformed, hostileExact, hostilePrefix, hostileMixedCasePrefix]) {
      expect(result.status).toBe(3);
      expect(result.stderr).toBe("");
      const lines = result.stdout.trim().split(/\r?\n/);
      expect(lines).toHaveLength(1);
      const record = JSON.parse(lines[0]);
      expect(record).toMatchObject({
        schemaVersion: "explorers-public-prebrowser-c14-cli/v1",
        runId: null,
        commit: null,
        result: "failed",
        stage: "preflight",
        exitCode: 3,
      });
      expect(cli.validateMusicPrebrowserC14CliRecord(record)).toBe(true);
      expect(JSON.stringify(record)).not.toContain("hostile-ambient");
    }
    expect(existsSync(lifecycleLog)).toBe(false);
    expect(existsSync(join(sandbox, ".artifacts"))).toBe(false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
