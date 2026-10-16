/**
 * Locale-aware price and currency parsing.
 *
 * Extracted from the retired Amazon scraper (server/utils/scrapeUtils.ts). The scraping
 * itself is gone: its endpoints are tombstoned in policies/musicRetirementPolicy.ts, no
 * route reached it, and reviving it is forbidden by epic-04 and epic-07. These functions
 * are kept because they are pure, they are the BUG-6 regression suite's subject, and the
 * behaviour they encode - US versus EU thousands/decimal conventions, Arabic-Indic
 * numerals, price ranges and symbol/TLD currency resolution - is still needed wherever a
 * price string is read. epic-08 requires keeping useful tests rather than deleting the
 * code they cover.
 */
export interface PriceCandidate {
  raw: string;
  symbol?: string;
  source?: string;
  rejected?: boolean;
}

/**
 * Parse a price string into a number, tolerant of BOTH US ("1,299.00") and
 * EU ("1.299,00") thousands/decimal conventions, plus bare values ("16.7",
 * "39900") and currency-symbol prefixes ("₹29,990.00"). Returns null for
 * anything that isn't a positive finite number.
 */
export function parsePriceString(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // Normalize Eastern-Arabic / Persian digits and their locale separators to
  // ASCII so amazon.sa/.eg listings parse (١٬٢٩٩٫٠٠ → 1,299.00).
  let text = raw.replace(/[٠-٩۰-۹]/g, (d) =>
    String((d.charCodeAt(0) & 0xf))
  ).replace(/[٫٬]/g, (s) => (s === "٫" ? "." : ","));
  // A price range ("$19.99 - $24.99") must not be concatenated into one number —
  // take the first amount only.
  text = text.split(/\s*(?:-|–|—|to)\s+/i)[0];
  const cleaned = text.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  let normalized: string;
  if (lastDot === -1 && lastComma === -1) {
    normalized = cleaned;
  } else {
    const decimalPos = Math.max(lastDot, lastComma);
    const decimalChar = cleaned[decimalPos];
    const decimals = cleaned.length - decimalPos - 1;
    const bothPresent = lastDot !== -1 && lastComma !== -1;
    const occurrences = cleaned.split(decimalChar).length - 1;
    // The rightmost separator is a DECIMAL point when either both separator
    // kinds are present (US "1,299.00" / EU "1.299,00"), or it occurs once and
    // is followed by 1-2 digits ("16.7", "1299,00"). Otherwise every separator
    // is a thousands grouping ("1,234", "1.234.567") and gets stripped.
    const isDecimal = bothPresent || (occurrences === 1 && decimals >= 1 && decimals <= 2);
    if (isDecimal) {
      const intPart = cleaned.slice(0, decimalPos).replace(/[.,]/g, "");
      const fracPart = cleaned.slice(decimalPos + 1).replace(/[.,]/g, "");
      normalized = `${intPart}.${fracPart}`;
    } else {
      normalized = cleaned.replace(/[.,]/g, "");
    }
  }

  const value = parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// ISO 4217 codes we actively recognize (the Amazon marketplaces below + a few
// common ones). Used to validate explicit codes so junk like "SAL" (from "SALE")
// is not mistaken for a currency.
const KNOWN_ISO = new Set([
  "USD", "CAD", "AUD", "EUR", "GBP", "INR", "JPY", "BRL", "MXN",
  "AED", "SAR", "SGD", "SEK", "PLN", "TRY", "EGP", "ZAR",
]);

/** Map a currency symbol (or explicit ISO code) to an ISO 4217 code. A bare "$"
 *  is ambiguous (USD/CAD/AUD/…) and resolves to USD here — refine with the
 *  hostname via resolveCurrency. An explicit, KNOWN ISO code wins over symbols. */
export function currencyFromSymbol(sym?: string | null): string | null {
  if (!sym) return null;
  const s = sym.trim();
  // Explicit ISO code (word-bounded, validated) — most authoritative.
  const iso = s.match(/\b([A-Z]{3})\b/);
  if (iso && KNOWN_ISO.has(iso[1])) return iso[1];
  if (s.includes("₹") || /\bRs\.?/i.test(s)) return "INR";
  if (s.includes("€")) return "EUR";
  if (s.includes("£")) return "GBP";
  if (s.includes("¥")) return "JPY";
  if (s.includes("$")) return "USD";
  return null;
}

const AMAZON_TLD_CURRENCY: Record<string, string> = {
  "amazon.in": "INR",
  "amazon.com": "USD",
  "amazon.co.uk": "GBP",
  "amazon.ca": "CAD",
  "amazon.com.au": "AUD",
  "amazon.de": "EUR",
  "amazon.fr": "EUR",
  "amazon.it": "EUR",
  "amazon.es": "EUR",
  "amazon.nl": "EUR",
  "amazon.co.jp": "JPY",
  "amazon.com.br": "BRL",
  "amazon.com.mx": "MXN",
  "amazon.ae": "AED",
  "amazon.sa": "SAR",
  "amazon.sg": "SGD",
  "amazon.se": "SEK",
  "amazon.pl": "PLN",
  "amazon.com.tr": "TRY",
  "amazon.eg": "EGP",
  "amazon.co.za": "ZAR",
  "amazon.com.be": "EUR",
  "amazon.ie": "EUR",
};

/** Derive the marketplace currency from an Amazon hostname (amazon.in → INR). */
export function currencyFromHostname(hostname: string): string | null {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  for (const [domain, cur] of Object.entries(AMAZON_TLD_CURRENCY)) {
    if (h === domain || h.endsWith("." + domain)) return cur;
  }
  return null;
}

/** Resolve the currency, preferring an unambiguous symbol (₹/€/£/¥) but
 *  deferring to the hostname when the symbol is "$" (ambiguous) or absent. */
export function resolveCurrency(symbol: string | undefined | null, hostname: string): string | undefined {
  // An explicit, validated ISO code (e.g. "USD"/"US$ 12"/"EUR 9,99") is
  // authoritative and beats the hostname — a US$ price on amazon.ca is USD.
  const explicitIso = symbol?.match(/\b([A-Z]{3})\b/);
  if (explicitIso && KNOWN_ISO.has(explicitIso[1])) return explicitIso[1];

  const fromSym = currencyFromSymbol(symbol);
  const fromHost = currencyFromHostname(hostname);
  if (fromSym && fromSym !== "USD") return fromSym; // ₹ € £ ¥ — unambiguous, trust it
  if (fromHost) return fromHost; // bare "$" or no symbol → let the marketplace decide
  return fromSym || undefined;
}

/**
 * Pick the real buy-box price from the raw candidates. Only NON-rejected
 * readings (i.e. NOT installment/EMI/list-price blocks) are eligible, tried in
 * DOM/selector order. Rejected candidates are NEVER selected — returning no
 * price (so the caller falls back to JSON-LD, and the client flags it) is safer
 * than promoting an installment figure to "the price".
 */
export function selectBestPrice(
  candidates: PriceCandidate[] | undefined,
  hostname: string
): { price?: number; currency?: string } {
  if (!candidates || candidates.length === 0) return {};
  for (const c of candidates) {
    if (c.rejected) continue;
    const price = parsePriceString(c.raw);
    if (price != null) {
      return { price, currency: resolveCurrency(c.symbol || c.raw, hostname) };
    }
  }
  return {};
}
