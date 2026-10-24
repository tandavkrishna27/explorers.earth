import {useTranslation} from 'react-i18next';
import {dayChipLabel} from './dayItems';

export type StripDay = {id: string; items: readonly unknown[]};
type Props = {days: StripDay[]; startDate: string | null; selectedId: string; onSelect: (id: string) => void; /** Omitted for a sample guide (WP11): no "+ Day" chip. */ onAddDay?: () => void;
 onDropItem: (fromSectionId: string, localId: string, toSectionId: string, fromIndex: number) => void};
export const DRAG_TYPE = 'application/x-guide-item';

/** GD-20: sticky chips; tap selects and jumps; "+ Day" appends; drop an item on a chip to append it there (GD-27). */
export default function DayStrip({days, startDate, selectedId, onSelect, onAddDay, onDropItem}: Props) {
 const {t, i18n} = useTranslation();
 return (
  <div className="sticky top-0 z-20 flex gap-2 overflow-x-auto border-b border-white/10 bg-slate-900/95 px-4 py-2 backdrop-blur" role="tablist" aria-label={t('dashboard.wp9.days', {defaultValue: 'Days'})}>
   {days.map((day, index) => (
    <button key={day.id} type="button" role="tab" aria-selected={day.id === selectedId}
     onClick={() => {onSelect(day.id); document.getElementById(`guide-day-${day.id}`)?.scrollIntoView({behavior: 'smooth', block: 'start'});}}
     onDragOver={(e) => e.preventDefault()}
     onDrop={(e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData('text/plain');
      try {const {sectionId, localId, index: fromIndex} = JSON.parse(raw); if (sectionId && localId) onDropItem(sectionId, localId, day.id, fromIndex);} catch {/* not a guide item */}
     }}
     className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-4 text-sm ${day.id === selectedId ? 'bg-blue-400 text-gray-900' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}>
     {dayChipLabel(index, startDate, i18n.language)}
    </button>
   ))}
   {onAddDay && <button type="button" onClick={onAddDay} className="min-h-[44px] shrink-0 rounded-full border border-dashed border-white/20 px-4 text-sm text-gray-300 hover:bg-white/10">
    {t('dashboard.wp9.addDayChip', {defaultValue: '+ Day'})}
   </button>}
  </div>
 );
}
