import React, { useState, useEffect } from 'react';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import CountryCodeDropdown, { countries } from './CountryCodeDropdown';

interface Country {
  code: string;
  name: string;
  flag: string;
  callingCode: string;
}

interface PhoneInputWithCountryProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
}

const PhoneInputWithCountry: React.FC<PhoneInputWithCountryProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = "Enter phone number",
  disabled = false,
  error,
  label,
  helperText,
  required = false,
}) => {
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isValid, setIsValid] = useState(true);

  // Initialize with India as default country
  useEffect(() => {
    if (!selectedCountry) {
      setSelectedCountry({
        code: 'IN',
        name: 'India',
        flag: '🇮🇳',
        callingCode: '+91'
      });
    }
  }, [selectedCountry]);

  // Parse the stored value to extract country + national number. Always surface
  // the digits — even for a value that doesn't fully validate — so the input is
  // never rendered blank while a value is stored (a blank box is what lets a
  // later country change silently wipe the number).
  useEffect(() => {
    if (!value) return;
    try {
      const parsed = parsePhoneNumberFromString(value);
      if (parsed) {
        const country =
          countries.find((c) => c.code === parsed.country) ||
          countries.find((c) => c.callingCode === `+${parsed.countryCallingCode}`);
        if (country) {
          setSelectedCountry(country);
        }
        setPhoneNumber(parsed.nationalNumber);
        return;
      }
    } catch (error) {
      console.warn('Could not parse phone number:', error);
    }
    // Present but unparseable: still show the digits so it isn't rendered blank.
    setPhoneNumber(value.replace(/^\+/, ''));
  }, [value]);

  const handleCountryChange = (country: Country) => {
    setSelectedCountry(country);
    // Re-emit only when there's an actual number. Changing the country while the
    // field is empty must NOT push '' upward — that would wipe a stored value.
    if (phoneNumber.trim()) {
      updatePhoneValue(country.callingCode, phoneNumber);
    }
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPhoneNumber = e.target.value;
    setPhoneNumber(newPhoneNumber);
    
    if (selectedCountry) {
      updatePhoneValue(selectedCountry.callingCode, newPhoneNumber);
    }
  };

  const updatePhoneValue = (callingCode: string, nationalNumber: string) => {
    if (nationalNumber.trim()) {
      const fullNumber = `${callingCode}${nationalNumber}`;
      console.log('PhoneInputWithCountry: Updating phone value:', { callingCode, nationalNumber, fullNumber });
      onChange(fullNumber);
      
      // Validate the full number
      try {
        const parsed = parsePhoneNumberFromString(fullNumber);
        const isValidNumber = parsed ? parsed.isValid() : false;
        console.log('PhoneInputWithCountry: Validation result:', { fullNumber, isValidNumber, parsed });
        setIsValid(isValidNumber);
      } catch (error) {
        console.warn('PhoneInputWithCountry: Validation error:', error);
        setIsValid(false);
      }
    } else {
      onChange('');
      setIsValid(true);
    }
  };

  const handleBlur = () => {
    if (onBlur) {
      onBlur();
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="block text-sm font-poppins text-white font-semibold mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="flex w-full min-w-0">
        <div className="flex-shrink-0">
          <CountryCodeDropdown
            selectedCountry={selectedCountry}
            onCountryChange={handleCountryChange}
            disabled={disabled}
            theme="dark"
          />
        </div>
        <input
          type="tel"
          value={phoneNumber}
          onChange={handlePhoneNumberChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            flex-1 min-w-0 px-3 py-2 border border-dashboard rounded-r-md text-sm text-dashboard placeholder:text-dashboard-muted
            focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-dashboard-accent
            ${disabled ? 'bg-dashboard-muted cursor-not-allowed text-dashboard-muted' : 'bg-dashboard-muted hover:border-dashboard-accent'}
            ${error ? 'border-red-500' : ''}
            ${!isValid && phoneNumber ? 'border-orange-400' : ''}
          `}
        />
      </div>
      
      {helperText && (
        <p className="text-xs font-poppins text-gray-300">
          {helperText}
        </p>
      )}
      
      {error && (
        <span className="text-xs font-poppins text-red-400">
          {error}
        </span>
      )}
      
      {!isValid && phoneNumber && (
        <span className="text-xs font-poppins text-orange-400">
          Please enter a valid phone number
        </span>
      )}
    </div>
  );
};

export default PhoneInputWithCountry;
