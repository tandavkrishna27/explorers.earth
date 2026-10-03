import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  CURRENT_MIGRATION_MARKER,
  createGateAttestation,
  evaluateReadiness,
  livenessStatus,
  type ImageCandidate,
} from "../../deployment/music-deployment";

const image: ImageCandidate = {
  digest: `sha256:${"a".repeat(64)}`,
  commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  migrationMarker: "containment-no-schema-change",
};
const key = "test-attestation-key-that-is-long-enough";

describe("Music liveness and readiness", () => {
  it("keeps process liveness independent from deployment dependencies", () => {
    expect(livenessStatus()).toEqual({ live: true });
  });

  it("requires DB, mandatory secrets, upstream configuration, and exact same-image attestation", async () => {
    const attestation = createGateAttestation(image, key);
    const ready = await evaluateReadiness({
      image,
      attestation,
      attestationKey: key,
      requiredSecrets: { SESSION_SECRET: "s".repeat(32), COOKIE_SECRET: "c".repeat(32) },
      upstreamUrls: { STRAPI_URL: "https://cms.example.test" },
      databasePing: async () => true,
    });

    expect(ready).toEqual({ ready: true, ...image });
  });

  it("binds current-image readiness to the approved 0037 journal marker and committed SQL checksum", async () => {
    // A current image must refuse a historical journal or a different checksum.
    // The attestation is synthetic; its checksum comes from committed SQL bytes.
    expect(CURRENT_MIGRATION_MARKER).toBe("0037_explorers_movies_provider_context");
    const currentImage = {
      ...image,
      migrationMarker: CURRENT_MIGRATION_MARKER,
    };
    const checksum = createHash("sha256").update(readFileSync(new URL(`../../../migrations/${CURRENT_MIGRATION_MARKER}.sql`, import.meta.url))).digest("hex");
    const attestation = createGateAttestation(currentImage, key, checksum);
    const common = {
      image: currentImage,
      attestation,
      attestationKey: key,
      requiredSecrets: { SESSION_SECRET: "s".repeat(32), COOKIE_SECRET: "c".repeat(32) },
      upstreamUrls: { STRAPI_URL: "https://cms.example.test" },
      databasePing: async () => true,
    };
    await expect(evaluateReadiness({
      ...common,
      migrationState: async () => ({ ready: true, currentId: CURRENT_MIGRATION_MARKER, currentChecksum: checksum }),
    })).resolves.toEqual({ ready: true, ...currentImage });
    await expect(evaluateReadiness({
      ...common,
      migrationState: async () => ({ ready: true, currentId: "0019_queue_visibility_control", currentChecksum: checksum }),
    })).resolves.toMatchObject({ ready: false, reason: "migration-state-invalid" });
    await expect(evaluateReadiness({
      ...common,
      migrationState: async () => ({ ready: true, currentId: "0036_explorers_analytics_events", currentChecksum: checksum }),
    })).resolves.toMatchObject({ ready: false, reason: "migration-state-invalid" });
    await expect(evaluateReadiness(common)).resolves.toMatchObject({ ready: false, reason: "migration-state-invalid" });
    await expect(evaluateReadiness({
      ...common,
      migrationState: async () => ({ ready: false, currentId: CURRENT_MIGRATION_MARKER, currentChecksum: checksum }),
    })).resolves.toMatchObject({ ready: false, reason: "migration-state-invalid" });
    await expect(evaluateReadiness({
      ...common,
      migrationState: async () => ({
        ready: true,
        currentId: CURRENT_MIGRATION_MARKER,
        currentChecksum: "0".repeat(64),
      }),
    })).resolves.toMatchObject({ ready: false, reason: "migration-state-invalid" });
  });

  it("fails closed for a digest-mismatched attestation even when DB is reachable", async () => {
    const attestation = createGateAttestation({ ...image, digest: `sha256:${"b".repeat(64)}` }, key);
    const result = await evaluateReadiness({
      image,
      attestation,
      attestationKey: key,
      requiredSecrets: { SESSION_SECRET: "s".repeat(32), COOKIE_SECRET: "c".repeat(32) },
      upstreamUrls: { STRAPI_URL: "https://cms.example.test" },
      databasePing: async () => true,
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toBe("gate-attestation-mismatch");
  });

  it.each([
    ["database-unreachable", async () => false, { SESSION_SECRET: "s".repeat(32), COOKIE_SECRET: "c".repeat(32) }, { STRAPI_URL: "https://cms.example.test" }],
    ["mandatory-secret-missing", async () => true, { SESSION_SECRET: "", COOKIE_SECRET: "c".repeat(32) }, { STRAPI_URL: "https://cms.example.test" }],
    ["upstream-config-invalid", async () => true, { SESSION_SECRET: "s".repeat(32), COOKIE_SECRET: "c".repeat(32) }, { STRAPI_URL: "http://localhost:1337" }],
  ])("reports %s without claiming readiness", async (reason, databasePing, requiredSecrets, upstreamUrls) => {
    const result = await evaluateReadiness({
      image,
      attestation: createGateAttestation(image, key),
      attestationKey: key,
      requiredSecrets,
      upstreamUrls,
      databasePing,
    });
    expect(result).toMatchObject({ ready: false, reason });
  });
});
