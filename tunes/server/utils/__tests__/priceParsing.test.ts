import { describe, it, expect } from "vitest";
import {
  parsePriceString,
  currencyFromSymbol,
  currencyFromHostname,
  resolveCurrency,
  selectBestPrice,
  type PriceCandidate,
} from "../priceParsing";

describe("parsePriceString — locale-aware price parsing (BUG-6)", () => {
  it("parses US thousands + decimal", () => {
    expect(parsePriceString("$1,299.00")).toBe(1299);
    expect(parsePriceString("399.00")).toBe(399);
    expect(parsePriceString("$1,234,567.89")).toBe(1234567.89);
  });

  it("parses EU thousands + decimal (comma decimal)", () => {
    expect(parsePriceString("1.299,00")).toBe(1299);
    expect(parsePriceString("29.990,50")).toBe(29990.5);
    expect(parsePriceString("€349,99")).toBe(349.99);
  });

  it("parses bare short decimals without treating them as thousands", () => {
    // The exact failing shape from the report: an installment figure like 16.7
    // must parse to 16.7, NOT 167.
    expect(parsePriceString("16.7")).toBe(16.7);
    expect(parsePriceString("16,7")).toBe(16.7);
    expect(parsePriceString("₹8.99")).toBe(8.99);
  });

  it("treats a lone 3-digit group as thousands, and whole numbers as-is", () => {
    expect(parsePriceString("1,234")).toBe(1234);
    expect(parsePriceString("1.234")).toBe(1234);
    expect(parsePriceString("1.234.567")).toBe(1234567);
    expect(parsePriceString("39900")).toBe(39900);
    expect(parsePriceString("₹29,990.00")).toBe(29990);
  });

  it("rejects non-numeric / zero / empty", () => {
    expect(parsePriceString("")).toBeNull();
    expect(parsePriceString(null)).toBeNull();
    expect(parsePriceString(undefined)).toBeNull();
    expect(parsePriceString("Price not available")).toBeNull();
    expect(parsePriceString("0")).toBeNull();
    expect(parsePriceString("$0.00")).toBeNull();
  });

  it("takes the first amount of a price range, not the concatenation", () => {
    expect(parsePriceString("$19.99 - $24.99")).toBe(19.99);
    expect(parsePriceString("€10,00 – €20,00")).toBe(10);
    expect(parsePriceString("₹499 to ₹999")).toBe(499);
  });

  it("normalizes Eastern-Arabic digits and separators", () => {
    // ١٬٢٩٩٫٠٠ = 1,299.00 (Arabic-Indic), ۳۹۹ = 399 (Persian)
    expect(parsePriceString("١٬٢٩٩٫٠٠")).toBe(1299);
    expect(parsePriceString("۳۹۹")).toBe(399);
  });
});

describe("currencyFromSymbol", () => {
  it("maps unambiguous symbols", () => {
    expect(currencyFromSymbol("₹")).toBe("INR");
    expect(currencyFromSymbol("€")).toBe("EUR");
    expect(currencyFromSymbol("£")).toBe("GBP");
    expect(currencyFromSymbol("¥")).toBe("JPY");
    expect(currencyFromSymbol("Rs.")).toBe("INR");
  });
  it("maps $ to USD (ambiguous, refined later)", () => {
    expect(currencyFromSymbol("$")).toBe("USD");
    expect(currencyFromSymbol("$399.00")).toBe("USD");
  });
  it("passes through KNOWN ISO codes and rejects junk", () => {
    expect(currencyFromSymbol("USD")).toBe("USD");
    expect(currencyFromSymbol("")).toBeNull();
    expect(currencyFromSymbol(null)).toBeNull();
    expect(currencyFromSymbol("399")).toBeNull();
    // "SALE 19.99" must NOT yield "SAL" — only validated ISO codes pass.
    expect(currencyFromSymbol("SALE 19.99")).toBeNull();
    expect(currencyFromSymbol("XYZ")).toBeNull();
  });
});

describe("currencyFromHostname", () => {
  it("maps Amazon TLDs to marketplace currency", () => {
    expect(currencyFromHostname("www.amazon.in")).toBe("INR");
    expect(currencyFromHostname("amazon.com")).toBe("USD");
    expect(currencyFromHostname("www.amazon.co.uk")).toBe("GBP");
    expect(currencyFromHostname("amazon.de")).toBe("EUR");
    expect(currencyFromHostname("amazon.ca")).toBe("CAD");
    expect(currencyFromHostname("smile.amazon.com")).toBe("USD");
    // Marketplaces added after codex review
    expect(currencyFromHostname("amazon.com.tr")).toBe("TRY");
    expect(currencyFromHostname("amazon.eg")).toBe("EGP");
    expect(currencyFromHostname("amazon.co.za")).toBe("ZAR");
    expect(currencyFromHostname("amazon.ie")).toBe("EUR");
  });
  it("returns null for unknown hosts", () => {
    expect(currencyFromHostname("example.com")).toBeNull();
  });
});

describe("resolveCurrency — symbol vs hostname precedence", () => {
  it("trusts an unambiguous symbol over the host", () => {
    expect(resolveCurrency("₹", "amazon.com")).toBe("INR");
    expect(resolveCurrency("€", "amazon.co.uk")).toBe("EUR");
  });
  it("defers to the host when the symbol is $ (ambiguous)", () => {
    expect(resolveCurrency("$", "amazon.ca")).toBe("CAD");
    expect(resolveCurrency("$399.00", "amazon.com")).toBe("USD");
  });
  it("trusts an explicit ISO code over the host (USD label on amazon.ca is USD)", () => {
    expect(resolveCurrency("USD", "amazon.ca")).toBe("USD");
    expect(resolveCurrency("USD 12.00", "amazon.ca")).toBe("USD");
    expect(resolveCurrency("EUR 9,99", "amazon.com")).toBe("EUR");
  });
  it("uses the host when no symbol is present", () => {
    expect(resolveCurrency(undefined, "amazon.co.uk")).toBe("GBP");
    expect(resolveCurrency("", "amazon.in")).toBe("INR");
  });
  it("falls back to the symbol when the host is unknown", () => {
    expect(resolveCurrency("$", "example.com")).toBe("USD");
    expect(resolveCurrency(undefined, "example.com")).toBeUndefined();
  });
});

describe("selectBestPrice — buy-box over installment (BUG-6 root cause)", () => {
  const hostname = "www.amazon.com";

  it("skips a rejected installment reading and picks the real buy-box price", () => {
    // Reproduces the Sony WH-1000XM5 bug: the first DOM price was the monthly
    // installment ($16.70), the buy-box price is $399.00.
    const candidates: PriceCandidate[] = [
      { raw: "$16.70", symbol: "$", source: ".a-price .a-offscreen", rejected: true },
      { raw: "$399.00", symbol: "$", source: "#corePrice_feature_div .a-price .a-offscreen", rejected: false },
    ];
    expect(selectBestPrice(candidates, hostname)).toEqual({ price: 399, currency: "USD" });
  });

  it("prefers the first NON-rejected candidate in order", () => {
    const candidates: PriceCandidate[] = [
      { raw: "$449.00", symbol: "$", source: "#corePrice_feature_div .a-price .a-offscreen", rejected: false },
      { raw: "$399.00", symbol: "$", source: ".a-price .a-offscreen", rejected: false },
    ];
    expect(selectBestPrice(candidates, hostname).price).toBe(449);
  });

  it("NEVER selects a rejected candidate — returns no price so the caller falls back", () => {
    // Only a struck-through list price is parseable; promoting it would repeat
    // the BUG-6 mistake. selectBestPrice must yield {} and let JSON-LD/the client
    // handle the missing price.
    const candidates: PriceCandidate[] = [
      { raw: "Currently unavailable", source: "#corePrice_feature_div", rejected: false },
      { raw: "₹29,990.00", symbol: "₹", source: ".a-text-price", rejected: true },
    ];
    expect(selectBestPrice(candidates, "www.amazon.in")).toEqual({});
  });

  it("derives currency from hostname when the candidate has no symbol", () => {
    const candidates: PriceCandidate[] = [
      { raw: "1.299,00", source: "#corePrice_feature_div .a-price .a-offscreen", rejected: false },
    ];
    expect(selectBestPrice(candidates, "www.amazon.de")).toEqual({ price: 1299, currency: "EUR" });
  });

  it("returns {} for empty / all-unparseable input", () => {
    expect(selectBestPrice([], hostname)).toEqual({});
    expect(selectBestPrice(undefined, hostname)).toEqual({});
    expect(selectBestPrice([{ raw: "N/A" }], hostname)).toEqual({});
  });
});
