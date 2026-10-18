import { describe, expect, it } from 'vitest';

import {
  FALLBACK_LOCALE,
  englishReferenceContent,
  loadReferenceContent,
  normalizeReferenceLocale,
} from '..';

/**
 * These assertions are about the property the 7.2 decision bought: a
 * legally-required page must not be blank for any visitor, in any locale,
 * without a backend. They are deliberately about non-emptiness and fallback,
 * not about the words — the copy is owner content and changes without notice.
 */
describe('reference content', () => {
  describe('locale normalisation', () => {
    it('resolves a region-tagged or differently-cased locale to its base', () => {
      expect(normalizeReferenceLocale('en-GB')).toBe('en');
      expect(normalizeReferenceLocale('HI')).toBe('hi');
      expect(normalizeReferenceLocale('pt_BR')).toBe('pt');
    });

    it('resolves a locale with no content to English', () => {
      // i18n/resources ships 47 locales; Strapi only ever held ten.
      expect(normalizeReferenceLocale('cs')).toBe(FALLBACK_LOCALE);
      expect(normalizeReferenceLocale('gu')).toBe(FALLBACK_LOCALE);
      expect(normalizeReferenceLocale(undefined)).toBe(FALLBACK_LOCALE);
      expect(normalizeReferenceLocale('')).toBe(FALLBACK_LOCALE);
    });
  });

  describe('English is bundled and complete', () => {
    it('carries every section, so the fallback never depends on a chunk load', () => {
      expect(englishReferenceContent.locale).toBe('en');
      expect(englishReferenceContent.terms.length).toBeGreaterThan(0);
      expect(englishReferenceContent.privacy.length).toBeGreaterThan(0);
      expect(englishReferenceContent.cookies.length).toBeGreaterThan(0);
      expect(englishReferenceContent.faqs.length).toBeGreaterThan(0);
    });

    it('pre-sorts the FAQ by Sequence, so no consumer has to', () => {
      const sequences = englishReferenceContent.faqs.map((faq) => faq.Sequence);
      expect(sequences).toStrictEqual([...sequences].sort((a, b) => a - b));
    });

    it('uses only block types RichTextContent renders', () => {
      // RichTextContent returns '' for an unknown block type, so an unrendered
      // type is silently missing copy rather than a visible failure.
      const rendered = new Set(['paragraph', 'heading', 'list', 'quote']);
      const blocks = [
        ...englishReferenceContent.terms,
        ...englishReferenceContent.privacy,
        ...englishReferenceContent.cookies,
      ];
      const unrenderable = blocks.map((block) => block.type).filter((type) => !rendered.has(type));
      expect(unrenderable).toStrictEqual([]);
    });
  });

  describe('every locale resolves to something renderable', () => {
    const locales = ['en', 'hi', 'bn', 'es', 'ar', 'fr', 'pt', 'ru', 'de', 'id'];

    it.each(locales)('%s has non-empty terms, privacy, cookies and FAQ', async (locale) => {
      const content = await loadReferenceContent(locale);
      expect(content.terms.length).toBeGreaterThan(0);
      expect(content.privacy.length).toBeGreaterThan(0);
      expect(content.cookies.length).toBeGreaterThan(0);
      expect(content.faqs.length).toBeGreaterThan(0);
    });

    // The product launches free (backbone D3). Two FAQ answers advertised paid tiers:
    // a "paid plans" upsell and a ₹300/month LocalTunes subscription, both in all ten
    // locales. The sibling assertions here are deliberately about non-emptiness rather
    // than wording, so nothing else would have caught a false price claim.
    //
    // Two assertions, not one, because a paid-tier claim can be regexed reliably in
    // nine languages only by its NUMBERS. Prose is pinned in English, at the source the
    // owner actually authors, and the currency markers are pinned everywhere.
    const PRICE_MARKER = /₹|\bINR\b|\b300\b/;

    it.each(locales)('%s quotes no price in any FAQ answer', async (locale) => {
      const content = await loadReferenceContent(locale);
      const answers = content.faqs.map((faq) => faq.Answer).join('\n');
      expect(answers).not.toMatch(PRICE_MARKER);
    });

    it('offers no paid tier in the English FAQ copy', () => {
      const answers = englishReferenceContent.faqs.map((faq) => faq.Answer).join('\n');
      expect(answers).not.toMatch(/premium|subscription|paid plan/i);
    });

    it('falls back section by section, not locale by locale', async () => {
      // Strapi held Hindi terms and Hindi FAQ but no Hindi privacy policy. The
      // Hindi visitor must keep the translated sections and borrow only the
      // untranslated ones.
      const hindi = await loadReferenceContent('hi');
      expect(hindi.locale).toBe('hi');
      expect(hindi.terms).not.toStrictEqual(englishReferenceContent.terms);
      expect(hindi.faqs).not.toStrictEqual(englishReferenceContent.faqs);
      expect(hindi.privacy).toStrictEqual(englishReferenceContent.privacy);
      expect(hindi.cookies).toStrictEqual(englishReferenceContent.cookies);
    });

    it('serves English to a locale with no file at all', async () => {
      const content = await loadReferenceContent('cs');
      expect(content).toStrictEqual(englishReferenceContent);
    });
  });

  // The [bracket] lint. Legal copy exported from Strapi still carries template slots
  // ("[Your Company Name]", "[your app URL]") that render verbatim on the live Terms,
  // Privacy and Cookie pages. Any square-bracketed run in a locale file fails here.
  //
  // PENDING_OWNER_COPY lists the slots that exist today, each waiting on owner-supplied
  // legal text; it is not a licence to add more. When the owner fills one in, remove it
  // from the list - the second case fails until that happens, so the list cannot go stale.
  describe('legal copy has no unfilled [bracket] placeholders', () => {
    // 44 occurrences across terms (en ar de es fr hi pt ru), privacy (en) and cookies (en).
    // English privacy also has "Postal Address: [your app URL]" - a URL slot where an
    // address belongs, so filling that slot is a wording fix as well as a value.
    const PENDING_OWNER_COPY = new Set<string>([
      '[Your Company Name]',
      '[your app URL]',
      '[Your Country/State]',
      '[Your Contact Email]',
      '[your contact email]',
    ]);
    const files = import.meta.glob('../*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
    const strings = (value: unknown): string[] => typeof value === 'string' ? [value]
      : Array.isArray(value) ? value.flatMap(strings)
        : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
    const placeholders = Object.entries(files).flatMap(([file, content]) =>
      strings(content).flatMap((text) => Array.from(text.matchAll(/\[[^\]\n]{1,80}\]/g), (match) => ({ file, slot: match[0] }))));

    it('finds the locale files it lints', () => {
      expect(Object.keys(files).length).toBeGreaterThanOrEqual(10);
    });

    it('carries no bracketed slot outside the owner-pending list', () => {
      expect(placeholders.filter(({ slot }) => !PENDING_OWNER_COPY.has(slot))).toStrictEqual([]);
    });

    it('lists only slots that still exist', () => {
      const present = new Set(placeholders.map(({ slot }) => slot));
      expect([...PENDING_OWNER_COPY].filter((slot) => !present.has(slot))).toStrictEqual([]);
    });
  });
});
