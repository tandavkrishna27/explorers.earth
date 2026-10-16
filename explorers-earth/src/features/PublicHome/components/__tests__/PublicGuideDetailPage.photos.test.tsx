import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PublicGuideDetailPage from '../PublicGuideDetailPage';
import { mergePublicPage } from '../../api/publicProfilePagination';
const state = vi.hoisted(() => ({ data: {} as any, seen: { journey: [] as any[], stay: [] as any[], map: [] as any[] } }));
vi.mock('../../api/usePublicProfileDetail', () => ({ usePublicProfileDetail: () => ({ data: state.data, loading: false, error: null, refetch: vi.fn(), hasMore: false, loadingMore: false, loadMoreError: null, loadMore: vi.fn() }) }));
vi.mock('../../api/usePublicProfileShell', () => ({ usePublicProfileShell: () => ({ loading: false, error: null, refetch: vi.fn() }) }));
vi.mock('../PublicHeaderDescriptorContext', () => ({ usePublicHeaderDescriptor: () => {} }));
vi.mock('../../../../components/SEO', () => ({ default: () => null }));
vi.mock('../PublicGuideViews/DayNavigationView', () => ({ default: ({ sections }: any) => { state.seen.journey.push(sections); return <div>journey child</div>; } }));
vi.mock('../PublicGuideViews/PublicGuideStayView', () => ({ default: ({ sections }: any) => { state.seen.stay.push(sections); return <div>stay child</div>; } }));
vi.mock('../PublicGuideViews/GuideMapView', () => ({ default: ({ sections, onCloseMap }: any) => { state.seen.map.push(sections); return <button onClick={onCloseMap}>close fixture map</button>; } }));
const media = '11111111-1111-4111-8111-111111111111';
const place = (localId: string) => ({ localId, placeId: 'shared-provider', name: localId, formattedAddress: 'Street', geometry: { location: { lat: 15, lng: 74 } }, types: [], tips: null, photos: [{ mediaId: media, fileName: localId, width: 800, height: 600, aspectRatio: '4:3' }], priceLevel: null, priceRange: null, customBudget: null, budgetAmount: null, budgetCurrency: null, source: 'manual', verified: false });
const section = (id: string, Sequence: number) => ({ documentId: id, Sequence, Title: id, Timeline: { morning: [place(`${id}-morning`)], afternoon: [place(`${id}-afternoon`)], evening: [place(`${id}-evening`)] }, Stay: { accommodations: [place(`${id}-stay`)] }, Recommendation_Activity: { activities: [place(`${id}-activity`)] } });
const payload = (sections: unknown[]) => ({ guides: [{ documentId: 'guide-one', Title: 'Fixture guide', slug: 'fixture', Guide_Media: [], guide_sections: sections }] });
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function tree() { return <MemoryRouter initialEntries={['/reader/guides/fixture']}><Routes><Route path="/:username/guides/:guideSlug" element={<PublicGuideDetailPage />} /></Routes></MemoryRouter>; }
function inspect(sections: any[], ids: string[]) {
  expect(sections.map((value: any) => value.documentId)).toEqual(ids);
  for (const item of sections) for (const [block, key, suffix] of [['Timeline', 'morning', 'morning'], ['Timeline', 'afternoon', 'afternoon'], ['Timeline', 'evening', 'evening'], ['Stay', 'accommodations', 'stay'], ['Recommendation_Activity', 'activities', 'activity']]) {
    expect(item[block][key][0]).toMatchObject({ id: `${item.documentId}-${suffix}`, place_id: 'shared-provider', geometry: { location: { lat: 15, lng: 74 } }, photos: [{ documentId: media, url: `/api/explorers/v1/media/${media}/content`, fileName: `${item.documentId}-${suffix}`, width: 800, height: 600, aspectRatio: '4:3' }] });
  }
}
async function freshChild(kind: keyof typeof state.seen, previousCount: number) {
  await waitFor(() => {
    expect(state.seen[kind].length).toBeGreaterThan(previousCount);
    if (kind === 'map') expect(screen.getByRole('button', { name: 'close fixture map' })).toBeTruthy();
    else expect(screen.getByText(`${kind} child`)).toBeTruthy();
  });
}
async function visitChildren() {
  const stayCount = state.seen.stay.length;
  fireEvent.click(screen.getByText('Stay'));
  await freshChild('stay', stayCount);
  const mapCount = state.seen.map.length;
  fireEvent.click(screen.getByRole('button', { name: 'Map View' }));
  await freshChild('map', mapCount);
}
afterEach(() => { state.seen = { journey: [], stay: [], map: [] }; state.data = {}; vi.clearAllMocks(); });
describe('PublicGuideDetailPage photo boundary', () => {
  it('hydrates first and accumulated continuation sections before all public views receive them', async () => {
    const first = freeze(payload([section('first', 2)]));
    const duplicate = { ...section('first', 99), Title: 'conflicting duplicate title' };
    duplicate.Timeline.morning[0].photos[0].fileName = 'conflicting duplicate photo';
    const next = freeze({ guides: [{ ...payload([duplicate, section('continued', 1)]).guides[0], Title: 'conflicting continuation root title', slug: 'conflicting-root-slug' }] });
    const original = JSON.stringify([first, next]);
    const initialJourneyCount = state.seen.journey.length;
    state.data = first; const view = render(tree());
    await freshChild('journey', initialJourneyCount);
    // Visit every actual child boundary before checking to avoid an early RED masking unvisited wiring.
    await visitChildren();
    const firstProps = { journey: state.seen.journey.at(-1), stay: state.seen.stay.at(-1), map: state.seen.map.at(-1) };
    const returnJourneyCount = state.seen.journey.length;
    fireEvent.click(screen.getByRole('button', { name: 'close fixture map' })); fireEvent.click(screen.getByText('Journey'));
    await freshChild('journey', returnJourneyCount);
    const continuedJourneyCount = state.seen.journey.length;
    state.data = mergePublicPage(first as any, next as any, 'guides', true); view.rerender(tree());
    await freshChild('journey', continuedJourneyCount);
    await visitChildren();
    expect(state.data.guides[0].Title).toBe('Fixture guide'); expect(state.data.guides[0].slug).toBe('fixture'); expect(state.data.guides[0].guide_sections).toHaveLength(2);
    const retained = state.data.guides[0].guide_sections.find((item: any) => item.documentId === 'first');
    expect(retained.Sequence).toBe(2); expect(retained.Title).toBe('first'); expect(retained.Timeline.morning[0].photos[0].fileName).toBe('first-morning');
    for (const kind of ['journey', 'stay', 'map'] as const) {
      inspect(firstProps[kind], ['first']);
      expect(firstProps[kind][0]).toMatchObject({ Sequence: 2, Title: 'first' });
      inspect(state.seen[kind].at(-1), ['continued', 'first']);
      expect(state.seen[kind].at(-1)[1]).toMatchObject({ Sequence: 2, Title: 'first' });
    }
    expect(JSON.stringify([first, next])).toBe(original);
  });
  it('omits an invalid place without omitting its section, and never renders its legacy URL', async () => {
    // Previously one invalid place made convertPublicGuideSection report {ok:false} and this
    // page's flatMap dropped the WHOLE section -- the assertion here used to be `['valid']`,
    // i.e. everything else in the 'invalid' section was deleted from the reader's view too.
    // The section is now retained with the bad place skipped. The legacy-URL assertion is
    // deliberately unchanged and still applies to every view: a rejected place must never
    // reach the reader through its unverified `url`.
    const invalid = section('invalid', 1); invalid.Timeline.morning[0].photos = [{ ...invalid.Timeline.morning[0].photos[0], mediaId: 'invalid', url: '/legacy-rescue' } as any];
    const initialJourneyCount = state.seen.journey.length;
    state.data = freeze(payload([invalid, section('valid', 2)])); render(tree());
    await freshChild('journey', initialJourneyCount);
    await visitChildren();
    for (const kind of ['journey', 'stay', 'map'] as const) {
      const sections = state.seen[kind].at(-1);
      expect(sections.map((value: any) => value.documentId)).toEqual(['invalid', 'valid']);
      expect(JSON.stringify(sections)).not.toContain('/legacy-rescue');
      const retained = sections.find((value: any) => value.documentId === 'invalid');
      // The one rejected place is gone from its own block; every sibling block is untouched.
      expect(retained.Timeline.morning).toEqual([]);
      expect(retained.Timeline.afternoon.map((p: any) => p.id)).toEqual(['invalid-afternoon']);
      expect(retained.Timeline.evening.map((p: any) => p.id)).toEqual(['invalid-evening']);
      expect(retained.Stay.accommodations.map((p: any) => p.id)).toEqual(['invalid-stay']);
      expect(retained.Recommendation_Activity.activities.map((p: any) => p.id)).toEqual(['invalid-activity']);
    }
  });
});
