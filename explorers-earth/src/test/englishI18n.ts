import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../i18n/resources/en.json';

/**
 * A synchronous English-only i18next instance for tests. Components that now route their labels
 * through i18n render real English text under it instead of raw keys, and tests that mock
 * react-i18next can resolve `t` against the same resource file.
 */
export const englishI18n = createInstance();
void englishI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  initImmediate: false,
});

export const englishT = (key: string, options?: Record<string, unknown>): string =>
  String(englishI18n.t(key, options as never));
