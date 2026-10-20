import React, { useState, useEffect, useCallback } from "react";
import { Field, useFormikContext } from "formik";
import {
  formatValidationMessages,
  UsernameValidationResult,
} from "../../utils/usernameValidation";
import { useUsernameValidation } from "../../hooks/useUsernameValidation";
import { useTranslation } from "react-i18next";

interface OnboardingUsernameInputProps {
  name: string;
  label: string;
  placeholder?: string;
  helperText?: string;
  className?: string;
  disabled?: boolean;
  isPreFilled?: boolean; // Visual indicator that field was pre-filled
}

// Custom debounce function
const debounce = <T extends (...args: any[]) => any>(func: T, wait: number) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };

  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
  };

  debounced.flush = () => {
    if (timeout) {
      clearTimeout(timeout);
      func();
    }
  };

  return debounced;
};

/**
 * Specialized Username Input for Onboarding Forms
 *
 * Features:
 * - Pre-filled with user's registered username
 * - Real-time validation with availability checking
 * - Visual indicator when pre-filled from registration
 * - Lowercase conversion and normalization
 * - Comprehensive error messages and suggestions
 */
const OnboardingUsernameInput: React.FC<OnboardingUsernameInputProps> = ({
  name,
  label,
  placeholder = "Enter your username",
  helperText,
  className = "",
  disabled = false,
  isPreFilled = false,
}) => {
  const { values, setFieldValue, setFieldError, setFieldTouched } =
    useFormikContext<any>();
  const { t } = useTranslation();
  const [validation, setValidation] = useState<UsernameValidationResult | null>(
    null
  );
  const [hasBeenTouched, setHasBeenTouched] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  // The field lowercases on input, so validateUsername never sees the capitals; remember them here (ONB-02).
  const [typedUppercase, setTypedUppercase] = useState(false);

  // Use the new username validation hook
  const { validateUsernameWithAvailability, isValidating } =
    useUsernameValidation();

  // Debounced validation function with availability checking
  const debouncedValidation = useCallback(
    debounce(
      async (username: string, shouldShowRequiredError: boolean = false) => {
        try {
          // For empty values, only show error if shouldShowRequiredError is true
          if (!username || username.trim() === "") {
            if (shouldShowRequiredError) {
              setValidation({
                isValid: false,
                errors: [t('auth.validations.username.required')],
                warnings: [],
                suggestions: [],
              });
              setFieldError(name, t('auth.validations.username.required'));
            } else {
              setValidation(null);
              setFieldError(name, undefined);
            }
            return;
          }

          // Use the validation hook method for username availability checking
          const result = await validateUsernameWithAvailability(
            username,
            true // Check availability for onboarding
          );

          setValidation(result);

          // Update Formik field error state
          if (!result.isValid) {
            setFieldError(name, result.errors[0]);
          } else {
            setFieldError(name, undefined);
            // Set normalized username if it's different from input
            if (
              result.normalizedUsername &&
              result.normalizedUsername !== username
            ) {
              setFieldValue(name, result.normalizedUsername);
            }
          }
        } catch (error) {
          console.error("Username validation error:", error);
        }
      },
      300
    ),
    [name, setFieldError, setFieldValue, validateUsernameWithAvailability]
  );

  // Validate on value change - smarter validation logic
  useEffect(() => {
    const currentValue = values[name];

    // Only validate if:
    // 1. User has touched the field, OR
    // 2. Field has content (to handle pre-filled values), OR
    // 3. Field was touched and now empty (to show required error)
    if (hasBeenTouched || (currentValue && currentValue.trim() !== "")) {
      debouncedValidation(currentValue || "", hasBeenTouched);
    }

    // Cleanup debounced function on unmount
    return () => {
      debouncedValidation.cancel();
    };
  }, [values[name], debouncedValidation, hasBeenTouched]);

  // Handle initial validation of pre-filled values (like from registration)
  useEffect(() => {
    const currentValue = values[name];
    if (!isInitialized && currentValue && currentValue.trim() !== "") {
      // Pre-filled value exists, validate it but don't mark as touched
      debouncedValidation(currentValue, false);
      setIsInitialized(true);
    } else if (!isInitialized) {
      setIsInitialized(true);
    }
  }, [values[name], debouncedValidation, isInitialized]);

  const handleBlur = () => {
    setHasBeenTouched(true);
    setFieldTouched(name, true);
    const currentValue = values[name];
    if (currentValue !== undefined) {
      // Clear any pending validation and run immediately with current value
      debouncedValidation.cancel();
      debouncedValidation(currentValue, true); // Always show required error on blur if empty
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTypedUppercase(/[A-Z]/.test(event.target.value));
    // Convert to lowercase immediately
    const lowercaseValue = event.target.value.toLowerCase();
    setFieldValue(name, lowercaseValue);

    // Mark as touched when user starts typing
    if (!hasBeenTouched) {
      setHasBeenTouched(true);
    }

    // Trigger validation immediately as user types
    debouncedValidation(lowercaseValue, true); // Show required error since user is typing
  };

  const handleSuggestionClick = (suggestion: string) => {
    setFieldValue(name, suggestion);
    setHasBeenTouched(true);
    debouncedValidation(suggestion, true);
  };

  const formatMessages = validation
    ? formatValidationMessages(validation)
    : null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label
        htmlFor={name}
        className="block text-sm font-poppins text-white font-semibold mb-1"
      >
        {label}
      </label>

      <div className="relative">
        <Field
          id={name}
          name={name}
          type="text"
          placeholder={placeholder}
          disabled={disabled}
          onBlur={handleBlur}
          onChange={handleChange}
          className={`
            w-full placeholder:text-dashboard-muted outline-none px-3 py-2 border font-poppins rounded-md text-sm text-dashboard
            focus:outline-none focus:ring-2 transition-colors duration-200
            ${
              disabled
                ? "bg-dashboard-muted border-dashboard text-dashboard-light cursor-not-allowed"
                : hasBeenTouched && validation?.isValid
                ? "border-green-500 focus:ring-green-500 focus:border-green-500 bg-dashboard-muted"
                : hasBeenTouched && validation && !validation.isValid
                ? "border-red-500 focus:ring-red-500 focus:border-red-500 bg-dashboard-muted"
                : isPreFilled
                ? "border-blue-400 focus:ring-blue-400 focus:border-blue-400 bg-dashboard-muted"
                : "border-dashboard focus:ring-dashboard-accent focus:border-dashboard-accent hover:border-dashboard-accent bg-dashboard-muted"
            }
          `}
        />

        {/* Validation status icons */}
        {hasBeenTouched && !isValidating && validation && (
          <div className="absolute right-3 top-2">
            {validation.isValid ? (
              <svg
                className="h-4 w-4 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4 text-red-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        )}

        {/* Loading indicator */}
        {isValidating && (
          <div className="absolute right-3 top-2">
            <svg
              className="animate-spin h-4 w-4 text-dashboard-accent"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        )}
      </div>

      {/* Helper text - shows username information */}
      {helperText && (
        <div className="flex gap-2 text-xs font-poppins text-blue-400">
          <div className="flex-shrink-0 mt-0.5">
            <svg
              className="w-3 h-3 text-blue-400"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="whitespace-pre-line">
            {helperText.replace("{username}", values[name] || "username")}
          </div>
        </div>
      )}

      {typedUppercase && (
        <p role="status" data-testid="username-lowercase-notice" className="text-xs font-poppins text-yellow-400">
          {t('auth.validations.username.willConvertToLowercase')}
        </p>
      )}

      {/* Validation Messages */}
      {hasBeenTouched && formatMessages && (
        <div className="space-y-1">
          {/* Errors */}
          {formatMessages.hasErrors && (
            <div className="space-y-1">
              {formatMessages.errors.map((error: string, index: number) => (
                <p key={index} className="text-xs font-poppins text-red-500">
                  {error}
                </p>
              ))}
            </div>
          )}

          {/* Suggestions */}
          {formatMessages.hasSuggestions &&
            validation &&
            validation.suggestions.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-poppins text-dashboard-light mb-1">
                  {t('auth.validations.username.suggestedAlternatives')}
                </p>
                <div className="flex flex-wrap gap-1">
                  {validation.suggestions
                    .slice(0, 3)
                    .map((suggestion: string, index: number) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default OnboardingUsernameInput;
