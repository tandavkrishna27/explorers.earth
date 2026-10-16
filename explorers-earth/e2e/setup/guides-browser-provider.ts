import axios from 'axios';
import type { BrowserPlacesProvider, BrowserPlaceSuggestion } from '../../src/lib/browserPlacesProvider';
import type { Places } from '../../src/features/Profile/types/types';
export const GUIDES_PROVIDER_QUERY = 'Guides Fixture Museum';
export const GUIDES_PROVIDER_ID = 'guides-fixture-museum';
export const GUIDES_PROVIDER_PHOTO = 'guides-fixture-photo';
export const GUIDES_PROVIDER_ROOT = '/__guides_provider__/v1/';
const paths = {
  search: `${GUIDES_PROVIDER_ROOT}search`,
  details: `${GUIDES_PROVIDER_ROOT}places/${GUIDES_PROVIDER_ID}/details`,
  photos: `${GUIDES_PROVIDER_ROOT}places/${GUIDES_PROVIDER_ID}/photos`,
  price: `${GUIDES_PROVIDER_ROOT}places/${GUIDES_PROVIDER_ID}/price`,
  jpeg: `${GUIDES_PROVIDER_ROOT}photos/${GUIDES_PROVIDER_PHOTO}.jpg`,
};
export const GUIDES_PROVIDER_PATHS = Object.freeze(paths);
function exact(value: unknown, expected: unknown): void {
  // Fixtures carry data only: every field, array length and value is bounded.
  if (typeof expected !== 'object' || expected === null) {
    if (value !== expected) throw new Error('Invalid owned provider response');
    return;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value) !== Array.isArray(expected)) throw new Error('Invalid owned provider response');
  const actual = value as Record<string, unknown>, wanted = expected as Record<string, unknown>;
  const keys = Object.keys(wanted);
  if (Object.keys(actual).length !== keys.length) throw new Error('Invalid owned provider response');
  for (const key of keys) {
    if (!Object.hasOwn(actual, key)) throw new Error('Invalid owned provider response');
    exact(actual[key], wanted[key]);
  }
}
export const GUIDES_PROVIDER_DETAILS = {
  id: GUIDES_PROVIDER_ID, displayName: { text: GUIDES_PROVIDER_QUERY },
  formattedAddress: '8 Museum Road, Fixture City, Fixture Country',
  types: ['museum'], primaryType: 'museum', primaryTypeDisplayName: { text: 'Museum' },
  addressComponents: [
    { longText: 'Fixture City', shortText: 'Fixture City', types: ['locality'] },
    { longText: 'Fixture Country', shortText: 'FC', types: ['country'] },
  ], location: { latitude: 12.5, longitude: 77.5 }, rating: 4.5,
};
export const GUIDES_PROVIDER_PHOTOS = { photos: [{ name: GUIDES_PROVIDER_PHOTO, widthPx: 8, heightPx: 8 }] };
export const GUIDES_PROVIDER_PRICE = { priceLevel: 'PRICE_LEVEL_MODERATE', priceRange: '$5 - $10' };
async function read<T>(path: string, expected: T, signal?: AbortSignal): Promise<T> {
  const response = await axios.get<unknown>(path, { signal });
  exact(response.data, expected);
  return response.data as T;
}
function requireId(id: string): void { if (id !== GUIDES_PROVIDER_ID) throw new Error('Invalid owned place ID'); }
export const browserPlacesProvider: BrowserPlacesProvider = {
  kind: 'owned-http',
  async search(query, signal) {
    if (query !== GUIDES_PROVIDER_QUERY) return [];
    const expected: BrowserPlaceSuggestion[] = [{ id: GUIDES_PROVIDER_ID, label: GUIDES_PROVIDER_QUERY }];
    return read(paths.search, expected, signal);
  },
  async selection(id, signal): Promise<Places> {
    requireId(id);
    const data = await read(paths.details, GUIDES_PROVIDER_DETAILS, signal);
    return { place_id: data.id, name: data.displayName.text, formatted_address: data.formattedAddress,
      types: data.types, primaryType: data.primaryType, primaryTypeDisplayName: data.primaryTypeDisplayName.text,
      rating: data.rating, address_components: data.addressComponents.map((c: {longText: string; shortText: string; types: string[]}) => ({long_name: c.longText, short_name: c.shortText, types: c.types})),
      geometry: { location: { lat: () => data.location.latitude, lng: () => data.location.longitude } } };
  },
  async details(id, mask, signal) {
    requireId(id);
    if (mask === 'photos') return read(paths.photos, GUIDES_PROVIDER_PHOTOS, signal);
    if (mask === 'priceLevel,priceRange') return read(paths.price, GUIDES_PROVIDER_PRICE, signal);
    throw new Error('Invalid owned field mask');
  },
  photoUrl(name) { if (name !== GUIDES_PROVIDER_PHOTO) throw new Error('Invalid owned photo ID'); return paths.jpeg; },
};
