import { useState, useEffect } from "react";
import { useParams, Link, useOutletContext, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { RecommendedMovie } from "../../types";
import { slugToGenreName, deduplicateMovies } from "../../utils/movieHelpers";
import MoviePosterCard from "./MoviePosterCard";
import MovieDetailModal from "./MovieDetailModal";
import MoviePosterSkeleton from "./MoviePosterSkeleton";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, PublicRouteErrorState, PublicRoutePartialNotice } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicMovieGenre } from "../../api/usePublicMovieGenre";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const PublicMovieGenre = () => {
  const { username, genreSlug } = useParams<{ username: string; genreSlug: string }>();
  const location = useLocation();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();
  const [selectedMovie, setSelectedMovie] = useState<RecommendedMovie | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const page=usePublicMovieGenre(username,genreSlug,{enabled:true});
  const {data:moviesData,loading,error:queryError,refetch}=page;
  const genreName=isNonNullObject(moviesData?.genre)&&typeof moviesData.genre.genre_name==='string'?moviesData.genre.genre_name:slugToGenreName(genreSlug??'');
  const filteredMovies=deduplicateMovies((Array.isArray(moviesData?.recommended_movies)?moviesData.recommended_movies.filter(isNonNullObject):[]) as unknown as RecommendedMovie[]);
  const hasUsableData=Array.isArray(moviesData?.recommended_movies);
  usePublicHeaderDescriptor(genreSlug?{navigationKey:location.key,title:genreName,url:window.location.href,analyticsContext:'movies-genre-header',analyticsMetadata:{genre:genreSlug}}:undefined);
  useEffect(()=>{if(!loading||hasUsableData)outletContext?.setIsPageLoaded?.(true);},[hasUsableData,loading,outletContext]);
  const handleRetry=()=>refetch();
  const handleMovieClick = (movie: RecommendedMovie) => {
    setSelectedMovie(movie);
    setModalOpen(true);
  };

  const pageTitle = `${genreName} Movies | ${username}'s Movie List | explorers`;
  const metaDescription = `Explore ${filteredMovies.length} ${genreName} movie${filteredMovies.length !== 1 ? "s" : ""} recommended by ${username} on explorers.`;
  const seoKeywords = [genreName, "movies", `${username} movies`, "explorers"];

  return (
    <>
      {!loading && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/movies/genre/${genreSlug}`)}
          type="website"
          author={username}
          siteName="explorers"
        />
      )}
      <div data-category-page className="min-h-screen bg-[var(--category-page,#0d1117)] text-[color:var(--category-text,#fff)]" aria-busy={loading || undefined}>
      {/* Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--category-page,rgba(23,37,84,0.4))] to-[var(--category-page,#0d1117)] pointer-events-none h-48" />

        <div className="relative max-w-5xl mx-auto px-4 pt-6 pb-4">
          <Link
            to={`/${username}/movies`}
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--category-muted,rgba(255,255,255,0.5))] hover:text-[color:var(--category-text,rgba(255,255,255,0.8))] transition-colors mb-6"
          >
            <ArrowLeft size={14} /> {username}'s Movies
          </Link>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4 relative">
            <div className="flex-1">
              <h1 className="text-xl md:text-2xl font-poppins font-bold text-[color:var(--category-text,#fff)] mb-1">{genreName}</h1>
              {!loading || hasUsableData ? (
                <p className="text-[color:var(--category-muted,#9ca3af)] font-poppins text-xs md:text-sm mt-1">
                  {filteredMovies.length} movie{filteredMovies.length !== 1 ? "s" : ""}
                </p>
              ) : (
                <div className="h-3 w-32 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded mt-2" />
              )}
            </div>
          </div>
        </div>
      </div>

      {Boolean(queryError) && hasUsableData && <PublicRoutePartialNotice message="Some movie data is unavailable." />}

      <div className="max-w-5xl mx-auto px-4 pt-6 pb-24 md:pb-6">
        {queryError && !hasUsableData ? (
          <PublicRouteErrorState title="Movie genre unavailable" error={queryError} onRetry={handleRetry} />
        ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {loading && !hasUsableData ? (
            <MoviePosterSkeleton count={12} />
          ) : filteredMovies.length === 0 ? (
            <p className="col-span-full text-[color:var(--category-muted,rgba(255,255,255,0.4))] text-sm py-8 text-center">
              No movies found in this genre.
            </p>
          ) : (
            filteredMovies.map(movie => (
              <MoviePosterCard
                key={movie.documentId}
                movie={movie}
                onClick={handleMovieClick}
                size="sm"
              />
            ))
          )}
        </div>
        )}
      </div>

      {hasUsableData && <PublicScrollContinuation label="Movies" hasMore={page.hasMore} loadingMore={page.loadingMore} loadMoreError={page.loadMoreError} loadMore={page.loadMore} />}

      <MovieDetailModal
        movie={selectedMovie}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedMovie(null); }}
      />
      </div>
    </>
  );
};

export default PublicMovieGenre;
