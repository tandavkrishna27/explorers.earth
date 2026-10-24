import {afterEach, describe, expect, it, vi} from 'vitest';
vi.mock('../../../../lib/publicRuntimeConfig', () => ({mapsBrowserKey: () => 'test-key'}));
import {searchGooglePlaces} from '../googlePlaceSearch';
afterEach(() => vi.unstubAllGlobals());
describe('searchGooglePlaces', () => {
 it('maps Places text search results to picks', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({places: [
   {id: 'G1', displayName: {text: 'Fort Aguada'}, formattedAddress: 'Candolim, Goa', location: {latitude: 15.49, longitude: 73.77}, types: ['tourist_attraction']},
   {id: 'G2', displayName: {text: 'No location'}},
  ]})));
  vi.stubGlobal('fetch', fetchMock);
  const picks = await searchGooglePlaces('fort');
  expect(picks).toEqual([
   {placeId: 'G1', name: 'Fort Aguada', formattedAddress: 'Candolim, Goa', lat: 15.49, lng: 73.77, types: ['tourist_attraction']},
   {placeId: 'G2', name: 'No location', formattedAddress: null, lat: null, lng: null, types: []},
  ]);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
  expect(JSON.parse(String(init.body))).toMatchObject({textQuery: 'fort'});
 });
 it('throws on a failed response', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {status: 403})));
  await expect(searchGooglePlaces('fort')).rejects.toThrow();
 });
});
