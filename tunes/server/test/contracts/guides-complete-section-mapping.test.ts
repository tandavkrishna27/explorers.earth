import {expect, it} from 'vitest';
import {buildGuidesSeedPlan, GUIDES_CASES} from '../../../scripts/guides-browser-support';
import {guideAggregateDtoSchema, guideEmptySectionBlocks} from '../../../shared/explorersGuideContract';
import {ownerCollectionDtoSchema} from '../../../shared/explorersOwnerContentContract';
import {toGuide, toGuideSection} from '../../../../explorers-earth/src/features/Guides/api/guidesViewModel';

const uuid = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-10-11T00:00:00.000Z';
const seed = buildGuidesSeedPlan(GUIDES_CASES[1]);
const collection = ownerCollectionDtoSchema.parse({
 id: uuid(1), accountId: uuid(2), category: 'guides', title: 'यात्रा café', slug: 'journey',
 visibility: 'public', publicationState: 'published', revision: 3, description: 'भारत',
 heading: null, coverMediaId: uuid(3), isSample: false, archived: false, displayOrder: 0,
});
function aggregate(orders: number[], empty = false, total = orders.length) {
 return guideAggregateDtoSchema.parse({
  collectionId: collection.id, revision: 7, details: seed.guides[0].details, coverMediaId: uuid(3),
  sections: orders.map(displayOrder => ({
   id: uuid(displayOrder + 10), collectionId: collection.id, title: `दिन ${displayOrder + 1} café`,
   description: empty ? null : 'सैर और भोजन', displayOrder, archived: false,
   blocks: empty ? guideEmptySectionBlocks : seed.sections[0].blocks,
   createdAt: time, updatedAt: time,
  })), sectionCount: total, nextCursor: total > orders.length ? 'next-page' : null,
 });
}

it('hydrates every section field needed by retained detail and full section editing', () => {
 const input = aggregate([0]);
 input.sections[0].blocks.transport.segments[0].distanceKm = 0;
 input.sections[0].blocks.transport.segments[0].estimatedMinutes = null;
 const mapped = toGuide(collection, input).guide_sections![0];
 expect(mapped).toEqual(toGuideSection(input.sections[0]));
 expect(mapped).toMatchObject({
  documentId: uuid(10), Title: 'दिन 1 café', Description: 'सैर और भोजन', Sequence: 1,
  Transport: {segments: [{fromPlaceId: 'morning', toPlaceId: 'afternoon', mode: 'walk', distanceKm: 0, estimatedMinutes: null}]},
  Map_Details: {center: {lat: 0, lng: 0}, zoom: 12},
  Packing_List: [{localId: 'water', label: 'Water bottle', done: false}],
  Pre_Tasks: [{localId: 'reserve', label: 'Reserve room', done: true}],
  Section_tags: ['दिन', 'café'], createdAt: time, updatedAt: time,
 });
});

it('retains the canonical empty and null section mapping', () => {
 const input = aggregate([0], true);
 expect(toGuide(collection, input).guide_sections![0]).toEqual(toGuideSection(input.sections[0]));
 expect(toGuide(collection, input).guide_sections![0]).toMatchObject({
  Sequence: 1, Transport: {segments: []}, Map_Details: null,
  Packing_List: [], Pre_Tasks: [], Section_tags: [],
 });
});

it('hydrates each supplied page of a 53 section guide without fabricating missing rows', () => {
 for (const [start, count] of [[0, 20], [20, 20], [40, 13]]) {
  const input = aggregate(Array.from({length: count}, (_, i) => start + i), false, 53);
  const mapped = toGuide(collection, input, 0);
  expect(mapped.guide_sections).toEqual(input.sections.map(toGuideSection));
  expect(mapped.guide_sections).toHaveLength(count);
  expect(mapped.Guide_Section_Details).toEqual(input.sections.map(s => ({documentId: s.id, Title: s.title, Sequence: s.displayOrder + 1})));
  expect(mapped).toMatchObject({
   documentId: uuid(1), Title: 'यात्रा café', Description: 'भारत', slug: 'journey',
   account: {documentId: uuid(2)}, Guide_Media: [{url: `/api/explorers/v1/media/${uuid(3)}/content`, name: 'यात्रा café'}],
   Guide_Type: 'Itinerary', Visibility: true, Estimated_Budget: 1234.5, Budget_Type: null,
   Number_Of_Days: 3, Category: ['culture', 'food'], Best_Time_To_Visit: ['अक्टूबर'],
   Guide_Tags: ['यात्रा', 'café'], is_pinned: true, pin_order: 0, display_order: 0,
  });
 }
});
