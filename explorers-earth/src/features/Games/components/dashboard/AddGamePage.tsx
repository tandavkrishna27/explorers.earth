import ReorderableMediaStrip from '../../../../components/reorder/ReorderableMediaStrip';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { friendlyErrorMessage } from "../../../../utils/friendlyError";
import { useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Gamepad2 } from 'lucide-react';
import { AddItemPage, ItemSearch, PickedItemCard, useAddItemMode, type ItemSearchResult } from '../../../shared/addItem';
import StarRating from '../../../../components/StarRating';
import TaxonomyCombobox from '../../../../components/TaxonomyCombobox';
import { suggestTermFromLabels, useCuratedCatalog } from '../../../../lib/curatedTaxonomy';
import { toast } from 'sonner';
import useAuthStore from '../../../../store/store';
import { ExplorersApiError, type RecommendationObservation } from '../../../../lib/explorersApiClient';
import type { GameCandidate } from '../../../../../../tunes/shared/explorersGameContract';
import { GamesClient, type ManualGameIntent } from '../../api/gamesClient';
import { useGamesCommands } from '../../api/query';
import { invalidateGames, useGamesOwner } from '../../hooks/useGamesOwner';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import TiptapEditor from '../../../Favorites/components/TiptapEditor';
import { useOriginBack } from "../../../../lib/navigation/useOriginBack";
import { listPath } from "../../../../lib/navigation/categoryRoutes";
import { useTranslation } from "react-i18next";

/** A comma-separated field as at most 12 trimmed, non-empty labels. */
const labels = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 12);

export default function AddGamePage() {
 const { listId, gameId } = useParams<{ listId: string; gameId?: string }>();
 const location = useLocation();
 const { t: tBack } = useTranslation();
 const back = useOriginBack({ to: listPath("games", listId!), label: tBack("dashboard.wp1.back.list") });
 const backText = back.source === "state" && back.label ? tBack("dashboard.wp1.back.to", { name: back.label }) : tBack("dashboard.wp1.back.list");
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId);
 const scope = JSON.stringify([generation, accountId, location.pathname, listId, gameId]);
 const currentScope = useRef(scope); currentScope.current = scope;
 const active = useRef(0), controller = useRef<AbortController>();
 const owner = useGamesOwner(undefined, true), commands = useGamesCommands();
 const [existingId, setExistingId] = useState('');
 const existingGames = [...new Map((owner.content?.view.lists.flatMap(list => list.recommended_games) ?? []).filter(game => !owner.content?.view.lists.find(list => list.documentId === listId)?.recommended_games.some(member => member.documentId === game.documentId)).map(game => [game.documentId, game])).values()];
 const attachExisting = async () => { const captured = scope; try { await commands.membership(existingId, listId!, true); if (valid(captured)) back.goBack(); } catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'Game could not be added')); } };
 const [title, setTitle] = useState(''), [note, setNote] = useState(''), [rating, setRating] = useState<number | null>(null);
 // Year, platforms and genres (GMS-X01): filled from an IGDB hit or typed; lists are comma-separated.
 const [year, setYear] = useState(''), [platforms, setPlatforms] = useState(''), [genres, setGenres] = useState('');
 const [media, setMedia] = useState<{ id: string; url: string }[]>([]), [pending, setPending] = useState(0);
 const [saving, setSaving] = useState(false), [error, setError] = useState('');
 const addMode = useAddItemMode<GameCandidate>(), hits = useRef(new Map<string, GameCandidate>()), [providerOff, setProviderOff] = useState(false);
 const [developer, setDeveloper] = useState('');
 // Curated category: sent only when the catalog is configured. An edit shows the stored assignment
 // from the observation and sends it only after the owner changes it (never a silent rewrite).
 const catalog = useCuratedCatalog('games'), configured = !catalog.loading && !catalog.error && !catalog.unconfigured && catalog.terms.length > 0;
 const taxonomyTerms = useMemo(() => catalog.terms.map((term, position) => ({ id: term.id, parentId: null, position, label: term.label })), [catalog.terms]);
 const [categoryId, setCategoryId] = useState<string | null>(null), [categoryTouched, setCategoryTouched] = useState(false);
 const initialized = useRef(''), draftObservation = useRef<RecommendationObservation>();
 const intent = useRef<{ scope: string; signature: string; value: ManualGameIntent }>();
 const updateKey = useRef<{ signature: string; key: string }>();
 const mounted = useRef(true), resetMode = addMode.reset;
 const pickSequence = useRef(0), pickedCover = useRef<string>(), pickFilled = useRef(false);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); active.current++; }; }, []);
 useEffect(() => { controller.current?.abort(); active.current++; initialized.current = ''; intent.current = undefined; updateKey.current = undefined; draftObservation.current = undefined; setTitle(''); setNote(''); setRating(null); setYear(''); setPlatforms(''); setGenres(''); setMedia([]); setPending(0); setSaving(false); setError(''); setExistingId(''); setDeveloper(''); setCategoryId(null); setCategoryTouched(false); setProviderOff(false); hits.current = new Map(); pickSequence.current++; pickFilled.current = false; pickedCover.current = undefined; resetMode(); }, [scope, resetMode]);
 useEffect(() => {
  if (!gameId || !owner.content || initialized.current === scope) return;
  const game = owner.content.view.lists.find(list => list.documentId === listId)?.recommended_games.find(row => row.documentId === gameId);
  const observed = owner.content.details.get(gameId);
  if (!game || !observed) return;
  initialized.current = scope; draftObservation.current = observed; setTitle(game.title); setNote(typeof game.user_recommendation_note === 'string' ? game.user_recommendation_note : ''); setRating(game.user_rating);
  setMedia(game.Media.flatMap(item => item.documentId ? [{ id: item.documentId, url: item.url }] : []));
  setCategoryId(observed.detail.curatedTerm?.term?.id ?? null); setCategoryTouched(false);
 }, [owner.content, scope, gameId, listId]);
 const valid = (captured: string, operation?: number) => mounted.current && currentScope.current === captured && (operation === undefined || active.current === operation);
 const assertCurrent = (captured: string, operation: number) => { if (!valid(captured, operation) || controller.current?.signal.aborted) throw new Error('Game owner or route changed'); };
 const upload = async (files: File[]) => {
  const captured = scope; setPending(value => value + files.length); setError('');
  for (const file of files) {
   if (!valid(captured)) return;
   try { const result = await GamesClient.upload(file, crypto.randomUUID()); if (!valid(captured)) return; setMedia(value => [...value, { id: result.id, url: `/api/explorers/v1/media/${result.id}/content` }]); }
   catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'Upload failed')); }
   finally { if (valid(captured)) setPending(value => value - 1); }
  }
 };
 const save = async () => {
  if (!listId || pending || saving || !title.trim() || (gameId && initialized.current !== scope)) return;
  const captured = scope, operation = ++active.current; controller.current?.abort(); controller.current = new AbortController(); const signal = controller.current.signal;
  setSaving(true); setError('');
  try {
   const category = configured && (!gameId || categoryTouched) ? { curatedTermId: categoryId } : {};
   const draft = { title, note: richNoteFromEditor(note), userRating: rating, mediaIds: media.map(item => item.id), ...category, ...(gameId ? {} : { releaseYear: year.trim() ? Number(year) : null, platforms: labels(platforms), genres: labels(genres), developer: developer.trim() || null }) }, signature = JSON.stringify(draft);
   assertCurrent(captured, operation);
   if (gameId) {
    const observed = owner.content?.details.get(gameId);
    if (!observed || draftObservation.current !== observed) throw new Error('Reload the game before saving');
    if (updateKey.current?.signature !== signature) updateKey.current = { signature, key: crypto.randomUUID() };
    assertCurrent(captured, operation); await GamesClient.updateRecommendation(observed, { displayOverrides: { title }, note: draft.note, userRating: rating, mediaIds: draft.mediaIds, ...category }, updateKey.current.key, signal); assertCurrent(captured, operation);
   } else {
    if (intent.current?.scope !== captured || intent.current.signature !== signature) {
     const parent = await GamesClient.observeCollection(listId, signal); assertCurrent(captured, operation);
     intent.current = { scope: captured, signature, value: GamesClient.prepareManualIntent(parent, draft) };
    }
    assertCurrent(captured, operation); await GamesClient.createManual(intent.current.value, signal); assertCurrent(captured, operation);
   }
   invalidateGames(); toast.success('Game saved'); back.goBack({ state: { justAddedRecommendation: true } });
  } catch (failure) { if (valid(captured, operation)) setError(friendlyErrorMessage(failure, 'Game could not be saved')); }
  finally { if (valid(captured, operation)) setSaving(false); }
 };
 // A hit only fills the form; the game is still saved as the owner's own entry.
 // ItemSearch owns debounce, abort and Enter (UAT-02); hits are kept by id for the pick.
 const search = useCallback(async (text: string, signal: AbortSignal): Promise<ItemSearchResult[]> => {
  try {
   const page = await GamesClient.search({ query: text, limit: 24 }, signal);
   hits.current = new Map(page.items.map(item => [item.externalId, item])); setProviderOff(false);
   return page.items.map(item => ({ id: item.externalId, title: item.title, subtitle: [item.year, item.platforms.join(' · ')].filter(Boolean).join(' · ') || undefined, imageUrl: item.coverUrl }));
  } catch (failure) { if (failure instanceof ExplorersApiError && failure.code === 'PROVIDER_NOT_CONFIGURED') { setProviderOff(true); return []; } throw failure; }
 }, []);
 const pickHit = (result: ItemSearchResult) => {
  const candidate = hits.current.get(result.id); if (!candidate) return;
  addMode.pick(candidate); setDeveloper(candidate.developer ?? '');
  if (configured) { setCategoryId(suggestTermFromLabels(catalog.terms, candidate.genres)); setCategoryTouched(true); }
  void choose(candidate);
 };
 // Changing a pick (or going manual after one) drops everything that pick filled in, mirroring
 // Books' clearSelection; a cover import still in flight for it is discarded on arrival.
 const clearPick = () => {
  pickSequence.current++; if (!pickFilled.current) return; pickFilled.current = false;
  const cover = pickedCover.current; pickedCover.current = undefined; if (cover) setMedia(value => value.filter(item => item.id !== cover));
  setTitle(''); setYear(''); setPlatforms(''); setGenres(''); setDeveloper(''); setCategoryId(null); setCategoryTouched(false);
 };
 const changePick = () => { clearPick(); addMode.change(); };
 const addManually = () => { clearPick(); addMode.goManual(); setTitle(value => value || addMode.query.trim()); };
 // The hit's cover is imported by the API (no hot-link) and becomes the first snapshot.
 const choose = async (candidate: GameCandidate) => {
  const captured = scope, sequence = ++pickSequence.current; pickFilled.current = true; setTitle(candidate.title); setYear(candidate.year ? String(candidate.year) : ''); setPlatforms(candidate.platforms.join(', ')); setGenres(candidate.genres.join(', '));
  const imageId = candidate.coverUrl?.match(/\/t_cover_big\/([A-Za-z0-9_-]+)\.jpg$/)?.[1];
  if (!imageId) return;
  setPending(value => value + 1);
  try { const cover = await GamesClient.importCover(imageId); if (!valid(captured) || pickSequence.current !== sequence) return; pickedCover.current = cover.id; const item = { id: cover.id, url: `/api/explorers/v1/media/${cover.id}/content` }; setMedia(value => value.some(existing => existing.id === item.id) ? value : [item, ...value]); }
  catch (failure) { if (valid(captured) && pickSequence.current === sequence) setError(friendlyErrorMessage(failure, 'The game cover could not be added. You can upload one below.')); }
  finally { if (valid(captured)) setPending(value => value - 1); }
 };
 // Edit controls require the actual complete owner observation. A loaded draft
 // stays owned by its original observation across refreshes and never rebases.
 if (gameId && initialized.current !== scope) {
  return <div className="min-h-screen text-dashboard p-4" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
   <button aria-label={backText} onClick={() => back.goBack()}><ArrowLeft size={20} /></button>
   <h1 className="font-semibold">Edit Game</h1>
   {owner.loading ? <p role="status">Loading game…</p> : <div role="alert"><p>{owner.error?.message || 'Game could not be loaded. Refresh before editing.'}</p><button onClick={owner.refetch}>Retry loading game</button></div>}
  </div>;
 }
 const mode = gameId ? 'manual' as const : addMode.mode;
 const providerOffNotice = providerOff ? <div role="status" className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-white/20 p-6 text-center"><p>Game search is not available yet. Add the game manually.</p><button type="button" onClick={addManually} className="rounded-xl bg-blue-400 px-4 py-2 text-white">Add manually</button></div> : undefined;
 return <div className="min-h-screen text-dashboard"><AddItemPage title={gameId ? 'Edit Game' : 'Add Game'} backLabel={backText} onBack={() => back.goBack()} mode={mode} onBackToSearch={gameId ? undefined : addMode.backToSearch}
  bar={{ onCancel: () => back.goBack(), onSave: () => { void save(); }, saving: saving ? 'save' : null, canSave: !saving && pending === 0 && Boolean(title.trim()) && !(gameId && initialized.current !== scope) }}>
   {mode === 'search' && <ItemSearch query={addMode.query} onQueryChange={addMode.setQuery} search={search} onPick={pickHit} onAddManually={addManually} placeholder="Search for a game..." override={providerOffNotice} />}
   {mode === 'search' && existingGames.length > 0 && <section><label>Existing game<select value={existingId} onChange={event => setExistingId(event.target.value)} disabled={commands.loading}><option value="">Select a game</option>{existingGames.map(game => <option key={game.documentId} value={game.documentId}>{game.title}</option>)}</select></label><button disabled={!existingId || commands.loading} onClick={attachExisting}>Add existing game to this list</button></section>}
   {mode === 'picked' && addMode.picked && <PickedItemCard title={addMode.picked.title} subtitle={[addMode.picked.year, addMode.picked.developer].filter(Boolean).join(' · ') || undefined} imageUrl={addMode.picked.coverUrl} onChange={changePick} />}
   {mode !== 'search' && <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-5"><h2 className="font-semibold flex gap-2"><Gamepad2 size={18} />{gameId ? 'My Game' : 'Your game'}</h2>
    {owner.error && <p role="alert">{owner.error.message}</p>}
    <label className="block">Game title<input value={title} onChange={event => setTitle(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    {!gameId && <div className="grid gap-3 sm:grid-cols-3">
     <label className="block sm:col-span-3">Developer<input value={developer} onChange={event => setDeveloper(event.target.value)} maxLength={200} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
     <label className="block">Release year<input type="number" inputMode="numeric" min={1900} max={2100} value={year} onChange={event => setYear(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
     <label className="block sm:col-span-2">Platforms<input value={platforms} onChange={event => setPlatforms(event.target.value)} placeholder="PC, Nintendo Switch" disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
     <label className="block sm:col-span-3">Genres<input value={genres} onChange={event => setGenres(event.target.value)} placeholder="Platform, Indie" disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    </div>}
    {configured && <TaxonomyCombobox terms={taxonomyTerms} levels={1} value={{ categoryId, subcategoryId: null }} onChange={value => { setCategoryId(value.categoryId); setCategoryTouched(true); }} labels={{ category: 'Category', subcategory: '' }} />}
    {/* The owner's own stars only; the IGDB rating is never fed in here (DS-15). */}
    <div className="grid gap-1"><span>Your rating</span><StarRating value={rating} onChange={setRating} label="Your rating" disabled={saving} /></div>
    <div><h3>My Thoughts</h3><TiptapEditor value={note} onChange={setNote} placeholder="Why do you recommend this game?" /></div>
    <label className="block">Snapshots<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={saving || pending > 0} onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
    {pending > 0 && <p role="status">Uploading snapshots…</p>}<ReorderableMediaStrip items={media} onChange={setMedia} noun="Snapshot" alt="Game snapshot" removeLabel="Remove snapshot" disabled={saving} />
    {error && <p role="alert">{error}</p>}
   </section>}
  </AddItemPage>
 </div>;
}
