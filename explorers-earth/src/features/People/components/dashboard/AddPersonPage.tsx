import ReorderableMediaStrip from '../../../../components/reorder/ReorderableMediaStrip';
import { useEffect, useRef, useState } from 'react';
import { friendlyErrorMessage, urlFieldError } from "../../../../utils/friendlyError";
import { useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, X } from 'lucide-react';
import { uploadButton } from '../../../shared/addItem/formStyles';
import { toast } from 'sonner';
import useAuthStore from '../../../../store/store';
import type { RecommendationObservation, CompleteTaxonomyCatalog } from '../../../../lib/explorersApiClient';
import { PeopleClient, type ManualPersonIntent } from '../../api/peopleClient';
import { usePeopleCommands } from '../../api/query';
import { invalidatePeople, usePeopleOwner } from '../../hooks/usePeopleOwner';
import type { PersonPlatform } from '../../../../../../tunes/shared/explorersPersonContract';
import type { LinkPreview } from '../../../../../../tunes/shared/explorersLinkPreviewContract';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import TiptapEditor from '../../../Favorites/components/TiptapEditor';
import { useOriginBack } from "../../../../lib/navigation/useOriginBack";
import { listPath } from "../../../../lib/navigation/categoryRoutes";
import { useTranslation } from "react-i18next";
import AddItemPage from '../../../shared/addItem/AddItemPage';
import PasteLinkField from '../../../../components/PasteLinkField';
import { linkPreviewClient } from '../../../../lib/linkPreviewClient';
import { detectPlatform } from '../../lib/detectPlatform';

// twitter is stored; the form has always offered x, so the label says X.
const PLATFORM_LABELS: Record<PersonPlatform, string> = {
 instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'X', github: 'GitHub',
 youtube: 'YouTube', website: 'Website', other: 'Other',
};
const EXTRA_LINK_LIMIT = 4;
type Field = 'name' | 'headline';

/**
 * Keys each extra social link by the platform its link points at. The primary link owns its
 * platform's key; a second link on an already-used platform goes to "other". Returns null for
 * a row that has nowhere left to go (its platform and "other" are both taken).
 */
export function keySocialLinks(primary: { url: string; platform: PersonPlatform } | null, extras: string[]): { socialUrls: Record<string, string>; unplaced: number[] } {
 const socialUrls: Record<string, string> = {}, unplaced: number[] = [];
 if (primary) { socialUrls.primary = primary.url; socialUrls[primary.platform] = primary.url; }
 extras.forEach((raw, index) => {
  const url = raw.trim(); if (!url) return;
  const detected = detectPlatform(url);
  const key = socialUrls[detected] === undefined ? detected : socialUrls.other === undefined ? 'other' : null;
  if (key === null) unplaced.push(index); else socialUrls[key] = url;
 });
 return { socialUrls, unplaced };
}

/**
 * People add/edit page on the shared add-item template (WP8 Task 8-13: DS-02, DS-08, DS-09,
 * ADD-12).
 *
 *  - Sector is required: Save stays off until one is chosen from the People sector catalog.
 *  - No rating and no follower count. The columns stay (old rows keep their values), but this
 *    form writes userRating null and externalFollowerCountText null, and the detail view no
 *    longer shows either.
 *  - One profile link. Its platform is detected from the link (no platform select), and a
 *    pasted link fills a still-empty name and headline and copies the link's photo into owned
 *    media. Up to four more social links are keyed by their own detected platform.
 *  - Skills are a plain tag input.
 */
export default function AddPersonPage() {
 const { listId, personId } = useParams<{ listId: string; personId?: string }>();
 const location = useLocation();
 const { t } = useTranslation();
 const back = useOriginBack({ to: listPath("people", listId!), label: t("dashboard.wp1.back.list") });
 const backText = back.source === "state" && back.label ? t("dashboard.wp1.back.to", { name: back.label }) : t("dashboard.wp1.back.list");
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId);
 const scope = JSON.stringify([generation, accountId, location.pathname, listId, personId]);
 const currentScope = useRef(scope); currentScope.current = scope;
 const active = useRef(0), controller = useRef<AbortController>();
 const owner = usePeopleOwner(undefined, true), commands = usePeopleCommands();

 const [existingId, setExistingId] = useState('');
 const existingPeople = [...new Map((owner.content?.view.lists.flatMap(list => list.recommended_people) ?? []).filter(person => !owner.content?.view.lists.find(list => list.documentId === listId)?.recommended_people.some(member => member.documentId === person.documentId)).map(person => [person.documentId, person])).values()];

 const [name, setName] = useState(''), [profileUrl, setProfileUrl] = useState('');
 const [storedPrimary, setStoredPrimary] = useState<{ url: string; platform: PersonPlatform } | null>(null);
 const [extraLinks, setExtraLinks] = useState<string[]>([]);
 const [handle, setHandle] = useState(''), [headline, setHeadline] = useState('');
 const [locationText, setLocationText] = useState('');
 const [tags, setTags] = useState<string[]>([]), [tagDraft, setTagDraft] = useState('');
 const [note, setNote] = useState('');
 const [media, setMedia] = useState<{ id: string; url: string }[]>([]), [pending, setPending] = useState(0);
 const [importing, setImporting] = useState(false), [filled, setFilled] = useState<Set<Field>>(new Set());
 const [saving, setSaving] = useState(false), [error, setError] = useState('');
 const [sectorId,setSectorId]=useState(''),[sectorTouched,setSectorTouched]=useState(false);
 const [catalog,setCatalog]=useState<CompleteTaxonomyCatalog>(),[catalogLoading,setCatalogLoading]=useState(true),[catalogError,setCatalogError]=useState(''),[catalogRetry,setCatalogRetry]=useState(0);
 const [existingSector,setExistingSector]=useState<{id:string;slug:string;label:string|null;unavailable:boolean}|null>(null);
 const initialized = useRef(''), draftObservation = useRef<RecommendationObservation>();
 const intent = useRef<{ scope: string; signature: string; value: ManualPersonIntent }>();
 const updateKey = useRef<{ signature: string; key: string }>();
 const mounted = useRef(true);

 useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); active.current++; }; }, []);
 useEffect(()=>{
  const captured=scope,abort=new AbortController();let live=true;
  setCatalog(undefined);setCatalogLoading(true);setCatalogError('');
  PeopleClient.readSectorCatalog(abort.signal).then(value=>{if(live&&mounted.current&&currentScope.current===captured&&!abort.signal.aborted)setCatalog(value);},failure=>{if(live&&mounted.current&&currentScope.current===captured&&!abort.signal.aborted)setCatalogError(friendlyErrorMessage(failure, 'Sectors could not be loaded'));}).finally(()=>{if(live&&mounted.current&&currentScope.current===captured&&!abort.signal.aborted)setCatalogLoading(false);});
  return()=>{live=false;abort.abort();};
 },[scope,catalogRetry]);
 useEffect(()=>{setSectorId('');setSectorTouched(false);setExistingSector(null);},[scope]);
 useEffect(() => { controller.current?.abort(); active.current++; initialized.current = ''; intent.current = undefined; updateKey.current = undefined; draftObservation.current = undefined; setName(''); setProfileUrl(''); setStoredPrimary(null); setExtraLinks([]); setHandle(''); setHeadline(''); setLocationText(''); setTags([]); setTagDraft(''); setNote(''); setMedia([]); setPending(0); setImporting(false); setFilled(new Set()); setSaving(false); setError(''); setExistingId(''); }, [scope]);

 useEffect(() => {
  if (!personId || !owner.content || initialized.current === scope) return;
  const person = owner.content.view.lists.find(list => list.documentId === listId)?.recommended_people.find(row => row.documentId === personId);
  const observed = owner.content.details.get(personId);
  if (!person || !observed) return;
  initialized.current = scope; draftObservation.current = observed;
  const stored=observed.detail.peopleSector?.sector??null;setExistingSector(stored);setSectorId(stored?.id??'');setSectorTouched(false);
  setName(person.name); setHandle(person.username_handle ?? ''); setHeadline(person.headline ?? '');
  setLocationText(person.location ?? '');
  const primaryUrl = person.profile_url ?? '';
  const storedPlatform = person.primary_platform as PersonPlatform | null;
  setProfileUrl(primaryUrl);
  setStoredPrimary(primaryUrl && storedPlatform ? { url: primaryUrl, platform: storedPlatform } : null);
  // Every stored link other than the primary (under its own key) becomes an extra row.
  const social = (person.social_urls ?? {}) as Record<string, string | undefined>;
  setExtraLinks(Object.entries(social).filter(([key, url]) => url && key !== 'primary' && !(url === primaryUrl && (key === storedPlatform || storedPlatform === null))).map(([, url]) => url as string).slice(0, EXTRA_LINK_LIMIT));
  setTags(person.skills_tags ?? []);
  setNote(typeof person.user_recommendation_note === 'string' ? person.user_recommendation_note : '');
  // Without this the form starts empty and save() sends mediaIds: [], silently detaching
  // every snapshot the owner already uploaded.
  setMedia((observed.detail.mediaIds ?? []).map(id => ({ id, url: `/api/explorers/v1/media/${id}/content` })));
 }, [owner.content, scope, personId, listId]);

 const valid = (captured: string, operation?: number) => mounted.current && currentScope.current === captured && (operation === undefined || active.current === operation);
 const assertCurrent = (captured: string, operation: number) => { if (!valid(captured, operation) || controller.current?.signal.aborted) throw new Error('Person owner or route changed'); };
 const blank = (value: string) => { const trimmed = value.trim(); return trimmed === '' ? null : trimmed; };
 const touched = (field: Field) => setFilled(value => { if (!value.has(field)) return value; const next = new Set(value); next.delete(field); return next; });

 const link = profileUrl.trim();
 // The stored platform is kept while the stored link is unchanged; otherwise it is read from the link.
 const primaryPlatform: PersonPlatform | null = !link ? null : storedPrimary?.url === link ? storedPrimary.platform : detectPlatform(link);
 const keyed = keySocialLinks(link && primaryPlatform ? { url: link, platform: primaryPlatform } : null, extraLinks);
 const urlProblem = urlFieldError(profileUrl) ?? extraLinks.map(url => urlFieldError(url)).find(Boolean) ?? (keyed.unplaced.length ? t('people.form.linkNoRoom', 'Only one link per platform plus one other link.') : undefined);
 const sectorItems = catalog?.items.filter(item => item.category === 'people' && item.parentId === null) ?? [];

 const importPhoto = async (imageUrl: string) => {
  const captured = scope; setImporting(true);
  try {
   const result = await linkPreviewClient.importImage(imageUrl);
   if (!valid(captured)) return;
   setMedia(value => [{ id: result.id, url: `/api/explorers/v1/media/${result.id}/content` }, ...value.filter(item => item.id !== result.id)]);
  } catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'The photo could not be copied')); }
  finally { if (valid(captured)) setImporting(false); }
 };

 // Fills only what is still empty, so a read never overwrites what the owner typed.
 const prefill = (preview: LinkPreview) => {
  const marks: Field[] = [];
  const nextName = preview.person?.name ?? preview.title;
  const nextHeadline = preview.person?.headline ?? null;
  if (nextName && !name.trim()) { setName(nextName); marks.push('name'); }
  if (nextHeadline && !headline.trim()) { setHeadline(nextHeadline); marks.push('headline'); }
  setFilled(value => new Set([...value, ...marks]));
  if (preview.imageUrl && media.length === 0) void importPhoto(preview.imageUrl);
 };

 const addTag = () => {
  const value = tagDraft.trim();
  if (!value || tags.includes(value) || tags.length >= 32) { setTagDraft(''); return; }
  setTags(current => [...current, value]); setTagDraft('');
 };

 const attachExisting = async () => {
  const captured = scope;
  try { await commands.membership(existingId, listId!, true); if (valid(captured)) back.goBack(); }
  catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'Person could not be added')); }
 };

 const upload = async (files: File[]) => {
  const captured = scope; setPending(value => value + files.length); setError('');
  for (const file of files) {
   if (!valid(captured)) return;
   try { const result = await PeopleClient.upload(file, crypto.randomUUID()); if (!valid(captured)) return; setMedia(value => [...value, { id: result.id, url: `/api/explorers/v1/media/${result.id}/content` }]); }
   catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'Upload failed')); }
   finally { if (valid(captured)) setPending(value => value - 1); }
  }
 };

 // Sector is required whenever there is a sector to choose. An unconfigured or empty catalog
 // cannot block saving, or the person could never be recommended at all.
 const sectorMissing = !sectorId && !(catalog && (catalog.state !== 'CONFIGURED' || sectorItems.length === 0));
 const notReady = !listId || pending > 0 || importing || saving || !name.trim() || sectorMissing || Boolean(urlProblem) || Boolean(personId && initialized.current !== scope);
 const save = async () => {
  if (notReady || !listId) return;
  const captured = scope, operation = ++active.current; controller.current?.abort(); controller.current = new AbortController(); const signal = controller.current.signal;
  setSaving(true); setError('');
  try {
   // A new person carries its chosen sector; an edit sends it only when the owner changed it.
   const sectorPatch=(sectorId&&!personId)||sectorTouched?{peopleSectorTermId:sectorId||null}:{};
   if((!personId||sectorTouched)&&sectorId&&(!catalog||catalog.category!=='people'||catalog.state!=='CONFIGURED'||!catalog.items.some(item=>item.id===sectorId&&item.category==='people'&&item.parentId===null)))throw new Error('Reload sectors and choose an available sector before saving');
   const facts = { usernameHandle: blank(handle), headline: blank(headline), locationText: blank(locationText),
    avatarUrl: null, primaryPlatform, socialUrls: keyed.socialUrls,
    skillsTags: tags, externalFollowerCountText: null };
   const draft = { title: name.trim(), ...facts, note: richNoteFromEditor(note), userRating: null, mediaIds: media.map(item => item.id),...sectorPatch };
   const signature = JSON.stringify(draft);
   assertCurrent(captured, operation);
   if (personId) {
    const observed = owner.content?.details.get(personId);
    if (!observed || draftObservation.current !== observed) throw new Error('Reload the person before saving');
    if (updateKey.current?.signature !== signature) updateKey.current = { signature, key: crypto.randomUUID() };
    assertCurrent(captured, operation);
    // usernameHandle is absent here on purpose: it is not in the override vocabulary,
    // because a handle is how a person is identified on a platform.
    const {usernameHandle: _handle, ...overridable} = facts;
    await PeopleClient.updateRecommendation(observed, { displayOverrides: { title: draft.title, ...overridable }, note: draft.note, userRating: null, mediaIds: draft.mediaIds,...sectorPatch }, updateKey.current.key, signal);
    assertCurrent(captured, operation);
   } else {
    if (intent.current?.scope !== captured || intent.current.signature !== signature) {
     const parent = await PeopleClient.observeCollection(listId, signal); assertCurrent(captured, operation);
     intent.current = { scope: captured, signature, value: PeopleClient.prepareManualIntent(parent, draft) };
    }
    assertCurrent(captured, operation); await PeopleClient.createManual(intent.current.value, signal); assertCurrent(captured, operation);
   }
   invalidatePeople(); toast.success('Person saved'); back.goBack({ state: { justAddedRecommendation: true } });
  } catch (failure) { if (valid(captured, operation)) setError(friendlyErrorMessage(failure, 'Person could not be saved')); }
  finally { if (valid(captured, operation)) setSaving(false); }
 };

 // Edit controls require the actual complete owner observation. A loaded draft stays
 // owned by its original observation across refreshes and never rebases.
 if (personId && initialized.current !== scope) {
  return <div className="min-h-screen text-dashboard p-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
   <button aria-label={backText} onClick={() => back.goBack()}><ArrowLeft size={20} /></button>
   <h1 className="font-semibold">Edit Person</h1>
   {owner.loading ? <p role="status">Loading person…</p> : <div role="alert"><p>{owner.error?.message || 'Person could not be loaded. Refresh before editing.'}</p><button onClick={owner.refetch}>Retry loading person</button></div>}
  </div>;
 }

 const fromLink = (field: Field) => filled.has(field) && <span className="ml-2 text-xs text-blue-400">{t('people.form.filledFromLink', 'Filled from link')}</span>;
 const input = "block w-full bg-dashboard-muted rounded-xl p-3";

 return <AddItemPage
  title={personId ? 'Edit Person' : 'Add Person'} backLabel={backText} onBack={() => back.goBack()} mode="manual"
  bar={{ onCancel: () => back.goBack(), onSave: () => void save(), saving: saving ? 'save' : null, canSave: !notReady }}>
  {!personId && existingPeople.length > 0 && <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-3">
   <label className="block">Existing person
    <select value={existingId} onChange={event => setExistingId(event.target.value)} disabled={commands.loading} className={input}>
     <option value="">Select a person</option>
     {existingPeople.map(person => <option key={person.documentId} value={person.documentId}>{person.name}</option>)}
    </select>
   </label>
   <button disabled={!existingId || commands.loading} onClick={attachExisting}>Add existing person to this list</button>
  </section>}
  {owner.error && <p role="alert">{owner.error.message}</p>}

  <PasteLinkField label={t('people.form.profileLink', 'Profile link')} value={profileUrl} onChange={setProfileUrl} onPrefill={prefill} placeholder="https://www.instagram.com/their-handle/" disabled={saving} />
  {primaryPlatform && <p className="text-sm text-dashboard-muted">{t('people.form.platform', 'Platform')}: <span data-detected-platform>{PLATFORM_LABELS[primaryPlatform]}</span></p>}

  <fieldset className="min-w-0 space-y-2"><legend>{t('people.form.socialLinks', 'Other social links')}</legend>
   {extraLinks.map((url, index) => <div key={index} className="flex min-w-0 items-end gap-2">
    <label className="min-w-0 flex-1">Social link {index + 1}
     <input type="url" value={url} disabled={saving} onChange={event => setExtraLinks(value => value.map((row, at) => at === index ? event.target.value : row))} placeholder="https://github.com/their-handle" className={input} />
    </label>
    <button type="button" aria-label={`Remove social link ${index + 1}`} disabled={saving} onClick={() => setExtraLinks(value => value.filter((_row, at) => at !== index))} className="min-h-11 min-w-11"><X size={16} /></button>
   </div>)}
   {extraLinks.length < EXTRA_LINK_LIMIT && <button type="button" disabled={saving} onClick={() => setExtraLinks(value => [...value, ''])} className="text-sm text-blue-400">{t('people.form.addSocialLink', '+ Add social link')}</button>}
  </fieldset>
  {urlProblem && <p role="alert" className="text-sm text-red-400">{urlProblem}</p>}

  <div><label htmlFor="person-name">Full Name</label>{fromLink('name')}<input id="person-name" value={name} onChange={event => { setName(event.target.value); touched('name'); }} disabled={saving} className={input} /></div>
  <label className="block">Sector
   <select aria-label="Sector" value={sectorId} onChange={event=>{setSectorId(event.target.value);setSectorTouched(true);}} disabled={saving} required aria-required="true" className={input}>
    <option value="">{t('people.form.chooseSector', 'Choose a sector')}</option>
    {existingSector&&!sectorItems.some(item=>item.id===existingSector.id)&&<option value={existingSector.id} disabled>{existingSector.label??existingSector.slug} (unavailable)</option>}
    {sectorItems.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
   </select>
  </label>
  {catalogLoading&&<p role="status">Loading sectors…</p>}
  {catalog?.state==='UNCONFIGURED'&&<p role="status" className="-mt-2 text-xs text-dashboard-muted">Sector catalog is not configured.</p>}
  {existingSector&&(existingSector.unavailable||catalog&&!catalog.items.some(item=>item.id===existingSector.id))&&<p role="status">Existing sector is unavailable.</p>}
  {catalogError&&<div role="alert"><p>{catalogError}</p><button onClick={()=>setCatalogRetry(value=>value+1)}>Retry loading sectors</button></div>}

  <label className="block">Handle / Username<input value={handle} onChange={event => setHandle(event.target.value)} disabled={saving} className={input} /></label>
  {personId && <p className="text-sm text-dashboard-muted">The handle identifies this person on their platform and is shared with everyone who recommends them, so changing it here does not re-point the shared record.</p>}
  <div><label htmlFor="person-headline">Headline / Role</label>{fromLink('headline')}<input id="person-headline" value={headline} onChange={event => { setHeadline(event.target.value); touched('headline'); }} disabled={saving} className={input} /></div>
  <label className="block">Location<input value={locationText} onChange={event => setLocationText(event.target.value)} disabled={saving} className={input} /></label>

  <div>
   <label htmlFor="person-skills">{t('people.form.skills', 'Skills')}</label>
   <input id="person-skills" value={tagDraft} disabled={saving || tags.length >= 32} onChange={event => setTagDraft(event.target.value)}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTag(); } }} onBlur={addTag}
    placeholder={t('people.form.skillsHint', 'Type a skill and press Enter')} className={input} />
   {tags.length > 0 && <ul className="mt-2 flex flex-wrap gap-2">
    {tags.map(tag => <li key={tag} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-sm">{tag}
     <button type="button" aria-label={`Remove skill ${tag}`} disabled={saving} onClick={() => setTags(value => value.filter(row => row !== tag))}><X size={12} /></button></li>)}
   </ul>}
  </div>

  <div><h3>My Thoughts</h3><TiptapEditor value={note} onChange={setNote} placeholder="Why do you recommend this person?" /></div>

  <label className={uploadButton}><Upload aria-hidden="true" size={16} className="text-dashboard-muted" /><span>Photos</span><input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={saving || pending > 0} onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
  {pending > 0 && <p role="status">Uploading photos…</p>}
  {importing && <p role="status">Copying the photo…</p>}
  <ReorderableMediaStrip items={media} onChange={setMedia} noun="Photo" alt="Person photo" removeLabel="Remove photo" disabled={saving} />

  {error && <p role="alert">{error}</p>}
 </AddItemPage>;
}
