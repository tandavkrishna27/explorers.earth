import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import i18n from '../index.js';
import en from '../resources/en.json';
import es from '../resources/es.json';
import de from '../resources/de.json';
import fr from '../resources/fr.json';
import hi from '../resources/hi.json';
import { CategoryEmptyState } from '../../components/CategoryEmptyState';
import { PublicProfileFooter } from '../../features/PublicHome/components/PublicProfileFooter';

const locales = { es, de, fr, hi } as Record<string, any>;
const dig = (source: any, key: string) => key.split('.').reduce((value, part) => value?.[part], source);
const cats = ['places', 'movies', 'books', 'games', 'guides', 'apps', 'products', 'people'];
const keys = [
  ...cats.flatMap((c) => [`dashboard.home.tabs.${c}`, `dashboard.home.search.${c}`, `dashboard.home.add.${c}`,
    `dashboard.home.emptyState.${c}.tag`, `dashboard.home.emptyState.${c}.tagline`, `dashboard.home.emptyState.${c}.sub`, `dashboard.home.emptyState.${c}.add`]),
  'dashboard.home.emptyState.music.tagline', 'dashboard.home.emptyState.music.add',
  'dashboard.home.stats.activeLists', 'dashboard.home.stats.recommendations', 'dashboard.home.shareRecommendationsLink',
  'dashboard.home.analytics.viewsLast90Days', 'common.confirm', 'header.nav.useCases', 'footer.links.useCases',
  'publicProfile.footer.poweredBy', 'publicProfile.footer.createProfile', 'publicProfile.footer.report', 'publicProfile.footer.privacy',
  ...['places', 'guides', 'profile', 'movies', 'books', 'games', 'apps', 'products', 'people'].map((n) => `publicProfile.nav.${n}`),
];
// Words that are the same in the language (loanwords / brand-like terms).
const sameAsEnglish = new Set(['publicProfile.nav.apps', 'publicProfile.nav.guides', 'dashboard.home.tabs.guides', 'dashboard.home.tabs.apps']);

describe('dashboard and public-profile chrome is localized (I18N-X01)', () => {
  it.each(Object.keys(locales))('%s has every key with a non-English value', (lang) => {
    for (const key of keys) {
      const english = dig(en, key);
      const value = dig(locales[lang], key);
      expect(english, `${key} missing in en`).toBeTruthy();
      expect(value, `${key} missing in ${lang}`).toBeTruthy();
      if (!sameAsEnglish.has(key)) expect(value, `${key} still English in ${lang}`).not.toBe(english);
    }
  });
});

describe('components render the Spanish strings', () => {
  beforeAll(async () => {
    i18n.addResourceBundle('es', 'translation', es, true, true);
    await i18n.changeLanguage('es');
  });
  afterEach(() => undefined);

  it('footer', () => {
    render(<MemoryRouter><PublicProfileFooter /></MemoryRouter>);
    expect(screen.getByText('Desarrollado por')).toBeInTheDocument();
    expect(screen.getByText('Crea tu perfil')).toBeInTheDocument();
    expect(screen.queryByText('Powered by')).toBeNull();
  });

  it('category empty state', () => {
    render(<CategoryEmptyState category="places" onAddClick={() => undefined} />);
    expect(screen.getByText('+ Añadir lista de lugares')).toBeInTheDocument();
    expect(screen.getByText('Dibuja tu mundo')).toBeInTheDocument();
  });
});
