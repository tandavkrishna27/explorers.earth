import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createGateAttestation, type ImageCandidate } from "../../deployment/music-deployment";
import { setupMusicHealthRoutes } from "../../deployment/music-health";
import { createLoopbackSupertestScope } from "../helpers/loopback-supertest";

const image: ImageCandidate = {
  digest: `sha256:${"e".repeat(64)}`,
  commit: "e".repeat(40),
  migrationMarker: "containment-no-schema-change",
};
const key = "health-route-attestation-key-long-enough";
const directories: string[] = [];
const loopback = createLoopbackSupertestScope();

afterEach(async () => {
  try {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  } finally {
    await loopback.closeAll();
  }
});

async function appWithAttestation(databaseQuery: () => Promise<unknown>, overrides: NodeJS.ProcessEnv = {}) {
  const directory = await mkdtemp(join(tmpdir(), "music-health-"));
  directories.push(directory);
  const path = join(directory, "gate.json");
  await writeFile(path, JSON.stringify(createGateAttestation(image, key)));
  const app = express();
  setupMusicHealthRoutes(app, {
    pool: { query: databaseQuery } as never,
    env: {
      MUSIC_IMAGE_DIGEST: image.digest,
      MUSIC_IMAGE_COMMIT: image.commit,
      MUSIC_MIGRATION_MARKER: image.migrationMarker,
      MUSIC_GATE_ATTESTATION_KEY: key,
      MUSIC_GATE_ATTESTATION_PATH: path,
      SESSION_SECRET: "s".repeat(32),
      COOKIE_SECRET: "c".repeat(32),
      STRAPI_ACCESS_TOKEN: "t".repeat(32),
      STRAPI_JWT_SECRET: "j".repeat(32),
      STRAPI_URL: "https://cms.example.test",
      MUSIC_NEW_ENTRY_KILL_SWITCH: "true",
      MUSIC_COHORT_ENABLED: "false",
      ...overrides,
    },
  });
  return app;
}

describe("Music health endpoints", () => {
  it("keeps liveness process-only when immutable metadata is invalid", async () => {
    // Production break caught: a serving process is restarted because deployment metadata belongs in readiness.
    const app = await appWithAttestation(async () => ({ rows: [{ ok: 1 }] }), { MUSIC_IMAGE_DIGEST: "invalid" });
    const { request } = await loopback.open({ app });
    const liveness = await request.get("/health/live");
    expect(liveness.status).toBe(200);
    expect(liveness.body).toEqual({ live: true });
    const readiness = await request.get("/health/ready");
    expect(readiness.status).toBe(503);
    expect(readiness.body.reason).toBe("image-metadata-invalid");
  });

  it("reports liveness while readiness independently fails DB", async () => {
    const app = await appWithAttestation(async () => { throw new Error("db unavailable"); });
    const { request } = await loopback.open({ app });
    expect((await request.get("/health/live")).status).toBe(200);
    const readiness = await request.get("/health/ready");
    expect(readiness.status).toBe(503);
    expect(readiness.body.reason).toBe("database-unreachable");
  });

  it("returns immutable metadata and a fail-closed server kill switch", async () => {
    const app = await appWithAttestation(async () => ({ rows: [{ ok: 1 }] }));
    const { request } = await loopback.open({ app });
    const readiness = await request.get("/health/ready");
    expect(readiness.status).toBe(200);
    expect(readiness.body).toMatchObject({ ready: true, ...image });
    const status = await request.get("/api/music-entry/status");
    expect(status.body).toMatchObject({
      newMusicEntryEnabled: false,
      legacyMusicEntryEnabled: false,
      killSwitch: true,
      ...image,
    });
  });

  it("reports bounded cohort availability without exposing configured identities", async () => {
    const app = await appWithAttestation(async () => ({ rows: [{ ok: 1 }] }), {
      MUSIC_NEW_ENTRY_KILL_SWITCH: "false",
      MUSIC_COHORT_ENABLED: "true",
      MUSIC_COHORT_USER_DOCUMENT_IDS: "member-doc-a,member-doc-b",
    });
    const { request } = await loopback.open({ app });
    const status = await request.get("/api/music-entry/status");
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      newMusicEntryEnabled: true,
      legacyMusicEntryEnabled: false,
      killSwitch: false,
      cohortEnabled: true,
      cohortSize: 2,
      cohortAdmissionConfigured: true,
    });
    expect(JSON.stringify(status.body)).not.toContain("member-doc");
  });

  it("fails closed when cohort mode has no configured identities", async () => {
    const app = await appWithAttestation(async () => ({ rows: [{ ok: 1 }] }), {
      MUSIC_NEW_ENTRY_KILL_SWITCH: "false",
      MUSIC_COHORT_ENABLED: "true",
      MUSIC_COHORT_USER_DOCUMENT_IDS: "",
    });
    const { request } = await loopback.open({ app });
    const status = await request.get("/api/music-entry/status");
    expect(status.body).toMatchObject({
      newMusicEntryEnabled: false,
      cohortEnabled: true,
      cohortSize: 0,
      cohortAdmissionConfigured: false,
    });
  });
});
