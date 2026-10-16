import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Gamepad2, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import useAuthStore from '../../../../store/store';
import type { RecommendationObservation } from '../../../../lib/explorersApiClient';
import { GamesClient, type ManualGameIntent } from '../../api/gamesClient';
import { useGamesCommands } from '../../api/query';
import { invalidateGames, useGamesOwner } from '../../hooks/useGamesOwner';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import TiptapEditor from '../../../Favorites/components/TiptapEditor';

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
 const attachExisting = async () => { const captured = scope; try { await commands.membership(existingId, listId!, true); if (valid(captured)) navigate(`/recommendations/games/${listId}`); } catch (failure) { if (valid(captured)) setError(failure instanceof Error ? failure.message : 'Game could not be added'); } };
 const [title, setTitle] = useState(''), [note, setNote] = useState(''), [rating, setRating] = useState<number | null>(null);
 const [media, setMedia] = useState<{ id: string; url: string }[]>([]), [pending, setPending] = useState(0);
 const [saving, setSaving] = useState(false), [error, setError] = useState(''), [query, setQuery] = useState(''), [searchError, setSearchError] = useState('');
 const initialized = useRef(''), draftObservation = useRef<RecommendationObservation>();
 const intent = useRef<{ scope: string; signature: string; value: ManualGameIntent }>();
 const updateKey = useRef<{ signature: string; key: string }>();
 const mounted = useRef(true);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); active.current++; }; }, []);
 useEffect(() => { controller.current?.abort(); active.current++; initialized.current = ''; intent.current = undefined; updateKey.current = undefined; draftObservation.current = undefined; setTitle(''); setNote(''); setRating(null); setMedia([]); setPending(0); setSaving(false); setError(''); setSearchError(''); setExistingId(''); }, [scope]);
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
   catch (failure) { if (valid(captured)) setError(failure instanceof Error ? failure.message : 'Upload failed'); }
   finally { if (valid(captured)) setPending(value => value - 1); }
  }
 };
 const save = async () => {
  if (!listId || pending || saving || !title.trim() || (gameId && initialized.current !== scope)) return;
  const captured = scope, operation = ++active.current; controller.current?.abort(); controller.current = new AbortController(); const signal = controller.current.signal;
  setSaving(true); setError('');
  try {
   const draft = { title, note: richNoteFromEditor(note), userRating: rating, mediaIds: media.map(item => item.id) }, signature = JSON.stringify(draft);
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
  } catch (failure) { if (valid(captured, operation)) setError(failure instanceof Error ? failure.message : 'Game could not be saved'); }
  finally { if (valid(captured, operation)) setSaving(false); }
 };
 const search = async () => { const captured = scope; setSearchError(''); try { await GamesClient.search({ query: query.trim(), limit: 24 }); if (valid(captured)) setSearchError('Provider game acquisition is unavailable. Your manual draft is preserved.'); } catch (failure) { if (valid(captured)) setSearchError(failure instanceof Error ? failure.message : 'Provider search unavailable'); } };
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
   {!gameId && <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-3"><h2 className="font-semibold flex gap-2"><Search size={18} />Find a game</h2><input aria-label="Search for a game" placeholder="Search for a game..." value={query} onChange={event => setQuery(event.target.value)} className="w-full bg-dashboard-muted rounded-xl p-3" /><button disabled={!query.trim()} onClick={search}>Search</button>{searchError && <p role="status">{searchError}</p>}<p className="text-sm text-dashboard-muted">You can add your own game below.</p></section>}
   {!gameId && existingGames.length > 0 && <section><label>Existing game<select value={existingId} onChange={event => setExistingId(event.target.value)} disabled={commands.loading}><option value="">Select a game</option>{existingGames.map(game => <option key={game.documentId} value={game.documentId}>{game.title}</option>)}</select></label><button disabled={!existingId || commands.loading} onClick={attachExisting}>Add existing game to this list</button></section>}
   <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-5"><h2 className="font-semibold flex gap-2"><Gamepad2 size={18} />{gameId ? 'My Game' : 'Add manually'}</h2>
    {gameId && owner.loading && <p>Loading game…</p>}{owner.error && <p role="alert">{owner.error.message}</p>}
    <label className="block">Game title<input value={title} onChange={event => setTitle(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    <label className="block">Your rating<select value={rating ?? ''} onChange={event => setRating(event.target.value ? Number(event.target.value) : null)} disabled={saving} className="block bg-dashboard-muted p-2"><option value="">No rating</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
    <div><h3>My Thoughts</h3><TiptapEditor value={note} onChange={setNote} placeholder="Why do you recommend this game?" /></div>
    <label className="block">Snapshots<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={saving || pending > 0} onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
    {pending > 0 && <p role="status">Uploading snapshots…</p>}<div className="flex flex-wrap gap-3">{media.map(item => <div key={item.id}><img className="w-24 h-24 object-cover rounded" src={item.url} alt="Game snapshot" /><button aria-label="Remove snapshot" disabled={saving} onClick={() => setMedia(value => value.filter(row => row.id !== item.id))}><X size={16} /></button></div>)}</div>
    {error && <p role="alert">{error}</p>}<button onClick={save} disabled={saving || pending > 0 || !title.trim() || Boolean(gameId && initialized.current !== scope)} className="bg-dashboard-accent text-white rounded-xl px-5 py-3">{saving && <Loader2 className="inline animate-spin mr-2" size={16} />}Save game</button>
   </section>
  </div>
 </div>;
}
