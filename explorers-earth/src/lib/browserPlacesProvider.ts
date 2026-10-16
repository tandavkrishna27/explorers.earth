import axios from 'axios';
import { mapsBrowserKey } from './publicRuntimeConfig';
import type { Places } from '../features/Profile/types/types';
export interface BrowserPlaceSuggestion { id: string; label: string }
export interface BrowserPlaceDetails {
  primaryType?: string;
  primaryTypeDisplayName?: string | { text?: string };
  rating?: number;
  photos?: { name: string; widthPx: number; heightPx: number }[];
  priceLevel?: string;
  priceRange?: string | {
    startPrice?: { currencyCode?: string; units?: string | number | null };
    endPrice?: { currencyCode?: string; units?: string | number | null };
    min?: number; max?: number; currencyCode?: string;
  };
}
export interface BrowserPlacesProvider {
  kind: 'google-sdk' | 'owned-http';
  search(query: string, signal?: AbortSignal): Promise<BrowserPlaceSuggestion[]>;
  selection(id: string, signal?: AbortSignal): Promise<Places>;
  details(id: string, mask: string, signal?: AbortSignal, apiKey?: string): Promise<BrowserPlaceDetails>;
  photoUrl(name: string, key: string): string;
}
export const browserPlacesProvider: BrowserPlacesProvider = {
  kind: 'google-sdk',
  async search() { return []; },
  async selection() { throw new Error('Google selections use the SDK'); },
  async details(id, mask, signal, apiKey) {
    return (await axios.get(`https://places.googleapis.com/v1/places/${id}`, {
      signal, headers: { 'X-Goog-Api-Key': apiKey ?? mapsBrowserKey(), 'X-Goog-FieldMask': mask },
    })).data;
  },
  photoUrl(name, key) { return `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=${key}`; },
};
