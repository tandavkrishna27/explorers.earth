/**
 * Bio helpers. The account contract stores `bioPlain` (text) and `bioRich` ({ blocks: [{ text }] }).
 * The editor and the public page work with HTML, so the conversions live here in one place.
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'",
};

const HTML_TAG = /<\/?[a-z][^>]*>/i;
const MAX_BLOCK = 5000;
const MAX_BLOCKS = 100;

export const looksLikeHtml = (value: string): boolean => HTML_TAG.test(value);

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      return code === 0xa0 ? " " : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Decoded text of an HTML fragment: block ends become newlines, tags are dropped, entities decoded. */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(withBreaks)
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text for storage/SEO, whether the value is editor HTML, legacy HTML stored as plain, or text. */
export function toBioPlain(value: unknown): string {
  if (typeof value !== "string") return "";
  return looksLikeHtml(value) ? htmlToPlainText(value) : value.trim();
}

/** The `bioRich` contract value for a bio, or null when it is empty. */
export function toBioRich(value: unknown): { blocks: Array<{ text: string }> } | null {
  const text = toBioPlain(value);
  if (!text) return null;
  const blocks = text.split("\n").map((line) => line.trim()).filter(Boolean)
    .slice(0, MAX_BLOCKS).map((line) => ({ text: line.slice(0, MAX_BLOCK) }));
  return blocks.length ? { blocks } : null;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * HTML for the editor and the public page. Plain text is escaped and split into paragraphs;
 * a value that already holds HTML (stored by an older save) is passed through untouched, to be
 * sanitised by the caller as before.
 */
export function bioToHtml(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  if (looksLikeHtml(value)) return value;
  return value.trim().split(/\n+/).map((line) => `<p>${escapeHtml(line.trim())}</p>`).join("");
}
