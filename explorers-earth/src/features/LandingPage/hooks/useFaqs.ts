import { useReferenceContent } from './useReferenceContent';

export type Faq = {
  locale: string;
  Question: string;
  Answer: string;
  Sequence: number;
};

/**
 * The landing page FAQ. Read from the in-repo reference content, not Strapi.
 *
 * The files are pre-sorted by `Sequence`, so the runtime sort this hook used to
 * do is gone. `error` is kept in the shape its consumer branches on and is
 * always `undefined`: there is no failure path left (see `useReferenceContent`).
 */
export const useFaqs = () => {
  const { content, loading } = useReferenceContent();

  const faqs: Faq[] = content.faqs.map((faq) => ({ ...faq, locale: content.locale }));

  return {
    faqs,
    loading,
    error: undefined,
  };
};
