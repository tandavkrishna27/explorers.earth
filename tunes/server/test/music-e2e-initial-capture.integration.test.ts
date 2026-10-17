import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateMusicDatabase } from "../db/migrate";
import {
  attestUatDatabaseAuthority,
  MUSIC_UAT_DATABASE_ACK,
  parseUatDatabaseAuthority,
} from "../../scripts/music-uat-database";
import {
  buildMusicFixtureIdentityCountPgQuery,
  captureMusicFixtureState,
  requestMusicFixturePrivateProfileSnapshot,
  safeMusicFixtureCaptureFailure,
} from "../../scripts/music-e2e-state-capture.mjs";
import {
  MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES,
  buildMusicFixtureSchemaInventoryOperation,
} from "../../scripts/music-e2e-state-restore.mjs";
import {
  createMusicFixtureRestRequestHandler,
  createMusicFixtureService,
} from "../../scripts/music-fixture-server";
import { MusicIdentityRepository } from "../repositories/musicIdentityRepository";
import { MusicProjectionService } from "../services/musicProjectionService";

const enabled = process.env.MUSIC_C12_INITIAL_CAPTURE_POSTGRES_TEST === "1"
  && process.env.MUSIC_UAT_DATABASE_ACK === MUSIC_UAT_DATABASE_ACK;
const describePg = enabled ? describe.sequential : describe.skip;
const dockerExecutable = process.platform === "win32" ? "docker.exe" : "docker";
const fixtureDatabase = "music_fixture";
const namespace = "e2e-public-music-capture";
const captureAuthority = Object.freeze({
  namespace,
  username: `${namespace}-owner`,
  accountDocumentId: `${namespace}-account`,
  userDocumentId: `${namespace}-user`,
});

let admin: pg.Pool | undefined;
let fixture: pg.Pool | undefined;
let profileServer: Server | undefined;
let profileOrigin = "";
let fixtureToken = "";
let containerId = "";
let childDatabaseCreated = false;

function databaseUrl(name: string) {
  const target = new URL(process.env.DATABASE_URL_TEST ?? "");
  target.pathname = `/${name}`;
  return target.toString();
}

function docker(args: readonly string[], input?: Buffer) {
  const result = spawnSync(dockerExecutable, [...args], {
    input,
    windowsHide: true,
    maxBuffer: MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES,
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error("owned initial capture child operation failed");
  }
  return result.stdout;
}

async function closeProfileServer() {
  if (!profileServer) return;
  const retained = profileServer;
  profileServer = undefined;
  await new Promise<void>((resolveClose, rejectClose) => retained.close((error) => (
    error ? rejectClose(new Error("owned initial capture profile cleanup failed")) : resolveClose()
  )));
}

async function ensureProductionIdentity(pool: pg.Pool) {
  const projection = new MusicProjectionService({
    resolve: async () => ({
      userDocumentId: captureAuthority.userDocumentId,
      accountDocumentId: captureAuthority.accountDocumentId,
      username: captureAuthority.username,
      email: "capture@example.invalid",
      provider: "local" as const,
      accountName: "Capture fixture",
      accountType: "Personal",
      accountMobile: "+15555550123",
    }),
  }, new MusicIdentityRepository(pool), 1);
  return projection.ensure("c12-fixture-proof", "c12-production-ensure");
}

describePg("owned PostgreSQL initial Music E2E capture", () => {
  beforeAll(async () => {
    const authority = parseUatDatabaseAuthority(process.env);
    if (!authority) throw new Error("owned initial capture authority is missing");
    attestUatDatabaseAuthority(process.env, authority.commit);
    containerId = authority.containerId;
    admin = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 1 });
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [fixtureDatabase]);
    if (existing.rowCount !== 0) throw new Error("owned initial capture child database is not exclusive");
    await admin.query("CREATE DATABASE music_fixture");
    childDatabaseCreated = true;
    fixture = new pg.Pool({ connectionString: databaseUrl(fixtureDatabase), max: 1 });
    await migrateMusicDatabase(fixture);

    fixtureToken = randomBytes(32).toString("base64url");
    const service = createMusicFixtureService({
      username: captureAuthority.username,
      accountDocumentId: captureAuthority.accountDocumentId,
      userDocumentId: captureAuthority.userDocumentId,
      token: fixtureToken,
    });
    const handle = createMusicFixtureRestRequestHandler(service);
    profileServer = createServer((request, response) => {
      if (!handle(request, response)) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "route-invalid" }));
      }
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      profileServer!.once("error", () => rejectListen(new Error("owned initial capture profile startup failed")));
      profileServer!.listen(0, "127.0.0.1", () => resolveListen());
    });
    const address = profileServer.address();
    if (!address || typeof address === "string" || address.address !== "127.0.0.1") {
      throw new Error("owned initial capture profile authority is invalid");
    }
    profileOrigin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    try { await closeProfileServer(); }
    finally {
      fixtureToken = "";
      profileOrigin = "";
      try { if (fixture) await fixture.end(); }
      finally {
        fixture = undefined;
        if (admin) {
          try {
            if (childDatabaseCreated) {
              await admin.query(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
                [fixtureDatabase],
              );
              await admin.query("DROP DATABASE music_fixture");
              const remaining = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [fixtureDatabase]);
              if (remaining.rowCount !== 0) throw new Error("owned initial capture database cleanup failed");
            }
          } finally {
            childDatabaseCreated = false;
            await admin.end();
            admin = undefined;
          }
        }
      }
    }
  });

  it("uses the production capture core against real identity and private-profile boundaries", async () => {
    let stores = 0;
    const adapters = {
      containerAuthority: async () => ({ containerId }),
      schemaInventory: async ({ containerId: immutableId }: { containerId: string }) => {
        const operation = buildMusicFixtureSchemaInventoryOperation({ containerId: immutableId });
        docker(operation.args, operation.input);
      },
      pgDump: async ({ containerId: immutableId, dataOnly }: { containerId: string; dataOnly: boolean }) => docker([
        "exec", "-i", immutableId, "pg_dump", "-U", "music_migrator", "-d", fixtureDatabase,
        "--format=plain", ...(dataOnly ? ["--data-only"] : ["--clean", "--if-exists", "--no-owner"]),
      ]),
      identityCountQuery: async () => {
        const query = buildMusicFixtureIdentityCountPgQuery(captureAuthority);
        const result = await fixture!.query<{ count: number }>(query.text, [...query.values]);
        return result.rows[0]?.count;
      },
      profilePrivateFetch: async () => await requestMusicFixturePrivateProfileSnapshot({
        origin: profileOrigin,
        token: fixtureToken,
        authority: captureAuthority,
      }),
      snapshotStore: async ({ dataDump, profileSnapshot }: { dataDump: Buffer; profileSnapshot: unknown }) => {
        if (!Buffer.isBuffer(dataDump) || dataDump.length === 0
            || !profileSnapshot || typeof profileSnapshot !== "object") {
          throw new Error("owned initial capture private store contract failed");
        }
        stores += 1;
      },
    };

    const empty = await captureMusicFixtureState({ authority: captureAuthority, initial: true, adapters });
    expect(empty).toMatchObject({
      version: "music-live-account-snapshot/v1",
      database: { namespace, dumpHash: expect.stringMatching(/^[a-f0-9]{64}$/), identityRows: 0 },
      profile: {
        accountDocumentId: captureAuthority.accountDocumentId,
        profileHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        profileRevision: expect.any(Number),
        fieldCount: expect.any(Number),
      },
    });

    await ensureProductionIdentity(fixture!);
    const productionRow = (await fixture!.query<{
      username: string; strapi_username_snapshot: string;
      strapi_user_document_id: string; strapi_account_document_id: string;
    }>(`SELECT username,strapi_username_snapshot,strapi_user_document_id,strapi_account_document_id
          FROM users WHERE strapi_user_document_id=$1`, [captureAuthority.userDocumentId])).rows[0];
    expect(productionRow).toEqual({
      username: expect.stringMatching(/^explorer-[a-f0-9]{24}$/),
      strapi_username_snapshot: captureAuthority.username,
      strapi_user_document_id: captureAuthority.userDocumentId,
      strapi_account_document_id: captureAuthority.accountDocumentId,
    });
    expect(productionRow?.username).not.toBe(captureAuthority.username);
    const populated = await captureMusicFixtureState({ authority: captureAuthority, adapters });
    expect(populated.database.identityRows).toBe(1);
    expect(populated.database.dumpHash).not.toBe(empty.database.dumpHash);
    expect(populated.profile.profileHash).toBe(empty.profile.profileHash);
    expect(populated.profile.profileRevision).toBe(empty.profile.profileRevision);
    expect(populated.profile.fieldCount).toBe(empty.profile.fieldCount);
    expect(stores).toBe(2);
    expect(safeMusicFixtureCaptureFailure(new Error("private raw failure"))).toBeUndefined();
  });
});
