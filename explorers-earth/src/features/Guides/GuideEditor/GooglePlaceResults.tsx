import {useEffect, useState} from 'react';
import {searchGooglePlaces, type GooglePick} from './googlePlaceSearch';

/** Every search starts at this many characters, saved items and Google alike. */
export const MIN_SEARCH_CHARS = 3;
export const GOOGLE_DEBOUNCE_MS = 500;
/** Each Google text search costs money and sends the text to Google; a sentence is a note, not a place, so it is never sent. */
export function shouldSearchGoogle(query: string): boolean {
 const q = query.trim();
 return q.length >= MIN_SEARCH_CHARS && q.split(/\s+/).length <= 4;
}

/** The Google group of the smart add box: text-search results (debounced, aborted on change). */
export function useGooglePlaceResults(query: string): GooglePick[] {
 const [results, setResults] = useState<GooglePick[]>([]);
 useEffect(() => {
  const q = query.trim();
  if (!shouldSearchGoogle(q)) {setResults([]); return;}
  const controller = new AbortController();
  const timer = setTimeout(() => void searchGooglePlaces(q, controller.signal).then(setResults).catch(() => setResults([])), GOOGLE_DEBOUNCE_MS);
  return () => {clearTimeout(timer); controller.abort();};
 }, [query]);
 return results;
}
