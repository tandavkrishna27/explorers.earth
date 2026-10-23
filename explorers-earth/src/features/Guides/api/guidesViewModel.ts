import {
 GUIDE_BUDGET_TIER_LABELS, GUIDE_SECTION_BLOCK_VERSION, GUIDE_TYPE_LABELS,
 budgetEntriesFromLegacy, legacyBudgetFromEntries, legacyTimelineFromItems, mergeLegacyTimeline,
} from '../../../../../tunes/shared/explorersGuideContract';
import type {
 GuideAggregateDto, GuideBudgetPlace, GuideDayItem, GuideDayPlace, GuideSectionBlocks, GuideSectionDto, GuideTransportSegment,
} from '../../../../../tunes/shared/explorersGuideContract';
import type {OwnerCollectionDto} from '../../../../../tunes/shared/explorersOwnerContentContract';
import type {
 ActivityData, ActivityPhoto, BudgetData, BudgetPlace, DayPlace, StayData, TimelineData, TransportData,
 TransportSegment, TravelMode,
} from '../types/guideSectionTypes';
import type {Guide, GuideSection, PlaceDetails} from '../types';
import {minorUnitsOf} from '../../../../../tunes/shared/currency';

// Ticket 5.3. Pure mapping from the canonical guide aggregate to the shapes the existing
// Guides components read. No fetching and no state, so every rule here is testable on its
// own - which matters, because two of them are invisible to the type checker.
//
// GEOMETRY STAYS NESTED. Both sides carry {location:{lat,lng}}: the canonical contract
// because that is the Google Places response shape, and DayPlace because that is what
// every map and itinerary view in this feature reads. This is the opposite of the Places
// category, where the canonical shape is flat {lat,lng}. Flattening here typechecks and
// renders nothing, which is exactly the defect 5.1 shipped and then had to fix.
//
// A photo is addressed by media id. Strapi gave each upload a numeric id, a documentId and
// a CDN url; the canonical form stores only the media id and the bytes are served through
// the media content route. So the url is DERIVED here rather than stored, which is what
// keeps a replaced asset from being served from a stale address.

/** Where the owned bytes for a media id are served. Derived, never stored. */
export const mediaContentUrl = (mediaId: string): string => `/api/explorers/v1/media/${mediaId}/content`;

/**
 * A legacy Strapi field that may arrive as a JSON string or as the parsed value.
 *
 * Two failure modes this exists to prevent, both named in the ticket. Stringifying twice
 * produces a string whose parse yields a string, and every consumer then reads character
 * zero of a JSON document. And coercing an unparseable block to an empty object reports
 * success for content that was never understood, so the next save writes the emptiness
 * back over the original.
 *
 * So: a string is parsed once, a value is returned as it is, and anything unparseable
 * returns `undefined` - distinct from `null`, which is a legitimately empty field.
 */
export function parseLegacyJsonField<T>(value: unknown): T | null | undefined {
 if (value === null || value === undefined) return null;
 if (typeof value !== 'string') return value as T;
 const text = value.trim();
 if (text === '') return null;
 try {
  const parsed = JSON.parse(text) as unknown;
  // A string that parses to another string was stringified twice. Refuse it rather than
  // handing a consumer a document it will index into character by character.
  if (typeof parsed === 'string') return undefined;
  return parsed as T;
 } catch {
  return undefined;
 }
}

/** A decimal string to the number the existing budget components add up. */
const toNumber = (value: string | null): number | undefined => (value === null ? undefined : Number(value));

function toPhoto(mediaId: string, fileName: string | null, width: number | null, height: number | null, aspectRatio: string | null): ActivityPhoto {
 return {
  // The legacy id was `activity-photo-${uploadId}`; keeping that shape means the React
  // keys and any stored references in existing guides still line up.
  id: `activity-photo-${mediaId}`,
  documentId: mediaId,
  url: mediaContentUrl(mediaId),
  fileName: fileName ?? '',
  width: width ?? 0,
  height: height ?? 0,
  aspectRatio: aspectRatio ?? '',
 };
}

export function toDayPlace(place: GuideDayPlace): DayPlace {
 return {
  id: place.localId,
  name: place.name,
  formatted_address: place.formattedAddress ?? '',
  place_id: place.placeId,
  // Nested, on both sides. See the banner above.
  ...(place.geometry === null ? {} : {geometry: {location: {lat: place.geometry.location.lat, lng: place.geometry.location.lng}}}),
  types: place.types,
  ...(place.tips === null ? {} : {tips: place.tips}),
  photos: place.photos.map((photo) => toPhoto(photo.mediaId, photo.fileName, photo.width, photo.height, photo.aspectRatio)),
  ...(place.priceLevel === null ? {} : {priceLevel: place.priceLevel}),
  ...(place.priceRange === null ? {} : {priceRange: place.priceRange}),
  ...(place.customBudget === null ? {} : {customBudget: place.customBudget}),
  ...(place.budgetAmount === null ? {} : {budgetAmount: toNumber(place.budgetAmount)}),
  ...(place.budgetCurrency === null ? {} : {budgetCurrency: place.budgetCurrency}),
  isVerified: place.verified,
  source: place.source,
 };
}

export function toBudgetPlace(place: GuideBudgetPlace): BudgetPlace {
 return {
  localId: place.localId,
  place_id: place.placeId,
  name: place.name,
  ...(place.priceLevel === null ? {} : {priceLevel: place.priceLevel}),
  ...(place.priceRange === null ? {} : {priceRange: place.priceRange}),
  ...(place.customBudget === null ? {} : {customBudget: place.customBudget}),
  ...(place.budgetAmount === null ? {} : {budgetAmount: toNumber(place.budgetAmount)}),
  ...(place.budgetCurrency === null ? {} : {budgetCurrency: place.budgetCurrency}),
 };
}

/**
 * A transport segment.
 *
 * `fromPlaceId`/`toPlaceId` name the day-place *entry* rather than the provider place id -
 * `DayPlace.id` is what they match, which is why the canonical side calls them localIds.
 * Reading them as provider ids would break a day that visits one place twice.
 */
export function toTransportSegment(segment: GuideTransportSegment): TransportSegment {
 return {
  fromPlaceId: segment.fromLocalId,
  toPlaceId: segment.toLocalId,
  mode: segment.mode as TravelMode,
  // Unknown stays unknown. Defaulting to 0 here is what made "distance not measured"
  // indistinguishable from "zero kilometres".
  distanceKm: segment.distanceKm,
  estimatedMinutes: segment.estimatedMinutes,
 };
}

export const toTimeline = (blocks: GuideSectionBlocks): TimelineData => {
 const slots = legacyTimelineFromItems(blocks.items);
 return {morning: slots.morning.map(toDayPlace), afternoon: slots.afternoon.map(toDayPlace), evening: slots.evening.map(toDayPlace)};
};
export const toTransport = (blocks: GuideSectionBlocks): TransportData => ({segments: blocks.transport.segments.map(toTransportSegment)});
export const toStay = (blocks: GuideSectionBlocks): StayData => ({accommodations: blocks.stay.accommodations.map(toDayPlace)});
export const toActivities = (blocks: GuideSectionBlocks): ActivityData => ({activities: blocks.activities.activities.map(toDayPlace)});
export const toBudget = (blocks: GuideSectionBlocks): BudgetData => {
 const slots = legacyBudgetFromEntries(blocks.budget.entries, blocks.items);
 return {morning: slots.morning.map(toBudgetPlace), afternoon: slots.afternoon.map(toBudgetPlace), evening: slots.evening.map(toBudgetPlace)};
};

/** The section shape the details page, the section form and the six editors read. */
export function toGuideSection(section: GuideSectionDto): GuideSection & {
 Timeline: TimelineData; Transport: TransportData; Stay: StayData; Budget: BudgetData; Items: GuideDayItem[];
} {
 return {
  documentId: section.id,
  Title: section.title,
  // Strapi's Sequence was 1-based in the UI while display_order is 0-based in storage.
  // The mapping is the single place that difference is resolved.
  Sequence: section.displayOrder + 1,
  ...(section.description === null ? {} : {Description: section.description}),
  Timeline: toTimeline(section.blocks),
  Items: section.blocks.items,
  Transport: toTransport(section.blocks),
  Stay: toStay(section.blocks),
  Recommendation_Activity: toActivities(section.blocks),
  Budget: toBudget(section.blocks),
  Map_Details: section.blocks.mapDetails,
  Packing_List: section.blocks.packingList.items,
  Pre_Tasks: section.blocks.preTasks.items,
  Section_tags: section.blocks.tags,
  createdAt: section.createdAt,
  updatedAt: section.updatedAt,
 };
}

/**
 * The guide's place, which is either a single place or a multi-city journey.
 *
 * The journey form passes straight through: its keys are already the names the journey
 * display reads (`starting`/`ending`/`intermediateCities`, with FLAT `Geometry`), so
 * renaming them here would only create a second vocabulary for one thing.
 */
export function toPlaceDetails(place: GuideAggregateDto['details']['place']): PlaceDetails | Record<string, unknown> {
 if ('isMultiCity' in place) return place as unknown as Record<string, unknown>;
 if (!('name' in place)) return {};
 return {
  ...(place.name === null ? {} : {Place_Name: place.name}),
  ...(place.address === null ? {} : {Place_Address: place.address}),
  ...(place.placeId === null ? {} : {Place_Id: place.placeId}),
  ...(place.rating === null ? {} : {Rating: place.rating}),
  ...(place.ratingsCount === null ? {} : {Rating_Count: place.ratingsCount}),
  ...(place.lat === null ? {} : {lat: place.lat}),
  ...(place.lng === null ? {} : {lng: place.lng}),
 };
}

/**
 * The whole guide, from its collection row and its guide aggregate.
 *
 * Both are needed: title, description, slug, visibility and the orders live on the
 * collection, exactly as they do for every other category, while the guide-specific fields
 * and the sections live on the aggregate. Keeping them separate in storage is what lets a
 * guide be pinned, ordered, published and archived by the same machinery as every list.
 */
export function toGuide(collection: OwnerCollectionDto, aggregate: GuideAggregateDto, pinOrder: number | null = null): Guide {
 const {details} = aggregate;
 return {
  documentId: collection.id,
  Title: collection.title,
  ...(collection.description === null ? {} : {Description: collection.description}),
  ...(details.guideType === null ? {} : {Guide_Type: GUIDE_TYPE_LABELS[details.guideType]}),
  Visibility: collection.visibility === 'public',
  ...(details.estimatedBudget === null ? {} : {Estimated_Budget: toNumber(details.estimatedBudget)}),
  ...(details.estimatedBudget === null || details.budgetCurrency === null ? {} : {Estimated_Budget_Currency: details.budgetCurrency}),
  // The guide surfaces show and filter on the tier under its legacy name.
  Budget_Type: details.budgetTier === null ? null : GUIDE_BUDGET_TIER_LABELS[details.budgetTier],
  is_Multicity: details.multiCity,
  slug: collection.slug,
  ...(aggregate.coverMediaId === null ? {} : {Guide_Media: [{url: mediaContentUrl(aggregate.coverMediaId), name: collection.title}]}),
  Place_Details: toPlaceDetails(details.place),
  Number_Of_Days: details.numberOfDays,
  Category: details.categories,
  Best_Time_To_Visit: details.bestTimeToVisit,
  Guide_Tags: details.tags,
  Tips_Notes: details.tipsNotes,
  // The parent-level summary Strapi kept as Guide_Section_Details is derived from the
  // sections rather than stored a second time: two records of one fact drift.
  Guide_Section_Details: aggregate.sections.map((section) => ({
   documentId: section.id, Title: section.title, Sequence: section.displayOrder + 1,
  })),
  guide_sections: aggregate.sections.map(toGuideSection),
  account: {documentId: collection.accountId},
  // is_pinned is derived, never stored twice: a pin IS a pin order.
  is_pinned: pinOrder !== null,
  ...(pinOrder === null ? {} : {pin_order: pinOrder}),
  display_order: collection.displayOrder,
 };
}

// --- the inverse ------------------------------------------------------------------------
//
// Feature shapes back to canonical blocks. This exists because the editors save a complete
// section, so a field this mapping drops is a field the next save erases. The round-trip
// test asserts canonical -> feature -> canonical is the identity, which is the only way to
// know nothing is being quietly lost here.
//
// Money goes back to an exact decimal string. A number that arrived as "450.50" and leaves
// as "450.5" is the same amount, so the round trip normalises rather than preserving the
// trailing zero - that is a deliberate, stated loss of formatting, not of value.

// An exact decimal at the currency's own precision: 100 JPY is "100", 1.25 KWD is "1.250".
// A fixed two places would make every yen amount fail the contract's precision check and
// round every dinar one. A currency this table does not know keeps the legacy two places.
const money = (value: number | undefined, currency?: string | null): string | null =>
 value === undefined || value === null || !Number.isFinite(value) ? null : value.toFixed((currency ? minorUnitsOf(currency) : undefined) ?? 2);
const text = (value: string | undefined | null): string | null =>
 value === undefined || value === null || value === '' ? null : value;

export function toCanonicalDayPlace(place: DayPlace): GuideDayPlace {
 return {
  localId: place.id,
  placeId: place.place_id,
  name: place.name,
  formattedAddress: text(place.formatted_address),
  // Nested on both sides. Flattening either direction renders an empty map.
  geometry: place.geometry ? {location: {lat: place.geometry.location.lat, lng: place.geometry.location.lng}} : null,
  types: place.types ?? [],
  tips: text(place.tips),
  // The url is derived from the media id on the way out, so it is dropped on the way back
  // rather than stored - there is only ever one source of truth for where bytes live.
  photos: (place.photos ?? []).map((photo) => ({
   mediaId: photo.documentId,
   fileName: text(photo.fileName),
   width: photo.width || null,
   height: photo.height || null,
   aspectRatio: text(photo.aspectRatio),
  })),
  priceLevel: place.priceLevel ?? null,
  priceRange: text(place.priceRange),
  customBudget: text(place.customBudget),
  budgetAmount: money(place.budgetAmount, place.budgetCurrency),
  budgetCurrency: place.budgetAmount === undefined ? null : text(place.budgetCurrency),
  source: place.source ?? 'manual',
  // An AI suggestion that was never confirmed cannot claim verification, which the
  // contract also refuses - so this keeps them consistent rather than relying on it.
  verified: place.source === 'ai-unverified' ? false : place.isVerified ?? false,
 };
}

export const toCanonicalBudgetPlace = (place: BudgetPlace): GuideBudgetPlace => ({
 localId: place.localId,
 placeId: place.place_id,
 name: place.name,
 priceLevel: place.priceLevel ?? null,
 priceRange: text(place.priceRange),
 customBudget: text(place.customBudget),
 budgetAmount: money(place.budgetAmount, place.budgetCurrency),
 budgetCurrency: place.budgetAmount === undefined ? null : text(place.budgetCurrency),
});

export const toCanonicalTransportSegment = (segment: TransportSegment): GuideTransportSegment => ({
 fromLocalId: segment.fromPlaceId,
 toLocalId: segment.toPlaceId,
 mode: segment.mode,
 distanceKm: segment.distanceKm,
 estimatedMinutes: segment.estimatedMinutes,
});

/** Every block of a section, at the current version. */
export function toCanonicalSectionBlocks(input: {
 Timeline?: TimelineData | null; Transport?: TransportData | null; Stay?: StayData | null;
 Recommendation_Activity?: ActivityData | null; Budget?: BudgetData | null;
 Map_Details?: {center: {lat: number; lng: number} | null; zoom: number | null} | null;
 Packing_List?: {localId: string; label: string; done: boolean}[] | null;
 Pre_Tasks?: {localId: string; label: string; done: boolean}[] | null;
 Section_tags?: string[] | null;
 Items?: GuideDayItem[] | null;
}): GuideSectionBlocks {
 const places = (value: DayPlace[] | undefined | null) => (value ?? []).map(toCanonicalDayPlace);
 const budget = (value: BudgetPlace[] | undefined | null) => (value ?? []).map(toCanonicalBudgetPlace);
 return {
  version: GUIDE_SECTION_BLOCK_VERSION,
  items: mergeLegacyTimeline(input.Items ?? [], {
   morning: places(input.Timeline?.morning), afternoon: places(input.Timeline?.afternoon), evening: places(input.Timeline?.evening),
  }),
  transport: {segments: (input.Transport?.segments ?? []).map(toCanonicalTransportSegment)},
  stay: {accommodations: places(input.Stay?.accommodations)},
  activities: {activities: places(input.Recommendation_Activity?.activities)},
  budget: {entries: budgetEntriesFromLegacy({
   morning: budget(input.Budget?.morning), afternoon: budget(input.Budget?.afternoon), evening: budget(input.Budget?.evening),
  })},
  mapDetails: input.Map_Details ?? null,
  packingList: {items: input.Packing_List ?? []},
  preTasks: {items: input.Pre_Tasks ?? []},
  tags: input.Section_tags ?? [],
 };
}
