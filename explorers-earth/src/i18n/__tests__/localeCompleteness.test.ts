import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '../resources/en.json';
import es from '../resources/es.json';
import fr from '../resources/fr.json';
import ar from '../resources/ar.json';
import he from '../resources/he.json';
import de from '../resources/de.json';
import hi from '../resources/hi.json';
import it_ from '../resources/it.json';
import pt from '../resources/pt.json';

// I18N-X01: the locales the repo actively maintains must carry the dashboard / public-footer / landing
// "Use Cases" keys and the public-profile recommendation labels with real translations, not English.
const dig = (source: any, key: string) => key.split('.').reduce((value, part) => value?.[part], source);
const REQUIRED_LOCALES: Record<string, any> = { es, fr, ar, he };
const ALSO_MAINTAINED: Record<string, any> = { de, hi, it: it_, pt };

const cats = ['places', 'movies', 'books', 'games', 'guides', 'apps', 'products', 'people'];
const chromeKeys = [
  ...cats.flatMap((c) => [`dashboard.home.tabs.${c}`, `dashboard.home.search.${c}`, `dashboard.home.add.${c}`,
    `dashboard.home.emptyState.${c}.tag`, `dashboard.home.emptyState.${c}.tagline`, `dashboard.home.emptyState.${c}.sub`, `dashboard.home.emptyState.${c}.add`]),
  'dashboard.home.emptyState.music.tagline', 'dashboard.home.emptyState.music.add',
  'dashboard.home.stats.activeLists', 'dashboard.home.stats.recommendations', 'dashboard.home.shareRecommendationsLink',
  'dashboard.home.analytics.viewsLast90Days', 'dashboard.home.published', 'common.confirm',
  'header.nav.useCases', 'footer.links.useCases',
  'publicProfile.footer.poweredBy', 'publicProfile.footer.createProfile', 'publicProfile.footer.report',
  ...['places', 'guides', 'profile', 'movies', 'books', 'games', 'apps', 'products', 'people'].map((n) => `publicProfile.nav.${n}`),
];
const recommendationKeys = [
  ...['apps', 'books', 'games', 'guides', 'movies', 'music', 'people', 'places', 'products']
    .map((c) => `dashboard.profile.themeAppearance.recommendations.categories.${c}`),
  'publicProfile.recommendations.regionLabel',
  'publicProfile.recommendations.empty',
  'publicProfile.recommendations.loadError',
  'publicProfile.recommendations.retry',
];
const countKinds = ['place', 'movie', 'book', 'game', 'app', 'product', 'person'];
// Words that are identical to English in the language (loanwords).
const SAME_AS_ENGLISH = new Set([
  'publicProfile.footer.report', 'publicProfile.nav.apps', 'publicProfile.nav.guides', 'dashboard.home.tabs.guides', 'dashboard.home.tabs.apps',
  'dashboard.profile.themeAppearance.recommendations.categories.guides',
  'dashboard.profile.themeAppearance.recommendations.categories.apps',
]);

const exists = (value: unknown) => typeof value === 'string' && value.length > 0;

describe('maintained locales carry the dashboard, footer and recommendation labels (I18N-X01)', () => {
  const all = { ...REQUIRED_LOCALES, ...ALSO_MAINTAINED };
  it.each(Object.keys(all))('%s has every key with a non-English value', (lang) => {
    for (const key of [...chromeKeys, ...recommendationKeys]) {
      const english = dig(en, key);
      const value = dig(all[lang], key);
      expect(exists(english), `${key} missing in en`).toBe(true);
      expect(exists(value), `${key} missing in ${lang}`).toBe(true);
      if (!SAME_AS_ENGLISH.has(key)) expect(value, `${key} still English in ${lang}`).not.toBe(english);
    }
  });

  it.each(Object.keys(all))('%s translates the pluralised item counts', (lang) => {
    for (const kind of countKinds) {
      for (const form of ['one', 'other']) {
        const key = `publicProfile.recommendations.counts.${kind}_${form}`;
        const value = dig(all[lang], key);
        expect(exists(value), `${key} missing in ${lang}`).toBe(true);
        // "app" is the same loanword in several languages.
        if (kind !== 'app') expect(value, `${key} still English in ${lang}`).not.toBe(dig(en, key));
        expect(value).toMatch(/\{\{(formattedCount|suffix)\}\}/);
      }
    }
  });
});

describe('item counts follow each language plural rules', () => {
  const make = async (lang: string, resource: any) => {
    const i18n = createInstance();
    await i18n.init({ lng: lang, fallbackLng: 'en', resources: { en: { translation: en }, [lang]: { translation: resource } }, interpolation: { escapeValue: false } });
    return (kind: string, count: number, suffix = '') =>
      i18n.t(`publicProfile.recommendations.counts.${kind}`, { count, formattedCount: String(count), suffix });
  };

  it('English, Spanish and French', async () => {
    expect((await make('en', en))('place', 1)).toBe('1 place');
    expect((await make('en', en))('place', 2)).toBe('2 places');
    const t = await make('es', es);
    expect([t('place', 1), t('place', 5, '+')]).toEqual(['1 lugar', '5+ lugares']);
    const f = await make('fr', fr);
    expect([f('movie', 1), f('movie', 3)]).toEqual(['1 film', '3 films']);
  });

  it('Arabic uses one, two, few, many and other', async () => {
    const t = await make('ar', ar);
    expect(t('place', 1)).toBe('مكان واحد');
    expect(t('place', 2)).toBe('مكانان');
    expect(t('place', 5)).toBe('5 أماكن');
    expect(t('place', 12)).toBe('12 مكانًا');
    expect(t('place', 100)).toBe('100 مكان');
  });

  it('Hebrew uses one, two and other', async () => {
    const t = await make('he', he);
    expect(t('book', 1)).toBe('ספר אחד');
    expect(t('book', 2)).toBe('שני ספרים');
    expect(t('book', 7)).toBe('7 ספרים');
  });
});

describe('locale files keep their line endings', () => {
  it.each(['en', 'es', 'fr', 'ar', 'he', 'de', 'hi', 'it', 'pt'])('%s.json is CRLF throughout', (lang) => {
    const raw = readFileSync(resolve(__dirname, `../resources/${lang}.json`), 'utf8');
    expect(raw).toContain('\r\n');
    expect(raw.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

describe('dashboard list rows are not hard-coded English', () => {
  const home = readFileSync(resolve(__dirname, '../../pages/Home.tsx'), 'utf8');
  it('counts and publish status go through i18n', () => {
    expect(home).not.toMatch(/\|\| 0\} (places|movies|books|games|apps & tools|products|persons) ·/);
    expect(home).not.toContain('"Published" : "Draft"');
    expect(home.match(/publicProfile\.recommendations\.counts\./g)?.length).toBeGreaterThanOrEqual(7);
  });
});
