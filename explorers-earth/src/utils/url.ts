// Utility to normalize external URLs entered by users
// Ensures a valid protocol is present and preserves already well-formed URLs.
export function normalizeExternalUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const url = raw.trim();
  if (!url) return undefined;

  // Accept already valid schemes
  if (/^(https?:|mailto:|tel:|sms:)/i.test(url)) {
    return url;
  }

  // Protocol-relative URLs
  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  // Common case like www.example.com/path
  if (url.startsWith("www.")) {
    return `https://${url}`;
  }

  // If it looks like a domain or path, default to https
  return `https://${url}`;
}

// Build a clickable WhatsApp link from a phone number or WhatsApp-style input
// Accepts:
// - E.164-like numbers: +1234567890 or 1234567890
// - wa.me links with or without protocol
// - api.whatsapp.com links
// Returns a full https URL suitable for <a href>
export function buildWhatsAppHref(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const input = raw.trim();
  if (!input) return undefined;

  // Already a full http(s) URL
  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  // wa.me or api.whatsapp.com without protocol
  if (/^(wa\.me\/|api\.whatsapp\.com\/)/i.test(input)) {
    return `https://${input}`;
  }

  // If it looks like a phone number, convert to wa.me/<digits>
  const phoneLike = input.replace(/[^+\d]/g, "");
  // Basic E.164-ish: optional + then 8-15 digits (we'll strip + for wa.me)
  if (/^\+?[1-9]\d{7,14}$/.test(phoneLike)) {
    const digits = phoneLike.replace(/^\+/, "");
    return `https://wa.me/${digits}`;
  }

  // Fallback to https scheme
  return `https://${input}`;
}

const INSTAGRAM_HANDLE = /^@?([\w](?!.*?\.\.)[\w.]{0,28}[\w])$/;
const SOCIAL_PROFILE = /^(?:https?:\/\/)?((?:www\.)?(?:instagram\.com\/[\w.-]+|linkedin\.com\/(?:in|company)\/[\w-]+)\/?)$/i;

/**
 * A person's Instagram or LinkedIn profile as a full https URL, or undefined when the input
 * is neither a profile URL (with or without its scheme) nor an Instagram handle. The form
 * offers "@username" and "instagram.com/username"; the stored context accepts only URLs.
 */
export function normalizeSocialProfileUrl(raw?: string | null): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const handle = INSTAGRAM_HANDLE.exec(value);
  if (handle) return `https://www.instagram.com/${handle[1]}`;
  const profile = SOCIAL_PROFILE.exec(value);
  return profile ? `https://${profile[1]}` : undefined;
}
