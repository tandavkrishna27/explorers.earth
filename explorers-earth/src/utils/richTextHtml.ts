/**
 * Canonical form of editor HTML: non-breaking spaces (entity or character) become plain
 * spaces, runs of whitespace collapse, and an editor that holds only empty paragraphs is
 * the empty string. Tags and other entities are kept, so formatting survives.
 */
export function normalizeRichTextHtml(html: string | null | undefined): string {
  if (!html) return "";
  const normalized = html
    .replace(/&nbsp;|&#160;|&#xa0;|\u00a0/gi, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
  return /^(<p>\s*(<br\s*\/?>)?\s*<\/p>\s*)*$/i.test(normalized) ? "" : normalized;
}
