/**
 * CurrencyAmountInput
 * A currency picker (every active ISO 4217 currency) beside an amount field whose decimal
 * places follow the chosen currency: JPY takes none, USD two, KWD three. Nothing picks a
 * currency on the person's behalf unless the caller passes one in `value`.
 */

import React from 'react';
import CurrencyInput from 'react-currency-input-field';
import { useTranslation } from 'react-i18next';
import CurrencyPicker from './CurrencyPicker';
import { minorUnitsOf } from '../../../../tunes/shared/currency';
import { precisionMessage, useFormatMoney } from '../../lib/money';

interface CurrencyAmountInputProps {
  value: { amount: string; currency: string };
  onChange: (value: { amount: string; currency: string }) => void;
  className?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

const CurrencyAmountInput: React.FC<CurrencyAmountInputProps> = ({
  value,
  onChange,
  className = '',
  label,
  placeholder = 'Enter amount',
  disabled = false,
}) => {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const { amount, currency } = value;
  // Until a currency is chosen there is no precision to enforce; two places is the common
  // case and the amount is re-checked the moment a currency arrives.
  const units = currency ? minorUnitsOf(currency) ?? 2 : 2;
  const problem = amount && currency ? precisionMessage(t, amount, currency) : undefined;
  const preview = amount && currency && !problem && Number.isFinite(Number(amount)) ? formatMoney(amount, currency) : '';

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <label className="block text-dashboard font-poppins text-sm font-medium">{label}</label>}

      <div className="flex flex-col md:flex-row gap-2">
        <div className="w-full md:w-64 flex-shrink-0">
          <CurrencyPicker value={currency} onChange={(code) => onChange({ amount, currency: code })} disabled={disabled} invalid={Boolean(amount) && !currency} />
        </div>

        <div className="flex-1 min-w-0">
          <CurrencyInput
            id="currency-amount-input"
            name="currency-amount-input"
            aria-label={t('currency.amountLabel')}
            aria-invalid={Boolean(problem) || undefined}
            inputMode="decimal"
            value={amount}
            onValueChange={(next) => onChange({ amount: next ?? '', currency })}
            placeholder={placeholder}
            decimalsLimit={units}
            allowNegativeValue={false}
            disabled={disabled}
            className="w-full p-3 bg-dashboard-muted text-dashboard rounded-lg border border-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent font-poppins text-base"
          />
        </div>
      </div>

      {problem && <p role="alert" className="text-red-400 text-xs font-poppins">{problem}</p>}
      {preview && (
        <p className="text-dashboard-light text-xs font-poppins">
          {t('currency.preview')} <span className="font-semibold">{preview}</span>
        </p>
      )}
    </div>
  );
};

export default CurrencyAmountInput;
