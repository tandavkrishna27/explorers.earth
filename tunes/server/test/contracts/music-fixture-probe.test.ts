import { createServer } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { setupMusicFixtureProbeRoute } from "../../routes/musicFixtureProbe.ts";
import { createLoopbackSupertestScope } from "../helpers/loopback-supertest";

describe("actual Tunes application fixture probe", () => {
  const loopback = createLoopbackSupertestScope();
  afterEach(async () => loopback.closeAll());

  it("mediates one request across the Strapi and PostgreSQL boundaries", async () => {
    // Production break caught: smoke hits a renamed fixture server and never
    // executes a Tunes application route, Strapi fetch, or database query.
    const upstreamRequests: Array<{ url?: string; authorization?: string }> = [];
    const strapi = createServer((incoming, response) => {
      upstreamRequests.push({ url: incoming.url, authorization: incoming.headers.authorization });
      response.setHeader("content-type", "application/json");
      if (incoming.url === "/health") return response.end(JSON.stringify({ status: "ready" }));
      if (incoming.headers.authorization !== "Bearer fixture-read-only-token") {
        response.statusCode = 401;
        return response.end(JSON.stringify({ error: "unauthorized" }));
      }
      return response.end(JSON.stringify({
        documentId: "fixture-person",
        blocked: false,
        is_subscribed: false,
        accounts: [{ documentId: "fixture-account", Account_Name: "Fixture", Account_Type: "Personal", mobile_number: "+10000000000", localtunes_integrated: "No" }],
      }));
    });
    const strapiSession = await loopback.open({ server: strapi });

    const queries: string[] = [];
    const app = express();
    setupMusicFixtureProbeRoute(app, {
      mode: "fixture",
      databaseQuery: async (sql) => { queries.push(sql); return { rows: [{ database: "music_fixture", ready: 1 }] }; },
      migrationReadiness: async () => ({ ready: true, currentId: "0020_public_snapshot_revision" }),
      strapiUrl: `http://127.0.0.1:${strapiSession.address.port}`,
      strapiReadToken: "fixture-read-only-token",
      fetchImpl: fetch,
    });

    const appSession = await loopback.open({ app });
    const response = await appSession.request.get("/api/music-fixture/readiness").expect(200);
    expect(queries).toEqual(["SELECT current_database() AS database, 1 AS ready"]);
    expect(upstreamRequests).toEqual([
      { url: "/health", authorization: undefined },
      { url: "/api/users/me", authorization: "Bearer fixture-read-only-token" },
    ]);
    expect(response.body).toMatchObject({
      status: "ready",
      application: "tunes",
      boundaries: { database: "music_fixture", migration: "0020_public_snapshot_revision", strapi: "ready" },
      identity: { personDocumentId: "fixture-person", accountDocumentId: "fixture-account" },
    });
  });

  it("refuses route registration outside fixture mode", () => {
    // Production break caught: a future caller registers the internal boundary
    // probe in live mode despite the current conditional application wiring.
    const app = express();
    expect(() => setupMusicFixtureProbeRoute(app, {
      mode: "live",
      databaseQuery: async () => ({ rows: [] }),
      strapiUrl: "http://127.0.0.1:1",
      fetchImpl: fetch,
    } as never)).toThrow("only be registered in fixture mode");
  });

  it("fails closed before registration without a valid fixture read token", () => {
    for (const strapiReadToken of ["", " token", "token\n"]) {
      expect(() => setupMusicFixtureProbeRoute(express(), {
        mode: "fixture",
        databaseQuery: async () => ({ rows: [] }),
        migrationReadiness: async () => ({ ready: false }),
        strapiUrl: "http://127.0.0.1:1",
        strapiReadToken,
        fetchImpl: fetch,
      })).toThrow("requires a valid read-only Strapi token");
    }
  });
});
