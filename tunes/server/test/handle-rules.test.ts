import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED_HANDLES, handleRuleViolations, isReservedHandle } from "../../shared/explorersReservedHandles";
import { HANDLE_RULE_CASES } from "../../shared/explorersHandleRuleCases";
import { PublicContentService } from "../application/publicContent";

describe("shared handle rules", () => {
  it.each(HANDLE_RULE_CASES)("%s -> acceptable=%s", (input, ok) => {
    expect(handleRuleViolations(input).length === 0).toBe(ok);
  });

  it("reserves every top-level nginx and Express path segment", () => {
    const conf = readFileSync(resolve(__dirname, "../../../deploy/nginx/explorers.conf"), "utf8");
    const segments = new Set<string>();
    for (const m of conf.matchAll(/location\s+(?:=|\^~)?\s*\/([^\s/{]*)/g)) if (m[1]) segments.add(m[1].toLowerCase());
    expect(segments.size).toBeGreaterThan(5);
    const gaps = [...segments].filter((s) => /^[a-z][a-z0-9-]{2,29}$/.test(s) && !isReservedHandle(s));
    expect(gaps).toEqual([]);
    for (const s of ["api", "health", "media", "socket.io", "assets", "graphql", "api-docs", "robots", "sitemap"]) {
      expect(RESERVED_HANDLES).toContain(s);
    }
  });

  it("availability endpoint refuses reserved and malformed handles without touching the database", async () => {
    const pool = { query: async () => { throw new Error("must not query"); } };
    const svc = new PublicContentService(pool as never, "test-secret");
    for (const h of ["about", "ADMIN", "alpha", "ab--c"]) expect(await svc.handleAvailable({ handle: h })).toEqual({ available: false });
  });
});
