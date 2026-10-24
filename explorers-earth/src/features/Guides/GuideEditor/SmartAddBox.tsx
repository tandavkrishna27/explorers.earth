import {useEffect, useId, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {GuideDayItemInput} from '../../../../../tunes/shared/explorersGuideContract';
import {MIN_SEARCH_CHARS, useGooglePlaceResults} from './GooglePlaceResults';
import type {GooglePick} from './googlePlaceSearch';
import {searchMyLists, type MyListHit} from './myListsSearch';

type Props = {dayName: string; onAdd: (item: GuideDayItemInput) => void; onClose: () => void};
type Option = {id: string; group: 'lists' | 'google' | 'note'; label: React.ReactNode; item: GuideDayItemInput};

// The server overrides place.localId.
const placeItem = (p: GooglePick): GuideDayItemInput => ({kind: 'place', timeLabel: null, place: {
 localId: 'new', placeId: p.placeId, name: p.name, formattedAddress: p.formattedAddress,
 geometry: p.lat !== null && p.lng !== null ? {location: {lat: p.lat, lng: p.lng}} : null, types: p.types.slice(0, 32), tips: null, photos: [],
 priceLevel: null, priceRange: null, customBudget: null, budgetAmount: null, budgetCurrency: null, source: 'google', verified: true}});

/**
 * GD-18/25: in place at the end of a day; saved items → Google → note; stays open for the next item; Esc closes.
 * Enter adds the typed text as a note unless an option was chosen with the arrow keys (aria-activedescendant).
 */
export default function SmartAddBox({dayName, onAdd, onClose}: Props) {
 const {t} = useTranslation();
 const [query, setQuery] = useState('');
 const [hits, setHits] = useState<MyListHit[]>([]);
 const [active, setActive] = useState(-1);
 const input = useRef<HTMLInputElement>(null);
 const listId = useId();
 const google = useGooglePlaceResults(query);
 useEffect(() => input.current?.focus(), []);
 useEffect(() => {
  setActive(-1);
  const q = query.trim();
  if (q.length < MIN_SEARCH_CHARS) {setHits([]); return;}
  const controller = new AbortController();
  const timer = setTimeout(() => void searchMyLists(q, controller.signal).then(setHits).catch(() => setHits([])), 200);
  return () => {clearTimeout(timer); controller.abort();};
 }, [query]);
 const added = (item: GuideDayItemInput) => {onAdd(item); setQuery(''); setHits([]); setActive(-1); input.current?.focus();};
 const note = query.trim();
 const options: Option[] = note ? [
  ...hits.map((hit): Option => ({id: `${listId}-l-${hit.recommendationId}`, group: 'lists',
   label: <><span className="min-w-0 truncate">{hit.title}</span><span className="shrink-0 text-xs text-gray-400">{hit.subtitle}</span></>,
   item: {kind: 'listItem', timeLabel: null, ref: {recommendationId: hit.recommendationId, collectionId: hit.collectionId}}})),
  ...google.map((p): Option => ({id: `${listId}-g-${p.placeId}`, group: 'google',
   label: <span className="flex flex-col"><span className="text-sm">{p.name}</span>{p.formattedAddress && <span className="text-xs text-gray-400">{p.formattedAddress}</span>}</span>,
   item: placeItem(p)})),
  {id: `${listId}-note`, group: 'note', label: t('dashboard.wp9.addAsNote', {defaultValue: 'Add as a note: "{{text}}"', text: note}), item: {kind: 'note', timeLabel: null, text: note}},
 ] : [];
 const current = active >= 0 && active < options.length ? options[active] : undefined;
 const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'ArrowDown' && options.length) {e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1));}
  else if (e.key === 'ArrowUp' && options.length) {e.preventDefault(); setActive((i) => Math.max(i - 1, -1));}
  else if (e.key === 'Enter' && note) {e.preventDefault(); added(current ? current.item : {kind: 'note', timeLabel: null, text: note});}
 };
 const heading = (group: Option['group']) => group === 'lists' ? t('dashboard.wp9.fromMyLists', {defaultValue: 'From my lists'})
  : group === 'google' ? t('dashboard.wp9.google', {defaultValue: 'Google'}) : null;
 return (
  <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3" onKeyDown={(e) => {if (e.key === 'Escape') onClose();}}>
   <input ref={input} role="combobox" aria-expanded={note.length > 0} aria-controls={listId} aria-activedescendant={current?.id} aria-autocomplete="list" value={query}
    aria-label={t('dashboard.wp9.addToDayLabel', {defaultValue: 'Add to {{day}}', day: dayName})}
    placeholder={t('dashboard.wp9.smartPlaceholder', {defaultValue: 'Search your lists, places, or type a note'})}
    onChange={(e) => setQuery(e.target.value)} onKeyDown={keys}
    className="min-h-[44px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-gray-500" />
   {note && (
    <ul id={listId} role="listbox" className="mt-2 space-y-1">
     {options.map((option, i) => {
      const title = i === 0 || options[i - 1].group !== option.group ? heading(option.group) : null;
      return [
       title && <li key={`${option.group}-h`} role="presentation" className="px-2 text-xs font-semibold text-gray-400">{title}</li>,
       <li key={option.id} id={option.id} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => added(option.item)}
        className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-white/5 ${i === active ? 'bg-white/10' : ''}`}>
        {option.label}
       </li>,
      ];
     })}
    </ul>
   )}
   <div className="mt-2 text-right"><button type="button" onClick={onClose} className="min-h-[44px] rounded-lg px-3 text-sm text-gray-300 hover:bg-white/5">{t('dashboard.wp9.done', {defaultValue: 'Done'})}</button></div>
  </div>
 );
}
