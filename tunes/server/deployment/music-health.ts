import { readFile } from "node:fs/promises";
import type { Express } from "express";
import type { Pool } from "pg";
import {
  CURRENT_MIGRATION_MARKER,
  evaluateReadiness,
  livenessStatus,
  parseMusicCohortConfiguration,
  resolveMusicEntryPolicy,
  type GateAttestation,
  type ImageCandidate,
} from "./music-deployment";
import { checkMusicDatabaseReadiness } from "../db/readiness";

export function deploymentImageFromEnvironment(env: NodeJS.ProcessEnv): ImageCandidate {
  return {
    digest: env.MUSIC_IMAGE_DIGEST ?? "",
    commit: env.MUSIC_IMAGE_COMMIT ?? "",
    migrationMarker: env.MUSIC_MIGRATION_MARKER === CURRENT_MIGRATION_MARKER
      ? CURRENT_MIGRATION_MARKER
      : env.MUSIC_MIGRATION_MARKER as typeof CURRENT_MIGRATION_MARKER,
  };
}

async function readAttestation(path: string | undefined): Promise<GateAttestation | undefined> {
  if (!path) return undefined;
  try {
    return JSON.parse(await readFile(path, "utf8")) as GateAttestation;
  } catch {
    return undefined;
  }
}

export function setupMusicHealthRoutes(app: Express, input: {
  pool: Pick<Pool, "query" | "connect">;
  env?: NodeJS.ProcessEnv;
  migrationReadiness?: () => Promise<{ ready: boolean; currentId?: string; currentChecksum?: string }>;
}): void {
  const env = input.env ?? process.env;
  const image = deploymentImageFromEnvironment(env);
  const cohort = parseMusicCohortConfiguration(env);

  app.get("/health/live", (_req, res) => {
    res.status(200).json(livenessStatus());
  });

  app.get("/health/ready", async (_req, res) => {
    const result = await evaluateReadiness({
      image,
      attestation: env.MUSIC_GATE_ATTESTATION_JSON
        ? JSON.parse(env.MUSIC_GATE_ATTESTATION_JSON) as GateAttestation
        : await readAttestation(env.MUSIC_GATE_ATTESTATION_PATH),
      attestationKey: env.MUSIC_GATE_ATTESTATION_KEY ?? "",
      requiredSecrets: {
        SESSION_SECRET: env.SESSION_SECRET,
        COOKIE_SECRET: env.COOKIE_SECRET,
        STRAPI_ACCESS_TOKEN: env.STRAPI_ACCESS_TOKEN,
        STRAPI_JWT_SECRET: env.STRAPI_JWT_SECRET,
      },
      upstreamUrls: { STRAPI_URL: env.STRAPI_URL },
      databasePing: async () => {
        await input.pool.query("SELECT 1");
        return true;
      },
      migrationState: input.migrationReadiness ?? (() => checkMusicDatabaseReadiness(input.pool)),
    });
    res.status(result.ready ? 200 : 503).json(result);
  });

  app.get("/api/music-entry/status", (_req, res) => {
    const killSwitch = env.MUSIC_NEW_ENTRY_KILL_SWITCH !== "false";
    const cohortAdmissionConfigured = cohort.enabled && cohort.userDocumentIds.size > 0;
    res.status(200).json({
      ...resolveMusicEntryPolicy({
        killSwitch,
        cohortEnabled: cohort.enabled,
        inCohort: cohortAdmissionConfigured,
      }),
      killSwitch,
      cohortEnabled: cohort.enabled,
      cohortSize: cohort.userDocumentIds.size,
      cohortAdmissionConfigured,
      ...image,
    });
  });
}
