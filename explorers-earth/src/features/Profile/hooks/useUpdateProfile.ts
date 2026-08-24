import { gql, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { updateLocalTunesUsername } from "../../../services/localTunesService";
import useAuthStore from "../../../store/store";
import { readSocialVisibility } from "../config/socialVisibility";
import type { KeyValuePair } from "../types/profileSave";
import { mobileNumberField } from "./mobileNumberField";

const getAccountTypeValue = (
  key: unknown,
  t: (key: string) => string,
): string => {
  const accountTypeMap: Record<string, string> = {
    personal: t("dashboard.profile.publicProfile.accountTypes.personal"),
    creator: t("dashboard.profile.publicProfile.accountTypes.creator"),
    business: t("dashboard.profile.publicProfile.accountTypes.business"),
  };
  return (
    accountTypeMap[String(key)] ||
    t("dashboard.profile.publicProfile.accountTypes.personal")
  );
};

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

const onboardingQuery = gql`
  mutation createAccount($data: AccountInput!) {
    createAccount(data: $data) {
      Account_Name
      Account_Type
      username
      Bio
      Addresss
    }
  }
`;

const updateProfileMutation = gql`
  mutation UpdateAccount($documentId: ID!, $data: AccountInput!) {
    updateAccount(documentId: $documentId, data: $data) {
      documentId
      username
      Bio
      Addresss
      Primary_Address
      Account_Type
      Account_Name
      mobile_number
      mobile_number_visibility
      social_media
      Public_Profile_Address
      Feed_Data
      profile_picture {
        url
        alternativeText
      }
      bg_picture {
        url
        alternativeText
      }
    }
  }
`;

const updateUserMutation = gql`
  mutation UpdateUsersPermissionsUser(
    $id: ID!
    $data: UsersPermissionsUserInput!
  ) {
    updateUsersPermissionsUser(id: $id, data: $data) {
      data {
        username
      }
    }
  }
`;

const accountAddressInput = (values: KeyValuePair) => ({
  streetNumber: values.streetNumber,
  streetName: values.streetName,
  postalCode: values.postalCode,
  state: values.state,
  city: values.city,
  country: values.country,
  address: values.address,
});

export const useUpdateProfile = (
  documentId: string | undefined,
  refetch: () => unknown | Promise<unknown>,
) => {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [updateProfile] = useMutation(updateProfileMutation);
  const [createAccount] = useMutation(onboardingQuery);
  const [updateUser] = useMutation(updateUserMutation);

  const handleSubmit = async (values: KeyValuePair) => {
    const socialMedia = buildSocialMediaInput(values);

    if (!documentId) {
      const response = await createAccount({
        variables: {
          data: {
            Bio: values.bio,
            Addresss: accountAddressInput(values),
            Primary_Address: { address: values.primaryAddressCombined },
            Public_Profile_Address: values.Public_Profile_Address || null,
            Feed_Data: values.Feed_Data || [],
            social_media: socialMedia,
            Account_Type: getAccountTypeValue(values.accountType, t),
            Account_Name: values.accountName,
            username: values.username,
            mobile_number_visibility: values.mobilenumberVisiblity,
            mobile_number: values.mobilenumberLink,
            users_permissions_users: user?.documentId,
          },
        },
      });
      const createdAccount = response.data?.createAccount;
      if (!createdAccount) {
        throw new Error("Profile creation was not confirmed");
      }
      await refetch();
      return createdAccount;
    }

    const currentUsername = user?.username ?? "";
    const incomingUsername =
      typeof values.username === "string" ? values.username.trim() : "";
    const usernameChanged = Boolean(
      incomingUsername && incomingUsername !== currentUsername,
    );
    const response = await updateProfile({
      variables: {
        documentId,
        data: {
          Bio: values.bio,
          Account_Name: values.accountName,
          ...(usernameChanged ? { username: incomingUsername } : {}),
          Addresss: accountAddressInput(values),
          Primary_Address: { address: values.primaryAddressCombined },
          Public_Profile_Address: values.Public_Profile_Address || null,
          Feed_Data: values.Feed_Data || [],
          social_media: socialMedia,
          Account_Type: getAccountTypeValue(values.accountType, t),
          mobile_number_visibility: values.mobilenumberVisiblity,
          ...mobileNumberField(
            typeof values.mobilenumberLink === "string"
              ? values.mobilenumberLink
              : undefined,
          ),
        },
      },
    });
    const updatedAccount = response.data?.updateAccount;
    if (!updatedAccount?.documentId) {
      throw new Error("Profile update was not confirmed");
    }

    if (user?.id && usernameChanged) {
      await updateUser({
        variables: {
          id: user.id,
          data: { username: incomingUsername },
        },
      });

      const authStore = useAuthStore.getState();
      authStore.login({
        ...user,
        username: incomingUsername,
        token: authStore.token || "",
      });

      try {
        const localTunesResult = await updateLocalTunesUsername(
          incomingUsername,
          currentUsername,
        );
        if (!localTunesResult.success) {
          console.warn(
            "LocalTunes username sync did not complete:",
            localTunesResult.message,
          );
        }
      } catch (localTunesError) {
        console.warn("LocalTunes username sync failed:", localTunesError);
      }
    }

    await refetch();
    return updatedAccount;
  };

  return { handleSubmit };
};
