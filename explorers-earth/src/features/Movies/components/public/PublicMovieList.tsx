import { useState, useEffect } from "react";
import { useParams, Link, useOutletContext, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { MovieList, RecommendedMovie } from "../../types";
import { deduplicateMovies, buildPosterUrl } from "../../utils/movieHelpers";
import MoviePosterCard from "./MoviePosterCard";
import MovieDetailModal from "./MovieDetailModal";
import MoviePosterSkeleton from "./MoviePosterSkeleton";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, isPublicProfileNotFound, PublicRouteErrorState, PublicRoutePartialNotice } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileDetail } from "../../../PublicHome/api/usePublicProfileDetail";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const PublicMovieList = () => {
  const { username, listSlug } = useParams<{ username: string; listSlug: string }>();
  const location = useLocation();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();
  const [selectedMovie, setSelectedMovie] = useState<RecommendedMovie | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const page = usePublicProfileDetail(username, "movies", listSlug);
  const { data, loading, error, refetch } = page;

  const list = (Array.isArray(data?.movieLists) ? data.movieLists : []).find(
    (value: unknown): value is MovieList =>
      isNonNullObject(value) && Array.isArray(value.recommended_movies),
  );
  const hasUsableData = Boolean(list);

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const movies: RecommendedMovie[] = deduplicateMovies(list?.recommended_movies ?? []);

  const handleMovieClick = (movie: RecommendedMovie) => {
    setSelectedMovie(movie);
    setModalOpen(true);
  };

  usePublicHeaderDescriptor(list ? {
    navigationKey: location.key,
    title: list.List_Name,
    url: window.location.href,
    analyticsContext: "movies-list-header",
    analyticsMetadata: {
      listId: list.documentId,
      listName: list.List_Name,
    },
  } : undefined);

  const pageTitle = list ? `${list.List_Name} | ${username}'s Movie List | explorers` : `Movie List | explorers`;
  const metaDescription = list?.list_description 
    ? list.list_description 
    : list 
      ? `Explore the curated list "${list.List_Name}" containing ${movies.length}${page.hasMore ? "+" : ""} movies recommended by ${username} on explorers.`
      : "Explore movie recommendations on explorers.";

  const seoKeywords = list 
    ? [`${list.List_Name}`, `${username} movies`, `${list.slug}`, "movie list", "explorers"]
    : ["movie list", "explorers"];

  const listImage = list?.cover_image?.url || (movies[0]?.poster_path ? buildPosterUrl(movies[0].poster_path, "w500") : undefined);

  return (
    <>
      {!loading && list && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/movies/${listSlug}`)}
          image={listImage}
          type="website"
          author={username}
          siteName="explorers"
        />
      )}
      <div data-category-page className="min-h-screen bg-[var(--category-page,#0d1117)] text-[color:var(--category-text,#fff)]" aria-busy={loading || undefined}>
      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-2">
        <Link
          to={`/${username}/movies`}
          className="inline-flex items-center gap-1.5 text-sm text-[color:var(--category-muted,rgba(255,255,255,0.5))] hover:text-[color:var(--category-text,rgba(255,255,255,0.8))] transition-colors mb-6"
        >
          <ArrowLeft size={14} /> {username}'s Movies
        </Link>

        {Boolean(error) && hasUsableData && <PublicRoutePartialNotice message="Some movie data is unavailable." />}

        {loading && !hasUsableData ? (
          <>
            <div className="h-7 w-48 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded mb-2" />
            <div className="h-4 w-64 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded" />
          </>
        ) : error && !hasUsableData && !isPublicProfileNotFound(error) ? (
          <PublicRouteErrorState title="Movie list unavailable" error={error} onRetry={refetch} />
        ) : list ? (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-poppins font-bold text-[color:var(--category-text,#fff)] mb-1">{list.List_Name}</h1>
              {list.list_description && (
                <p className="text-[color:var(--category-muted,#9ca3af)] font-poppins text-xs md:text-sm mt-1 max-w-xl">{list.list_description}</p>
              )}
              <p className="text-[color:var(--category-muted,#9ca3af)] font-poppins text-xs md:text-sm mt-2">{movies.length}{page.hasMore ? "+" : ""} movie{movies.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
        ) : (
          <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))]">List not found or not published.</p>
        )}
      </div>

      {/* Grid */}
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-24 md:pb-6">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {loading && !hasUsableData ? (
            <MoviePosterSkeleton count={12} />
          ) : (
            movies.map(movie => (
              <MoviePosterCard
                key={movie.documentId}
                movie={movie}
                onClick={handleMovieClick}
                size="sm"
              />
            ))
          )}
        </div>
        <PublicScrollContinuation {...page} label="movies" className="mt-6" />
      </div>

      {/* Movie detail modal */}
      <MovieDetailModal
        movie={selectedMovie}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedMovie(null); }}
      />
      </div>
    </>
  );
};

export default PublicMovieList;
