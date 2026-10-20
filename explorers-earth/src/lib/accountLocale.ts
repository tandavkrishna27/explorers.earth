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
 * Apply the account's saved locale at sign-in, 'en' included: the language of whoever was
 * signed in before (or of the signed-out page) must never carry over into this account.
 */
export async function adoptAccountLocale(locale: string | undefined): Promise<void> {
  if (!locale || !SHIPPED_LOCALES.has(locale) || i18n.language === locale) return;
  await i18n.changeLanguage(locale);
}

const SIGNED_OUT_KEY = "explorers-language-signed-out";

function readSignedOutLocale(): string | null {
  try {
    const stored = localStorage.getItem(SIGNED_OUT_KEY);
    return stored && SHIPPED_LOCALES.has(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Remember an explicit language pick made while signed out (e.g. on the landing page). */
export function rememberSignedOutLocale(locale: string): void {
  if (!SHIPPED_LOCALES.has(locale) || useAuthStore.getState().isAuthenticated) return;
  try {
    localStorage.setItem(SIGNED_OUT_KEY, locale);
  } catch {
    // Preference is a convenience only.
  }
}

/**
 * After sign-out go back to the signed-out preference: the explicit pick made while signed
 * out if there is one, otherwise the app default. Never the previous account's language.
 */
export async function resetToSignedOutLocale(): Promise<void> {
  const target = readSignedOutLocale() ?? "en";
  if (i18n.language !== target) await i18n.changeLanguage(target);
  else {
    try { localStorage.setItem("explorers-language", target); } catch { /* ignore */ }
  }
}

useAuthStore.subscribe((state, previous) => {
  if (previous.isAuthenticated && !state.isAuthenticated && state.status !== "loading") {
    void resetToSignedOutLocale().catch(() => undefined);
  }
});
