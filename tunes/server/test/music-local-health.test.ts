import express from "express";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLocalMusicEnvironment,
  createValidatedLocalMusicProfile,
  type LocalMusicManifest,
} from "../config/music-local-profile";
import { setupLocalMusicHealthRoutes } from "../deployment/music-local-health";
import { createLoopbackSupertestScope } from "./helpers/loopback-supertest";

const loopback = createLoopbackSupertestScope();
afterEach(async () => loopback.closeAll());

const worktreeRoot = path.resolve(import.meta.dirname, "../../..");
const stateDirectory = path.join(tmpdir(), "ExplorersMusicLocal", "health");

function profile(enableCohort = false) {
  const manifest: LocalMusicManifest = {
    version: 1, instanceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", worktreeRoot,
    ownerId: "S-1-5-21-1", imageId: `sha256:${"a".repeat(64)}`, stateDirectory,
    lifecycleProofFile: path.join(stateDirectory, "proof"), cohortUserDocumentIds: ["user_document_1"],
  };
  return createValidatedLocalMusicProfile({
    manifest, applicationEnvironment: buildLocalMusicEnvironment(manifest), resourcesValidated: true,
    credentialsValidated: true, databaseReady: true, enableCohort,
    source: { commit: "d".repeat(40), dirty: true },
  });
}

function harness(input: {
  profile?: ReturnType<typeof profile>;
  ping?: () => Promise<unknown>;
  migration?: () => Promise<{ ready: boolean; currentId?: string; currentChecksum?: string }>;
  role?: () => Promise<boolean>;
} = {}) {
  const app = express();
  setupLocalMusicHealthRoutes(app, {
    profile: input.profile ?? profile(),
    pool: { query: input.ping ?? (async () => ({ rows: [{ "?column?": 1 }] })) } as never,
    migrationReadiness: input.migration ?? (async () => ({ ready: true, currentId: "0021", currentChecksum: "checksum" })),
    runtimeRoleReadiness: input.role ?? (async () => true),
  });
  return app;
}

describe("local Music health", () => {
  it("reports honest local liveness/readiness without deployment qualification", async () => {
    const app = harness();
    const { request } = await loopback.open({ app });
    expect((await request.get("/health/live")).body).toMatchObject({
      live: true, environment: "local", deploymentQualified: false,
      commit: "d".repeat(40), dirty: true,
    });
    const ready = await request.get("/health/ready");
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({
      ready: true, environment: "local", deploymentQualified: false,
      capabilities: { nativeAuth: false, analyticsPublishing: false, reactivation: false, playlistImports: false },
    });
  });

  it("passively rechecks the exact runtime role privilege boundary", async () => {
    const app = express();
    const query = vi.fn(async (sql: string) => sql === "SELECT 1" ? { rows: [{ "?column?": 1 }] } : { rows: [{
      current_user: "explorers_music_local_uat_runtime",
      can_connect_database: true,
      can_create_database_objects: false,
      can_create_temporary_objects: false,
      can_use_schema: true,
      can_create_schema_objects: false,
    }] });
    setupLocalMusicHealthRoutes(app, {
      profile: profile(), pool: { query } as never,
      migrationReadiness: async () => ({ ready: true, currentId: "0021", currentChecksum: "checksum" }),
    });
    const { request } = await loopback.open({ app });
    expect((await request.get("/health/ready")).status).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);

    query.mockImplementation(async (sql: string) => sql === "SELECT 1" ? { rows: [{}] } : { rows: [{
      current_user: "explorers_music_local_uat_runtime", can_connect_database: true,
      can_create_database_objects: true, can_create_temporary_objects: false,
      can_use_schema: true, can_create_schema_objects: false,
    }] });
    expect((await request.get("/health/ready")).status).toBe(503);
  });

  it.each([
    ["migration drift", { migration: async () => ({ ready: false }) }],
    ["database ping", { ping: async () => { throw new Error("raw database detail"); } }],
    ["runtime role", { role: async () => false }],
  ])("returns a sanitized 503 for %s", async (_label, override) => {
    const app = harness(override);
    const { request } = await loopback.open({ app });
    const response = await request.get("/health/ready");
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ ready: false, environment: "local", deploymentQualified: false, reason: "local-readiness-failed" });
    expect(JSON.stringify(response.body)).not.toContain("raw database detail");
  });

  it("records the effective default and enabled cohort admission independently of image attestation", async () => {
    const disabledApp = harness();
    const { request: disabledRequest } = await loopback.open({ app: disabledApp });
    const disabled = (await disabledRequest.get("/api/music-entry/status")).body;
    expect(disabled).toMatchObject({
      environment: "local", deploymentQualified: false, killSwitch: true,
      workspaceKillSwitch: true, cohortEnabled: false, cohortSize: 0,
      newMusicEntryEnabled: false, legacyMusicEntryEnabled: false,
    });
    expect(disabled).not.toHaveProperty("digest");

    const enabledApp = harness({ profile: profile(true) });
    const { request: enabledRequest } = await loopback.open({ app: enabledApp });
    const enabled = (await enabledRequest.get("/api/music-entry/status")).body;
    expect(enabled).toMatchObject({
      killSwitch: false, workspaceKillSwitch: false, cohortEnabled: true, cohortSize: 1,
      cohortAdmissionConfigured: true, ownerWorkspace: true, guestWorkspace: true, playlistImports: false,
    });
  });
});
