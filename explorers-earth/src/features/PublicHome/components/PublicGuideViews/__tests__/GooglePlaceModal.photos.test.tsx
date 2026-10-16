import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GooglePlaceModal from '../GooglePlaceModal';
vi.mock('../../PlaceDetails/Details/MediaGallery', () => ({ default: ({ Media }: any) => <output data-testid="gallery">{JSON.stringify(Media)}</output> }));
vi.mock('../../PlaceDetails/Details/Overview', () => ({ default: () => null }));
vi.mock('../../../../../components/ui/Tab', () => ({ default: ({ tabs }: any) => <>{tabs.Media}</> }));
const photo = (id: string, url = `/fixture/${id}`) => ({ id, documentId: id, url, fileName: id, width: 800, height: 600, aspectRatio: '4:3' });
const place = (photos: unknown[] = []) => ({ id: 'selected', place_id: 'same-provider', name: 'Fixture', formatted_address: 'Street', photos });
const sections = (photos: unknown[]) => [{ Recommendation_Activity: { activities: [{ ...place(photos), id: 'activity' }, { ...place([photo('unrelated')]), place_id: 'other' }] } }];
async function expectGallery(urls: string[]) { await waitFor(() => expect(JSON.parse(screen.getByTestId('gallery').textContent!)).toEqual(urls.map(url => ({ url, alt: 'Fixture' })))); }
afterEach(() => { vi.clearAllMocks(); document.body.style.overflow = ''; });
describe('GooglePlaceModal photo sources', () => {
  it('passes direct then distinct matching activity photos to the gallery', async () => {
    render(<GooglePlaceModal place={place([photo('direct', '/shared'), photo('different-id', '/shared')])} sections={sections([photo('direct', '/losing'), photo('activity')])} isOpen onClose={vi.fn()} />);
    await expectGallery(['/shared', '/shared', '/fixture/activity']);
  });
  it('retains owner shaped activity photos when selected owner place has no photos', async () => {
    render(<GooglePlaceModal place={place()} sections={sections([photo('strapi-upload'), photo('non-uuid-owner')])} isOpen onClose={vi.fn()} />);
    await expectGallery(['/fixture/strapi-upload', '/fixture/non-uuid-owner']);
  });
  it('refreshes gallery photos when sections change', async () => {
    const selected = place([photo('direct')]); const view = render(<GooglePlaceModal place={selected} sections={sections([photo('first')])} isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('gallery')).toBeInTheDocument());
    const initial = JSON.parse(screen.getByTestId('gallery').textContent!);
    view.rerender(<GooglePlaceModal place={selected} sections={sections([photo('first'), photo('continued')])} isOpen onClose={vi.fn()} />);
    await expectGallery(['/fixture/direct', '/fixture/first', '/fixture/continued']);
    expect(initial).toEqual([{ url: '/fixture/direct', alt: 'Fixture' }, { url: '/fixture/first', alt: 'Fixture' }]);
  });
});
