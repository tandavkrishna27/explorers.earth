import { describe, it, expect } from 'vitest';
import { getCountryName, getTranslatedCountryName } from '../utils/countryMapping';

describe('countryMapping', () => {
  describe('getCountryName', () => {
    it('returns full country name for known code', () => {
      expect(getCountryName('US')).toBe('United States');
      expect(getCountryName('IN')).toBe('India');
      expect(getCountryName('GB')).toBe('United Kingdom');
    });

    it('returns code itself for unknown code', () => {
      expect(getCountryName('XYZ')).toBe('XYZ');
      expect(getCountryName('')).toBe('');
    });
  });

  describe('getTranslatedCountryName', () => {
    it('returns translated name if translation exists', () => {
      const mockT = (key: string) => {
        if (key === 'countries.US') return 'Estados Unidos';
        return key;
      };

      expect(getTranslatedCountryName('US', mockT)).toBe('Estados Unidos');
    });

    it('falls back to English name if translation is missing', () => {
      // Mock t returns the key if missing
      const mockT = (key: string) => key;

      expect(getTranslatedCountryName('FR', mockT)).toBe('France');
    });

    it('falls back to code if translation is missing and code is unknown', () => {
      const mockT = (key: string) => key;

      expect(getTranslatedCountryName('XYZ', mockT)).toBe('XYZ');
    });
  });
});

import topology from 'world-atlas/countries-110m.json';
import { feature } from 'topojson-client';
import { COUNTRY_CODE_TO_NAME, countryCodeForGeography, normalizeCountryKey } from '../utils/countryMapping';

describe('country codes against the map topology', () => {
  const features = (feature(topology as never, (topology as never as { objects: { countries: never } }).objects.countries) as unknown as {
    features: { id?: string; properties: { name: string } }[];
  }).features;
  // Disputed areas the topology draws without an ISO id and the analytics data has no code for.
  const unmapped = new Set(['N. Cyprus', 'Somaliland']);

  it('resolves every country in the topology to a code the charts can name', () => {
    expect(features.length).toBeGreaterThan(170);
    for (const geo of features) {
      const code = countryCodeForGeography(geo);
      if (unmapped.has(geo.properties.name)) {
        expect(code, geo.properties.name).toBeUndefined();
        continue;
      }
      expect(code, `${geo.properties.name} (${geo.id})`).toBeDefined();
      expect(COUNTRY_CODE_TO_NAME[code!], `${geo.properties.name} -> ${code}`).toBeDefined();
    }
  });

  it('gives each country in the topology its own code', () => {
    const codes = features.map(countryCodeForGeography).filter(Boolean);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('shades the United Kingdom for every way an event can spell it', () => {
    const uk = features.find((geo) => geo.properties.name === 'United Kingdom')!;
    expect(countryCodeForGeography(uk)).toBe('GB');
    for (const spelling of ['GB', 'gb', ' GB ', 'UK', 'uk', 'United Kingdom', 'Great Britain', '826']) {
      expect(normalizeCountryKey(spelling), spelling).toBe('GB');
    }
  });

  it('keeps unrecognised values countable but unshaded', () => {
    expect(normalizeCountryKey('Local')).toBe('Local');
    expect(normalizeCountryKey('')).toBe('');
  });
});
