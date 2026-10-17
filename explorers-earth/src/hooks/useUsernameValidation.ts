import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  validateUsername, 
  checkUsernameAvailability,
  UsernameValidationResult,
  UsernameAvailabilityResult 
} from '../utils/usernameValidation';

export interface UseUsernameValidationResult {
  validateUsernameWithAvailability: (username: string, checkAvailability?: boolean) => Promise<UsernameValidationResult & { availability?: UsernameAvailabilityResult }>;
  isValidating: boolean;
}

/**
 * Custom hook for username validation with optional availability checking
 * This replaces the need for global Apollo client access
 */
export const useUsernameValidation = (): UseUsernameValidationResult => {
  const [isValidating, setIsValidating] = useState(false);
  const { t } = useTranslation();

  const validateUsernameWithAvailability = useCallback(async (
    username: string, 
    checkAvailability: boolean = true
  ) => {
    setIsValidating(true);
    
    try {
      // First do basic validation
      const validationResult = validateUsername(username, t);
      
      // If basic validation passes and we should check availability
      if (validationResult.isValid && validationResult.normalizedUsername && checkAvailability) {
        const availability = await checkUsernameAvailability(
          validationResult.normalizedUsername,
        );
        
        if (!availability.isAvailable) {
          return {
            ...validationResult,
            isValid: false,
            errors: [...validationResult.errors, availability.error || t('auth.validations.username.alreadyExists')],
            availability
          };
        }
        
        return { ...validationResult, availability };
      }
      
      return validationResult;
    } finally {
      setIsValidating(false);
    }
  }, [t]);

  return {
    validateUsernameWithAvailability,
    isValidating
  };
};
