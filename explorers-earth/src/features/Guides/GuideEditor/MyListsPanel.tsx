import {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {GuideDayItemInput} from '../../../../../tunes/shared/explorersGuideContract';

/** Drag payload for a saved item dragged into a day: {recommendationId, collectionId}. DayList's drop inserts it at the position (GD-25). */
export const NEW_ITEM_DRAG_TYPE = 'application/x-guide-new-item';

export type PanelItem = {recommendationId: string; title: string};
/** items is absent until the list is selected and loadItems has run. */
export type PanelList = {id: string; title: string; category: string; items?: PanelItem[]};
type Props = {
 /** Called once when the panel mounts, i.e. when it is opened; lists already given skip it. */
 loadLists?: (signal: AbortSignal) => Promise<PanelList[]>;
 loadItems?: (list: PanelList, signal: AbortSignal) => Promise<PanelItem[]>;
 lists?: PanelList[]; selectedDayName: string; onAdd: (item: GuideDayItemInput) => void; map: React.ReactNode;
};

/** Desktop: sticky right panel ~250px. Phone: the page renders it inside a bottom sheet. The page supplies the (lazy-loaded) map. */
export default function MyListsPanel({lists: given, loadLists, loadItems, selectedDayName, onAdd, map}: Props) {
 const {t} = useTranslation();
 const [tab, setTab] = useState<'lists' | 'map'>('lists');
 const [lists, setLists] = useState<PanelList[] | null>(given ?? null);
 const [items, setItems] = useState<Record<string, PanelItem[] | 'loading' | 'failed'>>({});
 const [listId, setListId] = useState(given?.[0]?.id ?? '');
 useEffect(() => {
  if (given) {setLists(given); return;}
  if (!loadLists) {setLists([]); return;}
  const controller = new AbortController();
  loadLists(controller.signal).then((next) => {setLists(next); setListId((id) => id || next[0]?.id || '');}).catch(() => setLists([]));
  return () => controller.abort();
 }, [given, loadLists]);
 const list = lists?.find((l) => l.id === listId);
 const shown = list?.items ?? (list ? items[list.id] : undefined);
 useEffect(() => {
  if (!list || list.items || !loadItems || items[list.id]) return;
  const controller = new AbortController();
  setItems((m) => ({...m, [list.id]: 'loading'}));
  const id = list.id;
  loadItems(list, controller.signal).then((next) => setItems((m) => ({...m, [id]: next})))
   .catch(() => {if (!controller.signal.aborted) setItems((m) => ({...m, [id]: 'failed'}));});
  // An abandoned load (another list picked) clears its marker so picking the list again reloads it.
  return () => {controller.abort(); setItems((m) => {if (m[id] !== 'loading') return m; const rest = {...m}; delete rest[id]; return rest;});};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [list?.id, loadItems]);
 return (
  <aside className="w-full text-white md:sticky md:top-16 md:w-[250px]">
   <div role="tablist" className="mb-2 flex rounded-full border border-white/10 bg-white/5 p-1">
    {(['lists', 'map'] as const).map((k) => (
     <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
      className={`min-h-[40px] flex-1 rounded-full text-sm ${tab === k ? 'bg-white/15 font-semibold' : 'text-gray-300 hover:bg-white/5'}`}>
      {k === 'lists' ? t('dashboard.wp9.myLists', {defaultValue: 'My lists'}) : t('dashboard.wp9.map', {defaultValue: 'Map'})}
     </button>
    ))}
   </div>
   {tab === 'map' ? map : lists === null ? <p aria-busy="true" className="p-2 text-sm text-gray-400">{t('dashboard.wp9.loadingLists', {defaultValue: 'Loading your lists…'})}</p>
    : lists.length === 0 ? <p className="p-2 text-sm text-gray-400">{t('dashboard.wp9.noLists', {defaultValue: 'No lists yet.'})}</p> : (
    <>
     <label className="block text-xs text-gray-400">{t('dashboard.wp9.list', {defaultValue: 'List'})}
      <select value={listId} onChange={(e) => setListId(e.target.value)} className="mt-1 min-h-[44px] w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-sm text-white">
       {lists.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
      </select>
     </label>
     {shown === 'loading' && <p aria-busy="true" className="mt-2 p-2 text-sm text-gray-400">{t('dashboard.wp9.loadingLists', {defaultValue: 'Loading your lists…'})}</p>}
     {shown === 'failed' && <p role="alert" className="mt-2 p-2 text-sm text-gray-400">{t('dashboard.wp9.listItemsFailed', {defaultValue: "Couldn't load this list."})}</p>}
     <ul className="mt-2 space-y-1">
      {list && Array.isArray(shown) && shown.map((it) => (
       <li key={it.recommendationId} draggable className="flex cursor-grab items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5"
        onDragStart={(e) => {e.dataTransfer.setData(NEW_ITEM_DRAG_TYPE, JSON.stringify({recommendationId: it.recommendationId, collectionId: list.id})); e.dataTransfer.effectAllowed = 'copy';}}>
        <span className="min-w-0 flex-1 truncate" title={it.title}>{it.title}</span>
        <button type="button" aria-label={t('dashboard.wp9.addItemToDay', {defaultValue: 'Add {{title}} to {{day}}', title: it.title, day: selectedDayName})}
         onClick={() => onAdd({kind: 'listItem', timeLabel: null, ref: {recommendationId: it.recommendationId, collectionId: list.id}})}
         className="min-h-[44px] min-w-[44px] rounded-full text-gray-300 hover:bg-white/10">+</button>
       </li>
      ))}
     </ul>
    </>
   )}
  </aside>
 );
}
