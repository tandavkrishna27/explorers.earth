import {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {GUIDE_TIME_LABELS, normalizeTimeLabel, type GuideTimeLabel} from '../../../../../tunes/shared/explorersGuideContract';
import {timeLabelText} from './dayItems';

type Props = {value: GuideTimeLabel | null; onChange: (value: GuideTimeLabel | null) => void};

/** GD-23: "+ time" when unset, "🕒 Morning" when set; four words, an exact time, or clear. */
export default function TimeLabelChip({value, onChange}: Props) {
 const {t} = useTranslation();
 const [open, setOpen] = useState(false);
 const [draft, setDraft] = useState('');
 const [problem, setProblem] = useState<string | null>(null);
 const trigger = useRef<HTMLButtonElement>(null);
 const close = () => {setOpen(false); setProblem(null); setDraft(''); trigger.current?.focus();};
 useEffect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {if (e.key === 'Escape') close();};
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
 }, [open]);
 const pick = (next: GuideTimeLabel | null) => {onChange(next); close();};
 return (
  <span className="relative inline-flex">
   <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
    className="min-h-[44px] rounded-full border border-dashed border-white/20 px-3 text-xs text-gray-300 hover:bg-white/10">
    {value === null ? t('dashboard.wp9.addTime', {defaultValue: '+ time'}) : `🕒 ${timeLabelText(value)}`}
   </button>
   {open && (
    <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-white/10 bg-slate-800 p-2 text-white shadow-lg">
     {GUIDE_TIME_LABELS.map((label) => (
      <button key={label} type="button" role="menuitemradio" aria-checked={value === label} onClick={() => pick(label)}
       className="block min-h-[44px] w-full rounded px-2 text-left text-sm hover:bg-white/10">{timeLabelText(label)}</button>
     ))}
     <label className="mt-1 block text-xs text-gray-400">
      {t('dashboard.wp9.exactTime', {defaultValue: 'Exact time'})}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} inputMode="numeric" placeholder="9:30"
       onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const next = normalizeTimeLabel(draft);
        if (next === null) setProblem(t('dashboard.wp9.badTime', {defaultValue: 'Use a time like 9:30'})); else pick(next);
       }}
       className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
     </label>
     {problem && <p role="alert" className="mt-1 text-xs text-red-300">{problem}</p>}
     {value !== null && (
      <button type="button" role="menuitem" onClick={() => pick(null)} className="mt-1 block min-h-[44px] w-full rounded px-2 text-left text-sm text-red-300 hover:bg-red-500/10">
       {t('dashboard.wp9.clearTime', {defaultValue: 'Clear time'})}
      </button>
     )}
    </div>
   )}
  </span>
 );
}
