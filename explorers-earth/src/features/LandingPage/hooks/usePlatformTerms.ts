import { useReferenceContent } from './useReferenceContent';
import type { RichTextBlock } from '../../../content/reference';

export type PlatformTerms = {
  Terms_and_Condition: RichTextBlock[];
  Privacy_and_Policy: RichTextBlock[];
  Cookie_Policy: RichTextBlock[];
};

/**
 * The Terms / Privacy / Cookie bodies. Read from the in-repo reference content,
 * not Strapi.
 *
 * Each section falls back to English independently, which is why a Hindi
 * visitor sees Hindi terms and the English privacy policy rather than a blank
 * page — Strapi only ever held `privacy` and `cookies` in English. `error` is
 * kept in the shape the three pages branch on and is always `undefined`: there
 * is no failure path left (see `useReferenceContent`).
 */
export const usePlatformTerms = () => {
  const { content, loading } = useReferenceContent();

  return {
    terms: content.terms,
    privacy: content.privacy,
    cookies: content.cookies,
    loading,
    error: undefined,
  };
};
