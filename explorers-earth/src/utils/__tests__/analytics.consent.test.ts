import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const key = 'explorers-cookie-consent';
const vendors = () => Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).filter((script) => /googletagmanager\.com|clarity\.ms/.test(script.src));

describe('analytics bootstrap consent', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    delete window.gtag;
    delete window.clarity;
    window.dataLayer = [];
    vendors().forEach((script) => script.remove());
    // A configured legacy environment must not bypass consent or replace the
    // destinations currently used by the production HTML and route tracker.
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-OTHER-DESTINATION');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vendors().forEach((script) => script.remove());
    delete window.gtag;
    delete window.clarity;
    window.dataLayer = [];
  });

  it.each([null, '{bad', 'null', 'false', '1', '"true"', '{"analytics":false}', '{"analytics":"false"}', '{"analytics":"true"}', '{"analytics":1}', '{"marketing":true}'])(
    'fails closed on startup and direct loader calls for %s', async (stored) => {
      if (stored !== null) localStorage.setItem(key, stored);
      const { initAnalytics, loadAnalytics } = await import('../analytics');
      expect(() => initAnalytics()).not.toThrow();
      expect(vendors()).toHaveLength(0);
      expect(() => loadAnalytics()).not.toThrow();
      expect(vendors()).toHaveLength(0);
      expect(window.dataLayer).toEqual([]);
    },
  );

  it.each(['/settings', '/tk2727/music'])('hydrates both existing destinations once on direct %s loads', async (path) => {
    window.history.replaceState({}, '', path);
    localStorage.setItem(key, '{"analytics":true}');
    const { initAnalytics, loadAnalytics, default: defaultLoader } = await import('../analytics');
    initAnalytics();
    initAnalytics();
    loadAnalytics();
    defaultLoader();
    expect(vendors().map((script) => script.src).sort()).toEqual([
      'https://www.clarity.ms/tag/t7xux4xstk',
      'https://www.googletagmanager.com/gtag/js?id=G-C3QBWP3ZSK',
    ]);
    expect(window.dataLayer.filter((entry) => entry[0] === 'config')).toEqual([['config', 'G-C3QBWP3ZSK']]);
    expect(window.gtag).toBeTypeOf('function');
    expect(window.clarity).toBeTypeOf('function');
  });

  it('does not let an existing GA global suppress Clarity initialization', async () => {
    localStorage.setItem(key, '{"analytics":true}');
    const existingGtag = vi.fn();
    window.gtag = existingGtag;
    const { initAnalytics } = await import('../analytics');
    initAnalytics();
    initAnalytics();
    expect(window.gtag).toBe(existingGtag);
    expect(vendors().map((script) => script.src)).toEqual(['https://www.clarity.ms/tag/t7xux4xstk']);
  });

  it('does not let an existing Clarity global suppress GA initialization', async () => {
    localStorage.setItem(key, '{"analytics":true}');
    const existingClarity = vi.fn();
    window.clarity = existingClarity;
    const { initAnalytics } = await import('../analytics');
    initAnalytics();
    initAnalytics();
    expect(window.clarity).toBe(existingClarity);
    expect(vendors().map((script) => script.src)).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-C3QBWP3ZSK']);
  });

  it('does not throw or initialize when getItem throws', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const { initAnalytics, loadAnalytics } = await import('../analytics');
    expect(() => initAnalytics()).not.toThrow();
    expect(() => loadAnalytics()).not.toThrow();
    expect(vendors()).toHaveLength(0);
  });

  it('does not throw or initialize when the localStorage property getter throws', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('property denied'); } });
    try {
      const { initAnalytics, loadAnalytics } = await import('../analytics');
      expect(() => initAnalytics()).not.toThrow();
      expect(() => loadAnalytics()).not.toThrow();
      expect(vendors()).toHaveLength(0);
    } finally {
      Object.defineProperty(window, 'localStorage', descriptor);
    }
  });
});
