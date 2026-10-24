import {mapsBrowserKey} from '../../../lib/publicRuntimeConfig';

export type GooglePick = {placeId: string; name: string; formattedAddress: string | null; lat: number | null; lng: number | null; types: string[]};
type RawPlace = {id?: string; displayName?: {text?: string}; formattedAddress?: string; location?: {latitude?: number; longitude?: number}; types?: string[]};

/** Places (New) text search, the same REST API TopPlacesByCategory uses. Interim until WP6's PlaceSearchField lands on main. */
export async function searchGooglePlaces(query: string, signal?: AbortSignal): Promise<GooglePick[]> {
 const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
  method: 'POST', signal,
  headers: {'Content-Type': 'application/json', 'X-Goog-Api-Key': mapsBrowserKey(), 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types'},
  body: JSON.stringify({textQuery: query, maxResultCount: 5}),
 });
 if (!response.ok) throw new Error(`Place search failed (${response.status})`);
 const body = (await response.json()) as {places?: RawPlace[]};
 return (body.places ?? []).flatMap((p) => {
  if (!p.id || !p.displayName?.text) return [];
  const lat = p.location?.latitude, lng = p.location?.longitude;
  const located = typeof lat === 'number' && typeof lng === 'number';
  return [{placeId: p.id, name: p.displayName.text, formattedAddress: p.formattedAddress ?? null, lat: located ? lat : null, lng: located ? lng : null, types: p.types ?? []}];
 });
}
