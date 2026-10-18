import i18n from "i18next";
import useAuthStore from "../store/store";
import { explorersApiClient } from "./explorersApiClient";

/**
 * The account's interface language, persisted server-side so a choice follows the owner
 * to every device. Before this, LanguageSelector only called i18n.changeLanguage, which
 * wrote one browser's localStorage, and the account's `locale` column stayed 'en'.
 *
 * The shipped set is read from the bundles themselves (lazy globs load nothing), so a
 * new resource file is accepted without a second list to keep in step.
 */
export const SHIPPED_LOCALES: ReadonlySet<string> = new Set(
  Object.keys(import.meta.glob("../i18n/resources/*.json")).map((path) => path.replace(/^.*\/([^/]+)\.json$/, "$1")),
);

/** Best effort: the local change has already happened, and a failed save must not undo it. */
export async function persistAccountLocale(locale: string): Promise<void> {
  if (!SHIPPED_LOCALES.has(locale)) return;
  const { isAuthenticated, accountId } = useAuthStore.getState();
  if (!isAuthenticated || !accountId) return;
  try {
    const current = await explorersApiClient.getMyProfile();
    if (current.locale === locale) return;
    await explorersApiClient.updateAccount({ expectedRevision: current.revision, locale });
  } catch {
    // The next choice retries; the language already applies in this browser.
  }
}

/**
 * Apply the saved locale at sign-in. 'en' is the column default, indistinguishable from
 * "never chose", so it never overrides a language picked in this browser before sign-in.
 */
export async function adoptAccountLocale(locale: string | undefined): Promise<void> {
  if (!locale || locale === "en" || !SHIPPED_LOCALES.has(locale) || i18n.language === locale) return;
  await i18n.changeLanguage(locale);
}
