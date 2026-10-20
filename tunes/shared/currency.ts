/**
 * The single currency definition for both apps: ISO 4217 alphabetic codes and their
 * minor-unit digits.
 *
 * Why a checked-in table and not Intl. Intl.supportedValuesOf('currency') and
 * Intl.NumberFormat(...).resolvedOptions() report CLDR's digits, which differ from ISO
 * 4217 for several codes (CLDR formats IQD, LBP, IRR, YER, AFN, ALL, SYP, SOS and MMK
 * with no decimals; ISO gives IQD three and the rest two) and which also move with the
 * host's ICU build. A validation gate built on that would accept or reject the same price
 * differently on Node 24, an older Node and each browser. The server is the authority and
 * must be deterministic, so the table is pinned here, the SPA formats with these digits,
 * and a test pins that every code is still understood by Intl so a typo cannot hide.
 *
 * Intl is still used where it is good at the job: the symbol and layout (Intl.NumberFormat)
 * and the localised names (Intl.DisplayNames). Neither decides what is valid.
 *
 * Scope: every ISO 4217 code that prices goods. Left out on purpose: precious metals
 * (XAU XAG XPD XPT), the testing and no-currency codes (XTS XXX), bond-market units
 * (XBA XBB XBC XBD), XSU, XUA and XDR (no minor unit), and the fund codes (BOV CHE CHW
 * CLF COU MXV USN UYI UYW), none of which is something a person lists a price in.
 * Adding one is a one-line change here.
 *
 * Dependency-free on purpose: the server, the SPA and the tests all import it.
 */
export const CURRENCY_METADATA_VERSION = 'iso-4217/active-v1' as const;

const ZERO = ['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];
const THREE = ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'];
const TWO = [
  'AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN',
  'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB',
  'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IRR',
  'JMD', 'KES', 'KGS', 'KHR', 'KPW', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT',
  'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'PAB', 'PEN', 'PGK', 'PHP',
  'PKR', 'PLN', 'QAR', 'RON', 'RSD', 'RUB', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN',
  'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'USD', 'UYU', 'UZS', 'VED', 'VES', 'WST',
  'XCD', 'XCG', 'YER', 'ZAR', 'ZMW', 'ZWG',
];

const build = (groups: ReadonlyArray<readonly [number, readonly string[]]>) => {
  const table: Record<string, number> = {};
  for (const [digits, codes] of groups) for (const code of codes) table[code] = digits;
  return Object.freeze(table) as Readonly<Record<string, number>>;
};

/** Active codes and their ISO 4217 minor-unit digits. The set a picker offers. */
export const CURRENCY_MINOR_UNITS = build([[0, ZERO], [2, TWO], [3, THREE]]);

/**
 * Codes ISO has withdrawn (the euro changeover, redenominations). They are not offered in
 * a picker, but a price stored in one before it was withdrawn is still a real price: reading
 * it must neither fail nor guess a different currency, and saving an unrelated edit to the
 * same record must not be blocked by it. So they are known (see isKnownCurrency), just not
 * active.
 */
export const RETIRED_CURRENCY_MINOR_UNITS = build([[2, ['ANG', 'BGN', 'CUC', 'HRK', 'MRO', 'SLL', 'STD', 'VEF', 'ZWL']], [0, ['BYR']]]);

export const CURRENCY_CODES = Object.freeze(Object.keys(CURRENCY_MINOR_UNITS).sort()) as readonly string[];

const has = (table: Readonly<Record<string, number>>, code: string) => Object.prototype.hasOwnProperty.call(table, code);

/** True for a code that is currently in ISO 4217. */
export const isActiveCurrency = (code: unknown): code is string => typeof code === 'string' && has(CURRENCY_MINOR_UNITS, code);

/** True for any code this table can speak for, active or retired: the set a write accepts. */
export const isKnownCurrency = (code: unknown): code is string =>
  isActiveCurrency(code) || (typeof code === 'string' && has(RETIRED_CURRENCY_MINOR_UNITS, code));

/** The code's minor units, or undefined when the table has no authority for it. */
export const minorUnitsOf = (code: string): number | undefined =>
  has(CURRENCY_MINOR_UNITS, code) ? CURRENCY_MINOR_UNITS[code] : has(RETIRED_CURRENCY_MINOR_UNITS, code) ? RETIRED_CURRENCY_MINOR_UNITS[code] : undefined;

/** Number of digits after the decimal point in an exact decimal string. */
export const decimalScale = (amount: string): number => {
  const at = amount.indexOf('.');
  return at < 0 ? 0 : amount.length - at - 1;
};

/**
 * Why `amount` cannot be a price in `code`, or null when it can. One sentence a person can
 * act on, shared by the server's refusal and the form's inline message.
 */
export function amountPrecisionProblem(amount: string, code: string): string | null {
  const units = minorUnitsOf(code);
  if (units === undefined || decimalScale(amount) <= units) return null;
  return units === 0
    ? `${code} has no decimal places; enter a whole amount.`
    : `${code} allows at most ${units} decimal place${units === 1 ? '' : 's'}.`;
}
