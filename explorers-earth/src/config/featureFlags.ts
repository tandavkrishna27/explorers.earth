/**
 * Feature Flags Configuration
 * 
 * This file contains feature flags to enable/disable functionality across the app.
 * 
 * AUTHENTICATION FLAGS:
 * - ENABLE_MANUAL_AUTH: Set to false to disable email/password authentication
 *   When false, only OAuth methods (Google) will be available
 * 
 * To re-enable manual authentication in the future:
 * Simply change ENABLE_MANUAL_AUTH back to true
 */

export const FEATURE_FLAGS = {
  // Set to false to use only Google OAuth authentication
  // Set to true to re-enable email/password authentication
  ENABLE_MANUAL_AUTH: false,
  
  // Future feature flags can be added here
  // ENABLE_SOCIAL_SHARING: true,
  // ENABLE_ADVANCED_ANALYTICS: true,
} as const;

// Helper function to check if manual authentication is enabled
export const isManualAuthEnabled = () => FEATURE_FLAGS.ENABLE_MANUAL_AUTH;

// Helper function to check if only OAuth is enabled
export const isOAuthOnlyMode = () => !FEATURE_FLAGS.ENABLE_MANUAL_AUTH;
