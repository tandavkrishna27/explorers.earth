/**
 * URL utility functions for handling UTM parameters and URL manipulation
 */

export interface UTMParameters {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const satisfies readonly (keyof UTMParameters)[];

const FIRST_TOUCH_UTM_STORAGE_KEY = 'explorers-first-touch-utm';
const FIRST_TOUCH_REFERRER_STORAGE_KEY = 'explorers-first-touch-referrer';
const FIRST_TOUCH_UTM_TTL_MS = 30 * 60 * 1000;

interface SessionAttributionOptions {
  url?: string;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  now?: () => number;
}

interface SessionReferrerAttributionOptions extends SessionAttributionOptions {
  referrer?: string;
}

/**
 * Appends UTM parameters to a URL while preserving existing query parameters
 * @param url - The base URL to append UTM parameters to
 * @param utmParams - Object containing UTM parameters
 * @returns URL with UTM parameters appended
 */
export const appendUtmParams = (url: string, utmParams: UTMParameters): string => {
  if (!url || Object.keys(utmParams).length === 0) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    
    // Add UTM parameters to the URL
    Object.entries(utmParams).forEach(([key, value]) => {
      if (value && value.trim() !== '') {
        urlObj.searchParams.set(key, value.trim());
      }
    });

    return urlObj.toString();
  } catch (error) {
    console.error('Error appending UTM parameters:', error);
    return url; // Return original URL if parsing fails
  }
};

/**
 * Extracts UTM parameters from a URL
 * @param url - The URL to extract UTM parameters from
 * @returns Object containing UTM parameters found in the URL
 */
export const extractUtmParams = (url: string): UTMParameters => {
  if (!url) {
    return {};
  }

  try {
    const urlObj = new URL(url);
    const utmParams: UTMParameters = {};

    // Extract UTM parameters from URL
    UTM_KEYS.forEach(key => {
      const value = urlObj.searchParams.get(key);
      if (value) {
        utmParams[key] = value;
      }
    });

    return utmParams;
  } catch (error) {
    console.error('Error extracting UTM parameters:', error);
    return {};
  }
};

/**
 * Extracts UTM parameters from the current page URL
 * @returns Object containing UTM parameters from the current page
 */
export const extractUtmParamsFromCurrentUrl = (): UTMParameters => {
  return extractUtmParams(window.location.href);
};

/**
 * Creates predefined UTM parameter sets for common use cases
 */
export const createUtmParams = {
  /**
   * UTM parameters for QR code scans
   */
  qrCode: (): UTMParameters => ({
    utm_source: 'qr_code_scan',
    utm_medium: 'qr_code',
  }),

  /**
   * UTM parameters for social media sharing
   */
  socialMedia: (platform: string): UTMParameters => ({
    utm_source: platform.toLowerCase(),
    utm_medium: 'social',
  }),

  /**
   * UTM parameters for direct sharing
   */
  directShare: (): UTMParameters => ({
    utm_source: 'direct',
    utm_medium: 'share',
  }),

  /**
   * UTM parameters for email sharing
   */
  email: (): UTMParameters => ({
    utm_source: 'email',
    utm_medium: 'email',
  }),

  /**
   * UTM parameters for referral links
   */
  referral: (referrer: string): UTMParameters => ({
    utm_source: referrer,
    utm_medium: 'referral',
  }),
};

/**
 * Validates UTM parameters to ensure they meet standard requirements
 * @param utmParams - UTM parameters to validate
 * @returns Object with validation results
 */
export const validateUtmParams = (utmParams: UTMParameters): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  // Check for required parameters (source and medium are typically required)
  if (!utmParams.utm_source) {
    errors.push('utm_source is required');
  }
  if (!utmParams.utm_medium) {
    errors.push('utm_medium is required');
  }

  // Check parameter lengths (Google Analytics has limits)
  Object.entries(utmParams).forEach(([key, value]) => {
    if (value && value.length > 100) {
      errors.push(`${key} exceeds maximum length of 100 characters`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Sanitizes UTM parameters by trimming whitespace and removing invalid characters
 * @param utmParams - UTM parameters to sanitize
 * @returns Sanitized UTM parameters
 */
export const sanitizeUtmParams = (utmParams: UTMParameters): UTMParameters => {
  const sanitized: UTMParameters = {};

  Object.entries(utmParams).forEach(([key, value]) => {
    if (value) {
      // Trim whitespace and remove any characters that might cause issues in URLs
      const sanitizedValue = value.trim().replace(/[<>"']/g, '');
      if (sanitizedValue) {
        sanitized[key as keyof UTMParameters] = sanitizedValue;
      }
    }
  });

  return sanitized;
};

/**
 * Keeps the first consented campaign touch through internal navigation while
 * bounding attribution to a 30-minute browser session window.
 */
export const getSessionAttributionUtmParams = ({
  url = window.location.href,
  storage = sessionStorage,
  now = Date.now,
}: SessionAttributionOptions = {}): UTMParameters => {
  const current = sanitizeUtmParams(extractUtmParams(url));
  const capturedAt = now();

  try {
    const stored = storage.getItem(FIRST_TOUCH_UTM_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as {
        params?: UTMParameters;
        capturedAt?: number;
      };
      if (
        parsed.params &&
        typeof parsed.capturedAt === 'number' &&
        capturedAt - parsed.capturedAt <= FIRST_TOUCH_UTM_TTL_MS
      ) {
        return sanitizeUtmParams(parsed.params);
      }
      storage.removeItem(FIRST_TOUCH_UTM_STORAGE_KEY);
    }
  } catch {
    storage.removeItem(FIRST_TOUCH_UTM_STORAGE_KEY);
  }

  if (Object.keys(current).length === 0) return {};

  storage.setItem(
    FIRST_TOUCH_UTM_STORAGE_KEY,
    JSON.stringify({ params: current, capturedAt }),
  );
  return current;
};

/**
 * Keeps a privacy-safe first-touch referral for the same attribution window.
 * Only the external HTTP(S) origin is retained; paths and query strings are
 * deliberately discarded, and direct traffic is locked as a first touch too.
 */
export const getSessionAttributionReferrerOrigin = ({
  url = window.location.href,
  referrer = document.referrer,
  storage = sessionStorage,
  now = Date.now,
}: SessionReferrerAttributionOptions = {}): string | undefined => {
  const capturedAt = now();

  try {
    const stored = storage.getItem(FIRST_TOUCH_REFERRER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as {
        origin?: string | null;
        capturedAt?: number;
      };
      if (
        typeof parsed.capturedAt === 'number' &&
        capturedAt - parsed.capturedAt <= FIRST_TOUCH_UTM_TTL_MS &&
        (typeof parsed.origin === 'string' || parsed.origin === null)
      ) {
        return parsed.origin || undefined;
      }
      storage.removeItem(FIRST_TOUCH_REFERRER_STORAGE_KEY);
    }
  } catch {
    try {
      storage.removeItem(FIRST_TOUCH_REFERRER_STORAGE_KEY);
    } catch {
      return undefined;
    }
  }

  let origin: string | undefined;
  try {
    const currentUrl = new URL(url);
    const referrerUrl = new URL(referrer);
    if (
      (referrerUrl.protocol === 'http:' || referrerUrl.protocol === 'https:') &&
      referrerUrl.origin !== currentUrl.origin
    ) {
      origin = referrerUrl.origin;
    }
  } catch {
    origin = undefined;
  }

  try {
    storage.setItem(
      FIRST_TOUCH_REFERRER_STORAGE_KEY,
      JSON.stringify({ origin: origin ?? null, capturedAt }),
    );
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return origin;
};
