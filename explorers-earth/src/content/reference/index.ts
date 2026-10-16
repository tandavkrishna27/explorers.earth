/**
 * Reference content — FAQ and the Terms / Privacy / Cookie bodies.
 *
 * This copy used to be read from Strapi at runtime through `useFaqs` and
 * `usePlatformTerms`. It lives in the repo instead, locale-keyed beside the i18n
 * bundles, because legally-required pages must not go blank when a backend is
 * unreachable. Editing is a deploy, which is the accepted cost for four
 * rarely-changed documents.
 *
 * Provenance: exported verbatim from the live Strapi `platformTerm` and `faq`
 * collections on 2026-10-08 (all 10 locales Strapi had configured). The block
 * JSON is Strapi's rich-text block format, unchanged, so `RichTextContent`
 * renders it exactly as before. Only FAQ ordering is normalised — the files are
 * pre-sorted by `Sequence`.
 *
 * What the export showed, and what this module therefore has to do:
 * - `privacy` and `cookies` exist in **en only**. The other nine locales
 *   returned empty arrays, so those pages are already blank for a non-English
 *   visitor today.
 * - `terms` exists in eight locales; `bn` and `id` have no row at all.
 * - `faqs` are genuinely translated in all ten.
 *
 * So resolution falls back to `en` **per section**, not per locale: a Hindi
 * visitor gets Hindi terms and Hindi FAQ with the English privacy and cookie
 * policy, rather than a blank page. `en` is statically imported for that reason
 * — the fallback must not depend on a chunk load succeeding.
 */
import enContent from './en.json';

export type RichTextBlock = {
  type: string;
  level?: number;
  format?: string;
  children?: unknown[];
};

export type ReferenceFaq = {
  Question: string;
  Answer: string;
  Sequence: number;
};

export type ReferenceContent = {
  locale: string;
  terms: RichTextBlock[];
  privacy: RichTextBlock[];
  cookies: RichTextBlock[];
  faqs: ReferenceFaq[];
};

/**
 * Lazy loaders, one per locale that carries content. Static keys so Vite can
 * split each locale into its own chunk; `en` is not here because it is bundled.
 */
const LAZY_LOCALES: Record<string, () => Promise<{ default: unknown }>> = {
  ar: () => import('./ar.json'),
  bn: () => import('./bn.json'),
  de: () => import('./de.json'),
  es: () => import('./es.json'),
  fr: () => import('./fr.json'),
  hi: () => import('./hi.json'),
  id: () => import('./id.json'),
  pt: () => import('./pt.json'),
  ru: () => import('./ru.json'),
};

export const FALLBACK_LOCALE = 'en';

export const englishReferenceContent = enContent as ReferenceContent;

/** `en-GB` and `EN` both mean `en`; an unknown locale means `en`. */
export const normalizeReferenceLocale = (locale: string | undefined | null): string => {
  const base = (locale ?? '').toLowerCase().split(/[-_]/)[0];
  if (!base || base === FALLBACK_LOCALE) return FALLBACK_LOCALE;
  return base in LAZY_LOCALES ? base : FALLBACK_LOCALE;
};

/**
 * Merge a locale's content over English, section by section. An empty section
 * is treated as absent — that is what Strapi returned for the eight locales
 * with no privacy or cookie policy.
 */
const withEnglishFallback = (content: ReferenceContent): ReferenceContent => ({
  locale: content.locale,
  terms: content.terms.length > 0 ? content.terms : englishReferenceContent.terms,
  privacy: content.privacy.length > 0 ? content.privacy : englishReferenceContent.privacy,
  cookies: content.cookies.length > 0 ? content.cookies : englishReferenceContent.cookies,
  faqs: content.faqs.length > 0 ? content.faqs : englishReferenceContent.faqs,
});

/**
 * Resolve the content for a locale. Never rejects and never resolves to empty:
 * a failed chunk load falls back to the bundled English copy, because a chunk
 * error must not blank a Terms page.
 */
export const loadReferenceContent = async (
  locale: string | undefined | null
): Promise<ReferenceContent> => {
  const normalized = normalizeReferenceLocale(locale);
  if (normalized === FALLBACK_LOCALE) return englishReferenceContent;

  try {
    const loaded = await LAZY_LOCALES[normalized]();
    return withEnglishFallback(loaded.default as ReferenceContent);
  } catch {
    return englishReferenceContent;
  }
};
