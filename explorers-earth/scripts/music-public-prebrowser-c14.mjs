import {
  runLoopbackMusicPrebrowserQualification,
  unavailableMusicPrebrowserQualification,
  validateMusicPrebrowserLoopbackAuthority,
  validateMusicPrebrowserQualificationRecord,
} from "./music-public-prebrowser-qualification.mjs";
import {
  decodeMusicInitialSnapshotResponse,
  musicInitialSnapshotRequestFailure,
  readMusicInitialSnapshotHttpResponse,
} from "./music-public-initial-snapshot.mjs";

export const MUSIC_PREBROWSER_C14_VERSION = "explorers-public-prebrowser-c14/v1";
export const MUSIC_PREBROWSER_C14_ACK = "TASK4_FULL_FIXTURE_PREBROWSER_QUALIFICATION_V1";

/**
 * Browser-free full-fixture integration boundary. The caller owns the already
 * reviewed fixture lifecycle; this function performs only the exact production
 * pre-browser phase and returns safe fixed metadata. It allocates no browser,
 * callback credential, auth file, report directory, or retained raw response.
 */
export async function runMusicPrebrowserC14Integration({
  ack, authority, initialSnapshot, fetchImpl = fetch, publicCapabilityProbe,
} = {}) {
  if (ack !== MUSIC_PREBROWSER_C14_ACK) {
    throw new Error("C14 full-fixture qualification refused");
  }
  const result = await runLoopbackMusicPrebrowserQualification({
    authority, initialSnapshot, fetchImpl, publicCapabilityProbe,
  });
  if (!validateMusicPrebrowserQualificationRecord(result.record)) {
    throw new Error("C14 full-fixture qualification contract failed");
  }
  const passed = result.ok === true && result.record.status === "passed"
    && result.record.counts.categoryQueries === 18
    && result.record.counts.musicPrerequisites === 9
    && result.record.checks.baselineRestored === true
    && result.record.checks.ephemeralOwnerRetired === true
    && result.record.checks.guardClear === true;
  return {
    schemaVersion: MUSIC_PREBROWSER_C14_VERSION,
    status: passed ? "passed" : "failed",
    counts: {
      graphqlOperations: passed ? 20 : 0,
      publicMusicResources: passed ? 2 : 0,
      queueSongs: passed ? 3 : 0,
    },
    qualification: result.record,
  };
}

/**
 * Real C14 entrypoint for an already-owned full fixture. It shares the live
 * runner's initial-snapshot codec and exact qualifier phase. No module import
 * performs I/O, and refusal happens before the first request.
 */
export async function runMusicPrebrowserC14AgainstFullFixture({
  ack, authority, fetchImpl = fetch, publicCapabilityProbe,
} = {}) {
  if (ack !== MUSIC_PREBROWSER_C14_ACK || !validateMusicPrebrowserLoopbackAuthority(authority)
      || typeof fetchImpl !== "function") {
    throw new Error("C14 full-fixture qualification refused");
  }
  let initial;
  try {
    const response = await fetchImpl(`${authority.stateOrigin}/snapshot`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authority.orchestrationToken}` },
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await readMusicInitialSnapshotHttpResponse(response);
    const decoded = decodeMusicInitialSnapshotResponse(payload);
    if (!decoded.ok) {
      return {
        schemaVersion: MUSIC_PREBROWSER_C14_VERSION,
        status: "failed",
        counts: { graphqlOperations: 0, publicMusicResources: 0, queueSongs: 0 },
        initialSnapshotQualification: decoded.record,
        qualification: unavailableMusicPrebrowserQualification(),
      };
    }
    initial = decoded;
  } catch (error) {
    return {
      schemaVersion: MUSIC_PREBROWSER_C14_VERSION,
      status: "failed",
      counts: { graphqlOperations: 0, publicMusicResources: 0, queueSongs: 0 },
      initialSnapshotQualification: musicInitialSnapshotRequestFailure(error),
      qualification: unavailableMusicPrebrowserQualification(),
    };
  }
  const outcome = await runMusicPrebrowserC14Integration({
    ack,
    authority,
    initialSnapshot: initial.snapshot,
    fetchImpl,
    publicCapabilityProbe,
  });
  return { ...outcome, initialSnapshotQualification: initial.record };
}
