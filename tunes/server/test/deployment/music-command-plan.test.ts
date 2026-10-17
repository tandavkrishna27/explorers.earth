import { describe, expect, it } from "vitest";
import {
  createBootstrapCommandPlan,
  createDeployCommandPlan,
  executeBootstrapCommandPlan,
  executeDeployCommandPlan,
  type BootstrapPlanRuntime,
  type CommandPlanRuntime,
} from "../../deployment/music-command-plan";

const request = {
  composeFile: "/opt/explorers/docker-compose.yml",
  projectDirectory: "/opt/explorers",
  routeFile: "/opt/explorers/deployment-routing/music-router.yml",
  candidateSlot: "green" as const,
  imageRef: `ghcr.io/explorers/explorers-tunes@sha256:${"d".repeat(64)}`,
  digest: `sha256:${"d".repeat(64)}`,
  commit: "d".repeat(40),
};

describe("executable deployment command plan", () => {
  it("uses the exact image for pull and same-image gate, then starts private before readiness and route swap", () => {
    // Production break caught: the documented state machine passes while the real command plan rebuilds or routes early.
    const plan = createDeployCommandPlan(request);
    expect(plan.map((step) => step.kind)).toEqual([
      "pull", "verify-digest", "containment-gate", "start-private", "readiness", "atomic-route",
    ]);
    expect(JSON.stringify(plan)).toContain(request.imageRef);
    expect(JSON.stringify(plan)).not.toMatch(/compose[^\n]*(down|--build)|scp/i);
  });

  it("executes argument arrays without a shell and never swaps the route after readiness failure", async () => {
    const events: string[] = [];
    const runtime: CommandPlanRuntime = {
      run: async (executable, args) => { events.push(`${executable} ${args.join(" ")}`); },
      verifyReadiness: async () => { events.push("readiness:false"); return false; },
      atomicRoute: async () => { events.push("route"); },
    };

    await expect(executeDeployCommandPlan(createDeployCommandPlan(request), runtime))
      .rejects.toThrow("candidate readiness failed");
    expect(events).not.toContain("route");
    expect(events.some((event) => event.includes("bash -c"))).toBe(false);
  });

  it("atomically routes the private candidate only after readiness succeeds", async () => {
    const events: string[] = [];
    const runtime: CommandPlanRuntime = {
      run: async (_executable, args) => { events.push(args.join(" ")); },
      verifyReadiness: async (_slot, digest, commit) => {
        events.push(`ready ${digest} ${commit}`);
        return true;
      },
      atomicRoute: async (path, service) => { events.push(`route ${path} ${service}`); },
    };

    await executeDeployCommandPlan(createDeployCommandPlan(request), runtime);
    expect(events.at(-2)).toContain(`ready ${request.digest} ${request.commit}`);
    expect(events.at(-1)).toBe(`route ${request.routeFile} tunes-green`);
  });
});

describe("legacy-to-blue bootstrap command plan", () => {
  it("keeps legacy routed until the verified C2 blue image is ready and hostile-probed", () => {
    // Production break caught: bootstrap starts from nonexistent blue state or removes legacy routing before blue is safe.
    const plan = createBootstrapCommandPlan({
      ...request,
      candidateSlot: "blue",
      minimumContainmentCommit: "d226f7e4dc5a54195a59804ec729f72b5e8f10d7",
    });
    expect(plan.map((step) => step.kind)).toEqual([
      "observe-legacy",
      "route-legacy-priority",
      "verify-legacy-public",
      "pull",
      "verify-digest",
      "containment-gate",
      "start-private",
      "readiness",
      "hostile-probes",
      "atomic-route",
      "verify-public-digest",
      "initialize-floor",
      "stop-legacy",
    ]);
  });

  it("never initializes the floor or stops legacy when public exact-digest verification fails", async () => {
    const events: string[] = [];
    const runtime: BootstrapPlanRuntime = {
      run: async (_executable, args) => { events.push(args.join(" ")); },
      observeLegacy: async () => { events.push("observe-legacy"); return "legacy-id"; },
      atomicRoute: async (_path, service, priority) => { events.push(`route:${service}:${priority}`); },
      verifyLegacyPublic: async () => { events.push("legacy-public"); return true; },
      verifyReadiness: async () => { events.push("ready"); return true; },
      runHostileProbes: async () => { events.push("hostile"); return true; },
      verifyPublicDigest: async () => { events.push("public-digest:false"); return false; },
      initializeFloor: async () => { events.push("floor"); },
      stopLegacy: async () => { events.push("stop-legacy"); },
    };

    await expect(executeBootstrapCommandPlan(createBootstrapCommandPlan({
      ...request,
      candidateSlot: "blue",
      minimumContainmentCommit: "d226f7e4dc5a54195a59804ec729f72b5e8f10d7",
    }), runtime)).rejects.toThrow("public digest verification failed");

    expect(events).not.toContain("floor");
    expect(events).not.toContain("stop-legacy");
    expect(events).toContain("route:legacy-id:200");
    expect(events).toContain("route:tunes-blue:200");
  });
});
