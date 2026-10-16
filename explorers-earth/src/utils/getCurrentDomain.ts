import { isCanonicalRuntime, getPublicRuntimeConfig } from "../lib/publicRuntimeConfig";
/**
 * Get the current domain dynamically
 * Works both in browser and during server-side rendering
 */
export const getCurrentDomain = () => {
  if (isCanonicalRuntime()) return getPublicRuntimeConfig().origin;
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const domain = window.location.host;
    return `${protocol}//${domain}`;
  }

  // Fallback for server-side rendering or build time
  // This will be replaced with the actual domain at runtime
  return import.meta.env.VITE_BASE_URL || 'https://explorers.earth';
};

/**
 * Get the base URL for the application
 * This is a more semantic alternative to getCurrentDomain
 */
export const getBaseUrl = () => {
  return getCurrentDomain();
};

/**
 * Create a full URL from a path
 * @param path - The path to append to the base URL (should start with /)
 */
export const createFullUrl = (path: string) => {
  const baseUrl = getBaseUrl();
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
};

/**
 * Create canonical URLs for SEO
 * @param path - The path for the canonical URL
 */
export const createCanonicalUrl = (path: string) => {
  return createFullUrl(path);
};
