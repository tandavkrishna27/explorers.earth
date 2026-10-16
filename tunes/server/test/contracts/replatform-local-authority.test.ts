import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertPlatformResetTarget,
  assertPlatformContainer,
  assertPlatformNetwork,
  assertPlatformServiceNetworks,
  assertResetComposeModel,
  assertResetResourceInventory,
  assertResetContainerMounts,
  resetPlatformLocal,
  stopPlatformLocal,
  classifyPlatformBuildStage,
  parsePlatformCommand,
  validateProvisionSecretInventory,
  platformViteEnvironment,
  validateResetIntent,
  prepareResetIntent,
  validatePlatformAuthority,
  validatePlatformComposeModel,
  formatPlatformFailure,
  classifyPlatformBuildFailure,
  classifyPlatformIngressFailure,
  buildAndStartPlatformServices,
  classifiesChildOutput,
  carriesBuildStage,
  type PlatformPhase,
} from "../../../../scripts/replatform-local";

const receipt = {
  version: 1 as const,
  project: "explorers-replatform-local",
  database: "music_fixture",
  host: "127.0.0.1",
  port: 51434,
  containerId: "a".repeat(64),
  commit: "b".repeat(40),
};
const ownedModel = {
  name: receipt.project,
  services: { postgres: { labels: { "com.explorers.replatform.fixture": "true", "com.explorers.replatform.project": receipt.project } } },
  networks: { local: { labels: { "com.explorers.replatform.fixture": "true", "com.explorers.replatform.project": receipt.project } } },
  volumes: { database: { labels: { "com.explorers.replatform.fixture": "true", "com.explorers.replatform.project": receipt.project } } },
};
const ownedContainer = {
  Id: receipt.containerId,
  Name: "/explorers-replatform-local-postgres-1",
  Config: { Image: "public.ecr.aws/docker/library/postgres:15-alpine@sha256:f7d23353e1b15400d22ebe31189f4d314b87a4c129cc400c8c2d8d4ca127bf81", Labels: {
    "com.docker.compose.project": receipt.project,
    "com.docker.compose.service": "postgres",
    "com.explorers.replatform.fixture": "true",
    "com.explorers.replatform.project": receipt.project,
  } },
  State: { Running: true, Health: { Status: "healthy" } },
  HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "51434" }] } },
};
const resetModel = {
  ...ownedModel,
  services: Object.fromEntries(["postgres", "strapi", "tunes-migrate", "tunes", "explorers"].map((name) => [name, { volumes: name === "postgres" ? [{ type: "volume", source: "replatform-local-postgres" }] : [] }])),
  networks: {
    "replatform-local": { name: "explorers-replatform-local_replatform-local", internal: true },
    "replatform-edge": { name: "explorers-replatform-local_replatform-edge" },
  },
  volumes: {
    "replatform-local-postgres": { name: "explorers-replatform-local_replatform-local-postgres" },
    "replatform-local-gates": { name: "explorers-replatform-local_replatform-local-gates" },
  },
};

describe("replatform local authority", () => {
  it("stops a PostgreSQL-only interrupted build without requiring qualification health", async () => {
    const partial = { ...ownedContainer, State: { Running: false } };
    let mutations = 0;
    let inventories = 0;
    expect(() => buildAndStartPlatformServices(() => { throw new Error("deterministic service build failure"); })).toThrow();
    await stopPlatformLocal(receipt, { ...receipt }, async () => partial, async () => resetModel,
      async () => { inventories++; }, async model => { expect(model).toBe(resetModel); mutations++; });
    expect(inventories).toBe(1);
    expect(mutations).toBe(1);
    expect(() => assertPlatformContainer(receipt, partial)).toThrow(/authority/i);
  });

  it("refuses interrupted cleanup before mutation for tampered receipts, models or inventory", async () => {
    let mutations = 0;
    const mutate = async () => { mutations++; };
    await expect(stopPlatformLocal(receipt, { ...receipt, commit: "c".repeat(40) }, async () => ownedContainer,
      async () => resetModel, async () => {}, mutate)).rejects.toThrow(/authority/i);
    await expect(stopPlatformLocal(receipt, { ...receipt }, async () => ownedContainer,
      async () => ({ ...resetModel, volumes: {} }), async () => {}, mutate)).rejects.toThrow(/authority/i);
    await expect(stopPlatformLocal(receipt, { ...receipt }, async () => ownedContainer,
      async () => resetModel, async () => { throw new Error("foreign resource authority rejected"); }, mutate)).rejects.toThrow(/authority/i);
    expect(mutations).toBe(0);
  });

  it("permits absent declared resources but rejects foreign, extra and duplicate ownership inventory", () => {
    expect(() => assertResetResourceInventory(["pg", "app"], ["pg"], ["pg", "unrelated"])).not.toThrow();
    expect(() => assertResetResourceInventory(["pg", "app"], ["pg"], ["pg", "app"])).toThrow(/authority/i);
    expect(() => assertResetResourceInventory(["pg", "app"], ["pg", "unknown"], ["pg", "unknown"])).toThrow(/authority/i);
    expect(() => assertResetResourceInventory(["pg", "app"], ["pg", "pg"], ["pg"])).toThrow(/authority/i);
  });

  it.each([
    ["#7 [runner internal] load metadata for sensitive.invalid/image\n#7 ERROR: 429 Too Many Requests", "base-image-pull"],
    ["#9 [builder 4/6] RUN npm ci\n#9 3.0 npm error 429 secret-url", "npm-build-command"],
    ["#7 [runner internal] load metadata for sensitive.invalid/image\n#7 DONE\n#9 [builder 4/6] RUN npm ci\n#9 ERROR: 429", "npm-build-command"],
    ["#7 [runner internal] load metadata for image\n429", "unknown"],
  ])("reports only evidence-bound sanitized failing build stages (%#)", (raw, stage) => {
    expect(classifyPlatformBuildStage(raw)).toBe(stage);
    const diagnostic = formatPlatformFailure("service-build", classifyPlatformBuildFailure(raw), classifyPlatformBuildStage(raw));
    expect(diagnostic).toContain(`build-stage=${stage}`);
    expect(diagnostic).not.toMatch(/sensitive\.invalid|secret-url/);
  });
  it("uses pinned Docker Official Images from the public mirror for every platform registry input", () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const compose = readFileSync(resolve(root, "docker-compose.replatform.yml"), "utf8");
    const frontend = readFileSync(resolve(root, "explorers-earth/Dockerfile.music-fixture"), "utf8");
    expect(compose).toContain("image: public.ecr.aws/docker/library/postgres:15-alpine@sha256:f7d23353e1b15400d22ebe31189f4d314b87a4c129cc400c8c2d8d4ca127bf81");
    const node = "public.ecr.aws/docker/library/node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1";
    expect(compose).toContain(`image: ${node}`);
    expect(frontend).toContain(`FROM ${node} AS builder`);
    expect(frontend).toContain("COPY tunes/shared/explorersContract.ts /workspace/tunes/shared/explorersContract.ts");
    expect(frontend).toContain("FROM public.ecr.aws/docker/library/nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS runner");
  });

  it("builds the shared API image before starting migration from a cold cache", () => {
    let apiImageExists = false;
    const calls: string[][] = [];
    buildAndStartPlatformServices(args => {
      calls.push(args);
      if (args[0] === "build") apiImageExists = true;
      if (args[0] === "up") expect(apiImageExists).toBe(true);
    });
    expect(calls).toEqual([
      ["build", "tunes", "explorers"],
      ["up", "-d", "--no-build", "--wait", "explorers"],
    ]);
  });

  it("does not start the migrator or API when the image build fails", () => {
    const calls: string[][] = [];
    expect(() => buildAndStartPlatformServices(args => {
      calls.push(args);
      throw new Error("image build refused");
    })).toThrow("image build refused");
    expect(calls).toEqual([["build", "tunes", "explorers"]]);
  });

  it("formats a fixed diagnostic phase without underlying authority details", () => {
    expect(formatPlatformFailure("docker-endpoint")).toBe(
      "Replatform local command refused or failed; phase=docker-endpoint; authority details redacted.\n",
    );
  });

  it("classifies a service-build refusal without disclosing Docker output", () => {
    const raw = "toomanyrequests: synthetic-secret-value from a registry";
    const message = formatPlatformFailure("service-build", classifyPlatformBuildFailure(raw));
    expect(message).toContain("phase=service-build; cause=registry-rate-limit");
    expect(message).not.toContain("synthetic-secret-value");
    expect(classifyPlatformBuildFailure("unknown flag: --quiet-build")).toBe("compose-option");
    expect(classifyPlatformBuildFailure("no space left on device")).toBe("resource-exhaustion");
    expect(classifyPlatformBuildFailure("process npm ci did not complete successfully")).toBe("build-command");
    expect(classifyPlatformBuildFailure("sensitive but unknown failure")).toBe("unclassified");
  });

  /*
   * `phase=postgres-start` appeared in CI on 2026-10-09 carrying no cause, because `run`
   * classified only `service-build`. These cases pin both the two categories a service
   * start can hit that a build cannot, and the ordering that makes them reachable: a
   * "port is already allocated" message also contains "Error", and an invalid-service
   * message also matches the image-resolution "not found" shape, so an earlier arm could
   * swallow either.
   */
  it.each([
    ["Error response from daemon: driver failed programming external connectivity: Bind for 127.0.0.1:51434 failed: port is already allocated", "port-unavailable"],
    ["listen tcp 127.0.0.1:51474: bind: address already in use", "port-unavailable"],
    /*
     * Captured verbatim from the daemon by running this service's own compose definition
     * against a host where 51434 is unavailable. Kept exactly as emitted, because the
     * first version of the regex matched none of it and would have said `unclassified`.
     */
    ["Error response from daemon: ports are not available: exposing port TCP 127.0.0.1:51434 -> 127.0.0.1:0: listen tcp4 127.0.0.1:51434: bind: An attempt was made to access a socket in a way forbidden by its access permissions.", "port-unavailable"],
    ["no such service: postgres", "compose-config-invalid"],
    ["validating docker-compose.replatform.yml: services.postgres Additional property healthchek is not allowed", "compose-config-invalid"],
    ["yaml: line 12: did not find expected key", "compose-config-invalid"],
    // Still reaches the pre-existing arms, so adding these two narrowed nothing.
    ["dependency failed to start: container postgres is unhealthy", "service-health"],
    ["no space left on device", "resource-exhaustion"],
  ])("classifies a postgres-start refusal into the closed set (%#)", (raw, expected) => {
    const cause = classifyPlatformBuildFailure(`${raw}\ncredential=synthetic-secret-value`);
    expect(cause).toBe(expected);
    const message = formatPlatformFailure("postgres-start", cause);
    expect(message).toBe(
      `Replatform local command refused or failed; phase=postgres-start; cause=${expected}; authority details redacted.\n`,
    );
    // The whole point of the closed set: the category speaks, the output never does.
    expect(message).not.toContain("synthetic-secret-value");
    expect(message).not.toContain("51434");
    expect(message).not.toContain("51474");
  });

  it("carries no build stage on a postgres-start refusal, because there is no build output", () => {
    // A stage would be fabricated here - `classifyPlatformBuildStage` parses BuildKit
    // step lines, and a service start produces none, so it would always say "unknown".
    expect(formatPlatformFailure("postgres-start", "port-unavailable")).not.toContain("build-stage=");
    expect(classifyPlatformBuildStage("no such service: postgres")).toBe("unknown");
  });

  /*
   * This is the assertion the cause-set cases above cannot make. Mutation-testing them
   * found it: reverting the wiring that routes `postgres-start` to the classifier left all
   * of them green, because they call the classifier themselves. The behaviour under test
   * is *which phases get classified at all*, so it needs its own seam and its own case.
   */
  it("classifies exactly the two phases that produce child output", () => {
    const classified: PlatformPhase[] = ["service-build", "postgres-start"];
    const bare: PlatformPhase[] = ["docker-endpoint", "compose-model", "resource-inventory",
      "secret-inventory", "postgres-attestation", "service-check", "receipt-check", "ingress-check"];
    for (const phase of classified) expect(classifiesChildOutput(phase)).toBe(true);
    // `ingress-check` is in this list on purpose: it has its own classifier, driven by the
    // probe's error rather than by child process output, and must not be routed here.
    for (const phase of bare) expect(classifiesChildOutput(phase)).toBe(false);
    // Every phase is accounted for, so a new one cannot be added without a decision here.
    expect(new Set([...classified, ...bare]).size).toBe(10);
  });

  it("attaches a build stage to the build phase only", () => {
    expect(carriesBuildStage("service-build")).toBe(true);
    expect(carriesBuildStage("postgres-start")).toBe(false);
  });

  it.each([
    ["tunes-migrate Error pull access denied for explorers-replatform-local-tunes, repository does not exist or may require 'docker login'", "local-fixture-pull-denied"],
    ["Error pull access denied for docker.io/library/explorers-replatform-local-tunes:c4, repository does not exist", "local-fixture-pull-denied"],
    ["Error pull access denied for private.example.invalid/secret-image, repository does not exist", "upstream-registry-auth"],
    ["failed to authorize: failed to fetch anonymous token: unexpected status: 401 Unauthorized", "upstream-registry-auth"],
    ["pull access denied for explorers-replatform-local-tunes, repository does not exist\nfailed to authorize: failed to fetch anonymous token: 401 Unauthorized", "mixed-registry-auth"],
    ["authentication required: synthetic-secret-value", "registry-auth"],
    ["explorers-replatform-local-tunes:c4 Building\nunauthorized: synthetic-secret-value", "registry-auth"],
    ["pull access denied for explorers-replatform-local-tunes-other, repository does not exist", "upstream-registry-auth"],
  ])("narrows registry denial evidence without printing raw output (%#)", (raw, expected) => {
    const cause = classifyPlatformBuildFailure(`${raw}\ncredential=synthetic-secret-value`);
    expect(cause).toBe(expected);
    expect(formatPlatformFailure("service-build", cause)).toBe(
      `Replatform local command refused or failed; phase=service-build; cause=${expected}; authority details redacted.\n`,
    );
  });

  /*
   * Ingress verification reports under its own phase and its own closed set of causes.
   *
   * It used to report `phase=receipt-check` with no cause, because the phase was set before
   * the receipt check and never advanced - so a route answering wrongly was indistinguishable
   * from a bad authority receipt. `platform-fixture` has flapped on exactly this, and the
   * handoff documented a registry rate limit, which is a different failure with a different
   * remedy.
   *
   * The probe messages name a path and are still never printed; only the category is.
   */
  it.each([
    ["canonical route absent from the fixture route graph: /api/explorers/v1/me (expected 200, received 404).", "canonical-route-absent"],
    ["canonical handler mismatch: /api/explorers/v1/me is mounted but reason was not explorers-owner.", "canonical-handler-mismatch"],
    ["fixture ingress mismatch: /api/legacy/thing", "fixture-route-mismatch"],
    ["fixture handler mismatch: /api/legacy/thing", "fixture-handler-mismatch"],
    ["fixture Strapi boundary mismatch", "fixture-identity-boundary"],
    ["fetch failed", "ingress-unreachable"],
    ["The operation was aborted due to timeout", "ingress-unreachable"],
    ["ingress served the application shell where JSON was expected", "ingress-html-shell"],
    ["Unexpected token < in JSON at position 0", "ingress-malformed-body"],
    ["Unexpected end of JSON input", "ingress-malformed-body"],
    ["something nobody anticipated", "unclassified"],
  ])("classifies an ingress refusal without printing the probe (%#)", (raw, expected) => {
    const cause = classifyPlatformIngressFailure(new Error(`${raw} credential=synthetic-secret-value`));
    expect(cause).toBe(expected);
    const message = formatPlatformFailure("ingress-check", cause);
    expect(message).toBe(
      `Replatform local command refused or failed; phase=ingress-check; cause=${expected}; authority details redacted.
`,
    );
    expect(message).not.toContain("synthetic-secret-value");
    expect(message).not.toContain("/api/");
  });

  it("classifies a thrown SyntaxError as a malformed body whatever its message", () => {
    // `response.json()` rejects with a SyntaxError whose wording is engine-specific, so
    // the type is checked as well as the message.
    expect(classifyPlatformIngressFailure(new SyntaxError("engine specific wording")))
      .toBe("ingress-malformed-body");
  });

  it("does not mistake a non-Error rejection for a known ingress cause", () => {
    expect(classifyPlatformIngressFailure("canonical route absent")).toBe("unclassified");
    expect(classifyPlatformIngressFailure(undefined)).toBe("unclassified");
  });

  it("accepts only the declared local and acceptance seed commands", () => {
    expect(parsePlatformCommand(["provision"])).toEqual({ command: "provision" });
    expect(parsePlatformCommand(["seed", "--dataset", "acceptance"])).toEqual({ command: "seed", dataset: "acceptance" });
    for (const args of [["reset", "--project", "production"], ["seed"], ["start", "extra"], ["up"]]) {
      expect(() => parsePlatformCommand(args)).toThrow(/arguments/i);
    }
  });

  it("reuses only a complete interrupted fixture secret inventory", () => {
    const safe = ["db-migrator", "db-runtime", "music-token"].map((name) => ({ name, kind: "file" as const, nlink: 1, size: 43 }));
    expect(validateProvisionSecretInventory([])).toBe("create");
    expect(validateProvisionSecretInventory(safe)).toBe("reuse");
    expect(() => validateProvisionSecretInventory(safe.slice(0, 2))).toThrow(/authority/i);
    expect(() => validateProvisionSecretInventory([{ ...safe[0], kind: "symlink" }, ...safe.slice(1)])).toThrow(/authority/i);
    expect(() => validateProvisionSecretInventory([{ ...safe[0], name: "../db-migrator" }, ...safe.slice(1)])).toThrow(/authority/i);
  });

  it("passes only explicit fixture Vite values from a secret-bearing parent environment", () => {
    const env = platformViteEnvironment({ PATH: "fixture-path", VITE_IGDB_CLIENT_SECRET: "SYNTHETIC_SENTINEL", VITE_PAYMENT_API_URL: "https://hosted.example" });
    expect(env.VITE_IGDB_CLIENT_SECRET).toBeUndefined();
    expect(env.VITE_PAYMENT_API_URL).toBeUndefined();
    expect(env.VITE_API_URL).toBe("http://127.0.0.1:51474/graphql");
    expect(env.MUSIC_DEV_PROXY_TARGET).toBe("http://127.0.0.1:51474");
  });

  it("requires an exact reset intent before reprovisioning a retired receipt", () => {
    expect(validateResetIntent(receipt, { status: "pending", authority: { ...receipt } })).toBe(true);
    expect(validateResetIntent(receipt, { status: "consumed", authority: { ...receipt } })).toBe(false);
    expect(() => validateResetIntent(receipt, { status: "pending", authority: { ...receipt, project: "production" } })).toThrow(/authority/i);
  });
  it("renews or retries only an exact intent for the same provisioned authority", () => {
    expect(prepareResetIntent(receipt, { status: "consumed", authority: { ...receipt } })).toEqual({ status: "pending", authority: receipt });
    expect(() => prepareResetIntent(receipt, { status: "consumed", authority: { ...receipt, containerId: "c".repeat(64) } })).toThrow(/authority/i);
    expect(prepareResetIntent(receipt, { status: "pending", authority: { ...receipt } })).toEqual({ status: "pending", authority: receipt });
  });
  it("accepts only an exact provisioned loopback target", () => {
    expect(validatePlatformAuthority(receipt, `postgresql://music_migrator:fixture@127.0.0.1:51434/music_fixture`, receipt.commit)).toEqual(receipt);
    for (const target of [
      "postgresql://music_migrator:fixture@db.example.com:51434/music_fixture",
      "postgresql://music_migrator:fixture@127.0.0.1:51434/production",
      "postgresql://music_migrator:fixture@127.0.0.1:55435/music_fixture",
    ]) expect(() => validatePlatformAuthority(receipt, target, receipt.commit)).toThrow(/authority/i);
  });

  it("rejects missing, changed, or simultaneous test authorities", () => {
    expect(() => validatePlatformAuthority(undefined, "", receipt.commit)).toThrow(/authority/i);
    expect(() => validatePlatformAuthority({ ...receipt, project: "other" }, "", receipt.commit)).toThrow(/authority/i);
    expect(() => validatePlatformAuthority(receipt, "", "c".repeat(40))).toThrow(/authority/i);
    expect(() => validatePlatformAuthority(receipt, "", receipt.commit, { MUSIC_UAT_DATABASE_ACK: "x" })).toThrow(/authority/i);
    expect(() => validatePlatformAuthority(receipt, "", receipt.commit, { MUSIC_C10_STANDALONE_POSTGRES_ACK: "x" })).toThrow(/authority/i);
    expect(() => validatePlatformAuthority(receipt, "", receipt.commit, { DATABASE_URL: "postgresql://production.example.com/app" })).toThrow(/authority/i);
    expect(() => validatePlatformAuthority(receipt, "", receipt.commit, { DOCKER_CONTEXT: "production" })).toThrow(/authority/i);
  });

  it("refuses any reset target except the attested receipt before mutation", () => {
    expect(() => assertPlatformResetTarget(receipt, { ...receipt, containerId: "c".repeat(64) })).toThrow(/authority/i);
    expect(() => assertPlatformResetTarget(receipt, { ...receipt, project: "production" })).toThrow(/authority/i);
    expect(assertPlatformResetTarget(receipt, { ...receipt })).toEqual(receipt);
  });

  it("rejects every undeclared or unowned Compose deletion target before reset mutation", async () => {
    expect(assertResetComposeModel(resetModel)).toEqual(resetModel);
    const unsafe = { ...resetModel, volumes: { ...resetModel.volumes, extra: { name: "another_local_volume" } } };
    expect(() => assertResetComposeModel(unsafe)).toThrow(/authority/i);
    let mutations = 0;
    await expect(resetPlatformLocal(receipt, { ...receipt }, async () => ownedContainer, async () => unsafe, async () => { mutations++; }))
      .rejects.toThrow(/authority/i);
    expect(mutations).toBe(0);
    let deletionModel: unknown;
    await resetPlatformLocal(receipt, { ...receipt }, async () => ownedContainer, async () => resetModel, async (model) => { deletionModel = model; });
    expect(deletionModel).toBe(resetModel);
    expect(() => assertResetComposeModel({ ...resetModel, volumes: { ...resetModel.volumes, "replatform-local-postgres": { name: "another_local_volume" } } })).toThrow(/authority/i);
    expect(() => assertResetComposeModel({ ...resetModel, volumes: { ...resetModel.volumes, "replatform-local-postgres": { name: "explorers-replatform-local_replatform-local-postgres", external: true } } })).toThrow(/authority/i);
    expect(() => assertResetComposeModel({ ...resetModel, networks: { ...resetModel.networks, "replatform-edge": { name: "another_local_network" } } })).toThrow(/authority/i);
    expect(() => assertResetComposeModel({ ...resetModel, services: { ...resetModel.services, postgres: { volumes: [{ type: "volume", source: "another_local_volume" }] } } })).toThrow(/authority/i);
    expect(() => assertResetResourceInventory(["owned"], ["owned"], ["owned"])).not.toThrow();
    expect(() => assertResetResourceInventory(["owned"], [], ["owned"])).toThrow(/authority/i);
    expect(() => assertResetContainerMounts([{ Type: "volume", Name: "explorers-replatform-local_replatform-local-postgres" }, { Type: "bind" }])).not.toThrow();
    expect(() => assertResetContainerMounts([{ Type: "volume", Name: "unowned_volume" }])).toThrow(/authority/i);
  });

  it("requires a separate labeled Compose project with a loopback PostgreSQL service", () => {
    expect(validatePlatformComposeModel(ownedModel)).toEqual(ownedModel);
    expect(() => validatePlatformComposeModel({ ...ownedModel, name: "production" })).toThrow(/authority/i);
    expect(() => validatePlatformComposeModel({ ...ownedModel, networks: { local: { labels: {} } } })).toThrow(/authority/i);
  });

  it("attests live container identity, labels, and loopback binding", () => {
    expect(assertPlatformContainer(receipt, ownedContainer)).toEqual(receipt);
    expect(() => assertPlatformContainer(receipt, { ...ownedContainer, Id: "c".repeat(64) })).toThrow(/authority/i);
    expect(() => assertPlatformContainer(receipt, { ...ownedContainer, HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "55434" }] } } })).toThrow(/authority/i);
    expect(() => assertPlatformContainer(receipt, { ...ownedContainer, Config: { ...ownedContainer.Config, Labels: { ...ownedContainer.Config.Labels, "com.docker.compose.project": "other" } } })).toThrow(/authority/i);
  });
  it.each([
    "postgres:15-alpine",
    "public.ecr.aws/docker/library/postgres:15-alpine",
    `public.ecr.aws/docker/library/postgres:15-alpine@sha256:${"a".repeat(64)}`,
  ])("refuses a PostgreSQL image outside the exact mirror pin (%#)", image => {
    expect(() => assertPlatformContainer(receipt, {
      ...ownedContainer, Config: { ...ownedContainer.Config, Image: image },
    })).toThrow(/authority/i);
  });
  it("requires the live fixture network to be private and owned", () => {
    const network = { Name: "explorers-replatform-local_replatform-local", Internal: true, Labels: {
      "com.docker.compose.project": receipt.project,
      "com.explorers.replatform.fixture": "true",
      "com.explorers.replatform.project": receipt.project,
    } };
    expect(assertPlatformNetwork(network)).toEqual(network);
    expect(() => assertPlatformNetwork({ ...network, Internal: false })).toThrow(/authority/i);
    expect(() => assertPlatformNetwork({ ...network, Name: "production_default" })).toThrow(/authority/i);
  });
  it("keeps application backends off the gateway edge network", () => {
    const privateOnly = { NetworkSettings: { Networks: { "explorers-replatform-local_replatform-local": {} } } };
    const gateway = { NetworkSettings: { Networks: { ...privateOnly.NetworkSettings.Networks, "explorers-replatform-local_replatform-edge": {} } } };
    expect(assertPlatformServiceNetworks("tunes", privateOnly)).toEqual(privateOnly);
    expect(assertPlatformServiceNetworks("explorers", gateway)).toEqual(gateway);
    expect(() => assertPlatformServiceNetworks("tunes", gateway)).toThrow(/authority/i);
    expect(() => assertPlatformServiceNetworks("explorers", privateOnly)).toThrow(/authority/i);
  });

  it("does not call reset mutation when container attestation fails", async () => {
    let mutations = 0;
    await expect(resetPlatformLocal(receipt, { ...receipt }, async () => ({ ...ownedContainer, Id: "c".repeat(64) }), async () => resetModel, async () => { mutations++; }))
      .rejects.toThrow(/authority/i);
    expect(mutations).toBe(0);
    await resetPlatformLocal(receipt, { ...receipt }, async () => ownedContainer, async () => resetModel, async () => { mutations++; });
    expect(mutations).toBe(1);
  });

  it("can reset an exact stopped local container after stop", async () => {
    let mutations = 0;
    const stopped = { ...ownedContainer, State: { Running: false, Health: { Status: "healthy" } } };
    await resetPlatformLocal(receipt, { ...receipt }, async () => stopped, async () => resetModel, async () => { mutations++; });
    expect(mutations).toBe(1);
    await expect(resetPlatformLocal(receipt, { ...receipt }, async () => ({ ...stopped, Id: "c".repeat(64) }), async () => resetModel, async () => { mutations++; })).rejects.toThrow(/authority/i);
    expect(mutations).toBe(1);
  });

  it("resolves the checked-in Compose file to the owned local project", () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const result = spawnSync("docker", ["compose", "-f", "docker-compose.replatform.yml", "config", "--format", "json"], {
      cwd: root, encoding: "utf8", windowsHide: true, timeout: 15_000,
      env: { ...process.env,
        MUSIC_DB_MIGRATOR_SECRET_FILE_HOST: resolve(root, "fixtures", "dummy-migrator"),
        MUSIC_DB_RUNTIME_SECRET_FILE_HOST: resolve(root, "fixtures", "dummy-runtime"),
        MUSIC_TOKEN_SECRET_FILE_HOST: resolve(root, "fixtures", "dummy-token"),
      },
    });
    expect(result.status, result.stderr).toBe(0);
    const model = JSON.parse(result.stdout);
    expect(validatePlatformComposeModel(model)).toEqual(model);
    expect(model.services.postgres.ports).toEqual(expect.arrayContaining([expect.objectContaining({ host_ip: "127.0.0.1", published: "51434" })]));
    expect(model.networks["replatform-local"].internal).toBe(true);
    expect(model.services.tunes.ports ?? []).toEqual([]);
    expect(model.services["tunes-migrate"].image).toBe(model.services.tunes.image);
    expect(model.services.tunes.image).toBe("explorers-replatform-local-tunes:c4");
    expect(model.services["tunes-migrate"].pull_policy).toBe("never");
    expect(model.services.tunes.pull_policy).toBe("never");
    expect(model.services.strapi.ports ?? []).toEqual([]);
    expect(Object.keys(model.services.explorers.networks).sort()).toEqual(["replatform-edge", "replatform-local"]);
    expect(Object.keys(model.services.tunes.networks)).toEqual(["replatform-local"]);
    expect(model.services.explorers.ports).toEqual(expect.arrayContaining([expect.objectContaining({ host_ip: "127.0.0.1", published: "51474" })]));
  }, 20_000);
});
