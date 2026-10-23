import {useTranslation} from 'react-i18next';
export type PlanSection = 'itinerary' | 'stay' | 'transport' | 'budget' | 'tips';
const ORDER: PlanSection[] = ['stay', 'transport', 'budget', 'tips'];
const NAMES: Record<PlanSection, string> = {itinerary: 'Itinerary', stay: 'Stay', transport: 'Transport', budget: 'Budget', tips: 'Tips'};
export default function PlanChips({filled, active, onSelect}: {filled: Record<Exclude<PlanSection, 'itinerary'>, boolean>; active: PlanSection; onSelect: (s: PlanSection) => void}) {
 const {t} = useTranslation();
 const chip = (s: PlanSection, label: string) => (
  <button key={s} type="button" role="tab" aria-selected={active === s} onClick={() => onSelect(s)}
   className={`min-h-[40px] rounded-full px-4 text-sm ${active === s ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>{label}</button>);
 return (
  <div role="tablist" aria-label={t('dashboard.wp9.planSections', {defaultValue: 'Plan sections'})} className="flex flex-wrap gap-2">
   {chip('itinerary', t('dashboard.wp9.itinerary', {defaultValue: 'Itinerary'}))}
   {ORDER.map((s) => chip(s, filled[s as Exclude<PlanSection, 'itinerary'>] ? NAMES[s] : `+ ${NAMES[s]}`))}
  </div>
 );
}
