import type { RevisionInput, UpdateAccountInput } from "../../../tunes/shared/explorersContract";

export type OnboardingFormData = {
  username: string; accountName: string; accountType?: unknown; bio?: string; mobile_number?: string;
  primaryAddress?: string; address?: string; city?: string; country?: string; state?: string;
  streetName?: string; postalCode?: string;
};

/**
 * The account update that finishes onboarding. Every address field the form collects goes
 * out, the postal code included: it is required by the form, and leaving it out of this
 * payload meant it was asked for and then silently discarded.
 */
export function buildOnboardingAccountUpdate(
  form: OnboardingFormData,
  expectedRevision: number,
  media: { profileImageId?: string; backgroundImageId?: string },
): UpdateAccountInput & RevisionInput {
  const type = String(form.accountType).toLowerCase();
  return {
    expectedRevision,
    handle: form.username.trim().toLowerCase(),
    displayName: form.accountName.trim(),
    accountType: type.includes("business") ? "Business" : type.includes("creator") ? "Creator" : "Personal",
    bioPlain: form.bio?.trim() || null,
    mobileNumber: form.mobile_number?.trim() || null,
    primaryAddress: form.primaryAddress ? { address: form.primaryAddress } : null,
    additionalAddresses: [{
      address: form.address || "", city: form.city || "", country: form.country || "",
      state: form.state || "", streetName: form.streetName || "", postalCode: (form.postalCode || "").trim(),
    }],
    ...(media.profileImageId ? { profileImageId: media.profileImageId } : {}),
    ...(media.backgroundImageId ? { backgroundImageId: media.backgroundImageId } : {}),
    onboardingStatus: "complete",
  };
}
