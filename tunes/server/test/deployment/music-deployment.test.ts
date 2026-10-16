import { describe, expect, it, vi } from "vitest";
import {
  DeploymentController,
  createMusicCohortEntryResolver,
  createGateAttestation,
  parseMusicCohortConfiguration,
  rollbackCompatibilityFloorMarker,
  resolveMusicEntryPolicy,
  type DeploymentRuntime,
  type DeploymentState,
  type ImageCandidate,
} from "../../deployment/music-deployment";

it("preserves the established rollback compatibility floors for additive migrations", () => {
  expect(rollbackCompatibilityFloorMarker("0030_explorers_media_purpose_guard"))
    .toBe("0029_explorers_recommendations");
  expect(rollbackCompatibilityFloorMarker("0031_explorers_content_revision"))
    .toBe("0031_explorers_content_revision");
  expect(rollbackCompatibilityFloorMarker("0032_explorers_owner_page_indexes"))
    .toBe("0032_explorers_owner_page_indexes");
  expect(rollbackCompatibilityFloorMarker("0035_explorers_book_cover_import"))
    .toBe("0035_explorers_book_cover_import");
  expect(rollbackCompatibilityFloorMarker("0018_transactional_queue_replacement"))
    .toBe("0017_publication_idempotency_key_retirement");
  expect(rollbackCompatibilityFloorMarker("0019_queue_visibility_control"))
    .toBe("0018_transactional_queue_replacement");
  expect(rollbackCompatibilityFloorMarker("0020_public_snapshot_revision"))
    .toBe("0019_queue_visibility_control");
});

const prior: ImageCandidate = {
  digest: `sha256:${"1".repeat(64)}`,
  commit: "1111111111111111111111111111111111111111",
  migrationMarker: "containment-no-schema-change",
};
const candidate: ImageCandidate = {
  digest: `sha256:${"2".repeat(64)}`,
  commit: "2222222222222222222222222222222222222222",
  migrationMarker: "containment-no-schema-change",
};
const schemaCandidate: ImageCandidate = {
  digest: `sha256:${"4".repeat(64)}`,
  commit: "4444444444444444444444444444444444444444",
  migrationMarker: "0017_publication_idempotency_key_retirement",
};
const currentAdditiveCandidate: ImageCandidate = {
  digest: `sha256:${"5".repeat(64)}`,
  commit: "5555555555555555555555555555555555555555",
  migrationMarker: "0020_public_snapshot_revision",
};
const priorAdditiveCandidate: ImageCandidate = {
  digest: `sha256:${"7".repeat(64)}`,
  commit: "7777777777777777777777777777777777777777",
  migrationMarker: "0019_queue_visibility_control",
};

function initialState(): DeploymentState {
  return {
    activeSlot: "blue",
    active: prior,
    secureHistory: [prior],
    rollbackFloorDigest: prior.digest,
    migrationCompatibilityFloorDigest: undefined,
  };
}

function runtime(failAt?: "gate" | "readiness" | "promotion") {
  const events: string[] = [];
  let serving = prior.digest;
  const implementation: DeploymentRuntime = {
    pull: async (image) => { events.push(`pull:${image.digest}`); },
    runContainmentGate: async (image) => {
      events.push(`gate:${image.digest}`);
      if (failAt === "gate") throw new Error("gate failed");
      return createGateAttestation(image, "test-attestation-key-that-is-long-enough");
    },
    startPrivateCandidate: async (slot, image) => {
      events.push(`private:${slot}:${image.digest}`);
    },
    checkReadiness: async (slot, image, attestation) => {
      events.push(`ready:${slot}:${image.digest}:${attestation.signature.slice(0, 8)}`);
      return failAt !== "readiness";
    },
    promoteAtomically: async (slot, image) => {
      events.push(`promote:${slot}:${image.digest}`);
      if (failAt === "promotion") throw new Error("promotion failed");
      serving = image.digest;
    },
    restoreTraffic: async (slot, image) => {
      events.push(`restore:${slot}:${image.digest}`);
      serving = image.digest;
    },
    stopCandidate: async (slot) => { events.push(`stop:${slot}`); },
  };
  return { implementation, events, serving: () => serving };
}

describe("immutable Music deployment rehearsal", () => {
  it("keeps the exact prior digest serving when the same-image gate fails", async () => {
    // Production break caught: a failed pre-start gate drains or replaces the healthy image.
    const fake = runtime("gate");
    const controller = new DeploymentController(initialState(), fake.implementation, "test-attestation-key-that-is-long-enough");

    await expect(controller.deploy(candidate)).rejects.toThrow("gate failed");

    expect(fake.serving()).toBe(prior.digest);
    expect(controller.snapshot().active.digest).toBe(prior.digest);
    expect(fake.events.some((event) => event.startsWith("private:"))).toBe(false);
  });

  it("keeps a candidate private and restores the exact prior digest when readiness fails", async () => {
    // Production break caught: Traefik sees the candidate before DB/gate/config readiness succeeds.
    const fake = runtime("readiness");
    const controller = new DeploymentController(initialState(), fake.implementation, "test-attestation-key-that-is-long-enough");

    await expect(controller.deploy(candidate)).rejects.toThrow("candidate readiness failed");

    expect(fake.serving()).toBe(prior.digest);
    expect(controller.snapshot().active.digest).toBe(prior.digest);
    expect(fake.events.findIndex((event) => event.startsWith("private:")))
      .toBeLessThan(fake.events.findIndex((event) => event.startsWith("ready:")));
    expect(fake.events.some((event) => event.startsWith("promote:"))).toBe(false);
  });

  it("promotes only after gate and readiness, and records immutable status metadata", async () => {
    const fake = runtime();
    const controller = new DeploymentController(initialState(), fake.implementation, "test-attestation-key-that-is-long-enough");

    const result = await controller.deploy(candidate);

    expect(fake.events.map((event) => event.split(":")[0])).toEqual([
      "pull", "gate", "private", "ready", "promote",
    ]);
    expect(fake.serving()).toBe(candidate.digest);
    expect(result.active).toEqual(candidate);
    expect(result.activeSlot).toBe("green");
  });

  it("restores the exact prior digest when atomic promotion reports failure", async () => {
    const fake = runtime("promotion");
    const controller = new DeploymentController(initialState(), fake.implementation, "test-attestation-key-that-is-long-enough");

    await expect(controller.deploy(candidate)).rejects.toThrow("promotion failed");

    expect(fake.serving()).toBe(prior.digest);
    expect(fake.events).toContain(`restore:blue:${prior.digest}`);
    expect(controller.snapshot().active.digest).toBe(prior.digest);
  });

  it("rejects unknown and pre-floor rollback digests", async () => {
    const newer = { ...candidate, digest: `sha256:${"3".repeat(64)}` };
    const state = initialState();
    state.active = newer;
    state.activeSlot = "green";
    state.secureHistory = [prior, candidate, newer];
    state.rollbackFloorDigest = candidate.digest;
    const controller = new DeploymentController(state, runtime().implementation, "test-attestation-key-that-is-long-enough");

    await expect(controller.rollback(`sha256:${"9".repeat(64)}`)).rejects.toThrow("unknown secure digest");
    await expect(controller.rollback(prior.digest)).rejects.toThrow("older than rollback floor");
  });

  it("advances a distinct schema-compatibility floor after the irreversible migration gate", async () => {
    const fake = runtime("readiness");
    fake.implementation.runContainmentGate = async (image) => {
      fake.events.push(`gate:${image.digest}`);
      return createGateAttestation(image, "test-attestation-key-that-is-long-enough", "a".repeat(64));
    };
    const controller = new DeploymentController(initialState(), fake.implementation, "test-attestation-key-that-is-long-enough");

    await expect(controller.deploy(schemaCandidate)).rejects.toThrow("candidate readiness failed");

    expect(controller.snapshot().active.digest).toBe(prior.digest);
    expect(controller.snapshot().migrationCompatibilityFloorDigest).toBe(schemaCandidate.digest);
    expect(fake.serving()).toBe(prior.digest);
    await expect(controller.rollback(prior.digest)).rejects.toThrow(/schema compatibility floor/i);
  });

  it("advances the floor to 0019 when a 0020 candidate completes its irreversible gate", async () => {
    const prior18 = { ...priorAdditiveCandidate, digest: `sha256:${"6".repeat(64)}`, commit: "6666666666666666666666666666666666666666" };
    const state = initialState();
    state.active = prior18;
    state.secureHistory = [prior18];
    state.rollbackFloorDigest = prior18.digest;
    state.migrationCompatibilityFloorDigest = prior18.digest;
    const fake = runtime("readiness");
    fake.implementation.runContainmentGate = async (image) => createGateAttestation(image, "test-attestation-key-that-is-long-enough", "a".repeat(64));
    const controller = new DeploymentController(state, fake.implementation, "test-attestation-key-that-is-long-enough");

    await expect(controller.deploy(currentAdditiveCandidate)).rejects.toThrow("candidate readiness failed");
    expect(controller.snapshot().migrationCompatibilityFloorDigest).toBe(currentAdditiveCandidate.digest);
    expect(controller.snapshot().migrationCompatibilityFloorMarker).toBe("0019_queue_visibility_control");
    const rollbackRuntime = runtime();
    rollbackRuntime.implementation.runContainmentGate = async (image) => createGateAttestation(image, "test-attestation-key-that-is-long-enough", "b".repeat(64));
    const rollbackController = new DeploymentController(controller.snapshot(), rollbackRuntime.implementation, "test-attestation-key-that-is-long-enough");
    await expect(rollbackController.rollback(prior18.digest)).rejects.toThrow(/schema compatibility floor/i);
  });
});

describe("server-owned Music entry controls", () => {
  it("can only disable the new entry and can never re-enable legacy Music", () => {
    expect(resolveMusicEntryPolicy({ killSwitch: true, cohortEnabled: true, inCohort: true }))
      .toEqual({ newMusicEntryEnabled: false, legacyMusicEntryEnabled: false });
    expect(resolveMusicEntryPolicy({ killSwitch: false, cohortEnabled: true, inCohort: true }))
      .toEqual({ newMusicEntryEnabled: true, legacyMusicEntryEnabled: false });
    expect(resolveMusicEntryPolicy({ killSwitch: false, cohortEnabled: true, inCohort: false }))
      .toEqual({ newMusicEntryEnabled: false, legacyMusicEntryEnabled: false });
  });

  it("parses an exact bounded cohort without accepting malformed or duplicate identities", () => {
    const cohort = parseMusicCohortConfiguration({
      MUSIC_COHORT_ENABLED: "true",
      MUSIC_COHORT_USER_DOCUMENT_IDS: "user-doc-a, user_doc-b",
    });
    expect(cohort.enabled).toBe(true);
    expect([...cohort.userDocumentIds]).toEqual(["user-doc-a", "user_doc-b"]);
    expect(parseMusicCohortConfiguration({ MUSIC_COHORT_ENABLED: "false" })).toMatchObject({ enabled: false });
    expect(() => parseMusicCohortConfiguration({ MUSIC_COHORT_ENABLED: "yes" })).toThrow(/MUSIC_COHORT_ENABLED/);
    expect(() => parseMusicCohortConfiguration({
      MUSIC_COHORT_ENABLED: "true",
      MUSIC_COHORT_USER_DOCUMENT_IDS: "user-doc-a,user-doc-a",
    })).toThrow(/unique/);
    expect(() => parseMusicCohortConfiguration({
      MUSIC_COHORT_ENABLED: "true",
      MUSIC_COHORT_USER_DOCUMENT_IDS: Array.from({ length: 101 }, (_, index) => `user-${index}`).join(","),
    })).toThrow(/at most 100/);
    expect(() => parseMusicCohortConfiguration({
      MUSIC_COHORT_ENABLED: "true",
      MUSIC_COHORT_USER_DOCUMENT_IDS: "user-doc-a,../../forged",
    })).toThrow(/document ID/);
  });

  it("resolves authoritative cohort membership only when cohort admission is active", async () => {
    const resolveIdentity = vi.fn(async (proof: string, requestId: string) => ({
      userDocumentId: proof === "member-proof" ? "member-doc" : "outsider-doc",
      requestId,
    }));
    const enabled = createMusicCohortEntryResolver({
      killSwitch: () => false,
      cohort: parseMusicCohortConfiguration({
        MUSIC_COHORT_ENABLED: "true",
        MUSIC_COHORT_USER_DOCUMENT_IDS: "member-doc",
      }),
      resolveIdentity,
    });
    await expect(enabled("member-proof", "request-member")).resolves.toBe(true);
    await expect(enabled("outsider-proof", "request-outsider")).resolves.toBe(false);
    expect(resolveIdentity).toHaveBeenCalledTimes(2);

    const offResolver = createMusicCohortEntryResolver({
      killSwitch: () => false,
      cohort: parseMusicCohortConfiguration({ MUSIC_COHORT_ENABLED: "false" }),
      resolveIdentity,
    });
    await expect(offResolver("unresolved-proof", "request-off")).resolves.toBe(true);
    expect(resolveIdentity).toHaveBeenCalledTimes(2);

    const killedResolver = createMusicCohortEntryResolver({
      killSwitch: () => true,
      cohort: parseMusicCohortConfiguration({
        MUSIC_COHORT_ENABLED: "true",
        MUSIC_COHORT_USER_DOCUMENT_IDS: "member-doc",
      }),
      resolveIdentity,
    });
    await expect(killedResolver("member-proof", "request-killed")).resolves.toBe(false);
    expect(resolveIdentity).toHaveBeenCalledTimes(2);
  });
});
