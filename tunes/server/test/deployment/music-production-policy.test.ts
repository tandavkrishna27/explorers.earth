import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const moduleUrl = pathToFileURL(resolve(repositoryRoot, "tunes/deployment/verify-production-environment-policy.mjs")).href;

type PolicyVerifier = (input: {
  environment: Record<string, string | undefined>;
  request: (url: string, init: RequestInit) => Promise<Response>;
}) => Promise<void>;

async function loadVerifier(): Promise<PolicyVerifier> {
  const module = await import(moduleUrl) as { verifyProductionEnvironmentPolicy: PolicyVerifier };
  return module.verifyProductionEnvironmentPolicy;
}

const baseEnvironment = {
  GITHUB_REF: "refs/heads/main",
  GITHUB_REPOSITORY: "explorers-earth/explorers.earth",
  GITHUB_API_URL: "https://api.github.com",
  GH_TOKEN: "test-actions-token",
};

const protectedMainPolicy = {
  deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
};
const independentApprovalRule = {
  type: "required_reviewers",
  prevent_self_review: true,
  reviewers: [{ type: "Team", reviewer: { id: 17, slug: "production-approvers" } }],
};

function requestFor(input: { environmentPolicy?: unknown; protectedBranches?: unknown; branch?: unknown }) {
  const calls: string[] = [];
  const request = async (url: string) => {
    calls.push(url);
    if (url.endsWith("/environments/tunes-production")) {
      return new Response(JSON.stringify(input.environmentPolicy ?? {}), { status: 200 });
    }
    if (url.endsWith("/branches?protected=true&per_page=100")) {
      return new Response(JSON.stringify(input.protectedBranches ?? {}), { status: 200 });
    }
    if (url.endsWith("/branches/main")) {
      return new Response(JSON.stringify(input.branch ?? {}), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  return { calls, request };
}

describe("production environment policy preflight", () => {
  it("refuses non-main before making any GitHub API request", async () => {
    // Production break caught: a feature-branch dispatch reaches an environment
    // or API-backed production authority check with its editable workflow.
    const verify = await loadVerifier();
    const boundary = requestFor({});
    await expect(verify({ environment: { ...baseEnvironment, GITHUB_REF: "refs/heads/feature" }, request: boundary.request })).rejects.toThrow("main ref required");
    expect(boundary.calls).toEqual([]);
  });

  it.each([
    ["absent", {}, [], { name: "main", protected: true }],
    ["custom-patterns", { deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }, [{ name: "main", protected: true }], { name: "main", protected: true }],
    ["an additional protected branch", { deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } }, [{ name: "main", protected: true }, { name: "release", protected: true }], { name: "main", protected: true }],
    ["an unexpected sole protected branch", { deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } }, [{ name: "release", protected: true }], { name: "main", protected: true }],
    ["unprotected-main", { deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } }, [], { name: "main", protected: false }],
  ])("refuses %s protected-main policy", async (_case, environmentPolicy, protectedBranches, branch) => {
    // Production break caught: a release starts while the external environment
    // admits branch-authored workflow copies or main itself is unprotected.
    const verify = await loadVerifier();
    const boundary = requestFor({ environmentPolicy, protectedBranches, branch });
    await expect(verify({ environment: baseEnvironment, request: boundary.request })).rejects.toThrow("protected-main production policy required");
  });

  it.each([
    ["missing reviewers", { ...protectedMainPolicy, protection_rules: [] }],
    ["empty reviewers", { ...protectedMainPolicy, protection_rules: [{ ...independentApprovalRule, reviewers: [] }] }],
    ["self review", { ...protectedMainPolicy, protection_rules: [{ ...independentApprovalRule, prevent_self_review: false }] }],
    ["malformed reviewer", { ...protectedMainPolicy, protection_rules: [{ ...independentApprovalRule, reviewers: [{ type: "Team", reviewer: {} }] }] }],
  ])("refuses %s in the production approval policy", async (_case, environmentPolicy) => {
    const verify = await loadVerifier();
    const boundary = requestFor({
      environmentPolicy,
      protectedBranches: [{ name: "main", protected: true }],
      branch: { name: "main", protected: true },
    });
    await expect(verify({ environment: baseEnvironment, request: boundary.request }))
      .rejects.toThrow("independent production approval policy required");
  });

  it("accepts protected-branches-only only when main is the sole protected branch", async () => {
    const verify = await loadVerifier();
    const boundary = requestFor({
      environmentPolicy: { ...protectedMainPolicy, protection_rules: [independentApprovalRule] },
      protectedBranches: [{ name: "main", protected: true }],
      branch: { name: "main", protected: true },
    });
    await expect(verify({ environment: baseEnvironment, request: boundary.request })).resolves.toBeUndefined();
    expect(boundary.calls).toEqual([
      "https://api.github.com/repos/explorers-earth/explorers.earth/environments/tunes-production",
      "https://api.github.com/repos/explorers-earth/explorers.earth/branches?protected=true&per_page=100",
      "https://api.github.com/repos/explorers-earth/explorers.earth/branches/main",
    ]);
  });
});
