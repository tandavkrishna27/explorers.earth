export const MUSIC_COMPOSE_PROJECT = "explorers-music-fixture";
export const MUSIC_FIXTURE_LABELS = {
  "com.explorers.music.fixture": "true",
  "com.explorers.music.project": MUSIC_COMPOSE_PROJECT,
} as const;

interface ComposeResource {
  labels?: Record<string, string> | string[];
  image?: string;
  command?: string | string[];
  build?: { context?: string; dockerfile?: string };
}
export interface ComposeModel {
  name?: string;
  services?: Record<string, ComposeResource>;
  networks?: Record<string, ComposeResource>;
  volumes?: Record<string, ComposeResource>;
}

function labelsOf(resource: ComposeResource): Record<string, string> {
  if (!Array.isArray(resource.labels)) return resource.labels ?? {};
  return Object.fromEntries(resource.labels.map((label) => { const separator = label.indexOf("="); return [label.slice(0, separator), label.slice(separator + 1)]; }));
}

function assertFixtureLabels(kind: string, name: string, resource: ComposeResource, requireComposeProject = false): void {
  const labels = labelsOf(resource);
  if (labels["com.explorers.music.fixture"] !== "true" || labels["com.explorers.music.project"] !== MUSIC_COMPOSE_PROJECT || (requireComposeProject && labels["com.docker.compose.project"] !== MUSIC_COMPOSE_PROJECT)) {
    throw new Error(`${kind} ${name} is missing required fixture labels`);
  }
}

export function validateComposeModel(model: ComposeModel): void {
  if (model.name !== MUSIC_COMPOSE_PROJECT) throw new Error(`Compose project must resolve to ${MUSIC_COMPOSE_PROJECT}`);
  for (const [name, service] of Object.entries(model.services ?? {})) assertFixtureLabels("service", name, service);
  for (const [name, network] of Object.entries(model.networks ?? {})) assertFixtureLabels("network", name, network);
  for (const [name, volume] of Object.entries(model.volumes ?? {})) assertFixtureLabels("volume", name, volume);
  for (const service of ["postgres", "strapi", "tunes", "explorers"]) if (!model.services?.[service]) throw new Error(`Compose model is missing required service ${service}`);
  const tunes = model.services?.tunes;
  const explorers = model.services?.explorers;
  const normalizedTunesContext = tunes?.build?.context?.replaceAll("\\", "/");
  const normalizedExplorersContext = explorers?.build?.context?.replaceAll("\\", "/");
  if (!normalizedTunesContext?.endsWith("/tunes") || tunes?.build?.dockerfile !== "Dockerfile") throw new Error("tunes must build the actual application");
  if (!normalizedExplorersContext
      || normalizedExplorersContext.endsWith("/explorers-earth")
      || explorers?.build?.dockerfile !== "explorers-earth/Dockerfile.music-fixture") {
    throw new Error("explorers must build the actual application");
  }
  if (!Object.keys(model.networks ?? {}).length) throw new Error("Compose model has no labeled network");
  if (!Object.keys(model.volumes ?? {}).length) throw new Error("Compose model has no labeled volume");
}

export function validateOwnedResources(resources: Array<{ kind: "container" | "network" | "volume"; name: string; labels?: Record<string, string> }>): void {
  if (!resources.length) throw new Error("no resolved fixture resources were found");
  for (const resource of resources) {
    if (/prod(?:uction)?/i.test(resource.name)) throw new Error(`${resource.kind} ${resource.name} is production-like`);
    assertFixtureLabels(resource.kind, resource.name, resource, true);
  }
  for (const kind of ["container", "network", "volume"] as const) {
    if (!resources.some((resource) => resource.kind === kind)) throw new Error(`no resolved fixture ${kind} was found`);
  }
}
