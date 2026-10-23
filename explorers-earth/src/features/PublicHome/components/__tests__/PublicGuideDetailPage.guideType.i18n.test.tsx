import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import i18n from '../../../../i18n/index.js';
import ar from '../../../../i18n/resources/ar.json';
import PublicGuideDetailPage from '../PublicGuideDetailPage';

const state = vi.hoisted(() => ({ data: {} as any }));
vi.mock('../../api/usePublicProfileDetail', () => ({ usePublicProfileDetail: () => ({ data: state.data, loading: false, error: null, refetch: vi.fn(), hasMore: false, loadingMore: false, loadMoreError: null, loadMore: vi.fn() }) }));
vi.mock('../../api/usePublicProfileShell', () => ({ usePublicProfileShell: () => ({ loading: false, error: null, refetch: vi.fn() }) }));
vi.mock('../PublicHeaderDescriptorContext', () => ({ usePublicHeaderDescriptor: () => {} }));
vi.mock('../../../../components/SEO', () => ({ default: () => null }));
vi.mock('../PublicGuideViews/DayNavigationView', () => ({ default: () => <div>journey child</div> }));
vi.mock('../PublicGuideViews/PublicGuideStayView', () => ({ default: () => <div>stay child</div> }));
vi.mock('../PublicGuideViews/GuideMapView', () => ({ default: () => null }));

afterEach(async () => { state.data = {}; await i18n.changeLanguage('en'); });

it('shows the guide type badge in Arabic (UAT-04)', async () => {
  i18n.addResourceBundle('ar', 'translation', ar, true, true);
  await i18n.changeLanguage('ar');
  state.data = { guides: [{ documentId: 'guide-one', Title: 'Fixture guide', slug: 'fixture', Guide_Type: 'Itinerary', Guide_Media: [], guide_sections: [] }] };
  render(<MemoryRouter initialEntries={['/reader/guides/fixture']}><Routes><Route path="/:username/guides/:guideSlug" element={<PublicGuideDetailPage />} /></Routes></MemoryRouter>);
  expect(await screen.findByText('خط سير الرحلة')).toBeTruthy();
  expect(screen.queryByText('Itinerary')).toBeNull();
});
