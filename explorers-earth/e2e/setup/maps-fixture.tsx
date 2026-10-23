import type { PropsWithChildren } from 'react';

// Only third-party Maps is replaced. No navigation, publication or auth code is
// substituted. These journeys do not qualify Maps functionality or rendering.
export const APIProvider = ({ children }: PropsWithChildren) => <>{children}</>;
// A journey opts in to a clickable map by defining `__mapsFixture.click` ({lat,lng}) before
// load; the map is then one button that reports that point as a map click.
export const Map = ({ onClick }: { onClick?: (event: { detail: { latLng: { lat: number; lng: number } } }) => void }) => {
  const click = (globalThis as any).__mapsFixture?.click as { lat: number; lng: number } | undefined;
  return click ? <button type="button" style={{ width: "100%", height: "100%" }} onClick={() => onClick?.({ detail: { latLng: click } })}>Fixture map</button> : null;
};
export const AdvancedMarker = () => null;
export const Pin = () => null;
export const useMap = () => null;
// A journey opts in to a usable Maps by defining `google.maps.marker.AdvancedMarkerElement`
// before load (the same signal `useMapsUsable` requires); otherwise Maps reports not loaded.
export const useApiIsLoaded = () => Boolean((globalThis as any).google?.maps?.marker?.AdvancedMarkerElement);
// A journey opts in to Places search by defining `__mapsFixture.places`: the suggestions it
// returns for any input and the place details `Place.fetchFields` fills. Otherwise null.
export const useMapsLibrary = (name?: string) => {
  const fixture = (globalThis as any).__mapsFixture?.places as PlacesFixture | undefined;
  if (name !== 'places' || !fixture) return null;
  // One library per page, as the real loader returns, so hooks keyed on it stay stable.
  return (placesLibrary ??= createPlacesLibrary(fixture));
};
type PlacesFixture = { suggestions: { placeId: string; main: string; secondary?: string }[]; place: { id: string; displayName: string; formattedAddress: string; lat: number; lng: number } };
let placesLibrary: ReturnType<typeof createPlacesLibrary> | undefined;
function createPlacesLibrary(fixture: PlacesFixture) {
  class AutocompleteSessionToken {}
  class Place {
    id: string; displayName?: string; formattedAddress?: string; types: string[] = []; rating?: number; primaryType?: string;
    location?: { lat: () => number; lng: () => number };
    constructor({ id }: { id: string }) { this.id = id; }
    async fetchFields() {
      const p = fixture!.place;
      Object.assign(this, { id: p.id, displayName: p.displayName, formattedAddress: p.formattedAddress, location: { lat: () => p.lat, lng: () => p.lng } });
    }
  }
  const AutocompleteSuggestion = {
    fetchAutocompleteSuggestions: async () => ({ suggestions: fixture.suggestions.map((s) => ({
      placePrediction: { placeId: s.placeId, text: { text: s.main }, mainText: { text: s.main }, secondaryText: s.secondary ? { text: s.secondary } : undefined },
    })) }),
  };
  return { AutocompleteSessionToken, AutocompleteSuggestion, Place };
}
