import { describe, expect, it } from "vitest";
import { isValidPostalCode, updateAccountRequestSchema } from "../../../shared/explorersContract";

const parse = (address: Record<string, unknown>) =>
  updateAccountRequestSchema.safeParse({ expectedRevision: 1, additionalAddresses: [address], primaryAddress: address });

describe("postal code in the account contract", () => {
  it.each(["560001", "SW1A 1AA", "K1A 0B1", "100-0001", "1012 AB", "D02 X285", "75008", "Ä1234", "AB"])("accepts the international format %s", (postalCode) => {
    expect(isValidPostalCode(postalCode)).toBe(true);
    expect(parse({ postalCode }).success).toBe(true);
  });
  it("trims before checking, and lets the field be cleared", () => {
    const parsed = parse({ postalCode: "  560001  " });
    expect(parsed.success && parsed.data.additionalAddresses?.[0]?.postalCode).toBe("560001");
    expect(parse({ postalCode: "" }).success).toBe(true);
  });
  it.each(["1", "12345678901", "<b>12</b>", "12_34", "12.34", "--", "12345\n67", "٭٭٭"])("refuses %j", (postalCode) => {
    expect(isValidPostalCode(postalCode)).toBe(false);
    expect(parse({ postalCode }).success).toBe(false);
  });
  it("does not constrain the other address fields or how older rows are read", () => {
    expect(parse({ city: "Anywhere, 12345-6789 (north)" }).success).toBe(true);
  });
});
