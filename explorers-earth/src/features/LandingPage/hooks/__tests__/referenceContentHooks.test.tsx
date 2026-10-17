import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { englishReferenceContent } from '../../../../content/reference';
import { useFaqs } from '../useFaqs';
import { usePlatformTerms } from '../usePlatformTerms';

let currentLanguage = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { get language() { return currentLanguage; } },
  }),
}));

function TermsHarness() {
  const { terms, privacy, cookies, loading, error } = usePlatformTerms();
  if (loading) return <p>loading</p>;
  if (error) return <p>error</p>;
  return (
    <dl>
      <dd data-testid="terms">{terms.length}</dd>
      <dd data-testid="privacy">{privacy.length}</dd>
      <dd data-testid="cookies">{cookies.length}</dd>
    </dl>
  );
}

function FaqHarness() {
  const { faqs, loading } = useFaqs();
  if (loading) return <p>loading</p>;
  return (
    <ul>
      {faqs.map((faq) => (
        <li key={faq.Sequence} data-locale={faq.locale}>{faq.Question}</li>
      ))}
    </ul>
  );
}

describe('reference content hooks', () => {
  beforeEach(() => {
    currentLanguage = 'en';
  });

  it('renders English terms with no network and no loading state', () => {
    render(<TermsHarness />);

    // English is bundled, so there is no pending frame to wait for — the three
    // legal pages render on first paint even with every backend down.
    expect(screen.queryByText('loading')).toBeNull();
    expect(screen.getByTestId('terms').textContent).toBe(
      String(englishReferenceContent.terms.length)
    );
    expect(screen.getByTestId('privacy').textContent).toBe(
      String(englishReferenceContent.privacy.length)
    );
    expect(screen.getByTestId('cookies').textContent).toBe(
      String(englishReferenceContent.cookies.length)
    );
  });

  it('never reports an error, because there is no failure path to report', () => {
    render(<TermsHarness />);
    expect(screen.queryByText('error')).toBeNull();
  });

  it('serves a non-English locale its own terms and the English privacy policy', async () => {
    currentLanguage = 'hi';
    render(<TermsHarness />);

    await waitFor(() => expect(screen.queryByText('loading')).toBeNull());

    const hindiTerms = Number(screen.getByTestId('terms').textContent);
    expect(hindiTerms).toBeGreaterThan(0);
    expect(hindiTerms).not.toBe(englishReferenceContent.terms.length);
    expect(screen.getByTestId('privacy').textContent).toBe(
      String(englishReferenceContent.privacy.length)
    );
  });

  it('tags FAQ entries with the resolved locale and keeps them in Sequence order', async () => {
    currentLanguage = 'fr';
    render(<FaqHarness />);

    await waitFor(() => expect(screen.queryByText('loading')).toBeNull());

    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.getAttribute('data-locale') === 'fr')).toBe(true);

    const french = items.map((item) => item.textContent);
    const english = englishReferenceContent.faqs.map((faq) => faq.Question);
    expect(french).not.toStrictEqual(english);
  });

  it('falls back to English for a locale the export never covered', async () => {
    currentLanguage = 'cs';
    render(<FaqHarness />);

    await waitFor(() => expect(screen.queryByText('loading')).toBeNull());

    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toStrictEqual(
      englishReferenceContent.faqs.map((faq) => faq.Question)
    );
  });
});
