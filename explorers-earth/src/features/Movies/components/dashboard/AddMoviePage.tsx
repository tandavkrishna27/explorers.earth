import ReorderableMediaStrip from '../../../../components/reorder/ReorderableMediaStrip';
import ReorderableFileStrip from '../../../../components/reorder/ReorderableFileStrip';
import { explorersApiClient } from '../../../../lib/explorersApiClient';
import { friendlyErrorMessage } from "../../../../utils/friendlyError";
import { useMoviesOwner, invalidateMovies } from '../../api/explorersAdapter';
import { useCuratedCatalog } from '../../../../lib/curatedTaxonomy';
import ProviderRatingChip from '../../../../components/ProviderRatingChip';
import StarRating from '../../../../components/StarRating';
import AddItemPage from '../../../shared/addItem/AddItemPage';
import ItemSearch, { type ItemSearchResult } from '../../../shared/addItem/ItemSearch';
import PickedItemCard from '../../../shared/addItem/PickedItemCard';
import { moviesCommandKey } from '../../api/moviesClient';
import { startMovieImport } from '../../api/backgroundMovieImport';
import type { MovieCandidate } from '../../../../../../tunes/shared/explorersMovieContract';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import useAuthStore from '../../../../store/store';
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Clock, Loader2, User, Upload } from "lucide-react";
import { toast } from "sonner";
const PROVIDER_DETAILS_UNAVAILABLE='Provider details unavailable. Your draft is preserved; retry or add manually.';
import type { WatchProvider, TMDBCastMember } from "../../types";
import {
  buildPosterUrl, buildBackdropUrl, extractNoteText, getGenreNames,
} from "../../utils/movieHelpers";

import TiptapEditor from "../../../Favorites/components/TiptapEditor";
import { useOriginBack } from "../../../../lib/navigation/useOriginBack";
import { listPath } from "../../../../lib/navigation/categoryRoutes";
import { useTranslation } from "react-i18next";

const FALLBACK_POSTER = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='150' viewBox='0 0 100 150'><rect width='100' height='150' fill='%230d1117'/></svg>`;

/** Facts row text: runtime for a movie, season count for a show. */
function movieFacts(mediaType:'movie'|'tv',runtime:string,seasonCount:string):string|null{
 if(mediaType==='tv'){if(seasonCount==='')return null;const n=Number(seasonCount);return `${n} ${n===1?'season':'seasons'}`;}
 return runtime===''?null:`${Number(runtime)} min`;
}

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
 const {listId,movieId}=useParams<{listId:string;movieId?:string}>(),isEdit=Boolean(movieId);
 const { t: tBack } = useTranslation();
 const back = useOriginBack({ to: listPath("movies", listId!), label: tBack("dashboard.wp1.back.list") });
 const backText = back.source === "state" && back.label ? tBack("dashboard.wp1.back.to", { name: back.label }) : tBack("dashboard.wp1.back.list");
 const generation=useAuthStore(state=>state.generation),selectionAttempt=useRef(0),selectionController=useRef<AbortController>();
 const initializedDraft=useRef<string>(),saveBusy=useRef(false),saveController=useRef<AbortController>();
 const commandKeys=useRef(new Map<string,string>());
 const createIntent=useRef<{fingerprint:string;parent:Awaited<ReturnType<typeof explorersApiClient.getMyEditableCollection>>;key:string}>();
 const commandKey=(operation:string,input:unknown)=>{const fingerprint=JSON.stringify([generation,listId,movieId,operation,input]);const existing=commandKeys.current.get(fingerprint);if(existing)return existing;const key=moviesCommandKey();commandKeys.current.set(fingerprint,key);return key;};
 const [selected,setSelected]=useState<MovieCandidate|null>(null),[manual,setManual]=useState(false),[entityId,setEntityId]=useState<string|null>(null);
 const [mediaType,setMediaType]=useState<'movie'|'tv'>('movie'),[posterPath,setPosterPath]=useState<string|null>(null),[backdropPath,setBackdropPath]=useState<string|null>(null);
 const [watchProviders,setWatchProviders]=useState<WatchProvider[]>([]),[castMembers,setCastMembers]=useState<TMDBCastMember[]>([]),[loadingDetails,setLoadingDetails]=useState(false),[selectError,setSelectError]=useState<string|null>(null),[saving,setSaving]=useState(false);
 const loadingProviders=false;
 const [existingSnapshots,setExistingSnapshots]=useState<{id:string;url:string}[]>([]),[newSnapshots,setNewSnapshots]=useState<File[]>([]),[formReady,setFormReady]=useState(!isEdit);
 const snapshotPreviews=useMemo(()=>newSnapshots.map(file=>({file,url:URL.createObjectURL(file)})),[newSnapshots]);
 useEffect(()=>()=>snapshotPreviews.forEach(preview=>URL.revokeObjectURL(preview.url)),[snapshotPreviews]);
 const emptyForm:FormState={title:'',originalTitle:'',year:'',director:'',runtime:'',seasonCount:'',rating:'',overview:'',genres:'',note:'',userRating:null,categoryIds:[]};
 const [form,setForm]=useState<FormState>(emptyForm);
 // Genres are the curated Movies catalog (the TMDB-mapped terms); ids are the movie term ids the save sends.
 const catalog=useCuratedCatalog('movies'),genreError=catalog.error;
 const categories=useMemo(()=>catalog.terms.map(term=>({documentId:term.id,genre_name:term.label})),[catalog.terms]);
 const [query,setQuery]=useState(''),candidates=useRef(new Map<string,MovieCandidate>());
 const searchMovies=useCallback(async(text:string,signal:AbortSignal):Promise<ItemSearchResult[]>=>{
  const page=await explorersApiClient.searchMovieCandidates({query:text,limit:24},signal);
  candidates.current=new Map(page.items.map(item=>[`${item.externalKind}:${item.externalId}`,item]));
  return page.items.map(item=>({id:`${item.externalKind}:${item.externalId}`,title:item.title,subtitle:[item.yearText,item.externalKind==='tv'?'TV show':'Movie'].filter(Boolean).join(' · '),imageUrl:buildPosterUrl(item.posterUrl,'w185')||null}));
 },[]);
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
 const handleSelect=async(candidate:MovieCandidate)=>{selectionController.current?.abort();const controller=new AbortController();selectionController.current=controller;const attempt=++selectionAttempt.current;setLoadingDetails(true);setSelectError(null);
  try{const entity=await explorersApiClient.resolveMovieEntity({kind:'provider',category:'movies',provider:'tmdb',externalKind:candidate.externalKind,externalId:candidate.externalId},commandKey('resolve-provider',[candidate.externalKind,candidate.externalId]),controller.signal);if(controller.signal.aborted||attempt!==selectionAttempt.current)return;const facts=entity.details;setSelected(candidate);setManual(false);setEntityId(entity.id);setMediaType(facts.mediaType);setPosterPath(facts.posterUrl);setBackdropPath(facts.backdropUrl);const region=facts.watchProviders.US,seen=new Set<number>();const offers=region?[...region.flatrate,...region.rent,...region.buy].filter(offer=>{if(seen.has(offer.providerId))return false;seen.add(offer.providerId);return true;}).sort((a,b)=>a.priority-b.priority).slice(0,8):[];setWatchProviders(offers.map(offer=>({provider_id:offer.providerId,provider_name:offer.name,logo_path:offer.logoUrl,...(region?.link?{link:region.link}:{})})));setCastMembers(facts.cast.slice(0,10).map(cast=>({id:cast.personId,name:cast.name,character:cast.character,profile_path:cast.profileUrl})));
  setForm(previous=>({...previous,title:entity.title,originalTitle:facts.originalTitle??'',year:facts.yearText??'',director:facts.director??'',runtime:facts.runtimeMinutes==null?'':String(facts.runtimeMinutes),seasonCount:facts.seasonCount==null?'':String(facts.seasonCount),rating:facts.providerRating==null?'':String(facts.providerRating),overview:facts.overview??'',genres:facts.genres.map(genre=>genre.name).join(', '),categoryIds:facts.genres.flatMap(genre=>{const term=categories.find(value=>value.genre_name.toLowerCase()===genre.name.toLowerCase());return term?[term.documentId]:[];})}));
  }catch{if(!controller.signal.aborted&&attempt===selectionAttempt.current){toast.error(PROVIDER_DETAILS_UNAVAILABLE);setSelectError(PROVIDER_DETAILS_UNAVAILABLE);}}finally{if(!controller.signal.aborted&&attempt===selectionAttempt.current)setLoadingDetails(false);}
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
    if (selected) startMovieImport(recommendation.id,moviesCommandKey());
   }
   if (!alive()) return;
   invalidateMovies();toast.success(isEdit?'Movie updated!':'Movie added!');back.goBack({state:{justAddedRecommendation:true}});
  } catch(error) {
   if (alive()) toast.error(friendlyErrorMessage(error, 'Failed to save. Your draft is preserved.'));
  } finally {
   if (alive()) { saveBusy.current=false;setSaving(false);saveController.current=undefined; }
  }
 };
 const movieNotFound=isEdit&&!owner.loading&&!owner.error&&Boolean(owner.data)&&!owner.data!.movieLists[0]?.recommended_movies.some(value=>value.documentId===movieId);
 const backdropUrl=buildBackdropUrl(backdropPath,'w780'),showForm=isEdit?formReady:Boolean(selected)||manual;
 const mode=isEdit||selected?'picked' as const:manual?'manual' as const:'search' as const;
 const facts=movieFacts(mediaType,form.runtime,form.seasonCount);
 const toggleGenre=(id:string)=>setForm(previous=>({...previous,categoryIds:previous.categoryIds.includes(id)?previous.categoryIds.filter(value=>value!==id):[...previous.categoryIds,id]}));
 const fieldClass='w-full bg-dashboard-muted border border-dashboard-border rounded-xl px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none focus:border-dashboard-accent transition-colors';
  return (
    <div className="min-h-screen text-dashboard">
    <AddItemPage
      title={isEdit ? "Edit Movie" : "Add Movie or Show"}
      backLabel={backText}
      onBack={() => back.goBack()}
      mode={mode}
      onBackToSearch={() => { handleClear(); }}
      bar={{ onCancel: () => back.goBack(), onSave: () => { void handleSave(); }, saving: saving ? "save" : null, canSave: Boolean(form.title.trim()) && !loadingDetails && (!isEdit || formReady) }}
    >
        {mode === "search" && (
          <ItemSearch
            query={query}
            onQueryChange={setQuery}
            search={searchMovies}
            onPick={(result) => { const candidate = candidates.current.get(result.id); if (candidate) void handleSelect(candidate); }}
            onAddManually={() => { handleClear(); setManual(true); setForm(previous => ({ ...previous, title: query.trim() })); }}
            placeholder='Search "Interstellar", "Breaking Bad"...'
          />
        )}
        {loadingDetails && (
          <p className="flex items-center gap-2 text-xs text-blue-400"><Loader2 size={14} className="animate-spin" /> Loading details…</p>
        )}
        {!isEdit && selectError && <p role="alert" className="text-sm text-red-400">{selectError}</p>}
        {mode === "picked" && (isEdit ? formReady : true) && (
          <PickedItemCard
            title={form.title}
            subtitle={[form.year, mediaType === "tv" ? "TV show" : "Movie"].filter(Boolean).join(" · ")}
            imageUrl={buildPosterUrl(posterPath, 'w185') || null}
            onChange={handleClear}
            locked={isEdit}
          />
        )}
        {manual && <label className="flex items-center gap-2 text-sm text-dashboard">Type <select value={mediaType} onChange={event=>setMediaType(event.target.value==='tv'?'tv':'movie')} className="dt-input bg-dashboard-muted text-dashboard border border-dashboard-border rounded-lg px-3 py-2"><option value="movie" className="bg-dashboard-sidebar text-dashboard">Movie</option><option value="tv" className="bg-dashboard-sidebar text-dashboard">TV show</option></select></label>}
        {genreError && <p role="alert">Genres could not be loaded. Your existing selection is preserved.</p>}
        {owner.error && <p role="alert">Movie could not be loaded. <button onClick={owner.refetch}>Retry</button></p>}
        {movieNotFound && <p role="alert" className="text-red-400">Movie not found. <Link to="/recommendations/movies" className="text-blue-400 underline">Go back</Link></p>}
        {/* Form — shown when movie selected (create) or data loaded (edit) */}
        {showForm && (
          <>
            {backdropUrl && <img src={backdropUrl} alt="" className="w-full h-24 rounded-xl object-cover opacity-25" onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }} />}
            {/* Facts row: runtime or seasons, and the provider's score as a source chip (never on the owner's stars). */}
            {!manual && (facts || form.rating !== '') && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-dashboard-muted">
                {facts && <span className="flex items-center gap-1"><Clock size={12} aria-hidden />{facts}</span>}
                <ProviderRatingChip source="TMDB" value={form.rating === '' ? null : Number(form.rating)} />
              </div>
            )}

            <div className="grid grid-cols-1 gap-5">
            <details open={manual} className="group grid gap-5">
              <summary className="cursor-pointer text-sm text-dashboard-muted">{manual ? "Details" : "Edit details"}</summary>
              <div className="grid grid-cols-1 gap-5 pt-3">

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
                {manual && (
                <div>
                  <label className="text-sm font-semibold text-dashboard mb-2 block">TMDB Rating</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={form.rating}
                      onChange={setField("rating")}
                      placeholder="e.g. 9.5"
                      className={fieldClass}
                    />
                </div>
                )}
              </div>

              </div>
            </details>

              {/* Genres: curated Movies terms, pre-selected from the provider mapping; the owner can change them. */}
              {categories.length > 0 && (
                <div role="group" aria-label="Genres">
                  <p className="text-sm font-semibold text-white/90 mb-2">Genres</p>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(term => {
                      const on = form.categoryIds.includes(term.documentId);
                      return (
                        <button key={term.documentId} type="button" aria-pressed={on} onClick={() => toggleGenre(term.documentId)}
                          className={`min-h-9 rounded-full border px-3 text-xs transition-colors ${on ? "border-blue-400 bg-blue-400/15 text-blue-200" : "border-dashboard-border text-dashboard-muted hover:text-dashboard"}`}>
                          {term.genre_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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
                <p className="text-sm font-semibold text-dashboard mb-2">Your Rating</p>
                <StarRating value={form.userRating} onChange={(value) => setForm(f => ({ ...f, userRating: value }))} label="Your rating" disabled={saving} />
              </div>

              {/* Snapshots Upload */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-dashboard">Manual Snapshots from {mediaType === "tv" ? "Show" : "Movie"} (Optional)</label>
                </div>
                <div className="flex flex-col gap-3">
                  {/* Existing Snapshots: this order is the saved and public order. */}
                  <ReorderableMediaStrip items={existingSnapshots} onChange={setExistingSnapshots} noun="Snapshot" alt="Snapshot" removeLabel="Remove snapshot" disabled={saving} />

                  {/* New snapshots upload after the saved ones, in this order, when saved. */}
                  <ReorderableFileStrip files={newSnapshots} previews={snapshotPreviews.map(preview => preview.url)} onChange={setNewSnapshots} noun="New snapshot" alt="New Snapshot preview" removeLabel="Remove new snapshot" disabled={saving} />

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



            </div>
          </>
        )}
    </AddItemPage>
    </div>
  );
};

export default AddMoviePage;
