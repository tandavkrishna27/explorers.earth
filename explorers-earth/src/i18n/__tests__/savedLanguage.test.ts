import { afterEach, expect, it, vi } from 'vitest';

// Local acceptance 2026-10: in the platform build the app module is imported after the
// runtime config fetch, so window 'load' has already fired, and i18n.init() emits
// 'initialized' before the listener below it is registered. A saved Spanish choice
// therefore set <html lang="es"> while every string stayed English.
afterEach(() => { window.localStorage.clear(); vi.resetModules(); });

it('loads the saved non-English bundle on a fresh page without waiting for window load', async () => {
  window.localStorage.setItem('explorers-language', 'es');
  const { default: i18n } = await import('../index.js');
  await vi.waitFor(() => expect(i18n.hasResourceBundle('es', 'translation')).toBe(true));
  expect(i18n.language).toBe('es');
  expect(i18n.t('sidebar.home')).toBe('Inicio');
});
