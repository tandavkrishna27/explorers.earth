import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PhoneInputWithCountry from "../PhoneInputWithCountry";

// Mock the country dropdown: expose a button that switches the country to US so
// we can drive handleCountryChange, and provide the `countries` export the
// component reads when parsing a stored value.
vi.mock("../CountryCodeDropdown", () => ({
  default: ({ onCountryChange }: { onCountryChange: (c: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onCountryChange({ code: "US", name: "United States", flag: "🇺🇸", callingCode: "+1" })
      }
    >
      change-country
    </button>
  ),
  countries: [
    { code: "IN", name: "India", flag: "🇮🇳", callingCode: "+91" },
    { code: "US", name: "United States", flag: "🇺🇸", callingCode: "+1" },
  ],
}));

const input = () => screen.getByPlaceholderText("Enter phone number") as HTMLInputElement;

describe("PhoneInputWithCountry", () => {
  it("renders a stored valid number as its national digits (not blank)", () => {
    render(<PhoneInputWithCountry value="+919876543210" onChange={vi.fn()} />);
    expect(input().value).toBe("9876543210");
  });

  it("still shows the digits for a stored value that does not fully parse (never blank)", () => {
    render(<PhoneInputWithCountry value="12345" onChange={vi.fn()} />);
    expect(input().value).toBe("12345");
  });

  it("emits the full E.164 number when the user types", () => {
    const onChange = vi.fn();
    render(<PhoneInputWithCountry value="" onChange={onChange} />);
    fireEvent.change(input(), { target: { value: "9998887777" } });
    expect(onChange).toHaveBeenCalledWith("+919998887777");
  });

  it("does NOT emit '' when the country changes while the field is empty (the wipe guard)", () => {
    const onChange = vi.fn();
    render(<PhoneInputWithCountry value="" onChange={onChange} />);
    fireEvent.click(screen.getByText("change-country"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("re-emits with the new calling code when the country changes and a number is present", () => {
    const onChange = vi.fn();
    render(<PhoneInputWithCountry value="+919876543210" onChange={onChange} />);
    onChange.mockClear();
    fireEvent.click(screen.getByText("change-country")); // IN -> US
    expect(onChange).toHaveBeenCalledWith("+19876543210");
  });
});
