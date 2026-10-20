import i18n from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { decimalScale, minorUnitsOf } from '../../../tunes/shared/currency';

/**
 * The one way a price or money amount is shown anywhere in the app.
 *
 *  - Intl.NumberFormat in the viewer's UI locale, style "currency", so the symbol, its
 *    position and the digit grouping are the locale's own.
 *  - The currency's own fraction digits (ISO 4217, from the shared table): 19.90 USD is
 *    "$19.90", 100 JPY is "¥100", 1.25 KWD is "KWD 1.250". The digits are passed
 *    explicitly rather than left to Intl, because CLDR's defaults differ from ISO for some
 *    codes and move with the browser's ICU build, and the server validates against ISO.
 *  - Zero is "Free" (translated), whatever the currency.
 *  - No amount shows nothing at all.
 *  - No currency never becomes USD: the amount is shown on its own, with no symbol.
 *    Rows saved before a currency was required hold exactly that.
 */
export interface MoneyOptions {
  /** BCP 47 tag. Defaults to the UI language. */
  locale?: string;
  /** Text shown for zero. Defaults to the translated common.free. */
  freeLabel?: string;
}

type Amount = number | string | null | undefined;

const numeric = (amount: Amount): number | null => {
  if (amount === null || amount === undefined) return null;
  if (typeof amount === 'string' && amount.trim() === '') return null;
  const value = typeof amount === 'number' ? amount : Number(amount);
  return Number.isFinite(value) ? value : null;
};

const safeLocale = (locale: string | undefined): string => {
  const candidate = locale || 'en';
  try {
    return Intl.NumberFormat.supportedLocalesOf(candidate).length ? candidate : 'en';
  } catch {
    return 'en';
  }
};

/** A string like "19.90" keeps the digits it was written with when no currency fixes them. */
const bareDigits = (amount: Amount, value: number) => {
  const written = typeof amount === 'string' ? decimalScale(amount.trim()) : decimalScale(String(value));
  return Math.min(Math.max(written, 0), 6);
};

/** common.free, or "Free" if translations are not loaded (a key echoed back is not a label). */
const freeText = (): string => {
  const label = i18n.t('common.free');
  return typeof label === 'string' && label !== 'common.free' ? label : 'Free';
};

export function formatMoney(amount: Amount, currency: string | null | undefined, options: MoneyOptions = {}): string {
  const value = numeric(amount);
  if (value === null) return '';
  if (value === 0) return options.freeLabel ?? freeText();
  const locale = safeLocale(options.locale ?? i18n.language);
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  const units = /^[A-Z]{3}$/.test(code) ? minorUnitsOf(code) : undefined;
  if (units !== undefined) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: units,
      maximumFractionDigits: units,
    }).format(value);
  }
  const digits = bareDigits(amount, value);
  const bare = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  // A well-formed code this table has no authority for is still the owner's word: show it
  // beside the amount rather than dropping it or substituting another currency.
  return /^[A-Z]{3}$/.test(code) ? `${bare}\u00A0${code}` : bare;
}

/** For components: re-renders when the UI language changes. */
export function useFormatMoney() {
  const { t, i18n: instance } = useTranslation();
  // A test double for useTranslation may return no i18n instance; the global one answers then.
  const locale = instance?.language;
  const free = t('common.free');
  return useCallback(
    (amount: Amount, currency: string | null | undefined) => formatMoney(amount, currency, { locale, freeLabel: free }),
    [locale, free],
  );
}

/**
 * The inline form message for an amount that has more decimal places than its currency
 * allows, or undefined. Same rule as the server's refusal (shared amountPrecisionProblem),
 * worded through i18n.
 */
export function precisionMessage(
  t: (key: string, options?: Record<string, unknown>) => string,
  amount: string,
  currency: string,
): string | undefined {
  const units = minorUnitsOf(currency);
  if (units === undefined || decimalScale(amount) <= units) return undefined;
  return units === 0 ? t('currency.noDecimals', { code: currency }) : t('currency.maxDecimals', { code: currency, count: units });
}
