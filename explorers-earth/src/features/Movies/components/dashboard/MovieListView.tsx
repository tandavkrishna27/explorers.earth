import { notePreviewText } from "../../../../utils/notePreviewText";
import { createMoviesOwnerDiagnostic, type MoviesOwnerObserver } from '../../api/moviesOwnerDiagnostic';
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { useMoviesOwner, changeMovieList, archiveMovieList, archiveMovie, toggleMoviePin } from "../../api/explorersAdapter";
import { AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Star, MoreHorizontal, Trash2, Edit,
  Film, Copy, Loader2, Check, Clock, Tv, Share2, Download
} from "lucide-react";
import { AddIcon } from "../../../../assets/icons/AddIcon";
import Accordion from "../../../../components/ui/Accordian";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";



import type { RecommendedMovie } from "../../types";
import {
  buildPosterUrl,
  formatRating,
  formatRuntime,
  getGenreNames,
  extractNoteText,
  deduplicateMovies,
} from "../../utils/movieHelpers";
import TopPicksManager from "./TopPicksManager";
import MovieDetailModal from "../public/MovieDetailModal";
import Switch from "../../../../components/ui/Switch";
import { ListVisibilityModal } from "../../../../components/ListVisibilityModal";
import QrCardTagline from "../../../../components/QrCardTagline";

const VITE_BASE_URL = import.meta.env.VITE_BASE_URL || "https://explorers.earth";

// Movie Row Component
const MovieRow = ({
  movie,
  onEdit,
  onDelete,
  onPinToggle,
  onRowClick,
  isPinning,
}: {
  movie: RecommendedMovie;
  onEdit: () => void;
  onDelete: () => void;
  onPinToggle: () => void;
  onRowClick: () => void;
  isPinning: boolean;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const posterUrl = buildPosterUrl(movie.poster_path, "w185");
  const genres = getGenreNames(movie.genres);

  return (
    <div 
      onClick={onRowClick}
      className="group flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.05] hover:border-white/[0.08] hover:bg-white/[0.06] cursor-pointer rounded-xl transition-all mb-2"
    >
      {/* Poster */}
      <div className="w-10 flex-shrink-0 rounded overflow-hidden bg-white/5">
        <div className="aspect-[2/3]">
          {posterUrl ? (
            <img src={posterUrl} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-blue-950/30 flex items-center justify-center">
              <Film size={12} className="text-blue-600/40" />
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-white truncate">{movie.title}</span>
          {movie.media_type === "TV" && <Tv size={11} className="text-blue-400 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5 flex-wrap">
          {movie.year && <span>{movie.year}</span>}
          {genres[0] && <span className="text-white/20">·</span>}
          {genres.slice(0, 2).map(g => <span key={g}>{g}</span>)}
          {movie.tmdb_rating != null && (
            <>
              <span className="text-white/20">·</span>
              <span className="flex items-center gap-0.5 text-amber-400/80">
                <Star size={9} fill="currentColor" /> {formatRating(movie.tmdb_rating)}
              </span>
            </>
          )}
          {movie.runtime && (
            <>
              <span className="text-white/20">·</span>
              <span className="flex items-center gap-0.5">
                <Clock size={9} /> {formatRuntime(movie.runtime)}
              </span>
            </>
          )}
        </div>
        {extractNoteText(movie.user_recommendation_note) && (
          <p className="text-xs text-white/30 mt-1 line-clamp-1 italic">
            {notePreviewText(extractNoteText(movie.user_recommendation_note))}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Pin button */}
        <button
          onClick={(e) => { e.stopPropagation(); onPinToggle(); }}
          disabled={isPinning}
          title={movie.is_pinned ? "Unpin from Top Picks" : "Pin to Top Picks"}
          className={`p-1.5 rounded-lg transition-all ${
            movie.is_pinned
              ? "text-amber-400 bg-amber-400/10"
              : "text-white/30 hover:text-amber-400 hover:bg-amber-400/10"
          } disabled:opacity-50`}
        >
          <Star size={14} fill={movie.is_pinned ? "currentColor" : "none"} />
        </button>

        {/* Three-dot menu */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
            className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-all"
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-[#1a2332] border border-white/10 rounded-xl shadow-xl z-20 min-w-[130px] overflow-hidden">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-dashboard hover:bg-white/8 transition-colors"
              >
                <Edit size={13} /> Edit
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={13} /> Archive recommendation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main MovieListView Component
// ─────────────────────────────────────────────────────────────
const MovieListView = () => {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<"recommendations" | "manage">("recommendations");
  const [showTopPicks, setShowTopPicks] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [showDeleteListModal, setShowDeleteListModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<RecommendedMovie | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditingList, setIsEditingList] = useState(false);

  const [listVisibilityPrompt, setListVisibilityPrompt] = useState<{
    isOpen: boolean;
    listName: string;
  } | null>(null);

  const diagnosticRef = useRef<ReturnType<typeof createMoviesOwnerDiagnostic>>(undefined);
  const attemptObserverRef = useRef<MoviesOwnerObserver | undefined>(undefined);
  useEffect(() => {
    diagnosticRef.current = createMoviesOwnerDiagnostic(globalThis);
    return () => { diagnosticRef.current?.deactivate(); diagnosticRef.current = undefined; attemptObserverRef.current = undefined; };
  }, []);
  const observeOwner = useCallback<MoviesOwnerObserver>(event => {
    if ('owner' in event && ['pending','disabled','no-account'].includes(event.owner)) {
      attemptObserverRef.current = diagnosticRef.current?.beginAttempt();
    }
    attemptObserverRef.current?.(event);
  }, []);
  const { content, data, loading, error, refetch } = useMoviesOwner(listId, Boolean(listId), observeOwner);

  const [isUpdating,setIsUpdating]=useState(false),[deletingList,setDeletingList]=useState(false);
  const togglePin=async({variables}:{variables:{documentId:string;is_pinned:boolean;pin_order?:number|null};refetchQueries?:unknown[]})=>toggleMoviePin(variables.documentId,variables.is_pinned);
  const deleteMovie=async({variables}:{variables:{documentId:string};refetchQueries?:unknown[]})=>archiveMovie(variables.documentId);
  const updateList=async({variables}:{variables:{documentId:string;Visibility?:boolean;List_Name?:string;list_description?:string|null};optimisticResponse?:unknown;refetchQueries?:unknown[]})=>{setIsUpdating(true);try{return await changeMovieList(variables.documentId,{...(variables.Visibility===undefined?{}:{visibility:variables.Visibility}),...(variables.List_Name===undefined?{}:{title:variables.List_Name}),...(variables.list_description===undefined?{}:{description:variables.list_description})});}finally{setIsUpdating(false);}};
  const deleteList=async({variables}:{variables:{documentId:string}})=>{setDeletingList(true);try{await archiveMovieList(variables.documentId);}finally{setDeletingList(false);}};

  const list = data?.movieLists?.[0];
  const movies = deduplicateMovies(list?.recommended_movies as RecommendedMovie[]);
  const categoryMovies = deduplicateMovies(content?.lists.flatMap(value=>value.recommended_movies) ?? movies);
  const pinnedCount = categoryMovies.filter(m => m.is_pinned).length;

  // One-shot guard: consume the post-create/post-add route-state signal exactly
  // once. Prevents an infinite re-render loop (BUG-3): the prompt setter builds a
  // new object each render and the effect used to depend on `list` (rebuilt every
  // render) while clearing state via window.history.replaceState, which does NOT
  // update React Router's location.state — so justCreatedList stayed true forever.
  const promptShownRef = useRef(false);

  useEffect(() => {
    if (promptShownRef.current) return;
    const wants =
      location.state?.justAddedRecommendation || location.state?.justCreatedList;
    if (!wants || !list) return;
    // Never prompt to publish an empty list (BUG: fired immediately on create).
    // Do NOT set promptShownRef here, so a later render (after the first item
    // loads) can still open the prompt.
    if (movies.length < 1) return;
    promptShownRef.current = true;
    if (!list.Visibility) {
      setListVisibilityPrompt({ isOpen: true, listName: list.List_Name });
    }
    // Clear the route state via React Router so it doesn't persist/re-fire.
    navigate(location.pathname, { replace: true, state: {} });
    // Key on the stable list documentId, not the every-render-rebuilt list object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.pathname, list?.documentId, movies.length, navigate]);

  // Visibility means public AND published in the existing view model; draft
  // records the existing !Visibility branch, not a separate publication state.
  useEffect(() => {
    diagnosticRef.current?.commit({
      list: loading && !list ? 'loading' : error && !list ? 'error' : !list ? 'missing' : movies.length ? 'ready-nonempty' : 'ready-empty',
      visibility: !list ? 'unavailable' : list.Visibility ? 'public' : 'draft',
      signal: location.state?.justAddedRecommendation || location.state?.justCreatedList ? 'present' : 'absent',
      guard: promptShownRef.current ? 'consumed' : 'fresh',
      prompt: list && listVisibilityPrompt?.isOpen ? 'open' : 'closed',
    });
  });

  // Public share URL
  const shareUrl = list ? `${VITE_BASE_URL}/${list.account?.username || ""}/movies/${list.slug}` : "";

  const handleToggleVisibility = async () => {
    if (!list) return;
    if (!list.Visibility && movies.length === 0) {
      toast.error("Add at least one movie before publishing.");
      return;
    }
    try {
      await updateList({
        variables: { documentId: list.documentId, Visibility: !list.Visibility },
        optimisticResponse: {
          updateMovieList: {
            __typename: "MovieList",
            documentId: list.documentId,
            List_Name: list.List_Name,
            list_description: list.list_description,
            slug: list.slug,
            Visibility: !list.Visibility,
            display_order: list.display_order,
            top_picks_heading: list.top_picks_heading || null,
          }
        },
        refetchQueries: [],
      });
      toast.success(list.Visibility ? "List set to draft." : "List published!");
    } catch {
      toast.error("Failed to update visibility.");
    }
  };

  const handlePinToggle = async (movie: RecommendedMovie) => {
    if (!movie.is_pinned && pinnedCount >= 15) {
      toast.error("Max 15 pinned movies allowed.");
      return;
    }
    setPinningId(movie.documentId);
    try {
      await togglePin({
        variables: {
          documentId: movie.documentId,
          is_pinned: !movie.is_pinned,
          pin_order: !movie.is_pinned ? pinnedCount : null,
        },
        refetchQueries: [],
      });
    } catch {
      toast.error("Failed to update pin.");
    } finally {
      setPinningId(null);
    }
  };

  const handleDeleteMovie = async (documentId: string) => {
    if (!window.confirm("Archive this recommendation from all lists?")) return;
    try {
      await deleteMovie({ variables: { documentId }, refetchQueries: [] });
      toast.success("Recommendation archived from all lists.");
    } catch {
      toast.error("Failed to remove movie.");
    }
  };

  const handleDeleteList = async () => {
    if (!list) return;
    try {
      await deleteList({ variables: { documentId: list.documentId } });
      toast.success("List archived. Recommendations in other lists are preserved.");
      navigate("/recommendations/movies");
    } catch {
      toast.error("Failed to archive list.");
    }
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading && !list) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <div className="h-6 w-40 bg-white/5 animate-pulse rounded" />
        <div className="h-4 w-24 bg-white/5 animate-pulse rounded" />
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-14 bg-white/5 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!loading && !list) {
    return (
      <div className="p-6">
        <p className="text-red-400" role="alert">{error ? 'List could not be loaded.' : 'List not found.'} <Link to="/recommendations/movies" className="text-blue-400 underline">Go back</Link></p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-8 pb-24 md:p-6 md:pb-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        {/* Left: Back and Title info */}
        <div className="flex flex-col items-start">
          <button
            onClick={() => navigate("/recommendations/movies")}
            className="text-[10px] text-white/50 hover:text-white mb-1 transition-colors flex items-center gap-1 font-semibold uppercase tracking-wider"
          >
            <ArrowLeft size={10} />
            <span>Back</span>
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight leading-tight">{list?.List_Name}</h1>
        </div>
        {/* Publish toggle switch */}
        <Switch
          checked={list?.Visibility ?? false}
          onChange={handleToggleVisibility}
          loading={isUpdating}
          label={list?.Visibility ? "Published" : "Draft"}
        />
      </div>

      {/* Tabs */}
      <div className="flex mb-6 bg-white rounded-full p-[2px] w-fit mx-auto shadow-sm">
        {(["recommendations", "manage"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-[11px] md:text-xs font-semibold rounded-full capitalize transition-all duration-200 ${
              activeTab === tab
                ? "bg-dashboard-accent text-white shadow"
                : "text-[#0f172a] bg-transparent hover:opacity-80"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab: Recommendations */}
      {activeTab === "recommendations" && (
        <div>


          {/* Add Movie or Show button - highlighted CTA */}
          <button
            onClick={() => navigate(`/recommendations/movies/${listId}/add`)}
            className="w-full mb-6 flex items-center justify-center gap-3 py-4 bg-dashboard-accent hover:opacity-90 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-blue-900/40 border border-white/10"
          >
            <AddIcon size="5" /> Add Movie or Show
          </button>

          {/* Movie list */}
          {movies.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Film size={40} className="text-white/15 mb-3" />
              <p className="text-dashboard-light text-sm">No movies added yet.</p>
              <p className="text-xs text-white/25 mt-1">Search TMDB to add your first recommendation.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {movies.map(movie => (
                <MovieRow
                  key={movie.documentId}
                  movie={movie}
                  onEdit={() => navigate(`/recommendations/movies/${listId}/edit/${movie.documentId}`)}
                  onDelete={() => handleDeleteMovie(movie.documentId)}
                  onPinToggle={() => handlePinToggle(movie)}
                  onRowClick={() => { setSelectedMovie(movie); setModalOpen(true); }}
                  isPinning={pinningId === movie.documentId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Manage */}
      {activeTab === "manage" && (
        <div className="mb-0 md:mt-2 md:w-[90%] md:mx-auto">
          <div className="bg-transparent rounded-lg p-6 space-y-4 border border-white/10">
            {/* Manage Accordion */}
            <Accordion heading="Manage" defaultOpen={true}>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowDeleteListModal(true)}
                  className="flex flex-row text-center gap-2 items-center rounded-md font-poppins w-full text-sm border border-white px-4 py-3 hover:border-gray-500 text-white hover:text-gray-500 justify-center font-medium transition-all duration-300"
                >
                  <Trash2 size={16} />
                  <span>Archive list</span>
                </button>
                {isEditingList ? (
                  <div className="bg-dashboard-sidebar border border-white/10 rounded-lg p-5 space-y-4 mt-2 mb-2 text-left">
                    <div>
                      <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">List Name</label>
                      <input
                        defaultValue={list?.List_Name}
                        onBlur={async (e) => {
                          if (list && e.target.value && e.target.value !== list.List_Name) {
                            await updateList({ variables: { documentId: list.documentId, List_Name: e.target.value }, refetchQueries: [] });
                            toast.success("List name updated.");
                          }
                        }}
                        className="w-full bg-dashboard-muted border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/30 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Description</label>
                      <textarea
                        defaultValue={list?.list_description ?? ""}
                        rows={3}
                        onBlur={async (e) => {
                          if (list && e.target.value !== (list.list_description ?? "")) {
                            await updateList({ variables: { documentId: list.documentId, list_description: e.target.value }, refetchQueries: [] });
                            toast.success("Description updated.");
                          }
                        }}
                        className="w-full bg-dashboard-muted border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-white/30 transition-colors"
                      />
                    </div>
                    <button onClick={() => setIsEditingList(false)} className="w-full py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg flex justify-center text-sm mt-3 transition-colors">Done Editing</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingList(true)}
                    className="flex flex-row text-center gap-2 items-center rounded-md font-poppins w-full text-sm border border-white px-4 py-3 hover:border-gray-500 text-white hover:text-gray-500 justify-center font-medium transition-all duration-300"
                  >
                    <Edit size={16} />
                    <span>Edit</span>
                  </button>
                )}

                <div className={`p-4 rounded-xl border transition-all mt-2 ${list?.Visibility ? "border-green-500/30 bg-green-500/5" : "border-white/10"} flex justify-center items-center`}>
                  <Switch
                    checked={list?.Visibility ?? false}
                    onChange={handleToggleVisibility}
                    loading={isUpdating}
                    label={list?.Visibility ? "Published (Visible to public)" : "Draft (Private)"}
                  />
                </div>
              </div>
            </Accordion>

            {/* My QR Accordion */}
            <Accordion heading="My QR" defaultOpen={true}>
              <div className={`relative pb-2 ${!list?.Visibility ? "blur-sm pointer-events-none" : ""}`}>
                {!list?.Visibility && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-auto">
                    <span className="bg-dashboard-muted px-4 py-2 rounded-lg text-sm text-white/90 shadow-2xl border border-white/20 backdrop-blur-md">Publish list to share QR</span>
                  </div>
                )}
                
                <div className="flex justify-center items-center my-6">
                  <div className="flex relative flex-col justify-between items-center h-[16rem] w-[14rem] p-6 bg-black border border-white text-white rounded-lg">
                    <div className="absolute bottom-0 left-0 w-full h-1/2 rounded-b-lg bg-gradient-to-t from-blue-900/40 to-transparent pointer-events-none" />
                    <p className="text-sm tracking-wide font-medium z-10 text-center leading-snug">My Recommendations</p>
                    <div className="z-10 items-center flex flex-col pt-1">
                      <div className="p-2 bg-white rounded-lg shadow-md mb-3">
                        <QRCodeSVG value={shareUrl} size={90} />
                      </div>
                      <QrCardTagline className="bg-gray-200 text-black px-4 py-1.5 font-poppins rounded-full text-[11px] font-semibold whitespace-nowrap" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-8 mt-5 mb-1 pt-4 border-t border-white/5">
                  <div className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: list?.List_Name, url: shareUrl });
                    } else {
                      handleCopyUrl();
                    }
                  }}>
                    <button className="p-0 bg-transparent rounded-full flex items-center justify-center">
                      <Share2 size={22} className="text-white" strokeWidth={1.5} />
                    </button>
                    <span className="font-poppins text-white text-xs">Share Link</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={handleCopyUrl}>
                    <button className="p-0 bg-transparent rounded-full flex items-center justify-center">
                      {copied ? <Check size={22} className="text-white" strokeWidth={1.5} /> : <Copy size={22} className="text-white" strokeWidth={1.5} />}
                    </button>
                    <span className="font-poppins text-white text-xs whitespace-nowrap">{copied ? "Copied" : "Copy Link"}</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => {
                     // trigger download
                     const svg = document.querySelector('svg');
                     if (svg) {
                       const svgData = new XMLSerializer().serializeToString(svg);
                       const canvas = document.createElement("canvas");
                       const ctx = canvas.getContext("2d");
                       const img = new Image();
                       img.onload = () => {
                         canvas.width = img.width;
                         canvas.height = img.height;
                         ctx?.drawImage(img, 0, 0);
                         const pngFile = canvas.toDataURL("image/png");
                         const a = document.createElement("a");
                         a.download = `QR_${list?.List_Name || "List"}.png`;
                         a.href = pngFile;
                         a.click();
                       };
                       img.src = "data:image/svg+xml;base64," + btoa(svgData);
                     }
                  }}>
                    <button className="p-0 bg-transparent rounded-full flex items-center justify-center">
                      <Download size={22} className="text-white" strokeWidth={1.5} />
                    </button>
                    <span className="font-poppins text-white text-xs">Download QR</span>
                  </div>
                </div>
              </div>
            </Accordion>
          </div>
        </div>
      )}

      {/* Top Picks Manager */}
      <AnimatePresence>
        {showTopPicks && listId && (
          <TopPicksManager
            movies={categoryMovies.filter(m => m.is_pinned)}
            allMovies={categoryMovies}
            onClose={() => setShowTopPicks(false)}
            onRefetch={() => refetch()}
            listId={listId}
          />
        )}
      </AnimatePresence>

      {/* Delete list confirm modal */}
      {showDeleteListModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-dashboard-card rounded-2xl border border-dashboard-border p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-dashboard mb-2">Archive List?</h3>
            <p className="text-sm text-dashboard-muted mb-5">
              This will archive "{list?.List_Name}" and remove its memberships. Recommendations in other lists are preserved.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteListModal(false)} className="flex-1 py-2.5 rounded-lg border border-dashboard-border text-sm text-dashboard-muted hover:text-dashboard transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDeleteList}
                disabled={deletingList}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {deletingList ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Archive list
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Movie detail modal */}
      <MovieDetailModal
        movie={selectedMovie}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedMovie(null); }}
      />
      {list && listVisibilityPrompt && (
        <ListVisibilityModal
          isOpen={listVisibilityPrompt.isOpen}
          onClose={() => setListVisibilityPrompt(null)}
          listName={listVisibilityPrompt.listName}
          categoryName="Movies"
          onConfirm={async () => {
            try {
              await updateList({
                variables: { documentId: list.documentId, Visibility: true },
                refetchQueries: [],
              });
              refetch();
              toast.success(`"${list.List_Name}" published!`);
            } catch {
              toast.error("Failed to update visibility.");
            }
          }}
          loading={isUpdating}
        />
      )}
    </div>
  );
};

export default MovieListView;
