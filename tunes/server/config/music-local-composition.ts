import type { ValidatedLocalMusicProfile } from "./music-local-profile";

export interface OptionalMusicIntegrationInstallers {
  nativeAuth(): void;
  analyticsPublishing(): void;
  reactivation(): void;
}

/** Keeps disabled integration factories completely cold in the local profile. */
export function installProfileOptionalMusicIntegrations(
  localProfile: ValidatedLocalMusicProfile | undefined,
  installers: OptionalMusicIntegrationInstallers,
): void {
  if (localProfile) return;
  installers.nativeAuth();
  installers.analyticsPublishing();
  installers.reactivation();
}

export function musicCompositionPolicy(localProfile: ValidatedLocalMusicProfile | undefined) {
  return Object.freeze({
    canonicalRest: true,
    canonicalSockets: true,
    publicChangeSafetyListener: true,
    suspensionSafetyListener: true,
    lifecycleWorker: !localProfile,
  });
}
