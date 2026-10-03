import type { ValidatedLocalMusicProfile } from "./music-local-profile";

export function assertCanonicalPlatformRouteGraph(mode: "fixture" | "live", localProfile: ValidatedLocalMusicProfile | undefined): void {
  if (mode === "fixture" && localProfile) throw new Error("platform fixture route graph requires canonical composition");
}
