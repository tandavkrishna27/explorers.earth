import { describe, expect, it } from 'vitest';
import { formatMoney, precisionMessage } from '../money';

// Layout uses no-break and narrow no-break spaces (U+00A0, U+202F); the table compares them as plain spaces.
const plain = (text: string) => text.replace(/[\u00A0\u202F]/g, ' ');
const show = (amount: number | string | null | undefined, currency: string | null | undefined, locale: string) =>
  plain(formatMoney(amount, currency, { locale, freeLabel: 'Free' }));

describe('formatMoney', () => {
  // [locale, amount, currency, expected]
  const table: Array<[string, number | string, string | null, string]> = [
    // The currency's own digits: 19.90 keeps its zero, yen has none, dinars have three.
    ['en-US', 19.9, 'USD', '$19.90'],
    ['en-US', '19.90', 'USD', '$19.90'],
    ['en-US', 25, 'USD', '$25.00'],
    ['en-US', 100, 'JPY', '¥100'],
    ['en-US', 1.25, 'KWD', 'KWD 1.250'],
    ['en-US', '1.250', 'KWD', 'KWD 1.250'],
    ['en-US', 12.345, 'BHD', 'BHD 12.345'],
    ['en-US', 5, 'IQD', 'IQD 5.000'],
    ['en-US', 25000, 'VND', '₫25,000'],
    ['en-US', 1500, 'KRW', '₩1,500'],
    ['en-US', 79.99, 'INR', '₹79.99'],
    // The viewer's locale decides symbol position and separators.
    ['de-DE', 1234.5, 'EUR', '1.234,50 €'],
    ['fr-FR', 1234.5, 'EUR', '1 234,50 €'],
    ['en-GB', 5, 'GBP', '£5.00'],
    ['en-IN', 1234567.5, 'INR', '₹12,34,567.50'],
    ['pt-BR', 19.9, 'BRL', 'R$ 19,90'],
    ['de-CH', 19.9, 'CHF', 'CHF 19.90'],
    ['es-MX', 19.9, 'MXN', '$19.90'],
    // The same ISO digits whatever the locale.
    ['de-DE', 100, 'JPY', '100 ¥'],
    ['de-DE', 1.25, 'KWD', '1,250 KWD'],
    // CLDR would give LBP no decimals; ISO 4217 and the server say two.
    ['en-US', 1500, 'LBP', 'LBP 1,500.00'],
    // No currency never becomes USD: the amount stands alone, as written.
    ['en-US', 25, null, '25'],
    ['en-US', '19.90', null, '19.90'],
    ['en-US', 19.9, null, '19.9'],
    ['de-DE', '1234.50', null, '1.234,50'],
    // A well-formed code the table does not know is kept beside the amount, not replaced.
    ['en-US', '12.50', 'XYZ', '12.50 XYZ'],
    // A withdrawn currency is still that currency.
    ['en-US', 100, 'HRK', 'HRK 100.00'],
  ];
  it.each(table)('%s %s %s -> %s', (locale, amount, currency, expected) => {
    expect(show(amount, currency, locale)).toBe(expected);
  });

  it('shows zero as the Free label whatever the currency, or none', () => {
    for (const currency of ['USD', 'JPY', 'KWD', null, undefined, 'XYZ']) {
      expect(show(0, currency, 'en-US')).toBe('Free');
      expect(show('0', currency, 'en-US')).toBe('Free');
      expect(show('0.00', currency, 'en-US')).toBe('Free');
    }
    expect(formatMoney(0, 'EUR', { locale: 'de-DE', freeLabel: 'Kostenlos' })).toBe('Kostenlos');
  });

  it('shows nothing when there is no amount', () => {
    for (const amount of [null, undefined, '', '   ', Number.NaN, 'abc', Infinity]) {
      expect(show(amount as never, 'USD', 'en-US')).toBe('');
    }
  });

  it('does not treat a tiny but real amount as free', () => {
    expect(show(0.01, 'USD', 'en-US')).toBe('$0.01');
  });

  it('falls back to English formatting for a locale tag Intl cannot use', () => {
    expect(show(19.9, 'USD', 'not a locale')).toBe('$19.90');
    expect(show(19.9, 'USD', '')).toBe('$19.90');
  });

  it('accepts lower-case and padded codes without guessing a different currency', () => {
    expect(show(19.9, ' eur ', 'en-US')).toBe('€19.90');
    expect(show(19.9, 'dollars', 'en-US')).toBe('19.9');
  });

  it('uses the translated Free from the loaded UI language by default', async () => {
    const { default: i18n } = await import('../../i18n/index.js');
    await i18n.changeLanguage('en');
    expect(formatMoney(0, 'USD')).toBe('Free');
    await i18n.changeLanguage('de');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(formatMoney(0, 'USD')).toBe('Kostenlos');
    expect(plain(formatMoney(1234.5, 'EUR'))).toBe('1.234,50 €');
    await i18n.changeLanguage('en');
  });
});

describe('precisionMessage', () => {
  const t = (key: string, options?: Record<string, unknown>) => `${key}:${JSON.stringify(options ?? {})}`;
  it('explains a precision the currency does not have', () => {
    expect(precisionMessage(t, '100.50', 'JPY')).toBe('currency.noDecimals:{"code":"JPY"}');
    expect(precisionMessage(t, '1.2345', 'KWD')).toBe('currency.maxDecimals:{"code":"KWD","count":3}');
    expect(precisionMessage(t, '19.999', 'USD')).toBe('currency.maxDecimals:{"code":"USD","count":2}');
  });
  it('is silent when the amount fits, or the currency is unknown to the table', () => {
    expect(precisionMessage(t, '100', 'JPY')).toBeUndefined();
    expect(precisionMessage(t, '1.250', 'KWD')).toBeUndefined();
    expect(precisionMessage(t, '5.123456', 'XYZ')).toBeUndefined();
  });
});
