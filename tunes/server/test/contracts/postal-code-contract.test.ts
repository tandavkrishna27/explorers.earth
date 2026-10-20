import { describe, expect, it } from "vitest";
import { isValidPostalCode, newInvalidPostalCodes, updateAccountRequestSchema } from "../../../shared/explorersContract";

const parse = (address: Record<string, unknown>) =>
  updateAccountRequestSchema.safeParse({ expectedRevision: 1, additionalAddresses: [address], primaryAddress: address });

describe("postal code in the account contract", () => {
  it.each(["560001", "SW1A 1AA", "K1A 0B1", "100-0001", "1012 AB", "D02 X285", "75008", "Ä1234", "AB"])("accepts the international format %s", (postalCode) => {
    expect(isValidPostalCode(postalCode)).toBe(true);
    expect(parse({ postalCode }).success).toBe(true);
  });
  it("trims, and lets the field be cleared", () => {
    const parsed = parse({ postalCode: "  560001  " });
    expect(parsed.success && parsed.data.additionalAddresses?.[0]?.postalCode).toBe("560001");
    expect(parse({ postalCode: "" }).success).toBe(true);
    expect(parse({ postalCode: "12.34" }).success).toBe(true);
  });
  it.each(["1", "12345678901", "<b>12</b>", "12_34", "12.34", "--", "12345\n67", "٭٭٭"])("refuses %j as a new value", (postalCode) => {
    expect(isValidPostalCode(postalCode)).toBe(false);
    expect(newInvalidPostalCodes({ additionalAddresses: [{ postalCode }] }, {})).toEqual([postalCode.trim()]);
  });
  it("accepts an unchanged stored legacy value but not a change to a bad one", () => {
    const stored = { additionalAddresses: [{ postalCode: "12.34" }] };
    expect(newInvalidPostalCodes({ additionalAddresses: [{ postalCode: "12.34" }] }, stored)).toEqual([]);
    expect(newInvalidPostalCodes({ additionalAddresses: [{ postalCode: "12.35" }] }, stored)).toEqual(["12.35"]);
  });
  it("does not constrain the other address fields or how older rows are read", () => {
    expect(parse({ city: "Anywhere, 12345-6789 (north)" }).success).toBe(true);
  });
});
