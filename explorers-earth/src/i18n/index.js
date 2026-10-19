import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import only the default language (English) initially for lazy loading
import en from './resources/en.json';

// Language loading function for dynamic imports
const loadLanguage = async (languageCode) => {
  try {
    const module = await import(`./resources/${languageCode}.json`);
    return module.default;
  } catch (error) {
    console.warn(`Failed to load language ${languageCode}:`, error);
    return null;
  }
};

// Initialize with only English resources
const resources = {
  en: { translation: en },
};

const rtlLanguages = new Set(['ar', 'fa', 'he', 'ur']);

const applyDocumentLanguage = (languageCode) => {
  document.documentElement.lang = languageCode;
  document.documentElement.dir = rtlLanguages.has(languageCode) ? 'rtl' : 'ltr';
};

// Check for saved language immediately and set it as the initial language
const savedLanguage = localStorage.getItem('explorers-language');
const initialLanguage = savedLanguage && savedLanguage !== 'en' ? savedLanguage : 'en';
applyDocumentLanguage(initialLanguage);

i18n
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    lng: initialLanguage, // Use the detected saved language
    debug: false,

    interpolation: {
      escapeValue: false,
    },

    react: {
      useSuspense: false,
    },
  });

// Override the original changeLanguage method to add lazy loading
const originalChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = async (languageCode) => {
  // If language is already loaded, just change it
  if (i18n.hasResourceBundle(languageCode, 'translation')) {
    const result = await originalChangeLanguage(languageCode);
    localStorage.setItem('explorers-language', languageCode);
    applyDocumentLanguage(languageCode);
    return result;
  }

  // Load the language dynamically
  const translations = await loadLanguage(languageCode);
  if (translations) {
    // Add the loaded language to i18n resources
    i18n.addResourceBundle(languageCode, 'translation', translations);
    // Change to the new language
    const result = await originalChangeLanguage(languageCode);
    localStorage.setItem('explorers-language', languageCode);
    applyDocumentLanguage(languageCode);
    return result;
  } else {
    console.warn(`Failed to load language ${languageCode}, falling back to English`);
    const result = await originalChangeLanguage('en');
    localStorage.setItem('explorers-language', 'en');
    applyDocumentLanguage('en');
    return result;
  }
};

// Initialize with saved language after i18n is ready
i18n.on('initialized', async () => {
  // Manually check localStorage for saved language
  const savedLanguage = localStorage.getItem('explorers-language');

  // If there's a saved language and it's not English, load it
  if (savedLanguage && savedLanguage !== 'en') {
    try {
      // Use our custom changeLanguage method to load the language
      await i18n.changeLanguage(savedLanguage);
    } catch (error) {
      console.warn('Failed to load saved language:', error);
    }
  }
});

// Also check for saved language on window load (in case of API errors)
window.addEventListener('load', async () => {
  const savedLanguage = localStorage.getItem('explorers-language');
  if (savedLanguage && savedLanguage !== 'en' && !i18n.hasResourceBundle(savedLanguage, 'translation')) {
    try {
      await i18n.changeLanguage(savedLanguage);
    } catch (error) {
      console.warn('Failed to load saved language:', error);
    }
  }
});

// Neither hook above is reliable on its own: init() with in-memory resources emits
// 'initialized' before that listener is attached, and the platform build imports this
// module after the runtime config fetch, when window 'load' has usually fired already.
// Load the saved bundle now so a fresh page does not stay English under lang="es".
if (initialLanguage !== 'en' && !i18n.hasResourceBundle(initialLanguage, 'translation')) {
  i18n.changeLanguage(initialLanguage).catch((error) => {
    console.warn('Failed to load saved language:', error);
  });
}

export default i18n;
