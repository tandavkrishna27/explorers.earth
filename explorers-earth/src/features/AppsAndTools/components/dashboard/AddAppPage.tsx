import { useEffect, useRef, useState } from 'react';
import { friendlyErrorMessage, urlFieldError } from "../../../../utils/friendlyError";
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';
import useAuthStore from '../../../../store/store';
import type { RecommendationObservation } from '../../../../lib/explorersApiClient';
import { AppsClient, type ManualAppIntent } from '../../api/appsClient';
import { useAppsCommands } from '../../api/query';
import { invalidateApps, useAppsOwner } from '../../hooks/useAppsOwner';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import TiptapEditor from '../../../Favorites/components/TiptapEditor';
import AppEnrichmentPanel from './AppEnrichmentPanel';

const PRICE_TIERS = ['Free', 'Freemium', 'Paid', 'Subscription'] as const;
const ALL_PLATFORMS = ['iOS', 'iPadOS', 'macOS', 'Android', 'Windows', 'Web', 'Linux', 'Chrome Extension'];
type PriceTier = (typeof PRICE_TIERS)[number];

/**
 * Ticket 4.3. Native Apps add/edit page.
 *
 * Three things the Strapi version did are gone rather than ported:
 *
 *  - The paste-a-URL enrichment step posted to /api/apps/scrape-url, which no longer
 *    exists - a containment test now asserts that path stays absent. Apps has no provider
 *    at all, so the URL is simply a field the owner fills, and the form says as much
 *    instead of calling a dead endpoint and discarding the draft on failure.
 *  - Screenshots uploaded to the Strapi /upload with a bearer token. They are owner media
 *    now, uploaded through the native media route and held in ordered slots.
 *  - The app-category selector read a Strapi taxonomy with no canonical replacement.
 *    Taxonomy is out of this ticket's scope and the projection serves app_category as
 *    null, so offering a picker would have written a value nothing reads.
 *
 * The app URL is the shared entity's identity and is excluded from the override
 * vocabulary, so editing an existing recommendation cannot change it - one owner must not
 * be able to re-point an app every other owner also recommends.
 */
export default function AddAppPage() {
 const { listId, appId } = useParams<{ listId: string; appId?: string }>();
 const location = useLocation(), navigate = useNavigate();
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId);
 const scope = JSON.stringify([generation, accountId, location.pathname, listId, appId]);
 const currentScope = useRef(scope); currentScope.current = scope;
 const active = useRef(0), controller = useRef<AbortController>();
 const owner = useAppsOwner(undefined, true), commands = useAppsCommands();

 const [existingId, setExistingId] = useState('');
 const existingApps = [...new Map((owner.content?.view.lists.flatMap(list => list.recommended_apps) ?? []).filter(app => !owner.content?.view.lists.find(list => list.documentId === listId)?.recommended_apps.some(member => member.documentId === app.documentId)).map(app => [app.documentId, app])).values()];

 const [title, setTitle] = useState(''), [appUrl, setAppUrl] = useState('');
 const [developer, setDeveloper] = useState(''), [logoUrl, setLogoUrl] = useState('');
 const [description, setDescription] = useState(''), [downloadUrl, setDownloadUrl] = useState('');
 const [priceTier, setPriceTier] = useState<PriceTier | ''>('Freemium');
 const [platforms, setPlatforms] = useState<string[]>([]);
 const [note, setNote] = useState(''), [rating, setRating] = useState<number | null>(null);
 const [screenshots, setScreenshots] = useState<{ id: string; url: string }[]>([]), [pending, setPending] = useState(0);
 const [saving, setSaving] = useState(false), [error, setError] = useState('');
 const [enrichmentBusy, setEnrichmentBusy] = useState(false);
 useEffect(() => { setEnrichmentBusy(false); }, [scope]);
 const initialized = useRef(''), draftObservation = useRef<RecommendationObservation>();
 const savedDraft = useRef<{scope:string;signature:string}>();
 // Quill's empty document can be emitted during StrictMode initialization.
 // Compare that exact empty representation without changing the saved payload.
 const noteSignature=(value:string)=>value==='<p></p>'||value==='<p><br></p>'?'':value;
 const draftSignature=(values:unknown[])=>JSON.stringify(values);
 const manualDirty=Boolean(appId&&savedDraft.current?.scope===scope&&savedDraft.current.signature!==draftSignature([title,developer,logoUrl,description,downloadUrl,priceTier,platforms,noteSignature(note),rating,screenshots.map(item=>item.id)]));
 const intent = useRef<{ scope: string; signature: string; value: ManualAppIntent }>();
 const updateKey = useRef<{ signature: string; key: string }>();
 const mounted = useRef(true);

 useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); active.current++; }; }, []);
 useEffect(() => { controller.current?.abort(); active.current++; initialized.current = ''; savedDraft.current=undefined; intent.current = undefined; updateKey.current = undefined; draftObservation.current = undefined; setTitle(''); setAppUrl(''); setDeveloper(''); setLogoUrl(''); setDescription(''); setDownloadUrl(''); setPriceTier('Freemium'); setPlatforms([]); setNote(''); setRating(null); setScreenshots([]); setPending(0); setSaving(false); setError(''); setExistingId(''); }, [scope]);

 useEffect(() => {
  if (!appId || !owner.content || initialized.current === scope) return;
  const app = owner.content.view.lists.find(list => list.documentId === listId)?.recommended_apps.find(row => row.documentId === appId);
  const observed = owner.content.details.get(appId);
  if (!app || !observed) return;
  initialized.current = scope; draftObservation.current = observed;
  savedDraft.current={scope,signature:draftSignature([app.title,app.developer??'',app.logo_url??'',app.description??'',app.download_url??'',app.price_tier??'',app.platforms??[],noteSignature(typeof app.user_recommendation_note==='string'?app.user_recommendation_note:''),app.user_rating,(observed.detail.category==='apps'?observed.detail.appScreenshots?.screenshotMediaIds??[]:[])])};
  setTitle(app.title); setAppUrl(app.app_url); setDeveloper(app.developer ?? ''); setLogoUrl(app.logo_url ?? '');
  setDescription(app.description ?? ''); setDownloadUrl(app.download_url ?? '');
  setPriceTier(app.price_tier ?? ''); setPlatforms(app.platforms ?? []);
  setNote(typeof app.user_recommendation_note === 'string' ? app.user_recommendation_note : '');
  setRating(app.user_rating);
  setScreenshots((observed.detail.category === 'apps' ? observed.detail.appScreenshots?.screenshotMediaIds ?? [] : []).map(id => ({ id, url: `/api/explorers/v1/media/${id}/content` })));
 }, [owner.content, scope, appId, listId]);

 const valid = (captured: string, operation?: number) => mounted.current && currentScope.current === captured && (operation === undefined || active.current === operation);
 const assertCurrent = (captured: string, operation: number) => { if (!valid(captured, operation) || controller.current?.signal.aborted) throw new Error('App owner or route changed'); };

 const togglePlatform = (platform: string) => setPlatforms(value => value.includes(platform) ? value.filter(item => item !== platform) : [...value, platform]);
 const blank = (value: string) => { const trimmed = value.trim(); return trimmed === '' ? null : trimmed; };

 const attachExisting = async () => {
  const captured = scope;
  try { await commands.membership(existingId, listId!, true); if (valid(captured)) navigate(`/recommendations/apps/${listId}`); }
  catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'App could not be added')); }
 };

 const upload = async (files: File[]) => {
  const captured = scope; setPending(value => value + files.length); setError('');
  for (const file of files) {
   if (!valid(captured)) return;
   // Ten ordered slots is the storage bound, so the form refuses the eleventh rather
   // than uploading bytes the save would then reject.
   if (screenshots.length >= 10) { if (valid(captured)) { setError('Up to ten screenshots.'); setPending(value => value - 1); } continue; }
   try { const result = await AppsClient.upload(file, crypto.randomUUID()); if (!valid(captured)) return; setScreenshots(value => [...value, { id: result.id, url: `/api/explorers/v1/media/${result.id}/content` }]); }
   catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'Upload failed')); }
   finally { if (valid(captured)) setPending(value => value - 1); }
  }
 };

 const urlErrors = { appUrl: urlFieldError(appUrl), logoUrl: urlFieldError(logoUrl), downloadUrl: urlFieldError(downloadUrl) };
 const hasUrlError = Object.values(urlErrors).some(Boolean);
 const save = async () => {
  if (hasUrlError || !listId || pending || saving || enrichmentBusy || !title.trim() || !appUrl.trim() || (appId && initialized.current !== scope)) return;
  const captured = scope, operation = ++active.current; controller.current?.abort(); controller.current = new AbortController(); const signal = controller.current.signal;
  setSaving(true); setError('');
  try {
   const facts = { developer: blank(developer), logoUrl: blank(logoUrl), description: blank(description), downloadUrl: blank(downloadUrl), priceTier: priceTier === '' ? null : priceTier, platforms };
   const screenshotMediaIds = screenshots.map(item => item.id);
   const draft = { title: title.trim(), appUrl: appUrl.trim(), ...facts, note: richNoteFromEditor(note), userRating: rating, mediaIds: [], screenshotMediaIds };
   const signature = JSON.stringify(draft);
   assertCurrent(captured, operation);
   if (appId) {
    const observed = owner.content?.details.get(appId);
    if (!observed || draftObservation.current !== observed) throw new Error('Reload the app before saving');
    if (updateKey.current?.signature !== signature) updateKey.current = { signature, key: crypto.randomUUID() };
    assertCurrent(captured, operation);
    // appUrl is absent here on purpose: it is not in the override vocabulary.
    await AppsClient.updateRecommendation(observed, { displayOverrides: { title: draft.title, ...facts }, note: draft.note, userRating: rating, appScreenshots: { screenshotMediaIds } }, updateKey.current.key, signal);
    assertCurrent(captured, operation);
   } else {
    if (intent.current?.scope !== captured || intent.current.signature !== signature) {
     const parent = await AppsClient.observeCollection(listId, signal); assertCurrent(captured, operation);
     intent.current = { scope: captured, signature, value: AppsClient.prepareManualIntent(parent, draft) };
    }
    assertCurrent(captured, operation); await AppsClient.createManual(intent.current.value, signal); assertCurrent(captured, operation);
   }
   invalidateApps(); toast.success('App saved'); navigate(`/recommendations/apps/${listId}`, { state: { justAddedRecommendation: true } });
  } catch (failure) { if (valid(captured, operation)) setError(friendlyErrorMessage(failure, 'App could not be saved')); }
  finally { if (valid(captured, operation)) setSaving(false); }
 };

 // Edit controls require the actual complete owner observation. A loaded draft stays
 // owned by its original observation across refreshes and never rebases.
 if (appId && initialized.current !== scope) {
  return <div className="min-h-screen text-dashboard p-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
   <button aria-label="Back to app list" onClick={() => navigate(`/recommendations/apps/${listId}`)}><ArrowLeft size={20} /></button>
   <h1 className="font-semibold">Edit App</h1>
   {owner.loading ? <p role="status">Loading app…</p> : <div role="alert"><p>{owner.error?.message || 'App could not be loaded. Refresh before editing.'}</p><button onClick={owner.refetch}>Retry loading app</button></div>}
  </div>;
 }

 return <div className="min-h-screen text-dashboard">
  <header className="border-b border-dashboard-border px-4 md:px-6 py-3 flex items-center gap-3">
   <button aria-label="Back to app list" onClick={() => navigate(`/recommendations/apps/${listId}`)}><ArrowLeft size={20} /></button>
   <h1 className="font-semibold">{appId ? 'Edit App' : 'Add App'}</h1>
  </header>
  <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
   {!appId && existingApps.length > 0 && <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-3">
    <label className="block">Existing app
     <select value={existingId} onChange={event => setExistingId(event.target.value)} disabled={commands.loading} className="block w-full bg-dashboard-muted rounded-xl p-3">
      <option value="">Select an app</option>
      {existingApps.map(app => <option key={app.documentId} value={app.documentId}>{app.title}</option>)}
     </select>
    </label>
    <button disabled={!existingId || commands.loading} onClick={attachExisting}>Add existing app to this list</button>
   </section>}

   {appId && initialized.current === scope && draftObservation.current && <AppEnrichmentPanel key={scope} observed={draftObservation.current} disabled={saving || pending > 0} manualDirty={manualDirty} onBusyChange={setEnrichmentBusy} onReload={() => window.location.reload()} onAccepted={() => { invalidateApps(); toast.success('Selected app details accepted'); navigate(`/recommendations/apps/${listId}`); }} />}
   <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-5">
    <h2 className="font-semibold flex gap-2"><Smartphone size={18} />{appId ? 'My App' : 'Add manually'}</h2>
    {appId && owner.loading && <p role="status">Loading app…</p>}
    {owner.error && <p role="alert">{owner.error.message}</p>}

    <label className="block">App title<input value={title} onChange={event => setTitle(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    {/* The asterisk is drawn by CSS so the field's accessible name stays "App URL". */}
    <label className="block"><span className="after:content-['_*'] after:text-red-500">App URL</span>
     <input value={appUrl} onChange={event => setAppUrl(event.target.value)} disabled={saving || Boolean(appId)} required aria-required="true" aria-describedby={appId ? undefined : 'app-url-required'} placeholder="https://example.com/app" className="block w-full bg-dashboard-muted rounded-xl p-3" />
    </label>
    {urlErrors.appUrl && <p role="alert" className="text-sm text-red-400">{urlErrors.appUrl}</p>}
    {!appId && <p id="app-url-required" className="text-xs text-dashboard-muted">Required: Save stays off until the app's link is added (its website or store page).</p>}
    {appId
     ? <p className="text-sm text-dashboard-muted">The app URL identifies the app itself and is shared with everyone who recommends it, so it cannot be changed here.</p>
     : <p className="text-sm text-dashboard-muted">Details are not fetched automatically. Fill in whatever you know; nothing you type is discarded.</p>}

    <label className="block">Developer<input value={developer} onChange={event => setDeveloper(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    <label className="block">Logo URL<input value={logoUrl} onChange={event => setLogoUrl(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    {urlErrors.logoUrl && <p role="alert" className="text-sm text-red-400">{urlErrors.logoUrl}</p>}
    <label className="block">Download URL<input value={downloadUrl} onChange={event => setDownloadUrl(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    {urlErrors.downloadUrl && <p role="alert" className="text-sm text-red-400">{urlErrors.downloadUrl}</p>}
    <label className="block">Description<textarea value={description} onChange={event => setDescription(event.target.value)} disabled={saving} rows={3} className="block w-full bg-dashboard-muted rounded-xl p-3 resize-none" /></label>

    <fieldset><legend>Price</legend>
     <div className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={priceTier === ''} disabled={saving} onClick={() => setPriceTier('')} className="px-3 py-1.5 rounded-lg border border-white/10 text-sm">Not stated</button>
      {PRICE_TIERS.map(tier => <button key={tier} type="button" aria-pressed={priceTier === tier} disabled={saving} onClick={() => setPriceTier(tier)} className="px-3 py-1.5 rounded-lg border border-white/10 text-sm">{tier}</button>)}
     </div>
    </fieldset>

    <fieldset><legend>Platforms</legend>
     <div className="flex flex-wrap gap-2">
      {ALL_PLATFORMS.map(platform => <button key={platform} type="button" aria-pressed={platforms.includes(platform)} disabled={saving} onClick={() => togglePlatform(platform)} className="px-3 py-1.5 rounded-lg border border-white/10 text-sm">{platform}</button>)}
     </div>
    </fieldset>

    <label className="block">Your rating
     <select aria-label="Your rating" value={rating ?? ''} onChange={event => setRating(event.target.value ? Number(event.target.value) : null)} disabled={saving} className="block bg-dashboard-muted p-2">
      <option value="">No rating</option>
      {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
     </select>
    </label>

    <div><h3>My Thoughts</h3><TiptapEditor value={note} onChange={setNote} placeholder="Why do you recommend this app?" /></div>

    <label className="block">Screenshots<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={saving || pending > 0} onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
    {pending > 0 && <p role="status">Uploading screenshots…</p>}
    <div className="flex flex-wrap gap-3">{screenshots.map(item => <div key={item.id}>
     <img className="w-24 h-24 object-cover rounded" src={item.url} alt="App screenshot" />
     <button aria-label="Remove screenshot" disabled={saving} onClick={() => setScreenshots(value => value.filter(row => row.id !== item.id))}><X size={16} /></button>
    </div>)}</div>

    {error && <p role="alert">{error}</p>}
    <button onClick={save} disabled={hasUrlError || saving || enrichmentBusy || pending > 0 || !title.trim() || !appUrl.trim() || Boolean(appId && initialized.current !== scope)} className="bg-dashboard-accent text-white rounded-xl px-5 py-3">
     {saving && <Loader2 className="inline animate-spin mr-2" size={16} />}Save app
    </button>
   </section>
  </div>
 </div>;
}
