import { explorersApiClient } from '../../../../lib/explorersApiClient';
import { useMoviesOwner, useMovieGenres, invalidateMovies } from '../../api/explorersAdapter';
import { moviesCommandKey } from '../../api/moviesClient';
import type { MovieCandidate } from '../../../../../../tunes/shared/explorersMovieContract';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import useAuthStore from '../../../../store/store';
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Film, Star, Tv, Clock,
  Loader2, Check, Search, X, CheckCircle2, User, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useTMDBSearch } from "../../hooks/useTMDBSearch";
import type { WatchProvider, TMDBCastMember } from "../../types";
import {
  buildPosterUrl, buildBackdropUrl, extractNoteText, getGenreNames,
} from "../../utils/movieHelpers";

import TiptapEditor from "../../../Favorites/components/TiptapEditor";

const FALLBACK_POSTER = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='150' viewBox='0 0 100 150'><rect width='100' height='150' fill='%230d1117'/></svg>`;

// ──────────────────────────────────────────────
// Inline Search (only in create mode)
// ──────────────────────────────────────────────
const InlineSearch = ({
  onSelect,
  onClear,
  selectedTitle,
}: {
  onSelect: (r: MovieCandidate) => void;
  onClear: () => void;
  selectedTitle?: string;
}) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!selectedTitle);
  const { results, loading, error, hasMore, loadingMore, loadMore, retry } = useTMDBSearch(query);

  if (selectedTitle && !open) {
    return (
      <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-6">
        <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
        <span className="text-sm text-white flex-1 truncate">{selectedTitle}</span>
        <button
          onClick={() => { onClear(); setOpen(true); setQuery(""); }}
          className="text-white/30 hover:text-white transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          autoFocus
          type="text"
          placeholder='Search "Interstellar", "Breaking Bad"...'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-dashboard-muted border border-dashboard-border rounded-xl pl-9 pr-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none focus:border-dashboard-accent transition-all"
        />
        {loading && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 animate-spin" />
        )}
      </div>

      {results.length > 0 && (
        <div className="mt-2 bg-dashboard-sidebar border border-dashboard-border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
          {results.map((result) => {
            const title = result.title;
            const year = result.yearText ?? "";
            const posterUrl = buildPosterUrl(result.posterUrl, "w185");
            return (
              <button
                key={`${result.externalKind}:${result.externalId}`}
                onClick={() => { onSelect(result); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dashboard-muted border-b border-dashboard-border last:border-b-0 transition-colors text-left"
              >
                <div className="w-8 flex-shrink-0 rounded overflow-hidden bg-dashboard-muted">
                  <div className="aspect-[2/3]">
                    <img
                      src={posterUrl || FALLBACK_POSTER}
                      alt={title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
                    />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{title}</p>
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <span>{year}</span>
                    {result.externalKind === "tv"
                      ? <span className="flex items-center gap-0.5 text-blue-400"><Tv size={10} /> TV</span>
                      : <span className="flex items-center gap-0.5"><Film size={10} /> Movie</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {error && <div><p role="alert">{error}</p><button type="button" onClick={() => void retry()} disabled={loading || loadingMore}>Retry search</button></div>}
      {hasMore && <button onClick={() => void loadMore()} disabled={loadingMore}>Load more results</button>}
      {query.length > 2 && !loading && results.length === 0 && (
        <p className="text-sm text-white/30 text-center py-4">No results found.</p>
      )}
      {query.length === 0 && (
        <p className="text-xs text-white/30 mt-2">Start typing to search movies & TV shows on TMDB</p>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────
// Form state interface
// ──────────────────────────────────────────────
interface FormState {
  title: string;
  originalTitle: string;
  year: string;
  director: string;
  runtime: string;
  seasonCount: string;
  rating: string;
  overview: string;
  genres: string;
  note: string;
  userRating: number | null;
  categoryIds: string[];
}

// ──────────────────────────────────────────────
// Main Page — handles both create & edit
// ──────────────────────────────────────────────
const AddMoviePage = () => {
 const {listId,movieId}=useParams<{listId:string;movieId?:string}>(),navigate=useNavigate(),isEdit=Boolean(movieId);
 const generation=useAuthStore(state=>state.generation),selectionAttempt=useRef(0),selectionController=useRef<AbortController>();
 const initializedDraft=useRef<string>(),saveBusy=useRef(false),saveController=useRef<AbortController>();
 const commandKeys=useRef(new Map<string,string>());
 const createIntent=useRef<{fingerprint:string;parent:Awaited<ReturnType<typeof explorersApiClient.getMyEditableCollection>>;key:string}>();
 const commandKey=(operation:string,input:unknown)=>{const fingerprint=JSON.stringify([generation,listId,movieId,operation,input]);const existing=commandKeys.current.get(fingerprint);if(existing)return existing;const key=moviesCommandKey();commandKeys.current.set(fingerprint,key);return key;};
 const [selected,setSelected]=useState<MovieCandidate|null>(null),[manual,setManual]=useState(false),[entityId,setEntityId]=useState<string|null>(null);
 const [mediaType,setMediaType]=useState<'movie'|'tv'>('movie'),[posterPath,setPosterPath]=useState<string|null>(null),[backdropPath,setBackdropPath]=useState<string|null>(null);
 const [watchProviders,setWatchProviders]=useState<WatchProvider[]>([]),[castMembers,setCastMembers]=useState<TMDBCastMember[]>([]),[loadingDetails,setLoadingDetails]=useState(false),[saving,setSaving]=useState(false);
 const loadingProviders=false;
 const [existingSnapshots,setExistingSnapshots]=useState<{id:string;url:string}[]>([]),[newSnapshots,setNewSnapshots]=useState<File[]>([]),[formReady,setFormReady]=useState(!isEdit);
 const snapshotPreviews=useMemo(()=>newSnapshots.map(file=>({file,url:URL.createObjectURL(file)})),[newSnapshots]);
 useEffect(()=>()=>snapshotPreviews.forEach(preview=>URL.revokeObjectURL(preview.url)),[snapshotPreviews]);
 const emptyForm:FormState={title:'',originalTitle:'',year:'',director:'',runtime:'',seasonCount:'',rating:'',overview:'',genres:'',note:'',userRating:null,categoryIds:[]};
 const [form,setForm]=useState<FormState>(emptyForm);
 const {data:categoriesData,error:genreError}=useMovieGenres(),categories=categoriesData?.movieCategories??[];
 const owner=useMoviesOwner(listId,isEdit),observed=movieId?owner.content?.details.get(movieId):undefined;
 const draftObservation=useRef<typeof observed>();
 const formScope=JSON.stringify([generation,listId,movieId]);
 const latestFormScope=useRef(formScope);latestFormScope.current=formScope;
 useEffect(()=>{saveController.current?.abort();saveController.current=undefined;saveBusy.current=false;setSaving(false);return()=>saveController.current?.abort();},[generation,listId,movieId]);
 useEffect(()=>{initializedDraft.current=undefined;draftObservation.current=undefined;createIntent.current=undefined;commandKeys.current.clear();setForm({title:'',originalTitle:'',year:'',director:'',runtime:'',seasonCount:'',rating:'',overview:'',genres:'',note:'',userRating:null,categoryIds:[]});setFormReady(!movieId);setSelected(null);setManual(false);setEntityId(null);setExistingSnapshots([]);setNewSnapshots([]);setPosterPath(null);setBackdropPath(null);setCastMembers([]);setWatchProviders([]);},[generation,listId,movieId]);
 useEffect(()=>()=>{selectionController.current?.abort();selectionAttempt.current++;},[generation,listId,movieId]);
 useEffect(()=>{if(!isEdit||!movieId||!owner.data)return;const scope=`${generation}:${listId}:${movieId}`;if(initializedDraft.current===scope)return;const movie=owner.data.movieLists[0]?.recommended_movies.find(value=>value.documentId===movieId);if(!movie||!observed)return;initializedDraft.current=scope;draftObservation.current=observed;
  setEntityId(movie.entity_id??null);setPosterPath(movie.poster_path);setBackdropPath(movie.backdrop_path);setMediaType(movie.media_type==='TV'?'tv':'movie');setWatchProviders(movie.watch_providers);setCastMembers((movie.cast_details??[]).map((cast,index)=>({id:index,name:cast.original_name,character:cast.character,profile_path:cast.profile_url})));setExistingSnapshots(movie.Media.map(media=>({id:media.documentId!,url:media.url})));
  setForm({title:movie.title,originalTitle:movie.original_title??'',year:movie.year??'',director:movie.director??'',runtime:movie.runtime==null?'':String(movie.runtime),seasonCount:movie.season_count==null?'':String(movie.season_count),rating:movie.tmdb_rating==null?'':String(movie.tmdb_rating),overview:movie.overview??'',genres:getGenreNames(movie.genres).join(', '),note:extractNoteText(movie.user_recommendation_note),userRating:movie.user_rating??null,categoryIds:movie.movie_categories?.map(term=>term.documentId)??[]});setFormReady(true);
 },[generation,isEdit,listId,movieId,owner.data,observed]);
 const setField=(key:keyof FormState)=>(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>setForm(previous=>({...previous,[key]:event.target.value}));
 const handleSelect=async(candidate:MovieCandidate)=>{selectionController.current?.abort();const controller=new AbortController();selectionController.current=controller;const attempt=++selectionAttempt.current;setLoadingDetails(true);
  try{const entity=await explorersApiClient.resolveMovieEntity({kind:'provider',category:'movies',provider:'tmdb',externalKind:candidate.externalKind,externalId:candidate.externalId},commandKey('resolve-provider',[candidate.externalKind,candidate.externalId]),controller.signal);if(controller.signal.aborted||attempt!==selectionAttempt.current)return;const facts=entity.details;setSelected(candidate);setManual(false);setEntityId(entity.id);setMediaType(facts.mediaType);setPosterPath(facts.posterUrl);setBackdropPath(facts.backdropUrl);const region=facts.watchProviders.US,seen=new Set<number>();const offers=region?[...region.flatrate,...region.rent,...region.buy].filter(offer=>{if(seen.has(offer.providerId))return false;seen.add(offer.providerId);return true;}).sort((a,b)=>a.priority-b.priority).slice(0,8):[];setWatchProviders(offers.map(offer=>({provider_id:offer.providerId,provider_name:offer.name,logo_path:offer.logoUrl,...(region?.link?{link:region.link}:{})})));setCastMembers(facts.cast.slice(0,10).map(cast=>({id:cast.personId,name:cast.name,character:cast.character,profile_path:cast.profileUrl})));
  setForm(previous=>({...previous,title:entity.title,originalTitle:facts.originalTitle??'',year:facts.yearText??'',director:facts.director??'',runtime:facts.runtimeMinutes==null?'':String(facts.runtimeMinutes),seasonCount:facts.seasonCount==null?'':String(facts.seasonCount),rating:facts.providerRating==null?'':String(facts.providerRating),overview:facts.overview??'',genres:facts.genres.map(genre=>genre.name).join(', '),categoryIds:facts.genres.flatMap(genre=>{const term=categories.find(value=>value.genre_name.toLowerCase()===genre.name.toLowerCase());return term?[term.documentId]:[];})}));
  }catch{if(!controller.signal.aborted&&attempt===selectionAttempt.current)toast.error('Provider details unavailable. Your draft is preserved; retry or add manually.');}finally{if(!controller.signal.aborted&&attempt===selectionAttempt.current)setLoadingDetails(false);}
 };
 const handleClear=()=>{selectionController.current?.abort();selectionAttempt.current++;setSelected(null);setManual(false);setEntityId(null);setPosterPath(null);setBackdropPath(null);setWatchProviders([]);setCastMembers([]);setForm(emptyForm);setLoadingDetails(false);};
 const handleSave = async () => {
  if (!listId || saveBusy.current || !form.title.trim()) return;
  if (existingSnapshots.length + newSnapshots.length > 20) { toast.error('Maximum 20 snapshots.'); return; }
  const controller = new AbortController();
  const account = useAuthStore.getState();
  const capturedAccount = account.accountId;
  saveController.current = controller;
  const alive = () => !controller.signal.aborted && saveController.current === controller &&
   latestFormScope.current === formScope && useAuthStore.getState().generation === generation &&
   useAuthStore.getState().accountId === capturedAccount;
  if (!alive()) return;
  saveBusy.current = true; setSaving(true);
  try {
   let targetEntity = entityId;
   if (!isEdit && manual) {
    if (!alive()) return;
    const entity = await explorersApiClient.resolveMovieEntity({kind:'manual',category:'movies',details:{title:form.title,mediaType,originalTitle:form.originalTitle||null,yearText:form.year||null,director:form.director||null,runtimeMinutes:form.runtime===''?null:Number(form.runtime),seasonCount:mediaType==='tv'&&form.seasonCount!==''?Number(form.seasonCount):null,providerRating:form.rating===''?null:Number(form.rating),overview:form.overview||null}},commandKey('resolve-manual',[form.title,mediaType,form.originalTitle,form.year,form.director,form.runtime,form.seasonCount,form.rating,form.overview]),controller.signal);
    if (!alive()) return;
    targetEntity = entity.id;
   }
   if (!targetEntity) throw Error('Select a title or add manually');
   const snapshots = [...existingSnapshots];
   for (const file of newSnapshots) {
    if (!alive()) return;
    const media = await explorersApiClient.createMedia(file,'recommendation',controller.signal);
    if (!alive()) return;
    snapshots.push({id:media.id,url:`/api/explorers/v1/media/${media.id}/content`});
    setExistingSnapshots([...snapshots]); setNewSnapshots(previous=>previous.filter(value=>value!==file));
   }
   const patch={note:richNoteFromEditor(form.note),userRating:form.userRating,mediaIds:snapshots.map(media=>media.id),movieTermIds:form.categoryIds,displayOverrides:{title:form.title,originalTitle:form.originalTitle||null,yearText:form.year||null,director:form.director||null,runtimeMinutes:form.runtime===''?null:Number(form.runtime),seasonCount:mediaType==='tv'&&form.seasonCount!==''?Number(form.seasonCount):null,overview:form.overview||null}};
   if (!alive()) return;
   if (isEdit) {
    const observed = draftObservation.current;
    if (!observed) throw Error('Refresh this Movie before saving');
    await explorersApiClient.updateMyRecommendation(observed,patch,commandKey('update',patch),controller.signal);
    if (!alive()) return;
   } else {
    const input={entityId:targetEntity,...patch,publicationState:'published' as const};
    const fingerprint=JSON.stringify([generation,listId,input]);
    if (createIntent.current?.fingerprint!==fingerprint) {
     if (!alive()) return;
     const parent = await explorersApiClient.getMyEditableCollection(listId,controller.signal);
     if (!alive()) return;
     createIntent.current={fingerprint,parent,key:commandKey('create',input)};
    }
    const intent=createIntent.current;
    if (!alive()) return;
    const recommendation=await explorersApiClient.createMyRecommendation(intent.parent,input,intent.key,controller.signal);
    if (!alive()) return;
    if (selected) {
     try {
      if (!alive()) return;
      const fresh=await explorersApiClient.getMyEditableRecommendation(recommendation.id,controller.signal);
      if (!alive()) return;
      const imported=await explorersApiClient.importMovieMedia(fresh,moviesCommandKey(),controller.signal);
      if (!alive()) return;
      if(imported.slots.some(slot=>slot.status==='unavailable'))toast.info('Saved. Some provider images could not be copied.');
      if (!alive()) return;
      await explorersApiClient.getMyEditableRecommendation(recommendation.id,controller.signal);
      if (!alive()) return;
     } catch {
      if (!alive()) return;
      toast.info('Movie saved. Provider image copying is unavailable; original images remain.');
     }
    }
   }
   if (!alive()) return;
   invalidateMovies();toast.success(isEdit?'Movie updated!':'Movie added!');navigate(`/recommendations/movies/${listId}`,{state:{justAddedRecommendation:true}});
  } catch(error) {
   if (alive()) toast.error(error instanceof Error?error.message:'Failed to save. Your draft is preserved.');
  } finally {
   if (alive()) { saveBusy.current=false;setSaving(false);saveController.current=undefined; }
  }
 };
 const posterUrl=buildPosterUrl(posterPath,'w342'),backdropUrl=buildBackdropUrl(backdropPath,'w780'),showForm=isEdit?formReady:Boolean(selected)||manual;
  return (
    <div className="min-h-screen text-dashboard">
      {/* Sticky header */}
      <div className="border-b border-dashboard-border px-4 md:px-6 py-3 flex items-center gap-3 sticky top-0 bg-dashboard-bg z-40 w-full">
        <button
          onClick={() => navigate(`/recommendations/movies/${listId}`)}
          className="text-white/40 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-dashboard">
            {isEdit ? "Edit Movie" : "Add Movie or Show"}
          </h1>
          <p className="text-xs text-dashboard-muted mt-0.5">
            {isEdit
              ? "Update the details and save your changes"
              : selected
                ? "Edit the details below before saving"
                : "Search and select a title from TMDB"}
          </p>
        </div>
        {loadingDetails && (
          <div className="flex items-center gap-2 text-xs text-blue-400">
            <Loader2 size={14} className="animate-spin" />
            Loading details…
          </div>
        )}
      </div>

      {/* Single-column form */}
      <div className="max-w-2xl mx-auto px-6 pt-6 pb-40 md:pb-8 space-y-5">

        {/* Search — only in create mode */}
        {!isEdit && (
          <InlineSearch
            onSelect={handleSelect}
            onClear={handleClear}
            selectedTitle={selected ? (selected.title) : undefined}
          />
        )}

        {!isEdit && <button onClick={()=>{handleClear();setManual(true);}}>Add manually</button>}
        {manual && <label>Type <select value={mediaType} onChange={event=>setMediaType(event.target.value==='tv'?'tv':'movie')}><option value="movie">Movie</option><option value="tv">TV show</option></select></label>}
        {genreError && <p role="alert">Genres could not be loaded. Your existing selection is preserved.</p>}
        {owner.error && <p role="alert">Movie could not be loaded. <button onClick={owner.refetch}>Retry</button></p>}
        {/* Form — shown when movie selected (create) or data loaded (edit) */}
        {showForm && (
          <>
            {/* Backdrop + poster strip */}
            {(backdropUrl || posterUrl) && (
              <div className="relative rounded-xl overflow-hidden bg-white/5 mb-2">
                {backdropUrl ? (
                  <img src={backdropUrl} alt="" className="w-full h-32 object-cover opacity-25" />
                ) : (
                  <div className="w-full h-32 bg-gradient-to-r from-blue-900/20 to-purple-900/20" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-dashboard-bg via-transparent to-transparent" />
                <div className="absolute bottom-3 left-4 flex items-end gap-3">
                  {posterUrl && (
                    <div className="w-12 rounded-lg overflow-hidden shadow-xl border border-white/10 flex-shrink-0">
                      <div className="aspect-[2/3]">
                        <img
                          src={posterUrl}
                          alt={form.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="pb-0.5 flex items-center gap-2 text-xs text-dashboard-muted">
                    {mediaType === "tv"
                      ? <span className="flex items-center gap-0.5 text-blue-400"><Tv size={10} /> TV Show</span>
                      : <span className="flex items-center gap-0.5"><Film size={10} /> Movie</span>}
                    {form.rating && (
                      <span className="flex items-center gap-0.5 text-yellow-400/70">
                        <Star size={10} fill="currentColor" /> {form.rating}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-5">

              {/* Title */}
              <div>
                <label className="text-sm font-semibold text-white/90 mb-2 block">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={setField("title")}
                  placeholder="Movie title"
                  className={`w-full bg-dashboard-muted border border-dashboard-border rounded-xl px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none transition-colors ${isEdit ? "opacity-60 cursor-not-allowed" : "focus:border-dashboard-accent"}`}
                />
              </div>

              {/* Original Title */}
              {(manual || isEdit || form.originalTitle) && (
                <div>
                  <label className="text-sm font-semibold text-dashboard mb-2 block">Original Title</label>
                  <input
                    type="text"
                    value={form.originalTitle}
                    onChange={setField("originalTitle")}
                    placeholder="Movie title"
                    className={`w-full bg-dashboard-muted border border-dashboard-border rounded-xl px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none transition-colors ${isEdit ? "opacity-60 cursor-not-allowed" : "focus:border-dashboard-accent"}`}
                  />
                </div>
              )}

              {/* Year + Director */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-dashboard mb-2 block">Year</label>
                  <input
                    type="text"
                    value={form.year}
                    onChange={setField("year")}
                    placeholder="e.g. 2008"
                    className={`w-full bg-dashboard-muted border border-dashboard-border rounded-xl px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none transition-colors ${isEdit ? "opacity-60 cursor-not-allowed" : "focus:border-dashboard-accent"}`}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-dashboard mb-2 block">
                    {mediaType === "tv" ? "Created By" : "Director"}
                  </label>
                  <input
                    type="text"
                    value={form.director}
                    onChange={setField("director")}
                    placeholder="e.g. Vince Gilligan"
                    className={`w-full bg-dashboard-muted border border-dashboard-border rounded-xl px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none transition-colors ${isEdit ? "opacity-60 cursor-not-allowed" : "focus:border-dashboard-accent"}`}
                  />
                </div>
              </div>

              {/* Runtime + Rating */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-dashboard mb-2 block">
                    {mediaType === "tv" ? "Seasons" : "Runtime (minutes)"}
                  </label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-muted" />
                    <input
                      type="number"
                      value={mediaType === "tv" ? form.seasonCount : form.runtime}
                      onChange={setField(mediaType === "tv" ? "seasonCount" : "runtime")}
                      placeholder={mediaType === "tv" ? "e.g. 5" : "e.g. 62"}
                      className={`w-full bg-dashboard-muted border border-dashboard-border rounded-xl pl-9 pr-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none transition-colors ${isEdit ? "opacity-60 cursor-not-allowed" : "focus:border-dashboard-accent"}`}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-dashboard mb-2 block">TMDB Rating</label>
                  <div className="relative">
                    <Star size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-400/60" fill="currentColor" />
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={form.rating}
                      onChange={setField("rating")}
                  readOnly={!manual}
                      placeholder="e.g. 9.5"
                      className={`w-full bg-dashboard-muted border border-dashboard-border rounded-xl pl-9 pr-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none transition-colors ${isEdit ? "opacity-60 cursor-not-allowed" : "focus:border-dashboard-accent"}`}
                    />
                  </div>
                </div>
              </div>

              {/* Genres */}
              <div>
                <label className="text-sm font-semibold text-white/90 mb-2 block">Genres</label>
                <input
                  type="text"
                  value={form.genres}
                  readOnly
                  placeholder="e.g. Drama, Crime, Thriller"
                  className={`w-full bg-dashboard-muted border border-dashboard-border rounded-xl px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none transition-colors ${isEdit ? "opacity-60 cursor-not-allowed" : "focus:border-dashboard-accent"}`}
                />
              </div>

              {/* Cast Members Preview */}
              {castMembers.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-white/90 mb-2 block">Top Cast</p>
                  <div className="flex overflow-x-auto pb-4 gap-3 hide-scrollbar scrollbar-hide">
                    {castMembers.map(c => (
                      <div key={c.id} className="flex flex-col flex-shrink-0 w-20 gap-1 rounded-xl">
                        <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 border border-dashboard-border bg-dashboard-muted">
                          {c.profile_path ? (
                            <img
                              src={buildPosterUrl(c.profile_path, 'w185')}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/20">
                              <User size={24} />
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-center leading-tight mt-1 text-white truncate">{c.name}</span>
                        <span className="text-[10px] text-center text-white/40 leading-tight truncate">{c.character}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overview */}
              <div>
                <label className="text-sm font-semibold text-white/90 mb-2 block">Overview</label>
                <textarea
                  rows={4}
                  value={form.overview}
                  onChange={setField("overview")}
                  placeholder="Brief description..."
                  className={`w-full bg-dashboard-muted border border-dashboard-border rounded-xl px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none transition-colors resize-none ${isEdit ? "opacity-60 cursor-not-allowed" : "focus:border-dashboard-accent"}`}
                />
              </div>

              {/* Watch Providers */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-dashboard">Watch Providers</label>
                  {loadingProviders && (
                    <span className="text-xs text-dashboard-muted flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" /> Fetching...
                    </span>
                  )}
                  </div>
                {watchProviders.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {watchProviders.map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-dashboard-muted">
                        <Clock size={10} /> {p.provider_name}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-dashboard-muted">
                    {loadingProviders ? "Checking streaming platforms..." : "No provider data available."}
                  </p>
                )}
              </div>

              <div className="mb-4 bg-dashboard-sidebar border border-dashboard-border rounded-2xl p-4">
                <p className="text-xs text-dashboard-muted uppercase tracking-wider mb-4 font-medium">Your Details</p>
              </div>



              {/* Recommendation note */}
              <div>
                <label className="text-sm font-semibold text-dashboard mb-2 block">Your Recommendation Note (optional)</label>
                <div className="focus-within:border-dashboard-accent transition-colors">
                  <TiptapEditor
                    value={form.note}
                    initalValue={form.note}
                    onChange={(val) => setForm((f) => ({ ...f, note: val }))}
                    placeholder="Why do you recommend this? What makes it special?"
                  />
                </div>
              </div>

              {/* User Rating */}
              <div className="mt-4">
                <label className="text-sm font-semibold text-dashboard mb-2 block">Your Rating</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, userRating: star }))}
                      className={`p-1 transition-all hover:scale-110 active:scale-95 ${form.userRating && form.userRating >= star ? "text-yellow-400" : "text-white/20 hover:text-white/40"}`}
                    >
                      <Star size={24} fill={form.userRating && form.userRating >= star ? "currentColor" : "none"} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Snapshots Upload */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-dashboard">Manual Snapshots from {mediaType === "tv" ? "Show" : "Movie"} (Optional)</label>
                </div>
                <div className="flex flex-col gap-3">
                  {/* Existing Snapshots */}
                  {existingSnapshots.length > 0 && (
                    <div className="flex flex-wrap gap-3 mb-2">
                      {existingSnapshots.map((snap) => (
                        <div key={snap.id} className="relative w-24 h-24 rounded-xl overflow-hidden shadow-sm group">
                          <img src={snap.url} className="w-full h-full object-cover" alt="Snapshot" />
                          <button
                            type="button"
                            onClick={() => setExistingSnapshots(prev => prev.filter(s => s.id !== snap.id))}
                            className="absolute top-1 right-1 bg-black/60 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* New Snapshots Preview */}
                  {newSnapshots.length > 0 && (
                    <div className="flex flex-wrap gap-3 mb-2">
                      {snapshotPreviews.map((preview, i) => (
                        <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden shadow-sm group border border-white/10">
                          <img src={preview.url} className="w-full h-full object-cover" alt="New Snapshot preview" />
                          <button
                            type="button"
                            onClick={() => setNewSnapshots(prev => prev.filter((_, idx) => idx !== i))}
                            className="absolute top-1 right-1 bg-black/60 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload Button */}
                  <label className="w-full md:w-auto self-start cursor-pointer flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 border-dashed rounded-xl px-5 py-3 text-sm text-white/70 transition-colors">
                    <Upload size={16} className="text-white/50" />
                    <span>Upload Images</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          const filesArr = Array.from(e.target.files);
                          setNewSnapshots(prev => [...prev, ...filesArr]);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>



              {/* Actions */}
              <div className="pt-4 border-t border-dashboard-border">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/recommendations/movies/${listId}`)}
                    className="px-6 py-3 rounded-xl bg-dashboard-muted hover:bg-white/10 text-sm text-white font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !form.title.trim()}
                    className="flex-1 py-3 rounded-xl bg-dashboard-accent hover:opacity-90 text-sm text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    {isEdit ? "Save Changes" : "Add to List"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AddMoviePage;
