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
});
