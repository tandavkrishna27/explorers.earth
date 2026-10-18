import { CURRENT_MIGRATION_MARKER, type ImageCandidate } from "./music-deployment";

/**
 * The running image's identity, from its environment. Split out of music-health.ts (P6-3) so the
 * production migration gate does not import the legacy health route, which reads STRAPI_* inputs.
 */
export function deploymentImageFromEnvironment(env: NodeJS.ProcessEnv): ImageCandidate {
  return {
    digest: env.MUSIC_IMAGE_DIGEST ?? "",
    commit: env.MUSIC_IMAGE_COMMIT ?? "",
    migrationMarker: env.MUSIC_MIGRATION_MARKER === CURRENT_MIGRATION_MARKER
      ? CURRENT_MIGRATION_MARKER
      : env.MUSIC_MIGRATION_MARKER as typeof CURRENT_MIGRATION_MARKER,
  };
}
