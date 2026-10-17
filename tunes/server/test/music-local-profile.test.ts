import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertLocalMusicEnvironment,
  buildLocalMusicEnvironment,
  parseLocalMusicManifest,
  type LocalMusicManifest,
} from "../config/music-local-profile";

const worktreeRoot = path.resolve("/local-policy-test/worktree");
const stateDirectory = path.resolve("/local-policy-test/private/instance");
const manifest = (): LocalMusicManifest => ({
  version: 1,
  instanceId: "9c897e25-95a8-4f36-975c-f4b38f66d449",
  worktreeRoot,
  ownerId: "S-1-5-21-123-456-789-1001",
  imageId: `sha256:${"a".repeat(64)}`,
  stateDirectory,
  cohortUserDocumentIds: [],
});

describe("local Music manifest policy", () => {
  it("accepts the bounded manifest and copies its cohort", () => {
    const input = { ...manifest(), cohortUserDocumentIds: ["user_1", "user-2"] };
    const parsed = parseLocalMusicManifest(input);
    expect(parsed).toEqual(input);
    input.cohortUserDocumentIds.push("changed");
    expect(parsed.cohortUserDocumentIds).toEqual(["user_1", "user-2"]);
  });

  it("defaults an omitted cohort to empty", () => {
    const { cohortUserDocumentIds: _cohort, ...input } = manifest();
    expect(parseLocalMusicManifest(input).cohortUserDocumentIds).toEqual([]);
  });

  it("accepts a numeric POSIX owner and the maximum bounded cohort", () => {
    const input = { ...manifest(), ownerId: "1000", cohortUserDocumentIds: Array.from({ length: 100 }, (_, i) => `user${i}`) };
    expect(parseLocalMusicManifest(input)).toEqual(input);
  });

  it.each([null, [], "manifest", 1])("rejects non-object manifest %j", (input) => {
    expect(() => parseLocalMusicManifest(input)).toThrow();
  });

  it.each([
    { version: 2 }, { version: "1" }, { instanceId: "not-a-uuid" },
    { instanceId: "9C897E25-95A8-4F36-975C-F4B38F66D449" },
    { imageId: "postgres:15" }, { imageId: `sha256:${"A".repeat(64)}` },
    { ownerId: "ordinary-user" }, { ownerId: "-1" }, { ownerId: "" },
    { worktreeRoot: "relative/worktree" }, { stateDirectory: "relative/private" },
    { stateDirectory: worktreeRoot }, { stateDirectory: path.join(worktreeRoot, "private") },
    { stateDirectory: `${stateDirectory}${path.sep}..${path.sep}instance` },
    { stateDirectory: `${stateDirectory}\u0000` },
    { lifecycleProofFile: "relative/token" },
    { lifecycleProofFile: path.join(worktreeRoot, "token") },
    { cohortUserDocumentIds: ["duplicate", "duplicate"] },
    { cohortUserDocumentIds: ["user,other"] }, { cohortUserDocumentIds: [" user"] },
    { cohortUserDocumentIds: ["a".repeat(129)] }, { cohortUserDocumentIds: [""] },
    { cohortUserDocumentIds: [1] }, { cohortUserDocumentIds: "user" }, { cohortUserDocumentIds: null },
    { cohortUserDocumentIds: Array.from({ length: 101 }, (_, i) => `user${i}`) },
    { databaseHost: "shared.example.com" }, { unexpected: true },
  ])("rejects malformed or authority-extending fields %j", (change) => {
    expect(() => parseLocalMusicManifest({ ...manifest(), ...change })).toThrow();
  });

  it("does not mistake an outside sibling for a contained directory", () => {
    const input = { ...manifest(), stateDirectory: `${worktreeRoot}-private` };
    expect(parseLocalMusicManifest(input)).toEqual(input);
  });

  it("refuses missing required identity fields", () => {
    for (const field of ["version", "instanceId", "worktreeRoot", "ownerId", "imageId", "stateDirectory"]) {
      const input: Record<string, unknown> = { ...manifest() };
      delete input[field];
      expect(() => parseLocalMusicManifest(input)).toThrow();
    }
  });
});

describe("local Music environment policy", () => {
  it("builds the exact isolated target and killed empty cohort without ambient authority", () => {
    const env = buildLocalMusicEnvironment(manifest());
    expect(env).toMatchObject({
      MUSIC_RUNTIME_PROFILE: "local-music", NODE_ENV: "development", MUSIC_MODE: "live",
      HOST: "127.0.0.1", PORT: "5000",
      MUSIC_DATABASE_HOST: "127.0.0.1", MUSIC_DATABASE_PORT: "55433",
      MUSIC_DATABASE_NAME: "explorers_music_local_uat",
      MUSIC_DATABASE_USER: "explorers_music_local_uat_runtime",
      MUSIC_DATABASE_MIGRATOR_USER: "explorers_music_local_uat_migrator",
      STRAPI_URL: "https://api.localqr.earth", MUSIC_STRAPI_ALLOWED_ORIGINS: "https://api.localqr.earth",
      MUSIC_CONNECT_TIMEOUT_MS: "5000", MUSIC_READ_TIMEOUT_MS: "5000", MUSIC_IDENTITY_OVERALL_TIMEOUT_MS: "15000",
      TRUST_PROXY_HOPS: "1", MUSIC_TRUSTED_PROXY_IP: "127.0.0.1",
      ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5174,https://music.localhost",
      MUSIC_NEW_ENTRY_KILL_SWITCH: "true", MUSIC_COHORT_ENABLED: "false", MUSIC_COHORT_USER_DOCUMENT_IDS: "",
      MUSIC_WORKSPACE_KILL_SWITCH: "true", MUSIC_RECONCILIATION_ENABLED: "false",
    });
    expect(env.MUSIC_DATABASE_PASSWORD_FILE).toBe(path.join(stateDirectory, "db-runtime"));
    expect(env.MUSIC_TOKEN_CURRENT_SECRET_FILE).toBe(path.join(stateDirectory, "music-token"));
    expect(env.MUSIC_PUBLIC_ID_HMAC_KEY_FILE).toBe(path.join(stateDirectory, "public-id"));
    expect(env.MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE).toBe(path.join(stateDirectory, "publication-key"));
    expect(env.COOKIE_SECRET_FILE).toBe(path.join(stateDirectory, "cookie"));
    expect(env.SESSION_SECRET_FILE).toBe(path.join(stateDirectory, "session"));
    for (const name of ["DATABASE_URL", "STRAPI_ACCESS_TOKEN", "STRAPI_JWT_SECRET", "STRAPI_LIFECYCLE_PROOF_TOKEN", "STRAPI_LIFECYCLE_PROOF_TOKEN_FILE", "SESSION_SECRET", "COOKIE_SECRET", "PATH"]) {
      expect(env).not.toHaveProperty(name);
    }
    expect(Object.values(env)).not.toContain(path.join(stateDirectory, "db-admin"));
    expect(Object.values(env)).not.toContain(path.join(stateDirectory, "db-migrator"));
    expect(() => assertLocalMusicEnvironment(env)).not.toThrow();
  });

  it("maps only the dedicated proof file and explicit immutable cohort without enabling entry", () => {
    const lifecycleProofFile = path.resolve("/local-policy-test/proof/token");
    const env = buildLocalMusicEnvironment({ ...manifest(), lifecycleProofFile, cohortUserDocumentIds: ["user_1"] });
    expect(env.STRAPI_LIFECYCLE_PROOF_TOKEN_FILE).toBe(lifecycleProofFile);
    expect(env.MUSIC_COHORT_USER_DOCUMENT_IDS).toBe("user_1");
    expect(env.MUSIC_COHORT_ENABLED).toBe("true");
    expect(env.MUSIC_NEW_ENTRY_KILL_SWITCH).toBe("true");
    expect(() => assertLocalMusicEnvironment(env)).not.toThrow();
  });

  it.each([
    ["NODE_ENV", "production"], ["NODE_ENV", "test"], ["MUSIC_MODE", "fixture"],
    ["MUSIC_RUNTIME_PROFILE", "production"], ["MUSIC_DATABASE_HOST", "localhost"],
    ["MUSIC_DATABASE_HOST", "shared.example.com"], ["MUSIC_DATABASE_HOST", "user:password@127.0.0.1"],
    ["MUSIC_DATABASE_PORT", "5432"], ["MUSIC_DATABASE_NAME", "music_fixture"],
    ["MUSIC_DATABASE_USER", "postgres"], ["MUSIC_DATABASE_MIGRATOR_USER", "other"],
    ["HOST", "0.0.0.0"], ["PORT", "5001"], ["STRAPI_URL", "https://other.example.com"],
    ["MUSIC_STRAPI_ALLOWED_ORIGINS", "https://api.localqr.earth,https://other.example.com"],
    ["MUSIC_TRUSTED_PROXY_IP", "::1"], ["TRUST_PROXY_HOPS", "0"],
    ["DATABASE_URL", "postgresql://user:password@127.0.0.1:55433/explorers_music_local_uat"],
    ["DATABASE_URL", ""], ["STRAPI_ACCESS_TOKEN", "ambient"], ["STRAPI_ACCESS_TOKEN_FILE", "/ambient"],
    ["STRAPI_JWT_SECRET", "ambient"], ["STRAPI_ANALYTICS_TOKEN", "ambient"],
    ["EXPLORERS_ANALYTICS_STRAPI_TOKEN", "ambient"], ["STRAPI_RECONCILIATION_TOKEN_FILE", "/ambient"],
    ["STRAPI_LIFECYCLE_PROOF_TOKEN", "ambient"], ["MUSIC_FIXTURE_VERSION", "1"],
    ["STRAPI_FIXTURE_URL", "http://127.0.0.1:51337"], ["MUSIC_RECONCILIATION_APPLY_ENABLED", "true"],
    ["MUSIC_DATABASE_PASSWORD_FILE", "relative/file"],
    ["MUSIC_DATABASE_PASSWORD_FILE", path.join(stateDirectory, "db-admin")],
    ["MUSIC_TOKEN_CURRENT_SECRET_FILE", path.resolve("/other-private/music-token")],
    ["STRAPI_LIFECYCLE_PROOF_TOKEN_FILE", path.join(stateDirectory, "db-runtime")],
    ["MUSIC_COHORT_USER_DOCUMENT_IDS", "a,a"],
    ["MUSIC_COHORT_ENABLED", "yes"],
  ])("rejects unsafe pre-start %s", (key, value) => {
    const env = { ...buildLocalMusicEnvironment(manifest()), [key]: value };
    expect(() => assertLocalMusicEnvironment(env)).toThrow();
  });

  it("does not let a typed caller bypass manifest validation", () => {
    expect(() => buildLocalMusicEnvironment({ ...manifest(), stateDirectory: worktreeRoot })).toThrow();
  });

  it("refuses an incomplete pre-start environment", () => {
    expect(() => assertLocalMusicEnvironment({})).toThrow();
  });
});
