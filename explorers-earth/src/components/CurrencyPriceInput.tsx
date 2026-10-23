/**
 * CurrencyPriceInput (DS-05)
 * One field: the amount with its currency selector inline. Precision follows the chosen
 * currency (JPY takes none) and a problem is shown inline, never silently corrected. An
 * empty amount clears both halves: no price means no currency.
 */
import React, { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_CURRENCIES } from '../../../tunes/shared/explorersProductContract';
import { precisionMessage } from '../lib/money';

export type PriceValue = { price: string | null; currencyCode: string | null };

const EURO_AREA = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];
const REGION_CURRENCY: Record<string, string> = {
  IN: 'INR', JP: 'JPY', GB: 'GBP', US: 'USD', AU: 'AUD', CA: 'CAD', SG: 'SGD', AE: 'AED',
  ...Object.fromEntries(EURO_AREA.map((region) => [region, 'EUR'])),
};
const CURRENCY_CODES = Object.keys(SUPPORTED_CURRENCIES).sort();

/** The currency to preselect for a locale; USD when the region is unknown. */
export function defaultCurrencyForLocale(locale: string): string {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return (region && REGION_CURRENCY[region]) || 'USD';
  } catch {
    return 'USD';
  }
}

interface CurrencyPriceInputProps {
  value: PriceValue;
  onChange: (value: PriceValue) => void;
  locale?: string;
  disabled?: boolean;
}

const CurrencyPriceInput: React.FC<CurrencyPriceInputProps> = ({ value, onChange, locale, disabled = false }) => {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [amount, setAmount] = useState(value.price ?? '');
  const [currency, setCurrency] = useState(value.currencyCode ?? defaultCurrencyForLocale(locale ?? i18n.language ?? 'en-US'));
  useEffect(() => { setAmount(value.price ?? ''); }, [value.price]);
  useEffect(() => { if (value.currencyCode) setCurrency(value.currencyCode); }, [value.currencyCode]);

  const emit = (nextAmount: string, nextCurrency: string) =>
    onChange(nextAmount.trim() === '' ? { price: null, currencyCode: null } : { price: nextAmount.trim(), currencyCode: nextCurrency });
  const problem = amount.trim() ? precisionMessage(t, amount.trim(), currency) : undefined;
  const errorId = `${id}-error`;

  return (
    <div>
      <div className="flex min-h-[44px] items-stretch rounded-xl border border-dashboard-border bg-dashboard-muted text-dashboard focus-within:ring-2 focus-within:ring-blue-500">
        <input
          id={`${id}-amount`}
          aria-label={t('currency.priceLabel')}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errorId : undefined}
          inputMode="decimal"
          className="min-w-0 flex-1 rounded-l-xl bg-transparent px-3 text-dashboard outline-none"
          value={amount}
          disabled={disabled}
          onChange={(event) => { setAmount(event.target.value); emit(event.target.value, currency); }}
        />
        <select
          aria-label={t('currency.label')}
          className="rounded-r-xl border-l border-dashboard-border bg-transparent px-2 text-dashboard outline-none"
          value={currency}
          disabled={disabled}
          onChange={(event) => { setCurrency(event.target.value); emit(amount, event.target.value); }}
        >
          {CURRENCY_CODES.map((code) => <option key={code} value={code} className="bg-dashboard-sidebar text-dashboard">{code}</option>)}
        </select>
      </div>
      {problem && <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">{problem}</p>}
    </div>
  );
};

export default CurrencyPriceInput;
