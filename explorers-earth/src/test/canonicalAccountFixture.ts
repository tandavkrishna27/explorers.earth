import type { AccountDto } from "../../../tunes/shared/explorersContract";

/** Complete owner response used at the API boundary, with the real account hook. */
export const CANONICAL_CATEGORY_KEYS = ['places', 'music', 'guides', 'movies', 'books', 'games', 'apps', 'products', 'people'] as const;

/**
 * Owner account carrying all nine category rows, which toNavigationSnapshot requires
 * (it rejects anything that is not nine distinct categories and display orders).
 * `pins` lists canonical category keys in pinned order.
 */
export function canonicalCategoryAccount(overrides: Partial<AccountDto> = {}, pins: readonly string[] = []): AccountDto {
  return canonicalAccountFixture({
    categories: CANONICAL_CATEGORY_KEYS.map((category, displayOrder) => ({
      category, displayOrder, isPublic: true,
      pinnedOrder: pins.indexOf(category) >= 0 ? pins.indexOf(category) : null,
    })),
    ...overrides,
  });
}

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
