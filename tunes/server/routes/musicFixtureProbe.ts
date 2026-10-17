import type { Express } from "express";

interface FixtureProbeDependencies {
  mode: "fixture";
  databaseQuery: (sql: string) => Promise<{ rows: Array<{ database: string; ready: number }> }>;
  migrationReadiness: () => Promise<{ ready: boolean; currentId?: string }>;
  strapiUrl: string;
  strapiReadToken: string;
  fetchImpl: typeof fetch;
}

interface FixtureIdentity {
  documentId?: string;
  accounts?: Array<{ documentId?: string }>;
}

export function setupMusicFixtureProbeRoute(app: Express, dependencies: FixtureProbeDependencies): void {
  if (dependencies.mode !== "fixture") throw new Error("Music fixture probe can only be registered in fixture mode");
  if (!dependencies.strapiReadToken || dependencies.strapiReadToken.trim() !== dependencies.strapiReadToken
      || /[\u0000-\u001f\u007f]/.test(dependencies.strapiReadToken)) {
    throw new Error("Music fixture probe requires a valid read-only Strapi token");
  }
  app.get("/api/music-fixture/readiness", async (_request, response) => {
    try {
      const databaseResult = await dependencies.databaseQuery("SELECT current_database() AS database, 1 AS ready");
      const migration = await dependencies.migrationReadiness();
      const healthResponse = await dependencies.fetchImpl(`${dependencies.strapiUrl}/health`, { signal: AbortSignal.timeout(5_000) });
      const identityResponse = await dependencies.fetchImpl(`${dependencies.strapiUrl}/api/users/me`, {
        headers: { authorization: `Bearer ${dependencies.strapiReadToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!healthResponse.ok || !identityResponse.ok) throw new Error("fixture Strapi is not ready");
      const health = await healthResponse.json() as { status?: string };
      const identity = await identityResponse.json() as FixtureIdentity;
      const database = databaseResult.rows[0];
      const account = identity.accounts?.[0];
      if (database?.ready !== 1 || !migration.ready || !identity.documentId || !account?.documentId) throw new Error("fixture boundary response is incomplete");
      response.json({
        status: "ready",
        application: "tunes",
        boundaries: { database: database.database, migration: migration.currentId, strapi: health.status },
        identity: { personDocumentId: identity.documentId, accountDocumentId: account.documentId },
      });
    } catch (error) {
      response.status(503).json({ status: "not-ready", error: error instanceof Error ? error.message : "fixture probe failed" });
    }
  });
}
