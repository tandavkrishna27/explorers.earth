import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useLocation, useNavigate} from 'react-router-dom';
import type {GuideDayItem, GuideTimeLabel} from '../../../../../tunes/shared/explorersGuideContract';
import {categoryPath, listPath} from '../../../lib/navigation/categoryRoutes';
import TimeLabelChip from './TimeLabelChip';
import {DRAG_TYPE} from './DayStrip';
import {NEW_ITEM_DRAG_TYPE} from './MyListsPanel';
import {dayChipLabel, groupByTimeLabel, itemSourceText, itemTitle} from './dayItems';

export type PlanDay = {id: string; title: string; items: GuideDayItem[]};
type Origin = {fromIndex: number};
export type DayListActions = {
 onMoveItem: (fromSectionId: string, localId: string, toSectionId: string, toIndex: number, origin: Origin) => void;
 onSetTimeLabel: (sectionId: string, localId: string, label: GuideTimeLabel | null) => void;
 onRemoveItem: (sectionId: string, localId: string, origin: {index: number; item: GuideDayItem}) => void;
 onEditNote: (sectionId: string, localId: string, text: string) => void;
 onOpenAdd: (sectionId: string) => void;
 onInsertDay: (at: number) => void; onDuplicateDay: (sectionId: string) => void; onClearDay: (sectionId: string) => void;
 onDeleteDay: (sectionId: string) => void; onMoveDay: (sectionId: string, toIndex: number, fromIndex: number) => void;
};
export type NewItemRef = {recommendationId: string; collectionId: string | null};
type Props = DayListActions & {days: PlanDay[]; startDate: string | null; addBox?: (sectionId: string) => React.ReactNode;
 /** A saved item dragged in from My lists; the page maps it to addItem(sectionId, {kind:'listItem', timeLabel:null, ref}, toIndex). */
 onDropNew?: (sectionId: string, toIndex: number, ref: NewItemRef) => void};

const menuPanel = 'absolute right-0 z-30 rounded-lg border border-white/10 bg-slate-800 p-1 text-white shadow-lg';

export default function DayList({days, startDate, addBox, onDropNew, ...a}: Props) {
 return <div className="space-y-6">{days.map((day, index) => <DayCard key={day.id} day={day} index={index} days={days} startDate={startDate} addBox={addBox} onDropNew={onDropNew} {...a} />)}</div>;
}

function DayCard({day, index, days, startDate, addBox, onDropNew, ...a}: DayListActions & {day: PlanDay; index: number; days: PlanDay[]; startDate: string | null; addBox?: Props['addBox']; onDropNew?: Props['onDropNew']}) {
 const {t, i18n} = useTranslation();
 const [menu, setMenu] = useState(false);
 const name = dayChipLabel(index, startDate, i18n.language);
 const {headed, groups} = groupByTimeLabel(day.items);
 let position = -1;
 const dropAt = (toIndex: number) => (e: React.DragEvent) => {
  e.preventDefault(); e.stopPropagation();
  const fresh = e.dataTransfer.getData(NEW_ITEM_DRAG_TYPE);
  if (fresh) {
   try {const ref = JSON.parse(fresh); if (typeof ref.recommendationId === 'string') onDropNew?.(day.id, toIndex, {recommendationId: ref.recommendationId, collectionId: typeof ref.collectionId === 'string' ? ref.collectionId : null});} catch {/* ignore */}
   return;
  }
  const raw = e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData('text/plain');
  try {
   const src = JSON.parse(raw);
   if (!src.localId) return;
   // toIndex is "before row toIndex" of the list as shown; the server inserts after removing the item, so below it that is one less.
   const sameDay = src.sectionId === day.id && typeof src.index === 'number';
   const target = sameDay && toIndex > src.index ? toIndex - 1 : toIndex;
   if (sameDay && target === src.index) return;
   a.onMoveItem(src.sectionId, src.localId, day.id, target, {fromIndex: src.index});
  } catch {/* ignore */}
 };
 const item = (it: GuideDayItem) => {
  position += 1;
  const at = position;
  return <ItemRow key={it.localId} item={it} index={at} day={day} days={days} startDate={startDate} onDrop={dropAt(at)} {...a} />;
 };
 return (
  <section id={`guide-day-${day.id}`} aria-label={name} className="rounded-xl border border-white/10 bg-white/5 p-4 text-white"
   onDragOver={(e) => e.preventDefault()} onDrop={dropAt(day.items.length)}>
   <header className="mb-3 flex items-center gap-2">
    <span aria-hidden className="cursor-grab text-gray-400">⠿</span>
    <h3 className="font-semibold">{name}</h3>
    {day.title && <span className="truncate text-gray-400" title={day.title}>{day.title}</span>}
    <span className="relative ml-auto">
     <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label={t('dashboard.wp9.dayOptions', {defaultValue: '{{day}} options', day: name})}
      onClick={() => setMenu((v) => !v)} className="min-h-[44px] min-w-[44px] rounded text-gray-300 hover:bg-white/10">⋯</button>
     {menu && (
      <div role="menu" className={`${menuPanel} w-52`} onClick={() => setMenu(false)}>
       <MenuItem onClick={() => a.onInsertDay(index)}>{t('dashboard.wp9.insertBefore', {defaultValue: 'Insert day before'})}</MenuItem>
       <MenuItem onClick={() => a.onInsertDay(index + 1)}>{t('dashboard.wp9.insertAfter', {defaultValue: 'Insert day after'})}</MenuItem>
       <MenuItem disabled={index === 0} onClick={() => a.onMoveDay(day.id, index - 1, index)}>{t('dashboard.wp9.moveEarlier', {defaultValue: 'Move earlier'})}</MenuItem>
       <MenuItem disabled={index === days.length - 1} onClick={() => a.onMoveDay(day.id, index + 1, index)}>{t('dashboard.wp9.moveLater', {defaultValue: 'Move later'})}</MenuItem>
       <MenuItem onClick={() => a.onDuplicateDay(day.id)}>{t('dashboard.wp9.duplicateDay', {defaultValue: 'Duplicate day'})}</MenuItem>
       <MenuItem disabled={day.items.length === 0} onClick={() => a.onClearDay(day.id)}>{t('dashboard.wp9.clearDay', {defaultValue: 'Clear day'})}</MenuItem>
       <MenuItem disabled={days.length <= 1} onClick={() => a.onDeleteDay(day.id)}>{t('dashboard.wp9.deleteDay', {defaultValue: 'Delete day'})}</MenuItem>
      </div>
     )}
    </span>
   </header>
   {groups.map((group, g) => (
    <div key={g}>
     {group.heading && <h4 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{group.heading}</h4>}
     <ol className={headed ? 'space-y-1' : 'list-decimal space-y-1 pl-5 marker:text-gray-400'}>{group.items.map(item)}</ol>
    </div>
   ))}
   {addBox?.(day.id) ?? (
    <button type="button" onClick={() => a.onOpenAdd(day.id)} className="mt-3 hidden min-h-[44px] w-full rounded-lg border border-dashed border-white/20 text-sm text-gray-300 hover:bg-white/10 md:block">
     {t('dashboard.wp9.addToDay', {defaultValue: '+ Add to {{day}}', day: name})}
    </button>
   )}
  </section>
 );
}

function ItemRow({item, index, day, days, startDate, onDrop, ...a}: DayListActions & {item: GuideDayItem; index: number; day: PlanDay; days: PlanDay[]; startDate: string | null; onDrop: (e: React.DragEvent) => void}) {
 const {t, i18n} = useTranslation();
 const [menu, setMenu] = useState<'closed' | 'main' | 'days'>('closed');
 const [held, setHeld] = useState<number | null>(null);
 const title = itemTitle(item);
 return (
  <li draggable onDragStart={(e) => {const v = JSON.stringify({sectionId: day.id, localId: item.localId, index}); e.dataTransfer.setData(DRAG_TYPE, v); e.dataTransfer.setData('text/plain', v); e.dataTransfer.effectAllowed = 'move';}}
   onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
   className={`flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5 ${held !== null ? 'ring-2 ring-blue-400' : ''}`}>
   <button type="button" aria-label={t('dashboard.wp9.reorder', {defaultValue: 'Reorder {{title}}', title})} aria-pressed={held !== null}
    className="min-h-[44px] min-w-[32px] cursor-grab text-gray-400"
    onKeyDown={(e) => {
     if (e.key === ' ') {e.preventDefault(); if (held === null) setHeld(index); else {if (held !== index) a.onMoveItem(day.id, item.localId, day.id, held, {fromIndex: index}); setHeld(null);}}
     else if (held !== null && e.key === 'ArrowDown') {e.preventDefault(); setHeld(Math.min(held + 1, day.items.length - 1));}
     else if (held !== null && e.key === 'ArrowUp') {e.preventDefault(); setHeld(Math.max(held - 1, 0));}
     else if (e.key === 'Escape') setHeld(null);
    }}>⠿</button>
   <span className="min-w-0 flex-1 truncate" title={title}>{title}</span>
   <TimeLabelChip value={item.timeLabel} onChange={(label) => a.onSetTimeLabel(day.id, item.localId, label)} />
   <span className="hidden rounded bg-white/10 px-2 py-0.5 text-xs text-gray-300 sm:inline">{itemSourceText(item)}</span>
   <span className="relative">
    <button type="button" aria-haspopup="menu" aria-label={t('dashboard.wp9.itemActions', {defaultValue: 'Actions for {{title}}', title})}
     onClick={() => setMenu((m) => (m === 'closed' ? 'main' : 'closed'))} className="min-h-[44px] min-w-[44px] rounded text-gray-300 hover:bg-white/10">⋯</button>
    {menu === 'main' && (
     <div role="menu" className={`${menuPanel} w-48`}>
      <MenuItem onClick={() => setMenu('days')}>{t('dashboard.wp9.moveToDay', {defaultValue: 'Move to day…'})}</MenuItem>
      {item.kind === 'note' && <MenuItem onClick={() => {setMenu('closed'); const next = window.prompt(t('dashboard.wp9.editNote', {defaultValue: 'Edit note'}), item.text); if (next && next.trim()) a.onEditNote(day.id, item.localId, next.trim());}}>{t('dashboard.wp9.editNote', {defaultValue: 'Edit note'})}</MenuItem>}
      {item.kind === 'listItem' && <OpenSourceItem source={item.ref} onDone={() => setMenu('closed')} />}
      <MenuItem onClick={() => {setMenu('closed'); a.onRemoveItem(day.id, item.localId, {index, item});}}>{t('dashboard.wp9.removeItem', {defaultValue: 'Remove from guide'})}</MenuItem>
     </div>
    )}
    {menu === 'days' && (
     <div role="menu" className={`${menuPanel} w-48`}>
      {days.map((target, i) => target.id === day.id ? null : (
       <MenuItem key={target.id} onClick={() => {setMenu('closed'); a.onMoveItem(day.id, item.localId, target.id, target.items.length, {fromIndex: index});}}>
        {dayChipLabel(i, startDate, i18n.language)}
       </MenuItem>
      ))}
     </div>
    )}
   </span>
  </li>
 );
}

type ListItemRef = Extract<GuideDayItem, {kind: 'listItem'}>['ref'];
/** Opens the list the item lives in, keeping the guide as the Back origin (WP1). Places has no list route, so it opens the category. */
function OpenSourceItem({source, onDone}: {source: ListItemRef; onDone: () => void}) {
 const {t} = useTranslation();
 const navigate = useNavigate();
 const location = useLocation();
 const target = source.category === 'places' ? '/recommendations/places'
  : source.collectionId ? listPath(source.category, source.collectionId) : categoryPath(source.category);
 return <MenuItem onClick={() => {onDone(); navigate(target, {state: {from: location}});}}>{t('dashboard.wp9.openSource', {defaultValue: 'Open source item'})}</MenuItem>;
}

function MenuItem({children, onClick, disabled}: {children: React.ReactNode; onClick: () => void; disabled?: boolean}) {
 return <button type="button" role="menuitem" disabled={disabled} onClick={onClick}
  className="block min-h-[44px] w-full rounded px-2 text-left text-sm hover:bg-white/10 disabled:opacity-40">{children}</button>;
}
