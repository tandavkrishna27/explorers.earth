/**
 * Only persist `mobile_number` when it actually has a value. A blank write would
 * overwrite a stored number with "" — and ProtectedRoute treats an account with
 * an empty mobile_number as "not onboarded", bouncing a real account back to
 * onboarding. Clearing the number must be an explicit action, never a side effect
 * of saving the profile with an empty phone field.
 */
export const mobileNumberField = (
  mobile?: string
): { mobile_number?: string } =>
  mobile && mobile.trim() ? { mobile_number: mobile } : {};
