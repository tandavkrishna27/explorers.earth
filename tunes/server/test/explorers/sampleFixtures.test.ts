// tunes/server/test/explorers/sampleFixtures.test.ts
import { describe, expect, it } from "vitest";
import { SAMPLE_FIXTURE_SETS, sampleFixtureVersionSchema, sampleKeySchema } from "../../../shared/explorersSampleContract";
import { guideDayItemSchema } from "../../../shared/explorersGuideContract";
import { loadSampleSet, SAMPLE_FIXTURE_VERSION, SAMPLE_LIST_CATEGORIES, sampleFixtureFileSchema, sampleKeyFor, toGuideDayItem } from "../../application/sampleFixtures";

describe("first-visit sample fixtures (SMP-07, SMP-08, SMP-09, SMP-10)", () => {
  it("is version v1, a valid S3 fixture_version", () => {
    expect(SAMPLE_FIXTURE_VERSION).toBe("v1");
    expect(sampleFixtureVersionSchema.parse(SAMPLE_FIXTURE_VERSION)).toBe("v1");
  });

  for (const set of SAMPLE_FIXTURE_SETS) {
    describe(set, () => {
      const loaded = loadSampleSet(set);

      it("has 2-3 lists of 3-6 items in every list category", () => {
        for (const category of SAMPLE_LIST_CATEGORIES) {
          const file = loaded.lists[category];
          expect(file.set).toBe(set);
          expect(file.version).toBe(SAMPLE_FIXTURE_VERSION);
          expect(file.lists.length).toBeGreaterThanOrEqual(2);
          expect(file.lists.length).toBeLessThanOrEqual(3);
          for (const list of file.lists) {
            expect(list.items.length).toBeGreaterThanOrEqual(3);
            expect(list.items.length).toBeLessThanOrEqual(6);
          }
        }
      });

      it("has exactly one Trip guide with at least two days, each a valid guide-section-blocks/v2 item list", () => {
        const guide = loaded.guide.guide;
        expect(guide.days.length).toBeGreaterThanOrEqual(2);
        expect(guide.numberOfDays).toBe(guide.days.length);
        for (const day of guide.days) {
          expect(day.items.some((i) => i.kind === "place")).toBe(true);
          for (const item of day.items) expect(guideDayItemSchema.safeParse(toGuideDayItem(item)).success, item.localId).toBe(true);
        }
        const localIds = guide.days.flatMap((d) => d.items.map((i) => i.localId));
        expect(new Set(localIds).size).toBe(localIds.length);
      });

      it("derives S3 sample keys '<category>/<slug>' that are unique and valid, plus a valid idempotency key", () => {
        const keys = [...SAMPLE_LIST_CATEGORIES.flatMap((c) => loaded.lists[c].lists.map((l) => sampleKeyFor(c, l.key))), sampleKeyFor("guides", loaded.guide.guide.key)];
        expect(new Set(keys).size).toBe(keys.length);
        for (const key of keys) {
          expect(sampleKeySchema.safeParse(key).success, key).toBe(true);
          expect(`sample-v1-${key.replace("/", "-")}-99`).toMatch(/^[A-Za-z0-9._~-]{8,200}$/);
        }
      });

      // No authoring key was available for v1, so places are manual entities with coordinates.
      // Any id the resolver script later writes must still be a well-formed Google place id.
      it("gives every place coordinates, and any stored Google place id is well formed", () => {
        const places = [...loaded.lists.places.lists.flatMap((l) => l.items), ...loaded.guide.guide.days.flatMap((d) => d.items.flatMap((i) => (i.kind === "place" ? [i] : [])))];
        for (const place of places) {
          if (place.googlePlaceId !== null) expect(place.googlePlaceId, place.details.title).toMatch(/^[A-Za-z0-9_-]{10,}$/);
          expect(place.details.latitude, place.details.title).toEqual(expect.any(Number));
          expect(place.details.longitude, place.details.title).toEqual(expect.any(Number));
        }
      });

      it("carries no personal contact data and no person photos", () => {
        const text = JSON.stringify(loaded);
        expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i); // no e-mail addresses
        expect(text).not.toMatch(/\+?\d[\d\s-]{9,}\d/); // no phone numbers
        for (const list of loaded.lists.people.lists) for (const item of list.items) {
          expect(item.details.avatarUrl ?? null).toBeNull();
          expect(item.details.usernameHandle ?? null).toBeNull();
        }
      });
    });
  }

  it("rejects an unknown field so a typo cannot silently drop content", () => {
    const parsed = sampleFixtureFileSchema.safeParse({ set: "india", version: "v1", category: "movies", lists: [], extra: true });
    expect(parsed.success).toBe(false);
  });
});
