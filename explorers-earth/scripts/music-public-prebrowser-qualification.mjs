import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MUSIC_E2E_STATE_CAPTURE_CODES,
  MUSIC_E2E_STATE_CAPTURE_FAILURE_VERSION,
  MUSIC_E2E_STATE_CAPTURE_STAGES,
} from "../../tunes/scripts/music-e2e-state-capture.mjs";

export const PREBROWSER_QUALIFICATION_VERSION = "explorers-public-prebrowser-qualification/v4";

const QUALIFICATION_CODES = new Set([
  "none", "not-run", "unexpected-failure", "identity-ensure-failed", "populated-snapshot-failed",
  "populated-identity-cardinality",
  "rollback-probe-failed", "phase-restore-failed", "public-flow-failed", "baseline-restore-failed",
  "ephemeral-owner-not-retired", "guard-not-clear",
]);
export const MUSIC_PREBROWSER_PUBLIC_FLOW_STAGES = Object.freeze([
  "visibility", "owner", "playlist", "saved-song-1", "saved-song-2", "saved-song-3",
  "playlist-visible", "queue", "playback-1", "playback-2", "controls", "publication",
  "direct-public-profile", "direct-public-category-places", "direct-public-category-movies",
  "direct-public-category-books", "direct-public-category-games", "direct-public-category-apps",
  "direct-public-category-products", "direct-public-category-people", "direct-public-category-guides",
  "proxy-public-profile", "proxy-public-category-places", "proxy-public-category-movies",
  "proxy-public-category-books", "proxy-public-category-games", "proxy-public-category-apps",
  "proxy-public-category-products", "proxy-public-category-people", "proxy-public-category-guides",
  "direct-public-music", "proxy-public-music",
]);
export const MUSIC_PREBROWSER_PUBLIC_FLOW_FAILURE_CODES = Object.freeze([
  "operation-failed", "operation-timeout", "http-failed", "contract-invalid",
]);
export const MUSIC_PREBROWSER_PUBLIC_FLOW_SUBSTAGES = Object.freeze([
  "none", "transition-response", "dashboard-response",
]);
const PUBLIC_FLOW_STAGES = new Set(MUSIC_PREBROWSER_PUBLIC_FLOW_STAGES);
const PUBLIC_FLOW_FAILURE_CODES = new Set(MUSIC_PREBROWSER_PUBLIC_FLOW_FAILURE_CODES);
const PUBLIC_FLOW_SUBSTAGES = new Set(MUSIC_PREBROWSER_PUBLIC_FLOW_SUBSTAGES);
const CAPTURE_FAILURE_PHASES = new Set(["none", "populated", "public"]);
const CAPTURE_FAILURE_STAGES = new Set(["none", ...MUSIC_E2E_STATE_CAPTURE_STAGES]);
const CAPTURE_FAILURE_CODES = new Set(["none", ...MUSIC_E2E_STATE_CAPTURE_CODES]);
const CHECK_KEYS = Object.freeze([
  "populatedRollback", "profileCapability", "privateAuthority", "staleRejected", "publicProjection",
  "musicPrerequisites", "baselineRestored", "ephemeralOwnerRetired", "guardClear",
]);
const HASH_KEYS = Object.freeze([
  "populatedDatabase", "rollbackDatabase", "populatedProfile", "rollbackProfile", "baselineDatabase",
  "restoredBaselineDatabase", "baselineProfile", "restoredBaselineProfile", "publicSlug",
]);
const REVISION_KEYS = Object.freeze(["populated", "rollback", "baseline", "restoredBaseline"]);

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeHash(value) {
  return value === null || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
}

function clearSnapshotFailure() {
  return { phase: "none", stage: "none", code: "none" };
}

function clearPublicFlowFailure() {
  return { stage: "none", code: "none" };
}

function validPublicFlowFailure(value) {
  if (!exactKeys(value, ["stage", "code"])) return false;
  if (value.stage === "none" || value.code === "none") {
    return value.stage === "none" && value.code === "none";
  }
  return PUBLIC_FLOW_STAGES.has(value.stage) && PUBLIC_FLOW_FAILURE_CODES.has(value.code);
}

function validPublicFlowSubstage(stage, substage) {
  if (!PUBLIC_FLOW_SUBSTAGES.has(substage)) return false;
  return stage === "owner"
    ? substage === "transition-response" || substage === "dashboard-response"
    : substage === "none";
}

function validSnapshotFailure(value) {
  if (!exactKeys(value, ["phase", "stage", "code"])
      || !CAPTURE_FAILURE_PHASES.has(value.phase)
      || !CAPTURE_FAILURE_STAGES.has(value.stage)
      || !CAPTURE_FAILURE_CODES.has(value.code)) return false;
  return value.phase === "none"
    ? value.stage === "none" && value.code === "none"
    : value.stage !== "none" && value.code !== "none";
}

export function validateMusicPrebrowserQualificationRecord(value) {
  if (!exactKeys(value, [
    "schemaVersion", "status", "code", "snapshotFailure", "publicFlowFailure", "publicFlowSubstage",
    "checks", "counts", "hashes", "profileRevisions",
  ])
      || value.schemaVersion !== PREBROWSER_QUALIFICATION_VERSION
      || !["unavailable", "failed", "passed"].includes(value.status)
      || !QUALIFICATION_CODES.has(value.code)
      || !validSnapshotFailure(value.snapshotFailure)
      || !validPublicFlowFailure(value.publicFlowFailure)
      || !validPublicFlowSubstage(value.publicFlowFailure.stage, value.publicFlowSubstage)
      || !exactKeys(value.checks, CHECK_KEYS)
      || !CHECK_KEYS.every((key) => typeof value.checks[key] === "boolean")
      || !exactKeys(value.counts, ["identityRows", "categoryQueries", "musicPrerequisites"])
      || ![0, 1].includes(value.counts.identityRows)
      || ![0, 18].includes(value.counts.categoryQueries)
      || !Number.isSafeInteger(value.counts.musicPrerequisites)
      || value.counts.musicPrerequisites < 0 || value.counts.musicPrerequisites > 32
      || !exactKeys(value.hashes, HASH_KEYS) || !HASH_KEYS.every((key) => safeHash(value.hashes[key]))
      || !exactKeys(value.profileRevisions, REVISION_KEYS)
      || !REVISION_KEYS.every((key) => value.profileRevisions[key] === null
        || (Number.isSafeInteger(value.profileRevisions[key]) && value.profileRevisions[key] >= 0))) {
    return false;
  }
  if ((value.code === "public-flow-failed") !== (value.publicFlowFailure.stage !== "none")) return false;
  if (value.status === "unavailable") {
    return value.code === "not-run" && CHECK_KEYS.every((key) => value.checks[key] === false)
      && value.snapshotFailure.phase === "none"
      && value.publicFlowFailure.stage === "none"
      && value.counts.identityRows === 0 && value.counts.categoryQueries === 0
      && value.counts.musicPrerequisites === 0 && HASH_KEYS.every((key) => value.hashes[key] === null)
      && REVISION_KEYS.every((key) => value.profileRevisions[key] === null);
  }
  if (value.status === "passed") {
    return value.code === "none" && CHECK_KEYS.every((key) => value.checks[key] === true)
      && value.snapshotFailure.phase === "none"
      && value.publicFlowFailure.stage === "none"
      && value.counts.identityRows === 1 && value.counts.categoryQueries === 18
      && value.counts.musicPrerequisites > 0 && HASH_KEYS.every((key) => value.hashes[key] !== null)
      && REVISION_KEYS.every((key) => value.profileRevisions[key] !== null)
      && value.hashes.populatedDatabase === value.hashes.rollbackDatabase
      && value.hashes.populatedProfile === value.hashes.rollbackProfile
      && value.hashes.baselineDatabase === value.hashes.restoredBaselineDatabase
      && value.hashes.baselineProfile === value.hashes.restoredBaselineProfile
      && value.profileRevisions.populated === value.profileRevisions.rollback
      && value.profileRevisions.baseline === value.profileRevisions.restoredBaseline;
  }
  if (value.code === "populated-identity-cardinality") {
    return value.snapshotFailure.phase === "none" && value.publicFlowFailure.stage === "none"
      && value.counts.identityRows === 0;
  }
  if (value.code === "public-flow-failed") return value.publicFlowFailure.stage !== "none";
  return value.code !== "none" && value.code !== "not-run";
}

export function isDistinctMusicCallbackCredential({ qualifierJwtFingerprint, callbackCredential } = {}) {
  if (typeof qualifierJwtFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(qualifierJwtFingerprint)
      || typeof callbackCredential !== "string"
      || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(callbackCredential)) return false;
  return sha256(callbackCredential.slice("Bearer ".length)) !== qualifierJwtFingerprint;
}

const clearChecks = () => ({
  populatedRollback: false,
  profileCapability: false,
  privateAuthority: false,
  staleRejected: false,
  publicProjection: false,
  musicPrerequisites: false,
  baselineRestored: false,
  ephemeralOwnerRetired: false,
  guardClear: false,
});

const explorerRoot = resolve(import.meta.dirname, "..");
const checkedInDocument = (relativePath, operation) => {
  const source = readFileSync(resolve(explorerRoot, relativePath), "utf8");
  const matches = [...source.matchAll(/gql`([\s\S]*?)`/g)]
    .map((match) => match[1])
    .filter((document) => new RegExp(`\\b(?:query|mutation)\\s+${operation}\\b`).test(document));
  if (matches.length !== 1) throw new Error(`pre-browser qualification requires one checked-in ${operation} document`);
  return matches[0];
};
const publicCategoryContracts = Object.freeze([
  ["places", "recommendationLists", "recommended_places"],
  ["movies", "movieLists", "recommended_movies"],
  ["books", "bookLists", "recommended_books"],
  ["games", "gameLists", "recommended_games"],
  ["apps", "appLists", "recommended_apps"],
  ["products", "productLists", "recommended_products"],
  ["people", "personLists", "recommended_people"],
  ["guides", "guides", "Title"],
].map(([category, root, contentKey]) => Object.freeze({ category, root, subject: category, contentKey })));
const documents = Object.freeze({
  profileUser: checkedInDocument("src/features/Profile/api/query.ts", "UsersPermissionsUser"),
  settingsUser: checkedInDocument("src/features/Settings/api/mutation.ts", "UsersPermissionsUser"),
  updateAccount: checkedInDocument("src/features/Settings/api/mutation.ts", "UpdateAccount"),
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactSnapshot(value) {
  return value?.version === "music-live-account-snapshot/v1"
    && typeof value.snapshotId === "string" && value.snapshotId.length > 0
    && value.profile && typeof value.profile === "object"
    && typeof value.profile.accountDocumentId === "string"
    && typeof value.profile.publicMusic === "boolean"
    && Number.isSafeInteger(value.profile.profileRevision) && value.profile.profileRevision >= 0
    && /^[a-f0-9]{64}$/.test(String(value.profile.profileHash))
    && Number.isSafeInteger(value.profile.fieldCount) && value.profile.fieldCount > 0
    && value.database && typeof value.database === "object"
    && /^e2e-public-music-[a-z0-9-]+$/.test(String(value.database.namespace))
    && /^[a-f0-9]{64}$/.test(String(value.database.dumpHash))
    && Number.isSafeInteger(value.database.identityRows)
    && [0, 1].includes(value.database.identityRows);
}

function exactRestoration(value, snapshot) {
  return value?.restored === true
    && value.beforeHash === snapshot.database.dumpHash
    && value.afterHash === snapshot.database.dumpHash
    && value.profileHash === snapshot.profile.profileHash
    && value.profileRevision === snapshot.profile.profileRevision;
}

function clearGuard(value) {
  return value?.version === "music-e2e-mutation-guard/v1"
    && value.state === "clear" && value.reason === "none" && value.stage === "preflight";
}

function safeRecord({
  status, code, snapshotFailure, publicFlowFailure: retainedPublicFlowFailure, publicFlowSubstage,
  checks, counts, hashes, profileRevisions,
}) {
  return {
    schemaVersion: PREBROWSER_QUALIFICATION_VERSION,
    status,
    code,
    snapshotFailure,
    publicFlowFailure: retainedPublicFlowFailure,
    publicFlowSubstage,
    checks,
    counts,
    hashes,
    profileRevisions,
  };
}

export function unavailableMusicPrebrowserQualification() {
  return safeRecord({
    status: "unavailable",
    code: "not-run",
    snapshotFailure: clearSnapshotFailure(),
    publicFlowFailure: clearPublicFlowFailure(),
    publicFlowSubstage: "none",
    checks: clearChecks(),
    counts: { identityRows: 0, categoryQueries: 0, musicPrerequisites: 0 },
    hashes: {
      populatedDatabase: null, rollbackDatabase: null,
      populatedProfile: null, rollbackProfile: null,
      baselineDatabase: null, restoredBaselineDatabase: null,
      baselineProfile: null, restoredBaselineProfile: null,
      publicSlug: null,
    },
    profileRevisions: { populated: null, rollback: null, baseline: null, restoredBaseline: null },
  });
}

export function validateMusicPrebrowserLoopbackAuthority(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && exactKeys(value, [
      "stateOrigin", "tunesOrigin", "explorerOrigin", "strapiOrigin",
      "stateToken", "orchestrationToken", "fixtureToken", "namespace", "username",
      "accountDocumentId", "userDocumentId",
    ])
    && value.stateOrigin === "http://127.0.0.1:55174"
    && value.tunesOrigin === "http://127.0.0.1:55000"
    && value.explorerOrigin === "http://localhost:55173"
    && value.strapiOrigin === "http://127.0.0.1:51337"
    && /^[A-Za-z0-9_-]{43,128}$/.test(String(value.stateToken))
    && /^[A-Za-z0-9_-]{43,128}$/.test(String(value.orchestrationToken))
    && /^[A-Za-z0-9_-]{43,128}$/.test(String(value.fixtureToken))
    && new Set([value.stateToken, value.orchestrationToken, value.fixtureToken]).size === 3
    && /^e2e-public-music-[a-z0-9-]+$/.test(String(value.namespace))
    && value.username === `${value.namespace}-owner`
    && value.accountDocumentId === `${value.namespace}-account`
    && value.userDocumentId === `${value.namespace}-user`;
}

class MusicPrebrowserSnapshotFailure extends Error {
  constructor(stage, code) {
    super("pre-browser snapshot failed");
    this.name = "MusicPrebrowserSnapshotFailure";
    this.stage = stage;
    this.code = code;
  }
}

class MusicPrebrowserPublicFlowFailure extends Error {
  constructor(stage, code, publicFlowSubstage) {
    super("pre-browser public flow failed");
    this.name = "MusicPrebrowserPublicFlowFailure";
    this.stage = stage;
    this.code = code;
    this.publicFlowSubstage = publicFlowSubstage;
  }
}

class MusicPrebrowserResponseContractFailure extends Error {
  constructor() {
    super("pre-browser response contract failed");
    this.name = "MusicPrebrowserResponseContractFailure";
  }
}

export function createMusicPrebrowserPublicFlowFailure(stage, code, publicFlowSubstage = "none") {
  if (!PUBLIC_FLOW_STAGES.has(stage) || !PUBLIC_FLOW_FAILURE_CODES.has(code)
      || !validPublicFlowSubstage(stage, publicFlowSubstage)) {
    throw new Error("pre-browser public failure contract is invalid");
  }
  return new MusicPrebrowserPublicFlowFailure(stage, code, publicFlowSubstage);
}

function publicFlowFailure(stage, code, publicFlowSubstage = "none") {
  throw createMusicPrebrowserPublicFlowFailure(stage, code, publicFlowSubstage);
}

async function atPublicFlowBoundary(stage, operation, publicFlowSubstage = "none") {
  if (!PUBLIC_FLOW_STAGES.has(stage) || typeof operation !== "function"
      || !validPublicFlowSubstage(stage, publicFlowSubstage)) {
    throw new Error("pre-browser public boundary contract is invalid");
  }
  try {
    return await operation();
  } catch (error) {
    if (error instanceof MusicPrebrowserPublicFlowFailure) throw error;
    const code = error instanceof MusicPrebrowserResponseContractFailure
      ? "contract-invalid"
      : (timeoutFailure(error) ? "operation-timeout" : "operation-failed");
    throw createMusicPrebrowserPublicFlowFailure(stage, code, publicFlowSubstage);
  }
}

function requirePublicHttp(stage, response, expectedStatus, publicFlowSubstage = "none") {
  if (response?.status !== expectedStatus) publicFlowFailure(stage, "http-failed", publicFlowSubstage);
  return response;
}

function requirePublicContract(stage, valid, publicFlowSubstage = "none") {
  if (!valid) publicFlowFailure(stage, "contract-invalid", publicFlowSubstage);
}

function exactCaptureFailure(value) {
  return exactKeys(value, ["schemaVersion", "state", "stage", "code"])
    && value.schemaVersion === MUSIC_E2E_STATE_CAPTURE_FAILURE_VERSION
    && value.state === "failed"
    && CAPTURE_FAILURE_STAGES.has(value.stage) && value.stage !== "none"
    && CAPTURE_FAILURE_CODES.has(value.code) && value.code !== "none";
}

function timeoutFailure(error) {
  return error && typeof error === "object"
    && ["AbortError", "TimeoutError"].includes(String(error.name));
}

function normalizedSnapshotFailure(error) {
  if (error instanceof MusicPrebrowserSnapshotFailure) {
    return { stage: error.stage, code: error.code };
  }
  return { stage: "snapshot-store", code: timeoutFailure(error) ? "operation-timeout" : "operation-failed" };
}

function decodedSnapshotResponse(response) {
  if (response.status === 200) return { ok: true, snapshot: response.body };
  if (response.status === 500 && exactCaptureFailure(response.body)) {
    return { ok: false, failure: { stage: response.body.stage, code: response.body.code } };
  }
  if (Number.isSafeInteger(response.status) && response.status >= 400 && response.status <= 599
      && response.status !== 500) {
    return { ok: false, failure: { stage: "snapshot-store", code: "operation-failed" } };
  }
  return { ok: false, failure: { stage: "snapshot-store", code: "contract-invalid" } };
}

function qualificationHeaders(authority, expectedRevision) {
  return {
    Authorization: `Bearer ${authority.fixtureToken}`,
    "Content-Type": "application/json",
    "X-Music-Fixture-Expected-Revision": String(expectedRevision),
    "X-Music-Fixture-Namespace": authority.namespace,
    "X-Music-Fixture-Username": authority.username,
    "X-Music-Fixture-Account-Document-Id": authority.accountDocumentId,
    "X-Music-Fixture-User-Document-Id": authority.userDocumentId,
  };
}

async function boundedResponse(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000), ...options });
  let body;
  if (response.status !== 204) {
    const text = await response.text();
    if (Buffer.byteLength(text) > 64 * 1024) throw new MusicPrebrowserResponseContractFailure();
    try { body = text ? JSON.parse(text) : undefined; }
    catch { throw new MusicPrebrowserResponseContractFailure(); }
  }
  return { status: response.status, body };
}

function exactObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

const PUBLIC_SLUG_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const OWNER_DASHBOARD_KEYS = Object.freeze([
  "queueRevision", "playbackRevision", "songs", "currentlyPlaying", "playedSongs", "publication", "guestControls",
]);
const GUEST_CONTROL_KEYS = Object.freeze([
  "allowSongRequests", "allowGuestPlayOnDevice", "allowPlaylistSharing",
  "allowRecentlyPlayedVisibility", "allowQueueVisibility",
]);

function exactPublicationResponse(value, expectedMode, expectedSlug) {
  const body = exactObject(value);
  const publication = exactObject(body?.publication);
  return exactKeys(body, ["version", "publication"])
    && body.version === "music-publication/v1"
    && exactKeys(publication, ["mode", "publicSlug"])
    && publication.mode === expectedMode
    && typeof publication.publicSlug === "string"
    && PUBLIC_SLUG_PATTERN.test(publication.publicSlug)
    && (expectedSlug === undefined || publication.publicSlug === expectedSlug);
}

function exactPrivateOwnerDashboard(value, expectedSlug) {
  const body = exactObject(value);
  const publication = exactObject(body?.publication);
  const guestControls = exactObject(body?.guestControls);
  return exactKeys(body, OWNER_DASHBOARD_KEYS)
    && body.queueRevision === 0 && body.playbackRevision === 0
    && Array.isArray(body.songs) && body.songs.length === 0
    && body.currentlyPlaying === null
    && Array.isArray(body.playedSongs) && body.playedSongs.length === 0
    && exactKeys(publication, ["mode", "publicSlug"])
    && publication.mode === "private" && publication.publicSlug === expectedSlug
    && exactKeys(guestControls, GUEST_CONTROL_KEYS)
    && guestControls.allowSongRequests === true
    && guestControls.allowGuestPlayOnDevice === true
    && guestControls.allowPlaylistSharing === false
    && guestControls.allowRecentlyPlayedVisibility === true
    && guestControls.allowQueueVisibility === false;
}

function publicationUuidFromHash(hash) {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function validateMusicQualificationUpdateResponse({ status, body, accountDocumentId, expected } = {}) {
  const expectedFields = exactObject(expected);
  const keys = expectedFields ? Object.keys(expectedFields) : [];
  const allowed = new Set(["Bio", "public_profile", "public_recommendations", "public_music"]);
  if (status !== 200 || !/^e2e-public-music-[a-z0-9-]+-account$/.test(String(accountDocumentId))
      || keys.length < 1 || keys.length > 3 || keys.some((key) => !allowed.has(key))
      || keys.some((key) => typeof expectedFields[key] !== "string" || expectedFields[key].length > 256)
      || !exactKeys(body, ["data"])) return false;
  const updateAccount = exactObject(exactObject(body.data)?.updateAccount);
  return updateAccount?.documentId === accountDocumentId
    && keys.every((key) => updateAccount[key] === expectedFields[key]);
}

export function validateMusicQualificationPublicGateway({
  category, root, body, namespace, accountDocumentId,
} = {}) {
  if (!/^e2e-public-music-[a-z0-9-]+$/.test(String(namespace))
      || accountDocumentId !== `${namespace}-account`) return false;
  const data = exactObject(body);
  if (!data) return false;
  if (category === undefined && root === undefined) {
    const allowed = new Set([
      "username", "Account_Name", "Account_Type", "Primary_Address", "Bio", "bg_picture", "createdAt",
      "documentId", "profile_picture", "social_media", "Public_Profile_Address", "Feed_Data",
      "mobile_number_visibility", "mobile_number", "public_profile", "public_recommendations", "public_music",
      "public_movie", "public_books", "public_guides", "public_games", "public_apps", "public_products",
      "public_people", "pinned_nav_tabs", "auto_pinning",
    ]);
    if (Object.keys(data).some((key) => !allowed.has(key))
        || ("mobile_number" in data && data.mobile_number_visibility !== true)) return false;
    return data.documentId === accountDocumentId && data.username === `${namespace}-owner`
      && data.Account_Name === "Fixture Explorer" && data.public_profile === "Yes"
      && data.public_recommendations === "Yes" && data.public_music === "Yes";
  }
  const contract = publicCategoryContracts.find((entry) => entry.category === category && entry.root === root);
  if (!contract) return false;
  if (!exactKeys(data, [root])) return false;
  const values = data[root];
  const item = Array.isArray(values) && values.length === 1 ? exactObject(values[0]) : undefined;
  const expectedDocumentId = `${namespace}-${contract.subject}-list`;
  if (item?.documentId !== expectedDocumentId) return false;
  const listFields = {
    places: ["documentId", "List_Name", "slug", "Visibility", "List_Name_Details", "recommended_places"],
    movies: ["documentId", "List_Name", "slug", "Visibility", "cover_image", "recommended_movies"],
    books: ["documentId", "List_Name", "slug", "visibility", "cover_image", "recommended_books"],
    games: ["documentId", "List_Name", "slug", "Visibility", "cover_image", "recommended_games"],
    apps: ["documentId", "List_Name", "slug", "Visibility", "cover_image", "recommended_apps"],
    products: ["documentId", "List_Name", "slug", "Visibility", "cover_image", "recommended_products"],
    people: ["documentId", "List_Name", "slug", "Visibility", "recommended_people"],
    guides: ["documentId", "Title", "slug", "Visibility", "Guide_Media"],
  }[category];
  if (!listFields || Object.keys(item).some((key) => !listFields.includes(key))) return false;
  if (contract.contentKey === "Title") return item.Title === "Fixture Guide";
  const content = item[contract.contentKey];
  const child = Array.isArray(content) && content.length === 1 ? exactObject(content[0]) : undefined;
  const itemFields = {
    places: ["documentId", "media_details", "Media", "Place_Details"],
    movies: ["documentId", "poster_path"], books: ["documentId", "cover_url"],
    games: ["documentId", "cover_url", "media_details"], apps: ["documentId", "logo_url"],
    products: ["documentId", "logo_url", "images"], people: ["documentId", "avatar_path", "media_details"],
  }[category];
  return child?.documentId === `${expectedDocumentId}-item`
    && itemFields && Object.keys(child).every((key) => itemFields.includes(key));
}

export function validateMusicQualificationQueueResponse(value, songInputs, priorRevision) {
  if (!exactKeys(value, ["version", "revision", "songs"])
      || value.version !== "music-queue/v1"
      || !Array.isArray(songInputs) || songInputs.length !== 3
      || !Number.isSafeInteger(priorRevision) || priorRevision < 0
      || value.revision !== priorRevision + 1
      || !Array.isArray(value.songs) || value.songs.length !== songInputs.length) return undefined;
  const queueIds = [];
  let ownerId;
  for (const [index, expectedSong] of songInputs.entries()) {
    const song = exactObject(value.songs[index]);
    if (!exactKeys(song, [
      "id", "userId", "youtubeId", "title", "artist", "thumbnailUrl", "position", "status", "playedAt",
    ])
        || !Number.isSafeInteger(song.id) || song.id < 1 || queueIds.includes(song.id)
        || !Number.isSafeInteger(song.userId) || song.userId < 1
        || (ownerId !== undefined && song.userId !== ownerId)
        || song.youtubeId !== expectedSong.youtubeId || song.title !== expectedSong.title
        || song.artist !== expectedSong.artist || song.thumbnailUrl !== expectedSong.thumbnailUrl
        || song.position !== index || song.status !== "queued" || song.playedAt !== null) return undefined;
    ownerId ??= song.userId;
    queueIds.push(song.id);
  }
  return { revision: value.revision, queueSongIds: queueIds };
}

export function createLoopbackPrebrowserQualificationAdapter({
  authority, initialSnapshot, fetchImpl = fetch, publicCapabilityProbe,
} = {}) {
  if (!validateMusicPrebrowserLoopbackAuthority(authority) || !exactSnapshot(initialSnapshot) || typeof fetchImpl !== "function"
      || !(publicCapabilityProbe === undefined || typeof publicCapabilityProbe === "function")
      || initialSnapshot.database.namespace !== authority.namespace
      || initialSnapshot.profile.accountDocumentId !== authority.accountDocumentId) {
    throw new Error("loopback pre-browser qualification authority is invalid");
  }
  const fixtureHeaders = { Authorization: `Bearer ${authority.fixtureToken}`, "Content-Type": "application/json" };
  const ownerHeaders = (qualifierJwt, idempotencyKey) => ({
    Authorization: `Bearer ${qualifierJwt}`,
    Origin: authority.explorerOrigin,
    "Content-Type": "application/json",
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  });
  const tuple = {
    namespace: authority.namespace,
    username: authority.username,
    accountDocumentId: authority.accountDocumentId,
    userDocumentId: authority.userDocumentId,
  };
  const namespaceHash = sha256(authority.namespace);
  const privatePublicationUuid = publicationUuidFromHash(sha256(`${authority.namespace}\0private`));
  const publicPublicationUuid = publicationUuidFromHash(namespaceHash);
  if (privatePublicationUuid === publicPublicationUuid) {
    throw new Error("loopback pre-browser publication authority is invalid");
  }
  const stateRequest = (path, token, body) => boundedResponse(fetchImpl, `${authority.stateOrigin}${path}`, {
    method: path === "/health" ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const graphql = (origin, document, variables, headers = fixtureHeaders) => boundedResponse(fetchImpl, `${origin}/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: document, variables }),
  });
  const privateProfile = (path, authorization, body) => boundedResponse(fetchImpl, `${authority.strapiOrigin}${path}`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    async ensureEphemeralOwner() {
      const response = await boundedResponse(fetchImpl, `${authority.tunesOrigin}/api/music/identity/ensure`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authority.fixtureToken}`, Origin: authority.explorerOrigin },
      });
      const body = exactObject(response.body);
      const identity = exactObject(body?.identity);
      const credential = exactObject(body?.credential);
      if (response.status !== 200 || identity?.status !== "active" || typeof credential?.token !== "string") {
        throw new Error("ephemeral owner ensure failed");
      }
      return credential.token;
    },
    async capture() {
      let response;
      try { response = await stateRequest("/snapshot", authority.stateToken); }
      catch (error) {
        const failure = normalizedSnapshotFailure(error);
        throw new MusicPrebrowserSnapshotFailure(failure.stage, failure.code);
      }
      const decoded = decodedSnapshotResponse(response);
      if (!decoded.ok) throw new MusicPrebrowserSnapshotFailure(decoded.failure.stage, decoded.failure.code);
      return decoded.snapshot;
    },
    async verifyRollbackProbe({ qualifierJwt, profileRevision }) {
      const playlist = await boundedResponse(fetchImpl, `${authority.tunesOrigin}/api/playlists`, {
        method: "POST",
        headers: ownerHeaders(qualifierJwt, "prebrowser-rollback-probe"),
        body: JSON.stringify({ name: "Pre-browser rollback probe", description: "Disposable qualification mutation" }),
      });
      if (playlist.status !== 201 || !Number.isSafeInteger(exactObject(playlist.body)?.id)) {
        throw new Error("database rollback probe failed");
      }
      for (const document of [documents.profileUser, documents.settingsUser]) {
        const identity = await graphql(authority.strapiOrigin, document, { documentId: authority.userDocumentId });
        const user = exactObject(exactObject(identity.body)?.data)?.usersPermissionsUser;
        if (identity.status !== 200 || exactObject(user)?.documentId !== authority.userDocumentId
            || exactObject(user)?.accounts?.[0]?.documentId !== authority.accountDocumentId) {
          throw new Error("profile query capability failed");
        }
      }

      const privateSnapshot = await privateProfile(
        "/__music-fixture/profile-state/snapshot", `Bearer ${authority.fixtureToken}`, tuple,
      );
      const privateBody = exactObject(privateSnapshot.body);
      if (privateSnapshot.status !== 200 || privateBody?.version !== "music-fixture-profile-state/v1"
          || !exactObject(privateBody?.snapshot)) throw new Error("private profile snapshot capability failed");
      const wrongToken = await privateProfile(
        "/__music-fixture/profile-state/snapshot", "Bearer invalid", tuple,
      );
      const wrongTuple = await privateProfile(
        "/__music-fixture/profile-state/snapshot", `Bearer ${authority.fixtureToken}`,
        { ...tuple, userDocumentId: `${authority.namespace}-other-user` },
      );
      if (wrongToken.status !== 403 || wrongTuple.status !== 403) throw new Error("private profile authority did not fail closed");

      const variables = { documentId: authority.accountDocumentId, data: { Bio: "Pre-browser qualification rollback probe" } };
      const current = await graphql(
        authority.strapiOrigin, documents.updateAccount, variables,
        qualificationHeaders(authority, profileRevision),
      );
      const stale = await graphql(
        authority.strapiOrigin, documents.updateAccount, variables,
        qualificationHeaders(authority, profileRevision),
      );
      const proxied = await graphql(
        authority.explorerOrigin, documents.updateAccount, variables,
        qualificationHeaders(authority, profileRevision),
      );
      if (!validateMusicQualificationUpdateResponse({
        status: current.status,
        body: current.body,
        accountDocumentId: authority.accountDocumentId,
        expected: variables.data,
      })
          || stale.status !== 409 || proxied.status !== 403) {
        throw new Error("profile optimistic revision capability failed");
      }
      const privateRestore = await privateProfile(
        "/__music-fixture/profile-state/restore", `Bearer ${authority.fixtureToken}`,
        { ...tuple, snapshot: privateBody.snapshot },
      );
      if (privateRestore.status !== 200 || exactObject(privateRestore.body)?.restored !== true) {
        throw new Error("private profile restore capability failed");
      }
      return { profileCapability: true, privateAuthority: true, staleRejected: true };
    },
    async restore(snapshot) {
      const response = await stateRequest("/restore", authority.stateToken, snapshot);
      if (response.status !== 200) throw new Error("qualification phase restore failed");
      return response.body;
    },
    async verifyPublicProfileAndMusic({ qualifierJwt, profileRevision }) {
      const visibilityVariables = {
        documentId: authority.accountDocumentId,
        data: { public_profile: "Yes", public_recommendations: "Yes", public_music: "Yes" },
      };
      const visible = await atPublicFlowBoundary("visibility", () => graphql(
        authority.strapiOrigin, documents.updateAccount, visibilityVariables,
        qualificationHeaders(authority, profileRevision),
      ));
      requirePublicHttp("visibility", visible, 200);
      requirePublicContract("visibility", validateMusicQualificationUpdateResponse({
        status: visible.status,
        body: visible.body,
        accountDocumentId: authority.accountDocumentId,
        expected: visibilityVariables.data,
      }));

      const privatePublication = await atPublicFlowBoundary("owner", () => boundedResponse(
        fetchImpl, `${authority.tunesOrigin}/api/music/publication`, {
          method: "POST",
          headers: ownerHeaders(qualifierJwt, `tunes-share-v1-${Date.now()}-${privatePublicationUuid}`),
          body: JSON.stringify({ mode: "private" }),
        },
      ), "transition-response");
      requirePublicHttp("owner", privatePublication, 200, "transition-response");
      requirePublicContract("owner", exactPublicationResponse(privatePublication.body, "private"), "transition-response");
      const privatePublicSlug = exactObject(privatePublication.body)?.publication?.publicSlug;

      const dashboard = await atPublicFlowBoundary("owner", () => boundedResponse(fetchImpl, `${authority.tunesOrigin}/api/music/dashboard`, {
        headers: ownerHeaders(qualifierJwt),
      }), "dashboard-response");
      requirePublicHttp("owner", dashboard, 200, "dashboard-response");
      const dashboardBody = exactObject(dashboard.body);
      requirePublicContract("owner", exactPrivateOwnerDashboard(dashboardBody, privatePublicSlug), "dashboard-response");
      const playlist = await atPublicFlowBoundary("playlist", () => boundedResponse(fetchImpl, `${authority.tunesOrigin}/api/playlists`, {
        method: "POST", headers: ownerHeaders(qualifierJwt, "prebrowser-public-playlist"),
        body: JSON.stringify({ name: "Pre-browser public fixture", description: "Disposable public capability" }),
      }));
      requirePublicHttp("playlist", playlist, 201);
      const playlistId = exactObject(playlist.body)?.id;
      requirePublicContract("playlist", Number.isSafeInteger(playlistId) && playlistId > 0);
      const songInputs = [
        { youtubeId: "abcdefghijk", title: "Fixture history song", artist: "Fixture artist", thumbnailUrl: `${authority.explorerOrigin}/images/tuneslogo.png` },
        { youtubeId: "lmnopqrstuv", title: "Fixture playing song", artist: "Fixture artist", thumbnailUrl: `${authority.explorerOrigin}/images/tuneslogo.png` },
        { youtubeId: "wxyzABC1234", title: "Fixture queued song", artist: "Fixture artist", thumbnailUrl: `${authority.explorerOrigin}/images/tuneslogo.png` },
      ];
      const songIds = [];
      for (const [index, song] of songInputs.entries()) {
        const stage = `saved-song-${index + 1}`;
        const saved = await atPublicFlowBoundary(stage, () => boundedResponse(fetchImpl, `${authority.tunesOrigin}/api/playlists/${playlistId}/songs`, {
          method: "POST", headers: ownerHeaders(qualifierJwt, `prebrowser-public-song-${index + 1}`),
          body: JSON.stringify(song),
        }));
        requirePublicHttp(stage, saved, 201);
        const id = exactObject(saved.body)?.id;
        requirePublicContract(stage, Number.isSafeInteger(id) && id > 0 && !songIds.includes(id));
        songIds.push(id);
      }
      const visibility = await atPublicFlowBoundary("playlist-visible", () => boundedResponse(fetchImpl, `${authority.tunesOrigin}/api/playlists/${playlistId}/visibility`, {
        method: "PATCH", headers: ownerHeaders(qualifierJwt, "prebrowser-public-visibility"),
        body: JSON.stringify({ isVisibleToGuests: true }),
      }));
      requirePublicHttp("playlist-visible", visibility, 204);
      const queue = await atPublicFlowBoundary("queue", () => boundedResponse(fetchImpl, `${authority.tunesOrigin}/api/music/queue/replace`, {
        method: "POST", headers: ownerHeaders(qualifierJwt, "prebrowser-public-queue"),
        body: JSON.stringify({ expectedRevision: dashboardBody.queueRevision,
          songs: songIds.map((songId) => ({ playlistId, songId })) }),
      }));
      requirePublicHttp("queue", queue, 200);
      const queueState = validateMusicQualificationQueueResponse(queue.body, songInputs, dashboardBody.queueRevision);
      requirePublicContract("queue", Boolean(queueState));
      const queueRevision = queueState.revision;
      let playbackRevision = dashboardBody.playbackRevision;
      let revision = queueRevision;
      for (const [index, queueSongId] of queueState.queueSongIds.slice(0, 2).entries()) {
        const stage = `playback-${index + 1}`;
        const playback = await atPublicFlowBoundary(stage, () => boundedResponse(fetchImpl, `${authority.tunesOrigin}/api/playlist/currently-playing`, {
          method: "POST", headers: ownerHeaders(qualifierJwt, `prebrowser-public-playback-${index + 1}`),
          body: JSON.stringify({ songId: queueSongId, expectedRevision: revision, expectedPlaybackRevision: playbackRevision }),
        }));
        requirePublicHttp(stage, playback, 200);
        const playbackBody = exactObject(playback.body);
        requirePublicContract(stage, exactKeys(playbackBody, ["version", "revision", "playbackRevision", "song"])
          && playbackBody.version === "music-playback/v1"
          && Number.isSafeInteger(playbackBody.revision) && playbackBody.revision > revision
          && Number.isSafeInteger(playbackBody.playbackRevision) && playbackBody.playbackRevision > playbackRevision
          && exactObject(playbackBody.song)?.id === queueSongId);
        revision = playbackBody.revision;
        playbackRevision = playbackBody.playbackRevision;
      }
      const controls = {
        allowSongRequests: true, allowGuestPlayOnDevice: true, allowPlaylistSharing: true,
        allowRecentlyPlayedVisibility: true, allowQueueVisibility: true,
      };
      const controlResponse = await atPublicFlowBoundary("controls", () => boundedResponse(fetchImpl, `${authority.tunesOrigin}/api/music/guest-controls`, {
        method: "PATCH", headers: ownerHeaders(qualifierJwt, "prebrowser-public-controls"), body: JSON.stringify(controls),
      }));
      requirePublicHttp("controls", controlResponse, 200);
      const controlBody = exactObject(controlResponse.body);
      requirePublicContract("controls", exactKeys(controlBody, Object.keys(controls))
        && Object.entries(controls).every(([key, enabled]) => controlBody[key] === enabled));
      const publication = await atPublicFlowBoundary("publication", () => boundedResponse(fetchImpl, `${authority.tunesOrigin}/api/music/publication`, {
        method: "POST", headers: ownerHeaders(qualifierJwt, `tunes-share-v1-${Date.now()}-${publicPublicationUuid}`),
        body: JSON.stringify({ mode: "public" }),
      }));
      requirePublicHttp("publication", publication, 200);
      const publicationBody = exactObject(publication.body);
      const publicationState = exactObject(publicationBody?.publication);
      const publicSlug = publicationState?.publicSlug;
      requirePublicContract("publication", exactPublicationResponse(publicationBody, "public", privatePublicSlug)
          && publicSlug !== "qualification-public");

      const publicDocuments = [
        { path: `/api/explorers/v1/profiles/${encodeURIComponent(authority.username)}` },
        ...publicCategoryContracts.map(({ category, root }) => ({
          category, root,
          path: `/api/explorers/v1/profiles/${encodeURIComponent(authority.username)}/recommendations/${category}`,
        })),
      ];
      let categoryQueries = 0;
      for (const [scope, origin] of [
        ["direct", authority.strapiOrigin],
        ["proxy", authority.explorerOrigin],
      ]) {
        for (const entry of publicDocuments) {
          const stage = entry.category
            ? `${scope}-public-category-${entry.category}`
            : `${scope}-public-profile`;
          const response = await atPublicFlowBoundary(stage, () => boundedResponse(fetchImpl, `${origin}${entry.path}`));
          requirePublicHttp(stage, response, 200);
          requirePublicContract(stage, validateMusicQualificationPublicGateway({
            category: entry.category,
            root: entry.root,
            body: response.body,
            namespace: authority.namespace,
            accountDocumentId: authority.accountDocumentId,
          }));
          categoryQueries += 1;
        }
      }
      for (const [stage, origin] of [
        ["direct-public-music", authority.tunesOrigin],
        ["proxy-public-music", authority.explorerOrigin],
      ]) {
        const resource = await atPublicFlowBoundary(stage, () => boundedResponse(
          fetchImpl, `${origin}/api/music/public-resource/v1/${encodeURIComponent(publicSlug)}`,
        ));
        requirePublicHttp(stage, resource, 200);
        const body = exactObject(resource.body);
        requirePublicContract(stage, body?.version === "music-public-resource/v1"
            && exactObject(body?.currentlyPlaying)?.title === "Fixture playing song"
            && exactObject(body?.queue)?.items?.some((song) => song?.title === "Fixture queued song")
            && exactObject(body?.recentlyPlayed)?.items?.some((song) => song?.title === "Fixture history song")
            && exactObject(body?.playlists)?.items?.some((entry) => entry?.name === "Pre-browser public fixture")
            && Object.entries(controls).every(([key, enabled]) => exactObject(body?.permissions)?.[key] === enabled));
      }
      if (publicCapabilityProbe) {
        try {
          const probePassed = await publicCapabilityProbe({ publicSlug });
          if (probePassed !== true) {
            throw createMusicPrebrowserPublicFlowFailure("proxy-public-music", "contract-invalid");
          }
        } catch (error) {
          if (error instanceof MusicPrebrowserPublicFlowFailure) throw error;
          throw createMusicPrebrowserPublicFlowFailure("proxy-public-music", "operation-failed");
        }
      }
      return { publicSlug, categoryQueries, musicPrerequisites: 9 };
    },
    async restoreBaseline(snapshot) {
      const response = await stateRequest("/restore-final", authority.orchestrationToken, snapshot);
      if (response.status !== 200) throw new Error("initial baseline restore failed");
      return response.body;
    },
    async verifyEphemeralOwnerRetired(qualifierJwt) {
      const response = await boundedResponse(fetchImpl, `${authority.tunesOrigin}/api/playlists`, {
        headers: ownerHeaders(qualifierJwt),
      });
      return [401, 403].includes(response.status);
    },
    async readGuard() {
      const response = await stateRequest("/health", authority.stateToken);
      if (response.status !== 200) throw new Error("mutation guard inspection failed");
      return exactObject(response.body)?.mutationGuard;
    },
  };
}

export async function runLoopbackMusicPrebrowserQualification({
  authority, initialSnapshot, fetchImpl = fetch, publicCapabilityProbe,
} = {}) {
  return runMusicPrebrowserQualification({
    initialSnapshot,
    adapter: createLoopbackPrebrowserQualificationAdapter({
      authority, initialSnapshot, fetchImpl, publicCapabilityProbe,
    }),
  });
}

export async function runMusicPrebrowserQualification({ initialSnapshot, adapter } = {}) {
  if (!exactSnapshot(initialSnapshot) || !adapter || typeof adapter !== "object"
      || [
        "ensureEphemeralOwner", "capture", "verifyRollbackProbe", "restore",
        "verifyPublicProfileAndMusic", "restoreBaseline", "verifyEphemeralOwnerRetired", "readGuard",
      ].some((name) => typeof adapter[name] !== "function")) {
    throw new Error("pre-browser qualification contract is invalid");
  }
  const checks = clearChecks();
  const counts = { identityRows: 0, categoryQueries: 0, musicPrerequisites: 0 };
  const hashes = {
    populatedDatabase: null,
    rollbackDatabase: null,
    populatedProfile: null,
    rollbackProfile: null,
    baselineDatabase: initialSnapshot.database.dumpHash,
    restoredBaselineDatabase: null,
    baselineProfile: initialSnapshot.profile.profileHash,
    restoredBaselineProfile: null,
    publicSlug: null,
  };
  const profileRevisions = {
    populated: null,
    rollback: null,
    baseline: initialSnapshot.profile.profileRevision,
    restoredBaseline: null,
  };
  let code = "unexpected-failure";
  let snapshotFailure = clearSnapshotFailure();
  let retainedPublicFlowFailure = clearPublicFlowFailure();
  let retainedPublicFlowSubstage = "none";
  let qualifierJwt = "";
  let qualifierJwtFingerprint;
  let corePassed = false;

  try {
    code = "identity-ensure-failed";
    qualifierJwt = await adapter.ensureEphemeralOwner();
    if (typeof qualifierJwt !== "string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(qualifierJwt)
        || Buffer.byteLength(qualifierJwt) > 4_096) throw new Error("invalid ephemeral owner authority");
    qualifierJwtFingerprint = sha256(qualifierJwt);

    code = "populated-snapshot-failed";
    let populated;
    try { populated = await adapter.capture(); }
    catch (error) {
      snapshotFailure = { phase: "populated", ...normalizedSnapshotFailure(error) };
      throw error;
    }
    if (!exactSnapshot(populated) || populated.database.namespace !== initialSnapshot.database.namespace
        || populated.profile.accountDocumentId !== initialSnapshot.profile.accountDocumentId) {
      snapshotFailure = { phase: "populated", stage: "snapshot-store", code: "contract-invalid" };
      throw new Error("invalid populated qualification snapshot");
    }
    counts.identityRows = populated.database.identityRows;
    if (populated.database.identityRows !== 1) {
      code = "populated-identity-cardinality";
      throw new Error("invalid populated qualification identity cardinality");
    }
    hashes.populatedDatabase = populated.database.dumpHash;
    hashes.populatedProfile = populated.profile.profileHash;
    profileRevisions.populated = populated.profile.profileRevision;

    code = "rollback-probe-failed";
    const rollbackProbe = await adapter.verifyRollbackProbe({
      qualifierJwt,
      profileRevision: populated.profile.profileRevision,
    });
    if (rollbackProbe?.profileCapability !== true || rollbackProbe?.privateAuthority !== true
        || rollbackProbe?.staleRejected !== true) throw new Error("rollback probe was incomplete");
    checks.profileCapability = true;
    checks.privateAuthority = true;
    checks.staleRejected = true;

    code = "phase-restore-failed";
    const rollback = await adapter.restore(populated);
    if (!exactRestoration(rollback, populated)) throw new Error("populated rollback mismatch");
    hashes.rollbackDatabase = rollback.afterHash;
    hashes.rollbackProfile = rollback.profileHash;
    profileRevisions.rollback = rollback.profileRevision;
    checks.populatedRollback = true;

    code = "populated-snapshot-failed";
    let publicSnapshot;
    try { publicSnapshot = await adapter.capture(); }
    catch (error) {
      snapshotFailure = { phase: "public", ...normalizedSnapshotFailure(error) };
      throw error;
    }
    if (!exactSnapshot(publicSnapshot) || publicSnapshot.database.namespace !== initialSnapshot.database.namespace
        || publicSnapshot.profile.accountDocumentId !== initialSnapshot.profile.accountDocumentId) {
      snapshotFailure = { phase: "public", stage: "snapshot-store", code: "contract-invalid" };
      throw new Error("invalid public qualification snapshot");
    }
    counts.identityRows = publicSnapshot.database.identityRows;
    if (publicSnapshot.database.identityRows !== 1) {
      code = "populated-identity-cardinality";
      throw new Error("invalid public qualification identity cardinality");
    }

    code = "public-flow-failed";
    let publicCapability;
    try {
      publicCapability = await adapter.verifyPublicProfileAndMusic({
        qualifierJwt,
        profileRevision: publicSnapshot.profile.profileRevision,
      });
      if (typeof publicCapability?.publicSlug !== "string"
          || !/^[A-Za-z0-9_-]{8,128}$/.test(publicCapability.publicSlug)
          || publicCapability.publicSlug === "qualification-public"
          || publicCapability.categoryQueries !== 18
          || !Number.isSafeInteger(publicCapability.musicPrerequisites)
          || publicCapability.musicPrerequisites < 1) {
        retainedPublicFlowFailure = { stage: "proxy-public-music", code: "contract-invalid" };
        throw createMusicPrebrowserPublicFlowFailure("proxy-public-music", "contract-invalid");
      }
    } catch (error) {
      if (error instanceof MusicPrebrowserPublicFlowFailure) {
        retainedPublicFlowFailure = { stage: error.stage, code: error.code };
        retainedPublicFlowSubstage = error.publicFlowSubstage;
      } else {
        code = "unexpected-failure";
      }
      throw error;
    }
    counts.categoryQueries = publicCapability.categoryQueries;
    counts.musicPrerequisites = publicCapability.musicPrerequisites;
    hashes.publicSlug = sha256(publicCapability.publicSlug);
    checks.publicProjection = true;
    checks.musicPrerequisites = true;

    code = "phase-restore-failed";
    const publicRestore = await adapter.restore(publicSnapshot);
    if (!exactRestoration(publicRestore, publicSnapshot)) throw new Error("public capability rollback mismatch");
    corePassed = true;
    code = "none";
  } catch {
    // Only the fixed code selected before each operation is retained.
  } finally {
    try {
      const baselineRestore = await adapter.restoreBaseline(initialSnapshot);
      if (!exactRestoration(baselineRestore, initialSnapshot)) throw new Error("baseline mismatch");
      hashes.restoredBaselineDatabase = baselineRestore.afterHash;
      hashes.restoredBaselineProfile = baselineRestore.profileHash;
      profileRevisions.restoredBaseline = baselineRestore.profileRevision;
      checks.baselineRestored = true;
    } catch {
      code = "baseline-restore-failed";
      corePassed = false;
    }
    if (qualifierJwt) {
      try {
        checks.ephemeralOwnerRetired = await adapter.verifyEphemeralOwnerRetired(qualifierJwt) === true;
        if (!checks.ephemeralOwnerRetired) {
          code = "ephemeral-owner-not-retired";
          corePassed = false;
        }
      } catch {
        code = "ephemeral-owner-not-retired";
        corePassed = false;
      }
    }
    qualifierJwt = "";
    try {
      checks.guardClear = clearGuard(await adapter.readGuard());
      if (!checks.guardClear) {
        code = "guard-not-clear";
        corePassed = false;
      }
    } catch {
      code = "guard-not-clear";
      corePassed = false;
    }
  }

  const ok = corePassed && checks.baselineRestored && checks.ephemeralOwnerRetired && checks.guardClear;
  const record = safeRecord({
    status: ok ? "passed" : "failed",
    code: ok ? "none" : code,
    snapshotFailure,
    publicFlowFailure: retainedPublicFlowFailure,
    publicFlowSubstage: retainedPublicFlowSubstage,
    checks,
    counts,
    hashes,
    profileRevisions,
  });
  return {
    ok,
    record,
    ...(ok ? { qualifierJwtFingerprint } : {}),
  };
}
