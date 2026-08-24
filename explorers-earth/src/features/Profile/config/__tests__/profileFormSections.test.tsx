import { describe, expect, it } from "vitest";
import {
  getAccountSettingsFields,
  getAppearanceFields,
  getBillingAddressFields,
  getGalleryFields,
  getProfileFields,
} from "../profileFormSections";

const localeResources = import.meta.glob("../../../../i18n/resources/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>;

const valueAt = (resource: Record<string, unknown>, path: string) =>
  path.split(".").reduce<unknown>(
    (value, key) => (value && typeof value === "object"
      ? (value as Record<string, unknown>)[key]
      : undefined),
    resource,
  );

const t = (key: string) => key;

const names = (sections: ReturnType<typeof getProfileFields>) =>
  sections.flatMap((section) => section.formFields.map((field) => field.name));

describe("profile form section destinations", () => {
  it("keeps localized editor names, workspace copy, appearance areas, and drag announcements in parity", () => {
    const editorKeys = [
      "dashboard.profile.editor.tablist",
      "dashboard.profile.editor.tabs.profile",
      "dashboard.profile.editor.tabs.gallery",
      "dashboard.profile.editor.tabs.appearance",
      "dashboard.profile.editor.headings.profile",
      "dashboard.profile.editor.headings.gallery",
      "dashboard.profile.editor.headings.appearance",
      "dashboard.profile.editor.appearance.themeStyle",
      "dashboard.profile.editor.appearance.publicLanding",
      "dashboard.profile.editor.appearance.recommendationsLayout",
      "dashboard.profile.editor.appearance.categoryOrder",
      "dashboard.profile.editor.drag.lift",
      "dashboard.profile.editor.drag.move",
      "dashboard.profile.editor.drag.drop",
      "dashboard.profile.editor.drag.cancel",
    ];

    for (const [path, resource] of Object.entries(localeResources)) {
      for (const key of editorKeys) {
        expect(valueAt(resource, key), `${path} is missing ${key}`)
          .toEqual(expect.any(String));
      }
    }
  });

  it("keeps the editor tablist key present in every RTL locale", () => {
    const rtlLocales = ["ar", "he"];

    for (const locale of rtlLocales) {
      const resource = localeResources[`../../../../i18n/resources/${locale}.json`];
      expect(valueAt(resource, "dashboard.profile.editor.tablist"))
        .toEqual(expect.any(String));
    }
  });

  it("presents Profile as divider accordions and Gallery and Appearance directly", () => {
    expect(getProfileFields(t).map((section) => section.presentation)).toEqual([
      "accordion",
      "accordion",
      "accordion",
    ]);
    expect(getGalleryFields(t).map((section) => section.presentation)).toEqual([
      "direct",
    ]);
    expect(getAppearanceFields(t).map((section) => section.presentation)).toEqual([
      "direct",
    ]);
  });

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
