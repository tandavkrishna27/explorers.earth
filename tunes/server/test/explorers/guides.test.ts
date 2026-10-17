import { describe, expect, it } from "vitest";
import {
  GUIDE_SECTION_BLOCK_VERSION, GUIDE_SECTION_PAGE_LIMIT, guideAggregateDtoSchema, guideBudgetPlaceSchema, guideCollectionDetailsSchema,
  guideDayPlaceSchema, guideEmptySectionBlocks, guideSectionBlocksSchema, guideSectionDtoSchema,
  reorderGuideSectionsSchema, writeGuideSectionSchema, type GuideSectionBlocks,
} from "../../../shared/explorersGuideContract";

/**
 * The guide contract. Ticket 5.3.
 *
 * These pin the decisions that typechecking cannot see, in particular the geometry shape:
 * Guides nests it and Places flattens it, and getting that wrong compiles cleanly while
 * every map renders nothing.
 */
const uuid = (n: number) => `0000${n}`.slice(-4).padStart(8, "a") + "-0000-4000-8000-" + String(n).padStart(12, "0");

const place = (overrides: Record<string, unknown> = {}) => ({
  localId: "m1", placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4", name: "Kashi Art Cafe",
  formattedAddress: "Burgher St, Fort Kochi", geometry: { location: { lat: 9.9658, lng: 76.2421 } },
  types: ["cafe", "food"], tips: "Go before ten", photos: [], priceLevel: 2, priceRange: null,
  customBudget: null, budgetAmount: "450.00", budgetCurrency: "INR", source: "google" as const, verified: true,
  ...overrides,
});

const blocks = (overrides: Partial<GuideSectionBlocks> = {}): unknown => ({ ...guideEmptySectionBlocks, ...overrides });

describe("guide day place", () => {
  it("keeps geometry nested, because that is the shape every Guides map reads", () => {
    const parsed = guideDayPlaceSchema.parse(place());
    expect(parsed.geometry).toEqual({ location: { lat: 9.9658, lng: 76.2421 } });
    // The flat Places shape must not validate here. If this ever passes, a reader doing
    // `geometry.location.lat` silently gets undefined and the itinerary map goes blank.
    expect(guideDayPlaceSchema.safeParse(place({ geometry: { lat: 9.9658, lng: 76.2421 } })).success).toBe(false);
  });

  it("treats zero as a real coordinate and absent as null, never (0,0)", () => {
    expect(guideDayPlaceSchema.parse(place({ geometry: { location: { lat: 0, lng: 0 } } })).geometry)
      .toEqual({ location: { lat: 0, lng: 0 } });
    expect(guideDayPlaceSchema.parse(place({ geometry: null })).geometry).toBeNull();
  });

  it("carries money as an exact decimal string and refuses an amount without its currency", () => {
    expect(guideDayPlaceSchema.parse(place({ budgetAmount: "0.05", budgetCurrency: "EUR" })).budgetAmount).toBe("0.05");
    expect(guideDayPlaceSchema.safeParse(place({ budgetAmount: "450.00", budgetCurrency: null })).success).toBe(false);
    expect(guideDayPlaceSchema.safeParse(place({ budgetAmount: null, budgetCurrency: "INR" })).success).toBe(false);
    // A float, a negative, three decimals and a non-ISO currency are all refused.
    for (const amount of ["450", "4.5.0", "-1", "1.234", "1e3"].slice(1))
      expect(guideDayPlaceSchema.safeParse(place({ budgetAmount: amount })).success).toBe(false);
    expect(guideDayPlaceSchema.safeParse(place({ budgetCurrency: "inr" })).success).toBe(false);
  });

  it("will not let an unverified AI suggestion claim verification", () => {
    expect(guideDayPlaceSchema.safeParse(place({ source: "ai-unverified", verified: true })).success).toBe(false);
    expect(guideDayPlaceSchema.parse(place({ source: "ai-unverified", verified: false })).verified).toBe(false);
  });

  it("describes a photo by media id alone, with no URL to go stale", () => {
    const photo = { mediaId: uuid(1), fileName: "cafe.jpg", width: 1600, height: 900, aspectRatio: "16:9" };
    expect(guideDayPlaceSchema.parse(place({ photos: [photo] })).photos[0]).toEqual(photo);
    // A URL alongside the id would be a second source of truth for the same bytes.
    expect(guideDayPlaceSchema.safeParse(place({ photos: [{ ...photo, url: "https://cdn.example/cafe.jpg" }] })).success).toBe(false);
    // So would a transient loading flag, which would persist a spinner that never stops.
    expect(guideDayPlaceSchema.safeParse(place({ photos: [{ ...photo, photosLoading: true }] })).success).toBe(false);
  });
});

describe("guide section blocks", () => {
  it("round-trips every block with non-ASCII rich text unchanged", () => {
    const full = blocks({
      timeline: { morning: [place()], afternoon: [place({ localId: "a1", name: "ചായക്കട — tea stall" })], evening: [] },
      transport: { segments: [{ fromLocalId: "m1", toLocalId: "a1", mode: "auto", distanceKm: 3.4, estimatedMinutes: 12 }] },
      stay: { accommodations: [place({ localId: "s1", name: "Brunton Boatyard" })] },
      activities: { activities: [place({ localId: "v1", name: "Kathakali — കഥകളി" })] },
      budget: { morning: [{ localId: "m1", placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4", name: "Kashi Art Cafe", priceLevel: 2, priceRange: null, customBudget: null, budgetAmount: "450.00", budgetCurrency: "INR" }], afternoon: [], evening: [] },
      mapDetails: { center: { lat: 9.9658, lng: 76.2421 }, zoom: 14 },
      packingList: { items: [{ localId: "p1", label: "Mosquito repellent", done: false }] },
      preTasks: { items: [{ localId: "t1", label: "Book the backwater ferry", done: true }] },
      tags: ["slow", "ആയുർവേദം"],
    });
    const parsed = guideSectionBlocksSchema.parse(full);
    expect(parsed).toEqual(full);
    // Serialising and re-parsing must be a fixed point, or a save-reload cycle drifts.
    expect(guideSectionBlocksSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("refuses a transport segment that routes to an entry the section does not contain", () => {
    const orphaned = blocks({
      timeline: { morning: [place()], afternoon: [], evening: [] },
      transport: { segments: [{ fromLocalId: "m1", toLocalId: "gone", mode: "walk", distanceKm: 1, estimatedMinutes: 10 }] },
    });
    const result = guideSectionBlocksSchema.safeParse(orphaned);
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].path).toEqual(["transport", "segments", 0]);
  });

  it("refuses a budget entry for an entry the section does not contain", () => {
    const result = guideSectionBlocksSchema.safeParse(blocks({
      timeline: { morning: [place()], afternoon: [], evening: [] },
      budget: { morning: [{ localId: "ghost", placeId: "ChIJ1", name: "Nowhere", priceLevel: null, priceRange: null, customBudget: null, budgetAmount: null, budgetCurrency: null }], afternoon: [], evening: [] },
    }));
    expect(result.success).toBe(false);
  });

  it("accepts a segment between two entries in different parts of the day", () => {
    expect(guideSectionBlocksSchema.safeParse(blocks({
      timeline: { morning: [place()], afternoon: [], evening: [place({ localId: "e1" })] },
      transport: { segments: [{ fromLocalId: "m1", toLocalId: "e1", mode: "taxi", distanceKm: 8, estimatedMinutes: 25 }] },
    })).success).toBe(true);
  });

  it("refuses a segment that starts and ends at the same entry", () => {
    expect(guideSectionBlocksSchema.safeParse(blocks({
      timeline: { morning: [place()], afternoon: [], evening: [] },
      transport: { segments: [{ fromLocalId: "m1", toLocalId: "m1", mode: "walk", distanceKm: 0, estimatedMinutes: 0 }] },
    })).success).toBe(false);
  });

  it("pins the block version, so a future schema is refused rather than half-read", () => {
    expect(guideSectionBlocksSchema.parse(blocks()).version).toBe(GUIDE_SECTION_BLOCK_VERSION);
    expect(guideSectionBlocksSchema.safeParse({ ...guideEmptySectionBlocks, version: "guide-section-blocks/v2" }).success).toBe(false);
    expect(guideSectionBlocksSchema.safeParse({ ...guideEmptySectionBlocks, version: undefined }).success).toBe(false);
  });

  it("requires every block to be present rather than optional", () => {
    const { transport: _dropped, ...withoutTransport } = guideEmptySectionBlocks;
    expect(guideSectionBlocksSchema.safeParse(withoutTransport).success).toBe(false);
  });

  it("rejects an unknown block key instead of silently discarding it", () => {
    expect(guideSectionBlocksSchema.safeParse({ ...guideEmptySectionBlocks, itinerary: {} }).success).toBe(false);
  });

  it("bounds a section's size, matching the database's own limit", () => {
    const many = Array.from({ length: 40 }, (_unused, index) => place({ localId: "m" + index, tips: "x".repeat(4000) }));
    expect(guideSectionBlocksSchema.safeParse(blocks({ timeline: { morning: many, afternoon: many, evening: many } })).success).toBe(false);
  });

  it("offers an empty section that is empty arrays, never missing keys", () => {
    const parsed = guideSectionBlocksSchema.parse(guideEmptySectionBlocks);
    expect(parsed.timeline).toEqual({ morning: [], afternoon: [], evening: [] });
    expect(parsed.transport.segments).toEqual([]);
    expect(parsed.mapDetails).toBeNull();
  });
});

describe("guide budget place", () => {
  it("needs an amount and a currency together", () => {
    const base = { localId: "m1", placeId: "ChIJ1", name: "Cafe", priceLevel: null, priceRange: null, customBudget: null };
    expect(guideBudgetPlaceSchema.safeParse({ ...base, budgetAmount: "10.00", budgetCurrency: null }).success).toBe(false);
    expect(guideBudgetPlaceSchema.safeParse({ ...base, budgetAmount: "10.00", budgetCurrency: "INR" }).success).toBe(true);
  });
});

describe("guide collection details", () => {
  const details = (overrides: Record<string, unknown> = {}) => ({
    guideType: "itinerary" as const, multiCity: true, numberOfDays: 5, estimatedBudget: "42000.50",
    budgetCurrency: "INR", budgetType: "per-person" as const, bestTimeToVisit: ["October", "November"],
    categories: ["Backwaters"], tags: ["slow"], tipsNotes: { blocks: [] },
    place: { name: "Kochi", address: "Kerala, India", placeId: "ChIJ1", rating: 4.6, ratingsCount: 12044, lat: 9.9312, lng: 76.2673 },
    locationEntityId: null, ...overrides,
  });

  it("accepts a complete multi-city guide", () => {
    expect(guideCollectionDetailsSchema.parse(details()).numberOfDays).toBe(5);
  });

  it("refuses a budget without its currency, and a budget type without a budget", () => {
    expect(guideCollectionDetailsSchema.safeParse(details({ budgetCurrency: null })).success).toBe(false);
    expect(guideCollectionDetailsSchema.safeParse(details({ estimatedBudget: null, budgetCurrency: null })).success).toBe(false);
    expect(guideCollectionDetailsSchema.safeParse(details({ estimatedBudget: null, budgetCurrency: null, budgetType: null })).success).toBe(true);
  });

  it("keeps the guide's coordinates paired", () => {
    expect(guideCollectionDetailsSchema.safeParse(details({ place: { ...details().place, lng: null } })).success).toBe(false);
  });

  it("bounds day counts to a real trip", () => {
    for (const days of [0, -1, 366, 1.5])
      expect(guideCollectionDetailsSchema.safeParse(details({ numberOfDays: days })).success).toBe(false);
    expect(guideCollectionDetailsSchema.safeParse(details({ numberOfDays: null })).success).toBe(true);
  });
});

describe("guide aggregate", () => {
  const section = (id: string, order: number) => guideSectionDtoSchema.parse({
    id, collectionId: uuid(9), title: "Day " + (order + 1), description: null, displayOrder: order,
    blocks: guideEmptySectionBlocks, archived: false,
    createdAt: "2026-10-08T00:00:00.000Z", updatedAt: "2026-10-08T00:00:00.000Z",
  });
  const aggregate = (sections: unknown[], extra: Record<string, unknown> = {}) => ({
    collectionId: uuid(9), revision: 7, sectionCount: sections.length, nextCursor: null,
    details: guideCollectionDetailsSchema.parse({
      guideType: null, multiCity: false, numberOfDays: null, estimatedBudget: null, budgetCurrency: null,
      budgetType: null, bestTimeToVisit: [], categories: [], tags: [], tipsNotes: null,
      place: { name: null, address: null, placeId: null, rating: null, ratingsCount: null, lat: null, lng: null },
      locationEntityId: null,
    }),
    coverMediaId: null, sections, ...extra,
  });

  it("accepts strictly ordered sections", () => {
    expect(guideAggregateDtoSchema.parse(aggregate([section(uuid(1), 0), section(uuid(2), 1)])).sections).toHaveLength(2);
  });

  it("refuses duplicate and out-of-order section positions", () => {
    expect(guideAggregateDtoSchema.safeParse(aggregate([section(uuid(1), 0), section(uuid(2), 0)])).success).toBe(false);
    expect(guideAggregateDtoSchema.safeParse(aggregate([section(uuid(1), 1), section(uuid(2), 0)])).success).toBe(false);
  });

  it("refuses a section that belongs to another guide", () => {
    const foreign = { ...section(uuid(1), 0), collectionId: uuid(8) };
    expect(guideAggregateDtoSchema.safeParse(aggregate([foreign])).success).toBe(false);
  });

  it("paginates sections, because twenty maximal ones already exceed the page budget", () => {
    const page = Array.from({ length: GUIDE_SECTION_PAGE_LIMIT }, (_unused, index) => section(uuid(index + 1), index));
    expect(guideAggregateDtoSchema.safeParse(aggregate(page, { sectionCount: 31, nextCursor: "next" })).success).toBe(true);
    // One more than a page may ever carry.
    const over = [...page, section(uuid(99), GUIDE_SECTION_PAGE_LIMIT)];
    expect(guideAggregateDtoSchema.safeParse(aggregate(over, { sectionCount: 31, nextCursor: "next" })).success).toBe(false);
  });

  it("refuses a page claiming more sections than the guide holds", () => {
    expect(guideAggregateDtoSchema.safeParse(aggregate([section(uuid(1), 0), section(uuid(2), 1)], { sectionCount: 1 })).success).toBe(false);
  });

  it("refuses a cursor on a page that already carries every section", () => {
    expect(guideAggregateDtoSchema.safeParse(aggregate([section(uuid(1), 0)], { sectionCount: 1, nextCursor: "next" })).success).toBe(false);
    expect(guideAggregateDtoSchema.safeParse(aggregate([section(uuid(1), 0)], { sectionCount: 4, nextCursor: "next" })).success).toBe(true);
  });
});

describe("guide writes", () => {
  it("requires the revision a write was composed against", () => {
    const write = { revision: 7, title: "Day one", description: null, blocks: guideEmptySectionBlocks };
    expect(writeGuideSectionSchema.parse(write).revision).toBe(7);
    const { revision: _missing, ...withoutRevision } = write;
    expect(writeGuideSectionSchema.safeParse(withoutRevision).success).toBe(false);
    for (const revision of [0, -1, 1.5]) expect(writeGuideSectionSchema.safeParse({ ...write, revision }).success).toBe(false);
  });

  it("refuses a blank section title rather than storing whitespace", () => {
    const write = { revision: 1, description: null, blocks: guideEmptySectionBlocks };
    expect(writeGuideSectionSchema.safeParse({ ...write, title: "   " }).success).toBe(false);
    expect(writeGuideSectionSchema.parse({ ...write, title: "  Day one  " }).title).toBe("Day one");
  });

  it("names the complete new order on a reorder, and refuses a repeated section", () => {
    expect(reorderGuideSectionsSchema.parse({ revision: 7, sectionIds: [uuid(2), uuid(1)] }).sectionIds)
      .toEqual([uuid(2), uuid(1)]);
    expect(reorderGuideSectionsSchema.safeParse({ revision: 7, sectionIds: [uuid(1), uuid(1)] }).success).toBe(false);
    expect(reorderGuideSectionsSchema.safeParse({ revision: 7, sectionIds: [] }).success).toBe(false);
  });
});
