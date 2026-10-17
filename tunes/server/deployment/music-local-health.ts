import type { Express } from "express";
import type { Pool } from "pg";
import { LOCAL_MUSIC_TARGET, assertValidatedLocalMusicProfile, type ValidatedLocalMusicProfile } from "../config/music-local-profile";
import { checkMusicDatabaseReadiness } from "../db/readiness";
import { resolveMusicEntryPolicy } from "./music-deployment";

const disabledCapabilities = Object.freeze({
  nativeAuth: false,
  analyticsPublishing: false,
  reactivation: false,
  playlistImports: false,
});

function base(profile: ValidatedLocalMusicProfile) {
  return {
    environment: "local" as const,
    deploymentQualified: false as const,
    commit: profile.source.commit,
    dirty: profile.source.dirty,
  };
}

export function setupLocalMusicHealthRoutes(app: Express, input: {
  profile: ValidatedLocalMusicProfile;
  pool: Pick<Pool, "query" | "connect">;
  migrationReadiness?: () => Promise<{ ready: boolean; currentId?: string; currentChecksum?: string }>;
  runtimeRoleReadiness?: () => Promise<boolean>;
}): void {
  assertValidatedLocalMusicProfile(input.profile);
  const profile = input.profile;

  app.get("/health/live", (_req, res) => {
    res.status(200).json({ live: true, ...base(profile) });
  });

  app.get("/health/ready", async (_req, res) => {
    try {
      await input.pool.query("SELECT 1");
      const migration = await (input.migrationReadiness ?? (() => checkMusicDatabaseReadiness(input.pool)))();
      const roleReady = await (input.runtimeRoleReadiness ?? (async () => {
        const result = await input.pool.query(`SELECT current_user,
          has_database_privilege(current_user,current_database(),'CONNECT') AS can_connect_database,
          has_database_privilege(current_user,current_database(),'CREATE') AS can_create_database_objects,
          has_database_privilege(current_user,current_database(),'TEMP') AS can_create_temporary_objects,
          has_schema_privilege(current_user,'public','USAGE') AS can_use_schema,
          has_schema_privilege(current_user,'public','CREATE') AS can_create_schema_objects`);
        const role = result.rows?.[0];
        return role?.current_user === LOCAL_MUSIC_TARGET.runtimeUser
          && role.can_connect_database === true
          && role.can_create_database_objects === false
          && role.can_create_temporary_objects === false
          && role.can_use_schema === true
          && role.can_create_schema_objects === false;
      }))();
      if (!migration.ready || !migration.currentId || !migration.currentChecksum || roleReady !== true) throw new Error("not ready");
      res.status(200).json({
        ready: true,
        ...base(profile),
        migration: { currentId: migration.currentId, currentChecksum: migration.currentChecksum },
        capabilities: disabledCapabilities,
      });
    } catch {
      res.status(503).json({
        ready: false,
        ...base(profile),
        reason: "local-readiness-failed",
        capabilities: disabledCapabilities,
      });
    }
  });

  app.get("/api/music-entry/status", (_req, res) => {
    const admission = profile.admission;
    const cohortEnabled = admission.choice === "cohort";
    res.status(200).json({
      ...resolveMusicEntryPolicy({
        killSwitch: admission.newEntryKillSwitch,
        cohortEnabled,
        inCohort: cohortEnabled && admission.cohortUserDocumentIds.length > 0,
      }),
      ...base(profile),
      killSwitch: admission.newEntryKillSwitch,
      workspaceKillSwitch: admission.workspaceKillSwitch,
      cohortEnabled,
      cohortSize: admission.cohortUserDocumentIds.length,
      cohortAdmissionConfigured: cohortEnabled && admission.cohortUserDocumentIds.length > 0,
      ownerWorkspace: admission.ownerWorkspace,
      guestWorkspace: admission.guestWorkspace,
      playlistImports: admission.playlistImports,
    });
  });
}
