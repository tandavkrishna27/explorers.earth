import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const template = readFileSync(resolve(root, "docs/testing/music-release-evidence-template.md"), "utf8");

describe("Music release evidence template", () => {
  it("requires exact immutable authority and every bounded C10 measurement", () => {
    for (const field of [
      "commit", "image_digest", "migration_marker", "fixture_version", "fixture_age",
      "fast_wall_ms", "pr_wall_ms", "nightly_wall_ms", "release_wall_ms",
      "lane_p50_ms", "lane_p95_ms", "ensure_p95_ms", "owner_p95_ms", "owner_strapi_calls",
      "cold_first_green_ms", "warm_first_green_ms", "diagnostic_reruns", "failure_codes",
      "interrupt_cleanup", "resume_result", "fixture_drift", "documentation_failures",
      "compatibility_route_usage", "rollback_digest", "secure_rollback_floor",
    ]) expect(template).toContain(`{{${field}}}`);
  });

  it("keeps evidence non-deploying, secret-free, and independently reviewable", () => {
    expect(template).toContain("music-release-launcher.ps1 -Mode qualification");
    expect(template).toContain("music-release-launcher.sh qualification");
    expect(template).toContain("npm/tsx entrypoint is intentionally unsupported");
    expect(template).toContain("This template does not authorize deployment");
    expect(template).toContain("one diagnostic rerun never changes the original result");
    expect(template).toMatch(/sanitized artifact inventory/i);
    expect(template).not.toMatch(/\{\{(?:developer|username|hostname|email|password|secret|token|authorization)[^}]*\}\}/i);
  });
});
