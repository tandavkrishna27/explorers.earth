import { describe, expect, it } from "vitest";
import { compareDiagnosticSets, normalizeTypeScriptDiagnostics } from "../../../scripts/music-typescript-baseline.ts";

describe("Music TypeScript diagnostic baseline", () => {
  it("normalizes complete diagnostics and ignores machine-specific path separators", () => {
    // Production break caught: CI cannot compare the complete baseline when a
    // multiline diagnostic or Windows path is counted differently on Ubuntu.
    const output = [
      "server\\routes.ts(10,2): error TS2322: Type 'string' is not assignable to type 'number'.",
      "  The expected type comes from property 'id'.",
      "client/src/app.tsx(2,1): error TS2304: Cannot find name 'missing'.",
    ].join("\n");

    expect(normalizeTypeScriptDiagnostics(output)).toEqual([
      "server/routes.ts(10,2): error TS2322: Type 'string' is not assignable to type 'number'. The expected type comes from property 'id'.",
      "client/src/app.tsx(2,1): error TS2304: Cannot find name 'missing'.",
    ]);
  });

  it("fails closed when a deliberate diagnostic is absent from the baseline", () => {
    // Production break caught: the baseline stores only counts, so a new type
    // failure can replace an old one without failing the regression gate.
    const comparison = compareDiagnosticSets(
      ["server/routes.ts(1,1): error TS2322: existing"],
      [
        "server/routes.ts(1,1): error TS2322: existing",
        "server/new-contract.ts(5,3): error TS2345: deliberate failure",
      ],
    );

    expect(comparison.newDiagnostics).toEqual([
      "server/new-contract.ts(5,3): error TS2345: deliberate failure",
    ]);
    expect(comparison.ok).toBe(false);
  });
});
