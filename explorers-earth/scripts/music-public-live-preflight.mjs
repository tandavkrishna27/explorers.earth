import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  appendFileSync,
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIVE_JOURNEY_MANIFEST_VERSION = "explorers-live-mutation-journeys/v1";
export const LIVE_JOURNEY_RESULT_VERSION = "explorers-live-mutation-journey-result/v2";
export const LIVE_MUTATION_TAG = "@explorers-live-mutation";
export const LIVE_READ_ONLY_TAG = "@explorers-live-read-only";
const LIVE_MUTATION_REPORT_TAG = LIVE_MUTATION_TAG.replace(/^@/, "");
const LIVE_READ_ONLY_REPORT_TAG = LIVE_READ_ONLY_TAG.replace(/^@/, "");
const MAX_PRIVATE_PLAYWRIGHT_REPORT_BYTES = 4 * 1024 * 1024;
const MAX_PRIVATE_TERMINAL_EVIDENCE_BYTES = 4 * 1024 * 1024;
const SANITIZED_EXECUTION_REPORT_VERSION = "explorers-live-playwright-evidence/v2";
const SAFE_EXECUTION_STATUSES = new Set(["passed", "failed", "timedOut", "skipped", "interrupted"]);
export const JOURNEY_OUTCOME_LEDGER_VERSION = "explorers-public-journey-outcomes/v4";
const HISTORICAL_JOURNEY_OUTCOME_LEDGER_VERSION = "explorers-public-journey-outcomes/v3";

export const LIVE_JOURNEY_MANIFEST = Object.freeze([
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
  { id: "profile.owner.pairwise.batch-01", title: "publishes pairwise matrix batch 1/6 and restores exact raw social_media", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.owner.pairwise.batch-02", title: "publishes pairwise matrix batch 2/6 and restores exact raw social_media", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.owner.pairwise.batch-03", title: "publishes pairwise matrix batch 3/6 and restores exact raw social_media", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.owner.pairwise.batch-04", title: "publishes pairwise matrix batch 4/6 and restores exact raw social_media", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.owner.pairwise.batch-05", title: "publishes pairwise matrix batch 5/6 and restores exact raw social_media", source: "e2e/profile-theme.spec.ts" },
  { id: "profile.owner.pairwise.batch-06", title: "publishes pairwise matrix batch 6/6 and restores exact raw social_media", source: "e2e/profile-theme.spec.ts" },
]);

export const LIVE_PERMISSION_JOURNEY_IDS = Object.freeze([
  "music.owner-guest.permission.allow-song-requests",
  "music.owner-guest.permission.allow-guest-play-on-device",
  "music.owner-guest.permission.allow-playlist-sharing",
  "music.owner-guest.permission.allow-recently-played-visibility",
  "music.owner-guest.permission.allow-queue-visibility",
]);
export const LIVE_PERMISSION_FAILURE_STAGES = Object.freeze([
  "owner-dashboard", "private-transition", "private-dashboard", "playlist",
  "saved-song-1", "saved-song-2", "saved-song-3", "visibility", "queue",
  "playback-1", "playback-2", "controls", "profile", "publication",
  "public-resource", "guest-control-visible",
]);
export const LIVE_PERMISSION_FAILURE_CODES = Object.freeze([
  "operation-failed", "http-failed", "contract-invalid", "assertion-failed",
]);
export const LIVE_RECONNECT_FAILURE_STAGES = Object.freeze([
  "preparation", "initial-canonical-resource", "guest-ready", "offline-announcement",
  "owner-controls", "online-canonical-apply", "online-announcement-cleared", "guest-control-visible",
]);
export const LIVE_RECONNECT_FAILURE_CODES = Object.freeze([
  "operation-failed", "operation-timeout", "http-failed", "contract-invalid", "assertion-failed",
]);
export const LIVE_PROFILE_BATCH_FAILURE_STAGES = Object.freeze([
  "baseline-dashboard", "baseline-presentation", "template-capture", "abort-settle",
  "abort-discard-navigation", "abort-state-verify", "sentinel-write", "sentinel-readback",
  "baseline-public", "row-dashboard", "row-apply", "row-publish-response",
  "row-publish-settle", "row-dashboard-readback", "row-public-theme", "row-public-tab",
  "row-public-layout", "row-public-order", "row-public-featured",
  "row-public-gallery-tab", "row-public-gallery-select", "row-public-gallery-panel", "row-public-gallery-content",
  "row-public-business",
]);
export const LIVE_PROFILE_BATCH_FAILURE_CODES = Object.freeze([
  "timeout", "http-failed", "contract-invalid", "version-mismatch", "state-mismatch",
  "navigation-blocked", "mutation-not-observed", "locator-missing", "attribute-mismatch",
  "order-mismatch", "content-insufficient", "unexpected",
]);
const LIVE_PERMISSION_JOURNEY_ID_SET = new Set(LIVE_PERMISSION_JOURNEY_IDS);
const LIVE_PROFILE_BATCH_JOURNEY_ID_SET = new Set(
  LIVE_JOURNEY_MANIFEST.filter(({ id }) => id.startsWith("profile.owner.pairwise.batch-")).map(({ id }) => id),
);
const LIVE_PERMISSION_FAILURE_STAGE_SET = new Set(LIVE_PERMISSION_FAILURE_STAGES);
const LIVE_PERMISSION_FAILURE_CODE_SET = new Set(LIVE_PERMISSION_FAILURE_CODES);
const LIVE_RECONNECT_FAILURE_STAGE_SET = new Set(LIVE_RECONNECT_FAILURE_STAGES);
const LIVE_RECONNECT_FAILURE_CODE_SET = new Set(LIVE_RECONNECT_FAILURE_CODES);
const LIVE_PROFILE_BATCH_FAILURE_STAGE_SET = new Set(LIVE_PROFILE_BATCH_FAILURE_STAGES);
// Only explicit historical manifest verification may use the coarse v3 stage.
// Raw terminals and all new producers validate against the current set above.
const HISTORICAL_PROFILE_BATCH_FAILURE_STAGE_SET = new Set([
  ...LIVE_PROFILE_BATCH_FAILURE_STAGES.filter((stage) => !stage.startsWith("row-public-gallery-")),
  "row-public-gallery",
]);
const LIVE_PROFILE_BATCH_FAILURE_CODE_SET = new Set(LIVE_PROFILE_BATCH_FAILURE_CODES);

export const LIVE_READ_ONLY_COLLECTION = Object.freeze([
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
]);

const PROFILE_FACTORS = Object.freeze({
  preset: Object.freeze(["cinematic-dark", "glassmorphism", "sunset-glow", "minimal-light", "emerald-nature", "neon-cyber"]),
  accent: Object.freeze(["#10B981", "#38BDF8", "#EC4899", "#8B5CF6", "#F59E0B", "#F43F5E"]),
  wallpaper: Object.freeze(["banner-top", "full-wallpaper-image", "ambient-gradient", "solid-color"]),
  firstView: Object.freeze(["all-recommendations", "places", "music", "movies", "books", "games", "guides", "apps", "products", "people", "gallery", "business"]),
  layout: Object.freeze(["shelves", "grid", "featured"]),
  orderShape: Object.freeze(["canonical", "reverse", "rotate", "preferred-first"]),
});
const PROFILE_FACTOR_NAMES = Object.freeze(Object.keys(PROFILE_FACTORS));

function factorPair(leftName, leftValue, rightName, rightValue) {
  return `${leftName}=${leftValue}|${rightName}=${rightValue}`;
}

function rowFactorPairs(row) {
  const pairs = [];
  for (let left = 0; left < PROFILE_FACTOR_NAMES.length; left += 1) {
    for (let right = left + 1; right < PROFILE_FACTOR_NAMES.length; right += 1) {
      const leftName = PROFILE_FACTOR_NAMES[left];
      const rightName = PROFILE_FACTOR_NAMES[right];
      pairs.push(factorPair(leftName, row[leftName], rightName, row[rightName]));
    }
  }
  return pairs;
}

function requiredProfileFactorPairs() {
  const required = new Set();
  for (let left = 0; left < PROFILE_FACTOR_NAMES.length; left += 1) {
    for (let right = left + 1; right < PROFILE_FACTOR_NAMES.length; right += 1) {
      const leftName = PROFILE_FACTOR_NAMES[left];
      const rightName = PROFILE_FACTOR_NAMES[right];
      for (const leftValue of PROFILE_FACTORS[leftName]) {
        for (const rightValue of PROFILE_FACTORS[rightName]) {
          required.add(factorPair(leftName, leftValue, rightName, rightValue));
        }
      }
    }
  }
  return required;
}

function allProfileRows() {
  const rows = [];
  const visit = (index, partial) => {
    if (index === PROFILE_FACTOR_NAMES.length) {
      rows.push(partial);
      return;
    }
    const name = PROFILE_FACTOR_NAMES[index];
    for (const value of PROFILE_FACTORS[name]) visit(index + 1, { ...partial, [name]: value });
  };
  visit(0, {});
  return rows;
}

export function buildProfileCoveringRows() {
  const candidates = allProfileRows().map((row) => ({ row, pairs: rowFactorPairs(row) }));
  const uncovered = requiredProfileFactorPairs();
  const selected = [];
  while (uncovered.size > 0) {
    let bestIndex = -1;
    let bestScore = -1;
    for (let index = 0; index < candidates.length; index += 1) {
      const score = candidates[index].pairs.reduce((total, pair) => total + Number(uncovered.has(pair)), 0);
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
    if (bestIndex < 0 || bestScore <= 0) throw new Error("Profile covering rows could not cover every required pair");
    const [best] = candidates.splice(bestIndex, 1);
    selected.push(best.row);
    for (const pair of best.pairs) uncovered.delete(pair);
  }
  return selected;
}

export function profileFactorPairs(rows) {
  return new Set(rows.flatMap(rowFactorPairs));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalEvidenceHash(value) {
  return createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex");
}

export function resolveDeclaredTsxCli({ packageJsonUrl = new URL("../../package.json", import.meta.url) } = {}) {
  const packageJsonPath = fileURLToPath(packageJsonUrl);
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (!manifest.dependencies?.tsx && !manifest.devDependencies?.tsx && !manifest.optionalDependencies?.tsx) {
    const error = new Error("The declaring package does not declare tsx");
    error.code = "TSX_NOT_DECLARED";
    throw error;
  }
  return createRequire(packageJsonPath).resolve("tsx/cli");
}

function normalizeSource(file) {
  const normalized = String(file ?? "").replace(/\\/g, "/");
  const e2eIndex = normalized.lastIndexOf("/e2e/");
  if (e2eIndex >= 0) return normalized.slice(e2eIndex + 1);
  return normalized.startsWith("e2e/") ? normalized : `e2e/${normalized.replace(/^\/+/, "")}`;
}

function specResult(spec) {
  const test = Array.isArray(spec.tests) ? spec.tests[0] : undefined;
  const annotations = Array.isArray(test?.annotations) ? test.annotations : [];
  const skip = annotations.find((annotation) => annotation?.type === "skip");
  const results = Array.isArray(test?.results) ? test.results : [];
  return {
    title: String(spec.title ?? ""),
    source: normalizeSource(spec.file),
    skipReason: skip ? (typeof skip.description === "string" && skip.description ? skip.description : "skipped") : null,
    status: typeof results.at(-1)?.status === "string" ? results.at(-1).status : null,
    tags: [...new Set([...(Array.isArray(spec.tags) ? spec.tags : []), ...(Array.isArray(test?.tags) ? test.tags : [])]
      .filter((tag) => typeof tag === "string")
      .map((tag) => tag.replace(/^@/, "")))],
  };
}

function extractLiveCollection(report) {
  const parsed = typeof report === "string" ? JSON.parse(report) : report;
  if (!parsed || !Array.isArray(parsed.suites)) throw new Error("Playwright collection report did not contain suites");
  const collected = [];
  const visit = (suite, inheritedSource) => {
    const source = suite.file ? normalizeSource(suite.file) : inheritedSource;
    for (const spec of suite.specs ?? []) {
      const specSource = spec.file ? normalizeSource(spec.file) : source;
      if (!specSource) throw new Error("Playwright collection spec did not contain a source file");
      collected.push(specResult({ ...spec, file: specSource }));
    }
    for (const child of suite.suites ?? []) visit(child, source);
  };
  for (const suite of parsed.suites) visit(suite, undefined);
  return {
    mutations: collected.filter(({ tags }) => tags.includes(LIVE_MUTATION_REPORT_TAG) && !tags.includes(LIVE_READ_ONLY_REPORT_TAG)),
    readOnly: collected.filter(({ tags }) => tags.includes(LIVE_READ_ONLY_REPORT_TAG) && !tags.includes(LIVE_MUTATION_REPORT_TAG)),
    unclassified: collected.filter(({ tags }) => tags.includes(LIVE_MUTATION_REPORT_TAG) === tags.includes(LIVE_READ_ONLY_REPORT_TAG)),
  };
}

export function extractCollectedLiveJourneys(report) {
  return extractLiveCollection(report).mutations;
}

function readOnlyClassification(collection) {
  if (collection.unclassified.length > 0) return { subcheck: "collection-unclassified" };
  const expectedKeys = LIVE_READ_ONLY_COLLECTION.map(manifestKey);
  const actualKeys = collection.readOnly.map(manifestKey);
  const counts = new Map();
  for (const key of actualKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  if ([...counts.values()].some((count) => count > 1)) return { subcheck: "read-only-duplicate" };
  const expectedSet = new Set(expectedKeys);
  if (actualKeys.some((key) => !expectedSet.has(key))) return { subcheck: "read-only-unknown" };
  const actualSet = new Set(actualKeys);
  if (expectedKeys.some((key) => !actualSet.has(key))) return { subcheck: "read-only-missing" };
  if (actualKeys.length !== expectedKeys.length) return { subcheck: "read-only-count" };
  return undefined;
}

function liveCollectionClassification(collection) {
  const manifestFailure = manifestClassification(collection.mutations);
  if (manifestFailure) return manifestFailure;
  return readOnlyClassification(collection);
}

function parsedLiveCollection(report) {
  const collection = extractLiveCollection(report);
  const failure = liveCollectionClassification(collection);
  return { collection, failure };
}

function collectedMutationResults(report) {
  const { collection, failure } = parsedLiveCollection(report);
  if (failure) {
    const error = new Error("Playwright collection did not match the classified live project");
    error.classification = failure;
    throw error;
  }
  return collection.mutations;
}

function manifestKey(entry) {
  return `${entry.source}\0${entry.title}`;
}

function canonicalCollectionIdentity(entry, allowlist, fallback) {
  return allowlist.find((candidate) => manifestKey(candidate) === manifestKey(entry)) ?? fallback;
}

function sanitizedExecutionSpec(entry, classification) {
  const mutation = classification === "mutation";
  const readOnly = classification === "read-only";
  const identity = mutation
    ? canonicalCollectionIdentity(entry, LIVE_JOURNEY_MANIFEST, {
      title: "unrecognized live mutation",
      source: "e2e/unrecognized-live-mutation.spec.ts",
    })
    : readOnly
      ? canonicalCollectionIdentity(entry, LIVE_READ_ONLY_COLLECTION, {
        title: "unrecognized live read-only case",
        source: "e2e/unrecognized-live-read-only.spec.ts",
      })
      : {
        title: "unclassified live collection entry",
        source: "e2e/unclassified-live-collection.spec.ts",
      };
  const status = SAFE_EXECUTION_STATUSES.has(entry.status) ? entry.status : (entry.status ? "unknown" : null);
  return {
    title: identity.title,
    file: identity.source,
    tags: mutation ? [LIVE_MUTATION_REPORT_TAG] : (readOnly ? [LIVE_READ_ONLY_REPORT_TAG] : []),
    tests: [{
      annotations: entry.skipReason ? [{ type: "skip", description: "skipped" }] : [],
      expectedStatus: "passed",
      results: status ? [{ status }] : [],
    }],
  };
}

function sanitizedLiveExecutionReport(rawReport) {
  const collection = extractLiveCollection(rawReport);
  const entryCount = collection.mutations.length + collection.readOnly.length + collection.unclassified.length;
  const specs = entryCount > LIVE_JOURNEY_MANIFEST.length + LIVE_READ_ONLY_COLLECTION.length
    ? [sanitizedExecutionSpec({ title: "", source: "", tags: [], skipReason: null, status: null }, "unclassified")]
    : [
      ...collection.mutations.map((entry) => sanitizedExecutionSpec(entry, "mutation")),
      ...collection.readOnly.map((entry) => sanitizedExecutionSpec(entry, "read-only")),
      ...collection.unclassified.map((entry) => sanitizedExecutionSpec(entry, "unclassified")),
    ];
  return {
    version: SANITIZED_EXECUTION_REPORT_VERSION,
    suites: [{ title: "sanitized-live-execution", specs }],
  };
}

function sanitizedGenericExecutionReport(rawReport) {
  const specs = [];
  const visit = (suite) => {
    if (!suite || typeof suite !== "object") return;
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      const test = Array.isArray(spec?.tests) ? spec.tests[0] : undefined;
      const results = Array.isArray(test?.results) ? test.results : [];
      specs.push({
        title: typeof spec?.title === "string" ? spec.title.slice(0, 512) : "unnamed test",
        file: typeof spec?.file === "string" ? spec.file.slice(-512) : "unknown",
        tests: [{
          annotations: Array.isArray(test?.annotations) && test.annotations.some((entry) => entry?.type === "skip")
            ? [{ type: "skip", description: "skipped" }] : [],
          expectedStatus: "passed",
          results: results.length > 0
            ? [{ status: SAFE_EXECUTION_STATUSES.has(results.at(-1)?.status) ? results.at(-1).status : "unknown" }]
            : [],
        }],
      });
    }
    for (const child of Array.isArray(suite.suites) ? suite.suites : []) visit(child);
  };
  for (const suite of Array.isArray(rawReport?.suites) ? rawReport.suites : []) visit(suite);
  return { version: SANITIZED_EXECUTION_REPORT_VERSION, suites: [{ title: "sanitized-execution", specs }] };
}

const EXECUTION_OUTCOME_STATUSES = new Set(["passed", "failed", "skipped", "not-run"]);
const EXECUTION_OUTCOME_REASONS = new Set([
  "none", "test-failed", "test-timed-out", "test-interrupted", "test-skipped", "execution-stopped",
  "report-missing", "report-malformed", "report-too-large", "report-invalid", "execution-not-run",
]);
const EXECUTION_OUTCOME_STAGES = new Set(["execution", "execution-report", "preflight"]);
const TERMINAL_OUTCOME_STATUSES = new Set(["passed", "failed", "skipped", "missing", "invalid", "not-run"]);
const TERMINAL_OUTCOME_REASONS = new Set([
  "none", "terminal-failed", "terminal-missing", "terminal-invalid", "terminal-not-run", "test-skipped",
  "execution-stopped", "terminal-execution-mismatch",
]);
const TERMINAL_OUTCOME_STAGES = new Set(["terminal-evidence", "execution", "post-terminal", "preflight"]);
const LEDGER_INTEGRITY_STATES = new Set(["accepted", "incomplete", "invalid", "not-run"]);
const EXECUTION_OUTCOME_TUPLES = new Set([
  "passed\0none\0execution",
  "failed\0test-failed\0execution",
  "failed\0test-timed-out\0execution",
  "failed\0test-interrupted\0execution",
  "not-run\0execution-stopped\0execution",
  "failed\0report-missing\0execution-report",
  "failed\0report-malformed\0execution-report",
  "failed\0report-too-large\0execution-report",
  "failed\0report-invalid\0execution-report",
  "skipped\0test-skipped\0execution",
  "not-run\0execution-not-run\0preflight",
]);
const TERMINAL_OUTCOME_TUPLES = new Set([
  "passed\0none\0terminal-evidence",
  "failed\0terminal-failed\0terminal-evidence",
  "skipped\0test-skipped\0execution",
  "missing\0terminal-missing\0terminal-evidence",
  "invalid\0terminal-invalid\0terminal-evidence",
  "invalid\0terminal-execution-mismatch\0post-terminal",
  "not-run\0execution-stopped\0execution",
  "not-run\0terminal-not-run\0preflight",
]);
const EXPECTED_EXECUTION_OUTCOMES = Object.freeze([...LIVE_JOURNEY_MANIFEST, ...LIVE_READ_ONLY_COLLECTION]);

function exactKeySet(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function fixedExecutionOutcomes({ status, reason, stage }) {
  return EXPECTED_EXECUTION_OUTCOMES.map(({ id }) => ({ id, status, reason, stage }));
}

function executionStatusRecord(entry, id) {
  if (entry.skipReason !== null || entry.status === "skipped") {
    return { id, status: "skipped", reason: "test-skipped", stage: "execution" };
  }
  if (entry.status === "passed") return { id, status: "passed", reason: "none", stage: "execution" };
  if (entry.status === "failed") return { id, status: "failed", reason: "test-failed", stage: "execution" };
  if (entry.status === "timedOut") return { id, status: "failed", reason: "test-timed-out", stage: "execution" };
  if (entry.status === "interrupted") return { id, status: "failed", reason: "test-interrupted", stage: "execution" };
  return { id, status: "not-run", reason: "execution-stopped", stage: "execution" };
}

function sanitizedExecutionOutcomes(executionReport, reportStatus) {
  if (reportStatus === "not-run") {
    return {
      integrity: "not-run",
      outcomes: fixedExecutionOutcomes({ status: "not-run", reason: "execution-not-run", stage: "preflight" }),
    };
  }
  const reportFailureReason = {
    missing: "report-missing",
    "parse-failed": "report-malformed",
    "too-large": "report-too-large",
  }[reportStatus];
  if (reportFailureReason) {
    return {
      integrity: "invalid",
      outcomes: fixedExecutionOutcomes({ status: "failed", reason: reportFailureReason, stage: "execution-report" }),
    };
  }
  if (reportStatus !== "accepted") {
    return {
      integrity: "invalid",
      outcomes: fixedExecutionOutcomes({ status: "failed", reason: "report-invalid", stage: "execution-report" }),
    };
  }
  try {
    const { collection, failure } = parsedLiveCollection(executionReport);
    if (failure && failure.subcheck !== "manifest-skipped") throw new Error("invalid classified collection");
    const byIdentity = new Map([...collection.mutations, ...collection.readOnly]
      .map((entry) => [manifestKey(entry), entry]));
    const outcomes = EXPECTED_EXECUTION_OUTCOMES.map((expected) => executionStatusRecord(
      byIdentity.get(manifestKey(expected)) ?? { status: null, skipReason: null },
      expected.id,
    ));
    return {
      integrity: outcomes.some(({ status }) => status === "not-run") ? "incomplete" : "accepted",
      outcomes,
    };
  } catch {
    return {
      integrity: "invalid",
      outcomes: fixedExecutionOutcomes({ status: "failed", reason: "report-invalid", stage: "execution-report" }),
    };
  }
}

function validPermissionFailure(value) {
  return exactKeySet(value, ["stage", "code"])
    && LIVE_PERMISSION_FAILURE_STAGE_SET.has(value.stage)
    && LIVE_PERMISSION_FAILURE_CODE_SET.has(value.code);
}

function validReconnectFailure(value) {
  return exactKeySet(value, ["stage", "code"])
    && LIVE_RECONNECT_FAILURE_STAGE_SET.has(value.stage)
    && LIVE_RECONNECT_FAILURE_CODE_SET.has(value.code);
}

function validProfileBatchFailure(value, historical = false) {
  const stages = historical ? HISTORICAL_PROFILE_BATCH_FAILURE_STAGE_SET : LIVE_PROFILE_BATCH_FAILURE_STAGE_SET;
  if (!exactKeySet(value, ["stage", "code", "rowOrdinal", "completedRows"])
      || !stages.has(value.stage)
      || !LIVE_PROFILE_BATCH_FAILURE_CODE_SET.has(value.code)
      || !Number.isSafeInteger(value.rowOrdinal)
      || !Number.isSafeInteger(value.completedRows)) return false;
  const rowStage = value.stage.startsWith("row-");
  return rowStage
    ? value.rowOrdinal >= 1 && value.rowOrdinal <= 12 && value.completedRows === value.rowOrdinal - 1
    : value.rowOrdinal === 0 && value.completedRows === 0;
}

function terminalPermissionFailureValid(record) {
  if (!Object.prototype.hasOwnProperty.call(record, "permissionFailure")) return true;
  return LIVE_PERMISSION_JOURNEY_ID_SET.has(record.id)
    && record.status === "failed"
    && record.reason === "body-failed"
    && record.stage === "body"
    && record.cleanup === "restored"
    && validPermissionFailure(record.permissionFailure);
}

function terminalReconnectFailureValid(record) {
  if (!Object.prototype.hasOwnProperty.call(record, "reconnectFailure")) return true;
  return record.id === "music.owner-guest.reconnect"
    && record.status === "failed"
    && record.reason === "body-failed"
    && record.stage === "body"
    && record.cleanup === "restored"
    && validReconnectFailure(record.reconnectFailure);
}

function terminalProfileBatchFailureValid(record) {
  if (!Object.prototype.hasOwnProperty.call(record, "profileBatchFailure")) return true;
  return LIVE_PROFILE_BATCH_JOURNEY_ID_SET.has(record.id)
    && record.status === "failed"
    && record.reason === "body-failed"
    && record.stage === "body"
    && record.cleanup === "restored"
    && validProfileBatchFailure(record.profileBatchFailure);
}

function sanitizedTerminalOutcomes(terminalRecords, terminalStatus, executionOutcomes = []) {
  if (terminalStatus === "not-run") {
    return {
      integrity: "not-run",
      outcomes: LIVE_JOURNEY_MANIFEST.map(({ id }) => ({
        id, status: "not-run", reason: "terminal-not-run", stage: "preflight",
      })),
    };
  }
  if (terminalStatus !== "accepted" || !Array.isArray(terminalRecords)) {
    const malformed = terminalStatus !== "missing";
    return {
      integrity: malformed ? "invalid" : "incomplete",
      outcomes: LIVE_JOURNEY_MANIFEST.map(({ id }) => ({
        id,
        status: malformed ? "invalid" : "missing",
        reason: malformed ? "terminal-invalid" : "terminal-missing",
        stage: "terminal-evidence",
      })),
    };
  }
  if (terminalRecords.length > 256) {
    return {
      integrity: "invalid",
      outcomes: LIVE_JOURNEY_MANIFEST.map(({ id }) => ({
        id, status: "invalid", reason: "terminal-invalid", stage: "terminal-evidence",
      })),
    };
  }
  const knownIds = new Set(LIVE_JOURNEY_MANIFEST.map(({ id }) => id));
  const recordsById = new Map();
  const executionById = new Map(executionOutcomes.map((record) => [record.id, record]));
  let hostileRecord = false;
  for (const record of terminalRecords) {
    if (!record || typeof record !== "object" || Array.isArray(record) || !knownIds.has(record.id)
        || !terminalPermissionFailureValid(record)
        || !terminalReconnectFailureValid(record)
        || !terminalProfileBatchFailureValid(record)
        || ["permissionFailure", "reconnectFailure", "profileBatchFailure"]
          .filter((key) => Object.prototype.hasOwnProperty.call(record, key)).length > 1) {
      hostileRecord = true;
      continue;
    }
    const records = recordsById.get(record.id) ?? [];
    records.push(record);
    recordsById.set(record.id, records);
  }
  const outcomes = LIVE_JOURNEY_MANIFEST.map(({ id }) => {
    const records = recordsById.get(id) ?? [];
    if (records.length === 0) {
      if (executionById.get(id)?.status === "skipped") {
        return { id, status: "skipped", reason: "test-skipped", stage: "execution" };
      }
      if (executionById.get(id)?.status === "not-run") {
        return executionById.get(id)?.reason === "execution-stopped"
          ? { id, status: "not-run", reason: "execution-stopped", stage: "execution" }
          : { id, status: "not-run", reason: "terminal-not-run", stage: "preflight" };
      }
      return { id, status: "missing", reason: "terminal-missing", stage: "terminal-evidence" };
    }
    if (records.length !== 1) return { id, status: "invalid", reason: "terminal-invalid", stage: "terminal-evidence" };
    if (records[0].status === "passed") {
      return executionById.get(id)?.status === "passed"
        ? { id, status: "passed", reason: "none", stage: "terminal-evidence" }
        : { id, status: "invalid", reason: "terminal-execution-mismatch", stage: "post-terminal" };
    }
    if (records[0].status === "failed") {
      return {
        id,
        status: "failed",
        reason: "terminal-failed",
        stage: "terminal-evidence",
        ...(records[0].permissionFailure ? { permissionFailure: {
          stage: records[0].permissionFailure.stage,
          code: records[0].permissionFailure.code,
        } } : {}),
        ...(records[0].reconnectFailure ? { reconnectFailure: {
          stage: records[0].reconnectFailure.stage,
          code: records[0].reconnectFailure.code,
        } } : {}),
        ...(records[0].profileBatchFailure ? { profileBatchFailure: {
          stage: records[0].profileBatchFailure.stage,
          code: records[0].profileBatchFailure.code,
          rowOrdinal: records[0].profileBatchFailure.rowOrdinal,
          completedRows: records[0].profileBatchFailure.completedRows,
        } } : {}),
      };
    }
    return { id, status: "invalid", reason: "terminal-invalid", stage: "terminal-evidence" };
  });
  const integrity = hostileRecord || outcomes.some(({ status }) => status === "invalid")
    ? "invalid"
    : (outcomes.some(({ status }) => ["missing", "skipped", "not-run"].includes(status)) ? "incomplete" : "accepted");
  return { integrity, outcomes };
}

function outcomeCounts(outcomes, statuses) {
  return Object.fromEntries(statuses.map((status) => [status, outcomes.filter((entry) => entry.status === status).length]));
}

function derivedLedgerIntegrity(execution, terminal) {
  if (execution.integrity === "not-run" && terminal.integrity === "not-run") return "not-run";
  if (execution.integrity === "invalid" || terminal.integrity === "invalid") return "invalid";
  if (execution.integrity === "incomplete" || terminal.integrity === "incomplete") return "incomplete";
  return "accepted";
}

export function buildSanitizedJourneyOutcomeLedger({
  executionReport,
  reportStatus = executionReport === undefined ? "missing" : "accepted",
  terminalRecords,
  terminalStatus = Array.isArray(terminalRecords) ? "accepted" : "missing",
} = {}) {
  const execution = sanitizedExecutionOutcomes(executionReport, reportStatus);
  const terminal = sanitizedTerminalOutcomes(terminalRecords, terminalStatus, execution.outcomes);
  const ledger = {
    schemaVersion: JOURNEY_OUTCOME_LEDGER_VERSION,
    integrity: derivedLedgerIntegrity(execution, terminal),
    counts: {
      execution: {
        total: execution.outcomes.length,
        ...outcomeCounts(execution.outcomes, ["passed", "failed", "skipped"]),
        notRun: execution.outcomes.filter((entry) => entry.status === "not-run").length,
      },
      terminal: {
        total: terminal.outcomes.length,
        ...outcomeCounts(terminal.outcomes, ["passed", "failed", "missing", "invalid"]),
        notRun: terminal.outcomes.filter((entry) => entry.status === "not-run").length,
      },
    },
    executionOutcomes: execution.outcomes,
    mutationTerminals: terminal.outcomes,
  };
  if (!validateSanitizedJourneyOutcomeLedger(ledger)) throw new Error("sanitized journey outcome ledger is invalid");
  return ledger;
}

function outcomeRecordValid(record, expectedId, {
  statuses, reasons, stages, tuples, permissionTerminal = false, historicalProfileBatchFailure = false,
}) {
  const hasPermissionFailure = Object.prototype.hasOwnProperty.call(record ?? {}, "permissionFailure");
  const hasReconnectFailure = Object.prototype.hasOwnProperty.call(record ?? {}, "reconnectFailure");
  const hasProfileBatchFailure = Object.prototype.hasOwnProperty.call(record ?? {}, "profileBatchFailure");
  const keys = ["id", "status", "reason", "stage",
    ...(hasPermissionFailure ? ["permissionFailure"] : []),
    ...(hasReconnectFailure ? ["reconnectFailure"] : []),
    ...(hasProfileBatchFailure ? ["profileBatchFailure"] : [])];
  return exactKeySet(record, keys)
    && record.id === expectedId && statuses.has(record.status) && reasons.has(record.reason) && stages.has(record.stage)
    && tuples.has(`${record.status}\0${record.reason}\0${record.stage}`)
    && [hasPermissionFailure, hasReconnectFailure, hasProfileBatchFailure].filter(Boolean).length <= 1
    && (!hasPermissionFailure || (permissionTerminal
      && LIVE_PERMISSION_JOURNEY_ID_SET.has(expectedId)
      && record.status === "failed" && record.reason === "terminal-failed" && record.stage === "terminal-evidence"
      && validPermissionFailure(record.permissionFailure)))
    && (!hasReconnectFailure || (permissionTerminal
      && expectedId === "music.owner-guest.reconnect"
      && record.status === "failed" && record.reason === "terminal-failed" && record.stage === "terminal-evidence"
      && validReconnectFailure(record.reconnectFailure)))
    && (!hasProfileBatchFailure || (permissionTerminal
      && LIVE_PROFILE_BATCH_JOURNEY_ID_SET.has(expectedId)
      && record.status === "failed" && record.reason === "terminal-failed" && record.stage === "terminal-evidence"
      && validProfileBatchFailure(record.profileBatchFailure, historicalProfileBatchFailure)));
}

export function validateSanitizedJourneyOutcomeLedger(ledger, { allowHistorical = false } = {}) {
  const historical = allowHistorical === true && ledger?.schemaVersion === HISTORICAL_JOURNEY_OUTCOME_LEDGER_VERSION;
  if (!exactKeySet(ledger, ["schemaVersion", "integrity", "counts", "executionOutcomes", "mutationTerminals"])
      || (ledger.schemaVersion !== JOURNEY_OUTCOME_LEDGER_VERSION && !historical)
      || !LEDGER_INTEGRITY_STATES.has(ledger.integrity)
      || !exactKeySet(ledger.counts, ["execution", "terminal"])
      || !exactKeySet(ledger.counts.execution, ["total", "passed", "failed", "skipped", "notRun"])
      || !exactKeySet(ledger.counts.terminal, ["total", "passed", "failed", "missing", "invalid", "notRun"])
      || !Array.isArray(ledger.executionOutcomes) || !Array.isArray(ledger.mutationTerminals)
      || ledger.executionOutcomes.length !== EXPECTED_EXECUTION_OUTCOMES.length
      || ledger.mutationTerminals.length !== LIVE_JOURNEY_MANIFEST.length) return false;
  if (!ledger.executionOutcomes.every((record, index) => outcomeRecordValid(record, EXPECTED_EXECUTION_OUTCOMES[index].id, {
    statuses: EXECUTION_OUTCOME_STATUSES, reasons: EXECUTION_OUTCOME_REASONS, stages: EXECUTION_OUTCOME_STAGES,
    tuples: EXECUTION_OUTCOME_TUPLES,
  })) || !ledger.mutationTerminals.every((record, index) => outcomeRecordValid(record, LIVE_JOURNEY_MANIFEST[index].id, {
    statuses: TERMINAL_OUTCOME_STATUSES, reasons: TERMINAL_OUTCOME_REASONS, stages: TERMINAL_OUTCOME_STAGES,
    tuples: TERMINAL_OUTCOME_TUPLES, permissionTerminal: true, historicalProfileBatchFailure: historical,
  }))) return false;
  const expectedExecutionCounts = {
    total: EXPECTED_EXECUTION_OUTCOMES.length,
    ...outcomeCounts(ledger.executionOutcomes, ["passed", "failed", "skipped"]),
    "not-run": ledger.executionOutcomes.filter((entry) => entry.status === "not-run").length,
  };
  const expectedTerminalCounts = {
    total: LIVE_JOURNEY_MANIFEST.length,
    ...outcomeCounts(ledger.mutationTerminals, ["passed", "failed", "missing", "invalid"]),
    "not-run": ledger.mutationTerminals.filter((entry) => entry.status === "not-run").length,
  };
  const normalizedExecutionCounts = {
    ...ledger.counts.execution,
    "not-run": ledger.counts.execution.notRun,
  };
  delete normalizedExecutionCounts.notRun;
  const normalizedTerminalCounts = {
    ...ledger.counts.terminal,
    "not-run": ledger.counts.terminal.notRun,
  };
  delete normalizedTerminalCounts.notRun;
  if (JSON.stringify(normalizedExecutionCounts) !== JSON.stringify(expectedExecutionCounts)
      || JSON.stringify(normalizedTerminalCounts) !== JSON.stringify(expectedTerminalCounts)) return false;
  const executionIntegrity = ledger.executionOutcomes.every(({ reason }) => reason === "execution-not-run")
    ? "not-run"
    : (ledger.executionOutcomes.some(({ reason }) => reason.startsWith("report-"))
      ? "invalid"
      : (ledger.executionOutcomes.some(({ status }) => status === "not-run") ? "incomplete" : "accepted"));
  const terminalIntegrity = ledger.mutationTerminals.every(({ reason }) => reason === "terminal-not-run")
    ? "not-run"
    : (ledger.mutationTerminals.some(({ status }) => status === "invalid")
      ? "invalid"
      : (ledger.mutationTerminals.some(({ status }) => ["missing", "skipped", "not-run"].includes(status)) ? "incomplete" : "accepted"));
  return ledger.integrity === derivedLedgerIntegrity({ integrity: executionIntegrity }, { integrity: terminalIntegrity });
}

export function persistSanitizedJourneyOutcomeLedger({ path: ledgerPath, ledger } = {}) {
  if (typeof ledgerPath !== "string" || ledgerPath.length === 0 || !validateSanitizedJourneyOutcomeLedger(ledger)) {
    throw new Error("sanitized journey outcome persistence contract is invalid");
  }
  const exactPath = resolve(ledgerPath);
  const temporaryPath = `${exactPath}.private-tmp`;
  if (existsSync(exactPath) || existsSync(temporaryPath)) throw new Error("sanitized journey outcome artifact already exists");
  mkdirSync(dirname(exactPath), { recursive: true, mode: 0o700 });
  const bytes = `${JSON.stringify(ledger, null, 2)}\n`;
  let published = false;
  try {
    writeFileSync(temporaryPath, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
    linkSync(temporaryPath, exactPath);
    published = true;
  } finally {
    try { if (existsSync(temporaryPath)) unlinkSync(temporaryPath); }
    catch {
      if (published) {
        try { unlinkSync(exactPath); } catch { /* caller cleanup remains fail-closed */ }
      }
      throw new Error("sanitized journey outcome temporary cleanup failed");
    }
  }
  return { bytes: Buffer.byteLength(bytes), status: "persisted" };
}

function journeyPresence(collected = []) {
  const present = new Set(collected.map(manifestKey));
  return LIVE_JOURNEY_MANIFEST.map((entry) => ({ id: entry.id, present: present.has(manifestKey(entry)) }));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactText(value, { knownSecrets, workspaceRoot }) {
  let sanitized = String(value ?? "");
  for (const secret of knownSecrets ?? []) {
    if (typeof secret === "string" && secret.length > 0) sanitized = sanitized.replace(new RegExp(escapeRegExp(secret), "gi"), "<redacted>");
  }
  sanitized = sanitized
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(access[_-]?token|capability|credential)(["']?\s*[:=]\s*["']?)([^\s&"',}]+)/gi, "$1$2<redacted>");
  if (typeof workspaceRoot === "string" && workspaceRoot.length > 0) {
    const variants = new Set([workspaceRoot, workspaceRoot.replace(/\\/g, "/"), workspaceRoot.replace(/\//g, "\\")]);
    for (const variant of variants) sanitized = sanitized.replace(new RegExp(escapeRegExp(variant), "gi"), "<workspace>");
  }
  return sanitized;
}

function boundedUtf8(value, maximumBytes = 4 * 1024) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maximumBytes) return { text: value, truncated: false };
  const suffix = Buffer.from("...[truncated]", "utf8");
  const prefix = bytes.subarray(0, maximumBytes - suffix.length).toString("utf8").replace(/\uFFFD$/u, "");
  return { text: `${prefix}${suffix.toString("utf8")}`, truncated: true };
}

function childDiagnostics(result, sanitization) {
  const rawStdout = String(result?.stdout ?? "");
  const rawStderr = String(result?.stderr ?? "");
  const stdout = boundedUtf8(redactText(rawStdout, sanitization));
  const stderr = boundedUtf8(redactText(rawStderr, sanitization));
  const errorCode = typeof result?.error?.code === "string" && /^[A-Z0-9_-]{1,64}$/i.test(result.error.code)
    ? result.error.code : null;
  const signal = typeof result?.signal === "string" && /^[A-Z0-9_-]{1,32}$/i.test(result.signal)
    ? result.signal : null;
  return {
    status: Number.isInteger(result?.status) ? result.status : null,
    errorCode,
    signal,
    stdoutBytes: Buffer.byteLength(rawStdout),
    stderrBytes: Buffer.byteLength(rawStderr),
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    stdout: stdout.text,
    stderr: stderr.text,
  };
}

function failedPreflight(subcheck, result, sanitization, collected, extra = {}) {
  return {
    ok: false,
    exitCode: 4,
    diagnostics: {
      failureStage: "preflight",
      subcheck,
      ...(result ? { child: childDiagnostics(result, sanitization) } : {}),
      journeyPresence: journeyPresence(collected),
      ...extra,
    },
  };
}

function manifestClassification(collected) {
  const expectedKeys = LIVE_JOURNEY_MANIFEST.map(manifestKey);
  const actualKeys = collected.map(manifestKey);
  const counts = new Map();
  for (const key of actualKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const duplicateIds = LIVE_JOURNEY_MANIFEST.filter((entry) => (counts.get(manifestKey(entry)) ?? 0) > 1).map(({ id }) => id);
  if (duplicateIds.length > 0) return { subcheck: "manifest-duplicate", duplicateJourneyIds: duplicateIds };
  const expectedSet = new Set(expectedKeys);
  if (actualKeys.some((key) => !expectedSet.has(key))) return { subcheck: "manifest-unknown" };
  const actualSet = new Set(actualKeys);
  const missingJourneyIds = LIVE_JOURNEY_MANIFEST.filter((entry) => !actualSet.has(manifestKey(entry))).map(({ id }) => id);
  if (missingJourneyIds.length > 0) return { subcheck: "manifest-missing", missingJourneyIds };
  if (actualKeys.some((key, index) => key !== expectedKeys[index])) return { subcheck: "manifest-reordered" };
  const skippedJourneyIds = collected.flatMap((entry, index) => entry.skipReason === null ? [] : [LIVE_JOURNEY_MANIFEST[index].id]);
  if (skippedJourneyIds.length > 0) return { subcheck: "manifest-skipped", skippedJourneyIds };
  return undefined;
}

export function classifyLivePreflight({ authorityResult, collectionResult, workspaceRoot, knownSecrets = [] }) {
  const sanitization = { workspaceRoot, knownSecrets };
  if (authorityResult?.error || authorityResult?.signal || authorityResult?.status !== 0) {
    return failedPreflight("authority-process", authorityResult, sanitization, []);
  }
  let authority;
  try { authority = JSON.parse(String(authorityResult.stdout ?? "").trim()); } catch { /* classified below */ }
  if (!authority || authority.skipReason !== null) return failedPreflight("authority-semantic", authorityResult, sanitization, []);
  if (collectionResult?.error || collectionResult?.signal || collectionResult?.status !== 0) {
    return failedPreflight("collection-process", collectionResult, sanitization, []);
  }
  let collection;
  try { collection = extractLiveCollection(collectionResult.stdout); } catch {
    return failedPreflight("collection-semantic", collectionResult, sanitization, []);
  }
  const collectionFailure = liveCollectionClassification(collection);
  if (collectionFailure) {
    const { subcheck, ...extra } = collectionFailure;
    return failedPreflight(subcheck, collectionResult, sanitization, collection.mutations, extra);
  }
  return {
    ok: true,
    exitCode: 0,
    manifestVersion: LIVE_JOURNEY_MANIFEST_VERSION,
    journeyIds: LIVE_JOURNEY_MANIFEST.map(({ id }) => id),
  };
}

const AUTHORITY_EVALUATION = "import { musicLiveWriteSkipReason } from './e2e/setup/music.ts'; const skipReason=musicLiveWriteSkipReason(); process.stdout.write(JSON.stringify({skipReason}));";

export function runLivePreflight({
  spawn,
  processExecPath,
  tsxCli,
  playwrightCli,
  project,
  cwd,
  environment,
  workspaceRoot,
  knownSecrets = [],
}) {
  let resolvedTsxCli = tsxCli;
  if (!resolvedTsxCli) {
    try { resolvedTsxCli = resolveDeclaredTsxCli(); } catch (error) {
      return classifyLivePreflight({
        authorityResult: {
          status: null,
          stdout: "",
          stderr: "",
          signal: null,
          error: { code: typeof error?.code === "string" ? error.code : "MODULE_NOT_FOUND" },
        },
        collectionResult: { status: null, stdout: "", stderr: "", signal: null },
        workspaceRoot,
        knownSecrets,
      });
    }
  }
  const childEnvironment = { ...environment };
  delete childEnvironment.PLAYWRIGHT_JSON_OUTPUT_FILE;
  delete childEnvironment.PLAYWRIGHT_JSON_OUTPUT_NAME;
  delete childEnvironment.PLAYWRIGHT_JSON_OUTPUT_DIR;
  const childOptions = {
    cwd,
    encoding: "utf8",
    env: childEnvironment,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  };
  const authorityResult = spawn(processExecPath, [resolvedTsxCli, "-e", AUTHORITY_EVALUATION], childOptions);
  if (authorityResult?.error || authorityResult?.signal || authorityResult?.status !== 0) {
    return classifyLivePreflight({
      authorityResult,
      collectionResult: { status: null, stdout: "", stderr: "", signal: null },
      workspaceRoot,
      knownSecrets,
    });
  }
  const collectionResult = spawn(processExecPath, [
    playwrightCli,
    "test",
    `--project=${project}`,
    "--list",
    "--reporter=json",
  ], childOptions);
  return classifyLivePreflight({ authorityResult, collectionResult, workspaceRoot, knownSecrets });
}

export function runPlaywrightJourneyExecution({
  spawn,
  processExecPath,
  playwrightCli,
  files,
  project,
  cwd,
  environment,
  reportPath,
  outputDirectory,
  terminalEvidencePath,
  outcomeLedgerPath,
  persistOutcomeLedger = persistSanitizedJourneyOutcomeLedger,
  privateArtifactIo,
  requireJourneyLedger = true,
}) {
  const exactReportPath = resolve(reportPath);
  const exactOutputDirectory = resolve(outputDirectory);
  const exactTerminalEvidencePath = resolve(terminalEvidencePath);
  const exactOutcomeLedgerPath = resolve(outcomeLedgerPath);
  const artifactDirectory = dirname(exactReportPath);
  if (dirname(exactOutputDirectory) !== artifactDirectory || dirname(exactTerminalEvidencePath) !== artifactDirectory
      || dirname(exactOutcomeLedgerPath) !== artifactDirectory
      || new Set([exactReportPath, exactOutputDirectory, exactTerminalEvidencePath, exactOutcomeLedgerPath]).size !== 4
      || typeof persistOutcomeLedger !== "function") {
    throw new Error("Private Playwright paths must be exclusive children of one run artifact directory");
  }
  const io = {
    exists: existsSync,
    size: (file) => statSync(file).size,
    read: (file) => readFileSync(file, "utf8"),
    unlink: unlinkSync,
    removeDirectory: (directory) => rmSync(directory, { recursive: true, force: true }),
    ...privateArtifactIo,
  };
  const childEnvironment = { ...environment };
  delete childEnvironment.PLAYWRIGHT_JSON_OUTPUT_FILE;
  delete childEnvironment.PLAYWRIGHT_JSON_OUTPUT_NAME;
  delete childEnvironment.PLAYWRIGHT_JSON_OUTPUT_DIR;
  let execution;
  let executionReport;
  let reportStatus = "missing";
  let terminalRecords;
  let terminalStatus = "missing";
  let journeyOutcomeLedger;
  let outcomeLedgerStatus = "persist-failed";
  let privateArtifactCleanup = "deleted";
  try {
    let reportDescriptor;
    try {
      mkdirSync(artifactDirectory, { recursive: true });
      reportDescriptor = openSync(exactReportPath, "wx", 0o600);
      execution = spawn(processExecPath, [
        playwrightCli,
        "test",
        ...files,
        `--project=${project}`,
        "--max-failures=1",
        "--retries=0",
        "--reporter=json",
        "--output",
        exactOutputDirectory,
      ], {
        cwd,
        stdio: ["ignore", reportDescriptor, "ignore"],
        env: childEnvironment,
        windowsHide: true,
      });
    } catch { execution = undefined; }
    finally {
      if (reportDescriptor !== undefined) {
        try { closeSync(reportDescriptor); } catch { execution = undefined; }
      }
    }
    try {
      if (io.exists(exactReportPath)) {
        const reportSize = io.size(exactReportPath);
        if (!Number.isSafeInteger(reportSize) || reportSize < 0 || reportSize > MAX_PRIVATE_PLAYWRIGHT_REPORT_BYTES) {
          reportStatus = "too-large";
        } else {
          const rawReport = JSON.parse(io.read(exactReportPath));
          executionReport = requireJourneyLedger
            ? sanitizedLiveExecutionReport(rawReport)
            : sanitizedGenericExecutionReport(rawReport);
          reportStatus = "accepted";
        }
      }
    } catch {
      executionReport = undefined;
      reportStatus = "parse-failed";
    }
    try {
      if (io.exists(exactTerminalEvidencePath)) {
        const evidenceSize = io.size(exactTerminalEvidencePath);
        if (!Number.isSafeInteger(evidenceSize) || evidenceSize < 0
            || evidenceSize > MAX_PRIVATE_TERMINAL_EVIDENCE_BYTES) {
          terminalStatus = "too-large";
        } else {
          const retainedLines = io.read(exactTerminalEvidencePath).trim().split(/\r?\n/).filter(Boolean);
          terminalRecords = retainedLines.map((line) => JSON.parse(line));
          terminalStatus = "accepted";
        }
      }
    } catch {
      terminalRecords = undefined;
      terminalStatus = "parse-failed";
    }
    try {
      if (!requireJourneyLedger) {
        outcomeLedgerStatus = undefined;
      } else {
      const candidate = buildSanitizedJourneyOutcomeLedger({
        executionReport,
        reportStatus,
        terminalRecords,
        terminalStatus,
      });
      persistOutcomeLedger({ path: exactOutcomeLedgerPath, ledger: candidate });
      journeyOutcomeLedger = candidate;
      outcomeLedgerStatus = "persisted";
      }
    } catch {
      journeyOutcomeLedger = undefined;
      outcomeLedgerStatus = "persist-failed";
    }
  } finally {
    if (requireJourneyLedger && outcomeLedgerStatus !== "persisted") {
      for (const retainedPath of [exactOutcomeLedgerPath, `${exactOutcomeLedgerPath}.private-tmp`]) {
        try { if (io.exists(retainedPath)) io.unlink(retainedPath); } catch { privateArtifactCleanup = "delete-failed"; }
      }
    }
    try { if (io.exists(exactReportPath)) io.unlink(exactReportPath); } catch { privateArtifactCleanup = "delete-failed"; }
    try { if (io.exists(exactOutputDirectory)) io.removeDirectory(exactOutputDirectory); } catch { privateArtifactCleanup = "delete-failed"; }
  }
  const childStatus = execution?.status ?? 1;
  const ledgerComplete = journeyOutcomeLedger?.integrity === "accepted"
    && journeyOutcomeLedger.counts.execution.passed === EXPECTED_EXECUTION_OUTCOMES.length
    && journeyOutcomeLedger.counts.terminal.passed === LIVE_JOURNEY_MANIFEST.length;
  const evidenceAccepted = requireJourneyLedger
    ? outcomeLedgerStatus === "persisted" && ledgerComplete
    : true;
  const status = childStatus === 0 && reportStatus === "accepted" && evidenceAccepted
    && privateArtifactCleanup === "deleted" ? 0 : (childStatus || 1);
  return {
    status,
    reportStatus,
    outcomeLedgerStatus,
    privateArtifactCleanup,
    executionReport,
    ...(journeyOutcomeLedger ? { journeyOutcomeLedger } : {}),
  };
}

export function liveJourneyManifestEntry(id) {
  return LIVE_JOURNEY_MANIFEST.find((entry) => entry.id === id);
}

const LIVE_TERMINAL_TUPLES = new Set([
  "passed\0none\0verification\0restored",
  "failed\0body-failed\0body\0restored",
  "failed\0restore-failed\0restore\0failed",
  "failed\0restore-mismatch\0verification\0failed",
  "failed\0cleanup-failed\0cleanup\0failed",
  "skipped\0test-skipped\0execution\0not-required",
  "not-run\0execution-not-run\0preflight\0not-required",
]);

export function buildLiveJourneyTerminal({
  id, status = "passed", reason = "none", stage = "verification", cleanup = "restored",
  beforeHash, afterHash, rows, permissionFailure, reconnectFailure, profileBatchFailure,
}) {
  const entry = liveJourneyManifestEntry(id);
  if (!entry) throw new Error("Unknown live journey ID");
  const profile = id.startsWith("profile.owner.pairwise.batch-");
  if (!LIVE_TERMINAL_TUPLES.has(`${status}\0${reason}\0${stage}\0${cleanup}`)) {
    throw new Error("Live journey terminal state is invalid");
  }
  if (profile && status === "passed" && (!Array.isArray(rows) || rows.length !== 12)) throw new Error("Profile journey evidence requires exactly 12 rows");
  if (!profile && rows !== undefined) throw new Error("Music journey evidence cannot contain profile rows");
  if (permissionFailure !== undefined && (!LIVE_PERMISSION_JOURNEY_ID_SET.has(id)
      || status !== "failed" || reason !== "body-failed" || stage !== "body" || cleanup !== "restored"
      || !validPermissionFailure(permissionFailure))) {
    throw new Error("Live journey permission failure metadata is invalid");
  }
  if (reconnectFailure !== undefined && (id !== "music.owner-guest.reconnect"
      || status !== "failed" || reason !== "body-failed" || stage !== "body" || cleanup !== "restored"
      || !validReconnectFailure(reconnectFailure) || permissionFailure !== undefined)) {
    throw new Error("Live journey reconnect failure metadata is invalid");
  }
  if (profileBatchFailure !== undefined && (!LIVE_PROFILE_BATCH_JOURNEY_ID_SET.has(id)
      || status !== "failed" || reason !== "body-failed" || stage !== "body" || cleanup !== "restored"
      || !validProfileBatchFailure(profileBatchFailure)
      || permissionFailure !== undefined || reconnectFailure !== undefined)) {
    throw new Error("Live journey profile batch failure metadata is invalid");
  }
  const requiresEqualHashes = cleanup === "restored";
  if (typeof beforeHash !== "string" || !/^[a-f0-9]{64}$/.test(beforeHash)
      || (requiresEqualHashes && (afterHash !== beforeHash || !/^[a-f0-9]{64}$/.test(afterHash)))) {
    throw new Error("Live journey terminal hashes are invalid");
  }
  return {
    version: LIVE_JOURNEY_RESULT_VERSION,
    manifestVersion: LIVE_JOURNEY_MANIFEST_VERSION,
    ...entry,
    status,
    skipReason: null,
    cleanup,
    reason,
    stage,
    beforeHash,
    ...(typeof afterHash === "string" ? { afterHash } : {}),
    ...(permissionFailure ? { permissionFailure: {
      stage: permissionFailure.stage,
      code: permissionFailure.code,
    } } : {}),
    ...(reconnectFailure ? { reconnectFailure: {
      stage: reconnectFailure.stage,
      code: reconnectFailure.code,
    } } : {}),
    ...(profileBatchFailure ? { profileBatchFailure: {
      stage: profileBatchFailure.stage,
      code: profileBatchFailure.code,
      rowOrdinal: profileBatchFailure.rowOrdinal,
      completedRows: profileBatchFailure.completedRows,
    } } : {}),
    ...(profile && Array.isArray(rows) ? { rowCount: rows.length, rows } : {}),
  };
}

export function buildLiveJourneyResult({ id, beforeHash, afterHash, rows }) {
  return buildLiveJourneyTerminal({ id, beforeHash, afterHash, rows });
}

export async function recordRestoredProfileJourney({ id, before, after, rows, write }) {
  if (typeof write !== "function") throw new Error("Profile journey evidence requires a writer");
  const beforeHash = canonicalEvidenceHash(before);
  const afterHash = canonicalEvidenceHash(after);
  if (beforeHash !== afterHash) throw new Error("Canonical profile restoration mismatch");
  const record = buildLiveJourneyResult({ id, beforeHash, afterHash, rows });
  await write(record);
  return record;
}

export function appendLiveJourneyResult(file, record) {
  if (typeof file !== "string" || file.length === 0) throw new Error("Live journey evidence path is required");
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
}

function evidenceFailure(subchecks, records = []) {
  const exactSubchecks = [...new Set(Array.isArray(subchecks) ? subchecks : [subchecks])];
  const exactRecords = Array.isArray(records) ? records : [];
  const ids = new Set(exactRecords.map((record) => record?.id).filter((id) => typeof id === "string"));
  return {
    ok: false,
    failureStage: "journey-evidence",
    subcheck: exactSubchecks[0],
    subchecks: exactSubchecks,
    journeyPresence: LIVE_JOURNEY_MANIFEST.map(({ id }) => ({ id, present: ids.has(id) })),
  };
}

function validHashPair(record) {
  return typeof record.beforeHash === "string" && /^[a-f0-9]{64}$/.test(record.beforeHash)
    && record.beforeHash === record.afterHash;
}

export function validateLiveJourneyEvidence({ executionReport, records }) {
  const subchecks = [];
  let collected;
  try { collected = collectedMutationResults(executionReport); } catch (error) {
    subchecks.push(error?.classification?.subcheck ?? "execution-report");
  }
  if (collected?.some((entry) => entry.status !== "passed")) subchecks.push("execution-status");
  if (!Array.isArray(records)) {
    subchecks.push("records-missing");
  } else {
    const knownIds = new Set(LIVE_JOURNEY_MANIFEST.map(({ id }) => id));
    if (records.some((record) => !knownIds.has(record?.id))) subchecks.push("records-unknown");
    if (new Set(records.map((record) => record?.id)).size !== records.length) subchecks.push("records-duplicate");
    if (records.length !== LIVE_JOURNEY_MANIFEST.length) {
      subchecks.push("records-missing");
    } else {
      let reordered = false;
      let invalidContract = false;
      for (let index = 0; index < LIVE_JOURNEY_MANIFEST.length; index += 1) {
        const expected = LIVE_JOURNEY_MANIFEST[index];
        const record = records[index];
        if (record?.id !== expected.id) reordered = true;
        if (record?.version !== LIVE_JOURNEY_RESULT_VERSION || record?.manifestVersion !== LIVE_JOURNEY_MANIFEST_VERSION
            || record?.title !== expected.title || record?.source !== expected.source
            || record?.status !== "passed" || record?.skipReason !== null || record?.cleanup !== "restored"
            || Object.prototype.hasOwnProperty.call(record ?? {}, "permissionFailure")
            || Object.prototype.hasOwnProperty.call(record ?? {}, "reconnectFailure")
            || Object.prototype.hasOwnProperty.call(record ?? {}, "profileBatchFailure")
            || !validHashPair(record ?? {})) invalidContract = true;
      }
      if (reordered) subchecks.push("records-reordered");
      if (invalidContract) subchecks.push("record-contract");
    }
  }
  if (Array.isArray(records) && records.length === LIVE_JOURNEY_MANIFEST.length
      && !subchecks.includes("records-reordered") && !subchecks.includes("record-contract")) {
    const profileRecords = records.slice(11);
    if (profileRecords.some((record) => record.rowCount !== 12 || !Array.isArray(record.rows) || record.rows.length !== 12)) {
      subchecks.push("profile-row-count");
    } else {
      const rows = profileRecords.flatMap((record) => record.rows);
      const expectedRows = buildProfileCoveringRows();
      if (rows.length !== 72 || new Set(rows.map((row) => JSON.stringify(canonicalValue(row)))).size !== 72
          || JSON.stringify(rows) !== JSON.stringify(expectedRows)) {
        subchecks.push("profile-row-order");
      } else {
        const coveredPairs = profileFactorPairs(rows);
        const requiredPairs = requiredProfileFactorPairs();
        if (coveredPairs.size !== 484 || coveredPairs.size !== requiredPairs.size
            || [...requiredPairs].some((pair) => !coveredPairs.has(pair))) subchecks.push("profile-factor-pairs");
      }
    }
  }
  if (subchecks.length > 0) return evidenceFailure(subchecks, records);
  return {
    ok: true,
    journeyResults: records,
    journeyPresence: LIVE_JOURNEY_MANIFEST.map(({ id }) => ({ id, present: true })),
  };
}
