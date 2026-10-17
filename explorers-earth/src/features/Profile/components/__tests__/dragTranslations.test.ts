import { describe, expect, it } from "vitest";

const resourceModules = import.meta.glob(
  "../../../../i18n/resources/*.json",
  { eager: true, import: "default" },
);

const DRAG_KEYS = [
  "cancel",
  "drop",
  "handle",
  "instructions",
  "lift",
  "move",
] as const;

type DragKey = (typeof DRAG_KEYS)[number];
type DragMessages = Record<DragKey, string>;

interface LocaleResource {
  dashboard: {
    profile: {
      editor: {
        drag: DragMessages;
      };
    };
  };
}

const localeFromPath = (path: string) =>
  path.match(/\/([^/]+)\.json$/)?.[1] || path;

const placeholders = (message: string) =>
  [...message.matchAll(/{{([^}]+)}}/g)]
    .map((match) => match[1])
    .sort();

describe("shipped profile drag translations", () => {
  it("localizes every drag message in all 46 non-English resources", () => {
    const resources = Object.fromEntries(
      Object.entries(resourceModules).map(([path, resource]) => [
        localeFromPath(path),
        resource as LocaleResource,
      ]),
    );
    const english = resources.en.dashboard.profile.editor.drag;

    expect(Object.keys(resources)).toHaveLength(47);
    for (const [locale, resource] of Object.entries(resources)) {
      if (locale === "en") continue;
      const translated = resource.dashboard.profile.editor.drag;
      for (const key of DRAG_KEYS) {
        expect(translated[key], `${locale}.${key} must be localized`).not.toBe(
          english[key],
        );
        expect(
          placeholders(translated[key]),
          `${locale}.${key} must preserve interpolation placeholders`,
        ).toEqual(placeholders(english[key]));
      }
      expect(translated.drop, `${locale}.drop must be terminal copy`).not.toBe(
        translated.move,
      );
    }
  });
});
