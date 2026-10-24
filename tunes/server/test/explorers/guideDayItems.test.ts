import {describe, expect, it} from "vitest";
import {
  GUIDE_SECTION_BLOCK_VERSION, guideDayItemSchema, guideEmptySectionBlocks, guideSectionBlocksSchema,
  guideTimeLabelSchema, legacySlotOf, legacyTimelineFromItems, mergeLegacyTimeline, normalizeTimeLabel,
  guideCollectionDetailsSchema, type GuideDayItem,
} from "../../../shared/explorersGuideContract";

const place = (localId: string, name = localId) => ({
  localId, placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4", name, formattedAddress: null,
  geometry: {location: {lat: 15.5, lng: 73.8}}, types: [], tips: null, photos: [], priceLevel: null,
  priceRange: null, customBudget: null, budgetAmount: null, budgetCurrency: null, source: "google" as const, verified: true,
});
const placeItem = (localId: string, timeLabel: GuideDayItem["timeLabel"] = null): GuideDayItem =>
  ({kind: "place", localId, timeLabel, place: place(localId)});

describe("guide day items (GD-23)", () => {
  it("is version v2 with one ordered items list and flat budget entries", () => {
    expect(GUIDE_SECTION_BLOCK_VERSION).toBe("guide-section-blocks/v2");
    expect(guideEmptySectionBlocks.items).toEqual([]);
    expect(guideEmptySectionBlocks.budget).toEqual({entries: []});
    expect(guideSectionBlocksSchema.safeParse(guideEmptySectionBlocks).success).toBe(true);
  });

  it("accepts the four labels and exact 24h times, nothing else", () => {
    for (const ok of ["morning", "afternoon", "evening", "night", "09:30", "23:59", "00:00"])
      expect(guideTimeLabelSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["Morning", "9:30", "24:00", "12:60", "noon", ""])
      expect(guideTimeLabelSchema.safeParse(bad).success).toBe(false);
  });

  it("normalises what people type", () => {
    expect(normalizeTimeLabel("9:30")).toBe("09:30");
    expect(normalizeTimeLabel(" Morning ")).toBe("morning");
    expect(normalizeTimeLabel("9.30pm")).toBe("21:30");
    expect(normalizeTimeLabel("lunch")).toBeNull();
  });

  it("parses each item kind and refuses a place whose localId disagrees", () => {
    expect(guideDayItemSchema.safeParse(placeItem("a", "morning")).success).toBe(true);
    expect(guideDayItemSchema.safeParse({kind: "note", localId: "n", timeLabel: null, text: "Buy ferry tickets"}).success).toBe(true);
    expect(guideDayItemSchema.safeParse({kind: "listItem", localId: "l", timeLabel: "19:00",
      ref: {recommendationId: "11111111-1111-4111-8111-111111111111", collectionId: null, category: "places"},
      snapshot: {title: "Thalassa", collectionTitle: "Goa", geometry: null}}).success).toBe(true);
    expect(guideDayItemSchema.safeParse({...placeItem("a"), place: place("b")}).success).toBe(false);
  });

  it("refuses duplicate item localIds and transport to a missing item", () => {
    const dup = {...guideEmptySectionBlocks, items: [placeItem("a"), placeItem("a")]};
    expect(guideSectionBlocksSchema.safeParse(dup).success).toBe(false);
    const dangling = {...guideEmptySectionBlocks, items: [placeItem("a")],
      transport: {segments: [{fromLocalId: "a", toLocalId: "z", mode: "walk", distanceKm: null, estimatedMinutes: null}]}};
    expect(guideSectionBlocksSchema.safeParse(dangling).success).toBe(false);
  });

  it("maps labels to legacy slots for the public views", () => {
    expect(legacySlotOf(null)).toBe("morning");
    expect(legacySlotOf("night")).toBe("evening");
    expect(legacySlotOf("11:59")).toBe("morning");
    expect(legacySlotOf("12:00")).toBe("afternoon");
    expect(legacySlotOf("17:00")).toBe("evening");
    const t = legacyTimelineFromItems([placeItem("a", "evening"), {kind: "note", localId: "n", timeLabel: null, text: "x"}, placeItem("b", "morning")]);
    expect(t.morning.map(p => p.localId)).toEqual(["b"]);
    expect(t.evening.map(p => p.localId)).toEqual(["a"]);
  });

  it("merges an old-modal timeline save without dropping notes or exact times", () => {
    const previous: GuideDayItem[] = [placeItem("a", "09:30"), {kind: "note", localId: "n", timeLabel: null, text: "x"}, placeItem("b", "evening")];
    const merged = mergeLegacyTimeline(previous, {morning: [place("a")], afternoon: [], evening: [place("c")]});
    expect(merged.map(i => [i.localId, i.timeLabel])).toEqual([["a", "09:30"], ["n", null], ["c", "evening"]]);
  });

  it("keeps startDate optional on details", () => {
    const parsed = guideCollectionDetailsSchema.parse({guideType: null, multiCity: false, numberOfDays: 2, estimatedBudget: null,
      budgetCurrency: null, budgetType: null, bestTimeToVisit: [], categories: [], tags: [], tipsNotes: null, place: {}, locationEntityId: null});
    expect(parsed.startDate).toBeNull();
  });
});
