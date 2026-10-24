import { expect, it } from 'vitest';
import en from '../resources/en.json';
import ar from '../resources/ar.json';

const get = (o: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], o);

it.each(['dashboard.wp7.guideType.Itinerary', 'dashboard.wp7.guideType.Theme'])(
  '%s exists in en and is translated in ar',
  (key) => {
    expect(typeof get(en, key)).toBe('string');
    expect(typeof get(ar, key)).toBe('string');
    expect(get(ar, key)).not.toBe(get(en, key));
  },
);
