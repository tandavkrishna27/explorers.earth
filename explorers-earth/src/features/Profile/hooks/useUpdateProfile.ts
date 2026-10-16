import useAuthStore from "../../../store/store";
import { readSocialVisibility } from "../config/socialVisibility";
import type { KeyValuePair } from "../types/profileSave";
import { explorersApiClient } from "../../../lib/explorersApiClient";
import { musicApi } from "../../music/musicApi";
import { toAccountUpdate, toProfileViewModel } from "../api/profileClient";

export interface Visibility {
  Instagram?: boolean;
  Youtube?: boolean;
  Whatsapp?: boolean;
  "Mobile Number"?: boolean;
  Website?: boolean;
  Facebook?: boolean;
  Linkedin?: boolean;
  Snapchat?: boolean;
  Tiktok?: boolean;
  Gmail?: boolean;
  X?: boolean;
  YoutubeMusic?: boolean;
  "Youtube Music"?: boolean;
  AppleMusic?: boolean;
  "Apple Music"?: boolean;
  Spotify?: boolean;
}

export type BooleanKeyValuePair = { [key in keyof Visibility]?: boolean };

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const mergePlatform = (
  socialMedia: Record<string, unknown>,
  key: string,
  link: unknown,
  visibility: boolean,
) => ({
  ...asRecord(socialMedia[key]),
  link: typeof link === "string" ? link : "",
  visibility,
});

export function buildSocialMediaInput(
  values: KeyValuePair,
): Record<string, unknown> {
  const socialMedia = asRecord(values.social_media);
  const visibility = asRecord(values.visibility);
  const rawTheme = asRecord(socialMedia.theme_settings);
  const editedTheme = asRecord(values.theme_settings);
  const rawRecommendations = asRecord(rawTheme.recommendations);
  const editedRecommendations = asRecord(editedTheme.recommendations);
  const hasRecommendations =
    Object.keys(rawRecommendations).length > 0 ||
    Object.keys(editedRecommendations).length > 0;

  return {
    ...socialMedia,
    theme_settings: {
      ...rawTheme,
      ...editedTheme,
      ...(hasRecommendations
        ? {
            recommendations: {
              ...rawRecommendations,
              ...editedRecommendations,
            },
          }
        : {}),
    },
    instagram: mergePlatform(
      socialMedia,
      "instagram",
      values.instagramLink,
      readSocialVisibility(visibility, "Instagram"),
    ),
    youtube: mergePlatform(
      socialMedia,
      "youtube",
      values.youtubeLink,
      readSocialVisibility(visibility, "Youtube"),
    ),
    whatsapp: mergePlatform(
      socialMedia,
      "whatsapp",
      values.whatsappLink,
      readSocialVisibility(visibility, "Whatsapp"),
    ),
    website: mergePlatform(
      socialMedia,
      "website",
      values.websiteLink,
      readSocialVisibility(visibility, "Website"),
    ),
    facebook: mergePlatform(
      socialMedia,
      "facebook",
      values.facebookLink,
      readSocialVisibility(visibility, "Facebook"),
    ),
    linkedin: mergePlatform(
      socialMedia,
      "linkedin",
      values.linkedinLink,
      readSocialVisibility(visibility, "Linkedin"),
    ),
    snapchat: mergePlatform(
      socialMedia,
      "snapchat",
      values.snapchatLink,
      readSocialVisibility(visibility, "Snapchat"),
    ),
    tiktok: mergePlatform(
      socialMedia,
      "tiktok",
      values.tiktokLink,
      readSocialVisibility(visibility, "Tiktok"),
    ),
    email: mergePlatform(
      socialMedia,
      "email",
      values.gmailLink,
      readSocialVisibility(visibility, "Gmail"),
    ),
    X: mergePlatform(
      socialMedia,
      "X",
      values.XLink,
      readSocialVisibility(visibility, "X"),
    ),
    spotify: mergePlatform(
      socialMedia,
      "spotify",
      values.spotifyLink,
      readSocialVisibility(visibility, "Spotify"),
    ),
    youtubeMusic: mergePlatform(
      socialMedia,
      "youtubeMusic",
      values.youtubeMusicLink,
      readSocialVisibility(visibility, "YoutubeMusic"),
    ),
    appleMusic: mergePlatform(
      socialMedia,
      "appleMusic",
      values.appleMusicLink,
      readSocialVisibility(visibility, "AppleMusic"),
    ),
  };
}

/**
 * Ticket 3.4. Saving the profile.
 *
 * This held four paths: a canonical update, a Strapi createAccount for an owner with no
 * account yet, a Strapi updateAccount for a non-UUID id, and a Strapi write mirroring the
 * username onto usersPermissionsUser. Both callers - Profile and ProfileAccountSettings -
 * already read the account through useCanonicalAccount, so the id reaching this hook is
 * always a canonical UUID and the three Strapi paths were already unreachable.
 *
 * The create path is not replaced by a canonical equivalent, because canonically the
 * client cannot create an account: ensureInitialAccount provisions one, with its category
 * settings and presentation row, during authentication. An owner who is signed in has an
 * account. So a missing id is not "create one" - it is a form submitted before its own
 * snapshot arrived, and that is refused rather than guessed at.
 *
 * Two behaviours lived only in the removed code.
 *
 * The username write-back is kept, below, because it is load-bearing. Every public link
 * and QR code in the dashboard is built from the auth store's user.username, not from the
 * account query, so a rename that updates only the account leaves every one of those links
 * pointing at the old handle until the next full reload. Nothing else in the app writes
 * that field.
 *
 * musicApi.refreshIdentity() is kept, but only because the server side was fixed. It was
 * inert when this hook was first migrated: it re-mints the credential against the ensure
 * endpoint, and that endpoint returned early for an already-mapped account, so a renamed
 * display name never reached Music - users.venue_name was written once, at provision, and
 * nothing updated it afterwards. ensureMusicAccount now converges the venue name on reuse,
 * which makes this call carry the rename it always looked like it carried. The call stays
 * best-effort: a Music name one save stale must not fail an Explorers profile save.
 */
export const useUpdateProfile = (
  documentId: string | undefined,
  refetch: () => unknown | Promise<unknown>,
) => {
  const { user } = useAuthStore();

  const handleSubmit = async (values: KeyValuePair) => {
    if (!documentId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(documentId))
      throw new Error("Profile form snapshot is unavailable");
    // The snapshot the form was built from has to be the account being written, at the
    // revision it was read at, or the update is a blind overwrite of someone else's edit.
    if (values.documentId !== documentId || !Number.isSafeInteger(values.revision) || values.revision < 1)
      throw new Error("Profile form snapshot is unavailable");

    const currentUsername = user?.username ?? "";
    const incomingUsername =
      typeof values.username === "string" ? values.username.trim() : "";
    const usernameChanged = Boolean(
      incomingUsername && incomingUsername !== currentUsername,
    );

    const updated = await explorersApiClient.updateAccount(toAccountUpdate(
      { ...values, social_media: buildSocialMediaInput(values) }, { revision: values.revision },
    ));

    // After the account has accepted the handle, never before: a rejected save must not
    // leave the store advertising a username the account does not have.
    if (usernameChanged) useAuthStore.getState().updateUsername(incomingUsername);

    // Best-effort, after the account has accepted the change: this propagates the new
    // display name to the Music venue and must never turn a saved profile into a failure.
    void musicApi.refreshIdentity().catch(() => undefined);

    await refetch();
    return toProfileViewModel(updated);
  };

  return { handleSubmit };
};
