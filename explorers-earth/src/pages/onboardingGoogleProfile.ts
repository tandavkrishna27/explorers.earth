/**
 * What onboarding borrows from the Google account a user just signed in with: the name, as an
 * editable display name, and the profile photo, offered as the default avatar.
 *
 * The photo is only previewed here (on this signed-in page). It is stored only when the user
 * keeps it, by the server importing it into their own media (POST /media/provider-avatar), so
 * public pages serve it through the media gate and never hot-link Google.
 */
export type SessionProfile = { name: string; photo: string };

const GOOGLE_PHOTO_HOST = /^lh[3-6]\.googleusercontent\.com$/;

export function isGoogleProfilePhoto(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && GOOGLE_PHOTO_HOST.test(u.hostname) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

export async function readSessionProfile(fetchImpl: typeof fetch = fetch): Promise<SessionProfile> {
  try {
    const response = await fetchImpl("/api/auth/get-session", { credentials: "include", cache: "no-store" });
    const user = (await response.json())?.user;
    const name = typeof user?.name === "string" ? user.name.trim() : "";
    const photo = typeof user?.image === "string" && isGoogleProfilePhoto(user.image) ? user.image : "";
    return { name, photo };
  } catch {
    return { name: "", photo: "" };
  }
}

/** Fills an empty display name only; a typed value and the username are never touched. */
export function applyGoogleNamePrefill<T extends { accountName: string }>(form: T, name: string | undefined): T {
  const trimmed = name?.trim();
  if (!trimmed || form.accountName.trim()) return form;
  return { ...form, accountName: trimmed };
}

export function shouldImportGooglePhoto(input: { googlePhoto: string; keepGooglePhoto: boolean; hasOwnPhoto: boolean }): boolean {
  return !!input.googlePhoto && input.keepGooglePhoto && !input.hasOwnPhoto;
}
