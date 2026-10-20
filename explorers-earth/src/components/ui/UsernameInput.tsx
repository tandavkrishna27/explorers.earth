import React, { useState, useEffect, useCallback } from "react";
import { Field, useFormikContext } from "formik";
import {
  formatValidationMessages,
  UsernameValidationResult,
  UsernameAvailabilityResult,
} from "../../utils/usernameValidation";
import { useUsernameValidation } from "../../hooks/useUsernameValidation";
import { useTranslation } from "react-i18next";

interface UsernameInputProps {
  name: string;
  label: string;
  placeholder?: string;
  checkAvailability?: boolean;
  className?: string;
  disabled?: boolean;
  theme?: "light" | "dark"; // Add theme prop for dark backgrounds like profile form
  hintOnFocus?: string; // Optional hint/message to show only when input is focused (e.g., cooldown info)
  originalValue?: string; // The current saved username; used to avoid false "taken" when unchanged
  onChange?: () => void; // Optional callback to notify parent about value changes (e.g., for dirty state tracking)
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

const UsernameInput: React.FC<UsernameInputProps> = ({
  name,
  label,
  placeholder = "Enter your username",
  checkAvailability = false,
  className = "",
  disabled = false,
  theme = "light", // Default to light theme
  hintOnFocus,
  originalValue,
  onChange,
}) => {
  const { values, setFieldValue, setFieldError, setFieldTouched } =
    useFormikContext<any>();
  const { t } = useTranslation();
  const [validation, setValidation] = useState<
    | (UsernameValidationResult & { availability?: UsernameAvailabilityResult })
    | null
  >(null);
  const [hasBeenTouched, setHasBeenTouched] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [showDisabledHint, setShowDisabledHint] = useState(false);

  // Use the new username validation hook
  const { validateUsernameWithAvailability, isValidating } =
    useUsernameValidation();

  // Normalized original for comparison
  const originalNormalized = (originalValue || "").trim().toLowerCase();

  // Debounced validation function
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

          // Only check availability if value actually changed from original
          const normalized = username.trim().toLowerCase();
          const effectiveAvailability =
            checkAvailability &&
            (!originalNormalized || normalized !== originalNormalized);

          // Track if we are checking availability for UI messaging
          setIsCheckingAvailability(effectiveAvailability);

          // Use the validation hook method for username availability checking
          const result = await validateUsernameWithAvailability(
            username,
            effectiveAvailability
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
        } finally {
          setIsCheckingAvailability(false);
        }
      },
      300
    ),
    [
      name,
      checkAvailability,
      originalNormalized,
      setFieldError,
      setFieldValue,
      validateUsernameWithAvailability,
    ]
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

  // Handle initial validation of pre-filled values (like in profile page)
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
    setIsFocused(false);
    setHasBeenTouched(true);
    setFieldTouched(name, true);
    const currentValue = values[name];
    if (currentValue !== undefined) {
      // Clear any pending validation and run immediately with current value
      debouncedValidation.cancel();
      debouncedValidation(currentValue, true); // Always show required error on blur if empty
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Convert to lowercase immediately
    const lowercaseValue = event.target.value.toLowerCase();
    setFieldValue(name, lowercaseValue);

    // Mark as touched when user starts typing
    if (!hasBeenTouched) {
      setHasBeenTouched(true);
    }

    // Trigger validation immediately as user types
    debouncedValidation(lowercaseValue, true); // Show required error since user is typing

    // Notify parent about value change (e.g., for dirty state tracking)
    if (onChange) {
      onChange();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setFieldValue(name, suggestion);
    setHasBeenTouched(true);
    debouncedValidation(suggestion, true);
    // Notify parent about value change (e.g., for dirty state tracking)
    if (onChange) {
      onChange();
    }
  };

  const formatMessages = validation
    ? formatValidationMessages(validation)
    : null;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={name}
        className={`block text-sm font-poppins font-semibold mb-1 ${
          theme === "dark" ? "text-white" : "text-black"
        }`}
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
          onFocus={handleFocus}
          onChange={handleChange}
          className={`
            w-full placeholder:text-gray-400 outline-none px-3 py-2 border font-poppins rounded-md text-sm 
            focus:outline-none focus:ring-2 transition-colors
            ${theme === "dark" ? "bg-dashboard-muted text-white placeholder:text-gray-400" : "bg-white text-gray-900"}
            ${
              validation?.isValid === false && hasBeenTouched
                ? "border-red-500 focus:ring-red-500"
                : validation?.isValid === true && hasBeenTouched
                ? "border-green-500 focus:ring-green-500"
                : theme === "dark"
                ? "border-dashboard focus:ring-dashboard-accent hover:border-dashboard-accent"
                : "border-gray-300 focus:ring-purple hover:border-purple"
            }
            ${className}
          `}
        />

        {/* Overlay to capture clicks when input is disabled */}
        {disabled && (
          <button
            type="button"
            onClick={() => setShowDisabledHint(true)}
            className="absolute inset-0 cursor-not-allowed bg-transparent"
            aria-label="Username is temporarily locked due to cooldown"
            tabIndex={-1}
          />
        )}

        {/* Loading indicator */}
        {isValidating && (
          <div className="absolute right-3 top-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-dashboard-accent"></div>
          </div>
        )}

        {/* Success indicator */}
        {validation?.isValid && hasBeenTouched && !isValidating && (
          <div className="absolute right-3 top-2">
            <svg
              className="h-4 w-4 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Focus-only hint (enabled state) */}
      {isFocused && hintOnFocus && !disabled && (
        <p
          className={`text-xs font-poppins mt-1 ${
            theme === "dark" ? "text-yellow-300" : "text-yellow-700"
          }`}
        >
          {hintOnFocus}
        </p>
      )}

      {/* Disabled-click hint (e.g., cooldown message) */}
      {disabled && showDisabledHint && hintOnFocus && (
        <p
          className={`text-xs font-poppins mt-1 ${
            theme === "dark" ? "text-yellow-300" : "text-yellow-700"
          }`}
        >
          {hintOnFocus}
        </p>
      )}

      {/* Validation Messages. The area keeps one line of height even when it has nothing to
          say: when the input blurs and the availability line goes away, everything below
          (the Save & Publish button) used to jump up ~28px and the first click landed on
          the gap. */}
      <div
        data-testid="username-messages"
        aria-live="polite"
        className={checkAvailability ? "min-h-[1.75rem]" : undefined}
      >
      {hasBeenTouched && formatMessages && (
        <div className="space-y-1">
          {/* Errors */}
          {formatMessages.hasErrors && (
            <div className="space-y-1">
              {formatMessages.errors.map((error, index) => (
                <p key={index} className={`text-xs font-poppins ${
                  theme === "dark" ? "text-red-400" : "text-red-500"
                }`}>
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
                <p
                  className={`text-xs font-poppins mb-1 ${
                    theme === "dark" ? "text-white" : "text-gray-600"
                  }`}
                >
                  {t('auth.validations.username.suggestedAlternatives')}
                </p>
                <div className="flex flex-wrap gap-1">
                  {validation.suggestions
                    .slice(0, 3)
                    .map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleSuggestionClick(suggestion)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          theme === "dark"
                            ? "bg-white text-gray-800 hover:bg-gray-100"
                            : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                        }`}
                      >
                        {suggestion}
                      </button>
                    ))}
                </div>
              </div>
            )}

          {/* Availability status */}
          {checkAvailability && (
            <div>
              {isCheckingAvailability && (
                <p
                  className={`text-xs font-poppins ${
                    theme === "dark" ? "text-blue-300" : "text-blue-600"
                  }`}
                >
                  {t('auth.validations.username.checkingAvailability')}
                </p>
              )}
              {!isCheckingAvailability &&
                validation?.availability?.isAvailable &&
                validation.isValid && (
                  <p
                    className={`text-xs font-poppins ${
                      theme === "dark" ? "text-green-300" : "text-green-600"
                    }`}
                  >
                    ✓ {t('auth.validations.username.available')}
                  </p>
                )}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
};

export default UsernameInput;
