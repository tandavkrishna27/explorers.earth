import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("loader owners", () => {
  it("has no generic Loader wrapper or route-change globe", () => {
    expect(existsSync(resolve(__dirname, "../components/Loader.tsx"))).toBe(false);
    expect(existsSync(resolve(__dirname, "../components/RouteLoader.tsx"))).toBe(false);
  });
});
