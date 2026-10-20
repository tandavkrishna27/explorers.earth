import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CURRENCY_CODES, CURRENCY_MINOR_UNITS, RETIRED_CURRENCY_MINOR_UNITS, amountPrecisionProblem, decimalScale, isActiveCurrency,
  isKnownCurrency, minorUnitsOf,
} from "../../../shared/currency";
import { canonicalAmount, productOfferSchema, productOfferWriteSchema } from "../../../shared/explorersProductContract";
import {
  guideBudgetPlaceSchema, guideCollectionDetailsSchema, guideEmptySectionBlocks, writeGuideSectionSchema,
} from "../../../shared/explorersGuideContract";
import { RecommendationFailure } from "../../repositories/explorersRecommendationRepository";
import { parseContent } from "../../application/recommendations";
import { createRecommendationSchema } from "../../../shared/explorersContract";

/**
 * One currency definition for the whole product: every active ISO 4217 code, each with
 * its own minor units, enforced by the server for every price and money amount.
 */
describe("currency table", () => {
  it("holds the ISO 4217 minor units, three-letter uppercase, with no duplicates", () => {
    expect(CURRENCY_CODES.length).toBeGreaterThan(140);
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
    for (const code of CURRENCY_CODES) {
      expect(code).toMatch(/^[A-Z]{3}$/);
      expect([0, 2, 3]).toContain(CURRENCY_MINOR_UNITS[code]);
    }
  });

  it.each([
    ["USD", 2], ["EUR", 2], ["INR", 2], ["GBP", 2], ["CHF", 2],
    ["JPY", 0], ["KRW", 0], ["VND", 0], ["ISK", 0], ["UGX", 0], ["CLP", 0], ["XOF", 0], ["XAF", 0], ["XPF", 0],
    ["KWD", 3], ["BHD", 3], ["OMR", 3], ["JOD", 3], ["TND", 3], ["LYD", 3], ["IQD", 3],
    // CLDR formats these without decimals; ISO 4217 says two. The server follows ISO.
    ["LBP", 2], ["IRR", 2], ["YER", 2], ["AFN", 2],
  ])("%s has %i minor units", (code, units) => {
    expect(minorUnitsOf(code)).toBe(units);
  });

  it("covers every currency the browser's Intl data lists as a country currency, apart from the ones left out on purpose", () => {
    // The table is pinned, not derived (the host's ICU build must not decide validity), but
    // this keeps it honest: a new Intl currency we never classified fails here.
    const leftOut = new Set([
      "XAU", "XAG", "XPD", "XPT", "XTS", "XXX", "XBA", "XBB", "XBC", "XBD", "XSU", "XUA", "XDR",
      "BOV", "CHE", "CHW", "CLF", "COU", "MXV", "USN", "UYI", "UYW",
    ]);
    const unclassified = Intl.supportedValuesOf("currency").filter((code) => !isKnownCurrency(code) && !leftOut.has(code));
    expect(unclassified).toEqual([]);
  });

  it("is understood by Intl.NumberFormat on this runtime for every active code", () => {
    for (const code of CURRENCY_CODES)
      expect(() => new Intl.NumberFormat("en", { style: "currency", currency: code }).format(1), code).not.toThrow();
  });

  it("keeps active and withdrawn codes apart, and accepts both as known", () => {
    expect(isActiveCurrency("HRK")).toBe(false);
    expect(isKnownCurrency("HRK")).toBe(true);
    expect(Object.keys(RETIRED_CURRENCY_MINOR_UNITS).some((code) => isActiveCurrency(code))).toBe(false);
    for (const bad of ["usd", "US", "USDX", "XXX", "XAU", "", null, undefined, 5]) expect(isKnownCurrency(bad)).toBe(false);
    expect(isKnownCurrency("toString")).toBe(false);
    expect(isKnownCurrency("__proto__")).toBe(false);
  });

  it("keeps the read-only data audit's code list equal to the table", () => {
    const sql = readFileSync(new URL("../../../scripts/money-data-audit.sql", import.meta.url), "utf8");
    const listed = /\\set active_codes '([^']+)'/.exec(sql)?.[1].split(",");
    expect(listed).toEqual([...CURRENCY_CODES]);
  });

  it("counts decimals exactly", () => {
    expect(decimalScale("19")).toBe(0);
    expect(decimalScale("19.90")).toBe(2);
    expect(decimalScale("1.250")).toBe(3);
    expect(amountPrecisionProblem("100.50", "JPY")).toMatch(/JPY has no decimal places/);
    expect(amountPrecisionProblem("1.2505", "KWD")).toMatch(/at most 3 decimal places/);
    expect(amountPrecisionProblem("1.250", "KWD")).toBeNull();
    expect(amountPrecisionProblem("5.123", "XYZ")).toBeNull();
  });
});

const offer = (price: string | null, currencyCode: string | null) => ({ price, currencyCode, buyUrl: null });
const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) => result.error?.issues.map((issue) => issue.message) ?? [];

describe("product offer write validation", () => {
  // The precision each currency enforces, as {code, accepted amounts, refused amounts}.
  const cases: Array<[string, string[], string[]]> = [
    ["USD", ["19", "19.9", "19.90", "0", "0.00"], ["19.999", "19.901"]],
    ["JPY", ["100", "0", "1500"], ["100.5", "100.50", "0.00"]],
    ["KWD", ["1", "1.25", "1.250"], ["1.2501"]],
    ["BHD", ["12.345"], ["12.3456"]],
    ["CLP", ["990"], ["990.1"]],
    ["INR", ["79.99"], ["79.999"]],
    ["EUR", ["0.01"], ["0.001"]],
    ["ISK", ["1000"], ["1000.00"]],
    ["VND", ["25000"], ["25000.5"]],
  ];
  it.each(cases)("%s enforces its own precision", (code, accepted, refused) => {
    for (const price of accepted) expect(productOfferWriteSchema.safeParse(offer(price, code)).success, `${code} ${price}`).toBe(true);
    for (const price of refused) expect(productOfferWriteSchema.safeParse(offer(price, code)).success, `${code} ${price}`).toBe(false);
  });

  it("accepts every active currency with a whole amount, and the right number of decimals", () => {
    for (const code of CURRENCY_CODES) {
      const units = CURRENCY_MINOR_UNITS[code];
      expect(productOfferWriteSchema.safeParse(offer("5", code)).success, code).toBe(true);
      const exact = units === 0 ? "5" : `5.${"1".repeat(units)}`;
      expect(productOfferWriteSchema.safeParse(offer(exact, code)).success, `${code} ${exact}`).toBe(true);
      expect(productOfferWriteSchema.safeParse(offer(`5.${"1".repeat(units + 1)}`, code)).success, `${code} +1`).toBe(false);
    }
  });

  it("refuses a code that is not an ISO 4217 currency, with a clear message", () => {
    for (const bad of ["ZZZ", "usd", "US", "DOLLAR", "$", "XAU", "XXX"]) {
      const result = productOfferWriteSchema.safeParse(offer("5", bad));
      expect(result.success, bad).toBe(false);
      expect(messages(result)).toContain("Unsupported currency code");
    }
  });

  it("refuses a price without a currency, and a currency without a price", () => {
    expect(messages(productOfferWriteSchema.safeParse(offer("19.90", null)))).toEqual(["Choose a currency for the price"]);
    expect(messages(productOfferWriteSchema.safeParse(offer(null, "USD")))).toEqual(["Enter a price for the currency, or clear the currency"]);
    // Neither is fine: unknown price, unknown currency.
    expect(productOfferWriteSchema.safeParse(offer(null, null)).success).toBe(true);
    // Zero is a price, so it still needs its currency.
    expect(productOfferWriteSchema.safeParse(offer("0", null)).success).toBe(false);
    expect(productOfferWriteSchema.safeParse(offer("0", "USD")).success).toBe(true);
  });

  it("gives the precision message the owner can act on", () => {
    expect(messages(productOfferWriteSchema.safeParse(offer("100.50", "JPY")))).toEqual(["JPY has no decimal places; enter a whole amount."]);
    expect(messages(productOfferWriteSchema.safeParse(offer("1.2345", "KWD")))).toEqual(["KWD allows at most 3 decimal places."]);
  });

  it("keeps a withdrawn code writable, so an unrelated edit to an old product is not blocked", () => {
    expect(productOfferWriteSchema.safeParse(offer("100.00", "HRK")).success).toBe(true);
  });
});

describe("product offer read leniency", () => {
  it("still reads prices stored before a currency was required", () => {
    expect(productOfferSchema.parse(offer("19.90", null))).toEqual(offer("19.90", null));
    expect(productOfferSchema.parse(offer("0", null))).toEqual(offer("0", null));
  });
  it("reads a stored code outside today's table without failing or guessing another", () => {
    expect(productOfferSchema.parse(offer("12.5", "XYZ")).currencyCode).toBe("XYZ");
    expect(productOfferSchema.parse(offer("12.5", "HRK")).currencyCode).toBe("HRK");
  });
  it("still refuses an impossible precision for a known currency", () => {
    expect(productOfferSchema.safeParse(offer("100.50", "JPY")).success).toBe(false);
  });
  it("renders stored numeric(20,6) text in the currency's own digits", () => {
    expect(canonicalAmount("19.900000", "USD")).toBe("19.90");
    expect(canonicalAmount("1.250000", "KWD")).toBe("1.250");
    expect(canonicalAmount("1.500000", "KWD")).toBe("1.500");
    expect(canonicalAmount("100.000000", "JPY")).toBe("100");
    expect(canonicalAmount("0.000000", "USD")).toBe("0.00");
    expect(canonicalAmount("0.000000", "JPY")).toBe("0");
    expect(canonicalAmount("19.900000", null)).toBe("19.9");
    expect(canonicalAmount("5.120000", "XYZ")).toBe("5.12");
    expect(() => canonicalAmount("100.500000", "JPY")).toThrow();
  });
});

describe("the HTTP boundary", () => {
  const base = {
    category: "products", entityId: "00000000-0000-4000-8000-000000000001", collectionId: "00000000-0000-4000-8000-000000000002",
    expectedCollectionRevision: 1,
  };
  it("names the problem for a price the owner can fix", () => {
    const attempt = (productOffer: unknown) => () => parseContent(createRecommendationSchema, { ...base, productOffer });
    expect(attempt(offer("100.50", "JPY"))).toThrowError(new RecommendationFailure(422, "JPY has no decimal places; enter a whole amount."));
    expect(attempt(offer("19.90", null))).toThrowError(new RecommendationFailure(422, "Choose a currency for the price"));
    expect(attempt(offer("19.90", "ZZZ"))).toThrowError(new RecommendationFailure(422, "Unsupported currency code"));
    expect(attempt(offer("19.90", "USD"))).not.toThrow();
    expect(attempt(offer("1.250", "KWD"))).not.toThrow();
  });
  it("does not echo schema detail for fields that are not money", () => {
    expect(() => parseContent(createRecommendationSchema, { ...base, entityId: "nope" })).toThrowError(new RecommendationFailure(422, "Invalid content fields"));
  });
});

const budgetPlace = (budgetAmount: string | null, budgetCurrency: string | null) => ({
  localId: "m1", placeId: "ChIJ1", name: "Cafe", priceLevel: null, priceRange: null, customBudget: null, budgetAmount, budgetCurrency,
});

describe("guide money", () => {
  it("enforces the currency's precision on a place budget", () => {
    expect(guideBudgetPlaceSchema.safeParse(budgetPlace("100", "JPY")).success).toBe(true);
    expect(guideBudgetPlaceSchema.safeParse(budgetPlace("100.00", "JPY")).success).toBe(false);
    expect(guideBudgetPlaceSchema.safeParse(budgetPlace("1.250", "KWD")).success).toBe(true);
    expect(guideBudgetPlaceSchema.safeParse(budgetPlace("1.2500", "KWD")).success).toBe(false);
    expect(guideBudgetPlaceSchema.safeParse(budgetPlace("12.50", "USD")).success).toBe(true);
    expect(guideBudgetPlaceSchema.safeParse(budgetPlace("12.505", "USD")).success).toBe(false);
    expect(guideBudgetPlaceSchema.safeParse(budgetPlace("0", "USD")).success).toBe(true);
  });

  it("still requires the amount and currency together", () => {
    expect(guideBudgetPlaceSchema.safeParse(budgetPlace("10", null)).success).toBe(false);
    expect(guideBudgetPlaceSchema.safeParse(budgetPlace(null, "USD")).success).toBe(false);
  });

  const details = (estimatedBudget: string | null, budgetCurrency: string | null) => ({
    guideType: null, multiCity: false, numberOfDays: null, estimatedBudget, budgetCurrency, budgetType: null,
    bestTimeToVisit: [], categories: [], tags: [], tipsNotes: null,
    place: { name: "x", types: [], formattedAddress: null, geometry: null, placeId: null },
    locationEntityId: null,
  });
  it("holds the guide estimate to two places, because the column is numeric(14,2)", () => {
    const result = guideCollectionDetailsSchema.safeParse(details("1.250", "KWD"));
    expect(result.success).toBe(false);
    expect(messages(result as never).join(" ")).toMatch(/at most 2 decimal places|estimated budget/);
    expect(messages(guideCollectionDetailsSchema.safeParse(details("100.50", "JPY")) as never)).toContain("JPY has no decimal places; enter a whole amount.");
  });

  const tripPlace = (budgetCurrency: string) => ({
    localId: "m1", placeId: "ChIJ1", name: "Cafe", formattedAddress: null, geometry: null, types: [], tips: null, photos: [],
    priceLevel: null, priceRange: null, customBudget: null, budgetAmount: "5", budgetCurrency, source: "manual" as const, verified: false,
  });
  const section = (budgetCurrency: string) => ({
    revision: 1, title: "Day 1", description: null,
    blocks: {
      ...guideEmptySectionBlocks,
      timeline: { morning: [tripPlace(budgetCurrency)], afternoon: [], evening: [] },
      budget: { morning: [budgetPlace("5", budgetCurrency)], afternoon: [], evening: [] },
    },
  });
  it("lets a stored guide with an unlisted code be read, but a new write must name a real currency", () => {
    expect(guideBudgetPlaceSchema.safeParse(budgetPlace("5", "XYZ")).success).toBe(true);
    expect(guideBudgetPlaceSchema.safeParse(budgetPlace("5", "usd")).success).toBe(false);
    expect(writeGuideSectionSchema.safeParse(section("USD")).success).toBe(true);
    expect(writeGuideSectionSchema.safeParse(section("KWD")).success).toBe(true);
    expect(writeGuideSectionSchema.safeParse(section("HRK")).success).toBe(true);
    const refused = writeGuideSectionSchema.safeParse(section("XYZ"));
    expect(refused.success).toBe(false);
    expect(messages(refused as never)).toContain("XYZ is not a supported currency");
  });
});
