import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateMusicDatabase } from "../db/migrate";
import {
  attestUatDatabaseAuthority,
  MUSIC_UAT_DATABASE_ACK,
  parseUatDatabaseAuthority,
} from "../../scripts/music-uat-database";
import { runMusicFixtureIdentityCountPsql } from "../../scripts/music-e2e-state-capture.mjs";
import { MusicIdentityRepository } from "../repositories/musicIdentityRepository";
import { MusicProjectionService } from "../services/musicProjectionService";

const enabled = process.env.MUSIC_C13_IDENTITY_COUNT_ADAPTER_POSTGRES_TEST === "1"
  && process.env.MUSIC_UAT_DATABASE_ACK === MUSIC_UAT_DATABASE_ACK;
const describePg = enabled ? describe.sequential : describe.skip;
const fixtureDatabase = "music_fixture";
const namespace = "e2e-public-music-adapter";
const captureAuthority = Object.freeze({
  namespace,
  username: `${namespace}-owner`,
  accountDocumentId: `${namespace}-account`,
  userDocumentId: `${namespace}-user`,
});

let admin: pg.Pool | undefined;
let fixture: pg.Pool | undefined;
let containerId = "";
let childDatabaseCreated = false;

function databaseUrl(name: string): string {
  const target = new URL(process.env.DATABASE_URL_TEST ?? "");
  target.pathname = `/${name}`;
  return target.toString();
}

function attestOwnedContainer(): { containerId: string } {
  const authority = parseUatDatabaseAuthority(process.env);
  if (!authority || authority.containerId !== containerId) {
    throw new Error("owned identity-count adapter authority changed");
  }
  const attested = attestUatDatabaseAuthority(process.env, authority.commit);
  if (!attested || attested.containerId !== containerId) {
    throw new Error("owned identity-count adapter authority changed");
  }
  return { containerId: attested.containerId };
}

async function ensureProductionIdentity(pool: pg.Pool) {
  const projection = new MusicProjectionService({
    resolve: async () => ({
      userDocumentId: captureAuthority.userDocumentId,
      accountDocumentId: captureAuthority.accountDocumentId,
      username: captureAuthority.username,
      email: "adapter@example.invalid",
      provider: "local" as const,
      accountName: "Adapter fixture",
      accountType: "Personal",
      accountMobile: "+15555550124",
    }),
  }, new MusicIdentityRepository(pool), 1);
  return projection.ensure("c13-fixture-proof", "c13-production-ensure");
}

describePg("owned PostgreSQL production identity-count adapter", () => {
  beforeAll(async () => {
    const authority = parseUatDatabaseAuthority(process.env);
    if (!authority) throw new Error("owned identity-count adapter authority is missing");
    const attested = attestUatDatabaseAuthority(process.env, authority.commit);
    if (!attested || attested.containerId !== authority.containerId) {
      throw new Error("owned identity-count adapter authority is invalid");
    }
    containerId = attested.containerId;
    admin = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 1 });
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [fixtureDatabase]);
    if (existing.rowCount !== 0) throw new Error("owned identity-count child database is not exclusive");
    await admin.query("CREATE DATABASE music_fixture");
    childDatabaseCreated = true;
    fixture = new pg.Pool({ connectionString: databaseUrl(fixtureDatabase), max: 1 });
    await migrateMusicDatabase(fixture);
  });

  afterAll(async () => {
    const retainedFixture = fixture;
    fixture = undefined;
    try {
      if (retainedFixture) await retainedFixture.end();
    } finally {
      const retainedAdmin = admin;
      admin = undefined;
      if (retainedAdmin) {
        try {
          if (childDatabaseCreated) {
            await retainedAdmin.query(
              "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
              [fixtureDatabase],
            );
            await retainedAdmin.query("DROP DATABASE music_fixture");
            const remaining = await retainedAdmin.query(
              "SELECT 1 FROM pg_database WHERE datname=$1", [fixtureDatabase],
            );
            if (remaining.rowCount !== 0) throw new Error("owned identity-count database cleanup failed");
          }
        } finally {
          childDatabaseCreated = false;
          containerId = "";
          await retainedAdmin.end();
        }
      } else {
        childDatabaseCreated = false;
        containerId = "";
      }
    }
  });

  it("uses the production projection row for exact zero-to-one identity matching and rejects wrong snapshots or documents", async () => {
    expect(runMusicFixtureIdentityCountPsql({
      containerId,
      authority: captureAuthority,
      attestContainer: attestOwnedContainer,
    })).toBe(0);

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

    expect(runMusicFixtureIdentityCountPsql({
      containerId,
      authority: captureAuthority,
      attestContainer: attestOwnedContainer,
    })).toBe(1);

    await fixture!.query("UPDATE users SET strapi_username_snapshot=$1 WHERE strapi_user_document_id=$2", [
      `${namespace}-wrong-owner`, captureAuthority.userDocumentId,
    ]);
    expect(runMusicFixtureIdentityCountPsql({
      containerId,
      authority: captureAuthority,
      attestContainer: attestOwnedContainer,
    })).toBe(0);
    await fixture!.query("UPDATE users SET strapi_username_snapshot=$1 WHERE strapi_user_document_id=$2", [
      captureAuthority.username, captureAuthority.userDocumentId,
    ]);

    const wrongDocumentsNamespace = `${namespace}-other`;
    expect(runMusicFixtureIdentityCountPsql({
      containerId,
      authority: {
        namespace: wrongDocumentsNamespace,
        username: `${wrongDocumentsNamespace}-owner`,
        accountDocumentId: `${wrongDocumentsNamespace}-account`,
        userDocumentId: `${wrongDocumentsNamespace}-user`,
      },
      attestContainer: attestOwnedContainer,
    })).toBe(0);
    expect(runMusicFixtureIdentityCountPsql({
      containerId,
      authority: captureAuthority,
      attestContainer: attestOwnedContainer,
    })).toBe(1);
  });
});
