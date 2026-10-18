import { describe, expect, it, vi } from "vitest";

// Only the readiness precondition is faked, and only so execution can reach the
// post-listen failure this file is about. checkMusicDatabaseReadiness runs at
// canonicalStartup.ts:37, BEFORE listen(), and satisfying it for real would need a
// migrated PostgreSQL — which would move this test into the integration config,
// where vitest.config.ts excludes it from the default gate. The behaviour under
// test, that a startup failure after listen() does not leave the listener open,
// is exercised for real.
vi.mock("../../db/readiness", () => ({
  checkMusicDatabaseReadiness: async () => ({ ready: true, currentId: "fixture", currentChecksum: "fixture" }),
}));

const { startCanonicalServer } = await import("../../auth/canonicalStartup");

/**
 * resolveObjectStorage (services/objectStorage.ts:180-190) only throws when a media
 * environment is explicitly selected and the bucket or region is missing. With no
 * EXPLORERS_MEDIA_ENVIRONMENT it returns LocalObjectStorage and never throws, so
 * omitting the bucket alone would not reproduce anything. "qa" with no bucket is the
 * real deployment failure: the tier is configured, the credential is not.
 */
function startupEnvironmentMissingMediaBucket() {
  return {
    EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
    EXPLORERS_AUTH_SECRET: "integration-secret-".repeat(4),
    GOOGLE_CLIENT_ID: "fixture-google-id",
    GOOGLE_CLIENT_SECRET: "fixture-google-secret",
    EXPLORERS_MEDIA_ENVIRONMENT: "qa",
  };
}

function stubPool() {
  const answer = async () => ({ rows: [], rowCount: 0 });
  return { query: answer, connect: async () => ({ query: answer, release: () => undefined }), end: async () => undefined };
}

function listeningHandles(): unknown[] {
  const handles = (process as unknown as { _getActiveHandles(): unknown[] })._getActiveHandles();
  return handles.filter((handle) => (handle as { listening?: boolean }).listening === true);
}

describe("canonical startup listener", () => {
  it("closes the listener when startup fails after listen()", async () => {
    // Break caught: resolveObjectStorage throws at canonicalStartup.ts:50, after
    // listen() has already resolved. The catch rethrows without closing the
    // server, the open handle keeps the event loop alive, process.exitCode=1
    // never terminates anything, and the container sits there answering
    // /health/live with 200 forever — which is exactly what Dockerfile:71 uses
    // as its healthcheck, so the container reports healthy indefinitely.
    const before = listeningHandles();

    await expect(startCanonicalServer(startupEnvironmentMissingMediaBucket(), {
      pool: stubPool() as never,
      host: "127.0.0.1",
      port: 0,
    })).rejects.toThrow(/media S3 bucket and region/);

    // The assertion that matters: the rejection leaves behind no listener it opened.
    // Compared against the handles present beforehand rather than against an empty
    // list, so an unrelated handle in the worker cannot make this pass or fail.
    const survivors = listeningHandles().filter((handle) => !before.includes(handle));
    expect(survivors).toEqual([]);
  });
});
