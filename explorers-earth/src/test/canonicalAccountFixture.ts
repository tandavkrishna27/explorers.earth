import type { AccountDto } from "../../../tunes/shared/explorersContract";

/** Complete owner response used at the API boundary, with the real account hook. */
export function canonicalAccountFixture(overrides: Partial<AccountDto> = {}): AccountDto {
  return {
    id: "11111111-1111-4111-8111-111111111111", handle: "explorer", displayName: "Explorer",
    accountType: "Personal", onboardingStatus: "complete", status: "active", revision: 1,
    publicProfile: true, autoPinning: false, locale: "en", mobileNumber: "+919999999999",
    mobileNumberVisible: false, bioPlain: null, bioRich: null, primaryAddress: null,
    additionalAddresses: [], publicAddress: null, profilePlaceDetails: null, categories: [],
    themeSettings: {}, socialLinks: [], businessDetails: {}, feedItems: [], ...overrides,
  };
}
