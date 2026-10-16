import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Isolated because it mocks a locale chunk into failing, which is module-global.
 *
 * This is the assertion the whole 7.2 decision rests on: putting the copy in
 * the repo is only worth the loss of CMS editing if a legal page cannot go
 * blank. A locale chunk is still a separate network fetch at runtime, so it is
 * the one remaining way this could fail — and it must degrade to the bundled
 * English copy rather than reject.
 */
describe('reference content, when a locale chunk fails to load', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../hi.json');
  });

  it('resolves to the bundled English copy instead of rejecting', async () => {
    vi.resetModules();
    vi.doMock('../hi.json', () => {
      throw new Error('simulated chunk load failure');
    });

    const { loadReferenceContent, englishReferenceContent } = await import('..');
    const content = await loadReferenceContent('hi');

    expect(content).toStrictEqual(englishReferenceContent);
    expect(content.terms.length).toBeGreaterThan(0);
    expect(content.privacy.length).toBeGreaterThan(0);
    expect(content.cookies.length).toBeGreaterThan(0);
  });
});
