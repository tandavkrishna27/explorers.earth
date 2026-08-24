import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  appendUtmParams,
  extractUtmParams,
  extractUtmParamsFromCurrentUrl,
  getSessionAttributionReferrerOrigin,
  getSessionAttributionUtmParams,
  createUtmParams,
  validateUtmParams,
  sanitizeUtmParams,
  UTMParameters
} from '../urlHelpers';

describe('urlHelpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── appendUtmParams ────────────────────────────────────────────────────────
  describe('appendUtmParams', () => {
    it('appends all five standard UTM fields and omits empty values', () => {
      const result = appendUtmParams('https://example.com/page', {
        utm_source: 'newsletter',
        utm_medium: 'email',
        utm_campaign: 'launch week',
        utm_term: 'travel creators',
        utm_content: 'hero button',
      });

      expect(result).toBe(
        'https://example.com/page?utm_source=newsletter&utm_medium=email&utm_campaign=launch+week&utm_term=travel+creators&utm_content=hero+button',
      );
    });
    it('appends UTM parameters to a base URL', () => {
      const url = 'https://example.com/page';
      const params: UTMParameters = { utm_source: 'twitter', utm_medium: 'social' };
      const result = appendUtmParams(url, params);
      expect(result).toBe('https://example.com/page?utm_source=twitter&utm_medium=social');
    });

    it('preserves existing query parameters', () => {
      const url = 'https://example.com/page?existing=1';
      const params: UTMParameters = { utm_source: 'fb', utm_medium: 'social' };
      const result = appendUtmParams(url, params);
      expect(result).toBe('https://example.com/page?existing=1&utm_source=fb&utm_medium=social');
    });

    it('returns the original string if url is empty', () => {
      const result = appendUtmParams('', { utm_source: 'test' });
      expect(result).toBe('');
    });

    it('returns the original url if utmParams object is empty', () => {
      const result = appendUtmParams('https://example.com', {});
      expect(result).toBe('https://example.com');
    });

    it('returns original url if parsing fails (invalid url)', () => {
      // Mock console.error to avoid cluttering test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = appendUtmParams('not-a-real-url', { utm_source: 'test' });
      expect(result).toBe('not-a-real-url');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('ignores empty string values in utmParams', () => {
      const url = 'https://example.com';
      const params: UTMParameters = { utm_source: 'test', utm_medium: '  ' };
      const result = appendUtmParams(url, params);
      expect(result).toBe('https://example.com/?utm_source=test');
    });
  });

  // ── extractUtmParams ───────────────────────────────────────────────────────
  describe('extractUtmParams', () => {
    it('extracts all five standard fields, decodes values, and keeps the first duplicate', () => {
      const result = extractUtmParams(
        'https://example.com/?utm_source=first&utm_source=second&utm_medium=social&utm_campaign=summer%20launch&utm_term=city%2Bguide&utm_content=top%20card&unrelated=ignored',
      );

      expect(result).toEqual({
        utm_source: 'first',
        utm_medium: 'social',
        utm_campaign: 'summer launch',
        utm_term: 'city+guide',
        utm_content: 'top card',
      });
    });

    it('omits empty canonical values and ignores differently cased keys', () => {
      const result = extractUtmParams(
        'https://example.com/?utm_source=&utm_medium=email&UTM_CAMPAIGN=wrong',
      );

      expect(result).toEqual({ utm_medium: 'email' });
    });
    it('extracts source and medium from URL', () => {
      const result = extractUtmParams('https://example.com/?utm_source=test&utm_medium=email');
      expect(result).toEqual({ utm_source: 'test', utm_medium: 'email' });
    });

    it('returns empty object if no UTM parameters are present', () => {
      const result = extractUtmParams('https://example.com/?other=1');
      expect(result).toEqual({});
    });

    it('returns empty object if URL is empty', () => {
      const result = extractUtmParams('');
      expect(result).toEqual({});
    });

    it('returns empty object on parse error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = extractUtmParams('invalid_url://??');
      expect(result).toEqual({});
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  // ── extractUtmParamsFromCurrentUrl ─────────────────────────────────────────
  describe('extractUtmParamsFromCurrentUrl', () => {
    it('extracts UTM parameters from window.location.href', () => {
      // Vitest's jsdom sets a default window.location, we can mock href
      Object.defineProperty(window, 'location', {
        value: {
          href: 'http://localhost/?utm_source=google&utm_medium=cpc'
        },
        writable: true
      });
      const result = extractUtmParamsFromCurrentUrl();
      expect(result).toEqual({ utm_source: 'google', utm_medium: 'cpc' });
    });
  });

  describe('getSessionAttributionUtmParams', () => {
    const makeStorage = () => {
      const values = new Map<string, string>();
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      };
    };

    it('keeps first-touch campaign data across internal URLs without query parameters', () => {
      const storage = makeStorage();
      const first = getSessionAttributionUtmParams({
        url: 'https://explorers.earth/tk2727?utm_source=instagram&utm_medium=social&utm_campaign=launch',
        storage,
        now: () => 1_000,
      });
      const internal = getSessionAttributionUtmParams({
        url: 'https://explorers.earth/tk2727/places',
        storage,
        now: () => 2_000,
      });

      expect(first).toEqual({
        utm_source: 'instagram',
        utm_medium: 'social',
        utm_campaign: 'launch',
      });
      expect(internal).toEqual(first);
    });

    it('preserves the original campaign when a later internal URL has new UTM values', () => {
      const storage = makeStorage();
      const first = getSessionAttributionUtmParams({
        url: 'https://explorers.earth/tk2727?utm_source=newsletter&utm_medium=email',
        storage,
        now: () => 3_000,
      });
      const later = getSessionAttributionUtmParams({
        url: 'https://explorers.earth/tk2727/books?utm_source=paid&utm_medium=cpc',
        storage,
        now: () => 4_000,
      });

      expect(later).toEqual(first);
    });

    it('expires stale attribution and safely replaces malformed storage', () => {
      const storage = makeStorage();
      storage.setItem('explorers-first-touch-utm', '{bad json');
      expect(
        getSessionAttributionUtmParams({
          url: 'https://explorers.earth/tk2727',
          storage,
          now: () => 5_000,
        }),
      ).toEqual({});

      getSessionAttributionUtmParams({
        url: 'https://explorers.earth/tk2727?utm_source=old&utm_medium=social',
        storage,
        now: () => 10_000,
      });
      expect(
        getSessionAttributionUtmParams({
          url: 'https://explorers.earth/tk2727/games',
          storage,
          now: () => 10_000 + 30 * 60 * 1000 + 1,
        }),
      ).toEqual({});
    });
  });

  describe('getSessionAttributionReferrerOrigin', () => {
    const makeStorage = () => {
      const values = new Map<string, string>();
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      };
    };

    it('captures only the external origin and preserves it across internal navigation', () => {
      const storage = makeStorage();
      const first = getSessionAttributionReferrerOrigin({
        url: 'https://explorers.earth/tk2727',
        referrer: 'https://www.google.com/search?q=private+query',
        storage,
        now: () => 1_000,
      });
      const internal = getSessionAttributionReferrerOrigin({
        url: 'https://explorers.earth/tk2727/books',
        referrer: 'https://explorers.earth/tk2727',
        storage,
        now: () => 2_000,
      });

      expect(first).toBe('https://www.google.com');
      expect(internal).toBe(first);
    });

    it('classifies same-origin, malformed, and unsafe referrers as direct', () => {
      for (const referrer of [
        'https://explorers.earth/another-page',
        'javascript:alert(1)',
        'not a url',
        '',
      ]) {
        expect(
          getSessionAttributionReferrerOrigin({
            url: 'https://explorers.earth/tk2727',
            referrer,
            storage: makeStorage(),
            now: () => 3_000,
          }),
        ).toBeUndefined();
      }
    });

    it('locks a direct first touch for the attribution window', () => {
      const storage = makeStorage();
      expect(
        getSessionAttributionReferrerOrigin({
          url: 'https://explorers.earth/tk2727',
          referrer: '',
          storage,
          now: () => 4_000,
        }),
      ).toBeUndefined();
      expect(
        getSessionAttributionReferrerOrigin({
          url: 'https://explorers.earth/tk2727/books',
          referrer: 'https://later.example/path',
          storage,
          now: () => 5_000,
        }),
      ).toBeUndefined();
    });
  });

  // ── createUtmParams ────────────────────────────────────────────────────────
  describe('createUtmParams', () => {
    it('creates correct params for qrCode', () => {
      expect(createUtmParams.qrCode()).toEqual({ utm_source: 'qr_code_scan', utm_medium: 'qr_code' });
    });

    it('creates correct params for socialMedia', () => {
      expect(createUtmParams.socialMedia('Twitter')).toEqual({ utm_source: 'twitter', utm_medium: 'social' });
    });

    it('creates correct params for directShare', () => {
      expect(createUtmParams.directShare()).toEqual({ utm_source: 'direct', utm_medium: 'share' });
    });

    it('creates correct params for email', () => {
      expect(createUtmParams.email()).toEqual({ utm_source: 'email', utm_medium: 'email' });
    });

    it('creates correct params for referral', () => {
      expect(createUtmParams.referral('alice')).toEqual({ utm_source: 'alice', utm_medium: 'referral' });
    });
  });

  // ── validateUtmParams ──────────────────────────────────────────────────────
  describe('validateUtmParams', () => {
    it('validates correct UTM parameters', () => {
      const result = validateUtmParams({ utm_source: 'test', utm_medium: 'test' });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error if utm_source is missing', () => {
      const result = validateUtmParams({ utm_medium: 'test' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('utm_source is required');
    });

    it('returns error if utm_medium is missing', () => {
      const result = validateUtmParams({ utm_source: 'test' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('utm_medium is required');
    });

    it('returns error if parameter is too long', () => {
      const longStr = 'a'.repeat(101);
      const result = validateUtmParams({ utm_source: longStr, utm_medium: 'test' });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum length'))).toBe(true);
    });
  });

  // ── sanitizeUtmParams ──────────────────────────────────────────────────────
  describe('sanitizeUtmParams', () => {
    it('trims whitespace', () => {
      const result = sanitizeUtmParams({ utm_source: '  test  ', utm_medium: '\tvalue\n' });
      expect(result).toEqual({ utm_source: 'test', utm_medium: 'value' });
    });

    it('removes invalid characters like quotes and angle brackets', () => {
      const result = sanitizeUtmParams({ utm_source: '<script>', utm_medium: '"quoted"' });
      expect(result).toEqual({ utm_source: 'script', utm_medium: 'quoted' });
    });

    it('ignores empty values after sanitization', () => {
      const result = sanitizeUtmParams({ utm_source: 'test', utm_medium: '  <"">  ' });
      expect(result).toEqual({ utm_source: 'test' }); // utm_medium becomes empty and is ignored
    });
  });
});
