import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import CurrencyPicker from '../CurrencyPicker';
import CurrencyAmountInput from '../CurrencyAmountInput';
import { currencyOptions, matchesCurrency, suggestedCurrency } from '../../../lib/currencyOptions';
import { CURRENCY_CODES } from '../../../../../tunes/shared/currency';
import en from '../../../i18n/resources/en.json';
import de from '../../../i18n/resources/de.json';

// react-select positions its portalled menu with floating-ui, which needs a constructible
// ResizeObserver; the shared test mock is an arrow function and cannot be `new`ed.
beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

const instance = async (lng: string) => {
  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({
    lng, fallbackLng: 'en', resources: { en: { translation: en }, de: { translation: de } }, interpolation: { escapeValue: false },
  });
  return i18n;
};

function Harness({ initial = '', onChange }: { initial?: string; onChange?: (code: string) => void }) {
  const [value, setValue] = useState(initial);
  return <>
    <label htmlFor="cur">Currency</label>
    <CurrencyPicker inputId="cur" value={value} onChange={(code) => { setValue(code); onChange?.(code); }} />
    <output data-testid="chosen">{value}</output>
  </>;
}

const mount = async (ui: React.ReactElement, lng = 'en') => render(<I18nextProvider i18n={await instance(lng)}>{ui}</I18nextProvider>);

describe('CurrencyPicker', () => {
  it('starts empty: nothing is chosen on the person\'s behalf', async () => {
    await mount(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeInTheDocument();
    expect(screen.getByTestId('chosen')).toHaveTextContent('');
    expect(screen.getByText('Search by code or name')).toBeInTheDocument();
    expect(screen.queryByText(/USD/)).toBeNull();
  });

  it('offers every active currency, as code and name', async () => {
    const user = userEvent.setup();
    await mount(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Currency' }));
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(CURRENCY_CODES.length);
    expect(screen.getByRole('option', { name: 'EUR – Euro' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'KWD – Kuwaiti Dinar' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'JPY – Japanese Yen' })).toBeInTheDocument();
  });

  it('searches by code, by name and by the English name', async () => {
    const user = userEvent.setup();
    await mount(<Harness />);
    const box = screen.getByRole('combobox', { name: 'Currency' });
    await user.click(box);
    await user.type(box, 'kwd');
    expect(await screen.findByRole('option', { name: /KWD/ })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.clear(box);
    await user.type(box, 'yen');
    expect(screen.getByRole('option', { name: /JPY/ })).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, 'dinar');
    const dinars = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(dinars.some((text) => text.startsWith('KWD'))).toBe(true);
    expect(dinars.some((text) => text.startsWith('BHD'))).toBe(true);
    await user.clear(box);
    await user.type(box, 'zzzz');
    expect(await screen.findByText('No currency matches')).toBeInTheDocument();
  });

  it('chooses with the keyboard alone', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    await mount(<Harness onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveFocus();
    await user.keyboard('swiss');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('CHF');
    expect(screen.getByTestId('chosen')).toHaveTextContent('CHF');
  });

  it('shows the chosen currency and lets it be cleared', async () => {
    const user = userEvent.setup();
    await mount(<Harness initial="JPY" />);
    expect(screen.getByText('JPY – Japanese Yen')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Currency' }));
    await user.keyboard('{Backspace}');
    expect(screen.getByTestId('chosen')).toHaveTextContent('');
  });

  it('names currencies in the UI language and still finds them by their English name', async () => {
    const user = userEvent.setup();
    await mount(<Harness />, 'de');
    const box = screen.getByRole('combobox', { name: 'Currency' });
    await user.click(box);
    expect(await screen.findByRole('option', { name: /^JPY – Japanischer Yen/ })).toBeInTheDocument();
    await user.type(box, 'yen');
    expect(screen.getByRole('option', { name: /JPY/ })).toBeInTheDocument();
  });

  it('shows a stored currency that is no longer in ISO 4217 instead of an empty box', async () => {
    await mount(<Harness initial="HRK" />);
    expect(screen.getByText(/^HRK \u2013 .*\(retired\)$/)).toBeInTheDocument();
  });

  it('is usable on a phone: 16px text input, 44px touch targets, menu outside any clipping container', async () => {
    const user = userEvent.setup();
    const { container } = await mount(<div style={{ overflow: 'hidden', height: 10 }}><Harness /></div>);
    await user.click(screen.getByRole('combobox', { name: 'Currency' }));
    const listbox = await screen.findByRole('listbox');
    // Portalled to the body, so the clipped wrapper cannot hide it.
    expect(container.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
    expect(within(listbox).getAllByRole('option').length).toBeGreaterThan(100);
    const input = screen.getByRole('combobox', { name: 'Currency' });
    // Computed from the picker's own style sheet: below 16px iOS zooms the page on focus.
    expect(getComputedStyle(input.parentElement!).fontSize).toBe('16px');
    expect(getComputedStyle(within(listbox).getAllByRole('option')[0]).minHeight).toBe('44px');
  });
});

describe('currency options', () => {
  it('matches the code, the localised name and the English name, ignoring case and accents', () => {
    const [option] = currencyOptions('de').filter((candidate) => candidate.value === 'JPY');
    for (const query of ['jpy', 'JAPAN', 'yen', 'Japanischer', '']) expect(matchesCurrency(option, query), query).toBe(true);
    expect(matchesCurrency(option, 'euro')).toBe(false);
  });
  it('suggests the currency of the first locale that names a region, and never falls back to USD', () => {
    expect(suggestedCurrency(['de-AT'])).toBe('EUR');
    expect(suggestedCurrency(['pt-BR', 'en-US'])).toBe('BRL');
    expect(suggestedCurrency(['en-IN'])).toBe('INR');
    expect(suggestedCurrency(['en', 'en-GB'])).toBe('GBP');
    expect(suggestedCurrency(['ja-JP'])).toBe('JPY');
    expect(suggestedCurrency(['en-KW'])).toBe('KWD');
    // A bare language is not a place.
    expect(suggestedCurrency(['en'])).toBeNull();
    expect(suggestedCurrency(['es', 'fr'])).toBeNull();
    expect(suggestedCurrency(['en-ZZ'])).toBeNull();
    expect(suggestedCurrency(['not a locale', undefined, ''])).toBeNull();
    expect(suggestedCurrency([])).toBeNull();
  });
});

describe('CurrencyAmountInput', () => {
  function Form() {
    const [value, setValue] = useState({ amount: '', currency: '' });
    return <CurrencyAmountInput value={value} onChange={setValue} />;
  }
  it('does not default the currency, and previews in the chosen currency\'s digits', async () => {
    const user = userEvent.setup();
    await mount(<Form />);
    const amount = screen.getByLabelText('Amount');
    await user.type(amount, '19.9');
    expect(screen.queryByText(/Preview/)).toBeNull();
    await user.click(screen.getByRole('combobox', { name: 'Currency' }));
    await user.keyboard('euro{Enter}');
    expect(await screen.findByText(/Preview/)).toHaveTextContent('€19.90');
  });
  it('limits the decimals to the currency and explains a conflict', async () => {
    const user = userEvent.setup();
    await mount(<Form />);
    await user.type(screen.getByLabelText('Amount'), '100.5');
    await user.click(screen.getByRole('combobox', { name: 'Currency' }));
    await user.keyboard('JPY{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('JPY has no decimal places; enter a whole amount.');
  });
});
