import { useMoviesOwner, changeMovieList, archiveMovieList, archiveMovie, toggleMoviePin, invalidateMovies } from "../../../Movies/api/explorersAdapter";
import { moviesCommandKey } from "../../../Movies/api/moviesClient";
import type { MoviesOwnerObserver } from "../../../Movies/api/moviesOwnerDiagnostic";
import { buildPosterUrl, deduplicateMovies, getGenreNames, extractNoteText } from "../../../Movies/utils/movieHelpers";
import { notePreviewText } from "../../../../utils/notePreviewText";
import type { RecommendedMovie } from "../../../Movies/types";
import { explorersApiClient } from "../../../../lib/explorersApiClient";
import { reorderListItems } from "../../../../lib/reorderListItems";
import { buildListPublicUrl } from "../../../../utils/listShareUrls";
import type { ListPageAdapter } from "../listPageAdapter";

const MAX_PINS = 15;

/**
 * The Movies list page's data and commands, moved out of MovieListView. `observer` lets the
 * wrapper keep the bounded owner-read diagnostic it has always recorded.
 */
export function useMoviesListAdapter(listId: string, observer?: MoviesOwnerObserver): ListPageAdapter {
  const { content, data, loading, error, refetch } = useMoviesOwner(listId, Boolean(listId), observer, true);
  const list = data?.movieLists?.[0];
  const movies = deduplicateMovies(list?.recommended_movies as RecommendedMovie[]);
  const categoryMovies = deduplicateMovies(content?.lists.flatMap((value) => value.recommended_movies) ?? movies);
  const pinnedCount = categoryMovies.filter((m) => m.is_pinned).length;

  return {
    category: "movies",
    categoryLabel: "Movies & Shows",
    itemNoun: "movie",
    loading,
    error: error ?? null,
    retry: () => { void refetch(); },
    list: list
      ? {
        id: list.documentId,
        title: list.List_Name,
        description: list.list_description ?? null,
        slug: list.slug,
        coverUrl: null,
        status: list.Visibility ? "public" : "draft",
        itemCount: movies.length,
        publicUrl: buildListPublicUrl(list.account?.username, "movies", list.slug),
      }
      : null,
    items: movies.map((movie) => ({
      id: movie.documentId,
      title: movie.title,
      subtitle: [movie.year, ...getGenreNames(movie.genres).slice(0, 2)].filter(Boolean).join(" · ") || undefined,
      note: notePreviewText(extractNoteText(movie.user_recommendation_note)) || undefined,
      imageUrl: buildPosterUrl(movie.poster_path, "w185"),
      rating: movie.tmdb_rating ?? null,
      pinned: Boolean(movie.is_pinned),
    })),
    addPath: `/recommendations/movies/${listId}/add`,
    editPath: (itemId) => `/recommendations/movies/${listId}/edit/${itemId}`,
    setStatus: async (status) => {
      if (status === "public" && movies.length === 0) throw new Error("Add at least one movie before publishing.");
      await changeMovieList(listId, { visibility: status === "public" });
    },
    reorder: async (orderedIds) => {
      await reorderListItems("movies", listId, orderedIds);
      refetch();
    },
    togglePin: async (itemId, pinned) => {
      const current = categoryMovies.find((m) => m.documentId === itemId);
      if (pinned && !current?.is_pinned && pinnedCount >= MAX_PINS) throw new Error("Max 15 pinned movies allowed.");
      await toggleMoviePin(itemId, pinned);
    },
    removeItem: async (itemId) => { await archiveMovie(itemId); },
    rename: async ({ title, description, slug }) => {
      await changeMovieList(listId, {
        ...(title === undefined ? {} : { title }),
        ...(description === undefined ? {} : { description }),
        ...(slug === undefined ? {} : { slug }),
      });
    },
    archive: async () => { await archiveMovieList(listId); },
    purge: async () => {
      const observed = await explorersApiClient.getMyEditableCollection(listId);
      await explorersApiClient.purgeMyCollection(observed, moviesCommandKey());
      invalidateMovies();
    },
  };
}
