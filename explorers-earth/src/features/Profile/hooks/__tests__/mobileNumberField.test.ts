import { describe, it, expect } from "vitest";
import { mobileNumberField } from "../mobileNumberField";

describe("mobileNumberField (profile save guard)", () => {
  it("omits mobile_number for empty/whitespace/undefined so a stored number is never wiped", () => {
    expect(mobileNumberField("")).toEqual({});
    expect(mobileNumberField("   ")).toEqual({});
    expect(mobileNumberField(undefined)).toEqual({});
  });

  it("includes mobile_number when a real value is present", () => {
    expect(mobileNumberField("+919876543210")).toEqual({
      mobile_number: "+919876543210",
    });
  });

  it("spreading the empty result adds no mobile_number key to the payload", () => {
    const payload = { Account_Name: "Bhavya", ...mobileNumberField("") };
    expect("mobile_number" in payload).toBe(false);
  });
});
