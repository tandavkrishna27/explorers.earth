import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AddPlaceOverlay from '../AddPlaceOverlay';

vi.mock('@vis.gl/react-google-maps', () => ({ useMapsLibrary: () => null }));
vi.mock('../../../../components/GoogleMapsProvider', () => ({ withGoogleMapsProvider: (component: unknown) => component }));
vi.mock('../TopPlacesByCategory', () => ({ default: () => null }));
vi.mock('../../../../store/useCityStore', () => ({ useCityStore: () => ({ selectedCity: { documentId: 'list-1', List_Name: 'Goa' } }) }));

describe('AddPlaceOverlay', () => {
  // The Instagram link import called /api/instagram, which the canonical backend does not serve.
  it('offers place search but no Instagram link import', () => {
    render(<MemoryRouter><AddPlaceOverlay isOpen onClose={() => undefined} /></MemoryRouter>);
    expect(screen.getByText(/Start typing/)).toBeInTheDocument();
    expect(screen.queryByText(/Instagram/i)).toBeNull();
    expect(document.getElementById('add-place-instagram-input')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Go' })).toBeNull();
  });
});
