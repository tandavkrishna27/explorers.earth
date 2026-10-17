export interface DeployCommandRequest {
  composeFile: string;
  projectDirectory: string;
  routeFile: string;
  candidateSlot: "blue" | "green";
  imageRef: string;
  digest: string;
  commit: string;
}

type CommandStep = {
  kind: "pull" | "verify-digest" | "containment-gate" | "start-private";
  executable: "docker";
  args: string[];
};
type ReadinessStep = { kind: "readiness"; slot: "blue" | "green"; digest: string; commit: string };
type RouteStep = { kind: "atomic-route"; path: string; service: `tunes-${"blue" | "green"}`; priority: 200 };
export type DeployCommandStep = CommandStep | ReadinessStep | RouteStep;

export interface CommandPlanRuntime {
  run(executable: string, args: string[]): Promise<void>;
  verifyReadiness(slot: "blue" | "green", digest: string, commit: string): Promise<boolean>;
  atomicRoute(path: string, service: `tunes-${"blue" | "green"}`, priority: 200): Promise<void>;
}

function composeArgs(input: DeployCommandRequest, ...args: string[]): string[] {
  return ["compose", "--project-directory", input.projectDirectory, "-f", input.composeFile, ...args];
}

export function createDeployCommandPlan(input: DeployCommandRequest): DeployCommandStep[] {
  if (!/^sha256:[a-f0-9]{64}$/.test(input.digest) || !/^[a-f0-9]{40}$/.test(input.commit)) {
    throw new Error("immutable candidate metadata is invalid");
  }
  if (!input.imageRef.endsWith(`@${input.digest}`) || !/^ghcr\.io\/[a-z0-9_.-]+\/explorers-tunes@sha256:/.test(input.imageRef)) {
    throw new Error("candidate image reference must bind explorers-tunes to the requested digest");
  }
  const service = `tunes-${input.candidateSlot}` as const;
  return [
    { kind: "pull", executable: "docker", args: ["pull", input.imageRef] },
    {
      kind: "verify-digest",
      executable: "docker",
      args: ["image", "inspect", "--format", "{{range .RepoDigests}}{{println .}}{{end}}", input.imageRef],
    },
    {
      kind: "containment-gate",
      executable: "docker",
      args: composeArgs(input, "--profile", "deployment", "run", "--rm", "--no-deps", "tunes-gate"),
    },
    {
      kind: "start-private",
      executable: "docker",
      args: composeArgs(input, "up", "-d", "--no-deps", service),
    },
    { kind: "readiness", slot: input.candidateSlot, digest: input.digest, commit: input.commit },
    { kind: "atomic-route", path: input.routeFile, service, priority: 200 },
  ];
}

export async function executeDeployCommandPlan(plan: DeployCommandStep[], runtime: CommandPlanRuntime): Promise<void> {
  for (const step of plan) {
    if ("executable" in step) {
      await runtime.run(step.executable, [...step.args]);
    } else if (step.kind === "readiness") {
      if (!await runtime.verifyReadiness(step.slot, step.digest, step.commit)) {
        throw new Error("candidate readiness failed");
      }
    } else {
      await runtime.atomicRoute(step.path, step.service, step.priority);
    }
  }
}

export interface BootstrapCommandRequest extends DeployCommandRequest {
  candidateSlot: "blue";
  minimumContainmentCommit: string;
}

type BootstrapControlStep =
  | { kind: "observe-legacy" }
  | { kind: "route-legacy-priority"; path: string; priority: 200 }
  | { kind: "verify-legacy-public" }
  | { kind: "hostile-probes"; slot: "blue" }
  | { kind: "verify-public-digest"; digest: string; commit: string }
  | { kind: "initialize-floor"; imageRef: string; digest: string; commit: string; minimumContainmentCommit: string }
  | { kind: "stop-legacy" };
export type BootstrapCommandStep = CommandStep | ReadinessStep | RouteStep | BootstrapControlStep;

export interface BootstrapPlanRuntime extends CommandPlanRuntime {
  observeLegacy(): Promise<string>;
  atomicRoute(path: string, service: string, priority: 200): Promise<void>;
  verifyLegacyPublic(): Promise<boolean>;
  runHostileProbes(slot: "blue"): Promise<boolean>;
  verifyPublicDigest(digest: string, commit: string): Promise<boolean>;
  initializeFloor(input: {
    imageRef: string;
    digest: string;
    commit: string;
    minimumContainmentCommit: string;
  }): Promise<void>;
  stopLegacy(containerId: string): Promise<void>;
}

export function createBootstrapCommandPlan(input: BootstrapCommandRequest): BootstrapCommandStep[] {
  if (!/^[a-f0-9]{40}$/.test(input.minimumContainmentCommit)) {
    throw new Error("minimum containment provenance must be a full git SHA");
  }
  const deploySteps = createDeployCommandPlan(input);
  return [
    { kind: "observe-legacy" },
    { kind: "route-legacy-priority", path: input.routeFile, priority: 200 },
    { kind: "verify-legacy-public" },
    ...deploySteps.slice(0, -1),
    { kind: "hostile-probes", slot: "blue" },
    deploySteps.at(-1) as RouteStep,
    { kind: "verify-public-digest", digest: input.digest, commit: input.commit },
    {
      kind: "initialize-floor",
      imageRef: input.imageRef,
      digest: input.digest,
      commit: input.commit,
      minimumContainmentCommit: input.minimumContainmentCommit,
    },
    { kind: "stop-legacy" },
  ];
}

export async function executeBootstrapCommandPlan(plan: BootstrapCommandStep[], runtime: BootstrapPlanRuntime): Promise<void> {
  let legacyContainer = "";
  let routePath = "";
  let blueRouted = false;
  try {
    for (const step of plan) {
      switch (step.kind) {
        case "observe-legacy":
          legacyContainer = await runtime.observeLegacy();
          if (!legacyContainer) throw new Error("legacy container observation failed");
          break;
        case "route-legacy-priority":
          routePath = step.path;
          await runtime.atomicRoute(step.path, legacyContainer, step.priority);
          break;
        case "verify-legacy-public":
          if (!await runtime.verifyLegacyPublic()) throw new Error("legacy public verification failed");
          break;
        case "readiness":
          if (!await runtime.verifyReadiness(step.slot, step.digest, step.commit)) throw new Error("candidate readiness failed");
          break;
        case "hostile-probes":
          if (!await runtime.runHostileProbes(step.slot)) throw new Error("containment hostile probes failed");
          break;
        case "atomic-route":
          await runtime.atomicRoute(step.path, step.service, step.priority);
          blueRouted = true;
          break;
        case "verify-public-digest":
          if (!await runtime.verifyPublicDigest(step.digest, step.commit)) throw new Error("public digest verification failed");
          break;
        case "initialize-floor":
          await runtime.initializeFloor(step);
          break;
        case "stop-legacy":
          await runtime.stopLegacy(legacyContainer);
          break;
        default:
          await runtime.run(step.executable, [...step.args]);
      }
    }
  } catch (error) {
    if (blueRouted && legacyContainer && routePath) await runtime.atomicRoute(routePath, legacyContainer, 200);
    throw error;
  }
}
