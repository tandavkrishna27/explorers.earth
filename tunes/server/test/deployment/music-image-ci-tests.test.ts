import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { IMAGE_TEST_COMMANDS, runImageCiTests, transferImageAuthority, settleImageCommand, type ImageTestDependencies } from "../../../scripts/music-image-ci-tests";

const root = resolve(import.meta.dirname, "../../../..");
const { load } = createRequire(import.meta.url)("js-yaml");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("owned image CI PostgreSQL wiring", () => {
  it("runs the owned authority runner after install before image build", () => {
    const job = load(read(".github/workflows/tunes.yml")).jobs["build-test-scan-push"];
    const test = job.steps.find((step: any) => step.name === "Test Tunes");
    expect(test.run.trim().split("\n")).toEqual([
      "npm ci --legacy-peer-deps", "node node_modules/tsx/dist/cli.mjs scripts/music-image-ci-tests.ts",
    ]);
    expect(job.services).toBeUndefined();
    expect(test.env.DATABASE_URL_TEST).toBeUndefined();
    expect(test.env).toMatchObject({ MUSIC_C3_POSTGRES_TEST: "1", MUSIC_C8_POSTGRES_TEST: "1", MUSIC_C9_PUBLICATION_POSTGRES_TEST: "1" });
    expect(job.steps.findIndex((step: any) => step.name === "Test Tunes")).toBeLessThan(job.steps.findIndex((step: any) => step.name === "Build Tunes exactly once"));
  });

  it("cannot accept a marker or connection rejection as hostile role preflight evidence", () => {
    const source = read("tunes/server/test/music-runtime-role.integration.test.ts");
    const gate = source.slice(source.indexOf('it("runs the exact gate preflight'), source.indexOf('it("fails closed on a malformed'));
    expect(gate).toContain('expect(output).toContain("runtime capability role has unsafe attributes or membership")');
    expect(gate).toContain("MUSIC_MIGRATION_MARKER: CURRENT_MIGRATION_MARKER");
    expect(gate).toContain("MUSIC_DATABASE_HOST: databaseAuthority.hostname");
    expect(gate).toContain("MUSIC_DATABASE_PORT: databaseAuthority.port");
    for (const unrelated of ["ECONNREFUSED", "same-image gate requires 0038"]) {
      expect(unrelated).not.toContain("runtime capability role has unsafe attributes or membership");
    }
  });

  it("provides the bounded runner", () => {
    expect(existsSync(resolve(root, "tunes/scripts/music-image-ci-tests.ts"))).toBe(true);
  });

  it("verifies exact owned cleanup even when the test step is terminated", () => {
    const job = load(read(".github/workflows/tunes.yml")).jobs["build-test-scan-push"];
    const cleanup = job.steps.find((step: any) => step.name === "Verify owned image test cleanup");
    expect(cleanup).toMatchObject({ if: "${{ always() }}", "working-directory": "tunes",
      run: "node node_modules/tsx/dist/cli.mjs scripts/music-image-ci-tests.ts --cleanup" });
  });

  it("preserves all forty-eight ordinary database selectors on their existing service", () => {
    const ordinary = load(read(".github/workflows/test.yml"));
    const job = Object.values(ordinary.jobs).find((job: any) => job.env?.DATABASE_URL_TEST) as any;
    expect(job.env.DATABASE_URL_TEST).toBe("postgresql://music_migrator:music@127.0.0.1:55432/music_fixture");
    const run = job.steps.find((step: any) => step.run?.includes("npm run test:integration")).run;
    const selectors = run.match(/server\/test\/\S+\.integration\.test\.ts/g) ?? [];
    /*
     * The first sixteen are checked as an exact ordered prefix, because each carries a
     * per-ticket reason below and that reason is the thing worth preserving. The
     * thirty-one added afterwards are checked as a set in the next assertion: they were
     * gated as one measured batch with one shared reason, so ordering them here would be
     * bookkeeping that goes stale without catching anything.
     */
    expect(selectors.slice(0, 16)).toEqual([
      "server/test/migrations/music-migration.integration.test.ts", "server/test/music-identity-projection.integration.test.ts",
      "server/test/music-credential.integration.test.ts", "server/test/music-domain-repository.integration.test.ts",
      "server/test/musicLifecycle.integration.test.ts", "server/test/musicReconciler.integration.test.ts",
      "server/test/reconciliationRepository.integration.test.ts",
      // Ticket 6.2/6.3. The only real-stack proof of the socket handshake, guest
      // capability and revocation while connected, so it belongs on this service.
      "server/test/music-socket-handshake.integration.test.ts",
      // Ticket 4.3. 0043's typed storage and its ordered screenshot relation.
      "server/test/explorers/apps.integration.test.ts",
      /*
       * Added 2026-10-08 by `111466e6` and `4c86ab6b`, when a count of the suites this
       * job actually runs found 41 of 51 tunes integration files ungated. These five were
       * the highest-value of them: each is the only real-PostgreSQL proof of something
       * the replatform asserts, so leaving them ungated meant the proof existed but
       * nothing ran it.
       *
       * This list went stale for one CI run, which is the more useful lesson. The
       * workflow gained the files and this assertion did not, and no job caught it:
       * `server/test/deployment/` is not in any gated selector, so the test that pins
       * CI's own shape is itself unpinned. That is recorded in the handoff as a gap, not
       * fixed here - adding a selector for this directory is a CI-surface change of its
       * own.
       */
      // Ticket 6.1. The named canonical identity acceptance.
      "server/test/canonical-music-identity.integration.test.ts",
      // Ticket 6.4. Deletion, recovery-callback and authorization against the real schema.
      "server/test/explorers-lifecycle.integration.test.ts",
      "server/test/explorers-recovery-callback.integration.test.ts",
      "server/test/explorers-authorization.integration.test.ts",
      // The `music_runtime` least-privilege privilege matrix, which only a real role proves.
      "server/test/music-runtime-role.integration.test.ts",
      // Ticket 7.1's named public-visibility acceptance. Added in the same commit as the
      // file itself, because a test that CI does not run is the gap this list exists for.
      "server/test/explorers/publicVisibility.integration.test.ts",
      /*
       * Ticket 4.1's two named cases live here. The file already existed and was already
       * ungated: `server/test/explorers` is now a directory argument on the `contracts`
       * job, but `vitest.config.ts:24` excludes `*.integration.test.ts`, so an
       * integration file in that directory still needs naming on this service.
       */
      "server/test/explorers/movies.integration.test.ts",
    ]);

    /*
     * Added 2026-10-09. A sweep of every tunes integration file found 34 of 52 named in no
     * workflow - roughly 429 cases that existed and never ran. All 34 were measured on a
     * fresh `postgres:15-alpine`, then the whole 47-file set was run together to prove the
     * combination, because cross-suite pollution is the real risk here and one file
     * demonstrated it.
     */
    expect([...selectors.slice(16)].sort()).toEqual([
      "server/test/book-catalog.integration.test.ts",
      "server/test/book-cover-import.integration.test.ts",
      "server/test/books-public-gateway.integration.test.ts",
      "server/test/explorers-account-provision.integration.test.ts",
      "server/test/explorers-analytics-events.integration.test.ts",
      "server/test/explorers-auth.integration.test.ts",
      "server/test/explorers-content-revision.integration.test.ts",
      "server/test/explorers-manual-overrides.integration.test.ts",
      "server/test/explorers-media.integration.test.ts",
      "server/test/explorers-owner-content.integration.test.ts",
      "server/test/explorers-profile.integration.test.ts",
      "server/test/explorers-public-content.integration.test.ts",
      "server/test/explorers-recommendation-api.integration.test.ts",
      "server/test/explorers-recommendations.integration.test.ts",
      "server/test/explorers-recovery.integration.test.ts",
      "server/test/explorers-search.integration.test.ts",
      "server/test/explorers/category-write-path.integration.test.ts",
      "server/test/explorers/guides.integration.test.ts",
      "server/test/explorers/people.integration.test.ts",
      "server/test/explorers/placeLinks.integration.test.ts",
      "server/test/explorers/places.integration.test.ts",
      "server/test/explorers/products.integration.test.ts",
      "server/test/google-sync.integration.test.ts",
      "server/test/load/music-load-http-postgres.integration.test.ts",
      "server/test/load/music-load-postgres.integration.test.ts",
      "server/test/migrations/music-runtime.integration.test.ts",
      "server/test/movie-media-import.integration.test.ts",
      "server/test/movies-public-gateway.integration.test.ts",
      "server/test/music-e2e-identity-count-adapter.integration.test.ts",
      "server/test/music-e2e-initial-capture.integration.test.ts",
      "server/test/music-e2e-state-restore.integration.test.ts",
      /*
       * Briefly excluded as order-dependent, then re-measured against this exact 48-file
       * set on a fresh container and gated: the "immutable external identity is
       * tombstoned" failure came from the two Games files throwing in `beforeAll`
       * alongside it, not from this suite.
       */
      "server/test/user-leak.integration.test.ts",
    ]);
    expect(selectors).toHaveLength(48);
    expect(new Set(selectors).size).toBe(48);
  });

  /*
   * The exclusions are pinned too. Without this, the cheap way to make a red required job
   * green is to add one of these three, and nothing would object. Each is excluded for a
   * measured reason, recorded beside the run step in the workflow; if the underlying
   * reason is fixed, this test is where the decision to gate it gets recorded.
   */
  it("keeps the two measured exclusions off the shared fixture service", () => {
    const ordinary = load(read(".github/workflows/test.yml"));
    const job = Object.values(ordinary.jobs).find((job: any) => job.env?.DATABASE_URL_TEST) as any;
    const run = job.steps.find((step: any) => step.run?.includes("npm run test:integration")).run;
    for (const excluded of [
      // Both reject port 55432: `parseC10StandalonePostgresAuthority` treats it as reserved,
      // so Games needs its own disposable container, not this shared service.
      "server/test/explorers/games.integration.test.ts",
      "server/test/games-public-gateway.integration.test.ts",
    ]) {
      expect(run).not.toContain(excluded);
    }
    // And the reason stays written down where the next person changing this job will see it.
    const workflow = read(".github/workflows/test.yml");
    expect(workflow).toContain("Explicit owned Games PG authority required");
    expect(workflow).toContain("the five-service fixture port is reserved");
  });
});

const authority = { commit: "a".repeat(40), containerId: "b".repeat(64), imageId: `sha256:${"c".repeat(64)}`,
  contextHost: "unix:///var/run/docker.sock", port: 51643, owned: true as const };
function harness() {
  const events: string[] = [];
  const children: Array<{ args: readonly string[]; environment: NodeJS.ProcessEnv }> = [];
  let terminate = () => {};
  const dependencies: ImageTestDependencies = {
    commit: () => authority.commit, port: async () => authority.port,
    secret: () => ({ password: "private-secret", path: "/owned/password", remove: () => { events.push("remove-secret"); } }),
    pull: () => { events.push("pull"); },
    start: async (input) => { expect(input).toEqual({ commit: authority.commit, port: authority.port, passwordFile: "/owned/password" }); events.push("start"); return authority; },
    attest: () => { events.push("attest"); return authority; },
    stop: async (owned) => { expect(owned).toBe(authority); events.push("stop"); },
    absent: (owned) => { expect(owned).toBe(authority); events.push("absent"); },
    command: async (args, environment) => { children.push({ args, environment }); events.push(args.join(" ")); },
    signals: (handler) => { terminate = handler; return () => { events.push("unsubscribe"); }; },
  };
  return { dependencies, events, children, terminate: () => terminate() };
}

describe("image CI owned lifecycle", () => {
  it("runs every unchanged command against exact child-only C10 authority and proves absence", async () => {
    const h = harness();
    const environment = { MUSIC_C4_POSTGRES_TEST: "0", MUSIC_C6_POSTGRES_TEST: "0", MUSIC_C7_POSTGRES_TEST: "0" };
    await runImageCiTests(environment, h.dependencies);
    expect(h.children.map((child) => child.args)).toEqual([
      ["test", "--", "--maxWorkers=2"], ["run", "test:integration"], ["run", "test:music-c8:coverage"],
      ["run", "test:music-c8:repository-coverage"], ["run", "music:types:scoped"], ["run", "music:types:baseline"],
    ]);
    expect(IMAGE_TEST_COMMANDS).toHaveLength(6);
    for (const { environment: child } of h.children) {
      expect(child).toMatchObject({ ...environment, MUSIC_C3_POSTGRES_TEST: "1", MUSIC_C5_POSTGRES_TEST: "1",
        MUSIC_C8_POSTGRES_TEST: "1", MUSIC_C9_PUBLICATION_POSTGRES_TEST: "1", MUSIC_C10_STANDALONE_POSTGRES_ACK: "C10_LABELED_LOCAL_PG15",
        MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID: authority.containerId, MUSIC_C10_STANDALONE_POSTGRES_COMMIT: authority.commit,
        MUSIC_C10_STANDALONE_POSTGRES_PORT: "51643", STRAPI_ANALYTICS_ACCESS_TOKEN: "fixture-analytics-token" });
      expect(new URL(child.DATABASE_URL_TEST!).port).toBe("51643");
    }
    expect(environment).not.toHaveProperty("DATABASE_URL_TEST");
    expect(h.events.slice(-4)).toEqual(["stop", "absent", "remove-secret", "unsubscribe"]);
    expect(h.events.join(" ")).not.toContain("private-secret");
  });

  it.each(["DOCKER_HOST", "DOCKER_CONTEXT", "GATE_PROD", "MUSIC_DEPLOY_PRODUCTION", "MUSIC_DEPLOY_PROD",
    "MUSIC_UAT_DATABASE_HOST", "DATABASE_URL", "DATABASE_URL_TEST", "MUSIC_C10_STANDALONE_POSTGRES_ACK"])("refuses ambient %s before acquisition", async (key) => {
    const h = harness();
    await expect(runImageCiTests({ [key]: "foreign" }, h.dependencies)).rejects.toThrow(/ambient/);
    expect(h.events).toEqual([]);
  });

  it.each([55432, 10239, 65536])("refuses reserved or invalid port %s", async (port) => {
    const h = harness(); h.dependencies.port = async () => port;
    await expect(runImageCiTests({}, h.dependencies)).rejects.toThrow(/disposable/);
    expect(h.events).toEqual(["unsubscribe"]);
  });

  it("lets helper acquisition failure stop discovery and removes only its secret", async () => {
    const h = harness(); h.dependencies.start = async () => { throw new Error("acquisition refused"); };
    await expect(runImageCiTests({}, h.dependencies)).rejects.toThrow("acquisition refused");
    expect(h.children).toHaveLength(0);
    expect(h.events).toEqual(["pull", "remove-secret", "unsubscribe"]);
  });

  it("stops at the first child failure and still proves cleanup", async () => {
    const h = harness(); h.dependencies.command = async () => { throw new Error("first diagnostic"); };
    await expect(runImageCiTests({}, h.dependencies)).rejects.toThrow("first diagnostic");
    expect(h.events).toEqual(["pull", "start", "attest", "stop", "absent", "remove-secret", "unsubscribe"]);
  });

  it("preserves both test and cleanup failures without removing a still-mounted secret", async () => {
    const h = harness(); h.dependencies.command = async () => { throw new Error("test failed"); };
    h.dependencies.stop = async () => { throw new Error("cleanup refused"); };
    let failure: AggregateError | undefined;
    try { await runImageCiTests({}, h.dependencies); } catch (error) { failure = error as AggregateError; }
    expect(failure?.errors.map((error: Error) => error.message)).toEqual(["test failed", "cleanup refused"]);
    expect(h.events).not.toContain("remove-secret");
  });

  it("fails the lane if the exact container remains", async () => {
    const h = harness(); h.dependencies.absent = () => { throw new Error("container remains"); };
    await expect(runImageCiTests({}, h.dependencies)).rejects.toThrow("container remains");
    expect(h.events).not.toContain("remove-secret");
  });

  it("handles termination through owned cleanup and starts no later command", async () => {
    const h = harness(); h.dependencies.command = async (_args, _environment, signal) => { h.terminate(); signal.throwIfAborted(); };
    await expect(runImageCiTests({}, h.dependencies)).rejects.toThrow();
    expect(h.events.slice(-4)).toEqual(["stop", "absent", "remove-secret", "unsubscribe"]);
    expect(h.children).toHaveLength(0);
  });
});


describe("native custody and child settlement regressions", () => {
  it("stops and proves exact absence when receipt persistence fails after acquisition", async () => {
    const events: string[] = [];
    const failure = new Error("receipt write failed");
    await expect(transferImageAuthority(async () => authority,
      () => { events.push("persist"); throw failure; },
      async (owned) => { expect(owned).toBe(authority); events.push("stop"); },
      (owned) => { expect(owned).toBe(authority); events.push("absent"); })).rejects.toBe(failure);
    expect(events).toEqual(["persist", "stop", "absent"]);
  });

  it("preserves first error and postpones database cleanup until late native close", async () => {
    const h = harness();
    const child = new EventEmitter();
    const failure = new Error("first abort diagnostic");
    let entered!: () => void;
    const ready = new Promise<void>((accept) => { entered = accept; });
    h.dependencies.command = async () => {
      const result = settleImageCommand(child as any, () => {}, () => {}, 1000);
      entered();
      return result;
    };
    const result = runImageCiTests({}, h.dependencies);
    const rejected = result.catch((error) => error);
    await ready;
    child.emit("error", failure);
    await new Promise((accept) => setTimeout(accept, 10));
    expect(h.events).not.toContain("stop");
    child.emit("close", null, "SIGTERM");
    expect(await rejected).toBe(failure);
    expect(h.events.slice(-4)).toEqual(["stop", "absent", "remove-secret", "unsubscribe"]);
  });
});


describe("failed native cleanup proofs", () => {
  it("preserves acquisition transfer and cleanup failures in order", async () => {
    const first = new Error("custody persistence failed");
    const second = new Error("exact helper stop refused");
    const failure = await transferImageAuthority(async () => authority,
      () => { throw first; }, async () => { throw second; }, () => { throw new Error("must not prove absence"); }).catch((error) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.errors).toEqual([first, second]);
  });

  it("fails boundedly without treating absent close as termination proof", async () => {
    const child = new EventEmitter();
    const first = new Error("abort diagnostic");
    let killed = false;
    let proved = false;
    const result = settleImageCommand(child as any, () => { killed = true; }, () => { proved = true; }, 10).catch((error) => error);
    child.emit("error", first);
    expect(await result).toBe(first);
    expect(killed).toBe(true);
    expect(proved).toBe(false);
    expect(read("tunes/scripts/music-image-ci-tests.ts")).toContain('if (!childTerminationProven) throw new Error');
    expect(read("tunes/scripts/music-image-ci-tests.ts")).toContain('state: "command-running"');
  });
});
