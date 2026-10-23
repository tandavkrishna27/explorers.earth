import {useEffect, useId, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {GuideDayItemInput} from '../../../../../tunes/shared/explorersGuideContract';
import GooglePlaceResults from './GooglePlaceResults';
import type {GooglePick} from './googlePlaceSearch';
import {searchMyLists, type MyListHit} from './myListsSearch';

type Props = {dayName: string; onAdd: (item: GuideDayItemInput) => void; onClose: () => void};

/** GD-18/25: in place at the end of a day; saved items → Google → note; stays open for the next item; Esc closes. */
export default function SmartAddBox({dayName, onAdd, onClose}: Props) {
 const {t} = useTranslation();
 const [query, setQuery] = useState('');
 const [hits, setHits] = useState<MyListHit[]>([]);
 const input = useRef<HTMLInputElement>(null);
 const listId = useId();
 useEffect(() => input.current?.focus(), []);
 useEffect(() => {
  const q = query.trim();
  if (q.length < 2) {setHits([]); return;}
  const controller = new AbortController();
  const timer = setTimeout(() => void searchMyLists(q, controller.signal).then(setHits).catch(() => setHits([])), 200);
  return () => {clearTimeout(timer); controller.abort();};
 }, [query]);
 const added = (item: GuideDayItemInput) => {onAdd(item); setQuery(''); setHits([]); input.current?.focus();};
 // The server overrides place.localId.
 const google = (p: GooglePick) => added({kind: 'place', timeLabel: null, place: {
  localId: 'new', placeId: p.placeId, name: p.name, formattedAddress: p.formattedAddress,
  geometry: p.lat !== null && p.lng !== null ? {location: {lat: p.lat, lng: p.lng}} : null, types: p.types.slice(0, 32), tips: null, photos: [],
  priceLevel: null, priceRange: null, customBudget: null, budgetAmount: null, budgetCurrency: null, source: 'google', verified: true}});
 const note = query.trim();
 const optionKeys = (run: () => void) => (e: React.KeyboardEvent) => {if (e.key === 'Enter') {e.preventDefault(); run();}};
 return (
  <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3" onKeyDown={(e) => {if (e.key === 'Escape') onClose();}}>
   <input ref={input} role="combobox" aria-expanded={note.length > 0} aria-controls={listId} value={query}
    aria-label={t('dashboard.wp9.addToDayLabel', {defaultValue: 'Add to {{day}}', day: dayName})}
    placeholder={t('dashboard.wp9.smartPlaceholder', {defaultValue: 'Search your lists, places, or type a note'})}
    onChange={(e) => setQuery(e.target.value)}
    onKeyDown={(e) => {if (e.key === 'Enter' && note) {e.preventDefault(); const first = hits[0]; if (first) added({kind: 'listItem', timeLabel: null, ref: {recommendationId: first.recommendationId, collectionId: first.collectionId}}); else added({kind: 'note', timeLabel: null, text: note});}}}
    className="min-h-[44px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-gray-500" />
   {note && (
    <ul id={listId} role="listbox" className="mt-2 space-y-1">
     {hits.length > 0 && <li role="presentation" className="px-2 text-xs font-semibold text-gray-400">{t('dashboard.wp9.fromMyLists', {defaultValue: 'From my lists'})}</li>}
     {hits.map((hit) => {
      const pick = () => added({kind: 'listItem', timeLabel: null, ref: {recommendationId: hit.recommendationId, collectionId: hit.collectionId}});
      return (
       <li key={hit.recommendationId} role="option" aria-selected={false} tabIndex={0} onClick={pick} onKeyDown={optionKeys(pick)}
        className="flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-lg px-2 hover:bg-white/5">
        <span className="min-w-0 truncate">{hit.title}</span><span className="shrink-0 text-xs text-gray-400">{hit.subtitle}</span>
       </li>
      );
     })}
     <li role="presentation" className="px-2 text-xs font-semibold text-gray-400">Google</li>
     <li role="presentation"><GooglePlaceResults query={note} onPick={google} /></li>
     <li role="option" aria-selected={false} tabIndex={0} onClick={() => added({kind: 'note', timeLabel: null, text: note})} onKeyDown={optionKeys(() => added({kind: 'note', timeLabel: null, text: note}))}
      className="min-h-[44px] cursor-pointer rounded-lg px-2 py-2 hover:bg-white/5">{t('dashboard.wp9.addAsNote', {defaultValue: 'Add as a note: "{{text}}"', text: note})}</li>
    </ul>
   )}
   <div className="mt-2 text-right"><button type="button" onClick={onClose} className="min-h-[44px] rounded-lg px-3 text-sm text-gray-300 hover:bg-white/5">{t('dashboard.wp9.done', {defaultValue: 'Done'})}</button></div>
  </div>
 );
}
