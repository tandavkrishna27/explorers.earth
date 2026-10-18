/**
 * The API image starts one of two compositions. Production, QA and the platform
 * fixture run `canonical`; `legacy-music` remains only for the Music deployment
 * that P3-7 deletes. The fixture-only `combined` mode, which delegated the
 * canonical route graph into the Music runtime, was retired in P3-2.
 */
export type ApiMode = "canonical" | "legacy-music";

export function selectApiMode(environment: Record<string, string | undefined>): ApiMode {
  const mode = environment.EXPLORERS_API_MODE;
  if (mode === "canonical" || mode === "legacy-music") return mode;
  throw new Error("EXPLORERS_API_MODE must explicitly select canonical or legacy-music");
}
