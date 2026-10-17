import {describe, expect, it} from 'vitest';
import {
 guideEmptySectionBlocks, guideSectionBlocksSchema, guideSectionDtoSchema,
 type GuideSectionBlocks,
} from '../../../../../../tunes/shared/explorersGuideContract';
import {
 mediaContentUrl, parseLegacyJsonField, toBudgetPlace, toCanonicalSectionBlocks, toDayPlace, toGuide,
 toGuideSection, toTransportSegment,
} from '../guidesViewModel';

/**
 * Ticket 5.3. The guide view model.
 *
 * The first test here is the one that matters most. Guides nests geometry and Places
 * flattens it; emitting the wrong one typechecks and renders an empty map, which is the
 * defect 5.1 shipped. Everything else is ordinary field mapping, except the legacy JSON
 * rules, which exist to stop a double-stringified field and to stop an unreadable block
 * being reported as an empty success.
 */
const uuid = (n: number) => `${'a'.repeat(8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const canonicalPlace = (over: Record<string, unknown> = {}) => ({
 localId: 'm1', placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4', name: 'Kashi Art Cafe',
 formattedAddress: 'Burgher St, Fort Kochi',
 geometry: {location: {lat: 9.9658, lng: 76.2421}},
 types: ['cafe', 'food'], tips: 'Go before ten', photos: [],
 priceLevel: 2, priceRange: null, customBudget: null,
 budgetAmount: '450.50', budgetCurrency: 'INR', source: 'google' as const, verified: true,
 ...over,
});

describe('day place mapping', () => {
 it('keeps geometry NESTED, which is what every Guides map reads', () => {
  const mapped = toDayPlace(canonicalPlace() as never);
  expect(mapped.geometry).toEqual({location: {lat: 9.9658, lng: 76.2421}});
  // Reading it the Places way must be undefined, not a silent zero.
  expect((mapped.geometry as unknown as {lat?: number}).lat).toBeUndefined();
 });

 it('omits geometry entirely when the place has none, rather than emitting (0,0)', () => {
  expect(toDayPlace(canonicalPlace({geometry: null}) as never).geometry).toBeUndefined();
 });

 it('treats zero as a real coordinate', () => {
  expect(toDayPlace(canonicalPlace({geometry: {location: {lat: 0, lng: 0}}}) as never).geometry)
   .toEqual({location: {lat: 0, lng: 0}});
 });

 it('maps the entry handle to id and the provider id to place_id', () => {
  const mapped = toDayPlace(canonicalPlace() as never);
  expect(mapped.id).toBe('m1');
  expect(mapped.place_id).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
 });

 it('converts the decimal budget string to the number the budget table adds up', () => {
  expect(toDayPlace(canonicalPlace() as never).budgetAmount).toBe(450.5);
  expect(toDayPlace(canonicalPlace({budgetAmount: null, budgetCurrency: null}) as never).budgetAmount).toBeUndefined();
 });

 it('derives a photo URL from the media id and stores none', () => {
  const photo = {mediaId: uuid(1), fileName: 'cafe.jpg', width: 1600, height: 900, aspectRatio: '16:9'};
  const mapped = toDayPlace(canonicalPlace({photos: [photo]}) as never);
  expect(mapped.photos).toEqual([{
   id: `activity-photo-${uuid(1)}`, documentId: uuid(1), url: mediaContentUrl(uuid(1)),
   fileName: 'cafe.jpg', width: 1600, height: 900, aspectRatio: '16:9',
  }]);
  // Derived, so replacing the asset cannot leave a stale address behind.
  expect(mapped.photos?.[0].url).toBe(`/api/explorers/v1/media/${uuid(1)}/content`);
 });

 it('carries provenance through, so an unverified AI suggestion stays visibly unverified', () => {
  const mapped = toDayPlace(canonicalPlace({source: 'ai-unverified', verified: false}) as never);
  expect(mapped.source).toBe('ai-unverified');
  expect(mapped.isVerified).toBe(false);
 });
});

describe('transport segment mapping', () => {
 it('matches segments to day-place entries, not to provider ids', () => {
  const mapped = toTransportSegment({fromLocalId: 'm1', toLocalId: 'a1', mode: 'auto', distanceKm: 3.4, estimatedMinutes: 12} as never);
  expect(mapped).toEqual({fromPlaceId: 'm1', toPlaceId: 'a1', mode: 'auto', distanceKm: 3.4, estimatedMinutes: 12});
 });

 it('keeps an unmeasured distance or duration null rather than defaulting it to zero', () => {
  const mapped = toTransportSegment({fromLocalId: 'm1', toLocalId: 'a1', mode: 'walk', distanceKm: null, estimatedMinutes: null} as never);
  // Zero is a real measurement - two stops at the same spot. Null is "not measured", and
  // collapsing the two is what printed "0 km" for a ferry hop nobody had measured.
  expect(mapped.distanceKm).toBeNull();
  expect(mapped.estimatedMinutes).toBeNull();
 });
});

describe('budget place mapping', () => {
 it('keeps the legacy free-text budget alongside the numeric one', () => {
  const mapped = toBudgetPlace({localId: 'm1', placeId: 'ChIJ1', name: 'Cafe', priceLevel: null, priceRange: null,
   customBudget: 'about 500', budgetAmount: null, budgetCurrency: null} as never);
  expect(mapped.customBudget).toBe('about 500');
  expect(mapped.budgetAmount).toBeUndefined();
 });
});

describe('section mapping', () => {
 const section = (blocks: GuideSectionBlocks = guideEmptySectionBlocks, order = 0) => guideSectionDtoSchema.parse({
  id: uuid(5), collectionId: uuid(9), title: 'Day one', description: 'first', displayOrder: order,
  blocks, archived: false, createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z',
 });

 it('resolves the 0-based storage order to the 1-based Sequence the UI shows', () => {
  expect(toGuideSection(section(guideEmptySectionBlocks, 0)).Sequence).toBe(1);
  expect(toGuideSection(section(guideEmptySectionBlocks, 4)).Sequence).toBe(5);
 });

 it('maps every block, with empty blocks as empty arrays rather than undefined', () => {
  const mapped = toGuideSection(section());
  expect(mapped.Timeline).toEqual({morning: [], afternoon: [], evening: []});
  expect(mapped.Transport).toEqual({segments: []});
  expect(mapped.Stay).toEqual({accommodations: []});
  expect(mapped.Recommendation_Activity).toEqual({activities: []});
  expect(mapped.Budget).toEqual({morning: [], afternoon: [], evening: []});
  expect(mapped.Packing_List).toEqual([]);
  expect(mapped.Section_tags).toEqual([]);
 });

 it('carries a full timeline through to the shape the itinerary view reads', () => {
  const blocks = guideSectionBlocksSchema.parse({
   ...guideEmptySectionBlocks,
   timeline: {morning: [canonicalPlace()], afternoon: [], evening: [canonicalPlace({localId: 'e1', name: 'ചായക്കട'})]},
   transport: {segments: [{fromLocalId: 'm1', toLocalId: 'e1', mode: 'taxi', distanceKm: 8, estimatedMinutes: 25}]},
  });
  const mapped = toGuideSection(section(blocks));
  expect(mapped.Timeline.morning[0].geometry).toEqual({location: {lat: 9.9658, lng: 76.2421}});
  expect(mapped.Timeline.evening[0].name).toBe('ചായക്കട');
  expect(mapped.Transport.segments[0]).toMatchObject({fromPlaceId: 'm1', toPlaceId: 'e1'});
 });
});

describe('guide mapping', () => {
 const collection = {
  id: uuid(9), accountId: uuid(2), category: 'guides' as const, title: 'Kerala in five days',
  description: 'Backwaters and forts', heading: null, slug: 'kerala-in-five-days',
  visibility: 'public' as const, publicationState: 'published' as const, archived: false,
  displayOrder: 3, revision: 7, createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z',
 };
 const aggregate = {
  collectionId: uuid(9), revision: 7, coverMediaId: uuid(4), sections: [], sectionCount: 0, nextCursor: null,
  details: {
   guideType: 'itinerary' as const, multiCity: true, numberOfDays: 5, estimatedBudget: '42000.50',
   budgetCurrency: 'INR', budgetType: 'per-person' as const, bestTimeToVisit: ['October'],
   categories: ['Backwaters'], tags: ['slow'], tipsNotes: {blocks: []},
   place: {name: 'Kochi', address: 'Kerala, India', placeId: 'ChIJ1', rating: 4.6, ratingsCount: 12044, lat: 9.9312, lng: 76.2673},
   locationEntityId: null,
  },
 };

 it('takes title, slug, visibility and order from the collection and the rest from the aggregate', () => {
  const guide = toGuide(collection as never, aggregate as never);
  expect(guide.Title).toBe('Kerala in five days');
  expect(guide.slug).toBe('kerala-in-five-days');
  expect(guide.Visibility).toBe(true);
  expect(guide.display_order).toBe(3);
  expect(guide.Guide_Type).toBe('itinerary');
  expect(guide.is_Multicity).toBe(true);
  expect(guide.Number_Of_Days).toBe(5);
 });

 it('maps the budget to a number and the place snapshot to the legacy field names', () => {
  const guide = toGuide(collection as never, aggregate as never);
  expect(guide.Estimated_Budget).toBe(42000.5);
  expect(guide.Place_Details).toEqual({
   Place_Name: 'Kochi', Place_Address: 'Kerala, India', Place_Id: 'ChIJ1',
   Rating: 4.6, Rating_Count: 12044, lat: 9.9312, lng: 76.2673,
  });
 });

 it('derives the cover URL from the media id', () => {
  expect(toGuide(collection as never, aggregate as never).Guide_Media)
   .toEqual([{url: mediaContentUrl(uuid(4)), name: 'Kerala in five days'}]);
  expect(toGuide(collection as never, {...aggregate, coverMediaId: null} as never).Guide_Media).toBeUndefined();
 });

 it('derives is_pinned from the pin order rather than carrying it twice', () => {
  expect(toGuide(collection as never, aggregate as never, null).is_pinned).toBe(false);
  const pinned = toGuide(collection as never, aggregate as never, 0);
  // Position zero is pinned-first, not unpinned.
  expect(pinned.is_pinned).toBe(true);
  expect(pinned.pin_order).toBe(0);
 });

 it('reports a private guide as not visible', () => {
  expect(toGuide({...collection, visibility: 'private'} as never, aggregate as never).Visibility).toBe(false);
 });
});

describe('legacy JSON fields', () => {
 it('parses a JSON string once and passes a parsed value through', () => {
  expect(parseLegacyJsonField<{a: number}>('{"a":1}')).toEqual({a: 1});
  expect(parseLegacyJsonField<{a: number}>({a: 1})).toEqual({a: 1});
  expect(parseLegacyJsonField<unknown[]>('[1,2]')).toEqual([1, 2]);
 });

 it('refuses a double-stringified field instead of handing back a string', () => {
  // JSON.stringify applied twice: parsing once yields a string, and every consumer then
  // reads character zero of a JSON document.
  expect(parseLegacyJsonField(JSON.stringify(JSON.stringify({a: 1})))).toBeUndefined();
 });

 it('returns undefined for an unreadable block rather than coercing it to empty success', () => {
  expect(parseLegacyJsonField('{not json')).toBeUndefined();
  // undefined and null mean different things: unreadable versus legitimately empty.
  expect(parseLegacyJsonField(null)).toBeNull();
  expect(parseLegacyJsonField(undefined)).toBeNull();
  expect(parseLegacyJsonField('')).toBeNull();
  expect(parseLegacyJsonField('   ')).toBeNull();
 });

 it('passes through the array and object shapes categories and Place_Details both arrive in', () => {
  expect(parseLegacyJsonField<string[]>('["Backwaters","Forts"]')).toEqual(['Backwaters', 'Forts']);
  expect(parseLegacyJsonField<string[]>(['Backwaters'])).toEqual(['Backwaters']);
  expect(parseLegacyJsonField<PlaceDetailsLike>('{"Place_Name":"Kochi"}')).toEqual({Place_Name: 'Kochi'});
 });
});

type PlaceDetailsLike = {Place_Name?: string};

describe('canonical round trip', () => {
 // The editors save a COMPLETE section, so anything the inverse mapping drops is something
 // the next save erases. This is the test that makes that impossible to do silently.
 const full = (): GuideSectionBlocks => guideSectionBlocksSchema.parse({
  ...guideEmptySectionBlocks,
  timeline: {
   morning: [canonicalPlace({photos: [{mediaId: uuid(1), fileName: 'a.jpg', width: 1600, height: 900, aspectRatio: '16:9'}]})],
   afternoon: [canonicalPlace({localId: 'a1', placeId: 'ChIJa1', name: 'ചായക്കട — tea stall', tips: null,
    geometry: null, priceLevel: null, budgetAmount: null, budgetCurrency: null, source: 'ai-unverified', verified: false})],
   evening: [canonicalPlace({localId: 'e1', placeId: 'ChIJe1', name: 'Sunset point', customBudget: 'about 500',
    budgetAmount: null, budgetCurrency: null})],
  },
  transport: {segments: [
   {fromLocalId: 'm1', toLocalId: 'a1', mode: 'auto', distanceKm: 3.4, estimatedMinutes: 12},
   {fromLocalId: 'a1', toLocalId: 'e1', mode: 'ferry', distanceKm: null, estimatedMinutes: null},
  ]},
  stay: {accommodations: [canonicalPlace({localId: 's1', placeId: 'ChIJs1', name: 'Brunton Boatyard'})]},
  activities: {activities: [canonicalPlace({localId: 'v1', placeId: 'ChIJv1', name: 'Kathakali — കഥകളി'})]},
  budget: {
   morning: [{localId: 'm1', placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4', name: 'Kashi Art Cafe', priceLevel: 2,
    priceRange: null, customBudget: null, budgetAmount: '450.50', budgetCurrency: 'INR'}],
   afternoon: [],
   evening: [{localId: 'e1', placeId: 'ChIJe1', name: 'Sunset point', priceLevel: null, priceRange: null,
    customBudget: 'about 500', budgetAmount: null, budgetCurrency: null}],
  },
  mapDetails: {center: {lat: 9.9658, lng: 76.2421}, zoom: 14},
  packingList: {items: [{localId: 'p1', label: 'Mosquito repellent', done: false}]},
  preTasks: {items: [{localId: 't1', label: 'Book the backwater ferry', done: true}]},
  tags: ['slow', 'ആയുർവേദം'],
 });

 const reverse = (blocks: GuideSectionBlocks) => {
  const mapped = toGuideSection(guideSectionDtoSchema.parse({
   id: uuid(5), collectionId: uuid(9), title: 'Day one', description: null, displayOrder: 0,
   blocks, archived: false, createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z',
  }));
  return toCanonicalSectionBlocks(mapped as never);
 };

 it('is the identity: canonical to feature to canonical loses nothing', () => {
  const original = full();
  expect(reverse(original)).toEqual(original);
 });

 it('still validates after the round trip, so a save of it cannot be refused', () => {
  expect(guideSectionBlocksSchema.safeParse(reverse(full())).success).toBe(true);
 });

 it('is stable: a second round trip changes nothing more', () => {
  const once = reverse(full());
  expect(reverse(once)).toEqual(once);
 });

 it('round-trips an empty section', () => {
  const empty = guideSectionBlocksSchema.parse(guideEmptySectionBlocks);
  expect(reverse(empty)).toEqual(empty);
 });

 it('keeps geometry nested through both directions', () => {
  const result = reverse(full());
  expect(result.timeline.morning[0].geometry).toEqual({location: {lat: 9.9658, lng: 76.2421}});
  expect(result.timeline.afternoon[0].geometry).toBeNull();
 });

 it('keeps a photo as a media id and never reintroduces a url', () => {
  const photo = reverse(full()).timeline.morning[0].photos[0];
  expect(photo).toEqual({mediaId: uuid(1), fileName: 'a.jpg', width: 1600, height: 900, aspectRatio: '16:9'});
  expect(photo).not.toHaveProperty('url');
 });

 it('normalises money formatting but never the amount', () => {
  // "450.50" and 450.5 are the same amount; the decimal string is what storage keeps.
  expect(reverse(full()).budget.morning[0].budgetAmount).toBe('450.50');
  const odd = guideSectionBlocksSchema.parse({...guideEmptySectionBlocks,
   timeline: {morning: [canonicalPlace({budgetAmount: '7.5', budgetCurrency: 'EUR'})], afternoon: [], evening: []}});
  expect(reverse(odd).timeline.morning[0].budgetAmount).toBe('7.50');
 });

 it('will not let an unverified AI place come back claiming verification', () => {
  expect(reverse(full()).timeline.afternoon[0]).toMatchObject({source: 'ai-unverified', verified: false});
 });

 it('keeps transport segments pointing at entries the section contains', () => {
  const result = reverse(full());
  const present = new Set([...result.timeline.morning, ...result.timeline.afternoon, ...result.timeline.evening,
   ...result.activities.activities, ...result.stay.accommodations].map((place) => place.localId));
  for (const segment of result.transport.segments) {
   expect(present.has(segment.fromLocalId)).toBe(true);
   expect(present.has(segment.toLocalId)).toBe(true);
  }
 });

 it('keeps every budget row tied to an entry the section contains', () => {
  const result = reverse(full());
  const present = new Set([...result.timeline.morning, ...result.timeline.afternoon, ...result.timeline.evening,
   ...result.activities.activities, ...result.stay.accommodations].map((place) => place.localId));
  for (const row of [...result.budget.morning, ...result.budget.afternoon, ...result.budget.evening])
   expect(present.has(row.localId)).toBe(true);
 });
});
