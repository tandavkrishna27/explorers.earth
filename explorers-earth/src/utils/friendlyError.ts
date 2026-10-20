import i18n from "i18next";

/**
 * The URL rule every owner-content contract enforces (tunes/shared/explorers*Contract.ts,
 * safe*UrlSchema): http(s) only, at most 2048 characters, no embedded credentials, no
 * explicit port. Kept in step here so forms can give inline feedback before Save.
 */
export function isSafeContentUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

const URL_RULE =
  "Enter a web address starting with http:// or https://. Ports (like :8443) and usernames or passwords in the address are not allowed.";

// English default keeps this readable if the catalog has not loaded yet.
const tr = (key: string, defaultValue: string, options: Record<string, unknown> = {}) =>
  i18n.isInitialized ? String(i18n.t(key, { defaultValue, ...options })) : defaultValue;

/** Inline message for a URL field, or null when empty (optional) or acceptable. */
export function urlFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || isSafeContentUrl(trimmed)) return null;
  return tr("validation.urlRule", URL_RULE);
}

type Issue = { message?: unknown; path?: unknown; code?: unknown };

function issuesOf(error: unknown): Issue[] | null {
  if (error && typeof error === "object" && Array.isArray((error as { issues?: unknown }).issues)) {
    return (error as { issues: Issue[] }).issues;
  }
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (message.trimStart().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(message);
      if (Array.isArray(parsed) && parsed.every(item => item && typeof item === "object" && "path" in item)) {
        return parsed as Issue[];
      }
    } catch { /* not a validation payload */ }
  }
  return null;
}

const humanize = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();

/**
 * Message safe to show a person. Validation payloads (zod issue arrays, thrown or serialised
 * into an error message) become plain field messages; everything else keeps its own message.
 */
export function friendlyErrorMessage(error: unknown, fallback: string): string {
  const issues = issuesOf(error);
  if (issues) {
    const messages = new Set<string>();
    for (const issue of issues) {
      const path = Array.isArray(issue.path) ? issue.path : [];
      const leaf = String(path[path.length - 1] ?? "");
      if (/url|link|website/i.test(leaf) || issue.message === "Invalid URL") {
        messages.add(tr("validation.urlRule", URL_RULE));
      } else if (typeof issue.message === "string" && issue.message && !/^(invalid input|required)$/i.test(issue.message)) {
        messages.add(issue.message);
      } else if (leaf) {
        messages.add(tr("validation.checkField", `Please check the ${humanize(leaf)} field.`, { field: humanize(leaf) }));
      }
    }
    return messages.size ? [...messages].join(" ") : tr("validation.generic", "Please check the highlighted fields and try again.");
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
