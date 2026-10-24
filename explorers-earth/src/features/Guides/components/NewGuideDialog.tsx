import {useState} from 'react';
import {createPortal} from 'react-dom';
import {useNavigate, useLocation} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {createTripGuide} from '../api/guideCreation';

type Props = {open: boolean; onOpenChange: (open: boolean) => void; defaultTitle?: string};
/** The form unmounts while closed, so every open starts from empty fields and the current defaultTitle. */
export default function NewGuideDialog({open, ...rest}: Props) {
 return open ? <NewGuideForm {...rest} /> : null;
}

function NewGuideForm({onOpenChange, defaultTitle = ''}: Omit<Props, 'open'>) {
 const {t} = useTranslation();
 const navigate = useNavigate();
 const location = useLocation();
 const [title, setTitle] = useState(defaultTitle);
 const [destination, setDestination] = useState('');
 const [days, setDays] = useState('2');
 const [startDate, setStartDate] = useState('');
 const [tagDraft, setTagDraft] = useState('');
 const [tags, setTags] = useState<string[]>([]);
 const [saving, setSaving] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const dayCount = Number(days);
 const valid = title.trim().length > 0 && title.trim().length <= 200 && Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 60;
 const submit = async () => {
  setSaving(true); setError(null);
  try {
   const place = destination.trim();
   const {collectionId} = await createTripGuide({title: title.trim(), days: dayCount, startDate: startDate || null, tags,
    destination: place ? {name: place, address: null, placeId: null, lat: null, lng: null} : null}, undefined);
   onOpenChange(false);
   navigate(`/recommendations/guides/${collectionId}`, {state: {from: location}});
  } catch {
   setError(t('dashboard.wp9.createFailed', {defaultValue: "Couldn't create the guide. Try again."}));
  } finally {setSaving(false);}
 };
 // Portalled to <body>: a transformed page ancestor would otherwise pin this "fixed" overlay off-centre.
 return createPortal(
  <div role="dialog" aria-modal="true" aria-labelledby="new-guide-title" className="dashboard-theme fixed inset-0 z-[60] flex items-end justify-center bg-dashboard-overlay md:items-center"
   onKeyDown={(e) => {if (e.key === 'Escape') onOpenChange(false);}}>
   <form className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-dashboard bg-dashboard-modal p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-dashboard md:rounded-2xl [&_input:not([type=radio])]:border-dashboard [&_input:not([type=radio])]:bg-transparent [&_input]:text-dashboard" onSubmit={(e) => {e.preventDefault(); if (valid && !saving) void submit();}}>
    <h2 id="new-guide-title" className="text-lg font-semibold">{t('dashboard.wp9.newGuide', {defaultValue: 'New guide'})}</h2>
    <fieldset className="mt-3 flex gap-2">
     <legend className="sr-only">{t('dashboard.wp9.template', {defaultValue: 'Template'})}</legend>
     <label className="flex items-center gap-2"><input type="radio" name="template" defaultChecked /> {t('dashboard.wp9.trip', {defaultValue: 'Trip'})}</label>
     <label className="flex items-center gap-2 text-gray-400"><input type="radio" name="template" disabled /> {t('dashboard.wp9.topicLater', {defaultValue: 'Topic guide (Later)'})}</label>
    </fieldset>
    <label className="mt-3 block text-sm">{t('dashboard.wp9.title', {defaultValue: 'Title'})}
     <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="mt-1 w-full rounded border px-3 py-2" /></label>
    {/* WP6 PlaceSearchField does not exist yet: Destination is plain text written to NewTrip.destination.name. */}
    <label className="mt-3 block text-sm">{t('dashboard.wp9.destination', {defaultValue: 'Destination (optional)'})}
     <input value={destination} onChange={(e) => setDestination(e.target.value)} maxLength={200} className="mt-1 w-full rounded border px-3 py-2" /></label>
    <div className="mt-3 grid grid-cols-2 gap-3">
     <label className="block text-sm">{t('dashboard.wp9.daysLabel', {defaultValue: 'Days'})}
      <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" /></label>
     <label className="block text-sm">{t('dashboard.wp9.startDate', {defaultValue: 'Start date (optional)'})}
      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" /></label>
    </div>
    <label className="mt-3 block text-sm">{t('dashboard.wp9.tags', {defaultValue: 'Tags (optional)'})}
     <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)}
      onKeyDown={(e) => {if (e.key === 'Enter' && tagDraft.trim()) {e.preventDefault(); setTags((v) => [...new Set([...v, tagDraft.trim()])].slice(0, 50)); setTagDraft('');}}}
      className="mt-1 w-full rounded border px-3 py-2" /></label>
    <div className="mt-2 flex flex-wrap gap-1">{tags.map((tag) => (
     <button key={tag} type="button" onClick={() => setTags((v) => v.filter((x) => x !== tag))} className="rounded-full border border-dashboard px-2 py-1 text-xs">{tag} ×</button>
    ))}</div>
    <p className="mt-3 text-sm text-dashboard-muted">{t('dashboard.wp9.startsDraft', {defaultValue: 'Starts as a draft only you can see'})}</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    <div className="mt-4 flex justify-end gap-2">
     <button type="button" onClick={() => onOpenChange(false)} className="min-h-[44px] px-4">{t('dashboard.wp9.cancel', {defaultValue: 'Cancel'})}</button>
     <button type="submit" disabled={!valid || saving} className="min-h-[44px] rounded-lg bg-blue-600 px-4 text-white disabled:opacity-40">
      {saving ? '…' : t('dashboard.wp9.createGuide', {defaultValue: 'Create guide'})}</button>
    </div>
   </form>
  </div>,
  document.body,
 );
}
