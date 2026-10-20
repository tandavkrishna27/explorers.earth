/**
 * Bio helpers. The account contract stores `bioPlain` (text) and `bioRich` ({ blocks: [{ text }] }).
 * The editor and the public page work with HTML, so the conversions live here in one place.
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'",
};

const MAX_BLOCK = 5000;
const MAX_BLOCKS = 100;

// Older saves stored the editor's HTML in bioPlain. Editor HTML always opens with a block element
// (the editor wraps every line in <p>, lists in <ul>/<ol>), whereas a person typing "<b>" or "<3"
// into their bio produces plain text that merely contains angle brackets. Only the former is HTML.
const LEGACY_BLOCK_HTML = /^\s*<(?:p|div|h[1-6]|ul|ol|blockquote)(?:\s[^>]*)?>/i;
export const isStoredBioHtml = (value: string): boolean => LEGACY_BLOCK_HTML.test(value);

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

/**
 * Plain text for a bio that was read back from storage: text as saved, or the legacy editor HTML an
 * older save left in bioPlain. Text that only contains angle brackets is returned untouched.
 */
export function toBioPlain(value: unknown): string {
  if (typeof value !== "string") return "";
  return isStoredBioHtml(value) ? htmlToPlainText(value) : value.trim();
}

/**
 * Plain text for saving, from the editor's HTML. The editor escapes any "<" or "&" the person typed
 * (as &lt; / &amp;), so a literal "<b>" survives as text while real markup is dropped.
 */
export function editorBioToPlain(html: unknown): string {
  return typeof html === "string" ? htmlToPlainText(html) : "";
}

/** The `bioRich` contract value for an editor bio, or null when it is empty. */
export function toBioRich(html: unknown): { blocks: Array<{ text: string }> } | null {
  const text = editorBioToPlain(html);
  if (!text) return null;
  const blocks = text.split("\n").map((line) => line.trim()).filter(Boolean)
    .slice(0, MAX_BLOCKS).map((line) => ({ text: line.slice(0, MAX_BLOCK) }));
  return blocks.length ? { blocks } : null;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * HTML for the editor and the public page. Plain text is escaped (so a typed "<b>" stays text) with
 * one paragraph per line, blank lines kept; legacy HTML stored by an older save is passed through
 * untouched, to be sanitised by the caller as before.
 */
export function bioToHtml(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  if (isStoredBioHtml(value)) return value;
  return value.replace(/\r\n?/g, "\n").trim().split("\n")
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p><br></p>")).join("");
}
