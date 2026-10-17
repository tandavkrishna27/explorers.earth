import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createFixtureProfileController } from "./music-fixture-profile.ts";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../fixtures/strapi/music-identity/identity.fixture.json"), "utf8")) as {
  reconciliation: { schemaVersion: "strapi-music-reconciliation/v1"; sourceSnapshot: string; sourceChecksum: string };
  identities: Array<{ user: {
    documentId: string; username: string; email: string; provider: "local" | "google";
    confirmed: true; blocked: false; is_subscribed: boolean;
    accounts: Array<{ documentId: string; Account_Name: string; Account_Type: string; mobile_number: string; localtunes_integrated: "Yes" | "No" }>;
  } }>;
};
const user = fixture.identities[0]!.user;
const sourceIdentities = fixture.identities.map(({ user: identity }) => ({
  documentId: identity.documentId,
  username: identity.username,
  email: identity.email,
  provider: identity.provider,
  confirmed: identity.confirmed,
  blocked: identity.blocked,
  accounts: identity.accounts.map(({ documentId, Account_Name, Account_Type, mobile_number }) => ({
    documentId, Account_Name, Account_Type, mobile_number,
  })),
})).sort((left, right) => left.documentId.localeCompare(right.documentId));
const canonicalIdentities = sourceIdentities.map((identity) => ({
  userDocumentId: identity.documentId,
  accountDocumentId: identity.accounts[0]!.documentId,
  username: identity.username,
  email: identity.email,
  provider: identity.provider,
  accountName: identity.accounts[0]!.Account_Name,
  accountType: identity.accounts[0]!.Account_Type,
  accountMobile: identity.accounts[0]!.mobile_number,
}));
const sourceChecksum = createHash("sha256").update(canonicalIdentities.map((identity) => JSON.stringify(identity)).join("\n")).digest("hex");
if (sourceChecksum !== fixture.reconciliation.sourceChecksum) throw new Error("fixture reconciliation checksum does not match its identities");

const lifecycleAbsenceQuery = `query MusicIdentityAbsence($userDocumentId: ID!, $accountDocumentId: ID!) {
  usersPermissionsUser(documentId: $userDocumentId) { documentId }
  account(documentId: $accountDocumentId) { documentId }
}`;
const browserIdentity = {
  ...user,
  id: user.documentId,
  accounts: user.accounts.map((account) => ({
    ...account,
    profile_picture: null,
    public_recommendations: "No",
    public_music: "No",
    public_guides: "No",
    public_movie: "No",
    public_books: "No",
    public_games: "No",
    public_apps: "No",
    public_products: "No",
    public_people: "No",
    pinned_nav_tabs: [],
    auto_pinning: true,
  })),
};

type FixtureServiceInput = {
  path: string;
  method: string | undefined;
  authorization: string | undefined;
  body?: unknown;
};

type MusicFixtureServiceConfig = {
  username: string;
  accountDocumentId: string;
  userDocumentId: string;
  token: string;
};

type FixtureQualificationAuthority = {
  expectedRevision: number;
  namespace: string;
  username: string;
  accountDocumentId: string;
  userDocumentId: string;
  directLoopback: boolean;
};

function buildMusicFixtureService(config: MusicFixtureServiceConfig, allowStaticContractIdentity = false) {
  const staticContractIdentity = config.username === user.username
    && config.accountDocumentId === user.accounts[0]!.documentId
    && config.userDocumentId === user.documentId;
  if ((!allowStaticContractIdentity || !staticContractIdentity)
      && (!/^e2e-public-music-[a-z0-9-]+-owner$/.test(config.username)
      || !/^e2e-public-music-[a-z0-9-]+-account$/.test(config.accountDocumentId)
      || !/^e2e-public-music-[a-z0-9-]+-user$/.test(config.userDocumentId))
      || config.token.length < 8) throw new Error("fixture identity must be a complete namespaced authority tuple");
  const profile = createFixtureProfileController({
    username: config.username,
    accountDocumentId: config.accountDocumentId,
    userDocumentId: config.userDocumentId,
    baseUser: browserIdentity,
    baseAccount: user.accounts[0]!,
  });
  const account = profile.account;
  const identity = profile.identity;
  return {
    response(input: FixtureServiceInput): { status: number; body: unknown } {
      if (input.path === "/health" && input.method === "GET") return { status: 200, body: { service: "strapi", status: "ready", fixtureVersion: "1",
        identity: { username: config.username, userDocumentId: config.userDocumentId, accountDocumentId: config.accountDocumentId } } };
      const publicProfile = profile.publicGateway(input.path, input.method);
      if (publicProfile) return publicProfile;
      if (input.authorization !== `Bearer ${config.token}`) return { status: 403, body: { error: "fixture identity authority denied" } };
      const privateProfile = profile.privateResponse(input.path, input.method, input.body);
      if (privateProfile) return privateProfile;
      if (input.path === "/api/users/me") return input.method === "GET"
        ? { status: 200, body: identity() } : { status: 405, body: { error: "fixture identity operation denied" } };
      if (input.path === "/api/accounts") return input.method === "GET"
        ? { status: 200, body: { data: [account()], meta: { pagination: { page: 1, pageCount: 1, pageSize: 50, total: 1 } } } }
        : { status: 405, body: { error: "fixture identity operation denied" } };
      if (input.path.startsWith("/api/accounts/")) {
        if (input.path !== `/api/accounts/${config.accountDocumentId}`) return { status: 404, body: { error: "fixture account not found" } };
        if (input.method === "GET") return { status: 200, body: { data: account() } };
        if (input.method !== "PUT") return { status: 405, body: { error: "fixture Account operation denied" } };
        const data = input.body && typeof input.body === "object" && "data" in input.body
          ? (input.body as { data?: unknown }).data : undefined;
        if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length !== 1
            || !("public_music" in data) || !["Yes", "No"].includes(String((data as { public_music?: unknown }).public_music))) {
          return { status: 400, body: { error: "fixture Account body invalid" } };
        }
        return { status: 200, body: { data: profile.setPublicMusic((data as { public_music: "Yes" | "No" }).public_music) } };
      }
      return { status: 404, body: { error: "fixture route not found" } };
    },
    graphql(input: {
      authorization: string | undefined;
      method: string | undefined;
      query: string;
      variables: Record<string, unknown>;
      qualificationAuthority?: FixtureQualificationAuthority;
    }) {
      if (input.authorization !== `Bearer ${config.token}`) return { status: 403, body: { error: "fixture lifecycle proof authority denied" } };
      if (input.method !== "POST") return { status: 405, body: { error: "fixture lifecycle proof operation denied" } };
      const expectedNamespace = config.username.replace(/-owner$/, "");
      if (input.qualificationAuthority && (!Number.isSafeInteger(input.qualificationAuthority.expectedRevision)
          || input.qualificationAuthority.expectedRevision < 0
          || input.qualificationAuthority.directLoopback !== true
          || input.qualificationAuthority.namespace !== expectedNamespace
          || input.qualificationAuthority.username !== config.username
          || input.qualificationAuthority.accountDocumentId !== config.accountDocumentId
          || input.qualificationAuthority.userDocumentId !== config.userDocumentId)) {
        return { status: 403, body: { error: "fixture profile revision authority denied" } };
      }
      if (normalizeGraphql(input.query) === normalizeGraphql(lifecycleAbsenceQuery)) return { status: 200, body: { data: {
        usersPermissionsUser: input.variables.userDocumentId === config.userDocumentId ? { documentId: config.userDocumentId } : null,
        account: input.variables.accountDocumentId === config.accountDocumentId ? { documentId: config.accountDocumentId } : null,
      } } };
      return profile.graphql(input.query, input.variables, {
        expectedRevision: input.qualificationAuthority?.expectedRevision,
      });
    },
  };
}

export function createMusicFixtureService(config: MusicFixtureServiceConfig) {
  return buildMusicFixtureService(config);
}

const defaultService = buildMusicFixtureService({
  username: user.username,
  accountDocumentId: user.accounts[0]!.documentId,
  userDocumentId: user.documentId,
  token: "fixture-read-only-token",
}, true);

function normalizeGraphql(source: string): string {
  return source.replace(/\s+/g, " ").trim();
}

export function fixtureResponse(input: {
  path: string;
  method: string | undefined;
  authorization: string | undefined;
}): { status: number; body: unknown } {
  return defaultService.response(input);
}

export function fixtureReconciliationResponse(input: {
  authorization: string | undefined;
  method: string | undefined;
  url: string;
}): { status: number; body: unknown } {
  if (input.authorization !== "Bearer fixture-read-only-token") return { status: 403, body: { error: "fixture reconciliation authority denied" } };
  if (input.method !== "GET") return { status: 405, body: { error: "fixture reconciliation operation denied" } };
  const url = new URL(input.url, "http://fixture");
  if (url.pathname !== "/api/music-identities") return { status: 404, body: { error: "fixture route not found" } };
  const allowedKeys = new Set(["pagination[page]", "pagination[pageSize]", "sort", "sourceSnapshot"]);
  if ([...url.searchParams.keys()].some((key) => !allowedKeys.has(key))) return { status: 400, body: { error: "fixture reconciliation query invalid" } };
  if ([...allowedKeys].some((key) => url.searchParams.getAll(key).length > 1)) return { status: 400, body: { error: "fixture reconciliation query duplicated" } };
  const pageRaw = url.searchParams.get("pagination[page]");
  const pageSizeRaw = url.searchParams.get("pagination[pageSize]");
  const page = pageRaw && /^\d+$/.test(pageRaw) ? Number(pageRaw) : 0;
  const pageSize = pageSizeRaw && /^\d+$/.test(pageSizeRaw) ? Number(pageSizeRaw) : 0;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1_000
      || url.searchParams.get("sort") !== "documentId:asc") {
    return { status: 400, body: { error: "fixture reconciliation pagination invalid" } };
  }
  const requestedSnapshot = url.searchParams.get("sourceSnapshot");
  if (requestedSnapshot && requestedSnapshot !== fixture.reconciliation.sourceSnapshot) {
    return { status: 409, body: { error: "fixture reconciliation snapshot changed" } };
  }
  const pageCount = Math.max(1, Math.ceil(sourceIdentities.length / pageSize));
  if (page > pageCount) return { status: 400, body: { error: "fixture reconciliation page invalid" } };
  return {
    status: 200,
    body: {
      data: sourceIdentities.slice((page - 1) * pageSize, page * pageSize),
      meta: {
        pagination: { page, pageSize, pageCount, total: sourceIdentities.length },
        reconciliation: { ...fixture.reconciliation, healthy: true },
      },
    },
  };
}

export function fixtureGraphqlResponse(input: {
  authorization: string | undefined;
  method: string | undefined;
  query: string;
  variables: Record<string, unknown>;
}): { status: number; body: unknown } {
  return defaultService.graphql(input);
}

export function createMusicFixtureRestRequestHandler(service: ReturnType<typeof createMusicFixtureService>) {
  return (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse): boolean => {
    const path = new URL(request.url ?? "/", "http://fixture").pathname;
    if (path === "/graphql" || path === "/api/music-identities") return false;
    let restBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      restBody += chunk;
      if (Buffer.byteLength(restBody) > 64 * 1024) request.destroy();
    });
    request.on("end", () => {
      let decoded: unknown;
      if (restBody) { try { decoded = JSON.parse(restBody); } catch { decoded = undefined; } }
      const result = service.response({
        path,
        method: request.method,
        authorization: request.headers.authorization,
        body: decoded,
      });
      response.writeHead(result.status, { "content-type": "application/json" });
      response.end(JSON.stringify(result.body));
    });
    return true;
  };
}

export function parseMusicFixtureServerArguments(args: string[]): {
  host: string; port: number; nonce: string | undefined;
} {
  const value = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const port = Number(value("--port"));
  const host = value("--host") ?? "0.0.0.0";
  const nonce = value("--nonce");
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("usage: --port <0..65535>");
  if (host !== "0.0.0.0" && host !== "127.0.0.1") throw new Error("usage: --host <0.0.0.0|127.0.0.1>");
  if (nonce !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(nonce)) throw new Error("usage: --nonce <safe-token>");
  return { host, port, nonce };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/scripts/music-fixture-server.ts")) {
  const { host, port, nonce } = parseMusicFixtureServerArguments(process.argv.slice(2));
  const runtimeService = createMusicFixtureService({
    username: process.env.MUSIC_E2E_ACCOUNT_USERNAME ?? "e2e-public-music-fixture-owner",
    accountDocumentId: process.env.MUSIC_E2E_ACCOUNT_DOCUMENT_ID ?? "e2e-public-music-fixture-account",
    userDocumentId: process.env.MUSIC_E2E_USER_DOCUMENT_ID ?? "e2e-public-music-fixture-user",
    token: process.env.MUSIC_E2E_STRAPI_TOKEN ?? "fixture-read-only-token",
  });
  const handleRestRequest = createMusicFixtureRestRequestHandler(runtimeService);
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://fixture").pathname;
    if (path === "/api/music-identities") {
      const result = fixtureReconciliationResponse({
        authorization: request.headers.authorization,
        method: request.method,
        url: request.url ?? path,
      });
      response.writeHead(result.status, { "content-type": "application/json" });
      response.end(JSON.stringify(result.body));
      return;
    }
    if (handleRestRequest(request, response)) return;
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) request.destroy();
    });
    request.on("end", () => {
      let decoded: { query?: unknown; variables?: unknown } = {};
      try { decoded = JSON.parse(body) as typeof decoded; }
      catch { /* handled as an invalid exact operation */ }
      const qualificationHeaders = [
        "x-music-fixture-expected-revision", "x-music-fixture-namespace", "x-music-fixture-username",
        "x-music-fixture-account-document-id", "x-music-fixture-user-document-id",
      ] as const;
      const suppliedQualificationHeaders = qualificationHeaders.filter((name) => request.headers[name] !== undefined);
      let qualificationAuthority: FixtureQualificationAuthority | undefined;
      if (suppliedQualificationHeaders.length === qualificationHeaders.length
          && !request.headers["x-forwarded-for"]
          && qualificationHeaders.every((name) => typeof request.headers[name] === "string")) {
        const expectedRevision = Number(request.headers["x-music-fixture-expected-revision"]);
        qualificationAuthority = {
          expectedRevision,
          namespace: String(request.headers["x-music-fixture-namespace"]),
          username: String(request.headers["x-music-fixture-username"]),
          accountDocumentId: String(request.headers["x-music-fixture-account-document-id"]),
          userDocumentId: String(request.headers["x-music-fixture-user-document-id"]),
          directLoopback: true,
        };
      } else if (suppliedQualificationHeaders.length > 0) {
        qualificationAuthority = {
          expectedRevision: -1,
          namespace: "invalid",
          username: "invalid",
          accountDocumentId: "invalid",
          userDocumentId: "invalid",
          directLoopback: false,
        };
      }
      const result = runtimeService.graphql({
        authorization: request.headers.authorization,
        method: request.method,
        query: typeof decoded.query === "string" ? decoded.query : "",
        variables: decoded.variables && typeof decoded.variables === "object"
          ? decoded.variables as Record<string, unknown> : {},
        qualificationAuthority,
      });
      response.writeHead(result.status, { "content-type": "application/json" });
      response.end(JSON.stringify(result.body));
    });
  });
  server.listen(port, host, () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture listener has no TCP address");
    process.stdout.write(`${JSON.stringify({ schemaVersion: "music-fixture-ready/v1", host, port: address.port, nonce })}\n`);
  });
}
