import { describe, expect, it } from "vitest";
import {
  getAccountSettingsFields,
  getAppearanceFields,
  getBillingAddressFields,
  getGalleryFields,
  getProfileFields,
} from "../profileFormSections";

const t = (key: string) => key;

const names = (sections: ReturnType<typeof getProfileFields>) =>
  sections.flatMap((section) => section.formFields.map((field) => field.name));

describe("profile form section destinations", () => {
  it("keeps every public identity and contact field on Profile", () => {
    expect(names(getProfileFields(t))).toEqual([
      "bio",
      "accountName",
      "primaryAddressCombined",
      "socialLinks",
      "businessLocation",
    ]);
  });

  it("keeps Feed_Data editing on Gallery", () => {
    expect(names(getGalleryFields(t))).toEqual(["feed"]);
  });

  it("keeps theme and recommendations presentation on Appearance", () => {
    expect(names(getAppearanceFields(t))).toEqual(["theme_settings"]);
  });

  it("moves private identity fields to Settings Account", () => {
    expect(names(getAccountSettingsFields(t))).toEqual([
      "username",
      "accountType",
    ]);
  });

  it("moves every detailed address component to Settings Billing", () => {
    expect(names(getBillingAddressFields(t))).toEqual([
      "address",
      "streetName",
      "state",
      "city",
      "country",
      "postalCode",
    ]);
  });

  it("places every pre-move data point in exactly one destination", () => {
    const allNames = [
      ...names(getProfileFields(t)),
      ...names(getGalleryFields(t)),
      ...names(getAppearanceFields(t)),
      ...names(getAccountSettingsFields(t)),
      ...names(getBillingAddressFields(t)),
    ];

    expect(allNames).toEqual([
      "bio",
      "accountName",
      "primaryAddressCombined",
      "socialLinks",
      "businessLocation",
      "feed",
      "theme_settings",
      "username",
      "accountType",
      "address",
      "streetName",
      "state",
      "city",
      "country",
      "postalCode",
    ]);
    expect(new Set(allNames).size).toBe(allNames.length);
  });
});
