import type { AccountDto, UpdateAccountInput, RevisionInput } from "../../../../../tunes/shared/explorersContract";
import type { KeyValuePair } from "../types/profileSave";
import { explorersApiClient } from "../../../lib/explorersApiClient";

/** Only the compatibility mapper uses documentId; persistence always uses canonical UUIDs. */
export function toProfileViewModel(account: AccountDto): KeyValuePair {
  const social: Record<string, unknown> = { theme_settings: account.themeSettings };
  for (const item of account.socialLinks as Array<{ platform?: string; url?: string; visible?: boolean }>) {
    if (item.platform) social[item.platform] = { link: item.url ?? "", visibility: Boolean(item.visible) };
  }
  return {
    documentId: account.id, username: account.handle, Account_Name: account.displayName,
    Account_Type: account.accountType, Bio: account.bioPlain ?? "", Bio_1: account.bioPlain ?? "",
    Addresss: account.additionalAddresses[0] ?? {}, Primary_Address: account.primaryAddress,
    Public_Profile_Address: account.publicAddress,
    Feed_Data: (account.feedItems ?? []).map((item) => ({ id: item.id, documentId: item.mediaId ?? undefined,
      url: item.url, type: item.type, caption: item.caption, uploadSource: item.source,
      ...item.details })), social_media: social,
    mobile_number: account.mobileNumber, mobile_number_visibility: account.mobileNumberVisible,
    public_profile: account.publicProfile ? "Yes" : "No", auto_pinning: account.autoPinning,
    profile_picture: account.profileImage ? { url: account.profileImage.url, alternativeText: account.profileImage.alternativeText } : null,
    bg_picture: account.backgroundImage ? { url: account.backgroundImage.url, alternativeText: account.backgroundImage.alternativeText } : null,
    revision: account.revision, onboardingStatus: account.onboardingStatus,
  };
}

const optional = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
export function buildBusinessPublicAddress(values: KeyValuePair): KeyValuePair {
  return {
    title: values.title || values.businessTitle || "",
    address: values.businessAddress || "",
    contact: values.businessContact || "",
    website: values.businessWebsite || "",
    about: values.about || values.businessDescription || "",
    placeId: values.businessPlaceId || "",
    places: null,
  };
}
export function toAccountUpdate(values: KeyValuePair, account: Pick<AccountDto, "revision">): UpdateAccountInput & RevisionInput {
  const result: UpdateAccountInput & RevisionInput = { expectedRevision: account.revision };
  if ("username" in values) result.handle = optional(values.username);
  if ("accountName" in values) result.displayName = optional(values.accountName);
  if ("accountType" in values) {
    const type = String(values.accountType).toLowerCase();
    result.accountType = type === "business" ? "Business" : type === "creator" ? "Creator" : "Personal";
  }
  if ("bio" in values) result.bioPlain = optional(values.bio);
  if ("mobilenumberLink" in values) result.mobileNumber = optional(values.mobilenumberLink);
  if ("mobilenumberVisiblity" in values) result.mobileNumberVisible = Boolean(values.mobilenumberVisiblity);
  if ("primaryAddressCombined" in values) result.primaryAddress = optional(values.primaryAddressCombined)
    ? { address: values.primaryAddressCombined } : null;
  if ("address" in values) result.additionalAddresses = [{ address: values.address ?? "", city: values.city ?? "",
    country: values.country ?? "", state: values.state ?? "", streetName: values.streetName ?? "", postalCode: values.postalCode ?? "" }];
  if ("Public_Profile_Address" in values) {
    const address = values.Public_Profile_Address;
    result.publicAddress = address && typeof address === "object"
      ? Object.fromEntries(Object.entries(address).filter(([key, value]) =>
          !((key === "website" || key === "businessWebsite") && value === "")))
      : address || null;
  }
  if ("theme_settings" in values) result.themeSettings = values.theme_settings as Record<string, unknown>;
  if ("social_media" in values && values.social_media && typeof values.social_media === "object") {
    result.socialLinks = Object.entries(values.social_media as Record<string, any>)
      .filter(([name, value]) => name !== "theme_settings" && value && typeof value === "object" && typeof value.link === "string")
      .map(([platform, value]) => ({ platform: platform as AccountDto["socialLinks"][number]["platform"],
        url: value.link, visible: Boolean(value.visibility) }));
  }
  if ("Feed_Data" in values && Array.isArray(values.Feed_Data)) {
    result.feedItems = values.Feed_Data.map((item: any) => {
      const mediaId = typeof item.documentId === "string" && /^[0-9a-f-]{36}$/i.test(item.documentId)
        ? item.documentId : null;
      const externalUrl = mediaId ? null : typeof item.url === "string" ? item.url : null;
      const { id: _id, documentId: _documentId, url: _url, type: _type, caption: _caption,
        uploadSource: _source, ...details } = item;
      return { mediaId, externalUrl, source: item.uploadSource === "google-import" ? "google" :
        item.uploadSource === "manual" ? "manual" : "instagram", type: item.type === "video" ? "video" : "image",
      caption: typeof item.caption === "string" ? item.caption : null, details };
    });
  }
  return result;
}

export async function getProfile(): Promise<{ account: AccountDto; view: KeyValuePair }> {
  const account = await explorersApiClient.getMyProfile();
  return { account, view: toProfileViewModel(account) };
}
