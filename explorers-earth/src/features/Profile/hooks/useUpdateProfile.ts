import { gql, useMutation } from "@apollo/client";
import { KeyValuePair } from "../components/ProfileForm";
import { toast } from "sonner";
import useAuthStore from "../../../store/store";
import { useTranslation } from "react-i18next";
import { updateLocalTunesUsername } from "../../../services/localTunesService";
import { mobileNumberField } from "./mobileNumberField";


// Utility function to convert English account type keys to translated values
const getAccountTypeValue = (key: string, t: any): string => {
  const accountTypeMap: { [key: string]: string } = {
    'personal': t('dashboard.profile.publicProfile.accountTypes.personal'),
    'creator': t('dashboard.profile.publicProfile.accountTypes.creator'),
    'business': t('dashboard.profile.publicProfile.accountTypes.business')
  };

  return accountTypeMap[key] || t('dashboard.profile.publicProfile.accountTypes.personal');
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
  AppleMusic?: boolean;
  Spotify?: boolean;
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

// Corrected mutation - matches the one in api/mutation.ts
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

export type BooleanKeyValuePair = { [key in keyof Visibility]?: boolean };

export const useUpdateProfile = (
  documentId: string | undefined,
  refetch: () => void
) => {
  // mutation for profile uploading
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [updateProfile] = useMutation(updateProfileMutation);
  const [createAccount] = useMutation(onboardingQuery);
  const [updateUser] = useMutation(gql`
    mutation UpdateUsersPermissionsUser($id: ID!, $data: UsersPermissionsUserInput!) {
      updateUsersPermissionsUser(id: $id, data: $data) {
        data {
          username
        }
      }
    }
  `);

  // submit function for updating profile values
  const handleSubmit = async (values: KeyValuePair) => {
    try {
      if (!documentId) {
        const visibility: BooleanKeyValuePair = (values.visibility ??
          {}) as BooleanKeyValuePair;
        // If documentId is undefined, create a new account
        const response = await createAccount({
          variables: {
            data: {
              Bio: values.bio,
              Addresss: {
                streetNumber: values.streetNumber,
                streetName: values.streetName,
                postalCode: values.postalCode,
                state: values.state,
                city: values.city,
                country: values.country,
                address: values.address,
              },
              Primary_Address: {
                address: values.primaryAddressCombined,
              },
              Public_Profile_Address: values.Public_Profile_Address || null,
              Feed_Data: values.Feed_Data || [],
              social_media: {
                instagram: {
                  link: values.instagramLink,
                  visibility: visibility.Instagram ?? false,
                },
                youtube: {
                  link: values.youtubeLink,
                  visibility: visibility.Youtube ?? false,
                },
                whatsapp: {
                  link: values.whatsappLink,
                  visibility: visibility.Whatsapp ?? false,
                },
                website: {
                  link: values.websiteLink,
                  visibility: visibility.Website ?? false,
                },
                facebook: {
                  link: values.facebookLink,
                  visibility: visibility.Facebook ?? false,
                },
                linkedin: {
                  link: values.linkedinLink,
                  visibility: visibility.Linkedin ?? false,
                },
                snapchat: {
                  link: values.snapchatLink,
                  visibility: visibility.Snapchat ?? false,
                },
                tiktok: {
                  link: values.tiktokLink,
                  visibility: visibility.Tiktok ?? false,
                },
                email: {
                  link: values.gmailLink,
                  visibility: visibility.Gmail ?? false,
                },
                X: {
                  link: values.XLink,
                  visibility: visibility.X ?? false,
                },
                spotify: {
                  link: values.spotifyLink,
                  visibility: visibility.Spotify ?? false,
                },
                youtubeMusic: {
                  link: values.youtubeMusicLink,
                  visibility: visibility.YoutubeMusic ?? false,
                },
                appleMusic: {
                  link: values.appleMusicLink,
                  visibility: visibility.AppleMusic ?? false,
                },
              },
              Account_Type: getAccountTypeValue(values.accountType, t),
              Account_Name: values.accountName,
              username: values.username,
              mobile_number_visibility: values.mobilenumberVisiblity,
              mobile_number: values.mobilenumberLink,
              users_permissions_users: user?.documentId,
            },
          },
        });

        if (response.data) {
          toast.success(t('dashboard.profile.common.savedAndPublishedSuccessfully'));
          refetch();
        }
      } else {
        // If documentId exists, update the profile
        const visibility: BooleanKeyValuePair = (values.visibility ?? {}) as BooleanKeyValuePair;
        // Determine if username actually changed compared to current authenticated user
        // This prevents unnecessary updates to the UsersPermissionsUser record which would
        // otherwise bump updatedAt and incorrectly reset username cooldown.
        const currentUsername = user?.username ?? "";
        const incomingUsername: string | undefined = values.username;
        const usernameChanged = Boolean(
          incomingUsername && incomingUsername.trim() !== currentUsername
        );

        // 1. Update Account (all fields including username)
        const response = await updateProfile({
          variables: {
            documentId: documentId,
            data: {
              Bio: values.bio,
              Account_Name: values.accountName,
              // Only include username in Account update if it actually changed
              ...(usernameChanged && incomingUsername
                ? { username: incomingUsername }
                : {}),
              Addresss: {
                streetNumber: values.streetNumber,
                streetName: values.streetName,
                postalCode: values.postalCode,
                state: values.state,
                city: values.city,
                country: values.country,
                address: values.address,
              },
              Primary_Address: {
                address: values.primaryAddressCombined,
              },
              Public_Profile_Address: values.Public_Profile_Address || null,
              Feed_Data: values.Feed_Data || [],
              social_media: {
                instagram: {
                  link: values.instagramLink,
                  visibility: visibility.Instagram ?? false,
                },
                youtube: {
                  link: values.youtubeLink,
                  visibility: visibility.Youtube ?? false,
                },
                whatsapp: {
                  link: values.whatsappLink,
                  visibility: visibility.Whatsapp ?? false,
                },
                website: {
                  link: values.websiteLink,
                  visibility: visibility.Website ?? false,
                },
                facebook: {
                  link: values.facebookLink,
                  visibility: visibility.Facebook ?? false,
                },
                linkedin: {
                  link: values.linkedinLink,
                  visibility: visibility.Linkedin ?? false,
                },
                snapchat: {
                  link: values.snapchatLink,
                  visibility: visibility.Snapchat ?? false,
                },
                tiktok: {
                  link: values.tiktokLink,
                  visibility: visibility.Tiktok ?? false,
                },
                email: {
                  link: values.gmailLink,
                  visibility: visibility.Gmail ?? false,
                },
                X: {
                  link: values.XLink,
                  visibility: visibility.X ?? false,
                },
                spotify: {
                  link: values.spotifyLink,
                  visibility: visibility.Spotify ?? false,
                },
                youtubeMusic: {
                  link: values.youtubeMusicLink,
                  visibility: visibility.YoutubeMusic ?? false,
                },
                appleMusic: {
                  link: values.appleMusicLink,
                  visibility: visibility.AppleMusic ?? false,
                },
              },
              Account_Type: getAccountTypeValue(values.accountType, t),
              mobile_number_visibility: values.mobilenumberVisiblity,
              ...mobileNumberField(values.mobilenumberLink),
            },
          },
        });

        // 2. Update User (username field) ONLY when username actually changed
        if (user?.id && usernameChanged && incomingUsername) {
          await updateUser({
            variables: {
              id: user.id,
              data: { username: incomingUsername },
            },
          });
        }

        // ✅ FIXED: Proper response validation with backend confirmation
        if (response.data?.updateAccount?.documentId) {
          // Update auth store with new username only if it changed
          if (user && usernameChanged && incomingUsername) {
            const authStore = useAuthStore.getState();
            authStore.login({
              ...user,
              username: incomingUsername,
              token: authStore.token || "", // Preserve existing token
            });

            // Sync username change with LocalTunes
            console.log('🔄 Starting LocalTunes username sync...', {
              currentUsername: currentUsername,
              newUsername: incomingUsername
            });
            try {
              // Pass user details for sync
              const localTunesResult = await updateLocalTunesUsername(
                incomingUsername,
                currentUsername
              );
              console.log('LocalTunes username sync result:', localTunesResult);
              if (localTunesResult.success) {
                console.log('✅ Username synced with LocalTunes');
                toast.success('Username changed successfully in both explorers and LocalTunes!');
              } else {
                console.warn('⚠️ LocalTunes username sync warning:', localTunesResult.message);
                // Show a warning but don't fail the username change
                if (localTunesResult.message &&
                  !localTunesResult.message.includes('disabled') &&
                  !localTunesResult.message.includes('not found')) {
                  // Check if it's the development mode restriction
                  if (localTunesResult.message.includes('development mode')) {
                    toast.warning('Username changed in explorers. Please also change your username in LocalTunes manually.');
                  } else {
                    toast.warning(`explorers username changed, but ${localTunesResult.message}`);
                  }
                }
              }
            } catch (localTunesError) {
              console.error('❌ LocalTunes username sync error:', localTunesError);
              // Don't fail the entire username change process
              toast.warning('Username changed in explorers, but could not sync with LocalTunes');
            }
          }

          toast.success(t('dashboard.profile.common.savedAndPublishedSuccessfully'));
          // Only refetch after confirmed backend success
          refetch();
        } else {
          // Backend did not confirm profile update
          toast.error(t('dashboard.profile.common.saveAndPublishFailed'));
        }
      }
    } catch (error) {
      if (typeof error === "object" && error !== null) {
        const err = error as any;

        // Provide specific error messages based on error type
        if (err.graphQLErrors?.length > 0) {
          const graphQLError = err.graphQLErrors[0];
          toast.error(t("toast.error.updateFailedWithError", { error: graphQLError.message || t("toast.error.graphQLErrorOccurred") }));
        } else if (err.networkError) {
          toast.error(t('dashboard.profile.common.networkError'));
        } else {
          toast.error(t('dashboard.profile.common.unexpectedError'));
        }
      } else {
        toast.error(t('dashboard.profile.common.somethingWentWrong'));
      }
    }
  };

  return {
    handleSubmit,
  };
};