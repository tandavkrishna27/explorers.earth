import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// PublicGuides is too entangled with routing/Apollo to mount cheaply; the invented
// "★ 5.0" came from a literal fallback, so guard the source against it returning.
describe("PublicGuides ratings", () => {
  const source = readFileSync(resolve(__dirname, "../PublicGuides.tsx"), "utf8");
  it("never invents a 5.0 rating when none exists", () => {
    expect(source).not.toMatch(/:\s*5\.0\s*;/);
    expect(source.match(/rating !== null &&/g)?.length).toBe(2);
  });
});
