import { describe, expect, it } from 'vitest';
import { convertPlace, convertPublicGuideSection, selectGuidePlaceThumbnail, selectGuidePlaceGallery } from '../publicGuidePhotoViewModel';

const mediaId = '11111111-1111-4111-8111-111111111111';
const photo = { mediaId, fileName: 'photo.jpg', width: 1200, height: 800, aspectRatio: '3:2' };
const canonical = () => ({ localId: 'entry-one', placeId: 'provider-one', name: 'Place', formattedAddress: 'Street', geometry: { location: { lat: 15, lng: 74 } }, types: ['park'], tips: null, photos: [photo], priceLevel: null, priceRange: null, customBudget: null, budgetAmount: null, budgetCurrency: null, source: 'google', verified: true });
const uiPhoto = (documentId: string, url = `/fixture/${documentId}`, fileName = documentId) => ({ id: `photo-${documentId}`, documentId, url, fileName, width: 1200, height: 800, aspectRatio: '3:2' });
const legacy = (id = 'entry-one', photos = [uiPhoto('owner-upload')]) => ({ id, place_id: 'provider-one', name: 'Place', formatted_address: 'Street', geometry: { location: { lat: 15, lng: 74 } }, photos });
const section = (Timeline: unknown = { morning: [], afternoon: [], evening: [] }) => ({ documentId: 'section-one', Sequence: 1, Description: 'keep me', Timeline, Stay: { accommodations: [] }, Recommendation_Activity: { activities: [] } });
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function converted(value: unknown) { const result = convertPublicGuideSection(value); expect(result.ok).toBe(true); if (!result.ok) throw new Error('Expected converted section'); return result.section; }
// A malformed PLACE is now rejected at the place, not by deleting its section. Every assertion
// below that used to read `convertPublicGuideSection(section({morning:[entry]})) === {ok:false}`
// asserts both halves of that instead: the entry is still refused, AND a good place beside it
// still survives. Asserting only absence would no longer distinguish "refused" from "silently
// dropped by a future bug", so both are checked on every entry. Identity counts are preserved:
// one call here replaces one call before.
function rejectsPlace(entry: unknown): void {
  expect(convertPlace(entry)).toBeUndefined();
  const morning = converted(section({ morning: [entry, legacy('good-entry')] })).Timeline.morning;
  expect(morning).toHaveLength(1);
  expect(morning[0].id).toBe('good-entry');
}

describe('public guide photo conversion and selection', () => {
  it.each(['morning', 'afternoon', 'evening', 'accommodations', 'activities'] as const)('hydrates canonical photos in each supported place array', key => {
    const input = section();
    const block = key === 'accommodations' ? 'Stay' : key === 'activities' ? 'Recommendation_Activity' : 'Timeline';
    (input[block] as Record<string, unknown>)[key] = [canonical()];
    const snapshot = JSON.stringify(input);
    const actual = converted(freeze(input))[block][key][0];
    expect(actual).toMatchObject({ id: 'entry-one', place_id: 'provider-one', name: 'Place', formatted_address: 'Street', geometry: { location: { lat: 15, lng: 74 } }, photos: [{ id: `activity-photo-${mediaId}`, documentId: mediaId, url: `/api/explorers/v1/media/${mediaId}/content`, fileName: 'photo.jpg', width: 1200, height: 800, aspectRatio: '3:2' }] });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
  it('preserves null photo metadata using the existing owner mapper defaults', () => {
    const place = canonical(); place.photos = [{ mediaId, fileName: null, width: null, height: null, aspectRatio: null } as any];
    expect(converted(section({ morning: [place] })).Timeline.morning[0].photos[0]).toEqual({ id: `activity-photo-${mediaId}`, documentId: mediaId, url: `/api/explorers/v1/media/${mediaId}/content`, fileName: '', width: 0, height: 0, aspectRatio: '' });
  });
  it.each([false, true])('accepts object and once encoded legacy blocks without mutating inputs', encoded => {
    const block = { morning: [legacy()], afternoon: [], evening: [], note: 'keep block field' };
    const input = freeze(section(encoded ? JSON.stringify(block) : block)); const snapshot = JSON.stringify(input);
    const result = converted(input);
    expect(result.Timeline).toEqual(block); expect(result.Description).toBe('keep me');
    expect(result).not.toBe(input); expect(converted(result)).toEqual(result); expect(JSON.stringify(input)).toBe(snapshot);
  });
  it.each(['{', JSON.stringify(JSON.stringify({ morning: [] })), 42, [], { morning: {} }])('rejects malformed blocks without legacy fallback', block => {
    expect(convertPublicGuideSection(section(block))).toEqual({ ok: false });
    if (block === '{') {
      // Additional finite assertions inside the existing row, not additional test cases.
      rejectsPlace({ ...legacy(), source: ['google'] });
      // Relocated from this it.each's rows: a bad photo makes the PLACE invalid, not the block.
      rejectsPlace({ ...legacy(), photos: [{ ...uiPhoto('bad'), width: 'wrong' }] });
      for (const invalid of [null, undefined, 42, 'section', []]) expect(convertPublicGuideSection(invalid)).toEqual({ ok: false });
      for (const entry of [
        { ...legacy(), id: undefined }, { ...legacy(), id: ' ' },
        { ...legacy(), name: undefined }, { ...legacy(), name: ' ' },
        { ...legacy(), place_id: undefined }, { ...legacy(), place_id: ' ' },
        { ...legacy(), formatted_address: undefined }, { ...legacy(), formatted_address: 42 },
        { ...legacy(), geometry: { lat: 15, lng: 74 } },
        { ...legacy(), geometry: { location: { lat: Number.NaN, lng: 74 } } },
        { ...legacy(), geometry: { location: { lat: 15, lng: Number.POSITIVE_INFINITY } } },
        { ...legacy(), geometry: { location: { lat: '15', lng: 74 } } },
        { ...legacy(), types: 'park' }, { ...legacy(), types: [42] },
      ]) rejectsPlace(entry);
    }
  });
  it.each([
    { ...canonical(), photos: [{ ...photo, mediaId: 'bad', url: '/legacy-rescue' }] },
    { ...canonical(), photos: [{ ...photo, url: '/extra-key' }] },
    { ...canonical(), name: undefined, id: 'legacy-id', place_id: 'provider-one', formatted_address: 'Street' },
    { ...canonical(), geometry: { lat: 15, lng: 74 } },
  ])('rejects canonical and hybrid entries without URL rescue', place => {
    rejectsPlace(place);
    // Each base is otherwise valid legacy input: retrying a legacy guard would rescue it.
    for (const marker of ['localId', 'placeId', 'formattedAddress', 'verified']) {
      for (const value of [undefined, marker === 'verified' ? false : 'canonical-marker']) {
        const hybrid = { ...legacy(), [marker]: value };
        expect(Object.hasOwn(hybrid, marker)).toBe(true);
        rejectsPlace(hybrid);
      }
    }
    for (const mediaId of ['bad-canonical-media', undefined]) {
      const hybrid = { ...legacy(), photos: [{ ...uiPhoto('valid-legacy-upload', '/legacy-rescue'), mediaId }] };
      expect(Object.hasOwn(hybrid.photos[0], 'mediaId')).toBe(true);
      rejectsPlace(hybrid);
    }
  });
  it('keeps absent legacy blocks and empty photos distinct from invalid supplied data', () => {
    for (const source of ['google', 'ai-unverified', 'manual'] as const) {
      expect(converted(section({ morning: [{ ...legacy(), source }] })).Timeline.morning[0].source).toBe(source);
    }
    const invalidSourceEntry = { ...legacy(), source: { toString: null } };
    expect(() => rejectsPlace(invalidSourceEntry)).not.toThrow();
    const input = { documentId: 'absent', Timeline: null, Stay: '', Recommendation_Activity: undefined };
    expect(converted(input)).toMatchObject({ Timeline: { morning: [], afternoon: [], evening: [] }, Stay: { accommodations: [] }, Recommendation_Activity: { activities: [] } });
    const empty = { ...legacy(), photos: undefined }; expect(converted(section({ morning: [empty] })).Timeline.morning[0].photos).toEqual([]);
    const { geometry: _geometry, photos: _photos, ...minimalLegacy } = legacy();
    expect(converted(section({ morning: [minimalLegacy] })).Timeline.morning[0]).toMatchObject({ id: 'entry-one', name: 'Place', place_id: 'provider-one', formatted_address: 'Street', photos: [] });
    expect(converted(section({ morning: [{ ...minimalLegacy, types: [] }] })).Timeline.morning[0].types).toEqual([]);
    expect(converted(section({ morning: [{ ...minimalLegacy, types: ['park'], geometry: { location: { lat: 0, lng: 0 } } }] })).Timeline.morning[0].geometry).toEqual({ location: { lat: 0, lng: 0 } });
    expect(convertPublicGuideSection(section('null'))).toEqual({ ok: false });
    expect(converted(section(null)).Timeline).toEqual({ morning: [], afternoon: [], evening: [] });
    rejectsPlace({ ...legacy(), photos: null });
  });
  it('keeps the rest of a section when one place is malformed', () => {
    // The defect this replaces: convertPublicGuideSection returned {ok:false} for a single bad
    // place, and PublicGuideDetailPage's flatMap then dropped the WHOLE section -- so one
    // unparseable entry removed every valid place, stay and activity beside it, with no notice
    // to the reader. Observed in e2e/public-shell-continuity.spec.ts, where a missing `id` left
    // a guide with no sections at all.
    const bad = { ...legacy(), id: undefined };
    const result = converted({ ...section({ morning: [bad, legacy('keeps-morning')], afternoon: [legacy('keeps-afternoon')], evening: [] }),
      Stay: { accommodations: [bad, legacy('keeps-stay')] },
      Recommendation_Activity: { activities: [legacy('keeps-activity'), bad] } });
    expect(result.Timeline.morning.map(place => place.id)).toEqual(['keeps-morning']);
    expect(result.Timeline.afternoon.map(place => place.id)).toEqual(['keeps-afternoon']);
    expect(result.Description).toBe('keep me');
    expect((result.Stay.accommodations as { id: string }[]).map(place => place.id)).toEqual(['keeps-stay']);
    expect((result.Recommendation_Activity.activities as { id: string }[]).map(place => place.id)).toEqual(['keeps-activity']);
    // A block whose places are ALL malformed still yields an empty block rather than throwing.
    // It is not rendered as a map: hasPlacesForMap stays false for it, which is unchanged here.
    expect(converted(section({ morning: [bad] })).Timeline.morning).toEqual([]);
  });
  it('prefers each entry own thumbnail and retains last activity first photo fallback', () => {
    const first = legacy('first', [uiPhoto('own-first')]); const second = legacy('second', [uiPhoto('own-second')]);
    const sections = [{ Recommendation_Activity: { activities: [legacy('act-first', [uiPhoto('fallback-first')]), legacy('act-last', [uiPhoto('fallback-last'), uiPhoto('not-first')]), { ...legacy('other', [uiPhoto('unrelated')]), place_id: 'other' }] } }];
    expect(selectGuidePlaceThumbnail(first, sections)).toEqual(first.photos[0]); expect(selectGuidePlaceThumbnail(second, sections)).toEqual(second.photos[0]);
    expect(selectGuidePlaceThumbnail(legacy('empty', []), sections)).toEqual(uiPhoto('fallback-last'));
    expect(selectGuidePlaceThumbnail({ ...legacy('empty', []), place_id: '' }, sections)).toBeUndefined();
  });
  it('keeps gallery direct order and deduplicates by media identity with first metadata winning', () => {
    const direct = [uiPhoto('one', '/shared', 'direct metadata'), uiPhoto('two', '/shared')];
    const sections = [{ Recommendation_Activity: { activities: [legacy('activity', [uiPhoto('one', '/different', 'losing metadata'), uiPhoto('three')]), legacy('later', [uiPhoto('four')]), { ...legacy('unrelated'), place_id: 'other' }] } }];
    expect(selectGuidePlaceGallery(legacy('own', direct), sections)).toEqual([...direct, uiPhoto('three'), uiPhoto('four')]);
    expect(selectGuidePlaceGallery({ ...legacy(), photos: [{ url: '/no-id-a' }, { url: '/no-id-b' }, { url: 42 }] }, [])).toEqual([{ url: '/no-id-a' }, { url: '/no-id-b' }]);
  });
  it('preserves legacy owner gallery photos and matching activity fallback', () => {
    const sections = [{ Recommendation_Activity: { activities: [legacy('first', [uiPhoto('strapi-non-uuid')]), legacy('last', [uiPhoto('another-upload')])] } }, { Recommendation_Activity: null }];
    expect(selectGuidePlaceGallery(legacy('selected', []), sections)).toEqual([uiPhoto('strapi-non-uuid'), uiPhoto('another-upload')]);
  });
});
