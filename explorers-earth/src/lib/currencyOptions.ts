import { CURRENCY_CODES, isActiveCurrency } from '../../../tunes/shared/currency';

export interface CurrencyOption {
  /** ISO 4217 code. */
  value: string;
  /** Name in the UI language, or the code when Intl has none. */
  name: string;
  /** Shown in the list and as the selected value: "EUR - Euro". */
  label: string;
  retired: boolean;
  /** Lower-cased code, localised name and English name, joined for matching. */
  haystack: string;
}

const displayNames = (locale: string, fallbackToCode = true): ((code: string) => string) => {
  try {
    const names = new Intl.DisplayNames([locale], { type: 'currency', fallback: fallbackToCode ? 'code' : 'none' });
    return (code) => names.of(code) ?? code;
  } catch {
    return (code) => code;
  }
};

const cache = new Map<string, readonly CurrencyOption[]>();

const option = (code: string, local: (code: string) => string, english: (code: string) => string, retired: boolean): CurrencyOption => {
  const name = local(code);
  return { value: code, name, label: `${code} – ${name}`, retired, haystack: `${code} ${name} ${english(code)}`.toLowerCase() };
};

/**
 * Every active ISO 4217 currency, named in `locale` via Intl.DisplayNames. Sorted by code
 * so the order does not depend on the language. `extra` adds a code that is not active but
 * is already saved on the record being edited (a withdrawn currency such as HRK), so the
 * picker can show what is stored instead of an empty box.
 */
export function currencyOptions(locale: string, extra?: string | null): CurrencyOption[] {
  let base = cache.get(locale);
  if (!base) {
    const local = displayNames(locale);
    const english = displayNames('en');
    base = Object.freeze(CURRENCY_CODES.map((code) => option(code, local, english, false)));
    cache.set(locale, base);
  }
  if (extra && !isActiveCurrency(extra) && /^[A-Z]{3}$/.test(extra)) {
    return [...base, option(extra, displayNames(locale), displayNames('en'), true)];
  }
  return [...base];
}

/** Match on the code, the localised name or the English name, ignoring case and accents. */
export const matchesCurrency = (candidate: CurrencyOption, input: string): boolean => {
  const needle = input.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!needle) return true;
  return candidate.haystack.normalize('NFD').replace(/\p{M}/gu, '').includes(needle);
};

// Region to the currency a person there most likely prices things in. A suggestion for a
// form's starting value, never a fallback: a locale with no region, or a region not listed
// here, gets no suggestion rather than a guess.
const REGION_CURRENCY: Record<string, string> = Object.fromEntries(
  (
    'AD:EUR AE:AED AF:AFN AG:XCD AI:XCD AL:ALL AM:AMD AO:AOA AR:ARS AS:USD AT:EUR AU:AUD AW:AWG AX:EUR AZ:AZN ' +
    'BA:BAM BB:BBD BD:BDT BE:EUR BF:XOF BG:EUR BH:BHD BI:BIF BJ:XOF BL:EUR BM:BMD BN:BND BO:BOB BQ:USD BR:BRL BS:BSD BT:BTN BW:BWP BY:BYN BZ:BZD ' +
    'CA:CAD CC:AUD CD:CDF CF:XAF CG:XAF CH:CHF CI:XOF CK:NZD CL:CLP CM:XAF CN:CNY CO:COP CR:CRC CU:CUP CV:CVE CW:XCG CX:AUD CY:EUR CZ:CZK ' +
    'DE:EUR DJ:DJF DK:DKK DM:XCD DO:DOP DZ:DZD EC:USD EE:EUR EG:EGP ER:ERN ES:EUR ET:ETB FI:EUR FJ:FJD FK:FKP FM:USD FO:DKK FR:EUR ' +
    'GA:XAF GB:GBP GD:XCD GE:GEL GF:EUR GG:GBP GH:GHS GI:GIP GL:DKK GM:GMD GN:GNF GP:EUR GQ:XAF GR:EUR GT:GTQ GU:USD GW:XOF GY:GYD ' +
    'HK:HKD HN:HNL HR:EUR HT:HTG HU:HUF ID:IDR IE:EUR IL:ILS IM:GBP IN:INR IO:USD IQ:IQD IR:IRR IS:ISK IT:EUR ' +
    'JE:GBP JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR KI:AUD KM:KMF KN:XCD KP:KPW KR:KRW KW:KWD KY:KYD KZ:KZT ' +
    'LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR LV:EUR LY:LYD ' +
    'MA:MAD MC:EUR MD:MDL ME:EUR MF:EUR MG:MGA MH:USD MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MP:USD MQ:EUR MR:MRU MS:XCD MT:EUR MU:MUR MV:MVR MW:MWK MX:MXN MY:MYR MZ:MZN ' +
    'NA:NAD NC:XPF NE:XOF NF:AUD NG:NGN NI:NIO NL:EUR NO:NOK NP:NPR NR:AUD NU:NZD NZ:NZD OM:OMR ' +
    'PA:PAB PE:PEN PF:XPF PG:PGK PH:PHP PK:PKR PL:PLN PM:EUR PN:NZD PR:USD PS:ILS PT:EUR PW:USD PY:PYG QA:QAR ' +
    'RE:EUR RO:RON RS:RSD RU:RUB RW:RWF SA:SAR SB:SBD SC:SCR SD:SDG SE:SEK SG:SGD SH:SHP SI:EUR SJ:NOK SK:EUR SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP ST:STN SV:USD SX:XCG SY:SYP SZ:SZL ' +
    'TC:USD TD:XAF TG:XOF TH:THB TJ:TJS TK:NZD TL:USD TM:TMT TN:TND TO:TOP TR:TRY TT:TTD TV:AUD TW:TWD TZ:TZS ' +
    'UA:UAH UG:UGX US:USD UY:UYU UZ:UZS VA:EUR VC:XCD VE:VES VG:USD VI:USD VN:VND VU:VUV WF:XPF WS:WST YE:YER YT:EUR ZA:ZAR ZM:ZMW ZW:ZWG'
  )
    .split(' ')
    .map((pair) => pair.split(':')),
);

/**
 * The currency suggested by the first locale that names a region ("de-AT" -> EUR, "pt-BR" ->
 * BRL, "en-IN" -> INR), or null. Only an explicit region counts: a bare language is not a
 * place ("en" is spoken in India, Nigeria and Canada), so it gets no suggestion rather than
 * a guess, and nothing here ever falls back to USD. Callers pass the browser's preferred
 * languages after the UI language; the person still sees the suggestion and can change it.
 */
export function suggestedCurrency(locales: ReadonlyArray<string | undefined>): string | null {
  for (const locale of locales) {
    if (!locale) continue;
    try {
      const region = new Intl.Locale(locale).region;
      const code = region ? REGION_CURRENCY[region] : undefined;
      if (code && isActiveCurrency(code)) return code;
    } catch {
      // A malformed tag says nothing about a region; try the next one.
    }
  }
  return null;
}
