import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = resolve(__dirname, "../../..");

describe("guide details Back", () => {
  it("uses origin back with the Guides category fallback", () => {
    const text = readFileSync(resolve(src, "features/Guides/pages/GuideDetailsPage.tsx"), "utf8");
    expect(text).toContain("useOriginBack(");
    expect(text).toContain('to: "/recommendations/guides"');
    expect(text).not.toContain('navigate("/guides")');
  });
  it("the routed trip editor uses origin back with the Guides category fallback", () => {
    const text = readFileSync(resolve(src, "features/Guides/GuideEditor/GuideEditorPage.tsx"), "utf8");
    expect(text).toContain("useOriginBack(");
    expect(text).toContain("to: '/recommendations/guides'");
    expect(text).not.toContain("?.from?.pathname");
  });
});
