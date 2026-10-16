/**
 * `combined` exists for the platform fixture only. It starts the Music runtime and
 * delegates the canonical route graph into it on one listener, because the fixture
 * ingress has to satisfy ticket 1.2's canonical route-graph invariant without
 * losing the Music HTTP and Socket.IO behaviour the end-to-end journey exercises.
 * Production and QA stay on `canonical` (see `scripts/platform-runtime-plan.ts`).
 */
export type ApiMode = "canonical" | "legacy-music" | "combined";

export function selectApiMode(environment: Record<string, string | undefined>): ApiMode {
  const mode = environment.EXPLORERS_API_MODE;
  if (mode === "canonical" || mode === "legacy-music" || mode === "combined") return mode;
  throw new Error("EXPLORERS_API_MODE must explicitly select canonical, legacy-music or combined");
}
