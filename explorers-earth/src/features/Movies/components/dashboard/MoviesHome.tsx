import { NavigationStatus } from "../../../navigation/NavigationStatus";
import { useCategoryNavigation } from "../../../navigation/CategoryNavigationProvider";
import { useState, useMemo, useEffect } from "react";
import { useMoviesOwner, createMovieList as createNativeMovieList, changeMovieList } from "../../api/explorersAdapter";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Film, Star, ChevronRight, Loader2, X, ChevronDown } from "lucide-react";
import { AddIcon } from "../../../../assets/icons/AddIcon";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "sonner";

import useAuthStore from "../../../../store/store";


import type { MovieList } from "../../types";
import { deduplicateMovies } from "../../utils/movieHelpers";
import { generateSlug, buildPosterUrl } from "../../utils/movieHelpers";

import SwitchButton from "../../../../components/ui/SwitchButton";
import { getCurrentDomain } from "../../../../utils/getCurrentDomain";
import TopPicksHero from "../public/TopPicksHero";
import TopPicksMobileHero from "../public/TopPicksMobileHero";
import TopPicksManager from "./TopPicksManager";
import MovieDetailModal from "../public/MovieDetailModal";
import type { RecommendedMovie } from "../../types";
import Switch from "../../../../components/ui/Switch";
import HeroSkeleton from "../../../../components/ui/HeroSkeleton";
import { CategoryEmptyState } from "../../../../components/CategoryEmptyState";



// Create List Modal
export const CreateMovieListModal = ({
  open,
  onClose,
  onCreated,
  username,
  defaultListName,
}: {
  open: boolean;
  onClose: () => void;
  accountDocumentId: string;
  currentListCount: number;
  onCreated: (newId?: string) => void;
  username: string;
  defaultListName?: string;
}) => {
  const [loading, setLoading] = useState(false);

  const formik = useFormik({
    initialValues: { 
      List_Name: defaultListName || "", 
      list_description: "", 
      slug: defaultListName ? generateSlug(defaultListName) : "" 
    },
    enableReinitialize: true,
    validationSchema: Yup.object({
      List_Name: Yup.string().required("List name is required").max(100),
      slug: Yup.string().required("List URL is required").max(100),
    }),
    onSubmit: async (values, { resetForm }) => {
      try {
        setLoading(true); const result = await createNativeMovieList({List_Name:values.List_Name,list_description:values.list_description||null,slug:values.slug||generateSlug(values.List_Name)});
        setLoading(false); toast.success("Movie list created!");
        resetForm();
        onCreated(result.id);
        onClose();
      } catch (e: any) { setLoading(false);
        if (e.message && e.message.includes("must be unique")) {
          formik.setFieldError("slug", "This URL is already taken. Please try another one.");
        } else {
          toast.error("Failed to create list. Please try again.");
        }
      }
    },
  });

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4 md:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-dashboard-sidebar rounded-xl border border-dashboard-border p-6 md:p-8 w-full max-w-2xl shadow-2xl"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-dashboard">Create New List</h2>
            <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-dashboard-muted hover:text-dashboard transition-colors">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={formik.handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-semibold text-dashboard mb-2 block">
                List Name
              </label>
              <input
                type="text"
                name="List_Name"
                placeholder="Enter List Name (e.g. Mind-Bending Sci-Fi)"
                value={formik.values.List_Name}
                onChange={(e) => {
                  formik.handleChange(e);
                  formik.setFieldValue("slug", generateSlug(e.target.value));
                }}
                onBlur={formik.handleBlur}
                className="w-full bg-dashboard-muted border border-dashboard-border rounded-lg px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none focus:border-dashboard-accent transition-colors"
              />
              {formik.touched.List_Name && formik.errors.List_Name && (
                <p className="text-xs text-red-400 mt-1">{formik.errors.List_Name}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-dashboard mb-2 block">
                Description
              </label>
              <textarea
                name="list_description"
                placeholder="Enter a note or description for this list"
                rows={4}
                value={formik.values.list_description}
                onChange={formik.handleChange}
                className="w-full bg-dashboard-muted border border-dashboard-border rounded-lg px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none focus:border-dashboard-accent transition-colors resize-none"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-dashboard mb-2 block">
                List URL
              </label>
              <div className="flex w-full md:flex-row flex-col md:items-center">
                <label className="w-full md:w-auto text-sm font-medium text-dashboard mr-2 shrink-0 mb-2 md:mb-0">
                  {getCurrentDomain()}/{username}/
                </label>
                <input
                  type="text"
                  name="slug"
                  placeholder="Enter the name to create a shareable link"
                  value={formik.values.slug}
                  onChange={(e) => {
                    formik.handleChange(e);
                    // Ensure slug format (lowercase, no spaces)
                    formik.setFieldValue("slug", generateSlug(e.target.value));
                  }}
                  onBlur={formik.handleBlur}
                  className="w-full bg-dashboard-muted border border-dashboard-border rounded-lg px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none focus:border-dashboard-accent transition-colors"
                />
              </div>
              {formik.touched.slug && formik.errors.slug && (
                <p className="text-xs text-red-400 mt-1">{formik.errors.slug}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-dashboard-border">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-sm text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-sm text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Create List
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// List Card
export const MovieListCard = ({
  list,
  onOpen,
  onToggleVisibility,
  togglingId,
}: {
  list: MovieList;
  onOpen: () => void;
  onToggleVisibility: (id: string, current: boolean) => void;
  togglingId: string | null;
}) => {
  const uniqueMovies = deduplicateMovies(list.recommended_movies);
  const movieCount = uniqueMovies.length;
  const pinnedCount = uniqueMovies.filter(m => m.is_pinned).length;
  const previewMovies = uniqueMovies.slice(0, 4);

  return (
    <motion.div
      onClick={onOpen}
      className="bg-dashboard-sidebar border border-white/5 md:border-dashboard-border/30 rounded-2xl p-5 hover:border-white/15 cursor-pointer transition-all group"
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-dashboard truncate">{list.List_Name}</h3>
            <span className={`text-[10px] font-semibold text-white px-1.5 py-0.5 rounded-md uppercase tracking-wider font-poppins shrink-0 ${
              list.Visibility ? "bg-emerald-500/90" : "bg-slate-500/90"
            }`}>
              {list.Visibility ? "Public" : "Draft"}
            </span>
          </div>
          {list.list_description && (
            <p className="text-xs text-dashboard-muted mt-0.5 line-clamp-2">{list.list_description}</p>
          )}
        </div>
        <div
          className="flex items-center gap-2 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            checked={list.Visibility}
            onChange={() => onToggleVisibility(list.documentId, list.Visibility)}
            disabled={movieCount === 0}
            loading={togglingId === list.documentId}
          />
        </div>
      </div>

      {/* Movie preview posters */}
      {previewMovies.length > 0 ? (
        <div className="flex gap-1.5 mb-4">
          {previewMovies.map((m) => (
            <div key={m.documentId} className="w-12 rounded-md overflow-hidden flex-shrink-0 bg-white/5">
              <div className="aspect-[2/3]">
                {m.poster_path ? (
                  <img
                    src={buildPosterUrl(m.poster_path, "w185")}
                    alt={m.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-blue-950/40 flex items-center justify-center">
                    <Film size={12} className="text-blue-600/40" />
                  </div>
                )}
              </div>
            </div>
          ))}
          {movieCount > 4 && (
            <div className="w-12 rounded-md flex items-center justify-center bg-white/5 flex-shrink-0 aspect-[2/3]">
              <span className="text-xs text-dashboard-muted">+{movieCount - 4}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="h-16 rounded-lg bg-white/3 border border-dashed border-dashboard-border flex items-center justify-center mb-4">
          <p className="text-xs text-dashboard-muted">No movies yet</p>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-dashboard-muted">
        <div className="flex items-center gap-3">
          <span>{movieCount} movie{movieCount !== 1 ? "s" : ""}</span>
          {pinnedCount > 0 && (
            <span className="flex items-center gap-1 text-yellow-400/60">
              <Star size={10} fill="currentColor" /> {pinnedCount} pinned
            </span>
          )}
        </div>
        <span
          className="flex items-center gap-1 text-blue-400 group-hover:text-blue-300 transition-colors font-medium"
        >
          Open <ChevronRight size={13} />
        </span>
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main MoviesHome Component
// ─────────────────────────────────────────────────────────────
const MoviesHome = () => {
  const navigation = useCategoryNavigation();
  const categoryVisible = navigation.snapshot?.visibility.public_movie === "Yes";
  const navigate = useNavigate();
  const { user, accountId: accountDocumentId } = useAuthStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showManageTopPicks, setShowManageTopPicks] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<RecommendedMovie | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { data, loading, error, refetch } = useMoviesOwner();

  useEffect(() => {
    if (!loading) {
      (window as any).__dashboardLoaded = true;
    }
  }, [loading]);

  const updateMovieList = async ({variables}:{variables:{documentId:string;Visibility:boolean};optimisticResponse?:unknown;refetchQueries?:unknown[]}) => changeMovieList(variables.documentId,{visibility:variables.Visibility});

  const handleVisibilityToggle = () => {
    const origin = navigation.authority;
    if (origin && !navigation.busy) void navigation.request({ category: "public_movie", action: categoryVisible ? "unpublish" : "publish" }, origin);
  };

  const lists: MovieList[] = data?.movieLists ?? [];

  const allMovies = useMemo(() => {
    if (!lists) return [];
    return lists.flatMap(l => l.recommended_movies || []);
  }, [lists]);

  const topPicks = useMemo(() => {
    return deduplicateMovies(allMovies.filter((m: any) => m.is_pinned)).sort((a: any, b: any) => (a.pin_order ?? 999) - (b.pin_order ?? 999));
  }, [allMovies]);

  const handleMovieClick = (movie: any) => {
    setSelectedMovie(movie);
  };

  const handleToggleVisibility = async (documentId: string, currentVisibility: boolean) => {
    const list = lists.find(l => l.documentId === documentId);
    if (!list) return;
    setTogglingId(documentId);
    try {
      await updateMovieList({
        variables: { documentId, Visibility: !currentVisibility },
        optimisticResponse: {
          updateMovieList: {
            __typename: "MovieList",
            documentId: list.documentId,
            List_Name: list.List_Name,
            list_description: list.list_description,
            slug: list.slug,
            Visibility: !currentVisibility,
            display_order: list.display_order,
            top_picks_heading: list.top_picks_heading || null,
          }
        },

      });
    } catch {
      toast.error("Failed to update visibility.");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="px-2 md:px-6 pt-2 pb-24 md:pb-6 max-w-4xl mx-auto">
      <NavigationStatus navigation={navigation} />
      {/* Desktop view header */}
      <div className="hidden md:flex justify-between items-center bg-dashboard-sidebar/40 px-4 py-3.5 rounded-2xl mb-4">
        {/* Left: Public switch */}
        <div className="flex items-center gap-2 bg-dashboard-muted/50 px-3 py-2 rounded-xl">
          <SwitchButton
            isChecked={categoryVisible}
            onChange={handleVisibilityToggle}
            disabled={navigation.busy || !navigation.authority}
            variant="blue"
          />
          <span className="text-[10px] md:text-xs text-[#4ade80] font-semibold leading-tight whitespace-nowrap">
            Public Visibility
          </span>
        </div>
        {/* Right: New list btn */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-dashboard-accent hover:opacity-90 text-sm text-white font-medium transition-all shadow-lg shadow-blue-900/30 whitespace-nowrap"
        >
          <AddIcon size="5" />
          <span>New List</span>
        </button>
      </div>

      {/* Mobile view header (split action button with visibility dropdown) */}
      <div className="md:hidden relative mb-4 w-full">
        <div className="flex w-full rounded-2xl overflow-hidden border border-white/10 shadow-lg shadow-blue-900/15">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex-1 bg-dashboard-accent hover:opacity-90 text-xs font-bold text-white py-3 px-4 text-left flex items-center gap-1.5 transition-all"
          >
            <AddIcon size="4" />
            <span>New List</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen(!dropdownOpen);
            }}
            className="bg-dashboard-accent border-l border-white/20 px-3 flex items-center justify-center cursor-pointer transition-all hover:opacity-90"
          >
            <ChevronDown size={14} className={`transform transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
        {/* Dropdown panel */}
        {dropdownOpen && (
          <div className="absolute top-[calc(100%+6px)] right-0 left-0 p-3.5 z-50 border border-dashboard-accent/30 rounded-2xl bg-dashboard-sidebar/95 backdrop-blur-md shadow-xl flex justify-between items-center">
            <span className="text-[11px] text-white/90 font-semibold">Manage Public Visibility</span>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase ${categoryVisible ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                {categoryVisible ? "Pub" : "Draft"}
              </span>
              <SwitchButton
                isChecked={categoryVisible}
                onChange={handleVisibilityToggle}
                disabled={navigation.busy || !navigation.authority}
                variant="blue"
              />
            </div>
          </div>
        )}
      </div>

      {/* Loading state */}
      {error && <p role="alert">Movies could not be loaded. <button onClick={refetch}>Retry</button></p>}
      {(loading || !accountDocumentId) && lists.length === 0 ? (
        <div className="space-y-6">
          {/* Hero skeleton — Desktop */}
          <div className="hidden lg:block">
            <HeroSkeleton accentColor="yellow" variant="dashboard" showThumbnails />
          </div>
          {/* Hero skeleton — Mobile */}
          <div className="lg:hidden">
            <HeroSkeleton accentColor="yellow" variant="dashboard" mobile />
          </div>
          {/* List card skeletons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="relative bg-dashboard-muted rounded-2xl h-[168px] overflow-hidden border border-white/4 skeleton-card">
                <div className="absolute inset-0 skeleton-shimmer" />
                {/* Card header */}
                <div className="absolute top-5 left-5 right-5 flex justify-between">
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-36 rounded bg-white/8" />
                    <div className="h-3 w-48 rounded bg-white/5" />
                  </div>
                  <div className="h-6 w-20 rounded-full bg-white/8" />
                </div>
                {/* Preview covers */}
                <div className="absolute bottom-5 left-5 flex gap-1.5">
                  {[0,1,2,3,4].map(j => (
                    <div key={j} className="w-10 aspect-[2/3] rounded bg-white/8" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : lists.length === 0 ? (
        <div className="max-w-2xl mx-auto w-full py-10">
          <CategoryEmptyState
            category="movies"
            onAddClick={() => setShowCreateModal(true)}
          />
        </div>
      ) : (
        <>
          {/* Top Picks Section explicitly requested by user */}
          {topPicks.length > 0 ? (
            <div className="mb-8">
              <div className="hidden lg:block">
                <TopPicksHero 
                  movies={topPicks} 
                  onMovieClick={handleMovieClick} 
                  showManageButton={true}
                  onManageClick={() => setShowManageTopPicks(true)}
                />
              </div>
              <div className="block lg:hidden">
                <TopPicksMobileHero
                  movies={topPicks}
                  onMovieClick={handleMovieClick}
                  showManageButton={true}
                  onManageClick={() => setShowManageTopPicks(true)}
                />
              </div>
            </div>
          ) : (
            /* Empty Placeholder banner */
            allMovies.length > 0 && (
              <div
                onClick={() => setShowManageTopPicks(true)}
                className="w-full flex items-center justify-between p-4 rounded-[14px] border border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10 transition-all duration-300 cursor-pointer mb-6"
              >
                <div className="flex items-center gap-2 text-xs md:text-sm font-bold text-[#fbbf24] font-poppins">
                  <span className="text-amber-400">★</span> Manage Top Picks ({topPicks.length}/{deduplicateMovies(allMovies).length})
                </div>
                <div className="flex items-center text-amber-500">
                  <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            )
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {lists.map(list => (
            <MovieListCard
              key={list.documentId}
              list={list}
              onOpen={() => navigate(`/recommendations/movies/${list.documentId}`)}
              onToggleVisibility={handleToggleVisibility}
              togglingId={togglingId}
            />
          ))}
          {/* Add new list card */}
          <motion.button
            onClick={() => setShowCreateModal(true)}
            className="border-[2.2px] border-dashed border-dashboard-border rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-dashboard-muted hover:text-white hover:border-dashboard-accent hover:bg-dashboard-accent/5 transition-all duration-300 min-h-[160px]"
            whileHover={{ scale: 1.01 }}
          >
            <Plus size={24} />
            <span className="text-sm">Add new list</span>
          </motion.button>
        </div>
        </>
      )}

      {/* Create list modal */}
      {accountDocumentId && (
        <CreateMovieListModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          accountDocumentId={accountDocumentId}
          currentListCount={lists.length}
          onCreated={(newId?: string) => {
            refetch();
            // Open the newly created list's detail view and let it prompt to
            // publish this list (BUG-3). The prompt lives in MovieListView now.
            if (newId) {
              navigate(`/recommendations/movies/${newId}`, {
                state: { justCreatedList: true },
              });
            }
          }}
          username={user?.username || ""}
        />
      )}

      {showManageTopPicks && (
        <TopPicksManager
          movies={topPicks}
          allMovies={deduplicateMovies(allMovies)}
          onClose={() => setShowManageTopPicks(false)}
          onRefetch={() => refetch()}
          listId=""
        />
      )}

      {selectedMovie && (
        <MovieDetailModal
          open={!!selectedMovie}
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </div>
  );
};

export default MoviesHome;
