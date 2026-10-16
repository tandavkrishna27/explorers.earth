import { describe, expect, it } from "vitest";
import { toProfileViewModel, toAccountUpdate, buildBusinessPublicAddress } from "../profileClient";
import { updateAccountRequestSchema } from "../../../../../../tunes/shared/explorersContract";

const account = {
  id: "11111111-1111-4111-8111-111111111111", handle: "explorer", displayName: "Explorer",
  accountType: "Creator", onboardingStatus: "complete", status: "active", revision: 3,
  publicProfile: true, autoPinning: true, locale: "en", mobileNumber: "+12025550123",
  mobileNumberVisible: false, bioPlain: "Hello", bioRich: null,
  primaryAddress: { address: "A" }, additionalAddresses: [], publicAddress: null,
  profilePlaceDetails: null, categories: [], themeSettings: {}, socialLinks: [], businessDetails: {},
  profileImage: { id: "22222222-2222-4222-8222-222222222222", url: "/api/explorers/v1/media/22222222-2222-4222-8222-222222222222/content", mimeType: "image/png", size: 100, alternativeText: null, caption: null },
  feedItems: [{ id: "33333333-3333-4333-8333-333333333333", mediaId: "44444444-4444-4444-8444-444444444444",
    url: "/api/explorers/v1/media/44444444-4444-4444-8444-444444444444/content", source: "manual", type: "image",
    caption: null, details: { width: 800, height: 1000 } }],
};

describe("profile compatibility mapper", () => {
  it("maps canonical account identity and media to the existing view model", () => {
    const mapped = toProfileViewModel(account);
    expect(mapped.documentId).toBe(account.id);
    expect(mapped.username).toBe("explorer");
    expect(mapped.Account_Name).toBe("Explorer");
    expect(mapped.profile_picture?.url).toBe(account.profileImage.url);
    expect(mapped.mobile_number).toBe("+12025550123");
    expect(mapped.Feed_Data).toMatchObject([{ documentId: account.feedItems[0].mediaId,
      url: account.feedItems[0].url, width: 800 }]);
  });

  it("sends only explicit editable fields and the expected revision", () => {
    const update = toAccountUpdate({ username: "new-handle", accountName: "New", bio: "", mobilenumberLink: "" }, account);
    expect(update).toMatchObject({ expectedRevision: 3, handle: "new-handle", displayName: "New", bioPlain: null, mobileNumber: null });
    expect(update).not.toHaveProperty("id");
    expect(update).not.toHaveProperty("status");
  });

  it("sends local feed attachments by media ID under the account revision", () => {
    const view = toProfileViewModel(account);
    const update = toAccountUpdate({ Feed_Data: view.Feed_Data }, account);
    expect(update.feedItems).toMatchObject([{ mediaId: account.feedItems[0].mediaId,
      externalUrl: null, source: "manual", details: { width: 800, height: 1000 } }]);
  });

  it("keeps each form snapshot revision when another form has saved", () => {
    const first = toProfileViewModel(account);
    const second = toProfileViewModel(account);
    const firstSave = toAccountUpdate({ ...first, bio: "first" }, { revision: first.revision });
    const secondSave = toAccountUpdate({ ...second, bio: "second" }, { revision: second.revision });
    expect(firstSave.expectedRevision).toBe(3);
    expect(secondSave.expectedRevision).toBe(3);
  });

  it("validates the complete business address built by the Profile UI, including a selected place and blank website", () => {
    const produced = buildBusinessPublicAddress({ title: "Studio", businessAddress: "Main St",
      businessContact: "123", businessWebsite: "", about: "Open", businessPlaceId: "google-place-1" });
    expect(produced).toMatchObject({ placeId: "google-place-1", places: null, website: "" });
    const update = toAccountUpdate({ Public_Profile_Address: produced }, account);
    expect(update.publicAddress).toMatchObject({ placeId: "google-place-1", places: null, title: "Studio" });
    expect(update.publicAddress).not.toHaveProperty("website");
    expect(updateAccountRequestSchema.safeParse(update).success).toBe(true);
  });

  it("validates the landscape metadata emitted by the FeedFields upload path", () => {
    const view = toProfileViewModel(account);
    const upload = { documentId: account.feedItems[0].mediaId, url: account.feedItems[0].url,
      type: "image", uploadSource: "manual", fileName: "landscape.png", aspectRatio: "1.91:1",
      width: 1910, height: 1000 };
    const update = toAccountUpdate({ Feed_Data: [...view.Feed_Data, upload] }, account);
    expect(update.feedItems?.[1]?.details).toMatchObject({ aspectRatio: "1.91:1", width: 1910, height: 1000 });
    expect(updateAccountRequestSchema.safeParse(update).success).toBe(true);
  });
});
