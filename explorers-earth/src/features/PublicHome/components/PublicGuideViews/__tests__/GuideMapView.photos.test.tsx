import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GuideMapView from '../GuideMapView';
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  AdvancedMarker: forwardRef<HTMLDivElement, { children?: ReactNode; onClick?: () => void }>(({ children, onClick }, ref) => <div ref={ref} data-testid="map-marker" onClick={onClick}>{children}</div>),
  Map: ({ children }: { children?: ReactNode }) => <div>{children}</div>, Pin: () => <span />, useMap: () => null, useApiIsLoaded: () => true,
}));
// Maps counts as usable only when the marker library is present.
(window as unknown as { google: unknown }).google = { maps: { marker: { AdvancedMarkerElement: class {} } } };
const photo = (id: string) => ({ id, documentId: id, url: `/fixture/${id}`, fileName: id, width: 800, height: 600, aspectRatio: '4:3' });
const place = (photos: unknown[]) => ({ id: 'map-entry', name: 'Map fixture', place_id: 'map-provider', formatted_address: 'Fixture street', geometry: { location: { lat: 15, lng: 74 } }, photos });
function mount(photos: unknown[], activities: unknown[] = []) {
  return render(<GuideMapView sections={[{ Sequence: 1, Timeline: JSON.stringify({ morning: [place(photos)], afternoon: [], evening: [] }), Recommendation_Activity: { activities } }]} guide={{}} isMapView onCloseMap={vi.fn()} />);
}
afterEach(() => { vi.clearAllMocks(); });
describe('GuideMapView entry photos', () => {
  it('renders timeline own photos in map list and selected info window', async () => {
    mount([photo('map-own')]);
    const listImage = screen.getByRole('img', { name: 'Map fixture' });
    fireEvent.click(screen.getByTestId('map-marker'));
    await waitFor(() => expect(screen.getAllByRole('img', { name: 'Map fixture' })).toHaveLength(2));
    expect(listImage).toHaveAttribute('src', '/fixture/map-own');
    screen.getAllByRole('img', { name: 'Map fixture' }).forEach(image => expect(image).toHaveAttribute('src', '/fixture/map-own'));
  });
  it('retains legacy activity fallback when map entry has no own photo', () => {
    mount([], [{ ...place([photo('earlier')]), id: 'earlier' }, { ...place([photo('last'), photo('second')]), id: 'last' }]);
    expect(screen.getByRole('img', { name: 'Map fixture' })).toHaveAttribute('src', '/fixture/last');
  });
});
