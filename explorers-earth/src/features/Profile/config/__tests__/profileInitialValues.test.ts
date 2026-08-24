import { describe, expect, it } from "vitest";
import {
  buildProfileInitialValues,
  getAccountTypeKey,
} from "../profileInitialValues";

const t = (key: string) =>
  ({
    "dashboard.profile.publicProfile.accountTypes.personal": "Personal",
    "dashboard.profile.publicProfile.accountTypes.creator": "Creator",
    "dashboard.profile.publicProfile.accountTypes.business": "Business",
  })[key] ?? key;

const account = {
  Account_Name: "TK Explorer",
  Account_Type: "Creator",
  Bio: "Public bio",
  Addresss: {
    address: "Stored billing address",
    streetName: "Stored Street",
    city: "Stored City",
    state: "Stored State",
    country: "Stored Country",
    postalCode: "500001",
  },
  Primary_Address: { address: "Hyderabad, India" },
  Public_Profile_Address: {
    title: "Studio",
    address: "Banjara Hills",
    contact: "+910000000000",
    website: "https://example.com",
    about: "Open weekdays",
    placeId: "place-1",
  },
  Feed_Data: [{ id: "feed-1", url: "https://example.com/photo.jpg" }],
  mobile_number: "+919999999999",
  mobile_number_visibility: true,
  social_media: {
    instagram: { link: "https://instagram.com/tk", visibility: true },
    email: { link: "hello@example.com", visibility: false },
    localTunes: { link: "https://localtunes.earth/tk", visibility: true },
    futurePlatform: { link: "future://tk", visibility: true },
    theme_settings: {
      preset: "minimal-light",
      recommendations: { layout: "mosaic" },
    },
  },
};

describe("buildProfileInitialValues", () => {
  it("maps every stored data group while preserving unknown social data", () => {
    const values = buildProfileInitialValues({
      account,
      username: "tk2727",
      currentLocation: null,
      updatedPlaces: {},
      t,
    });

    expect(values.username).toBe("tk2727");
    expect(values.accountName).toBe("TK Explorer");
    expect(values.accountType).toBe("creator");
    expect(values.bio).toBe("Public bio");
    expect(values.address).toBe("Stored billing address");
    expect(values.primaryAddressCombined).toBe("Hyderabad, India");
    expect(values.streetName).toBe("Stored Street");
    expect(values.city).toBe("Stored City");
    expect(values.state).toBe("Stored State");
    expect(values.country).toBe("Stored Country");
    expect(values.postalCode).toBe("500001");
    expect(values.instagramLink).toBe("https://instagram.com/tk");
    expect(values.gmailLink).toBe("hello@example.com");
    expect(values.localTunesvisiblity).toBe(true);
    expect(values.Feed_Data).toEqual([
      { id: "feed-1", url: "https://example.com/photo.jpg" },
    ]);
    expect(values.theme_settings).toEqual({
      preset: "minimal-light",
      recommendations: { layout: "mosaic" },
    });
    expect(values.social_media).toEqual(account.social_media);
    expect(values.social_media.futurePlatform).toEqual({
      link: "future://tk",
      visibility: true,
    });
    expect(values.title).toBe("Studio");
    expect(values.businessAddress).toBe("Banjara Hills");
    expect(values.businessContact).toBe("+910000000000");
    expect(values.businessWebsite).toBe("https://example.com");
    expect(values.about).toBe("Open weekdays");
    expect(values.businessPlaceId).toBe("place-1");
    expect(values.Public_Profile_Address).toEqual(
      account.Public_Profile_Address,
    );
  });

  it("prefers newly mapped address components without changing public location", () => {
    const values = buildProfileInitialValues({
      account,
      username: "tk2727",
      currentLocation: { formatted_address: "Detected billing address" },
      updatedPlaces: {
        street_name: "Detected Street",
        city: "Detected City",
        state: "Detected State",
        country: "Detected Country",
        postal_code: "500099",
      },
      t,
    });

    expect(values.address).toBe("Detected billing address");
    expect(values.streetName).toBe("Detected Street");
    expect(values.city).toBe("Detected City");
    expect(values.state).toBe("Detected State");
    expect(values.country).toBe("Detected Country");
    expect(values.postalCode).toBe("500099");
    expect(values.primaryAddressCombined).toBe("Hyderabad, India");
  });

  it("normalizes stored account-type labels to stable keys", () => {
    expect(getAccountTypeKey("business", t)).toBe("business");
    expect(getAccountTypeKey("Personal", t)).toBe("personal");
    expect(getAccountTypeKey("Creator", t)).toBe("creator");
    expect(getAccountTypeKey("unknown", t)).toBe("personal");
  });
});
