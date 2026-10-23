import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyErrorMessage, urlFieldError } from "../../../../utils/friendlyError";
import { useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { toast } from 'sonner';
import useAuthStore from '../../../../store/store';
import type { RecommendationObservation } from '../../../../lib/explorersApiClient';
import { AppsClient, type ManualAppIntent } from '../../api/appsClient';
import { useAppsCommands } from '../../api/query';
import { invalidateApps, useAppsOwner } from '../../hooks/useAppsOwner';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import type { LinkPreview } from '../../../../../../tunes/shared/explorersLinkPreviewContract';
import TiptapEditor from '../../../Favorites/components/TiptapEditor';
import AppEnrichmentPanel from './AppEnrichmentPanel';
import ReorderableMediaStrip from '../../../../components/reorder/ReorderableMediaStrip';
import { useOriginBack } from "../../../../lib/navigation/useOriginBack";
import { listPath } from "../../../../lib/navigation/categoryRoutes";
import { useTranslation } from "react-i18next";
import AddItemPage from '../../../shared/addItem/AddItemPage';
import ItemSearch, { type ItemSearchResult } from '../../../shared/addItem/ItemSearch';
import PickedItemCard from '../../../shared/addItem/PickedItemCard';
import StarRating from '../../../../components/StarRating';
import PasteLinkField from '../../../../components/PasteLinkField';
import { linkPreviewClient, type AppCandidate } from '../../../../lib/linkPreviewClient';

const PRICE_TIERS = ['Free', 'Freemium', 'Paid', 'Subscription'] as const;
const ALL_PLATFORMS = ['iOS', 'iPadOS', 'macOS', 'Android', 'Windows', 'Web', 'Linux', 'Chrome Extension'];
const OTHER_LINK_LIMIT = 4;
type PriceTier = (typeof PRICE_TIERS)[number];
type Field = 'title' | 'developer' | 'description';
type OtherLink = { label: string; url: string };

/** Label for an other platform link, read from its host. Unknown hosts are a plain "Link". */
export function otherLinkLabel(raw: string): string {
 let host = '';
 try { host = new URL(raw).hostname.toLowerCase(); } catch { return 'Link'; }
 if (/(^|\.)apps\.apple\.com$/.test(host)) return 'App Store';
 if (/(^|\.)play\.google\.com$/.test(host)) return 'Google Play';
 if (/(^|\.)(chromewebstore|chrome)\.google\.com$/.test(host)) return 'Chrome Web Store';
 if (/(^|\.)(apps\.)?microsoft\.com$/.test(host)) return 'Microsoft Store';
 return 'Link';
}

/**
 * Apps add/edit page on the shared add-item template (WP8 Task 8-7).
 *
 * One link. The App URL is the shared entity's identity (NOT NULL in 0043, excluded from the
 * override vocabulary, so editing cannot re-point an app other owners also recommend). Other
 * platform links (up to four) sit beside it; the old separate Download URL field is gone and
 * is saved as null - an old row's download link is shown as an other link so nothing is lost.
 *
 * Adding starts with an App Store search (catalog route). A picked hit fills only the form;
 * its icon is copied into owned media and becomes the recommendation's first media item, so
 * logoUrl is no longer typed. A pasted Play or web link fills still-empty fields from the
 * link preview, each marked "Filled from link" until the owner changes it.
 */
export default function AddAppPage() {
 const { listId, appId } = useParams<{ listId: string; appId?: string }>();
 const location = useLocation();
 const { t } = useTranslation();
 const back = useOriginBack({ to: listPath("apps", listId!), label: t("dashboard.wp1.back.list") });
 const backText = back.source === "state" && back.label ? t("dashboard.wp1.back.to", { name: back.label }) : t("dashboard.wp1.back.list");
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId);
 const scope = JSON.stringify([generation, accountId, location.pathname, listId, appId]);
 const currentScope = useRef(scope); currentScope.current = scope;
 const active = useRef(0), controller = useRef<AbortController>();
 const owner = useAppsOwner(undefined, true), commands = useAppsCommands();

 const [existingId, setExistingId] = useState('');
 const existingApps = [...new Map((owner.content?.view.lists.flatMap(list => list.recommended_apps) ?? []).filter(app => !owner.content?.view.lists.find(list => list.documentId === listId)?.recommended_apps.some(member => member.documentId === app.documentId)).map(app => [app.documentId, app])).values()];

 const [query, setQuery] = useState(''), [searchOpen, setSearchOpen] = useState(true);
 const [picked, setPicked] = useState<AppCandidate | null>(null);
 const candidates = useRef(new Map<string, AppCandidate>());
 const [title, setTitle] = useState(''), [appUrl, setAppUrl] = useState('');
 const [developer, setDeveloper] = useState(''), [logoUrl, setLogoUrl] = useState('');
 const [description, setDescription] = useState('');
 const [otherLinks, setOtherLinks] = useState<OtherLink[]>([]);
 const [priceTier, setPriceTier] = useState<PriceTier | ''>('');
 const [platforms, setPlatforms] = useState<string[]>([]);
 const [note, setNote] = useState(''), [rating, setRating] = useState<number | null>(null);
 const [icon, setIcon] = useState<{ id: string; url: string } | null>(null), [importing, setImporting] = useState(false);
 const [linkImage, setLinkImage] = useState<string | null>(null);
 const [filled, setFilled] = useState<Set<Field>>(new Set());
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
 const manualDirty=Boolean(appId&&savedDraft.current?.scope===scope&&savedDraft.current.signature!==draftSignature([title,developer,description,otherLinks,priceTier,platforms,noteSignature(note),rating,screenshots.map(item=>item.id)]));
 const intent = useRef<{ scope: string; signature: string; value: ManualAppIntent }>();
 const updateKey = useRef<{ signature: string; key: string }>();
 const mounted = useRef(true);

 useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); active.current++; }; }, []);
 useEffect(() => { controller.current?.abort(); active.current++; initialized.current = ''; savedDraft.current=undefined; intent.current = undefined; updateKey.current = undefined; draftObservation.current = undefined; setQuery(''); setSearchOpen(true); setPicked(null); setTitle(''); setAppUrl(''); setDeveloper(''); setLogoUrl(''); setDescription(''); setOtherLinks([]); setPriceTier(''); setPlatforms([]); setNote(''); setRating(null); setIcon(null); setImporting(false); setLinkImage(null); setFilled(new Set()); setScreenshots([]); setPending(0); setSaving(false); setError(''); setExistingId(''); }, [scope]);

 useEffect(() => {
  if (!appId || !owner.content || initialized.current === scope) return;
  const app = owner.content.view.lists.find(list => list.documentId === listId)?.recommended_apps.find(row => row.documentId === appId);
  const observed = owner.content.details.get(appId);
  if (!app || !observed) return;
  initialized.current = scope; draftObservation.current = observed;
  // An old row's separate download link becomes an other link; it is saved back as one.
  const links: OtherLink[] = (app.other_links ?? []).map(link => ({ ...link }));
  if (app.download_url && app.download_url !== app.app_url && !links.some(link => link.url === app.download_url) && links.length < OTHER_LINK_LIMIT) links.push({ label: otherLinkLabel(app.download_url), url: app.download_url });
  const shots = (observed.detail.category === 'apps' ? observed.detail.appScreenshots?.screenshotMediaIds ?? [] : []);
  savedDraft.current={scope,signature:draftSignature([app.title,app.developer??'',app.description??'',links,app.price_tier??'',app.platforms??[],noteSignature(typeof app.user_recommendation_note==='string'?app.user_recommendation_note:''),app.user_rating,shots])};
  setTitle(app.title); setAppUrl(app.app_url); setDeveloper(app.developer ?? ''); setLogoUrl(app.logo_url ?? '');
  setDescription(app.description ?? ''); setOtherLinks(links);
  setPriceTier(app.price_tier ?? ''); setPlatforms(app.platforms ?? []);
  setNote(typeof app.user_recommendation_note === 'string' ? app.user_recommendation_note : '');
  setRating(app.user_rating);
  setScreenshots(shots.map(id => ({ id, url: `/api/explorers/v1/media/${id}/content` })));
 }, [owner.content, scope, appId, listId]);

 const valid = (captured: string, operation?: number) => mounted.current && currentScope.current === captured && (operation === undefined || active.current === operation);
 const assertCurrent = (captured: string, operation: number) => { if (!valid(captured, operation) || controller.current?.signal.aborted) throw new Error('App owner or route changed'); };

 const togglePlatform = (platform: string) => setPlatforms(value => value.includes(platform) ? value.filter(item => item !== platform) : [...value, platform]);
 const blank = (value: string) => { const trimmed = value.trim(); return trimmed === '' ? null : trimmed; };
 const touched = (field: Field) => setFilled(value => { if (!value.has(field)) return value; const next = new Set(value); next.delete(field); return next; });

 const importIcon = async (imageUrl: string) => {
  const captured = scope; setImporting(true); setError('');
  try {
   const result = await linkPreviewClient.importImage(imageUrl);
   if (!valid(captured)) return;
   setIcon({ id: result.id, url: `/api/explorers/v1/media/${result.id}/content` }); setLinkImage(null);
  } catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'The icon could not be copied')); }
  finally { if (valid(captured)) setImporting(false); }
 };

 const search = useCallback(async (text: string, signal: AbortSignal): Promise<ItemSearchResult[]> => {
  const apps = await linkPreviewClient.searchApps(text, undefined, signal);
  candidates.current = new Map(apps.map(app => [app.appUrl, app]));
  return apps.map(app => ({ id: app.appUrl, title: app.title, subtitle: [app.developer, app.platforms.join(', ')].filter(Boolean).join(' · '), imageUrl: app.iconUrl }));
 }, []);

 const pick = (result: ItemSearchResult) => {
  const hit = candidates.current.get(result.id);
  if (!hit) return;
  setPicked(hit); setSearchOpen(false); setFilled(new Set());
  setTitle(hit.title); setDeveloper(hit.developer ?? ''); setAppUrl(hit.appUrl);
  setPriceTier(hit.priceTier); setPlatforms([...hit.platforms]);
  if (hit.iconUrl) void importIcon(hit.iconUrl);
 };

 // Fills only what is still empty, so a read never overwrites what the owner typed.
 const prefill = (preview: LinkPreview) => {
  const marks: Field[] = [];
  if (preview.title && !title.trim()) { setTitle(preview.title); marks.push('title'); }
  if (preview.siteName && !developer.trim()) { setDeveloper(preview.siteName); marks.push('developer'); }
  if (preview.description && !description.trim()) { setDescription(preview.description); marks.push('description'); }
  setFilled(value => new Set([...value, ...marks]));
  if (!icon && preview.imageUrl) setLinkImage(preview.imageUrl);
 };

 const attachExisting = async () => {
  const captured = scope;
  try { await commands.membership(existingId, listId!, true); if (valid(captured)) back.goBack(); }
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

 const linkErrors = [urlFieldError(appUrl), ...otherLinks.map(link => urlFieldError(link.url))];
 const hasUrlError = linkErrors.some(Boolean);
 const notReady = hasUrlError || !listId || pending > 0 || importing || saving || enrichmentBusy || !title.trim() || !appUrl.trim() || Boolean(appId && initialized.current !== scope);
 const save = async () => {
  if (notReady || !listId) return;
  const captured = scope, operation = ++active.current; controller.current?.abort(); controller.current = new AbortController(); const signal = controller.current.signal;
  setSaving(true); setError('');
  try {
   const links = otherLinks.map(link => ({ label: link.label, url: link.url.trim() })).filter(link => link.url);
   const facts = { developer: blank(developer), logoUrl: blank(logoUrl), description: blank(description), downloadUrl: null, priceTier: priceTier === '' ? null : priceTier, platforms, otherLinks: links };
   const screenshotMediaIds = screenshots.map(item => item.id);
   const draft = { title: title.trim(), appUrl: appUrl.trim(), ...facts, note: richNoteFromEditor(note), userRating: rating, mediaIds: icon ? [icon.id] : [], screenshotMediaIds };
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
   invalidateApps(); toast.success('App saved'); back.goBack({ state: { justAddedRecommendation: true } });
  } catch (failure) { if (valid(captured, operation)) setError(friendlyErrorMessage(failure, 'App could not be saved')); }
  finally { if (valid(captured, operation)) setSaving(false); }
 };

 // Edit controls require the actual complete owner observation. A loaded draft stays
 // owned by its original observation across refreshes and never rebases.
 if (appId && initialized.current !== scope) {
  return <div className="min-h-screen text-dashboard p-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
   <button aria-label={backText} onClick={() => back.goBack()}><ArrowLeft size={20} /></button>
   <h1 className="font-semibold">Edit App</h1>
   {owner.loading ? <p role="status">Loading app…</p> : <div role="alert"><p>{owner.error?.message || 'App could not be loaded. Refresh before editing.'}</p><button onClick={owner.refetch}>Retry loading app</button></div>}
  </div>;
 }

 const fromLink = (field: Field) => filled.has(field) && <span className="ml-2 text-xs text-blue-400">{t('apps.form.filledFromLink', 'Filled from link')}</span>;
 const input = "block w-full bg-dashboard-muted rounded-xl p-3";
 const setOtherLink = (index: number, url: string) => setOtherLinks(value => value.map((row, at) => at === index ? { label: otherLinkLabel(url.trim()), url } : row));

 return <AddItemPage
  title={appId ? 'Edit App' : 'Add App'} backLabel={backText} onBack={() => back.goBack()} mode="manual"
  bar={{ onCancel: () => back.goBack(), onSave: () => void save(), saving: saving ? 'save' : null, canSave: !notReady }}>
  {!appId && existingApps.length > 0 && <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-3">
   <label className="block">Existing app
    <select value={existingId} onChange={event => setExistingId(event.target.value)} disabled={commands.loading} className={input}>
     <option value="">Select an app</option>
     {existingApps.map(app => <option key={app.documentId} value={app.documentId}>{app.title}</option>)}
    </select>
   </label>
   <button disabled={!existingId || commands.loading} onClick={attachExisting}>Add existing app to this list</button>
  </section>}

  {appId && initialized.current === scope && draftObservation.current && <AppEnrichmentPanel key={scope} observed={draftObservation.current} disabled={saving || pending > 0} manualDirty={manualDirty} onBusyChange={setEnrichmentBusy} onReload={() => window.location.reload()} onAccepted={() => { invalidateApps(); toast.success('Selected app details accepted'); back.goBack(); }} />}
  {owner.error && <p role="alert">{owner.error.message}</p>}

  {!appId && searchOpen && <ItemSearch query={query} onQueryChange={setQuery} search={search} onPick={pick} onAddManually={() => setSearchOpen(false)} placeholder={t('apps.form.search', 'Search the App Store')} />}
  {picked && <PickedItemCard title={picked.title} subtitle={picked.developer ?? undefined} imageUrl={icon?.url ?? null} onChange={() => { setPicked(null); setSearchOpen(true); }} locked={saving} />}

  <PasteLinkField label="App URL" value={appUrl} onChange={setAppUrl} onPrefill={prefill} placeholder="https://example.com/app" disabled={saving || Boolean(appId)} />
  {linkErrors[0] && <p role="alert" className="text-sm text-red-400">{linkErrors[0]}</p>}
  {appId && <p className="text-sm text-dashboard-muted">The app URL identifies the app itself and is shared with everyone who recommends it, so it cannot be changed here.</p>}
  {linkImage && <div className="flex items-center gap-3">
   <img src={linkImage} alt="" className="h-12 w-12 rounded-lg object-cover" />
   <button type="button" onClick={() => void importIcon(linkImage)} disabled={importing || saving} className="min-h-11 rounded-lg border border-white/10 px-3 text-sm">{t('apps.form.useIcon', 'Use this icon')}</button>
  </div>}

  <fieldset className="min-w-0 space-y-2"><legend>{t('apps.form.otherLinks', 'Other platform links')}</legend>
   {otherLinks.map((link, index) => <div key={index} className="flex min-w-0 items-end gap-2">
    <div className="min-w-0 flex-1"><PasteLinkField label={`Other link ${index + 1}`} value={link.url} onChange={url => setOtherLink(index, url)} onPrefill={prefill} placeholder="https://play.google.com/store/apps/..." disabled={saving} /></div>
    <button type="button" aria-label={`Remove other link ${index + 1}`} disabled={saving} onClick={() => setOtherLinks(value => value.filter((_row, at) => at !== index))} className="min-h-11 min-w-11"><X size={16} /></button>
   </div>)}
   {otherLinks.map((_link, index) => linkErrors[index + 1] && <p key={`error-${index}`} role="alert" className="text-sm text-red-400">{linkErrors[index + 1]}</p>)}
   {otherLinks.length < OTHER_LINK_LIMIT && <button type="button" disabled={saving} onClick={() => setOtherLinks(value => [...value, { label: 'Link', url: '' }])} className="text-sm text-blue-400">{t('apps.form.addOtherLink', '+ Add another platform link')}</button>}
  </fieldset>

  <div><label htmlFor="app-title">App title</label>{fromLink('title')}<input id="app-title" value={title} onChange={event => { setTitle(event.target.value); touched('title'); }} disabled={saving} className={input} /></div>
  <div><label htmlFor="app-developer">Developer</label>{fromLink('developer')}<input id="app-developer" value={developer} onChange={event => { setDeveloper(event.target.value); touched('developer'); }} disabled={saving} className={input} /></div>
  <div><label htmlFor="app-description">Description</label>{fromLink('description')}<textarea id="app-description" value={description} onChange={event => { setDescription(event.target.value); touched('description'); }} disabled={saving} rows={3} className={`${input} resize-none`} /></div>

  <label className="block">Price
   <select value={priceTier} onChange={event => setPriceTier(event.target.value as PriceTier | '')} disabled={saving} className={input}>
    <option value="">Not stated</option>
    {PRICE_TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
   </select>
  </label>

  <fieldset className="min-w-0"><legend>Platforms</legend>
   <div className="flex flex-wrap gap-2">
    {ALL_PLATFORMS.map(platform => <button key={platform} type="button" aria-pressed={platforms.includes(platform)} disabled={saving} onClick={() => togglePlatform(platform)} className="min-h-11 px-3 py-1.5 rounded-lg border border-white/10 text-sm">{platform}</button>)}
   </div>
  </fieldset>

  <StarRating label="Your rating" value={rating} onChange={setRating} disabled={saving} />

  <div><h3>My Thoughts</h3><TiptapEditor value={note} onChange={setNote} placeholder="Why do you recommend this app?" /></div>

  <label className="block">Screenshots<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={saving || pending > 0} onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
  {pending > 0 && <p role="status">Uploading screenshots…</p>}
  {importing && <p role="status">Copying the icon…</p>}
  {/* Order here is the saved order and the order the public page shows; the first is the lead screenshot. */}
  <ReorderableMediaStrip items={screenshots} onChange={setScreenshots} noun="Screenshot" alt="App screenshot" removeLabel="Remove screenshot" disabled={saving} />

  {error && <p role="alert">{error}</p>}
 </AddItemPage>;
}
