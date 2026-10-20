import React, { useMemo } from 'react';
import Select, { type StylesConfig } from 'react-select';
import { useTranslation } from 'react-i18next';
import { currencyOptions, matchesCurrency, type CurrencyOption } from '../../lib/currencyOptions';

interface CurrencyPickerProps {
  /** ISO 4217 code, or '' for none chosen. */
  value: string;
  onChange: (code: string) => void;
  /** Id of the text input, so an external <label htmlFor> reaches it. */
  inputId?: string;
  /** Accessible name when there is no external label. */
  ariaLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}

/**
 * Searchable list of every active ISO 4217 currency, shown as "CODE - Name" with the name
 * localised by Intl.DisplayNames, and matched on the code, the localised name or the
 * English name ("yen", "JPY" and "japanese" all find JPY).
 *
 * It starts empty when no currency is chosen: nothing here picks one on the person's
 * behalf (a caller may pass a suggestion as `value`, which stays visible and changeable).
 *
 * Built on react-select, which exposes the combobox/listbox roles and the live-region
 * announcements; the additions are for phones: the text input is 16px (below that, iOS
 * zooms the page on focus), options are at least 44px tall, the menu is portalled to the
 * body so a dialog or an overflow container cannot clip it, and it flips above the field
 * when there is no room below.
 */
const CurrencyPicker: React.FC<CurrencyPickerProps> = ({ value, onChange, inputId, ariaLabel, disabled = false, invalid = false, className = '' }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language ?? 'en';
  const options = useMemo(() => currencyOptions(locale, value || null), [locale, value]);
  const selected = options.find((option) => option.value === value) ?? null;

  const styles: StylesConfig<CurrencyOption, false> = {
    control: (base, state) => ({
      ...base,
      minHeight: 44,
      backgroundColor: 'rgb(61, 78, 64)',
      borderColor: invalid ? 'rgb(248, 113, 113)' : state.isFocused ? 'rgb(52, 152, 219)' : 'rgb(60, 78, 64)',
      boxShadow: state.isFocused ? '0 0 0 2px rgba(52, 152, 219, 0.2)' : 'none',
      '&:hover': { borderColor: 'rgb(52, 152, 219)' },
    }),
    menu: (base) => ({ ...base, backgroundColor: 'rgb(34, 49, 38)', zIndex: 10003 }),
    menuPortal: (base) => ({ ...base, zIndex: 10003 }),
    option: (base, state) => ({
      ...base,
      minHeight: 44,
      display: 'flex',
      alignItems: 'center',
      color: 'white',
      backgroundColor: state.isSelected ? 'rgb(52, 152, 219)' : state.isFocused ? 'rgb(61, 78, 64)' : 'transparent',
    }),
    singleValue: (base) => ({ ...base, color: 'white' }),
    input: (base) => ({ ...base, color: 'white', fontSize: 16 }),
    placeholder: (base) => ({ ...base, color: 'rgba(255, 255, 255, 0.6)' }),
    noOptionsMessage: (base) => ({ ...base, color: 'rgba(255, 255, 255, 0.7)' }),
  };

  return (
    <Select<CurrencyOption, false>
      inputId={inputId}
      aria-label={ariaLabel ?? t('currency.label')}
      aria-invalid={invalid || undefined}
      className={className}
      classNamePrefix="currency-picker"
      options={options}
      value={selected}
      onChange={(next) => onChange(next?.value ?? '')}
      isClearable
      isSearchable
      isDisabled={disabled}
      placeholder={t('currency.placeholder')}
      noOptionsMessage={() => t('currency.noMatch')}
      filterOption={(candidate, input) => matchesCurrency(candidate.data, input)}
      getOptionLabel={(option) => (option.retired ? `${option.label} (${t('currency.retired')})` : option.label)}
      getOptionValue={(option) => option.value}
      blurInputOnSelect
      menuPlacement="auto"
      menuPortalTarget={typeof document === 'undefined' ? undefined : document.body}
      styles={styles}
    />
  );
};

export default CurrencyPicker;
