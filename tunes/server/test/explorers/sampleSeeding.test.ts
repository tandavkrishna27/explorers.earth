// tunes/server/test/explorers/sampleSeeding.test.ts
import { describe, expect, it } from "vitest";
import { sampleCountryToFixtureSet } from "../../../shared/explorersSampleContract";
import { countryFromAccount, fixtureSetForCountry, normalizeSampleCountry } from "../../application/sampleSeeding";

describe("sample fixture set by onboarding country (SMP-07)", () => {
  it.each(["India", "india ", "IN", "IND", "Bharat", "भारत", "Republic of India"])("%s is India", (country) => {
    expect(normalizeSampleCountry(country)).toBe("IN");
    expect(fixtureSetForCountry(country)).toBe("india");
  });
  it.each(["France", "United States", "Indonesia", "", null, undefined])("%s is Global", (country) =>
    expect(fixtureSetForCountry(country)).toBe("global"));
  it("delegates the final mapping to S3's helper", () => {
    expect(sampleCountryToFixtureSet(normalizeSampleCountry("Bharat"))).toBe("india");
    expect(sampleCountryToFixtureSet(normalizeSampleCountry("FR"))).toBe("global");
  });
  it("reads the onboarding address first, then the primary address", () => {
    expect(countryFromAccount({ additionalAddresses: [{ country: "India" }], primaryAddress: { country: "France" } })).toBe("India");
    expect(countryFromAccount({ additionalAddresses: [{ country: "" }], primaryAddress: { country: "France" } })).toBe("France");
    expect(countryFromAccount({ additionalAddresses: [], primaryAddress: null })).toBeNull();
  });
});
