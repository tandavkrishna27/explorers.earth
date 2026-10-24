import { createInstance } from "i18next";
import en from "../../../../i18n/resources/en.json";

/**
 * A react-i18next stand-in for sample tests that need real interpolation without a provider.
 * It builds its own i18next instance (no initReactI18next), so it is safe to use inside a
 * vi.mock("react-i18next") factory without importing the mocked module back.
 */
const instance = createInstance();
void instance.init({ lng: "en", fallbackLng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false }, initImmediate: false });
const t = instance.t.bind(instance);
const translation = { t, i18n: instance };
export const englishTranslation = () => translation;
