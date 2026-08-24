import type { KeyValuePair } from "../types/profileSave";
import type { AddressResult } from "../types/types";

type Translate = (key: string) => string;

type CurrentLocation = {
  formatted_address?: string;
} | null;

interface BuildProfileInitialValuesInput {
  account?: KeyValuePair | null;
  username?: string;
  currentLocation?: CurrentLocation;
  updatedPlaces?: AddressResult;
  t: Translate;
}

const asRecord = (value: unknown): KeyValuePair =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as KeyValuePair)
    : {};

export const getAccountTypeKey = (
  storedValue: string,
  t: Translate,
): string => {
  if (["personal", "creator", "business"].includes(storedValue)) {
    return storedValue;
  }

  const translatedTypes: Record<string, string> = {
    [t("dashboard.profile.publicProfile.accountTypes.personal")]: "personal",
    [t("dashboard.profile.publicProfile.accountTypes.creator")]: "creator",
    [t("dashboard.profile.publicProfile.accountTypes.business")]: "business",
  };
  if (translatedTypes[storedValue]) return translatedTypes[storedValue];

  const commonTranslations: Record<string, string> = {
    Personal: "personal",
    Creator: "creator",
    Business: "business",
    personnel: "personal",
    créateur: "creator",
    entreprise: "business",
    个人: "personal",
    创作者: "creator",
    企业: "business",
    אישי: "personal",
    יוצר: "creator",
    עסק: "business",
  };

  return commonTranslations[storedValue] || "personal";
};

const parseBusinessAddress = (value: unknown): KeyValuePair => {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value);
};

export const buildProfileInitialValues = ({
  account,
  username = "",
  currentLocation = null,
  updatedPlaces = {},
  t,
}: BuildProfileInitialValuesInput): KeyValuePair => {
  const safeAccount = asRecord(account);
  const address = asRecord(safeAccount.Addresss);
  const primaryAddress = asRecord(safeAccount.Primary_Address);
  const socialMedia = asRecord(safeAccount.social_media);
  const businessData = parseBusinessAddress(
    safeAccount.Public_Profile_Address,
  );

  const platform = (name: string) => asRecord(socialMedia[name]);

  return {
    username,
    accountName: safeAccount.Account_Name || "",
    accountType: getAccountTypeKey(
      typeof safeAccount.Account_Type === "string"
        ? safeAccount.Account_Type
        : "",
      t,
    ),
    bio: safeAccount.Bio || "",
    address:
      currentLocation?.formatted_address || address.address || "",
    primaryAddressCombined:
      primaryAddress.address ||
      `${address.city || ""}${
        address.city && address.country ? ", " : ""
      }${address.country || ""}`,
    streetName: updatedPlaces.street_name || address.streetName || "",
    postalCode: updatedPlaces.postal_code || address.postalCode || "",
    state: updatedPlaces.state || address.state || "",
    city: updatedPlaces.city || address.city || "",
    country: updatedPlaces.country || address.country || "",

    instagramLink: platform("instagram").link || "",
    whatsappLink: platform("whatsapp").link || "",
    websiteLink: platform("website").link || "",
    spotifyLink: platform("spotify").link || "",
    XLink: platform("X").link || "",
    youtubeLink: platform("youtube").link || "",
    mobilenumberLink: safeAccount.mobile_number || "",
    mobilenumberVisiblity: safeAccount.mobile_number_visibility,
    youtubeMusicLink: platform("youtubeMusic").link || "",
    linkedinLink: platform("linkedin").link || "",
    gmailLink: platform("email").link || "",
    appleMusicLink: platform("appleMusic").link || "",
    tiktokLink: platform("tiktok").link || "",
    snapchatLink: platform("snapchat").link || "",
    facebookLink: platform("facebook").link || "",

    instagramvisiblity: platform("instagram").visibility || false,
    whatsappvisiblity: platform("whatsapp").visibility || false,
    websitevisiblity: platform("website").visibility || false,
    spotifyvisiblity: platform("spotify").visibility || false,
    Xvisiblity: platform("X").visibility || false,
    youtubevisiblity: platform("youtube").visibility || false,
    youtubeMusicvisiblity: platform("youtubeMusic").visibility || false,
    linkedinvisiblity: platform("linkedin").visibility || false,
    gmailvisiblity: platform("email").visibility || false,
    appleMusicvisiblity: platform("appleMusic").visibility || false,
    tiktokvisiblity: platform("tiktok").visibility || false,
    snapchatvisiblity: platform("snapchat").visibility || false,
    facebookvisiblity: platform("facebook").visibility || false,
    localTunesvisiblity: platform("localTunes").visibility || false,

    title: businessData.title || businessData.businessTitle || "",
    businessAddress:
      businessData.address || businessData.businessAddress || "",
    businessContact:
      businessData.contact || businessData.businessContact || "",
    businessWebsite:
      businessData.website || businessData.businessWebsite || "",
    about: businessData.about || businessData.businessDescription || "",
    businessPlaceId:
      businessData.placeId || businessData.businessPlaceId || "",
    Public_Profile_Address:
      safeAccount.Public_Profile_Address === undefined
        ? null
        : safeAccount.Public_Profile_Address,

    Feed_Data: Array.isArray(safeAccount.Feed_Data)
      ? safeAccount.Feed_Data
      : [],
    social_media: socialMedia,
    theme_settings: asRecord(socialMedia.theme_settings),
  };
};
