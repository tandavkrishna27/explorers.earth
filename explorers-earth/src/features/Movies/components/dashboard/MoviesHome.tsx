/* eslint-disable @typescript-eslint/no-explicit-any -- legacy owner-read shapes */
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCategoryNavigation } from "../../../navigation/CategoryNavigationProvider";
import { NavigationStatus } from "../../../navigation/NavigationStatus";
import { useMoviesOwner, invalidateMovies } from "../../api/explorersAdapter";
import { buildPosterUrl } from "../../utils/movieHelpers";
import useAuthStore from "../../../../store/store";
import CategoryPage from "../../../shared/category/CategoryPage";
import { toItemTopPicks, toListCards } from "../../../shared/category/models";
import { createLegacyListModal } from "../../../shared/lists/NewListDialog";

/** Kept for pages/Home.tsx and existing tests; renders the shared New list popup. */
export const CreateMovieListModal = createLegacyListModal("movies");

const relation = "recommended_movies";
const item = { relation, title: (m: Record<string, any>) => m.title ?? "", image: (m: Record<string, any>) => (m.poster_path ? buildPosterUrl(m.poster_path, "w342") : null), subtitle: () => null };

const MoviesHome = () => {
  const navigation = useCategoryNavigation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data, loading, error, refetch } = useMoviesOwner(undefined, true, undefined, true);
  useEffect(() => { if (!loading) (window as any).__dashboardLoaded = true; }, [loading]);
  const lists = useMemo(() => (data?.movieLists ?? []) as any[], [data]);
  const cards = useMemo(() => toListCards(lists, { relation, visibility: "Visibility", cover: (m) => (m.poster_path ? buildPosterUrl(m.poster_path, "w185") : null) }), [lists]);
  const picks = useMemo(() => toItemTopPicks(lists, item), [lists]);
  const candidates = useMemo(() => toItemTopPicks(lists, item, false), [lists]);
  const changed = () => { invalidateMovies(); refetch(); };
  return (
    <>
      <NavigationStatus navigation={navigation} />
      <CategoryPage
        category="movies"
        status={{ loading, error: (error as Error | null) ?? null, refreshing: loading && lists.length > 0 }}
        lists={cards} topPicks={picks} pinCandidates={candidates}
        categoryVisibility={navigation.snapshot?.visibility.public_movie === "Yes" ? "public" : "hidden"}
        visibilityBusy={navigation.busy || !navigation.authority}
        onCategoryVisibility={(next) => { if (navigation.authority && !navigation.busy) void navigation.request({ category: "public_movie", action: next === "public" ? "publish" : "unpublish" }, navigation.authority); }}
        onOpenList={(id) => navigate(`/recommendations/movies/${id}`)}
        onRetry={() => { void refetch(); }} onChanged={changed}
        newList={{ kind: "dialog", username: user?.username ?? "", onCreated: (id) => navigate(`/recommendations/movies/${id}`, { state: { justCreatedList: true } }) }}
      />
    </>
  );
};

export default MoviesHome;
