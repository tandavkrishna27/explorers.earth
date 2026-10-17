import { describe, expect, it } from 'vitest';
import { resolveTrafficSource } from '../trafficSource';

describe('resolveTrafficSource', () => {
  it('prefers explicit UTM attribution', () => {
    expect(
      resolveTrafficSource({
        utmParams: { utm_source: 'newsletter' },
        referrerOrigin: 'https://www.google.com',
      }),
    ).toBe('newsletter');
  });

  it('uses a coarse referral hostname when UTM attribution is absent', () => {
    expect(
      resolveTrafficSource({ referrerOrigin: 'https://www.google.com' }),
    ).toBe('google.com');
  });

  it('falls back safely to direct for invalid or absent referrers', () => {
    expect(resolveTrafficSource({})).toBe('direct');
    expect(resolveTrafficSource({ referrerOrigin: 'not-a-url' })).toBe('direct');
  });
});
