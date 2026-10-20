import {
  handleRuleViolations,
  RESERVED_WORDS,
  PROFANITY_WORDS,
  type HandleRuleCode,
} from '../../../tunes/shared/explorersReservedHandles';

/**
 * USERNAME VALIDATION UTILITY
 * 
 * This utility provides comprehensive username validation for explorers.
 * All username validation logic should use this utility to ensure consistency.
 * 
 * VALIDATION RULES:
 * 1. Allowed Characters: lowercase letters (a-z), digits (0-9), hyphens (-)
 * 2. Length: 3-30 characters
 * 3. Structure: must start with letter, cannot start/end with hyphen, no consecutive hyphens
 * 4. Cannot be all numbers
 * 5. Reserved routes/words are blocked (case-insensitive; exact, or word + digits)
 * 6. Basic profanity filtering
 * 7. Case handling: converts to lowercase with warning
 * 
 * USAGE:
 * - Use validateUsername() for complete validation
 * - Use suggestAlternatives() to provide user-friendly alternatives
 * - Always check isUsernameAvailable() for uniqueness if API is available
 * 
 * UPDATE INSTRUCTIONS:
 * - The rules live in tunes/shared/explorersReservedHandles.ts and are shared with the server.
 *   Add reserved routes/words/profanity there, never here.
 * - Reserved words match exactly (or word + digits), not as hyphen-delimited fragments.
 */

export interface UsernameValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  normalizedUsername?: string;
}

export interface UsernameAvailabilityResult {
  isAvailable: boolean;
  error?: string;
}

/**
 * Validates username against all rules
 * @param username - The username to validate
 * @returns Validation result with errors, warnings, and suggestions
 */
export const validateUsername = (username: string, t?: (key: string) => string): UsernameValidationResult => {
  const result: UsernameValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: []
  };

  // Handle empty/null username
  if (!username || username.trim() === '') {
    result.isValid = false;
    result.errors.push(t ? t('auth.validations.username.required') : 'Username is required');
    return result;
  }

  const trimmedUsername = username.trim();

  // Check for uppercase characters (warning, not error)
  if (/[A-Z]/.test(trimmedUsername)) {
    result.warnings.push(t ? t('auth.validations.username.willConvertToLowercase') : 'Username will be converted to lowercase');
  }

  // Normalize to lowercase
  const normalizedUsername = trimmedUsername.toLowerCase();
  result.normalizedUsername = normalizedUsername;

  const messages: Record<HandleRuleCode, [string, string]> = {
    invalidChars: ['auth.validations.username.invalidChars', 'Username can only contain lowercase letters (a-z), numbers (0-9), and hyphens (-)'],
    minLength: ['auth.validations.username.minLength', 'Username must be at least 3 characters long'],
    maxLength: ['auth.validations.username.maxLength', 'Username must not exceed 30 characters'],
    mustStartWithLetter: ['auth.validations.username.mustStartWithLetter', 'Username must start with a letter (a-z)'],
    hyphenEdge: ['auth.validations.username.cannotStartEndHyphen', 'Username cannot start or end with a hyphen'],
    consecutiveHyphens: ['auth.validations.username.noConsecutiveHyphens', 'Username cannot contain consecutive hyphens'],
    allNumbers: ['auth.validations.username.cannotBeAllNumbers', 'Username cannot be all numbers'],
    reserved: ['auth.validations.username.reservedWords', 'This username contains reserved words and cannot be used'],
    profanity: ['auth.validations.username.inappropriateContent', 'Username contains inappropriate content'],
  };

  // One rule set shared with the server (tunes/shared/explorersReservedHandles.ts).
  for (const code of handleRuleViolations(normalizedUsername)) {
    result.isValid = false;
    const [key, fallback] = messages[code];
    result.errors.push(t ? t(key) : fallback);
  }

  // Generate suggestions if username is invalid
  if (!result.isValid) {
    result.suggestions = suggestAlternatives(normalizedUsername);
  }

  return result;
};

/**
 * Suggests alternative usernames based on the invalid input
 * @param username - The invalid username
 * @returns Array of suggested alternatives
 */
export const suggestAlternatives = (username: string): string[] => {
  const suggestions: string[] = [];
  const currentYear = new Date().getFullYear();

  // Clean the username to make it valid
  let cleanUsername = username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 25); // Leave room for suffixes

  // Ensure it starts with a letter
  if (!/^[a-z]/.test(cleanUsername)) {
    cleanUsername = 'user' + cleanUsername;
  }

  // If it's all numbers, prefix with 'user'
  if (/^[0-9]+$/.test(cleanUsername)) {
    cleanUsername = 'user' + cleanUsername;
  }

  // If it's too short, pad with 'user'
  if (cleanUsername.length < 3) {
    cleanUsername = 'user' + cleanUsername;
  }

  // Remove reserved words by replacing them
  RESERVED_WORDS.forEach(word => {
    const regex = new RegExp(word, 'gi');
    if (regex.test(cleanUsername)) {
      cleanUsername = cleanUsername.replace(regex, 'user');
    }
  });

  // Remove profanity (using word boundaries to avoid false positives)
  PROFANITY_WORDS.forEach(word => {
    const lowerWord = word.toLowerCase();
    // Match profanity only as a whole word (not as substring)
    const escapedWord = lowerWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^a-z])${escapedWord}([^a-z]|$)`, 'gi');
    if (pattern.test(cleanUsername)) {
      // Replace the profanity word with 'user', preserving surrounding characters
      cleanUsername = cleanUsername.replace(new RegExp(escapedWord, 'gi'), 'user');
    }
  });

  // Ensure final cleanup
  cleanUsername = cleanUsername
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 25);

  if (cleanUsername.length >= 3) {
    // Basic suggestions
    suggestions.push(cleanUsername);
    suggestions.push(`${cleanUsername}${Math.floor(Math.random() * 99) + 1}`);
    suggestions.push(`${cleanUsername}${currentYear}`);
    suggestions.push(`${cleanUsername}${currentYear.toString().slice(-2)}`);

    // Add some creative variations
    if (cleanUsername.length <= 27) {
      suggestions.push(`${cleanUsername}qr`);
      suggestions.push(`my${cleanUsername}`);
    }
  } else {
    // Fallback suggestions
    suggestions.push(`member${Math.floor(Math.random() * 9999) + 1}`);
    suggestions.push(`localuser${currentYear.toString().slice(-2)}`);
    suggestions.push(`qruser${Math.floor(Math.random() * 999) + 1}`);
  }

  // Never offer a handle the shared rules refuse (a reserved route such as "music" or the
  // input itself): a suggestion must be something the creator can actually take (ONB-X02).
  const usable = [...new Set(suggestions)].filter((candidate) => candidate !== username && handleRuleViolations(candidate).length === 0);
  if (usable.length === 0) usable.push(`member${Math.floor(Math.random() * 9000) + 1000}`);
  return usable.slice(0, 5);
};

/**
 * Checks if username is available by querying the GraphQL API
 * @param username - The username to check
 * @param apolloClient - Apollo client instance (required)
 * @returns Promise with availability result
 */
/**
 * Whether a handle is free, from the canonical public read.
 *
 * This is a hint, not an authority. The authority is the unique index on the account
 * handle, which refuses a duplicate at write time; the answer can change between this call
 * and that write, so the conflict still has to be handled where the handle is saved. What
 * this buys is telling a creator about a collision while they are typing rather than after
 * they submit a whole onboarding form.
 *
 * A failure reports NOT available. That is deliberate and it is the conservative direction:
 * offering a handle as free when the check did not run would turn an outage into a form the
 * creator cannot submit, and this way the only cost is an unnecessary retry. It is also why
 * the submit path cannot rely on this and must handle the conflict itself.
 */
export const checkUsernameAvailability = async (
  username: string,
  signal?: AbortSignal
): Promise<UsernameAvailabilityResult> => {
  try {
    const response = await fetch(
      `/api/explorers/v1/public/handles/${encodeURIComponent(username.toLowerCase())}/available`,
      { cache: 'no-store', ...(signal ? { signal } : {}) }
    );
    if (!response.ok) throw new Error(`Availability check failed with ${response.status}`);
    const body = await response.json() as { available?: unknown };
    // A body that does not say `available: true` is not an availability.
    if (body.available === true) return { isAvailable: true };
    if (body.available === false) return { isAvailable: false, error: 'Username is already taken' };
    throw new Error('Availability response was not understood');
  } catch (error) {
    console.error('Error checking username availability:', error);
    return {
      isAvailable: false,
      error: 'Unable to check username availability. Please try again.'
    };
  }
};

export type HandleConfirmation = { ok: true } | { ok: false; error: string; suggestions: string[] };

/**
 * Final gate for onboarding step 1: the handle must be confirmed free, not merely well-formed.
 * A taken handle, or a check that could not run, blocks (ONB-03). `own` is the handle this account
 * already holds, which is not "taken" for the account itself.
 */
export const confirmHandleAvailable = async (
  username: string,
  messages: { taken: string; unavailable: string },
  options: { own?: string | null; check?: typeof checkUsernameAvailability } = {},
): Promise<HandleConfirmation> => {
  const handle = username.trim().toLowerCase();
  if (options.own && options.own.trim().toLowerCase() === handle) return { ok: true };
  const result = await (options.check ?? checkUsernameAvailability)(handle);
  if (result.isAvailable) return { ok: true };
  // checkUsernameAvailability reports an outage with the "Unable to check" text.
  const outage = /unable to check/i.test(result.error ?? '');
  return outage
    ? { ok: false, error: messages.unavailable, suggestions: [] }
    : { ok: false, error: messages.taken, suggestions: suggestAlternatives(handle) };
};

/**
 * Formats validation messages for display in UI
 * @param result - Validation result
 * @returns Formatted error and warning messages
 */
export const formatValidationMessages = (result: UsernameValidationResult): {
  errors: string[];
  warnings: string[];
  suggestions: string[];
  hasErrors: boolean;
  hasWarnings: boolean;
  hasSuggestions: boolean;
} => {
  return {
    errors: result.errors,
    warnings: result.warnings,
    suggestions: result.suggestions.length > 0
      ? [`Try one of these: ${result.suggestions.slice(0, 3).join(', ')}`]
      : [],
    hasErrors: result.errors.length > 0,
    hasWarnings: result.warnings.length > 0,
    hasSuggestions: result.suggestions.length > 0
  };
};

/**
 * Legacy function compatibility - replaces existing sanitizeUsername
 * @param username - Username to sanitize
 * @returns Sanitized username for path usage
 */
export const sanitizeUsernameForPath = (username: string): string => {
  const validation = validateUsername(username);
  if (validation.isValid && validation.normalizedUsername) {
    return validation.normalizedUsername;
  }

  // Fallback to basic sanitization for invalid usernames
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30) || 'user';
};
