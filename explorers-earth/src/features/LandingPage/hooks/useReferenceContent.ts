import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  englishReferenceContent,
  loadReferenceContent,
  normalizeReferenceLocale,
  type ReferenceContent,
} from '../../../content/reference';

/**
 * The locale-resolved reference content (FAQ + Terms/Privacy/Cookies).
 *
 * `useFaqs` and `usePlatformTerms` both sit on this. They used to hold one
 * Strapi `useQuery` each, keyed off `i18n.language`; the copy is now in the
 * repo, so this reads it instead.
 *
 * `loading` is only ever true while a non-English locale chunk is in flight,
 * and English is bundled, so there is always something to render. There is no
 * failure path: `loadReferenceContent` falls back to English rather than
 * rejecting, deliberately, because a chunk error must not blank a legal page.
 */
export const useReferenceContent = (): { content: ReferenceContent; loading: boolean } => {
  const { i18n } = useTranslation();
  const locale = normalizeReferenceLocale(i18n.language);
  const isBundled = locale === englishReferenceContent.locale;

  const [content, setContent] = useState<ReferenceContent>(englishReferenceContent);
  const [loading, setLoading] = useState(!isBundled);

  useEffect(() => {
    if (isBundled) {
      setContent(englishReferenceContent);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    void loadReferenceContent(locale).then((resolved) => {
      if (!active) return;
      setContent(resolved);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [locale, isBundled]);

  return { content, loading };
};
