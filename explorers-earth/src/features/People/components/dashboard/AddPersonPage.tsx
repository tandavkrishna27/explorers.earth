import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import useAuthStore from '../../../../store/store';
import type { RecommendationObservation, CompleteTaxonomyCatalog } from '../../../../lib/explorersApiClient';
import { PeopleClient, type ManualPersonIntent } from '../../api/peopleClient';
import { usePeopleCommands } from '../../api/query';
import { invalidatePeople, usePeopleOwner } from '../../hooks/usePeopleOwner';
import { PERSON_PLATFORMS, safePersonUrlSchema, type PersonPlatform } from '../../../../../../tunes/shared/explorersPersonContract';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import TiptapEditor from '../../../Favorites/components/TiptapEditor';

// twitter is stored; the form has always offered x, so the option carries both.
const PLATFORM_LABELS: Record<PersonPlatform, string> = {
 instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'X', github: 'GitHub',
 youtube: 'YouTube', website: 'Website', other: 'Other',
};

/**
 * Ticket 4.5. Native People add/edit page.
 *
 * Removed rather than ported:
 *
 *  - The paste-a-profile step posted to /api/people/scrape-profile. The server has no
 *    such route and music-security-containment.test.ts asserts the path stays absent, so
 *    the step called a dead endpoint and discarded the draft when it failed. Every field
 *    is owner-entered now, which is what "enrichment failure must not erase a manual
 *    draft" asks for - there is no enrichment left to fail.
 *  - Scraped screenshots: imagery is owner media through the native route. Nothing here
 *    copies an image from a third party's profile.
 *
 * One field genuinely has nowhere to go. The Strapi form had separate "Headline / Role"
 * and "Bio / Description" inputs, but the target schema's person_entity_details has only
 * headline, and RecommendedPerson already declares bio as a compatibility alias of it.
 * So this page keeps one headline input and bio reads from it. That is a deliberate
 * narrowing recorded in the ticket, not an oversight.
 */
export default function AddPersonPage() {
 const { listId, personId } = useParams<{ listId: string; personId?: string }>();
 const location = useLocation(), navigate = useNavigate();
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId);
 const scope = JSON.stringify([generation, accountId, location.pathname, listId, personId]);
 const currentScope = useRef(scope); currentScope.current = scope;
 const active = useRef(0), controller = useRef<AbortController>();
 const owner = usePeopleOwner(undefined, true), commands = usePeopleCommands();

 const [existingId, setExistingId] = useState('');
 const existingPeople = [...new Map((owner.content?.view.lists.flatMap(list => list.recommended_people) ?? []).filter(person => !owner.content?.view.lists.find(list => list.documentId === listId)?.recommended_people.some(member => member.documentId === person.documentId)).map(person => [person.documentId, person])).values()];

 const [name, setName] = useState(''), [profileUrl, setProfileUrl] = useState('');
 const [platform, setPlatform] = useState<PersonPlatform | ''>('');
 const [handle, setHandle] = useState(''), [headline, setHeadline] = useState('');
 const [locationText, setLocationText] = useState(''), [followers, setFollowers] = useState('');
 const [tags, setTags] = useState<string[]>([]), [tagDraft, setTagDraft] = useState('');
 const [note, setNote] = useState(''), [rating, setRating] = useState<number | null>(null);
 const [media, setMedia] = useState<{ id: string; url: string }[]>([]), [pending, setPending] = useState(0);
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
  PeopleClient.readSectorCatalog(abort.signal).then(value=>{if(live&&mounted.current&&currentScope.current===captured&&!abort.signal.aborted)setCatalog(value);},failure=>{if(live&&mounted.current&&currentScope.current===captured&&!abort.signal.aborted)setCatalogError(failure instanceof Error?failure.message:'Sectors could not be loaded');}).finally(()=>{if(live&&mounted.current&&currentScope.current===captured&&!abort.signal.aborted)setCatalogLoading(false);});
  return()=>{live=false;abort.abort();};
 },[scope,catalogRetry]);
 useEffect(()=>{setSectorId('');setSectorTouched(false);setExistingSector(null);},[scope]);
 useEffect(() => { controller.current?.abort(); active.current++; initialized.current = ''; intent.current = undefined; updateKey.current = undefined; draftObservation.current = undefined; setName(''); setProfileUrl(''); setPlatform(''); setHandle(''); setHeadline(''); setLocationText(''); setFollowers(''); setTags([]); setTagDraft(''); setNote(''); setRating(null); setMedia([]); setPending(0); setSaving(false); setError(''); setExistingId(''); }, [scope]);

 useEffect(() => {
  if (!personId || !owner.content || initialized.current === scope) return;
  const person = owner.content.view.lists.find(list => list.documentId === listId)?.recommended_people.find(row => row.documentId === personId);
  const observed = owner.content.details.get(personId);
  if (!person || !observed) return;
  initialized.current = scope; draftObservation.current = observed;
  const stored=observed.detail.peopleSector?.sector??null;setExistingSector(stored);setSectorId(stored?.id??'');setSectorTouched(false);
  setName(person.name); setHandle(person.username_handle ?? ''); setHeadline(person.headline ?? '');
  setLocationText(person.location ?? ''); setFollowers(person.follower_count ?? '');
  setPlatform((person.primary_platform as PersonPlatform | null) ?? '');
  setProfileUrl(person.profile_url ?? '');
  setTags(person.skills_tags ?? []);
  setNote(typeof person.user_recommendation_note === 'string' ? person.user_recommendation_note : '');
  setRating(person.user_rating);
  // Without this the form starts empty and save() sends mediaIds: [], silently detaching
  // every snapshot the owner already uploaded. mediaIds is on every recommendation detail,
  // so unlike appScreenshots it needs no category guard.
  setMedia((observed.detail.mediaIds ?? []).map(id => ({ id, url: `/api/explorers/v1/media/${id}/content` })));
 }, [owner.content, scope, personId, listId]);

 const valid = (captured: string, operation?: number) => mounted.current && currentScope.current === captured && (operation === undefined || active.current === operation);
 const assertCurrent = (captured: string, operation: number) => { if (!valid(captured, operation) || controller.current?.signal.aborted) throw new Error('Person owner or route changed'); };
 const blank = (value: string) => { const trimmed = value.trim(); return trimmed === '' ? null : trimmed; };

 // Reported before any command is dispatched, so the draft is never discarded to find out.
 const urlProblem = profileUrl.trim() !== '' && !safePersonUrlSchema.safeParse(profileUrl.trim()).success
  ? 'Enter a full http(s) profile address.' : undefined;

 const addTag = () => {
  const value = tagDraft.trim();
  if (!value || tags.includes(value) || tags.length >= 32) { setTagDraft(''); return; }
  setTags(current => [...current, value]); setTagDraft('');
 };

 const attachExisting = async () => {
  const captured = scope;
  try { await commands.membership(existingId, listId!, true); if (valid(captured)) navigate(`/recommendations/people/${listId}`); }
  catch (failure) { if (valid(captured)) setError(failure instanceof Error ? failure.message : 'Person could not be added'); }
 };

 const upload = async (files: File[]) => {
  const captured = scope; setPending(value => value + files.length); setError('');
  for (const file of files) {
   if (!valid(captured)) return;
   try { const result = await PeopleClient.upload(file, crypto.randomUUID()); if (!valid(captured)) return; setMedia(value => [...value, { id: result.id, url: `/api/explorers/v1/media/${result.id}/content` }]); }
   catch (failure) { if (valid(captured)) setError(failure instanceof Error ? failure.message : 'Upload failed'); }
   finally { if (valid(captured)) setPending(value => value - 1); }
  }
 };

 const save = async () => {
  if (!listId || pending || saving || !name.trim() || urlProblem || (personId && initialized.current !== scope)) return;
  const captured = scope, operation = ++active.current; controller.current?.abort(); controller.current = new AbortController(); const signal = controller.current.signal;
  setSaving(true); setError('');
  try {
   const sectorPatch=sectorTouched?{peopleSectorTermId:sectorId||null}:{};
   if(sectorTouched&&sectorId&&(!catalog||catalog.category!=='people'||catalog.state!=='CONFIGURED'||!catalog.items.some(item=>item.id===sectorId&&item.category==='people'&&item.parentId===null)))throw new Error('Reload sectors and choose an available sector before saving');
   const link = blank(profileUrl);
   // The stated platform's link and the explicit primary are the same address here;
   // keying it under both is what lets the projection resolve a primary either way.
   const socialUrls = link === null ? {} : {primary: link, ...(platform === '' ? {} : {[platform]: link})};
   const facts = { usernameHandle: blank(handle), headline: blank(headline), locationText: blank(locationText),
    avatarUrl: null, primaryPlatform: platform === '' ? null : platform, socialUrls,
    skillsTags: tags, externalFollowerCountText: blank(followers) };
   const draft = { title: name.trim(), ...facts, note: richNoteFromEditor(note), userRating: rating, mediaIds: media.map(item => item.id),...sectorPatch };
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
    await PeopleClient.updateRecommendation(observed, { displayOverrides: { title: draft.title, ...overridable }, note: draft.note, userRating: rating, mediaIds: draft.mediaIds,...sectorPatch }, updateKey.current.key, signal);
    assertCurrent(captured, operation);
   } else {
    if (intent.current?.scope !== captured || intent.current.signature !== signature) {
     const parent = await PeopleClient.observeCollection(listId, signal); assertCurrent(captured, operation);
     intent.current = { scope: captured, signature, value: PeopleClient.prepareManualIntent(parent, draft) };
    }
    assertCurrent(captured, operation); await PeopleClient.createManual(intent.current.value, signal); assertCurrent(captured, operation);
   }
   invalidatePeople(); toast.success('Person saved'); navigate(`/recommendations/people/${listId}`, { state: { justAddedRecommendation: true } });
  } catch (failure) { if (valid(captured, operation)) setError(failure instanceof Error ? failure.message : 'Person could not be saved'); }
  finally { if (valid(captured, operation)) setSaving(false); }
 };

 // Edit controls require the actual complete owner observation. A loaded draft stays
 // owned by its original observation across refreshes and never rebases.
 if (personId && initialized.current !== scope) {
  return <div className="min-h-screen text-dashboard p-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
   <button aria-label="Back to person list" onClick={() => navigate(`/recommendations/people/${listId}`)}><ArrowLeft size={20} /></button>
   <h1 className="font-semibold">Edit Person</h1>
   {owner.loading ? <p role="status">Loading person…</p> : <div role="alert"><p>{owner.error?.message || 'Person could not be loaded. Refresh before editing.'}</p><button onClick={owner.refetch}>Retry loading person</button></div>}
  </div>;
 }

 return <div className="min-h-screen text-dashboard">
  <header className="border-b border-dashboard-border px-4 md:px-6 py-3 flex items-center gap-3">
   <button aria-label="Back to person list" onClick={() => navigate(`/recommendations/people/${listId}`)}><ArrowLeft size={20} /></button>
   <h1 className="font-semibold">{personId ? 'Edit Person' : 'Add Person'}</h1>
  </header>
  <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
   {!personId && existingPeople.length > 0 && <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-3">
    <label className="block">Existing person
     <select value={existingId} onChange={event => setExistingId(event.target.value)} disabled={commands.loading} className="block w-full bg-dashboard-muted rounded-xl p-3">
      <option value="">Select a person</option>
      {existingPeople.map(person => <option key={person.documentId} value={person.documentId}>{person.name}</option>)}
     </select>
    </label>
    <button disabled={!existingId || commands.loading} onClick={attachExisting}>Add existing person to this list</button>
   </section>}

   <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-5">
    <h2 className="font-semibold flex gap-2"><Users size={18} />{personId ? 'My Person' : 'Add manually'}</h2>
    {personId && owner.loading && <p role="status">Loading person…</p>}
    {owner.error && <p role="alert">{owner.error.message}</p>}

    <label className="block">Full Name<input value={name} onChange={event => setName(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    <label className="block">Sector
     <select aria-label="Sector" value={sectorId} onChange={event=>{setSectorId(event.target.value);setSectorTouched(true);}} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3">
      <option value="">No sector</option>
      {existingSector&&!catalog?.items.some(item=>item.id===existingSector.id)&&<option value={existingSector.id} disabled>{existingSector.label??existingSector.slug} (unavailable)</option>}
      {catalog?.items.filter(item=>item.category==='people'&&item.parentId===null).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
     </select>
    </label>
    {catalogLoading&&<p role="status">Loading sectors…</p>}
    {catalog?.state==='UNCONFIGURED'&&<p role="status">Sector catalog is not configured.</p>}
    {existingSector&&(existingSector.unavailable||catalog&&!catalog.items.some(item=>item.id===existingSector.id))&&<p role="status">Existing sector is unavailable.</p>}
    {catalogError&&<div role="alert"><p>{catalogError}</p><button onClick={()=>setCatalogRetry(value=>value+1)}>Retry loading sectors</button></div>}
    <p className="text-sm text-dashboard-muted">Details are not fetched automatically. Fill in whatever you know; nothing you type is discarded.</p>

    <label className="block">Profile URL<input value={profileUrl} onChange={event => setProfileUrl(event.target.value)} disabled={saving} placeholder="https://example.com/their-profile" className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    {urlProblem && <p role="alert">{urlProblem}</p>}
    <label className="block">Platform
     <select value={platform} onChange={event => setPlatform(event.target.value as PersonPlatform | '')} disabled={saving} className="block bg-dashboard-muted p-2">
      <option value="">Unspecified</option>
      {PERSON_PLATFORMS.map(value => <option key={value} value={value}>{PLATFORM_LABELS[value]}</option>)}
     </select>
    </label>

    <label className="block">Handle / Username<input value={handle} onChange={event => setHandle(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    {personId && <p className="text-sm text-dashboard-muted">The handle identifies this person on their platform and is shared with everyone who recommends them, so changing it here does not re-point the shared record.</p>}
    <label className="block">Headline / Role<input value={headline} onChange={event => setHeadline(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    <label className="block">Location<input value={locationText} onChange={event => setLocationText(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    <label className="block">Followers<input value={followers} onChange={event => setFollowers(event.target.value)} disabled={saving} placeholder="12.4k" className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    <p className="text-sm text-dashboard-muted">Follower counts are text you record for presentation. Nothing here follows anyone.</p>

    <fieldset><legend>Tags</legend>
     <div className="flex gap-2">
      <input aria-label="New tag" value={tagDraft} disabled={saving || tags.length >= 32} onChange={event => setTagDraft(event.target.value)} className="bg-dashboard-muted rounded-xl p-2" />
      <button disabled={saving || !tagDraft.trim() || tags.length >= 32} onClick={addTag}>Add tag</button>
     </div>
     <div className="flex flex-wrap gap-2">{tags.map((tag, index) => <span key={tag} className="px-2 py-1 rounded-lg border border-white/10 text-sm">
      {tag}<button aria-label={`Remove tag ${tag}`} disabled={saving} onClick={() => setTags(value => value.filter((_row, at) => at !== index))}><X size={12} /></button>
     </span>)}</div>
    </fieldset>

    <label className="block">Your rating
     <select value={rating ?? ''} onChange={event => setRating(event.target.value ? Number(event.target.value) : null)} disabled={saving} className="block bg-dashboard-muted p-2">
      <option value="">No rating</option>
      {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
     </select>
    </label>

    <div><h3>My Thoughts</h3><TiptapEditor value={note} onChange={setNote} placeholder="Why do you recommend this person?" /></div>

    <label className="block">Snapshots<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={saving || pending > 0} onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
    {pending > 0 && <p role="status">Uploading snapshots…</p>}
    <div className="flex flex-wrap gap-3">{media.map(item => <div key={item.id}>
     <img className="w-24 h-24 object-cover rounded" src={item.url} alt="Person snapshot" />
     <button aria-label="Remove snapshot" disabled={saving} onClick={() => setMedia(value => value.filter(row => row.id !== item.id))}><X size={16} /></button>
    </div>)}</div>

    {error && <p role="alert">{error}</p>}
    <button onClick={save} disabled={saving || pending > 0 || !name.trim() || Boolean(urlProblem) || Boolean(personId && initialized.current !== scope)} className="bg-dashboard-accent text-white rounded-xl px-5 py-3">
     {saving && <Loader2 className="inline animate-spin mr-2" size={16} />}Save person
    </button>
   </section>
  </div>
 </div>;
}
