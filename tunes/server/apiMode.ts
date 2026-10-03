export type ApiMode = "canonical" | "legacy-music";

export function selectApiMode(environment: Record<string, string | undefined>): ApiMode {
  const mode = environment.EXPLORERS_API_MODE;
  if (mode === "canonical" || mode === "legacy-music") return mode;
  throw new Error("EXPLORERS_API_MODE must explicitly select canonical or legacy-music");
}
