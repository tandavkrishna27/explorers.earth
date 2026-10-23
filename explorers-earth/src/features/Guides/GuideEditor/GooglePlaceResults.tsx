import {useEffect, useState} from 'react';
import {searchGooglePlaces, type GooglePick} from './googlePlaceSearch';

type Props = {query: string; onPick: (place: GooglePick) => void};

/** The Google group of the smart add box: one option per text-search result (debounced, aborted on change). */
export default function GooglePlaceResults({query, onPick}: Props) {
 const [results, setResults] = useState<GooglePick[]>([]);
 useEffect(() => {
  const q = query.trim();
  if (q.length < 2) {setResults([]); return;}
  const controller = new AbortController();
  const timer = setTimeout(() => void searchGooglePlaces(q, controller.signal).then(setResults).catch(() => setResults([])), 300);
  return () => {clearTimeout(timer); controller.abort();};
 }, [query]);
 if (!results.length) return null;
 return (
  <ul role="group" className="space-y-1">
   {results.map((p) => (
    <li key={p.placeId} role="option" aria-selected={false} tabIndex={0} onClick={() => onPick(p)} onKeyDown={(e) => {if (e.key === 'Enter') {e.preventDefault(); onPick(p);}}}
     className="flex min-h-[44px] cursor-pointer flex-col justify-center rounded-lg px-2 hover:bg-white/5">
     <span className="text-sm">{p.name}</span>{p.formattedAddress && <span className="text-xs text-gray-400">{p.formattedAddress}</span>}
    </li>
   ))}
  </ul>
 );
}
