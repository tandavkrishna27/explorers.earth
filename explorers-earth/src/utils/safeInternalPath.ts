/**
 * Strict allow-list for user-supplied "go back to" targets (?return=, ?next=, ...).
 * Returns the path (with query/hash) when it is a same-origin, in-app path, else null.
 *
 * Browsers treat "\" like "/" in special-scheme URLs, so "/\evil.example" resolves to
 * http://evil.example/. Rather than blacklisting known tricks we require a single leading
 * "/", no backslash/control/whitespace characters anywhere, and a same-origin resolve.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\\\s\u0000-\u001f\u007f-\u009f]/;

export function safeInternalPath(
  value: string | null | undefined,
  origin: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value[0] !== '/' || value[1] === '/' || value[1] === '\\') return null;
  if (FORBIDDEN.test(value)) return null;
  // Percent-encoded backslash / slash right after the leading "/" can be decoded by
  // downstream consumers into a protocol-relative URL.
  if (/^\/(%5c|%2f|%09|%0a|%0d)/i.test(value)) return null;
  try {
    const resolved = new URL(value, origin);
    if (resolved.origin !== new URL(origin).origin) return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}
