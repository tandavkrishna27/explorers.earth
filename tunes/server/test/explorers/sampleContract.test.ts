import {describe, expect, it} from "vitest";
import {sampleCountryToFixtureSet, sampleKeySchema, sampleFixtureVersionSchema} from "../../../shared/explorersSampleContract";
describe("sample contract (SMP-07/08)", () => {
  it("keys samples by category and slug", () => {
    expect(sampleKeySchema.safeParse("places/goa-beaches").success).toBe(true);
    expect(sampleKeySchema.safeParse("Places/goa").success).toBe(false);
    expect(sampleKeySchema.safeParse("music/x").success).toBe(false);
  });
  it("picks India for IN, IND, India or Bharat", () => {
    expect(sampleCountryToFixtureSet("IN")).toBe("india");
    expect(sampleCountryToFixtureSet("in")).toBe("india");
    expect(sampleCountryToFixtureSet(" India ")).toBe("india");
    expect(sampleCountryToFixtureSet("Bharat")).toBe("india");
    expect(sampleCountryToFixtureSet("PT")).toBe("global");
    expect(sampleCountryToFixtureSet(null)).toBe("global");
  });
  it("versions fixtures as vN", () => expect(sampleFixtureVersionSchema.safeParse("v1").success).toBe(true));
});
