import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ChildProcess, execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMusicFixtureService,
  fixtureGraphqlResponse,
  fixtureReconciliationResponse,
  fixtureResponse,
  parseMusicFixtureServerArguments,
} from "../../../scripts/music-fixture-server.ts";

afterEach(() => vi.unstubAllGlobals());

const repositoryRoot = resolve(import.meta.dirname, "../../../..");

function checkedInGraphqlOperation(relativePath: string, operation: string): string {
  const source = readFileSync(resolve(repositoryRoot, relativePath), "utf8");
  const matches = [...source.matchAll(/gql`([\s\S]*?)`/g)]
    .map((match) => match[1])
    .filter((document) => new RegExp(`\\b(?:query|mutation)\\s+${operation}\\b`).test(document));
  if (matches.length !== 1) throw new Error(`expected one checked-in ${operation} document`);
  return matches[0]!;
}

type ProcessIdentity = { pid: number; started: string };

function readProcessIdentity(pid: number): ProcessIdentity | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("invalid child PID");
  if (process.platform === "linux") {
    try {
      const stat = readFileSync("/proc/" + pid + "/stat", "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
      if (!/^\d+$/.test(fields[19] ?? "")) throw new Error("malformed process start time");
      return { pid, started: fields[19]! };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  if (process.platform !== "win32") throw new Error("fixture identity platform unsupported");
  const command = "$ErrorActionPreference='Stop'; try { "
    + "$p=[System.Diagnostics.Process]::GetProcessById(" + pid + "); "
    + "$p.StartTime.ToUniversalTime().Ticks.ToString() } "
    + "catch [System.ArgumentException] { exit 3 }";
  try {
    const started = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command],
      { encoding: "utf8", timeout: 1_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (!/^\d+$/.test(started)) throw new Error("malformed process creation time");
    return { pid, started };
  } catch (error) {
    if ((error as { status?: number }).status === 3) return undefined;
    throw error;
  }
}

function within<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(message)), milliseconds);
    promise.then((value) => {
      clearTimeout(timer);
      resolvePromise(value);
    }, (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
  });
}

const fixtureDiagnosticReason = Symbol("fixtureDiagnosticReason");
const fixtureStderrLimit = 8_192;

function withFixtureStderr(error: unknown, stderr: string): Error {
  const candidate = error instanceof Error ? error : new Error(String(error), { cause: error });
  const reason = (candidate as Error & { [fixtureDiagnosticReason]?: Error })[fixtureDiagnosticReason] ?? candidate;
  const suffix = stderr.slice(-fixtureStderrLimit);
  if (!suffix) return reason;
  const diagnosed = new Error(`${reason.message}\nfixture stderr (bounded suffix): ${suffix}`, { cause: reason });
  Object.defineProperty(diagnosed, fixtureDiagnosticReason, { value: reason });
  return diagnosed;
}

function observeFixture(child: ChildProcess, nonce: string) {
  let buffer = "";
  let stderr = "";
  let seen = false;
  let fault: Error | undefined;
  let resolveReady!: (port: number) => void;
  let rejectReady!: (error: Error) => void;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolvePromise) => { resolveClosed = resolvePromise; });
  const readiness = new Promise<number>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const fail = (error: Error) => {
    fault ??= error;
    rejectReady(error);
  };
  const onError = (error: Error) => fail(error);
  const onClose = () => {
    resolveClosed();
    if (!seen) fail(new Error("fixture exited before readiness"));
  };
  const onData = (chunk: string) => {
    buffer += chunk;
    if (buffer.length > 8_192) {
      fail(new Error("oversized readiness"));
      return;
    }
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const record = JSON.parse(line);
        if (seen || record.schemaVersion !== "music-fixture-ready/v1" || record.nonce !== nonce
          || record.host !== "127.0.0.1" || !Number.isInteger(record.port)
          || record.port < 1 || record.port > 65_535) throw new Error("invalid or duplicate readiness");
        if (child.exitCode !== null || child.signalCode !== null) throw new Error("departed fixture");
        seen = true;
        resolveReady(record.port);
      } catch (error) {
        fail(error instanceof Error ? error : new Error("invalid readiness"));
      }
    }
  };
  child.once("close", onClose);
  child.once("error", onError);
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", onData);
  const onStderr = (chunk: string) => {
    stderr = chunk.length >= fixtureStderrLimit
      ? chunk.slice(-fixtureStderrLimit)
      : (stderr + chunk).slice(-fixtureStderrLimit);
  };
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", onStderr);
  const ready = within(readiness, 5_000, "fixture readiness timeout")
    .catch((error) => { throw withFixtureStderr(error, stderr); });
  void ready.catch(() => {});
  return {
    ready,
    closed,
    withDiagnostics(error: unknown) { return withFixtureStderr(error, stderr); },
    assertHealthy() {
      if (fault) throw withFixtureStderr(fault, stderr);
      if (buffer.trim()) throw withFixtureStderr(new Error("unterminated readiness line"), stderr);
    },
    dispose() {
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onStderr);
      child.off("error", onError);
      child.off("close", onClose);
    },
  };
}

type FixtureStopDependencies = {
  readIdentity?: typeof readProcessIdentity;
  waitWithin?: typeof within;
};

async function stopFixture(
  child: ChildProcess,
  closed: Promise<void>,
  before?: ProcessIdentity,
  dependencies: FixtureStopDependencies = {},
): Promise<void> {
  const readIdentity = dependencies.readIdentity ?? readProcessIdentity;
  const waitWithin = dependencies.waitWithin ?? within;
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  try {
    await waitWithin(closed, 2_000, "fixture cooperative close timeout");
  } catch {
    if (!before) throw new Error("fixture identity unavailable; escalation refused");
    const current = readIdentity(before.pid);
    if (!current) {
      await waitWithin(closed, 1_000, "departed fixture close not observed");
      return;
    }
    if (current.pid !== before.pid || current.started !== before.started) {
      throw new Error("fixture identity changed; escalation refused");
    }
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await waitWithin(closed, 2_000, "fixture force-close not observed");
  }
  if (before) {
    const current = readIdentity(before.pid);
    if (current && current.started === before.started) throw new Error("owned fixture survived cleanup");
  }
}

function injectedFixtureChild(): ChildProcess {
  const child = new ChildProcess();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = (() => true) as ChildProcess["kill"];
  return child;
}

const immediateTimeout = (<T>(_promise: Promise<T>, _milliseconds: number, message: string) =>
  Promise.reject(new Error(message))) as typeof within;

describe("fixture process helper boundaries", () => {
  it("waits for a complete newline-framed readiness record across fragmented output", async () => {
    const child = injectedFixtureChild();
    const observation = observeFixture(child, "fragment-nonce");
    let settled = false;
    void observation.ready.then(() => { settled = true; });
    child.stdout!.emit("data", '{"schemaVersion":"music-fixture-ready/v1","host":"127.0.0.1",');
    await Promise.resolve();
    expect(settled).toBe(false);
    child.stdout!.emit("data", '"port":43210,"nonce":"fragment-nonce"}\n');
    await expect(observation.ready).resolves.toBe(43_210);
    observation.assertHealthy();
    observation.dispose();
  });

  it("rejects duplicate readiness records after the first authenticated record", async () => {
    const child = injectedFixtureChild();
    const observation = observeFixture(child, "duplicate-nonce");
    const line = JSON.stringify({ schemaVersion: "music-fixture-ready/v1", host: "127.0.0.1", port: 43_211, nonce: "duplicate-nonce" }) + "\n";
    child.stdout!.emit("data", line + line);
    await expect(observation.ready).resolves.toBe(43_211);
    expect(() => observation.assertHealthy()).toThrow("invalid or duplicate readiness");
    observation.dispose();
  });

  it("rejects a complete readiness record with the wrong nonce", async () => {
    const child = injectedFixtureChild();
    const observation = observeFixture(child, "expected-nonce");
    child.stdout!.emit("data", JSON.stringify({
      schemaVersion: "music-fixture-ready/v1", host: "127.0.0.1", port: 43_212, nonce: "wrong-nonce",
    }) + "\n");
    await expect(observation.ready).rejects.toThrow("invalid or duplicate readiness");
    observation.dispose();
  });

  it("surfaces a bounded stderr suffix in observable readiness failures", async () => {
    const child = injectedFixtureChild();
    const observation = observeFixture(child, "expected-nonce");
    const droppedPrefix = "discarded-prefix";
    const retainedSuffix = "x".repeat(8_180) + "visible-tail";
    try {
      child.stderr!.emit("data", droppedPrefix + retainedSuffix);
      child.stdout!.emit("data", JSON.stringify({
        schemaVersion: "music-fixture-ready/v1", host: "127.0.0.1", port: 43_213, nonce: "wrong-nonce",
      }) + "\n");
      const failure = await observation.ready.catch((error: Error) => error) as Error & { cause?: unknown };
      expect(failure.message).toContain(`fixture stderr (bounded suffix): ${retainedSuffix}`);
      expect(failure.message).not.toContain(droppedPrefix);
      expect((failure.cause as Error).message).toBe("invalid or duplicate readiness");
    } finally {
      observation.dispose();
    }
  });

  it("rejects a fixture close before authenticated readiness", async () => {
    const child = injectedFixtureChild();
    const observation = observeFixture(child, "early-close-nonce");
    child.emit("close", 1, null);
    await expect(observation.ready).rejects.toThrow("fixture exited before readiness");
    observation.dispose();
  });

  it("refuses force escalation when the captured identity is absent", async () => {
    const child = injectedFixtureChild();
    const signals: string[] = [];
    child.kill = ((signal) => { signals.push(String(signal)); return true; }) as ChildProcess["kill"];
    await expect(stopFixture(child, new Promise<void>(() => {}), undefined, { waitWithin: immediateTimeout }))
      .rejects.toThrow("fixture identity unavailable; escalation refused");
    expect(signals).toEqual(["SIGTERM"]);
  });

  it("propagates identity lookup errors without force escalation", async () => {
    const child = injectedFixtureChild();
    const signals: string[] = [];
    child.kill = ((signal) => { signals.push(String(signal)); return true; }) as ChildProcess["kill"];
    await expect(stopFixture(child, new Promise<void>(() => {}), { pid: 123, started: "original" }, {
      waitWithin: immediateTimeout,
      readIdentity: () => { throw new Error("identity lookup failed"); },
    })).rejects.toThrow("identity lookup failed");
    expect(signals).toEqual(["SIGTERM"]);
  });

  it("refuses force escalation when the process identity changed", async () => {
    const child = injectedFixtureChild();
    const signals: string[] = [];
    child.kill = ((signal) => { signals.push(String(signal)); return true; }) as ChildProcess["kill"];
    await expect(stopFixture(child, new Promise<void>(() => {}), { pid: 123, started: "original" }, {
      waitWithin: immediateTimeout,
      readIdentity: (pid) => ({ pid, started: "replacement" }),
    })).rejects.toThrow("fixture identity changed; escalation refused");
    expect(signals).toEqual(["SIGTERM"]);
  });

  it("fails when exact-identity force-close is not observed", async () => {
    const child = injectedFixtureChild();
    const signals: string[] = [];
    child.kill = ((signal) => { signals.push(String(signal)); return true; }) as ChildProcess["kill"];
    await expect(stopFixture(child, new Promise<void>(() => {}), { pid: 123, started: "original" }, {
      waitWithin: immediateTimeout,
      readIdentity: (pid) => ({ pid, started: "original" }),
    })).rejects.toThrow("fixture force-close not observed");
    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
  });
});

describe("deterministic Music fixture services", () => {
  it("parses fixture bind arguments without starting a process", () => {
    expect(parseMusicFixtureServerArguments(["--port", "1337"]))
      .toEqual({ host: "0.0.0.0", port: 1337, nonce: undefined });
    expect(parseMusicFixtureServerArguments(["--host", "127.0.0.1", "--port", "0", "--nonce", "abc123"])).toEqual({
      host: "127.0.0.1", port: 0, nonce: "abc123",
    });
    const compose = readFileSync(resolve(repositoryRoot, "docker-compose.music-test.yml"), "utf8");
    expect(compose).toContain('["node", "--experimental-strip-types", "tunes/scripts/music-fixture-server.ts", "--port", "1337"]');
    expect(compose).not.toContain('"--host"');
  });

  it("parses fixture bind arguments by rejecting invalid port, host, and nonce values", () => {
    const cases = [
      { args: ["--port", "65536"], message: "usage: --port <0..65535>" },
      { args: ["--host", "localhost", "--port", "1337"], message: "usage: --host <0.0.0.0|127.0.0.1>" },
      { args: ["--port", "1337", "--nonce", "unsafe token"], message: "usage: --nonce <safe-token>" },
    ];
    for (const { args, message } of cases) {
      expect(() => parseMusicFixtureServerArguments(args), args.join(" ")).toThrow(message);
    }
  });

  it("projects one configured namespaced identity and restores its allowlisted Account preference", () => {
    const service = createMusicFixtureService({
      username: "e2e-public-music-contract-owner",
      accountDocumentId: "e2e-public-music-contract-account",
      userDocumentId: "e2e-public-music-contract-user",
      token: "contract-fixture-token",
    });
    const authority = "Bearer contract-fixture-token";

    expect(service.response({ path: "/api/users/me", method: "GET", authorization: authority })).toMatchObject({
      status: 200,
      body: { username: "e2e-public-music-contract-owner", documentId: "e2e-public-music-contract-user",
        accounts: [{ documentId: "e2e-public-music-contract-account", public_music: "No" }] },
    });
    expect(service.response({ path: "/api/accounts/e2e-public-music-contract-account", method: "PUT", authorization: authority,
      body: { data: { public_music: "Yes" } } })).toMatchObject({ status: 200, body: { data: { public_music: "Yes" } } });
    expect(service.response({ path: "/api/accounts/e2e-public-music-contract-account", method: "GET", authorization: authority }))
      .toMatchObject({ status: 200, body: { data: { documentId: "e2e-public-music-contract-account", public_music: "Yes" } } });
    expect(service.response({ path: "/api/accounts/e2e-public-music-contract-account", method: "PUT", authorization: authority,
      body: { data: { public_music: "No" } } })).toMatchObject({ status: 200, body: { data: { public_music: "No" } } });

    for (const denied of [
      { path: "/api/accounts/wrong-account", method: "GET", authorization: authority },
      { path: "/api/accounts/e2e-public-music-contract-account", method: "GET", authorization: "Bearer wrong" },
      { path: "/api/accounts/e2e-public-music-contract-account", method: "PATCH", authorization: authority },
      { path: "/api/accounts/e2e-public-music-contract-account", method: "PUT", authorization: authority, body: { data: { public_music: "Maybe" } } },
      { path: "/api/accounts/e2e-public-music-contract-account", method: "PUT", authorization: authority, body: { data: { public_music: "Yes", Account_Name: "changed" } } },
    ]) expect(service.response(denied).status).not.toBe(200);
  });

  it("serves the exact checked-in profile documents with deterministic revisioned state and exact privileged restore", () => {
    const namespace = "e2e-public-music-profile-contract";
    const username = `${namespace}-owner`;
    const accountDocumentId = `${namespace}-account`;
    const userDocumentId = `${namespace}-user`;
    const token = "profile-contract-fixture-token";
    const authority = `Bearer ${token}`;
    const service = createMusicFixtureService({ username, accountDocumentId, userDocumentId, token });
    const tuple = { namespace, username, accountDocumentId, userDocumentId };
    const profileQuery = checkedInGraphqlOperation("tunes/scripts/legacy-profile-fixture-documents.txt", "UsersPermissionsUser");
    const settingsQuery = checkedInGraphqlOperation("explorers-earth/src/features/Settings/api/mutation.ts", "UsersPermissionsUser");
    const updateMutation = checkedInGraphqlOperation("explorers-earth/src/features/Profile/hooks/useUpdateProfile.ts", "UpdateAccount");
    const visibilityMutation = checkedInGraphqlOperation("explorers-earth/src/features/Settings/api/mutation.ts", "UpdateAccount");
    const publicProfileQuery = checkedInGraphqlOperation("explorers-earth/src/features/PublicHome/api/query.ts", "PublicProfileData");

    const captured = service.response({
      path: "/__music-fixture/profile-state/snapshot", method: "POST", authorization: authority, body: tuple,
    });
    expect(captured).toMatchObject({
      status: 200,
      body: {
        version: "music-fixture-profile-state/v1",
        revision: 0,
        stateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        snapshot: { version: "music-fixture-profile-snapshot/v1", revision: 0, account: {
          documentId: accountDocumentId,
          username,
          social_media: { theme_settings: expect.any(Object) },
          Feed_Data: [expect.objectContaining({ type: "image", url: "/images/tuneslogo.png" })],
          updatedAt: expect.any(String),
        } },
      },
    });
    const capturedBody = captured.body as { snapshot: unknown; stateHash: string };

    const before = service.graphql({ authorization: authority, method: "POST", query: profileQuery, variables: { documentId: userDocumentId } });
    expect(before).toMatchObject({ status: 200, body: { data: { usersPermissionsUser: { accounts: [{ updatedAt: expect.any(String) }] } } } });
    expect(service.graphql({ authorization: authority, method: "POST", query: settingsQuery, variables: { documentId: userDocumentId } }))
      .toMatchObject({ status: 200, body: { data: { usersPermissionsUser: { documentId: userDocumentId, accounts: [{ documentId: accountDocumentId }] } } } });
    const beforeUpdatedAt = (before.body as any).data.usersPermissionsUser.accounts[0].updatedAt;

    const socialMedia = {
      theme_settings: {
        preset: "neon-cyber", accentColor: "#F43F5E", wallpaperMode: "ambient-gradient",
        firstView: "books", visibleTabs: { recommendations: true, gallery: true, business: true },
        recommendations: { layout: "featured", categoryOrder: ["books", "places", "movies"] },
      },
    };
    const updated = service.graphql({
      authorization: authority,
      method: "POST",
      query: updateMutation,
      variables: {
        documentId: accountDocumentId,
        data: {
          Bio: "Revision one",
          Account_Name: "Profile Contract",
          Addresss: { city: "Fixture City" },
          Primary_Address: { address: "Fixture City" },
          Public_Profile_Address: "Fixture City",
          Feed_Data: [{ type: "fixture", value: "profile" }],
          social_media: socialMedia,
          Account_Type: "Personal",
          mobile_number_visibility: false,
        },
      },
    });
    expect(updated).toMatchObject({ status: 200, body: { data: { updateAccount: {
      documentId: accountDocumentId, Bio: "Revision one", social_media: socialMedia,
    } } } });

    const after = service.graphql({ authorization: authority, method: "POST", query: profileQuery, variables: { documentId: userDocumentId } });
    const afterAccount = (after.body as any).data.usersPermissionsUser.accounts[0];
    expect(Date.parse(afterAccount.updatedAt)).toBeGreaterThan(Date.parse(beforeUpdatedAt));
    expect(afterAccount).toMatchObject({ Bio: "Revision one", social_media: socialMedia, Feed_Data: [{ type: "fixture", value: "profile" }] });

    const visibility = service.graphql({
      authorization: authority,
      method: "POST",
      query: visibilityMutation,
      variables: { documentId: accountDocumentId, data: { public_music: "Yes" } },
    });
    expect(visibility).toMatchObject({ status: 200, body: { data: { updateAccount: {
      documentId: accountDocumentId, public_music: "Yes",
    } } } });

    const publicView = service.graphql({
      authorization: authority, method: "POST", query: publicProfileQuery,
      variables: { filters: { username: { eq: username } } },
    });
    expect(publicView).toMatchObject({ status: 200, body: { data: { accounts: [{
      documentId: accountDocumentId, Bio: "Revision one", social_media: socialMedia, public_music: "Yes",
    }] } } });

    const restored = service.response({
      path: "/__music-fixture/profile-state/restore", method: "POST", authorization: authority,
      body: { ...tuple, snapshot: capturedBody.snapshot },
    });
    expect(restored).toEqual({
      status: 200,
      body: { version: "music-fixture-profile-state/v1", restored: true, revision: 0, stateHash: capturedBody.stateHash },
    });
    const exact = service.graphql({ authorization: authority, method: "POST", query: profileQuery, variables: { documentId: userDocumentId } });
    expect((exact.body as any).data.usersPermissionsUser.accounts[0].updatedAt).toBe(beforeUpdatedAt);
    expect((exact.body as any).data.usersPermissionsUser.accounts[0].Bio).not.toBe("Revision one");
    expect((exact.body as any).data.usersPermissionsUser.accounts[0].public_music).toBe("No");
  });

  it("fails closed for non-registry GraphQL shapes, hostile profile fields, and mismatched privileged tuples", () => {
    const namespace = "e2e-public-music-profile-hostile";
    const username = `${namespace}-owner`;
    const accountDocumentId = `${namespace}-account`;
    const userDocumentId = `${namespace}-user`;
    const token = "hostile-contract-fixture-token";
    const authority = `Bearer ${token}`;
    const service = createMusicFixtureService({ username, accountDocumentId, userDocumentId, token });
    expect(() => createMusicFixtureService({
      username: "fixture-explorer", accountDocumentId: "fixture-account-document-id",
      userDocumentId: "fixture-user-document-id", token,
    })).toThrow("complete namespaced authority tuple");
    const updateMutation = checkedInGraphqlOperation("explorers-earth/src/features/Profile/hooks/useUpdateProfile.ts", "UpdateAccount");
    const profileQuery = checkedInGraphqlOperation("tunes/scripts/legacy-profile-fixture-documents.txt", "UsersPermissionsUser");
    const tuple = { namespace, username, accountDocumentId, userDocumentId };

    const denied = [
      service.graphql({ authorization: authority, method: "POST", query: profileQuery.replace(/}\s*$/, "systemSettings { id } }"), variables: { documentId: userDocumentId } }),
      service.graphql({ authorization: authority, method: "POST", query: profileQuery.replace("username", "alias: username"), variables: { documentId: userDocumentId } }),
      service.graphql({ authorization: authority, method: "POST", query: updateMutation, variables: { documentId: accountDocumentId, data: { social_media: {}, administrator: true } } }),
      service.graphql({ authorization: authority, method: "POST", query: updateMutation, variables: { documentId: "other-account", data: { social_media: {} } } }),
      service.response({ path: "/__music-fixture/profile-state/snapshot", method: "POST", authorization: authority, body: { ...tuple, namespace: `${namespace}-other` } }),
      service.response({ path: "/__music-fixture/profile-state/snapshot", method: "POST", authorization: "Bearer wrong", body: tuple }),
      service.response({ path: "/__music-fixture/profile-state/snapshot", method: "GET", authorization: authority, body: tuple }),
    ];
    expect(denied.every(({ status }) => status !== 200)).toBe(true);
    expect(JSON.stringify(denied)).not.toContain(token);

    const nginx = readFileSync(resolve(repositoryRoot, "explorers-earth/nginx.music-fixture.conf"), "utf8");
    expect(nginx).not.toMatch(/proxy_pass[^\n]*strapi[\s\S]{0,300}__music-fixture\/profile-state|location[^\n]*__music-fixture\/profile-state/);
  });

  it("accepts optimistic revision authority only for the exact direct loopback token and tuple and rejects stale or proxied writes", () => {
    const namespace = "e2e-public-music-revision-contract";
    const username = `${namespace}-owner`;
    const accountDocumentId = `${namespace}-account`;
    const userDocumentId = `${namespace}-user`;
    const token = "revision-contract-fixture-token";
    const authority = `Bearer ${token}`;
    const service = createMusicFixtureService({ username, accountDocumentId, userDocumentId, token });
    const updateMutation = checkedInGraphqlOperation("explorers-earth/src/features/Settings/api/mutation.ts", "UpdateAccount");
    const profileQuery = checkedInGraphqlOperation("tunes/scripts/legacy-profile-fixture-documents.txt", "UsersPermissionsUser");
    type QualificationAuthority = {
      expectedRevision: number;
      namespace: string;
      username: string;
      accountDocumentId: string;
      userDocumentId: string;
      directLoopback: boolean;
    };
    const graphql = service.graphql as (input: {
      authorization: string;
      method: string;
      query: string;
      variables: Record<string, unknown>;
      qualificationAuthority?: QualificationAuthority;
    }) => { status: number; body: unknown };
    const exact = {
      expectedRevision: 0,
      namespace,
      username,
      accountDocumentId,
      userDocumentId,
      directLoopback: true,
    };

    expect(graphql({
      authorization: authority, method: "POST", query: updateMutation,
      variables: { documentId: accountDocumentId, data: { Bio: "qualified revision" } },
      qualificationAuthority: exact,
    })).toMatchObject({ status: 200, body: { data: { updateAccount: { Bio: "qualified revision" } } } });
    const stale = graphql({
      authorization: authority, method: "POST", query: updateMutation,
      variables: { documentId: accountDocumentId, data: { Bio: "stale overwrite" } },
      qualificationAuthority: exact,
    });
    expect(stale).toEqual({ status: 409, body: { error: "fixture profile revision stale" } });

    for (const qualificationAuthority of [
      { ...exact, expectedRevision: 1, directLoopback: false },
      { ...exact, expectedRevision: 1, namespace: `${namespace}-other` },
      { ...exact, expectedRevision: 1, userDocumentId: `${namespace}-other-user` },
      { ...exact, expectedRevision: 1, accountDocumentId: `${namespace}-other-account` },
    ]) {
      expect(graphql({
        authorization: authority, method: "POST", query: updateMutation,
        variables: { documentId: accountDocumentId, data: { Bio: "authority bypass" } },
        qualificationAuthority,
      }).status).toBe(403);
    }
    const observed = graphql({ authorization: authority, method: "POST", query: profileQuery, variables: { documentId: userDocumentId } });
    expect(observed).toMatchObject({ status: 200, body: { data: { usersPermissionsUser: { accounts: [{ Bio: "qualified revision" }] } } } });

    const nginx = readFileSync(resolve(repositoryRoot, "explorers-earth/nginx.music-fixture.conf"), "utf8");
    expect(nginx).toMatch(/location = \/graphql \{[\s\S]*proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
  });

  it("projects deterministic content for every public profile gateway category", () => {
    const namespace = "e2e-public-music-category-contract";
    const accountDocumentId = `${namespace}-account`;
    const service = createMusicFixtureService({
      username: `${namespace}-owner`, accountDocumentId, userDocumentId: `${namespace}-user`, token: "category-contract-fixture-token",
    });
    const categories = [
      ["places", "recommendationLists"], ["movies", "movieLists"],
      ["books", "bookLists"], ["games", "gameLists"],
      ["apps", "appLists"], ["products", "productLists"],
      ["people", "personLists"], ["guides", "guides"],
    ] as const;
    for (const [category, rootField] of categories) {
      const response = service.response({
        path: `/api/explorers/v1/profiles/${namespace}-owner/recommendations/${category}`,
        method: "GET",
        authorization: undefined,
      });
      expect(response.status, category).toBe(200);
      expect((response.body as any)[rootField], category).toEqual([expect.objectContaining({ documentId: expect.any(String) })]);
    }
    // Arbitrary URL suffixes must remain a failed lookup, never fall through to
    // a valid category when widening the map's accepted lookup key type.
    for (const category of ["unknown", "Apps", "apps/foreign-detail"]) {
      expect(service.response({
        path: `/api/explorers/v1/profiles/${namespace}-owner/recommendations/${category}`,
        method: "GET", authorization: undefined,
      })).toEqual({ status: 404, body: { error: "fixture public category not found" } });
    }
  });

  it("binds the runner tuple to the actual loopback fixture process and restores the preference", async () => {
    const token = "contract-process-fixture-token";
    const nonce = randomUUID();
    const eligibilityQuery = checkedInGraphqlOperation("explorers-earth/src/pages/Music.tsx", "MusicPageEligibility");
    const child = spawn(process.execPath, [
      "--experimental-strip-types",
      resolve(import.meta.dirname, "../../../scripts/music-fixture-server.ts"),
      "--host", "127.0.0.1",
      "--port", "0",
      "--nonce", nonce,
    ], {
      env: { ...process.env, MUSIC_E2E_ACCOUNT_USERNAME: "e2e-public-music-process-owner",
        MUSIC_E2E_ACCOUNT_DOCUMENT_ID: "e2e-public-music-process-account", MUSIC_E2E_USER_DOCUMENT_ID: "e2e-public-music-process-user",
        MUSIC_E2E_STRAPI_TOKEN: token },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const observation = observeFixture(child, nonce);
    let processIdentity: ProcessIdentity | undefined;
    let processFailure: unknown;
    let processFailed = false;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    try {
      processIdentity = readProcessIdentity(child.pid!);
      if (!processIdentity) throw new Error("fixture exited before identity capture");
      const port = await observation.ready;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("fixture exited after readiness");
      const origin = `http://127.0.0.1:${port}`;
      const request = async (path: string, init: RequestInit = {}) => {
        const response = await fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(2_000) });
        const body = await response.json();
        return { response, body };
      };

      const health = await request("/health");
      expect(health.response.ok).toBe(true);
      const fixtureIdentity = (await request("/api/users/me", { headers })).body;
      expect(fixtureIdentity).toMatchObject({ username: "e2e-public-music-process-owner", accounts: [{ documentId: "e2e-public-music-process-account" }] });
      const callback = (await request("/graphql", { method: "POST", headers, body: JSON.stringify({
        query: eligibilityQuery,
        variables: { documentId: "e2e-public-music-process-user" },
      }) })).body as any;
      expect(callback.data.usersPermissionsUser).toMatchObject({ documentId: "e2e-public-music-process-user",
        accounts: [{ documentId: "e2e-public-music-process-account" }] });
      const before = (await request("/api/accounts/e2e-public-music-process-account", { headers })).body as any;
      expect(before.data.public_music).toBe("No");
      const enabled = await request("/api/accounts/e2e-public-music-process-account", {
        method: "PUT", headers, body: JSON.stringify({ data: { public_music: "Yes" } }),
      });
      expect(enabled.response.ok).toBe(true);
      const restore = await request("/api/accounts/e2e-public-music-process-account", {
        method: "PUT", headers, body: JSON.stringify({ data: { public_music: before.data.public_music } }),
      });
      expect(restore.response.ok).toBe(true);
      const restored = (await request("/api/accounts/e2e-public-music-process-account", { headers })).body as any;
      expect(restored.data.public_music).toBe("No");
      observation.assertHealthy();
    } catch (error) {
      processFailed = true;
      processFailure = error;
    } finally {
      try {
        await stopFixture(child, observation.closed, processIdentity);
      } finally {
        observation.dispose();
      }
      observation.assertHealthy();
      if (processFailed) throw observation.withDiagnostics(processFailure);
    }
  }, 25_000);
  it("routes authenticated browser mutations to the isolated fixture origin rather than a synthetic or production host", () => {
    // A real browser must reach the fixture Tunes gateway through its own
    // origin.  A Playwright-only route interception can make a broken bundle
    // appear healthy while the browser would otherwise call an invalid host.
    const repository = resolve(import.meta.dirname, "../../../..");
    const compose = readFileSync(resolve(repository, "docker-compose.music-test.yml"), "utf8");
    const nginx = readFileSync(resolve(repository, "explorers-earth/nginx.music-fixture.conf"), "utf8");
    const dockerfile = readFileSync(resolve(repository, "explorers-earth/Dockerfile.music-fixture"), "utf8");

    // `publicMusicClient` intentionally permits insecure transport only for
    // localhost.  The fixture must use that narrow exception rather than
    // weakening the production HTTPS/origin contract for 127.0.0.1.
    expect(compose).toContain("VITE_LOCAL_TUNES_API_URL: http://localhost:55173");
    expect(compose).toContain("VITE_API_URL: http://localhost:55173/graphql");
    expect(compose).toContain("VITE_REST_API_URL: http://localhost:55173");
    expect(compose).not.toContain("VITE_LOCAL_TUNES_API_URL: https://music-fixture.invalid");
    expect(nginx).toMatch(/location ~ \^\/\(api\/music\(\?:\/\|\$\)\|api\/playlists\(\?:\/\|\$\)\|api\/playlist\(\?:\/\|\$\)\|api\/youtube\(\?:\/\|\$\)\)/);
    expect(nginx).toContain("proxy_pass http://tunes:5000;");
    // Same-origin GETs do not carry an Origin header. The fixture proxy must
    // attest its exact local browser origin before the strict gateway guard
    // evaluates owner rollout reads.
    expect(nginx).toContain("proxy_set_header Origin $scheme://$http_host;");
    expect(nginx).toContain("location = /api/users/me");
    expect(nginx).toContain("location = /graphql");
    expect(nginx).toContain("proxy_pass http://strapi:1337;");
    expect(dockerfile).toContain("COPY explorers-earth/nginx.music-fixture.conf /etc/nginx/conf.d/default.conf");
  });

  it("serves the repository-shaped Strapi current-user contract", () => {
    // Production break caught: fixture Strapi reports only version metadata, so
    // smoke tests never exercise identity, Account, lifecycle, or entitlement.
    expect(fixtureResponse({
      path: "/api/users/me", method: "GET", authorization: "Bearer fixture-read-only-token",
    })).toMatchObject({
      status: 200,
      body: {
        documentId: "fixture-user-document-id",
        blocked: false,
        is_subscribed: false,
        accounts: [{
          documentId: "fixture-account-document-id",
          Account_Name: "Fixture Explorer",
          Account_Type: "Personal",
          mobile_number: "+10000000000",
          localtunes_integrated: "No",
        }],
      },
    });
    for (const denied of [
      { path: "/api/users/me", method: "GET", authorization: undefined },
      { path: "/api/users/me", method: "DELETE", authorization: "Bearer fixture-read-only-token" },
      { path: "/api/accounts", method: "POST", authorization: "Bearer fixture-read-only-token" },
    ]) expect(fixtureResponse(denied).status).not.toBe(200);

    expect(fixtureResponse({
      path: "/api/accounts", method: "GET", authorization: "Bearer fixture-read-only-token",
    })).toMatchObject({
      status: 200,
      body: { meta: { pagination: { page: 1, pageCount: 1, pageSize: 50, total: 1 } } },
    });
  });

  it("allows only the exact immutable-ID absence proof for the deterministic credential", () => {
    const allowed = fixtureGraphqlResponse({
      authorization: "Bearer fixture-read-only-token",
      method: "POST",
      query: `query MusicIdentityAbsence($userDocumentId: ID!, $accountDocumentId: ID!) {
        usersPermissionsUser(documentId: $userDocumentId) { documentId }
        account(documentId: $accountDocumentId) { documentId }
      }`,
      variables: {
        userDocumentId: "fixture-user-document-id",
        accountDocumentId: "fixture-account-document-id",
      },
    });
    expect(allowed).toEqual({ status: 200, body: { data: {
      usersPermissionsUser: { documentId: "fixture-user-document-id" },
      account: { documentId: "fixture-account-document-id" },
    } } });

    const mutation = fixtureGraphqlResponse({
      authorization: "Bearer fixture-read-only-token",
      method: "POST",
      query: "mutation { deleteAccount(documentId: \"fixture-account-document-id\") { documentId } }",
      variables: {},
    });
    expect(mutation.status).toBe(403);
    expect(JSON.stringify(mutation.body)).not.toContain("fixture-read-only-token");

    const appendedRead = fixtureGraphqlResponse({
      authorization: "Bearer fixture-read-only-token",
      method: "POST",
      query: `query MusicIdentityAbsence($userDocumentId: ID!, $accountDocumentId: ID!) {
        usersPermissionsUser(documentId: $userDocumentId) { documentId }
        account(documentId: $accountDocumentId) { documentId }
        systemSettings { id }
      }`,
      variables: {
        userDocumentId: "fixture-user-document-id",
        accountDocumentId: "fixture-account-document-id",
      },
    });
    expect(appendedRead.status).toBe(403);
    expect(fixtureGraphqlResponse({
      authorization: "Bearer fixture-read-only-token",
      method: "GET",
      query: `query MusicIdentityAbsence($userDocumentId: ID!, $accountDocumentId: ID!) {
        usersPermissionsUser(documentId: $userDocumentId) { documentId }
        account(documentId: $accountDocumentId) { documentId }
      }`,
      variables: { userDocumentId: "fixture-user-document-id", accountDocumentId: "fixture-account-document-id" },
    }).status).toBe(405);
  });

  it("serves the authenticated Explorer browser identity reads through the real fixture Strapi contract", () => {
    const allowed = fixtureGraphqlResponse({
      authorization: "Bearer fixture-read-only-token",
      method: "POST",
      query: checkedInGraphqlOperation("explorers-earth/src/pages/Music.tsx", "MusicPageEligibility"),
      variables: { documentId: "fixture-user-document-id" },
    });
    expect(allowed).toMatchObject({
      status: 200,
      body: { data: { usersPermissionsUser: {
        documentId: "fixture-user-document-id",
        provider: "local",
        confirmed: true,
        accounts: [{ documentId: "fixture-account-document-id" }],
      } } },
    });

    for (const denied of [
      { query: "query UnexpectedRead($documentId: ID!) { usersPermissionsUser(documentId: $documentId) { email } }", variables: { documentId: "fixture-user-document-id" } },
      { query: "query MusicPageEligibility($documentId: ID!) { usersPermissionsUser(documentId: $documentId) { documentId } }", variables: { documentId: "other-user" } },
      { query: "mutation MusicPageEligibility { deleteUsersPermissionsUser(documentId: \"fixture-user-document-id\") { documentId } }", variables: {} },
    ]) {
      expect(fixtureGraphqlResponse({
        authorization: "Bearer fixture-read-only-token", method: "POST", ...denied,
      }).status).not.toBe(200);
    }
  });

  it("serves only the exact stable reconciliation page to its read-only authority", () => {
    const allowed = fixtureReconciliationResponse({
      authorization: "Bearer fixture-read-only-token",
      method: "GET",
      url: "/api/music-identities?pagination%5Bpage%5D=1&pagination%5BpageSize%5D=100&sort=documentId%3Aasc",
    });
    expect(allowed).toMatchObject({
      status: 200,
      body: {
        data: [{ documentId: "fixture-user-document-id", accounts: [{ documentId: "fixture-account-document-id" }] }],
        meta: {
          pagination: { page: 1, pageSize: 100, pageCount: 1, total: 1 },
          reconciliation: {
            schemaVersion: "strapi-music-reconciliation/v1",
            sourceSnapshot: "fixture-reconciliation-snapshot-v1",
            sourceChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
            healthy: true,
          },
        },
      },
    });
    for (const denied of [
      { authorization: undefined, method: "GET", url: "/api/music-identities?pagination%5Bpage%5D=1&pagination%5BpageSize%5D=100&sort=documentId%3Aasc" },
      { authorization: "Bearer fixture-read-only-token", method: "POST", url: "/api/music-identities?pagination%5Bpage%5D=1&pagination%5BpageSize%5D=100&sort=documentId%3Aasc" },
      { authorization: "Bearer fixture-read-only-token", method: "GET", url: "/api/music-identities?pagination%5Bpage%5D=1&pagination%5BpageSize%5D=100&sort=username%3Aasc" },
      { authorization: "Bearer fixture-read-only-token", method: "GET", url: "/api/music-identities?pagination%5Bpage%5D=1&pagination%5BpageSize%5D=100&sort=documentId%3Aasc&sourceSnapshot=changed" },
    ]) {
      const response = fixtureReconciliationResponse(denied);
      expect(response.status).not.toBe(200);
      expect(JSON.stringify(response.body)).not.toContain("fixture-read-only-token");
    }
  });

  it("accepts Explorers HTML while requiring JSON from fixture APIs", async () => {
    // Production break caught: smoke parses the real Explorers SPA root as
    // JSON, so a healthy Nginx-served application necessarily fails smoke.
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = String(input);
      return url === "http://127.0.0.1:55173/"
        ? new Response("<!doctype html><html><body>Explorers</body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })
        : new Response(JSON.stringify({ status: "ready" }), { status: 200, headers: { "content-type": "application/json" } });
    });

    await expect(import("../../../scripts/music-smoke.ts")).resolves.toBeDefined();
  });
});
