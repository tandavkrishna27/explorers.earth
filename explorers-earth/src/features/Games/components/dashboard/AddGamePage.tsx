import ReorderableMediaStrip from '../../../../components/reorder/ReorderableMediaStrip';
import { useEffect, useRef, useState } from 'react';
import { friendlyErrorMessage } from "../../../../utils/friendlyError";
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Gamepad2, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import useAuthStore from '../../../../store/store';
import { ExplorersApiError, type RecommendationObservation } from '../../../../lib/explorersApiClient';
import type { GameCandidate } from '../../../../../../tunes/shared/explorersGameContract';
import { GamesClient, type ManualGameIntent } from '../../api/gamesClient';
import { useGamesCommands } from '../../api/query';
import { invalidateGames, useGamesOwner } from '../../hooks/useGamesOwner';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import TiptapEditor from '../../../Favorites/components/TiptapEditor';

/** A comma-separated field as at most 12 trimmed, non-empty labels. */
const labels = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 12);

export default function AddGamePage() {
 const { listId, gameId } = useParams<{ listId: string; gameId?: string }>();
 const location = useLocation(), navigate = useNavigate();
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId);
 const scope = JSON.stringify([generation, accountId, location.pathname, listId, gameId]);
 const currentScope = useRef(scope); currentScope.current = scope;
 const active = useRef(0), controller = useRef<AbortController>();
 const owner = useGamesOwner(undefined, true), commands = useGamesCommands();
 const [existingId, setExistingId] = useState('');
 const existingGames = [...new Map((owner.content?.view.lists.flatMap(list => list.recommended_games) ?? []).filter(game => !owner.content?.view.lists.find(list => list.documentId === listId)?.recommended_games.some(member => member.documentId === game.documentId)).map(game => [game.documentId, game])).values()];
 const attachExisting = async () => { const captured = scope; try { await commands.membership(existingId, listId!, true); if (valid(captured)) navigate(`/recommendations/games/${listId}`); } catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'Game could not be added')); } };
 const [title, setTitle] = useState(''), [note, setNote] = useState(''), [rating, setRating] = useState<number | null>(null);
 // Year, platforms and genres (GMS-X01): filled from an IGDB hit or typed; lists are comma-separated.
 const [year, setYear] = useState(''), [platforms, setPlatforms] = useState(''), [genres, setGenres] = useState('');
 const [media, setMedia] = useState<{ id: string; url: string }[]>([]), [pending, setPending] = useState(0);
 const [saving, setSaving] = useState(false), [error, setError] = useState(''), [query, setQuery] = useState(''), [searchError, setSearchError] = useState('');
 const [candidates, setCandidates] = useState<GameCandidate[]>([]), [searching, setSearching] = useState(false);
 const initialized = useRef(''), draftObservation = useRef<RecommendationObservation>();
 const intent = useRef<{ scope: string; signature: string; value: ManualGameIntent }>();
 const updateKey = useRef<{ signature: string; key: string }>();
 const mounted = useRef(true);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); active.current++; }; }, []);
 useEffect(() => { controller.current?.abort(); active.current++; initialized.current = ''; intent.current = undefined; updateKey.current = undefined; draftObservation.current = undefined; setTitle(''); setNote(''); setRating(null); setYear(''); setPlatforms(''); setGenres(''); setMedia([]); setPending(0); setSaving(false); setError(''); setSearchError(''); setCandidates([]); setSearching(false); setExistingId(''); }, [scope]);
 useEffect(() => {
  if (!gameId || !owner.content || initialized.current === scope) return;
  const game = owner.content.view.lists.find(list => list.documentId === listId)?.recommended_games.find(row => row.documentId === gameId);
  const observed = owner.content.details.get(gameId);
  if (!game || !observed) return;
  initialized.current = scope; draftObservation.current = observed; setTitle(game.title); setNote(typeof game.user_recommendation_note === 'string' ? game.user_recommendation_note : ''); setRating(game.user_rating);
  setMedia(game.Media.flatMap(item => item.documentId ? [{ id: item.documentId, url: item.url }] : []));
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
   const draft = { title, note: richNoteFromEditor(note), userRating: rating, mediaIds: media.map(item => item.id), ...(gameId ? {} : { releaseYear: year.trim() ? Number(year) : null, platforms: labels(platforms), genres: labels(genres) }) }, signature = JSON.stringify(draft);
   assertCurrent(captured, operation);
   if (gameId) {
    const observed = owner.content?.details.get(gameId);
    if (!observed || draftObservation.current !== observed) throw new Error('Reload the game before saving');
    if (updateKey.current?.signature !== signature) updateKey.current = { signature, key: crypto.randomUUID() };
    assertCurrent(captured, operation); await GamesClient.updateRecommendation(observed, { displayOverrides: { title }, note: draft.note, userRating: rating, mediaIds: draft.mediaIds }, updateKey.current.key, signal); assertCurrent(captured, operation);
   } else {
    if (intent.current?.scope !== captured || intent.current.signature !== signature) {
     const parent = await GamesClient.observeCollection(listId, signal); assertCurrent(captured, operation);
     intent.current = { scope: captured, signature, value: GamesClient.prepareManualIntent(parent, draft) };
    }
    assertCurrent(captured, operation); await GamesClient.createManual(intent.current.value, signal); assertCurrent(captured, operation);
   }
   invalidateGames(); toast.success('Game saved'); navigate(`/recommendations/games/${listId}`, { state: { justAddedRecommendation: true } });
  } catch (failure) { if (valid(captured, operation)) setError(friendlyErrorMessage(failure, 'Game could not be saved')); }
  finally { if (valid(captured, operation)) setSaving(false); }
 };
 // A hit only fills the form; the game is still saved as the owner's own entry.
 const search = async () => {
  const captured = scope; setSearchError(''); setCandidates([]); setSearching(true);
  try { const page = await GamesClient.search({ query: query.trim(), limit: 24 }); if (!valid(captured)) return; setCandidates([...page.items]); if (!page.items.length) setSearchError('No games found. Add the game manually below.'); }
  catch (failure) { if (valid(captured)) setSearchError(failure instanceof ExplorersApiError && failure.code === 'PROVIDER_NOT_CONFIGURED' ? 'Game search is not available yet. Add the game manually below.' : friendlyErrorMessage(failure, 'Provider search unavailable')); }
  finally { if (valid(captured)) setSearching(false); }
 };
 // The hit's cover is imported by the API (no hot-link) and becomes the first snapshot.
 const choose = async (candidate: GameCandidate) => {
  const captured = scope; setTitle(candidate.title); setCandidates([]); setYear(candidate.year ? String(candidate.year) : ''); setPlatforms(candidate.platforms.join(', ')); setGenres(candidate.genres.join(', '));
  const imageId = candidate.coverUrl?.match(/\/t_cover_big\/([A-Za-z0-9_-]+)\.jpg$/)?.[1];
  if (!imageId) return;
  setPending(value => value + 1);
  try { const cover = await GamesClient.importCover(imageId); if (!valid(captured)) return; const item = { id: cover.id, url: `/api/explorers/v1/media/${cover.id}/content` }; setMedia(value => value.some(existing => existing.id === item.id) ? value : [item, ...value]); }
  catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'The game cover could not be added. You can upload one below.')); }
  finally { if (valid(captured)) setPending(value => value - 1); }
 };
 // Edit controls require the actual complete owner observation. A loaded draft
 // stays owned by its original observation across refreshes and never rebases.
 if (gameId && initialized.current !== scope) {
  return <div className="min-h-screen text-dashboard p-4" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
   <button aria-label="Back to game list" onClick={() => navigate(`/recommendations/games/${listId}`)}><ArrowLeft size={20} /></button>
   <h1 className="font-semibold">Edit Game</h1>
   {owner.loading ? <p role="status">Loading game…</p> : <div role="alert"><p>{owner.error?.message || 'Game could not be loaded. Refresh before editing.'}</p><button onClick={owner.refetch}>Retry loading game</button></div>}
  </div>;
 }
 return <div className="min-h-screen text-dashboard"><header className="border-b border-dashboard-border px-4 md:px-6 py-3 flex items-center gap-3"><button aria-label="Back to game list" onClick={() => navigate(`/recommendations/games/${listId}`)}><ArrowLeft size={20} /></button><h1 className="font-semibold">{gameId ? 'Edit Game' : 'Add Game'}</h1></header>
  <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
   {!gameId && <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-3"><h2 className="font-semibold flex gap-2"><Search size={18} />Find a game</h2><input aria-label="Search for a game" placeholder="Search for a game..." value={query} onChange={event => setQuery(event.target.value)} className="w-full bg-dashboard-muted rounded-xl p-3" /><button disabled={!query.trim() || searching} onClick={search}>Search</button>{searching && <Loader2 className="inline animate-spin ml-2" size={16} aria-hidden />}{searchError && <p role="status">{searchError}</p>}
    {candidates.length > 0 && <ul className="space-y-2">{candidates.map(candidate => { const label = candidate.year ? `${candidate.title} (${candidate.year})` : candidate.title; return <li key={candidate.externalId}><button type="button" aria-label={`Use ${label}`} onClick={() => { void choose(candidate); }} className="flex w-full items-center gap-3 rounded-xl bg-dashboard-muted p-2 text-left">
     {candidate.coverUrl ? <img src={candidate.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-12 shrink-0 rounded object-cover" /> : <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-dashboard-sidebar"><Gamepad2 size={18} aria-hidden /></span>}
     <span className="min-w-0"><span className="block font-medium truncate">{label}</span>{candidate.platforms.length > 0 && <span className="block text-sm text-dashboard-muted truncate">{candidate.platforms.join(' · ')}</span>}{candidate.genres.length > 0 && <span className="block text-xs text-dashboard-muted truncate">{candidate.genres.join(', ')}</span>}</span>
    </button></li>; })}</ul>}<p className="text-sm text-dashboard-muted">You can add your own game below.</p></section>}
   {!gameId && existingGames.length > 0 && <section><label>Existing game<select value={existingId} onChange={event => setExistingId(event.target.value)} disabled={commands.loading}><option value="">Select a game</option>{existingGames.map(game => <option key={game.documentId} value={game.documentId}>{game.title}</option>)}</select></label><button disabled={!existingId || commands.loading} onClick={attachExisting}>Add existing game to this list</button></section>}
   <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-5"><h2 className="font-semibold flex gap-2"><Gamepad2 size={18} />{gameId ? 'My Game' : 'Add manually'}</h2>
    {gameId && owner.loading && <p>Loading game…</p>}{owner.error && <p role="alert">{owner.error.message}</p>}
    <label className="block">Game title<input value={title} onChange={event => setTitle(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    {!gameId && <div className="grid gap-3 sm:grid-cols-3">
     <label className="block">Release year<input type="number" inputMode="numeric" min={1900} max={2100} value={year} onChange={event => setYear(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
     <label className="block sm:col-span-2">Platforms<input value={platforms} onChange={event => setPlatforms(event.target.value)} placeholder="PC, Nintendo Switch" disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
     <label className="block sm:col-span-3">Genres<input value={genres} onChange={event => setGenres(event.target.value)} placeholder="Platform, Indie" disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    </div>}
    <label className="block">Your rating<select value={rating ?? ''} onChange={event => setRating(event.target.value ? Number(event.target.value) : null)} disabled={saving} className="block bg-dashboard-muted p-2"><option value="">No rating</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
    <div><h3>My Thoughts</h3><TiptapEditor value={note} onChange={setNote} placeholder="Why do you recommend this game?" /></div>
    <label className="block">Snapshots<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={saving || pending > 0} onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
    {pending > 0 && <p role="status">Uploading snapshots…</p>}<ReorderableMediaStrip items={media} onChange={setMedia} noun="Snapshot" alt="Game snapshot" removeLabel="Remove snapshot" disabled={saving} />
    {error && <p role="alert">{error}</p>}<button onClick={save} disabled={saving || pending > 0 || !title.trim() || Boolean(gameId && initialized.current !== scope)} className="bg-dashboard-accent text-white rounded-xl px-5 py-3">{saving && <Loader2 className="inline animate-spin mr-2" size={16} />}Save game</button>
   </section>
  </div>
 </div>;
}
